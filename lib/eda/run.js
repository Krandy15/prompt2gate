"use strict";
const path = require("path");

const envCache = new Map(); // suite root -> env object

/**
 * Environment for bundled tools (OSS CAD Suite on Windows).
 * Best option: run the suite's own environment.bat once and capture the
 * variables it sets (exactly what start.bat does). Fallback: prepend
 * bin / lib / py3bin to PATH manually.
 */
function toolEnv(cmd) {
  if (!path.isAbsolute(cmd)) return process.env;
  const bin = path.dirname(cmd);
  const root = path.dirname(bin);

  if (envCache.has(root)) return envCache.get(root);

  let env = null;
  if (process.platform === "win32") {
    const bat = path.join(root, "environment.bat");
    if (fs.existsSync(bat)) {
      try {
        const out = execFileSync(
          "cmd.exe",
          ["/d", "/s", "/c", `"call "${bat}" >nul 2>&1 && set"`],
          { windowsVerbatimArguments: true, encoding: "utf8", timeout: 15_000, windowsHide: true, cwd: root }
        );
        const parsed = {};
        for (const line of out.split(/\r?\n/)) {
          const m = line.match(/^([^=\s][^=]*)=(.*)$/);
          if (m) parsed[m[1]] = m[2];
        }
        if (Object.keys(parsed).length > 0) env = parsed;
      } catch { /* fall through to manual PATH */ }
    }
  }

  if (!env) {
    const extra = [bin, path.join(root, "lib"), path.join(root, "py3bin")].join(path.delimiter);
    const key = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") || "PATH";
    env = { ...process.env, [key]: extra + path.delimiter + (process.env[key] || "") };
  }

  envCache.set(root, env);
  return env;
}
const fs = require("fs");
const { spawn, execFileSync } = require("child_process");
const config = require("../../config");

/**
 * Safe wrapper around spawn() for EDA tools. Guarantees:
 *  - never throws, always resolves to a result object
 *  - no shell (args are passed as an array -> no injection)
 *  - hard timeout (process is killed, `timedOut: true`)
 *  - stdout/stderr capped (process is killed if it floods, `truncated: true`)
 *  - missing binary reported as `missing: true` (ENOENT), distinct from a tool failure
 *
 * @returns {Promise<{ok:boolean, code:number|null, stdout:string, stderr:string,
 *                    timedOut:boolean, truncated:boolean, missing:boolean, error?:string}>}
 */
function runTool(cmd, args = [], opts = {}) {
  const {
    cwd,
    timeoutMs = 15_000,
    maxOutputBytes = config.limits.maxToolOutputBytes,
    input,
  } = opts;

  return new Promise((resolve) => {
    const result = {
      ok: false, code: null, stdout: "", stderr: "",
      timedOut: false, truncated: false, missing: false,
    };
    let outBytes = 0;
    let settled = false;
    let child;

    const finish = (patch = {}) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      Object.assign(result, patch);
      result.ok = result.code === 0 && !result.timedOut && !result.truncated && !result.missing;
      resolve(result);
    };

    try {
      child = spawn(cmd, args, { cwd, shell: false, windowsHide: true, env: toolEnv(cmd) });
    } catch (err) {
      return resolve({ ...result, missing: err.code === "ENOENT", error: err.message });
    }

    const timer = setTimeout(() => {
      result.timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    const collect = (key) => (chunk) => {
      if (result.truncated) return;
      outBytes += chunk.length;
      if (outBytes > maxOutputBytes) {
        result.truncated = true;
        child.kill("SIGKILL");
        return;
      }
      result[key] += chunk.toString("utf8");
    };
    child.stdout.on("data", collect("stdout"));
    child.stderr.on("data", collect("stderr"));

    child.on("error", (err) => {
      finish({ missing: err.code === "ENOENT", error: err.message });
    });
    child.on("close", (code, signal) => {
      finish({ code: code ?? (signal ? -1 : null) });
    });

    if (input != null) child.stdin.end(input);
    else child.stdin.end();
    child.stdin.on("error", () => {}); // tool exited before reading stdin
  });
}

module.exports = { runTool };
