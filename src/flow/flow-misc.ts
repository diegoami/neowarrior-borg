/**
 * Misc flow routines: a faithful port of reference/src/borg/borg-flow-misc.c --
 * the leash / reverse-flow / far-from-stairs helpers every other family relies
 * on, plus the recover / vein / spastic / shop / light / vault flows and the
 * twitchy fallback.
 *
 * REDUCTIONS (documented; navigation preserved):
 * - borg_check_rest's per-monster race-flag tests (RF_NEVER_MOVE / RF_MULTIPLY /
 *   RF_PASS_WALL / RF_KILL_WALL) ARE modelled via FlowHooks.monsterHasFlag, and
 *   the borg_fear_* arrays are read too; see borgCheckRest for the one arm
 *   that is still missing and why.
 * - Panel-relative scans (w_x/w_y + SCREEN_*) become full-map scans, since the
 *   port has no panel concept; the borg's own remembered map is the same data.
 * - borg_flow_spastic's borg_detect_door sector suppression is dropped (treated
 *   as "not detected", i.e. searchable), and borg_primarily_caster is
 *   approximated by "has spell points".
 */

import type { AgentCommand } from "@rpgm-tools/neo-angband-core";
import { REST_COMPLETE } from "../core-api.js";
import type { BorgContext } from "../context.js";
import { distance } from "../think.js";
import {
  GOAL_MISC,
  GOAL_RECOVER,
  GOAL_TAKE,
  GOAL_VAULT,
  GOAL_XTRA,
} from "../world/model.js";
import { BORG_GLOW, BORG_VIEW } from "../world/grid.js";
import {
  AUTO_MAX_X,
  AUTO_MAX_Y,
  BI,
  FEAT,
  borgCaveFloorBold,
  borgCaveFloorGrid,
  ddx,
  ddx_ddd,
  ddy,
  ddy_ddd,
  inBoundsFully,
  trait,
} from "./flow-consts.js";
import {
  borgCanDig,
  borgFlowClear,
  borgFlowCommit,
  borgFlowEnqueueGrid,
  borgFlowOld,
  borgFlowSpread,
  dataIdx,
  type FlowState,
} from "./flow.js";
import { borgFlowCostStair, syncStairsFromMap } from "./flow-stairs.js";
import { getFearCaches } from "../danger/state.js";

/** borg_get_leash (borg-flow-misc.c): how far to roam from the stairs. */
export function borgGetLeash(ctx: BorgContext, flow: FlowState, pickUp: boolean): number {
  const w = ctx.world;
  let leash = 250;
  if (pickUp && trait(w, BI.CLEVEL) < 20) leash = trait(w, BI.CLEVEL) * 3 + 9;
  if (!pickUp && trait(w, BI.CDEPTH) >= trait(w, BI.CLEVEL) - 5)
    leash = trait(w, BI.CLEVEL) * 3 + 9;
  if (w.self.timesTwitch > 21) leash += w.self.timesTwitch;
  return leash;
}

/** borg_flow_reverse (borg-flow-misc.c): flood outward from the player's grid. */
export function borgFlowReverse(
  ctx: BorgContext,
  flow: FlowState,
  depth: number,
  optimize: boolean,
  avoid: boolean,
  tunneling: boolean,
  stairIdx: number,
  sneak: boolean,
): void {
  borgFlowClear(flow);
  borgFlowEnqueueGrid(ctx, flow, ctx.world.self.c.y, ctx.world.self.c.x);
  borgFlowSpread(ctx, flow, depth, optimize, avoid, tunneling, stairIdx, sneak);
}

/** borg_flow_far_from_stairs_dist (borg-flow-misc.c). */
export function borgFlowFarFromStairsDist(
  ctx: BorgContext,
  flow: FlowState,
  x: number,
  y: number,
  bStair: number,
  dist: number,
): boolean {
  const w = ctx.world;
  if (trait(w, BI.CDEPTH) >= trait(w, BI.CLEVEL) - 5 && trait(w, BI.CLEVEL) < 20) {
    const cost = borgFlowCostStair(ctx, flow, y, x, bStair);
    if (cost > dist) return true;
  }
  return false;
}

/** borg_flow_far_from_stairs (borg-flow-misc.c). */
export function borgFlowFarFromStairs(
  ctx: BorgContext,
  flow: FlowState,
  x: number,
  y: number,
  bStair: number,
): boolean {
  return borgFlowFarFromStairsDist(ctx, flow, x, y, bStair, borgGetLeash(ctx, flow, false));
}

