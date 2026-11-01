/**
 * NOTHING that reaches plugin.js may import a runtime VALUE from the engine.
 *
 * The plugin builder marks every non-relative specifier EXTERNAL and then
 * refuses the build if one survives, because a plugin carrying its own copy of
 * `@rpgm-tools/neo-angband-core` would get its own registries while the game ran
 * on another set, and the two would agree right up until they did not. A mod
 * receives the live engine as `ctx.core` instead, and src/core-api.ts is where
 * this one puts it.
 *
 * The builder is therefore the real gate, and `pnpm check` runs it. This test
 * exists anyway, for two reasons. It fails in milliseconds with the FILE NAME,
 * where the builder fails at the end of a bundle with a specifier; and it holds
 * while core-api.ts is a `import type * as Core` - which erases, so the builder
 * would be perfectly happy with a second file doing the same thing and then
 * reading a value off it.
 *
 * In the engine repository this test allowed exactly one offender, core-api.ts,
 * because there the funnel really did import the engine. Here it imports nothing
 * at runtime, so the allowed set is EMPTY and that is the stronger claim.
 *
 * TYPE-ONLY IMPORTS ARE FINE AND ARE NOT COUNTED. They are erased, they cost the
 * mod nothing, and funnelling them would hide which engine types each module
 * actually speaks in. 28 of the 37 files that mention the package are type-only.
 */

import { describe, expect, it } from "vitest";
import ts from "typescript";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = dirname(fileURLToPath(import.meta.url));
const ENGINE = "@rpgm-tools/neo-angband-core";

/**
 * Files that may name the engine as a value source. EMPTY for anything the
 * builder bundles.
 *
 * test-bind-core.ts is excluded rather than allowed: it is a vitest setup file
 * standing in for the host, it is not reachable from plugin.ts, and the builder
 * never sees it - the same reasoning that excludes *.test.ts.
 */
const NOT_BUNDLED = new Set(["test-bind-core.ts"]);

/**
 * Every `.ts` that ends up in the plugin bundle.
 *
 * Tests are excluded and that is not a loophole: the builder bundles the
 * plugin's entry graph, tests are not in it, and they run under vitest with a
 * real `node_modules` where the bare specifier resolves. Five of them import
 * engine values today, quite correctly.
 */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts") && !NOT_BUNDLED.has(name)) {
      out.push(p);
    }
  }
  return out;
}

/** Type-only imports erase; dynamic imports and re-exports can still load another engine. */
function valueImportsOfEngine(text: string): string[] {
  const source = ts.createSourceFile("source.ts", text, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const engineModule = (node: ts.Node): boolean => ts.isStringLiteralLike(node) && (node.text === ENGINE || node.text.startsWith(`${ENGINE}/`));
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && engineModule(node.moduleSpecifier)) {
      const clause = node.importClause;
      const names = clause?.namedBindings;
      const erased = clause?.isTypeOnly || (!clause?.name && names && ts.isNamedImports(names) && names.elements.every((name) => name.isTypeOnly));
      if (!erased) found.push(node.getText(source));
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && engineModule(node.moduleSpecifier)) {
      const names = node.exportClause;
      const erased = node.isTypeOnly || (names && ts.isNamedExports(names) && names.elements.every((name) => name.isTypeOnly));
      if (!erased) found.push(node.getText(source));
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require")) && node.arguments.some(engineModule)) found.push(node.getText(source));
    if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && engineModule(node.moduleReference.expression)) found.push(node.getText(source));
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("nothing in the plugin bundle reaches the engine for a runtime value", () => {
  const files = sourceFiles(srcRoot);

  it("finds the package's sources at all", () => {
    /* A census that scanned nothing would pass every assertion below it. */
    expect(files.length).toBeGreaterThan(50);
  });

  it("has no value importer at all", () => {
    const offenders = files
      .filter((f) => valueImportsOfEngine(readFileSync(f, "utf8")).length > 0)
      .map((f) => relative(srcRoot, f).replaceAll("\\", "/"));
    expect(offenders).toEqual([]);
  });

  it("excludes only the setup file, and that file really is the host stand-in", () => {
    /* If test-bind-core.ts stopped calling bindCore, the exclusion above would be
     * hiding a file that value-imports the engine for no reason. */
    const setup = readFileSync(join(srcRoot, "test-bind-core.ts"), "utf8");
    expect(valueImportsOfEngine(setup)).toHaveLength(1);
    expect(setup).toContain("bindCore(Core)");
  });

  it("still counts a value import when it sees one", () => {
    expect(valueImportsOfEngine(`import { FEAT } from "${ENGINE}";`)).toHaveLength(1);
    expect(valueImportsOfEngine(`export { TV } from "${ENGINE}";`)).toHaveLength(1);
    expect(valueImportsOfEngine(`import("${ENGINE}");`)).toHaveLength(1);
    expect(valueImportsOfEngine(`import "${ENGINE}";`)).toHaveLength(1);
    expect(valueImportsOfEngine(`export * from "${ENGINE}";`)).toHaveLength(1);
    expect(
      valueImportsOfEngine(`import {\n  A,\n  type B,\n} from "${ENGINE}";`),
    ).toHaveLength(1);
    expect(valueImportsOfEngine(`import type { X } from "${ENGINE}";`)).toHaveLength(0);
    expect(valueImportsOfEngine(`export type { X } from "${ENGINE}";`)).toHaveLength(0);
    expect(
      valueImportsOfEngine(`import {\n  type A,\n  type B,\n} from "${ENGINE}";`),
    ).toHaveLength(0);
    expect(valueImportsOfEngine(`import { FEAT } from "./core-api.js";`)).toHaveLength(0);
  });

  it.each([
    `require("${ENGINE}");`, `import core = require("${ENGINE}");`,
    `require("${ENGINE}/engine.js");`, `import core = require("${ENGINE}/engine.js");`,
  ])("counts the restored CommonJS import: %s", (text) => {
    expect(valueImportsOfEngine(text)).toHaveLength(1);
  });

  it("allows an erased CommonJS import", () => {
    expect(valueImportsOfEngine(`import type core = require("${ENGINE}");`)).toHaveLength(0);
  });
});
