/**
 * THE HEADLESS WARRIOR SESSION, as one plain function (T06, #9).
 *
 * src/play.test.ts's T04 suite drives the restart loop's BUILD assertion
 * chain; this module drives the same loop with the RECORDS bolted on, so the
 * session that proves the journal is the session whose runs.json gets
 * committed: one driver, called by the test (which asserts its output against
 * the live game) and by tools/runs.mjs (which writes docs/runs/), with
 * nothing test-bound in it - T07's bake-off sweep calls it too.
 *
 * WHAT THE HARNESS STANDS IN FOR. The mod's loop runs through host seams a
 * bare engine has no page for, so the harness plays the host's half, exactly
 * as T04 specified for the birth: `startGame({ roller: "point", birthStats })`
 * stands in for saves.create + the presenter + the reload, and here the
 * stand-in extends to the RECORDS - `state.events` gets the bus a host
 * attaches (the engine emits `dungeonlevel` into it on every arrival, the
 * session's first level through `announceArrival`), and each character gets
 * the in-memory slot that stands in for `mod.store.character` in its save.
 * The journal code between those seams is the mod's own: installWarriorJournal,
 * unmodified, subscribed to the engine's real arrival events, and its
 * graveyard writer awaited BEFORE the next warrior boots - the same
 * journal-before-create ordering src/loop/restart.ts implements against the
 * real roster seam.
 *
 * WHAT IS READ FROM THE LIVE GAME, never from the Borg's or the journal's own
 * bookkeeping: every depth in `depthsVisited` (state.chunk.depth, observed
 * after every decision), maxDepth and causeOfDeath and the build (the player
 * the engine just birthed), turns, gold, character level, and kills - the
 * sum of the per-race `pkills` counters in the game's own lore store, which
 * is where the character dump's kill count comes from. If a future engine
 * loses any of those, the assertion fails rather than the record lying.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  BIRTH_STAT_BASE,
  BIRTH_STAT_COSTS,
  ContentIdResolver,
  GameEvents,
  LOOP_STATUS,
  MAX_BIRTH_POINTS,
  bindPlayer,
  installController,
  runGameLoop,
  startGame,
  totalPoints,
} from "@rpgm-tools/neo-angband-core";
import * as Core from "@rpgm-tools/neo-angband-core";
import type { DungeonLevelEventData, GamePack, GameState, StartedGame } from "@rpgm-tools/neo-angband-core";
import type {
  Api2Events,
  Api2Slot,
  Api2Subscription,
  JsonValue,
  RunReport,
} from "@rpgm-tools/neo-angband-mod-sdk";
import { createBorg } from "../controller.js";
import { bindCore, coreIsBound } from "../core-api.js";
import { makeCoreResolvers } from "../resolvers.js";
import { ladderFromCostTable, planWarriorBirth, WARRIOR_CLASS_NAME, type WarriorBuildPlan } from "../birth/plan.js";
import { WARRIOR_RACE_CANDIDATES } from "../birth/settings.js";
import { installWarriorJournal, parseJournal, type WarriorJournalData } from "./journal.js";

/* ==================================================================
 * The content pack (moved from play.test.ts, which imports it from here)
 * ================================================================== */

/**
 * The game's checkout, holding the content pack a real boot needs.
 * NEO_ANGBAND_REPO wins when set; otherwise the ancestors of THIS module are
 * walked looking for a sibling `neo-angband` checkout (or the game tree
 * itself), so the lookup survives both the source tree and the bundle the
 * runs tool builds in artifacts/ - a plain relative hop would not.
 */
export function packRoot(): string | null {
  const explicit = process.env["NEO_ANGBAND_REPO"];
  const candidates: string[] = [];
  if (typeof explicit === "string" && explicit.length > 0) candidates.push(explicit);
  let at = fileURLToPath(new URL("./", import.meta.url));
  for (let hops = 0; hops < 8; hops += 1) {
    candidates.push(join(at, "neo-angband"), at);
    const parent = dirname(at);
    if (parent === at) break;
    at = parent;
  }
  for (const root of candidates) {
    const dir = join(root, "packages", "content", "pack");
    if (existsSync(join(dir, "constants.json"))) return dir;
  }
  return null;
}

