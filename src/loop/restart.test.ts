/**
 * TESTS FOR THE RESTART LOOP, against fakes shaped like the host's own calls.
 *
 * The loop drives three host seams it did not make - the run-end report, the
 * keyboard-ownership question and the roster's create - so every fake here
 * answers the way the game's own source answers (packages/web/src's
 * mod-api2-host.ts and mod-context.ts): a create that is not ours to call is
 * REFUSED with a reason, a call never throws for an ordinary refusal, and the
 * run report's payload is the SDK's RunReport. The install slot is the same
 * in-memory slot presenter.test.ts uses, siblings and all, because the
 * stranded-flag hazard is exactly about those siblings.
 *
 * THE THREE GUARDS are the point of T04 and each is tested on its own:
 *
 *   1. create only from the report path, only while the keyboard is ours -
 *      the report is the ONLY thing that can make this module call create,
 *      and "not ours" never touches the slot at all.
 *   2. every create failure (refusal, throw, rejection) is contained: the
 *      listener is fire-and-forget the way the host calls it, so any escape
 *      would be an UNHANDLED REJECTION - each failure test runs under a
 *      process hook that records them and asserts the list is empty.
 *   3. the stranded-flag hazard: a create failure leaves the page alive with
 *      the flag standing, so the flag is durably CLEARED (verified by the
 *      read-back clearWarriorBirthFlag performs) before the run gives up -
 *      and when even that clear fails, the log names the consequence for a
 *      human's next birth instead of pretending the flag is gone.
 *
 * AND, FROM THE REVIEW (#29), THE RETIREMENT OF IN-FLIGHT REPORTS: stop()
 * can land while a report is parked on the host's owns question, on the
 * slot's storage, or on the create call itself. Each such report must be
 * dropped by the epoch - no flag write, no create, no claim in the log -
 * with one deliberate exception asserted below: a flag the cancelled report
 * had already written is still cleared (verified), and a create it had
 * already issued still has its failure contained, because neither hazard
 * cares what retired the loop.
 *
 * THE ORDER CONTRACT (flag set BEFORE create, exactly one flag-set per
 * create) is asserted from the slot's own contents CAPTURED AT THE MOMENT
 * CREATE RAN, not from our bookkeeping - the same trust-nothing rule the
 * harness applies to the born player.
 */

import { describe, expect, it } from "vitest";
import type {
  Api2Call,
  Api2CreateCharacter,
  Api2Events,
  Api2Slot,
  JsonValue,
  RunOutcome,
  RunReport,
} from "@rpgm-tools/neo-angband-mod-sdk";
import { BIRTH_FLAG_KEY } from "../birth/presenter.js";
import { installWarriorRestart } from "./restart.js";

/* ==================================================================
 * Fakes: the slot, the create, the keyboard question, the event bus
 * ================================================================== */

/** An install slot in memory (presenter.test.ts's), with its write journal. */
function slot(initial: JsonValue | null = null): Api2Slot & { held(): JsonValue | null; sets(): readonly unknown[] } {
  let value: JsonValue | null = initial;
  const sets: unknown[] = [];
  return {
    get: () => Promise.resolve({ ok: true as const, value }),
    set: (next) => {
      sets.push(next);
      value = next;
      return Promise.resolve({ ok: true as const, value: null });
    },
    held: () => value,
    sets: () => sets,
  };
}

/**
 * A slot that takes exactly ONE write and refuses the rest: the flag's set
 * lands, and the stranded clear's write cannot. This is the shape the loud
 * "the flag may still be set" log exists for.
 */
function oneWriteThenRefusingSlot(initial: JsonValue | null): Api2Slot & { held(): JsonValue | null } {
  let value: JsonValue | null = initial;
  let writes = 0;
  return {
    get: () => Promise.resolve({ ok: true as const, value: structuredClone(value) }),
    set: (next) => {
      writes += 1;
      if (writes > 1) {
        return Promise.resolve({ ok: false as const, reason: "refused" as const, code: "refused", message: "storage is full" });
      }
      value = next;
      return Promise.resolve({ ok: true as const, value: null });
    },
    held: () => value,
  };
}

