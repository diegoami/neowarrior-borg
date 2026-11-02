/**
 * THE TEST THAT PLAYS A TURN.
 *
 * Every other test in this repository asks a subsystem a question and checks the
 * answer. Not one of them plays the game, and PLANNED.md is the record of what
 * that cost: a mod whose suite was green, whose port was faithful, and which
 * wedged against the first locked door it met. Four separate infinite loops
 * (disarm, wield, stair-shuttle, and walking to a monster that was not there)
 * were all invisible to unit tests, because each one is a decision that is
 * individually correct and collectively a hang.
 *
 * So this boots a REAL game against the engine, installs the Borg as its command
 * provider, and drives the loop for thousands of decisions. It does not check
 * that the Borg plays WELL - "it tries its best and gets as far as it can" is the
 * target, and a level-1 character dying on depth 2 is upstream's own outcome. It
 * checks that the Borg is still PLAYING: that no single command has run away with
 * the session, that the character has been to more than a handful of squares,
 * that it does not pace with nothing in sight, and that it does not sit down to
 * rest with something standing next to it.
 *
 * Every one of those was false at some point on 2026-08-21.
 *
 * WHY THIS SKIPS WITHOUT THE GAME'S CHECKOUT. The content pack is the game's, not
 * this repository's, and there is no copy here to fall back on. `NEO_ANGBAND_REPO`
 * (or the sibling checkout the other tools already assume) is what makes this
 * runnable, exactly as it is for the plugin builder. A skip says so out loud
 * rather than passing on nothing.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { ContentIdResolver, LOOP_STATUS, installController, runGameLoop, startGame } from "@rpgm-tools/neo-angband-core";
import type { GamePack, GameState, StartedGame } from "@rpgm-tools/neo-angband-core";
import { createBorg } from "./controller.js";
import { makeCoreResolvers } from "./resolvers.js";
import { loadPack, packRoot, playWarriorSession, warriorSessionPlan } from "./records/session.js";
import { runsBuildFacts, sessionRunsDocument } from "./records/reporter.js";
import { WARRIOR_CLASS_NAME, type WarriorBuildPlan } from "./birth/plan.js";
import { WARRIOR_RACE_CANDIDATES } from "./birth/settings.js";

const PACK_DIR = packRoot();
/* src/ → the repository root, where manifest.json and package.json sit. */
const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** What a run did, in the terms a stall shows up in. */
interface RunReport {
  /** Decisions taken before the run ended. */
  decisions: number;
  /** Game turns elapsed. A stall that costs no energy leaves this flat. */
  turns: number;
  /** Every depth the character stood on. */
  depths: number[];
  /** How many times each command code was issued. */
  commands: Record<string, number>;
  /** Distinct depth+grid the character occupied. A loop leaves this tiny. */
  places: number;
  /** Whether the character died (an ending, not a failure). */
  dead: boolean;
  /**
   * The fewest distinct squares any 60-decision stretch covered while NOTHING
   * was visible and the Borg was not resting. This is "sitting there or moving
   * frantically back and forth across three cells" written as a number: a Borg
   * with no monster in sight has nothing to hold it in place, so a low value is a
   * decision loop and not caution. 999 when no such stretch occurred.
   */
  jitter: number;
  /** Decisions on which the Borg chose to sit still with a monster adjacent. */
  restedBesideMonster: number;
}

/**
 * Play one game. The turn tail is the host's job in the real shell (main.ts);
 * here it is the three lines below, which is all a level change needs when
 * nothing has to be drawn.
 */
