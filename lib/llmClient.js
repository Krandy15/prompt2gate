"use strict";

/**
 * Groq (OpenAI-compatible) client with automatic model fallback.
 *
 * Why fallback: Groq free-tier limits are PER MODEL (e.g. gpt-oss-20b = 8K tokens/min,
 * llama-3.1-8b-instant = 6K, llama-3.3-70b = 12K, llama-4-scout = 30K), and Groq
 * reserves your `max_tokens` against that budget up front. So a big max_tokens can
 * trigger 429/413 even on a tiny prompt. We keep max_tokens small and, if a model is
 * rate-limited, transparently try the next one (each has its own quota).
 */

const LLM_URL = process.env.LLM_URL || "https://api.groq.com/openai/v1/chat/completions";
const MODELS_URL = LLM_URL.replace(/\/chat\/completions$/, "/models");

// Ordered by free-tier TPM headroom. Override with GROQ_MODEL / GROQ_FALLBACK_MODELS.
const DEFAULT_MODELS = [
  "meta-llama/llama-4-scout-17b-16e-instruct", // 30K TPM, 500K TPD
  "llama-3.3-70b-versatile",                   // 12K TPM, 100K TPD
  "openai/gpt-oss-20b",                        //  8K TPM, 200K TPD
  "llama-3.1-8b-instant",                      //  6K TPM, 500K TPD
];

function getModelChain() {
  const primary = process.env.GROQ_MODEL ? [process.env.GROQ_MODEL.trim()] : [];
  const extra = (process.env.GROQ_FALLBACK_MODELS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const chain = [...primary, ...(extra.length ? extra : DEFAULT_MODELS)];
  return [...new Set(chain)];
}
const getModel = () => getModelChain()[0];

function parseGroqError(status, raw) {
  try {
    const m = JSON.parse(raw)?.error?.message;
    if (m) return `${status}: ${m}`;
  } catch {}
  return `${status}: ${String(raw).slice(0, 300)}`;
}

// Errors where trying a different model can help (rate/size limit, model gone/unavailable).
const isModelSpecific = (status) => [400, 404, 413, 429, 500, 503].includes(status);

async function callLLM({ messages, temperature = 0.15, maxTokens = 1500 }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set. Get a free key at https://console.groq.com/keys and put it in .env");
  }

  const failures = [];
  for (const model of getModelChain()) {
    const body = { model, temperature, max_tokens: maxTokens, messages };
    if (/gpt-oss/i.test(model)) body.reasoning_effort = "low";

    let res;
    try {
      res = await fetch(LLM_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      });
    } catch (err) {
      failures.push(`${model} -> network error: ${err.message}`);
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      const raw = await res.text().catch(() => "");
      throw new Error(`Groq rejected the API key (${parseGroqError(res.status, raw)}). Check GROQ_API_KEY in .env.`);
    }

    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      const msg = parseGroqError(res.status, raw);
      failures.push(`${model} -> ${msg}`);
      if (isModelSpecific(res.status)) continue; // try next model
      throw new Error(`LLM API error ${msg}`);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) {
      failures.push(`${model} -> empty response (finish_reason=${data?.choices?.[0]?.finish_reason})`);
      continue;
    }
    return { text, model };
  }

  throw new Error(`All models failed. ${failures.join(" | ")}`.slice(0, 900));
}

/** Cheap key check: lists models (no tokens consumed). */
async function checkKey() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { ok: false, reason: "GROQ_API_KEY not set" };
  try {
    const res = await fetch(MODELS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return { ok: true };
    return { ok: false, reason: parseGroqError(res.status, await res.text().catch(() => "")) };
  } catch (err) {
    return { ok: false, reason: `network error: ${err.message}` };
  }
}

function extractVerilog(rawText) {
  const closed = rawText.match(/```(?:verilog|systemverilog|v)?[ \t]*\r?\n([\s\S]*?)```/i);
  if (closed) return closed[1].trim();
  const open = rawText.match(/```(?:verilog|systemverilog|v)?[ \t]*\r?\n([\s\S]*)$/i);
  if (open) return open[1].trim();
  return rawText.trim();
}

module.exports = { callLLM, extractVerilog, getModel, getModelChain, checkKey };
