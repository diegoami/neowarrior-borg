#!/usr/bin/env node
/**
 * Run the T07 race bake-off for ONE engine variant and write the record's
 * runs.json (T07, #10).
 *
 * The sweep: every candidate race (src/birth/settings.ts's order - the
 * raceChoice setting's options) crossed with the SAME fixed seed list, one
 * life per (race, seed) cell at one decision cap, through the same session
 * driver (src/records/session.ts) tools/runs.mjs uses - so the committed
 * T06 baseline and this sweep cannot drift apart on two drivers. Each life
 * is guarded by assertBakeoffBuild: the live player's race/class/statBirth
 * must be the plan for that cell, or the sweep fails naming the cell.
 *
 * WHY A TOOL, NOT A SUITE TEST: 4 races x 8 seeds x cap 600 is around an
 * hour of real play per engine variant; the suite's smoke test
 * (src/measure/bakeoff.test.ts) pins the sweep's parameterization instead
 * (the grid, the guard, the median), and this tool carries the heavy runs.
 *
 * THE TWO ENGINE VARIANTS are applied OUTSIDE this tool, by hand, and
 * byte-proven (md5 before/after, cmp on restore) - the protocol T07.md
 * amended in. The tool only LABELS every run with --variant and records
 * what --engine-note declares, so the JSON never invents an engine fact:
 *
 *   pin            the published @rpgm-tools/neo-angband-core as installed,
 *                  door-close engine gap (#12 / neo-angband#428) included
 *   patched-engine the installed engine's dist/game/trap.js with B01's
 *                  noteSpot call in installChunkFeatHook, applied for the
 *                  variant and reverted after it
 *
 * Usage (typical - the record is written in two invocations):
 *
 *   node tools/bakeoff.mjs --out docs/runs/2026-11-02-bakeoff --variant pin \
 *       --engine-note "dist/game/trap.js md5 c89b1b... (as published)"
 *   # ...apply the patch by hand, md5-prove it...
 *   node tools/bakeoff.mjs --out docs/runs/2026-11-02-bakeoff \
 *       --variant patched-engine --append \
 *       --engine-note "dist/game/trap.js + noteSpot in installChunkFeatHook, md5 <after>"
 *   # ...revert by hand, cmp-prove it...
 *
 *   [--seeds 1,7,20,23,34,42,49,99] [--cap 600] [--races Half-Troll,...]
 *   [--content "sibling checkout neo-angband at <sha>"] [--recorded YYYY-MM-DD]
 *
 * --append refuses to overwrite: it requires the existing runs.json to carry
 * the same recorded date, seeds, cap, races and content, and no run of this
 * variant yet. Without --append it refuses to clobber an existing runs.json.
 * Per-run entries are built by the reporter (sessionRunsDocument) and then
 * carry two sweep fields of their own: `variant`, and `deathDepth` (the
 * live chunk's depth at the run's end - 0 is a town death; null when the
 * warrior survived its slice). Prints the per-life table and per-race
 * medians the README is curated from.
 */

import { build } from "esbuild";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function arg(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  if (at === -1) return fallback;
  const value = process.argv[at + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`--${name} needs a value`);
  return value;
}

const outDir = arg("out", null);
const variant = arg("variant", null);
if (outDir === null || variant === null) {
  console.error(
    "usage: node tools/bakeoff.mjs --out docs/runs/<label> --variant pin|patched-engine [--append]\n" +
      "       [--seeds 1,7,20,23,34,42,49,99] [--cap 600] [--races Half-Troll,Dunadan,High-Elf,Dwarf]\n" +
      '       [--content <words>] [--engine-note <words>] [--recorded YYYY-MM-DD]',
  );
  process.exit(1);
}
const seeds = arg("seeds", "1,7,20,23,34,42,49,99").split(",").map((text) => Number(text.trim())).filter((n) => Number.isInteger(n));
const cap = Number(arg("cap", "600"));
const races = arg("races", undefined)?.split(",").map((text) => text.trim()).filter((text) => text.length > 0);
const append = process.argv.includes("--append");
const content = arg("content", "the sibling checkout this harness ran against");
const engineNote = arg("engine-note", "engine state not declared: pass --engine-note");
const recorded = arg("recorded", new Date().toISOString().slice(0, 10));

