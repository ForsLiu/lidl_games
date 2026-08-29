[feature] Realize the equipment system per SPEC-FINAL §7 (it does not match)

What: the current build does not implement the documented equipment
system. Build it to spec now:
- Six slots: weapon, armor, shoes, ring, necklace, bracelet (one each) on
  the character.
- Load the full §7 owner table as data/equipment.json: exact stats (HP /
  Atk / Def flats, atk-speed and move multipliers) and every conditional
  effect line, including class checks with the written fallbacks
  ("if not Swordsman: ...") and the cross-item interaction (swordsman
  armor + sleeve sword changes Circle Slash scaling).
- Multipliers stack per §2 (each item = one source); flats add.
- Loot channel per §8.1: each TD wave fully cleared grants 1 random item
  from the table at run end (win or lose); duplicates allowed.
- Stash + equip UI: stash holds earned items; click-to-swap equip per
  §11; character panel (fb004) stops showing equipment as inert and
  includes item sources in stat breakdowns.
- Dev profile: stash pre-filled with every §7 item (existing T3 rule).
- Effects must be real in both phases: e.g. sleeve sword changes Circle
  Slash behavior, sniper bracelet widens tower AND character range,
  builder's necklace +1 flat tower attack rides the VS count multiplier,
  bleeding ring makes lifesteal apply to Bleeding damage.
Spec ref: SPEC-FINAL §7, §8.1, §2; gate G12 (equipment half).
Done when: all 12 items exist, equip/unequip works, every conditional
line has a unit test proving its effect (including the two-item
interaction and one "if not class" fallback), loot pays 1 item per
cleared TD wave at Results, G12's equipment clause is green.
Priority: top
