/**
 * TESTS FOR THE BIRTH PRESENTER, against a session that runs the game's own
 * point-buy arithmetic.
 *
 * The presenter drives an Api2BirthSession it did not make, under rules it did
 * not write, so the fake here is not an invented stub: on every path the
 * presenter can reach it mirrors packages/web/src/birth-session.ts from the
 * game's own source. chooseRace/chooseClass install the pair's suggested
 * spread through the engine's real generateStats (resetStatWork); reset is
 * resetStats; buy and sell ARE buyStat and sellStat; each draft().statCosts
 * row is the same value-indexed read the session renders. A presenter that
 * proposed an illegal buy, forgot the reset, or trusted the suggested spread
 * is refused by the fake exactly as the game would refuse it.
 *
 * THE PLAN IT IS ASSERTED AGAINST is computed in the test by the same
 * planWarriorBirth the presenter calls (its T02 twin, src/birth/plan.test.ts,
 * proves the plan against the pack); nothing here hardcodes a stat number.
 * The engine constants the fake and the plan share are the published
 * engine's, imported like plan.test.ts imports them.
 *
 * THE HUMAN-SAFETY PATHS are the point of T03 and are tested both ways: a
 * birth with no flag never reaches the session at all, and a flagged birth
 * that cannot be completed (unknown race) declines, logs and still consumes
 * the flag, so the restart loop cannot spin on it.
 */

import { describe, expect, it } from "vitest";
import type { Api2BirthSession, Api2Slot, JsonValue } from "@rpgm-tools/neo-angband-mod-sdk";
import {
  BIRTH_STAT_BASE,
  BIRTH_STAT_COSTS,
  MAX_BIRTH_POINTS,
  buyStat,
  generateStats,
  resetStats,
  sellStat,
  statIncreaseCost,
  type PlayerClass,
  type PlayerRace,
  type StatBuyState,
} from "@rpgm-tools/neo-angband-core";import { ladderFromCostTable, planWarriorBirth, type BirthPlanCatalogue } from "./plan.js";
import { BIRTH_FLAG_KEY, createWarriorBirthPresenter, setWarriorBirthFlag, type WarriorBirthDeps } from "./presenter.js";

/* ==================================================================
 * The fixture: a catalogue shaped like the session's, with the pack's
 * real Warrior blow numbers so generateStats behaves as it does in play.
 * ================================================================== */

/**
 * The synthetic records the fake's generateStats calls run on. Only the
 * fields that function reads are modelled (statAdj; the class's blow
 * numbers), with the pack's real Warrior values (class.json: max-attacks 6,
 * min-weight 30, strength-multiplier 5, stats 3/-2/-2/2/2) so the suggested
 * spread the fake installs after a choose is the engine's own for a warrior;
 * the races' adjustments are stand-ins, because the point-buy walk the
 * presenter replays is adjustment-blind by construction (plan.ts header).
 * The cast at the generateStats call is the fixture's whole fidelity claim,
 * and the fixture-guard test below runs it: an engine that grew a required
 * read there throws in this suite instead of quietly testing another spread.
 */
interface RaceFixture {
  readonly name: string;
  readonly statAdj: readonly number[];
}
interface ClassFixture {
  readonly name: string;
  readonly statAdj: readonly number[];
  readonly maxAttacks: number;
  readonly minWeight: number;
  readonly attMultiply: number;
  /** generateStats reads totalSpells to find a caster's spell stat. */
  readonly magic: { readonly totalSpells: number };
}

const RACE_RECORDS: readonly RaceFixture[] = [
  { name: "Testling", statAdj: [0, 0, 0, 0, 0] },
  { name: "Dunadan", statAdj: [1, 2, 2, 2, 3] },
];
const CLASS_RECORDS: readonly ClassFixture[] = [
  { name: "Rogue", statAdj: [2, -1, -1, 1, 2], maxAttacks: 5, minWeight: 20, attMultiply: 4, magic: { totalSpells: 0 } },
  { name: "Warrior", statAdj: [3, -2, -2, 2, 2], maxAttacks: 6, minWeight: 30, attMultiply: 5, magic: { totalSpells: 0 } },
];