/**
 * Find the borg's nearest tracked up-stair index (the b_stair/b_j idiom that
 * opens most family functions). Assumes syncStairsFromMap has run.
 */
export function nearestUpStair(ctx: BorgContext, flow: FlowState): number {
  const w = ctx.world;
  let bStair = -1;
  let bJ = -1;
  for (let i = 0; i < flow.less.num; i++) {
    const j = distance(w.self.c.x, w.self.c.y, flow.less.x[i]!, flow.less.y[i]!);
    if (bJ >= j) continue;
    bJ = j;
    bStair = i;
  }
  return bStair;
}

/**
 * borg_happy_grid_bold (borg-flow-misc.c): a floor grid that is a stair, glyph,
 * corridor non-corner, doorway, pillar-adjacent, or recently stepped-on grid.
 */
export function borgHappyGridBold(ctx: BorgContext, flow: FlowState, y: number, x: number): boolean {
  const w = ctx.world;
  const fl = (yy: number, xx: number) => borgCaveFloorBold(w, yy, xx);

  if (y >= AUTO_MAX_Y - 2 || y <= 2 || x >= AUTO_MAX_X - 2 || x <= 2) return false;

  const ag = w.map.at(x, y);
  if (ag.feat === FEAT.LESS) return true;
  if (ag.feat === FEAT.MORE) return true;
  if (ag.glyph) return true;
  if (ag.feat === FEAT.LAVA && !trait(w, BI.IFIRE)) return false;

  if (trait(w, BI.ISWEAK) || trait(w, BI.LIGHT) === 0) return false;

  if (w.clock - flow.borgBegan >= 2000) return false;

  /* Case 1a: north-south corridor */
  if (
    fl(y - 1, x) && fl(y + 1, x) &&
    !fl(y, x - 1) && !fl(y, x + 1) &&
    !fl(y + 1, x - 1) && !fl(y + 1, x + 1) &&
    !fl(y - 1, x - 1) && !fl(y - 1, x + 1)
  )
    return true;

  /* Case 1b: east-west corridor */
  if (
    fl(y, x - 1) && fl(y, x + 1) &&
    !fl(y - 1, x) && !fl(y + 1, x) &&
    !fl(y + 1, x - 1) && !fl(y + 1, x + 1) &&
    !fl(y - 1, x - 1) && !fl(y - 1, x + 1)
  )
    return true;

  /* Case 1aa: north-south doorway */
  if (fl(y - 1, x) && fl(y + 1, x) && !fl(y, x - 1) && !fl(y, x + 1)) return true;

  /* Case 1ba: east-west doorway */
  if (fl(y, x - 1) && fl(y, x + 1) && !fl(y - 1, x) && !fl(y + 1, x)) return true;

  /* Case 2a: north pillar */
  if (!fl(y - 1, x) && fl(y - 1, x - 1) && fl(y - 1, x + 1) && fl(y - 2, x)) return true;
  /* Case 2b: south pillar */
  if (!fl(y + 1, x) && fl(y + 1, x - 1) && fl(y + 1, x + 1) && fl(y + 2, x)) return true;
  /* Case 2c: east pillar */
  if (!fl(y, x + 1) && fl(y - 1, x + 1) && fl(y + 1, x + 1) && fl(y, x + 2)) return true;
  /* Case 2d: west pillar */
  if (!fl(y, x - 1) && fl(y - 1, x - 1) && fl(y + 1, x - 1) && fl(y, x - 2)) return true;

  /* Recently stepped-on grids (first 25 steps) */
  for (let i = 0; i < flow.step.num; i++) {
    if (flow.step.y[i] === y && flow.step.x[i] === x && i < 25) return true;
  }

  return false;
}

/**
 * borg_check_rest (borg-flow-misc.c:1214): is it safe to sit still here.
 *
 * This is the gate that stops the Borg resting through an attack, so every arm
 * of it is load-bearing rather than decorative, and the two FEAR arms are the
 * only thing that answers an attacker the Borg cannot see: an unexplained blow
 * raises regional fear (perceive-messages.ts), and a level-one character's
 * CURHP/20 is zero, so any fear at all is enough to keep it on its feet.
 *
 * One upstream arm is left out. PF_COMBAT_REGEN needs a player-flag lookup the
 * frozen view does not carry, recorded in PLANNED.md rather than approximated.
 * The vault arm is skipped for the reason danger/fear.ts documents: the
 * remembered map has no vault flag.
 */
