# 2026-11-02 - T07: the race bake-off

The fork's first measured statement: the four candidate races, crossed with one
fixed seed set, under one budget, on TWO engine variants - 64 lives, one life
per (race, seed, variant) cell. What T06 answered for ONE race (Half-Troll,
4 seeds), this directory answers for all four candidates: how deep each goes,
where each dies, and what the upstream `noteSpot` fix (#12 /
neostryder/neo-angband#428) is worth to warriors at this budget. The owner
decision this record exists to feed - the default `borg.raceChoice` - is on
[issue #10](https://github.com/diegoami/neowarrior-borg/issues/10).

- **Build**: the T07 branch `task/T07-bakeoff` (the `T07:` commits); the
  reporter records the mod as `Warrior Borg 0.1.0` from manifest.json.
- **Engine**: the pinned published `@rpgm-tools/neo-angband-core`
  `1.23.0-beta.1` - the `pin` variant ran it exactly as installed. The
  `patched-engine` variant ran the same installed copy with B01's one-line
  fix applied to the compiled `dist/game/trap.js` (see the protocol below);
  the patch was reverted after the variant and is nowhere in this repository.
- **Content**: sibling checkout `neo-angband` at `ceb484205` (branch
  `neowarrior-lab`; content pack unchanged since `836b8da2a`,
  v1.23.0-beta.2) - the same pack the import baseline and the T06 session
  ran. The checkout's own engine source is NOT what the harness boots; the
  published node_modules copy is.
- **Harness**: `node tools/bakeoff.mjs` (new in T07), which drives the SAME
  session driver as `src/play.test.ts` and `tools/runs.mjs`
  (`src/records/session.ts`) - one single-seed session per cell, so no cell
  can be gated on another cell's survivor. Every boot is guarded by
  `assertBakeoffBuild` (`src/measure/bakeoff.ts`): the LIVE player's
  race/class/statBirth must equal the plan for the cell, or the sweep fails
  naming the cell. The suite's smoke test (`src/measure/bakeoff.test.ts`)
  pins the sweep's parameterization; the heavy runs are a `tools/`
  invocation, not a suite test, because 64 play-length lives are north of an
  hour and a suite that long stops being run.

## ERRATUM (added 2026-11-02, review #36): death entries undercount `decisions` by one

The driver this record was produced with counted a decision only when the
play loop's header ran its increment - so the decision that KILLED a warrior
was issued (it is in the command census) but never added to `decisions`.
Every **death entry in this record's `runs.json` (21 of 64) therefore reads
one decision lower than the number of decisions actually taken**: for each
of them `sum(commands) == decisions + 1` (Half-Troll seed 20 pin, for
example: 363 recorded, 364 issued). Every surviving entry has
`sum(commands) == decisions` and is exact.

The driver is fixed (the completed decision is counted before the death
break, and it now asserts the census equals the count independently, so a
future disagreement fails the session rather than committing a lying
record), but **the committed JSON is immutable (rule 7) and stays exactly as
recorded**. No other field is affected - `turns`, `maxDepth`, `clvl`,
`kills`, `gold`, `causeOfDeath`, `deathDepth` and the command census itself
were read from the live game and are exact - so every table above and the
owner's race interpretation stand unchanged. The same defect undercounts the
four death entries of the T06 record
([2026-11-02-t06-first-warrior-session](../2026-11-02-t06-first-warrior-session/README.md));
its erratum says the same thing.

## The seeds, fixed and recorded

`1, 7, 20, 23, 34, 42, 49, 99` - the four T06-pinned seeds (20, 23, 34, 49)
plus the four the play harness itself owns (1, 7, 42, 99). Every race played
exactly this list, in this order, in both variants; the grid
(`bakeoffCells`) refuses a duplicate or missing seed, because a race that met
a different seed set would tilt its own medians - the hazard the task names.
Cap 600 decisions per life, one life per cell.

## The two-variant protocol (the engine patch, byte-proven)

| moment | `dist/game/trap.js` md5 | what ran |
| --- | --- | --- |
| pin sweep start | `c89b1b08474b1692b352f8d0b64823f4` | the published engine, unmodified (the pristine hash better-borg's B01 record also holds) |
| patch applied | `209174f626f5fd4818726c0458ea490b` | `noteSpot(state, grid)` added in `installChunkFeatHook`, plus its import - restoring `square_note_spot` on the live setFeat path (`cave-square.c:1261`, upstream neostryder/neo-angband#428; reference: the game's own `neowarrior-lab` `trap.ts:223`) |
| patched sweep start | `209174f626f5fd4818726c0458ea490b` | the 32 `patched-engine` cells |
| after the variant | `c89b1b08474b1692b352f8d0b64823f4` | restored from the saved original; `cmp` byte-identical, `diff` empty, `git status` clean of it |

The saved original lives in git-ignored `artifacts/`; the patch itself was
never committed anywhere. Two edits, no others (`diff` between the md5s is
exactly the import line and the one call).

**The door-close gap at this budget.** The `pin` variant carries the engine
gap by design - and it never bit: `close` was issued **0 times in all 64
cells**, and no survivor shows the frozen-turn signature of a free-refusal
stall (every survivor's turns run 9-20 per decision). A probe at cap 1500 on
seed 1 (the door-close seed of #12 and B01) with the planned Half-Troll also
shows no stall on the pin (close 0, turns 16803, clvl 4). The stall B01
proved is real but lives on paths/budgets the bake-off's planned warriors do
not reach at 600: what the fix changes HERE is diffuse - remembered terrain
updates on every changed feature, so walks differ. 30 of 32 cells per race
pair differ between variants (only Half-Troll seed 20 and Dwarf seed 1 are
identical across variants), while not one median moves.

## The pin variant (what players run today)

| race | deaths (town / dungeon) | median maxDepth | best maxDepth | depth 2 reached on seeds | median clvl | best clvl | median kills | total kills |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| Half-Troll | 5/8 (0 / 5) | 1 | 2 | 1 | 1.5 | 2 | 4.5 | 48 |
| Dunadan | 1/8 (0 / 1) | 1 | 2 | 1, 42 | 1 | 2 | 4.5 | 40 |
| High-Elf | 2/8 (0 / 2) | 1 | 2 | 7, 20, 23 | 1 | 2 | 4 | 39 |
| Dwarf | 3/8 (0 / 3) | 1 | 2 | 49, 99 | 1.5 | 2 | 6 | 48 |

Every death in the whole sweep - both variants, all 64 lives - happened on
dungeon depth 1, to the level-1 bestiary's unkillables and fast hitters
(grey mold, floating eye, wild cat, wild dog, soldier ant, crow, centipedes,
kobold shaman, poison). No warrior dies in town; the town phase is solved.

## The patched-engine variant

| race | deaths (town / dungeon) | median maxDepth | best maxDepth | depth 2 reached on seeds | median clvl | best clvl | median kills | total kills |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| Half-Troll | 3/8 (0 / 3) | 1 | 1 | (none) | 1 | 3 | 4.5 | 42 |
| Dunadan | 2/8 (0 / 2) | 1 | 2 | 49 | 1 | 3 | 5 | 50 |
| High-Elf | 2/8 (0 / 2) | 1 | 2 | 7, 20, 23 | 1 | 2 | 4 | 32 |
| Dwarf | 3/8 (0 / 3) | 1 | 2 | 20 | 1.5 | 2 | 5 | 48 |

## The pin → patched delta, per race

- **Half-Troll** (the incumbent default): deaths 5 → 3, best depth 2 → 1
  (its only depth-2 cell, seed 1, becomes a depth-1 life), best clvl 2 → 3,
  total kills 48 → 42. The fix keeps Half-Trolls alive longer and they stay
  shallower.
- **Dunadan**: deaths 1 → 2, best depth 2 both, best clvl 2 → 3, total
  kills 40 → 50. Reaches depth 2 on seed 49 instead of seeds 1 and 42.
- **High-Elf**: deaths 2 → 2, depth 2 on the SAME three seeds (7, 20, 23)
  in both variants - the only race whose depth-2 set is stable under the
  fix. Total kills 39 → 32.
- **Dwarf**: deaths 3 → 3, best depth 2 both (seed 49 → seed 20), median
  clvl 1.5 both, total kills 48 → 48 - the steadiest race under the fix.

Across all four: `close` stays 0, no median maxDepth or median clvl moves
except Half-Troll's clvl (1.5 → 1), and deaths move by at most 2 in either
direction. At the bake-off's budget the upstream fix is roughly NEUTRAL for
planned warriors; its proven value (B01: unfreezing the seed-1 close loop)
sits at budgets and paths this sweep's cells do not reach. The engine floor
should still rise when the fix releases - the gap is a live risk at longer
horizons - but no race choice should be made FOR the fix on this evidence.

## The command census

`walk` dominates every race in both variants (87-92% of all commands - the
Borg explores), with `descend`/`ascend` next (2-3% each) and `open` on
Dunadan (129, pin) the highest single non-walk verb. No command runs away
with any of the 64 lives; `close` is 0 everywhere (the #12 signature is
absent at this cap). Half-Troll pin carries the sweep's tunneling (90), the
dig-heavy stretch T06 flagged on seed 49.

## Determinism and the T06 flake watch

T06 reported one unreproduced full-suite failure (a warrior surviving its
slice). This sweep caps out 21 (pin) and 22 (patched) survivors - all of
them ordinary cap censoring, not stalls. Four cells (two survivors, two
deaths: Half-Troll 1, Dunadan 20, Dwarf 20, High-Elf 34) were re-played on
the restored pristine engine and are bit-for-bit identical to the recorded
pin entries (decisions, turns, every census count); the pin sweep also
reproduced T06's four committed Half-Troll numbers exactly (363/369/44/244
decisions). Eight cross-checks, zero divergence: no recurrence of the flake,
and the survivors are real, deterministic 600-decision lives.

## The shared-store leak (declared 2026-11-02, post-sweep — a standing hazard)

pnpm hardlinks engine files through its shared per-user store: the real
`trap.js` this sweep patched is **one inode with `nlink 4`**, shared with the
store object and every other checkout of the same engine version. The
in-place patch at 20:29:08 therefore also changed the file as seen from other
repositories on this machine (the better-borg checkout noticed and restored
its own copy pristine at 20:29:55, without touching this one). Any
patched-engine variant on a shared store can leak BOTH ways: the patch
reaches other checkouts, and another checkout's `pnpm install` can rewrite
the shared object mid-sweep. **Future sweeps: break the hardlink before
patching (or run the variant in an isolated store), and fingerprint at every
phase boundary — start AND end of each variant.** This sweep predates that
rule; its phases are reconstructed from the retained fingerprints below, and what they can prove is bounded by the corrected note that follows the timeline.

### The fingerprint timeline (times are this checkout's file mtimes)

| time | fingerprint / event | evidence |
| --- | --- | --- |
| pre-sweep + pin sweep start | `c89b1b08…f4` pristine | the pin sweep command's first line printed the md5 before any cell ran |
| ≤ 20:28:54 | all 32 pin cells done | the pin-1500 probe (run only after the sweep) wrote its runs.json at 20:28:54; the patch did not exist yet |
| 20:29:08 | backup saved, patch applied → `209174f6…90b` | `artifacts/trap.js.pristine` mtime; patch command printed both md5s and the 2-edit diff |
| ~20:29:15 | patched sweep starts on `209174f6…90b` | the sweep command's first line printed the md5; matches ~6:45 of per-cell wall time to its 20:36:14 finish |
| 20:29:35 | patched 1500-probe done (differs from pin probe: depth 1/clvl 3 vs 2/4) | `artifacts/probe-seed1-1500-patched/runs.json` mtime |
| 20:29:55 | better-borg restores ITS copy pristine (external; whether it wrote through the shared inode is not determinable from the sweep's outputs - see the corrected note below) | main-session report |
| 20:36:14 | patched sweep's 32 cells done | `docs/runs/2026-11-02-bakeoff/runs.json` mtime |
| 20:36:58 | revert: `cp` saved original, `cmp` byte-identical, md5 `c89b1b08…f4` | the real file's mtime; `cmp`/`diff` output in the log |
| 20:39–20:40 | determinism re-runs reproduce pin cells bit-for-bit | `artifacts/determinism-rerun/runs.json` |
| 20:42–20:48 | full `pnpm verify` reproduces the pristine #12 signature (seed-1 `close` 771/1500, the import baseline's exact count) | verify log |
| post-warning re-check | `c89b1b08…f4` pristine; inode `nlink 4` (the sharing, measured) | fresh md5 + stat |

### What the 20:29:55 scare actually proves (corrected 2026-11-02, review #37)

The proof this section originally carried was unsound, and the correction is
recorded here rather than quietly rewritten. The original claim: a mid-sweep
rewrite of the shared inode to pristine would have made every later-finishing
patched cell run pristine and match its pin twin, so the differing cells
proved no rewrite happened ("a mid-sweep reversion is therefore impossible;
the reinstall relinked better-borg's copy instead of truncating the shared
object"). That inference ignores how the sweep process loads the engine, and
is withdrawn.

**The module lifetime.** `tools/bakeoff.mjs` imports the session bundle -
which imports `@rpgm-tools/neo-angband-core` statically - exactly once,
before the cell loop. Node's ESM cache keeps those evaluated modules for the
whole life of the process: rewriting `dist/game/trap.js` on disk replaces
neither the loaded functions the next cell calls nor the functions a cell
already running holds. The reviewer proved this on an isolated `/tmp` copy
of the real engine: import the module, restore its disk bytes to pristine,
import the identical URL again - the same module object comes back, and its
cached exports still carry the patch while the file on disk is byte-pristine
(the live dependency's md5 stayed `c89b1b08…f4` throughout).

**So the differing cells prove the right - weaker - thing.** Of the 27
patched cells that finished after 20:29:55, **26 differ from their pin
twins** (only Dwarf seed 1 matches: a 116-decision death too short for the
paths to diverge, flanked by Dwarf cells that all differ). What that
establishes is that the LOADED engine in the sweep's one process was the
patched one - before and after 20:29:55 alike - because a single process
cannot trade its loaded modules for disk bytes. What it does NOT establish
is anything about the shared inode itself: whether better-borg's reinstall
truncated the shared object or relinked its own copy is invisible to cell
outputs, since either way the running process kept the patched modules it
had already loaded.

**What the retained evidence does establish.** The fingerprint timeline
bounds the DISK at its recorded moments: pristine before the sweep,
`209174f6…90b` at the 20:29:08 patch and the patched sweep's start, and
pristine again at the 20:36:58 revert (`cmp` byte-identical to the saved
original). The 1500-probe pair bounds the LOADED module early in the sweep:
the patched probe (20:29:35) diverges from the pin probe (depth 1/clvl 3 vs
2/4), so the process was running patched functions by then. Between
fingerprints a disk rewrite is undetectable after the fact - but it could
not have changed what any cell ran, and the 20:36:58 revert wrote pristine
bytes through the shared inode whatever the interim state was, so every
sharer's copy ended pristine. The sweep's numbers stand; only the stronger
inode claim is not available. The pin variant needs none of this: all 32 of
its cells finished before the patch existed, and its numbers are
triple-cross-checked (T06's committed cells reproduced; post-revert re-runs
bit-identical; the verify's pristine-only #12 reproduction).

**For future sweeps**, the declared protocol stands and gains one clause:
break the hardlink before patching (or run the variant in an isolated
store), and fingerprint at every phase boundary - start AND end of each
variant - with the fingerprints understood as bounds on the DISK, while
what a cell RAN is bounded by the module the process loaded at its start.
An isolated store closes both at once: there, loaded and on-disk cannot
diverge.

## What it means for the next task

The headline is a tie: median maxDepth is 1 in all eight race x variant
combos, because a 600-decision budget censors most lives (21-22 of 32 per
variant still playing at the cap) and every death happens on depth 1. What
separates the races at this budget are the whole-seed-set rates: High-Elf
reaches depth 2 on 3/8 seeds in BOTH variants (the same seeds each time);
Dunadan holds the most lives past the cap on the pin (7/8 alive); Dwarf is
the steadiest under the engine fix; Half-Troll - the current default - has
the most deaths on the pin (5/8) and the only best-depth drop under the fix.
Longer budgets (M2, and the deeper divergence candidates this record ranks:
the depth-1 unkillables first) will re-measure all of this. The decision -
which candidate becomes the default `borg.raceChoice` - is the owner's, on
issue #10, with these numbers attached.
