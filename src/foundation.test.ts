/**
 * Foundation tests (P8.0): prove the Borg seam works end-to-end against the
 * frozen agent contract via the scenario harness - perception folds the view
 * into the world model, the controller advances the clock and drives commands,
 * the private RNG is isolated and reproducible, and level changes wipe memory.
 * These guard the substrate the bulk subsystems (P8.1-P8.7) build on.
 */

import { describe, expect, it } from "vitest";
import { Rng as CoreRng } from "@rpgm-tools/neo-angband-core";
import { createBorg } from "./controller.js";
import { perceive, makePerceiveMemo } from "./perceive.js";
import { BorgWorld } from "./world/model.js";
import { makeScenarioView, makeFakeActions } from "./harness.js";
import { makeBorgRng, reseedBorgRng, BORG_LOCAL_SEED } from "./rng.js";
import { keypadDir, distance } from "./think.js";

describe("world model + perception", () => {
  it("folds the player, map, monsters, and floor into the world model", () => {
    const world = new BorgWorld();
    const memo = makePerceiveMemo();
    const view = makeScenarioView({
      player: { grid: { x: 5, y: 5 }, depth: 3 },
      monsters: [{ grid: { x: 8, y: 5 }, raceIndex: 42, hp: 7, maxHp: 10 }],
      floor: { "6,5": [{ tval: 5 } as never] },
    });

    perceive(world, view, memo);

    expect(world.self.c).toEqual({ x: 5, y: 5 });
    expect(world.facts.depth).toBe(3);
    // Monster tracked and back-linked on its grid.
    const kills = [...world.kills.entries()];
    expect(kills).toHaveLength(1);
    expect(kills[0]![1].rIdx).toBe(42);
    expect(kills[0]![1].injury).toBe(30); // (10-7)/10 * 100
    expect(world.map.at(8, 5).kill).toBe(kills[0]![0]);
    // Floor object tracked and back-linked.
    const takes = [...world.takes.entries()];
    expect(takes).toHaveLength(1);
    expect(takes[0]![1].tval).toBe(5);
    expect(world.map.at(6, 5).take).toBe(takes[0]![0]);
    // The player's grid is marked observed.
    expect(world.map.at(5, 5).info & 0x01).toBe(0x01); // BORG_MARK
  });

  it("wipes remembered state when the depth changes (level change)", () => {
    const world = new BorgWorld();
    const memo = makePerceiveMemo();
    perceive(
      world,
      makeScenarioView({
        player: { depth: 1 },
        monsters: [{ grid: { x: 8, y: 5 } }],
      }),
      memo,
    );
    expect([...world.kills.entries()]).toHaveLength(1);

    // Descend: a new level with no monsters -> old memory gone.
    perceive(world, makeScenarioView({ player: { depth: 2 } }), memo);
    expect([...world.kills.entries()]).toHaveLength(0);
    expect(world.facts.depth).toBe(2);
  });

  it("preserves a monster record in place across ticks (belief accumulation)", () => {
    const world = new BorgWorld();
    const memo = makePerceiveMemo();
    perceive(
      world,
      makeScenarioView({ monsters: [{ id: 9, grid: { x: 8, y: 5 } }] }),
      memo,
    );
    const idx0 = [...world.kills.entries()][0]![0];
    perceive(
      world,
      makeScenarioView({ monsters: [{ id: 9, grid: { x: 7, y: 5 } }] }),
      memo,
    );
    const entries = [...world.kills.entries()];
    expect(entries).toHaveLength(1);
    expect(entries[0]![0]).toBe(idx0); // same slot reused
    expect(entries[0]![1].pos).toEqual({ x: 7, y: 5 });
    expect(entries[0]![1].ox).toBe(8); // old position remembered
  });
});

describe("controller cycle", () => {
  /* The clock is PER LEVEL. Arriving anywhere restarts it at 1000
   * (borg-update.c:2017), which is what every absolute test against borg_t is
   * written for - including borg_think_dungeon's own overflow panic at 30000,
   * which hands the game back to a human and, on a clock that only ever climbs,
   * would end every session at the same decision count. */
  it("restarts the clock on arrival and advances it once per think", () => {
    const { world, controller } = createBorg();
    const view = makeScenarioView({ player: { grid: { x: 5, y: 5 } } });
    const act = makeFakeActions();

    expect(world.clock).toBe(0);
    const cmd = controller(view, act);
    expect(world.clock).toBe(1000);
    expect(cmd).not.toBeNull();
    controller(view, act);
    expect(world.clock).toBe(1001);

    controller(makeScenarioView({ player: { grid: { x: 5, y: 5 }, depth: 3 } }), act);
    expect(world.clock).toBe(1000);
  });

  // The foundation stub's fixed melee/step/hold policy was replaced by the
  // faithful borg_think_dungeon ladder in P8.6; its priority behavior is
  // covered in think.test.ts. This test only asserts the controller keeps driving
  // the game (always yields a command on a live level, never stalls).
  it("always produces a command on a live level (drives the game)", () => {
    const { controller } = createBorg();
    const view = makeScenarioView({
      player: { grid: { x: 5, y: 5 } },
      monsters: [{ grid: { x: 9, y: 5 } }],
    });
    const cmd = controller(view, makeFakeActions());
    expect(cmd).not.toBeNull();
  });

  it("yields (null) when the player is dead", () => {
    const { controller } = createBorg();
    const view = makeScenarioView({ player: { dead: true } });
    expect(controller(view, makeFakeActions())).toBeNull();
  });
});

