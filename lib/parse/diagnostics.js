"use strict";

/**
 * iverilog / yosys output -> lint findings:
 *   [{ severity: "error"|"warning"|"info", line, message, code, tool }]
 * `code` is a coarse category the UI can badge: latch, implicit-net, width, syntax, timescale, other.
 */

const CODES = [
  [/latch/i, "latch"],
  [/implicit definition|implicitly declared|not declared|Unable to bind|undeclared/i, "implicit-net"],
  [/expects \d+ bits|width|truncat|padding|extending/i, "width"],
  [/syntax error|malformed|parse error/i, "syntax"],
  [/timescale/i, "timescale"],
];
const codeOf = (msg) => (CODES.find(([re]) => re.test(msg)) || [, "other"])[1];

// [file:line:] [severity:] message   (file part may contain a Windows drive colon)
const LINE = /^(?:(.*?):(\d+):\s*)?(error|warning|sorry|note|ERROR|Warning)\s*:\s*(.*)$/;
const SEVERITY = { error: "error", sorry: "error", warning: "warning", note: "info" };

function parseDiagnostics(text, { tool = "iverilog" } = {}) {
  const findings = [];
  const seen = new Set();
  for (const raw of String(text || "").split(/\r?\n/)) {
    const m = raw.trim().match(LINE);
    if (!m) continue;
    const severity = SEVERITY[m[3].toLowerCase()] || "info";
    const f = { severity, line: m[2] ? parseInt(m[2], 10) : null, message: m[4].trim(), code: codeOf(m[4]), tool };
    const key = `${f.severity}|${f.line}|${f.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push(f);
  }
  return findings;
}

const summarize = (findings) => ({
  errors: findings.filter((f) => f.severity === "error").length,
  warnings: findings.filter((f) => f.severity === "warning").length,
});

module.exports = { parseDiagnostics, summarize };
