window.PipelineStatus = function PipelineStatus({ stages, status, onRetry }) {
  return (
    <section className="pipeline">
      <div className="steps">
        {window.P2G_STAGES.map((s, i) => (
          <div key={s.id} className={`step step--${stages[s.id]}`} title={s.hint}>
            <span className="step__n">STEP {i + 1}</span>
            <span className="step__name">{s.label}</span>
          </div>
        ))}
      </div>
      {status === "error" && onRetry && (
        <button className="btn btn--ghost pipeline__reset" onClick={onRetry}>Reset pipeline</button>
      )}
    </section>
  );
};