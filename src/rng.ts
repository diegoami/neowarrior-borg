/**
 * Borg's own RNG, isolated from the game's.
 *
 * Upstream, the borg runs its damage/attack simulations on the game's global
 * RNG but swaps in its own local seed first and restores the game's seed after
 * (reference/src/borg/borg.c:489-506), so its "what if I attacked" dry-runs
 * never advance the real game stream. This engine has no global RNG - each stream
 * is a first-class instance (core/src/rng.ts) - so the Borg simply OWNS a
 * separate generator. This preserves both invariants at once:
 *
 *  1. Game determinism, the sharpest faithfulness risk in the port: the Borg
 *     never draws from or perturbs the game's RNG.
 *  2. Borg behavior: simulations use the same quick-LCRNG the C borg used.
 *
 * THE STREAM RUNS CONTINUOUSLY FOR THE LIFE OF BORG. Upstream seeds
 * borg_rand_local exactly once, at borg start-up (borg-init.c:487-488), and the
 * swap-in/swap-out at each think ends with `borg_rand_local = Rand_value`
 * (borg.c:504) - it saves the ADVANCED value back. So think N+1 begins where
 * think N stopped. Resetting to a constant every think instead would make the
 * Nth draw of every think the same number forever: every tie-break decided the
 * same way, every low-probability branch either always taken or never taken.
 * A one-instance generator that is never reseeded reproduces upstream exactly,
 * and stays fully deterministic for a given starting seed.
 *
 * The seed is not part of the savefile. Upstream does not persist it either;
 * borg_rand_local is a process-lifetime global, re-drawn on the next start-up.
 */

/** The private stream keeps simulation rolls out of the game's generator. */
export class Rng {
  private value: number;

  constructor(seed: number) {
    this.value = seed >>> 0;
  }

  reseed(seed: number): void {
    this.value = seed >>> 0;
  }

  randint0(m: number): number {
    if (m > 0x10000000) throw new RangeError(`Rand_div: m must be <= 0x10000000, got ${m}`);
    if (m <= 1) return 0;
    const n = Math.trunc(0x10000000 / m);
    for (;;) {
      this.value = (Math.imul(this.value, 1103515245) + 12345) >>> 0;
      const r = Math.trunc(((this.value >>> 4) & 0x0fffffff) / n);
      if (r < m) return r;
    }
  }

  randint1(m: number): number {
    return this.randint0(m) + 1;
  }

  randSpread(a: number, d: number): number {
    return a + this.randint0(1 + d + d) - d;
  }
}

/**
 * Borg's default local seed. Upstream draws its start-up value from the
 * game RNG (borg-init.c:488, randint1(0x10000000)); a host that wants that
 * behavior passes its own seed to createBorg. Any nonzero constant works; this
 * value is arbitrary but fixed, so an unseeded Borg is reproducible.
 */
export const BORG_LOCAL_SEED = 0x00c0ffee;

/**
 * Create the Borg's simulation RNG: a quick-mode (LCRNG) generator, matching the
 * mode the C borg used for its local rolls. Seeded from BORG_LOCAL_SEED.
 */
export function makeBorgRng(seed: number = BORG_LOCAL_SEED): Rng {
  return new Rng(seed >>> 0);
}

/**
 * Reseed a Borg RNG in place to the given (or default) seed, restarting the
 * stream. Nothing in the think cycle calls this: the live Borg's stream runs
 * continuously (see the header). It exists for tests that need to replay an
 * exact draw sequence, and for a host restarting a Borg on a fresh character.
 */
export function reseedBorgRng(rng: Rng, seed: number = BORG_LOCAL_SEED): void {
  /* reseed(), not setState(). setState is core's SAVEFILE path and forces quick
   * off (load.c does); this used to call it with an all-zero WELL table, and an
   * all-zero WELL state is a fixed point - the Borg's generator returned 0 to
   * every draw from its first think onward. borg_twitchy retries on `dir == 0`
   * without spending its counter (faithfully - the C does the same), so the very
   * first decision on a live level never returned. */
  rng.reseed(seed);
}
