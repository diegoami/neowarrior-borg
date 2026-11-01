# Borg playability: implementation record and remaining work

**Opened 2026-08-21. Target: full functionality, validated by several successful
runs, where a successful run means it tries its best and gets as far as it can.**

This file exists because the mod's tests are green, its port is faithful, and the
thing a player installs does not play properly. Nothing below is a bug in the
ported code. Every item is a seam that was built, documented and never connected,
which is a failure mode this project has now hit four times, so the shape is worth
naming: a capability that exists in the tree and not in the product.

## What was actually wrong

**Written 2026-08-21 before any of it was fixed, and kept in the past tense rather
than deleted: the diagnosis is the useful part, and a file that erases what was
wrong as soon as it is fixed teaches nobody the shape of the failure.** Every
seam described below is now wired; see Progress.

`plugin.ts` called `createBorg()` with no argument. `src/controller.ts` then does
`buildThinkSession(opts.resolvers ?? {})`, and `src/think-session.ts` says in its
own header what an empty resolver set means: the four seams "default to faithful
conservative behavior (zero-magnitude danger, no activations, never in a shop, no
power gain from an unevaluated swap/buy/sell) so the Borg is correct-but-cautious
until a host wires real engine data."

No host wired any of them. So the shipped Borg played with no danger
perception, never shopped, never used an activation, and could not evaluate an
equipment swap.

The resolver factory was not missing either. `src/resolvers.ts` has always
exported `makeCoreResolvers`, which bridges core's `MonsterRace` records into the
`MonsterFacts` the ported `borg_danger` math needs, and its own comment says the
numbers "match upstream verbatim" once it is installed. **It had never had a
caller**, for a reason worth keeping: the thing it needed was not in the mod at
all. Nothing here could have fixed it.

## Definition of done

Three claims, and the third is the one that decides it:

1. All four resolver seams are wired from real engine data, or a seam that cannot
   be is documented as unreachable with the reason. **DONE 2026-08-21.** The
   fourth needed an engine capability rather than host wiring; it landed as
   `AgentView.simulateLoadout` in Neo Angband 0.25.0.
2. There is a restart-on-death loop. Playing itself over and over is the point of
   the mod, and no loop exists anywhere in it. **DONE 2026-08-21.** It needed no
   code in this repository at all: the whole thing is host-side, because
   `AgentCommand` is `PlayerCommand` and birth has no representation in it. It
   landed as `StartedGame.reincarnate` plus the game loop's death handler in Neo
   Angband 0.25.0.
3. It has been WATCHED playing, in the installed build, over several runs, and
   what it did is written down: what depth it reached, whether it fled, whether it
   shopped, whether it used an activation, how it died, and whether it started
   again. A green test suite is not this claim and cannot become it.

   **DONE 2026-08-22.** See "Watched playing, 2026-08-22" below for both runs and
   all six answers. The short version: it plays, it fights, it flees, it dies and
   it starts again on its own; it does not shop, and that is the reason it is
   still dying at character level one.

   First attempted 2026-08-21, and that attempt failed. The watching happened
   and is written down below; what it showed is that the Borg does not yet get far
   enough for this claim to be answerable. It reached 50 feet twice and stalled
   both times without dying, so the restart loop was never exercised at all. Three
   distinct stalls are named in "Watched playing" below, one of them in this
   repository and two of them in the game's.

   All three stalls are now closed, and there is a test that plays. That
   changes what claim 3 is waiting for, and does not satisfy it. Every stall was
   found and fixed with `src/play.test.ts`, which boots a real game, hands it to
   the Borg and drives 1500 decisions on each of four seeds: it now explores
   hundreds of squares, opens doors, disarms real traps, changes level and dies.
   That instrument paints nothing and runs no shell, and the prompt fix is entirely
   shell-side, so it cannot answer this claim. It can and does answer the sentence
   this bullet used to end with - "not one of them plays a turn" was true of the
   whole suite and is not any more.

   A second watching found two more symptoms, and they were not stalls. The
   Borg paced with nothing in sight, and it stood still in town while something it
   could not see killed it. Both are diagnosed and fixed below (symptoms 4 and 5),
   and both were found by asking the harness new questions rather than by watching
   again - which is the shape this claim keeps meeting. The watching is still
   owed.

Until 3 is done, nothing here says the Borg plays properly. See the README's own
"What it is" section, which was narrowed on 2026-08-21 for exactly this reason.

## Watched playing, 2026-08-21

The instrument: the released 0.25.0 desktop artefact (`Neo.Angband-0.25.0-win.zip`)
unpacked to a scratch path, driven over CDP. The mod installed through the game's
own **Install a mod...** row from the curated list, at its tag, enabled, with
capabilities granted and *Let the Borg play* switched on. Not a local build, not a
harness: the bytes a player downloads.

