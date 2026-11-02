/**
 * THE RESTART LOOP: every death, the same warrior again (T04, #7).
 *
 * WHAT THIS REPLACES. Upstream's host reincarnates an autoplayer itself:
 * `onDeath` defaults to "reincarnate", which starts the next character in
 * place with a RANDOM race and class and roller stats - precisely what this
 * fork exists not to do. So plugin.ts installs this mod's controller with
 * `onDeath: "end"` instead: the ordinary death flow runs (tombstone, score
 * entry, run report), and what happens NEXT becomes this loop's business.
 *
 * THE WHOLE LOOP, AS A PROTOCOL, leg by leg:
 *
 *   death -> onRunEnd -> flag -> create -> reload -> presenter -> armed
 *   controller -> (play) -> death -> ...
 *
 *   1. The character dies while our controller holds the keyboard; the host
 *      runs the ordinary death flow and keeps the controller installed until
 *      the page reloads (`onDeath: "end"`, MOD_SEAMS 4q).
 *   2. The host delivers the run report exactly once, after the score table
 *      is written and before the tombstone. API 2 surfaces it as the
 *      "run-end" event (MOD_SEAMS 4w calls the same seam
 *      `ctx.character.onRunEnd`); this module subscribes at install and owns
 *      the subscription until the mod stops.
 *   3. On a report that says DEATH - and only then - and only while our
 *      controller still holds the keyboard: set T03's one-shot birth flag in
 *      the install slot (setWarriorBirthFlag). The flag is set BEFORE create,
 *      exactly once per create attempt - one birth per reload is the contract
 *      the presenter's arming and this loop's `spent` latch both enforce.
 *   4. Call `create({ resumeAutoplayer: true })` (MOD_SEAMS 4x). NEVER with
 *      `like`: the presenter plans the birth, and `like`'s copy of the dead
 *      character's rolled stats would override the plan.
 *   5. The host reloads the page into character creation with our controller
 *      armed on the result and the character marked autoplayed.
 *   6. The T03 presenter's prepare durably consumes the flag (verified by its
 *      own read-back) and births the planned warrior through the game's own
 *      point-buy.
 *   7. The armed controller takes the keyboard without a prompt; plugin.ts's
 *      start runs again on the new page, this loop re-installs, and the chain
 *      continues unattended.
 *
 * EVERY FAILURE MODE, AND WHERE IT LANDS:
 *
 *   - A report still in flight when the loop is stopped (#29): retired by
 *     EPOCH. stop() invalidates synchronously - `stopped` for anything that
 *     enters afterwards, a bumped generation counter for every report the
 *     loop was already running. Each report captures the counter at entry
 *     and re-checks it after every await, before its next side effect: no
 *     flag write, no create, no claim in the log. The ONE deliberate
 *     exception is cleanup: a flag a cancelled report HAD WRITTEN - or had
 *     asked to write without its read-back ever completing (#35: a failed
 *     verification cannot prove the write did not land, and a slot's
 *     refusal is not proof of absence either) - is still durably cleared,
 *     with a loud honest warning kept when even the clear will not verify,
 *     because a standing flag beside a live page is the stranded-flag
 *     hazard whatever retired the loop - and a create
 *     that was already issued still has its OUTCOME handled (ok means the
 *     page is going away; a failure still clears the flag), because
 *     undoing a birth is not an option and abandoning the flag is worse.
 *     A report that was not going to restart anyway (victory, a keyboard
 *     not ours) needs no such care: its continuations only ever read.
 *
 *   - A report that is not a death ("winner" / "retired"): the session ENDS.
 *     Logged, no create. DEFAULT, OWNER-FLIPPABLE: a victorious or retired
 *     warrior starting the next one would bury the one event a human must
 *      see; an owner who wants the loop to roll on regardless flips the
 *     outcome check below.
 *   - A report with no report body (this front end delivers the payload only
 *     to its own mods): the loop cannot VERIFY a death, so it restarts
 *     nothing and says so loudly. Failing closed here is the same choice as
 *     the presenter's: a victory must not be buried under a restart.
 *   - The keyboard question refused, thrown, or answered "not ours" (a human
 *     was playing, or another autoplayer holds it): nothing is started, no
 *     flag is touched. `create` would be the host's refusal anyway (it is
 *     refused unless our controller holds the keyboard at that moment), so
 *     this guard refuses first, cheaply and loggably.
 *   - The flag would not durably land (the slot refused the write, or the
 *     read-back cannot see it - a slot answers ok to a swallowed write, #25):
 *     NO create. Nothing reloads, nothing is stranded; the loop stalls
 *     visibly with a loud log.
 *   - `create` refused, thrown, or rejected: contained inside this module -
 *     the listener never rejects, so nothing escapes as an unhandled
 *     rejection into the host. THE STRANDED-FLAG HAZARD: the flag was set in
 *     step 3, but the page does NOT reload, so the standing flag would take
 *     the NEXT birth on any LATER reload - a human's - as the presenter's
 *     own. So on every create failure the flag is durably cleared
 *     (clearWarriorBirthFlag: read-modify-write, then read back to verify,
 *     the presenter's own standard). If even the clear will not verify, the
 *     log says the flag may still be set and names the consequence; the
 *     presenter's prepare remains the last line (it re-verifies, consumes or
 *     declines loudly, and takes at most one birth).
 *   - `create` answers ok: the page is going away. The presenter consumes
 *     the flag on the next page; there is nothing to undo here.
 *   - A second run report on the same page: ignored (`spent`). One restart
 *     per reload; the host owes one report per page.
 *   - The host gives no roster seam at all (`manage.saves` absent - a
 *     third-party install of this mod, or the event grant refused): the loop
 *     logs at install and the run simply ends at its death.
 *
 * Rule 4: no wall clock, no network, no engine reads - the loop is pure
 * orchestration over the host's own calls, and the decision code never sees
 * it.
 */