function playRun(pack: GamePack, seed: number, decisions: number): RunReport {
  const game = startGame(pack, { seed, depth: 0 });
  const state: GameState = game.state;
  const resolver = new ContentIdResolver({
    objects: game.booted.registries.objects,
    playerRaces: game.players.races,
    playerClasses: game.players.classes,
  });
  const borg = createBorg({
    /* Vary the Borg's private stream with the game seed. Every run used to
     * share one starting seed, so all four "different" runs drove an identical
     * draw sequence and the suite was structurally blind to anything that
     * depends on the Borg's own rolls: tie-breaks, retry counters, the twitchy
     * fallback. A regression there would have shown up on no seed at all. */
    rngSeed: (seed * 2654435761) >>> 0 || 1,
    resolvers: makeCoreResolvers({
      races: game.booted.registries.monsters.races,
      objects: game.booted.registries.objects,
      state: state as never,
      /* The attack-message table, on the same terms plugin.ts wires it. Without
       * it the Borg does not recognise being hit by something it cannot see, so
       * a run measured without it is a run measured on a different Borg. */
      blowMethods: game.booted.registries.monsters.blowMethods.values(),
    }),
  });

  /* The latch the host installs for the same reason (main.ts): runGameLoop asks
   * nextCommand for as long as the player has energy, so a controller that
   * always answers never lets the loop return. */
  let armed = false;
  const commands: Record<string, number> = {};
  /* One entry per decision: where the character stood, and whether anything was
   * in sight. Both questions are asked of the LIVE game rather than of the Borg,
   * so a Borg that has mislaid a monster cannot talk its way out of them. */
  const trail: Array<{ at: string; alone: boolean; cmd: string }> = [];
  let restedBesideMonster = 0;
  installController(
    state,
    (view, act) => {
      if (!armed) return null;
      armed = false;
      const cmd = borg.controller(view, act);
      if (cmd) commands[cmd.code] = (commands[cmd.code] ?? 0) + 1;

      let alone = true;
      let adjacent = false;
      const me = state.actor.grid;
      for (const m of view.monsters()) {
        if (!m.visible) continue;
        alone = false;
        if (Math.max(Math.abs(m.grid.x - me.x), Math.abs(m.grid.y - me.y)) <= 1) {
          adjacent = true;
        }
      }
      if (adjacent && cmd?.code === "rest") restedBesideMonster += 1;
      trail.push({
        at: `${String(state.chunk.depth)}:${String(me.x)},${String(me.y)}`,
        alone,
        cmd: cmd?.code ?? "none",
      });
      return cmd;
    },
    { viewDeps: { resolver, reg: game.booted.registries.objects } },
  );

  const places = new Set<string>();
  const depths = new Set<number>([state.chunk.depth]);
  let dead = false;
  let taken = 0;

  for (; taken < decisions; taken++) {
    armed = true;
    const status = runGameLoop(state, game.registry);
    places.add(
      `${String(state.chunk.depth)}:${String(state.actor.grid.x)},${String(state.actor.grid.y)}`,
    );
    depths.add(state.chunk.depth);
    if (status === LOOP_STATUS.DEAD) {
      dead = true;
      break;
    }
    if (status === LOOP_STATUS.DEATH_CONFIRM) {
      state.pendingDeath?.resolve(true);
      continue;
    }
    if (status === LOOP_STATUS.LEVEL_CHANGE) {
      game.changeLevel(state.targetDepth ?? state.chunk.depth + 1);
      state.generateLevel = false;
      depths.add(state.chunk.depth);
    }
  }

  /* Resting and dropping are EXCLUDED, and the exclusions are the whole reason
   * this number means anything. Both keep a character on one square while
   * making real progress, so counting them turns patience into a false alarm.
   *
   * `rest` maps to a single-turn hold in this engine, so a character healing up
   * spends sixty decisions standing still - upstream's `R&` rendered one
   * decision at a time, not a loop. `drop` discards one item from a stack per
   * command in the C too (borg-junk.c:472-475), so emptying a stack of forty
   * arrows is forty decisions on one grid, and that is upstream's own pace.
   *
   * What is left is the Borg deciding, over and over, to go somewhere it has
   * just been with nothing in sight to hold it there. A genuine runaway drop is
   * still caught, by the single-command cap above. */
  const moving = trail.filter((t) => t.cmd !== "rest" && t.cmd !== "drop");
  const WINDOW = 60;
  let jitter = 999;
  for (let i = 0; i + WINDOW <= moving.length; i++) {
    const win = moving.slice(i, i + WINDOW);
    if (win.some((t) => !t.alone)) continue;
    const cells = new Set(win.map((t) => t.at)).size;
    if (cells < jitter) jitter = cells;
  }

  return {
    decisions: taken,
    turns: state.turn,
    depths: [...depths].sort((a, b) => a - b),
    commands,
    places: places.size,
    dead,
    jitter,
    restedBesideMonster,
  };
}

