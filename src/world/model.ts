/**
 * Borg's aggregate world model - a faithful port of the upstream global
 * singletons: struct borg_struct `borg` (borg-trait.h), the borg_grids map, the
 * borg_kills / borg_takes tracking lists, and the per-level fact flags.
 *
 * Upstream these are file-scope globals; the port collects them into one
 * BorgWorld instance so multiple Borgs (or tests) can coexist and so nothing
 * leaks into module state. Field names and layout stay faithful so the ported
 * subsystems (flow, danger, power, fight, think) read the same shape.
 */

import { BorgMap } from "./grid.js";
import { BorgKills } from "./kill.js";
import { BorgTakes } from "./take.js";
import { BorgDetectGrid } from "./panel.js";

/** Goal types (borg-trait.h). goal.type selects the active flow. */
export const GOAL_KILL = 1; /* Monsters */
export const GOAL_TAKE = 2; /* Objects */
export const GOAL_MISC = 3; /* Stores */
export const GOAL_DARK = 4; /* Exploring */
export const GOAL_XTRA = 5; /* Searching */
export const GOAL_BORE = 6; /* Leaving */
export const GOAL_FLEE = 7; /* Fleeing */
export const GOAL_VAULT = 8; /* Vaults */
export const GOAL_RECOVER = 9; /* Resting safely */
export const GOAL_DIGGING = 10; /* Anti-summon corridor */

/** struct goals - the Borg's current navigation/strategy intent. */
export interface Goals {
  /** Active goal type (GOAL_*), 0 for none. */
  type: number;
  /** Goal location. */
  g: { x: number; y: number };
  rising: boolean; /* returning to town */
  leaving: boolean; /* leaving the level */
  fleeing: boolean; /* fleeing the level */
  fleeingLunal: boolean;
  fleeingMunchkin: boolean;
  fleeingToTown: boolean;
  ignoring: boolean; /* ignoring monsters */
  less: boolean; /* return to, but don't use, the up stairs */
  waiting: boolean; /* waiting for an approaching monster */
  recalling: number; /* turns-left guess while waiting for recall */
  descending: number; /* waiting for deep descent */
  shop: number; /* next shop to visit */
  ware: number; /* next item to buy there */
  item: number; /* next item to sell there */
  doBest: boolean;
}

/** A fresh, zeroed goal set. */
export function makeGoals(): Goals {
  return {
    type: 0,
    g: { x: 0, y: 0 },
    rising: false,
    leaving: false,
    fleeing: false,
    fleeingLunal: false,
    fleeingMunchkin: false,
    fleeingToTown: false,
    ignoring: false,
    less: false,
    waiting: false,
    recalling: 0,
    descending: 0,
    shop: 0,
    ware: 0,
    item: 0,
    doBest: false,
  };
}

/** struct temp - transient buff/resistance state assumed during simulation. */
export interface Temp {
  needSeeInvis: number;
  seeInv: number;
  resFire: boolean;
  resCold: boolean;
  resAcid: boolean;
  resElec: boolean;
  resPois: boolean;
  protFromEvil: boolean;
  fast: boolean;
  bless: boolean;
  hero: boolean;
  berserk: boolean;
  fastcast: boolean;
  regen: boolean;
  smiteEvil: boolean;
  venom: boolean;
  shield: boolean;
}

/** A fresh, zeroed temp state. */
export function makeTemp(): Temp {
  return {
    needSeeInvis: 0,
    seeInv: 0,
    resFire: false,
    resCold: false,
    resAcid: false,
    resElec: false,
    resPois: false,
    protFromEvil: false,
    fast: false,
    bless: false,
    hero: false,
    berserk: false,
    fastcast: false,
    regen: false,
    smiteEvil: false,
    venom: false,
    shield: false,
  };
}

/**
 * struct borg_struct - everything the Borg knows about itself.
 *
 * `trait[]` (the ~350-entry BI_* derived-stat array), `has[]` and
 * `activation[]` are sized and filled by the self-model port (P8.3, borg_notice
 * / borg_power); the foundation allocates them empty so the shape exists.
 */
export interface BorgSelf {
  /** Derived traits, indexed by BI_* (filled by borg_notice, P8.3). */
  trait: number[];
  /** Counts of items the Borg has, indexed by the `has` enum (P8.3). */
  has: number[];
  /** Artifact activations available (P8.3). */
  activation: number[];
  /** How powerful the Borg thinks it is (borg_power, P8.3). */
  power: number;
  /** Current location. */
  c: { x: number; y: number };
  /** HP last game turn, to track change. */
  oldchp: number;

  /* activity flags */
  lunalMode: boolean;
  munchkinMode: boolean;
  stairLess: boolean; /* use the next up staircase */
  stairMore: boolean; /* use the next down staircase */
  inShop: boolean;
  /** 3-state: -1 unchecked, 0 not ready, 1 ready. */
  readyMorgoth: number;

  temp: Temp;
  goal: Goals;

  /* panel / shift */
  needShiftPanel: boolean;
  whenShiftPanel: number;
  timeThisPanel: number;

  /**
   * borg_game_ratio (borg-trait.c:2926): game-turns per borg-turn, derived from
   * the final BI_SPEED by borg_notice. Every timer below is counted in game
   * turns and decays by this much per think, so a wrong value here is a wrong
   * duration for every buff the Borg thinks it is under. 1000 at normal speed.
   */
  gameRatio: number;