export function borgCheckRest(ctx: BorgContext, flow: FlowState, y: number, x: number): boolean {
  const w = ctx.world;

  /* Do not rest recently after killing a multiplier (misc.c:1223-1228): avoids
   * resting into an unexplored area that turns out to be full of breeders.
   * `whenLastKillMult` is stamped by BorgKills.delete whenever a MULTIPLY
   * record is forgotten, for any reason (see world/kill.ts). */
  if (w.self.whenLastKillMult > w.clock - 4 && w.self.whenLastKillMult <= w.clock)
    return false;

  /* misc.c:1239-1240: once the window has passed, clear it, so a stale value
   * carried from a previous level cannot coincidentally satisfy the check
   * again after the per-level clock resets. */
  w.self.whenLastKillMult = 0;

  /* No resting if Blessed and good HP and good SP (misc.c:1230): a buff resting
   * away is a buff wasted. */
  const t = w.self.temp;
  if (
    (t.bless || t.hero || t.berserk || t.fastcast || t.regen || t.smiteEvil) &&
    !w.self.munchkinMode &&
    trait(w, BI.CURHP) >= Math.trunc((trait(w, BI.MAXHP) * 8) / 10) &&
    trait(w, BI.CURSP) >= Math.trunc((trait(w, BI.MAXSP) * 7) / 10)
  )
    return false;

  /* No resting right after a preparatory spell (misc.c:1262). */
  if (
    w.self.noRestPrep >= 1 &&
    !w.self.munchkinMode &&
    trait(w, BI.CURSP) > Math.trunc(trait(w, BI.MAXSP) / 4) &&
    trait(w, BI.CDEPTH) < 85
  )
    return false;

  /* Don't rest on lava unless immune to fire */
  if (w.map.at(x, y).feat === FEAT.LAVA && !trait(w, BI.IFIRE)) return false;

  /* Be concerned about the Regional Fear (misc.c:1272). */
  const fear = getFearCaches(w);
  if (
    fear.region(y, x) > Math.trunc(trait(w, BI.CURHP) / 20) &&
    trait(w, BI.CDEPTH) !== 100
  )
    return false;

  /* Be concerned about the Monster Fear (misc.c:1277). */
  if (
    fear.monsters(y, x) > Math.trunc(trait(w, BI.CURHP) / 10) &&
    trait(w, BI.CDEPTH) !== 100
  )
    return false;

  /* Concerned about danger at deep depth */
  if (
    flow.hooks.danger(w, y, x) > Math.trunc(trait(w, BI.CURHP) / 40) &&
    trait(w, BI.CDEPTH) >= 85
  )
    return false;

  /* Concerned if low on food/light */
  if (
    (trait(w, BI.LIGHT) === 0 || trait(w, BI.ISWEAK) || trait(w, BI.FOOD) < 2) &&
    !w.self.munchkinMode
  )
    return false;

  /* Examine the monsters */
  for (const [i, kill] of w.kills.entries()) {
    const x9 = kill.pos.x;
    const y9 = kill.pos.y;
    const ax = Math.abs(x9 - x);
    const ay = Math.abs(y9 - y);
    const d = Math.max(ax, ay);
    const has = (f: string): boolean => flow.hooks.monsterHasFlag(w, i, f);

    /* Minimal distance (z_info->max_range ~ 20) */
    if (d > 20) continue;

    /* if too close to a Mold or other Never-Mover, don't rest */
    if (d < 2 && !has("NEVER_MOVE")) return false;
    if (d === 1) return false;

    /* if too close to a Multiplier, don't rest */
    if (d < 10 && has("MULTIPLY")) return false;

    /* Asleep and far -- ignore */
    if (!kill.awake && d > 8 && !w.self.munchkinMode) continue;

    /* Scary guys pretty close. ONE monster's danger, not the grid's total: the
     * grid sums every monster and both fear caches, so asking it here would let
     * a busy level veto a rest next to something harmless. */
    const p = flow.hooks.dangerOneKill(w, y9, x9, i);
    if (d < 5 && p > Math.trunc(flow.avoidance / 3) && !w.self.munchkinMode)
      return false;

    /* Concerned for ranged attacks: it can reach the Borg without moving. */
    if (flow.hooks.los(w, y9, x9, y, x) && kill.rangedAttack) return false;

    /* Special handling for the munchkin mode */
    if (
      w.self.munchkinMode &&
      flow.hooks.los(w, y9, x9, y, x) &&
      kill.awake &&
      !has("NEVER_MOVE")
    )
      return false;

    /* if it walks through walls, not safe */
    if (has("PASS_WALL")) return false;
    if (has("KILL_WALL")) return false;
  }
  return true;
}

