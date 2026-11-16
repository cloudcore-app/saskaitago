// i.SAF 1.2 register of issued VAT invoices (DataType "S") for VMI. Structure follows the official isaf_1.2.xsd:
// pro forma invoices are not reported, credit notes are "KS" with negative amounts and a reference to the
// credited invoice, and totals are split into one DocumentTotal per PVM classifier code.
const NAMESPACE = "http://www.vmi.lt/cms/imas/isaf";
const XSI = "http://www.w3.org/2001/XMLSchema-instance";
const EU_VAT_PREFIXES = new Set([
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "EL",
  "ES",
  "FI",
  "FR",
  "HR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
  "XI",
]);

// Reasons for a 0% line, with the PVM classifier code and whether a rate (0) or nil is reported.
export const ZERO_RATE_REASONS = {
  PVM5: { label: "Neapmokestinama PVM (PVMĮ 20–33 str.)", percentage: null },
  PVM12: { label: "Prekių eksportas už ES ribų (PVMĮ 41 str.)", percentage: 0 },
  PVM13: { label: "Prekių tiekimas kitos ES šalies PVM mokėtojui (PVMĮ 49 str.)", percentage: 0 },
  PVM14: { label: "Kiti 0 % tarifo sandoriai (PVMĮ 42–48, 51–53 str.)", percentage: 0 },
  PVM15: { label: "Paslaugos ES verslui, PVM moka pirkėjas (atvirkštinis apmokestinimas)", percentage: null },
};
const RATE_CODES = { 21: "PVM1", 12: "PVM58", 9: "PVM2", 5: "PVM3" };

const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const xml = (value) =>
  String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const decimal = (value) => round(value).toFixed(2);
const element = (name, value) => `<${name}>${xml(value)}</${name}>`;
const nil = (name) => `<${name} xsi:nil="true"/>`;

export function vatCountry(vatCode) {
  const prefix = String(vatCode || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .slice(0, 2);
  return EU_VAT_PREFIXES.has(prefix) ? prefix : "";
}

// Default reason when an invoice has no stored 0% reason: services to a business in another EU country are most
// common for small sellers; anything else is treated as an exempt supply. The export lists these as warnings.
export function defaultZeroRateCode(client = {}) {
  const country = vatCountry(client.vatCode);
  return country && country !== "LT" ? "PVM15" : "PVM5";
}

export function isVatPayerSeller(seller = {}) {
  return seller.vatStatus === "standard" || (seller.vatStatus !== "svs" && Boolean(seller.vatCode));
}

function taxLines(invoice, warnings) {
  const lines = new Map();
  for (const item of invoice.items || []) {
    const rate = Number(item.vatRate) || 0;
    let code = RATE_CODES[rate];
    let percentage = rate;
    if (rate === 0) {
      code = ZERO_RATE_REASONS[invoice.zeroRateCode] ? invoice.zeroRateCode : defaultZeroRateCode(invoice.client);
      if (!invoice.zeroRateCode)
        warnings.push(`${invoice.number}: 0 % PVM priežastis nenurodyta, pritaikytas kodas ${code}. Patikrinkite.`);
      percentage = ZERO_RATE_REASONS[code].percentage;
    } else if (!code) {
      warnings.push(`${invoice.number}: PVM tarifui ${rate} % nėra PVM klasifikatoriaus kodo, nurodytas PVM1.`);
      code = "PVM1";
    }
    const line = lines.get(code) || { code, percentage, taxable: 0, vat: 0 };
    line.taxable += Number(item.lineTotal) || 0;
    line.vat += Number(item.vatAmount) || 0;
    lines.set(code, line);
  }
  return [...lines.values()];
}

function customerXml(client = {}) {
  const vatCode = String(client.vatCode || "")
    .toUpperCase()
    .replace(/\s+/g, "");
  const country = vatCountry(vatCode);
  // Country is required only for customers without an EU VAT code; VMI accepts LT for local private persons.
  const countryXml = country ? element("Country", country === "EL" ? "GR" : country) : element("Country", "LT");
  return `<CustomerInfo>${element("VATRegistrationNumber", vatCode || "ND")}${element(
    "RegistrationNumber",
    String(client.companyCode || "").trim() || "ND",
  )}${countryXml}${element("Name", String(client.name || "").trim() || "ND")}</CustomerInfo>`;
}

export function selectIsafInvoices(invoices, from, to) {
  return invoices
    .filter(
      (invoice) =>
        ["vat", "credit"].includes(invoice.type) &&
        invoice.status !== "cancelled" &&
        invoice.issueDate >= from &&
        invoice.issueDate <= to &&
        isVatPayerSeller(invoice.seller),
    )
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.number.localeCompare(b.number));
}

