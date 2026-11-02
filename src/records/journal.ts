/**
 * THE JOURNAL: what the mod remembers about its own runs (T06, #9).
 *
 * Rule 1 says a behaviour change is measured by the harness before it merges,
 * and a run record is the product. This module is the IN-MOD half of that: the
 * depths a warrior reached and the runs that ended, written into the
 * CHARACTER'S OWN SAVE STORAGE (`mod.store.character`, which the host scopes
 * to the character the way `ctx.character.key()` names it - MOD_SEAMS 4m), so
 * the record travels with the character instead of dying with the page.
 *
 * THE DOCUMENTED PATTERN, followed exactly (MOD_SEAMS 4l and 4w): Angband's
 * history has no entry for reaching a new dungeon level, so a mod that wants
 * depth milestones records them itself from the `dungeonlevel` event, stored
 * under the character's key. That event fires once per level ARRIVED ON - by
 * stairs, recall, trapdoor, deep descent - and ALSO with `cause: "load"` for
 * the level a session starts on, a loaded save included, because start_game
 * runs the same arrival steps for both. The dedup rule is the one the docs
 * give: compare the arriving depth with the milestones ALREADY STORED before
 * adding one, so the load re-fire of a depth the character has visited adds
 * nothing. One milestone per depth per character, in first-arrival order.
 *
 * THE GRAVEYARD half is written at each run report, not from an event of the
 * level: one entry per run this character finished (build, max depth,
 * character level, gold, turns, cause of death, final score), appended and
 * never rewritten. The REPORTER (src/records/reporter.ts) is the harness-side
 * half that turns sessions into docs/runs/ tables; this file is what the mod
 * itself could read back on a later page.
 *
 * WHY EVERY WRITE IS READ-MODIFY-WRITE, SERIALIZED. The slot is the whole
 * journal (milestones and graveyard in one JSON value), so every append must
 * re-read what is there, merge, and write back - the same discipline the
 * birth flag's writers keep over the shared install slot (#26). Arrivals and
 * run reports can overlap (a report while a load re-fire's write is still in
 * flight), so the installed journal funnels every write through one chain and
 * no operation ever sees a half-written value.
 *
 * NEVER THROWS, NEVER REJECTS. The host calls event listeners synchronously
 * and must not receive (or swallow) a promise (the restart loop's contract
 * too); a journal that cannot write says so in the log and plays on. The one
 * await the restart loop makes of this module (`graveyard`) resolves whether
 * or not the write landed, and the entry's fields record what the report
 * carried rather than aspiring to a shape the host did not send.
 */

import type {
  Api2Events,
  Api2LevelEvent,
  Api2Slot,
  Api2Subscription,
  JsonValue,
  RunOutcome,
  RunReport,
} from "@rpgm-tools/neo-angband-mod-sdk";

/** The events domain's subscribe half, the slice this module needs. */
type Events = Pick<Api2Events, "on" | "off">;
/** The character slot's get/set half (`mod.store.character`). */
type Slot = Pick<Api2Slot, "get" | "set">;

/** The journal's format version, for a future `migrateBag` to read. */
export const JOURNAL_FORMAT = 1;

/** One depth milestone: the first arrival this character made on a depth. */
export interface DepthMilestone {
  /** The depth arrived on; 0 is the town. */
  readonly depth: number;
  /** The session's level serial at the arrival (the payload's own field). */
  readonly levelId: number;
  /** How the arrival happened: "new-game"/"load" for a session's first level, "change" after. */
  readonly cause: Api2LevelEvent["cause"];
  /** Whether the level is the single-combat arena. */
  readonly arena: boolean;
  /** The character's level at the arrival, when a cheap read carried it. */
  readonly level: number | null;
  /** The game turn at the arrival, when a cheap read carried it. */
  readonly turn: number | null;
}

/** One finished run, as the game's own run report told it. */
export interface GraveyardEntry {
  /** How the run ended: "death", "winner" or "retired". */
  readonly outcome: RunOutcome;
  /** The cause of death as the game reported it (the report's own string). */
  readonly cause: string;
  readonly name: string | null;
  readonly race: string | null;
  readonly class: string | null;
  /** The stats the character was born with (the report's birth block), when it carried them. */
  readonly baseStats: readonly number[] | null;
  readonly maxDepth: number | null;
  readonly level: number | null;
  readonly gold: number | null;
  readonly turn: number | null;
  /** The final score, where the report carries one. */
  readonly score: number | null;
}

