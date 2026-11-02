/**
 * TESTS FOR THE JOURNAL, against fakes shaped like the host's own calls.
 *
 * The journal writes through host seams it did not make - the character's
 * slot in its own save (mod.store.character), the INSTALL slot the graveyard
 * archive lives in (mod.store.install, #34), and the event domain the
 * `dungeonlevel` arrivals arrive on - so the fakes here answer the way the
 * host's own source answers (a slot answers ok to a write it swallowed, a
 * call never throws for an ordinary refusal), the same discipline
 * restart.test.ts and presenter.test.ts keep.
 *
 * THE THREE RULES THE TASKS PIN, each tested on its own:
 *
 *   1. ONE MILESTONE PER DEPTH PER CHARACTER, including across the
 *      `cause: "load"` re-fire the docs warn about (MOD_SEAMS 4l and 4w):
 *      the dedup is a comparison against what is already stored, never a
 *      this-session memory, because the slot survives the save/load while
 *      the page does not.
 *   2. THE GRAVEYARD ENTRY LANDS BEFORE ANYTHING ELSE THE LOOP DOES, in the
 *      INSTALL archive keyed by the run key (a re-delivered report
 *      re-records its run; an unnamed run still appends), carrying what the
 *      report carried - no field the game did not send - and preserving
 *      every sibling of the shared install value.
 *   3. THE ENDED RUN OUTLIVES ITS CHARACTER (#34): the host deletes the
 *      dead character's save before the report even publishes, so after
 *      death -> report -> the character's bag is GONE, a fresh read from
 *      install storage still retrieves the run.
 *
 * AND THE STANDING PROPERTY: the journal never throws and never rejects. A
 * record that cannot be written says so in the log and the run plays on; the
 * restart loop awaits `graveyard` and must never receive a rejection.
 */

