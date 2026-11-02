/**
 * THE JOURNAL: what the mod remembers about its own runs (T06, #9; #34).
 *
 * Rule 1 says a behaviour change is measured by the harness before it merges,
 * and a run record is the product. This module is the IN-MOD half of that, and
 * since #34 it writes onto TWO substrates with different lifetimes:
 *
 *   - The depths a warrior reaches are LIVING-CHARACTER facts, written into
 *     the CHARACTER'S OWN SAVE STORAGE (`mod.store.character`, which the host
 *     scopes to the character the way `ctx.character.key()` names it -
 *     MOD_SEAMS 4m).
 *   - The runs that END are archived in the INSTALL slot
 *     (`mod.store.install`) - the same substrate the T09 lineage counter
 *     lives on (src/birth/lineage.ts), one sibling key beside the title row's
 *     profileIds and the presenter's birth flag - because the host's death
 *     order DELETES the character's save before the run report even
 *     publishes (markDead, then runReports.publish), and a graveyard written
 *     only to the character's bag was a record no later page could read: the
 *     #34 finding. The install slot survives every character, so the archive
 *     of finished runs does too.
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
 * level: one entry per finished run (build, max depth, character level, gold,
 * turns, cause of death, final score), recorded under the run key the report
 * itself carried (`report.key`) so a re-delivered report for the same run
 * re-records it rather than duplicating it. The REPORTER
 * (src/records/reporter.ts) is the harness-side half that turns sessions into
 * docs/runs/ tables; the install archive is what the mod itself can read back
 * on any later page, after the character that ended the run is gone.
 *
 * WHY EVERY WRITE IS READ-MODIFY-WRITE, SERIALIZED. The character slot holds
 * the whole milestone journal in one JSON value, and the install slot is
 * SHARED - the archive is one key beside the lineage counter, the birth flag
 * and the title row's memory - so every write must re-read what is there,
 * merge, and write back carrying every sibling forward (#26's discipline).
 * Arrivals and run reports can overlap (a report while a load re-fire's write
 * is still in flight), so the installed journal funnels every write through
 * one chain and no operation ever sees a half-written value.
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
/** A storage slot's get/set half (mod.store.character, mod.store.install). */
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

/**
 * One finished run as the INSTALL ARCHIVE stores it: the report's entry plus
 * the run key it was recorded under, so a later read can find the ended run
 * by the same key the host named it with (#34).
 */
export interface ArchivedRun extends GraveyardEntry {
  /** The run's key as the report carried it (`report.key`); null when the report carried none - an unknown run is still a run. */
  readonly run: string | null;
}

/**
 * The install-slot key that carries the graveyard archive. A SIBLING of the
 * lineage counter, the birth flag and the title row's memory in the one
 * shared install value, so the archive's writes carry them forward (#26).
 */
export const GRAVEYARD_KEY = "graveyard";

/** What the journal holds, in the character's slot: the living character's depths. */
export interface WarriorJournalData {
  readonly journal: typeof JOURNAL_FORMAT;
  readonly milestones: readonly DepthMilestone[];
}

/** What one journal needs, each piece a slice of the mod's own context. */
export interface WarriorJournalDeps {
  /**
   * The current character's slot in its own save (mod.store.character): the
   * LIVING character's depth milestones. The host deletes this storage at
   * the character's death - before the run report publishes - so nothing
   * that must survive the character may live only here (#34).
   */
  readonly slot: Slot;
  /**
   * The mod's install slot (mod.store.install): the graveyard archive's
   * home, the substrate whose lifetime survives every character - the same
   * shared value the lineage counter, the birth flag and the title row's
   * memory live in, which is why the archive's writes preserve siblings.
   */
  readonly archive: Slot;
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
   * Archive this run's graveyard entry in INSTALL storage. Awaited by the
   * restart loop BEFORE it sets its birth flag or calls create, so a crash in
   * `create` - or the page teardown its success causes - cannot lose the
   * record. Resolves whether or not the write landed (never rejects); works
   * even when the arrival subscription was refused, because the report does
   * not arrive on it.
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
  return { journal: JOURNAL_FORMAT, milestones };
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
  };
}

/** An archived run only this module writes; every field re-checked on read. */
function archivedRunOf(value: JsonValue): ArchivedRun | null {
  if (!isObject(value)) return null;
  const entry = entryOf(value);
  if (entry === null) return null;
  const run = value["run"];
  return { ...entry, run: typeof run === "string" ? run : null };
}

/**
 * The graveyard archive a value carries, or null when it carries no archive
 * of this format. Malformed runs are dropped rather than trusted - the same
 * rule parseJournal keeps over the character slot.
 */
