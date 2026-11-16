// EPC QR code (EPC069-12, version 002) for a SEPA credit transfer: banking apps that support it fill in the
// recipient, IBAN, amount and payment purpose from the code printed on the invoice.
import QRCode from "qrcode";

const MAX_PAYLOAD_BYTES = 331;

export function normalizeIban(value) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

// ISO 13616 check: move the first four characters to the end, map letters to 10–35 and take mod 97.
export function isValidIban(value) {
  const iban = normalizeIban(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const digits = `${iban.slice(4)}${iban.slice(0, 4)}`.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}

const clean = (value, max) =>
  String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, max);

/** Returns the EPC payload, or "" when the details cannot form a valid code. */
export function epcPayload({ name, iban, bic = "", amount, remittance = "" }) {
  const beneficiary = clean(name, 70);
  const account = normalizeIban(iban);
  const cents = Math.round(Number(amount) * 100);
  if (!beneficiary || !isValidIban(account) || !Number.isFinite(cents) || cents < 1 || cents > 99_999_999_999) return "";
  const swift = String(bic ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();
  const head = [
    "BCD",
    "002",
    "1", // UTF-8
    "SCT",
    /^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(swift) ? swift : "", // BIC is optional within the EEA in version 002
    beneficiary,
    account,
    `EUR${(cents / 100).toFixed(2)}`,
    "", // purpose code
    "", // structured creditor reference; the unstructured text below is used instead
  ].join("\n");
  // Lithuanian letters take two bytes, so shorten the payment purpose rather than drop the code when over the limit.
  let purpose = clean(remittance, 140);
  while (purpose && Buffer.byteLength(`${head}\n${purpose}`, "utf8") > MAX_PAYLOAD_BYTES) purpose = purpose.slice(0, -1).trimEnd();
  const payload = `${head}\n${purpose}`;
  return Buffer.byteLength(payload, "utf8") <= MAX_PAYLOAD_BYTES ? payload : "";
}

export async function epcQrSvg(details) {
  const payload = epcPayload(details);
  if (!payload) return "";
  // Level M is what the EPC guideline requires.
  return QRCode.toString(payload, { type: "svg", errorCorrectionLevel: "M", margin: 0, color: { dark: "#1d2027", light: "#ffffff" } });
}
