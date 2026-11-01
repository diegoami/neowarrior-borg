/**
 * Combat/defense/escape tests (P8.4). Golden values are derived by hand from
 * reference/src/borg/borg-fight-attack.c, feeding the ported damage estimators
 * exact r_info-equivalent MonsterFacts (via an injected resolver) and pinned
 * traits, so the melee/missile/spell damage math matches the C constants. The
 * orchestrators (borg_attack / borg_caution) are smoke-tested through the
 * harness for their yield/commit contract.
 */

import { describe, expect, it } from "vitest";
import type { ItemView } from "@rpgm-tools/neo-angband-core";
import { BorgWorld } from "../world/model.js";
import { perceive, makePerceiveMemo } from "../perceive.js";
import { makeScenarioView, makeFakeActions, type Scenario } from "../harness.js";
import { makeBorgRng } from "../rng.js";
import type { BorgContext } from "../context.js";
import { BI } from "../trait/trait-index.js";
import type { MonsterFacts } from "../danger/index.js";
import { getDangerGlobals, MONBLOW } from "../danger/index.js";
import { BA } from "./bf.js";
import { getFightState } from "./state.js";
import { borgThrustDamageOne, borgLaunchDamageOne, borgBestMult, borgAttack } from "./attack.js";
import { borgCaution } from "./caution.js";
import { createFlowState } from "../flow/flow.js";
import { FEAT } from "../flow/flow-consts.js";

/** A fresh FlowState with the inert default hooks (borg_init_flow). */
function makeFlowState(): ReturnType<typeof createFlowState> {
  return createFlowState();
}

/** Build a seeded BorgContext with trait overrides applied after perceive. */
function makeCtx(
  scenario: Scenario = {},
  traits: Partial<Record<keyof typeof BI, number>> = {},
): BorgContext {
  const world = new BorgWorld();
  const view = makeScenarioView(scenario);
  perceive(world, view, makePerceiveMemo());
  for (const [k, v] of Object.entries(traits)) {
    world.self.trait[BI[k as keyof typeof BI]] = v;
  }
  return { world, view, act: makeFakeActions(), rng: makeBorgRng() };
}

/** MonsterFacts builder with faithful empty defaults. */
function facts(over: Partial<MonsterFacts> = {}): MonsterFacts {
  return {
    rIdx: 1,
    flags: new Set<string>(),
    level: 1,
    sleep: 0,
    spellPower: 0,
    freqInnate: 0,
    freqSpell: 0,
    hasFriends: false,
    blows: [],
    spells: [],
    ...over,
  };
}

/** A minimal ItemView carrying only the fields the estimators read. */
function item(over: Partial<ItemView> = {}): ItemView {
  return {
    handle: 1,
    kindKey: "",
    aware: true,
    nameColor: "",
    label: "x",
    tval: 0,
    sval: 0,
    pval: 0,
    number: 1,
    weight: 10,
    ac: 0,
    toA: 0,
    toH: 0,
    toD: 0,
    dd: 0,
    ds: 0,
    ego: false,
    artifact: false,
    flags: [],
    modifiers: [],
    brands: [],
    slays: [],
    resists: [],
    curses: [],
    egoName: null,
    artifactName: null,
    activation: false,
    timeout: 0,
    inscription: null,
    ...over,
  };
}