/** The pack as the engine takes it (play.test.ts's loader, unchanged). */
export function loadPack(dir: string): GamePack {
  const json = <T,>(name: string): T =>
    JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8")) as T;
  const records = <T,>(name: string): T[] => json<{ records: T[] }>(name).records;
  return {
    constants: json("constants"),
    terrain: records("terrain"),
    roomTemplates: records("room_template"),
    vaults: records("vault"),
    dungeonProfiles: records("dungeon_profile"),
    projection: records("projection"),
    trap: records("trap"),
    names: records("names"),
    quest: records("quest"),
    obj: {
      objectBase: json("object_base"),
      object: json("object"),
      egoItem: json("ego_item"),
      artifact: json("artifact"),
      curse: json("curse"),
      brand: json("brand"),
      slay: json("slay"),
      activation: json("activation"),
      objectProperty: json("object_property"),
      flavor: json("flavor"),
    } as GamePack["obj"],
    mon: {
      pain: records("pain"),
      blowMethods: records("blow_methods"),
      blowEffects: records("blow_effects"),
      monsterSpells: records("monster_spell"),
      monsterBases: records("monster_base"),
      monsters: records("monster"),
      summons: records("summon"),
      pits: records("pit"),
    },
    mon2: undefined,
    player: {
      races: records("p_race"),
      classes: records("class"),
      properties: records("player_property"),
      timed: records("player_timed"),
      shapes: records("shape"),
      bodies: records("body"),
      history: records("history"),
      realms: records("realm"),
    },
  } as unknown as GamePack;
}

/**
 * The plan the presenter replays, computed exactly as plugin.ts wires it: the
 * published engine's own cost table and point budget, this explicit race -
 * the same ONE plan every caller shares, a disagreement between any two of
 * them being a bug in one of them.
 */
export function warriorSessionPlan(pack: GamePack, raceName: string = WARRIOR_RACE_CANDIDATES[0]): WarriorBuildPlan {
  const players = bindPlayer(pack.player);
  return planWarriorBirth({
    catalogue: {
      races: players.races.map((race) => ({ name: race.name, statAdj: race.statAdj })),
      classes: players.classes.map((cls) => ({ name: cls.name, statAdj: cls.statAdj })),
      stats: ["STR", "INT", "WIS", "DEX", "CON"],
      pointBudget: MAX_BIRTH_POINTS,
    },
    raceName,
    costs: ladderFromCostTable(BIRTH_STAT_COSTS, BIRTH_STAT_BASE),
  });
}

/* ==================================================================
 * The host seams the harness stands in for
 * ================================================================== */

/** An in-memory character slot, the stand-in for `mod.store.character`. */
function characterSlot(): Api2Slot & { held(): JsonValue | null } {
  let value: JsonValue | null = null;
  return {
    get: () => Promise.resolve({ ok: true as const, value: structuredClone(value) }),
    set: (next) => {
      value = structuredClone(next);
      return Promise.resolve({ ok: true as const, value: null });
    },
    held: () => value,
  };
}

/**
 * The events domain the journal subscribes through, over the engine's own
 * bus: the payload the engine emits for `dungeonlevel` IS the API's
 * Api2LevelEvent shape, so the journal hears the real arrivals, never a
 * simulation of them.
 */
function eventsOverBus(bus: GameEvents): Pick<Api2Events, "on" | "off"> {
  const handlers = new Map<string, (type: "dungeonlevel", data: DungeonLevelEventData) => void>();
  let serial = 0;
  return {
    on: (name: string, listener: (payload: never) => void) => {
      if (name !== "dungeonlevel") {
        return Promise.resolve({
          ok: false as const,
          reason: "not-granted" as const,
          capability: `event:${name}`,
          message: `the headless host carries no ${name} event`,
        });
      }
      serial += 1;
      const id = `dungeonlevel:${String(serial)}`;
      const handler = (_type: "dungeonlevel", data: DungeonLevelEventData): void => {
        listener(data as never);
      };
      handlers.set(id, handler);
      bus.on("dungeonlevel", handler);
      return Promise.resolve({ ok: true as const, value: { id } });
    },
    off: (subscription: Api2Subscription) => {
      const handler = handlers.get(subscription.id);
      if (handler !== undefined) {
        bus.off("dungeonlevel", handler);
        handlers.delete(subscription.id);
      }
      return Promise.resolve({ ok: true as const, value: null });
    },
  } as unknown as Pick<Api2Events, "on" | "off">;
}

/**
 * The run report the harness writes at a death, every real field read from
 * the player the engine just killed: the killer is the player's own
 * died-from, the score is the engine's own formula (totalPoints, score.c
 * L28), the build is the birth stats the engine stored at birth. The fields
 * a bare engine has no host surface for (history, messages, belongings, the
 * sheet) are empty: this is the report of a headless session and claims
 * nothing else.
 */
