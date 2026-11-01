/**
 * Perception: fold what the Borg can see (the frozen AgentView) into its own
 * world model (BorgWorld). This is the port of borg_update / borg_update_map
 * (reference/src/borg/borg-update.c) adapted from the C borg's screen-scrape to
 * a clean perceive facade.
 *
 * FIDELITY MODEL. The C borg re-derives monster/object identity from on-screen
 * symbols (observe_kill_move / borg_locate_kill) because it only sees glyphs;
 * the frozen AgentView instead hands the port exact monster ids and per-cell
 * visibility, so the symbol-correlation guessing is unnecessary and the port
 * updates records in place by m_idx. What IS behaviorally load-bearing - and is
 * ported faithfully here - is:
 *   - the known-map fog-of-war (only seen/remembered grids are recorded),
 *   - the staleness model: records persist after leaving view and expire on the
 *     2000-borg-turn clock (borg-update.c:1553 / :1591),
 *   - deletion of floor objects under the borg and while hallucinating
 *     (borg-update.c:1583),
 *   - message consumption (deaths / blinks) pruning tracked monsters
 *     (borg-update.c:2785, via perceive-messages.ts).
 * The per-level facts (unique/scary/morgoth/summoner) are derived by
 * borg_near_monster_type (perceive-facts.ts), which the think ladder invokes at
 * the faithful point (borg-think-dungeon.c:1268).
 *
 * Decision subsystems read BorgWorld, never the live engine.
 */

import type { ItemView } from "@rpgm-tools/neo-angband-core";
import type { BorgView } from "./core-api.js";
import {
  AUTO_MAX_X,
  AUTO_MAX_Y,
  BORG_GLOW,
  BORG_LIGHT,
  BORG_MARK,
  BORG_VIEW,
} from "./world/grid.js";
import { BI } from "./trait/trait-index.js";
import { borgCaveFloorBold } from "./flow/flow-consts.js";
import type { BorgWorld } from "./world/model.js";
import { makeLevelFacts } from "./world/model.js";
import {
  borgReactMessages,
  emptyMessageTables,
  type BorgMessageTables,
} from "./perceive-messages.js";
import { getFearCaches } from "./danger/state.js";
import { FEAR_REGION_H, FEAR_REGION_W } from "./danger/fear.js";

/** borg_update expires a tracked record after this many borg-turns unseen. */
export const BORG_EXPIRE_TURNS = 2000;

/** Track the depth last perceived, to detect level changes. */
interface PerceiveMemo {
  lastDepth: number;
  initialized: boolean;
}

/** Create a fresh perception memo (one per Borg session). */
export function makePerceiveMemo(): PerceiveMemo {
  return { lastDepth: -1, initialized: false };
}

/**
 * Fold the current view into `world`. Call once at the start of each decision,
 * before the think ladder runs. Advances nothing on the game side (read-only).
 */
export function perceive(
  world: BorgWorld,
  view: BorgView,
  memo: PerceiveMemo,
  tables: BorgMessageTables = emptyMessageTables(),
  valuation: TakeValuation = {},
): void {
  const p = view.player();

  /* Old position, for the "delete objects I just stepped off" rule. */
  const oldX = world.self.c.x;
  const oldY = world.self.c.y;

  // Level change: depth changed (or first sight) -> forget the old level.
  const newLevel = !memo.initialized || p.depth !== memo.lastDepth;
  if (newLevel) {
    world.wipeLevel(p.depth);
    memo.lastDepth = p.depth;
    memo.initialized = true;
  }

  // The two halves of borg_update's level branch (borg-update.c:2107 and
  // :2320): a new level forgets its fear outright, an old one lets it decay.
  const fear = getFearCaches(world);
  if (newLevel) fear.wipe();
  else decayLevelTimers(world);

  // Self.
  world.self.c.x = p.grid.x;
  world.self.c.y = p.grid.y;
  world.facts.depth = p.depth;

  ingestMap(world, view);
  borgUpdateLight(world);
  const seen = ingestMonsters(world, view);
  ingestFloor(world, view, oldX, oldY, valuation);

  // Consume the message stream (drains view.messages() exactly once). The C
  // also force-deletes all records while hallucinating (borg-update.c:1557);
  // PlayerView exposes no hallucination flag, so that branch is omitted (the
  // borg simply trusts the exact-id view it is given).
  borgReactMessages(world, view.messages(), seen.ids, seen.names, tables);

  world.seeded = true;
}

