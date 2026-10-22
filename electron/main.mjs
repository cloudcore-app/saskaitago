import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../server.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
let mainWindow;
let localServer;
let appOrigin;
let dataDirectory;

// Some Linux systems cannot access the installed Mesa/GPU drivers.
// Software rendering keeps the desktop window available in that environment.
app.disableHardwareAcceleration();

function isInternalUrl(value) {
  try { return new URL(value).origin === appOrigin; } catch { return false; }
}

function handleExternalWindow({ url }) {
  try { if (new URL(url).origin === "https://cloudcore.lt") void shell.openExternal(url); } catch {}
  return { action: "deny" };
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 960, minWidth: 900, minHeight: 680, show: false,
    title: "SaskaitaGO", icon: path.join(here, "../public/saskaitago-icon.png"), backgroundColor: "#f5f6f8", autoHideMenuBar: true,
    webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(handleExternalWindow);
  mainWindow.webContents.on("will-navigate", (event, url) => { if (!isInternalUrl(url)) event.preventDefault(); });
  mainWindow.loadURL(appOrigin);
  mainWindow.on("closed", () => { mainWindow = undefined; });
}

ipcMain.handle("invoice:open", async (event, invoiceId) => {
  if (typeof invoiceId !== "string" || !/^[\w-]{1,80}$/.test(invoiceId)) throw new Error("Invalid invoice identifier");
  const invoiceWindow = new BrowserWindow({
    parent: BrowserWindow.fromWebContents(event.sender) || mainWindow, width: 1050, height: 900, minWidth: 760, minHeight: 650,
    title: "Sąskaitos peržiūra · SaskaitaGO", icon: path.join(here, "../public/saskaitago-icon.png"), backgroundColor: "#eef0f4", autoHideMenuBar: true,
    webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  invoiceWindow.webContents.setWindowOpenHandler(handleExternalWindow);
  invoiceWindow.webContents.on("will-navigate", (navigationEvent, url) => { if (!isInternalUrl(url)) navigationEvent.preventDefault(); });
  await invoiceWindow.loadURL(`${appOrigin}/invoice/${encodeURIComponent(invoiceId)}`);
  return true;
});

ipcMain.handle("settings:choose-output-directory", async (event) => {
  const owner = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(owner, { title: "Pasirinkite sąskaitų PDF aplanką", properties: ["openDirectory", "createDirectory"] });
  return result.canceled ? "" : result.filePaths[0] || "";
});

ipcMain.handle("invoice:save-pdf", async (event, invoiceId, configuredOutputDirectory, automatic = false) => {
  if (typeof invoiceId !== "string" || !/^[\w-]{1,80}$/.test(invoiceId)) throw new Error("Invalid invoice identifier");
  const workspace = JSON.parse(await readFile(path.join(dataDirectory, "workspace.json"), "utf8"));
  const invoice = workspace.invoices?.find((item) => item.id === invoiceId);
  if (!invoice) throw new Error("Sąskaita nerasta");
  const safeNumber = String(invoice.number || invoiceId).replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").trim();
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
          try { await access(filePath); filePath = path.join(outputDirectory, `Saskaita-${safeNumber}-${suffix++}.pdf`); }
          catch { break; }
        }
      }
    } catch {}
  }
  if (!filePath) {
    if (automatic) throw new Error("Pasirinktas PDF išvesties aplankas nepasiekiamas. Patikrinkite jį Programos nustatymuose.");
    const owner = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(owner, { title: "Išsaugoti sąskaitą PDF formatu", defaultPath: path.join(app.getPath("documents"), filename), filters: [{ name: "PDF dokumentas", extensions: ["pdf"] }] });
    if (result.canceled || !result.filePath) return { canceled: true };
    filePath = result.filePath;
  }
  const pdfWindow = new BrowserWindow({
    show: false, width: 1050, height: 900,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  try {
    await pdfWindow.loadURL(`${appOrigin}/invoice/${encodeURIComponent(invoiceId)}`);
    const pdf = await pdfWindow.webContents.printToPDF({ pageSize: "A4", preferCSSPageSize: true, printBackground: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    await writeFile(filePath, pdf);
  } finally {
    if (!pdfWindow.isDestroyed()) pdfWindow.destroy();
  }
  return { saved: true, filePath };
});

app.whenReady().then(async () => {
  dataDirectory = path.join(app.getPath("userData"), "data");
  localServer = await startServer({ host: "127.0.0.1", port: 0, dataDirectory });
  appOrigin = `http://127.0.0.1:${localServer.port}`;
  createMainWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });
});

app.on("before-quit", () => { localServer?.server.close(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
