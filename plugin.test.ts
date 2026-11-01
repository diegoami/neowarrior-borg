/**
 * The SHIPPED ARTEFACT plays the game.
 *
 * Every other test in this repository imports TypeScript out of src/. plugin.js
 * is what a player downloads: a single bundled file, built by esbuild, with the
 * engine deliberately NOT in it. Those are different artefacts, and the
 * difference is exactly where this mod's design could fail silently.
 *
 * Specifically: src/core-api.ts hands out FEAT, TV and four other engine symbols
 * as ESM live bindings that `bindCore` fills. That works in TypeScript under
 * vitest. Whether it still works after esbuild has hoisted every module into one
 * scope is a separate question, and the failure mode if it does not is not an
 * exception - it is FEAT reading `undefined` inside a decision ladder, which
 * looks like the Borg playing badly. So this test drives the bundle, through a
 * fake game (src/harness-api2.ts) that answers every API 2 call.
 *
 * It also pins what the host relies on and the type system cannot check across
 * the bundle boundary: that the default export really is an API 2 mod, and that
 * the Borg is offered the keyboard only for a character handed to it.
 */

import { afterEach, describe, expect, it } from "vitest";
import * as Core from "@rpgm-tools/neo-angband-core";
import type { Api2ControllerContext, Api2ModDefinition, Api2Prompt } from "@rpgm-tools/neo-angband-mod-sdk";
import { fakeGame, type FakeGame, type FakeGameOptions } from "./src/harness-api2.js";
import type { Scenario } from "./src/harness.js";

/* The BUILT file, on purpose. If plugin.js is stale or missing this fails, which
 * is correct: `pnpm check` proves it is a current build of the source, and
 * this proves the thing that check blessed actually runs. */
const built = ((await import("./plugin.js")) as unknown as { default: Api2ModDefinition }).default;

const NOSCORE_BORG = 0x0020;

const FIGHT: Scenario = {
  player: { grid: { x: 5, y: 5 }, depth: 3 },
  monsters: [{ grid: { x: 6, y: 5 }, raceIndex: 42, hp: 10, maxHp: 10 }],
};

const started: FakeGame[] = [];

function engine(noscore = 0): unknown {
  return { api: "1", core: Core, state: { actor: { player: { noscore } } }, registries: undefined };
}

/** Start the built mod against a fake game, as the game does when the mod loads. */
async function begin(options: FakeGameOptions = {}): Promise<FakeGame> {
  const game = fakeGame({ engine: engine(options.noscore ?? NOSCORE_BORG), scenario: FIGHT, ...options });
  started.push(game);
  await built.start!(game.mod);
  return game;
}

async function tick(game: FakeGame, over: Parameters<FakeGame["input"]>[0] = {}): Promise<void> {
  await built.controller!(game.mod, game.input(over));
}

const said = (game: FakeGame): string => game.logs.join(" ");

afterEach(async () => {
  started.length = 0;
  await built.stop?.();
});

