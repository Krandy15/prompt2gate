"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs/promises");
const path = require("path");
const config = require("../../config");
const provider = require("../../lib/llm/provider");
const { runTool } = require("../../lib/eda/run");
const { withTmpDir } = require("../../lib/util/tmpdir");
const { testbenchLoop } = require("../../lib/pipeline/testbenchLoop");
const { parseVcd } = require("../../lib/parse/vcd");

const COUNTER = "module counter(input clk, input rst, output reg [3:0] count);\n  always @(posedge clk) if (rst) count <= 4'd0; else count <= count + 4'd1;\nendmodule\n";
const GOOD_TB = require("fs").readFileSync(path.join(__dirname, "../fixtures/counter_tb.v"), "utf8");
const WRONG_TB = GOOD_TB.replace("4'd10", "4'd11");               // expects the wrong value -> reports FAIL
const HANG_TB = "module tb; reg a=0; initial forever #1 a=~a; endmodule";
const reply = (tb) => ({ text: "```verilog\n" + tb + "\n```", model: "stub" });

const realCall = provider.callLLM;
test.afterEach(() => { provider.callLLM = realCall; });

const haveIcarus = async () => !(await runTool(config.tools.iverilog, ["-V"], { timeoutMs: 5000 })).missing;
const emit = () => { const logs = []; return { logs, log: (t, x) => logs.push(`${t}: ${x}`), stage() {} }; };

async function run(t, { first, repairs = [], testbench, repair = true }) {
  if (!(await haveIcarus())) return t.skip("iverilog not installed");
  const queue = [...repairs];
  let calls = 0;
  provider.callLLM = async () => { calls++; return reply(calls === 1 && first ? first : queue.shift() || first); };
  const e = emit();
  return withTmpDir(async (dir) => {
    await fs.writeFile(path.join(dir, "module.v"), COUNTER);
    const r = await testbenchLoop({ spec: "4-bit counter", verilog: COUNTER, workDir: dir, emit: e, testbench, repair });
    return { r, e, calls };
  });
}

test("good testbench: PASS, VCD captured with the counter signal", async (t) => {
  const out = await run(t, { first: GOOD_TB });
  if (!out) return;
  assert.strictEqual(out.r.status, "pass");
  assert.ok(out.r.passed && out.r.attempts === 1 && out.calls === 1);
  const wf = parseVcd(out.r.vcd);
  assert.ok(wf.signals.some((s) => s.name === "count" && s.width === 4 && s.transitions.length > 3));
});

test("wrong expectation is reported as FAIL after the repair budget, never hidden", async (t) => {
  const out = await run(t, { first: WRONG_TB });          // the repair returns the same wrong testbench
  if (!out) return;
  assert.strictEqual(out.r.status, "fail");
  assert.strictEqual(out.r.attempts, config.pipeline.maxTestbenchAttempts);
  assert.ok(/FAIL/.test(out.r.stdout));
});

test("failing testbench is repaired on the next attempt", async (t) => {
  const out = await run(t, { first: WRONG_TB, repairs: [GOOD_TB] });
  if (!out) return;
  assert.strictEqual(out.r.status, "pass");
  assert.strictEqual(out.r.attempts, 2);
  assert.ok(out.e.logs.some((l) => /Asking the LLM to repair/.test(l)));
});

test("security: a testbench using $system is rejected before it ever runs", async (t) => {
  const evil = GOOD_TB.replace("$finish;", '$system("echo hi"); $finish;');
  const out = await run(t, { first: evil, repairs: [GOOD_TB] });
  if (!out) return;
  assert.strictEqual(out.r.status, "pass");
  assert.ok(out.e.logs.some((l) => /security check/.test(l)));
});

test("testbench without $finish is killed by the timeout and reported", async (t) => {
  if (!(await haveIcarus())) return t.skip("iverilog not installed");
  const orig = config.timeouts.vvpMs;
  config.timeouts.vvpMs = 700;
  try {
    const out = await run(t, { testbench: HANG_TB, repair: false });
    assert.strictEqual(out.r.status, "fail");
    assert.ok(out.r.timedOut);
  } finally { config.timeouts.vvpMs = orig; }
});

test("VCD is found even when the testbench uses another $dumpfile name", async (t) => {
  const out = await run(t, { first: GOOD_TB.replace('"dump.vcd"', '"wave.vcd"') });
  if (!out) return;
  assert.strictEqual(out.r.status, "pass");
  assert.ok(out.r.vcd && out.r.vcd.includes("$var"));
});
