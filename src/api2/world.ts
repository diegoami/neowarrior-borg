/**
 * The game as the Borg's decision code reads it, built from one reading of the
 * known world.
 *
 * The decision code is written against a synchronous view (`AgentView`): it asks
 * for the player, a grid, the pack, in the middle of a ladder. Every API 2 call
 * answers with a result, so a decision starts with `readWorld`, which reads the
 * known world once, adds the few hidden reads the Borg is allowed (truth.ts),
 * and returns a view over that one reading.
 *
 * Where the known world says less than the API 1 view did, this file fills the
 * gap from what the player can know:
 *
 * - The map is the remembered map. A square never seen is not passable, has no
 *   feature and holds no trap, and a secret door reads as the granite the player
 *   sees. The API 1 view gave the real terrain here (#415).
 * - A timed effect is the lowest duration in the grade the status line names, so
 *   a check against a grade boundary answers as API 1 did and a check inside a
 *   grade does not. Food is the status line's percentage times 100.
 * - No square glows unless the known level says so.
 * - An item's timeout is the number its name says are charging. A light's fuel is
 *   read from the known item.
 * - Monsters come from `truth` when the game gives the mod that domain: exact
 *   numbers for the monsters the character perceives. Without it they come from
 *   the known world, with hit points taken from the health band and the race's
 *   average.
 */

import type { KnownItem, KnownLevelCell, KnownMonster, KnownPlayer, KnownStoreItem, KnownWorldData, LoadoutSimulation, ModApi2 } from "@rpgm-tools/neo-angband-mod-sdk";
import type { AgentView, CellView, GameConstants, ItemView, LoadoutSimulation as CoreLoadoutSimulation, MonsterView, PlayerView, StoreItemView, StoreView } from "@rpgm-tools/neo-angband-core";
import type { MessageFeed } from "./feed.js";
import type { ActivationBook, LoadoutBook, RaceBook } from "./caches.js";
import { gearSignature } from "./caches.js";
import { TIMED_RECORDS, valueOf, type GradeFloors } from "./records.js";
import type { BorgTruth } from "./truth.js";

/** Removes `readonly` all the way down, so known-world data can stand in for the API 1 view types. */
type Writable<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? Writable<U>[]
    : T extends object
      ? { -readonly [K in keyof T]: Writable<T[K]> }
      : T;

function writable<T>(value: T): Writable<T> {
  return structuredClone(value) as Writable<T>;
}

/** What never changes during a session, read once when the mod starts. */
export interface Statics {
  readonly constants: GameConstants;
  readonly floors: GradeFloors;
  /** Whether each trap kind, by index, is a trap in the disarm command's sense. */
  readonly trapKinds: readonly boolean[];
  /** The cost of each object kind, by kind index. */
  readonly kindCosts: readonly number[];
}

/** Everything one reading of the world needs from the mod around it. */
export interface WorldReads {
  readonly statics: Statics;
  readonly races: RaceBook;
  readonly activations: ActivationBook;
  readonly loadouts: LoadoutBook;
  readonly truth: BorgTruth | null;
  readonly messages: MessageFeed | undefined;
}

/** What the resolvers answer from, as of the last reading. */
export interface WorldFacts {
  /** Index into the stores of the shop entrance the character stands on, or null. */
  readonly shopnum: number | null;
  /** The cost and awareness of each object kind the character can see, by "tval:sval". */
  readonly kinds: ReadonlyMap<string, { readonly cost: number; readonly aware: boolean }>;
}

export interface World {
  readonly view: AgentView;
  readonly facts: WorldFacts;
}

/* The player. */

/** A known player as the API 1 player view, with each timed effect at the floor of its named grade. */
export function playerView(known: KnownPlayer, floors: GradeFloors): PlayerView {
  const { status, recall, descent, ...rest } = writable(known);
  const timed = {} as Record<keyof typeof TIMED_RECORDS, number>;
  for (const [field, record] of Object.entries(TIMED_RECORDS) as [keyof typeof TIMED_RECORDS, string][]) {
    const grade = status[field];
    /* A grade the records do not name (an older or patched file) still says the effect is on. */
    timed[field] = grade === null ? 0 : (floors.get(record)?.get(grade) ?? 1);
  }
  return { ...rest, status: { ...timed, food: status.food * 100, fearful: status.fearful }, recall: recall ? 1 : 0, descent: descent ? 1 : 0 };
}

/* Items. */

export function itemView(item: KnownItem): ItemView {
  const { charging, fuel, unknownRunes: _unknownRunes, ...rest } = writable(item);
  /* A light's fuel and a rod's recharge both read as the timeout, as they did under API 1. */
  return { ...rest, timeout: fuel ?? charging };
}

