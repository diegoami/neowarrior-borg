/**
 * The bridge between the game's API 2 and the synchronous decision code.
 *
 * plugin.test.ts drives the built file end to end; these cover the pieces the
 * decisions lean on and cannot show failing on their own: the world read once per
 * decision, what the Borg sees with and without the hidden reads, the message
 * feed, and the caches that answer in the middle of a decision.
 */

import { describe, expect, it } from "vitest";
import * as Core from "@rpgm-tools/neo-angband-core";
import type { KnownItem, LoadoutChange } from "@rpgm-tools/neo-angband-mod-sdk";
import { fakeGame, type FakeGame } from "../harness-api2.js";
import type { Scenario } from "../harness.js";
import { createBridge, type Bridge } from "./host.js";
import { LoadoutBook, RaceBook, SIMULATIONS_PER_ROUND, gearSignature } from "./caches.js";
import { borgTruth } from "./truth.js";

const SCENARIO: Scenario = {
  player: { grid: { x: 5, y: 5 }, depth: 3 },
  monsters: [
    { grid: { x: 6, y: 5 }, raceIndex: 42, hp: 7, maxHp: 10 },
    { grid: { x: 9, y: 9 }, raceIndex: 43, hp: 5, maxHp: 5 },
  ],
};

async function primed(options: Parameters<typeof fakeGame>[0] = {}): Promise<{ game: FakeGame; bridge: Bridge }> {
  const game = fakeGame({ scenario: SCENARIO, engine: { api: "1", core: Core, state: { actor: { player: { noscore: 0 } } } }, ...options });
  const bridge = createBridge(game.mod);
  await bridge.prime();
  return { game, bridge };
}

describe("the bridge", () => {
  it("will not prime without an engine, and says so", async () => {
    const game = fakeGame({ scenario: SCENARIO });
    (game.mod as { engine?: unknown }).engine = undefined;
    await expect(createBridge(game.mod).prime()).rejects.toThrow(/no engine/u);
  });

  it("reads nothing before it is primed", async () => {
    const game = fakeGame({ scenario: SCENARIO });
    expect(await createBridge(game.mod).readWorld()).toBeNull();
  });

  it("builds the view from one read of the world", async () => {
    const { bridge } = await primed();
    const world = (await bridge.readWorld())!;
    const player = world.view.player();
    expect(player.grid).toEqual({ x: 5, y: 5 });
    expect(player.depth).toBe(3);
    expect(world.view.monsters().map((monster) => monster.raceIndex).sort()).toEqual([42, 43]);
  });

  it("plays the known world when the game gives no truth domain, and asks for no hidden read", async () => {
    const { game, bridge } = await primed({ truth: false });
    expect(bridge.hasTruth).toBe(false);
    await bridge.readWorld();
    expect(game.truthCalls).toEqual([]);
  });

  it("reads exact monsters and each race once when the game gives the truth domain", async () => {
    const { game, bridge } = await primed({ truth: true });
    expect(bridge.hasTruth).toBe(true);
    await bridge.readWorld();
    await bridge.readWorld();
    expect(game.truthCalls.filter((call) => call === "monsters")).toHaveLength(2);
    expect(game.truthCalls.filter((call) => call.startsWith("race ")).sort()).toEqual(["race 42", "race 43"]);
    expect(game.truthCalls.filter((call) => call === "level" || call === "storeKnowledge")).toEqual([]);
  });

  it("collects messages between decisions and hands each one over once", async () => {
    const { game, bridge } = await primed();
    const listener = game.listeners.get("message") as unknown as (event: { text: string }) => void;
    listener({ text: "It bites you." });
    listener({ text: "You feel better." });
    const world = (await bridge.readWorld())!;
    expect(world.view.messages?.()).toEqual(["It bites you.", "You feel better."]);
    expect(world.view.messages?.()).toEqual([]);
  });

  it("stops listening on dispose", async () => {
    const { game, bridge } = await primed();
    await bridge.dispose();
    expect(game.unsubscribed).toEqual(["message"]);
  });

  it("answers the shop signal and prices from the last read", async () => {
    const { bridge } = await primed();
    await bridge.readWorld();
    const seams = bridge.resolverInput();
    expect(seams.shopnum?.()).toBeNull();
    expect(seams.kindCost?.(75, 1)).toBeNull();
  });
});

describe("the truth allowlist wrapper", () => {
  it("reads only the monsters the character perceives", async () => {
    const game = fakeGame({ scenario: SCENARIO, truth: true });
    const truth = borgTruth(game.mod)!;
    const seen = (await truth.perceivedMonsters())!;
    expect(seen.every((monster) => monster.perceived)).toBe(true);
  });

  it("is absent without the domain", () => {
    expect(borgTruth(fakeGame({ scenario: SCENARIO }).mod)).toBeNull();
  });
});

