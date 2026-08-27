[feature] Auto-select option on VS level-up

What: a toggle (settings + on the level-up screen) that auto-picks level-up
cards: prefer highest-rank owned stat boon, else first card. Manual choice
any time the toggle is off. Auto-pick choices are Commands (replay-safe).
Spec ref: SPEC-FINAL §6.3.
Done when: with toggle on, level-ups resolve without pausing for input;
replay determinism holds; test covers the pick rule.
Priority: normal
