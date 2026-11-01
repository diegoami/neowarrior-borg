/**
 * The game's messages, collected between decisions.
 *
 * The Borg reads what the game printed since its last decision (a hit, a spell
 * cast out of sight, a level feeling), and the game offers each message as an
 * event. The feed keeps them until a decision takes them.
 */

import type { Api2Subscription, ModApi2 } from "@rpgm-tools/neo-angband-mod-sdk";

export interface MessageFeed {
  /** Every message printed since the previous call, oldest first. The feed is empty afterward. */
  drain(): string[];
  /** Stop listening. */
  stop(): Promise<void>;
}

/** Start collecting messages. Without the event grant the feed stays empty. */
export async function watchMessages(api: Pick<ModApi2, "events">): Promise<MessageFeed> {
  let batch: string[] = [];
  const result = await api.events.on("message", (event) => {
    batch.push(event.text);
  });
  const subscription: Api2Subscription | null = result.ok ? result.value : null;
  return {
    drain: () => {
      const out = batch;
      batch = [];
      return out;
    },
    stop: async () => {
      if (subscription !== null) await api.events.off(subscription);
    },
  };
}
