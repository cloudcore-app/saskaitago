// Income side of the individual activity income and expense journal (cash basis): income is recorded on the
// date the money was received, without VAT. Pro forma invoices count when paid (an advance is money received);
// a VAT invoice then counts only the part not covered by the applied advance. Paid credit notes are refunds.
const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const DOCUMENT_NAMES = { proforma: "Išankstinė sąskaita", vat: "Sąskaita faktūra", credit: "Kreditinė sąskaita" };

function receivedAmounts(invoice) {
  const total = Number(invoice.total) || 0;
  const received = total - (invoice.type === "vat" ? Number(invoice.advanceApplied) || 0 : 0);
  // Received money is split into net and VAT in the same proportion as the invoice totals.
  const share = total ? received / total : 0;
  return {
    received: round(received),
    net: round((Number(invoice.subtotal) || 0) * share),
    vat: round((Number(invoice.vatAmount) || 0) * share),
  };
}

export function incomeJournal(invoices, year) {
  const prefix = `${year}-`;
  const rows = invoices
    .filter((invoice) => invoice.status === "paid" && invoice.paidAt?.startsWith(prefix))
    .map((invoice) => ({ invoice, ...receivedAmounts(invoice) }))
    .filter((row) => row.received !== 0)
    .sort((a, b) => a.invoice.paidAt.localeCompare(b.invoice.paidAt) || a.invoice.number.localeCompare(b.invoice.number))
    .map(({ invoice, received, net, vat }, index) => ({
      no: index + 1,
      date: invoice.paidAt,
      document: `${invoice.documentTitle || DOCUMENT_NAMES[invoice.type] || "Sąskaita"} Nr. ${invoice.number}, ${invoice.issueDate}`,
      operation: `${invoice.type === "credit" ? "Grąžinta pirkėjui" : "Gauta iš pirkėjo"}: ${invoice.client?.name || ""}`.trim(),
      invoiceId: invoice.id,
      received,
      vat,
      income: net,
    }));
  const months = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, income: 0 }));
  for (const row of rows) months[Number(row.date.slice(5, 7)) - 1].income += row.income;
  for (const month of months) month.income = round(month.income);
  return {
    year: Number(year),
    rows,
    months,
    totals: {
      received: round(rows.reduce((sum, row) => sum + row.received, 0)),
      vat: round(rows.reduce((sum, row) => sum + row.vat, 0)),
      income: round(rows.reduce((sum, row) => sum + row.income, 0)),
    },
  };
}
