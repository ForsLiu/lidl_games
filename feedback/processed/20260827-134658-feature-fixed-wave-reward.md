[feature] Replace early-call money bonus with fixed per-wave reward

What: remove the "call wave early = bonus gold per un-elapsed second"
mechanic entirely (including multi-summon's per-wave bonus). Instead every
TD wave cleared pays a fixed reward = 20 + 10 x wave number (tunable).
Multi-summon (stacking up to 3 waves) stays, just without the bonus.
Spec ref: SPEC-FINAL §1.1 — supersedes the early-call bonus rule.
Done when: early call grants no gold; clearing wave N pays the formula;
gates G6 and economy tests updated; test covers it.
Priority: normal
