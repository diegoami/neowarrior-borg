/**
 * Borg, as a mod's entry point.
 *
 * This file and title.ts are the mod's own code, and src/api2/ is the bridge
 * between the game's API and the port: everything else under src/ is the port,
 * carried over from the game's repository. This file's job is to satisfy the
 * mod API, read the game's content once, and take a decision at each input wait.
 * title.ts adds the title screen's "New Borg character" row.
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

import type { Api2ControllerContext, Api2InputState, Api2ModDefinition, ModApi2 } from "@rpgm-tools/neo-angband-mod-sdk";
import { installMemory, registerBorgTitle } from "./title.js";
import { NOSCORE_BORG } from "./src/activate.js";
import { createBorg } from "./src/controller.js";
import { makeCoreResolvers } from "./src/resolvers.js";
import { defaultCfg, setBuffTimerSafetyNet, type BorgCfg } from "./src/trait/config.js";
import { createBridge, type Bridge } from "./src/api2/host.js";
import { createTick, type Tick } from "./src/api2/controller.js";
import { BORG_MARK, BORG_VIEW } from "./src/world/grid.js";

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
 * The one other way in is the title row: a character started from "New Borg
 * character" arrives armed, and choosing the row was the player's consent for
 * that character.
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
}

let bridge: Bridge | undefined;
let running: Promise<Running | null> | undefined;

async function begin(mod: ModApi2): Promise<Running | null> {
  /* A start always gets a bridge of its own, so a second start on the same page reads this game and never the one before it. */
  void bridge?.dispose();
  const made = createBridge(mod);
  bridge = made;
  await made.prime();
  const cfg = cfgFromFlags(mod.meta.flags);
  /* Cross-mod, deliberately outside RULE_CFG and cfg itself: see
   * config.ts's setBuffTimerSafetyNet for why. */
  setBuffTimerSafetyNet(mod.meta.flags["bugfix.borgFixes"] ?? true);
  const borg = createBorg({ resolvers: makeCoreResolvers(made.resolverInput()), cfg });
  /* The title row needs ui:title and profiles:manage; without both there is no row. */
  registerBorgTitle(
    {
      id: mod.meta.id,
      log: (message) => mod.meta.log(message),
      ...(mod.presentation?.title ? { title: mod.presentation.title } : {}),
      ...(mod.manage ? { profiles: mod.manage.profiles } : {}),
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
  return { bridge: made, tick: createTick(made, { controller: borg.controller, rewind: borg.rewind, forget }) };
}

const definition: Api2ModDefinition = {
  api: ">=2.0.0 <3.0.0",

  async start(mod) {
    running = begin(mod).catch((error: unknown) => {
      mod.meta.log(`the Borg could not start: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
    await running;
  },

  /* The game tears its mods down before it reloads, and the headless runner registers them again on the same page after a save and reload. The message listener leaves the game here, or the second registration doubles every message. */
  stop() {
    running = undefined;
    const held = bridge;
    bridge = undefined;
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