/**
 * borg_flow_recover (borg-flow-misc.c): flow to a safe "happy" grid to heal.
 */
export function borgFlowRecover(ctx: BorgContext, flow: FlowState, dist: number): AgentCommand | null {
  const w = ctx.world;

  if (w.self.timeThisPanel > 500) return null;
  if (trait(w, BI.CLEVEL) <= 5) return null;

  /* Do I need to recover some? (caster ~ has SP) */
  const caster = trait(w, BI.MAXSP) > 0;
  if (caster) {
    if (
      trait(w, BI.CURHP) > Math.trunc(trait(w, BI.MAXHP) / 3) &&
      (trait(w, BI.CURSP) > Math.trunc(trait(w, BI.MAXSP) / 4) || trait(w, BI.MAXSP) === 0) &&
      !trait(w, BI.ISCUT) &&
      !trait(w, BI.ISSTUN) &&
      !trait(w, BI.ISHEAVYSTUN) &&
      !trait(w, BI.ISAFRAID)
    )
      return null;
  } else {
    if (
      trait(w, BI.CURHP) > Math.trunc(trait(w, BI.MAXHP) / 3) &&
      !trait(w, BI.ISCUT) &&
      !trait(w, BI.ISSTUN) &&
      !trait(w, BI.ISHEAVYSTUN) &&
      !trait(w, BI.ISAFRAID)
    )
      return null;
  }

  if (w.self.goal.fleeing) return null;
  if (w.self.lunalMode || w.self.munchkinMode) return null;
  if (trait(w, BI.ISHUNGRY)) return null;

  flow.tempN = 0;

  for (let y = w.self.c.y - 25; y < w.self.c.y + 25; y++) {
    for (let x = w.self.c.x - 25; x < w.self.c.x + 25; x++) {
      if (!w.map.inBounds(x, y)) continue;
      if (y === w.self.c.y && x === w.self.c.x) continue;
      if (distance(w.self.c.x, w.self.c.y, x, y) < 7) continue;
      if (!borgHappyGridBold(ctx, flow, y, x)) continue;

      const feat = w.map.at(x, y).feat;
      if (feat >= FEAT.SECRET && feat !== FEAT.PASS_RUBBLE) continue;
      if (!borgCheckRest(ctx, flow, y, x)) continue;

      flow.tempX[flow.tempN] = x;
      flow.tempY[flow.tempN] = y;
      flow.tempN++;
    }
  }

  if (!flow.tempN) return null;

  borgFlowClear(flow);
  for (let i = 0; i < flow.tempN; i++) {
    borgFlowEnqueueGrid(ctx, flow, flow.tempY[i]!, flow.tempX[i]!);
  }
  borgFlowSpread(ctx, flow, dist, false, true, false, -1, false);

  if (!borgFlowCommit(ctx, flow, GOAL_RECOVER)) return null;
  return borgFlowOld(ctx, flow, GOAL_RECOVER);
}

/**
 * borg_flow_vein (borg-flow-misc.c): flow to a treasure vein to mine.
 */
