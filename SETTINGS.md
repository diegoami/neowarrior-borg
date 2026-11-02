# Settings reference

The Borg reads the toggles below when its controller is created; changing any
of them requires a reload before the controller uses the new value. The one
numeric setting is different: `borg.raceChoice` is read at each birth, so a
change applies to the next warrior without a reload.

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
| `borg.raceChoice` | 0 | The race the Borg's planned warrior is born as: 0 Half-Troll, 1 Dunadan, 2 High-Elf, 3 Dwarf - the bake-off shortlist, in this order everywhere. Falls back to Half-Troll on a pack that lacks the named race. | No: read at each birth. |
