window.P2G_TABS = [
  { id: "rtl",       label: "Verilog-2001 Source", icon: "{ }", needsResult: true },
  { id: "schematic", label: "Logic Schematic",     icon: "⊸",   needsResult: true },
  { id: "waveform",  label: "Timing Simulation",   icon: "∿",   needsResult: true },
  { id: "stats",     label: "Stats",               icon: "▦",   needsResult: true },
  { id: "testbench", label: "Testbench",           icon: "✔",   needsResult: true },
  { id: "trace",     label: "Verification Trace",  icon: ">_",  needsResult: false },
];

window.Tabs = function Tabs({ active, onChange, hasResult }) {
  return (
    <div className="tabs" role="tablist">
      {window.P2G_TABS.map((t) => {
        const off = t.needsResult && !hasResult;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            disabled={off}
            className={`tab ${active === t.id ? "tab--active" : ""}`}
            onClick={() => onChange(t.id)}
          >
            <span className="tab__icon">{t.icon}</span> {t.label}
          </button>
        );
      })}
    </div>
  );
};