import { test } from "node:test";
import assert from "node:assert/strict";
import { checkVatCode, lookupCompany, parseVatCode } from "../lib/lookup.mjs";

const respond = (routes) => async (url) => {
  const match = Object.entries(routes).find(([fragment]) => url.includes(fragment));
  if (!match) throw new Error(`Unexpected request ${url}`);
  return { ok: true, status: 200, json: async () => match[1] };
};

test("company lookup combines the legal entity and taxpayer registers", async () => {
  const fetchImpl = respond({
    JuridinisAsmuo: { _data: [{ ja_kodas: 304565690, ja_pavadinimas: "UAB Pavyzdys", isreg_data: null }] },
    MokesciuMoketojas: {
      _data: [
        { pvm_kodas_pref: "LT", pvm_kodas: "100000000001", pvm_isregistruota: "2020-01-01" },
        { pvm_kodas_pref: "LT", pvm_kodas: "100013433510", pvm_isregistruota: null },
      ],
    },
  });
  assert.deepEqual(await lookupCompany(" 304 565 690 ", fetchImpl), {
    companyCode: "304565690",
    name: "UAB Pavyzdys",
    vatCode: "LT100013433510",
    deregistered: false,
  });
});

test("company lookup rejects malformed codes without a request and reports unknown codes", async () => {
  await assert.rejects(
    lookupCompany("12ab", () => assert.fail("no request expected")),
    { status: 400 },
  );
  const fetchImpl = respond({ JuridinisAsmuo: { _data: [] }, MokesciuMoketojas: { _data: [] } });
  await assert.rejects(lookupCompany("123456789", fetchImpl), { status: 404 });
});

test("VAT codes are normalized to an EU prefix", () => {
  assert.deepEqual(parseVatCode("lt 100013433510"), { country: "LT", number: "100013433510" });
  assert.deepEqual(parseVatCode("100013433510"), { country: "LT", number: "100013433510" });
  assert.deepEqual(parseVatCode("GR123456789"), { country: "EL", number: "123456789" });
  assert.throws(() => parseVatCode("US123456"), { status: 400 });
});

test("VIES placeholders are dropped from the result", async () => {
  let requested;
  const fetchImpl = async (url) => {
    requested = url;
    return { ok: true, json: async () => ({ isValid: true, userError: "VALID", name: "UAB Pavyzdys", address: "N/A" }) };
  };
  const result = await checkVatCode("LT100013433510", fetchImpl);
  assert.match(requested, /\/ms\/LT\/vat\/100013433510$/);
  assert.equal(result.valid, true);
  assert.equal(result.name, "UAB Pavyzdys");
  assert.equal(result.address, "");
});

test("VIES outages are reported instead of claiming the code is invalid", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ isValid: false, userError: "MS_UNAVAILABLE" }) });
  await assert.rejects(checkVatCode("DE123456789", fetchImpl), { status: 503 });
});
