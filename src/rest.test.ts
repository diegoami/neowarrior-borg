/**
 * THE TESTS FOR "IT SAT THERE AND LET SOMETHING KILL IT".
 *
 * Watched in the released build on 2026-08-21, a level-one character in town
 * stood still and died to a squint-eyed rogue. The headless runs said the same
 * thing in more detail: hundreds of `rest` commands interleaved with "Something
 * touches you." and a low-hitpoint warning, ending in "You die."
 *
 * The cause was not one bug but a whole missing feedback path. Upstream answers
 * an attacker it cannot see with REGIONAL FEAR, whose own comment
 * (borg-update.c:697) says it exists "to keep him from resting while unseen guys
 * attack him". This port had the fear caches, the two updaters that fill them
 * and the readers that consult them - and nothing in the middle. Nothing ever
 * wrote a fear value, `borg_check_rest` never read one, and the recover ladder
 * never called `borg_check_rest` at all, because the seam carrying its answer was
 * wired to the constant `true`.
 *
 * Each test below pins one link of that path, so a future change that unhooks
 * any of them fails here rather than in somebody's town.
 */

import { describe, expect, it } from "vitest";
import { BorgWorld } from "./world/model.js";
import { perceive, makePerceiveMemo } from "./perceive.js";
import {
  borgLoadReadMessage,
  borgMessageContains,
  buildHitByTable,
  buildSpellTable,
} from "./perceive-messages.js";
import { RSF } from "./core-api.js";
import { borgNotice, BI } from "./trait/index.js";
import { getFearCaches } from "./danger/index.js";
import { borgCheckRest, createFlowState } from "./flow/index.js";
import { makeScenarioView, makeFakeActions, type Scenario } from "./harness.js";
import { makeBorgRng } from "./rng.js";
import { buildItemDeps, buildThinkSession } from "./think-session.js";
import type { BorgContext } from "./context.js";

/**
 * The two blow-method action templates these tests use. Real data in play (the
 * plugin reads `ctx.registries.monsters.blowMethods`); spelled out here so a
 * unit test needs no content pack.
 */
const BLOWS = buildHitByTable(["hits {target}", "touches {target}"]);

/**
 * A grid whose nine fear regions are all distinct.
 *
 * borg_fear_regional writes k to three neighbouring regions and fractions of k
 * to six more, and near the map origin several of those indices COLLIDE, so the
 * Borg's own region ends up holding 3k. That is upstream's arithmetic, quirk and
 * all (its y2 is computed from x0), and it is not what these tests are about, so
 * they stand somewhere the nine are separate and the value is exactly k.
 */
const AWAY = { x: 30, y: 20 };

function ctxFor(scenario: Scenario): { ctx: BorgContext; world: BorgWorld } {
  const world = new BorgWorld();
  const view = makeScenarioView(scenario);
  const ctx: BorgContext = {
    world,
    view,
    act: makeFakeActions(),
    rng: makeBorgRng(),
  };
  borgNotice(ctx);
  perceive(world, view, makePerceiveMemo(), BLOWS);
  return { ctx, world };
}

/** Regional fear at the Borg's own grid. */
function fearHere(world: BorgWorld): number {
  return getFearCaches(world).region(world.self.c.y, world.self.c.x);
}

describe("the message template parser", () => {
  it("splits a template at its tags, keeping only the literal parts", () => {
    expect(borgLoadReadMessage("hits {target}")).toEqual({ p1: "hits " });
    expect(borgLoadReadMessage("begs {target} for money")).toEqual({
      p1: "begs ",
      p2: "for money",
    });
    expect(borgLoadReadMessage("insults {target}!")).toEqual({
      p1: "insults ",
      p2: "!",
    });
    /* No tag at all: the whole thing is the fragment. */
    expect(borgLoadReadMessage("makes obscene gestures!")).toEqual({
      p1: "makes obscene gestures!",
    });
  });

  it("matches a real message on the fragments around the tag", () => {
    const hits = borgLoadReadMessage("hits {target}");
    expect(borgMessageContains("The kobold hits you.", hits)).toBe(true);
    expect(borgMessageContains("You hit the kobold.", hits)).toBe(false);
  });
});

