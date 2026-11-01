/** Engine bindings are undefined before controller installation, so module initializers must defer those reads. */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = dirname(fileURLToPath(import.meta.url));

/** The live bindings core-api.ts fills. Reading any of these early is the bug. */
const LATE_BOUND = ["FEAT", "TV", "RSF", "MON_RACE_FLAG_ENTRIES", "MON_SPELL_ENTRIES"];
const NAME_RE = new RegExp(`\\b(${LATE_BOUND.join("|")})\\b`, "u");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

/**
 * Lines at brace depth 0 that name a late-bound symbol in a position that
 * EXECUTES on import: an initialiser, essentially.
 *
 * Declaration headers are not executions - `function f(x: Rng): Rng` mentions
 * Rng twice and runs neither - so a line introducing a function or a type is
 * skipped. So are comments, imports and re-exports.
 */
function topLevelReads(text: string): string[] {
  const hits: string[] = [];
  let depth = 0;
  /* Depth alone is not enough, and the first draft of this test proved it: the
   * shape that actually broke was
   *
   *   const WEAPON_TVALS = [
   *     TV.DIGGING,      <- depth 1, so "not top level", but it runs on import
   *   ];
   *
   * A top-level initialiser executes across every line it spans, so once one
   * opens, scanning continues until it closes. */
  let inInitialiser = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const skip =
      line.startsWith("*") ||
      line.startsWith("//") ||
      line.startsWith("/*") ||
      line.startsWith("import ") ||
      line.startsWith("export {") ||
      line.startsWith("export type") ||
      line.startsWith("export let") ||
      line.startsWith("type ") ||
      /^(export\s+)?(async\s+)?function\b/u.test(line) ||
      /^(export\s+)?(abstract\s+)?class\b/u.test(line) ||
      /^(export\s+)?interface\b/u.test(line);

    if (depth === 0 && !inInitialiser && !skip && /^(export\s+)?(const|let|var)\b/u.test(line)) {
      /* ...unless the initialiser IS a function. `const f = () => { ... }` binds
       * a function on import and runs its body later, so its span is not a
       * top-level execution.
       *
       * THE ONE THING THIS MISSES, stated rather than discovered later: an
       * initialiser that both mentions a function and calls it immediately -
       * `const x = [1, 2].map(() => TV.SWORD)`, or an IIFE. Those do run on
       * import and this scan will not see them. No such site exists in the port,
       * and the shape that does exist (a plain array or object literal) is the
       * one caught above. */
      inInitialiser = !/=>|\bfunction\b/u.test(line);
    }

    if ((depth === 0 || inInitialiser) && !skip && NAME_RE.test(line)) {
      hits.push(line.slice(0, 100));
    }

    depth += (raw.match(/[{[(]/gu)?.length ?? 0) - (raw.match(/[}\])]/gu)?.length ?? 0);
    if (depth < 0) depth = 0;
    /* An initialiser that has closed its brackets and terminated is over. An
     * arrow-function initialiser therefore stops counting at its own `};` -
     * correct, because its BODY does not run on import. */
    if (inInitialiser && depth === 0 && line.endsWith(";")) inInitialiser = false;
  }
  return hits;
}

describe("no engine value is read before bindCore", () => {
  const files = sourceFiles(srcRoot);

  it("scans the whole port, so an empty scan cannot pass", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("catches a top-level read when it sees one", () => {
    // The guard's own guard: prove it fires on the exact shape that broke, and
    // stays quiet on the shape that replaced it.
    // The exact shape that broke, spanning lines - the case brace depth misses.
    expect(topLevelReads("const WEAPON_TVALS = [\n  TV.DIGGING,\n];")).not.toEqual([]);
    // And on one line.
    expect(topLevelReads("const x = TV.SWORD;")).not.toEqual([]);
    // The replacement: the read is inside a function body, which runs later.
    expect(topLevelReads("function weaponTvals() {\n  return [TV.DIGGING];\n}")).toEqual([]);
    // A signature mentions the type twice and executes neither.
    expect(topLevelReads("function f(rng: Rng): Rng {\n  return rng;\n}")).toEqual([]);
    // An arrow-function initialiser: the binding runs on import, its body does not.
    expect(topLevelReads("const f = (): number => {\n  return TV.SWORD;\n};")).toEqual([]);
    // core-api.ts's own declarations are declarations, not reads.
    expect(topLevelReads("export let FEAT!: typeof Core.FEAT;")).toEqual([]);
  });

  it("finds none in the port", () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const line of topLevelReads(readFileSync(f, "utf8"))) {
        offenders.push(`${relative(srcRoot, f).replaceAll("\\", "/")}: ${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
