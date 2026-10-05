"use strict";

/**
 * VCD text -> { timescale, endTime, signals:[{ name, scope, width, transitions:[{t, v}], truncated? }] }
 * v is a binary string ("0","1","x","z","1010","xxzz"); vectors are left-padded to `width`
 * (VCD omits leading zeros). Aliased ids produce one signal per name. Consecutive duplicate
 * values are dropped. Each signal is capped at maxTransitions to keep payloads small.
 */
function parseVcd(text, { maxTransitions = 5000 } = {}) {
  const tok = String(text || "").split(/\s+/).filter(Boolean);
  const byId = new Map();
  const signals = [];
  const scope = [];
  let timescale = "";
  let time = 0;
  let endTime = 0;
  let i = 0;

  const skipToEnd = () => { while (i < tok.length && tok[i] !== "$end") i++; i++; };
  const collectToEnd = () => { const out = []; while (i < tok.length && tok[i] !== "$end") out.push(tok[i++]); i++; return out; };

  const record = (id, raw) => {
    for (const sig of byId.get(id) || []) {
      let v = raw.toLowerCase();
      if (sig.width > 1 && v.length < sig.width) {
        const pad = /^[xz]/.test(v) ? v[0] : "0";
        v = pad.repeat(sig.width - v.length) + v;
      }
      const last = sig.transitions[sig.transitions.length - 1];
      if (last && last.v === v) continue;
      if (sig.transitions.length >= maxTransitions) { sig.truncated = true; continue; }
      sig.transitions.push({ t: time, v });
    }
  };

  while (i < tok.length) {
    const t = tok[i++];
    if (t === "$timescale") timescale = collectToEnd().join("");
    else if (t === "$scope") { const a = collectToEnd(); scope.push(a[1] || a[0] || ""); }
    else if (t === "$upscope") { skipToEnd(); scope.pop(); }
    else if (t === "$var") {
      const a = collectToEnd(); // type size id name [range]
      const [, size, id, name] = a;
      if (id && name) {
        const sig = { name, scope: scope.join("."), width: parseInt(size, 10) || 1, transitions: [] };
        signals.push(sig);
        if (!byId.has(id)) byId.set(id, []);
        byId.get(id).push(sig);
      }
    }
    else if (t === "$comment" || t === "$date" || t === "$version") skipToEnd();
    else if (t[0] === "$") continue; // $enddefinitions, $dumpvars, $end, ...
    else if (t[0] === "#") { time = parseInt(t.slice(1), 10) || 0; endTime = Math.max(endTime, time); }
    else if (/^[bB]/.test(t)) record(tok[i++], t.slice(1));
    else if (/^[rR]/.test(t)) i++; // real values: not drawn as digital waveforms
    else { const m = t.match(/^([01xXzZ])(\S+)$/); if (m) record(m[2], m[1]); }
  }
  return { timescale, endTime, signals };
}

module.exports = { parseVcd };
