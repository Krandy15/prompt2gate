"use strict";

const fs = require("fs/promises");
const path = require("path");
const config = require("../../config");
const provider = require("../llm/provider");
const { extractVerilog } = require("../llm/extract");
const { compile } = require("../eda/iverilog");
const { simulate } = require("../eda/vvp");
const { sanitizeVerilog } = require("../security/sanitizeVerilog");
const { parseModule } = require("../parse/verilogPorts");
const { TB_SYSTEM, buildTestbenchPrompt } = require("../prompts/testbench.system");
const { buildTbFixPrompt } = require("../prompts/testbench.fix");

const isPass = (sim) => sim.ok && !sim.timedOut && /^\s*PASS(?:ED)?\b/m.test(sim.stdout) && !/\bFAIL/.test(sim.stdout);
const cut = (s, n = 4000) => String(s || "").slice(0, n);

/**
 * Generate (or accept) a testbench, compile it with the DUT (-g2012), simulate with vvp, and repair the
 * TESTBENCH on failure (max config.pipeline.maxTestbenchAttempts). The design is never loosened to make a
 * test pass; a still-failing result is reported honestly as status "fail".
 *
 * Expects workDir/module.v to hold the DUT. `emit` = { log(type, text), stage(name, status) }.
 * Returns { status: pass|fail|error|skipped, passed, testbench, attempts, stdout, log, vcd, timedOut }.
 * Pass `testbench` + repair:false to just re-run an existing testbench (no LLM).
 */
async function testbenchLoop({ spec, verilog, workDir, emit, testbench = null, repair = true }) {
  const max = repair ? config.pipeline.maxTestbenchAttempts : 1;
  const out = (o) => ({ passed: false, attempts: 0, stdout: "", log: "", vcd: null, timedOut: false, testbench: null, ...o });

  let tb = testbench;
  emit.stage("testbench", "running");
  if (!tb) {
    emit.log("info", "[TESTBENCH] Generating self-checking testbench...");
    try {
      const r = await provider.callLLM({
        messages: [{ role: "system", content: TB_SYSTEM }, { role: "user", content: buildTestbenchPrompt({ spec, verilog, module: parseModule(verilog) }) }],
      });
      tb = extractVerilog(r.text);
    } catch (err) {
      emit.log("error", `[TESTBENCH] Generation failed: ${err.message}`);
      emit.stage("testbench", "failed"); emit.stage("simulate", "skipped");
      return out({ status: "error", log: err.message });
    }
  }

  for (let attempt = 1; ; attempt++) {
    let phase = "compile", log = "", sim = null;
    const safe = sanitizeVerilog(tb);
    if (!safe.ok) {
      log = `Rejected by security check: ${safe.reasons.join("; ")}`;
    } else {
      await fs.writeFile(path.join(workDir, "tb.v"), tb, "utf8");
      // no -s: the testbench is the only un-instantiated module, so Icarus picks it as the root
      const c = await compile({ workDir, files: ["module.v", "tb.v"], std: "2012", outName: "sim.out" });
      if (c.missingTool) { emit.stage("testbench", "skipped"); emit.stage("simulate", "skipped"); return out({ status: "skipped", testbench: tb, attempts: attempt, log: c.log }); }
      log = c.log;
      if (c.success) {
        phase = "simulate";
        emit.stage("testbench", "done");
        emit.stage("simulate", "running");
        emit.log("info", `[SIMULATION - Attempt ${attempt}] Running vvp...`);
        sim = await simulate({ workDir, binName: "sim.out" });
        if (sim.missingTool) { emit.stage("simulate", "skipped"); return out({ status: "skipped", testbench: tb, attempts: attempt, log: sim.stderr }); }
        if (isPass(sim)) {
          emit.log("success", `[SIMULATION - Attempt ${attempt}] PASS: self-checking testbench passed.`);
          emit.stage("simulate", "done");
          return out({ status: "pass", passed: true, testbench: tb, attempts: attempt, stdout: cut(sim.stdout), vcd: sim.vcd, log: sim.stderr });
        }
        log = sim.timedOut ? `Simulation timed out after ${config.timeouts.vvpMs} ms (missing $finish or infinite loop).\n${sim.stdout}` : `${sim.stdout}\n${sim.stderr}`;
      }
    }

    emit.log("error", `[${phase === "compile" ? "TESTBENCH" : "SIMULATION"} - Attempt ${attempt}] FAILED:\n${cut(log, 600)}`);
    if (attempt >= max) {
      emit.log("warn", repair ? "[TESTBENCH] Max attempts reached; reporting FAIL." : "[TESTBENCH] Testbench did not pass.");
      emit.stage(phase === "compile" ? "testbench" : "simulate", "failed");
      if (phase === "compile") emit.stage("simulate", "skipped");
      return out({ status: "fail", testbench: tb, attempts: attempt, stdout: cut(sim?.stdout), log: cut(log), vcd: sim?.vcd || null, timedOut: !!sim?.timedOut });
    }

    emit.log("fix", "[TESTBENCH] Asking the LLM to repair the testbench...");
    try {
      const fix = await provider.callLLM({
        messages: [{ role: "system", content: TB_SYSTEM }, { role: "user", content: buildTbFixPrompt({ spec, verilog, tb, log, phase }) }],
      });
      tb = extractVerilog(fix.text);
    } catch (err) {
      emit.log("error", `[TESTBENCH] Repair request failed: ${err.message}`);
      emit.stage(phase === "compile" ? "testbench" : "simulate", "failed");
      return out({ status: "fail", testbench: tb, attempts: attempt, stdout: cut(sim?.stdout), log: cut(log) });
    }
  }
}

module.exports = { testbenchLoop };
