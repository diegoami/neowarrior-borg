/**
 * THE RACE SETTINGS: which warrior the Borg births (T05 #8, T09 #33).
 *
 * Two settings answer that question, and the answer is resolved ONCE PER
 * BIRTH, AT SHOW. The presenter (src/birth/presenter.ts) reads
 * `deps.raceName` inside show(), and plugin.ts wires that property as a
 * getter over this resolver, so the decision - draw or pin, clamp, pack
 * check, log - runs at the birth itself, never cached at mod start (the T05
 * hazard: a cached race would silently ignore a setting the player moved).
 * Nothing in this module remembers anything between calls; the then-current
 * VALUES are the caller's to fetch (plugin.ts does, once per page, because
 * the settings API is async and show() is pinned synchronous - every armed
 * birth follows the page reload that the flag writers issue, so that fetch
 * is always the current one for the birth that reads it).
 *
 * THE DRAW (T09, #33): with `borg.raceRandom` on (the owner's default), each
 * automated birth draws ONE race uniformly from the full four-race suited
 * shortlist instead of playing the pinned `borg.raceChoice`. The draw is
 * DETERMINISTIC (rule 4: determinism is a guarantee, not a preference): no
 * wall clock, no game RNG, and the Borg's decision RNG stream untouched -
 * its await-counts are load-bearing pacing pinned by T05/T06's tests, so
 * the draw seeds from the install slot's persisted `lineage` counter
 * (src/birth/lineage.ts) through a one-draw hash. Same persisted counter
 * state -> same draw, every time; every reload that bumps the counter draws
 * the next race in the hash's walk. A fresh install (counter absent, read as
 * 0) has a reproducible first draw. The counter is NOT a record of what was
 * played - the journal (src/records/journal.ts) is authoritative for what
 * lived and died; the counter only feeds the draw, and it may run ahead of
 * the graveyard (a draw whose birth declined still consumed its counter).
 *
 * The toggle and the pin are declared in the manifest's `rules` and
 * `settings` keys and mirrored here (RACE_RANDOM_RULE, RACE_CHOICE_SETTING);
 * settings.test.ts fails if either drifts, because the DECLARED min/max and
 * default are what the resolver clamps and defaults by, and a menu offering
 * one thing in front of a resolver enforcing another would be a setting that
 * cannot reach its own candidates.
 *
 * GAME-FREE like the rest of src/birth: no engine import, no catalogue
 * knowledge of its own. The pack's race names, when the caller knows them,
 * arrive as a plain list; the presenter's own unknown-race decline is the
 * backstop when it does not.
 */

import type { PackRule, PackSetting } from "@rpgm-tools/neo-angband-mod-sdk";

/**
 * The candidate races, in the T07 bake-off shortlist's order: 0 Half-Troll,
 * 1 Dunadan, 2 High-Elf, 3 Dwarf. The ORDER is pinned everywhere the
 * candidates are named - manifest.json's `settings` entry, SETTINGS.md,
 * docs/README.md, this list, and the headless harness's explicit race -
 * because the setting's saved VALUE is an index into this order: a rotation
 * here would silently re-map every stored choice. The shortlist is the one
 * T07 measured (all four kept by the owner's decision on #33); the draw
 * draws from this list, so a trimmed shortlist is a new manifest range and a
 * re-documented order, never a quiet edit here.
 */
export const WARRIOR_RACE_CANDIDATES = ["Half-Troll", "Dunadan", "High-Elf", "Dwarf"] as const;

/**
 * The manifest's `borg.raceChoice` declaration, mirrored. The resolver clamps
 * by THIS constant (declaredValue below, the SDK's resolveSettingValue
 * mirrored - the same arithmetic the host resolves stored values with), so
 * "clamped by the declared min/max" means the range the Mods screen shows;
 * settings.test.ts pins manifest.json to this object field for field.
 *
 * The DEFAULT is candidate 2, High-Elf - the T07 bake-off's recommendation
 * (depth 2 on 3/8 seeds in both engine variants, the only race whose
 * depth-2 set was stable under the fix), adopted by the owner's decision on
 * #10 and folded into #33. It is the value a missing or non-numeric stored
 * setting resolves to, and the race born when `borg.raceRandom` is off and
 * nothing was ever moved.
 */