/**
 * The per-think decay of everything the Borg counts in game turns
 * (borg-update.c:2320-2418, the "Handle old level" branch). Every one of these
 * is a duration the Borg believes a spell or a scroll bought it, so without the
 * decay each one latches on first use: a single prep spell would block resting
 * for the rest of the character's life, one Word of Recall would leave the Borg
 * waiting forever, and one Sense Invisible would make it never look again.
 *
 * `goal.recalling` floors at 1 rather than 0 so the Borg does not read "recall
 * finished" and re-read the scroll; the lift-off MESSAGE is what clears it
 * (perceive-messages.ts).
 */
function decayLevelTimers(world: BorgWorld): void {
  const self = world.self;
  const ratio = self.gameRatio;

  if (self.resistance >= 1) self.resistance -= ratio;
  if (self.noRestPrep >= 1) self.noRestPrep -= ratio;
  if (self.goal.recalling >= 1) {
    self.goal.recalling -= ratio;
    if (self.goal.recalling <= 0) self.goal.recalling = 1;
  }
  if (self.goal.descending >= 1) self.goal.descending -= ratio;
  if (self.temp.seeInv >= 1) self.temp.seeInv -= ratio;

  /* Reduce fear over time (borg-update.c:2410): one point per region every ten
   * borg turns, so an attack the Borg never explained keeps it wary for a while
   * and then stops. */
  if (world.clock % 10 === 0) {
    const region = getFearCaches(world).region2d;
    for (let y = 0; y < FEAR_REGION_H; y++) {
      const row = region[y];
      if (!row) continue;
      for (let x = 0; x < FEAR_REGION_W; x++) {
        if ((row[x] ?? 0) > 0) row[x] = row[x]! - 1;
      }
    }
  }
}

/** Fold visible/known cells into borg_grids, setting feat + info flags. */
function ingestMap(world: BorgWorld, view: BorgView): void {
  const bounds = view.mapBounds();
  const maxY = Math.min(bounds.height, world.map.height);
  const maxX = Math.min(bounds.width, world.map.width);

  for (let y = 0; y < maxY; y++) {
    for (let x = 0; x < maxX; x++) {
      const c = view.cell(x, y);
      if (!c) continue;
      // Borg only records grids it has seen or remembers, mirroring the
      // known-map fog-of-war (borg_update_map skips unknown grids).
      if (!c.known && !c.inView) continue;

      const g = world.map.at(x, y);
      g.feat = c.feat;
      g.trap = c.trap;

      let info = g.info | BORG_MARK;
      if (c.inView) info |= BORG_VIEW;
      else info &= ~BORG_VIEW;
      if (c.glow) info |= BORG_GLOW;
      g.info = info;
    }
  }
}

/**
 * borg_update_light (borg-cave-light.c:71, called from borg-update.c:2519): mark
 * the grids the Borg's own light source illuminates, which is a different thing
 * from the grids it has in view. A dark corridor a torch reaches is BORG_LIGHT
 * and not BORG_GLOW; a lit room the Borg is looking into from outside is the
 * other way round. Three ported subsystems ask the question and nothing had ever
 * set the flag, so every one of them read "not lit": whether a monster's grid can
 * be checked for the monster still being on it, whether a room needs lighting,
 * and the necromancer's lit-square spell penalty.
 *
 * Verbatim port including the shapes: radius 1 is the eight neighbours, radius 2
 * is four three-grid arms gated on the grid two away being floor, and radius 3+
 * is four diagonals plus a boxed scan of everything in view within the light's
 * own distance approximation.
 */
