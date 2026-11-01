# How the Borg runs on mod API 2

The Borg is a mod API 2 mod. Its manifest declares schema version 2, the API range `>=2.0.0 <3.0.0`, and Neo Angband `>=1.23.0-beta.1`, and `plugin.ts` exports an API 2 definition with `start`, `stop`, `armed`, and `controller`. There are no hooks, because the Borg changes no rule and adds no record.

Upstream's borg, and the port of it under `src/`, decides synchronously: it asks for the player, a grid, or the pack partway through a decision and uses the answer at once. API 2 answers every call with a promise. The code in `src/api2/` sits between the two. It reads the game before each decision, hands the decision code a synchronous view of that reading, and turns the chosen command into intents.

## Start and stop

`start` builds a new bridge (`src/api2/host.ts`). The bridge binds the engine's numeric code tables from `mod.engine.core` into `src/core-api.ts`: terrain, item classes, monster spells, monster flags, and the rest-as-needed sentinel. Then it reads the content records the decision code needs for the whole session (`src/api2/records.ts`): game constants, timed-effect grades, trap kinds, object kind costs, blow messages, and monster spell messages. Those records are composed content, so a monster or spell from another mod is read the same way as one of the game's. Last, the bridge subscribes to the `message` event. The Borg is then built, the title row registered, and two log lines written: whether the game granted the truth domain, and which settings differ from upstream's stock values.

A game that grants no engine domain gets a log line saying the Borg could not start, and the controller then does nothing. `stop` drops the message subscription, so a game that registers the mod again after a reload does not deliver every message twice.

## Who gets the keyboard

`armed` answers true only for a character the player handed over: one whose save Ctrl-Z marked with `NOSCORE_BORG`, or one created from the title screen's **New Borg character** row, which starts character creation with the controller armed. Installing or enabling the mod does neither. For any other character the game never calls the controller. The Ctrl-Z mark comes from the engine domain's state, because the known world does not include it.

## One tick

The game calls `controller` at each input wait, and `src/api2/controller.ts` handles it. If a prompt is waiting, the Borg answers it and stops there: it acknowledges, confirms, accepts the default for a quantity or text prompt, and cancels anything else. Outside the play and store phases it does nothing. Otherwise the bridge reads the world, the decision code returns one command, any target choices from that decision are submitted, and the command follows as a `command` intent under a freshly read input token.

The command builders the decision code calls, such as `walk`, `quaff`, and `shop-buy`, are built locally in `src/api2/act.ts` with the same codes and arguments the game's API 1 builders produced, so the ported decisions run as written.

The keyboard goes back to the player after 25 refused commands in a row, after 25 decisions in a row with no command, or after the same command is accepted 40 times in a row against an unchanged scene. The scene is the character's position, depth, hit points, spell points, experience, and gold, plus the monsters in view and their hit points. That last rule covers a command the game accepts that does nothing, such as opening a door the Borg's map still shows as closed after it was opened out of sight. No game turn passes, so the refusal and idle counts never move. At the sixth repeat, and every sixth one after it, the Borg also clears its own map's record of the grid the command aimed at, and the next decision treats that grid as unknown.

## The view the decision code reads

`src/api2/world.ts` reads `view.world()` once per decision and builds the view the port was written against. The known world carries less than the API 1 view did, and the gaps are filled with what the player can know. The map is the remembered map: a grid never seen is impassable, with no feature or trap, and a secret door shows as the granite the player sees. A grid glows only if the known level says so. A timed effect reads as the shortest duration in the grade the status line names, and food is the status line's percentage times 100. The game turn is part of the world only when the mod holds `state:turn.read`, so the manifest lists it. An item's timeout is its count of charging items, and a light's fuel comes from the known item.

Some questions come up partway through a decision, so `src/api2/caches.ts` keeps three caches to answer them. Race records are read once per race index and kept for the session. The activation of each worn item is read once per artifact name, ego name, or kind. Loadout simulations answer what the character would be with an item worn, removed, or bought.

A loadout simulation is never ready the first time the decision code asks for it. The cache answers with nothing, which the port reads as no improvement, and notes the question. Once the decision returns, the tick reads up to 48 noted questions together, rewinds the clocks and counters the decision moved so the Borg is not aged by the repeat, and runs the decision again with the answers. It repeats at most six times, and stops sooner when a round brings nothing new. The whole cache is dropped when the pack, the worn set, a store's stock, or the character level changes.

## The truth domain

The game gives the Borg its truth domain through one capability, `state:monsters-actual.read`. The consent screen tags it as powerful and keeps it off unless the player turns it on with "Choose one by one". The grant covers the exact monsters and the race records and nothing about the real map or a store's stock, which stay behind `state:map-actual.read`, a capability the Borg does not ask for.

`src/api2/truth.ts` lists the two reads the Borg makes with it and the reason for each. `truth.monsters()` is filtered to the monsters the character perceives and supplies their exact hit points, speed, and status, which the danger math and the flee thresholds are written in. A perceived monster the known world does not list has no id a target can use, so it is dropped. `truth.race(index)` supplies each perceived monster's race record (flags, spells, spell frequency, blows, and level), since monster recall fills in only through fighting and a first meeting would otherwise score as harmless.

The Borg never calls `truth.level()` or `truth.storeKnowledge()`, so it never sees the real map or a store's full stock (neostryder/neo-angband#415). `src/truth-allowlist.test.ts` parses every source file and fails on any other `truth` read, including one made through an alias, a destructuring, or a cast.

Without the grant the Borg plays from the known world alone. A monster's hit points are its health band applied to the race's average, and its flags and spells are the ones the character has learned.

## Messages, settings, and capabilities

Messages come in through the `message` event. The bridge holds them between decisions and passes them to the decision code once, at the next decision.

Each manifest toggle reaches the decision code as the setting it names, unchanged, and a toggle the game did not resolve stays at upstream's default. The buff-timer safety net reads `bugfix.borgFixes` from the mod's flags and stays on when that flag is missing.

The manifest lists 17 capabilities and no wildcard: `command:add`, `state:player.read`, `state:monsters.read`, `state:map.read`, `state:inventory.read`, `state:floor.read`, `state:stores.read`, `state:spells.read`, `state:turn.read`, `state:monsters-actual.read`, `state:interaction.read`, `input:intent`, `input:prompt.reply`, `event:message`, `ui:title`, `profiles:manage`, and `saves:manage`. Without `state:interaction.read` the game never calls the controller, and without the two input grants every intent and prompt answer is refused.

## Tests

`plugin.test.ts` drives the built `plugin.js` through `src/harness-api2.ts`, a fake game that answers every API 2 call from a scenario. It covers the export shape, which characters are offered the keyboard, settings, message cleanup on `stop`, and play with and without the truth domain. `src/api2/bridge.test.ts` and `src/api2/controller.test.ts` cover the caches, the loadout rounds, the release limits, and the stalled-command rule. The Borg's own random number generator is in `src/rng.ts`, and the foundation tests check its stream against Core's.