/**
 * The host's swallowed-write failure (#25, presenter.test.ts's): set answers
 * ok and nothing persists, so only the read-back can tell the flag never
 * landed.
 */
function swallowingSlot(initial: JsonValue | null): Api2Slot & { held(): JsonValue | null } {
  let value: JsonValue | null = initial;
  return {
    get: () => Promise.resolve({ ok: true as const, value: structuredClone(value) }),
    set: () => Promise.resolve({ ok: true as const, value: null }),
    held: () => value,
  };
}

/** A slot whose every set is refused, so the flag's own write cannot land. */
function refusingSetSlot(initial: JsonValue | null): Api2Slot & { held(): JsonValue | null } {
  let value: JsonValue | null = initial;
  return {
    get: () => Promise.resolve({ ok: true as const, value: structuredClone(value) }),
    set: () => Promise.resolve({ ok: false as const, reason: "refused" as const, code: "refused", message: "storage is full" }),
    held: () => value,
  };
}

/**
 * A slot whose FIRST get parks on a gate the test releases (#29): the flag
 * write's read settles after the stop, so the WRITE itself lands post-stop,
 * and the retirement's clear is the only thing that can retire it.
 */
function parkingFirstGetSlot(initial: JsonValue | null, gate: Promise<void>): Api2Slot & { held(): JsonValue | null } {
  let value: JsonValue | null = initial;
  let gets = 0;
  return {
    get: () => {
      gets += 1;
      return gets === 1
        ? gate.then(() => ({ ok: true as const, value: structuredClone(value) }))
        : Promise.resolve({ ok: true as const, value: structuredClone(value) });
    },
    set: (next) => {
      value = next;
      return Promise.resolve({ ok: true as const, value: null });
    },
    held: () => value,
  };
}

type CreateMode = "ok" | "refused" | "throw" | "reject";

/**
 * The roster's create, recording each call - and, at the moment of each
 * call, the slot's own contents, which is how the ORDER contract is
 * asserted: if the flag was not standing when create ran, the captured
 * value says so no matter what our bookkeeping believes. With `gate`, each
 * call first parks on the gate, so a stop can land between the call and its
 * settlement (#29's deferred-create case).
 */
function createRecorder(mode: CreateMode = "ok", witness?: { held(): JsonValue | null }, gate?: Promise<void>) {
  const calls: Array<Api2CreateCharacter | undefined> = [];
  const slotAtCall: Array<JsonValue | null> = [];
  const behave = (): Api2Call<null> => {
    if (mode === "refused") {
      return Promise.resolve({ ok: false as const, reason: "refused" as const, code: "refused", message: "another mod holds the roster" });
    }
    if (mode === "throw") throw new Error("create exploded");
    if (mode === "reject") return Promise.reject(new Error("create rejected"));
    return Promise.resolve({ ok: true as const, value: null });
  };
  return {
    fn: (options?: Api2CreateCharacter): Api2Call<null> => {
      calls.push(options);
      if (witness !== undefined) slotAtCall.push(structuredClone(witness.held()));
      return gate === undefined ? behave() : gate.then(behave);
    },
    calls: () => calls,
    slotAtCall: () => slotAtCall,
  };
}

type OwnsAnswer = { readonly ok: true; readonly value: boolean } | { readonly ok: false; readonly reason: "unavailable"; readonly message: string } | { readonly throws: Error };

/** The keyboard-ownership question, answering what one test wants. */
function owns(answer: OwnsAnswer): () => Api2Call<boolean> {
  return () => {
    if ("throws" in answer) return Promise.reject(answer.throws);
    if (answer.ok) return Promise.resolve({ ok: true as const, value: answer.value });
    return Promise.resolve({ ok: false as const, reason: answer.reason, message: answer.message });
  };
}

