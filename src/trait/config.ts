/**
 * Configuration and seam inputs for the self-model port.
 *
 * The C borg reaches into engine internals the frozen AgentView deliberately
 * does not expose - the spell subsystem (borg_spell_legal/_fail, spell_chance),
 * the item-activation identity tables (act_*, borg_equips_item), the swap
 * subsystem (borg-trait-swap), the home inventory (borg_notice_home), and the
 * per-object sval/kind identity tables (borg-item-val). Rather than hack the
 * frozen contract, those are modelled here as explicit SEAMS. Most default to
 * "the borg is unaware / has none", which is faithful because the C reaches the
 * same state when it owns nothing. The sval identity table is the exception and
 * defaults to the real one; see BorgSvals for why an empty default was a bug
 * rather than a conservative choice.
 *
 * borg_cfg[] values come from reference/src/borg/borg.txt (stock defaults).
 */

import { flatSvals } from "../item/svals.js";

/** borg_cfg[] settings the ported decision code reads (borg.txt defaults). */
export interface BorgCfg {
  worshipsDamage: boolean;
  worshipsSpeed: boolean;
  worshipsHp: boolean;
  worshipsMana: boolean;
  worshipsAc: boolean;
  /** borg_worships_gold: sell hard, recall late, climb rather than pay. */
  worshipsGold: boolean;
  playsRisky: boolean;
  killsUniques: boolean;
  usesSwaps: boolean;
  /** borg_self_scum: the Borg may set its own gold target to afford a want. */
  selfScum: boolean;
  usesDynamicCalcs: boolean;
  noDeeper: number;
  munchkinStart: boolean;
  munchkinLevel: number;
  enchantLimit: number;
}

/**
 * Stock borg.txt defaults, from `borg_settings[]` (borg-init.c:57-92), which is
 * the authoritative table rather than borg.txt's own commentary.
 */
export function defaultCfg(): BorgCfg {
  return {
    worshipsDamage: false,
    worshipsSpeed: false,
    worshipsHp: false,
    worshipsMana: false,
    worshipsAc: false,
    worshipsGold: false,
    playsRisky: false,
    killsUniques: false,
    usesSwaps: true,
    selfScum: true,
    usesDynamicCalcs: false,
    noDeeper: 127,
    munchkinStart: false,
    munchkinLevel: 12,
    enchantLimit: 12,
  };
}

/**
 * THE ACTIVE SETTINGS, and why they are a module-level value.
 *
 * `borg_cfg[]` is a file-scope array upstream, read directly by twenty-odd call
 * sites across the decision code that take no configuration argument of their
 * own. The ported call sites are the same shape: `borgPrepared(ctx, depth)`,
 * `borgPower(ctx)`, `borgNotice(ctx)`. Threading a settings object through every
 * one of them would touch far more of the port than the feature is worth and
 * would move the port further from the C it is checked against, so this holds
 * the same value in the same place, and `resolveOpts` folds it in.
 *
 * A CALLER-SUPPLIED `opts.cfg` STILL WINS, per key. That is what keeps the
 * existing tests meaningful: a test that asks what a risky Borg does says so at
 * the call rather than depending on what some earlier test installed.
 *
 * ONE SET PER SESSION. `createBorg` installs the player's choices and nothing
 * else writes them, which matches how a mod toggle actually reaches a game: a
 * changed rule re-composes the page, so a running session never sees a setting
 * move under it.
 */
let activeCfg: BorgCfg = defaultCfg();

/** Install the player's settings over the stock defaults (createBorg). */
export function setBorgCfg(cfg: Partial<BorgCfg> = {}): void {
  activeCfg = { ...defaultCfg(), ...cfg };
}

/** The settings in force. Stock defaults until `setBorgCfg` says otherwise. */
export function borgCfg(): BorgCfg {
  return activeCfg;
}

/** Back to stock. For tests, and for a host that tears a Borg down. */
export function resetBorgCfg(): void {
  activeCfg = defaultCfg();
}

/**
 * The buff-timer safety net (trait.ts's borgNoticePlayer, buff-timers.ts).
 *
 * DELIBERATELY NOT A BorgCfg FIELD. Every BorgCfg key is a borg_cfg[] mirror -
 * manifest-tunables.test.ts asserts the whole set against UPSTREAM_DEFAULTS,
 * and there is no upstream toggle for this, because there is no upstream
 * defect for it to fix. The flag that gates it also is not this mod's own: it
 * lives in the Bug Fixes mod's manifest ("Borg Fixes" section, patches-scoped
 * to this mod - neo-angband#32), so it must not be folded into RULE_CFG in
 * plugin.ts either, which manifest-tunables.test.ts also checks against
 * Borg's OWN declared rules. A small parallel module-level value, same "one
 * set per session" shape as activeCfg above, is what stays out of both guards
 * while still reading like the rest of this module.
 */
let buffTimerSafetyNetOn = true;

/** Install the resolved cross-mod flag (plugin.ts's controller()). */
export function setBuffTimerSafetyNet(on: boolean): void {
  buffTimerSafetyNetOn = on;
}

/** Whether the safety net should run. On by default: absent (Bug Fixes not
 * installed, or an older one with no such section) is a correction missing,
 * not a feature to switch off. */
export function buffTimerSafetyNetEnabled(): boolean {
  return buffTimerSafetyNetOn;
}

