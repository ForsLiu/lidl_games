[feature] Class selection: tall sprites in a row; hide all but 3 classes

What: redesign class select as a horizontal row of vertically-long class
sprites (full-body art placeholder is fine: tall colored silhouette with
weapon shape). Selecting one fills a long panel at the bottom with basic
stats (bands + numbers); hovering the passive / tower passive / Active1 /
Active2 entries shows their written descriptions with numbers.
Roster: show ONLY Swordsman, Plaguebringer, Time Lord. The other 9
classes are hidden from the selection UI (not deleted): they stay in
/data, remain dev-profile-selectable behind a "show hidden classes"
dev toggle, and sim gates keep measuring all 12.
Spec ref: SPEC-FINAL 4, 11 - UI redesign + roster visibility rule.
Done when: new screen matches the layout; only 3 classes visible in a
normal profile; dev toggle reveals the rest; gates unchanged.
Priority: normal
