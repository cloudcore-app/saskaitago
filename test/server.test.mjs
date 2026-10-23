import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startServer } from "../server.mjs";

let base;
let server;
let dataDirectory;

before(async () => {
  dataDirectory = await mkdtemp(path.join(os.tmpdir(), "saskaitago-test-"));
  const started = await startServer({ host: "127.0.0.1", port: 0, dataDirectory });
  server = started.server;
  base = `http://127.0.0.1:${started.port}`;
});

after(async () => {
  server.close();
  await rm(dataDirectory, { recursive: true, force: true });
});

async function api(pathname, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: body === undefined ? headers : { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

const company = { businessType: "mb", company: "TEST MB", companyCode: "123456789", representativeName: "Jonas Jonaitis", address: "Vilnius", onboardingCompleted: true };
const invoice = (overrides = {}) => ({ type: "vat", issueDate: "2026-03-10", client: { name: "PIRKĖJAS UAB" }, items: [{ description: "Paslauga", quantity: 2, unitPrice: 50, vatRate: 0 }], ...overrides });

test("new workspace has no preset bank details", async () => {
  const { body } = await api("/api/workspace");
  for (const field of ["paymentRecipient", "iban", "bank", "swift"]) assert.equal(body.settings[field], "");
});

test("writes without a JSON content type are rejected", async () => {
  const response = await fetch(`${base}/api/clients`, { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ name: "CSRF" }) });
  assert.equal(response.status, 415);
});

test("writes from another origin are rejected", async () => {
  const { status } = await api("/api/clients", { method: "POST", body: { name: "CSRF" }, headers: { origin: "https://evil.example" } });
  assert.equal(status, 403);
  const { body } = await api("/api/workspace");
  assert.ok(!body.clients.some((client) => client.name === "CSRF"));
});

test("logo must be an image data URL", async () => {
  const { status } = await api("/api/settings", { method: "PUT", body: { ...company, logo: "javascript:alert(1)" } });
  assert.equal(status, 400);
});

test("issued invoices keep the seller details from the time of issue", async () => {
  assert.equal((await api("/api/settings", { method: "PUT", body: { ...company, iban: "LT00 1111" } })).status, 200);
  const created = await api("/api/invoices", { method: "POST", body: invoice() });
  assert.equal(created.status, 201);
  assert.equal(created.body.invoice.documentTitle, "Sąskaita faktūra");
  await api("/api/settings", { method: "PUT", body: { ...company, iban: "LT00 2222", vatStatus: "standard", vatCode: "LT123" } });
  const html = await (await fetch(`${base}/invoice/${created.body.invoice.id}`)).text();
  assert.match(html, /LT00 1111/);
  assert.doesNotMatch(html, /LT00 2222/);
  assert.doesNotMatch(html, /PVM sąskaita faktūra/);
});

test("invoice numbers cannot be back-dated within a series", async () => {
  const { status, body } = await api("/api/invoices", { method: "POST", body: invoice({ issueDate: "2026-03-01" }) });
  assert.equal(status, 400);
  assert.match(body.error, /2026-03-10/);
});

test("credit notes cannot exceed the credited invoice", async () => {
  const original = (await api("/api/invoices", { method: "POST", body: invoice({ issueDate: "2026-04-01" }) })).body.invoice;
  const credit = (amount) => api("/api/invoices", { method: "POST", body: invoice({ type: "credit", issueDate: "2026-04-02", relatedInvoiceId: original.id, items: [{ description: "Grąžinimas", quantity: 1, unitPrice: amount, vatRate: 0 }] }) });
  assert.equal((await credit(60)).status, 201);
  assert.equal((await credit(41)).status, 400);
  assert.equal((await credit(40)).status, 201);
});

test("applied advance cannot exceed the pro forma invoice", async () => {
  const proforma = (await api("/api/invoices", { method: "POST", body: invoice({ type: "proforma", issueDate: "2026-05-01" }) })).body.invoice;
  const settle = (advanceApplied) => api("/api/invoices", { method: "POST", body: invoice({ issueDate: "2026-05-02", relatedInvoiceId: proforma.id, advanceApplied }) });
  assert.equal((await settle(70)).status, 201);
  assert.equal((await settle(31)).status, 400);
});

test("item values are escaped on the printed invoice", async () => {
  const created = await api("/api/invoices", { method: "POST", body: invoice({ issueDate: "2026-06-01", client: { name: "<script>x</script>" }, items: [{ description: "<img src=x>", quantity: 1, unitPrice: 1, vatRate: 0 }] }) });
  const html = await (await fetch(`${base}/invoice/${created.body.invoice.id}`)).text();
  assert.doesNotMatch(html, /<script>x<\/script>|<img src=x>/);
});

test("JSON export can be imported back and the old workspace is backed up", async () => {
  const exported = (await api("/api/workspace")).body;
  const backup = { app: "SaskaitaGO", formatVersion: 1, ...exported };
  await api("/api/clients", { method: "POST", body: { name: "AFTER EXPORT" } });
  const restored = await api("/api/import", { method: "POST", body: backup });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.invoices.length, exported.invoices.length);
  assert.ok(!restored.body.clients.some((client) => client.name === "AFTER EXPORT"));
  assert.ok((await readdir(dataDirectory)).some((file) => file.startsWith("workspace.backup-")));
  const next = await api("/api/invoices", { method: "POST", body: invoice({ issueDate: "2026-12-01" }) });
  assert.ok(!exported.invoices.some((item) => item.number === next.body.invoice.number));
});

test("import rejects malformed invoices", async () => {
  const { status } = await api("/api/import", { method: "POST", body: { settings: {}, clients: [], invoices: [{ id: "../x", number: "1" }] } });
  assert.equal(status, 400);
});
