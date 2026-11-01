/**
 * The ONE place the Borg reaches into the engine for a runtime value.
 *
 * WHY THIS FILE EXISTS, and it is not tidiness. The mod builder REFUSES a plugin
 * that bundles a copy of the engine: a second `@rpgm-tools/neo-angband-core`
 * inside plugin.js would give it its own registries while the game ran on
 * another set, and the two would agree right up until they did not. A mod
 * receives the live engine as `ctx.core` instead - the same module instance the
 * game is running on.
 *
 * Which meant every bare `import ... from "@rpgm-tools/neo-angband-core"` in the
 * Borg was a line that had to change on the way out of the engine repository.
 * Measured before the move: 37 files mentioned the package and **28 of those
 * were `import type`**, which compiles to nothing and could stay exactly as it
 * was. The runtime coupling was six symbols across eight files, funnelled here
 * so the extraction replaced ONE file. `core-import-census.test.ts` is what
 * keeps that true: it fails if a second file grows a value import.
 *
 * HOW THE INDIRECTION WORKS: ESM live bindings, not a Proxy. `export let` is a
 * binding importers see through, so `bindCore` reassigning FEAT here updates
 * `FEAT` at every use site, and esbuild preserves that inside the bundle. A
 * Proxy would also work and is worse: it would have to get iteration, spread and
 * `new` right for six symbols of three different kinds, and each of those is a
 * way to be subtly wrong. A reassigned variable IS the engine's own object.
 *
 * THE ONE RULE THIS IMPOSES: nothing may read these at MODULE TOP LEVEL, because
 * modules evaluate at import time and `bindCore` runs after. Measured across the
 * whole port: exactly one site did - a `const` array of TV values in
 * think-ladder.ts - and it was made lazy. `top-level-core-use.test.ts` fails if
 * a second appears, because the alternative symptom is an `undefined` read
 * somewhere inside a decision ladder.
 *
 * Type-only imports are deliberately NOT funnelled. They are erased, they cost
 * the mod nothing, and routing them through here would hide which engine types
 * each module actually speaks in.
 *
 * THE ADAPTER. This file is also the one place the Borg reads the host at all:
 * the plugin context, the registries, the live state, and the view and actions
 * a controller is handed. The exports are grouped by the API 2 domain each one
 * maps to (meta, view, truth and act). Anything with no API 2 counterpart sits
 * in the engine group, with a note on what API 2 would need for it.
 * adapter-boundary.test.ts fails when another file reads the host directly.
 */

import type * as Core from "@rpgm-tools/neo-angband-core";
import type {
  AgentActions,
  AgentCommand,
  AgentController,
  AgentView,
  CellView,
  ModPluginContext,
  MonsterRace,
} from "@rpgm-tools/neo-angband-core";
import type { CoreObjectLookup, CoreResolverInput, CoreShopLookup } from "./resolvers.js";

/* ==================================================================
 * engine: live bindings from ctx.core
 * ================================================================== */

export { Rng } from "./rng.js";

/** Terrain indices the map model compares CellView.feat with. API 2: content lookup (terrain records or featCode). */
export let FEAT!: typeof Core.FEAT;
/** Item class indices the item and store code compares tval with. API 2: content lookup (object_base records). */
export let TV!: typeof Core.TV;
/** Monster spell indices the danger math switches on. API 2: content lookup (monster_spell records). */
export let RSF!: typeof Core.RSF;
/** RF_* index to name table, for decoding a race's flag set. API 2: content lookup (monster flag names). */
export let MON_RACE_FLAG_ENTRIES!: typeof Core.MON_RACE_FLAG_ENTRIES;
/** RSF_* index table, for telling real spell entries from padding. API 2: content lookup (monster_spell records). */
export let MON_SPELL_ENTRIES!: typeof Core.MON_SPELL_ENTRIES;
/**
 * do_cmd_rest's "rest as needed" mode (player-util.h REST_COMPLETE = -2),
 * passed to `ctx.act.rest(count)` wherever the recovery ladder wants a genuine
 * multi-turn rest instead of the single-turn-per-tick call that used to be the
 * only shape `rest()` had. A plain number, not a registry - bound here anyway
 * rather than imported directly, so this stays the only file in the bundle
 * that names the engine as a value source (core-import-census.test.ts).
 * API 2: a host-interpreted declaration (a named rest mode in the command args).
 */
export let REST_COMPLETE!: number;

let bound = false;