describe("an attacker the Borg cannot see", () => {
  it("raises regional fear from an unseen spellcaster", () => {
    const world = new BorgWorld();
    const view = makeScenarioView({ messages: ["Something shouts."] });
    borgNotice({ world, view, act: makeFakeActions(), rng: makeBorgRng() });
    const spell = buildSpellTable([{ index: RSF.SHRIEK, levels: [{
      message: "The caster shouts.", blindMessage: "Something shouts.", missMessage: "The caster misses.",
    }] }]);
    perceive(world, view, makePerceiveMemo(), {
      hitBy: BLOWS.hitBy,
      spell: spell.spell,
      spellInvisible: spell.spellInvisible,
    });
    expect(fearHere(world)).toBe(10);
    expect(world.self.temp.needSeeInvis).toBe(world.clock);
  });

  it("raises regional fear, which is what stops it resting", () => {
    const { ctx, world } = ctxFor({ messages: ["Something touches you."] });
    /* 4 * ((cdepth / 5) + 1), and cdepth is 0 in town. */
    expect(fearHere(world)).toBe(4);

    /* A level-one character's CURHP/20 is zero, so any fear at all is enough. */
    expect(world.self.trait[BI.CURHP]).toBeLessThan(40);
    expect(
      borgCheckRest(ctx, createFlowState(), world.self.c.y, world.self.c.x),
    ).toBe(false);
  });

  it("asks for detect invisible, timestamped so the maneuver becomes legal", () => {
    const { world } = ctxFor({ messages: ["Something hits you."] });
    expect(world.self.temp.needSeeInvis).toBe(world.clock);
  });

  it("fears a miss half as much as a hit", () => {
    const { world } = ctxFor({ messages: ["Something misses you."] });
    expect(fearHere(world)).toBe(2);
  });

  it("recognises nothing at all without the blow-method table", () => {
    /* Not a curiosity: this is the state the mod shipped in, and it is why the
     * whole path was invisible. A Borg built with no `blowActions` reads a blow
     * as an ordinary message. */
    const world = new BorgWorld();
    const view = makeScenarioView({ messages: ["Something touches you."] });
    perceive(world, view, makePerceiveMemo());
    expect(fearHere(world)).toBe(0);
  });
});

describe("an attacker the Borg can see", () => {
  it("raises no regional fear, because the monster's own danger covers it", () => {
    const { world } = ctxFor({
      width: 60,
      height: 40,
      player: { grid: AWAY },
      monsters: [{ id: 4, race: "kobold", grid: { x: AWAY.x + 1, y: AWAY.y } }],
      messages: ["The kobold hits you."],
    });
    expect(fearHere(world)).toBe(0);
  });

  it("still fears one it cannot match to anything adjacent", () => {
    /* hit_dist is 1: a monster across the room did not just punch the Borg, so
     * the blow stays unexplained and the fear stands. */
    const { world } = ctxFor({
      width: 60,
      height: 40,
      player: { grid: AWAY },
      monsters: [{ id: 4, race: "kobold", grid: { x: AWAY.x + 10, y: AWAY.y } }],
      messages: ["The kobold hits you."],
    });
    expect(fearHere(world)).toBe(4);
  });

  it("drops the fear when the attacker finally shows itself", () => {
    const world = new BorgWorld();
    const memo = makePerceiveMemo();
    perceive(
      world,
      makeScenarioView({
        width: 60,
        height: 40,
        player: { grid: AWAY },
        messages: ["Something touches you."],
      }),
      memo,
      BLOWS,
    );
    expect(fearHere(world)).toBe(4);

    /* borg-flow-kill.c:813: a monster appearing within five turns of an
     * unexplained blow is assumed to BE it. */
    world.clock += 1;
    perceive(
      world,
      makeScenarioView({
        width: 60,
        height: 40,
        player: { grid: AWAY },
        monsters: [{ id: 4, race: "kobold", grid: { x: AWAY.x + 1, y: AWAY.y } }],
      }),
      memo,
      BLOWS,
    );
    expect(fearHere(world)).toBe(0);
  });
});

describe("the fear runs down", () => {
  it("loses a point every ten borg turns, and stops blocking rest", () => {
    const world = new BorgWorld();
    const memo = makePerceiveMemo();
    const view = () => makeScenarioView({ messages: [] });
    perceive(
      world,
      makeScenarioView({ messages: ["Something touches you."] }),
      memo,
      BLOWS,
    );
    expect(fearHere(world)).toBe(4);

    /* Forty borg turns is four decrements, and the fear is spent. */
    for (let i = 0; i < 40; i++) {
      world.clock += 1;
      perceive(world, view(), memo, BLOWS);
    }
    expect(fearHere(world)).toBe(0);
  });

  it("is forgotten outright on a new level", () => {
    const world = new BorgWorld();
    const memo = makePerceiveMemo();
    perceive(
      world,
      makeScenarioView({ messages: ["Something touches you."] }),
      memo,
      BLOWS,
    );
    expect(fearHere(world)).toBeGreaterThan(0);

    world.clock += 1;
    perceive(world, makeScenarioView({ player: { depth: 1 } }), memo, BLOWS);
    expect(fearHere(world)).toBe(0);
  });
});