/**
 * Does this engine tell the truth about a locked door?
 *
 * `CellView.trap` used to mean "this grid holds any trap record", and a closed
 * door's lock IS a trap record (`square_set_door_lock`). So every locked door
 * arrived as something to disarm, `disarm` refused it for free, and the Borg
 * looped against one door for as long as it was left running. The fix is
 * `square_isdisarmabletrap` in the engine's own perceive facade; nothing this
 * repository can do reproduces it, because the frozen view carries no other
 * field that separates a door lock from a trap.
 *
 * MEASURED, not read off a version string. Lock a door and ask the view. A
 * version comparison would pass on any build somebody had renumbered, and the
 * whole reason this file exists is that facts about behaviour kept being taken
 * from something other than the behaviour.
 */
function engineSeparatesDoorLocksFromTraps(pack: GamePack): boolean {
  const game = startGame(pack, { seed: 5, depth: 1 });
  const state: GameState = game.state;
  const grid = { x: state.actor.grid.x + 1, y: state.actor.grid.y };
  const closed = game.booted.registries.features.byCodeName("CLOSED");
  state.chunk.setFeat(grid, closed.fidx);
  state.setDoorLock?.(grid, 5);
  const session = installController(state, () => null, {});
  const cell = session.view.cell(grid.x, grid.y);
  session.uninstall();
  /* A door that reports no trap is the fixed engine. A door that reports one is
   * the engine that hangs, and there is no point measuring play on it. */
  return cell !== null && cell.trap === false;
}

const suite = PACK_DIR ? describe : describe.skip;

