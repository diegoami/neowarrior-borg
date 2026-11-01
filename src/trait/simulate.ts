/**
 * borg.power for a loadout the Borg is NOT wearing.
 *
 * ------------------------------------------------------------------
 * WHAT THE C DID
 * ------------------------------------------------------------------
 *
 * `borg_wear_stuff` / `borg_think_shop_buy_useful` /
 * `borg_think_shop_sell_useless` all decide by DIFFING borg.power: score the
 * character now, score it with the candidate worn or bought or sold, take the
 * better. Upstream gets the second score by wielding the candidate for real,
 * running borg_notice and borg_power over the changed struct player, and putting
 * everything back (borg-power.c, borg-item-wear.c:858).
 *
 * ------------------------------------------------------------------
 * WHY THIS FILE EXISTS INSTEAD
 * ------------------------------------------------------------------
 *
 * This port cannot wield anything to find out. `borgNotice` re-derives most of
 * the trait array from the ItemViews itself, but a handful of values - net speed,
 * the AC-less skills, blows, shots, max hitpoints, max mana - it takes straight
 * off the already-derived PlayerView, because those are numbers the engine has
 * already computed and re-deriving them would need race and class base tables the
 * frozen view does not carry. And the engine computed them for the loadout the
 * character is ACTUALLY in.
 *
 * So the four decisions above ran on a conservative default that reported no gain
 * from anything, and the Borg wore nothing it found, bought nothing it needed and
 * sold nothing it was done with. The ported arithmetic was correct the whole
 * time; it was being asked about a loadout nobody could describe.
 *
 * `AgentView.simulateLoadout` is the engine capability that describes one (Neo
 * Angband 0.25.0): it runs the engine's own calc_bonuses over a hypothetical set
 * of worn objects and hands back the PlayerView and the ItemViews that loadout
 * would produce. This file is the other half - run the ported borg_notice and
 * borg_power over that view instead of the live one.
 *
 * ------------------------------------------------------------------
 * WHY THE SHAPES ARE DECLARED HERE RATHER THAN IMPORTED
 * ------------------------------------------------------------------
 *
 * They are NARROWER than the engine's own, on purpose, which is why they stay
 * declared here now that the published types carry them. `LoadoutItemRef` has a
 * third arm holding a live `GameObject`, and a mod driving the frozen view never
 * holds one; `LoadoutSimulation` carries before / after / delta and this file
 * reads three fields of `after`. Declaring what is actually reachable and
 * actually read is the same choice plugin.ts makes for its ControllerCtx and
 * resolvers.ts for its registry lookups. A test asserts the two agree, so a
 * change to the engine's shapes fails this repository's build rather than
 * surfacing as bad play.
 *
 * ------------------------------------------------------------------
 * WHY THE WORLD IS SHADOWED RATHER THAN SAVED AND RESTORED
 * ------------------------------------------------------------------
 *
 * `borgNotice` writes `world.self.trait`, `borgPower` writes `world.self.power`,
 * and both go through the WeakMap of derived side-state keyed BY THE WORLD OBJECT
 * (trait/state.ts). Scoring a candidate on the live world would therefore leave
 * the Borg's own self-model describing an item it is not wearing, for the rest of
 * the think, and a decision ladder evaluates dozens of candidates per turn.
 * Saving the three and putting them back would work and is one early return away
 * from not working.
 *
 * Instead the simulation runs against a world whose prototype IS the live one and
 * which owns a fresh `self`. Reads fall through to the real world; the two writes
 * land on the copy; the WeakMap sees a different key and hands out a separate
 * derived block. Nothing has to be restored because nothing was touched.
 */

import type { ItemView, PlayerView } from "@rpgm-tools/neo-angband-core";
import type { BorgView } from "../core-api.js";
import type { BorgContext } from "../context.js";
import type { BorgWorld } from "../world/model.js";
import { borgNotice } from "./trait.js";
import { borgPower } from "./power.js";
import type { BorgTraitOpts } from "./config.js";

