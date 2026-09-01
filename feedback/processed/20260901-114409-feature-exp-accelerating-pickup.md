[feature] VS EXP gems accelerate toward the character until they catch up

What: once a gem is attracted (within pickup radius or after the wave's
auto-collect), it moves toward the character with continuously increasing
speed (e.g. +40% per 0.25 s, no cap) so it always catches a moving
character. Gems outside pickup radius still wait as today.
Spec ref: SPEC-FINAL 2 (pickup) - amend.
Done when: a gem attracted behind a character moving at max speed
reaches it within 2 s (test); no gems orbit forever.
Priority: normal
