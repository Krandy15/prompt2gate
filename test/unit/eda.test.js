"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs/promises");
const path = require("path");
const config = require("../../config");
const { runTool } = require("../../lib/eda/run");
const { withTmpDir } = require("../../lib/util/tmpdir");
const { compile } = require("../../lib/eda/iverilog");
const { simulate } = require("../../lib/eda/vvp");
const { cleanSvg } = require("../../lib/eda/graphviz");

const haveIcarus = async () => !(await runTool(config.tools.iverilog, ["-V"], { timeoutMs: 5000 })).missing;
const write = (dir, name, text) => fs.writeFile(path.join(dir, name), text);

test("cleanSvg strips scripts, handlers, xml header and fixed size", () => {
  const out = cleanSvg('<?xml version="1.0"?><!DOCTYPE svg><svg width="10pt" height="20pt" onload="x()"><script>evil()</script><g/></svg>');
  assert.ok(!/script|onload|DOCTYPE|xml/.test(out));
  assert.ok(out.includes('width="100%"'));
});

test("iverilog: valid compiles, broken fails with a log", async (t) => {
  if (!(await haveIcarus())) return t.skip("iverilog not installed");
  await withTmpDir(async (dir) => {
    await write(dir, "ok.v", "module a(input x, output y); assign y = x; endmodule");
    assert.ok((await compile({ workDir: dir, files: ["ok.v"] })).success);
    await write(dir, "bad.v", "module b(input x, output y); assign y = ; endmodule");
    const bad = await compile({ workDir: dir, files: ["bad.v"] });
    assert.ok(!bad.success && bad.log.length > 0);
  });
});

test("vvp: runs TB, captures stdout and VCD; no-$finish TB times out", async (t) => {
  if (!(await haveIcarus())) return t.skip("iverilog not installed");
  await withTmpDir(async (dir) => {
    await write(dir, "tb.v", 'module tb; reg a=0; initial begin $dumpfile("dump.vcd"); $dumpvars(0,tb); #5 a=1; $display("PASS"); #5 $finish; end endmodule');
    assert.ok((await compile({ workDir: dir, files: ["tb.v"] })).success);
    const r = await simulate({ workDir: dir });
    assert.ok(r.stdout.includes("PASS"));
    assert.ok(r.vcd && r.vcd.includes("$var"));

    await write(dir, "loop.v", "module lp; reg a=0; initial forever #1 a=~a; endmodule");
    assert.ok((await compile({ workDir: dir, files: ["loop.v"], outName: "loop.out" })).success);
    const l = await simulate({ workDir: dir, binName: "loop.out", timeoutMs: 700 });
    assert.ok(l.timedOut && !l.ok);
  });
});