describe("borgBestMult (attack.c:374)", () => {
  it("fire brand vs non-immune -> x3", () => {
    expect(borgBestMult(item({ brands: ["FIRE"] }), facts())).toBe(3);
  });
  it("fire brand vs IM_FIRE -> x1 (no bonus)", () => {
    expect(borgBestMult(item({ brands: ["FIRE"] }), facts({ flags: new Set(["IM_FIRE"]) }))).toBe(1);
  });
  it("fire brand vs HURT_FIRE -> x6 (vuln doubles)", () => {
    expect(borgBestMult(item({ brands: ["FIRE"] }), facts({ flags: new Set(["HURT_FIRE"]) }))).toBe(6);
  });
  it("slay EVIL vs evil -> x2", () => {
    expect(borgBestMult(item({ slays: ["EVIL"] }), facts({ flags: new Set(["EVIL"]) }))).toBe(2);
  });
  it("slay UNDEAD vs undead -> x3", () => {
    expect(borgBestMult(item({ slays: ["UNDEAD"] }), facts({ flags: new Set(["UNDEAD"]) }))).toBe(3);
  });
  it("*slay* UNDEAD_5 vs undead -> x5", () => {
    expect(borgBestMult(item({ slays: ["UNDEAD_5"] }), facts({ flags: new Set(["UNDEAD"]) }))).toBe(5);
  });
});

describe("borgThrustDamageOne (attack.c:100)", () => {
  const traits = { WDD: 2, WDS: 6, BLOWS: 1, THN: 100, CLEVEL: 10, CDEPTH: 1 };
  it("2d6 warrior, chance capped at 95% -> 6", () => {
    const ctx = makeCtx({ monsters: [{ grid: { x: 21, y: 12 } }] }, traits);
    ctx.world.kills.at(1).power = 100;
    getDangerGlobals(ctx.world).resolveFacts = () => facts();
    /* base = 2*(6+1)/2 = 7; mult 1; *1 blow; chance 100->95; 7*95/100 = 6 */
    expect(borgThrustDamageOne(ctx, 1)).toBe(6);
  });
  it("unique below town gets the x6 targeting bonus (dam += dam*5)", () => {
    const ctx = makeCtx({ monsters: [{ grid: { x: 21, y: 12 } }] }, traits);
    ctx.world.kills.at(1).power = 100;
    getDangerGlobals(ctx.world).resolveFacts = () => facts({ flags: new Set(["UNIQUE"]) });
    /* 6 + 6*5 = 36 */
    expect(borgThrustDamageOne(ctx, 1)).toBe(36);
  });
});

describe("borgLaunchDamageOne resist switch (attack.c:437)", () => {
  const traits = { CDEPTH: 1, CLEVEL: 20 };
  function setup(fl: string[]) {
    const ctx = makeCtx({ monsters: [{ grid: { x: 25, y: 12 } }] }, traits);
    ctx.world.kills.at(1).power = 1000;
    getDangerGlobals(ctx.world).resolveFacts = () => facts({ flags: new Set(fl) });
    return ctx;
  }
  it("FIRE, no immunity -> full damage", () => {
    const ctx = setup([]);
    expect(borgLaunchDamageOne(ctx, getFightState(ctx.world), 1, 100, BA.FIRE, null)).toBe(100);
  });
  it("FIRE vs IM_FIRE -> 0", () => {
    const ctx = setup(["IM_FIRE"]);
    expect(borgLaunchDamageOne(ctx, getFightState(ctx.world), 1, 100, BA.FIRE, null)).toBe(0);
  });
  it("FIRE vs HURT_FIRE -> doubled", () => {
    const ctx = setup(["HURT_FIRE"]);
    expect(borgLaunchDamageOne(ctx, getFightState(ctx.world), 1, 100, BA.FIRE, null)).toBe(200);
  });
  it("HOLY_ORB vs EVIL -> doubled", () => {
    const ctx = setup(["EVIL"]);
    expect(borgLaunchDamageOne(ctx, getFightState(ctx.world), 1, 100, BA.HOLY_ORB, null)).toBe(200);
  });
});

