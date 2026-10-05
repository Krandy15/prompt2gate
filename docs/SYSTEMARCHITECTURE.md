prompt2gate/
├── server.js                      [G2] MOD  slim bootstrap: middleware + mount routes only
├── package.json                   [S]  MOD  add `archiver` (zip export)
├── .env.example                   [S]  MOD  GEMINI_API_KEY, GEMINI_MODEL(S), LLM_PROVIDER, OLLAMA_*
├── .gitignore  .dockerignore      [S]  NEW  (node_modules/, .env)
├── Dockerfile                     [G2] NEW  node + iverilog + yosys + graphviz (demo-day safety net)
├── README.md                      [S]  MOD
│
├── config/
│   └── index.js                   [G2] NEW  env parsing, model chain, timeouts, limits, tool names
│
├── routes/
│   ├── health.js                  [G2] MOD  /api/health (+ ?deep=1 Gemini key check)
│   ├── synthesize.js              [G2] MOD  POST /api/synthesize and /api/synthesize/stream
│   ├── resynthesize.js            [G2] NEW  POST /api/resynthesize  (edited Verilog, NO LLM)
│   └── export.js                  [G2] NEW  POST /api/export  → .zip bundle
│
├── lib/
│   ├── llm/
│   │   ├── geminiClient.js        [G2] NEW  replaces Groq logic in llmClient.js
│   │   ├── ollamaClient.js        [G2] NEW  offline fallback (OpenAI-compatible local URL)
│   │   ├── provider.js            [G2] NEW  picks gemini | ollama, exposes callLLM()
│   │   └── extract.js             [G2] MOD  extractVerilog() moved here from llmClient.js
│   │
│   ├── prompts/
│   │   ├── rtl.system.js          [G2] MOD  hardened RTL prompt (from SYSTEM_PROMPT)
│   │   ├── rtl.fix.js             [G2] MOD  compile-error repair prompt
│   │   ├── testbench.system.js    [G2] NEW  self-checking TB, $dumpfile/$dumpvars, PASS/FAIL print
│   │   └── testbench.fix.js       [G2] NEW  TB repair prompt
│   │
│   ├── eda/
│   │   ├── run.js                 [G2] NEW  safe execFile wrapper (timeout, output cap, ENOENT)
│   │   ├── iverilog.js            [G2] MOD  compile (-g2001 / -g2012) from tryCompile()
│   │   ├── vvp.js                 [G2] NEW  run simulation, collect stdout + dump.vcd
│   │   ├── yosys.js               [G2] MOD  `synth; stat` + show, from schematic.js
│   │   └── graphviz.js            [G2] MOD  dot → SVG + cleanSvg()
│   │
│   ├── parse/
│   │   ├── vcd.js                 [G2] NEW  VCD → JSON signal transitions
│   │   ├── yosysStats.js          [G2] NEW  `stat` stdout → {gates, flipFlops, muxes, wires…}
│   │   ├── diagnostics.js         [G2] NEW  iverilog/yosys warnings → lint findings
│   │   └── verilogPorts.js        [S]  NEW  server-side port extraction (for badges + TB prompt)
│   │
│   ├── pipeline/
│   │   ├── index.js               [G2] MOD  orchestrator runPipeline() (replaces verilogPipeline.js)
│   │   ├── generateRtl.js         [G2] NEW  stage 1
│   │   ├── compileLoop.js         [G2] NEW  stage 2: lint + self-heal (max 2)
│   │   ├── testbenchLoop.js       [G2] NEW  stages 3-4: gen TB, run vvp, repair on failure
│   │   ├── synthesize.js          [G2] NEW  stage 5: Yosys stat + netlist SVG
│   │   └── events.js              [S]  NEW  emit helpers for NDJSON stage/log events
│   │
│   ├── security/
│   │   └── sanitizeVerilog.js     [G2] NEW  reject $system/$fopen/`include etc. before compile/run
│   │
│   ├── export/
│   │   └── bundle.js              [G2] NEW  .v + tb + report + .svg → zip stream
│   │
│   └── util/
│       ├── tmpdir.js              [G2] NEW  mkdtemp + guaranteed cleanup
│       └── logger.js              [G2] NEW
│
├── public/                        (served statically)
│   ├── index.html                 [G1] MOD  thin shell: CDN tags + ordered <script> list only
│   ├── css/app.css                [G1] NEW
│   └── js/
│       ├── config.js              [G1] NEW  API_BASE
│       ├── api/client.js          [G1] NEW  NDJSON stream reader, resynthesize(), exportZip()
│       ├── state/useSynthesis.js  [G1] NEW  hook: stream → state (logs, stages, result)
│       ├── data/
│       │   ├── presets.js         [G1] MOD  arbiter / ALU / counter (moved out of index.html)
│       │   └── mockResult.js      [S]  NEW  fixture matching the API contract (Phase 2 dev)
│       ├── utils/
│       │   ├── verilogPorts.js    [G1] MOD  parseModule() from index.html
│       │   └── vcdToWavedrom.js   [G1] NEW  contract `waveform` → WaveDrom JSON
│       ├── components/
│       │   ├── Header.jsx              [G1] NEW  title + ComplexityBadges
│       │   ├── ComplexityBadges.jsx    [G1] NEW  ports, bus widths, gate depth, status
│       │   ├── PromptPanel.jsx         [G1] MOD  presets + textarea + Generate
│       │   ├── PipelineStatus.jsx      [G1] MOD  the 5-step tracker
│       │   ├── TerminalTrace.jsx       [G1] MOD  streaming log
│       │   ├── CodeEditor.jsx          [G1] NEW  Monaco + "Re-lint / Re-synthesize"
│       │   ├── SchematicViewer.jsx     [G1] NEW  svg-pan-zoom + node inspect
│       │   ├── PortDiagram.jsx         [G1] MOD  fallback when Yosys/Graphviz missing
│       │   ├── WaveformViewer.jsx      [G1] NEW  WaveDrom/canvas (0, 1, Z, X)
│       │   ├── StatsPanel.jsx          [G1] NEW  gate/FF/mux/wire counts
│       │   ├── TestbenchTab.jsx        [G1] NEW  TB source + PASS/FAIL result
│       │   ├── ExportButton.jsx        [G1] NEW  "Download Project"
│       │   └── Tabs.jsx                [G1] NEW
│       └── App.jsx                     [G1] MOD  layout + wiring only
│
├── test/
│   ├── fixtures/                  [G2] NEW  counter.vcd, yosys_stat.txt, broken.v, sample TB
│   ├── unit/                      [G2] NEW  vcd, yosysStats, extract, sanitize, diagnostics
│   └── e2e/presets.test.js        [G2] NEW  live run of arbiter/ALU/counter (needs key + EDA)
│
├── scripts/
│   ├── check-tools.js             [G2] NEW  verifies iverilog, vvp, yosys, dot are installed
│   └── smoke-test.js              [S]  NEW  hits /api/synthesize with a preset, prints summary
│
└── docs/
    ├── API_CONTRACT.md            [S]  NEW  Phase 1 deliverable (schema below)
    ├── ARCHITECTURE.md            [S]  NEW
    └── DEMO_SCRIPT.md             [S]  NEW  the 2-minute pitch flow