function storeItemView(item: KnownStoreItem): StoreItemView {
  const { index, price } = item;
  return { ...itemView(item), index, ...(price === undefined ? {} : { price }) };
}

/* Monsters. */

/** A health band's middle, as a share of full health, inside the band the look command draws. */
const BAND_SHARE: Readonly<Record<KnownMonster["health"], number>> = { unhurt: 1, somewhat: 0.8, wounded: 0.42, badly: 0.17, almost: 0.05 };

/** A monster as the known world shows it, for a game that gives the mod no `truth`. */
function knownMonsterView(monster: KnownMonster): MonsterView {
  const has = (status: KnownMonster["status"][number]): boolean => monster.status.includes(status);
  const maxHp = monster.averageHp !== null && monster.averageHp > 0 ? monster.averageHp : 100;
  const hp = monster.health === "unhurt" ? maxHp : Math.min(maxHp - 1, Math.max(1, Math.round(maxHp * BAND_SHARE[monster.health])));
  const view: MonsterView = {
    id: monster.id,
    race: monster.race,
    raceIndex: monster.raceIndex,
    grid: { x: monster.grid.x, y: monster.grid.y },
    visible: monster.visible,
    hp,
    maxHp,
    speed: monster.raceSpeed,
    asleep: has("asleep"),
    afraid: has("afraid"),
    confused: has("confused"),
    stunned: has("stunned"),
    level: monster.raceLevel,
    poisoned: false,
    raceFlags: [...monster.knownFlags],
    unique: monster.unique,
    questGuardian: monster.questGuardian,
    finalGuardian: monster.finalGuardian,
    spellFlags: [...monster.knownSpells],
    knownSpellFlags: [...monster.knownSpells],
  };
  if (monster.raceId !== undefined) view.raceId = monster.raceId;
  if (monster.glyph !== undefined) view.glyph = monster.glyph;
  return view;
}

/**
 * The monsters the Borg sees. Each perceived monster is the truth read's exact
 * numbers under the id the known world gave it, because that id is the one a
 * target intent takes. A perceived monster the known world does not list has no
 * id a command can name, so it is left out.
 */
async function monsterViews(known: KnownWorldData, reads: WorldReads): Promise<MonsterView[]> {
  const listed = known.monsters ?? [];
  if (reads.truth === null) return listed.map(knownMonsterView);
  const real = await reads.truth.perceivedMonsters();
  if (real === null) return listed.map(knownMonsterView);
  const byGrid = new Map<string, KnownMonster>();
  for (const monster of listed) byGrid.set(`${String(monster.grid.x)},${String(monster.grid.y)}`, monster);
  const out: MonsterView[] = [];
  for (const monster of real) {
    const named = byGrid.get(`${String(monster.grid.x)},${String(monster.grid.y)}`);
    if (named === undefined || named.raceIndex !== monster.raceIndex) continue;
    const view: MonsterView = {
      id: named.id,
      race: monster.race,
      raceIndex: monster.raceIndex,
      grid: { x: monster.grid.x, y: monster.grid.y },
      visible: monster.visible,
      hp: monster.hp,
      maxHp: monster.maxHp,
      speed: monster.speed,
      asleep: monster.asleep,
      afraid: monster.afraid,
      confused: monster.confused,
      stunned: monster.stunned,
      level: monster.level,
      poisoned: monster.poisoned,
      raceFlags: [...monster.raceFlags],
      unique: monster.unique,
      questGuardian: monster.questGuardian,
      finalGuardian: monster.finalGuardian,
      spellFlags: [...monster.spellFlags],
      knownSpellFlags: [...monster.knownSpellFlags],
    };
    if (monster.raceId !== undefined) view.raceId = monster.raceId;
    if (monster.glyph !== undefined) view.glyph = monster.glyph;
    out.push(view);
  }
  return out;
}

/* Hypothetical loadouts. */

/** An API 2 simulation as the shape the Borg's self-model reads; it reads only `after`. */
export function simulationView(floors: GradeFloors): (simulation: LoadoutSimulation) => CoreLoadoutSimulation {
  const loadout = (view: LoadoutSimulation["before"]) => ({
    player: playerView(view.player, floors),
    equipment: view.equipment.map((item) => (item === null ? null : itemView(item))),
    inventory: view.inventory.map(itemView),
    stats: writable(view.stats),
  });
  return (simulation) =>
    ({
      before: loadout(simulation.before),
      after: loadout(simulation.after),
      delta: writable(simulation.delta),
      placements: simulation.placements.map((placement) => ({ slot: placement.slot, worn: itemView(placement.worn), displaced: placement.displaced === null ? null : itemView(placement.displaced) })),
      unresolved: writable(simulation.unresolved),
    }) as unknown as CoreLoadoutSimulation;
}

