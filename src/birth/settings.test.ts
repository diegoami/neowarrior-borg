/**
 * TESTS FOR THE RACE CHOICE SETTING (T05, #8).
 *
 * The setting is one number on the Mods screen; the resolver is the only code
 * that turns it into a race name, so every property the birth depends on is
 * pinned here against the resolver's own declarations rather than against
 * copies: the index-to-candidate order (the bake-off shortlist, which must be
 * the same order in the manifest, in SETTINGS.md, in docs/README.md and in the
 * source), the clamp (by the DECLARED min/max, so a front end that hands over
 * any number at all cannot name a race the list does not carry), the
 * pack-unknown fallback (candidate 0, not a decline: a pack that renames races
 * still gets a warrior), and the log line that names what was chosen (the
 * unattended run's record must say what it was told to play).
 *
 * THE NO-CACHING PROPERTY is a Done-when of its own: the resolver reads the
 * value it is given at every call and remembers nothing, because the wiring
 * (plugin.ts) hands it the then-current setting value once per birth, at show
 * - a resolver that memoized would silently freeze the first answer and a
 * changed setting would never reach the next warrior (the T05 hazard).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveSettingValue, validateManifest, type PackSetting } from "@rpgm-tools/neo-angband-mod-sdk";
import { RACE_CHOICE_SETTING, resolveWarriorRace, WARRIOR_RACE_CANDIDATES } from "./settings.js";

const quiet = (): void => {};

describe("the raceChoice setting", () => {
  it("maps every index to the documented candidate, in the same order everywhere", () => {
    /* The order is the bake-off shortlist (docs/tasks/T05.md): 0 Half-Troll,
     * 1 Dunadan, 2 High-Elf, 3 Dwarf. It is asserted literally, because every
     * site that names the candidates must agree and a rotation here would
     * silently re-map every saved setting value. */
    expect(WARRIOR_RACE_CANDIDATES).toEqual(["Half-Troll", "Dunadan", "High-Elf", "Dwarf"]);
    for (let index = 0; index < WARRIOR_RACE_CANDIDATES.length; index++) {
      const resolved = resolveWarriorRace(index, null, quiet);
      expect(resolved.raceName).toBe(WARRIOR_RACE_CANDIDATES[index]);
      expect(resolved.index).toBe(index);
      expect(resolved.fellBack).toBe(false);
    }
  });

  it("clamps an out-of-range or unusable value by the declared min/max", () => {
    /* The DECLARED setting is the clamp's authority (declaredValue over
     * RACE_CHOICE_SETTING), so whatever a front end hands over - a number
     * beyond the range, a fraction, or nothing a number at all - lands on a
     * candidate the list names. */
    expect(RACE_CHOICE_SETTING.min).toBe(0);
    expect(RACE_CHOICE_SETTING.max).toBe(WARRIOR_RACE_CANDIDATES.length - 1);
    expect(RACE_CHOICE_SETTING.default).toBe(RACE_CHOICE_SETTING.min);
    expect(resolveWarriorRace(99, null, quiet).raceName).toBe("Dwarf");
    expect(resolveWarriorRace(-2, null, quiet).raceName).toBe("Half-Troll");
    /* The declared step is 1: a fraction snaps to a whole candidate. */
    expect(resolveWarriorRace(2.4, null, quiet).raceName).toBe("High-Elf");
    expect(resolveWarriorRace(2.6, null, quiet).raceName).toBe("Dwarf");
    /* A missing or non-numeric stored value is the declared default. */
    expect(resolveWarriorRace(undefined, null, quiet).raceName).toBe("Half-Troll");
    expect(resolveWarriorRace("2", null, quiet).raceName).toBe("Half-Troll");

    /* The clamp is a line-for-line mirror of the SDK's resolveSettingValue
     * (the bundle may not import that package at runtime, so the semantics
     * are pinned HERE instead): over a swept range and every unusable shape,
     * the two agree, or this fails rather than a birth quietly differing
     * from what the host's own Mods screen would have resolved. */
    for (const stored of [
      ...Array.from({ length: 41 }, (_v, i) => i - 10),
      2.4, 2.5, 2.6, -0.5, 3.5, 1e9, -1e9, Number.NaN, Number.POSITIVE_INFINITY,
      undefined, null, "2", true, {},
    ]) {
      expect(resolveWarriorRace(stored, null, quiet).index).toBe(resolveSettingValue(RACE_CHOICE_SETTING, stored));
    }
  });

  it("falls back to the first candidate when the pack does not define the named race", () => {
    /* An exotic pack may not carry a shortlist name. The resolver still
     * answers a candidate rather than declining: candidate 0, the default -
     * and when the caller cannot know the pack's races at all (null, or an
     * empty answer), the chosen name stands and the presenter's own
     * unknown-race decline (src/birth/presenter.ts) is the backstop. */
    const fallen = resolveWarriorRace(2, ["Human", "Dunadan"], quiet);
    expect(fallen.raceName).toBe("Half-Troll");
    expect(fallen.fellBack).toBe(true);

    expect(resolveWarriorRace(2, null, quiet)).toMatchObject({ raceName: "High-Elf", fellBack: false });
    expect(resolveWarriorRace(2, [], quiet)).toMatchObject({ raceName: "High-Elf", fellBack: false });
    expect(resolveWarriorRace(2, ["Human", "High-Elf"], quiet)).toMatchObject({ raceName: "High-Elf", fellBack: false });
  });

  it("logs the choice, naming the race - and the fallback and its reason", () => {
    /* One line per birth (the wiring resolves once per birth), because the
     * log of an unattended run is the only record of what the Borg was told
     * to play. */
    const logs: string[] = [];
    resolveWarriorRace(2, null, (message) => logs.push(message));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("High-Elf");
    expect(logs[0]).toContain("raceChoice");

    const fallen: string[] = [];
    resolveWarriorRace(1, ["Human"], (message) => fallen.push(message));
    expect(fallen).toHaveLength(1);
    expect(fallen[0]).toContain("Half-Troll");
    expect(fallen[0]).toContain("Dunadan");
  });

  it("reads the value as it stands at each call, so a changed setting reaches the next birth", () => {
    /* The resolver holds nothing between calls. The wiring hands it the
     * setting's then-current value once per birth, at show (plugin.ts); this
     * is the property that makes "the player moved the number" equivalent to
     * "the next warrior is the new race". */
    let stored: unknown = 1;
    expect(resolveWarriorRace(stored, null, quiet).raceName).toBe("Dunadan");
    stored = 3; /* the player moves the Mods screen's number */
    expect(resolveWarriorRace(stored, null, quiet).raceName).toBe("Dwarf");
    stored = undefined; /* or clears it */
    expect(resolveWarriorRace(stored, null, quiet).raceName).toBe("Half-Troll");

    /* And nothing is remembered: every call answers afresh, log line and all. */
    const logs: string[] = [];
    resolveWarriorRace(0, null, (message) => logs.push(message));
    resolveWarriorRace(0, null, (message) => logs.push(message));
    expect(logs).toHaveLength(2);
  });

  it("is declared in the manifest exactly as the resolver clamps by", () => {
    /* manifest.json's `settings` key is what the host reads (its Mods screen
     * row, its stored values) and RACE_CHOICE_SETTING is what this mod clamps
     * by; a drift between them would put a menu that offers one range in
     * front of a resolver that enforces another. docs-sync.test.ts covers the
     * toggles table; numeric settings are pinned here. */
    const manifest = validateManifest(
      JSON.parse(readFileSync(new URL("../../manifest.json", import.meta.url), "utf8")),
    ) as { settings?: readonly PackSetting[] };
    expect(manifest.settings).toEqual([RACE_CHOICE_SETTING]);
    /* The declared range covers exactly the candidates: no index the menu can
     * pick that the list does not name, and no candidate the menu cannot
     * reach. */
    expect(RACE_CHOICE_SETTING.max).toBe(WARRIOR_RACE_CANDIDATES.length - 1);
    expect(RACE_CHOICE_SETTING.step).toBe(1);
  });
});
