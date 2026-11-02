# Settings reference

The Borg reads the toggles below when its controller is created; changing any
of them requires a reload before the controller uses the new value. The two
birth settings are different: `borg.raceRandom` is read once per page (every
armed birth follows the reload its writer issues, so each birth sees the
then-current toggle) and `borg.raceChoice` at each birth, so both apply to
the next warrior without waiting on anything else.

| Flag | Default | What it does | Reload required |
| --- | --- | --- | --- |
| `borg.playsRisky` | off | Lets the Borg dive sooner and accept more danger. | Yes, controller side. |
| `borg.worshipsDamage` | off | Gives weapon and bow damage more weight when choosing gear. | Yes, controller side. |
| `borg.worshipsSpeed` | off | Gives speed bonuses more weight when choosing gear. | Yes, controller side. |
| `borg.worshipsHp` | off | Gives Constitution and hit points more weight when choosing gear. | Yes, controller side. |
| `borg.worshipsMana` | off | Gives spell points more weight when choosing gear. | Yes, controller side. |
| `borg.worshipsAc` | off | Gives armour class more weight when choosing gear. | Yes, controller side. |
| `borg.worshipsGold` | off | Makes the Borg prioritize gold and delay some descents. | Yes, controller side. |
| `borg.selfScum` | on | Lets the Borg work in town toward a chosen purchase. | Yes, controller side. |
| `borg.munchkinStart` | off | Reduces early stockpile priorities for a faster cash focused start. | Yes, controller side. |
| `borg.raceRandom` | on | Every warrior draws its race uniformly from the bake-off shortlist (Half-Troll, Dunadan, High-Elf, Dwarf), seeded by a persisted birth counter: the same counter always draws the same race, each birth bumps the counter, so an unattended line varies its race deterministically - no clock, no random numbers, the Borg's decision RNG untouched. The counter is not a record of what was played; the per-character journal is. | Yes, birth side: read once per page. |
| `borg.raceChoice` | 2 | The race the Borg's planned warrior is born as when `borg.raceRandom` is off: 0 Half-Troll, 1 Dunadan, 2 High-Elf, 3 Dwarf - the bake-off shortlist, in this order everywhere; the default (2, High-Elf) is the bake-off's recommendation. Falls back to Half-Troll on a pack that lacks the named race. | No: read at each birth. |
