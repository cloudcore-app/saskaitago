import { createServer } from "node:http";
import { readFile, mkdir, rename, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const defaultPort = Number(process.env.PORT || 4173);
const defaultHost = process.env.HOST || "127.0.0.1";
let dataDir = process.env.SaskaitaGO_DATA_DIR || path.join(root, "data");
let dataFile = path.join(dataDir, "workspace.json");
const seriesByType = { proforma: "IS", vat: "CC", credit: "KR" };
let writeQueue = Promise.resolve();
let apiQueue = Promise.resolve();

const initialData = () => ({
  settings: { country: "LT", businessType: "", personalCode: "", activityNumber: "", representativeName: "", vatStatus: "none", onboardingCompleted: false, company: "", companyCode: "", vatCode: "", address: "", email: "", phone: "", paymentRecipient: "", iban: "", bank: "", swift: "", logo: "", outputDirectory: "", series: "SG", paymentTermDays: 14, uiLanguage: "lt", uiTheme: "light" },
  counters: {},
  clients: [],
  invoices: [],
});

async function loadData() {
  await mkdir(dataDir, { recursive: true });
  try {
    const defaults = initialData();
    const saved = JSON.parse(await readFile(dataFile, "utf8"));
    return { ...defaults, ...saved, settings: { ...defaults.settings, ...(saved.settings || {}) } };
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
    const chosenBusiness = ["individual", "mb", "uab"].includes(input.businessType) ? input.businessType : data.settings.businessType;
    const chosenVatStatus = ["none", "standard", "svs"].includes(input.vatStatus) ? input.vatStatus : data.settings.vatStatus || "none";
    if (input.onboardingCompleted) {
      if (!chosenBusiness) throw Object.assign(new Error("Pasirinkite veiklos formą"), { status: 400 });
      if (chosenBusiness === "individual" && (!text(input.company, 180) || !text(input.activityNumber, 40) || !text(input.address, 240))) throw Object.assign(new Error("Įveskite vardą, pavardę, veiklos pažymos numerį ir adresą"), { status: 400 });
      if (["mb", "uab"].includes(chosenBusiness) && (!text(input.company, 180) || !text(input.companyCode, 40) || !text(input.representativeName, 180) || !text(input.address, 240))) throw Object.assign(new Error("Įveskite įmonės pavadinimą, kodą, atstovo vardą, pavardę ir adresą"), { status: 400 });
      if (chosenVatStatus !== "none" && !text(input.vatCode, 40)) throw Object.assign(new Error("Įveskite PVM mokėtojo kodą"), { status: 400 });
    }
    data.settings = {
      country: "LT", businessType: ["individual", "mb", "uab"].includes(input.businessType) ? input.businessType : data.settings.businessType || "",
      personalCode: text(input.personalCode ?? data.settings.personalCode, 32), activityNumber: text(input.activityNumber ?? data.settings.activityNumber, 40),
      representativeName: chosenBusiness === "individual" ? "" : text(input.representativeName ?? data.settings.representativeName, 180),
      vatStatus: ["none", "standard", "svs"].includes(input.vatStatus) ? input.vatStatus : data.settings.vatStatus || "none",
      onboardingCompleted: input.onboardingCompleted === undefined ? Boolean(data.settings.onboardingCompleted) : Boolean(input.onboardingCompleted),
      company: text(input.company, 180), companyCode: text(input.companyCode, 40), vatCode: text(input.vatCode, 40),
      address: text(input.address, 240), email: text(input.email, 180), phone: text(input.phone, 60),
      paymentRecipient: text(input.paymentRecipient ?? data.settings.paymentRecipient ?? "", 180),
      iban: text(input.iban ?? data.settings.iban ?? "", 60),
      bank: text(input.bank ?? data.settings.bank ?? "", 120), swift: text(input.swift ?? data.settings.swift ?? "", 20), logo: text(input.logo, 200_000),
      outputDirectory: text(input.outputDirectory ?? data.settings.outputDirectory, 2000),
      series: text(input.series, 12).toUpperCase().replace(/[^A-Z0-9]/g, "") || "SG",
      paymentTermDays: Number.isInteger(Number(input.paymentTermDays)) && Number(input.paymentTermDays) >= 1 && Number(input.paymentTermDays) <= 365 ? Number(input.paymentTermDays) : Number(data.settings.paymentTermDays) || 14,
      uiLanguage: ["lt", "en"].includes(input.uiLanguage) ? input.uiLanguage : data.settings.uiLanguage || "lt",
      uiTheme: ["light", "dark"].includes(input.uiTheme) ? input.uiTheme : data.settings.uiTheme || "light",
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
  const clientMatch = url.pathname.match(/^\/api\/clients\/([^/]+)$/);
  if (clientMatch && req.method === "PUT") {
    const client = data.clients.find((item) => item.id === decodeURIComponent(clientMatch[1]));
    if (!client) return json(res, 404, { error: "Klientas nerastas" });
    const input = await readBody(req);
    const name = text(input.name, 180);
    if (!name) throw Object.assign(new Error("Įveskite kliento pavadinimą"), { status: 400 });
    Object.assign(client, { name, companyCode: text(input.companyCode, 40), vatCode: text(input.vatCode, 40), address: text(input.address, 240), email: text(input.email, 180), phone: text(input.phone, 60) });
    await saveData(data);
    return json(res, 200, { client });
  }
  if (clientMatch && req.method === "DELETE") {
    const index = data.clients.findIndex((item) => item.id === decodeURIComponent(clientMatch[1]));
    if (index < 0) return json(res, 404, { error: "Klientas nerastas" });
    data.clients.splice(index, 1);
    await saveData(data);
    return json(res, 200, { success: true });
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
  const title = invoice.type === "proforma" ? "Išankstinė sąskaita" : invoice.type === "credit" ? "Kreditinė sąskaita" : (["standard", "svs"].includes(seller.vatStatus) || Boolean(seller.vatCode)) ? "PVM sąskaita faktūra" : "Sąskaita faktūra";
  const rows = (party) => [party.companyCode && ["Įmonės kodas", party.companyCode], party.activityNumber && ["Individualios veiklos pažymos Nr.", party.activityNumber], party.representativeName && ["Atstovas", party.representativeName], party.personalCode && ["Asmens kodas", party.personalCode], party.vatCode && ["PVM kodas", party.vatCode], party.address && ["Adresas", party.address], party.phone && ["Telefonas", party.phone], party.email && ["El. paštas", party.email]].filter(Boolean).map(([key, value]) => `<div class="detail"><span>${escapeHtml(key)}</span><b>${escapeHtml(value)}</b></div>`).join("");
  const amountDue = roundMoney(invoice.total - (invoice.advanceApplied || 0));
  const items = invoice.items.map((item, index) => `<tr><td class="index">${String(index + 1).padStart(2, "0")}</td><td><strong>${escapeHtml(item.description)}</strong></td><td class="align-right">${item.quantity}</td><td class="align-right">${money(item.unitPrice)}</td><td class="align-right">${item.vatRate}%</td><td class="align-right strong">${money(item.lineTotal + item.lineTotal * item.vatRate / 100)}</td></tr>`).join("");
  const logo = seller.logo ? `<img class="logo" src="${escapeHtml(seller.logo)}" alt="">` : `<img class="logo app-document-icon" src="/saskaitago-icon.svg" alt="SaskaitaGO">`;
  const html = `<!doctype html><html lang="lt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(invoice.number)} · SaskaitaGO</title><style>
    :root{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#202534;font-synthesis:none;text-rendering:optimizeLegibility}*{box-sizing:border-box}html{background:#eef0f4}body{margin:0;padding:52px 20px 40px}.toolbar{position:fixed;z-index:2;top:0;left:0;right:0;height:52px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;background:#fff;border-bottom:1px solid #e5e7ec;color:#656c7a;font-size:12px}.toolbar span{font-weight:700;letter-spacing:.02em}.toolbar button{border:0;border-radius:7px;padding:9px 14px;background:#2449dc;color:white;font-weight:700;font-size:12px;cursor:pointer}.toolbar button:hover{background:#193bbf}.sheet{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:18mm 19mm 16mm;box-shadow:0 12px 50px #1c28411c;position:relative}.topline{height:5px;position:absolute;top:0;left:0;right:0;background:#2449dc}.masthead{display:flex;align-items:center;justify-content:space-between;padding-bottom:24px;border-bottom:1px solid #e8eaf0}.seller-brand{display:flex;align-items:center;gap:13px;min-width:0;flex:1;font-size:17px;font-weight:750;letter-spacing:-.4px;white-space:nowrap}.seller-brand span{white-space:nowrap}.logo{display:block;flex:none;max-width:120px;max-height:50px;object-fit:contain}.logo-mark{width:38px;height:38px;display:grid;place-items:center;background:#2449dc;color:white;border-radius:11px;font-size:19px;font-weight:800}.brand-caption{text-align:right;flex:none;color:#9499a5;font-size:9px;letter-spacing:.13em;text-transform:uppercase}.title-row{display:flex;justify-content:space-between;align-items:flex-end;padding:28px 0 26px}.title-row h1{font-size:26px;letter-spacing:-.9px;line-height:1.15;margin:0 0 9px;text-transform:uppercase}.invoice-number{color:#6d7380;font-size:11px}.invoice-number b{color:#202534;font-size:14px;letter-spacing:.03em}.date-box{display:flex;gap:18px;text-align:left;font-size:10px;color:#828896;line-height:1.7}.date-entry{display:flex;flex-direction:column;gap:2px;white-space:nowrap}.date-box strong{font-size:12px;color:#202534}.parties{display:grid;grid-template-columns:1fr 1fr;gap:28px;padding:18px 20px;background:#f7f8fb;border:1px solid #edf0f4;border-radius:8px}.party-label{margin:0 0 10px;color:#858b98;font-size:8px;font-weight:750;letter-spacing:.14em;text-transform:uppercase}.party-name{font-size:13px;font-weight:750;line-height:1.4;margin-bottom:7px;overflow-wrap:anywhere}.detail{display:flex;gap:12px;margin:4px 0;font-size:9px;line-height:1.4}.detail span{color:#898f9b;min-width:94px}.detail b{font-weight:500;color:#444b58;overflow-wrap:anywhere}.relation{margin-top:7px;color:#646b78;font-size:9px}.items{width:100%;border-collapse:separate;border-spacing:0;margin-top:30px;border:1px solid #e8eaf0;border-radius:9px;overflow:hidden}.items thead{background:#f4f5f8}.items th{padding:10px 8px;color:#767d8a;text-align:left;font-size:8px;font-weight:750;letter-spacing:.07em;text-transform:uppercase}.items th:first-child{border-top-left-radius:8px}.items th:last-child{border-top-right-radius:8px}.items td{padding:13px 8px;border-bottom:1px solid #eceef2;font-size:10px;line-height:1.45;vertical-align:top}.items tbody tr:last-child td{border-bottom:0}.items td strong{font-weight:600}.items .index{color:#9ba0aa;width:32px}.align-right{text-align:right;white-space:nowrap}.items th.align-right{text-align:right}.items .strong{font-weight:700}.lower{display:flex;justify-content:space-between;gap:25px;margin-top:24px}.payment{flex:1;align-self:flex-end;padding-bottom:4px}.payment h2,.notes h2{margin:0 0 8px;color:#656c7a;font-size:10px;letter-spacing:.08em;text-transform:uppercase}.payment p{margin:4px 0;color:#3f4654;font-size:11px;line-height:1.55}.payment .muted{color:#9297a2}.totals{width:235px;flex:none}.total-row{display:flex;justify-content:space-between;gap:15px;padding:6px 0;color:#727886;font-size:10px}.total-row b{color:#303644;font-weight:600;white-space:nowrap}.grand{margin-top:8px;padding:13px 14px;border-radius:7px;background:#f0f3ff;color:#273a96;font-size:11px;font-weight:700}.grand span{white-space:nowrap}.grand b{color:#2449dc;font-size:16px}.notes{margin-top:25px;padding-top:14px;border-top:1px solid #eceef2}.notes div{font-size:9px;color:#5e6470;line-height:1.6;white-space:pre-wrap}.footer{position:absolute;left:19mm;right:19mm;bottom:10mm;display:flex;justify-content:space-between;gap:15px;padding-top:8px;border-top:1px solid #e8eaf0;color:#959aa5;font-size:8px}.footer span{overflow-wrap:anywhere}@page{size:A4;margin:0}@media print{html{background:#fff}body{padding:0}.toolbar{display:none}.sheet{width:210mm;min-height:297mm;margin:0;padding-bottom:36mm;box-shadow:none;page-break-after:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}.items thead{display:table-header-group}.items tr{break-inside:avoid}.footer{position:fixed;bottom:10mm}}@media(max-width:800px){body{padding:58px 8px 20px}.sheet{width:100%;min-height:auto;padding:24px 20px 75px}.footer{left:20px;right:20px;bottom:20px}.parties{gap:15px;padding:14px}.detail{display:block}.detail span{display:block}.lower{gap:12px}.payment{min-width:0;overflow-wrap:anywhere}.totals{width:205px;flex:0 0 205px}.grand{gap:8px;padding:13px 10px;font-size:10px}.seller-brand{font-size:14px;gap:8px}.brand-caption{font-size:8px}.date-box{gap:10px}}
    .powered-by-invoice{color:#858b98;text-decoration:none;font-size:7px;letter-spacing:.06em;white-space:nowrap}.powered-by-invoice:hover{color:#2449dc}.invoice-actions{display:flex;align-items:center;gap:8px}.invoice-actions #saveStatus{font-size:10px;color:#626b7b}.invoice-actions button:disabled{opacity:.65;cursor:wait}</style></head><body><div class="toolbar"><span>SaskaitaGO · PERŽIŪRA</span><div class="invoice-actions"><span id="saveStatus" role="status"></span><button class="save-pdf-button" onclick="saveInvoicePdf()">Išsaugoti PDF</button><button onclick="window.print()">Spausdinti</button></div></div><main class="sheet"><header class="masthead"><div class="seller-brand">${logo}<span>${escapeHtml(seller.company || "SaskaitaGO")}</span></div></header><section class="title-row"><div><h1>${title}</h1><div class="invoice-number">Sąskaitos Nr. <b>${escapeHtml(invoice.number)}</b></div>${invoice.relatedInvoiceNumber ? `<div class="relation">${invoice.type === "credit" ? "Kredituojama sąskaita" : "Pagal išankstinę sąskaitą"} Nr. ${escapeHtml(invoice.relatedInvoiceNumber)}</div>` : ""}</div><div class="date-box"><div class="date-entry">Išrašymo data<strong>${date(invoice.issueDate)}</strong></div>${invoice.dueDate ? `<div class="date-entry">Apmokėti iki<strong>${date(invoice.dueDate)}</strong></div>` : ""}</div></section><section class="parties"><div><h2 class="party-label">Pardavėjas</h2><div class="party-name">${escapeHtml(seller.company || "")}</div>${rows(seller)}</div><div><h2 class="party-label">Pirkėjas</h2><div class="party-name">${escapeHtml(invoice.client.name)}</div>${rows(invoice.client)}</div></section><table class="items"><thead><tr><th>#</th><th>Prekė arba paslauga</th><th class="align-right">Kiekis</th><th class="align-right">Kaina</th><th class="align-right">PVM</th><th class="align-right">Suma</th></tr></thead><tbody>${items}</tbody></table><section class="lower"><div class="payment"><h2>BANKO REKVIZITAI</h2>${seller.paymentRecipient ? `<p><b>Gavėjas:</b> ${escapeHtml(seller.paymentRecipient)}</p>` : ""}${seller.bank ? `<p><b>Bankas:</b> ${escapeHtml(seller.bank)}</p>` : ""}${seller.iban ? `<p><b>IBAN:</b> ${escapeHtml(seller.iban)}</p>` : ""}${seller.swift ? `<p><b>SWIFT / BIC:</b> ${escapeHtml(seller.swift)}</p>` : ""}<p><b>Mokėjimo paskirtis:</b> SF Nr. ${escapeHtml(invoice.number)}</p></div><div class="totals"><div class="total-row"><span>Suma be PVM</span><b>${money(invoice.subtotal)}</b></div><div class="total-row"><span>PVM</span><b>${money(invoice.vatAmount)}</b></div>${invoice.advanceApplied ? `<div class="total-row"><span>Iš viso</span><b>${money(invoice.total)}</b></div><div class="total-row"><span>Įskaitytas avansas</span><b>− ${money(invoice.advanceApplied)}</b></div>` : ""}<div class="total-row grand"><span>${invoice.type === "credit" ? "Kredituojama suma" : invoice.advanceApplied ? "Liko sumokėti" : "Iš viso mokėti"}</span><b>${money(amountDue)}</b></div></div></section>${invoice.notes ? `<section class="notes"><h2>Papildoma informacija</h2><div>${escapeHtml(invoice.notes)}</div></section>` : ""}<footer class="footer"><span>${escapeHtml(seller.company || "SaskaitaGO")}${seller.companyCode ? ` · Įm. kodas ${escapeHtml(seller.companyCode)}` : seller.activityNumber ? ` · Veiklos pažymos Nr. ${escapeHtml(seller.activityNumber)}` : ""}</span><span>${escapeHtml(invoice.number)} · ${escapeHtml(seller.email || "")}</span><a class="powered-by-invoice" href="https://cloudcore.lt" target="_blank" rel="noopener noreferrer">POWERED BY CLOUDCORE.LT ↗</a></footer></main><script>async function saveInvoicePdf(){const button=document.querySelector(".save-pdf-button"),status=document.querySelector("#saveStatus");button.disabled=true;status.textContent="Ruošiamas PDF…";try{if(!window.saskaitago?.saveInvoicePdf){window.print();return}const result=await window.saskaitago.saveInvoicePdf(${JSON.stringify(invoice.id)}, ${JSON.stringify(seller.outputDirectory || "")});status.textContent=result?.saved?"PDF išsaugotas":result?.canceled?"Išsaugojimas atšauktas":""}catch(error){status.textContent=error.message||"Nepavyko išsaugoti PDF"}finally{button.disabled=false}}</script></body></html>`;
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(html);
}

const server = createServer(async (req, res) => {
  try {
    const rawHost = req.headers.host || "";
    const requestHost = rawHost.startsWith("[") ? rawHost.slice(1, rawHost.indexOf("]")) : rawHost.split(":")[0];
    if (!new Set(["127.0.0.1", "localhost", "::1"]).has(requestHost)) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      return res.end("SaskaitaGO priima tik vietinius ryšius.");
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
    const staticFiles = { "/": "index.html", "/app.js": "app.js", "/i18n.js": "i18n.js", "/styles.css": "styles.css", "/responsive.css": "responsive.css", "/favicon.svg": "favicon.svg", "/saskaitago-icon.svg": "saskaitago-icon.svg" };
    if (req.method === "GET" && staticFiles[url.pathname]) {
      const file = path.join(root, "public", staticFiles[url.pathname]);
      const contentType = file.endsWith(".css") ? "text/css; charset=utf-8" : file.endsWith(".js") ? "text/javascript; charset=utf-8" : file.endsWith(".svg") ? "image/svg+xml" : file.endsWith(".png") ? "image/png" : "text/html; charset=utf-8";
      res.writeHead(200, { "content-type": contentType, "cache-control": "no-cache" });
      return createReadStream(file).pipe(res);
    }
    res.writeHead(404); res.end("Nerasta");
  } catch (error) {
    json(res, error.status || 500, { error: error.message || "Serverio klaida" });
  }
});

export function startServer({ host = defaultHost, port = defaultPort, dataDirectory = dataDir } = {}) {
  dataDir = dataDirectory;
  dataFile = path.join(dataDir, "workspace.json");
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      console.log(`SaskaitaGO veikia: http://${host}:${address.port}`);
      console.log(`Duomenys saugomi: ${dataDir}`);
      resolve({ server, host, port: address.port });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer();
}
