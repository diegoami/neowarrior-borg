/**
 * The Borg reads two hidden facts and no others (neostryder/neo-angband#415).
 *
 * `truth` shows more than the character knows. src/api2/truth.ts lists each read
 * the Borg may make with its reason, and this file fails when any other `truth`
 * member is touched from the mod's own code, so a new hidden read is a deliberate
 * edit to that list. The real map (`truth.level`) and the store's whole stock
 * (`truth.storeKnowledge`) are the two reads this exists to keep out.
 */

import { describe, expect, it } from "vitest";
import ts from "typescript";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { TRUTH_ALLOWLIST } from "./api2/truth.js";

const srcRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(srcRoot);

/** The fake game answers every `truth` member so a test can prove the Borg never asks for the others. */
const FAKES = new Set(["src/harness-api2.ts"]);

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(p);
    }
  };
  walk(srcRoot);
  for (const name of readdirSync(repoRoot)) if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(join(repoRoot, name));
  return out;
}

/** The one file that holds the host's `truth` domain: its own variable named `truth` is the domain. Everywhere else a variable named `truth` is the Borg's allowlisted wrapper. */
const HOME = "src/api2/truth.ts";

/** Whether an expression is the `truth` domain itself: `mod.truth`, `api?.truth`, or in the home file the bare `truth`, with or without a cast. */
function isTruth(node: ts.Expression, home: boolean): boolean {
  let base = node;
  while (ts.isParenthesizedExpression(base) || ts.isAsExpression(base) || ts.isNonNullExpression(base) || ts.isSatisfiesExpression(base)) base = base.expression;
  if (ts.isIdentifier(base)) return home && base.text === "truth";
  if (ts.isPropertyAccessExpression(base)) return base.name.text === "truth";
  if (ts.isElementAccessExpression(base)) return ts.isStringLiteralLike(base.argumentExpression) && base.argumentExpression.text === "truth";
  return false;
}

/** Every `truth` member the text reads, by name. A destructuring or a bare use of the domain counts as "everything". */
export function truthReads(text: string, home = false): string[] {
  const source = ts.createSourceFile("source.ts", text, ts.ScriptTarget.Latest, true);
  const found = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node) && isTruth(node.expression, home)) found.add(node.name.text);
    if (ts.isElementAccessExpression(node) && isTruth(node.expression, home)) found.add(ts.isStringLiteralLike(node.argumentExpression) ? node.argumentExpression.text : "(computed)");
    if (!home && ts.isVariableDeclaration(node) && node.initializer && isTruth(node.initializer, home)) found.add(ts.isIdentifier(node.name) ? "(alias)" : "(destructured)");
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...found];
}

describe("the Borg's hidden reads", () => {
  const files = sourceFiles().map((p) => ({ p, rel: relative(repoRoot, p).replaceAll("\\", "/") }));
  const allowed = TRUTH_ALLOWLIST.map((read) => read.call);
  /* The rest of the port holds the wrapper (BorgTruth), whose members are `perceivedMonsters` and `race`, behind a field also named `truth`. Whatever it can ask is fixed by the home file, which this test holds to the list above. */
  const wrapper: readonly string[] = [...allowed, "perceivedMonsters"];

  it("names each read with what it takes and why the known world is not enough", () => {
    expect(allowed).toEqual(["monsters", "race"]);
    for (const read of TRUTH_ALLOWLIST) {
      expect(read.takes.length).toBeGreaterThan(20);
      expect(read.reason.length).toBeGreaterThan(40);
    }
  });

  it("makes no hidden read that is not on the list", () => {
    expect(files.length).toBeGreaterThan(50);
    const offenders = files
      .filter((f) => !FAKES.has(f.rel))
      .map((f) => ({ file: f.rel, reads: truthReads(readFileSync(f.p, "utf8"), f.rel === HOME).filter((name) => !(f.rel === HOME ? allowed : wrapper).includes(name)) }))
      .filter((o) => o.reads.length > 0);
    expect(offenders).toEqual([]);
  });

  it("makes each listed read somewhere, so the list never names a read the code dropped", () => {
    const used = new Set(files.filter((f) => !FAKES.has(f.rel)).flatMap((f) => truthReads(readFileSync(f.p, "utf8"), f.rel === HOME)));
    for (const call of allowed) expect(used.has(call)).toBe(true);
    expect(used.has("perceivedMonsters")).toBe(true);
  });

  it("catches the reads it exists to keep out", () => {
    expect(truthReads("await mod.truth.level();")).toEqual(["level"]);
    expect(truthReads("await mod.truth?.storeKnowledge();")).toEqual(["storeKnowledge"]);
    expect(truthReads('mod.truth["level"]()')).toEqual(["level"]);
    expect(truthReads("truth.level()", true)).toEqual(["level"]);
    expect(truthReads("const truth = mod.truth; await truth.monsters();", true)).toEqual(["monsters"]);
    expect(truthReads("await truth.perceivedMonsters();")).toEqual([]);
    expect(truthReads("const t = mod.truth;")).toEqual(["(alias)"]);
    expect(truthReads("const { level } = mod.truth;")).toEqual(["(destructured)"]);
    expect(truthReads("(mod.truth as Any).level()")).toEqual(["level"]);
    expect(truthReads("await mod.truth.monsters(); await mod.truth.race(1);")).toEqual(["monsters", "race"]);
    expect(truthReads("// mod.truth.level()\nconst s = \"truth.level\";")).toEqual([]);
  });
});
