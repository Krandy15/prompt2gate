"use strict";

const config = require("../../config");
const log = require("../util/logger")("gemini");

/**
 * Google Gemini (generateContent REST API) with automatic model fallback.
 * Takes OpenAI-style messages [{role: system|user|assistant, content}] so the
 * pipeline is provider-agnostic. Fallback: rate limit / overload / unknown model
 * -> try the next model in config.llm.gemini.models. Bad key -> fail fast.
 */

const FALLBACK_STATUS = new Set([400, 404, 408, 429, 500, 502, 503, 504]);

function toGeminiPayload(messages, { temperature, maxTokens, model }) {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));

  const body = { contents, generationConfig: { temperature, maxOutputTokens: maxTokens } };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  // 2.5-flash "thinking" tokens count against maxOutputTokens and add latency; RTL gen doesn't need them.
  if (/gemini-2\.5-flash/i.test(model)) body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
  return body;
}

function textFrom(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("");
}

async function errorMessage(res) {
  const raw = await res.text().catch(() => "");
  try {
    const m = JSON.parse(raw)?.error?.message;
    if (m) return `${res.status}: ${m}`;
  } catch {}
  return `${res.status}: ${raw.slice(0, 300)}`;
}

function fatal(message) {
  const err = new Error(message);
  err.fatal = true;
  return err;
}

async function callGemini({ messages, temperature = config.llm.temperature, maxTokens = config.llm.maxOutputTokens }) {
  const { apiKey, baseUrl, models } = config.llm.gemini;
  if (!apiKey) {
    throw fatal("GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey and put it in .env");
  }

  const failures = [];
  for (const model of models) {
    const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`;
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(toGeminiPayload(messages, { temperature, maxTokens, model })),
        signal: AbortSignal.timeout(config.llm.requestTimeoutMs),
      });
    } catch (err) {
      failures.push(`${model} -> network error: ${err.message}`);
      continue;
    }

    if (!res.ok) {
      const msg = await errorMessage(res);
      if (res.status === 401 || res.status === 403 || (res.status === 400 && /api key/i.test(msg))) {
        throw fatal(`Gemini rejected the API key (${msg}). Check GEMINI_API_KEY in .env.`);
      }
      failures.push(`${model} -> ${msg}`);
      if (FALLBACK_STATUS.has(res.status)) {
        log.warn(`${model} failed (${res.status}), trying next model`);
        continue;
      }
      throw new Error(`Gemini API error ${msg}`);
    }

    const data = await res.json();
    const text = textFrom(data);
    const finishReason = data?.candidates?.[0]?.finishReason;
    if (!text) {
      const blocked = data?.promptFeedback?.blockReason;
      failures.push(`${model} -> empty response (${blocked ? "blocked: " + blocked : "finishReason=" + finishReason})`);
      continue;
    }
    return { text, model, finishReason, truncated: finishReason === "MAX_TOKENS" };
  }

  throw new Error(`All Gemini models failed. ${failures.join(" | ")}`.slice(0, 900));
}

/** Cheap key check: lists one model (no generation tokens used). */
async function checkGeminiKey() {
  const { apiKey, baseUrl } = config.llm.gemini;
  if (!apiKey) return { ok: false, reason: "GEMINI_API_KEY not set" };
  try {
    const res = await fetch(`${baseUrl}/models?pageSize=1`, {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(8000),
    });
    return res.ok ? { ok: true } : { ok: false, reason: await errorMessage(res) };
  } catch (err) {
    return { ok: false, reason: `network error: ${err.message}` };
  }
}

module.exports = { callGemini, checkGeminiKey, toGeminiPayload };
