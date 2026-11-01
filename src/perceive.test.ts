/**
 * Perception-deepening tests (P8.6): staleness / expiry, floor-object
 * persistence and under-borg deletion, message-stream pruning of dead monsters,
 * and the per-level fact derivation (borg_near_monster_type). These guard the
 * behavior borg_update contributes to the world model that the think ladder
 * reads.
 */

import { describe, expect, it } from "vitest";
import { FEAT } from "@rpgm-tools/neo-angband-core";
import { BorgWorld } from "./world/model.js";
import { perceive, makePerceiveMemo, BORG_EXPIRE_TURNS } from "./perceive.js";
import { borgReactMessages } from "./perceive-messages.js";
import { borgNearMonsterType } from "./perceive-facts.js";
import { borgNotice, BI } from "./trait/index.js";
import { getFightState } from "./fight/index.js";
import { borgFollowMissingKills, createFlowState } from "./flow/index.js";
import { makeScenarioView, makeFakeActions } from "./harness.js";
import { makeBorgRng } from "./rng.js";
import { borgView } from "./core-api.js";
import type { BorgContext } from "./context.js";

/** Build a primed context (perceive + notice run) for a scenario. */
function makeCtx(scenario: Parameters<typeof makeScenarioView>[0]): {
  ctx: BorgContext;
  world: BorgWorld;
} {
  const world = new BorgWorld();
  const view = makeScenarioView(scenario);
  const ctx: BorgContext = {
    world,
    view,
    act: makeFakeActions(),
    rng: makeBorgRng(),
  };
  borgNotice(ctx);
  perceive(world, view, makePerceiveMemo());
  return { ctx, world };
}

describe("staleness and expiry", () => {
  it("keeps a monster after it leaves view, then expires it at 2000 turns", () => {
    const world = new BorgWorld();
    const memo = makePerceiveMemo();
    perceive(
      world,
      makeScenarioView({ monsters: [{ id: 9, grid: { x: 8, y: 5 } }] }),
      memo,
    );
    expect([...world.kills.entries()]).toHaveLength(1);

    // Leaves view but is still recent -> record survives.
    world.clock = 100;
    perceive(world, makeScenarioView({ monsters: [] }), memo);
    expect([...world.kills.entries()]).toHaveLength(1);

    // Cross the expiry horizon -> record forgotten.
    world.clock = BORG_EXPIRE_TURNS;
    perceive(world, makeScenarioView({ monsters: [] }), memo);
    expect([...world.kills.entries()]).toHaveLength(0);
  });

  it("keeps a floor object across ticks and deletes it when stepped on", () => {
    const world = new BorgWorld();
    const memo = makePerceiveMemo();
    perceive(
      world,
      makeScenarioView({
        player: { grid: { x: 5, y: 5 } },
        floor: { "6,5": [{ tval: 5 } as never] },
      }),
      memo,
    );
    expect([...world.takes.entries()]).toHaveLength(1);

    // The object leaves the current view (not reported) but persists.
    world.clock = 10;
    perceive(world, makeScenarioView({ player: { grid: { x: 5, y: 5 } } }), memo);
    expect([...world.takes.entries()]).toHaveLength(1);

    // Step onto its grid -> the object under the borg is deleted.
    world.clock = 11;
    perceive(
      world,
      makeScenarioView({
        player: { grid: { x: 6, y: 5 } },
        floor: { "6,5": [{ tval: 5 } as never] },
      }),
      memo,
    );
    expect([...world.takes.entries()]).toHaveLength(0);
  });
});

describe("message-stream reaction", () => {
  it("prunes a tracked monster on a death message once it is out of view", () => {
    const world = new BorgWorld();
    const memo = makePerceiveMemo();
    perceive(
      world,
      makeScenarioView({
        player: { grid: { x: 5, y: 5 } },
        monsters: [{ id: 9, grid: { x: 6, y: 5 } }],
      }),
      memo,
    );
    expect([...world.kills.entries()]).toHaveLength(1);

    // Next tick the monster is gone from view and a death message arrives.
    world.clock = 1;
    perceive(
      world,
      makeScenarioView({
        player: { grid: { x: 5, y: 5 } },
        monsters: [],
        messages: ["The white harpy dies."],
      }),
      memo,
    );
    expect([...world.kills.entries()]).toHaveLength(0);
  });

  it("does not prune a still-visible monster on a death message", () => {
    const world = new BorgWorld();
    world.self.c = { x: 5, y: 5 };
    // One visible monster (id 9), one stale record (id 7, not in view).
    world.kills.wipe();
    const a = world.kills.alloc();
    world.kills.at(a).mIdx = 9;
    world.kills.at(a).rIdx = 1;
    world.kills.at(a).pos = { x: 6, y: 5 };
    const b = world.kills.alloc();
    world.kills.at(b).mIdx = 7;
    world.kills.at(b).rIdx = 1;
    world.kills.at(b).pos = { x: 4, y: 5 };

    const visible = new Set<number>([9]);
    const deleted = borgReactMessages(world, ["The kobold dies."], visible);
    expect(deleted).toBe(1);
    // The visible monster (9) survives; the stale one (7) is pruned.
    const ids = [...world.kills.entries()].map(([, k]) => k.mIdx);
    expect(ids).toContain(9);
    expect(ids).not.toContain(7);
  });
});

