import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIsaf } from "../lib/isaf.mjs";
import { incomeJournal } from "../lib/iv-journal.mjs";
import { TAX_RULES, estimateIvTaxes, gpmForIncome } from "../lib/iv-tax.mjs";

const seller = { vatStatus: "standard", vatCode: "LT100000000001" };
const invoice = (overrides) => ({
  status: "issued",
  seller,
  client: { name: "PIRKĖJAS UAB", companyCode: "304565690", vatCode: "LT100013433510" },
  ...overrides,
});
const settings = { businessType: "uab", companyCode: "304565690" };

test("i.SAF lists VAT invoices and credit notes per tax code, without pro forma or cancelled ones", () => {
  const invoices = [
    invoice({
      id: "a",
      number: "SG-2026-0001",
      type: "vat",
      issueDate: "2026-10-03",
      items: [
        { vatRate: 21, lineTotal: 100, vatAmount: 21 },
        { vatRate: 21, lineTotal: 50, vatAmount: 10.5 },
        { vatRate: 12, lineTotal: 50, vatAmount: 6 },
      ],
    }),
    invoice({
      id: "b",
      number: "KR-2026-0001",
      type: "credit",
      issueDate: "2026-10-10",
      relatedInvoiceId: "a",
      items: [{ vatRate: 21, lineTotal: -50, vatAmount: -10.5 }],
    }),
    invoice({
      id: "c",
      number: "IS-2026-0001",
      type: "proforma",
      issueDate: "2026-10-11",
      items: [{ vatRate: 21, lineTotal: 10, vatAmount: 2.1 }],
    }),
    invoice({
      id: "d",
      number: "SG-2026-0002",
      type: "vat",
      status: "cancelled",
      issueDate: "2026-10-12",
      items: [{ vatRate: 21, lineTotal: 10, vatAmount: 2.1 }],
    }),
    invoice({
      id: "e",
      number: "SG-2026-0003",
      type: "vat",
      issueDate: "2026-11-01",
      items: [{ vatRate: 21, lineTotal: 10, vatAmount: 2.1 }],
    }),
  ];
  const { xml, summary, warnings } = buildIsaf({
    settings,
    invoices,
    from: "2026-10-01",
    to: "2026-10-31",
    createdAt: new Date(2026, 10, 1, 9, 5, 3),
  });
  assert.deepEqual(summary, { count: 2, taxable: 150, vat: 27 });
  assert.deepEqual(warnings, []);
  assert.match(xml, /<iSAFFile xmlns="http:\/\/www.vmi.lt\/cms\/imas\/isaf"/);
  assert.match(xml, /<FileDateCreated>2026-11-01T09:05:03<\/FileDateCreated><DataType>S<\/DataType>/);
  assert.match(xml, /<RegistrationNumber>304565690<\/RegistrationNumber><NumberOfParts>/);
  assert.match(
    xml,
    /<TaxableValue>150.00<\/TaxableValue><TaxCode>PVM1<\/TaxCode><TaxPercentage>21<\/TaxPercentage><Amount>31.50<\/Amount>/,
  );
  assert.match(xml, /<TaxCode>PVM58<\/TaxCode><TaxPercentage>12<\/TaxPercentage>/);
  assert.match(
    xml,
    /<InvoiceNo>KR-2026-0001<\/InvoiceNo>.*<InvoiceType>KS<\/InvoiceType>.*<ReferenceNo>SG-2026-0001<\/ReferenceNo><ReferenceDate>2026-10-03<\/ReferenceDate>.*<TaxableValue>-50.00<\/TaxableValue>/,
  );
  for (const excluded of ["IS-2026-0001", "SG-2026-0002", "SG-2026-0003"]) assert.doesNotMatch(xml, new RegExp(excluded));
});

test("i.SAF maps 0 % lines to the chosen basis and warns when it had to guess", () => {
  const invoices = [
    invoice({
      id: "a",
      number: "SG-1",
      type: "vat",
      issueDate: "2026-10-03",
      client: { name: "GmbH", vatCode: "DE123456789" },
      items: [{ vatRate: 0, lineTotal: 300, vatAmount: 0 }],
    }),
    invoice({
      id: "b",
      number: "SG-2",
      type: "vat",
      issueDate: "2026-10-04",
      client: { name: "Jonas" },
      zeroRateCode: "PVM12",
      items: [{ vatRate: 0, lineTotal: 80, vatAmount: 0 }],
    }),
  ];
  const { xml, warnings } = buildIsaf({ settings, invoices, from: "2026-10-01", to: "2026-10-31" });
  assert.match(
    xml,
    /<VATRegistrationNumber>DE123456789<\/VATRegistrationNumber><RegistrationNumber>ND<\/RegistrationNumber><Country>DE<\/Country>/,
  );
  assert.match(xml, /<TaxCode>PVM15<\/TaxCode><TaxPercentage xsi:nil="true"\/>/);
  assert.match(xml, /<VATRegistrationNumber>ND<\/VATRegistrationNumber>.*<Country>LT<\/Country><Name>Jonas<\/Name>/);
  assert.match(xml, /<TaxCode>PVM12<\/TaxCode><TaxPercentage>0<\/TaxPercentage>/);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /SG-1/);
});

