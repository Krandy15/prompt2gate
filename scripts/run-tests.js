#!/usr/bin/env node
"use strict";

/** Cross-platform runner: finds test/unit/*.test.js and hands them to `node --test`. */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const dir = path.join(__dirname, "..", "test", "unit");
const files = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((f) => f.endsWith(".test.js")).map((f) => path.join(dir, f))
  : [];

if (!files.length) {
  console.log("No unit tests found.");
  process.exit(0);
}
const r = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(r.status ?? 1);