import type {
  Api2Call,
  Api2CreateCharacter,
  Api2Events,
  Api2RunEndEvent,
  Api2Slot,
  Api2Subscription,
  RunReport,
} from "@rpgm-tools/neo-angband-mod-sdk";
import { BIRTH_FLAG_KEY, clearWarriorBirthFlag, setWarriorBirthFlag } from "../birth/presenter.js";

/** The install slot's get/set half, the same slice the presenter consumes under. */
type Slot = Pick<Api2Slot, "get" | "set">;

/** What the restart loop needs, each piece a slice of ModApi2 plugin.ts hands in. */
export interface WarriorRestartDeps {
  /** The mod's install slot (mod.store.install): the birth flag's home. */
  readonly slot: Slot;
  /** The mod's log (mod.meta.log). */
  readonly log: (message: string) => void;
  /**
   * Whether THIS mod's controller holds the keyboard right now
   * (mod.act.controller.owns). Asked live at the report, never assumed from
   * the install: create is refused unless the keyboard is ours at that
   * moment, and the cheap refusal is the one that leaves a log line.
   */
  readonly ownsKeyboard: () => Api2Call<boolean>;
  /**
   * The host's character-creation call (mod.manage?.saves.create), or null
   * when this game gives the mod no roster seam - a third-party install.
   */
  readonly create: ((options?: Api2CreateCharacter) => Api2Call<null>) | null;
  /**
   * The event domain (mod.events): the run report arrives as its "run-end"
   * event, needing the manifest's `event:run-end` grant.
   */
  readonly events: Pick<Api2Events, "on" | "off">;
  /**
   * FORK: T06 (#9) - the graveyard writer, the journal's record of the run
   * that just ended. Awaited at the head of the report path - before the
   * outcome checks, before the flag, before create - so the record lands
   * before anything that could tear the page down, a crash in `create`
   * included. Optional because the loop is older than the journal: without
   * it the report path is exactly what T04 shipped. The writer itself never
   * rejects (src/records/journal.ts), and a refusal or throw here is
   * contained the same way a create failure is: the run still restarts, and
   * the log says the record could not be kept.
   */
  readonly graveyard?: (report: RunReport) => Promise<void>;
}

