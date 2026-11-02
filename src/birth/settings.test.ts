/**
 * TESTS FOR THE RACE SETTINGS: the choice, the draw, and the counter (T05
 * #8, T09 #33).
 *
 * Two settings decide the race of the Borg's next warrior, and both are
 * pinned here against the resolver's own declarations rather than against
 * copies:
 *
 * - `borg.raceChoice` (numeric): the PIN, honored when `borg.raceRandom` is
 *   off. The index-to-candidate order (the bake-off shortlist, which must be
 *   the same order in the manifest, in SETTINGS.md, in docs/README.md and in
 *   the source), the clamp (by the DECLARED min/max, so a front end that
 *   hands over any number at all cannot name a race the list does not
 *   carry), the pack-unknown fallback (candidate 0, not a decline: a pack
 *   that renames races still gets a warrior), and the declared default -
 *   candidate 2, High-Elf, the bake-off's recommendation (#10, folded into
 *   #33).
 * - `borg.raceRandom` (toggle, default ON per the owner): the DRAW. One race
 *   drawn uniformly from the full shortlist at each automated birth, seeded
 *   by the install slot's persisted `lineage` counter through a one-draw
 *   hash. Rule 4 makes the determinism non-negotiable: same persisted
 *   counter state -> same draw, no wall clock, no game RNG, and the Borg's
 *   decision RNG untouched (its await-counts are pinned by T05/T06's tests,
 *   which is why the counter hash - not that stream - seeds the draw).
 *
 * The counter itself (src/birth/lineage.ts) is tested here too: it survives
 * a simulated reload (the slot round-trip), it preserves the slot's sibling
 * keys (the title row's profileIds, the presenter's warriorBirth flag), and
 * it never rejects. It is NOT a record - the journal is what says what lived
 * and died - and the header of the module that owns it says so.
 *
 * THE NO-CACHING PROPERTY is kept from T05: the resolver reads the values it
 * is given at every call and remembers nothing, because the wiring
 * (plugin.ts) hands it the then-current settings and counter once per birth,
 * at show - a resolver that memoized would silently freeze the first answer
 * and a changed setting would never reach the next warrior.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  resolveSettingValue,
  validateManifest,
  type Api2Slot,
  type JsonValue,
  type PackRule,
  type PackSetting,
} from "@rpgm-tools/neo-angband-mod-sdk";
import {
  RACE_CHOICE_SETTING,
  RACE_RANDOM_RULE,
  WARRIOR_RACE_CANDIDATES,
  drawWarriorRaceIndex,
  resolveWarriorRace,
  type WarriorRaceInput,
} from "./settings.js";
import { LINEAGE_KEY, bumpLineage, lineageFrom, readLineage } from "./lineage.js";

const quiet = (): void => {};

/** The pinned path: raceRandom off, so `borg.raceChoice` decides. */
function pinned(choice: unknown): WarriorRaceInput {
  return { random: false, choice, lineage: 0, packRaces: null };
}

/** The draw path: raceRandom on, so the lineage counter decides. */
function drawn(lineage: number, packRaces: readonly string[] | null = null): WarriorRaceInput {
  return { random: true, choice: 0, lineage, packRaces };
}

/* ==================================================================
 * The pin: borg.raceChoice, honored when borg.raceRandom is off
 * ==================================================================
 */

