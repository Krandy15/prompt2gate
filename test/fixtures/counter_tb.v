`timescale 1ns/1ps
module tb;
  reg clk = 0, rst = 1;
  wire [3:0] count;
  counter dut(.clk(clk), .rst(rst), .count(count));
  always #5 clk = ~clk;
  initial begin
    $dumpfile("dump.vcd");
    $dumpvars(0, tb);
    #12 rst = 0;
    #100;
    if (count == 4'd10) $display("PASS"); else $display("FAIL count=%0d", count);
    $finish;
  end
endmodule
