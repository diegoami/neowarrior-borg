/**
 * Borg, as a mod's entry point.
 *
 * THE FORK: this repository is neowarrior-borg, a hard fork of
 * neostryder/neo-angband-mod-borg (imported at 1fa2f8d) whose purpose is a
 * warrior-only Borg: automated warrior birth, an unattended warrior restart
 * loop, and recorded runs. This file is upstream's except where a comment
 * says FORK; the port under src/ is upstream's except where a comment names
 * the C function a change belongs to.
 *
 * This file and title.ts are the mod's own code, and src/api2/ is the bridge
 * between the game's API and the port: everything else under src/ is the port,
 * carried over from the game's repository. This file's job is to satisfy the
 * mod API, read the game's content once, and take a decision at each input wait.
 * title.ts adds the title screen's "New Warrior Borg character" row, which
 * since T05 also arms the warrior birth through the raceChoice setting.
 *
 * ------------------------------------------------------------------
 * WHY BORG IS A MOD AT ALL
 * ------------------------------------------------------------------
 *
 * Upstream, the borg hooks the game at `inkey_hack`: when Angband asks for a
 * keypress, the borg perceives the world, decides, and returns keystrokes. That
 * is a privileged position inside the C. Here it is not privileged at all: it is
 * the mod API's `controller`, the same seam any agent mod uses. Borg is the most
 * demanding possible consumer of "read the whole game, drive every command", so
 * a faithful Borg that plays correctly IS the acceptance test that the surface
 * is complete.
 *
 * ------------------------------------------------------------------
 * WHAT THE BORG MAY SEE
 * ------------------------------------------------------------------
 *
 * An autoplayer plans from the known world: the remembered map, the monsters the
 * character perceives, the pack, the stores as the character last saw them
 * (neostryder/neo-angband#415). Every hidden read is named in
 * src/api2/truth.ts with its reason, and truth-allowlist.test.ts fails when
 * this mod calls any other. The real map is not read at all.
 *
 * ------------------------------------------------------------------
 * WHY bindCore RUNS FIRST
 * ------------------------------------------------------------------
 *
 * A plugin cannot `import` the engine: a bare specifier does not resolve in a
 * module fetched from a folder, and bundling core into plugin.js would give this
 * mod its own registries and singletons while the game ran on another set. The
 * host passes the engine in as `mod.engine.core` instead, and src/core-api.ts is
 * the one file that holds it - read that file's header for how, and for the
 * single rule it imposes on the rest of the port.
 *
 * ------------------------------------------------------------------
 * WHY THIS DECLARES NO HOOKS
 * ------------------------------------------------------------------
 *
 * Borg changes no rule, adds no record, and overrides no system. It plays
 * the game exactly as a player can, through commands the engine already accepts.
 * It adds only the title row, and only when the host grants the title and
 * profile seams (title.ts).
 */

import type { Api2ControllerContext, Api2InputState, Api2ModDefinition, Api2BirthPresenter, ModApi2 } from "@rpgm-tools/neo-angband-mod-sdk";
import type * as Core from "@rpgm-tools/neo-angband-core";
import { installMemory, registerBorgTitle } from "./title.js";
import { NOSCORE_BORG } from "./src/activate.js";
import { createBorg } from "./src/controller.js";
import { makeCoreResolvers } from "./src/resolvers.js";
import { defaultCfg, setBuffTimerSafetyNet, type BorgCfg } from "./src/trait/config.js";
import { createBridge, type Bridge } from "./src/api2/host.js";
import { createTick, type Tick } from "./src/api2/controller.js";
import { BORG_MARK, BORG_VIEW } from "./src/world/grid.js";
import { createWarriorBirthPresenter } from "./src/birth/presenter.js";
import { RACE_CHOICE_SETTING, resolveWarriorRace } from "./src/birth/settings.js";
import { installWarriorRestart, type WarriorRestart } from "./src/loop/restart.js";

/**
 * Whether this character has already handed the keyboard to an autoplayer.
 *
 * Enabling the mod and giving away the keyboard are different decisions. There
 * is no standing settings toggle for that any more: Ctrl-Z (the host's
 * do_cmd_try_borg) warns, confirms, marks NOSCORE_BORG on the save, and
 * reloads. This plugin then offers to play only when that permanent mark is
 * already set, so a virgin character stays under human control until Ctrl-Z,
 * and a character that has run the Borg before resumes with it at the wheel.
 * Offering to play from an unmarked save would reintroduce a boot-time confirm
 * every launch merely because the mod is enabled.
 *
 * The one other way in is the title row: a character started from the "New
 * Warrior Borg character" row arrives armed - and, since T05, born as the
 * planned warrior (title.ts sets the birth flag at its commit point) -
 * because choosing the row was already the player's consent for that
 * character.
 */
