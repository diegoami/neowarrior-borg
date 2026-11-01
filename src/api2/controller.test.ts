/**
 * The decision tick and the verbs it submits through.
 *
 * plugin.test.ts shows the built file playing a turn. These pin the parts that
 * file cannot reach with one scenario: the intent each verb becomes, targets
 * going ahead of their command under a refreshed token, loadout questions read
 * and the decision run again, and what the Borg says to a prompt.
 */

import { describe, expect, it } from "vitest";
import type { AgentCommand, AgentController } from "@rpgm-tools/neo-angband-core";
import type { Api2Prompt } from "@rpgm-tools/neo-angband-mod-sdk";
import { fakeGame } from "../harness-api2.js";
import { createActFacade, intentOf, REST_COMPLETE } from "./act.js";
import { createTick, promptAnswer, IDLE_BEFORE_RELEASE, REFUSALS_BEFORE_RELEASE, STALLS_BEFORE_FORGET, STALLS_BEFORE_RELEASE, type Decider } from "./controller.js";
import type { Bridge } from "./host.js";
import type { World } from "./world.js";

describe("the act verbs", () => {
  it("turn a command into the intent the game takes", () => {
    const { act } = createActFacade();
    expect(intentOf(act.move(3))).toEqual({ kind: "command", command: { code: "walk", dir: 3 } });
    expect(intentOf(act.quaff(5))).toEqual({ kind: "command", command: { code: "quaff", args: { handle: 5 } } });
    expect(intentOf(act.rest())).toEqual({ kind: "command", command: { code: "rest", args: { count: REST_COMPLETE } } });
    expect(intentOf(act.drop(2, 3))).toEqual({ kind: "command", command: { code: "drop", args: { handle: 2, quantity: 3 } } });
    expect(intentOf(act.wear(4))).toEqual({ kind: "command", command: { code: "wield", args: { handle: 4 } } });
    expect(intentOf(act.hold())).toEqual({ kind: "command", command: { code: "hold" } });
  });

  it("record a target choice for submitting ahead of the command, and hand each over once", () => {
    const facade = createActFacade();
    facade.act.setTargetMonster(12);
    facade.act.setTargetLocation(4, 9);
    expect(facade.take()).toEqual([{ kind: "target", midx: 12 }, { kind: "target", x: 4, y: 9 }]);
    expect(facade.take()).toEqual([]);
  });
});

describe("what the Borg says to a prompt", () => {
  const prompt = (over: Record<string, unknown>): Api2Prompt => ({ promptId: 1, ...over }) as unknown as Api2Prompt;

  it("acknowledges, confirms, takes the default, and cancels what it cannot answer", () => {
    expect(promptAnswer(prompt({ kind: "ack" }))).toEqual({ action: "acknowledge" });
    expect(promptAnswer(prompt({ kind: "confirm" }))).toBe(true);
    expect(promptAnswer(prompt({ kind: "quantity", defaultValue: 3 }))).toBe(3);
    expect(promptAnswer(prompt({ kind: "text", defaultValue: "x" }))).toBe("x");
    expect(promptAnswer(prompt({ kind: "menu" }))).toEqual({ action: "cancel" });
  });
});

/** A bridge with nothing behind it, and a world the decision code is never shown the inside of. */
function bridge(over: Partial<Bridge> = {}): Bridge {
  const quiet = { player: () => ({ grid: { x: 1, y: 1 } }), monsters: () => [] };
  const world = { view: quiet as never, facts: { shopnum: null, kinds: new Map() } } as World;
  return {
    hasTruth: false,
    prime: () => Promise.resolve(),
    readWorld: () => Promise.resolve(world),
    setInput: () => undefined,
    input: () => null,
    loadoutsPending: () => false,
    settleLoadouts: () => Promise.resolve(0),
    resolverInput: () => ({}),
    dispose: () => Promise.resolve(),
    ...over,
  };
}

function decider(controller: AgentController, rewinds: { count: number } = { count: 0 }): Decider {
  return { controller, rewind: () => void (rewinds.count += 1) };
}

const WALK: AgentCommand = { code: "walk", dir: 6 } as AgentCommand;

