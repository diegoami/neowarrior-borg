/**
 * THE BAKE-OFF SWEEP'S PARAMETERIZATION: the grid and the guard (T07, #10).
 *
 * The heavy sweep - 4 races x 8 seeds x 2 engine variants at cap 600 - is a
 * tools/ invocation (tools/bakeoff.mjs), not a suite test: it is north of an
 * hour of real play, and a suite that takes that long stops being run. What
 * this module owns is everything about the sweep that the record's table
 * would silently LIE without, so the tool and the smoke test
 * (src/measure/bakeoff.test.ts) share ONE implementation rather than two
 * that agree by accident:
 *
 * - the CELL GRID (bakeoffCells): every candidate race crossed with the SAME
 *   seed list, one life per (race, seed) pair, races in
 *   WARRIOR_RACE_CANDIDATES' order - the bake-off's rows are the raceChoice
 *   setting's options, in the order the setting indexes them. The T07 hazard
 *   is "comparing races across different seeds or budgets": a race missing a
 *   seed, or a seed counted twice, skews that race's medians and nothing
 *   downstream can see it, so the builder REFUSES a duplicate race or seed
 *   and returns the complete cross product.
 * - the BUILD GUARD (assertBakeoffBuild): a sweep life is comparable only if
 *   it is the planned warrior. The session driver (src/records/session.ts)
 *   reads race, class and statBirth from the LIVE player the engine just
 *   birthed; this guard pins that read against the plan for the race
 *   (warriorSessionPlan's own arithmetic) and fails the sweep loudly, naming
 *   the cell, when the engine birthed anything else. statBirth is the pinned
 *   field for the same reason play.test.ts pins it: nothing in play rewrites
 *   it, so it is the birth itself.
 * - the MEDIAN (bakeoffMedian) the README's tables argue from - the task's
 *   rule is medians, not outliers, and an even count averages its two middle
 *   values rather than picking one.
 *
 * GAME-FREE like src/birth: structural shapes only, no engine import, no
 * clock, no RNG (rule 4). The tool reaches this through the same esbuild
 * bundle it drives the session driver through, so the committed record and
 * the smoke test cannot drift apart on two implementations.
 */

/** One sweep cell: one life of one race on one engine seed. */
export interface BakeoffCell {
  readonly race: string;
  readonly seed: number;
}

/**
 * What the guard checks a life against. WarriorBuildPlan's read of it
 * (raceName, className, baseStats), structural so the plan module and this
 * module need not import each other.
 */
export interface BakeoffPlanLook {
  readonly raceName: string;
  readonly className: string;
  readonly baseStats: readonly number[];
}

/**
 * What the guard checks. SessionLife's read of it - race, className and
 * baseStats as the session driver recorded them FROM THE LIVE PLAYER, never
 * from the Borg's or the plan's own bookkeeping.
 */
export interface BakeoffLifeLook {
  readonly race: string;
  readonly className: string;
  readonly baseStats: readonly number[];
}

/**
 * The sweep's cells: the complete cross product of the races and the seeds,
 * race-major (every seed of the first race, then every seed of the second),
 * seeds in the order handed in - the order they are played in.
 *
 * @throws Error on a grid that would double-count a cell or play nothing: an
 * empty race or seed list, a duplicate race, or a duplicate seed. A sweep
 * that quietly dropped or repeated a cell would skew the medians in one
 * race's favour, which is exactly the lie this refuses to tell.
 */
export function bakeoffCells(races: readonly string[], seeds: readonly number[]): BakeoffCell[] {
  if (races.length === 0) throw new Error("a bake-off needs at least one race");
  if (seeds.length === 0) throw new Error("a bake-off needs at least one seed");
  const seenRaces = new Set<string>();
  for (const race of races) {
    if (seenRaces.has(race)) throw new Error(`a bake-off race appears twice: ${race}`);
    seenRaces.add(race);
  }
  const seenSeeds = new Set<number>();
  for (const seed of seeds) {
    if (seenSeeds.has(seed)) throw new Error(`a bake-off seed appears twice: ${String(seed)}`);
    seenSeeds.add(seed);
  }

  const cells: BakeoffCell[] = [];
  for (const race of races) {
    for (const seed of seeds) cells.push({ race, seed });
  }
  return cells;
}

/**
 * Assert that one sweep life is the planned warrior for its cell, and fail
 * the sweep rather than let an unplanned build into the table.
 *
 * `context` names the cell (variant, race, seed) so the failure says which
 * run to look at; every field check quotes both sides, because "wrong race"
 * without the two names is a riddle, not a diagnosis.
 */
export function assertBakeoffBuild(life: BakeoffLifeLook, plan: BakeoffPlanLook, context: string): void {
  if (life.race !== plan.raceName) {
    throw new Error(
      `${context}: the live player was born the wrong race (${life.race}, planned ${plan.raceName})`,
    );
  }
  if (life.className !== plan.className) {
    throw new Error(
      `${context}: the live player was born the wrong class (${life.className}, planned ${plan.className})`,
    );
  }
  if (
    life.baseStats.length !== plan.baseStats.length ||
    life.baseStats.some((value, i) => value !== plan.baseStats[i])
  ) {
    throw new Error(
      `${context}: the live player's statBirth (${life.baseStats.join(",")}) is not the plan's ` +
        `(${plan.baseStats.join(",")})`,
    );
  }
}

/**
 * The median of the measured values, sorted: the middle of an odd count, the
 * mean of the two middles of an even count. The README's tables argue from
 * this number because one lucky seed must not pick the default race
 * (docs/tasks/T07.md's hazard).
 *
 * @throws Error on an empty input - a median of nothing is a table cell the
 * sweep failed to fill, and it should fail loudly rather than read as 0.
 */
export function bakeoffMedian(values: readonly number[]): number {
  if (values.length === 0) throw new Error("a median of nothing is a cell the sweep failed to fill");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}
