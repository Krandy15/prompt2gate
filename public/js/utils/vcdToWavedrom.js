/* VCD -> waveform conversion.
   parseVCD(text)               -> { timescale, endTime, signals:[{name,width,changes:[[t,value]]}] }   (what WaveformViewer consumes)
   waveformToWavedrom(wf, opts) -> WaveDrom JSON { signal:[{name, wave, data?}] }                      (for WaveDrom export/tools)
   vcdToWavedrom(text, opts)    -> both steps in one call
   Values are numbers, or the strings "x" / "z" when a vector contains unknown/high-Z bits. */
(function () {
  function parseVCD(text) {
    const toks = String(text || "").split(/\s+/).filter(Boolean);
    const byId = {}, signals = [];
    let timescale = "1ns", time = 0, endTime = 0, i = 0, scope = [];

    const readUntilEnd = () => { const out = []; while (i < toks.length && toks[i] !== "$end") out.push(toks[i++]); i++; return out; };
    const conv = (bits) => /[xXzZ]/.test(bits) ? (/[xX]/.test(bits) ? "x" : "z") : parseInt(bits || "0", 2);
    const record = (id, v) => {
      const sig = byId[id]; if (!sig) return;
      const last = sig.changes[sig.changes.length - 1];
      if (last && last[0] === time) last[1] = v; else if (!last || last[1] !== v) sig.changes.push([time, v]);
    };

    while (i < toks.length) {
      const t = toks[i++];
      if (t === "$timescale") timescale = readUntilEnd().join("");
      else if (t === "$scope") { const a = readUntilEnd(); scope.push(a[1]); }
      else if (t === "$upscope") { readUntilEnd(); scope.pop(); }
      else if (t === "$var") {
        const [type, size, id, ...rest] = readUntilEnd();
        if (type === "parameter" || type === "real" || byId[id]) continue; // aliases share the first definition
        const sig = { name: rest.filter((r) => !/^\[.*\]$/.test(r)).join(""), width: +size || 1, changes: [], scope: scope.join(".") };
        byId[id] = sig; signals.push(sig);
      }
      else if (t[0] === "$") { if (!["$dumpvars", "$dumpon", "$dumpoff", "$end", "$enddefinitions"].includes(t)) readUntilEnd(); else if (t === "$enddefinitions") readUntilEnd(); }
      else if (t[0] === "#") { time = +t.slice(1); endTime = Math.max(endTime, time); }
      else if (/^[bB]/.test(t)) record(toks[i++], conv(t.slice(1)));
      else if (/^[01xXzZ]/.test(t) && t.length > 1) record(t.slice(1), conv(t[0]));
    }
    signals.forEach((s) => { if (!s.changes.length) s.changes.push([0, "x"]); });
    return { timescale, endTime, signals };
  }

  function waveformToWavedrom(wf, opts = {}) {
    const gaps = [];
    wf.signals.forEach((s) => s.changes.forEach((c, k) => { if (k) gaps.push(c[0] - s.changes[k - 1][0]); }));
    const period = opts.period || (gaps.length ? Math.min(...gaps.filter((g) => g > 0)) : 1) || 1;
    const n = Math.max(1, Math.ceil(wf.endTime / period));
    const at = (s, t) => { let v = "x"; for (const [ct, cv] of s.changes) { if (ct <= t) v = cv; else break; } return v; };
    return {
      signal: wf.signals.map((s) => {
        let wave = "", data = [], prev;
        for (let k = 0; k < n; k++) {
          const v = at(s, k * period);
          if (k && v === prev) wave += ".";
          else if (v === "x" || v === "z") wave += v;
          else if (s.width === 1) wave += String(v);
          else { wave += "="; data.push(v.toString(16)); }
          prev = v;
        }
        return s.width === 1 ? { name: s.name, wave } : { name: s.name, wave, data };
      }),
    };
  }

  window.parseVCD = parseVCD;
  window.waveformToWavedrom = waveformToWavedrom;
  window.vcdToWavedrom = (text, opts) => waveformToWavedrom(parseVCD(text), opts);
})();