/** The event bus: what the host's events domain does for run-end. */
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
        /* Deliberately NOT removing the listener: this models the host that
         * kept a stale one after off, so the stop test proves the loop's own
         * retired guard, not the fake's bookkeeping. */
        return Promise.resolve({ ok: true as const, value: null });
      },
    } as unknown as Pick<Api2Events, "on" | "off">,
    /** Deliver a run report the way the host does: synchronously, keeping the listener's promise. */
    report: (payload: unknown): void => {
      listeners.get("run-end")?.(payload as never);
    },
    heard: () => listeners.has("run-end"),
    offs: () => offs,
  };
}

/** A run report in the SDK's own shape. */
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

interface Fixture {
  readonly restart: ReturnType<typeof installWarriorRestart>;
  readonly logs: () => readonly string[];
  readonly held: () => JsonValue | null;
  readonly created: () => ReadonlyArray<Api2CreateCharacter | undefined>;
  readonly slotAtCreate: () => ReadonlyArray<JsonValue | null>;
  readonly bus: ReturnType<typeof eventBus>;
}

/** Install the loop over the given pieces, defaults being the happy path. */
async function installed(options: {
  readonly slot?: Api2Slot & { held(): JsonValue | null };
  readonly owns?: () => Api2Call<boolean>;
  readonly create?: ReturnType<typeof createRecorder> | null;
  readonly events?: ReturnType<typeof eventBus>;
  /** FORK: T06 - the graveyard writer the loop awaits ahead of its flag/create sequence. */
  readonly graveyard?: (report: RunReport) => Promise<void>;
} = {}): Promise<Fixture> {
  const logs: string[] = [];
  const theSlot = options.slot ?? slot({ profileIds: ["p1"] });
  const recorder = options.create === undefined ? createRecorder("ok", theSlot) : options.create;
  const bus = options.events ?? eventBus();
  const restart = installWarriorRestart({
    slot: theSlot,
    log: (message) => logs.push(message),
    ownsKeyboard: options.owns ?? owns({ ok: true, value: true }),
    create: recorder === null ? null : recorder.fn,
    events: bus.api,
    ...(options.graveyard === undefined ? {} : { graveyard: options.graveyard }),
  });
  await settle();
  return {
    restart,
    logs: () => logs,
    held: theSlot.held,
    created: recorder === null ? () => [] : recorder.calls,
    slotAtCreate: recorder === null ? () => [] : recorder.slotAtCall,
    bus,
  };
}

/** Let the loop's chained awaits run out. */
async function settle(ticks = 64): Promise<void> {
  for (let i = 0; i < ticks; i++) await Promise.resolve();
}

/** Run something while recording every unhandled rejection the process sees. */
async function unhandledRejections(run: () => void): Promise<string[]> {
  const seen: string[] = [];
  const listener = (reason: unknown): void => {
    seen.push(reason instanceof Error ? reason.message : String(reason));
  };
  process.on("unhandledRejection", listener);
  try {
    run();
    await settle();
    /* A rejection nobody handles is reported on a later tick; give it one. */
    await new Promise<void>((resolve) => setImmediate(resolve));
  } finally {
    process.off("unhandledRejection", listener);
  }
  return seen;
}

