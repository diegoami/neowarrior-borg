/**
 * Message-stream consumption - a faithful port of the world-model half of
 * borg_parse (reference/src/borg/borg-messages.c) and the reaction passes of
 * borg_update (reference/src/borg/borg-update.c:2770-2890).
 *
 * Upstream this is a two-stage pipeline: borg_parse turns a raw game message
 * ("The orc dies.") into a tagged reaction ("DIED:the orc") via borg_react, and
 * borg_update later resolves each reaction against the tracked monster list with
 * borg_locate_kill (nearest record whose name matches, within a distance) and
 * mutates the world model (borg_delete_kill on death, etc.). The port collapses
 * the two stages into one pass over ctx.view.messages(), which is behaviorally
 * identical, and classifies each line with the same prefix/suffix tables.
 *
 * The THREE upstream passes matter, because their order is what decides whether
 * an attack raises fear. Pass one attributes a message to a tracked monster and
 * marks it used; pass two skips every used message and adds REGIONAL FEAR for
 * what is left. So fear is what the Borg feels about an attacker it could not
 * find, which is the whole point of borg_fear_regional: its own comment says it
 * exists to keep the Borg from resting while unseen guys attack it.
 *
 * FIDELITY NOTE (fog-of-war). struct borg_kill stores no monster name (it reads
 * r_info[r_idx] on demand), so the frozen port cannot re-derive a tracked
 * record's name to match borg_locate_kill exactly. Instead a death / blink
 * message prunes the nearest tracked monster that is NOT visible this tick
 * (a visible monster is demonstrably not the one that just died/vanished),
 * within the same distances the C used (20 for death, small for blink). With
 * exact monster ids from the frozen view a dead monster already disappears from
 * view.monsters() and would expire on the 2000-turn clock regardless; consuming
 * the death message just prunes it immediately, matching upstream timing.
 *
 * For an ATTACK message the port does better than upstream rather than worse:
 * the view hands over each visible monster's own race name, so matching the
 * attacker is exact where the C guessed a race from a name and a depth score.
 */

import type { BorgWorld } from "./world/model.js";
import { distance } from "./think.js";
import { BI } from "./trait/trait-index.js";
import { getFearCaches } from "./danger/state.js";
import { borgFearRegional } from "./danger/fear.js";

/** prefix_kill[] (borg-messages.c:64): the borg killed something. */
const PREFIX_KILL: readonly string[] = [
  "You have killed ",
  "You have slain ",
  "You have destroyed ",
];

/** suffix_died[] (borg-messages.c:76): a monster died. */
const SUFFIX_DIED: readonly string[] = [
  " die.",
  " dies.",
  " is destroyed.",
  " are destroyed.",
  " is destroyed!",
  " are destroyed!",
  " shrivel away in the light!",
  " shrivels away in the light!",
  " dissolve!",
  " dissolves!",
  " scream of agony!",
  " screams of agony!",
  " disintegrate!",
  " disintegrates!",
  " freeze and shatter!",
  " freezes and shatters!",
  " is drained dry!",
];

/** suffix_blink[] (borg-messages.c:96): a monster teleported / vanished. */
const SUFFIX_BLINK: readonly string[] = [
  " disappears!",
  " intones strange words.",
  " teleports away.",
  " blinks.",
  " makes a soft 'pop'.",
];

/**
 * The two MISS_BY suffixes, which upstream spells out as literals rather than
 * deriving from data (borg-messages.c:457 and :466 - "is repelled." is treated
 * as a miss).
 */
const SUFFIX_MISS_BY: readonly string[] = [" misses you.", " is repelled."];

/**
 * struct borg_read_message (borg-messages.h): a message template split at its
 * {variable} tags into the literal fragments that must all appear in a real
 * message for it to match.
 */
export interface BorgReadMessage {
  p1: string;
  p2?: string;
  p3?: string;
}

/**
 * borg_load_read_message (borg-messages.c:1364): split a data-file message
 * template ("hits {target}", "begs {target} for money") into its literal parts.
 * Verbatim port of the C's walk, including its two quirks: a template with no
 * tag at all keeps its whole (leading-space-trimmed) text as p1, and a trailing
 * part of exactly "." is dropped rather than recorded.
 */
