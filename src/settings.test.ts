/**
 * Every setting a player can move has to move something.
 *
 * THE FAILURE THIS EXISTS FOR is the one PLANNED.md was opened about and the one
 * `plugin.test.ts` calls the anti-inert test: a seam that is present, typed,
 * documented and read by nothing. A settings surface is unusually good at
 * hiding it. `setBorgCfg` cannot fail, `borgCfg()` returns what it was given,
 * and a Borg built with any combination of settings still returns a legal
 * command every turn - so "the setting was stored" and "the setting was obeyed"
 * look identical from outside, and only the second is worth shipping.
 *
 * So each test below changes ONE setting and asserts a DIFFERENT DECISION, never
 * a different stored value. Where the difference is a number, both numbers are
 * asserted rather than only their order, so a change that makes the two equal
 * fails instead of passing on a stale comparison.
 *
 * `resetBorgCfg` runs between tests because the settings live at module scope,
 * the way `borg_cfg[]` does - see src/trait/config.ts for why that is the right
 * place for them and what it costs.
 */

import { afterEach, describe, expect, it } from "vitest";
import type { AgentView, ItemView, PlayerView } from "@rpgm-tools/neo-angband-core";
import type { BorgContext } from "./context.js";
import { BorgWorld } from "./world/model.js";
import { makeScenarioView, makeFakeActions } from "./harness.js";
import { makeBorgRng } from "./rng.js";
import { createBorg } from "./controller.js";
import { getFightState } from "./fight/index.js";
import { buildThinkSession, buildStoreDeps } from "./think-session.js";
import {
  BI,
  BI_MAX,
  CLASS_MAGE,
  CLASS_WARRIOR,
  borgCfg,
  borgPower,
  borgPrepared,
  defaultCfg,
  resetBorgCfg,
  setBorgCfg,
} from "./trait/index.js";

afterEach(() => {
  resetBorgCfg();
});

/** A BorgContext over a bare scenario view, with a trait table caller-supplied. */
function ctxWith(trait: number[], player: Partial<PlayerView> = {}): BorgContext {
  const base = makeScenarioView({ player });
  const view: AgentView = {
    ...base,
    equipment: () => [] as Array<ItemView | null>,
    inventory: () => [] as ItemView[],
  };
  const ctx: BorgContext = {
    world: new BorgWorld(),
    view,
    act: makeFakeActions(),
    rng: makeBorgRng(),
  };
  ctx.world.self.trait = trait;
  return ctx;
}

/**
 * A warrior who can see, is fed, and is experienced enough to clear the
 * "Clevel < depth" rule - which `borg_plays_risky` does NOT skip, so it has to
 * be out of the way before the per-class gate is what the test is measuring.
 */
function shallowWarrior(maxHp: number): number[] {
  const t = new Array<number>(BI_MAX).fill(0);
  t[BI.CLASS] = CLASS_WARRIOR;
  t[BI.LIGHT] = 1;
  t[BI.FOOD] = 100;
  t[BI.AFUEL] = 10;
  t[BI.CLEVEL] = 10;
  t[BI.MAXCLEVEL] = 10;
  t[BI.MAXHP] = maxHp;
  t[BI.CURHP] = maxHp;
  return t;
}

