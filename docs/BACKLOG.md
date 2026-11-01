# Backlog

Everything believed worth doing that is not an M1 task. The queue lives as
GitHub issues (label `backlog`); this file is the ranked index that points at
them, and the rank order is expected effect on the project's number (deepest
depth a warrior reaches). Items are promoted to tasks when M1's baseline (T07)
says what actually limits depth; each entry names its evidence.

## Measured defects (fix first, each with a run record)

1. **The seed-1 door-closing loop** - the Borg spends 771/1500 decisions
   closing doors; reproduced bit-for-bit on pristine upstream at our pin.
   Evidence: `docs/runs/2026-11-02-import/`, [issue #12].
   Expected effect: large - half a session on doors is depth not gained.

## Unported upstream subsystems a warrior leans on

2. **Ring swaps** - [#14](https://github.com/diegoami/neowarrior-borg/issues/14).
   `borg_swap_rings` / `borg_wear_rings` unported
   (`src/think-ladder.ts:679`; swap valuation seams deliberately unwired in
   `src/think-session.ts`). A warrior's power IS its gear; swapping on
   speed/resist rings is how melee characters survive depth.
3. **Weapon/armour swap buying** - [#15](https://github.com/diegoami/neowarrior-borg/issues/15).
   `src/store/buy.ts:538-549` - steps 7A/7B return early without swap
   valuation, so the Borg never stockpiles a swap set. Same argument as 2;
   likely one shared valuation seam.
4. **Munchkin stair-scum diving and depth pacing** - [#16](https://github.com/diegoami/neowarrior-borg/issues/16).
   The un-ported half of `borg_munchkin_start` (per our own SETTINGS.md) plus
   upstream's depth pacing: the depth lever itself.
5. **Live-unique census** for `borg_kills_uniques` - [#17](https://github.com/diegoami/neowarrior-borg/issues/17).
   Hunting gatekeeper uniques matters most to characters who cannot teleport
   away as freely - warriors.
6. **`PF_COMBAT_REGEN`** - [#18](https://github.com/diegoami/neowarrior-borg/issues/18).
   One arm of `borg_check_rest` needs an engine seam; tracked upstream as
   neo-angband#34. Small, but rest decisions are survival decisions at low
   hit points.

## Guardrails and instrumentation

7. **Depth ceiling and enchant limit as settings** - [#19](https://github.com/diegoami/neowarrior-borg/issues/19).
   Upstream `borg_no_deeper`, `borg_enchant_limit`, now expressible through
   the numeric-settings seam T05 opens. Value: bounded experiments and
   reproducible measurement windows.
8. **Bake-off harness as a `tools/` runner** - [#20](https://github.com/diegoami/neowarrior-borg/issues/20),
   if T07 runs long: the sweep gets bigger (more seeds, more races) as
   divergences need tighter comparisons.
9. **Watched-run automation** - [#21](https://github.com/diegoami/neowarrior-borg/issues/21):
   a CDP script that drives the desktop build and writes `watched.md`
   skeletons - only if manual watching proves the bottleneck.

## Deliberately not planned

- **`borg_uses_dynamic_calcs`** - a second formula-driven calculation engine
  (borg-formulas.c). Enormous, and its value over the ported math is
  unproven for a warrior. Revisit only with evidence.
- **Screen recordings** - owner decision on #1, 2026-11-01: not now.
- **Engine changes of any kind** - the fork's contract is the published mod
  API (rule 4). An engine need (like 6) is filed upstream, not patched here.

[issue #12]: https://github.com/diegoami/neowarrior-borg/issues/12