describe("the raceChoice setting (the pin)", () => {
  it("maps every index to the documented candidate, in the same order everywhere", () => {
    /* The order is the bake-off shortlist (docs/tasks/T05.md): 0 Half-Troll,
     * 1 Dunadan, 2 High-Elf, 3 Dwarf. It is asserted literally, because every
     * site that names the candidates must agree and a rotation here would
     * silently re-map every saved setting value. */
    expect(WARRIOR_RACE_CANDIDATES).toEqual(["Half-Troll", "Dunadan", "High-Elf", "Dwarf"]);
    for (let index = 0; index < WARRIOR_RACE_CANDIDATES.length; index++) {
      const resolved = resolveWarriorRace(pinned(index), quiet);
      expect(resolved.raceName).toBe(WARRIOR_RACE_CANDIDATES[index]);
      expect(resolved.index).toBe(index);
      expect(resolved.fellBack).toBe(false);
      expect(resolved.drawn).toBe(false);
    }
  });

  it("clamps an out-of-range or unusable value by the declared min/max", () => {
    /* The DECLARED setting is the clamp's authority (declaredValue over
     * RACE_CHOICE_SETTING), so whatever a front end hands over - a number
     * beyond the range, a fraction, or nothing a number at all - lands on a
     * candidate the list names. The DEFAULT is candidate 2 (High-Elf): the
     * bake-off's recommendation, the owner's folded-in decision (#33). */
    expect(RACE_CHOICE_SETTING.min).toBe(0);
    expect(RACE_CHOICE_SETTING.max).toBe(WARRIOR_RACE_CANDIDATES.length - 1);
    expect(RACE_CHOICE_SETTING.default).toBe(2);
    expect(WARRIOR_RACE_CANDIDATES[RACE_CHOICE_SETTING.default]).toBe("High-Elf");
    expect(resolveWarriorRace(pinned(99), quiet).raceName).toBe("Dwarf");
    expect(resolveWarriorRace(pinned(-2), quiet).raceName).toBe("Half-Troll");
    /* The declared step is 1: a fraction snaps to a whole candidate. */
    expect(resolveWarriorRace(pinned(2.4), quiet).raceName).toBe("High-Elf");
    expect(resolveWarriorRace(pinned(2.6), quiet).raceName).toBe("Dwarf");
    /* A missing or non-numeric stored value is the declared default, which
     * since #33 is High-Elf, not the first candidate. */
    expect(resolveWarriorRace(pinned(undefined), quiet).raceName).toBe("High-Elf");
    expect(resolveWarriorRace(pinned("2"), quiet).raceName).toBe("High-Elf");

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
      expect(resolveWarriorRace(pinned(stored), quiet).index).toBe(resolveSettingValue(RACE_CHOICE_SETTING, stored));
    }
  });

  it("falls back to the first candidate when the pack does not define the named race", () => {
    /* An exotic pack may not carry a shortlist name. The resolver still
     * answers a candidate rather than declining: candidate 0 - a fixed safe
     * pick, not the declared default - and when the caller cannot know the
     * pack's races at all (null, or an empty answer), the chosen name stands
     * and the presenter's own unknown-race decline (src/birth/presenter.ts)
     * is the backstop. */
    const fallen = resolveWarriorRace({ ...pinned(2), packRaces: ["Human", "Dunadan"] }, quiet);
    expect(fallen.raceName).toBe("Half-Troll");
    expect(fallen.fellBack).toBe(true);

    expect(resolveWarriorRace({ ...pinned(2), packRaces: null }, quiet)).toMatchObject({ raceName: "High-Elf", fellBack: false });
    expect(resolveWarriorRace({ ...pinned(2), packRaces: [] }, quiet)).toMatchObject({ raceName: "High-Elf", fellBack: false });
    expect(resolveWarriorRace({ ...pinned(2), packRaces: ["Human", "High-Elf"] }, quiet)).toMatchObject({ raceName: "High-Elf", fellBack: false });
  });

  it("reads the value as it stands at each call, so a changed setting reaches the next birth", () => {
    /* The resolver holds nothing between calls. The wiring hands it the
     * setting's then-current value once per birth, at show (plugin.ts); this
     * is the property that makes "the player moved the number" equivalent to
     * "the next warrior is the new race". */
    let choice: unknown = 1;
    expect(resolveWarriorRace(pinned(choice), quiet).raceName).toBe("Dunadan");
    choice = 3; /* the player moves the Mods screen's number */
    expect(resolveWarriorRace(pinned(choice), quiet).raceName).toBe("Dwarf");
    choice = undefined; /* or clears it: the declared default, High-Elf */
    expect(resolveWarriorRace(pinned(choice), quiet).raceName).toBe("High-Elf");

    /* And nothing is remembered: every call answers afresh, log line and all. */
    const logs: string[] = [];
    resolveWarriorRace(pinned(0), (message) => logs.push(message));
    resolveWarriorRace(pinned(0), (message) => logs.push(message));
    expect(logs).toHaveLength(2);
  });
});

/* ==================================================================
 * The draw: borg.raceRandom on, one uniform race per birth (T09, #33)
 * ==================================================================
 */