  /* timed activity flags */
  noRetreat: number;
  resistance: number;
  whenCallLight: number;
  whenWizardLight: number;
  whenDetectTraps: number;
  whenDetectDoors: number;
  whenDetectWalls: number;
  whenDetectEvil: number;
  whenDetectObj: number;
  whenLastKillMult: number;
  noRestPrep: number;

  /* anti-loop counters (load-bearing thresholds; preserved verbatim) */
  timesTwitch: number;
  escapes: number;
}

/** A fresh Borg self-model (borg_init leaves most fields zeroed). */
export function makeBorgSelf(): BorgSelf {
  return {
    trait: [],
    has: [],
    activation: [],
    power: 0,
    c: { x: 0, y: 0 },
    oldchp: 0,
    lunalMode: false,
    munchkinMode: false,
    stairLess: false,
    stairMore: false,
    inShop: false,
    readyMorgoth: -1,
    temp: makeTemp(),
    goal: makeGoals(),
    needShiftPanel: false,
    whenShiftPanel: 0,
    timeThisPanel: 0,
    gameRatio: 1000,
    noRetreat: 0,
    resistance: 0,
    whenCallLight: 0,
    whenWizardLight: 0,
    whenDetectTraps: 0,
    whenDetectDoors: 0,
    whenDetectWalls: 0,
    whenDetectEvil: 0,
    whenDetectObj: 0,
    whenLastKillMult: 0,
    noRestPrep: 0,
    timesTwitch: 0,
    escapes: 0,
  };
}

/** Per-level facts the Borg derives from what it perceives (borg-flow-kill.h). */
export interface LevelFacts {
  uniqueOnLevel: number;
  scaryGuyOnLevel: boolean;
  morgothOnLevel: boolean;
  breederLevel: boolean;
  vaultOnLevel: boolean;
  /** Depth the Borg believes it is on. */
  depth: number;
}

/** Fresh per-level facts. */
export function makeLevelFacts(): LevelFacts {
  return {
    uniqueOnLevel: 0,
    scaryGuyOnLevel: false,
    morgothOnLevel: false,
    breederLevel: false,
    vaultOnLevel: false,
    depth: 0,
  };
}

/**
 * The complete Borg world model, replacing the upstream file-scope globals with
 * one owned instance. Perception (perceive.ts) writes it; every decision
 * subsystem reads it.
 */
export class BorgWorld {
  readonly map = new BorgMap();
  readonly kills = new BorgKills();
  readonly takes = new BorgTakes();
  /** borg_detect_wall/trap/door/evil/obj (borg-update.c:82-86). See world/panel.ts. */
  readonly detect = new BorgDetectGrid();
  readonly self = makeBorgSelf();
  facts = makeLevelFacts();

  /**
   * borg_t: the Borg's own clock, incremented per decision. The anti-loop
   * heuristics (boredom, twitch, monster expiry) are gated on this, so it must
   * advance exactly once per think (see controller.ts).
   */
  clock = 0;

  /** True once at least one perception has populated the model. */
  seeded = false;

  /**
   * Reset everything for a new level (borg_init_cave + the new-level branch of
   * borg_update, borg-update.c:2050-2180). `depth` is the depth just ARRIVED at,
   * because three of the resets ask about it.
   *
   * NOT a blanket `makeGoals()`. Two intents are journeys across several levels
   * and upstream keeps them: `rising` (climbing back to town) survives every
   * level change except arriving IN town, and `fleeingToTown` survives depth 1,
   * which is the one depth from which the next step is the town. Wiping both on
   * arrival restarted the journey on every staircase.
   *
   * `stairLess` / `stairMore` are the other half, and leaving them set was a
   * hang: arriving in town with `stairMore` still true made the borg walk
   * straight back down, and arriving on level 1 with `stairLess` still true made
   * it climb straight back up - a town/level-1 shuttle that never played a turn.
   */
  wipeLevel(depth: number): void {
    this.map.wipe();
    this.kills.wipe();
    this.takes.wipe();
    this.facts = makeLevelFacts();

    const g = this.self.goal;
    const rising = g.rising;
    const fleeingToTown = g.fleeingToTown;
    this.self.goal = makeGoals();
    this.self.goal.rising = depth === 0 ? false : rising;
    this.self.goal.fleeingToTown = depth === 0 || depth >= 2 ? false : fleeingToTown;

    /* "Do not use any stairs" (borg-update.c:2135). */
    this.self.stairLess = false;
    this.self.stairMore = false;

    /* borg-update.c:2021 sets the panel clock to 1, not 0. */
    this.self.timeThisPanel = 1;
    this.self.timesTwitch = 0;
    this.self.escapes = 0;

    /*
     * "Mega-Hack" light/detection timestamp resets (borg-update.c:2075-2091)
     * and the "Clear panel flags" array wipe (borg-update.c:2093-2104). The
     * clock keeps counting across levels, so the short detection cooldowns
     * (5-20 turns) would self-clear within a few thinks regardless; zeroing
     * them here is what makes arrival on a new level faithfully reset them
     * immediately rather than merely "soon".
     */
    this.self.whenCallLight = 0;
    this.self.whenWizardLight = 0;
    this.self.whenDetectTraps = 0;
    this.self.whenDetectDoors = 0;
    this.self.whenDetectWalls = 0;
    this.self.whenDetectEvil = 0;
    this.self.whenDetectObj = 0;
    this.detect.wipe();
  }
}