describe("borg_plays_risky", () => {
  it("holds a thin character above depth 2, and stops holding it when set", () => {
    /* borg-prepared.c:97 - the 30 hp floor, one of the gates the risky arm
       skips wholesale. 25 hit points is under it and everything else is clear,
       so the reason string is the entire difference between the two runs. */
    expect(borgPrepared(ctxWith(shallowWarrior(25)), 2)).toBe("30 hp");

    setBorgCfg({ playsRisky: true });
    expect(borgPrepared(ctxWith(shallowWarrior(25)), 2)).toBeNull();
  });

  it("leaves a character who clears the gate alone either way", () => {
    /* Non-vacuity in the other direction: the setting must not be the only
       thing deciding this, or the test above would pass against a stub that
       always returns null when it is on. */
    expect(borgPrepared(ctxWith(shallowWarrior(80)), 2)).toBeNull();
    setBorgCfg({ playsRisky: true });
    expect(borgPrepared(ctxWith(shallowWarrior(80)), 2)).toBeNull();
  });

  it("reaches the tactical arms through the fight state, at build time", () => {
    /* borg_caution's heal chance and borg_escape's danger multiplier read the
       live struct rather than the config, upstream and here. So the setting has
       to be copied onto the fight state when the Borg is built; without this
       line the two arms would stay stock no matter what the player chose, and
       the borgPrepared test above would still pass. */
    const stock = createBorg();
    expect(getFightState(stock.world).playsRisky).toBe(false);

    const risky = createBorg({ cfg: { playsRisky: true } });
    expect(getFightState(risky.world).playsRisky).toBe(true);
  });
});

describe("the borg_worships_* gear weights", () => {
  /**
   * A character with something in every scored category.
   *
   * A MAGE, because two of the five weights are unreachable for a warrior: the
   * spell-point weight sits behind the class having a casting stat at all, and
   * scoring a warrior would have made that test pass on an unchanged number. The
   * constitution index and the hit-point adjustment have to be non-zero for the
   * same reason - the hit-point weight multiplies them.
   */
  function scored(): number[] {
    const t = new Array<number>(BI_MAX).fill(0);
    t[BI.CLASS] = CLASS_MAGE;
    t[BI.LIGHT] = 1;
    t[BI.FOOD] = 100;
    t[BI.CLEVEL] = 20;
    t[BI.MAXCLEVEL] = 20;
    t[BI.MAXHP] = 200;
    t[BI.CURHP] = 200;
    t[BI.MAXSP] = 40;
    t[BI.SP_ADJ] = 60;
    t[BI.CON_INDEX] = 20;
    t[BI.DEX_INDEX] = 20;
    t[BI.HP_ADJ] = 100;
    t[BI.SPEED] = 120;
    t[BI.ARMOR] = 60;
    t[BI.TOHIT] = 15;
    return t;
  }

  /* Each of these is a separate weight in borg_power, and a copy-paste slip in
     the flag table would wire two toggles to one weight. Scoring each on its own
     and requiring a strictly higher number is what separates them. */
  const weights = [
    ["worshipsDamage", "damage"],
    ["worshipsSpeed", "speed"],
    ["worshipsHp", "hit points"],
    ["worshipsMana", "spell points"],
    ["worshipsAc", "armour class"],
  ] as const;

  for (const [key, what] of weights) {
    it(`scores ${what} higher when borg_${key.toLowerCase()} is set`, () => {
      const stock = borgPower(ctxWith(scored()));
      setBorgCfg({ [key]: true });
      const worshipped = borgPower(ctxWith(scored()));
      expect(worshipped).toBeGreaterThan(stock);
    });
  }

  it("adds nothing when none of them is set", () => {
    /* The stock Borg is upstream's stock Borg. A default that quietly turned one
       of these on would show up as a port that values gear differently from the
       C it is checked against, everywhere, forever. */
    const stock = defaultCfg();
    for (const [key] of weights) expect(stock[key]).toBe(false);
  });
});

