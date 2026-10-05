"use strict";

const fs = require("fs/promises");
const path = require("path");
const { exportDot, exportJson } = require("./eda/yosys");
const { dotToSvg, cleanSvg } = require("./eda/graphviz");

/** Optional dependency: `npm install netlistsvg`. Absent -> Graphviz fallback. */
let netlistsvg = null;
try { netlistsvg = require("netlistsvg"); } catch { /* fallback to graphviz */ }

/** netlistsvg's render() is callback-style in old versions, promise-style in new ones. */
function renderJson(skin, netlist, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("netlistsvg timed out")), timeoutMs);
    const done = (fn) => (v) => { clearTimeout(timer); fn(v); };
    try {
      const ret = netlistsvg.render(skin, netlist, (err, svg) => (err ? done(reject)(err) : done(resolve)(svg)));
      if (ret && typeof ret.then === "function") ret.then(done(resolve), done(reject));
    } catch (e) { done(reject)(e); }
  });
}

/**
 * netlistsvg emits a transparent SVG with fixed width/height and no viewBox:
 * add a viewBox so it scales, and a white card so black lines show on dark UIs.
 */
function prepareSvg(svg) {
  let out = String(svg);
  const w = out.match(/<svg[^>]*?\swidth="([\d.]+)/i);
  const h = out.match(/<svg[^>]*?\sheight="([\d.]+)/i);
  if (w && h && !/<svg[^>]*\sviewBox=/i.test(out)) {
    out = out.replace(/<svg/i, `<svg viewBox="0 0 ${w[1]} ${h[1]}"`);
  }
  out = out.replace(/<svg/i, '<svg style="background:#fff;border-radius:8px;padding:8px;box-sizing:border-box"');
  return cleanSvg(out);
}

async function viaNetlistSvg(file, workDir) {
  if (!netlistsvg) return { svg: null, reason: "netlistsvg not installed (npm install netlistsvg)" };
  const j = await exportJson({ workDir, file });
  if (!j.ok) return { svg: null, reason: `yosys: ${j.reason}` };
  try {
    const netlist = JSON.parse(await fs.readFile(path.join(workDir, j.jsonFile), "utf8"));
    const skin = await fs.readFile(require.resolve("netlistsvg/lib/default.svg"), "utf8");
    return { svg: prepareSvg(await renderJson(skin, netlist)) };
  } catch (err) {
    return { svg: null, reason: `netlistsvg: ${String(err.message || err).slice(0, 200)}` };
  }
}

async function viaGraphviz(file, workDir) {
  const dot = await exportDot({ workDir, file });
  if (!dot.ok) return { svg: null, reason: `yosys: ${dot.reason}` };
  const svg = await dotToSvg({ workDir, dotFile: dot.dotFile });
  if (!svg.ok) return { svg: null, reason: svg.reason };
  return { svg: svg.svg };
}

/**
 * Netlist schematic: netlistsvg (clean gate-level drawing) first, Graphviz raw view as fallback.
 * Never throws. Returns { svg, renderer } or { svg: null, reason }.
 */
async function renderNetlistSvg(srcPath, workDir) {
  const file = path.basename(srcPath);

  const pretty = await viaNetlistSvg(file, workDir);
  if (pretty.svg) return { svg: pretty.svg, renderer: "netlistsvg" };

  const plain = await viaGraphviz(file, workDir);
  if (plain.svg) return { svg: plain.svg, renderer: "graphviz", note: pretty.reason };

    return { svg: null, reason: `${pretty.reason || "netlistsvg: no svg"} | graphviz: ${plain.reason}` };
}

module.exports = { renderNetlistSvg, prepareSvg, cleanSvg };