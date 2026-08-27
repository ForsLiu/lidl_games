[feature] Auto-collect EXP after VS wave, convert leftovers to gold

What: when a VS wave ends, all uncollected XP gems on the field are
auto-collected; any EXP beyond the character's current level-up need is
converted to gold at 1 gold per 2 EXP (ratio tunable, log to QUESTIONS.md).
Spec ref: SPEC-FINAL §1.1 / §2 (EXP) — amend the "gems do not convert" line.
Done when: ending a VS wave with gems on the ground yields their EXP;
overflow appears as gold with a HUD toast; test covers both paths.
Priority: normal