/**
 * Hand the Borg the live engine. Called once, through the adapter's
 * `engine.bind()`, with `ctx.core`, before any other Borg code runs.
 */
export function bindCore(core: typeof Core): void {
  FEAT = core.FEAT;
  TV = core.TV;
  RSF = core.RSF;
  MON_RACE_FLAG_ENTRIES = core.MON_RACE_FLAG_ENTRIES;
  MON_SPELL_ENTRIES = core.MON_SPELL_ENTRIES;
  REST_COMPLETE = core.REST_COMPLETE;
  bound = true;
}

/**
 * Whether bindCore has run. Exists so the entry point can refuse to build a Borg
 * against an unbound engine with a sentence, rather than letting the first
 * `FEAT.MORE` read undefined several hundred decisions later.
 */
export function coreIsBound(): boolean {
  return bound;
}

/* ==================================================================
 * The plugin context the controller seam reads
 * ================================================================== */

/**
 * What this plugin needs from the host's context. The plain fields come from
 * Core's published `ModPluginContext`; the three below are narrower than the
 * host's own, for the reasons each one gives.
 */
export type ControllerCtx = Pick<ModPluginContext, "flags" | "log" | "controllerArmed"> & {
  /** The live engine namespace, at the version manifest.json requires. */
  readonly core: typeof Core;
  /**
   * The bound content registries (host `ctx.registries`).
   *
   * Required, not optional. This is the controller seam's contract rather than
   * the host's whole `ModPluginContext`, which declares the field optional
   * because the same type also serves `hooks(ctx)` - and `hooks` runs before the
   * game exists. At the one call site that invokes `controller()` the host has
   * already latched the bound registries, so the field is always there.
   * `Core.CoreRegistries` rather than a hand-written shape, so a change to the
   * registry the Borg reads fails this repository's build instead of surfacing as
   * bad play.
   */
  readonly registries: Core.CoreRegistries;
  /**
   * The live game state (host `ctx.state`). Required for the same reason as
   * `registries`: `controller()` runs after boot, so a character with a grid
   * exists by then. Declared as the narrow shape the resolver seams actually read
   * (player grid + level feature lookup) rather than imported, because
   * `GameState` is an internal host type and not part of the published surface.
   */
  readonly state: {
    readonly actor: {
      readonly grid: { readonly x: number; readonly y: number };
      /**
       * The live player, when the host has one. Optional in this declared
       * shape because a defective test host can omit it; a real controller()
       * call always has a character by then.
       */
      readonly player?: { readonly noscore: number };
    };
    readonly chunk: {
      feature(grid: { x: number; y: number }): { shopnum: number };
    };
    /* Flavour awareness, for pricing a floor object the way borg_new_take
     * does. Optional in the declared shape because it is optional on the host's
     * own state; absent, every kind reads as unaware, which is upstream's
     * "worth 1, pick it up and find out". */
    readonly isAware?: (kind: unknown) => boolean;
  };
};

/* ==================================================================
 * meta
 * ================================================================== */

/** The plugin-context reads with a direct API 2 counterpart in `meta`. */
export interface BorgMeta {
  /** API 2: meta.flags. Also carries Bug Fixes' `bugfix.borgFixes`, which API 2 would read from meta.mods(). */
  readonly flags: Readonly<Record<string, boolean>>;
  /** API 2: meta.log. */
  log(message: string): void;
}

/* ==================================================================
 * engine: plugin-context reads with no API 2 counterpart
 * ================================================================== */

/** The host reads the controller seam needs that API 2 has no call for. */
export interface BorgEngine {
  /** Binds the live namespace (bindCore) and answers whether it took. API 2: none; see the live bindings above. */
  bind(): boolean;
  /** The API 1 context fields this host left out, by name, for the refusal message. */
  missing(): string[];
  /** view field: the character's noscore bits (the Ctrl-Z autoplay mark). KnownPlayer has no noscore. */
  noscore(): number;
  /** declaration: the title row armed the controller for this character. meta.newCharacter is a different fact. */
  readonly controllerArmed: boolean | undefined;
  /** The registry and state slices behind the resolver seams; each field's API 2 need is noted where it is read. */
  resolverInput(): CoreResolverInput;
}

/** Everything the plugin entry reads from its context, built once per controller() call. */
export interface BorgAdapter {
  readonly meta: BorgMeta;
  readonly engine: BorgEngine;
}

/**
 * Build the adapter over one controller() context. Nothing is read until a
 * member is used, so a declined controller() binds nothing.
 */
