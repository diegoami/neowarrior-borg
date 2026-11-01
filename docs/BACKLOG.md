# Backlog

Everything believed worth doing that is not an M1 task. Ranked by expected
effect on the project's number (deepest depth a warrior reaches). Items become
tasks when M1's baseline (T07) says what actually limits depth; until then
this file is the queue's source, not a promise. Each entry names its evidence.

## Measured defects (fix first, each with a run record)

1. **The seed-1 door-closing loop** - the Borg spends 771/1500 decisions
   closing doors; reproduced bit-for-bit on pristine upstream at our pin.
   Evidence: `docs/runs/2026-11-02-import/`, [issue #12].
   Expected effect: large - half a session on doors is depth not gained.

## Unported upstream subsystems a warrior leans on

2. **Ring swaps** (`borg_swap_rings` / `borg_wear_rings`,
   `src/think-ladder.ts:679`; the swap valuation seams are deliberately
   unwired - `src/think-session.ts`). A warrior's power IS its gear; swapping
   on speed/resist rings is how melee characters survive depth. Upstream
   4.2.6 has it; the port does not.
3. **Weapon/armour swap buying** (`src/store/buy.ts:538-549` - steps 7A/7B
   return early without swap valuation, so the Borg never stockpiles a swap
   set). Same argument as 2; likely one shared valuation seam.
4. **Munchkin stair-scum diving** (the un-ported half of
   `borg_munchkin_start`, per our own SETTINGS.md) plus depth pacing:
   the depth lever itself. Evidence: upstream `borg-reincarnate.c` and
   `borg-think-dungeon.c` diving logic named in PLANNED.md.
5. **Live-unique census** for `borg_kills_uniques` (`plugin.ts`'s held-back
   settings list): hunting gatekeeper uniques matters most to characters who
   cannot teleport away as freely - warriors.
6. **`PF_COMBAT_REGEN`** - one arm of `borg_check_rest` needs an engine seam;
   tracked upstream as neo-angband#34. Small, but rest decisions are
   survival decisions at low hit points.

## Guardrails and instrumentation

7. **Depth ceiling as a setting** (upstream `borg_no_deeper`, `borg_enchant_
   limit`): now expressible through the numeric-settings seam T05 opens.
   Value: bounded experiments and reproducible measurement windows.
8. **Bake-off harness as a `tools/` runner** rather than a suite test, if T07
   runs long: the sweep gets bigger (more seeds, more races) as divergences
   need tighter comparisons.
9. **Watched-run automation**: a CDP script that drives the desktop build and
   writes `watched.md` skeletons - only if manual watching proves the
   bottleneck.

## Deliberately not planned

- **`borg_uses_dynamic_calcs`** - a second formula-driven calculation engine
  (borg-formulas.c). Enormous, and its value over the ported math is
  unproven for a warrior. Revisit only with evidence.
- **Screen recordings** - owner decision on #1, 2026-11-01: not now.
- **Engine changes of any kind** - the fork's contract is the published mod
  API (rule 4). An engine need (like 6) is filed upstream, not patched here.

[issue #12]: https://github.com/diegoami/neowarrior-borg/issues/12