export const RACE_CHOICE_SETTING: PackSetting = {
  id: "borg.raceChoice",
  title: "Warrior race",
  description: "The race the Borg's planned warrior is born as when borg.raceRandom is off: 0 Half-Troll, 1 Dunadan, 2 High-Elf, 3 Dwarf - the bake-off shortlist, in this order everywhere. The default (2, High-Elf) is the bake-off's recommendation. Read at each birth, so a change applies to the next warrior.",
  min: 0,
  max: WARRIOR_RACE_CANDIDATES.length - 1,
  step: 1,
  default: 2,
};

/**
 * The manifest's `borg.raceRandom` rule declaration, mirrored field for
 * field (settings.test.ts pins the manifest to it, docs-sync.test.ts pins
 * the docs table to the manifest). A RULE, not a numeric setting, because it
 * is a yes-or-no and the host's Mods screen carries rules as toggles; the
 * wiring reads it from the resolved rule flags once per page
 * (`mod.meta.flags[flag] ?? default`), and every armed birth follows the
 * reload its writer issues, so each birth sees the then-current toggle.
 * ON by default - the owner's directive (#33): an unattended line varies
 * its race over the shortlist rather than playing one candidate forever.
 * `requiresReload` because the wiring is built once per page, like every
 * rule this mod declares.
 *
 * This is the FORK's own toggle: upstream's Borg has no counterpart (its
 * host reincarnates an autoplayer with a RANDOM race and class and roller
 * stats - exactly what this fork exists not to do), which is why it is
 * exempt from manifest-tunables.test.ts's upstream-naming checks and pinned
 * here instead.
 */
export const RACE_RANDOM_RULE: PackRule = {
  flag: "borg.raceRandom",
  title: "Random suited race",
  description: "The fork's own toggle (no upstream borg_ setting): every warrior the Borg births draws its race from the bake-off shortlist - Half-Troll, Dunadan, High-Elf, Dwarf - seeded by a persisted birth counter, so an unattended line varies its race deterministically, with no clock and no random number draw. Off: borg.raceChoice pins the race.",
  default: true,
  requiresReload: true,
};

/**
 * THE ONE-DRAW HASH (T09, #33): murmur3's 32-bit finalizer over the lineage
 * counter, taking the hash's TOP bits scaled to the shortlist. This is the
 * draw's only source of variety, and it is a pure function of the counter:
 * same counter, same race, on every machine and every run (rule 4). The
 * finalizer's bit-avalanche spreads sequential counters (0, 1, 2, ...)
 * across the word - a plain `counter mod 4` would cycle the shortlist in
 * order, which is not a draw; the top bits (rather than the low word's
 * remainder) because a scaled-share map keeps every shortlist size fair if
 * the owner ever trims one. For the four-race shortlist the result is
 * exactly uniform: 4 divides 2^32, so every candidate takes an equal share
 * of the hash's range.
 */
export function drawWarriorRaceIndex(lineage: number): number {
  /* The counter enters as a uint32 (>>> 0 folds a larger or fractional
   * value deterministically); every step below is a defined 32-bit integer
   * operation, so there is no platform drift and no hidden entropy. */
  let h = lineage >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  const spread = h >>> 0;
  return Math.floor((spread / 0x100000000) * WARRIOR_RACE_CANDIDATES.length);
}

/** What one resolution needs: the toggle, the pin, the counter, the pack. */
export interface WarriorRaceInput {
  /**
   * `borg.raceRandom` as resolved for this page (the rule's value or its
   * declared default). True draws; false honors `choice`.
   */
  readonly random: boolean;
  /** `borg.raceChoice`'s stored value, as the caller read it (raw is fine). */
  readonly choice: unknown;
  /**
   * The install slot's lineage counter as it stood at this page's
   * registration (src/birth/lineage.ts read it; a fresh install is 0). The
   * draw's only seed.
   */
  readonly lineage: number;
  /**
   * The pack's own race names, when the caller knows them: a race the list
   * picked that the pack does not define falls back to candidate 0 rather
   * than declining. Null or empty means "cannot be known" and the chosen
   * name stands.
   */
  readonly packRaces: readonly string[] | null;
}