describe("borg RNG isolation + reproducibility", () => {
  it.each([0, 1, BORG_LOCAL_SEED, 0xffffffff])("matches Core's quick stream for seed %s", (seed) => {
    const local = makeBorgRng(seed);
    const core = new CoreRng(seed, { quick: true });
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 200; i++) {
        for (const bound of [-1, 0, 1, 2, 10, 100, 0x08000001, 0x10000000]) {
          expect(local.randint0(bound)).toBe(core.randint0(bound));
        }
        expect(local.randint1(100)).toBe(core.randint1(100));
        expect(local.randSpread(20, 7)).toBe(core.randSpread(20, 7));
      }
      reseedBorgRng(local, seed);
      core.reseed(seed);
    }
    expect(() => local.randint0(0x10000001)).toThrow(RangeError);
  });

  it("leaves the game's random stream unchanged", () => {
    const game = new CoreRng(123);
    const before = game.getState();
    const local = makeBorgRng();
    for (let i = 0; i < 1000; i++) local.randint0(100);
    expect(game.getState()).toEqual(before);
  });
  it("is quick-mode and reproducible from the fixed local seed", () => {
    const a = makeBorgRng();
    const b = makeBorgRng();
    const seqA = [a.randint0(100), a.randint0(100), a.randint0(100)];
    const seqB = [b.randint0(100), b.randint0(100), b.randint0(100)];
    expect(seqA).toEqual(seqB);
  });

  it("reseed restores the exact stream", () => {
    const r = makeBorgRng();
    const first = [r.randint0(1000), r.randint0(1000)];
    reseedBorgRng(r);
    const second = [r.randint0(1000), r.randint0(1000)];
    expect(second).toEqual(first);
  });

  /* Equality alone is not enough, and this is the test that should have
   * existed. reseedBorgRng used to go through core's setState - the SAVEFILE
   * path, which forces quick mode off and left an all-zero WELL table, a fixed
   * point that returns 0 to every draw. Both assertions above still pass
   * against a generator stuck at zero: it is reproducible, and two of them
   * agree. What it is not is random, and borg_twitchy spins forever on dir 0.
   *
   * Asserted on the SPREAD rather than on the mode, so it also covers a future
   * reseed that keeps quick set and still corrupts the stream. It fails in
   * milliseconds; the alternative failure mode is a CI job that runs until the
   * runner kills it. */
  it("still produces a varied stream after a reseed, not a constant", () => {
    const r = makeBorgRng();
    reseedBorgRng(r);
    const draws = Array.from({ length: 60 }, () => r.randint0(10));
    expect(new Set(draws).size).toBeGreaterThan(4);
    expect(draws.filter((d) => d !== 0).length).toBeGreaterThan(30);
  });

  it("keeps producing a varied stream across many thinks", () => {
    const { rng, controller } = createBorg();
    const view = makeScenarioView({ player: { grid: { x: 5, y: 5 }, depth: 2 } });
    controller(view, makeFakeActions());
    controller(view, makeFakeActions());
    const draws = Array.from({ length: 60 }, () => rng.randint0(10));
    expect(new Set(draws).size).toBeGreaterThan(4);
  });

  /*
   * The regression test for a frozen Borg. The controller used to reseed the
   * private stream at the top of every think, so the Nth draw of think 1 and
   * the Nth draw of think 50 were the same number: every equal-cost pathfinding
   * tie-break resolved the same way forever, and every low-probability branch
   * was either always taken or never taken. Upstream saves the ADVANCED seed
   * back after each think (borg.c:504), so the stream carries.
   *
   * Asserted on the DRAW VECTOR of each think, not on a single draw, because
   * that is the shape the bug had: repeated whole vectors, not a repeated
   * scalar. Borg makes many draws per think, so identical vectors over
   * several thinks is proof the stream restarted.
   */
  it("advances its private stream across thinks instead of restarting it", () => {
    const { rng, controller } = createBorg();
    const view = makeScenarioView({ player: { grid: { x: 5, y: 5 }, depth: 2 } });
    const vectors: string[] = [];
    for (let i = 0; i < 8; i++) {
      controller(view, makeFakeActions());
      vectors.push(Array.from({ length: 6 }, () => rng.randint0(1000)).join(","));
    }
    expect(new Set(vectors).size).toBe(8);
  });

  it("replays exactly from the same starting seed", () => {
    const run = (): string => {
      const { rng, controller } = createBorg({ rngSeed: 12345 });
      const view = makeScenarioView({ player: { grid: { x: 5, y: 5 }, depth: 2 } });
      for (let i = 0; i < 8; i++) controller(view, makeFakeActions());
      return Array.from({ length: 6 }, () => rng.randint0(1000)).join(",");
    };
    expect(run()).toBe(run());
  });

  it("takes a different path from a different starting seed", () => {
    const run = (seed: number): string => {
      const { rng, controller } = createBorg({ rngSeed: seed });
      const view = makeScenarioView({ player: { grid: { x: 5, y: 5 }, depth: 2 } });
      for (let i = 0; i < 8; i++) controller(view, makeFakeActions());
      return Array.from({ length: 6 }, () => rng.randint0(1000)).join(",");
    };
    expect(run(12345)).not.toBe(run(BORG_LOCAL_SEED));
  });
});

describe("geometry helpers", () => {
  it("keypadDir maps signed steps to keypad directions", () => {
    expect(keypadDir(1, 0)).toBe(6); // east
    expect(keypadDir(-1, 0)).toBe(4); // west
    expect(keypadDir(0, -1)).toBe(8); // north
    expect(keypadDir(0, 1)).toBe(2); // south
    expect(keypadDir(1, -1)).toBe(9); // north-east
    expect(keypadDir(0, 0)).toBe(5); // center
  });

  it("distance is Chebyshev (king moves)", () => {
    expect(distance(0, 0, 3, 1)).toBe(3);
    expect(distance(0, 0, 2, 2)).toBe(2);
    expect(distance(5, 5, 5, 5)).toBe(0);
  });
});
