/**
 * TESTS FOR THE WARRIOR BUILD PLAN, against the game's own numbers.
 *
 * The plan module is pure and game-free, which is exactly why these tests are
 * not: every fact it takes for granted - the cost ladder, the refund symmetry,
 * the point budget, every race's stat adjustments - is read here from the
 * published engine and the real content pack, and the resulting allocation is
 * replayed through the engine's own point-buy primitives (resetStats/buyStat,
 * the very loop generatePlayer runs for a point-based birthStats array). A
 * test that hardcoded 12 for the cost of STR 18 would pass on any table; one
 * that asks pointBuyCost knows the plan is legal under the table a player
 * actually runs (rule 4: the mod plays by the game's rules, never its own).
 *
 * WHY THIS SKIPS WITHOUT THE GAME'S CHECKOUT, exactly as src/play.test.ts
 * does: the races and classes are the game's content, not this repository's,
 * and there is no copy here to fall back on. NEO_ANGBAND_REPO (or the sibling
 * checkout the other tools assume) supplies it. The skip says so out loud
 * rather than passing on nothing; the input-contract cases below it still run
 * anywhere, because they need no pack at all.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BIRTH_STAT_BASE,
  BIRTH_STAT_COSTS,
  MAX_BIRTH_POINTS,
  buyStat,
  pointBuyCost,
  resetStats,
  statIncreaseCost,
} from "@rpgm-tools/neo-angband-core";
import {
  WARRIOR_CLASS_NAME,
  ladderFromCostTable,
  planWarriorBirth,
} from "./plan.js";

/** One p_race.json/class.json record, the only keys the catalogue needs. */
interface PackRecord {
  name: string;
  stats: { str: number; int: number; wis: number; dex: number; con: number };
}

/** The game's checkout, holding the content records a real catalogue needs. */
function packRoot(): string | null {
  const roots = [
    process.env["NEO_ANGBAND_REPO"],
    /* One level deeper than src/play.test.ts's ../../neo-angband/ because
     * this file lives in src/birth/; the URL resolves against the file. */
    fileURLToPath(new URL("../../../neo-angband/", import.meta.url)),
  ].filter((r): r is string => typeof r === "string" && r.length > 0);
  for (const root of roots) {
    const dir = join(root, "packages", "content", "pack");
    if (existsSync(join(dir, "p_race.json"))) return dir;
  }
  return null;
}

const PACK_DIR = packRoot();

function loadRecords(name: string): PackRecord[] {
  const file = join(PACK_DIR ?? "", `${name}.json`);
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { records: PackRecord[] };
  return parsed.records;
}

/**
 * statAdj in the engine's STAT order from a pack record's stats block, the
 * same five-key mapping bind.ts's statAdj() does (str,int,wis,dex,con ->
 * STR,INT,WIS,DEX,CON). The pack's own numbers, not a transcription.
 */
function statAdjOf(rec: PackRecord): number[] {
  const s = rec.stats;
  return [s.str, s.int, s.wis, s.dex, s.con];
}

/** The catalogue the session's catalogue() builds, from the real records. */
function buildCatalogue(races: PackRecord[], classes: PackRecord[]) {
  return {
    races: races.map((r) => ({ name: r.name, statAdj: statAdjOf(r) })),
    classes: classes.map((c) => ({ name: c.name, statAdj: statAdjOf(c) })),
    stats: ["STR", "INT", "WIS", "DEX", "CON"],
    /* birth-session.ts fills this from the engine's MAX_BIRTH_POINTS, and so
     * does this test: the budget is the game's number, asserted below. */
    pointBudget: MAX_BIRTH_POINTS,
  };
}

const STAT_ORDER = ["STR", "INT", "WIS", "DEX", "CON"] as const;
const idx = (stat: (typeof STAT_ORDER)[number]): number => STAT_ORDER.indexOf(stat);

