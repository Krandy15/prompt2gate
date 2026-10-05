function Placeholder({ name, children }) {
  return (
    <div className="placeholder">
      <strong>{name}</strong>
      <span>Person 2's component isn't loaded yet.</span>
      {children}
    </div>
  );
}

// Uses Person 2's components when they exist, placeholders until then.
// Adjust prop names here once agreed with Person 2.
function Note({ title, children }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      <span>{children}</span>
    </div>
  );
}

function TabContent({ tab, result }) {
  const schematic = result.schematic || (result.schematicSvg ? { svg: result.schematicSvg } : null);
  const parsed = window.parseVerilogPorts && window.parseVerilogPorts(result.rtl || "");
  const portView = window.PortDiagram && parsed && (
    <window.PortDiagram ports={result.ports || parsed.ports} moduleName={parsed.name} />
  );

  if (tab === "rtl") {
    return (
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
        <div style={{ height: 420 }}>
          <window.CodeEditor value={result.rtl} filename="design.v" />
        </div>
        {portView}
      </div>
    );
  }

  if (tab === "schematic") {
    if (schematic) return <div style={{ height: 460 }}><window.SchematicViewer schematic={schematic} /></div>;
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <Note title="Netlist schematic unavailable">
          Yosys/Graphviz did not produce a netlist for this design (see the Verification Trace). Showing the port-level view instead.
        </Note>
        {portView}
      </div>
    );
  }

  if (tab === "waveform") {
    if (result.waveform) return <window.WaveformViewer waveform={result.waveform} />;
    return (
      <Note title="No waveform for this design">
        The testbench did not run or wrote no waveform. See the Verification Trace for details.
      </Note>
    );
  }

  if (tab === "stats") {
    if (result.stats) return <window.StatsPanel stats={result.stats} />;
    return <Note title="No statistics available">Yosys did not return gate-level statistics for this design.</Note>;
  }

  if (tab === "testbench") {
    if (result.testbench) return <window.TestbenchTab result={result} />;
    return (
      <Note title="No testbench generated">
        No testbench was produced for this design. See the Verification Trace for details.
      </Note>
    );
  }

  return null;
}

function App() {
  const { useState, useEffect } = React;
  const syn = window.useSynthesis();
  const [tab, setTab] = useState("trace");

  // running/error -> show the trace; success -> jump to the source
  useEffect(() => {
    if (syn.status === "running" || syn.status === "error") setTab("trace");
    if (syn.status === "success") setTab("rtl");
  }, [syn.status]);

  return (
    <div className="app">
      <Header status={syn.status} result={syn.result} />
      <main className="main">
        <PromptPanel status={syn.status} error={syn.error} onGenerate={syn.run} onReset={syn.reset} />
        <PipelineStatus stages={syn.stages} status={syn.status} onRetry={syn.reset} />

        <section className="panel results">
          <Tabs active={tab} onChange={setTab} hasResult={!!syn.result} />
          <div className="results__body">
            {tab === "trace" ? (
              <TerminalTrace logs={syn.logs} status={syn.status} />
            ) : syn.result ? (
              <TabContent tab={tab} result={syn.result} />
            ) : (
              <div className="empty">No synthesis result yet.</div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);