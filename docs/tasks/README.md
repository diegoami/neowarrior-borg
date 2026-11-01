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
| [T02](T02.md) | The warrior build plan, as a pure module | Medium | #4 | T01 |
| [T03](T03.md) | The birth presenter: the mod births its own warrior | Medium | #6 | T02 |
| [T04](T04.md) | The unattended restart loop | Medium | #7 | T03 |
| [T05](T05.md) | The title row arms the warrior, and a setting picks the race | Medium | #8 | T03 |
| [T06](T06.md) | Run records: journal in the mod, tables outside it | Medium | #9 | T04 |
| [T07](T07.md) | The baseline and the race bake-off | Medium | #10 | T04, T06 |
| [T08](T08.md) | Milestone 0.1.0 | Easy | #11 | T02–T07 |

## M2 - Deeper (planned)

Cut from [`docs/BACKLOG.md`](../BACKLOG.md) once M1's baseline (T07) says what
actually limits depth: the measured defects first (the seed-1 door-closing
loop, #12), then the unported subsystems a warrior leans on (ring and
weapon/armour swaps, diving), each divergence carrying its run record (rule 1).
