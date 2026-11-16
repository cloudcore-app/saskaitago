// "Suma žodžiais" for Lithuanian invoices: 1234.56 → "Vienas tūkstantis du šimtai trisdešimt keturi eurai 56 ct".
const UNITS = ["", "vienas", "du", "trys", "keturi", "penki", "šeši", "septyni", "aštuoni", "devyni"];
const TEENS = [
  "dešimt",
  "vienuolika",
  "dvylika",
  "trylika",
  "keturiolika",
  "penkiolika",
  "šešiolika",
  "septyniolika",
  "aštuoniolika",
  "devyniolika",
];
const TENS = [
  "",
  "",
  "dvidešimt",
  "trisdešimt",
  "keturiasdešimt",
  "penkiasdešimt",
  "šešiasdešimt",
  "septyniasdešimt",
  "aštuoniasdešimt",
  "devyniasdešimt",
];
// [singular, plural, genitive plural]
const SCALES = [
  ["", "", ""],
  ["tūkstantis", "tūkstančiai", "tūkstančių"],
  ["milijonas", "milijonai", "milijonų"],
  ["milijardas", "milijardai", "milijardų"],
];
const EURO = ["euras", "eurai", "eurų"];

// Lithuanian nouns after a number: 1, 21, 31… singular; 10–20, 30, 40… genitive plural; otherwise plural.
export function nounForm(number, forms) {
  const lastTwo = number % 100;
  const last = number % 10;
  if (last === 0 || (lastTwo >= 10 && lastTwo <= 20)) return forms[2];
  if (last === 1) return forms[0];
  return forms[1];
}

function hundredsToWords(number) {
  const words = [];
  const hundreds = Math.floor(number / 100);
  const rest = number % 100;
  if (hundreds === 1) words.push("šimtas");
  else if (hundreds > 1) words.push(UNITS[hundreds], "šimtai");
  if (rest >= 10 && rest < 20) words.push(TEENS[rest - 10]);
  else {
    if (rest >= 20) words.push(TENS[Math.floor(rest / 10)]);
    if (rest % 10) words.push(UNITS[rest % 10]);
  }
  return words;
}

export function integerToWords(number) {
  if (!Number.isSafeInteger(number) || number < 0) throw new RangeError("Expected a non-negative integer");
  if (number === 0) return "nulis";
  const words = [];
  for (let scale = SCALES.length - 1; scale >= 0; scale -= 1) {
    const group = Math.floor(number / 1000 ** scale) % 1000;
    if (!group) continue;
    // "tūkstantis", not "vienas tūkstantis", matching "šimtas" for 100.
    if (!(scale > 0 && group === 1)) words.push(...hundredsToWords(group));
    if (scale > 0) words.push(nounForm(group, SCALES[scale]));
  }
  return words.join(" ");
}

export function amountInWords(value) {
  const cents = Math.round(Math.abs(Number(value) || 0) * 100);
  const euros = Math.floor(cents / 100);
  const text = `${integerToWords(euros)} ${nounForm(euros, EURO)} ${String(cents % 100).padStart(2, "0")} ct`;
  const signed = Number(value) < 0 && cents ? `minus ${text}` : text;
  return signed.charAt(0).toLocaleUpperCase("lt-LT") + signed.slice(1);
}