| | Run 1 | Run 2 |
|---|---|---|
| Mod version | 0.6.2 | 0.6.2 |
| Character | Gnome Paladin, level 1 | Gnome Paladin, level 1 (a second character, same roll) |
| `auto_more` | off (the game's default) | on |
| Depth reached | **50 ft (L1)** | **50 ft (L1)** |
| Shopped | **yes** - gold 600 to 301, and it wore what it bought (AC 0 to 1) | **yes**, same |
| Fled | not observed - it met no monster | not observed |
| Used an activation | not observed - it owned nothing with one | not observed |
| Took stairs | **yes** - found the town's down staircase and descended | **yes** |
| How it died | **it did not die** | **it did not die** |
| Reincarnated | **never exercised**, because nothing died | **never exercised** |
| How it ended | wedged on L1 repeating `disarm` against a locked door, 559 times over 8 minutes, with game time frozen | wedged on L1 oscillating in a three-square corridor for 9 minutes; game time DID pass (food 89% to 84%) and nothing else changed |

What the two runs do establish, and it is not nothing: the mod installs from its
tag into a released build, takes the keyboard, and reports what it wired - `the
Borg has the keyboard, and danger vision over 624 races, activation identity, the
in-shop signal and loadout evaluation`. The town half of the ladder works. It
shopped, and it wore the armour it bought, which is the loadout seam from 0.6.0
doing real work in a real game for the first time. Then it walked to the down
staircase and used it.

### The three stalls, and which repository each belongs to

The first problem was a refused command repeating forever while no game time
passed. THIS REPOSITORY. On L1 the Borg stood beside a closed door and issued `disarm` at it
without end. The chain is exact:

- A door's lock is stored as a "door lock" **trap record** on that grid. That is
  upstream Angband's own data model, faithfully ported.
- `CellView.trap` is "this grid has any trap record", so a locked door reports
  `trap: true`.
- `src/perceive.ts`'s `ingestMap` copies `c.trap` into `ag.trap` on every
  perceive, and `src/flow/flow.ts` checks `ag.trap` **before** it checks
  `ag.feat === FEAT.CLOSED`. So the door is disarmed rather than opened.
- The engine's `disarm` requires a **visible player trap**. A door lock is not
  one, so it answers "You see nothing there to disarm." and returns zero energy.
- `flow.ts` clears `ag.trap` optimistically, but the next perceive sets it back
  from the view, and no turn has elapsed. Nothing breaks the cycle.

Upstream's borg never hits this, and the reason names the defect: its `ag->trap`
comes from `square_isdisarmabletrap`, which a locked door fails on two counts (a
door lock is flagged `LOCK | INVISIBLE`, so it is neither a player trap nor a
visible one). The port swapped that for a wider signal without narrowing it.

**FIXED 2026-08-21, in the game's repository.** `CellView.trap` is now
`square_isdisarmabletrap` - the same predicate `disarm` itself tests, and the same
one the trap layer draws from. A glyph of warding, a web and a decoy are excluded
by it too, and so is a trap the player has not found, which the old field leaked.
Nothing in this repository changed: `ingestMap` copying `c.trap` was correct, and
the field it copied was not. The second question the paragraph above asked - a
general guard against a command refused for free - was not needed once the field
told the truth, and a guard would have papered over it.

The second problem was that it did not explore a dungeon level. THIS REPOSITORY. With the first stall
avoided, run 2 spent nine minutes moving between two squares of the corridor it
arrived in, standing on the up staircase. Game time passed, so this is a decision
loop rather than a freeze: the flow either finds no dark target or re-targets the
stairs it is on. The revealed map never grew past a bare corridor. Upstream's
`borg_flow_dark` is what should be carrying it, and something in that path is
not.

**FIXED 2026-08-21, and `borg_flow_dark` was innocent.** The ported explore path
is faithful; what was missing sat two rungs above it. Four separate facts, each
found by driving a real game headlessly and reading the trace rather than by
reading the code again:

- **Nothing in the port ever used a staircase it was standing on.**
  `borg_caution`'s own "take the stairs up / take the stairs down" block
  (`borg-caution.c:1169-1204`) had never been ported - the file header said the
  stair-taking tail was "left to the P8.6 think ladder", and the ladder never took
  it. `stairLess` and `stairMore` were written in twelve places and read in none.
  So every rung that flows toward a staircase got the Borg onto one, the flow ran
  out, the explore rung stepped one square off, and the flee rung pulled it
  straight back. That IS the two-square oscillation, exactly, and the up staircase
  it was standing on was the arrival stair.
- **`readyMorgoth` was initialised to -1 and nothing ever changed it.** Upstream
  turns that "never asked" into 0 on the first look, at the head of both
  `borg_prepared_aux` (`borg-prepared.c:48`) and `borg_restock`
  (`borg-prepared.c:697`); neither normalisation was ported. Three readers test
  for exactly 0, the stair choice above among them, so it would have stayed
  switched off even once the block existed. The call site upstream gets the
  ordering from is `borg_caution`'s restock arm (`caution.c:1064`), which was also
  missing - and that is the rung that sends the Borg home when it runs out of
  food, fuel or cures.
- **Arriving on a level did not clear "use the next staircase"**
  (`borg-update.c:2135`). With the two above fixed, this surfaced immediately as a
  town/level-one shuttle: 215 descend/ascend pairs and nothing else. The same wipe
  was also too broad in the other direction - it reset `rising` and
  `fleeingToTown`, which are routes across several levels that upstream keeps.
- **The equipment swap loop**, which is its own entry in CHANGELOG.md: three
  missing guards in `borg_wear_stuff` plus a comparison between two differently
  derived scores. It dominated every run once the stalls above were gone, and it
  is why "explores properly" could not be answered until it went.

The instrument is now a test. `src/play.test.ts` boots a real game, hands it to
the Borg and drives 1500 decisions on each of four seeds, checking that no single
command ran away with the session, that the character covered ground and that game
time passed. All four facts above were found with it and all four are guarded by
it. Not one of the other seventeen test files could see any of them, because each
loop is a decision that is individually correct.

The third problem was a blocking prompt that parks the autoplayer, leaving only
a human able to free it. THE GAME'S REPOSITORY. Descending prints "You enter a maze of down staircases."
behind a `-more-`, inside a modal, and the host's autoplayer clock skips every
tick while a modal is open. Nothing answers the prompt, so the Borg waits for a
keypress that will never come; a human pressing any key frees it and it resumes.
Upstream's borg answers that prompt itself through `inkey_hack`, which this port
has no equivalent of - a controller returns a `PlayerCommand`, and "dismiss the
message" is not one.

Turning the game's own `auto_more` option on clears this one and the multi-page
message variant, and that is what run 2 did. It is not a fix and should not be
written up as a workaround: the same shape parks the Borg on the floor-item
screen (any step onto two or more objects) and on the store screen (any step onto
a shop door), and `auto_more` reaches neither. The option is also stored per
character, so it reverts every time the Borg reincarnates - which makes it
useless for exactly the unattended run this item is about.

**FIXED 2026-08-21, in the game's repository, and the answer was upstream's own
mechanism rather than a new contract.** Reading `borg.c` settles what upstream
actually does, and it is not what "there is no asynchronous prompt in C" would
suggest: `internal_borg_inkey` looks at the message line FIRST and answers a
trailing " -more-" with a space (`borg.c:371-388`), and a named set of prompts get
their own replies (`borg-messages-react.c`), all before `borg_think` is reached at
all. The borg's key source is consulted for EVERY key the game reads. So a
blocking prompt is the borg's next keypress, not something it waits out.

Every blocking read in the game's web shell resolves on a keydown delivered
through one input door, so the host now feeds one ESCAPE into that door whenever an
autoplayer holds the keyboard and a modal is open on a live game screen, and logs
that it did. It reaches the pager, the forced `-more-` in front of a level change,
the floor-item list, a confirm and the shop screen, which is every case named
above. Nothing is answered before there is a game, so character creation still
belongs to the player.

Two honest limits, both reviewed rather than assumed:

- **ESCAPE is not a per-prompt answer.** Upstream replies `y` to a few named
  confirms and a letter to a few pickers. In this port those live in the shell's
  KEY path, in front of a command a human typed; a controller's command goes
  straight to the command provider and never raises one. So the asymmetry is not
  reachable today - but a future prompt raised from inside a turn would be
  answered "no" rather than correctly, and that is the seam to revisit if one
  appears.
- **The shop screen is dismissed rather than driven**, which is strictly better
  than parking on it and is not the same as shopping. Borg's store ladder
  returns `shop-buy` / `shop-sell` / `shop-exit`, and NOTHING in the engine's
  command registry handles those three codes today - a separate gap, recorded
  below, and the reason the shopping seen in the watched runs cannot be credited
  to the ladder.

## Watched playing, 2026-08-22

Two instruments, both driven over CDP, each with its own `NEO_ANGBAND_DATA` so
neither touches a real install:

- the **development Electron build** at engine 0.26.0, with the mod loaded as a
  folder from this checkout's `master` (no tag needed for a folder load);
- the **v0.26.0 release artifact** (`Neo.Angband-0.26.0-win.zip`, read out of the
  unpublished draft), unpacked to a short path and run against its own data dir.
  It confirms the packaged bytes behave the same as the development build, and
  `window.__neo` is absent in it, which is how a release build is told from a
  development one.

Both were seeded the way the mod manager writes its own state (third-party mods
allowed, `borg` enabled, its ten capabilities granted, `borg.autoplay` on), then
handed a character rolled with the birth screen's own random-everything key.

| | Development build, 13 min | Release artifact, 4 min |
|---|---|---|
| Mod loaded | yes: `danger vision over 624 races, activation identity, the in-shop signal and loadout evaluation` | same line, same numbers |
| Mod faults / console errors | **0** | **0** |
| Characters played | 4 | 2 |
| Depth reached | **50 ft (L1)** | **50 ft (L1)** |
| Levels visited | 25 down / 24 up staircases in the 9-minute sample | 44 down / 43 up |
| Fought | 2 slain, several fights lost | **13 slain**, 53 blows landed |
| Fled | **yes** | **yes** |
| Shopped | **no** | **no** |
| Used an activation | no - owned nothing with one | no |
| How it died | a giant yellow centipede; Grip, Farmer Maggot's Dog; once while confused | Fang, Farmer Maggot's Dog, with a wild dog |
| Started again | **yes, 3 times, unattended** | **yes, unattended** |

### What was actually seen, message by message

It answers its own prompts and keeps going. 37 `answered a blocking prompt`
events in the 9-minute sample, including the forced `-more-` in front of every
level change. Nothing ever waited for a human.

A locked door is opened rather than disarmed forever. Four locks picked in the
sample, each preceded by two to five `You failed to pick the lock.`, one per
second - failures that SPEND A TURN, where the old refusal loop spent none and
froze game time. This is the 2026-08-21 stall, gone, in the shell.

It explores. Four secret doors found by searching, rubble tunnelled through
with its weapon, two piles of copper picked up, and screenshots showing whole
rooms and corridor networks revealed. Nothing resembling the reported three-cell
shuffle appeared in either run.

It flees, and the cleanest example is unambiguous. In the artifact run a crow
traded blows with it, the low-hitpoint warning fired, it landed one more hit that
routed the crow, and it left by the up staircase on the next decision. In the
development run a fruit bat bit it nine times without a single blow in reply, the
warning fired, and three seconds later it took the stairs. Nine low-hitpoint
episodes in the artifact run produced one death and eight survivals.

And it rests to recover, which is what the seam wired to a constant `true` had
been preventing. After that fruit-bat retreat it arrived in town at 6 of 11 hit
points, stood on the down staircase, and was at 10 of 11 four seconds later.

### The one thing it does not do, and what that costs

It never enters a shop. Both runs revealed the whole town, all eight shop
entrances included, and walked past every one of them. Gold only ever went UP
(204 to 314 in one character, from finds), so nothing was bought - which is item
5 below, exactly as written: `shop-buy`, `shop-sell` and `shop-exit` have no
handler in the engine's command registry, so the ported store ladder's decisions
are inert.

That is now the largest single thing standing between this Borg and a deeper run.
It fights with birth gear, has no cure potions and no armour to buy, so it dies at
character level one and cycles between the town and 50 feet. The town-and-L1
shuttle itself is faithful rather than a stall - `borg-think-dungeon.c:984` forces
`stair_less` while `ready_morgoth == 0`, and a level-one character is scared off a
level by almost any monster on it (`borg-flow-kill.c:2727` onward) - but upstream's
borg breaks out of that cycle by shopping, and this one cannot.

### The two symptoms that came back from a real game, 2026-08-21

Reported after the three stalls above were fixed, from watching a released build:
"it's just sitting there or moving frantically back and forth across three cells,
doing nothing until something comes up and picks a fight. It just died to a
squint-eyed rogue in the town." Two symptoms, and they turned out to have
different causes.

**4. The jitter had TWO causes, and only one of them was already fixed.** The
last clause of the report is the diagnosis: a Borg with nothing in sight has no
reason to hold position, so a monster-free stretch confined to a handful of
squares is a decision loop.

The first cause is the two-square oscillation named in stall 2 - flow to the
staircase, run out of flow, step off, get pulled back - and the version being
watched was 0.6.3, which predates that fix.

The second only became visible once the Borg could see its own pack (see symptom
5), and it is a phantom monster. `borg_follow_kill` was not ported, so a tracked
record for a monster that had died out of sight or walked away survived the full
2000-turn expiry, and `borg_flow_kill` kept routing the Borg to it: walk to the
phantom, arrive, find nothing, let the explore rung step back, repeat. The trace
that named it is unambiguous - goal type 1 (kill) at one square alternating with
goal type 4 (explore) at the next, sixty times, at full hit points, with nothing
visible.

Measured after both: over four seeds and 2000 decisions each, the number of
sixty-decision monster-free stretches confined to three squares at full hit points
went from 403 to zero, and the ground covered went from 398 squares to 753 on the
seed that had been worst. `src/play.test.ts` asserts the tightest such stretch
stays above three squares, counting only decisions that were not spent resting -
the engine has no "rest until done" command, so a character healing up legitimately
stands still for sixty decisions.

**5. The town death is separate, and it was a whole missing feedback path.** The
Borg was not making a bad call on good information; it had no information. The
headless runs show the shape: hundreds of `rest` commands interleaved with
"Something touches you." and a low-hitpoint warning, ending in "You die." Nothing
was visible, so the danger evaluator saw no threat, and the only mechanism
upstream has for an attacker it cannot see - regional fear - had no producer in
this port. Six facts came out of it, each one a value the ported decision code
reads that nothing ever wrote:

- the two fear caches, their updaters and their readers all existed, with nothing
  in between;
- the seam carrying "is it safe to rest here" was wired to the constant `true`,
  so `borg_check_rest` was unreachable from the only ladder that rests;
- `borg_check_rest` was itself missing six arms, both fear tests among them;
- nothing decremented any of the durations the Borg tracks, so each latched on
  first use, and `borg_game_ratio` was a placeholder off by a hundredfold;
- the sval identity table defaulted to empty and no caller passed one, so the
  self-model counted no food, no cures, no phase doors and no fuel on a full pack;
- `ranged_attack`, `goal.recalling` and `escapes` were each read by several
  subsystems and written by none, and `BORG_LIGHT` - "my own torch reaches this
  grid" - was read by three subsystems and set by none, because
  `borg_update_light` was not ported either.

All of them are closed; `src/rest.test.ts` pins the path end to end, and
`src/play.test.ts` asserts the Borg never chooses to rest with a monster adjacent.

**6. Three more came out of a second reading of the same two symptoms, and the
third one is the other half of the town death.** These are a different shape from
the five above: not a value nobody wrote, but a value written wrongly, an argument
read from the wrong square, and a block of upstream that was never ported at all.
They were found by reading the C beside the port rather than by another run, which
is the instrument the shape below says a harness cannot replace.

- The controller reseeded the Borg's private generator to a constant at the top
  of every think, so the Nth draw of every decision was the same number forever:
  tie-breaks frozen, low-probability branches stuck on or stuck off. Upstream
  saves the ADVANCED seed back after each think (`borg.c:504`) and seeds once at
  start-up (`borg-init.c:487-488`). The stream now carries. `src/play.test.ts`
  had also given all four of its runs the same Borg seed, so the suite could not
  have caught a regression in anything the Borg's own rolls decide; the seed now
  varies with the run.
- `borg_escape` was being handed the smallest danger among the surrounding
  squares. Its parameter is named `b_q`, but it has one caller and that caller
  passes the danger of the square the Borg occupies (`borg-caution.c:1653`).
  Every gate inside is "is this above X", so the wrong value could only suppress
  an escape: a character standing somewhere dangerous with a safe square beside
  it read the safe square's number and stayed.
- *** Back away *** (`borg-caution.c:1664-1846`) was not ported, and it is the
  whole of the Borg's short-range tactical retreat. Nothing else in the ladder
  does it, so caution found no escape item, returned nothing, and the next rung
  attacked. A first-level character with a monster beside it had exactly one
  move available and made it every time. That is the town death from the other
  direction: symptom 5 was the Borg not knowing it was under attack, and this is
  the Borg knowing and having nowhere to put that knowledge.

### Four more from watching it play, 2026-08-22

Reported after the three above were fixed: "Base delay seems low. Movement was
not swift like upstream. A level-1 character did not seem interested in picking
up ammo that could be sold. Did not seem to think to use the rest function,
instead passing time one turn at a time in town to heal. Still dies earlier than
one would expect. Seems extremely reluctant to go more than a few turns in the
dungeon before going back, even with no apparent dangers around. Also ignored a
bow and a scroll on the ground."

Four complaints, and they resolve into two real defects, one engine gap, and one
thing that is not a defect at all.

**7. "Not interested in any loot" was exactly right, and it was two faults.**
Every floor-object rung reads an estimated value, `borg_new_take`'s valuation
was never ported, and the field it writes started at zero - so every object
scored worthless. Gold hid it, because the engine collects gold on the step
regardless. And nothing would have picked anything up even once the valuation
worked, because upstream collects by turning on `pickup_always` rather than by
pressing a key. Both are fixed; see the changelog for the shape, including why
the pickup only fires on arrival and how the Borg now remembers what it threw
away in place of upstream's "borg ignore" inscription.

**8. "Extremely reluctant to go more than a few turns in the dungeon" was four
faults stacked, and none of them was `borg_restock`.** Checked first, because it
is the obvious suspect: on depth 1 the only condition upstream can reach is
"light radius below 1", and light has a real producer, so restock is innocent
for a fresh character. What was actually happening: `borg_must_return_to_town`
had lost both of its guards, so the highest-priority "go home" rung could fire
on the first think after arriving; the location tracks were never wiped on a
level change, so the short-leash rung measured against the previous level's
staircases and latched "return to the stairs" immediately; the flag it latched
could not clear on a level with no known staircase; and the per-level clock
never restarted, so every absolute timing test in the ladder was measuring the
whole session. All four are fixed.

Worth stating for the record: a character at level one genuinely does stay only
about fifty borg turns on a level before considering the stairs
(`borg-think-dungeon-util.c:571`, `clevel * 50`). That part reads as impatience
and is upstream's own number.

**9. "Did not seem to use the rest function" was real, was measurable, and the
engine side has landed in neo-angband's tree, not yet in a release.** Upstream
rests in blocks - `R` then 100, or `*` for "until healed", or `&` while waiting
for recall - at fourteen call sites. The frozen action surface had one `rest()`
taking no arguments, and the engine mapped it to a single-turn hold, so the
Borg necessarily passed time one turn at a time. That was not cosmetic: five
consecutive turns of a real rest DOUBLE hit-point and mana regeneration
(`player-util.c:459`, gated on `REST_REQUIRED_FOR_REGEN`), and a hold never
started a rest, so this Borg healed at half the rate upstream's does.

The engine now has the seam this needed: `rest(count?: number)` on the agent
action surface, backed by a real multi-turn `restAction` (self-continuing on
the internal command queue exactly like a run, so a caller is not asked for
another command until the rest ends) plus the three `REST_` conditional-stop
modes. `src/core-api.ts` binds `REST_COMPLETE` alongside the other engine
symbols, and the seven `ctx.act.rest()` call sites across `item/recover.ts`,
`think-ladder.ts` and `flow/flow-misc.ts` now pass it explicitly ("rest as
needed"); the one call that wanted exactly one tactical turn
(`fight/attack.ts`'s `auxRest`) moved to `ctx.act.hold()` instead, because
`rest(1)` means "repeat the last rest" upstream, not "one turn"
(`cmd-cave.c:1638-1643`).

**The released half landed 2026-08-22.** Neo Angband 0.27.0 published the fix,
`manifest.json`'s floor moved to `>=0.27.0`, and the full suite (239 tests) and
the `src/play.test.ts` health harness (6 tests) both pass against the real
published package rather than a local build - `npm install` pulled it from the
registry, not a workspace link. A fixed-point unit test already proves the x2
regen bonus applies after five turns of the new `restAction`.

**Confirmed against the real engine, 2026-08-22, and issue #3 is closed.**
`src/rest-and-store-verification.test.ts` starts a level-one character in a
safe town below max HP - the ordinary post-fight state, nothing else about it
scripted - and drives the Borg's own ladder. Seven of ten seeds chose an
extended rest, every one of them `REST_COMPLETE`, with a single command
producing 390 to 480 game turns rather than the ten a normal move costs -
direct proof the multi-turn continuation fired rather than a single-turn hold.
The other three seeds happened to spawn standing on the town's staircase, and
`borgCaution`'s own "take the stairs I am standing on" rung outranks recovery -
a different, correctly-functioning decision, not a failure to rest.

**10. "Base delay seems low, movement was not swift" is not a defect, and the
numbers are worth writing down.** The host drives a mod autoplayer on a fixed
120 ms timer, hard-coded, one decision per tick. Upstream deliberately PAUSES
the borg so a human can watch: `borg_think_dungeon` waits
`delay_factor^2 + borg_delay_factor^2` milliseconds every think
(`borg-think-dungeon.c:1161,1237`), and the shipped `delay_factor` is 40
(`option.c:160`), which is 1600 ms. So this Borg already runs about thirteen
times faster than upstream's default, and the only thing upstream offers that
this does not is a control to make it SLOWER. What is genuinely missing is a
player-visible speed control, which is the game's to add and is already recorded
in its own PLANNED.md.

One thing that looked like a defect and is not: the light modifier on a worn
item is added twice (`trait.ts:325` and `:329`). Upstream adds it twice too
(`borg-trait.c:1518` and `:1533`). Core keeps the wart.

**The shape all of these share is worth naming, because it is the fourth time
this repository has met it.** Not one was a mistake in the ported arithmetic. Each
was a value the ported decision code READS and nothing in the mod ever WROTE, and
every one of them looks, from the outside, exactly like a Borg that is simply bad
at Angband. A unit test cannot see any of them, because each individual decision
is correct given the state it was handed. The instrument that finds them is a
harness that plays, and the question to ask of any remaining seam is not "is it
implemented" but "who writes it".

### What is still not ported, named rather than left to be rediscovered

- **`PF_COMBAT_REGEN`.** One arm of `borg_check_rest` asks a player-class flag
  that `PlayerView` does not carry, so this needs an engine seam rather than
  wiring. Tracked as neo-angband#34.

## Progress

| Date | What landed |
|---|---|
| 2026-08-21 | **Step 1 done.** The host gained `ctx.registries` (the whole bound `CoreRegistries`, latched once at boot in `main.ts` and reaching every plugin context). `plugin.ts` now calls `createBorg({ resolvers: makeCoreResolvers({ races }) })`, so `makeCoreResolvers` has a caller for the first time. Borg has danger vision, including over monsters a mod added. Three tests assert the wiring rather than the dispatch, one of them against the built `plugin.js`. |
| 2026-08-21 | **Step 2, three of four seams done.** `makeCoreResolvers` now also takes `objects` (`ctx.registries.objects`) and `state` (`ctx.state`), each independently optional. Activation identity walks an equipped `ItemView` back through its ego/artifact/kind to the `Activation` record that grants it (mirroring `obj-make.c`'s own artifact-then-ego-then-kind precedence) and compares `act_<name lowercased>` against the token the ported trait/item code already passes. The in-shop signal reads `state.chunk.feature(state.actor.grid).shopnum` directly - no new host plumbing needed, because `Chunk` already carries the bound `FeatureRegistry` it was built with. Both are covered on the same terms as danger vision: a mod's ego, artifact or store entrance is resolved by the same lookup, not a vanilla-only table. The fourth seam (swap/buy/sell power) is NOT wired; see the entry below it. |
| 2026-08-21 | **Step 2 complete: all four seams wired.** The fourth needed an engine capability rather than host plumbing, and it landed with Neo Angband 0.25.0 as `AgentView.simulateLoadout`: the engine's own `calc_bonuses` over a hypothetical set of worn objects, with nothing in the live game written. `src/trait/simulate.ts` runs the ported `borg_notice` and `borg_power` over the loadout it describes, which is the wield / recompute / revert shape upstream uses, against a scratch copy of the self-model so a ladder can score a dozen candidates without disturbing the Borg's view of itself. `think-session.ts` fans that one seam out into the five questions the ported subsystems ask (`wearEval`, `buyShopEval`, `buyHomeEval`, `sellEval`, `sellHomeBadEval`); the two swap valuations are unreachable rather than pending, because this port has no swap subsystem and both contribute zero to `borg_power`. It landed behind a probe on `ctx.core.simulateLoadout`, so an older game degraded instead of throwing; the probe came out again the same day, when the engine range was pinned (see Releasing this). |
| 2026-08-21 | **Step 3 done: the restart loop.** Not one line of it is in this repository, and that is the finding rather than an accident of scheduling - `AgentCommand` is `PlayerCommand`, so there is no value a controller could return that means "roll me a new character", and the death handler lives in the host's game loop. Neo Angband 0.25.0 gained `StartedGame.reincarnate` (upstream's `reincarnate_borg`, over this port's own `generatePlayer` / `outfitPlayer` rather than a second copy of the birth pipeline) and the host's `LOOP_STATUS.DEAD` branch calls it, ahead of every step of the human death flow, whenever a mod holds the keyboard. The gate is the one autoplayer slot the host already had, so there is no second toggle and no mod id written into the engine. `NOSCORE_BORG` is set at upstream's own activation gate and again on each respawn. |

| 2026-08-22 | **Four more from a second field report, described as symptoms 7 to 10 above.** Floor objects were never priced and never picked up, which is the whole of "not interested in any loot"; `borg_must_return_to_town` had lost both of its guards; the location tracks survived a level change so the short-leash rung measured against the previous level's staircases; and the per-level clock never restarted, which among other things stopped the Borg deciding at all after thirty thousand decisions. Two things were checked and found faithful rather than fixed: the doubled light modifier, and the decision rate, which is already thirteen times upstream's default. One is named as the next ENGINE seam this mod needs: an agent-visible rest that takes a turn count, without which the Borg regenerates at half upstream's rate. |
| 2026-08-22 | **Three defects from a read-the-C-beside-the-port pass, described as symptom 6 above.** Borg's private RNG was restarted every think instead of carried, so every draw at a fixed point in the decision was a constant; `borg_escape` was handed the least-dangerous neighbouring square's danger instead of the danger of the square the Borg stands on, which can only suppress an escape; and `borg_caution`'s *** Back away *** block was not ported, leaving no tactical retreat at all between "use an escape item" and "attack". All three are fixed, with `src/fight/fight.test.ts` covering the retreat and its refusals, `src/foundation.test.ts` covering the stream advancing while staying replayable from a seed, and `src/play.test.ts` now varying the Borg's seed with the run so the harness can see this class of bug at all. |
| 2026-08-21 | **Step 4 started, and found the defect the whole file predicts.** 0.6.1 installed from its tag into the released 0.25.0 desktop build, enabled, keyboard handed over - and it threw on the first perceived turn, because the manifest declared `command:add` and nothing else while the frozen view is gated per read DOMAIN. It had logged success first: `the Borg has the keyboard, and danger vision over 624 races, activation identity, the in-shop signal and loadout evaluation`. Fixed in 0.6.2 by declaring the nine domains the port reads, with a test that derives the set from the source instead of restating it. This is the same shape as everything above - a seam that looked wired from every angle except the one that plays a turn - and it is exactly what a green suite could not see. |
| 2026-08-21 | **The rest engine seam named in symptom 9 has landed in neo-angband's tree.** `rest(count?: number)` on the agent action surface now reaches a real multi-turn `restAction`, self-continuing on the internal command queue exactly like a run, plus the three `REST_` conditional-stop modes. `src/core-api.ts` binds `REST_COMPLETE` alongside the other five engine symbols; the seven recovery-ladder `ctx.act.rest()` call sites now pass it explicitly, and the one tactical one-turn wait (`fight/attack.ts`'s `auxRest`) moved to `ctx.act.hold()`, since a rest count of exactly 1 means "repeat the last rest" upstream, not "one turn". The change degrades to today's single-turn hold on an engine without the fix, so it needed no `manifest.json` floor bump - but the healing-rate benefit itself, and this repository's own tests against a real engine, both wait on a release. |

| 2026-08-22 | **Borg can be told how to play, for the first time.** Eight of upstream's `borg.txt` settings are toggles in the mod manager, and `createBorg` installs them where the ported decision code reads them. `BorgCfg` had existed since the self-model landed with no caller, so a stock default was the only value any of the twenty-odd reading call sites had ever seen. One of those defaults was also wrong: `borg_self_scum` ships enabled upstream and was disabled at both of this port's call sites, so a stock Borg never saved up for anything. Three of upstream's booleans were held back rather than shipped as switches that tick and change nothing; step 6 says which and why. |
| 2026-08-24 | **`when_last_kill_mult` is ported (neo-angband#36).** `BorgKills.delete` - the port's `borg_delete_kill` - now stamps `self.whenLastKillMult` whenever it clears a record cached as MULTIPLY, matching upstream's single point of truth rather than special-casing the kill path; the cache (`BorgKill.isMultiplier`) is filled the same way `rIdx` is, from the last tick the monster was visible, so a record deleted out of sight is still recognised. `borg_check_rest` refuses to rest for the four turns the guard covers and clears the stamp once the window passes, exactly as `borg-flow-misc.c:1223-1240` does. Also corrected a stale comment on the same function: its per-monster race-flag tests (NEVER_MOVE/MULTIPLY/PASS_WALL/KILL_WALL) were already ported via `FlowHooks.monsterHasFlag`, contrary to what the file's own header claimed. |
| 2026-08-24 | **The buff message table is ported (neo-angband#32).** `perceive-messages.ts` now recognises the twenty-two on/off messages `borg-messages.c:772-1025` uses to track protection from evil, haste, bless, fastcast, hero, berserk, the five elemental resists and shield/stoneskin - upstream's PRIMARY bookkeeping for these flags, and previously entirely absent, so every one of `world.self.temp`'s buff booleans stayed false forever and the buff-aware defensive maneuvers in `fight/defend.ts` never recognised an active buff. The direct `player->timed[]` cross-check named in the issue (`borg-trait.c:3010`) was left unported at the time, because `PlayerStatusView` exposed only the eight afflictions and there was no engine data to cross-check against from inside this mod; it landed on 2026-08-28, in the row below. |
| 2026-08-26 | **The detection scheduler is ported (neo-angband#40).** `world/panel.ts` adds the panel concept the port previously had none of: a fixed 3x3 division of the 198x66 dungeon (matching the reference borg's own default 80x24-terminal panel size, `borg-cave-util.c`'s `borg_panel_wid`/`hgt` at their usual runtime value) and `BorgDetectGrid`, a faithful port of the five `borg_detect_wall/trap/door/evil/obj` arrays with their 2x2 quadrant marking and query semantics (`borg-update.c:82-86,1359-1458`). `item/light.ts`'s new `borgCheckLight` is the scheduler itself (`borg-light.c:250-539`): the seven-branch priority ladder (traps+doors+evil combo, evil alone, traps+doors combo, traps alone, doors alone, walls alone, objects alone), each gated by its own upstream cooldown, casting Find Traps/Doors/Stairs, Detect Evil, Magic Mapping or Detect Objects and marking the panel swept on success, falling through to the already-ported `borgCheckLightOnly` as its last step. Wired into the think ladder in place of the old direct `borgCheckLightOnly` call (`:1631`, which upstream actually spends on the full `borg_check_light`). Two upstream warts are preserved rather than fixed: the new-level reset never clears the `obj` array (`borg-update.c:2094-2104`), and the traps+doors+evil combo stamps the `obj` timestamp without marking the `obj` array (`borg-update.c:1416-1432` vs `light.c:404`). |
| 2026-08-28 | **The buff-timer safety net is ported, closing neo-angband#32.** `trait/buff-timers.ts` is `borg-trait.c:3010-3037`: the redundant half of the bookkeeping, reading the player's real timers off `PlayerStatusView` (Agent API 1.4.0, which `manifest.json`'s `>=1.1.0` engine floor already guarantees) and reconciling them against the flags `perceive-messages.ts` derived from the message stream. `borgNoticePlayer` calls it, which puts it ahead of the message pass exactly as upstream does (`borg_notice` before `borg_update`, `borg-think.c:414-419`) and inside the same decision that later reads the flags, so a buff the engine reports as expired is corrected in time for the same turn's recast. Upstream's two assignment shapes are preserved rather than unified: protection from evil and haste are raised by the timer and never lowered by it, while the five temporary resists, bless, shield/stoneskin, fastcast, hero and berserk are assigned from it, and that second group is the net proper. Regeneration, venom, smite evil, see-invisible and word of recall have no timer on the view and stay message-only. The cross-check is skipped whole on a view that reports no timers at all, because "nothing to reconcile against" is not "every buff is off". `trait/simulate.ts`'s shadow world now owns its own `temp`, since a scoring pass that runs `borgNotice` must not write the live flags. |

## Releasing this

**0.4.0 IS TAGGED, released with Neo Angband 0.23.0 (2026-08-20).** It was held
back for a few hours first, and the reason is worth keeping: the game installs a
mod from a TAG and a tag must never be moved, so tagging is the release event and
the version field is not. Danger vision needs a host that supplies
`ctx.registries`, and until 0.23.0 shipped, no released game had it - a tag before
that would have pinned a digest on a change inert on every game a player could
actually be running.

**The engine range is `>=0.26.0` as of 0.7.0, and 0.6.1 is where it stopped being
permissive.** The move from 0.25.0 to 0.26.0 is the two fixes that live in the
game: `CellView.trap` narrowed to `square_isdisarmabletrap`, so a locked door is
no longer offered as something to disarm, and the host answering a blocking
prompt on an autoplayer's behalf. A Borg without either wedges on the first
locked door or on the first `-more-`, which is not a reduced Borg.

The paragraph below is about the earlier move, from `>=0.12.0`, and the argument
is the same one.
Up to 0.6.0 it was `>=0.12.0` and the mod degraded: on an older host
`ctx.registries` was absent, `createBorg()` took its conservative defaults, and
the plugin said "playing blind" in its own log. That was written down as a
deliberate difference from how neo-linoleum 0.15.0 handled the same dependency,
on the grounds that a mod which can still do most of its job should not refuse to
load.

**The reversal, and the reasoning that changed.** That argument assumed a
partially-working Borg was worth protecting. It was not, and the evidence is this
file: until 2026-08-21 the shipped mod had no danger vision, never shopped, never
used an activation, could not evaluate a swap and never started a new character
when it died. On no engine version, ever, had it been an autoplayer. So there was
no installed base of "the Borg working acceptably on an older game" for a hard
floor to break, and the permissive range was protecting an experience that did
not exist.

What the floor buys is that the two things the word "Borg" means are no longer
conditional. The restart-on-death loop and `AgentView.simulateLoadout` both
arrived in 0.25.0; without the first it plays one character and stops, and
without the second it wears nothing it finds. A refusal names the problem and
tells a player to update the game. A degraded load produces a Borg that walks
around losing, which is indistinguishable from a Borg that is simply bad at
Angband - the exact confusion this whole file was opened to end.

The comparison with neo-linoleum now goes the other way: both refuse, for the
same reason, and the difference is that neo-linoleum's floor was obvious from the
start because its fill visibly does nothing without the seam.

## The work, in order

### 1. A route from the plugin to the bound registries - DONE 2026-08-21

`makeCoreResolvers` needs `readonly MonsterRace[]`, the whole registry indexed by
`ridx`, because `FactsResolver` is `(ctx, killIndex) => MonsterFacts` and resolves
a race the Borg is tracking rather than one it is looking at.

The host's `ModPluginContext` (`packages/web/src/mod-plugin.ts`) carries `id`,
`api`, `engine`, `flags`, `core`, `state`, `assetUrl` and `data`. `controller()`
runs after `register()` and after boot, so the game is live by then - but
`GameState` carries the LIVE monsters (`state.monsters`, each with its own
`.race`), not the registry. A monster the Borg has not met has no entry there, so
walking the level is not a substitute.

So this is a host change first: give `ModPluginContext` the bound registries, or a
narrower accessor for the race registry. That decision belongs in the game
repository and it is the gate on everything below.

**Resolved: the whole `CoreRegistries`, not a narrower accessor.** Two mods wanted
this within a day of each other and wanted different halves - the Borg wants races
by `ridx`, a tile pack wants races and object kinds with their `base`/`tval` and
provenance - so a curated slice was already two fields behind before it was
written. That is the same argument `ctx.core` settled (MOD_COMPATIBILITY.md
decision 18: a curated list is the thing that drifts).

It is a LATCH (`setModRegistries`, called once from `main.ts`) rather than an
argument threaded through the seven places that build a context. A new call site
that forgot to pass it would hand its mod `registries: undefined`, which is a
legal state during content composition and therefore indistinguishable from a
call site that forgot - a mod reading no monsters and reporting nothing. A test
asserts `main.ts` actually makes the call, because every other test in this file's
history passed against a seam nothing filled.

### 2. Wire the four seams and say which are real - DONE 2026-08-21

Once the registries are reachable, `plugin.ts` becomes
`createBorg({ resolvers: makeCoreResolvers({ races }) })` - and then each of the
four has to be checked individually rather than assumed, because
`makeCoreResolvers` today wires the monster-race facts and leaves activation
identity and the in-shop signal on their conservative defaults, which its own
docstring says.

- **Monster facts** - **DONE 2026-08-21.** `makeCoreResolvers({ races })` is
  called from `plugin.ts` with `ctx.registries.monsters.races`. A mod's creature is
  covered by the same code path: binding runs after composition, so it is a
  `MonsterRace` at a real `ridx`, and the resolver never consults `from`. A test
  pins that, so that nobody adds a provenance check later.
- **Activation identity** - **DONE 2026-08-21.** `borg_equips_item(act, checkCharge)`
  and `borg_activate_item(act)` both resolve `act` (the port's `"act_<name>"`
  token, e.g. `"act_light"`) by walking an equipped item's `artifactName` /
  `egoName` / `tval`+`sval` back through `ctx.registries.objects` to the
  `Activation` record that grants it, mirroring `obj-make.c`'s own precedence
  (an artifact's or ego's activation overrides its base kind's). `ItemView` only
  exposes "has an activation" as a boolean, not which one, which is why this
  needed the registry rather than the frozen view alone.
- **In a shop** - **DONE 2026-08-21.** `Chunk` already carries the
  `FeatureRegistry` it was bound with, so `state.chunk.feature(state.actor.grid)
  .shopnum` (`square_shopnum`, cave-square.c:1512) needed no new host plumbing -
  `ctx.state` alone was enough once it existed. A mod-added store entrance is
  covered the same way, since `shopnum` is derived from the feature's `SHOP` flag
  at bind time regardless of which pack defined it.
- **Power of an unevaluated swap/buy/sell** - **DONE 2026-08-21**, and it was
  never a wiring problem like the other three. `borg_wear_stuff` /
  `borg_think_shop_buy_useful` / `borg_think_shop_sell_useless` all need
  `borg.power` for a HYPOTHETICAL loadout (an item worn, bought or sold that the
  Borg is not actually carrying), which means re-running `borg_notice` on gear
  the character does not have on. `borgNotice` (`src/trait/trait.ts`) takes
  values it cannot re-derive - net speed, AC-less skills, blows/shots - straight
  from the live `PlayerView`, which the engine computed for the REAL equipped
  loadout only, so there was no "what if I wore this instead" version of that
  view to read.

  The gap was in the game repository and is closed there: `simulateLoadout`
  (`packages/core/src/agent/loadout.ts`, Neo Angband 0.25.0) runs the engine's
  OWN `calc_bonuses` over a hypothetical equipment array and returns the
  `PlayerView`, the `ItemView`s and the whole derived-stat surface that loadout
  would produce, before / after / delta, without writing anything. It reuses the
  real derive rather than reimplementing it, which is what keeps it from drifting
  from the loadout the character is actually in - and a test asserts the
  simulated answer field-for-field against really equipping the item.

  This mod's half is `borgSimulatePower` (`src/trait/simulate.ts`): the ported
  `borg_notice` and `borg_power`, over that view, against a scratch copy of the
  self-model. Five of the seven questions the ported subsystems ask are wired
  from it; `weapon_swap_value` and `armour_swap_value` are unreachable, because
  this port has no swap subsystem and both contribute zero to `borg_power`.

  It shipped for one day behind a fourth `makeCoreResolvers` input, `loadout`,
  which carried a capability answer rather than a datum: `plugin.ts` probed
  `ctx.core.simulateLoadout` so an older game degraded instead of throwing. The
  input and the probe are gone in 0.6.1 along with the permissive engine range
  they existed for. The seam is installed unconditionally now, and the null it can
  still return belongs to a view with no live derive behind it rather than to an
  engine that cannot answer.

- **The attack-message table** - **DONE 2026-08-21**, and it is a fifth seam
  rather than one of the original four, because nothing had noticed the Borg
  could not tell it was being hit. `borg_init_hit_by_messages`
  (`borg-messages.c:1595`) builds `suffix_hit_by` from every blow method's action
  message at start-up; `makeCoreResolvers` now reads the same records from
  `ctx.registries.monsters.blowMethods`. Without it an attack the Borg cannot
  attribute raises no regional fear, and regional fear is upstream's whole answer
  to an attacker it cannot see.

**Mod items and creatures must work with the Borg the same as vanilla ones**
(a hard requirement). Reading the registry rather than shipping a
table is what makes that free, and it is the standard every remaining seam is held
to: an activation table keyed by core's svals, or a shop check that knows only
core's store list, would each reintroduce the inert-default bug restricted to
modded content, where it is much harder to notice.

### 3. The restart loop - DONE 2026-08-21

**Landed in Neo Angband 0.25.0 as `StartedGame.reincarnate`, called from the game
loop's `LOOP_STATUS.DEAD` branch. Nothing in this repository changed.** The spec
below was read off `borg-reincarnate.c` before any of it was built and is kept as
written; what it got right and what it got wrong are both worth having.

What it got right: the shape. An in-session reincarnation, the live player wiped
and regenerated in place, race and class rolled, a one-way mark on the character.

What it got wrong, and the correction is upstream's own code: the saved-off dungeon
is NOT what the reincarnated character wakes up on. `reincarnate_borg` restores
`cave` so nothing downstream of the wipe holds a null pointer, and in the same
breath sets `player->depth = 0` and `player->upkeep->generate_level = true` - which
`run_game_loop` (`game-world.c:1168`) consumes on its next pass by generating the
level at depth 0. So the character starts in a freshly generated TOWN, which is
also the only sane place to put a level-1 character whose predecessor died on
dungeon level 30. The port saves and restores the level for the same reason
upstream does and then asks for the town, which is one call to the level changer it
already had.

Three other corrections, recorded because each was a guess in the text below:

- **`NOSCORE_BORG` already existed here**, at upstream's value, in the
  score-invalidating mask, persisted in the savefile and read at death to print
  "Score not registered for borgs." Nothing had ever SET it. So the work was not
  "find or add an equivalent" - it was filling an inert seam of exactly the shape
  this file's own header describes.
- **The mark rides the ACTIVATION, not only the respawn.** Upstream sets it in
  `do_cmd_try_borg` (`cmd-misc.c:140`) when the borg is switched on, and again at
  the tail of `reincarnate_borg` because `player_generate` zeroes the field. Both
  are needed: without the first, the character that was already alive when the mod
  took over is never marked; without the second, only the first respawn is.
- **Two of upstream's steps are deliberately skipped**: the `seed_flavor` reseed
  and the `seed_randart` reroll. This port's savefile re-derives the flavour
  assignment and the randart set FROM those seeds, so moving either mid-session
  makes the save describe a world the game is not in. The flavour KNOWLEDGE is
  reset instead, which is the half a player can observe.

The original spec follows.

A death has to start a new character. This is what turns the mod into the thing
that was asked for on r/angband: something that plays itself over and over,
fullscreen, as a screensaver. **No deviation from upstream's own behaviour is
wanted here** - reference `src/borg/borg-reincarnate.c` is the exact spec, not
just prior art:

- **It is a reincarnation, not a new save.** Upstream never exits to a menu or
  writes a new savefile. `reincarnate_borg()` wipes the live `player` struct in
  place (`player_init`, then `player_generate` with a freshly rolled race and
  class), keeps the same session, restores the dungeon it saved off first, and
  carries straight on. The host-level gap this mod hit (`AgentCommand` has no
  birth-flow command, and death handling lives entirely in `main.ts`'s game
  loop) is real, but the fix is an in-session reincarnation hook, not a
  restart-the-process or a fresh-save design.
- **Race and class are RANDOM by default, matching `borg_cfg[BORG_RESPAWN_RACE
  /_CLASS] == -1`.** Upstream only pins a fixed race/class when its own config
  sets one. A stacked mod (with a dependency on this one) is the right place to
  add a pinned-race/class option later - this mod's own default follows
  upstream's own default, which is a reroll, not a repeat.
- **The character is marked, the same way upstream marks it.** `reincarnate_borg`
  sets `NOSCORE_BORG` on the player so a borg-touched character can never read as
  a legitimate high-score run. Whatever this port's equivalent of that flag is
  (or a new one, if none exists yet) needs the same one-way, can't-be-cleared
  property, so a save that has run the Borg is never mistaken for a save that
  earned its result unattended.
- Everything else upstream does around the reroll (starting gold, starting
  gear via `borg_outfit_player`, HP rolled within the class's min/max range via
  `borg_roll_hp`, a random name) is scenery for a screensaver and does not need
  a byte-for-byte port - the three bullets above are the ones that decide
  whether this looks like "Core + Borg indistinguishable from the original game
  running its own borg," which is the bar for this item.

### 4. Watch it, several times, and write down what happened - DONE 2026-08-22

Driven in the installed desktop build over CDP, because that is the only
instrument here that proves pixels and a running game rather than a populated data
structure. The main repository's `CLAUDE.md` has the procedure and the four traps.

**First attempt: the answer was no.** See "Watched playing" above for the two runs
and the three stalls, all three of which are now closed - and the FIXED notes there
say where each one lived.

**A third-party watching of the released build found two more**, recorded above as
symptoms 4 and 5: it paced with nothing in sight, and it stood still in town while
something it could not see killed it. Both are closed. That is worth noting here
rather than only above, because it is evidence about this item's own method: the
watching was somebody else's, it took minutes, and it found two defects a green
suite and a 1500-decision harness had both passed over. The harness could see them
once it was asked the right questions, which are now permanent assertions.

**Second attempt, 2026-08-22: the answer was yes.** Recorded in full under
"Watched playing, 2026-08-22" above, against two instruments - the development
Electron build and the packaged v0.26.0 release artifact - each on its own
isolated data directory. All six questions this item asks are answered there,
including the two that had never been reachable: it died, and it started again by
itself, four times across the two runs.

The headless instrument (`src/play.test.ts`) found and closed every stall, and it
could not have answered this item: it paints nothing and runs no shell, and the
prompt seam is entirely shell-side. The shell run is what showed 37 prompts
answered, locked doors picked one turn at a time, and a retreat to town followed
by a rest.

**And the mod cannot be tagged before the game's RELEASE is published**, which is
a later event than the version bump. Both game-side fixes are in Neo Angband
0.26.0 and `manifest.json` now declares `>=0.26.0`, but the game installs from a
release and a Borg tagged against a version nobody can download refuses to load
for everybody. Tag this repository once v0.26.0 has a published release with
artifacts. `src/play.test.ts` measures the engine on disk for the trap fix and
skips itself rather than failing when it is absent, so a red suite here always
means a fault here.

### 5. The store ladder has no engine to trade through - DONE 2026-08-22, found 2026-08-21

`src/store/` is ported and reachable: the in-shop resolver reports which shop the
Borg is standing in, and the ladder returns `shopBuy` / `shopSell` / `shopExit` on
the act facade. **Nothing in the engine's command registry handles those three
codes.** They are built by `agent/act.ts` and by the sandbox worker's mirror of it,
and that is every occurrence in the game's tree.

So the ladder's decisions are inert, and any shopping seen in a watched run has
another explanation - birth outfitting, or a human key while the screen was open.
That is why the 2026-08-21 runs above cannot credit the ladder for the gold that
was spent, however plausible it looked.

This is the game's to close, not this repository's: three command handlers, on the
same terms as every other verb. Until then a step onto a shop door has the screen
dismissed by the prompt seam, which keeps the run going and buys nothing.

**Watching it confirmed the cost, 2026-08-22.** Across two runs the Borg revealed
the whole town, all eight shop entrances included, walked past every one of them,
and never spent a coin - gold only ever rose, from finds. So it fights with birth
gear, carries no cure potions, and dies at character level one; the town-and-L1
cycle it then sits in is upstream's own behaviour, but upstream's borg leaves that
cycle by shopping. This is now the largest single thing between this Borg and a
deep run, and it is not fixable here.

**The released half landed 2026-08-22.** `shop-buy` / `shop-sell` / `shop-exit`
now resolve to real handlers (`packages/core/src/store/store-cmd.ts`,
`installStoreCommands`) that turn a stock index or a gear handle into a real
object, re-check the player is standing in the right store, and commit through
the same buy/sell path the interactive shop screen uses - verified in
neo-angband's own suite by a real `startGame` town, a queued command and
`runGameLoop`, both a free purchase and a paid sale. Neo Angband 0.27.0
published this, and `manifest.json`'s floor moved to `>=0.27.0`. The binding
was proven; whether the Borg's own store ladder ever issued those commands was
not.

**Confirmed against the real engine, 2026-08-22, and issue #4 is closed.**
`src/rest-and-store-verification.test.ts` places the Borg physically on a real
shop door - the game's own `state.stores[].feat`, not a synthetic terrain
write, because a synthetic door satisfies the Borg's in-shop resolver without
satisfying the engine's own `store_at` lookup the command handlers use, and the
two disagreeing was itself found by hand before this test existed. Across ten
seeds, every one sold something with a real inventory change (`shop-sell`,
handle and quantity chosen by the ladder itself), and three of ten also bought
something with gold actually decreasing (`shop-buy`, e.g. 5000 to 4998). This
game's own birth options default `birth_no_selling` to true, so a sale
correctly nets zero gold here - upstream's own "You had X" rather than "You
sold X for N gold" - which is why the buy result, not the sell result, is what
answers "does gold change hands". Reachability (walking to a shop through
town's own explore/leave-level ordering) is a separate, already-documented
shape - a fresh level-one character heads straight to the dungeon stairs before
the late "deal with shops" rung is ever reached, in every seed tried - and is
not what this issue asked.

### 6. The settings surface - SECOND SLICE DONE 2026-08-22 (neo-angband#30)

**Eight of upstream's settings are toggles in the mod manager, and the port reads
them for the first time.** `BorgCfg` and `defaultCfg()` had been in
`src/trait/config.ts` since the self-model landed; nothing had ever supplied one,
so every call site that reads a setting read a stock default. That is the same
shape as the resolver seams: present, correct, and fed a constant.

**The surface is a manifest `rule` per setting**, not `ctx.prefs` and not a
panel. The reasoning is in `plugin.ts`'s own header and reduces to three facts: a
rule is the only one of the host's three settings surfaces that is editable
today, it needs no capability on the consent screen a player reads before handing
over a character, and a changed rule re-composes the page - so a session can
never see a setting move under it, which is the lifetime `borg_cfg[]` has.

The values reach the decision code through a module-level active setting that
`resolveOpts` folds in, because upstream's `borg_cfg[]` is a file-scope array and
the ported call sites are the same shape. An explicit `opts.cfg` at a call still
wins per key, so the existing tests keep asking their own questions.

**A second pass audited all fifteen fields of `BorgCfg` against their real
readers, not just their presence in the type.** One more boolean shipped as a
toggle: `borg_munchkin_start` moves real gear valuation (`trait/power.ts`
suppresses the value of resist/speed potions, phase door, recall and deep cure
stockpiles below `borg_munchkin_level`), even though the stair-scum diving mode
it is named for is not ported. A setting that changes a real decision, honestly
described as only half of what upstream's flag does, clears the bar this project
holds toggles to; a setting that changes nothing does not, which is why the other
three below are still absent.

**Three of upstream's booleans remain held back, each for a different reason,
and none of them is "not yet gotten to":**

- `borg_kills_uniques` has no reader in this port at all. Upstream's own gate
  (`borg-prepared.c:625-644`) needs a live-unique census -
  `borg_numb_live_unique`, `borg_first_living_unique`, `borg_depth_hunted_unique`
  - rebuilt every level change by scanning the *entire* race table for uniques
  whose `max_num` has dropped to zero (`borg-update.c:2225-2300`, ~75 lines,
  including an off-screen-death cheat and a three-shallowest-depth sort). No
  seam here exposes a race's live/dead population count across a run; building
  one is a subsystem, not a settings toggle.
- `borg_uses_dynamic_calcs` switches the power/depth/restock math from this
  port's internal calculations to a formula language upstream parses out of
  `borg.txt`'s own `[BEGIN FORMULA SECTION]` (`borg-formulas.c`, several hundred
  lines: a line-oriented parser, a condition grammar and a value-type table
  covering ranges, traits, config, activations and every `tv_*`). That is a
  second calculation engine sitting behind the flag, not a flag on this one.
  Porting it is disproportionate to a settings audit and has not been attempted.
- `borg_uses_swaps` has a real reader (`borgUsesSwaps`, `store.ts:450`) that
  gates `borgThinkHomeBuySwapWeapon` / `borgThinkHomeBuySwapArmour`
  (`buy.ts:543-587`) - but both return `false` unconditionally whenever
  `weaponSwapEval` / `armourSwapEval` are absent, and `think-session.ts:400-405`
  says in its own comment that they are absent on purpose: "Unreachable until
  the swap subsystem is ported, not merely unwired." A swap also contributes
  zero to `borg_power` here. Flipping this toggle would tick in the mod manager
  and change nothing the Borg does, which is exactly the failure this file
  exists to name - so unlike `borg_munchkin_start`, it is not shipped.

**What is still open on neo-angband#30**, in the order it is worth doing:

- **The numeric settings have no shape to be a toggle, and this is now confirmed
  against the host's own schema rather than assumed.** `borg_no_deeper`,
  `borg_stop_dlevel`, `borg_stop_clevel`, `borg_enchant_limit`,
  `borg_munchkin_level`, `borg_money_scum_amount`. `PackRule`
  (`packages/mod-sdk/src/manifest.ts:98-111` in the game's own repository) has
  exactly four fields - `flag`, `title`, `description`, `default` - and
  `validateRules` (manifest.ts:727-729) throws unless `default` is a `boolean`.
  `ModPluginContext.flags` (`packages/web/src/mod-plugin.ts:204`) is
  `Readonly<Record<string, boolean>>` all the way through the resolution chain,
  with no numeric, string or enum-valued flag anywhere. There is no shortcut
  available from this side: a depth ceiling or an enchant limit needs a
  non-boolean rule type added to the host's manifest schema, which every mod
  would then get, or `ctx.ui.openPanel` plus a `registry:menu` transformer,
  which is this mod's alone and costs two capabilities on the consent screen.
  The first is the better answer and it is a game-side change this repository
  cannot make.
- **A pinned respawn race and class are not reachable from this side of the seam.**
  `ReincarnateOptions` already carries `raceName` and `className`, and
  `game.reincarnate` already honours them - but the caller is the host's own
  `LOOP_STATUS.DEAD` branch, which passes only the noscore mark and a rolled name.
  There is no value a controller can return that means "roll me a new character",
  which is the same wall step 3 hit, so the mod cannot reach this without the host
  asking it what it wants. Upstream's own default is a reroll
  (`borg_respawn_race` / `_class` are -1), so the port is faithful as it stands
  and this is a feature rather than a gap.
- **There is no stat-priority setting, and there is none upstream either.**
  `borg.txt` describes one in a comment block ("CON 16, secondary 17, primary 17,
  500,000 tries") and no setting backs it: `borg-reincarnate.c:527-531` fakes a
  command with `choice = 1` and calls `do_cmd_reset_stats`, which is the game's
  own default point-buy. The comment is stale upstream documentation. The five
  `borg_worships_*` weights are the real surface for "what should this character
  become", and they are shipped.

### 7. A faster autoplayer tick (10ms) - DONE, in the game, not this mod

**Opened 2026-08-22. The request: a 10ms option for how often the Borg takes a
turn, for watching it play at speed. Landed 2026-08-22 in Neo Angband 0.28.0.**

This mod had nothing to change, because it never owned the setting - the
*Autoplayer speed* row on the settings screen belongs to whichever mod
currently holds the one autoplayer slot (`packages/web/src/mods.ts`, keyed off
`deps.autoplayer.activeId() === m.id`), and Neo Angband 0.28.0 added a fourth
**Turbo** tier at 10ms alongside Fast/Normal/Slow across the three host sites
that declare the tier list (`mod-store.ts`'s `AutoplayerSpeed` type, the
`AUTOPLAYER_SPEED_MS` map duplicated in `main.ts` and `mods.ts`, and the
picker's tier array). `manifest.json`'s `engine: ">=0.27.0"` already covers
0.28.0, so a player on it sees Turbo with no change needed here.

## What is deliberately NOT here

Making the Borg WIN. The target is that it tries its best and gets as far as it
can, by the original's rules. Upstream's borg dies, and a port that dies the same
way for the same reasons is faithful; one that survives longer than upstream's
would is a different program wearing its name.
