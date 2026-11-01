/**
 * THE WARRIOR BUILD PLAN: what this fork births, decided before any UI exists.
 *
 * Milestone M1 needs one place that answers "given this race, what warrior do
 * we make?" for two callers that must never disagree: the birth presenter
 * (T03), which replays the answer through the Api2BirthSession's own buy()
 * calls, and the headless harness, which passes it to startGame({ roller:
 * "point", birthStats }). Both get to share it because the inputs here are
 * structural mirrors of the shapes they already hold: a catalogue with the
 * races, classes, stat names and point budget (a subset of Api2BirthCatalogue,
 * so the session's own catalogue() result can be passed as-is), and the
 * point-buy cost/refund rows in Api2BirthDraftView.statCosts's entry shape.
 *
 * GAME-FREE BY CONTRACT. This module imports nothing, reads nothing, and rolls
 * nothing (rule 4: determinism is a guarantee, not a preference). Every game
 * fact it uses is handed in - the races/classes with their stat adjustments
 * and the point budget through the catalogue, the cost and refund rules
 * through the ladder below. It never re-derives a cost or invents a rule: the
 * T02 hazard is "inventing a cost model", and the model here is exactly the
 * one the caller's tables describe. The engine's reference is
 * packages/core/src/player/birth.ts (player-birth.c): reset_stats/buy_stat/
 * sell_stat and the BIRTH_STAT_COSTS table those primitives walk.
 *
 * THE POINT-BUY MODEL, as the game runs it: every stat starts at a base value
 * (BIRTH_STAT_BASE = 10); buying the point that moves a stat from v to v+1
 * costs the table's entry for v+1 (the stock table: 1 per point from 10
 * through 16, 2 for 17, 4 for 18); selling the point at v refunds the entry
 * for v. Race and class adjustments NEVER enter it - buy_stat does not read
 * them, and the birth session's statCosts (packages/web/src/birth-session.ts)
 * report this one table read at each stat's current value. Adjustments apply
 * afterwards, on top of the bought base stats.
 *
 * BASE STATS, NOT EFFECTIVE STATS - the interpretation this module pins, and
 * the evidence for it. The output is the array of BASE values that both
 * callers consume: generatePlayer threads a point-based stats array through
 * reset_stats + buy_stat and stores the result as the natural stats BEFORE
 * race/class adjustments are folded in by the stat-index calculations, and
 * the session's buy() is the same buy_stat primitive on the same state. So
 * the plan buys base points, and what those points are WORTH to a given race
 * is reported separately in effectiveStats: raw base + race + class sums,
 * the same arithmetic the character sheet's race/class bonus columns add
 * (char-sheet.ts reads the same adj arrays) - deliberately NOT the 3..18/220
 * modifyStatValue encoding, which would mean re-deriving a display rule this
 * module has no business owning. A Half-Troll warrior's base 18 STR shows as
 * 25 (18 + 4 + 3) in that trace. A future, measured per-race policy that
 * stops STR early because a racial bonus already carries it (buying base 14
 * for a STR+4 race lands effective 18) would be a divergence with a run
 * record behind it (rule 3), not a silent change here.
 *
 * THE PRIORITY POLICY: STR, then CON, then DEX; INT and WIS last. For each
 * stat in that order, buy one point at a time while the handed-in table says
 * the next point exists (buyCost not null, canBuy true) and the remaining
 * budget covers it, then move on to the next stat; leftover points flow down
 * the list, so the budget is fully spent whenever any legal buy remains.
 * Under the stock table and budget (20 points) that lands on STR 18 (12
 * points) and CON 17 (8 points) for every race - the walk is
 * adjustment-blind because the game's point-buy is. The INT-before-WIS tail
 * follows the engine's own leftover order for a warrior (generate_stats
 * step 4, birth.ts: DEX, then the non-spell stats INT, then WIS). The walk
 * never proposes a sell: economics would allow it (a refunded point from an
 * expensive stat can fund a cheaper one), but the priority policy outranks
 * it - selling stat X to buy stat Y always trades a higher-priority stat for
 * a lower one; refunds are still part of the
 * input contract and the plan's per-stat books mirror the engine's
 * pointsSpent accounting, so a caller that walks a plan back through the
 * session's sell() reconciles against the same numbers.
 */

