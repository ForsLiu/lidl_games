[feature] Class equipment sets: Plaguebringer + Time Lord (6 each), Swordsman completed (+3)

What: add these to data/equipment.json and the loot table. Rules: every
item works alone; items of a set have synergy; every class-specific line
has an "if not <class>" basic-stat compensation. Stats on the owner's
existing scale; all numbers ⚖.
Format: Item | slot | HP | Atk | Def | AtkSpd | Move | Effect

PLAGUEBRINGER SET
Plague Flask | weapon | 0 | 4 | 0 | x1.1 | x1 | basic attacks apply
  Poison (120% over 3 s) on every hit; if not Plaguebringer: atk speed
  x1.15
Miasma Robe | armor | 6 | 0 | 4 | x1 | x1 | Poison Barrel's cloud drifts
  toward the character (1 tile/s) and Poison Boost also refreshes all
  poison durations; if not Plaguebringer: HP x1.1
Carrier's Boots | shoes | 3 | 0 | 3 | x1 | x1.4 | dashing leaves a poison
  trail (0.5x basic dmg/s for 3 s); if not Plaguebringer: move x1.15
Ring of Contagion | ring | 0 | 2 | 0 | x1 | x1 | Spreading Plague jumps to
  the 3 nearest enemies instead of 1; if not Plaguebringer: +1 life regen
Pestilent Locket | necklace | 2 | 0 | 2 | x1 | x1 | Poison Boost doubles
  ALL DoTs (Poison, Toxic, Bleeding, Burning), cooldown +2 s; if not
  Plaguebringer: EXP +15%
Blightweaver Band | bracelet | 0 | 1 | 1 | x1 | x1 | poisoned enemies also
  tick 50% of their poison onto enemies touching them; if not
  Plaguebringer: area +10%
Synergy chain: Flask applies -> Band spreads by contact -> Ring spreads on
death -> Locket boosts everything -> Robe keeps the cloud on her -> Boots
trail while repositioning.

TIME LORD SET
Hourglass Scepter | weapon | 0 | 5 | 0 | x1 | x1 | activates Time Flow's
  dormant clause: all DoT damage from the character ticks 100% faster
  (same total, half duration); if not Time Lord: atk +3
Chronomail | armor | 8 | 0 | 6 | x1 | x1 | Time Flow converts incoming
  damage over 8 s instead of 4 s; at <=30% HP, over 12 s; if not Time
  Lord: def +5
Sandals of the Second Hand | shoes | 3 | 0 | 2 | x1 | x1.3 | Time's
  rewind moves enemies to their position of 6 s ago instead of 3 s; if
  not Time Lord: move x1.1
Loop Ring | ring | 0 | 2 | 1 | x1 | x1 | Time has 4 charges and recharges
  25% faster; if not Time Lord: +1 life regen
Pendulum Pendant | necklace | 2 | 0 | 2 | x1 | x1 | executing a "future"
  enemy refunds 1 Time charge; elites/bosses lose 60% instead of 50%; if
  not Time Lord: EXP +15%
Bracer of Overlap | bracelet | 0 | 1 | 1 | x1 | x1 | Time Lock can hold 2
  zones at once; casting a third teleports and detonates BOTH; if not
  Time Lord: area +10%
Synergy chain: Scepter (fast DoT) + Pendant (refunds) + Loop Ring (more
charges) = mark-cycling engine; Bracer + Sandals = zone control;
Chronomail = the survivability that lets her stand in the middle.

SWORDSMAN SET COMPLETION
Ring of a Thousand Cuts | ring | 0 | 2 | 1 | x1 | x1 | Thousand Cuts
  applies 2 Bleeding per attack; if not Swordsman: +1 life regen
Duelist's Pendant | necklace | 3 | 2 | 0 | x1 | x1 | a Dash Slash cast
  during a charged Circle Slash refunds 50% of the charge (chain a second
  slash); if not Swordsman: EXP +15%
Bracer of the Whirlwind | bracelet | 0 | 1 | 2 | x1 | x1 | Circle Slash
  radius +25% and knockback +50%; if not Swordsman: area +10%
Synergy: Sleeve Sword + Duelist's Pendant + Swordsman Armor = spin
engine; Bracer + Swordsman Shoes = control build.

Spec ref: SPEC-FINAL 7 - append rows; 8.1 loot table.
Done when: all 15 items load, drop, equip; every effect line has a unit
test (including each set's headline synergy and one "if not class"
fallback per set); tooltips show sentence-form descriptions with live
numbers; Codex lists them.
Priority: top
