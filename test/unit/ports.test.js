"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { parseModule } = require("../../lib/parse/verilogPorts");

test("ANSI header with parameters and widths", () => {
  const m = parseModule("module alu #(parameter W = 8)(input clk, input rst_n, input [W-1:0] a, input [W-1:0] b, input [1:0] op, output reg [W:0] y, output zero);\n always @(posedge clk) y <= a + b;\nendmodule");
  assert.strictEqual(m.name, "alu");
  assert.deepStrictEqual(m.ports.map((p) => [p.name, p.dir, p.width]), [["clk", "input", 1], ["rst_n", "input", 1], ["a", "input", 8], ["b", "input", 8], ["op", "input", 2], ["y", "output", 9], ["zero", "output", 1]]);
  assert.ok(m.ports.find((p) => p.name === "y").isReg);
  assert.strictEqual(m.clock, "clk");
  assert.deepStrictEqual(m.reset, { name: "rst_n", activeLow: true });
  assert.ok(m.sequential);
});
test("grouped ANSI ports share direction and range", () => {
  const m = parseModule("module m(input [3:0] a, b, output y); endmodule");
  assert.deepStrictEqual(m.ports.map((p) => [p.name, p.dir, p.width]), [["a", "input", 4], ["b", "input", 4], ["y", "output", 1]]);
  assert.ok(!m.sequential);
});
test("non-ANSI style, comments ignored", () => {
  const m = parseModule("// module fake(input z);\nmodule cnt(clk, rst, q);\n input clk, rst;\n output [3:0] q;\n reg [3:0] q;\nendmodule");
  assert.strictEqual(m.name, "cnt");
  assert.deepStrictEqual(m.ports.map((p) => [p.name, p.dir, p.width]), [["clk", "input", 1], ["rst", "input", 1], ["q", "output", 4]]);
  assert.strictEqual(m.reset.activeLow, false);
});
test("non-module input returns null", () => {
  assert.strictEqual(parseModule("assign a = b;"), null);
  assert.strictEqual(parseModule(""), null);
});
