/**
 * A fake game for the API 2 bridge: a `ModApi2` object whose known world is built
 * from a harness scenario (harness.ts), so a test drives the bridge and the
 * built plugin.js the way the game does, with calls that answer with results.
 *
 * The scenario's AgentView is the source of truth. The known world is read back
 * out of it: the remembered level is every cell the view reports, and the known
 * monsters are its monsters with full health. `truth` is a separate switch,
 * because the Borg must play both with and without the hidden reads.
 */

import type {
  Api2InputState,
  Api2Intent,
  Api2PromptAnswer,
  JsonRecord,
  KnownItem,
  KnownMonster,
  KnownPlayer,
  KnownToken,
  KnownWorldData,
  LoadoutChange,
  LoadoutSimulation,
  ModApi2,
} from "@rpgm-tools/neo-angband-mod-sdk";
import type { AgentView, ItemView, MonsterView } from "@rpgm-tools/neo-angband-core";
import { makeScenarioView, type Scenario } from "./harness.js";

const ok = <T,>(value: T): Promise<{ readonly ok: true; readonly value: T }> => Promise.resolve({ ok: true as const, value });
const refused = (message: string) => Promise.resolve({ ok: false as const, reason: "refused" as const, code: "refused", message });

export interface FakeGameOptions {
  readonly scenario?: Scenario;
  readonly flags?: Readonly<Record<string, boolean>>;
  /** Whether the game gives the mod the hidden reads. */
  readonly truth?: boolean;
  /** Whether the game gives the mod an engine to bind. Default true. */
  readonly engine?: unknown;
  readonly noscore?: number;
  readonly armed?: boolean;
  /** How `act.submit` answers a command. Default: accepts everything. */
  readonly submit?: (intent: Api2Intent) => boolean;
}

export interface FakeGame {
  readonly mod: ModApi2;
  readonly view: AgentView;
  readonly logs: string[];
  readonly submitted: { readonly token: KnownToken; readonly intent: Api2Intent }[];
  readonly answered: { readonly promptId: number; readonly answer: Api2PromptAnswer }[];
  readonly released: string[];
  readonly truthCalls: string[];
  /** The listeners the mod subscribed, by event name, and the ones it removed. */
  readonly listeners: Map<string, (payload: never) => void>;
  readonly unsubscribed: string[];
  readonly installSlot: { value: unknown };
  /** The input wait the game would hand the controller. */
  input(over?: Partial<Api2InputState>): Api2InputState;
}

const TOKEN: KnownToken = { epoch: 1, revision: 1 };

function knownItem(item: ItemView): KnownItem {
  const { timeout, ...rest } = item as ItemView & { timeout: number };
  return { baseName: item.label, carried: true, unknownRunes: false, charging: timeout, ...rest } as unknown as KnownItem;
}

function knownMonster(monster: MonsterView): KnownMonster {
  return {
    blows: [],
    spellFrequency: null,
    innateFrequency: null,
    averageHp: monster.maxHp,
    id: monster.id,
    race: monster.race,
    raceIndex: monster.raceIndex,
    grid: monster.grid,
    visible: monster.visible,
    health: "unhurt",
    living: true,
    status: [],
    look: "unhurt",
    raceLevel: monster.level,
    raceSpeed: monster.speed,
    knownFlags: monster.raceFlags,
    knownSpells: monster.knownSpellFlags,
    unique: monster.unique,
    questGuardian: monster.questGuardian,
    finalGuardian: monster.finalGuardian,
  } as KnownMonster;
}

export function knownWorld(view: AgentView, noscore = 0): KnownWorldData {
  const player = view.player();
  const clear = { timed: {}, foodGrade: null, food: player.status.food / 100, fearful: false } as Record<string, unknown>;
  for (const key of Object.keys(player.status)) if (!(key in clear)) clear[key] = null;
  const known = {
    ...player,
    status: clear,
    recall: false,
    descent: false,
    noscore,
    shopnum: null,
    autoplayed: (noscore & 0x20) !== 0,
    key: null,
  } as unknown as KnownPlayer;
  const { width, height } = view.mapBounds();
  const cells = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = view.cell(x, y);
      if (cell === null || !cell.known) continue;
      cells.push({
        x,
        y,
        remembered: { feat: cell.feat, passable: cell.passable, traps: [], objects: [], items: null },
        visible: cell.inView,
        lit: cell.inView ? cell.glow : null,
        seen: true,
        glow: cell.glow,
      });
    }
  }
  return {
    version: 1,
    token: TOKEN,
    turn: view.turn(),
    player: known,
    inventory: view.inventory().map(knownItem),
    equipment: view.equipment().map((item) => (item === null ? null : knownItem(item))),
    quiver: (view.quiver?.() ?? []).map(knownItem),
    floorHere: view.floorItems(player.grid.x, player.grid.y).map(knownItem),
    monsters: view.monsters().map(knownMonster),
    monstersHidden: null,
    target: null,
    targetReadable: true,
    level: { token: TOKEN, levelId: 1, depth: player.depth, width, height, cells },
    stores: [],
    spellbooks: view.spellbooks(),
    equipmentSlots: [],
  } as unknown as KnownWorldData;
}