/** The catalogue the fake's catalogue() returns: the session's own shape. */
function catalogueView() {
  return {
    races: RACE_RECORDS.map((r) => ({
      name: r.name,
      statAdj: [...r.statAdj],
      hitDie: 10,
      expFactor: 100,
      infravisionFeet: 0,
      skills: {},
      abilities: [],
    })),
    classes: CLASS_RECORDS.map((c) => ({
      name: c.name,
      statAdj: [...c.statAdj],
      hitDie: 10,
      expFactor: 100,
      skills: {},
      magic: [],
      abilities: [],
    })),
    stats: ["STR", "INT", "WIS", "DEX", "CON"],
    pointBudget: MAX_BIRTH_POINTS,
    nameMax: 31,
    previous: null,
    namePinned: false,
  };
}

/** The same catalogue reduced to what planWarriorBirth reads. */
function planCatalogue(): BirthPlanCatalogue {
  const view = catalogueView();
  return {
    races: view.races.map((r) => ({ name: r.name, statAdj: r.statAdj })),
    classes: view.classes.map((c) => ({ name: c.name, statAdj: c.statAdj })),
    stats: [...view.stats],
    pointBudget: view.pointBudget,
  };
}

/** One buy the fake saw, with the statCosts verdict it would have shown. */
interface RecordedBuy {
  readonly stat: number;
  readonly from: number;
  readonly cost: number | null;
  /** Whether the session's own statCosts row allowed the buy at that moment. */
  readonly allowedByCosts: boolean;
}

/** What the fake accepted, the fields the Done-when asserts over. */
interface Accepted {
  readonly race: string;
  readonly cls: string;
  readonly name: string;
  readonly stats: readonly number[];
  readonly pointsLeft: number;
}

interface FakeBirth extends Api2BirthSession {
  /** Every session method call, in order, as "name argument" strings. */
  readonly calls: readonly string[];
  readonly buys: readonly RecordedBuy[];
  readonly accepts: number;
  readonly accepted: Accepted | null;
  readonly cancelled: number;
}

const ok = { ok: true as const };
const refuse = (reason: string) => ({ ok: false as const, reason });

/**
 * The session, mirroring birth-session.ts on every path the presenter can
 * reach. History, options, rolls and quickstart are outside the presenter's
 * protocol, so they record the call and refuse - a presenter that needed one
 * would show up here as a decline with the reason in the log.
 */