export function createAdapter(ctx: ControllerCtx): BorgAdapter {
  return {
    meta: {
      get flags() {
        return ctx.flags;
      },
      log: (message) => ctx.log(message),
    },
    engine: {
      bind() {
        bindCore(ctx.core);
        return coreIsBound();
      },
      missing() {
        const missing: string[] = [];
        if (!ctx.registries) missing.push("ctx.registries");
        if (!ctx.state) missing.push("ctx.state");
        return missing;
      },
      noscore: () => ctx.state?.actor?.player?.noscore ?? 0,
      get controllerArmed() {
        return ctx.controllerArmed;
      },
      resolverInput: () => ({
        // truth: every race's blows, spells, flags and frequencies, past what monster lore has taught.
        races: ctx.registries.monsters.races,
        // content lookup: kind, ego and artifact records by tval/sval or name (content.lookup).
        objects: ctx.registries.objects,
        // view field: the player's own grid feature, and flavour awareness.
        state: ctx.state,
        // content lookup: blow method message templates (content.records("blow_methods")).
        blowMethods: ctx.registries.monsters.blowMethods.values(),
        // content lookup: monster spell messages (content.records("monster_spell")).
        monsterSpells: ctx.registries.monsters.spells?.values() ?? [],
      }),
    },
  };
}

/* ==================================================================
 * engine: record reads behind the resolver seams (resolvers.ts)
 * ================================================================== */

/** A melee blow decoded from a race record: dice, sides and the effect's name. */
export interface RaceBlow {
  readonly dice: number;
  readonly sides: number;
  readonly effect: string;
}

/** The parts of a monster race the danger evaluator reads, as plain data. */
export interface RaceRecord {
  readonly ridx: number;
  /** RF_* code names for the set flags (index == RF value). */
  readonly flags: Set<string>;
  readonly level: number;
  readonly sleep: number;
  readonly spellPower: number;
  readonly freqInnate: number;
  readonly freqSpell: number;
  readonly hasFriends: boolean;
  readonly blows: readonly RaceBlow[];
  /** RSF_* ordinals the race can cast, ascending (matches the C preload loop). */
  readonly spells: number[];
}

/** truth: race records by ridx, so a tracked monster's race is found after it leaves view. */
export function racesByIndex(races: readonly MonsterRace[]): Map<number, MonsterRace> {
  const byRidx = new Map<number, MonsterRace>();
  for (const r of races) byRidx.set(r.ridx, r);
  return byRidx;
}

/** truth: a race's full combat record; monster lore shows only what the player has learned of it. */
export function raceRecord(race: MonsterRace): RaceRecord {
  return {
    ridx: race.ridx,
    flags: raceFlagNames(race),
    level: race.level,
    sleep: race.sleep,
    spellPower: race.spellPower,
    freqInnate: race.freqInnate,
    freqSpell: race.freqSpell,
    hasFriends: race.friends.length > 0 || race.friendsBase.length > 0,
    blows: raceBlows(race),
    spells: raceSpellOrdinals(race),
  };
}

/** RF_* code names for the set flags in a race flag set (index == RF value). */
function raceFlagNames(race: MonsterRace): Set<string> {
  const out = new Set<string>();
  for (const f of race.flags) {
    const entry = MON_RACE_FLAG_ENTRIES[f];
    if (entry) out.add(entry.name);
  }
  return out;
}

/** RSF_* ordinals the race can cast, ascending (matches the C preload loop). */
function raceSpellOrdinals(race: MonsterRace): number[] {
  const out: number[] = [];
  for (const f of race.spellFlags) {
    // Only real spell entries (index maps to a known RSF_*), skip padding.
    if (MON_SPELL_ENTRIES[f]) out.push(f);
  }
  out.sort((a, b) => a - b);
  return out;
}

/** race.blow[] -> dice/sides via Dice.randomValue, and the effect's name. */
function raceBlows(race: MonsterRace): RaceBlow[] {
  return race.blows.map((b) => {
    const rv = b.dice ? b.dice.randomValue() : null;
    return {
      dice: rv ? rv.dice : 0,
      sides: rv ? rv.sides : 0,
      effect: b.effect.name,
    };
  });
}

/** An activation record, or null. */
type Activation = NonNullable<ReturnType<CoreObjectLookup["findEgo"]>>["activation"];

/** content lookup: the activation an artifact record carries, by the name the player knows it by. */
export function artifactActivation(objects: CoreObjectLookup, name: string): Activation {
  return objects.findArtifact(name)?.activation ?? null;
}