function characterAlreadyAutoplayed(context: Api2ControllerContext): boolean {
  const state = context.engine?.state as { readonly actor?: { readonly player?: { readonly noscore?: number } } } | undefined;
  return ((state?.actor?.player?.noscore ?? 0) & NOSCORE_BORG) !== 0;
}

/**
 * The settings a player can move, and the `borg_cfg[]` entry each one is.
 *
 * ------------------------------------------------------------------
 * WHY A MANIFEST RULE AND NOT A SETTINGS FILE
 * ------------------------------------------------------------------
 *
 * Upstream reads `borg.txt` out of the user directory at start-up. There is no
 * user directory here and no path a player could reach on a phone, so the
 * question is which of the host's own surfaces carries a setting. Three exist. A
 * manifest `rule` is a labelled toggle in the mod manager, resolved per mod and
 * handed to the plugin as `ctx.flags`. `ctx.prefs` is a JSON blob the host
 * stores and nothing edits. `ctx.ui.openPanel` is a real form, behind a
 * capability a player has to consent to and a panel the game has to be given a
 * way to open.
 *
 * Rules win for everything that is a yes or a no, which is most of upstream's
 * table: the toggle already exists, it needs no new permission on a screen a
 * player reads before configuring how the Borg plays, and changing one
 * re-composes the page - so a session never sees a setting move under it, which
 * is exactly the lifetime `borg_cfg[]` has. Handing over the keyboard itself is
 * Ctrl-Z in the host, not a rule.
 * The numeric settings (depth ceilings, the enchant limit, a pinned respawn race
 * or class) have no yes-or-no shape and are not here; PLANNED.md carries what
 * each of them still needs.
 *
 * ONLY SETTINGS THE PORT READS ARE LISTED. A toggle for something no ported line
 * consults is worse than an absent one: it reads as a feature, it survives every
 * test, and the only way to find out is to watch a Borg ignore it. Four of
 * upstream's settings are held back on exactly that ground, and each is a
 * different distance from working:
 *
 *   - `borg_kills_uniques` has no reader at all. Its branch needs the live-unique
 *     census (`borg_numb_live_unique`, `borg_depth_hunted_unique`), built upstream
 *     by scanning the whole race table for unique population counts
 *     (borg-update.c) - state this port does not keep.
 *   - `borg_uses_dynamic_calcs` switches the power/depth/restock math from the
 *     internal calculations to a formula language upstream parses out of
 *     `borg.txt`'s own FORMULA SECTION (borg-formulas.c). That is a second
 *     calculation engine, not a flag on this one, and porting it is its own
 *     project.
 *   - `borg_uses_swaps` has a reader (`borgUsesSwaps`, store.ts) that gates two
 *     store functions which return early regardless of its value, because the
 *     swap valuation seams (`weaponSwapEval`/`armourSwapEval`) are deliberately
 *     unwired - see think-session.ts. A swap also contributes zero to
 *     `borg_power` here, so the toggle would tick and the Borg would play
 *     identically either way.
 *   - The numeric settings (`borg_no_deeper`, `borg_munchkin_level`,
 *     `borg_enchant_limit`) have no yes-or-no shape, and the host's manifest rule
 *     schema (`PackRule` in `@rpgm-tools/neo-angband-mod-sdk`) carries only a
 *     boolean `default` - there is no numeric or range rule type to ask for one
 *     with. See PLANNED.md for what a host-side fix would need.
 *
 * `borg_munchkin_start` is NOT on this list any more: it moves real gear
 * valuation (`trait/power.ts`) even though the stair-scum diving mode it is
 * named for is not ported, and that is enough of a working setting to ship - the
 * manifest rule's own description says exactly which half it is.
 */
/**
 * The settings a rule can carry: the yes-or-no half of `BorgCfg`.
 *
 * Derived rather than listed, so wiring a rule to a numeric setting - a depth
 * ceiling, the enchant limit - is a compile error here rather than a toggle that
 * writes `true` into a field the decision code compares against a level.
 */
