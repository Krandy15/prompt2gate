/* StatsPanel — hardware statistics cards.
   Props: stats {gates, flipFlops, muxes, wires, ...any extra numeric keys}, title?, items?
   items (optional) = [{ key, label, accent, note }] to control order/labels; extra keys in `stats` are appended. */
(function () {
  const { useState, useEffect, useRef } = React;

  const DEFAULT_ITEMS = [
    { key: "gates", label: "Gates", accent: "var(--cyan)" },
    { key: "flipFlops", label: "Flip-Flops", accent: "var(--magenta)" },
    { key: "muxes", label: "MUXes", accent: "var(--amber)" },
    { key: "wires", label: "Wires", accent: "var(--violet)" },
  ];
  const EXTRA_ACCENTS = ["var(--green)", "var(--cyan)", "var(--magenta)"];
  const humanize = (k) => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

  /* Eases a number from 0 to `target` whenever target changes. */
  function useCountUp(target, ms = 800) {
    const [v, setV] = useState(0);
    useEffect(() => {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(target); return; }
      let raf, t0;
      const tick = (t) => {
        t0 = t0 || t;
        const p = Math.min((t - t0) / ms, 1);
        setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, [target, ms]);
    return v;
  }

  function StatCard({ item, value, max, total, active, onClick }) {
    const shown = useCountUp(value);
    const pct = max ? Math.max(4, (value / max) * 100) : 0;
    return (
      <button type="button" className={"p2g-stat" + (active ? " on" : "")} style={{ "--accent": item.accent }} onClick={onClick}>
        <div className="p2g-stat-label">{item.label}</div>
        <div className="p2g-stat-value">{shown}</div>
        <div className="p2g-stat-bar"><span style={{ width: pct + "%" }} /></div>
        <div className="p2g-stat-note">
          {active ? `${total ? Math.round((value / total) * 100) : 0}% of all counted elements` : item.note || "\u00a0"}
        </div>
      </button>
    );
  }

  function StatsPanel({ stats, title = "Hardware Statistics", items }) {
    const [active, setActive] = useState(null);
    const list = (items || DEFAULT_ITEMS).slice();
    Object.keys(stats || {}).forEach((k) => {
      if (typeof stats[k] === "number" && !list.some((i) => i.key === k))
        list.push({ key: k, label: humanize(k), accent: EXTRA_ACCENTS[list.length % EXTRA_ACCENTS.length] });
    });
    const vals = list.map((i) => (stats && Number.isFinite(stats[i.key]) ? stats[i.key] : 0));
    const max = Math.max(...vals, 0), total = vals.reduce((a, b) => a + b, 0);
    return (
      <section className="p2g p2g-panel">
        <header className="p2g-head"><div className="p2g-title">{title}<i> //</i></div></header>
        <div className="p2g-stats-grid">
          {list.map((item, n) => (
            <StatCard key={item.key} item={item} value={vals[n]} max={max} total={total}
              active={active === item.key} onClick={() => setActive(active === item.key ? null : item.key)} />
          ))}
        </div>
      </section>
    );
  }

  window.StatsPanel = StatsPanel;
})();