test("i.SAF needs the seller's registration code and excludes invoices issued before VAT registration", () => {
  assert.throws(
    () => buildIsaf({ settings: { businessType: "individual" }, invoices: [], from: "2026-10-01", to: "2026-10-31" }),
    /asmens kodo/,
  );
  const beforeVat = invoice({ id: "a", number: "SG-1", type: "vat", issueDate: "2026-10-03", seller: { vatStatus: "none" }, items: [] });
  const { xml, summary } = buildIsaf({ settings, invoices: [beforeVat], from: "2026-10-01", to: "2026-10-31" });
  assert.equal(summary.count, 0);
  assert.doesNotMatch(xml, /SourceDocuments/);
});

test("GPM for individual activity follows the 2026 credit formula", () => {
  const rules = TAX_RULES[2026];
  assert.deepEqual(gpmForIncome(15_000, rules), { tax: 750, credit: 2250 });
  assert.deepEqual(gpmForIncome(30_000, rules), { tax: 3500, credit: 2500 });
  assert.equal(gpmForIncome(42_500, rules).tax, 8500);
  assert.equal(gpmForIncome(100_000, rules).tax, round(83_237.4 * 0.2 + (100_000 - 83_237.4) * 0.25));
});
const round = (value) => Math.round(value * 100) / 100;

test("tax estimate applies the flat deduction, contribution base and PSD minimum", () => {
  const flat = estimateIvTaxes({ income: 20_000, year: 2026 });
  assert.equal(flat.expenses, 6000);
  assert.equal(flat.contributionBase, 12_600);
  assert.equal(flat.vsd, 1577.52);
  assert.equal(flat.psd, 965.76);
  assert.equal(flat.psdMinimumApplied, true);
  assert.equal(flat.gpm, 700);
  const insured = estimateIvTaxes({ income: 20_000, year: 2026, insuredElsewhere: true });
  assert.equal(insured.psd, 879.48);
  const actual = estimateIvTaxes({ income: 20_000, year: 2026, expenseMode: "actual", actualExpenses: 2000, insuredElsewhere: true });
  assert.equal(actual.contributionBase, 16_200);
  assert.equal(actual.taxable, round(18_000 - actual.vsd - actual.psd));
  const capped = estimateIvTaxes({ income: 500_000, year: 2026 });
  assert.equal(capped.contributionBase, 99_422.45);
});

test("income journal records money received by payment date, without VAT", () => {
  const paid = (overrides) => ({ status: "paid", client: { name: "PIRKĖJAS" }, ...overrides });
  const journal = incomeJournal(
    [
      paid({
        id: "p",
        number: "IS-1",
        type: "proforma",
        issueDate: "2026-01-05",
        paidAt: "2026-01-08",
        subtotal: 100,
        vatAmount: 21,
        total: 121,
      }),
      paid({
        id: "v",
        number: "SG-1",
        type: "vat",
        issueDate: "2026-02-01",
        paidAt: "2026-02-10",
        subtotal: 200,
        vatAmount: 42,
        total: 242,
        advanceApplied: 121,
      }),
      paid({
        id: "c",
        number: "KR-1",
        type: "credit",
        issueDate: "2026-03-01",
        paidAt: "2026-03-02",
        subtotal: -50,
        vatAmount: -10.5,
        total: -60.5,
      }),
      { id: "u", number: "SG-2", type: "vat", status: "issued", issueDate: "2026-03-01", subtotal: 999, vatAmount: 0, total: 999 },
      paid({ id: "o", number: "SG-0", type: "vat", issueDate: "2025-12-20", paidAt: "2025-12-30", subtotal: 10, vatAmount: 0, total: 10 }),
    ],
    2026,
  );
  assert.deepEqual(
    journal.rows.map((row) => [row.date, row.income]),
    [
      ["2026-01-08", 100],
      ["2026-02-10", 100],
      ["2026-03-02", -50],
    ],
  );
  assert.equal(journal.totals.income, 150);
  assert.equal(journal.months[1].income, 100);
});