describe("one tick", () => {
  it("submits the targets, under a fresh token, and then the command", async () => {
    const game = fakeGame();
    const order: string[] = [];
    const real = game.mod.act.submit;
    (game.mod.act as { submit: unknown }).submit = (token: never, intent: { kind: string }) => {
      order.push(`${intent.kind}@${String((token as { revision: number }).revision)}`);
      return real(token, intent as never);
    };
    (game.mod.view as { input: unknown }).input = () => Promise.resolve({ ok: true, value: game.input({ token: { epoch: 1, revision: 2 } }) });
    const tick = createTick(
      bridge(),
      decider((_view, act) => {
        act.setTargetMonster(7);
        return act.move(6);
      }),
    );
    await tick(game.mod, game.input());
    expect(order).toEqual(["target@1", "command@2"]);
  });

  it("reads the loadout questions it asked and decides again, up to a limit", async () => {
    const game = fakeGame();
    let pending = true;
    let settled = 0;
    let decisions = 0;
    const rewinds = { count: 0 };
    const tick = createTick(
      bridge({
        loadoutsPending: () => pending,
        settleLoadouts: () => {
          settled += 1;
          pending = settled < 2;
          return Promise.resolve(1);
        },
      }),
      decider(() => {
        decisions += 1;
        return WALK;
      }, rewinds),
    );
    await tick(game.mod, game.input());
    expect(decisions).toBe(3);
    expect(rewinds.count).toBe(2);
    expect(game.submitted).toHaveLength(1);

    const stuck = createTick(bridge({ loadoutsPending: () => true, settleLoadouts: () => Promise.resolve(1) }), decider(() => WALK));
    const again = fakeGame();
    await stuck(again.mod, again.input());
    expect(again.submitted).toHaveLength(1);
  });

  it("stops reading loadout questions when none are answered", async () => {
    const game = fakeGame();
    let decisions = 0;
    const tick = createTick(bridge({ loadoutsPending: () => true, settleLoadouts: () => Promise.resolve(0) }), decider(() => ((decisions += 1), WALK)));
    await tick(game.mod, game.input());
    expect(decisions).toBe(1);
  });

  it("says once that it is playing", async () => {
    const game = fakeGame();
    const tick = createTick(bridge(), decider(() => WALK));
    await tick(game.mod, game.input());
    await tick(game.mod, game.input());
    expect(game.logs.filter((line) => line === "the Borg is playing")).toHaveLength(1);
  });

  it("hands the keyboard back after a run of idle decisions, then starts counting again", async () => {
    const game = fakeGame();
    const tick = createTick(bridge(), decider(() => null));
    for (let n = 0; n < IDLE_BEFORE_RELEASE * 2; n++) await tick(game.mod, game.input());
    expect(game.released).toHaveLength(2);
  });

  it("does not count an idle decision between two commands against the run", async () => {
    const game = fakeGame();
    let n = 0;
    const tick = createTick(bridge(), decider(() => (++n % 2 === 0 ? null : WALK)));
    for (let i = 0; i < IDLE_BEFORE_RELEASE * 3; i++) await tick(game.mod, game.input());
    expect(game.released).toEqual([]);
  });

  it("hands the keyboard back after a run of refusals, and logs the first", async () => {
    const game = fakeGame({ submit: () => false });
    const tick = createTick(bridge(), decider(() => WALK));
    for (let n = 0; n < REFUSALS_BEFORE_RELEASE; n++) await tick(game.mod, game.input());
    expect(game.released).toHaveLength(1);
    expect(game.logs.filter((line) => line.includes("was refused"))).toHaveLength(3);
  });

  it("forgets the grid an accepted command keeps aiming at when the scene never changes", async () => {
    const game = fakeGame({ scenario: { player: { grid: { x: 5, y: 5 }, depth: 2 } } });
    const forgotten: string[] = [];
    const open = { code: "open", dir: 2 } as AgentCommand;
    const tick = createTick(bridge({ readWorld: () => Promise.resolve({ view: game.view, facts: { shopnum: null, kinds: new Map() } } as unknown as World) }), {
      controller: () => open,
      rewind: () => undefined,
      forget: (x, y) => void forgotten.push(`${String(x)},${String(y)}`),
    });
    for (let n = 0; n <= STALLS_BEFORE_FORGET; n++) await tick(game.mod, game.input());
    expect(forgotten).toEqual(["5,6"]);
    expect(game.logs.filter((line) => line.includes("forgot"))).toHaveLength(1);
    expect(game.released).toEqual([]);
  });

  it("hands the keyboard back when the same command changes nothing for a long run", async () => {
    const game = fakeGame({ scenario: { player: { grid: { x: 5, y: 5 }, depth: 2 } } });
    const tick = createTick(bridge({ readWorld: () => Promise.resolve({ view: game.view, facts: { shopnum: null, kinds: new Map() } } as unknown as World) }), decider(() => WALK));
    for (let n = 0; n <= STALLS_BEFORE_RELEASE; n++) await tick(game.mod, game.input());
    expect(game.released).toHaveLength(1);
  });

  it("does not count a command whose scene changes between decisions", async () => {
    const game = fakeGame({ scenario: { player: { grid: { x: 5, y: 5 }, depth: 2 } } });
    let x = 5;
    const world = () => {
      x += 1;
      const view = Object.create(game.view) as typeof game.view;
      (view as { player: unknown }).player = () => ({ ...game.view.player(), grid: { x, y: 5 } });
      return Promise.resolve({ view, facts: { shopnum: null, kinds: new Map() } } as unknown as World);
    };
    const forgotten: string[] = [];
    const tick = createTick(bridge({ readWorld: world }), { controller: () => ({ code: "open", dir: 2 }) as AgentCommand, rewind: () => undefined, forget: (a, b) => void forgotten.push(`${String(a)},${String(b)}`) });
    for (let n = 0; n < STALLS_BEFORE_RELEASE * 2; n++) await tick(game.mod, game.input());
    expect(forgotten).toEqual([]);
    expect(game.released).toEqual([]);
  });

  it("reads no world at a wait with a prompt, and waits out a death or other phase", async () => {
    const game = fakeGame();
    let reads = 0;
    const tick = createTick(bridge({ readWorld: () => ((reads += 1), Promise.resolve(null)) }), decider(() => WALK));
    await tick(game.mod, game.input({ prompt: { promptId: 2, kind: "ack" } as unknown as Api2Prompt }));
    await tick(game.mod, game.input({ phase: "death" as never }));
    expect(reads).toBe(0);
    await tick(game.mod, game.input());
    expect(reads).toBe(1);
    expect(game.submitted).toEqual([]);
  });
});
