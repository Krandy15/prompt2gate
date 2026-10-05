window.ComplexityBadges = function ComplexityBadges({ result }) {
  if (!result) return null;
  const s = result.stats || {};
  const gates = s.gates ?? 0;
  const level = gates < 50 ? "LOW" : gates < 200 ? "MEDIUM" : "HIGH";
  // quick port count from RTL text (server provides this later)
  const ports = ((result.rtl || "").match(/\b(input|output|inout)\b/g) || []).length;

  return (
    <div className="badges">
      <span className={`badge badge--${level.toLowerCase()}`}>{level}</span>
      <span className="badge">{ports} ports</span>
      <span className="badge">{gates} gates</span>
      <span className="badge">{s.flipFlops ?? 0} FFs</span>
    </div>
  );
};