/* ==================================================================
 * Input shapes: mirrors of the SDK's, kept structurally compatible
 * ================================================================== */

/**
 * One point-buy cost row, the exact shape of an Api2BirthDraftView.statCosts
 * entry. In the session these describe a stat AT ITS CURRENT VALUE; here a
 * row describes a stat AT THE VALUE IT INDEXES, which is the same table the
 * session reads its rows from, made complete enough to plan a whole birth
 * with instead of one step at a time.
 */
export interface StatCostRow {
  /** Cost of the point that raises a stat at this value; null when the game
   * offers no next point (18 in the stock table). */
  readonly buyCost: number | null;
  /** Refund for lowering a stat at this value; null when the game refuses
   * the sale (the base value 10). */
  readonly sellRefund: number | null;
  /** Whether a buy from this value is legal at all (value-dependent part of
   * the session's canBuy, which also folds in the points then left). */
  readonly canBuy: boolean;
  /** Whether a sell from this value is legal at all. */
  readonly canSell: boolean;
}

/**
 * The point-buy cost table as the planner consumes it: rows[v - base] is the
 * StatCostRow the draft's statCosts would report for any stat sitting at
 * value v, covering every value from base up to the table's cap inclusive.
 * The row at the cap has buyCost null (nothing above it can be bought).
 */
export interface StatCostLadder {
  /** The value every stat starts from (BIRTH_STAT_BASE = 10). */
  readonly base: number;
  /** rows[i] describes a stat at value base + i. */
  readonly rows: readonly StatCostRow[];
}

/**
 * The plan's view of Api2BirthRaceView: the fields it reads. The session's
 * fuller view (hitDie, skills, abilities, ...) is structurally assignable to
 * this, so real catalogues pass through unchanged.
 */
export interface BirthPlanRaceView {
  readonly name: string;
  /** Stat adjustments in the catalogue's stats order (the engine's STAT
   * order). Applied by the game AFTER point-buy, so they never gate a buy. */
  readonly statAdj: readonly number[];
}

/** The plan's view of Api2BirthClassView, same contract as the race view. */
export interface BirthPlanClassView {
  readonly name: string;
  readonly statAdj: readonly number[];
}

/**
 * The plan's view of Api2BirthCatalogue: races, classes, the stat names in
 * the engine's STAT order, and the point budget (the session fills this from
 * the engine's MAX_BIRTH_POINTS).
 */
export interface BirthPlanCatalogue {
  readonly races: readonly BirthPlanRaceView[];
  readonly classes: readonly BirthPlanClassView[];
  readonly stats: readonly string[];
  readonly pointBudget: number;
}

/** The class every plan from this module pins (T02 scope: warrior-only fork). */
export const WARRIOR_CLASS_NAME = "Warrior";

/**
 * The engine's STAT order, which the session's catalogue() reports verbatim
 * (birth-session.ts: stats: ["STR","INT","WIS","DEX","CON"]) and which
 * startGame's birthStats array must follow. A catalogue naming any other
 * order would silently misalign plan.baseStats with the engine's indices, so
 * it is refused rather than guessed at.
 */
const STAT_ORDER: readonly string[] = ["STR", "INT", "WIS", "DEX", "CON"];

/**
 * The fork's stat priority (T02): STR above CON above DEX, INT and WIS last -
 * a warrior's damage, then its survivability, then its blows and armor class,
 * then the dump stats. The INT-before-WIS tail mirrors the engine's own
 * leftover order for a warrior (generate_stats step 4, birth.ts).
 */
const STAT_PRIORITY: readonly string[] = ["STR", "CON", "DEX", "INT", "WIS"];

/**
 * Build the StatCostLadder from the engine's own value-indexed cost table
 * (BIRTH_STAT_COSTS: costs[v] is the cost of the point AT value v, so the buy
 * from v to v+1 costs costs[v + 1] - exactly statIncreaseCost). This is the
 * same row arithmetic the birth session uses to render statCosts
 * (birth-session.ts: buyCost = point && value < 18 ? statIncreaseCost(value)
 * : null; sellRefund = BIRTH_STAT_COSTS[value] above base), with the
 * state-dependent part (the points then left) left out because affordability
 * is this planner's own bookkeeping against the catalogue's point budget.
 *
 * A shape conversion, not a re-derivation: every number in the ladder comes
 * from the handed-in table, which both callers take from the engine they run
 * on (the published core for the harness, ctx.core for the presenter).
 *
 * @param costs the engine's birth_stat_costs table, indexed by stat value
 * @param base the value every stat starts from (BIRTH_STAT_BASE)
 */