function runReportOf(state: GameState, outcome: RunReport["outcome"]): RunReport {
  const player = state.actor.player;
  const name = player.fullName.length > 0 ? player.fullName : "Borg";
  return {
    outcome,
    cause: player.diedFrom,
    key: null,
    name,
    race: player.race.name,
    cls: player.cls.name,
    level: player.lev,
    maxLevel: player.maxLev,
    maxDepth: player.maxDepth,
    depth: state.chunk.depth,
    gold: player.au,
    turn: state.turn,
    score: totalPoints(player),
    scored: false,
    endedAt: 0,
    history: [],
    messages: [],
    belongings: [],
    sheet: null,
    birth: { race: player.race.name, cls: player.cls.name, name, stats: [...player.statBirth] },
  };
}

/** The kills the game itself counted: per-race pkills, summed. */
function killsOf(state: GameState): number {
  let kills = 0;
  for (const lore of state.lore.values()) kills += lore.pkills;
  return kills;
}

/* ==================================================================
 * The session
 * ================================================================== */

/** One warrior's life, with its records read back from the journal's slot. */
export interface SessionLife {
  readonly seed: number;
  /** Whether the warrior died (the event that boots the next one). */
  readonly dead: boolean;
  readonly decisions: number;
  readonly turns: number;
  /** Deepest depth the LIVE player says it reached. */
  readonly maxDepth: number;
  /**
   * The depth the live chunk carried when the run ended - the level a death
   * happened on (0 = town), or where a survivor stood when its slice ran out.
   * The bake-off's town-versus-dungeon death split reads this, never a guess
   * from maxDepth (a warrior can die in town after visiting the dungeon).
   */
  readonly endDepth: number;
  /** Character level at end of run (the live player's). */
  readonly clvl: number;
  /** Monsters slain, from the game's own lore counters. */
  readonly kills: number;
  readonly gold: number;
  /** The killer as the game reported it (died-from), only when dead. */
  readonly causeOfDeath: string | null;
  readonly race: string;
  readonly className: string;
  readonly baseStats: readonly number[];
  /** The command census: how many times each command code was issued. */
  readonly commands: Record<string, number>;
  /** Every depth the character stood on, observed from the live game. */
  readonly depthsVisited: readonly number[];
  /**
   * The (level, turn) the live game carried at each arrival, keyed by depth -
   * what the journal's milestone stamps must match, read independently of it.
   */
  readonly arrivalStamps: ReadonlyMap<number, { readonly level: number; readonly turn: number }>;
  /** The journal as it stood in the character's slot at the end of the life. */
  readonly journal: WarriorJournalData | null;
}

/** A whole session: the lives in play order, chained by deaths. */
export interface SessionOutcome {
  readonly lives: readonly SessionLife[];
}

/** How a session is asked for. */
export interface WarriorSessionOptions {
  /** The seeds to play, in order; each warrior boots only behind its predecessor's death. */
  readonly seeds: readonly number[];
  /** The decision cap for each life. */
  readonly capFor: (seed: number) => number;
  /** The race to birth; candidate 0 (the setting's default) when omitted. */
  readonly raceName?: string;
  /** Where the harness's log lines go (the mod's own log when it has one). */
  readonly log?: (message: string) => void;
}

/**
 * Play a session of planned warriors: boot (the presenter's build), play to
 * death or cap, record (journal milestones from the engine's own arrival
 * events, the graveyard entry awaited before the next boot - the loop's
 * journal-before-create ordering), and return everything the reporter and the
 * tests read. A warrior that survives its cap ENDS the session: the real loop
 * sequences on death, and a session record must not pretend otherwise.
 */
