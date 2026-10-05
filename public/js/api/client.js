// Streams POST /api/synthesize/stream (NDJSON). Calls onEvent for every parsed line:
//   {type:"log", log:{type,text}} | {type:"done", result:{...}} | {type:"error", error:"..."}
window.P2G_API = {
  async synthesizeStream(prompt, onEvent, signal) {
    const base = (window.P2G_CONFIG && window.P2G_CONFIG.API_BASE) || "";
    const res = await fetch(base + "/api/synthesize/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
      signal,
    });
    if (!res.ok) {
      let msg = "HTTP " + res.status;
      try { msg = (await res.json()).error || msg; } catch (e) { /* ignore */ }
      throw new Error(msg);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const flush = (line) => {
      line = line.trim();
      if (!line) return;
      try { onEvent(JSON.parse(line)); } catch (e) { /* ignore malformed line */ }
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) { flush(buf.slice(0, nl)); buf = buf.slice(nl + 1); }
    }
    flush(buf);
  },
};
