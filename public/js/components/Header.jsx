window.Header = function Header({ status, result }) {
  const cfg = window.P2G_CONFIG;
  const toolText = { idle: "Active", running: "Working", success: "Active", error: "Fault" }[status];
  return (
    <header className="header">
      <div className="header__brand">
        <span className="logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="6" y="6" width="12" height="12" rx="2" />
            <rect x="10" y="10" width="4" height="4" />
            <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
          </svg>
        </span>
        <div>
          <h1>Prompt<span>2</span>Gate <em className="ver">{cfg.VERSION}</em></h1>
          <p>Deterministic NL → Synthesizable Verilog &amp; Gate Schematic Compiler</p>
        </div>
      </div>
      <div className="header__right">
        {result && <ComplexityBadges result={result} />}
        <span className={`pill pill--${status}`}>
          <i className="pill__dot" /> {cfg.TOOL_LABEL}: {toolText}
        </span>
        <span className="pill pill--plain">LLM: {cfg.LLM_LABEL}</span>
      </div>
    </header>
  );
};