function borgUpdateLight(world: BorgWorld): void {
  const map = world.map;

  /* Clear them all (the C keeps a list of the grids it lit; the port rescans,
   * which is the same set and needs no second array). */
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const g = map.at(x, y);
      if (g.info & BORG_LIGHT) g.info &= ~BORG_LIGHT;
    }
  }

  const cy = world.self.c.y;
  const cx = world.self.c.x;
  const radius = world.self.trait[BI.LIGHT] ?? 0;
  const lightUp = (y: number, x: number): void => {
    if (!map.inBounds(x, y)) return;
    map.at(x, y).info |= BORG_LIGHT;
  };
  const floorAt = (y: number, x: number): boolean =>
    borgCaveFloorBold(world, y, x);

  /* Player grid (the C lights it whatever the radius, provided a light exists;
   * a radius of zero is how "no light source" reaches here). */
  if (radius <= 0) return;
  lightUp(cy, cx);

  /* Radius 1 -- torch radius */
  lightUp(cy + 1, cx);
  lightUp(cy - 1, cx);
  lightUp(cy, cx + 1);
  lightUp(cy, cx - 1);
  lightUp(cy + 1, cx + 1);
  lightUp(cy + 1, cx - 1);
  lightUp(cy - 1, cx + 1);
  lightUp(cy - 1, cx - 1);

  /* Radius 2 -- lantern radius */
  if (
    radius >= 2 &&
    cy + 2 < AUTO_MAX_Y &&
    cy - 2 > 0 &&
    cx + 2 < AUTO_MAX_X &&
    cx - 2 > 0
  ) {
    if (floorAt(cy + 2, cx)) {
      lightUp(cy + 2, cx);
      lightUp(cy + 2, cx + 2);
      lightUp(cy + 2, cx - 2);
    }
    if (floorAt(cy - 2, cx)) {
      lightUp(cy - 2, cx);
      lightUp(cy - 2, cx + 2);
      lightUp(cy - 2, cx - 2);
    }
    if (floorAt(cy, cx + 2)) {
      lightUp(cy, cx + 2);
      lightUp(cy + 1, cx + 2);
      lightUp(cy - 1, cx + 2);
    }
    if (floorAt(cy, cx - 2)) {
      lightUp(cy, cx - 2);
      lightUp(cy + 2, cx - 2);
      lightUp(cy - 2, cx - 2);
    }
  }

  /* Radius 3+ -- artifact radius */
  if (
    radius >= 3 &&
    cy + 3 < AUTO_MAX_Y &&
    cy - 3 > 0 &&
    cx + 3 < AUTO_MAX_X &&
    cx - 3 > 0
  ) {
    const p = Math.min(radius, 5); /* Paranoia -- see "LITE_MAX" */
    if (floorAt(cy + 3, cx + 3)) lightUp(cy + 3, cx + 3);
    if (floorAt(cy + 3, cx - 3)) lightUp(cy + 3, cx - 3);
    if (floorAt(cy - 3, cx + 3)) lightUp(cy - 3, cx + 3);
    if (floorAt(cy - 3, cx - 3)) lightUp(cy - 3, cx - 3);

    const minY = Math.max(cy - p, 0);
    const maxY = Math.min(cy + p, AUTO_MAX_Y - 1);
    const minX = Math.max(cx - p, 0);
    const maxX = Math.min(cx + p, AUTO_MAX_X - 1);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dy = Math.abs(cy - y);
        const dx = Math.abs(cx - x);
        if (dy <= 2 && dx <= 2) continue; /* the central grids, done above */
        const d = dy > dx ? dy + (dx >> 1) : dx + (dy >> 1);
        if (d > p) continue;
        if (!map.inBounds(x, y)) continue;
        if (map.at(x, y).info & BORG_VIEW) lightUp(y, x);
      }
    }
  }
}

/**
 * Rebuild the monster-tracking list from perceivable monsters, updating records
 * in place by m_idx (belief accumulation). Records for monsters no longer
 * visible are preserved and expire on the 2000-turn clock, matching the C borg's
 * follow / forget behavior (borg-update.c:1541-1567).
 *
 * Returns the game m_idx values visible this tick (for message pruning) and
 * their race names (for attributing an attack message to one of them).
 */
