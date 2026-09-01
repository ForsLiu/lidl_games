[feature] Dash becomes a fast move, not a teleport; shorter and cheaper

What: replace the blink/teleport dash with a rapid movement burst: the
character physically travels the distance over a short time (collision
with structures already ignored; enemies do not block). Lower the cooldown
and distance. Starting bands (machine-tunable per BALANCE.md): distance
~2.5 tiles, duration ~0.2 s, cooldown ~1.5 s, brief i-frames kept.
Class dashes built on the base dash (Dash Slash, Quickstep, Flame Road,
Crimson Rush) inherit the movement form but keep their own distances.
Spec ref: SPEC-FINAL 10 (character: dash) - amend.
Done when: dash visibly travels (trail VFX), stops at the destination,
new numbers in /data, all class-dash tests updated, replay determinism
holds.
Priority: normal
