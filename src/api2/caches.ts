/**
 * What the Borg learns once from asynchronous reads and then answers from
 * synchronously, for as long as it stays true.
 *
 * Every API 2 read is a call that answers with a result, and the ported decision
 * code asks its questions in the middle of a ladder, where it cannot wait. Each
 * cache here is filled before a decision runs, from what the snapshot says the
 * decision will need, and answers the decision's own question from memory.
 */

import type { KnownItem, KnownPlayer, LoadoutChange, LoadoutSimulation, ModApi2 } from "@rpgm-tools/neo-angband-mod-sdk";
import type { ItemView, LoadoutSimulation as CoreLoadoutSimulation } from "@rpgm-tools/neo-angband-core";
import type { RaceRecord } from "../core-api.js";
import type { BorgTruth } from "./truth.js";

/* ------------------------------------------------------------------ */
/* Monster races                                                       */
/* ------------------------------------------------------------------ */

/** Race combat records by index. A race never changes during a session, so a record is kept for good. */
export class RaceBook {
  private readonly records = new Map<number, RaceRecord>();
  private readonly missing = new Set<number>();

  get(ridx: number): RaceRecord | undefined {
    return this.records.get(ridx);
  }

  /** Read the races of these indexes that are not known yet. */
  async ensure(truth: BorgTruth, indexes: Iterable<number>): Promise<void> {
    const wanted = [...new Set(indexes)].filter((index) => !this.records.has(index) && !this.missing.has(index));
    await Promise.all(
      wanted.map(async (index) => {
        const race = await truth.race(index);
        if (race === null) {
          this.missing.add(index);
          return;
        }
        this.records.set(index, {
          ridx: race.ridx,
          flags: new Set(race.flags),
          level: race.level,
          sleep: race.sleep,
          spellPower: race.spellPower,
          freqInnate: race.freqInnate,
          freqSpell: race.freqSpell,
          hasFriends: race.hasFriends,
          blows: race.blows.map((blow) => ({ dice: blow.dice, sides: blow.sides, effect: blow.effect })),
          spells: [...race.spells].sort((a, b) => a - b),
        });
      }),
    );
  }
}

/* ------------------------------------------------------------------ */
/* Activations                                                         */
/* ------------------------------------------------------------------ */

/** The activation of an item as the activation seam wants it: just the record's name. */
export interface ActivationName {
  readonly name: string;
}

/**
 * Which activation a piece of worn gear carries. Obj-make's precedence applies:
 * an artifact's or ego's own activation overrides the kind's, so each source is
 * asked about separately and the resolver picks.
 */
export class ActivationBook {
  private readonly names = new Map<string, ActivationName | null>();

  artifact(name: string): ActivationName | null {
    return this.names.get(`a:${name}`) ?? null;
  }
  ego(name: string): ActivationName | null {
    return this.names.get(`e:${name}`) ?? null;
  }
  kind(tval: number, sval: number): ActivationName | null {
    return this.names.get(`k:${String(tval)}:${String(sval)}`) ?? null;
  }

  /** Read the activations of every worn item that has one, for any source not read yet. */
  async ensure(api: Pick<ModApi2, "content">, equipment: readonly (ItemView | null)[]): Promise<void> {
    const asks = new Map<string, Parameters<ModApi2["content"]["activation"]>[0]>();
    for (const item of equipment) {
      if (item === null || !item.activation) continue;
      if (item.artifact && item.artifactName) asks.set(`a:${item.artifactName}`, { artifact: item.artifactName });
      if (item.ego && item.egoName) asks.set(`e:${item.egoName}`, { ego: item.egoName });
      asks.set(`k:${String(item.tval)}:${String(item.sval)}`, { tval: item.tval, sval: item.sval });
    }
    await Promise.all(
      [...asks].filter(([key]) => !this.names.has(key)).map(async ([key, ref]) => {
        const result = await api.content.activation(ref);
        if (!result.ok) return;
        this.names.set(key, result.value === null ? null : { name: result.value.name });
      }),
    );
  }
}