/** Back to stock. For tests, and for a host that tears a Borg down. */
export function resetBuffTimerSafetyNet(): void {
  buffTimerSafetyNetOn = true;
}

/**
 * The spell/device seam. The C queries borg_spell_legal(_fail) and
 * borg_equips_item(act_*) to grant "infinite" amounts of detect/teleport/heal/
 * enchant/etc. These live in the magic + activation subsystems (P8.x). Default:
 * nothing legal, nothing equipped - the borg relies purely on carried items.
 */
export interface BorgSpellSeam {
  /** borg_spell_legal(spell): is the spell castable at all. */
  spellLegal(spell: string): boolean;
  /** borg_spell_legal_fail(spell, failPct): castable AND fail <= failPct. */
  spellLegalFail(spell: string, fail: number): boolean;
  /** borg_equips_item(act, useAsSwap): an equipped item grants this activation. */
  equipsItem(act: string): boolean;
  /** borg_equips_ring(sval): an equipped ring of this sval. */
  equipsRing(sval: number): boolean;
  /** spell_chance(0): live cast-failure percent of the first spell. */
  spellChance(): number;
  /** player_has(PF_*): a player-flag (class ability) query. */
  playerHas(flag: string): boolean;
}

/** Inert spell/device seam: nothing legal or equipped. */
export function defaultSpellSeam(): BorgSpellSeam {
  return {
    spellLegal: () => false,
    spellLegalFail: () => false,
    equipsItem: () => false,
    equipsRing: () => false,
    spellChance: () => 100,
    playerHas: () => false,
  };
}

/**
 * Home-inventory counts (borg_notice_home). Used only in the deep-endgame
 * power/prepared checks. Default: empty home.
 */
export interface BorgHomeSeam {
  numHealTrue: number;
  numEzhealTrue: number;
  numLifeTrue: number;
  numHeal: number;
  numEzheal: number;
  numLife: number;
  numSpeed: number;
}

/** Empty home. */
export function defaultHomeSeam(): BorgHomeSeam {
  return {
    numHealTrue: 0,
    numEzhealTrue: 0,
    numLifeTrue: 0,
    numHeal: 0,
    numEzheal: 0,
    numLife: 0,
    numSpeed: 0,
  };
}

/**
 * Frame inputs the C cheats from race/class/game internals that AgentView does
 * not surface. All optional; when omitted the borg falls back to AgentView's
 * already-derived aggregates (which are exactly what these tables build toward)
 * or to a neutral zero.
 */
export interface BorgFrame {
  /** race->r_adj + class->c_adj per stat (STAT order), for the used-stat calc. */
  statAdj?: readonly number[];
  /** player->obj_k->modifiers[OBJ_MOD_*+i] knowledge mask per stat (0/1). */
  statKnown?: readonly number[];
  /** player->player_hp[lev-1] - cumulative rolled HP at the current level. */
  playerHp?: number;
  /** class->magic.spell_first (level the class gets its first spell). */
  spellFirst?: number;
  /** class->magic.total_spells (0 for non-casters). */
  totalSpells?: number;
  /** class->magic.spell_weight (armor weight before mana penalty). */
  spellWeight?: number;
  /** stat_max[i] > stat_cur[i] per stat (drained) - for BI_ISFIX* flags. */
  statDrained?: readonly boolean[];
}

/** Neutral frame. */
export function defaultFrame(): BorgFrame {
  return {};
}

/**
 * Per-role sval identity, resolved by the engine at init (borg-item-val.c). The
 * inventory notice matches carried items by (tval, sval) against this to build
 * the consumable-ability traits (BI_AHEAL, BI_APHASE, ...) and the has[] map.
 * Keyed by the sv_/kv_ role name (borg-item-val.h).
 *
 * IT DEFAULTS TO THE REAL TABLE, and that is not a convenience. Upstream's
 * borg_init_item_val runs unconditionally at borg start-up, so there is no state
 * in which the borg does not know which sval a Ration of Food is. An empty table
 * makes every `item.sval === sv.<role>` comparison compare against `undefined`,
 * which is a Borg that believes a full pack contains no food, no cures, no phase
 * doors and no fuel - and it is what shipped, because the default was `{}` and no
 * caller passed anything. A caller may still override individual roles.
 */
export type BorgSvals = Partial<Record<string, number>>;

/** The full seam bundle threaded through notice/power/prepared. */
export interface BorgTraitOpts {
  cfg?: Partial<BorgCfg>;
  spells?: BorgSpellSeam;
  home?: BorgHomeSeam;
  frame?: BorgFrame;
  svals?: BorgSvals;
}

/** Resolve a partial opts bundle to a fully-populated one with defaults. */
export interface ResolvedOpts {
  cfg: BorgCfg;
  spells: BorgSpellSeam;
  home: BorgHomeSeam;
  frame: BorgFrame;
  svals: BorgSvals;
}

/** Fill in defaults for any unsupplied seam. */
export function resolveOpts(opts: BorgTraitOpts = {}): ResolvedOpts {
  return {
    cfg: { ...borgCfg(), ...opts.cfg },
    spells: opts.spells ?? defaultSpellSeam(),
    home: opts.home ?? defaultHomeSeam(),
    frame: opts.frame ?? defaultFrame(),
    svals: opts.svals ?? flatSvals(),
  };
}
