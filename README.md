# Pips Logic Solver

A step-by-step solver for NYT **Pips** domino puzzles that explains every deduction, plus a creator for entering new puzzles.

**Live page:** https://doctorbim.github.io/pips-solver/

## What it does

- Solves a puzzle and records each step: candidate narrowing from region rules, forced pairs, the only domino that fits, the only spot a domino can go, what-if tests that end in a contradiction, and free choices when a puzzle has more than one valid answer.
- Lets you play through the reasoning, jump to any step, or filter to placements and decisions only.
- Counts how many valid answers a puzzle has.
- Includes a creator: paint the board, set region rules, fill the tray, and save puzzles in your browser. Reading a puzzle from a screenshot works only when the page is opened as a Claude artifact on claude.ai.

## Puzzle text format

```
# Easy
board:
..ab
cd.b
.d.e
.ffe
regions:
a 6 navy
b 6 purple
c 6 olive
d 6 pink
e = teal
f 2 orange
dominoes: 66 61 36 13 60
```

- `board:` one line per row. A letter is a region cell, `#` is a cell with no rule, `.` is a gap.
- `regions:` letter, rule (`6`, `<4`, `>8`, `=`, `!=`, `any`), optional colour (purple, pink, teal, orange, olive, navy, gray).
- `dominoes:` pairs of pips; a blank half is 0.

## Files

- `index.html` is the built page that GitHub Pages serves.
- `pips-solver.html` is the same page in Claude artifact form (no document skeleton).
- `src/core.js` holds the parser, the logging solver and the solution counter. It runs in Node too: `require('./src/core.js')`.
- `src/page.html` is the page template. `/*CORE*/` marks where `core.js` gets inlined.
- `src/parts/` holds the creator's CSS, HTML and JS, already merged into `src/page.html`.

Rebuild after editing:

```bash
node src/make-index.js
```
