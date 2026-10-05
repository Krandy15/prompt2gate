"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { parseYosysStats } = require("../../lib/parse/yosysStats");

test("classic layout from fixture", () => {
  const s = parseYosysStats(fs.readFileSync(path.join(__dirname, "../fixtures/yosys_stat.txt"), "utf8"));
  assert.strictEqual(s.cells, 14);
  assert.strictEqual(s.wires, 8);
  assert.strictEqual(s.wireBits, 20);
  assert.strictEqual(s.flipFlops, 4);
  assert.strictEqual(s.muxes, 2);
  assert.strictEqual(s.gates, 8); // 3 AND + 1 NOT + 4 XOR
  assert.strictEqual(s.latches, 0);
});
test("count-first layout and design-hierarchy section", () => {
  const txt = "=== sub ===\n   Number of cells: 1\n     $_AND_ 1\n=== design hierarchy ===\n   12 wires\n   30 wire bits\n   9 cells\n     5   $_DFFE_PP_\n     3   $_OR_\n     1   $_DLATCH_N_\n";
  const s = parseYosysStats(txt);
  assert.deepStrictEqual([s.cells, s.wires, s.wireBits, s.flipFlops, s.gates, s.latches], [9, 12, 30, 5, 3, 1]);
});
test("garbage input yields zeros, not a throw", () => {
  const s = parseYosysStats("nothing useful");
  assert.deepStrictEqual([s.cells, s.gates, s.flipFlops], [0, 0, 0]);
});
