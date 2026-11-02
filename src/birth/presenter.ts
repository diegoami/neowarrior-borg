/**
 * THE BIRTH PRESENTER: how this fork creates its own warrior (T03, #6).
 *
 * WHAT THIS IS. The `birth(mod)` seam under `ui:birth.replace`: when the game
 * is about to show its character-creation screens it first offers the draft
 * to this presenter (offerBirth, the game's birth-runtime.ts). Returning true
 * from show() takes that creation - the game then waits on the session's
 * outcome - and anything else leaves the player on the game's own screens,
 * untouched. The milestone's worst failure mode is the other order: a
 * presenter that takes a birth a player meant for themselves.
 *
 * THE FLAG PROTOCOL, fail-closed end to end. A one-shot flag in the mod's
 * install slot says "this birth is ours": the key below, set to true, inside
 * the slot's JSON object - a SIBLING of the title row's profileIds, because
 * the slot is shared. The writers are T04's restart loop and T05's title
 * row, and both set it and then leave the page (saves.create and the profile
 * action both reload); the host builds the presenter at mod registration on
 * every page, so the prepare that reads the flag starts there and settles
 * long before any birth is offered. That placement is what keeps show()
 * synchronous - nothing async runs between the flag-read and accept() (the
 * T03 hazard): the prepare has already happened, and show() only ever calls
 * synchronous session methods. NO FLAG is the human path: show() declines
 * without touching the session at all, and the prepare never writes. A set
 * flag is DURABLY CONSUMED BEFORE ANY BIRTH IS ATTEMPTED, inside the
 * prepare: the consume re-reads the slot's CURRENT contents (never the
 * registration-time snapshot - a sibling writer may have run in between, so
 * the write-back carries every key as it stands at consume time, #26),
 * writes them back minus ours, and then READS THE SLOT AGAIN to verify the
 * flag is gone - the host's slot answers ok to a set whose backing write was
 * swallowed (mod-prefs.ts catches the storage exception and moves on), so
 * only the read-back proves anything (#25). A VERIFIED-GONE flag arms this
 * presenter for exactly one show; a refused, thrown or surviving flag
 * leaves it unarmed with a loud log that does not claim the flag was
 * removed, and every future attempt re-verifies and declines the same way -
 * the automated loop stalls visibly, and no human birth is ever taken. The
 * unknown-race decline therefore happens only after the verified consume,
 * so it can never spin the loop either. Every writer to the shared slot -
 * setWarriorBirthFlag here, installMemory in title.ts - read-modify-writes,
 * so none of them erases a sibling's key.
 *
 * THE CALL SEQUENCE, pinned from the session's own source
 * (packages/web/src/birth-session.ts) and replayed here exactly:
 *
 *   catalogue() -> chooseRace(race) -> chooseClass("Warrior") -> reset()
 *   -> buy(step.stat) down the plan's steps -> draft() (checked) -> accept()
 *
 * chooseRace and chooseClass each end in the session's resetStatWork, which
 * replaces the stat work with that pair's SUGGESTED spread - the engine's
 * generateStats, which for a warrior spends the whole budget (base 17 STR /
 * 16 CON under the stock table, points left 0). The plan's buys cannot start
 * from there, so reset() follows: the session's own reset_stats primitive,
 * every stat at base with the full budget, the one clean slate it offers.
 * The plan was walked from exactly that state under exactly this cost table
 * (src/birth/plan.ts), so replaying its steps is legal by construction; the
 * draft is checked against the plan before accept() anyway, so a session
 * whose arithmetic ever disagreed would decline loudly instead of birthing a
 * wrong warrior. Sells are never needed; usePointBuy() is deliberately not
 * called - it also ends in the suggested spread, not in a clean slate.
 *
 * THE HUMAN-SAFETY PROPERTY. Without the flag, show() returns undefined
 * without touching the session at all - not even catalogue() - and says
 * nothing in the log: a human creating a character the ordinary way never
 * meets this code. The name is the host's business unless the draft's is
 * empty (a fresh profile), in which case randomName() fills it with the
 * game's own generator - the same draw the terminal screens' '*' key makes -
 * so a pinned or dynastic name always stands.
 */

import type { Api2BirthPresenter, Api2BirthSession, Api2BirthResult, Api2Slot, JsonValue } from "@rpgm-tools/neo-angband-mod-sdk";
import { ladderFromCostTable, planWarriorBirth, WARRIOR_CLASS_NAME, type WarriorBuildPlan } from "./plan.js";

/**
 * The install-slot key that marks a birth as ours. The value is exactly true;
 * anything else reads as "not ours". Exported because T04's loop and T05's
 * title row set it through setWarriorBirthFlag below, so the shape has one
 * owner.
 */
export const BIRTH_FLAG_KEY = "warriorBirth";

/** The install slot's get/set, the half of Api2Slot this protocol uses. */
type Slot = Pick<Api2Slot, "get" | "set">;

