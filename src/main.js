import { createMachine, isComplete, PROGRAMS, stepMachine } from "./simulator.js";

const STAGES = ["IF", "ID", "EX", "MEM", "WB"];
const $ = (selector) => document.querySelector(selector);

let machine = createMachine();
let timer = null;

function formatNumber(value) {
  return `0x${(value >>> 0).toString(16).padStart(8, "0")}`;
}

function stageForInstruction(index) {
  return STAGES.find((stage) => machine.stages[stage]?.index === index) ?? null;
}

function updateMetrics() {
  $("#cycle-count").textContent = String(machine.cycle).padStart(2, "0");
  $("#retired-count").textContent = String(machine.retired).padStart(2, "0");
  $("#cpi-value").textContent = machine.retired ? (machine.cycle / machine.retired).toFixed(2) : "—";
  $("#ipc-value").textContent = machine.cycle ? (machine.retired / machine.cycle).toFixed(2) : "—";
}

function updatePipeline() {
  for (const stage of STAGES) {
    const card = document.querySelector(`[data-stage="${stage}"]`);
    const slot = machine.stages[stage];
    card.classList.toggle("stage-active", Boolean(slot));
    card.classList.toggle("stage-forwarding", stage === "EX" && machine.events.forwards.length > 0);
    card.classList.toggle("stage-branch", stage === "EX" && machine.events.branchTaken);
    $(`#stage-${stage}`).textContent = slot?.text ?? "Idle";
    card.querySelector(".stage-foot").classList.toggle("foot-lit", Boolean(slot));
  }

  document.querySelectorAll(".stage-link").forEach((link, index) => {
    const isActive = Boolean(machine.stages[STAGES[index]]) && Boolean(machine.stages[STAGES[index + 1]]);
    link.classList.toggle("link-active", isActive);
  });

  const note = machine.events.branchTaken
    ? `Branch taken · ${machine.events.flushed.length} flushed`
    : machine.events.forwards.length
      ? `Bypass → ALU · ${machine.events.forwards.length} value${machine.events.forwards.length === 1 ? "" : "s"}`
      : "One instruction per cycle";
  $("#pipeline-note").textContent = note;
}

function updateRegisters() {
  const grid = $("#register-grid");
  grid.replaceChildren();
  machine.registers.slice(0, 8).forEach((value, index) => {
    const cell = document.createElement("div");
    cell.className = "register-cell";
    if (index === 0) cell.classList.add("register-zero");
    if (value !== 0) cell.classList.add("register-written");
    if (machine.events.commit?.register === index) cell.classList.add("register-commit");
    cell.innerHTML = `<span>x${index}</span><strong>${formatNumber(value)}</strong>`;
    grid.append(cell);
  });
}

function updateMemory() {
  const grid = $("#memory-grid");
  grid.replaceChildren();
  machine.memory.slice(0, 4).forEach((value, index) => {
    const row = document.createElement("div");
    const address = index * 4;
    row.className = "memory-cell";
    if (machine.events.memory?.address === address) row.classList.add("memory-access");
    row.innerHTML = `<span class="memory-address">+${String(address).padStart(2, "0")}</span><span class="memory-value">${formatNumber(value)}</span>`;
    grid.append(row);
  });
}

function updateProgram() {
  const rows = $("#program-rows");
  $("#program-count").textContent = `${String(machine.program.length).padStart(2, "0")} OPS`;
  rows.replaceChildren();
  machine.program.forEach((instruction, index) => {
    const row = document.createElement("div");
    const stage = stageForInstruction(index);
    row.className = "program-row";
    if (stage) row.classList.add("instruction-active");
    if (machine.flushedIndices.includes(index)) row.classList.add("instruction-flushed");
    const status = stage
      ? stage === "EX" && machine.events.forwards.length
        ? "BYPASS"
        : stage
      : machine.retiredIndices.includes(index)
        ? "DONE"
        : machine.flushedIndices.includes(index)
          ? "FLUSH"
          : machine.issuedIndices.includes(index)
          ? "QUEUED"
          : "READY";
    row.innerHTML = `<span class="program-pc">${formatNumber(index * 4)}</span><code>${instruction.text}</code><span class="instruction-state">${status}</span>`;
    rows.append(row);
  });
}

function updateTrace() {
  const trace = $("#trace-list");
  trace.replaceChildren();
  if (!machine.trace.length) {
    const empty = document.createElement("div");
    empty.className = "trace-empty";
    empty.textContent = "Run a cycle to start the trace.";
    trace.append(empty);
    return;
  }
  machine.trace.forEach(({ cycle, descriptions }) => {
    const item = document.createElement("div");
    item.className = "trace-item";
    const cycleTag = document.createElement("span");
    cycleTag.className = "trace-cycle";
    cycleTag.textContent = `C${String(cycle).padStart(2, "0")}`;
    const message = document.createElement("span");
    message.className = "trace-message";
    message.textContent = descriptions.join(" ");
    item.append(cycleTag, message);
    trace.append(item);
  });
}

function updateStatus() {
  const complete = isComplete(machine);
  const isRunning = timer !== null;
  const status = $("#live-status");
  status.classList.toggle("is-running", isRunning);
  status.classList.toggle("is-complete", complete);
  $("#status-text").textContent = complete ? "Done" : isRunning ? "Running" : machine.cycle ? "Paused" : "Ready";
  $("#run-icon").textContent = isRunning ? "Ⅱ" : "▶";
  $("#run-label").textContent = isRunning ? "Pause" : complete ? "Complete" : "Run";
  $("#run-button").disabled = complete;
  $("#step-button").disabled = complete || isRunning;
  $("#reset-button").disabled = machine.cycle === 0 && !isRunning;
}

function render() {
  updateMetrics();
  updatePipeline();
  updateRegisters();
  updateMemory();
  updateProgram();
  updateTrace();
  updateStatus();
}

function tick() {
  stepMachine(machine);
  render();
  if (isComplete(machine)) pause();
}

function pause() {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
  render();
}

function run() {
  if (timer !== null || isComplete(machine)) return;
  const speed = Number($("#speed-select").value);
  timer = window.setInterval(tick, 650 / speed);
  render();
}

function reset(programName = machine.programName) {
  pause();
  machine = createMachine(programName);
  $("#program-select").value = programName;
  render();
}

$("#run-button").addEventListener("click", () => (timer === null ? run() : pause()));
$("#step-button").addEventListener("click", tick);
$("#reset-button").addEventListener("click", () => reset());
$("#program-select").addEventListener("change", (event) => reset(event.target.value));
$("#speed-select").addEventListener("change", () => {
  if (timer !== null) {
    pause();
    run();
  }
});

render();
