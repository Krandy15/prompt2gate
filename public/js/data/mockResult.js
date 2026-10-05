// Fixture used until the real API is wired. Built from Person 2's vizMock.js
// (which must load first) so every tab has data in mock mode.
(function () {
  const v = window.mockResult || {};
  window.P2G_MOCK_RESULT = {
    status: "success",
    rtl: v.rtl,
    testbench: v.testbench,
    testbenchResult: v.testbenchResult,
    tbPassed: v.testbenchResult ? v.testbenchResult.status === "PASS" : true,
    stats: v.stats,
    ports: v.ports,
    schematic: v.schematic,   // {nodes, edges}; real backend sends schematicSvg instead
    schematicSvg: null,
    waveform: v.waveform,     // real backend: window.parseVCD(vcdText)
    logs: [
      "RTL generated (" + (v.rtl || "").split("\n").length + " lines)",
      "iverilog: compile OK, zero errors, zero latch warnings",
      "Testbench generated",
      "vvp: PASS, all checks passed",
      "yosys: synth; stat complete",
    ],
  };
})();
