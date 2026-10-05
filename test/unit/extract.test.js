"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { extractVerilog, hasModule } = require("../../lib/llm/extract");

const MOD = "module a(input x, output y);\n  assign y = x;\nendmodule";

test("fenced verilog block", () => {
  assert.strictEqual(extractVerilog("```verilog\n" + MOD + "\n```"), MOD);
});
test("fence with systemverilog / no tag / CRLF", () => {
  assert.strictEqual(extractVerilog("```systemverilog\n" + MOD + "\n```"), MOD);
  assert.strictEqual(extractVerilog("```\n" + MOD + "\n```"), MOD);
  assert.strictEqual(extractVerilog("```verilog\r\n" + MOD + "\r\n```"), MOD);
});
test("prose around the fence is dropped", () => {
  assert.strictEqual(extractVerilog("Sure! Here you go:\n```verilog\n" + MOD + "\n```\nHope it helps."), MOD);
});
test("unclosed fence (truncated reply)", () => {
  const out = extractVerilog("```verilog\nmodule a(input x);\n  assign");
  assert.ok(out.startsWith("module a"));
});
test("multiple fences: skips non-verilog, prefers the one with a module", () => {
  const raw = "```bash\niverilog x.v\n```\n```verilog\n// notes only\n```\n```verilog\n" + MOD + "\n```";
  assert.strictEqual(extractVerilog(raw), MOD);
});
test("unfenced reply: chatter before module and after endmodule is trimmed", () => {
  assert.strictEqual(extractVerilog("Here is the design:\n" + MOD + "\nLet me know!"), MOD);
});
test("unfenced reply keeps a leading `timescale", () => {
  const src = "`timescale 1ns/1ps\n" + MOD;
  assert.strictEqual(extractVerilog("Intro text\n" + src + "\nbye"), src);
});
test("empty / nullish input", () => {
  assert.strictEqual(extractVerilog(""), "");
  assert.strictEqual(extractVerilog(undefined), "");
});
test("hasModule", () => {
  assert.ok(hasModule(MOD));
  assert.ok(!hasModule("module a(input x);"));
});
