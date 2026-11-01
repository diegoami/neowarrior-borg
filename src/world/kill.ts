/**
 * Monster tracking - a faithful port of struct borg_kill and the borg_kills[]
 * list (reference/src/borg/borg-flow-kill.h).
 *
 * Borg tracks monsters in its own list rather than reading the engine's
 * monster array, so it can model staleness ("when last seen"), re-derive
 * identity from what it perceives, and reason about monsters it can no longer
 * see. Records expire after ~2000 borg-turns upstream; that staleness is
 * behaviorally load-bearing and preserved here.
 */

/** Estimated monster record (struct borg_kill). Faithful field-for-field. */
export interface BorgKill {
  /** Race index (r_idx). */
  rIdx: number;
  /** Verified race (not just guessed from a symbol). */
  known: boolean;
  /** Probably awake. */
  awake: boolean;
  /** Probably confused. */
  confused: boolean;
  /** Probably afraid. */
  afraid: boolean;
  /** Probably quivering. */
  quiver: boolean;
  /** Probably stunned. */
  stunned: boolean;
  /** Probably poisoned. */
  poisoned: boolean;
  /** Assigned motion this update. */
  seen: boolean;
  /** Assigned a message this update. */
  used: boolean;
  /** Location. */
  pos: { x: number; y: number };
  /** Old location (ox, oy) for move detection. */
  ox: number;
  oy: number;
  /** Estimated speed. */
  speed: number;
  /** Estimated moves. */
  moves: number;
  /** Quantity of ranged attacks. */
  rangedAttack: number;
  /** Per-RSF spell flag bytes (indexed by RSF_* ordinal). */
  spell: number[];
  /** Estimated hit-points. */
  power: number;
  /** Percent wounded. */
  injury: number;
  /** Estimated something (upstream "other"). */
  other: number;
  /** Monster level. */
  level: number;
  /** Preloaded monster race spell flags (indexed by RF_* ordinal). */
  spellFlags: number[];
  /** When last seen (borg clock). */
  when: number;
  /** The game's monster index (m_idx). */
  mIdx: number;
  /**
   * RF_MULTIPLY, cached from the race the last time this monster was visible
   * (ingestMonsters). Read by BorgKills.delete (borg_delete_kill,
   * borg-flow-kill.c:430-432) to arm the breeder-rest guard; surviving the
   * fog-of-war the same way `rIdx` does is what lets a record deleted while
   * out of sight still be recognised as a breeder.
   */
  isMultiplier: boolean;
}

/** A fresh, empty kill record (borg_delete_kill leaves them zeroed). */
export function makeBorgKill(): BorgKill {
  return {
    rIdx: 0,
    known: false,
    awake: false,
    confused: false,
    afraid: false,
    quiver: false,
    stunned: false,
    poisoned: false,
    seen: false,
    used: false,
    pos: { x: 0, y: 0 },
    ox: 0,
    oy: 0,
    speed: 0,
    moves: 0,
    rangedAttack: 0,
    spell: [],
    power: 0,
    injury: 0,
    other: 0,
    level: 0,
    spellFlags: [],
    when: 0,
    mIdx: 0,
    isMultiplier: false,
  };
}

/**
 * The monster-tracking list. Index 0 is an unused sentinel (upstream stores
 * live records from index 1), matching the borg_kills convention so the ported
 * subsystems can use nonzero grid.kill as "present".
 */
export class BorgKills {
  private readonly list: BorgKill[] = [makeBorgKill()];
  /** borg_kills_cnt: highest allocated index + 1. */
  count = 1;
  /** borg_kills_nxt: next slot to consider reusing. */
  next = 1;
  /** Index of a known summoner on the level, 0 for none. */
  summoner = 0;

  /** The record at index i (i >= 1). */
  at(i: number): BorgKill {
    return this.list[i]!;
  }

  /** True when index i holds a live record. */
  has(i: number): boolean {
    return i >= 1 && i < this.count && this.list[i]!.rIdx !== 0;
  }

  /**
   * Allocate (or reuse) a slot and return its index. Mirrors the upstream
   * scan-for-free-then-extend allocation in borg_new_kill.
   */
  alloc(): number {
    for (let i = 1; i < this.count; i++) {
      if (this.list[i]!.rIdx === 0) return i;
    }
    const i = this.count;
    this.list[i] = makeBorgKill();
    this.count += 1;
    return i;
  }

  /**
   * Clear the record at index i (borg_delete_kill, borg-flow-kill.c:411-439).
   *
   * `stamp`, when supplied, is where upstream's own timestamp lives
   * (borg-flow-kill.c:430-432): ANY deletion of a MULTIPLY-flagged record -
   * a kill, a blink, an expiry, a forgotten phantom - arms
   * `whenLastKillMult`, because upstream's version of this check runs inside
   * `borg_delete_kill` itself rather than only on the "I killed it" path.
   * Optional so a caller that has nothing to stamp (a bare test, most of
   * them) can still delete.
   */
  delete(i: number, stamp?: { self: { whenLastKillMult: number }; clock: number }): void {
    if (i < 1 || i >= this.list.length) return;
    const kill = this.list[i]!;
    if (stamp && kill.isMultiplier) stamp.self.whenLastKillMult = stamp.clock;
    this.list[i] = makeBorgKill();
  }

  /** Reset the whole list on level change. */
  wipe(): void {
    this.list.length = 1;
    this.list[0] = makeBorgKill();
    this.count = 1;
    this.next = 1;
    this.summoner = 0;
  }

  /** Iterate live records with their indices. */
  *entries(): IterableIterator<[number, BorgKill]> {
    for (let i = 1; i < this.count; i++) {
      const k = this.list[i]!;
      if (k.rIdx !== 0) yield [i, k];
    }
  }
}
