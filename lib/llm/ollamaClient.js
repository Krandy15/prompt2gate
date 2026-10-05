"use strict";

const config = require("../../config");

/**
 * Offline fallback: any OpenAI-compatible local server (Ollama default).
 * No key, no fallback chain — one model, clear error if the server is down.
 */

const modelsUrl = () => config.llm.ollama.url.replace(/\/chat\/completions\/?$/, "/models");

async function callOllama({ messages, temperature = config.llm.temperature, maxTokens = config.llm.maxOutputTokens }) {
  const { url, model } = config.llm.ollama;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream: false }),
      // local models on CPU are slow — give them 3x the cloud timeout
      signal: AbortSignal.timeout(config.llm.requestTimeoutMs * 3),
    });
  } catch (err) {
    throw Object.assign(
      new Error(`Ollama not reachable at ${url} (${err.message}). Is 'ollama serve' running and '${model}' pulled?`),
      { fatal: true }
    );
  }

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    throw new Error(`Ollama error ${res.status}: ${raw.slice(0, 300)}`);
  }
  const data = await res.json();
  const choice = data?.choices?.[0];
  const text = choice?.message?.content;
  if (!text) throw new Error(`Ollama returned an empty response (finish_reason=${choice?.finish_reason})`);
  return { text, model, finishReason: choice.finish_reason, truncated: choice.finish_reason === "length" };
}

async function checkOllama() {
  try {
    const res = await fetch(modelsUrl(), { signal: AbortSignal.timeout(4000) });
    return res.ok ? { ok: true } : { ok: false, reason: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, reason: `not reachable: ${err.message}` };
  }
}

module.exports = { callOllama, checkOllama };
