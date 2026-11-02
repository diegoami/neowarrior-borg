/**
 * The title screen's "New Borg character" row (neostryder/neo-angband#327).
 *
 * An autoplayer's games want their own options, mod settings and roster, so
 * the row offers a separate profile first and this profile second, and starts
 * character creation with the Borg armed in either. The armed controller is
 * the player's consent for that one character, which is why plugin.ts offers to
 * play on an armed character without the Ctrl-Z confirm.
 *
 * FORK: T05 (#8) - the row does not only ARM the controller, it ARMS THE
 * BIRTH: immediately before the create-character action (the row's commit
 * point - the last call it makes on the page) it sets the birth presenter's
 * one-shot flag (src/birth/presenter.ts), so the character it starts is BORN
 * as the planned warrior, its race chosen by the borg.raceChoice setting
 * (src/birth/settings.ts). Choosing the row was already the player's consent
 * in upstream's design; this spends it on the fork's warrior instead of the
 * game's own screens.
 *
 * The row needs three host seams: the title (`ui:title`), profile management
 * (`profiles:manage`) and the mod's install slot (`mod.store.install`, where
 * the flag lives). With any missing nothing is registered and the Borg
 * starts only from Ctrl-Z, as before.
 */

import type { Api2Manage, Api2Profile, Api2ProfileAction, Api2Slot, Api2Title, JsonValue } from "@rpgm-tools/neo-angband-mod-sdk";
import { BIRTH_FLAG_KEY, clearWarriorBirthFlag, setWarriorBirthFlag } from "./src/birth/presenter.js";

/** The parts of the mod API the row reads. */
export interface TitleCtx {
  readonly id?: string;
  readonly log?: (message: string) => void;
  readonly title?: Api2Title;
  readonly profiles?: Api2Manage["profiles"];
  /**
   * FORK: T05 (#8) - the mod's install slot (mod.store.install), the birth
   * flag's home. Without it the row cannot arm a planned birth, and a row
   * that started characters it could not plan would be lying, so nothing is
   * registered - the same treatment a missing title or profile seam gets.
   */
  readonly slot?: Pick<Api2Slot, "get" | "set">;
}

/** The ids of the profiles the Borg made, kept outside every profile. */
export interface ProfileMemory {
  read(): Promise<readonly string[]>;
  write(ids: readonly string[]): Promise<void>;
}

export const TITLE_LABEL = "New Warrior Borg character";
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
        /* FORK: T03 fixes (#26) - the install slot is shared with the birth
         * presenter's one-shot warriorBirth flag (src/birth/presenter.ts),
         * so this write carries every sibling key forward instead of
         * replacing the whole object: a replace here would erase a pending
         * flag and cost the restart loop its next warrior. Read what is
         * there, write it back with ours changed - the same read-modify-
         * write the presenter consumes the flag under. */
        const current = await slot.get();
        const base = current.ok && current.value !== null &&
            typeof current.value === "object" && !Array.isArray(current.value)
          ? (current.value as Record<string, JsonValue>)
          : {};
        await slot.set({ ...base, profileIds: session as string[] });
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

/** Whether the one-shot birth flag is standing in the slot right now. The presenter owns the flag's shape; this reads it. */
async function birthFlagStanding(slot: Pick<Api2Slot, "get" | "set">): Promise<boolean> {
  try {
    const read = await slot.get();
    if (!read.ok) return false;
    const value = read.value;
    return value !== null && typeof value === "object" && !Array.isArray(value) &&
      (value as Record<string, unknown>)[BIRTH_FLAG_KEY] === true;
  } catch {
    return false;
  }
}

/** Register the row when the host offers all three seams. Returns whether it did. */
export function registerBorgTitle(ctx: TitleCtx, memory: ProfileMemory): boolean {
  const title = ctx.title;
  const profiles = ctx.profiles;
  const slot = ctx.slot;
  if (title === undefined || profiles === undefined || slot === undefined) {
    const missing = title === undefined ? "title seam" : profiles === undefined ? "profile seam" : "install slot";
    ctx.log?.(`the Borg has no title row, because this game gives it no ${missing}`);
    return false;
  }
  const self = ctx.id ?? "borg";

  /**
   * FORK: T05 (#8) - THE COMMIT POINT, pinned from the host's own
   * profile-runtime.ts: `switchTo(id, { kind: "create-character",
   * armController: true })` is the last call the row makes on this page. The
   * host stashes the action in durable storage and reloads, and the next
   * page runs character creation with the controller armed - so the one-shot
   * birth flag must already be standing in the install slot BEFORE that
   * call: after it there is no page left to set it on, and the presenter of
   * the next page (built at mod registration) reads the flag before any
   * birth is offered. That is why the flag is set as late as possible -
   * every earlier refusal path (Escape, a refused create or enable) reaches
   * no flag at all - and behind a read-back, not the write's own ok (#25: a
   * slot answers ok to a set whose backing write was swallowed, and
   * reloading into a flag that is not there births nothing at all,
   * silently, because no flag reads as the human path). The same verified
   * standard the restart loop holds its own flag-set to (src/loop/restart.ts
   * - the loop reads the flag's shape back the same way). The flag-set
   * lives HERE, on the mod side of the seam, not inside the manage call:
   * the install slot is every host's, while `manage.profiles` is a
   * first-party seam this row only gets on the game's own host.
   */
  async function armBirth(): Promise<boolean> {
    const written = await setWarriorBirthFlag(slot!);
    if (written && (await birthFlagStanding(slot!))) return true;
    ctx.log?.("the Borg's birth flag would not settle in storage, so the title row starts no character");
    await ask(title!, "The Borg could not start the character: its birth flag would not settle in storage.", [GIVE_UP]);
    return false;
  }

  /**
   * The switch was refused, so the page is NOT going away: take the flag
   * back, verified, or say at full volume that it may still be set - a
   * standing flag beside a live page would take the NEXT character created
   * after any later reload - a human's - as the presenter's own (the
   * stranded-flag hazard; the same words and standard as the restart loop's,
   * src/loop/restart.ts, and the presenter's prepare is still the last line).
   */
  async function strand(): Promise<void> {
    const cleared = await clearWarriorBirthFlag(slot!);
    if (cleared) return;
    ctx.log?.(
      "the Borg could not durably clear its birth flag after a refused start, so the flag may still be set: " +
        "the next character created after any later reload would be born as the Borg's planned warrior. " +
        "The presenter still consumes-or-declines it on that page, but a human's birth could be taken once - " +
        "clear the mod's install storage before letting anyone create a character here",
    );
  }

  async function here(): Promise<void> {
    const listed = await profiles!.list();
    const id = listed.ok ? listed.value.find((profile) => profile.active)?.id ?? null : null;
    if (!(await armBirth())) return;
    const started = await profiles!.switchTo(id, ARMED);
    if (started.ok) return;
    await strand();
    await ask(title!, `The Borg could not start the character: ${started.message}`, [GIVE_UP]);
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
    /* FORK: T05 (#8) - the commit point of the separate-profile flow: the
     * flag goes in immediately before the switch (see armBirth), and comes
     * back out the same way if the switch is refused. */
    if (!(await armBirth())) return;
    const switched = await profiles!.switchTo(target.id, ARMED);
    if (switched.ok) return;
    await strand();
    return refused(switched.message);
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