export function borgFlowVein(ctx: BorgContext, flow: FlowState, viewable: boolean, nearness: number): AgentCommand | null {
  const w = ctx.world;

  if (!flow.vein.num) return null;
  if (trait(w, BI.GOLD) >= 100000) return null;

  let minFeat: number = FEAT.QUARTZ_K;
  if (w.self.timesTwitch > 21) minFeat = FEAT.MAGMA_K;
  if (!borgCanDig(ctx, flow, true, minFeat)) return null;

  flow.tempN = 0;
  syncStairsFromMap(ctx, flow);
  const bStair = nearestUpStair(ctx, flow);
  const leash = borgGetLeash(ctx, flow, true);

  for (let i = 0; i < flow.vein.num; i++) {
    const x = flow.vein.x[i]!;
    const y = flow.vein.y[i]!;
    const ag = w.map.at(x, y);
    if (viewable && !(ag.info & BORG_VIEW)) continue;

    borgFlowClear(flow);
    if (nearness > 5 && trait(w, BI.CLEVEL) < 20) {
      const cost = borgFlowCostStair(ctx, flow, y, x, bStair);
      if (cost > leash) continue;
    }
    flow.tempX[flow.tempN] = x;
    flow.tempY[flow.tempN] = y;
    flow.tempN++;
  }

  if (!flow.tempN) return null;

  borgFlowClear(flow);
  for (let i = 0; i < flow.tempN; i++) {
    borgFlowEnqueueGrid(ctx, flow, flow.tempY[i]!, flow.tempX[i]!);
  }
  borgFlowSpread(ctx, flow, nearness, true, !viewable, false, -1, false);

  if (!borgFlowCommit(ctx, flow, GOAL_TAKE)) return null;
  return borgFlowOld(ctx, flow, GOAL_TAKE);
}

/**
 * borg_flow_shop_entry (borg-flow-misc.c): flow to shop i's door (town only).
 */
export function borgFlowShopEntry(ctx: BorgContext, flow: FlowState, i: number): AgentCommand | null {
  const w = ctx.world;

  if (trait(w, BI.CDEPTH)) return null;

  const x = flow.shopX[i]!;
  const y = flow.shopY[i]!;
  if (!x || !y) return null;

  /* Re-enter a shop if already standing on it */
  if (x === w.self.c.x && y === w.self.c.y) {
    return ctx.act.move(5);
  }

  borgFlowClear(flow);
  borgFlowEnqueueGrid(ctx, flow, y, x);
  borgFlowSpread(ctx, flow, 250, true, false, false, -1, false);

  if (!borgFlowCommit(ctx, flow, GOAL_MISC)) return null;
  return borgFlowOld(ctx, flow, GOAL_MISC);
}

/**
 * borg_flow_light (borg-flow-misc.c): flow toward a perma-lit (BORG_GLOW) area.
 */
export function borgFlowLight(ctx: BorgContext, flow: FlowState, why: number): AgentCommand | null {
  const w = ctx.world;

  flow.tempN = 0;
  for (let y = 0; y < AUTO_MAX_Y; y++) {
    for (let x = 0; x < AUTO_MAX_X; x++) {
      if (!(w.map.at(x, y).info & BORG_GLOW)) continue;
      flow.tempX[flow.tempN] = x;
      flow.tempY[flow.tempN] = y;
      flow.tempN++;
    }
  }
  if (!flow.tempN) return null;

  borgFlowClear(flow);
  for (let i = 0; i < flow.tempN; i++) {
    borgFlowEnqueueGrid(ctx, flow, flow.tempY[i]!, flow.tempX[i]!);
  }
  borgFlowSpread(ctx, flow, 250, true, false, false, -1, false);

  if (!borgFlowCommit(ctx, flow, why)) return null;
  return borgFlowOld(ctx, flow, why);
}

/**
 * borg_flow_vault (borg-flow-misc.c): flow to an excavatable vault wall adjacent
 * to a permanent wall.
 */
export function borgFlowVault(ctx: BorgContext, flow: FlowState, nearness: number): AgentCommand | null {
  const w = ctx.world;

  flow.tempN = 0;
  if (!w.facts.vaultOnLevel) return null;
  if (!borgCanDig(ctx, flow, false, FEAT.QUARTZ)) return null;
  const canDigHard = borgCanDig(ctx, flow, false, FEAT.GRANITE);

  for (let y = 0; y < AUTO_MAX_Y; y++) {
    for (let x = 0; x < AUTO_MAX_X; x++) {
      if (distance(w.self.c.x, w.self.c.y, x, y) > nearness) continue;
      const feat = w.map.at(x, y).feat;
      if (
        feat !== FEAT.RUBBLE &&
        feat !== FEAT.QUARTZ &&
        feat !== FEAT.MAGMA &&
        feat !== FEAT.QUARTZ_K &&
        feat !== FEAT.MAGMA_K
      ) {
        if (!canDigHard || feat !== FEAT.GRANITE) continue;
      }
      for (let i = 0; i < 8; i++) {
        const bx = x + ddx_ddd[i]!;
        const by = y + ddy_ddd[i]!;
        if (!inBoundsFully(bx, by)) continue;
        if (w.map.at(bx, by).feat !== FEAT.PERM) continue;
        flow.tempX[flow.tempN] = x;
        flow.tempY[flow.tempN] = y;
        flow.tempN++;
      }
    }
  }

  if (!flow.tempN) return null;

  for (let i = 0; i < flow.tempN; i++) {
    borgFlowEnqueueGrid(ctx, flow, flow.tempY[i]!, flow.tempX[i]!);
  }
  borgFlowSpread(ctx, flow, 250, true, false, false, -1, false);

  if (!borgFlowCommit(ctx, flow, GOAL_VAULT)) return null;
  return borgFlowOld(ctx, flow, GOAL_VAULT);
}

