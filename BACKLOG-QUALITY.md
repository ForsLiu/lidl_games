# BACKLOG-QUALITY.md — lane: quality  (branch `lane/quality`, worktree D:\lidl_games-quality)

## Scope (hard boundary)
May create/edit ONLY: `tests/**`, `tools/**`, `bench/**`, and this file.
Read anything. Never edit `/src/**`, `/data/**`, `BACKLOG.md`, `PROGRESS.md`,
`QUESTIONS.md`. If a finding needs a src/data fix, write it as a bug report
into the Log below (it becomes main-lane work at merge).

## Queue (QUALITY.md Alpha/Beta bars + gate G17)


> **Completed work has moved.** Done items and fully-closed historical
> sections now live in `docs/BACKLOG-DONE.md` (append-only, one section per
> backlog file, in original order). Read it when an item references old
> history; day-to-day work only needs the open items below plus the last 10
> completions. `tools/status.ts`'s feedback ledger reads the archive too, so
> nothing drops off STATUS.md's ledger.

- [x] (fb182) [polish] **DONE 2026-09-22.** token economy (fb178, main lane):
      this file was well past the 400-line budget fb178 set for live backlog
      files (5720 lines). Moved every `[x]` item from the Queue (`q2`, `q3`,
      `q7`-`q54`, 50 items), the eight `*Generated ...*` session-audit notes,
      the stale 2026-08-28 "Merged into master" note, and the entire `## Log`
      section (53 dated write-ups, 2026-08-26 through 2026-09-07: 52 numbered
      sessions plus the one `fb172` entry) verbatim, in original order, to
      `docs/BACKLOG-DONE.md` under a new `## BACKLOG-QUALITY.md` heading — the
      same treatment fb178 itself gave `BACKLOG.md` and fb180/fb181 gave
      `BACKLOG-CONTENT.md`/`BACKLOG-UI.md`. Kept live, full text unchanged:
      the `## Scope` section; the four still-blocked owner items (`q1`, `q4`,
      `q5`, `q6`, each Scope-blocked on a `package.json` edit); the three
      still-open items (`q55`, `q56`, `q57`); this item's own closure. Added
      a new `### Recently completed` list of the last 10 done ids
      (`q45`-`q54`) as one-liners.
      `tools/status.ts`'s `backlogPaths()` already reads
      `docs/BACKLOG-DONE.md` (fb178), so every feedback-ledger citation for
      an id now living in the archive still resolves — verified via
      `npx vitest run tests/fb038-status.test.ts` (green).
      **Also found and fixed, code-reviewer REQUEST-CHANGES on the first
      pass:** archiving `q2`/`q12` broke `tests/q10-gate-audit.test.ts` —
      `tools/gate-audit.ts`'s `staleHoleRefs`/`backlogCheckboxes` read
      `BACKLOG_PATH` directly and expected old done ids to stay `[x]` there
      forever (the exact gap class `tools/status.ts`'s `backlogPaths()`
      already solved for the feedback ledger at fb178, not carried over
      here). Fixed by adding `BACKLOG_DONE_PATH` and a new
      `extractArchiveSection()` helper so `staleHoleRefs`'s default read
      includes this lane's own archived section — and *only* that section:
      code review's first fix naively concatenated the whole 28,000-line
      `docs/BACKLOG-DONE.md`, which carries the main `BACKLOG.md` archive's
      own bare `q91`/`q102` owner-verdict ids that collide with this lane's
      `qNN` namespace (confirmed live at the time, `docs/BACKLOG-DONE.md`
      lines ~10898/10945) — a future `KNOWN_HOLES` note citing either could
      have read as "this lane's q91/q102 shipped" by pure numbering
      coincidence. `extractArchiveSection` slices out only the text between
      this file's own `## BACKLOG-QUALITY.md` heading and the next `## `
      heading (or EOF), the same section-scoping every other archive
      consumer needs and now gets. `tests/q10-gate-audit.test.ts` updated to
      check archived ids (`q2`, `q12`) against `BACKLOG_DONE_PATH` instead of
      the live file. code-reviewer's two Minor findings (a miscounted item
      total in this note, and the q48 one-liner overstating what was
      actually applied) are also fixed in this text and in the "Recently
      completed" list below. File goes from 5720 to well under 400 live
      lines. No `/src` or `/data` change; `npm run test:fast` green (4551
      passed / 35 pre-existing skips, no new) — refs:
      feedback/feature-token-economy.md, BACKLOG.md fb178,
      BACKLOG-CONTENT.md fb180, BACKLOG-UI.md fb181.

- [ ] (q1) **BLOCKED — out of Scope** [feat] Soak harness: 50 seeded full runs
      headless, assert zero uncaught exceptions and zero NaN in any report
      field — acceptance: `npm run soak` exists and passes; wired into npm
      test as a tagged slow suite — blocker: the `soak` script entry is a
      `package.json` edit, which Scope forbids (see Log, 2026-08-26)
- [ ] (q4) **BLOCKED — out of Scope** [feat] Perf benchmark for G17:
      per-simulated-minute sim budget, host-normalized (report ratio vs a
      calibration loop), plus the 350-enemy worst-case tick — acceptance:
      `npm run bench` prints the G17 numbers and the suite asserts the ratio —
      blocker: the `bench` script entry is a `package.json` edit
- [ ] (q5) **BLOCKED — out of Scope** [feat] Telemetry: every run (human or
      bot) appends its end report JSON to /telemetry — acceptance: dev-run
      writes a file; sweep tool can ingest the folder — blocker: "every run"
      means the write sits in the run/meta path under `/src`
