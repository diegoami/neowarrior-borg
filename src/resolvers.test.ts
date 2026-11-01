/**
 * Tests for makeCoreResolvers: the host wiring that turns core MonsterRace
 * records into the MonsterFacts the danger evaluator needs. Proves the bridge
 * reads blows (dice/sides/effect), flags, spell list, and the spell/frequency
 * fields the frozen AgentView cannot surface.
 */

import { describe, expect, it } from "vitest";
import { RF, RSF } from "@rpgm-tools/neo-angband-core";
import type {
  ItemView,
  LoadoutChange,
  LoadoutSimulation,
  MonsterRace,
  PlayerView,
} from "@rpgm-tools/neo-angband-core";
import { makeCoreResolvers } from "./resolvers.js";
import type { BorgLoadoutAnswer, BorgLoadoutChange } from "./trait/simulate.js";
import type { CoreObjectLookup, CoreShopLookup } from "./resolvers.js";
import { BorgWorld } from "./world/model.js";
import { makeScenarioView, makeFakeActions } from "./harness.js";
import { MONBLOW } from "./danger/tables.js";
import { getDerived } from "./trait/state.js";
import type { BorgContext } from "./context.js";

/** A minimal MonsterRace carrying only the fields the resolver reads. */
function fakeRace(over: Partial<MonsterRace> = {}): MonsterRace {
  const blow = {
    method: {} as never,
    effect: { name: "FIRE" } as never,
    dice: { randomValue: () => ({ base: 0, dice: 3, sides: 6, mBonus: 0 }) } as never,
    diceRaw: "3d6",
  };
  return {
    ridx: 7,
    name: "test-drake",
    flags: [RF.UNIQUE] as unknown as MonsterRace["flags"],
    spellFlags: [RSF.BR_FIRE] as unknown as MonsterRace["spellFlags"],
    level: 20,
    sleep: 10,
    spellPower: 25,
    freqInnate: 4,
    freqSpell: 4,
    friends: [],
    friendsBase: [],
    blows: [blow] as unknown as MonsterRace["blows"],
    ...over,
  } as MonsterRace;
}

/** A context whose world has one tracked kill of race ridx 7. */
function ctxWithKill(): BorgContext {
  const world = new BorgWorld();
  const idx = world.kills.alloc();
  const k = world.kills.at(idx);
  k.rIdx = 7;
  k.mIdx = 101;
  k.pos = { x: 5, y: 5 };
  return { world, view: makeScenarioView(), act: makeFakeActions(), rng: undefined as never };
}

describe("makeCoreResolvers", () => {
  it("builds MonsterFacts from a core race (blows, flags, spells, freq)", () => {
    const resolvers = makeCoreResolvers({ races: [fakeRace()] });
    const ctx = ctxWithKill();
    const facts = resolvers.resolveMonsterFacts!(ctx, 1);

    expect(facts.rIdx).toBe(7);
    expect(facts.level).toBe(20);
    expect(facts.sleep).toBe(10);
    expect(facts.spellPower).toBe(25);
    expect(facts.freqInnate).toBe(4);
    expect(facts.flags.has("UNIQUE")).toBe(true);
    // The single fire blow: 3d6, MONBLOW.FIRE.
    expect(facts.blows).toHaveLength(1);
    expect(facts.blows[0]).toEqual({ dice: 3, sides: 6, effect: MONBLOW.FIRE });
    // The spell list carries the BR_FIRE ordinal.
    expect(facts.spells).toContain(RSF.BR_FIRE as unknown as number);
  });

  it("falls back to MonsterView-derived facts for an unknown race", () => {
    const resolvers = makeCoreResolvers({ races: [] }); // no race ridx 7
    const ctx = ctxWithKill();
    const facts = resolvers.resolveMonsterFacts!(ctx, 1);
    // Unknown race -> default resolver: no blows, zero freq (conservative).
    expect(facts.rIdx).toBe(7);
    expect(facts.blows).toHaveLength(0);
    expect(facts.freqInnate).toBe(0);
  });

  it("gives a MOD'S monster the same real facts as one of core's", () => {
    /* A hard requirement of this mod: modded creatures must work with the Borg
     * the same as vanilla ones. Nothing here opts in to that - the resolver indexes
     * by ridx and never looks at `from`, so a mod's race is resolved by the same
     * line of code, and the only way to BREAK this would be to add a provenance
     * check. The test exists so that nobody adds one. */
    const modRace = fakeRace({
      name: "joiner ant",
      from: { owner: "tutorial-03" },
    } as Partial<MonsterRace>);
    const facts = makeCoreResolvers({ races: [modRace] }).resolveMonsterFacts!(
      ctxWithKill(),
      1,
    );
    /* Real facts, not the conservative fallback: a mod's monster is dangerous. */
    expect(facts.blows).toEqual([{ dice: 3, sides: 6, effect: MONBLOW.FIRE }]);
    expect(facts.freqInnate).toBe(4);
    expect(facts.flags.has("UNIQUE")).toBe(true);
  });

  it("marks races with companions as hasFriends", () => {
    const resolvers = makeCoreResolvers({
      races: [fakeRace({ friends: [{} as never] })],
    });
    const facts = resolvers.resolveMonsterFacts!(ctxWithKill(), 1);
    expect(facts.hasFriends).toBe(true);
  });
});