describe("the timers the Borg keeps", () => {
  it("all run down, so a prep spell does not block resting forever", () => {
    const world = new BorgWorld();
    const memo = makePerceiveMemo();
    const view = makeScenarioView({});
    const ctx: BorgContext = {
      world,
      view,
      act: makeFakeActions(),
      rng: makeBorgRng(),
    };
    borgNotice(ctx);
    perceive(world, view, memo, BLOWS);

    /* borg_game_ratio at normal speed (borg-trait.c:2926). */
    expect(world.self.gameRatio).toBe(1000);

    world.self.noRestPrep = 2500;
    world.self.resistance = 2500;
    world.self.temp.seeInv = 2500;
    world.self.goal.recalling = 2500;

    for (let i = 0; i < 3; i++) {
      world.clock += 1;
      perceive(world, makeScenarioView({}), memo, BLOWS);
    }
    expect(world.self.noRestPrep).toBeLessThanOrEqual(0);
    expect(world.self.resistance).toBeLessThanOrEqual(0);
    expect(world.self.temp.seeInv).toBeLessThanOrEqual(0);
    /* Recall floors at 1 rather than 0, so the Borg does not read "finished"
     * and re-read the scroll; the lift-off message is what clears it. */
    expect(world.self.goal.recalling).toBe(1);
  });

  it("starts and finishes a recall from the game's own messages", () => {
    const world = new BorgWorld();
    const memo = makePerceiveMemo();
    perceive(
      world,
      makeScenarioView({ messages: ["The air about you becomes charged..."] }),
      memo,
      BLOWS,
    );
    expect(world.self.goal.recalling).toBeGreaterThan(0);

    world.clock += 1;
    perceive(
      world,
      makeScenarioView({ messages: ["You feel yourself yanked upwards!"] }),
      memo,
      BLOWS,
    );
    expect(world.self.goal.recalling).toBe(0);
  });
});

describe("the recover ladder's rest gate", () => {
  it("asks borg_check_rest rather than assuming it is safe", () => {
    /* The seam used to be the literal `true`, so the whole of borg_check_rest
     * was unreachable from the only ladder that rests. A monster one square away
     * is the simplest thing it refuses. */
    const world = new BorgWorld();
    const view = makeScenarioView({
      player: { grid: { x: 10, y: 10 } },
      monsters: [{ id: 4, race: "kobold", grid: { x: 11, y: 10 } }],
    });
    const ctx: BorgContext = {
      world,
      view,
      act: makeFakeActions(),
      rng: makeBorgRng(),
    };
    borgNotice(ctx);
    perceive(world, view, makePerceiveMemo(), BLOWS);

    const session = buildThinkSession({});
    session.ctx = ctx;
    expect(buildItemDeps(session).canRest).toBe(false);
  });
});

describe("the breeder-rest guard (when_last_kill_mult)", () => {
  /**
   * borg-flow-kill.c:430-432 stamps `when_last_kill_mult` inside
   * borg_delete_kill itself, so ANY forgotten record for a MULTIPLY-flagged
   * monster arms borg_check_rest's guard (misc.c:1223-1228) - not only one
   * killed in melee. A death message is the simplest way to trigger a
   * deletion in this port (perceive-messages.ts), so it stands in for
   * "the record is gone" here.
   */
  it("refuses to rest for four turns after a tracked multiplier's record is deleted", () => {
    const world = new BorgWorld();
    const memo = makePerceiveMemo();
    const liveView = makeScenarioView({
      player: { grid: { x: 5, y: 5 } },
      monsters: [
        {
          id: 9,
          race: "giant white mouse",
          raceFlags: ["MULTIPLY"],
          grid: { x: 6, y: 5 },
        },
      ],
    });
    const ctx: BorgContext = {
      world,
      view: liveView,
      act: makeFakeActions(),
      rng: makeBorgRng(),
    };
    borgNotice(ctx);
    /* BI.FOOD is upstream's "how much hunger relief do I have on hand"
     * (trait.c:2814), not the character's current satiety - a fresh Warrior
     * scenario has neither food items nor a hunger spell, so it defaults to 0
     * and would otherwise trip borg_check_rest's unrelated food/light arm
     * (misc.c:1288). Set it clear of that arm so this test isolates the one
     * guard it is about. */
    world.self.trait[BI.FOOD] = 10;
    perceive(world, liveView, memo, BLOWS);
    expect(world.self.whenLastKillMult).toBe(0);

    /* Next tick: the mouse is out of view and a death message arrives. */
    world.clock += 1;
    perceive(
      world,
      makeScenarioView({
        player: { grid: { x: 5, y: 5 } },
        monsters: [],
        messages: ["The giant white mouse dies."],
      }),
      memo,
      BLOWS,
    );
    expect(world.self.whenLastKillMult).toBe(world.clock);

    /* Turns 1 through 4 after the kill: still inside the window. */
    for (let i = 0; i < 4; i++) {
      expect(
        borgCheckRest(ctx, createFlowState(), world.self.c.y, world.self.c.x),
      ).toBe(false);
      world.clock += 1;
    }

    /* The fifth turn: the window has passed and resting is legal again. */
    expect(
      borgCheckRest(ctx, createFlowState(), world.self.c.y, world.self.c.x),
    ).toBe(true);
  });

  it("does not arm the guard for an ordinary monster's death", () => {
    const world = new BorgWorld();
    const memo = makePerceiveMemo();
    perceive(
      world,
      makeScenarioView({
        player: { grid: { x: 5, y: 5 } },
        monsters: [{ id: 9, race: "kobold", grid: { x: 6, y: 5 } }],
      }),
      memo,
    );

    world.clock += 1;
    perceive(
      world,
      makeScenarioView({
        player: { grid: { x: 5, y: 5 } },
        monsters: [],
        messages: ["The kobold dies."],
      }),
      memo,
    );
    expect(world.self.whenLastKillMult).toBe(0);
  });
});
