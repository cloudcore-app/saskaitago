import { createServer } from "node:http";
import { copyFile, readFile, mkdir, rename, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const defaultPort = Number(process.env.PORT || 4173);
const defaultHost = process.env.HOST || "127.0.0.1";
let dataDir = process.env.SASKAITAGO_DATA_DIR || process.env.SaskaitaGO_DATA_DIR || path.join(root, "data");
let dataFile = path.join(dataDir, "workspace.json");
let writeQueue = Promise.resolve();
let apiQueue = Promise.resolve();

const BUSINESS_TYPES = ["individual", "mb", "uab"];
const VAT_STATUSES = ["none", "standard", "svs"];
const INVOICE_TYPES = ["proforma", "vat", "credit"];
const INVOICE_STATUSES = ["issued", "paid", "cancelled"];
const UI_LANGUAGES = ["lt", "en"];
const UI_THEMES = ["light", "dark"];
const SERIES_BY_TYPE = { proforma: "IS", credit: "KR" };
const SELLER_FIELDS = [
  "businessType",
  "vatStatus",
  "company",
  "companyCode",
  "activityNumber",
  "representativeName",
  "personalCode",
  "vatCode",
  "address",
  "email",
  "phone",
  "paymentRecipient",
  "iban",
  "bank",
  "swift",
];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LOGO_PATTERN = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const MAX_LOGO_LENGTH = 200_000;
const MAX_BODY = 1_000_000;
const MAX_IMPORT_BODY = 50_000_000;
const MONEY_EPSILON = 0.005;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const STATIC_FILES = {
  "/": "index.html",
  "/app.js": "app.js",
  "/i18n.js": "i18n.js",
  "/styles.css": "styles.css",
  "/responsive.css": "responsive.css",
  "/invoice.css": "invoice.css",
  "/invoice.js": "invoice.js",
  "/favicon.svg": "favicon.svg",
  "/saskaitago-icon.svg": "saskaitago-icon.svg",
  "/saskaitago-icon.png": "saskaitago-icon.png",
};
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const initialData = () => ({
  settings: {
    country: "LT",
    businessType: "",
    personalCode: "",
    activityNumber: "",
    representativeName: "",
    vatStatus: "none",
    onboardingCompleted: false,
    company: "",
    companyCode: "",
    vatCode: "",
    address: "",
    email: "",
    phone: "",
    paymentRecipient: "",
    iban: "",
    bank: "",
    swift: "",
    logo: "",
    outputDirectory: "",
    series: "SG",
    paymentTermDays: 14,
    uiLanguage: "lt",
    uiTheme: "light",
  },
  counters: {},
  clients: [],
  invoices: [],
  logos: {},
});

const httpError = (status, message) => Object.assign(new Error(message), { status });
const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
function text(value, max = 300) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}
function amount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) throw httpError(400, "Neteisinga suma");
  return n;
}

function isVatPayer(seller) {
  return ["standard", "svs"].includes(seller.vatStatus) || Boolean(seller.vatCode);
}
function documentTitle(type, seller) {
  if (type === "proforma") return "Išankstinė sąskaita";
  if (type === "credit") return "Kreditinė sąskaita";
  return isVatPayer(seller) ? "PVM sąskaita faktūra" : "Sąskaita faktūra";
}

// Issued invoices keep a copy of the seller details so later settings changes never rewrite them.
function sellerSnapshot(settings, logos) {
  const seller = Object.fromEntries(SELLER_FIELDS.map((key) => [key, settings[key] || ""]));
  if (settings.logo) {
    const logoId = createHash("sha256").update(settings.logo).digest("hex").slice(0, 16);
    logos[logoId] = settings.logo;
    seller.logoId = logoId;
  }
  return seller;
}

function snapshotLegacyInvoices(data) {
  let changed = false;
  for (const invoice of data.invoices) {
    if (invoice.seller) continue;
    invoice.seller = sellerSnapshot(data.settings, data.logos);
    invoice.documentTitle = documentTitle(invoice.type, data.settings);
    changed = true;
  }
  return changed;
}

