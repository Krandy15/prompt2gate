window.PromptPanel = function PromptPanel({ status, error, onGenerate, onReset }) {
  const { useState } = React;
  const presets = window.P2G_PRESETS;
  const [prompt, setPrompt] = useState(presets[0]?.prompt || "");
  const [active, setActive] = useState(presets[0]?.id);
  const running = status === "running";
  const canGo = prompt.trim().length > 0 && !running;
  const submit = () => canGo && onGenerate(prompt.trim());

  return (
    <section className="panel prompt">
      <div className="prompt__top">
        <h2>Hardware Specification</h2>
        <div className="prompt__presets">
          <span>Presets:</span>
          {presets.map((p) => (
            <button
              key={p.id}
              className={`chip ${active === p.id ? "chip--active" : ""}`}
              disabled={running}
              onClick={() => { setPrompt(p.prompt); setActive(p.id); }}
            >
              {p.title || p.label}
            </button>
          ))}
        </div>
      </div>

      <textarea
        value={prompt}
        disabled={running}
        placeholder="Describe the hardware you want, e.g. a 4-bit counter with reset and enable…"
        onChange={(e) => { setPrompt(e.target.value); setActive(null); }}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submit(); }}
        rows={3}
      />

      <div className="prompt__actions">
        <div className="features">
          <span>🛡 Strict Verilog-2001</span>
          <span>⟳ Max 2 Self-Healing Tries</span>
        </div>
        <div className="prompt__buttons">
          {status !== "idle" && !running && (
            <button className="btn btn--ghost" onClick={onReset}>Clear</button>
          )}
          <button className="btn btn--primary" disabled={!canGo} onClick={submit}>
            {running ? (<><span className="spinner" /> Synthesizing…</>)
              : status === "error" ? "⚡ Try again"
              : "⚡ Synthesize RTL"}
          </button>
        </div>
      </div>

      {status === "success" && <p className="msg msg--ok">✓ Synthesis complete. Explore the tabs below.</p>}
      {status === "error" && error && <p className="msg msg--err">✕ {error.message}</p>}
    </section>
  );
};