function ingestMonsters(
  world: BorgWorld,
  view: BorgView,
): { ids: Set<number>; names: Map<number, string> } {
  // Clear the grid.kill back-pointers; rebuilt below from live positions.
  for (const [, k] of world.kills.entries()) {
    if (world.map.inBounds(k.pos.x, k.pos.y)) {
      world.map.at(k.pos.x, k.pos.y).kill = 0;
    }
    // Clear per-tick flags (borg-update.c:1549).
    k.seen = false;
    k.used = false;
  }

  // Index existing records by game m_idx so updates land in place (preserving the
  // Borg's accumulated belief) rather than churning slots.
  const byMidx = new Map<number, number>();
  for (const [i, k] of world.kills.entries()) {
    if (k.mIdx !== 0) byMidx.set(k.mIdx, i);
  }

  const visibleIds = new Set<number>();
  const names = new Map<number, string>();
  for (const m of view.monsters()) {
    if (!m.visible) continue;
    visibleIds.add(m.id);
    names.set(m.id, m.race);

    let idx = byMidx.get(m.id);
    if (idx === undefined) {
      idx = world.kills.alloc();
      byMidx.set(m.id, idx);
      /* borg_new_kill (borg-flow-kill.c:813): a monster appearing right after an
       * unexplained attack is assumed to BE the thing that attacked, so the fear
       * that attack raised is dropped and the monster's own danger takes over.
       * Without this the Borg would carry both at once and refuse to fight. */
      if (world.clock < world.self.temp.needSeeInvis + 5) {
        clearLocalRegionFear(world);
      }
    }
    const k = world.kills.at(idx);
    k.mIdx = m.id;
    k.rIdx = m.raceIndex;
    k.known = true;
    k.ox = k.pos.x;
    k.oy = k.pos.y;
    k.pos.x = m.grid.x;
    k.pos.y = m.grid.y;
    k.awake = !m.asleep;
    k.afraid = m.afraid;
    k.confused = m.confused;
    k.stunned = m.stunned;
    k.speed = m.speed;
    k.power = m.hp;
    k.injury = m.maxHp > 0 ? Math.trunc(((m.maxHp - m.hp) * 100) / m.maxHp) : 0;
    k.level = m.level;
    /* borg_update_kill_new (borg-flow-kill.c:216): ranged_attack is the COUNT of
     * the race's spell flags, arrows and breaths included. Five subsystems read
     * it and nothing had ever written it, so every monster read as unable to
     * touch the Borg from across a room. */
    k.rangedAttack = m.spellFlags.length;
    /* RF_MULTIPLY, cached for when this record is later deleted out of sight
     * (see BorgKill.isMultiplier / BorgKills.delete). */
    k.isMultiplier = m.raceFlags.includes("MULTIPLY");
    k.seen = true;
    k.when = world.clock;

    if (world.map.inBounds(m.grid.x, m.grid.y)) {
      world.map.at(m.grid.x, m.grid.y).kill = idx;
    }
  }

  // Expiry pass: forget records unseen for >= 2000 borg-turns
  // (borg-update.c:1553). Visible records were just refreshed (when == clock).
  for (const [i, k] of world.kills.entries()) {
    if (world.clock - k.when < BORG_EXPIRE_TURNS) continue;
    world.kills.delete(i, world);
  }

  return { ids: visibleIds, names };
}

/**
 * Zero the nine fear regions around the Borg (borg-flow-kill.c:820). The clamp
 * expressions are upstream's, quirk included: y2 is computed from x0 there, and
 * borgFearRegional writes the same nine cells the same way, so clearing them by
 * a different rule would leave fear the Borg cannot see behind.
 */
function clearLocalRegionFear(world: BorgWorld): void {
  const region = getFearCaches(world).region2d;
  const y0 = Math.trunc(world.self.c.y / 11);
  const x0 = Math.trunc(world.self.c.x / 11);
  const y1 = y0 > 0 ? y0 - 1 : 0;
  const x1 = x0 > 0 ? x0 - 1 : 0;
  const y2 = x0 < 5 ? x0 + 1 : 5;
  const x2 = x0 < 17 ? x0 + 1 : 17;
  const zero = (ry: number, rx: number): void => {
    const row = region[ry];
    if (row && rx < row.length) row[rx] = 0;
  };
  zero(y0, x0);
  zero(y0, x1);
  zero(y0, x2);
  zero(y1, x0);
  zero(y2, x0);
  zero(y1, x1);
  zero(y1, x2);
  zero(y2, x1);
  zero(y2, x2);
}

/**
 * What the host can tell the Borg about an object kind: its shop base price
 * (ObjectKind.cost) and whether the character knows what the flavour is.
 * Returns null for a kind the host cannot resolve.
 */
export type KindCostResolver = (
  tval: number,
  sval: number,
) => { cost: number; aware: boolean } | null;

/** What perception needs in order to price a floor object. */
export interface TakeValuation {
  /** Host kind lookup; absent means every kind reads as unaware. */
  kindCost?: KindCostResolver | undefined;
  /**
   * "tval:sval" of every kind the Borg has thrown away on this level, which is
   * this port's stand-in for upstream's inscription. borg_drop_junk inscribes
   * an item "borg ignore" BEFORE dropping it (borg-junk.c:464-467) precisely so
   * that borg_new_take prices it at -10 and the Borg never walks back to it.
   * The frozen action surface has no inscribe command, so the Borg remembers
   * instead. Per kind rather than per object, which is what the price is anyway.
   */
  junked?: ReadonlySet<string> | undefined;
}

/** The junked-set key for an object. */
export function junkKey(tval: number, sval: number): string {
  return `${String(tval)}:${String(sval)}`;
}

/** tval_is_money: TV_GOLD (generated/tvals.ts). */
const TV_GOLD = 35;