describe("borgAttack (attack.c:5148)", () => {
  it("no monsters -> null (yield)", () => {
    const ctx = makeCtx();
    expect(borgAttack(ctx)).toBeNull();
  });
  it("adjacent monster, warrior -> a melee (walk) command", () => {
    const ctx = makeCtx(
      { monsters: [{ grid: { x: 21, y: 12 } }] },
      { WDD: 2, WDS: 6, BLOWS: 1, THN: 100, CLEVEL: 10, CDEPTH: 1, SPEED: 110 },
    );
    /* place the borg adjacent to the monster and mark the grid on-panel */
    ctx.world.self.c = { x: 20, y: 12 };
    ctx.world.kills.at(1).power = 30;
    ctx.world.kills.at(1).awake = true;
    ctx.world.map.at(21, 12).info |= 0x08 | 0x20; /* BORG_OKAY | BORG_VIEW */
    getDangerGlobals(ctx.world).resolveFacts = () =>
      facts({ blows: [{ dice: 1, sides: 4, effect: MONBLOW.HURT }] });
    const cmd = borgAttack(ctx);
    expect(cmd).not.toBeNull();
    expect(cmd!.code).toBe("walk");
  });
});

describe("borgCaution (caution.c:799)", () => {
  it("healthy, no monsters -> null (nothing to do)", () => {
    const ctx = makeCtx({}, { CURHP: 50, MAXHP: 50, CLEVEL: 20, CDEPTH: 5 });
    expect(borgCaution(ctx, makeFlowState())).toBeNull();
  });

  /* THE STALL THIS BLOCK EXISTS TO END. Every other ladder stage flows toward a
   * staircase and sets stairLess / stairMore; caution.c:1169 is the only place
   * that spends a turn on one. While it was missing, the borg walked onto an up
   * staircase, ran out of flow, explored one step off it, and was pulled back --
   * for as long as anybody left it running. */
  it("takes an up staircase it is standing on while leaving (caution.c:1169)", () => {
    const ctx = makeCtx(
      { cells: { "20,12": { feat: FEAT.LESS } }, player: { grid: { x: 20, y: 12 } } },
      { CURHP: 50, MAXHP: 50, CLEVEL: 20, CDEPTH: 5 },
    );
    /* Past the 200-turn restock grace (caution.c:1064), so the restock arm runs
     * and normalises readyMorgoth from -1 to 0 - which is what the stair choice
     * below tests for. Asserting the chain rather than hand-setting the flag: the
     * flag staying at -1 was the whole defect. */
    ctx.world.clock = 500;
    ctx.world.self.goal.leaving = true;
    const cmd = borgCaution(ctx, makeFlowState());
    expect(ctx.world.self.readyMorgoth).toBe(0);
    expect(cmd?.code).toBe("ascend");
    expect(ctx.world.self.stairLess).toBe(true);
  });

  it("takes a down staircase it is standing on while leaving (caution.c:1188)", () => {
    const ctx = makeCtx(
      { cells: { "20,12": { feat: FEAT.MORE } }, player: { grid: { x: 20, y: 12 } } },
      { CURHP: 50, MAXHP: 50, CLEVEL: 20, CDEPTH: 5 },
    );
    ctx.world.self.goal.leaving = true;
    const cmd = borgCaution(ctx, makeFlowState());
    expect(cmd?.code).toBe("descend");
  });

  it("prefers up over down when there is an up stair and the borg is hungry", () => {
    /* caution.c:1148: "don't go down if we can go up and are hungry". The gate
     * is track_less being non-empty, so a flow state that knows an up stair is
     * what makes the branch reachable at all. */
    const flow = makeFlowState();
    flow.less.add(4, 4);
    const ctx = makeCtx(
      { cells: { "20,12": { feat: FEAT.MORE } }, player: { grid: { x: 20, y: 12 } } },
      { CURHP: 50, MAXHP: 50, CLEVEL: 20, CDEPTH: 5, ISHUNGRY: 1 },
    );
    ctx.world.self.goal.leaving = true;
    expect(borgCaution(ctx, flow)).toBeNull();
    expect(ctx.world.self.stairMore).toBe(false);
  });

  it("does not touch a staircase when it has no reason to leave", () => {
    const ctx = makeCtx(
      { cells: { "20,12": { feat: FEAT.MORE } }, player: { grid: { x: 20, y: 12 } } },
      { CURHP: 50, MAXHP: 50, CLEVEL: 20, CDEPTH: 5 },
    );
    expect(borgCaution(ctx, makeFlowState())).toBeNull();
  });
});

