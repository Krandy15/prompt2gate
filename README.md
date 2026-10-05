# Prompt2Gate

Natural language -> Verilog (Gemini / Ollama) -> Icarus compile + self-heal -> testbench simulation -> Yosys synthesis.

Full target layout: `docs/SYSTEMARCHITECTURE.md`.

## Run (from THIS folder — the one containing package.json)
```bash
npm install
cp .env.example .env      # Windows: Copy-Item .env.example .env   then set GEMINI_API_KEY
npm run check-tools       # verifies iverilog, vvp, yosys, dot + key
npm test                  # unit tests
npm start                 # legacy server for now, see status below
```
`.env` must live next to `package.json`: dotenv reads it from the folder you run commands in.

## Build status
| Step | Scope | State |
|------|-------|-------|
| 1 | config, util (logger, tmpdir), eda/run.js, check-tools | done |
| 2 | lib/llm (gemini, ollama, provider, extract) + tests | done |
| 3 | eda wrappers + security/sanitizeVerilog | done |
| 4 | parsers (vcd, yosysStats, diagnostics, verilogPorts) | done |
| 5 | prompts, pipeline, routes, slim server.js | next |
| 6 | tests, Dockerfile, export bundle, docs | |

Legacy files `server.js`, `lib/llmClient.js`, `lib/verilogPipeline.js`, `lib/schematic.js` (Groq-based)
are still here so the old app runs; they are deleted/replaced in step 5.

## Deploy
Frontend can be static (Vercel/Netlify) but the backend needs iverilog/yosys/graphviz, so it
goes on a Docker host (Render, Railway, Fly.io, Hugging Face Spaces). Dockerfile arrives in step 6.

## UI (v2)

`public/` now contains the React UI (loaded via CDN + Babel standalone, so the browser needs internet).
- `public/js/config.js`: `USE_MOCK: false` uses the real backend (`true` = offline demo data).
- `public/js/api/client.js` + `public/js/state/useSynthesis.js`: stream `/api/synthesize/stream` and map log lines to pipeline steps.
- `public/legacy.html`: the previous single-file UI, kept as a fallback.
- Timing Simulation and Testbench tabs show an empty state: the backend does not generate testbenches or waveforms yet.
