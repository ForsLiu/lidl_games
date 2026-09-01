[feature] Detailed effect text for class actives/passives and class equipment

What: everywhere a class active, passive, or class-specific equipment
appears (class select, character panel, bottom bar tooltips, equipment
tooltips, Codex), show the FULL effect text with live numbers - cooldown,
charges, radius/range, damage bands resolved to current values, durations,
stack rules, and each conditional line of class equipment with an
active/inert marker for the current class. Text generated from /data +
stats engine (no duplicate hand-written strings). If the earlier
info-surfacing item is still open, fold this into it as its first
deliverable.
Spec ref: SPEC-FINAL 11; extends fb004 / info-surfacing.
Done when: every class's 2 actives + passive + tower passive and every
class-specific item show full live text; test asserts displayed numbers
equal sim-derived values.
Priority: top