/* ------------------------------------------------------------------ */
/* Hypothetical loadouts                                               */
/* ------------------------------------------------------------------ */

/** Turns an API 2 simulation into the shape the Borg's self-model reads. */
export type ConvertSimulation = (simulation: LoadoutSimulation) => CoreLoadoutSimulation;

/** The most simulations one round of reads asks the game for. */
export const SIMULATIONS_PER_ROUND = 48;

/**
 * Answers "what would this loadout derive to" from memory.
 *
 * The derive runs in the engine and the Borg asks for it in the middle of a
 * decision, dozens of times for one purchase. An answer is not available in
 * time on the first ask, so the cache says it does not know (the Borg reads that
 * as "no improvement") and records the question. The bridge reads the recorded
 * questions after the decision and runs the decision again with them answered.
 *
 * An answer is valid for one set of gear, so the whole cache is dropped when the
 * pack, the worn set or any store's stock changes. A candidate's score is only
 * ever read as its difference from the empty change's score (think-session.ts
 * powerOf), which is why the empty change is read first and an answer is
 * withheld until it is known: a score without its baseline would read as a gain
 * on every candidate.
 */
export class LoadoutBook {
  private gear = "";
  private readonly answers = new Map<string, CoreLoadoutSimulation>();
  private readonly asked = new Set<string>();
  private readonly wanted = new Map<string, LoadoutChange>();

  /** Start a decision over this set of gear. */
  begin(gear: string): void {
    if (gear === this.gear) return;
    this.gear = gear;
    this.answers.clear();
    this.asked.clear();
    this.wanted.clear();
  }

  /** How many answered questions the cache holds, for the log. */
  get size(): number {
    return this.answers.size;
  }

  /** Whether the last decision asked something the cache could not answer. */
  get pending(): boolean {
    return this.wanted.size > 0;
  }

  /** The answer for a change, or null while it is being read. */
  answer(change: LoadoutChange): CoreLoadoutSimulation | null {
    const key = JSON.stringify(change);
    const base = this.answers.get("{}");
    if (key !== "{}" && base === undefined) this.want("{}", {});
    const hit = this.answers.get(key);
    if (hit === undefined) {
      this.want(key, change);
      return null;
    }
    return key === "{}" || base !== undefined ? hit : null;
  }

  private want(key: string, change: LoadoutChange): void {
    if (this.asked.has(key)) return;
    this.wanted.set(key, change);
  }

  /** Read the recorded questions from the game, up to a round's worth. Returns how many answers arrived. */
  async settle(api: Pick<ModApi2, "view">, convert: ConvertSimulation): Promise<number> {
    const round = [...this.wanted].slice(0, SIMULATIONS_PER_ROUND);
    const gear = this.gear;
    for (const [key] of round) {
      this.wanted.delete(key);
      this.asked.add(key);
    }
    let arrived = 0;
    await Promise.all(
      round.map(async ([key, change]) => {
        const result = await api.view.simulateLoadout(change);
        /* The gear moved while this was in flight: the answer belongs to a loadout that is gone. */
        if (!result.ok || gear !== this.gear) return;
        this.answers.set(key, convert(result.value));
        arrived += 1;
      }),
    );
    return arrived;
  }
}

/** A string that changes exactly when the pack, the worn set or a store's stock does. */
export function gearSignature(
  inventory: readonly KnownItem[],
  equipment: readonly (KnownItem | null)[],
  stores: readonly { readonly feat: number; readonly stock: readonly KnownItem[] }[],
  player: KnownPlayer | null,
): string {
  const one = (item: KnownItem | null): string => (item === null ? "-" : `${String(item.handle)}:${item.kindKey}:${String(item.number)}:${String(item.toH)}:${String(item.toD)}:${String(item.toA)}`);
  const stock = stores.map((store) => `${String(store.feat)}[${store.stock.map(one).join(",")}]`).join(";");
  return `${inventory.map(one).join(",")}|${equipment.map(one).join(",")}|${stock}|${String(player?.level ?? 0)}`;
}
