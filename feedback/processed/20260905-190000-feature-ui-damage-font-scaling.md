[feature] Damage number font size scales with the value

What: floating damage numbers scale with the damage dealt: font size =
base + k*log10(value) (e.g. 10 damage small, 100 medium, 1000+ large and
bold), clamped to a max; crit/execute keep their extra styling; DoT
aggregate numbers use the same rule at 80% size. Data-driven constants.
Done when: three visibly distinct sizes across 1/10/100/1000 in the
Training Grounds; test asserts monotonic size mapping and clamp.
Priority: normal
