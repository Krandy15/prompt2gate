/* PortDiagram — module block with inputs on the left, outputs on the right.
   Props: ports [{name, direction:"input"|"output"|"inout", width, range?}], moduleName?, onSelectPort?
   Inouts are drawn on the right in amber with a double arrow. Hover a pin for details, click to select. */
(function () {
  const { useState } = React;
  const COLORS = { input: "#22e6ff", output: "#ff2e97", inout: "#ffb800" };
  const label = (p) => (window.portLabel ? window.portLabel(p) : p.name);

  function PortDiagram({ ports = [], moduleName = "module", onSelectPort, title = "Port Diagram" }) {
    const [hover, setHover] = useState(null);
    const [sel, setSel] = useState(null);
    const left = ports.filter((p) => p.direction === "input");
    const right = ports.filter((p) => p.direction !== "input");

    const ROW = 34, TOP = 56, BW = 240, BX = 240, W = 720, STUB = 80;
    const rows = Math.max(left.length, right.length, 1);
    const BH = TOP + rows * ROW + 12;
    const clocked = left.some((p) => /^(clk|clock)/i.test(p.name));
    const shown = hover || sel;

    const pin = (p, i, side) => {
      const y = TOP + 8 + i * ROW, c = COLORS[p.direction] || COLORS.input;
      const x1 = side === "L" ? BX - STUB : BX + BW, x2 = side === "L" ? BX : BX + BW + STUB;
      const bus = p.width !== 1;
      const isClk = side === "L" && /^(clk|clock)/i.test(p.name);
      const key = p.name;
      const mid = (x1 + x2) / 2;
      const tip = x2; // inputs point into the block, outputs point away from it
      return (
        <g key={key} className={"p2g-port" + (sel === key ? " sel" : "")} style={{ color: c }}
          onMouseEnter={() => setHover(key)} onMouseLeave={() => setHover(null)}
          onClick={() => { const n = sel === key ? null : key; setSel(n); onSelectPort && onSelectPort(n ? p : null); }}>
          <rect x={x1 - (side === "L" ? 150 : 0)} y={y - ROW / 2 + 2} width={STUB + 150} height={ROW - 4} fill="transparent" />
          <line className="wire" x1={x1} y1={y} x2={x2} y2={y} stroke={c} strokeWidth={bus ? 3.5 : 2} />
          {p.direction === "inout"
            ? <path d={`M ${x1 + 14} ${y - 5} L ${x1 + 6} ${y} L ${x1 + 14} ${y + 5} M ${x2 - 14} ${y - 5} L ${x2 - 6} ${y} L ${x2 - 14} ${y + 5}`} fill="none" stroke={c} strokeWidth="1.6" />
            : <path d={`M ${tip - 12} ${y - 5} L ${tip - 3} ${y} L ${tip - 12} ${y + 5} Z`} fill={c} />}
          {bus && <><line x1={mid - 3} y1={y + 7} x2={mid + 3} y2={y - 7} stroke={c} strokeWidth="1.6" />
            <text x={mid + 8} y={y - 8} fill={c} fontSize="10" fontFamily="monospace">{p.width == null ? "n" : p.width}</text></>}
          {isClk && <path d={`M ${BX + 2} ${y - 6} L ${BX + 12} ${y} L ${BX + 2} ${y + 6}`} fill="none" stroke="#e8e4ff" strokeWidth="1.4" />}
          <text x={side === "L" ? x1 - 8 : x2 + 8} y={y + 4} fill={sel === key || hover === key ? "#fff" : c} fontSize="12"
            textAnchor={side === "L" ? "end" : "start"} fontFamily="'JetBrains Mono', monospace">{label(p)}</text>
        </g>
      );
    };

    return (
      <section className="p2g p2g-panel">
        <header className="p2g-head">
          <div className="p2g-title">{title}<i> //</i></div>
          <div className="p2g-legend">
            <span style={{ color: COLORS.input }}>In</span><span style={{ color: COLORS.output }}>Out</span>
            {ports.some((p) => p.direction === "inout") && <span style={{ color: COLORS.inout }}>Inout</span>}
          </div>
        </header>
        <div className="p2g-ports-body">
          <svg className="p2g-ports-svg" viewBox={`0 0 ${W} ${BH + 56}`} role="img" aria-label={`Ports of ${moduleName}`}>
            <defs>
              <linearGradient id="p2gBox" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#2a1766" /><stop offset="1" stopColor="#120a2e" />
              </linearGradient>
            </defs>
            <rect x={BX} y={20} width={BW} height={BH} rx="6" fill="url(#p2gBox)" stroke="#8b5cf6" strokeWidth="2" />
            <rect x={BX} y={20} width={BW} height={BH} rx="6" fill="none" stroke="#22e6ff" strokeOpacity=".25" strokeWidth="6" />
            <text x={BX + BW / 2} y={48} fill="#e8e4ff" fontSize="14" fontWeight="700" textAnchor="middle" fontFamily="Orbitron, monospace" letterSpacing="2">{moduleName}</text>
            <text x={BX + BW / 2} y={BH + 36} fill="#8a80c0" fontSize="10" textAnchor="middle" fontFamily="monospace" letterSpacing="2">
              {(clocked ? "SEQUENTIAL · CLOCKED" : "COMBINATIONAL") + ` · ${ports.length} PORTS`}
            </text>
            {left.map((p, i) => pin(p, i, "L"))}
            {right.map((p, i) => pin(p, i, "R"))}
          </svg>
        </div>
        <div className="p2g-ports-info">
          {shown
            ? (() => { const p = ports.find((x) => x.name === shown); return p && <><b>{label(p)}</b> — {p.direction}, {p.width == null ? "parameterised width" : p.width === 1 ? "1 bit" : `${p.width} bits`}</>; })()
            : "Hover or click a pin for details."}
        </div>
      </section>
    );
  }

  window.PortDiagram = PortDiagram;
})();