describe("buff on/off messages (borg-messages.c:772-1025)", () => {
  it("believes a buff active from its on-message, and gone from its own off-message", () => {
    const world = new BorgWorld();
    const noOne = new Set<number>();

    borgReactMessages(world, ["You feel righteous!"], noOne);
    expect(world.self.temp.bless).toBe(true);

    // A DIFFERENT buff's off-message must not clear it (no cross-talk).
    borgReactMessages(world, ["You no longer feel heroic."], noOne);
    expect(world.self.temp.bless).toBe(true);

    borgReactMessages(world, ["The prayer has expired."], noOne);
    expect(world.self.temp.bless).toBe(false);
  });

  it("tracks haste, protection from evil, and an elemental resist independently", () => {
    const world = new BorgWorld();
    const noOne = new Set<number>();

    borgReactMessages(
      world,
      [
        "You feel yourself moving faster!",
        "You feel safe from evil!",
        "You feel resistant to fire!",
      ],
      noOne,
    );
    expect(world.self.temp.fast).toBe(true);
    expect(world.self.temp.protFromEvil).toBe(true);
    expect(world.self.temp.resFire).toBe(true);
    // Nothing else lit up from the same batch.
    expect(world.self.temp.resCold).toBe(false);
    expect(world.self.temp.hero).toBe(false);

    borgReactMessages(world, ["You feel yourself slow down."], noOne);
    expect(world.self.temp.fast).toBe(false);
    // The other two, not mentioned in the slow-down message, are unaffected.
    expect(world.self.temp.protFromEvil).toBe(true);
    expect(world.self.temp.resFire).toBe(true);

    borgReactMessages(world, ["You are no longer resistant to fire."], noOne);
    expect(world.self.temp.resFire).toBe(false);
  });

  it("recognises both shield-granting messages and both of its own endings", () => {
    const world = new BorgWorld();
    const noOne = new Set<number>();

    borgReactMessages(world, ["Your skin turns to stone."], noOne);
    expect(world.self.temp.shield).toBe(true);

    borgReactMessages(world, ["A fleshy shade returns to your skin."], noOne);
    expect(world.self.temp.shield).toBe(false);

    borgReactMessages(
      world,
      ["A mystic shield forms around your body!"],
      noOne,
    );
    expect(world.self.temp.shield).toBe(true);

    borgReactMessages(world, ["Your mystic shield crumbles away."], noOne);
    expect(world.self.temp.shield).toBe(false);
  });
});

describe("borg_near_monster_type facts", () => {
  it("flags a visible unique on the level and marks fighting-unique", () => {
    const { ctx, world } = makeCtx({
      player: { grid: { x: 5, y: 5 }, level: 10 },
      monsters: [
        {
          id: 3,
          raceIndex: 77,
          grid: { x: 8, y: 5 },
          race: "Bullroarer the Hobbit",
          raceFlags: ["UNIQUE", "EVIL"],
        },
      ],
    });
    borgNearMonsterType(ctx, 20);
    expect(world.facts.uniqueOnLevel).toBe(77);
    expect(getFightState(world).fightingUnique).toBeGreaterThan(0);
    expect(getFightState(world).fightingEvilUnique).toBe(true);
  });

  it("flags a scary guy by name for a very low-level borg", () => {
    const { ctx, world } = makeCtx({
      player: { grid: { x: 5, y: 5 }, level: 1, depth: 1 },
      monsters: [{ id: 4, grid: { x: 7, y: 5 }, race: "Grip, Farmer Maggot's Dog" }],
    });
    expect(world.self.trait[BI.CLEVEL]).toBeLessThanOrEqual(5);
    borgNearMonsterType(ctx, 20);
    expect(world.facts.scaryGuyOnLevel).toBe(true);
  });

  it("marks a summoner and records its index when close", () => {
    const { ctx, world } = makeCtx({
      player: { grid: { x: 5, y: 5 }, level: 20, depth: 20 },
      monsters: [
        {
          id: 5,
          grid: { x: 7, y: 5 },
          race: "necromancer",
          spellFlags: ["S_MONSTER"],
        },
      ],
    });
    borgNearMonsterType(ctx, 20);
    expect(getFightState(world).fightingSummoner).toBe(true);
    expect(world.kills.summoner).toBeGreaterThan(0);
  });
});

