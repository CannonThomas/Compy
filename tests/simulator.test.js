import test from "node:test";
import assert from "node:assert/strict";
import { createMachine, isComplete, PROGRAMS, stepMachine } from "../src/simulator.js";

function runToCompletion(machine) {
  let limit = 100;
  while (!isComplete(machine) && limit > 0) {
    stepMachine(machine);
    limit -= 1;
  }
  assert.ok(limit > 0, "program should complete within 100 cycles");
}

test("forwarding lab executes arithmetic and store/load operations", () => {
  const machine = createMachine("forwarding");
  runToCompletion(machine);

  assert.equal(machine.registers[3], 12);
  assert.equal(machine.registers[4], 7);
  assert.equal(machine.memory[0], 7);
  assert.equal(machine.registers[5], 7);
  assert.equal(machine.registers[6], 8);
  assert.equal(machine.registers[0], 0);
  assert.equal(machine.retired, PROGRAMS.forwarding.instructions.length);
  assert.ok(machine.trace.length > 0);
});

test("dependent instructions use forwarding without pipeline stalls", () => {
  const machine = createMachine("forwarding");
  while (machine.cycle < 8) stepMachine(machine);

  assert.equal(machine.registers[3], 12);
  assert.ok(machine.trace.some(({ descriptions }) => descriptions.some((line) => line.includes("Bypass"))));
});

test("taken branches flush younger work and resume at their target", () => {
  const machine = createMachine("branch");
  runToCompletion(machine);

  assert.equal(machine.registers[3], 1);
  assert.equal(machine.registers[4], 4);
  assert.equal(machine.registers[5], 6);
  assert.equal(machine.registers[3] === 99, false);
  assert.equal(machine.retired, 6);
  assert.deepEqual(machine.flushedIndices, [4, 3]);
});

test("invalid programs and unaligned or out-of-window memory accesses are rejected", () => {
  assert.throws(() => createMachine("unknown"), /Unknown program/);
  const machine = createMachine("forwarding");
  machine.program = [{ op: "lw", rd: 1, rs1: 0, imm: 2, text: "lw x1, 2(x0)" }];
  assert.throws(() => {
    while (!isComplete(machine)) stepMachine(machine);
  }, /aligned memory window/);
});
