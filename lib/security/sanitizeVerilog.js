"use strict";

const config = require("../../config");

/**
 * Rejects Verilog that could touch the host before it is compiled or simulated.
 * Comments are stripped and string contents blanked first, so "$system" inside a
 * $display string or a comment is NOT a false positive.
 * Returns { ok, reasons[] }.
 */

const COMMENT_OR_STRING = /("(?:\\.|[^"\\\n])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g;
const STRING = /"(?:\\.|[^"\\\n])*"/g;

const RULES = [
  [/`(?:include|uselib)\b/, "`include / `uselib is not allowed"],
  [/\$system\b/, "$system is not allowed"],
  [/\$f(?:open|close|display|write|strobe|monitor|scanf|gets|getc|read|seek|tell|rewind|flush|ungetc|error)\w*/, "file I/O system tasks ($fopen, $fwrite, ...) are not allowed"],
  [/\$(?:readmem[hb]|writemem[hb]|sdf_annotate|load_dump|dumpports\w*|vcdplus\w*)/, "$readmem/$writemem and other file-touching tasks are not allowed"],
  [/\bimport\s+"DPI/, "DPI imports are not allowed"],
];

function sanitizeVerilog(src) {
  if (typeof src !== "string" || !src.trim()) return { ok: false, reasons: ["Empty source"] };

  const reasons = [];
  if (src.length > config.limits.maxVerilogChars) reasons.push(`Source too large (max ${config.limits.maxVerilogChars} characters)`);
  if (src.includes("\0")) reasons.push("Source contains a null byte");

  const noComments = src.replace(COMMENT_OR_STRING, (m, str) => (str ? m : " "));
  const code = noComments.replace(STRING, '""');

  for (const [re, msg] of RULES) if (re.test(code)) reasons.push(msg);

  // $dumpfile is required by testbenches, but only with a plain file name (no paths).
  for (const m of noComments.matchAll(/\$dumpfile\s*\(\s*([^)]*)\)/g)) {
    const arg = m[1].trim();
    if (!/^"[A-Za-z0-9_][A-Za-z0-9_.-]*"$/.test(arg) || arg.includes("..")) {
      reasons.push('$dumpfile must use a plain file name like "dump.vcd" (no paths)');
      break;
    }
  }
  return { ok: reasons.length === 0, reasons };
}

module.exports = { sanitizeVerilog };