/**
 * borg_new_take's valuation (borg-flow-take.c:251-271). This is the number
 * every flow-to-object gate reads, and a zero here means the Borg walks past
 * the object forever.
 *
 * Upstream: an aware kind is worth kind->cost, gold is flat 30, an unaware kind
 * is worth 1 (so the Borg picks up unidentified things to find out what they
 * are), and two rules force -10 - an item whose plusses are known to be
 * negative, and one inscribed "borg ignore". Both -10 rules exist to stop the
 * Borg dropping something as junk and immediately walking back to pick it up.
 *
 * ONE DIFFERENCE, and it is in the knowledge the rule is allowed to use.
 * Upstream gates the negative-plusses rule on object_fully_known, because in
 * the C the borg would otherwise be reading a value the character has not
 * learned. The frozen ItemView reports true plusses to every subsystem in this
 * port with no knowledge gate at all, so there is no fully-known signal to gate
 * on; the rule is applied to what the view reports. The alternative is dropping
 * the rule, which reinstates exactly the pick-up-and-drop loop it was written
 * to prevent.
 */
export function takeValue(item: ItemView, valuation: TakeValuation): number {
  let value: number;
  if (item.tval === TV_GOLD) {
    value = 30;
  } else {
    const kind = valuation.kindCost?.(item.tval, item.sval) ?? null;
    /* No host table is the unaware branch: worth 1, which is "pick it up and
     * find out", not "ignore it". */
    value = kind?.aware ? kind.cost : 1;
  }

  if (item.toA < 0 || item.toD < 0 || item.toH < 0) value = -10;
  if (item.inscription?.startsWith("borg ignore")) value = -10;
  if (valuation.junked?.has(junkKey(item.tval, item.sval))) value = -10;

  return value;
}

/**
 * Fold floor objects into the take-tracking list, updating in place by position
 * so unseen objects persist and expire on the 2000-turn clock, and deleting
 * objects under the borg (or its previous grid) as the C does
 * (borg-update.c:1569-1601). Identity resolution to a real k_idx is still the
 * item subsystem's; this records presence, tval, position and the estimated
 * value flow-to-item gates on.
 */
function ingestFloor(
  world: BorgWorld,
  view: BorgView,
  oldX: number,
  oldY: number,
  valuation: TakeValuation,
): void {
  // Clear grid.take back-pointers; rebuilt below.
  for (const [, t] of world.takes.entries()) {
    if (world.map.inBounds(t.pos.x, t.pos.y)) {
      world.map.at(t.pos.x, t.pos.y).take = 0;
    }
  }

  // Index existing records by position for in-place update.
  const byPos = new Map<string, number>();
  for (const [i, t] of world.takes.entries()) {
    byPos.set(`${t.pos.x},${t.pos.y}`, i);
  }

  const bounds = view.mapBounds();
  const maxY = Math.min(bounds.height, world.map.height);
  const maxX = Math.min(bounds.width, world.map.width);

  for (let y = 0; y < maxY; y++) {
    for (let x = 0; x < maxX; x++) {
      const c = view.cell(x, y);
      if (!c || c.objectCount <= 0) continue;
      const items = view.floorItems(x, y);
      const head = items[0];
      if (!head) continue;

      const key = `${x},${y}`;
      let idx = byPos.get(key);
      if (idx === undefined) {
        idx = world.takes.alloc();
        byPos.set(key, idx);
      }
      const t = world.takes.at(idx);
      // kIdx is a nonzero "present, unresolved" marker until the item subsystem
      // binds the real object kind; tval carries the broad category.
      t.kIdx = head.tval > 0 ? head.tval : 1;
      t.tval = head.tval;
      t.known = false;
      t.pos.x = x;
      t.pos.y = y;
      t.when = world.clock;
      t.value = takeValue(head, valuation);
    }
  }

  // Delete objects under the borg / its old grid, then expire stale ones
  // (borg-update.c:1583-1600), then rebuild the surviving back-pointers.
  for (const [i, t] of world.takes.entries()) {
    const underMe =
      (t.pos.x === world.self.c.x && t.pos.y === world.self.c.y) ||
      (t.pos.x === oldX && t.pos.y === oldY);
    if (underMe) {
      world.takes.delete(i);
      continue;
    }
    if (world.clock - t.when >= BORG_EXPIRE_TURNS) {
      world.takes.delete(i);
      continue;
    }
    if (world.map.inBounds(t.pos.x, t.pos.y)) {
      world.map.at(t.pos.x, t.pos.y).take = i;
    }
  }
}

/** Reset perception facts (used by tests / explicit level resets). */
export function resetFacts(world: BorgWorld): void {
  world.facts = makeLevelFacts();
}
