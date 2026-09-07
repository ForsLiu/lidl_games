[feature] Token economy: trim context files, gate sweeps, light-tier defaults

What (main lane, one item):
1. PROGRESS.md: keep the "Current state" section plus the last 10 session
   entries; move everything older into docs/PROGRESS-ARCHIVE.md (append-
   only). Keep PROGRESS.md under 400 lines from now on; every session that
   would exceed it archives the oldest entries first.
2. BACKLOG.md and each BACKLOG-*.md: move the Done section to
   docs/BACKLOG-DONE.md (one file, sections per backlog), keeping only
   open items and the last 10 done ids in the live files. Same 400-line
   cap.
3. QUESTIONS.md: move entries with an owner verdict older than 14 days
   into docs/QUESTIONS-ARCHIVE.md; keep pending + recent in the live file.
4. CLAUDE.md: add rules - "Never run tools/sweep.ts, handoff-metrics or
   gate matrices unless the item is [balance] or a gate re-measurement is
   its acceptance criterion"; "Default to light-tier verification for
   [polish], [ui], [docs] and data-only items"; "Read only the live files;
   consult docs/*-ARCHIVE.md only when an item references old history."
5. tools/status.ts and any test that greps these files must read the
   archives too, so ledgers stay complete.
Done when: live files under 400 lines; archives created and linked from
the top of each live file; CLAUDE.md rules added; status ledger still
cites every feedback file; test:fast green.
Priority: top
