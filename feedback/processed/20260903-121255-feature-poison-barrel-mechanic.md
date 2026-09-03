[feature] Poison Barrel: pin the every-second poison mechanic (verify + enforce)

What: Plaguebringer's Active1 Poison Barrel must work exactly like this,
whatever the current code does:
- While the circle exists, every 1 s tick, EVERY enemy inside receives
  one Poison application seeded by the skill's `damage` (8): i.e. a DoT
  of 120% x 8 = 9.6 poison over 3 s per application, stacking per
  SPEC-FINAL 3 (cap 3, refresh shortest) - so an enemy that stays inside
  sustains ~3 live stacks until it leaves.
- The barrel deals NO direct/normal damage of its own (pure poison):
  ignores armor, no lifesteal, counts as character DoT for Spreading
  Plague and for Poison Boost doubling.
- Entering mid-duration: first application at the next 1 s tick.
  Leaving: no new applications; existing stacks run out normally.
- Compatible with the chargeable/longer-duration change already filed
  (radius x1-x2, duration 8-14 s): cadence stays 1 s regardless of charge.
- Tooltip (sentence form, live numbers): "Poisons every enemy inside the
  circle each second: each application deals 9.6 poison damage over 3 s
  (up to 3 stacks)."
Spec ref: SPEC-FINAL 4.1 (Plaguebringer), 3 (Poison).
Done when: a unit test places one enemy in the barrel for its full
duration and asserts one application per second, stack count capped at
3, total damage equal to the formula; a second test asserts no normal
damage and no lifesteal from the barrel; tooltip text test.
Priority: normal