/** Whether a slot value carries the flag. A non-object, or true's absence, is no. */
function flagIsSet(value: JsonValue | null): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  return (value as Record<string, unknown>)[BIRTH_FLAG_KEY] === true;
}

/** The slot value with our key removed, so the consume keeps its siblings. */
function withoutFlag(value: JsonValue | null): JsonValue | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const kept: Record<string, JsonValue> = {};
  let any = false;
  for (const [key, entry] of Object.entries(value)) {
    if (key === BIRTH_FLAG_KEY) continue;
    kept[key] = entry as JsonValue;
    any = true;
  }
  return any ? kept : null;
}

/**
 * Set the one-shot birth flag, preserving the slot's other keys (the title
 * row's profileIds). Returns whether the slot took the write: a false means
 * the flag is not set at all - the presenter reads only the slot, so a write
 * the slot refused is a birth that will not be ours, which the caller
 * (T04/T05) needs to know before it reloads into one.
 */
export async function setWarriorBirthFlag(slot: Slot): Promise<boolean> {
  const current = await slot.get().catch(() => null);
  const base = current !== null && current.ok && current.value !== null &&
      typeof current.value === "object" && !Array.isArray(current.value)
    ? (current.value as Record<string, JsonValue>)
    : {};
  const written = await slot.set({ ...base, [BIRTH_FLAG_KEY]: true }).catch(() => undefined);
  return written !== undefined && written.ok;
}

/**
 * Durably clear the one-shot birth flag, preserving the slot's other keys, and
 * prove it gone by reading the slot again - the same verified standard the
 * prepare's consume holds itself to (a slot answers ok to a set whose backing
 * write was swallowed, #25, so only the read-back proves anything). For T04's
 * restart loop (src/loop/restart.ts), on the one path where it set the flag
 * and then could not leave the page: a flag left standing would take the NEXT
 * birth on any later reload, whoever started it. A flag that is already gone
 * counts as cleared - the read itself is the proof.
 */
export async function clearWarriorBirthFlag(slot: Slot): Promise<boolean> {
  try {
    const current = await slot.get();
    if (!current.ok) return false;
    if (!flagIsSet(current.value)) return true;
    const written = await slot.set(withoutFlag(current.value));
    if (!written.ok) return false;
    const check = await slot.get();
    return check.ok && !flagIsSet(check.value);
  } catch {
    return false;
  }
}

/** What the presenter needs: the slot, a voice, the race, the cost table. */
export interface WarriorBirthDeps {
  /** The mod's install slot (mod.store.install), flag and siblings alike. */
  readonly slot: Slot;
  /** The mod's log (mod.meta.log): declines and consumptions say why. */
  readonly log: (message: string) => void;
  /**
   * The race to birth, by its catalogue name - the caller's setting, never a
   * catalogue-order default (the T03 hazard). T05's raceChoice setting
   * resolves it once per birth at show (src/birth/settings.ts); the wiring in
   * plugin.ts supplies it, and this module never learns where a name came
   * from.
   */
  readonly raceName: string;
  /**
   * The engine's BIRTH_STAT_COSTS, handed in because a bundled copy of the
   * engine is forbidden (src/core-api.ts): the presenter never imports the
   * engine, it only replays the table it is given.
   */
  readonly costTable: readonly number[];
  /** The engine's BIRTH_STAT_BASE (10), the value every stat starts from. */
  readonly statBase: number;
}

/**
 * What the prepare established, and therefore what show() may do. The
 * consume's outcomes are kept apart from the arming read's because their
 * logs mean different things: "unreadable" never saw a flag, "unconsumed"
 * saw one and could not durably retire it.
 */
type Prepared =
  | { readonly state: "pending" }
  | { readonly state: "not-ours" }
  | { readonly state: "armed" }
  | { readonly state: "unreadable"; readonly message: string }
  | { readonly state: "unconsumed"; readonly message: string };

const PENDING: Prepared = { state: "pending" };

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Build the presenter. The prepare starts here - at birth(mod) time, see the
 * header - so it has settled before any birth is offered; show() itself is
 * synchronous end to end, deciding only on what the prepare established.
 */
