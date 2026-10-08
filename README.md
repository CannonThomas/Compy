# Compy CPU Lab

A hands-on look inside a five-stage CPU. Step the clock and follow each instruction from fetch through write-back.

## Run Compy

Requires Node.js 18 or newer. No package install or third-party runtime dependencies needed.

```sh
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173).

## Try the simulator

- **Step** advances one clock cycle; **Run** plays continuously.
- Choose **Bypass + memory** to watch arithmetic dependencies, a store, and a load.
- Choose **Branch + flush** to see a taken branch discard younger instructions.
- The datapath lights up as instructions move. Watch registers, memory, and the trace change.
- CPI means cycles per retired instruction; IPC means retired instructions per cycle.
- Reset starts the selected program over.

Run the simulator tests with `npm test`.

## What it models

Compy is an educational, RV32I-inspired processor model with five in-order stages:

| Stage | Work |
| --- | --- |
| IF | Fetch the next instruction |
| ID | Decode and read registers |
| EX | Run the ALU or resolve a branch |
| MEM | Load from or store to data memory |
| WB | Write a result back to a register |

It demonstrates ALU result forwarding, register writes, aligned word loads/stores, and taken-branch flushing. The model intentionally skips data-hazard stalls and is not a complete or cycle-perfect RISC-V implementation.

## A little hardware history

The page nods to some machines and ideas that made the personal-computer era—and modern CPU design—possible:

- [MOS 6502](https://www.computerhistory.org/revolution/digital-logic/12/279) — an influential 8-bit processor used in the Apple II.
- [IBM PC 5150](https://www.ibm.com/history/personal-computer) — introduced in 1981 with an Intel 8088 running at 4.77 MHz.
- [RISC-V](https://riscv.org/about/) — an open instruction-set architecture that began at UC Berkeley in 2010.