export function ladderFromCostTable(
  costs: readonly number[],
  base: number,
): StatCostLadder {
  const cap = costs.length - 1;
  if (!Number.isInteger(base) || base < 0) {
    throw new Error(`the cost table's base must be a non-negative integer, got ${String(base)}`);
  }
  if (costs.length < 2 || base >= cap) {
    throw new Error("the cost table must offer at least one buyable value above its base");
  }
  const rows: StatCostRow[] = [];
  for (let v = base; v <= cap; v++) {
    const buyCost = v < cap ? (costs[v + 1] ?? 0) : null;
    const sellRefund = v > base ? (costs[v] ?? 0) : null;
    rows.push({ buyCost, sellRefund, canBuy: buyCost !== null, canSell: sellRefund !== null });
  }
  return { base, rows };
}

/* ==================================================================
 * The plan
 * ================================================================== */

/** One proposed point-buy step, replayable as session.buy(stat). */
export interface PlanBuyStep {
  /** Index into the catalogue's stats order (the engine's STAT order). */
  readonly stat: number;
  /** The stat's value before the buy. */
  readonly from: number;
  /** The stat's value after the buy. */
  readonly to: number;
  /** Points the buy costs (the row's buyCost at `from`). */
  readonly cost: number;
}

/** A planned warrior birth. */
export interface WarriorBuildPlan {
  readonly raceName: string;
  /** Always "Warrior": this module plans no other class. */
  readonly className: string;
  /**
   * BASE-stat targets in the catalogue's stats order (the engine's STAT
   * order), each within [base, cap]. This is the array both callers consume:
   * the session buys up to these values, and startGame({ roller: "point",
   * birthStats }) replays them through the engine's own buy loop.
   */
  readonly baseStats: readonly number[];
  /**
   * The buys in order. Replaying session.buy(step.stat) down this list
   * reproduces baseStats exactly; every step is legal under the handed-in
   * table and the budget by construction.
   */
  readonly steps: readonly PlanBuyStep[];
  /** Total points spent (the budget minus pointsLeft). */
  readonly pointsSpent: number;
  /** Points left after the walk; zero whenever any legal buy remained. */
  readonly pointsLeft: number;
  /** Per-stat points spent, in stats order (mirrors draft().pointsSpent). */
  readonly pointsSpentPerStat: readonly number[];
  /**
   * TRACE ONLY, never an output the session consumes: baseStats plus the
   * race's and class's adjustments, as raw sums (what the character sheet's
   * race/class bonus columns add). Kept out of modifyStatValue's 3..18/220
   * encoding on purpose - reporting the lens, not re-deriving a display rule.
   */
  readonly effectiveStats: readonly number[];
}

/** What planWarriorBirth needs: the catalogue, the race choice, the costs. */
export interface WarriorPlanInput {
  /** Catalogue-shaped input; the session's own catalogue() result fits. */
  readonly catalogue: BirthPlanCatalogue;
  /** The race to plan for, by its catalogue name (as chooseRace takes it). */
  readonly raceName: string;
  /** The game's point-buy cost/refund table (see ladderFromCostTable). */
  readonly costs: StatCostLadder;
}

/**
 * Plan the warrior's birth for one race: the priority walk described in the
 * module header, under the handed-in cost ladder and the catalogue's budget.
 * Pure and deterministic - same input, same plan, every time.
 *
 * @throws Error, with the reason and the options, on input that does not
 * match the session's shapes: a stats array that is not the engine's STAT
 * order, a missing Warrior class, an unknown race, adjustment arrays of the
 * wrong length, or an incoherent cost ladder.
 */
