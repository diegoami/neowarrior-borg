/**
 * TESTS FOR THE JOURNAL, against fakes shaped like the host's own calls.
 *
 * The journal writes through two host seams it did not make - the character's
 * slot in its own save (mod.store.character) and the event domain the
 * `dungeonlevel` arrivals arrive on - so the fakes here answer the way the
 * host's own source answers (a slot answers ok to a write it swallowed, a
 * call never throws for an ordinary refusal), the same discipline
 * restart.test.ts and presenter.test.ts keep.
 *
 * THE TWO RULES THE TASK PINS, each tested on its own:
 *
 *   1. ONE MILESTONE PER DEPTH PER CHARACTER, including across the
 *      `cause: "load"` re-fire the docs warn about (MOD_SEAMS 4l and 4w): the
 *      dedup is a comparison against what is already stored, never a
 *      this-session memory, because the slot survives the save/load while
 *      the page does not.
 *   2. THE GRAVEYARD ENTRY LANDS BEFORE ANYTHING ELSE THE LOOP DOES, is
 *      appended (never rewrites the entry before it), and records what the
 *      report carried - no field the game did not send.
 *
 * AND THE STANDING PROPERTY: the journal never throws and never rejects. A
 * record that cannot be written says so in the log and the run plays on; the
 * restart loop awaits `graveyard` and must never receive a rejection.
 */

import { describe, expect, it } from "vitest";
import type { Api2Events, Api2LevelEvent, Api2Slot, JsonValue, RunOutcome, RunReport } from "@rpgm-tools/neo-angband-mod-sdk";
import {
  appendGraveyardEntry,
  graveyardEntryOf,
  installWarriorJournal,
  parseJournal,
  recordDepthMilestone,
} from "./journal.js";

/* ==================================================================
 * Fakes: the slot, the stamps, the event bus
 * ================================================================== */

/** A character slot in memory, with its write journal. */
function slot(initial: JsonValue | null = null): Api2Slot & { held(): JsonValue | null; sets(): readonly unknown[] } {
  let value: JsonValue | null = initial;
  const sets: unknown[] = [];
  return {
    get: () => Promise.resolve({ ok: true as const, value: structuredClone(value) }),
    set: (next) => {
      sets.push(next);
      value = structuredClone(next);
      return Promise.resolve({ ok: true as const, value: null });
    },
    held: () => value,
    sets: () => sets,
  };
}

/** A slot whose every call refuses: no record can be kept, loudly. */
function refusingSlot(): Api2Slot {
  return {
    get: () => Promise.resolve({ ok: false as const, reason: "refused" as const, code: "refused", message: "no character" }),
    set: () => Promise.resolve({ ok: false as const, reason: "refused" as const, code: "refused", message: "no character" }),
  };
}

/** A slot whose calls throw, the way a broken host seam does. */
function throwingSlot(): Api2Slot {
  return {
    get: () => Promise.reject(new Error("storage exploded")),
    set: () => Promise.reject(new Error("storage exploded")),
  };
}

/** The cheap stamps the plugin wires (view.player().level, view.world().turn). */
const stamps =
  (level: number, turn: number) =>
  async (): Promise<{ readonly level: number; readonly turn: number }> => ({ level, turn });

/** An arrival, in the payload's own shape. */
function arrival(depth: number, cause: Api2LevelEvent["cause"], levelId = depth): Api2LevelEvent {
  return { depth, levelId, cause, arena: false };
}

/** A run report in the SDK's own shape (restart.test.ts's, fuller). */
function report(outcome: RunOutcome): RunReport {
  return {
    outcome,
    cause: "a novice mage",
    key: "cedar",
    name: "Borg",
    race: "Half-Troll",
    cls: "Warrior",
    level: 3,
    maxLevel: 4,
    maxDepth: 4,
    depth: 4,
    gold: 12,
    turn: 340,
    score: 56,
    scored: true,
    endedAt: 0,
    history: [],
    messages: [],
    belongings: [],
    sheet: null,
    birth: { race: "Half-Troll", cls: "Warrior", name: "Borg", stats: [18, 10, 10, 10, 17] },
  };
}

