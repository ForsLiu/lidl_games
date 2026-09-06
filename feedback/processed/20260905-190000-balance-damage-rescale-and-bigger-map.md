[balance] OWNER ORDER: rescale all damage to single/double digits; bigger map

What: current tower/character damage numbers are too high to read. Two
coordinated changes:
1. Global rescale so typical early hits are single digits and mid/late
   hits double digits: divide all damage sources AND all enemy/structure
   HP by the same factor (start at /10, tune) so relative balance is
   preserved; keep DoT and armor formulas consistent (armor is percent,
   unaffected; flat effects like "1 dmg/s Bleeding" re-anchored to the
   new scale as data). BALANCE.md anchor table and TTK bands re-expressed
   in the new scale.
2. Map size up to widen engagements: default grid 36x20 -> 56x32 ⚖
   (terrain generator constraints scale with it), camera follows the
   character with zoom limits; Core placement legality unchanged.
Done when: Training Grounds shows single/double-digit numbers on typical
hits; all balance gates re-measured and recorded (should be unchanged
within noise because the rescale is proportional); map renders/paths at
the new size; determinism holds.
Priority: top
