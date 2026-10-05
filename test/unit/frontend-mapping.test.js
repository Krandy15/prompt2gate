"use strict";
// Loads the real public/js/state/useSynthesis.js with a tiny React stub and feeds it backend-style
// NDJSON events: checks the 7-stage tracker mapping and the result adapter for the Testbench/Waveform tabs.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const pub = path.join(__dirname, "../../public/js");
const plain = (x) => JSON.parse(JSON.stringify(x)); // values built inside the vm have another realm's prototypes

function load(events) {
  const boxes = [];
  const React = {
    useState(init) { const b = { v: init }; boxes.push(b); return [b.v, (x) => { b.v = typeof x === "function" ? x(b.v) : x; }]; },
    useRef(init) { return { current: init }; },
    useCallback: (f) => f,
    useEffect() {},
  };
  const window = { React, P2G_API: { synthesizeStream: async (_p, onEvent) => events.forEach(onEvent) } };
  const ctx = vm.createContext({ window, React, URLSearchParams, location: { search: "" }, AbortController, setTimeout, clearTimeout, Object, Math, String, Date, console });
  vm.runInContext(fs.readFileSync(path.join(pub, "config.js"), "utf8"), ctx);
  ctx.window.P2G_CONFIG.USE_MOCK = false;
  vm.runInContext(fs.readFileSync(path.join(pub, "state/useSynthesis.js"), "utf8"), ctx);
  const hook = ctx.window.useSynthesis();
  const [status, stages, logs, result, error] = boxes;
  return { hook, get: () => ({ status: status.v, stages: stages.v, logs: logs.v, result: result.v, error: error.v }) };
}

const log = (type, text) => ({ type: "log", log: { type, text } });
const baseLogs = [
  log("info", "[PROMPT2GATE] Ingesting natural language RTL specification..."),
  log("info", "[LLM] Invoking gemini-3.8-flash via gemini..."),
  log("info", "[COMPILER - Attempt 1] Running iverilog -Wall -g2001 ..."),
  log("success", "[COMPILER - Attempt 1] PASSED. Zero errors, zero warnings."),
  log("info", "[TESTBENCH] Generating self-checking testbench..."),
  log("info", "[SIMULATION - Attempt 1] Running vvp..."),
];
const tail = [
  log("info", "[YOSYS] Elaborating netlist (proc; opt) for schematic view..."),
  log("success", "[YOSYS] Netlist rendered from your generated module."),
];
const wave = { timescale: "1ns", endTime: 30, signals: [
  { name: "clk", scope: "tb", width: 1, transitions: [{ t: 0, v: "0" }, { t: 5, v: "1" }] },
  { name: "count", scope: "tb", width: 4, transitions: [{ t: 0, v: "0000" }, { t: 15, v: "0101" }, { t: 25, v: "xxxx" }] },
] };
const done = (extra) => ({ type: "done", result: { success: true, verilog: "module m; endmodule", attempts: 1, stats: null, ...extra } });

test("stage list has the two new stages in order", () => {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(pub, "config.js"), "utf8"), ctx);
  assert.deepStrictEqual(plain(ctx.window.P2G_STAGES.map((st) => st.id)),
    ["ingest", "rtl", "compile", "testbench", "simulate", "synthesize", "ready"]);
});

test("passing testbench: every stage succeeds, waveform + testbench result adapted", async () => {
  const sim = { status: "pass", passed: true, stdout: "PASS\n$finish called at 40 (1ns)", log: "" };
  const { hook, get } = load([...baseLogs, log("success", "[SIMULATION - Attempt 1] PASS: self-checking testbench passed."), ...tail,
    done({ verified: true, testbench: "module tb; endmodule", simulation: sim, waveform: wave })]);
  await hook.run("counter");
  const s = get();
  assert.strictEqual(s.status, "success");
  assert.deepStrictEqual(plain(Object.values(s.stages)), Array(7).fill("success"));
  assert.strictEqual(s.result.testbench, "module tb; endmodule");
  assert.strictEqual(s.result.testbenchResult.status, "PASS");
  assert.deepStrictEqual(plain(s.result.testbenchResult.log), ["PASS", "$finish called at 40 (1ns)"]);
  const count = s.result.waveform.signals.find((x) => x.name === "count");
  assert.deepStrictEqual(plain(count.changes), [[0, 0], [15, 5], [25, "x"]]);   // binary -> number, x preserved
});