/** The event bus: what the host's events domain does for dungeonlevel. */
function eventBus(options: { readonly refuse?: boolean } = {}) {
  const listeners = new Map<string, (payload: never) => void>();
  const offs: string[] = [];
  return {
    api: {
      on: (name: string, listener: (payload: never) => void) => {
        if (options.refuse === true) {
          return Promise.resolve({
            ok: false as const,
            reason: "not-granted" as const,
            capability: `event:${name}`,
            message: `the player has not granted event:${name}`,
          });
        }
        listeners.set(name, listener);
        return Promise.resolve({ ok: true as const, value: { id: name } });
      },
      off: (subscription: { readonly id: string }) => {
        offs.push(subscription.id);
        listeners.delete(subscription.id);
        return Promise.resolve({ ok: true as const, value: null });
      },
    } as unknown as Pick<Api2Events, "on" | "off">,
    /** Deliver an arrival the way the host does: synchronously. */
    arrive: (payload: Api2LevelEvent): void => {
      listeners.get("dungeonlevel")?.(payload as never);
    },
    heard: () => listeners.has("dungeonlevel"),
    offs: () => offs,
  };
}

/** Let the journal's chained awaits run out. */
async function settle(ticks = 32): Promise<void> {
  for (let i = 0; i < ticks; i++) await Promise.resolve();
}

describe("the warrior journal's depth milestones", () => {
  it("records one milestone per depth, in first-arrival order, with the stamps it was given", async () => {
    const theSlot = slot();
    const read = recordDepthMilestone({ slot: theSlot, log: () => undefined, stamps: stamps(1, 100) }, arrival(0, "new-game"));
    expect(await read).toBe(true);
    expect(await recordDepthMilestone({ slot: theSlot, log: () => undefined, stamps: stamps(2, 900) }, arrival(1, "change"))).toBe(true);

    const stored = parseJournal(theSlot.held());
    expect(stored?.milestones).toEqual([
      { depth: 0, levelId: 0, cause: "new-game", arena: false, level: 1, turn: 100 },
      { depth: 1, levelId: 1, cause: "change", arena: false, level: 2, turn: 900 },
    ]);
  });

  it("records a depth exactly once across a cause: \"load\" re-fire and a later revisit", async () => {
    /* THE DEDUP RULE FROM THE DOCS: the event also fires with cause "load"
     * on every load, so compare against the milestones ALREADY STORED. The
     * slot is what survives the load; the page's memory is not. */
    const theSlot = slot();
    const deps = { slot: theSlot, log: () => undefined, stamps: stamps(1, 100) };
    await recordDepthMilestone(deps, arrival(0, "new-game"));
    await recordDepthMilestone(deps, arrival(1, "change"));
    await recordDepthMilestone(deps, arrival(2, "change"));
    /* The save loads: the first level re-announces with cause "load"... */
    expect(await recordDepthMilestone(deps, arrival(0, "load"))).toBe(true);
    /* ...and the character walks back down to 1, a depth it has stood on. */
    expect(await recordDepthMilestone(deps, arrival(1, "change"))).toBe(true);

    const stored = parseJournal(theSlot.held());
    expect(stored?.milestones.map((m) => m.depth)).toEqual([0, 1, 2]);
    /* The FIRST arrival's stamps stand; the re-fire rewrites nothing. */
    expect(stored?.milestones[0]).toEqual({ depth: 0, levelId: 0, cause: "new-game", arena: false, level: 1, turn: 100 });
    /* And no write happened for the duplicates: three milestones, three sets. */
    expect(theSlot.sets()).toHaveLength(3);
  });

  it("starts a journal in a slot that holds something else, without adopting it", async () => {
    const theSlot = slot({ someoneElses: "key" } as JsonValue);
    await recordDepthMilestone({ slot: theSlot, log: () => undefined, stamps: stamps(1, 1) }, arrival(0, "new-game"));
    const stored = theSlot.held() as Record<string, unknown>;
    /* The character slot is this journal's alone (it lives in the save the
     * host scopes to the character); a value that is not a journal is
     * replaced, not merged with. */
    expect(stored["someoneElses"]).toBeUndefined();
    expect(parseJournal(theSlot.held())?.milestones).toHaveLength(1);
  });

  it("says so and plays on when the character slot refuses or throws", async () => {
    /* The raw write answers false and never throws; the INSTALLED journal is
     * the one that turns a false into a log line (the next test). */
    await expect(recordDepthMilestone({ slot: refusingSlot(), log: () => undefined, stamps: stamps(1, 1) }, arrival(1, "change"))).resolves.toBe(false);
    await expect(recordDepthMilestone({ slot: throwingSlot(), log: () => undefined, stamps: stamps(1, 1) }, arrival(1, "change"))).resolves.toBe(false);
  });
});

