// Estimate of GPM, VSD and PSD for individual activity under a certificate (IV pagal pažymą).
// Rules for 2026 income: GPMĮ as amended by law XV-343 (art. 6, 18²) and Sodra rates for self-employed persons.
// This is an estimate for planning; the declaration (GPM311) and Sodra calculations are authoritative.
export const TAX_RULES = {
  2026: {
    year: 2026,
    flatExpenseRate: 0.3,
    gpmRate: 0.2,
    creditFullUntil: 20_000, // taxable income up to which the effective rate is 5 %
    creditEndsAt: 42_500,
    creditBaseRate: 0.15,
    creditSlope: 2 / 300_000,
    progressive: [
      { upTo: 83_237.4, rate: 0.2 }, // 36 VDU
      { upTo: 138_729, rate: 0.25 }, // 60 VDU
      { upTo: Infinity, rate: 0.32 },
    ],
    contributionBaseShare: 0.9,
    contributionCap: 99_422.45, // 43 VDU, annual
    vsdRate: 0.1252,
    vsdRateWithPension: 0.1552,
    psdRate: 0.0698,
    psdMonthlyMinimum: 80.48, // 6.98 % of the 1 153 € minimum monthly wage
  },
};

const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export function gpmForIncome(taxable, rules) {
  if (taxable <= 0) return { tax: 0, credit: 0 };
  if (taxable <= rules.creditEndsAt) {
    const creditRate =
      taxable <= rules.creditFullUntil
        ? rules.creditBaseRate
        : rules.creditBaseRate - rules.creditSlope * (taxable - rules.creditFullUntil);
    const credit = taxable * creditRate;
    return { tax: round(taxable * rules.gpmRate - credit), credit: round(credit) };
  }
  // Above the credit range the income is taxed at the progressive rates (other annual income is not included here).
  let tax = 0;
  let lower = 0;
  for (const bracket of rules.progressive) {
    if (taxable > lower) tax += (Math.min(taxable, bracket.upTo) - lower) * bracket.rate;
    lower = bracket.upTo;
  }
  return { tax: round(tax), credit: 0 };
}

/**
 * @param {object} input
 * @param {number} input.income        IV income for the year, without VAT
 * @param {number} input.year
 * @param {"flat"|"actual"} input.expenseMode
 * @param {number} [input.actualExpenses]
 * @param {boolean} [input.pensionAccumulation]  pays the additional 3 % pension contribution
 * @param {boolean} [input.insuredElsewhere]     health insured as an employee, so no monthly PSD minimum
 * @param {number} [input.activeMonths]          months with activity, for the PSD minimum
 */
export function estimateIvTaxes({
  income,
  year,
  expenseMode = "flat",
  actualExpenses = 0,
  pensionAccumulation = false,
  insuredElsewhere = false,
  activeMonths = 12,
}) {
  const rules = TAX_RULES[year] || TAX_RULES[2026];
  const cleanIncome = Math.max(0, Number(income) || 0);
  const expenses = expenseMode === "actual" ? Math.max(0, Number(actualExpenses) || 0) : round(cleanIncome * rules.flatExpenseRate);
  const profit = Math.max(0, cleanIncome - expenses);

  // Contributions are calculated from 90 % of the profit before contributions are deducted.
  const contributionBase = round(Math.min(profit * rules.contributionBaseShare, rules.contributionCap));
  const vsd = round(contributionBase * (pensionAccumulation ? rules.vsdRateWithPension : rules.vsdRate));
  const psdCalculated = contributionBase * rules.psdRate;
  const months = Math.min(12, Math.max(0, Math.round(Number(activeMonths) || 0)));
  const psdMinimum = insuredElsewhere ? 0 : round(rules.psdMonthlyMinimum * months);
  const psd = round(Math.max(psdCalculated, psdMinimum));

  // Paid VSD and PSD reduce taxable income only when actual expenses are deducted; the 30 % flat
  // deduction already stands in for all expenses.
  const contributionsDeducted = expenseMode === "actual" ? round(vsd + psd) : 0;
  const taxable = round(Math.max(0, profit - contributionsDeducted));
  const { tax: gpm, credit } = gpmForIncome(taxable, rules);
  const total = round(gpm + vsd + psd);
  return {
    year: rules.year,
    rulesYear: rules.year,
    income: round(cleanIncome),
    expenses: round(expenses),
    profit: round(profit),
    contributionBase,
    vsd,
    vsdRate: pensionAccumulation ? rules.vsdRateWithPension : rules.vsdRate,
    psd,
    psdMinimumApplied: psdMinimum > psdCalculated,
    contributionsDeducted,
    taxable,
    gpm,
    gpmCredit: credit,
    effectiveGpmRate: taxable ? round((gpm / taxable) * 100) : 0,
    total,
    // What stays after taxes; flat expenses are only a deduction, so they are not subtracted here.
    netIncome: round(cleanIncome - (expenseMode === "actual" ? expenses : 0) - total),
    beyondCreditRange: taxable > rules.creditEndsAt,
  };
}