export function planWarriorBirth(input: WarriorPlanInput): WarriorBuildPlan {
  const { catalogue, raceName, costs } = input;

  /* The stats contract: the engine's STAT order, exactly, because plan output
   * indexes the same array birthStats/buy(stat) do. */
  if (
    catalogue.stats.length !== STAT_ORDER.length ||
    catalogue.stats.some((name, i) => name !== STAT_ORDER[i])
  ) {
    throw new Error(
      `catalogue.stats must be the engine's STAT order (${STAT_ORDER.join(",")}), ` +
        `got ${catalogue.stats.join(",")}`,
    );
  }

  if (!Number.isInteger(catalogue.pointBudget) || catalogue.pointBudget < 0) {
    throw new Error(
      `catalogue.pointBudget must be a non-negative integer, got ${String(catalogue.pointBudget)}`,
    );
  }

  /* The class is pinned, not chosen: this is the warrior fork's plan. */
  const cls = catalogue.classes.find((c) => c.name === WARRIOR_CLASS_NAME);
  if (!cls) {
    throw new Error(
      `the catalogue has no "${WARRIOR_CLASS_NAME}" class; this plan pins it ` +
        `(available: ${catalogue.classes.map((c) => c.name).join(", ") || "none"})`,
    );
  }

  /* The race is the caller's setting; exact match, as the session's
   * chooseRace takes it. */
  const race = catalogue.races.find((r) => r.name === raceName);
  if (!race) {
    throw new Error(
      `there is no race named "${raceName}" in the catalogue ` +
        `(available: ${catalogue.races.map((r) => r.name).join(", ") || "none"})`,
    );
  }

  const n = catalogue.stats.length;
  for (const [label, view] of [
    ["race", race],
    ["class", cls],
  ] as const) {
    if (view.statAdj.length !== n) {
      throw new Error(
        `the ${label} "${view.name}" needs ${String(n)} stat adjustments, ` +
          `got ${String(view.statAdj.length)}`,
      );
    }
  }

  /* The ladder must describe a table that ends where buying ends: the row at
   * the cap has no buy, and every buyable row carries a cost. */
  const { base, rows } = costs;
  const cap = base + rows.length - 1;
  if (rows.length === 0 || base < 0) {
    throw new Error("the cost ladder needs a non-negative base and at least one row");
  }
  for (let v = base; v <= cap; v++) {
    const row = rows[v - base];
    if (!row) throw new Error(`the cost ladder has no row for value ${String(v)}`);
    if (v === cap && (row.buyCost !== null || row.canBuy)) {
      throw new Error("the cost ladder's top row must not offer a buy");
    }
    if (row.canBuy && row.buyCost === null) {
      throw new Error(`the cost ladder row at ${String(v)} claims buyable with no cost`);
    }
  }

  /* Resolve the priority to indices through the names the catalogue listed,
   * so nothing here assumes an index the input did not assert. */
  const priority = STAT_PRIORITY.map((name) => {
    const i = catalogue.stats.indexOf(name);
    if (i < 0) throw new Error(`catalogue.stats is missing the stat "${name}"`);
    return i;
  });

  /* The walk: for each stat in priority order, buy while the table offers a
   * next point the budget still covers. Every step pushed is legal by the
   * three checks below - that is the "never propose an illegal step" promise,
   * and the engine's buyStat accepts each one when the tests replay them. */
  const stats = new Array<number>(n).fill(base);
  const pointsSpentPerStat = new Array<number>(n).fill(0);
  const steps: PlanBuyStep[] = [];
  let pointsLeft = catalogue.pointBudget;

  for (const stat of priority) {
    for (;;) {
      const value = stats[stat] ?? 0;
      const row = rows[value - base];
      if (row === undefined) break; // past the table's cap
      if (!row.canBuy || row.buyCost === null) break; // the game offers no next point
      if (row.buyCost > pointsLeft) break; // not affordable any more
      stats[stat] = value + 1;
      pointsLeft -= row.buyCost;
      pointsSpentPerStat[stat] = (pointsSpentPerStat[stat] ?? 0) + row.buyCost;
      steps.push({ stat, from: value, to: value + 1, cost: row.buyCost });
    }
  }

  const pointsSpent = catalogue.pointBudget - pointsLeft;

  /* The lens, for the trace only: raw sums of the adjustments the catalogue
   * itself carries (see the module header for why this is not the game's
   * display encoding). */
  const effectiveStats = stats.map(
    (value, i) =>
      value + (race.statAdj[i] ?? 0) + (cls.statAdj[i] ?? 0),
  );

  return {
    raceName: race.name,
    className: cls.name,
    baseStats: stats,
    steps,
    pointsSpent,
    pointsLeft,
    pointsSpentPerStat,
    effectiveStats,
  };
}