/** A running restart loop. */
export interface WarriorRestart {
  /** Whether the loop is listening for run reports. */
  readonly listening: boolean;
  /**
   * Stop listening. The host tears its mods down before the reload anyway;
   * this is for a mod stop that keeps the page (the headless runner's
   * re-registration, and plugin.ts's own stop).
   */
  stop(): Promise<void>;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Whether the flag is standing in the slot right now. The presenter owns the shape; this reads it. */
async function flagIsDurable(slot: Slot): Promise<boolean> {
  try {
    const read = await slot.get();
    if (!read.ok) return false;
    const value = read.value;
    return value !== null && typeof value === "object" && !Array.isArray(value) &&
      (value as Record<string, unknown>)[BIRTH_FLAG_KEY] === true;
  } catch {
    return false;
  }
}

/**
 * Install the loop. Subscribes at once; every decision happens later, inside
 * the report. Never throws and never rejects: a loop that cannot arm says so
 * in the log and leaves the run to end at its death.
 */
export function installWarriorRestart(deps: WarriorRestartDeps): WarriorRestart {
  let subscription: Api2Subscription | null = null;
  /* One restart per page: the report arrives once, and one birth per reload
   * is the contract the presenter's one-shot arming already carries. */
  let spent = false;
  /* THE RETIREMENT EPOCH (#29). `stopped` turns away anything that enters
   * after the stop; the counter invalidates everything already inside. Each
   * report captures it at entry and re-checks after every await, before the
   * next side effect - see the header's failure-mode list. */
  let stopped = false;
  let epoch = 0;

  /* The flag is standing but the page is NOT going away: clear it, verified,
   * and say what happened at full volume either way. */
  const stranded = async (why: string): Promise<void> => {
    const cleared = await clearWarriorBirthFlag(deps.slot);
    if (cleared) {
      deps.log(
        `the Borg could not start the next warrior (${why}); the birth flag was cleared and this run ends here rather than loop`,
      );
      return;
    }
    deps.log(
      `the Borg could not start the next warrior (${why}) AND could not durably clear its birth flag: ` +
        `the flag may still be set, and the next character created after any later reload would be born as the Borg's ` +
        `planned warrior. The presenter still consumes-or-declines it on that page, but a human's birth could be taken ` +
        `once - clear the mod's install storage before letting anyone create a character here`,
    );
  };

  /** The report path: the only place create is ever called from. */
  const onReport = async (event: Api2RunEndEvent): Promise<void> => {
    if (stopped) return;
    /* This report's epoch: valid only while the loop that received it is
     * still the live one. Every continuation after an await re-checks it
     * BEFORE its next side effect (#29). */
    const mine = epoch;
    const retired = (): boolean => stopped || mine !== epoch;
    const dropped = (where: string): void => {
      deps.log(`the Borg's restart loop was retired while a run report was still in flight (${where}), so the report is dropped`);
    };
    /** Retire a flag a cancelled report may have written, and say which way
     * it landed. Cleanup, deliberately not epoch-gated: a standing flag
     * beside a live page is the stranded-flag hazard whatever retired the
     * loop. Called whenever the report reached the flag step at all (#35) -
     * the clear's own read-back is the only proof of whether the write ever
     * landed, and it says so truthfully in either direction. */
    const retireWrittenFlag = async (): Promise<void> => {
      const cleared = await clearWarriorBirthFlag(deps.slot);
      if (cleared) {
        deps.log(
          "the Borg's restart loop was retired while a report's birth flag was written or still unproven; " +
            "the flag was cleared and no next warrior is started",
        );
        return;
      }
      deps.log(
        "the Borg's restart loop was retired after a report had written - or may have written - the birth flag, AND the flag could not be durably cleared: " +
          "the flag may still be set, and the next character created after any later reload would be born as the Borg's " +
          "planned warrior. The presenter still consumes-or-declines it on that page, but a human's birth could be taken " +
          "once - clear the mod's install storage before letting anyone create a character here",
      );
    };
    if (spent) {
      deps.log("a second run report reached the Borg on this page; it restarts at most one warrior per reload, so it ignores this one");
      return;
    }
    spent = true;

    /* The host hands the report only to its own mods on some front ends; a
     * loop that cannot verify a death restarts nothing (see the header). */
    const report = event.report;
    if (report === null) {
      deps.log(
        "the Borg's run ended but this game would not say how (no run report), so it starts no next warrior: " +
          "a victory or retirement must not be buried under a restart",
      );
      return;
    }

    /* FORK: T06 (#9) - the graveyard entry FIRST, whatever the outcome turns
     * out to be: victory and retirement are runs the journal owes a record of
     * exactly as much as a death is, and the report that just arrived is the
     * only moment the game is telling us how it ended. This await sits ahead
     * of the flag and the create on purpose (a record written after create
     * races the page teardown and can be lost to it); a journal that cannot
     * write says so itself and never blocks the restart, and a throw here is
     * contained like every other seam's. */
    if (deps.graveyard !== undefined) {
      try {
        await deps.graveyard(report);
      } catch (error: unknown) {
        deps.log(`the Borg could not record the run that just ended (${messageOf(error)}), so it restarts without a journal entry`);
      }
      if (retired()) return dropped("it was still recording the run that ended");
    }

    const diedAt = `on depth ${String(report.maxDepth)} at turn ${String(report.turn)} (${report.cause})`;

    /* DEFAULT, OWNER-FLIPPABLE: victory and retirement END the session. */
    if (report.outcome !== "death") {
      const endedAs = report.outcome === "winner" ? "victory" : "retirement";
      deps.log(
        `the Borg's run ended in ${endedAs} ${diedAt}; the session ends here - no next warrior is started ` +
          "(an owner who wants the loop to roll on past a victory flips this check in src/loop/restart.ts)",
      );
      return;
    }

    /* Guard 1: only while OUR controller holds the keyboard, asked live. */
    let holds = false;
    try {
      const owned = await deps.ownsKeyboard();
      if (retired()) return dropped("it was still asking who holds the keyboard");
      holds = owned.ok && owned.value === true;
      if (!owned.ok) {
        deps.log(`the Borg could not ask who holds the keyboard (${owned.message}), so it starts no next warrior`);
      }
    } catch (error: unknown) {
      if (retired()) return dropped("its keyboard question had thrown");
      deps.log(`the Borg could not ask who holds the keyboard (${messageOf(error)}), so it starts no next warrior`);
    }
    if (!holds) {
      deps.log(`the Borg's warrior died ${diedAt}, but the Borg was not the one holding the keyboard, so it starts nothing`);
      return;
    }

    if (deps.create === null) {
      deps.log(`the Borg's warrior died ${diedAt}, but this game gives it no character-creation seam, so the run ends here`);
      return;
    }

    /* The flag, BEFORE create, exactly once - and only behind a read-back:
     * a slot answers ok to a write it swallowed (#25), and reloading into a
     * flag that is not there births nothing at all. Both slot reads here are
     * reads; the writes they precede are what the epoch check below gates. */
    const written = await setWarriorBirthFlag(deps.slot);
    const standing = written && (await flagIsDurable(deps.slot));
    if (retired()) {
      /* The stop may have landed anywhere inside the flag work - between
       * the write and this line included - so VERIFIED cleanup runs
       * whenever the flag step was reached at all (#35): `standing ===
       * false` means the read-back failed, NOT that the write did not land,
       * and a slot's refusal is not proof of absence either (#25's lesson,
       * in mirror). A flag a retired report may have written strands
       * exactly like any other, and only the clear's own read-back can
       * prove which way it landed. */
      await retireWrittenFlag();
      return;
    }
    if (!standing) {
      await stranded(written ? "the birth flag would not verify after being written" : "the birth flag's write was refused");
      return;
    }

    /* Guard 2: contain every shape a create failure can take - refusal
     * result, throw, rejection - and clear the stranded flag in each. */
    deps.log(`the Borg's warrior died ${diedAt}; the Borg is starting the next one`);
    try {
      const made = await deps.create({ resumeAutoplayer: true });
      /* A stop may have landed while create was in flight. The call was
       * issued by the live loop, so its OUTCOME still gets the live
       * handling: ok means the page is going away (the presenter consumes
       * the flag on the next page), a failure still clears the standing
       * flag below. Nothing new is started either way. */
      if (made.ok) return;
      await stranded(`create was refused: ${made.message}`);
    } catch (error: unknown) {
      await stranded(`create threw: ${messageOf(error)}`);
    }
  };

  const subscribed: Promise<void> = deps.events
    .on("run-end", (event) => {
      /* Fire-and-forget by design: the host calls the listener synchronously
       * and must not receive (or swallow) our promise. onReport never
       * rejects; the void makes that the caller's contract too. */
      void onReport(event);
    })
    .then(
      (result) => {
        if (result.ok) {
          subscription = result.value;
        } else {
          deps.log(`the Borg cannot hear how its runs end (${result.message}), so a death ends the session`);
        }
      },
      (error: unknown) => {
        deps.log(`the Borg cannot hear how its runs end (${messageOf(error)}), so a death ends the session`);
      },
    );

  if (deps.create === null) {
    deps.log("the Borg cannot restart its warrior on this game: it was given no character-creation seam, so a death will end the session");
  }

  return {
    get listening(): boolean {
      return subscription !== null;
    },
    async stop(): Promise<void> {
      /* Invalidate FIRST and synchronously (#29): from this moment no
       * continuation of a report this loop was already running may produce
       * a side effect, whether stop's own awaits settle before or after it. */
      stopped = true;
      epoch += 1;
      await subscribed;
      const held = subscription;
      subscription = null;
      if (held !== null) await deps.events.off(held).catch(() => undefined);
    },
  };
}