describe("the warrior journal's graveyard", () => {
  it("appends one entry per run report, with the fields the report carried", async () => {
    const theSlot = slot();
    await recordDepthMilestone({ slot: theSlot, log: () => undefined, stamps: stamps(1, 100) }, arrival(0, "new-game"));
    await appendGraveyardEntry({ slot: theSlot, log: () => undefined }, report("death"));

    const stored = parseJournal(theSlot.held());
    expect(stored?.graveyard).toEqual([
      {
        outcome: "death",
        cause: "a novice mage",
        name: "Borg",
        race: "Half-Troll",
        class: "Warrior",
        baseStats: [18, 10, 10, 10, 17],
        maxDepth: 4,
        level: 3,
        gold: 12,
        turn: 340,
        score: 56,
      },
    ]);
    /* The milestone survived the graveyard's write: both halves share the
     * slot through read-modify-write. */
    expect(stored?.milestones).toHaveLength(1);
  });

  it("keeps the entries before it verbatim: append-only, per run, per character", async () => {
    const theSlot = slot();
    const first = report("death");
    const second = { ...report("death"), cause: "a wild dog", turn: 900, gold: 40 };
    await appendGraveyardEntry({ slot: theSlot, log: () => undefined }, first);
    await appendGraveyardEntry({ slot: theSlot, log: () => undefined }, second);

    const stored = parseJournal(theSlot.held());
    expect(stored?.graveyard).toHaveLength(2);
    expect(stored?.graveyard[0]).toEqual(graveyardEntryOf(first));
    expect(stored?.graveyard[1]?.cause).toBe("a wild dog");
  });

  it("records what a partial report carried, and nulls what it did not", async () => {
    /* A front end that delivers only the outcome and the cause (the shape
     * plugin.test.ts's fake game sends) must not crash the writer. */
    const partial = { outcome: "winner", cause: "the Serpent of Chaos" } as unknown as RunReport;
    const entry = graveyardEntryOf(partial);
    expect(entry.outcome).toBe("winner");
    expect(entry.cause).toBe("the Serpent of Chaos");
    expect(entry.baseStats).toBeNull();
    expect(entry.score).toBeNull();

    const theSlot = slot();
    expect(await appendGraveyardEntry({ slot: theSlot, log: () => undefined }, partial)).toBe(true);
    expect(parseJournal(theSlot.held())?.graveyard).toEqual([entry]);
  });

  it("resolves - and says so - when the character slot refuses or throws", async () => {
    const logs: string[] = [];
    await expect(appendGraveyardEntry({ slot: refusingSlot(), log: (m) => logs.push(m) }, report("death"))).resolves.toBe(false);
    await expect(appendGraveyardEntry({ slot: throwingSlot(), log: (m) => logs.push(m) }, report("death"))).resolves.toBe(false);
    expect(logs.join(" ")).not.toBe("");
  });
});

