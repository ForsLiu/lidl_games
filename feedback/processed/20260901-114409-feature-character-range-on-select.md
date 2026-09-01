[feature] Show character's attack range when the character is selected

What: clicking the character selects it (same selection system as
towers/enemies) and draws its basic-attack range ring, plus the panel
with its stats. In VS, the ring reflects the longest wielded range too
(secondary dashed ring).
Spec ref: SPEC-FINAL 11 (selection/indicators).
Done when: click character -> ring + panel; ring updates with range
bonuses (equipment, boons); test covers ring radius = derived range.
Priority: normal