describe("the raceRandom draw", () => {
  it("draws inside the shortlist, and successive births vary", () => {
    /* Successive births read successive counters (each draw bumps the
     * lineage), so "varies" is a property of the hash over a counter walk.
     * Every draw lands inside the shortlist, more than one race appears, and
     * within the first 64 births every candidate has been drawn - the owner
     * kept all four, and the draw must actually reach them. */
    const names: string[] = [];
    for (let lineage = 0; lineage < 64; lineage++) {
      const resolved = resolveWarriorRace(drawn(lineage), quiet);
      expect(resolved.drawn, `lineage ${String(lineage)} is a draw`).toBe(true);
      expect(resolved.fellBack).toBe(false);
      expect(WARRIOR_RACE_CANDIDATES).toContain(resolved.raceName);
      expect(resolved.raceName).toBe(WARRIOR_RACE_CANDIDATES[drawWarriorRaceIndex(lineage)]);
      names.push(resolved.raceName);
    }
    expect(new Set(names).size).toBeGreaterThan(1);
    expect(new Set(names).size).toBe(WARRIOR_RACE_CANDIDATES.length);
  });

  it("is deterministic: the same counter state always draws the same race", () => {
    /* THE PIN, literally: the first eight draws of the one-draw hash, so a
     * change to the hash reddens this line instead of quietly re-shuffling
     * every unattended run's lineage. Draw 0 is Half-Troll: a fresh install
     * (counter absent, which reads as 0) has a reproducible first draw. */
    expect(Array.from({ length: 8 }, (_v, i) => drawWarriorRaceIndex(i))).toEqual([0, 1, 0, 2, 0, 3, 1, 0]);

    /* And through the resolver: the SAME persisted counter state produces
     * the SAME draw - same race, same index, same log line - on every
     * resolution of it. */
    const first: string[] = [];
    const second: string[] = [];
    const a = resolveWarriorRace(drawn(9), (m) => first.push(m));
    const b = resolveWarriorRace(drawn(9), (m) => second.push(m));
    expect(a).toEqual(b);
    expect(a.raceName).toBe(WARRIOR_RACE_CANDIDATES[drawWarriorRaceIndex(9)]);
    expect(first).toEqual(second);
    expect(first).toHaveLength(1);

    /* While a different counter draws a different lineage's race: the
     * counter is the only thing that moved, and the draw moved with it. */
    const other = resolveWarriorRace(drawn(10), quiet);
    expect(other.index).toBe(drawWarriorRaceIndex(10));
  });

  it("adds no entropy source: no wall clock, no RNG, no engine import", () => {
    /* Rule 4 as a source scan over the two modules that own the draw. The
     * decision RNG (src/rng.ts) is deliberately NOT imported here either:
     * its await-counts are load-bearing pacing pinned by T05/T06, and the
     * draw must not spend a value from that stream. */
    for (const file of ["settings.ts", "lineage.ts"]) {
      const text = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      expect(text, `${file} draws no random number`).not.toMatch(/Math\.random/u);
      expect(text, `${file} reads no clock`).not.toMatch(/Date\.now|performance\.now/u);
      expect(text, `${file} rolls no game dice`).not.toMatch(/from "\.\.\/rng\.js"|neo-angband-core/u);
    }
  });

  it("falls back to the first candidate when the pack does not define the drawn race", () => {
    /* The draw answers an INDEX; the pack check treats it exactly like the
     * pin's: a drawn candidate this pack does not define falls back to
     * candidate 0 rather than declining. Lineage 3 draws candidate 2
     * (High-Elf), which ["Human", "Dunadan"] does not define. */
    expect(drawWarriorRaceIndex(3)).toBe(2);
    const fallen = resolveWarriorRace(drawn(3, ["Human", "Dunadan"]), quiet);
    expect(fallen.raceName).toBe("Half-Troll");
    expect(fallen.fellBack).toBe(true);
    expect(fallen.drawn).toBe(true);
  });

  it("logs the drawn race, the counter, and the shortlist size - one line per birth", () => {
    /* The log of an unattended run is the only record that says WHY this
     * race: the line names the drawn race, the counter value that seeded it,
     * and the size of the shortlist it was drawn from. */
    const logs: string[] = [];
    const resolved = resolveWarriorRace(drawn(5), (message) => logs.push(message));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain(resolved.raceName);
    expect(logs[0]).toMatch(/lineage draw 5/u);
    expect(logs[0]).toMatch(/4-race shortlist/u);
    expect(logs[0]).toContain("raceRandom");

    /* The pin's line still names its race and its setting. */
    const pinnedLogs: string[] = [];
    resolveWarriorRace(pinned(2), (message) => pinnedLogs.push(message));
    expect(pinnedLogs).toHaveLength(1);
    expect(pinnedLogs[0]).toContain("High-Elf");
    expect(pinnedLogs[0]).toContain("raceChoice");
    expect(pinnedLogs[0]).toContain("raceRandom");
  });

  it("flips with the toggle: the same counter, the same stored choice, different answers", () => {
    /* The toggle is the whole gate. With the counter at 5 (draw candidate 3,
     * Dwarf) and the stored choice at 0 (Half-Troll): on draws, off pins -
     * and neither path consults the other's input. */
    expect(drawWarriorRaceIndex(5)).toBe(3);
    const on = resolveWarriorRace({ random: true, choice: 0, lineage: 5, packRaces: null }, quiet);
    const off = resolveWarriorRace({ random: false, choice: 0, lineage: 5, packRaces: null }, quiet);
    expect(on.raceName).toBe("Dwarf");
    expect(on.drawn).toBe(true);
    expect(off.raceName).toBe("Half-Troll");
    expect(off.drawn).toBe(false);
  });
});

