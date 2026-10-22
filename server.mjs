import { createServer } from "node:http";
import { readFile, mkdir, rename, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const dataDir = process.env.SASKAITAGO_DATA_DIR || path.join(root, "data");
const dataFile = path.join(dataDir, "workspace.json");
const seriesByType = { proforma: "IS", vat: "CC", credit: "KR" };
let writeQueue = Promise.resolve();
let apiQueue = Promise.resolve();

const initialData = () => ({
  settings: { company: "", companyCode: "", vatCode: "", address: "", email: "", phone: "", iban: "", bank: "", logo: "", series: "SG" },
  counters: {},
  clients: [],
  invoices: [],
});

async function loadData() {
  await mkdir(dataDir, { recursive: true });
  try {
    return { ...initialData(), ...JSON.parse(await readFile(dataFile, "utf8")) };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const data = initialData();
    await saveData(data);
    return data;
  }
}

async function saveData(data) {
  writeQueue = writeQueue.then(async () => {
    await mkdir(dataDir, { recursive: true });
    const temp = `${dataFile}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
    await rename(temp, dataFile);
  });
  return writeQueue;
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(Object.assign(new Error("Request is too large"), { status: 413 }));
    });
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); } catch { reject(Object.assign(new Error("Invalid JSON"), { status: 400 })); }
    });
    req.on("error", reject);
  });
}

function roundMoney(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function text(value, max = 300) { return String(value ?? "").trim().slice(0, max); }
function amount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) throw Object.assign(new Error("Neteisinga suma"), { status: 400 });
  return n;
}

async function handleApi(req, res, url) {
  const data = await loadData();
  if (req.method === "GET" && url.pathname === "/api/workspace") {
    return json(res, 200, { settings: data.settings, clients: data.clients, invoices: data.invoices });
  }
  if (req.method === "PUT" && url.pathname === "/api/settings") {
    const input = await readBody(req);
    data.settings = {
      company: text(input.company, 180), companyCode: text(input.companyCode, 40), vatCode: text(input.vatCode, 40),
      address: text(input.address, 240), email: text(input.email, 180), phone: text(input.phone, 60),
      iban: text(input.iban, 60), bank: text(input.bank, 120), logo: text(input.logo, 200_000),
      series: text(input.series, 12).toUpperCase().replace(/[^A-Z0-9]/g, "") || "SG",
    };
    await saveData(data);
    return json(res, 200, { settings: data.settings });
  }
  if (req.method === "POST" && url.pathname === "/api/clients") {
    const input = await readBody(req);
    const name = text(input.name, 180);
    if (!name) throw Object.assign(new Error("Įveskite kliento pavadinimą"), { status: 400 });
    const client = {
      id: randomUUID(), name, companyCode: text(input.companyCode, 40), vatCode: text(input.vatCode, 40),
      address: text(input.address, 240), email: text(input.email, 180), phone: text(input.phone, 60), createdAt: new Date().toISOString(),
    };
    data.clients.push(client);
    await saveData(data);
    return json(res, 201, { client });
  }
  if (req.method === "POST" && url.pathname === "/api/invoices") {
    const input = await readBody(req);
    const type = ["proforma", "vat", "credit"].includes(input.type) ? input.type : "vat";
    const issueDate = /^\d{4}-\d{2}-\d{2}$/.test(input.issueDate || "") ? input.issueDate : new Date().toISOString().slice(0, 10);
    const items = Array.isArray(input.items) ? input.items.slice(0, 100).map((item) => {
      const description = text(item.description, 300);
      if (!description) throw Object.assign(new Error("Kiekvienai eilutei reikia aprašymo"), { status: 400 });
      const quantity = amount(item.quantity ?? 1);
      const unitPrice = amount(item.unitPrice ?? 0);
      const vatRate = amount(item.vatRate ?? 21);
      if (vatRate > 100) throw Object.assign(new Error("Neteisingas PVM tarifas"), { status: 400 });
      return { description, quantity, unitPrice, vatRate, lineTotal: roundMoney(quantity * unitPrice) };
    }) : [];
    if (!items.length) throw Object.assign(new Error("Pridėkite bent vieną prekę arba paslaugą"), { status: 400 });
    if (type === "credit" && !input.relatedInvoiceId) throw Object.assign(new Error("Kreditinei sąskaitai pasirinkite kredituojamą sąskaitą"), { status: 400 });
    const related = data.invoices.find((invoice) => invoice.id === input.relatedInvoiceId);
    if (type === "credit" && (!related || related.type !== "vat")) throw Object.assign(new Error("Pasirinkta sąskaita nerasta arba jos negalima kredituoti"), { status: 400 });
    const sign = type === "credit" ? -1 : 1;
    const signedItems = items.map((item) => ({ ...item, unitPrice: sign * item.unitPrice, lineTotal: sign * item.lineTotal }));
    const subtotal = roundMoney(signedItems.reduce((sum, item) => sum + item.lineTotal, 0));
    const vatAmount = roundMoney(signedItems.reduce((sum, item) => sum + item.lineTotal * item.vatRate / 100, 0));
    const total = roundMoney(subtotal + vatAmount);
    const advanceApplied = type === "vat" ? roundMoney(amount(input.advanceApplied || 0)) : 0;
    if (advanceApplied > total) throw Object.assign(new Error("Avansas negali būti didesnis už sąskaitos sumą"), { status: 400 });
    const series = type === "vat" ? data.settings.series || "SG" : seriesByType[type];
    const counterKey = `${series}-${issueDate.slice(0, 4)}`;
    data.counters[counterKey] = (data.counters[counterKey] || 0) + 1;
    const number = `${series}-${issueDate.slice(0, 4)}-${String(data.counters[counterKey]).padStart(4, "0")}`;
    const clientInput = input.client || {};
    const client = {
      id: text(clientInput.id, 80) || randomUUID(), name: text(clientInput.name, 180),
      companyCode: text(clientInput.companyCode, 40), vatCode: text(clientInput.vatCode, 40),
      address: text(clientInput.address, 240), email: text(clientInput.email, 180), phone: text(clientInput.phone, 60),
    };
    if (!client.name) throw Object.assign(new Error("Įveskite kliento pavadinimą"), { status: 400 });
    if (!data.clients.some((saved) => saved.id === client.id)) data.clients.push({ ...client, createdAt: new Date().toISOString() });
    const invoice = {
      id: randomUUID(), number, type, issueDate, dueDate: /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate || "") ? input.dueDate : "",
      status: "issued", client, items: signedItems, subtotal, vatAmount, total, notes: text(input.notes, 2000),
      relatedInvoiceId: related?.id || "", relatedInvoiceNumber: related?.number || "", advanceApplied,
      createdAt: new Date().toISOString(), paidAt: "",
    };
    data.invoices.unshift(invoice);
    await saveData(data);
    return json(res, 201, { invoice });
  }
  const statusMatch = url.pathname.match(/^\/api\/invoices\/([\w-]+)\/status$/);
  if (req.method === "PATCH" && statusMatch) {
    const invoice = data.invoices.find((item) => item.id === statusMatch[1]);
    if (!invoice) return json(res, 404, { error: "Sąskaita nerasta" });
    const input = await readBody(req);
    if (!["issued", "paid", "cancelled"].includes(input.status)) throw Object.assign(new Error("Neteisingas statusas"), { status: 400 });
    invoice.status = input.status;
    invoice.paidAt = input.status === "paid" ? new Date().toISOString().slice(0, 10) : "";
    await saveData(data);
    return json(res, 200, { invoice });
  }
  return json(res, 404, { error: "Nerasta" });
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function money(value) { return `${Number(value).toLocaleString("lt-LT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`; }
function date(value) { return value ? new Date(`${value}T00:00:00`).toLocaleDateString("lt-LT") : "—"; }

async function printInvoice(res, id) {
  const data = await loadData();
  const invoice = data.invoices.find((item) => item.id === id);
  if (!invoice) { res.writeHead(404); return res.end("Sąskaita nerasta"); }
  const seller = data.settings;
  const title = invoice.type === "proforma" ? "IŠANKSTINĖ SĄSKAITA" : invoice.type === "credit" ? "KREDITINĖ SĄSKAITA" : invoice.vatAmount ? "PVM SĄSKAITA FAKTŪRA" : "SĄSKAITA FAKTŪRA";
  const rows = (party) => [party.companyCode && ["Įmonės kodas", party.companyCode], party.vatCode && ["PVM kodas", party.vatCode], party.address && ["Adresas", party.address], party.phone && ["Tel.", party.phone], party.email && ["El. paštas", party.email]].filter(Boolean).map(([key, value]) => `<div class="detail"><span>${escapeHtml(key)}</span><b>${escapeHtml(value)}</b></div>`).join("");
  const amountDue = roundMoney(invoice.total - (invoice.advanceApplied || 0));
  const items = invoice.items.map((item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(item.description)}</td><td class="num">${item.quantity}</td><td class="num">${money(item.unitPrice)}</td><td class="num">${item.vatRate}%</td><td class="num">${money(item.lineTotal + item.lineTotal * item.vatRate / 100)}</td></tr>`).join("");
  const logo = seller.logo ? `<img class="logo" src="${escapeHtml(seller.logo)}" alt="">` : "";
  const html = `<!doctype html><html lang="lt"><meta charset="utf-8"><title>${escapeHtml(invoice.number)} · SaskaitaGo</title><style>
    @page{size:A4;margin:17mm}*{box-sizing:border-box}body{font:12px/1.5 Arial,sans-serif;color:#17191d;margin:0}.top{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #17191d;padding-bottom:14px}.brand{display:flex;align-items:center;gap:12px;font-weight:700;font-size:17px;letter-spacing:.04em}.logo{max-width:120px;max-height:48px;object-fit:contain}.title{display:flex;justify-content:space-between;align-items:end;margin:32px 0 26px}.title h1{font-size:25px;line-height:1.2;margin:0 0 7px}.num{font-size:14px;font-weight:700}.muted{color:#777;font-size:10px}.parties{display:grid;grid-template-columns:1fr 1fr;gap:35px}.party h2{font-size:9px;letter-spacing:.12em;color:#747880;margin:0 0 8px}.party .name{font-size:15px;font-weight:700;margin-bottom:7px}.detail{display:flex;gap:12px;margin:3px 0;font-size:10px}.detail span{color:#777;min-width:85px}.detail b{font-weight:400}.relation{margin-top:8px;color:#555}.items{width:100%;border-collapse:collapse;margin-top:34px}.items th{text-align:left;border-bottom:1px solid #222;padding:8px 5px;font-size:9px;color:#686b72}.items td{padding:11px 5px;border-bottom:1px solid #e7e8eb;vertical-align:top}.num{text-align:right;white-space:nowrap}.totals{width:280px;margin:18px 0 0 auto}.total{display:flex;justify-content:space-between;padding:5px 0}.grand{border-top:2px solid #222;margin-top:8px;padding-top:10px;font-size:19px;font-weight:700}.bank{margin-top:35px;border-top:1px solid #ddd;padding-top:14px}.bank h2{font-size:9px;letter-spacing:.1em;color:#777}.notes{margin-top:25px;white-space:pre-wrap;color:#555}.footer{position:fixed;bottom:-8mm;left:0;right:0;border-top:1px solid #ddd;padding-top:7px;color:#777;font-size:9px;display:flex;justify-content:space-between}@media print{.toolbar{display:none}}.toolbar{font:14px Arial;background:#f0f2f5;padding:12px 20px;text-align:right;position:sticky;top:0}.toolbar button{border:0;border-radius:6px;padding:9px 14px;background:#1649e8;color:white;font-weight:700;cursor:pointer}
  </style><div class="toolbar"><button onclick="window.print()">Išsaugoti kaip PDF / Spausdinti</button></div><main><header class="top"><div class="brand">${logo}${escapeHtml(seller.company || "SaskaitaGo")}</div><div class="muted">Dokumentas sugeneruotas su SaskaitaGo</div></header><section class="title"><div><h1>${title}</h1><div class="num">Nr. ${escapeHtml(invoice.number)}</div>${invoice.relatedInvoiceNumber ? `<div class="relation">${invoice.type === "credit" ? "Kredituojama sąskaita" : "Pagal išankstinę sąskaitą"} Nr. ${escapeHtml(invoice.relatedInvoiceNumber)}</div>` : ""}</div><div><div><span class="muted">Išrašymo data</span><br><b>${date(invoice.issueDate)}</b></div><div style="margin-top:8px"><span class="muted">Apmokėti iki</span><br><b>${date(invoice.dueDate)}</b></div></div></section><section class="parties"><div class="party"><h2>PARDAVĖJAS</h2><div class="name">${escapeHtml(seller.company || "Nustatykite pardavėją")}</div>${rows(seller)}${seller.iban ? `<div class="detail"><span>IBAN</span><b>${escapeHtml(seller.iban)}</b></div>` : ""}${seller.bank ? `<div class="detail"><span>Bankas</span><b>${escapeHtml(seller.bank)}</b></div>` : ""}</div><div class="party"><h2>PIRKĖJAS</h2><div class="name">${escapeHtml(invoice.client.name)}</div>${rows(invoice.client)}</div></section><table class="items"><thead><tr><th>#</th><th>Prekė / paslauga</th><th class="num">Kiekis</th><th class="num">Kaina</th><th class="num">PVM</th><th class="num">Suma</th></tr></thead><tbody>${items}</tbody></table><section class="totals"><div class="total"><span>Suma be PVM</span><b>${money(invoice.subtotal)}</b></div><div class="total"><span>PVM</span><b>${money(invoice.vatAmount)}</b></div>${invoice.advanceApplied ? `<div class="total"><span>Viso</span><b>${money(invoice.total)}</b></div><div class="total"><span>Įskaitytas avansas${invoice.relatedInvoiceNumber ? ` (${escapeHtml(invoice.relatedInvoiceNumber)})` : ""}</span><b>− ${money(invoice.advanceApplied)}</b></div>` : ""}<div class="total grand"><span>${invoice.type === "credit" ? "Kredituojama suma" : invoice.advanceApplied ? "Liko sumokėti" : "Iš viso"}</span><span>${money(amountDue)}</span></div></section>${invoice.notes ? `<div class="notes">${escapeHtml(invoice.notes)}</div>` : ""}<section class="bank"><h2>APMOKĖJIMO INFORMACIJA</h2>${seller.iban ? `<b>${escapeHtml(seller.iban)}</b>` : "IBAN nenurodytas"}${seller.bank ? ` · ${escapeHtml(seller.bank)}` : ""}</section><footer class="footer"><span>${escapeHtml(seller.company || "SaskaitaGo")}${seller.companyCode ? ` · Įm. kodas ${escapeHtml(seller.companyCode)}` : ""}</span><span>${escapeHtml(seller.email)}</span></footer></main></html>`;
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(html);
}

const server = createServer(async (req, res) => {
  try {
    const rawHost = req.headers.host || "";
    const requestHost = rawHost.startsWith("[") ? rawHost.slice(1, rawHost.indexOf("]")) : rawHost.split(":")[0];
    if (!new Set(["127.0.0.1", "localhost", "::1"]).has(requestHost)) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      return res.end("SaskaitaGo priima tik vietinius ryšius.");
    }
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      const task = apiQueue.then(() => handleApi(req, res, url)).catch((error) => {
        json(res, error.status || 500, { error: error.message || "Serverio klaida" });
      });
      apiQueue = task.then(() => undefined, () => undefined);
      return;
    }
    const printMatch = url.pathname.match(/^\/invoice\/([\w-]+)$/);
    if (req.method === "GET" && printMatch) return await printInvoice(res, printMatch[1]);
    const staticFiles = { "/": "index.html", "/app.js": "app.js", "/styles.css": "styles.css", "/responsive.css": "responsive.css" };
    if (req.method === "GET" && staticFiles[url.pathname]) {
      const file = path.join(root, "public", staticFiles[url.pathname]);
      const contentType = file.endsWith(".css") ? "text/css; charset=utf-8" : file.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8";
      res.writeHead(200, { "content-type": contentType, "cache-control": "no-cache" });
      return createReadStream(file).pipe(res);
    }
    res.writeHead(404); res.end("Nerasta");
  } catch (error) {
    json(res, error.status || 500, { error: error.message || "Serverio klaida" });
  }
});

server.listen(port, host, () => {
  console.log(`SaskaitaGo veikia: http://${host}:${port}`);
  console.log(`Duomenys saugomi: ${dataDir}`);
});
