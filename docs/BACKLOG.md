# Backlog

The queue lives as GitHub issues; this file is the ranked index for what
stays in THIS fork. The routing rule (owner, 2026-11-02): class-agnostic
improvements go to [better-borg](https://github.com/diegoami/better-borg) as
issues or PRs, and this fork cherry-picks them; warrior-only work stays here.

## Moved to better-borg (2026-11-02)

Door-closing defect (was #12; engine gap, upstream report
neostryder/neo-angband#428, follow-through better-borg#13) · ring and
weapon/armour swaps (B03, better-borg#4) · diving and depth pacing
(better-borg#9) · unique census (better-borg#10) · PF_COMBAT_REGEN
(better-borg#11) · depth-ceiling settings (better-borg#12) · the bake-off
runner as a shared instrument (B02, better-borg#3) · the strength roadmap -
parameter evolution and knowledge accumulation - lives in better-borg's
docs/plans/getting-stronger.md, built class-agnostic so every borg profits.

## Here (warrior-only)

1. **Warrior item valuation** - diverge where measurement shows warriors
   should value gear differently (rule 3: earned by a run record).
2. **Birth-plan tuning after T07** - if the bake-off says stat priorities or
   the race shortlist should move, that is this fork's work, not better-borg's.
3. **Watched-run automation** - [#21](https://github.com/diegoami/neowarrior-borg/issues/21),
   only if manual watching bottlenecks.
4. **Test-infra: rest-and-store timeout** - [#24](https://github.com/diegoami/neowarrior-borg/issues/24);
   the fix may land in better-borg's tree first (same file), then cherry-pick.
5. **DEX/INT/WIS larger-budget plan tests** - [#27](https://github.com/diegoami/neowarrior-borg/issues/27).

## Reference

`../neo-angband-mod-squire` (read-only clone): the squire mod's journal
taxonomy (lessons, grudges, lineage, calibration) informs better-borg's Phase
3 knowledge format. Ideas, not code - its runtime learning cannot cross into
a deterministic borg (rule 4 here, rule 5 there).
