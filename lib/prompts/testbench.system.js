"use strict";

const TB_SYSTEM = `You are a verification engineer writing a SELF-CHECKING Verilog testbench for Icarus Verilog (-g2012).
Rules:
- Output ONLY one testbench module in one \`\`\`verilog code fence. No prose. Name it tb.
- Start with \`timescale 1ns/1ps.
- Instantiate the design under test as "dut" with named port connections. Never redefine the DUT.
- Derive expected values from the SPEC (a small behavioural model or hand-written expectations inside the
  testbench), NOT by copying the DUT's own logic.
- Clocked designs: toggle the clock with always #5 clk = ~clk; apply reset first and wait for it to release
  before checking; change inputs just after an active edge and sample outputs ~1ns after the next edge to avoid races.
- Combinational designs (no clock): apply input vectors with #10 between them and check ~1ns after each change.
  Use exhaustive vectors when the total input width is <= 6 bits; otherwise use corner cases plus a few random ones.
- Include: initial begin $dumpfile("dump.vcd"); $dumpvars(0, tb); ... end
- Compare with !== so X/Z counts as a failure. Count mismatches.
- At the end print exactly "PASS" when there were zero mismatches; otherwise print "FAIL: <short reason>"
  (include got/expected values), then call $finish.
- Add a watchdog: initial begin #100000; $display("FAIL: timeout"); $finish; end (scale to the test length).
- Keep the run short. Do not use $system, file I/O ($fopen, $readmemh, ...) or \`include.`;

function buildTestbenchPrompt({ spec, verilog, module: mod }) {
  const ports = mod
    ? mod.ports.map((p) => `  ${p.dir} ${p.range || ""} ${p.name}`.replace(/\s+/g, " ")).join("\n")
    : "  (could not be parsed; read them from the source)";
  const hints = mod
    ? `Module: ${mod.name}\nClock: ${mod.clock || "none (combinational)"}\nReset: ${mod.reset ? `${mod.reset.name} (${mod.reset.activeLow ? "active-low" : "active-high"})` : "none"}`
    : "";
  return `Spec: "${spec}"

${hints}
Ports:
${ports}

--- DUT SOURCE ---
${verilog}`;
}

module.exports = { TB_SYSTEM, buildTestbenchPrompt };