type BoolCfgKey = {
  [K in keyof BorgCfg]: BorgCfg[K] extends boolean ? K : never;
}[keyof BorgCfg];

const RULE_CFG: Readonly<Record<string, BoolCfgKey>> = {
  "borg.playsRisky": "playsRisky",
  "borg.worshipsDamage": "worshipsDamage",
  "borg.worshipsSpeed": "worshipsSpeed",
  "borg.worshipsHp": "worshipsHp",
  "borg.worshipsMana": "worshipsMana",
  "borg.worshipsAc": "worshipsAc",
  "borg.worshipsGold": "worshipsGold",
  "borg.selfScum": "selfScum",
  "borg.munchkinStart": "munchkinStart",
};

/**
 * Fold the resolved rule flags into a settings override.
 *
 * A flag the host did not resolve is left out rather than read as false. The
 * host resolves every rule this mod's own manifest declares, so a missing one
 * means the manifest and this table have drifted - and `selfScum` defaults to
 * ON, so reading absence as false would quietly switch off a setting upstream
 * ships enabled. src/manifest-tunables.test.ts is what stops the drift; this is
 * what stops it costing anything if it happens.
 */
function cfgFromFlags(
  flags: Readonly<Record<string, boolean>>,
): { [K in BoolCfgKey]?: boolean } {
  const cfg: { [K in BoolCfgKey]?: boolean } = {};
  for (const [flag, key] of Object.entries(RULE_CFG)) {
    const value = flags[flag];
    if (typeof value === "boolean") cfg[key] = value;
  }
  return cfg;
}

/**
 * The settings that are NOT on their stock value, for the log line.
 *
 * Named rather than counted, because the log of an unattended run is the only
 * record of what the Borg was told to do, and "3 settings changed" does not
 * explain a Borg that dived to depth twelve at character level four.
 */
function changedFrom(cfg: Partial<BorgCfg>): string[] {
  const stock = defaultCfg();
  return Object.entries(cfg)
    .filter(([key, value]) => stock[key as keyof BorgCfg] !== value)
    .map(([key, value]) => `${key}=${String(value)}`)
    .sort();
}

/** What one running mod holds: the bridge to the game and the decision tick. */
interface Running {
  readonly bridge: Bridge;
  readonly tick: Tick;
  /** FORK: T04 (#7) - the restart loop, so a stop can retire it with the bridge. */
  readonly restart: WarriorRestart;
}

/**
 * FORK: T03 (#6), T05 (#8) - the presenter under `ui:birth.replace` (already
 * declared in manifest.json) that births the planned warrior when the mod's
 * one-shot install-slot flag is set (by T04's restart loop and T05's title
 * row), and declines otherwise so the game shows its own screens: a human
 * creating a character is never hijacked. The engine's birth cost table is
 * read here the same way the bridge reads the engine (mod.engine.core, cast as in
 * src/api2/host.ts - a bundled engine copy is forbidden), because the
 * presenter itself stays game-free. Without the engine there is no presenter;
 * like the bridge's "no engine" start failure, that birth falls to the game.
 * The protocol, its call sequence and its safety properties are documented in
 * src/birth/presenter.ts.
 *
 * THE RACE comes from the mod's first numeric setting, `borg.raceChoice`
 * (manifest.json's `settings` key; the candidate list and resolver live in
 * src/birth/settings.ts). It is RESOLVED ONCE PER BIRTH, AT SHOW: the
 * presenter reads `deps.raceName` inside show(), and the property wired
 * below is a getter over the resolver, so the index-to-name decision - clamp,
 * pack-unknown fallback, log - runs at the birth itself, never cached at mod
 * start. The setting's VALUE and the pack's race names are fetched once per
 * page, here at registration, because the settings and content calls are
 * async while show() is pinned synchronous (src/birth/presenter.ts); every
 * birth this flag protocol arms follows the page reload its writer issues,
 * so this page's fetch is always the then-current one for the birth that
 * reads it. A host with no settings seam, a failed fetch, or a pack whose
 * records cannot be read leaves the declared default and no pack check -
 * the resolver says which candidate that is in the log, and the presenter's
 * own unknown-race decline is the backstop.
 */