/**
 * borg_flow_spastic (borg-flow-misc.c): search carefully for secret doors. See
 * the file header for the detect-door reduction.
 */
export function borgFlowSpastic(ctx: BorgContext, flow: FlowState, bored: boolean): AgentCommand | null {
  const w = ctx.world;

  if (!trait(w, BI.CDEPTH)) return null;
  if (trait(w, BI.ISWEAK)) return null;
  if (w.clock - flow.borgBegan > 3000 && flow.avoidance <= trait(w, BI.CURHP)) return null;

  if (!bored) {
    const p = flow.hooks.danger(w, w.self.c.y, w.self.c.x);
    if (p > Math.trunc(flow.avoidance / 4)) return null;
  }

  syncStairsFromMap(ctx, flow);
  let bStair = -1;
  let bJ = -1;
  for (let i = 0; i < flow.less.num; i++) {
    const j = distance(w.self.c.x, w.self.c.y, flow.less.x[i]!, flow.less.y[i]!);
    if (bJ >= j) continue;
    bJ = j;
    bStair = i;
  }

  /* Arrived at the search target: record the search and stop */
  if (flow.spasticX === w.self.c.x && flow.spasticY === w.self.c.y) {
    flow.spasticX = 0;
    flow.spasticY = 0;
    for (let i = 0; i < 9; i++) {
      const xx = w.self.c.x + ddx_ddd[i]!;
      const yy = w.self.c.y + ddy_ddd[i]!;
      if (!w.map.inBounds(xx, yy)) continue;
      const g = w.map.at(xx, yy);
      if (g.xtra < 100) g.xtra += 5;
    }
    return null;
  }

  borgFlowReverse(ctx, flow, 250, true, false, false, -1, false);

  let bV = -1;
  let bX = w.self.c.x;
  let bY = w.self.c.y;

  for (let y = 1; y < AUTO_MAX_Y - 1; y++) {
    for (let x = 1; x < AUTO_MAX_X - 1; x++) {
      const ag = w.map.at(x, y);
      if (ag.feat === FEAT.NONE) continue;
      if (ag.trap) continue;
      if (!borgCaveFloorGrid(ag)) continue;

      const cost = flow.cost[dataIdx(x, y)]!;
      if (cost >= 250) continue;
      if (cost >= 25 && trait(w, BI.CLEVEL) < 30) continue;
      if (cost >= 50) continue;
      if (ag.xtra >= 50) continue;
      if (ag.xtra >= trait(w, BI.CLEVEL)) continue;
      if (!bored && ag.xtra > 5) continue;

      /* Leash: skip grids too far from the stair while close to it */
      if (bStair !== -1 && trait(w, BI.CLEVEL) < 15 && flow.avoidance <= trait(w, BI.CURHP)) {
        const j = distance(flow.less.x[bStair]!, flow.less.y[bStair]!, x, y);
        const bj = distance(w.self.c.x, w.self.c.y, flow.less.x[bStair]!, flow.less.y[bStair]!);
        if (bj <= trait(w, BI.CLEVEL) * 3 + 9 && j >= trait(w, BI.CLEVEL) * 3 + 9) continue;
        if (trait(w, BI.CLEVEL) <= 3 && bj <= trait(w, BI.CLEVEL) + 9 && j >= trait(w, BI.CLEVEL) + 9) continue;
        if (trait(w, BI.CLEVEL) <= 3 && j >= trait(w, BI.CLEVEL) + 5) continue;
        if (trait(w, BI.CLEVEL) <= 10 && j >= trait(w, BI.CLEVEL) + 9) continue;
      }

      let wall = 0;
      let supp = 0;
      let diag = 0;
      let monsters = 0;
      const feats: number[] = [];
      for (let i = 0; i < 8; i++) {
        const xx = x + ddx_ddd[i]!;
        const yy = y + ddy_ddd[i]!;
        feats[i] = w.map.inBounds(xx, yy) ? w.map.at(xx, yy).feat : FEAT.GRANITE;
      }
      const killAt = (i: number): number => {
        const xx = x + ddx_ddd[i]!;
        const yy = y + ddy_ddd[i]!;
        return w.map.inBounds(xx, yy) ? w.map.at(xx, yy).kill : 0;
      };

      for (let i = 0; i < 4; i++) if (feats[i]! >= FEAT.GRANITE) wall++;
      if (wall < 1) continue;

      for (let i = 0; i < 4; i++) {
        const f = feats[i]!;
        if (f === FEAT.RUBBLE) continue;
        if (
          (f >= FEAT.SECRET && f <= FEAT.GRANITE) ||
          f === FEAT.OPEN ||
          f === FEAT.BROKEN ||
          f === FEAT.CLOSED
        )
          supp++;
      }
      for (let i = 4; i < 8; i++) {
        const f = feats[i]!;
        if (f === FEAT.RUBBLE) continue;
        if (f >= FEAT.SECRET) diag++;
      }
      if (diag < 2) continue;

      for (let i = 0; i < 8; i++) if (killAt(i)) monsters++;
      if (monsters >= 1) continue;

      let v =
        supp * 500 + diag * 100 - ag.xtra * 40 - cost * 2 - (w.clock - flow.borgBegan);
      v -= (50 - trait(w, BI.CLEVEL)) * 5;
      if (v <= 0) continue;
      if (!bored && v < 1500) continue;
      if (bV >= 0 && v < bV) continue;

      bV = v;
      bX = x;
      bY = y;
    }
  }

  borgFlowClear(flow);
  if (bV < 0) return null;

  flow.spasticX = bX;
  flow.spasticY = bY;
  borgFlowEnqueueGrid(ctx, flow, bY, bX);
  borgFlowSpread(ctx, flow, 250, true, false, false, -1, false);

  if (!borgFlowCommit(ctx, flow, GOAL_XTRA)) return null;
  return borgFlowOld(ctx, flow, GOAL_XTRA);
}

