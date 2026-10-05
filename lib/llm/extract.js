"use strict";

/**
 * Pulls Verilog source out of an LLM reply. Handles: fenced blocks (any/no language tag),
 * unclosed fences (truncated replies), several blocks (prefers the first one containing
 * a module), and unfenced replies with prose around the code.
 */

const FENCE = /```[ \t]*([A-Za-z0-9_+-]*)[ \t]*\r?\n([\s\S]*?)```/g;
const OPEN_FENCE = /```[ \t]*[A-Za-z0-9_+-]*[ \t]*\r?\n([\s\S]*)$/;
const VERILOG_LANGS = /^(verilog|systemverilog|sv|v)?$/i;

const hasModule = (code) => /\bmodule\b[\s\S]*\bendmodule\b/.test(code);

/** For unfenced text: drop chatter before the first `timescale/module and after the last endmodule. */
function trimToModules(text) {
  const start = text.search(/`timescale|\bmodule\b/);
  let out = start > 0 ? text.slice(start) : text;
  const end = out.lastIndexOf("endmodule");
  if (end !== -1) out = out.slice(0, end + "endmodule".length);
  return out.trim();
}

function extractVerilog(rawText) {
  const text = String(rawText ?? "");

  const blocks = [...text.matchAll(FENCE)]
    .filter((m) => VERILOG_LANGS.test(m[1]))
    .map((m) => m[2].trim());
  if (blocks.length) return blocks.find(hasModule) || blocks[0];

  const open = text.match(OPEN_FENCE);
  if (open) return open[1].trim();

  return trimToModules(text);
}

module.exports = { extractVerilog, hasModule };
