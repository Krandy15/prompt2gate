"use strict";

const fs = require("fs/promises");
const path = require("path");
const config = require("../../config");
const { runTool } = require("./run");

const SAFE_FILE = /^[\w.-]+$/;
const SAFE_IDENT = /^[A-Za-z_]\w*$/;
const tail = (s, n = 3) => String(s || "").trim().split("\n").slice(-n).join(" ").slice(0, 300);

/** Common script header: read the source and resolve the hierarchy. */
function head({ file, top, sv }) {
  if (!SAFE_FILE.test(file)) throw new Error("unsafe file name");
  if (top && !SAFE_IDENT.test(top)) throw new Error("unsafe top name");
  const read = `read_verilog ${sv ? "-sv " : ""}${file}`;
  const hier = top ? `hierarchy -check -top ${top}` : "hierarchy -check -auto-top";
  return `${read}\n${hier}`;
}

/** Turn a failed runTool() result into { ok:false, reason }. */
function failure(r, what) {
  if (r.missing) return { ok: false, missing: true, reason: "yosys not found. Set YOSYS_BIN in .env or install OSS CAD Suite." };
  if (r.timedOut) return { ok: false, reason: `yosys ${what} timed out` };
  const msg = tail(r.stderr || r.stdout);
  if (msg) return { ok: false, reason: msg };
  const hex = r.code == null ? "" : "0x" + (r.code >>> 0).toString(16).toUpperCase();
  // 0xC0000135 = Windows STATUS_DLL_NOT_FOUND: yosys.exe could not load its DLLs.
  const hint = hex === "0xC0000135"
    ? " - yosys.exe cannot find its DLLs. Start the server from the OSS CAD Suite shell (start.bat) or reinstall the suite."
    : "";
  return { ok: false, reason: `yosys ${what} failed (exit ${r.code}${hex ? " = " + hex : ""}${r.error ? ", " + r.error : ""})${hint}` };
}

/** `synth; stat` -> { ok, stat (text), log }. Never throws on tool failure. */
async function synthStat({ workDir, file, top, sv = false }) {
  const scriptPath = path.join(workDir, "synth_stat.ys");
  const script = `${head({ file, top, sv })}\nsynth\ntee -o stat.txt stat\n`;
  await fs.writeFile(scriptPath, script, "utf8");

  const r = await runTool(config.tools.yosys, ["-s", "synth_stat.ys"], { cwd: workDir, timeoutMs: config.timeouts.yosysMs });
  if (!r.ok) return failure(r, "synth");
  let stat = "";
  try { stat = await fs.readFile(path.join(workDir, "stat.txt"), "utf8"); } catch { stat = r.stdout; }
  return { ok: true, stat, log: r.stdout };
}

/** Elaborated (pre-techmap) netlist as Graphviz .dot -> { ok, dotFile }. Render it with graphviz.js. */
async function exportDot({ workDir, file, top, sv = false }) {
  const scriptPath = path.join(workDir, "export_dot.ys");
  const script = `${head({ file, top, sv })}\nproc\nopt\nopt_clean\nshow -format dot -viewer none -prefix netlist\n`;
  await fs.writeFile(scriptPath, script, "utf8");

  const r = await runTool(config.tools.yosys, ["-s", "export_dot.ys"], { cwd: workDir, timeoutMs: config.timeouts.yosysMs });
  if (!r.ok) return failure(r, "show");
  return { ok: true, dotFile: "netlist.dot" };
}

/**
 * Elaborated netlist as Yosys JSON for netlistsvg -> { ok, jsonFile }.
 *
 * Tries a cleaner flow first, then a minimal one. Uses `.ys` script files
 * to prevent Windows command-line argument escaping failures.
 */
async function exportJson({ workDir, file, top, sv = false }) {
  const flows = [
    "proc\nopt -nodffe -nosdff\nmemory -nomap\nopt_clean",
    "proc\nopt_expr\nopt_clean",
  ];
  let last;
  for (let i = 0; i < flows.length; i++) {
    const flow = flows[i];
    const scriptName = `export_json_${i}.ys`;
    const scriptPath = path.join(workDir, scriptName);
    const script = `${head({ file, top, sv })}\n${flow}\nwrite_json netlist.json\n`;
    await fs.writeFile(scriptPath, script, "utf8");

    const r = await runTool(config.tools.yosys, ["-s", scriptName], { cwd: workDir, timeoutMs: config.timeouts.yosysMs });
    if (r.ok) return { ok: true, jsonFile: "netlist.json" };
    last = r;
  }
  return failure(last, "write_json");
}

module.exports = { synthStat, exportDot, exportJson };
