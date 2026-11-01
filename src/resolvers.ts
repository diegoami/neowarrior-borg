/**
 * Host resolver factory: build the BorgResolvers seams from real engine data.
 *
 * The frozen AgentView deliberately omits per-race combat internals (blow[],
 * spell frequency, spell_power, sleep, friends) - a minimal, serializable
 * contract. Borg is a TRUSTED, in-process mod, so its host CAN read the full
 * monster-race registry and hand the Borg an exact resolver. makeCoreResolvers
 * bridges core's MonsterRace records into the MonsterFacts the danger evaluator
 * needs, so the ported borg_danger math reproduces upstream verbatim instead of
 * running on the conservative zero-state defaults.
 *
 * The fourth seam it fills is the odd one out and worth naming. Danger vision,
 * activation identity and the in-shop signal are all facts the host READS and
 * passes down. Hypothetical-loadout power is a derive that only the engine can
 * run, reached through the frozen view's own `simulateLoadout` accessor, so
 * there is nothing for the host to hand over: the seam is installed
 * unconditionally and answers null when the view behind it cannot derive.
 *
 * It used to take a fourth input, `loadout`, carrying the answer to "can this
 * engine do that" - a probe the plugin ran because the mod loaded into games
 * that predated `simulateLoadout`. manifest.json now requires an engine that has
 * it, so the question has one answer and the input is gone.
 *
 * This depends only on @rpgm-tools/neo-angband-core, which the package already
 * depends on.
 */

import {
  artifactActivation,
  egoActivation,
  kindActivation,
  kindPrice,
  raceRecord,
  racesByIndex,
  shopnumHere,
} from "./core-api.js";
import type { ItemView, MonsterRace } from "@rpgm-tools/neo-angband-core";
import type { RaceRecord } from "./core-api.js";
import type { BorgContext } from "./context.js";
import type { BorgResolvers } from "./think-session.js";
import type { BlowFacts, FactsResolver, MonsterFacts } from "./danger/facts.js";
import { defaultResolveMonsterFacts } from "./danger/facts.js";
import { borgMonBlowEffect } from "./danger/tables.js";
import { borgSimulatePower } from "./trait/simulate.js";

/** The one field every activation source (kind/ego/artifact) carries. */
interface ActivationLike {
  readonly name: string;
}

/**
 * The slice of ObjRegistry the activation-identity seam reads. Structural
 * rather than the class itself, so a test can hand in three plain functions
 * instead of building a real pack.
 */
export interface CoreObjectLookup {
  lookupKind(
    tval: number,
    sval: number,
  ): { activation: ActivationLike | null; cost?: number; aware?: boolean } | null;
  findEgo(name: string): { activation: ActivationLike | null } | null;
  findArtifact(name: string): { activation: ActivationLike | null } | null;
}

/**
 * The slice of the live GameState the in-shop seam reads: the player's grid
 * against the level's own feature table (square_shopnum, cave-square.c:1512).
 * Structural for the same reason as CoreObjectLookup.
 */
export interface CoreShopLookup {
  actor: { grid: { x: number; y: number } };
  chunk: { feature(grid: { x: number; y: number }): { shopnum: number } };
  /** state.isAware (obj-knowledge): does the character know this flavour? */
  isAware?: (kind: unknown) => boolean;
}

/** What the host supplies to build real resolvers. */
export interface CoreResolverInput {
  /** The bound monster-race registry (booted.registries...); indexed by ridx. Absent when `raceRecord` answers instead. */
  races?: readonly MonsterRace[];
  /**
   * A race's combat record by ridx, for a host that reads races one at a time
   * (API 2: truth.race) instead of holding the registry. Asked first; the
   * registry is the fallback.
   */
  raceRecord?: (ridx: number) => RaceRecord | undefined;
  /**
   * The index of the shop entrance the character stands on, or null. Answers the
   * in-shop signal ahead of `state` (API 2: KnownPlayer.shopnum).
   */
  shopnum?: () => number | null;
  /**
   * The price and flavour awareness of a kind, or null for a kind the character
   * has no record of. Answers the floor-object price ahead of `objects` and `state`.
   */
  kindCost?: (tval: number, sval: number) => { cost: number; aware: boolean } | null;
  /**
   * The bound object registry (`ctx.registries.objects`), for activation
   * identity. The plugin always passes it; omitting it leaves
   * resolveActivation/activateHandle on their conservative defaults, which is
   * what lets a test exercise one resolver without building the other's fixture.
   */
  objects?: CoreObjectLookup;
  /**
   * The live game state (`ctx.state`), for the in-shop signal. Optional on the
   * same terms as `objects`.
   */
  state?: CoreShopLookup;
  /**
   * The bound blow-method registry (`ctx.registries.monsters.blowMethods`), for
   * the attack-message table. Reading it here rather than copying
   * blow_methods.txt into this repository is what covers a mod's own blow method
   * on the same terms as core's.
   */
  blowMethods?: Iterable<{ readonly messages: readonly string[] }>;
  /** Bound monster-spell registry, for message-driven unseen-spell fear. */
  monsterSpells?: Iterable<{
    readonly index: number;
    readonly levels: readonly { readonly message: string; readonly blindMessage: string; readonly missMessage: string }[];
  }>;
}

/**
 * borg's "act_<NAME>" token for an activation record, e.g. an activation named
 * "LIGHT" in the data (activation.txt's own name: field, upstream's identifier
 * casing) becomes "act_light" - the token the ported trait/item code already
 * passes to resolveActivation/activateHandle (trait.ts's applySpellGrants,
 * item/light.ts). Reworked from the file's own casing rather than guessed:
 * upstream's activation.txt names are already the act_* identifiers uppercased
 * (LIGHT, ILLUMINATION, DETECT_ALL, ...), so lowercasing and prefixing is exact,
 * not a heuristic.
 */
