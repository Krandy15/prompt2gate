"use strict";

/**
 * Central configuration. Every other module reads env/limits from here —
 * nothing else should touch process.env directly.
 */

require("dotenv").config();

const list = (v, fallback) => {
  const arr = String(v || "").split(",").map((s) => s.trim()).filter(Boolean);
  return arr.length ? arr : fallback;
};
const int = (v, fallback) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const DEFAULT_GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite"];

function geminiModelChain() {
  const primary = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL.trim()] : [];
  const chain = [...primary, ...list(process.env.GEMINI_MODELS, DEFAULT_GEMINI_MODELS)];
  return [...new Set(chain)];
}

const provider = (process.env.LLM_PROVIDER || "gemini").trim().toLowerCase();

const config = {
  port: int(process.env.PORT, 8787),
  logLevel: (process.env.LOG_LEVEL || "info").toLowerCase(),

  llm: {
    provider: provider === "ollama" ? "ollama" : "gemini",
    temperature: 0.15,
    maxOutputTokens: 4096,
    requestTimeoutMs: 60_000,
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || "",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      models: geminiModelChain(),
    },
    ollama: {
      url: process.env.OLLAMA_URL || "http://localhost:11434/v1/chat/completions",
      model: process.env.OLLAMA_MODEL || "qwen2.5-coder:7b",
    },
  },

  pipeline: {
    maxCompileAttempts: 2,   // stage 2 self-heal
    maxTestbenchAttempts: 2, // stage 3-4 self-heal
  },

  limits: {
    maxPromptChars: 4000,
    maxVerilogChars: 60_000,   // for /api/resynthesize + export
    jsonBodyLimit: "1mb",
    maxToolOutputBytes: 1_000_000, // cap per stdout/stderr of any EDA tool
    maxVcdBytes: 5_000_000,
  },

  timeouts: {
    iverilogMs: 15_000,
    vvpMs: 20_000,   // simulation guard against infinite loops / missing $finish
    yosysMs: 45_000,
    dotMs: 20_000,
    versionCheckMs: 5_000,
  },

  tools: {
    iverilog: process.env.IVERILOG_BIN || "iverilog",
    vvp: process.env.VVP_BIN || "vvp",
    yosys: process.env.YOSYS_BIN || "yosys",
    dot: process.env.DOT_BIN || "dot",
  },
};

module.exports = Object.freeze(config);
