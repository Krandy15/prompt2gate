// Hook: owns status, stage states, terminal logs, result.
// status: idle | running | success | error
window.useSynthesis = function useSynthesis() {
  const { useState, useRef, useCallback, useEffect } = React;
  const STAGES = window.P2G_STAGES;
  const initialStages = () => Object.fromEntries(STAGES.map((s) => [s.id, "pending"]));

  const [status, setStatus] = useState("idle");
  const [stages, setStages] = useState(initialStages);
  const [logs, setLogs] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const timers = useRef([]);
  const abortRef = useRef(null);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => () => { clearTimers(); if (abortRef.current) abortRef.current.abort(); }, []);

  const addLog = (type, text) =>
    setLogs((l) => [...l, { type, text, ts: new Date().toLocaleTimeString() }]);

  const reset = useCallback(() => {
    clearTimers();
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    setStatus("idle");
    setStages(initialStages());
    setLogs([]);
    setResult(null);
    setError(null);
  }, []);

  // MOCK runner: fakes the pipeline so the UI can be built offline.
  // Test the error state by adding ?fail=compile to the URL.
  const runMock = (prompt) => {
    const step = window.P2G_CONFIG.MOCK_STEP_MS;
    const failAt = new URLSearchParams(location.search).get("fail");
    const mock = window.P2G_MOCK_RESULT;
    addLog("cmd", `[PROMPT2GATE] Ingesting specification: "${prompt.slice(0, 60)}${prompt.length > 60 ? "…" : ""}"`);

    STAGES.forEach((s, i) => {
      timers.current.push(
        setTimeout(() => {
          setStages((st) => ({ ...st, [s.id]: "running" }));
          addLog("cmd", `$ ${s.label.toLowerCase()}...`);
        }, i * step)
      );
      timers.current.push(
        setTimeout(() => {
          if (failAt === s.id) {
            setStages((st) => ({ ...st, [s.id]: "error" }));
            addLog("error", `✕ ${s.label} failed (mock error)`);
            setError({ stage: s.id, message: `${s.label} failed. Check your specification and try again.` });
            setStatus("error");
            clearTimers();
            return;
          }
          setStages((st) => ({ ...st, [s.id]: "success" }));
          addLog("ok", `✓ ${mock.logs[i] || s.label + " done"}`);
          if (i === STAGES.length - 1) {
            setResult(mock);
            setStatus("success");
          }
        }, i * step + step * 0.8)
      );
    });
  };

  // Backend waveform {signals:[{name,width,transitions:[{t,v}]}]} -> viewer shape {changes:[[t, number|"x"|"z"]]}
  const toChanges = (tr) => tr.map(({ t, v }) => [t, /[xX]/.test(v) ? "x" : /[zZ]/.test(v) ? "z" : parseInt(v, 2)]);
  // `timescale 1ns/1ps makes the VCD tick in ps (5 ns = 5000). Show ns/us when every timestamp divides evenly.
  const UNITS = ["fs", "ps", "ns", "us"];
  const rescale = (timescale, endTime, signals) => {
    const m = /^1(fs|ps|ns|us)$/.exec(timescale || "");
    if (!m) return { timescale, endTime, signals };
    let k = UNITS.indexOf(m[1]), div = 1;
    const times = [endTime].concat(...signals.map((s) => s.changes.map((c) => c[0])));
    while (k < UNITS.length - 1 && times.every((t) => (t / div) % 1000 === 0)) { div *= 1000; k++; }
    if (div === 1) return { timescale, endTime, signals };
    return {
      timescale: "1" + UNITS[k],
      endTime: endTime / div,
      signals: signals.map((s) => ({ ...s, changes: s.changes.map(([t, v]) => [t / div, v]) })),
    };
  };
  const adaptWaveform = (wf) => {
    if (!wf || !wf.signals || !wf.signals.length) return null;
    const signals = wf.signals.map((s) => ({ name: s.name, width: s.width, scope: s.scope, changes: toChanges(s.transitions) }));
    return rescale(wf.timescale || "1ns", wf.endTime || 1, signals);
  };
  const tbResult = (sim) =>
    sim
      ? {
          status: { pass: "PASS", fail: "FAIL", error: "ERROR", skipped: "SKIPPED" }[sim.status] || String(sim.status || "").toUpperCase(),
          log: String(sim.stdout || sim.log || "").split("\n").map((l) => l.trim()).filter(Boolean),
        }
      : null;

  // REAL runner: streams NDJSON from the backend and maps its log lines to pipeline stages.
  const runReal = async (prompt) => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const state = initialStages();
    let current = null;                       // stage currently running
    const push = () => setStages({ ...state });
    const mark = (id, v) => { state[id] = v; if (v === "running") current = id; push(); };
    const advance = (doneId, nextId) => {     // finish one stage, start the next
      if (doneId && state[doneId] !== "error") state[doneId] = "success";
      if (nextId) { state[nextId] = "running"; current = nextId; }
      push();
    };
    const logType = { info: "cmd", success: "ok", warn: "warn", fix: "fix", error: "error" };

    const onLog = (log) => {
      const t = String(log.text || "");
      addLog(logType[log.type] || "cmd", t);
      if (/^\[PROMPT2GATE\]/.test(t)) mark("ingest", "running");
      else if (/^\[LLM\] Invoking/.test(t)) advance("ingest", "rtl");
      else if (/^\[LLM\] Generation failed/.test(t)) mark("rtl", "error");
      else if (/^\[COMPILER - Attempt \d+\] Running/.test(t)) advance("rtl", "compile");
      else if (/^\[COMPILER - Attempt \d+\] PASSED/.test(t)) advance("compile", null);
      else if (/^\[TESTBENCH\] Generating/.test(t)) mark("testbench", "running");
      else if (/^\[SIMULATION - Attempt \d+\] Running/.test(t)) advance("testbench", "simulate");
      else if (/^\[SIMULATION - Attempt \d+\] PASS/.test(t)) advance("simulate", null);
      else if (/^\[TESTBENCH\] (Generation failed|Max attempts reached|Testbench did not pass|Repair request failed)/.test(t))
        mark(state.simulate === "running" ? "simulate" : "testbench", "error");
      else if (/^\[YOSYS\] Elaborating/.test(t)) advance("compile", "synthesize");
      else if (/^\[YOSYS\] (Netlist rendered|Skipped)/.test(t)) advance("synthesize", null);
    };

    const fail = (message) => {
      if (current && state[current] !== "success") mark(current, "error");
      addLog("error", "✕ " + message);
      setError({ stage: current, message });
      setStatus("error");
    };

    let finished = false;
    try {
      await window.P2G_API.synthesizeStream(prompt, (ev) => {
        if (ev.type === "log") onLog(ev.log);
        else if (ev.type === "error") { finished = true; fail(ev.error || "Pipeline failed"); }
        else if (ev.type === "done") {
          finished = true;
          const r = ev.result || {};
          const ui = {
            status: r.success ? "success" : "error",
            rtl: r.verilog || "",
            schematicSvg: r.schematicSvg || null,
            stats: r.stats || null,
            attempts: r.attempts,
            compilerLog: r.compilerLog || "",
            testbench: r.testbench || null,
            testbenchResult: tbResult(r.simulation),
            verified: r.verified,
            waveform: adaptWaveform(r.waveform),
          };
          if (r.verilog) setResult(ui);
          if (r.success) {
            advance("synthesize", "ready");
            if (r.verified === false) {
              // compiled fine, but the self-checking testbench did not pass: show results, flag the last step
              state.ready = "error"; current = "ready"; push();
              addLog("warn", "⚠ Design compiled, but its testbench did not pass. See the Testbench tab and the Verification Trace.");
            } else {
              advance("ready", null);
              addLog("ok", "✓ Verified. Design compiled cleanly" + (r.attempts > 1 ? " after " + r.attempts + " attempts" : "") + (r.verified ? " and passed its self-checking testbench." : "."));
            }
            setStatus("success");
          } else {
            const last = (r.logs || []).filter((l) => l.type === "error").pop();
            fail(last ? String(last.text).split("\n")[0] : "Synthesis failed. See the Verification Trace.");
          }
        }
      }, ctrl.signal);
      if (!finished) fail("Connection closed before the pipeline finished.");
    } catch (e) {
      if (e.name === "AbortError") return;
      fail("Could not reach the backend: " + e.message);
    }
  };

  const run = useCallback((prompt) => {
    reset();
    setStatus("running");
    if (window.P2G_CONFIG.USE_MOCK) return runMock(prompt);
    return runReal(prompt);
  }, [reset]);

  return { status, stages, logs, result, error, run, reset };
};