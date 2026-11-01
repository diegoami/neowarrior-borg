/**
 * What the Borg's decision code reads from the game, built over the API 2 object.
 *
 * The decision code is written against a synchronous view and a set of resolver
 * seams (danger facts, activation identity, the in-shop signal, kind prices).
 * Under API 2 every read is a call that answers with a result. The bridge reads
 * the content records the Borg needs once when the mod starts, keeps the caches
 * a decision answers from (races, activations, hypothetical loadouts), and reads
 * the world once per decision.
 */

import type * as Core from "@rpgm-tools/neo-angband-core";
import type { Api2InputState, ModApi2 } from "@rpgm-tools/neo-angband-mod-sdk";
import { bindCore, coreIsBound } from "../core-api.js";
import type { CoreObjectLookup, CoreResolverInput } from "../resolvers.js";
import { ActivationBook, LoadoutBook, RaceBook } from "./caches.js";
import { watchMessages, type MessageFeed } from "./feed.js";
import { blowActions, gameConstants, gradeFloors, kindCosts, spellMessages, trapKinds } from "./records.js";
import { borgTruth, type BorgTruth } from "./truth.js";
import { readWorld, simulationView, type Statics, type World, type WorldFacts } from "./world.js";

export interface Bridge {
  /** Bind the engine and read every table the decision code takes once. Throws when the game gives the mod no engine. */
  prime(): Promise<void>;
  /** Read the game now: the view the decision code runs over and the facts the resolvers answer from. Null when the game has no character to show. */
  readWorld(): Promise<World | null>;
  /** Record the input wait the controller was called at. */
  setInput(input: Api2InputState): void;
  /** The input wait of the current decision. */
  input(): Api2InputState | null;
  /** Whether the last decision asked a loadout question the cache could not answer. */
  loadoutsPending(): boolean;
  /** Read the loadout questions the last decision recorded. Returns how many answers arrived. */
  settleLoadouts(): Promise<number>;
  /** The seams the resolvers read, answering from the caches and from the last world read. */
  resolverInput(): CoreResolverInput;
  /** Whether the game gives the mod the hidden reads (`truth`). */
  readonly hasTruth: boolean;
  dispose(): Promise<void>;
}

const unit = (): void => undefined;

const NO_FACTS: WorldFacts = { shopnum: null, kinds: new Map() };

export function createBridge(mod: ModApi2): Bridge {
  const truth: BorgTruth | null = borgTruth(mod);
  const races = new RaceBook();
  const activations = new ActivationBook();
  const loadouts = new LoadoutBook();
  let statics: Statics | null = null;
  let feed: MessageFeed | null = null;
  let input: Api2InputState | null = null;
  let facts: WorldFacts = NO_FACTS;
  let blows: string[] = [];
  let spells: Awaited<ReturnType<typeof spellMessages>> = [];

  /** The slice of the object registry the activation seam reads, answered from the caches. */
  const objects: CoreObjectLookup = {
    lookupKind: (tval, sval) => {
      const activation = activations.kind(tval, sval);
      const price = facts.kinds.get(`${String(tval)}:${String(sval)}`);
      return activation === null && price === undefined ? null : { activation, ...(price === undefined ? {} : { cost: price.cost, aware: price.aware }) };
    },
    findEgo: (name) => ({ activation: activations.ego(name) }),
    findArtifact: (name) => ({ activation: activations.artifact(name) }),
  };

  return {
    hasTruth: truth !== null,

    async prime() {
      const engine = mod.engine;
      if (engine === undefined) throw new Error("the game gave the Borg no engine, so it cannot bind the engine's constants");
      bindCore(engine.core as typeof Core);
      if (!coreIsBound()) throw new Error("the Borg could not take the engine from the engine domain");
      const [constants, floors, traps, costs, actions, messages] = await Promise.all([gameConstants(mod), gradeFloors(mod), trapKinds(mod), kindCosts(mod), blowActions(mod), spellMessages(mod)]);
      statics = { constants, floors, trapKinds: traps, kindCosts: costs };
      blows = actions;
      spells = messages;
      feed = await watchMessages(mod);
    },

    async readWorld() {
      if (statics === null) return null;
      const world = await readWorld(mod, { statics, races, activations, loadouts, truth, messages: feed ?? undefined });
      if (world !== null) facts = world.facts;
      return world;
    },

    setInput(next) {
      input = next;
    },
    input: () => input,
    loadoutsPending: () => loadouts.pending,
    async settleLoadouts() {
      if (statics === null) return 0;
      return loadouts.settle(mod, simulationView(statics.floors));
    },

    resolverInput() {
      return {
        raceRecord: (ridx) => races.get(ridx),
        objects,
        shopnum: () => facts.shopnum,
        kindCost: (tval, sval) => facts.kinds.get(`${String(tval)}:${String(sval)}`) ?? null,
        blowMethods: blows.map((message) => ({ messages: [message] })),
        monsterSpells: spells,
      };
    },

    async dispose() {
      await feed?.stop().catch(unit);
      feed = null;
    },
  };
}