describe("the warrior restart loop", () => {
  it("restarts a dead warrior it was driving: the flag set before exactly one resumed create", async () => {
    const f = await installed();
    /* The install itself starts nothing. */
    expect(f.created()).toEqual([]);
    expect(f.bus.heard()).toBe(true);

    const seen = await unhandledRejections(() => f.bus.report({ key: "cedar", report: report("death") }));
    expect(seen).toEqual([]);

    /* Exactly one create, with resumeAutoplayer and NOTHING else - `like`
     * would override the presenter's plan with the dead roller's stats. */
    expect(f.created()).toEqual([{ resumeAutoplayer: true }]);

    /* The ORDER contract, read from the slot at the moment create ran: the
     * flag was standing and the sibling key survived the flag's write. */
    const atCreate = f.slotAtCreate()[0] as Record<string, unknown> | null;
    expect(atCreate?.[BIRTH_FLAG_KEY]).toBe(true);
    expect(atCreate?.["profileIds"]).toEqual(["p1"]);

    /* A create that answered ok means the page is going away; this page
     * leaves the flag standing for the presenter to consume on the next one. */
    expect((f.held() as Record<string, unknown>)[BIRTH_FLAG_KEY]).toBe(true);
    expect(f.logs().join(" ")).toContain("the Borg is starting the next one");
  });

  it("starts nothing, and touches no flag, when the keyboard is not ours", async () => {
    for (const answer of [
      owns({ ok: true, value: false }),
      owns({ ok: false, reason: "unavailable", message: "no controller installed" }),
      owns({ throws: new Error("the controller question exploded") }),
    ]) {
      const f = await installed({ owns: answer });
      const seen = await unhandledRejections(() => f.bus.report({ key: "cedar", report: report("death") }));
      expect(seen).toEqual([]);
      expect(f.created()).toEqual([]);
      expect(f.held()).toEqual({ profileIds: ["p1"] });
    }
    const refused = await installed({ owns: owns({ ok: false, reason: "unavailable", message: "no controller installed" }) });
    await unhandledRejections(() => refused.bus.report({ key: "cedar", report: report("death") }));
    expect(refused.logs().join(" ")).toContain("could not ask who holds the keyboard");

    const notOurs = await installed({ owns: owns({ ok: true, value: false }) });
    await unhandledRejections(() => notOurs.bus.report({ key: "cedar", report: report("death") }));
    expect(notOurs.logs().join(" ")).toContain("was not the one holding the keyboard");
  });

  for (const mode of ["refused", "throw", "reject"] as const) {
    it(`contains a create ${mode === "refused" ? "refusal" : mode === "throw" ? "throw" : "rejection"}: no unhandled rejection, flag durably cleared, loud log`, async () => {
      const theSlot = slot({ profileIds: ["p1"] });
      const f = await installed({ slot: theSlot, create: createRecorder(mode, theSlot) });

      const seen = await unhandledRejections(() => f.bus.report({ key: "cedar", report: report("death") }));
      expect(seen, `a ${mode} create must not escape as an unhandled rejection`).toEqual([]);

      /* One attempt was made, and then the run ENDS - no loop, no retry. */
      expect(f.created()).toHaveLength(1);
      await unhandledRejections(() => f.bus.report({ key: "cedar", report: report("death") }));
      expect(f.created()).toHaveLength(1);

      /* The stranded flag is gone and the sibling survived the clear. */
      expect(f.held()).toEqual({ profileIds: ["p1"] });
      const said = f.logs().join(" ");
      expect(said).toContain("could not start the next warrior");
      expect(said).toContain("cleared");
    });
  }

  it("names a stranded flag it cannot clear, instead of pretending it is gone", async () => {
    /* The flag's write is the one write this slot takes; the clear's write
     * is refused, so the flag stays standing with the page alive. */
    const f = await installed({ slot: oneWriteThenRefusingSlot({ profileIds: ["p1"] }), create: createRecorder("refused") });

    const seen = await unhandledRejections(() => f.bus.report({ key: "cedar", report: report("death") }));
    expect(seen).toEqual([]);

    expect((f.held() as Record<string, unknown>)[BIRTH_FLAG_KEY]).toBe(true);
    const said = f.logs().join(" ");
    expect(said).toContain("could not durably clear its birth flag");
    expect(said).toContain("a human's birth could be taken");
  });

  it("does not reload into a flag that did not durably land", async () => {
    /* set() answers ok and stores nothing: only the read-back can tell. */
    const swallowed = await installed({ slot: swallowingSlot({ profileIds: ["p1"] }) });
    await unhandledRejections(() => swallowed.bus.report({ key: "cedar", report: report("death") }));
    expect(swallowed.created()).toEqual([]);
    expect(swallowed.logs().join(" ")).toContain("would not verify after being written");

    /* And a set that is refused outright never strands anything either. */
    const refused = await installed({ slot: refusingSetSlot({ profileIds: ["p1"] }), create: createRecorder("ok") });
    await unhandledRejections(() => refused.bus.report({ key: "cedar", report: report("death") }));
    expect(refused.created()).toEqual([]);
    expect(refused.held()).toEqual({ profileIds: ["p1"] });
    expect(refused.logs().join(" ")).toContain("write was refused");
  });

  it("ends the session on victory and retirement without starting anything", async () => {
    for (const [outcome, endedAs] of [["winner", "victory"], ["retired", "retirement"]] as const) {
      const f = await installed();
      await unhandledRejections(() => f.bus.report({ key: "cedar", report: report(outcome) }));
      expect(f.created()).toEqual([]);
      expect(f.held()).toEqual({ profileIds: ["p1"] });
      const said = f.logs().join(" ");
      expect(said).toContain(`ended in ${endedAs}`);
      expect(said).toContain("the session ends here");
    }
  });

  it("does not restart a run whose report it cannot read", async () => {
    const f = await installed();
    await unhandledRejections(() => f.bus.report({ key: "cedar", report: null }));
    expect(f.created()).toEqual([]);
    expect(f.held()).toEqual({ profileIds: ["p1"] });
    expect(f.logs().join(" ")).toContain("would not say how");
  });

  it("restarts at most one warrior per page", async () => {
    const f = await installed();
    await unhandledRejections(() => f.bus.report({ key: "cedar", report: report("death") }));
    await unhandledRejections(() => f.bus.report({ key: "cedar", report: report("death") }));
    expect(f.created()).toHaveLength(1);
    expect(f.logs().join(" ")).toContain("ignores this one");
  });

  it("stops listening when the mod stops, and stays stopped", async () => {
    const f = await installed();
    expect(f.restart.listening).toBe(true);
    await f.restart.stop();
    expect(f.bus.offs()).toEqual(["run-end"]);
    expect(f.restart.listening).toBe(false);
    await f.restart.stop();
    expect(f.bus.offs()).toEqual(["run-end"]);
    /* A report after the stop reaches no listener and starts nothing. */
    f.bus.report({ key: "cedar", report: report("death") });
    await settle();
    expect(f.created()).toEqual([]);
  });

  it("drops a report still parked on the keyboard question when the loop stops", async () => {
    /* #29's first shape: owns() is a host call that has not answered yet
     * when stop() runs. The epoch must retire the continuation when the
     * answer arrives - no flag write, no create, no claim in the log. */
    let releaseOwns!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseOwns = resolve;
    });
    const theSlot = slot({ profileIds: ["p1"] });
    const deferredOwns = (): Api2Call<boolean> => gate.then(() => ({ ok: true as const, value: true }));
    const f = await installed({ slot: theSlot, owns: deferredOwns, create: createRecorder("ok", theSlot) });

    f.bus.report({ key: "cedar", report: report("death") });
    await settle(8); /* the report is parked inside the owns question */
    await f.restart.stop();
    expect(f.created()).toEqual([]);

    const seen = await unhandledRejections(() => {
      releaseOwns();
    });
    expect(seen).toEqual([]);
    expect(f.created()).toEqual([]);
    expect(f.held()).toEqual({ profileIds: ["p1"] });
    const said = f.logs().join(" ");
    expect(said).toContain("report is dropped");
    expect(said).not.toContain("starting the next one");
    expect(said).not.toContain("could not start the next warrior");
  });

  it("clears a flag a cancelled report had just managed to write", async () => {
    /* #29's storage shape: the stop lands while the flag write's READ is
     * parked, so the WRITE itself happens after the loop is gone. The
     * retirement must still retire the flag - a standing flag beside a live
     * page strands whoever starts the next birth, whatever retired the
     * loop. */
    let releaseRead!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const theSlot = parkingFirstGetSlot({ profileIds: ["p1"] }, gate);
    const f = await installed({ slot: theSlot, create: createRecorder("ok", theSlot) });

    f.bus.report({ key: "cedar", report: report("death") });
    await settle(8); /* parked on the flag write's read */
    await f.restart.stop();

    const seen = await unhandledRejections(() => {
      releaseRead(); /* the write lands AFTER the stop */
    });
    expect(seen).toEqual([]);
    expect(f.created()).toEqual([]);
    expect(f.held()).toEqual({ profileIds: ["p1"] });
    const said = f.logs().join(" ");
    expect(said).toContain("flag was cleared and no next warrior is started");
    expect(said).not.toContain("starting the next one");
  });

  it("still contains a create whose refusal arrives after the loop stopped", async () => {
    /* #29's deferred-create shape: the create was ISSUED by the live loop,
     * and its refusal lands after the stop. The call cannot be unmade, so
     * its failure still gets the live containment: the standing flag is
     * cleared and the run ends. */
    let releaseCreate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    const theSlot = slot({ profileIds: ["p1"] });
    const f = await installed({ slot: theSlot, create: createRecorder("refused", theSlot, gate) });

    f.bus.report({ key: "cedar", report: report("death") });
    await settle(8); /* the flag is written and verified; create is parked */
    expect((f.held() as Record<string, unknown>)[BIRTH_FLAG_KEY]).toBe(true);
    await f.restart.stop();

    const seen = await unhandledRejections(() => {
      releaseCreate(); /* the refusal lands after the stop */
    });
    expect(seen).toEqual([]);
    expect(f.created()).toHaveLength(1);
    expect(f.held()).toEqual({ profileIds: ["p1"] });
    expect(f.logs().join(" ")).toContain("could not start the next warrior");
  });

  it("lets a create that already succeeded stand when the loop stops mid-flight", async () => {
    /* The other deferred-create outcome: create answered ok, so the page is
     * going away regardless of the stop - the next page's presenter
     * consumes the flag, and there is nothing to undo here. */
    let releaseCreate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    const theSlot = slot({ profileIds: ["p1"] });
    const f = await installed({ slot: theSlot, create: createRecorder("ok", theSlot, gate) });

    f.bus.report({ key: "cedar", report: report("death") });
    await settle(8);
    await f.restart.stop();

    const seen = await unhandledRejections(() => {
      releaseCreate();
    });
    expect(seen).toEqual([]);
    expect(f.created()).toEqual([{ resumeAutoplayer: true }]);
    expect((f.held() as Record<string, unknown>)[BIRTH_FLAG_KEY]).toBe(true);
  });

  it("runs out loud, and ends at the death, when the game gives no creation seam", async () => {
    const f = await installed({ create: null });
    expect(f.logs().join(" ")).toContain("no character-creation seam");
    await unhandledRejections(() => f.bus.report({ key: "cedar", report: report("death") }));
    expect(f.created()).toEqual([]);
    /* The death path returns BEFORE the flag is set: nothing to strand. */
    expect(f.held()).toEqual({ profileIds: ["p1"] });
  });

  it("says so when it cannot hear how its runs end", async () => {
    const f = await installed({ events: eventBus({ refuse: true }) });
    expect(f.restart.listening).toBe(false);
    expect(f.logs().join(" ")).toContain("cannot hear how its runs end");
  });

  /* ------------------------------------------------------------------
   * FORK: T06 (#9) - the graveyard writer the report path awaits
   * ------------------------------------------------------------------ */

  it("writes the graveyard entry before the flag and the create, and restarts anyway when the writer fails", async () => {
    /* THE ORDER the task pins: journal, then flag, then create - read from
     * what happened, not from what anyone promised. The recorder's own
     * slot-at-call witness already proves flag-before-create; this adds the
     * graveyard call ahead of both. */
    const calls: string[] = [];
    const theSlot = slot({ profileIds: ["p1"] });
    const recorder = createRecorder("ok", theSlot);
    const recording = await installed({
      slot: theSlot,
      create: recorder,
      graveyard: async (theReport) => {
        calls.push(`graveyard:${theReport.outcome}:${theReport.cause}`);
      },
    });
    await unhandledRejections(() => recording.bus.report({ key: "cedar", report: report("death") }));
    expect(calls).toEqual(["graveyard:death:a novice mage"]);
    expect(recorder.calls()).toEqual([{ resumeAutoplayer: true }]);
    expect((recorder.slotAtCall()[0] as Record<string, unknown>)["warriorBirth"]).toBe(true);

    /* A writer that THROWS is contained: the run still restarts, nothing
     * escapes, and the log says the record could not be kept. */
    const broken = await installed({
      graveyard: () => Promise.reject(new Error("the save is on fire")),
    });
    const seen = await unhandledRejections(() => broken.bus.report({ key: "cedar", report: report("death") }));
    expect(seen).toEqual([]);
    expect(broken.created()).toEqual([{ resumeAutoplayer: true }]);
    expect(broken.logs().join(" ")).toContain("could not record the run that just ended");
  });

  it("writes the graveyard entry for a victory and a retirement too, and still ends the session", async () => {
    for (const outcome of ["winner", "retired"] as const) {
      const calls: string[] = [];
      const f = await installed({ graveyard: async (theReport) => { calls.push(theReport.outcome); } });
      await unhandledRejections(() => f.bus.report({ key: "cedar", report: report(outcome) }));
      expect(calls).toEqual([outcome]);
      expect(f.created()).toEqual([]);
      expect(f.held()).toEqual({ profileIds: ["p1"] });
    }
  });

  it("writes no graveyard entry for a report it cannot read, and none twice on one page", async () => {
    /* A report with no body consumes the page's one-report budget (the spent
     * latch is ahead of the null check), so it records nothing - and a page
     * that already used its report records no second entry either. */
    const unreadable: string[] = [];
    const blank = await installed({ graveyard: async (theReport) => { unreadable.push(theReport.outcome); } });
    await unhandledRejections(() => blank.bus.report({ key: "cedar", report: null }));
    await unhandledRejections(() => blank.bus.report({ key: "cedar", report: report("death") }));
    expect(unreadable).toEqual([]);
    expect(blank.created()).toEqual([]);

    const calls: string[] = [];
    const f = await installed({ graveyard: async (theReport) => { calls.push(theReport.outcome); } });
    await unhandledRejections(() => f.bus.report({ key: "cedar", report: report("death") }));
    await unhandledRejections(() => f.bus.report({ key: "cedar", report: report("death") }));
    expect(calls).toEqual(["death"]);
    expect(f.created()).toHaveLength(1);
  });

  it("drops a report that was still writing its graveyard entry when the loop stopped", async () => {
    /* #29's newest shape: the stop lands while the graveyard write is parked.
     * The epoch must retire the continuation - no flag write, no create, no
     * claim in the log - exactly as it does at every other await. */
    let releaseWrite!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const theSlot = slot({ profileIds: ["p1"] });
    const f = await installed({
      slot: theSlot,
      create: createRecorder("ok", theSlot),
      graveyard: () => gate,
    });

    f.bus.report({ key: "cedar", report: report("death") });
    await settle(8); /* the report is parked inside the graveyard write */
    await f.restart.stop();
    expect(f.created()).toEqual([]);

    const seen = await unhandledRejections(() => {
      releaseWrite();
    });
    expect(seen).toEqual([]);
    expect(f.created()).toEqual([]);
    expect(f.held()).toEqual({ profileIds: ["p1"] });
    const said = f.logs().join(" ");
    expect(said).toContain("report is dropped");
    expect(said).not.toContain("starting the next one");
    expect(said).not.toContain("could not start the next warrior");
  });
});
