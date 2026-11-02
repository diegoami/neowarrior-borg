/**
 * THE RACE CHOICE SETTING: which warrior the Borg births (T05, #8).
 *
 * This is the mod's first NUMERIC setting, under the manifest's top-level
 * `settings` key (the host's Mods screen carries one number per declared
 * setting, game 1.22+; there is no string row, so the race is an INDEX over
 * a fixed candidate list rather than a name a player types). The mapping is
 * declared once, here, and mirrored verbatim in manifest.json -
 * settings.test.ts fails if the two drift, because the DECLARED min/max is
 * what clamps the value and a menu offering one range in front of a resolver
 * enforcing another would be a setting that cannot reach its own candidates.
 *
 * RESOLVED ONCE PER BIRTH, AT SHOW. The presenter (src/birth/presenter.ts)
 * reads `deps.raceName` inside show(), and plugin.ts wires that property as
 * a getter over this resolver, so the index-to-name decision - clamp, pack
 * check, log - runs at the birth itself, never cached at mod start (the T05
 * hazard: a cached race would silently ignore a setting the player moved).
 * Nothing in this module remembers anything between calls; the then-current
 * VALUE is the caller's to fetch (plugin.ts does, once per page, because the
 * settings API is async and show() is pinned synchronous - every armed birth
 * follows the page reload that the flag writers issue, so that fetch is
 * always the current one for the birth that reads it).
 *
 * GAME-FREE like the rest of src/birth: no engine import, no catalogue
 * knowledge of its own. The pack's race names, when the caller knows them,
 * arrive as a plain list; the presenter's own unknown-race decline is the
 * backstop when it does not.
 */

import type { PackSetting } from "@rpgm-tools/neo-angband-mod-sdk";

/**
 * The candidate races, in the T07 bake-off shortlist's order: 0 Half-Troll,
 * 1 Dunadan, 2 High-Elf, 3 Dwarf. The ORDER is pinned everywhere the
 * candidates are named - manifest.json's `settings` entry, SETTINGS.md,
 * docs/README.md, this list, and the headless harness's explicit race -
 * because the setting's saved VALUE is an index into this order: a rotation
 * here would silently re-map every stored choice. The shortlist itself is
 * the measured question T07 exists to answer; these four are the candidates
 * it bakes off, and the default (candidate 0) is the fork's standing answer
 * until that measurement says otherwise.
 */
export const WARRIOR_RACE_CANDIDATES = ["Half-Troll", "Dunadan", "High-Elf", "Dwarf"] as const;

/**
 * The manifest's `borg.raceChoice` declaration, mirrored. The resolver clamps
 * by THIS constant (declaredValue below, the SDK's resolveSettingValue
 * mirrored - the same arithmetic the host resolves stored values with), so
 * "clamped by the declared min/max" means the range the Mods screen shows;
 * settings.test.ts pins manifest.json to this object field for field.
 */
export const RACE_CHOICE_SETTING: PackSetting = {
  id: "borg.raceChoice",
  title: "Warrior race",
  description: "The race the Borg's planned warrior is born as: 0 Half-Troll, 1 Dunadan, 2 High-Elf, 3 Dwarf - the bake-off shortlist, in this order everywhere. Read at each birth, so a change applies to the next warrior.",
  min: 0,
  max: WARRIOR_RACE_CANDIDATES.length - 1,
  step: 1,
  default: 0,
};

/** What one resolution decided, and everything the log said it did. */
export interface WarriorRaceChoice {
  /** The catalogue name to birth, always a candidate the list names. */
  readonly raceName: string;
  /** The index after clamping - what the setting effectively said. */
  readonly index: number;
  /** True when the pack lacked the named race and candidate 0 is born instead. */
  readonly fellBack: boolean;
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
 * Resolve the setting's current value to a race to birth.
 *
 * `stored` is the value as the caller read it - already resolved by the host
 * when it came from `mod.meta.settings()`, raw otherwise; both are clamped
 * here by the declared min/max, and a missing or non-numeric value is the
 * declared default. `packRaces`, when the caller knows them, is the pack's
 * own race names: a chosen candidate the pack does not define falls back to
 * candidate 0 (the default) rather than declining - an exotic pack that
 * renames races still gets a warrior. Null or empty means "cannot be known",
 * and the chosen name stands: the presenter's own unknown-race decline
 * (src/birth/presenter.ts) is the backstop there, loud and once-per-flag.
 *
 * The log line is the point of the return value's ceremony: the unattended
 * run's record must say what it was told to play, so every resolution names
 * its race (and, on fallback, the name that was asked for and why it was not
 * born). One resolution per birth means one line per birth.
 */
export function resolveWarriorRace(
  stored: unknown,
  packRaces: readonly string[] | null,
  log: (message: string) => void,
): WarriorRaceChoice {
  const index = declaredValue(RACE_CHOICE_SETTING, stored);
  const named = WARRIOR_RACE_CANDIDATES[index] ?? WARRIOR_RACE_CANDIDATES[0];
  const known = packRaces !== null && packRaces.length > 0 ? packRaces.includes(named) : true;
  const fallback = WARRIOR_RACE_CANDIDATES[0];
  if (known) {
    log(
      `the Borg's next warrior will be born a ${named} (borg.raceChoice ${String(index)} of ` +
        `${String(RACE_CHOICE_SETTING.min)}-${String(RACE_CHOICE_SETTING.max)})`,
    );
    return { raceName: named, index, fellBack: false };
  }
  log(
    `the Borg's next warrior will be born a ${fallback} (borg.raceChoice ${String(index)} asked for ${named}, ` +
      `which this pack does not define, so candidate 0 is born instead)`,
  );
  return { raceName: fallback, index, fellBack: true };
}