/* The view. */

type Api2Reads = Pick<ModApi2, "view" | "content">;

/**
 * The game as the player knows it, as the AgentView the decision code is written
 * against. Null when the known world or the player cannot be read.
 */
export async function readWorld(api: Api2Reads, reads: WorldReads): Promise<World | null> {
  const known: KnownWorldData | null = await valueOf(api.view.world());
  if (known === null || known.player === null) return null;

  const { statics } = reads;
  const player = playerView(known.player, statics.floors);
  const inventory = (known.inventory ?? []).map(itemView);
  const equipment = (known.equipment ?? []).map((item) => (item === null ? null : itemView(item)));
  const quiver = (known.quiver ?? []).map(itemView);
  const floorHere = (known.floorHere ?? []).map(itemView);
  const monsters = await monsterViews(known, reads);
  if (reads.truth !== null) await reads.races.ensure(reads.truth, monsters.map((monster) => monster.raceIndex));
  await reads.activations.ensure(api, equipment);
  reads.loadouts.begin(gearSignature(known.inventory ?? [], known.equipment ?? [], known.stores ?? [], known.player));

  const width = known.level?.width ?? 0;
  const height = known.level?.height ?? 0;
  const cells = new Map<number, KnownLevelCell>();
  for (const cell of known.level?.cells ?? []) cells.set(cell.y * width + cell.x, cell);
  const occupants = new Map<number, number>();
  for (const monster of monsters) occupants.set(monster.grid.y * width + monster.grid.x, monster.id);

  const cell = (x: number, y: number): CellView | null => {
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    const occupant = player.grid.x === x && player.grid.y === y ? -1 : (occupants.get(y * width + x) ?? 0);
    const remembered = cells.get(y * width + x);
    if (remembered === undefined) {
      return { x, y, feat: 0, passable: false, inView: false, known: false, monster: occupant, objectCount: 0, knownObjectCount: 0, glow: false, trap: false };
    }
    const memory = remembered.remembered;
    const view: CellView = {
      x,
      y,
      feat: memory.feat,
      passable: memory.passable,
      inView: remembered.visible,
      known: true,
      monster: occupant,
      objectCount: memory.objects.length,
      knownObjectCount: memory.objects.length,
      glow: remembered.glow,
      /* The disarm command's own check: a visible trap whose kind is a TRAP and that is not disabled. */
      trap: memory.traps.some((trap) => !trap.disabled && statics.trapKinds[trap.index] === true),
    };
    if (memory.featCode !== undefined) view.featCode = memory.featCode;
    return view;
  };

  const kinds = new Map<string, { cost: number; aware: boolean }>();
  const noteKinds = (items: readonly ItemView[]): void => {
    for (const item of items) {
      const index = /^kind:(\d+)$/.exec(item.kindKey);
      if (!item.aware || index === null) continue;
      kinds.set(`${String(item.tval)}:${String(item.sval)}`, { cost: statics.kindCosts[Number(index[1])] ?? 0, aware: true });
    }
  };
  noteKinds(inventory);
  noteKinds(quiver);
  noteKinds(floorHere);
  noteKinds(equipment.filter((item): item is ItemView => item !== null));
  const floorOf = (x: number, y: number): ItemView[] => (cells.get(y * width + x)?.remembered.items ?? []).map(itemView);
  for (const remembered of cells.values()) noteKinds((remembered.remembered.items ?? []).map(itemView));

  const view: AgentView = {
    apiVersion: "2.0.0",
    turn: () => known.turn ?? 0,
    player: () => writable(player),
    monsters: () => monsters.map((monster) => writable(monster)),
    cell,
    mapBounds: () => ({ width, height }),
    inventory: () => [...inventory],
    quiver: () => [...quiver],
    equipment: () => [...equipment],
    floorItems: (x, y) => (x === player.grid.x && y === player.grid.y ? [...floorHere] : floorOf(x, y)),
    target: () => (known.target === null ? null : { midx: known.target.monster ?? 0, grid: { x: known.target.grid.x, y: known.target.grid.y } }),
    messages: () => reads.messages?.drain() ?? [],
    stores: () => (known.stores ?? []).map((store): StoreView => ({ ...writable(store), stock: store.stock.map(storeItemView) })),
    spellbooks: () => (known.spellbooks ?? []).map((book) => writable(book)),
    constants: () => ({ ...statics.constants }),
    inputToken: () => ({ epoch: known.token.epoch, revision: known.token.revision }),
    simulateLoadout: (change) => reads.loadouts.answer(change as never),
  };
  return { view, facts: { shopnum: known.player.shopnum, kinds } };
}