suite("the Borg plays a real game", () => {
  const pack = PACK_DIR ? loadPack(PACK_DIR) : null;
  const engineReady = pack ? engineSeparatesDoorLocksFromTraps(pack) : false;
  const when = engineReady ? it : it.skip;

  /* The one assertion that runs on ANY engine: an engine that reports a locked
   * door as a trap cannot be played on, and saying so out loud is the point.
   * Every play test below is skipped on such an engine rather than failing,
   * because the defect is not in this repository and a red suite here would send
   * the next reader looking in the wrong place. */
  it("names the engine fix its play tests depend on", () => {
    if (!engineReady) {
      // eslint-disable-next-line no-console
      console.warn(
        "[borg] the installed engine still reports a locked door as a disarmable " +
          "trap, so the live-play tests are skipped. They need the engine release " +
          "that narrows CellView.trap to square_isdisarmabletrap; raise the engine " +
          "floor in manifest.json to that version before tagging this mod.",
      );
    }
    expect(typeof engineReady).toBe("boolean");
  });

  /* Four seeds rather than one: each of the three loops this test was written
   * for showed on some seeds and not others, and the wield loop was the only one
   * that showed on all four. */
  for (const seed of [1, 7, 42, 99]) {
    when(`keeps playing for 1500 decisions (seed ${String(seed)})`, () => {
      const r = playRun(pack!, seed, 1500);

      /* NO COMMAND RUNS AWAY WITH THE SESSION. This is the shape all three
       * loops had, and it is the only assertion that could have caught them:
       * 559 disarms against one door, 3964 wields between two torches, 215
       * descend/ascend pairs between the town and level 1. Movement is exempt
       * from nothing - `walk` is also how the Borg attacks, and a Borg that
       * walks 1200 times over 1500 decisions is exploring. The cap is on any
       * OTHER single verb. */
      const total = Object.values(r.commands).reduce((a, b) => a + b, 0);
      for (const [code, count] of Object.entries(r.commands)) {
        if (code === "walk" || code === "rest") continue;
        expect(
          count,
          `"${code}" was issued ${String(count)} of ${String(total)} times: ` +
            `a single command taking over is what a stall looks like from outside`,
        ).toBeLessThan(Math.max(60, Math.trunc(total / 2)));
      }

      /* AND IT GOES SOMEWHERE. A decision loop passes the check above when two
       * verbs alternate, so count the ground covered as well. Both the
       * stair-shuttle and the two-square oscillation left this in single
       * figures.
       *
       * Only for a run that was still going. A DEATH IS AN ENDING, and dying on
       * depth 1 after 77 decisions is upstream's own outcome for a level-1
       * character that met something it could not see - the target for this mod
       * is that it tries its best, not that it survives. It is also the cleanest
       * possible evidence that it was not stuck: every stall this test exists to
       * catch ran for as long as it was left running and never died. */
      if (!r.dead) {
        expect(
          r.places,
          `the character stood on ${String(r.places)} squares in ${String(r.decisions)} decisions`,
        ).toBeGreaterThan(30);
      }

      /* AND GAME TIME PASSES. A command the engine refuses costs no energy, so a
       * borg looping on one runs forever with the world frozen - the disarm hang
       * exactly. Ten turns per decision is the cost of one move at normal speed. */
      expect(r.turns).toBeGreaterThan(r.decisions * 2);

      /* AND IT DOES NOT JITTER WITH NOTHING IN SIGHT. Reported from a real game
       * as "just sitting there or moving frantically back and forth across three
       * cells, doing nothing until something comes up and picks a fight" - and
       * the last clause is the diagnosis, because a Borg with nothing in view has
       * no reason to hold position. Sixty consecutive decisions confined to three
       * squares, with no monster visible for any of them, is that report. */
      expect(
        r.jitter,
        `the tightest stretch of 60 monster-free decisions that were not rests or drops ` +
          `covered ${String(r.jitter)} squares`,
      ).toBeGreaterThan(3);

      /* AND IT DOES NOT SIT STILL WITH SOMETHING NEXT TO IT. borg_check_rest
       * refuses a grid with a monster one square away, and the recover ladder
       * used to be wired to a constant `true` instead of asking it. */
      expect(
        r.restedBesideMonster,
        "the Borg chose to rest with a monster adjacent",
      ).toBe(0);
    }, 120_000);
  }

  when("gets into the dungeon and back out under its own steam", () => {
    /* The town half was never in doubt; leaving a dungeon level was, because
     * nothing in the port used a staircase it was standing on until the
     * caution.c:1169 block was ported. */
    const r = playRun(pack!, 1, 1500);
    expect(r.depths).toContain(0);
    expect(r.depths.some((d) => d >= 1)).toBe(true);
    expect(r.commands["descend"] ?? 0).toBeGreaterThan(0);
    expect(r.commands["ascend"] ?? 0).toBeGreaterThan(0);
  }, 120_000);
});

