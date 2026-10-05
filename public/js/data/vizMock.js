/* Mock synthesis result. Same shape the real API response will be mapped into.
   Swap `window.mockResult` for the live result later; components only see props. */
(function () {
  const rtl = `\`timescale 1ns/1ps
module counter_4bit (
    input  wire       clk,
    input  wire       reset,
    input  wire       enable,
    output reg  [3:0] count
);

// Synchronous 4-bit up counter with active-high reset
always @(posedge clk) begin
    if (reset)
        count <= 4'b0000;
    else if (enable)
        count <= count + 1'b1;
end

endmodule`;

  const testbench = `\`timescale 1ns/1ps
module tb_counter_4bit;
    reg clk = 0, reset = 1, enable = 0;
    wire [3:0] count;
    reg [3:0] expected = 0;

    counter_4bit dut (.clk(clk), .reset(reset), .enable(enable), .count(count));
    always #5 clk = ~clk;

    initial begin
        $dumpfile("wave.vcd"); $dumpvars(0, tb_counter_4bit);
        #12 reset = 0;
        #10 enable = 1;
        repeat (10) begin
            @(posedge clk); #1 expected = expected + 1;
            #1 if (count !== expected) $display("FAIL: got %d, want %d", count, expected);
        end
        $display("PASS: count increments correctly");
        $finish;
    end
endmodule`;

  // Value-change list per signal: [time, value]. Generated from the counter's behaviour.
  function makeWaveform(end) {
    const clk = [], reset = [[0, 1], [12, 0]], enable = [[0, 0], [22, 1]], count = [[0, 0]];
    let c = 0;
    for (let t = 0; t <= end; t += 5) clk.push([t, (t / 5) % 2 === 0 ? 0 : 1]);
    for (let t = 5; t <= end; t += 10) { // rising edges
      const rst = t < 12, en = t >= 22;
      const next = rst ? 0 : en ? (c + 1) & 15 : c;
      if (next !== c || t === 5) { count.push([t + 1, next]); c = next; }
    }
    return {
      timescale: "1ns", endTime: end,
      signals: [
        { name: "clk", width: 1, changes: clk },
        { name: "reset", width: 1, changes: reset },
        { name: "enable", width: 1, changes: enable },
        { name: "count", width: 4, changes: count },
      ],
    };
  }

  window.mockResult = {
    rtl,
    ports: [
      { name: "clk", direction: "input", width: 1 },
      { name: "reset", direction: "input", width: 1 },
      { name: "enable", direction: "input", width: 1 },
      { name: "count", direction: "output", width: 4 },
    ],
    stats: { gates: 12, flipFlops: 4, muxes: 1, wires: 8 },
    waveform: makeWaveform(160),
    schematic: {
      nodes: [
        { id: "in_clk", type: "port", label: "clk", x: 40, y: 200 },
        { id: "in_reset", type: "port", label: "reset", x: 40, y: 80 },
        { id: "in_en", type: "port", label: "enable", x: 40, y: 140 },
        { id: "add", type: "gate", label: "+1", x: 250, y: 260 },
        { id: "mux", type: "mux", label: "MUX", x: 400, y: 140 },
        { id: "ff", type: "ff", label: "DFF[3:0]", x: 560, y: 160 },
        { id: "out", type: "port", label: "count", x: 740, y: 160 },
      ],
      edges: [
        { from: "in_clk", to: "ff", label: "clk" }, { from: "in_reset", to: "mux", label: "reset" },
        { from: "in_en", to: "mux", label: "enable" }, { from: "ff", to: "add", label: "count" },
        { from: "add", to: "mux", label: "count+1" }, { from: "mux", to: "ff", label: "d" },
        { from: "ff", to: "out", label: "count" },
      ],
    },
    testbench,
    testbenchResult: {
      status: "PASS",
      expected: "count increments correctly",
      observed: "count increments correctly",
      log: ["VCD info: dumpfile wave.vcd opened for output.", "PASS: count increments correctly", "$finish called at 142000 (1ps)"],
    },
  };

  // Extra designs so components are exercised with different port counts / widths.
  window.mockVariants = {
    counter: window.mockResult,
    alu: {
      rtl: `module alu_4bit (
    input  wire [3:0] a,
    input  wire [3:0] b,
    input  wire [2:0] opcode,
    output reg  [3:0] result,
    output reg        carry_out,
    output wire       zero_flag
);
always @(*) begin
    {carry_out, result} = 5'b0;
    case (opcode)
        3'd0: {carry_out, result} = a + b;
        3'd1: {carry_out, result} = a - b;
        3'd2: result = a & b;
        default: result = a ^ b;
    endcase
end
assign zero_flag = (result == 4'b0);
endmodule`,
      stats: { gates: 58, flipFlops: 0, muxes: 6, wires: 41 },
    },
    bus: {
      rtl: `module mem_ctrl #(parameter AW = 16) (
    input  wire         clk, rst_n, rd_en, wr_en,
    input  wire [AW-1:0] addr,
    inout  wire [31:0]  data,
    output wire         ready,
    output reg  [7:0]   status
);
endmodule`,
      stats: { gates: 214, flipFlops: 41, muxes: 18, wires: 160 },
    },
  };

  // Mock "Re-lint": trivial checks standing in for iverilog. Returns [{line, severity, message}].
  window.mockLint = function (code) {
    const out = [], lines = code.split("\n");
    const count = (re) => (code.replace(/\/\/.*$/gm, "").match(re) || []).length;
    if (count(/\bbegin\b/g) !== count(/\bend\b/g)) out.push({ line: 1, severity: "error", message: "unbalanced begin/end" });
    if (count(/\bmodule\b/g) !== count(/\bendmodule\b/g)) out.push({ line: lines.length, severity: "error", message: "missing endmodule" });
    if (!/`timescale/.test(code)) out.push({ line: 1, severity: "info", message: "no `timescale directive" });
    lines.forEach((l, i) => { if (/\t/.test(l)) out.push({ line: i + 1, severity: "warning", message: "tab character" }); });
    return new Promise((r) => setTimeout(() => r(out), 600));
  };
  window.mockResynthesize = (code) => new Promise((r) => setTimeout(() => r({ ok: true, message: "synthesis ok (mock)" }), 1200));
})();
