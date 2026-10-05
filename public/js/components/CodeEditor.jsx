/* CodeEditor — Verilog editor: highlighted <pre> under a transparent <textarea>, no external library.
   Props: value, onChange?(code), readOnly?, title?, filename?,
          onRelint?(code) -> Promise<[{line, severity, message}]>, onResynthesize?(code) -> Promise<{ok, message}>
   The Re-lint / Re-synthesize buttons only render when their handler is passed. */
(function () {
  const { useState, useEffect, useRef, useMemo } = React;
  const LH = 20, PAD = 10;

  const KW = new Set("module endmodule begin end if else case casez casex endcase default for while repeat forever always initial assign posedge negedge or and not function endfunction task endtask generate endgenerate genvar localparam parameter defparam wait fork join".split(" "));
  const TY = new Set("wire reg integer real time signed unsigned tri supply0 supply1".split(" "));
  const DIR = new Set(["input", "output", "inout"]);
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const TOKEN = /(\/\/.*|\/\*[\s\S]*?(?:\*\/|$))|("(?:[^"\\\n]|\\.)*")|(`\w+)|(\$\w+)|(\b\d*'[sS]?[bBoOdDhH][0-9a-fA-F_xXzZ?]+|\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_]\w*\b)|([<>=!&|^~+\-*\/%?:#@]+)/g;

  function highlight(src) {
    let out = "", last = 0, m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(src))) {
      out += esc(src.slice(last, m.index));
      const t = esc(m[0]);
      let cls = null;
      if (m[1]) cls = "cm"; else if (m[2]) cls = "st"; else if (m[3]) cls = "dir"; else if (m[4]) cls = "sys";
      else if (m[5]) cls = "num";
      else if (m[6]) cls = KW.has(m[0]) ? "kw" : TY.has(m[0]) ? "ty" : DIR.has(m[0]) ? "dir" : null;
      else if (m[7]) cls = "op";
      out += cls ? `<span class="tk-${cls}">${t}</span>` : t;
      last = m.index + m[0].length;
      if (m[0].length === 0) TOKEN.lastIndex++;
    }
    return out + esc(src.slice(last)) + "\n ";
  }

  function CodeEditor({ value = "", onChange, readOnly = false, title = "RTL / Verilog", filename, onRelint, onResynthesize }) {
    const [code, setCode] = useState(value);
    const [cursor, setCursor] = useState({ line: 1, col: 1 });
    const [msgs, setMsgs] = useState([]);
    const [busy, setBusy] = useState(null); // "lint" | "synth"
    const [status, setStatus] = useState(null);
    const ta = useRef(null), scroller = useRef(null);

    useEffect(() => {
      setCode(value); setMsgs([]); setStatus(null); setCursor({ line: 1, col: 1 });
      if (scroller.current) scroller.current.scrollTo(0, 0); // new design -> start at the top
    }, [value]);

    const html = useMemo(() => highlight(code), [code]);
    const lineCount = code.split("\n").length;
    const marks = useMemo(() => {
      const m = {};
      msgs.forEach((x) => { if (!m[x.line] || x.severity === "error") m[x.line] = x.severity; });
      return m;
    }, [msgs]);

    const update = (next) => { setCode(next); onChange && onChange(next); };
    const trackCursor = () => {
      const el = ta.current; if (!el) return;
      const before = el.value.slice(0, el.selectionStart).split("\n");
      setCursor({ line: before.length, col: before[before.length - 1].length + 1 });
    };
    const jump = (line) => {
      const el = ta.current; if (!el) return;
      const idx = code.split("\n").slice(0, line - 1).join("\n").length + (line > 1 ? 1 : 0);
      el.focus(); el.setSelectionRange(idx, idx); trackCursor();
      const sc = scroller.current;
      if (sc) sc.scrollTo({ top: Math.max(0, (line - 1) * LH - sc.clientHeight / 2), behavior: "smooth" });
    };
    const onKeyDown = (e) => {
      if (e.key === "Tab" && !readOnly) {
        e.preventDefault();
        const el = e.target; el.setRangeText("    ", el.selectionStart, el.selectionEnd, "end");
        update(el.value);
      }
    };

    const run = async (kind) => {
      setBusy(kind); setStatus(null);
      try {
        if (kind === "lint") {
          const res = await onRelint(code); setMsgs(res || []);
          const errs = (res || []).filter((r) => r.severity === "error").length;
          setStatus({ ok: !errs, text: errs ? `${errs} error(s)` : `lint clean${res && res.length ? ` · ${res.length} note(s)` : ""}` });
        } else {
          const res = await onResynthesize(code); setStatus({ ok: res.ok, text: res.message });
        }
      } catch (err) { setStatus({ ok: false, text: String(err.message || err) }); }
      setBusy(null);
    };

    return (
      <section className="p2g p2g-panel p2g-ed" style={{ height: "100%" }}>
        <header className="p2g-head">
          <div className="p2g-title">{title}<i> //</i></div>
          {filename && <span style={{ fontSize: 11, color: "var(--dim)" }}>{filename}{code !== value ? " ●" : ""}</span>}
          {code !== value && !readOnly && <button className="p2g-btn" onClick={() => update(value)}>Revert</button>}
          {onRelint && <button className="p2g-btn" disabled={!!busy} onClick={() => run("lint")}>{busy === "lint" ? "Linting…" : "Re-lint"}</button>}
          {onResynthesize && <button className="p2g-btn hot" disabled={!!busy} onClick={() => run("synth")}>{busy === "synth" ? "Synthesizing…" : "Re-synthesize"}</button>}
        </header>

        <div className="p2g-ed-scroll" ref={scroller}>
          <div className="p2g-ed-inner">
            <div className="p2g-ed-gutter" aria-hidden="true">
              {Array.from({ length: lineCount }, (_, i) => {
                const n = i + 1, c = (n === cursor.line ? "cur " : "") + (marks[n] || "");
                return <div key={n} className={c} onClick={marks[n] ? () => jump(n) : undefined}>{n}</div>;
              })}
            </div>
            <div className="p2g-ed-code">
              <div className="p2g-ed-line" style={{ top: PAD + (cursor.line - 1) * LH }} />
              <pre className="p2g-ed-pre" aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />
              <textarea ref={ta} className="p2g-ed-ta" value={code} readOnly={readOnly} spellCheck={false}
                autoCapitalize="off" autoCorrect="off" aria-label="Verilog source"
                onChange={(e) => update(e.target.value)} onKeyDown={onKeyDown}
                onKeyUp={trackCursor} onClick={trackCursor} onSelect={trackCursor} />
            </div>
          </div>
        </div>

        {msgs.length > 0 && (
          <div className="p2g-ed-msgs">
            {msgs.map((m, i) => (
              <div key={i} className="p2g-ed-msg" onClick={() => jump(m.line)}>
                <span className={"sev " + m.severity}>{m.severity}</span><span>L{m.line}</span><span>{m.message}</span>
              </div>
            ))}
          </div>
        )}
        <footer className="p2g-ed-status">
          <span>Ln {cursor.line}, Col {cursor.col}</span><span>{lineCount} lines</span><span>Verilog-2001</span>
          {readOnly && <span>read-only</span>}
          {status && <span className={status.ok ? "ok" : "bad"} style={{ marginLeft: "auto" }}>{status.ok ? "✔" : "✖"} {status.text}</span>}
        </footer>
      </section>
    );
  }

  window.CodeEditor = CodeEditor;
})();