import { describe, expect, it } from "vitest";
import type { Api2Events, Api2LevelEvent, Api2Slot, JsonValue, RunOutcome, RunReport } from "@rpgm-tools/neo-angband-mod-sdk";
import {
  archiveFinishedRun,
  GRAVEYARD_KEY,
  graveyardArchiveOf,
  graveyardEntryOf,
  installWarriorJournal,
  parseGraveyardArchive,
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

describe("the install graveyard archive", () => {
  it("archives one entry per run report, with the fields the report carried", async () => {
    const install = slot();
    expect(await archiveFinishedRun({ archive: install, log: () => undefined }, report("death"))).toBe(true);

    const stored = install.held() as Record<string, unknown>;
    expect(Object.keys(stored)).toEqual([GRAVEYARD_KEY]);
    expect(graveyardArchiveOf(stored[GRAVEYARD_KEY] as JsonValue).runs).toEqual([
      {
        run: "cedar",
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
  });

  it("keys entries by run key: a re-delivered report re-records its run, and an unnamed run appends", async () => {
    const install = slot();
    const first = report("death");
    await archiveFinishedRun({ archive: install, log: () => undefined }, first);
    const second = { ...report("death"), cause: "a wild dog", turn: 900, gold: 40 };
    await archiveFinishedRun({ archive: install, log: () => undefined }, second);
    /* One run, re-reported with its true ending: the entry is RE-RECORDED in
     * place, never duplicated - the run key is the identity. */
    expect(graveyardArchiveOf((install.held() as Record<string, unknown>)[GRAVEYARD_KEY] as JsonValue).runs).toHaveLength(1);
    expect(graveyardArchiveOf((install.held() as Record<string, unknown>)[GRAVEYARD_KEY] as JsonValue).runs[0]?.cause).toBe("a wild dog");

    /* A different run key is a different run... */
    const other = { ...report("death"), key: "birch", cause: "poison" };
    await archiveFinishedRun({ archive: install, log: () => undefined }, other);
    /* ...and a report that carries no key at all is still a run that ended:
     * it appends, because an unknown run is not the same run as any other. */
    const unnamed = { ...report("winner"), key: null };
    await archiveFinishedRun({ archive: install, log: () => undefined }, unnamed);
    const runs = graveyardArchiveOf((install.held() as Record<string, unknown>)[GRAVEYARD_KEY] as JsonValue).runs;
    expect(runs.map((entry) => [entry.run, entry.outcome, entry.cause])).toEqual([
      ["cedar", "death", "a wild dog"],
      ["birch", "death", "poison"],
      [null, "winner", "a novice mage"],
    ]);
  });

  it("preserves the install slot's siblings - the lineage counter, the birth flag, the title row's memory", async () => {
    /* The install slot is the SAME shared value the lineage counter, the
     * birth flag and the title row's profileIds live in (#26's discipline,
     * the substrate #34 moved the graveyard onto); an archive write that
     * dropped any of them would trade one record for another. */
    const install = slot({ profileIds: ["p1"], lineage: 7, warriorBirth: false } as JsonValue);
    await archiveFinishedRun({ archive: install, log: () => undefined }, report("death"));
    expect(install.held()).toEqual({
      profileIds: ["p1"],
      lineage: 7,
      warriorBirth: false,
      [GRAVEYARD_KEY]: { journal: 1, runs: [expect.objectContaining({ run: "cedar" })] },
    });
  });

  it("replaces a foreign value under the archive key, without adopting it and without touching siblings", async () => {
    const install = slot({ lineage: 2, [GRAVEYARD_KEY]: { journal: 99, runs: "garbage" } } as JsonValue);
    await archiveFinishedRun({ archive: install, log: () => undefined }, report("death"));
    const stored = install.held() as Record<string, unknown>;
    expect(stored["lineage"]).toBe(2);
    expect(graveyardArchiveOf(stored[GRAVEYARD_KEY] as JsonValue).runs).toHaveLength(1);
    expect(parseGraveyardArchive(stored[GRAVEYARD_KEY] as JsonValue)?.runs[0]?.run).toBe("cedar");
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

    const install = slot();
    expect(await archiveFinishedRun({ archive: install, log: () => undefined }, partial)).toBe(true);
    expect(graveyardArchiveOf((install.held() as Record<string, unknown>)[GRAVEYARD_KEY] as JsonValue).runs).toEqual([
      { run: null, ...entry },
    ]);
  });

  it("resolves - and says so - when the install slot refuses or throws", async () => {
    const logs: string[] = [];
    await expect(archiveFinishedRun({ archive: refusingSlot(), log: (m) => logs.push(m) }, report("death"))).resolves.toBe(false);
    await expect(archiveFinishedRun({ archive: throwingSlot(), log: (m) => logs.push(m) }, report("death"))).resolves.toBe(false);
    expect(logs.join(" ")).not.toBe("");
  });
});

describe("the installed warrior journal", () => {
  it("hears the arrivals, records them through the subscription, and stops listening on stop", async () => {
    const theSlot = slot();
    const install = slot();
    const bus = eventBus();
    const journal = installWarriorJournal({ slot: theSlot, archive: install, log: () => undefined, events: bus.api, stamps: stamps(1, 7) });
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

  it("writes the archive entry its graveyard() was asked for, and the character slot holds only milestones", async () => {
    const theSlot = slot();
    const install = slot();
    const bus = eventBus();
    const journal = installWarriorJournal({ slot: theSlot, archive: install, log: () => undefined, events: bus.api, stamps: stamps(1, 7) });
    await settle();
    bus.arrive(arrival(1, "change"));
    await journal.graveyard(report("death"));
    await journal.stop();

    /* The DEAD character's own slot holds the living character's milestones
     * - and nothing the next page would need, because the host deletes this
     * storage at the death (#34). */
    expect(parseJournal(theSlot.held())?.milestones.map((m) => m.depth)).toEqual([1]);
    /* The ended run is in the INSTALL archive. */
    expect(graveyardArchiveOf((install.held() as Record<string, unknown>)[GRAVEYARD_KEY] as JsonValue).runs).toEqual([
      { run: "cedar", ...graveyardEntryOf(report("death")) },
    ]);
  });

  it("keeps its graveyard working when the arrival subscription was refused", async () => {
    /* event:dungeonlevel refused by the player: no milestones, but the run
     * report still arrives on the restart loop's own grant, and the record
     * of the run that ended must not depend on the one that did not. */
    const theSlot = slot();
    const install = slot();
    const bus = eventBus({ refuse: true });
    const journal = installWarriorJournal({ slot: theSlot, archive: install, log: () => undefined, events: bus.api, stamps: stamps(1, 7) });
    await settle();
    expect(journal.listening).toBe(false);

    await journal.graveyard(report("death"));
    expect(parseJournal(theSlot.held())).toBeNull();
    expect(graveyardArchiveOf((install.held() as Record<string, unknown>)[GRAVEYARD_KEY] as JsonValue).runs).toHaveLength(1);
    await journal.stop();
  });

  it("warns once, not per arrival, when the character's slot will not take a milestone", async () => {
    const logs: string[] = [];
    const bus = eventBus();
    const journal = installWarriorJournal({ slot: refusingSlot(), archive: slot(), log: (message) => logs.push(message), events: bus.api, stamps: stamps(1, 1) });
    await settle();
    /* Two arrivals, one line: a wall of identical complaints helps nobody. */
    bus.arrive(arrival(1, "change"));
    bus.arrive(arrival(2, "change"));
    await settle();
    expect(logs.filter((line) => line.includes("depth milestones"))).toHaveLength(1);
    await journal.stop();
  });

  it("never lets a milestone write in flight lose a graveyard entry that follows", async () => {
    /* The two halves write two substrates now (#34), but the chain still
     * orders what the journal accepted: a milestone in flight when the
     * report arrives lands, and the archive write lands after it. */
    const theSlot = slot();
    const install = slot();
    const bus = eventBus();
    const journal = installWarriorJournal({ slot: theSlot, archive: install, log: () => undefined, events: bus.api, stamps: stamps(1, 7) });
    await settle();
    bus.arrive(arrival(0, "new-game"));
    bus.arrive(arrival(3, "change"));
    const written = journal.graveyard(report("death"));
    bus.arrive(arrival(1, "change"));
    await written;
    await journal.stop();

    expect(parseJournal(theSlot.held())?.milestones.map((m) => m.depth)).toEqual([0, 3, 1]);
    expect(graveyardArchiveOf((install.held() as Record<string, unknown>)[GRAVEYARD_KEY] as JsonValue).runs).toHaveLength(1);
  });

  it("still retrieves the ended run after the dead character's own storage is gone (#34's regression)", async () => {
    /* THE HOST'S DEATH ORDER, as the review verified it in the game's own
     * source: markDead removes the character's save (and detaches the slot)
     * BEFORE the run report publishes, and the reload that follows create
     * builds the next character a fresh bag. So the regression is exactly
     * death -> report -> the character's slot GONE -> a fresh read from
     * install storage still retrieves the ended run. */
    const theSlot = slot();
    const install = slot({ profileIds: ["p1"] } as JsonValue);
    const bus = eventBus();
    const journal = installWarriorJournal({ slot: theSlot, archive: install, log: () => undefined, events: bus.api, stamps: stamps(1, 7) });
    await settle();
    bus.arrive(arrival(2, "change"));
    await journal.graveyard(report("death"));
    await journal.stop();

    /* The character dies: the host deletes its save and the reload builds
     * the next character a bag that never saw this one. */
    const gone = parseJournal(null);
    expect(gone).toBeNull();
    const nextCharacterSlot = slot();

    /* The FRESH read is from the install slot alone - nothing of the dead
     * character's storage participates - and it still retrieves the run. */
    const retrieved = graveyardArchiveOf((install.held() as Record<string, unknown>)[GRAVEYARD_KEY] as JsonValue);
    expect(retrieved.runs).toEqual([{ run: "cedar", ...graveyardEntryOf(report("death")) }]);
    /* And the sibling the title row left in the shared install value
     * survived the archive write. */
    expect((install.held() as Record<string, unknown>)["profileIds"]).toEqual(["p1"]);
    expect(parseJournal(nextCharacterSlot.held())).toBeNull();
  });
});
