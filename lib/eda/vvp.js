"use strict";

const fs = require("fs/promises");
const path = require("path");
const config = require("../../config");
const { runTool } = require("./run");

const VCD_NAME = "dump.vcd"; // testbench prompt must use $dumpfile("dump.vcd")

/** dump.vcd, or any other *.vcd the testbench wrote (LLMs sometimes pick another name). */
async function findVcd(workDir) {
  const names = (await fs.readdir(workDir)).filter((n) => n.toLowerCase().endsWith(".vcd"));
  return names.includes(VCD_NAME) ? VCD_NAME : names[0] || VCD_NAME;
}

/**
 * Runs a compiled simulation (vvp -n: $stop ends the run instead of waiting on a prompt).
 * Killed after config.timeouts.vvpMs, which guards against testbenches without $finish.
 * Returns { ok, stdout, stderr, timedOut, missingTool, vcd }  (vcd = text or null).
 */
async function simulate({ workDir, binName = "a.out", timeoutMs = config.timeouts.vvpMs }) {
  const r = await runTool(config.tools.vvp, ["-n", binName], { cwd: workDir, timeoutMs });

  if (r.missing) {
    return { ok: false, missingTool: true, stdout: "", stderr: "vvp not found. Install Icarus Verilog or set VVP_BIN in .env.", vcd: null };
  }

  let vcd = null;
  let vcdTruncated = false;
  if (!r.timedOut) {
    try {
      const p = path.join(workDir, await findVcd(workDir));
      const { size } = await fs.stat(p);
      if (size <= config.limits.maxVcdBytes) vcd = await fs.readFile(p, "utf8");
      else vcdTruncated = true;
    } catch {} // no VCD written
  }
  return {
    ok: r.ok, stdout: r.stdout, stderr: r.stderr, timedOut: r.timedOut,
    outputTruncated: r.truncated, vcd, vcdTruncated,
  };
}

module.exports = { simulate, VCD_NAME };