function warriorBirth(mod: ModApi2): Api2BirthPresenter | undefined {
  const core = (mod.engine as { readonly core?: typeof Core } | undefined)?.core;
  if (core === undefined) {
    mod.meta.log("the Borg has no engine here, so the game shows its own character creation");
    return undefined;
  }
  /* The transport for the per-birth resolution above: the setting's current
   * value and the pack's race names, each read as late as the async API
   * allows and held for the getter to resolve from at show. Both are guarded
   * the same way a missing seam is: a host whose call throws or refuses
   * changes nothing here, and the birth still runs on the declared default. */
  let raceChoice: unknown = RACE_CHOICE_SETTING.default;
  let packRaces: readonly string[] | null = null;
  try {
    if (typeof mod.meta.settings === "function") {
      void mod.meta.settings().then(
        (read) => {
          if (read.ok) raceChoice = read.value[RACE_CHOICE_SETTING.id] ?? RACE_CHOICE_SETTING.default;
        },
        () => {
          /* Kept at the declared default; the resolver logs the birth's race. */
        },
      );
    }
    if (typeof mod.content?.records === "function") {
      void mod.content.records("p_race").then(
        (read) => {
          if (!read.ok) return;
          const names = read.value
            .map((record) => (record as { readonly name?: unknown }).name)
            .filter((name): name is string => typeof name === "string");
          packRaces = names.length > 0 ? names : null;
        },
        () => {
          /* No pack knowledge; the chosen candidate stands. */
        },
      );
    }
  } catch {
    /* Held at the defaults; the resolver says which candidate that is. */
  }
  return createWarriorBirthPresenter({
    slot: mod.store.install,
    log: (message) => mod.meta.log(message),
    get raceName(): string {
      return resolveWarriorRace(raceChoice, packRaces, (message) => mod.meta.log(message)).raceName;
    },
    costTable: core.BIRTH_STAT_COSTS,
    statBase: core.BIRTH_STAT_BASE,
  });
}


let bridge: Bridge | undefined;
let running: Promise<Running | null> | undefined;
/* FORK: T04 (#7) - the restart loop's handle, retired in stop() with the bridge. */
let restartHandle: WarriorRestart | undefined;
/**
 * FORK: T04 fixes (#30) - the installation epoch. stop() bumps it
 * SYNCHRONOUSLY; a begin that was still starting when stop ran finds the
 * epoch it captured stale at its checkpoint and installs NOTHING - no title
 * row, no restart listener, no handles published - disposing the bridge it
 * made. A begin that starts AFTER a stop captures the bumped epoch and
 * installs normally: stop retires starts in flight, it does not forbid new
 * ones, and a stopped older start resolving late must not disturb whatever
 * a newer start installed.
 */
let startEpoch = 0;