export function parseGraveyardArchive(value: JsonValue | null): { readonly journal: typeof JOURNAL_FORMAT; readonly runs: readonly ArchivedRun[] } | null {
  if (value === null || !isObject(value) || value["journal"] !== JOURNAL_FORMAT) return null;
  const runs = Array.isArray(value["runs"])
    ? value["runs"].map(archivedRunOf).filter((run): run is ArchivedRun => run !== null)
    : [];
  return { journal: JOURNAL_FORMAT, runs };
}

/**
 * The archive a slot value carries, as a total function: a value with no
 * archive of this format reads as an EMPTY one, because the install slot is
 * shared and a foreign or garbage value under our key is replaced by the next
 * write, not adopted - readJournal's own recovery rule, on the install side.
 */
export function graveyardArchiveOf(value: JsonValue | null): { readonly journal: typeof JOURNAL_FORMAT; readonly runs: readonly ArchivedRun[] } {
  return parseGraveyardArchive(value) ?? { journal: JOURNAL_FORMAT, runs: [] };
}

/** The JSON stored for the archive, `run` included, nulls omitted as the entry does. */
function storeArchiveRun(run: ArchivedRun): JsonValue {
  const stored: Record<string, JsonValue> = storeGraveyardEntry(run) as Record<string, JsonValue>;
  if (run.run !== null) stored["run"] = run.run;
  return stored;
}

/* ==================================================================
 * The two writes: milestones into the character's slot, finished runs
 * into the install archive - each a sibling-preserving read-modify-write
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
  return parseJournal(read.value) ?? { journal: JOURNAL_FORMAT, milestones: [] };
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

/** The JSON this module stores for one graveyard entry, nulls omitted. */
function storeGraveyardEntry(entry: GraveyardEntry): JsonValue {
  return {
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
  };
}

/**
 * Record one finished run in the INSTALL archive (#34): the substrate that
 * survives the character, keyed by the run key the report carried. A report
 * whose run key matches an already-archived run RE-RECORDS that run in place
 * - a re-delivered report for the same run is the same ending, not a second
 * one - while a run the report could not name (key null) appends, because an
 * unknown run is still a run that ended. Every other key of the shared
 * install value (the lineage counter, the birth flag, the title row's
 * memory) is carried forward verbatim: #26's discipline, the same one
 * bumpLineage keeps over this slot. Returns whether the write landed.
 */
export async function archiveFinishedRun(
  deps: Pick<WarriorJournalDeps, "archive" | "log">,
  report: RunReport,
): Promise<boolean> {
  let read: Awaited<ReturnType<Slot["get"]>>;
  try {
    read = await deps.archive.get();
  } catch {
    deps.log("the Borg could not read its install storage, so the run that just ended is not archived in it");
    return false;
  }
  if (!read.ok) {
    deps.log("the Borg could not read its install storage, so the run that just ended is not archived in it");
    return false;
  }
  const base = read.value !== null && typeof read.value === "object" && !Array.isArray(read.value)
    ? (read.value as Record<string, JsonValue>)
    : {};
  const current = graveyardArchiveOf(base[GRAVEYARD_KEY] ?? null);
  const entry: ArchivedRun = { run: typeof report.key === "string" ? report.key : null, ...graveyardEntryOf(report) };
  const runs = [...current.runs];
  const at = entry.run === null ? -1 : runs.findIndex((stored) => stored.run === entry.run);
  if (at >= 0) runs[at] = entry;
  else runs.push(entry);
  try {
    const written = await deps.archive.set({ ...base, [GRAVEYARD_KEY]: { journal: JOURNAL_FORMAT, runs: runs.map(storeArchiveRun) } });
    if (!written.ok) {
      deps.log(`the Borg could not archive the run that just ended in its install storage (${written.message})`);
      return false;
    }
  } catch (error: unknown) {
    deps.log(`the Borg could not archive the run that just ended in its install storage (${error instanceof Error ? error.message : String(error)})`);
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
   * never be overwritten by another milestone that read the slot before it
   * wrote, and an archive write is ordered behind whatever the journal
   * accepted before it (#34's substrate is the install slot; the discipline
   * is the same one the birth flag's writers keep over that shared value). */
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
      /* The install archive (#34), not the character's bag: the host deletes
       * the character's save before the report publishes, so this slot is the
       * only one whose write can still be read on any later page. */
      return enqueue(() => archiveFinishedRun({ archive: deps.archive, log: deps.log }, report).then(() => undefined));
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
