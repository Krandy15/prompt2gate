"use strict";

/** phase: "compile" (testbench failed to build) | "simulate" (it ran and reported FAIL / hung). */
function buildTbFixPrompt({ spec, verilog, tb, log, phase }) {
  const what = phase === "compile" ? "failed to compile" : "ran but did not print PASS";
  return `A self-checking testbench for this spec ${what}.
Spec: "${spec}"

Fix ONLY the testbench. Correct genuine testbench bugs: syntax errors, wrong expected values, race
conditions or timing, a missing $finish. Do NOT weaken or remove checks just to make it pass; if the
design really violates the spec, keep the checks strict. Return one \`\`\`verilog fence containing the
testbench module only.

--- DUT SOURCE ---
${verilog}

--- CURRENT TESTBENCH ---
${tb}

--- TOOL OUTPUT ---
${String(log).slice(0, 1500)}`;
}

module.exports = { buildTbFixPrompt };
