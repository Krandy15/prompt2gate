#!/usr/bin/env node
"use strict";

/** Verifies the EDA toolchain is installed. Exit code 1 if a required tool is missing. */

const config = require("../config");
const { runTool } = require("../lib/eda/run");

const WIN = process.platform === "win32";
const TOOLS = [
  {
    name: "iverilog", bin: config.tools.iverilog, args: ["-V"], required: true,
    hint: WIN ? "install Icarus Verilog for Windows and tick 'Add to PATH'" : "apt-get install iverilog | brew install icarus-verilog",
  },
  { name: "vvp", bin: config.tools.vvp, args: ["-V"], required: true, hint: "ships with iverilog" },
  {
    name: "yosys", bin: config.tools.yosys, args: ["-V"], required: false,
    hint: (WIN ? "OSS CAD Suite (YosysHQ releases) or set YOSYS_BIN in .env" : "apt-get install yosys | brew install yosys") + " — needed for stats + netlist",
  },
  {
    name: "dot", bin: config.tools.dot, args: ["-V"], required: false,
    hint: (WIN ? "winget install Graphviz.Graphviz (add to PATH) or set DOT_BIN in .env" : "apt-get install graphviz | brew install graphviz") + " — needed for schematic SVG",
  },
];

(async () => {
  let missingRequired = false;
  for (const t of TOOLS) {
    const r = await runTool(t.bin, t.args, { timeoutMs: config.timeouts.versionCheckMs });
    if (r.missing || (!r.ok && !r.stdout && !r.stderr)) {
      console.log(`✗ ${t.name.padEnd(9)} NOT FOUND${t.required ? " (required)" : " (optional)"} — ${t.hint}`);
      if (t.required) missingRequired = true;
    } else {
      const version = (r.stdout || r.stderr).split("\n")[0].trim();
      if (r.ok) console.log(`✓ ${t.name.padEnd(9)} ${version}`);
      else console.log(`! ${t.name.padEnd(9)} exited with code ${r.code}${r.code != null ? " (0x" + (r.code >>> 0).toString(16).toUpperCase() + ")" : ""} ${version}`);
    }
  }
  console.log(`\nLLM provider: ${config.llm.provider}  |  Gemini key: ${config.llm.gemini.apiKey ? "set" : "NOT set"}`);
  process.exit(missingRequired ? 1 : 0);
})();