describe("the installed warrior journal", () => {
  it("hears the arrivals, records them through the subscription, and stops listening on stop", async () => {
    const theSlot = slot();
    const bus = eventBus();
    const journal = installWarriorJournal({ slot: theSlot, log: () => undefined, events: bus.api, stamps: stamps(1, 7) });
    await settle();
    expect(journal.listening).toBe(true);
    expect(bus.heard()).toBe(true);

    bus.arrive(arrival(0, "new-game"));
    bus.arrive(arrival(1, "change"));
    /* A load re-fire before the writes settle: the chain serializes the two
     * arrivals' read-modify-writes, and the re-fire adds nothing. */
    bus.arrive(arrival(0, "load"));
    await settle();
    await journal.stop();

    expect(bus.offs()).toEqual(["dungeonlevel"]);
    expect(journal.listening).toBe(false);
    expect(parseJournal(theSlot.held())?.milestones.map((m) => m.depth)).toEqual([0, 1]);

    /* A late arrival reaches no listener and records nothing. */
    bus.arrive(arrival(2, "change"));
    await settle();
    expect(parseJournal(theSlot.held())?.milestones.map((m) => m.depth)).toEqual([0, 1]);
  });

  it("writes the graveyard entry its graveyard() was asked for, after stop included nothing new", async () => {
    const theSlot = slot();
    const bus = eventBus();
    const journal = installWarriorJournal({ slot: theSlot, log: () => undefined, events: bus.api, stamps: stamps(1, 7) });
    await settle();
    await journal.graveyard(report("death"));
    await journal.stop();

    expect(parseJournal(theSlot.held())?.graveyard).toEqual([graveyardEntryOf(report("death"))]);
  });

  it("keeps its graveyard working when the arrival subscription was refused", async () => {
    /* event:dungeonlevel refused by the player: no milestones, but the run
     * report still arrives on the restart loop's own grant, and the record
     * of the run that ended must not depend on the one that did not. */
    const theSlot = slot();
    const bus = eventBus({ refuse: true });
    const journal = installWarriorJournal({ slot: theSlot, log: () => undefined, events: bus.api, stamps: stamps(1, 7) });
    await settle();
    expect(journal.listening).toBe(false);

    await journal.graveyard(report("death"));
    const stored = parseJournal(theSlot.held());
    expect(stored?.milestones).toEqual([]);
    expect(stored?.graveyard).toHaveLength(1);
    await journal.stop();
  });

  it("warns once, not per arrival, when the character's slot will not take a milestone", async () => {
    const logs: string[] = [];
    const bus = eventBus();
    const journal = installWarriorJournal({ slot: refusingSlot(), log: (message) => logs.push(message), events: bus.api, stamps: stamps(1, 1) });
    await settle();
    /* Two arrivals, one line: a wall of identical complaints helps nobody. */
    bus.arrive(arrival(1, "change"));
    bus.arrive(arrival(2, "change"));
    await settle();
    expect(logs.filter((line) => line.includes("depth milestones"))).toHaveLength(1);
    await journal.stop();
  });

  it("never lets a milestone write in flight lose a graveyard entry that follows", async () => {
    /* Both halves share one slot through read-modify-write; the chain is
     * what keeps an interleaving from dropping one of them. */
    const theSlot = slot();
    const bus = eventBus();
    const journal = installWarriorJournal({ slot: theSlot, log: () => undefined, events: bus.api, stamps: stamps(1, 7) });
    await settle();
    bus.arrive(arrival(0, "new-game"));
    bus.arrive(arrival(3, "change"));
    const written = journal.graveyard(report("death"));
    bus.arrive(arrival(1, "change"));
    await written;
    await journal.stop();

    const stored = parseJournal(theSlot.held());
    expect(stored?.milestones.map((m) => m.depth)).toEqual([0, 3, 1]);
    expect(stored?.graveyard).toHaveLength(1);
  });
});
