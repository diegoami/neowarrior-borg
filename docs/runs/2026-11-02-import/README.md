# 2026-11-02 - Import baseline

The fork's starting point, recorded the day of the import. No warrior play
here: this records what the tree does before any fork change.

- **Build**: import commit `301abd7` (upstream `1fa2f8d` byte-for-byte).
- **Engine**: published `@rpgm-tools/neo-angband-core` 1.23.0-beta.1; content
  from the sibling game checkout at `836b8da2a`.

## Suite

421 tests: **420 green, 1 red**. The failure is `play.test.ts` seed 1: the
Borg issued `close` 771 of 1500 decisions (health cap: 750). Reproduced
bit-for-bit (same count) on a pristine upstream checkout in this environment,
with the content pack identical between game tags v1.23.0-beta.1 and beta.2 -
so it is upstream's at this pin, not the fork's (rule 6). Raw facts in
[`runs.json`](runs.json).

**What it means for the project**: a Borg that spends half a session closing
doors is not gaining depth. It is the first candidate for a measured
divergence: reproduce the door-closing stretch, find the rung upstream's C
would not have taken, fix it marked (rule 2), and show the depth number move.

## Standing questions this baseline cannot answer

Every one of these is first answered by T07's race bake-off with warrior birth
in place: how deep does an optimized warrior get per seed, how often does it
die in town versus the dungeon, and which race's numbers lead.
