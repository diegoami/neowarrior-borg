/**
 * The player's toggles, the settings they move, and upstream's own defaults must
 * agree - all three, at build time.
 *
 * WHY THIS NEEDS A TEST. A settings surface has three halves that are edited in
 * different files on different days: a `rules` entry in manifest.json is what a
 * player sees, `RULE_CFG` in plugin.ts is what turns a flag into a setting, and
 * `defaultCfg()` in src/trait/config.ts is what the ported decision code reads
 * when nobody said otherwise. Every disagreement between them is silent:
 *
 *   - A rule with no entry in RULE_CFG is a switch in the mod manager that moves
 *     nothing. It has a title, a description and a tick, and the Borg ignores it.
 *   - An entry in RULE_CFG with no rule is a setting no player can reach.
 *   - A rule whose `default` differs from `defaultCfg()` means the menu says one
 *     thing and a Borg built with no flags at all does another - and two of these
 *     settings ship ON, so this is not a theoretical direction.
 *
 * None of the three shows up in a game that plays. So the check is derived:
 * read the manifest, read the table out of plugin.ts, and compare both against
 * the port's own defaults and against upstream's `borg_settings[]`.
 */

import { describe, expect, it } from "vitest";
import { validateManifest } from "@rpgm-tools/neo-angband-mod-sdk";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultCfg, type BorgCfg } from "./trait/config.js";

const srcRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(srcRoot);

interface Rule {
  readonly flag: string;
  readonly title: string;
  readonly description: string;
  readonly default: boolean;
}

interface Manifest {
  readonly rules: readonly Rule[];
}

function manifest(): Manifest {
  return validateManifest(JSON.parse(readFileSync(join(repoRoot, "manifest.json"), "utf8"))) as Manifest;
}

/**
 * `RULE_CFG` as plugin.ts declares it, read out of the source.
 *
 * Parsed rather than imported because plugin.ts's only export is the plugin
 * object, and widening that surface so a test can see a private table would put
 * the table in the mod's ABI. The shape it matches is the literal one written in
 * the file, so a rewrite into some other form fails the non-vacuity check below
 * rather than passing on an empty parse.
 */
function ruleCfg(): Map<string, string> {
  const text = readFileSync(join(repoRoot, "plugin.ts"), "utf8");
  const block = /const RULE_CFG[^{]*\{([^}]*)\}/u.exec(text);
  expect(block, "RULE_CFG is no longer a plain object literal in plugin.ts").not.toBeNull();
  const out = new Map<string, string>();
  for (const m of (block?.[1] ?? "").matchAll(/"([\w.]+)"\s*:\s*"(\w+)"/gu)) {
    out.set(m[1]!, m[2]!);
  }
  return out;
}

/**
 * The FORK's own birth rules (T09, #33): toggles that gate the fork's birth
 * pipeline rather than the ported decision code. plugin.ts's warriorBirth
 * wiring reads them from the resolved rule flags at each page; they have no
 * `borg_cfg[]` counterpart because upstream's Borg has no counterpart to
 * them at all (its host reincarnates an autoplayer randomly, which is what
 * this fork exists not to do). They are pinned against the manifest - and
 * against the wiring that resolves them - in src/birth/settings.test.ts
 * instead, the same way the numeric settings are.
 */
const FORK_BIRTH_RULES = new Set(["borg.raceRandom"]);

/**
 * Upstream's `borg_settings[]` (borg-init.c:57-92), for the settings this mod
 * surfaces. Restated here rather than read from reference/, which lives in the
 * game's repository and not this one - so the value of the check is that a
 * default cannot be changed in config.ts alone without a second, deliberate
 * edit that says what upstream's number is.
 */
const UPSTREAM_DEFAULT: Readonly<Partial<Record<keyof BorgCfg, boolean | number>>> = {
  worshipsDamage: false,
  worshipsSpeed: false,
  worshipsHp: false,
  worshipsMana: false,
  worshipsAc: false,
  worshipsGold: false,
  playsRisky: false,
  killsUniques: false,
  usesSwaps: true,
  selfScum: true,
  usesDynamicCalcs: false,
  noDeeper: 127,
  munchkinStart: false,
  munchkinLevel: 12,
  enchantLimit: 12,
};

describe("the Borg's settings", () => {
  it("keeps every default on upstream's own value", () => {
    const stock = defaultCfg();
    for (const [key, value] of Object.entries(UPSTREAM_DEFAULT)) {
      expect(stock[key as keyof BorgCfg], `${key} default`).toBe(value);
    }
    /* Every setting is accounted for, so a new one cannot arrive with an
       invented default and no comparison against the C. */
    expect(Object.keys(stock).sort()).toEqual(Object.keys(UPSTREAM_DEFAULT).sort());
  });

  it("maps every toggle a player can see to a setting the port reads", () => {
    const table = ruleCfg();
    expect(table.size, "RULE_CFG parsed empty").toBeGreaterThan(0);
    const stock = defaultCfg();
    /* FORK_BIRTH_RULES are read by the birth wiring, not through BorgCfg
     * (see the set's comment); everything else must map to a real setting. */
    const flags = manifest().rules.filter((r) => !FORK_BIRTH_RULES.has(r.flag)).map((r) => r.flag);

    expect([...table.keys()].sort()).toEqual([...flags].sort());
    for (const [flag, key] of table) {
      expect(stock, `${flag} -> ${key}`).toHaveProperty(key);
    }
  });

  it("shows the same default in the menu as the Borg runs on", () => {
    const table = ruleCfg();
    const stock = defaultCfg();
    for (const rule of manifest().rules) {
      if (FORK_BIRTH_RULES.has(rule.flag)) continue; /* birth side; no cfg key */
      const key = table.get(rule.flag);
      expect(key, `${rule.flag} has no setting`).toBeDefined();
      expect(stock[key as keyof BorgCfg], `${rule.flag} default`).toBe(rule.default);
    }
  });

  it("says which upstream setting each toggle is", () => {
    /* The descriptions carry the borg_cfg name because somebody arriving from
       upstream's borg.txt has a name in hand and no other way to find the row
       that means it. Also a cheap guard against a copied description that was
       never edited. FORK_BIRTH_RULES are excepted on purpose: they are this
       fork's own toggles and there is no upstream name to carry - their
       descriptions say so outright. */
    const seen = new Set<string>();
    for (const rule of manifest().rules) {
      if (!FORK_BIRTH_RULES.has(rule.flag)) {
        expect(rule.description, `${rule.flag} names no borg_ setting`).toMatch(/\bborg_\w+\b/u);
      }
      expect(seen.has(rule.title), `${rule.title} is used twice`).toBe(false);
      seen.add(rule.title);
    }
  });

  it("does not expose a standing autoplay toggle in the manifest", () => {
    /* Keyboard handover is Ctrl-Z in the host, not a Fixes & tweaks row. A
       rule named borg.autoplay would put "let it play" back on the settings
       screen next to the play-style toggles. */
    expect(manifest().rules.some((r) => r.flag === "borg.autoplay")).toBe(false);
    expect(ruleCfg().has("borg.autoplay")).toBe(false);
  });
});