/**
 * borg_twitchy (borg-flow-misc.c): the last-ditch "pick a random legal
 * direction and move/dig" fallback. The phase-door escape branch (which needs
 * the magic subsystem) is omitted; the random-direction walk is preserved.
 */
export function borgTwitchy(ctx: BorgContext, flow: FlowState): AgentCommand | null {
  const w = ctx.world;
  void flow;
  let dir = 5;
  let count = 20;

  while (true) {
    dir = ctx.rng.randint0(10);
    if (dir === 5 || dir === 0) continue;
    if (!count) break;
    count--;

    const gx = w.self.c.x + ddx[dir]!;
    const gy = w.self.c.y + ddy[dir]!;
    w.self.goal.g.x = gx;
    w.self.goal.g.y = gy;
    if (!inBoundsFully(gx, gy)) continue;

    const grid = w.map.at(gx, gy);
    if (grid.feat >= FEAT.SECRET && grid.feat <= FEAT.PERM) continue;
    if (grid.kill && trait(w, BI.ISAFRAID)) continue;
    break;
  }

  if (!count) {
    let allWalls = true;
    for (dir = 1; dir < 10; dir++) {
      if (dir === 5) continue;
      const lx = w.self.c.x + ddx[dir]!;
      const ly = w.self.c.y + ddy[dir]!;
      if (!inBoundsFully(lx, ly)) continue;
      const grid = w.map.at(lx, ly);
      if (grid.feat >= FEAT.SECRET && grid.feat <= FEAT.PERM) {
        if (!trait(w, BI.ISAFRAID) || grid.feat === FEAT.PERM) continue;
      }
      if (grid.kill && trait(w, BI.ISAFRAID)) continue;
      allWalls = false;
      break;
    }
    if (allWalls) {
      /* Boxed in with nowhere to go: rest as needed rather than one idle turn
       * at a time, so a walled-in borg at least regenerates while stuck. */
      return ctx.act.rest(REST_COMPLETE);
    }
  }

  if (trait(w, BI.ISAFRAID)) return ctx.act.tunnel(dir);
  return ctx.act.move(dir);
}
