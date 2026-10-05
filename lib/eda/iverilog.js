"use strict";

const path = require("path");
const config = require("../../config");
const { runTool } = require("./run");

/**
 * Compile Verilog with Icarus. Files are names relative to workDir (we run with cwd=workDir).
 * std: "2001" | "2012". Success = exit 0 (warnings stay in `log`, they don't fail the build).
 * `missingTool` = environment problem, not something the LLM can fix.
 */
async function compile({ workDir, files, std = "2001", top, outName = "a.out" }) {
  const args = ["-Wall", `-g${std}`, "-o", outName];
  if (top) args.push("-s", top);
  args.push(...files);

  const r = await runTool(config.tools.iverilog, args, { cwd: workDir, timeoutMs: config.timeouts.iverilogMs });

  if (r.missing) {
    return { success: false, missingTool: true, log: "iverilog not found. Install Icarus Verilog or set IVERILOG_BIN in .env." };
  }
  const log = [r.stdout, r.stderr].filter(Boolean).join("\n").trim();
  if (r.timedOut) return { success: false, timedOut: true, log: log || "iverilog timed out." };
  return { success: r.ok, log: log || (r.ok ? "" : r.error || "iverilog failed"), outPath: path.join(workDir, outName) };
}

module.exports = { compile };