async function begin(mod: ModApi2): Promise<Running | null> {
  /* FORK: T04 fixes (#30) - captured before this start's first await, so a
   * stop landing while it is still starting invalidates it. */
  const mine = startEpoch;
  /* A start always gets a bridge of its own, so a second start on the same page reads this game and never the one before it. */
  void bridge?.dispose();
  const made = createBridge(mod);
  bridge = made;
  await made.prime();
  if (mine !== startEpoch) {
    /* Stopped mid-start (#30): dispose what THIS start made and publish
     * nothing - its own bridge only, because the module-level handles may
     * already belong to a newer start and must not be touched from here. */
    mod.meta.log("the Borg's start was stopped before it finished, so it installed nothing");
    void made.dispose();
    return null;
  }
  const cfg = cfgFromFlags(mod.meta.flags);
  /* Cross-mod, deliberately outside RULE_CFG and cfg itself: see
   * config.ts's setBuffTimerSafetyNet for why. */
  setBuffTimerSafetyNet(mod.meta.flags["bugfix.borgFixes"] ?? true);
  const borg = createBorg({ resolvers: makeCoreResolvers(made.resolverInput()), cfg });
  /* The title row needs ui:title, profiles:manage and the install slot (T05:
   * the row sets the birth flag there); without all three there is no row. */
  registerBorgTitle(
    {
      id: mod.meta.id,
      log: (message) => mod.meta.log(message),
      ...(mod.presentation?.title ? { title: mod.presentation.title } : {}),
      ...(mod.manage ? { profiles: mod.manage.profiles } : {}),
      slot: mod.store.install,
    },
    installMemory(mod.store.install),
  );
  mod.meta.log(
    made.hasTruth
      ? "the Borg has the keyboard, with danger vision over the monsters the character perceives, activation identity, the in-shop signal and loadout evaluation"
      : "the Borg has the keyboard, but the game gave it no truth domain: it plays from the known world only, with monster hit points read from health bands",
  );
  const changed = changedFrom(cfg);
  mod.meta.log(changed.length === 0 ? "the Borg is on upstream's stock settings" : `the Borg's settings differ from stock: ${changed.join(", ")}`);
  const forget = (x: number, y: number): void => {
    if (!borg.world.map.inBounds(x, y)) return;
    const grid = borg.world.map.at(x, y);
    grid.feat = 0;
    grid.info &= ~(BORG_MARK | BORG_VIEW);
  };
  /* FORK: T04 (#7) - the restart loop. Every piece is a slice of this mod's
   * own context: the install slot the birth flag lives in, the log, the
   * keyboard-ownership question, the roster's create (absent on a host that
   * gives this mod no manage seam - the loop says so and the run ends at its
   * death), and the event domain the run report arrives on. The protocol it
   * implements - death, report, flag, create, reload, presenter, armed
   * controller - and every failure mode's landing place are documented in
   * src/loop/restart.ts. */
  const restart = installWarriorRestart({
    slot: mod.store.install,
    log: (message) => mod.meta.log(message),
    ownsKeyboard: () => mod.act.controller.owns(),
    create: mod.manage?.saves.create ?? null,
    events: mod.events,
  });
  /* Module-level so stop() can retire it even before `running` settles, and
   * retired here the same way the bridge is, so a second start on the same
   * page (a start without a stop) never leaves two loops listening for one
   * report. */
  void restartHandle?.stop();
  restartHandle = restart;
  return { bridge: made, tick: createTick(made, { controller: borg.controller, rewind: borg.rewind, forget }), restart };
}

const definition: Api2ModDefinition = {
  api: ">=2.0.0 <3.0.0",

  /* FORK: T03 (#6) - the mod's own character creation, under
   * ui:birth.replace. Flag-gated: without the flag the presenter declines and
   * the game's own birth screens run as before. See warriorBirth above. */
  birth: (mod) => warriorBirth(mod),

  /* FORK: T04 (#7) - the controller installs with onDeath: "end", not
   * upstream's default "reincarnate". Upstream's reincarnation starts the
   * next character in place with a RANDOM race and class and roller stats -
   * exactly what this fork exists not to do. "end" runs the ordinary death
   * (tombstone, score entry, run report) and leaves this controller
   * installed until the page reloads, which is the moment our own restart
   * loop takes over: it hears the run report, sets T03's birth flag, and
   * calls saves.create({ resumeAutoplayer: true }) so the reload lands in
   * birth with the presenter's planned warrior and this controller armed on
   * it (src/loop/restart.ts owns the protocol and its failure modes). */
  onDeath: "end",

  async start(mod) {
    running = begin(mod).catch((error: unknown) => {
      mod.meta.log(`the Borg could not start: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
    await running;
  },

  /* The game tears its mods down before it reloads, and the headless runner registers them again on the same page after a save and reload. The message listener leaves the game here, or the second registration doubles every message. */
  stop() {
    /* FORK: T04 fixes (#30) - invalidate every start still in flight,
     * synchronously, before any teardown: a begin suspended in its bridge's
     * prime will find its epoch stale at the checkpoint and install
     * nothing, instead of installing a live restart listener into a mod the
     * host has already stopped. */
    startEpoch += 1;
    running = undefined;
    const held = bridge;
    bridge = undefined;
    /* FORK: T04 (#7) - the restart loop's run-report listener leaves with
     * the rest, for the same reason: a re-registration on the same page
     * must not leave two loops listening for one report. Torn down before
     * the bridge (reverse of begin's order). */
    const loop = restartHandle;
    restartHandle = undefined;
    void loop?.stop();
    void held?.dispose();
  },

  /* Offer to play only when this character was handed to an autoplayer before or was armed from the title row. Returning false is the normal case: the mod is installed and enabled, and this character has never been handed over, so the human keeps the keyboard. */
  armed(context) {
    return context.armed || characterAlreadyAutoplayed(context);
  },

  async controller(mod: ModApi2, input: Api2InputState) {
    const live = await running;
    if (live === undefined || live === null) return;
    await live.tick(mod, input);
  },
};

export default definition;
