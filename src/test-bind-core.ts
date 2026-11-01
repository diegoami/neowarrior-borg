/**
 * Bind the engine before any test runs, the way the host does at load time.
 *
 * The port takes its seven runtime engine symbols through core-api.ts, which the
 * plugin fills from `ctx.core`. In a test there is no host, so something has to
 * play that part - and it has to happen before the first test module is
 * evaluated, which is why this is a vitest `setupFiles` entry rather than a
 * beforeAll in each file.
 *
 * A top-level await import, deliberately: the whole point of core-api.ts is that
 * nothing reads FEAT/TV/RSF at module scope, so binding at module scope here is
 * the earliest correct moment and matches what the plugin does.
 */

import * as Core from "@rpgm-tools/neo-angband-core";
import { bindCore } from "./core-api.js";

bindCore(Core);