/** content lookup: the activation an ego record carries, by the name the player knows it by. */
export function egoActivation(objects: CoreObjectLookup, name: string): Activation {
  return objects.findEgo(name)?.activation ?? null;
}

/** content lookup: the activation an object kind carries, by tval/sval. */
export function kindActivation(objects: CoreObjectLookup, tval: number, sval: number): Activation {
  return objects.lookupKind(tval, sval)?.activation ?? null;
}

/**
 * content lookup and view field: a kind's base cost, and whether the character
 * is aware of its flavour. Null when no kind has this tval/sval.
 */
export function kindPrice(
  objects: CoreObjectLookup,
  state: CoreShopLookup | undefined,
  tval: number,
  sval: number,
): { cost: number; aware: boolean } | null {
  const kind = objects.lookupKind(tval, sval);
  if (!kind) return null;
  return { cost: kind.cost ?? 0, aware: kind.aware ?? state?.isAware?.(kind) ?? false };
}

/** view field: f_info[feat].shopnum of the player's own grid (square_shopnum, cave-square.c:1512). */
export function shopnumHere(state: CoreShopLookup): number {
  return state.chunk.feature(state.actor.grid).shopnum;
}

/* ==================================================================
 * view and truth: the AgentView a controller is handed
 * ================================================================== */

/**
 * view: accessors that show what the player knows. API 2: view, in its own
 * shapes (KnownPlayer, KnownItem, KnownStore, KnownSpellbook, KnownLevel).
 */
export type BorgKnownReads = Pick<
  AgentView,
  "player" | "mapBounds" | "inventory" | "equipment" | "floorItems" | "messages" | "stores" | "spellbooks" | "constants"
>;

/**
 * truth: accessors that show more than the player knows. API 2: the
 * first-party truth domain (truth.monsters(), truth.level()) or a host derive.
 */
export type BorgTruthReads = Pick<AgentView, "monsters" | "cell" | "simulateLoadout">;

/**
 * The view a controller is handed, split by what each accessor shows. The
 * known half reads what the player knows. The truth half reads more than that,
 * and is what the first-party truth domain has to cover before the Borg can
 * move.
 */
export type BorgView = BorgKnownReads & BorgTruthReads;

/** The host's cell, with the remembered-terrain fields a newer core adds. */
type HostCell = CellView & { knownFeat?: number; knownPassable?: boolean };

/** Wraps a host cell so that it reports the terrain the player remembers instead of the live terrain. When the host supplies knownFeat, the returned cell takes feat and passable from the remembered terrain (an unknown square reads feat 0 and not passable), and glow counts only while the square is in view. When the host supplies no knownFeat, as on a core that predates the field, the live cell passes through unchanged. */
function rememberedCell(cell: CellView | null): CellView | null {
  if (!cell) return cell;
  const host = cell as HostCell;
  if (host.knownFeat === undefined) return cell;
  const known = host.knownFeat >= 0;
  return {
    ...cell,
    feat: known ? host.knownFeat : 0,
    passable: known && host.knownPassable === true,
    glow: cell.inView && cell.glow,
  };
}

/** Wrap the host's AgentView, one delegating accessor per read the Borg makes. */
export function borgView(host: AgentView): BorgView {
  const view: BorgView = {
    // view: vitals, stats, status, depth and grid. API 2: view.player(). Speed, to-hit and AC here come
    // from the live derive, so a worn rune the player has not learned still moves them. KnownPlayer
    // shows the known values.
    player: () => host.player(),
    // view: the level's width and height. API 2: KnownLevel width/height.
    mapBounds: () => host.mapBounds(),
    // view: the pack, each item from its known twin. API 2: view.world().inventory.
    inventory: () => host.inventory(),
    // view: worn gear by slot, each item from its known twin. API 2: view.world().equipment.
    equipment: () => host.equipment(),
    // view: objects remembered exactly on a grid, from their known twins. API 2: KnownLevel cell objects.
    // The list is the live pile filtered by memory, so an object taken since it was seen drops out.
    floorItems: (x, y) => host.floorItems(x, y),
    // view: messages since the previous decision. API 2: the `message` event.
    messages: () => host.messages(),
    // view: the live stock of every town store, readable even from the dungeon. API 2
    // view.world().stores hands over the same data, which keeps this a view read. Upstream's borg only
    // knew the stock it saw on its last visit.
    stores: () => host.stores(),
    // view: the class's books and spells, with fail rates. API 2: view.world().spellbooks.
    spellbooks: () => host.spellbooks(),
    // view: the bound game constants (z_info). API 2: no call; a content lookup or a meta field.
    constants: () => host.constants(),
    // truth: perceived monsters only, with exact hp/maxHp, current speed, sleep/fear/confusion/stun
    // timers, and every race flag and spell, learned or not. API 2: truth.monsters(), which also lists
    // unseen monsters and has no "perceived" flag to filter them by.
    monsters: () => host.monsters(),
    // truth: one grid. feat and passable give the live terrain rather than the remembered one, so a
    // secret door reads as FEAT_SECRET where the player sees granite, and a door that changed out of
    // sight shows its new state. glow is live too. known, inView, monster, objectCount and trap follow
    // what the player sees. API 2: truth.level().
    cell: (x, y) => rememberedCell(host.cell(x, y)),
  };
  const simulate = host.simulateLoadout;
  if (simulate) {
    // truth: runs the engine's calc_bonuses over a loadout the character is not wearing, on the real
    // objects, so runes nobody has learned still count. API 2 has no such call. It needs a host derive
    // (a policy) or a truth read.
    view.simulateLoadout = (change) => simulate.call(host, change);
  }
  return view;
}