export function createWarriorBirthPresenter(deps: WarriorBirthDeps): Api2BirthPresenter {
  let prepared: Prepared = PENDING;
  /* One attempt per flag-set: the durable flag is gone once the prepare is
   * armed, so a second show on the same page must decline like the human
   * path rather than birth again on the same arming. */
  let spent = false;

  void (async () => {
    /* The arming read: is this birth ours at all? No flag means no write -
     * a human's page leaves the slot untouched. */
    let arming: Awaited<ReturnType<Slot["get"]>>;
    try {
      arming = await deps.slot.get();
    } catch (error: unknown) {
      prepared = { state: "unreadable", message: messageOf(error) };
      return;
    }
    if (!arming.ok) {
      prepared = { state: "unreadable", message: arming.message };
      return;
    }
    if (!flagIsSet(arming.value)) {
      prepared = { state: "not-ours" };
      return;
    }

    /* The durable consume, before any birth is attempted. A flag that is
     * already gone counts as verified - this very read is the proof - and
     * skips the write entirely. */
    const unconsumed = (message: string): void => {
      prepared = { state: "unconsumed", message };
    };
    try {
      const current = await deps.slot.get();
      if (!current.ok) return unconsumed(current.message);
      if (flagIsSet(current.value)) {
        const written = await deps.slot.set(withoutFlag(current.value));
        if (!written.ok) return unconsumed(written.message);
        const check = await deps.slot.get();
        if (!check.ok) return unconsumed(check.message);
        if (flagIsSet(check.value)) return unconsumed("it was still set after being cleared");
      }
      prepared = { state: "armed" };
    } catch (error: unknown) {
      unconsumed(messageOf(error));
    }
  })();

  /** Run one session call, or log its refusal and report failure. */
  const attempt = (what: string, result: Api2BirthResult): boolean => {
    if (result.ok) return true;
    deps.log(`the Borg's warrior birth was refused at ${what}: ${result.reason}`);
    return false;
  };

  return {
    show(session: Api2BirthSession): boolean | undefined {
      if (prepared.state === "pending") {
        /* The wrong direction would be to take the birth anyway; see the
         * header. The host's slot read settles in a microtask while every
         * birth offer is a later task, so this line should be unreachable. */
        deps.log("the Borg's birth flag has not been read yet, so it leaves this birth to the game's own screens");
        return undefined;
      }
      if (prepared.state === "unreadable") {
        deps.log(`the Borg could not read its birth flag (${prepared.message}), so it leaves this birth to the game's own screens`);
        return undefined;
      }
      if (prepared.state === "unconsumed") {
        /* Deliberately loud, and honest: the flag may still be set. No
         * birth is taken on it, on this page or any later one, until some
         * attempt verifies it gone (#25's required safe direction). */
        deps.log(
          `the Borg could not durably clear its birth flag (${prepared.message}), so it leaves this birth to the game's own screens; ` +
            `the flag may still be set, and every later birth re-checks and declines the same way rather than risk taking one that is not ours`,
        );
        return undefined;
      }
      /* The human path - and a same-page second show, the arming's one
       * attempt being spent: no calls, no log line. */
      if (prepared.state === "not-ours" || spent) return undefined;
      spent = true;

      /* The plan, under the handed-in table, from the session's own
       * catalogue. Any input-contract failure (a race the pack does not
       * define among them) declines here - the flag was already durably
       * consumed by the prepare, verified. */
      let plan: WarriorBuildPlan;
      try {
        plan = planWarriorBirth({
          catalogue: session.catalogue(),
          raceName: deps.raceName,
          costs: ladderFromCostTable(deps.costTable, deps.statBase),
        });
      } catch (error: unknown) {
        deps.log(
          `the Borg declines to birth its warrior: ${error instanceof Error ? error.message : String(error)}`,
        );
        return undefined;
      }

      /* The pinned sequence. A refusal anywhere declines (the flag is
       * already durably consumed by the prepare, so this birth falls to the
       * game's own screens once). */
      if (!attempt(`chooseRace(${plan.raceName})`, session.chooseRace(plan.raceName))) return undefined;
      if (!attempt(`chooseClass(${plan.className})`, session.chooseClass(plan.className))) return undefined;
      if (!attempt("reset", session.reset())) return undefined;
      for (const step of plan.steps) {
        if (!attempt(`buy(${String(step.stat)} at ${String(step.from)})`, session.buy(step.stat))) return undefined;
      }

      /* The draft must be exactly the plan's before it is accepted: stats,
       * leftover points and the pair, checked against the session's own
       * arithmetic rather than trusted. */
      const draft = session.draft();
      if (
        draft.race !== plan.raceName ||
        draft.cls !== plan.className ||
        draft.stats.length !== plan.baseStats.length ||
        draft.stats.some((value, i) => value !== plan.baseStats[i]) ||
        draft.pointsLeft !== plan.pointsLeft
      ) {
        deps.log(
          `the Borg declines to accept a warrior it did not plan: the session's draft ` +
            `(${draft.race ?? "?"} ${draft.cls ?? "?"} [${draft.stats.join(",")}] left ${String(draft.pointsLeft)}) ` +
            `is not the plan ([${plan.baseStats.join(",")}] left ${String(plan.pointsLeft)})`,
        );
        return undefined;
      }

      /* The name is the host's unless there is none: the game's own generator,
       * the same draw the terminal screens' '*' key makes (see the header). */
      if (draft.name.trim() === "") {
        if (!attempt("randomName", session.randomName())) return undefined;
      }
      if (!attempt("accept", session.accept())) return undefined;

      deps.log(
        `the Borg birthed its ${plan.raceName} ${WARRIOR_CLASS_NAME} ` +
          `(base stats ${plan.baseStats.map((value) => String(value)).join("/")})`,
      );
      return true;
    },
  };
}