function fakeSession(options: { readonly initialName?: string } = {}): FakeBirth {
  const calls: string[] = [];
  const buys: RecordedBuy[] = [];
  let race: RaceFixture | null = null;
  let cls: ClassFixture | null = null;
  let buy: StatBuyState = resetStats();
  let name = options.initialName ?? "";
  let accepts = 0;
  let cancelled = 0;
  let accepted: Accepted | null = null;
  let finished = false;

  const chosen = (): boolean => race !== null && cls !== null;
  const live = (): { ok: false; reason: string } | null =>
    finished ? refuse("Character creation has already finished.") : null;

  /* birth-session.ts rows 247-257: statCosts is the one table read at each
   * stat's current value, with the points then left folded into canBuy. */
  const row = (i: number) => {
    const value = buy.stats[i] ?? 0;
    const buyCost = value < 18 ? statIncreaseCost(value) : null;
    const sellRefund = value > BIRTH_STAT_BASE ? (BIRTH_STAT_COSTS[value] ?? 0) : null;
    return {
      buyCost,
      sellRefund,
      canBuy: chosen() && buyCost !== null && buyCost <= buy.pointsLeft,
      canSell: chosen() && sellRefund !== null,
    };
  };

  /* resetStatWork (birth-session.ts 158-166): a new pair replaces the stat
   * work with that pair's suggested spread. The cast is the fixture's
   * fidelity claim - see RaceFixture above. */
  const resetStatWork = (): void => {
    buy = race && cls ? generateStats(race as unknown as PlayerRace, cls as unknown as PlayerClass) : resetStats();
  };

  const outOfProtocol = (what: string) => {
    calls.push(what);
    return refuse(`the fake session does not ${what}`);
  };

  const fake: Api2BirthSession = {
    catalogue: () => {
      calls.push("catalogue");
      return catalogueView();
    },
    draft: () => {
      calls.push("draft");
      return {
        race: race?.name ?? null,
        cls: cls?.name ?? null,
        method: "point",
        stats: [...buy.stats],
        pointsLeft: buy.pointsLeft,
        pointsSpent: [...buy.pointsSpent],
        statCosts: buy.stats.map((_, i) => row(i)),
        canPreviousRoll: false,
        name,
        history: "",
        historyEdited: false,
        options: [],
        preview: null,
        ready: chosen() && name.trim() !== "",
      };
    },
    chooseRace: (raceName) => {
      calls.push(`chooseRace ${raceName}`);
      const done = live();
      if (done) return done;
      const next = RACE_RECORDS.find((r) => r.name === raceName);
      if (!next) return refuse(`There is no race named "${raceName}".`);
      race = next;
      resetStatWork();
      return ok;
    },
    chooseClass: (className) => {
      calls.push(`chooseClass ${className}`);
      const done = live();
      if (done) return done;
      const next = CLASS_RECORDS.find((c) => c.name === className);
      if (!next) return refuse(`There is no class named "${className}".`);
      cls = next;
      resetStatWork();
      return ok;
    },
    usePointBuy: () => {
      calls.push("usePointBuy");
      const done = live();
      if (done) return done;
      if (!chosen()) return refuse("Choose a race and a class first.");
      resetStatWork();
      return ok;
    },
    buy: (stat) => {
      calls.push(`buy ${String(stat)}`);
      const done = live();
      if (done) return done;
      if (!chosen()) return refuse("Choose a race and a class first.");
      const before = row(stat);
      buys.push({ stat, from: buy.stats[stat] ?? 0, cost: before.buyCost, allowedByCosts: before.canBuy });
      /* buyStat is the session's own buy (birth-session.ts 288-292); the row
       * check in front of it is the same numbers the real session's statCosts
       * reports, so a disagreement between them fails the test, not the game. */
      if (!before.canBuy || !buyStat(buy, stat)) return refuse("That stat cannot go higher with the points left.");
      return ok;
    },
    sell: (stat) => {
      calls.push(`sell ${String(stat)}`);
      const done = live();
      if (done) return done;
      if (!chosen()) return refuse("Choose a race and a class first.");
      return sellStat(buy, stat) ? ok : refuse("That stat is already at its lowest.");
    },
    suggest: () => {
      calls.push("suggest");
      const done = live();
      if (done) return done;
      if (!chosen()) return refuse("Choose a race and a class first.");
      buy = generateStats(race as unknown as PlayerRace, cls as unknown as PlayerClass);
      return ok;
    },
    reset: () => {
      calls.push("reset");
      const done = live();
      if (done) return done;
      if (!chosen()) return refuse("Choose a race and a class first.");
      buy = resetStats();
      return ok;
    },
    roll: () => outOfProtocol("roll"),
    previousRoll: () => outOfProtocol("previousRoll"),
    setName: (next) => {
      calls.push(`setName ${next}`);
      const done = live();
      if (done) return done;
      name = next;
      return ok;
    },
    /* player_random_name, as the session's '*' key draws it; the fake's name
     * is fixed so the test stays deterministic. */
    randomName: () => {
      calls.push("randomName");
      const done = live();
      if (done) return done;
      name = "Borg";
      return ok;
    },
    setHistory: () => outOfProtocol("setHistory"),
    restoreHistory: () => outOfProtocol("restoreHistory"),
    regenerateHistory: () => outOfProtocol("regenerateHistory"),
    setOption: () => outOfProtocol("setOption"),
    usePrevious: () => outOfProtocol("usePrevious"),
    accept: () => {
      calls.push("accept");
      const done = live();
      if (done) return done;
      if (!chosen()) return refuse("Choose a race and a class first.");
      if (name.trim() === "") return refuse("The character needs a name.");
      accepts += 1;
      accepted = {
        race: race!.name,
        cls: cls!.name,
        name,
        stats: [...buy.stats],
        pointsLeft: buy.pointsLeft,
      };
      finished = true;
      return ok;
    },
    cancel: () => {
      calls.push("cancel");
      cancelled += 1;
      finished = true;
    },
  };
  return { ...fake, calls, buys, get accepts() { return accepts; }, get accepted() { return accepted; }, get cancelled() { return cancelled; } };
}

/* ==================================================================
 * The flag slot and the presenter under test
 * ================================================================== */