describe("the race cache", () => {
  it("asks once per race, remembers a miss, and never asks a race twice", async () => {
    const calls: number[] = [];
    const truth = {
      perceivedMonsters: () => Promise.resolve([]),
      race: (index: number) => {
        calls.push(index);
        return Promise.resolve(index === 9 ? null : ({ ridx: index, flags: ["EVIL"], spells: [3, 1], blows: [{ dice: 1, sides: 6, effect: "HURT" }], level: 4, sleep: 10, spellPower: 2, freqInnate: 0, freqSpell: 5, hasFriends: true } as never));
      },
    };
    const book = new RaceBook();
    await book.ensure(truth, [1, 1, 9]);
    await book.ensure(truth, [1, 9, 2]);
    expect(calls.sort()).toEqual([1, 2, 9]);
    expect(book.get(1)?.flags.has("EVIL")).toBe(true);
    expect(book.get(1)?.spells).toEqual([1, 3]);
    expect(book.get(9)).toBeUndefined();
  });
});

describe("the loadout cache", () => {
  const change = (n: number): LoadoutChange => ({ add: [{ slot: n }] }) as unknown as LoadoutChange;
  const answerOf = (n: number) => ({ n }) as never;
  const same = (value: unknown): never => value as never;

  /** A game that answers every question, and counts the asks. */
  function game() {
    const asked: string[] = [];
    return {
      asked,
      api: {
        view: {
          simulateLoadout: (c: LoadoutChange) => {
            asked.push(JSON.stringify(c));
            return Promise.resolve({ ok: true as const, value: answerOf(Object.keys(c).length === 0 ? 0 : 1) });
          },
        },
      } as never,
    };
  }

  it("says it does not know on the first ask, and records the question and the baseline", () => {
    const book = new LoadoutBook();
    book.begin("gear");
    expect(book.answer(change(1))).toBeNull();
    expect(book.pending).toBe(true);
  });

  it("answers after one round, and withholds a candidate until the baseline is known", async () => {
    const book = new LoadoutBook();
    const { api, asked } = game();
    book.begin("gear");
    book.answer(change(1));
    expect(await book.settle(api, same)).toBe(2);
    expect(asked).toHaveLength(2);
    expect(book.answer(change(1))).not.toBeNull();
    expect(book.answer({})).not.toBeNull();
    expect(book.pending).toBe(false);
  });

  it("does not ask the same question twice", async () => {
    const book = new LoadoutBook();
    const { api, asked } = game();
    book.begin("gear");
    book.answer(change(1));
    await book.settle(api, same);
    book.answer(change(1));
    expect(book.pending).toBe(false);
    expect(await book.settle(api, same)).toBe(0);
    expect(asked).toHaveLength(2);
  });

  it("reads at most a round's worth of questions at once", async () => {
    const book = new LoadoutBook();
    const { api, asked } = game();
    book.begin("gear");
    for (let n = 0; n < SIMULATIONS_PER_ROUND + 20; n++) book.answer(change(n));
    await book.settle(api, same);
    expect(asked).toHaveLength(SIMULATIONS_PER_ROUND);
    expect(book.pending).toBe(true);
  });

  it("drops every answer when the gear changes", async () => {
    const book = new LoadoutBook();
    const { api } = game();
    book.begin("gear");
    book.answer(change(1));
    await book.settle(api, same);
    book.begin("gear");
    expect(book.answer(change(1))).not.toBeNull();
    book.begin("other gear");
    expect(book.answer(change(1))).toBeNull();
  });

  it("throws away an answer that arrives after the gear moved", async () => {
    const book = new LoadoutBook();
    book.begin("gear");
    book.answer(change(1));
    const slow = {
      view: {
        simulateLoadout: () => {
          book.begin("moved");
          return Promise.resolve({ ok: true as const, value: answerOf(1) });
        },
      },
    } as never;
    expect(await book.settle(slow, same)).toBe(0);
    expect(book.size).toBe(0);
  });

  it("keeps a refused question unanswered rather than inventing an answer", async () => {
    const book = new LoadoutBook();
    book.begin("gear");
    book.answer(change(1));
    const refusing = { view: { simulateLoadout: () => Promise.resolve({ ok: false as const, reason: "refused", code: "x", message: "no" }) } } as never;
    expect(await book.settle(refusing, same)).toBe(0);
    expect(book.answer(change(1))).toBeNull();
  });
});

describe("the gear signature", () => {
  const item = (over: Record<string, unknown>): KnownItem => ({ handle: 1, kindKey: "k", number: 1, toH: 0, toD: 0, toA: 0, ...over }) as unknown as KnownItem;

  it("moves when the pack, the worn set, a store's stock or the level does, and not otherwise", () => {
    const base = gearSignature([item({})], [null], [{ feat: 1, stock: [item({})] }], null);
    expect(gearSignature([item({})], [null], [{ feat: 1, stock: [item({})] }], null)).toBe(base);
    expect(gearSignature([item({ number: 2 })], [null], [{ feat: 1, stock: [item({})] }], null)).not.toBe(base);
    expect(gearSignature([item({})], [item({ handle: 2 })], [{ feat: 1, stock: [item({})] }], null)).not.toBe(base);
    expect(gearSignature([item({})], [null], [{ feat: 1, stock: [] }], null)).not.toBe(base);
    expect(gearSignature([item({})], [null], [{ feat: 2, stock: [item({})] }], null)).not.toBe(base);
  });
});