test("failing testbench: build still succeeds, simulate + ready are flagged", async () => {
  const sim = { status: "fail", passed: false, stdout: "FAIL: count=3 expected 4", log: "" };
  const { hook, get } = load([...baseLogs,
    log("error", "[SIMULATION - Attempt 1] FAILED:\nFAIL: count=3 expected 4"),
    log("warn", "[TESTBENCH] Max attempts reached; reporting FAIL."), ...tail,
    done({ verified: false, testbench: "module tb; endmodule", simulation: sim, waveform: wave })]);
  await hook.run("counter");
  const s = get();
  assert.strictEqual(s.status, "success");                         // results still shown
  assert.strictEqual(s.stages.compile, "success");
  assert.strictEqual(s.stages.simulate, "error");
  assert.strictEqual(s.stages.synthesize, "success");
  assert.strictEqual(s.stages.ready, "error");
  assert.strictEqual(s.result.testbenchResult.status, "FAIL");
  assert.ok(s.logs.some((l) => l.type === "warn" && /testbench did not pass/.test(l.text)));
});

test("no testbench in the result leaves the tabs empty without breaking", async () => {
  const { hook, get } = load([...baseLogs.slice(0, 4), ...tail, done({ verified: null })]);
  await hook.run("counter");
  const s = get();
  assert.strictEqual(s.status, "success");
  assert.strictEqual(s.result.testbench, null);
  assert.strictEqual(s.result.waveform, null);
  assert.strictEqual(s.result.testbenchResult, null);
});

test("ps-tick waveforms are shown in ns when every timestamp divides evenly (lossless)", async () => {
  const ps = { timescale: "1ps", endTime: 200000, signals: [
    { name: "clk", scope: "tb", width: 1, transitions: [{ t: 0, v: "0" }, { t: 5000, v: "1" }, { t: 10000, v: "0" }] },
    { name: "q", scope: "tb", width: 4, transitions: [{ t: 0, v: "xxxx" }, { t: 15000, v: "0001" }] },
  ] };
  const { hook, get } = load([...baseLogs, ...tail, done({ verified: true, testbench: "module tb; endmodule", simulation: { status: "pass", passed: true, stdout: "PASS" }, waveform: ps })]);
  await hook.run("counter");
  const wf = get().result.waveform;
  assert.strictEqual(wf.timescale, "1ns");
  assert.strictEqual(wf.endTime, 200);
  assert.deepStrictEqual(plain(wf.signals[0].changes), [[0, 0], [5, 1], [10, 0]]);
  assert.deepStrictEqual(plain(wf.signals[1].changes), [[0, "x"], [15, 1]]);
});

test("ps waveforms with sub-ns events keep their original unit (no precision loss)", async () => {
  const ps = { timescale: "1ps", endTime: 12500, signals: [{ name: "a", scope: "tb", width: 1, transitions: [{ t: 0, v: "0" }, { t: 2500, v: "1" }] }] };
  const { hook, get } = load([...baseLogs, ...tail, done({ verified: true, testbench: "module tb; endmodule", simulation: { status: "pass", passed: true, stdout: "PASS" }, waveform: ps })]);
  await hook.run("counter");
  const wf = get().result.waveform;
  assert.strictEqual(wf.timescale, "1ps");
  assert.deepStrictEqual(plain(wf.signals[0].changes), [[0, 0], [2500, 1]]);
});
