/* SchematicViewer — pannable / zoomable netlist schematic.
   Props: schematic, title?
     schematic = { nodes:[{id, type:"port"|"gate"|"mux"|"ff"|other, label, x, y}], edges:[{from, to, label?}] }
              or { svg: "<svg…>" }   (raw Yosys/Graphviz SVG from the backend, already sanitised server-side)
   Interaction: drag to pan, wheel / buttons to zoom, hover a node to trace its wires, click to pin the selection. */
(function () {
  const { useState, useEffect, useRef, useMemo, useCallback } = React;

  const SIZE = { port: [84, 28], gate: [72, 52], mux: [64, 84], ff: [100, 84], default: [92, 50] };
  const COLOR = { port: "#22e6ff", gate: "#ffb800", mux: "#8b5cf6", ff: "#ff2e97", default: "#3dffa2" };
  const KIND = { port: "I/O port", gate: "Logic gate", mux: "Multiplexer", ff: "Flip-flop" };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* Compute node boxes, routed edge paths and overall bounds from the plain node/edge data. */
  function layout(schematic) {
    const nodes = (schematic.nodes || []).map((n) => {
      const [w, h] = SIZE[n.type] || SIZE.default;
      return { ...n, w, h };
    });
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const edges = (schematic.edges || []).filter((e) => byId[e.from] && byId[e.to]);
    const incoming = {};
    edges.forEach((e, i) => (incoming[e.to] = incoming[e.to] || []).push(i));
    const bottom = Math.max(0, ...nodes.map((n) => n.y + n.h));
    let maxX = Math.max(0, ...nodes.map((n) => n.x + n.w)), back = 0;

    const routed = edges.map((e, i) => {
      const s = byId[e.from], t = byId[e.to];
      const ti = incoming[e.to].indexOf(i), tn = incoming[e.to].length;
      const sx = s.x + s.w, sy = s.y + s.h / 2, tx = t.x, ty = t.y + (t.h * (ti + 1)) / (tn + 1);
      let d, lx, ly;
      if (tx > sx + 24) {
        const mx = Math.max(sx + 12, tx - 22 - ti * 10);
        d = `M${sx} ${sy} H${mx} V${ty} H${tx}`; lx = sx + 6; ly = sy - 6;
      } else { // feedback: loop underneath the design
        const by = bottom + 34 + (back++ % 4) * 14;
        d = `M${sx} ${sy} H${sx + 16} V${by} H${tx - 16} V${ty} H${tx}`; lx = Math.min(sx, tx) + 10; ly = by - 5;
      }
      return { ...e, i, d, lx, ly, sx, sy };
    });
    const W = maxX + 50, H = bottom + 34 + (back ? Math.min(back, 4) * 14 + 30 : 30);
    return { nodes, edges: routed, W, H };
  }

  function NodeShape({ n, color, isOut }) {
    const { x, y, w, h } = n;
    switch (n.type) {
      case "port": return <path d={isOut ? `M${x} ${y} H${x + w - 12} L${x + w} ${y + h / 2} L${x + w - 12} ${y + h} H${x} Z` : `M${x + 12} ${y} H${x + w} V${y + h} H${x + 12} L${x} ${y + h / 2} Z`} />;
      case "gate": return <path d={`M${x} ${y} H${x + w - h / 2} A${h / 2} ${h / 2} 0 0 1 ${x + w - h / 2} ${y + h} H${x} Z`} />;
      case "mux": return <path d={`M${x} ${y} L${x + w} ${y + 14} V${y + h - 14} L${x} ${y + h} Z`} />;
      case "ff": return <><rect x={x} y={y} width={w} height={h} rx="3" /><path d={`M${x} ${y + h - 24} L${x + 11} ${y + h - 15} L${x} ${y + h - 6}`} fill="none" /></>;
      default: return <rect x={x} y={y} width={w} height={h} rx="4" />;
    }
  }

  function SchematicViewer({ schematic, title = "Schematic" }) {
    const box = useRef(null), drag = useRef(null);
    const [view, setView] = useState({ x: 0, y: 0, k: 1 });
    const [hover, setHover] = useState(null), [sel, setSel] = useState(null);

    const raw = schematic && typeof schematic.svg === "string" ? schematic.svg : null;
    const g = useMemo(() => (schematic && !raw ? layout(schematic) : null), [schematic, raw]);
    const size = useMemo(() => {
      if (g) return { w: g.W, h: g.H };
      const m = raw && raw.match(/viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/);
      return m ? { w: +m[1], h: +m[2] } : { w: 800, h: 500 };
    }, [g, raw]);

    const fit = useCallback(() => {
      const el = box.current; if (!el) return;
      const k = clamp(Math.min(el.clientWidth / size.w, el.clientHeight / size.h) * 0.96, 0.2, 1.6);
      setView({ k, x: (el.clientWidth - size.w * k) / 2, y: (el.clientHeight - size.h * k) / 2 });
    }, [size]);
    useEffect(() => { fit(); setSel(null); setHover(null); }, [fit]);

    const zoomAt = useCallback((factor, cx, cy) => setView((v) => {
      const el = box.current; if (cx == null) { cx = el.clientWidth / 2; cy = el.clientHeight / 2; }
      const k = clamp(v.k * factor, 0.15, 6);
      return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
    }), []);

    // Non-passive wheel listener so the page doesn't scroll while zooming.
    useEffect(() => {
      const el = box.current; if (!el) return;
      const onWheel = (e) => {
        e.preventDefault();
        const r = el.getBoundingClientRect();
        zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
      };
      el.addEventListener("wheel", onWheel, { passive: false });
      return () => el.removeEventListener("wheel", onWheel);
    }, [zoomAt, !!schematic]);

    const onDown = (e) => {
      if (e.button > 0) return;
      drag.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false };
      const move = (ev) => {
        const d = drag.current; if (!d) return;
        const dx = ev.clientX - d.sx, dy = ev.clientY - d.sy;
        if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
        if (d.moved) setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
      };
      const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    };
    const wasDrag = () => !!(drag.current && drag.current.moved);

    if (!schematic || (!raw && !(schematic.nodes && schematic.nodes.length))) {
      return (
        <section className="p2g p2g-panel">
          <header className="p2g-head"><div className="p2g-title">{title}<i> //</i></div></header>
          <div className="p2g-empty">No schematic data yet.</div>
        </section>
      );
    }

    const active = g && (hover || sel);
    const node = active && g.nodes.find((n) => n.id === active);
    const touching = (e) => e.from === active || e.to === active;
    const ins = node ? g.edges.filter((e) => e.to === active) : [], outs = node ? g.edges.filter((e) => e.from === active) : [];
    const label = (id) => (g.nodes.find((n) => n.id === id) || {}).label || id;

    return (
      <section className="p2g p2g-panel">
        <header className="p2g-head">
          <div className="p2g-title">{title}<i> //</i></div>
          <span className="p2g-zoomtag">{Math.round(view.k * 100)}%</span>
          <button className="p2g-btn" onClick={() => zoomAt(1.25)} aria-label="Zoom in">+</button>
          <button className="p2g-btn" onClick={() => zoomAt(1 / 1.25)} aria-label="Zoom out">−</button>
          <button className="p2g-btn hot" onClick={fit}>Reset</button>
        </header>
        <div className="p2g-sch-view" ref={box} onPointerDown={onDown} onDoubleClick={fit}>
          <div className="p2g-sch-stage" style={{ width: size.w, height: size.h, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
            {raw ? <div className="p2g-sch-raw" dangerouslySetInnerHTML={{ __html: raw }} /> : (
              <svg width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`}>
                <defs><pattern id="p2gDots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#3a2a7a" /></pattern></defs>
                <rect width={size.w} height={size.h} fill="url(#p2gDots)" opacity=".7" />
                {g.edges.map((e) => {
                  const on = active && touching(e), dim = active && !on;
                  return (
                    <g key={e.i} className={"p2g-edge" + (on ? " on" : "") + (dim ? " dim" : "")}>
                      <path d={e.d} fill="none" strokeLinejoin="round" />
                      <circle cx={e.sx} cy={e.sy} r="2.6" />
                      {e.label && <text x={e.lx} y={e.ly}>{e.label}</text>}
                    </g>
                  );
                })}
                {g.nodes.map((n) => {
                  const c = COLOR[n.type] || COLOR.default, on = active === n.id;
                  const isOut = n.type === "port" && !g.edges.some((e) => e.from === n.id);
                  const dim = active && !on && !g.edges.some((e) => touching(e) && (e.from === n.id || e.to === n.id));
                  return (
                    <g key={n.id} className={"p2g-node" + (on ? " on" : "") + (sel === n.id ? " pinned" : "") + (dim ? " dim" : "")}
                      style={{ "--c": c }} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}
                      onClick={() => { if (!wasDrag()) setSel(sel === n.id ? null : n.id); }}>
                      <NodeShape n={n} isOut={isOut} />
                      <text x={n.x + n.w / 2 + (n.type === "port" ? (isOut ? -5 : 5) : 0)} y={n.y + n.h / 2 + 4} textAnchor="middle">{n.label}</text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
          <div className="p2g-sch-hint">drag · pan &nbsp;|&nbsp; wheel · zoom &nbsp;|&nbsp; double-click · reset</div>
        </div>
        <div className="p2g-ports-info">
          {node
            ? <><b>{node.label}</b> — {KIND[node.type] || "Cell"} · fan-in {ins.length}{ins.length ? ` (${ins.map((e) => label(e.from)).join(", ")})` : ""} · fan-out {outs.length}{outs.length ? ` (${outs.map((e) => label(e.to)).join(", ")})` : ""}</>
            : g ? "Hover a block to trace its wires; click to pin it." : "Rendered netlist from synthesis."}
          {g && <div className="p2g-legend" style={{ marginTop: 6 }}>
            {Object.keys(KIND).map((k) => <span key={k} style={{ color: COLOR[k] }}>{KIND[k]}</span>)}
          </div>}
        </div>
      </section>
    );
  }

  window.SchematicViewer = SchematicViewer;
})();