/**
 * Where one item in a hypothetical loadout comes from: a gear handle for
 * something the character already has, or a shop and a stock index for a ware,
 * which is not in the gear and so has no handle. The engine's own
 * `LoadoutItemRef` has a third arm carrying a live GameObject; a mod driving the
 * frozen view never holds one, so it is not mirrored here.
 */
export type BorgLoadoutRef =
  | { readonly from: "gear"; readonly handle: number }
  | { readonly from: "store"; readonly store: number; readonly index: number };

/**
 * A hypothetical change to what the character carries and wears (the engine's
 * `LoadoutChange`). Fields compose, applied release -> remove -> wield -> carry.
 */
export interface BorgLoadoutChange {
  /** Wear or wield these, each into the slot wield_slot picks for its tval. */
  readonly wield?: readonly BorgLoadoutRef[];
  /** Take these into the pack without wearing them (a purchase). */
  readonly carry?: readonly {
    readonly item: BorgLoadoutRef;
    readonly number?: number;
  }[];
  /** Empty these body slots; what is worn there goes into the pack. */
  readonly remove?: readonly number[];
  /** Give these up entirely (a sale, a drop); a worn handle leaves its slot. */
  readonly release?: readonly {
    readonly handle: number;
    readonly number?: number;
  }[];
}

/** The three views of the resulting loadout the ported self-model reads. */
export interface BorgLoadoutAnswer {
  readonly after: {
    readonly player: PlayerView;
    readonly equipment: readonly (ItemView | null)[];
    readonly inventory: readonly ItemView[];
  };
}

/** The frozen view, with the accessor narrowed to the shapes above. */
type LoadoutCapableView = BorgView & {
  simulateLoadout?: (change: BorgLoadoutChange) => BorgLoadoutAnswer | null;
};

/**
 * A world that reads as the live one and writes as a scratch copy. See the file
 * header for why this is a prototype link and not a save/restore.
 */
function shadowWorld(world: BorgWorld): BorgWorld {
  const sim = Object.create(world) as BorgWorld;
  Object.defineProperty(sim, "self", {
    value: {
      ...world.self,
      trait: [...world.self.trait],
      power: world.self.power,
      /* borgNotice writes temp too (the buff-timer cross-check at
       * trait.c:3010), and a shallow spread would hand the simulation the LIVE
       * flags object to write through. The simulated player carries the same
       * timers, so the values would agree today; sharing the object is still a
       * live write from a scoring pass that promises not to make one. */
      temp: { ...world.self.temp },
    },
    writable: true,
    enumerable: true,
    configurable: true,
  });
  return sim;
}

/**
 * The live view with the player and the carried/worn items replaced by the
 * simulated ones. Every other accessor is the real one: the map, the monsters,
 * the messages and the stores are unchanged by putting a ring on.
 */
function shadowView(view: BorgView, answer: BorgLoadoutAnswer): BorgView {
  return {
    ...view,
    player: () => answer.after.player,
    equipment: () => [...answer.after.equipment],
    inventory: () => [...answer.after.inventory],
  };
}

/**
 * borg.power for the loadout `change` would produce, or null when the view has
 * no live derive behind it (a worldless harness). The agent API declares the
 * accessor optional on the view itself, which is what that null covers; the
 * engine version is not in question, because manifest.json requires one that
 * carries it.
 *
 * Null rather than "the current power" on purpose: the callers already treat an
 * absent seam as "no improvement", and returning the current power here would
 * make "the engine cannot answer" indistinguishable from "the answer is that
 * nothing changes".
 */
export function borgSimulatePower(
  ctx: BorgContext,
  change: BorgLoadoutChange,
  opts: BorgTraitOpts = {},
): number | null {
  const view = ctx.view as LoadoutCapableView;
  const answer = view.simulateLoadout?.(change);
  if (!answer) return null;

  const simCtx: BorgContext = {
    ...ctx,
    world: shadowWorld(ctx.world),
    view: shadowView(ctx.view, answer),
  };

  /* The same two calls, in the same order, the controller makes every think
   * (controller.ts): notice fills the trait array from the view, power scores
   * it. Running anything less here would score a half-built self-model. */
  borgNotice(simCtx, opts);
  return borgPower(simCtx, opts);
}
