# Tasks

One file per task, `T<nn>.md`, from [`TEMPLATE.md`](TEMPLATE.md). This index
carries no status: the issue's `status:*` label is the status
(`gh issue list --label task --label status:ready`).

## M1 - The warrior always comes back (0.1.0)

A Borg that births its own warrior - chosen race, optimized point-buy - and
starts the next one on every death, with every run recorded. Decision code
upstream-faithful throughout; measurement before divergence.

| Task | Title | Difficulty | Issue | Merge after |
| --- | --- | --- | --- | --- |
| [T01](T01.md) | Import and rebrand the fork | Easy | #2 | — |
| [T02](T02.md) | The warrior build plan, as a pure module | Medium | #3 | T01 |
| [T03](T03.md) | The birth presenter: the mod births its own warrior | Medium | #4 | T02 |
| [T04](T04.md) | The unattended restart loop | Medium | #5 | T03 |
| [T05](T05.md) | The title row arms the warrior, and a setting picks the race | Medium | #6 | T03 |
| [T06](T06.md) | Run records: journal in the mod, tables outside it | Medium | #7 | T04 |
| [T07](T07.md) | The baseline and the race bake-off | Medium | #8 | T04, T06 |
| [T08](T08.md) | Milestone 0.1.0 | Easy | #9 | T02–T07 |

## M2 - Deeper (planned)

Measured divergences, one task each, each carrying its run record (rule 1):
the seed-1 door-closing defect (see `docs/runs/2026-11-02-import/`), warrior
item valuation, depth pacing. Planned when M1's baseline says what actually
limits depth.
