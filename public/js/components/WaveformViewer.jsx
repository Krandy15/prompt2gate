/* WaveformViewer — digital timing diagram with a hover cursor.
   Props: waveform { timescale, endTime, signals:[{name, width, changes:[[time, value]]}] }, title?
   Values are numbers, or "x" / "z". Buses are drawn as labelled segments; 1-bit signals as 0/1 traces.
   Hover for a time cursor with live values; click to pin it. Zoom with the buttons; scroll horizontally. */
(function () {
  const { useState, useRef, useEffect, useMemo } = React;
  const ROW = 46, HDR = 30, PADX = 12;
  const COLORS = ["#22e6ff", "#ff2e97", "#ffb800", "#3dffa2", "#8b5cf6", "#ff8a5c"];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const valueAt = (sig, t) => { let v; for (const [ct, cv] of sig.changes) { if (ct <= t) v = cv; else break; } return v; };
  function fmt(v, w, radix) {
    if (v === undefined) return "–";
    if (typeof v === "string") return v;
    if (w === 1) return String(v);
    if (radix === "bin") return v.toString(2).padStart(w, "0");
    if (radix === "dec") return String(v);
    return v.toString(16).toUpperCase().padStart(Math.ceil(w / 4), "0");
  }
  const niceStep = (ppu) => [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 500000, 1000000].find((s) => s * ppu >= 64) || 1000000;

  function WaveformViewer({ waveform, title = "Waveform" }) {
    const scroller = useRef(null), svgRef = useRef(null);
    const [ppu, setPpu] = useState(6);
    const [radix, setRadix] = useState("hex");
    const [hoverT, setHoverT] = useState(null), [pinT, setPinT] = useState(null);

    const sigs = (waveform && waveform.signals) || [];
    const end = (waveform && waveform.endTime) || 1;
    const unit = ((waveform && waveform.timescale) || "ns").replace(/[^a-z]/gi, "") || "ns";

    const fit = () => { const el = scroller.current; if (el) setPpu(clamp((el.clientWidth - PADX * 2) / end, 0.0005, 80)); };
    useEffect(fit, [waveform]);

    if (!sigs.length) {
      return (
        <section className="p2g p2g-panel">
          <header className="p2g-head"><div className="p2g-title">{title}<i> //</i></div></header>
          <div className="p2g-empty">No waveform data yet.</div>
        </section>
      );
    }

    const X = (t) => PADX + t * ppu, W = X(end) + PADX, H = HDR + sigs.length * ROW + 6;
    const step = niceStep(ppu);
    const ticks = []; for (let t = 0; t <= end; t += step) ticks.push(t);
    const cur = hoverT != null ? hoverT : pinT;

    const onMove = (e) => {
      const r = svgRef.current.getBoundingClientRect();
      setHoverT(clamp(Math.round((e.clientX - r.left - PADX) / ppu), 0, end));
    };

    const trace = (s, idx) => {
      const c = COLORS[idx % COLORS.length], yT = HDR + idx * ROW + 9, yB = HDR + idx * ROW + ROW - 11, yM = (yT + yB) / 2;
      const ch = s.changes.slice().sort((a, b) => a[0] - b[0]);
      if (s.width === 1) {
        const yOf = (v) => (v === 1 ? yT : v === 0 ? yB : yM);
        let d = "";
        ch.forEach(([t, v], k) => { d += k === 0 ? `M${X(t)} ${yOf(v)}` : `H${X(t)} V${yOf(v)}`; });
        d += `H${X(end)}`;
        const bad = ch.some(([, v]) => typeof v === "string");
        return <path key={s.name} className="p2g-wf-trace" d={d} stroke={c} fill="none" strokeWidth="2" strokeLinejoin="miter" strokeDasharray={bad ? "4 3" : undefined} />;
      }
      return ch.map(([t, v], k) => {
        const t1 = k + 1 < ch.length ? ch[k + 1][0] : end, x0 = X(t), x1 = X(t1), w = x1 - x0;
        if (w < 1) return null;
        const sl = Math.min(5, w / 2), bad = typeof v === "string", col = bad ? "#ff4d6d" : c, text = fmt(v, s.width, radix);
        return (
          <g key={s.name + k} className="p2g-wf-trace">
            <path d={`M${x0 + sl} ${yT} H${x1 - sl} L${x1} ${yM} L${x1 - sl} ${yB} H${x0 + sl} L${x0} ${yM} Z`} fill={col} fillOpacity=".12" stroke={col} strokeWidth="1.6" />
            {w > text.length * 7.5 + 14 && <text x={(x0 + x1) / 2} y={yM + 4} textAnchor="middle" fill="#e8e4ff" fontSize="11" fontFamily="monospace">{text}</text>}
          </g>
        );
      });
    };

    return (
      <section className="p2g p2g-panel">
        <header className="p2g-head">
          <div className="p2g-title">{title}<i> //</i></div>
          <span className="p2g-zoomtag">{waveform.timescale || ""}</span>
          <button className="p2g-btn" onClick={() => setRadix(radix === "hex" ? "dec" : radix === "dec" ? "bin" : "hex")}>{radix}</button>
          <button className="p2g-btn" onClick={() => setPpu((p) => clamp(p * 1.5, 0.5, 80))} aria-label="Zoom in">+</button>
          <button className="p2g-btn" onClick={() => setPpu((p) => clamp(p / 1.5, 0.5, 80))} aria-label="Zoom out">−</button>
          <button className="p2g-btn hot" onClick={fit}>Fit</button>
        </header>
        <div className="p2g-wf-body">
          <div className="p2g-wf-names">
            <div style={{ height: HDR }} className="p2g-wf-corner">{cur != null ? `${cur} ${unit}` : "time"}</div>
            {sigs.map((s, i) => (
              <div key={s.name} className="p2g-wf-name" style={{ height: ROW, "--c": COLORS[i % COLORS.length] }}>
                <span>{s.name}{s.width > 1 ? `[${s.width - 1}:0]` : ""}</span>
                <em>{cur != null ? fmt(valueAt(s, cur), s.width, radix) : ""}</em>
              </div>
            ))}
          </div>
          <div className="p2g-wf-scroll" ref={scroller}>
            <svg ref={svgRef} width={W} height={H} onMouseMove={onMove} onMouseLeave={() => setHoverT(null)}
              onClick={() => setPinT(pinT === hoverT ? null : hoverT)} style={{ display: "block", cursor: "crosshair" }}>
              {sigs.map((s, i) => i % 2 === 0 && <rect key={"b" + i} x="0" y={HDR + i * ROW} width={W} height={ROW} fill="#ffffff" opacity=".025" />)}
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={X(t)} x2={X(t)} y1={HDR - 6} y2={H} stroke="#3a2a7a" strokeWidth="1" strokeDasharray={t % (step * 5) ? "2 4" : undefined} />
                  <text x={X(t) + 3} y={HDR - 12} fill="#8a80c0" fontSize="10" fontFamily="monospace">{t}{unit}</text>
                </g>
              ))}
              {sigs.map(trace)}
              {cur != null && <g pointerEvents="none">
                <line x1={X(cur)} x2={X(cur)} y1={HDR - 4} y2={H} stroke="#ff2e97" strokeWidth="1.5" />
                <rect x={X(cur) - 24} y="1" width="48" height="16" rx="2" fill="#ff2e97" />
                <text x={X(cur)} y="13" textAnchor="middle" fill="#0b0720" fontSize="10" fontWeight="700" fontFamily="monospace">{cur}{unit}</text>
              </g>}
            </svg>
          </div>
        </div>
        <div className="p2g-ports-info">{pinT != null && hoverT == null ? `Cursor pinned at ${pinT} ${unit} — click the chart to release.` : "Hover for a time cursor; click to pin it. Use hex/dec/bin to change bus format."}</div>
      </section>
    );
  }

  window.WaveformViewer = WaveformViewer;
})();
