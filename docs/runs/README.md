# Run records

The project's number is **the deepest depth a warrior reaches**. Every claim
about it traces to a directory here. Records are append-only: a completed
session is never edited, and a changed harness or changed build writes a new
directory whose notes say what changed (rule 5 in `docs/process.md`).

## Format

One directory per measured session: `YYYY-MM-DD-<label>/` containing:

- `runs.json` - the raw per-run records the harness wrote (the reporter:
  `src/records/reporter.ts`, called by `src/records/session.ts` and
  `tools/runs.mjs`; never hand-assembled). One entry per character, and one
  session block:

  ```json
  {
    "recorded": "2026-11-02",
    "build": { "mod": "Warrior Borg 0.1.0", "engine": "@rpgm-tools/neo-angband-core 1.23.0-beta.1", "content": "...", "seeds": [20], "caps": { "decisions": 600 } },
    "runs": [ { "seed": 20, "build": { "race": "...", "class": "...", "baseStats": [18, 10, 10, 10, 17] }, "decisions": 363, "turns": 5049, "maxDepth": 1, "clvl": 1, "kills": 4, "gold": 146, "causeOfDeath": "a floating eye", "commands": { "walk": 346 } } ]
  }
  ```

  The build block is commit-independent on purpose (the mod version is what
  the game installs; a SHA goes stale when the branch merges). Field names
  follow the import baseline where they overlap (`recorded`, `build`).

  A SWEEP record (several conditions compared over the same cells, T07's
  bake-off the first) adds one field per run - `variant`, naming the
  condition - and may add measurements its tables need (the bake-off's
  `deathDepth`: the live chunk's depth at the run's end, 0 = a town death,
  null = survived its slice); the build block declares every variant's
  engine reality under `variants`. Every number is still harness-written.

  A variant that PATCHES the installed engine carries a standing hazard on
  this machine: pnpm hardlinks engine files through a shared per-user store
  (one inode, `nlink` > 1), so in-place edits appear in every checkout of
  the same engine version, and another checkout's `pnpm install` can
  rewrite the shared object mid-sweep. Break the hardlink (or isolate the
  store) before patching, fingerprint (md5) at the START AND END of every
  variant, keep the saved original outside git, and restore with `cmp` as
  the proof. The T07 bake-off ran before this rule; its phases are
  reconstructed from the retained fingerprints, with the limits of that
  reconstruction recorded in its README's corrected proof note (review
  #37); later records follow the rule.
- `README.md` - the curated table a human reads, plus the context the JSON
  cannot carry: which commit played, which engine and content, what changed
  since the previous session, and what the numbers mean for the next task.

The in-mod half of the record is the journal (`src/records/journal.ts`):
depth milestones from the `dungeonlevel` event in the character's own save
storage, and a graveyard entry per run report in the INSTALL storage that
outlives the character (#34 - the host deletes the character's save before
the report publishes) - the same records the harness asserts against the
live game, so the mod's view and the committed tables cannot quietly
diverge.

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
| `kills` | Monsters slain - the game's own lore counters (per-race `pkills`, summed), or null when the harness could not read them honestly |
| `turns` | Game turns elapsed - separates playing from stalling |
| `causeOfDeath` | The killer, as the player's own died-from carries it |
| command census | Counts per command code - a loop shows up as one code dominating |

## Baselines

| Directory | Build | What it established |
| --- | --- | --- |
| `2026-11-02-import/` | import commit `301abd7` (rebrand pending) | The fork's starting point: upstream suite state on this machine, including the one play-harness failure that reproduces bit-for-bit on pristine upstream (rule 6) |
| `2026-11-02-t06-first-warrior-session/` | `task/T06-run-records` (mod 0.1.0) | The first measured warrior session: four planned Half-Troll warriors, all died on depth 1; the journal and reporter this record came from are T06's own acceptance |
| `2026-11-02-bakeoff/` | `task/T07-bakeoff` (mod 0.1.0) | The race bake-off: 4 candidate races x 8 fixed seeds x cap 600 x 2 engine variants (pin vs B01's noteSpot patch, byte-proven applied and reverted) - median depth ties at 1 everywhere; High-Elf reaches depth 2 on the most seeds in both variants, Dunadan survives the pin best, the incumbent Half-Troll worst on both rates; the fix is neutral for planned warriors at this budget |