/* ==================================================================
 * The lineage counter (src/birth/lineage.ts): persistence only
 * ==================================================================
 */

/** An install slot that holds its value in memory, like presenter.test.ts's. */
function slot(initial: JsonValue | null = null): Api2Slot & { held(): JsonValue | null } {
  let value: JsonValue | null = initial;
  return {
    get: () => Promise.resolve({ ok: true as const, value }),
    set: (next) => {
      value = next;
      return Promise.resolve({ ok: true as const, value: null });
    },
    held: () => value,
  };
}

/** A slot whose get or set is refused, as broken storage answers. */
function refusingSlot(): Api2Slot {
  return {
    get: () => Promise.resolve({ ok: false as const, reason: "refused" as const, code: "refused", message: "storage is broken" }),
    set: () => Promise.resolve({ ok: false as const, reason: "refused" as const, code: "refused", message: "storage is broken" }),
  };
}

/** A slot whose calls reject, the other shape broken storage takes. */
function throwingSlot(): Api2Slot {
  return {
    get: () => Promise.reject(new Error("storage is broken")),
    set: () => Promise.reject(new Error("storage is broken")),
  };
}

describe("the lineage counter", () => {
  it("reads a fresh install as zero, and only trusts non-negative integers", () => {
    /* The counter is ours alone; a value that is not a non-negative integer
     * (garbage, a foreign writer's shape, a negative) reads as a fresh
     * lineage rather than poisoning the draw - deterministically. */
    expect(lineageFrom(null)).toBe(0);
    expect(lineageFrom({})).toBe(0);
    expect(lineageFrom({ profileIds: ["p1"] })).toBe(0);
    expect(lineageFrom({ [LINEAGE_KEY]: 7 })).toBe(7);
    expect(lineageFrom({ [LINEAGE_KEY]: 2.5 })).toBe(0);
    expect(lineageFrom({ [LINEAGE_KEY]: -3 })).toBe(0);
    expect(lineageFrom({ [LINEAGE_KEY]: "7" })).toBe(0);
    expect(lineageFrom([1, 2])).toBe(0);
  });

  it("survives a simulated reload: a bump lands and the next page's read sees it", async () => {
    /* THE SLOT ROUND-TRIP: the write the bump makes is the value a fresh
     * read (a new page, after the reload every armed birth follows) gets
     * back. Without this, every birth would seed from 0 and the whole line
     * would play one race. */
    const held = slot({ profileIds: ["p1"] });
    expect(await readLineage(held)).toBe(0);
    expect(await bumpLineage(held)).toBe(true);
    expect(await readLineage(held)).toBe(1); /* the simulated reload */
    expect(await bumpLineage(held)).toBe(true);
    expect(await readLineage(held)).toBe(2);
    /* And the draw follows the counter it actually reads. */
    expect(resolveWarriorRace(drawn(await readLineage(held)), quiet).index).toBe(drawWarriorRaceIndex(2));
  });

  it("preserves the slot's sibling keys through every bump", async () => {
    /* The install slot is shared: the title row's profileIds, the
     * presenter's one-shot warriorBirth flag, and any later sibling. Every
     * bump is a read-modify-write that carries them forward - the same
     * discipline presenter.ts's consume and title.ts's installMemory keep
     * (#26). */
    const shared = slot({ profileIds: ["p1"], warriorBirth: true, newSibling: 42 });
    await bumpLineage(shared);
    expect(shared.held()).toEqual({ profileIds: ["p1"], warriorBirth: true, newSibling: 42, lineage: 1 });
    await bumpLineage(shared);
    expect(shared.held()).toEqual({ profileIds: ["p1"], warriorBirth: true, newSibling: 42, lineage: 2 });
  });

  it("never rejects: broken storage answers zero/false, not a throw", async () => {
    /* The wiring reads and bumps fire-and-forget from a synchronous getter;
     * a counter that could reject would be an unhandled rejection inside a
     * birth. A failed bump is benign and deterministic - the next draw
     * re-seeds from the counter that is still stored - so it is answered,
     * not raised. */
    await expect(readLineage(refusingSlot())).resolves.toBe(0);
    await expect(readLineage(throwingSlot())).resolves.toBe(0);
    await expect(bumpLineage(refusingSlot())).resolves.toBe(false);
    await expect(bumpLineage(throwingSlot())).resolves.toBe(false);
  });
});

