[feature] Character can pass over Core and towers

What: the character (and dash) ignores collision with the Core and all
friendly structures — walks/flies over them freely. Enemies keep current
pathing rules. Removes all "character boxed in by own base" states
(supersedes the nudge fix in bug-build-on-character if that is not yet
done; placement on own tile then becomes legal).
Spec ref: SPEC-FINAL §10 — amend character movement.
Done when: character crosses a sealed base freely in both phases; enemies
unaffected; test covers movement over structures.
Priority: normal