export function borgLoadReadMessage(template: string): BorgReadMessage {
  const close = template.indexOf("}");
  if (close < 0) return { p1: template.replace(/^ +/, "") };

  /* Skip a LEADING tag, if there is one; otherwise start at the beginning. */
  let rest = template.startsWith("{") ? template.slice(close + 1) : template;

  let open = rest.indexOf("{");
  if (open < 0) return { p1: rest.replace(/^ +/, "") };

  rest = rest.replace(/^ +/, "");
  open = rest.indexOf("{");
  const p1 = rest.slice(0, open);

  rest = rest.slice(open);
  const close2 = rest.indexOf("}");
  if (close2 < 0) return { p1 };
  rest = rest.slice(close2 + 1);

  open = rest.indexOf("{");
  if (open < 0) {
    rest = rest.replace(/^ +/, "");
    /* two variables, ignore if last part is just . */
    if (rest.length > 0 && rest !== ".") return { p1, p2: rest };
    return { p1 };
  }

  rest = rest.replace(/^ +/, "");
  open = rest.indexOf("{");
  /* if (part_len): a zero-length middle part is NOT recorded, which is what
   * lets the final part fall into p2 rather than p3 below. */
  const p2 = open > 0 ? rest.slice(0, open).replace(/^ +/, "") : undefined;
  const carry = p2 === undefined ? {} : { p2 };

  rest = rest.slice(open);
  const close3 = rest.indexOf("}");
  if (close3 < 0) return { p1, ...carry };
  rest = rest.slice(close3 + 1).replace(/^ +/, "");
  if (rest.length === 0 || rest === ".") return { p1, ...carry };
  return p2 === undefined ? { p1, p2: rest } : { p1, p2, p3: rest };
}

/** borg_message_contains (borg-messages.c:133): every recorded part appears. */
export function borgMessageContains(value: string, m: BorgReadMessage): boolean {
  if (!value.includes(m.p1)) return false;
  if (m.p2 !== undefined && !value.includes(m.p2)) return false;
  if (m.p3 !== undefined && !value.includes(m.p3)) return false;
  return true;
}

/**
 * suffix_hit_by (borg_init_hit_by_messages, borg-messages.c:1595): one entry per
 * action message of every blow method in the data. Derived from the engine's own
 * bound blow-method registry rather than copied here, so a mod that adds a blow
 * method is covered on the same terms as core's.
 *
 * Empty means "this Borg was built without the table", and then no attack
 * message is recognised and no regional fear is ever raised. The host always
 * supplies it (see makeCoreResolvers); a bare test Borg does not.
 */
export interface BorgMessageTables {
  hitBy: readonly BorgReadMessage[];
  spell: readonly { index: number; message: BorgReadMessage }[];
  spellInvisible: readonly { index: number; message: BorgReadMessage }[];
}

/** No tables: nothing recognises an attack message. */
export function emptyMessageTables(): BorgMessageTables {
  return { hitBy: [], spell: [], spellInvisible: [] };
}

/**
 * Build suffix_hit_by from blow-method action templates ("hits {target}"). One
 * entry per template, in the order the registry yields them, exactly as
 * borg_init_hit_by_messages walks blow_methods[i].messages.
 */
export function buildHitByTable(
  templates: readonly string[],
): BorgMessageTables {
  return { hitBy: templates.map((t) => borgLoadReadMessage(t)), spell: [], spellInvisible: [] };
}

/** Build the two monster-spell message tables from the bound registry. */
export function buildSpellTable(
  spells: readonly {
    index: number;
    levels: readonly { message: string; blindMessage: string; missMessage: string }[];
  }[],
): BorgMessageTables {
  const spell: { index: number; message: BorgReadMessage }[] = [];
  const spellInvisible: { index: number; message: BorgReadMessage }[] = [];
  for (const s of spells) {
    for (const level of s.levels) {
      if (level.blindMessage) spellInvisible.push({ index: s.index, message: borgLoadReadMessage(level.blindMessage) });
      if (level.message) spell.push({ index: s.index, message: borgLoadReadMessage(level.message) });
      if (level.missMessage) spell.push({ index: s.index, message: borgLoadReadMessage(level.missMessage) });
    }
  }
  return { hitBy: [], spell, spellInvisible };
}

