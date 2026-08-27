[feature] HP bar shows pending DoT damage

What: an enemy with active DoTs shows the unfinished DoT total as a
shaded/hatched segment at the end of its HP bar (like "incoming damage"
bars in RTS games), updating as ticks land.
Spec ref: SPEC-FINAL §3, §11.
Done when: applying poison shows the shaded segment sized to remaining DoT;
segment shrinks per tick; Spreading Plague transfer keeps it correct;
test covers sizing.
Priority: normal