/* ==================================================================
 * The declarations, mirrored in the manifest; the wiring, pinned
 * ==================================================================
 */

describe("the manifest declarations", () => {
  it("declares the numeric setting exactly as the resolver clamps by", () => {
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

  it("declares the raceRandom rule exactly as the wiring resolves it, ON by default", () => {
    /* The rule's default is the owner's directive (#33): ON. It is mirrored
     * field for field, the same discipline the numeric setting is pinned
     * with, because the wiring reads `mod.meta.flags[flag] ?? default` and a
     * drift would put a menu that says one thing in front of a birth that
     * does another. docs-sync.test.ts pins the docs table to the same rule. */
    const manifest = validateManifest(
      JSON.parse(readFileSync(new URL("../../manifest.json", import.meta.url), "utf8")),
    ) as { rules?: readonly PackRule[] };
    expect(manifest.rules?.find((rule) => rule.flag === RACE_RANDOM_RULE.flag)).toEqual(RACE_RANDOM_RULE);
    expect(RACE_RANDOM_RULE.default).toBe(true);
    expect(RACE_RANDOM_RULE.requiresReload).toBe(true);
    /* A rule flag may not double as a setting id (the SDK's manifest rule):
     * the toggle and the pin are two rows. */
    expect(RACE_RANDOM_RULE.flag).not.toBe(RACE_CHOICE_SETTING.id);
  });
});

describe("the wiring (plugin.ts)", () => {
  /**
   * plugin.ts's only export is the plugin object, so its birth wiring is
   * pinned from source the same way manifest-tunables.test.ts reads RULE_CFG:
   * the resolver and the counter live in src/birth (and are tested above),
   * and what this pins is that the wiring actually hands them to each other.
   */
  const wired = (): string => readFileSync(new URL("../../plugin.ts", import.meta.url), "utf8");

  it("resolves the whole policy at show, from the toggle, the choice, the counter and the pack", () => {
    expect(wired()).toMatch(/resolveWarriorRace\(\s*\{\s*random: raceRandom/u);
    expect(wired()).toMatch(/mod\.meta\.flags\[RACE_RANDOM_RULE\.flag\] \?\? RACE_RANDOM_RULE\.default/u);
  });

  it("reads the counter once per page and bumps it after a draw", () => {
    expect(wired()).toMatch(/readLineage\(mod\.store\.install\)/u);
    expect(wired()).toMatch(/bumpLineage\(mod\.store\.install\)/u);
  });
});
