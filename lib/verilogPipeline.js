"use strict";

const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");

const {
  callLLM,
  getPrimaryModel,
  getProvider,
} = require("./llm/provider");
const { extractVerilog } = require("./llm/extract");

const { renderNetlistSvg } = require("./schematic");
const config = require("../config");
const { synthStat } = require("./eda/yosys");
const { parseYosysStats } = require("./parse/yosysStats");

const execFileAsync = promisify(execFile);
const MAX_ATTEMPTS = 2; // matches the "Max 2 Attempts" self-fix loop in the UI

const SYSTEM_PROMPT = `You are an expert digital-design engineer generating synthesizable Verilog-2001.
Rules:
- Output ONLY a single Verilog module in one \`\`\`verilog code fence. No prose before or after.
- Must be lint-clean under Icarus Verilog (iverilog) and avoid inferred latches:
  give every signal in a combinational always block a value on every path (use a default assignment
  at the top of the block, or a default case).
- Use non-blocking assignments (<=) in clocked (posedge/negedge) always blocks, and blocking (=) in
  purely combinational always @(*) blocks.
- Include a \`timescale directive and sensible port widths matching the request.
- Never use SystemVerilog keywords as identifiers (e.g. priority, unique, logic, bit, int, do, final).
- Round-robin arbiters: the rotating pointer must move to (index of the channel that was GRANTED) + 1,
  not simply increment by one; grant must be one-hot, and valid must be high only when a grant is issued.
- Reset style must follow the spec literally: "synchronous" means always @(posedge clk) with the reset
  checked inside it; only add "or negedge rst_n" / "or posedge rst" when the spec says asynchronous.
  Match the stated polarity (active-high -> rst, active-low -> rst_n).
- Counters and timers must reset to the load value of the initial state, not to zero, so the first
  state is held for its full duration.
- Pulse inputs (buttons, requests) must be latched into a pending register that is set when the input
  is seen and cleared only when the request is serviced, so a short press is never missed.
- FSMs: keep a state register and a separate next-state always @(*) block with a default
  assignment; keep a timer-load/enable decision separate from the state decode. Prefer testing a
  single state bit for one-hot encodings instead of comparing the whole state vector.
- Never leave dead branches (if/else with identical bodies), unused signals, or planning comments
  inside the code. Comments must describe the final design only.
- Do not include a testbench — module only.`;

function buildFixPrompt(originalPrompt, brokenCode, compilerLog) {
  return `The following Verilog module was generated for this spec:
"${originalPrompt}"

It failed to compile under Icarus Verilog. Fix ONLY what's needed to make it compile cleanly,
preserving the original intent and port names. Return the corrected module the same way
(one \`\`\`verilog fence, module only).

--- BROKEN CODE ---
${brokenCode}

--- COMPILER OUTPUT ---
${compilerLog}`;
}

/**
 * Runs `iverilog -Wall -g2001` on the source. Success = exit code 0
 * (warnings are surfaced in the log but don't fail the build).
 * Returns { success, log, missingTool } — missingTool means iverilog isn't installed,
 * which is an environment problem, not something the LLM can fix.
 */
async function tryCompile(verilogSource, workDir) {
  const srcPath = path.join(workDir, "module.v");
  const outPath = path.join(workDir, "a.out");

  await fs.writeFile(srcPath, verilogSource, "utf8");

  try {
    const { stdout, stderr } = await execFileAsync(
      config.tools.iverilog,
      ["-Wall", "-g2001", "-o", outPath, srcPath],
      { timeout: 15000 }
    );

    return {
      success: true,
      log: [stdout, stderr].filter(Boolean).join("\n").trim(),
    };
  } catch (err) {
    if (err.code === "ENOENT") {
      return {
        success: false,
        missingTool: true,
        log: "iverilog not found on PATH. Install it (apt-get install iverilog / brew install icarus-verilog).",
      };
    }

    const log =
      [err.stdout, err.stderr].filter(Boolean).join("\n").trim() ||
      err.message;

    return {
      success: false,
      log,
    };
  }
}

/**
 * NL prompt -> Verilog -> compile -> (on failure) self-heal -> compile again.
 */
