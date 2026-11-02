# 2026-11-02 - T06: the first recorded warrior session

The fork's first MEASURED warrior session: four Half-Troll warriors, each
birthed by the presenter's plan (STR 18 / CON 17 point-buy), each played to
its death by the same Borg the suite drives, each reborn behind the last
one's death. The import baseline could only say `warriorPlay: measured:
false`; this directory is what T06 exists to produce - the runs.json the
reporter emitted (never hand-assembled) and the journal's own record of
depths and deaths asserted against the live game by the session test.

## ERRATUM (added 2026-11-02, review #36): every death entry undercounts `decisions` by one

All four lives here ended in death, and the driver this record was produced
with counted a decision only when the play loop's header ran its increment -
the killing decision was issued (it is in each run's command census) but
never added to `decisions`. Each of the four `decisions` numbers below and
in `runs.json` reads exactly one lower than the decisions actually taken
(363/369/44/244 recorded; 364/370/45/245 issued; `sum(commands) ==
decisions + 1` on every entry). The driver is fixed and now asserts the
census equals the count independently; the committed JSON is immutable
(rule 7) and stays as recorded. Every other field is exact, so the
narrative above stands. The same defect affects the bake-off record's 21
death entries - its own erratum says the numbers.

- **Build**: the T06 branch `task/T06-run-records` (the `T06:` commits);
  the reporter records the mod as `Warrior Borg 0.1.0` from manifest.json
  and refuses to guess a commit, on purpose - a record that pins a SHA goes
  stale the moment the branch merges, while the mod version is what the
  game installs.
- **Engine**: the pinned published `@rpgm-tools/neo-angband-core`
  `1.23.0-beta.1`; content from the sibling game checkout at `fc68bccc1`,
  whose content pack is unchanged since `836b8da2a` (v1.23.0-beta.2) - the
  same pack the import baseline ran.
- **Harness**: `node tools/runs.mjs`, which plays the session through the
  same driver as `src/play.test.ts` (src/records/session.ts), with the mod's
  journal installed per character and the graveyard entry awaited before the
  next warrior boots.

## The session

| seed | build | maxDepth | clvl | decisions | turns | kills | gold | died to |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 20 | Half-Troll Warrior 18/10/10/10/17 | 1 | 1 | 363 | 5049 | 4 | 146 | a floating eye |
| 23 | Half-Troll Warrior 18/10/10/10/17 | 1 | 2 | 369 | 3605 | 11 | 162 | a wild dog |
| 34 | Half-Troll Warrior 18/10/10/10/17 | 1 | 1 | 44 | 1365 | 1 | 149 | a grey mold |
| 49 | Half-Troll Warrior 18/10/10/10/17 | 1 | 2 | 244 | 2356 | 1 | 140 | a giant white centipede |

Four lives, four deaths, deepest **1**. Every warrior visited the town
(depth 0) and depth 1 - the journal's milestones for each character hold
exactly those depths, verified against the live game by the session test
(seeds 20, 23, 34), including across the `cause: "load"` re-fire of every
visited depth.

The command census says what the loop actually did: `walk` dominates every
life (346/363 on seed 20 - it explores), `rest` appears only on seed 20
(five decisions), and seed 49 spent 86 of its 244 decisions `tunnel`ing -
a dig-heavy stretch worth an eye in the bake-off. No single command
runs away with any life, and none of these seeds shows the door-closing
loop that seed 1 shows upstream (#12).

## What it means for the next task

T07's race bake-off now has its ruler: this directory is the default-race
(Half-Troll, `borg.raceChoice` 0) reference point. The standing questions
the import baseline could not answer, this session answers for ONE race:
the warrior leaves town under its own steam (descend on every seed), dies
on depth 1 at character level 1-2 to things it cannot see (a floating eye,
a mold), and the killers are the level-1 bestiary's unkillables - the
first measured divergence candidates live there, not in town.

Kills come from the game's own lore counters (per-race `pkills`, summed -
the number the character dump prints), read from the live state at each
run's end; gold, turns, depth and the killer are the player's own fields,
never the Borg's beliefs.
