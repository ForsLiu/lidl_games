[feature] Move auto-pick level-up toggle into the in-game options menu

What: remove the auto-pick toggle from the start/hub menu; it lives in the
in-game options (Esc) menu instead, changeable mid-run at any time, and
also as a small toggle on the level-up screen itself. Setting persists
per profile. Remains a replay-safe Command.
Spec ref: fb003 follow-up; SPEC-FINAL §6.3, §11.
Done when: toggle absent from starting menu; present and functional in
Esc options during both phases; mid-run flip changes the next level-up;
test covers it.
Priority: normal
