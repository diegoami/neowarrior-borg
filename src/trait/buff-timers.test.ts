/**
 * The buff-timer safety net (borg-trait.c:3010-3037).
 *
 * Two things are under test and only the second one is the point. The unit
 * cases pin the two assignment shapes upstream uses, because the difference
 * between "raised by the timer" and "assigned from the timer" is the whole
 * behaviour. The integration case reproduces the failure the net exists for: a
 * buff whose "off" message never arrives, which without the cross-check leaves
 * the Borg believing the buff is still running and silently removes the rung
 * that would recast it.
 */

import { afterEach, describe, expect, it } from "vitest";
import { BorgWorld } from "../world/model.js";
import { makeTemp } from "../world/model.js";
import { perceive, makePerceiveMemo } from "../perceive.js";
import { makeScenarioView, makeFakeActions, type Scenario } from "../harness.js";
import { makeBorgRng } from "../rng.js";
import type { BorgContext } from "../context.js";
import { borgNotice } from "./trait.js";
import { borgCheatBuffTimers, borgHasBuffTimers } from "./buff-timers.js";
import { setBuffTimerSafetyNet, resetBuffTimerSafetyNet } from "./config.js";
import { getDangerGlobals } from "../danger/index.js";
import { borgDefend } from "../fight/defend.js";
import { TV, SVAL } from "../item/svals.js";
import type { ItemView, PlayerStatusView } from "@rpgm-tools/neo-angband-core";

describe("borgCheatBuffTimers (borg-trait.c:3010-3037)", () => {
  it("clears a flag the engine reports as expired", () => {
    const temp = makeTemp();
    temp.bless = true;
    temp.hero = true;
    temp.resFire = true;
    borgCheatBuffTimers(temp, status({ blessed: 0, hero: 0, resFire: 0 }));
    expect(temp.bless).toBe(false);
    expect(temp.hero).toBe(false);
    expect(temp.resFire).toBe(false);
  });

  it("raises a flag whose on-message was missed", () => {
    const temp = makeTemp();
    borgCheatBuffTimers(
      temp,
      status({ blessed: 9, shero: 4, resPois: 30, protEvil: 12, fast: 7 }),
    );
    expect(temp.bless).toBe(true);
    expect(temp.berserk).toBe(true);
    expect(temp.resPois).toBe(true);
    expect(temp.protFromEvil).toBe(true);
    expect(temp.fast).toBe(true);
  });

  it("never lowers haste or protection from evil from the timer (:3013-3022)", () => {
    /* Upstream writes these two as `if (!flag && timer)`, so the engine can
     * only ever turn them on. Both stay set against a zero timer. */
    const temp = makeTemp();
    temp.fast = true;
    temp.protFromEvil = true;
    borgCheatBuffTimers(temp, status({ fast: 0, sprint: 0, protEvil: 0 }));
    expect(temp.fast).toBe(true);
    expect(temp.protFromEvil).toBe(true);
  });

  it("reads haste from either the haste or the sprint timer", () => {
    const temp = makeTemp();
    borgCheatBuffTimers(temp, status({ fast: 0, sprint: 5 }));
    expect(temp.fast).toBe(true);
  });

  it("reads the shield flag from either mystic shield or stoneskin", () => {
    const mystic = makeTemp();
    borgCheatBuffTimers(mystic, status({ shield: 11, stoneskin: 0 }));
    expect(mystic.shield).toBe(true);

    const stone = makeTemp();
    borgCheatBuffTimers(stone, status({ shield: 0, stoneskin: 11 }));
    expect(stone.shield).toBe(true);

    const neither = makeTemp();
    neither.shield = true;
    borgCheatBuffTimers(neither, status({ shield: 0, stoneskin: 0 }));
    expect(neither.shield).toBe(false);
  });

  it("leaves the message-derived flags alone when no timers are reported", () => {
    /* A hand-built view that describes only afflictions. Nothing to reconcile
     * against is not the same as every buff being off, and reading it that way
     * would discard the whole message table's answer. */
    const bare = {
      blind: 0,
      confused: 0,
      afraid: 0,
      poisoned: 0,
      cut: 0,
      stun: 0,
      paralyzed: 0,
      food: 5000,
    } as unknown as PlayerStatusView;
    expect(borgHasBuffTimers(bare)).toBe(false);

    const temp = makeTemp();
    temp.bless = true;
    temp.hero = true;
    borgCheatBuffTimers(temp, bare);
    expect(temp.bless).toBe(true);
    expect(temp.hero).toBe(true);
  });

  it("leaves the flags upstream cross-checks but the view cannot report", () => {
    /* regen / venom / smiteEvil / seeInv have no PlayerStatusView timer, so
     * they stay the message table's business alone. */
    const temp = makeTemp();
    temp.regen = true;
    temp.venom = true;
    temp.smiteEvil = true;
    temp.seeInv = 1000;
    borgCheatBuffTimers(temp, status({ blessed: 0 }));
    expect(temp.regen).toBe(true);
    expect(temp.venom).toBe(true);
    expect(temp.smiteEvil).toBe(true);
    expect(temp.seeInv).toBe(1000);
  });
});