describe("the built plugin.js", () => {
  it("is an API 2 mod with a controller, a start and a stop, and no hooks", () => {
    expect(built.api).toBe(">=2.0.0 <3.0.0");
    expect(built.hooks).toBeUndefined();
    expect(typeof built.start).toBe("function");
    expect(typeof built.stop).toBe("function");
    expect(typeof built.controller).toBe("function");
    expect(typeof built.armed).toBe("function");
  });

  it("offers the keyboard only to a character handed to it", () => {
    /* Installing and enabling the Borg must not hand it your character. An
     * autoplayer that starts because the mod is present eats a save the first
     * time someone browses the mod list. Ctrl-Z marks the save, and the title
     * row arms the controller; without either, the human keeps the keyboard. */
    const context = (armed: boolean, noscore: number): Api2ControllerContext => ({ armed, engine: engine(noscore) }) as unknown as Api2ControllerContext;
    expect(built.armed?.(context(false, 0))).toBe(false);
    expect(built.armed?.(context(true, 0))).toBe(true);
    expect(built.armed?.(context(false, NOSCORE_BORG))).toBe(true);
    expect(built.armed?.({ armed: false } as unknown as Api2ControllerContext)).toBe(false);
  });

  it("starts, binds the engine, and says what it can see", async () => {
    const without = await begin();
    expect(said(without)).toContain("keyboard");
    expect(said(without)).toContain("known world only");
    const withTruth = await begin({ truth: true });
    expect(said(withTruth)).toContain("danger vision");
  });

  it("says why it could not start when the game gave it no engine", async () => {
    const game = fakeGame({ engine: null as never });
    (game.mod as { engine?: unknown }).engine = undefined;
    started.push(game);
    await built.start!(game.mod);
    expect(said(game)).toMatch(/could not start: .*no engine/u);
    await tick(game);
    expect(game.submitted).toEqual([]);
  });

  it("decides a real move through the bundle, with the engine passed in", async () => {
    /* The whole point. If the live bindings did not survive bundling, FEAT and
     * TV would be undefined here and the ladder would still return SOMETHING, so
     * asserting "something was submitted" alone would pass against the bug. The
     * monster beside the player is what makes the ladder read the engine. */
    const game = await begin({ truth: true });
    await tick(game);
    expect(game.submitted).toHaveLength(1);
    const sent = game.submitted[0]!.intent as { kind: string };
    expect(typeof sent.kind).toBe("string");
    expect(said(game)).toContain("the Borg is playing");
  });

  it("keeps deciding, turn after turn", async () => {
    /* One decision can succeed on stale state; a stuck Borg shows up over turns. */
    const game = await begin({ scenario: { player: { grid: { x: 5, y: 5 }, depth: 2 } } });
    for (let turn = 0; turn < 8; turn++) await tick(game);
    expect(game.submitted.length).toBeGreaterThanOrEqual(8);
    expect(game.released).toEqual([]);
  });

  it("answers a prompt and submits nothing else", async () => {
    const game = await begin();
    const prompt = { promptId: 7, kind: "confirm", message: "Really?" } as unknown as Api2Prompt;
    await tick(game, { prompt });
    expect(game.answered).toEqual([{ promptId: 7, answer: true }]);
    expect(game.submitted).toEqual([]);
  });

  it("does nothing at a wait that is not play or a store", async () => {
    const game = await begin();
    await tick(game, { phase: "death" as never });
    expect(game.submitted).toEqual([]);
    expect(game.answered).toEqual([]);
  });

  it("hands the keyboard back after a run of refusals", async () => {
    const game = await begin({ submit: () => false });
    for (let turn = 0; turn < 25; turn++) await tick(game);
    expect(game.released).toHaveLength(1);
    expect(said(game)).toContain("was refused");
  });

  it("hands the keyboard back when it has nothing to do, rather than looping", async () => {
    const game = await begin({ scenario: { player: { dead: true } } });
    for (let turn = 0; turn < 25; turn++) await tick(game);
    expect(game.submitted).toEqual([]);
    expect(game.released).toHaveLength(1);
  });

  it("listens for messages while it runs, and stops listening when the game stops it", async () => {
    const game = await begin();
    expect([...game.listeners.keys()]).toEqual(["message"]);
    await built.stop?.();
    expect(game.unsubscribed).toEqual(["message"]);
  });

  it("makes only the two hidden reads it declares, and never the real map or the stock", async () => {
    const game = await begin({ truth: true });
    for (let turn = 0; turn < 3; turn++) await tick(game);
    expect(game.truthCalls.length).toBeGreaterThan(0);
    expect(game.truthCalls.filter((call) => call !== "monsters" && !call.startsWith("race "))).toEqual([]);
  });

  it("plays the known world when the game gives it no truth domain", async () => {
    const game = await begin({ truth: false });
    await tick(game);
    expect(game.truthCalls).toEqual([]);
    expect(game.submitted).toHaveLength(1);
  });

  it("runs on upstream's stock settings when the player moved nothing, and says so", async () => {
    /* A stock Borg is the Borg Angband ships. The log line is how an unattended
       run's record says which one was playing. */
    expect(said(await begin())).toContain("stock settings");
  });

  it("carries the player's settings through the bundle, and names the changed ones", async () => {
    /* THE ANTI-INERT TEST. src/settings.test.ts proves each setting moves a
       decision; that runs against TypeScript. This proves the flags survive the
       trip from the mod manager, through esbuild's single scope, into the Borg,
       and it asserts the NAMES, because a table that mapped two flags onto one
       setting would still produce a Borg that starts and plays. */
    const game = await begin({ flags: { "borg.playsRisky": true, "borg.worshipsSpeed": true, "borg.selfScum": false } });
    expect(said(game)).toContain("playsRisky=true");
    expect(said(game)).toContain("worshipsSpeed=true");
    expect(said(game)).toContain("selfScum=false");
    expect(said(game)).not.toContain("worshipsGold");
  });

  it("does not report a setting the player left on its stock value", async () => {
    expect(said(await begin({ flags: { "borg.selfScum": true } }))).toContain("stock settings");
  });
});
