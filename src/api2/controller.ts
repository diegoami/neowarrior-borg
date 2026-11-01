/**
 * One decision, at one input wait.
 *
 * The game calls a mod's controller each time it needs a command, with the
 * wait's token, and the mod answers by submitting intents under it. The Borg's
 * decision code is synchronous and wants the game as a view, so a tick reads the
 * world, asks the decision code for one command, and submits the targets it
 * chose and then the command.
 *
 * The decision code asks "what would this loadout be" in the middle of a ladder,
 * and the game answers that only through a call that takes time. The first pass
 * of a decision gets "no answer yet" and records the questions; the tick reads
 * them in one round and decides again with the answers in hand, until a pass
 * asks nothing new.
 *
 * A tick that has nothing to do, or whose command the game refuses, submits
 * nothing more and the game asks again; a run of either ends the errand so the
 * keyboard goes back to the player instead of looping.
 */

import type { AgentCommand, AgentController } from "@rpgm-tools/neo-angband-core";
import type { Api2InputState, Api2Prompt, Api2PromptAnswer, ModApi2 } from "@rpgm-tools/neo-angband-mod-sdk";
import type { Bridge } from "./host.js";
import type { World } from "./world.js";
import { createActFacade, intentOf } from "./act.js";

/** Consecutive refusals after which the keyboard goes back. */
export const REFUSALS_BEFORE_RELEASE = 25;
/** Consecutive decisions with no command after which the keyboard goes back. */
export const IDLE_BEFORE_RELEASE = 25;
/** Most extra passes one decision takes to read the loadout questions it asked. */
export const MAX_EXTRA_PASSES = 6;
/**
 * Accepted commands in a row, the same command against the same scene, after
 * which the Borg stops believing its map of the grid the command aimed at. A
 * door the game opened without the Borg's map hearing of it is the case this
 * exists for: the game takes "open" for a door that is no longer there and no
 * turn passes, so nothing the Borg's refusal and idle counts watch ever moves.
 */
export const STALLS_BEFORE_FORGET = 6;
/** The same, after which the keyboard goes back, whatever the command was. */
export const STALLS_BEFORE_RELEASE = 40;

/** Keypad direction to the grid offset it names (the game's own table). */
const DIR_DX: readonly number[] = [0, -1, 0, 1, -1, 0, 1, -1, 0, 1];
const DIR_DY: readonly number[] = [0, 1, 1, 1, 0, 0, 0, -1, -1, -1];

export interface Tick {
  (mod: ModApi2, input: Api2InputState): Promise<void>;
}

/** What to say to a prompt the game raised at the Borg's turn. The Borg asks nothing of the player. */
export function promptAnswer(prompt: Api2Prompt): Api2PromptAnswer {
  switch (prompt.kind) {
    case "ack":
      return { action: "acknowledge" };
    case "confirm":
      return true;
    case "quantity":
      return prompt.defaultValue;
    case "text":
      return prompt.defaultValue;
    default:
      return { action: "cancel" };
  }
}

/** The decision code: the Borg's controller and the undo for the counters a decision moves. */
export interface Decider {
  readonly controller: AgentController;
  rewind(): void;
  /** Drop what the Borg's own map believes about one grid, so the next decision treats it as unknown. */
  forget?(x: number, y: number): void;
}

/** What a command's aim is, for the commands that name a direction. */
function aimedGrid(command: AgentCommand, from: { readonly x: number; readonly y: number }): { x: number; y: number } | null {
  const dir = (command as { readonly dir?: number }).dir;
  if (dir === undefined || dir < 1 || dir > 9 || dir === 5) return null;
  return { x: from.x + DIR_DX[dir]!, y: from.y + DIR_DY[dir]! };
}

/** The scene a command was chosen against: where the character is, what it has, and what stands near. */
function sceneOf(world: World): string {
  const player = world.view.player() as unknown as Readonly<Record<string, unknown>> & { readonly grid: { readonly x: number; readonly y: number } };
  const monsters = world.view.monsters().map((monster) => [monster.grid.x, monster.grid.y, monster.hp]);
  return JSON.stringify([player.grid.x, player.grid.y, player["depth"], player["hp"], player["sp"], player["exp"], player["gold"], monsters]);
}

export function createTick(bridge: Bridge, borg: Decider): Tick {
  let refusals = 0;
  let idle = 0;
  let announced = false;
  let lastScene = "";
  let lastCommand = "";
  let stalls = 0;
  return async (mod, input) => {
    bridge.setInput(input);
    if (input.prompt !== null) {
      await mod.act.answer(input.prompt.promptId, promptAnswer(input.prompt));
      return;
    }
    if (input.phase !== "play" && input.phase !== "store") return;
    const world = await bridge.readWorld();
    if (world === null) return;

    let facade = createActFacade();
    let command = borg.controller(world.view, facade.act);
    for (let pass = 0; pass < MAX_EXTRA_PASSES && bridge.loadoutsPending(); pass++) {
      if ((await bridge.settleLoadouts()) === 0) break;
      borg.rewind();
      facade = createActFacade();
      command = borg.controller(world.view, facade.act);
    }
    const targets = facade.take();

    if (command === null) {
      idle += 1;
      if (idle >= IDLE_BEFORE_RELEASE) {
        idle = 0;
        await mod.act.controller.release("The Borg had no command to give.");
      }
      return;
    }
    idle = 0;

    /* The same command against the same scene, again and again, is a command the
     * game takes and does nothing with. */
    const scene = sceneOf(world);
    const key = JSON.stringify(command);
    stalls = scene === lastScene && key === lastCommand ? stalls + 1 : 0;
    lastScene = scene;
    lastCommand = key;
    if (stalls >= STALLS_BEFORE_RELEASE) {
      stalls = 0;
      await mod.act.controller.release(`The Borg's ${command.code} changed nothing ${String(STALLS_BEFORE_RELEASE)} times running.`);
      return;
    }
    if (stalls >= STALLS_BEFORE_FORGET && stalls % STALLS_BEFORE_FORGET === 0) {
      const aim = aimedGrid(command, world.view.player().grid);
      if (aim !== null && borg.forget !== undefined) {
        borg.forget(aim.x, aim.y);
        mod.meta.log(`the Borg's ${command.code} at ${String(aim.x)},${String(aim.y)} changed nothing, so it forgot what it believed was there`);
      }
    }
    if (!announced) {
      announced = true;
      mod.meta.log("the Borg is playing");
    }

    let token = input.token;
    for (const target of targets) {
      const result = await mod.act.submit(token, target);
      if (!result.ok) mod.meta.log(`the Borg's target was refused: ${result.message}`);
    }
    if (targets.length > 0) {
      const fresh = await mod.view.input();
      if (fresh.ok) token = fresh.value.token;
    }
    const sent = await mod.act.submit(token, intentOf(command));
    if (sent.ok) {
      refusals = 0;
      return;
    }
    refusals += 1;
    if (refusals === 1 || refusals % 10 === 0) mod.meta.log(`the Borg's ${command.code} was refused: ${sent.message}`);
    if (refusals >= REFUSALS_BEFORE_RELEASE) {
      refusals = 0;
      await mod.act.controller.release("The game kept refusing the Borg's commands.");
    }
  };
}
