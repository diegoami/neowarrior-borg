# Changelog

All notable changes to this mod are recorded here. Versions follow the mod's own
`manifest.json`, which is what the game reads, and each released version has a
matching git tag that an install pins itself to.

An entry has to matter to somebody running the mod. Documentation wording,
internal refactoring and test-only additions are not recorded here. Bug fixes
are, however small.

Starting with this entry, an entry opens with one or more bracketed tags.
`[Visible]` marks a change a player would notice in the game or mod itself;
`[Internal]` marks one that touches only code, tooling, or a maintainer's own
workflow, with nothing for a player to see. A further tag (`[Security]`,
`[Balance]`, `[UI]`, `[Modding-API]`, `[Localization]`, `[Save-Compat]`,
`[Docs]`, `[Content]`, `[Compatibility]`, and others as they come up) names
what kind of change it is. Lists appear in this order and each is omitted
when empty for a release: Added, Changed, Removed, Fixed. Earlier entries
were not retagged.

## [Unreleased]

## 1.4.0-beta.2 - 2026-10-30

### Changed

- [Visible] [Compatibility] **The Borg now needs Neo Angband 1.23.0-beta.1 or later.** The earlier 1.22.0 floor named a game that offers only mod API 1, so a player on it could be offered this mod and fail to load it.

## 1.4.0-beta.1 - 2026-10-30

### Added

- [Internal] [Security] **A CI step reads manifest.json and fails the build if it lists a wildcard state grant such as `state:*.read`.** The Borg names each state domain it reads one by one, and a test fails the build if any source file reads the real map or a store's real stock.
- [Visible] **The Borg gives the keyboard back instead of looping.** That happens after 25 refused commands in a row, 25 decisions in a row with nothing to do, or 40 times in a row that the game takes the same command and nothing changes. At 6 such repeats it first forgets what its map shows on the square the command aims at, which gets it past a door that was opened out of its sight but still looks closed to it.

### Changed

- [Visible] [Compatibility] **The Borg now needs Neo Angband 1.22.0 or later.** It is a mod API 2 mod and does not load on a game that offers only API 1.
- [Visible] [Security] **The Borg's permission list changed.** New: `state:monsters-actual.read`, `state:turn.read`, `state:interaction.read`, `input:intent`, `input:prompt.reply` and `event:message`. Gone: `state:messages.read` and `state:constants.read`. The monsters permission is off until you turn it on, and the Borg uses it only for the exact hit points and race records of the monsters the character perceives; it never asks to see the real map or a store's full stock. Without it, monster health comes from the health bands the look command shows.
- [Internal] [Modding-API] **The Borg runs on mod API 2.** Each decision starts from one read of the known world, which the ported code sees as a synchronous view. Loadout questions are read in rounds and the decision is made again with the answers. Target choices go in first, then the command, both as intents under the input token. The mod declares no hooks.

### Fixed

