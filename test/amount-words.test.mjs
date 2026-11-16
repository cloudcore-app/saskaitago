import { test } from "node:test";
import assert from "node:assert/strict";
import { amountInWords, integerToWords } from "../lib/amount-words.mjs";

test("integers use Lithuanian number words and noun forms", () => {
  assert.equal(integerToWords(0), "nulis");
  assert.equal(integerToWords(15), "penkiolika");
  assert.equal(integerToWords(101), "šimtas vienas");
  assert.equal(integerToWords(1000), "tūkstantis");
  assert.equal(integerToWords(2011), "du tūkstančiai vienuolika");
  assert.equal(integerToWords(11000), "vienuolika tūkstančių");
  assert.equal(integerToWords(21000), "dvidešimt vienas tūkstantis");
  assert.equal(integerToWords(1234567), "milijonas du šimtai trisdešimt keturi tūkstančiai penki šimtai šešiasdešimt septyni");
});

test("amounts name euros with the correct case and cents as digits", () => {
  assert.equal(amountInWords(1), "Vienas euras 00 ct");
  assert.equal(amountInWords(2.5), "Du eurai 50 ct");
  assert.equal(amountInWords(12), "Dvylika eurų 00 ct");
  assert.equal(amountInWords(121), "Šimtas dvidešimt vienas euras 00 ct");
  assert.equal(amountInWords(0.07), "Nulis eurų 07 ct");
  assert.equal(amountInWords(1210.99), "Tūkstantis du šimtai dešimt eurų 99 ct");
  assert.equal(amountInWords(-60.5), "Minus šešiasdešimt eurų 50 ct");
});

test("floating point noise does not change the cents", () => {
  assert.equal(amountInWords(0.1 + 0.2), "Nulis eurų 30 ct");
  assert.equal(amountInWords(1.005 * 1000), "Tūkstantis penki eurai 00 ct");
});
