[feature] Four enemy spawn gates by default

What: maps generate with 4 spawn gates (N, S, E, W edges, jittered along
the edge) instead of 3. All existing gate rules apply (never sealed,
connectivity >= 80% of walkable, Core legality distance >= 3 from any
gate). Wave composition is split across 4 gates; path indicators show 4
colors. Tier modifiers that add gates now go to 5.
Spec ref: SPEC-FINAL 10 / terrain spec - amend gate count.
Done when: generator property tests pass at 4 gates across 1000 seeds;
waves/leak coupling/VS gate spawns all use 4; sweeps re-recorded.
Priority: normal