/** An install slot that holds its value in memory, like title.test.ts's. */
function slot(initial: JsonValue | null = null): Api2Slot & { held(): JsonValue | null } {
  let value: JsonValue | null = initial;
  return {
    get: () => Promise.resolve({ ok: true as const, value }),
    set: (next) => {
      value = next;
      return Promise.resolve({ ok: true as const, value: null });
    },
    held: () => value,
  };
}

/**
 * The host's swallowed-write failure (#25): set() answers ok, nothing
 * persists, and get() keeps returning the durable object. This is exactly
 * what the real host does when the backing storage throws inside
 * mod-prefs.ts's set - the slot layer has already reported success.
 */
function nonPersistingSlot(durable: JsonValue): Api2Slot & { durable(): JsonValue | null } {
  let held: JsonValue | null = durable;
  return {
    get: () => Promise.resolve({ ok: true as const, value: structuredClone(held) }),
    set: () => Promise.resolve({ ok: true as const, value: null }),
    durable: () => held,
  };
}

/** A slot whose set is refused by name, for the consume's write failing (#25). */
function refusingSetSlot(): Api2Slot {
  return {
    get: () => Promise.resolve({ ok: true as const, value: { warriorBirth: true } }),
    set: () => Promise.resolve({ ok: false as const, reason: "refused" as const, code: "refused", message: "storage is full" }),
  };
}

/** A slot whose set throws, the other shape a failing consume can take. */
function throwingSetSlot(): Api2Slot {
  return {
    get: () => Promise.resolve({ ok: true as const, value: { warriorBirth: true } }),
    set: () => Promise.reject(new Error("storage is broken")),
  };
}

/**
 * A slot whose SECOND get parks on a gate the test releases (#26): the
 * presenter's arming read completes on the old contents, a sibling write
 * lands in the window, and the consume's re-read must see the new contents.
 */
function interleavedSlot(initial: JsonValue): Api2Slot & {
  getCalls(): number;
  writeDirect(value: JsonValue): void;
  releaseSecondGet(): void;
} {
  let held: JsonValue | null = initial;
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    get: () => {
      calls += 1;
      return calls === 2
        ? gate.then(() => ({ ok: true as const, value: structuredClone(held) }))
        : Promise.resolve({ ok: true as const, value: structuredClone(held) });
    },
    set: (next) => {
      held = next;
      return Promise.resolve({ ok: true as const, value: null });
    },
    getCalls: () => calls,
    writeDirect: (value) => {
      held = value;
    },
    releaseSecondGet: () => release(),
  };
}

/** A slot whose read never settles, for the race the guard exists for. */
function neverSettlingSlot(): Api2Slot {
  return { get: () => new Promise(() => {}), set: () => Promise.resolve({ ok: true as const, value: null }) };
}

/** A slot whose read rejects, as unreadable storage would. */
function refusingSlot(): Api2Slot {
  return {
    get: () => Promise.reject(new Error("storage is broken")),
    set: () => Promise.resolve({ ok: true as const, value: null }),
  };
}

interface Armed {
  readonly presenter: ReturnType<typeof createWarriorBirthPresenter>;
  readonly fake: FakeBirth;
  readonly logs: readonly string[];
}

/** Build the presenter with the flag already set, and let its read settle. */
async function armedWithFlag(raceName: string, options: { readonly held?: Api2Slot & { held(): JsonValue | null }; readonly session?: FakeBirth } = {}): Promise<Armed & { readonly held: Api2Slot & { held(): JsonValue | null } }> {
  const held = options.held ?? slot({ profileIds: ["p1"] });
  expect(await setWarriorBirthFlag(held)).toBe(true);
  const logs: string[] = [];
  const deps: WarriorBirthDeps = {
    slot: held,
    log: (message) => logs.push(message),
    raceName,
    costTable: BIRTH_STAT_COSTS,
    statBase: BIRTH_STAT_BASE,
  };
  const presenter = createWarriorBirthPresenter(deps);
  await settle();
  return { presenter, fake: options.session ?? fakeSession(), logs, held };
}

/** Let the presenter's prepare (its chained slot reads, write and verify) run out. */
async function settle(ticks = 32): Promise<void> {
  for (let i = 0; i < ticks; i++) await Promise.resolve();
}

/** Await microtasks until `is` holds, bounded so a wrong interleaving fails an assertion, not the runner. */
async function waitFor(is: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !is(); i++) await Promise.resolve();
}

