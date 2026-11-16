// Company and VAT code lookups. These are the only outgoing requests besides the update check, and they run only
// when the user presses a lookup button. Only the code being looked up is sent.
const OPEN_DATA = "https://get.data.gov.lt/datasets/gov";
const VIES = "https://ec.europa.eu/taxation_customs/vies/rest-api/ms";
const TIMEOUT_MS = 8000;
const EU_PREFIXES = new Set([
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

const lookupError = (status, message) => Object.assign(new Error(message), { status });

async function getJson(url, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw lookupError(502, "Nepavyko prisijungti prie registro. Patikrinkite interneto ryšį.");
  }
  if (!response.ok) throw lookupError(502, `Registras atsakė klaida (${response.status})`);
  return response.json();
}

export function normalizeCompanyCode(value) {
  const code = String(value ?? "").replace(/\s+/g, "");
  if (!/^\d{7,9}$/.test(code)) throw lookupError(400, "Įmonės kodas turi būti iš 7–9 skaitmenų");
  return code;
}

export function parseVatCode(value) {
  const compact = String(value ?? "")
    .toUpperCase()
    .replace(/[\s.-]+/g, "");
  const match = compact.match(/^([A-Z]{2})?([0-9A-Z+*]{2,14})$/);
  if (!match) throw lookupError(400, "Neteisingas PVM kodo formatas");
  const country = match[1] === "GR" ? "EL" : match[1] || "LT";
  if (!EU_PREFIXES.has(country)) throw lookupError(400, "VIES tikrina tik ES šalių PVM kodus");
  return { country, number: match[2] };
}

// Name from the Register of Legal Entities, VAT code from the VMI taxpayer register (both open data).
export async function lookupCompany(rawCode, fetchImpl = fetch) {
  const code = normalizeCompanyCode(rawCode);
  const [registry, taxpayer] = await Promise.all([
    getJson(`${OPEN_DATA}/rc/jar/iregistruoti/JuridinisAsmuo?ja_kodas=${code}&limit(1)`, fetchImpl),
    getJson(
      `${OPEN_DATA}/vmi/mm_registras/MokesciuMoketojas?ja_kodas=${code}&select(pavadinimas,pvm_kodas_pref,pvm_kodas,pvm_isregistruota)&limit(20)`,
      fetchImpl,
    ).catch(() => ({ _data: [] })),
  ]);
  const company = registry?._data?.[0];
  const taxRows = taxpayer?._data || [];
  const name = company?.ja_pavadinimas || taxRows[0]?.pavadinimas || "";
  if (!name) throw lookupError(404, "Įmonė su tokiu kodu registre nerasta");
  const vatRow = taxRows.find((row) => row.pvm_kodas && !row.pvm_isregistruota);
  return {
    companyCode: code,
    name,
    vatCode: vatRow ? `${vatRow.pvm_kodas_pref || "LT"}${vatRow.pvm_kodas}` : "",
    deregistered: Boolean(company?.isreg_data),
  };
}

const viesValue = (value) => {
  const clean = String(value ?? "")
    .replace(/\s*\n\s*/g, ", ")
    .trim();
  return /^(---|N\/A)?$/i.test(clean) ? "" : clean;
};

export async function checkVatCode(rawCode, fetchImpl = fetch) {
  const { country, number } = parseVatCode(rawCode);
  const result = await getJson(`${VIES}/${country}/vat/${encodeURIComponent(number)}`, fetchImpl);
  if (result.userError && !["VALID", "INVALID"].includes(result.userError))
    throw lookupError(503, "VIES šiuo metu nepasiekiama, bandykite vėliau");
  return {
    vatCode: `${country}${number}`,
    valid: Boolean(result.isValid),
    name: viesValue(result.name),
    address: viesValue(result.address),
    checkedAt: result.requestDate || new Date().toISOString(),
  };
}
