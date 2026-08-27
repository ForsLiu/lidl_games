[feature] All Cores unlocked in dev profile

What: the dev profile (data/dev.json) also unlocks every Core from §5.5,
same pattern as classes/maps. Production default stays locked.
Spec ref: SPEC-FINAL §5.5, §11 (dev profile), gate G16.
Done when: dev build shows all Cores selectable; npm run build has them
locked; covered by the G16 test.
Priority: top