describe("the warrior birth presenter", () => {
  it("guards its fixture: a chosen pair installs a suggested spread that is not the plan's start", () => {
    /* The property reset() exists for: after chooseRace/chooseClass the stats
     * are NOT all at base and the budget is spent, so the plan's buys cannot
     * start from the suggested spread. If generateStats changed shape, this
     * fails instead of the fake quietly testing a different sequence. */
    const fake = fakeSession();
    expect(fake.chooseRace("Dunadan").ok).toBe(true);
    expect(fake.chooseClass("Warrior").ok).toBe(true);
    const draft = fake.draft();
    expect(draft.stats.some((v) => v !== BIRTH_STAT_BASE)).toBe(true);
    expect(draft.pointsLeft).toBe(0);
  });

  /* DONE-WHEN 1, the flagged half. */
  it("births exactly the planned warrior when the flag is set, and consumes the flag", async () => {
    const { presenter, fake, logs, held } = await armedWithFlag("Dunadan");

    expect(presenter.show(fake)).toBe(true);

    /* The plan, computed here by the same module the presenter calls: the
     * assertions are against planWarriorBirth's output, never hardcoded. */
    const plan = planWarriorBirth({
      catalogue: planCatalogue(),
      raceName: "Dunadan",
      costs: ladderFromCostTable(BIRTH_STAT_COSTS, BIRTH_STAT_BASE),
    });

    /* Exactly one accepted character, and it is the plan's: the SECOND race
     * of the catalogue (no catalogue-order default), the pinned class, the
     * plan's base stats and leftover points. */
    expect(fake.accepts).toBe(1);
    expect(fake.accepted?.race).toBe(plan.raceName);
    expect(fake.accepted?.race).toBe("Dunadan");
    expect(fake.accepted?.cls).toBe(plan.className);
    expect(fake.accepted?.stats).toEqual([...plan.baseStats]);
    expect(fake.accepted?.pointsLeft).toBe(plan.pointsLeft);

    /* Every buy the session saw is one its own statCosts allowed, and there
     * are exactly the plan's steps' worth of them. */
    expect(fake.buys.map((b) => b.allowedByCosts)).not.toContain(false);
    expect(fake.buys).toHaveLength(plan.steps.length);
    for (let i = 0; i < fake.buys.length; i++) {
      expect(fake.buys[i]?.stat).toBe(plan.steps[i]?.stat);
    }

    /* The pinned sequence, in order: read the catalogue, choose the pair,
     * clear the suggested spread, buy the plan, check the draft, name the
     * character, accept. */
    expect(fake.calls.slice(0, 4)).toEqual(["catalogue", "chooseRace Dunadan", "chooseClass Warrior", "reset"]);
    expect(fake.calls.slice(-3)).toEqual(["draft", "randomName", "accept"]);
    expect(fake.cancelled).toBe(0);

    /* The flag is consumed and the slot's other keys survive it. */
    const after = await held.get();
    expect(after.ok && after.value).toEqual({ profileIds: ["p1"] });
    expect(logs.length).toBeGreaterThan(0);
  });

  /* DONE-WHEN 1, the human half: without the flag, nothing is called. */
  it("declines without the flag and calls no session method at all", async () => {
    const held = slot({ profileIds: ["p1"] });
    const logs: string[] = [];
    const presenter = createWarriorBirthPresenter({
      slot: held,
      log: (message) => logs.push(message),
      raceName: "Dunadan",
      costTable: BIRTH_STAT_COSTS,
      statBase: BIRTH_STAT_BASE,
    });
    await settle();
    const fake = fakeSession();

    /* The quiet path: no log line for a human's ordinary birth either. */
    expect(presenter.show(fake)).toBeUndefined();
    expect(fake.calls).toEqual([]);
    expect(logs).toEqual([]);
    expect(held.held()).toEqual({ profileIds: ["p1"] });
  });

  /* DONE-WHEN 2: the unknown race declines, logs, and still consumes. */
  it("declines, logs and consumes the flag when the catalogue lacks the named race", async () => {
    const { presenter, fake, logs, held } = await armedWithFlag("Maiar");

    expect(presenter.show(fake)).toBeUndefined();

    /* It read the catalogue and stopped: no pair chosen, no accept. */
    expect(fake.calls).toEqual(["catalogue"]);
    expect(fake.accepts).toBe(0);
    expect(logs.join(" ")).toMatch(/Maiar/u);
    const after = await held.get();
    expect(after.ok && after.value).toEqual({ profileIds: ["p1"] });
  });

  it("births at most once per flag: a second show on the same page declines silently", async () => {
    const { presenter, fake, held } = await armedWithFlag("Dunadan");
    expect(presenter.show(fake)).toBe(true);
    const callsAfterFirst = fake.calls.length;

    /* The consume flipped the in-page state synchronously, so the same page
     * cannot birth twice on one flag even before the slot write lands. */
    expect(presenter.show(fakeSession())).toBeUndefined();
    expect(fake.accepts).toBe(1);
    expect(fake.calls).toHaveLength(callsAfterFirst);
    expect(held.held()).toEqual({ profileIds: ["p1"] });
  });

  it("keeps a name the host already filled in", async () => {
    const { presenter, fake } = await armedWithFlag("Dunadan", { session: fakeSession({ initialName: "Borg II" }) });

    expect(presenter.show(fake)).toBe(true);

    /* A pinned or dynastic name is the host's decision; the presenter fills
     * a name only when the draft's is empty. */
    expect(fake.accepted?.name).toBe("Borg II");
    expect(fake.calls).not.toContain("randomName");
  });

  it("declines without touching the session when the flag read has not settled", async () => {
    const logs: string[] = [];
    const presenter = createWarriorBirthPresenter({
      slot: neverSettlingSlot(),
      log: (message) => logs.push(message),
      raceName: "Dunadan",
      costTable: BIRTH_STAT_COSTS,
      statBase: BIRTH_STAT_BASE,
    });
    const fake = fakeSession();

    /* Never TAKE a birth on an unread flag: the wrong direction here is the
     * milestone's worst failure mode, so the guard declines. */
    expect(presenter.show(fake)).toBeUndefined();
    expect(fake.calls).toEqual([]);
    expect(logs.join(" ")).toMatch(/flag/u);
  });

  it("declines when the flag read fails, and says why", async () => {
    const logs: string[] = [];
    const presenter = createWarriorBirthPresenter({
      slot: refusingSlot(),
      log: (message) => logs.push(message),
      raceName: "Dunadan",
      costTable: BIRTH_STAT_COSTS,
      statBase: BIRTH_STAT_BASE,
    });
    await settle();

    expect(presenter.show(fakeSession())).toBeUndefined();
    expect(logs.join(" ")).toMatch(/flag/u);
  });

  /* ------------------------------------------------------------------
   * The durable, fail-closed consume (#25) and the shared slot (#26).
   * ------------------------------------------------------------------ */

  it("never births when the slot's set answers ok but nothing persists: two fresh presenters, zero accepts (#25)", async () => {
    /* The reviewer's reproduction: one flag-set, the host swallows the
     * clear, and each new page would re-arm from the surviving flag. The
     * fail-closed protocol must make every one of those births decline. */
    const shared = nonPersistingSlot({ profileIds: ["p1"], warriorBirth: true });
    for (let page = 1; page <= 2; page++) {
      const logs: string[] = [];
      const presenter = createWarriorBirthPresenter({
        slot: shared,
        log: (message) => logs.push(message),
        raceName: "Dunadan",
        costTable: BIRTH_STAT_COSTS,
        statBase: BIRTH_STAT_BASE,
      });
      await settle();
      const fake = fakeSession();

      expect(presenter.show(fake), `page ${String(page)} shows`).toBeUndefined();
      expect(fake.calls).toEqual([]);
      expect(fake.accepts).toBe(0);
      /* Loud, and honest about the flag still standing. */
      expect(logs.join(" ")).toMatch(/flag/u);
      expect(logs.join(" ")).toMatch(/clear/u);
    }
    /* The durable flag did survive - which is exactly why the log says so. */
    expect(shared.durable()).toEqual({ profileIds: ["p1"], warriorBirth: true });

    /* Humans are unaffected: with no flag, the next birth is the game's own. */
    const human = createWarriorBirthPresenter({
      slot: slot({ profileIds: ["p1"] }),
      log: () => {},
      raceName: "Dunadan",
      costTable: BIRTH_STAT_COSTS,
      statBase: BIRTH_STAT_BASE,
    });
    await settle();
    const untouched = fakeSession();
    expect(human.show(untouched)).toBeUndefined();
    expect(untouched.calls).toEqual([]);
  });

  it("declines with a loud log when the consume's write is refused or throws", async () => {
    for (const broken of [refusingSetSlot(), throwingSetSlot()]) {
      const logs: string[] = [];
      const presenter = createWarriorBirthPresenter({
        slot: broken,
        log: (message) => logs.push(message),
        raceName: "Dunadan",
        costTable: BIRTH_STAT_COSTS,
        statBase: BIRTH_STAT_BASE,
      });
      await settle();
      const fake = fakeSession();

      expect(presenter.show(fake)).toBeUndefined();
      expect(fake.calls).toEqual([]);
      expect(fake.accepts).toBe(0);
      expect(logs.join(" ")).toMatch(/flag/u);
    }
  });

  it("births once across a reload: a second presenter after the verified clear declines (#25 happy path)", async () => {
    const held = slot({ profileIds: ["p1"] });
    expect(await setWarriorBirthFlag(held)).toBe(true);

    const make = (): ReturnType<typeof createWarriorBirthPresenter> =>
      createWarriorBirthPresenter({
        slot: held,
        log: () => {},
        raceName: "Dunadan",
        costTable: BIRTH_STAT_COSTS,
        statBase: BIRTH_STAT_BASE,
      });

    /* Page one: the prepare durably consumed the flag before show, and the
     * birth is accepted exactly once. */
    const first = make();
    await settle();
    const born = fakeSession();
    expect(first.show(born)).toBe(true);
    expect(born.accepts).toBe(1);

    /* Page two: a fresh presenter reads a slot with no flag and declines
     * without touching its session. One flag-set, one character. */
    const second = make();
    await settle();
    const next = fakeSession();
    expect(second.show(next)).toBeUndefined();
    expect(next.calls).toEqual([]);
    expect(next.accepts).toBe(0);
    expect(held.held()).toEqual({ profileIds: ["p1"] });
  });

  it("consumes from the slot's CURRENT contents, so a sibling update between arming and consume survives (#26)", async () => {
    /* The reviewer's reproduction: the presenter registers (its arming read
     * sees the old object), then the shared slot's other writer updates
     * profileIds and adds a sibling, then the birth is shown. The consume
     * must re-read what is there and write THAT back minus the flag. */
    const shared = interleavedSlot({ profileIds: ["p1"], warriorBirth: true });
    const presenter = createWarriorBirthPresenter({
      slot: shared,
      log: () => {},
      raceName: "Dunadan",
      costTable: BIRTH_STAT_COSTS,
      statBase: BIRTH_STAT_BASE,
    });

    /* The arming read has completed; the consume's re-read is parked on the
     * gate. The sibling write lands exactly in the window between them. */
    await waitFor(() => shared.getCalls() >= 2);
    shared.writeDirect({ profileIds: ["p1", "p2"], warriorBirth: true, newSibling: 42 });
    shared.releaseSecondGet();
    await settle();

    const fake = fakeSession();
    expect(presenter.show(fake)).toBe(true);
    expect(fake.accepts).toBe(1);

    /* The newer profile id and the unrelated sibling both survive; only the
     * flag is gone. */
    const after = await shared.get();
    expect(after.ok && after.value).toEqual({ profileIds: ["p1", "p2"], newSibling: 42 });
  });

  it("puts the consume before the plan: an unknown race on a slot that cannot clear never reaches the session", async () => {
    /* Fail-closed ordering (#25 on the decline path): when the flag cannot
     * be durably cleared, the presenter declines before planning, so the
     * unknown-race log never replaces the louder consume failure, and no
     * catalogue read happens. */
    const logs: string[] = [];
    const presenter = createWarriorBirthPresenter({
      slot: nonPersistingSlot({ warriorBirth: true }),
      log: (message) => logs.push(message),
      raceName: "Maiar",
      costTable: BIRTH_STAT_COSTS,
      statBase: BIRTH_STAT_BASE,
    });
    await settle();
    const fake = fakeSession();

    expect(presenter.show(fake)).toBeUndefined();
    expect(fake.calls).toEqual([]);
    expect(fake.accepts).toBe(0);
    const said = logs.join(" ");
    expect(said).toMatch(/flag/u);
    expect(said).not.toMatch(/Maiar/u);
  });
});
