[balance] OWNER ORDER: dash is too slow - make it a fast burst scaled by move speed

What: dash speed = k x the character's CURRENT movement speed (k = 5 ⚖),
short duration (~0.18 s ⚖); distance falls out of speed x duration and
therefore scales with movement bonuses (shoes, boons). Cooldown stays
short (~1.5 s ⚖). Class dashes inherit the same speed formula with their
own durations. i-frames unchanged.
Spec ref: SPEC-FINAL 10 (dash) - amend fb025's numbers.
Done when: dash visibly outpaces normal movement ~5x; distance grows with
move-speed gear (test); replay determinism holds.
Priority: top