export async function playWarriorSession(pack: GamePack, options: WarriorSessionOptions): Promise<SessionOutcome> {
  /* The port's engine constants (FEAT, TV, ...) are live bindings that the
   * host fills from the engine it hands the mod; the vitest setup file
   * stands in for that in tests, and here the session binds the one engine
   * it drives - the same published copy the tests import. */
  if (!coreIsBound()) bindCore(Core);
  const plan = warriorSessionPlan(pack, options.raceName);
  const say = options.log ?? ((): void => undefined);
  const lives: SessionLife[] = [];

  for (const seed of options.seeds) {
    const previous = lives[lives.length - 1];
    if (previous !== undefined && !previous.dead) {
      say(`the session stops at seed ${String(previous.seed)}: that warrior survived its slice, so the loop would never have booted seed ${String(seed)}`);
      break;
    }

    const game: StartedGame = startGame(pack, {
      seed,
      depth: 0,
      raceName: plan.raceName,
      className: WARRIOR_CLASS_NAME,
      roller: "point",
      birthStats: [...plan.baseStats],
    });
    const state: GameState = game.state;
    /* The host's event bus, attached before anything can arrive on a level:
     * the engine emits `dungeonlevel` into it at every changeLevel, and the
     * session's first arrival comes from announceArrival below. */
    const bus = new GameEvents();
    state.events = bus;

    /* The harness's OWN eyes on the game, independent of the journal: every
     * arrival the engine announces is captured with the live player's level
     * and the live turn, so the journal's stamps can be checked against the
     * game rather than against themselves. */
    const arrivalStamps = new Map<number, { level: number; turn: number }>();
    bus.on("dungeonlevel", (_type, event) => {
      if (!arrivalStamps.has(event.depth)) {
        arrivalStamps.set(event.depth, { level: state.actor.player.lev, turn: state.turn });
      }
    });

    /* The journal, on the same seams the plugin wires: this character's slot,
     * the events domain, and stamps read from the live game at the arrival. */
    const slot = characterSlot();
    const journal = installWarriorJournal({
      slot,
      log: say,
      events: eventsOverBus(bus),
      stamps: async () => ({ level: state.actor.player.lev, turn: state.turn }),
    });

    /* The host's duty for the session's first arrival: exactly once, after
     * the listeners are attached and before the first changeLevel. */
    game.announceArrival();

    const resolver = new ContentIdResolver({
      objects: game.booted.registries.objects,
      playerRaces: game.players.races,
      playerClasses: game.players.classes,
    });
    const borg = createBorg({
      /* The Borg's private stream, varied with the game seed exactly as the
       * T04 harness varies it: the chain must not share one draw sequence. */
      rngSeed: (seed * 2654435761) >>> 0 || 1,
      resolvers: makeCoreResolvers({
        races: game.booted.registries.monsters.races,
        objects: game.booted.registries.objects,
        state: state as never,
        blowMethods: game.booted.registries.monsters.blowMethods.values(),
      }),
    });

    /* The latch the host installs (main.ts): runGameLoop asks nextCommand for
     * as long as the player has energy, so a controller that always answers
     * never lets the loop return. */
    let armed = false;
    const commands: Record<string, number> = {};
    installController(
      state,
      (view, act) => {
        if (!armed) return null;
        armed = false;
        const cmd = borg.controller(view, act);
        if (cmd) commands[cmd.code] = (commands[cmd.code] ?? 0) + 1;
        return cmd;
      },
      { viewDeps: { resolver, reg: game.booted.registries.objects } },
    );

    /* Observed depths come from the live chunk, after every decision and
     * after every level change, like the T04 harness's own `depths` set. */
    const depths = new Set<number>([state.chunk.depth]);
    let dead = false;
    let taken = 0;
    for (; taken < options.capFor(seed); taken++) {
      armed = true;
      const status = runGameLoop(state, game.registry);
      depths.add(state.chunk.depth);
      if (status === LOOP_STATUS.DEAD) {
        dead = true;
        break;
      }
      if (status === LOOP_STATUS.DEATH_CONFIRM) {
        state.pendingDeath?.resolve(true);
        continue;
      }
      if (status === LOOP_STATUS.LEVEL_CHANGE) {
        game.changeLevel(state.targetDepth ?? state.chunk.depth + 1);
        state.generateLevel = false;
        depths.add(state.chunk.depth);
      }
    }

    /* The graveyard entry for this life, BEFORE anything that would stand in
     * for the loop's create (here: the next iteration's startGame) - the
     * record cannot be lost to a teardown that follows. */
    if (dead) await journal.graveyard(runReportOf(state, "death"));
    /* The load re-fire the docs warn about (MOD_SEAMS 4l and 4w): every depth the
     * character visited, re-announced as a session's first level the way a
     * loaded save re-announces it. The dedup rule must leave the milestones
     * untouched; the assertion lives in the test, over the slot's contents. */
    for (const depth of depths) {
      bus.emit("dungeonlevel", { depth, levelId: state.levelSerial ?? 0, cause: "load", arena: false } satisfies DungeonLevelEventData);
    }
    await journal.stop();

    lives.push({
      seed,
      dead,
      decisions: taken,
      turns: state.turn,
      maxDepth: state.actor.player.maxDepth,
      endDepth: state.chunk.depth,
      clvl: state.actor.player.lev,
      kills: killsOf(state),
      gold: state.actor.player.au,
      causeOfDeath: dead ? state.actor.player.diedFrom : null,
      race: state.actor.player.race.name,
      className: state.actor.player.cls.name,
      baseStats: [...state.actor.player.statBirth],
      commands,
      depthsVisited: [...depths].sort((a, b) => a - b),
      arrivalStamps,
      journal: parseJournal(slot.held()),
    });
  }

  return { lives };
}
