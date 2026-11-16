import { test } from "node:test";
import assert from "node:assert/strict";
import { epcPayload, epcQrSvg, isValidIban } from "../lib/epc-qr.mjs";

const details = {
  name: "Jonas Jonaitis",
  iban: "LT12 1000 0111 0100 1000",
  bic: "habalt22",
  amount: 1234.5,
  remittance: "SF Nr. SG-2026-0001",
};

test("IBAN checksum is verified", () => {
  assert.equal(isValidIban("LT121000011101001000"), true);
  assert.equal(isValidIban("lt12 1000 0111 0100 1000"), true);
  assert.equal(isValidIban("LT121000011101001001"), false);
  assert.equal(isValidIban("DE89370400440532013000"), true);
  assert.equal(isValidIban(""), false);
});

test("payload follows EPC069-12 version 002 line by line", () => {
  assert.equal(
    epcPayload(details),
    ["BCD", "002", "1", "SCT", "HABALT22", "Jonas Jonaitis", "LT121000011101001000", "EUR1234.50", "", "", "SF Nr. SG-2026-0001"].join(
      "\n",
    ),
  );
});

test("BIC is optional and invalid BIC values are left out", () => {
  assert.equal(epcPayload({ ...details, bic: "" }).split("\n")[4], "");
  assert.equal(epcPayload({ ...details, bic: "not a bic" }).split("\n")[4], "");
});

test("no code is produced for details a bank would reject", () => {
  assert.equal(epcPayload({ ...details, iban: "LT121000011101001001" }), "");
  assert.equal(epcPayload({ ...details, name: " " }), "");
  assert.equal(epcPayload({ ...details, amount: 0 }), "");
  assert.equal(epcPayload({ ...details, amount: -5 }), "");
  assert.equal(epcPayload({ ...details, amount: 1_000_000_000 }), "");
});

test("long names and purposes are cut to the EPC limits and line breaks removed", () => {
  const lines = epcPayload({ ...details, name: "B".repeat(100), remittance: "a\nb".repeat(100) }).split("\n");
  assert.equal(lines.length, 11);
  assert.equal(lines[5].length, 70);
  assert.equal(lines[10].length, 140);
  assert.doesNotMatch(lines[10], /\n/);
});

test("the purpose is shortened to keep two-byte Lithuanian text within 331 bytes", () => {
  const payload = epcPayload({ ...details, name: "Ą".repeat(70), remittance: "Ž".repeat(140) });
  assert.ok(payload);
  assert.ok(Buffer.byteLength(payload, "utf8") <= 331);
  assert.equal(payload.split("\n")[5], "Ą".repeat(70));
});

test("SVG is rendered only for a valid payload", async () => {
  assert.match(await epcQrSvg(details), /^<svg/);
  assert.equal(await epcQrSvg({ ...details, iban: "bad" }), "");
});
