/**
 * Test config, whose only job is an OPT-IN path to a local engine.
 *
 * By default these tests import `@rpgm-tools/neo-angband-core` from node_modules -
 * the PUBLISHED engine, the version a player actually runs. That default is
 * deliberate and package.json says so: a mod that passes against an unreleased
 * engine and fails against the released one has been tested against the wrong
 * thing.
 *
 * But it makes the opposite case impossible, and that case is real. When the
 * engine grows a seam this mod needs, the change lands in the game's repository
 * and reaches npm at the next release - so until then there is no way to run
 * this mod against it, and no way to find out that the seam does not actually
 * work until after it has shipped. `NEO_ANGBAND_REPO` already points at a
 * sibling checkout for the content pack (content.ts) and for the plugin builder
 * (tools/build.mjs); the ENGINE was the one thing it did not reach.
 *
 *   NEO_ANGBAND_LOCAL_CORE=1 pnpm test
 *
 * A SECOND VARIABLE, not just the presence of the checkout. Most developers here
 * have the sibling checkout - the content pack needs it - so keying off that
 * would silently swap the engine under everyone and quietly turn the default
 * into "whatever is on my disk". The opt-in has to be a thing you typed.
 *
 * It resolves to core's BUILT output, because that is what the package's own
 * exports point at and therefore what a consumer gets. An unbuilt checkout is a
 * loud failure below rather than a fallback to node_modules: silently testing
 * the published engine after you asked for the local one is the exact confusion
 * this is meant to end.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { defineConfig } from "vitest/config";

const CORE = "@rpgm-tools/neo-angband-core";

function localCore() {
  if (process.env["NEO_ANGBAND_LOCAL_CORE"] !== "1") return {};

  /* AN EXPLICIT NEO_ANGBAND_REPO IS AUTHORITATIVE: if it is set and does not
   * hold a built engine, that is an error, not a reason to look elsewhere.
   *
   * This is deliberately stricter than content.ts and tools/build.mjs, which try
   * the variable and then fall back to the sibling checkout. Measured while
   * writing this: with the fallback in place, `NEO_ANGBAND_REPO=/c/nope` loaded
   * the sibling engine and the run passed, reporting a version from a checkout
   * nobody had named. For a content pack or a build tool that fallback is a
   * convenience - any copy will do. Here it selects the ENGINE UNDER TEST, and
   * quietly testing a different one than you asked for is a wrong answer. */
  const explicit = process.env["NEO_ANGBAND_REPO"];
  const roots = explicit
    ? [explicit]
    : [fileURLToPath(new URL("../neo-angband/", import.meta.url))];

  for (const root of roots) {
    const entry = join(root, "packages", "core", "dist", "index.js");
    if (existsSync(entry)) {
      console.log(`[vitest] NEO_ANGBAND_LOCAL_CORE=1 -> ${entry}`);
      return { [CORE]: entry };
    }
  }
  throw new Error(
    "NEO_ANGBAND_LOCAL_CORE=1 was set, but no BUILT engine was found. Run `pnpm build`\n" +
      "in the game's repository, or point NEO_ANGBAND_REPO at it.\n" +
      `Looked for packages/core/dist/index.js under:\n${roots.map((r) => `  ${r}`).join("\n")}`,
  );
}

export default defineConfig({
  resolve: { alias: localCore() },
  test: {
    /* src/core-api.ts is filled from ctx.core by the plugin; in a test there is
     * no host, so this stands in for one. A setup file rather than a beforeAll
     * because it has to run before the first test module is evaluated. */
    setupFiles: ["./src/test-bind-core.ts"],
  },
});
