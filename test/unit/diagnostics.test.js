"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { parseDiagnostics, summarize } = require("../../lib/parse/diagnostics");

test("iverilog errors/warnings with line numbers, incl. Windows drive paths", () => {
  const out = [
    "module.v:2: syntax error",                       // no severity word -> ignored
    "module.v:5: error: Unable to bind wire/reg/memory `foo' in `top'",
    "C:\\tmp\\p2g\\module.v:9: warning: implicit definition of wire 'bar'.",
    "module.v:12: warning: Port 1 (a) of sub expects 8 bits, got 4.",
    "2 error(s) during elaboration.",
  ].join("\n");
  const f = parseDiagnostics(out);
  assert.deepStrictEqual(f.map((x) => [x.severity, x.line, x.code]), [["error", 5, "implicit-net"], ["warning", 9, "implicit-net"], ["warning", 12, "width"]]);
  assert.deepStrictEqual(summarize(f), { errors: 1, warnings: 2 });
});
test("yosys latch warning and ERROR", () => {
  const f = parseDiagnostics("Warning: Latch inferred for signal `\\m.q' from always_comb process.\nERROR: syntax error at line 3", { tool: "yosys" });
  assert.strictEqual(f[0].code, "latch");
  assert.strictEqual(f[1].severity, "error");
  assert.strictEqual(f[0].tool, "yosys");
});
test("duplicates collapsed, empty input safe", () => {
  assert.strictEqual(parseDiagnostics("a.v:1: warning: x\na.v:1: warning: x").length, 1);
  assert.deepStrictEqual(parseDiagnostics(""), []);
});