/** What the journal holds, in the character's slot. */
export interface WarriorJournalData {
  readonly journal: typeof JOURNAL_FORMAT;
  readonly milestones: readonly DepthMilestone[];
  readonly graveyard: readonly GraveyardEntry[];
}

/** What one journal needs, each piece a slice of the mod's own context. */
export interface WarriorJournalDeps {
  /** The current character's slot in its own save (mod.store.character). */
  readonly slot: Slot;
  readonly log: (message: string) => void;
  /**
   * The event domain (mod.events): level arrivals arrive as its
   * "dungeonlevel" event, needing the manifest's `event:dungeonlevel` grant.
   */
  readonly events: Events;
  /**
   * Cheap stamps for a milestone: the character's level and the game turn at
   * the arrival. The event payload carries neither, so the plugin wires this
   * over the player read the mod already holds (`view.player().level`) and
   * the turn the world snapshot carries (`view.world().turn`); either may
   * answer null, and a milestone without stamps is still a milestone.
   */
  readonly stamps: () => Promise<{ readonly level: number | null; readonly turn: number | null }>;
}

/** A running journal. */
export interface WarriorJournal {
  /** Whether the journal is hearing level arrivals. */
  readonly listening: boolean;
  /**
   * Append this run's graveyard entry. Awaited by the restart loop BEFORE it
   * sets its birth flag or calls create, so a crash in `create` - or the page
   * teardown its success causes - cannot lose the record. Resolves whether or
   * not the write landed (never rejects); works even when the arrival
   * subscription was refused, because the report does not arrive on it.
   */
  graveyard(report: RunReport): Promise<void>;
  /** Stop listening. The character's stored journal stays as it is. */
  stop(): Promise<void>;
}

/* ==================================================================
 * The stored shape, read defensively
 * ================================================================== */

const isObject = (value: JsonValue | null): value is Record<string, JsonValue> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const numberOr = (value: JsonValue | undefined, fallback: number | null): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const numberArrayOr = (value: JsonValue | undefined): number[] | null =>
  Array.isArray(value) && value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
    ? [...value as number[]]
    : null;

/** A milestone only this module writes; every field re-checked on read. */
function milestoneOf(value: JsonValue): DepthMilestone | null {
  if (!isObject(value)) return null;
  const depth = numberOr(value["depth"], Number.NaN);
  const levelId = numberOr(value["levelId"], Number.NaN);
  const cause = value["cause"];
  if (depth === null || Number.isNaN(depth) || levelId === null || Number.isNaN(levelId)) return null;
  if (cause !== "new-game" && cause !== "load" && cause !== "change") return null;
  return {
    depth,
    levelId,
    cause,
    arena: value["arena"] === true,
    level: numberOr(value["level"], null),
    turn: numberOr(value["turn"], null),
  };
}

/** A graveyard entry only this module writes; every field re-checked on read. */
function entryOf(value: JsonValue): GraveyardEntry | null {
  if (!isObject(value)) return null;
  const outcome = value["outcome"];
  if (outcome !== "death" && outcome !== "winner" && outcome !== "retired") return null;
  const cause = value["cause"];
  if (typeof cause !== "string") return null;
  const name = value["name"];
  const race = value["race"];
  const cls = value["class"];
  return {
    outcome,
    cause,
    name: typeof name === "string" ? name : null,
    race: typeof race === "string" ? race : null,
    class: typeof cls === "string" ? cls : null,
    baseStats: numberArrayOr(value["baseStats"]),
    maxDepth: numberOr(value["maxDepth"], null),
    level: numberOr(value["level"], null),
    gold: numberOr(value["gold"], null),
    turn: numberOr(value["turn"], null),
    score: numberOr(value["score"], null),
  };
}

/**
 * The journal a slot value carries, or null when it carries no journal of
 * this format. Malformed entries are dropped rather than trusted: a value
 * this module did not write is not a record, and writing the next milestone
 * over garbage is the honest recovery.
 */
export function parseJournal(value: JsonValue | null): WarriorJournalData | null {
  if (value === null || !isObject(value) || value["journal"] !== JOURNAL_FORMAT) return null;
  const milestones = Array.isArray(value["milestones"])
    ? value["milestones"].map(milestoneOf).filter((entry): entry is DepthMilestone => entry !== null)
    : [];
  const graveyard = Array.isArray(value["graveyard"])
    ? value["graveyard"].map(entryOf).filter((entry): entry is GraveyardEntry => entry !== null)
    : [];
  return { journal: JOURNAL_FORMAT, milestones, graveyard };
}