describe("fog-of-war invariant", () => {
  it("records only known/in-view cells (no omniscient reads)", () => {
    const world = new BorgWorld();
    perceive(
      world,
      makeScenarioView({
        width: 10,
        height: 10,
        player: { grid: { x: 5, y: 5 } },
        cells: { "1,1": { known: false, inView: false, feat: FEAT.GRANITE } },
      }),
      makePerceiveMemo(),
    );
    // The unknown far corner was skipped -> still feat 0 (unseen).
    expect(world.map.at(1, 1).feat).toBe(0);
  });
});

describe("remembered terrain (#415)", () => {
  const remembered = (cells: Record<string, Record<string, unknown>>) =>
    borgView(
      makeScenarioView({
        width: 10,
        height: 10,
        player: { grid: { x: 5, y: 5 } },
        cells,
      }),
    );

  it("records the remembered terrain, not a live secret door", () => {
    const world = new BorgWorld();
    perceive(
      world,
      remembered({
        "2,2": { known: true, inView: false, feat: FEAT.SECRET, knownFeat: FEAT.GRANITE, knownPassable: false },
      }),
      makePerceiveMemo(),
    );
    expect(world.map.at(2, 2).feat).toBe(FEAT.GRANITE);
  });

  it("reads a door that changed out of sight as the player last saw it", () => {
    const view = remembered({
      "2,2": { known: true, inView: false, feat: FEAT.FLOOR, passable: true, knownFeat: FEAT.GRANITE, knownPassable: false },
    });
    expect(view.cell(2, 2)).toMatchObject({ feat: FEAT.GRANITE, passable: false });
  });

  it("treats an unremembered square as unknown whatever the live terrain is", () => {
    const view = remembered({
      "2,2": { known: false, inView: false, feat: FEAT.FLOOR, passable: true, knownFeat: -1, knownPassable: false },
    });
    expect(view.cell(2, 2)).toMatchObject({ feat: 0, passable: false });
  });

  it("counts a square as glowing only while the player sees it", () => {
    const view = remembered({
      "2,2": { known: true, inView: false, glow: true, knownFeat: FEAT.FLOOR, knownPassable: true },
      "3,2": { known: true, inView: true, glow: true, knownFeat: FEAT.FLOOR, knownPassable: true },
    });
    expect(view.cell(2, 2)?.glow).toBe(false);
    expect(view.cell(3, 2)?.glow).toBe(true);
  });

  it("falls back to the live cell when the host reports no remembered terrain", () => {
    const view = remembered({ "2,2": { known: true, feat: FEAT.GRANITE, passable: false } });
    expect(view.cell(2, 2)).toMatchObject({ feat: FEAT.GRANITE, passable: false });
  });
});

describe("a monster that is not where the Borg left it", () => {
  /**
   * borg_follow_kill (borg-flow-kill.c:552) is the only thing that removes a
   * record for a monster that has gone. Without it a phantom sits on the map for
   * the full 2000-turn expiry and borg_flow_kill keeps routing the Borg to it,
   * which measured as a two-square shuffle with nothing in sight - flow to kill
   * it, arrive, find nothing, let the explore rung step back.
   */
  function twoTicks(second: Parameters<typeof makeScenarioView>[0]): BorgWorld {
    const world = new BorgWorld();
    const memo = makePerceiveMemo();
    const first = makeScenarioView({
      player: { grid: { x: 20, y: 12 } },
      monsters: [{ id: 9, race: "kobold", grid: { x: 21, y: 12 } }],
    });
    const ctx1: BorgContext = {
      world,
      view: first,
      act: makeFakeActions(),
      rng: makeBorgRng(),
    };
    borgNotice(ctx1);
    perceive(world, first, memo);
    expect([...world.kills.entries()]).toHaveLength(1);

    world.clock += 1;
    const view = makeScenarioView({
      player: { grid: { x: 20, y: 12 } },
      ...second,
    });
    const ctx2: BorgContext = {
      world,
      view,
      act: makeFakeActions(),
      rng: makeBorgRng(),
    };
    borgNotice(ctx2);
    perceive(world, view, memo);
    borgFollowMissingKills(ctx2, createFlowState());
    return world;
  }

  it("forgets it when every way out of its grid is lit and empty", () => {
    expect([...twoTicks({ monsters: [] }).kills.entries()]).toHaveLength(0);
  });

  it("keeps believing in it while its grid is out of view", () => {
    /* Fog of war is not evidence of absence. Only a grid the Borg can actually
     * see says anything about what is standing on it. */
    const dark: Record<string, { inView: boolean }> = {};
    for (let y = 10; y <= 14; y++) {
      for (let x = 19; x <= 23; x++) dark[`${String(x)},${String(y)}`] = { inView: false };
    }
    const world = twoTicks({ monsters: [], cells: dark });
    expect([...world.kills.entries()]).toHaveLength(1);
  });
});