/** borg_fear_spell: conservative regional fear for an unseen spell attack. */
function borgFearSpell(world: BorgWorld, index: number): number {
  const damage = Math.max(0, (world.self.oldchp - (world.self.trait[BI.CURHP] ?? 0)) * 2);
  /* RSF_SHRIEK is the first real monster spell (RSF_NONE is zero). */
  if (index === 1) {
    if ((world.self.trait[BI.CLEVEL] ?? 0) <= 5) {
      world.self.goal.fleeing = true;
      world.self.goal.leaving = true;
    }
    return 10;
  }
  /* Unknown/mod spells still represent an unexplained hostile action. */
  return damage > 0 ? damage : 10;
}

function anyPrefix(msg: string, table: readonly string[]): boolean {
  for (const p of table) if (msg.startsWith(p)) return true;
  return false;
}

function anySuffix(msg: string, table: readonly string[]): boolean {
  for (const s of table) if (msg.endsWith(s)) return true;
  return false;
}

/**
 * borg_locate_kill approximation: the index of the nearest tracked monster to
 * the borg that is not visible this tick, within `dist`, or 0 for none. Deleting
 * such a record is how the C prunes dead / vanished monsters.
 */
function locateStaleKill(
  w: BorgWorld,
  visibleIds: ReadonlySet<number>,
  dist: number,
): number {
  const px = w.self.c.x;
  const py = w.self.c.y;
  let best = 0;
  let bestD = dist + 1;
  for (const [i, k] of w.kills.entries()) {
    if (visibleIds.has(k.mIdx)) continue; /* still visible -> not the one gone */
    const d = distance(px, py, k.pos.x, k.pos.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * The race name a message's `who` fragment refers to, or null when the fragment
 * names no monster the Borg could identify.
 *
 * borg_guess_race_name (borg-flow-kill.c:1150) matches a unique's name outright
 * and requires a "The " / "the " article on anything else, treating a bare
 * non-unique name as a player ghost. The port keeps the article rule and answers
 * with the name itself rather than a race index, because the view already gives
 * every visible monster its own race name.
 */
function raceNameOf(who: string): string {
  if (who.startsWith("The ") || who.startsWith("the ")) return who.slice(4);
  return who;
}

/** my_strnicmp(who, "Something", 9) / (who, "It", 2): an invisible attacker. */
function isInvisibleAttacker(who: string): boolean {
  const lower = who.toLowerCase();
  return lower.startsWith("something") || lower.startsWith("it");
}

/**
 * borg_locate_kill (borg-flow-kill.c:1293) for an attack message: the tracked
 * monster `who` names, within `r` grids of the borg, or 0 for "could not find
 * it". Only the branches that decide fear are ported:
 *
 *  - "Something" / "It": an invisible attacker. Upstream notes it, timestamps
 *    borg.need_see_invis so the detect-invisible maneuvers become legal, and
 *    returns 0 so the caller raises regional fear.
 *  - the name match: exact against the view's own race name for anything
 *    visible, where the C guessed a race from the name and a depth score.
 *
 * Two upstream branches have no analogue and are left out rather than
 * approximated. The object-conversion hack (a clear-charactered monster the C
 * had recorded as an object) cannot arise: the port is told which grids hold
 * monsters. The " (offscreen)" suffix cannot arise either, because the view has
 * no panel to be off.
 */
function locateAttacker(
  w: BorgWorld,
  names: ReadonlyMap<number, string>,
  who: string,
  r: number,
): number {
  if (isInvisibleAttacker(who)) {
    /* borg.need_see_invis = borg_t: ask for detect-invisible from now on. */
    w.self.temp.needSeeInvis = w.clock;
    return 0;
  }

  const wanted = raceNameOf(who).toLowerCase();
  const px = w.self.c.x;
  const py = w.self.c.y;
  let best = 0;
  let bestD = r + 1;
  for (const [i, k] of w.kills.entries()) {
    const name = names.get(k.mIdx);
    if (name === undefined) continue; /* not visible: no name to match */
    if (name.toLowerCase() !== wanted) continue;
    const d = distance(px, py, k.pos.x, k.pos.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** The `who` fragment of a message that matched `m`, or null. */
function whoBefore(msg: string, m: BorgReadMessage): string | null {
  const at = msg.indexOf(m.p1);
  if (at <= 0) return null;
  /* strnfmt(who, (start - msg), ...) copies one fewer char than the offset,
   * which drops the space the template's leading fragment carries. */
  return msg.slice(0, at - 1);
}

/**
 * Fold the message stream into the world model. Call once per perceive, after
 * the monster list has been refreshed from the current view.
 *
 * `names` maps a visible monster's game id to its race name, which is what makes
 * attributing an attack exact. `tables` carries the data-derived attack-message
 * table (see BorgMessageTables).
 *
 * Returns the number of monster records deleted (for tests / debug).
 */
export function borgReactMessages(
  world: BorgWorld,
  messages: readonly string[],
  visibleIds: ReadonlySet<number>,
  names: ReadonlyMap<number, string> = new Map(),
  tables: BorgMessageTables = emptyMessageTables(),
): number {
  let deleted = 0;

  /* hit_dist (borg-update.c:1771): 1, unless a teleport or quake moved things.
   * The port has no QUAKE / SPELL_ reaction yet, so the nominal value stands. */
  const hitDist = 1;

  /* 4 * ((cdepth / 5) + 1) for a hit, half that for a miss (borg-update.c:2874
   * and :2881). */
  const cdepth = world.self.trait[BI.CDEPTH] ?? 0;
  const hitFear = 4 * (Math.trunc(cdepth / 5) + 1);
  const missFear = 2 * (Math.trunc(cdepth / 5) + 1);

  const fear = getFearCaches(world);
  const raiseFear = (k: number): void => {
    borgFearRegional(world, fear, world.self.c.y, world.self.c.x, k, false);
  };

  for (const raw of messages) {
    const msg = raw.trim();
    if (!msg) continue;

    /* Deaths (borg-update.c:2785: DIED -> borg_delete_kill within 20). */
    if (anyPrefix(msg, PREFIX_KILL) || anySuffix(msg, SUFFIX_DIED)) {
      const k = locateStaleKill(world, visibleIds, 20);
      if (k > 0) {
        world.kills.delete(k, world);
        deleted += 1;
      }
      continue;
    }

    /* Blink / teleport (borg-update.c:1701: BLINK -> relocate/forget). With no
     * new position known, forget the nearest stale record so the borg does not
     * flow to where the monster used to be. */
    if (anySuffix(msg, SUFFIX_BLINK)) {
      const k = locateStaleKill(world, visibleIds, 20);
      if (k > 0) {
        world.kills.delete(k, world);
        deleted += 1;
      }
      continue;
    }

    /* Word of Recall / Deep Descent ignition, lift-off and cancellation
     * (borg-messages.c:709-757). Without these the Borg never believes it is
     * mid-recall, so it re-reads the scroll and never sits still for it. */
    if (msg.startsWith("The air about you becomes ")) {
      world.self.goal.recalling = 15000 + 5000;
      continue;
    }
    if (msg.startsWith("The air around you starts ")) {
      world.self.goal.descending = 3000 + 2000;
      continue;
    }
    if (msg.startsWith("You feel yourself yanked ")) {
      world.self.goal.recalling = 0;
      continue;
    }
    if (msg.startsWith("The floor opens beneath you!")) {
      world.self.goal.descending = 0;
      continue;
    }
    if (msg.startsWith("A tension leaves ")) {
      world.self.goal.recalling = 0;
      continue;
    }
    if (msg.startsWith("The air around you stops ")) {
      world.self.goal.descending = 0;
      continue;
    }

    /*
     * Buff on/off messages (borg-messages.c:772-1025). This is upstream's
     * PRIMARY bookkeeping for these flags. Without this table
     * `world.self.temp.*` never left its all-false initial state, so the
     * buff-aware defensive maneuvers (fight/defend.ts) always believed nothing
     * was active and kept re-casting spells the character already had running.
     *
     * The safety net for the failure this table cannot cover - a message that
     * never arrives, leaving a buff latched on - is borg-trait.c:3010's
     * cross-check against the player's real timers, ported in
     * trait/buff-timers.ts and run by borgNotice just before this pass.
     */
    if (msg.startsWith("You feel safe from evil!")) {
      world.self.temp.protFromEvil = true;
      continue;
    }
    if (msg.startsWith("You no longer feel safe from evil.")) {
      world.self.temp.protFromEvil = false;
      continue;
    }
    if (msg.startsWith("You feel yourself moving faster!")) {
      world.self.temp.fast = true;
      continue;
    }
    if (msg.startsWith("You feel yourself slow down.")) {
      world.self.temp.fast = false;
      continue;
    }
    if (msg.startsWith("You feel righteous")) {
      world.self.temp.bless = true;
      continue;
    }
    if (msg.startsWith("The prayer has expired.")) {
      world.self.temp.bless = false;
      continue;
    }
    if (msg.startsWith("You feel your mind accelerate.")) {
      world.self.temp.fastcast = true;
      continue;
    }
    if (msg.startsWith("You feel your mind slow again.")) {
      world.self.temp.fastcast = false;
      continue;
    }
    if (msg.startsWith("You feel like a hero!")) {
      world.self.temp.hero = true;
      continue;
    }
    if (msg.startsWith("You no longer feel heroic.")) {
      world.self.temp.hero = false;
      continue;
    }
    if (msg.startsWith("You feel like a killing machine!")) {
      world.self.temp.berserk = true;
      continue;
    }
    if (msg.startsWith("You no longer feel berserk.")) {
      world.self.temp.berserk = false;
      continue;
    }
    if (msg.startsWith("You feel resistant to acid!")) {
      world.self.temp.resAcid = true;
      continue;
    }
    if (msg.startsWith("You are no longer resistant to acid.")) {
      world.self.temp.resAcid = false;
      continue;
    }
    if (msg.startsWith("You feel resistant to electricity!")) {
      world.self.temp.resElec = true;
      continue;
    }
    if (msg.startsWith("You are no longer resistant to electricity.")) {
      world.self.temp.resElec = false;
      continue;
    }
    if (msg.startsWith("You feel resistant to fire!")) {
      world.self.temp.resFire = true;
      continue;
    }
    if (msg.startsWith("You are no longer resistant to fire.")) {
      world.self.temp.resFire = false;
      continue;
    }
    if (msg.startsWith("You feel resistant to cold!")) {
      world.self.temp.resCold = true;
      continue;
    }
    if (msg.startsWith("You are no longer resistant to cold.")) {
      world.self.temp.resCold = false;
      continue;
    }
    if (msg.startsWith("You feel resistant to poison!")) {
      world.self.temp.resPois = true;
      continue;
    }
    if (msg.startsWith("You are no longer resistant to poison.")) {
      world.self.temp.resPois = false;
      continue;
    }
    if (
      msg.startsWith("A mystic shield forms around your body!") ||
      msg.startsWith("Your skin turns to stone.")
    ) {
      world.self.temp.shield = true;
      continue;
    }
    if (
      msg.startsWith("Your mystic shield crumbles away.") ||
      msg.startsWith("A fleshy shade returns to your skin.")
    ) {
      world.self.temp.shield = false;
      continue;
    }

    /* MISS_BY (borg-messages.c:457/466, resolved at borg-update.c:2814 and
     * feared at :2881). */
    const missSuffix = SUFFIX_MISS_BY.find((s) => msg.endsWith(s));
    if (missSuffix !== undefined) {
      const who = msg.slice(0, msg.length - missSuffix.length);
      if (locateAttacker(world, names, who, hitDist) === 0) raiseFear(missFear);
      continue;
    }

    /* HIT_BY (borg-messages.c:476, resolved at borg-update.c:2805 and feared at
     * :2874). The table is data-derived, so an unbuilt table recognises none of
     * these and the Borg feels no fear about an attacker it cannot see. */
    let hit: BorgReadMessage | null = null;
    for (const entry of tables.hitBy) {
      if (borgMessageContains(msg, entry)) {
        hit = entry;
        break;
      }
    }
    if (hit) {
      const who = whoBefore(msg, hit);
      if (who !== null && locateAttacker(world, names, who, hitDist) === 0) {
        raiseFear(hitFear);
      }
      continue;
    }

    /* Monster spells (borg-messages.c:512-529; borg-update.c:2889). The
     * invisible table is deliberately checked only for the game's canonical
     * unseen-caster prefixes, just as upstream does. A visible spell is feared
     * only when its named caster cannot be located nearby. */
    if (msg.startsWith("Something ") || msg.startsWith("You ")) {
      for (const entry of tables.spellInvisible) {
        if (borgMessageContains(msg, entry.message)) {
          raiseFear(borgFearSpell(world, entry.index));
          world.self.temp.needSeeInvis = world.clock;
          break;
        }
      }
      continue;
    }

    for (const entry of tables.spell) {
      if (!borgMessageContains(msg, entry.message)) continue;
      const at = msg.indexOf(entry.message.p1);
      if (at <= 0) break;
      const who = msg.slice(0, at - 1);
      if (locateAttacker(world, names, who, hitDist) === 0) {
        raiseFear(borgFearSpell(world, entry.index));
      }
      break;
    }
  }

  return deleted;
}