async function runPipeline(userPrompt, onStage) {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "p2g-"));
  const logs = [];

  const push = (type, text) => {
    const entry = { type, text };
    logs.push(entry);

    if (onStage) {
      onStage(entry);
    }
  };

  try {
    push(
      "info",
      "[PROMPT2GATE] Ingesting natural language RTL specification..."
    );

    push(
      "info",
      `[LLM] Invoking ${getPrimaryModel()} via ${getProvider()}...`
    );

    let verilog;

    try {
      const { text, model } = await callLLM({
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
      });

      verilog = extractVerilog(text);

      if (model !== getPrimaryModel()) {
        push(
          "warn",
          `[LLM] Primary model unavailable; fell back to ${model}.`
        );
      }
    } catch (err) {
      push(
        "error",
        `[LLM] Generation failed: ${err.message}`
      );

      return {
        success: false,
        verilog: "",
        logs,
        attempts: 0,
        compilerLog: "",
      };
    }

    let attempt = 1;
    let compileResult = null;

    while (attempt <= MAX_ATTEMPTS) {
      push(
        "info",
        `[COMPILER - Attempt ${attempt}] Running iverilog -Wall -g2001 ...`
      );

      compileResult = await tryCompile(verilog, workDir);

      if (compileResult.success) {
        push(
          "success",
          `[COMPILER - Attempt ${attempt}] PASSED.${
            compileResult.log
              ? " Warnings: " + compileResult.log.slice(0, 300)
              : " Zero errors, zero warnings."
          }`
        );

        break;
      }

      push(
        "error",
        `[COMPILER - Attempt ${attempt}] FAILED:\n${compileResult.log.slice(
          0,
          800
        )}`
      );

      if (compileResult.missingTool) {
        break;
      }

      if (attempt >= MAX_ATTEMPTS) {
        push(
          "warn",
          "[SELF-HEALING LOOP] Max attempts reached. Returning last generated version."
        );

        break;
      }

      push(
        "fix",
        "[SELF-HEALING LOOP] Feeding compiler diagnostic back into LLM context window..."
      );

      try {
        const fix = await callLLM({
          messages: [
            {
              role: "system",
              content: SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: buildFixPrompt(
                userPrompt,
                verilog,
                compileResult.log.slice(0, 1500)
              ),
            },
          ],
        });

        verilog = extractVerilog(fix.text);
      } catch (err) {
        push(
          "error",
          `[SELF-HEALING LOOP] Fix request failed: ${err.message}`
        );

        break;
      }

      attempt += 1;
    }

    let schematicSvg = null;

    if (compileResult?.success) {
      push(
        "info",
        "[YOSYS] Elaborating netlist (proc; opt) for schematic view..."
      );

      // tryCompile wrote the *last* source to module.v, which is the one that passed.
      const net = await renderNetlistSvg(
        path.join(workDir, "module.v"),
        workDir
      );

      if (net.svg) {
        schematicSvg = net.svg;

        push(
          "success",
          "[YOSYS] Netlist rendered from your generated module."
        );
      } else {
        push(
          "warn",
          `[YOSYS] Skipped (${net.reason}). Showing port-level view instead.`
        );
      }
    }

    // Gate-level statistics (best effort: never fails the pipeline).
    let stats = null;

    if (compileResult?.success) {
      try {
        const st = await synthStat({ workDir, file: "module.v" });

        if (st.ok) {
          const parsed = parseYosysStats(st.stat);
          stats = {
            gates: parsed.gates,
            flipFlops: parsed.flipFlops,
            muxes: parsed.muxes,
            wires: parsed.wires,
          };

          push(
            "success",
            `[YOSYS] Stats: ${stats.gates} gates, ${stats.flipFlops} flip-flops, ${stats.muxes} muxes, ${stats.wires} wires.`
          );
        } else {
          push("warn", `[YOSYS] Stats skipped (${st.reason}).`);
        }
      } catch (err) {
        push("warn", `[YOSYS] Stats skipped (${err.message}).`);
      }
    }

    return {
      success: !!compileResult?.success,
      verilog,
      schematicSvg,
      stats,
      logs,
      attempts: attempt,
      compilerLog: compileResult?.log || "",
    };
  } finally {
    fs.rm(workDir, {
      recursive: true,
      force: true,
    }).catch(() => {});
  }
}

module.exports = {
  runPipeline,
};