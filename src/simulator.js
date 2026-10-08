const REGISTER_COUNT = 32;
const MEMORY_WORDS = 8;
const STAGE_NAMES = ["IF", "ID", "EX", "MEM", "WB"];
const WRITES_REGISTER = new Set(["addi", "add", "sub", "and", "xor", "lw"]);

export const PROGRAMS = {
  forwarding: {
    name: "Forwarding & memory",
    instructions: [
      { op: "addi", rd: 1, rs1: 0, imm: 5, text: "addi x1, x0, 5" },
      { op: "addi", rd: 2, rs1: 0, imm: 7, text: "addi x2, x0, 7" },
      { op: "add", rd: 3, rs1: 1, rs2: 2, text: "add  x3, x1, x2" },
      { op: "sub", rd: 4, rs1: 3, rs2: 1, text: "sub  x4, x3, x1" },
      { op: "sw", rs1: 0, rs2: 4, imm: 0, text: "sw   x4, 0(x0)" },
      { op: "lw", rd: 5, rs1: 0, imm: 0, text: "lw   x5, 0(x0)" },
      { op: "addi", rd: 6, rs1: 5, imm: 1, text: "addi x6, x5, 1" },
    ],
  },
  branch: {
    name: "Branch & flush",
    instructions: [
      { op: "addi", rd: 1, rs1: 0, imm: 3, text: "addi x1, x0, 3" },
      { op: "addi", rd: 2, rs1: 0, imm: 3, text: "addi x2, x0, 3" },
      { op: "beq", rs1: 1, rs2: 2, target: 5, text: "beq  x1, x2, 5" },
      { op: "addi", rd: 3, rs1: 0, imm: 99, text: "addi x3, x0, 99" },
      { op: "addi", rd: 3, rs1: 0, imm: 98, text: "addi x3, x0, 98" },
      { op: "addi", rd: 3, rs1: 0, imm: 1, text: "addi x3, x0, 1" },
      { op: "add", rd: 4, rs1: 3, rs2: 1, text: "add  x4, x3, x1" },
      { op: "addi", rd: 5, rs1: 4, imm: 2, text: "addi x5, x4, 2" },
    ],
  },
};

function cloneSlot(slot) {
  return slot ? { ...slot } : null;
}

function makeSlot(instruction, index, serial) {
  return { ...instruction, index, serial, result: null, address: null, storeValue: null };
}

export function createMachine(programName = "forwarding") {
  const program = PROGRAMS[programName];
  if (!program) {
    throw new RangeError(`Unknown program: ${programName}`);
  }

  return {
    programName,
    program: program.instructions,
    pc: 0,
    cycle: 0,
    retired: 0,
    issued: 0,
    registers: Array(REGISTER_COUNT).fill(0),
    memory: Array(MEMORY_WORDS).fill(0),
    stages: Object.fromEntries(STAGE_NAMES.map((stage) => [stage, null])),
    issuedIndices: [],
    retiredIndices: [],
    flushedIndices: [],
    events: { forwards: [], branchTaken: false, flushed: [], memory: null, commit: null },
    trace: [],
  };
}

function readsFrom(stage, register) {
  return stage && stage.rd === register && stage.result !== null && WRITES_REGISTER.has(stage.op);
}

function readOperand(machine, register, olderStages, consumerStage, forwards) {
  if (register === undefined || register === 0) return 0;

  for (const [stageName, stage] of olderStages) {
    if (readsFrom(stage, register)) {
      forwards.push({
        from: stageName,
        to: consumerStage,
        register,
        value: stage.result,
      });
      return stage.result;
    }
  }
  return machine.registers[register];
}

function memoryIndex(address) {
  if (!Number.isInteger(address) || address < 0 || address % 4 !== 0 || address / 4 >= MEMORY_WORDS) {
    throw new RangeError(`Data address ${address} is outside the simulator's aligned memory window`);
  }
  return address / 4;
}

function executeInstruction(slot, machine, olderStages, forwards) {
  const left = readOperand(machine, slot.rs1, olderStages, "EX", forwards);
  const right = readOperand(machine, slot.rs2, olderStages, "EX", forwards);

  switch (slot.op) {
    case "addi":
      slot.result = left + slot.imm;
      break;
    case "add":
      slot.result = left + right;
      break;
    case "sub":
      slot.result = left - right;
      break;
    case "and":
      slot.result = left & right;
      break;
    case "xor":
      slot.result = left ^ right;
      break;
    case "lw":
      slot.address = left + slot.imm;
      memoryIndex(slot.address);
      break;
    case "sw":
      slot.address = left + slot.imm;
      slot.storeValue = right;
      memoryIndex(slot.address);
      break;
    case "beq":
      slot.branchTaken = left === right;
      break;
    case "bne":
      slot.branchTaken = left !== right;
      break;
    default:
      throw new RangeError(`Unsupported instruction: ${slot.op}`);
  }
  return slot;
}

