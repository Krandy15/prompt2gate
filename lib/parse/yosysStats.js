"use strict";

/**
 * Yosys `stat` text -> { cells, wires, wireBits, gates, flipFlops, latches, muxes, cellTypes }.
 * Tolerates both layouts: "Number of cells: 14" + "  $_AND_   3" rows, and
 * count-first rows ("   3   $_AND_"). Uses the "design hierarchy" section if present,
 * otherwise the last module section.
 */

const FF = /DFF|SDFF|ADFF|\$ff\b|\$_FF_/i;
const LATCH = /LATCH/i;
const MUX = /MUX|PMUX/i;

function pickSection(text) {
  const parts = text.split(/^=== (.+?) ===\s*$/m); // [pre, name1, body1, name2, body2, ...]
  if (parts.length < 3) return text;
  const named = [];
  for (let k = 1; k < parts.length; k += 2) named.push([parts[k], parts[k + 1]]);
  const hier = named.find(([n]) => /design hierarchy/i.test(n));
  return (hier || named[named.length - 1])[1];
}

function parseYosysStats(text) {
  const body = pickSection(String(text || ""));
  const out = { cells: 0, wires: 0, wireBits: 0, gates: 0, flipFlops: 0, latches: 0, muxes: 0, cellTypes: {} };
  const num = (re) => { const m = body.match(re); return m ? parseInt(m[1], 10) : 0; };

  out.wires = num(/Number of wires:\s+(\d+)/i) || num(/^\s*\|?\s*(\d+)\s+wires\b/im);
  out.wireBits = num(/Number of wire bits:\s+(\d+)/i) || num(/^\s*\|?\s*(\d+)\s+wire bits\b/im);
  out.cells = num(/Number of cells:\s+(\d+)/i) || num(/^\s*\|?\s*(\d+)\s+cells\b/im);

  for (const line of body.split(/\r?\n/)) {
    const l = line.replace(/^\s*\|/, "").trim();
    let m = l.match(/^(\$?[\w$\\.]+)\s+(\d+)$/);            // name  count
    let name, count;
    if (m && !/^Number$/i.test(m[1])) { name = m[1]; count = +m[2]; }
    else if ((m = l.match(/^(\d+)\s+(\$[\w$\\.]+)$/))) { name = m[2]; count = +m[1]; } // count  $name
    if (!name || !name.startsWith("$")) continue;
    out.cellTypes[name] = (out.cellTypes[name] || 0) + count;
  }

  for (const [name, n] of Object.entries(out.cellTypes)) {
    if (LATCH.test(name)) out.latches += n;
    else if (FF.test(name)) out.flipFlops += n;
    else if (MUX.test(name)) out.muxes += n;
    else out.gates += n;
  }
  if (!out.cells) out.cells = Object.values(out.cellTypes).reduce((a, b) => a + b, 0);
  return out;
}

module.exports = { parseYosysStats };