/** A minimal ItemView carrying only the fields the activation seam reads. */
function fakeItem(over: Partial<ItemView> = {}): ItemView {
  return {
    handle: 1,
    kindKey: "",
    aware: true,
    nameColor: "",
    label: "test item",
    tval: 30,
    sval: 5,
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

/** A BorgContext whose view.equipment() returns the given items. */
function ctxWithEquipment(items: ItemView[]): BorgContext {
  return {
    world: new BorgWorld(),
    view: { ...makeScenarioView(), equipment: () => items },
    act: makeFakeActions(),
    rng: undefined as never,
  };
}

/** A CoreObjectLookup that answers one kind, one ego and one artifact. */
function fakeObjects(over: Partial<CoreObjectLookup> = {}): CoreObjectLookup {
  return {
    lookupKind: () => null,
    findEgo: () => null,
    findArtifact: () => null,
    ...over,
  };
}

describe("makeCoreResolvers: activation identity", () => {
  it("finds a kind-level activation on an equipped item, charged", () => {
    const objects = fakeObjects({
      lookupKind: (tval, sval) =>
        tval === 30 && sval === 5 ? { activation: { name: "LIGHT" } } : null,
    });
    const resolvers = makeCoreResolvers({ races: [], objects });
    const ctx = ctxWithEquipment([fakeItem({ activation: true, timeout: 0 })]);

    expect(resolvers.resolveActivation!(ctx, "act_light", true)).toBe(true);
    expect(resolvers.activateHandle!(ctx, "act_light")).toBe(1);
  });

  it("an artifact's activation overrides its base kind's", () => {
    const objects = fakeObjects({
      lookupKind: () => ({ activation: { name: "LIGHT" } }),
      findArtifact: (name) =>
        name === "Foo" ? { activation: { name: "ILLUMINATION" } } : null,
    });
    const resolvers = makeCoreResolvers({ races: [], objects });
    const ctx = ctxWithEquipment([
      fakeItem({ activation: true, artifact: true, artifactName: "Foo" }),
    ]);

    expect(resolvers.resolveActivation!(ctx, "act_light", false)).toBe(false);
    expect(resolvers.resolveActivation!(ctx, "act_illumination", false)).toBe(true);
  });

  it("falls back to the kind when an ego item carries no activation of its own", () => {
    const objects = fakeObjects({
      lookupKind: () => ({ activation: { name: "LIGHT" } }),
      findEgo: (name) => (name === "of Foo" ? { activation: null } : null),
    });
    const resolvers = makeCoreResolvers({ races: [], objects });
    const ctx = ctxWithEquipment([
      fakeItem({ activation: true, ego: true, egoName: "of Foo" }),
    ]);

    expect(resolvers.resolveActivation!(ctx, "act_light", false)).toBe(true);
  });

  it("checkCharge rejects a discharged item, and activateHandle always requires a charge", () => {
    const objects = fakeObjects({
      lookupKind: () => ({ activation: { name: "LIGHT" } }),
    });
    const resolvers = makeCoreResolvers({ races: [], objects });
    const ctx = ctxWithEquipment([fakeItem({ activation: true, timeout: 5 })]);

    expect(resolvers.resolveActivation!(ctx, "act_light", true)).toBe(false);
    expect(resolvers.resolveActivation!(ctx, "act_light", false)).toBe(true);
    expect(resolvers.activateHandle!(ctx, "act_light")).toBeNull();
  });

  it("stays on the conservative default with no object registry", () => {
    const resolvers = makeCoreResolvers({ races: [] });
    const ctx = ctxWithEquipment([fakeItem({ activation: true })]);

    expect(resolvers.resolveActivation!(ctx, "act_light", false)).toBe(false);
    expect(resolvers.activateHandle!(ctx, "act_light")).toBeNull();
  });
});

describe("makeCoreResolvers: in-shop signal", () => {
  function fakeState(shopnum: number): CoreShopLookup {
    return {
      actor: { grid: { x: 5, y: 5 } },
      chunk: { feature: () => ({ shopnum }) },
    };
  }

  it("reports the store number (shopnum - 1) when standing on an entrance", () => {
    const resolvers = makeCoreResolvers({ races: [], state: fakeState(3) });
    expect(resolvers.inShop!(ctxWithEquipment([]))).toBe(2);
  });

  it("reports null off a shop entrance", () => {
    const resolvers = makeCoreResolvers({ races: [], state: fakeState(0) });
    expect(resolvers.inShop!(ctxWithEquipment([]))).toBeNull();
  });

  it("stays on the conservative default with no live state", () => {
    const resolvers = makeCoreResolvers({ races: [] });
    expect(resolvers.inShop!(ctxWithEquipment([]))).toBeNull();
  });
});

describe("makeCoreResolvers: hypothetical-loadout power", () => {
  /**
   * A view that answers simulateLoadout with a loadout differing from the live
   * one only in the fields named. The engine's real accessor derives those from
   * calc_bonuses; here they are stated, because what is under test is the Borg
   * half - that the ported borg_notice / borg_power run over the answer and that
   * running them leaves the live self-model alone.
   *
   * It answers with `after` alone, where the real `LoadoutSimulation` also
   * carries before / delta / placements / unresolved. That is why the cast goes
   * through `unknown`: three fields of `after` are all the ported self-model
   * reads, and filling in the rest would be fixture nobody looks at. The claim
   * this fixture is NOT making - that the narrowed shapes still match the
   * engine's - is pinned by the compile-time check at the end of this file.
   */
  function viewThatSimulates(
    over: {
      player?: Partial<PlayerView>;
      equipment?: (ItemView | null)[];
      inventory?: ItemView[];
    },
    onChange?: (change: unknown) => void,
  ): BorgContext["view"] {
    const base = makeScenarioView();
    return {
      ...base,
      simulateLoadout: (change: unknown) => {
        onChange?.(change);
        return {
          after: {
            player: { ...base.player(), ...over.player },
            equipment: over.equipment ?? [],
            inventory: over.inventory ?? [],
          },
        };
      },
    } as unknown as BorgContext["view"];
  }

  function ctxWithView(view: BorgContext["view"]): BorgContext {
    return {
      world: new BorgWorld(),
      view,
      act: makeFakeActions(),
      rng: undefined as never,
    };
  }

  it("is installed without the host being asked anything", () => {
    /* It used to be conditional on a `loadout` input the plugin filled by
       probing `ctx.core.simulateLoadout`, because the mod loaded into games that
       predated the export. manifest.json now requires an engine that has it, and
       the seam reads the accessor off the VIEW anyway, so there is nothing left
       for a host to answer. */
    expect(makeCoreResolvers({ races: [] }).loadoutPower).toBeDefined();
  });

  it("scores the SIMULATED loadout, not the live one", () => {
    const resolvers = makeCoreResolvers({ races: [] });
    const slow = ctxWithView(viewThatSimulates({ player: { speed: 110 } }));
    const fast = ctxWithView(viewThatSimulates({ player: { speed: 130 } }));

    const slowPower = resolvers.loadoutPower!(slow, {});
    const fastPower = resolvers.loadoutPower!(fast, {});
    expect(slowPower).not.toBeNull();
    /* borg_power's speed reward (power.c) is what makes this observable: a
       simulation that quietly scored the live view would return the same number
       for both. */
    expect(fastPower!).toBeGreaterThan(slowPower!);
  });

  it("passes the change through to the engine verbatim", () => {
    const seen: unknown[] = [];
    const resolvers = makeCoreResolvers({ races: [] });
    const ctx = ctxWithView(viewThatSimulates({}, (c) => seen.push(c)));
    const change = { wield: [{ from: "gear" as const, handle: 12 }] };
    resolvers.loadoutPower!(ctx, change);
    expect(seen).toEqual([change]);
  });

  it("leaves the LIVE self-model exactly as it found it", () => {
    /* The failure this guards against is not an exception. A ladder scores a
       dozen candidates a turn; if scoring wrote through to the live world, the
       Borg would spend the rest of the think believing it was wearing the last
       thing it merely considered. */
    const resolvers = makeCoreResolvers({ races: [] });
    const ctx = ctxWithView(viewThatSimulates({ player: { speed: 130 } }));
    ctx.world.self.trait = [1, 2, 3];
    ctx.world.self.power = 4242;
    const derivedBefore = getDerived(ctx.world);
    derivedBefore.has.set("marker", 9);

    const scored = resolvers.loadoutPower!(ctx, {});
    expect(scored).not.toBeNull();
    expect(scored).not.toBe(4242);

    expect(ctx.world.self.trait).toEqual([1, 2, 3]);
    expect(ctx.world.self.power).toBe(4242);
    /* The derived side-state is keyed by the world object, so a simulation that
       reused the live world would have replaced this block wholesale. */
    expect(getDerived(ctx.world)).toBe(derivedBefore);
    expect(getDerived(ctx.world).has.get("marker")).toBe(9);
  });

  it("answers null on a view with no derive behind it", () => {
    /* Not a version case: the agent API declares `simulateLoadout` optional on
       the view itself, and the engine answers null when there is no live derive
       installed - a worldless harness, which is exactly the view below. Null
       rather than the current power, so "cannot answer" and "nothing would
       change" stay distinguishable. */
    const resolvers = makeCoreResolvers({ races: [] });
    const ctx = ctxWithEquipment([]);
    expect(resolvers.loadoutPower!(ctx, {})).toBeNull();
  });

  it("scores a MOD'S item exactly as it scores one of core's", () => {
    /* The hard requirement again: modded items must work with the Borg the same
       as vanilla ones. Nothing opts in - the simulated loadout arrives as
       ItemViews and the ported self-model reads their PROPERTIES, never their
       provenance. The two loadouts below differ only in the names and the
       namespaced id, so an equal score is the claim and the > baseline check is
       what stops it from being vacuous. */
    const resolvers = makeCoreResolvers({ races: [] });
    const properties: Partial<ItemView> = {
      tval: 36 /* TV_SOFT_ARMOR */,
      ac: 12,
      toA: 8,
      weight: 80,
      ego: true,
      resists: [{ element: "ACID", level: 1 }],
    };
    const coreItem = fakeItem({ ...properties, egoName: "of Resist Acid" });
    const modItem = fakeItem({
      ...properties,
      egoName: "of the Tutorial",
      kindId: "tutorial-02:padded-jerkin",
    });

    /* Slot 6 is the body-armour slot: equipment() is indexed by BODY SLOT, so an
       armour handed over at index 0 would be read as the wielded weapon. */
    const inBodySlot = (item: ItemView | null): (ItemView | null)[] => {
      const slots = new Array<ItemView | null>(12).fill(null);
      slots[6] = item;
      return slots;
    };
    const score = (item: ItemView | null): number =>
      resolvers.loadoutPower!(
        ctxWithView(viewThatSimulates({ equipment: inBodySlot(item) })),
        {},
      )!;

    /* Non-vacuity first: the armour has to be SEEN, or an equality between two
       unseen items would prove nothing. Direction is deliberately not asserted -
       whether this particular jerkin is an improvement is borg_power's business
       and not the claim here. */
    expect(score(coreItem)).not.toBe(score(null));
    expect(score(modItem)).toBe(score(coreItem));
  });
});

describe("the narrowed loadout shapes still match the engine's own", () => {
  /**
   * `src/trait/simulate.ts` declares `BorgLoadoutChange` and `BorgLoadoutAnswer`
   * structurally rather than importing `LoadoutChange` and `LoadoutSimulation`,
   * because a mod driving the frozen view can only name a subset of the engine's
   * shapes: `LoadoutItemRef` has a third arm holding a live `GameObject`, and the
   * simulation carries before / after / delta where the ported self-model reads
   * three fields of `after`.
   *
   * Narrower is fine; DIVERGED is not, and until 0.25.0 published these types
   * there was nothing here to compare against. The two aliases below are the
   * check, and they are compile-time: a field renamed or retyped in the engine
   * fails `pnpm typecheck` rather than surfacing as the Borg valuing gear
   * wrongly, which is invisible in play.
   */
  type AssignableTo<Wide, Narrow extends Wide> = [Wide, Narrow];
  /* What the Borg PASSES must be something the engine accepts. */
  type _ChangeIsAccepted = AssignableTo<LoadoutChange, BorgLoadoutChange>;
  /* What the engine RETURNS must be something the Borg can read. */
  type _AnswerIsReadable = AssignableTo<BorgLoadoutAnswer, LoadoutSimulation>;

  it("is checked by the compiler rather than at runtime", () => {
    /* vitest needs a body; the claim is the two aliases above, which tsc proves.
       Kept inside a test so a reader looking for the assertion finds it here
       rather than deciding the block is dead. */
    expect(true).toBe(true);
  });
});

describe("the attack-message table", () => {
  /**
   * borg_init_hit_by_messages (borg-messages.c:1595) walks every blow method in
   * the data and inserts each of its action messages. This reads the same
   * records from the bound registry, which is what covers a mod's own blow
   * method - and what makes the Borg notice being hit at all.
   */
  it("is built from the blow-method registry, mod methods included", () => {
    const r = makeCoreResolvers({
      races: [],
      blowMethods: [
        { messages: ["hits {target}", "hits {target} hard"] },
        { messages: ["nibbles {target}"] },
      ],
    });
    expect(r.blowActions).toEqual([
      "hits {target}",
      "hits {target} hard",
      "nibbles {target}",
    ]);
  });

  it("is empty, not absent, when the host supplies no blow methods", () => {
    /* Empty means the Borg recognises no attack message and raises no regional
     * fear. That is a Borg that will rest through a beating, so the emptiness is
     * worth pinning: it says the host forgot, not that the game has no blows. */
    expect(makeCoreResolvers({ races: [] }).blowActions).toEqual([]);
  });

  it("passes every monster-spell level to the message seam", () => {
    const r = makeCoreResolvers({
      races: [],
      monsterSpells: [{
        index: 37,
        levels: [{ message: "The caster points.", blindMessage: "Something points.", missMessage: "The caster misses." }],
      }],
    });
    expect(r.spellMessages).toEqual([{ index: 37, levels: [{
      message: "The caster points.", blindMessage: "Something points.", missMessage: "The caster misses.",
    }] }]);
  });
});
