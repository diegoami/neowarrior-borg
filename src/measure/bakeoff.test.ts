/**
 * THE BAKE-OFF'S SMOKE TEST: the sweep's race parameterization (T07, #10).
 *
 * The heavy sweep itself - 4 races x 8 seeds x 2 engine variants at cap 600 -
 * is a tools/ invocation (tools/bakeoff.mjs), not a suite test: it is north
 * of an hour of real play, and a suite that takes that long stops being run.
 * This file pins the parts of the sweep the table would silently LIE without,
 * so the tool and the test share one implementation (src/measure/bakeoff.ts,
 * bundled into the tool the same src/records/session.ts is):
 *
 * - the CELL GRID: every candidate race crossed with the SAME seed list, one
 *   life per (race, seed) pair. The T07 hazard is "comparing races across
 *   different seeds": a race missing a seed, or a seed counted twice, skews
 *   the medians in that race's favour and nothing downstream can see it.
 * - the BUILD GUARD: a sweep life is comparable only if it is the planned
 *   warrior. The session driver reads race/class/statBirth from the LIVE
 *   player; the guard pins that read against the plan for the race and names
 *   the cell when the engine birthed anything else.
 * - the MEDIAN the README argues from (the task's rule: medians, not
 *   outliers - an even count averages its two middle values).
 *
 * GAME-FREE, like the module it tests: no pack, no engine, no skip.
 */

import { describe, expect, it } from "vitest";
import { WARRIOR_RACE_CANDIDATES } from "../birth/settings.js";
import { assertBakeoffBuild, bakeoffCells, bakeoffMedian } from "./bakeoff.js";

/** The bake-off's own seed list: the four T06 pinned seeds plus the four the play tests own. */
const SEEDS = [1, 7, 20, 23, 34, 42, 49, 99] as const;

describe("the bake-off sweep's parameterization", () => {
  it("crosses every candidate race with the SAME seeds, one cell per pair", () => {
    const cells = bakeoffCells(WARRIOR_RACE_CANDIDATES, SEEDS);
    expect(cells).toHaveLength(WARRIOR_RACE_CANDIDATES.length * SEEDS.length);

    /* Race-major, in the candidates' own order - the bake-off's rows are the
     * raceChoice setting's options, in the order the setting indexes them. */
    for (const [index, race] of WARRIOR_RACE_CANDIDATES.entries()) {
      const rows = cells.slice(index * SEEDS.length, (index + 1) * SEEDS.length);
      expect(rows.map((cell) => cell.race), `row ${String(index)} of the grid`).toEqual(
        Array.from({ length: SEEDS.length }, () => race),
      );
      /* THE HAZARD, as an assertion: every race plays exactly this seed list,
       * in play order - a race that missed a seed, or met it twice, fails
       * here rather than in a median. */
      expect(rows.map((cell) => cell.seed), `${race}'s seeds`).toEqual([...SEEDS]);
    }

    /* One life per pair: no (race, seed) cell repeats. */
    expect(new Set(cells.map((cell) => `${cell.race}:${String(cell.seed)}`))).toHaveLength(cells.length);
  });

  it("refuses a grid that would double-count a cell", () => {
    expect(() => bakeoffCells(WARRIOR_RACE_CANDIDATES, [20, 20])).toThrow(/seed appears twice: 20/u);
    expect(() => bakeoffCells(["Half-Troll", "Half-Troll"], [20])).toThrow(/race appears twice: Half-Troll/u);
    expect(() => bakeoffCells([], [20])).toThrow(/at least one race/u);
    expect(() => bakeoffCells(["Half-Troll"], [])).toThrow(/at least one seed/u);
  });

  it("accepts a life that is the planned build and refuses one that is not", () => {
    /* The shapes are structural on purpose: the session driver's life and the
     * plan module's plan both fit without either importing the other. */
    const plan = { raceName: "Dwarf", className: "Warrior", baseStats: [18, 10, 10, 10, 17] };
    const life = { race: "Dwarf", className: "Warrior", baseStats: [18, 10, 10, 10, 17] };
    expect(() => assertBakeoffBuild(life, plan, "pin Dwarf seed 20")).not.toThrow();

    expect(() => assertBakeoffBuild({ ...life, race: "High-Elf" }, plan, "pin Dwarf seed 20")).toThrow(
      /pin Dwarf seed 20.*born the wrong race.*High-Elf.*Dwarf/us,
    );
    expect(() => assertBakeoffBuild({ ...life, className: "Mage" }, plan, "pin Dwarf seed 20")).toThrow(
      /born the wrong class.*Mage.*Warrior/us,
    );
    expect(() => assertBakeoffBuild({ ...life, baseStats: [17, 10, 10, 10, 17] }, plan, "pin Dwarf seed 20")).toThrow(
      /statBirth.*17,10,10,10,17.*18,10,10,10,17/us,
    );
  });

  it("medians: the middle of an odd count, the mean of the two middles of an even one", () => {
    expect(bakeoffMedian([1, 1, 2, 3, 5])).toBe(2);
    expect(bakeoffMedian([1, 1, 2, 3])).toBe(1.5);
    expect(bakeoffMedian([4])).toBe(4);
    expect(bakeoffMedian([3, 1, 2])).toBe(2);
    expect(() => bakeoffMedian([])).toThrow(/median of nothing/u);
  });
});