/** What one resolution decided, and everything the log said it did. */
export interface WarriorRaceChoice {
  /** The catalogue name to birth, always a candidate the list names. */
  readonly raceName: string;
  /** The index after clamping or drawing - what effectively decided. */
  readonly index: number;
  /** True when the pack lacked the decided race and candidate 0 is born instead. */
  readonly fellBack: boolean;
  /** True when the index came from the lineage draw (borg.raceRandom on). */
  readonly drawn: boolean;
}

/**
 * Pull a stored value into a setting's declared range, snapped to its step -
 * the SDK's own `resolveSettingValue` (neo-angband-mod-sdk's manifest.ts),
 * mirrored here because the plugin bundle may import that package for TYPES
 * only (tools/build.mjs refuses a runtime import: a module loaded from a mod
 * folder cannot resolve a package by name). Kept a faithful line-for-line
 * equivalent rather than a min-and-max special case, so a future fractional
 * step inherits the same arithmetic; settings.test.ts pins the equivalence
 * against the real SDK function over a swept range, so a semantics change on
 * either side fails there instead of in a birth.
 */
function declaredValue(setting: PackSetting, stored: unknown): number {
  const raw = typeof stored === "number" && Number.isFinite(stored) ? stored : setting.default;
  const clamped = Math.min(setting.max, Math.max(setting.min, raw));
  let snapped = setting.min + Math.round((clamped - setting.min) / setting.step) * setting.step;
  if (snapped > setting.max) snapped -= setting.step;
  const places = Math.max(decimalsOf(setting.min), decimalsOf(setting.step));
  return Number(snapped.toFixed(places));
}

/** How many digits a number carries after its point - the SDK's own helper. */
function decimalsOf(value: number): number {
  const text = String(value);
  const point = text.indexOf(".");
  return point === -1 ? 0 : text.length - point - 1;
}

/**
 * Resolve the race to birth: the draw when `input.random`, the pin when not.
 *
 * `input.lineage` is the install slot's counter as this page read it, and it
 * is the draw's ONLY seed - the caller bumps it after a draw (plugin.ts
 * fires bumpLineage; src/birth/lineage.ts owns the write), which is why the
 * same persisted state always yields the same draw while every reload that
 * drew varies the next one. `input.packRaces`, when the caller knows them,
 * is the pack's own race names: a decided candidate the pack does not define
 * falls back to candidate 0 (the first candidate - a fixed safe pick, not
 * the declared default) rather than declining - an exotic pack that renames
 * races still gets a warrior. The presenter's own unknown-race decline
 * (src/birth/presenter.ts) is the backstop when the caller cannot know.
 *
 * The log line is the point of the return value's ceremony: the unattended
 * run's record must say what it played and WHY - the draw names the drawn
 * race, the counter value and the shortlist size; the pin names the setting
 * and its index - and one resolution per birth means one line per birth.
 */
export function resolveWarriorRace(
  input: WarriorRaceInput,
  log: (message: string) => void,
): WarriorRaceChoice {
  const index = input.random
    ? drawWarriorRaceIndex(input.lineage)
    : declaredValue(RACE_CHOICE_SETTING, input.choice);
  const named = WARRIOR_RACE_CANDIDATES[index] ?? WARRIOR_RACE_CANDIDATES[0];
  const known = input.packRaces !== null && input.packRaces.length > 0 ? input.packRaces.includes(named) : true;
  const fallback = WARRIOR_RACE_CANDIDATES[0];
  const why = input.random
    ? `borg.raceRandom on: lineage draw ${String(input.lineage)} of the ` +
      `${String(WARRIOR_RACE_CANDIDATES.length)}-race shortlist picked candidate ${String(index)}`
    : `borg.raceRandom off; borg.raceChoice ${String(index)} of ` +
      `${String(RACE_CHOICE_SETTING.min)}-${String(RACE_CHOICE_SETTING.max)}`;
  if (known) {
    log(`the Borg's next warrior will be born a ${named} (${why})`);
    return { raceName: named, index, fellBack: false, drawn: input.random };
  }
  log(
    `the Borg's next warrior will be born a ${fallback} (${why} asked for ${named}, ` +
      `which this pack does not define, so candidate 0 is born instead)`,
  );
  return { raceName: fallback, index, fellBack: true, drawn: input.random };
}
