/**
 * The title screen's "New Borg character" row (neostryder/neo-angband#327).
 *
 * An autoplayer's games want their own options, mod settings and roster, so
 * the row offers a separate profile first and this profile second, and starts
 * character creation with the Borg armed in either. The armed controller is
 * the player's consent for that one character, which is why plugin.ts offers to
 * play on an armed character without the Ctrl-Z confirm.
 *
 * The row needs two host seams: the title (`ui:title`) and profile management
 * (`profiles:manage`). With either missing nothing is registered and the Borg
 * starts only from Ctrl-Z, as before.
 */

import type { Api2Manage, Api2Profile, Api2ProfileAction, Api2Slot, Api2Title } from "@rpgm-tools/neo-angband-mod-sdk";

/** The parts of the mod API the row reads. */
export interface TitleCtx {
  readonly id?: string;
  readonly log?: (message: string) => void;
  readonly title?: Api2Title;
  readonly profiles?: Api2Manage["profiles"];
}

/** The ids of the profiles the Borg made, kept outside every profile. */
export interface ProfileMemory {
  read(): Promise<readonly string[]>;
  write(ids: readonly string[]): Promise<void>;
}

export const TITLE_LABEL = "New Borg character";
/** Core keeps P, N, O, R, M, I, U and Q for its own rows, and Squire uses S. */
export const TITLE_KEY = "B";

export const WHERE_PROMPT = "Choose where the new Borg character plays";
export const WHERE_SEPARATE = "In a separate profile, with its own options, mods and characters";
export const WHERE_HERE = "In this profile";
export const WHICH_PROMPT = "Choose a profile for the Borg";
export const WHICH_FRESH = "Start a fresh profile";
export const WHICH_COPY = "Copy an existing profile";
export const COPY_PROMPT = "Choose a profile to copy. Its options, mods and mod settings come across, and its characters stay behind.";
export const FALLBACK_HERE = "Start the character in this profile";
export const GIVE_UP = "Back to the title";

const ARMED: Api2ProfileAction = { kind: "create-character", armController: true };

function idsFrom(stored: unknown): string[] {
  if (stored === null || typeof stored !== "object" || Array.isArray(stored)) return [];
  const ids = (stored as Record<string, unknown>)["profileIds"];
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

/**
 * The install-level list, in the mod's install slot, which every profile shares.
 * A game that cannot reach the slot still remembers for the session, so the row
 * works and only forgets on reload.
 */
export function installMemory(slot: Pick<Api2Slot, "get" | "set">): ProfileMemory {
  let session: readonly string[] = [];
  return {
    async read() {
      try {
        const result = await slot.get();
        if (result.ok && result.value !== null) return idsFrom(result.value);
      } catch {
        /* Unreadable storage falls back to this session's list. */
      }
      return session;
    },
    async write(ids) {
      session = [...ids];
      try {
        await slot.set({ profileIds: session as string[] });
      } catch {
        /* Kept for this session only. */
      }
    },
  };
}

/** The player's choice, or null for Escape or a game that cannot ask. */
async function ask(title: Api2Title, label: string, choices: readonly string[]): Promise<number | null> {
  const answer = await title.choose(label, choices);
  return answer.ok ? answer.value : null;
}

/** "Borg", then "Borg 2" and onward, skipping names already in use. */
export function freshName(taken: readonly string[]): string {
  const used = new Set(taken.map((name) => name.toLowerCase()));
  if (!used.has("borg")) return "Borg";
  for (let n = 2; ; n++) if (!used.has(`borg ${String(n)}`)) return `Borg ${String(n)}`;
}

/** Register the row when the host offers both seams. Returns whether it did. */
export function registerBorgTitle(ctx: TitleCtx, memory: ProfileMemory): boolean {
  const title = ctx.title;
  const profiles = ctx.profiles;
  if (title === undefined || profiles === undefined) {
    ctx.log?.(`the Borg has no title row, because this game gives it no ${title === undefined ? "title seam" : "profile seam"}`);
    return false;
  }
  const self = ctx.id ?? "borg";

  async function here(): Promise<void> {
    const listed = await profiles!.list();
    const id = listed.ok ? listed.value.find((profile) => profile.active)?.id ?? null : null;
    const started = await profiles!.switchTo(id, ARMED);
    if (!started.ok) await ask(title!, `The Borg could not start the character: ${started.message}`, [GIVE_UP]);
  }

  /** A refusal on the way to a separate profile falls back to this one. */
  async function refused(reason: string): Promise<void> {
    const answer = await ask(title!, `The Borg could not use a separate profile: ${reason}`, [FALLBACK_HERE]);
    if (answer === 0) await here();
  }

  async function separate(): Promise<void> {
    const listed = await profiles!.list();
    if (!listed.ok) return refused(listed.message);
    const all = listed.value;
    const ours = new Set(await memory.read());
    const made = all.filter((profile) => profile.id !== null && ours.has(profile.id));
    const which = await ask(title!, WHICH_PROMPT, [WHICH_FRESH, WHICH_COPY, ...made.map((profile) => `Use ${profile.name}`)]);
    if (which === null) return;
    let target: Api2Profile;
    if (which >= 2) {
      const chosen = made[which - 2];
      if (chosen === undefined) return;
      target = chosen;
    } else {
      let copyFrom: string | null | undefined;
      if (which === 1) {
        const source = await ask(title!, COPY_PROMPT, all.map((profile) => profile.name));
        if (source === null) return;
        const picked = all[source];
        if (picked === undefined) return;
        copyFrom = picked.id;
      }
      const created = await profiles!.create(freshName(all.map((profile) => profile.name)), copyFrom);
      if (!created.ok) return refused(created.message);
      target = created.value;
      const id = target.id;
      if (id === null) return refused("the new profile has no id");
      /* Stale ids are dropped here, and the new one is kept even if a later step is refused, so "Use" offers it next time. */
      await memory.write([...made.map((profile) => profile.id as string), id]);
      /* A copy keeps the loadout it was copied for. A fresh profile needs only the Borg, which depends on no other mod. */
      if (copyFrom === undefined) {
        const enabled = await profiles!.setEnabledMods(id, [self]);
        if (!enabled.ok) return refused(enabled.message);
      }
    }
    const switched = await profiles!.switchTo(target.id, ARMED);
    if (!switched.ok) return refused(switched.message);
  }

  void title
    .registerRow({
      id: "new-character",
      label: TITLE_LABEL,
      key: TITLE_KEY,
      async run() {
        const where = await ask(title, WHERE_PROMPT, [WHERE_SEPARATE, WHERE_HERE]);
        if (where === 0) await separate();
        else if (where === 1) await here();
      },
    })
    .then(
      (result) => {
        if (!result.ok) ctx.log?.(`the Borg's title row isn't registered: ${result.message}`);
      },
      (error: unknown) => ctx.log?.(`the Borg's title row isn't registered: ${String(error)}`),
    );
  return true;
}
