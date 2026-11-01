# Borg: quick reference

Angband's automatic player, ported from the borg in Angband 4.2.6. It plays the way you do, through the same commands, over mod API 2, with no privileged code inside the engine.

This page is the short version: every setting, what the mod asks the game for,
and where the longer material is. The account of why each of these exists is in
[the repository README](../README.md).

## Settings

Each one is a named toggle on the game's own Mods screen, which shows the full
description. The identifier is the name a save and another mod see; where a
switch has no flag of its own, the game knows it by its section id instead.

| Setting | Identifier | Default | What it does |
| --- | --- | --- | --- |
| Play risky | `borg.playsRisky` | off | borg_plays_risky. Skip the early hit-point and character-level gates that hold the Borg above a depth, wait longer before drinking a cure, and back away later in a losing fight. |
| Value melee and missile damage | `borg.worshipsDamage` | off | borg_worships_damage. Add weight to weapon and bow damage when the Borg scores a set of gear, so a trade that costs armour for damage looks better than it otherwise would. |
| Value speed | `borg.worshipsSpeed` | off | borg_worships_speed. Add weight to a speed bonus when scoring gear. |
| Value hit points | `borg.worshipsHp` | off | borg_worships_hp. Add weight to constitution and hit points when scoring gear. |
| Value spell points | `borg.worshipsMana` | off | borg_worships_mana. Add weight to spell points when scoring gear. |
| Value armour class | `borg.worshipsAc` | off | borg_worships_ac. Add weight to armour class when scoring gear. |
| Value gold | `borg.worshipsGold` | off | borg_worships_gold. Sell harder, walk down rather than pay for a recall, and put off the first deep recall. |
| Save up for something it wants | `borg.selfScum` | on | borg_self_scum. Let the Borg set itself a gold target and work in town until it can afford one item it has decided it needs. |
| Skimp on stockpiles for an early munchkin run | `borg.munchkinStart` | off | borg_munchkin_start. Below character level borg_munchkin_level (12), stop valuing potions of resist poison and speed, phase door, word of recall and the deeper cure stockpiles as highly as it normally would, on the assumption that a young character is cashing out rather than settling in. |

## What it needs

- **Engine:** `>=1.23.0-beta.1`
- **Mod API:** `>=2.0.0 <3.0.0`
- **Shape:** `plugin`
- **Facets:** `plugin`
- **Capabilities:** `command:add`, `state:player.read`, `state:monsters.read`, `state:map.read`, `state:inventory.read`, `state:floor.read`, `state:stores.read`, `state:spells.read`, `state:turn.read`, `state:monsters-actual.read`, `state:interaction.read`, `input:intent`, `input:prompt.reply`, `event:message`, `ui:title`, `profiles:manage`, `saves:manage`

Only `state:monsters-actual.read` lets the Borg see past what the character has found. It uses that for two things: the exact hit points of monsters the character can perceive, and those monsters' race records. The game leaves it off unless you switch it on, and without it the Borg plays from what the character knows. See [How the Borg runs on mod API 2](API2-MIGRATION.md).

What a capability string permits, and what a mod that asks for one cannot do
without it, is in [the mod lifecycle
document](https://github.com/neostryder/neo-angband/blob/master/docs/modding/MOD_LIFECYCLE.md).

## Elsewhere

- [README](../README.md), the full account
- [Changelog](../CHANGELOG.md), what changed in each version
- [Planned](../PLANNED.md), what is not built yet
- [How the Borg runs on mod API 2](API2-MIGRATION.md), what it reads and submits
- [How the Borg reaches the
  game](https://github.com/neostryder/neo-angband/blob/master/docs/modding/BORG.md),
  in the game's own repository
- [Installing a
  mod](https://github.com/neostryder/neo-angband/blob/master/docs/MODS.md), the
  route every mod installs by
