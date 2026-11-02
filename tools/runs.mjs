#!/usr/bin/env node
/**
 * Write a run record's runs.json by PLAYING a session (T06, #9).
 *
 * Rule 1: a change without a record is an unmeasured change, and rule 7 says
 * the record is committed. This tool is how the raw half of it gets onto
 * disk: it plays a headless warrior session through the same driver the
 * play test drives (src/records/session.ts - the journal installed per
 * character, the engine's own arrival events, the reporter's schema) and
 * writes the runs.json the curated README beside it is written FROM, never
 * the other way round. The same driver serves T07's bake-off sweep, so the
 * committed baseline and the sweep cannot drift apart on two drivers.
 *
 * THE BUNDLE STEP is because the driver is TypeScript and a tool is not a
 * test: vitest transforms, plain node does not. esbuild (already a
 * devDependency of the plugin build) bundles the driver and the reporter
 * into git-ignored artifacts/ with the engine left external - node_modules
 * resolves it from inside the repository, exactly as the play tests resolve
 * it.
 *
 * Usage:
 *
 *   node tools/runs.mjs --out docs/runs/2026-11-02-t06-first-warrior-session \
 *       [--seeds 20,23,34,49] [--cap 600] [--race Half-Troll]
 *       [--content "sibling checkout neo-angband master at <sha>"]
 *
 * The date is today's unless --recorded says otherwise. Prints the numbers
 * the README's table wants; the table itself is curated by hand.
 */

import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
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
if (outDir === null) {
  console.error("usage: node tools/runs.mjs --out docs/runs/<label> [--seeds 20,23,34,49] [--cap 600] [--content <words>]");
  process.exit(1);
}
const seeds = arg("seeds", "20,23,34,49").split(",").map((text) => Number(text.trim())).filter((n) => Number.isInteger(n));
const cap = Number(arg("cap", "600"));
const raceName = arg("race", undefined);
const content = arg("content", "the sibling checkout this harness ran against");
const recorded = arg("recorded", new Date().toISOString().slice(0, 10));

/* The bundle: one file in git-ignored artifacts/, engine and SDK external so
 * the published copies in node_modules are the ones that run. The little
 * stdin entry re-exports both halves so one import serves the tool. */
const bundle = join(repoRoot, "artifacts", ".runs-session.mjs");
await build({
  stdin: {
    contents: 'export * from "./src/records/session.js";\nexport * from "./src/records/reporter.js";\n',
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

const { packRoot, loadPack, playWarriorSession, runsBuildFacts, sessionRunsDocument } = await import(
  new URL(`file://${bundle}`).href
);

/* The pack: same resolution the play tests use (NEO_ANGBAND_REPO, then the
 * sibling checkout); without it there is nothing to play. */
const packDir = packRoot();
if (packDir === null) {
  console.error("no content pack: set NEO_ANGBAND_REPO or check out neo-angband as a sibling (docs/process.md §1)");
  process.exit(1);
}

const lines = [];
const session = await playWarriorSession(loadPack(packDir), {
  seeds,
  capFor: () => cap,
  ...(raceName === undefined ? {} : { raceName }),
  log: (message) => lines.push(`[borg] ${message}`),
});

const document = sessionRunsDocument({
  recorded,
  facts: runsBuildFacts({ repoRoot, content, seeds, caps: { decisions: cap } }),
  runs: session.lives.map((life) => ({
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
  })),
});

const target = resolve(repoRoot, outDir);
mkdirSync(target, { recursive: true });
writeFileSync(join(target, "runs.json"), `${JSON.stringify(document, null, 2)}\n`, "utf8");

/* The numbers the README's table wants, on stdout; the log lines are the
 * mod's own view of the session and go to stderr so a redirected stdout
 * stays a table. */
for (const line of lines) console.error(line);
const deepest = Math.max(...session.lives.map((life) => life.maxDepth));
const deaths = session.lives.filter((life) => life.dead).length;
console.log(`wrote ${join(outDir, "runs.json")}`);
console.log(`lives: ${session.lives.length}  deaths: ${deaths}  deepest: ${deepest}`);
for (const life of session.lives) {
  console.log(
    `  seed ${String(life.seed).padStart(3)}  depth ${String(life.maxDepth).padStart(2)}  clvl ${String(life.clvl).padStart(2)}  ` +
      `decisions ${String(life.decisions).padStart(4)}  turns ${String(life.turns).padStart(6)}  kills ${String(life.kills).padStart(3)}  ` +
      `gold ${String(life.gold).padStart(5)}  ${life.dead ? `died to ${life.causeOfDeath ?? "?"}` : "survived its slice"}`,
  );
}