export function buildIsaf({ settings, invoices, from, to, softwareVersion = "", createdAt = new Date() }) {
  const warnings = [];
  const registrationNumber = String(settings.businessType === "individual" ? settings.personalCode : settings.companyCode).replace(
    /\D/g,
    "",
  );
  if (!registrationNumber || registrationNumber.length > 11)
    throw Object.assign(
      new Error(
        settings.businessType === "individual"
          ? "i.SAF failui reikia asmens kodo. Įrašykite jį įmonės nustatymuose."
          : "i.SAF failui reikia įmonės kodo. Įrašykite jį įmonės nustatymuose.",
      ),
      { status: 400 },
    );
  const selected = selectIsafInvoices(invoices, from, to);
  const byId = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  let taxable = 0;
  let vat = 0;
  const invoiceXml = selected
    .map((invoice) => {
      const lines = taxLines(invoice, warnings);
      const related = invoice.type === "credit" ? byId.get(invoice.relatedInvoiceId) : null;
      const references = related
        ? `<References><Reference>${element("ReferenceNo", related.number)}${element("ReferenceDate", related.issueDate)}</Reference></References>`
        : "<References/>";
      const totals = lines
        .map((line) => {
          taxable += line.taxable;
          vat += line.vat;
          return `<DocumentTotal>${element("TaxableValue", decimal(line.taxable))}${element("TaxCode", line.code)}${
            line.percentage === null ? nil("TaxPercentage") : element("TaxPercentage", line.percentage)
          }${element("Amount", decimal(line.vat))}${nil("VATPointDate2")}</DocumentTotal>`;
        })
        .join("");
      return `<Invoice>${element("InvoiceNo", invoice.number)}${customerXml(invoice.client)}${element("InvoiceDate", invoice.issueDate)}${element(
        "InvoiceType",
        invoice.type === "credit" ? "KS" : "SF",
      )}<SpecialTaxation></SpecialTaxation>${references}${nil("VATPointDate")}<DocumentTotals>${totals}</DocumentTotals></Invoice>`;
    })
    .join("");
  const pad = (n) => String(n).padStart(2, "0");
  const created = `${createdAt.getFullYear()}-${pad(createdAt.getMonth() + 1)}-${pad(createdAt.getDate())}T${pad(createdAt.getHours())}:${pad(
    createdAt.getMinutes(),
  )}:${pad(createdAt.getSeconds())}`;
  const header = `<Header><FileDescription>${element("FileVersion", "iSAF1.2")}${element("FileDateCreated", created)}${element(
    "DataType",
    "S",
  )}${element("SoftwareCompanyName", "CloudCore")}${element("SoftwareName", "SaskaitaGO")}${element(
    "SoftwareVersion",
    String(softwareVersion).slice(0, 24),
  )}${element("RegistrationNumber", registrationNumber)}${element("NumberOfParts", 1)}${element("PartNumber", "1")}<SelectionCriteria>${element(
    "SelectionStartDate",
    from,
  )}${element("SelectionEndDate", to)}</SelectionCriteria></FileDescription></Header>`;
  const body = selected.length ? `<SourceDocuments><SalesInvoices>${invoiceXml}</SalesInvoices></SourceDocuments>` : "";
  return {
    xml: `<?xml version="1.0" encoding="UTF-8"?>\n<iSAFFile xmlns="${NAMESPACE}" xmlns:xsi="${XSI}">${header}${body}</iSAFFile>\n`,
    summary: { count: selected.length, taxable: round(taxable), vat: round(vat) },
    warnings: [...new Set(warnings)],
  };
}
