// borg - generated from plugin.ts by neo-angband-mod-build
// (@rpgm-tools/neo-angband-mod-sdk). Edit the TypeScript source, not this file.

// title.ts
var TITLE_LABEL = "New Borg character";
var TITLE_KEY = "B";
var WHERE_PROMPT = "Choose where the new Borg character plays";
var WHERE_SEPARATE = "In a separate profile, with its own options, mods and characters";
var WHERE_HERE = "In this profile";
var WHICH_PROMPT = "Choose a profile for the Borg";
var WHICH_FRESH = "Start a fresh profile";
var WHICH_COPY = "Copy an existing profile";
var COPY_PROMPT = "Choose a profile to copy. Its options, mods and mod settings come across, and its characters stay behind.";
var FALLBACK_HERE = "Start the character in this profile";
var GIVE_UP = "Back to the title";
var ARMED = { kind: "create-character", armController: true };
function idsFrom(stored) {
  if (stored === null || typeof stored !== "object" || Array.isArray(stored)) return [];
  const ids = stored["profileIds"];
  return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
}
function installMemory(slot) {
  let session = [];
  return {
    async read() {
      try {
        const result = await slot.get();
        if (result.ok && result.value !== null) return idsFrom(result.value);
      } catch {
      }
      return session;
    },
    async write(ids) {
      session = [...ids];
      try {
        await slot.set({ profileIds: session });
      } catch {
      }
    }
  };
}
async function ask(title, label, choices) {
  const answer = await title.choose(label, choices);
  return answer.ok ? answer.value : null;
}
function freshName(taken) {
  const used = new Set(taken.map((name) => name.toLowerCase()));
  if (!used.has("borg")) return "Borg";
  for (let n = 2; ; n++) if (!used.has(`borg ${String(n)}`)) return `Borg ${String(n)}`;
}
function registerBorgTitle(ctx, memory) {
  const title = ctx.title;
  const profiles = ctx.profiles;
  if (title === void 0 || profiles === void 0) {
    ctx.log?.(`the Borg has no title row, because this game gives it no ${title === void 0 ? "title seam" : "profile seam"}`);
    return false;
  }
  const self = ctx.id ?? "borg";
  async function here() {
    const listed = await profiles.list();
    const id = listed.ok ? listed.value.find((profile) => profile.active)?.id ?? null : null;
    const started = await profiles.switchTo(id, ARMED);
    if (!started.ok) await ask(title, `The Borg could not start the character: ${started.message}`, [GIVE_UP]);
  }
  async function refused(reason) {
    const answer = await ask(title, `The Borg could not use a separate profile: ${reason}`, [FALLBACK_HERE]);
    if (answer === 0) await here();
  }
  async function separate() {
    const listed = await profiles.list();
    if (!listed.ok) return refused(listed.message);
    const all = listed.value;
    const ours = new Set(await memory.read());
    const made = all.filter((profile) => profile.id !== null && ours.has(profile.id));
    const which = await ask(title, WHICH_PROMPT, [WHICH_FRESH, WHICH_COPY, ...made.map((profile) => `Use ${profile.name}`)]);
    if (which === null) return;
    let target;
    if (which >= 2) {
      const chosen = made[which - 2];
      if (chosen === void 0) return;
      target = chosen;
    } else {
      let copyFrom;
      if (which === 1) {
        const source = await ask(title, COPY_PROMPT, all.map((profile) => profile.name));
        if (source === null) return;
        const picked = all[source];
        if (picked === void 0) return;
        copyFrom = picked.id;
      }
      const created = await profiles.create(freshName(all.map((profile) => profile.name)), copyFrom);
      if (!created.ok) return refused(created.message);
      target = created.value;
      const id = target.id;
      if (id === null) return refused("the new profile has no id");
      await memory.write([...made.map((profile) => profile.id), id]);
      if (copyFrom === void 0) {
        const enabled = await profiles.setEnabledMods(id, [self]);
        if (!enabled.ok) return refused(enabled.message);
      }
    }
    const switched = await profiles.switchTo(target.id, ARMED);
    if (!switched.ok) return refused(switched.message);
  }
  void title.registerRow({
    id: "new-character",
    label: TITLE_LABEL,
    key: TITLE_KEY,
    async run() {
      const where = await ask(title, WHERE_PROMPT, [WHERE_SEPARATE, WHERE_HERE]);
      if (where === 0) await separate();
      else if (where === 1) await here();
    }
  }).then(
    (result) => {
      if (!result.ok) ctx.log?.(`the Borg's title row isn't registered: ${result.message}`);
    },
    (error) => ctx.log?.(`the Borg's title row isn't registered: ${String(error)}`)
  );
  return true;
}

// src/activate.ts
var NOSCORE_BORG = 32;

// src/world/grid.ts
var AUTO_MAX_X = 198;
var AUTO_MAX_Y = 66;
var BORG_MARK = 1;
var BORG_GLOW = 2;
var BORG_LIGHT = 16;
var BORG_VIEW = 32;
function makeBorgGrid() {
  return {
    feat: 0,
    info: 0,
    trap: false,
    glyph: false,
    web: false,
    store: 0,
    take: 0,
    kill: 0,
    xtra: 0
  };
}
var BorgMap = class {
  width = AUTO_MAX_X;
  height = AUTO_MAX_Y;
  grids;
  constructor() {
    this.grids = new Array(AUTO_MAX_Y);
    for (let y = 0; y < AUTO_MAX_Y; y++) {
      const row = new Array(AUTO_MAX_X);
      for (let x = 0; x < AUTO_MAX_X; x++) row[x] = makeBorgGrid();
      this.grids[y] = row;
    }
  }
  /** True when (x, y) is inside the map bounds. */
  inBounds(x, y) {
    return x >= 0 && x < AUTO_MAX_X && y >= 0 && y < AUTO_MAX_Y;
  }
  /** The grid at (x, y). Callers must ensure bounds (inBounds). */
  at(x, y) {
    return this.grids[y][x];
  }
  /** Reset every grid to empty (borg_init_cave on level change). */
  wipe() {
    for (let y = 0; y < AUTO_MAX_Y; y++) {
      const row = this.grids[y];
      for (let x = 0; x < AUTO_MAX_X; x++) {
        const g = row[x];
        g.feat = 0;
        g.info = 0;
        g.trap = false;
        g.glyph = false;
        g.web = false;
        g.store = 0;
        g.take = 0;
        g.kill = 0;
        g.xtra = 0;
      }
    }
  }
};

// src/world/kill.ts
function makeBorgKill() {
  return {
    rIdx: 0,
    known: false,
    awake: false,
    confused: false,
    afraid: false,
    quiver: false,
    stunned: false,
    poisoned: false,
    seen: false,
    used: false,
    pos: { x: 0, y: 0 },
    ox: 0,
    oy: 0,
    speed: 0,
    moves: 0,
    rangedAttack: 0,
    spell: [],
    power: 0,
    injury: 0,
    other: 0,
    level: 0,
    spellFlags: [],
    when: 0,
    mIdx: 0,
    isMultiplier: false
  };
}
var BorgKills = class {
  list = [makeBorgKill()];
  /** borg_kills_cnt: highest allocated index + 1. */
  count = 1;
  /** borg_kills_nxt: next slot to consider reusing. */
  next = 1;
  /** Index of a known summoner on the level, 0 for none. */
  summoner = 0;
  /** The record at index i (i >= 1). */
  at(i) {
    return this.list[i];
  }
  /** True when index i holds a live record. */
  has(i) {
    return i >= 1 && i < this.count && this.list[i].rIdx !== 0;
  }
  /**
   * Allocate (or reuse) a slot and return its index. Mirrors the upstream
   * scan-for-free-then-extend allocation in borg_new_kill.
   */
  alloc() {
    for (let i2 = 1; i2 < this.count; i2++) {
      if (this.list[i2].rIdx === 0) return i2;
    }
    const i = this.count;
    this.list[i] = makeBorgKill();
    this.count += 1;
    return i;
  }
  /**
   * Clear the record at index i (borg_delete_kill, borg-flow-kill.c:411-439).
   *
   * `stamp`, when supplied, is where upstream's own timestamp lives
   * (borg-flow-kill.c:430-432): ANY deletion of a MULTIPLY-flagged record -
   * a kill, a blink, an expiry, a forgotten phantom - arms
   * `whenLastKillMult`, because upstream's version of this check runs inside
   * `borg_delete_kill` itself rather than only on the "I killed it" path.
   * Optional so a caller that has nothing to stamp (a bare test, most of
   * them) can still delete.
   */
  delete(i, stamp) {
    if (i < 1 || i >= this.list.length) return;
    const kill = this.list[i];
    if (stamp && kill.isMultiplier) stamp.self.whenLastKillMult = stamp.clock;
    this.list[i] = makeBorgKill();
  }
  /** Reset the whole list on level change. */
  wipe() {
    this.list.length = 1;
    this.list[0] = makeBorgKill();
    this.count = 1;
    this.next = 1;
    this.summoner = 0;
  }
  /** Iterate live records with their indices. */
  *entries() {
    for (let i = 1; i < this.count; i++) {
      const k = this.list[i];
      if (k.rIdx !== 0) yield [i, k];
    }
  }
};

// src/world/take.ts
function makeBorgTake() {
  return {
    kIdx: 0,
    tval: 0,
    known: false,
    value: 0,
    pos: { x: 0, y: 0 },
    when: 0,
    oIdx: 0
  };
}
var BorgTakes = class {
  list = [makeBorgTake()];
  /** borg_takes_cnt: highest allocated index + 1. */
  count = 1;
  /** borg_takes_nxt: next slot to consider reusing. */
  next = 1;
  /** The record at index i (i >= 1). */
  at(i) {
    return this.list[i];
  }
  /** True when index i holds a live record. */
  has(i) {
    return i >= 1 && i < this.count && this.list[i].kIdx !== 0;
  }
  /** Allocate (or reuse) a slot and return its index. */
  alloc() {
    for (let i2 = 1; i2 < this.count; i2++) {
      if (this.list[i2].kIdx === 0) return i2;
    }
    const i = this.count;
    this.list[i] = makeBorgTake();
    this.count += 1;
    return i;
  }
  /** Clear the record at index i (borg_delete_take). */
  delete(i) {
    if (i >= 1 && i < this.list.length) this.list[i] = makeBorgTake();
  }
  /** Reset the whole list on level change. */
  wipe() {
    this.list.length = 1;
    this.list[0] = makeBorgTake();
    this.count = 1;
    this.next = 1;
  }
  /** Iterate live records with their indices. */
  *entries() {
    for (let i = 1; i < this.count; i++) {
      const t = this.list[i];
      if (t.kIdx !== 0) yield [i, t];
    }
  }
};

// src/world/panel.ts
var PANEL_WID = 66;
var PANEL_HGT = 22;
var PANEL_COLS = Math.floor(AUTO_MAX_X / PANEL_WID) + 1;
var PANEL_ROWS = Math.floor(AUTO_MAX_Y / PANEL_HGT) + 1;
function panelCol(x) {
  return Math.floor(x / PANEL_WID);
}
function panelRow(y) {
  return Math.floor(y / PANEL_HGT);
}
var DETECT_KINDS = [
  "wall",
  "trap",
  "door",
  "evil",
  "obj"
];
function makeGrid() {
  const rows = [];
  for (let y = 0; y < PANEL_ROWS; y++) {
    rows.push(new Array(PANEL_COLS).fill(false));
  }
  return rows;
}
var BorgDetectGrid = class {
  grids = {
    wall: makeGrid(),
    trap: makeGrid(),
    door: makeGrid(),
    evil: makeGrid(),
    obj: makeGrid()
  };
  /** True once (qy, qx) has been swept for `kind`. Out-of-range reads as swept. */
  isDetected(kind, qy, qx) {
    const row = this.grids[kind][qy];
    if (!row) return true;
    return row[qx] ?? true;
  }
  /**
   * do_trap / do_door / do_wall / do_evil / do_obj (borg-light.c:280-352): true
   * if ANY cell of the 2x2 panel-index block starting at (qy, qx) is still
   * unswept for `kind`.
   */
  quadrantNeedsDetect(kind, qy, qx) {
    return !this.isDetected(kind, qy + 0, qx + 0) || !this.isDetected(kind, qy + 0, qx + 1) || !this.isDetected(kind, qy + 1, qx + 0) || !this.isDetected(kind, qy + 1, qx + 1);
  }
  /**
   * borg_handle_self's per-kind marking (borg-update.c:1359-1458): mark the
   * whole 2x2 panel-index block swept for `kind`.
   */
  markQuadrant(kind, qy, qx) {
    this.setIfInBounds(kind, qy + 0, qx + 0);
    this.setIfInBounds(kind, qy + 0, qx + 1);
    this.setIfInBounds(kind, qy + 1, qx + 0);
    this.setIfInBounds(kind, qy + 1, qx + 1);
  }
  setIfInBounds(kind, qy, qx) {
    const row = this.grids[kind][qy];
    if (row && qx >= 0 && qx < row.length) row[qx] = true;
  }
  /**
   * The new-level "panel" reset (borg-update.c:2094-2104). Faithfully leaves
   * "obj" unwiped - see the module header's WART note.
   */
  wipe() {
    for (const kind of DETECT_KINDS) {
      if (kind === "obj") continue;
      for (const row of this.grids[kind]) row.fill(false);
    }
  }
};

// src/world/model.ts
var GOAL_KILL = 1;
var GOAL_TAKE = 2;
var GOAL_MISC = 3;
var GOAL_DARK = 4;
var GOAL_XTRA = 5;
var GOAL_BORE = 6;
var GOAL_FLEE = 7;
var GOAL_VAULT = 8;
var GOAL_RECOVER = 9;
var GOAL_DIGGING = 10;
function makeGoals() {
  return {
    type: 0,
    g: { x: 0, y: 0 },
    rising: false,
    leaving: false,
    fleeing: false,
    fleeingLunal: false,
    fleeingMunchkin: false,
    fleeingToTown: false,
    ignoring: false,
    less: false,
    waiting: false,
    recalling: 0,
    descending: 0,
    shop: 0,
    ware: 0,
    item: 0,
    doBest: false
  };
}
function makeTemp() {
  return {
    needSeeInvis: 0,
    seeInv: 0,
    resFire: false,
    resCold: false,
    resAcid: false,
    resElec: false,
    resPois: false,
    protFromEvil: false,
    fast: false,
    bless: false,
    hero: false,
    berserk: false,
    fastcast: false,
    regen: false,
    smiteEvil: false,
    venom: false,
    shield: false
  };
}
function makeBorgSelf() {
  return {
    trait: [],
    has: [],
    activation: [],
    power: 0,
    c: { x: 0, y: 0 },
    oldchp: 0,
    lunalMode: false,
    munchkinMode: false,
    stairLess: false,
    stairMore: false,
    inShop: false,
    readyMorgoth: -1,
    temp: makeTemp(),
    goal: makeGoals(),
    needShiftPanel: false,
    whenShiftPanel: 0,
    timeThisPanel: 0,
    gameRatio: 1e3,
    noRetreat: 0,
    resistance: 0,
    whenCallLight: 0,
    whenWizardLight: 0,
    whenDetectTraps: 0,
    whenDetectDoors: 0,
    whenDetectWalls: 0,
    whenDetectEvil: 0,
    whenDetectObj: 0,
    whenLastKillMult: 0,
    noRestPrep: 0,
    timesTwitch: 0,
    escapes: 0
  };
}
function makeLevelFacts() {
  return {
    uniqueOnLevel: 0,
    scaryGuyOnLevel: false,
    morgothOnLevel: false,
    breederLevel: false,
    vaultOnLevel: false,
    depth: 0
  };
}
var BorgWorld = class {
  map = new BorgMap();
  kills = new BorgKills();
  takes = new BorgTakes();
  /** borg_detect_wall/trap/door/evil/obj (borg-update.c:82-86). See world/panel.ts. */
  detect = new BorgDetectGrid();
  self = makeBorgSelf();
  facts = makeLevelFacts();
  /**
   * borg_t: the Borg's own clock, incremented per decision. The anti-loop
   * heuristics (boredom, twitch, monster expiry) are gated on this, so it must
   * advance exactly once per think (see controller.ts).
   */
  clock = 0;
  /** True once at least one perception has populated the model. */
  seeded = false;
  /**
   * Reset everything for a new level (borg_init_cave + the new-level branch of
   * borg_update, borg-update.c:2050-2180). `depth` is the depth just ARRIVED at,
   * because three of the resets ask about it.
   *
   * NOT a blanket `makeGoals()`. Two intents are journeys across several levels
   * and upstream keeps them: `rising` (climbing back to town) survives every
   * level change except arriving IN town, and `fleeingToTown` survives depth 1,
   * which is the one depth from which the next step is the town. Wiping both on
   * arrival restarted the journey on every staircase.
   *
   * `stairLess` / `stairMore` are the other half, and leaving them set was a
   * hang: arriving in town with `stairMore` still true made the borg walk
   * straight back down, and arriving on level 1 with `stairLess` still true made
   * it climb straight back up - a town/level-1 shuttle that never played a turn.
   */
  wipeLevel(depth) {
    this.map.wipe();
    this.kills.wipe();
    this.takes.wipe();
    this.facts = makeLevelFacts();
    const g = this.self.goal;
    const rising = g.rising;
    const fleeingToTown = g.fleeingToTown;
    this.self.goal = makeGoals();
    this.self.goal.rising = depth === 0 ? false : rising;
    this.self.goal.fleeingToTown = depth === 0 || depth >= 2 ? false : fleeingToTown;
    this.self.stairLess = false;
    this.self.stairMore = false;
    this.self.timeThisPanel = 1;
    this.self.timesTwitch = 0;
    this.self.escapes = 0;
    this.self.whenCallLight = 0;
    this.self.whenWizardLight = 0;
    this.self.whenDetectTraps = 0;
    this.self.whenDetectDoors = 0;
    this.self.whenDetectWalls = 0;
    this.self.whenDetectEvil = 0;
    this.self.whenDetectObj = 0;
    this.detect.wipe();
  }
};

// src/rng.ts
var Rng = class {
  value;
  constructor(seed) {
    this.value = seed >>> 0;
  }
  reseed(seed) {
    this.value = seed >>> 0;
  }
  randint0(m) {
    if (m > 268435456) throw new RangeError(`Rand_div: m must be <= 0x10000000, got ${m}`);
    if (m <= 1) return 0;
    const n = Math.trunc(268435456 / m);
    for (; ; ) {
      this.value = Math.imul(this.value, 1103515245) + 12345 >>> 0;
      const r = Math.trunc((this.value >>> 4 & 268435455) / n);
      if (r < m) return r;
    }
  }
  randint1(m) {
    return this.randint0(m) + 1;
  }
  randSpread(a, d) {
    return a + this.randint0(1 + d + d) - d;
  }
};
var BORG_LOCAL_SEED = 12648430;
function makeBorgRng(seed = BORG_LOCAL_SEED) {
  return new Rng(seed >>> 0);
}

// src/trait/trait-index.ts
var BI_MAX = 265 /* MAX */;
var CLASS_WARRIOR = 0;
var CLASS_MAGE = 1;
var CLASS_DRUID = 2;
var CLASS_PRIEST = 3;
var CLASS_NECROMANCER = 4;
var CLASS_PALADIN = 5;
var CLASS_ROGUE = 6;
var CLASS_RANGER = 7;
var CLASS_BLACKGUARD = 8;
var STAT_STR = 0;
var STAT_INT = 1;
var STAT_WIS = 2;
var STAT_DEX = 3;
var STAT_CON = 4;
var STAT_MAX = 5;
var BORG_INVEN = 1;
var BORG_EQUIP = 2;
var BORG_QUILL = 4;
function classIndexFromName(name) {
  switch (name.toLowerCase()) {
    case "warrior":
      return CLASS_WARRIOR;
    case "mage":
      return CLASS_MAGE;
    case "druid":
      return CLASS_DRUID;
    case "priest":
      return CLASS_PRIEST;
    case "necromancer":
      return CLASS_NECROMANCER;
    case "paladin":
      return CLASS_PALADIN;
    case "rogue":
      return CLASS_ROGUE;
    case "ranger":
      return CLASS_RANGER;
    case "blackguard":
      return CLASS_BLACKGUARD;
    default:
      return CLASS_WARRIOR;
  }
}
function spellStatForClass(cls) {
  switch (cls) {
    case CLASS_MAGE:
      return STAT_INT;
    /* arcane */
    case CLASS_ROGUE:
      return STAT_INT;
    /* arcane */
    case CLASS_NECROMANCER:
      return STAT_INT;
    /* shadow */
    case CLASS_BLACKGUARD:
      return STAT_INT;
    /* shadow */
    case CLASS_PRIEST:
      return STAT_WIS;
    /* divine */
    case CLASS_PALADIN:
      return STAT_WIS;
    /* divine */
    case CLASS_DRUID:
      return STAT_WIS;
    /* nature */
    case CLASS_RANGER:
      return STAT_WIS;
    /* nature */
    default:
      return -1;
  }
}

// src/core-api.ts
var FEAT;
var TV;
var RSF;
var MON_RACE_FLAG_ENTRIES;
var MON_SPELL_ENTRIES;
var REST_COMPLETE;
var bound = false;
function bindCore(core) {
  FEAT = core.FEAT;
  TV = core.TV;
  RSF = core.RSF;
  MON_RACE_FLAG_ENTRIES = core.MON_RACE_FLAG_ENTRIES;
  MON_SPELL_ENTRIES = core.MON_SPELL_ENTRIES;
  REST_COMPLETE = core.REST_COMPLETE;
  bound = true;
}
function coreIsBound() {
  return bound;
}
function racesByIndex(races) {
  const byRidx = /* @__PURE__ */ new Map();
  for (const r of races) byRidx.set(r.ridx, r);
  return byRidx;
}
function raceRecord(race) {
  return {
    ridx: race.ridx,
    flags: raceFlagNames(race),
    level: race.level,
    sleep: race.sleep,
    spellPower: race.spellPower,
    freqInnate: race.freqInnate,
    freqSpell: race.freqSpell,
    hasFriends: race.friends.length > 0 || race.friendsBase.length > 0,
    blows: raceBlows(race),
    spells: raceSpellOrdinals(race)
  };
}
function raceFlagNames(race) {
  const out = /* @__PURE__ */ new Set();
  for (const f of race.flags) {
    const entry = MON_RACE_FLAG_ENTRIES[f];
    if (entry) out.add(entry.name);
  }
  return out;
}
function raceSpellOrdinals(race) {
  const out = [];
  for (const f of race.spellFlags) {
    if (MON_SPELL_ENTRIES[f]) out.push(f);
  }
  out.sort((a, b) => a - b);
  return out;
}
function raceBlows(race) {
  return race.blows.map((b) => {
    const rv = b.dice ? b.dice.randomValue() : null;
    return {
      dice: rv ? rv.dice : 0,
      sides: rv ? rv.sides : 0,
      effect: b.effect.name
    };
  });
}
function artifactActivation(objects, name) {
  return objects.findArtifact(name)?.activation ?? null;
}
function egoActivation(objects, name) {
  return objects.findEgo(name)?.activation ?? null;
}
function kindActivation(objects, tval, sval) {
  return objects.lookupKind(tval, sval)?.activation ?? null;
}
function kindPrice(objects, state, tval, sval) {
  const kind = objects.lookupKind(tval, sval);
  if (!kind) return null;
  return { cost: kind.cost ?? 0, aware: kind.aware ?? state?.isAware?.(kind) ?? false };
}
function shopnumHere(state) {
  return state.chunk.feature(state.actor.grid).shopnum;
}
function rememberedCell(cell) {
  if (!cell) return cell;
  const host = cell;
  if (host.knownFeat === void 0) return cell;
  const known = host.knownFeat >= 0;
  return {
    ...cell,
    feat: known ? host.knownFeat : 0,
    passable: known && host.knownPassable === true,
    glow: cell.inView && cell.glow
  };
}
function borgView(host) {
  const view = {
    // view: vitals, stats, status, depth and grid. API 2: view.player(). Speed, to-hit and AC here come
    // from the live derive, so a worn rune the player has not learned still moves them. KnownPlayer
    // shows the known values.
    player: () => host.player(),
    // view: the level's width and height. API 2: KnownLevel width/height.
    mapBounds: () => host.mapBounds(),
    // view: the pack, each item from its known twin. API 2: view.world().inventory.
    inventory: () => host.inventory(),
    // view: worn gear by slot, each item from its known twin. API 2: view.world().equipment.
    equipment: () => host.equipment(),
    // view: objects remembered exactly on a grid, from their known twins. API 2: KnownLevel cell objects.
    // The list is the live pile filtered by memory, so an object taken since it was seen drops out.
    floorItems: (x, y) => host.floorItems(x, y),
    // view: messages since the previous decision. API 2: the `message` event.
    messages: () => host.messages(),
    // view: the live stock of every town store, readable even from the dungeon. API 2
    // view.world().stores hands over the same data, which keeps this a view read. Upstream's borg only
    // knew the stock it saw on its last visit.
    stores: () => host.stores(),
    // view: the class's books and spells, with fail rates. API 2: view.world().spellbooks.
    spellbooks: () => host.spellbooks(),
    // view: the bound game constants (z_info). API 2: no call; a content lookup or a meta field.
    constants: () => host.constants(),
    // truth: perceived monsters only, with exact hp/maxHp, current speed, sleep/fear/confusion/stun
    // timers, and every race flag and spell, learned or not. API 2: truth.monsters(), which also lists
    // unseen monsters and has no "perceived" flag to filter them by.
    monsters: () => host.monsters(),
    // truth: one grid. feat and passable give the live terrain rather than the remembered one, so a
    // secret door reads as FEAT_SECRET where the player sees granite, and a door that changed out of
    // sight shows its new state. glow is live too. known, inView, monster, objectCount and trap follow
    // what the player sees. API 2: truth.level().
    cell: (x, y) => rememberedCell(host.cell(x, y))
  };
  const simulate = host.simulateLoadout;
  if (simulate) {
    view.simulateLoadout = (change) => simulate.call(host, change);
  }
  return view;
}
function borgActions(host) {
  return {
    move: (...a) => host.move(...a),
    melee: (...a) => host.melee(...a),
    hold: (...a) => host.hold(...a),
    rest: (...a) => host.rest(...a),
    descend: (...a) => host.descend(...a),
    ascend: (...a) => host.ascend(...a),
    tunnel: (...a) => host.tunnel(...a),
    open: (...a) => host.open(...a),
    close: (...a) => host.close(...a),
    disarm: (...a) => host.disarm(...a),
    quaff: (...a) => host.quaff(...a),
    read: (...a) => host.read(...a),
    eat: (...a) => host.eat(...a),
    wear: (...a) => host.wear(...a),
    takeoff: (...a) => host.takeoff(...a),
    drop: (...a) => host.drop(...a),
    pickup: (...a) => host.pickup(...a),
    aimWand: (...a) => host.aimWand(...a),
    zapRod: (...a) => host.zapRod(...a),
    useStaff: (...a) => host.useStaff(...a),
    activate: (...a) => host.activate(...a),
    fire: (...a) => host.fire(...a),
    throw: (...a) => host.throw(...a),
    cast: (...a) => host.cast(...a),
    // Sets the game's target at once, outside any command. API 2: act.submit(token, { kind: "target", midx }).
    setTargetMonster: (...a) => host.setTargetMonster(...a),
    // Sets the game's target at once, outside any command. API 2: act.submit(token, { kind: "target", x, y }).
    setTargetLocation: (...a) => host.setTargetLocation(...a),
    shopBuy: (...a) => host.shopBuy(...a),
    shopSell: (...a) => host.shopSell(...a),
    shopExit: (...a) => host.shopExit(...a),
    raw: (...a) => host.raw(...a)
  };
}
function hostController(decide) {
  return (view, act) => decide(borgView(view), borgActions(act));
}

// src/trait/tables.ts
var BORG_ADJ_MAG_MANA = [
  0,
  10,
  20,
  30,
  40,
  50,
  60,
  70,
  80,
  90,
  100,
  110,
  120,
  130,
  140,
  150,
  160,
  170,
  180,
  190,
  200,
  225,
  250,
  300,
  350,
  400,
  450,
  500,
  550,
  600,
  650,
  700,
  750,
  800,
  800,
  800,
  800,
  800
];
var BORG_ADJ_DEX_TA = [
  -4,
  -3,
  -2,
  -1,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  15,
  15
];
var BORG_ADJ_STR_TD = [
  -2,
  -2,
  -1,
  -1,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  3,
  4,
  5,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  18,
  20
];
var BORG_ADJ_DEX_TH = [
  -3,
  -2,
  -2,
  -1,
  -1,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  2,
  3,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  6,
  7,
  8,
  9,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  15,
  15
];
var BORG_ADJ_STR_TH = [
  -3,
  -2,
  -1,
  -1,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  15,
  15
];
var BORG_ADJ_STR_DIG = [
  0,
  0,
  1,
  2,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  10,
  12,
  15,
  20,
  25,
  30,
  35,
  40,
  45,
  50,
  55,
  60,
  65,
  70,
  75,
  80,
  85,
  90,
  95,
  100,
  100,
  100
];
var BORG_ADJ_STR_WGT = [
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
  19,
  20,
  22,
  24,
  26,
  28,
  30,
  30,
  30,
  30,
  30,
  30,
  30,
  30,
  30,
  30,
  30,
  30,
  30,
  30,
  30,
  30,
  30,
  30
];
var BORG_ADJ_MAG_FAIL = [
  99,
  99,
  99,
  99,
  99,
  50,
  30,
  20,
  15,
  12,
  11,
  10,
  9,
  8,
  7,
  6,
  6,
  5,
  5,
  5,
  4,
  4,
  4,
  4,
  3,
  3,
  2,
  2,
  2,
  2,
  1,
  1,
  1,
  1,
  1,
  0,
  0,
  0
];
var BORG_ADJ_MAG_STAT = [
  -5,
  -4,
  -3,
  -3,
  -2,
  -1,
  0,
  0,
  0,
  0,
  0,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  15,
  18,
  21,
  24,
  27,
  30,
  33,
  36,
  39,
  42,
  45,
  48,
  51,
  54,
  57
];
var ADJ_STR_HOLD = [
  4,
  5,
  6,
  7,
  8,
  10,
  12,
  14,
  16,
  18,
  20,
  22,
  24,
  26,
  28,
  30,
  30,
  35,
  40,
  45,
  50,
  55,
  60,
  65,
  70,
  80,
  80,
  80,
  80,
  80,
  90,
  90,
  90,
  90,
  90,
  100,
  100,
  100
];
var PY_FOOD_WEAK = 800;
var PY_FOOD_HUNGRY = 1500;
var PY_FOOD_FULL = 9e3;
var PY_FOOD_MAX = 1e4;
var BORG_DIG = 10;
function modifyStatValue(value, amount) {
  let v = value;
  if (amount > 0) {
    for (let i = 0; i < amount; i++) {
      if (v < 18) v++;
      else v += 10;
    }
  } else if (amount < 0) {
    for (let i = 0; i < -amount; i++) {
      if (v >= 18 + 10) v -= 10;
      else if (v > 18) v = 18;
      else if (v > 3) v--;
    }
  }
  return v;
}
function statToIndex(use) {
  let ind;
  if (use <= 18) ind = use - 3;
  else if (use <= 18 + 219) ind = 15 + Math.trunc((use - 18) / 10);
  else ind = 37;
  return ind > 37 ? 37 : ind;
}

// src/flow/flow-consts.ts
var AUTO_FLOW_MAX = 1536;
var AUTO_TEMP_MAX = 9e3;
var BORG_DIG_MOD = 20;
var BORG_DIG_HARD = 40;
function trait(world, bi) {
  return world.self.trait[bi] ?? 0;
}
var ddx = [0, -1, 0, 1, -1, 0, 1, -1, 0, 1];
var ddy = [0, 1, 1, 1, 0, 0, 0, -1, -1, -1];
var ddx_ddd = [0, 0, 1, -1, 1, -1, 1, -1, 0];
var ddy_ddd = [1, -1, 0, 0, 1, 1, -1, -1, 0];
var ddd = [2, 8, 6, 4, 3, 1, 9, 7, 5];
function borgCaveFloorGrid(ag) {
  return ag.feat === FEAT.NONE || ag.feat === FEAT.FLOOR || ag.feat === FEAT.OPEN || ag.feat === FEAT.MORE || ag.feat === FEAT.LESS || ag.feat === FEAT.BROKEN || ag.feat === FEAT.PASS_RUBBLE || ag.feat === FEAT.LAVA;
}
function borgCaveFloorBold(world, y, x) {
  if (!inBoundsFully(x, y)) return false;
  const ag = world.map.at(x, y);
  return ag.feat === FEAT.FLOOR || ag.trap || ag.feat === FEAT.LESS || ag.feat === FEAT.MORE || ag.feat === FEAT.BROKEN || ag.feat === FEAT.OPEN;
}
function featIsShop(feat) {
  return feat >= FEAT.STORE_GENERAL && feat <= FEAT.HOME;
}
function featIsTrapHolding(feat) {
  return feat === FEAT.FLOOR;
}
function inBoundsFully(x, y) {
  return x >= 1 && x < AUTO_MAX_X - 1 && y >= 1 && y < AUTO_MAX_Y - 1;
}
function borgExtractDir(y1, x1, y2, x2) {
  if (y1 === y2 && x1 === x2) return 5;
  if (x1 === x2) return y1 < y2 ? 2 : 8;
  if (y1 === y2) return x1 < x2 ? 6 : 4;
  if (y1 < y2) return x1 < x2 ? 3 : 1;
  if (y1 > y2) return x1 < x2 ? 9 : 7;
  return 5;
}
function borgGotoDir(world, y1, x1, y2, x2) {
  const ay = y2 > y1 ? y2 - y1 : y1 - y2;
  const ax = x2 > x1 ? x2 - x1 : x1 - x2;
  const e = borgExtractDir(y1, x1, y2, x2);
  if (ax <= 1 && ay <= 1) return e;
  let d;
  if (ay > ax) {
    d = y1 < y2 ? 2 : 8;
    if (borgCaveFloorBold(world, y1 + ddy[d], x1 + ddx[d])) return d;
  }
  if (ay < ax) {
    d = x1 < x2 ? 6 : 4;
    if (borgCaveFloorBold(world, y1 + ddy[d], x1 + ddx[d])) return d;
  }
  d = borgExtractDir(y1, x1, y2, x2);
  if (borgCaveFloorBold(world, y1 + ddy[d], x1 + ddx[d])) return d;
  if (ay <= ax) {
    d = y1 < y2 ? 2 : 8;
    if (borgCaveFloorBold(world, y1 + ddy[d], x1 + ddx[d])) return d;
  }
  if (ay >= ax) {
    d = x1 < x2 ? 6 : 4;
    if (borgCaveFloorBold(world, y1 + ddy[d], x1 + ddx[d])) return d;
  }
  if (!ay) {
    d = x1 < x2 ? 3 : 1;
    if (borgCaveFloorBold(world, y1 + ddy[d], x1 + ddx[d])) return d;
    d = x1 < x2 ? 9 : 7;
    if (borgCaveFloorBold(world, y1 + ddy[d], x1 + ddx[d])) return d;
  }
  if (!ax) {
    d = y1 < y2 ? 3 : 9;
    if (borgCaveFloorBold(world, y1 + ddy[d], x1 + ddx[d])) return d;
    d = y1 < y2 ? 1 : 7;
    if (borgCaveFloorBold(world, y1 + ddy[d], x1 + ddx[d])) return d;
  }
  return e;
}

// src/danger/tables.ts
var EXTRACT_ENERGY = [
  /* Slow */
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  /* Slow */
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  /* Slow */
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  /* Slow */
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  /* Slow */
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  /* Slow */
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  /* S-50 */
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  /* S-40 */
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  /* S-30 */
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  /* S-20 */
  3,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  4,
  /* S-10 */
  5,
  5,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  9,
  /* Norm */
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
  19,
  /* F+10 */
  20,
  21,
  22,
  23,
  24,
  25,
  26,
  27,
  28,
  29,
  /* F+20 */
  30,
  31,
  32,
  33,
  34,
  35,
  36,
  36,
  37,
  37,
  /* F+30 */
  38,
  38,
  39,
  39,
  40,
  40,
  40,
  41,
  41,
  41,
  /* F+40 */
  42,
  42,
  42,
  43,
  43,
  43,
  44,
  44,
  44,
  44,
  /* F+50 */
  45,
  45,
  45,
  45,
  45,
  46,
  46,
  46,
  46,
  46,
  /* F+60 */
  47,
  47,
  47,
  47,
  47,
  48,
  48,
  48,
  48,
  48,
  /* F+70 */
  49,
  49,
  49,
  49,
  49,
  49,
  49,
  49,
  49,
  49,
  /* Fast */
  49,
  49,
  49,
  49,
  49,
  49,
  49,
  49,
  49,
  49
];
function extractEnergy(speed) {
  const s = speed < 0 ? 0 : speed > 199 ? 199 : speed;
  return EXTRACT_ENERGY[s];
}
var ADJ_DEX_SAFE = [
  0,
  1,
  2,
  3,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  15,
  15,
  20,
  25,
  30,
  35,
  40,
  45,
  50,
  60,
  70,
  80,
  90,
  100,
  100,
  100,
  100,
  100,
  100,
  100,
  100
];
function adjDexSafe(dexIndex) {
  const i = dexIndex < 0 ? 0 : dexIndex >= ADJ_DEX_SAFE.length ? ADJ_DEX_SAFE.length - 1 : dexIndex;
  return ADJ_DEX_SAFE[i];
}
var BLOW_EFFECT_BY_NAME = {
  NONE: 0 /* NONE */,
  HURT: 1 /* HURT */,
  POISON: 2 /* POISON */,
  DISENCHANT: 3 /* DISENCHANT */,
  DRAIN_CHARGES: 4 /* DRAIN_CHARGES */,
  EAT_GOLD: 5 /* EAT_GOLD */,
  EAT_ITEM: 6 /* EAT_ITEM */,
  EAT_FOOD: 7 /* EAT_FOOD */,
  EAT_LIGHT: 8 /* EAT_LIGHT */,
  ACID: 9 /* ACID */,
  ELEC: 10 /* ELEC */,
  FIRE: 11 /* FIRE */,
  COLD: 12 /* COLD */,
  BLIND: 13 /* BLIND */,
  CONFUSE: 14 /* CONFUSE */,
  TERRIFY: 15 /* TERRIFY */,
  PARALYZE: 16 /* PARALYZE */,
  LOSE_STR: 17 /* LOSE_STR */,
  LOSE_INT: 18 /* LOSE_INT */,
  LOSE_WIS: 19 /* LOSE_WIS */,
  LOSE_DEX: 20 /* LOSE_DEX */,
  LOSE_CON: 21 /* LOSE_CON */,
  LOSE_ALL: 22 /* LOSE_ALL */,
  SHATTER: 23 /* SHATTER */,
  EXP_10: 24 /* EXP_10 */,
  EXP_20: 25 /* EXP_20 */,
  EXP_40: 26 /* EXP_40 */,
  EXP_80: 27 /* EXP_80 */,
  HALLU: 28 /* HALLU */,
  BLACK_BREATH: 29 /* BLACK_BREATH */
};
function borgMonBlowEffect(name) {
  return BLOW_EFFECT_BY_NAME[name] ?? 0 /* NONE */;
}

// src/danger/geometry.ts
function trait2(world, bi) {
  return world.self.trait[bi] ?? 0;
}
var ddx_ddd2 = [0, 0, 1, -1, 1, -1, 1, -1, 0];
var ddy_ddd2 = [1, -1, 0, 0, 1, 1, -1, -1, 0];
function distance(y1, x1, y2, x2) {
  const ay = Math.abs(y2 - y1);
  const ax = Math.abs(x2 - x1);
  return ay > ax ? ay + (ax >> 1) : ax + (ay >> 1);
}
function borgDistance(y, x, y2, x2) {
  return distance(y, x, y2, x2);
}
function squareInBounds(x, y) {
  return x >= 0 && x < AUTO_MAX_X && y >= 0 && y < AUTO_MAX_Y;
}
function squareInBoundsFully(x, y) {
  return x >= 1 && x < AUTO_MAX_X - 1 && y >= 1 && y < AUTO_MAX_Y - 1;
}
function borgCaveFloorBold2(world, y, x) {
  if (!squareInBoundsFully(x, y)) return false;
  const g = world.map.at(x, y);
  return g.feat === FEAT.FLOOR || g.trap || g.feat === FEAT.LESS || g.feat === FEAT.MORE || g.feat === FEAT.BROKEN || g.feat === FEAT.OPEN;
}
function borgCaveFloorGrid2(ag) {
  return ag.feat === FEAT.NONE || ag.feat === FEAT.FLOOR || ag.feat === FEAT.OPEN || ag.feat === FEAT.MORE || ag.feat === FEAT.LESS || ag.feat === FEAT.BROKEN || ag.feat === FEAT.PASS_RUBBLE || ag.feat === FEAT.LAVA;
}
function borgFeatureProtected(ag) {
  return ag.glyph || ag.kill !== 0 || ag.feat >= FEAT.CLOSED && ag.feat <= FEAT.PERM;
}
function borgLos(world, y1, x1, y2, x2) {
  const dy = y2 - y1;
  const dx = x2 - x1;
  const ay = Math.abs(dy);
  const ax = Math.abs(dx);
  if (ax < 2 && ay < 2) return true;
  if (!squareInBoundsFully(x1, y1)) return false;
  if (!dx) {
    if (dy > 0) {
      for (let ty2 = y1 + 1; ty2 < y2; ty2++) {
        if (!borgCaveFloorBold2(world, ty2, x1)) return false;
      }
    } else {
      for (let ty2 = y1 - 1; ty2 > y2; ty2--) {
        if (!borgCaveFloorBold2(world, ty2, x1)) return false;
      }
    }
    return true;
  }
  if (!dy) {
    if (dx > 0) {
      for (let tx2 = x1 + 1; tx2 < x2; tx2++) {
        if (!borgCaveFloorBold2(world, y1, tx2)) return false;
      }
    } else {
      for (let tx2 = x1 - 1; tx2 > x2; tx2--) {
        if (!borgCaveFloorBold2(world, y1, tx2)) return false;
      }
    }
    return true;
  }
  const sx = dx < 0 ? -1 : 1;
  const sy = dy < 0 ? -1 : 1;
  if (ax === 1) {
    if (ay === 2) {
      if (borgCaveFloorBold2(world, y1 + sy, x1)) return true;
    }
  } else if (ay === 1) {
    if (ax === 2) {
      if (borgCaveFloorBold2(world, y1, x1 + sx)) return true;
    }
  }
  const f2 = ax * ay;
  const f1 = f2 << 1;
  let tx;
  let ty;
  if (ax >= ay) {
    let qy = ay * ay;
    const m = qy << 1;
    tx = x1 + sx;
    if (qy === f2) {
      ty = y1 + sy;
      qy -= f1;
    } else {
      ty = y1;
    }
    while (x2 - tx) {
      if (!borgCaveFloorBold2(world, ty, tx)) return false;
      qy += m;
      if (qy < f2) {
        tx += sx;
      } else if (qy > f2) {
        ty += sy;
        if (!borgCaveFloorBold2(world, ty, tx)) return false;
        qy -= f1;
        tx += sx;
      } else {
        ty += sy;
        qy -= f1;
        tx += sx;
      }
    }
  } else {
    let qx = ax * ax;
    const m = qx << 1;
    ty = y1 + sy;
    if (qx === f2) {
      tx = x1 + sx;
      qx -= f1;
    } else {
      tx = x1;
    }
    while (y2 - ty) {
      if (!borgCaveFloorBold2(world, ty, tx)) return false;
      qx += m;
      if (qx < f2) {
        ty += sy;
      } else if (qx > f2) {
        tx += sx;
        if (!borgCaveFloorBold2(world, ty, tx)) return false;
        qx -= f1;
        ty += sy;
      } else {
        tx += sx;
        qx -= f1;
        ty += sy;
      }
    }
  }
  return true;
}
function borgIncMotion(py, px, y1, x1, y2, x2) {
  let dy;
  let dx;
  let sy;
  let sx;
  if (y2 < y1) {
    dy = y1 - y2;
    sy = -1;
  } else {
    dy = y2 - y1;
    sy = 1;
  }
  if (x2 < x1) {
    dx = x1 - x2;
    sx = -1;
  } else {
    dx = x2 - x1;
    sx = 1;
  }
  if (!dy && !dx) return [py, px];
  const half = dy * dx;
  const full = half << 1;
  if (px === x1 && py === y1) {
    if (dy > dx) {
      return [py + sy, px];
    } else if (dx > dy) {
      return [py, px + sx];
    } else {
      return [py + sy, px + sx];
    }
  }
  let frac;
  let m;
  let y;
  let x;
  let k;
  if (dy > dx) {
    k = dy;
    frac = dx * dx;
    m = frac << 1;
    y = y1 + sy;
    x = x1;
    for (; ; ) {
      if (x === px && y === py) k = 1;
      if (m) {
        frac += m;
        if (frac >= half) {
          x += sx;
          frac -= full;
        }
      }
      y += sy;
      k--;
      if (!k) return [y, x];
    }
  } else if (dx > dy) {
    frac = dy * dy;
    m = frac << 1;
    y = y1;
    x = x1 + sx;
    k = dx;
    for (; ; ) {
      if (x === px && y === py) k = 1;
      if (m) {
        frac += m;
        if (frac >= half) {
          y += sy;
          frac -= full;
        }
      }
      x += sx;
      k--;
      if (!k) return [y, x];
    }
  } else {
    k = dy;
    y = y1 + sy;
    x = x1 + sx;
    for (; ; ) {
      if (x === px && y === py) k = 1;
      y += sy;
      x += sx;
      k--;
      if (!k) return [y, x];
    }
  }
}
function borgProjectable(world, g, maxRange3, y1, x1, y2, x2) {
  let y = y1;
  let x = x1;
  const curhp = trait2(world, 27 /* CURHP */);
  const maxhp = trait2(world, 28 /* MAXHP */);
  const scary = world.facts.scaryGuyOnLevel;
  const cy = world.self.c.y;
  const cx = world.self.c.x;
  for (let dist4 = 0; dist4 <= maxRange3; dist4++) {
    if (!squareInBounds(x, y)) return false;
    const ag = world.map.at(x, y);
    if (curhp < Math.trunc(maxhp / 3) || g.morgothPosition || scary) {
      if (dist4 > 20 && ag.feat === FEAT.NONE) break;
    } else if (curhp < Math.trunc(maxhp / 2)) {
      if (dist4 > 10 && ag.feat === FEAT.NONE) break;
    } else if (fearRegionAt(world, g, cy, cx) >= Math.trunc(g.avoidance / 20)) {
      if (dist4 > maxRange3 && ag.feat === FEAT.NONE) break;
    } else {
      if (dist4 > 2 && ag.feat === FEAT.NONE) break;
    }
    if (dist4 && !borgCaveFloorGrid2(ag)) break;
    if (x === x2 && y === y2) return true;
    [y, x] = borgIncMotion(y, x, y1, x1, y2, x2);
  }
  return false;
}
function borgProjectablePure(world, maxRange3, y1, x1, y2, x2) {
  let y = y1;
  let x = x1;
  for (let dist4 = 0; dist4 <= maxRange3; dist4++) {
    if (!squareInBounds(x, y)) return false;
    const ag = world.map.at(x, y);
    if (dist4 && ag.feat === FEAT.NONE) break;
    if (dist4 && !borgCaveFloorGrid2(ag)) break;
    if (x === x2 && y === y2) return true;
    if (ag.kill) break;
    [y, x] = borgIncMotion(y, x, y1, x1, y2, x2);
  }
  return false;
}
function fearRegionAt(world, g, y, x) {
  return g.fearRegion ? g.fearRegion.region(y, x) : 0;
}

// src/danger/facts.ts
function defaultResolveMonsterFacts(ctx, killIndex) {
  const kill = ctx.world.kills.at(killIndex);
  let mv;
  for (const m of ctx.view.monsters()) {
    if (m.id === kill.mIdx) {
      mv = m;
      break;
    }
  }
  const flags = new Set(mv ? mv.raceFlags : []);
  const level = mv ? mv.level : kill.level;
  const spells = deriveSpellList(mv ? mv.spellFlags : []);
  return {
    rIdx: kill.rIdx,
    flags,
    level,
    /* GAP: r_ptr->sleep not on MonsterView; 0 == "never asleep" default. */
    sleep: 0,
    /* GAP: r_ptr->spell_power not on MonsterView; upstream defaults it to level. */
    spellPower: level,
    /* GAP: freq not on MonsterView; 0 makes borg_danger_spell treat the monster
     * as "never casts" (v2 == 0). Inject a real resolver for spell danger. */
    freqInnate: 0,
    freqSpell: 0,
    /* GAP: r_ptr->friends not on MonsterView. */
    hasFriends: false,
    /* GAP: r_ptr->blow[] not on MonsterView; no blows -> physical danger 0.
     * Inject a real resolver for melee danger. */
    blows: [],
    spells
  };
}
function deriveSpellList(spellFlagNames) {
  const rsf2 = RSF;
  const out = [];
  for (const name of spellFlagNames) {
    const v = rsf2[name];
    if (typeof v === "number" && v > 0) out.push(v);
  }
  out.sort((a, b) => a - b);
  return out;
}

// src/danger/globals.ts
var BORG_SPELL = {
  RESTORATION: "RESTORATION",
  REVITALIZE: "REVITALIZE",
  UNHOLY_REPRIEVE: "UNHOLY_REPRIEVE",
  REMEMBRANCE: "REMEMBRANCE"
};
function createDangerGlobals() {
  return {
    attacking: false,
    fightingUnique: false,
    createDoor: false,
    onGlyph: false,
    trackGlyph: [],
    morgothPosition: false,
    asPosition: false,
    slowSpell: false,
    sleepSpell: false,
    sleepSpellIi: false,
    confuseSpell: false,
    crushSpell: false,
    fearMonSpell: false,
    tpOtherIndices: [],
    avoidance: 0,
    lightTimeout: 0,
    lightNoFuel: false,
    spellLegal: () => false,
    fearRegion: null,
    resolveFacts: defaultResolveMonsterFacts
  };
}

// src/danger/fear.ts
var FEAR_REGION_H = Math.trunc(AUTO_MAX_Y / 11) + 1;
var FEAR_REGION_W = Math.trunc(AUTO_MAX_X / 11) + 1;
var FearCaches = class _FearCaches {
  /** borg_fear_region[FEAR_REGION_H][FEAR_REGION_W]. */
  region2d;
  /** borg_fear_monsters[AUTO_MAX_Y+1][AUTO_MAX_X+1]. */
  monsters2d;
  constructor() {
    this.region2d = _FearCaches.makeGrid(FEAR_REGION_H, FEAR_REGION_W);
    this.monsters2d = _FearCaches.makeGrid(AUTO_MAX_Y + 1, AUTO_MAX_X + 1);
  }
  static makeGrid(h, w) {
    const g = new Array(h);
    for (let y = 0; y < h; y++) g[y] = new Array(w).fill(0);
    return g;
  }
  /** borg_fear_region[y/11][x/11]. */
  region(y, x) {
    const ry = Math.trunc(y / 11);
    const rx = Math.trunc(x / 11);
    if (ry < 0 || ry >= FEAR_REGION_H || rx < 0 || rx >= FEAR_REGION_W) return 0;
    return this.region2d[ry][rx];
  }
  /** borg_fear_monsters[y][x]. */
  monsters(y, x) {
    if (y < 0 || y > AUTO_MAX_Y || x < 0 || x > AUTO_MAX_X) return 0;
    return this.monsters2d[y][x];
  }
  /** Zero both caches (done each perceive pass before re-stamping). */
  wipe() {
    for (const row of this.region2d) row.fill(0);
    for (const row of this.monsters2d) row.fill(0);
  }
};
function isVault(_world, _y, _x) {
  return false;
}
function borgFearGrid(world, g, fear, y, x, k) {
  if (trait2(world, 105 /* CDEPTH */) === 0) return;
  if (g.morgothPosition || g.asPosition) return;
  if (isVault(world, y, x)) return;
  const ag = world.map.inBounds(x, y) ? world.map.at(x, y) : null;
  const killIdx = ag ? ag.kill : 0;
  const kill = killIdx ? world.kills.at(killIdx) : null;
  const ky = kill ? kill.pos.y : y;
  const kx = kill ? kill.pos.x : x;
  if (trait2(world, 35 /* CLEVEL */) === 50) k = Math.trunc(k * 5 / 10);
  const addMon = (yy, xx, val) => {
    const row = fear.monsters2d[yy];
    if (row) row[xx] = (row[xx] ?? 0) + val;
  };
  for (let x1 = -6; x1 <= 6; x1++) {
    for (let y1 = -6; y1 <= 6; y1++) {
      if (x + x1 <= 0 || x1 + x >= AUTO_MAX_X) continue;
      if (y + y1 <= 0 || y1 + y >= AUTO_MAX_Y) continue;
      if (borgLos(world, ky, kx, y + y1, x + x1))
        addMon(y + y1, x + x1, Math.trunc(k / 8));
      if (x1 <= -5 || x1 >= 5) continue;
      if (y1 <= -5 || y1 >= 5) continue;
      if (borgLos(world, ky, kx, y + y1, x + x1))
        addMon(y + y1, x + x1, Math.trunc(k / 5));
      if (x1 <= -3 || x1 >= 3) continue;
      if (y1 <= -3 || y1 >= 3) continue;
      if (borgLos(world, ky, kx, y + y1, x + x1))
        addMon(y + y1, x + x1, Math.trunc(k / 3));
      if (x1 <= -2 || x1 >= 2) continue;
      if (y1 <= -2 || y1 >= 2) continue;
      if (borgLos(world, ky, kx, y + y1, x + x1))
        addMon(y + y1, x + x1, Math.trunc(k / 2));
      if (x1 <= -1 || x1 >= 1) continue;
      if (y1 <= -1 || y1 >= 1) continue;
      if (borgLos(world, ky, kx, y + y1, x + x1)) addMon(y + y1, x + x1, k);
    }
  }
}
function borgFearRegional(world, fear, y, x, k, seenGuy) {
  if (isVault(world, y, x)) return;
  if (!seenGuy) {
    world.self.needShiftPanel = true;
  }
  const y0 = Math.trunc(y / 11);
  const x0 = Math.trunc(x / 11);
  const y1 = y0 > 0 ? y0 - 1 : 0;
  const x1 = x0 > 0 ? x0 - 1 : 0;
  const y2 = x0 < 5 ? x0 + 1 : 5;
  const x2 = x0 < 17 ? x0 + 1 : 17;
  const addReg = (ry, rx, val) => {
    const row = fear.region2d[ry];
    if (row) row[rx] = (row[rx] ?? 0) + val;
  };
  addReg(y0, x0, k);
  addReg(y0, x1, k);
  addReg(y0, x2, k);
  addReg(y1, x0, Math.trunc(k / 2));
  addReg(y2, x0, Math.trunc(k / 2));
  addReg(y1, x1, Math.trunc(k / 2));
  addReg(y1, x2, Math.trunc(k / 3));
  addReg(y2, x1, Math.trunc(k / 3));
  addReg(y2, x2, Math.trunc(k / 3));
}

// src/danger/state.ts
var STATES = /* @__PURE__ */ new WeakMap();
function getDangerState(world) {
  let st2 = STATES.get(world);
  if (!st2) {
    const globals = createDangerGlobals();
    const fear = new FearCaches();
    globals.fearRegion = fear;
    st2 = { globals, fear, maxRange: 20 };
    STATES.set(world, st2);
  }
  return st2;
}
function getDangerGlobals(world) {
  return getDangerState(world).globals;
}
function getFearCaches(world) {
  return getDangerState(world).fear;
}

// src/danger/danger.ts
function div(a, b) {
  return Math.trunc(a / b);
}
function hasFlag(facts, flag) {
  return facts.flags.has(flag);
}
function borgDangerPhysical(world, g, facts, fullDamage) {
  let n = 0;
  let pfe = 0;
  let ac = trait2(world, 133 /* ARMOR */);
  const temp = world.self.temp;
  if (temp.shield) ac += 50;
  if (temp.protFromEvil && hasFlag(facts, "EVIL") && trait2(world, 35 /* CLEVEL */) >= facts.level) {
    pfe = 1;
  }
  if (facts.rIdx === 0) return 1e3;
  const attacking = g.attacking;
  const clevel = trait2(world, 35 /* CLEVEL */);
  const spellStat = spellStatForClass(trait2(world, 25 /* CLASS */));
  for (let k = 0; k < facts.blows.length; k++) {
    const blow = facts.blows[k];
    const dDice = blow.dice;
    const dSide = blow.sides;
    let z = 0;
    let power = 0;
    switch (blow.effect) {
      case 1 /* HURT */:
        z = dDice * dSide;
        if (dSide < 3 && z > dDice * dSide) n += 200;
        if (dSide < 3 && dDice > 5) n += 400;
        power = 60;
        if (pfe && !attacking) z = div(z, 2);
        break;
      case 2 /* POISON */:
        z = dDice * dSide;
        power = 5;
        if (trait2(world, 73 /* RPOIS */)) break;
        if (temp.resPois) break;
        z += 10;
        if (pfe && !attacking) z = div(z, 2);
        break;
      case 3 /* DISENCHANT */:
        z = dDice * dSide;
        power = 20;
        if (trait2(world, 84 /* RDIS */)) break;
        z += 500;
        if (pfe && !attacking) z = div(z, 2);
        break;
      case 4 /* DRAIN_CHARGES */:
        z = dDice * dSide;
        z += 20;
        power = 15;
        if (pfe && !attacking) z = div(z, 2);
        break;
      case 5 /* EAT_GOLD */:
        z = dDice * dSide;
        if (clevel < 5) z += 50;
        power = 5;
        if (100 <= adjDexSafe(trait2(world, 18 /* DEX_INDEX */)) + clevel) break;
        if (trait2(world, 45 /* GOLD */) < 100) break;
        if (trait2(world, 45 /* GOLD */) > 1e5) break;
        z += 5;
        if (pfe && !attacking) z = div(z, 2);
        break;
      case 6 /* EAT_ITEM */:
        z = dDice * dSide;
        power = 5;
        if (100 <= adjDexSafe(trait2(world, 18 /* DEX_INDEX */)) + clevel) break;
        z += 5;
        if (pfe && !attacking) z = div(z, 2);
        break;
      case 7 /* EAT_FOOD */:
        z = dDice * dSide;
        power = 5;
        if (trait2(world, 39 /* FOOD */) > 5) break;
        z += 5;
        if (pfe && !attacking) z = div(z, 2);
        break;
      case 8 /* EAT_LIGHT */:
        z = dDice * dSide;
        power = 5;
        if (!g.lightTimeout || g.lightNoFuel) break;
        if (trait2(world, 213 /* AFUEL */) > 5) break;
        z += 5;
        if (pfe && !attacking) z = div(z, 2);
        break;
      case 9 /* ACID */:
        if (trait2(world, 65 /* IACID */)) break;
        z = dDice * dSide;
        if (trait2(world, 72 /* RACID */)) z = div(z + 2, 3);
        if (temp.resAcid) z = div(z + 2, 3);
        z += 200;
        if (pfe && !attacking) z = div(z, 2);
        break;
      case 10 /* ELEC */:
        if (trait2(world, 67 /* IELEC */)) break;
        z = dDice * dSide;
        power = 10;
        if (trait2(world, 71 /* RELEC */)) z = div(z + 2, 3);
        if (temp.resElec) z = div(z + 2, 3);
        z = z * 2;
        if (pfe && !attacking) z = div(z, 2);
        break;
      case 11 /* FIRE */:
        if (trait2(world, 64 /* IFIRE */)) break;
        z = dDice * dSide;
        power = 10;
        if (trait2(world, 69 /* RFIRE */)) z = div(z + 2, 3);
        if (temp.resFire) z = div(z + 2, 3);
        z = z * 2;
        if (pfe && !attacking) z = div(z, 2);
        break;
      case 12 /* COLD */:
        if (trait2(world, 66 /* ICOLD */)) break;
        z = dDice * dSide;
        power = 10;
        if (trait2(world, 70 /* RCOLD */)) z = div(z + 2, 3);
        if (temp.resAcid) z = div(z + 2, 3);
        z = z * 2;
        if (pfe && !attacking) z = div(z, 2);
        break;
      case 13 /* BLIND */:
        z = dDice * dSide;
        power = 2;
        if (trait2(world, 77 /* RBLIND */)) break;
        z += 10;
        if (trait2(world, 25 /* CLASS */) === CLASS_MAGE) z += 75;
        if (pfe && !attacking) z = div(z, 2);
        break;
      case 14 /* CONFUSE */:
        z = dDice * dSide;
        power = 10;
        if (trait2(world, 78 /* RCONF */)) break;
        z += 200;
        if (trait2(world, 25 /* CLASS */) === CLASS_MAGE) z += 200;
        if (pfe && !attacking) z = div(z, 2);
        break;
      case 15 /* TERRIFY */:
        z = dDice * dSide;
        power = 10;
        if (trait2(world, 74 /* RFEAR */)) break;
        z = z * 2;
        if (pfe && !attacking) z = div(z, 2);
        break;
      case 16 /* PARALYZE */:
        z = dDice * dSide;
        power = 2;
        if (trait2(world, 86 /* FRACT */)) break;
        z += 200;
        if (pfe && !attacking) z = div(z, 2);
        break;
      case 17 /* LOSE_STR */:
        z = dDice * dSide;
        if (trait2(world, 20 /* SSTR */)) break;
        if (trait2(world, 10 /* CSTR */) <= 3) break;
        if (g.spellLegal(BORG_SPELL.RESTORATION)) break;
        if (g.spellLegal(BORG_SPELL.REVITALIZE)) break;
        if (g.spellLegal(BORG_SPELL.UNHOLY_REPRIEVE)) break;
        z += 150;
        if (trait2(world, 10 /* CSTR */) < 10) z += 100;
        if (pfe && !attacking) z = div(z, 2);
        break;
      case 20 /* LOSE_DEX */:
        z = dDice * dSide;
        if (trait2(world, 23 /* SDEX */)) break;
        if (trait2(world, 13 /* CDEX */) <= 3) break;
        if (g.spellLegal(BORG_SPELL.RESTORATION)) break;
        if (g.spellLegal(BORG_SPELL.REVITALIZE)) break;
        z += 150;
        if (trait2(world, 13 /* CDEX */) < 10) z += 100;
        if (pfe && !attacking) z = div(z, 2);
        break;
      case 21 /* LOSE_CON */:
        z = dDice * dSide;
        if (trait2(world, 24 /* SCON */)) break;
        if (trait2(world, 14 /* CCON */) <= 3) break;
        if (g.spellLegal(BORG_SPELL.RESTORATION)) break;
        if (g.spellLegal(BORG_SPELL.REVITALIZE)) break;
        if (g.spellLegal(BORG_SPELL.UNHOLY_REPRIEVE)) break;
        z += 150;
        if (trait2(world, 10 /* CSTR */) < 8) z += 100;
        if (pfe && !attacking) z = div(z, 2);
        break;
      case 18 /* LOSE_INT */:
        z = dDice * dSide;
        if (trait2(world, 21 /* SINT */)) break;
        if (trait2(world, 11 /* CINT */) <= 3) break;
        if (g.spellLegal(BORG_SPELL.RESTORATION)) break;
        if (g.spellLegal(BORG_SPELL.REVITALIZE)) break;
        if (g.spellLegal(BORG_SPELL.UNHOLY_REPRIEVE)) break;
        z += 150;
        if (spellStat === STAT_INT) z += 50;
        if (pfe && !attacking) z = div(z, 2);
        break;
      case 19 /* LOSE_WIS */:
        z = dDice * dSide;
        if (trait2(world, 22 /* SWIS */)) break;
        if (trait2(world, 12 /* CWIS */) <= 3) break;
        if (g.spellLegal(BORG_SPELL.RESTORATION)) break;
        if (g.spellLegal(BORG_SPELL.REVITALIZE)) break;
        z += 150;
        if (spellStat === STAT_WIS) z += 50;
        if (pfe && !attacking) z = div(z, 2);
        break;
      case 22 /* LOSE_ALL */:
        z = dDice * dSide;
        power = 2;
        break;
      case 23 /* SHATTER */:
        z = dDice * dSide;
        z -= div(z * (ac < 150 ? ac : 150), 250);
        power = 60;
        z += 150;
        if (pfe && !attacking) z = div(z, 2);
        break;
      case 24 /* EXP_10 */:
        z = dDice * dSide;
        if (trait2(world, 85 /* HLIFE */)) break;
        if (clevel === 50) break;
        if (g.spellLegal(BORG_SPELL.REMEMBRANCE) || g.spellLegal(BORG_SPELL.UNHOLY_REPRIEVE) || g.spellLegal(BORG_SPELL.REVITALIZE))
          break;
        z += 100;
        if (pfe && !attacking) z = div(z, 2);
        break;
      case 25 /* EXP_20 */:
        z = dDice * dSide;
        if (trait2(world, 85 /* HLIFE */)) break;
        if (clevel >= 50) break;
        if (g.spellLegal(BORG_SPELL.REMEMBRANCE) || g.spellLegal(BORG_SPELL.UNHOLY_REPRIEVE) || g.spellLegal(BORG_SPELL.REVITALIZE))
          break;
        z += 150;
        if (pfe && !attacking) z = div(z, 2);
        break;
      case 26 /* EXP_40 */:
        z = dDice * dSide;
        if (trait2(world, 85 /* HLIFE */)) break;
        if (clevel >= 50) break;
        if (g.spellLegal(BORG_SPELL.REMEMBRANCE) || g.spellLegal(BORG_SPELL.UNHOLY_REPRIEVE) || g.spellLegal(BORG_SPELL.REVITALIZE))
          break;
        z += 200;
        if (pfe && !attacking) z = div(z, 2);
        break;
      case 27 /* EXP_80 */:
        z = dDice * dSide;
        if (trait2(world, 85 /* HLIFE */)) break;
        if (clevel >= 50) break;
        if (g.spellLegal(BORG_SPELL.REMEMBRANCE) || g.spellLegal(BORG_SPELL.UNHOLY_REPRIEVE) || g.spellLegal(BORG_SPELL.REVITALIZE))
          break;
        z += 250;
        if (pfe && !attacking) z = div(z, 2);
        break;
      case 28 /* HALLU */:
        z = dDice * dSide;
        z += 250;
        if (pfe && !attacking) z = div(z, 2);
        break;
      default:
        break;
    }
    z -= trait2(world, 47 /* DAM_RED */);
    if (z < 0) z = 0;
    if (!fullDamage) {
      let chance;
      if (g.fightingUnique || facts.level + power > 0)
        chance = 150 - (div(ac * 300, 4) + (facts.level + power) * 3);
      else chance = -1;
      if (chance < 5) chance = 5;
      z = div(z * chance, 100);
    }
    n += z;
  }
  return n;
}
function borgDangerSpell(world, g, facts, kill, y, x, d, average) {
  let n = 0;
  let pfe = 0;
  let glyph = 0;
  let totalDam = 0;
  const temp = world.self.temp;
  const sp = facts.spellPower;
  const isMage = trait2(world, 25 /* CLASS */) === CLASS_MAGE;
  if (temp.protFromEvil && hasFlag(facts, "EVIL") && trait2(world, 35 /* CLEVEL */) >= facts.level) {
    pfe = 1;
  }
  if (g.onGlyph) {
    glyph = 1;
  } else if (g.trackGlyph.length) {
    for (const gp of g.trackGlyph) {
      if (gp.y === y && gp.x === x) glyph = 1;
    }
  }
  if (facts.rIdx === 0) return 1e3;
  if (!facts.spells.length) return 0;
  const hp = kill.power;
  const isUnique = hasFlag(facts, "UNIQUE");
  const spotSafe = () => {
    let safe = 1;
    for (let sx = -1; sx <= 1; sx++) {
      for (let sy = -1; sy <= 1; sy++) {
        const gx = sx + kill.pos.x;
        const gy = sy + kill.pos.y;
        if (gx === kill.pos.x && gy === kill.pos.y) continue;
        if (!world.map.inBounds(gx, gy)) continue;
        if (borgFeatureProtected(world.map.at(gx, gy))) {
          safe++;
          if (safe === 0) safe = 1;
          if (safe === 8) safe = 100;
          if (g.morgothPosition || g.asPosition) safe = 1e3;
        }
      }
    }
    return safe;
  };
  for (let q = 0; q < facts.spells.length; q++) {
    let p = 0;
    let z = 0;
    let bolt = false;
    switch (facts.spells[q]) {
      case RSF.SHRIEK:
        p += 5;
        break;
      case RSF.WHIP:
        if (d < 3) z = 100;
        break;
      case RSF.SPIT:
        if (d < 4) z = 100;
        break;
      case RSF.SHOT:
        z = (div(sp, 8) + 1) * 5;
        break;
      case RSF.ARROW:
        z = (div(sp, 8) + 1) * 6;
        break;
      case RSF.BOLT:
        z = (div(sp, 8) + 1) * 7;
        break;
      case RSF.BR_ACID:
        if (trait2(world, 65 /* IACID */)) break;
        z = div(hp, 3);
        if (z > 1600) z = 1600;
        if (trait2(world, 72 /* RACID */)) z = div(z + 2, 3);
        if (temp.resAcid) z = div(z + 2, 3);
        p += 40;
        break;
      case RSF.BR_ELEC:
        if (trait2(world, 67 /* IELEC */)) break;
        z = div(hp, 3);
        if (z > 1600) z = 1600;
        if (trait2(world, 71 /* RELEC */)) z = div(z + 2, 3);
        if (temp.resElec) z = div(z + 2, 3);
        p += 20;
        break;
      case RSF.BR_FIRE:
        if (trait2(world, 64 /* IFIRE */)) break;
        z = div(hp, 3);
        if (z > 1600) z = 1600;
        if (trait2(world, 69 /* RFIRE */)) z = div(z + 2, 3);
        if (temp.resFire) z = div(z + 2, 3);
        p += 40;
        break;
      case RSF.BR_COLD:
        if (trait2(world, 66 /* ICOLD */)) break;
        z = div(hp, 3);
        if (z > 1600) z = 1600;
        if (trait2(world, 70 /* RCOLD */)) z = div(z + 2, 3);
        if (temp.resCold) z = div(z + 2, 3);
        p += 20;
        break;
      case RSF.BR_POIS:
        z = div(hp, 3);
        if (z > 800) z = 800;
        if (trait2(world, 73 /* RPOIS */)) z = div(z + 2, 3);
        if (temp.resPois) z = div(z + 2, 3);
        if (temp.resPois) break;
        if (trait2(world, 73 /* RPOIS */)) break;
        p += 20;
        break;
      case RSF.BR_NETH:
        z = div(hp, 6);
        if (z > 600) z = 600;
        if (trait2(world, 82 /* RNTHR */)) {
          z = div(z * 6, 9);
          break;
        }
        p += 125;
        break;
      case RSF.BR_LIGHT:
        z = div(hp, 6);
        if (z > 500) z = 500;
        if (trait2(world, 75 /* RLITE */)) {
          z = div(z * 2, 3);
          break;
        }
        if (trait2(world, 77 /* RBLIND */)) break;
        p += 20;
        if (isMage) p += 20;
        break;
      case RSF.BR_DARK:
        z = div(hp, 6);
        if (z > 500) z = 500;
        if (trait2(world, 76 /* RDARK */)) z = div(z * 2, 3);
        if (trait2(world, 76 /* RDARK */)) break;
        if (trait2(world, 77 /* RBLIND */)) break;
        p += 20;
        if (isMage) p += 20;
        break;
      case RSF.BR_SOUN:
        z = div(hp, 6);
        if (z > 500) z = 500;
        if (trait2(world, 79 /* RSND */)) z = div(z * 5, 9);
        if (trait2(world, 79 /* RSND */)) break;
        if (trait2(world, 117 /* ISSTUN */)) z += 500;
        if (trait2(world, 118 /* ISHEAVYSTUN */)) z += 1e3;
        p += 50;
        break;
      case RSF.BR_CHAO:
        z = div(hp, 6);
        if (z > 600) z = 600;
        if (trait2(world, 83 /* RKAOS */)) z = div(z * 6, 9);
        p += 100;
        if (trait2(world, 83 /* RKAOS */)) break;
        p += 200;
        break;
      case RSF.BR_DISE:
        z = div(hp, 6);
        if (z > 500) z = 500;
        if (trait2(world, 84 /* RDIS */)) z = div(z * 6, 10);
        if (trait2(world, 84 /* RDIS */)) break;
        p += 500;
        break;
      case RSF.BR_NEXU:
        z = div(hp, 6);
        if (z > 400) z = 400;
        if (trait2(world, 81 /* RNXUS */)) z = div(z * 6, 10);
        if (trait2(world, 81 /* RNXUS */)) break;
        p += 100;
        break;
      case RSF.BR_TIME:
        z = div(hp, 3);
        if (z > 150) z = 150;
        p += 250;
        break;
      case RSF.BR_INER:
        z = div(hp, 6);
        if (z > 200) z = 200;
        p += 100;
        break;
      case RSF.BR_GRAV:
        z = div(hp, 3);
        if (z > 200) z = 200;
        p += 100;
        if (trait2(world, 79 /* RSND */)) break;
        if (trait2(world, 117 /* ISSTUN */)) z += 500;
        if (trait2(world, 118 /* ISHEAVYSTUN */)) z += 1e3;
        break;
      case RSF.BR_SHAR:
        z = div(hp, 6);
        if (z > 500) z = 500;
        if (trait2(world, 80 /* RSHRD */)) z = div(z * 6, 9);
        if (trait2(world, 80 /* RSHRD */)) break;
        p += 50;
        break;
      case RSF.BR_PLAS:
        z = div(hp, 6);
        if (z > 150) z = 150;
        if (trait2(world, 79 /* RSND */)) break;
        p += 100;
        if (trait2(world, 117 /* ISSTUN */)) z += 500;
        if (trait2(world, 118 /* ISHEAVYSTUN */)) z += 1e3;
        break;
      case RSF.BR_WALL:
        z = div(hp, 6);
        if (z > 200) z = 200;
        if (trait2(world, 79 /* RSND */)) break;
        if (trait2(world, 117 /* ISSTUN */)) z += 100;
        if (trait2(world, 118 /* ISHEAVYSTUN */)) z += 500;
        p += 50;
        break;
      case RSF.BR_MANA:
        z = div(hp, 3);
        if (z > 1600) z = 1600;
        break;
      case RSF.BOULDER:
        z = (1 + div(sp, 7)) * 12;
        bolt = true;
        break;
      case RSF.WEAVE:
        break;
      case RSF.BA_ACID:
        if (trait2(world, 65 /* IACID */)) break;
        z = sp * 3 + 15;
        if (trait2(world, 72 /* RACID */)) z = div(z + 2, 3);
        if (temp.resAcid) z = div(z + 2, 3);
        p += 40;
        break;
      case RSF.BA_ELEC:
        if (trait2(world, 67 /* IELEC */)) break;
        z = div(sp * 3, 2) + 8;
        if (trait2(world, 71 /* RELEC */)) z = div(z + 2, 3);
        if (temp.resElec) z = div(z + 2, 3);
        p += 20;
        break;
      case RSF.BA_FIRE:
        if (trait2(world, 64 /* IFIRE */)) break;
        z = div(sp * 7, 2) + 10;
        if (trait2(world, 69 /* RFIRE */)) z = div(z + 2, 3);
        if (temp.resFire) z = div(z + 2, 3);
        p += 40;
        break;
      case RSF.BA_COLD:
        if (trait2(world, 66 /* ICOLD */)) break;
        z = div(sp * 3, 2) + 10;
        if (trait2(world, 70 /* RCOLD */)) z = div(z + 2, 3);
        if (temp.resCold) z = div(z + 2, 3);
        p += 20;
        break;
      case RSF.BA_POIS:
        z = (div(sp, 2) + 3) * 4;
        if (trait2(world, 73 /* RPOIS */)) z = div(z + 2, 3);
        if (temp.resPois) z = div(z + 2, 3);
        if (temp.resPois) break;
        if (trait2(world, 73 /* RPOIS */)) break;
        p += 20;
        break;
      case RSF.BA_SHAR:
        z = div(sp * 3, 2) + 10;
        if (trait2(world, 80 /* RSHRD */)) z = div(z * 6, 9);
        if (trait2(world, 80 /* RSHRD */)) break;
        p += 20;
        break;
      case RSF.BA_NETH:
        z = sp * 4 + 10 * 10;
        if (trait2(world, 82 /* RNTHR */)) z = div(z * 6, 8);
        if (trait2(world, 82 /* RNTHR */)) break;
        p += 250;
        break;
      case RSF.BA_WATE:
        z = div(sp * 5, 2) + 50;
        if (trait2(world, 79 /* RSND */)) break;
        if (trait2(world, 117 /* ISSTUN */)) p += 500;
        if (trait2(world, 118 /* ISHEAVYSTUN */)) p += 1e3;
        if (trait2(world, 78 /* RCONF */)) break;
        p += 50;
        if (isMage) p += 20;
        break;
      case RSF.BA_MANA:
        z = sp * 5 + 10 * 10;
        p += 50;
        break;
      case RSF.BA_HOLY:
        z = 10 + div(div(sp * 3, 2) + 1, 2);
        p += 50;
        break;
      case RSF.BA_DARK:
        z = sp * 4 + 10 * 10;
        if (trait2(world, 76 /* RDARK */)) z = div(z * 6, 9);
        if (trait2(world, 76 /* RDARK */)) break;
        if (trait2(world, 77 /* RBLIND */)) break;
        p += 20;
        if (isMage) p += 20;
        break;
      case RSF.BA_LIGHT:
        z = 10 + div(sp * 3, 2);
        if (trait2(world, 75 /* RLITE */)) z = div(z * 6, 9);
        if (trait2(world, 75 /* RLITE */)) break;
        if (trait2(world, 77 /* RBLIND */)) break;
        p += 20;
        if (isMage) p += 20;
        break;
      case RSF.STORM:
        z = 70 + sp * 5;
        if (trait2(world, 79 /* RSND */)) break;
        if (trait2(world, 117 /* ISSTUN */)) p += 500;
        if (trait2(world, 118 /* ISHEAVYSTUN */)) p += 1e3;
        if (trait2(world, 78 /* RCONF */)) break;
        break;
      case RSF.DRAIN_MANA:
        if (trait2(world, 31 /* MAXSP */)) p += 100;
        break;
      case RSF.MIND_BLAST:
        if (trait2(world, 57 /* SAV */) < 100) z = div(sp, 2) + 1;
        break;
      case RSF.BRAIN_SMASH:
        z = div(12 * (15 + 1), 2);
        p += 200 - 2 * trait2(world, 57 /* SAV */);
        if (p < 0) p = 0;
        break;
      case RSF.WOUND:
        if (trait2(world, 57 /* SAV */) >= 100) break;
        z = div(sp, 3) * 2 * 5;
        z = div(z * (120 - trait2(world, 57 /* SAV */)), 100);
        break;
      case RSF.BO_ACID:
        bolt = true;
        if (trait2(world, 65 /* IACID */)) break;
        z = 7 * 8 + div(sp, 3);
        if (trait2(world, 72 /* RACID */)) z = div(z + 2, 3);
        if (temp.resAcid) z = div(z + 2, 3);
        p += 40;
        break;
      case RSF.BO_ELEC:
        if (trait2(world, 67 /* IELEC */)) break;
        bolt = true;
        z = 4 * 8 + div(sp, 3);
        if (trait2(world, 71 /* RELEC */)) z = div(z + 2, 3);
        if (temp.resElec) z = div(z + 2, 3);
        p += 20;
        break;
      case RSF.BO_FIRE:
        if (trait2(world, 64 /* IFIRE */)) break;
        bolt = true;
        z = 9 * 8 + div(sp, 3);
        if (trait2(world, 69 /* RFIRE */)) z = div(z + 2, 3);
        if (temp.resFire) z = div(z + 2, 3);
        p += 40;
        break;
      case RSF.BO_COLD:
        if (trait2(world, 66 /* ICOLD */)) break;
        bolt = true;
        z = 6 * 8 + div(sp, 3);
        if (trait2(world, 70 /* RCOLD */)) z = div(z + 2, 3);
        if (temp.resCold) z = div(z + 2, 3);
        p += 20;
        break;
      case RSF.BO_POIS:
        if (trait2(world, 68 /* IPOIS */)) break;
        z = 9 * 8 + div(sp, 3);
        if (trait2(world, 73 /* RPOIS */)) z = div(z + 2, 3);
        if (temp.resPois) z = div(z + 2, 3);
        bolt = true;
        break;
      case RSF.BO_NETH:
        bolt = true;
        z = 5 * 5 + div(sp * 3, 2) + 50;
        if (trait2(world, 82 /* RNTHR */)) z = div(z * 6, 8);
        if (trait2(world, 82 /* RNTHR */)) break;
        p += 200;
        break;
      case RSF.BO_WATE:
        z = 10 * 10 + sp;
        bolt = true;
        if (trait2(world, 79 /* RSND */)) break;
        if (trait2(world, 117 /* ISSTUN */)) p += 500;
        if (trait2(world, 118 /* ISHEAVYSTUN */)) p += 1e3;
        if (trait2(world, 78 /* RCONF */)) break;
        p += 20;
        if (isMage) p += 20;
        break;
      case RSF.BO_MANA:
        z = div(sp * 5, 2) + 50;
        bolt = true;
        p += 50;
        break;
      case RSF.BO_PLAS:
        z = 10 + 8 * 7 + sp;
        bolt = true;
        if (trait2(world, 79 /* RSND */)) break;
        if (trait2(world, 117 /* ISSTUN */)) z += 500;
        if (trait2(world, 118 /* ISHEAVYSTUN */)) z += 1e3;
        break;
      case RSF.BO_ICE:
        z = 6 * 6 + sp;
        bolt = true;
        p += 20;
        if (trait2(world, 79 /* RSND */)) break;
        if (trait2(world, 117 /* ISSTUN */)) z += 50;
        if (trait2(world, 118 /* ISHEAVYSTUN */)) z += 1e3;
        break;
      case RSF.MISSILE:
        z = 2 * 6 + div(sp, 3);
        bolt = true;
        break;
      case RSF.BE_ELEC:
        if (trait2(world, 67 /* IELEC */)) break;
        z = 5 * 5 + sp * 2 + 30;
        if (trait2(world, 71 /* RELEC */)) z = div(z + 2, 3);
        if (temp.resElec) z = div(z + 2, 3);
        bolt = true;
        break;
      case RSF.BE_NETH:
        bolt = true;
        z = 5 * 5 + sp * 2 + 30;
        if (trait2(world, 82 /* RNTHR */)) z = div(z * 6, 8);
        if (trait2(world, 82 /* RNTHR */)) break;
        bolt = true;
        break;
      case RSF.SCARE:
        if (trait2(world, 57 /* SAV */) >= 100) break;
        p += 10;
        break;
      case RSF.BLIND:
        if (trait2(world, 77 /* RBLIND */)) break;
        if (trait2(world, 57 /* SAV */) >= 100) break;
        p += 10;
        break;
      case RSF.CONF:
        if (trait2(world, 78 /* RCONF */)) break;
        if (trait2(world, 57 /* SAV */) >= 100) break;
        p += 10;
        break;
      case RSF.SLOW:
        if (trait2(world, 86 /* FRACT */)) break;
        if (trait2(world, 57 /* SAV */) >= 100) break;
        p += 5;
        break;
      case RSF.HOLD:
        if (trait2(world, 86 /* FRACT */)) break;
        if (trait2(world, 57 /* SAV */) >= 100) break;
        p += 150;
        break;
      case RSF.HASTE:
        p += 10;
        break;
      case RSF.HEAL:
        p += 10;
        break;
      case RSF.HEAL_KIN:
        break;
      case RSF.BLINK:
        break;
      case RSF.TPORT:
        p += 10;
        break;
      case RSF.TELE_TO:
        p += 20;
        break;
      case RSF.TELE_SELF_TO:
        p += 20;
        break;
      case RSF.TELE_AWAY:
        p += 10;
        break;
      case RSF.TELE_LEVEL:
        if (trait2(world, 57 /* SAV */) >= 100) break;
        p += 50;
        break;
      case RSF.DARKNESS:
        p += 5;
        break;
      case RSF.TRAPS:
        p += 50;
        break;
      case RSF.FORGET:
        if (trait2(world, 57 /* SAV */) >= 100) break;
        if (trait2(world, 30 /* CURSP */) < 15) p += 500;
        else p += 30;
        break;
      case RSF.SHAPECHANGE:
        p += 200;
        break;
      case RSF.S_KIN: {
        const safe = spotSafe();
        if (pfe) {
          p += sp;
          p = div(p, safe);
        } else if (glyph || g.createDoor || g.fightingUnique) {
          p += sp * 3;
          p = div(p, safe);
        } else {
          p += sp * 7;
          p = div(p, safe);
        }
        if (isUnique) p = div(p * 75, 100);
        break;
      }
      case RSF.S_HI_DEMON: {
        const safe = spotSafe();
        if (pfe) {
          p += sp;
          p = div(p, safe);
        } else if (glyph || g.createDoor || g.fightingUnique) {
          p += sp * 6;
          p = div(p, safe);
        } else {
          p += sp * 12;
          p = div(p, safe);
        }
        if (isUnique) p = div(p * 75, 100);
        break;
      }
      case RSF.S_MONSTER: {
        const safe = spotSafe();
        if (pfe || glyph || g.createDoor || g.fightingUnique) p += 0;
        else {
          p += sp * 5;
          p = div(p, safe);
        }
        break;
      }
      case RSF.S_MONSTERS: {
        const safe = spotSafe();
        if (pfe || glyph || g.createDoor || g.fightingUnique) p += 0;
        else {
          p += sp * 7;
          p = div(p, safe);
        }
        if (isUnique) p = div(p * 75, 100);
        break;
      }
      case RSF.S_ANIMAL: {
        const safe = spotSafe();
        if (pfe || glyph || g.createDoor || g.fightingUnique) p += 0;
        else {
          p += sp * 5;
          p = div(p, safe);
        }
        if (isUnique) p = div(p * 75, 100);
        break;
      }
      case RSF.S_SPIDER: {
        const safe = spotSafe();
        if (pfe || glyph || g.createDoor || g.fightingUnique) p += 0;
        else {
          p += sp * 5;
          p = div(p, safe);
        }
        if (isUnique) p = div(p * 75, 100);
        break;
      }
      case RSF.S_HOUND: {
        const safe = spotSafe();
        if (pfe || glyph || g.createDoor || g.fightingUnique) p += 0;
        else {
          p += sp * 5;
          p = div(p, safe);
        }
        if (isUnique) p = div(p * 75, 100);
        break;
      }
      case RSF.S_HYDRA: {
        const safe = spotSafe();
        if (pfe) {
          p += sp;
          p = div(p, safe);
        } else if (glyph || g.createDoor || g.fightingUnique) {
          p += sp * 2;
          p = div(p, safe);
        } else {
          p += sp * 5;
          p = div(p, safe);
        }
        if (isUnique) p = div(p * 75, 100);
        break;
      }
      case RSF.S_AINU: {
        const safe = spotSafe();
        if (pfe || g.fightingUnique) {
          p += sp;
          p = div(p, safe);
        } else if (glyph || g.createDoor || g.fightingUnique) {
          p += sp * 3;
          p = div(p, safe);
        } else {
          p += sp * 7;
          p = div(p, safe);
        }
        if (isUnique) p = div(p * 75, 100);
        break;
      }
      case RSF.S_DEMON: {
        const safe = spotSafe();
        if (pfe) {
          p += sp;
          p = div(p, safe);
        } else if (glyph || g.createDoor || g.fightingUnique) {
          p += sp * 3;
          p = div(p, safe);
        } else {
          p += sp * 7;
          p = div(p, safe);
        }
        if (isUnique) p = div(p * 75, 100);
        break;
      }
      case RSF.S_UNDEAD: {
        const safe = spotSafe();
        if (pfe) {
          p += sp;
          p = div(p, safe);
        } else if (glyph || g.createDoor || g.fightingUnique) {
          p += sp * 3;
          p = div(p, safe);
        } else {
          p += sp * 7;
          p = div(p, safe);
        }
        if (isUnique) p = div(p * 75, 100);
        break;
      }
      case RSF.S_DRAGON: {
        const safe = spotSafe();
        if (pfe) {
          p += sp;
          p = div(p, safe);
        } else if (glyph || g.createDoor || g.fightingUnique) {
          p += sp * 3;
          p = div(p, safe);
        } else {
          p += sp * 7;
          p = div(p, safe);
        }
        if (isUnique) p = div(p * 75, 100);
        break;
      }
      case RSF.S_HI_UNDEAD: {
        const safe = spotSafe();
        if (pfe) {
          p += sp;
          p = div(p, safe);
        } else if (glyph || g.createDoor || g.fightingUnique) {
          p += sp * 6;
          p = div(p, safe);
        } else {
          p += sp * 12;
          p = div(p, safe);
        }
        if (isUnique) p = div(p * 75, 100);
        break;
      }
      case RSF.S_HI_DRAGON: {
        const safe = spotSafe();
        if (pfe) {
          p = div(p, safe);
        } else if (glyph || g.createDoor || g.fightingUnique) {
          p += sp * 6;
          p = div(p, safe);
        } else {
          p += sp * 12;
          p = div(p, safe);
        }
        if (isUnique) p = div(p * 75, 100);
        break;
      }
      case RSF.S_WRAITH: {
        const safe = spotSafe();
        if (pfe) {
          p += sp;
          p = div(p, safe);
        } else if (glyph || g.createDoor || g.fightingUnique) {
          p += sp * 6;
          p = div(p, safe);
        } else {
          p += sp * 12;
          p = div(p, safe);
        }
        if (isUnique) p = div(p * 75, 100);
        break;
      }
      case RSF.S_UNIQUE: {
        const safe = spotSafe();
        if (pfe) {
          p += sp;
          p = div(p, safe);
        } else if (glyph || g.createDoor) {
          p += sp * 3;
          p = div(p, safe);
        } else {
          p += sp * 6;
          p = div(p, safe);
        }
        if (isUnique) p = div(p * 75, 100);
        break;
      }
      default:
        break;
    }
    if (bolt && !borgProjectablePure(
      world,
      maxRangeOf(world),
      kill.pos.y,
      kill.pos.x,
      world.self.c.y,
      world.self.c.x
    ))
      z = 0;
    if (trait2(world, 106 /* MAXDEPTH */) >= 75) p = 0;
    p += z;
    if (p > n) n = p;
    totalDam += p;
  }
  totalDam -= trait2(world, 47 /* DAM_RED */);
  if (totalDam < 0) totalDam = 0;
  if (g.morgothPosition || g.asPosition) totalDam = div(totalDam * 7, 10);
  const av3 = div(totalDam, facts.spells.length);
  if (!average) return av3;
  if (n >= div(av3 * 15, 10) || n > div(trait2(world, 27 /* CURHP */) * 8, 10)) return n;
  return av3;
}
function maxRangeOf(world) {
  const st2 = getDangerState(world);
  return st2.maxRange;
}
function isBlockingFeat(feat) {
  return feat === FEAT.CLOSED || feat === FEAT.PERM;
}
function isSeamFeat(feat) {
  return feat === FEAT.MAGMA || feat === FEAT.QUARTZ || feat === FEAT.MAGMA_K || feat === FEAT.QUARTZ_K || feat === FEAT.RUBBLE;
}
function borgDangerOneKill(ctx, y, x, c, i, average, fullDamage) {
  const world = ctx.world;
  const st2 = getDangerState(world);
  st2.maxRange = ctx.view.constants().maxRange ?? 20;
  const g = st2.globals;
  const kill = world.kills.at(i);
  const facts = g.resolveFacts(ctx, i);
  const x9 = kill.pos.x;
  const y9 = kill.pos.y;
  if (!kill.rIdx) return 0;
  for (const idx of g.tpOtherIndices) {
    if (i === idx) return 0;
  }
  const ax = x9 > x ? x9 - x : x - x9;
  const ay = y9 > y ? y9 - y : y - y9;
  let d = Math.max(ax, ay);
  if (d < 1) d = 1;
  if (d > 20) return 0;
  const temp = world.self.temp;
  const clevel = trait2(world, 35 /* CLEVEL */);
  let fakeSpeed = trait2(world, 44 /* SPEED */);
  let monsterSpeed = kill.speed;
  if (trait2(world, 44 /* SPEED */) >= 135) fakeSpeed = g.fightingUnique ? 120 : 125;
  if (temp.fast) fakeSpeed += 10;
  if (g.slowSpell) monsterSpeed -= 10;
  if (trait2(world, 28 /* MAXHP */) < 20 && trait2(world, 105 /* CDEPTH */)) monsterSpeed += 3;
  let e = extractEnergy(fakeSpeed);
  const t = div(100 + (e - 1), e);
  e = extractEnergy(monsterSpeed);
  let q = c * div(t * e, 10);
  if (fullDamage) q = div(q + 9, 10) * 10;
  if (q <= 10) q = 10;
  let v1 = borgDangerPhysical(world, g, facts, fullDamage);
  if (world.self.timeThisPanel > 1200 || world.clock > 25e3) v1 = div(v1, 5);
  if (hasFlag(facts, "NEVER_BLOW")) v1 = 0;
  if (hasFlag(facts, "NEVER_MOVE") && d > 1) v1 = 0;
  if (hasFlag(facts, "MULTIPLY") && clevel < 20) v1 = v1 + div(v1 * 15, 10);
  if (facts.hasFriends && clevel < 20) {
    if (clevel < 15) v1 = v1 + div(v1 * 18, 10);
    else v1 = v1 + div(v1 * 13, 10);
  }
  if (!kill.awake) {
    const inc = facts.sleep + 5;
    if (clevel >= 25) v1 = div(v1, 2);
    v1 = v1 + div(v1 * inc, 100);
  }
  if (g.sleepSpellIi) {
    if (d === 1 && kill.awake && !hasFlag(facts, "NO_SLEEP") && !hasFlag(facts, "UNIQUE") && kill.level <= clevel - 15) {
      if (clevel < 20 && trait2(world, 27 /* CURHP */) < div(trait2(world, 28 /* MAXHP */), 2))
        v1 = 0;
      else v1 = div(v1, 3);
    }
  }
  if (g.sleepSpell) {
    if (kill.awake && !hasFlag(facts, "NO_SLEEP") && !hasFlag(facts, "UNIQUE") && kill.level <= clevel - 15) {
      if (clevel < 20 && trait2(world, 27 /* CURHP */) < div(trait2(world, 28 /* MAXHP */), 2))
        v1 = 0;
      else v1 = div(v1, d + 2);
    }
  }
  if (g.crushSpell) {
    if (div(kill.power * (100 - kill.injury), 100) < clevel * 4) {
      const ag = world.map.inBounds(x9, y9) ? world.map.at(x9, y9) : null;
      if (ag && ag.info & BORG_VIEW && borgCaveFloorGridForKill(ag.feat)) v1 = 0;
    }
  }
  if (kill.confused) v1 = div(v1, 2);
  if (kill.stunned) v1 = div(v1 * 10, 13);
  if (g.confuseSpell) {
    if (kill.awake && !kill.confused && !hasFlag(facts, "NO_SLEEP") && !hasFlag(facts, "UNIQUE") && kill.level <= clevel - 15) {
      if (clevel < 20 && trait2(world, 27 /* CURHP */) < div(trait2(world, 28 /* MAXHP */), 2))
        v1 = 0;
      else v1 = div(v1, d + 2);
    }
  }
  if (g.fearMonSpell) v1 = 0;
  if (q > 10 && d !== 1 && !hasFlag(facts, "NEVER_MOVE")) {
    let bV1 = 0;
    for (let ii = 0; ii < 8; ii++) {
      const yTemp = y9 + ddy_ddd2[ii];
      const xTemp = x9 + ddx_ddd2[ii];
      if (!squareInBoundsFully(xTemp, yTemp)) continue;
      const ag = world.map.at(xTemp, yTemp);
      if (ag.kill) continue;
      if (isBlockingFeat(ag.feat)) continue;
      if (ag.feat === FEAT.GRANITE || isSeamFeat(ag.feat)) {
        if (hasFlag(facts, "PASS_WALL")) {
          if (borgDistance(yTemp, xTemp, y, x) === 1) bV1 = v1;
        }
        if (hasFlag(facts, "KILL_WALL")) {
          if (borgDistance(yTemp, xTemp, y, x) === 1) bV1 = v1;
        }
      }
      if (borgDistance(yTemp, xTemp, y, x) > 1) continue;
      if (borgCaveFloorBold2(world, yTemp, xTemp)) {
        bV1 = v1 * div(q, d * 10);
      }
    }
    v1 = bV1;
  }
  if (q > 10 && d === 1) v1 = div(v1 * q, 10);
  if (q === 10 && d > 1) v1 = 0;
  let v2 = borgDangerSpell(world, g, facts, kill, y, x, d, average);
  if (!facts.freqInnate && !facts.freqSpell) v2 = 0;
  const maxRange3 = getDangerState(world).maxRange;
  if (borgDistance(y9, x9, y, x) > maxRange3) v2 = 0;
  if (q <= 10 && !borgProjectable(world, g, maxRange3, y9, x9, y, x) && !borgProjectable(world, g, maxRange3, y, x, y9, x9))
    v2 = 0;
  if (q >= 20) {
    const bQ = q;
    let bV2 = 0;
    if (q > 20) q = 20;
    for (let ii = 0; ii < 8; ii++) {
      const yTemp = y9 + ddy_ddd2[ii];
      const xTemp = x9 + ddx_ddd2[ii];
      if (!squareInBoundsFully(xTemp, yTemp)) continue;
      const ag = world.map.at(xTemp, yTemp);
      if (ag.kill) continue;
      if (isBlockingFeat(ag.feat)) continue;
      if (ag.feat >= FEAT.GRANITE || isSeamFeat(ag.feat)) {
        if (hasFlag(facts, "PASS_WALL")) {
          if (borgProjectable(world, g, maxRange3, yTemp, xTemp, y, x))
            bV2 = div(v2 * bQ, 10);
        }
        if (hasFlag(facts, "KILL_WALL")) {
          if (borgProjectable(world, g, maxRange3, yTemp, xTemp, y, x))
            bV2 = div(v2 * bQ, 10);
        }
      } else if (borgProjectable(world, g, maxRange3, yTemp, xTemp, y, x)) {
        bV2 = div(v2 * bQ, 10);
      }
    }
    v2 = bV2;
  }
  if (world.self.timeThisPanel > 1200 || world.clock > 25e3) v2 = div(v2, 5);
  if (hasFlag(facts, "MULTIPLY") && clevel < 20) v2 = v2 + div(v2 * 12, 10);
  if (facts.hasFriends && clevel < 20) v2 = v2 + div(v2 * 12, 10);
  if (!kill.awake) {
    const inc = facts.sleep + 5;
    if (clevel >= 25) v2 = div(v2, 2);
    v2 = v2 + div(v2 * inc, 100);
  }
  if (g.sleepSpellIi) {
    const cap = clevel < 15 ? clevel : div(clevel - 10, 4) * 3 + 10;
    if (d === 1 && kill.awake && !hasFlag(facts, "NO_SLEEP") && !hasFlag(facts, "UNIQUE") && kill.level <= cap) {
      v2 = div(v2, 3);
    }
  }
  if (g.crushSpell) {
    if (div(kill.power * (100 - kill.injury), 100) < clevel * 4) {
      const ag = world.map.inBounds(x9, y9) ? world.map.at(x9, y9) : null;
      if (ag && ag.info & BORG_VIEW && borgCaveFloorGridForKill(ag.feat)) v1 = 0;
    }
  }
  if (g.sleepSpell) v2 = div(v2, d + 2);
  if (kill.confused) v2 = div(v2, 2);
  if (kill.stunned) v2 = div(v2 * 10, 13);
  if (g.confuseSpell) v2 = div(v2, 6);
  if (!fullDamage) {
    const chance = div(facts.freqInnate + facts.freqSpell, 2);
    if (chance < 11) v2 = div(v2 * 4, 10);
    else if (chance < 26) v2 = div(v2 * 6, 10);
    else if (chance < 51) v2 = div(v2 * 8, 10);
  }
  if (v2) {
    const r = q;
    v2 = div(v2 * r, 10);
  }
  let p = Math.max(v1, v2);
  if (p > 2e3) p = 2e3;
  return p;
}
function borgCaveFloorGridForKill(feat) {
  return feat === FEAT.NONE || feat === FEAT.FLOOR || feat === FEAT.OPEN || feat === FEAT.MORE || feat === FEAT.LESS || feat === FEAT.BROKEN || feat === FEAT.PASS_RUBBLE || feat === FEAT.LAVA;
}
function borgDanger(ctx, y, x, c, average, fullDamage) {
  void fullDamage;
  const world = ctx.world;
  const st2 = getDangerState(world);
  st2.maxRange = ctx.view.constants().maxRange ?? 20;
  let p = 0;
  if (x < 0 || x >= AUTO_MAX_X || y < 0 || y >= AUTO_MAX_Y) return 2e3;
  const cdepth = trait2(world, 105 /* CDEPTH */);
  const isVaultHere = false;
  if (!isVaultHere && cdepth <= 80) {
    p += st2.fear.region(y, x) * c;
  }
  if (cdepth === 100 && p >= 300) p = 300;
  if (world.self.timeThisPanel <= 200 && !isVaultHere) {
    p += st2.fear.monsters(y, x) * c;
  }
  const forcedFull = true;
  for (const [i] of world.kills.entries()) {
    p += borgDangerOneKill(ctx, y, x, c, i, average, forcedFull);
  }
  return p > 2e3 ? 2e3 : p;
}
function borgUpdateMonsterFear(ctx) {
  const world = ctx.world;
  const st2 = getDangerState(world);
  const g = st2.globals;
  for (const row of st2.fear.monsters2d) row.fill(0);
  const px = world.self.c.x;
  const py = world.self.c.y;
  for (const [i, kill] of world.kills.entries()) {
    if (g.resolveFacts(ctx, i).flags.has("NEVER_MOVE")) continue;
    if (borgDistance(kill.pos.y, kill.pos.x, py, px) >= 20) continue;
    const p = Math.trunc(borgDanger(ctx, kill.pos.y, kill.pos.x, 1, false, false) / 10);
    borgFearGrid(world, g, st2.fear, kill.pos.y, kill.pos.x, p);
  }
}

// src/flow/flow.ts
var W = AUTO_MAX_X;
var H = AUTO_MAX_Y;
var DATA_SIZE = W * H;
function dataIdx(x, y) {
  return y * W + x;
}
var BorgTrack = class {
  x;
  y;
  num = 0;
  size;
  constructor(size) {
    this.size = size;
    this.x = new Array(size).fill(0);
    this.y = new Array(size).fill(0);
  }
  add(y, x) {
    if (this.num >= this.size) return;
    this.x[this.num] = x;
    this.y[this.num] = y;
    this.num += 1;
  }
  wipe() {
    this.num = 0;
  }
};
function defaultFlowHooks() {
  return {
    danger: () => 0,
    canDigMagic: () => false,
    hasDistanceAttack: () => false,
    layGlyph: () => null,
    forceDescend: false,
    preparedToDescend: () => true,
    countSell: () => 0,
    packFull: () => false,
    monsterHasFlag: () => false,
    dangerOneKill: () => 0,
    los: () => true
  };
}
function createFlowState(hooks = defaultFlowHooks()) {
  const hard = new Uint8Array(DATA_SIZE).fill(255);
  return {
    cost: new Uint8Array(DATA_SIZE),
    flow: new Uint8Array(DATA_SIZE),
    hard,
    know: new Uint8Array(DATA_SIZE),
    icky: new Uint8Array(DATA_SIZE),
    flowX: new Uint8Array(AUTO_FLOW_MAX),
    flowY: new Uint8Array(AUTO_FLOW_MAX),
    flowHead: 0,
    flowTail: 0,
    tempX: new Uint8Array(AUTO_TEMP_MAX),
    tempY: new Uint8Array(AUTO_TEMP_MAX),
    tempN: 0,
    less: new BorgTrack(16),
    more: new BorgTrack(16),
    step: new BorgTrack(100),
    door: new BorgTrack(100),
    closed: new BorgTrack(100),
    glyph: new BorgTrack(200),
    vein: new BorgTrack(100),
    shopX: new Array(9).fill(0),
    shopY: new Array(9).fill(0),
    avoidance: 0,
    borgDesperate: false,
    borgDigging: false,
    borgDangerWipe: false,
    borgTAntisummon: 0,
    borgAsPosition: false,
    borgMorgothPosition: false,
    borgBegan: 0,
    glyphX: 0,
    glyphY: 0,
    glyphXCenter: 0,
    glyphYCenter: 0,
    borgNeedsNewSea: false,
    spasticX: 0,
    spasticY: 0,
    hooks
  };
}
function computeFear(world, flow, townTenths) {
  const av3 = flow.avoidance;
  let fear = 0;
  if (trait(world, 36 /* MAXCLEVEL */) === 50) fear = Math.trunc(av3 * 5 / 10);
  if (trait(world, 36 /* MAXCLEVEL */) !== 50) fear = Math.trunc(av3 * 3 / 10);
  if (world.facts.scaryGuyOnLevel) fear = av3 * 2;
  if (world.facts.uniqueOnLevel && world.facts.vaultOnLevel && trait(world, 36 /* MAXCLEVEL */) === 50)
    fear = av3 * 3;
  if (world.facts.scaryGuyOnLevel && trait(world, 35 /* CLEVEL */) <= 5) fear = av3 * 3;
  if (world.self.goal.ignoring) fear = av3 * 5;
  if (world.clock - flow.borgBegan > 5e3) fear = av3 * 25;
  if (trait(world, 39 /* FOOD */) === 0) fear = av3 * 100;
  if (trait(world, 35 /* CLEVEL */) === 0) fear = Math.trunc(av3 * townTenths / 10);
  return fear;
}
function skipDangerMarking(world, flow) {
  return flow.borgDesperate || world.self.lunalMode || world.self.munchkinMode || flow.borgDigging;
}
function borgCanDig(ctx, flow, checkFail, feat) {
  const w = ctx.world;
  if (trait(w, 109 /* ISHUNGRY */)) return false;
  if (feat === FEAT.PERM || feat === FEAT.LAVA || feat < FEAT.SECRET && feat !== FEAT.CLOSED)
    return false;
  let digCheck;
  if (feat === FEAT.GRANITE || feat === FEAT.CLOSED || feat === FEAT.SECRET) {
    digCheck = BORG_DIG_HARD;
  } else if (feat === FEAT.QUARTZ || feat === FEAT.QUARTZ_K) {
    digCheck = BORG_DIG_MOD;
  } else {
    digCheck = BORG_DIG;
  }
  if (w.self.timesTwitch > 10)
    digCheck -= Math.min(w.self.timesTwitch - 10, 19);
  if (trait(w, 63 /* DIG */) >= digCheck + 20) return true;
  if ((feat === FEAT.RUBBLE || feat === FEAT.PASS_RUBBLE) && !trait(w, 108 /* ISWEAK */))
    return true;
  if (flow.hooks.canDigMagic(w, checkFail)) return true;
  return false;
}
function borgFlowClear(flow) {
  flow.cost.set(flow.hard);
  if (flow.borgDangerWipe) {
    flow.know.fill(0);
    flow.icky.fill(0);
    flow.borgDangerWipe = false;
  }
  flow.flowHead = 0;
  flow.flowTail = 0;
}
function borgFlowEnqueueGrid(ctx, flow, y, x) {
  const w = ctx.world;
  const gi = dataIdx(x, y);
  if (flow.icky[gi]) return;
  if (!flow.know[gi]) {
    flow.know[gi] = 1;
    const p = flow.hooks.danger(w, y, x);
    const fear = computeFear(w, flow, 3);
    if (p > fear && !skipDangerMarking(w, flow)) {
      flow.icky[gi] = 1;
      return;
    }
  }
  if (!flow.cost[gi]) return;
  flow.cost[gi] = 0;
  flow.flowY[flow.flowHead] = y;
  flow.flowX[flow.flowHead] = x;
  const oldHead = flow.flowHead;
  if (++flow.flowHead === AUTO_FLOW_MAX) flow.flowHead = 0;
  if (flow.flowHead === flow.flowTail) flow.flowHead = oldHead;
}
function borgFlowSpread(ctx, flow, depth, optimize, avoid, tunneling, stairIdx, sneak) {
  const w = ctx.world;
  let o = 0;
  let originY = w.self.c.y;
  let originX = w.self.c.x;
  const twitchy = flow.avoidance > trait(w, 27 /* CURHP */);
  if (stairIdx >= 0 && trait(w, 35 /* CLEVEL */) < 15) {
    originY = flow.less.y[stairIdx];
    originX = flow.less.x[stairIdx];
    optimize = false;
  }
  while (flow.flowHead !== flow.flowTail) {
    const x1 = flow.flowX[flow.flowTail];
    const y1 = flow.flowY[flow.flowTail];
    if (++flow.flowTail === AUTO_FLOW_MAX) flow.flowTail = 0;
    const n = flow.cost[dataIdx(x1, y1)] + 1;
    if (n > o) {
      if (optimize && n > flow.cost[dataIdx(originX, originY)]) break;
      if (n > depth) break;
      o = n;
    }
    for (let i = 0; i < 8; i++) {
      let badSneak = false;
      const x = x1 + ddx_ddd[i];
      const y = y1 + ddy_ddd[i];
      if (!inBoundsFully(x, y)) continue;
      const gi = dataIdx(x, y);
      if (flow.cost[gi] <= n) continue;
      const ag = w.map.at(x, y);
      if (sneak && !flow.borgDesperate && !twitchy) {
        for (let ii = 0; ii < 8; ii++) {
          const xx = x + ddx_ddd[ii];
          const yy = y + ddy_ddd[ii];
          if (!inBoundsFully(xx, yy)) continue;
          if (w.map.at(xx, yy).kill) {
            badSneak = true;
            break;
          }
        }
      }
      if (badSneak) continue;
      if (!tunneling && ag.feat >= FEAT.SECRET && ag.feat !== FEAT.PASS_RUBBLE && ag.feat !== FEAT.LAVA)
        continue;
      if (ag.feat === FEAT.PERM) continue;
      if (ag.feat === FEAT.LAVA && !trait(w, 64 /* IFIRE */)) continue;
      if ((avoid || flow.borgDesperate) && ag.feat === FEAT.NONE && !twitchy)
        continue;
      if (ag.kill) {
        if (flow.borgDesperate || w.self.lunalMode || w.self.munchkinMode)
          continue;
        if (trait(w, 113 /* ISAFRAID */)) continue;
        if (!twitchy && trait(w, 39 /* FOOD */) >= 2 && trait(w, 36 /* MAXCLEVEL */) < 5)
          continue;
      }
      if (w.self.goal.shop >= 0 && featIsShop(ag.feat) && ag.store !== w.self.goal.shop && y !== w.self.c.y && x !== w.self.c.x)
        continue;
      if (ag.trap && !ag.glyph && !twitchy) {
        if (trait(w, 27 /* CURHP */) < 60) continue;
        if (trait(w, 54 /* DISP */) < 30 && trait(w, 35 /* CLEVEL */) < 20) continue;
        if (trait(w, 54 /* DISP */) < 45 && trait(w, 35 /* CLEVEL */) < 10) continue;
        if (trait(w, 55 /* DISM */) < 30 && trait(w, 35 /* CLEVEL */) < 20) continue;
        if (trait(w, 55 /* DISM */) < 45 && trait(w, 35 /* CLEVEL */) < 10) continue;
      }
      if (flow.icky[gi]) continue;
      if (!flow.know[gi]) {
        flow.know[gi] = 1;
        if (!skipDangerMarking(w, flow)) {
          const p = flow.hooks.danger(w, y, x);
          const fear = computeFear(w, flow, 3);
          if (p > fear) {
            flow.icky[gi] = 1;
            continue;
          }
        }
      }
      flow.cost[gi] = n;
      flow.flowX[flow.flowHead] = x;
      flow.flowY[flow.flowHead] = y;
      const oldHead = flow.flowHead;
      if (++flow.flowHead === AUTO_FLOW_MAX) flow.flowHead = 0;
      if (flow.flowHead === flow.flowTail) flow.flowHead = oldHead;
    }
  }
  flow.flowHead = 0;
  flow.flowTail = 0;
}
function borgFlowCommit(ctx, flow, why) {
  const w = ctx.world;
  const cost = flow.cost[dataIdx(w.self.c.x, w.self.c.y)];
  if (cost >= 250) return false;
  flow.flow.set(flow.cost);
  w.self.goal.type = why;
  return true;
}
function borgPlayStep(ctx, flow, y2, x2) {
  const w = ctx.world;
  const act = ctx.act;
  const cy = w.self.c.y;
  const cx = w.self.c.x;
  if (w.facts.breederLevel) {
    let oY = 0;
    let oX = 0;
    let doorFound = 0;
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        if (oy + cy === cy && ox + cx === cx) continue;
        if (!w.map.inBounds(cx + ox, cy + oy)) continue;
        const ag2 = w.map.at(cx + ox, cy + oy);
        if (ag2.feat !== FEAT.OPEN) continue;
        if (ag2.kill) continue;
        if (flow.door.num >= 255) continue;
        if (oy + cy === y2 && ox + cx === x2) continue;
        oY = oy;
        oX = ox;
        doorFound++;
      }
    }
    if (doorFound) {
      const dir2 = borgGotoDir(w, cy, cx, cy + oY, cx + oX);
      const x3 = cx + ddx[dir2];
      const y3 = cy + ddy[dir2];
      w.self.goal.g.x = x3;
      w.self.goal.g.y = y3;
      let known = false;
      for (let i = 0; i < flow.door.num; i++) {
        if (flow.door.x[i] === x3 && flow.door.y[i] === y3) {
          known = true;
          break;
        }
      }
      if (!known) flow.door.add(y3, x3);
      return act.close(dir2);
    }
  }
  if (w.self.goal.less) {
    const ag2 = w.map.at(cx, cy);
    if (ag2.feat === FEAT.LESS && !flow.hooks.forceDescend) {
      w.self.goal.less = false;
      return act.ascend();
    }
  }
  const dir = borgGotoDir(w, cy, cx, y2, x2);
  if (dir === 5) return null;
  const x = cx + ddx[dir];
  const y = cy + ddy[dir];
  if (!w.map.inBounds(x, y)) return null;
  const ag = w.map.at(x, y);
  w.self.goal.g.x = x;
  w.self.goal.g.y = y;
  if (ag.kill) {
    const kill = w.kills.at(ag.kill);
    if (kill.rIdx === 0) return null;
    if (trait(w, 113 /* ISAFRAID */) || trait(w, 186 /* CRSFEAR */)) return null;
    if (trait(w, 105 /* CDEPTH */) === 0 && trait(w, 35 /* CLEVEL */) < 5) {
      return null;
    }
    return act.melee(dir);
  }
  if (ag.take && w.takes.has(ag.take)) {
    w.takes.delete(ag.take);
    ag.take = 0;
    return act.move(dir);
  }
  if (ag.glyph) return act.move(dir);
  if (trait(w, 26 /* LIGHT */) && !trait(w, 112 /* ISBLIND */) && !trait(w, 114 /* ISCONFUSED */) && !w.facts.scaryGuyOnLevel && ag.trap) {
    ag.trap = false;
    return act.disarm(dir);
  }
  if (ag.feat === FEAT.CLOSED) {
    if (ctx.rng.randint0(100) === 0) return null;
    for (let i = 0; i < 8; i++) {
      const ax = cx + ddx_ddd[i];
      const ay = cy + ddy_ddd[i];
      if (!w.map.inBounds(ax, ay)) continue;
      const ag2 = w.map.at(ax, ay);
      if (ag2.kill && trait(w, 35 /* CLEVEL */) < 15 && !trait(w, 113 /* ISAFRAID */))
        return null;
    }
    if (flow.closed.num) flow.closed.wipe();
    return act.open(dir);
  }
  if (ag.feat === FEAT.PERM) return null;
  if (ag.feat === FEAT.LAVA && !trait(w, 64 /* IFIRE */)) return null;
  if (ag.feat >= FEAT.SECRET && ag.feat <= FEAT.GRANITE) {
    if (ag.feat !== FEAT.RUBBLE && w.self.goal.type === GOAL_DARK) return null;
    if (!borgCanDig(ctx, flow, false, ag.feat)) {
      w.self.goal.type = 0;
      return null;
    }
    flow.vein.wipe();
    return act.tunnel(dir);
  }
  if (featIsShop(ag.feat)) {
    return act.move(dir);
  }
  w.self.inShop = false;
  return act.move(dir);
}
function borgFlowOld(ctx, flow, why) {
  const w = ctx.world;
  if (w.self.goal.type === why) {
    let bN = 0;
    let bI = -1;
    let bC = flow.flow[dataIdx(w.self.c.x, w.self.c.y)] * 10;
    bC = bC - 5;
    for (let i = 0; i < 8; i++) {
      const x = w.self.c.x + ddx_ddd[i];
      const y = w.self.c.y + ddy_ddd[i];
      if (!w.map.inBounds(x, y)) continue;
      const c = flow.flow[dataIdx(x, y)] * 10;
      if (c > bC) continue;
      if (x > AUTO_MAX_X - 1 || x < 1 || y > AUTO_MAX_Y - 1 || y < 1) continue;
      if (c < bC) bN = 0;
      if (trait(w, 105 /* CDEPTH */) === 0 && ++bN >= 2 && ctx.rng.randint0(bN) !== 0)
        continue;
      else if (trait(w, 105 /* CDEPTH */) >= 1 && ++bN >= 2) continue;
      if (w.self.goal.type === GOAL_DIGGING && (ddx_ddd[i] === 0 || ddy_ddd[i] === 0)) {
        if (distance2(w.self.c.x, w.self.c.y, flow.flowX[0], flow.flowY[0]) <= 2)
          continue;
      }
      bI = i;
      bC = c;
    }
    if (bI >= 0) {
      const x = w.self.c.x + ddx_ddd[bI];
      const y = w.self.c.y + ddy_ddd[bI];
      const cmd = borgPlayStep(ctx, flow, y, x);
      if (cmd) return cmd;
    }
    if (w.self.goal.type === GOAL_DIGGING && w.self.c.y === flow.flowY[0] && w.self.c.x === flow.flowX[0])
      flow.borgTAntisummon = w.clock;
    w.self.goal.type = 0;
  }
  return null;
}

// src/item/deps.ts
function trait3(ctx, bi) {
  return ctx.world.self.trait[bi] ?? 0;
}
function canRest(d) {
  return d?.canRest ?? true;
}
function equipsItem(act, checkCharge, d) {
  return d?.equipsItem ? d.equipsItem(act, checkCharge) : false;
}
function activateHandle(act, d) {
  return d?.activateItem ? d.activateItem(act) : null;
}
function danger(d) {
  return d?.danger ?? 0;
}
function avoidance(d) {
  return d?.avoidance ?? 0;
}
function itemLevel(item, d) {
  return d?.itemLevel ? d.itemLevel(item) : 0;
}
function isAware(item, d) {
  return d?.isAware ? d.isAware(item) : item.aware;
}
function isIdent(item, d) {
  return d?.isIdent ? d.isIdent(item) : true;
}
function needsIdent(item, d) {
  return d?.needsIdent ? d.needsIdent(item) : false;
}
function itemValue(item, d) {
  if (d?.itemValue) return d.itemValue(item);
  return item.value ?? 0;
}
function clockOf(ctx, d) {
  return d?.clock ?? ctx.world.clock;
}
function borgSlot(ctx, tval, sval, d) {
  let best = null;
  for (const item of ctx.view.inventory()) {
    if (item.number <= 0) continue;
    if (!isAware(item, d)) continue;
    if (item.tval !== tval) continue;
    if (item.sval !== sval) continue;
    if (best) {
      if (item.number > best.number) continue;
      if (item.pval < best.pval && item.number > best.number) continue;
    }
    best = item;
  }
  return best;
}
function hasSlot(ctx, tval, sval, d) {
  return borgSlot(ctx, tval, sval, d) !== null;
}
function deviceFail(ctx, lev) {
  let skill = trait3(ctx, 56 /* DEV */);
  if (trait3(ctx, 114 /* ISCONFUSED */)) skill = Math.trunc(skill * 75 / 100);
  const numerator = skill - lev - (141 - 1);
  let denominator = lev - skill - (100 - 10);
  if (denominator === 0) denominator = numerator > 0 ? 1 : -1;
  return Math.trunc(100 * numerator / denominator);
}

// src/item/magic.ts
var BORG_MAGIC_LOST = 1;
var BORG_MAGIC_HIGH = 2;
var BORG_MAGIC_OKAY = 3;
var BORG_MAGIC_TEST = 4;
var BORG_MAGIC_KNOW = 5;
var R = (rating, spell) => ({ rating, spell });
var RATINGS_MAGE = [
  R(95, 0 /* MAGIC_MISSILE */),
  R(65, 1 /* LIGHT_ROOM */),
  R(85, 2 /* FIND_TRAPS_DOORS_STAIRS */),
  R(95, 3 /* PHASE_DOOR */),
  R(85, 4 /* ELECTRIC_ARC */),
  R(85, 5 /* DETECT_MONSTERS */),
  R(75, 6 /* FIRE_BALL */),
  R(65, 7 /* RECHARGING */),
  R(95, 8 /* IDENTIFY_RUNE */),
  R(5, 9 /* TREASURE_DETECTION */),
  R(75, 10 /* FROST_BOLT */),
  R(85, 11 /* REVEAL_MONSTERS */),
  R(75, 12 /* ACID_SPRAY */),
  R(95, 13 /* DISABLE_TRAPS_DESTROY_DOORS */),
  R(95, 14 /* TELEPORT_SELF */),
  R(75, 15 /* TELEPORT_OTHER */),
  R(90, 16 /* RESISTANCE */),
  R(5, 17 /* TAP_MAGICAL_ENERGY */),
  R(95, 18 /* MANA_CHANNEL */),
  R(65, 19 /* DOOR_CREATION */),
  R(95, 20 /* MANA_BOLT */),
  R(65, 21 /* TELEPORT_LEVEL */),
  R(95, 22 /* DETECTION */),
  R(95, 23 /* DIMENSION_DOOR */),
  R(55, 24 /* THRUST_AWAY */),
  R(85, 25 /* SHOCK_WAVE */),
  R(85, 26 /* EXPLOSION */),
  R(75, 27 /* BANISHMENT */),
  R(65, 28 /* MASS_BANISHMENT */),
  R(75, 29 /* MANA_STORM */)
];
var RATINGS_DRUID = [
  R(95, 30 /* DETECT_LIFE */),
  R(5, 31 /* FOX_FORM */),
  R(85, 32 /* REMOVE_HUNGER */),
  R(95, 33 /* STINKING_CLOUD */),
  R(55, 34 /* CONFUSE_MONSTER */),
  R(65, 35 /* SLOW_MONSTER */),
  R(55, 36 /* CURE_POISON */),
  R(60, 37 /* RESIST_POISON */),
  R(80, 38 /* TURN_STONE_TO_MUD */),
  R(80, 39 /* SENSE_SURROUNDINGS */),
  R(85, 40 /* LIGHTNING_STRIKE */),
  R(70, 41 /* EARTH_RISING */),
  R(55, 42 /* TRANCE */),
  R(80, 43 /* MASS_SLEEP */),
  R(5, 44 /* BECOME_PUKEL_MAN */),
  R(5, 45 /* EAGLES_FLIGHT */),
  R(5, 46 /* BEAR_FORM */),
  R(80, 47 /* TREMOR */),
  R(90, 48 /* HASTE_SELF */),
  R(95, 49 /* REVITALIZE */),
  R(55, 50 /* RAPID_REGENERATION */),
  R(90, 51 /* HERBAL_CURING */),
  R(90, 52 /* METEOR_SWARM */),
  R(90, 53 /* RIFT */),
  R(85, 54 /* ICE_STORM */),
  R(60, 55 /* VOLCANIC_ERUPTION */),
  R(90, 56 /* RIVER_OF_LIGHTNING */)
];
var RATINGS_PRIEST = [
  R(65, 57 /* CALL_LIGHT */),
  R(85, 58 /* DETECT_EVIL */),
  R(65, 59 /* MINOR_HEALING */),
  R(85, 60 /* BLESS */),
  R(75, 61 /* SENSE_INVISIBLE */),
  R(75, 62 /* HEROISM */),
  R(95, 63 /* ORB_OF_DRAINING */),
  R(75, 64 /* SPEAR_OF_LIGHT */),
  R(65, 65 /* DISPEL_UNDEAD */),
  R(65, 66 /* DISPEL_EVIL */),
  R(85, 67 /* PROTECTION_FROM_EVIL */),
  R(85, 68 /* REMOVE_CURSE */),
  R(85, 69 /* PORTAL */),
  R(75, 70 /* REMEMBRANCE */),
  R(95, 71 /* WORD_OF_RECALL */),
  R(95, 72 /* HEALING */),
  R(75, 73 /* RESTORATION */),
  R(85, 74 /* CLAIRVOYANCE */),
  R(75, 75 /* ENCHANT_WEAPON */),
  R(75, 76 /* ENCHANT_ARMOUR */),
  R(75, 77 /* SMITE_EVIL */),
  R(95, 78 /* GLYPH_OF_WARDING */),
  R(85, 79 /* DEMON_BANE */),
  R(85, 80 /* BANISH_EVIL */),
  R(75, 81 /* WORD_OF_DESTRUCTION */),
  R(85, 82 /* HOLY_WORD */),
  R(85, 83 /* SPEAR_OF_OROME */),
  R(85, 84 /* LIGHT_OF_MANWE */)
];
var RATINGS_NECROMANCER = [
  R(95, 85 /* NETHER_BOLT */),
  R(85, 61 /* SENSE_INVISIBLE */),
  R(5, 86 /* CREATE_DARKNESS */),
  R(5, 87 /* BAT_FORM */),
  R(85, 88 /* READ_MINDS */),
  R(85, 89 /* TAP_UNLIFE */),
  R(95, 90 /* CRUSH */),
  R(85, 91 /* SLEEP_EVIL */),
  R(95, 92 /* SHADOW_SHIFT */),
  R(25, 93 /* DISENCHANT */),
  R(85, 94 /* FRIGHTEN */),
  R(75, 95 /* VAMPIRE_STRIKE */),
  R(65, 96 /* DISPEL_LIFE */),
  R(65, 97 /* DARK_SPEAR */),
  R(5, 98 /* WARG_FORM */),
  R(65, 99 /* BANISH_SPIRITS */),
  R(95, 100 /* ANNIHILATE */),
  R(85, 101 /* GRONDS_BLOW */),
  R(85, 102 /* UNLEASH_CHAOS */),
  R(75, 103 /* FUME_OF_MORDOR */),
  R(65, 104 /* STORM_OF_DARKNESS */),
  R(5, 105 /* POWER_SACRIFICE */),
  R(5, 106 /* ZONE_OF_UNMAGIC */),
  R(5, 107 /* VAMPIRE_FORM */),
  R(65, 108 /* CURSE */),
  R(5, 109 /* COMMAND */)
];
var RATINGS_PALADIN = [
  R(95, 60 /* BLESS */),
  R(85, 58 /* DETECT_EVIL */),
  R(85, 57 /* CALL_LIGHT */),
  R(95, 59 /* MINOR_HEALING */),
  R(65, 61 /* SENSE_INVISIBLE */),
  R(85, 62 /* HEROISM */),
  R(85, 67 /* PROTECTION_FROM_EVIL */),
  R(65, 68 /* REMOVE_CURSE */),
  R(95, 71 /* WORD_OF_RECALL */),
  R(95, 72 /* HEALING */),
  R(85, 74 /* CLAIRVOYANCE */),
  R(55, 77 /* SMITE_EVIL */),
  R(55, 79 /* DEMON_BANE */),
  R(75, 75 /* ENCHANT_WEAPON */),
  R(85, 76 /* ENCHANT_ARMOUR */),
  R(95, 110 /* SINGLE_COMBAT */)
];
var RATINGS_ROGUE = [
  R(85, 5 /* DETECT_MONSTERS */),
  R(95, 3 /* PHASE_DOOR */),
  R(55, 111 /* OBJECT_DETECTION */),
  R(55, 112 /* DETECT_STAIRS */),
  R(85, 7 /* RECHARGING */),
  R(85, 11 /* REVEAL_MONSTERS */),
  R(95, 14 /* TELEPORT_SELF */),
  R(15, 113 /* HIT_AND_RUN */),
  R(85, 15 /* TELEPORT_OTHER */),
  R(75, 21 /* TELEPORT_LEVEL */)
];
var RATINGS_RANGER = [
  R(95, 32 /* REMOVE_HUNGER */),
  R(85, 30 /* DETECT_LIFE */),
  R(95, 51 /* HERBAL_CURING */),
  R(85, 37 /* RESIST_POISON */),
  R(85, 38 /* TURN_STONE_TO_MUD */),
  R(75, 39 /* SENSE_SURROUNDINGS */),
  R(25, 114 /* COVER_TRACKS */),
  R(85, 115 /* CREATE_ARROWS */),
  R(95, 48 /* HASTE_SELF */),
  R(5, 116 /* DECOY */),
  R(95, 117 /* BRAND_AMMUNITION */)
];
var RATINGS_BLACKGUARD = [
  R(55, 118 /* SEEK_BATTLE */),
  R(95, 119 /* BERSERK_STRENGTH */),
  R(85, 120 /* WHIRLWIND_ATTACK */),
  R(95, 121 /* SHATTER_STONE */),
  R(65, 122 /* LEAP_INTO_BATTLE */),
  R(65, 123 /* GRIM_PURPOSE */),
  R(75, 124 /* MAIM_FOE */),
  R(55, 125 /* HOWL_OF_THE_DAMNED */),
  R(5, 126 /* RELENTLESS_TAUNTING */),
  R(55, 127 /* VENOM */),
  R(5, 128 /* WEREWOLF_FORM */),
  R(5, 129 /* BLOODLUST */),
  R(95, 130 /* UNHOLY_REPRIEVE */),
  R(5, 131 /* FORCEFUL_BLOW */),
  R(95, 132 /* QUAKE */)
];
function ratingsForClass(cls) {
  switch (cls) {
    case CLASS_MAGE:
      return RATINGS_MAGE;
    case CLASS_DRUID:
      return RATINGS_DRUID;
    case CLASS_PRIEST:
      return RATINGS_PRIEST;
    case CLASS_NECROMANCER:
      return RATINGS_NECROMANCER;
    case CLASS_PALADIN:
      return RATINGS_PALADIN;
    case CLASS_ROGUE:
      return RATINGS_ROGUE;
    case CLASS_RANGER:
      return RATINGS_RANGER;
    case CLASS_BLACKGUARD:
      return RATINGS_BLACKGUARD;
    default:
      return null;
  }
}
function classOf(ctx) {
  const t = ctx.world.self.trait[25 /* CLASS */];
  if (t !== void 0 && t !== 0) return t;
  return classIndexFromName(ctx.view.player().cls);
}
function borgGetSpellNumber(ctx, spell) {
  const ratings = ratingsForClass(classOf(ctx));
  if (!ratings) return -1;
  return ratings.findIndex((r) => r.spell === spell);
}
function spellViewBySidx(ctx, sidx) {
  for (const book of ctx.view.spellbooks()) {
    for (const s of book.spells) if (s.sidx === sidx) return s;
  }
  return null;
}
function borgSpellStatus(ctx, s) {
  const clevel = trait3(ctx, 35 /* CLEVEL */) || ctx.view.player().level;
  if (s.forgotten) return BORG_MAGIC_LOST;
  if (clevel < s.level) return BORG_MAGIC_HIGH;
  if (!s.learned) return BORG_MAGIC_OKAY;
  if (!s.worked) return BORG_MAGIC_TEST;
  return BORG_MAGIC_KNOW;
}
function borgBookPossessed(ctx, bidx) {
  const books = ctx.view.spellbooks();
  const book = books[bidx];
  if (!book) return false;
  let svalPos = 0;
  for (let i = 0; i <= bidx; i++) {
    if (books[i] && books[i].tval === book.tval) svalPos++;
  }
  for (const item of ctx.view.inventory()) {
    if (item.number <= 0) continue;
    if (item.tval === book.tval && item.sval === svalPos) return true;
  }
  return false;
}
function borgGetSpellPower(ctx, spell) {
  const sidx = borgGetSpellNumber(ctx, spell);
  if (sidx < 0) return -1;
  const s = spellViewBySidx(ctx, sidx);
  return s ? s.mana : -1;
}
function borgHeroismLevel(ctx) {
  const cls = classOf(ctx);
  if (cls === CLASS_PRIEST) return 20;
  if (cls === CLASS_PALADIN) return 15;
  return 99;
}
function borgSpellLegal(ctx, spell) {
  const sidx = borgGetSpellNumber(ctx, spell);
  if (sidx < 0) return false;
  const s = spellViewBySidx(ctx, sidx);
  if (!s) return false;
  if (!borgBookPossessed(ctx, s.bidx)) return false;
  if (borgSpellStatus(ctx, s) < BORG_MAGIC_TEST) return false;
  if (s.mana > trait3(ctx, 31 /* MAXSP */)) return false;
  return true;
}
function spellHasNourish(spell) {
  return spell === 32 /* REMOVE_HUNGER */ || spell === 51 /* HERBAL_CURING */;
}
function spellHasTeleport(spell) {
  switch (spell) {
    case 3 /* PHASE_DOOR */:
    case 14 /* TELEPORT_SELF */:
    case 69 /* PORTAL */:
    case 23 /* DIMENSION_DOOR */:
    case 92 /* SHADOW_SHIFT */:
    case 113 /* HIT_AND_RUN */:
    case 21 /* TELEPORT_LEVEL */:
      return true;
    default:
      return false;
  }
}
function borgSpellOkay(ctx, spell) {
  const sidx = borgGetSpellNumber(ctx, spell);
  if (sidx < 0) return false;
  const s = spellViewBySidx(ctx, sidx);
  if (!s) return false;
  if (trait3(ctx, 26 /* LIGHT */) <= 0) return false;
  let reserveMana = 0;
  switch (classOf(ctx)) {
    case CLASS_MAGE:
      reserveMana = 6;
      break;
    case CLASS_RANGER:
      reserveMana = 22;
      break;
    case CLASS_ROGUE:
      reserveMana = 20;
      break;
    case CLASS_NECROMANCER:
      reserveMana = 10;
      break;
    case CLASS_PRIEST:
      reserveMana = 8;
      break;
    case CLASS_PALADIN:
      reserveMana = 20;
      break;
    case CLASS_BLACKGUARD:
      reserveMana = 0;
      break;
  }
  if (trait3(ctx, 35 /* CLEVEL */) < 35) reserveMana = 0;
  if (!borgSpellLegal(ctx, spell)) return false;
  if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */)) return false;
  if (s.mana > trait3(ctx, 30 /* CURSP */)) return false;
  if (trait3(ctx, 30 /* CURSP */) - s.mana < reserveMana) {
    if (spellHasNourish(spell)) return true;
    if (spellHasTeleport(spell)) return true;
    if (spell === 0 /* MAGIC_MISSILE */ && trait3(ctx, 105 /* CDEPTH */) <= 35) return true;
    return false;
  }
  return true;
}
function borgSpellFailRate(ctx, spell, playerHas) {
  const sidx = borgGetSpellNumber(ctx, spell);
  if (sidx < 0) return 100;
  const s = spellViewBySidx(ctx, sidx);
  if (!s) return 100;
  let chance = s.fail;
  chance -= 3 * (trait3(ctx, 35 /* CLEVEL */) - s.level);
  chance -= trait3(ctx, 33 /* FAIL1 */);
  if (trait3(ctx, 113 /* ISAFRAID */)) chance += 20;
  let minfail = trait3(ctx, 34 /* FAIL2 */);
  const zeroFail = playerHas ? playerHas("ZERO_FAIL") : classOf(ctx) === CLASS_MAGE;
  if (!zeroFail) {
    if (minfail < 5) minfail = 5;
  }
  if (classOf(ctx) === CLASS_NECROMANCER && borgOnLitGrid(ctx)) {
    chance += 25;
  }
  if (chance < minfail) chance = minfail;
  if (chance > 50) chance = 50;
  if (trait3(ctx, 118 /* ISHEAVYSTUN */)) chance += 25;
  if (trait3(ctx, 117 /* ISSTUN */)) chance += 15;
  if (trait3(ctx, 121 /* ISFORGET */)) chance *= 2;
  if (chance > 95) chance = 95;
  return chance;
}
function borgOnLitGrid(ctx) {
  const { x, y } = ctx.world.self.c;
  if (!ctx.world.map.inBounds(x, y)) return false;
  return (ctx.world.map.at(x, y).info & 18) !== 0;
}
function borgSpellOkayFail(ctx, spell, allowFail, playerHas) {
  if (borgSpellFailRate(ctx, spell, playerHas) > allowFail) return false;
  return borgSpellOkay(ctx, spell);
}
function borgSpellLegalFail(ctx, spell, allowFail, playerHas) {
  if (borgSpellFailRate(ctx, spell, playerHas) > allowFail) return false;
  return borgSpellLegal(ctx, spell);
}
function borgSpell(ctx, spell) {
  if (!borgSpellOkay(ctx, spell)) return null;
  const sidx = borgGetSpellNumber(ctx, spell);
  if (sidx < 0) return null;
  return ctx.act.cast(sidx);
}
function borgSpellFail(ctx, spell, allowFail, playerHas) {
  if (borgSpellFailRate(ctx, spell, playerHas) > allowFail) return null;
  return borgSpell(ctx, spell);
}

// src/flow/flow-stairs.ts
function syncStairsFromMap(ctx, flow) {
  const w = ctx.world;
  flow.less.wipe();
  flow.more.wipe();
  for (let y = 0; y < AUTO_MAX_Y; y++) {
    for (let x = 0; x < AUTO_MAX_X; x++) {
      const feat = w.map.at(x, y).feat;
      if (feat === FEAT.LESS) flow.less.add(y, x);
      else if (feat === FEAT.MORE) flow.more.add(y, x);
    }
  }
}
function borgFlowCostStair(ctx, flow, y, x, bStair) {
  borgFlowClear(flow);
  if (bStair === -1) return 0;
  borgFlowEnqueueGrid(ctx, flow, flow.less.y[bStair], flow.less.x[bStair]);
  borgFlowSpread(ctx, flow, 250, false, false, false, bStair, false);
  const cost = flow.cost[dataIdx(x, y)];
  if (cost === 255) return 0;
  return cost;
}
function borgFlowStairBoth(ctx, flow, why, sneak) {
  const w = ctx.world;
  syncStairsFromMap(ctx, flow);
  if (!flow.less.num && !flow.more.num) return null;
  if (!w.self.goal.fleeing && !w.facts.scaryGuyOnLevel && !flow.less.num && flow.avoidance <= Math.trunc(trait(w, 27 /* CURHP */) * 15 / 10) && (trait(w, 108 /* ISWEAK */) || trait(w, 109 /* ISHUNGRY */) || trait(w, 39 /* FOOD */) < 2))
    return null;
  if (trait(w, 26 /* LIGHT */) === 0 && trait(w, 105 /* CDEPTH */) !== 0 && w.self.munchkinMode === false)
    return null;
  borgFlowClear(flow);
  for (let i = 0; i < flow.less.num; i++) {
    if (w.map.at(flow.less.x[i], flow.less.y[i]).kill) continue;
    borgFlowEnqueueGrid(ctx, flow, flow.less.y[i], flow.less.x[i]);
  }
  for (let i = 0; i < flow.more.num; i++) {
    if (w.map.at(flow.more.x[i], flow.more.y[i]).kill) continue;
    borgFlowEnqueueGrid(ctx, flow, flow.more.y[i], flow.more.x[i]);
  }
  borgFlowSpread(ctx, flow, 250, false, false, false, -1, sneak);
  if (!borgFlowCommit(ctx, flow, why)) return null;
  return borgFlowOld(ctx, flow, why);
}
function borgFlowStairLess(ctx, flow, why, sneak) {
  const w = ctx.world;
  if (flow.hooks.forceDescend) return null;
  syncStairsFromMap(ctx, flow);
  if (!flow.less.num) return null;
  borgFlowClear(flow);
  for (let i = 0; i < flow.less.num; i++) {
    if (w.map.at(flow.less.x[i], flow.less.y[i]).kill) continue;
    borgFlowEnqueueGrid(ctx, flow, flow.less.y[i], flow.less.x[i]);
  }
  if (trait(w, 35 /* CLEVEL */) > 35 || trait(w, 26 /* LIGHT */) === 0) {
    borgFlowSpread(ctx, flow, 250, true, false, false, -1, sneak);
  } else {
    borgFlowSpread(ctx, flow, 250, false, !flow.borgDesperate, false, -1, sneak);
  }
  if (!borgFlowCommit(ctx, flow, why)) return null;
  return borgFlowOld(ctx, flow, why);
}
function borgFlowStairMore(ctx, flow, why, sneak, brave) {
  const w = ctx.world;
  syncStairsFromMap(ctx, flow);
  if (!flow.more.num) return null;
  if (flow.less.num) {
    if (!w.self.lunalMode && !w.self.munchkinMode && !brave && !flow.hooks.preparedToDescend(w))
      return null;
    if (!brave && trait(w, 105 /* CDEPTH */) && !w.facts.scaryGuyOnLevel && (trait(w, 108 /* ISWEAK */) || trait(w, 109 /* ISHUNGRY */) || trait(w, 39 /* FOOD */) < 2))
      return null;
    if (trait(w, 105 /* CDEPTH */) && trait(w, 35 /* CLEVEL */) < 25 && trait(w, 45 /* GOLD */) < 25e3 && flow.hooks.countSell(w) >= 13 && !w.self.munchkinMode)
      return null;
    if (trait(w, 26 /* LIGHT */) === 0 && w.self.munchkinMode === false) return null;
  }
  if (w.self.goal.recalling) return null;
  borgFlowClear(flow);
  for (let i = 0; i < flow.more.num; i++) {
    if (w.map.at(flow.more.x[i], flow.more.y[i]).kill) continue;
    borgFlowEnqueueGrid(ctx, flow, flow.more.y[i], flow.more.x[i]);
  }
  borgFlowSpread(ctx, flow, 250, true, false, false, -1, sneak);
  if (!borgFlowCommit(ctx, flow, why)) return null;
  return borgFlowOld(ctx, flow, why);
}
function borgPrepLeaveLevelSpells(ctx) {
  const w = ctx.world;
  const self = w.self;
  const temp = self.temp;
  if (self.goal.fleeing) return null;
  if (trait(w, 30 /* CURSP */) < Math.trunc(trait(w, 31 /* MAXSP */) * 6 / 10)) return null;
  if (!temp.fast) {
    const cmd = borgSpellFail(ctx, 48 /* HASTE_SELF */, 15);
    if (cmd) {
      self.noRestPrep = 5e3;
      return cmd;
    }
  }
  if (Number(temp.resFire) + Number(temp.resAcid) + Number(temp.resElec) + Number(temp.resCold) < 3) {
    const cmd = borgSpellFail(ctx, 16 /* RESISTANCE */, 15);
    if (cmd) {
      self.noRestPrep = 21e3;
      return cmd;
    }
  }
  if (!temp.fastcast) {
    const cmd = borgSpellFail(ctx, 18 /* MANA_CHANNEL */, 15);
    if (cmd) {
      self.noRestPrep = 6e3;
      return cmd;
    }
  }
  if (!temp.berserk) {
    const cmd = borgSpellFail(ctx, 119 /* BERSERK_STRENGTH */, 15);
    if (cmd) {
      self.noRestPrep = 1e4;
      return cmd;
    }
  }
  if (!temp.hero && trait(w, 35 /* CLEVEL */) > borgHeroismLevel(ctx)) {
    const cmd = borgSpellFail(ctx, 62 /* HEROISM */, 15);
    if (cmd) {
      self.noRestPrep = 3e3;
      return cmd;
    }
  }
  if (!temp.regen) {
    const cmd = borgSpellFail(ctx, 50 /* RAPID_REGENERATION */, 15);
    if (cmd) {
      self.noRestPrep = 6e3;
      return cmd;
    }
  }
  if (!temp.smiteEvil && !trait(w, 194 /* WS_EVIL */)) {
    const cmd = borgSpellFail(ctx, 77 /* SMITE_EVIL */, 15);
    if (cmd) {
      self.noRestPrep = 21e3;
      return cmd;
    }
  }
  if (!temp.venom && !trait(w, 209 /* WB_POIS */)) {
    const cmd = borgSpellFail(ctx, 127 /* VENOM */, 15);
    if (cmd) {
      self.noRestPrep = 18e3;
      return cmd;
    }
  }
  return null;
}

// src/flow/flow-misc.ts
function borgGetLeash(ctx, flow, pickUp) {
  const w = ctx.world;
  let leash = 250;
  if (pickUp && trait(w, 35 /* CLEVEL */) < 20) leash = trait(w, 35 /* CLEVEL */) * 3 + 9;
  if (!pickUp && trait(w, 105 /* CDEPTH */) >= trait(w, 35 /* CLEVEL */) - 5)
    leash = trait(w, 35 /* CLEVEL */) * 3 + 9;
  if (w.self.timesTwitch > 21) leash += w.self.timesTwitch;
  return leash;
}
function borgFlowReverse(ctx, flow, depth, optimize, avoid, tunneling, stairIdx, sneak) {
  borgFlowClear(flow);
  borgFlowEnqueueGrid(ctx, flow, ctx.world.self.c.y, ctx.world.self.c.x);
  borgFlowSpread(ctx, flow, depth, optimize, avoid, tunneling, stairIdx, sneak);
}
function borgFlowFarFromStairsDist(ctx, flow, x, y, bStair, dist4) {
  const w = ctx.world;
  if (trait(w, 105 /* CDEPTH */) >= trait(w, 35 /* CLEVEL */) - 5 && trait(w, 35 /* CLEVEL */) < 20) {
    const cost = borgFlowCostStair(ctx, flow, y, x, bStair);
    if (cost > dist4) return true;
  }
  return false;
}
function borgFlowFarFromStairs(ctx, flow, x, y, bStair) {
  return borgFlowFarFromStairsDist(ctx, flow, x, y, bStair, borgGetLeash(ctx, flow, false));
}
function nearestUpStair(ctx, flow) {
  const w = ctx.world;
  let bStair = -1;
  let bJ = -1;
  for (let i = 0; i < flow.less.num; i++) {
    const j = distance2(w.self.c.x, w.self.c.y, flow.less.x[i], flow.less.y[i]);
    if (bJ >= j) continue;
    bJ = j;
    bStair = i;
  }
  return bStair;
}
function borgHappyGridBold(ctx, flow, y, x) {
  const w = ctx.world;
  const fl = (yy, xx) => borgCaveFloorBold(w, yy, xx);
  if (y >= AUTO_MAX_Y - 2 || y <= 2 || x >= AUTO_MAX_X - 2 || x <= 2) return false;
  const ag = w.map.at(x, y);
  if (ag.feat === FEAT.LESS) return true;
  if (ag.feat === FEAT.MORE) return true;
  if (ag.glyph) return true;
  if (ag.feat === FEAT.LAVA && !trait(w, 64 /* IFIRE */)) return false;
  if (trait(w, 108 /* ISWEAK */) || trait(w, 26 /* LIGHT */) === 0) return false;
  if (w.clock - flow.borgBegan >= 2e3) return false;
  if (fl(y - 1, x) && fl(y + 1, x) && !fl(y, x - 1) && !fl(y, x + 1) && !fl(y + 1, x - 1) && !fl(y + 1, x + 1) && !fl(y - 1, x - 1) && !fl(y - 1, x + 1))
    return true;
  if (fl(y, x - 1) && fl(y, x + 1) && !fl(y - 1, x) && !fl(y + 1, x) && !fl(y + 1, x - 1) && !fl(y + 1, x + 1) && !fl(y - 1, x - 1) && !fl(y - 1, x + 1))
    return true;
  if (fl(y - 1, x) && fl(y + 1, x) && !fl(y, x - 1) && !fl(y, x + 1)) return true;
  if (fl(y, x - 1) && fl(y, x + 1) && !fl(y - 1, x) && !fl(y + 1, x)) return true;
  if (!fl(y - 1, x) && fl(y - 1, x - 1) && fl(y - 1, x + 1) && fl(y - 2, x)) return true;
  if (!fl(y + 1, x) && fl(y + 1, x - 1) && fl(y + 1, x + 1) && fl(y + 2, x)) return true;
  if (!fl(y, x + 1) && fl(y - 1, x + 1) && fl(y + 1, x + 1) && fl(y, x + 2)) return true;
  if (!fl(y, x - 1) && fl(y - 1, x - 1) && fl(y + 1, x - 1) && fl(y, x - 2)) return true;
  for (let i = 0; i < flow.step.num; i++) {
    if (flow.step.y[i] === y && flow.step.x[i] === x && i < 25) return true;
  }
  return false;
}
function borgCheckRest(ctx, flow, y, x) {
  const w = ctx.world;
  if (w.self.whenLastKillMult > w.clock - 4 && w.self.whenLastKillMult <= w.clock)
    return false;
  w.self.whenLastKillMult = 0;
  const t = w.self.temp;
  if ((t.bless || t.hero || t.berserk || t.fastcast || t.regen || t.smiteEvil) && !w.self.munchkinMode && trait(w, 27 /* CURHP */) >= Math.trunc(trait(w, 28 /* MAXHP */) * 8 / 10) && trait(w, 30 /* CURSP */) >= Math.trunc(trait(w, 31 /* MAXSP */) * 7 / 10))
    return false;
  if (w.self.noRestPrep >= 1 && !w.self.munchkinMode && trait(w, 30 /* CURSP */) > Math.trunc(trait(w, 31 /* MAXSP */) / 4) && trait(w, 105 /* CDEPTH */) < 85)
    return false;
  if (w.map.at(x, y).feat === FEAT.LAVA && !trait(w, 64 /* IFIRE */)) return false;
  const fear = getFearCaches(w);
  if (fear.region(y, x) > Math.trunc(trait(w, 27 /* CURHP */) / 20) && trait(w, 105 /* CDEPTH */) !== 100)
    return false;
  if (fear.monsters(y, x) > Math.trunc(trait(w, 27 /* CURHP */) / 10) && trait(w, 105 /* CDEPTH */) !== 100)
    return false;
  if (flow.hooks.danger(w, y, x) > Math.trunc(trait(w, 27 /* CURHP */) / 40) && trait(w, 105 /* CDEPTH */) >= 85)
    return false;
  if ((trait(w, 26 /* LIGHT */) === 0 || trait(w, 108 /* ISWEAK */) || trait(w, 39 /* FOOD */) < 2) && !w.self.munchkinMode)
    return false;
  for (const [i, kill] of w.kills.entries()) {
    const x9 = kill.pos.x;
    const y9 = kill.pos.y;
    const ax = Math.abs(x9 - x);
    const ay = Math.abs(y9 - y);
    const d = Math.max(ax, ay);
    const has2 = (f) => flow.hooks.monsterHasFlag(w, i, f);
    if (d > 20) continue;
    if (d < 2 && !has2("NEVER_MOVE")) return false;
    if (d === 1) return false;
    if (d < 10 && has2("MULTIPLY")) return false;
    if (!kill.awake && d > 8 && !w.self.munchkinMode) continue;
    const p = flow.hooks.dangerOneKill(w, y9, x9, i);
    if (d < 5 && p > Math.trunc(flow.avoidance / 3) && !w.self.munchkinMode)
      return false;
    if (flow.hooks.los(w, y9, x9, y, x) && kill.rangedAttack) return false;
    if (w.self.munchkinMode && flow.hooks.los(w, y9, x9, y, x) && kill.awake && !has2("NEVER_MOVE"))
      return false;
    if (has2("PASS_WALL")) return false;
    if (has2("KILL_WALL")) return false;
  }
  return true;
}
function borgFlowRecover(ctx, flow, dist4) {
  const w = ctx.world;
  if (w.self.timeThisPanel > 500) return null;
  if (trait(w, 35 /* CLEVEL */) <= 5) return null;
  const caster = trait(w, 31 /* MAXSP */) > 0;
  if (caster) {
    if (trait(w, 27 /* CURHP */) > Math.trunc(trait(w, 28 /* MAXHP */) / 3) && (trait(w, 30 /* CURSP */) > Math.trunc(trait(w, 31 /* MAXSP */) / 4) || trait(w, 31 /* MAXSP */) === 0) && !trait(w, 116 /* ISCUT */) && !trait(w, 117 /* ISSTUN */) && !trait(w, 118 /* ISHEAVYSTUN */) && !trait(w, 113 /* ISAFRAID */))
      return null;
  } else {
    if (trait(w, 27 /* CURHP */) > Math.trunc(trait(w, 28 /* MAXHP */) / 3) && !trait(w, 116 /* ISCUT */) && !trait(w, 117 /* ISSTUN */) && !trait(w, 118 /* ISHEAVYSTUN */) && !trait(w, 113 /* ISAFRAID */))
      return null;
  }
  if (w.self.goal.fleeing) return null;
  if (w.self.lunalMode || w.self.munchkinMode) return null;
  if (trait(w, 109 /* ISHUNGRY */)) return null;
  flow.tempN = 0;
  for (let y = w.self.c.y - 25; y < w.self.c.y + 25; y++) {
    for (let x = w.self.c.x - 25; x < w.self.c.x + 25; x++) {
      if (!w.map.inBounds(x, y)) continue;
      if (y === w.self.c.y && x === w.self.c.x) continue;
      if (distance2(w.self.c.x, w.self.c.y, x, y) < 7) continue;
      if (!borgHappyGridBold(ctx, flow, y, x)) continue;
      const feat = w.map.at(x, y).feat;
      if (feat >= FEAT.SECRET && feat !== FEAT.PASS_RUBBLE) continue;
      if (!borgCheckRest(ctx, flow, y, x)) continue;
      flow.tempX[flow.tempN] = x;
      flow.tempY[flow.tempN] = y;
      flow.tempN++;
    }
  }
  if (!flow.tempN) return null;
  borgFlowClear(flow);
  for (let i = 0; i < flow.tempN; i++) {
    borgFlowEnqueueGrid(ctx, flow, flow.tempY[i], flow.tempX[i]);
  }
  borgFlowSpread(ctx, flow, dist4, false, true, false, -1, false);
  if (!borgFlowCommit(ctx, flow, GOAL_RECOVER)) return null;
  return borgFlowOld(ctx, flow, GOAL_RECOVER);
}
function borgFlowVein(ctx, flow, viewable, nearness) {
  const w = ctx.world;
  if (!flow.vein.num) return null;
  if (trait(w, 45 /* GOLD */) >= 1e5) return null;
  let minFeat = FEAT.QUARTZ_K;
  if (w.self.timesTwitch > 21) minFeat = FEAT.MAGMA_K;
  if (!borgCanDig(ctx, flow, true, minFeat)) return null;
  flow.tempN = 0;
  syncStairsFromMap(ctx, flow);
  const bStair = nearestUpStair(ctx, flow);
  const leash = borgGetLeash(ctx, flow, true);
  for (let i = 0; i < flow.vein.num; i++) {
    const x = flow.vein.x[i];
    const y = flow.vein.y[i];
    const ag = w.map.at(x, y);
    if (viewable && !(ag.info & BORG_VIEW)) continue;
    borgFlowClear(flow);
    if (nearness > 5 && trait(w, 35 /* CLEVEL */) < 20) {
      const cost = borgFlowCostStair(ctx, flow, y, x, bStair);
      if (cost > leash) continue;
    }
    flow.tempX[flow.tempN] = x;
    flow.tempY[flow.tempN] = y;
    flow.tempN++;
  }
  if (!flow.tempN) return null;
  borgFlowClear(flow);
  for (let i = 0; i < flow.tempN; i++) {
    borgFlowEnqueueGrid(ctx, flow, flow.tempY[i], flow.tempX[i]);
  }
  borgFlowSpread(ctx, flow, nearness, true, !viewable, false, -1, false);
  if (!borgFlowCommit(ctx, flow, GOAL_TAKE)) return null;
  return borgFlowOld(ctx, flow, GOAL_TAKE);
}
function borgFlowShopEntry(ctx, flow, i) {
  const w = ctx.world;
  if (trait(w, 105 /* CDEPTH */)) return null;
  const x = flow.shopX[i];
  const y = flow.shopY[i];
  if (!x || !y) return null;
  if (x === w.self.c.x && y === w.self.c.y) {
    return ctx.act.move(5);
  }
  borgFlowClear(flow);
  borgFlowEnqueueGrid(ctx, flow, y, x);
  borgFlowSpread(ctx, flow, 250, true, false, false, -1, false);
  if (!borgFlowCommit(ctx, flow, GOAL_MISC)) return null;
  return borgFlowOld(ctx, flow, GOAL_MISC);
}
function borgFlowLight(ctx, flow, why) {
  const w = ctx.world;
  flow.tempN = 0;
  for (let y = 0; y < AUTO_MAX_Y; y++) {
    for (let x = 0; x < AUTO_MAX_X; x++) {
      if (!(w.map.at(x, y).info & BORG_GLOW)) continue;
      flow.tempX[flow.tempN] = x;
      flow.tempY[flow.tempN] = y;
      flow.tempN++;
    }
  }
  if (!flow.tempN) return null;
  borgFlowClear(flow);
  for (let i = 0; i < flow.tempN; i++) {
    borgFlowEnqueueGrid(ctx, flow, flow.tempY[i], flow.tempX[i]);
  }
  borgFlowSpread(ctx, flow, 250, true, false, false, -1, false);
  if (!borgFlowCommit(ctx, flow, why)) return null;
  return borgFlowOld(ctx, flow, why);
}
function borgFlowVault(ctx, flow, nearness) {
  const w = ctx.world;
  flow.tempN = 0;
  if (!w.facts.vaultOnLevel) return null;
  if (!borgCanDig(ctx, flow, false, FEAT.QUARTZ)) return null;
  const canDigHard = borgCanDig(ctx, flow, false, FEAT.GRANITE);
  for (let y = 0; y < AUTO_MAX_Y; y++) {
    for (let x = 0; x < AUTO_MAX_X; x++) {
      if (distance2(w.self.c.x, w.self.c.y, x, y) > nearness) continue;
      const feat = w.map.at(x, y).feat;
      if (feat !== FEAT.RUBBLE && feat !== FEAT.QUARTZ && feat !== FEAT.MAGMA && feat !== FEAT.QUARTZ_K && feat !== FEAT.MAGMA_K) {
        if (!canDigHard || feat !== FEAT.GRANITE) continue;
      }
      for (let i = 0; i < 8; i++) {
        const bx = x + ddx_ddd[i];
        const by = y + ddy_ddd[i];
        if (!inBoundsFully(bx, by)) continue;
        if (w.map.at(bx, by).feat !== FEAT.PERM) continue;
        flow.tempX[flow.tempN] = x;
        flow.tempY[flow.tempN] = y;
        flow.tempN++;
      }
    }
  }
  if (!flow.tempN) return null;
  for (let i = 0; i < flow.tempN; i++) {
    borgFlowEnqueueGrid(ctx, flow, flow.tempY[i], flow.tempX[i]);
  }
  borgFlowSpread(ctx, flow, 250, true, false, false, -1, false);
  if (!borgFlowCommit(ctx, flow, GOAL_VAULT)) return null;
  return borgFlowOld(ctx, flow, GOAL_VAULT);
}
function borgFlowSpastic(ctx, flow, bored) {
  const w = ctx.world;
  if (!trait(w, 105 /* CDEPTH */)) return null;
  if (trait(w, 108 /* ISWEAK */)) return null;
  if (w.clock - flow.borgBegan > 3e3 && flow.avoidance <= trait(w, 27 /* CURHP */)) return null;
  if (!bored) {
    const p = flow.hooks.danger(w, w.self.c.y, w.self.c.x);
    if (p > Math.trunc(flow.avoidance / 4)) return null;
  }
  syncStairsFromMap(ctx, flow);
  let bStair = -1;
  let bJ = -1;
  for (let i = 0; i < flow.less.num; i++) {
    const j = distance2(w.self.c.x, w.self.c.y, flow.less.x[i], flow.less.y[i]);
    if (bJ >= j) continue;
    bJ = j;
    bStair = i;
  }
  if (flow.spasticX === w.self.c.x && flow.spasticY === w.self.c.y) {
    flow.spasticX = 0;
    flow.spasticY = 0;
    for (let i = 0; i < 9; i++) {
      const xx = w.self.c.x + ddx_ddd[i];
      const yy = w.self.c.y + ddy_ddd[i];
      if (!w.map.inBounds(xx, yy)) continue;
      const g = w.map.at(xx, yy);
      if (g.xtra < 100) g.xtra += 5;
    }
    return null;
  }
  borgFlowReverse(ctx, flow, 250, true, false, false, -1, false);
  let bV = -1;
  let bX = w.self.c.x;
  let bY = w.self.c.y;
  for (let y = 1; y < AUTO_MAX_Y - 1; y++) {
    for (let x = 1; x < AUTO_MAX_X - 1; x++) {
      const ag = w.map.at(x, y);
      if (ag.feat === FEAT.NONE) continue;
      if (ag.trap) continue;
      if (!borgCaveFloorGrid(ag)) continue;
      const cost = flow.cost[dataIdx(x, y)];
      if (cost >= 250) continue;
      if (cost >= 25 && trait(w, 35 /* CLEVEL */) < 30) continue;
      if (cost >= 50) continue;
      if (ag.xtra >= 50) continue;
      if (ag.xtra >= trait(w, 35 /* CLEVEL */)) continue;
      if (!bored && ag.xtra > 5) continue;
      if (bStair !== -1 && trait(w, 35 /* CLEVEL */) < 15 && flow.avoidance <= trait(w, 27 /* CURHP */)) {
        const j = distance2(flow.less.x[bStair], flow.less.y[bStair], x, y);
        const bj = distance2(w.self.c.x, w.self.c.y, flow.less.x[bStair], flow.less.y[bStair]);
        if (bj <= trait(w, 35 /* CLEVEL */) * 3 + 9 && j >= trait(w, 35 /* CLEVEL */) * 3 + 9) continue;
        if (trait(w, 35 /* CLEVEL */) <= 3 && bj <= trait(w, 35 /* CLEVEL */) + 9 && j >= trait(w, 35 /* CLEVEL */) + 9) continue;
        if (trait(w, 35 /* CLEVEL */) <= 3 && j >= trait(w, 35 /* CLEVEL */) + 5) continue;
        if (trait(w, 35 /* CLEVEL */) <= 10 && j >= trait(w, 35 /* CLEVEL */) + 9) continue;
      }
      let wall = 0;
      let supp = 0;
      let diag = 0;
      let monsters = 0;
      const feats = [];
      for (let i = 0; i < 8; i++) {
        const xx = x + ddx_ddd[i];
        const yy = y + ddy_ddd[i];
        feats[i] = w.map.inBounds(xx, yy) ? w.map.at(xx, yy).feat : FEAT.GRANITE;
      }
      const killAt2 = (i) => {
        const xx = x + ddx_ddd[i];
        const yy = y + ddy_ddd[i];
        return w.map.inBounds(xx, yy) ? w.map.at(xx, yy).kill : 0;
      };
      for (let i = 0; i < 4; i++) if (feats[i] >= FEAT.GRANITE) wall++;
      if (wall < 1) continue;
      for (let i = 0; i < 4; i++) {
        const f = feats[i];
        if (f === FEAT.RUBBLE) continue;
        if (f >= FEAT.SECRET && f <= FEAT.GRANITE || f === FEAT.OPEN || f === FEAT.BROKEN || f === FEAT.CLOSED)
          supp++;
      }
      for (let i = 4; i < 8; i++) {
        const f = feats[i];
        if (f === FEAT.RUBBLE) continue;
        if (f >= FEAT.SECRET) diag++;
      }
      if (diag < 2) continue;
      for (let i = 0; i < 8; i++) if (killAt2(i)) monsters++;
      if (monsters >= 1) continue;
      let v = supp * 500 + diag * 100 - ag.xtra * 40 - cost * 2 - (w.clock - flow.borgBegan);
      v -= (50 - trait(w, 35 /* CLEVEL */)) * 5;
      if (v <= 0) continue;
      if (!bored && v < 1500) continue;
      if (bV >= 0 && v < bV) continue;
      bV = v;
      bX = x;
      bY = y;
    }
  }
  borgFlowClear(flow);
  if (bV < 0) return null;
  flow.spasticX = bX;
  flow.spasticY = bY;
  borgFlowEnqueueGrid(ctx, flow, bY, bX);
  borgFlowSpread(ctx, flow, 250, true, false, false, -1, false);
  if (!borgFlowCommit(ctx, flow, GOAL_XTRA)) return null;
  return borgFlowOld(ctx, flow, GOAL_XTRA);
}
function borgTwitchy(ctx, flow) {
  const w = ctx.world;
  void flow;
  let dir = 5;
  let count = 20;
  while (true) {
    dir = ctx.rng.randint0(10);
    if (dir === 5 || dir === 0) continue;
    if (!count) break;
    count--;
    const gx = w.self.c.x + ddx[dir];
    const gy = w.self.c.y + ddy[dir];
    w.self.goal.g.x = gx;
    w.self.goal.g.y = gy;
    if (!inBoundsFully(gx, gy)) continue;
    const grid = w.map.at(gx, gy);
    if (grid.feat >= FEAT.SECRET && grid.feat <= FEAT.PERM) continue;
    if (grid.kill && trait(w, 113 /* ISAFRAID */)) continue;
    break;
  }
  if (!count) {
    let allWalls = true;
    for (dir = 1; dir < 10; dir++) {
      if (dir === 5) continue;
      const lx = w.self.c.x + ddx[dir];
      const ly = w.self.c.y + ddy[dir];
      if (!inBoundsFully(lx, ly)) continue;
      const grid = w.map.at(lx, ly);
      if (grid.feat >= FEAT.SECRET && grid.feat <= FEAT.PERM) {
        if (!trait(w, 113 /* ISAFRAID */) || grid.feat === FEAT.PERM) continue;
      }
      if (grid.kill && trait(w, 113 /* ISAFRAID */)) continue;
      allWalls = false;
      break;
    }
    if (allWalls) {
      return ctx.act.rest(REST_COMPLETE);
    }
  }
  if (trait(w, 113 /* ISAFRAID */)) return ctx.act.tunnel(dir);
  return ctx.act.move(dir);
}

// src/flow/flow-take.ts
var QUIVER_SLOT_SIZE = 40;
function borgFlowTake(ctx, flow, viewable, nearness) {
  const w = ctx.world;
  const fullQuiver = trait(w, 53 /* FAST_SHOTS */) ? (QUIVER_SLOT_SIZE - 1) * 2 : QUIVER_SLOT_SIZE - 1;
  if (!w.takes.count || w.takes.count <= 1) return null;
  if (flow.hooks.packFull(w)) return null;
  if (w.facts.scaryGuyOnLevel) return null;
  if (!trait(w, 26 /* LIGHT */)) return null;
  if (flow.borgMorgothPosition) return null;
  flow.tempN = 0;
  syncStairsFromMap(ctx, flow);
  const bStair = nearestUpStair(ctx, flow);
  const bJ = bStair === -1 ? -1 : distance2(w.self.c.x, w.self.c.y, flow.less.x[bStair], flow.less.y[bStair]);
  const leash = borgGetLeash(ctx, flow, true);
  for (const [, take] of w.takes.entries()) {
    const x = take.pos.x;
    const y = take.pos.y;
    if (bStair !== -1 && trait(w, 35 /* CLEVEL */) < 10) {
      const j = distance2(flow.less.x[bStair], flow.less.y[bStair], x, y);
      if (j !== 255 && bJ <= leash && j >= leash) continue;
    }
    if (take.value <= 0) continue;
    const ag = w.map.at(x, y);
    if (viewable && !(ag.info & BORG_VIEW)) continue;
    if (take.tval === trait(w, 152 /* AMMO_TVAL */) && trait(w, 155 /* AMISSILES */) >= fullQuiver)
      continue;
    borgFlowClear(flow);
    if (nearness > 5 && trait(w, 35 /* CLEVEL */) < 20 && borgFlowCostStair(ctx, flow, y, x, bStair) > leash)
      continue;
    flow.tempX[flow.tempN] = x;
    flow.tempY[flow.tempN] = y;
    flow.tempN++;
  }
  if (!flow.tempN) return null;
  borgFlowClear(flow);
  for (let i = 0; i < flow.tempN; i++) {
    borgFlowEnqueueGrid(ctx, flow, flow.tempY[i], flow.tempX[i]);
  }
  borgFlowSpread(ctx, flow, nearness, true, !viewable, false, -1, false);
  if (!borgFlowCommit(ctx, flow, GOAL_TAKE)) return null;
  return borgFlowOld(ctx, flow, GOAL_TAKE);
}
function borgFlowTakeScum(ctx, flow, viewable, nearness) {
  const w = ctx.world;
  if (!w.takes.count || w.takes.count <= 1) return null;
  if (flow.hooks.packFull(w)) return null;
  flow.tempN = 0;
  syncStairsFromMap(ctx, flow);
  const bStair = nearestUpStair(ctx, flow);
  for (const [, take] of w.takes.entries()) {
    const x = take.pos.x;
    const y = take.pos.y;
    const ag = w.map.at(x, y);
    if (take.value <= 0) continue;
    if (viewable && !(ag.info & BORG_VIEW)) continue;
    if (borgFlowFarFromStairs(ctx, flow, x, y, bStair)) continue;
    flow.tempX[flow.tempN] = x;
    flow.tempY[flow.tempN] = y;
    flow.tempN++;
  }
  if (!flow.tempN) return null;
  borgFlowClear(flow);
  for (let i = 0; i < flow.tempN; i++) {
    borgFlowEnqueueGrid(ctx, flow, flow.tempY[i], flow.tempX[i]);
  }
  borgFlowSpread(ctx, flow, nearness, true, !viewable, false, -1, true);
  if (!borgFlowCommit(ctx, flow, GOAL_TAKE)) return null;
  return borgFlowOld(ctx, flow, GOAL_TAKE);
}

// src/flow/flow-kill.ts
function borgFlowKill(ctx, flow, viewable, nearness) {
  const w = ctx.world;
  if (!w.kills.count || w.kills.count <= 1) return null;
  if (trait(w, 105 /* CDEPTH */) === 0 && trait(w, 35 /* CLEVEL */) < 20) return null;
  if ((trait(w, 25 /* CLASS */) === 1 || trait(w, 25 /* CLASS */) === 4) && trait(w, 35 /* CLEVEL */) < (trait(w, 105 /* CDEPTH */) ? 35 : 25))
    return null;
  if (trait(w, 109 /* ISHUNGRY */) || trait(w, 108 /* ISWEAK */) || trait(w, 39 /* FOOD */) === 0)
    return null;
  if (flow.borgMorgothPosition) return null;
  flow.tempN = 0;
  let borgInHall = false;
  let hallWalls = 0;
  for (let hx = -1; hx <= 1; hx++) {
    for (let hy = -1; hy <= 1; hy++) {
      const x = hx + w.self.c.x;
      const y = hy + w.self.c.y;
      if (!w.map.inBounds(x, y)) continue;
      const ag = w.map.at(x, y);
      if (ag.glyph || ag.feat >= FEAT.MAGMA && ag.feat <= FEAT.PERM) hallWalls++;
      if (hallWalls >= 5) borgInHall = true;
    }
  }
  syncStairsFromMap(ctx, flow);
  const bStair = nearestUpStair(ctx, flow);
  const bJ = bStair === -1 ? -1 : distance2(w.self.c.x, w.self.c.y, flow.less.x[bStair], flow.less.y[bStair]);
  for (const [ki, kill] of w.kills.entries()) {
    const x9 = kill.pos.x;
    const y9 = kill.pos.y;
    const ax = Math.abs(x9 - w.self.c.x);
    const ay = Math.abs(y9 - w.self.c.y);
    const d = Math.max(ax, ay);
    let skipMonster = false;
    if (d === 1 && (trait(w, 113 /* ISAFRAID */) || trait(w, 186 /* CRSFEAR */))) continue;
    if (w.self.goal.ignoring && !trait(w, 113 /* ISAFRAID */) && flow.hooks.monsterHasFlag(w, ki, "MULTIPLY"))
      continue;
    if (trait(w, 36 /* MAXCLEVEL */) < 10 && flow.hooks.monsterHasFlag(w, ki, "NEVER_MOVE"))
      continue;
    if (w.facts.scaryGuyOnLevel) continue;
    if (trait(w, 35 /* CLEVEL */) < 10 && flow.hooks.monsterHasFlag(w, ki, "MULTIPLY"))
      continue;
    if (flow.hooks.monsterHasFlag(w, ki, "UNIQUE") && trait(w, 105 /* CDEPTH */) === 0 && trait(w, 35 /* CLEVEL */) < 5)
      continue;
    const x = x9;
    const y = y9;
    const ag = w.map.at(x, y);
    if (viewable && !(ag.info & BORG_VIEW)) continue;
    const p = flow.hooks.danger(w, y, x);
    if (trait(w, 35 /* CLEVEL */) > 25 && !flow.hooks.monsterHasFlag(w, ki, "UNIQUE") && p > Math.trunc(flow.avoidance / 2))
      continue;
    if (trait(w, 35 /* CLEVEL */) <= 15 && p > Math.trunc(flow.avoidance / 3)) continue;
    if (bStair !== -1 && trait(w, 35 /* CLEVEL */) < 10) {
      const j = distance2(flow.less.x[bStair], flow.less.y[bStair], x, y);
      if (bJ <= trait(w, 35 /* CLEVEL */) * 5 + 9 && j >= trait(w, 35 /* CLEVEL */) * 5 + 9)
        continue;
    }
    if (borgInHall && flow.hooks.monsterHasFlag(w, ki, "GROUP_AI")) {
      for (let hx = -1; hx <= 1; hx++) {
        for (let hy = -1; hy <= 1; hy++) {
          if (!w.map.inBounds(hx + x, hy + y)) continue;
          const ag2 = w.map.at(hx + x, hy + y);
          if (ag2.glyph || ag2.feat >= FEAT.MAGMA && ag2.feat <= FEAT.PERM)
            hallWalls++;
          if (hallWalls < 4) skipMonster = true;
        }
      }
    }
    if (d === 2 && !kill.rangedAttack && !flow.hooks.monsterHasFlag(w, ki, "NEVER_MOVE"))
      skipMonster = true;
    if (skipMonster) continue;
    if (borgFlowFarFromStairs(ctx, flow, x, y, bStair)) continue;
    flow.tempX[flow.tempN] = x;
    flow.tempY[flow.tempN] = y;
    flow.tempN++;
  }
  if (!flow.tempN) return null;
  borgFlowClear(flow);
  for (let i = 0; i < flow.tempN; i++) {
    borgFlowEnqueueGrid(ctx, flow, flow.tempY[i], flow.tempX[i]);
  }
  borgFlowSpread(ctx, flow, nearness, true, !viewable, false, -1, false);
  if (!borgFlowCommit(ctx, flow, GOAL_KILL)) return null;
  return borgFlowOld(ctx, flow, GOAL_KILL);
}
function borgFlowKillAim(ctx, flow, viewable) {
  const w = ctx.world;
  if (!w.kills.count || w.kills.count <= 1) return null;
  if (w.self.timeThisPanel > 500) return null;
  if (trait(w, 109 /* ISHUNGRY */) || trait(w, 108 /* ISWEAK */) || trait(w, 39 /* FOOD */) === 0) return null;
  if (flow.hooks.hasDistanceAttack(w)) return null;
  const sy = w.self.c.y;
  const sx = w.self.c.x;
  for (let ox = -2; ox <= 2; ox++) {
    for (let oy = -2; oy <= 2; oy++) {
      if (ox === 0 && oy === 0) continue;
      w.self.c.x = sx + ox;
      w.self.c.y = sy + oy;
      if (w.self.c.x > AUTO_MAX_X - 2 || w.self.c.x < 2 || w.self.c.y > AUTO_MAX_Y - 2 || w.self.c.y < 2)
        continue;
      let adjacent = false;
      for (const [, kill] of w.kills.entries()) {
        if (distance2(w.self.c.x, w.self.c.y, kill.pos.x, kill.pos.y) === 1) {
          adjacent = true;
          break;
        }
      }
      if (adjacent) continue;
      if (flow.hooks.hasDistanceAttack(w)) {
        borgFlowClear(flow);
        borgFlowEnqueueGrid(ctx, flow, w.self.c.y, w.self.c.x);
        w.self.c.x = sx;
        w.self.c.y = sy;
        borgFlowSpread(ctx, flow, 5, true, !viewable, false, -1, false);
        if (!borgFlowCommit(ctx, flow, GOAL_KILL)) return null;
        return borgFlowOld(ctx, flow, GOAL_KILL);
      }
    }
  }
  w.self.c.x = sx;
  w.self.c.y = sy;
  return null;
}
var N_ARRAY = [1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 1, 1, 1];
var NY = [-4, -4, -4, -4, -4, -3, -3, -3, -3, -3, -2, -2, -2, -2, -2, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0];
var NX = [-2, -1, 0, 1, 2, -2, -1, 0, 1, 2, -2, -1, 0, 1, 2, -2, -1, 0, 1, 2, -2, -1, 0, 1, 2];
var S_ARRAY = [1, 1, 1, 1, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 0, 0, 1];
var SY = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4];
var SX = [-2, -1, 0, 1, 2, -2, -1, 0, 1, 2, -2, -1, 0, 1, 2, -2, -1, 0, 1, 2, -2, -1, 0, 1, 2];
var E_ARRAY = [1, 0, 0, 1, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 1];
var EY = [-2, -2, -2, -2, -2, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2];
var EX = [0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 0, 1, 2, 3, 4];
var W_ARRAY = [1, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 1];
var WY = [-2, -2, -2, -2, -2, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2];
var WX = [-4, -3, -2, -1, 0, -4, -3, -2, -1, 0, -4, -3, -2, -1, 0, -4, -3, -2, -1, 0, -4, -3, -2, -1, 0];
function isWallCell(feat) {
  return feat === FEAT.NONE || feat >= FEAT.MAGMA && feat <= FEAT.QUARTZ_K || feat === FEAT.GRANITE;
}
function isWallOrFloorCell(feat) {
  return feat <= FEAT.MORE || feat >= FEAT.MAGMA && feat <= FEAT.QUARTZ_K || feat === FEAT.GRANITE;
}
function scorePattern(ctx, oy, ox, arr, ay, axArr) {
  const w = ctx.world;
  let count = 0;
  for (let i = 0; i < 25; i++) {
    const my = w.self.c.y + oy + ay[i];
    const mx = w.self.c.x + ox + axArr[i];
    if (!w.map.inBounds(mx, my)) continue;
    const feat = w.map.at(mx, my).feat;
    if (arr[i] === 0 && isWallCell(feat)) count++;
    if (arr[i] === 1 && isWallOrFloorCell(feat)) count++;
  }
  return count;
}
function borgFlowKillCorridor(ctx, flow) {
  const w = ctx.world;
  flow.borgDigging = false;
  if (!w.kills.count || w.kills.count <= 1) return null;
  const summoner = w.kills.summoner;
  if (summoner <= 0 || !w.kills.has(summoner)) return null;
  if (trait(w, 109 /* ISHUNGRY */) || trait(w, 108 /* ISWEAK */)) return null;
  if (w.self.timeThisPanel > 500) return null;
  if (trait(w, 114 /* ISCONFUSED */)) return null;
  if (trait(w, 26 /* LIGHT */) === 0) return null;
  if (flow.borgMorgothPosition) return null;
  if (flow.borgAsPosition) return null;
  const kill = w.kills.at(summoner);
  if (flow.hooks.monsterHasFlag(w, summoner, "NEVER_MOVE")) return null;
  if (flow.hooks.monsterHasFlag(w, summoner, "PASS_WALL")) return null;
  if (flow.hooks.monsterHasFlag(w, summoner, "KILL_WALL")) return null;
  if (!kill.awake) return null;
  if (!flow.hooks.canDigMagic(w, true)) return null;
  if (!flow.hooks.los(w, kill.pos.y, kill.pos.x, w.self.c.y, w.self.c.x)) {
    borgFlowClear(flow);
    flow.borgDigging = true;
    borgFlowEnqueueGrid(ctx, flow, kill.pos.y, kill.pos.x);
    borgFlowSpread(ctx, flow, 10, true, true, false, -1, false);
    if (!borgFlowCommit(ctx, flow, GOAL_KILL)) return null;
  }
  let bY = 0;
  let bX = 0;
  let bDistance = 99;
  let bN = false;
  let bS = false;
  let bE = false;
  let bW = false;
  for (let oy = -2; oy < 1; oy++) {
    const ox = 0;
    if (scorePattern(ctx, oy, ox, N_ARRAY, NY, NX) === 25) {
      const dd = distance2(
        w.self.c.x,
        w.self.c.y,
        w.self.c.x + ox + NX[7],
        w.self.c.y + oy + NY[7]
      );
      if (dd < bDistance) {
        bY = oy;
        bX = ox;
        bN = true;
        bDistance = dd;
      }
    }
  }
  for (let oy = -1; oy < 2; oy++) {
    const ox = 0;
    if (scorePattern(ctx, oy, ox, S_ARRAY, SY, SX) === 25) {
      const dd = distance2(
        w.self.c.x,
        w.self.c.y,
        w.self.c.x + ox + SX[17],
        w.self.c.y + oy + SY[17]
      );
      if (dd < bDistance) {
        bY = oy;
        bX = ox;
        bS = true;
        bN = false;
        bDistance = dd;
      }
    }
  }
  for (let ox = -1; ox < 2; ox++) {
    const oy = 0;
    if (scorePattern(ctx, oy, ox, E_ARRAY, EY, EX) === 25) {
      const dd = distance2(
        w.self.c.x,
        w.self.c.y,
        w.self.c.x + ox + EX[13],
        w.self.c.y + oy + EY[13]
      );
      if (dd < bDistance) {
        bY = oy;
        bX = ox;
        bE = true;
        bS = false;
        bN = false;
        bDistance = dd;
      }
    }
  }
  for (let ox = -2; ox < 1; ox++) {
    const oy = 0;
    if (scorePattern(ctx, oy, ox, W_ARRAY, WY, WX) === 25) {
      const dd = distance2(
        w.self.c.x,
        w.self.c.y,
        w.self.c.x + ox + WX[11],
        w.self.c.y + oy + WY[11]
      );
      if (dd < bDistance) {
        bY = oy;
        bX = ox;
        bW = true;
        bE = false;
        bS = false;
        bN = false;
        bDistance = dd;
      }
    }
  }
  const dig = (ey, ex, depth) => {
    borgFlowClear(flow);
    flow.borgDigging = true;
    borgFlowEnqueueGrid(ctx, flow, w.self.c.y + bY + ey, w.self.c.x + bX + ex);
    borgFlowSpread(ctx, flow, depth, true, false, true, -1, false);
    if (!borgFlowCommit(ctx, flow, GOAL_DIGGING)) return null;
    return borgFlowOld(ctx, flow, GOAL_DIGGING);
  };
  if (bN) return dig(NY[7], NX[7], 5);
  if (bS) return dig(SY[17], SX[17], 6);
  if (bE) return dig(EY[13], EX[13], 5);
  if (bW) return dig(WY[11], WX[11], 5);
  return null;
}
function borgFlowKillDirect(ctx, flow, twitchy) {
  const w = ctx.world;
  if (!borgCanDig(ctx, flow, false, FEAT.GRANITE)) return null;
  if (!twitchy && (trait(w, 109 /* ISHUNGRY */) || trait(w, 108 /* ISWEAK */) || trait(w, 39 /* FOOD */) === 0))
    return null;
  if (!twitchy && w.clock - flow.borgBegan < 3e3 && w.self.timesTwitch < 5)
    return null;
  if (trait(w, 114 /* ISCONFUSED */)) return null;
  if (trait(w, 26 /* LIGHT */) === 0) return null;
  let bI = -1;
  let bD = 20;
  if (w.kills.count > 1) {
    for (const [ki, kill2] of w.kills.entries()) {
      const d = distance2(kill2.pos.x, kill2.pos.y, w.self.c.x, w.self.c.y);
      if (d > bD) continue;
      bI = ki;
      bD = d;
    }
  }
  if (bI === -1) {
    borgFlowClear(flow);
    borgFlowEnqueueGrid(ctx, flow, Math.trunc(AUTO_MAX_Y / 2), Math.trunc(AUTO_MAX_X / 2));
    borgFlowSpread(ctx, flow, 150, true, false, true, -1, false);
    if (!borgFlowCommit(ctx, flow, GOAL_DIGGING)) return null;
    return borgFlowOld(ctx, flow, GOAL_DIGGING);
  }
  const kill = w.kills.at(bI);
  borgFlowClear(flow);
  borgFlowEnqueueGrid(ctx, flow, kill.pos.y, kill.pos.x);
  borgFlowSpread(ctx, flow, 15, true, false, true, -1, false);
  if (!borgFlowCommit(ctx, flow, GOAL_DIGGING)) return null;
  return borgFlowOld(ctx, flow, GOAL_DIGGING);
}
function killWouldBeVisible(ctx, flow, killIndex, y, x) {
  const w = ctx.world;
  const has2 = (f) => flow.hooks.monsterHasFlag(w, killIndex, f);
  const d = distance2(w.self.c.x, w.self.c.y, x, y);
  if (d > (ctx.view.constants().maxSight ?? 20)) return false;
  if (!w.map.inBounds(x, y)) return false;
  const ag = w.map.at(x, y);
  if (ag.info & BORG_VIEW) {
    if (ag.info & (BORG_LIGHT | BORG_GLOW)) {
      if (trait(w, 51 /* SINV */) || w.self.temp.seeInv) return true;
      if (!has2("INVISIBLE")) return true;
    }
    if (d <= trait(w, 52 /* INFRA */) && !has2("COLD_BLOOD")) return true;
  }
  if (trait(w, 37 /* ESP */)) {
    if (has2("EMPTY_MIND")) return false;
    if (has2("WEIRD_MIND")) return false;
    return true;
  }
  return false;
}
function borgFollowKill(ctx, flow, i) {
  const w = ctx.world;
  const kill = w.kills.at(i);
  const ox = kill.pos.x;
  const oy = kill.pos.y;
  const has2 = (f) => flow.hooks.monsterHasFlag(w, i, f);
  if (!killWouldBeVisible(ctx, flow, i, oy, ox)) return;
  if (!borgCaveFloorBold(w, oy, ox)) {
    w.kills.delete(i, w);
    return;
  }
  if (w.clock > 2e4) {
    w.kills.delete(i, w);
    return;
  }
  if (has2("NEVER_MOVE") || !kill.awake) {
    if (oy === w.self.c.y && ox === w.self.c.x) w.kills.delete(i, w);
    return;
  }
  let bDx = 0;
  let bDy = 0;
  for (let j = 0; j < 8; j++) {
    const dx = ddx_ddd[j];
    const dy = ddy_ddd[j];
    const x = ox + dx;
    const y = oy + dy;
    if (!inBoundsFully(x, y)) continue;
    if (!borgCaveFloorBold(w, y, x)) continue;
    if (w.map.at(x, y).kill) continue;
    if (killWouldBeVisible(ctx, flow, i, y, x)) continue;
    bDx += dx;
    bDy += dy;
  }
  bDx = Math.max(-1, Math.min(1, bDx));
  bDy = Math.max(-1, Math.min(1, bDy));
  const nx = ox + bDx;
  const ny = oy + bDy;
  if (!w.map.inBounds(nx, ny) || !borgCaveFloorBold(w, ny, nx)) {
    w.kills.delete(i, w);
    return;
  }
  if (w.map.at(nx, ny).kill !== i) {
    w.kills.delete(i, w);
    return;
  }
  if (ny === oy && nx === ox) {
    w.kills.delete(i, w);
    return;
  }
  w.map.at(kill.pos.x, kill.pos.y).kill = 0;
  kill.ox = ox;
  kill.oy = oy;
  kill.pos.x = nx;
  kill.pos.y = ny;
  w.map.at(nx, ny).kill = i;
  if (!trait(w, 37 /* ESP */) && w.self.goal.type === GOAL_KILL && w.self.goal.g.y === kill.pos.y && w.self.goal.g.x === kill.pos.x) {
    w.self.goal.type = 0;
  }
}
function borgFollowMissingKills(ctx, flow) {
  const w = ctx.world;
  if (trait(w, 112 /* ISBLIND */)) return;
  for (const [i, kill] of w.kills.entries()) {
    if (kill.when === w.clock) continue;
    if (kill.seen) continue;
    borgFollowKill(ctx, flow, i);
  }
}

// src/flow/flow-dark.ts
function borgFlowDarkInteresting(ctx, flow, y, x) {
  const w = ctx.world;
  const ag = w.map.at(x, y);
  if (ag.feat === FEAT.NONE) return true;
  if (ag.feat < FEAT.SECRET && ag.feat !== FEAT.CLOSED) return false;
  if (ag.feat === FEAT.MAGMA_K || ag.feat === FEAT.QUARTZ_K) {
    if (trait(w, 114 /* ISCONFUSED */)) return false;
    if (trait(w, 45 /* GOLD */) >= 1e5) return false;
    if (trait(w, 26 /* LIGHT */) === 0) return false;
    if (!borgCanDig(ctx, flow, false, ag.feat)) return false;
    return true;
  }
  if (ag.feat === FEAT.GRANITE || ag.feat === FEAT.MAGMA || ag.feat === FEAT.QUARTZ) {
    if (trait(w, 114 /* ISCONFUSED */)) return false;
    if (!w.facts.vaultOnLevel) return false;
    if (!borgCanDig(ctx, flow, false, ag.feat)) return false;
    if (x < AUTO_MAX_X - 1 && y < AUTO_MAX_Y - 1 && x > 1 && y > 1) {
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          if (w.map.at(x + ox, y + oy).feat === FEAT.PERM) return true;
        }
      }
    }
  }
  if (ag.feat === FEAT.RUBBLE && !trait(w, 108 /* ISWEAK */)) return true;
  if (ag.feat === FEAT.CLOSED) {
    if (w.facts.breederLevel) {
      for (let i = 0; i < flow.door.num; i++) {
        if (flow.door.x[i] === x && flow.door.y[i] === y) return false;
      }
    }
    return true;
  }
  if (featIsTrapHolding(ag.feat)) {
    if (trait(w, 112 /* ISBLIND */)) return false;
    if (trait(w, 114 /* ISCONFUSED */)) return false;
    if (trait(w, 120 /* ISIMAGE */)) return false;
    if (trait(w, 26 /* LIGHT */) === 0) return false;
    if (trait(w, 105 /* CDEPTH */) === 99 && ag.trap && !ag.glyph) return false;
    if (trait(w, 27 /* CURHP */) < 60) return false;
    if (trait(w, 54 /* DISP */) < 30 && trait(w, 35 /* CLEVEL */) < 20) return false;
    if (trait(w, 54 /* DISP */) < 45 && trait(w, 35 /* CLEVEL */) < 10) return false;
    if (trait(w, 55 /* DISM */) < 30 && trait(w, 35 /* CLEVEL */) < 20) return false;
    if (trait(w, 55 /* DISM */) < 45 && trait(w, 35 /* CLEVEL */) < 10) return false;
    if (w.facts.scaryGuyOnLevel) return false;
    return true;
  }
  return false;
}
function borgFlowDarkReachable(ctx, y, x) {
  const w = ctx.world;
  for (let j = 0; j < 8; j++) {
    const y2 = y + ddy_ddd[j];
    const x2 = x + ddx_ddd[j];
    if (!w.map.inBounds(x2, y2)) continue;
    const ag = w.map.at(x2, y2);
    if (ag.feat === FEAT.NONE) continue;
    if (borgCaveFloorGrid(ag)) return true;
  }
  return false;
}
function borgFlowDirect(ctx, flow, y, x) {
  const w = ctx.world;
  let n = 0;
  if (flow.icky[dataIdx(x, y)]) return;
  if (!flow.know[dataIdx(x, y)]) {
    flow.know[dataIdx(x, y)] = 1;
    const p = flow.hooks.danger(w, y, x);
    const fear = computeFear(w, flow, 1);
    if (p > fear) {
      flow.icky[dataIdx(x, y)] = 1;
      return;
    }
  }
  flow.cost[dataIdx(x, y)] = 0;
  const y1 = y;
  const x1 = x;
  const y2 = w.self.c.y;
  const x2 = w.self.c.x;
  const ay = y2 < y1 ? y1 - y2 : y2 - y1;
  const ax = x2 < x1 ? x1 - x2 : x2 - x1;
  let cx = x;
  let cy = y;
  for (; ; ) {
    if (cx === x2 && cy === y2) return;
    n++;
    if (ay > ax) {
      const shift = Math.trunc((n * ax + Math.trunc((ay - 1) / 2)) / ay);
      cx = x2 < x1 ? x1 - shift : x1 + shift;
      cy = y2 < y1 ? y1 - n : y1 + n;
    } else {
      const shift = Math.trunc((n * ay + Math.trunc((ax - 1) / 2)) / ax);
      cy = y2 < y1 ? y1 - shift : y1 + shift;
      cx = x2 < x1 ? x1 - n : x1 + n;
    }
    if (!(cx >= 0 && cy >= 0 && cx < AUTO_MAX_X && cy < AUTO_MAX_Y)) return;
    const ag = w.map.at(cx, cy);
    if (!borgCaveFloorGrid(ag) || ag.feat === FEAT.LAVA && !trait(w, 64 /* IFIRE */)) return;
    if (ag.trap && flow.avoidance <= trait(w, 27 /* CURHP */) && !w.facts.scaryGuyOnLevel) {
      if (trait(w, 27 /* CURHP */) < 60) return;
      if (trait(w, 54 /* DISP */) < 30 && trait(w, 35 /* CLEVEL */) < 20) return;
      if (trait(w, 54 /* DISP */) < 45 && trait(w, 35 /* CLEVEL */) < 10) return;
      if (trait(w, 55 /* DISM */) < 30 && trait(w, 35 /* CLEVEL */) < 20) return;
      if (trait(w, 55 /* DISM */) < 45 && trait(w, 35 /* CLEVEL */) < 10) return;
    }
    if (flow.icky[dataIdx(cx, cy)]) return;
    if (!flow.know[dataIdx(cx, cy)]) {
      flow.know[dataIdx(cx, cy)] = 1;
      const p = flow.hooks.danger(w, cy, cx);
      const fear = computeFear(w, flow, 1);
      if (p > fear) {
        flow.icky[dataIdx(cx, cy)] = 1;
        return;
      }
    }
    if (flow.cost[dataIdx(cx, cy)] <= n) break;
    flow.cost[dataIdx(cx, cy)] = n;
  }
}
function borgFlowBorder(flow, y1, x1, y2, x2, stop) {
  const v = stop ? 1 : 0;
  for (let y = y1; y <= y2; y++) {
    flow.know[dataIdx(x1, y)] = v;
    flow.icky[dataIdx(x1, y)] = v;
    flow.know[dataIdx(x2, y)] = v;
    flow.icky[dataIdx(x2, y)] = v;
  }
  for (let x = x1; x <= x2; x++) {
    flow.know[dataIdx(x, y1)] = v;
    flow.icky[dataIdx(x, y1)] = v;
    flow.know[dataIdx(x, y2)] = v;
    flow.icky[dataIdx(x, y2)] = v;
  }
}
function collectLightGrids(ctx) {
  const w = ctx.world;
  const out = [];
  for (let y = 0; y < AUTO_MAX_Y; y++) {
    for (let x = 0; x < AUTO_MAX_X; x++) {
      if (w.map.at(x, y).info & BORG_LIGHT) out.push([x, y]);
    }
  }
  return out;
}
function borgFlowDark1(ctx, flow, bStair) {
  const w = ctx.world;
  if (!trait(w, 105 /* CDEPTH */)) return null;
  flow.tempN = 0;
  for (const [x, y] of collectLightGrids(ctx)) {
    if (!borgFlowDarkInteresting(ctx, flow, y, x)) continue;
    if (borgFlowFarFromStairs(ctx, flow, x, y, bStair)) continue;
    flow.tempX[flow.tempN] = x;
    flow.tempY[flow.tempN] = y;
    flow.tempN++;
  }
  if (!flow.tempN) return null;
  if (w.self.goal.ignoring || w.facts.scaryGuyOnLevel) flow.borgDangerWipe = true;
  borgFlowClear(flow);
  for (let i = 0; i < flow.tempN; i++) borgFlowDirect(ctx, flow, flow.tempY[i], flow.tempX[i]);
  if (!borgFlowCommit(ctx, flow, GOAL_DARK)) return null;
  return borgFlowOld(ctx, flow, GOAL_DARK);
}
function borgFlowDark2(ctx, flow, bStair) {
  const w = ctx.world;
  if (!trait(w, 105 /* CDEPTH */)) return null;
  const r = trait(w, 26 /* LIGHT */) + 1;
  flow.tempN = 0;
  for (let i = 0; i < 4; i++) {
    const y = w.self.c.y + ddy_ddd[i] * r;
    const x = w.self.c.x + ddx_ddd[i] * r;
    if (y < 1 || x < 1 || y > AUTO_MAX_Y - 2 || x > AUTO_MAX_X - 2) continue;
    const ag = w.map.at(x, y);
    if (ag.feat !== FEAT.NONE) continue;
    if (!(ag.info & BORG_VIEW)) continue;
    if (borgFlowFarFromStairs(ctx, flow, x, y, bStair)) continue;
    flow.tempX[flow.tempN] = x;
    flow.tempY[flow.tempN] = y;
    flow.tempN++;
  }
  if (!flow.tempN) return null;
  if (w.self.goal.ignoring || w.facts.scaryGuyOnLevel) flow.borgDangerWipe = true;
  borgFlowClear(flow);
  for (let i = 0; i < flow.tempN; i++) borgFlowDirect(ctx, flow, flow.tempY[i], flow.tempX[i]);
  if (!borgFlowCommit(ctx, flow, GOAL_DARK)) return null;
  return borgFlowOld(ctx, flow, GOAL_DARK);
}
function borgFlowDark3(ctx, flow, bStair) {
  const w = ctx.world;
  if (!trait(w, 105 /* CDEPTH */)) return null;
  let y1 = w.self.c.y - 4;
  let x1 = w.self.c.x - 4;
  let y2 = w.self.c.y + 4;
  let x2 = w.self.c.x + 4;
  if (y1 < 1) y1 = 1;
  if (x1 < 1) x1 = 1;
  if (y2 > AUTO_MAX_Y - 2) y2 = AUTO_MAX_Y - 2;
  if (x2 > AUTO_MAX_X - 2) x2 = AUTO_MAX_X - 2;
  flow.tempN = 0;
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      if (!borgFlowDarkInteresting(ctx, flow, y, x)) continue;
      if (!borgFlowDarkReachable(ctx, y, x)) continue;
      if (borgFlowFarFromStairs(ctx, flow, x, y, bStair)) continue;
      flow.tempX[flow.tempN] = x;
      flow.tempY[flow.tempN] = y;
      flow.tempN++;
    }
  }
  if (!flow.tempN) return null;
  if (w.self.goal.ignoring || w.facts.scaryGuyOnLevel) flow.borgDangerWipe = true;
  borgFlowClear(flow);
  for (let i = 0; i < flow.tempN; i++) borgFlowEnqueueGrid(ctx, flow, flow.tempY[i], flow.tempX[i]);
  borgFlowSpread(ctx, flow, 5, false, true, false, -1, false);
  if (!borgFlowCommit(ctx, flow, GOAL_DARK)) return null;
  return borgFlowOld(ctx, flow, GOAL_DARK);
}
function borgFlowDark4(ctx, flow, bStair) {
  const w = ctx.world;
  const leash = borgGetLeash(ctx, flow, false);
  if (!trait(w, 105 /* CDEPTH */)) return null;
  if (w.facts.vaultOnLevel) return null;
  let y1 = w.self.c.y - 11;
  let x1 = w.self.c.x - 11;
  let y2 = w.self.c.y + 11;
  let x2 = w.self.c.x + 11;
  if (y1 < 1) y1 = 1;
  if (x1 < 1) x1 = 1;
  if (y2 > AUTO_MAX_Y - 2) y2 = AUTO_MAX_Y - 2;
  if (x2 > AUTO_MAX_X - 2) x2 = AUTO_MAX_X - 2;
  flow.tempN = 0;
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      if (!borgFlowDarkInteresting(ctx, flow, y, x)) continue;
      if (!borgFlowDarkReachable(ctx, y, x)) continue;
      if (borgFlowFarFromStairsDist(ctx, flow, x, y, bStair, leash)) continue;
      flow.tempX[flow.tempN] = x;
      flow.tempY[flow.tempN] = y;
      flow.tempN++;
    }
  }
  if (!flow.tempN) return null;
  if (w.self.goal.ignoring || w.facts.scaryGuyOnLevel) flow.borgDangerWipe = true;
  borgFlowClear(flow);
  for (let i = 0; i < flow.tempN; i++) borgFlowEnqueueGrid(ctx, flow, flow.tempY[i], flow.tempX[i]);
  y1--;
  x1--;
  y2++;
  x2++;
  borgFlowBorder(flow, y1, x1, y2, x2, true);
  if (trait(w, 35 /* CLEVEL */) < 15) {
    borgFlowSpread(ctx, flow, leash, true, true, false, -1, false);
  } else {
    borgFlowSpread(ctx, flow, 250, true, true, false, -1, false);
  }
  borgFlowBorder(flow, y1, x1, y2, x2, false);
  if (!borgFlowCommit(ctx, flow, GOAL_DARK)) return null;
  return borgFlowOld(ctx, flow, GOAL_DARK);
}
function borgFlowDark5(ctx, flow, bStair) {
  const w = ctx.world;
  const leash = borgGetLeash(ctx, flow, false);
  if (!trait(w, 105 /* CDEPTH */)) return null;
  flow.tempN = 0;
  for (let y = 1; y < AUTO_MAX_Y - 1; y++) {
    for (let x = 1; x < AUTO_MAX_X - 1; x++) {
      if (!borgFlowDarkInteresting(ctx, flow, y, x)) continue;
      if (!borgFlowDarkReachable(ctx, y, x)) continue;
      if (borgFlowFarFromStairsDist(ctx, flow, x, y, bStair, leash)) continue;
      flow.tempX[flow.tempN] = x;
      flow.tempY[flow.tempN] = y;
      flow.tempN++;
      if (flow.tempN === 9e3) {
        y = AUTO_MAX_Y;
        x = AUTO_MAX_X;
        break;
      }
    }
  }
  if (!flow.tempN) return null;
  if (w.self.goal.ignoring || w.facts.scaryGuyOnLevel) flow.borgDangerWipe = true;
  borgFlowClear(flow);
  for (let i = 0; i < flow.tempN; i++) borgFlowEnqueueGrid(ctx, flow, flow.tempY[i], flow.tempX[i]);
  if (trait(w, 35 /* CLEVEL */) <= 5 && flow.avoidance <= trait(w, 27 /* CURHP */)) {
    borgFlowSpread(ctx, flow, leash, true, true, false, -1, false);
  } else if (trait(w, 35 /* CLEVEL */) <= 30 && flow.avoidance <= trait(w, 27 /* CURHP */)) {
    borgFlowSpread(ctx, flow, leash, true, true, false, -1, false);
  } else {
    borgFlowSpread(ctx, flow, 250, true, true, false, -1, false);
  }
  if (!borgFlowCommit(ctx, flow, GOAL_DARK)) return null;
  return borgFlowOld(ctx, flow, GOAL_DARK);
}
function borgFlowDark(ctx, flow, neer) {
  const w = ctx.world;
  if (flow.borgMorgothPosition && w.facts.morgothOnLevel) return null;
  if (borgFlowDarkInteresting(ctx, flow, w.self.c.y, w.self.c.x)) return null;
  syncStairsFromMap(ctx, flow);
  let bStair = -1;
  let bJ = -1;
  for (let i = 0; i < flow.less.num; i++) {
    const j = distance2(w.self.c.x, w.self.c.y, flow.less.x[i], flow.less.y[i]);
    if (bJ >= j) continue;
    bJ = j;
    bStair = i;
  }
  if (neer) {
    return borgFlowDark1(ctx, flow, bStair) ?? borgFlowDark2(ctx, flow, bStair) ?? borgFlowDark3(ctx, flow, bStair);
  }
  return borgFlowDark4(ctx, flow, bStair) ?? borgFlowDark5(ctx, flow, bStair);
}

// src/flow/flow-glyph.ts
var BORG_DDX_DDD = [0, 0, 1, -1, 1, -1, 1, -1, 2, 2, 2, -2, -2, -2, -2, -1, 0, 1, 2, -2, -1, 0, 1, 2];
var BORG_DDY_DDD = [1, -1, 0, 0, 1, 1, -1, -1, -1, 0, 1, -1, 0, 1, -2, -2, -2, -2, -2, 2, 2, 2, 2, 2];
function borgFlowGlyph(ctx, flow) {
  const w = ctx.world;
  if (flow.glyphYCenter === 0 && flow.glyphXCenter === 0 || distance2(w.self.c.x, w.self.c.y, flow.glyphXCenter, flow.glyphYCenter) >= 50) {
    flow.borgNeedsNewSea = true;
  }
  if (flow.glyphX === w.self.c.x && flow.glyphY === w.self.c.y) {
    flow.glyphX = 0;
    flow.glyphY = 0;
    if (flow.borgNeedsNewSea) {
      flow.glyphYCenter = w.self.c.y;
      flow.glyphXCenter = w.self.c.x;
    }
    flow.borgNeedsNewSea = false;
    const cmd = flow.hooks.layGlyph(ctx);
    if (!cmd) return null;
    for (let i = 0; i < flow.glyph.num; i++) {
      if (flow.glyph.x[i] === w.self.c.x && flow.glyph.y[i] === w.self.c.y) {
        return cmd;
      }
    }
    flow.glyph.add(w.self.c.y, w.self.c.x);
    return cmd;
  }
  borgFlowReverse(ctx, flow, 250, true, false, false, -1, false);
  let bX = w.self.c.x;
  let bY = w.self.c.y;
  let bV = -1;
  for (let y = 15; y < AUTO_MAX_Y - 15; y++) {
    for (let x = 50; x < AUTO_MAX_X - 50; x++) {
      const ag = w.map.at(x, y);
      if (ag.feat !== FEAT.FLOOR && ag.glyph) continue;
      const cost = flow.cost[dataIdx(x, y)];
      if (cost >= 75) continue;
      if (flow.borgNeedsNewSea) {
        const goalGlyph = 24;
        let floor = 0;
        let tmpGlyph = 0;
        for (let i = 0; i < 24; i++) {
          const xx = x + BORG_DDX_DDD[i];
          const yy = y + BORG_DDY_DDD[i];
          if (!w.map.inBounds(xx, yy)) continue;
          const a = w.map.at(xx, yy);
          if (a.feat === FEAT.FLOOR || a.glyph) floor++;
        }
        if (floor !== 24) continue;
        for (let i = 0; i < 24; i++) {
          const xx = x + BORG_DDX_DDD[i];
          const yy = y + BORG_DDY_DDD[i];
          if (!w.map.inBounds(xx, yy)) continue;
          if (w.map.at(xx, yy).glyph) tmpGlyph++;
        }
        let v = 100 + tmpGlyph * 500 - cost * 1;
        if (w.map.at(x, y).feat === FEAT.FLOOR) v += 3e3;
        if (tmpGlyph === goalGlyph) v += 5e3;
        if (tmpGlyph !== goalGlyph && w.map.at(x, y).glyph) v = -1;
        if (v <= 0) continue;
        if (bV >= 0 && v < bV) continue;
        bV = v;
        bX = x;
        bY = y;
      } else {
        for (let i = 0; i < 24; i++) {
          if (flow.glyphXCenter + BORG_DDX_DDD[i] !== x) continue;
          if (flow.glyphYCenter + BORG_DDY_DDD[i] !== y) continue;
          if (w.map.at(x, y).glyph) continue;
          const v = 500 - cost * 1;
          if (v <= 0) continue;
          if (bV >= 0 && v < bV) continue;
          bV = v;
          bX = x;
          bY = y;
        }
      }
    }
  }
  if (flow.glyphYCenter !== 0 && flow.glyphXCenter !== 0) {
    let glyph = 0;
    for (let i = 0; i < 24; i++) {
      const xx = flow.glyphXCenter + BORG_DDX_DDD[i];
      const yy = flow.glyphYCenter + BORG_DDY_DDD[i];
      if (!w.map.inBounds(xx, yy)) continue;
      if (w.map.at(xx, yy).glyph) glyph++;
      if (glyph === 24) {
        bV = 5e3;
        bX = flow.glyphXCenter;
        bY = flow.glyphYCenter;
      }
    }
  }
  borgFlowClear(flow);
  if (bV < 0) return null;
  flow.glyphX = bX;
  flow.glyphY = bY;
  borgFlowEnqueueGrid(ctx, flow, bY, bX);
  borgFlowSpread(ctx, flow, 250, true, false, false, -1, false);
  if (!borgFlowCommit(ctx, flow, GOAL_MISC)) return null;
  return borgFlowOld(ctx, flow, GOAL_MISC);
}

// src/flow/index.ts
function createFlow(hooks = defaultFlowHooks()) {
  const state = createFlowState(hooks);
  return {
    state,
    toStairs: (ctx, down, why = GOAL_BORE, sneak = false, brave = false) => down ? borgFlowStairMore(ctx, state, why, sneak, brave) : borgFlowStairLess(ctx, state, why, sneak),
    toStairsBoth: (ctx, why = GOAL_BORE, sneak = false) => borgFlowStairBoth(ctx, state, why, sneak),
    toTakes: (ctx, viewable = true, nearness = 250) => borgFlowTake(ctx, state, viewable, nearness),
    toTakesScum: (ctx, viewable = true, nearness = 250) => borgFlowTakeScum(ctx, state, viewable, nearness),
    toKills: (ctx, nearness, viewable = true) => borgFlowKill(ctx, state, viewable, nearness),
    toKillAim: (ctx, viewable = true) => borgFlowKillAim(ctx, state, viewable),
    toKillCorridor: (ctx) => borgFlowKillCorridor(ctx, state),
    toKillDirect: (ctx, twitchy = false) => borgFlowKillDirect(ctx, state, twitchy),
    toDark: (ctx, near = true) => borgFlowDark(ctx, state, near),
    toGlyph: (ctx) => borgFlowGlyph(ctx, state),
    toLight: (ctx, why = GOAL_BORE) => borgFlowLight(ctx, state, why),
    toRecover: (ctx, dist4 = 250) => borgFlowRecover(ctx, state, dist4),
    toVein: (ctx, viewable = true, nearness = 250) => borgFlowVein(ctx, state, viewable, nearness),
    toVault: (ctx, nearness = 30) => borgFlowVault(ctx, state, nearness),
    toShop: (ctx, shopIndex) => borgFlowShopEntry(ctx, state, shopIndex),
    spastic: (ctx, bored) => borgFlowSpastic(ctx, state, bored),
    twitchy: (ctx) => borgTwitchy(ctx, state)
  };
}

// src/item/svals.ts
var SVAL = {
  /* food (borg-item-val.c:263-273) */
  food: {
    apple: 2,
    ration: 5,
    slime_mold: 4,
    draught: 14,
    pint: 11,
    sip: 12,
    waybread: 9,
    honey_cake: 8,
    slice: 7,
    handful: 3
  },
  /* mushroom (borg-item-val.c:275-287) */
  mush: {
    second_sight: 1,
    fast_recovery: 2,
    restoring: 3,
    /* "Vigor" */
    mana: 4,
    /* "Clear Mind" */
    emergency: 5,
    terror: 6,
    stoneskin: 7,
    debility: 9,
    sprinting: 10,
    cure_mind: 4,
    /* C maps cure_mind -> "Clear Mind" too */
    purging: 11
  },
  /* light (borg-item-val.c:289-291) */
  light: { lantern: 2, torch: 1 },
  /* flask (borg-item-val.c:293-295) */
  flask: { oil: 1 },
  /* potion (borg-item-val.c:297-338) */
  potion: {
    cure_critical: 10,
    cure_serious: 9,
    cure_light: 8,
    healing: 11,
    star_healing: 12,
    /* "*Healing*" */
    life: 13,
    restore_mana: 15,
    cure_poison: 14,
    /* "Neutralize Poison" */
    resist_heat: 28,
    resist_cold: 29,
    resist_pois: 30,
    inc_str: 1,
    inc_int: 2,
    inc_wis: 3,
    inc_dex: 4,
    inc_con: 5,
    inc_all: 6,
    /* "Augmentation" */
    inc_str2: 17,
    /* "Brawn" */
    inc_int2: 18,
    /* "Intellect" */
    inc_wis2: 19,
    /* "Contemplation" */
    inc_dex2: 20,
    /* "Nimbleness" */
    inc_con2: 21,
    /* "Toughness" */
    restore_life: 16,
    /* "Restore Life Levels" */
    speed: 24,
    berserk: 26,
    /* "Berserk Strength" */
    sleep: 34,
    slowness: 38,
    poison: 37,
    blindness: 35,
    confusion: 36,
    heroism: 25,
    boldness: 27,
    detect_invis: 31,
    /* "True Seeing" */
    enlightenment: 22,
    slime_mold: 33,
    /* "Slime Mold Juice" */
    infravision: 32,
    inc_exp: 7
    /* "Experience" */
  },
  /* scroll (borg-item-val.c:340-383) */
  scroll: {
    identify: 7,
    /* "Identify Rune" */
    phase_door: 1,
    teleport: 2,
    /* "Teleportation" */
    word_of_recall: 24,
    enchant_armor: 10,
    /* "Enchant Armour" */
    enchant_weapon_to_hit: 8,
    enchant_weapon_to_dam: 9,
    star_enchant_weapon: 11,
    /* "*Enchant Weapon*" */
    star_enchant_armor: 12,
    /* "*Enchant Armour*" */
    protection_from_evil: 31,
    rune_of_protection: 33,
    teleport_level: 3,
    deep_descent: 27,
    recharging: 25,
    banishment: 20,
    mass_banishment: 21,
    blessing: 28,
    holy_chant: 29,
    holy_prayer: 30,
    detect_invis: 6,
    /* "Detect Invisible" */
    satisfy_hunger: 22,
    /* "Remove Hunger" */
    light: 23,
    mapping: 4,
    /* "Magic Mapping" */
    acquirement: 17,
    star_acquirement: 18,
    /* "*Acquirement*" */
    remove_curse: 13,
    star_remove_curse: 14,
    /* "*Remove Curse*" */
    monster_confusion: 32,
    trap_door_destruction: 26,
    /* "Door Destruction" */
    dispel_undead: 19
  },
  /* ring (borg-item-val.c:385-393) */
  ring: {
    flames: 12,
    ice: 14,
    acid: 13,
    lightning: 15,
    digging: 30,
    speed: 5,
    damage: 16,
    dog: 25
    /* "the Dog" */
  },
  /* amulet (borg-item-val.c:395-396) */
  amulet: { teleportation: 14 },
  /* rod (borg-item-val.c:398-420) */
  rod: {
    recall: 24,
    detection: 2,
    illumination: 23,
    speed: 25,
    mapping: 3,
    /* "Magic Mapping" */
    healing: 16,
    light: 22,
    fire_bolt: 5,
    /* "Fire Bolts" */
    elec_bolt: 7,
    /* "Lightning Bolts" */
    cold_bolt: 6,
    /* "Frost Bolts" */
    acid_bolt: 8,
    /* "Acid Bolts" */
    drain_life: 19,
    fire_ball: 9,
    /* "Fire Balls" */
    elec_ball: 11,
    /* "Lightning Balls" */
    cold_ball: 10,
    /* "Cold Balls" */
    acid_ball: 12,
    /* "Acid Balls" */
    teleport_other: 20,
    slow_monster: 13,
    sleep_monster: 14,
    /* "Hold Monster" */
    curing: 15
  },
  /* staff (borg-item-val.c:422-440) */
  staff: {
    teleportation: 21,
    destruction: 5,
    /* "*Destruction*" */
    speed: 22,
    healing: 14,
    the_magi: 24,
    /* "the Magi" */
    power: 17,
    holiness: 18,
    curing: 12,
    sleep_monsters: 8,
    slow_monsters: 7,
    detect_invis: 9,
    /* "Detect Invisible" */
    detect_evil: 10,
    dispel_evil: 15,
    banishment: 16,
    light: 19,
    mapping: 11,
    remove_curse: 23
  },
  /* wand (borg-item-val.c:442-467). NOTE: two upstream copy/paste quirks are
   * reproduced: confuse_monster resolves to "Scare Monster" (==fear_monster),
   * and elec_ball resolves to "Lightning Bolts" (the bolt, not the ball). */
  wand: {
    light: 16,
    teleport_away: 21,
    /* "Teleport Other" */
    stinking_cloud: 6,
    magic_missile: 1,
    annihilation: 28,
    stone_to_mud: 17,
    wonder: 23,
    hold_monster: 13,
    slow_monster: 11,
    fear_monster: 15,
    /* "Scare Monster" */
    confuse_monster: 15,
    /* upstream quirk: also "Scare Monster" */
    fire_bolt: 4,
    /* "Fire Bolts" */
    cold_bolt: 3,
    /* "Frost Bolts" */
    acid_bolt: 5,
    /* "Acid Bolts" */
    elec_bolt: 2,
    /* "Lightning Bolts" */
    fire_ball: 9,
    /* "Fire Balls" */
    cold_ball: 8,
    /* "Cold Balls" */
    acid_ball: 10,
    /* "Acid Balls" */
    elec_ball: 2,
    /* upstream quirk: "Lightning Bolts" (bolt sval) */
    dragon_cold: 25,
    /* "Dragon's Frost" */
    dragon_fire: 24,
    /* "Dragon's Flame" */
    drain_life: 27
  },
  /* dragon armor (borg-item-val.c:500-511) */
  dragon: {
    black: 1,
    blue: 2,
    white: 3,
    red: 4,
    green: 5,
    multihued: 6,
    shining: 7,
    law: 8,
    gold: 9,
    chaos: 10,
    balance: 11,
    power: 12
  },
  /* bow (borg-item-val.c:186-191) */
  bow: {
    sling: 1,
    short_bow: 2,
    long_bow: 3,
    light_xbow: 4,
    heavy_xbow: 5
  }
};
function flatSvals() {
  const out = {};
  for (const [group, roles] of Object.entries(SVAL)) {
    for (const [role, sval] of Object.entries(roles)) {
      out[group === "bow" ? role : `${group}_${role}`] = sval;
    }
  }
  return out;
}

// src/trait/config.ts
function defaultCfg() {
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
    enchantLimit: 12
  };
}
var activeCfg = defaultCfg();
function setBorgCfg(cfg = {}) {
  activeCfg = { ...defaultCfg(), ...cfg };
}
function borgCfg() {
  return activeCfg;
}
var buffTimerSafetyNetOn = true;
function setBuffTimerSafetyNet(on2) {
  buffTimerSafetyNetOn = on2;
}
function buffTimerSafetyNetEnabled() {
  return buffTimerSafetyNetOn;
}
function defaultSpellSeam() {
  return {
    spellLegal: () => false,
    spellLegalFail: () => false,
    equipsItem: () => false,
    equipsRing: () => false,
    spellChance: () => 100,
    playerHas: () => false
  };
}
function defaultHomeSeam() {
  return {
    numHealTrue: 0,
    numEzhealTrue: 0,
    numLifeTrue: 0,
    numHeal: 0,
    numEzheal: 0,
    numLife: 0,
    numSpeed: 0
  };
}
function defaultFrame() {
  return {};
}
function resolveOpts(opts = {}) {
  return {
    cfg: { ...borgCfg(), ...opts.cfg },
    spells: opts.spells ?? defaultSpellSeam(),
    home: opts.home ?? defaultHomeSeam(),
    frame: opts.frame ?? defaultFrame(),
    svals: opts.svals ?? flatSvals()
  };
}

// src/trait/state.ts
function makeDerived() {
  return {
    has: /* @__PURE__ */ new Map(),
    needStatgain: new Array(STAT_MAX).fill(false),
    amtStatgain: new Array(STAT_MAX).fill(0),
    amtBook: new Array(9).fill(0)
  };
}
var store = /* @__PURE__ */ new WeakMap();
function getDerived(world) {
  let d = store.get(world);
  if (!d) {
    d = makeDerived();
    store.set(world, d);
  }
  return d;
}
function resetDerived(world) {
  const d = makeDerived();
  store.set(world, d);
  return d;
}
function has(d, role) {
  return d.has.get(role) ?? 0;
}
function addHas(d, role, n) {
  d.has.set(role, (d.has.get(role) ?? 0) + n);
}

// src/trait/item-util.ts
function hasFlag2(item, name) {
  return item.flags.includes(name);
}
function mod(item, code) {
  for (const m of item.modifiers) if (m.code === code) return m.value;
  return 0;
}
function resLevel(item, element) {
  for (const r of item.resists) if (r.element === element) return r.level;
  return 0;
}
function hasBrand3(item, element) {
  return item.brands.includes(`${element}_3`);
}
function slayMult(item, race) {
  let m = 0;
  for (const code of item.slays) {
    const us = code.lastIndexOf("_");
    if (us < 0) continue;
    if (code.slice(0, us) !== race) continue;
    const mult = Number(code.slice(us + 1));
    if (Number.isFinite(mult)) m = mult;
  }
  return m;
}
function present(item) {
  return !!item && item.number > 0;
}

// src/trait/buff-timers.ts
var BUFF_TIMER_FIELDS = [
  "protEvil",
  "fast",
  "sprint",
  "resAcid",
  "resElec",
  "resFire",
  "resCold",
  "resPois",
  "blessed",
  "shield",
  "stoneskin",
  "fastcast",
  "hero",
  "shero"
];
function borgHasBuffTimers(status) {
  const s = status;
  return BUFF_TIMER_FIELDS.some((f) => typeof s[f] === "number");
}
function on(turns) {
  return turns > 0;
}
function borgCheatBuffTimers(temp, s) {
  if (!borgHasBuffTimers(s)) return;
  if (!temp.protFromEvil && on(s.protEvil)) temp.protFromEvil = true;
  if (!temp.fast && (on(s.fast) || on(s.sprint))) temp.fast = true;
  temp.resAcid = on(s.resAcid);
  temp.resElec = on(s.resElec);
  temp.resFire = on(s.resFire);
  temp.resCold = on(s.resCold);
  temp.resPois = on(s.resPois);
  temp.bless = on(s.blessed);
  temp.shield = on(s.shield) || on(s.stoneskin);
  temp.fastcast = on(s.fastcast);
  temp.hero = on(s.hero);
  temp.berserk = on(s.shero);
}

// src/trait/trait.ts
var SLOT_WIELD = 0;
var SLOT_BOW = 1;
var SLOT_LIGHT = 5;
var SLOT_BODY = 6;
var SLOT_FEET = 11;
var TV_SHOT = 2;
var TV_ARROW = 3;
var TV_BOLT = 4;
function borgNotice(ctx, opts = {}) {
  const R2 = resolveOpts(opts);
  const view = ctx.view;
  const p = view.player();
  const t = new Array(BI_MAX).fill(0);
  const d = resetDerived(ctx.world);
  t[146 /* BLOWS */] = 1;
  t[44 /* SPEED */] = 110;
  t[152 /* AMMO_TVAL */] = -1;
  t[153 /* AMMO_SIDES */] = 4;
  const cls = classIndexFromName(p.cls);
  const spellStat = spellStatForClass(cls);
  const c = {
    t,
    d,
    p,
    R: R2,
    equip: view.equipment(),
    inven: view.inventory(),
    temp: ctx.world.self.temp,
    cls,
    spellStat
  };
  borgNoticePlayer(c);
  borgNoticeEquipment(c);
  borgNoticeInventory(c);
  finishNotice(c);
  ctx.world.self.trait = t;
  const speed = t[44 /* SPEED */] ?? 110;
  ctx.world.self.gameRatio = speed > 110 ? Math.trunc(1e5 / ((speed - 110) * 10 + 100)) : 1e3;
}
function borgNoticePlayer(c) {
  const { t, p } = c;
  t[25 /* CLASS */] = c.cls;
  t[124 /* ISFIXLEV */] = p.level < p.maxLevel ? 1 : 0;
  t[35 /* CLEVEL */] = p.level;
  t[36 /* MAXCLEVEL */] = p.maxLevel;
  t[107 /* KING */] = p.winner ? 1 : 0;
  t[105 /* CDEPTH */] = p.depth;
  t[106 /* MAXDEPTH */] = p.maxDepth;
  t[125 /* ISFIXEXP */] = 0;
  if (p.exp < p.maxExp) {
    if (t[35 /* CLEVEL */] === 50 && t[105 /* CDEPTH */] === 0) t[125 /* ISFIXEXP */] = 1;
    if (t[35 /* CLEVEL */] === 50 && t[105 /* CDEPTH */] >= 1) t[125 /* ISFIXEXP */] = 0;
    if (t[35 /* CLEVEL */] !== 50) t[125 /* ISFIXEXP */] = 1;
  }
  t[45 /* GOLD */] = p.gold;
  if (buffTimerSafetyNetEnabled()) borgCheatBuffTimers(c.temp, p.status);
  t[27 /* CURHP */] = p.hp;
  t[28 /* MAXHP */] = p.maxHp;
  t[29 /* HP_ADJ */] = p.maxHp;
  t[30 /* CURSP */] = p.sp;
  t[31 /* MAXSP */] = p.maxSp;
  const food = p.status.food;
  if (food < PY_FOOD_WEAK) {
    t[108 /* ISWEAK */] = 1;
    t[109 /* ISHUNGRY */] = 1;
  } else if (food < PY_FOOD_HUNGRY) {
    t[109 /* ISHUNGRY */] = 1;
  } else if (food < PY_FOOD_FULL) {
  } else if (food < PY_FOOD_MAX) {
    t[110 /* ISFULL */] = 1;
  } else {
    t[111 /* ISGORGED */] = 1;
    t[110 /* ISFULL */] = 1;
  }
  t[112 /* ISBLIND */] = p.status.blind ? 1 : 0;
  t[114 /* ISCONFUSED */] = p.status.confused ? 1 : 0;
  t[113 /* ISAFRAID */] = p.status.afraid ? 1 : 0;
  t[115 /* ISPOISONED */] = p.status.poisoned ? 1 : 0;
  t[116 /* ISCUT */] = p.status.cut ? 1 : 0;
  if (p.status.stun && p.status.stun <= 50) t[117 /* ISSTUN */] = 1;
  if (p.status.stun > 50) t[118 /* ISHEAVYSTUN */] = 1;
  if (p.status.paralyzed > 50) t[119 /* ISPARALYZED */] = 1;
  const drained = c.R.frame.statDrained;
  for (let i = 0; i < STAT_MAX; i++) {
    t[10 /* CSTR */ + i] = p.stats[i] ?? 10;
    t[127 /* ISFIXSTR */ + i] = drained?.[i] ? 1 : 0;
  }
  t[44 /* SPEED */] = p.speed;
  t[26 /* LIGHT */] = p.light;
  t[52 /* INFRA */] = p.seeInfra;
}
function borgNoticeEquipment(c) {
  const { t, p, equip } = c;
  let extraShots = 0;
  let extraMight = 0;
  let myNumFire = 1;
  const pf = p.objectFlags;
  if (pf.includes("SLOW_DIGEST")) t[48 /* SDIG */] = 1;
  if (pf.includes("FEATHER")) t[49 /* FEATH */] = 1;
  if (pf.includes("REGEN")) t[50 /* REG */] = 1;
  if (pf.includes("TELEPATHY")) t[37 /* ESP */] = 1;
  if (pf.includes("SEE_INVIS")) t[51 /* SINV */] = 1;
  if (pf.includes("FREE_ACT")) t[86 /* FRACT */] = 1;
  if (pf.includes("HOLD_LIFE")) t[85 /* HLIFE */] = 1;
  if (pf.includes("IMPACT")) t[204 /* W_IMPACT */] = 1;
  if (pf.includes("AGGRAVATE")) t[174 /* CRSAGRV */] = 1;
  if (pf.includes("AFRAID")) t[186 /* CRSFEAR */] = 1;
  if (pf.includes("DRAIN_EXP")) t[187 /* CRSDRAIN_XP */] = 1;
  if (pf.includes("PROT_FEAR")) t[74 /* RFEAR */] = 1;
  if (pf.includes("PROT_BLIND")) t[77 /* RBLIND */] = 1;
  if (pf.includes("PROT_CONF")) t[78 /* RCONF */] = 1;
  if (pf.includes("SUST_STR")) t[20 /* SSTR */] = 1;
  if (pf.includes("SUST_INT")) t[21 /* SINT */] = 1;
  if (pf.includes("SUST_WIS")) t[22 /* SWIS */] = 1;
  if (pf.includes("SUST_DEX")) t[23 /* SDEX */] = 1;
  if (pf.includes("SUST_CON")) t[24 /* SCON */] = 1;
  for (let i = 0; i < equip.length; i++) {
    const item = equip[i];
    if (!present(item)) continue;
    if (item.curses.length > 0) {
      t[160 /* WHERE_CURSED */] = t[160 /* WHERE_CURSED */] | BORG_EQUIP;
      if (!t[159 /* FIRST_CURSED */]) t[159 /* FIRST_CURSED */] = i + 1;
    }
    t[260 /* WEIGHT */] = t[260 /* WEIGHT */] + item.weight * item.number;
    const known = c.R.frame.statKnown;
    t[5 /* ASTR */] = t[5 /* ASTR */] + mod(item, "STR") * (known ? known[0] ?? 0 : 1);
    t[6 /* AINT */] = t[6 /* AINT */] + mod(item, "INT") * (known ? known[1] ?? 0 : 1);
    t[7 /* AWIS */] = t[7 /* AWIS */] + mod(item, "WIS") * (known ? known[2] ?? 0 : 1);
    t[8 /* ADEX */] = t[8 /* ADEX */] + mod(item, "DEX") * (known ? known[3] ?? 0 : 1);
    t[9 /* ACON */] = t[9 /* ACON */] + mod(item, "CON") * (known ? known[4] ?? 0 : 1);
    t[193 /* WS_ANIMAL */] = slayMult(item, "ANIMAL");
    t[194 /* WS_EVIL */] = slayMult(item, "EVIL");
    t[195 /* WS_UNDEAD */] = slayMult(item, "UNDEAD");
    t[196 /* WS_DEMON */] = slayMult(item, "DEMON");
    t[197 /* WS_ORC */] = slayMult(item, "ORC");
    t[198 /* WS_TROLL */] = slayMult(item, "TROLL");
    t[199 /* WS_GIANT */] = slayMult(item, "GIANT");
    t[200 /* WS_DRAGON */] = slayMult(item, "DRAGON");
    if (hasBrand3(item, "ACID")) t[205 /* WB_ACID */] = 1;
    if (hasBrand3(item, "ELEC")) t[206 /* WB_ELEC */] = 1;
    if (hasBrand3(item, "FIRE")) t[207 /* WB_FIRE */] = 1;
    if (hasBrand3(item, "COLD")) t[208 /* WB_COLD */] = 1;
    if (hasBrand3(item, "POIS")) t[209 /* WB_POIS */] = 1;
    if (hasFlag2(item, "IMPACT")) t[204 /* W_IMPACT */] = 1;
    t[52 /* INFRA */] = t[52 /* INFRA */] + mod(item, "INFRA");
    t[58 /* STL */] = t[58 /* STL */] + mod(item, "STEALTH");
    t[59 /* SRCH */] = t[59 /* SRCH */] + mod(item, "SEARCH") * 5;
    let dig = 0;
    if (hasFlag2(item, "DIG_1")) dig = 1;
    else if (hasFlag2(item, "DIG_2")) dig = 2;
    else if (hasFlag2(item, "DIG_3")) dig = 3;
    dig += mod(item, "TUNNEL");
    t[63 /* DIG */] = t[63 /* DIG */] + dig * 20;
    t[44 /* SPEED */] = t[44 /* SPEED */] + mod(item, "SPEED");
    if (i !== SLOT_WIELD) t[147 /* EXTRA_BLOWS */] = t[147 /* EXTRA_BLOWS */] + mod(item, "BLOWS");
    extraShots += mod(item, "SHOTS");
    extraMight += mod(item, "MIGHT");
    if (i !== SLOT_LIGHT || hasFlag2(item, "NO_FUEL") || item.timeout !== 0) {
      t[26 /* LIGHT */] = t[26 /* LIGHT */] + mod(item, "LIGHT");
      if (hasFlag2(item, "LIGHT_2")) t[26 /* LIGHT */] = t[26 /* LIGHT */] + 2;
      else if (hasFlag2(item, "LIGHT_3")) t[26 /* LIGHT */] = t[26 /* LIGHT */] + 3;
      if (mod(item, "LIGHT") > 0 && c.cls === CLASS_NECROMANCER) t[26 /* LIGHT */] = t[26 /* LIGHT */] - 1;
      t[26 /* LIGHT */] = t[26 /* LIGHT */] + mod(item, "LIGHT");
    }
    t[46 /* MOD_MOVES */] = t[46 /* MOD_MOVES */] + mod(item, "MOVES");
    t[47 /* DAM_RED */] = t[47 /* DAM_RED */] + mod(item, "DAM_RED");
    if (hasFlag2(item, "SLOW_DIGEST")) t[48 /* SDIG */] = 1;
    if (hasFlag2(item, "AGGRAVATE")) t[174 /* CRSAGRV */] = 1;
    if (hasFlag2(item, "IMPAIR_HP")) t[182 /* CRSHPIMP */] = 1;
    if (hasFlag2(item, "IMPAIR_MANA")) t[183 /* CRSMPIMP */] = 1;
    if (hasFlag2(item, "AFRAID")) t[186 /* CRSFEAR */] = 1;
    if (hasFlag2(item, "DRAIN_EXP")) t[187 /* CRSDRAIN_XP */] = 1;
    applyCurses(t, item);
    if (resLevel(item, "FIRE") === -1) t[188 /* CRSFVULN */] = 1;
    if (resLevel(item, "ACID") === -1) t[191 /* CRSAVULN */] = 1;
    if (resLevel(item, "COLD") === -1) t[190 /* CRSCVULN */] = 1;
    if (resLevel(item, "ELEC") === -1) t[189 /* CRSEVULN */] = 1;
    if (hasFlag2(item, "REGEN")) t[50 /* REG */] = 1;
    if (hasFlag2(item, "TELEPATHY")) t[37 /* ESP */] = 1;
    if (hasFlag2(item, "SEE_INVIS")) t[51 /* SINV */] = 1;
    if (hasFlag2(item, "FEATHER")) t[49 /* FEATH */] = 1;
    if (hasFlag2(item, "FREE_ACT")) t[86 /* FRACT */] = 1;
    if (hasFlag2(item, "HOLD_LIFE")) t[85 /* HLIFE */] = 1;
    if (hasFlag2(item, "PROT_CONF")) t[78 /* RCONF */] = 1;
    if (hasFlag2(item, "PROT_BLIND")) t[77 /* RBLIND */] = 1;
    if (resLevel(item, "FIRE") === 3) t[64 /* IFIRE */] = t[69 /* RFIRE */] = 1;
    if (resLevel(item, "ACID") === 3) t[65 /* IACID */] = t[72 /* RACID */] = 1;
    if (resLevel(item, "COLD") === 3) t[66 /* ICOLD */] = t[70 /* RCOLD */] = 1;
    if (resLevel(item, "ELEC") === 3) t[67 /* IELEC */] = t[71 /* RELEC */] = 1;
    if (resLevel(item, "ACID") > 0) t[72 /* RACID */] = 1;
    if (resLevel(item, "ELEC") > 0) t[71 /* RELEC */] = 1;
    if (resLevel(item, "FIRE") > 0) t[69 /* RFIRE */] = 1;
    if (resLevel(item, "COLD") > 0) t[70 /* RCOLD */] = 1;
    if (resLevel(item, "POIS") > 0) t[73 /* RPOIS */] = 1;
    if (resLevel(item, "SOUND") > 0) t[79 /* RSND */] = 1;
    if (resLevel(item, "LIGHT") > 0) t[75 /* RLITE */] = 1;
    if (resLevel(item, "DARK") > 0) t[76 /* RDARK */] = 1;
    if (resLevel(item, "CHAOS") > 0) t[83 /* RKAOS */] = 1;
    if (resLevel(item, "DISEN") > 0) t[84 /* RDIS */] = 1;
    if (resLevel(item, "SHARD") > 0) t[80 /* RSHRD */] = 1;
    if (resLevel(item, "NEXUS") > 0) t[81 /* RNXUS */] = 1;
    if (resLevel(item, "NETHER") > 0) t[82 /* RNTHR */] = 1;
    if (hasFlag2(item, "SUST_STR")) t[20 /* SSTR */] = 1;
    if (hasFlag2(item, "SUST_INT")) t[21 /* SINT */] = 1;
    if (hasFlag2(item, "SUST_WIS")) t[22 /* SWIS */] = 1;
    if (hasFlag2(item, "SUST_DEX")) t[23 /* SDEX */] = 1;
    if (hasFlag2(item, "SUST_CON")) t[24 /* SCON */] = 1;
    const bonuses = (resLevel(item, "POIS") > 0 ? 1 : 0) + (resLevel(item, "SOUND") > 0 ? 1 : 0) + (resLevel(item, "SHARD") > 0 ? 1 : 0) + (resLevel(item, "NEXUS") > 0 ? 1 : 0) + (resLevel(item, "NETHER") > 0 ? 1 : 0) + (resLevel(item, "CHAOS") > 0 ? 1 : 0) + (resLevel(item, "DISEN") > 0 ? 1 : 0) + (resLevel(item, "FIRE") > 0 && resLevel(item, "COLD") > 0 && resLevel(item, "ELEC") > 0 && resLevel(item, "ACID") > 0 ? 1 : 0) + (hasFlag2(item, "SUST_STR") && hasFlag2(item, "SUST_INT") && hasFlag2(item, "SUST_WIS") && hasFlag2(item, "SUST_DEX") && hasFlag2(item, "SUST_CON") ? 1 : 0);
    if (bonuses > 2) t[258 /* MULTIPLE_BONUSES */] = t[258 /* MULTIPLE_BONUSES */] + bonuses;
    let toA = item.toA;
    if (!item.artifact && !item.ego && item.ac >= 1 && toA + item.ac <= 0) {
      toA = -20;
    }
    t[133 /* ARMOR */] = t[133 /* ARMOR */] + item.ac + toA;
    if (i === SLOT_WIELD || i === SLOT_BOW) continue;
    t[134 /* TOHIT */] = t[134 /* TOHIT */] + item.toH;
    t[135 /* TODAM */] = t[135 /* TODAM */] + item.toD;
  }
  if (c.cls === CLASS_NECROMANCER && t[26 /* LIGHT */] <= 0) t[26 /* LIGHT */] = 1;
  if (t[175 /* CRSVULN */]) {
    t[174 /* CRSAGRV */] = 1;
    t[133 /* ARMOR */] = t[133 /* ARMOR */] - 50;
  }
  if (t[181 /* CRSANNOY */]) {
    t[58 /* STL */] = t[58 /* STL */] - 10;
    t[174 /* CRSAGRV */] = 1;
  }
  const statAdj = c.R.frame.statAdj;
  for (let i = 0; i < STAT_MAX; i++) {
    let add = t[5 /* ASTR */ + i];
    add += statAdj ? statAdj[i] ?? 0 : 0;
    const use = modifyStatValue(t[10 /* CSTR */ + i], add);
    t[15 /* STR_INDEX */ + i] = statToIndex(use);
    t[0 /* STR */ + i] = use;
  }
  const strIdx = t[15 /* STR_INDEX */];
  const dexIdx = t[18 /* DEX_INDEX */];
  if (c.spellStat >= 0) {
    const si = t[15 /* STR_INDEX */ + c.spellStat];
    const spellFirst = c.R.frame.spellFirst ?? 1;
    t[32 /* SP_ADJ */] = Math.trunc(
      BORG_ADJ_MAG_MANA[si] * (t[35 /* CLEVEL */] - spellFirst + 1) / 2
    );
    t[33 /* FAIL1 */] = BORG_ADJ_MAG_STAT[si];
    t[34 /* FAIL2 */] = BORG_ADJ_MAG_FAIL[si];
  }
  t[133 /* ARMOR */] = t[133 /* ARMOR */] + BORG_ADJ_DEX_TA[dexIdx];
  t[135 /* TODAM */] = t[135 /* TODAM */] + BORG_ADJ_STR_TD[strIdx];
  t[134 /* TOHIT */] = t[134 /* TOHIT */] + BORG_ADJ_DEX_TH[dexIdx];
  t[134 /* TOHIT */] = t[134 /* TOHIT */] + BORG_ADJ_STR_TH[strIdx];
  const hold = ADJ_STR_HOLD[strIdx];
  t[63 /* DIG */] = t[63 /* DIG */] + BORG_ADJ_STR_DIG[strIdx];
  const bow = equip[SLOT_BOW];
  if (present(bow) && bow.curses.length === 0) {
    t[142 /* BTOHIT */] = bow.toH;
    t[143 /* BTODAM */] = bow.toD;
    t[141 /* BID */] = 1;
    t[145 /* BART */] = bow.artifact ? 1 : 0;
    if (hold < bow.weight / 10) {
      t[150 /* HEAVYBOW */] = 1;
      t[134 /* TOHIT */] = t[134 /* TOHIT */] + 2 * (hold - Math.trunc(bow.weight / 10));
    }
    if (hold >= bow.weight / 10) {
      const sv = c.R.svals;
      if (bow.sval === sv.sling) {
        t[152 /* AMMO_TVAL */] = TV_SHOT;
        t[153 /* AMMO_SIDES */] = 3;
        t[154 /* AMMO_POWER */] = 2;
      } else if (bow.sval === sv.short_bow) {
        t[152 /* AMMO_TVAL */] = TV_ARROW;
        t[153 /* AMMO_SIDES */] = 4;
        t[154 /* AMMO_POWER */] = 2;
      } else if (bow.sval === sv.long_bow) {
        t[152 /* AMMO_TVAL */] = TV_ARROW;
        t[153 /* AMMO_SIDES */] = 4;
        t[154 /* AMMO_POWER */] = 3;
      } else if (bow.sval === sv.light_xbow) {
        t[152 /* AMMO_TVAL */] = TV_BOLT;
        t[153 /* AMMO_SIDES */] = 5;
        t[154 /* AMMO_POWER */] = 3;
      } else if (bow.sval === sv.heavy_xbow) {
        t[152 /* AMMO_TVAL */] = TV_BOLT;
        t[153 /* AMMO_SIDES */] = 5;
        t[154 /* AMMO_POWER */] = 4;
      }
      t[154 /* AMMO_POWER */] = t[154 /* AMMO_POWER */] + extraMight;
      if (c.R.spells.playerHas("FAST_SHOT")) {
        if (t[152 /* AMMO_TVAL */] === TV_ARROW && t[35 /* CLEVEL */] >= 20) myNumFire++;
        if (t[35 /* CLEVEL */] >= 40) myNumFire++;
        t[53 /* FAST_SHOTS */] = 1;
      }
      myNumFire += extraShots;
      if (myNumFire < 1) myNumFire = 1;
    }
    t[144 /* SLING */] = bow.sval === c.R.svals.sling ? 1 : 0;
  }
  if (present(bow) && p.shots > 0) t[148 /* SHOTS */] = Math.trunc(p.shots / 10) || 1;
  else t[148 /* SHOTS */] = myNumFire;
  const wep = equip[SLOT_WIELD];
  if (present(wep) && wep.curses.length === 0) {
    t[136 /* WTOHIT */] = wep.toH;
    t[137 /* WTODAM */] = wep.toD;
    t[138 /* WID */] = 1;
    t[139 /* WDD */] = wep.dd;
    t[140 /* WDS */] = wep.ds;
    if (hold < wep.weight / 10) {
      t[149 /* HEAVYWEPON */] = 1;
      t[134 /* TOHIT */] = t[134 /* TOHIT */] + 2 * (hold - Math.trunc(wep.weight / 10));
    }
    if (hold >= wep.weight / 10) {
      t[146 /* BLOWS */] = p.blows > 0 ? Math.trunc(p.blows / 100) || 1 : 1;
      t[63 /* DIG */] = t[63 /* DIG */] + Math.trunc(wep.weight / 10);
    }
  }
  const sk = p.skills;
  if (sk.length >= 10) {
    t[54 /* DISP */] = sk[0];
    t[55 /* DISM */] = sk[1];
    t[56 /* DEV */] = sk[2];
    t[57 /* SAV */] = sk[3];
    t[59 /* SRCH */] = t[59 /* SRCH */] + sk[4];
    t[58 /* STL */] = t[58 /* STL */] + sk[5];
    t[60 /* THN */] = sk[6];
    t[61 /* THB */] = sk[7];
    t[62 /* THT */] = sk[8];
    t[63 /* DIG */] = t[63 /* DIG */] + sk[9];
  }
  if (c.R.spells.playerHas("BRAVERY_30") && t[35 /* CLEVEL */] >= 30) t[74 /* RFEAR */] = 1;
  if (t[58 /* STL */] > 30) t[58 /* STL */] = 30;
  if (t[58 /* STL */] < 0) t[58 /* STL */] = 0;
  if (t[63 /* DIG */] < 1) t[63 /* DIG */] = 1;
  if (t[113 /* ISAFRAID */] || t[186 /* CRSFEAR */]) {
    t[134 /* TOHIT */] = t[134 /* TOHIT */] - 20;
    t[133 /* ARMOR */] = t[133 /* ARMOR */] + 8;
    t[56 /* DEV */] = Math.trunc(t[56 /* DEV */] * 95 / 100);
  }
  if (present(wep) && c.R.spells.playerHas("BLESS_WEAPON") && hasFlag2(wep, "BLESSED")) {
    t[134 /* TOHIT */] = t[134 /* TOHIT */] + 2;
    t[135 /* TODAM */] = t[135 /* TODAM */] + 2;
  }
  const enchLimit = c.R.cfg.enchantLimit;
  for (let i = SLOT_WIELD; i <= SLOT_BOW; i++) {
    const item = equip[i];
    if (!present(item)) continue;
    if (item.curses.length > 0) continue;
    if (i === SLOT_BOW && t[154 /* AMMO_POWER */] < 3 && !item.artifact && !item.ego)
      continue;
    const canEnch = c.R.spells.spellLegalFail("ENCHANT_WEAPON", 65) || t[236 /* AENCH_SWEP */] >= 1;
    const hLimit = canEnch ? enchLimit : 8;
    if (item.toH < hLimit) t[241 /* NEED_ENCHANT_TO_H */] = t[241 /* NEED_ENCHANT_TO_H */] + hLimit - item.toH;
    if (item.toD < hLimit) t[242 /* NEED_ENCHANT_TO_D */] = t[242 /* NEED_ENCHANT_TO_D */] + hLimit - item.toD;
  }
  for (let i = SLOT_BODY; i <= SLOT_FEET; i++) {
    const item = equip[i];
    if (!present(item)) continue;
    if (item.curses.length > 0) continue;
    const canEnch = c.R.spells.spellLegalFail("ENCHANT_ARMOUR", 65) || t[238 /* AENCH_SARM */] >= 1;
    const aLimit = canEnch ? enchLimit : 8;
    if (item.toA < aLimit) t[240 /* NEED_ENCHANT_TO_A */] = t[240 /* NEED_ENCHANT_TO_A */] + aLimit - item.toA;
  }
  if (t[105 /* CDEPTH */] === 0 && c.R.spells.spellLegal("SENSE_INVISIBLE"))
    t[51 /* SINV */] = 1;
  if (t[57 /* SAV */] >= 100) t[86 /* FRACT */] = 1;
  if (t[57 /* SAV */] >= 100 && t[76 /* RDARK */] && t[75 /* RLITE */]) t[77 /* RBLIND */] = 1;
}
function applyCurses(t, item) {
  for (const name of item.curses) {
    switch (name) {
      case "vulnerability":
        t[175 /* CRSVULN */] = 1;
        break;
      case "teleportation":
        t[163 /* CRSTELE */] = 1;
        break;
      case "dullness":
        t[176 /* CRSDULL */] = 1;
        break;
      case "sickliness":
        t[177 /* CRSSICK */] = 1;
        break;
      case "enveloping":
        t[161 /* CRSENVELOPING */] = 1;
        break;
      case "irritation":
        t[174 /* CRSAGRV */] = 1;
        t[162 /* CRSIRRITATION */] = 1;
        break;
      case "weakness":
        t[178 /* CRSWEAK */] = 1;
        break;
      case "clumsiness":
        t[179 /* CRSCLUM */] = 1;
        break;
      case "slowness":
        t[180 /* CRSSLOW */] = 1;
        break;
      case "annoyance":
        t[181 /* CRSANNOY */] = 1;
        break;
      case "poison":
        t[164 /* CRSPOIS */] = 1;
        break;
      case "siren":
        t[165 /* CRSSIREN */] = 1;
        break;
      case "hallucination":
        t[166 /* CRSHALU */] = 1;
        break;
      case "paralysis":
        t[167 /* CRSPARA */] = 1;
        break;
      case "demon summon":
        t[168 /* CRSSDEM */] = 1;
        break;
      case "dragon summon":
        t[169 /* CRSSDRA */] = 1;
        break;
      case "undead summon":
        t[170 /* CRSSUND */] = 1;
        break;
      case "impair mana recovery":
        t[183 /* CRSMPIMP */] = 1;
        break;
      case "impair hitpoint recovery":
        t[182 /* CRSHPIMP */] = 1;
        break;
      case "cowardice":
        t[186 /* CRSFEAR */] = 1;
        break;
      case "stone":
        t[171 /* CRSSTONE */] = 1;
        break;
      case "anti-teleportation":
        t[172 /* CRSNOTEL */] = 1;
        break;
      case "treacherous weapon":
        t[173 /* CRSTWEP */] = 1;
        break;
      case "burning up":
        t[188 /* CRSFVULN */] = 1;
        t[70 /* RCOLD */] = 1;
        break;
      case "chilled to the bone":
        t[190 /* CRSCVULN */] = 1;
        t[69 /* RFIRE */] = 1;
        break;
      case "steelskin":
        t[184 /* CRSSTEELSKIN */] = 1;
        break;
      case "air swing":
        t[185 /* CRSAIRSWING */] = 1;
        break;
      default:
        t[192 /* CRSUNKNO */] = 1;
        break;
    }
  }
}
function borgNoticeInventory(c) {
  const { t, d, inven, R: R2 } = c;
  const sv = R2.svals;
  const equip = c.equip;
  for (const item of inven) {
    if (!present(item)) continue;
    if (isAmmoTval(item.tval)) {
      noticeAmmo(c, item);
      continue;
    }
    t[260 /* WEIGHT */] = t[260 /* WEIGHT */] + item.weight * item.number;
    if (item.curses.length > 0) {
      t[160 /* WHERE_CURSED */] = t[160 /* WHERE_CURSED */] | BORG_INVEN;
      if (!t[159 /* FIRST_CURSED */]) t[159 /* FIRST_CURSED */] = 1;
    }
    creditHas(c, item);
    switch (item.tval) {
      case TV_MUSHROOM:
      case TV_FOOD:
        noticeFood(c, item);
        break;
      case TV_POTION:
        if (item.sval === sv.potion_healing) t[214 /* AHEAL */] = t[214 /* AHEAL */] + item.number;
        else if (item.sval === sv.potion_star_healing) t[215 /* AEZHEAL */] = t[215 /* AEZHEAL */] + item.number;
        else if (item.sval === sv.potion_life) t[216 /* ALIFE */] = t[216 /* ALIFE */] + item.number;
        else if (item.sval === sv.potion_cure_critical) t[231 /* ACCW */] = t[231 /* ACCW */] + item.number;
        else if (item.sval === sv.potion_cure_serious) t[232 /* ACSW */] = t[232 /* ACSW */] + item.number;
        else if (item.sval === sv.potion_cure_light) t[233 /* ACLW */] = t[233 /* ACLW */] + item.number;
        else if (item.sval === sv.potion_cure_poison) t[222 /* ACUREPOIS */] = t[222 /* ACUREPOIS */] + item.number;
        else if (item.sval === sv.potion_resist_heat) t[244 /* ARESHEAT */] = t[244 /* ARESHEAT */] + item.number;
        else if (item.sval === sv.potion_resist_cold) t[245 /* ARESCOLD */] = t[245 /* ARESCOLD */] + item.number;
        else if (item.sval === sv.potion_resist_pois) t[246 /* ARESPOIS */] = t[246 /* ARESPOIS */] + item.number;
        else if (item.sval === sv.potion_inc_str) d.amtStatgain[0] += item.number;
        else if (item.sval === sv.potion_inc_int) d.amtStatgain[1] += item.number;
        else if (item.sval === sv.potion_inc_wis) d.amtStatgain[2] += item.number;
        else if (item.sval === sv.potion_inc_dex) d.amtStatgain[3] += item.number;
        else if (item.sval === sv.potion_inc_con) d.amtStatgain[4] += item.number;
        else if (item.sval === sv.potion_inc_all)
          for (let s = 0; s < STAT_MAX; s++) d.amtStatgain[s] += item.number;
        else if (item.sval === sv.potion_restore_life) t[126 /* HASFIXEXP */] = 1;
        else if (item.sval === sv.potion_speed) t[218 /* ASPEED */] = t[218 /* ASPEED */] + item.number;
        break;
      case TV_SCROLL:
        if (item.sval === sv.scroll_identify) t[217 /* AID */] = t[217 /* AID */] + item.number;
        else if (item.sval === sv.scroll_recharging) t[227 /* ARECHARGE */] = t[227 /* ARECHARGE */] + item.number;
        else if (item.sval === sv.scroll_phase_door) t[210 /* APHASE */] = t[210 /* APHASE */] + item.number;
        else if (item.sval === sv.scroll_teleport) t[211 /* ATELEPORT */] = t[211 /* ATELEPORT */] + item.number;
        else if (item.sval === sv.scroll_word_of_recall) t[38 /* RECALL */] = t[38 /* RECALL */] + item.number;
        else if (item.sval === sv.scroll_enchant_armor) t[237 /* AENCH_ARM */] = t[237 /* AENCH_ARM */] + item.number;
        else if (item.sval === sv.scroll_star_enchant_armor) t[238 /* AENCH_SARM */] = t[238 /* AENCH_SARM */] + item.number;
        else if (item.sval === sv.scroll_enchant_weapon_to_hit) t[234 /* AENCH_TOH */] = t[234 /* AENCH_TOH */] + item.number;
        else if (item.sval === sv.scroll_enchant_weapon_to_dam) t[235 /* AENCH_TOD */] = t[235 /* AENCH_TOD */] + item.number;
        else if (item.sval === sv.scroll_star_enchant_weapon) t[236 /* AENCH_SWEP */] = t[236 /* AENCH_SWEP */] + item.number;
        else if (item.sval === sv.scroll_protection_from_evil) t[229 /* APFE */] = t[229 /* APFE */] + item.number;
        else if (item.sval === sv.scroll_rune_of_protection) t[230 /* AGLYPH */] = t[230 /* AGLYPH */] + item.number;
        else if (item.sval === sv.scroll_teleport_level) {
          t[247 /* ATELEPORTLVL */] = t[247 /* ATELEPORTLVL */] + item.number;
          t[211 /* ATELEPORT */] = t[211 /* ATELEPORT */] + 1;
        } else if (item.sval === sv.scroll_mass_banishment) t[249 /* AMASSBAN */] = t[249 /* AMASSBAN */] + item.number;
        break;
      case TV_ROD:
        noticeRod(c, item);
        break;
      case TV_WAND:
        if (item.sval === sv.wand_teleport_away) t[221 /* ATPORTOTHER */] = t[221 /* ATPORTOTHER */] + item.pval;
        if (item.sval === sv.wand_stinking_cloud && t[106 /* MAXDEPTH */] < 30)
          t[257 /* GOOD_W_CHG */] = t[257 /* GOOD_W_CHG */] + item.pval;
        if (item.sval === sv.wand_magic_missile && t[106 /* MAXDEPTH */] < 30)
          t[257 /* GOOD_W_CHG */] = t[257 /* GOOD_W_CHG */] + item.pval;
        if (item.sval === sv.wand_annihilation) t[257 /* GOOD_W_CHG */] = t[257 /* GOOD_W_CHG */] + item.pval;
        break;
      case TV_STAFF:
        if (item.sval === sv.staff_teleportation) t[212 /* AESCAPE */] = t[212 /* AESCAPE */] + item.number;
        else if (item.sval === sv.staff_speed) t[218 /* ASPEED */] = t[218 /* ASPEED */] + item.pval;
        else if (item.sval === sv.staff_healing) t[214 /* AHEAL */] = t[214 /* AHEAL */] + item.pval;
        else if (item.sval === sv.staff_the_magi) t[219 /* ASTFMAGI */] = t[219 /* ASTFMAGI */] + item.pval;
        else if (item.sval === sv.staff_destruction) t[220 /* ASTFDEST */] = t[220 /* ASTFDEST */] + item.pval;
        else if (item.sval === sv.staff_power) t[256 /* GOOD_S_CHG */] = t[256 /* GOOD_S_CHG */] + item.number;
        else if (item.sval === sv.staff_holiness) {
          t[256 /* GOOD_S_CHG */] = t[256 /* GOOD_S_CHG */] + item.number;
          t[214 /* AHEAL */] = t[214 /* AHEAL */] + item.pval;
        }
        break;
      case TV_FLASK:
        if (equip[SLOT_LIGHT]?.sval === sv.light_lantern) t[213 /* AFUEL */] = t[213 /* AFUEL */] + item.number;
        break;
      case TV_LIGHT: {
        const light = equip[SLOT_LIGHT];
        if (item.sval === sv.light_torch && item.timeout >= 1 && light?.sval === sv.light_torch && present(light))
          t[213 /* AFUEL */] = t[213 /* AFUEL */] + item.number;
        break;
      }
      case TV_DIGGING:
        if (item.number > 0 && item.curses.length === 0 && t[63 /* DIG */] >= BORG_DIG)
          t[255 /* ADIGGER */] = t[255 /* ADIGGER */] + item.number;
        break;
      default:
        break;
    }
  }
  applySpellGrants(c);
  if (hasFlag2(equip[SLOT_LIGHT] ?? emptyItem(), "NO_FUEL") || c.cls === CLASS_NECROMANCER)
    t[213 /* AFUEL */] = t[213 /* AFUEL */] + 1e3;
  if (t[10 /* CSTR */] < 18 + 100) d.needStatgain[0] = true;
  if (t[11 /* CINT */] < 18 + 100) d.needStatgain[1] = true;
  if (t[12 /* CWIS */] < 18 + 100) d.needStatgain[2] = true;
  if (t[13 /* CDEX */] < 18 + 100) d.needStatgain[3] = true;
  if (t[14 /* CCON */] < 18 + 100) d.needStatgain[4] = true;
  if (!t[125 /* ISFIXEXP */]) t[126 /* HASFIXEXP */] = 1;
  t[39 /* FOOD */] = t[39 /* FOOD */] + t[40 /* FOOD_HI */];
  t[39 /* FOOD */] = t[39 /* FOOD */] + t[41 /* FOOD_LO */];
  if (t[108 /* ISWEAK */] && t[39 /* FOOD */] >= 1e3) t[39 /* FOOD */] = t[39 /* FOOD */] - 1e3;
}
function noticeAmmo(c, item) {
  const { t } = c;
  t[260 /* WEIGHT */] = t[260 /* WEIGHT */] + item.weight * item.number;
  t[151 /* AMMO_COUNT */] = t[151 /* AMMO_COUNT */] + item.number;
  if (item.tval !== t[152 /* AMMO_TVAL */]) return;
  t[155 /* AMISSILES */] = t[155 /* AMISSILES */] + item.number;
  if (item.curses.length > 0) {
    t[160 /* WHERE_CURSED */] = t[160 /* WHERE_CURSED */] | BORG_QUILL;
    if (!t[159 /* FIRST_CURSED */]) t[159 /* FIRST_CURSED */] = 1;
    t[157 /* AMISSILES_CURSED */] = t[157 /* AMISSILES_CURSED */] + item.number;
    return;
  }
  if (item.ego) t[156 /* AMISSILES_SPECIAL */] = t[156 /* AMISSILES_SPECIAL */] + item.number;
}
function noticeFood(c, item) {
  const { t, R: R2 } = c;
  const sv = R2.svals;
  if (item.tval === TV_FOOD) {
    if (item.sval === sv.food_apple || item.sval === sv.food_handful || item.sval === sv.food_slime_mold || item.sval === sv.food_pint || item.sval === sv.food_sip)
      t[41 /* FOOD_LO */] = t[41 /* FOOD_LO */] + item.number;
    else if (item.sval === sv.food_ration || item.sval === sv.food_slice || item.sval === sv.food_honey_cake || item.sval === sv.food_waybread || item.sval === sv.food_draught)
      t[40 /* FOOD_HI */] = t[40 /* FOOD_HI */] + item.number;
  }
}
function noticeRod(c, item) {
  const { t, R: R2 } = c;
  const sv = R2.svals;
  if (item.sval === sv.rod_recall) t[38 /* RECALL */] = t[38 /* RECALL */] + item.number * 100;
  else if (item.sval === sv.rod_detection) {
    t[223 /* ADETTRAP */] = t[223 /* ADETTRAP */] + item.number * 100;
    t[224 /* ADETDOOR */] = t[224 /* ADETDOOR */] + item.number * 100;
    t[225 /* ADETEVIL */] = t[225 /* ADETEVIL */] + item.number * 100;
  } else if (item.sval === sv.rod_illumination) t[228 /* ALITE */] = t[228 /* ALITE */] + item.number * 100;
  else if (item.sval === sv.rod_speed) t[218 /* ASPEED */] = t[218 /* ASPEED */] + item.number * 100;
  else if (item.sval === sv.rod_mapping) t[226 /* AMAGICMAP */] = t[226 /* AMAGICMAP */] + item.number * 100;
  else if (item.sval === sv.rod_healing) t[214 /* AHEAL */] = t[214 /* AHEAL */] + item.number * 3;
  else if (item.sval === sv.rod_light || item.sval === sv.rod_fire_bolt || item.sval === sv.rod_elec_bolt || item.sval === sv.rod_cold_bolt || item.sval === sv.rod_acid_bolt)
    t[251 /* AROD1 */] = t[251 /* AROD1 */] + item.number;
  else if (item.sval === sv.rod_drain_life || item.sval === sv.rod_fire_ball || item.sval === sv.rod_elec_ball || item.sval === sv.rod_cold_ball || item.sval === sv.rod_acid_ball)
    t[252 /* AROD2 */] = t[252 /* AROD2 */] + item.number;
}
function creditHas(c, item) {
  const { d, R: R2 } = c;
  const sv = R2.svals;
  const roleFor = [
    [TV_POTION, sv.potion_healing, "potion_healing"],
    [TV_POTION, sv.potion_restore_mana, "potion_restore_mana"],
    [TV_ROD, sv.rod_recall, "rod_recall"],
    [TV_ROD, sv.rod_healing, "rod_healing"],
    [TV_MUSHROOM, sv.mush_stoneskin, "mush_stoneskin"],
    [TV_SCROLL, sv.scroll_mass_banishment, "scroll_mass_banishment"],
    [TV_SCROLL, sv.scroll_remove_curse, "scroll_remove_curse"],
    [TV_SCROLL, sv.scroll_star_remove_curse, "scroll_star_remove_curse"],
    [TV_WAND, sv.wand_magic_missile, "wand_magic_missile"],
    [TV_WAND, sv.wand_stinking_cloud, "wand_stinking_cloud"],
    [TV_WAND, sv.wand_annihilation, "wand_annihilation"],
    [TV_FLASK, sv.flask_oil, "flask_oil"]
  ];
  for (const [tval, sval, role] of roleFor) {
    if (sval !== void 0 && item.tval === tval && item.sval === sval)
      addHas(d, role, item.number);
  }
}
function applySpellGrants(c) {
  const { t, R: R2 } = c;
  const s = R2.spells;
  const legal = (sp) => s.spellLegal(sp);
  const fail = (sp, f) => s.spellLegalFail(sp, f);
  const eq = (a) => s.equipsItem(a);
  if (fail("REMOVE_HUNGER", 80) || fail("HERBAL_CURING", 80)) t[39 /* FOOD */] = t[39 /* FOOD */] + 1e3;
  if (legal("IDENTIFY_RUNE")) t[217 /* AID */] = t[217 /* AID */] + 1e3;
  if (legal("FIND_TRAPS_DOORS_STAIRS") || legal("DETECTION")) t[223 /* ADETTRAP */] = 1e3;
  if (legal("REVEAL_MONSTERS") || legal("DETECT_LIFE") || legal("DETECT_EVIL") || legal("READ_MINDS") || legal("DETECT_MONSTERS") || legal("SEEK_BATTLE"))
    t[225 /* ADETEVIL */] = 1e3;
  if (legal("DETECTION") || eq("act_enlightenment") || eq("act_clairvoyance")) {
    t[224 /* ADETDOOR */] = 1e3;
    t[223 /* ADETTRAP */] = 1e3;
    t[225 /* ADETEVIL */] = 1e3;
  }
  if (legal("SENSE_INVISIBLE")) t[259 /* DINV */] = 1;
  if (legal("SENSE_SURROUNDINGS") || eq("act_detect_all") || eq("act_mapping")) {
    t[224 /* ADETDOOR */] = 1e3;
    t[223 /* ADETTRAP */] = 1e3;
    t[226 /* AMAGICMAP */] = 1e3;
  }
  if (legal("LIGHT_ROOM") || eq("act_light") || eq("act_illumination") || legal("CALL_LIGHT"))
    t[228 /* ALITE */] = t[228 /* ALITE */] + 1e3;
  if (legal("PROTECTION_FROM_EVIL") || eq("act_protevil") || eq("act_staff_holy"))
    t[229 /* APFE */] = t[229 /* APFE */] + 1e3;
  if (legal("GLYPH_OF_WARDING") || eq("act_glyph")) t[230 /* AGLYPH */] = t[230 /* AGLYPH */] + 1e3;
  if (legal("FIND_TRAPS_DOORS_STAIRS")) {
    t[224 /* ADETDOOR */] = 1e3;
    t[223 /* ADETTRAP */] = 1e3;
  }
  if (fail("ENCHANT_WEAPON", 65) || eq("act_enchant_weapon")) {
    t[234 /* AENCH_TOH */] = t[234 /* AENCH_TOH */] + 1e3;
    t[235 /* AENCH_TOD */] = t[235 /* AENCH_TOD */] + 1e3;
    t[236 /* AENCH_SWEP */] = t[236 /* AENCH_SWEP */] + 1e3;
  }
  if (eq("act_enchant_tohit")) t[234 /* AENCH_TOH */] = t[234 /* AENCH_TOH */] + 1e3;
  if (eq("act_enchant_todam")) t[235 /* AENCH_TOD */] = t[235 /* AENCH_TOD */] + 1e3;
  if (eq("act_firebrand") || fail("BRAND_AMMUNITION", 65)) t[239 /* ABRAND */] = t[239 /* ABRAND */] + 1e3;
  if (fail("ENCHANT_ARMOUR", 65) || eq("act_enchant_armor") || eq("act_enchant_armor2")) {
    t[237 /* AENCH_ARM */] = t[237 /* AENCH_ARM */] + 1e3;
    t[238 /* AENCH_SARM */] = t[238 /* AENCH_SARM */] + 1e3;
  }
  if (fail("TURN_STONE_TO_MUD", 40) || eq("act_stone_to_mud") || s.equipsRing(c.R.svals.ring_digging ?? -999))
    t[255 /* ADIGGER */] = t[255 /* ADIGGER */] + 1;
  if (fail("WORD_OF_RECALL", 40) || t[105 /* CDEPTH */] === 100 && legal("WORD_OF_RECALL"))
    t[38 /* RECALL */] = t[38 /* RECALL */] + 1e3;
  if (eq("act_recall")) t[38 /* RECALL */] = t[38 /* RECALL */] + 1;
  if (fail("TELEPORT_LEVEL", 20)) t[247 /* ATELEPORTLVL */] = t[247 /* ATELEPORTLVL */] + 1e3;
  if (fail("PHASE_DOOR", 3)) t[210 /* APHASE */] = t[210 /* APHASE */] + 1e3;
  if (eq("act_tele_phase")) t[210 /* APHASE */] = t[210 /* APHASE */] + 1;
  if (fail("TELEPORT_SELF", 1) || fail("PORTAL", 1) || fail("SHADOW_SHIFT", 1) || fail("DIMENSION_DOOR", 1))
    t[211 /* ATELEPORT */] = t[211 /* ATELEPORT */] + 1e3;
  if (eq("act_tele_long")) {
    t[212 /* AESCAPE */] = t[212 /* AESCAPE */] + 1;
    t[211 /* ATELEPORT */] = t[211 /* ATELEPORT */] + 1;
  }
  if (fail("TELEPORT_OTHER", 40)) t[221 /* ATPORTOTHER */] = t[221 /* ATPORTOTHER */] + 1e3;
  if (legal("HOLY_WORD")) t[248 /* AHWORD */] = t[248 /* AHWORD */] + 1e3;
  if (legal("HASTE_SELF") || eq("act_haste") || eq("act_haste1") || eq("act_haste2"))
    t[218 /* ASPEED */] = t[218 /* ASPEED */] + 1e3;
  if (eq("act_cure_light")) t[233 /* ACLW */] = t[233 /* ACLW */] + 1e3;
  if (eq("act_cure_serious")) t[232 /* ACSW */] = t[232 /* ACSW */] + 1e3;
  if (eq("act_cure_critical")) t[231 /* ACCW */] = t[231 /* ACCW */] + 1e3;
  if (eq("act_cure_full") || eq("act_cure_full2") || eq("act_cure_nonorlybig") || eq("act_heal1") || eq("act_heal2") || eq("act_heal3") || legal("HEALING"))
    t[214 /* AHEAL */] = t[214 /* AHEAL */] + 1e3;
  if (eq("act_cure_nonorlybig") || eq("act_restore_exp") || eq("act_restore_st_lev") || eq("act_restore_life"))
    t[126 /* HASFIXEXP */] = 1;
  if (legal("REMEMBRANCE") || eq("act_cure_nonorlybig") || eq("act_restore_exp") || eq("act_restore_st_lev") || eq("act_restore_life"))
    t[85 /* HLIFE */] = 1;
  if (eq("act_recharge") || legal("RECHARGING")) t[227 /* ARECHARGE */] = t[227 /* ARECHARGE */] + 1e3;
}
function finishNotice(c) {
  const { t, R: R2 } = c;
  const s = R2.spells;
  const resSpell = s.spellLegalFail("RESISTANCE", 15);
  t[90 /* SRACID */] = t[72 /* RACID */] || resSpell ? 1 : 0;
  t[89 /* SRELEC */] = t[71 /* RELEC */] || resSpell ? 1 : 0;
  t[87 /* SRFIRE */] = t[69 /* RFIRE */] || resSpell ? 1 : 0;
  t[88 /* SRCOLD */] = t[70 /* RCOLD */] || resSpell ? 1 : 0;
  t[91 /* SRPOIS */] = t[73 /* RPOIS */] || s.spellLegalFail("RESIST_POISON", 15) ? 1 : 0;
  t[92 /* SRFEAR */] = t[74 /* RFEAR */];
  t[93 /* SRLITE */] = t[75 /* RLITE */];
  t[94 /* SRDARK */] = t[76 /* RDARK */];
  t[95 /* SRBLIND */] = t[77 /* RBLIND */];
  t[96 /* SRCONF */] = t[78 /* RCONF */];
  t[97 /* SRSND */] = t[79 /* RSND */];
  t[98 /* SRSHRD */] = t[80 /* RSHRD */];
  t[99 /* SRNXUS */] = t[81 /* RNXUS */];
  t[100 /* SRNTHR */] = t[82 /* RNTHR */];
  t[101 /* SRKAOS */] = t[83 /* RKAOS */];
  t[102 /* SRDIS */] = t[84 /* RDIS */];
  t[103 /* SHLIFE */] = t[85 /* HLIFE */];
  t[104 /* SFRACT */] = t[86 /* FRACT */];
  t[261 /* CARRY */] = BORG_ADJ_STR_WGT[t[15 /* STR_INDEX */]] * 100;
  t[264 /* PREP_BIG_FIGHT */] = 0;
  if (t[106 /* MAXDEPTH */] >= 99) {
    let totalBigHeal = 0;
    totalBigHeal += t[215 /* AEZHEAL */] + t[216 /* ALIFE */];
    totalBigHeal += R2.home.numHealTrue + R2.home.numEzhealTrue + R2.home.numLifeTrue;
    if (totalBigHeal < 30 || R2.home.numSpeed + t[218 /* ASPEED */] < 15)
      t[264 /* PREP_BIG_FIGHT */] = 1;
  }
}
var TV_DIGGING = 6;
var TV_LIGHT = 19;
var TV_STAFF = 22;
var TV_WAND = 23;
var TV_ROD = 24;
var TV_SCROLL = 25;
var TV_POTION = 26;
var TV_FLASK = 27;
var TV_FOOD = 28;
var TV_MUSHROOM = 29;
function isAmmoTval(tval) {
  return tval === TV_SHOT || tval === TV_ARROW || tval === TV_BOLT;
}
var _empty = null;
function emptyItem() {
  if (!_empty) {
    _empty = {
      handle: 0,
      kindKey: "",
      aware: false,
      nameColor: "",
      label: "",
      tval: 0,
      sval: 0,
      pval: 0,
      number: 0,
      weight: 0,
      ac: 0,
      toA: 0,
      toH: 0,
      toD: 0,
      dd: 0,
      ds: 0,
      ego: false,
      artifact: false,
      flags: [],
      modifiers: [],
      brands: [],
      slays: [],
      resists: [],
      curses: [],
      egoName: null,
      artifactName: null,
      activation: false,
      timeout: 0,
      inscription: null
    };
  }
  return _empty;
}

// src/trait/prepared.ts
function borgPrepared(ctx, depth, opts = {}) {
  const R2 = resolveOpts(opts);
  const t = ctx.world.self.trait;
  const d = getDerived(ctx.world);
  if (depth === 1) return null;
  const restock = borgRestock(ctx, depth, opts);
  if (restock) return restock;
  if (t[36 /* MAXCLEVEL */] < depth && t[36 /* MAXCLEVEL */] < 50) return "Clevel < depth";
  if (depth <= 99) {
    if (ctx.world.self.readyMorgoth === -1) ctx.world.self.readyMorgoth = 0;
    if (t[107 /* KING */]) ctx.world.self.readyMorgoth = 1;
    const reason = borgPreparedAux(t, d, R2, depth);
    if (reason) return reason;
  }
  if (depth >= R2.cfg.noDeeper) return `No deeper ${R2.cfg.noDeeper}.`;
  if (t[107 /* KING */]) return null;
  if (!t[105 /* CDEPTH */]) return null;
  if (depth >= 82 && R2.home.numEzheal + R2.home.numLife < 10 && t[215 /* AEZHEAL */] + t[216 /* ALIFE */] < 10) {
    return `Scumming *Heal* potions (${10 - R2.home.numEzheal} to go).`;
  }
  if (depth >= 82 && t[106 /* MAXDEPTH */] >= 97) {
    const heals = R2.home.numEzhealTrue + t[215 /* AEZHEAL */] + R2.home.numLifeTrue + t[216 /* ALIFE */];
    if (heals < 30) return `Scumming *Heal* potions (${30 - heals} to go).`;
    if (t[215 /* AEZHEAL */] + t[216 /* ALIFE */] < 30 && heals >= 30 && R2.home.numEzhealTrue >= 1 && t[106 /* MAXDEPTH */] >= 99) {
      return `Collect from house (${R2.home.numEzhealTrue + R2.home.numLifeTrue} potions).`;
    }
  }
  if ((t[106 /* MAXDEPTH */] ?? 0) >= 98 && depth >= 98) {
    ctx.world.self.readyMorgoth = -1;
    if (depth >= 99) ctx.world.self.readyMorgoth = 1;
  }
  return null;
}
function borgPreparedAux(t, d, R2, depth) {
  const risky = R2.cfg.playsRisky;
  const cls = t[25 /* CLASS */];
  const spellStat = spellStatForClass(cls);
  if (t[107 /* KING */]) return null;
  if (!depth) return null;
  if (t[26 /* LIGHT */] < 1) return "1 Lite";
  if (t[39 /* FOOD */] < 5) return "5 Food";
  if (depth <= 1) return null;
  if (t[213 /* AFUEL */] < 5 && !t[26 /* LIGHT */]) return "5 Fuel";
  if (!risky) {
    if (t[28 /* MAXHP */] < 30) return "30 hp";
  }
  if (depth <= 2) return null;
  if (!risky) {
    switch (cls) {
      case CLASS_WARRIOR:
      case CLASS_BLACKGUARD:
        if (t[28 /* MAXHP */] < 50) return "50 hp";
        if (t[36 /* MAXCLEVEL */] < 4) return "4 clevel";
        break;
      case CLASS_ROGUE:
        if (t[28 /* MAXHP */] < 50) return "50 hp";
        if (t[36 /* MAXCLEVEL */] < 8) return "8 clevel";
        break;
      case CLASS_PRIEST:
      case CLASS_DRUID:
        if (t[28 /* MAXHP */] < 40) return "40 hp";
        if (t[36 /* MAXCLEVEL */] < 9) return "9 level";
        break;
      case CLASS_PALADIN:
        if (t[28 /* MAXHP */] < 50) return "50 hp";
        if (t[36 /* MAXCLEVEL */] < 4) return "4 clevel";
        break;
      case CLASS_RANGER:
        if (t[28 /* MAXHP */] < 50) return "50 hp";
        if (t[36 /* MAXCLEVEL */] < 4) return "4 clevel";
        break;
      case CLASS_MAGE:
      case CLASS_NECROMANCER:
        if (t[28 /* MAXHP */] < 60) return "60 hp";
        if (t[36 /* MAXCLEVEL */] < 11) return "11 clevel";
        break;
    }
  }
  if (t[36 /* MAXCLEVEL */] < 30 && t[233 /* ACLW */] + t[232 /* ACSW */] + t[231 /* ACCW */] < 2)
    return "2 cure";
  if (depth <= 4) return null;
  if (!risky && t[105 /* CDEPTH */]) {
    switch (cls) {
      case CLASS_WARRIOR:
      case CLASS_BLACKGUARD:
        if (t[28 /* MAXHP */] < 60) return "60 hp";
        if (t[36 /* MAXCLEVEL */] < 6) return "6 clevel";
        break;
      case CLASS_ROGUE:
        if (t[28 /* MAXHP */] < 60) return "60 hp";
        if (t[36 /* MAXCLEVEL */] < 10) return "10 clevel";
        break;
      case CLASS_PRIEST:
      case CLASS_DRUID:
        if (t[28 /* MAXHP */] < 60) return "60 hp";
        if (t[36 /* MAXCLEVEL */] < 15) return "15 clevel";
        break;
      case CLASS_PALADIN:
        if (t[28 /* MAXHP */] < 60) return "60 hp";
        if (t[36 /* MAXCLEVEL */] < 6) return "6 clevel";
        break;
      case CLASS_RANGER:
        if (t[28 /* MAXHP */] < 60) return "60 hp";
        if (t[36 /* MAXCLEVEL */] < 6) return "6 clevel";
        break;
      case CLASS_MAGE:
      case CLASS_NECROMANCER:
        if (t[28 /* MAXHP */] < 80) return "80 hp";
        if (t[36 /* MAXCLEVEL */] < 15) return "15 level";
        break;
    }
  }
  if (t[36 /* MAXCLEVEL */] < 30 && t[233 /* ACLW */] + t[232 /* ACSW */] + t[231 /* ACCW */] < 2)
    return "2 cures (clw + csw + ccw)";
  if (t[38 /* RECALL */] < 1) return "1 recall";
  if (depth <= 9) return null;
  if (t[26 /* LIGHT */] < 2 && cls !== CLASS_NECROMANCER) return "2 light radius";
  if (t[211 /* ATELEPORT */] + t[212 /* AESCAPE */] < 2) return "2 tele + teleport staffs";
  if (!risky) {
    switch (cls) {
      case CLASS_WARRIOR:
      case CLASS_BLACKGUARD:
        if (t[36 /* MAXCLEVEL */] < depth - 4 && depth <= 19) return "dlevel - 4 >= clevel";
        break;
      case CLASS_ROGUE:
      case CLASS_PRIEST:
      case CLASS_DRUID:
      case CLASS_PALADIN:
      case CLASS_RANGER:
        if (t[36 /* MAXCLEVEL */] < depth && depth <= 19) return "dlevel >= clevel";
        break;
      case CLASS_MAGE:
      case CLASS_NECROMANCER:
        if (t[36 /* MAXCLEVEL */] < depth + 5 && t[36 /* MAXCLEVEL */] <= 28)
          return "dlevel + 5 > = clevel";
        break;
    }
  }
  if (t[36 /* MAXCLEVEL */] < 30 && t[231 /* ACCW */] < 3) return "ccw < 3";
  if (!t[51 /* SINV */] && !t[259 /* DINV */] && !t[37 /* ESP */]) return "See Invis : ESP";
  if (depth <= 19) return null;
  if (!t[86 /* FRACT */]) return "free action";
  if (depth <= 20) return null;
  if (!t[87 /* SRFIRE */]) return "resist fire";
  {
    const basics = t[72 /* RACID */] + t[70 /* RCOLD */] + t[71 /* RELEC */];
    if (basics < 2) return "2 basic resists";
  }
  if (t[0 /* STR */] < 7) return "low STR";
  if (spellStat !== -1 && t[0 /* STR */ + spellStat] < 7) return "low spell stat";
  if (t[3 /* DEX */] < 7) return "low DEX";
  if (t[4 /* CON */] < 7) return "low CON";
  if (!risky) {
    switch (cls) {
      case CLASS_WARRIOR:
      case CLASS_BLACKGUARD:
        if (t[36 /* MAXCLEVEL */] < depth + 5 && t[36 /* MAXCLEVEL */] <= 38)
          return "dlevel + 5 >= clevel";
        break;
      case CLASS_ROGUE:
        if (t[36 /* MAXCLEVEL */] < depth + 10 && t[36 /* MAXCLEVEL */] <= 43)
          return "dlevel + 10 >= clevel";
        break;
      case CLASS_PRIEST:
      case CLASS_DRUID:
        if (t[36 /* MAXCLEVEL */] < depth + 13 && t[36 /* MAXCLEVEL */] <= 46)
          return "dlevel + 13 >= clevel";
        break;
      case CLASS_PALADIN:
        if (t[36 /* MAXCLEVEL */] < depth + 7 && t[36 /* MAXCLEVEL */] <= 40)
          return "dlevel + 7 >= clevel";
        break;
      case CLASS_RANGER:
        if (t[36 /* MAXCLEVEL */] < depth + 8 && t[36 /* MAXCLEVEL */] <= 41 && t[36 /* MAXCLEVEL */] > 28)
          return "dlevel + 8 >= clevel";
        break;
      case CLASS_MAGE:
      case CLASS_NECROMANCER:
        if (t[36 /* MAXCLEVEL */] < depth + 8 && t[36 /* MAXCLEVEL */] <= 38)
          return "dlevel + 8 >= clevel";
        if ((t[36 /* MAXCLEVEL */] - 38) * 2 + 30 < depth && t[36 /* MAXCLEVEL */] <= 44 && t[36 /* MAXCLEVEL */] > 38)
          return "(clevel-38)*2+30 < dlevel";
        break;
    }
  }
  if (depth <= 25) return null;
  if (!t[88 /* SRCOLD */]) return "resist cold";
  if (!t[89 /* SRELEC */]) return "resist elec";
  if (!t[90 /* SRACID */]) return "resist acid";
  if (t[211 /* ATELEPORT */] + t[212 /* AESCAPE */] < 6) return "6 tell + telep staffs";
  if (t[36 /* MAXCLEVEL */] < 30 && t[231 /* ACCW */] + t[232 /* ACSW */] < 10) return "10 ccw + csw";
  if (depth <= 33) return null;
  if (t[36 /* MAXCLEVEL */] < 40 && !risky) return "level 40";
  if (depth <= 39) return null;
  if (!t[91 /* SRPOIS */]) return "resist pois";
  if (!t[96 /* SRCONF */]) return "resist conf";
  if (t[0 /* STR */] < 16) return "STR < 16";
  if (spellStat !== -1 && t[0 /* STR */ + spellStat] < 16) return "spell stat < 16";
  if (t[3 /* DEX */] < 16) return "dex < 16";
  if (t[4 /* CON */] < 16) return "con < 16";
  if (depth <= 45) return null;
  if (t[44 /* SPEED */] < 115) return "+5 speed";
  if (t[214 /* AHEAL */] < 1 && t[215 /* AEZHEAL */] < 1) return "1 heal";
  if (!risky && t[28 /* MAXHP */] < 500) return "HP 500";
  if (t[0 /* STR */] < 18 + 40) return "str < 18(40)";
  if (spellStat !== -1 && t[0 /* STR */ + spellStat] < 18 + 100)
    return "spell stat needs to be max";
  if (t[3 /* DEX */] < 18 + 60) return "dex < 18 (60)";
  if (t[4 /* CON */] < 18 + 60) return "con < 18 (60)";
  if (!t[103 /* SHLIFE */] && t[36 /* MAXCLEVEL */] < 50) return "hold life";
  if (depth <= 55) return null;
  if (t[214 /* AHEAL */] < 2 && t[215 /* AEZHEAL */] < 1) return "2 heal + *heal*";
  if (!t[95 /* SRBLIND */]) return "resist blind";
  if (!t[37 /* ESP */]) return "ESP";
  if (depth <= 59) return null;
  if (t[44 /* SPEED */] < 120) return "+10 speed";
  if (!t[101 /* SRKAOS */]) return "resist chaos";
  if (!t[102 /* SRDIS */]) return "resist disenchant";
  if (depth <= 80) return null;
  if (t[44 /* SPEED */] < 130) return "+20 Speed";
  if (depth <= 85) return null;
  if (depth <= 99) return null;
  if (!t[107 /* KING */]) {
    if (t[31 /* MAXSP */] > 100 && has(d, "potion_restore_mana") < 15)
      return "10 restore mana";
    if (has(d, "potion_healing") < 5) return "5 Heal";
    if (t[215 /* AEZHEAL */] + t[216 /* ALIFE */] < 15) return "15 *heal* or life";
    if (t[218 /* ASPEED */] < 10) return "10 speed potions";
  }
  if (depth <= 127) return null;
  return null;
}
function borgRestock(ctx, depth, opts = {}) {
  const R2 = resolveOpts(opts);
  const t = ctx.world.self.trait;
  const d = getDerived(ctx.world);
  const cls = t[25 /* CLASS */];
  if (ctx.world.self.readyMorgoth === -1) ctx.world.self.readyMorgoth = 0;
  if (t[26 /* LIGHT */] < 1) return "restock light radius < 1";
  if (t[213 /* AFUEL */] < 1 && !t[26 /* LIGHT */]) return "restock fuel";
  if (depth <= 1) return null;
  if (t[213 /* AFUEL */] < 2 && !t[26 /* LIGHT */]) return "restock fuel < 2";
  if (t[39 /* FOOD */] < 3) return "restock food < 3";
  if (depth <= 3) return null;
  if (depth <= 5) return null;
  if (t[210 /* APHASE */] < 1) return "restock phase door";
  if (t[36 /* MAXCLEVEL */] < 30 && t[233 /* ACLW */] + t[232 /* ACSW */] + t[231 /* ACCW */] < 1)
    return "restock clw+csw+ccw";
  if (depth <= 9) return null;
  if (t[26 /* LIGHT */] < 2 && cls !== CLASS_NECROMANCER) return "2 light radius";
  if (t[36 /* MAXCLEVEL */] < 30 && t[233 /* ACLW */] + t[232 /* ACSW */] + t[231 /* ACCW */] < 2)
    return "restock clw + csw + ccw ";
  if (t[211 /* ATELEPORT */] + t[212 /* AESCAPE */] < 2) return "restock tele + tele staff < 2";
  if (depth <= 19) return null;
  if (t[36 /* MAXCLEVEL */] < 30 && t[232 /* ACSW */] + t[231 /* ACCW */] < 4)
    return "restock csw + ccw < 4";
  if (t[211 /* ATELEPORT */] + t[212 /* AESCAPE */] < 4)
    return "restock 4 > teleport + teleport staff ";
  if (depth <= 35) return null;
  if (t[211 /* ATELEPORT */] + t[247 /* ATELEPORTLVL */] < 2)
    return "restock teleport + teleport level scrolls";
  if (depth <= 45) return null;
  if (depth <= 64) return null;
  if (t[214 /* AHEAL */] + has(d, "rod_healing") + t[215 /* AEZHEAL */] < 1)
    return "restock heal";
  if (depth <= 99) return null;
  void R2;
  return null;
}

// src/trait/power.ts
var SLOT_WIELD2 = 0;
var SLOT_BOW2 = 1;
var SLOT_BODY2 = 6;
var SLOT_HEAD = 9;
var SLOT_ARM = 8;
var SLOT_OUTER = 7;
var SLOT_HANDS = 10;
var SLOT_FEET2 = 11;
var TV_ARROW2 = 3;
var TV_DIGGING2 = 6;
function wgt(item) {
  return present(item) ? item.weight : 0;
}
function borgPower(ctx, opts = {}) {
  const R2 = resolveOpts(opts);
  const t = ctx.world.self.trait;
  const d = getDerived(ctx.world);
  const equip = ctx.view.equipment();
  const cls = t[25 /* CLASS */];
  let value = 0;
  value += powerEquipment(t, d, R2, equip, cls);
  value += powerInventory(t, d, R2, equip, cls);
  let i = 1;
  for (; i <= t[106 /* MAXDEPTH */] + 50; i++) {
    if (borgPrepared(ctx, i, opts) !== null) break;
  }
  value += (i - 1) * 4e4;
  ctx.world.self.power = value;
  return value;
}
function powerEquipment(t, _d, R2, equip, cls) {
  const cfg = R2.cfg;
  let value = 0;
  const hold = ADJ_STR_HOLD[t[15 /* STR_INDEX */]];
  const wep = equip[SLOT_WIELD2];
  const wepToH = present(wep) ? wep.toH : 0;
  const wepToD = present(wep) ? wep.toD : 0;
  const wepDd = present(wep) ? wep.dd : 0;
  const wepDs = present(wep) ? wep.ds : 0;
  let damage = wepDd * wepDs * 20;
  value += damage * (t[146 /* BLOWS */] + 1);
  value += (t[134 /* TOHIT */] + wepToH) * 100;
  value += (t[135 /* TODAM */] + wepToD) * 30;
  if (cfg.worshipsDamage) value += (t[134 /* TOHIT */] + wepToH) * 15;
  if (t[106 /* MAXDEPTH */] >= 75) {
    value += (t[134 /* TOHIT */] + wepToH) * 15;
    value += wepDd * wepDs * 20 * 2 * t[146 /* BLOWS */];
  }
  let dam = damage * 2 * t[146 /* BLOWS */];
  if (t[193 /* WS_ANIMAL */]) value += Math.trunc(dam * 2 / 2);
  if (t[194 /* WS_EVIL */]) value += Math.trunc(dam * 7 / 2);
  if (cfg.worshipsDamage) value += dam;
  dam = damage * 3 * t[146 /* BLOWS */];
  if (t[195 /* WS_UNDEAD */] && !t[201 /* WK_UNDEAD */]) value += Math.trunc(dam * 5 / 2);
  if (t[196 /* WS_DEMON */] && !t[202 /* WK_DEMON */]) value += Math.trunc(dam * 3 / 2);
  if (t[200 /* WS_DRAGON */] && !t[203 /* WK_DRAGON */]) value += Math.trunc(dam * 6 / 2);
  if (t[199 /* WS_GIANT */]) value += Math.trunc(dam * 4 / 2);
  if (t[205 /* WB_ACID */]) value += Math.trunc(dam * 4 / 2);
  if (t[206 /* WB_ELEC */]) value += Math.trunc(dam * 5 / 2);
  if (t[207 /* WB_FIRE */]) value += Math.trunc(dam * 3 / 2);
  if (t[208 /* WB_COLD */]) value += Math.trunc(dam * 3 / 2);
  if (t[197 /* WS_ORC */]) value += Math.trunc(dam * 1 / 2);
  if (t[198 /* WS_TROLL */]) value += Math.trunc(dam * 2 / 2);
  if (t[197 /* WS_ORC */] && !t[194 /* WS_EVIL */]) value += Math.trunc(dam * 1 / 2);
  if (t[198 /* WS_TROLL */] && !t[194 /* WS_EVIL */]) value += Math.trunc(dam * 1 / 2);
  if (cfg.worshipsDamage) value += dam;
  dam = damage * 5 * t[146 /* BLOWS */];
  if (t[201 /* WK_UNDEAD */]) value += Math.trunc(dam * 5 / 2);
  if (t[202 /* WK_DEMON */]) value += Math.trunc(dam * 5 / 2);
  if (t[203 /* WK_DRAGON */]) value += Math.trunc(dam * 5 / 2);
  if (cfg.worshipsDamage) value += dam;
  if (t[204 /* W_IMPACT */]) value += 50;
  if (t[149 /* HEAVYWEPON */]) value -= 5e5;
  if (t[35 /* CLEVEL */] <= 10) value += t[146 /* BLOWS */] * 45e3;
  const bow = equip[SLOT_BOW2];
  const bowToH = present(bow) ? bow.toH : 0;
  const bowToD = present(bow) ? bow.toD : 0;
  if (bowToD > 8 || t[35 /* CLEVEL */] < 25)
    damage = (t[153 /* AMMO_SIDES */] + bowToD) * t[154 /* AMMO_POWER */];
  else damage = (t[153 /* AMMO_SIDES */] + 8) * t[154 /* AMMO_POWER */];
  if (cfg.worshipsDamage) value += t[148 /* SHOTS */] * damage * 11;
  else value += t[148 /* SHOTS */] * damage * 9;
  if (t[35 /* CLEVEL */] < 15) value += t[148 /* SHOTS */] * damage * 200;
  if (present(bow) && bow.sval === R2.svals.sling && !bow.artifact && t[0 /* STR */] < 9)
    value -= 5e3;
  if (present(bow) && bow.sval === R2.svals.sling && t[35 /* CLEVEL */] === 1 && t[0 /* STR */] >= 9)
    value += 8e3;
  value += (t[134 /* TOHIT */] + bowToH) * 100;
  if (cfg.worshipsDamage) value += (t[134 /* TOHIT */] + bowToH) * 25;
  if (t[53 /* FAST_SHOTS */] && t[152 /* AMMO_TVAL */] === TV_ARROW2) value += 3e4;
  if (present(bow) && hold < bow.weight / 10) value -= 5e5;
  if (cls === CLASS_NECROMANCER) value -= (t[26 /* LIGHT */] - 1) * 1e4;
  else if (t[26 /* LIGHT */] <= 3) value += t[26 /* LIGHT */] * 1e4;
  else if (t[26 /* LIGHT */] > 3) value += 3e4 + t[26 /* LIGHT */] * 1e3;
  value += t[46 /* MOD_MOVES */] * 3e3;
  value += t[47 /* DAM_RED */] * 1e4;
  value += speedReward(t[44 /* SPEED */], cfg.worshipsSpeed);
  value += t[15 /* STR_INDEX */] * 100;
  const spellStat = spellStatForClass(cls);
  if (spellStat >= 0) {
    value += t[15 /* STR_INDEX */ + spellStat] * 500;
    if (cfg.worshipsMana) value += Math.trunc(t[32 /* SP_ADJ */] / 2) * 255;
    else value += Math.trunc(t[32 /* SP_ADJ */] / 2) * 155;
    value += (100 - R2.spells.spellChance()) * 100;
    if (R2.spells.playerHas("ZERO_FAIL") && R2.spells.spellChance() < 1) value += 3e4;
  }
  if (t[18 /* DEX_INDEX */] <= 37) value += t[18 /* DEX_INDEX */] * 120;
  if (t[19 /* CON_INDEX */] <= 37) {
    if (cfg.worshipsHp) {
      value += t[19 /* CON_INDEX */] * 250;
      if (t[29 /* HP_ADJ */] < 800) value += t[29 /* HP_ADJ */] * 450;
      else value += (t[29 /* HP_ADJ */] - 800) * 100 + 350 * 500;
    } else {
      value += t[19 /* CON_INDEX */] * 150;
      if (t[29 /* HP_ADJ */] < 500) value += t[29 /* HP_ADJ */] * 350;
      else value += (t[29 /* HP_ADJ */] - 500) * 100 + 350 * 500;
    }
  }
  for (let i = 0; i < STAT_MAX; i++) value += t[5 /* ASTR */ + i];
  value += t[54 /* DISP */] * 2;
  value += t[55 /* DISM */] * 2;
  value += t[56 /* DEV */] * 25;
  value += t[57 /* SAV */] * 25;
  if (t[57 /* SAV */] > 99) value += 1e4;
  value += t[58 /* STL */] * 2;
  value += t[59 /* SRCH */] * 1;
  value += t[60 /* THN */] * 5;
  value += t[61 /* THB */] * 35;
  value += t[62 /* THT */] * 2;
  value += t[63 /* DIG */] * 2;
  if (t[48 /* SDIG */]) value += 750;
  if (t[48 /* SDIG */] && t[109 /* ISHUNGRY */]) value += 7500;
  if (t[48 /* SDIG */] && t[108 /* ISWEAK */]) value += 7500;
  if (t[106 /* MAXDEPTH */] < 20) {
    if (t[49 /* FEATH */]) value += 500;
  } else if (t[49 /* FEATH */]) value += 50;
  if (t[26 /* LIGHT */]) value += 2e3;
  if (t[37 /* ESP */] && t[51 /* SINV */]) value += 500;
  if (!t[259 /* DINV */] && t[51 /* SINV */]) value += 5e3;
  if (t[86 /* FRACT */]) value += 1e4;
  if (t[36 /* MAXCLEVEL */] < 50) {
    if (t[85 /* HLIFE */]) value += 2e3;
  } else if (t[85 /* HLIFE */]) value += 200;
  if (t[50 /* REG */]) value += 2e3;
  if (t[37 /* ESP */]) value += 8e4;
  if (t[66 /* ICOLD */]) value += 65e3;
  if (t[67 /* IELEC */]) value += 4e4;
  if (t[64 /* IFIRE */]) value += 8e4;
  if (t[65 /* IACID */]) value += 5e4;
  if (t[70 /* RCOLD */]) value += 3e3;
  if (t[71 /* RELEC */]) value += 4e3;
  if (t[72 /* RACID */]) value += 6e3;
  if (t[69 /* RFIRE */]) value += 8e3;
  if (t[69 /* RFIRE */] && t[72 /* RACID */] && t[71 /* RELEC */] && t[70 /* RCOLD */]) value += 1e4;
  if (t[73 /* RPOIS */]) value += 2e4;
  if (t[79 /* RSND */]) value += 3500;
  if (t[75 /* RLITE */]) value += 800;
  if (t[76 /* RDARK */]) value += 800;
  if (t[83 /* RKAOS */]) value += 5e3;
  if (t[78 /* RCONF */]) value += 8e4;
  if (cls === CLASS_MAGE && t[78 /* RCONF */]) value += 2e3;
  if (t[84 /* RDIS */]) value += 5e3;
  if (t[80 /* RSHRD */]) value += 100;
  if (t[81 /* RNXUS */]) value += 100;
  if (t[77 /* RBLIND */]) value += 5e3;
  if (t[82 /* RNTHR */]) value += 5500;
  if (t[74 /* RFEAR */]) value += 2e3;
  if (t[20 /* SSTR */]) value += 50;
  if (t[21 /* SINT */]) value += 50;
  if (t[22 /* SWIS */]) value += 50;
  if (t[24 /* SCON */]) value += 50;
  if (t[23 /* SDEX */]) value += 50;
  if (t[20 /* SSTR */] && t[21 /* SINT */] && t[22 /* SWIS */] && t[23 /* SDEX */] && t[24 /* SCON */])
    value += 1e3;
  const md1 = t[106 /* MAXDEPTH */] + 1;
  if ((t[51 /* SINV */] || t[37 /* ESP */]) && md1 >= 10) value += 1e5;
  if (t[86 /* FRACT */] && md1 >= 20) value += 1e5;
  if (t[69 /* RFIRE */] && md1 >= 25) value += 1e5;
  if (t[73 /* RPOIS */] && md1 >= 40) value += 1e5;
  if (t[71 /* RELEC */] && md1 >= 40) value += 1e5;
  if (t[72 /* RACID */] && md1 >= 40) value += 1e5;
  if (t[70 /* RCOLD */] && md1 >= 40) value += 1e5;
  if (t[85 /* HLIFE */] && md1 >= 46 && t[36 /* MAXCLEVEL */] < 50) value += 1e5;
  if (t[44 /* SPEED */] >= 115 && md1 >= 46) value += 1e5;
  if (t[78 /* RCONF */] && md1 >= 46) value += 1e5;
  if (t[82 /* RNTHR */] && md1 >= 50) value += 55e3;
  if (t[79 /* RSND */] && md1 >= 50) value += 1e5;
  if (t[77 /* RBLIND */] && md1 >= 55) value += 1e5;
  if (t[37 /* ESP */] && md1 >= 55) value += 1e5;
  if (t[82 /* RNTHR */] && md1 >= 60) value += 55e3;
  if (t[83 /* RKAOS */] && md1 >= 60) value += 104e3;
  if (t[84 /* RDIS */] && md1 >= 60) value += 9e4;
  if (t[44 /* SPEED */] >= 120 && md1 >= 60) value += 1e5;
  if (t[44 /* SPEED */] >= 130 && md1 >= 80) value += 1e5;
  if (t[82 /* RNTHR */] && md1 >= 80) value += 15e3;
  if (t[76 /* RDARK */] && md1 >= 80) value += 25e3;
  if (t[44 /* SPEED */] >= 140 && md1 >= 80 && cls === CLASS_WARRIOR) value += 1e5;
  const armor = t[133 /* ARMOR */];
  if (cfg.worshipsAc) {
    if (armor < 15) value += armor * 2500;
    if (armor >= 15 && armor < 75) value += armor * 2e3 + 28250;
    if (armor >= 75) value += armor * 1500 + 73750;
  } else {
    if (armor < 15) value += armor * 2e3;
    if (armor >= 15 && armor < 75) value += armor * 500 + 28350;
    if (armor >= 75) value += armor * 100 + 73750;
  }
  if (t[174 /* CRSAGRV */]) value -= 8e5;
  if (t[182 /* CRSHPIMP */]) value -= 35e3;
  if (cls !== CLASS_WARRIOR && t[183 /* CRSMPIMP */]) value -= 15e3;
  if ((cls === CLASS_MAGE || cls === CLASS_PRIEST || cls === CLASS_DRUID || cls === CLASS_NECROMANCER) && t[183 /* CRSMPIMP */])
    value -= 15e3;
  if (t[186 /* CRSFEAR */]) value -= 4e5;
  if (t[186 /* CRSFEAR */] && cls !== CLASS_MAGE) value -= 2e5;
  if (t[187 /* CRSDRAIN_XP */]) value -= 4e5;
  if (t[188 /* CRSFVULN */]) value -= 3e4;
  if (t[189 /* CRSEVULN */]) value -= 3e4;
  if (t[190 /* CRSCVULN */]) value -= 3e4;
  if (t[191 /* CRSAVULN */]) value -= 3e4;
  if (t[163 /* CRSTELE */]) value -= 1e5;
  if (t[161 /* CRSENVELOPING */]) value -= 5e4;
  if (t[162 /* CRSIRRITATION */]) value -= 2e4;
  if (t[164 /* CRSPOIS */]) value -= 1e4;
  if (t[165 /* CRSSIREN */]) value -= 8e5;
  if (t[166 /* CRSHALU */]) value -= 1e5;
  if (t[167 /* CRSPARA */]) value -= 8e5;
  if (t[168 /* CRSSDEM */]) value -= 1e5;
  if (t[169 /* CRSSDRA */]) value -= 1e5;
  if (t[170 /* CRSSUND */]) value -= 1e5;
  if (t[171 /* CRSSTONE */] && t[44 /* SPEED */] < 140) value -= 1e4;
  if (t[184 /* CRSSTEELSKIN */] && t[44 /* SPEED */] < 140) value -= 1e4;
  if (t[172 /* CRSNOTEL */]) value -= 7e5;
  if (t[173 /* CRSTWEP */]) value -= 1e5;
  if (t[185 /* CRSAIRSWING */]) value -= 1e4;
  if (t[192 /* CRSUNKNO */]) value -= 9999999;
  value += 3e3 * t[258 /* MULTIPLE_BONUSES */];
  value += 1e4 * t[253 /* WORN_NEED_ID */];
  value += activationReward(ctx_activation(), t, cls);
  if (t[15 /* STR_INDEX */] < 15) {
    if (wgt(equip[SLOT_BODY2]) > 200) value -= (wgt(equip[SLOT_BODY2]) - 200) * 15;
    if (wgt(equip[SLOT_HEAD]) > 30) value -= 250;
    if (wgt(equip[SLOT_ARM]) > 10) value -= 250;
    if (wgt(equip[SLOT_FEET2]) > 50) value -= 250;
  }
  let curWgt = 0;
  curWgt += wgt(equip[SLOT_BODY2]);
  curWgt += wgt(equip[SLOT_HEAD]);
  curWgt += wgt(equip[SLOT_ARM]);
  curWgt += wgt(equip[SLOT_OUTER]);
  curWgt += wgt(equip[SLOT_HANDS]);
  curWgt += wgt(equip[SLOT_FEET2]);
  const maxWgt = R2.frame.spellWeight ?? 0;
  const totalSpells = R2.frame.totalSpells ?? 0;
  if (totalSpells && Math.trunc((curWgt - maxWgt) / 10) > 0) {
    let maxSp = Math.trunc(t[32 /* SP_ADJ */] / 100) + 1;
    maxSp -= Math.trunc((curWgt - maxWgt) / 10);
    if (maxSp >= 300 && maxSp <= 350) value -= Math.trunc((curWgt - maxWgt) / 10) * 400;
    if (maxSp >= 200 && maxSp <= 299) value -= Math.trunc((curWgt - maxWgt) / 10) * 800;
    if (maxSp >= 100 && maxSp <= 199) value -= Math.trunc((curWgt - maxWgt) / 10) * 1600;
    if (maxSp <= 99) value -= Math.trunc((curWgt - maxWgt) / 10) * 3200;
  }
  return value;
}
function ctx_activation() {
  return [];
}
function activationReward(_activation, _t, _cls) {
  return 0;
}
function speedReward(speed, worships) {
  if (worships) {
    if (speed >= 150) return (speed - 120) * 1500 + 185e3;
    if (speed >= 145 && speed <= 149) return (speed - 120) * 1500 + 18e4;
    if (speed >= 140 && speed <= 144) return (speed - 120) * 1500 + 175e3;
    if (speed >= 135 && speed <= 139) return (speed - 120) * 1500 + 175e3;
    if (speed >= 130 && speed <= 134) return (speed - 120) * 1500 + 16e4;
    if (speed >= 125 && speed <= 129) return (speed - 110) * 1500 + 135e3;
    if (speed >= 120 && speed <= 124) return (speed - 110) * 1500 + 11e4;
    if (speed >= 115 && speed <= 119) return (speed - 110) * 1500 + 85e3;
    if (speed >= 110 && speed <= 114) return (speed - 110) * 1500 + 65e3;
    if (speed < 110) return (speed - 110) * 2500;
    return 0;
  }
  if (speed >= 140) return (speed - 120) * 1e3 + 175e3;
  if (speed >= 135 && speed <= 139) return (speed - 120) * 1e3 + 165e3;
  if (speed >= 130 && speed <= 134) return (speed - 120) * 1e3 + 15e4;
  if (speed >= 125 && speed <= 129) return (speed - 110) * 1e3 + 125e3;
  if (speed >= 120 && speed <= 124) return (speed - 110) * 1e3 + 1e5;
  if (speed >= 115 && speed <= 119) return (speed - 110) * 1e3 + 75e3;
  if (speed >= 110 && speed <= 114) return (speed - 110) * 1e3 + 55e3;
  if (speed < 110) return (speed - 110) * 2500;
  return 0;
}
function powerInventory(t, d, R2, equip, cls) {
  const cfg = R2.cfg;
  const H2 = R2.home;
  let value = 0;
  let k = 0;
  const munchGate = cfg.munchkinStart && t[36 /* MAXCLEVEL */] < cfg.munchkinLevel;
  for (k = 0; k < 6 && k < t[213 /* AFUEL */]; k++) value += 6e4;
  if (t[0 /* STR */] >= 15) for (; k < 10 && k < t[213 /* AFUEL */]; k++) value += 6e3 - k * 100;
  if ((t[109 /* ISHUNGRY */] || t[108 /* ISWEAK */]) && t[39 /* FOOD */]) value += 1e5;
  for (k = 0; k < 7 && k < t[39 /* FOOD */]; k++) value += 5e4;
  if (t[0 /* STR */] >= 15) for (; k < 10 && k < t[39 /* FOOD */]; k++) value += 200;
  if (t[50 /* REG */] && t[35 /* CLEVEL */] <= 15)
    for (k = 0; k < 15 && k < t[39 /* FOOD */]; k++) value += 700;
  for (k = 0; k < 7 && k < t[40 /* FOOD_HI */]; k++) value += 52;
  for (k = 0; k < 15 && k < t[41 /* FOOD_LO */]; k++) value -= 2;
  if ((t[116 /* ISCUT */] || t[115 /* ISPOISONED */]) && t[231 /* ACCW */]) value += 1e5;
  if ((t[116 /* ISCUT */] || t[115 /* ISPOISONED */]) && t[214 /* AHEAL */]) value += 5e4;
  if ((t[116 /* ISCUT */] || t[115 /* ISPOISONED */]) && t[232 /* ACSW */])
    for (k = 0; k < 5 && k < t[232 /* ACSW */]; k++) value += 25e3;
  if (t[115 /* ISPOISONED */] && t[222 /* ACUREPOIS */]) value += 15e3;
  if (!t[68 /* IPOIS */] && t[222 /* ACUREPOIS */] <= 20) {
    if (!munchGate) for (; k < 4 && k < t[246 /* ARESPOIS */]; k++) value += 300;
  }
  if (cls === CLASS_WARRIOR && t[106 /* MAXDEPTH */] > 20) {
    k = 0;
    if (!munchGate) {
      if (!t[64 /* IFIRE */]) for (; k < 4 && k < t[244 /* ARESHEAT */]; k++) value += 500;
      k = 0;
      if (!t[66 /* ICOLD */]) for (; k < 4 && k < t[245 /* ARESCOLD */]; k++) value += 500;
      if (!t[68 /* IPOIS */]) for (; k < 4 && k < t[246 /* ARESPOIS */]; k++) value += 500;
    }
  }
  k = 0;
  if (t[35 /* CLEVEL */] >= 10) {
    for (; k < 5 && k < t[217 /* AID */]; k++) value += 6e3;
    if (t[0 /* STR */] >= 15) for (; k < 15 && k < t[217 /* AID */]; k++) value += 600;
  }
  if (t[254 /* ALL_NEED_ID */]) {
    for (k = 0; k < t[254 /* ALL_NEED_ID */] && k < t[217 /* AID */]; k++) value += 6e3;
  }
  k = 0;
  if (!munchGate) {
    for (; k < 10 && k < t[229 /* APFE */]; k++) value += 1e4;
    for (; k < 25 && k < t[229 /* APFE */]; k++) value += 2e3;
  }
  k = 0;
  for (; k < 10 && k < t[230 /* AGLYPH */]; k++) value += 1e4;
  for (; k < 25 && k < t[230 /* AGLYPH */]; k++) value += 2e3;
  if (t[106 /* MAXDEPTH */] >= 100) {
    k = 0;
    for (; k < 10 && k < t[230 /* AGLYPH */]; k++) value += 2500;
    for (; k < 75 && k < t[230 /* AGLYPH */]; k++) value += 2500;
  }
  if (t[106 /* MAXDEPTH */] >= 100) {
    for (k = 0; k < 99 && k < t[249 /* AMASSBAN */]; k++) value += 2500;
  }
  if (t[35 /* CLEVEL */] > 7 && !munchGate) {
    k = 0;
    for (; k < 3 && k < t[38 /* RECALL */]; k++) value += 5e4;
    if (t[0 /* STR */] >= 15) for (; k < 7 && k < t[38 /* RECALL */]; k++) value += 5e3;
    if (t[106 /* MAXDEPTH */] >= 50 && has(d, "rod_recall")) value += 12e3;
  }
  k = 1;
  if (t[210 /* APHASE */]) value += 5e4;
  if (!munchGate) {
    for (; k < 8 && k < t[210 /* APHASE */]; k++) value += 500;
    if (t[0 /* STR */] >= 15) for (; k < 15 && k < t[210 /* APHASE */]; k++) value += 500;
  }
  k = 0;
  if (!munchGate) {
    for (; k < 2 && k < t[212 /* AESCAPE */]; k++) value += 1e4;
    if (t[106 /* MAXDEPTH */] > 70) {
      k = 0;
      for (; k < 3 && k < t[212 /* AESCAPE */]; k++) value += 1e4;
    }
  }
  k = 0;
  if (t[35 /* CLEVEL */] >= 3 && t[211 /* ATELEPORT */]) value += 1e4;
  if (t[35 /* CLEVEL */] >= 7) for (; k < 3 && k < t[211 /* ATELEPORT */]; k++) value += 1e4;
  if (t[35 /* CLEVEL */] >= 30) for (; k < 10 && k < t[211 /* ATELEPORT */]; k++) value += 1e4;
  k = 0;
  if (t[35 /* CLEVEL */] >= 15)
    for (; k < 5 && k < t[247 /* ATELEPORTLVL */]; k++) value += 5e3;
  if (cls === CLASS_WARRIOR || cls === CLASS_ROGUE || cls === CLASS_BLACKGUARD) {
    for (k = 0; k < 15 && k < t[214 /* AHEAL */]; k++) value += 8e3;
    k = 0;
    if (t[106 /* MAXDEPTH */] >= 46) {
      const lim = t[264 /* PREP_BIG_FIGHT */] ? 1 : 2;
      for (; k < lim && k < t[215 /* AEZHEAL */]; k++) value += 1e4;
    }
    for (k = 0; k < 6 && k < has(d, "rod_healing"); k++) value += 2e4;
  } else if (cls === CLASS_RANGER || cls === CLASS_PALADIN || cls === CLASS_NECROMANCER || cls === CLASS_MAGE) {
    for (k = 0; k < 10 && k < t[214 /* AHEAL */]; k++) value += 4e3;
    k = 0;
    if (t[106 /* MAXDEPTH */] >= 46) {
      const lim = t[264 /* PREP_BIG_FIGHT */] ? 1 : 2;
      for (; k < lim && k < t[215 /* AEZHEAL */]; k++) value += 1e4;
    }
    if (cls === CLASS_PALADIN)
      for (k = 0; k < 3 && k < has(d, "potion_healing"); k++) value += 5e3;
    for (k = 0; k < 4 && k < has(d, "rod_healing"); k++) value += 2e4;
  } else if (cls === CLASS_PRIEST || cls === CLASS_DRUID) {
    if (t[35 /* CLEVEL */] === 1)
      for (k = 0; k < 10 && k < has(d, "potion_healing"); k++) value -= 2e3;
    for (k = 0; k < 5 && k < has(d, "potion_healing"); k++) value += 2e3;
    k = 0;
    if (t[106 /* MAXDEPTH */] >= 46) {
      const lim = t[264 /* PREP_BIG_FIGHT */] ? 1 : 2;
      for (; k < lim && k < t[215 /* AEZHEAL */]; k++) value += 1e4;
    }
  }
  if (t[106 /* MAXDEPTH */] >= 99 && !t[264 /* PREP_BIG_FIGHT */]) {
    for (k = 0; k < 99 && k < has(d, "potion_healing"); k++) value += 8e3;
    for (k = 0; k < 99 && k < t[215 /* AEZHEAL */]; k++) value += 1e4;
    for (k = 0; k < 99 && k < t[218 /* ASPEED */]; k++) value += 8e3;
    for (k = 0; k < 99 && k < t[216 /* ALIFE */]; k++) value += 1e4;
    if (cls !== CLASS_WARRIOR)
      for (k = 0; k < 99 && k < has(d, "potion_restore_mana"); k++) value += 5e3;
    for (k = 0; k < 40 && k < has(d, "mush_stoneskin"); k++) value += 5e3;
    if (t[263 /* SAURON_DEAD */])
      for (k = 0; k < 99 && k < t[249 /* AMASSBAN */]; k++) value += 2500;
  }
  if (t[31 /* MAXSP */] > 100) {
    for (k = 0; k < 10 && k < has(d, "potion_restore_mana"); k++) value += 4e3;
    for (k = 0; k < 100 && k < t[219 /* ASTFMAGI */]; k++) value += 4e3;
  }
  if (t[35 /* CLEVEL */] < 35 && t[35 /* CLEVEL */] > 10) {
    for (k = 0; k < 10 && k < t[231 /* ACCW */]; k++) value += 5e3;
  } else if (t[35 /* CLEVEL */] >= 35) {
    for (k = 0; k < 10 && k < t[231 /* ACCW */]; k++) value += 5e3;
    if (t[0 /* STR */] > 15) for (; k < 15 && k < t[231 /* ACCW */]; k++) value += 500;
  }
  if (t[231 /* ACCW */] < 5 && t[36 /* MAXCLEVEL */] > 10 && (t[35 /* CLEVEL */] < 35 || !t[78 /* RCONF */])) {
    for (k = 0; k < 7 && k < t[232 /* ACSW */]; k++) value += 50;
    if (t[0 /* STR */] > 15) for (; k < 10 && k < t[232 /* ACSW */]; k++) value += 5;
  }
  if (t[231 /* ACCW */] + t[232 /* ACSW */] < 5 && t[35 /* CLEVEL */] < 8) {
    for (k = 0; k < 5 && k < t[233 /* ACLW */]; k++) value += 550;
  }
  if (!t[78 /* RCONF */]) {
    if (!(cfg.munchkinStart && t[36 /* MAXCLEVEL */] < 10))
      for (k = 0; k < 10 && k < t[42 /* FOOD_CURE_CONF */]; k++) value += 400;
  }
  if (!t[77 /* RBLIND */]) {
    if (!munchGate)
      for (k = 0; k < 5 && k < t[43 /* FOOD_CURE_BLIND */]; k++) value += 300;
  }
  if (!t[73 /* RPOIS */]) {
    if (!munchGate) for (k = 0; k < 5 && k < t[222 /* ACUREPOIS */]; k++) value += 250;
  }
  for (k = 0; k < 1 && k < t[223 /* ADETTRAP */]; k++) value += 4e3;
  for (k = 0; k < 1 && k < t[224 /* ADETDOOR */]; k++) value += 2e3;
  if (!t[37 /* ESP */]) for (k = 0; k < 1 && k < t[225 /* ADETEVIL */]; k++) value += 1e3;
  for (k = 0; k < 1 && k < t[226 /* AMAGICMAP */]; k++) value += 4e3;
  if (cls !== CLASS_NECROMANCER)
    for (k = 0; k < 1 && k < t[228 /* ALITE */]; k++) value += 1e3;
  if (t[106 /* MAXDEPTH */] >= 100) {
    k = 0;
    for (; k < 10 && k < has(d, "scroll_mass_banishment"); k++) value += 1e4;
    for (; k < 25 && k < has(d, "scroll_mass_banishment"); k++) value += 2e3;
  }
  if (!munchGate) for (k = 0; k < 20 && k < t[218 /* ASPEED */]; k++) value += 5e3;
  if (t[227 /* ARECHARGE */] && t[106 /* MAXDEPTH */] < 99) value += 5e3;
  if (cls === CLASS_RANGER || cls === CLASS_WARRIOR) {
    for (k = 0; k < 40 && k < t[155 /* AMISSILES */]; k++) value += 100;
    if (t[0 /* STR */] > 15 && t[0 /* STR */] <= 18)
      for (; k < 80 && k < t[155 /* AMISSILES */]; k++) value += 10;
    if (t[0 /* STR */] > 18) for (; k < 180 && k < t[155 /* AMISSILES */]; k++) value += 8;
    for (k = 4; k < t[158 /* QUIVER_SLOTS */]; k++) value -= 1e4;
  } else {
    for (k = 0; k < 20 && k < t[155 /* AMISSILES */]; k++) value += 100;
    if (t[0 /* STR */] > 15) for (; k < 50 && k < t[155 /* AMISSILES */]; k++) value += 10;
    if (t[0 /* STR */] <= 15 && t[155 /* AMISSILES */] > 20) value -= 1e3;
    for (k = 2; k < t[158 /* QUIVER_SLOTS */]; k++) value -= 1e4;
  }
  value -= 1e3 * t[157 /* AMISSILES_CURSED */];
  value += 100 * t[156 /* AMISSILES_SPECIAL */];
  if (t[220 /* ASTFDEST */]) value += 5e3;
  for (k = 0; k < 9 && k < t[220 /* ASTFDEST */]; k++) value += 200;
  if (t[221 /* ATPORTOTHER */]) value += 5e3;
  if (cls === CLASS_WARRIOR && t[221 /* ATPORTOTHER */]) value += 5e4;
  for (k = 0; k < 15 && k < t[221 /* ATPORTOTHER */]; k++) value += 5e3;
  if ((has(d, "wand_magic_missile") || has(d, "wand_stinking_cloud")) && t[106 /* MAXDEPTH */] < 30)
    value += 5e3;
  if (has(d, "wand_annihilation") && t[105 /* CDEPTH */] < 30) value += 5e3;
  if ((cls === CLASS_WARRIOR || t[35 /* CLEVEL */] <= 20) && (has(d, "wand_magic_missile") || has(d, "wand_annihilation") || has(d, "wand_stinking_cloud")))
    value += 1e4;
  value += t[257 /* GOOD_W_CHG */] * 50;
  if (t[256 /* GOOD_S_CHG */]) value += 2500;
  for (k = 0; k < 3 && k < t[256 /* GOOD_S_CHG */]; k++) value += 500;
  for (k = 0; k < 6 && k < t[251 /* AROD1 */]; k++) value += 8e3;
  for (k = 0; k < 6 && k < t[252 /* AROD2 */]; k++) value += 12e3;
  if (!d.needStatgain[0]) value += 5e4;
  if (!d.needStatgain[1]) value += 2e4;
  if (!d.needStatgain[2]) value += 2e4;
  if (!d.needStatgain[3]) value += 5e4;
  if (!d.needStatgain[4]) value += 5e4;
  const spellStat = spellStatForClass(cls);
  if (spellStat >= 0 && !d.needStatgain[spellStat]) value += 5e4;
  if (d.amtStatgain[0] && t[10 /* CSTR */] < 18 + 100) value += 55e4;
  if (d.amtStatgain[1] && t[11 /* CINT */] < 18 + 100) value += 52e4;
  if (spellStat >= 0 && d.amtStatgain[spellStat] && t[10 /* CSTR */ + spellStat] < 18 + 100)
    value += 575e3;
  if (d.amtStatgain[2] && t[12 /* CWIS */] < 18 + 100) value += 52e4;
  if (d.amtStatgain[3] && t[13 /* CDEX */] < 18 + 100) value += 55e4;
  if (d.amtStatgain[4] && t[14 /* CCON */] < 18 + 100) value += 55e4;
  if (t[159 /* FIRST_CURSED */]) {
    if (has(d, "scroll_star_remove_curse")) value += 9e4;
    if (has(d, "scroll_remove_curse")) value += 9e4;
  }
  if (t[126 /* HASFIXEXP */]) value += 5e4;
  if (t[237 /* AENCH_ARM */] < 1e3 && t[240 /* NEED_ENCHANT_TO_A */]) value += 540;
  if (t[234 /* AENCH_TOH */] < 1e3 && t[241 /* NEED_ENCHANT_TO_H */]) value += 540;
  if (t[235 /* AENCH_TOD */] < 1e3 && t[242 /* NEED_ENCHANT_TO_D */]) value += 500;
  if (t[236 /* AENCH_SWEP */]) value += 5e3;
  if (t[238 /* AENCH_SARM */]) value += 5e3;
  for (k = 1; k < 6 && k < t[262 /* EMPTY */]; k++) value += 40;
  if (t[262 /* EMPTY */]) value += 4e3;
  if (t[106 /* MAXDEPTH */] <= 40 && t[106 /* MAXDEPTH */] >= 25 && t[45 /* GOLD */] < 1e5 && (equip[SLOT_WIELD2]?.tval ?? -1) !== TV_DIGGING2 && t[255 /* ADIGGER */] === 1)
    value += 5e3;
  if (t[260 /* WEIGHT */] > Math.trunc(t[261 /* CARRY */] / 2)) {
    value -= Math.trunc(
      (t[260 /* WEIGHT */] - Math.trunc(t[261 /* CARRY */] / 2)) / Math.trunc(t[261 /* CARRY */] / 10)
    ) * 1e3;
  }
  void H2;
  return value;
}

// src/trait/simulate.ts
function shadowWorld(world) {
  const sim = Object.create(world);
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
      temp: { ...world.self.temp }
    },
    writable: true,
    enumerable: true,
    configurable: true
  });
  return sim;
}
function shadowView(view, answer) {
  return {
    ...view,
    player: () => answer.after.player,
    equipment: () => [...answer.after.equipment],
    inventory: () => [...answer.after.inventory]
  };
}
function borgSimulatePower(ctx, change, opts = {}) {
  const view = ctx.view;
  const answer = view.simulateLoadout?.(change);
  if (!answer) return null;
  const simCtx = {
    ...ctx,
    world: shadowWorld(ctx.world),
    view: shadowView(ctx.view, answer)
  };
  borgNotice(simCtx, opts);
  return borgPower(simCtx, opts);
}

// src/store/store.ts
var BORG_HOME = 7;
var SHOP_GENERAL = 0;
var SHOP_TEMPLE = 3;
var SHOP_BLACK = 6;
var STORE_INVEN_MAX = 24;
var PACK_SIZE = 23;
var DEFAULT_MAX_STACK = 40;
function createStoreMemory() {
  return {
    soldTval: [],
    soldSval: [],
    soldPval: [],
    soldStore: [],
    soldNum: -1,
    soldNxt: 0,
    boughtTval: [],
    boughtSval: [],
    boughtPval: [],
    boughtStore: [],
    boughtNum: -1,
    boughtNxt: 0,
    moneyScumAmount: 0,
    moneyScumWho: -1,
    moneyScumWare: -1
  };
}
function recordSold(mem, item, store2) {
  if (mem.soldNxt >= 9) mem.soldNxt = 0;
  mem.soldPval[mem.soldNxt] = item.pval;
  mem.soldTval[mem.soldNxt] = item.tval;
  mem.soldSval[mem.soldNxt] = item.sval;
  mem.soldStore[mem.soldNxt] = store2;
  mem.soldNum = mem.soldNxt;
  mem.soldNxt++;
}
function recordBought(mem, item, store2) {
  if (mem.boughtNxt >= 9) mem.boughtNxt = 0;
  mem.boughtPval[mem.boughtNxt] = item.pval;
  mem.boughtTval[mem.boughtNxt] = item.tval;
  mem.boughtSval[mem.boughtNxt] = item.sval;
  mem.boughtStore[mem.boughtNxt] = store2;
  mem.boughtNum = mem.boughtNxt;
  mem.boughtNxt++;
}
function st(ctx, bi) {
  return ctx.world.self.trait[bi] ?? 0;
}
function storeInvenMax(d) {
  return d?.storeInvenMax ?? STORE_INVEN_MAX;
}
function packSize(d) {
  return d?.packSize ?? PACK_SIZE;
}
function maxStackOf(item, d) {
  if (d?.maxStack) return d.maxStack(item);
  return item.tval === TV.CHEST ? 1 : DEFAULT_MAX_STACK;
}
function iqty(item) {
  return item.number;
}
function itemValue2(item, d) {
  if (d?.itemValue) return d.itemValue(item);
  return item.value ?? 0;
}
function isAware2(item, d) {
  return d?.isAware ? d.isAware(item) : true;
}
function isIdent2(item, d) {
  return d?.isIdent ? d.isIdent(item) : true;
}
function needsIdent2(item, d) {
  return d?.needsIdent ? d.needsIdent(item) : false;
}
function noteNeedsId(item, d) {
  if (d?.noteNeedsId) return d.noteNeedsId(item);
  return needsIdent2(item, d);
}
function worthId(item, d) {
  return d?.worthId ? d.worthId(item) : false;
}
function shopCost(item) {
  return item.price ?? Infinity;
}
function isBookTval(tval) {
  return tval === TV.MAGIC_BOOK || tval === TV.PRAYER_BOOK || tval === TV.NATURE_BOOK || tval === TV.SHADOW_BOOK || tval === TV.OTHER_BOOK;
}
function canBrowse(item, d) {
  if (d?.canBrowse) return d.canBrowse(item);
  return isBookTval(item.tval);
}
function packSlots(ctx, d) {
  return packSize(d) - st(ctx, 158 /* QUIVER_SLOTS */);
}
function borgFirstEmptyInventorySlot(ctx, d) {
  const used = ctx.view.inventory().filter((i) => i.number > 0).length;
  return used < packSlots(ctx, d) ? used : -1;
}
function borgInventoryFull(ctx, d) {
  return borgFirstEmptyInventorySlot(ctx, d) === -1;
}
function homeStore(ctx) {
  const stores = ctx.view.stores();
  for (const s of stores) if (s.isHome) return s;
  return stores[BORG_HOME] ?? null;
}
function homeWares(ctx) {
  const home = homeStore(ctx);
  if (!home) return [];
  return home.stock.filter((i) => i.number > 0);
}
function borgHomeFull(ctx, d) {
  return homeWares(ctx).length >= storeInvenMax(d);
}
function borgMinItemQuantity(ctx, item, d) {
  if (st(ctx, 45 /* GOLD */) < 250) return 1;
  if (itemValue2(item, d) > 5) return 1;
  if (!isAware2(item, d)) return 1;
  switch (item.tval) {
    case TV.SHOT:
    case TV.ARROW:
    case TV.BOLT:
      if (iqty(item) < 5) return iqty(item);
      return 5;
    case TV.FOOD:
      if (iqty(item) < 3) return iqty(item);
      return 3;
    default:
      return 1;
  }
}
function borgPrimarilyCaster(ctx, d) {
  if (d?.primarilyCaster !== void 0) return d.primarilyCaster;
  const cls = st(ctx, 25 /* CLASS */);
  return cls === 1 || cls === 2 || cls === 3 || cls === 4;
}
function borgUsesSwaps(ctx, d) {
  const cfg = d?.usesSwaps ?? true;
  return cfg && st(ctx, 106 /* MAXDEPTH */) < 90;
}

// src/store/home.ts
function zeroCounts() {
  return {
    num_food: 0,
    num_fuel: 0,
    num_mold: 0,
    num_ident: 0,
    num_recall: 0,
    num_phase: 0,
    num_escape: 0,
    num_tele_staves: 0,
    num_teleport: 0,
    num_berserk: 0,
    num_teleport_level: 0,
    num_recharge: 0,
    num_cure_critical: 0,
    num_cure_serious: 0,
    num_pot_rheat: 0,
    num_pot_rcold: 0,
    num_missile: 0,
    num_book: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    num_fix_stat: [0, 0, 0, 0, 0],
    home_stat_add: [0, 0, 0, 0, 0],
    num_fix_exp: 0,
    num_mana: 0,
    num_heal: 0,
    num_ezheal: 0,
    num_life: 0,
    num_pfe: 0,
    num_glyph: 0,
    num_mass_genocide: 0,
    num_genocide: 0,
    num_speed: 0,
    num_enchant_to_a: 0,
    num_enchant_to_d: 0,
    num_enchant_to_h: 0,
    num_artifact: 0,
    num_ego: 0,
    home_slot_free: 0,
    home_un_id: 0,
    home_damage: 0,
    num_duplicate_items: 0,
    num_slow_digest: 0,
    num_regenerate: 0,
    num_telepathy: 0,
    num_LIGHT: 0,
    num_see_inv: 0,
    num_ffall: 0,
    num_free_act: 0,
    num_hold_life: 0,
    num_immune_acid: 0,
    num_immune_elec: 0,
    num_immune_fire: 0,
    num_immune_cold: 0,
    num_resist_acid: 0,
    num_resist_elec: 0,
    num_resist_fire: 0,
    num_resist_cold: 0,
    num_resist_pois: 0,
    num_resist_conf: 0,
    num_resist_sound: 0,
    num_resist_LIGHT: 0,
    num_resist_dark: 0,
    num_resist_chaos: 0,
    num_resist_disen: 0,
    num_resist_shard: 0,
    num_resist_nexus: 0,
    num_resist_blind: 0,
    num_resist_neth: 0,
    num_sustain_str: 0,
    num_sustain_int: 0,
    num_sustain_wis: 0,
    num_sustain_dex: 0,
    num_sustain_con: 0,
    num_sustain_all: 0,
    num_edged_weapon: 0,
    num_bad_gloves: 0,
    num_weapons: 0,
    num_bow: 0,
    num_rings: 0,
    num_neck: 0,
    num_armor: 0,
    num_cloaks: 0,
    num_shields: 0,
    num_hats: 0,
    num_gloves: 0,
    num_boots: 0
  };
}
function calcBlows(_item) {
  return 1;
}
function isBook(tval) {
  return tval === TV.MAGIC_BOOK || tval === TV.PRAYER_BOOK || tval === TV.NATURE_BOOK || tval === TV.SHADOW_BOOK || tval === TV.OTHER_BOOK;
}
function noticeDupe(c, item, checkSval, index, all, d) {
  if (item.ego && needsIdent2(item, d)) return;
  if (needsIdent2(item, d)) return;
  let dupeCount = iqty(item) - 1;
  for (let x = 0; x < index; x++) {
    const item2 = all[x];
    if (!item2 || iqty(item2) === 0 || !isAware2(item2, d)) continue;
    if (item.tval === item2.tval && (checkSval ? item.sval === item2.sval : true) && (item.artifactName ?? null) === (item2.artifactName ?? null) && (item.egoName ?? null) === (item2.egoName ?? null)) {
      dupeCount++;
    }
  }
  if (item.tval === TV.RING && dupeCount) dupeCount--;
  c.num_duplicate_items += dupeCount;
}
function borgNoticeHome(ctx, opts, d) {
  const c = zeroCounts();
  const ex = d?.home ?? {};
  const items = opts.items ?? [];
  const equip = opts.includeEquip ? ctx.view.equipment().filter((i) => !!i && i.number > 0) : [];
  const P = SVAL.potion;
  const Sc = SVAL.scroll;
  const F = SVAL.food;
  const Ro = SVAL.rod;
  const Sf = SVAL.staff;
  const storeInvenLen = items.length;
  const all = [...items, ...equip];
  c.home_slot_free = Math.max(
    0,
    (d?.storeInvenMax ?? 24) - storeInvenLen
  );
  const lightSval = ctx.view.equipment().find((i) => i && i.tval === TV.LIGHT)?.sval;
  for (let i = 0; i < all.length; i++) {
    const item = all[i];
    const fromHome = i < storeInvenLen;
    if (iqty(item) === 0) continue;
    if (!isAware2(item, d)) continue;
    if (hasFlag2(item, "SLOW_DIGEST")) c.num_slow_digest += iqty(item);
    if (hasFlag2(item, "REGEN")) c.num_regenerate += iqty(item);
    if (hasFlag2(item, "TELEPATHY")) c.num_telepathy += iqty(item);
    if (hasFlag2(item, "SEE_INVIS")) c.num_see_inv += iqty(item);
    if (hasFlag2(item, "FEATHER")) c.num_ffall += iqty(item);
    if (hasFlag2(item, "FREE_ACT")) c.num_free_act += iqty(item);
    if (hasFlag2(item, "HOLD_LIFE")) c.num_hold_life += iqty(item);
    if (hasFlag2(item, "PROT_CONF")) c.num_resist_conf += iqty(item);
    if (hasFlag2(item, "PROT_BLIND")) c.num_resist_blind += iqty(item);
    if (resLevel(item, "FIRE") === 3) {
      c.num_immune_fire += iqty(item);
      c.num_resist_fire += iqty(item);
    }
    if (resLevel(item, "ACID") === 3) {
      c.num_immune_acid += iqty(item);
      c.num_resist_acid += iqty(item);
    }
    if (resLevel(item, "COLD") === 3) {
      c.num_immune_cold += iqty(item);
      c.num_resist_cold += iqty(item);
    }
    if (resLevel(item, "ELEC") === 3) {
      c.num_immune_elec += iqty(item);
      c.num_resist_elec += iqty(item);
    }
    if (resLevel(item, "ACID") === 1) c.num_resist_acid += iqty(item);
    if (resLevel(item, "ELEC") === 1) c.num_resist_elec += iqty(item);
    if (resLevel(item, "FIRE") === 1) c.num_resist_fire += iqty(item);
    if (resLevel(item, "COLD") === 1) c.num_resist_cold += iqty(item);
    if (resLevel(item, "POIS") === 1) c.num_resist_pois += iqty(item);
    if (resLevel(item, "SOUND") === 1) c.num_resist_sound += iqty(item);
    if (resLevel(item, "LIGHT") === 1) c.num_resist_LIGHT += iqty(item);
    if (resLevel(item, "DARK") === 1) c.num_resist_dark += iqty(item);
    if (resLevel(item, "CHAOS") === 1) c.num_resist_chaos += iqty(item);
    if (resLevel(item, "DISEN") === 1) c.num_resist_disen += iqty(item);
    if (resLevel(item, "SHARD") === 1) c.num_resist_shard += iqty(item);
    if (resLevel(item, "NEXUS") === 1) c.num_resist_nexus += iqty(item);
    if (resLevel(item, "NETHER") === 1) c.num_resist_neth += iqty(item);
    if (hasFlag2(item, "SUST_STR")) c.num_sustain_str += iqty(item);
    if (hasFlag2(item, "SUST_INT")) c.num_sustain_str += iqty(item);
    if (hasFlag2(item, "SUST_WIS")) c.num_sustain_str += iqty(item);
    if (hasFlag2(item, "SUST_DEX")) c.num_sustain_str += iqty(item);
    if (hasFlag2(item, "SUST_CON")) c.num_sustain_str += iqty(item);
    if (hasFlag2(item, "SUST_STR") && hasFlag2(item, "SUST_INT") && hasFlag2(item, "SUST_WIS") && hasFlag2(item, "SUST_DEX") && hasFlag2(item, "SUST_CON"))
      c.num_sustain_all += iqty(item);
    const addStat = (statCode, statIdx) => {
      const v = mod(item, statCode);
      if (!v) return;
      if (item.tval !== TV.RING || v > 3)
        c.home_stat_add[statIdx] += v * iqty(item);
    };
    addStat("STR", STAT_STR);
    addStat("INT", STAT_INT);
    addStat("WIS", STAT_WIS);
    addStat("DEX", STAT_DEX);
    addStat("CON", STAT_CON);
    c.num_speed += mod(item, "SPEED") * iqty(item);
    if (item.artifact) c.num_artifact += iqty(item);
    if (item.ego && needsIdent2(item, d)) c.num_ego += iqty(item);
    if (needsIdent2(item, d) && fromHome) c.home_un_id++;
    switch (item.tval) {
      case TV.SOFT_ARMOR:
      case TV.HARD_ARMOR:
        c.num_armor += iqty(item);
        noticeDupe(c, item, false, i, all, d);
        break;
      case TV.DRAG_ARMOR:
        c.num_armor += iqty(item);
        noticeDupe(c, item, true, i, all, d);
        break;
      case TV.CLOAK:
        c.num_cloaks += iqty(item);
        noticeDupe(c, item, false, i, all, d);
        break;
      case TV.SHIELD:
        c.num_shields += iqty(item);
        noticeDupe(c, item, false, i, all, d);
        break;
      case TV.HELM:
      case TV.CROWN:
        c.num_hats += iqty(item);
        noticeDupe(c, item, false, i, all, d);
        break;
      case TV.GLOVES:
        c.num_gloves += iqty(item);
        c.home_damage += item.toD * 3;
        noticeDupe(c, item, false, i, all, d);
        break;
      case TV.FLASK:
        if (lightSval === SVAL.light.lantern) c.num_fuel += iqty(item);
        break;
      case TV.LIGHT:
        if (lightSval === SVAL.light.torch) c.num_fuel += iqty(item);
        if (item.artifact) c.num_LIGHT += iqty(item);
        break;
      case TV.BOOTS:
        c.num_boots += iqty(item);
        noticeDupe(c, item, false, i, all, d);
        break;
      case TV.SWORD:
      case TV.POLEARM:
      case TV.HAFTED: {
        c.num_weapons += iqty(item);
        if ((ex.playerFlag && ex.playerFlag("BLESS_WEAPON")) ?? false) {
          if (!(item.tval === TV.HAFTED || hasFlag2(item, "BLESSED")))
            c.num_edged_weapon += iqty(item);
        }
        const numBlow = calcBlows(item);
        if (item.toD > 8 || st(ctx, 35 /* CLEVEL */) < 15) {
          c.home_damage += numBlow * (item.dd * item.ds + (st(ctx, 135 /* TODAM */) + item.toD));
        } else {
          c.home_damage += numBlow * (item.dd * item.ds + (st(ctx, 135 /* TODAM */) + 8));
        }
        noticeDupe(c, item, false, i, all, d);
        break;
      }
      case TV.BOW:
        c.num_bow += iqty(item);
        noticeDupe(c, item, false, i, all, d);
        break;
      case TV.RING:
        c.num_rings += iqty(item);
        noticeDupe(c, item, true, i, all, d);
        break;
      case TV.AMULET:
        c.num_neck += iqty(item);
        noticeDupe(c, item, true, i, all, d);
        break;
      case TV.MAGIC_BOOK:
      case TV.PRAYER_BOOK:
      case TV.NATURE_BOOK:
      case TV.SHADOW_BOOK:
      case TV.OTHER_BOOK:
        if (!isBook(item.tval)) break;
        if (d?.isDungeonBook && d.isDungeonBook(item)) break;
        if (item.sval >= 0 && item.sval < 9) c.num_book[item.sval] += iqty(item);
        break;
      case TV.FOOD:
        if (item.sval === F.ration) c.num_food += iqty(item);
        else if (item.sval === F.slime_mold) c.num_mold += iqty(item);
        break;
      case TV.POTION:
        if (item.sval === P.cure_critical) c.num_cure_critical += iqty(item);
        else if (item.sval === P.cure_serious) c.num_cure_serious += iqty(item);
        else if (item.sval === P.resist_heat) c.num_pot_rheat += iqty(item);
        else if (item.sval === P.resist_cold) c.num_pot_rcold += iqty(item);
        else if (item.sval === P.restore_life) c.num_fix_exp += iqty(item);
        else if (item.sval === P.restore_mana) c.num_mana += iqty(item);
        else if (item.sval === P.healing) c.num_heal += iqty(item);
        else if (item.sval === P.star_healing) c.num_ezheal += iqty(item);
        else if (item.sval === P.life) c.num_life += iqty(item);
        else if (item.sval === P.berserk) c.num_berserk += iqty(item);
        else if (item.sval === P.speed) c.num_speed += iqty(item);
        break;
      case TV.SCROLL:
        if (item.sval === Sc.identify) c.num_ident += iqty(item);
        else if (item.sval === Sc.phase_door) c.num_phase += iqty(item);
        else if (item.sval === Sc.teleport) c.num_teleport += iqty(item);
        else if (item.sval === Sc.word_of_recall) c.num_recall += iqty(item);
        else if (item.sval === Sc.enchant_armor) c.num_enchant_to_a += iqty(item);
        else if (item.sval === Sc.enchant_weapon_to_hit)
          c.num_enchant_to_h += iqty(item);
        else if (item.sval === Sc.enchant_weapon_to_dam)
          c.num_enchant_to_d += iqty(item);
        else if (item.sval === Sc.protection_from_evil) c.num_pfe += iqty(item);
        else if (item.sval === Sc.rune_of_protection) c.num_glyph += iqty(item);
        else if (item.sval === Sc.teleport_level)
          c.num_teleport_level += iqty(item);
        else if (item.sval === Sc.recharging) c.num_recharge += iqty(item);
        else if (item.sval === Sc.mass_banishment)
          c.num_mass_genocide += iqty(item);
        break;
      case TV.ROD:
        if (item.sval === Ro.recall) c.num_recall += iqty(item) * 100;
        break;
      case TV.STAFF:
        if (item.pval <= 3 && st(ctx, 35 /* CLEVEL */) > 30) break;
        if (item.sval === Sf.teleportation) {
          c.num_escape += item.pval * iqty(item);
          c.num_tele_staves++;
        }
        break;
      case TV.SHOT:
      case TV.ARROW:
      case TV.BOLT:
        if (item.tval !== st(ctx, 152 /* AMMO_TVAL */)) break;
        if ((item.value ?? 0) <= 0) break;
        c.num_missile += iqty(item);
        break;
      default:
        break;
    }
  }
  const legal = ex.spellLegal ?? (() => false);
  const legalFail = ex.spellLegalFail ?? (() => false);
  if (legal("REMOVE_HUNGER") || legal("HERBAL_CURING")) c.num_food += 1e3;
  if (legal("IDENTIFY_RUNE")) c.num_ident += 1e3;
  if (legalFail("ENCHANT_WEAPON", 65)) {
    c.num_enchant_to_h += 1e3;
    c.num_enchant_to_d += 1e3;
  }
  if (legal("PROTECTION_FROM_EVIL")) c.num_pfe += 1e3;
  if (legal("GLYPH_OF_WARDING") || (ex.equipsGlyph ?? false)) c.num_glyph += 1e3;
  if (legal("WORD_OF_RECALL")) c.num_recall += 1e3;
  if (legal("TELEPORT_LEVEL")) c.num_teleport_level += 1e3;
  if (legal("RECHARGING")) c.num_recharge += 1e3;
  if (st(ctx, 20 /* SSTR */)) c.num_fix_stat[STAT_STR] += 1e3;
  if (st(ctx, 21 /* SINT */)) c.num_fix_stat[STAT_INT] += 1e3;
  if (st(ctx, 22 /* SWIS */)) c.num_fix_stat[STAT_WIS] += 1e3;
  if (st(ctx, 23 /* SDEX */)) c.num_fix_stat[STAT_DEX] += 1e3;
  if (st(ctx, 24 /* SCON */)) c.num_fix_stat[STAT_CON] += 1e3;
  const pf = ex.playerFlag ?? (() => false);
  const rr = ex.raceResist ?? (() => 0);
  if (pf("SLOW_DIGEST")) c.num_slow_digest++;
  if (pf("FEATHER")) c.num_ffall++;
  if (pf("LIGHT_2") || pf("LIGHT_3")) c.num_LIGHT++;
  if (pf("REGEN")) c.num_regenerate++;
  if (pf("TELEPATHY")) c.num_telepathy++;
  if (pf("SEE_INVIS")) c.num_see_inv++;
  if (pf("FREE_ACT")) c.num_free_act++;
  if (pf("HOLD_LIFE")) c.num_hold_life++;
  if (pf("PROT_CONF")) c.num_resist_conf++;
  if (pf("PROT_BLIND")) c.num_resist_blind++;
  if (rr("FIRE") === 3) c.num_immune_fire++;
  if (rr("ACID") === 3) c.num_immune_acid++;
  if (rr("COLD") === 3) c.num_immune_cold++;
  if (rr("ELEC") === 3) c.num_immune_elec++;
  if (rr("ACID") > 0) c.num_resist_acid++;
  if (rr("ELEC") > 0) c.num_resist_elec++;
  if (rr("FIRE") > 0) c.num_resist_fire++;
  if (rr("COLD") > 0) c.num_resist_cold++;
  if (rr("POIS") > 0) c.num_resist_pois++;
  if (rr("LIGHT") > 0) c.num_resist_LIGHT++;
  if (rr("DARK") > 0) c.num_resist_dark++;
  if (rr("SOUND") > 0) c.num_resist_sound++;
  if (rr("SHARD") > 0) c.num_resist_shard++;
  if (rr("NEXUS") > 0) c.num_resist_nexus++;
  if (rr("NETHER") > 0) c.num_resist_neth++;
  if (rr("CHAOS") > 0) c.num_resist_chaos++;
  if (rr("DISEN") > 0) c.num_resist_disen++;
  if (pf("SUST_STR")) c.num_sustain_str++;
  if (pf("SUST_INT")) c.num_sustain_int++;
  if (pf("SUST_WIS")) c.num_sustain_wis++;
  if (pf("SUST_DEX")) c.num_sustain_dex++;
  if (pf("SUST_CON")) c.num_sustain_con++;
  return c;
}
function noticeHomeFull(ctx, d) {
  return borgNoticeHome(ctx, { items: homeWares(ctx), includeEquip: true }, d);
}
function noticeHomeEmpty(ctx, d) {
  return borgNoticeHome(ctx, { items: [], includeEquip: false }, d);
}
function noticeHomeSingle(ctx, item, d) {
  return borgNoticeHome(ctx, { items: [item], includeEquip: false }, d);
}
var MAX_STACK = DEFAULT_MAX_STACK;
function powerHomeAux1(ctx, c) {
  let value = 0;
  const ladder = (n, a, b, step) => {
    if (n === 1) return a;
    if (n === 2) return b;
    if (n > 2) return b + (n - 2) * step;
    return 0;
  };
  value += ladder(c.num_LIGHT, 150, 170, 5);
  value += ladder(c.num_slow_digest, 50, 70, 5);
  value += ladder(c.num_regenerate, 75, 100, 10);
  value += ladder(c.num_telepathy, 1e3, 1500, 10);
  value += ladder(c.num_see_inv, 800, 1200, 10);
  value += ladder(c.num_ffall, 10, 15, 1);
  value += ladder(c.num_free_act, 1e3, 1500, 10);
  value += ladder(c.num_hold_life, 1e3, 1500, 10);
  value += ladder(c.num_resist_acid, 1e3, 1500, 1);
  value += ladder(c.num_immune_acid, 3e3, 5e3, 30);
  value += ladder(c.num_resist_elec, 1e3, 1500, 1);
  value += ladder(c.num_immune_elec, 3e3, 5e3, 30);
  value += ladder(c.num_resist_fire, 1e3, 1500, 1);
  value += ladder(c.num_immune_fire, 3e3, 5e3, 30);
  value += ladder(c.num_resist_cold, 1e3, 1500, 1);
  value += ladder(c.num_immune_cold, 3e3, 5e3, 30);
  value += ladder(c.num_resist_pois, 5e3, 9e3, 40);
  value += ladder(c.num_resist_conf, 2e3, 8e3, 45);
  value += ladder(c.num_resist_sound, 500, 700, 30);
  value += ladder(c.num_resist_LIGHT, 100, 150, 1);
  value += ladder(c.num_resist_dark, 100, 150, 1);
  value += ladder(c.num_resist_chaos, 1e3, 1500, 10);
  value += ladder(c.num_resist_disen, 5e3, 7e3, 35);
  value += ladder(c.num_resist_shard, 100, 150, 1);
  value += ladder(c.num_resist_nexus, 200, 300, 2);
  value += ladder(c.num_resist_blind, 500, 1e3, 5);
  value += ladder(c.num_resist_neth, 3e3, 4e3, 45);
  const str = c.home_stat_add[STAT_STR];
  if (str < 9) value += str * 300;
  else if (str < 15) value += 9 * 300 + (str - 9) * 200;
  else value += 9 * 300 + 6 * 200 + (str - 15) * 1;
  const dex = c.home_stat_add[STAT_DEX];
  if (dex < 9) value += dex * 300;
  else if (dex < 15) value += 9 * 300 + (dex - 9) * 200;
  else value += 9 * 300 + 6 * 200 + (dex - 15) * 1;
  const con = c.home_stat_add[STAT_CON];
  if (con < 15) value += con * 300;
  else if (con < 21) value += 15 * 300 + (con - 15) * 200;
  else value += 15 * 300 + 6 * 200 + (con - 21) * 1;
  const spellStat = spellStatForClass(st(ctx, 25 /* CLASS */));
  if (spellStat >= 0) {
    const ss = c.home_stat_add[spellStat];
    if (ss < 20) value += ss * 400;
    else if (ss < 26) value += 20 * 400 + (ss - 20) * 300;
    else value += 20 * 100 + 6 * 300 + (ss - 26) * 5;
  }
  value += ladder(c.num_sustain_str, 200, 250, 1);
  value += ladder(c.num_sustain_int, 200, 250, 1);
  value += ladder(c.num_sustain_wis, 200, 250, 1);
  value += ladder(c.num_sustain_con, 200, 250, 1);
  value += ladder(c.num_sustain_dex, 200, 250, 1);
  value += ladder(c.num_sustain_all, 1e3, 1500, 1);
  if (c.num_weapons > 5) value -= (c.num_weapons - 5) * 2e3;
  else if (c.num_weapons > 1) value -= (c.num_weapons - 1) * 100;
  if (c.num_bow > 2) value -= (c.num_bow - 2) * 1e3;
  if (c.num_rings > 6) value -= (c.num_rings - 6) * 4e3;
  else if (c.num_rings > 4) value -= (c.num_rings - 4) * 2e3;
  if (c.num_neck > 3) value -= (c.num_neck - 3) * 1500;
  else if (c.num_neck > 3) value -= (c.num_neck - 3) * 700;
  if (c.num_armor > 6) value -= (c.num_armor - 6) * 1e3;
  if (c.num_cloaks > 3) value -= (c.num_cloaks - 3) * 1e3;
  if (c.num_shields > 3) value -= (c.num_shields - 3) * 1e3;
  if (c.num_hats > 4) value -= (c.num_hats - 4) * 1e3;
  if (c.num_gloves > 3) value -= (c.num_gloves - 3) * 1e3;
  if (c.num_boots > 3) value -= (c.num_boots - 3) * 1e3;
  value += c.home_damage;
  value -= c.num_edged_weapon * 50;
  value -= c.num_bad_gloves * 3e3;
  value -= c.num_duplicate_items * 5e4;
  return value;
}
function powerHomeAux2(ctx, c) {
  let value = 0;
  let k = 0;
  const cle = st(ctx, 35 /* CLEVEL */);
  const maxcle = st(ctx, 36 /* MAXCLEVEL */);
  const maxdepth = st(ctx, 106 /* MAXDEPTH */);
  const cls = st(ctx, 25 /* CLASS */);
  if (maxcle < 10) {
    for (k = 0; k < MAX_STACK && k < c.num_food; k++) value += 8e3 - k * 10;
  }
  for (k = 0; k < MAX_STACK && k < c.num_ident; k++) value += 2e3 - k * 10;
  if (cle < 45) {
    for (k = 0; k < MAX_STACK && k < c.num_enchant_to_a; k++) value += 500 - k * 10;
  }
  if (cle < 45) {
    for (k = 0; k < MAX_STACK && k < c.num_enchant_to_h; k++) value += 500 - k * 10;
  }
  if (cle < 45) {
    for (k = 0; k < MAX_STACK && k < c.num_enchant_to_d; k++) value += 500 - k * 10;
  }
  for (k = 0; k < MAX_STACK && k < c.num_pfe; k++) value += 500 - k * 10;
  for (k = 0; k < MAX_STACK && k < c.num_glyph; k++) value += 500 - k * 10;
  for (k = 0; k < MAX_STACK * 2 && k < c.num_genocide; k++) value += 500 - k * 10;
  for (k = 0; k < MAX_STACK * 2 && k < c.num_mass_genocide; k++) value += 500;
  for (k = 0; k < MAX_STACK && k < c.num_recharge; k++) value += 500 - k * 10;
  if (cls === CLASS_WARRIOR && maxdepth > 20 && maxdepth < 80) {
    k = 0;
    for (; k < MAX_STACK && k < c.num_pot_rheat; k++) value += 100 - k * 10;
    for (; k < MAX_STACK && k < c.num_pot_rcold; k++) value += 100 - k * 10;
  }
  for (k = 0; k < 5 && k < c.num_recall; k++) value += 100;
  for (k = 0; k < 85 && k < c.num_escape; k++) value += 2e3 - k * 10;
  for (k = MAX_STACK; k < c.num_tele_staves; k++) value -= 5e4;
  for (k = 0; k < 85 && k < c.num_teleport; k++) value += 5e3;
  if (maxcle < 10) {
    for (k = 0; k < MAX_STACK && k < c.num_phase; k++) value += 5e3;
  }
  if (st(ctx, 31 /* MAXSP */) > 1) {
    for (k = 0; k < MAX_STACK && k < c.num_mana; k++) value += 6e3 - k * 8;
  }
  if (cle === 1) {
    for (k = 0; k < 10 && k < c.num_heal; k++) value -= 5e3;
  }
  for (k = 0; k < MAX_STACK && k < c.num_cure_critical; k++) value += 1500 - k * 10;
  for (k = 0; k < 90 && k < c.num_heal; k++) value += 3e3;
  for (k = 0; k < 198 && k < c.num_ezheal; k++) value += 8e3;
  for (k = 0; k < 198 && k < c.num_life; k++) value += 9e3;
  if (cle > 35)
    for (k = 0; k < 90 && k < c.num_cure_serious; k++) value -= 1500 - k * 10;
  if (cle === 50 && c.num_fix_exp) value -= 7500;
  if (cle > 35 && cle <= 49)
    for (k = 0; k < 70 && k < c.num_fix_exp; k++) value += 1e3 - k * 10;
  else if (cle <= 35)
    for (k = 0; k < 5 && k < c.num_fix_exp; k++) value += 1e3 - k * 10;
  for (let book = 0; book < 9; book++) {
    if (cle < 15) {
      for (k = 0; k < 5 && k < c.num_book[book]; k++) {
        if (c.num_book[book]) value += 5e3 - k * 10;
      }
    }
  }
  value += c.num_artifact * 500;
  value += c.num_ego * 5e3;
  if (c.home_un_id) value += (c.home_un_id - st(ctx, 217 /* AID */)) * 1005;
  return value;
}
function borgPowerHomeFrom(ctx, c) {
  return powerHomeAux1(ctx, c) + powerHomeAux2(ctx, c);
}

// src/store/sell.ts
var ELEMENTS = [
  "ACID",
  "ELEC",
  "FIRE",
  "COLD",
  "POIS",
  "LIGHT",
  "DARK",
  "SOUND",
  "SHARD",
  "NEXUS",
  "NETHER",
  "CHAOS",
  "DISEN"
];
var OBJ_MODS = [
  "STR",
  "INT",
  "WIS",
  "DEX",
  "CON",
  "STEALTH",
  "SEARCH",
  "INFRA",
  "TUNNEL",
  "SPEED",
  "BLOWS",
  "SHOTS",
  "MIGHT",
  "LIGHT",
  "DAM_RED",
  "MOVES"
];
function borgObjectSimilar(o, j, d) {
  const total = iqty(o) + 1;
  if (o.tval !== j.tval || o.sval !== j.sval) return false;
  if (!setEqual(o.flags, j.flags)) return false;
  for (const el of ELEMENTS) {
    if (resLevel(o, el) !== resLevel(j, el)) return false;
  }
  switch (o.tval) {
    case TV.CHEST:
      return false;
    case TV.FOOD:
    case TV.POTION:
    case TV.SCROLL:
      break;
    case TV.STAFF:
    case TV.WAND:
      if (!isAware2(o, d) || !isAware2(j, d)) return false;
      break;
    case TV.ROD:
      break;
    case TV.BOW:
    case TV.DIGGING:
    case TV.HAFTED:
    case TV.POLEARM:
    case TV.SWORD:
    case TV.BOOTS:
    case TV.GLOVES:
    case TV.HELM:
    case TV.CROWN:
    case TV.SHIELD:
    case TV.CLOAK:
    case TV.SOFT_ARMOR:
    case TV.HARD_ARMOR:
    case TV.DRAG_ARMOR:
    /* fall through to the rings/missiles bonus checks (:139-233). */
    /* falls through */
    case TV.RING:
    case TV.AMULET:
    case TV.LIGHT:
      if ((o.tval === TV.RING || o.tval === TV.AMULET || o.tval === TV.LIGHT) && (!isAware2(o, d) || !isAware2(j, d)))
        return false;
    /* falls through */
    case TV.BOLT:
    case TV.ARROW:
    case TV.SHOT: {
      if (o.tval === TV.BOW || o.tval === TV.DIGGING || o.tval === TV.HAFTED || o.tval === TV.POLEARM || o.tval === TV.SWORD || o.tval === TV.BOOTS || o.tval === TV.GLOVES || o.tval === TV.HELM || o.tval === TV.CROWN || o.tval === TV.SHIELD || o.tval === TV.CLOAK || o.tval === TV.SOFT_ARMOR || o.tval === TV.HARD_ARMOR || o.tval === TV.DRAG_ARMOR || o.tval === TV.RING || o.tval === TV.AMULET || o.tval === TV.LIGHT || o.tval === TV.BOLT || o.tval === TV.ARROW || o.tval === TV.SHOT) {
        if (o.toH !== j.toH) return false;
        if (o.toD !== j.toD) return false;
        if (o.toA !== j.toA) return false;
        for (const m of OBJ_MODS) if (mod(o, m) !== mod(j, m)) return false;
        if (!setEqual(o.curses, j.curses)) return false;
        if ((o.artifactName ?? null) !== (j.artifactName ?? null)) return false;
        if ((o.egoName ?? null) !== (j.egoName ?? null)) return false;
        if (o.flags.length !== 0 || j.flags.length !== 0) return false;
        if (o.timeout || j.timeout) return false;
        if (o.ac !== j.ac) return false;
        if (o.dd !== j.dd) return false;
        if (o.ds !== j.ds) return false;
      }
      break;
    }
    default:
      if (!isAware2(o, d) || !isAware2(j, d)) return false;
      break;
  }
  if (isIdent2(o, d) !== isIdent2(j, d)) return false;
  const on2 = o.inscription;
  const jn = j.inscription;
  if (on2 && !jn || !on2 && jn) return false;
  if (on2 && jn && on2 !== jn) return false;
  if (total >= maxStackOf(o, d)) return false;
  return true;
}
function setEqual(a, b) {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  for (const x of a) if (!sb.has(x)) return false;
  return true;
}
function borgHasMultiple(ctx, inItem, d) {
  if (iqty(inItem) > 1) return true;
  if (!isIdent2(inItem, d)) {
    switch (inItem.tval) {
      case TV.BOOTS:
      case TV.GLOVES:
      case TV.HELM:
      case TV.CROWN:
      case TV.SHIELD:
      case TV.SOFT_ARMOR:
      case TV.HARD_ARMOR:
      case TV.SHOT:
      case TV.BOLT:
      case TV.ARROW:
      case TV.BOW:
      case TV.DIGGING:
      case TV.HAFTED:
      case TV.POLEARM:
      case TV.SWORD:
        return false;
    }
  }
  for (const item of ctx.view.inventory()) {
    if (item === inItem) continue;
    if (item.tval === inItem.tval && item.sval === inItem.sval && iqty(item) !== 0)
      return true;
  }
  for (const item of ctx.view.equipment()) {
    if (!item) continue;
    if (item.tval === inItem.tval && item.sval === inItem.sval && iqty(item) !== 0)
      return true;
  }
  return false;
}
function borgStoreBuys(item, who, d) {
  switch (who + 1) {
    case 1:
      switch (item.tval) {
        case TV.FOOD:
        case TV.MUSHROOM:
        case TV.FLASK:
        case TV.SHOT:
        case TV.BOLT:
        case TV.ARROW:
        case TV.DIGGING:
          return true;
      }
      return false;
    case 2:
      switch (item.tval) {
        case TV.BOOTS:
        case TV.GLOVES:
        case TV.HELM:
        case TV.CROWN:
        case TV.SHIELD:
        case TV.SOFT_ARMOR:
        case TV.HARD_ARMOR:
        case TV.DRAG_ARMOR:
          return true;
      }
      return false;
    case 3:
      switch (item.tval) {
        case TV.SHOT:
        case TV.BOLT:
        case TV.ARROW:
        case TV.BOW:
        case TV.DIGGING:
        case TV.HAFTED:
        case TV.POLEARM:
        case TV.SWORD:
          return true;
      }
      return false;
    case 4:
      switch (item.tval) {
        case TV.PRAYER_BOOK:
        case TV.MAGIC_BOOK:
        case TV.NATURE_BOOK:
        case TV.SHADOW_BOOK:
        case TV.OTHER_BOOK:
          return true;
      }
      return false;
    case 5:
      switch (item.tval) {
        case TV.SCROLL:
        case TV.POTION:
          return true;
      }
      return false;
    case 6:
      switch (item.tval) {
        case TV.AMULET:
        case TV.RING:
        case TV.STAFF:
        case TV.WAND:
        case TV.ROD:
        case TV.MAGIC_BOOK:
          return true;
      }
      return false;
    case 7:
      if (d?.noSelling ?? false) return true;
      switch (item.tval) {
        case TV.LIGHT:
        case TV.CLOAK:
        case TV.FOOD:
          return true;
      }
      return false;
  }
  return false;
}
function borgGoodSell(ctx, item, who, d) {
  const mem = d?.mem ?? createStoreMemory();
  let multiple = false;
  if (itemValue2(item, d) <= 0) {
    if (!((item.tval === TV.POTION || item.tval === TV.SCROLL) && !isIdent2(item, d)))
      return false;
  }
  if (!borgStoreBuys(item, who, d)) return false;
  if (noteNeedsId(item, d)) {
    multiple = borgHasMultiple(ctx, item, d);
    if (!multiple) return false;
  }
  const worshipsGold = d?.worshipsGold ?? false;
  const scumActive = mem.moneyScumAmount < st(ctx, 45 /* GOLD */) && mem.moneyScumAmount !== 0;
  if (itemValue2(item, d) > 0 && (worshipsGold || st(ctx, 36 /* MAXCLEVEL */) < 10 || scumActive)) {
  } else {
    switch (item.tval) {
      case TV.POTION:
      case TV.SCROLL:
        if (!isIdent2(item, d)) return true;
        if (item.tval === TV.POTION && item.sval === SVAL.potion.restore_mana && st(ctx, 31 /* MAXSP */) > 100)
          return false;
        break;
      case TV.FOOD:
      case TV.ROD:
      case TV.WAND:
      case TV.STAFF:
      case TV.RING:
      case TV.AMULET:
      case TV.LIGHT:
        if (worthId(item, d) && st(ctx, 106 /* MAXDEPTH */) < 35 && !multiple)
          return false;
        break;
      case TV.BOW:
      case TV.DIGGING:
      case TV.HAFTED:
      case TV.POLEARM:
      case TV.SWORD:
      case TV.BOOTS:
      case TV.GLOVES:
      case TV.HELM:
      case TV.CROWN:
      case TV.SHIELD:
      case TV.CLOAK:
      case TV.SOFT_ARMOR:
      case TV.HARD_ARMOR:
      case TV.DRAG_ARMOR:
        if (worthId(item, d) && !multiple) return false;
        break;
    }
  }
  if ((d?.randarts ?? false) && item.artifact && !isIdent2(item, d)) return false;
  if (!isIdent2(item, d) && item.ego && iqty(item) < 2 && needsIdent2(item, d))
    return false;
  for (let i = 0; i < mem.boughtNum; i++) {
    if (mem.boughtTval[i] === item.tval && mem.boughtSval[i] === item.sval && (mem.boughtStore[i] === who || who !== BORG_HOME))
      return false;
  }
  return true;
}
function homeSellBad(ctx, item, emptyHomePower, d) {
  const mem = d?.mem ?? createStoreMemory();
  if (iqty(item) === 0 || !isAware2(item, d)) return true;
  if ((d?.randarts ?? false) && item.artifact && !isIdent2(item, d)) return true;
  if (!itemValue2(item, d)) return true;
  for (let p = 0; p < mem.boughtNum; p++) {
    if (mem.boughtTval[p] === item.tval && mem.boughtSval[p] === item.sval && mem.boughtPval[p] === item.pval && mem.boughtStore[p] === BORG_HOME)
      return true;
  }
  const single = noticeHomeSingle(ctx, item, d);
  if (borgPowerHomeFrom(ctx, single) <= emptyHomePower) return true;
  if (!d?.sellHomeBadEval) return true;
  if (d.sellHomeBadEval(ctx, item) < ctx.world.self.power) return true;
  return false;
}
function homeSellBest(ctx, d) {
  const emptyHomePower = borgPowerHomeFrom(ctx, noticeHomeEmpty(ctx, d));
  let bestPower = borgPowerHomeFrom(ctx, noticeHomeFull(ctx, d));
  const home = homeWares(ctx);
  const W2 = home.length;
  const invMax = storeInvenMax(d);
  let firstEmpty = W2;
  if (firstEmpty < invMax) firstEmpty++;
  const pack = ctx.view.inventory();
  let best = null;
  for (let n = 0; n < firstEmpty; n++) {
    const item2 = n < W2 ? home[n] : null;
    for (let i = 0; i < pack.length; i++) {
      const item = pack[i];
      if (homeSellBad(ctx, item, emptyHomePower, d)) continue;
      const trial = [...home];
      if (item2 && borgObjectSimilar(item2, item, d)) {
        trial[n] = withQty(item2, iqty(item2) + 1);
      } else {
        let stacksElsewhere = false;
        for (let k = 0; k < home.length; k++) {
          if (borgObjectSimilar(home[k], item, d)) {
            stacksElsewhere = true;
            break;
          }
        }
        if (stacksElsewhere) continue;
        if (item2) trial[n] = withQty(item, 1);
        else trial.push(withQty(item, 1));
      }
      const power = borgPowerHomeFrom(
        ctx,
        borgNoticeHome(ctx, { items: trial, includeEquip: true }, d)
      );
      if (power > bestPower) {
        bestPower = power;
        best = { slot: n, packIndex: i, power };
      }
    }
  }
  return best;
}
function withQty(item, n) {
  return { ...item, number: n };
}
function borgThinkHomeSellUseful(ctx, d) {
  const home = homeStore(ctx);
  const mem = d?.mem ?? createStoreMemory();
  if (homeWares(ctx).length >= storeInvenMax(d) && borgFirstEmptyInventorySlot(ctx, d) === -1) {
    return { chosen: false, bestHomePower: -1 };
  }
  if (!home) return { chosen: false, bestHomePower: -1 };
  const move = homeSellBest(ctx, d);
  const bestHomePower = move ? move.power : borgPowerHomeFrom(ctx, noticeHomeFull(ctx, d));
  if (!move) return { chosen: false, bestHomePower };
  const wares = homeWares(ctx);
  const pack = ctx.view.inventory();
  const item = pack[move.packIndex];
  const item2 = move.slot < wares.length ? wares[move.slot] : null;
  const packFull = borgFirstEmptyInventorySlot(ctx, d) === -1;
  if (item2 && borgObjectSimilar(item2, item, d) && iqty(item2) <= 90) {
    ctx.world.self.goal.shop = BORG_HOME;
    ctx.world.self.goal.item = move.packIndex;
    ctx.world.self.goal.ware = -1;
    return { chosen: true, bestHomePower };
  }
  if (!packFull && item2 && !borgObjectSimilar(item, item2, d)) {
    for (let p = 0; p < mem.soldNum; p++) {
      if (mem.soldTval[p] === item2.tval && mem.soldSval[p] === item2.sval && mem.soldStore[p] === BORG_HOME)
        return { chosen: false, bestHomePower };
    }
    ctx.world.self.goal.shop = BORG_HOME;
    ctx.world.self.goal.ware = move.slot;
    ctx.world.self.goal.item = -1;
    return { chosen: true, bestHomePower };
  }
  if (iqty(item) > 0) {
    ctx.world.self.goal.shop = BORG_HOME;
    ctx.world.self.goal.item = move.packIndex;
    ctx.world.self.goal.ware = -1;
    return { chosen: true, bestHomePower };
  }
  return { chosen: false, bestHomePower };
}
function borgThinkShopSellUseless(ctx, d) {
  const stores = ctx.view.stores();
  const pack = ctx.view.inventory();
  const invMax = storeInvenMax(d);
  let bK = -1;
  let bI = -1;
  let bP = ctx.world.self.power;
  let bC = 30001;
  for (let k = 0; k < stores.length; k++) {
    const shop = stores[k];
    if (shop.isHome) continue;
    if (shop.stock.length >= invMax) continue;
    for (let i = 0; i < pack.length; i++) {
      const item = pack[i];
      if (iqty(item) === 0) continue;
      if (item.tval === st(ctx, 152 /* AMMO_TVAL */) && st(ctx, 155 /* AMISSILES */) < 45)
        continue;
      if (item.tval === TV.ROD && item.sval === SVAL.rod.healing && countHas(ctx, TV.ROD, SVAL.rod.healing) <= 3)
        continue;
      if (st(ctx, 25 /* CLASS */) === CLASS_WARRIOR && item.tval === TV.ROD && item.sval === SVAL.rod.mapping && iqty(item) <= 2)
        continue;
      if (item.tval === TV.WAND && st(ctx, 35 /* CLEVEL */) < 35 && (item.sval === SVAL.wand.magic_missile || item.sval === SVAL.wand.stinking_cloud || item.sval === SVAL.wand.annihilation) && item.pval !== 0)
        continue;
      if (!borgGoodSell(ctx, item, k, d)) continue;
      const qty = borgMinItemQuantity(ctx, item, d);
      const p = d?.sellEval ? d.sellEval(ctx, item, qty) : ctx.world.self.power - 1;
      if (p < bP) continue;
      const c = itemValue2(item, d) < 3e4 ? itemValue2(item, d) : 3e4;
      if (p === bP && c >= bC) continue;
      bK = k;
      bI = i;
      bP = p;
      bC = c;
    }
  }
  if (bK >= 0 && bI >= 0) {
    ctx.world.self.goal.shop = bK;
    ctx.world.self.goal.item = bI;
    ctx.world.self.goal.ware = -1;
    return true;
  }
  return false;
}
function countHas(ctx, tval, sval) {
  let n = 0;
  for (const item of ctx.view.inventory())
    if (item.tval === tval && item.sval === sval) n += iqty(item);
  return n;
}
function borgThinkShopSell(ctx, shopNum, d) {
  const goal = ctx.world.self.goal;
  if (goal.shop !== shopNum || goal.item < 0) return null;
  const pack = ctx.view.inventory();
  const item = pack[goal.item];
  if (!item) return null;
  const qty = borgMinItemQuantity(ctx, item, d);
  const cmd = ctx.act.shopSell(item.handle, qty);
  const mem = d?.mem;
  if (mem) recordSold(mem, item, goal.shop);
  goal.shop = -1;
  goal.ware = -1;
  goal.item = -1;
  ctx.world.self.timeThisPanel++;
  ctx.world.self.inShop = false;
  return cmd;
}
function borgCountSell(ctx, d) {
  const gold = st(ctx, 45 /* GOLD */);
  const clevel = st(ctx, 35 /* CLEVEL */);
  const maxdepth = st(ctx, 106 /* MAXDEPTH */);
  let greed = Math.trunc(gold / 100) + 100;
  if (greed < 1e3) greed = 1e3;
  if (greed > 25e3) greed = 25e3;
  if (maxdepth >= 50) greed = 75e3;
  if (clevel < 25) greed = Math.trunc(gold / 100) + 50;
  if (clevel < 20) greed = Math.trunc(gold / 100) + 35;
  if (clevel < 15) greed = Math.trunc(gold / 100) + 20;
  if (clevel < 13) greed = Math.trunc(gold / 100) + 10;
  if (clevel < 10) greed = Math.trunc(gold / 100) + 5;
  if (clevel < 5) greed = Math.trunc(gold / 100);
  let k = 0;
  const ammoTval = st(ctx, 152 /* AMMO_TVAL */);
  const P = SVAL.potion;
  const St = SVAL.staff;
  const W2 = SVAL.wand;
  const Sc = SVAL.scroll;
  for (const item of ctx.view.inventory()) {
    if (iqty(item) === 0) continue;
    if (itemValue2(item, d) <= 0) continue;
    if (item.tval === ammoTval) continue;
    if (isBookTval(item.tval)) continue;
    if (noteNeedsId(item, d)) {
      if (!borgHasMultiple(ctx, item, d)) return 0;
    }
    if (item.tval === TV.POTION && item.sval === P.cure_serious || item.tval === TV.POTION && item.sval === P.cure_critical || item.tval === TV.POTION && item.sval === P.healing || item.tval === TV.POTION && item.sval === P.star_healing || item.tval === TV.POTION && item.sval === P.life || item.tval === TV.POTION && item.sval === P.speed || item.tval === TV.STAFF && item.sval === St.teleportation || item.tval === TV.WAND && item.sval === W2.drain_life || item.tval === TV.WAND && item.sval === W2.annihilation || item.tval === TV.SCROLL && item.sval === Sc.teleport)
      continue;
    const price = itemValue2(item, d) < 3e4 ? itemValue2(item, d) : 3e4;
    if (price * iqty(item) < greed && !noteNeedsId(item, d)) continue;
    const p = d?.sellEval ? d.sellEval(ctx, item, iqty(item)) : ctx.world.self.power - 51;
    if (p + 50 < ctx.world.self.power) continue;
    k++;
  }
  return k;
}

// src/store/buy.ts
function wieldSlot(item) {
  switch (item.tval) {
    case TV.DIGGING:
    case TV.HAFTED:
    case TV.POLEARM:
    case TV.SWORD:
      return "weapon";
    case TV.BOW:
      return "bow";
    case TV.RING:
      return "ring";
    case TV.AMULET:
      return "amulet";
    case TV.LIGHT:
      return "light";
    case TV.SOFT_ARMOR:
    case TV.HARD_ARMOR:
    case TV.DRAG_ARMOR:
      return "body";
    case TV.CLOAK:
      return "cloak";
    case TV.SHIELD:
      return "shield";
    case TV.HELM:
    case TV.CROWN:
      return "helm";
    case TV.GLOVES:
      return "gloves";
    case TV.BOOTS:
      return "boots";
    default:
      return null;
  }
}
function wornLight(ctx) {
  for (const item of ctx.view.equipment())
    if (item && item.tval === TV.LIGHT) return item;
  return null;
}
function buyWields(ctx, item, d) {
  const hole = borgFirstEmptyInventorySlot(ctx, d);
  if (hole === -1 || hole + 1 >= packSlots(ctx, d)) return false;
  let slot = wieldSlot(item);
  if (slot === null) return false;
  if (item.tval === TV.LIGHT && item.sval === SVAL.light.torch) {
    const light = wornLight(ctx);
    if (light && hasFlag2(light, "BURNS_OUT")) slot = null;
    if (light && light.sval === SVAL.light.lantern && hasFlag2(light, "TAKES_FUEL"))
      slot = null;
  }
  if (item.tval === TV.DIGGING) slot = null;
  return slot !== null;
}
function borgGoodBuy(ctx, item, who, ware, d) {
  const mem = d?.mem ?? createStoreMemory();
  switch (item.tval) {
    case TV.SHOT:
    case TV.ARROW:
    case TV.BOLT:
      if (st(ctx, 35 /* CLEVEL */) < 35) {
        if (item.toH) return false;
        if (item.toD) return false;
      }
      break;
    case TV.PRAYER_BOOK:
    case TV.MAGIC_BOOK:
    case TV.NATURE_BOOK:
    case TV.SHADOW_BOOK:
    case TV.OTHER_BOOK:
      if (!canBrowse(item, d)) return false;
      break;
  }
  if (who === SHOP_BLACK) {
    const P = SVAL.potion;
    const Ro = SVAL.rod;
    const Sc = SVAL.scroll;
    const cls = st(ctx, 25 /* CLASS */);
    if (item.tval === TV.SCROLL && item.sval === Sc.remove_curse && st(ctx, 159 /* FIRST_CURSED */))
      return true;
    const special = item.tval === TV.POTION && (item.sval === P.star_healing || item.sval === P.life || item.sval === P.healing || item.sval === P.inc_str && st(ctx, 10 /* CSTR */) < 18 + 100 || item.sval === P.inc_int && st(ctx, 11 /* CINT */) < 18 + 100 || item.sval === P.inc_wis && st(ctx, 12 /* CWIS */) < 18 + 100 || item.sval === P.inc_dex && st(ctx, 13 /* CDEX */) < 18 + 100 || item.sval === P.inc_con && st(ctx, 14 /* CCON */) < 18 + 100) || item.tval === TV.ROD && (item.sval === Ro.healing || item.sval === Ro.recall && cls !== CLASS_PRIEST && cls !== CLASS_PALADIN || item.sval === Ro.speed && cls !== CLASS_DRUID && cls !== CLASS_RANGER || item.sval === Ro.teleport_other && cls !== CLASS_MAGE && cls === CLASS_ROGUE || item.sval === Ro.illumination && !st(ctx, 228 /* ALITE */)) || canBrowse(item, d) && (d?.amtBook ? d.amtBook(item) : 0) === 0 && (d?.isDungeonBook ? d.isDungeonBook(item) : false) || item.tval === TV.SCROLL && (item.sval === Sc.teleport_level || item.sval === Sc.teleport);
    if (special) {
      if ((d?.selfScum ?? true) && st(ctx, 35 /* CLEVEL */) >= 10 && st(ctx, 26 /* LIGHT */) && st(ctx, 39 /* FOOD */) + 0 >= 100 && /* num_food seam folded to 0 by default */
      shopCost(item) <= 85e3) {
        const dexSafe = 0;
        if (dexSafe + st(ctx, 35 /* CLEVEL */) > 90) {
          mem.moneyScumAmount = shopCost(item);
          mem.moneyScumWho = who;
          mem.moneyScumWare = ware;
        }
      }
      return true;
    }
    if (st(ctx, 35 /* CLEVEL */) < 15 && st(ctx, 45 /* GOLD */) < 2e4) return false;
    if (st(ctx, 35 /* CLEVEL */) < 35 && st(ctx, 45 /* GOLD */) < 15e3) return false;
    if (st(ctx, 45 /* GOLD */) < 1e4) return false;
  }
  for (let p = 0; p < mem.soldNum; p++) {
    if (mem.soldTval[p] === item.tval && mem.soldSval[p] === item.sval && mem.soldStore[p] === who)
      return false;
  }
  if (item.tval === TV.DIGGING) {
    for (const it of ctx.view.inventory()) if (it.tval === TV.DIGGING) return false;
  }
  if (st(ctx, 36 /* MAXCLEVEL */) < 5) {
    if (canBrowse(item, d) && item.sval >= 1) return false;
  }
  if (!borgPrimarilyCaster(ctx, d) && st(ctx, 36 /* MAXCLEVEL */) <= 8) {
    if (canBrowse(item, d) && item.sval >= 1) return false;
  }
  return true;
}
function borgThinkShopBuyUseful(ctx, d) {
  const hole = borgFirstEmptyInventorySlot(ctx, d);
  if (hole === -1) return false;
  if (ctx.world.self.goal.ware !== -1) return false;
  const mem = d?.mem ?? createStoreMemory();
  const stores = ctx.view.stores();
  let bK = -1;
  let bN = -1;
  let bP = ctx.world.self.power;
  let bC = 0;
  const light0food0 = st(ctx, 26 /* LIGHT */) === 0 || st(ctx, 39 /* FOOD */) === 0;
  const hurt = st(ctx, 116 /* ISCUT */) || st(ctx, 115 /* ISPOISONED */);
  for (let k = 0; k < stores.length; k++) {
    const shop = stores[k];
    if (shop.isHome) continue;
    if (light0food0 && k !== 0 && k !== BORG_HOME) continue;
    if (hurt && k !== SHOP_TEMPLE) continue;
    for (let n = 0; n < shop.stock.length; n++) {
      const item = shop.stock[n];
      if (iqty(item) === 0) continue;
      if (!borgGoodBuy(ctx, item, k, n, d)) continue;
      if (mem.moneyScumAmount && (k !== mem.moneyScumWho || n !== mem.moneyScumWare))
        continue;
      if (st(ctx, 45 /* GOLD */) < shopCost(item)) continue;
      if (st(ctx, 39 /* FOOD */) === 0 && item.tval !== TV.FOOD && item.tval !== TV.SCROLL && item.sval !== SVAL.scroll.satisfy_hunger)
        continue;
      if (item.tval === TV.WAND && (item.sval === SVAL.wand.magic_missile || item.sval === SVAL.wand.stinking_cloud) && st(ctx, 257 /* GOOD_W_CHG */) > 40)
        continue;
      if (item.tval === TV.WAND && (item.sval === SVAL.wand.magic_missile || item.sval === SVAL.wand.stinking_cloud) && st(ctx, 36 /* MAXCLEVEL */) > 30)
        continue;
      const qty = borgMinItemQuantity(ctx, item, d);
      const wields = buyWields(ctx, item, d);
      const sim = { item, store: k, qty, wields };
      const p = d?.buyShopEval ? d.buyShopEval(ctx, sim) : ctx.world.self.power;
      const c = shopCost(item) * qty;
      if (p <= bP) continue;
      if (p === bP && c >= bC) continue;
      bK = k;
      bN = n;
      bP = p;
      bC = c;
    }
  }
  if (bK >= 0 && bN >= 0) {
    ctx.world.self.goal.shop = bK;
    ctx.world.self.goal.ware = bN;
    return true;
  }
  return false;
}
function borgThinkHomeBuyUseful(ctx, d) {
  const mem = d?.mem ?? createStoreMemory();
  const wares = homeWares(ctx);
  let bN = -1;
  let bP = ctx.world.self.power;
  for (let n = 0; n < wares.length; n++) {
    const item = wares[n];
    if (iqty(item) === 0) continue;
    let skip = false;
    for (let i = 0; i < mem.soldNum; i++) {
      if (mem.soldTval[i] === item.tval && mem.soldSval[i] === item.sval)
        skip = true;
    }
    if (skip) continue;
    if (borgFirstEmptyInventorySlot(ctx, d) === -1) continue;
    const qty = borgMinItemQuantity(ctx, item, d);
    const wields = wieldSlot(item) !== null;
    const sim = { item, store: BORG_HOME, qty, wields };
    const p = d?.buyHomeEval ? d.buyHomeEval(ctx, sim) : ctx.world.self.power;
    if (p <= bP) continue;
    bN = n;
    bP = p;
  }
  if (bN >= 0 && bP > ctx.world.self.power) {
    ctx.world.self.goal.shop = BORG_HOME;
    ctx.world.self.goal.ware = bN;
    return true;
  }
  return false;
}
function borgThinkShopGrabInteresting(ctx, d) {
  if (st(ctx, 263 /* SAURON_DEAD */)) return false;
  if (st(ctx, 35 /* CLEVEL */) < 15) return false;
  const hole = borgFirstEmptyInventorySlot(ctx, d);
  if (hole === -1) return false;
  if (hole + 1 >= packSlots(ctx, d)) return false;
  const emptyHomePower = borgPowerHomeFrom(ctx, noticeHomeEmpty(ctx, d));
  const wares = homeWares(ctx);
  let bS = borgPowerHomeFrom(ctx, noticeHomeFull(ctx, d));
  let bC = 0;
  const stores = ctx.view.stores();
  let bK = -1;
  let bN = -1;
  for (let k = 0; k < stores.length; k++) {
    const shop = stores[k];
    if (shop.isHome) continue;
    for (let n = 0; n < shop.stock.length; n++) {
      const item = shop.stock[n];
      if (iqty(item) === 0) continue;
      if (!borgGoodBuy(ctx, item, k, n, d)) continue;
      if (st(ctx, 45 /* GOLD */) < 1e3 + shopCost(item) * 5) continue;
      const qty = borgMinItemQuantity(ctx, item, d);
      const added = { ...item, number: qty };
      const single = noticeHomeSingle(ctx, added, d);
      if (emptyHomePower >= borgPowerHomeFrom(ctx, single)) continue;
      const s0 = borgPowerHomeFrom(
        ctx,
        borgNoticeHome(ctx, { items: [...wares, added], includeEquip: true }, d)
      );
      let s = s0;
      const c = shopCost(item) * qty;
      if (c > Math.trunc(st(ctx, 45 /* GOLD */) / 10)) s -= c;
      if (s < bS) continue;
      if (s === bS && c >= bC) continue;
      bK = k;
      bN = n;
      bS = s;
      bC = c;
    }
  }
  ctx.world.self.goal.shop = -1;
  ctx.world.self.goal.ware = -1;
  ctx.world.self.goal.item = -1;
  if (bK >= 0 && bN >= 0) {
    ctx.world.self.goal.shop = bK;
    ctx.world.self.goal.ware = bN;
    return true;
  }
  return false;
}
function borgThinkHomeGrabUseless(ctx, d) {
  const mem = d?.mem ?? createStoreMemory();
  const hole = borgFirstEmptyInventorySlot(ctx, d);
  if (hole === -1) return false;
  if (hole + 1 >= packSlots(ctx, d)) return false;
  const wares = homeWares(ctx);
  let bS = borgPowerHomeFrom(ctx, noticeHomeFull(ctx, d));
  let bN = -1;
  for (let n = 0; n < wares.length; n++) {
    const item = wares[n];
    if (iqty(item) === 0) continue;
    let skip = false;
    for (let p = 0; p < mem.soldNum; p++) {
      if (mem.soldTval[p] === item.tval && mem.soldSval[p] === item.sval && mem.soldStore[p] === BORG_HOME)
        skip = true;
    }
    if (skip) continue;
    const qty = borgMinItemQuantity(ctx, item, d);
    const trial = [];
    for (let m = 0; m < wares.length; m++) {
      if (m === n) {
        const left = iqty(item) - qty;
        if (left > 0) trial.push({ ...item, number: left });
      } else {
        trial.push(wares[m]);
      }
    }
    const s = borgPowerHomeFrom(
      ctx,
      borgNoticeHome(ctx, { items: trial, includeEquip: true }, d)
    );
    if (s < bS) continue;
    bN = n;
    bS = s;
  }
  if (bN >= 0) {
    ctx.world.self.goal.shop = BORG_HOME;
    ctx.world.self.goal.ware = bN;
    return true;
  }
  return false;
}
function borgThinkHomeBuySwap(ctx, weapon, d) {
  const evalFn = weapon ? d?.weaponSwapEval : d?.armourSwapEval;
  if (!evalFn) return false;
  const wares = homeWares(ctx);
  let bN = -1;
  let bP = 0;
  for (let n = 0; n < wares.length; n++) {
    const item = wares[n];
    if (iqty(item) === 0) continue;
    if (weapon && wieldSlot(item) !== "weapon") continue;
    const p = evalFn(ctx, item);
    if (p <= bP) continue;
    bN = n;
    bP = p;
  }
  if (bN >= 0 && bP > 0) {
    ctx.world.self.goal.shop = BORG_HOME;
    ctx.world.self.goal.ware = bN;
    return true;
  }
  return false;
}
function borgThinkHomeBuySwapWeapon(ctx, d) {
  return borgThinkHomeBuySwap(ctx, true, d);
}
function borgThinkHomeBuySwapArmour(ctx, d) {
  return borgThinkHomeBuySwap(ctx, false, d);
}
function borgThinkShopBuy(ctx, shopNum, d) {
  const goal = ctx.world.self.goal;
  if (goal.shop !== shopNum || goal.ware < 0) return null;
  const shop = ctx.view.stores()[goal.shop];
  if (!shop) return null;
  const item = shop.stock[goal.ware];
  if (!item || item.tval === 0) {
    goal.shop = -1;
    goal.ware = -1;
    goal.item = -1;
    ctx.world.self.timeThisPanel++;
    return null;
  }
  const cmd = ctx.act.shopBuy(item.index);
  const mem = d?.mem;
  if (mem) {
    if (mem.moneyScumAmount && shopCost(item) >= Math.trunc(mem.moneyScumAmount * 9 / 10)) {
      mem.moneyScumAmount = 0;
    }
    recordBought(mem, item, goal.shop);
  }
  goal.shop = -1;
  goal.ware = -1;
  goal.item = -1;
  ctx.world.self.timeThisPanel++;
  ctx.world.self.inShop = false;
  return cmd;
}

// src/store/think-store.ts
function borgChooseShop(ctx, d) {
  const goal = ctx.world.self.goal;
  const mem = d?.mem ?? createStoreMemory();
  if (st(ctx, 105 /* CDEPTH */)) return false;
  if (ctx.world.self.timeThisPanel > 1350) return false;
  if (goal.shop !== -1 && goal.ware !== -1) return true;
  if (st(ctx, 116 /* ISCUT */) || st(ctx, 115 /* ISPOISONED */)) goal.shop = SHOP_TEMPLE;
  if (st(ctx, 39 /* FOOD */) === 0 || st(ctx, 26 /* LIGHT */) === 0 && st(ctx, 35 /* CLEVEL */) >= 2)
    goal.shop = SHOP_GENERAL;
  if (st(ctx, 26 /* LIGHT */) === 1 && st(ctx, 45 /* GOLD */) >= 100) goal.shop = SHOP_GENERAL;
  if (st(ctx, 26 /* LIGHT */) === 0 || st(ctx, 39 /* FOOD */) === 0 || st(ctx, 116 /* ISCUT */) || st(ctx, 115 /* ISPOISONED */) || st(ctx, 26 /* LIGHT */) === 1 && st(ctx, 45 /* GOLD */) >= 100 && st(ctx, 35 /* CLEVEL */) < 10) {
    if (borgThinkShopBuyUseful(ctx, d)) return true;
    if (borgThinkHomeBuyUseful(ctx, d)) return true;
  }
  if (goal.shop !== -1 && goal.ware !== -1) return true;
  goal.shop = -1;
  goal.ware = -1;
  goal.item = -1;
  if (goal.doBest && !borgHomeFull(ctx, d) && !borgInventoryFull(ctx, d)) {
    goal.shop = BORG_HOME;
    return true;
  }
  if (st(ctx, 45 /* GOLD */) < mem.moneyScumAmount && mem.moneyScumAmount !== 0 && !st(ctx, 105 /* CDEPTH */) && st(ctx, 26 /* LIGHT */) && !(d?.selfScum ?? true)) {
    if (borgThinkShopBuyUseful(ctx, d)) return true;
    return false;
  }
  if (borgThinkHomeSellUseful(ctx, d).chosen) return true;
  if (borgThinkShopSellUseless(ctx, d)) return true;
  if (borgThinkShopBuyUseful(ctx, d)) return true;
  if (borgThinkHomeBuyUseful(ctx, d)) return true;
  if (borgThinkHomeGrabUseless(ctx, d)) return true;
  if (mem.moneyScumAmount) return false;
  if (borgThinkShopGrabInteresting(ctx, d)) return true;
  if (borgUsesSwaps(ctx, d) && borgThinkHomeBuySwapWeapon(ctx, d)) return true;
  if (borgUsesSwaps(ctx, d) && borgThinkHomeBuySwapArmour(ctx, d)) return true;
  return false;
}
function borgThinkStore(ctx, shopNum, d) {
  if (ctx.world.clock >= 2e4 && ctx.world.clock <= 20010) {
    return ctx.act.shopExit();
  }
  if (borgChooseShop(ctx, d)) {
    const sell = borgThinkShopSell(ctx, shopNum, d);
    if (sell) return sell;
    const buy = borgThinkShopBuy(ctx, shopNum, d);
    if (buy) return buy;
  }
  ctx.world.self.goal.shop = -1;
  ctx.world.self.goal.ware = -1;
  ctx.world.self.goal.item = -1;
  return ctx.act.shopExit();
}

// src/item/item-use.ts
function borgQuaffPotion(ctx, sval, d) {
  const item = borgSlot(ctx, TV.POTION, sval, d);
  if (!item) return null;
  return ctx.act.quaff(item.handle);
}
var quaffStore = /* @__PURE__ */ new WeakMap();
function quaffState(world) {
  let s = quaffStore.get(world);
  if (!s) {
    s = { whenLastQuaff: 0 };
    quaffStore.set(world, s);
  }
  return s;
}
function borgQuaffCrit(ctx, noCheck, d) {
  const st2 = quaffState(ctx.world);
  const borgT = clockOf(ctx, d);
  const sval = SVAL.potion.cure_critical;
  if (noCheck) {
    const cmd2 = borgQuaffPotion(ctx, sval, d);
    if (cmd2) st2.whenLastQuaff = borgT;
    return cmd2;
  }
  if (st2.whenLastQuaff > borgT - 4 && st2.whenLastQuaff <= borgT && ctx.rng.randint1(100) < 75)
    return null;
  if (trait3(ctx, 231 /* ACCW */) < 2) return null;
  const cmd = borgQuaffPotion(ctx, sval, d);
  if (cmd) st2.whenLastQuaff = borgT;
  return cmd;
}
function borgQuaffUnknown(ctx, d) {
  let n = null;
  for (const item of ctx.view.inventory()) {
    if (item.number <= 0) continue;
    if (item.tval !== TV.POTION) continue;
    if (isAware(item, d)) continue;
    n = item;
  }
  return n ? ctx.act.quaff(n.handle) : null;
}
function borgReadScroll(ctx, sval, d) {
  if (trait3(ctx, 26 /* LIGHT */) <= 0) return null;
  if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */) || trait3(ctx, 121 /* ISFORGET */))
    return null;
  const item = borgSlot(ctx, TV.SCROLL, sval, d);
  if (!item) return null;
  return ctx.act.read(item.handle);
}
function borgReadUnknown(ctx, d) {
  let n = null;
  for (const item of ctx.view.inventory()) {
    if (item.number <= 0) continue;
    if (item.tval !== TV.SCROLL) continue;
    if (isAware(item, d)) continue;
    n = item;
  }
  if (!n) return null;
  if (trait3(ctx, 26 /* LIGHT */) <= 0) return null;
  if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */)) return null;
  return ctx.act.read(n.handle);
}
function borgEat(ctx, tval, sval, d) {
  const item = borgSlot(ctx, tval, sval, d);
  if (!item) return null;
  return ctx.act.eat(item.handle);
}
function borgEatUnknown(ctx, d) {
  let n = null;
  for (const item of ctx.view.inventory()) {
    if (item.number <= 0) continue;
    if (item.tval !== TV.FOOD && item.tval !== TV.MUSHROOM) continue;
    if (isAware(item, d)) continue;
    n = item;
  }
  return n ? ctx.act.eat(n.handle) : null;
}
function borgEquipsRod(ctx, sval, d) {
  const item = borgSlot(ctx, TV.ROD, sval, d);
  if (!item) return false;
  if (!item.pval) return false;
  const fail = deviceFail(ctx, itemLevel(item, d));
  return fail <= 500;
}
function borgZapRod(ctx, sval, d) {
  const item = borgSlot(ctx, TV.ROD, sval, d);
  if (!item) return null;
  if (!item.pval) return null;
  const fail = deviceFail(ctx, itemLevel(item, d));
  if (sval !== SVAL.rod.recall) {
    if (fail > 500) return null;
  }
  return ctx.act.zapRod(item.handle);
}
function borgUseStaff(ctx, sval, d) {
  const item = borgSlot(ctx, TV.STAFF, sval, d);
  if (!item) return null;
  if (!item.pval) return null;
  return ctx.act.useStaff(item.handle);
}
function borgUseUnknown(ctx, d) {
  let n = null;
  for (const item of ctx.view.inventory()) {
    if (item.number <= 0) continue;
    if (item.tval !== TV.STAFF) continue;
    if (isAware(item, d)) continue;
    n = item;
  }
  return n ? ctx.act.useStaff(n.handle) : null;
}
function borgUseStaffFail(ctx, sval, d) {
  const item = borgSlot(ctx, TV.STAFF, sval, d);
  if (!item) return null;
  if (!item.pval) return null;
  const fail = deviceFail(ctx, itemLevel(item, d));
  if (fail > 500) {
    if (sval !== SVAL.staff.teleportation) return null;
    if (!trait3(ctx, 114 /* ISCONFUSED */) && !trait3(ctx, 112 /* ISBLIND */)) {
      if (fail > 500) return null;
    }
  }
  return ctx.act.useStaff(item.handle);
}
function borgEquipsStaffFail(ctx, sval, d) {
  const item = borgSlot(ctx, TV.STAFF, sval, d);
  if (!item) return false;
  if (!item.pval) return false;
  const fail = deviceFail(ctx, itemLevel(item, d));
  if (sval === SVAL.staff.destruction) return true;
  if (fail > 500) {
    if (sval !== SVAL.staff.teleportation) return false;
    if (sval === SVAL.staff.teleportation && !trait3(ctx, 114 /* ISCONFUSED */)) {
      if (fail < 650) return false;
    }
  }
  return true;
}
function borgAimWand(ctx, sval, d) {
  const item = borgSlot(ctx, TV.WAND, sval, d);
  if (!item) return null;
  if (!item.pval) return null;
  return ctx.act.aimWand(item.handle);
}
function* equipment(ctx) {
  for (const item of ctx.view.equipment()) {
    if (item && item.number > 0) yield item;
  }
}
function borgEquipsRing(ctx, ringSval, d) {
  for (const item of equipment(ctx)) {
    if (!isAware(item, d)) continue;
    if (item.tval !== TV.RING || item.sval !== ringSval) continue;
    if (item.timeout) continue;
    if (!isIdent(item, d)) continue;
    const fail = deviceFail(ctx, itemLevel(item, d));
    if (fail > 500) continue;
    return true;
  }
  return false;
}
function borgActivateRing(ctx, ringSval, d) {
  for (const item of equipment(ctx)) {
    if (!isAware(item, d)) continue;
    if (item.tval !== TV.RING || item.sval !== ringSval) continue;
    if (item.timeout) continue;
    if (!isIdent(item, d)) continue;
    return ctx.act.activate(item.handle);
  }
  return null;
}
function borgEquipsDragon(ctx, dragSval, d) {
  for (const item of equipment(ctx)) {
    if (!isAware(item, d)) continue;
    if (item.tval !== TV.DRAG_ARMOR || item.sval !== dragSval) continue;
    if (item.timeout) continue;
    if (!isIdent(item, d)) continue;
    const fail = deviceFail(ctx, itemLevel(item, d));
    if (fail > 500) return false;
    return true;
  }
  return false;
}
function borgActivateDragon(ctx, dragSval, d) {
  for (const item of equipment(ctx)) {
    if (!isAware(item, d)) continue;
    if (item.tval !== TV.DRAG_ARMOR || item.sval !== dragSval) continue;
    if (item.timeout) continue;
    if (!isIdent(item, d)) continue;
    return ctx.act.activate(item.handle);
  }
  return null;
}
function borgActivateItem(ctx, act, d) {
  const handle = activateHandle(act, d);
  if (handle === null) return null;
  return ctx.act.activate(handle);
}
function borgEquipsItem(ctx, act, checkCharge, d) {
  return equipsItem(act, checkCharge, d);
}
function borgActivateFailure(ctx, tval, sval, d) {
  const item = borgSlot(ctx, tval, sval, d);
  if (!item) return 100;
  if (!item.pval) return 100;
  if (!item.activation) return 100;
  return deviceFail(ctx, itemLevel(item, d));
}
function borgUseThings(ctx, d) {
  const P = SVAL.potion;
  const M = SVAL.mush;
  const inTown = trait3(ctx, 105 /* CDEPTH */) === 0;
  if (trait3(ctx, 125 /* ISFIXEXP */)) {
    const cmd = borgSpell(ctx, 49 /* REVITALIZE */) || borgSpell(ctx, 70 /* REMEMBRANCE */) || (trait3(ctx, 27 /* CURHP */) > 90 ? borgSpell(ctx, 130 /* UNHOLY_REPRIEVE */) : null) || borgActivateItem(ctx, "act_restore_exp", d) || borgActivateItem(ctx, "act_restore_st_lev", d) || borgActivateItem(ctx, "act_restore_life", d) || borgQuaffPotion(ctx, P.restore_life, d);
    if (cmd) return cmd;
  }
  {
    const cmd = borgQuaffPotion(ctx, P.inc_str, d) || borgQuaffPotion(ctx, P.inc_int, d) || borgQuaffPotion(ctx, P.inc_wis, d) || borgQuaffPotion(ctx, P.inc_dex, d) || borgQuaffPotion(ctx, P.inc_con, d);
    if (cmd) return cmd;
  }
  {
    const cmd = trait3(ctx, 127 /* ISFIXSTR */) && (borgQuaffPotion(ctx, P.inc_str, d) || borgEat(ctx, TV.MUSHROOM, M.purging, d) || borgActivateItem(ctx, "act_shroom_purging", d) || borgActivateItem(ctx, "act_restore_str", d) || borgActivateItem(ctx, "act_restore_all", d) || borgEat(ctx, TV.MUSHROOM, M.restoring, d)) || trait3(ctx, 128 /* ISFIXINT */) && (borgQuaffPotion(ctx, P.inc_int, d) || borgActivateItem(ctx, "act_restore_int", d) || borgActivateItem(ctx, "act_restore_all", d) || borgEat(ctx, TV.MUSHROOM, M.restoring, d)) || trait3(ctx, 129 /* ISFIXWIS */) && (borgQuaffPotion(ctx, P.inc_wis, d) || borgActivateItem(ctx, "act_restore_wis", d) || borgActivateItem(ctx, "act_restore_all", d) || borgEat(ctx, TV.MUSHROOM, M.restoring, d)) || trait3(ctx, 130 /* ISFIXDEX */) && (borgQuaffPotion(ctx, P.inc_dex, d) || borgActivateItem(ctx, "act_restore_dex", d) || borgActivateItem(ctx, "act_restore_all", d) || borgEat(ctx, TV.MUSHROOM, M.restoring, d)) || trait3(ctx, 131 /* ISFIXCON */) && (borgQuaffPotion(ctx, P.inc_con, d) || borgActivateItem(ctx, "act_restore_con", d) || borgActivateItem(ctx, "act_restore_all", d) || borgEat(ctx, TV.MUSHROOM, M.purging, d) || borgActivateItem(ctx, "act_shroom_purging", d) || borgEat(ctx, TV.MUSHROOM, M.restoring, d));
    if (cmd) return cmd;
  }
  for (const item of ctx.view.inventory()) {
    if (item.number <= 0 || !isAware(item, d)) continue;
    if (item.tval === TV.POTION) {
      if (item.sval === P.enlightenment) {
        if (inTown) continue;
      } else if (item.sval === P.inc_all) {
        const cmd = borgQuaffPotion(ctx, item.sval, d);
        if (cmd) return cmd;
      }
    } else if (item.tval === TV.SCROLL) {
      if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */)) continue;
      if (item.sval === SVAL.scroll.mapping || item.sval === SVAL.scroll.acquirement || item.sval === SVAL.scroll.star_acquirement) {
        if (inTown) continue;
        const cmd = borgReadScroll(ctx, item.sval, d);
        if (cmd) return cmd;
      }
    }
  }
  if (trait3(ctx, 109 /* ISHUNGRY */)) {
    const cmd = borgSpell(ctx, 32 /* REMOVE_HUNGER */) || borgSpell(ctx, 51 /* HERBAL_CURING */) || borgQuaffPotion(ctx, P.slime_mold, d) || borgEat(ctx, TV.FOOD, SVAL.food.slime_mold, d) || borgEat(ctx, TV.FOOD, SVAL.food.slice, d) || borgEat(ctx, TV.FOOD, SVAL.food.apple, d) || borgEat(ctx, TV.FOOD, SVAL.food.pint, d) || borgEat(ctx, TV.FOOD, SVAL.food.handful, d) || borgEat(ctx, TV.FOOD, SVAL.food.honey_cake, d) || borgEat(ctx, TV.FOOD, SVAL.food.ration, d) || borgEat(ctx, TV.FOOD, SVAL.food.waybread, d) || borgEat(ctx, TV.FOOD, SVAL.food.draught, d) || borgActivateItem(ctx, "act_food_waybread", d);
    if (cmd) return cmd;
  }
  return null;
}
function borgRecharging(ctx, d, playerHas) {
  if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */)) return null;
  for (const item of ctx.view.inventory()) {
    if (item.number <= 0) continue;
    if (!isIdent(item, d) || !isAware(item, d)) continue;
    let charge = false;
    if (item.tval === TV.WAND && item.pval <= 1) charge = true;
    if (item.tval === TV.STAFF) {
      if (item.pval < 2 && borgSpellOkayFail(ctx, 7 /* RECHARGING */, 96, playerHas) && item.sval < SVAL.staff.power)
        charge = true;
      if (item.pval <= 1) charge = true;
      if (item.sval === SVAL.staff.teleportation && item.pval < 3 && trait3(ctx, 105 /* CDEPTH */) === 0)
        charge = true;
      if (item.number + item.pval >= 4 && item.pval >= 1) charge = false;
    }
    if (!charge) continue;
    const cmd = borgReadScroll(ctx, SVAL.scroll.recharging, d) || borgSpellFail(ctx, 7 /* RECHARGING */, 96, playerHas) || borgActivateItem(ctx, "act_recharge", d);
    if (cmd) return cmd;
    break;
  }
  return null;
}

// src/item/item-id.ts
function borgItemNoteNeedsId(item, d) {
  return needsIdent(item, d);
}
function borgTestStuff(ctx, d) {
  const freeId = borgSpellLegal(ctx, 8 /* IDENTIFY_RUNE */);
  if (trait3(ctx, 30 /* CURSP */) < 50 && freeId && !canRest(d)) return null;
  if (danger(d) > 1) return null;
  let best = null;
  let bestV = -1;
  for (const item of ctx.view.equipment()) {
    if (!item || item.number <= 0) continue;
    if (!borgItemNoteNeedsId(item, d)) continue;
    let v = 0;
    if (item.artifact) v = itemValue(item, d) + 15e4;
    if (item.ego) v = itemValue(item, d) + 1e5;
    if (borgItemNoteNeedsId(item, d)) v = itemValue(item, d) + 2e4;
    if (!v) continue;
    if (v <= bestV) continue;
    best = item;
    bestV = v;
  }
  const maxDepth = trait3(ctx, 106 /* MAXDEPTH */);
  for (const item of ctx.view.inventory()) {
    if (item.number <= 0) continue;
    if (!borgItemNoteNeedsId(item, d)) continue;
    let v = 0;
    if (item.artifact) v = itemValue(item, d) + 15e4;
    if (borgItemNoteNeedsId(item, d)) v = itemValue(item, d) + 2e4;
    else if (freeId) v = itemValue(item, d);
    if (!isAware(item, d)) {
      switch (item.tval) {
        case TV.RING:
        case TV.AMULET:
          v += maxDepth * 5e3;
          break;
        case TV.ROD:
          v += maxDepth * 3e3;
          break;
        case TV.WAND:
        case TV.STAFF:
          v += maxDepth * 2e3;
          break;
        case TV.POTION:
        case TV.SCROLL:
          if (maxDepth < 5) break;
          v += maxDepth * 500;
          break;
        case TV.FOOD:
          v += maxDepth * 10;
          break;
      }
    }
    if (!v) continue;
    if (v <= bestV) continue;
    best = item;
    bestV = v;
  }
  if (best) {
    return borgSpell(ctx, 8 /* IDENTIFY_RUNE */) || borgReadScroll(ctx, SVAL.scroll.identify, d);
  }
  return null;
}

// src/item/item-decurse.ts
function decurseMeans(ctx, d, playerHas) {
  return hasSlot(ctx, TV.SCROLL, SVAL.scroll.remove_curse, d) || borgEquipsStaffFail(ctx, SVAL.staff.remove_curse, d) || borgSpellOkayFail(ctx, 68 /* REMOVE_CURSE */, 40, playerHas) || hasSlot(ctx, TV.SCROLL, SVAL.scroll.star_remove_curse, d) || borgEquipsItemPresent(ctx, d);
}
function borgEquipsItemPresent(ctx, d) {
  return borgActivateItem(ctx, "act_remove_curse", d) !== null || borgActivateItem(ctx, "act_remove_curse2", d) !== null;
}
function decurseCommand(ctx, d) {
  return borgReadScroll(ctx, SVAL.scroll.remove_curse, d) || borgUseStaff(ctx, SVAL.staff.remove_curse, d) || borgSpell(ctx, 68 /* REMOVE_CURSE */) || borgReadScroll(ctx, SVAL.scroll.star_remove_curse, d) || borgActivateItem(ctx, "act_remove_curse", d) || borgActivateItem(ctx, "act_remove_curse2", d);
}
function borgDecurseAny(ctx, d, playerHas) {
  if (!ctx.world.self.trait[159 /* FIRST_CURSED */]) return null;
  if (!decurseMeans(ctx, d, playerHas)) return null;
  return decurseCommand(ctx, d);
}

// src/item/item-enchant.ts
var ENCHANT_LIMIT = 12;
function borgEnchantToA(ctx, d, playerHas) {
  if (!trait3(ctx, 240 /* NEED_ENCHANT_TO_A */)) return null;
  if (!trait3(ctx, 237 /* AENCH_ARM */) && !trait3(ctx, 238 /* AENCH_SARM */)) return null;
  const canSpell = borgSpellOkayFail(ctx, 76 /* ENCHANT_ARMOUR */, 65, playerHas) || trait3(ctx, 238 /* AENCH_SARM */) >= 1;
  let best = null;
  let bestA = 99;
  for (const item of ctx.view.equipment()) {
    if (!item || item.number <= 0) continue;
    if (!isArmourSlot(item)) continue;
    if (!isIdent(item, d)) continue;
    const a = item.toA;
    if (canSpell ? a >= ENCHANT_LIMIT : a >= 8) continue;
    if (best && bestA < a) continue;
    best = item;
    bestA = a;
  }
  if (!best) return null;
  return borgReadScroll(ctx, SVAL.scroll.star_enchant_armor, d) || borgReadScroll(ctx, SVAL.scroll.enchant_armor, d) || borgSpellFail(ctx, 76 /* ENCHANT_ARMOUR */, 65, playerHas);
}
function borgEnchantToH(ctx, d, playerHas) {
  if (!trait3(ctx, 241 /* NEED_ENCHANT_TO_H */)) return null;
  if (!trait3(ctx, 234 /* AENCH_TOH */) && !trait3(ctx, 236 /* AENCH_SWEP */)) return null;
  const item = pickLeastEnchantedWeapon(ctx, d, playerHas, (it) => it.toH);
  if (!item) return null;
  return borgReadScroll(ctx, SVAL.scroll.star_enchant_weapon, d) || borgReadScroll(ctx, SVAL.scroll.enchant_weapon_to_hit, d) || borgSpellFail(ctx, 75 /* ENCHANT_WEAPON */, 65, playerHas);
}
function borgEnchantToD(ctx, d, playerHas) {
  if (!trait3(ctx, 242 /* NEED_ENCHANT_TO_D */)) return null;
  if (!trait3(ctx, 235 /* AENCH_TOD */) && !trait3(ctx, 236 /* AENCH_SWEP */)) return null;
  const item = pickLeastEnchantedWeapon(ctx, d, playerHas, (it) => it.toD);
  if (!item) return null;
  return borgReadScroll(ctx, SVAL.scroll.star_enchant_weapon, d) || borgReadScroll(ctx, SVAL.scroll.enchant_weapon_to_dam, d) || borgSpellFail(ctx, 75 /* ENCHANT_WEAPON */, 65, playerHas);
}
function pickLeastEnchantedWeapon(ctx, d, playerHas, bonus) {
  const canSpell = borgSpellOkayFail(ctx, 75 /* ENCHANT_WEAPON */, 65, playerHas) || trait3(ctx, 236 /* AENCH_SWEP */) >= 1;
  let best = null;
  let bestA = 99;
  for (const item of ctx.view.equipment()) {
    if (!item || item.number <= 0) continue;
    if (item.tval !== TV.BOW && !isMeleeWeapon(item)) continue;
    if (!isIdent(item, d)) continue;
    if (item.tval === TV.DIGGING) continue;
    const a = bonus(item);
    if (canSpell ? a >= ENCHANT_LIMIT : a >= 8) continue;
    if (item.tval === TV.BOW && trait3(ctx, 154 /* AMMO_POWER */) < 3 && !item.artifact && !item.ego)
      continue;
    if (best && bestA < a) continue;
    best = item;
    bestA = a;
  }
  return best;
}
function borgBrandWeapon(ctx, _d) {
  if (!trait3(ctx, 243 /* NEED_BRAND_WEAPON */)) return null;
  if (!trait3(ctx, 239 /* ABRAND */)) return null;
  return null;
}
function isArmourSlot(item) {
  switch (item.tval) {
    case TV.BOOTS:
    case TV.GLOVES:
    case TV.HELM:
    case TV.CROWN:
    case TV.SHIELD:
    case TV.CLOAK:
    case TV.SOFT_ARMOR:
    case TV.HARD_ARMOR:
    case TV.DRAG_ARMOR:
      return true;
    default:
      return false;
  }
}
function isMeleeWeapon(item) {
  switch (item.tval) {
    case TV.DIGGING:
    case TV.HAFTED:
    case TV.POLEARM:
    case TV.SWORD:
      return true;
    default:
      return false;
  }
}
function borgEnchanting(ctx, d, playerHas) {
  if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */)) return null;
  const decurse = borgDecurseAny(ctx, d, playerHas);
  if (decurse) return decurse;
  if (trait3(ctx, 105 /* CDEPTH */)) return null;
  return borgBrandWeapon(ctx, d) || borgEnchantToH(ctx, d, playerHas) || borgEnchantToD(ctx, d, playerHas) || borgEnchantToA(ctx, d, playerHas);
}

// src/item/light.ts
function currentLight(ctx) {
  for (const item of ctx.view.equipment()) {
    if (item && item.number > 0 && item.tval === TV.LIGHT) return item;
  }
  return null;
}
function borgRefuelLantern(ctx, cur, d) {
  let source = borgSlot(ctx, TV.FLASK, SVAL.flask.oil, d);
  if (!source) {
    for (const item of ctx.view.inventory()) {
      if (item.number <= 0) continue;
      if (item.tval !== TV.LIGHT || item.sval !== SVAL.light.lantern) continue;
      if (hasFlag2(item, "NO_FUEL")) continue;
      if (item.timeout > 0) {
        source = item;
        break;
      }
    }
  }
  if (!source) return null;
  if (cur.sval !== SVAL.light.lantern) return null;
  return ctx.act.raw("refill", { handle: source.handle });
}
function borgMaintainLight(ctx, d) {
  const cur = currentLight(ctx);
  if (cur && hasFlag2(cur, "NO_FUEL")) {
    return { need: 0 /* NO_NEED */, cmd: null };
  }
  if (trait3(ctx, 25 /* CLASS */) === CLASS_NECROMANCER) {
    return { need: 0 /* NO_NEED */, cmd: null };
  }
  if (cur) {
    if (cur.sval === SVAL.light.torch) {
      if (cur.timeout > 250) return { need: 0 /* NO_NEED */, cmd: null };
      const spare = borgSlot(ctx, TV.LIGHT, SVAL.light.torch, d);
      if (!spare) return { need: 2 /* UNMET_NEED */, cmd: null };
      return { need: 0 /* NO_NEED */, cmd: null };
    }
    if (cur.sval === SVAL.light.lantern) {
      if (cur.timeout < 1e3) {
        const cmd = borgRefuelLantern(ctx, cur, d);
        if (cmd) return { need: 1 /* MET_NEED */, cmd };
        return { need: 2 /* UNMET_NEED */, cmd: null };
      }
    }
    return { need: 0 /* NO_NEED */, cmd: null };
  }
  let src = borgSlot(ctx, TV.LIGHT, SVAL.light.lantern, d);
  if (!src) src = borgSlot(ctx, TV.LIGHT, SVAL.light.torch, d);
  if (!src) return { need: 2 /* UNMET_NEED */, cmd: null };
  return { need: 1 /* MET_NEED */, cmd: ctx.act.wear(src.handle) };
}
function litFloorScan(ctx, radius) {
  const { x: px, y: py } = ctx.view.player().grid;
  let floors = 0;
  for (let y = py - radius; y <= py + radius; y++) {
    for (let x = px - radius; x <= px + radius; x++) {
      const c = ctx.view.cell(x, y);
      if (!c) continue;
      if (c.passable && c.inView && !c.glow) floors++;
    }
  }
  return floors;
}
function cornerScan(ctx) {
  const { x: px, y: py } = ctx.view.player().grid;
  const diagonals = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1]
  ];
  let corners = 0;
  for (const [dx, dy] of diagonals) {
    const c = ctx.view.cell(px + dx, py + dy);
    if (!c) continue;
    if (!c.known) corners++;
    else if (!c.passable) corners++;
  }
  return corners;
}
function borgCheckLightOnly(ctx, d, playerHas) {
  if (trait3(ctx, 105 /* CDEPTH */) === 0) return null;
  if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 120 /* ISIMAGE */)) return null;
  const borgT = clockOf(ctx, d);
  const self = ctx.world.self;
  if (!self.whenWizardLight || borgT - self.whenWizardLight >= 1e3) {
    const cmd2 = borgActivateItem(ctx, "act_clairvoyance", d) || borgActivateItem(ctx, "act_enlightenment", d) || borgSpellFail(ctx, 103 /* FUME_OF_MORDOR */, 40, playerHas) || borgSpellFail(ctx, 74 /* CLAIRVOYANCE */, 40, playerHas);
    if (cmd2) {
      self.whenWizardLight = borgT;
      return cmd2;
    }
  }
  if (trait3(ctx, 25 /* CLASS */) === CLASS_NECROMANCER) {
    return borgCheckDarkOnly(ctx, d, playerHas);
  }
  if (self.whenCallLight !== 0 && borgT - self.whenCallLight < 7) return null;
  const lightRadius = trait3(ctx, 26 /* LIGHT */);
  if (lightRadius === 1) {
    if (cornerScan(ctx) > 2) return null;
  } else if (lightRadius > 1) {
    if (litFloorScan(ctx, 2) < 11) return null;
  }
  const cmd = borgActivateItem(ctx, "act_illumination", d) || borgActivateItem(ctx, "act_light", d) || borgZapRod(ctx, SVAL.rod.illumination, d) || borgUseStaff(ctx, SVAL.staff.light, d) || borgReadScroll(ctx, SVAL.scroll.light, d) || borgSpellFail(ctx, 1 /* LIGHT_ROOM */, 40, playerHas) || borgSpellFail(ctx, 57 /* CALL_LIGHT */, 40, playerHas);
  if (cmd) {
    self.whenCallLight = borgT;
    return cmd;
  }
  return null;
}
function borgCheckDarkOnly(ctx, d, playerHas) {
  if (trait3(ctx, 25 /* CLASS */) !== CLASS_NECROMANCER) return null;
  const borgT = clockOf(ctx, d);
  const self = ctx.world.self;
  if (self.whenCallLight !== 0 && borgT - self.whenCallLight < 7) return null;
  const { x: px, y: py } = ctx.view.player().grid;
  let floors = 0;
  for (let y = py - 2; y <= py + 2; y++) {
    for (let x = px - 2; x <= px + 2; x++) {
      const c = ctx.view.cell(x, y);
      if (!c) continue;
      if (c.passable && c.glow) floors++;
    }
  }
  if (floors < 11) return null;
  const cmd = borgSpellFail(ctx, 86 /* CREATE_DARKNESS */, 40, playerHas);
  if (cmd) {
    self.whenCallLight = borgT;
    return cmd;
  }
  return null;
}
function borgCheckLight(ctx, d, playerHas) {
  const self = ctx.world.self;
  if (trait3(ctx, 36 /* MAXCLEVEL */) > 10 && trait3(ctx, 105 /* CDEPTH */) === 0) return null;
  if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */) || trait3(ctx, 120 /* ISIMAGE */) || trait3(ctx, 115 /* ISPOISONED */) || trait3(ctx, 116 /* ISCUT */) || trait3(ctx, 108 /* ISWEAK */)) {
    return null;
  }
  const borgT = clockOf(ctx, d);
  const inDungeon = trait3(ctx, 105 /* CDEPTH */) !== 0;
  const { x: px, y: py } = ctx.view.player().grid;
  const qx = panelCol(px);
  const qy = panelRow(py);
  const grid = ctx.world.detect;
  let doTrap = grid.quadrantNeedsDetect("trap", qy, qx);
  let doDoor = grid.quadrantNeedsDetect("door", qy, qx);
  const doWall = grid.quadrantNeedsDetect("wall", qy, qx);
  let doEvil = grid.quadrantNeedsDetect("evil", qy, qx);
  const doObj = grid.quadrantNeedsDetect("obj", qy, qx);
  if (trait3(ctx, 37 /* ESP */)) doEvil = false;
  if (!inDungeon) {
    doTrap = false;
    doDoor = false;
  }
  const mark = (kinds) => {
    for (const k of kinds) grid.markQuadrant(k, qy, qx);
  };
  if ((doTrap || doDoor || doEvil) && (!self.whenDetectTraps || borgT - self.whenDetectTraps >= 5 || (!self.whenDetectEvil || borgT - self.whenDetectEvil >= 5) || (!self.whenDetectDoors || borgT - self.whenDetectDoors >= 5)) && inDungeon) {
    const cmd = borgActivateItem(ctx, "act_detect_all", d) || borgActivateItem(ctx, "act_mapping", d) || borgZapRod(ctx, SVAL.rod.detection, d) || borgSpellFail(ctx, 39 /* SENSE_SURROUNDINGS */, 40, playerHas);
    if (cmd) {
      mark(["trap", "door", "evil"]);
      self.whenDetectTraps = borgT;
      self.whenDetectDoors = borgT;
      self.whenDetectEvil = borgT;
      self.whenDetectObj = borgT;
      return cmd;
    }
  }
  if (doEvil && (!self.whenDetectEvil || borgT - self.whenDetectEvil >= 20)) {
    const cmd = borgSpellFail(ctx, 58 /* DETECT_EVIL */, 40, playerHas) || borgSpellFail(ctx, 5 /* DETECT_MONSTERS */, 40, playerHas) || borgSpellFail(ctx, 88 /* READ_MINDS */, 40, playerHas) || borgSpellFail(ctx, 118 /* SEEK_BATTLE */, 40, playerHas);
    if (cmd) {
      mark(["evil"]);
      self.whenDetectEvil = borgT;
      return cmd;
    }
  }
  if ((doTrap || doDoor) && (!self.whenDetectTraps || borgT - self.whenDetectTraps >= 5 || (!self.whenDetectDoors || borgT - self.whenDetectDoors >= 5)) && inDungeon) {
    const cmd = borgActivateItem(ctx, "act_detect_all", d) || borgActivateItem(ctx, "act_mapping", d) || borgSpellFail(ctx, 22 /* DETECTION */, 40, playerHas) || borgSpellFail(ctx, 2 /* FIND_TRAPS_DOORS_STAIRS */, 40, playerHas) || borgSpellFail(ctx, 112 /* DETECT_STAIRS */, 40, playerHas);
    if (cmd) {
      mark(["trap", "door"]);
      self.whenDetectTraps = borgT;
      self.whenDetectDoors = borgT;
      return cmd;
    }
  }
  if (doTrap && (!self.whenDetectTraps || borgT - self.whenDetectTraps >= 7) && inDungeon) {
    const cmd = borgSpellFail(ctx, 22 /* DETECTION */, 40, playerHas) || borgSpellFail(ctx, 2 /* FIND_TRAPS_DOORS_STAIRS */, 40, playerHas);
    if (cmd) {
      mark(["trap"]);
      self.whenDetectTraps = borgT;
      return cmd;
    }
  }
  if (doDoor && (!self.whenDetectDoors || borgT - self.whenDetectDoors >= 9) && inDungeon) {
    const cmd = borgActivateItem(ctx, "act_detect_all", d) || borgActivateItem(ctx, "act_mapping", d) || borgSpellFail(ctx, 22 /* DETECTION */, 40, playerHas) || borgSpellFail(ctx, 2 /* FIND_TRAPS_DOORS_STAIRS */, 40, playerHas);
    if (cmd) {
      mark(["door"]);
      self.whenDetectDoors = borgT;
      return cmd;
    }
  }
  if (doWall && (!self.whenDetectWalls || borgT - self.whenDetectWalls >= 15) && inDungeon) {
    const cmd = borgActivateItem(ctx, "act_mapping", d) || borgReadScroll(ctx, SVAL.scroll.mapping, d) || borgUseStaff(ctx, SVAL.staff.mapping, d) || borgZapRod(ctx, SVAL.rod.mapping, d) || borgSpell(ctx, 39 /* SENSE_SURROUNDINGS */);
    if (cmd) {
      mark(["wall"]);
      self.whenDetectWalls = borgT;
      return cmd;
    }
  }
  if (doObj && (!self.whenDetectObj || borgT - self.whenDetectObj >= 20)) {
    const cmd = borgActivateItem(ctx, "act_detect_objects", d) || borgSpellFail(ctx, 111 /* OBJECT_DETECTION */, 40, playerHas);
    if (cmd) {
      mark(["obj"]);
      self.whenDetectObj = borgT;
      return cmd;
    }
  }
  return borgCheckLightOnly(ctx, d, playerHas);
}
function borgLightBeamOkay(ctx, d, playerHas) {
  if (trait3(ctx, 108 /* ISWEAK */)) return false;
  const wand = borgSlot(ctx, TV.WAND, SVAL.wand.light, d);
  return borgSpellOkayFail(ctx, 64 /* SPEAR_OF_LIGHT */, 20, playerHas) || wand !== null && wand.pval > 0 || borgEquipsRod(ctx, SVAL.rod.light, d);
}
function borgLightBeam(ctx, d, playerHas) {
  if (!borgLightBeamOkay(ctx, d, playerHas)) return null;
  return borgSpellFail(ctx, 64 /* SPEAR_OF_LIGHT */, 20, playerHas) || borgZapRod(ctx, SVAL.rod.light, d) || borgAimWand(ctx, SVAL.wand.light, d);
}

// src/item/recover.ts
function borgRecover(ctx, d, playerHas) {
  const light = borgMaintainLight(ctx, d);
  if (light.need === 1 /* MET_NEED */ && light.cmd) return light.cmd;
  const p = danger(d);
  if (p > Math.trunc(avoidance(d) / 4)) return null;
  let q = ctx.rng.randint0(100);
  if (trait3(ctx, 27 /* CURHP */) < Math.trunc(trait3(ctx, 28 /* MAXHP */) / 2)) q -= 10;
  if (trait3(ctx, 27 /* CURHP */) < Math.trunc(trait3(ctx, 28 /* MAXHP */) / 4)) q -= 10;
  const D = getDerived(ctx.world);
  if (trait3(ctx, 117 /* ISSTUN */) && q < 75) {
    const cmd = borgActivateItem(ctx, "act_cure_body", d) || borgActivateItem(ctx, "act_cure_critical", d) || borgActivateItem(ctx, "act_cure_full", d) || borgActivateItem(ctx, "act_cure_full2", d) || borgActivateItem(ctx, "act_cure_temp", d) || borgActivateItem(ctx, "act_heal3", d) || borgSpell(ctx, 59 /* MINOR_HEALING */) || borgSpell(ctx, 72 /* HEALING */) || borgSpell(ctx, 51 /* HERBAL_CURING */) || borgSpell(ctx, 82 /* HOLY_WORD */);
    if (cmd) return cmd;
  }
  if (trait3(ctx, 118 /* ISHEAVYSTUN */)) {
    const cmd = borgEat(ctx, TV.MUSHROOM, SVAL.mush.fast_recovery, d) || borgActivateItem(ctx, "act_cure_body", d) || borgActivateItem(ctx, "act_cure_critical", d) || borgActivateItem(ctx, "act_cure_full", d) || borgActivateItem(ctx, "act_cure_full2", d) || borgActivateItem(ctx, "act_cure_temp", d) || borgActivateItem(ctx, "act_heal3", d) || borgSpell(ctx, 59 /* MINOR_HEALING */) || borgSpell(ctx, 72 /* HEALING */) || borgSpell(ctx, 51 /* HERBAL_CURING */) || borgSpell(ctx, 82 /* HOLY_WORD */);
    if (cmd) return cmd;
  }
  if (trait3(ctx, 116 /* ISCUT */) && q < 75) {
    const cmd = borgActivateItem(ctx, "act_cure_light", d) || borgSpell(ctx, 59 /* MINOR_HEALING */) || borgSpell(ctx, 72 /* HEALING */) || borgSpell(ctx, 51 /* HERBAL_CURING */) || borgSpell(ctx, 82 /* HOLY_WORD */);
    if (cmd) return cmd;
  }
  if (trait3(ctx, 115 /* ISPOISONED */) && q < 75) {
    const cmd = borgEat(ctx, TV.MUSHROOM, SVAL.mush.fast_recovery, d) || borgActivateItem(ctx, "act_rem_fear_pois", d) || borgSpell(ctx, 51 /* HERBAL_CURING */) || borgSpell(ctx, 36 /* CURE_POISON */);
    if (cmd) return cmd;
  }
  if (trait3(ctx, 113 /* ISAFRAID */) && !trait3(ctx, 186 /* CRSFEAR */) && q < 75) {
    const cmd = borgEat(ctx, TV.MUSHROOM, SVAL.mush.cure_mind, d) || borgActivateItem(ctx, "act_rem_fear_pois", d) || borgSpell(ctx, 62 /* HEROISM */) || borgSpell(ctx, 119 /* BERSERK_STRENGTH */) || borgSpell(ctx, 82 /* HOLY_WORD */);
    if (cmd) return cmd;
  }
  if ((trait3(ctx, 109 /* ISHUNGRY */) || trait3(ctx, 108 /* ISWEAK */)) && q < 75) {
    const cmd = borgSpell(ctx, 32 /* REMOVE_HUNGER */) || borgSpell(ctx, 51 /* HERBAL_CURING */);
    if (cmd) return cmd;
  }
  if (trait3(ctx, 120 /* ISIMAGE */) && q < 75) {
    const cmd = borgEat(ctx, TV.MUSHROOM, SVAL.mush.cure_mind, d);
    if (cmd) return cmd;
  }
  if (trait3(ctx, 27 /* CURHP */) < Math.trunc(trait3(ctx, 28 /* MAXHP */) / 2) && q < 75 && p === 0 && trait3(ctx, 30 /* CURSP */) > Math.trunc(trait3(ctx, 31 /* MAXSP */) / 4)) {
    const cmd = borgActivateItem(ctx, "act_heal1", d) || borgActivateItem(ctx, "act_heal2", d) || borgActivateItem(ctx, "act_heal3", d) || borgSpell(ctx, 72 /* HEALING */) || borgSpell(ctx, 82 /* HOLY_WORD */) || borgSpell(ctx, 59 /* MINOR_HEALING */) || borgSpell(ctx, 62 /* HEROISM */);
    if (cmd) return cmd;
  }
  if (trait3(ctx, 125 /* ISFIXEXP */)) {
    const cmd = borgActivateItem(ctx, "act_restore_exp", d) || borgActivateItem(ctx, "act_restore_st_lev", d) || borgActivateItem(ctx, "act_restore_life", d) || borgSpell(ctx, 49 /* REVITALIZE */) || borgSpell(ctx, 70 /* REMEMBRANCE */) || (trait3(ctx, 27 /* CURHP */) > 90 ? borgSpell(ctx, 130 /* UNHOLY_REPRIEVE */) : null);
    if (cmd) return cmd;
  }
  if (trait3(ctx, 127 /* ISFIXSTR */) || trait3(ctx, 128 /* ISFIXINT */) || trait3(ctx, 129 /* ISFIXWIS */) || trait3(ctx, 130 /* ISFIXDEX */) || trait3(ctx, 131 /* ISFIXCON */) || trait3(ctx, 132 /* ISFIXALL */)) {
    const cmd = borgSpell(ctx, 73 /* RESTORATION */) || borgSpell(ctx, 49 /* REVITALIZE */);
    if (cmd) return cmd;
  }
  if ((trait3(ctx, 127 /* ISFIXSTR */) || trait3(ctx, 128 /* ISFIXINT */) || trait3(ctx, 131 /* ISFIXCON */)) && trait3(ctx, 27 /* CURHP */) > 90) {
    const cmd = borgSpell(ctx, 130 /* UNHOLY_REPRIEVE */);
    if (cmd) return cmd;
  }
  if (trait3(ctx, 117 /* ISSTUN */) && q < 25) {
    const cmd = borgUseStaffFail(ctx, SVAL.staff.curing, d) || borgZapRod(ctx, SVAL.rod.curing, d) || borgZapRod(ctx, SVAL.rod.healing, d) || borgActivateItem(ctx, "act_heal1", d) || borgActivateItem(ctx, "act_heal2", d) || borgQuaffCrit(ctx, false, d);
    if (cmd) return cmd;
  }
  if (trait3(ctx, 118 /* ISHEAVYSTUN */) && q < 95) {
    const cmd = borgQuaffCrit(ctx, true, d) || borgUseStaffFail(ctx, SVAL.staff.curing, d) || borgZapRod(ctx, SVAL.rod.curing, d) || borgZapRod(ctx, SVAL.rod.healing, d) || borgActivateItem(ctx, "act_heal1", d) || borgActivateItem(ctx, "act_heal2", d);
    if (cmd) return cmd;
  }
  if (trait3(ctx, 116 /* ISCUT */) && q < 25) {
    const cmd = borgUseStaffFail(ctx, SVAL.staff.curing, d) || borgZapRod(ctx, SVAL.rod.curing, d) || borgZapRod(ctx, SVAL.rod.healing, d) || borgActivateItem(ctx, "act_heal1", d) || borgActivateItem(ctx, "act_heal2", d) || borgQuaffCrit(ctx, trait3(ctx, 27 /* CURHP */) < 10, d);
    if (cmd) return cmd;
  }
  if (trait3(ctx, 115 /* ISPOISONED */) && q < 25) {
    const cmd = borgEat(ctx, TV.MUSHROOM, SVAL.mush.fast_recovery, d) || borgQuaffPotion(ctx, SVAL.potion.cure_poison, d) || borgEat(ctx, TV.FOOD, SVAL.food.waybread, d) || borgQuaffCrit(ctx, trait3(ctx, 27 /* CURHP */) < 10, d) || borgUseStaffFail(ctx, SVAL.staff.curing, d) || borgZapRod(ctx, SVAL.rod.curing, d) || borgActivateItem(ctx, "act_rem_fear_pois", d) || borgActivateItem(ctx, "act_food_waybread", d);
    if (cmd) return cmd;
  }
  if (trait3(ctx, 112 /* ISBLIND */) && q < 25) {
    const cmd = borgEat(ctx, TV.MUSHROOM, SVAL.mush.fast_recovery, d) || borgEat(ctx, TV.FOOD, SVAL.food.waybread, d) || borgQuaffPotion(ctx, SVAL.potion.cure_light, d) || borgQuaffPotion(ctx, SVAL.potion.cure_serious, d) || borgQuaffCrit(ctx, false, d) || borgUseStaffFail(ctx, SVAL.staff.curing, d) || borgZapRod(ctx, SVAL.rod.curing, d) || borgActivateItem(ctx, "act_food_waybread", d);
    if (cmd) return cmd;
  }
  if (trait3(ctx, 114 /* ISCONFUSED */) && q < 25) {
    const cmd = borgEat(ctx, TV.MUSHROOM, SVAL.mush.cure_mind, d) || borgQuaffPotion(ctx, SVAL.potion.cure_serious, d) || borgQuaffCrit(ctx, false, d) || borgUseStaffFail(ctx, SVAL.staff.curing, d) || borgActivateItem(ctx, "act_cure_confusion", d) || borgZapRod(ctx, SVAL.rod.curing, d);
    if (cmd) return cmd;
  }
  if (trait3(ctx, 113 /* ISAFRAID */) && !trait3(ctx, 186 /* CRSFEAR */) && q < 25) {
    const cmd = borgEat(ctx, TV.MUSHROOM, SVAL.mush.cure_mind, d) || borgQuaffPotion(ctx, SVAL.potion.boldness, d) || borgQuaffPotion(ctx, SVAL.potion.heroism, d) || borgQuaffPotion(ctx, SVAL.potion.berserk, d) || borgActivateItem(ctx, "act_rem_fear_pois", d);
    if (cmd) return cmd;
  }
  if ((trait3(ctx, 109 /* ISHUNGRY */) || trait3(ctx, 108 /* ISWEAK */)) && q < 25) {
    const cmd = borgReadScroll(ctx, SVAL.scroll.satisfy_hunger, d) || borgActivateItem(ctx, "act_satisfy", d);
    if (cmd) return cmd;
  }
  if (trait3(ctx, 27 /* CURHP */) < Math.trunc(trait3(ctx, 28 /* MAXHP */) / 2) && q < 25) {
    const cmd = borgZapRod(ctx, SVAL.rod.healing, d) || borgQuaffPotion(ctx, SVAL.potion.cure_serious, d) || borgQuaffCrit(ctx, false, d) || borgActivateItem(ctx, "act_cure_serious", d);
    if (cmd) return cmd;
  }
  const fearRegion = d?.fearRegion ?? Number.MAX_SAFE_INTEGER;
  if (has(D, "rod_recall") || has(D, "rod_healing")) {
    const healRod = borgSlot(ctx, TV.ROD, SVAL.rod.healing, d);
    const recallRod = borgSlot(ctx, TV.ROD, SVAL.rod.recall, d);
    const needCharge = has(D, "rod_healing") && healRod !== null && !healRod.pval || has(D, "rod_recall") && recallRod !== null && !recallRod.pval;
    if (needCharge) {
      if (!trait3(ctx, 108 /* ISWEAK */) && !trait3(ctx, 116 /* ISCUT */) && !trait3(ctx, 109 /* ISHUNGRY */) && !trait3(ctx, 115 /* ISPOISONED */) && canRest(d) && !borgSpellOkay(ctx, 7 /* RECHARGING */)) {
        ctx.world.self.timeThisPanel = 0;
        return ctx.act.rest(REST_COMPLETE);
      }
    }
  }
  if (!trait3(ctx, 112 /* ISBLIND */) && !trait3(ctx, 115 /* ISPOISONED */) && !trait3(ctx, 116 /* ISCUT */) && !trait3(ctx, 108 /* ISWEAK */) && !trait3(ctx, 109 /* ISHUNGRY */) && (trait3(ctx, 114 /* ISCONFUSED */) || trait3(ctx, 120 /* ISIMAGE */) || trait3(ctx, 113 /* ISAFRAID */) || trait3(ctx, 117 /* ISSTUN */) || trait3(ctx, 118 /* ISHEAVYSTUN */) || trait3(ctx, 27 /* CURHP */) < trait3(ctx, 28 /* MAXHP */) || trait3(ctx, 30 /* CURSP */) < Math.trunc(
    trait3(ctx, 31 /* MAXSP */) * (trait3(ctx, 105 /* CDEPTH */) > 85 ? 7 : 6) / 10
  ))) {
    if (canRest(d) && !ctx.world.facts.scaryGuyOnLevel && p <= fearRegion && ctx.world.self.goal.type !== GOAL_RECOVER) {
      const lightCmd = borgCheckLightOnly(ctx, d, playerHas);
      if (lightCmd) return lightCmd;
      ctx.world.self.timeThisPanel = 0;
      ctx.world.self.temp.needSeeInvis = clockOf(ctx, d) - 50;
      return ctx.act.rest(REST_COMPLETE);
    }
  }
  if (trait3(ctx, 31 /* MAXSP */) && (trait3(ctx, 35 /* CLEVEL */) <= 40 || trait3(ctx, 105 /* CDEPTH */) >= 85) && trait3(ctx, 30 /* CURSP */) < Math.trunc(trait3(ctx, 31 /* MAXSP */) * 8 / 10) && p < Math.trunc(avoidance(d) * 1 / 10) && canRest(d)) {
    if (!trait3(ctx, 108 /* ISWEAK */) && !trait3(ctx, 116 /* ISCUT */) && !trait3(ctx, 109 /* ISHUNGRY */) && !trait3(ctx, 115 /* ISPOISONED */) && trait3(ctx, 39 /* FOOD */) > 2 && !ctx.world.self.munchkinMode) {
      return ctx.act.rest(REST_COMPLETE);
    }
  }
  return null;
}

// src/item/junk.ts
function valueKnown(item, d) {
  return !!d?.itemValue || item.value !== void 0;
}
function valueOf(item, d) {
  if (d?.itemValue) return d.itemValue(item);
  return item.value ?? 0;
}
function isBook2(tval) {
  return tval === TV.MAGIC_BOOK || tval === TV.PRAYER_BOOK || tval === TV.NATURE_BOOK || tval === TV.SHADOW_BOOK || tval === TV.OTHER_BOOK;
}
function borgCrushJunk(ctx, d) {
  if (d?.doCrushJunk === false) return null;
  const recalling = d?.recalling ?? ctx.world.self.goal.recalling > 0;
  if (recalling) return null;
  if (danger(d) > Math.trunc(trait3(ctx, 27 /* CURHP */) / 10)) return null;
  const depth = trait3(ctx, 105 /* CDEPTH */);
  const ammoTval = trait3(ctx, 152 /* AMMO_TVAL */);
  const cls = trait3(ctx, 25 /* CLASS */);
  const maxCLevel = trait3(ctx, 36 /* MAXCLEVEL */);
  for (const item of ctx.view.inventory()) {
    if (item.number <= 0) continue;
    if (isBook2(item.tval)) continue;
    if (item.tval === TV.SCROLL && !item.aware) continue;
    if (!valueKnown(item, d)) continue;
    let value = valueOf(item, d);
    if ((item.tval === TV.STAFF || item.tval === TV.WAND) && item.number > item.pval) {
      value = 0;
    }
    if (item.tval >= TV.CHEST) {
      if (value > 0 && (modv(item, "STR") > 0 || modv(item, "INT") > 0 || modv(item, "WIS") > 0 || modv(item, "DEX") > 0 || modv(item, "CON") > 0))
        value += 2e3;
      if (item.tval === ammoTval && value > 0) value += 5e3;
      if (isProtectedConsumable(ctx, item, cls)) value += 5e3;
      if (item.tval === TV.DIGGING) value = 0;
      if ((item.tval === TV.SHOT || item.tval === TV.ARROW || item.tval === TV.BOLT) && item.tval !== ammoTval)
        value = 0;
      if (value > 0 && maxCLevel < 10 && maxCLevel <= 20 && item.curses.length === 0)
        continue;
      if (depth < 5 && value > 0) continue;
      if (depth < 10 && value > 15) continue;
      if (depth < 15 && value > 100) continue;
      if (depth < 30 && value > 500) continue;
      if (depth < 40 && value > 1e3) continue;
      if (depth < 60 && value > 1200) continue;
      if (depth < 80 && value > 1400) continue;
      if (depth < 90 && value > 1600) continue;
      if (depth < 95 && value > 4800) continue;
      if (depth < 127 && value > 5600) continue;
      const drop = d?.simDrop ? d.simDrop(item) : value === 0;
      if (!drop) continue;
      return ctx.act.drop(item.handle, 1);
    }
  }
  return null;
}
function modv(item, code) {
  for (const m of item.modifiers) if (m.code === code) return m.value;
  return 0;
}
function isProtectedConsumable(ctx, item, cls) {
  const P = SVAL.potion;
  const Ro = SVAL.rod;
  const St = SVAL.staff;
  const W2 = SVAL.wand;
  const Sc = SVAL.scroll;
  if (item.tval === TV.POTION) {
    if (item.sval === P.restore_mana && trait3(ctx, 31 /* MAXSP */) >= 1) return true;
    if (item.sval === P.healing) return true;
    if (item.sval === P.star_healing) return true;
    if (item.sval === P.life) return true;
    if (item.sval === P.speed) return true;
  }
  if (item.tval === TV.ROD) {
    if (item.sval === Ro.drain_life) return true;
    if (item.sval === Ro.healing) return true;
    if (item.sval === Ro.mapping && cls === CLASS_WARRIOR) return true;
  }
  if (item.tval === TV.STAFF) {
    if (item.sval === St.dispel_evil) return true;
    if (item.sval === St.power) return true;
    if (item.sval === St.holiness) return true;
  }
  if (item.tval === TV.WAND) {
    if (item.sval === W2.drain_life) return true;
    if (item.sval === W2.annihilation) return true;
    if (item.sval === W2.teleport_away && cls === CLASS_WARRIOR) return true;
  }
  if (item.tval === TV.SCROLL) {
    if (item.sval === Sc.teleport_level && trait3(ctx, 247 /* ATELEPORTLVL */) < 1e3)
      return true;
    if (item.sval === Sc.protection_from_evil) return true;
  }
  return false;
}
function borgRemoveStuff(ctx, d) {
  if (trait3(ctx, 109 /* ISHUNGRY */) || trait3(ctx, 108 /* ISWEAK */)) return null;
  for (const item of ctx.view.equipment()) {
    if (!item || item.number <= 0) continue;
    const remove = d?.simRemove ? d.simRemove(item) : item.curses.length > 0;
    if (!remove) continue;
    return ctx.act.takeoff(item.handle);
  }
  return null;
}

// src/item/item-wear.ts
function wieldSlot2(item) {
  switch (item.tval) {
    case TV.DIGGING:
    case TV.HAFTED:
    case TV.POLEARM:
    case TV.SWORD:
      return "weapon";
    case TV.BOW:
      return "bow";
    case TV.RING:
      return "ring";
    case TV.AMULET:
      return "amulet";
    case TV.LIGHT:
      return "light";
    case TV.SOFT_ARMOR:
    case TV.HARD_ARMOR:
    case TV.DRAG_ARMOR:
      return "body";
    case TV.CLOAK:
      return "cloak";
    case TV.SHIELD:
      return "shield";
    case TV.HELM:
    case TV.CROWN:
      return "helm";
    case TV.GLOVES:
      return "gloves";
    case TV.BOOTS:
      return "boots";
    default:
      return null;
  }
}
function wornInSlot(ctx, slot) {
  for (const item of ctx.view.equipment()) {
    if (item && item.number > 0 && wieldSlot2(item) === slot) return item;
  }
  return null;
}
function borgWearStuff(ctx, d) {
  if (trait3(ctx, 109 /* ISHUNGRY */) || trait3(ctx, 108 /* ISWEAK */)) return null;
  if (d?.hasHole === false) return null;
  if ((d?.clock ?? 0) - (d?.began ?? 0) > 2e3) return null;
  if (ctx.world.self.timeThisPanel > 1300) return null;
  const currentPower = ctx.world.self.power;
  let bestPower = currentPower;
  let best = null;
  for (const item of ctx.view.inventory()) {
    if (item.number <= 0) continue;
    if (!isAware(item, d)) continue;
    if (itemValue(item, d) <= 0) continue;
    if ((d?.randarts ?? false) && item.artifact && !isIdent(item, d)) continue;
    const slot = wieldSlot2(item);
    if (!slot) continue;
    if (trait3(ctx, 122 /* ISENCUMB */)) {
      const worn = wornInSlot(ctx, slot);
      if (worn && mod(worn, "STR") > mod(item, "STR")) continue;
    }
    const p = d?.wearEval ? d.wearEval(item) : currentPower;
    if (p <= bestPower + 50) continue;
    bestPower = p;
    best = item;
  }
  if (best && bestPower > currentPower) {
    ctx.world.self.timeThisPanel++;
    return ctx.act.wear(best.handle);
  }
  return null;
}

// src/think-session.ts
function buildFlowHooks(session) {
  const ctx = () => {
    if (!session.ctx) throw new Error("borg flow hook used outside a think");
    return session.ctx;
  };
  return {
    danger: (_world, y, x) => borgDanger(ctx(), y, x, 1, true, false),
    canDigMagic: (_world, checkFail) => {
      const c = ctx();
      if (checkFail) {
        return borgSpellOkayFail(c, 38 /* TURN_STONE_TO_MUD */, 40) || borgSpellOkayFail(c, 121 /* SHATTER_STONE */, 40);
      }
      return borgSpellLegal(c, 38 /* TURN_STONE_TO_MUD */) || borgSpellLegal(c, 121 /* SHATTER_STONE */);
    },
    hasDistanceAttack: (_world) => {
      return (ctx().view.player().shots ?? 0) > 0;
    },
    layGlyph: (c) => borgSpell(c, 78 /* GLYPH_OF_WARDING */) ?? borgReadScroll(c, SVAL.scroll.rune_of_protection),
    forceDescend: session.resolvers.forceDescend ?? false,
    preparedToDescend: (world) => borgPrepared(ctx(), (world.self.trait[105 /* CDEPTH */] ?? 0) + 1) === null,
    countSell: (_world) => borgCountSell(ctx(), buildStoreDeps(session)),
    packFull: (_world) => borgFirstEmptyInventorySlot(ctx()) < 0,
    monsterHasFlag: (_world, killIndex, flag) => {
      const facts = getDangerState(ctx().world).globals.resolveFacts(
        ctx(),
        killIndex
      );
      return facts.flags.has(flag);
    },
    dangerOneKill: (_world, y, x, killIndex) => borgDangerOneKill(ctx(), y, x, 1, killIndex, true, true),
    los: (world, y1, x1, y2, x2) => borgLos(world, y1, x1, y2, x2)
  };
}
function wareRef(store2, item) {
  return { from: "store", store: store2, index: item.index };
}
function powerOf(session, ctx, change) {
  const resolve = session.resolvers.loadoutPower;
  if (!resolve) return ctx.world.self.power;
  const answer = resolve(ctx, change);
  if (answer === null) return ctx.world.self.power;
  const base = simulationBaseline(session, ctx, resolve);
  if (base === null) return answer;
  return ctx.world.self.power + (answer - base);
}
var BASELINES = /* @__PURE__ */ new WeakMap();
function simulationBaseline(session, ctx, resolve) {
  const cached = BASELINES.get(session);
  if (cached && cached.clock === ctx.world.clock) return cached.base;
  const base = resolve(ctx, {}) ?? null;
  BASELINES.set(session, { clock: ctx.world.clock, base });
  return base;
}
function buildItemDeps(session) {
  const c = session.ctx;
  if (!c) throw new Error("buildItemDeps outside a think");
  const w = c.world;
  const py = w.self.c.y;
  const px = w.self.c.x;
  const dangerHere = borgDanger(c, py, px, 1, true, false);
  const fear = getFearCaches(w);
  const res = session.resolvers;
  return {
    danger: dangerHere,
    avoidance: w.self.trait[27 /* CURHP */] ?? 0,
    /* borg_check_rest(borg.c.y, borg.c.x): the real gate, not a constant. Every
     * rest in borg-recover.c is behind it, so a hardcoded `true` is the Borg
     * resting with a monster next to it. */
    canRest: borgCheckRest(c, session.flow.state, py, px),
    clock: w.clock,
    /* borg_began, for borg_wear_stuff's "sitting on this level forever" guard. */
    began: session.flow.state.borgBegan,
    fearRegion: fear.region(py, px),
    ...res.resolveActivation ? {
      equipsItem: (act, checkCharge) => res.resolveActivation(c, act, checkCharge)
    } : {},
    ...res.activateHandle ? { activateItem: (act) => res.activateHandle(c, act) } : {},
    ...res.loadoutPower ? {
      /* borg_wear_stuff (wear.c:858): the power if this pack item were worn.
       * The engine picks the slot, so a ring goes to the hand wield_slot
       * would put it in rather than to a hand this code guessed at. */
      wearEval: (item) => powerOf(session, c, {
        wield: [{ from: "gear", handle: item.handle }]
      })
    } : {}
  };
}
function storeCfg() {
  const cfg = borgCfg();
  return {
    worshipsGold: cfg.worshipsGold,
    selfScum: cfg.selfScum,
    usesSwaps: cfg.usesSwaps
  };
}
function buildStoreDeps(session) {
  const res = session.resolvers;
  if (!res.loadoutPower) return { mem: session.storeMem, ...storeCfg() };
  return {
    mem: session.storeMem,
    ...storeCfg(),
    /* borg_think_shop_buy_useful (borg-store-buy.c:363/388). A ware the borg
     * would WIELD is worn; anything else joins the pack. Both cost their weight,
     * which is what makes plate armour read as the speed loss it is. */
    buyShopEval: (ctx, sim) => {
      const ref = wareRef(sim.store, sim.item);
      if (!sim.wields) {
        return powerOf(session, ctx, { carry: [{ item: ref, number: sim.qty }] });
      }
      return powerOf(session, ctx, {
        wield: [ref],
        ...sim.qty > 1 ? { carry: [{ item: ref, number: sim.qty - 1 }] } : {}
      });
    },
    /* borg_think_home_buy_useful: the same question about the home's shelves,
     * which are a store like any other (index BORG_HOME in view.stores()). */
    buyHomeEval: (ctx, sim) => {
      const ref = wareRef(sim.store, sim.item);
      if (!sim.wields) {
        return powerOf(session, ctx, { carry: [{ item: ref, number: sim.qty }] });
      }
      return powerOf(session, ctx, { wield: [ref] });
    },
    /* borg_think_shop_sell_useless: the power once `qty` of this stack is gone.
     * `release` empties a body slot when the handle names worn gear, so selling
     * the amulet the borg has on is one change rather than a remove and a sale. */
    sellEval: (ctx, item, qty) => powerOf(session, ctx, {
      release: [{ handle: item.handle, number: qty }]
    }),
    /* borg_think_home_sell_bad (borg-store-sell.c:376) asks about ONE of a
     * stack, not the whole stack. */
    sellHomeBadEval: (ctx, item) => powerOf(session, ctx, {
      release: [{ handle: item.handle, number: 1 }]
    })
    /* weaponSwapEval / armourSwapEval are deliberately NOT wired. They value a
     * home ware as the borg's SWAP weapon or armour, and this port has no swap
     * subsystem: weapon_swap_value and armour_swap_value contribute 0 to
     * borgPower (trait/power.ts), so an evaluator here would compare two numbers
     * that are equal by construction and buy on the tiebreak. Unreachable until
     * the swap subsystem is ported, not merely unwired. */
  };
}
function buildThinkSession(resolvers = {}) {
  const session = {
    flow: void 0,
    storeMem: createStoreMemory(),
    resolvers,
    ctx: null,
    arrivalPickup: false,
    lastGrid: "",
    junked: /* @__PURE__ */ new Set(),
    pickupTried: ""
  };
  session.flow = createFlow(buildFlowHooks(session));
  return session;
}
var SESSIONS = /* @__PURE__ */ new WeakMap();
function getThinkSession(world) {
  let s = SESSIONS.get(world);
  if (!s) {
    s = buildThinkSession();
    SESSIONS.set(world, s);
  }
  return s;
}
function installThinkSession(world, session) {
  SESSIONS.set(world, session);
}
function primeSession(session, ctx) {
  session.ctx = ctx;
  const w = ctx.world;
  const g = getDangerGlobals(w);
  const curhp = w.self.trait[27 /* CURHP */] ?? 0;
  g.avoidance = curhp;
  if (session.resolvers.resolveMonsterFacts) {
    g.resolveFacts = session.resolvers.resolveMonsterFacts;
  }
  session.flow.state.avoidance = curhp;
  session.flow.state.hooks.forceDescend = session.resolvers.forceDescend ?? false;
}

// src/fight/state.ts
var STATES2 = /* @__PURE__ */ new WeakMap();
function getFightState(world) {
  let st2 = STATES2.get(world);
  if (!st2) {
    st2 = {
      simulate: true,
      pending: null,
      tempX: [],
      tempY: [],
      tempN: 0,
      successfulTarget: 0,
      targetClosest: 0,
      fightingUnique: 0,
      fightingSummoner: false,
      fightingEvilUnique: false,
      tAntisummon: 0,
      began: 0,
      timeTown: 0,
      playsRisky: false
    };
    STATES2.set(world, st2);
  }
  return st2;
}
function idiv(a, b) {
  return Math.trunc(a / b);
}
function iabs(a) {
  return a < 0 ? -a : a;
}

// src/fight/bf.ts
var BTH_PLUS_ADJ = 3;

// src/fight/projection.ts
function maxRange(ctx) {
  return ctx.view.constants().maxRange ?? 20;
}
function featAt(ctx, y, x) {
  if (!ctx.world.map.inBounds(x, y)) return FEAT.NONE;
  return ctx.world.map.at(x, y).feat;
}
function killAt(ctx, y, x) {
  if (!ctx.world.map.inBounds(x, y)) return 0;
  return ctx.world.map.at(x, y).kill;
}
function borgOffsetProjectable(ctx, y1, x1, y2, x2) {
  let y = y1;
  let x = x1;
  const max = maxRange(ctx);
  for (let dist4 = 0; dist4 <= max; dist4++) {
    const feat = featAt(ctx, y, x);
    if (dist4 && feat === FEAT.NONE) break;
    if (feat === FEAT.PASS_RUBBLE) break;
    if (dist4 && !borgCaveFloorGrid(ctx.world.map.at(x, y))) break;
    if (x === x2 && y === y2) return true;
    [y, x] = borgIncMotion(y, x, y1, x1, y2, x2);
  }
  return false;
}
function borgTarget(ctx, y, x, requireMonster = false) {
  const ki = killAt(ctx, y, x);
  if (requireMonster && ki && ctx.world.kills.has(ki)) {
    const midx = ctx.world.kills.at(ki).mIdx;
    if (midx && ctx.act.setTargetMonster(midx)) return true;
  }
  ctx.act.setTargetLocation(x, y);
  return true;
}

// src/fight/attack.ts
function avoidance2(ctx) {
  return getDangerGlobals(ctx.world).avoidance;
}
function factsOf(ctx, i) {
  return getDangerGlobals(ctx.world).resolveFacts(ctx, i);
}
function rf(facts, name) {
  return facts.flags.has(name);
}
function rsf(facts, code) {
  return facts.spells.includes(code);
}
function dist(y1, x1, y2, x2) {
  return Math.max(iabs(y1 - y2), iabs(x1 - x2));
}
function raceName(ctx, mIdx) {
  for (const m of ctx.view.monsters()) if (m.id === mIdx) return m.race;
  return "";
}
function maxRange2(ctx) {
  return ctx.view.constants().maxRange ?? 20;
}
function borgThrustDamageOne(ctx, i) {
  const kill = ctx.world.kills.at(i);
  const facts = factsOf(ctx, i);
  if (!kill.rIdx) return 0;
  let dam = idiv(trait3(ctx, 139 /* WDD */) * (trait3(ctx, 140 /* WDS */) + 1), 2);
  let mult = 1;
  if (trait3(ctx, 193 /* WS_ANIMAL */) && rf(facts, "ANIMAL") || trait3(ctx, 194 /* WS_EVIL */) && rf(facts, "EVIL"))
    mult = 2;
  if (trait3(ctx, 195 /* WS_UNDEAD */) && rf(facts, "UNDEAD") || trait3(ctx, 196 /* WS_DEMON */) && rf(facts, "DEMON") || trait3(ctx, 197 /* WS_ORC */) && rf(facts, "ORC") || trait3(ctx, 198 /* WS_TROLL */) && rf(facts, "TROLL") || trait3(ctx, 199 /* WS_GIANT */) && rf(facts, "GIANT") || trait3(ctx, 200 /* WS_DRAGON */) && rf(facts, "DRAGON") || trait3(ctx, 205 /* WB_ACID */) && !rf(facts, "IM_ACID") || trait3(ctx, 207 /* WB_FIRE */) && !rf(facts, "IM_FIRE") || trait3(ctx, 208 /* WB_COLD */) && !rf(facts, "IM_COLD") || trait3(ctx, 209 /* WB_POIS */) && !rf(facts, "IM_POIS") || trait3(ctx, 206 /* WB_ELEC */) && !rf(facts, "IM_ELEC"))
    mult = 3;
  if (trait3(ctx, 201 /* WK_UNDEAD */) && rf(facts, "UNDEAD") || trait3(ctx, 202 /* WK_DEMON */) && rf(facts, "DEMON") || trait3(ctx, 203 /* WK_DRAGON */) && rf(facts, "DRAGON"))
    mult = 5;
  dam *= mult;
  dam += trait3(ctx, 137 /* WTODAM */);
  dam += trait3(ctx, 135 /* TODAM */);
  dam *= trait3(ctx, 146 /* BLOWS */);
  let chance = trait3(ctx, 60 /* THN */) + (trait3(ctx, 134 /* TOHIT */) + trait3(ctx, 136 /* WTOHIT */)) * 3;
  const ac = 0;
  if (chance < idiv(idiv(ac * 3, 4) * 8, 10)) dam = 0;
  if (chance > 95) chance = 95;
  if (chance < 5) chance = 5;
  if (trait3(ctx, 35 /* CLEVEL */) > 15) chance += 10;
  if ((trait3(ctx, 25 /* CLASS */) === CLASS_MAGE || trait3(ctx, 25 /* CLASS */) === CLASS_NECROMANCER) && trait3(ctx, 30 /* CURSP */) > 1)
    chance -= 10;
  dam = idiv(dam * chance, 100);
  if (dam <= 0) dam = 1;
  if (dam > kill.power * 2 && !rf(facts, "UNIQUE")) dam = kill.power * 2;
  if ((trait3(ctx, 25 /* CLASS */) === CLASS_MAGE || trait3(ctx, 25 /* CLASS */) === CLASS_NECROMANCER) && trait3(ctx, 36 /* MAXCLEVEL */) < 40 && trait3(ctx, 30 /* CURSP */) > 1)
    dam = idiv(dam * 8, 10) + 1;
  if (rf(facts, "UNIQUE") && trait3(ctx, 105 /* CDEPTH */) >= 1) dam += dam * 5;
  if (rf(facts, "UNIQUE") && trait3(ctx, 105 /* CDEPTH */) === 0) {
    dam = idiv(dam * 2, 3);
    if (trait3(ctx, 35 /* CLEVEL */) < 5) dam = 0;
  }
  if (rf(facts, "MULTIPLY")) dam = idiv(dam * 3, 2);
  if (isSummoner(facts)) dam += idiv(dam * 3, 2);
  if (rf(facts, "QUESTOR")) dam += dam * 5;
  return dam;
}
function isSummoner(facts) {
  const s = RSF;
  const codes = [
    "S_KIN",
    "S_HI_DEMON",
    "S_MONSTER",
    "S_MONSTERS",
    "S_ANIMAL",
    "S_SPIDER",
    "S_HOUND",
    "S_HYDRA",
    "S_AINU",
    "S_DEMON",
    "S_UNDEAD",
    "S_DRAGON",
    "S_HI_DRAGON",
    "S_HI_UNDEAD",
    "S_WRAITH",
    "S_UNIQUE"
  ];
  for (const c of codes) {
    const v = s[c];
    if (typeof v === "number" && rsf(facts, v)) return true;
  }
  return false;
}
var BRAND_TABLE = {
  ACID: { mult: 3, im: "IM_ACID" },
  ELEC: { mult: 3, im: "IM_ELEC" },
  FIRE: { mult: 3, im: "IM_FIRE", vuln: "HURT_FIRE" },
  COLD: { mult: 3, im: "IM_COLD", vuln: "HURT_COLD" },
  POIS: { mult: 3, im: "IM_POIS" }
};
var SLAY_TABLE = [
  { token: "ANIMAL", mult: 2, race: "ANIMAL" },
  { token: "EVIL", mult: 2, race: "EVIL" },
  { token: "UNDEAD", mult: 3, race: "UNDEAD" },
  { token: "DEMON", mult: 3, race: "DEMON" },
  { token: "ORC", mult: 3, race: "ORC" },
  { token: "TROLL", mult: 3, race: "TROLL" },
  { token: "GIANT", mult: 3, race: "GIANT" },
  { token: "DRAGON", mult: 3, race: "DRAGON" }
];
function borgBestMult(obj, facts) {
  let maxMult = 1;
  if (!obj) return maxMult;
  for (const code of obj.brands) {
    const b = BRAND_TABLE[code.toUpperCase()];
    if (!b) continue;
    if (!facts.flags.has(b.im)) {
      let mult = b.mult;
      if (b.vuln && facts.flags.has(b.vuln)) mult *= 2;
      if (mult > maxMult) maxMult = mult;
    }
  }
  for (const code of obj.slays) {
    const up = code.toUpperCase();
    for (const s of SLAY_TABLE) {
      if (!up.includes(s.token)) continue;
      if (facts.flags.has(s.race)) {
        const isKill = up.includes("KILL") || up.endsWith("5");
        const mult = isKill ? 5 : s.mult;
        if (mult > maxMult) maxMult = mult;
      }
    }
  }
  return maxMult;
}
function borgLaunchDamageOne(ctx, fs, i, dam, typ, ammo) {
  const g = getDangerGlobals(ctx.world);
  const kill = ctx.world.kills.at(i);
  const facts = factsOf(ctx, i);
  if (!kill.rIdx) return 0;
  const curDis = dist(ctx.world.self.c.y, ctx.world.self.c.x, kill.pos.y, kill.pos.x);
  let goldEater = false;
  for (const b of facts.blows) if (b.effect === 5 /* EAT_GOLD */) goldEater = true;
  let borgUseMissile = false;
  switch (typ) {
    case 0 /* MISSILE */:
      break;
    case 1 /* ARROW */: {
      const bow = findBow(ctx);
      const bonus = trait3(ctx, 134 /* TOHIT */) + (bow ? bow.toH : 0) + (ammo ? ammo.toH : 0);
      const chance = trait3(ctx, 61 /* THB */) + bonus * BTH_PLUS_ADJ;
      const armor = 0 + curDis;
      let mult = borgBestMult(bow, facts);
      mult = Math.max(mult, borgBestMult(ammo, facts));
      dam *= mult;
      if (curDis === 1 && !rf(facts, "UNIQUE")) dam = idiv(dam, 5);
      if (chance < idiv(armor * 8, 10)) dam = 0;
      break;
    }
    case 2 /* MANA */:
      if (g.fightingUnique && ctx.world.self.has.length > 0) {
      }
      break;
    case 3 /* METEOR */:
      break;
    case 4 /* ACID */:
      if (rf(facts, "IM_ACID")) dam = 0;
      break;
    case 5 /* ELEC */:
      if (rf(facts, "IM_ELEC")) dam = 0;
      break;
    case 6 /* FIRE */:
      if (rf(facts, "IM_FIRE")) dam = 0;
      if (rf(facts, "HURT_FIRE")) dam *= 2;
      break;
    case 7 /* COLD */:
      if (rf(facts, "IM_COLD")) dam = 0;
      if (rf(facts, "HURT_COLD")) dam *= 2;
      break;
    case 8 /* POIS */:
      if (rf(facts, "IM_POIS")) dam = 0;
      break;
    case 9 /* ICE */:
      if (rf(facts, "IM_COLD")) dam = 0;
      break;
    case 10 /* HOLY_ORB */:
      if (rf(facts, "EVIL")) dam *= 2;
      break;
    case 11 /* DISP_UNDEAD */:
      if (!rf(facts, "UNDEAD")) dam = 0;
      break;
    case 13 /* DISP_SPIRITS */:
      if (!rf(facts, "SPIRIT")) dam = 0;
      break;
    case 12 /* DISP_EVIL */:
      if (!rf(facts, "EVIL")) dam = 0;
      break;
    case 56 /* DRAIN_LIFE */:
      if (!rf(facts, "NONLIVING")) dam = 0;
      if (!rf(facts, "UNDEAD")) dam = 0;
      break;
    case 15 /* HOLY_WORD */:
      if (!rf(facts, "EVIL")) dam = 0;
      break;
    case 16 /* LIGHT_WEAK */:
      if (!rf(facts, "HURT_LIGHT")) dam = 0;
      break;
    case 17 /* OLD_DRAIN */:
      if (curDis === 1) dam = idiv(dam, 5);
      if (rf(facts, "UNDEAD") || rf(facts, "DEMON")) dam = 0;
      break;
    case 18 /* KILL_WALL */:
      if (!rf(facts, "HURT_ROCK")) dam = 0;
      break;
    case 19 /* NETHER */:
      if (rf(facts, "UNDEAD")) dam = 0;
      else if (rsf(facts, RSF.BR_NETH)) dam = idiv(dam * 3, 9);
      else if (rf(facts, "EVIL")) dam = idiv(dam, 2);
      break;
    case 20 /* CHAOS */:
      if (rsf(facts, RSF.BR_CHAO)) dam = idiv(dam * 3, 9);
      if (!rf(facts, "UNIQUE")) dam = -999;
      break;
    case 21 /* GRAVITY */:
      if (rsf(facts, RSF.BR_GRAV)) dam = idiv(dam * 3, 9);
      break;
    case 22 /* SHARD */:
      if (rsf(facts, RSF.BR_SHAR)) dam = idiv(dam * 3, 9);
      break;
    case 23 /* SOUND */:
      if (rsf(facts, RSF.BR_SOUN)) dam = idiv(dam * 3, 9);
      break;
    case 24 /* PLASMA */:
      if (rsf(facts, RSF.BR_PLAS)) dam = idiv(dam * 3, 9);
      break;
    case 25 /* CONFU */:
      if (rf(facts, "NO_CONF")) dam = 0;
      break;
    case 26 /* DISEN */:
      if (rsf(facts, RSF.BR_DISE)) dam = idiv(dam * 3, 9);
      break;
    case 27 /* NEXUS */:
      if (rsf(facts, RSF.BR_NEXU)) dam = idiv(dam * 3, 9);
      break;
    case 28 /* FORCE */:
      if (rsf(facts, RSF.BR_WALL)) dam = idiv(dam * 3, 9);
      break;
    case 29 /* INERTIA */:
      if (rsf(facts, RSF.BR_INER)) dam = idiv(dam * 3, 9);
      break;
    case 30 /* TIME */:
      if (rsf(facts, RSF.BR_TIME)) dam = idiv(dam * 3, 9);
      break;
    case 31 /* LIGHT */:
      if (rsf(facts, RSF.BR_LIGHT)) dam = idiv(dam * 3, 9);
      break;
    case 32 /* DARK */:
      if (rsf(facts, RSF.BR_DARK)) dam = idiv(dam * 3, 9);
      break;
    case 33 /* WATER */:
      if (rsf(facts, RSF.BA_WATE)) dam = idiv(dam * 3, 9);
      dam = idiv(dam, 2);
      break;
    case 34 /* OLD_HEAL */:
    case 35 /* OLD_CLONE */:
    case 36 /* OLD_SPEED */:
    case 37 /* DARK_WEAK */:
    case 38 /* KILL_DOOR */:
    case 39 /* KILL_TRAP */:
    case 40 /* MAKE_WALL */:
    case 41 /* MAKE_DOOR */:
    case 42 /* MAKE_TRAP */:
    case 43 /* AWAY_UNDEAD */:
    case 44 /* TURN_EVIL */:
      dam = 0;
      break;
    case 45 /* AWAY_ALL */:
      dam = teleportAwayValue(ctx, fs, i, kill, facts, dam);
      break;
    case 46 /* AWAY_ALL_MORGOTH */:
      dam = teleportAwayMorgothValue(ctx, fs, i, kill, facts);
      break;
    case 47 /* DISP_ALL */:
      if (rf(facts, "UNIQUE")) {
        dam = 0;
        break;
      }
      dam = borgDangerOneKill(ctx, ctx.world.self.c.y, ctx.world.self.c.x, 1, i, true, true);
      break;
    case 48 /* OLD_CONF */:
      dam = statusSpellValue(ctx, i, kill, facts, "confuseSpell", { needConfCheck: true });
      break;
    case 49 /* TURN_ALL */:
      dam = statusSpellValue(ctx, i, kill, facts, "fearMonSpell", { noFear: true });
      break;
    case 50 /* OLD_SLOW */:
      dam = statusSpellValue(ctx, i, kill, facts, "slowSpell", {});
      break;
    case 51 /* OLD_SLEEP */:
    case 14 /* SLEEP_EVIL */:
      dam = statusSpellValue(ctx, i, kill, facts, "sleepSpell", {
        noSleep: true,
        evilOnly: typ === 14 /* SLEEP_EVIL */
      });
      break;
    case 52 /* OLD_POLY */: {
      dam = 0;
      if (kill.level > (trait3(ctx, 35 /* CLEVEL */) < 13 ? 10 : idiv(trait3(ctx, 35 /* CLEVEL */) - 10, 4) * 3 + 10))
        break;
      dam = -999;
      if (rf(facts, "UNIQUE")) break;
      dam = borgDangerOneKill(ctx, ctx.world.self.c.y, ctx.world.self.c.x, 2, i, true, true);
      if (dam < avoidance2(ctx) * 2 && !kill.afraid) dam = 0;
      break;
    }
    case 53 /* TURN_UNDEAD */:
      if (rf(facts, "UNDEAD")) {
        dam = 0;
        if (kill.confused) break;
        if (kill.speed < kill.speed - 5) break;
        if (!kill.awake) break;
        if (kill.level > trait3(ctx, 35 /* CLEVEL */) - 5) break;
        g.fearMonSpell = false;
        const p1 = borgDangerOneKill(ctx, ctx.world.self.c.y, ctx.world.self.c.x, 1, i, true, true);
        g.fearMonSpell = true;
        const p2 = borgDangerOneKill(ctx, ctx.world.self.c.y, ctx.world.self.c.x, 1, i, true, true);
        g.fearMonSpell = false;
        dam = p1 - p2;
      } else dam = 0;
      break;
    case 54 /* AWAY_EVIL */:
      if (rf(facts, "EVIL")) {
        if (rf(facts, "UNIQUE")) {
          if (facts.hasFriends) dam = 0;
          else dam = -500;
        } else {
          dam = borgDangerOneKill(ctx, ctx.world.self.c.y, ctx.world.self.c.x, 1, i, true, true);
        }
      } else dam = 0;
      break;
    case 55 /* TAP_UNLIFE */:
      if (!rf(facts, "UNDEAD")) dam = 0;
      else {
        const spDrain = 0;
        if (spDrain < kill.power) dam = kill.power - spDrain;
      }
      break;
    case 58 /* CURSE */:
      dam = idiv(idiv(trait3(ctx, 35 /* CLEVEL */), 12) * (50 + kill.injury + 1), 2);
      break;
    case 57 /* ELEC_STRIKE */:
      if (rf(facts, "IM_ELEC")) dam = 0;
      else if (!borgProjectablePure(ctx.world, maxRange2(ctx), ctx.world.self.c.y, ctx.world.self.c.x, kill.pos.y, kill.pos.x))
        dam = 0;
      break;
  }
  if (trait3(ctx, 105 /* CDEPTH */) >= 1 && (borgDangerOneKill(ctx, kill.pos.y, kill.pos.x, 1, i, true, true) > idiv(avoidance2(ctx) * 2, 10) || facts.hasFriends && kill.level >= trait3(ctx, 35 /* CLEVEL */) - 5 || kill.rangedAttack || rf(facts, "UNIQUE") || rf(facts, "MULTIPLY") || goldEater || rf(facts, "NEVER_MOVE") || trait3(ctx, 35 /* CLEVEL */) <= 20)) {
    borgUseMissile = true;
  }
  if (typ === 45 /* AWAY_ALL */ || typ === 54 /* AWAY_EVIL */ || typ === 46 /* AWAY_ALL_MORGOTH */) return dam;
  if (dam > kill.power * 2 && !rf(facts, "UNIQUE")) dam = kill.power * 2;
  if (rf(facts, "UNIQUE") && trait3(ctx, 105 /* CDEPTH */) >= 1) dam = dam * 3;
  if (rf(facts, "UNIQUE") && trait3(ctx, 105 /* CDEPTH */) === 0) {
    dam = idiv(dam * 2, 3);
    if (trait3(ctx, 35 /* CLEVEL */) < 5) dam = 0;
  }
  if (rf(facts, "MULTIPLY")) dam = idiv(dam * 3, 2);
  if (isSummoner(facts)) dam += idiv(dam * 3, 2);
  if (rf(facts, "QUESTOR")) dam += dam * 9;
  if (typ === 1 /* ARROW */ && !borgUseMissile) dam = 0;
  return dam;
}
function findBow(ctx) {
  for (const it of ctx.view.equipment()) {
    if (it && it.number > 0 && it.tval === TV.BOW) return it;
  }
  return null;
}
function teleportAwayValue(ctx, fs, i, kill, facts, dam) {
  const g = getDangerGlobals(ctx.world);
  const push = () => g.tpOtherIndices.push(i);
  if (rf(facts, "UNIQUE")) {
    if (kill.injury >= 60) return -9999;
    if (g.asPosition) return -9999;
    if (dam > idiv(avoidance2(ctx) * 13, 10) && trait3(ctx, 105 /* CDEPTH */) <= 98) {
      push();
    } else if (fs.fightingUnique >= 2 && fs.fightingUnique <= 8) {
      push();
    } else if (trait3(ctx, 25 /* CLASS */) === CLASS_MAGE && dist(ctx.world.self.c.y, ctx.world.self.c.x, kill.pos.y, kill.pos.x) <= 2) {
      push();
    } else if (ctx.world.facts.vaultOnLevel) {
      let vaultGrids = 0;
      for (let ii = 0; ii < 8; ii++) {
        const dx = [0, 0, 1, -1, 1, -1, 1, -1][ii];
        const dy = [1, -1, 0, 0, 1, 1, -1, -1][ii];
        const x = kill.pos.x + dx;
        const y = kill.pos.y + dy;
        if (!ctx.world.map.inBounds(x, y)) continue;
        const f = ctx.world.map.at(x, y).feat;
        if (f === FEAT.NONE) continue;
        if (f === FEAT.PERM) vaultGrids++;
      }
      if (vaultGrids >= 2) push();
    } else {
      return -999;
    }
  } else {
    push();
  }
  return dam;
}
function teleportAwayMorgothValue(ctx, fs, i, kill, _facts) {
  const g = getDangerGlobals(ctx.world);
  let dam = 0;
  for (let j = 0; j < 8; j++) {
    const dx = [0, 0, 1, -1, 1, -1, 1, -1][j];
    const dy = [1, -1, 0, 0, 1, 1, -1, -1][j];
    const y2 = kill.pos.y + dy;
    const x2 = kill.pos.x + dx;
    if (!ctx.world.map.inBounds(x2, y2)) continue;
    if (ctx.world.map.at(x2, y2).glyph) {
      g.tpOtherIndices.push(i);
      dam = 300;
    }
  }
  if (ctx.world.facts.morgothOnLevel && !g.morgothPosition) {
    g.tpOtherIndices.push(i);
    dam = 100;
  }
  if (trait3(ctx, 30 /* CURSP */) <= 35) {
    g.tpOtherIndices.push(i);
    dam = 150;
  }
  void fs;
  return dam;
}
function statusSpellValue(ctx, i, kill, facts, flag, opt) {
  const g = getDangerGlobals(ctx.world);
  let dam = 0;
  if (opt.noSleep && rf(facts, "NO_SLEEP")) return 0;
  if (opt.evilOnly && !rf(facts, "EVIL")) return 0;
  if (opt.needConfCheck && rf(facts, "NO_CONF")) return 0;
  if (opt.needConfCheck && rf(facts, "MULTIPLY")) return 0;
  if (opt.noFear && rf(facts, "NO_FEAR")) return 0;
  if (kill.speed < kill.speed - 5) return 0;
  if (kill.confused) return 0;
  if (!kill.awake) return 0;
  if (kill.level > (trait3(ctx, 35 /* CLEVEL */) < 13 ? 10 : idiv(trait3(ctx, 35 /* CLEVEL */) - 10, 4) * 3 + 10))
    return 0;
  dam = -999;
  if (rf(facts, "UNIQUE")) return dam;
  g[flag] = false;
  let p1 = borgDangerOneKill(ctx, ctx.world.self.c.y, ctx.world.self.c.x, 1, i, true, true);
  if (kill.afraid && trait3(ctx, 35 /* CLEVEL */) <= 10) p1 = p1 + 20;
  g[flag] = true;
  const p2 = borgDangerOneKill(ctx, ctx.world.self.c.y, ctx.world.self.c.x, 1, i, true, true);
  g[flag] = false;
  return p1 - p2;
}
function borgLaunchBoltAuxHack(ctx, fs, i, dam, typ, ammo) {
  if (i <= 0 || !ctx.world.kills.has(i)) return 0;
  const kill = ctx.world.kills.at(i);
  const facts = factsOf(ctx, i);
  if (!kill.rIdx) return 0;
  if (kill.when < ctx.world.clock - 2) return 0;
  const x = kill.pos.x;
  const y = kill.pos.y;
  if (!ctx.world.map.inBounds(x, y)) return 0;
  const ag = ctx.world.map.at(x, y);
  if (!borgCaveFloorGrid(ag)) return 0;
  if (rf(facts, "PASS_WALL")) {
    if (ag.feat !== FEAT.FLOOR && ag.feat !== FEAT.OPEN && ag.feat !== FEAT.BROKEN && !ag.trap)
      return 0;
    let walls = 0;
    let unknown = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const xx = x + ox;
        const yy = y + oy;
        if (!ctx.world.map.inBounds(xx, yy)) continue;
        const f = ctx.world.map.at(xx, yy).feat;
        if (f >= FEAT.MAGMA && f <= FEAT.PERM) walls++;
        if (f === FEAT.NONE) unknown++;
      }
    }
    if (walls >= 2 && unknown >= 1) return 0;
  }
  let d = borgLaunchDamageOne(ctx, fs, i, dam, typ, ammo);
  if (typ === 45 /* AWAY_ALL */ || typ === 46 /* AWAY_ALL_MORGOTH */) return d;
  if (typ === 54 /* AWAY_EVIL */) return d;
  if (d <= 0) return d;
  const p2 = borgDangerOneKill(ctx, y, x, 1, i, true, false);
  if (!kill.awake && p2 > idiv(avoidance2(ctx), 2) && d < kill.power && !ctx.world.self.munchkinMode)
    return -999;
  if (!trait3(ctx, 105 /* CDEPTH */) && !kill.awake) return 0;
  const p1 = borgDangerOneKill(ctx, ctx.world.self.c.y, ctx.world.self.c.x, 1, i, true, false);
  if (d >= kill.power) d = 2 * d;
  d = d + p1;
  return d;
}
function borgLaunchDestroyStuff(ctx, takeIdx, typ) {
  if (!ctx.world.takes.has(takeIdx)) return 0;
  const t = ctx.world.takes.at(takeIdx);
  switch (typ) {
    case 4 /* ACID */:
      if (t.tval === TV.BOOTS) return 20;
      break;
    case 5 /* ELEC */:
      if (t.tval === TV.RING) return 20;
      break;
    case 6 /* FIRE */:
      if (t.tval === TV.BOOTS) return 20;
      break;
    case 7 /* COLD */:
      if (t.tval === TV.POTION) return 20;
      break;
  }
  return 0;
}
function borgLaunchBoltAtLocation(ctx, fs, y2, x2, rad, dam, typ, max, ammo) {
  let n = 0;
  const x1 = ctx.world.self.c.x;
  const y1 = ctx.world.self.c.y;
  if (!squareInBoundsFully2(x2, y2)) return 0;
  let x = x1;
  let y = y1;
  const kill0 = killAtGrid(ctx, y2, x2);
  const facts0 = kill0 ? factsOf(ctx, kill0) : null;
  let dist4 = 1;
  for (; dist4 < max; dist4++) {
    [y, x] = borgIncMotion(y, x, y1, x1, y2, x2);
    if (!squareInBoundsFully2(x, y)) break;
    const ag = ctx.world.map.at(x, y);
    if (!borgCaveFloorGrid(ag) || ag.feat === FEAT.PASS_RUBBLE) {
      if (rad !== -1 && rad !== 10) return 0;
      return n;
    }
    if (rad <= 0 || rad === 10) n += borgLaunchBoltAuxHack(ctx, fs, ag.kill, dam, typ, ammo);
    if (rad !== -1 && rad !== 10 && x === x2 && y === y2) break;
    if (!rad && ag.kill) return n;
    if (!trait3(ctx, 37 /* ESP */)) {
      if (trait3(ctx, 52 /* INFRA */) <= 0 && !factsHasLight(facts0)) {
        if (ag.feat === FEAT.NONE) {
          if (rad !== -1 && rad !== 10) return 0;
          return n;
        }
      }
      if (fs.successfulTarget < 0) {
        if (fs.successfulTarget <= -12) fs.successfulTarget = 0;
        if (rad !== -1 && rad !== 10) return 0;
        return n;
      }
    } else if (fs.successfulTarget < 0) {
      if (fs.successfulTarget <= -12) fs.successfulTarget = 0;
      if (rad !== -1 && rad !== 10) return 0;
      return n;
    }
  }
  if (rad <= 0) return n;
  if (dist4 >= max) return 0;
  for (let ry = y2 - rad; ry < y2 + rad; ry++) {
    for (let rx = x2 - rad; rx < x2 + rad; rx++) {
      if (!squareInBounds2(rx, ry)) continue;
      const ag = ctx.world.map.at(rx, ry);
      let r = dist2(y2, x2, ry, rx);
      if (r > rad) continue;
      if (!borgLos(ctx.world, y2, x2, ry, rx)) continue;
      if (rad === 10) r = 0;
      n += borgLaunchBoltAuxHack(ctx, fs, ag.kill, idiv(dam, r + 1), typ, ammo);
      if (ag.take && ctx.world.takes.has(ag.take)) n -= borgLaunchDestroyStuff(ctx, ag.take, typ);
    }
  }
  return n;
}
function factsHasLight(_facts) {
  return false;
}
function killAtGrid(ctx, y, x) {
  if (!ctx.world.map.inBounds(x, y)) return 0;
  return ctx.world.map.at(x, y).kill;
}
function squareInBounds2(x, y) {
  return x >= 0 && x < AUTO_MAX_X && y >= 0 && y < AUTO_MAX_Y;
}
function squareInBoundsFully2(x, y) {
  return x >= 1 && x < AUTO_MAX_X - 1 && y >= 1 && y < AUTO_MAX_Y - 1;
}
function dist2(y1, x1, y2, x2) {
  return Math.max(iabs(y1 - y2), iabs(x1 - x2));
}
function borgLaunchBolt(ctx, fs, rad, dam, typ, max, ammo) {
  const g = getDangerGlobals(ctx.world);
  let bI = -1;
  let bN = -1;
  let bOy = 0;
  let bOx = 0;
  let bD = maxRange2(ctx);
  for (let i = 0; i < fs.tempN; i++) {
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const x = fs.tempX[i] + ox;
        const y = fs.tempY[i] + oy;
        g.tpOtherIndices.length = 0;
        let n = 0;
        if (!squareInBounds2(x, y)) continue;
        const d = dist2(ctx.world.self.c.y, ctx.world.self.c.x, fs.tempY[i], fs.tempX[i]);
        if ((x !== fs.tempX[i] || y !== fs.tempY[i]) && typ === 45 /* AWAY_ALL */) continue;
        if (dist2(ctx.world.self.c.y, ctx.world.self.c.x, y, x) > max) continue;
        if (rad >= 2 && ctx.world.map.inBounds(x, y) && ctx.world.map.at(x, y).feat !== FEAT.NONE || y === fs.tempY[i] && x === fs.tempX[i])
          n = borgLaunchBoltAtLocation(ctx, fs, y, x, rad, dam, typ, max, ammo);
        if (typ === 45 /* AWAY_ALL */ && n > 0) {
          n = borgDanger(ctx, ctx.world.self.c.y, ctx.world.self.c.x, 1, true, false);
          n = dam - n;
        }
        g.tpOtherIndices.length = 0;
        if (n <= 0) continue;
        if (x === 0 || y === 0 || x === ctx.world.map.width - 1 || y === ctx.world.map.height - 1) continue;
        if (bI >= 0 && n < bN) continue;
        if (n === bN && d > bD) continue;
        bI = i;
        bN = n;
        bOy = oy;
        bOx = ox;
        bD = d;
      }
    }
  }
  if (bI === -1) return bN;
  g.tpOtherIndices.length = 0;
  if (fs.simulate) return bN;
  const gx = fs.tempX[bI] + bOx;
  const gy = fs.tempY[bI] + bOy;
  ctx.world.self.goal.g.x = gx;
  ctx.world.self.goal.g.y = gy;
  const requireMonster = typ === 58 /* CURSE */;
  borgTarget(ctx, gy, gx, requireMonster);
  return bN;
}
function borgLaunchArcAtLocation(ctx, fs, y2, x2, degrees, dam, typ, max) {
  let n = 0;
  const x1 = ctx.world.self.c.x;
  const y1 = ctx.world.self.c.y;
  if (!squareInBoundsFully2(x2, y2)) return 0;
  const kill0 = killAtGrid(ctx, y2, x2);
  const facts0 = kill0 ? factsOf(ctx, kill0) : null;
  const pathGrids = [{ y: y1, x: x1 }];
  let x = x1;
  let y = y1;
  let dist4 = 1;
  for (; dist4 < max; dist4++) {
    [y, x] = borgIncMotion(y, x, y1, x1, y2, x2);
    if (!squareInBoundsFully2(x, y)) break;
    const ag = ctx.world.map.at(x, y);
    if (!borgCaveFloorGrid(ag) || ag.feat === FEAT.PASS_RUBBLE) break;
    pathGrids[dist4] = { y, x };
    if (x === x2 && y === y2) break;
    if (ag.feat === FEAT.NONE) {
      if (trait3(ctx, 37 /* ESP */)) {
        if (trait3(ctx, 52 /* INFRA */) <= 0 && !factsHasLight(facts0)) break;
      }
      if (fs.successfulTarget < 0) {
        if (fs.successfulTarget <= -12) fs.successfulTarget = 0;
        break;
      }
    }
  }
  if (dist4 < 21) dist4 = dist4 - 1;
  else dist4 = 20;
  const end = pathGrids[dist4] ?? { y, x };
  const centreAngle = angleTo(end.y - y1, end.x - x1);
  for (let ry = y1 - max; ry < y1 + max; ry++) {
    for (let rx = x1 - max; rx < x1 + max; rx++) {
      if (!squareInBounds2(rx, ry)) continue;
      const ag = ctx.world.map.at(rx, ry);
      const r = dist2(y1, x1, ry, rx);
      if (r > max) continue;
      if (!borgLos(ctx.world, y1, x1, ry, rx)) continue;
      const gridAngle = angleTo(ry - y1, rx - x1);
      let diff = iabs(centreAngle - gridAngle);
      if (diff > 180) diff = 360 - diff;
      if (diff >= idiv(degrees + 6, 4)) continue;
      if (ag.kill) n += borgLaunchBoltAuxHack(ctx, fs, ag.kill, idiv(dam, r + 1), typ, null);
      if (ag.take && ctx.world.takes.has(ag.take)) n -= borgLaunchDestroyStuff(ctx, ag.take, typ);
    }
  }
  return n;
}
function angleTo(dy, dx) {
  const a = Math.atan2(dy, dx) * 180 / Math.PI;
  return a < 0 ? a + 360 : a;
}
function borgLaunchArc(ctx, fs, degrees, dam, typ, maxIn) {
  let max = maxIn;
  if (max > 20) max = 20;
  let bI = -1;
  let bN = -1;
  let bD = maxRange2(ctx);
  for (let i = 0; i < fs.tempN; i++) {
    const x = fs.tempX[i];
    const y = fs.tempY[i];
    const d = dist2(ctx.world.self.c.y, ctx.world.self.c.x, y, x);
    if (d > max) continue;
    const n = borgLaunchArcAtLocation(ctx, fs, y, x, degrees, dam, typ, max);
    if (n <= 0) continue;
    if (bI >= 0 && n < bN) continue;
    if (n === bN && d > bD) continue;
    bI = i;
    bN = n;
    bD = d;
  }
  if (bI === -1) return bN;
  if (fs.simulate) return bN;
  const gx = fs.tempX[bI];
  const gy = fs.tempY[bI];
  ctx.world.self.goal.g.x = gx;
  ctx.world.self.goal.g.y = gy;
  borgTarget(ctx, gy, gx, false);
  return bN;
}
function auxThrust(ctx, fs) {
  if (trait3(ctx, 113 /* ISAFRAID */) || trait3(ctx, 186 /* CRSFEAR */)) return 0;
  let bI = -1;
  let bD = -1;
  for (let i = 0; i < fs.tempN; i++) {
    const x = fs.tempX[i];
    const y = fs.tempY[i];
    if (dist(ctx.world.self.c.y, ctx.world.self.c.x, y, x) > 1) continue;
    const ag = ctx.world.map.at(x, y);
    let d = borgThrustDamageOne(ctx, ag.kill);
    if (d <= 0) continue;
    const kill = ctx.world.kills.at(ag.kill);
    if (!kill.awake && d <= kill.power && !ctx.world.self.munchkinMode) {
      const p2 = borgDangerOneKill(ctx, y, x, 1, ag.kill, true, true);
      if (p2 > avoidance2(ctx) * 2) continue;
    }
    if (!trait3(ctx, 105 /* CDEPTH */) && !kill.awake) continue;
    let p = borgDangerOneKill(ctx, ctx.world.self.c.y, ctx.world.self.c.x, 2, ag.kill, true, true);
    if (d <= kill.power && trait3(ctx, 36 /* MAXCLEVEL */) > 15) p = idiv(p, 10);
    d += p;
    if (bI >= 0 && d < bD) continue;
    bI = i;
    bD = d;
  }
  if (bI < 0) return 0;
  if (fs.simulate) return bD;
  ctx.world.self.goal.g.x = fs.tempX[bI];
  ctx.world.self.goal.g.y = fs.tempY[bI];
  const dir = borgExtractDir(ctx.world.self.c.y, ctx.world.self.c.x, ctx.world.self.goal.g.y, ctx.world.self.goal.g.x);
  fs.pending = ctx.act.melee(dir);
  return bD;
}
function auxLaunch(ctx, fs) {
  const bow = findBow(ctx);
  if (!bow) return 0;
  if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */) || trait3(ctx, 120 /* ISIMAGE */)) return 0;
  let bN = 0;
  let bV = -1;
  let bAmmo = null;
  const ammoTval = trait3(ctx, 152 /* AMMO_TVAL */);
  for (const item of ctx.view.inventory()) {
    if (item.number <= 0) continue;
    if (item.tval !== ammoTval) continue;
    if ((item.value ?? 0) <= 0) continue;
    let d = idiv(item.dd * (item.ds + 1), 2);
    d = d + item.toD + bow.toD;
    d = d * trait3(ctx, 154 /* AMMO_POWER */) * trait3(ctx, 148 /* SHOTS */);
    const v = item.value ?? 0;
    if (d <= 0) continue;
    const n = borgLaunchBolt(ctx, fs, 0, d, 1 /* ARROW */, 6 + 2 * trait3(ctx, 154 /* AMMO_POWER */), item);
    if (n === bN && v >= bV) continue;
    if (n >= bN) {
      bN = n;
      bV = v;
      bAmmo = item;
    }
  }
  if (bN < 0) return 0;
  if (fs.simulate) return bN;
  if (bAmmo) {
    borgLaunchBolt(ctx, fs, 0, 1, 1 /* ARROW */, 6 + 2 * trait3(ctx, 154 /* AMMO_POWER */), bAmmo);
    fs.pending = ctx.act.fire(bAmmo.handle);
    fs.successfulTarget = -2;
  }
  return bN;
}
function auxObject(ctx, fs) {
  let bK = null;
  let bD = -1;
  for (const item of ctx.view.inventory()) {
    if (item.number <= 0) continue;
    if (item.tval === TV.MAGIC_BOOK || item.tval === TV.PRAYER_BOOK) continue;
    const d = idiv(item.dd * (item.ds + 1), 2);
    if ((item.value ?? 0) > 100 && d < 5) continue;
    if (d <= 0) continue;
    if (item.tval === TV.POTION) continue;
    if (item.tval === TV.FLASK && trait3(ctx, 213 /* AFUEL */) <= 1 && !fs.fightingUnique) continue;
    if (item.tval === TV.WAND || item.tval === TV.ROD) continue;
    if (bK && d <= bD) continue;
    bK = item;
    bD = d;
  }
  if (!bK) return 0;
  if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */) || trait3(ctx, 120 /* ISIMAGE */)) return 0;
  const bN = borgLaunchBolt(ctx, fs, 0, bD, 1 /* ARROW */, 6 + 2 * trait3(ctx, 154 /* AMMO_POWER */), bK);
  if (fs.simulate) return bN;
  fs.pending = ctx.act.throw(bK.handle);
  fs.successfulTarget = -2;
  return bN;
}
function auxRest(ctx, fs) {
  if (fs.simulate && ctx.world.self.goal.waiting) {
    ctx.world.self.goal.waiting = false;
    return 0;
  }
  const myDanger = borgDanger(ctx, ctx.world.self.c.y, ctx.world.self.c.x, 1, false, false);
  let found = false;
  for (const [i, kill] of ctx.world.kills.entries()) {
    const facts = factsOf(ctx, i);
    const ax = iabs(kill.pos.x - ctx.world.self.c.x);
    const ay = iabs(kill.pos.y - ctx.world.self.c.y);
    const d = Math.max(ax, ay);
    if (d !== 2) continue;
    if (kill.rangedAttack) continue;
    if (!kill.awake) continue;
    if (ctx.world.clock - kill.when > 10) continue;
    if (rf(facts, "NEVER_MOVE")) continue;
    if (kill.speed - trait3(ctx, 44 /* SPEED */) >= 5) continue;
    if (kill.afraid || kill.confused || kill.stunned) continue;
    if (ctx.world.self.goal.type !== GOAL_KILL) continue;
    if (!borgLos(ctx.world, ctx.world.self.c.y, ctx.world.self.c.x, kill.pos.y, kill.pos.x)) continue;
    if (myDanger > trait3(ctx, 27 /* CURHP */)) continue;
    found = true;
    break;
  }
  if (!found) return 0;
  if (fs.simulate) return 1;
  fs.pending = ctx.act.hold();
  ctx.world.self.goal.waiting = true;
  return 1;
}
function primarySpellForClass(ctx) {
  switch (trait3(ctx, 25 /* CLASS */)) {
    case CLASS_MAGE:
      return 0 /* MAGIC_MISSILE */;
    case CLASS_DRUID:
      return 33 /* STINKING_CLOUD */;
    case CLASS_PRIEST:
      return 63 /* ORB_OF_DRAINING */;
    case CLASS_NECROMANCER:
      return 85 /* NETHER_BOLT */;
    default:
      return 0 /* MAGIC_MISSILE */;
  }
}
function teleportReserve(ctx) {
  switch (trait3(ctx, 25 /* CLASS */)) {
    case CLASS_MAGE:
      return 6;
    case CLASS_RANGER:
      return 22;
    case CLASS_ROGUE:
      return 20;
    case CLASS_PRIEST:
      return 8;
    case CLASS_PALADIN:
      return 20;
    case CLASS_NECROMANCER:
      return 10;
    default:
      return 0;
  }
}
function auxSpellBolt(ctx, fs, spell, rad, dam, typ, maxR, isArc) {
  if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */) || trait3(ctx, 120 /* ISIMAGE */)) return 0;
  if (fs.simulate && trait3(ctx, 25 /* CLASS */) !== CLASS_MAGE && trait3(ctx, 25 /* CLASS */) !== CLASS_NECROMANCER && trait3(ctx, 35 /* CLEVEL */) <= 2 && ctx.rng.randint0(100) < 1)
    return 0;
  if (trait3(ctx, 39 /* FOOD */) === 0 && trait3(ctx, 108 /* ISWEAK */) && (borgSpellLegal(ctx, 32 /* REMOVE_HUNGER */) || borgSpellLegal(ctx, 51 /* HERBAL_CURING */)))
    return 0;
  if (!borgSpellOkayFail(ctx, spell, fs.fightingUnique ? 40 : 25)) return 0;
  let bN = isArc ? borgLaunchArc(ctx, fs, rad, dam, typ, maxR) : borgLaunchBolt(ctx, fs, rad, dam, typ, maxR, null);
  const primary = primarySpellForClass(ctx);
  if (spell === primary && (!borgSpellLegalFail(ctx, 14 /* TELEPORT_SELF */, 15) || trait3(ctx, 36 /* MAXCLEVEL */) <= 30)) {
    if (fs.simulate) return bN;
  } else {
    const spellPower = borgGetSpellPower(ctx, spell);
    if (spell !== primary) {
      bN = bN - spellPower;
      if (trait3(ctx, 31 /* MAXSP */) < 50 && spellPower > bN) bN = bN - spellPower;
      if (trait3(ctx, 30 /* CURSP */) - spellPower < idiv(trait3(ctx, 31 /* MAXSP */), 2)) bN = bN - spellPower * 3;
      if (trait3(ctx, 30 /* CURSP */) - spellPower < idiv(trait3(ctx, 31 /* MAXSP */), 3)) bN = bN - spellPower * 5;
    }
    const penalty = teleportReserve(ctx);
    if (trait3(ctx, 31 /* MAXSP */) > 30 && trait3(ctx, 30 /* CURSP */) - spellPower < penalty) bN = bN - spellPower * 750;
  }
  if (fs.simulate) return bN;
  fs.pending = borgSpell(ctx, spell);
  fs.successfulTarget = -1;
  return bN;
}
function auxSpellBoltReserve(ctx, fs, spell, rad, dam, typ, maxR) {
  if (trait3(ctx, 35 /* CLEVEL */) >= 15) return 0;
  if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */) || trait3(ctx, 120 /* ISIMAGE */)) return 0;
  if (trait3(ctx, 39 /* FOOD */) === 0 && trait3(ctx, 108 /* ISWEAK */) && borgSpellLegal(ctx, 32 /* REMOVE_HUNGER */)) return 0;
  if (borgSpellOkayFail(ctx, spell, 25)) return 0;
  if (borgDanger(ctx, ctx.world.self.c.y, ctx.world.self.c.x, 1, true, false) < avoidance2(ctx) * 2) return 0;
  let nearMonsters = 0;
  for (const [, kill] of ctx.world.kills.entries()) {
    const d = dist(ctx.world.self.c.y, ctx.world.self.c.x, kill.pos.y, kill.pos.x);
    if (d < 7) nearMonsters++;
    if (kill.power > dam + 4) return 0;
    if (trait3(ctx, 105 /* CDEPTH */) === 0) return 0;
    break;
  }
  if (nearMonsters > 1) return 0;
  if (!borgSpellLegalFail(ctx, spell, 25)) return 0;
  const bN = borgLaunchBolt(ctx, fs, rad, dam, typ, maxR, null);
  if (fs.simulate) return bN;
  fs.pending = borgSpellFail(ctx, spell, 25);
  fs.successfulTarget = -1;
  return bN;
}
function auxSpellDispel(ctx, fs, spell, dam, typ) {
  if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */) || trait3(ctx, 120 /* ISIMAGE */)) return 0;
  if (trait3(ctx, 39 /* FOOD */) === 0 && trait3(ctx, 108 /* ISWEAK */) && (borgSpellLegal(ctx, 32 /* REMOVE_HUNGER */) || borgSpellLegal(ctx, 51 /* HERBAL_CURING */)))
    return 0;
  if (fs.simulate && ctx.rng.randint0(100) < 2) return 0;
  if (!borgSpellOkayFail(ctx, spell, 25)) return 0;
  let bN = borgLaunchBolt(ctx, fs, 10, dam, typ, maxRange2(ctx), null);
  const spellPower = borgGetSpellPower(ctx, spell);
  bN = bN - spellPower;
  if (trait3(ctx, 30 /* CURSP */) - spellPower < idiv(trait3(ctx, 31 /* MAXSP */), 2)) bN = bN - spellPower * 3;
  if (trait3(ctx, 30 /* CURSP */) - spellPower < idiv(trait3(ctx, 31 /* MAXSP */), 3)) bN = bN - spellPower * 5;
  const penalty = teleportReserve(ctx);
  if (trait3(ctx, 31 /* MAXSP */) > 30 && trait3(ctx, 30 /* CURSP */) - spellPower < penalty) bN = bN - spellPower * 750;
  if (trait3(ctx, 31 /* MAXSP */) > 30 && trait3(ctx, 30 /* CURSP */) - spellPower < 6) bN = bN - spellPower * 750;
  if (fs.targetClosest < 0 && typ === 55 /* TAP_UNLIFE */ && bN > 0) {
    fs.targetClosest = 0;
    return 0;
  }
  if (fs.simulate) return bN;
  fs.pending = borgSpell(ctx, spell);
  return bN;
}
function auxStaffDispel(ctx, fs, sval, rad, dam, typ) {
  if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */) || trait3(ctx, 120 /* ISIMAGE */)) return 0;
  if (fs.simulate && ctx.rng.randint0(100) < 2) return 0;
  if (!borgEquipsStaffFail(ctx, sval)) return 0;
  let bN = borgLaunchBolt(ctx, fs, rad, dam, typ, maxRange2(ctx), null);
  bN = bN - 50;
  if (fs.simulate) return bN;
  fs.pending = borgUseStaff(ctx, sval);
  return bN;
}
function auxRodBolt(ctx, fs, sval, rad, dam, typ) {
  if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */) || trait3(ctx, 120 /* ISIMAGE */)) return 0;
  if (fs.simulate && ctx.rng.randint0(100) < 2) return 0;
  if (500 < borgActivateFailure(ctx, TV.ROD, sval)) return 0;
  if (!borgEquipsRod(ctx, sval)) return 0;
  const bN = borgLaunchBolt(ctx, fs, rad, dam, typ, maxRange2(ctx), null);
  if (fs.simulate) return bN;
  fs.pending = borgZapRod(ctx, sval);
  fs.successfulTarget = -1;
  return bN;
}
function auxWandBolt(ctx, fs, sval, rad, dam, typ) {
  if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */) || trait3(ctx, 120 /* ISIMAGE */)) return 0;
  if (!trait3(ctx, 105 /* CDEPTH */)) return 0;
  if (fs.simulate && ctx.rng.randint0(100) < 2) return 0;
  const item = borgSlot(ctx, TV.WAND, sval);
  if (!item) return 0;
  if (!item.pval) return 0;
  if (500 < borgActivateFailure(ctx, TV.WAND, sval)) return 0;
  let bN = borgLaunchBolt(ctx, fs, rad, dam, typ, maxRange2(ctx), null);
  if (trait3(ctx, 35 /* CLEVEL */) > 5) bN = bN - 5;
  if (sval === SVAL.wand.wonder && !ctx.world.self.munchkinMode) {
    if (bN > 0 && borgDanger(ctx, ctx.world.self.c.y, ctx.world.self.c.x, 1, true, false) >= idiv(avoidance2(ctx) * 7, 10))
      bN = 999;
    else bN = 0;
  }
  if (fs.simulate) return bN;
  fs.pending = borgAimWand(ctx, sval);
  fs.successfulTarget = -1;
  return bN;
}
function auxWandUnknown(ctx, fs, dam, typ) {
  if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */) || trait3(ctx, 120 /* ISIMAGE */)) return 0;
  if (fs.simulate && ctx.rng.randint0(100) < 5) return 0;
  let bItem = null;
  for (const item of ctx.view.inventory()) {
    if (item.number <= 0) continue;
    if (item.tval !== TV.WAND) continue;
    if (!item.pval) continue;
    bItem = item;
  }
  if (!bItem) return 0;
  const bN = borgLaunchBolt(ctx, fs, 0, dam, typ, maxRange2(ctx), null);
  if (fs.simulate) return bN;
  fs.pending = ctx.act.aimWand(bItem.handle);
  fs.successfulTarget = -1;
  return bN;
}
function auxRodUnknown(ctx, fs, dam, typ) {
  if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */) || trait3(ctx, 120 /* ISIMAGE */)) return 0;
  if (fs.simulate && ctx.rng.randint0(100) < 5) return 0;
  let bItem = null;
  for (const item of ctx.view.inventory()) {
    if (item.number <= 0) continue;
    if (item.tval !== TV.ROD) continue;
    if (!item.pval) continue;
    bItem = item;
  }
  if (!bItem) return 0;
  const bN = borgLaunchBolt(ctx, fs, 0, dam, typ, maxRange2(ctx), null);
  if (fs.simulate) return bN;
  fs.pending = ctx.act.zapRod(bItem.handle);
  fs.successfulTarget = -1;
  return bN;
}
function auxActivation(ctx, fs, act, rad, dam, typ, aim) {
  if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */) || trait3(ctx, 120 /* ISIMAGE */)) return 0;
  if (fs.simulate && ctx.rng.randint0(100) < 2) return 0;
  if (!borgEquipsItem(ctx, act, true)) return 0;
  const bN = borgLaunchBolt(ctx, fs, rad, dam, typ, maxRange2(ctx), null);
  if (fs.simulate) return bN;
  fs.pending = borgActivateItem(ctx, act);
  if (aim) fs.successfulTarget = -1;
  return bN;
}
function auxActivationMulti(ctx, fs, act, rad, dam, types) {
  const savedSim = fs.simulate;
  fs.simulate = true;
  const values = types.map((t) => auxActivation(ctx, fs, act, rad, dam, t, true));
  let biggest = 0;
  for (let x = 1; x < values.length; x++) if (values[x] > values[biggest]) biggest = x;
  fs.simulate = savedSim;
  if (!fs.simulate) return auxActivation(ctx, fs, act, rad, dam, types[biggest], true);
  return values[biggest];
}
function auxArtifactHolcolleth(ctx, fs) {
  if (!borgEquipsItem(ctx, "act_sleepii", true)) return 0;
  const g = getDangerGlobals(ctx.world);
  const { x, y } = ctx.world.self.c;
  g.sleepSpellIi = false;
  const p1 = borgDanger(ctx, y, x, 4, true, false);
  g.sleepSpellIi = true;
  const p2 = borgDanger(ctx, y, x, 4, true, false);
  g.sleepSpellIi = false;
  const d = p1 - p2;
  if (fs.simulate) return d;
  fs.pending = borgActivateItem(ctx, "act_sleepii");
  return fs.pending ? d : 0;
}
function auxRing(ctx, fs, ringSval, rad, dam, typ) {
  if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */) || trait3(ctx, 120 /* ISIMAGE */)) return 0;
  if (fs.simulate && ctx.rng.randint0(100) < 2) return 0;
  if (!borgEquipsRing(ctx, ringSval)) return 0;
  const bN = borgLaunchBolt(ctx, fs, rad, dam, typ, maxRange2(ctx), null);
  if (fs.simulate) return bN;
  fs.pending = borgActivateRing(ctx, ringSval);
  fs.successfulTarget = -1;
  return bN;
}
function auxDragon(ctx, fs, sval, rad, dam, typ) {
  if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */) || trait3(ctx, 120 /* ISIMAGE */)) return 0;
  if (fs.simulate && ctx.rng.randint0(100) < 2) return 0;
  if (!borgEquipsDragon(ctx, sval)) return 0;
  const bN = borgLaunchArc(ctx, fs, rad, dam, typ, maxRange2(ctx));
  if (fs.simulate) return bN;
  fs.pending = borgActivateDragon(ctx, sval);
  fs.successfulTarget = -1;
  return bN;
}
function auxWhirlwind(ctx, fs) {
  if (!borgSpellOkayFail(ctx, 120 /* WHIRLWIND_ATTACK */, fs.fightingUnique ? 40 : 25)) return 0;
  const blows = idiv(trait3(ctx, 35 /* CLEVEL */) + 10, 15);
  let totalD = 0;
  for (let i = 0; i < fs.tempN; i++) {
    const x = fs.tempX[i];
    const y = fs.tempY[i];
    if (dist(ctx.world.self.c.y, ctx.world.self.c.x, y, x) > 1) continue;
    const ag = ctx.world.map.at(x, y);
    let d = borgThrustDamageOne(ctx, ag.kill);
    if (d <= 0) continue;
    d = d * blows;
    const kill = ctx.world.kills.at(ag.kill);
    if (!kill.awake && d <= kill.power && !ctx.world.self.munchkinMode) {
      const p2 = borgDangerOneKill(ctx, y, x, 1, ag.kill, true, true);
      if (p2 > avoidance2(ctx) * 2) continue;
    }
    if (!trait3(ctx, 105 /* CDEPTH */) && !kill.awake) continue;
    let p = borgDangerOneKill(ctx, ctx.world.self.c.y, ctx.world.self.c.x, 2, ag.kill, true, true);
    if (d <= kill.power && trait3(ctx, 36 /* MAXCLEVEL */) > 15) p = idiv(p, 10);
    d += p;
    totalD += d;
  }
  if (totalD < 0) return 0;
  if (fs.simulate) return totalD;
  fs.pending = borgSpell(ctx, 120 /* WHIRLWIND_ATTACK */);
  return fs.pending ? totalD : 0;
}
function auxCrush(ctx, fs) {
  const g = getDangerGlobals(ctx.world);
  if (!borgSpellOkay(ctx, 90 /* CRUSH */)) return 0;
  if (trait3(ctx, 27 /* CURHP */) + 10 < trait3(ctx, 35 /* CLEVEL */) * 4) return 0;
  g.crushSpell = false;
  const p1 = borgDanger(ctx, ctx.world.self.c.y, ctx.world.self.c.x, 4, true, false);
  g.crushSpell = true;
  const p2 = borgDanger(ctx, ctx.world.self.c.y, ctx.world.self.c.x, 4, true, false);
  g.crushSpell = false;
  let d = p1 - p2;
  const newHp = trait3(ctx, 27 /* CURHP */) - trait3(ctx, 35 /* CLEVEL */) * 2;
  if (fs.simulate && (p2 >= newHp * 2 || newHp <= 50)) return 0;
  const spellPower = borgGetSpellPower(ctx, 90 /* CRUSH */);
  d = d - spellPower;
  if (trait3(ctx, 30 /* CURSP */) - spellPower < idiv(trait3(ctx, 31 /* MAXSP */), 2)) d = d - spellPower * 10;
  if (fs.simulate) return d;
  fs.pending = borgSpell(ctx, 90 /* CRUSH */);
  return fs.pending ? d : 0;
}
function auxTrance(ctx, fs) {
  const g = getDangerGlobals(ctx.world);
  if (!borgSpellOkay(ctx, 42 /* TRANCE */)) return 0;
  g.sleepSpellIi = false;
  const p1 = borgDanger(ctx, ctx.world.self.c.y, ctx.world.self.c.x, 4, true, false);
  g.sleepSpellIi = true;
  const p2 = borgDanger(ctx, ctx.world.self.c.y, ctx.world.self.c.x, 4, true, false);
  g.sleepSpellIi = false;
  let d = p1 - p2;
  const spellPower = borgGetSpellPower(ctx, 42 /* TRANCE */);
  d = d - spellPower;
  if (trait3(ctx, 30 /* CURSP */) - spellPower < idiv(trait3(ctx, 31 /* MAXSP */), 2)) d = d - spellPower * 10;
  if (fs.simulate) return d;
  fs.pending = borgSpell(ctx, 42 /* TRANCE */);
  return fs.pending ? d : 0;
}
function borgCalculateAttackEffectiveness(ctx, fs, attackType) {
  const cl = trait3(ctx, 35 /* CLEVEL */);
  const mr = maxRange2(ctx);
  let rad = 0;
  let dam = 0;
  switch (attackType) {
    case 0 /* REST */:
      return auxRest(ctx, fs);
    case 1 /* THRUST */:
      return auxThrust(ctx, fs);
    case 3 /* LAUNCH */:
      return auxLaunch(ctx, fs);
    case 2 /* OBJECT */:
      return auxObject(ctx, fs);
    case 10 /* SPELL_SLOW_MONSTER */:
      return auxSpellBolt(ctx, fs, 35 /* SLOW_MONSTER */, 0, 10, 50 /* OLD_SLOW */, mr, false);
    case 15 /* SPELL_CONFUSE_MONSTER */:
      return auxSpellBolt(ctx, fs, 34 /* CONFUSE_MONSTER */, 0, 10, 48 /* OLD_CONF */, mr, false);
    case 11 /* SPELL_SLEEP_III */:
      return auxSpellDispel(ctx, fs, 43 /* MASS_SLEEP */, 10, 51 /* OLD_SLEEP */);
    case 4 /* SPELL_MAGIC_MISSILE */:
      dam = idiv((idiv(cl - 1, 5) + 3) * (4 + 1), 2);
      return auxSpellBolt(ctx, fs, 0 /* MAGIC_MISSILE */, 0, dam, 0 /* MISSILE */, mr, false);
    case 5 /* SPELL_MAGIC_MISSILE_RESERVE */:
      dam = (idiv(cl - 1, 5) + 3) * (4 + 1);
      return auxSpellBoltReserve(ctx, fs, 0 /* MAGIC_MISSILE */, 0, dam, 0 /* MISSILE */, mr);
    case 8 /* SPELL_COLD_BOLT */:
      dam = idiv((idiv(cl - 5, 3) + 6) * (8 + 1), 2);
      return auxSpellBolt(ctx, fs, 10 /* FROST_BOLT */, 0, dam, 7 /* COLD */, mr, false);
    case 9 /* SPELL_STONE_TO_MUD */:
      dam = 20 + idiv(30, 2);
      return auxSpellBolt(ctx, fs, 38 /* TURN_STONE_TO_MUD */, 0, dam, 18 /* KILL_WALL */, mr, false);
    case 7 /* SPELL_LIGHT_BEAM */:
      dam = idiv(6 * (8 + 1), 2);
      return auxSpellBolt(ctx, fs, 64 /* SPEAR_OF_LIGHT */, -1, dam, 16 /* LIGHT_WEAK */, mr, false);
    case 6 /* SPELL_STINK_CLOUD */:
      dam = 10 + idiv(cl, 2);
      return auxSpellBolt(ctx, fs, 33 /* STINKING_CLOUD */, 2, dam, 8 /* POIS */, mr, false);
    case 12 /* SPELL_FIRE_BALL */:
      dam = cl * 2;
      return auxSpellBolt(ctx, fs, 6 /* FIRE_BALL */, 2, dam, 6 /* FIRE */, mr, false);
    case 16 /* SPELL_COLD_STORM */:
      dam = idiv(3 * (cl * 3 + 1), 2);
      return auxSpellDispel(ctx, fs, 54 /* ICE_STORM */, dam, 9 /* ICE */);
    case 17 /* SPELL_METEOR_SWARM */:
      dam = 30 + idiv(cl, 2) + idiv(cl, 20) + 2;
      return auxSpellBolt(ctx, fs, 52 /* METEOR_SWARM */, 1, dam, 3 /* METEOR */, mr, false);
    case 18 /* SPELL_RIFT */:
      dam = cl * 3 + 40;
      return auxSpellBolt(ctx, fs, 53 /* RIFT */, -1, dam, 21 /* GRAVITY */, mr, false);
    case 19 /* SPELL_MANA_STORM */:
      dam = 300 + cl * 2;
      return auxSpellBolt(ctx, fs, 29 /* MANA_STORM */, 3, dam, 2 /* MANA */, mr, false);
    case 13 /* SPELL_SHOCK_WAVE */:
      dam = cl * 2;
      return auxSpellBolt(ctx, fs, 25 /* SHOCK_WAVE */, 2, dam, 23 /* SOUND */, mr, false);
    case 14 /* SPELL_EXPLOSION */:
      dam = cl * 2 + idiv(cl, 5);
      return auxSpellBolt(ctx, fs, 26 /* EXPLOSION */, 2, dam, 22 /* SHARD */, mr, false);
    case 22 /* PRAYER_HOLY_ORB_BALL */:
      rad = cl >= 30 ? 3 : 2;
      dam = idiv(cl * 3, 2) + idiv(3 * (6 + 1), 2);
      return auxSpellBolt(ctx, fs, 63 /* ORB_OF_DRAINING */, rad, dam, 10 /* HOLY_ORB */, mr, false);
    case 20 /* SPELL_BLIND_CREATURE */:
      return auxSpellBolt(ctx, fs, 94 /* FRIGHTEN */, 0, 10, 48 /* OLD_CONF */, mr, false);
    case 21 /* SPELL_TRANCE */:
      return auxTrance(ctx, fs);
    case 23 /* PRAYER_DISP_UNDEAD */:
      dam = idiv(cl * 5 + 1, 2);
      return auxSpellDispel(ctx, fs, 65 /* DISPEL_UNDEAD */, dam, 11 /* DISP_UNDEAD */);
    case 24 /* PRAYER_DISP_EVIL */:
      dam = idiv(cl * 5 + 1, 2);
      return auxSpellDispel(ctx, fs, 66 /* DISPEL_EVIL */, dam, 12 /* DISP_EVIL */);
    case 25 /* PRAYER_DISP_SPIRITS */:
      return auxSpellDispel(ctx, fs, 99 /* BANISH_SPIRITS */, 100, 13 /* DISP_SPIRITS */);
    case 26 /* PRAYER_HOLY_WORD */:
      if (trait3(ctx, 28 /* MAXHP */) - trait3(ctx, 27 /* CURHP */) >= 300) {
        dam = cl * 10;
        return auxSpellDispel(ctx, fs, 82 /* HOLY_WORD */, dam, 12 /* DISP_EVIL */);
      }
      dam = idiv(cl * 3, 2) - 50;
      return auxSpellDispel(ctx, fs, 66 /* DISPEL_EVIL */, dam, 12 /* DISP_EVIL */);
    case 27 /* SPELL_ANNIHILATE */:
      dam = cl * 4;
      return auxSpellBolt(ctx, fs, 100 /* ANNIHILATE */, 0, dam, 17 /* OLD_DRAIN */, mr, false);
    case 28 /* SPELL_ELECTRIC_ARC */:
      dam = idiv((idiv(cl - 1, 5) + 3) * (6 + 1), 2);
      return auxSpellBolt(ctx, fs, 4 /* ELECTRIC_ARC */, 0, dam, 5 /* ELEC */, cl, false);
    case 29 /* SPELL_ACID_SPRAY */:
      dam = idiv(idiv(cl, 2) * (8 + 1), 2);
      return auxSpellBolt(ctx, fs, 12 /* ACID_SPRAY */, 60, dam, 4 /* ACID */, 10, true);
    case 30 /* SPELL_MANA_BOLT */:
      dam = idiv((cl - 10) * (8 + 1), 2);
      return auxSpellBolt(ctx, fs, 20 /* MANA_BOLT */, 0, dam, 2 /* MANA */, mr, false);
    case 31 /* SPELL_THRUST_AWAY */:
      dam = idiv(cl * (8 + 1), 2);
      return auxSpellBolt(ctx, fs, 24 /* THRUST_AWAY */, 0, dam, 28 /* FORCE */, idiv(cl, 10) + 1, false);
    case 32 /* SPELL_LIGHTNING_STRIKE */:
      dam = idiv(idiv(cl, 4) * (4 + 1), 2) + cl + 5;
      return auxSpellBolt(ctx, fs, 40 /* LIGHTNING_STRIKE */, 0, dam, 57 /* ELEC_STRIKE */, mr, false);
    case 33 /* SPELL_EARTH_RISING */:
      dam = idiv((idiv(cl, 3) + 2) * (6 + 1), 2) + cl + 5;
      return auxSpellBolt(ctx, fs, 41 /* EARTH_RISING */, 0, dam, 22 /* SHARD */, idiv(cl, 5) + 4, false);
    case 34 /* SPELL_VOLCANIC_ERUPTION */:
      dam = idiv(idiv(cl * 3, 2) * (cl * 3 + 1), 2);
      return auxSpellBolt(ctx, fs, 55 /* VOLCANIC_ERUPTION */, 0, dam, 6 /* FIRE */, mr, false);
    case 35 /* SPELL_RIVER_OF_LIGHTNING */:
      dam = idiv((cl + 10) * (8 + 1), 2);
      return auxSpellBolt(ctx, fs, 56 /* RIVER_OF_LIGHTNING */, 20, dam, 24 /* PLASMA */, 20, true);
    case 36 /* SPELL_SPEAR_OF_OROME */:
      dam = idiv(idiv(cl, 2) + (8 + 1), 2);
      return auxSpellBolt(ctx, fs, 83 /* SPEAR_OF_OROME */, 0, dam, 10 /* HOLY_ORB */, mr, false);
    case 37 /* SPELL_LIGHT_OF_MANWE */:
      dam = cl * 5 + 100;
      return auxSpellBolt(ctx, fs, 84 /* LIGHT_OF_MANWE */, 0, dam, 31 /* LIGHT */, mr, false);
    case 38 /* SPELL_NETHER_BOLT */:
      dam = idiv((idiv(cl, 4) + 3) * (4 + 1), 2);
      return auxSpellBolt(ctx, fs, 85 /* NETHER_BOLT */, 0, dam, 19 /* NETHER */, mr, false);
    case 39 /* SPELL_TAP_UNLIFE */:
      dam = idiv((idiv(cl, 4) + 3) * (4 + 1), 2);
      return auxSpellDispel(ctx, fs, 89 /* TAP_UNLIFE */, dam, 55 /* TAP_UNLIFE */);
    case 40 /* SPELL_CRUSH */:
      return auxCrush(ctx, fs);
    case 41 /* SPELL_SLEEP_EVIL */:
      dam = cl * 10 + 500;
      return auxSpellDispel(ctx, fs, 91 /* SLEEP_EVIL */, dam, 14 /* SLEEP_EVIL */);
    case 42 /* SPELL_DISENCHANT */:
      dam = idiv(cl * 2 + 10 + 1, 2) * 2;
      return auxSpellBolt(ctx, fs, 93 /* DISENCHANT */, 0, dam, 26 /* DISEN */, mr, false);
    case 43 /* SPELL_FRIGHTEN */:
      dam = cl;
      return auxSpellBolt(ctx, fs, 94 /* FRIGHTEN */, 0, dam, 49 /* TURN_ALL */, mr, false);
    case 44 /* SPELL_VAMPIRE_STRIKE */:
      return auxVampireStrike(ctx, fs);
    case 45 /* PRAYER_DISPEL_LIFE */:
      dam = idiv(cl * 3 + 1, 2);
      return auxSpellBolt(ctx, fs, 96 /* DISPEL_LIFE */, 0, dam, 56 /* DRAIN_LIFE */, mr, false);
    case 46 /* SPELL_DARK_SPEAR */:
      dam = idiv(cl * 2 + 1, 2) * 2;
      return auxSpellBolt(ctx, fs, 97 /* DARK_SPEAR */, 0, dam, 32 /* DARK */, mr, false);
    case 47 /* SPELL_UNLEASH_CHAOS */:
      dam = idiv(cl + 1, 2) * 8;
      return auxSpellBolt(ctx, fs, 102 /* UNLEASH_CHAOS */, 0, dam, 20 /* CHAOS */, mr, false);
    case 48 /* SPELL_STORM_OF_DARKNESS */:
      dam = idiv(cl * 2 + 1, 2) * 4;
      return auxSpellBolt(ctx, fs, 104 /* STORM_OF_DARKNESS */, 4, dam, 32 /* DARK */, mr, false);
    case 49 /* SPELL_CURSE */:
      if (trait3(ctx, 27 /* CURHP */) < 120) return 0;
      return auxSpellBolt(ctx, fs, 108 /* CURSE */, 0, -1, 58 /* CURSE */, mr, false);
    case 50 /* SPELL_WHIRLWIND_ATTACK */:
      return auxWhirlwind(ctx, fs);
    case 51 /* SPELL_LEAP_INTO_BATTLE */:
      return auxLeapIntoBattle(ctx, fs);
    case 52 /* SPELL_MAIM_FOE */:
      return auxMaimFoe(ctx, fs);
    case 53 /* SPELL_HOWL_OF_THE_DAMNED */:
      return auxSpellDispel(ctx, fs, 125 /* HOWL_OF_THE_DAMNED */, cl, 49 /* TURN_ALL */);
    case 64 /* ROD_SLOW_MONSTER */:
      return auxRodBolt(ctx, fs, SVAL.rod.slow_monster, 0, 10, 50 /* OLD_SLOW */);
    case 65 /* ROD_SLEEP_MONSTER */:
      return auxRodBolt(ctx, fs, SVAL.rod.sleep_monster, 0, 10, 51 /* OLD_SLEEP */);
    case 54 /* ROD_ELEC_BOLT */:
      return auxRodBolt(ctx, fs, SVAL.rod.elec_bolt, -1, idiv(6 * (6 + 1), 2), 5 /* ELEC */);
    case 55 /* ROD_COLD_BOLT */:
      return auxRodBolt(ctx, fs, SVAL.rod.cold_bolt, 0, idiv(12 * (8 + 1), 2), 7 /* COLD */);
    case 56 /* ROD_ACID_BOLT */:
      return auxRodBolt(ctx, fs, SVAL.rod.acid_bolt, 0, idiv(12 * (8 + 1), 2), 4 /* ACID */);
    case 57 /* ROD_FIRE_BOLT */:
      return auxRodBolt(ctx, fs, SVAL.rod.fire_bolt, 0, idiv(12 * (8 + 1), 2), 6 /* FIRE */);
    case 58 /* ROD_LIGHT_BEAM */:
      return auxRodBolt(ctx, fs, SVAL.rod.light, -1, idiv(6 * (8 + 1), 2), 16 /* LIGHT_WEAK */);
    case 59 /* ROD_DRAIN_LIFE */:
      return auxRodBolt(ctx, fs, SVAL.rod.drain_life, 0, 150, 17 /* OLD_DRAIN */);
    case 60 /* ROD_ELEC_BALL */:
      return auxRodBolt(ctx, fs, SVAL.rod.elec_ball, 2, 64, 5 /* ELEC */);
    case 61 /* ROD_COLD_BALL */:
      return auxRodBolt(ctx, fs, SVAL.rod.cold_ball, 2, 100, 7 /* COLD */);
    case 62 /* ROD_ACID_BALL */:
      return auxRodBolt(ctx, fs, SVAL.rod.acid_ball, 2, 120, 4 /* ACID */);
    case 63 /* ROD_FIRE_BALL */:
      return auxRodBolt(ctx, fs, SVAL.rod.fire_ball, 2, 144, 6 /* FIRE */);
    case 66 /* ROD_UNKNOWN */:
      return auxRodUnknown(ctx, fs, 75, 0 /* MISSILE */);
    case 72 /* WAND_UNKNOWN */:
      return auxWandUnknown(ctx, fs, 75, 0 /* MISSILE */);
    case 73 /* WAND_MAGIC_MISSILE */:
      return auxWandBolt(ctx, fs, SVAL.wand.magic_missile, 0, idiv(3 * (4 + 1), 2), 0 /* MISSILE */);
    case 78 /* WAND_SLOW_MONSTER */:
      return auxWandBolt(ctx, fs, SVAL.wand.slow_monster, 0, 10, 50 /* OLD_SLOW */);
    case 79 /* WAND_HOLD_MONSTER */:
      return auxWandBolt(ctx, fs, SVAL.wand.hold_monster, 0, 10, 51 /* OLD_SLEEP */);
    case 81 /* WAND_FEAR_MONSTER */:
      return auxWandBolt(ctx, fs, SVAL.wand.fear_monster, 0, idiv(2 * (6 + 1), 2), 49 /* TURN_ALL */);
    case 80 /* WAND_CONFUSE_MONSTER */:
      return auxWandBolt(ctx, fs, SVAL.wand.confuse_monster, 0, idiv(2 * (6 + 1), 2), 48 /* OLD_CONF */);
    case 74 /* WAND_ELEC_BOLT */:
      return auxWandBolt(ctx, fs, SVAL.wand.elec_bolt, -1, idiv(6 * (6 + 1), 2), 5 /* ELEC */);
    case 75 /* WAND_COLD_BOLT */:
      return auxWandBolt(ctx, fs, SVAL.wand.cold_bolt, 0, idiv(12 * (8 + 1), 2), 7 /* COLD */);
    case 76 /* WAND_ACID_BOLT */:
      return auxWandBolt(ctx, fs, SVAL.wand.acid_bolt, 0, idiv(5 * (8 + 1), 2), 4 /* ACID */);
    case 77 /* WAND_FIRE_BOLT */:
      return auxWandBolt(ctx, fs, SVAL.wand.fire_bolt, 0, idiv(12 * (8 + 1), 2), 6 /* FIRE */);
    case 84 /* WAND_LIGHT_BEAM */:
      return auxWandBolt(ctx, fs, SVAL.wand.light, -1, idiv(6 * (8 + 1), 2), 16 /* LIGHT_WEAK */);
    case 85 /* WAND_STINKING_CLOUD */:
      return auxWandBolt(ctx, fs, SVAL.wand.stinking_cloud, 2, 12, 8 /* POIS */);
    case 86 /* WAND_ELEC_BALL */:
      return auxWandBolt(ctx, fs, SVAL.wand.elec_ball, 2, 64, 5 /* ELEC */);
    case 87 /* WAND_COLD_BALL */:
      return auxWandBolt(ctx, fs, SVAL.wand.cold_ball, 2, 100, 7 /* COLD */);
    case 88 /* WAND_ACID_BALL */:
      return auxWandBolt(ctx, fs, SVAL.wand.acid_ball, 2, 120, 4 /* ACID */);
    case 89 /* WAND_FIRE_BALL */:
      return auxWandBolt(ctx, fs, SVAL.wand.fire_ball, 2, 144, 6 /* FIRE */);
    case 91 /* WAND_DRAGON_COLD */:
      return auxWandBolt(ctx, fs, SVAL.wand.dragon_cold, 3, 160, 7 /* COLD */);
    case 92 /* WAND_DRAGON_FIRE */:
      return auxWandBolt(ctx, fs, SVAL.wand.dragon_fire, 3, 200, 6 /* FIRE */);
    case 82 /* WAND_ANNIHILATION */:
      return auxWandBolt(ctx, fs, SVAL.wand.annihilation, 0, 250, 17 /* OLD_DRAIN */);
    case 83 /* WAND_DRAIN_LIFE */:
      return auxWandBolt(ctx, fs, SVAL.wand.drain_life, 0, 150, 17 /* OLD_DRAIN */);
    case 90 /* WAND_WONDER */:
      return auxWandBolt(ctx, fs, SVAL.wand.wonder, 0, 35, 0 /* MISSILE */);
    case 67 /* STAFF_SLEEP_MONSTERS */:
      return auxStaffDispel(ctx, fs, SVAL.staff.sleep_monsters, 10, 60, 51 /* OLD_SLEEP */);
    case 68 /* STAFF_SLOW_MONSTERS */:
      return auxStaffDispel(ctx, fs, SVAL.staff.slow_monsters, 10, 60, 50 /* OLD_SLOW */);
    case 69 /* STAFF_DISPEL_EVIL */:
      return auxStaffDispel(ctx, fs, SVAL.staff.dispel_evil, 10, 60, 12 /* DISP_EVIL */);
    case 70 /* STAFF_POWER */:
      return auxStaffDispel(ctx, fs, SVAL.staff.power, 10, 120, 49 /* TURN_ALL */);
    case 71 /* STAFF_HOLINESS */:
      return auxStaffDispel(
        ctx,
        fs,
        SVAL.staff.holiness,
        10,
        trait3(ctx, 27 /* CURHP */) < idiv(trait3(ctx, 28 /* MAXHP */), 2) ? 500 : 120,
        12 /* DISP_EVIL */
      );
    case 93 /* RING_ACID */:
      return auxRing(ctx, fs, SVAL.ring.acid, 2, 70, 4 /* ACID */);
    case 94 /* RING_FIRE */:
      return auxRing(ctx, fs, SVAL.ring.flames, 2, 80, 6 /* FIRE */);
    case 95 /* RING_ICE */:
      return auxRing(ctx, fs, SVAL.ring.ice, 2, 75, 9 /* ICE */);
    case 96 /* RING_LIGHTNING */:
      return auxRing(ctx, fs, SVAL.ring.lightning, 2, 85, 5 /* ELEC */);
    case 97 /* DRAGON_BLUE */:
      return auxDragon(ctx, fs, SVAL.dragon.blue, 20, 150, 5 /* ELEC */);
    case 98 /* DRAGON_WHITE */:
      return auxDragon(ctx, fs, SVAL.dragon.white, 20, 100, 7 /* COLD */);
    case 99 /* DRAGON_BLACK */:
      return auxDragon(ctx, fs, SVAL.dragon.black, 20, 120, 4 /* ACID */);
    case 100 /* DRAGON_GREEN */:
      return auxDragon(ctx, fs, SVAL.dragon.green, 20, 150, 8 /* POIS */);
    case 101 /* DRAGON_RED */:
      return auxDragon(ctx, fs, SVAL.dragon.red, 2, 200, 6 /* FIRE */);
    case 102 /* DRAGON_MULTIHUED */:
      return auxDragonMulti(ctx, fs, SVAL.dragon.multihued, 20, 250, [
        5 /* ELEC */,
        7 /* COLD */,
        4 /* ACID */,
        8 /* POIS */,
        6 /* FIRE */
      ]);
    case 103 /* DRAGON_GOLD */:
      return auxDragon(ctx, fs, SVAL.dragon.gold, 20, 150, 23 /* SOUND */);
    case 104 /* DRAGON_CHAOS */:
      return auxDragonMulti(ctx, fs, SVAL.dragon.chaos, 20, 220, [20 /* CHAOS */, 26 /* DISEN */]);
    case 105 /* DRAGON_LAW */:
      return auxDragonMulti(ctx, fs, SVAL.dragon.law, 20, 220, [23 /* SOUND */, 22 /* SHARD */]);
    case 106 /* DRAGON_BALANCE */:
      return auxDragonMulti(ctx, fs, SVAL.dragon.balance, 20, 250, [
        20 /* CHAOS */,
        26 /* DISEN */,
        23 /* SOUND */,
        22 /* SHARD */
      ]);
    case 107 /* DRAGON_SHINING */:
      return auxDragonMulti(ctx, fs, SVAL.dragon.shining, 20, 200, [31 /* LIGHT */, 32 /* DARK */]);
    case 108 /* DRAGON_POWER */:
      return auxDragon(ctx, fs, SVAL.dragon.power, 20, 300, 0 /* MISSILE */);
    /* Artifact and item activations (BF_ACT_*), attack.c:4424-4910.
     *
     * All 61 of them, transcribed from the C switch. They were absent: the BF
     * enum carried every id, so borg_attack iterated them, and every one fell to
     * the default below and scored 0. Borg therefore never once considered
     * attacking with an artifact - and auxActivation, the helper they all call,
     * sat ported with no reference. Whether a given one can fire is still the
     * host's answer, through the activation resolver in ItemDeps; what changed is
     * that the question now gets asked.
     *
     * rad defaults to 0 where a case sets only dam: `int rad = 0` is declared at
     * the top of borg_calculate_attack_effectiveness (attack.c:3784) and the
     * switch is entered fresh each call. ACT_WONDER and ACT_STAFF_HOLY are the
     * two that rely on it. */
    /* Artifact -- Narthanc- fire bolt 9d8*/
    case 109 /* ACT_FIRE_BOLT */:
      return auxActivation(ctx, fs, "act_fire_bolt", 0, idiv(9 * (8 + 1), 2), 6 /* FIRE */, true);
    /* Artifact -- Anduril & Firestar- fire ball 72*/
    case 110 /* ACT_FIRE_BALL72 */:
      return auxActivation(ctx, fs, "act_fire_ball72", 2, 72, 6 /* FIRE */, true);
    /* Artifact -- Gothmog- FIRE BALL 144 */
    case 111 /* ACT_FIRE_BALL */:
      return auxActivation(ctx, fs, "act_fire_ball", 2, 144, 6 /* FIRE */, true);
    /* Artifact -- Nimthanc & Paurnimmen- frost bolt 6d8*/
    case 112 /* ACT_COLD_BOLT */:
      return auxActivation(ctx, fs, "act_cold_bolt", 0, idiv(6 * (8 + 1), 2), 7 /* COLD */, true);
    /* Artifact -- Belangil- frost ball 50 */
    case 113 /* ACT_COLD_BALL50 */:
      return auxActivation(ctx, fs, "act_cold_ball50", 2, 50, 7 /* COLD */, true);
    /* Artifact -- Aranr(u + acute accent)th- frost bolt 12d8*/
    case 115 /* ACT_COLD_BOLT2 */:
      return auxActivation(ctx, fs, "act_cold_bolt2", 0, idiv(12 * (8 + 1), 2), 7 /* COLD */, true);
    /* Artifact -- Ringil- frost ball 100*/
    case 114 /* ACT_COLD_BALL100 */:
      return auxActivation(ctx, fs, "act_cold_ball100", 2, 100, 7 /* COLD */, true);
    /* Artifact -- Dethanc- electric bolt 6d6*/
    case 123 /* ACT_ELEC_BOLT */:
      return auxActivation(ctx, fs, "act_elec_bolt", -1, idiv(6 * (6 + 1), 2), 5 /* ELEC */, true);
    /* Artifact -- Rilia- poison gas 12*/
    case 118 /* ACT_STINKING_CLOUD */:
      return auxActivation(ctx, fs, "act_stinking_cloud", 2, 12, 8 /* POIS */, true);
    /* Artifact -- Theoden- drain Life 120*/
    case 117 /* ACT_DRAIN_LIFE2 */:
      return auxActivation(ctx, fs, "act_drain_life2", 0, 120, 17 /* OLD_DRAIN */, true);
    /* Artifact -- Totila- confustion */
    case 119 /* ACT_CONFUSE2 */:
      return auxActivation(ctx, fs, "act_confuse2", 0, 20, 48 /* OLD_CONF */, true);
    /* Artifact -- Holcolleth -- sleep ii and sanctuary */
    /* dam = 10 is assigned and unused upstream; the helper computes its own. */
    case 122 /* ACT_SLEEPII */:
      return auxArtifactHolcolleth(ctx, fs);
    /* Artifact -- TURMIL- drain life 90 */
    case 116 /* ACT_DRAIN_LIFE1 */:
      return auxActivation(ctx, fs, "act_drain_life1", 0, 90, 17 /* OLD_DRAIN */, true);
    /* Artifact -- Fingolfin- spikes 150 */
    case 120 /* ACT_ARROW */:
      return auxActivation(ctx, fs, "act_arrow", 0, 150, 0 /* MISSILE */, true);
    /* Artifact -- Cammithrim- Magic Missile 3d4 */
    case 121 /* ACT_MISSILE */:
      return auxActivation(ctx, fs, "act_missile", 0, idiv(3 * (4 + 1), 2), 0 /* MISSILE */, true);
    /* Artifact -- Paurnen- ACID bolt 5d8 */
    case 124 /* ACT_ACID_BOLT */:
      return auxActivation(ctx, fs, "act_acid_bolt", 0, idiv(5 * (8 + 1), 2), 4 /* ACID */, true);
    /* Artifact -- INGWE- DISPEL EVIL X5 */
    case 125 /* ACT_DISPEL_EVIL */:
      return auxActivation(ctx, fs, "act_dispel_evil", 10, 10 + idiv(trait3(ctx, 35 /* CLEVEL */) * 5, 2), 12 /* DISP_EVIL */, true);
    /* Artifact -- E(o + diaresis)l -- Mana Bolt 12d8 */
    case 126 /* ACT_MANA_BOLT */:
      return auxActivation(ctx, fs, "act_mana_bolt", 0, idiv(12 * (8 + 1), 2), 2 /* MANA */, true);
    /* Artifact -- Razorback and Mediator */
    case 127 /* ACT_STAR_BALL */:
      return auxActivation(ctx, fs, "act_star_ball", 3, 150, 5 /* ELEC */, true);
    /* Artifact -- Gil-galad */
    case 128 /* ACT_STARLIGHT2 */:
      return auxActivation(ctx, fs, "act_starlight2", 7, idiv(10 * (8 + 1), 2), 31 /* LIGHT */, false);
    /* Artifact -- randarts */
    case 129 /* ACT_STARLIGHT */:
      return auxActivation(ctx, fs, "act_starlight", 7, idiv(6 * (8 + 1), 2), 31 /* LIGHT */, false);
    case 130 /* ACT_MON_SLOW */:
      return auxActivation(ctx, fs, "act_mon_slow", 0, 20, 50 /* OLD_SLOW */, true);
    case 131 /* ACT_MON_CONFUSE */:
      return auxActivation(ctx, fs, "act_mon_confuse", 0, idiv(2 * (6 + 1), 2), 48 /* OLD_CONF */, true);
    case 132 /* ACT_SLEEP_ALL */:
      return auxActivation(ctx, fs, "act_sleep_all", 0, 60, 51 /* OLD_SLEEP */, true);
    case 133 /* ACT_FEAR_MONSTER */:
      return auxActivation(ctx, fs, "act_mon_scare", 0, idiv(2 * (6 + 1), 2), 49 /* TURN_ALL */, true);
    case 134 /* ACT_LIGHT_BEAM */:
      return auxActivation(ctx, fs, "act_light_line", -1, idiv(6 * (8 + 1), 2), 16 /* LIGHT_WEAK */, true);
    case 135 /* ACT_DRAIN_LIFE3 */:
      return auxActivation(ctx, fs, "act_drain_life3", 0, 150, 17 /* OLD_DRAIN */, true);
    case 136 /* ACT_DRAIN_LIFE4 */:
      return auxActivation(ctx, fs, "act_drain_life4", 0, 250, 17 /* OLD_DRAIN */, true);
    case 137 /* ACT_ELEC_BALL */:
      return auxActivation(ctx, fs, "act_elec_ball", 2, 64, 5 /* ELEC */, true);
    case 138 /* ACT_ELEC_BALL2 */:
      return auxActivation(ctx, fs, "act_elec_ball2", 2, 250, 5 /* ELEC */, true);
    case 139 /* ACT_ACID_BOLT2 */:
      return auxActivation(ctx, fs, "act_acid_bolt2", 0, idiv(10 * (8 + 1), 2), 4 /* ACID */, true);
    case 140 /* ACT_ACID_BOLT3 */:
      return auxActivation(ctx, fs, "act_acid_bolt2", 0, idiv(12 * (8 + 1), 2), 4 /* ACID */, true);
    case 141 /* ACT_ACID_BALL */:
      return auxActivation(ctx, fs, "act_acid_ball", 2, 120, 4 /* ACID */, true);
    case 142 /* ACT_COLD_BALL160 */:
      return auxActivation(ctx, fs, "act_cold_ball160", 2, 160, 7 /* COLD */, true);
    case 143 /* ACT_COLD_BALL2 */:
      return auxActivation(ctx, fs, "act_cold_ball2", 2, 200, 7 /* COLD */, true);
    case 144 /* ACT_FIRE_BALL2 */:
      return auxActivation(ctx, fs, "act_fire_ball2", 2, 120, 6 /* FIRE */, true);
    case 145 /* ACT_FIRE_BALL200 */:
      return auxActivation(ctx, fs, "act_fire_ball200", 2, 200, 6 /* FIRE */, true);
    case 146 /* ACT_FIRE_BOLT2 */:
      return auxActivation(ctx, fs, "act_fire_bolt2", 0, idiv(12 * (8 + 1), 2), 6 /* FIRE */, true);
    case 147 /* ACT_FIRE_BOLT3 */:
      return auxActivation(ctx, fs, "act_fire_bolt3", 0, idiv(16 * (8 + 1), 2), 6 /* FIRE */, true);
    case 148 /* ACT_DISPEL_EVIL60 */:
      return auxActivation(ctx, fs, "act_dispel_evil60", 10, 60, 12 /* DISP_EVIL */, false);
    case 149 /* ACT_DISPEL_UNDEAD */:
      return auxActivation(ctx, fs, "act_dispel_undead", 10, 60, 11 /* DISP_UNDEAD */, false);
    case 150 /* ACT_DISPEL_ALL */:
      return auxActivation(ctx, fs, "act_dispel_undead", 10, 60, 47 /* DISP_ALL */, false);
    case 151 /* ACT_LOSSLOW */:
      return auxActivation(ctx, fs, "act_losslow", 10, 20, 50 /* OLD_SLOW */, false);
    case 152 /* ACT_LOSSLEEP */:
      return auxActivation(ctx, fs, "act_lossleep", 10, 20, 51 /* OLD_SLEEP */, false);
    case 153 /* ACT_LOSCONF */:
      return auxActivation(ctx, fs, "act_losconf", 10, 5 + idiv(5 + 1, 2), 48 /* OLD_CONF */, false);
    case 154 /* ACT_WONDER */:
      return auxActivation(ctx, fs, "act_wonder", 0, 5 + idiv(5 + 1, 2), 0 /* MISSILE */, true);
    case 155 /* ACT_STAFF_HOLY */:
      return auxActivation(
        ctx,
        fs,
        "act_staff_holy",
        0,
        trait3(ctx, 27 /* CURHP */) < idiv(trait3(ctx, 28 /* MAXHP */), 2) ? 500 : 120,
        12 /* DISP_EVIL */,
        false
      );
    case 156 /* ACT_RING_ACID */:
      return auxActivation(ctx, fs, "act_ring_acid", 2, 70, 4 /* ACID */, true);
    case 157 /* ACT_RING_FIRE */:
      return auxActivation(ctx, fs, "act_ring_flames", 2, 80, 6 /* FIRE */, true);
    case 158 /* ACT_RING_ICE */:
      return auxActivation(ctx, fs, "act_ring_ice", 2, 75, 9 /* ICE */, true);
    case 159 /* ACT_RING_LIGHTNING */:
      return auxActivation(ctx, fs, "act_ring_lightning", 2, 85, 5 /* ELEC */, true);
    case 160 /* ACT_DRAGON_BLUE */:
      return auxActivation(ctx, fs, "act_dragon_blue", 2, 150, 5 /* ELEC */, true);
    case 161 /* ACT_DRAGON_GREEN */:
      return auxActivation(ctx, fs, "act_dragon_green", 2, 150, 8 /* POIS */, true);
    case 162 /* ACT_DRAGON_RED */:
      return auxActivation(ctx, fs, "act_dragon_red", 2, 200, 6 /* FIRE */, true);
    case 163 /* ACT_DRAGON_MULTIHUED */:
      return auxActivationMulti(ctx, fs, "act_dragon_multihued", 2, 250, [
        5 /* ELEC */,
        7 /* COLD */,
        4 /* ACID */,
        8 /* POIS */,
        6 /* FIRE */
      ]);
    case 164 /* ACT_DRAGON_GOLD */:
      return auxActivation(ctx, fs, "act_dragon_gold", 2, 150, 23 /* SOUND */, true);
    case 165 /* ACT_DRAGON_CHAOS */:
      return auxActivationMulti(ctx, fs, "act_dragon_chaos", 2, 220, [
        20 /* CHAOS */,
        26 /* DISEN */
      ]);
    case 166 /* ACT_DRAGON_LAW */:
      return auxActivationMulti(ctx, fs, "act_dragon_law", 2, 220, [
        23 /* SOUND */,
        22 /* SHARD */
      ]);
    case 167 /* ACT_DRAGON_BALANCE */:
      return auxActivationMulti(ctx, fs, "act_dragon_balance", 2, 250, [
        20 /* CHAOS */,
        26 /* DISEN */,
        23 /* SOUND */,
        22 /* SHARD */
      ]);
    case 168 /* ACT_DRAGON_SHINING */:
      return auxActivationMulti(ctx, fs, "act_dragon_shining", 2, 200, [
        31 /* LIGHT */,
        32 /* DARK */
      ]);
    case 169 /* ACT_DRAGON_POWER */:
      return auxActivation(ctx, fs, "act_dragon_power", 2, 300, 0 /* MISSILE */, true);
    default:
      return 0;
  }
}
function auxDragonMulti(ctx, fs, sval, rad, dam, types) {
  const savedSim = fs.simulate;
  fs.simulate = true;
  const values = types.map((t) => auxDragon(ctx, fs, sval, rad, dam, t));
  let biggest = 0;
  for (let x = 1; x < values.length; x++) if (values[x] > values[biggest]) biggest = x;
  fs.simulate = savedSim;
  if (!fs.simulate) return auxDragon(ctx, fs, sval, rad, dam, types[biggest]);
  return values[biggest];
}
function auxLeapIntoBattle(ctx, fs) {
  if (!borgSpellOkayFail(ctx, 122 /* LEAP_INTO_BATTLE */, fs.fightingUnique ? 40 : 25)) return 0;
  if (trait3(ctx, 113 /* ISAFRAID */) || trait3(ctx, 186 /* CRSFEAR */)) return 0;
  if (fs.targetClosest < 10) return 0;
  let bI = -1;
  let bD = -1;
  for (let i = 0; i < fs.tempN; i++) {
    const x = fs.tempX[i];
    const y = fs.tempY[i];
    const mDist = dist(ctx.world.self.c.y, ctx.world.self.c.x, y, x);
    if (mDist > 4) continue;
    const ag = ctx.world.map.at(x, y);
    if (!ag.kill) continue;
    let d = borgThrustDamageOne(ctx, ag.kill);
    let blows = idiv(trait3(ctx, 35 /* CLEVEL */) + 5, 15);
    blows = idiv(blows * mDist + 2, 4) + 1;
    d *= blows;
    if (d <= 0) continue;
    const kill = ctx.world.kills.at(ag.kill);
    if (!kill.awake && d <= kill.power && !ctx.world.self.munchkinMode) {
      const p2 = borgDangerOneKill(ctx, y, x, 1, ag.kill, true, true);
      if (p2 > avoidance2(ctx) * 2) continue;
    }
    if (!trait3(ctx, 105 /* CDEPTH */) && !kill.awake) continue;
    let p = borgDangerOneKill(ctx, ctx.world.self.c.y, ctx.world.self.c.x, 2, ag.kill, true, true);
    if (d <= kill.power && trait3(ctx, 36 /* MAXCLEVEL */) > 15) p = idiv(p, 10);
    d += p;
    if (bI >= 0 && d < bD) continue;
    bI = i;
    bD = d;
  }
  if (bI < 0) return 0;
  if (fs.simulate) return bD;
  ctx.world.self.goal.g.x = fs.tempX[bI];
  ctx.world.self.goal.g.y = fs.tempY[bI];
  borgTarget(ctx, ctx.world.self.goal.g.y, ctx.world.self.goal.g.x, true);
  fs.pending = borgSpell(ctx, 122 /* LEAP_INTO_BATTLE */);
  fs.successfulTarget = -1;
  return bD;
}
function auxMaimFoe(ctx, fs) {
  if (trait3(ctx, 113 /* ISAFRAID */) || trait3(ctx, 186 /* CRSFEAR */)) return 0;
  if (!borgSpellOkayFail(ctx, 124 /* MAIM_FOE */, fs.fightingUnique ? 40 : 25)) return 0;
  const blows = idiv(trait3(ctx, 35 /* CLEVEL */), 15);
  let bI = -1;
  let bD = -1;
  for (let i = 0; i < fs.tempN; i++) {
    const x = fs.tempX[i];
    const y = fs.tempY[i];
    if (dist(ctx.world.self.c.y, ctx.world.self.c.x, y, x) > 1) continue;
    const ag = ctx.world.map.at(x, y);
    let d = borgThrustDamageOne(ctx, ag.kill) * blows;
    if (d <= 0) continue;
    const kill = ctx.world.kills.at(ag.kill);
    if (!kill.awake && d <= kill.power && !ctx.world.self.munchkinMode) {
      const p2 = borgDangerOneKill(ctx, y, x, 1, ag.kill, true, true);
      if (p2 > avoidance2(ctx) * 2) continue;
    }
    if (!trait3(ctx, 105 /* CDEPTH */) && !kill.awake) continue;
    let p = borgDangerOneKill(ctx, ctx.world.self.c.y, ctx.world.self.c.x, 2, ag.kill, true, true);
    if (d <= kill.power && trait3(ctx, 36 /* MAXCLEVEL */) > 15) p = idiv(p, 10);
    d += p;
    if (bI >= 0 && d < bD) continue;
    bI = i;
    bD = d;
  }
  if (bI < 0) return 0;
  if (fs.simulate) return bD;
  ctx.world.self.goal.g.x = fs.tempX[bI];
  ctx.world.self.goal.g.y = fs.tempY[bI];
  const dir = borgExtractDir(ctx.world.self.c.y, ctx.world.self.c.x, ctx.world.self.goal.g.y, ctx.world.self.goal.g.x);
  const cmd = borgSpell(ctx, 124 /* MAIM_FOE */);
  fs.pending = cmd;
  void dir;
  return bD;
}
function auxVampireStrike(ctx, fs) {
  if (!borgSpellOkayFail(ctx, 95 /* VAMPIRE_STRIKE */, fs.fightingUnique ? 40 : 25)) return 0;
  let bI = -1;
  let bestDist = maxRange2(ctx);
  let curDist = 0;
  for (let i = 0; i < fs.tempN; i++) {
    const x2 = fs.tempX[i];
    const y2 = fs.tempY[i];
    curDist = dist(ctx.world.self.c.y, ctx.world.self.c.x, y2, x2);
    if (curDist > bestDist) continue;
    bestDist = curDist;
    bI = i;
  }
  if (bI === -1) return 0;
  if (curDist >= 20) return 0;
  const x = fs.tempX[bI];
  const y = fs.tempY[bI];
  let found = false;
  for (let ox = -1; ox <= 1 && !found; ox++) {
    for (let oy = -1; oy <= 1 && !found; oy++) {
      if (!ox && !oy) continue;
      const x2 = x + ox;
      const y2 = y + oy;
      if (!ctx.world.map.inBounds(x2, y2)) continue;
      const ag2 = ctx.world.map.at(x2, y2);
      if (!ag2.kill && ag2.feat === FEAT.FLOOR && !ag2.web && !ag2.glyph && (y2 !== ctx.world.self.c.y || x2 !== ctx.world.self.c.x))
        found = true;
    }
  }
  if (!found) return 0;
  if (!borgOffsetProjectable(ctx, ctx.world.self.c.y, ctx.world.self.c.x, y, x)) return 0;
  const ag = ctx.world.map.at(x, y);
  let d = trait3(ctx, 35 /* CLEVEL */) * 2;
  const kill = ctx.world.kills.at(ag.kill);
  const facts = factsOf(ctx, ag.kill);
  if (rf(facts, "NONLIVING") || rf(facts, "UNDEAD")) return 0;
  if (!kill.awake && d <= kill.power && !ctx.world.self.munchkinMode) {
    const p2 = borgDangerOneKill(ctx, y, x, 1, ag.kill, true, true);
    if (p2 > avoidance2(ctx) * 2) return 0;
  }
  let p = borgDangerOneKill(ctx, ctx.world.self.c.y, ctx.world.self.c.x, 2, ag.kill, true, true);
  if (d <= kill.power && trait3(ctx, 36 /* MAXCLEVEL */) > 15) p = idiv(p, 10);
  d += p;
  if (fs.targetClosest < 0 && d > 0) {
    fs.targetClosest = 0;
    return 0;
  }
  if (fs.simulate) return d;
  fs.pending = borgSpell(ctx, 95 /* VAMPIRE_STRIKE */);
  return d;
}
function borgAttack(ctx, boostedBravery = false) {
  const fs = getFightState(ctx.world);
  const g = getDangerGlobals(ctx.world);
  if (ctx.world.kills.count <= 1) return null;
  g.attacking = true;
  g.fightingUnique = fs.fightingUnique !== 0;
  fs.tempN = 0;
  let adjacentMonster = false;
  for (const [i, kill] of ctx.world.kills.entries()) {
    const facts = factsOf(ctx, i);
    if (!kill.rIdx) continue;
    if (kill.when < ctx.world.clock - 2) continue;
    if (ctx.world.self.goal.ignoring && !trait3(ctx, 113 /* ISAFRAID */) && rf(facts, "MULTIPLY")) continue;
    const nm = raceName(ctx, kill.mIdx);
    if (trait3(ctx, 25 /* CLASS */) === CLASS_MAGE && trait3(ctx, 36 /* MAXCLEVEL */) < 10 && trait3(ctx, 105 /* CDEPTH */) === 0 && nm.includes("Farmer"))
      continue;
    if (kill.speed > trait3(ctx, 44 /* SPEED */) && dist(ctx.world.self.c.y, ctx.world.self.c.x, kill.pos.y, kill.pos.x) <= 2 || dist(ctx.world.self.c.y, ctx.world.self.c.x, kill.pos.y, kill.pos.x) <= 1)
      adjacentMonster = true;
    if (ctx.world.facts.scaryGuyOnLevel) {
      if (nm.includes("Grip") || nm.includes("Fang")) {
      } else if (trait3(ctx, 105 /* CDEPTH */) <= 5 && trait3(ctx, 105 /* CDEPTH */) !== 0 && rf(facts, "MULTIPLY")) {
      } else if (ctx.world.clock - fs.began >= 2e3 || fs.timeTown + (ctx.world.clock - fs.began) >= 3e3) {
      } else if (boostedBravery || ctx.world.self.noRetreat >= 1 || ctx.world.self.goal.recalling || ctx.world.self.goal.descending) {
      } else if (trait3(ctx, 105 /* CDEPTH */) * 4 <= trait3(ctx, 35 /* CLEVEL */) && trait3(ctx, 35 /* CLEVEL */) > 10) {
      } else if (adjacentMonster) {
      } else {
        continue;
      }
    }
    if (!ctx.world.map.inBounds(kill.pos.x, kill.pos.y)) continue;
    const ag = ctx.world.map.at(kill.pos.x, kill.pos.y);
    if (!(ag.info & 8)) continue;
    if (!(ag.info & 32)) continue;
    if (dist(ctx.world.self.c.y, ctx.world.self.c.x, kill.pos.y, kill.pos.x) > maxRange2(ctx)) continue;
    if (!ag.kill) ag.kill = i;
    fs.tempX[fs.tempN] = kill.pos.x;
    fs.tempY[fs.tempN] = kill.pos.y;
    fs.tempN++;
  }
  if (!fs.tempN) {
    g.attacking = false;
    return null;
  }
  const randarts = false;
  const maxAttacks = randarts ? 170 /* MAX */ : 129 /* ACT_STARLIGHT */;
  fs.simulate = true;
  let bG = -1;
  let bN = 0;
  for (let gI = 0; gI < maxAttacks; gI++) {
    const n = borgCalculateAttackEffectiveness(ctx, fs, gI);
    if (n <= bN) continue;
    bG = gI;
    bN = n;
  }
  if (bN <= 0) {
    g.attacking = false;
    return null;
  }
  fs.simulate = false;
  fs.pending = null;
  borgCalculateAttackEffectiveness(ctx, fs, bG);
  g.attacking = false;
  return fs.pending;
}

// src/fight/escape.ts
function avoidance3(ctx) {
  return getDangerGlobals(ctx.world).avoidance;
}
function dist3(y1, x1, y2, x2) {
  return Math.max(iabs(y1 - y2), iabs(x1 - x2));
}
function doubleDistance(y1, x1, y2, x2) {
  return Math.max(iabs(y1 * 2 - y2 * 2), iabs(x1 * 2 - x2 * 2));
}
function firstCmd(...cmds) {
  for (const c of cmds) if (c) return c;
  return null;
}
function rf2(ctx, i, name) {
  return getDangerGlobals(ctx.world).resolveFacts(ctx, i).flags.has(name);
}
function borgRecall(ctx) {
  if (ctx.world.self.goal.recalling) return null;
  return firstCmd(
    borgZapRod(ctx, SVAL.rod.recall),
    borgActivateItem(ctx, "act_recall"),
    borgSpellFail(ctx, 71 /* WORD_OF_RECALL */, 60),
    borgReadScroll(ctx, SVAL.scroll.word_of_recall)
  );
}
function borgSurrounded(ctx) {
  let safeGrids = 8;
  let nonSafe = 0;
  let monsters = 0;
  let adjacent = 0;
  for (const [i, kill] of ctx.world.kills.entries()) {
    if (!kill.rIdx) continue;
    const d = dist3(ctx.world.self.c.y, ctx.world.self.c.x, kill.pos.y, kill.pos.x);
    if (d > 3) continue;
    if (!borgLos(ctx.world, ctx.world.self.c.y, ctx.world.self.c.x, kill.pos.y, kill.pos.x)) continue;
    if (!kill.awake) continue;
    if (rf2(ctx, i, "PASS_WALL")) continue;
    if (rf2(ctx, i, "KILL_WALL")) continue;
    if (d === 1) adjacent++;
    monsters++;
  }
  for (let i = 0; i < 8; i++) {
    const x = ctx.world.self.c.x + ddx_ddd[i];
    const y = ctx.world.self.c.y + ddy_ddd[i];
    if (!(x >= 1 && x < AUTO_MAX_X - 1 && y >= 1 && y < AUTO_MAX_Y - 1)) continue;
    const ag = ctx.world.map.at(x, y);
    if (!isFloor(ag.feat)) nonSafe++;
    else if (ag.feat === FEAT.NONE) nonSafe++;
    else if (ag.kill) nonSafe++;
    else if (isShop(ag.feat)) nonSafe++;
    if (ag.trap && !ag.glyph) nonSafe++;
  }
  safeGrids = safeGrids - nonSafe;
  if (safeGrids === 1 && adjacent === 1) return false;
  if (monsters > safeGrids) {
    if (ctx.world.self.goal.ignoring) {
    } else return true;
  }
  return false;
}
function isFloor(feat) {
  return feat === FEAT.FLOOR || feat === FEAT.OPEN || feat === FEAT.MORE || feat === FEAT.LESS || feat === FEAT.BROKEN || feat === FEAT.PASS_RUBBLE;
}
function isShop(feat) {
  return feat >= FEAT.STORE_GENERAL && feat <= FEAT.HOME;
}
function nearestStair(ctx, feat) {
  let best = null;
  let bestD = Infinity;
  for (let y = 0; y < AUTO_MAX_Y; y++) {
    for (let x = 0; x < AUTO_MAX_X; x++) {
      if (ctx.world.map.at(x, y).feat !== feat) continue;
      const d = dist3(ctx.world.self.c.y, ctx.world.self.c.x, y, x);
      if (d < bestD) {
        bestD = d;
        best = { y, x };
      }
    }
  }
  return best;
}
function borgFreedom(ctx, y, x) {
  let f = 0;
  if (!trait3(ctx, 105 /* CDEPTH */)) {
    const s = nearestStair(ctx, FEAT.MORE);
    if (s) {
      const d = doubleDistance(y, x, s.y, s.x);
      f += 1e3 - d;
      if (d < 4) f += 2e3 - d * 500;
    }
  }
  if (trait3(ctx, 105 /* CDEPTH */)) {
    const s = nearestStair(ctx, FEAT.LESS);
    if (s) {
      const d = doubleDistance(y, x, s.y, s.x);
      f += 1e3 - d;
      if (d < 4) f += 2e3 - d * 500;
    }
  }
  return f;
}
function borgCautionPhase(ctx, emergency, turns) {
  const dis = 10;
  const min = idiv(dis, 2);
  if (!trait3(ctx, 210 /* APHASE */)) return false;
  let n = 0;
  for (let k = 0; k < 100; k++) {
    let y = 0;
    let x = 0;
    let i = 0;
    for (; i < 100; i++) {
      let d;
      for (; ; ) {
        y = ctx.rng.randSpread(ctx.world.self.c.y, dis);
        x = ctx.rng.randSpread(ctx.world.self.c.x, dis);
        d = dist3(ctx.world.self.c.y, ctx.world.self.c.x, y, x);
        if (d >= min && d <= dis) break;
      }
      if (y <= 0 || y >= AUTO_MAX_Y - 1) continue;
      if (x <= 0 || x >= AUTO_MAX_X - 1) continue;
      const ag2 = ctx.world.map.at(x, y);
      if (ag2.feat === FEAT.NONE) continue;
      if (!isFloor(ag2.feat)) continue;
      if (ag2.kill) continue;
      if (ag2.web) continue;
      break;
    }
    const ag = ctx.world.map.inBounds(x, y) ? ctx.world.map.at(x, y) : null;
    if (ag && ag.feat === FEAT.NONE && trait3(ctx, 28 /* MAXHP */) < 30) {
      n++;
      continue;
    }
    if (i >= 100) {
      n++;
      continue;
    }
    const p = borgDanger(ctx, y, x, turns, true, false);
    if (p > trait3(ctx, 27 /* CURHP */)) n++;
  }
  return n <= emergency;
}
function borgCautionTeleport(ctx, emergency, turns) {
  const dis = 100;
  const min = idiv(dis, 2);
  if (!trait3(ctx, 211 /* ATELEPORT */) || !trait3(ctx, 212 /* AESCAPE */)) return false;
  let n = 0;
  for (let k = 0; k < 100; k++) {
    let y = 0;
    let x = 0;
    let i = 0;
    for (; i < 100; i++) {
      let d;
      for (; ; ) {
        y = ctx.rng.randSpread(ctx.world.self.c.y, dis);
        x = ctx.rng.randSpread(ctx.world.self.c.x, dis);
        d = dist3(ctx.world.self.c.y, ctx.world.self.c.x, y, x);
        if (d >= min && d <= dis) break;
      }
      if (y <= 0 || y >= AUTO_MAX_Y - 1) continue;
      if (x <= 0 || x >= AUTO_MAX_X - 1) continue;
      const ag2 = ctx.world.map.at(x, y);
      if (ag2.feat === FEAT.NONE && ctx.world.clock > 2e3) continue;
      if (!isFloor(ag2.feat)) continue;
      if (ag2.kill) continue;
      if (ag2.web) continue;
      break;
    }
    const ag = ctx.world.map.inBounds(x, y) ? ctx.world.map.at(x, y) : null;
    if (ag && ag.feat === FEAT.NONE && trait3(ctx, 28 /* MAXHP */) < 30) {
      n++;
      continue;
    }
    if (i >= 100) {
      n++;
      continue;
    }
    const p = borgDanger(ctx, y, x, turns, true, false);
    if (p > trait3(ctx, 27 /* CURHP */)) n++;
  }
  return n <= emergency;
}
function borgAllowTeleport(ctx) {
  if (trait3(ctx, 172 /* CRSNOTEL */)) return false;
  return true;
}
function borgShadowShift(ctx, allowFail) {
  if (trait3(ctx, 27 /* CURHP */) < 12) return null;
  return borgSpellFail(ctx, 92 /* SHADOW_SHIFT */, allowFail);
}
function borgDimensionDoor(ctx, allowFail) {
  const range = 50;
  if (!borgSpellOkayFail(ctx, 23 /* DIMENSION_DOOR */, allowFail)) return null;
  const fear = getFearCaches(ctx.world);
  const here = fear.region(ctx.world.self.c.y, ctx.world.self.c.x);
  let bestD = here;
  let best = null;
  for (let xo = -range; xo < range; xo++) {
    for (let yo = -range; yo < range; yo++) {
      const tx = ctx.world.self.c.x + xo;
      const ty = ctx.world.self.c.y + yo;
      if (tx < 0 || ty < 0) continue;
      if (!(tx >= 1 && tx < AUTO_MAX_X - 1 && ty >= 1 && ty < AUTO_MAX_Y - 1)) continue;
      const d = borgDanger(ctx, ty, tx, 2, true, false);
      if (d < bestD) {
        bestD = d;
        best = { y: ty, x: tx };
      }
    }
  }
  if (best && bestD < here) {
    borgTarget(ctx, best.y, best.x, false);
    return borgSpell(ctx, 23 /* DIMENSION_DOOR */);
  }
  return null;
}
function borgEscapeStair(ctx) {
  const { x, y } = ctx.world.self.c;
  if (!ctx.world.map.inBounds(x, y)) return null;
  if (ctx.world.map.at(x, y).feat === FEAT.LESS) {
    return ctx.act.ascend();
  }
  return null;
}
function borgTeleportOffLevel(ctx) {
  if (ctx.world.self.goal.recalling || ctx.world.self.goal.descending) return null;
  return firstCmd(
    borgReadScroll(ctx, SVAL.scroll.teleport_level),
    borgActivateItem(ctx, "act_tele_level"),
    borgActivateItem(ctx, "act_deep_descent"),
    borgReadScroll(ctx, SVAL.scroll.deep_descent)
  );
}
function primarilyCaster(ctx) {
  const c = trait3(ctx, 25 /* CLASS */);
  return c === CLASS_MAGE || c === CLASS_NECROMANCER || c === CLASS_PRIEST || c === CLASS_DRUID;
}
function borgShootScootSafe(ctx, emergency, turns) {
  if (trait3(ctx, 35 /* CLEVEL */) >= 8 && trait3(ctx, 105 /* CDEPTH */) === 0) return false;
  if (!trait3(ctx, 210 /* APHASE */)) return false;
  if (!trait3(ctx, 26 /* LIGHT */)) return false;
  if (primarilyCaster(ctx)) {
    if (trait3(ctx, 35 /* CLEVEL */) >= 45 && trait3(ctx, 30 /* CURSP */) < 15) return false;
    if (trait3(ctx, 35 /* CLEVEL */) < 45 && trait3(ctx, 30 /* CURSP */) < 5) return false;
  } else {
    if (trait3(ctx, 155 /* AMISSILES */) < 5 || trait3(ctx, 35 /* CLEVEL */) >= 45) return false;
  }
  const g = getDangerGlobals(ctx.world);
  if (g.morgothPosition || g.asPosition) return false;
  let adjacent = false;
  for (let i = 0; i < 8; i++) {
    const x = ctx.world.self.c.x + ddx_ddd[i];
    const y = ctx.world.self.c.y + ddy_ddd[i];
    if (!ctx.world.map.inBounds(x, y)) continue;
    const ag = ctx.world.map.at(x, y);
    if (!ag.kill) continue;
    const kill = ctx.world.kills.at(ag.kill);
    if (kill.awake && !rf2(ctx, ag.kill, "NEVER_MOVE") && !rf2(ctx, ag.kill, "PASS_WALL") && !rf2(ctx, ag.kill, "KILL_WALL") && kill.power >= trait3(ctx, 35 /* CLEVEL */)) {
      if (borgSpellOkay(ctx, 0 /* MAGIC_MISSILE */) || borgSpellOkay(ctx, 63 /* ORB_OF_DRAINING */) || borgSpellOkay(ctx, 85 /* NETHER_BOLT */)) {
        adjacent = true;
      } else {
        const facts = g.resolveFacts(ctx, ag.kill);
        if (borgDanger(ctx, kill.pos.y, kill.pos.x, 1, true, false) > idiv(avoidance3(ctx) * 3, 10) || facts.hasFriends && kill.level >= trait3(ctx, 35 /* CLEVEL */) - 5 || kill.rangedAttack || facts.flags.has("UNIQUE") || facts.flags.has("MULTIPLY") || trait3(ctx, 35 /* CLEVEL */) <= 5)
          adjacent = true;
      }
    }
  }
  if (!adjacent) return false;
  return borgCautionPhase(ctx, emergency, turns);
}
function resetAntisummon(ctx, fs) {
  if (ctx.world.clock - fs.tAntisummon < 50) fs.tAntisummon = 0;
}
function borgEscape(ctx, bQ) {
  const fs = getFightState(ctx.world);
  const av3 = avoidance3(ctx);
  const uniq = fs.fightingUnique;
  const cdepth = trait3(ctx, 105 /* CDEPTH */);
  const curhp = trait3(ctx, 27 /* CURHP */);
  const maxhp = trait3(ctx, 28 /* MAXHP */);
  const clevel = trait3(ctx, 35 /* CLEVEL */);
  let allowFail = 25;
  if (idiv(curhp * 100, maxhp) > 70) allowFail = 10;
  if (trait3(ctx, 118 /* ISHEAVYSTUN */)) allowFail = 35;
  if (!cdepth && (trait3(ctx, 115 /* ISPOISONED */) || trait3(ctx, 108 /* ISWEAK */) || trait3(ctx, 116 /* ISCUT */)))
    return null;
  if (cdepth === 100 && curhp >= idiv(maxhp * 5, 10)) {
    if (getDangerGlobals(ctx.world).morgothPosition) return null;
    let glyphs = 0;
    for (let j = 0; j < 8; j++) {
      const y = ctx.world.self.c.y + ddy_ddd[j];
      const x = ctx.world.self.c.x + ddx_ddd[j];
      if (ctx.world.map.inBounds(x, y) && ctx.world.map.at(x, y).glyph) glyphs++;
    }
    if (glyphs >= 3) return null;
  }
  if (trait3(ctx, 108 /* ISWEAK */) && cdepth === 1) {
    const cmd = borgTeleportOffLevel(ctx);
    if (cmd) return cmd;
  }
  const risky = fs.playsRisky ? 3 : 0;
  if (trait3(ctx, 118 /* ISHEAVYSTUN */) || bQ > idiv(av3 * (45 + risky), 10) || bQ > idiv(av3 * (40 + risky), 10) && uniq >= 10 && cdepth === 100 && curhp < 600 || bQ > idiv(av3 * (30 + risky), 10) && uniq >= 10 && cdepth === 99 && curhp < 600 || bQ > idiv(av3 * (25 + risky), 10) && uniq >= 1 && uniq <= 8 && cdepth >= 95 && curhp < 550 || bQ > idiv(av3 * (17 + risky), 10) && uniq >= 1 && uniq <= 8 && cdepth < 95 || bQ > idiv(av3 * (15 + risky), 10) && !uniq) {
    const taf = 15;
    let cmd = firstCmd(borgEscapeStair(ctx));
    if (!cmd && borgAllowTeleport(ctx)) {
      cmd = firstCmd(
        borgDimensionDoor(ctx, taf - 10),
        borgSpellFail(ctx, 14 /* TELEPORT_SELF */, taf - 10),
        borgSpellFail(ctx, 69 /* PORTAL */, taf - 10),
        borgShadowShift(ctx, taf - 10),
        borgReadScroll(ctx, SVAL.scroll.teleport),
        borgUseStaffFail(ctx, SVAL.staff.teleportation),
        borgActivateItem(ctx, "act_tele_long"),
        borgTeleportOffLevel(ctx),
        borgDimensionDoor(ctx, taf + 9),
        borgSpellFail(ctx, 14 /* TELEPORT_SELF */, taf + 9),
        borgSpellFail(ctx, 69 /* PORTAL */, taf + 9),
        borgShadowShift(ctx, taf + 9),
        borgUseStaff(ctx, SVAL.staff.teleportation),
        borgSpellFail(ctx, 21 /* TELEPORT_LEVEL */, taf + 9),
        borgCautionPhase(ctx, 75, 2) ? firstCmd(
          borgReadScroll(ctx, SVAL.scroll.phase_door),
          borgActivateItem(ctx, "act_tele_phase"),
          borgSpellFail(ctx, 3 /* PHASE_DOOR */, taf),
          borgSpellFail(ctx, 69 /* PORTAL */, taf)
        ) : null
      );
    }
    if (cmd) {
      resetAntisummon(ctx, fs);
      return cmd;
    }
    if (cdepth && clevel < 10 && curhp < idiv(maxhp * 1, 10) && borgAllowTeleport(ctx)) {
      const c2 = firstCmd(borgDimensionDoor(ctx, 90), borgSpell(ctx, 14 /* TELEPORT_SELF */), borgSpell(ctx, 69 /* PORTAL */));
      if (c2) {
        resetAntisummon(ctx, fs);
        return c2;
      }
    }
    if (cdepth && (curhp < idiv(maxhp * 1, 10) || bQ > idiv(av3 * (45 + risky), 10))) {
      const c3 = firstCmd(borgActivateItem(ctx, "act_tele_phase"), borgReadScroll(ctx, SVAL.scroll.phase_door));
      if (c3) {
        ctx.world.self.escapes--;
        resetAntisummon(ctx, fs);
        return c3;
      }
    }
    if (cdepth && clevel < 10 && curhp < idiv(maxhp * 1, 10)) {
      const c4 = firstCmd(borgSpellFail(ctx, 3 /* PHASE_DOOR */, 15), borgSpell(ctx, 69 /* PORTAL */));
      if (c4) {
        resetAntisummon(ctx, fs);
        return c4;
      }
    }
  }
  if (bQ < idiv(av3 * (25 + risky), 10) && uniq >= 1 && uniq <= 3 && cdepth >= 97) return null;
  if (trait3(ctx, 118 /* ISHEAVYSTUN */) || bQ > idiv(av3 * (3 + risky), 10) && trait3(ctx, 25 /* CLASS */) === CLASS_MAGE && trait3(ctx, 30 /* CURSP */) <= 20 && trait3(ctx, 36 /* MAXCLEVEL */) >= 45 || bQ > idiv(av3 * (13 + risky), 10) && uniq >= 1 && uniq <= 8 && cdepth !== 99 || bQ > idiv(av3 * (11 + risky), 10) && !uniq) {
    let cmd = firstCmd(borgEscapeStair(ctx));
    if (!cmd && borgAllowTeleport(ctx)) {
      cmd = firstCmd(
        borgDimensionDoor(ctx, allowFail - 10),
        borgSpellFail(ctx, 14 /* TELEPORT_SELF */, allowFail - 10),
        borgSpellFail(ctx, 69 /* PORTAL */, allowFail - 10),
        borgShadowShift(ctx, allowFail - 10),
        borgUseStaffFail(ctx, SVAL.staff.teleportation),
        borgActivateItem(ctx, "act_tele_long"),
        borgReadScroll(ctx, SVAL.scroll.teleport),
        borgDimensionDoor(ctx, allowFail),
        borgSpellFail(ctx, 14 /* TELEPORT_SELF */, allowFail),
        borgSpellFail(ctx, 69 /* PORTAL */, allowFail),
        borgShadowShift(ctx, allowFail),
        borgUseStaff(ctx, SVAL.staff.teleportation)
      );
    }
    if (cmd) {
      resetAntisummon(ctx, fs);
      return cmd;
    }
    if (borgCautionPhase(ctx, 50, 2) && ctx.world.clock - fs.tAntisummon > 50) {
      const c2 = firstCmd(
        borgSpell(ctx, 3 /* PHASE_DOOR */),
        borgSpell(ctx, 69 /* PORTAL */),
        borgReadScroll(ctx, SVAL.scroll.phase_door),
        borgActivateItem(ctx, "act_tele_phase")
      );
      if (c2) {
        resetAntisummon(ctx, fs);
        return c2;
      }
    }
  }
  if (trait3(ctx, 118 /* ISHEAVYSTUN */) || bQ > idiv(av3 * (13 + risky), 10) && uniq >= 2 && uniq <= 8 || bQ > idiv(av3 * (10 + risky), 10) && !uniq || bQ > idiv(av3 * (10 + risky), 10) && trait3(ctx, 113 /* ISAFRAID */) && trait3(ctx, 155 /* AMISSILES */) <= 0 && trait3(ctx, 25 /* CLASS */) === CLASS_WARRIOR) {
    if ((borgEscapeStair(ctx) || borgCautionPhase(ctx, 25, 2)) && ctx.world.clock - fs.tAntisummon > 50) {
      const c = firstCmd(
        borgSpellFail(ctx, 3 /* PHASE_DOOR */, allowFail),
        borgSpellFail(ctx, 69 /* PORTAL */, allowFail),
        borgActivateItem(ctx, "act_tele_phase"),
        borgReadScroll(ctx, SVAL.scroll.phase_door)
      );
      if (c) {
        ctx.world.self.escapes--;
        resetAntisummon(ctx, fs);
        return c;
      }
    }
    if (borgAllowTeleport(ctx)) {
      const c = firstCmd(
        borgDimensionDoor(ctx, allowFail),
        borgSpellFail(ctx, 14 /* TELEPORT_SELF */, allowFail),
        borgSpellFail(ctx, 69 /* PORTAL */, allowFail),
        borgShadowShift(ctx, allowFail),
        borgActivateItem(ctx, "act_tele_long"),
        borgUseStaffFail(ctx, SVAL.staff.teleportation),
        borgReadScroll(ctx, SVAL.scroll.teleport),
        borgActivateItem(ctx, "act_tele_phase")
      );
      if (c) {
        resetAntisummon(ctx, fs);
        return c;
      }
    }
    if (borgCautionPhase(ctx, 75, 2) && ctx.world.clock - fs.tAntisummon > 50) {
      const c = firstCmd(
        borgSpellFail(ctx, 3 /* PHASE_DOOR */, allowFail),
        borgSpellFail(ctx, 69 /* PORTAL */, allowFail),
        borgShadowShift(ctx, allowFail),
        borgActivateItem(ctx, "act_tele_phase"),
        borgReadScroll(ctx, SVAL.scroll.phase_door)
      );
      if (c) {
        ctx.world.self.escapes--;
        resetAntisummon(ctx, fs);
        return c;
      }
    }
    const off = borgTeleportOffLevel(ctx);
    if (off) {
      resetAntisummon(ctx, fs);
      return off;
    }
    if (!ctx.world.self.goal.fleeing && (!uniq || clevel < 35) && !ctx.world.facts.vaultOnLevel)
      ctx.world.self.goal.fleeing = true;
    if (!ctx.world.self.goal.leaving && (!uniq || clevel < 35) && !ctx.world.facts.vaultOnLevel)
      ctx.world.self.goal.leaving = true;
  }
  if (bQ > idiv(av3 * (8 + risky), 10) && (clevel < 35 || curhp <= idiv(maxhp, 3)) || bQ > idiv(av3 * (9 + risky), 10) && uniq >= 1 && uniq <= 8 && (clevel < 35 || curhp <= idiv(maxhp, 3)) || bQ > idiv(av3 * (6 + risky), 10) && clevel <= 20 && !uniq || bQ > idiv(av3 * (6 + risky), 10) && clevel <= 35) {
    if ((borgEscapeStair(ctx) || borgCautionPhase(ctx, 20, 2)) && ctx.world.clock - fs.tAntisummon > 50) {
      const c = firstCmd(
        borgSpellFail(ctx, 3 /* PHASE_DOOR */, allowFail),
        borgSpellFail(ctx, 69 /* PORTAL */, allowFail),
        borgActivateItem(ctx, "act_tele_phase"),
        borgShadowShift(ctx, allowFail),
        borgReadScroll(ctx, SVAL.scroll.phase_door)
      );
      if (c) {
        ctx.world.self.escapes--;
        resetAntisummon(ctx, fs);
        return c;
      }
    }
    if (borgAllowTeleport(ctx)) {
      const c = firstCmd(
        borgDimensionDoor(ctx, allowFail),
        borgSpellFail(ctx, 14 /* TELEPORT_SELF */, allowFail),
        borgSpellFail(ctx, 69 /* PORTAL */, allowFail),
        borgActivateItem(ctx, "act_tele_long"),
        borgShadowShift(ctx, allowFail),
        borgReadScroll(ctx, SVAL.scroll.teleport),
        borgUseStaffFail(ctx, SVAL.staff.teleportation)
      );
      if (c) {
        resetAntisummon(ctx, fs);
        return c;
      }
    }
    if (!ctx.world.self.goal.fleeing && !uniq && clevel < 25 && !ctx.world.facts.vaultOnLevel)
      ctx.world.self.goal.fleeing = true;
    if (!ctx.world.self.goal.leaving && !uniq && !ctx.world.facts.vaultOnLevel)
      ctx.world.self.goal.leaving = true;
    if ((trait3(ctx, 25 /* CLASS */) === CLASS_MAGE || trait3(ctx, 25 /* CLASS */) === CLASS_NECROMANCER) && clevel <= 35 && borgCautionPhase(ctx, 65, 2) && ctx.world.clock - fs.tAntisummon > 50) {
      const c = firstCmd(
        borgSpellFail(ctx, 3 /* PHASE_DOOR */, allowFail),
        borgActivateItem(ctx, "act_tele_phase"),
        borgActivateItem(ctx, "act_tele_long"),
        borgReadScroll(ctx, SVAL.scroll.phase_door)
      );
      if (c) {
        ctx.world.self.escapes--;
        resetAntisummon(ctx, fs);
        return c;
      }
    }
  }
  if (clevel < 10 && (bQ > idiv(av3 * (5 + risky), 10) || bQ > idiv(av3 * (7 + risky), 10) && uniq >= 1 && uniq <= 8)) {
    if (borgEscapeStair(ctx) || borgCautionPhase(ctx, 20, 2)) {
      const c = firstCmd(
        borgSpellFail(ctx, 3 /* PHASE_DOOR */, allowFail),
        borgSpellFail(ctx, 69 /* PORTAL */, allowFail),
        borgActivateItem(ctx, "act_tele_phase"),
        borgShadowShift(ctx, allowFail),
        borgReadScroll(ctx, SVAL.scroll.phase_door)
      );
      if (c) {
        resetAntisummon(ctx, fs);
        return c;
      }
    }
    if (borgAllowTeleport(ctx)) {
      const c = firstCmd(
        borgDimensionDoor(ctx, allowFail),
        borgSpellFail(ctx, 14 /* TELEPORT_SELF */, allowFail),
        borgSpellFail(ctx, 69 /* PORTAL */, allowFail),
        borgShadowShift(ctx, allowFail),
        borgActivateItem(ctx, "act_tele_long"),
        borgReadScroll(ctx, SVAL.scroll.teleport),
        borgUseStaffFail(ctx, SVAL.staff.teleportation)
      );
      if (c) {
        resetAntisummon(ctx, fs);
        return c;
      }
    }
    if (!ctx.world.self.goal.fleeing && !uniq) ctx.world.self.goal.fleeing = true;
    if (!ctx.world.self.goal.leaving && !uniq) ctx.world.self.goal.leaving = true;
    if ((trait3(ctx, 25 /* CLASS */) === CLASS_MAGE || trait3(ctx, 25 /* CLASS */) === CLASS_NECROMANCER) && clevel <= 8 && borgCautionPhase(ctx, 65, 2)) {
      const c = firstCmd(
        borgSpellFail(ctx, 3 /* PHASE_DOOR */, allowFail),
        borgActivateItem(ctx, "act_tele_phase"),
        borgReadScroll(ctx, SVAL.scroll.phase_door),
        borgActivateItem(ctx, "act_tele_long")
      );
      if (c) {
        ctx.world.self.escapes--;
        resetAntisummon(ctx, fs);
        return c;
      }
    }
  }
  if ((trait3(ctx, 25 /* CLASS */) === CLASS_MAGE || trait3(ctx, 25 /* CLASS */) === CLASS_PRIEST || trait3(ctx, 25 /* CLASS */) === CLASS_NECROMANCER) && (bQ > idiv(av3 * (6 + risky), 10) || bQ > idiv(av3 * (8 + risky), 10) && uniq >= 1 && uniq <= 8) && trait3(ctx, 30 /* CURSP */) <= idiv(trait3(ctx, 31 /* MAXSP */) * 1, 10) && trait3(ctx, 31 /* MAXSP */) >= 100) {
    if ((borgEscapeStair(ctx) || borgCautionPhase(ctx, 20, 2)) && ctx.world.clock - fs.tAntisummon > 50) {
      const c = firstCmd(
        borgSpellFail(ctx, 3 /* PHASE_DOOR */, allowFail),
        borgSpellFail(ctx, 69 /* PORTAL */, allowFail),
        borgActivateItem(ctx, "act_tele_phase"),
        borgReadScroll(ctx, SVAL.scroll.phase_door)
      );
      if (c) {
        resetAntisummon(ctx, fs);
        return c;
      }
    }
    if (borgAllowTeleport(ctx)) {
      const c = firstCmd(
        borgDimensionDoor(ctx, allowFail),
        borgSpellFail(ctx, 14 /* TELEPORT_SELF */, allowFail),
        borgSpellFail(ctx, 69 /* PORTAL */, allowFail),
        borgActivateItem(ctx, "act_tele_long"),
        borgReadScroll(ctx, SVAL.scroll.teleport),
        borgUseStaffFail(ctx, SVAL.staff.teleportation)
      );
      if (c) {
        resetAntisummon(ctx, fs);
        return c;
      }
    }
  }
  if ((borgSpellOkayFail(ctx, 3 /* PHASE_DOOR */, allowFail) || borgSpellOkayFail(ctx, 69 /* PORTAL */, allowFail)) && borgShootScootSafe(ctx, 20, 2)) {
    const c = firstCmd(borgSpellFail(ctx, 3 /* PHASE_DOOR */, allowFail), borgSpellFail(ctx, 69 /* PORTAL */, allowFail));
    if (c) {
      ctx.world.self.escapes--;
      resetAntisummon(ctx, fs);
      return c;
    }
  }
  if (ctx.world.self.timesTwitch > 50) {
    if ((borgEscapeStair(ctx) || borgCautionPhase(ctx, 20, 2)) && ctx.world.clock - fs.tAntisummon > 50) {
      const c = firstCmd(
        borgSpellFail(ctx, 3 /* PHASE_DOOR */, allowFail),
        borgSpellFail(ctx, 69 /* PORTAL */, allowFail),
        borgActivateItem(ctx, "act_tele_phase"),
        borgReadScroll(ctx, SVAL.scroll.phase_door)
      );
      if (c) {
        ctx.world.self.timesTwitch = 0;
        resetAntisummon(ctx, fs);
        return c;
      }
    }
    if (borgAllowTeleport(ctx)) {
      const c = firstCmd(
        borgDimensionDoor(ctx, allowFail),
        borgSpellFail(ctx, 14 /* TELEPORT_SELF */, allowFail),
        borgSpellFail(ctx, 69 /* PORTAL */, allowFail),
        borgActivateItem(ctx, "act_tele_long"),
        borgReadScroll(ctx, SVAL.scroll.teleport),
        borgUseStaffFail(ctx, SVAL.staff.teleportation),
        borgTeleportOffLevel(ctx)
      );
      if (c) {
        ctx.world.self.timesTwitch = 0;
        resetAntisummon(ctx, fs);
        return c;
      }
    }
  }
  return null;
}

// src/fight/defend.ts
function av(ctx) {
  return getDangerGlobals(ctx.world).avoidance;
}
function dangerAvg(ctx) {
  return borgDanger(ctx, ctx.world.self.c.y, ctx.world.self.c.x, 1, false, false);
}
function screwed(ctx) {
  return !!(trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */) || trait3(ctx, 121 /* ISFORGET */));
}
function lit(ctx) {
  const { x, y } = ctx.world.self.c;
  const glow = ctx.world.map.inBounds(x, y) && (ctx.world.map.at(x, y).info & BORG_GLOW) !== 0;
  return glow || trait3(ctx, 26 /* LIGHT */) !== 0;
}
function improved(ctx, p1, p2) {
  const cap = getFightState(ctx.world).fightingUnique ? idiv(av(ctx) * 2, 3) : idiv(av(ctx), 2);
  return p1 > p2 && p2 <= cap && p1 > idiv(av(ctx), 7);
}
function scaleFail(ctx, p1, base, mid = 10) {
  let fa = base;
  if (p1 > av(ctx)) fa -= 19;
  else if (p1 > idiv(av(ctx) * 2, 3)) fa -= mid;
  else if (p1 < idiv(av(ctx), 3)) fa += 10;
  return fa;
}
function withTemp(ctx, keys, vals, fn) {
  const t = ctx.world.self.temp;
  const saved = keys.map((k) => t[k]);
  keys.forEach((k, i) => t[k] = vals[i]);
  const r = fn();
  keys.forEach((k, i) => t[k] = saved[i]);
  return r;
}
function auxBless(ctx, fs, p1) {
  const fa = 25;
  if (ctx.world.self.temp.bless) return 0;
  if (screwed(ctx)) return 0;
  if (!lit(ctx)) return 0;
  if (!borgSpellOkayFail(ctx, 60 /* BLESS */, fa) && !borgEquipsItem(ctx, "act_blessing", true) && !borgEquipsItem(ctx, "act_blessing2", true) && !borgEquipsItem(ctx, "act_blessing3", true) && !borgSlot(ctx, TV.SCROLL, SVAL.scroll.blessing) && !borgSlot(ctx, TV.SCROLL, SVAL.scroll.holy_chant) && !borgSlot(ctx, TV.SCROLL, SVAL.scroll.holy_prayer))
    return 0;
  let nearKill = false;
  for (const [, kill] of ctx.world.kills.entries()) {
    if (!kill.rIdx) continue;
    if (kill.when < ctx.world.clock - 5) continue;
    if (Math.max(Math.abs(kill.pos.y - ctx.world.self.c.y), Math.abs(kill.pos.x - ctx.world.self.c.x)) > 3) continue;
    nearKill = true;
  }
  if ((p1 > idiv(av(ctx), 12) || trait3(ctx, 35 /* CLEVEL */) <= 15) && p1 > 0 && nearKill && p1 < idiv(av(ctx), 2)) {
    if (fs.simulate) return 1;
    ctx.world.self.noRestPrep = 11e3;
    fs.pending = borgSpell(ctx, 60 /* BLESS */) || borgActivateItem(ctx, "act_blessing") || borgActivateItem(ctx, "act_blessing2") || borgActivateItem(ctx, "act_blessing3") || borgReadScroll(ctx, SVAL.scroll.blessing) || borgReadScroll(ctx, SVAL.scroll.holy_chant) || borgReadScroll(ctx, SVAL.scroll.holy_prayer);
    return fs.pending ? 1 : 0;
  }
  return 0;
}
function auxSpeed(ctx, fs, p1) {
  let fa = 25;
  if (ctx.world.self.temp.fast) return 0;
  if (screwed(ctx)) return 0;
  fa = scaleFail(ctx, p1, 25);
  const speedSpell = borgSpellOkayFail(ctx, 48 /* HASTE_SELF */, fa);
  const speedStaff = borgEquipsStaffFail(ctx, SVAL.staff.speed);
  const speedRod = borgEquipsRod(ctx, SVAL.rod.speed);
  const haste = borgEquipsItem(ctx, "act_haste", true) || borgEquipsItem(ctx, "act_haste1", true) || borgEquipsItem(ctx, "act_haste2", true);
  if (!borgSlot(ctx, TV.POTION, SVAL.potion.speed) && !speedStaff && !speedRod && !speedSpell && !haste) return 0;
  const goodSpeed = speedRod || speedSpell || speedStaff || haste;
  let p2 = withTemp(ctx, ["fast"], [true], () => borgDanger(ctx, ctx.world.self.c.y, ctx.world.self.c.x, 1, true, false));
  if (ctx.world.facts.scaryGuyOnLevel) p2 = idiv(p2 * 3, 10);
  if (goodSpeed && fs.fightingUnique) p2 = idiv(p2 * 7, 10);
  if (fs.fightingSummoner && fs.fightingUnique) p2 = idiv(p2 * 7, 10);
  if (trait3(ctx, 105 /* CDEPTH */) === 99 && fs.fightingUnique >= 10) p2 = idiv(p2 * 6, 10);
  if (trait3(ctx, 105 /* CDEPTH */) === 100 && fs.fightingUnique >= 10) p2 = idiv(p2 * 5, 10);
  if (trait3(ctx, 105 /* CDEPTH */) >= 97 && !fs.fightingUnique && !goodSpeed) p2 = 9999;
  const capU = fs.fightingUnique ? idiv(av(ctx) * 2, 3) : idiv(av(ctx), 2);
  const capU2 = fs.fightingUnique ? idiv(av(ctx) * 2, 3) : idiv(av(ctx), 3);
  if (p1 > p2 && p2 <= capU && p1 > idiv(av(ctx), 5) && goodSpeed || p1 > p2 && p2 <= capU2 && p1 > idiv(av(ctx), 7)) {
    if (fs.simulate) return p1 - p2;
    ctx.world.self.noRestPrep = trait3(ctx, 35 /* CLEVEL */) * 1e3;
    fs.pending = borgZapRod(ctx, SVAL.rod.speed) || borgActivateItem(ctx, "act_haste") || borgActivateItem(ctx, "act_haste1") || borgActivateItem(ctx, "act_haste2") || borgUseStaff(ctx, SVAL.staff.speed) || borgQuaffPotion(ctx, SVAL.potion.speed) || borgSpellFail(ctx, 48 /* HASTE_SELF */, fa);
    return fs.pending ? p1 - p2 : 0;
  }
  return 0;
}
function auxGrimPurpose(ctx, fs, p1) {
  if (trait3(ctx, 78 /* RCONF */) && trait3(ctx, 86 /* FRACT */)) return 0;
  if (screwed(ctx)) return 0;
  const fa = scaleFail(ctx, p1, 25);
  if (!borgSpellOkayFail(ctx, 123 /* GRIM_PURPOSE */, fa)) return 0;
  p1 = dangerAvg(ctx);
  const t = ctx.world.self.trait;
  const savedConf = t[78 /* RCONF */];
  const savedFa = t[86 /* FRACT */];
  t[78 /* RCONF */] = 1;
  t[86 /* FRACT */] = 1;
  const p2 = dangerAvg(ctx);
  t[78 /* RCONF */] = savedConf;
  t[86 /* FRACT */] = savedFa;
  if (improved(ctx, p1, p2)) {
    if (fs.simulate) return p1 - p2 + 2;
    fs.pending = borgSpell(ctx, 123 /* GRIM_PURPOSE */);
    return fs.pending ? p1 - p2 + 2 : 0;
  }
  return 0;
}
function auxResistFecap(ctx, fs, p1) {
  const t = ctx.world.self.temp;
  if (t.resFire && t.resAcid && t.resPois && t.resElec && t.resCold) return 0;
  if (screwed(ctx)) return 0;
  if (!borgEquipsItem(ctx, "act_resist_all", true) && !borgEquipsItem(ctx, "act_rage_bless_resist", true)) return 0;
  p1 = dangerAvg(ctx);
  let p2 = withTemp(
    ctx,
    ["resFire", "resElec", "resCold", "resAcid", "resPois"],
    [true, true, true, true, true],
    () => dangerAvg(ctx)
  );
  if (trait3(ctx, 35 /* CLEVEL */) >= 45) p2 = idiv(p2 * 8, 10);
  if (improved(ctx, p1, p2)) {
    if (fs.simulate) return p1 - p2 + 2;
    fs.pending = borgActivateItem(ctx, "act_resist_all") || borgActivateItem(ctx, "act_rage_bless_resist");
    if (fs.pending) ctx.world.self.noRestPrep = 21e3;
    return fs.pending ? p1 - p2 + 2 : 0;
  }
  return 0;
}
function auxResistElement(ctx, fs, p1, key, spell, available, means) {
  if (ctx.world.self.temp[key]) return 0;
  if (screwed(ctx)) return 0;
  const fa = scaleFail(ctx, p1, 25);
  if (!borgSpellOkayFail(ctx, spell, fa) && !available) return 0;
  p1 = dangerAvg(ctx);
  const p2 = withTemp(ctx, [key], [true], () => dangerAvg(ctx));
  if (improved(ctx, p1, p2)) {
    if (fs.simulate) return p1 - p2;
    fs.pending = borgSpellFail(ctx, spell, fa) || means();
    if (fs.pending) ctx.world.self.noRestPrep = 21e3;
    return fs.pending ? p1 - p2 : 0;
  }
  return 0;
}
function auxProtEvil(ctx, fs, p1) {
  if (ctx.world.self.temp.protFromEvil) return 0;
  if (screwed(ctx)) return 0;
  const fa = scaleFail(ctx, p1, 25, 5);
  let ok = borgSpellOkayFail(ctx, 67 /* PROTECTION_FROM_EVIL */, fa);
  if (borgSlot(ctx, TV.SCROLL, SVAL.scroll.protection_from_evil)) ok = true;
  if (!lit(ctx)) ok = false;
  if (borgEquipsItem(ctx, "act_protevil", true)) ok = true;
  if (!ok) return 0;
  p1 = dangerAvg(ctx);
  const p2 = withTemp(ctx, ["protFromEvil"], [true], () => dangerAvg(ctx));
  if (improved(ctx, p1, p2)) {
    if (fs.simulate) return p1 - p2;
    fs.pending = borgSpellFail(ctx, 67 /* PROTECTION_FROM_EVIL */, fa) || borgActivateItem(ctx, "act_protevil") || borgReadScroll(ctx, SVAL.scroll.protection_from_evil);
    if (fs.pending) ctx.world.self.noRestPrep = trait3(ctx, 35 /* CLEVEL */) * 1e3;
    return fs.pending ? p1 - p2 : 0;
  }
  return 0;
}
function auxShield(ctx, fs, p1) {
  if (ctx.world.self.temp.shield) return 0;
  if (screwed(ctx)) return 0;
  if (!borgSlot(ctx, TV.MUSHROOM, SVAL.mush.stoneskin) && !borgEquipsItem(ctx, "act_shroom_stone", true)) return 0;
  let p2 = withTemp(ctx, ["shield"], [true], () => borgDanger(ctx, ctx.world.self.c.y, ctx.world.self.c.x, 1, true, false));
  if (fs.fightingUnique) p2 = idiv(p2 * 7, 10);
  if (improved(ctx, p1, p2)) {
    if (fs.simulate) return p1 - p2;
    fs.pending = borgEat(ctx, TV.MUSHROOM, SVAL.mush.stoneskin) || borgActivateItem(ctx, "act_shroom_stone");
    if (fs.pending) {
      ctx.world.self.noRestPrep = 2e3;
      return p1 - p2;
    }
  }
  return 0;
}
function auxTeleAway(ctx, fs, p1) {
  if (screwed(ctx)) return 0;
  if (fs.fightingUnique) {
    if (p1 < idiv(av(ctx) * 7, 10) && trait3(ctx, 30 /* CURSP */) > 30 && fs.simulate) return 0;
  } else {
    if (p1 < idiv(av(ctx) * 5, 10) && trait3(ctx, 30 /* CURSP */) > 30 && fs.simulate) return 0;
  }
  if (p1 < idiv(av(ctx) * 4, 10) && fs.simulate) return 0;
  let fa = 50;
  if (p1 > av(ctx) * 3) fa -= 10;
  else if (p1 > av(ctx) * 2) fa -= 5;
  else if (p1 > idiv(av(ctx) * 5, 2)) fa += 5;
  const wandSlot = borgSlot(ctx, TV.WAND, SVAL.wand.teleport_away);
  const spellOk = borgSpellOkayFail(ctx, 15 /* TELEPORT_OTHER */, fa) || borgEquipsItem(ctx, "act_tele_other", true) || wandSlot !== null && wandSlot.pval > 0;
  if (!spellOk) return 0;
  const g = getDangerGlobals(ctx.world);
  fs.tempN = 0;
  g.tpOtherIndices.length = 0;
  for (const [, kill] of ctx.world.kills.entries()) {
    if (!kill.rIdx) continue;
    if (kill.when < ctx.world.clock - 2) continue;
    if (!ctx.world.map.inBounds(kill.pos.x, kill.pos.y)) continue;
    const ag = ctx.world.map.at(kill.pos.x, kill.pos.y);
    if (!(ag.info & 8)) continue;
    if (!(ag.info & 32)) continue;
    if (ag.feat >= FEAT.RUBBLE && ag.feat <= FEAT.PERM) continue;
    const d = Math.max(Math.abs(kill.pos.y - ctx.world.self.c.y), Math.abs(kill.pos.x - ctx.world.self.c.x));
    if (d > (ctx.view.constants().maxRange ?? 20)) continue;
    fs.tempX[fs.tempN] = kill.pos.x;
    fs.tempY[fs.tempN] = kill.pos.y;
    fs.tempN++;
  }
  if (!fs.tempN && fs.simulate) return 0;
  const p2 = borgLaunchBolt(ctx, fs, 0, p1, 45 /* AWAY_ALL */, ctx.view.constants().maxRange ?? 20, null);
  if (p2 <= 0) return 0;
  if (fs.simulate) {
    fs.tempN = 0;
    g.tpOtherIndices.length = 0;
    return p2 && p2 > idiv(av(ctx), 2) ? p2 : 0;
  }
  fs.tempN = 0;
  g.tpOtherIndices.length = 0;
  fs.pending = borgSpell(ctx, 15 /* TELEPORT_OTHER */) || borgActivateItem(ctx, "act_tele_other") || borgAimWand(ctx, SVAL.wand.teleport_away);
  if (fs.pending) fs.successfulTarget = -1;
  return fs.pending ? p2 : 0;
}
function auxHero(ctx, fs, p1) {
  const fa = 15;
  if (ctx.world.self.temp.hero) return 0;
  if (screwed(ctx)) return 0;
  const spell = borgSpellOkayFail(ctx, 62 /* HEROISM */, fa) && trait3(ctx, 35 /* CLEVEL */) >= borgHeroismLevel(ctx);
  const potion = borgSlot(ctx, TV.POTION, SVAL.potion.heroism) !== null;
  if (!potion && !spell) return 0;
  if (p1 > idiv(av(ctx), 10) && p1 < idiv(av(ctx) * (fs.fightingUnique ? 7 : 5), 10)) {
    if (fs.simulate) return 1;
    ctx.world.self.noRestPrep = 1e4;
    fs.pending = (spell ? borgSpell(ctx, 62 /* HEROISM */) : null) || borgQuaffPotion(ctx, SVAL.potion.heroism);
    return fs.pending ? 1 : 0;
  }
  return 0;
}
function auxRegen(ctx, fs, p1) {
  const fa = 15;
  if (ctx.world.self.temp.regen) return 0;
  if (screwed(ctx)) return 0;
  if (trait3(ctx, 28 /* MAXHP */) < 100) return 0;
  if (!borgSpellOkayFail(ctx, 50 /* RAPID_REGENERATION */, fa)) return 0;
  if (p1 > idiv(av(ctx), 10) && p1 < idiv(av(ctx) * (fs.fightingUnique ? 7 : 5), 10)) {
    if (fs.simulate) return 1;
    fs.pending = borgSpell(ctx, 50 /* RAPID_REGENERATION */);
    if (fs.pending) {
      ctx.world.self.noRestPrep = 1e4;
      return 1;
    }
  }
  return 0;
}
function auxBerserk(ctx, fs, p1) {
  const fa = 15;
  if (ctx.world.self.temp.berserk) return 0;
  if (screwed(ctx)) return 0;
  if (!borgSpellOkayFail(ctx, 119 /* BERSERK_STRENGTH */, fa) && !borgSlot(ctx, TV.POTION, SVAL.potion.berserk) && !borgEquipsItem(ctx, "act_berserker", true) && !borgEquipsItem(ctx, "act_rage_bless_resist", true) && !borgEquipsItem(ctx, "act_shero", true))
    return 0;
  if (p1 > idiv(av(ctx), 10) && p1 < idiv(av(ctx) * (fs.fightingUnique ? 7 : 5), 10)) {
    if (fs.simulate) return 5;
    fs.pending = borgSpell(ctx, 119 /* BERSERK_STRENGTH */) || borgActivateItem(ctx, "act_berserker") || borgActivateItem(ctx, "act_rage_bless_resist") || borgActivateItem(ctx, "act_shero") || borgQuaffPotion(ctx, SVAL.potion.berserk);
    return fs.pending ? 5 : 0;
  }
  return 0;
}
function nearEvil(ctx) {
  for (const [i, kill] of ctx.world.kills.entries()) {
    if (!kill.rIdx) continue;
    if (kill.when < ctx.world.clock - 2) continue;
    if (!ctx.world.map.inBounds(kill.pos.x, kill.pos.y)) continue;
    if (!(ctx.world.map.at(kill.pos.x, kill.pos.y).info & 8)) continue;
    if (Math.max(Math.abs(kill.pos.y - ctx.world.self.c.y), Math.abs(kill.pos.x - ctx.world.self.c.x)) > 3) continue;
    if (getDangerGlobals(ctx.world).resolveFacts(ctx, i).flags.has("EVIL")) return true;
  }
  return false;
}
function auxSmiteEvil(ctx, fs, p1) {
  const fa = 15;
  if (ctx.world.self.temp.smiteEvil || trait3(ctx, 194 /* WS_EVIL */)) return 0;
  if (screwed(ctx)) return 0;
  if (!borgSpellOkayFail(ctx, 77 /* SMITE_EVIL */, fa)) return 0;
  if (!nearEvil(ctx)) return 0;
  if (p1 > idiv(av(ctx), 10) && p1 < idiv(av(ctx) * (fs.fightingUnique ? 7 : 5), 10)) {
    if (fs.simulate) return 5;
    fs.pending = borgSpell(ctx, 77 /* SMITE_EVIL */);
    return fs.pending ? 5 : 0;
  }
  return 0;
}
function auxGlyph(ctx, fs, p1) {
  if (screwed(ctx)) return 0;
  const { x, y } = ctx.world.self.c;
  if (!ctx.world.map.inBounds(x, y)) return 0;
  const ag = ctx.world.map.at(x, y);
  if (ag.take || ag.trap || ag.feat === FEAT.LESS || ag.feat === FEAT.MORE || ag.feat === FEAT.OPEN || ag.feat === FEAT.BROKEN)
    return 0;
  if (fs.fightingUnique >= 10) return 0;
  const fa = scaleFail(ctx, p1, 25, 5);
  let ok = borgSpellOkayFail(ctx, 78 /* GLYPH_OF_WARDING */, fa);
  if (borgSlot(ctx, TV.SCROLL, SVAL.scroll.rune_of_protection)) ok = true;
  if (borgEquipsItem(ctx, "act_glyph", true)) ok = true;
  if (!lit(ctx)) ok = false;
  if (!ok) return 0;
  const g = getDangerGlobals(ctx.world);
  g.onGlyph = true;
  const p2 = borgDanger(ctx, y, x, 1, true, false);
  g.onGlyph = false;
  if (improved(ctx, p1, p2)) {
    if (fs.simulate) return p1 - p2;
    fs.pending = borgSpellFail(ctx, 78 /* GLYPH_OF_WARDING */, fa) || borgReadScroll(ctx, SVAL.scroll.rune_of_protection) || borgActivateItem(ctx, "act_glyph");
    return fs.pending ? p1 - p2 : 0;
  }
  return 0;
}
function auxCreateDoor(ctx, fs, p1) {
  if (screwed(ctx)) return 0;
  if (!fs.fightingSummoner) return 0;
  const fa = scaleFail(ctx, p1, 30, 5);
  if (!borgSpellOkayFail(ctx, 19 /* DOOR_CREATION */, fa)) return 0;
  let doorBad = 0;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const x = ctx.world.self.c.x + dx;
      const y = ctx.world.self.c.y + dy;
      if (!ctx.world.map.inBounds(x, y)) continue;
      const ag = ctx.world.map.at(x, y);
      if (ag.glyph || ag.kill || ag.feat === FEAT.GRANITE || ag.feat === FEAT.PERM || ag.feat === FEAT.CLOSED) doorBad++;
      if (ag.take || ag.trap || ag.feat === FEAT.LESS || ag.feat === FEAT.MORE || ag.feat === FEAT.OPEN || ag.feat === FEAT.BROKEN || ag.kill)
        doorBad++;
    }
  }
  if (doorBad >= 6) return 0;
  const g = getDangerGlobals(ctx.world);
  g.createDoor = true;
  const p2 = borgDanger(ctx, ctx.world.self.c.y, ctx.world.self.c.x, 1, true, false);
  g.createDoor = false;
  if (improved(ctx, p1, p2)) {
    if (fs.simulate) return p1 - p2;
    fs.pending = borgSpellFail(ctx, 19 /* DOOR_CREATION */, fa);
    if (fs.pending) {
      ctx.world.facts.breederLevel = true;
      return p1 - p2;
    }
  }
  return 0;
}
function auxEarthquake(ctx, fs, p1) {
  if (!fs.simulate) {
    fs.pending = borgSpell(ctx, 47 /* TREMOR */) || borgSpell(ctx, 132 /* QUAKE */) || borgSpell(ctx, 101 /* GRONDS_BLOW */) || borgActivateItem(ctx, "act_earthquakes");
    return fs.pending ? 9999 : 0;
  }
  if (screwed(ctx)) return 0;
  if (!borgSpellOkayFail(ctx, 47 /* TREMOR */, 35) && !borgSpellOkayFail(ctx, 132 /* QUAKE */, 35) && !borgSpellOkayFail(ctx, 101 /* GRONDS_BLOW */, 35) && !borgEquipsItem(ctx, "act_earthquakes", true))
    return 0;
  if (p1 < idiv(av(ctx) * 6, 10) && !fs.fightingSummoner) return 0;
  let threat = 0;
  for (const [, kill] of ctx.world.kills.entries()) {
    if (!kill.rIdx) continue;
    if (borgLos(ctx.world, ctx.world.self.c.y, ctx.world.self.c.x, kill.pos.y, kill.pos.x) && kill.rangedAttack && Math.max(Math.abs(kill.pos.y - ctx.world.self.c.y), Math.abs(kill.pos.x - ctx.world.self.c.x)) >= 2)
      threat++;
  }
  let p2 = 9999;
  if (threat >= 4 && p1 > idiv(av(ctx) * 7, 10)) p2 = idiv(p1, 3);
  if (threat === 3 && p1 > idiv(av(ctx) * 7, 10)) p2 = idiv(p1 * 6, 10);
  const cap = fs.fightingUnique ? idiv(av(ctx) * 2, 3) : idiv(av(ctx), 2);
  if (p1 > p2 && p2 <= cap && p1 > idiv(av(ctx), 5)) return p1 - p2;
  return 0;
}
function auxDestruction(ctx, fs, p1) {
  if (screwed(ctx)) return 0;
  if (!fs.simulate) {
    fs.pending = borgSpell(ctx, 81 /* WORD_OF_DESTRUCTION */) || borgUseStaff(ctx, SVAL.staff.destruction) || borgActivateItem(ctx, "act_destruction2");
    return 500;
  }
  if (getDangerGlobals(ctx.world).morgothPosition) return 0;
  let realDanger = false;
  if (p1 > av(ctx)) realDanger = true;
  if (p1 > idiv(av(ctx) * 8, 10) && trait3(ctx, 105 /* CDEPTH */) >= 90 && trait3(ctx, 27 /* CURHP */) <= 300) realDanger = true;
  if (!realDanger) return 0;
  if ((trait3(ctx, 211 /* ATELEPORT */) || trait3(ctx, 247 /* ATELEPORTLVL */)) && !screwed(ctx) && fs.fightingUnique <= 4 && trait3(ctx, 27 /* CURHP */) >= 275 && borgCautionTeleport(ctx, 75, 2))
    return 0;
  if (trait3(ctx, 212 /* AESCAPE */) >= 2 && trait3(ctx, 27 /* CURHP */) >= 275 && borgCautionTeleport(ctx, 75, 2)) return 0;
  let spell = borgSpellOkayFail(ctx, 81 /* WORD_OF_DESTRUCTION */, 55) || borgEquipsStaffFail(ctx, SVAL.staff.destruction) || borgEquipsItem(ctx, "act_destruction2", true);
  if ((p1 > av(ctx) * 4 || p1 > av(ctx) && trait3(ctx, 27 /* CURHP */) <= 150) && borgEquipsStaffFail(ctx, SVAL.staff.destruction)) spell = true;
  if (!spell) return 0;
  let d = p1 - 0;
  if (fs.fightingUnique <= 2 && p1 < av(ctx) * 2) d = 0;
  if (fs.fightingUnique >= 10) d = 0;
  return d;
}
function auxTeleportLevel(ctx, fs, p1) {
  if (!fs.simulate) {
    fs.pending = borgSpell(ctx, 21 /* TELEPORT_LEVEL */);
    return fs.pending ? 500 : 0;
  }
  if (screwed(ctx)) return 0;
  if (p1 < av(ctx) * 2) return 0;
  if ((trait3(ctx, 211 /* ATELEPORT */) || trait3(ctx, 247 /* ATELEPORTLVL */)) && !screwed(ctx) && borgCautionTeleport(ctx, 65, 2)) return 0;
  if (trait3(ctx, 212 /* AESCAPE */) >= 2 && borgCautionTeleport(ctx, 65, 2)) return 0;
  if (!borgSpellOkayFail(ctx, 21 /* TELEPORT_LEVEL */, 55)) return 0;
  if (ctx.world.facts.morgothOnLevel || fs.fightingUnique >= 1 && getDangerGlobals(ctx.world).asPosition) return 0;
  return p1;
}
function auxBanishment(ctx, fs, p1) {
  if (p1 < idiv(av(ctx) * 1, 10)) return 0;
  let fa = 15;
  if (p1 > av(ctx) * 4) fa -= 10;
  if (screwed(ctx)) return 0;
  const usingArtifact = borgEquipsItem(ctx, "act_loskill", true) && trait3(ctx, 27 /* CURHP */) > 100;
  if (!usingArtifact && !borgSpellOkayFail(ctx, 80 /* BANISH_EVIL */, fa)) return 0;
  p1 = 1;
  for (const [i, kill] of ctx.world.kills.entries()) {
    if (!kill.rIdx) continue;
    if (!borgProjectable(ctx.world, getDangerGlobals(ctx.world), ctx.view.constants().maxRange ?? 20, ctx.world.self.c.y, ctx.world.self.c.x, kill.pos.y, kill.pos.x)) continue;
    p1 += borgDangerOneKillLocal(ctx, i);
  }
  let p2 = p1;
  let banished = 0;
  const toDelete = [];
  for (const [i, kill] of ctx.world.kills.entries()) {
    if (!kill.rIdx) continue;
    if (!borgProjectable(ctx.world, getDangerGlobals(ctx.world), ctx.view.constants().maxRange ?? 20, ctx.world.self.c.y, ctx.world.self.c.x, kill.pos.y, kill.pos.x)) continue;
    const facts = getDangerGlobals(ctx.world).resolveFacts(ctx, i);
    if (!facts.flags.has("EVIL")) continue;
    if (facts.flags.has("UNIQUE") && kill.injury > 60) continue;
    if (!borgCaveFloorBold2(ctx.world, kill.pos.y, kill.pos.x)) continue;
    banished++;
    p2 -= borgDangerOneKillLocal(ctx, i);
    toDelete.push(i);
  }
  if (!fs.simulate) {
    for (const i of toDelete) ctx.world.kills.delete(i, ctx.world);
    fs.pending = usingArtifact ? borgActivateItem(ctx, "act_loskill") : borgSpell(ctx, 80 /* BANISH_EVIL */);
    return fs.pending ? p1 - p2 : 0;
  }
  if (p2 <= 0) p2 = 0;
  if (banished === 0) p2 = 9999;
  if (fs.fightingUnique >= 10 && trait3(ctx, 27 /* CURHP */) > 250 && trait3(ctx, 105 /* CDEPTH */) === 99) p2 = 9999;
  if (fs.fightingUnique >= 10 && trait3(ctx, 27 /* CURHP */) > 350 && trait3(ctx, 105 /* CDEPTH */) === 100) p2 = 9999;
  const cap = fs.fightingUnique ? idiv(av(ctx) * 2, 3) : idiv(av(ctx), 2);
  if (p1 > p2 && p2 <= cap) return p1 - p2;
  return 0;
}
function auxInviso(ctx, fs, p1) {
  const fa = 25;
  if (trait3(ctx, 121 /* ISFORGET */) || trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */) || ctx.world.self.temp.seeInv) return 0;
  if (ctx.world.clock > ctx.world.self.temp.needSeeInvis + 5) return 0;
  if (p1 > av(ctx) * 2) return 0;
  if (!borgSlot(ctx, TV.POTION, SVAL.potion.detect_invis) && !borgSlot(ctx, TV.SCROLL, SVAL.scroll.detect_invis) && !borgEquipsStaffFail(ctx, SVAL.staff.detect_invis) && !borgEquipsStaffFail(ctx, SVAL.staff.detect_evil) && !borgSpellOkayFail(ctx, 61 /* SENSE_INVISIBLE */, fa) && !borgSpellOkayFail(ctx, 22 /* DETECTION */, fa) && !borgEquipsItem(ctx, "act_detect_invis", true) && !borgEquipsItem(ctx, "act_detect_evil", true))
    return 0;
  if (!lit(ctx)) return 0;
  if (fs.simulate) return 10;
  fs.pending = borgSpellFail(ctx, 11 /* REVEAL_MONSTERS */, fa) || borgReadScroll(ctx, SVAL.scroll.detect_invis) || borgUseStaff(ctx, SVAL.staff.detect_invis) || borgUseStaff(ctx, SVAL.staff.detect_evil) || borgActivateItem(ctx, "act_detect_invis") || borgActivateItem(ctx, "act_detect_evil");
  if (fs.pending) {
    ctx.world.self.temp.seeInv = 3e3;
    return 10;
  }
  fs.pending = borgQuaffPotion(ctx, SVAL.potion.detect_invis);
  if (fs.pending) {
    ctx.world.self.temp.seeInv = 18e3;
    ctx.world.self.noRestPrep = 18e3;
    return 10;
  }
  fs.pending = borgSpellFail(ctx, 61 /* SENSE_INVISIBLE */, fa);
  if (fs.pending) {
    ctx.world.self.temp.seeInv = 3e4;
    ctx.world.self.noRestPrep = 16e3;
    return 10;
  }
  return 0;
}
function auxLbeam(ctx, fs, p1) {
  if (screwed(ctx)) return 0;
  if (ctx.world.clock > ctx.world.self.temp.needSeeInvis + 2) return 0;
  const y = ctx.world.self.c.y;
  const x = ctx.world.self.c.x;
  const f = (yy, xx) => borgCaveFloorBold2(ctx.world, yy, xx);
  let hallway = false;
  if (f(y - 1, x) && f(y + 1, x) && !f(y, x - 1) && !f(y, x + 1) && !f(y + 1, x - 1) && !f(y + 1, x + 1) && !f(y - 1, x - 1) && !f(y - 1, x + 1)) hallway = true;
  if (f(y, x - 1) && f(y, x + 1) && !f(y - 1, x) && !f(y + 1, x) && !f(y + 1, x - 1) && !f(y + 1, x + 1) && !f(y - 1, x - 1) && !f(y - 1, x + 1)) hallway = true;
  if (f(y - 1, x) && f(y + 1, x) && !f(y, x - 1) && !f(y, x + 1)) hallway = true;
  if (f(y, x - 1) && f(y, x + 1) && !f(y - 1, x) && !f(y + 1, x)) hallway = true;
  if (!hallway) return 0;
  if (fs.simulate && p1 > idiv(av(ctx) * 3, 4)) return 0;
  if (!borgSpellOkayFail(ctx, 64 /* SPEAR_OF_LIGHT */, 25) && !borgSpellOkayFail(ctx, 57 /* CALL_LIGHT */, 25)) return 0;
  if (fs.simulate) return 10;
  fs.pending = borgSpell(ctx, 64 /* SPEAR_OF_LIGHT */) || borgSpell(ctx, 57 /* CALL_LIGHT */);
  return fs.pending ? 10 : 0;
}
function borgDangerOneKillLocal(ctx, i) {
  return borgDangerOneKill(ctx, ctx.world.self.c.y, ctx.world.self.c.x, 1, i, true, true);
}
function getFearRegional(ctx) {
  return getFearCaches(ctx.world).region(ctx.world.self.c.y, ctx.world.self.c.x);
}
function defendAux(ctx, fs, what, p1) {
  switch (what) {
    case 1 /* SPEED */:
      return auxSpeed(ctx, fs, p1);
    case 9 /* PROT_FROM_EVIL */:
      return auxProtEvil(ctx, fs, p1);
    case 2 /* GRIM_PURPOSE */:
      return auxGrimPurpose(ctx, fs, p1);
    case 3 /* RESIST_FECAP */:
      return auxResistFecap(ctx, fs, p1);
    case 4 /* RESIST_F */:
      return auxResistElement(
        ctx,
        fs,
        p1,
        "resFire",
        16 /* RESISTANCE */,
        borgEquipsItem(ctx, "act_resist_all", true) || borgEquipsItem(ctx, "act_resist_fire", true) || borgEquipsItem(ctx, "act_rage_bless_resist", true) || borgEquipsRing(ctx, SVAL.ring.flames) || borgEquipsItem(ctx, "act_ring_flames", true) || borgSlot(ctx, TV.POTION, SVAL.potion.resist_heat) !== null,
        () => borgActivateRing(ctx, SVAL.ring.flames) || borgActivateItem(ctx, "act_resist_all") || borgActivateItem(ctx, "act_resist_fire") || borgActivateItem(ctx, "act_rage_bless_resist") || borgQuaffPotion(ctx, SVAL.potion.resist_heat)
      );
    case 5 /* RESIST_C */:
      return auxResistElement(
        ctx,
        fs,
        p1,
        "resCold",
        16 /* RESISTANCE */,
        borgEquipsItem(ctx, "act_resist_all", true) || borgEquipsItem(ctx, "act_rage_bless_resist", true) || borgEquipsItem(ctx, "act_resist_cold", true) || borgEquipsRing(ctx, SVAL.ring.ice) || borgEquipsItem(ctx, "act_ring_ice", true) || borgSlot(ctx, TV.POTION, SVAL.potion.resist_cold) !== null,
        () => borgActivateRing(ctx, SVAL.ring.ice) || borgActivateItem(ctx, "act_resist_all") || borgActivateItem(ctx, "act_rage_bless_resist") || borgActivateItem(ctx, "act_resist_cold") || borgQuaffPotion(ctx, SVAL.potion.resist_cold)
      );
    case 6 /* RESIST_A */:
      return auxResistElement(
        ctx,
        fs,
        p1,
        "resAcid",
        16 /* RESISTANCE */,
        borgEquipsItem(ctx, "act_resist_acid", true) || borgEquipsItem(ctx, "act_resist_all", true) || borgEquipsItem(ctx, "act_rage_bless_resist", true) || borgEquipsRing(ctx, SVAL.ring.acid),
        () => borgActivateRing(ctx, SVAL.ring.acid) || borgActivateItem(ctx, "act_resist_acid") || borgActivateItem(ctx, "act_resist_all") || borgActivateItem(ctx, "act_rage_bless_resist")
      );
    case 7 /* RESIST_E */:
      return auxResistElement(
        ctx,
        fs,
        p1,
        "resElec",
        16 /* RESISTANCE */,
        borgEquipsItem(ctx, "act_resist_elec", true) || borgEquipsItem(ctx, "act_resist_all", true) || borgEquipsItem(ctx, "act_rage_bless_resist", true) || borgEquipsRing(ctx, SVAL.ring.lightning) || borgEquipsItem(ctx, "act_ring_lightning", true),
        () => borgActivateRing(ctx, SVAL.ring.lightning) || borgActivateItem(ctx, "act_resist_elec") || borgActivateItem(ctx, "act_resist_all") || borgActivateItem(ctx, "act_rage_bless_resist")
      );
    case 8 /* RESIST_P */:
      if (ctx.world.self.temp.resPois) return 0;
      return auxResistElement(
        ctx,
        fs,
        p1,
        "resPois",
        37 /* RESIST_POISON */,
        borgEquipsItem(ctx, "act_resist_pois", true) || borgEquipsItem(ctx, "act_resist_all", true) || borgEquipsItem(ctx, "act_rage_bless_resist", true) || borgSlot(ctx, TV.POTION, SVAL.potion.resist_pois) !== null,
        () => borgActivateItem(ctx, "act_resist_pois") || borgActivateItem(ctx, "act_resist_all") || borgActivateItem(ctx, "act_rage_bless_resist") || borgQuaffPotion(ctx, SVAL.potion.resist_pois)
      );
    case 0 /* BLESS */:
      return auxBless(ctx, fs, p1);
    case 12 /* HERO */:
      return auxHero(ctx, fs, p1);
    case 13 /* BERSERK */:
      return auxBerserk(ctx, fs, p1);
    case 14 /* SMITE_EVIL */:
      return auxSmiteEvil(ctx, fs, p1);
    case 15 /* REGEN */:
      return auxRegen(ctx, fs, p1);
    case 10 /* SHIELD */:
      return auxShield(ctx, fs, p1);
    case 11 /* TELE_AWAY */:
      return auxTeleAway(ctx, fs, p1);
    case 16 /* GLYPH */:
      return auxGlyph(ctx, fs, p1);
    case 17 /* CREATE_DOOR */:
      return auxCreateDoor(ctx, fs, p1);
    case 21 /* EARTHQUAKE */:
      return auxEarthquake(ctx, fs, p1);
    case 22 /* DESTRUCTION */:
      return auxDestruction(ctx, fs, p1);
    case 23 /* TPORTLEVEL */:
      return auxTeleportLevel(ctx, fs, p1);
    case 24 /* BANISHMENT */:
      return auxBanishment(ctx, fs, p1);
    case 25 /* DETECT_INVISO */:
      return auxInviso(ctx, fs, p1);
    case 26 /* LIGHT_BEAM */:
      return auxLbeam(ctx, fs, p1);
    /* GAP: the *genocide* family (defend.c:1720/1851/2157) needs r_ptr->d_char
     * symbols; panel-shift (2817) needs Term panel geometry; rest (2973) and the
     * Morgoth variants (3048/3198/3341) need morgoth-panel/position data not on
     * the borg model. These return 0 (unavailable), which is the faithful
     * "cannot perform this maneuver" result for the best-of scan. */
    case 18 /* MASS_GENOCIDE */:
    case 19 /* GENOCIDE */:
    case 20 /* GENOCIDE_NASTIES */:
    case 27 /* SHIFT_PANEL */:
    case 28 /* REST */:
    case 29 /* TELE_AWAY_MORGOTH */:
    case 30 /* BANISHMENT_MORGOTH */:
    case 31 /* LIGHT_MORGOTH */:
      return 0;
    default:
      return 0;
  }
}
function borgDefend(ctx, p1) {
  const fs = getFightState(ctx.world);
  fs.simulate = true;
  if (ctx.world.self.resistance && ctx.world.self.resistance < ctx.world.self.gameRatio * 2) {
    const g = getDangerGlobals(ctx.world);
    g.attacking = true;
    const p = borgDanger(ctx, ctx.world.self.c.y, ctx.world.self.c.x, 1, false, false);
    g.attacking = false;
    if (p > getFearRegional(ctx) || fs.fightingUnique) {
      const cmd = borgSpell(ctx, 16 /* RESISTANCE */);
      if (cmd) {
        ctx.world.self.resistance = 25e3;
        return cmd;
      }
    }
  }
  let bG = -1;
  let bN = 0;
  for (let g = 0; g < 32 /* MAX */; g++) {
    const n = defendAux(ctx, fs, g, p1);
    if (n <= bN) continue;
    bG = g;
    bN = n;
  }
  if (bN <= 0) return null;
  fs.simulate = false;
  fs.pending = null;
  defendAux(ctx, fs, bG, p1);
  return fs.pending;
}

// src/fight/perm.ts
function uniqueOnLevel(ctx) {
  return ctx.world.facts.uniqueOnLevel !== 0;
}
function failAllowed(ctx, fs, base) {
  let fa = base;
  if (uniqueOnLevel(ctx)) fa = base + 5;
  if (fs.fightingUnique) fa = base + 10;
  return fa;
}
function tooExpensive(ctx, cost) {
  const div2 = uniqueOnLevel(ctx) ? 7 : 10;
  return cost >= idiv(trait3(ctx, 30 /* CURSP */), div2);
}
function auxBless2(ctx, fs) {
  const fa = failAllowed(ctx, fs, 15);
  if (ctx.world.self.temp.bless) return 0;
  if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */)) return 0;
  if (!borgSpellOkayFail(ctx, 60 /* BLESS */, fa)) return 0;
  const cost = borgGetSpellPower(ctx, 60 /* BLESS */);
  if (trait3(ctx, 35 /* CLEVEL */) > 10 && tooExpensive(ctx, cost)) return 0;
  if (fs.simulate) return 1;
  fs.pending = borgSpell(ctx, 60 /* BLESS */);
  ctx.world.self.noRestPrep = 1e4;
  return 1;
}
function auxResist(ctx, fs) {
  const t = ctx.world.self.temp;
  const fa = failAllowed(ctx, fs, 5);
  if ((t.resFire ? 1 : 0) + (t.resAcid ? 1 : 0) + (t.resElec ? 1 : 0) + (t.resCold ? 1 : 0) >= 3) return 0;
  if (!borgSpellOkayFail(ctx, 16 /* RESISTANCE */, fa)) return 0;
  const cost = borgGetSpellPower(ctx, 16 /* RESISTANCE */);
  if (tooExpensive(ctx, cost)) return 0;
  if (fs.simulate) return 2;
  fs.pending = borgSpellFail(ctx, 16 /* RESISTANCE */, fa);
  ctx.world.self.noRestPrep = 21e3;
  return 2;
}
function auxResistColluin(ctx, fs) {
  const t = ctx.world.self.temp;
  if ((t.resFire ? 1 : 0) + (t.resAcid ? 1 : 0) + (t.resPois ? 1 : 0) + (t.resElec ? 1 : 0) + (t.resCold ? 1 : 0) >= 3)
    return 0;
  if (!fs.fightingUnique) return 0;
  if (!borgEquipsItem(ctx, "act_resist_all", true) && !borgEquipsItem(ctx, "act_rage_bless_resist", true)) return 0;
  if (fs.simulate) return 2;
  fs.pending = borgActivateItem(ctx, "act_resist_all") || borgActivateItem(ctx, "act_rage_bless_resist");
  if (fs.pending) ctx.world.self.noRestPrep = 21e3;
  return 2;
}
function auxResistP(ctx, fs) {
  const fa = failAllowed(ctx, fs, 5);
  if (ctx.world.self.temp.resPois || !uniqueOnLevel(ctx)) return 0;
  if (!borgSpellOkayFail(ctx, 37 /* RESIST_POISON */, fa)) return 0;
  const cost = borgGetSpellPower(ctx, 37 /* RESIST_POISON */);
  if (cost >= idiv(trait3(ctx, 30 /* CURSP */), 20)) return 0;
  if (fs.simulate) return 1;
  fs.pending = borgSpellFail(ctx, 37 /* RESIST_POISON */, fa);
  if (fs.pending) {
    ctx.world.self.noRestPrep = 21e3;
    return 1;
  }
  return 0;
}
function auxSpeed2(ctx, fs) {
  const fa = failAllowed(ctx, fs, 7);
  if (ctx.world.self.temp.fast) return 0;
  if (!borgSpellOkayFail(ctx, 48 /* HASTE_SELF */, fa)) return 0;
  const cost = borgGetSpellPower(ctx, 48 /* HASTE_SELF */);
  if (tooExpensive(ctx, cost)) return 0;
  if (fs.simulate) return 5;
  fs.pending = borgSpellFail(ctx, 48 /* HASTE_SELF */, fa);
  if (fs.pending) {
    ctx.world.self.noRestPrep = trait3(ctx, 35 /* CLEVEL */) * 1e3;
    return 5;
  }
  return 0;
}
function auxProtEvil2(ctx, fs) {
  if (ctx.world.self.temp.protFromEvil) return 0;
  const fa = failAllowed(ctx, fs, 5);
  if (!borgSpellOkayFail(ctx, 67 /* PROTECTION_FROM_EVIL */, fa)) return 0;
  const cost = borgGetSpellPower(ctx, 67 /* PROTECTION_FROM_EVIL */);
  if (tooExpensive(ctx, cost)) return 0;
  if (fs.simulate) return 3;
  fs.pending = borgSpellFail(ctx, 67 /* PROTECTION_FROM_EVIL */, fa);
  if (fs.pending) {
    ctx.world.self.noRestPrep = trait3(ctx, 35 /* CLEVEL */) * 1e3;
    return 3;
  }
  return 0;
}
function auxFastcast(ctx, fs) {
  const fa = failAllowed(ctx, fs, 5);
  if (ctx.world.self.temp.fastcast) return 0;
  if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */)) return 0;
  if (!borgSpellOkayFail(ctx, 18 /* MANA_CHANNEL */, fa)) return 0;
  const cost = borgGetSpellPower(ctx, 18 /* MANA_CHANNEL */);
  if (tooExpensive(ctx, cost)) return 0;
  if (fs.simulate) return 5;
  fs.pending = borgSpell(ctx, 18 /* MANA_CHANNEL */);
  if (fs.pending) {
    ctx.world.self.noRestPrep = 6e3;
    return 1;
  }
  return 0;
}
function auxHero2(ctx, fs) {
  const fa = failAllowed(ctx, fs, 5);
  if (ctx.world.self.temp.hero) return 0;
  if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */)) return 0;
  if (trait3(ctx, 35 /* CLEVEL */) <= borgHeroismLevel(ctx)) return 0;
  if (!borgSpellOkayFail(ctx, 62 /* HEROISM */, fa)) return 0;
  const cost = borgGetSpellPower(ctx, 62 /* HEROISM */);
  if (tooExpensive(ctx, cost)) return 0;
  if (fs.simulate) return 1;
  fs.pending = borgSpell(ctx, 62 /* HEROISM */);
  if (fs.pending) {
    ctx.world.self.noRestPrep = 3e3;
    return 1;
  }
  return 0;
}
function auxRegen2(ctx, fs) {
  const fa = failAllowed(ctx, fs, 5);
  if (ctx.world.self.temp.regen) return 0;
  if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */) || trait3(ctx, 121 /* ISFORGET */)) return 0;
  if (trait3(ctx, 28 /* MAXHP */) < 100) return 0;
  if (!borgSpellOkayFail(ctx, 50 /* RAPID_REGENERATION */, fa)) return 0;
  const cost = borgGetSpellPower(ctx, 50 /* RAPID_REGENERATION */);
  if (tooExpensive(ctx, cost)) return 0;
  if (fs.simulate) return 1;
  fs.pending = borgSpell(ctx, 50 /* RAPID_REGENERATION */);
  if (fs.pending) {
    ctx.world.self.noRestPrep = 6e3;
    return 1;
  }
  return 0;
}
function auxSmiteEvil2(ctx, fs) {
  const fa = failAllowed(ctx, fs, 5);
  if (ctx.world.self.temp.smiteEvil || trait3(ctx, 194 /* WS_EVIL */)) return 0;
  if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */)) return 0;
  if (!borgSpellOkayFail(ctx, 77 /* SMITE_EVIL */, fa)) return 0;
  const cost = borgGetSpellPower(ctx, 77 /* SMITE_EVIL */);
  if (tooExpensive(ctx, cost)) return 0;
  if (fs.simulate) return 3;
  fs.pending = borgSpell(ctx, 77 /* SMITE_EVIL */);
  if (fs.pending) {
    ctx.world.self.noRestPrep = 21e3;
    return 3;
  }
  return 0;
}
function auxVenom(ctx, fs) {
  const fa = failAllowed(ctx, fs, 5);
  if (ctx.world.self.temp.venom || trait3(ctx, 209 /* WB_POIS */)) return 0;
  if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */)) return 0;
  if (!borgSpellOkayFail(ctx, 127 /* VENOM */, fa)) return 0;
  const cost = borgGetSpellPower(ctx, 77 /* SMITE_EVIL */);
  if (tooExpensive(ctx, cost)) return 0;
  if (fs.simulate) return 3;
  fs.pending = borgSpell(ctx, 127 /* VENOM */);
  if (fs.pending) {
    ctx.world.self.noRestPrep = 19e3;
    return 3;
  }
  return 0;
}
function auxBerserk2(ctx, fs) {
  const fa = failAllowed(ctx, fs, 5);
  if (ctx.world.self.temp.berserk) return 0;
  if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */)) return 0;
  if (!borgSpellOkayFail(ctx, 119 /* BERSERK_STRENGTH */, fa)) return 0;
  const cost = borgGetSpellPower(ctx, 119 /* BERSERK_STRENGTH */);
  if (tooExpensive(ctx, cost)) return 0;
  if (fs.simulate) return 2;
  fs.pending = borgSpell(ctx, 119 /* BERSERK_STRENGTH */);
  if (fs.pending) {
    ctx.world.self.noRestPrep = 11e3;
    return 2;
  }
  return 0;
}
function auxBerserkPotion(ctx, fs) {
  if (!fs.fightingUnique) return 0;
  if (ctx.world.self.temp.hero || ctx.world.self.temp.berserk) return 0;
  if (!borgSlot(ctx, TV.POTION, SVAL.potion.berserk)) return 0;
  if (fs.simulate) return 2;
  fs.pending = borgQuaffPotion(ctx, SVAL.potion.berserk);
  return fs.pending ? 2 : 0;
}
function auxSeeInv(ctx, fs) {
  const fa = 25;
  if (trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */) || trait3(ctx, 51 /* SINV */) || ctx.world.self.temp.seeInv)
    return 0;
  if (!borgSpellOkayFail(ctx, 61 /* SENSE_INVISIBLE */, fa)) return 0;
  const { x, y } = ctx.world.self.c;
  const glow = ctx.world.map.inBounds(x, y) && (ctx.world.map.at(x, y).info & BORG_GLOW) !== 0;
  if (!glow && !trait3(ctx, 26 /* LIGHT */)) return 0;
  if (fs.simulate) return 10;
  fs.pending = borgSpellFail(ctx, 61 /* SENSE_INVISIBLE */, fa);
  if (fs.pending) {
    ctx.world.self.temp.seeInv = 32e3;
    ctx.world.self.noRestPrep = 16e3;
    return 10;
  }
  return 0;
}
function permaAux(ctx, fs, what) {
  switch (what) {
    case 0 /* SPEED */:
      return auxSpeed2(ctx, fs);
    case 1 /* PROT_FROM_EVIL */:
      return auxProtEvil2(ctx, fs);
    case 3 /* RESIST_ALL */:
      return auxResist(ctx, fs);
    case 4 /* RESIST_ALL_COLLUIN */:
      return auxResistColluin(ctx, fs);
    case 5 /* RESIST_P */:
      return auxResistP(ctx, fs);
    case 2 /* BLESS */:
      return auxBless2(ctx, fs);
    case 6 /* FASTCAST */:
      return auxFastcast(ctx, fs);
    case 7 /* HERO */:
      return auxHero2(ctx, fs);
    case 8 /* BERSERK */:
      return auxBerserk2(ctx, fs);
    case 9 /* BERSERK_POTION */:
      return auxBerserkPotion(ctx, fs);
    case 10 /* SMITE_EVIL */:
      return auxSmiteEvil2(ctx, fs);
    case 11 /* VENOM */:
      return auxVenom(ctx, fs);
    case 12 /* REGEN */:
      return auxRegen2(ctx, fs);
    case 13 /* GLYPH */:
      return 0;
    /* perm.c:731: disabled (uses too much mana) */
    case 14 /* SEE_INV */:
      return auxSeeInv(ctx, fs);
    default:
      return 0;
  }
}
function borgPermaSpell(ctx) {
  const fs = getFightState(ctx.world);
  fs.simulate = true;
  if (!trait3(ctx, 105 /* CDEPTH */)) return null;
  if (trait3(ctx, 105 /* CDEPTH */) < idiv(trait3(ctx, 35 /* CLEVEL */), 3) || trait3(ctx, 105 /* CDEPTH */) < 7) return null;
  if (trait3(ctx, 35 /* CLEVEL */) <= 10) return null;
  if (trait3(ctx, 30 /* CURSP */) < idiv(trait3(ctx, 31 /* MAXSP */) * 75, 100)) return null;
  let bG = -1;
  let bN = 0;
  for (let g = 0; g < 15 /* MAX */; g++) {
    const n = permaAux(ctx, fs, g);
    if (n <= bN) continue;
    bG = g;
    bN = n;
  }
  if (bN <= 0) return null;
  fs.simulate = false;
  fs.pending = null;
  permaAux(ctx, fs, bG);
  return fs.pending;
}

// src/fight/caution.ts
function av2(ctx) {
  return getDangerGlobals(ctx.world).avoidance;
}
function firstCmd2(...cmds) {
  for (const c of cmds) if (c) return c;
  return null;
}
function borgHeal(ctx, danger2) {
  const fs = getFightState(ctx.world);
  const allowFail = 15;
  const maxhp = trait3(ctx, 28 /* MAXHP */);
  const curhp = trait3(ctx, 27 /* CURHP */);
  const hpDown = maxhp - curhp;
  const pctDown = idiv((maxhp - curhp) * 100, maxhp);
  let clwHeal = idiv((maxhp - curhp) * 15, 100);
  let cswHeal = idiv((maxhp - curhp) * 20, 100);
  let ccwHeal = idiv((maxhp - curhp) * 25, 100);
  let cmwHeal = idiv((maxhp - curhp) * 30, 100);
  let healHeal = idiv((maxhp - curhp) * 35, 100);
  if (clwHeal < 15) clwHeal = 15;
  if (cswHeal < 25) cswHeal = 25;
  if (ccwHeal < 30) ccwHeal = 30;
  if (cmwHeal < 50) cmwHeal = 50;
  if (healHeal < 300) healHeal = 300;
  void cmwHeal;
  let rodGood = false;
  if (borgSlot(ctx, TV.ROD, SVAL.rod.healing)) {
    if (borgActivateFailure(ctx, TV.ROD, SVAL.rod.healing) < 500) rodGood = true;
  }
  let statsFix = 0;
  if (trait3(ctx, 127 /* ISFIXSTR */)) statsFix++;
  if (trait3(ctx, 128 /* ISFIXINT */)) statsFix++;
  if (trait3(ctx, 129 /* ISFIXWIS */)) statsFix++;
  if (trait3(ctx, 130 /* ISFIXDEX */)) statsFix++;
  if (trait3(ctx, 131 /* ISFIXCON */)) statsFix++;
  const cls = trait3(ctx, 25 /* CLASS */);
  if (cls === CLASS_MAGE && trait3(ctx, 128 /* ISFIXINT */)) statsFix++;
  if (cls === CLASS_PRIEST && trait3(ctx, 129 /* ISFIXWIS */)) statsFix++;
  if (cls === 2 && trait3(ctx, 129 /* ISFIXWIS */)) statsFix++;
  if (cls === 4 && trait3(ctx, 128 /* ISFIXINT */)) statsFix++;
  if (cls === 0 && trait3(ctx, 131 /* ISFIXCON */)) statsFix++;
  if (maxhp <= 850 && trait3(ctx, 131 /* ISFIXCON */)) statsFix++;
  if (maxhp <= 700 && trait3(ctx, 131 /* ISFIXCON */)) statsFix += 3;
  if (cls === CLASS_PRIEST && trait3(ctx, 31 /* MAXSP */) < 100 && trait3(ctx, 129 /* ISFIXWIS */)) statsFix += 5;
  if (cls === CLASS_MAGE && trait3(ctx, 31 /* MAXSP */) < 100 && trait3(ctx, 128 /* ISFIXINT */)) statsFix += 5;
  if (trait3(ctx, 114 /* ISCONFUSED */)) {
    if (pctDown >= 80 && danger2 - healHeal < curhp) {
      const c2 = borgQuaffPotion(ctx, SVAL.potion.healing);
      if (c2) return c2;
    }
    if (pctDown >= 85 && danger2 >= curhp * 2) {
      const c2 = firstCmd2(borgQuaffPotion(ctx, SVAL.potion.star_healing), borgQuaffPotion(ctx, SVAL.potion.life));
      if (c2) return c2;
    }
    if (danger2 < curhp + cswHeal) {
      const c2 = firstCmd2(
        borgEat(ctx, TV.MUSHROOM, SVAL.mush.cure_mind),
        borgQuaffPotion(ctx, SVAL.potion.cure_serious),
        borgQuaffCrit(ctx, false),
        borgQuaffPotion(ctx, SVAL.potion.healing),
        borgUseStaffFail(ctx, SVAL.staff.healing),
        borgActivateItem(ctx, "act_cure_confusion"),
        borgUseStaffFail(ctx, SVAL.staff.curing)
      );
      if (c2) return c2;
    }
    const c = firstCmd2(borgQuaffCrit(ctx, true), borgQuaffPotion(ctx, SVAL.potion.cure_serious), borgQuaffPotion(ctx, SVAL.potion.healing));
    if (c) return c;
  }
  if (trait3(ctx, 112 /* ISBLIND */) && ctx.rng.randint0(100) < 85) {
    if (hpDown >= 300) {
      const c = borgQuaffPotion(ctx, SVAL.potion.healing);
      if (c) return c;
    }
    if (!(cls === 0 && curhp > idiv(maxhp, 4) && trait3(ctx, 37 /* ESP */))) {
      const c = firstCmd2(
        borgEat(ctx, TV.MUSHROOM, SVAL.mush.fast_recovery),
        borgQuaffPotion(ctx, SVAL.potion.cure_light),
        borgQuaffPotion(ctx, SVAL.potion.cure_serious),
        borgQuaffCrit(ctx, true),
        borgUseStaffFail(ctx, SVAL.staff.healing),
        borgUseStaffFail(ctx, SVAL.staff.curing),
        borgQuaffPotion(ctx, SVAL.potion.healing)
      );
      if (c) return c;
    }
  }
  if ((trait3(ctx, 112 /* ISBLIND */) || trait3(ctx, 114 /* ISCONFUSED */)) && (hpDown >= 400 || danger2 > curhp * 5 && hpDown > 100)) {
    const c = borgQuaffPotion(ctx, SVAL.potion.star_healing);
    if (c) return c;
  }
  if (fs.fightingUnique >= 10) {
    if (curhp <= 700) {
      const c = firstCmd2(
        curhp > 250 ? borgSpellFail(ctx, 82 /* HOLY_WORD */, 14) : null,
        statsFix >= 5 ? borgQuaffPotion(ctx, SVAL.potion.life) : null,
        hpDown > 500 && borgSlot(ctx, TV.POTION, SVAL.potion.star_healing) === null ? borgQuaffPotion(ctx, SVAL.potion.life) : null,
        borgQuaffPotion(ctx, SVAL.potion.star_healing),
        borgQuaffPotion(ctx, SVAL.potion.healing),
        borgActivateItem(ctx, "act_heal1"),
        borgActivateItem(ctx, "act_heal2"),
        borgActivateItem(ctx, "act_heal3"),
        curhp < 250 ? borgSpellFail(ctx, 82 /* HOLY_WORD */, 5) : null,
        curhp > 550 ? borgSpellFail(ctx, 82 /* HOLY_WORD */, 15) : null,
        borgSpellFail(ctx, 72 /* HEALING */, 15),
        borgQuaffPotion(ctx, SVAL.potion.life),
        borgZapRod(ctx, SVAL.rod.healing)
      );
      if (c) return c;
    }
  }
  if (trait3(ctx, 30 /* CURSP */) < idiv(trait3(ctx, 31 /* MAXSP */), 5) && ctx.rng.randint0(100) < 50) {
    const c = firstCmd2(borgUseStaffFail(ctx, SVAL.staff.the_magi), borgActivateItem(ctx, "act_staff_magi"));
    if (c) return c;
  }
  if (trait3(ctx, 30 /* CURSP */) < idiv(trait3(ctx, 31 /* MAXSP */), 10) || trait3(ctx, 30 /* CURSP */) < 70 && trait3(ctx, 31 /* MAXSP */) > 200) {
    if (fs.fightingUnique >= 10 || fs.fightingUnique && danger2 < av2(ctx) * 2 || trait3(ctx, 211 /* ATELEPORT */) + trait3(ctx, 212 /* AESCAPE */) === 0 && danger2 > av2(ctx)) {
      const c = firstCmd2(
        borgUseStaffFail(ctx, SVAL.staff.the_magi),
        borgQuaffPotion(ctx, SVAL.potion.restore_mana),
        borgActivateItem(ctx, "act_restore_mana"),
        borgActivateItem(ctx, "act_staff_magi")
      );
      if (c) return c;
    }
  }
  if (hpDown === 0) return null;
  if (danger2 === 0 && !trait3(ctx, 115 /* ISPOISONED */) && !trait3(ctx, 116 /* ISCUT */)) return null;
  if (statsFix >= 5 && fs.fightingUnique >= 10 && curhp > 650) {
    const c = firstCmd2(borgEat(ctx, TV.MUSHROOM, SVAL.mush.restoring), borgActivateItem(ctx, "act_restore_all"));
    if (c) return c;
  }
  if (fs.fightingUnique >= 10) return null;
  let chance = ctx.rng.randint0(100);
  if (fs.fightingUnique) chance -= 10;
  if (danger2 >= curhp && danger2 < maxhp) chance -= 75;
  else if (cls !== CLASS_PRIEST && cls !== CLASS_PALADIN) chance -= 25;
  if (fs.playsRisky) chance += 5;
  if ((pctDown <= 15 && chance < 98 || pctDown >= 16 && pctDown <= 25 && chance < 95 || pctDown >= 26 && pctDown <= 50 && chance < 80 || pctDown >= 51 && pctDown <= 65 && chance < 50 || pctDown >= 66 && pctDown <= 74 && chance < 25 || pctDown >= 75 && chance < 1) && !trait3(ctx, 118 /* ISHEAVYSTUN */) && !trait3(ctx, 117 /* ISSTUN */) && !trait3(ctx, 115 /* ISPOISONED */) && !trait3(ctx, 116 /* ISCUT */))
    return null;
  if (pctDown >= 30 && (pctDown <= 40 || trait3(ctx, 35 /* CLEVEL */) < 10) && danger2 < curhp + clwHeal && clwHeal > idiv(danger2, 3)) {
    const c = firstCmd2(borgSpellFail(ctx, 59 /* MINOR_HEALING */, allowFail), borgQuaffPotion(ctx, SVAL.potion.cure_light), borgActivateItem(ctx, "act_cure_light"));
    if (c) return c;
  }
  if (pctDown >= 40 && (pctDown <= 50 || trait3(ctx, 35 /* CLEVEL */) < 20) && danger2 < curhp + cswHeal && cswHeal > idiv(danger2, 3)) {
    const c = firstCmd2(borgQuaffPotion(ctx, SVAL.potion.cure_serious), borgActivateItem(ctx, "act_cure_serious"));
    if (c) return c;
  }
  if (pctDown >= 50 && pctDown <= 55 && danger2 < curhp + ccwHeal && ccwHeal > idiv(danger2, 3)) {
    const c = firstCmd2(borgActivateItem(ctx, "act_cure_critical"), borgQuaffCrit(ctx, false));
    if (c) return c;
  }
  if (danger2 >= curhp && danger2 < maxhp && curhp < 50 && danger2 < ccwHeal) {
    const c = borgQuaffCrit(ctx, true);
    if (c) return c;
  }
  if (trait3(ctx, 105 /* CDEPTH */) >= 80 && danger2 < 50 && pctDown >= 20) {
    const c = borgQuaffPotion(ctx, SVAL.potion.cure_critical);
    if (c) return c;
  }
  if (pctDown >= 55 && danger2 < curhp + healHeal) {
    const c = firstCmd2(
      !trait3(ctx, 211 /* ATELEPORT */) && !trait3(ctx, 212 /* AESCAPE */) || rodGood ? borgZapRod(ctx, SVAL.rod.healing) : null,
      borgActivateItem(ctx, "act_cure_full"),
      borgActivateItem(ctx, "act_cure_full2"),
      borgActivateItem(ctx, "act_cure_nonorlybig"),
      borgActivateItem(ctx, "act_heal1"),
      borgActivateItem(ctx, "act_heal2"),
      borgActivateItem(ctx, "act_heal3"),
      borgUseStaffFail(ctx, SVAL.staff.healing),
      borgSpellFail(ctx, 72 /* HEALING */, allowFail)
    );
    if (c) return c;
  }
  if (trait3(ctx, 106 /* MAXDEPTH */) >= 98 && !trait3(ctx, 107 /* KING */) && !fs.fightingUnique && cls !== CLASS_PRIEST) return null;
  if (pctDown > 50 && danger2 < curhp + healHeal) {
    const c = firstCmd2(
      borgUseStaffFail(ctx, SVAL.staff.healing),
      fs.fightingEvilUnique ? borgSpellFail(ctx, 82 /* HOLY_WORD */, allowFail) : null,
      borgSpellFail(ctx, 72 /* HEALING */, allowFail),
      !trait3(ctx, 211 /* ATELEPORT */) && !trait3(ctx, 212 /* AESCAPE */) || rodGood ? borgZapRod(ctx, SVAL.rod.healing) : null,
      borgZapRod(ctx, SVAL.rod.healing),
      borgQuaffPotion(ctx, SVAL.potion.healing)
    );
    if (c) return c;
  }
  if (pctDown > 65 && danger2 < curhp + healHeal) {
    const c = firstCmd2(
      fs.fightingEvilUnique ? borgSpellFail(ctx, 82 /* HOLY_WORD */, allowFail) : null,
      borgSpellFail(ctx, 72 /* HEALING */, allowFail),
      borgUseStaffFail(ctx, SVAL.staff.healing),
      !trait3(ctx, 211 /* ATELEPORT */) && !trait3(ctx, 212 /* AESCAPE */) || rodGood ? borgZapRod(ctx, SVAL.rod.healing) : null,
      borgQuaffPotion(ctx, SVAL.potion.healing),
      borgActivateItem(ctx, "act_cure_full"),
      borgActivateItem(ctx, "act_heal1"),
      fs.fightingUnique ? borgQuaffPotion(ctx, SVAL.potion.star_healing) : null,
      fs.fightingUnique ? borgQuaffPotion(ctx, SVAL.potion.life) : null
    );
    if (c) return c;
  }
  if (pctDown > 75 && danger2 > curhp && trait3(ctx, 211 /* ATELEPORT */) + trait3(ctx, 212 /* AESCAPE */) <= 0) {
    const c = firstCmd2(borgQuaffPotion(ctx, SVAL.potion.healing), borgQuaffPotion(ctx, SVAL.potion.star_healing), borgQuaffPotion(ctx, SVAL.potion.life));
    if (c) return c;
  }
  if (danger2 > idiv(av2(ctx) * 2, 10)) return null;
  if (trait3(ctx, 115 /* ISPOISONED */) && curhp < idiv(maxhp, 2)) {
    const c = firstCmd2(
      borgSpellFail(ctx, 36 /* CURE_POISON */, 60),
      borgSpellFail(ctx, 51 /* HERBAL_CURING */, 60),
      borgQuaffPotion(ctx, SVAL.potion.cure_poison),
      borgActivateItem(ctx, "act_cure_body"),
      borgActivateItem(ctx, "act_cure_critical"),
      borgActivateItem(ctx, "act_cure_full"),
      borgUseStaff(ctx, SVAL.staff.curing),
      borgEat(ctx, TV.MUSHROOM, SVAL.mush.fast_recovery),
      borgEat(ctx, TV.MUSHROOM, SVAL.mush.purging),
      borgQuaffCrit(ctx, true),
      borgSpellFail(ctx, 72 /* HEALING */, 60),
      borgSpellFail(ctx, 82 /* HOLY_WORD */, 60),
      borgUseStaffFail(ctx, SVAL.staff.healing)
    );
    if (c) return c;
  }
  if (trait3(ctx, 116 /* ISCUT */) && (curhp < idiv(maxhp, 3) || ctx.rng.randint0(100) < 20)) {
    const c = firstCmd2(
      borgQuaffPotion(ctx, SVAL.potion.cure_serious),
      borgQuaffPotion(ctx, SVAL.potion.cure_light),
      borgQuaffCrit(ctx, curhp < 10),
      borgSpell(ctx, 59 /* MINOR_HEALING */),
      borgQuaffPotion(ctx, SVAL.potion.cure_critical)
    );
    if (c) return c;
  }
  return null;
}
function borgCaution(ctx, flow) {
  const fs = getFightState(ctx.world);
  const g = getDangerGlobals(ctx.world);
  let nasty = false;
  if (!trait3(ctx, 26 /* LIGHT */) && g.lightTimeout < 250) nasty = true;
  if (trait3(ctx, 108 /* ISWEAK */)) nasty = true;
  if (trait3(ctx, 112 /* ISBLIND */)) nasty = true;
  if (trait3(ctx, 114 /* ISCONFUSED */)) nasty = true;
  if (trait3(ctx, 120 /* ISIMAGE */)) nasty = true;
  const surrounded = borgSurrounded(ctx);
  if (ctx.world.self.escapes > 3 && ctx.world.facts.uniqueOnLevel === 0 && ctx.world.self.readyMorgoth <= 0 || ctx.world.self.escapes > 55) {
    if (trait3(ctx, 105 /* CDEPTH */) <= 98) {
      ctx.world.self.goal.leaving = true;
      if (ctx.world.self.escapes > 3) ctx.world.self.goal.fleeing = true;
    }
  }
  if (ctx.world.facts.scaryGuyOnLevel) {
    ctx.world.self.goal.leaving = true;
    ctx.world.self.goal.fleeing = true;
    if (trait3(ctx, 105 /* CDEPTH */) === 0) ctx.world.self.goal.fleeingToTown = true;
  }
  const posDanger = borgDanger(ctx, ctx.world.self.c.y, ctx.world.self.c.x, 1, true, false);
  if (!ctx.world.self.goal.fleeing) {
    const mageFirst = trait3(ctx, 25 /* CLASS */) === CLASS_MAGE && !g.morgothPosition && !g.asPosition && !trait3(ctx, 112 /* ISBLIND */) && !trait3(ctx, 116 /* ISCUT */) && !trait3(ctx, 115 /* ISPOISONED */) && !trait3(ctx, 114 /* ISCONFUSED */);
    if (mageFirst) {
      const d = borgDefend(ctx, posDanger);
      if (d) return d;
      const h = borgHeal(ctx, posDanger);
      if (h) return h;
    } else {
      const h = borgHeal(ctx, posDanger);
      if (h) return h;
      const d = borgDefend(ctx, posDanger);
      if (d) return d;
    }
  }
  if (!fs.fightingUnique && fs.timeTown + (ctx.world.clock - fs.began) > 200 && borgRestock(ctx, trait3(ctx, 105 /* CDEPTH */))) {
    ctx.world.self.goal.leaving = true;
    if (!ctx.world.self.goal.fleeing && trait3(ctx, 231 /* ACCW */) < 2 && trait3(ctx, 39 /* FOOD */) > 3 && trait3(ctx, 213 /* AFUEL */) > 2 && ctx.world.clock - fs.began > 400) {
      ctx.world.self.goal.fleeing = true;
    }
  } else if (posDanger > trait3(ctx, 27 /* CURHP */) * 2) {
    if (!ctx.world.self.goal.fleeing && !fs.fightingUnique && trait3(ctx, 35 /* CLEVEL */) < 50 && !ctx.world.facts.vaultOnLevel && trait3(ctx, 105 /* CDEPTH */) < 100 && ctx.world.self.readyMorgoth === 1)
      ctx.world.self.goal.fleeing = true;
  } else if (!trait3(ctx, 105 /* CDEPTH */) && posDanger > trait3(ctx, 27 /* CURHP */) && trait3(ctx, 35 /* CLEVEL */) < 50) {
    ctx.world.self.goal.leaving = true;
  }
  const self = ctx.world.self;
  if (self.goal.leaving || self.goal.fleeing || ctx.world.facts.scaryGuyOnLevel || self.goal.fleeingLunal || self.goal.fleeingMunchkin) {
    if (self.readyMorgoth === 0 && !trait3(ctx, 107 /* KING */) && !flow.hooks.forceDescend) {
      self.stairLess = true;
    }
    if (ctx.world.facts.scaryGuyOnLevel && !flow.hooks.forceDescend) self.stairLess = true;
    if (self.goal.fleeing || self.goal.fleeingLunal || self.goal.fleeingMunchkin) {
      self.stairMore = true;
    }
    if (flow.hooks.preparedToDescend(ctx.world)) self.stairMore = true;
    if (flow.less.num && (trait3(ctx, 26 /* LIGHT */) === 0 || trait3(ctx, 109 /* ISHUNGRY */) || trait3(ctx, 108 /* ISWEAK */) || trait3(ctx, 39 /* FOOD */) < 2)) {
      self.stairMore = false;
    }
    if (flow.less.num && trait3(ctx, 105 /* CDEPTH */) && trait3(ctx, 35 /* CLEVEL */) < 25 && trait3(ctx, 45 /* GOLD */) < 25e3 && flow.hooks.countSell(ctx.world) >= 13) {
      self.stairMore = false;
    }
    if (ctx.world.facts.scaryGuyOnLevel) self.stairMore = true;
    if (!trait3(ctx, 105 /* CDEPTH */)) self.stairMore = true;
  }
  if (self.stairLess && !flow.hooks.forceDescend) {
    if (ctx.world.map.at(self.c.x, self.c.y).feat === FEAT.LESS) {
      return ctx.act.ascend();
    }
  }
  if (self.stairMore && !self.goal.recalling) {
    if (ctx.world.map.at(self.c.x, self.c.y).feat === FEAT.MORE) {
      if (!self.goal.fleeingLunal && !self.goal.fleeingMunchkin) {
        const prep = borgPrepLeaveLevelSpells(ctx);
        if (prep) return prep;
      }
      return ctx.act.descend();
    }
  }
  if (trait3(ctx, 108 /* ISWEAK */)) {
    const c = firstCmd2(
      borgSpell(ctx, 32 /* REMOVE_HUNGER */),
      borgSpell(ctx, 51 /* HERBAL_CURING */),
      borgQuaffPotion(ctx, SVAL.potion.restore_mana),
      borgActivateItem(ctx, "act_restore_mana")
    );
    if (c) return c;
    if (trait3(ctx, 105 /* CDEPTH */)) {
      ctx.world.self.goal.leaving = true;
      ctx.world.self.goal.fleeing = true;
    }
  }
  const esc = borgEscape(ctx, posDanger);
  if (esc) {
    ctx.world.self.escapes += 1;
    ctx.world.self.goal.type = 0;
    return esc;
  }
  const backOff = borgBackAway(ctx, flow, posDanger, nasty, surrounded);
  if (backOff) return backOff;
  if (posDanger > trait3(ctx, 27 /* CURHP */) && trait3(ctx, 27 /* CURHP */) < idiv(trait3(ctx, 28 /* MAXHP */), 4)) {
    const c = firstCmd2(
      borgQuaffPotion(ctx, SVAL.potion.healing),
      borgQuaffPotion(ctx, SVAL.potion.star_healing),
      borgQuaffPotion(ctx, SVAL.potion.life),
      borgQuaffCrit(ctx, true),
      borgQuaffUnknown(ctx),
      borgReadUnknown(ctx),
      borgEatUnknown(ctx),
      borgUseUnknown(ctx)
    );
    if (c) return c;
  }
  return null;
}
function borgBackAway(ctx, flow, posDanger, nasty, surrounded) {
  const self = ctx.world.self;
  const g = getDangerGlobals(ctx.world);
  const fs = getFightState(ctx.world);
  const wants = posDanger > idiv(av2(ctx) * 4, 10) && !nasty && self.noRetreat < 1 || surrounded && posDanger !== 0;
  if (!wants) return null;
  if (g.morgothPosition) return null;
  if (ctx.world.clock - fs.tAntisummon < 50) return null;
  if (trait3(ctx, 114 /* ISCONFUSED */)) return null;
  if (trait3(ctx, 27 /* CURHP */) >= 500) return null;
  let bI = -1;
  let bF = -1;
  let bK = surrounded ? idiv(posDanger * 12, 10) : posDanger;
  bF = borgFreedom(ctx, self.c.y, self.c.x);
  let adjacentMonster = false;
  for (let i = 0; i < 8; i++) {
    const x = self.c.x + ddx_ddd[i];
    const y = self.c.y + ddy_ddd[i];
    if (!ctx.world.map.inBounds(x, y)) continue;
    const ag = ctx.world.map.at(x, y);
    if (trait3(ctx, 114 /* ISCONFUSED */)) continue;
    if (!borgCaveFloorGrid(ag)) continue;
    if (ag.kill) continue;
    if (featIsShop(ag.feat)) continue;
    if (ag.trap && !ag.glyph) break;
    const st2 = flow.step;
    const bouncing = trait3(ctx, 27 /* CURHP */) >= idiv(trait3(ctx, 28 /* MAXHP */) * 7, 10) && st2.num > 2 && st2.y[st2.num - 2] === y && st2.x[st2.num - 2] === x && st2.y[st2.num - 3] === self.c.y && st2.x[st2.num - 3] === self.c.x;
    if (bouncing || self.timeThisPanel >= 300) continue;
    for (const [, kill] of ctx.world.kills.entries()) {
      if (kill.when < ctx.world.clock - 2) continue;
      const d = distance(y, x, kill.pos.y, kill.pos.x);
      if (d <= 1 && !surrounded) adjacentMonster = true;
      if (d <= 2 && kill.speed > trait3(ctx, 44 /* SPEED */) && !surrounded) adjacentMonster = true;
    }
    if (adjacentMonster) continue;
    const k = borgDanger(ctx, y, x, 1, true, false);
    if (k > av2(ctx)) continue;
    if (trait3(ctx, 36 /* MAXCLEVEL */) >= 35 && k > idiv(bK * 6, 10)) continue;
    if (trait3(ctx, 36 /* MAXCLEVEL */) < 35 && !adjacentMonster && k > idiv(bK * 8, 10)) continue;
    if (k > bK) continue;
    const f = borgFreedom(ctx, y, x);
    if (bK === k) {
      const lowAndHurt = trait3(ctx, 35 /* CLEVEL */) <= 10 && trait3(ctx, 105 /* CDEPTH */) > 0 && (trait3(ctx, 27 /* CURHP */) < trait3(ctx, 28 /* MAXHP */) || trait3(ctx, 30 /* CURSP */) < trait3(ctx, 31 /* MAXSP */));
      if (!lowAndHurt) {
        if (bF > f || trait3(ctx, 105 /* CDEPTH */) >= 85) continue;
      }
    }
    bI = i;
    bK = k;
    bF = f;
  }
  if (bI < 0) return null;
  self.goal.g.x = self.c.x + ddx_ddd[bI];
  self.goal.g.y = self.c.y + ddy_ddd[bI];
  self.goal.type = 0;
  return ctx.act.move(ddd[bI]);
}

// src/perceive-facts.ts
function prefixI(name, pfx) {
  return name.toLowerCase().startsWith(pfx.toLowerCase());
}
function stristr(name, needle) {
  return name.toLowerCase().includes(needle.toLowerCase());
}
var SUMMON_FLAGS = [
  "S_KIN",
  "S_HI_DEMON",
  "S_MONSTER",
  "S_MONSTERS",
  "S_ANIMAL",
  "S_SPIDER",
  "S_HOUND",
  "S_HYDRA",
  "S_AINU",
  "S_DEMON",
  "S_UNDEAD",
  "S_DRAGON",
  "S_HI_DRAGON",
  "S_HI_UNDEAD",
  "S_WRAITH",
  "S_UNIQUE"
];
function isSummoner2(spellFlags) {
  for (const f of spellFlags) if (SUMMON_FLAGS.includes(f)) return true;
  return false;
}
function borgNearMonsterType(ctx, dist4) {
  const w = ctx.world;
  const t = w.self.trait;
  const fight = getFightState(w);
  const danger2 = getDangerGlobals(w);
  fight.fightingSummoner = false;
  fight.fightingUnique = 0;
  fight.fightingEvilUnique = false;
  w.kills.summoner = 0;
  const byId = /* @__PURE__ */ new Map();
  for (const m of ctx.view.monsters()) {
    if (!m.visible) continue;
    byId.set(m.id, {
      race: m.race,
      raceFlags: m.raceFlags,
      spellFlags: m.spellFlags
    });
  }
  const clevel = t[35 /* CLEVEL */] ?? 0;
  const cls = t[25 /* CLASS */] ?? 0;
  const cdepth = t[105 /* CDEPTH */] ?? 0;
  const px = w.self.c.x;
  const py = w.self.c.y;
  let breederCount = 0;
  let morgoth = false;
  for (const [i, kill] of w.kills.entries()) {
    const info = byId.get(kill.mIdx);
    if (!info) continue;
    const name = info.race;
    const rflags = info.raceFlags;
    const has2 = (f) => rflags.includes(f);
    if (has2("MULTIPLY")) breederCount += 1;
    if (clevel <= 5 && prefixI(name, "squint")) w.facts.scaryGuyOnLevel = true;
    if (clevel <= 6 && (cls === CLASS_MAGE || cls === CLASS_PRIEST) && prefixI(name, "squint"))
      w.facts.scaryGuyOnLevel = true;
    if (clevel <= 5 && (prefixI(name, "Grip") || prefixI(name, "Fang") || prefixI(name, "small kobold")))
      w.facts.scaryGuyOnLevel = true;
    if (clevel <= 8 && (prefixI(name, "soldier") || prefixI(name, "cutpurse") || prefixI(name, "acolyte") || prefixI(name, "apprentice") || prefixI(name, "kobold") || prefixI(name, "jackal") || prefixI(name, "shrieker") || prefixI(name, "Farmer Maggot") || prefixI(name, "filthy street urchin") || prefixI(name, "battle-scarred veteran") || prefixI(name, "mean-looking mercenary")))
      w.facts.scaryGuyOnLevel = true;
    if (clevel <= 15 && (prefixI(name, "Bullroarer") || (prefixI(name, "giant white mouse") || prefixI(name, "white worm mass") || prefixI(name, "green worm mass")) && breederCount >= clevel))
      w.facts.scaryGuyOnLevel = true;
    if (clevel <= 20 && (prefixI(name, "cave spider") || prefixI(name, "red naga") || prefixI(name, "giant red frog") || prefixI(name, "radiation eye") || prefixI(name, "yellow worm mass") && breederCount >= clevel))
      w.facts.scaryGuyOnLevel = true;
    if (clevel < 45 && (prefixI(name, "gravity") || prefixI(name, "inertia") || prefixI(name, "ancient dragon") || prefixI(name, "Beorn") || prefixI(name, "dread")))
      w.facts.scaryGuyOnLevel = true;
    if (!(t[100 /* SRNTHR */] ?? 0) && (prefixI(name, "Oss") || prefixI(name, "dracolich") || prefixI(name, "dracolisk")))
      w.facts.scaryGuyOnLevel = true;
    if (!(t[95 /* SRBLIND */] ?? 0) && (prefixI(name, "light hound") && !(t[93 /* SRLITE */] ?? 0) || prefixI(name, "dark hound") && !(t[94 /* SRDARK */] ?? 0)))
      w.facts.scaryGuyOnLevel = true;
    if (!(t[101 /* SRKAOS */] ?? 0) && !(t[96 /* SRCONF */] ?? 0) && stristr(name, "chaos"))
      w.facts.scaryGuyOnLevel = true;
    if (!(t[96 /* SRCONF */] ?? 0) && (prefixI(name, "pukelman") || prefixI(name, "night mare")))
      w.facts.scaryGuyOnLevel = true;
    if (!(t[73 /* RPOIS */] ?? 0) && prefixI(name, "drolem"))
      w.facts.scaryGuyOnLevel = true;
    const ax = Math.abs(kill.pos.x - px);
    const ay = Math.abs(kill.pos.y - py);
    const d = Math.max(ax, ay);
    if (d > dist4 && cdepth) continue;
    if (has2("UNIQUE")) {
      w.facts.uniqueOnLevel = kill.rIdx;
      if (has2("QUESTOR")) fight.fightingUnique += 10;
      fight.fightingUnique += 1;
      if (has2("EVIL")) fight.fightingEvilUnique = true;
      if (prefixI(name, "Morgoth")) morgoth = true;
    }
    if (isSummoner2(info.spellFlags)) {
      fight.fightingSummoner = true;
      if (d < 8) w.kills.summoner = i;
    }
  }
  w.facts.morgothOnLevel = morgoth;
  danger2.fightingUnique = fight.fightingUnique > 0;
}

// src/think-ladder.ts
function borgPickUpHere(ctx, session) {
  const w = ctx.world;
  if (!session.arrivalPickup) return null;
  if (session.flow.state.hooks.packFull(w)) return null;
  const items = ctx.view.floorItems(w.self.c.x, w.self.c.y);
  if (items.length === 0) return null;
  const here = `${String(w.facts.depth)}:${String(w.self.c.x)},${String(w.self.c.y)}:${String(items.length)}`;
  if (session.pickupTried === here) return null;
  let worth = false;
  for (const item of items) {
    if (takeValue(item, {
      kindCost: session.resolvers.kindCost,
      junked: session.junked
    }) > 0) {
      worth = true;
      break;
    }
  }
  if (!worth) return null;
  session.pickupTried = here;
  return ctx.act.pickup();
}
function handleOf(cmd) {
  const args = cmd.args;
  const h = args?.["handle"];
  return typeof h === "number" ? h : void 0;
}
function findByHandle(ctx, handle) {
  if (handle === void 0) return null;
  for (const item of ctx.view.inventory()) if (item.handle === handle) return item;
  return null;
}
function T(ctx, i) {
  return ctx.world.self.trait[i] ?? 0;
}
function standingFeat(ctx) {
  const w = ctx.world;
  return w.map.at(w.self.c.x, w.self.c.y).feat;
}
function nearestTrackDist(ctx, track) {
  const w = ctx.world;
  let best = -1;
  for (let i = 0; i < track.num; i++) {
    const d = distance2(w.self.c.x, w.self.c.y, track.x[i], track.y[i]);
    if (best === -1 || d < best) best = d;
  }
  return best;
}
function mustReturnToTown(ctx, began) {
  if (T(ctx, 105 /* CDEPTH */) === 0) return null;
  if (ctx.world.clock - began < 100 && T(ctx, 105 /* CDEPTH */) !== 100) return null;
  return borgRestock(ctx, T(ctx, 105 /* CDEPTH */));
}
var NOT_PORTED = () => null;
function timeToStayOnLevel(ctx, bored) {
  const clevel = T(ctx, 35 /* CLEVEL */);
  const STUFF0 = 5e4;
  if (clevel < 5) {
    if (clevel < 10) return clevel * 50;
    if (clevel < 15 && T(ctx, 39 /* FOOD */) < 3) return T(ctx, 50 /* REG */) ? 2e3 : 2500;
    if (T(ctx, 36 /* MAXCLEVEL */) < 20) return 100;
  }
  return bored ? STUFF0 / 10 : STUFF0;
}
function borgLeaveLevel(ctx, session, bored) {
  const w = ctx.world;
  const self = w.self;
  const g = self.goal;
  const flow = session.flow;
  let dir = 0;
  if (g.recalling && T(ctx, 105 /* CDEPTH */) !== 1) return null;
  if (!T(ctx, 105 /* CDEPTH */)) {
    g.rising = false;
    if (!bored) return null;
    if (T(ctx, 106 /* MAXDEPTH */) >= 8 && T(ctx, 38 /* RECALL */) >= 3 && borgPrepared(ctx, Math.trunc(T(ctx, 106 /* MAXDEPTH */) * 6 / 10)) === null) {
      const rc = borgRecall(ctx);
      if (rc) return rc;
    }
    g.fleeing = true;
    g.leaving = true;
    self.stairMore = true;
    return flow.toStairs(ctx, true, GOAL_BORE, false, false);
  }
  const prepCur = borgPrepared(ctx, T(ctx, 105 /* CDEPTH */));
  const prepNext = borgPrepared(ctx, T(ctx, 105 /* CDEPTH */) + 1);
  if (prepCur !== null) dir = -1;
  const sellCount = borgCountSell(ctx, buildStoreDeps(session));
  let tryNotToDescend = false;
  if (sellCount >= 12) tryNotToDescend = true;
  if (dir && T(ctx, 125 /* ISFIXEXP */)) tryNotToDescend = true;
  if (bored && prepNext !== null) {
    dir = -1;
  } else if (bored && getDangerGlobals(w).avoidance > T(ctx, 27 /* CURHP */)) {
    dir = prepNext !== null ? -1 : 1;
  } else if (!tryNotToDescend && borgPrepared(ctx, T(ctx, 105 /* CDEPTH */) + 5) === null && sellCount < 13) {
    dir = 1;
  } else if (!tryNotToDescend && prepNext === null && T(ctx, 105 /* CDEPTH */) >= 75 && T(ctx, 105 /* CDEPTH */) < 100) {
    dir = 1;
  }
  if (prepCur !== null) {
    if (!w.facts.uniqueOnLevel) {
      if (!dir && borgPrepared(ctx, Math.trunc(T(ctx, 106 /* MAXDEPTH */) * 5 / 10)) !== null && T(ctx, 106 /* MAXDEPTH */) > 65) {
        g.rising = true;
      } else {
        dir = -1;
      }
    }
    if (mustReturnToTown(ctx, session.flow.state.borgBegan) !== null) g.rising = true;
  }
  if (borgPrepared(ctx, T(ctx, 105 /* CDEPTH */) + 20) === null && borgPrepared(ctx, Math.trunc(T(ctx, 106 /* MAXDEPTH */) * 6 / 10)) === null && T(ctx, 106 /* MAXDEPTH */) > T(ctx, 105 /* CDEPTH */) + 20 && (T(ctx, 38 /* RECALL */) >= 3 || T(ctx, 45 /* GOLD */) > 2e3)) {
    g.rising = true;
  }
  if (bored && T(ctx, 36 /* MAXCLEVEL */) >= 26 && sellCount >= 12) g.rising = true;
  if (T(ctx, 124 /* ISFIXLEV */)) g.rising = true;
  if (bored && T(ctx, 125 /* ISFIXEXP */) && T(ctx, 35 /* CLEVEL */) !== 50) g.rising = true;
  if (T(ctx, 107 /* KING */)) dir = 1;
  if (T(ctx, 105 /* CDEPTH */) < 100 && borgPrepared(ctx, 99) === null) dir = 1;
  if (!dir && g.rising) dir = -1;
  if (!dir && w.clock - flow.state.borgBegan > timeToStayOnLevel(ctx, bored)) {
    if (T(ctx, 106 /* MAXDEPTH */) < 99 || !w.facts.uniqueOnLevel) {
      if (tryNotToDescend) dir = -1;
      else dir = ctx.rng.randint0(100) < 50 ? -1 : 1;
    }
  }
  if (dir < 0) {
    if (!flow.state.hooks.forceDescend) self.stairLess = true;
    if (g.rising && T(ctx, 105 /* CDEPTH */) >= 5) {
      const rc = borgRecall(ctx);
      if (rc) return rc;
    }
    const up = flow.toStairs(ctx, false, GOAL_BORE, false);
    if (up) return up;
    if (flow.state.less.num === 0) dir = 1;
  }
  if (dir > 0) {
    self.stairMore = true;
    const dn = flow.toStairs(ctx, true, GOAL_BORE, false, false);
    if (dn) return dn;
  }
  return null;
}
function borgThinkDungeonLight(ctx, session) {
  const w = ctx.world;
  const deps = buildItemDeps(session);
  if (T(ctx, 109 /* ISHUNGRY */)) {
    const eat = borgUseThings(ctx, deps);
    if (eat) return eat;
  }
  const noLight = !T(ctx, 26 /* LIGHT */);
  if (noLight && T(ctx, 105 /* CDEPTH */) >= 1) {
    if (w.self.goal.recalling) return ctx.act.rest(REST_COMPLETE);
    const wear = borgWearStuff(ctx, deps);
    if (wear) return wear;
    const light = borgMaintainLight(ctx, deps);
    if (light.need === 1 /* MET_NEED */ && light.cmd) return light.cmd;
    if (light.need === 0 /* NO_NEED */) return null;
    if (!w.self.goal.recalling) {
      const rc = borgRecall(ctx);
      if (rc) return rc;
    }
    if (!session.flow.state.hooks.forceDescend && standingFeat(ctx) === FEAT.LESS) {
      return ctx.act.ascend();
    }
    const flee = borgFlowOld(ctx, session.flow.state, GOAL_FLEE);
    if (flee) return flee;
    const up = session.flow.toStairs(ctx, false, GOAL_FLEE, false);
    if (up) {
      if (standingFeat(ctx) === FEAT.LESS) return ctx.act.ascend();
      return up;
    }
    if (T(ctx, 38 /* RECALL */)) {
      const lit2 = session.flow.toLight(ctx, GOAL_FLEE);
      if (lit2) return lit2;
    }
  }
  return null;
}
function borgThinkDungeon(ctx, session) {
  const w = ctx.world;
  const self = w.self;
  const g = self.goal;
  const flow = session.flow;
  const st2 = flow.state;
  getFightState(w);
  const dg = getDangerGlobals(w);
  const itemDeps = buildItemDeps(session);
  if (w.clock >= 12e3 && w.clock <= 12025 || w.clock >= 25e3 && w.clock <= 25025) {
    return ctx.act.hold();
  }
  {
    const cmd = NOT_PORTED();
    if (cmd) return cmd;
  }
  {
    const cmd = borgPickUpHere(ctx, session);
    if (cmd) return cmd;
  }
  if (w.clock >= 3e4) return null;
  if (w.clock - st2.borgBegan >= 1e4) {
    g.leaving = true;
    g.fleeing = true;
  }
  borgNearMonsterType(ctx, T(ctx, 36 /* MAXCLEVEL */) < 15 ? 20 : 12);
  if (T(ctx, 105 /* CDEPTH */) === 1 && g.fleeingToTown) {
    const scum = borgThinkStairScum(ctx, session);
    if (scum) return scum;
    g.leaving = true;
    g.fleeing = true;
  }
  if (T(ctx, 105 /* CDEPTH */) && self.timeThisPanel >= 300 && self.timeThisPanel <= 303) {
    g.type = 0;
  }
  if (T(ctx, 105 /* CDEPTH */) && self.timeThisPanel >= 500 && self.timeThisPanel <= 503) {
    w.takes.wipe();
    w.kills.wipe();
  }
  if (T(ctx, 105 /* CDEPTH */) && self.timeThisPanel >= 700) {
    g.leaving = true;
    g.fleeing = true;
  }
  let breeders = 0;
  const facts = getDangerGlobals(w).resolveFacts;
  for (const [i, k] of w.kills.entries()) {
    if (!k.awake) continue;
    if (facts(ctx, i).flags.has("MULTIPLY")) breeders += 1;
  }
  if (breeders >= 3) w.facts.breederLevel = true;
  if (breeders >= Math.min(T(ctx, 35 /* CLEVEL */) + 2, 5) && (T(ctx, 38 /* RECALL */) <= 0 || T(ctx, 35 /* CLEVEL */) < 35)) {
    if (!g.ignoring && w.clock >= 2500) g.ignoring = true;
    g.leaving = true;
    g.fleeing = true;
  }
  if (dg.avoidance !== T(ctx, 27 /* CURHP */)) {
    dg.avoidance = T(ctx, 27 /* CURHP */);
    st2.avoidance = T(ctx, 27 /* CURHP */);
    st2.borgDangerWipe = true;
  }
  if (st2.less.num && (T(ctx, 28 /* MAXHP */) < 30 || T(ctx, 35 /* CLEVEL */) < 15) && T(ctx, 105 /* CDEPTH */) >= T(ctx, 35 /* CLEVEL */) - 5) {
    const bj = nearestTrackDist(ctx, st2.less);
    const leash = T(ctx, 35 /* CLEVEL */) * 3 + 14;
    if (!g.less && bj > leash) g.less = true;
    else if (g.less && bj < 3) {
      g.less = false;
      g.type = 0;
    }
  }
  if (st2.less.num && T(ctx, 35 /* CLEVEL */) < 10 && !g.less && borgPrepared(ctx, T(ctx, 105 /* CDEPTH */)) !== null) {
    g.less = true;
    if (standingFeat(ctx) === FEAT.LESS && !st2.hooks.forceDescend) {
      return ctx.act.ascend();
    }
  }
  borgNotice(ctx);
  {
    const cmd = borgThinkDungeonLight(ctx, session);
    if (cmd) return cmd;
  }
  if (self.noRetreat > 0) self.noRetreat -= 1;
  if (self.timesTwitch > 20) g.fleeing = true;
  {
    const cmd = borgFlowOld(ctx, st2, GOAL_DIGGING);
    if (cmd) return cmd;
  }
  {
    const cmd = borgCaution(ctx, st2);
    if (cmd) return cmd;
  }
  if (!T(ctx, 26 /* LIGHT */) || T(ctx, 116 /* ISCUT */) || T(ctx, 115 /* ISPOISONED */) || T(ctx, 39 /* FOOD */) === 0) {
    if (!T(ctx, 26 /* LIGHT */)) {
      const light = borgMaintainLight(ctx, itemDeps);
      if (light.need === 1 /* MET_NEED */ && light.cmd) return light.cmd;
      const wear = borgWearStuff(ctx, itemDeps);
      if (wear) return wear;
    }
    const rec = borgRecover(ctx, itemDeps);
    if (rec) return rec;
    if (borgChooseShop(ctx, buildStoreDeps(session))) {
      const shop = flow.toShop(ctx, g.shop);
      if (shop) return shop;
    }
  }
  if (mustReturnToTown(ctx, st2.borgBegan) !== null) {
    const cmd = borgLeaveLevel(ctx, session, false);
    if (cmd) return cmd;
  }
  if (borgWieldIsDigger(ctx) || !borgHasWeapon(ctx)) {
    const cmd = borgWearStuff(ctx, itemDeps);
    if (cmd) return cmd;
  }
  {
    const cmd = flow.toKillCorridor(ctx);
    if (cmd) return cmd;
  }
  {
    const cmd = borgAttack(ctx, false);
    if (cmd) return cmd;
  }
  {
    const cmd = borgWearStuff(ctx, itemDeps);
    if (cmd) return cmd;
  }
  {
    const cmd = borgFlowOld(ctx, st2, GOAL_TAKE);
    if (cmd) return cmd;
  }
  {
    const cmd = flow.toTakes(ctx, true, 5);
    if (cmd) return cmd;
  }
  {
    const cmd = borgRemoveStuff(ctx, itemDeps);
    if (cmd) return cmd;
  }
  {
    const cmd = borgCheckLight(ctx, itemDeps);
    if (cmd) return cmd;
  }
  {
    const cmd = borgFlowOld(ctx, st2, GOAL_RECOVER);
    if (cmd) return cmd;
  }
  {
    const cmd = borgRecover(ctx, itemDeps);
    if (cmd) return cmd;
  }
  {
    const cmd = flow.toRecover(ctx, 50);
    if (cmd) return cmd;
  }
  {
    const cmd = borgPermaSpell(ctx);
    if (cmd) return cmd;
  }
  if (T(ctx, 35 /* CLEVEL */) < 10 && T(ctx, 31 /* MAXSP */) && T(ctx, 30 /* CURSP */) === 0 && self.noRestPrep <= 1 && !self.temp.bless && !self.temp.hero && !self.temp.berserk && !self.temp.fastcast) {
    const track = T(ctx, 105 /* CDEPTH */) ? st2.less : st2.more;
    for (let i = 0; i < track.num; i++) {
      if (self.c.y === track.y[i] && self.c.x === track.x[i]) {
        if (T(ctx, 105 /* CDEPTH */)) g.less = false;
        if (borgDanger(ctx, self.c.y, self.c.x, 1, true, false) === 0) {
          return ctx.act.rest(REST_COMPLETE);
        }
      }
    }
    const flee = borgFlowOld(ctx, st2, GOAL_FLEE);
    if (flee) return flee;
    const up = flow.toStairs(ctx, false, GOAL_FLEE, true);
    if (up) return up;
  }
  if (T(ctx, 105 /* CDEPTH */) === 0 && T(ctx, 35 /* CLEVEL */) < 6 && T(ctx, 45 /* GOLD */) < 10 && borgCountSell(ctx, buildStoreDeps(session)) < 5) {
    g.leaving = true;
    const flee = borgFlowOld(ctx, st2, GOAL_FLEE);
    if (flee) return flee;
    const dn = flow.toStairs(ctx, true, GOAL_FLEE, false, false);
    if (dn) return dn;
  }
  if (g.less) {
    const flee = borgFlowOld(ctx, st2, GOAL_FLEE);
    if (flee) return flee;
    if (w.facts.scaryGuyOnLevel) {
      const both = flow.toStairsBoth(ctx, GOAL_FLEE, false);
      if (both) return both;
    }
    const up = flow.toStairs(ctx, false, GOAL_FLEE, false);
    if (up) return up;
  }
  if (g.fleeing && !g.recalling) {
    self.stairLess = self.stairMore = true;
    if (st2.hooks.forceDescend) self.stairLess = false;
    const flee = borgFlowOld(ctx, st2, GOAL_FLEE);
    if (flee) return flee;
    if (w.facts.scaryGuyOnLevel) {
      const both = flow.toStairsBoth(ctx, GOAL_FLEE, false);
      if (both) return both;
    }
    const up = flow.toStairs(ctx, false, GOAL_FLEE, false);
    if (up) return up;
    const dn = flow.toStairs(ctx, true, GOAL_FLEE, false, false);
    if (dn) return dn;
  }
  if (!T(ctx, 107 /* KING */) && w.facts.morgothOnLevel && !dg.morgothPosition && T(ctx, 230 /* AGLYPH */) >= 10 && !T(ctx, 112 /* ISBLIND */) && !T(ctx, 114 /* ISCONFUSED */)) {
    const flowMisc = borgFlowOld(ctx, st2, GOAL_MISC);
    if (flowMisc) return flowMisc;
    const glyph = flow.toGlyph(ctx);
    if (glyph) return glyph;
  }
  {
    const cmd = borgFlowOld(ctx, st2, GOAL_TAKE);
    if (cmd) return cmd;
  }
  {
    const cmd = flow.toTakes(ctx, false, 5);
    if (cmd) return cmd;
  }
  {
    const cmd = flow.toVein(ctx, true, 5);
    if (cmd) return cmd;
  }
  {
    const cmd = borgFlowOld(ctx, st2, GOAL_KILL);
    if (cmd) return cmd;
  }
  {
    const cmd = flow.toKills(ctx, 20, true);
    if (cmd) return cmd;
  }
  {
    const cmd = borgFlowOld(ctx, st2, GOAL_TAKE);
    if (cmd) return cmd;
  }
  {
    const cmd = flow.toTakes(ctx, false, 10);
    if (cmd) return cmd;
  }
  {
    const cmd = flow.toVein(ctx, false, 10);
    if (cmd) return cmd;
  }
  {
    const cmd = borgFlowOld(ctx, st2, GOAL_KILL);
    if (cmd) return cmd;
  }
  {
    const cmd = borgFlowOld(ctx, st2, GOAL_VAULT);
    if (cmd) return cmd;
  }
  {
    const cmd = flow.toKillAim(ctx, true);
    if (cmd) return cmd;
  }
  {
    const cmd = borgUseThings(ctx, itemDeps);
    if (cmd) return cmd;
  }
  {
    const cmd = borgTestStuff(ctx, itemDeps);
    if (cmd) return cmd;
  }
  {
    const cmd = borgEnchanting(ctx, itemDeps);
    if (cmd) return cmd;
  }
  {
    const cmd = borgRecharging(ctx, itemDeps);
    if (cmd) return cmd;
  }
  {
    const cmd = borgCrushJunk(ctx, itemDeps);
    if (cmd) {
      const dropped = findByHandle(ctx, handleOf(cmd));
      if (dropped) session.junked.add(junkKey(dropped.tval, dropped.sval));
      return cmd;
    }
  }
  {
    const cmd = borgFlowOld(ctx, st2, GOAL_TAKE);
    if (cmd) return cmd;
  }
  {
    const cmd = flow.toTakes(ctx, true, 250);
    if (cmd) return cmd;
  }
  {
    const cmd = flow.toVein(ctx, true, 250);
    if (cmd) return cmd;
  }
  if (g.leaving && !g.recalling && !w.facts.uniqueOnLevel || T(ctx, 105 /* CDEPTH */) && T(ctx, 35 /* CLEVEL */) < 25 && T(ctx, 45 /* GOLD */) < 25e3 && borgCountSell(ctx, buildStoreDeps(session)) >= 13) {
    if (self.readyMorgoth === 0 && !st2.hooks.forceDescend) self.stairLess = true;
    if (borgPrepared(ctx, T(ctx, 105 /* CDEPTH */) + 1) === null) self.stairMore = true;
    const flee = borgFlowOld(ctx, st2, GOAL_FLEE);
    if (flee) return flee;
    if (self.stairLess) {
      const up = flow.toStairs(ctx, false, GOAL_FLEE, false);
      if (up) return up;
    }
    if (T(ctx, 105 /* CDEPTH */) && T(ctx, 35 /* CLEVEL */) < 25 && T(ctx, 45 /* GOLD */) < 25e3 && borgCountSell(ctx, buildStoreDeps(session)) >= 13) {
      self.stairMore = false;
    }
    if (self.stairMore) {
      const dn = flow.toStairs(ctx, true, GOAL_FLEE, false, false);
      if (dn) return dn;
    }
  }
  if (T(ctx, 105 /* CDEPTH */) !== 0 && borgPrepared(ctx, T(ctx, 105 /* CDEPTH */) + 5) === null && !self.stairLess) {
    self.stairMore = true;
    const bore = borgFlowOld(ctx, st2, GOAL_BORE);
    if (bore) return bore;
    if (T(ctx, 105 /* CDEPTH */) && T(ctx, 35 /* CLEVEL */) < 25 && T(ctx, 45 /* GOLD */) < 25e3 && borgCountSell(ctx, buildStoreDeps(session)) >= 13) {
      self.stairMore = false;
    }
    if (self.stairMore) {
      const dn = flow.toStairs(ctx, true, GOAL_BORE, true, false);
      if (dn) return dn;
    }
  }
  {
    const cmd = borgFlowOld(ctx, st2, GOAL_MISC);
    if (cmd) return cmd;
  }
  {
    const cmd = borgFlowOld(ctx, st2, GOAL_DARK);
    if (cmd) return cmd;
  }
  {
    const cmd = borgFlowOld(ctx, st2, GOAL_XTRA);
    if (cmd) return cmd;
  }
  {
    const cmd = borgFlowOld(ctx, st2, GOAL_BORE);
    if (cmd) return cmd;
  }
  {
    const cmd = borgFlowOld(ctx, st2, GOAL_VAULT);
    if (cmd) return cmd;
  }
  {
    const cmd = flow.toKills(ctx, 250, false);
    if (cmd) return cmd;
  }
  {
    const cmd = flow.toTakes(ctx, false, 250);
    if (cmd) return cmd;
  }
  {
    const cmd = flow.toVein(ctx, false, 250);
    if (cmd) return cmd;
  }
  {
    const cmd = flow.toDark(ctx, true);
    if (cmd) return cmd;
  }
  {
    const cmd = borgLeaveLevel(ctx, session, false);
    if (cmd) return cmd;
  }
  {
    const cmd = flow.toDark(ctx, false);
    if (cmd) return cmd;
  }
  if (borgChooseShop(ctx, buildStoreDeps(session))) {
    const shop = flow.toShop(ctx, g.shop);
    if (shop) return shop;
  }
  {
    const cmd = flow.spastic(ctx, false);
    if (cmd) return cmd;
  }
  {
    const cmd = flow.toKillDirect(ctx, false);
    if (cmd) return cmd;
  }
  {
    const cmd = borgLeaveLevel(ctx, session, true);
    if (cmd) return cmd;
  }
  {
    const cmd = flow.spastic(ctx, true);
    if (cmd) return cmd;
  }
  {
    const cmd = flow.toKillDirect(ctx, false);
    if (cmd) return cmd;
  }
  if (g.recalling && borgDanger(ctx, self.c.y, self.c.x, 1, true, false) <= 0) {
    return ctx.act.rest(REST_COMPLETE);
  }
  self.noRetreat = 5;
  if (dg.avoidance < T(ctx, 27 /* CURHP */) * 2) {
    dg.avoidance = T(ctx, 27 /* CURHP */) * 2;
    st2.avoidance = dg.avoidance;
    st2.borgDangerWipe = true;
    const done = borgThinkDungeonBrave(ctx, session);
    dg.avoidance = T(ctx, 27 /* CURHP */);
    st2.avoidance = dg.avoidance;
    st2.borgDangerWipe = true;
    if (done) return done;
  }
  self.timesTwitch += 1;
  if (self.timesTwitch < 3 && borgAllowTeleport(ctx)) {
    const cmd = borgSpell(ctx, 3 /* PHASE_DOOR */) ?? borgActivateItem(ctx, "act_tele_phase", itemDeps) ?? borgReadScroll(ctx, SVAL.scroll.phase_door, itemDeps) ?? borgDimensionDoor(ctx, 90) ?? borgSpell(ctx, 14 /* TELEPORT_SELF */) ?? borgSpell(ctx, 69 /* PORTAL */) ?? borgShadowShift(ctx, 90);
    if (cmd) return cmd;
  }
  self.noRetreat = 10;
  if (dg.avoidance < T(ctx, 28 /* MAXHP */) * 4) {
    dg.avoidance = T(ctx, 28 /* MAXHP */) * 4;
    st2.avoidance = dg.avoidance;
    st2.borgDangerWipe = true;
    const done = borgThinkDungeonBrave(ctx, session);
    dg.avoidance = T(ctx, 27 /* CURHP */);
    st2.avoidance = dg.avoidance;
    st2.borgDangerWipe = true;
    if (done) return done;
  }
  if (dg.avoidance < 3e4) {
    dg.avoidance = 3e4;
    st2.avoidance = dg.avoidance;
    st2.borgDangerWipe = true;
    w.facts.uniqueOnLevel = 0;
    w.facts.scaryGuyOnLevel = false;
    w.facts.breederLevel = false;
    g.type = 0;
    if (!T(ctx, 105 /* CDEPTH */)) g.rising = false;
    g.ignoring = false;
    st2.less.wipe();
    st2.more.wipe();
    st2.glyph.wipe();
    st2.step.wipe();
    st2.door.wipe();
    st2.closed.wipe();
    st2.vein.wipe();
    w.takes.wipe();
    const done = borgThinkDungeonBrave(ctx, session);
    dg.avoidance = T(ctx, 27 /* CURHP */);
    st2.avoidance = dg.avoidance;
    st2.borgDangerWipe = true;
    if (done) return done;
  }
  self.timesTwitch += 1;
  if (self.timesTwitch < 5 && borgAllowTeleport(ctx)) {
    const cmd = borgDimensionDoor(ctx, 90) ?? borgSpell(ctx, 14 /* TELEPORT_SELF */) ?? borgSpell(ctx, 69 /* PORTAL */) ?? borgShadowShift(ctx, 90) ?? borgUseStaff(ctx, SVAL.staff.teleportation, itemDeps) ?? borgReadScroll(ctx, SVAL.scroll.teleport, itemDeps) ?? borgReadScroll(ctx, SVAL.scroll.teleport_level, itemDeps) ?? borgActivateItem(ctx, "act_tele_level", itemDeps);
    if (cmd) return cmd;
  }
  if (T(ctx, 105 /* CDEPTH */)) {
    const rc = borgRecall(ctx);
    if (rc) return rc;
  }
  w.facts.uniqueOnLevel = 0;
  w.facts.scaryGuyOnLevel = false;
  w.facts.breederLevel = false;
  w.takes.wipe();
  w.kills.wipe();
  {
    const cmd = flow.toKillDirect(ctx, true);
    if (cmd) return cmd;
  }
  {
    const cmd = flow.twitchy(ctx);
    if (cmd) return cmd;
  }
  return null;
}
function borgThinkDungeonBrave(ctx, session) {
  const w = ctx.world;
  const self = w.self;
  const g = self.goal;
  const flow = session.flow;
  const st2 = flow.state;
  const p1 = borgDanger(ctx, self.c.y, self.c.x, 1, true, false);
  if (T(ctx, 105 /* CDEPTH */) === 100) {
    const cmd = borgDefend(ctx, p1);
    if (cmd) return cmd;
  }
  {
    const cmd = borgAttack(ctx, true);
    if (cmd) return cmd;
  }
  {
    const cmd = borgLightBeam(ctx, buildItemDeps(session));
    if (cmd) return cmd;
  }
  if (standingFeat(ctx) === FEAT.MORE) return ctx.act.descend();
  if (g.less) {
    const flee = borgFlowOld(ctx, st2, GOAL_FLEE);
    if (flee) return flee;
    if (w.facts.scaryGuyOnLevel && !T(ctx, 105 /* CDEPTH */)) {
      const both = flow.toStairsBoth(ctx, GOAL_FLEE, false);
      if (both) return both;
    }
    const up = flow.toStairs(ctx, false, GOAL_FLEE, false);
    if (up) return up;
  }
  if (g.fleeing || g.leaving || w.facts.scaryGuyOnLevel) {
    self.stairLess = g.fleeing;
    if (self.readyMorgoth === 0) self.stairLess = true;
    if (st2.hooks.forceDescend) self.stairLess = false;
    self.stairMore = g.fleeing;
    if (borgPrepared(ctx, T(ctx, 105 /* CDEPTH */) + 1) === null) self.stairMore = true;
    const flee = borgFlowOld(ctx, st2, GOAL_FLEE);
    if (flee) return flee;
    if (self.stairLess) {
      const up = flow.toStairs(ctx, false, GOAL_FLEE, false);
      if (up) return up;
    }
    if (self.stairMore) {
      const dn = flow.toStairs(ctx, true, GOAL_FLEE, false, true);
      if (dn) return dn;
    }
  }
  if (w.facts.vaultOnLevel) {
    let cmd = borgFlowOld(ctx, st2, GOAL_KILL);
    if (cmd) return cmd;
    cmd = flow.toKills(ctx, 35, true);
    if (cmd) return cmd;
    cmd = borgFlowOld(ctx, st2, GOAL_TAKE);
    if (cmd) return cmd;
    cmd = flow.toTakes(ctx, true, 35);
    if (cmd) return cmd;
    cmd = flow.toVein(ctx, true, 35);
    if (cmd) return cmd;
    cmd = borgFlowOld(ctx, st2, GOAL_VAULT);
    if (cmd) return cmd;
    cmd = flow.toVault(ctx, 35);
    if (cmd) return cmd;
  }
  {
    let cmd = borgFlowOld(ctx, st2, GOAL_KILL);
    if (cmd) return cmd;
    cmd = flow.toKills(ctx, 250, true);
    if (cmd) return cmd;
    cmd = borgFlowOld(ctx, st2, GOAL_TAKE);
    if (cmd) return cmd;
    cmd = flow.toTakes(ctx, true, 250);
    if (cmd) return cmd;
    cmd = flow.toVein(ctx, true, 250);
    if (cmd) return cmd;
  }
  for (const goal of [GOAL_MISC, GOAL_DARK, GOAL_XTRA, GOAL_BORE]) {
    const cmd = borgFlowOld(ctx, st2, goal);
    if (cmd) return cmd;
  }
  {
    let cmd = flow.toDark(ctx, true);
    if (cmd) return cmd;
    cmd = flow.toDark(ctx, false);
    if (cmd) return cmd;
  }
  {
    let cmd = flow.toTakes(ctx, false, 250);
    if (cmd) return cmd;
    cmd = flow.toVein(ctx, false, 250);
    if (cmd) return cmd;
    cmd = flow.toKills(ctx, 250, false);
    if (cmd) return cmd;
  }
  {
    const cmd = borgLeaveLevel(ctx, session, true);
    if (cmd) return cmd;
  }
  {
    const cmd = flow.spastic(ctx, true);
    if (cmd) return cmd;
  }
  return null;
}
function borgThinkStairScum(ctx, session) {
  const w = ctx.world;
  const flow = session.flow;
  const st2 = flow.state;
  const deps = buildItemDeps(session);
  borgNotice(ctx);
  if (T(ctx, 105 /* CDEPTH */) === 0 || T(ctx, 108 /* ISWEAK */)) return null;
  if (flow.state.hooks.packFull(w)) return null;
  const light = borgMaintainLight(ctx, deps);
  if (light.need === 1 /* MET_NEED */ && light.cmd) return light.cmd;
  {
    const cmd = borgFlowOld(ctx, st2, GOAL_TAKE);
    if (cmd) return cmd;
  }
  {
    const cmd = flow.toTakesScum(ctx, true, 6);
    if (cmd) return cmd;
  }
  w.self.goal.fleeing = true;
  if (st2.more.num && (standingFeat(ctx) === FEAT.MORE || T(ctx, 105 /* CDEPTH */) < 30)) {
    const flee = borgFlowOld(ctx, st2, GOAL_FLEE);
    if (flee) return flee;
    const dn = flow.toStairs(ctx, true, GOAL_FLEE, false, false);
    if (dn) return dn;
    if (standingFeat(ctx) === FEAT.MORE) return ctx.act.descend();
  }
  if (T(ctx, 105 /* CDEPTH */) >= 2) {
    const flee = borgFlowOld(ctx, st2, GOAL_FLEE);
    if (flee) return flee;
    const both = flow.toStairsBoth(ctx, GOAL_FLEE, true);
    if (both) return both;
  }
  return null;
}
function weaponTvals() {
  return [TV.DIGGING, TV.HAFTED, TV.POLEARM, TV.SWORD];
}
function borgWieldIsDigger(ctx) {
  const weapons = weaponTvals();
  for (const e of ctx.view.equipment()) {
    if (e && e.number > 0 && weapons.includes(e.tval)) {
      return e.tval === TV.DIGGING;
    }
  }
  return false;
}
function borgHasWeapon(ctx) {
  const weapons = weaponTvals();
  for (const e of ctx.view.equipment()) {
    if (e && e.number > 0 && weapons.includes(e.tval)) return true;
  }
  return false;
}

// src/think.ts
function distance2(ax, ay, bx, by) {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}
function think(ctx) {
  const p = ctx.view.player();
  if (p.dead) return null;
  const session = getThinkSession(ctx.world);
  primeSession(session, ctx);
  const shopNum = session.resolvers.inShop?.(ctx) ?? null;
  if (shopNum !== null && shopNum >= 0) {
    ctx.world.self.inShop = true;
    return borgThinkStore(ctx, shopNum, buildStoreDeps(session));
  }
  ctx.world.self.inShop = false;
  return borgThinkDungeon(ctx, session);
}

// src/perceive-messages.ts
var PREFIX_KILL = [
  "You have killed ",
  "You have slain ",
  "You have destroyed "
];
var SUFFIX_DIED = [
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
  " is drained dry!"
];
var SUFFIX_BLINK = [
  " disappears!",
  " intones strange words.",
  " teleports away.",
  " blinks.",
  " makes a soft 'pop'."
];
var SUFFIX_MISS_BY = [" misses you.", " is repelled."];
function borgLoadReadMessage(template) {
  const close = template.indexOf("}");
  if (close < 0) return { p1: template.replace(/^ +/, "") };
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
    if (rest.length > 0 && rest !== ".") return { p1, p2: rest };
    return { p1 };
  }
  rest = rest.replace(/^ +/, "");
  open = rest.indexOf("{");
  const p2 = open > 0 ? rest.slice(0, open).replace(/^ +/, "") : void 0;
  const carry = p2 === void 0 ? {} : { p2 };
  rest = rest.slice(open);
  const close3 = rest.indexOf("}");
  if (close3 < 0) return { p1, ...carry };
  rest = rest.slice(close3 + 1).replace(/^ +/, "");
  if (rest.length === 0 || rest === ".") return { p1, ...carry };
  return p2 === void 0 ? { p1, p2: rest } : { p1, p2, p3: rest };
}
function borgMessageContains(value, m) {
  if (!value.includes(m.p1)) return false;
  if (m.p2 !== void 0 && !value.includes(m.p2)) return false;
  if (m.p3 !== void 0 && !value.includes(m.p3)) return false;
  return true;
}
function emptyMessageTables() {
  return { hitBy: [], spell: [], spellInvisible: [] };
}
function buildHitByTable(templates) {
  return { hitBy: templates.map((t) => borgLoadReadMessage(t)), spell: [], spellInvisible: [] };
}
function buildSpellTable(spells) {
  const spell = [];
  const spellInvisible = [];
  for (const s of spells) {
    for (const level of s.levels) {
      if (level.blindMessage) spellInvisible.push({ index: s.index, message: borgLoadReadMessage(level.blindMessage) });
      if (level.message) spell.push({ index: s.index, message: borgLoadReadMessage(level.message) });
      if (level.missMessage) spell.push({ index: s.index, message: borgLoadReadMessage(level.missMessage) });
    }
  }
  return { hitBy: [], spell, spellInvisible };
}
function borgFearSpell(world, index) {
  const damage = Math.max(0, (world.self.oldchp - (world.self.trait[27 /* CURHP */] ?? 0)) * 2);
  if (index === 1) {
    if ((world.self.trait[35 /* CLEVEL */] ?? 0) <= 5) {
      world.self.goal.fleeing = true;
      world.self.goal.leaving = true;
    }
    return 10;
  }
  return damage > 0 ? damage : 10;
}
function anyPrefix(msg, table) {
  for (const p of table) if (msg.startsWith(p)) return true;
  return false;
}
function anySuffix(msg, table) {
  for (const s of table) if (msg.endsWith(s)) return true;
  return false;
}
function locateStaleKill(w, visibleIds, dist4) {
  const px = w.self.c.x;
  const py = w.self.c.y;
  let best = 0;
  let bestD = dist4 + 1;
  for (const [i, k] of w.kills.entries()) {
    if (visibleIds.has(k.mIdx)) continue;
    const d = distance2(px, py, k.pos.x, k.pos.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
function raceNameOf(who) {
  if (who.startsWith("The ") || who.startsWith("the ")) return who.slice(4);
  return who;
}
function isInvisibleAttacker(who) {
  const lower = who.toLowerCase();
  return lower.startsWith("something") || lower.startsWith("it");
}
function locateAttacker(w, names, who, r) {
  if (isInvisibleAttacker(who)) {
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
    if (name === void 0) continue;
    if (name.toLowerCase() !== wanted) continue;
    const d = distance2(px, py, k.pos.x, k.pos.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
function whoBefore(msg, m) {
  const at = msg.indexOf(m.p1);
  if (at <= 0) return null;
  return msg.slice(0, at - 1);
}
function borgReactMessages(world, messages, visibleIds, names = /* @__PURE__ */ new Map(), tables = emptyMessageTables()) {
  let deleted = 0;
  const hitDist = 1;
  const cdepth = world.self.trait[105 /* CDEPTH */] ?? 0;
  const hitFear = 4 * (Math.trunc(cdepth / 5) + 1);
  const missFear = 2 * (Math.trunc(cdepth / 5) + 1);
  const fear = getFearCaches(world);
  const raiseFear = (k) => {
    borgFearRegional(world, fear, world.self.c.y, world.self.c.x, k, false);
  };
  for (const raw of messages) {
    const msg = raw.trim();
    if (!msg) continue;
    if (anyPrefix(msg, PREFIX_KILL) || anySuffix(msg, SUFFIX_DIED)) {
      const k = locateStaleKill(world, visibleIds, 20);
      if (k > 0) {
        world.kills.delete(k, world);
        deleted += 1;
      }
      continue;
    }
    if (anySuffix(msg, SUFFIX_BLINK)) {
      const k = locateStaleKill(world, visibleIds, 20);
      if (k > 0) {
        world.kills.delete(k, world);
        deleted += 1;
      }
      continue;
    }
    if (msg.startsWith("The air about you becomes ")) {
      world.self.goal.recalling = 15e3 + 5e3;
      continue;
    }
    if (msg.startsWith("The air around you starts ")) {
      world.self.goal.descending = 3e3 + 2e3;
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
    if (msg.startsWith("A mystic shield forms around your body!") || msg.startsWith("Your skin turns to stone.")) {
      world.self.temp.shield = true;
      continue;
    }
    if (msg.startsWith("Your mystic shield crumbles away.") || msg.startsWith("A fleshy shade returns to your skin.")) {
      world.self.temp.shield = false;
      continue;
    }
    const missSuffix = SUFFIX_MISS_BY.find((s) => msg.endsWith(s));
    if (missSuffix !== void 0) {
      const who = msg.slice(0, msg.length - missSuffix.length);
      if (locateAttacker(world, names, who, hitDist) === 0) raiseFear(missFear);
      continue;
    }
    let hit = null;
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

// src/perceive.ts
var BORG_EXPIRE_TURNS = 2e3;
function makePerceiveMemo() {
  return { lastDepth: -1, initialized: false };
}
function perceive(world, view, memo, tables = emptyMessageTables(), valuation = {}) {
  const p = view.player();
  const oldX = world.self.c.x;
  const oldY = world.self.c.y;
  const newLevel = !memo.initialized || p.depth !== memo.lastDepth;
  if (newLevel) {
    world.wipeLevel(p.depth);
    memo.lastDepth = p.depth;
    memo.initialized = true;
  }
  const fear = getFearCaches(world);
  if (newLevel) fear.wipe();
  else decayLevelTimers(world);
  world.self.c.x = p.grid.x;
  world.self.c.y = p.grid.y;
  world.facts.depth = p.depth;
  ingestMap(world, view);
  borgUpdateLight(world);
  const seen = ingestMonsters(world, view);
  ingestFloor(world, view, oldX, oldY, valuation);
  borgReactMessages(world, view.messages(), seen.ids, seen.names, tables);
  world.seeded = true;
}
function decayLevelTimers(world) {
  const self = world.self;
  const ratio = self.gameRatio;
  if (self.resistance >= 1) self.resistance -= ratio;
  if (self.noRestPrep >= 1) self.noRestPrep -= ratio;
  if (self.goal.recalling >= 1) {
    self.goal.recalling -= ratio;
    if (self.goal.recalling <= 0) self.goal.recalling = 1;
  }
  if (self.goal.descending >= 1) self.goal.descending -= ratio;
  if (self.temp.seeInv >= 1) self.temp.seeInv -= ratio;
  if (world.clock % 10 === 0) {
    const region = getFearCaches(world).region2d;
    for (let y = 0; y < FEAR_REGION_H; y++) {
      const row = region[y];
      if (!row) continue;
      for (let x = 0; x < FEAR_REGION_W; x++) {
        if ((row[x] ?? 0) > 0) row[x] = row[x] - 1;
      }
    }
  }
}
function ingestMap(world, view) {
  const bounds = view.mapBounds();
  const maxY = Math.min(bounds.height, world.map.height);
  const maxX = Math.min(bounds.width, world.map.width);
  for (let y = 0; y < maxY; y++) {
    for (let x = 0; x < maxX; x++) {
      const c = view.cell(x, y);
      if (!c) continue;
      if (!c.known && !c.inView) continue;
      const g = world.map.at(x, y);
      g.feat = c.feat;
      g.trap = c.trap;
      let info = g.info | BORG_MARK;
      if (c.inView) info |= BORG_VIEW;
      else info &= ~BORG_VIEW;
      if (c.glow) info |= BORG_GLOW;
      g.info = info;
    }
  }
}
function borgUpdateLight(world) {
  const map = world.map;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const g = map.at(x, y);
      if (g.info & BORG_LIGHT) g.info &= ~BORG_LIGHT;
    }
  }
  const cy = world.self.c.y;
  const cx = world.self.c.x;
  const radius = world.self.trait[26 /* LIGHT */] ?? 0;
  const lightUp = (y, x) => {
    if (!map.inBounds(x, y)) return;
    map.at(x, y).info |= BORG_LIGHT;
  };
  const floorAt = (y, x) => borgCaveFloorBold(world, y, x);
  if (radius <= 0) return;
  lightUp(cy, cx);
  lightUp(cy + 1, cx);
  lightUp(cy - 1, cx);
  lightUp(cy, cx + 1);
  lightUp(cy, cx - 1);
  lightUp(cy + 1, cx + 1);
  lightUp(cy + 1, cx - 1);
  lightUp(cy - 1, cx + 1);
  lightUp(cy - 1, cx - 1);
  if (radius >= 2 && cy + 2 < AUTO_MAX_Y && cy - 2 > 0 && cx + 2 < AUTO_MAX_X && cx - 2 > 0) {
    if (floorAt(cy + 2, cx)) {
      lightUp(cy + 2, cx);
      lightUp(cy + 2, cx + 2);
      lightUp(cy + 2, cx - 2);
    }
    if (floorAt(cy - 2, cx)) {
      lightUp(cy - 2, cx);
      lightUp(cy - 2, cx + 2);
      lightUp(cy - 2, cx - 2);
    }
    if (floorAt(cy, cx + 2)) {
      lightUp(cy, cx + 2);
      lightUp(cy + 1, cx + 2);
      lightUp(cy - 1, cx + 2);
    }
    if (floorAt(cy, cx - 2)) {
      lightUp(cy, cx - 2);
      lightUp(cy + 2, cx - 2);
      lightUp(cy - 2, cx - 2);
    }
  }
  if (radius >= 3 && cy + 3 < AUTO_MAX_Y && cy - 3 > 0 && cx + 3 < AUTO_MAX_X && cx - 3 > 0) {
    const p = Math.min(radius, 5);
    if (floorAt(cy + 3, cx + 3)) lightUp(cy + 3, cx + 3);
    if (floorAt(cy + 3, cx - 3)) lightUp(cy + 3, cx - 3);
    if (floorAt(cy - 3, cx + 3)) lightUp(cy - 3, cx + 3);
    if (floorAt(cy - 3, cx - 3)) lightUp(cy - 3, cx - 3);
    const minY = Math.max(cy - p, 0);
    const maxY = Math.min(cy + p, AUTO_MAX_Y - 1);
    const minX = Math.max(cx - p, 0);
    const maxX = Math.min(cx + p, AUTO_MAX_X - 1);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dy = Math.abs(cy - y);
        const dx = Math.abs(cx - x);
        if (dy <= 2 && dx <= 2) continue;
        const d = dy > dx ? dy + (dx >> 1) : dx + (dy >> 1);
        if (d > p) continue;
        if (!map.inBounds(x, y)) continue;
        if (map.at(x, y).info & BORG_VIEW) lightUp(y, x);
      }
    }
  }
}
function ingestMonsters(world, view) {
  for (const [, k] of world.kills.entries()) {
    if (world.map.inBounds(k.pos.x, k.pos.y)) {
      world.map.at(k.pos.x, k.pos.y).kill = 0;
    }
    k.seen = false;
    k.used = false;
  }
  const byMidx = /* @__PURE__ */ new Map();
  for (const [i, k] of world.kills.entries()) {
    if (k.mIdx !== 0) byMidx.set(k.mIdx, i);
  }
  const visibleIds = /* @__PURE__ */ new Set();
  const names = /* @__PURE__ */ new Map();
  for (const m of view.monsters()) {
    if (!m.visible) continue;
    visibleIds.add(m.id);
    names.set(m.id, m.race);
    let idx = byMidx.get(m.id);
    if (idx === void 0) {
      idx = world.kills.alloc();
      byMidx.set(m.id, idx);
      if (world.clock < world.self.temp.needSeeInvis + 5) {
        clearLocalRegionFear(world);
      }
    }
    const k = world.kills.at(idx);
    k.mIdx = m.id;
    k.rIdx = m.raceIndex;
    k.known = true;
    k.ox = k.pos.x;
    k.oy = k.pos.y;
    k.pos.x = m.grid.x;
    k.pos.y = m.grid.y;
    k.awake = !m.asleep;
    k.afraid = m.afraid;
    k.confused = m.confused;
    k.stunned = m.stunned;
    k.speed = m.speed;
    k.power = m.hp;
    k.injury = m.maxHp > 0 ? Math.trunc((m.maxHp - m.hp) * 100 / m.maxHp) : 0;
    k.level = m.level;
    k.rangedAttack = m.spellFlags.length;
    k.isMultiplier = m.raceFlags.includes("MULTIPLY");
    k.seen = true;
    k.when = world.clock;
    if (world.map.inBounds(m.grid.x, m.grid.y)) {
      world.map.at(m.grid.x, m.grid.y).kill = idx;
    }
  }
  for (const [i, k] of world.kills.entries()) {
    if (world.clock - k.when < BORG_EXPIRE_TURNS) continue;
    world.kills.delete(i, world);
  }
  return { ids: visibleIds, names };
}
function clearLocalRegionFear(world) {
  const region = getFearCaches(world).region2d;
  const y0 = Math.trunc(world.self.c.y / 11);
  const x0 = Math.trunc(world.self.c.x / 11);
  const y1 = y0 > 0 ? y0 - 1 : 0;
  const x1 = x0 > 0 ? x0 - 1 : 0;
  const y2 = x0 < 5 ? x0 + 1 : 5;
  const x2 = x0 < 17 ? x0 + 1 : 17;
  const zero = (ry, rx) => {
    const row = region[ry];
    if (row && rx < row.length) row[rx] = 0;
  };
  zero(y0, x0);
  zero(y0, x1);
  zero(y0, x2);
  zero(y1, x0);
  zero(y2, x0);
  zero(y1, x1);
  zero(y1, x2);
  zero(y2, x1);
  zero(y2, x2);
}
function junkKey(tval, sval) {
  return `${String(tval)}:${String(sval)}`;
}
var TV_GOLD = 35;
function takeValue(item, valuation) {
  let value;
  if (item.tval === TV_GOLD) {
    value = 30;
  } else {
    const kind = valuation.kindCost?.(item.tval, item.sval) ?? null;
    value = kind?.aware ? kind.cost : 1;
  }
  if (item.toA < 0 || item.toD < 0 || item.toH < 0) value = -10;
  if (item.inscription?.startsWith("borg ignore")) value = -10;
  if (valuation.junked?.has(junkKey(item.tval, item.sval))) value = -10;
  return value;
}
function ingestFloor(world, view, oldX, oldY, valuation) {
  for (const [, t] of world.takes.entries()) {
    if (world.map.inBounds(t.pos.x, t.pos.y)) {
      world.map.at(t.pos.x, t.pos.y).take = 0;
    }
  }
  const byPos = /* @__PURE__ */ new Map();
  for (const [i, t] of world.takes.entries()) {
    byPos.set(`${t.pos.x},${t.pos.y}`, i);
  }
  const bounds = view.mapBounds();
  const maxY = Math.min(bounds.height, world.map.height);
  const maxX = Math.min(bounds.width, world.map.width);
  for (let y = 0; y < maxY; y++) {
    for (let x = 0; x < maxX; x++) {
      const c = view.cell(x, y);
      if (!c || c.objectCount <= 0) continue;
      const items = view.floorItems(x, y);
      const head = items[0];
      if (!head) continue;
      const key = `${x},${y}`;
      let idx = byPos.get(key);
      if (idx === void 0) {
        idx = world.takes.alloc();
        byPos.set(key, idx);
      }
      const t = world.takes.at(idx);
      t.kIdx = head.tval > 0 ? head.tval : 1;
      t.tval = head.tval;
      t.known = false;
      t.pos.x = x;
      t.pos.y = y;
      t.when = world.clock;
      t.value = takeValue(head, valuation);
    }
  }
  for (const [i, t] of world.takes.entries()) {
    const underMe = t.pos.x === world.self.c.x && t.pos.y === world.self.c.y || t.pos.x === oldX && t.pos.y === oldY;
    if (underMe) {
      world.takes.delete(i);
      continue;
    }
    if (world.clock - t.when >= BORG_EXPIRE_TURNS) {
      world.takes.delete(i);
      continue;
    }
    if (world.map.inBounds(t.pos.x, t.pos.y)) {
      world.map.at(t.pos.x, t.pos.y).take = i;
    }
  }
}

// src/controller.ts
function createBorg(opts = {}) {
  const world = new BorgWorld();
  const rng = makeBorgRng(opts.rngSeed);
  const memo = makePerceiveMemo();
  setBorgCfg(opts.cfg ?? {});
  getFightState(world).playsRisky = borgCfg().playsRisky;
  const session = buildThinkSession(opts.resolvers ?? {});
  installThinkSession(world, session);
  const blows = buildHitByTable(session.resolvers.blowActions ?? []);
  const spells = buildSpellTable(session.resolvers.spellMessages ?? []);
  const tables = { hitBy: blows.hitBy, spell: spells.spell, spellInvisible: spells.spellInvisible };
  let lastDepth = -1;
  let before = { lastGrid: session.lastGrid, arrival: session.arrivalPickup };
  const controller = hostController((view, act) => {
    const ctx = { world, view, act, rng };
    before = { lastGrid: session.lastGrid, arrival: session.arrivalPickup };
    world.clock += 1;
    world.self.timeThisPanel += 1;
    const depth = view.player().depth;
    if (depth !== lastDepth) {
      const fs = getFightState(world);
      if (lastDepth <= 0) fs.timeTown = 0;
      else fs.timeTown += world.clock - fs.began;
      world.clock = 1e3;
      session.flow.state.borgTAntisummon = 0;
      fs.tAntisummon = 0;
      fs.began = world.clock;
      session.flow.state.borgBegan = world.clock;
      const st2 = session.flow.state;
      st2.less.wipe();
      st2.more.wipe();
      st2.step.wipe();
      st2.door.wipe();
      st2.closed.wipe();
      st2.glyph.wipe();
      st2.vein.wipe();
      session.junked.clear();
      lastDepth = depth;
    }
    borgNotice(ctx);
    perceive(world, view, memo, tables, {
      kindCost: session.resolvers.kindCost,
      junked: session.junked
    });
    primeSession(session, ctx);
    borgFollowMissingKills(ctx, session.flow.state);
    borgUpdateMonsterFear(ctx);
    world.self.power = borgPower(ctx);
    const t = world.self.trait;
    if ((t[35 /* CLEVEL */] ?? 0) > (t[36 /* MAXCLEVEL */] ?? 0)) t[36 /* MAXCLEVEL */] = t[35 /* CLEVEL */];
    if ((t[105 /* CDEPTH */] ?? 0) > (t[106 /* MAXDEPTH */] ?? 0)) t[106 /* MAXDEPTH */] = t[105 /* CDEPTH */];
    const at = `${String(world.facts.depth)}:${String(world.self.c.x)},${String(world.self.c.y)}`;
    if (at !== session.lastGrid) {
      session.lastGrid = at;
      session.arrivalPickup = true;
    }
    const cmd = think(ctx);
    if (cmd?.code !== "pickup") session.arrivalPickup = false;
    return cmd;
  });
  const rewind = () => {
    world.clock -= 1;
    world.self.timeThisPanel -= 1;
    session.lastGrid = before.lastGrid;
    session.arrivalPickup = before.arrival;
  };
  return { world, rng, controller, rewind };
}

// src/resolvers.ts
function actToken(activation) {
  return `act_${activation.name.toLowerCase()}`;
}
function equippedActivation(item, objects) {
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
function findActivatedItem(ctx, act, checkCharge, objects) {
  for (const item of ctx.view.equipment()) {
    if (!item) continue;
    const record = equippedActivation(item, objects);
    if (!record || actToken(record) !== act) continue;
    if (checkCharge && item.timeout >= 1) continue;
    return item;
  }
  return null;
}
function makeCoreResolvers(input) {
  const byRidx = racesByIndex(input.races ?? []);
  const resolveMonsterFacts = (ctx, killIndex) => {
    const kill = ctx.world.kills.at(killIndex);
    const race = byRidx.get(kill.rIdx);
    const record = input.raceRecord?.(kill.rIdx) ?? (race ? raceRecord(race) : void 0);
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
      blows: record.blows.map((b) => ({
        dice: b.dice,
        sides: b.sides,
        effect: borgMonBlowEffect(b.effect)
      })),
      spells: record.spells
    };
  };
  const objects = input.objects;
  const resolveActivation = (ctx, act, checkCharge) => {
    if (!objects) return false;
    return findActivatedItem(ctx, act, checkCharge, objects) !== null;
  };
  const activateHandle2 = (ctx, act) => {
    if (!objects) return null;
    const item = findActivatedItem(ctx, act, true, objects);
    return item ? item.handle : null;
  };
  const state = input.state;
  const inShop = (_ctx) => {
    if (input.shopnum) return input.shopnum();
    if (!state) return null;
    const shopnum = shopnumHere(state);
    return shopnum > 0 ? shopnum - 1 : null;
  };
  const blowActions2 = [];
  for (const method of input.blowMethods ?? []) {
    for (const msg of method.messages) blowActions2.push(msg);
  }
  const kindCost = (tval, sval) => {
    if (input.kindCost) return input.kindCost(tval, sval);
    if (!objects) return null;
    return kindPrice(objects, state, tval, sval);
  };
  return {
    resolveMonsterFacts,
    resolveActivation,
    activateHandle: activateHandle2,
    inShop,
    kindCost,
    blowActions: blowActions2,
    spellMessages: [...input.monsterSpells ?? []],
    // Installed unconditionally. borgSimulatePower reads view.simulateLoadout,
    // which the agent API declares optional on the view itself, and answers null
    // when there is no live derive behind it (a worldless harness) - so this is
    // correct without asking the host anything.
    loadoutPower: (ctx, change) => borgSimulatePower(ctx, change)
  };
}

// src/api2/caches.ts
var RaceBook = class {
  records = /* @__PURE__ */ new Map();
  missing = /* @__PURE__ */ new Set();
  get(ridx) {
    return this.records.get(ridx);
  }
  /** Read the races of these indexes that are not known yet. */
  async ensure(truth, indexes) {
    const wanted = [...new Set(indexes)].filter((index) => !this.records.has(index) && !this.missing.has(index));
    await Promise.all(
      wanted.map(async (index) => {
        const race = await truth.race(index);
        if (race === null) {
          this.missing.add(index);
          return;
        }
        this.records.set(index, {
          ridx: race.ridx,
          flags: new Set(race.flags),
          level: race.level,
          sleep: race.sleep,
          spellPower: race.spellPower,
          freqInnate: race.freqInnate,
          freqSpell: race.freqSpell,
          hasFriends: race.hasFriends,
          blows: race.blows.map((blow) => ({ dice: blow.dice, sides: blow.sides, effect: blow.effect })),
          spells: [...race.spells].sort((a, b) => a - b)
        });
      })
    );
  }
};
var ActivationBook = class {
  names = /* @__PURE__ */ new Map();
  artifact(name) {
    return this.names.get(`a:${name}`) ?? null;
  }
  ego(name) {
    return this.names.get(`e:${name}`) ?? null;
  }
  kind(tval, sval) {
    return this.names.get(`k:${String(tval)}:${String(sval)}`) ?? null;
  }
  /** Read the activations of every worn item that has one, for any source not read yet. */
  async ensure(api, equipment2) {
    const asks = /* @__PURE__ */ new Map();
    for (const item of equipment2) {
      if (item === null || !item.activation) continue;
      if (item.artifact && item.artifactName) asks.set(`a:${item.artifactName}`, { artifact: item.artifactName });
      if (item.ego && item.egoName) asks.set(`e:${item.egoName}`, { ego: item.egoName });
      asks.set(`k:${String(item.tval)}:${String(item.sval)}`, { tval: item.tval, sval: item.sval });
    }
    await Promise.all(
      [...asks].filter(([key]) => !this.names.has(key)).map(async ([key, ref]) => {
        const result = await api.content.activation(ref);
        if (!result.ok) return;
        this.names.set(key, result.value === null ? null : { name: result.value.name });
      })
    );
  }
};
var SIMULATIONS_PER_ROUND = 48;
var LoadoutBook = class {
  gear = "";
  answers = /* @__PURE__ */ new Map();
  asked = /* @__PURE__ */ new Set();
  wanted = /* @__PURE__ */ new Map();
  /** Start a decision over this set of gear. */
  begin(gear) {
    if (gear === this.gear) return;
    this.gear = gear;
    this.answers.clear();
    this.asked.clear();
    this.wanted.clear();
  }
  /** How many answered questions the cache holds, for the log. */
  get size() {
    return this.answers.size;
  }
  /** Whether the last decision asked something the cache could not answer. */
  get pending() {
    return this.wanted.size > 0;
  }
  /** The answer for a change, or null while it is being read. */
  answer(change) {
    const key = JSON.stringify(change);
    const base = this.answers.get("{}");
    if (key !== "{}" && base === void 0) this.want("{}", {});
    const hit = this.answers.get(key);
    if (hit === void 0) {
      this.want(key, change);
      return null;
    }
    return key === "{}" || base !== void 0 ? hit : null;
  }
  want(key, change) {
    if (this.asked.has(key)) return;
    this.wanted.set(key, change);
  }
  /** Read the recorded questions from the game, up to a round's worth. Returns how many answers arrived. */
  async settle(api, convert) {
    const round = [...this.wanted].slice(0, SIMULATIONS_PER_ROUND);
    const gear = this.gear;
    for (const [key] of round) {
      this.wanted.delete(key);
      this.asked.add(key);
    }
    let arrived = 0;
    await Promise.all(
      round.map(async ([key, change]) => {
        const result = await api.view.simulateLoadout(change);
        if (!result.ok || gear !== this.gear) return;
        this.answers.set(key, convert(result.value));
        arrived += 1;
      })
    );
    return arrived;
  }
};
function gearSignature(inventory, equipment2, stores, player) {
  const one = (item) => item === null ? "-" : `${String(item.handle)}:${item.kindKey}:${String(item.number)}:${String(item.toH)}:${String(item.toD)}:${String(item.toA)}`;
  const stock = stores.map((store2) => `${String(store2.feat)}[${store2.stock.map(one).join(",")}]`).join(";");
  return `${inventory.map(one).join(",")}|${equipment2.map(one).join(",")}|${stock}|${String(player?.level ?? 0)}`;
}

// src/api2/feed.ts
async function watchMessages(api) {
  let batch = [];
  const result = await api.events.on("message", (event) => {
    batch.push(event.text);
  });
  const subscription = result.ok ? result.value : null;
  return {
    drain: () => {
      const out = batch;
      batch = [];
      return out;
    },
    stop: async () => {
      if (subscription !== null) await api.events.off(subscription);
    }
  };
}

// src/api2/records.ts
async function valueOf2(call) {
  const result = await call;
  return result.ok ? result.value : null;
}
function recordFlags(value) {
  const lines = Array.isArray(value) ? value : value === void 0 ? [] : [value];
  const names = /* @__PURE__ */ new Set();
  for (const line of lines) {
    if (typeof line !== "string") continue;
    for (const name of line.split("|")) {
      const trimmed = name.trim();
      if (trimmed !== "") names.add(trimmed);
    }
  }
  return names;
}
function joined(value) {
  return Array.isArray(value) ? value.filter((line) => typeof line === "string").join("") : "";
}
async function trapKinds(api) {
  const records = await valueOf2(api.content.records("trap")) ?? [];
  return records.map((record) => recordFlags(record["flags"]).has("TRAP"));
}
async function blowActions(api) {
  const records = await valueOf2(api.content.records("blow_methods")) ?? [];
  const out = [];
  for (const record of records) {
    const act = record["act"];
    if (!Array.isArray(act)) continue;
    for (const line of act) if (typeof line === "string") out.push(line);
  }
  return out;
}
async function spellMessages(api) {
  const records = await valueOf2(api.content.records("monster_spell")) ?? [];
  const table = RSF;
  const out = [];
  for (const record of records) {
    const name = record["name"];
    const index = typeof name === "string" ? table[name] : void 0;
    if (index === void 0) continue;
    const level = (rec) => ({ message: joined(rec["message-vis"]), blindMessage: joined(rec["message-invis"]), missMessage: joined(rec["message-miss"]) });
    const cutoffs = Array.isArray(record["power-cutoff"]) ? record["power-cutoff"] : [];
    out.push({
      index,
      levels: [level(record), ...cutoffs.filter((cut) => cut !== null && typeof cut === "object" && !Array.isArray(cut)).map(level)]
    });
  }
  return out;
}
async function kindCosts(api) {
  const records = await valueOf2(api.content.records("object")) ?? [];
  return records.map((record) => typeof record["cost"] === "number" ? record["cost"] : 0);
}
var DEFAULT_CONSTANTS = {
  moveEnergy: 100,
  maxSight: 20,
  maxRange: 20,
  fleeRange: 5,
  turnRange: 5,
  reproMonsterMax: 100,
  reproMonsterRate: 8,
  glyphHardness: 550,
  dayLength: 1e4,
  foodValue: 100,
  foodStarve: 100,
  foodFaint: 400,
  foodWeak: 800,
  foodHungry: 1500,
  allocMonsterChance: 500,
  storeTurns: 1e3,
  lifeDrainPercent: 2,
  levelMonsterMax: 1024,
  floorSize: 23,
  maxDepth: 128,
  stairSkip: 1
};
var CONSTANT_SOURCES = {
  maxSight: ["player", "max-sight"],
  maxRange: ["player", "max-range"],
  floorSize: ["carry-cap", "floor-size"],
  maxDepth: ["world", "max-depth"],
  stairSkip: ["world", "stair-skip"],
  dayLength: ["world", "day-length"],
  foodValue: ["player", "food-value"],
  allocMonsterChance: ["mon-gen", "chance"],
  storeTurns: ["store", "turns"],
  lifeDrainPercent: ["mon-play", "life-drain"],
  levelMonsterMax: ["level-max", "monsters"]
};
async function gameConstants(api) {
  const records = await valueOf2(api.content.records("constants")) ?? [];
  const lookup = (section, label) => {
    for (const record of records) {
      const entries = record[section];
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (entry !== null && typeof entry === "object" && !Array.isArray(entry) && entry["label"] === label && typeof entry["value"] === "number") return entry["value"];
      }
    }
    return void 0;
  };
  const out = { ...DEFAULT_CONSTANTS };
  for (const [field, source] of Object.entries(CONSTANT_SOURCES)) {
    const value = lookup(source[0], source[1]);
    if (value !== void 0) out[field] = value;
  }
  return out;
}
var TIMED_RECORDS = {
  blind: "BLIND",
  confused: "CONFUSED",
  afraid: "AFRAID",
  poisoned: "POISONED",
  cut: "CUT",
  stun: "STUN",
  paralyzed: "PARALYZED",
  fast: "FAST",
  sprint: "SPRINT",
  protEvil: "PROTEVIL",
  hero: "HERO",
  shero: "SHERO",
  shield: "SHIELD",
  stoneskin: "STONESKIN",
  blessed: "BLESSED",
  fastcast: "FASTCAST",
  resAcid: "OPP_ACID",
  resElec: "OPP_ELEC",
  resFire: "OPP_FIRE",
  resCold: "OPP_COLD",
  resPois: "OPP_POIS",
  terror: "TERROR",
  amnesia: "AMNESIA",
  image: "IMAGE"
};
async function gradeFloors(api) {
  const records = await valueOf2(api.content.records("player_timed")) ?? [];
  const out = /* @__PURE__ */ new Map();
  for (const record of records) {
    const name = record["name"];
    const grades = record["grade"];
    if (typeof name !== "string" || !Array.isArray(grades)) continue;
    const floors = /* @__PURE__ */ new Map();
    let floor = 1;
    for (const grade of grades) {
      if (grade === null || typeof grade !== "object" || Array.isArray(grade)) continue;
      const label = grade["name"];
      if (typeof label === "string" && label !== "" && !floors.has(label)) floors.set(label, floor);
      if (typeof grade["max"] === "number") floor = grade["max"] + 1;
    }
    out.set(name, floors);
  }
  return out;
}

// src/api2/truth.ts
function borgTruth(mod2) {
  const truth = mod2.truth;
  if (truth === void 0) return null;
  return {
    async perceivedMonsters() {
      const result = await truth.monsters();
      return result.ok ? result.value.filter((monster) => monster.perceived) : null;
    },
    async race(index) {
      const result = await truth.race(index);
      return result.ok ? result.value : null;
    }
  };
}

// src/api2/world.ts
function writable(value) {
  return structuredClone(value);
}
function playerView(known, floors) {
  const { status, recall, descent, ...rest } = writable(known);
  const timed = {};
  for (const [field, record] of Object.entries(TIMED_RECORDS)) {
    const grade = status[field];
    timed[field] = grade === null ? 0 : floors.get(record)?.get(grade) ?? 1;
  }
  return { ...rest, status: { ...timed, food: status.food * 100, fearful: status.fearful }, recall: recall ? 1 : 0, descent: descent ? 1 : 0 };
}
function itemView(item) {
  const { charging, fuel, unknownRunes: _unknownRunes, ...rest } = writable(item);
  return { ...rest, timeout: fuel ?? charging };
}
function storeItemView(item) {
  const { index, price } = item;
  return { ...itemView(item), index, ...price === void 0 ? {} : { price } };
}
var BAND_SHARE = { unhurt: 1, somewhat: 0.8, wounded: 0.42, badly: 0.17, almost: 0.05 };
function knownMonsterView(monster) {
  const has2 = (status) => monster.status.includes(status);
  const maxHp = monster.averageHp !== null && monster.averageHp > 0 ? monster.averageHp : 100;
  const hp = monster.health === "unhurt" ? maxHp : Math.min(maxHp - 1, Math.max(1, Math.round(maxHp * BAND_SHARE[monster.health])));
  const view = {
    id: monster.id,
    race: monster.race,
    raceIndex: monster.raceIndex,
    grid: { x: monster.grid.x, y: monster.grid.y },
    visible: monster.visible,
    hp,
    maxHp,
    speed: monster.raceSpeed,
    asleep: has2("asleep"),
    afraid: has2("afraid"),
    confused: has2("confused"),
    stunned: has2("stunned"),
    level: monster.raceLevel,
    poisoned: false,
    raceFlags: [...monster.knownFlags],
    unique: monster.unique,
    questGuardian: monster.questGuardian,
    finalGuardian: monster.finalGuardian,
    spellFlags: [...monster.knownSpells],
    knownSpellFlags: [...monster.knownSpells]
  };
  if (monster.raceId !== void 0) view.raceId = monster.raceId;
  if (monster.glyph !== void 0) view.glyph = monster.glyph;
  return view;
}
async function monsterViews(known, reads) {
  const listed = known.monsters ?? [];
  if (reads.truth === null) return listed.map(knownMonsterView);
  const real = await reads.truth.perceivedMonsters();
  if (real === null) return listed.map(knownMonsterView);
  const byGrid = /* @__PURE__ */ new Map();
  for (const monster of listed) byGrid.set(`${String(monster.grid.x)},${String(monster.grid.y)}`, monster);
  const out = [];
  for (const monster of real) {
    const named = byGrid.get(`${String(monster.grid.x)},${String(monster.grid.y)}`);
    if (named === void 0 || named.raceIndex !== monster.raceIndex) continue;
    const view = {
      id: named.id,
      race: monster.race,
      raceIndex: monster.raceIndex,
      grid: { x: monster.grid.x, y: monster.grid.y },
      visible: monster.visible,
      hp: monster.hp,
      maxHp: monster.maxHp,
      speed: monster.speed,
      asleep: monster.asleep,
      afraid: monster.afraid,
      confused: monster.confused,
      stunned: monster.stunned,
      level: monster.level,
      poisoned: monster.poisoned,
      raceFlags: [...monster.raceFlags],
      unique: monster.unique,
      questGuardian: monster.questGuardian,
      finalGuardian: monster.finalGuardian,
      spellFlags: [...monster.spellFlags],
      knownSpellFlags: [...monster.knownSpellFlags]
    };
    if (monster.raceId !== void 0) view.raceId = monster.raceId;
    if (monster.glyph !== void 0) view.glyph = monster.glyph;
    out.push(view);
  }
  return out;
}
function simulationView(floors) {
  const loadout = (view) => ({
    player: playerView(view.player, floors),
    equipment: view.equipment.map((item) => item === null ? null : itemView(item)),
    inventory: view.inventory.map(itemView),
    stats: writable(view.stats)
  });
  return (simulation) => ({
    before: loadout(simulation.before),
    after: loadout(simulation.after),
    delta: writable(simulation.delta),
    placements: simulation.placements.map((placement) => ({ slot: placement.slot, worn: itemView(placement.worn), displaced: placement.displaced === null ? null : itemView(placement.displaced) })),
    unresolved: writable(simulation.unresolved)
  });
}
async function readWorld(api, reads) {
  const known = await valueOf2(api.view.world());
  if (known === null || known.player === null) return null;
  const { statics } = reads;
  const player = playerView(known.player, statics.floors);
  const inventory = (known.inventory ?? []).map(itemView);
  const equipment2 = (known.equipment ?? []).map((item) => item === null ? null : itemView(item));
  const quiver = (known.quiver ?? []).map(itemView);
  const floorHere = (known.floorHere ?? []).map(itemView);
  const monsters = await monsterViews(known, reads);
  if (reads.truth !== null) await reads.races.ensure(reads.truth, monsters.map((monster) => monster.raceIndex));
  await reads.activations.ensure(api, equipment2);
  reads.loadouts.begin(gearSignature(known.inventory ?? [], known.equipment ?? [], known.stores ?? [], known.player));
  const width = known.level?.width ?? 0;
  const height = known.level?.height ?? 0;
  const cells = /* @__PURE__ */ new Map();
  for (const cell2 of known.level?.cells ?? []) cells.set(cell2.y * width + cell2.x, cell2);
  const occupants = /* @__PURE__ */ new Map();
  for (const monster of monsters) occupants.set(monster.grid.y * width + monster.grid.x, monster.id);
  const cell = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    const occupant = player.grid.x === x && player.grid.y === y ? -1 : occupants.get(y * width + x) ?? 0;
    const remembered = cells.get(y * width + x);
    if (remembered === void 0) {
      return { x, y, feat: 0, passable: false, inView: false, known: false, monster: occupant, objectCount: 0, knownObjectCount: 0, glow: false, trap: false };
    }
    const memory = remembered.remembered;
    const view2 = {
      x,
      y,
      feat: memory.feat,
      passable: memory.passable,
      inView: remembered.visible,
      known: true,
      monster: occupant,
      objectCount: memory.objects.length,
      knownObjectCount: memory.objects.length,
      glow: remembered.glow,
      /* The disarm command's own check: a visible trap whose kind is a TRAP and that is not disabled. */
      trap: memory.traps.some((trap) => !trap.disabled && statics.trapKinds[trap.index] === true)
    };
    if (memory.featCode !== void 0) view2.featCode = memory.featCode;
    return view2;
  };
  const kinds = /* @__PURE__ */ new Map();
  const noteKinds = (items) => {
    for (const item of items) {
      const index = /^kind:(\d+)$/.exec(item.kindKey);
      if (!item.aware || index === null) continue;
      kinds.set(`${String(item.tval)}:${String(item.sval)}`, { cost: statics.kindCosts[Number(index[1])] ?? 0, aware: true });
    }
  };
  noteKinds(inventory);
  noteKinds(quiver);
  noteKinds(floorHere);
  noteKinds(equipment2.filter((item) => item !== null));
  const floorOf = (x, y) => (cells.get(y * width + x)?.remembered.items ?? []).map(itemView);
  for (const remembered of cells.values()) noteKinds((remembered.remembered.items ?? []).map(itemView));
  const view = {
    apiVersion: "2.0.0",
    turn: () => known.turn ?? 0,
    player: () => writable(player),
    monsters: () => monsters.map((monster) => writable(monster)),
    cell,
    mapBounds: () => ({ width, height }),
    inventory: () => [...inventory],
    quiver: () => [...quiver],
    equipment: () => [...equipment2],
    floorItems: (x, y) => x === player.grid.x && y === player.grid.y ? [...floorHere] : floorOf(x, y),
    target: () => known.target === null ? null : { midx: known.target.monster ?? 0, grid: { x: known.target.grid.x, y: known.target.grid.y } },
    messages: () => reads.messages?.drain() ?? [],
    stores: () => (known.stores ?? []).map((store2) => ({ ...writable(store2), stock: store2.stock.map(storeItemView) })),
    spellbooks: () => (known.spellbooks ?? []).map((book) => writable(book)),
    constants: () => ({ ...statics.constants }),
    inputToken: () => ({ epoch: known.token.epoch, revision: known.token.revision }),
    simulateLoadout: (change) => reads.loadouts.answer(change)
  };
  return { view, facts: { shopnum: known.player.shopnum, kinds } };
}

// src/api2/host.ts
var unit = () => void 0;
var NO_FACTS = { shopnum: null, kinds: /* @__PURE__ */ new Map() };
function createBridge(mod2) {
  const truth = borgTruth(mod2);
  const races = new RaceBook();
  const activations = new ActivationBook();
  const loadouts = new LoadoutBook();
  let statics = null;
  let feed = null;
  let input = null;
  let facts = NO_FACTS;
  let blows = [];
  let spells = [];
  const objects = {
    lookupKind: (tval, sval) => {
      const activation = activations.kind(tval, sval);
      const price = facts.kinds.get(`${String(tval)}:${String(sval)}`);
      return activation === null && price === void 0 ? null : { activation, ...price === void 0 ? {} : { cost: price.cost, aware: price.aware } };
    },
    findEgo: (name) => ({ activation: activations.ego(name) }),
    findArtifact: (name) => ({ activation: activations.artifact(name) })
  };
  return {
    hasTruth: truth !== null,
    async prime() {
      const engine = mod2.engine;
      if (engine === void 0) throw new Error("the game gave the Borg no engine, so it cannot bind the engine's constants");
      bindCore(engine.core);
      if (!coreIsBound()) throw new Error("the Borg could not take the engine from the engine domain");
      const [constants, floors, traps, costs, actions, messages] = await Promise.all([gameConstants(mod2), gradeFloors(mod2), trapKinds(mod2), kindCosts(mod2), blowActions(mod2), spellMessages(mod2)]);
      statics = { constants, floors, trapKinds: traps, kindCosts: costs };
      blows = actions;
      spells = messages;
      feed = await watchMessages(mod2);
    },
    async readWorld() {
      if (statics === null) return null;
      const world = await readWorld(mod2, { statics, races, activations, loadouts, truth, messages: feed ?? void 0 });
      if (world !== null) facts = world.facts;
      return world;
    },
    setInput(next) {
      input = next;
    },
    input: () => input,
    loadoutsPending: () => loadouts.pending,
    async settleLoadouts() {
      if (statics === null) return 0;
      return loadouts.settle(mod2, simulationView(statics.floors));
    },
    resolverInput() {
      return {
        raceRecord: (ridx) => races.get(ridx),
        objects,
        shopnum: () => facts.shopnum,
        kindCost: (tval, sval) => facts.kinds.get(`${String(tval)}:${String(sval)}`) ?? null,
        blowMethods: blows.map((message) => ({ messages: [message] })),
        monsterSpells: spells
      };
    },
    async dispose() {
      await feed?.stop().catch(unit);
      feed = null;
    }
  };
}

// src/api2/act.ts
var REST_COMPLETE2 = -2;
function createActFacade() {
  let targets = [];
  const cmd = (code, args) => args ? { code, args } : { code };
  const dirCmd = (code, dir) => ({ code, dir });
  const itemCmd = (code, handle) => cmd(code, { handle });
  const act = {
    move: (dir) => dirCmd("walk", dir),
    melee: (dir) => dirCmd("walk", dir),
    hold: () => cmd("hold"),
    rest: (count) => cmd("rest", { count: count ?? REST_COMPLETE2 }),
    descend: () => cmd("descend"),
    ascend: () => cmd("ascend"),
    tunnel: (dir) => dirCmd("tunnel", dir),
    open: (dir) => dirCmd("open", dir),
    close: (dir) => dirCmd("close", dir),
    disarm: (dir) => dirCmd("disarm", dir),
    quaff: (handle) => itemCmd("quaff", handle),
    read: (handle) => itemCmd("read", handle),
    eat: (handle) => itemCmd("eat", handle),
    wear: (handle) => itemCmd("wield", handle),
    takeoff: (handle) => itemCmd("takeoff", handle),
    drop: (handle, number) => cmd("drop", number !== void 0 ? { handle, quantity: number } : { handle }),
    pickup: () => cmd("pickup"),
    destroy: (handle) => itemCmd("destroy", handle),
    aimWand: (handle) => itemCmd("aim-wand", handle),
    zapRod: (handle) => itemCmd("zap-rod", handle),
    useStaff: (handle) => itemCmd("use-staff", handle),
    activate: (handle) => itemCmd("activate", handle),
    fire: (handle) => itemCmd("fire", handle),
    throw: (handle) => itemCmd("throw", handle),
    cast: (spell) => cmd("cast", { spell }),
    setTargetMonster: (midx) => {
      targets = [...targets, { kind: "target", midx }];
      return true;
    },
    setTargetLocation: (x, y) => {
      targets = [...targets, { kind: "target", x, y }];
    },
    shopBuy: (index, number) => cmd("shop-buy", number !== void 0 ? { index, quantity: number } : { index }),
    shopSell: (handle, number) => cmd("shop-sell", number !== void 0 ? { handle, quantity: number } : { handle }),
    shopExit: () => cmd("shop-exit"),
    raw: (code, args) => cmd(code, args)
  };
  return {
    act,
    take() {
      const taken = targets;
      targets = [];
      return taken;
    }
  };
}
function intentOf(command) {
  const { code, dir, args } = command;
  return {
    kind: "command",
    command: {
      code,
      ...dir !== void 0 ? { dir } : {},
      ...args !== void 0 ? { args } : {}
    }
  };
}

// src/api2/controller.ts
var REFUSALS_BEFORE_RELEASE = 25;
var IDLE_BEFORE_RELEASE = 25;
var MAX_EXTRA_PASSES = 6;
var STALLS_BEFORE_FORGET = 6;
var STALLS_BEFORE_RELEASE = 40;
var DIR_DX = [0, -1, 0, 1, -1, 0, 1, -1, 0, 1];
var DIR_DY = [0, 1, 1, 1, 0, 0, 0, -1, -1, -1];
function promptAnswer(prompt) {
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
function aimedGrid(command, from) {
  const dir = command.dir;
  if (dir === void 0 || dir < 1 || dir > 9 || dir === 5) return null;
  return { x: from.x + DIR_DX[dir], y: from.y + DIR_DY[dir] };
}
function sceneOf(world) {
  const player = world.view.player();
  const monsters = world.view.monsters().map((monster) => [monster.grid.x, monster.grid.y, monster.hp]);
  return JSON.stringify([player.grid.x, player.grid.y, player["depth"], player["hp"], player["sp"], player["exp"], player["gold"], monsters]);
}
function createTick(bridge2, borg) {
  let refusals = 0;
  let idle = 0;
  let announced = false;
  let lastScene = "";
  let lastCommand = "";
  let stalls = 0;
  return async (mod2, input) => {
    bridge2.setInput(input);
    if (input.prompt !== null) {
      await mod2.act.answer(input.prompt.promptId, promptAnswer(input.prompt));
      return;
    }
    if (input.phase !== "play" && input.phase !== "store") return;
    const world = await bridge2.readWorld();
    if (world === null) return;
    let facade = createActFacade();
    let command = borg.controller(world.view, facade.act);
    for (let pass = 0; pass < MAX_EXTRA_PASSES && bridge2.loadoutsPending(); pass++) {
      if (await bridge2.settleLoadouts() === 0) break;
      borg.rewind();
      facade = createActFacade();
      command = borg.controller(world.view, facade.act);
    }
    const targets = facade.take();
    if (command === null) {
      idle += 1;
      if (idle >= IDLE_BEFORE_RELEASE) {
        idle = 0;
        await mod2.act.controller.release("The Borg had no command to give.");
      }
      return;
    }
    idle = 0;
    const scene = sceneOf(world);
    const key = JSON.stringify(command);
    stalls = scene === lastScene && key === lastCommand ? stalls + 1 : 0;
    lastScene = scene;
    lastCommand = key;
    if (stalls >= STALLS_BEFORE_RELEASE) {
      stalls = 0;
      await mod2.act.controller.release(`The Borg's ${command.code} changed nothing ${String(STALLS_BEFORE_RELEASE)} times running.`);
      return;
    }
    if (stalls >= STALLS_BEFORE_FORGET && stalls % STALLS_BEFORE_FORGET === 0) {
      const aim = aimedGrid(command, world.view.player().grid);
      if (aim !== null && borg.forget !== void 0) {
        borg.forget(aim.x, aim.y);
        mod2.meta.log(`the Borg's ${command.code} at ${String(aim.x)},${String(aim.y)} changed nothing, so it forgot what it believed was there`);
      }
    }
    if (!announced) {
      announced = true;
      mod2.meta.log("the Borg is playing");
    }
    let token = input.token;
    for (const target of targets) {
      const result = await mod2.act.submit(token, target);
      if (!result.ok) mod2.meta.log(`the Borg's target was refused: ${result.message}`);
    }
    if (targets.length > 0) {
      const fresh = await mod2.view.input();
      if (fresh.ok) token = fresh.value.token;
    }
    const sent = await mod2.act.submit(token, intentOf(command));
    if (sent.ok) {
      refusals = 0;
      return;
    }
    refusals += 1;
    if (refusals === 1 || refusals % 10 === 0) mod2.meta.log(`the Borg's ${command.code} was refused: ${sent.message}`);
    if (refusals >= REFUSALS_BEFORE_RELEASE) {
      refusals = 0;
      await mod2.act.controller.release("The game kept refusing the Borg's commands.");
    }
  };
}

// plugin.ts
function characterAlreadyAutoplayed(context) {
  const state = context.engine?.state;
  return ((state?.actor?.player?.noscore ?? 0) & NOSCORE_BORG) !== 0;
}
var RULE_CFG = {
  "borg.playsRisky": "playsRisky",
  "borg.worshipsDamage": "worshipsDamage",
  "borg.worshipsSpeed": "worshipsSpeed",
  "borg.worshipsHp": "worshipsHp",
  "borg.worshipsMana": "worshipsMana",
  "borg.worshipsAc": "worshipsAc",
  "borg.worshipsGold": "worshipsGold",
  "borg.selfScum": "selfScum",
  "borg.munchkinStart": "munchkinStart"
};
function cfgFromFlags(flags) {
  const cfg = {};
  for (const [flag, key] of Object.entries(RULE_CFG)) {
    const value = flags[flag];
    if (typeof value === "boolean") cfg[key] = value;
  }
  return cfg;
}
function changedFrom(cfg) {
  const stock = defaultCfg();
  return Object.entries(cfg).filter(([key, value]) => stock[key] !== value).map(([key, value]) => `${key}=${String(value)}`).sort();
}
var bridge;
var running;
async function begin(mod2) {
  void bridge?.dispose();
  const made = createBridge(mod2);
  bridge = made;
  await made.prime();
  const cfg = cfgFromFlags(mod2.meta.flags);
  setBuffTimerSafetyNet(mod2.meta.flags["bugfix.borgFixes"] ?? true);
  const borg = createBorg({ resolvers: makeCoreResolvers(made.resolverInput()), cfg });
  registerBorgTitle(
    {
      id: mod2.meta.id,
      log: (message) => mod2.meta.log(message),
      ...mod2.presentation?.title ? { title: mod2.presentation.title } : {},
      ...mod2.manage ? { profiles: mod2.manage.profiles } : {}
    },
    installMemory(mod2.store.install)
  );
  mod2.meta.log(
    made.hasTruth ? "the Borg has the keyboard, with danger vision over the monsters the character perceives, activation identity, the in-shop signal and loadout evaluation" : "the Borg has the keyboard, but the game gave it no truth domain: it plays from the known world only, with monster hit points read from health bands"
  );
  const changed = changedFrom(cfg);
  mod2.meta.log(changed.length === 0 ? "the Borg is on upstream's stock settings" : `the Borg's settings differ from stock: ${changed.join(", ")}`);
  const forget = (x, y) => {
    if (!borg.world.map.inBounds(x, y)) return;
    const grid = borg.world.map.at(x, y);
    grid.feat = 0;
    grid.info &= ~(BORG_MARK | BORG_VIEW);
  };
  return { bridge: made, tick: createTick(made, { controller: borg.controller, rewind: borg.rewind, forget }) };
}
var definition = {
  api: ">=2.0.0 <3.0.0",
  async start(mod2) {
    running = begin(mod2).catch((error) => {
      mod2.meta.log(`the Borg could not start: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
    await running;
  },
  /* The game tears its mods down before it reloads, and the headless runner registers them again on the same page after a save and reload. The message listener leaves the game here, or the second registration doubles every message. */
  stop() {
    running = void 0;
    const held = bridge;
    bridge = void 0;
    void held?.dispose();
  },
  /* Offer to play only when this character was handed to an autoplayer before or was armed from the title row. Returning false is the normal case: the mod is installed and enabled, and this character has never been handed over, so the human keeps the keyboard. */
  armed(context) {
    return context.armed || characterAlreadyAutoplayed(context);
  },
  async controller(mod2, input) {
    const live = await running;
    if (live === void 0 || live === null) return;
    await live.tick(mod2, input);
  }
};
var plugin_default = definition;
export {
  plugin_default as default
};
