"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { parseVcd } = require("../../lib/parse/vcd");

const vcd = fs.readFileSync(path.join(__dirname, "../fixtures/counter.vcd"), "utf8");

test("header: timescale, end time, signals with scope and width", () => {
  const r = parseVcd(vcd);
  assert.strictEqual(r.timescale, "1ns");
  assert.strictEqual(r.endTime, 30);
  assert.deepStrictEqual(r.signals.map((s) => [s.name, s.scope, s.width]), [["clk", "tb", 1], ["rst", "tb", 1], ["count", "tb", 4]]);
});
test("scalar transitions, duplicates dropped", () => {
  const clk = parseVcd(vcd).signals.find((s) => s.name === "clk");
  assert.deepStrictEqual(clk.transitions.map((x) => [x.t, x.v]), [[0, "0"], [5, "1"], [10, "0"], [15, "1"]]); // #25 repeat of "1" dropped
});
test("vectors are zero-padded; x extends to full width", () => {
  const c = parseVcd(vcd).signals.find((s) => s.name === "count");
  assert.deepStrictEqual(c.transitions.map((x) => [x.t, x.v]), [[0, "0000"], [15, "0001"], [25, "0010"], [30, "xxxx"]]);
});
test("transition cap flags truncation", () => {
  const big = "$var wire 1 ! a $end $enddefinitions $end " + Array.from({ length: 50 }, (_, k) => `#${k}\n${k % 2}!`).join("\n");
  const s = parseVcd(big, { maxTransitions: 10 }).signals[0];
  assert.strictEqual(s.transitions.length, 10);
  assert.ok(s.truncated);
});
test("aliased ids produce one signal per name; empty input is safe", () => {
  const r = parseVcd("$var wire 1 ! a $end $var wire 1 ! b $end $enddefinitions $end #0 1!");
  assert.deepStrictEqual(r.signals.map((s) => s.transitions[0].v), ["1", "1"]);
  assert.deepStrictEqual(parseVcd("").signals, []);
});