/** The JSON this module stores for a journal. */
function storeJournal(data: WarriorJournalData): JsonValue {
  return {
    journal: JOURNAL_FORMAT,
    milestones: data.milestones.map((milestone) => ({
      depth: milestone.depth,
      levelId: milestone.levelId,
      cause: milestone.cause,
      arena: milestone.arena,
      level: milestone.level,
      turn: milestone.turn,
    })),
    graveyard: data.graveyard.map((entry) => ({
      outcome: entry.outcome,
      cause: entry.cause,
      ...(entry.name === null ? {} : { name: entry.name }),
      ...(entry.race === null ? {} : { race: entry.race }),
      ...(entry.class === null ? {} : { class: entry.class }),
      ...(entry.baseStats === null ? {} : { baseStats: [...entry.baseStats] }),
      ...(entry.maxDepth === null ? {} : { maxDepth: entry.maxDepth }),
      ...(entry.level === null ? {} : { level: entry.level }),
      ...(entry.gold === null ? {} : { gold: entry.gold }),
      ...(entry.turn === null ? {} : { turn: entry.turn }),
      ...(entry.score === null ? {} : { score: entry.score }),
    })),
  };
}

/* ==================================================================
 * The two writes, each a read-modify-write of the character's slot
 * ================================================================== */

/**
 * The slot's current journal. An EMPTY or foreign value is a journal with
 * nothing in it yet (the character slot is this journal's alone; a value that
 * is not a journal is replaced on the next write, not adopted); only a
 * refused or thrown read answers null, meaning "nothing can be kept here".
 */
async function readJournal(slot: Slot): Promise<WarriorJournalData | null> {
  let read: Awaited<ReturnType<Slot["get"]>>;
  try {
    read = await slot.get();
  } catch {
    return null;
  }
  if (!read.ok) return null;
  return parseJournal(read.value) ?? { journal: JOURNAL_FORMAT, milestones: [], graveyard: [] };
}

/**
 * Record the first arrival on a depth: THE DEDUP RULE is a comparison
 * against what is already stored - the `cause: "load"` re-fire of a depth
 * this character has visited adds nothing, exactly as MOD_SEAMS 4l and 4w
 * prescribe. Returns whether a milestone for the depth exists afterwards.
 */
export async function recordDepthMilestone(
  deps: Pick<WarriorJournalDeps, "slot" | "log" | "stamps">,
  event: Api2LevelEvent,
): Promise<boolean> {
  const current = await readJournal(deps.slot);
  if (current === null) return false;
  if (current.milestones.some((milestone) => milestone.depth === event.depth)) return true;

  let stamps: { readonly level: number | null; readonly turn: number | null } = { level: null, turn: null };
  try {
    stamps = await deps.stamps();
  } catch {
    /* A milestone without stamps is still a milestone. */
  }
  const merged: WarriorJournalData = {
    ...current,
    milestones: [
      ...current.milestones,
      {
        depth: event.depth,
        levelId: event.levelId,
        cause: event.cause,
        arena: event.arena,
        level: stamps.level,
        turn: stamps.turn,
      },
    ],
  };
  try {
    const written = await deps.slot.set(storeJournal(merged));
    if (!written.ok) {
      deps.log(`the Borg could not record reaching depth ${String(event.depth)} in this character's save (${written.message})`);
      return false;
    }
  } catch (error: unknown) {
    deps.log(`the Borg could not record reaching depth ${String(event.depth)} in this character's save (${error instanceof Error ? error.message : String(error)})`);
    return false;
  }
  return true;
}

/** The graveyard entry for a run report: what the report carried, no more. */
export function graveyardEntryOf(report: RunReport): GraveyardEntry {
  return {
    outcome: report.outcome,
    cause: report.cause,
    name: typeof report.name === "string" ? report.name : null,
    race: typeof report.race === "string" ? report.race : null,
    class: typeof report.cls === "string" ? report.cls : null,
    baseStats: Array.isArray(report.birth?.stats)
      ? report.birth.stats.filter((stat): stat is number => typeof stat === "number" && Number.isFinite(stat))
      : null,
    maxDepth: typeof report.maxDepth === "number" ? report.maxDepth : null,
    level: typeof report.level === "number" ? report.level : null,
    gold: typeof report.gold === "number" ? report.gold : null,
    turn: typeof report.turn === "number" ? report.turn : null,
    score: typeof report.score === "number" ? report.score : null,
  };
}

