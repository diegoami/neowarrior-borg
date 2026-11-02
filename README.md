# neowarrior-borg

**The Warrior Borg: a warrior-only fork of [Borg](https://github.com/neostryder/neo-angband-mod-borg),
the port of Angband 4.2.6's automatic player for
[Neo Angband](https://github.com/neostryder/neo-angband).**

The goal of this fork is narrower than the upstream mod's, and everything here
serves it: **a Borg that always plays a warrior - a chosen race and an optimized
point-buy, recreated automatically on every death - and gets as deep in the
dungeon as it can.** How deep that is, run by run, is measured and recorded
(see [docs/runs](docs/runs/)); improving that number is the project.

Upstream's Borg respawns as a random race and class with roller stats, because
upstream Angband's borg does. This fork replaces that: it runs its own birth
through the game's mod API, so every character it plays is the warrior it
planned to play. The decision code underneath is the faithful 4.2.6 port;
where this fork changes it, the change is marked in the source beside the C it
came from, the way the port marks its own deviations.

## What it does differently

- **Birth is automated.** The title screen's **New Warrior Borg character** row
  (key B) starts a character whose creation this mod completes itself: Warrior
  class, a race chosen from a measured shortlist (the `borg.raceChoice` setting), and a point-buy computed from
  the real stat-adjustment and cost tables rather than the game's generic
  suggestion. A human creating a character the ordinary way is left alone -
  the automated birth only runs for characters this mod is starting.
- **Death is a re-roll, not an ending.** When the warrior dies, the mod starts
  the next one itself (`onDeath: "end"` plus `saves.create` with
  `resumeAutoplayer`), so an unattended session is a chain of identical
  warriors, not one random character after another.
- **Runs are recorded.** In-mod, each character keeps a journal (depth
  milestones from `dungeonlevel` events, a graveyard entry written at each
  death). Outside the mod, the headless harness writes per-run records - depth,
  level, kills, gold, turns, cause of death - as JSON and as the tables in
  [docs/runs](docs/runs/).

Everything else is the upstream Borg: the priority ladder, the danger model,
the power scoring, its settings (see [SETTINGS.md](SETTINGS.md)), and its
guarantees - it plays through the same commands a player does, reads only what
a player could know (plus the two perceived-monster facts the truth domain
allows), draws only from its own seeded generator, and marks every character it
touches `[Autoplayed]`.

## Status

Imported from upstream at `1fa2f8d` (v1.4.0-beta.2). The warrior birth, the
restart loop and the run records are the first milestone; see
[docs/process.md](docs/process.md) and [docs/tasks](docs/tasks/README.md) for
the plan and where it stands.

## Building and testing

    pnpm install --frozen-lockfile
    pnpm verify     # typecheck, test, and prove plugin.js is a current build

`plugin.js` is committed, exactly as upstream: an install fetches it from a
tagged release and runs it as-is. Tests boot the real published engine and,
for the play harness, the content pack from a sibling checkout of the game
(`../neo-angband`, or `NEO_ANGBAND_REPO`).

To try it in a development build of the game: enable third-party mods and
install this repository as a folder, then use the title row or Ctrl-Z as with
the upstream Borg.

## Credits and licence

The borg is Ben Harrison's, extensively developed by Dr Andrew White and
maintained by the Angband contributors; the Neo Angband port is by
neostryder / RPGM Tools, and this fork carries their work unchanged except
where a commit here says otherwise.

Same dual licence as Neo Angband and Angband: GPL v2 or the Angband licence.
See [LICENSE.md](LICENSE.md).