describe("a buff-off message that never arrives", () => {
  it("leaves the flag latched until the cross-check clears it, and the Borg blesses again the same turn", () => {
    const world = new BorgWorld();
    const memo = makePerceiveMemo();

    /* Turn one: the blessing lands and the Borg hears about it. */
    tick(world, memo, {
      messages: ["You feel righteous"],
      player: { status: { blessed: 12 } },
    });
    expect(world.self.temp.bless).toBe(true);

    /* Turn two, with the prayer expired and its message LOST. Nothing in the
     * message stream says so, so only the engine's own timer knows. */
    const ctx = tick(world, memo, {
      monsters: [{ grid: { x: 21, y: 12 } }],
      player: { status: { blessed: 0 } },
    }, [blessingScroll()]);

    expect(world.self.temp.bless).toBe(false);

    /* And the correction reaches the same decision: the bless rung opens by
     * returning 0 on a set flag, so a latched flag would have removed it. */
    getDangerGlobals(world).avoidance = 100;
    expect(borgDefend(ctx, 10)).toEqual({
      code: "read",
      args: { handle: 1 },
    });
  });

  it("does not recast while the engine says the buff is genuinely still up", () => {
    const world = new BorgWorld();
    const memo = makePerceiveMemo();
    tick(world, memo, {
      messages: ["You feel righteous"],
      player: { status: { blessed: 12 } },
    });

    const ctx = tick(world, memo, {
      monsters: [{ grid: { x: 21, y: 12 } }],
      player: { status: { blessed: 11 } },
    }, [blessingScroll()]);

    expect(world.self.temp.bless).toBe(true);
    getDangerGlobals(world).avoidance = 100;
    expect(borgDefend(ctx, 10)).toBeNull();
  });
});

describe("the Bug Fixes cross-mod gate (neo-angband#32)", () => {
  afterEach(() => resetBuffTimerSafetyNet());

  it("leaves a stale flag latched when the toggle is off", () => {
    setBuffTimerSafetyNet(false);
    const world = new BorgWorld();
    const memo = makePerceiveMemo();
    tick(world, memo, {
      messages: ["You feel righteous"],
      player: { status: { blessed: 12 } },
    });
    expect(world.self.temp.bless).toBe(true);

    /* Same reproduction as the suite above - the timer now says expired - but
     * with the gate off nothing reconciles it. */
    tick(world, memo, {
      monsters: [{ grid: { x: 21, y: 12 } }],
      player: { status: { blessed: 0 } },
    }, [blessingScroll()]);
    expect(world.self.temp.bless).toBe(true);
  });

  it("is on by default, so an absent Bug Fixes still runs the safety net", () => {
    const world = new BorgWorld();
    const memo = makePerceiveMemo();
    tick(world, memo, {
      messages: ["You feel righteous"],
      player: { status: { blessed: 12 } },
    });
    tick(world, memo, {
      monsters: [{ grid: { x: 21, y: 12 } }],
      player: { status: { blessed: 0 } },
    }, [blessingScroll()]);
    expect(world.self.temp.bless).toBe(false);
  });
});

/* ------------------------------------------------------------------ */

/** A PlayerStatusView carrying healthy afflictions plus the given timers. */
function status(over: Partial<PlayerStatusView>): PlayerStatusView {
  return {
    blind: 0,
    confused: 0,
    afraid: 0,
    poisoned: 0,
    cut: 0,
    stun: 0,
    paralyzed: 0,
    food: 5000,
    fast: 0,
    sprint: 0,
    protEvil: 0,
    hero: 0,
    shero: 0,
    shield: 0,
    stoneskin: 0,
    blessed: 0,
    fastcast: 0,
    resAcid: 0,
    resElec: 0,
    resFire: 0,
    resCold: 0,
    resPois: 0,
    ...over,
  };
}

/** One scroll of blessing, handle 1, in the pack. */
function blessingScroll(): ItemView {
  return {
    handle: 1,
    kindKey: "",
    aware: true,
    nameColor: "",
    label: "a Scroll of Blessing",
    tval: TV.SCROLL,
    sval: SVAL.scroll.blessing!,
    pval: 0,
    number: 1,
    weight: 5,
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
  };
}

/**
 * One decision's worth of perception against `world`, in the controller's own
 * order: borgNotice (which runs the cross-check) and then the message pass.
 */
function tick(
  world: BorgWorld,
  memo: ReturnType<typeof makePerceiveMemo>,
  scenario: Scenario,
  pack: ItemView[] = [],
): BorgContext {
  const base = makeScenarioView(scenario);
  const view = { ...base, inventory: () => [...pack] };
  const ctx: BorgContext = {
    world,
    view,
    act: makeFakeActions(),
    rng: makeBorgRng(),
  };
  borgNotice(ctx);
  perceive(world, view, memo);
  return ctx;
}