- [ ] (q6) **BLOCKED — out of Scope** [feat] Mutation smoke: script that
      re-runs the 20 mutations QA has used so far and asserts each is caught —
      acceptance: `npm run mutations` green — blocker: the `mutations` script
      entry is a `package.json` edit

- [ ] (q55) [bug][feat] Re-measure this lane's own `it.skip`'d bug-pin
      regression tests before inheriting them another session, per CLAUDE.md's
      measurement rule ("a deferral is a measurement with an expiry date...
      two of m20a's five were already green") — this lane has accumulated at
      least 15 across `tests/q7-data-fuzz.test.ts` (E1-E7),
      `tests/q18-content-hash-replay.test.ts`, `tests/q21-weapon-boundary-
      fuzz.test.ts`, and `tests/q3-save-fuzz.test.ts` (D1-D7, D9), each pinning
      a live main-lane bug as of the session that filed it, and none has been
      re-checked against current `/src` since filing even though main-lane
      commits have landed in the interim — acceptance: each skipped case is
      temporarily un-skipped and run against current `/src`; any that now
      passes (main lane already fixed the underlying bug) is reported in this
      file's Log by name so main lane can close the corresponding item, and
      is left `it.skip`'d with an updated comment rather than silently
      deleted or left claiming a bug that no longer exists; any still red is
      re-confirmed and left as-is; the count of skips re-verified this pass is
      recorded — refs: CLAUDE.md Measurement rules, q3, q7, q18, q21
- [ ] (q56) [polish] Once q54 lands its new `unguarded-data-read` classifier
      inside `cli-crash-coverage.ts`, add a matching `tools/mutation-probe.ts`
      entry that hollows the new classifier function and asserts
      `tests/q47-cli-crash-coverage.test.ts` goes red — the same treatment
      q43 already gives the two pre-existing classifiers
      (`gate-audit-hasLiveTopLevelDescribe-hollow`,
      `command-domain-classify-hollow`), so a future regression in the new
      detection logic is caught the same way as a regression in the old —
      acceptance: one new `MUTATIONS` entry, green, and q43's own pinned
      doc-comment/array-length parity check still holds — refs: q43, q54
- [ ] (q57) [polish] `readsDataJsonDirectly()` (q54) has two undocumented
      false-negative shapes, found by qa-playtester's adversarial pass against
      synthetic scratch fixtures (never touching real `tools/`/`data`/`src`):
      an inline template-literal path with no `join()` wrapper
      (`` readFileSync(`data/${file}.json`, 'utf8') ``) and a string-
      concatenated path (`readFileSync('data/' + name + '.json', 'utf8')`)
      both return `false` even though the doc comment's stated intent
      ("does it read a `/data/*.json` file directly... followed by
      `JSON.parse`... bypassing `loadContent()` entirely") covers them. Grep
      confirms no live `tools/*.ts` file uses either shape today, so q54's
      own acceptance criteria hold and nothing is misclassified — this is a
      latent gap for a future tool author, not a regression, filed rather
      than fixed inline per qa-playtester's non-blocking severity call —
      acceptance: either the two shapes are detected (extend
      `readsDataJsonDirectly` and add the two synthetic-fixture tests QA
      already scoped, one next to the existing template-literal/const-bound
      cases in `tests/q54-unguarded-data-read.test.ts`) or, if judged not
      worth the regex complexity, both shapes are named explicitly in
      `readsDataJsonDirectly`'s "Known limitations" doc comment alongside the
      existing `let`-bound/ASI/backtick-const and non-first-arg `join()`
      gaps, so the next session finds the gap in the comment instead of
      hand-rediscovering it the way q53 itself was hand-found — refs: q54,
      session 52 QA finding

### Recently completed

- (q54) [feat] Generalized `cli-crash-coverage.ts`'s census to flag tools that
  read `/data` JSON directly, bypassing `loadContent()`.
- (q53) [bug] Fixed `m20d-price-probe.ts`'s unguarded `JSON.parse` (outside
  its only `try`) that crashed raw on invalid `/data` JSON.
- (q52) [feat] Added 11 missing `mutation-probe.ts` entries for guards/fixes
  landed since q40 that had never gotten one.
- (q51) [bug] Fixed `cli-crash-coverage.ts`'s type-import exclusion to also
  catch per-specifier `import { type Foo }` forms.
- (q50) [bug] Fixed a false positive in `cli-crash-coverage.ts`'s
  backtick-stripping that missed escaped-newline quoted strings.
- (q49) [bug][feat] Added scratch-copy test coverage for
  `m20d-price-probe.ts`'s real-`/data`-mutation restore path, including a
  nested-process-failure case.
- (q48) [feat] Checked q38's dynamic-import workaround against all ten
  q41/q46 tools; viable for three, applied to one (`probe-boss.ts`),
  the other two left viable-but-unapplied.
- (q47) [feat] Built `tools/cli-crash-coverage.ts` to automate the
  CLI-crash-coverage census q37/q41/q46 had been re-deriving by hand.
- (q46) [feat] Pinned the same uncaught-crash pattern for three more
  content-importing tools (`m20d-run-a4`, `m20d-swarm`, `probe-boss`) missed
  by q41's grep.
- (q45) [bug][feat] Ten content-importing tools crashed with an uncaught
  `ZodError` on schema-invalid `/data`; added try/catch matching q28/q38's
  shape.

Full text for these and all earlier completions: `docs/BACKLOG-DONE.md`.