describe("the warrior build plan", () => {
  it("says out loud when the real content pack is missing", () => {
    if (!PACK_DIR) {
      // eslint-disable-next-line no-console
      console.warn(
        "[birth] no content pack found (NEO_ANGBAND_REPO or ../neo-angband), " +
          "so the pack-derived plan tests are skipped. They need the game's " +
          "p_race.json/class.json to assert the real races and the real costs.",
      );
    }
    expect(typeof PACK_DIR).toBe(PACK_DIR ? "string" : "object");
  });

  /* Input-contract cases: no pack needed, so they run on any checkout. */
  describe("input contract", () => {
    const catalogue = {
      races: [{ name: "Testling", statAdj: [0, 0, 0, 0, 0] }],
      classes: [
        { name: WARRIOR_CLASS_NAME, statAdj: [0, 0, 0, 0, 0] },
        { name: "Mage", statAdj: [0, 0, 0, 0, 0] },
      ],
      stats: [...STAT_ORDER],
      pointBudget: 4,
    };
    const costs = ladderFromCostTable(BIRTH_STAT_COSTS, BIRTH_STAT_BASE);

    it("refuses a race the catalogue does not list, naming the options", () => {
      expect(() =>
        planWarriorBirth({ catalogue, raceName: "Dunadan", costs }),
      ).toThrowError(/Dunadan/);
      expect(() =>
        planWarriorBirth({ catalogue, raceName: "Dunadan", costs }),
      ).toThrowError(/Testling/);
    });

    it("refuses a catalogue with no Warrior class, naming the pin", () => {
      const noWarrior = {
        ...catalogue,
        classes: [{ name: "Mage", statAdj: [0, 0, 0, 0, 0] }],
      };
      expect(() =>
        planWarriorBirth({ catalogue: noWarrior, raceName: "Testling", costs }),
      ).toThrowError(/Warrior/);
    });

    it("refuses a stats array that is not the engine's STAT order", () => {
      const reordered = {
        ...catalogue,
        stats: ["STR", "DEX", "CON", "INT", "WIS"],
      };
      expect(() =>
        planWarriorBirth({ catalogue: reordered, raceName: "Testling", costs }),
      ).toThrowError(/STR.*INT.*WIS.*DEX.*CON/);
    });

    it("is deterministic: the same input plans the same warrior twice", () => {
      const a = planWarriorBirth({ catalogue, raceName: "Testling", costs });
      const b = planWarriorBirth({ catalogue, raceName: "Testling", costs });
      expect(a).toEqual(b);
    });

    it("spends a small budget on STR before anything else", () => {
      /* Budget 4 under the real table: STR 10->14 (4 x cost 1), nothing left
       * for CON. The cheapest possible proof that the priority order drives
       * the walk, using the engine's own costs. */
      const plan = planWarriorBirth({ catalogue, raceName: "Testling", costs });
      expect(plan.baseStats[idx("STR")]).toBe(BIRTH_STAT_BASE + 4);
      expect(plan.baseStats[idx("CON")]).toBe(BIRTH_STAT_BASE);
      expect(plan.pointsLeft).toBe(0);
    });
  });

  const suite = PACK_DIR ? describe : describe.skip;

  suite("against the real content pack", () => {
    /* Guarded like play.test.ts's loadPack call: vitest still evaluates a
     * skipped suite's body while collecting, so the pack must only be read
     * when the checkout was actually found. */
    const races = PACK_DIR ? loadRecords("p_race") : [];
    const classes = PACK_DIR ? loadRecords("class") : [];
    const catalogue = buildCatalogue(races, classes);
    const costs = ladderFromCostTable(BIRTH_STAT_COSTS, BIRTH_STAT_BASE);
    const warrior = classes.find((c) => c.name === WARRIOR_CLASS_NAME);
    const warriorAdj = warrior ? statAdjOf(warrior) : [];

    it("finds the Warrior class in the pack, with the pack's adjustments", () => {
      /* Guard the fixture, not the module: these are the numbers every
       * effectiveStats assertion below adds, so a pack change that moved them
       * must fail here rather than silently re-meaning the race tests. */
      expect(warrior).toBeDefined();
      expect(warriorAdj).toEqual([3, -2, -2, 2, 2]);
    });

    it("carries the engine's real budget and real point-buy costs", () => {
      /* The Done-whens demand the stock numbers asserted, not assumed: the
       * budget is the engine's MAX_BIRTH_POINTS and base 18 costs what the
       * engine's pointBuyCost says. */
      expect(catalogue.pointBudget).toBe(MAX_BIRTH_POINTS);
      expect(catalogue.pointBudget).toBe(20);
      expect(pointBuyCost(BIRTH_STAT_BASE, 18)).toBe(12);
      expect(statIncreaseCost(16)).toBe(2);
      expect(statIncreaseCost(17)).toBe(4);
    });

    /* DONE-WHEN 1: every race in the real pack, each allocation legal, fully
     * spent, and priority-ordered given that race's adjustments. */
    for (const race of races) {
      it(`plans a legal, fully spent STR>CON>DEX warrior for ${race.name}`, () => {
        const plan = planWarriorBirth({
          catalogue,
          raceName: race.name,
          costs,
        });
        expect(plan.raceName).toBe(race.name);
        expect(plan.className).toBe(WARRIOR_CLASS_NAME);

        /* Legal and complete, by the engine's own judgement: generatePlayer
         * applies a point-based birthStats through exactly this loop
         * (reset_stats + buy_stat, birth.ts), so a replay that lands on the
         * plan's numbers with the plan's leftovers IS the engine accepting
         * every step. An illegal proposed step fails the buyStat call. */
        const replayed = resetStats();
        for (const step of plan.steps) {
          expect(buyStat(replayed, step.stat), `illegal step ${JSON.stringify(step)}`)
            .toBe(true);
        }
        expect(replayed.stats).toEqual(plan.baseStats);
        expect(replayed.pointsLeft).toBe(plan.pointsLeft);
        expect(replayed.pointsSpent).toEqual(plan.pointsSpentPerStat);

        /* Values in range, in the engine's STAT order. */
        expect(plan.baseStats).toHaveLength(STAT_ORDER.length);
        for (const value of plan.baseStats) {
          expect(value).toBeGreaterThanOrEqual(BIRTH_STAT_BASE);
          expect(value).toBeLessThanOrEqual(18);
        }

        /* Fully spent: the stock budget can always be spent down (every stat
         * starts buyable at cost 1), so leftover points here are a planner
         * bug, not a rule of the game. */
        expect(plan.pointsSpent).toBe(catalogue.pointBudget);
        expect(plan.pointsLeft).toBe(0);

        /* The priority: steps form one contiguous block per stat, in the
         * order STR, CON, DEX, INT, WIS; the walk only leaves a stat when the
         * table or the budget stops it. RANK space, not stat-index space:
         * CON's index (4) is higher than DEX's (3), so "never returns to an
         * abandoned stat" is a claim about priority positions. */
        const priority = (["STR", "CON", "DEX", "INT", "WIS"] as const).map(idx);
        const rankOf = new Map<number, number>(
          priority.map((stat, rank) => [stat, rank]),
        );
        let lastRank = -1;
        for (const step of plan.steps) {
          const rank = rankOf.get(step.stat) ?? -1;
          expect(rank, "steps must not return to an abandoned stat")
            .toBeGreaterThanOrEqual(lastRank);
          lastRank = rank;
        }
        expect(plan.steps[0]?.stat).toBe(idx("STR"));
        for (const stat of priority) {
          const value = plan.baseStats[stat] ?? 0;
          const spentHere = plan.pointsSpentPerStat[stat] ?? 0;
          const rank = rankOf.get(stat) ?? 0;
          const spentBefore = plan.steps
            .filter((s) => (rankOf.get(s.stat) ?? 0) < rank)
            .reduce((a, s) => a + s.cost, 0);
          if (value < 18) {
            /* It was the budget that stopped this stat: the next point cost
             * more than what was left when the walk moved on. A stat the walk
             * never reached (empty block) is the same claim with spentHere 0
             * and nothing left to spend. */
            expect(
              statIncreaseCost(value),
              `stat ${STAT_ORDER[stat]} stopped at ${String(value)} while points remained`,
            ).toBeGreaterThan(catalogue.pointBudget - spentBefore - spentHere);
          }
        }

        /* The lens the task pins: the allocation is over BASE stats, and the
         * plan reports what the race and class make of them as raw sums
         * (what the character sheet's race/class bonus columns add). */
        const raceAdj = statAdjOf(race);
        for (let i = 0; i < STAT_ORDER.length; i++) {
          expect(plan.effectiveStats[i]).toBe(
            (plan.baseStats[i] ?? 0) + (raceAdj[i] ?? 0) + (warriorAdj[i] ?? 0),
          );
        }
      });
    }

    /* DONE-WHEN 2: the Half-Troll case, on the pack's real numbers. */
    it("plans base 18 STR for a Half-Troll within the stock budget", () => {
      const halfTroll = races.find((r) => r.name === "Half-Troll");
      /* Asserted, not assumed: the pack's real Half-Troll adjustments and the
       * engine's real budget and costs are what make this case mean anything.
       * If the pack moves them, this fails instead of quietly testing some
       * other race's arithmetic. */
      expect(halfTroll).toBeDefined();
      expect(statAdjOf(halfTroll!)).toEqual([4, -4, -2, -4, 3]);
      expect(catalogue.pointBudget).toBe(MAX_BIRTH_POINTS);

      const plan = planWarriorBirth({
        catalogue,
        raceName: "Half-Troll",
        costs,
      });

      /* Base 18 STR - the module's own output, before the race's +4 and the
       * class's +3 make it effective 25 in the trace. */
      expect(plan.baseStats[idx("STR")]).toBe(18);

      /* Total cost within the stock budget, measured with the engine's own
       * pointBuyCost: the STR block costs what 10->18 costs, and the whole
       * build spends exactly the budget, no more. */
      const strCost = plan.pointsSpentPerStat[idx("STR")] ?? 0;
      expect(strCost).toBe(pointBuyCost(BIRTH_STAT_BASE, 18));
      expect(strCost).toBeLessThanOrEqual(catalogue.pointBudget);
      expect(plan.pointsSpent).toBe(catalogue.pointBudget);
      expect(plan.pointsLeft).toBe(0);
    });
  });
});