/* The bundle: one file in git-ignored artifacts/, engine and SDK external so
 * the published copies in node_modules are the ones that run - the same
 * discipline tools/runs.mjs follows, so both tools drive one driver. */
const bundle = join(repoRoot, "artifacts", ".bakeoff-sweep.mjs");
await build({
  stdin: {
    contents:
      'export * from "./src/records/session.js";\n' +
      'export * from "./src/records/reporter.js";\n' +
      'export { WARRIOR_RACE_CANDIDATES } from "./src/birth/settings.js";\n' +
      'export * from "./src/measure/bakeoff.js";\n',
    resolveDir: repoRoot,
    loader: "js",
  },
  outfile: bundle,
  bundle: true,
  format: "esm",
  platform: "node",
  external: ["@rpgm-tools/*"],
  logLevel: "silent",
});

const {
  packRoot, loadPack, playWarriorSession, warriorSessionPlan,
  runsBuildFacts, enginePin, sessionRunsDocument,
  WARRIOR_RACE_CANDIDATES, bakeoffCells, bakeoffMedian, assertBakeoffBuild,
} = await import(new URL(`file://${bundle}`).href);

const packDir = packRoot();
if (packDir === null) {
  console.error("no content pack: set NEO_ANGBAND_REPO or check out neo-angband as a sibling (docs/process.md §1)");
  process.exit(1);
}
const raceList = races ?? [...WARRIOR_RACE_CANDIDATES];

/* THE GRID: complete cross product, duplicates refused - a dropped or
 * repeated cell would skew a race's medians and the table would lie. */
const cells = bakeoffCells(raceList, seeds);

const target = resolve(repoRoot, outDir);
const runsPath = join(target, "runs.json");
if (!append && existsSync(runsPath)) {
  console.error(`${runsPath} already exists: pass --append to add a variant to it, never overwrite one`);
  process.exit(1);
}
let existing = null;
if (append) {
  existing = JSON.parse(readFileSync(runsPath, "utf8"));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (existing.recorded !== recorded) throw new Error(`--recorded ${recorded} does not match the record's ${existing.recorded}`);
  if (!same(existing.build.seeds, seeds)) throw new Error("--seeds do not match the record's seeds; a variant must run the same cells");
  if (existing.build.caps.decisions !== cap) throw new Error("--cap does not match the record's cap; a variant must run the same budget");
  if (!same(existing.build.races, raceList)) throw new Error("--races do not match the record's races");
  if (existing.build.content !== content) throw new Error("--content does not match the record's content");
  if (existing.runs.some((run) => run.variant === variant)) throw new Error(`runs.json already carries the variant "${variant}"`);
}

const pack = loadPack(packDir);
const say = (message) => process.stderr.write(`[bakeoff ${variant}] ${message}\n`);

/* ONE LIFE PER CELL, each its own single-seed session: no cell can be gated
 * on another cell's survivor (a session chains on deaths), and a stall on
 * the pin - the door-close engine gap - stays a recorded fact of ITS cell
 * instead of swallowing the rest of the race's row. */
const entries = [];
for (const cell of cells) {
  const plan = warriorSessionPlan(pack, cell.race);
  say(`playing ${cell.race} on seed ${cell.seed} (cap ${cap})`);
  const startedAt = Date.now();
  const session = await playWarriorSession(pack, {
    seeds: [cell.seed],
    capFor: () => cap,
    raceName: cell.race,
    log: (message) => say(`[borg] ${message}`),
  });
  const life = session.lives[0];
  if (session.lives.length !== 1 || life === undefined) {
    throw new Error(`${variant} ${cell.race} seed ${cell.seed}: a single-seed session returned ${session.lives.length} lives`);
  }
  /* The boot guard: this life must be the planned warrior for its cell, read
   * from the live player by the driver. */
  assertBakeoffBuild(life, plan, `${variant} ${cell.race} seed ${cell.seed}`);
  if (life.seed !== cell.seed) throw new Error(`${variant}: asked for seed ${cell.seed}, got ${life.seed}`);
  if (life.decisions > cap) throw new Error(`${variant} ${cell.race} seed ${cell.seed}: ${life.decisions} decisions over cap ${cap}`);

  /* The entry is the REPORTER's (never hand-assembled), plus the two fields
   * the sweep owns: which engine variant played it, and where it ended. */
  const reported = sessionRunsDocument({
    recorded,
    facts: runsBuildFacts({ repoRoot, content, seeds: [cell.seed], caps: { decisions: cap } }),
    runs: [{
      seed: life.seed,
      race: life.race,
      className: life.className,
      baseStats: life.baseStats,
      decisions: life.decisions,
      turns: life.turns,
      maxDepth: life.maxDepth,
      clvl: life.clvl,
      kills: life.kills,
      gold: life.gold,
      causeOfDeath: life.causeOfDeath,
      commands: life.commands,
    }],
  }).runs[0];
  entries.push({ variant, ...reported, deathDepth: life.dead ? life.endDepth : null });
  say(
    `done ${cell.race} seed ${cell.seed} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s: ` +
      `${life.dead ? `died to ${life.causeOfDeath ?? "?"} on depth ${life.endDepth}` : "SURVIVED its slice"}` +
      ` (depth ${life.maxDepth}, clvl ${life.clvl}, ${life.decisions} decisions, ${life.turns} turns)`,
  );
}

