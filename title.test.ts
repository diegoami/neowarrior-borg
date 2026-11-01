import { describe, expect, it } from "vitest";
import {
  COPY_PROMPT, FALLBACK_HERE, freshName, GIVE_UP, installMemory, registerBorgTitle, TITLE_KEY, TITLE_LABEL,
  WHERE_HERE, WHERE_PROMPT, WHERE_SEPARATE, WHICH_COPY, WHICH_FRESH, WHICH_PROMPT, type ProfileMemory,
} from "./title.js";
import type { Api2Manage, Api2Profile, Api2Slot, Api2Title, Api2TitleAction, JsonValue } from "@rpgm-tools/neo-angband-mod-sdk";

type ModProfiles = Api2Manage["profiles"];

interface Fake {
  readonly title: Api2Title;
  readonly profiles: ModProfiles;
  readonly rows: Api2TitleAction[];
  readonly asked: { title: string; choices: readonly string[] }[];
  readonly calls: string[];
}

/** A slot that holds its value in memory. */
function slot(initial: JsonValue | null = null): Api2Slot & { held(): JsonValue | null } {
  let value: JsonValue | null = initial;
  return {
    get: () => Promise.resolve({ ok: true as const, value }),
    set: (next) => {
      value = next;
      return Promise.resolve({ ok: true as const, value: null });
    },
    held: () => value,
  };
}

/** A memory with no game storage behind it. */
async function memory(ids: string[] = []): Promise<ProfileMemory> {
  const held = installMemory(slot());
  if (ids.length > 0) await held.write(ids);
  return held;
}

/** A host whose prompts answer from `answers` in order, and whose profile calls can be refused by name. */
function host(answers: (number | null)[], options: { refuse?: Partial<Record<keyof ModProfiles, string>>; profiles?: Api2Profile[] } = {}): Fake {
  const rows: Api2TitleAction[] = [];
  const asked: Fake["asked"] = [];
  const calls: string[] = [];
  const profileList: Api2Profile[] = options.profiles ?? [{ id: null, name: "Default", active: true }];
  const refusal = (name: keyof ModProfiles): { ok: false; reason: "refused"; code: string; message: string } | null => {
    const message = options.refuse?.[name];
    return message === undefined ? null : { ok: false, reason: "refused", code: "refused", message };
  };
  const ok = <T,>(value: T) => ({ ok: true as const, value });
  return {
    rows,
    asked,
    calls,
    title: {
      registerRow(row) { rows.push(row); return Promise.resolve(ok({ id: row.id })); },
      removeRow: () => Promise.resolve(ok(null)),
      choose(title, choices) { asked.push({ title, choices }); return Promise.resolve(ok(answers.shift() ?? null)); },
    },
    profiles: {
      list: () => Promise.resolve(refusal("list") ?? ok(profileList)),
      create(name, copyFrom) {
        calls.push(`create ${name} ${copyFrom === undefined ? "fresh" : `from ${String(copyFrom)}`}`);
        const no = refusal("create");
        if (no !== null) return Promise.resolve(no);
        const made = { id: `p${String(profileList.length)}`, name, active: false };
        profileList.push(made);
        return Promise.resolve(ok(made));
      },
      setEnabledMods(id, mods) { calls.push(`enable ${id} ${mods.join(",")}`); return Promise.resolve(refusal("setEnabledMods") ?? ok(null)); },
      switchTo(id, action) { calls.push(`switch ${String(id)} ${action?.kind ?? "none"} ${String(action?.armController)}`); return Promise.resolve(refusal("switchTo") ?? ok(null)); },
    },
  };
}

async function pick(fake: Fake, held?: ProfileMemory): Promise<void> {
  expect(registerBorgTitle({ id: "borg", title: fake.title, profiles: fake.profiles }, held ?? (await memory()))).toBe(true);
  const row = fake.rows[0];
  if (row === undefined) throw new Error("no row");
  await row.run();
}

