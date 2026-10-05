"use strict";

const config = require("../../config");
const { callGemini, checkGeminiKey } = require("./geminiClient");
const { callOllama, checkOllama } = require("./ollamaClient");

/** The one entry point the pipeline uses. Returns { text, model, provider, truncated }. */
async function callLLM({ messages, temperature, maxTokens }) {
  const provider = config.llm.provider;
  const impl = provider === "ollama" ? callOllama : callGemini;
  const result = await impl({ messages, temperature, maxTokens });
  return { ...result, provider };
}

const getModelChain = () =>
  config.llm.provider === "ollama" ? [config.llm.ollama.model] : [...config.llm.gemini.models];
const getPrimaryModel = () => getModelChain()[0];
const getProvider = () => config.llm.provider;

/** For /api/health?deep=1 and startup banner. */
const checkProvider = () => (config.llm.provider === "ollama" ? checkOllama() : checkGeminiKey());
const hasCredentials = () => config.llm.provider === "ollama" || !!config.llm.gemini.apiKey;

module.exports = { callLLM, getModelChain, getPrimaryModel, getProvider, checkProvider, hasCredentials };
