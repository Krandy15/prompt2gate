"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { sanitizeVerilog } = require("../../lib/security/sanitizeVerilog");

const wrap = (body) => `module t; initial begin ${body} end endmodule`;

test("clean RTL and normal testbench tasks pass", () => {
  assert.ok(sanitizeVerilog("module a(input x, output y); assign y = x; endmodule").ok);
  assert.ok(sanitizeVerilog(wrap('$dumpfile("dump.vcd"); $dumpvars(0, t); $display("PASS"); $finish;')).ok);
  assert.ok(sanitizeVerilog(wrap("$fatal(1); $stop;")).ok);
});
test("blocks $system, file I/O, readmem, include", () => {
  for (const body of ['$system("ls");', 'fd = $fopen("x","w");', '$fwrite(fd,"a");', '$fdisplay(fd,"a");', '$readmemh("a.hex", m);', '$writememb("a", m);']) {
    assert.ok(!sanitizeVerilog(wrap(body)).ok, body);
  }
  assert.ok(!sanitizeVerilog('`include "/etc/passwd"\nmodule a; endmodule').ok);
});
test("no false positive inside comments or strings", () => {
  assert.ok(sanitizeVerilog(wrap('// $system("rm")\n /* $fopen */ $display("$system `include");')).ok);
});
test("$dumpfile must be a plain file name", () => {
  assert.ok(!sanitizeVerilog(wrap('$dumpfile("../../evil.vcd");')).ok);
  assert.ok(!sanitizeVerilog(wrap('$dumpfile("/tmp/x.vcd");')).ok);
  assert.ok(!sanitizeVerilog(wrap("$dumpfile(name);")).ok);
});
test("empty and oversized input rejected", () => {
  assert.ok(!sanitizeVerilog("  ").ok);
  assert.ok(!sanitizeVerilog(undefined).ok);
  assert.ok(!sanitizeVerilog("a".repeat(70000)).ok);
});