/**
 * Append one finished run to this character's graveyard. Append-only: the
 * entries already stored are kept verbatim and the new one goes last.
 * Returns whether the write landed.
 */
export async function appendGraveyardEntry(
  deps: Pick<WarriorJournalDeps, "slot" | "log">,
  report: RunReport,
): Promise<boolean> {
  const current = await readJournal(deps.slot);
  if (current === null) {
    deps.log("the Borg could not read this character's save, so the run that just ended is not recorded in it");
    return false;
  }
  const merged: WarriorJournalData = { ...current, graveyard: [...current.graveyard, graveyardEntryOf(report)] };
  try {
    const written = await deps.slot.set(storeJournal(merged));
    if (!written.ok) {
      deps.log(`the Borg could not record the run that just ended in this character's save (${written.message})`);
      return false;
    }
  } catch (error: unknown) {
    deps.log(`the Borg could not record the run that just ended in this character's save (${error instanceof Error ? error.message : String(error)})`);
    return false;
  }
  return true;
}

/* ==================================================================
 * The installed journal
 * ================================================================== */

/**
 * Install the journal: subscribe to level arrivals, and hand the restart
 * loop the graveyard writer it awaits ahead of its flag/create sequence.
 * Never throws; a journal that cannot subscribe says so in the log and its
 * graveyard half still works, because run reports do not arrive on the
 * arrival subscription.
 */
export function installWarriorJournal(deps: WarriorJournalDeps): WarriorJournal {
  let subscription: Api2Subscription | null = null;
  /* Every write funnels through one chain, so a milestone in flight can
   * never be overwritten by a graveyard entry (or another milestone) that
   * read the slot before it wrote. */
  let chain: Promise<void> = Promise.resolve();
  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    const run = chain.then(operation, operation);
    chain = run.catch(() => undefined);
    return run;
  };
  /** The log says each failure once: an arrival that cannot be recorded will
   * be followed by more arrivals, and a wall of identical lines helps nobody. */
  let warned = false;
  const warn = (message: string): void => {
    if (warned) return;
    warned = true;
    deps.log(message);
  };

  const subscribed: Promise<void> = deps.events
    .on("dungeonlevel", (event) => {
      /* Fire-and-forget by design: the host calls the listener synchronously
       * and must not receive (or swallow) our promise. The STAMPS, though,
       * start here - synchronously, at the arrival - because they are a fact
       * about this moment: a caller whose game does not yield between turns
       * (the headless harness drives its whole life on one synchronous
       * stack) would otherwise stamp every milestone with the turn it first
       * yielded at, and the character's level at the arrival is not the
       * character's level at the write. */
      const stamps = deps.stamps().catch(() => ({ level: null, turn: null }));
      void enqueue(() =>
        recordDepthMilestone({ slot: deps.slot, log: warn, stamps: () => stamps }, event).then((recorded) => {
          if (!recorded) warn("the Borg cannot record depth milestones in this character's save, so this run's depths will not be remembered");
        }),
      );
    })
    .then(
      (result) => {
        if (result.ok) {
          subscription = result.value;
        } else {
          deps.log(`the Borg cannot hear the levels its warrior arrives on (${result.message}), so it records no depth milestones in this character's save`);
        }
      },
      (error: unknown) => {
        deps.log(`the Borg cannot hear the levels its warrior arrives on (${error instanceof Error ? error.message : String(error)}), so it records no depth milestones in this character's save`);
      },
    );

  return {
    get listening(): boolean {
      return subscription !== null;
    },
    graveyard(report) {
      return enqueue(() => appendGraveyardEntry({ slot: deps.slot, log: deps.log }, report).then(() => undefined));
    },
    async stop() {
      await subscribed;
      const held = subscription;
      subscription = null;
      if (held !== null) await deps.events.off(held).catch(() => undefined);
      /* Writes already accepted finish before stop answers, so a reader that
       * stops the journal sees every record it took - a stop that dropped
       * queued writes on the floor would be a journal that loses records the
       * host believes it wrote. */
      await chain;
    },
  };
}