function passMemory(slot, machine, memoryEvent) {
  if (!slot) return null;
  const next = cloneSlot(slot);
  if (next.op === "lw") {
    next.result = machine.memory[memoryIndex(next.address)];
    memoryEvent.value = next.result;
  } else if (next.op === "sw") {
    machine.memory[memoryIndex(next.address)] = next.storeValue;
    memoryEvent.value = next.storeValue;
  }
  if (next.op === "lw" || next.op === "sw") {
    memoryEvent.operation = next.op;
    memoryEvent.address = next.address;
    memoryEvent.instruction = next.text;
  }
  return next;
}

export function isComplete(machine) {
  return machine.pc >= machine.program.length && STAGE_NAMES.every((stage) => machine.stages[stage] === null);
}

export function stepMachine(machine) {
  if (isComplete(machine)) return machine;

  const oldStages = Object.fromEntries(
    STAGE_NAMES.map((stage) => [stage, cloneSlot(machine.stages[stage])]),
  );
  const events = { forwards: [], branchTaken: false, flushed: [], memory: null, commit: null };
  const retiring = oldStages.WB;

  if (retiring) {
    machine.retired += 1;
    machine.retiredIndices.push(retiring.index);
    if (WRITES_REGISTER.has(retiring.op) && retiring.rd !== 0) {
      machine.registers[retiring.rd] = retiring.result;
      events.commit = { register: retiring.rd, value: retiring.result, instruction: retiring.text };
    }
  }
  machine.registers[0] = 0;

  const memoryEvent = {};
  const nextMemory = passMemory(oldStages.EX, machine, memoryEvent);
  events.memory = memoryEvent.operation ? memoryEvent : null;

  const nextExecute = oldStages.ID
    ? executeInstruction(
        cloneSlot(oldStages.ID),
        machine,
        [
          ["MEM", nextMemory],
          ["WB", oldStages.MEM],
        ],
        events.forwards,
      )
    : null;

  const nextStages = {
    IF: null,
    ID: oldStages.IF,
    EX: nextExecute,
    MEM: nextMemory,
    WB: oldStages.MEM,
  };
  let nextPc = machine.pc;

  if (nextPc < machine.program.length) {
    nextStages.IF = makeSlot(machine.program[nextPc], nextPc, machine.issued);
    machine.issuedIndices.push(nextPc);
    machine.issued += 1;
    nextPc += 1;
  }

  if (nextExecute && ["beq", "bne"].includes(nextExecute.op) && nextExecute.branchTaken) {
    if (nextStages.IF) {
      events.flushed.push(nextStages.IF.text);
      machine.flushedIndices.push(nextStages.IF.index);
    }
    if (nextStages.ID) {
      events.flushed.push(nextStages.ID.text);
      machine.flushedIndices.push(nextStages.ID.index);
    }
    events.branchTaken = true;
    nextStages.IF = null;
    nextStages.ID = null;
    nextPc = nextExecute.target;
  }

  machine.pc = nextPc;
  machine.stages = nextStages;
  machine.cycle += 1;
  machine.events = events;

  const descriptions = [];
  if (events.forwards.length) {
    const registers = [...new Set(events.forwards.map(({ register }) => `x${register}`))].join(", ");
    descriptions.push(`Bypass ${registers} → EX.`);
  }
  if (events.memory) {
    const address = `0x${events.memory.address.toString(16)}`;
    descriptions.push(
      events.memory.operation === "lw"
        ? `LW [${address}] → ${events.memory.value}.`
        : `SW ${events.memory.value} → [${address}].`,
    );
  }
  if (events.commit) {
    descriptions.push(`x${events.commit.register} ← ${events.commit.value}.`);
  }
  if (events.branchTaken) {
    descriptions.push(`Branch taken · ${events.flushed.length} flushed.`);
  }
  if (!descriptions.length) descriptions.push("Pipeline advanced one cycle.");
  machine.trace = [
    { cycle: machine.cycle, descriptions },
    ...machine.trace,
  ].slice(0, 5);

  return machine;
}
