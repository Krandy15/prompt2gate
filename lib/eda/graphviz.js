"use strict";

const fs = require("fs/promises");
const path = require("path");
const config = require("../../config");
const { runTool } = require("./run");

/** Make Graphviz SVG safe + responsive for inline embedding. */
function cleanSvg(svg) {
  return String(svg)
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/(xlink:)?href="\s*javascript:[^"]*"/gi, "")
    .replace(/<svg([^>]*?)\swidth="[^"]*"/i, "<svg$1")
    .replace(/<svg([^>]*?)\sheight="[^"]*"/i, '<svg$1 width="100%"')
    .trim();
}

/** dot file (relative to workDir) -> { ok, svg } | { ok:false, missing?, reason } */
async function dotToSvg({ workDir, dotFile = "netlist.dot" }) {
  const r = await runTool(config.tools.dot, ["-Tsvg", dotFile, "-o", "netlist.svg"], {
    cwd: workDir, timeoutMs: config.timeouts.dotMs,
  });
  if (r.missing) return { ok: false, missing: true, reason: "dot (Graphviz) not found. Set DOT_BIN in .env or install Graphviz." };
  if (!r.ok) return { ok: false, reason: (r.stderr || "dot failed").trim().slice(0, 300) };
  try {
    return { ok: true, svg: cleanSvg(await fs.readFile(path.join(workDir, "netlist.svg"), "utf8")) };
  } catch (err) {
    return { ok: false, reason: `could not read SVG: ${err.message}` };
  }
}

module.exports = { dotToSvg, cleanSvg };
