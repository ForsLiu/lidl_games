[feature] Split tests into fast/slow tiers; loop verifies with the fast tier

What: the full suite now takes 40+ minutes (p6e-class-diversity alone
~3500 s), so loop iterations burn waiting. Fix:
1. Tag every slow suite (p6e-class-diversity, soak, q14 mutation-smoke,
   long fuzz/live-sim files — anything over ~60 s) and create
   `npm run test:fast` that excludes them, target under 5 minutes total.
2. Amend CLAUDE.md's loop contract: per-item verification = targeted
   tests + `npm run test:fast`. The full `npm test` (slow tier included)
   runs only at: phase (P-milestone) completion, before any lane merge,
   and before writing DONE.md.
3. Quarantine and file the two known Windows flakes as backlog items with
   repros: the q14 mutation-smoke process hang, and the q28 EPERM
   temp-file rename — they must stop polluting unrelated runs.
Spec ref: CLAUDE.md working rules / loop contract amendment.
Done when: `npm run test:fast` exists and finishes under 5 minutes;
CLAUDE.md updated; the next iterations commit without waiting on the long
suite; both flakes filed.
Priority: top