/* ==================================================================
 * act
 * ================================================================== */

/**
 * The command builders the Borg calls. Each returns an AgentCommand that the
 * controller hands back. In API 2 every builder becomes act.submit(token,
 * { kind: "command", command }), which is async and answers an Api2Result.
 */
export type BorgActions = Pick<
  AgentActions,
  | "move"
  | "melee"
  | "hold"
  | "rest"
  | "descend"
  | "ascend"
  | "tunnel"
  | "open"
  | "close"
  | "disarm"
  | "quaff"
  | "read"
  | "eat"
  | "wear"
  | "takeoff"
  | "drop"
  | "pickup"
  | "aimWand"
  | "zapRod"
  | "useStaff"
  | "activate"
  | "fire"
  | "throw"
  | "cast"
  | "setTargetMonster"
  | "setTargetLocation"
  | "shopBuy"
  | "shopSell"
  | "shopExit"
  | "raw"
>;

/** Wrap the host's AgentActions, one delegating builder per command the Borg issues. */
export function borgActions(host: AgentActions): BorgActions {
  return {
    move: (...a) => host.move(...a),
    melee: (...a) => host.melee(...a),
    hold: (...a) => host.hold(...a),
    rest: (...a) => host.rest(...a),
    descend: (...a) => host.descend(...a),
    ascend: (...a) => host.ascend(...a),
    tunnel: (...a) => host.tunnel(...a),
    open: (...a) => host.open(...a),
    close: (...a) => host.close(...a),
    disarm: (...a) => host.disarm(...a),
    quaff: (...a) => host.quaff(...a),
    read: (...a) => host.read(...a),
    eat: (...a) => host.eat(...a),
    wear: (...a) => host.wear(...a),
    takeoff: (...a) => host.takeoff(...a),
    drop: (...a) => host.drop(...a),
    pickup: (...a) => host.pickup(...a),
    aimWand: (...a) => host.aimWand(...a),
    zapRod: (...a) => host.zapRod(...a),
    useStaff: (...a) => host.useStaff(...a),
    activate: (...a) => host.activate(...a),
    fire: (...a) => host.fire(...a),
    throw: (...a) => host.throw(...a),
    cast: (...a) => host.cast(...a),
    // Sets the game's target at once, outside any command. API 2: act.submit(token, { kind: "target", midx }).
    setTargetMonster: (...a) => host.setTargetMonster(...a),
    // Sets the game's target at once, outside any command. API 2: act.submit(token, { kind: "target", x, y }).
    setTargetLocation: (...a) => host.setTargetLocation(...a),
    shopBuy: (...a) => host.shopBuy(...a),
    shopSell: (...a) => host.shopSell(...a),
    shopExit: (...a) => host.shopExit(...a),
    raw: (...a) => host.raw(...a),
  };
}

/** One Borg decision over the wrapped view and actions. */
export type BorgDecide = (view: BorgView, act: BorgActions) => AgentCommand | null;

/**
 * The controller seam: the host calls it at each input wait with its view and
 * actions, and the Borg decides over the wrapped pair. API 2: act.controller,
 * plus a loop over view.input() and act.submit(), since an API 2 controller
 * submits a command rather than returning one.
 */
export function hostController(decide: BorgDecide): AgentController {
  return (view, act) => decide(borgView(view), borgActions(act));
}
