/**
 * Fails when manifest.json asks for more game state than the mod reads. A
 * wildcard grant such as `state:*.read` would also cover every state domain
 * the engine adds later. `state:map-actual.read` is allowed because the Borg
 * reads two things through it, the monsters the character perceives and each
 * race's record; src/truth-allowlist.test.ts fails the build if any source
 * file reads the real map or the stores' real stock through it.
 */

import { readFileSync } from "node:fs";
import { validateManifest } from "@rpgm-tools/neo-angband-mod-sdk";

const manifest = validateManifest(JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8")));
const refused = (manifest.capabilities ?? []).filter((grant) => /^state:[^.]*\*/.test(grant));
if (refused.length > 0) {
  console.error(`manifest.json must name each state domain it reads. Remove these grants: ${refused.join(", ")}`);
  process.exit(1);
}
