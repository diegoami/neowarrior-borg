# Run records

The project's number is **the deepest depth a warrior reaches**. Every claim
about it traces to a directory here. Records are append-only: a completed
session is never edited, and a changed harness or changed build writes a new
directory whose notes say what changed (rule 5 in `docs/process.md`).

## Format

One directory per measured session: `YYYY-MM-DD-<label>/` containing:

- `runs.json` - the raw per-run records the harness wrote. One entry per
  character: build (race, class, base stats), seed, decisions, turns, max
  depth, character level, kills, gold, cause of death, and the command
  census (what the decision loop actually did).
- `README.md` - the curated table a human reads, plus the context the JSON
  cannot carry: which commit played, which engine and content, what changed
  since the previous session, and what the numbers mean for the next task.

A watched desktop run (a human or a CDP driver watching the real window) adds
`watched.md` in the same shape the upstream mod's PLANNED.md used: what was
seen, message by message, and the answers to the standing questions - did it
flee, shop, rest, descend, die, and start again.

Bulky by-products (screenshots, video, long traces) live outside git in
`artifacts/` and are linked by path, never committed (rule 7).

## Standing metrics

| Metric | Meaning |
| --- | --- |
| `maxDepth` | Deepest dungeon level (0 = town) that character stood on |
| `clvl` | Character level at end of run |
| `kills` | Monsters slain (from the run report where available) |
| `turns` | Game turns elapsed - separates playing from stalling |
| `causeOfDeath` | The killer, as the message log named it |
| command census | Counts per command code - a loop shows up as one code dominating |

## Baselines

| Directory | Build | What it established |
| --- | --- | --- |
| `2026-11-02-import/` | import commit `301abd7` (rebrand pending) | The fork's starting point: upstream suite state on this machine, including the one play-harness failure that reproduces bit-for-bit on pristine upstream (rule 6) |
