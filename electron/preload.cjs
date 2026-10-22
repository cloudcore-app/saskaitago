const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("saskaitago", Object.freeze({
  openInvoiceWindow: (invoiceId) => ipcRenderer.invoke("invoice:open", invoiceId),
  chooseInvoiceFolder: () => ipcRenderer.invoke("settings:choose-output-directory"),
  saveInvoicePdf: (invoiceId, outputDirectory, automatic = false) => ipcRenderer.invoke("invoice:save-pdf", invoiceId, outputDirectory, automatic),
  saveWorkspacePdf: () => ipcRenderer.invoke("workspace:save-pdf"),
}));
