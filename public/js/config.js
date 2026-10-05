window.P2G_CONFIG = {
  API_BASE: "",            // same origin as the Express server
  USE_MOCK: false,         // true = offline demo data, false = real backend
  MOCK_STEP_MS: 900,       // speed of the fake pipeline (mock mode only)
  VERSION: "v2.0",
  LLM_LABEL: "Gemini",
  TOOL_LABEL: "iverilog + yosys",
};

// Stage ids are driven by the backend log lines (see js/state/useSynthesis.js)
window.P2G_STAGES = [
  { id: "ingest",     label: "Prompt Ingest",      hint: "Specification received" },
  { id: "rtl",        label: "RTL Inference",      hint: "LLM writes Verilog-2001" },
  { id: "compile",    label: "Icarus Linting",     hint: "iverilog -Wall -g2001 + self-heal" },
  { id: "synthesize", label: "Netlist Extraction", hint: "Yosys netlist + stats" },
  { id: "ready",      label: "Verified Ready",     hint: "Design verified" },
];
