const saveButton = document.querySelector(".save-pdf-button");
const printButton = document.querySelector(".print-button");
const saveStatus = document.querySelector("#saveStatus");

async function saveInvoicePdf() {
  saveButton.disabled = true;
  saveStatus.textContent = "Ruošiamas PDF…";
  try {
    if (!window.saskaitago?.saveInvoicePdf) {
      saveStatus.textContent = "";
      window.print();
      return;
    }
    const { invoiceId, outputDirectory } = document.body.dataset;
    const result = await window.saskaitago.saveInvoicePdf(invoiceId, outputDirectory || "");
    saveStatus.textContent = result?.saved ? "PDF išsaugotas" : result?.canceled ? "Išsaugojimas atšauktas" : "";
  } catch (error) {
    saveStatus.textContent = error.message || "Nepavyko išsaugoti PDF";
  } finally {
    saveButton.disabled = false;
  }
}

saveButton?.addEventListener("click", saveInvoicePdf);
printButton?.addEventListener("click", () => window.print());
