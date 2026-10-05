"use strict";

require("dotenv").config();
const path = require("path");
const { execFile } = require("child_process");
const express = require("express");
const cors = require("cors");
const { runPipeline } = require("./lib/verilogPipeline");

const {
  checkProvider,
  getModelChain,
  getProvider,
  hasCredentials,
} = require("./lib/llm/provider");

const MAX_PROMPT_CHARS = 4000;

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Serves public/index.html at "/" plus any other static assets.
app.use(express.static(path.join(__dirname, "public")));

function hasTool(cmd, args = ["-V"]) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 5000 }, (err) => resolve(!err));
  });
}

const checkIverilog = () => hasTool("iverilog");

// /api/health
// /api/health?deep=1 -> also validates the configured LLM provider key
app.get("/api/health", async (req, res) => {
  const out = {
    ok: true,
    provider: getProvider(),
    hasApiKey: hasCredentials(),
    hasIverilog: await checkIverilog(),
    hasYosys: await hasTool("yosys"),
    hasGraphviz: await hasTool("dot"),
    models: getModelChain(),
  };

  if (req.query.deep) {
    out.keyCheck = await checkProvider();
  }

  res.json(out);
});

function readPrompt(req, res) {
  const prompt = (req.body?.prompt || "").trim();

  if (!prompt) {
    res.status(400).json({
      error: "Missing 'prompt' in request body.",
    });
    return null;
  }

  if (prompt.length > MAX_PROMPT_CHARS) {
    res.status(413).json({
      error: `Prompt too long (max ${MAX_PROMPT_CHARS} characters).`,
    });
    return null;
  }

  return prompt;
}

// Single JSON response
app.post("/api/synthesize", async (req, res) => {
  const prompt = readPrompt(req, res);

  if (!prompt) return;

  try {
    res.json(await runPipeline(prompt));
  } catch (err) {
    res.status(500).json({
      error: err.message || "Pipeline failed",
    });
  }
});

// NDJSON stream: one event per line
// {type:"log"|"done"|"error", ...}
app.post("/api/synthesize/stream", async (req, res) => {
  const prompt = readPrompt(req, res);

  if (!prompt) return;

  res.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  res.flushHeaders?.();

  let clientGone = false;

  res.on("close", () => {
    clientGone = true;
  });

  const sendLine = (obj) => {
    if (!clientGone) {
      res.write(JSON.stringify(obj) + "\n");
    }
  };

  try {
    const result = await runPipeline(prompt, (log) => {
      sendLine({
        type: "log",
        log,
      });
    });

    sendLine({
      type: "done",
      result,
    });
  } catch (err) {
    sendLine({
      type: "error",
      error: err.message || "Pipeline failed",
    });
  } finally {
    if (!clientGone) {
      res.end();
    }
  }
});

const PORT = process.env.PORT || 8787;

app.listen(PORT, async () => {
  console.log(
    `Prompt2Gate backend listening on http://localhost:${PORT}`
  );

  const provider = getProvider();
  const keyCheck = await checkProvider();

  if (!keyCheck.ok) {
    console.warn(
      `WARNING: ${provider} key check failed — ${keyCheck.reason}`
    );
  } else {
    console.log(
      `${provider} key OK. Model order: ${getModelChain().join(" -> ")}`
    );
  }

  if (!(await checkIverilog())) {
    console.warn(
      "WARNING: iverilog not found on PATH — compile step will fail."
    );
  }
});