function actToken(activation: ActivationLike): string {
  return `act_${activation.name.toLowerCase()}`;
}

/**
 * The activation an equipped item currently grants, or null. Mirrors
 * obj-make.c's own precedence (copy_artifact_data / ego_apply_magic): an
 * artifact's or ego's activation overrides the base kind's, and falls back to
 * the kind's when the artifact/ego carries none of its own. ItemView.activation
 * is only a boolean ("has one"), so identifying WHICH one means walking back
 * through egoName/artifactName/tval+sval to the record that supplied it.
 */
function equippedActivation(
  item: ItemView,
  objects: CoreObjectLookup,
): ActivationLike | null {
  if (!item.activation) return null;
  if (item.artifact && item.artifactName) {
    const art = artifactActivation(objects, item.artifactName);
    if (art) return art;
  }
  if (item.ego && item.egoName) {
    const ego = egoActivation(objects, item.egoName);
    if (ego) return ego;
  }
  return kindActivation(objects, item.tval, item.sval);
}

/** The first equipped item granting `act`, honoring checkCharge, or null. */
function findActivatedItem(
  ctx: BorgContext,
  act: string,
  checkCharge: boolean,
  objects: CoreObjectLookup,
): ItemView | null {
  for (const item of ctx.view.equipment()) {
    if (!item) continue;
    const record = equippedActivation(item, objects);
    if (!record || actToken(record) !== act) continue;
    if (checkCharge && item.timeout >= 1) continue;
    return item;
  }
  return null;
}

/**
 * Build the resolvers that give the Borg real danger vision, activation
 * identity, the in-shop signal and hypothetical-loadout power. The first and the
 * last are unconditional; `objects` and `state` may be omitted, which leaves
 * their two seams on the conservative defaults documented in BorgResolvers.
 */
export function makeCoreResolvers(input: CoreResolverInput): BorgResolvers {
  const byRidx = racesByIndex(input.races ?? []);

  const resolveMonsterFacts: FactsResolver = (ctx, killIndex): MonsterFacts => {
    const kill = ctx.world.kills.at(killIndex);
    const race = byRidx.get(kill.rIdx);
    const record = input.raceRecord?.(kill.rIdx) ?? (race ? raceRecord(race) : undefined);
    // Unknown race (e.g. a mod race the registry lacks): fall back to the
    // MonsterView-derived defaults rather than throwing.
    if (!record) return defaultResolveMonsterFacts(ctx, killIndex);

    return {
      rIdx: record.ridx,
      flags: record.flags,
      level: record.level,
      sleep: record.sleep,
      spellPower: record.spellPower,
      freqInnate: record.freqInnate,
      freqSpell: record.freqSpell,
      hasFriends: record.hasFriends,
      blows: record.blows.map((b): BlowFacts => ({
        dice: b.dice,
        sides: b.sides,
        effect: borgMonBlowEffect(b.effect),
      })),
      spells: record.spells,
    };
  };

  const objects = input.objects;
  const resolveActivation: BorgResolvers["resolveActivation"] = (
    ctx,
    act,
    checkCharge,
  ): boolean => {
    if (!objects) return false;
    return findActivatedItem(ctx, act, checkCharge, objects) !== null;
  };
  const activateHandle: BorgResolvers["activateHandle"] = (ctx, act): number | null => {
    if (!objects) return null;
    // borg_activate_item always requires a charged item (borg-item-use.c:947).
    const item = findActivatedItem(ctx, act, true, objects);
    return item ? item.handle : null;
  };

  const state = input.state;
  const inShop: BorgResolvers["inShop"] = (_ctx): number | null => {
    if (input.shopnum) return input.shopnum();
    if (!state) return null;
    // square_shopnum (cave-square.c:1512): f_info[feat].shopnum - 1, or -1
    // (here null) when the grid is not a shop entrance.
    const shopnum = shopnumHere(state);
    return shopnum > 0 ? shopnum - 1 : null;
  };

  /* borg_init_hit_by_messages (borg-messages.c:1595) walks every blow method and
   * inserts each of its action messages, with {target} still in place: the
   * matcher works on the literal fragments AROUND the tags, so the substituted
   * "you" is never compared. Passing the raw templates through is therefore the
   * faithful shape, not a shortcut. */
  const blowActions: string[] = [];
  for (const method of input.blowMethods ?? []) {
    for (const msg of method.messages) blowActions.push(msg);
  }

  /* borg_new_take's price (borg-flow-take.c:251-258): kind->cost when the kind
   * is aware, and awareness is the character's, not the engine's. Both halves
   * come from data the host already passes for other seams, so this adds no new
   * plumbing - it just asks the questions nothing had asked. */
  const kindCost: BorgResolvers["kindCost"] = (tval, sval) => {
    if (input.kindCost) return input.kindCost(tval, sval);
    if (!objects) return null;
    return kindPrice(objects, state, tval, sval);
  };

  return {
    resolveMonsterFacts,
    resolveActivation,
    activateHandle,
    inShop,
    kindCost,
    blowActions,
    spellMessages: [...(input.monsterSpells ?? [])],
    // Installed unconditionally. borgSimulatePower reads view.simulateLoadout,
    // which the agent API declares optional on the view itself, and answers null
    // when there is no live derive behind it (a worldless harness) - so this is
    // correct without asking the host anything.
    loadoutPower: (ctx, change) => borgSimulatePower(ctx, change),
  };
}
