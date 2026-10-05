/* Parse the module header of Verilog source into a port list.
   Returns { name, ports:[{name, direction, width, msb, lsb, range}] } or null.
   Handles ANSI headers (with optional #(parameters)) and old-style non-ANSI headers. */
(function () {
  const strip = (s) => (s || "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  function widthOf(range) {
    if (!range) return { width: 1, msb: null, lsb: null };
    const m = range.match(/^\[\s*(\d+)\s*:\s*(\d+)\s*\]$/);
    if (m) { const msb = +m[1], lsb = +m[2]; return { width: Math.abs(msb - lsb) + 1, msb, lsb }; }
    return { width: null, msb: null, lsb: null }; // parametric, e.g. [AW-1:0]
  }

  function parseVerilogPorts(src) {
    const clean = strip(src);
    const m = clean.match(/\bmodule\s+(\w+)\s*(?:#\s*\([\s\S]*?\)\s*)?\(([\s\S]*?)\)\s*;/);
    if (!m) return null;
    const name = m[1], header = m[2], ports = [];
    const add = (nm, direction, range) =>
      ports.push({ name: nm, direction, range: range || "", ...widthOf(range) });

    if (/\b(input|output|inout)\b/.test(header)) {
      let dir = null, range = "";
      for (const raw of header.split(",")) {
        let t = raw.replace(/\s+/g, " ").trim();
        if (!t) continue;
        const dm = t.match(/^(input|output|inout)\b/);
        if (dm) { dir = dm[1]; range = ""; t = t.slice(dm[0].length); }
        t = t.replace(/\b(wire|reg|logic|signed|tri)\b/g, "").trim();
        const rm = t.match(/\[[^\]]+\]/);
        if (rm) { range = rm[0].replace(/\s+/g, ""); t = t.replace(rm[0], "").trim(); }
        const nm = (t.match(/(\w+)\s*$/) || [])[1];
        if (nm && dir) add(nm, dir, range);
      }
    } else {
      // Non-ANSI: names in header, directions declared in the body.
      const body = clean.slice(m.index + m[0].length).split(/\bendmodule\b/)[0];
      const re = /\b(input|output|inout)\b\s*(?:wire|reg|signed)?\s*(\[[^\]]+\])?\s*([\w\s,]+);/g;
      let d;
      while ((d = re.exec(body))) {
        const range = d[2] ? d[2].replace(/\s+/g, "") : "";
        d[3].split(",").map((s) => s.trim()).filter(Boolean).forEach((nm) => add(nm, d[1], range));
      }
    }
    return ports.length ? { name, ports } : null;
  }

  /* Label like "count[3:0]" for a port object from either parser or mock data. */
  function portLabel(p) {
    if (p.range) return p.name + p.range;
    return p.width > 1 ? `${p.name}[${p.width - 1}:0]` : p.name;
  }

  window.parseVerilogPorts = parseVerilogPorts;
  window.portLabel = portLabel;
})();