describe("the Borg title row", () => {
  it("registers its row under an id the game accepts", async () => {
    /* The game refuses any id outside a lowercase letter then lowercase letters, digits and hyphens, and says so only in its log. */
    const fake = host([]);
    registerBorgTitle({ id: "borg", title: fake.title, profiles: fake.profiles }, await memory());
    expect(fake.rows[0]?.id).toMatch(/^[a-z][a-z0-9-]{0,63}$/);
  });

  it("registers nothing without the title and profile seams", async () => {
    const fake = host([]);
    expect(registerBorgTitle({}, await memory())).toBe(false);
    expect(registerBorgTitle({ title: fake.title }, await memory())).toBe(false);
    expect(registerBorgTitle({ profiles: fake.profiles }, await memory())).toBe(false);
    expect(fake.rows).toHaveLength(0);
  });

  it("registers one row on B and asks where the character should live", async () => {
    const fake = host([null]);
    await pick(fake);
    expect(fake.rows.map((row) => [row.label, row.key])).toEqual([[TITLE_LABEL, TITLE_KEY]]);
    expect(TITLE_KEY).toBe("B");
    expect(fake.asked).toEqual([{ title: WHERE_PROMPT, choices: [WHERE_SEPARATE, WHERE_HERE] }]);
    expect(fake.calls).toEqual([]);
  });

  it("starts a fresh profile with only the Borg enabled, remembers it, and arms the controller there", async () => {
    const fake = host([0, 0]);
    const held = await memory();
    await pick(fake, held);
    expect(fake.asked[1]).toEqual({ title: WHICH_PROMPT, choices: [WHICH_FRESH, WHICH_COPY] });
    expect(fake.calls).toEqual(["create Borg fresh", "enable p1 borg", "switch p1 create-character true"]);
    expect(await held.read()).toEqual(["p1"]);
  });

  it("copies a chosen profile and keeps its loadout", async () => {
    const fake = host([0, 1, 1], { profiles: [{ id: null, name: "Default", active: true }, { id: "p1", name: "Ironman", active: false }] });
    const held = await memory();
    await pick(fake, held);
    expect(fake.asked[2]).toEqual({ title: COPY_PROMPT, choices: ["Default", "Ironman"] });
    expect(fake.calls).toEqual(["create Borg from p1", "switch p2 create-character true"]);
    expect(await held.read()).toEqual(["p2"]);
  });

  it("copies the default profile by its null id", async () => {
    const fake = host([0, 1, 0]);
    await pick(fake);
    expect(fake.calls[0]).toBe("create Borg from null");
  });

  it("offers the profiles the Borg made before, forgets the ones that are gone, and names the next one plainly", async () => {
    const held = await memory(["p1", "gone"]);
    const listed = [{ id: null, name: "Default", active: true }, { id: "p1", name: "Borg", active: false }, { id: "p2", name: "Mine", active: false }];
    const reuse = host([0, 2], { profiles: [...listed] });
    await pick(reuse, held);
    expect(reuse.asked[1]?.choices).toEqual([WHICH_FRESH, WHICH_COPY, "Use Borg"]);
    expect(reuse.calls).toEqual(["switch p1 create-character true"]);

    const another = host([0, 0], { profiles: [...listed] });
    await pick(another, held);
    expect(another.calls[0]).toBe("create Borg 2 fresh");
    expect(await held.read()).toEqual(["p1", "p3"]);
    expect(freshName(["Default", "Borg", "Borg 2"])).toBe("Borg 3");
    expect(freshName(["borg"])).toBe("Borg 2");
  });

  it("shows a refused create and starts the character in this profile instead", async () => {
    const fake = host([0, 0, 0], { refuse: { create: "Profiles are full." } });
    await pick(fake);
    expect(fake.asked[2]).toEqual({ title: "The Borg could not use a separate profile: Profiles are full.", choices: [FALLBACK_HERE] });
    expect(fake.calls).toEqual(["create Borg fresh", "switch null create-character true"]);
  });

  it("falls back the same way when enabling the Borg is refused", async () => {
    const fake = host([0, 0, 0], { refuse: { setEnabledMods: "Borg is not approved." } });
    await pick(fake);
    expect(fake.asked[2]?.title).toBe("The Borg could not use a separate profile: Borg is not approved.");
    expect(fake.calls).toEqual(["create Borg fresh", "enable p1 borg", "switch null create-character true"]);
  });

  it("shows the reason when even this profile refuses", async () => {
    const fake = host([1, 0], { refuse: { switchTo: "No character can start now." } });
    await pick(fake);
    expect(fake.asked[1]).toEqual({ title: "The Borg could not start the character: No character can start now.", choices: [GIVE_UP] });
  });

  it("starts the character in this profile with the controller armed", async () => {
    const fake = host([1], { profiles: [{ id: null, name: "Default", active: false }, { id: "p1", name: "Mine", active: true }] });
    await pick(fake);
    expect(fake.calls).toEqual(["switch p1 create-character true"]);
  });

  it("stops at Escape on any prompt", async () => {
    const which = host([0, null]);
    await pick(which);
    expect(which.calls).toEqual([]);
    const copy = host([0, 1, null]);
    await pick(copy);
    expect(copy.calls).toEqual([]);
    const fallback = host([0, 0, null], { refuse: { create: "No." } });
    await pick(fallback);
    expect(fallback.calls).toEqual(["create Borg fresh"]);
  });
});

describe("the Borg's profile memory", () => {
  it("keeps the ids in the install slot", async () => {
    const stored = slot();
    await installMemory(stored).write(["p1", "p2"]);
    expect(stored.held()).toEqual({ profileIds: ["p1", "p2"] });
    expect(await installMemory(stored).read()).toEqual(["p1", "p2"]);
  });

  it("ignores anything else in the slot, and remembers for the session when the slot fails", async () => {
    expect(await installMemory(slot(["p1"])).read()).toEqual([]);
    const broken: Api2Slot = {
      get: () => Promise.reject(new Error("blocked")),
      set: () => Promise.reject(new Error("blocked")),
    };
    const held = installMemory(broken);
    await held.write(["p9"]);
    expect(await held.read()).toEqual(["p9"]);
  });
});
