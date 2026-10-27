import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../server.mjs";
import { startUpdater } from "./updater.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
let mainWindow;
let localServer;
let appOrigin;
let dataDirectory;

// Some Linux systems cannot access the installed Mesa/GPU drivers.
// Software rendering keeps the desktop window available in that environment.
if (process.platform === "linux") app.disableHardwareAcceleration();

// A second instance would start its own server and race the first one on workspace.json.
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();
app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

// A stable port keeps the page origin (and its localStorage) the same between launches.
const PREFERRED_PORT = 41730;

function isInternalUrl(value) {
  try {
    return new URL(value).origin === appOrigin;
  } catch {
    return false;
  }
}

function handleExternalWindow({ url }) {
  try {
    if (new URL(url).origin === "https://cloudcore.lt") void shell.openExternal(url);
  } catch {}
  return { action: "deny" };
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 680,
    show: false,
    title: "SaskaitaGO",
    icon: path.join(here, "../public/saskaitago-icon.png"),
    backgroundColor: "#f5f6f8",
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(handleExternalWindow);
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isInternalUrl(url)) event.preventDefault();
  });
  mainWindow.loadURL(appOrigin);
  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });
}

ipcMain.handle("invoice:open", async (event, invoiceId) => {
  if (typeof invoiceId !== "string" || !/^[\w-]{1,80}$/.test(invoiceId)) throw new Error("Invalid invoice identifier");
  const invoiceWindow = new BrowserWindow({
    parent: BrowserWindow.fromWebContents(event.sender) || mainWindow,
    width: 1050,
    height: 900,
    minWidth: 760,
    minHeight: 650,
    title: "Sąskaitos peržiūra · SaskaitaGO",
    icon: path.join(here, "../public/saskaitago-icon.png"),
    backgroundColor: "#eef0f4",
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  invoiceWindow.webContents.setWindowOpenHandler(handleExternalWindow);
  invoiceWindow.webContents.on("will-navigate", (navigationEvent, url) => {
    if (!isInternalUrl(url)) navigationEvent.preventDefault();
  });
  await invoiceWindow.loadURL(`${appOrigin}/invoice/${encodeURIComponent(invoiceId)}`);
  return true;
});

ipcMain.handle("settings:choose-output-directory", async (event) => {
  const owner = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(owner, {
    title: "Pasirinkite sąskaitų PDF aplanką",
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? "" : result.filePaths[0] || "";
});

ipcMain.handle("invoice:save-pdf", async (event, invoiceId, configuredOutputDirectory, automatic = false) => {
  if (typeof invoiceId !== "string" || !/^[\w-]{1,80}$/.test(invoiceId)) throw new Error("Invalid invoice identifier");
  const workspace = JSON.parse(await readFile(path.join(dataDirectory, "workspace.json"), "utf8"));
  const invoice = workspace.invoices?.find((item) => item.id === invoiceId);
  if (!invoice) throw new Error("Sąskaita nerasta");
  const safeNumber = String(invoice.number || invoiceId)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .trim();
  const filename = `Saskaita-${safeNumber}.pdf`;
  let filePath = "";
  const outputDirectory = String(configuredOutputDirectory || workspace.settings?.outputDirectory || "").trim();
  if (outputDirectory && path.isAbsolute(outputDirectory)) {
    try {
      const info = await stat(outputDirectory);
      if (info.isDirectory()) {
        filePath = path.join(outputDirectory, filename);
        let suffix = 1;
        while (true) {
          try {
            await access(filePath);
            filePath = path.join(outputDirectory, `Saskaita-${safeNumber}-${suffix++}.pdf`);
          } catch {
            break;
          }
        }
      }
    } catch {}
  }
  if (!filePath) {
    if (automatic) throw new Error("Pasirinktas PDF išvesties aplankas nepasiekiamas. Patikrinkite jį Programos nustatymuose.");
    const owner = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(owner, {
      title: "Išsaugoti sąskaitą PDF formatu",
      defaultPath: path.join(app.getPath("documents"), filename),
      filters: [{ name: "PDF dokumentas", extensions: ["pdf"] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    filePath = result.filePath;
  }
  const pdfWindow = new BrowserWindow({
    show: false,
    width: 1050,
    height: 900,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  try {
    await pdfWindow.loadURL(`${appOrigin}/invoice/${encodeURIComponent(invoiceId)}`);
    const pdf = await pdfWindow.webContents.printToPDF({
      pageSize: "A4",
      preferCSSPageSize: true,
      printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    await writeFile(filePath, pdf);
  } finally {
    if (!pdfWindow.isDestroyed()) pdfWindow.destroy();
  }
  return { saved: true, filePath };
});

ipcMain.handle("workspace:save-pdf", async (event) => {
  const workspace = JSON.parse(await readFile(path.join(dataDirectory, "workspace.json"), "utf8"));
  const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const formatDate = (value) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString("lt-LT") : "");
  const formatMoney = (value) => `${Number(value || 0).toLocaleString("lt-LT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  const invoices = Array.isArray(workspace.invoices) ? workspace.invoices : [];
  const clients = Array.isArray(workspace.clients) ? workspace.clients : [];
  const invoiceRows = invoices
    .map(
      (invoice) =>
        `<tr><td>${escapeHtml(invoice.number)}</td><td>${escapeHtml(invoice.client?.name)}</td><td>${escapeHtml(formatDate(invoice.issueDate))}</td><td>${escapeHtml(formatDate(invoice.dueDate))}</td><td>${escapeHtml(invoice.status)}</td><td class="amount">${escapeHtml(formatMoney(invoice.total))}</td></tr>`,
    )
    .join("");
  const clientRows = clients
    .map(
      (client) =>
        `<tr><td>${escapeHtml(client.name)}</td><td>${escapeHtml(client.companyCode)}</td><td>${escapeHtml(client.vatCode)}</td><td>${escapeHtml(client.email)}</td><td>${escapeHtml(client.phone)}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html lang="lt"><meta charset="utf-8"><title>SaskaitaGO · Duomenų ataskaita</title><style>@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font:10pt Arial,sans-serif;color:#202735}h1{font-size:22pt;margin:0 0 4mm}h2{font-size:15pt;margin:10mm 0 3mm}p{color:#657086;margin:0 0 7mm}table{width:100%;border-collapse:collapse;font-size:8pt;page-break-inside:auto}thead{display:table-header-group}tr{page-break-inside:avoid}th,td{padding:6px 7px;border:1px solid #dce1eb;text-align:left;vertical-align:top}th{background:#f0f3f8}.amount{text-align:right;white-space:nowrap}.footer{margin-top:12mm;color:#657086;font-size:8pt}</style><h1>SaskaitaGO · Duomenų ataskaita</h1><p>${escapeHtml(workspace.settings?.company || "")} · Sukurta ${escapeHtml(new Date().toLocaleString("lt-LT"))}</p><h2>Sąskaitos (${invoices.length})</h2><table><thead><tr><th>Numeris</th><th>Klientas</th><th>Išrašymo data</th><th>Apmokėti iki</th><th>Būsena</th><th>Suma</th></tr></thead><tbody>${invoiceRows || `<tr><td colspan="6">Sąskaitų nėra</td></tr>`}</tbody></table><h2>Klientai (${clients.length})</h2><table><thead><tr><th>Pavadinimas</th><th>Įmonės kodas</th><th>PVM kodas</th><th>El. paštas</th><th>Telefonas</th></tr></thead><tbody>${clientRows || `<tr><td colspan="5">Klientų nėra</td></tr>`}</tbody></table><div class="footer">Eksportuota iš SaskaitaGO</div></html>`;
  const owner = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(owner, {
    title: "Eksportuoti duomenų ataskaitą PDF formatu",
    defaultPath: path.join(app.getPath("documents"), `SaskaitaGO-ataskaita-${new Date().toISOString().slice(0, 10)}.pdf`),
    filters: [{ name: "PDF dokumentas", extensions: ["pdf"] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  const pdfWindow = new BrowserWindow({
    show: false,
    width: 1100,
    height: 900,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  try {
    await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdf = await pdfWindow.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    await writeFile(result.filePath, pdf);
  } finally {
    if (!pdfWindow.isDestroyed()) pdfWindow.destroy();
  }
  return { saved: true, filePath: result.filePath };
});

app.whenReady().then(async () => {
  if (!hasInstanceLock) return;
  dataDirectory = path.join(app.getPath("userData"), "data");
  localServer = await startServer({ host: "127.0.0.1", port: PREFERRED_PORT, fallbackPort: 0, dataDirectory });
  appOrigin = `http://127.0.0.1:${localServer.port}`;
  createMainWindow();
  startUpdater({
    getWindow: () => mainWindow,
    // The interface language lives in the page's localStorage (see public/app.js).
    getLanguage: async () =>
      mainWindow?.webContents.executeJavaScript(`JSON.parse(localStorage.getItem("saskaitago.preferences") || "{}").language || "lt"`) ??
      "lt",
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("before-quit", () => {
  localServer?.server.close();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