- [Visible] **The Borg now reads the terrain the player remembers instead of the live terrain (neostryder/neo-angband#415).** Before this fix, its map ingest recorded an undiscovered secret door as a secret door, its necromancer darkness check counted glowing floor it could not see, and its corner scan read live passability on known squares. It builds its map from the level the character remembers.
- [Visible] **The Borg tests unknown potions and scrolls by using them again, as upstream's borg does (neostryder/neo-angband#377).** It now checks whether the character knows an item's flavour instead of assuming it always does, and it no longer treats an unread scroll as junk.

## 1.3.0 - 2026-10-01

### Added

- [Visible] [UI] **A New Borg character row on the title screen (key B).** It starts a character with the Borg at the keyboard, in a separate profile with its own options, mods and characters (fresh, copied from another profile without its characters, or one the Borg made before), or in the current profile. If the game refuses the separate profile, the row shows why and uses the current profile (neostryder/neo-angband#327).

### Changed

- [Visible] [Compatibility] **The Borg now needs Neo Angband 1.21.1 or later.** It is built and tested against that version.
- [Internal] [Modding-API] **Builds and tests against Core and the mod SDK 1.21.1.** The Borg reads Core's published `PlayerStatusView` and `ModPluginContext` and drops its local stand-ins for them.

### Removed

- [Internal] **Removed this repo's own Discord release announcer.** Its workflow, script and test are gone. The releases site at releases.rpgm.tools now posts each new release to the Neo Angband announcements forum.

## 1.2.1 - 2026-09-26

### Changed

- [Visible] [UI] **The Borg's settings read more plainly.** Its description and rule text in the mod manager are rewritten for clarity; every rule works as before.
- [Visible] [Docs] **The README's long note on which game hooks the Borg is connected to is now a short "How well it plays today" section.** The rest of the README, the terms and the AI usage policy are reworded in plainer English.

## 1.2.0 - 2026-09-11

### Fixed

- [Visible] [Modding-API] **Toggling most Borg settings mid-run now actually applies them.** Play risky, the five gear-scoring weights (damage, speed, hit points, spell points, armour class), save up for something it wants, and skimp on stockpiles for an early munchkin run previously looked like they took effect immediately but were silently ignored until the Borg was restarted; they now correctly prompt a reload (neostryder/neo-angband#186).

## 1.1.1 - 2026-08-29

### Fixed

- **The buff-timer safety net was not ported (neo-angband#32).** Buff
  bookkeeping was message-driven only: the Borg learned that a blessing,
  heroism, a temporary resist or a mystic shield had ended by reading the line
  the game printed when it expired. Upstream keeps a second, redundant record
  beside that one, reading the player's real timers out of the game every think
  and reconciling them against the flags the messages produced
  (`borg-trait.c:3010`). Without it a message that never arrived left the flag
  latched on for good, and every maneuver that opens by checking that flag - the
  ones that would recast the buff - was silently removed from the ladder for the
  rest of the character's life. The cross-check runs on every decision, ahead of
  the message pass, so a buff the engine reports as expired is corrected in time
  to be recast on the same turn. Haste and protection from evil keep upstream's
  own narrower shape, where the timer can raise the flag but not lower it. The
  toggle for this lives in the Bug Fixes mod's "Borg Fixes" section, not in
  this mod's own manifest - it defaults to on and is greyed out unless Bug
  Fixes is also installed.

## 1.1.0 - 2026-08-27

### Changed

- **This version requires Neo Angband 1.1.0 or newer.** `manifest.json`'s
  engine range moves from `>=1.0.0` to `>=1.1.0`. Ctrl-Z's own warn-and-confirm
  gate (#125) is host-side, and an older engine has no way at all to hand this
  mod the keyboard - installing this version on one would leave the Borg
  correctly inert rather than broken, but with no path to ever activate it.

### Removed

- **The standing *Let the Borg play* toggle (`borg.autoplay`).** Enabling the
  mod no longer offers a settings-row path that auto-installs the controller
  on the next boot. Press Ctrl-Z in play to warn, confirm, and hand over the
  keyboard (the host's existing interrupt key). The play-style toggles
  (risky, worships-*, self-scum, munchkin) are unchanged.

## 1.0.0 - 2026-08-26

### Fixed

- **Regional fear from an unseen spellcaster was not ported
  (neo-angband#38).** Upstream's `borg_fear_spell` and the monster-spell
  message table it keys off raised regional fear from a spellcaster the
  Borg cannot see, the same way an unseen biter already did; the spell side
  of that table did not exist in the port, so an invisible caster raised no
  fear at all. The spell-message table is ported and wired the same way the
  existing blow-message table already was.
- **The detection scheduler (`borg_check_light`) was not ported
  (neo-angband#40).** Upstream casts Find Traps/Doors/Stairs, Detect Evil,
  Magic Mapping and Detect Objects on a cadence and tracks per-panel which
  parts of a level have been swept, so a caster benefits from its own
  detection spells the way a warrior cannot. The port had no panel concept
  to hang that bookkeeping on; a 3x3 panel grid and the scheduler are both
  added.

## 0.9.3 - 2026-08-24

### Fixed

- **The breeder-rest guard was not ported (neo-angband#36).** Upstream refuses
  to rest for four turns after a MULTIPLY-flagged monster's tracked record is
  forgotten - killed, teleported away, or simply expired - because the level
  may hold more breeders the Borg has not found yet. `BorgKills.delete`, the
  port's own `borg_delete_kill`, now stamps a timestamp on exactly that
  condition rather than only on the kill path, matching upstream's single
  point of truth, and `borg_check_rest` refuses to rest while the stamp is
  inside its four-turn window, clearing it once the window passes so a stale
  value cannot coincidentally trip the guard again after a level change.

- **The buff message table was not ported (neo-angband#32).** Upstream tracks
  protection from evil, haste, bless, fastcast, heroism, berserker strength,
  the five elemental resists, and stoneskin/mystic shield from the game's own
  on and off messages ("You feel righteous!", "The prayer has expired.", and
  nineteen more). None of that table existed in this port, so every one of
  those flags stayed false forever and the buff-aware defensive maneuvers
  never recognised a buff the character already had running. The table is
  ported in full. The engine-side safety net upstream layers on top of it,
  reading the buff timers directly off the player as a cross-check, remains
  out of reach: the frozen view this mod reads exposes only the eight
  negative afflictions, none of these buffs, so there is nothing here to
  cross-check against.

## 0.9.2 - 2026-08-23

Added a Terms of Use and a shared Code of Conduct alongside the existing
LICENSE and SECURITY policy, and a README screenshot showing the Borg
exploring a dungeon level under its own control.

## 0.9.1 - 2026-08-23

Added a repository-specific `SECURITY.md` alongside the core policy, covering
the boundaries this repository owns: capability declarations, agent-view
handling, resolver wiring, and emitted commands. Refreshed the pinned engine
dependency to the currently published release.

## 0.9.0 - 2026-08-22

A second pass over the settings surface, checking every one of `BorgCfg`'s
fifteen fields against what actually reads it rather than against what is
merely declared.

### Added

- **A ninth toggle: *Skimp on stockpiles for an early munchkin run*
  (`borg_munchkin_start`).** Below character level `borg_munchkin_level` (12,
  not itself a setting here), it stops valuing potions of resist poison and
  speed, phase door, word of recall and the deeper cure stockpiles as highly as
  it normally would - real gear valuation moves, even though upstream's
  stair-scum diving mode for the same flag is not ported. The rule's own
  description says which half it is.

### Notes

- **`borg_uses_swaps`, `borg_kills_uniques` and `borg_uses_dynamic_calcs`
  remain absent, and now for a documented reason apiece rather than a shared
  one.** `borg_uses_swaps` has a real reader, but both functions it gates
  return early regardless of its value because the swap-valuation seams stay
  deliberately unwired - flipping it would tick and change nothing. The other
  two need a subsystem this port does not have: a live census of surviving
  uniques for the first, and a whole second formula-driven calculation engine,
  parsed out of `borg.txt`'s own FORMULA SECTION, for the second. See
  PLANNED.md.
- **The three remaining numeric settings** (`borg_no_deeper`,
  `borg_munchkin_level`, `borg_enchant_limit`) are confirmed blocked on the
  host's manifest schema, not merely assumed to be: `PackRule` in the game's
  own `packages/mod-sdk` carries only a boolean `default`, and every flag the
  host resolves to a mod is `Readonly<Record<string, boolean>>`. Reaching them
  needs a schema change in the game, which is out of this mod's reach.
- **Neo Angband 0.27.2 added a host-owned *Autoplayer speed* row** (Fast/
  Normal/Slow, 40/120/400ms) to whichever mod holds the autoplayer slot. The
  Borg gets it for free on 0.27.0 or newer with no change in this repository,
  because the control is keyed on which mod is playing rather than on
  anything a manifest declares. It has no tier faster than 40ms today; a 10ms
  tier is tracked in PLANNED.md as work the game's repository would need to do.

## 0.8.0 - 2026-08-22

Borg can be told how to play. Upstream reads about thirty settings out of a
`borg.txt` in the user's Angband folder; there is no such folder here and no path
to one on a phone, so eight of them are toggles in the mod manager beside *Let
the Borg play*, and each description names the `borg_` setting it is.

### Added

- **Eight of upstream's settings, as toggles.** *Play risky*
  (`borg_plays_risky`), the five gear weights - damage, speed, hit points, spell
  points, armour class (`borg_worships_*`) - *Value gold*
  (`borg_worships_gold`), and *Save up for something it wants*
  (`borg_self_scum`). Every default is upstream's own, so a player who touches
  none of them gets the Borg Angband ships, and the log line written when the
  Borg takes the keyboard names every setting that is not on its stock value.

  *Play risky* is the one that changes the most: it skips the early hit-point and
  character-level floors that hold the Borg above a depth, waits longer before
  drinking a cure, and backs away later in a losing fight.

  The five gear weights are the closest thing available to saying what kind of
  character the Borg should become, because what it wears is most of what it is.
  There is no stat-priority setting, and there is none upstream either: `borg.txt`
  describes one in a comment, but no setting backs it and the reincarnation code
  takes the game's default point-buy.

  Three of upstream's booleans are absent on purpose. `borg_kills_uniques` has no
  reader here at all, `borg_uses_swaps` gates two functions that return early
  because a swap contributes nothing to this port's power scoring, and
  `borg_munchkin_start` would move gear valuation without moving the diving
  behaviour it is named for, because the stair-scum mode it switches on is not
  ported. A toggle that ticks and changes nothing is worse than an absent one.

### Fixed

- **A stock Borg never saved up for anything.** `borg_self_scum` ships enabled
  upstream (`borg_settings[]`, borg-init.c:82) and both of this port's call sites
  read it as disabled, so the whole "set a gold target and work in town until the
  Borg can afford the one item it decided it needs" behaviour was unreachable at
  the default settings. It is on by default now, as upstream has it, and it is a
  toggle for anyone who preferred the old behaviour.

- **Nothing had ever supplied the settings.** `BorgCfg` and its stock defaults
  have been in the port since the self-model landed, and no caller passed one, so
  every one of the twenty-odd call sites that reads a setting read a default.
  This is the same shape as the resolver seams 0.6.x wired: code that is correct,
  present and fed a constant.

## 0.7.0 - 2026-08-21

**Needs Neo Angband 0.27.0 or newer**, up from 0.25.0. Several of the fixes
below are in the game rather than here - the trap predicate a locked door used
to fail, the host answering a blocking prompt for an autoplayer (both 0.26.0),
and the real multi-turn `rest` command plus the `shop-buy` / `shop-sell` /
`shop-exit` command handlers (both 0.27.0). A Borg that needs them and loads
on a game without them is a Borg that wedges against the first locked door or
heals at half rate, so `manifest.json` refuses instead. `src/play.test.ts`
measures whether the engine on disk has the trap fix, and skips itself rather
than failing when it does not, so a red suite here always means a fault here.

The entries divide into two halves. The first five stopped the Borg PLAYING: it
wedged, shuttled or swapped forever. The rest stopped it playing WELL, and they
share one shape - a fact the ported decision code reads that nothing in the mod
ever wrote. Between them they are why a level-one character stood still in town
and let a squint-eyed rogue kill it.

### Fixed

- **It walked onto an up staircase and then walked off it again, for as long as
  you left it running.** `borg_caution`'s "take the stairs you are standing on"
  block (`borg-caution.c:1169-1204`) had never been ported. `stairLess` and
  `stairMore` were written in twelve places and read in none, so every ladder rung
  that flows toward a staircase got the Borg there and nothing spent the turn: the
  flow ran out, the explore rung stepped one square off, and the flee rung pulled
  it back. Ported at its upstream position, which is why `borgCaution` now takes
  the flow state - the up-stair list decides whether going down is allowed.

- **A readiness flag was initialised to "never asked" and nothing ever asked.**
  `readyMorgoth` starts at -1, and upstream turns that into 0 on the first look, at
  the head of `borg_prepared_aux` and `borg_restock`. Neither normalisation was
  ported, and three readers test for exactly 0 - including the stair choice above,
  so it would have stayed switched off even once the block existed. The missing
  call site was `borg_caution`'s own restock arm (`caution.c:1064`), which is also
  what makes the Borg go home when it runs out of food, fuel or cures; that is
  ported too.

- **Arriving on a level did not clear "use the next staircase".** Upstream's
  `borg_update` sets `stair_less` and `stair_more` false on every level change
  (`borg-update.c:2135`). Without it, arriving in town with `stairMore` still set
  walked straight back down and arriving on level one with `stairLess` still set
  climbed straight back up: 215 descend/ascend pairs and nothing else. Two intents
  are routes across several levels and upstream keeps them, so the level wipe no
  longer resets everything: `rising` survives every arrival but the town's, and
  `fleeingToTown` survives depth one.

- **It swapped one wooden torch for an identical one, 3964 times in 4000
  decisions.** `borg_wear_stuff` was missing three guards: the two "been sitting
  on this level forever" returns (`wear.c:779`) and, the one that matters,
  `if (p <= b_p + 50) continue` (`wear.c:913`). The margin is the anti-loop -
  without it two near-identical items are each the better choice in turn, forever.

  The margin was necessary and not sufficient, because the difference being
  measured was 14000 points rather than noise, and the cause was the COMPARISON.
  A candidate loadout's score came out of the engine's hypothetical derive and was
  compared against the live self-model's score, which comes out of the live derive
  - and those two do not answer identically. Angband's own `calc_light` skips a
  daytime town's light only on the live pass (`player-calcs.c:1607`), so in town
  the hypothetical side counted a torch's radius the character does not have.
  Faithfully, because the port keeps that wart.

  Upstream never meets this, because it compares two numbers from one code path:
  it wields the candidate for real, scores it, and puts it back. That property is
  restored here. A candidate's score is now applied as a DELTA against the
  character as it stands, derived through the same hypothetical path, so any
  systematic difference between the two derives cancels instead of reading as a
  gain on every candidate. One extra derive per decision, memoised per think.

- **`borg_prep_leave_level_spells` is ported** (`borg-flow-stairs.c:252`), because
  the stair block above is its only caller: a caster with mana to spare hastes,
  resists and buffs before it takes a staircase, in upstream's order, each one
  setting the no-rest timer that stops it resting the buff away.

- **It rested while something it could not see beat it to death.** Upstream's
  answer to an attacker it cannot find is REGIONAL FEAR, and `borg_fear_regional`'s
  own comment (`borg-update.c:697`) is the specification: it exists "to keep him
  from resting while unseen guys attack him". This port had the two fear caches,
  both updaters that fill them and every reader that consults them, and nothing in
  between. `borgFearGrid` and `borgFearRegional` had no caller at all, so both
  caches held zero for the life of every character.

  The whole path is connected now, at upstream's own four points: an attack
  message the Borg cannot attribute raises fear at its own grid, a monster
  appearing right afterwards is assumed to be the cause and clears it again, the
  fear decays a point every ten turns, and a new level forgets it outright. The
  monster half is re-stamped once per think from each tracked monster's own
  danger, which is what makes a crowd read as dangerous when no single member of
  it does.

  Recognising an attack at all needs the game's blow-method messages, which
  upstream builds its `suffix_hit_by` table from at start-up. The plugin now reads
  the same records from `ctx.registries.monsters.blowMethods`, so a mod's own blow
  method is recognised on the same terms as core's.

- **The one gate that decides whether it is safe to sit still was wired to
  `true`.** `borg_check_rest` is ported, and `borg_recover` puts every one of its
  rests behind it - but the seam carrying its answer was the literal constant, so
  the Borg would rest with a monster one square away. It asks the real function
  now.

  The function was also missing six of its own arms, including both fear tests,
  the "I just cast a preparatory spell" timer, a mold two squares off, a breeder
  within ten, and anything that walks through walls. Its danger test asked the
  grid's TOTAL danger where upstream asks about one monster, which let a busy
  level veto a rest next to something harmless.

- **Nothing the Borg timed ever ran down.** Every duration it tracks -
  the resist-all guess, the no-resting-after-a-prep-spell timer, the recall
  countdown, the see-invisible clock - is counted in game turns and decremented
  each think by `borg_game_ratio`. Neither the decrements nor the ratio had been
  ported, so each of those latched permanently on first use: one Sense Invisible
  and the Borg would never look again. The ratio was also present as a placeholder
  set to 10 where upstream computes 1000 at normal speed, a hundredfold error in
  the one check that read it.

- **It never knew it was waiting for a Word of Recall.** `goal.recalling` is read
  in eight places and was written in none, so the Borg re-read the scroll and
  never sat still for it. The ignition, lift-off and cancellation messages
  (`borg-messages.c:709-757`) are consumed now, and the countdown floors at 1 the
  way upstream's does, so reaching zero cannot be mistaken for "no recall running".

- **The self-model believed a full pack was empty.** `borg_notice` matches carried
  items by `(tval, sval)` against the role table upstream builds at start-up
  (`borg-item-val.c`) to count what the Borg has: healing potions, phase doors,
  cures, fuel, food. The table was a seam that defaulted to `{}` and no caller ever
  passed one, so every comparison was against `undefined` and every count stayed
  zero. Borg dived, restocked and judged itself prepared as though it carried
  nothing at all. It defaults to the real table now, which is what upstream does
  unconditionally, and the food count is why `borg_check_rest` refused every grid
  on the level once it was finally being asked.

- **Every monster read as unable to attack from a distance.** `ranged_attack` is
  the count of a race's spell flags (`borg-flow-kill.c:216`); five subsystems
  read it and nothing wrote it. Among them is the rest check, which refuses a grid
  in line of sight of something that can shoot.

- **The escape counter could only ever go down.** Seven places lower it for a
  phase door, which upstream says is not really an escape, and the one place that
  raises it (`caution.c:1655`) was not ported. So "flee the level after three
  escapes" and "after fifty-five regardless" were both unreachable.

- **It chased monsters that were not there.** A tracked record is the Borg's
  belief about a monster, and `borg_follow_kill` (`borg-flow-kill.c:552`) is the
  only thing upstream has that ever revises one downward: when the Borg can see
  the grid it left a monster on and the monster is not on it, the record is
  followed one step into somewhere it cannot see, or forgotten. None of it was
  ported, so a record for a monster that had died out of sight, been mistaken or
  simply walked away survived the full 2000-turn expiry - and `borg_flow_kill`
  kept routing the Borg to it.

  That is the second half of "moving frantically back and forth across three
  cells": flow to kill the phantom, arrive, find nothing, let the explore rung
  step back, repeat. Measured over four seeds at 2000 decisions each, the tightest
  stretch of sixty consecutive monster-free decisions that were not spent resting
  went from one square to twenty-one, and the number of such stretches confined to
  three squares at full hit points went from 403 to zero.

  Upstream's 1-in-100 anti-loop roll is deliberately not ported and says so in
  the source. Its test is `randint1(100) < 1`, and `randint1` returns 1 to 100,
  so the arm is unreachable in 4.2.6; porting it would add a deletion path the
  original does not have.

- **Nothing ever marked a grid as lit by the Borg's own light.** `BORG_LIGHT` is
  "my torch reaches here" and `BORG_GLOW` is "this room lights itself"; three
  ported subsystems ask for the first and `borg_update_light`
  (`borg-cave-light.c:71`) was not ported, so all three read every dark corridor
  as unlit. Among them is the check above, which is why a phantom in a corridor
  could not be disproved even standing next to it.

- **Borg's own random stream restarted at the top of every decision.** The
  controller reseeded the private generator to a fixed constant before each
  think, so the first draw of decision one and the first draw of decision fifty
  were the same number, and so was every draw after it. Anything that consults
  the Borg's generator at a stable point in the think was therefore frozen: an
  equal-cost pathfinding tie-break resolved the same way every time, and a
  low-probability branch either never fired or fired on every pass. Upstream's
  swap-in/swap-out around `borg_think` ends by writing the ADVANCED value back
  (`borg.c:504`) and seeds the stream once at start-up
  (`borg-init.c:487-488`), so its stream carries from one think to the next. It
  now does here too. Borg remains fully deterministic for a given starting
  seed, because determinism comes from the stream being private and seeded, not
  from restarting it.

  `src/play.test.ts` also gave every one of its four "different" runs the same
  Borg seed, so the suite was structurally blind to this entire class of bug.
  The seed now varies with the run.

- **It read the wrong square's danger before deciding whether to teleport out.**
  `borg_escape`'s parameter is named `b_q`, but it has exactly one caller and
  that caller passes the danger of the grid the Borg is STANDING ON
  (`borg-caution.c:1653`). This port trusted the name and passed the smallest
  danger among the surrounding squares instead. Every threshold inside is "is
  this danger above X", so a smaller number could only ever suppress an escape,
  never cause a spurious one: a first-level character on a dangerous square with
  one safe square beside it read the safe square's number, decided it was fine,
  and stayed to be killed. The exact scenario the field report described.

- **There was no way to simply step back from a monster.** `borg_caution`'s
  *** Back away *** block (`borg-caution.c:1664-1846`) had never been ported, and
  nothing else in the ladder does its job: caution found no escape item, returned
  nothing, and the next rung attacked. That left a fresh character exactly one
  response to anything that walked up to it, whatever the odds, which is how a
  level-one character dies to a town rogue rather than retreating up the alley it
  came from. Ported at its upstream position, thresholds and all: the 40 percent
  danger reduction a character past level 35 demands before giving up a square,
  the 80 percent one below it, the freedom-of-movement tiebreak when two squares
  are equally dangerous, the refusal to move while confused or while the
  anti-summon corridor timer is running, and the bounce detection that stops the
  retreat itself becoming a shuffle. Upstream's two warts in this block are kept:
  a trap in any one direction abandons the whole search, and the "next to a
  monster" flag latches on the first bad direction and then applies to all of
  them, which in practice makes backing away a corridor manoeuvre.

- **It never picked anything up, and it was two separate faults.** Every rung
  that walks to a floor object gates on that object's estimated value, and
  `borg_new_take`'s valuation (`borg-flow-take.c:251-271`) had never been
  ported: the field it writes was initialised to "worthless" and no code path
  ever set it otherwise, so every object on every floor scored zero and the Borg
  walked past all of it. Gold was the exception and hid the rest, because the
  engine collects gold on the step whatever the character has decided.

  Fixing the valuation alone would have made it worse. Upstream never presses a
  pickup key: it turns on `pickup_always` when it takes over
  (`borg-init.c:415`), so stepping onto an object collects it. A mod cannot flip
  that option without changing the human's saved settings and leaving them
  changed, so the Borg now asks for what is under its feet with the ordinary
  pickup command, on arrival only. On arrival only is not a detail: a rung that
  collects while standing still picks up whatever the junk-dropping rung has
  just put down, and puts it down again. Measured at fifty-five drops against
  five pickups on one square before that was gated.

  Pricing needs the shop value of an object kind and whether the character knows
  the flavour, both of which the frozen view leaves out; they now arrive through
  the same host seam that already carries danger vision, so a mod's own object
  is priced by the same lookup as one of the game's.

  Upstream also inscribes an item "borg ignore" one keypress before it drops it
  as junk, which prices it at -10 and is the only thing that stops the Borg
  collecting its own discards on the way past. There is no inscribe command on
  the frozen action surface, so the Borg remembers what it has thrown away on
  this level instead.

- **It turned round almost as soon as it arrived.** `borg_must_return_to_town`
  (`borg-prepared.c:828`) has two guards and the port had neither: upstream
  never asks the question in town, and never asks it in the first hundred turns
  on a level, so a character short of supplies walks the level it is on before
  deciding to go home. Without them, the "go to town without delay" rung - which
  outranks attacking, collecting and exploring - could fire on the first think
  after arriving anywhere.

- **Borg's clock never restarted, and after thirty thousand decisions it
  stopped playing for good.** `borg_t` is a PER-LEVEL counter upstream, reset to
  1000 on every arrival (`borg-update.c:2017`), and every absolute test written
  against it assumes that. Here it only ever climbed, so the message-flush hacks
  at twelve and twenty-five thousand fired once and never again, the monster
  purge at twenty thousand became permanent, and `borg_think_dungeon`'s own
  overflow panic at thirty thousand - which hands the game back to a human -
  became a fixed end to every long session rather than something no character
  ever reaches. The same arrival now also zeroes the anti-summon timer and
  accumulates the time-since-town counter, which nothing had ever written, so
  the two arms that read it were measuring time on the current level instead.

- **Arriving somewhere new left the old level's staircases on the map.** The
  location tracks - stairs, doors, glyphs, rubble veins - are wiped on arrival
  upstream (`borg-update.c:2165-2183`) and were not wiped here, because they
  live beside the pathfinder rather than in the world model. The rung that keeps
  a weak character near an escape route then measured the distance from the
  character to a staircase on a level it was no longer on. At character level
  one that leash is seventeen grids, so it decided it had wandered too far on
  its first think of every new level, and turned back. A companion fault kept it
  turned back: the flag only clears when the Borg is within three grids of a
  known up staircase, and the port had added a guard that skipped the clear when
  no staircase was known at all, so on a level with none the flag never came off.

- **A readiness flag was being written by a routine that upstream leaves alone.**
  `borg_prepared`'s shallow branch (`borg-prepared.c:627`) returns without
  touching `ready_morgoth`; this port set it to "unknown" on the way out
  regardless. `borg_caution` will only set the flag that actually spends a turn
  on a staircase while that reads zero, so whether the Borg would climb depended
  on which subsystem had asked a question last.

- **It rested at half the rate upstream does.** The agent action surface's
  `rest()` took no argument and the engine mapped it to a single-turn hold, so
  every recovery-ladder call spent one turn and stopped; a real rest needs five
  consecutive turns to earn the doubled hit-point and mana regeneration
  (`player-util.c:459`, `REST_REQUIRED_FOR_REGEN`), which a hold never starts.
  `rest()` now takes an optional turn count and the seven recovery call sites
  pass `REST_COMPLETE` ("rest as needed") explicitly; the one call that wanted a
  single tactical turn while waiting for an approaching monster moved to
  `hold()` instead, because a count of exactly 1 means "repeat the last rest",
  not "one turn". **This needs the corresponding Neo Angband fix, which has not
  reached a release yet** - see `PLANNED.md` item 9. Until then the call
  degrades to today's single-turn hold, silently and correctly; no player-facing
  change lands until the engine catches up.

### Added

- **A test that plays the game.** `src/play.test.ts` boots a real game against the
  engine, installs the Borg as its command provider, and drives 1500 decisions on
  each of four seeds. It does not check that the Borg plays well - a level-one
  character dying on depth two is upstream's own outcome - it checks that the Borg
  is still playing: that no single command has run away with the session, that the
  character covered ground, and that game time passed. Every loop above is
  individually a correct decision and collectively a hang, which is precisely what
  seventeen files of unit tests could not see. It skips, loudly, when the game's
  checkout is not beside this one.

## 0.6.3 - 2026-08-21

### Fixed

- **The README claimed more than the mod does, and a player reads it before
  deciding to install.** `plugin.js` is byte-identical to 0.6.2, and this is a
  release rather than a commit because the README ships inside the payload the
  game fetches at a tag: a correction that stays on `master` is a correction
  nobody installing this can see.

  What it now says is what was measured. Watched in the released 0.25.0 desktop
  build over two characters, the Borg took the keyboard, shopped, wore what it
  bought, found the town's down staircase and descended - and then stalled on the
  first dungeon level both times without dying, so it never started a new
  character. Two of the three stalls are this mod's and one is the game's. All
  three are named, with their mechanisms and their owners, in `PLANNED.md`.

## 0.6.2 - 2026-08-21

### Fixed

- **Borg threw on its first perceived turn, and the game blamed itself.** The
  manifest declared one capability, `command:add`, and the frozen `AgentView` is
  gated per DOMAIN: reading the player without `state:player.read` raises
  `AgentCapabilityError`. So the mod installed cleanly, logged that it had the
  keyboard and all four resolver seams, and then threw the moment it looked at
  the character. The manifest now declares the nine read domains the port
  actually uses: player, monsters, map, inventory, floor, messages, stores,
  spells and constants. It asks for no `state:*.read` wildcard, so the consent
  screen still names what it reads.

  Three things made this survive to a release, and all three are worth knowing.
  The install-time check wants `command:add` alone, so nothing refused it. The
  throw unwound out of the game loop, which reports a fault with no mod attached
  to it, so a player was told the GAME had hit a bug and pointed at the game's
  issue tracker; the session also stopped saving, and the autoplayer's own clock
  kept ticking and re-throwing behind a notice that is shown once. And no test
  here could see it: every test drives the port through a fake view with no
  capability gate, so the suite was green.

  `src/manifest-capabilities.test.ts` now derives the required set from the
  source - it scans for the accessors the port calls, maps each to the domain the
  engine gates it on, and requires the manifest to declare exactly that set. It
  also fails when a newer engine adds an accessor nothing has classified.

- Found by installing 0.6.1 from its tag into the released 0.25.0 desktop build
  and watching it, which is the only instrument that could have found it.

## 0.6.1 - 2026-08-21

### Changed

- **This version requires Neo Angband 0.25.0 or newer.** `manifest.json`'s engine
  range moves from `>=0.12.0` to `>=0.25.0`, and for a mod that ships code an
  out-of-range engine is a refusal rather than a warning: an older game declines
  to load this and says why, instead of loading a Borg with two of its parts
  missing. Both of those parts are what make it an autoplayer rather than a
  library. The restart-on-death loop arrived in 0.25.0, and playing itself over
  and over is the entire point of a Borg. `AgentView.simulateLoadout` arrived in
  0.25.0, and without it the Borg wears nothing it finds, buys nothing it needs
  and sells nothing it is finished with. No earlier version of this mod ran a
  working autoplayer on any engine, so a hard floor breaks no installation that
  was playing properly.
- The plugin no longer probes for that capability, and no longer has a degraded
  path to fall back to. It reads `ctx.registries` and `ctx.state` as facts it is
  entitled to, wires all four resolver seams from them unconditionally, and
  refuses a context missing either one by name rather than playing on blind. That
  refusal cannot be reached through the game's own loader, which rejects an
  out-of-range engine before it imports a mod's code. It is there because the
  alternative failure is silent: a Borg with no resolvers still issues a legal
  command every turn and looks exactly like a Borg making bad choices.
- `makeCoreResolvers` no longer takes a `loadout` input. The seam is installed
  unconditionally, and the null it can still answer with is a property of the view
  it is handed rather than of the engine version.

### Fixed

- The README said the Borg "does not flag your save". Handing the keyboard over
  sets the save's `NOSCORE_BORG` flag, which keeps the character off the
  high-score table for the rest of its life, so the sentence was answering a
  narrower question (determinism) with a wider claim. Both facts are now stated
  separately: the Borg costs nothing in reproducibility, and it does mark the
  character. That mark is upstream's own behaviour and it cannot be cleared, which
  is exactly the sort of thing a player should not discover from the score screen.
- The README said the Borg does not start a new character when it dies. It does,
  and from this version that is a requirement rather than a bonus. **The
  restart-on-death loop is entirely the engine's**, and needed no code here: a
  controller can only return a `PlayerCommand`, and birth has no representation in
  that set, so there is nothing this mod could return that means "roll me a new
  character". The game's own death handler reincarnates the player in place
  whenever a mod holds the keyboard - same session, same save slot, a rolled race
  and class each time.

## 0.6.0 - 2026-08-21

### Added

- **Borg evaluates gear it is not wearing**, the fourth and last
  `BorgResolvers` seam from `PLANNED.md`. `borg_wear_stuff`,
  `borg_think_shop_buy_useful` and `borg_think_shop_sell_useless` all decide by
  comparing `borg.power` now against `borg.power` with a candidate worn, bought
  or sold, and every one of them was reading a default that reported no gain from
  anything. So the Borg wore nothing it picked up, bought nothing it needed and
  sold nothing it was finished with, on any host.
- `makeCoreResolvers` takes a fourth input, `loadout`. It is a capability rather
  than a datum: scoring a loadout the character is not in means re-running the
  engine's own `calc_bonuses` over a hypothetical set of worn objects, which only
  the engine can do. Neo Angband 0.25.0 adds `AgentView.simulateLoadout` for
  exactly that, and `plugin.ts` probes for it rather than assuming it.
- `borgSimulatePower` (`src/trait/simulate.ts`) runs the ported `borg_notice` and
  `borg_power` over the loadout the engine describes, which is the same wield /
  recompute / revert shape upstream uses. It scores against a scratch copy of the
  self-model, so evaluating a dozen candidates in one turn leaves the Borg's own
  view of itself untouched.
- **A mod's items are evaluated on exactly the same terms as core's.** The
  simulated loadout arrives as ordinary `ItemView`s and the ported scoring reads
  their properties, never their provenance. A test pins that, the same way the
  monster-facts test does.

### Changed

- On an engine older than 0.25.0 the swap / buy / sell seam stays on its
  conservative default and the Borg's log says "no loadout evaluation" instead of
  "loadout evaluation". The engine range stays permissive (`>=0.12.0`): a mod that
  can still do most of its job should not refuse to load.
- The two SWAP valuations (`weapon_swap_value`, `armour_swap_value`) are
  deliberately left unwired. This port has no swap subsystem, so both contribute
  zero to `borg_power` and an evaluator would compare two numbers that are equal
  by construction. Recorded as unreachable rather than pending.

## 0.5.0 - 2026-08-21

### Added

- **Activation identity and the in-shop signal**, two of the three remaining
  `BorgResolvers` seams from `PLANNED.md`. `makeCoreResolvers` now also takes
  `objects` (`ctx.registries.objects`) and `state` (`ctx.state`), each
  independently optional so an older host still gets whichever seams it can
  supply data for.
- Borg can now tell whether a worn item grants a named activation and
  whether it is charged (`borg_equips_item` / `borg_activate_item`), by walking
  the item's artifact, ego or kind back to the `Activation` record that grants
  it - the same precedence `obj-make.c` applies when the object was created. A
  mod's ego or artifact is resolved by the same lookup as core's.
- Borg can now tell which shop it is standing in (`square_shopnum`), which
  is what lets the town-flow ladder's shop-interaction steps actually fire.
  Reads `ctx.state` directly; needed no new host plumbing, because a level's
  `Chunk` already carries the bound feature registry it was generated with.
- Still open: the power of an unevaluated swap, buy or sell, which needs a core
  capability (hypothetical player-state simulation) that does not exist yet.
  See `PLANNED.md`.

## 0.4.1 - 2026-08-21

### Fixed

- The build section said the game's catalogue pins this mod's SHA-256. The game
  ships no catalogue. An install fetches the committed `plugin.js` from a pinned
  tag and runs it as it is, and nothing rebuilds it on the way in, so a stale
  artefact passes every other check and is the file players run. The reason to
  keep `plugin.js` committed is unchanged; the mechanism named for it was wrong.
- The builder's own documentation had its resolution order backwards, describing
  a sibling checkout of the game as preferred. `npm ci` is the whole setup, and
  the checkout is an override for developing against an engine change that has
  not reached the registry yet.

### Changed

- Tested against engine 0.24.0 rather than 0.13.0.
- `plugin.js` is byte-identical to 0.4.0, so an installed copy plays identically.

## 0.4.0 - 2026-08-20

### Added

- **Borg can see danger.** `plugin.ts` built Borg with no resolvers, so
  every seam fell back to its conservative default, and the one that mattered was
  the facts resolver: zero blows and zero spell frequency meant `borg_danger`
  reported no threat, so nothing was ever worth fleeing from. It now binds the
  host's monster race registry, which is what `borg_danger` needs to reason about
  a monster it is tracking rather than one it can currently see.
- **A mod's monsters are dangerous on the same terms as core's.** Binding happens
  after mods compose, so a modded creature is an ordinary monster race at a real
  index and the resolver never asks where it came from. A test pins that, so the
  behaviour cannot be narrowed to core content later by accident.
- On a host with no registry the Borg still plays and writes "playing blind" to
  its log. A Borg playing badly and a Borg handed no monster data look identical
  from outside and have completely different causes, so it says which it is.

### Changed

- Three of the four resolver seams are still on their defaults: no activations,
  never in a shop, and no power credited for an item whose value it has not been
  told. The README now names which seams are live and which are not.

### Requires

- A game carrying `ctx.registries`, which is Neo Angband 0.23.0 or newer. On
  anything older the mod loads and plays without danger vision rather than
  refusing to load, because a mod that can still do most of its job should not
  lock a player out of the rest of it.

## 0.3.1 - 2026-08-15

### Fixed

- Line endings normalised to LF and pinned with `.gitattributes`. Seven files
  were CRLF in the index while the rest of the repository was LF, and nothing
  stopped a Windows checkout drifting back.

## 0.3.0 - 2026-08-06

### Added

- `manifest.json` declares its `repository`. This is the field an import reads:
  install the mod from a `.zip` and the copy on disk pins itself to the
  repository its own manifest names. Without it an imported copy binds to
  `file:import`, and the update check has no repository to ask, so the one
  install route that does not start at a repository produced the one copy that
  could never be updated.

### Changed

- `author` is `neostryder` rather than `neostryder (RPGM Tools)`. The mod list
  already trimmed the parenthesis, and the detail pane printed the full string,
  where it read as two names for one person.

## 0.2.0 - 2026-08-01

### Changed

- The description is rewritten as short paragraphs. The previous one was long
  enough to squeeze the mod manager's list down to a single visible row with no
  way to scroll it. Nothing about what the mod does changed. The manager's own
  half of that problem is fixed in the game: the pane is capped, and a "Read the
  full description" row opens the whole thing in a viewer that scrolls.

## 0.1.0 - 2026-08-01

### Added

- **Borg arrives and can be played.** Angband 4.2.6's `borg/` ported to 86
  files, driving the game through the published perceive and act API rather than
  through engine internals. It takes the keyboard only when "Let the Borg play"
  is switched on, and it draws from its own seeded generator, so handing it a
  character does not flag the save as non-reproducible.
- Written against the same API a third-party automation would use, deliberately.
  It is the most demanding mod anyone could write against that API, so if the
  Borg cannot be written without reaching into internals then the modding API is
  not finished.

### Fixed

- Two things had to be repaired before it ran at all. The per-think reseed went
  through the savefile path, which forces quick mode off and leaves an all-zero
  generator table, and an all-zero table emits zero forever; that was fixed in
  the engine at 0.13.0. Its two hanging test files were also excluded from CI, so
  `think()` had never been executed by anything.
- The plugin no longer bundles the engine. A bundled copy would give the plugin
  its own registries while the game ran on another set, so every non-relative
  import is external and the build refuses a survivor. The six symbols that were
  the whole runtime coupling arrive as live bindings filled from `ctx.core`.

## 0.0.0 - 2026-07-30

- The repository reserved the name and carried the plan. Nothing was installable,
  and the README said so rather than reading like a release.