describe("the store settings", () => {
  it("reach the store ladder's deps", () => {
    /* borg_worships_gold and borg_self_scum are read off StoreDeps rather than
       through resolveOpts, because the store subsystem was ported against that
       seam. So this is where they can go missing: buildStoreDeps is the only
       place a live think gets its deps from, and until this change it built
       them without consulting the settings at all. */
    setBorgCfg({ worshipsGold: true, selfScum: false });
    const deps = buildStoreDeps(buildThinkSession());
    expect(deps.worshipsGold).toBe(true);
    expect(deps.selfScum).toBe(false);
  });

  it("reach them on the no-loadout-resolver path too", () => {
    /* buildStoreDeps returns early when the host wired no loadout evaluator, and
       that early return is a whole second construction of the same object. It is
       the branch a test would skip and a real game on an older engine would
       take. */
    setBorgCfg({ worshipsGold: true });
    const session = buildThinkSession();
    expect(session.resolvers.loadoutPower).toBeUndefined();
    expect(buildStoreDeps(session).worshipsGold).toBe(true);
  });

  it("defaults self-scumming ON, as upstream ships it", () => {
    /* borg_settings[] (borg-init.c:82) has borg_self_scum true. The port had it
       false at both of its call sites, so a stock Borg here never saved up for
       anything a stock Borg upstream would. */
    expect(defaultCfg().selfScum).toBe(true);
    expect(buildStoreDeps(buildThinkSession()).selfScum).toBe(true);
  });
});

describe("borg_munchkin_start", () => {
  /** A warrior carrying speed potions, at a given (max) character level. */
  function withSpeedPotions(maxClevel: number): number[] {
    const t = new Array<number>(BI_MAX).fill(0);
    t[BI.CLASS] = CLASS_WARRIOR;
    t[BI.LIGHT] = 1;
    t[BI.FOOD] = 100;
    t[BI.CLEVEL] = maxClevel;
    t[BI.MAXCLEVEL] = maxClevel;
    t[BI.MAXHP] = 50;
    t[BI.CURHP] = 50;
    t[BI.ASPEED] = 5;
    return t;
  }

  it("stops rewarding speed potions below borg_munchkin_level", () => {
    /* trait/power.ts:636 - munchGate suppresses the whole ASPEED term when set
       and the character has not yet reached the level threshold. */
    const stock = borgPower(ctxWith(withSpeedPotions(5)));
    setBorgCfg({ munchkinStart: true });
    const munchkin = borgPower(ctxWith(withSpeedPotions(5)));
    expect(munchkin).toBeLessThan(stock);
  });

  it("leaves a character past the level threshold alone either way", () => {
    /* Non-vacuity: default borg_munchkin_level is 12, and this port has no
       toggle for the level itself, so 20 clears the gate regardless of the
       flag. Without this the test above could pass against a stub that always
       lowered the score when the flag was set. */
    const stock = borgPower(ctxWith(withSpeedPotions(20)));
    setBorgCfg({ munchkinStart: true });
    const munchkin = borgPower(ctxWith(withSpeedPotions(20)));
    expect(munchkin).toBe(stock);
  });
});

describe("installing settings", () => {
  it("starts stock, and a Borg built with none leaves it stock", () => {
    expect(borgCfg()).toEqual(defaultCfg());
    createBorg();
    expect(borgCfg()).toEqual(defaultCfg());
  });

  it("keeps upstream's default for every key the caller did not name", () => {
    /* The partial has to be a partial. Spreading a caller's object over an empty
       one instead of over the defaults would switch off everything unmentioned,
       which for selfScum and usesSwaps means silently leaving upstream's
       behaviour behind. */
    createBorg({ cfg: { worshipsHp: true } });
    expect(borgCfg()).toEqual({ ...defaultCfg(), worshipsHp: true });
  });

  it("does not carry one Borg's settings into the next", () => {
    createBorg({ cfg: { playsRisky: true, worshipsGold: true } });
    createBorg({ cfg: { worshipsGold: true } });
    expect(borgCfg().playsRisky).toBe(false);
    expect(borgCfg().worshipsGold).toBe(true);
  });

  it("still lets a caller ask its own question at the call site", () => {
    /* Twenty-odd ported call sites take an opts bundle and the tests use it. An
       ambient value that overrode an explicit one would make every one of those
       tests depend on what ran before it. */
    setBorgCfg({ playsRisky: true });
    expect(borgPrepared(ctxWith(shallowWarrior(25)), 2, { cfg: { playsRisky: false } })).toBe(
      "30 hp",
    );
  });
});
