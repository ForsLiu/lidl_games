[feature] OWNER OVERRIDE of Q133(3): show DoT damage ticking

What: DoT damage (Bleeding, Poison, Toxic, Burning) must be visible as
floating numbers, e.g. Swordsman's bleed ticks. Perf-safe design:
aggregate per enemy per damage type once per second - one floating number
= that second's total for that type, in the type's color, smaller font
than direct hits. Under high density (>150 enemies with DoTs ⚖) show
numbers only for enemies near the cursor/character plus elites/bosses.
Settings toggle "DoT numbers" (default ON). Marker dots stay.
Spec ref: SPEC-FINAL 3, 11; supersedes Q133 call (3).
Done when: a bleeding enemy shows ticking numbers; a 300-enemy burning
horde holds 60 fps (bench check); toggle works.
Priority: normal