/* ==================================================================
 * THE WARRIOR RESTART LOOP, HEADLESS (T04, #7)
 * ==================================================================
 *
 * The mod's loop runs through host seams this harness does not have - no web
 * shell, no page to reload, no roster - so the loop is APPROXIMATED the way
 * docs/tasks/T04.md specifies: when a warrior dies, the next character is
 * booted by the same plan (planWarriorBirth) the T03 presenter replays, with
 * startGame({ roller: "point", birthStats }) standing in for
 * saves.create({ resumeAutoplayer: true }) + the presenter + the reload.
 * What that keeps faithful is the part the task cares about: the BUILD is
 * the presenter's build (one plan module, both callers), and every assertion
 * about it is made against the LIVE player the engine just birthed, never
 * against our own bookkeeping.
 *
 * WHY statBirth IS THE PINNED FIELD. generatePlayer threads the point-buy
 * through reset_stats + buy_stat and stores the result as the natural stats
 * BEFORE race and class adjustments are folded in (packages/core/src/player/
 * birth.ts: statMax = statCur = statBirth = the buy), which is exactly the
 * plan's baseStats semantics. statBirth is that array FROZEN AT BIRTH: play
 * moves statCur (drains, restoration) and statMax (gain potions, drains),
 * but nothing in play rewrites statBirth, so a level-5 warrior who found
 * three gain-strength potions still shows the allocation it was born with.
 * Asserting it at the first moment after startGame - before a single
 * decision - pins the birth itself rather than anything a level-up could
 * confound; asserting it after a whole life would still be true, which is
 * the point of choosing it.
 */
