/**
 * The hidden facts the Borg is allowed to read, and why each one is on the list.
 *
 * The first-party `truth` domain shows more than the character knows: every
 * monster on the level and the real map. An autoplayer plans from the known
 * world and acts through the same commands a player has, so a hidden read may
 * change a decision only when it is named here with its reason. Everything
 * else the Borg reads comes from `view`, which shows what the character has
 * seen and remembers.
 *
 * What is not here matters as much. `truth.level()` is not read at all: the
 * Borg's map is the remembered map, so a secret door reaches it as the granite
 * the player sees, and a door opened or a wall dug out of sight does not move
 * its plans until the character has looked again (neostryder/neo-angband#415).
 * `truth.storeKnowledge()` is not read either, because the stock a store shows
 * through `view.world().stores` already answers what the Borg asks of it.
 *
 * `truth-allowlist.test.ts` fails when any other `truth` member is called from
 * this mod, so a new hidden read is a deliberate edit to this list.
 */

import type { Api2TrueMonster, Api2TrueRace, ModApi2 } from "@rpgm-tools/neo-angband-mod-sdk";

/** One hidden read the Borg makes and the reason it makes it. */
export interface TruthRead {
  /** The `truth` member. */
  readonly call: "monsters" | "race";
  /** What the Borg takes from it. */
  readonly takes: string;
  /** Why the known world is not enough. */
  readonly reason: string;
}

export const TRUTH_ALLOWLIST: readonly TruthRead[] = [
  {
    call: "monsters",
    takes: "exact hit points, speed and status timers of the monsters the character perceives",
    reason:
      "borg_danger, the fight ladder and the flee thresholds are written in hit points and game speed. The look command's health band and the race speed answer only to a few percent, which moves flee and rest decisions the ported tuning does not expect. Monsters the character does not perceive are dropped before the Borg sees them.",
  },
  {
    call: "race",
    takes: "each perceived monster's blows, spells, spell frequency, flags and level",
    reason:
      "The danger math reads a race's full combat record. Monster lore teaches it only as the character kills and is hit, so a first encounter would be scored as harmless, which is the failure the danger resolver exists to prevent. Only the races of monsters the character has perceived are asked for.",
  },
];

/** The two reads, over the host's `truth` domain. */
export interface BorgTruth {
  /** Monsters the character perceives, with exact numbers. */
  perceivedMonsters(): Promise<readonly Api2TrueMonster[] | null>;
  /** One race's combat record, or null when the game has none by that index. */
  race(index: number): Promise<Api2TrueRace | null>;
}

/** The allowlisted reads, or null when the game gives the mod no `truth` domain. */
export function borgTruth(mod: Pick<ModApi2, "truth">): BorgTruth | null {
  const truth = mod.truth;
  if (truth === undefined) return null;
  return {
    async perceivedMonsters() {
      const result = await truth.monsters();
      return result.ok ? result.value.filter((monster) => monster.perceived) : null;
    },
    async race(index) {
      const result = await truth.race(index);
      return result.ok ? result.value : null;
    },
  };
}
