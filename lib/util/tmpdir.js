"use strict";

const fs = require("fs/promises");
const os = require("os");
const path = require("path");

/**
 * Runs fn(dir) inside a fresh temp directory and ALWAYS removes it afterwards
 * (success, throw, or early return). Await the cleanup so tests/servers don't
 * leak directories under load.
 */
async function withTmpDir(fn, prefix = "p2g-") {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { withTmpDir };
