/**
 * THE LINEAGE COUNTER: the install slot's birth counter (T09, #33).
 *
 * This is the ONE entropy-free seed the race draw is allowed: a non-negative
 * integer under the `lineage` key of the mod's install slot (mod.store.install
 * - the same shared object the birth flag and the title row's profileIds live
 * in), read once per page at registration and incremented once per draw. The
 * draw itself (the counter-to-race hash) lives in src/birth/settings.ts; this
 * module owns only the slot shape and the two operations on it.
 *
 * THE COUNTER IS NOT A RECORD. It feeds the draw and nothing else: what WAS
 * played is the journal's to say (src/records/journal.ts - the graveyard
 * entries the restart loop writes at each run report), and the log lines the
 * resolver emits at each birth. The counter can run ahead of the graveyard
 * and that is not a disagreement: a draw whose birth declined (an unknown
 * race, a refused session step) still consumed its counter, and the next
 * warrior draws the next race. Nothing reads the counter back to reconstruct
 * what lived and died, and nothing here writes the journal's keys.
 *
 * Rule 4, held: no wall clock, no game RNG, no engine read. The counter's
 * only inputs are what the slot already stored and the fact that a draw
 * happened. A failed bump is benign and deterministic - the next draw
 * re-seeds from whatever is still stored, which can repeat a race but can
 * never invent entropy - so failures are answered (false), never thrown.
 */

import type { Api2Slot, JsonValue } from "@rpgm-tools/neo-angband-mod-sdk";

/** The install slot's get/set half, the same slice the presenter consumes under. */
type Slot = Pick<Api2Slot, "get" | "set">;

/**
 * The install-slot key that carries the counter. The value is exactly a
 * non-negative integer; anything else reads as a fresh lineage (0), so a
 * foreign or garbage value cannot poison the draw. Exported because plugin.ts
 * wiring and these tests name it; the shape has one owner, here.
 */
export const LINEAGE_KEY = "lineage";

/**
 * The counter a slot value carries, or 0 when it carries none this module
 * would recognize: missing, non-object, or not a non-negative integer. Pure
 * and total - the same input always reads as the same counter, whatever it
 * is.
 */
export function lineageFrom(value: JsonValue | null): number {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return 0;
  const stored = (value as Record<string, unknown>)[LINEAGE_KEY];
  return typeof stored === "number" && Number.isInteger(stored) && stored >= 0 ? stored : 0;
}

/**
 * Read the counter as it stands. Never rejects; a refused or thrown read
 * answers 0 (a fresh lineage) rather than a throw, because the wiring reads
 * fire-and-forget at page registration - and a slot that cannot be read
 * cannot arm a birth either (the presenter's prepare declines on its own
 * unreadable read), so a 0 here never decides a real birth on broken storage.
 */
export async function readLineage(slot: Slot): Promise<number> {
  try {
    const read = await slot.get();
    if (!read.ok) return 0;
    return lineageFrom(read.value);
  } catch {
    return 0;
  }
}

/**
 * Increment the counter by one: a read-modify-write that carries every
 * sibling key forward (the title row's profileIds, the presenter's
 * warriorBirth flag, any later sibling - #26's discipline, the same one
 * presenter.ts's consume and title.ts's installMemory keep over this shared
 * slot). Never rejects; returns whether the write landed.
 *
 * The increment is over what the slot CURRENTLY holds, not over the value
 * the drawing page read at registration: two pages drawing off the same
 * counter (two tabs on one install) both draw the same race and the counter
 * still advances by whole reads - interleavings can repeat or skip a race,
 * never add entropy, and never disturb a sibling.
 */
export async function bumpLineage(slot: Slot): Promise<boolean> {
  try {
    const read = await slot.get();
    if (!read.ok) return false;
    const base =
      read.value !== null && typeof read.value === "object" && !Array.isArray(read.value)
        ? (read.value as Record<string, JsonValue>)
        : {};
    const written = await slot.set({ ...base, [LINEAGE_KEY]: lineageFrom(read.value) + 1 });
    return written.ok;
  } catch {
    return false;
  }
}