async function loadData() {
  await mkdir(dataDir, { recursive: true });
  let data;
  try {
    const defaults = initialData();
    const saved = JSON.parse(await readFile(dataFile, "utf8"));
    data = { ...defaults, ...saved, settings: { ...defaults.settings, ...(saved.settings || {}) }, logos: saved.logos || {} };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    data = initialData();
    await saveData(data);
    return data;
  }
  if (snapshotLegacyInvoices(data)) await saveData(data);
  return data;
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

async function backupData() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  try {
    await copyFile(dataFile, path.join(dataDir, `workspace.backup-${stamp}.json`));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

// Requiring application/json makes every cross-site write a CORS preflight, which this server never approves.
function readBody(req, limit = MAX_BODY) {
  const contentType = String(req.headers["content-type"] || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") return Promise.reject(httpError(415, "Užklausa turi būti JSON formato"));
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const onData = (chunk) => {
      size += chunk.length;
      if (size <= limit) return chunks.push(chunk);
      req.off("data", onData);
      req.resume();
      reject(httpError(413, "Užklausa per didelė"));
    };
    req.on("data", onData);
    req.on("end", () => {
      if (size > limit) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(httpError(400, "Neteisingas JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sanitizeSettings(input, current) {
  const value = (key, max) => text(input[key] ?? current[key], max);
  const businessType = oneOf(input.businessType, BUSINESS_TYPES, current.businessType || "");
  const vatStatus = oneOf(input.vatStatus, VAT_STATUSES, current.vatStatus || "none");
  const onboardingCompleted =
    input.onboardingCompleted === undefined ? Boolean(current.onboardingCompleted) : Boolean(input.onboardingCompleted);
  const settings = {
    country: "LT",
    businessType,
    vatStatus,
    onboardingCompleted,
    personalCode: value("personalCode", 32),
    activityNumber: value("activityNumber", 40),
    representativeName: businessType === "individual" ? "" : value("representativeName", 180),
    company: value("company", 180),
    companyCode: value("companyCode", 40),
    vatCode: value("vatCode", 40),
    address: value("address", 240),
    email: value("email", 180),
    phone: value("phone", 60),
    paymentRecipient: value("paymentRecipient", 180),
    iban: value("iban", 60),
    bank: value("bank", 120),
    swift: value("swift", 20),
    logo: String(input.logo ?? current.logo ?? "").trim(),
    outputDirectory: value("outputDirectory", 2000),
    series:
      value("series", 12)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "") || "SG",
    paymentTermDays:
      Number.isInteger(Number(input.paymentTermDays)) && Number(input.paymentTermDays) >= 1 && Number(input.paymentTermDays) <= 365
        ? Number(input.paymentTermDays)
        : Number(current.paymentTermDays) || 14,
    uiLanguage: oneOf(input.uiLanguage, UI_LANGUAGES, current.uiLanguage || "lt"),
    uiTheme: oneOf(input.uiTheme, UI_THEMES, current.uiTheme || "light"),
  };
  if (settings.logo && (settings.logo.length > MAX_LOGO_LENGTH || !LOGO_PATTERN.test(settings.logo)))
    throw httpError(400, "Logotipas turi būti PNG, JPG, WEBP arba SVG vaizdas iki 140 KB");
  if (settings.onboardingCompleted) {
    if (!businessType) throw httpError(400, "Pasirinkite veiklos formą");
    if (businessType === "individual" && (!settings.company || !settings.activityNumber || !settings.address))
      throw httpError(400, "Įveskite vardą, pavardę, veiklos pažymos numerį ir adresą");
    if (businessType !== "individual" && (!settings.company || !settings.companyCode || !settings.representativeName || !settings.address))
      throw httpError(400, "Įveskite įmonės pavadinimą, kodą, atstovo vardą, pavardę ir adresą");
    if (vatStatus !== "none" && !settings.vatCode) throw httpError(400, "Įveskite PVM mokėtojo kodą");
  }
  return settings;
}

function sanitizeClient(input) {
  return {
    name: text(input.name, 180),
    companyCode: text(input.companyCode, 40),
    vatCode: text(input.vatCode, 40),
    address: text(input.address, 240),
    email: text(input.email, 180),
    phone: text(input.phone, 60),
  };
}

function sanitizeItems(input) {
  const items = Array.isArray(input)
    ? input.slice(0, 100).map((item) => {
        const description = text(item.description, 300);
        if (!description) throw httpError(400, "Kiekvienai eilutei reikia aprašymo");
        const quantity = amount(item.quantity ?? 1);
        const unitPrice = amount(item.unitPrice ?? 0);
        const vatRate = amount(item.vatRate ?? 21);
        if (vatRate > 100) throw httpError(400, "Neteisingas PVM tarifas");
        const lineTotal = roundMoney(quantity * unitPrice);
        return { description, quantity, unitPrice, vatRate, lineTotal, vatAmount: roundMoney((lineTotal * vatRate) / 100) };
      })
    : [];
  if (!items.length) throw httpError(400, "Pridėkite bent vieną prekę arba paslaugą");
  return items;
}

const activeInvoices = (data, predicate) => data.invoices.filter((invoice) => invoice.status !== "cancelled" && predicate(invoice));

function createInvoice(data, input) {
  const type = oneOf(input.type, INVOICE_TYPES, "vat");
  const issueDate = DATE_PATTERN.test(input.issueDate || "") ? input.issueDate : new Date().toISOString().slice(0, 10);
  const sign = type === "credit" ? -1 : 1;
  const items = sanitizeItems(input.items).map((item) => ({
    ...item,
    unitPrice: sign * item.unitPrice,
    lineTotal: sign * item.lineTotal,
    vatAmount: sign * item.vatAmount,
  }));
  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0));
  const vatAmount = roundMoney(items.reduce((sum, item) => sum + item.vatAmount, 0));
  const total = roundMoney(subtotal + vatAmount);

  let related;
  if (type === "credit") {
    related = data.invoices.find((invoice) => invoice.id === input.relatedInvoiceId);
    if (!related || related.type !== "vat" || related.status === "cancelled")
      throw httpError(400, "Kreditinei sąskaitai pasirinkite galiojančią PVM sąskaitą");
    const alreadyCredited = activeInvoices(data, (invoice) => invoice.type === "credit" && invoice.relatedInvoiceId === related.id).reduce(
      (sum, invoice) => sum - invoice.total,
      0,
    );
    if (alreadyCredited - total > related.total + MONEY_EPSILON)
      throw httpError(
        400,
        `Kredituojama suma viršija sąskaitos ${related.number} likutį (${roundMoney(related.total - alreadyCredited)} €)`,
      );
  } else if (type === "vat" && input.relatedInvoiceId) {
    related = data.invoices.find((invoice) => invoice.id === input.relatedInvoiceId);
    if (!related || related.type !== "proforma" || related.status === "cancelled")
      throw httpError(400, "Pasirinkta išankstinė sąskaita nerasta arba atšaukta");
  }

  const advanceApplied = type === "vat" ? roundMoney(amount(input.advanceApplied || 0)) : 0;
  if (type === "vat" && advanceApplied > total + MONEY_EPSILON) throw httpError(400, "Avansas negali būti didesnis už sąskaitos sumą");
  if (related?.type === "proforma") {
    const alreadyApplied = activeInvoices(data, (invoice) => invoice.type === "vat" && invoice.relatedInvoiceId === related.id).reduce(
      (sum, invoice) => sum + (invoice.advanceApplied || 0),
      0,
    );
    if (advanceApplied > related.total - alreadyApplied + MONEY_EPSILON)
      throw httpError(
        400,
        `Avansas viršija išankstinės sąskaitos ${related.number} likutį (${roundMoney(related.total - alreadyApplied)} €)`,
      );
  }

  const clientInput = input.client || {};
  const savedClient = data.clients.find((client) => client.id === text(clientInput.id, 80));
  const client = { id: savedClient?.id || randomUUID(), ...sanitizeClient(clientInput) };
  if (!client.name) throw httpError(400, "Įveskite kliento pavadinimą");

  // Numbers must follow issue dates, so a series cannot be back-dated.
  const series = SERIES_BY_TYPE[type] || data.settings.series || "SG";
  const counterKey = `${series}-${issueDate.slice(0, 4)}`;
  const latestDate = data.invoices
    .filter((invoice) => invoice.number.startsWith(`${counterKey}-`))
    .reduce((latest, invoice) => (invoice.issueDate > latest ? invoice.issueDate : latest), "");
  if (latestDate && issueDate < latestDate)
    throw httpError(400, `Išrašymo data negali būti ankstesnė už paskutinės serijos ${series} sąskaitos datą (${latestDate})`);
  data.counters[counterKey] = (data.counters[counterKey] || 0) + 1;
  const number = `${counterKey}-${String(data.counters[counterKey]).padStart(4, "0")}`;

  if (!savedClient) data.clients.push({ ...client, createdAt: new Date().toISOString() });
  const invoice = {
    id: randomUUID(),
    number,
    type,
    issueDate,
    dueDate: DATE_PATTERN.test(input.dueDate || "") ? input.dueDate : "",
    status: "issued",
    client,
    seller: sellerSnapshot(data.settings, data.logos),
    documentTitle: documentTitle(type, data.settings),
    items,
    subtotal,
    vatAmount,
    total,
    notes: text(input.notes, 2000),
    relatedInvoiceId: related?.id || "",
    relatedInvoiceNumber: related?.number || "",
    advanceApplied,
    createdAt: new Date().toISOString(),
    paidAt: "",
  };
  data.invoices.unshift(invoice);
  return invoice;
}

function validateImport(input) {
  const source = input && typeof input === "object" ? input : {};
  if (source.app !== undefined && source.app !== "SaskaitaGO") throw httpError(400, "Failas nėra SaskaitaGO eksportas");
  if (!source.settings || typeof source.settings !== "object" || !Array.isArray(source.clients) || !Array.isArray(source.invoices))
    throw httpError(400, "Faile trūksta nustatymų, klientų arba sąskaitų");
  const defaults = initialData();
  const data = {
    ...defaults,
    settings: sanitizeSettings({ ...source.settings, onboardingCompleted: false }, defaults.settings),
    counters: {},
    logos: {},
  };
  data.settings.onboardingCompleted = Boolean(source.settings.onboardingCompleted);
  data.clients = source.clients.map((client) => {
    const clean = { id: text(client?.id, 80) || randomUUID(), ...sanitizeClient(client || {}), createdAt: text(client?.createdAt, 40) };
    if (!clean.name) throw httpError(400, "Faile yra klientas be pavadinimo");
    return clean;
  });
  const numbers = new Set();
  data.invoices = source.invoices.map((invoice) => {
    const valid =
      invoice &&
      /^[\w-]{1,80}$/.test(invoice.id || "") &&
      typeof invoice.number === "string" &&
      INVOICE_TYPES.includes(invoice.type) &&
      INVOICE_STATUSES.includes(invoice.status) &&
      DATE_PATTERN.test(invoice.issueDate || "") &&
      invoice.client?.name &&
      Array.isArray(invoice.items) &&
      Number.isFinite(invoice.total);
    if (!valid) throw httpError(400, `Neteisinga sąskaita faile: ${text(invoice?.number, 40) || "be numerio"}`);
    if (numbers.has(invoice.number)) throw httpError(400, `Sąskaitos numeris kartojasi: ${invoice.number}`);
    numbers.add(invoice.number);
    if (invoice.seller !== undefined && (typeof invoice.seller !== "object" || invoice.seller === null)) delete invoice.seller;
    return invoice;
  });
  for (const [logoId, logo] of Object.entries(source.logos || {}))
    if (typeof logo === "string" && LOGO_PATTERN.test(logo)) data.logos[logoId] = logo;
  // Counters are rebuilt from the numbers themselves so imported data can never reuse a number.
  for (const number of numbers) {
    const match = number.match(/^(.+)-(\d+)$/);
    if (match) data.counters[match[1]] = Math.max(data.counters[match[1]] || 0, Number(match[2]));
  }
  for (const [key, value] of Object.entries(source.counters || {}))
    if (Number.isInteger(value) && value > (data.counters[key] || 0)) data.counters[key] = value;
  snapshotLegacyInvoices(data);
  return data;
}

const workspaceView = (data) => ({
  settings: data.settings,
  counters: data.counters,
  clients: data.clients,
  invoices: data.invoices,
  logos: data.logos,
});

async function handleApi(req, res, url) {
  const data = await loadData();
  if (req.method === "GET" && url.pathname === "/api/workspace") return json(res, 200, workspaceView(data));
  if (req.method === "PUT" && url.pathname === "/api/settings") {
    data.settings = sanitizeSettings(await readBody(req), data.settings);
    await saveData(data);
    return json(res, 200, { settings: data.settings });
  }
  if (req.method === "POST" && url.pathname === "/api/import") {
    const imported = validateImport(await readBody(req, MAX_IMPORT_BODY));
    await backupData();
    await saveData(imported);
    return json(res, 200, workspaceView(imported));
  }
  if (req.method === "POST" && url.pathname === "/api/clients") {
    const client = { id: randomUUID(), ...sanitizeClient(await readBody(req)), createdAt: new Date().toISOString() };
    if (!client.name) throw httpError(400, "Įveskite kliento pavadinimą");
    data.clients.push(client);
    await saveData(data);
    return json(res, 201, { client });
  }
  const clientMatch = url.pathname.match(/^\/api\/clients\/([^/]+)$/);
  if (clientMatch && req.method === "PUT") {
    const client = data.clients.find((item) => item.id === decodeURIComponent(clientMatch[1]));
    if (!client) return json(res, 404, { error: "Klientas nerastas" });
    const changes = sanitizeClient(await readBody(req));
    if (!changes.name) throw httpError(400, "Įveskite kliento pavadinimą");
    Object.assign(client, changes);
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
    const invoice = createInvoice(data, await readBody(req));
    await saveData(data);
    return json(res, 201, { invoice });
  }
  const statusMatch = url.pathname.match(/^\/api\/invoices\/([\w-]+)\/status$/);
  if (req.method === "PATCH" && statusMatch) {
    const invoice = data.invoices.find((item) => item.id === statusMatch[1]);
    if (!invoice) return json(res, 404, { error: "Sąskaita nerasta" });
    const input = await readBody(req);
    if (!INVOICE_STATUSES.includes(input.status)) throw httpError(400, "Neteisingas statusas");
    if (invoice.status === "cancelled" && input.status !== "cancelled") throw httpError(400, "Atšauktos sąskaitos būsenos keisti negalima");
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
function money(value) {
  return `${Number(value).toLocaleString("lt-LT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}
function date(value) {
  return value ? new Date(`${value}T00:00:00`).toLocaleDateString("lt-LT") : "—";
}

function partyDetails(party) {
  return [
    party.companyCode && ["Įmonės kodas", party.companyCode],
    party.activityNumber && ["Individualios veiklos pažymos Nr.", party.activityNumber],
    party.representativeName && ["Atstovas", party.representativeName],
    party.personalCode && ["Asmens kodas", party.personalCode],
    party.vatCode && ["PVM kodas", party.vatCode],
    party.address && ["Adresas", party.address],
    party.phone && ["Telefonas", party.phone],
    party.email && ["El. paštas", party.email],
  ]
    .filter(Boolean)
    .map(([key, value]) => `<div class="detail"><span>${escapeHtml(key)}</span><b>${escapeHtml(value)}</b></div>`)
    .join("");
}

const PAYMENT_PURPOSE = { vat: "SF Nr.", proforma: "Išankstinė sąskaita Nr.", credit: "Kreditinė sąskaita Nr." };

async function printInvoice(res, id) {
  const data = await loadData();
  const invoice = data.invoices.find((item) => item.id === id);
  if (!invoice) {
    res.writeHead(404);
    return res.end("Sąskaita nerasta");
  }
  const seller = invoice.seller;
  const logoSource = seller.logoId ? data.logos[seller.logoId] : "";
  const amountDue = roundMoney(invoice.total - (invoice.advanceApplied || 0));
  const items = invoice.items
    .map((item, index) => {
      const lineVat = item.vatAmount ?? (item.lineTotal * item.vatRate) / 100;
      return `<tr><td class="index">${String(index + 1).padStart(2, "0")}</td><td><strong>${escapeHtml(item.description)}</strong></td><td class="align-right">${escapeHtml(item.quantity)}</td><td class="align-right">${money(item.unitPrice)}</td><td class="align-right">${escapeHtml(item.vatRate)}%</td><td class="align-right strong">${money(item.lineTotal + lineVat)}</td></tr>`;
    })
    .join("");
  const logo = logoSource
    ? `<img class="logo" src="${escapeHtml(logoSource)}" alt="">`
    : `<img class="logo app-document-icon" src="/saskaitago-icon.svg" alt="SaskaitaGO">`;
  const bankLines = [
    ["Gavėjas", seller.paymentRecipient],
    ["Bankas", seller.bank],
    ["IBAN", seller.iban],
    ["SWIFT / BIC", seller.swift],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `<p><b>${label}:</b> ${escapeHtml(value)}</p>`)
    .join("");
  const relation = invoice.relatedInvoiceNumber
    ? `<div class="relation">${invoice.type === "credit" ? "Kredituojama sąskaita" : "Pagal išankstinę sąskaitą"} Nr. ${escapeHtml(invoice.relatedInvoiceNumber)}</div>`
    : "";
  const advance = invoice.advanceApplied
    ? `<div class="total-row"><span>Iš viso</span><b>${money(invoice.total)}</b></div><div class="total-row"><span>Įskaitytas avansas</span><b>− ${money(invoice.advanceApplied)}</b></div>`
    : "";
  const grandLabel = invoice.type === "credit" ? "Kredituojama suma" : invoice.advanceApplied ? "Liko sumokėti" : "Iš viso mokėti";
  const footerCode = seller.companyCode
    ? ` · Įm. kodas ${escapeHtml(seller.companyCode)}`
    : seller.activityNumber
      ? ` · Veiklos pažymos Nr. ${escapeHtml(seller.activityNumber)}`
      : "";
  const html = `<!doctype html>
<html lang="lt">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(invoice.number)} · SaskaitaGO</title>
<link rel="stylesheet" href="/invoice.css">
<script src="/invoice.js" defer></script>
</head>
<body data-invoice-id="${escapeHtml(invoice.id)}" data-output-directory="${escapeHtml(data.settings.outputDirectory || "")}">
<div class="toolbar"><span>SaskaitaGO · PERŽIŪRA</span><div class="invoice-actions"><span id="saveStatus" role="status"></span><button class="save-pdf-button" type="button">Išsaugoti PDF</button><button class="print-button" type="button">Spausdinti</button></div></div>
<main class="sheet">
<header class="masthead"><div class="seller-brand">${logo}<span>${escapeHtml(seller.company || "SaskaitaGO")}</span></div></header>
<section class="title-row"><div><h1>${escapeHtml(invoice.documentTitle)}</h1><div class="invoice-number">Sąskaitos Nr. <b>${escapeHtml(invoice.number)}</b></div>${relation}</div><div class="date-box"><div class="date-entry">Išrašymo data<strong>${date(invoice.issueDate)}</strong></div>${invoice.dueDate ? `<div class="date-entry">Apmokėti iki<strong>${date(invoice.dueDate)}</strong></div>` : ""}</div></section>
<section class="parties"><div><h2 class="party-label">Pardavėjas</h2><div class="party-name">${escapeHtml(seller.company)}</div>${partyDetails(seller)}</div><div><h2 class="party-label">Pirkėjas</h2><div class="party-name">${escapeHtml(invoice.client.name)}</div>${partyDetails(invoice.client)}</div></section>
<table class="items"><thead><tr><th>#</th><th>Prekė arba paslauga</th><th class="align-right">Kiekis</th><th class="align-right">Kaina</th><th class="align-right">PVM</th><th class="align-right">Suma</th></tr></thead><tbody>${items}</tbody></table>
<section class="lower"><div class="payment"><h2>BANKO REKVIZITAI</h2>${bankLines}<p><b>Mokėjimo paskirtis:</b> ${PAYMENT_PURPOSE[invoice.type]} ${escapeHtml(invoice.number)}</p></div><div class="totals"><div class="total-row"><span>Suma be PVM</span><b>${money(invoice.subtotal)}</b></div><div class="total-row"><span>PVM</span><b>${money(invoice.vatAmount)}</b></div>${advance}<div class="total-row grand"><span>${grandLabel}</span><b>${money(amountDue)}</b></div></div></section>
${invoice.notes ? `<section class="notes"><h2>Papildoma informacija</h2><div>${escapeHtml(invoice.notes)}</div></section>` : ""}
<footer class="footer"><span>${escapeHtml(seller.company || "SaskaitaGO")}${footerCode}</span><span>${escapeHtml(invoice.number)} · ${escapeHtml(seller.email)}</span><a class="powered-by-invoice" href="https://cloudcore.lt" target="_blank" rel="noopener noreferrer">POWERED BY CLOUDCORE.LT ↗</a></footer>
</main>
</body>
</html>`;
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(html);
}

function requestHostname(rawHost = "") {
  return rawHost.startsWith("[") ? rawHost.slice(1, rawHost.indexOf("]")) : rawHost.split(":")[0];
}

const server = createServer(async (req, res) => {
  try {
    if (!LOCAL_HOSTS.has(requestHostname(req.headers.host))) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      return res.end("SaskaitaGO priima tik vietinius ryšius.");
    }
    const origin = req.headers.origin;
    if (!["GET", "HEAD"].includes(req.method) && origin && origin !== `http://${req.headers.host}`) {
      return json(res, 403, { error: "Užklausa iš kitos svetainės atmesta" });
    }
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      const task = apiQueue
        .then(() => handleApi(req, res, url))
        .catch((error) => {
          json(res, error.status || 500, { error: error.message || "Serverio klaida" });
        });
      apiQueue = task.then(
        () => undefined,
        () => undefined,
      );
      return;
    }
    const printMatch = url.pathname.match(/^\/invoice\/([\w-]+)$/);
    if (req.method === "GET" && printMatch) return await printInvoice(res, printMatch[1]);
    if (req.method === "GET" && STATIC_FILES[url.pathname]) {
      const file = path.join(root, "public", STATIC_FILES[url.pathname]);
      res.writeHead(200, { "content-type": CONTENT_TYPES[path.extname(file)], "cache-control": "no-cache" });
      return createReadStream(file).pipe(res);
    }
    res.writeHead(404);
    res.end("Nerasta");
  } catch (error) {
    json(res, error.status || 500, { error: error.message || "Serverio klaida" });
  }
});

function listen(host, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve(server.address().port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

// fallbackPort lets the desktop app prefer a stable port (stable origin keeps localStorage) but still start if it is taken.
export async function startServer({ host = defaultHost, port = defaultPort, fallbackPort, dataDirectory = dataDir } = {}) {
  dataDir = dataDirectory;
  dataFile = path.join(dataDir, "workspace.json");
  let actualPort;
  try {
    actualPort = await listen(host, port);
  } catch (error) {
    if (error.code !== "EADDRINUSE" || fallbackPort === undefined) throw error;
    actualPort = await listen(host, fallbackPort);
  }
  console.log(`SaskaitaGO veikia: http://${host}:${actualPort}`);
  console.log(`Duomenys saugomi: ${dataDir}`);
  return { server, host, port: actualPort };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer();
}
