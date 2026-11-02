/**
 * TESTS FOR THE REPORTER: the runs.json schema, field by field.
 *
 * docs/runs/README.md is the contract - one entry per character with build,
 * seed, decisions, turns, maxDepth, clvl, kills, gold, causeOfDeath and the
 * command census, plus the session's build facts - and the import baseline's
 * runs.json already pinned two of the names (`recorded`, `build`). These
 * tests assert each field against a KNOWN input rather than snapshotting the
 * function's own output, because a snapshot would pass against a function
 * that returned its own name for everything.
 *
 * The build facts are read from THIS repository's manifest.json and
 * package.json, so a bumped version or engine pin that stopped reaching the
 * record fails here rather than shipping a runs.json that lies about what
 * played.
 */

import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { enginePin, modFacts, runsBuildFacts, sessionRunsDocument, type RunsRunInput } from "./reporter.js";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/** One measured life, the shape src/records/session.ts returns. */
function life(over: Partial<RunsRunInput> = {}): RunsRunInput {
  return {
    seed: 20,
    race: "Half-Troll",
    className: "Warrior",
    baseStats: [18, 10, 10, 10, 17],
    decisions: 123,
    turns: 4567,
    maxDepth: 1,
    clvl: 1,
    kills: 3,
    gold: 42,
    causeOfDeath: "a grey mold",
    commands: { walk: 40, descend: 1, rest: 5 },
    ...over,
  };
}

describe("the runs.json reporter", () => {
  it("emits one entry per character with every field the schema names", () => {
    const document = sessionRunsDocument({
      recorded: "2026-11-02",
      facts: runsBuildFacts({ repoRoot, content: "the sibling checkout", seeds: [20, 23], caps: { decisions: 600 } }),
      runs: [life(), life({ seed: 23, kills: null, causeOfDeath: null })],
    });

    /* The session's own fields. */
    expect(document.recorded).toBe("2026-11-02");
    expect(document.build.seeds).toEqual([20, 23]);
    expect(document.build.caps).toEqual({ decisions: 600 });
    expect(document.build.content).toBe("the sibling checkout");

    /* THE FIRST ENTRY, FIELD BY FIELD, against the input that produced it. */
    const first = document.runs[0]!;
    expect(first.seed).toBe(20);
    expect(first.build).toEqual({ race: "Half-Troll", class: "Warrior", baseStats: [18, 10, 10, 10, 17] });
    expect(first.decisions).toBe(123);
    expect(first.turns).toBe(4567);
    expect(first.maxDepth).toBe(1);
    expect(first.clvl).toBe(1);
    expect(first.kills).toBe(3);
    expect(first.gold).toBe(42);
    expect(first.causeOfDeath).toBe("a grey mold");
    expect(first.commands).toEqual({ walk: 40, descend: 1, rest: 5 });

    /* A survivor's entry may carry no killer and no kills: null, never 0 or
     * a guess. */
    const second = document.runs[1]!;
    expect(second.causeOfDeath).toBeNull();
    expect(second.kills).toBeNull();
    expect(document.runs).toHaveLength(2);
  });

  it("adds nothing it was not handed: the entries are the input, copied", () => {
    const runs = [life()];
    const document = sessionRunsDocument({
      recorded: "2026-11-02",
      facts: runsBuildFacts({ repoRoot, content: "x", seeds: [20], caps: { decisions: 600 } }),
      runs,
    });
    expect(document.runs[0]!.commands).not.toBe(runs[0]!.commands);
    expect(document.runs[0]!.build.baseStats).not.toBe(runs[0]!.baseStats);
    expect(Object.keys(document.runs[0]!).sort()).toEqual(
      ["build", "causeOfDeath", "clvl", "commands", "decisions", "gold", "kills", "maxDepth", "seed", "turns"].sort(),
    );
  });

  it("reads the mod's facts from this repository's own manifest", () => {
    /* manifest.json is what the game installs, so the record names what the
     * game would say this mod is, not what package.json claims. */
    const mod = modFacts(repoRoot);
    expect(mod.name).toBe("Warrior Borg");
    expect(mod.version).toMatch(/^\d+\.\d+\.\d+/u);

    const facts = runsBuildFacts({ repoRoot, content: "x", seeds: [1], caps: { decisions: 1 } });
    expect(facts.mod).toBe(`${mod.name} ${mod.version}`);
    /* The engine pin is the devDependency the harness boots. */
    expect(facts.engine).toBe(enginePin(repoRoot));
    expect(enginePin(repoRoot)).toMatch(/^@rpgm-tools\/neo-angband-core \d/u);
  });

  it("says loud unknowns rather than silent guesses when the repository cannot be read", () => {
    expect(modFacts("/nowhere-at-all").name).toBe("unknown mod");
    expect(enginePin("/nowhere-at-all")).toBe("@rpgm-tools/neo-angband-core (unpinned)");
  });

  it("serializes to the JSON the runs directory commits", () => {
    /* The committed artifact is stable: a fixed input gives byte-stable JSON
     * (field order included), so two sessions diff by their numbers, not by
     * their key order. */
    const text = JSON.stringify(
      sessionRunsDocument({
        recorded: "2026-11-02",
        facts: { mod: "Warrior Borg 0.1.0", engine: "@rpgm-tools/neo-angband-core 1.23.0-beta.1", content: "sibling checkout", seeds: [20], caps: { decisions: 600 } },
        runs: [life()],
      }),
      null,
      2,
    );
    const back = JSON.parse(text) as ReturnType<typeof sessionRunsDocument>;
    expect(back.runs[0]!.build.race).toBe("Half-Troll");
    expect(back.build.mod).toBe("Warrior Borg 0.1.0");
  });
});
