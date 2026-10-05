"use strict";

/**
 * Server-side module/port extraction (badges + testbench prompt).
 * parseModule(src) -> null | { name, ports:[{name, dir, range, width, msb, lsb, isReg, signed}],
 *                              parameters:{}, clock, reset:{name, activeLow}|null, sequential }
 * Same { name, ports:[{name, dir, range}] } core shape as the client-side parser.
 */

const strip = (s) => String(s || "").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

/** Index of the paren matching the "(" at `open`. */
function matchParen(s, open) {
  let d = 0;
  for (let k = open; k < s.length; k++) {
    if (s[k] === "(") d++;
    else if (s[k] === ")" && --d === 0) return k;
  }
  return -1;
}

function splitTop(s) {
  const out = []; let d = 0, cur = "";
  for (const ch of s) {
    if ("([{".includes(ch)) d++;
    else if (")]}".includes(ch)) d--;
    if (ch === "," && d === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function evalExpr(expr, params) {
  const sub = expr.replace(/[A-Za-z_]\w*/g, (id) => (id in params ? String(params[id]) : "NaN"));
  if (!/^[\d\s+\-*/()]+$/.test(sub)) return null;
  try { const v = Function(`"use strict"; return (${sub});`)(); return Number.isFinite(v) ? Math.trunc(v) : null; } catch { return null; }
}

function parseParams(text, params) {
  for (const m of text.matchAll(/\b(?:parameter|localparam)\b\s*(?:\[[^\]]*\]\s*)?(?:signed\s+)?([\s\S]*?)(?=;|$)/g)) {
    for (const part of splitTop(m[1])) {
      const kv = part.match(/^\s*(?:(?:parameter|localparam)\s+)?(?:\[[^\]]*\]\s*)?(\w+)\s*=\s*([^,]+)$/);
      if (kv) { const v = evalExpr(kv[2].trim(), params); if (v !== null) params[kv[1]] = v; }
    }
  }
}

function describe(rangeText, params) {
  const range = rangeText ? rangeText.replace(/\s+/g, "") : "";
  if (!range) return { range: "", width: 1, msb: 0, lsb: 0 };
  const [a, b] = range.slice(1, -1).split(":");
  const msb = evalExpr(a, params), lsb = evalExpr(b ?? "0", params);
  return { range, width: msb !== null && lsb !== null ? Math.abs(msb - lsb) + 1 : null, msb, lsb };
}

function parseDecl(text, state, params, ports, known) {
  let t = text.replace(/\s+/g, " ").trim();
  if (!t) return;
  const dm = t.match(/^(input|output|inout)\b/);
  if (dm) { state.dir = dm[1]; state.range = ""; state.isReg = false; state.signed = false; t = t.slice(dm[0].length); }
  if (!state.dir) return;
  if (/\breg\b/.test(t)) state.isReg = true;
  if (/\bsigned\b/.test(t)) state.signed = true;
  t = t.replace(/\b(wire|reg|logic|signed|tri)\b/g, "").trim();
  const rm = t.match(/\[[^\]]+\]/);
  if (rm) { state.range = rm[0]; t = t.replace(rm[0], "").trim(); }
  const name = (t.match(/(\w+)\s*(?:=.*)?$/) || [])[1];
  if (!name || (known && !known.has(name))) return;
  ports.push({ name, dir: state.dir, ...describe(state.range, params), isReg: state.isReg, signed: state.signed });
}

function parseModule(src) {
  const clean = strip(src);
  const head = clean.match(/\bmodule\s+(\w+)/);
  if (!head) return null;
  let pos = head.index + head[0].length;
  const params = {};

  const skipWs = () => { while (/\s/.test(clean[pos] || "")) pos++; };
  skipWs();
  if (clean[pos] === "#") {
    pos++; skipWs();
    const end = matchParen(clean, pos);
    if (end === -1) return null;
    parseParams(clean.slice(pos + 1, end), params);
    pos = end + 1; skipWs();
  }
  if (clean[pos] !== "(") return null;
  const end = matchParen(clean, pos);
  if (end === -1) return null;
  const header = clean.slice(pos + 1, end);
  const bodyEnd = clean.indexOf("endmodule", end);
  const body = clean.slice(end + 1, bodyEnd === -1 ? undefined : bodyEnd);
  parseParams(body, params);

  const entries = splitTop(header);
  const ansi = entries.some((e) => /^\s*(input|output|inout)\b/.test(e));
  const ports = [];
  const state = { dir: null, range: "", isReg: false, signed: false };

  if (ansi) {
    for (const e of entries) parseDecl(e, state, params, ports, null);
  } else {
    const names = new Set(entries.map((e) => e.trim()).filter(Boolean));
    for (const m of body.matchAll(/\b(input|output|inout)\b([^;]*);/g)) {
      const s = { dir: m[1], range: "", isReg: false, signed: false };
      for (const piece of splitTop(m[2])) parseDecl(piece, s, params, ports, names);
    }
    // keep header order
    const order = [...names];
    ports.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  }
  if (!ports.length) return null;

  const clock = (ports.find((p) => p.dir === "input" && /^(clk|clock)/i.test(p.name)) || {}).name || null;
  const rst = ports.find((p) => p.dir === "input" && /(^|_)(rst|reset|resetn|rstn)(_n|_ni)?$|^(rst|reset)/i.test(p.name));
  const reset = rst ? { name: rst.name, activeLow: /(_n|n|_ni)$/i.test(rst.name) && /rst|reset/i.test(rst.name) } : null;
  return {
    name: head[1], ports, parameters: params, clock, reset,
    sequential: /\b(posedge|negedge)\b/.test(clean),
  };
}

module.exports = { parseModule };
