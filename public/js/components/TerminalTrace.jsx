// Body-only terminal; it lives inside the "Verification Trace" tab.
window.TerminalTrace = function TerminalTrace({ logs, status }) {
  const { useRef, useEffect } = React;
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [logs]);

  return (
    <div className="terminal">
      <div className="terminal__body">
        {logs.length === 0 && <div className="log log--dim">$ waiting for a specification…</div>}
        {logs.map((l, i) => (
          <div key={i} className={`log log--${l.type}`}>
            <span className="log__ts">{l.ts}</span> {l.text}
          </div>
        ))}
        {status === "running" && <span className="cursor">▋</span>}
        <div ref={endRef} />
      </div>
    </div>
  );
};