/* THE DOCUMENT: the T06 build facts (mod, engine pin, content, seeds, caps)
 * plus what the sweep adds - the race order and the variant declarations,
 * each variant's note carrying the byte-proof words handed in. */
const variantDeclaration = { name: variant, engine: enginePin(repoRoot), note: engineNote };
let document;
if (append) {
  document = {
    ...existing,
    build: { ...existing.build, variants: [...existing.build.variants, variantDeclaration] },
    runs: [...existing.runs, ...entries],
  };
} else {
  const facts = runsBuildFacts({ repoRoot, content, seeds, caps: { decisions: cap } });
  document = { recorded, build: { ...facts, races: [...raceList], variants: [variantDeclaration] }, runs: entries };
}
mkdirSync(target, { recursive: true });
writeFileSync(runsPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");

/* The numbers the README's tables are curated from. */
console.log(`wrote ${join(outDir, "runs.json")} - variant ${variant}, ${entries.length} lives`);
for (const entry of entries) {
  console.log(
    `  seed ${String(entry.seed).padStart(3)}  depth ${String(entry.maxDepth).padStart(2)}  clvl ${String(entry.clvl).padStart(2)}  ` +
      `decisions ${String(entry.decisions).padStart(4)}  turns ${String(entry.turns).padStart(6)}  kills ${String(entry.kills).padStart(3)}  ` +
      `${entry.deathDepth === null ? "survived its slice" : `died on depth ${String(entry.deathDepth)} to ${entry.causeOfDeath ?? "?"}`}`,
  );
}
for (const race of raceList) {
  const mine = entries.filter((entry) => entry.build.race === race);
  const dead = mine.filter((entry) => entry.deathDepth !== null);
  const town = dead.filter((entry) => entry.deathDepth === 0).length;
  const census = new Map();
  for (const entry of mine) for (const [code, count] of Object.entries(entry.commands)) census.set(code, (census.get(code) ?? 0) + count);
  const totalCommands = [...census.values()].reduce((a, b) => a + b, 0);
  const top = [...census.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([code, count]) => `${code} ${count} (${((count / totalCommands) * 100).toFixed(0)}%)`);
  console.log(
    `${variant} ${race}:  deaths ${dead.length}/${mine.length} (town ${town}, dungeon ${dead.length - town})  ` +
      `median depth ${bakeoffMedian(mine.map((e) => e.maxDepth))}  best ${Math.max(...mine.map((e) => e.maxDepth))}  ` +
      `median clvl ${bakeoffMedian(mine.map((e) => e.clvl))}  best ${Math.max(...mine.map((e) => e.clvl))}  ` +
      `median kills ${bakeoffMedian(mine.map((e) => e.kills ?? 0))}  total ${mine.reduce((a, e) => a + (e.kills ?? 0), 0)}  ` +
      `census: ${top.join(", ")}  close ${census.get("close") ?? 0}`,
  );
}
const survivors = entries.filter((entry) => entry.deathDepth === null);
if (survivors.length > 0) {
  console.log(
    `SURVIVED their slice (${survivors.length}): ${survivors.map((e) => `${e.build.race} seed ${e.seed} (depth ${e.maxDepth}, turns ${e.turns})`).join("; ")}`,
  );
}