export function fakeGame(options: FakeGameOptions = {}): FakeGame {
  const view = makeScenarioView(options.scenario);
  const logs: string[] = [];
  const submitted: FakeGame["submitted"][number][] = [];
  const answered: FakeGame["answered"][number][] = [];
  const released: string[] = [];
  const truthCalls: string[] = [];
  const listeners = new Map<string, (payload: never) => void>();
  const unsubscribed: string[] = [];
  const installSlot = { value: null as unknown };
  const noscore = options.noscore ?? 0;

  const input = (over: Partial<Api2InputState> = {}): Api2InputState =>
    ({ token: TOKEN, driver: "mod", phase: "play", messagePending: false, prompt: null, resting: null, running: false, repeating: false, repeatsLeft: 0, unignoring: false, messages: null, storeStatus: null, ...over }) as unknown as Api2InputState;

  const truth =
    options.truth === true
      ? {
          monsters: () => {
            truthCalls.push("monsters");
            return ok(view.monsters().map((monster) => ({ ...monster, perceived: monster.visible })));
          },
          race: (index: number) => {
            truthCalls.push(`race ${String(index)}`);
            return ok({ ridx: index, flags: [], spells: [], blows: [{ dice: 1, sides: 4, effect: "HURT" }], level: 1, sleep: 0, spellPower: 1, freqInnate: 0, freqSpell: 0, hasFriends: false });
          },
          level: () => {
            truthCalls.push("level");
            return refused("the Borg must not read this");
          },
          storeKnowledge: () => {
            truthCalls.push("storeKnowledge");
            return refused("the Borg must not read this");
          },
        }
      : undefined;

  const mod = {
    engine: options.engine === undefined ? { api: "1", core: undefined, state: { actor: { player: { noscore } } }, registries: undefined } : options.engine,
    meta: { id: "borg", api: "2.0.0", engine: "1.22.0", tier: "first-party", flags: options.flags ?? {}, newCharacter: false, controllerArmed: options.armed ?? false, log: (message: string) => logs.push(message) },
    view: {
      world: () => ok(knownWorld(view, noscore)),
      input: () => ok(input()),
      simulateLoadout: (_change: LoadoutChange) => refused("no simulation in the fake game") as Promise<{ ok: false } & { ok: boolean }>,
    },
    act: {
      submit: (token: KnownToken, intent: Api2Intent) => {
        submitted.push({ token, intent });
        return options.submit === undefined || options.submit(intent) ? ok(null) : refused("the game refused the command");
      },
      answer: (promptId: number, answer: Api2PromptAnswer) => {
        answered.push({ promptId, answer });
        return ok(null);
      },
      controller: { release: (reason: string) => { released.push(reason); return ok(null); } },
    },
    events: {
      on: (name: string, listener: (payload: never) => void) => {
        listeners.set(name, listener);
        return ok({ id: name });
      },
      off: (subscription: { id: string }) => {
        unsubscribed.push(subscription.id);
        return ok(null);
      },
    },
    content: {
      records: (_file: string): ReturnType<ModApi2["content"]["records"]> => ok([] as readonly JsonRecord[]),
      activation: () => ok(null),
    },
    store: { install: { get: () => ok(installSlot.value), set: (value: unknown) => { installSlot.value = value; return ok(null); } } },
    ...(truth === undefined ? {} : { truth }),
  } as unknown as ModApi2;

  void (null as unknown as LoadoutSimulation);
  return { mod, view, logs, submitted, answered, released, truthCalls, listeners, unsubscribed, installSlot, input };
}
