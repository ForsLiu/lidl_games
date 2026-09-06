[feature] VS waves spawn from the TD spawn gates

What: during VS waves, enemies spawn at the same gate positions used in
TD waves (all gates active, round-robin or budget-split), not from the
screen edges. Fliers may still enter from edges [designer note: keep
fliers edge-spawning to preserve their bypass role; veto if all must use
gates]. Rift/burst events spawn at gates too. Update the director and
tests; gate paths to the character use existing pathing.
Spec ref: SPEC-FINAL 6 (VS spawns) - amend.
Done when: a VS wave headless run shows 100% ground spawns at gate tiles;
determinism holds; balance sweeps re-recorded (spawn distance changed).
Priority: top
