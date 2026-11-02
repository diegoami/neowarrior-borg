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

  it("installs its controller with onDeath: \"end\", not the stock reincarnation", () => {
    /* FORK: T04 (#7) - upstream's default rolls a random race and class on
     * death, which is what this fork exists not to do. "end" runs the
     * ordinary death and leaves the restart loop (src/loop/restart.ts) to
     * start the next PLANNED warrior through the birth presenter. */
    expect(built.onDeath).toBe("end");
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

  it("listens for messages, arrivals and run reports while it runs, and stops listening when the game stops it", async () => {
    const game = await begin();
    /* "dungeonlevel" is T06's journal joining the feed: the arrival event is
     * what records a depth milestone. "run-end" is T04's restart loop: the
     * run report is the only thing that may trigger a create. */
    expect([...game.listeners.keys()]).toEqual(["message", "dungeonlevel", "run-end"]);
    await built.stop?.();
    /* The bridge retires synchronously; the loop's and the journal's
     * retirements wait a microtask each for their subscription handles to
     * settle, so both land after the message listener. Which of the two
     * lands first is not a property anything depends on, so the assertion is
     * the set: all three gone, nothing else touched. */
    expect([...game.unsubscribed].sort()).toEqual(["dungeonlevel", "message", "run-end"]);
  });

  it("restarts its dead warrior through the roster seam, once, flagged first", async () => {
    /* T04's loop, driven through the BUILT bundle the way the host drives
     * it: the game delivers the run report, the mod answers. The flag is
     * set in the install slot BEFORE the create fires, the create asks for
     * exactly resumeAutoplayer (never `like`), and the slot keeps the
     * title row's sibling key - the shared-slot contract (#26). */
    const game = await begin();
    const report = { key: "cedar", report: { outcome: "death", cause: "a novice mage", maxDepth: 3, turn: 99 } };
    game.listeners.get("run-end")?.(report as never);
    for (let i = 0; i < 32; i++) await Promise.resolve();
    expect(game.created).toEqual([{ resumeAutoplayer: true }]);
    /* The slot's whole contents at rest: the flag standing for the next
     * page's presenter (a fresh fake slot had no siblings to keep). */
    expect(game.installSlot.value).toEqual({ warriorBirth: true });
    /* T06: the run that ended is recorded in the CHARACTER's slot - the
     * partial report this fake sends still names the outcome and the
     * killer, and the entry says null rather than a guess for the rest. */
    const journal = game.characterSlot.value as { graveyard?: Array<Record<string, unknown>> };
    expect(journal.graveyard).toEqual([
      expect.objectContaining({ outcome: "death", cause: "a novice mage", maxDepth: 3, turn: 99 }),
    ]);
  });

  it("records the run that ended in the character's save BEFORE it creates the next warrior", async () => {
    /* T06's ordering, witnessed at the moment create ran: the graveyard
     * entry must already be standing in the character's slot, because the
     * page teardown a successful create causes is exactly the hazard the
     * ordering exists for. Read from the slot's own contents captured
     * inside the create, not from anything the mod promised. */
    const atCreate: unknown[] = [];
    const game = await begin({
      onCreate: () => atCreate.push(structuredClone(game.characterSlot.value)),
    });
    const report = { key: "cedar", report: { outcome: "death", cause: "a grey mold", maxDepth: 2, turn: 500 } };
    game.listeners.get("run-end")?.(report as never);
    for (let i = 0; i < 32; i++) await Promise.resolve();
    expect(game.created).toEqual([{ resumeAutoplayer: true }]);
    expect(atCreate).toHaveLength(1);
    const witnessed = atCreate[0] as { graveyard?: Array<Record<string, unknown>> };
    expect(witnessed.graveyard?.[0]).toMatchObject({ outcome: "death", cause: "a grey mold" });
  });

  it("records a depth milestone when its warrior arrives on a level", async () => {
    const game = await begin();
    game.listeners.get("dungeonlevel")?.({ depth: 2, levelId: 3, cause: "change", arena: false } as never);
    for (let i = 0; i < 16; i++) await Promise.resolve();
    const journal = game.characterSlot.value as { milestones?: Array<Record<string, unknown>> };
    expect(journal.milestones).toEqual([
      expect.objectContaining({ depth: 2, levelId: 3, cause: "change", arena: false }),
    ]);
    /* The load re-fire adds nothing: one milestone per depth. */
    game.listeners.get("dungeonlevel")?.({ depth: 2, levelId: 9, cause: "load", arena: false } as never);
    for (let i = 0; i < 16; i++) await Promise.resolve();
    const after = game.characterSlot.value as { milestones?: Array<Record<string, unknown>> };
    expect(after.milestones).toHaveLength(1);
    await built.stop?.();
  });

  it("starts nothing at a death it did not drive, and nothing without the roster seam", async () => {
    const drivenByOther = await begin({ ownsKeyboard: false });
    drivenByOther.listeners.get("run-end")?.({ key: "cedar", report: { outcome: "death", cause: "x", maxDepth: 1, turn: 1 } } as never);
    for (let i = 0; i < 32; i++) await Promise.resolve();
    expect(drivenByOther.created).toEqual([]);
    expect(drivenByOther.installSlot.value).toBeNull();
    /* T06: the run that ended is still recorded - a dead warrior is a dead
     * warrior whoever held the keyboard; it is the NEXT one this mod will
     * not start. */
    const journal = drivenByOther.characterSlot.value as { graveyard?: Array<Record<string, unknown>> };
    expect(journal.graveyard).toEqual([expect.objectContaining({ outcome: "death", cause: "x" })]);

    const noSeam = await begin({ saves: "absent" });
    noSeam.listeners.get("run-end")?.({ key: "cedar", report: { outcome: "death", cause: "x", maxDepth: 1, turn: 1 } } as never);
    for (let i = 0; i < 32; i++) await Promise.resolve();
    expect(noSeam.created).toEqual([]);
    expect(noSeam.installSlot.value).toBeNull();
    expect(said(noSeam)).toContain("no character-creation seam");
  });

  it("installs nothing from a start that was stopped while still starting", async () => {
    /* #30's shape: stop() lands while begin() is still awaiting its
     * bridge's prime, so no restart handle exists for the stop to retire.
     * The installation epoch must abort the start at its checkpoint: no
     * title row, no restart listener, and the late death report the review
     * reproduced reaches nothing. */
    const game = fakeGame({ engine: engine(NOSCORE_BORG), scenario: FIGHT });
    started.push(game);
    const pending = built.start!(game.mod);
    built.stop!();
    await pending;
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(game.listeners.has("run-end")).toBe(false);
    expect(game.listeners.has("dungeonlevel")).toBe(false);
    game.listeners.get("run-end")?.({ key: "cedar", report: { outcome: "death", cause: "x", maxDepth: 1, turn: 1 } } as never);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(game.created).toEqual([]);
    expect(game.installSlot.value).toBeNull();
    expect(said(game)).toContain("installed nothing");
    /* The aborted start's bridge is disposed too: the message listener its
     * prime subscribed leaves with it. */
    expect(game.unsubscribed).toEqual(["message"]);  });

  it("lets a fresh start install after a stop, and stops a stale older start from disturbing it", async () => {
    /* #30's second requirement: start A is stopped mid-start, start B
     * installs normally, and A then resolves late - A must install nothing
     * AND must not stop or replace B's loop (B's death report still
     * restarts through it after A has finished). */
    const gameA = fakeGame({ engine: engine(NOSCORE_BORG), scenario: FIGHT });
    started.push(gameA);
    const gameB = fakeGame({ engine: engine(NOSCORE_BORG), scenario: FIGHT });
    started.push(gameB);

    const a = built.start!(gameA.mod);
    built.stop!();
    await built.start!(gameB.mod); /* the fresh start installs normally */
    await a; /* the older, stopped start resolves late: aborts */

    expect(gameA.listeners.has("run-end")).toBe(false);
    expect(gameB.listeners.has("run-end")).toBe(true);

    /* The newer loop is still the live one: a death restarts through it. */
    gameB.listeners.get("run-end")?.({ key: "cedar", report: { outcome: "death", cause: "x", maxDepth: 1, turn: 1 } } as never);
    for (let i = 0; i < 32; i++) await Promise.resolve();
    expect(gameB.created).toEqual([{ resumeAutoplayer: true }]);

    /* And the older game's bus has no listener at all. */
    gameA.listeners.get("run-end")?.({ key: "cedar", report: { outcome: "death", cause: "x", maxDepth: 1, turn: 1 } } as never);
    for (let i = 0; i < 32; i++) await Promise.resolve();
    expect(gameA.created).toEqual([]);
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