suite("the warrior restart loop, headless", () => {
  const pack = PACK_DIR ? loadPack(PACK_DIR) : null;
  const engineReady = pack ? engineSeparatesDoorLocksFromTraps(pack) : false;
  const when = engineReady ? it : it.skip;

  /**
   * The harness's own EXPLICIT race. It never goes through the raceChoice
   * setting (src/birth/settings.ts): the harness hands startGame the plan
   * directly, so it names its race here - candidate 0 of the same shortlist
   * the setting indexes, which is also the setting's declared default, so
   * the default warrior is the same one either way.
   */
  const WARRIOR_RACE = WARRIOR_RACE_CANDIDATES[0];

  /**
   * The plan the presenter replays, computed exactly as plugin.ts wires it:
   * the same module, the published engine's own cost table and point budget,
   * this explicit race. This is the ONE plan every caller shares (T06 moved
   * it into src/records/session.ts so the session driver answers to the same
   * arithmetic); a disagreement between the harness's warrior and the
   * presenter's is a bug in one of them, not a choice each makes.
   */
  function warriorBuildPlan(): WarriorBuildPlan {
    return warriorSessionPlan(pack!, WARRIOR_RACE);
  }

  /** What one warrior's life shows, in the terms the loop cares about. */
  interface WarriorLife {
    readonly seed: number;
    /** Whether the warrior died (the event that boots the next one). */
    readonly dead: boolean;
    readonly decisions: number;
    readonly turns: number;
    /** The deepest dungeon level the LIVE player says it reached. */
    readonly deepest: number;
    /** The cause of death, as the player's own died_from carries it. */
    readonly cause: string | null;
  }

  /**
   * Boot one planned warrior and assert its build FROM THE LIVE PLAYER, at
   * the first moment the player exists - before a single decision, so no
   * level-up or drain can confound the check. This is the whole "the loop
   * rebirths the SAME warrior" claim: if the engine birthed anything else,
   * these three expectations fail on that character, not on an aggregate.
   */
  function bootPlannedWarrior(seed: number, plan: WarriorBuildPlan): StartedGame {
    const game = startGame(pack!, {
      seed,
      depth: 0,
      raceName: plan.raceName,
      className: WARRIOR_CLASS_NAME,
      roller: "point",
      birthStats: [...plan.baseStats],
    });
    const born = game.state.actor.player;
    expect(born.race.name, `warrior on seed ${String(seed)} was born the wrong race`).toBe(plan.raceName);
    expect(born.cls.name, `warrior on seed ${String(seed)} was born the wrong class`).toBe(WARRIOR_CLASS_NAME);
    expect(
      [...born.statBirth],
      `warrior on seed ${String(seed)} was born with stats it was not planned with`,
    ).toEqual([...plan.baseStats]);
    return game;
  }

  /** One warrior: boot (asserted), play to its death or the decision cap. */
  function playWarriorLife(seed: number, plan: WarriorBuildPlan, decisions: number): WarriorLife {
    const game = bootPlannedWarrior(seed, plan);
    const state: GameState = game.state;
    const resolver = new ContentIdResolver({
      objects: game.booted.registries.objects,
      playerRaces: game.players.races,
      playerClasses: game.players.classes,
    });
    const borg = createBorg({
      /* The Borg's private stream, varied with the game seed exactly as
       * playRun varies it: the chain of warriors must not share one draw
       * sequence either. */
      rngSeed: (seed * 2654435761) >>> 0 || 1,
      resolvers: makeCoreResolvers({
        races: game.booted.registries.monsters.races,
        objects: game.booted.registries.objects,
        state: state as never,
        blowMethods: game.booted.registries.monsters.blowMethods.values(),
      }),
    });

    /* The latch, as in playRun: runGameLoop asks nextCommand for as long as
     * the player has energy, so a controller that always answers never lets
     * the loop return. */
    let armed = false;
    installController(
      state,
      (view, act) => {
        if (!armed) return null;
        armed = false;
        return borg.controller(view, act);
      },
      { viewDeps: { resolver, reg: game.booted.registries.objects } },
    );

    let dead = false;
    let taken = 0;
    for (; taken < decisions; taken++) {
      armed = true;
      const status = runGameLoop(state, game.registry);
      if (status === LOOP_STATUS.DEAD) {
        dead = true;
        break;
      }
      if (status === LOOP_STATUS.DEATH_CONFIRM) {
        state.pendingDeath?.resolve(true);
        continue;
      }
      if (status === LOOP_STATUS.LEVEL_CHANGE) {
        game.changeLevel(state.targetDepth ?? state.chunk.depth + 1);
        state.generateLevel = false;
      }
    }

    return {
      seed,
      dead,
      decisions: taken,
      turns: state.turn,
      deepest: state.actor.player.maxDepth,
      cause: dead ? state.actor.player.diedFrom : null,
    };
  }

  /**
   * Run the loop's chain over `seeds`, the way the loop itself sequences:
   * the next warrior boots ONLY behind an explicit assertion that its
   * predecessor DIED (#31 - three deaths anywhere among four lives do not
   * prove a chain; an interior survivor splits it into two shorter chains,
   * and the real loop, which sequences on LOOP_STATUS.DEAD, would simply
   * never have booted the next one). Every boot asserts the planned build
   * from the live player inside bootPlannedWarrior.
   */
  function chainPlannedWarriors(plan: WarriorBuildPlan, seeds: readonly number[], capFor: (seed: number) => number): WarriorLife[] {
    const lives: WarriorLife[] = [];
    for (const seed of seeds) {
      const previous = lives[lives.length - 1];
      if (previous !== undefined) {
        expect(
          previous.dead,
          `warrior on seed ${String(previous.seed)} was still alive after its session slice, ` +
            `so the restart loop would never have booted seed ${String(seed)}`,
        ).toBe(true);
      }
      lives.push(playWarriorLife(seed, plan, capFor(seed)));
    }
    return lives;
  }

  when("plays a session of consecutive planned warriors, each reborn on the last one's death", () => {
    const plan = warriorBuildPlan();
    /* The plan is what T02's walk makes of the stock table: STR 18, CON 17,
     * the rest at base, no points left - asserted here rather than assumed,
     * because the session's meaning depends on it. */
    expect(plan.raceName).toBe(WARRIOR_RACE);
    expect(plan.baseStats).toEqual([18, 10, 10, 10, 17]);
    expect(plan.pointsLeft).toBe(0);

    /* THE SESSION: boot warriors in a chain, each behind its predecessor's
     * death, exactly as the loop's create would. The seeds are pinned (the
     * engine is deterministic): probed on the pinned engine, each of these
     * warriors dies on depth 1 inside 369 decisions (grey mold, a
     * centipede, a floating eye, a wild dog - a level-1 warrior meeting
     * something it cannot see is upstream's own outcome), so the
     * 600-decision cap carries 230 decisions of margin. */
    const lives = chainPlannedWarriors(plan, [20, 23, 34, 49], () => 600);

    /* Every boot already asserted its build from the live player (inside
     * bootPlannedWarrior), and every boot except the first was gated on its
     * predecessor's death (inside chainPlannedWarriors); reaching this line
     * means four consecutive planned warriors were joined by deaths. What
     * remains is the count: at least three deaths among the four. */
    expect(lives).toHaveLength(4);
    const deaths = lives.filter((life) => life.dead);
    expect(
      deaths.length,
      `the session buried ${String(deaths.length)} of ${String(lives.length)} warriors ` +
        `(${lives.map((life) => `${String(life.seed)}:${life.dead ? `died to ${life.cause ?? "?"} after ${String(life.decisions)} decisions` : `survived ${String(life.decisions)} decisions`}`).join(", ")})`,
    ).toBeGreaterThanOrEqual(3);
  }, 300_000);

  when("refuses to boot the next warrior behind one that survived its slice", () => {
    /* #31's guard, proven on the reviewer's probe shape: a middle life
     * capped to a single decision survives, the chain's death gate must
     * refuse to boot its successor, and the session must fail rather than
     * count the other lives' deaths into a chain that was broken. Seed 20
     * still plays its full short life so the survivor really is interior. */
    const plan = warriorBuildPlan();
    expect(() => chainPlannedWarriors(plan, [20, 23, 34], (seed) => (seed === 23 ? 1 : 600))).toThrow(
      /seed 23 was still alive after its session slice/u,
    );
  }, 300_000);

  when("births the planned warrior on every seed it is asked to", () => {
    /* The chain above pins four seeds; this sweeps a wider set cheaply
     * (boot-and-assert only, no play), so a pack or engine change that
     * quietly broke the birth - a renamed race, a moved table - fails on
     * many seeds at once instead of on whichever four the session uses. */
    const plan = warriorBuildPlan();
    for (const seed of [1, 7, 13, 42, 77, 99]) {
      bootPlannedWarrior(seed, plan);
    }
  }, 60_000);

  /* ------------------------------------------------------------------
   * FORK: T06 (#9) - the recorded session
   * ------------------------------------------------------------------ */
  when("records its session: journal depths, the graveyard, and the reporter's runs.json", async () => {
    /* THE SESSION, through the same driver (src/records/session.ts) whose
     * output gets committed to docs/runs/ by tools/runs.mjs: the mod's own
     * journal installed per character, fed by the engine's real `dungeonlevel`
     * arrivals, its graveyard entry awaited before the next warrior boots -
     * the loop's journal-before-create ordering - and the reporter turning
     * the lives into the runs.json schema. The seeds are the chain's first
     * three (pinned: each dies on depth 1 well inside the cap). */
    const seeds = [20, 23, 34];
    const session = await playWarriorSession(pack!, { seeds, capFor: () => 600 });

    /* AT LEAST ONE DEATH AND ONE REBIRTH, which is this test's requirement
     * (T04's own chain test pins the strict all-four-die chain on these
     * seeds): the first warrior died, and its death is what booted the
     * second one - the driver boots only behind a death, so a second life
     * IS the rebirth. A warrior that survives its slice ends the session,
     * and its life still gets every record assertion below. */
    expect(session.lives.length).toBeGreaterThanOrEqual(2);
    expect(session.lives[0]!.dead, "the session's first warrior had to die for the next one to boot").toBe(true);
    expect(session.lives.filter((life) => life.dead).length).toBeGreaterThanOrEqual(1);

    for (const life of session.lives) {
      const journal = life.journal;
      expect(journal, `seed ${String(life.seed)} left no journal in its character's save`).not.toBeNull();

      /* THE DEPTHS ACTUALLY VISITED, read from the live game (the harness
       * observed state.chunk.depth after every decision), not from the
       * journal's own claims: the sets match, and no depth is doubled - the
       * load re-fires the driver delivered for every visited depth happened
       * BEFORE this read, so a dedup failure would show as a length gap. */
      const depths = journal!.milestones.map((m) => m.depth);
      expect(new Set(depths), `seed ${String(life.seed)}: journal depths vs the game's`).toEqual(new Set(life.depthsVisited));
      expect(depths, `seed ${String(life.seed)}: a depth was recorded twice`).toHaveLength(new Set(depths).size);
      /* The game's own deepest record agrees with both views of the run. */
      expect(life.maxDepth).toBe(Math.max(...life.depthsVisited));

      /* The stamps are the live game at the arrival, captured by the
       * harness's own listener - the (level, turn) the character had when
       * it arrived, not when anyone got around to asking. */
      for (const milestone of journal!.milestones) {
        expect({ level: milestone.level, turn: milestone.turn }).toEqual(life.arrivalStamps.get(milestone.depth));
      }

      /* THE GRAVEYARD: one entry per DEAD warrior, with the killer the game
       * reported (the player's own died-from, read from the live player).
       * A survivor's slot holds no entry: no run ended. */
      if (life.dead) {
        expect(journal!.graveyard).toHaveLength(1);
        expect(journal!.graveyard[0]).toMatchObject({
          outcome: "death",
          cause: life.causeOfDeath,
          name: expect.any(String),
          race: life.race,
          class: life.className,
          baseStats: [...life.baseStats],
          maxDepth: life.maxDepth,
          level: life.clvl,
          gold: life.gold,
          turn: life.turns,
          score: expect.any(Number),
        });
      } else {
        expect(journal!.graveyard).toEqual([]);
      }
    }

    /* THE REPORTER'S runs.json, FIELD BY FIELD against the lives (each of
     * which was read from the live game above) - never a snapshot of the
     * reporter's own output. */
    const document = sessionRunsDocument({
      recorded: "2026-11-02",
      facts: runsBuildFacts({ repoRoot: REPO_ROOT, content: PACK_DIR!, seeds, caps: { decisions: 600 } }),
      runs: session.lives.map((life) => ({
        seed: life.seed,
        race: life.race,
        className: life.className,
        baseStats: life.baseStats,
        decisions: life.decisions,
        turns: life.turns,
        maxDepth: life.maxDepth,
        clvl: life.clvl,
        kills: life.kills,
        gold: life.gold,
        causeOfDeath: life.causeOfDeath,
        commands: life.commands,
      })),
    });
    expect(document.build.mod).toMatch(/^Warrior Borg \d/u);
    expect(document.build.seeds).toEqual(seeds);
    for (const [index, life] of session.lives.entries()) {
      expect(document.runs[index], `runs.json entry for seed ${String(life.seed)}`).toEqual({
        seed: life.seed,
        build: { race: life.race, class: life.className, baseStats: [...life.baseStats] },
        decisions: life.decisions,
        turns: life.turns,
        maxDepth: life.maxDepth,
        clvl: life.clvl,
        kills: life.kills,
        gold: life.gold,
        causeOfDeath: life.causeOfDeath,
        commands: life.commands,
      });
      /* Kills come from the game's own lore counters (per-race pkills,
       * summed - the number the character dump prints): a count, never a
       * guess, and never negative. */
      expect(Number.isInteger(life.kills)).toBe(true);
      expect(life.kills).toBeGreaterThanOrEqual(0);
    }
    /* The census the harness counted and the census the reporter wrote are
     * the same table: every issued command code appears, with its count. */
    const census = session.lives.map((life) => Object.values(life.commands).reduce((a, b) => a + b, 0));
    expect(census.every((count) => count > 0)).toBe(true);
  }, 300_000);
});