/*
 * *** Back away *** (caution.c:1664). Borg's entire short-range tactical
 * retreat, and for a long stretch it was not ported at all: caution ran, found
 * no escape item, and returned null, after which the ladder went straight to
 * attack. A first-level character with an adjacent monster and no phase door
 * therefore had exactly one move available, and made it every time, which is
 * how a fresh character dies to an ordinary town rogue.
 *
 * The corridor is not incidental to the scenario. Upstream latches
 * adjacent_monster once and never clears it, so a single candidate square that
 * sits next to the monster kills the whole search - and in open floor next to
 * an adjacent monster, the first candidate always does. Backing away is a
 * corridor manoeuvre in practice. That is upstream 4.2.6, warts kept.
 */
describe("borgBackAway (caution.c:1664)", () => {
  /** Borg at (10,3) in a one-square-high corridor, a monster at (11,3). */
  function corridor(): BorgContext {
    const cells: Record<string, { feat: number }> = {};
    for (let x = 1; x < 19; x++) cells[`${String(x)},3`] = { feat: FEAT.FLOOR };
    const ctx = makeCtx(
      {
        width: 20,
        height: 7,
        floorFeat: FEAT.GRANITE,
        cells,
        player: { grid: { x: 10, y: 3 } },
        monsters: [{ grid: { x: 11, y: 3 } }],
      },
      /* LIGHT matters: an unlit borg is "nasty" (caution.c:810) and nasty
       * refuses to give up a square, so a scenario without it tests nothing. */
      { CURHP: 20, MAXHP: 20, CLEVEL: 1, MAXCLEVEL: 1, CDEPTH: 1, SPEED: 110, LIGHT: 1 },
    );
    ctx.world.self.c = { x: 10, y: 3 };
    /* Past the anti-summon quiet period (caution.c:1676) and short of the
     * 200-turn restock grace (caution.c:1064). */
    ctx.world.clock = 100;
    const k = ctx.world.kills.at(1);
    k.power = 30;
    k.awake = true;
    k.speed = 110;
    k.when = ctx.world.clock;
    ctx.world.map.at(11, 3).info |= 0x08 | 0x20; /* BORG_OKAY | BORG_VIEW */
    getDangerGlobals(ctx.world).avoidance = 20;
    getDangerGlobals(ctx.world).resolveFacts = () =>
      facts({ blows: [{ dice: 3, sides: 6, effect: MONBLOW.HURT }] });
    return ctx;
  }

  it("steps away from an adjacent monster down a corridor", () => {
    const ctx = corridor();
    const cmd = borgCaution(ctx, makeFlowState());
    expect(cmd?.code).toBe("walk");
    /* Away from the monster, which is east: keypad 4 is west. */
    expect(cmd?.dir).toBe(4);
    expect(ctx.world.self.goal.g).toEqual({ x: 9, y: 3 });
  });

  it("stands its ground when the danger is not worth a step", () => {
    const ctx = corridor();
    /* caution.c:1670 - a nasty situation is no time to give up a square. */
    ctx.world.self.trait[BI.ISBLIND] = 1;
    expect(borgCaution(ctx, makeFlowState())).toBeNull();
  });

  it("stays put while the anti-summon corridor timer is running", () => {
    const ctx = corridor();
    /* caution.c:1676 - the Borg fought its way into this spot on purpose. */
    getFightState(ctx.world).tAntisummon = ctx.world.clock - 10;
    expect(borgCaution(ctx, makeFlowState())).toBeNull();
  });

  it("cannot predict where a step lands while confused", () => {
    const ctx = corridor();
    ctx.world.self.trait[BI.ISCONFUSED] = 1;
    expect(borgCaution(ctx, makeFlowState())).toBeNull();
  });
});
