[feature] Tiered QA + status ledger fix

What:
1. Amend CLAUDE.md's subagent protocol: items typed [polish], [ui],
   [docs], or data-only changes get LIGHT verification (targeted tests +
   npm run test:fast + code-reviewer); items touching /src/sim, /data
   balance values, pathing, or damage rules keep FULL verification
   (reviewer + qa-playtester). Bugs always get the failing regression
   test first.
2. tools/status.ts: the feedback ledger must also scan BACKLOG-CONTENT.md,
   BACKLOG-TERRAIN.md, BACKLOG-UI.md (and any BACKLOG-*.md) for item
   citations, so lane-routed feedback stops showing "no BACKLOG citation".
Done when: CLAUDE.md updated; next polish items show light-tier logs;
STATUS.md ledger cites lane items.
Priority: normal
