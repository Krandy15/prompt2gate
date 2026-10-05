"use strict";
const test = require("node:test");
const assert = require("node:assert");
const config = require("../../config");
const { callGemini, toGeminiPayload } = require("../../lib/llm/geminiClient");

const realFetch = global.fetch;
test.afterEach(() => { global.fetch = realFetch; });

const ok = (text, extra = {}) => ({
  ok: true, status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP", ...extra }] }),
});
const err = (status, message) => ({
  ok: false, status, text: async () => JSON.stringify({ error: { message } }),
});

function setup(models = ["m1", "m2"]) {
  config.llm.gemini.apiKey = "test-key";
  config.llm.gemini.models = models;
}

test("payload: system -> systemInstruction, assistant -> model, thinking off for 2.5-flash", () => {
  const p = toGeminiPayload(
    [{ role: "system", content: "SYS" }, { role: "user", content: "hi" }, { role: "assistant", content: "yo" }],
    { temperature: 0.1, maxTokens: 99, model: "gemini-2.5-flash" }
  );
  assert.strictEqual(p.systemInstruction.parts[0].text, "SYS");
  assert.deepStrictEqual(p.contents.map((c) => c.role), ["user", "model"]);
  assert.strictEqual(p.generationConfig.maxOutputTokens, 99);
  assert.strictEqual(p.generationConfig.thinkingConfig.thinkingBudget, 0);
  assert.strictEqual(
    toGeminiPayload([{ role: "user", content: "x" }], { temperature: 0, maxTokens: 1, model: "gemini-2.0-pro" })
      .generationConfig.thinkingConfig, undefined);
});

test("falls back to the next model on 429", async () => {
  setup();
  const calls = [];
  global.fetch = async (url) => { calls.push(url); return calls.length === 1 ? err(429, "quota") : ok("module x; endmodule"); };
  const r = await callGemini({ messages: [{ role: "user", content: "q" }] });
  assert.strictEqual(r.model, "m2");
  assert.strictEqual(r.text, "module x; endmodule");
  assert.ok(calls[0].includes("m1:generateContent"));
});

test("bad API key fails fast without trying other models", async () => {
  setup();
  let n = 0;
  global.fetch = async () => { n++; return err(400, "API key not valid. Please pass a valid API key."); };
  await assert.rejects(callGemini({ messages: [{ role: "user", content: "q" }] }), (e) => e.fatal === true);
  assert.strictEqual(n, 1);
});

test("all models failing aggregates the reasons", async () => {
  setup();
  global.fetch = async () => err(503, "overloaded");
  await assert.rejects(callGemini({ messages: [{ role: "user", content: "q" }] }), /All Gemini models failed.*m1.*m2/);
});

test("skips thought parts and flags truncation", async () => {
  setup(["m1"]);
  global.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "secret", thought: true }, { text: "module a;" }] } }] }),
  });
  const r = await callGemini({ messages: [{ role: "user", content: "q" }] });
  assert.strictEqual(r.text, "module a;");
  assert.strictEqual(r.truncated, true);
});

test("missing key is a fatal, readable error", async () => {
  config.llm.gemini.apiKey = "";
  await assert.rejects(callGemini({ messages: [] }), (e) => e.fatal && /GEMINI_API_KEY/.test(e.message));
});
