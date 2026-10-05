// Stopgap built from Person 2's CodeEditor; Person 2 can replace this file.
window.TestbenchTab = function TestbenchTab({ result }) {
  const tr = result.testbenchResult;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {tr && (
        <section className="p2g p2g-panel">
          <header className="p2g-head">
            <div className="p2g-title">Testbench Result<i> //</i></div>
            <span className={"p2g-btn" + (tr.status === "PASS" ? "" : " hot")}>{tr.status}</span>
          </header>
          <div className="p2g-ports-info">{(tr.log || []).map((l, i) => <div key={i}>{l}</div>)}</div>
        </section>
      )}
      <div style={{ height: 380 }}>
        <window.CodeEditor value={result.testbench || ""} readOnly title="Testbench" filename="tb.v" />
      </div>
    </div>
  );
};
