# BACKLOG-QUALITY.md — lane: quality  (branch `lane/quality`, worktree D:\lidl_games-quality)

## Scope (hard boundary)
May create/edit ONLY: `tests/**`, `tools/**`, `bench/**`, and this file.
Read anything. Never edit `/src/**`, `/data/**`, `BACKLOG.md`, `PROGRESS.md`,
`QUESTIONS.md`. If a finding needs a src/data fix, write it as a bug report
into the Log below (it becomes main-lane work at merge).

## Queue (QUALITY.md Alpha/Beta bars + gate G17)

- [ ] (q1) **BLOCKED — out of Scope** [feat] Soak harness: 50 seeded full runs
      headless, assert zero uncaught exceptions and zero NaN in any report
      field — acceptance: `npm run soak` exists and passes; wired into npm
      test as a tagged slow suite — blocker: the `soak` script entry is a
      `package.json` edit, which Scope forbids (see Log, 2026-08-26)
- [x] (q2) [feat] Input fuzzer: 10,000 random valid Commands per phase,
      no crash, no negative/NaN stat — acceptance: fuzz test green,
      seed-reproducible
- [x] (q3) [feat] Save fuzzer: truncated/bit-flipped/version-bumped saves
      load into the repair path, never crash — acceptance: test matrix green
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

*Generated 2026-08-26, session 2, under CLAUDE.md's generation rule scoped to
this lane: q3 was the only actionable item left. Grounded in QUALITY.md's ALPHA
save/soak lines, SPEC-FINAL §14 G17/G18, architecture rule 4, and the two
coverage gaps session 1's log recorded. All five are inside Scope as written.*

- [x] (q7) [feat] Content-data loader fuzz: mutate every `/data/*.json` in
      memory (retype, drop, negative, extreme, empty-array) and assert
      `loadContent`'s zod schemas + cross-file integrity checks reject the
      result rather than building an unpayable world — acceptance: for each
      schema-guarded field a wrong type is rejected, the census of *accepted*
      mutations is a subset of a recorded list so a new hole goes red, and no
      `/data` file is written — refs: architecture rule 4, SPEC-FINAL §12
- [x] (q8) [feat] Save round-trip equality property test — the other half of
      QUALITY ALPHA's save line, which q3 covers only for *corrupt* saves:
      generate seeded random **valid** `MetaState`s and assert
      `deserialize(serialize(m))` deep-equals `m`, and that a second pass is a
      fixed point — acceptance: 2000 seeded metas green, including metas grown
      through `applyRunResult` — refs: G18, QUALITY.md ALPHA
- [x] (q9) [feat] Phase-reachability census: `tools/phase-coverage.ts` reports
      which `Phase` values each shipped bot policy actually enters over N seeds
      — acceptance: tool prints the census and a test asserts the reached set is
      a superset of a recorded floor, so a phase that stops being reachable goes
      red; session 1's `soulpick` hole is pinned as the known gap — refs: lane
      log 2026-08-26
- [x] (q10) [feat] Gate-coverage audit: `tools/gate-audit.ts` maps SPEC-FINAL
      §14 G1–G20 to the test files that name each gate — acceptance: prints the
      table, and a test asserts every gate id parsed out of SPEC-FINAL §14 is
      either covered by a test file or listed in an explicit recorded-hole set,
      so a new gate cannot arrive uncovered and unnoticed — refs: SPEC-FINAL §14
- [x] (q11) [polish] Extract the world/report invariant scanner from
      `tools/fuzz-input.ts` into `tools/invariants.ts` and reuse it from q2, q3
      and any future soak — acceptance: q2's suite (including its anti-vacuity
      case, which moves with the scanner) passes unchanged against the extracted
      module — refs: engineer's judgment, HANDOFF §7
- [x] (q12) [feat] Soak suite, in-Scope: 50 seeded full headless runs (mixed
      policies), assert zero uncaught exceptions and zero NaN/negative-invariant
      violations in the end report, reusing q2's scanner rather than
      re-deriving it — acceptance: `tests/q12-soak.test.ts` green and part of
      `npm test` via the existing `tests/**/*.test.ts` glob, no `package.json`
      edit — this is q1's acceptance line minus the literal `npm run soak`
      alias, which stays blocked and logged separately for main to name if it
      wants the CLI entry point too — refs: QUALITY.md ALPHA soak line, G17
- [x] (q13) [feat] Host-normalized perf ratio probe for G17: `tools/perf-ratio.ts`
      times a fixed calibration loop and a worst-case 350-enemy tick in the same
      process and reports their ratio instead of a wall-clock ms bound —
      acceptance: a test asserts the ratio is stable within a tolerance across
      at least two different iteration counts (proving it isn't itself
      wall-clock-fragile the way A10 is measured to be, session 3's log), and
      asserts it against a recorded ceiling — this is q4's substance without
      the blocked `npm run bench` alias — refs: G17, session 3 log
- [x] (q14) [feat] Mutation smoke, in-Scope: `tools/mutation-probe.ts` applies
      one named source mutation at a time (drawn from the ones QA has actually
      used and reverted across q7/q8/q9's sessions), runs the one test file
      that should catch it, asserts red, restores the file, and asserts
      `git diff --exit-code` clean before moving to the next — acceptance:
      `tests/q14-mutation-smoke.test.ts` runs the full recorded list green, and
      is part of `npm test` with no `package.json` edit — this is q6's
      substance without the blocked `npm run mutations` alias — refs: q6,
      sessions 3/4/5's manual mutation passes
- [x] (q15) [feat] Command-argument domain fuzzer: q2 deliberately keeps every
      generated argument inside its field's legal domain (`tools/fuzz-input.ts`
      confirms `dev`'s `amount` is `rng.intRange(0, 5000)`) and session 1's log
      names this gap explicitly. Fuzz NaN/Infinity/negative-where-illegal
      arguments into `dev` and every other numeric Command field, confined to a
      practice-mode world so nothing is banked, and record which arguments the
      sim currently launders vs. rejects — acceptance: a pinned map (q7-style)
      of accepted-but-illegal argument shapes so a new hole goes red by name —
      refs: session 1 log, architecture rule 4
- [ ] (q16) [feat] Content-totals census against SPEC-FINAL §13:
      `tools/content-census.ts` counts each shipped content category (classes,
      towers, equipment, damage types + statuses, enemies, waves, tree nodes,
      quests, tiers, bosses) and reports the delta against §13's targets (11
      classes · 10 towers · 12+ equipment · 6 damage types + 2 statuses · 20
      enemies · 18+6 waves · 120-node tree · 8–12 quests · T1–T5 · 2 bosses) —
      `content-complete.test.ts` only checks V2-era totals (10 towers, 20
      enemies, 12 modifiers), not SPEC-FINAL's, so this is a real gap, not a
      duplicate — acceptance: prints the table and a test pins today's counts
      as a recorded snapshot, so a content change is visible and distinguishable
      from a P-phase-not-reached-yet gap rather than a silent regression —
      refs: SPEC-FINAL §13, "Definition of 1.0 complete"
- [x] (q17) [polish] `tools/gate-audit.ts`'s own G17 `KNOWN_HOLES` entry is
      stale: it still reads "no test runs a 50-seed soak... q12/q13 the
      in-Scope equivalents" though q12 (soak) and q13 (perf-ratio) both landed
      and satisfy G17's three clauses (the soak clause verbatim; the ⚖
      per-simulated-minute/350-enemy-all-weapons clause via a ratio instead of
      a literal fps number) — a deferral nobody re-measured, CLAUDE.md's own
      named trap — acceptance: G17 reclassified to `covered` citing
      `tests/q12-soak.test.ts`/`tests/q13-perf-ratio.test.ts`, the q10 pinned
      covered/hole split updated, and a new `staleHoleRefs` check (cross-
      referencing `KNOWN_HOLES` notes against BACKLOG-QUALITY.md's own
      checkboxes) so a hole citing an already-`[x]`'d lane item goes red by
      name instead of silently rotting again — refs: q10, sessions 6/8/9 logs
- [ ] (q18) [bug][feat] Architecture rule 2's content-hash replay guarantee
      ("RunConfig carries a content hash so a replay against edited /data
      fails loudly") has zero implementation and zero test coverage — grepping
      the whole repo for `contentHash`/`dataHash`/`configHash` finds no hits
      outside docs (gate-audit.ts's own G2 note already flags this: "no test
      greps for 'contentHash'") — write a regression test proving a replay run
      against in-memory-mutated `/data` content does not fail loudly today
      (no thrown error, a silent divergent or matching hash), `it.skip`'d per
      lane convention, and file it as a bug for main lane in this file's Log —
      acceptance: `tests/q18-content-hash-replay.test.ts` demonstrates the gap
      with a live repro — refs: CLAUDE.md architecture rule 2, gate-audit.ts G2
- [ ] (q19) [feat] Fast-forward bit-identity, named missing by gate-audit's G2
      note ("no test asserts a fast_forward run's end hash against the same
      run at 1x") — PROGRESS.md's M8 section claims fast-forward is "more
      fixed ticks per frame rather than a longer tick, so a fast-forwarded run
      is bit-identical to the same run at 1x" but nothing pins that invariant
      — acceptance: a test drives a seeded run through whatever the shipped
      fast-forward mechanism actually is (read the renderer/loop code first;
      if it turns out to be frame-stepping with no distinct sim entrypoint,
      the test still pins today's trivial bit-identity so a future refactor
      that adds real tick-batching can't silently break it) and asserts
      identical `endHash` across several seeds — refs: gate-audit.ts G2, M8
- [ ] (q20) [feat] Mutation-probe list expansion: `tools/mutation-probe.ts`'s
      `MUTATIONS` array has 6 entries, all sourced from sessions 4/5 (q8/q9);
      sessions 8/9/11 each hand-verified further mutations that killed real
      tests (soak's `POISONER` `gold=NaN` case, perf-ratio's sequential-vs-
      interleaved timing regression, gate-audit's `entirelyRetiredCoverage`/
      `hasLiveTopLevelDescribe` hollowing, command-domain-fuzz's `classify()`/
      `digest()` hollowing) and none of them are in the automated list —
      acceptance: `MUTATIONS` grows to at least 10 entries, each `source`
      naming the session log it came from the way the existing six do, and
      `tests/q14-mutation-smoke.test.ts` runs the expanded list green — refs:
      q14, sessions 8/9/11 logs
- [ ] (q21) [feat] Soul-weapon boundary fuzz for P5's two remaining pricing
      items — fuzz `data/weapons.json`'s 6-level tracks at their boundaries
      (level 0/1/6 transitions, the Awakening gate at Lv6 + boon rank 3,
      inheritance when a build has fewer distinct souls than weapon slots)
      confined to headless runs, recording which boundary the current system
      handles correctly vs. not, pinned q7/q15-style so a regression at any
      boundary goes red by name — acceptance: a pinned map in
      `tests/q21-weapon-boundary-fuzz.ts`, exercised green by
      `tests/q21-weapon-boundary-fuzz.test.ts` — refs: PROGRESS.md P5 audit
      line, M2 soul-weapons section

*Generated 2026-08-27, session 12, under CLAUDE.md's generation rule scoped to
this lane: only q16 was actionable (fewer than 3) — q1/q4/q5/q6 remain
Scope-blocked, unchanged. (a) Ran `tools/sweep.ts --seeds 12
--policies maxbuild,hybrid` (0% win, medSurv ~120 either policy — matches
PROGRESS.md's already-documented bimodal-Act-II state, nothing new) and
`npx tsx tools/gate-audit.ts`, which is this lane's own G1–G20 diff tool from
q10 — running it surfaced q17 directly: G17's hole note names q12/q13 as its
own fix and both are checked done, so the note itself was the finding rather
than needing a fresh audit pass. (b) SPEC-FINAL coverage diff: q16 already
covers the content-totals gap; gate-audit's other eleven holes all trace to a
P-phase genuinely not built yet (P2/P3/P6/P7/P9), not to a lane testing gap —
matches session 6's finding that most remaining holes are infrastructure, not
missing tests. (c) Two engineer's-judgment items grounded in gate-audit's own
G2 note, which names two concrete untested claims (content-hash replay,
fast-forward bit-identity) rather than a vague gap: q18, q19. Plus q20
(automate mutations three more sessions have hand-verified since q14 shipped)
and q21 (the one remaining un-fuzzed built system — soul-weapon boundaries).
Took q17, the top item, since it was the concrete finding from step (a) and
the smallest, most self-contained fix.*

*Generated 2026-08-26, session 6, under CLAUDE.md's generation rule scoped to
this lane: only q10 and q11 were actionable (fewer than 3). (a) Ran
`tools/sweep.ts --seeds 12` and `tools/handoff-metrics.ts`; nothing in their
output is new lane work — the 0% win rate at 12 seeds matches PROGRESS.md's
already-documented bimodal Act II / VS-not-yet-built state, not a fresh
finding. (b) Diffed SPEC-FINAL §14 against test files by grepping for G-number
mentions: most gates (G4–G6, G9–G11, G14–G17, G20) are covered only by
V2-vintage test files that never cite a G-number — exactly what q10 exists to
formalize, so this generation pass adds substance-level gaps instead of
duplicating q10's own audit. (c) One engineer's-judgment item: q16, since
`content-complete.test.ts` demonstrably checks the wrong spec's totals. q12–q14
are the unblocked, in-Scope equivalents of q1/q4/q6 (same acceptance, minus the
literal `package.json` alias); q1/q4/q6 stay open and blocked for main to
resolve if it wants the CLI entry points too. All five are inside Scope as
written; none needs a `package.json` edit.*

## Log

### 2026-08-27 — session 12

**Feedback inbox:** `feedback/` does not exist in this worktree (checked with
`ls`). Nothing to process, nothing moved.

**q17's implementation was found already sitting in the worktree, uncommitted,
at session start** — the same shape sessions 7/9/10 have each hit before (a
prior session did the work and the generation-rule note at the top of the
queue, but stopped before code review/QA/commit). Verified rather than
trusted, per this file's own standing lesson: `tools/gate-audit.ts` and
`tests/q10-gate-audit.test.ts` both had real, uncommitted diffs implementing
q17 exactly as the queue's session-12 generation note describes (G17 moved
`KNOWN_HOLES` → `GATE_COVERAGE`, `staleHoleRefs`/`backlogCheckboxes` added, 4
new tests). Five actionable items remained after it (q18–q21 plus q17 itself),
so the generation rule did not need to run.

**q17 done.** `tools/gate-audit.ts` (G17 reclassified + `staleHoleRefs`/
`backlogCheckboxes`) and `tests/q10-gate-audit.test.ts` (19 tests, up from 14).

**Review (code-reviewer, REQUEST-CHANGES, 2 Major, both fixed here).** (1) The
inherited G17 note claimed the gate fully `covered` with no hedge, but
SPEC-FINAL §16 explicitly assigns "re-baseline perf as G17's per-sim-minute
budget" to **P10** — the repo is nowhere near P10, so the gate's first clause
(the actual chosen host-independent per-simulated-minute number) cannot be
tested yet; only clauses two (a10's fps floor) and three (q12's soak) are
solidly live. This is the exact "covered but actually not" shape session 6's
QA caught G1/G19 doing, one layer subtler: not zero live assertions, but the
spec's own build order saying the number itself isn't chosen yet. Fixed by
rewriting the note to disclose the P10-deferred remainder explicitly — same
bar as G13's existing note for a comparably partial gate — instead of
declaring the clause done. `tests/q13-perf-ratio.test.ts` is now described as
supplying the *measurement mechanism* the eventual re-baseline will need, not
the finished budget. (2) `staleHoleRefs`'s citation regex (`\bq(\d+)\b`) had
no way to tell "cites qNN as the unlanded fix" from "cites a `qNN-*.test.ts`
filename" — and this lane's own test files are named exactly that way, all
already `[x]`-checked, so a future, entirely legitimate note citing one by
name (this file's own established style — see G12's `c7-no-orbs.test.ts`)
would have tripped the tripwire and flipped the CLI's exit code for no real
staleness. Fixed by excluding a `qNN` immediately followed by a hyphen
(`\bq(\d+)\b(?!-)`), with a new regression test covering both the excluded
filename form and the still-caught bare form side by side. Independently
re-derived both findings by reading SPEC-FINAL.md §14/§16 directly and by
constructing the filename-collision case by hand before trusting review's
read of it.

**QA (qa-playtester, PASS, no bugs found).** Ran the 19-test file standalone
(genuine execution, not vacuous). Mutation-tested `staleHoleRefs` end to end:
reintroduced a bare stale citation into `KNOWN_HOLES`, confirmed the CLI
prints the STALE section and exits 1 and the tripwire test itself goes red,
reverted via a pre-mutation backup, confirmed byte-identical restoration.
Mutation-tested the filename-exclusion fix specifically: a `qNN-*.test.ts`
citation is not flagged, a bare `qNN` citation still is, a note containing
both is still flagged once, and boundary cases (`q1` vs `q12` vs `q120` vs
`q123abc`, trailing punctuation) all resolve correctly with no substring
bleed-through. Cross-checked the shipped G17 note's claims against the actual
bodies of `a10-performance.test.ts`, `q12-soak.test.ts` and
`q13-perf-ratio.test.ts` directly against SPEC-FINAL.md's own G17 row and P10
paragraph — neither overclaiming nor underclaiming. Confirmed Scope
(`git diff --stat` restricted outside `tests/**`/`tools/**`/`BACKLOG-QUALITY.md`
is empty) and that the working tree held exactly the three intended files
after mutation testing.

**Suite state.** `npx vitest run tests/q10-gate-audit.test.ts` — 19/19 green.
A full `npx vitest run` taken *before* this commit correctly failed one test
(`tests/q14-mutation-smoke.test.ts`'s "fixture must start clean" assertion) —
an artifact of the working tree carrying real uncommitted diffs at measurement
time, not a defect in this change; that test asserts a precondition on `git
diff` being empty and will read clean again once this lands. `npx tsc --noEmit
-p .` clean throughout.

**Four actionable items remain** (q18–q21, all unchecked and unblocked), so
the generation rule does not need to run next session either.

### 2026-08-27 — session 11

**Feedback inbox:** `feedback/` does not exist in this worktree (checked with
`ls`). Nothing to process, nothing moved.

**Two actionable items were in queue** (q15, q16, both unchecked and
unblocked), so the generation rule did not run. Took q15, the top item.

**q15 done.** `tools/fuzz-command-domain.ts` (harness + CLI),
`tools/fuzz-command-domain-worker.ts` (worker entry point),
`tests/q15-command-domain-fuzz.test.ts` (20 tests, ~15s) and
`tests/q15-command-domain-holes.ts` (the pinned recorded map).

**What it does.** q2's `randomCommand` deliberately keeps every generated
argument inside its legal domain; this fires 5 families of illegal values
(`nan`, `posInf`, `negInf`, `negative`, `fractional`) at every numeric
`Command` field except `equip.relic` (already a filed bug — `applyCommand`'s
switch has no `'equip'` case at all) and `souls.keys` (not numeric): 12
fields x 5 families = 60 combinations. Two oracles, because "illegal" means
different things for different fields — **Category A** (`build.tower`/`tx`/
`ty`, `upgrade.tx`/`ty`, `sell.tx`/`ty`, `pick.index`,
`rekindle.structureId`) is an identifier/coordinate that must resolve to a
real thing or the whole command is defined to be a no-op, so *any* observable
world-state change after firing an illegal value is itself the finding — a
cheap JSON `digest()` before/after is the oracle. **Category B** (`dev`'s
`gold`/`xp`/`fast_forward` amounts) is a magnitude for an operation that is
*supposed* to change state, so `digest()` alone would flag correct behaviour;
q11's `scanWorld` (non-finite/negative detection) is the oracle there instead.
Every combination — even the ~90% that resolve in milliseconds — runs inside
its own `worker_threads.Worker` (loaded via `tsx/esm`) with a 4s timeout, not
as defensive theatre: `dev` op `xp` given `amount: Infinity` in `act2` is a
**genuine infinite loop** (`addXp` in `src/sim/progression.ts` does `w.xp +=
amount * xpMul; while (w.xp >= xpToReach(w.level+1)) { ...; w.level++ }`,
which never terminates once `w.xp` is `Infinity`), and a same-thread timer
cannot interrupt a synchronous loop running in the thread that owns it.
`Worker#terminate()` was hand-verified (a throwaway script, before writing
any real code) to forcibly kill a worker stuck in exactly this kind of
busy-loop. A separate `runAliasProbe('upgrade'|'sell')` — its own probe
shape, not a sixth family, since it moves two fields together — proves
`Grid.idx(tx,ty) = ty*GRID_W+tx` is never bounds-checked by
`World.structureAt` before indexing, so `illegalTx = realTx + GRID_W,
illegalTy = realTy - 1` aliases onto a real structure one row up; both
`upgrade` and `sell` mutate that real structure via a `tx` that is
unambiguously off the 36x20 grid.

**Findings — 7 of 60 combinations plus both alias targets are not cleanly
rejected, pinned in `tests/q15-command-domain-holes.ts`.** Bug reports for
the main lane (this lane may not edit `/src`):

1. **BUG (session 1 already found the NaN half; this adds +Infinity and the
   hang) — three `dev` ops turn a non-finite `amount` into permanent
   non-finite run state, and one of them hangs instead.**
   `src/sim/run.ts` — `gold` (`:213`) and `fast_forward` (`:246`) both guard
   with `Math.max(0, ...)`, which is `NaN` given `NaN` and `Infinity` given
   `Infinity`; `xp` (`:220`) forwards straight into `addXp` with no guard at
   all. Measured: `gold`/`goldEarned` and `act2Time` go permanently `NaN` on
   `amount: NaN` and permanently `Infinity` on `amount: Infinity`; `xp` goes
   permanently `NaN` on `amount: NaN` but **hangs the process** on `amount:
   Infinity` (see above). `negative`/`fractional` are both handled correctly
   (clamped to 0, or legally rounded/accepted) and are not holes. Severity is
   limited the same way session 1 noted — only a practice run can reach
   `applyDevCommand`, and a practice run banks nothing — but a hang is a worse
   failure mode than a corrupted stat regardless of what it can bank.
2. **BUG — an out-of-grid `tx` aliases onto a real tile one row up, and both
   `upgrade` and `sell` will act on whatever real structure sits there.**
   `Grid.idx` (`src/sim/grid.ts`) is never bounds-checked before
   `World.structureAt` (`src/sim/world.ts:377-381`) indexes `grid.occ` with
   it, unlike `Grid.buildable`, which checks `inBounds` first — so `build` is
   safe from this and `upgrade`/`sell` are not. Confirmed both directions
   with a real structure and a coordinate pair that is unambiguously off the
   36x20 grid (`illegalTx >= 36`); zero `scanWorld` problems either time
   because the resulting state looks entirely legal — a normal tier-up or a
   normal sell refund, just applied to the wrong tile. This is a distinct,
   more severe bug than #1: it is not confined to a practice-mode dev tool,
   and nothing about it requires an illegal argument to be sent on purpose —
   any tx/ty computed slightly wrong upstream (a bad client, a bad replay
   patch) would silently hit a neighboring tower instead of failing loudly.
3. **BUG — a fractional tile coordinate can still build, and stores the raw
   fraction.** `build.ty: fractional` is the one Category A hole:
   `GRID_W` (36) is even, so `ty = <legal> + 0.5` still multiplies out to an
   integer flat index (`ty * GRID_W` cancels the `.5`), landing on a real,
   different, usually-open tile. `buildTower` (`src/sim/towers.ts:93`)
   stores the *unrounded* `ty` into the new `Structure`, which q11's
   `scanWorld` already flags (`structure#N.ty=1.5 is off-grid`) — this is
   the one hole the harness's Category A oracle and the pre-existing invariant
   scanner both independently catch. `build.tx` does not share this hole
   (the arithmetic doesn't cancel the same way for an added, not multiplied,
   term).

**Review (code-reviewer, APPROVE, 1 Minor, fixed here).** Independently
re-derived both non-obvious findings by hand (the `build.ty` even-`GRID_W`
arithmetic, and the alias probe's index identity), confirmed `palisade`
(`towers.towers[0]`) really has `upgrades.count: 0` in `/data` (which is why
`firstUpgradableTowerId` exists — the generic `upgrade.tx`/`upgrade.ty` sweep
doesn't need it, only the dedicated two-field alias probe does, since none of
the five single-field families happen to alias onto the same built tile),
and confirmed `equip`'s dead case via direct inspection of `applyCommand`'s
switch. Minor: `probeInWorker`'s and `aliasProbeInWorker`'s `worker.on('error',
...)` handlers rejected without calling `worker.terminate()`, unlike the
message and timeout branches — fixed for consistency (an uncaught exception
already tears the worker down on its own, so this was asymmetry, not a leak).

**QA (qa-playtester, PASS).** Reproduced the pinned census twice independently
and ran the 20-test file twice, all green. Mutation-tested for real: hollowing
`classify()` to always return `'rejected'` correctly turned 5 tests red;
hollowing `digest()` to a constant string only broke the 2 dedicated alias
tests, not the main pinned-census test — a real but dormant gap, recorded
below, not filed, since no currently-recorded Category A hole actually
depends on `digest()` rather than `scanWorld` to be caught. Verified
`Worker#terminate()` is load-bearing (not defensive) with a disposable fast
busy-loop script (never the real `xp`/`Infinity` path) — with `terminate()`
removed, the harness process never exits on its own and had to be
force-killed. Confirmed `worker_threads` + `tsx/esm` works nested inside a
real broader vitest run (56 tests spanning q2/q12/q14/q15, ~236s, all green),
not just standalone. Confirmed no stray processes or scratch files were left
behind. Two minor, non-blocking gaps recorded rather than filed, same bar
prior sessions have used for a dormant-but-real gap nothing currently
exercises:
  - `digest()`'s Category A coverage is currently redundant with `scanWorld`
    for every recorded hole; a future Category A hole that `scanWorld` can't
    see would depend on `digest()` alone, and nothing today unit-tests
    `digest()` directly. Whoever next extends `FIELD_SPECS` should add a
    direct `digest()` unit test rather than trusting a live hole to exist
    first.
  - The CLI's `describeOutcome()` prints "no observable effect" for
    `dev.fast_forward.amount:fractional` even though `act2Time` visibly
    changes (100.5), because `digest()` doesn't track `act2Time` — the
    **verdict** (`rejected`) is correct either way (Category B only cares
    about `scanWorld`), only the human-readable detail string is misleading
    for that one line.

**Suite state at this commit.** `npx vitest run` — **809 passed / 78 skipped,
exit 0** (up from session 10's 789 + q15's 20 = 809, matching exactly), ~269s.
`npx tsc --noEmit -p .` clean.

**One actionable item remains** (q16, unchecked and unblocked), so the
generation rule will need to run next session to bring the queue back above
three.

### 2026-08-26 — session 10

**Feedback inbox:** `feedback/` does not exist in this worktree (checked with
`ls`, also checked for `feedback/processed/`). Nothing to process, nothing
moved.

**Three actionable items were in queue** (q14–q16, all unchecked and
unblocked), so the generation rule did not run. Found `tools/mutation-probe.ts`
and `tests/q14-mutation-smoke.test.ts` already sitting complete and untracked
at session start, with no matching Log entry — the same shape sessions
3/4/7/9 have all hit before (an earlier session wrote and validated the work
and stopped before writing up or committing). Verified rather than trusted.

**q14 done.** `tools/mutation-probe.ts` (harness + CLI) and
`tests/q14-mutation-smoke.test.ts` (13 tests, ~4 min — it spawns nested
`npx vitest run` child processes per mutation, real wall-clock cost the file's
own comments disclose up front).

**What it does.** Automates the mutation testing qa-playtester has done by
hand across q8/q9: six mutations, each drawn verbatim from those sessions'
logs (three in `src/meta/meta.ts` against `tests/q8-save-roundtrip.test.ts`,
three spanning `src/sim/run.ts`/`src/bots/policies.ts` against
`tests/q9-phase-coverage.test.ts`), each applied to a throwaway scratch copy
of src/tests/tools/data under `bench/.tmp/q14-mutation-scratch/` — never the
real files, because `npm test`'s worker-thread parallelism would turn an
in-place mutation of a shared import into a flake generator for the whole
suite, not just this file. `bench/` rather than `tools/` for the scratch root
specifically because `tests/c7-no-orbs.test.ts` recursively walks
`src/`/`data/`/`tools/` for leftover Orb vocabulary and a scratch copy of
`tests/q3-save-fuzz.test.ts` sitting under `tools/` trips it for real (this
was found by actually running the full suite, not reasoned out in advance). A
control run (no mutation) proves the harness itself isn't broken before any
mutation's "red" is trusted, and `gitDiffClean()` (whole-repo `git diff`, not
file-scoped — the file-scoped form has a real blind spot: a bug that corrupts
some *other* real file would pass it) confirms the real source was never
touched.

**Found and fixed before commit — the interesting part.** code-reviewer
(CHANGES NEEDED, one Major) caught that `git diff` cannot see a brand-new
*untracked* file landing in the real tree — only edits to files git already
tracks — which is exactly the shape a `scratchPath`/`populateScratch`
computation bug going wrong could produce. First fix attempt made
`gitDiffClean()` also require `git ls-files --others --exclude-standard` to
be empty repo-wide, and it immediately broke in real use: this very item's
own two new files are themselves untracked until this commit, so the check
failed against the code it was meant to protect, and would also spuriously
fail on any unrelated WIP file anyone happened to have lying around. Reworked
to a baseline-diff design instead — `snapshotUntracked()` captures the
untracked-file set at a point in time, `hasNewUntrackedFiles(baseline)` flags
only a path that's new since that snapshot — so `probeOne` snapshots
immediately before mutating and compares after, tolerating however many
pre-existing untracked files surround it while still catching a genuinely new
stray one. Both halves (`gitDiffClean()` for tracked-file edits,
`hasNewUntrackedFiles()` for new untracked files) were confirmed independently
load-bearing by QA (below), each catching a version of the bug the other
misses.

**QA (qa-playtester, PASS, one Low/Minor gap recorded not filed).** Verified
the six mutations' anchors still match current real source by script, not by
eye; ran the full file twice standalone (13/13 both times) and once inside a
genuine unfiltered full suite run (789 passed / 78 skipped, exit 0, this
file's 13 included as file #49 of 56 with no cross-file interference,
`tests/c7-no-orbs.test.ts` confirmed still green). Hostile-tested the
isolation mechanism for real: injected a bug that corrupts a real tracked
file mid-probe (`gitDiffClean()` alone catches it), then a separate bug that
writes a brand-new untracked file into the real `tools/` (`gitDiffClean()`
alone misses it — reproduced the exact false positive code review found —
`hasNewUntrackedFiles()` catches it), confirming both checks are each
necessary and neither alone is sufficient. Hollowed `probeControl` to a
stubbed always-green result and confirmed the test file's own anti-vacuity
assertion on stdout content catches it. One gap found and recorded rather
than filed as a new item, same bar sessions 8/9 have used for a
QA-found gap that's real but unreachable by anything shipped: the
baseline-diff design is direction-only — it catches a new untracked file
*appearing* but not a pre-existing one *disappearing* (relevant because
`populateScratch` opens with a recursive `removeDir`), and none of the six
recorded `MUTATIONS` exercises `scratchPath`/`populateScratch` so it doesn't
affect what q14 actually probes today. Fixed here anyway, cheaply: the
`ProbeResult.realFileUntouched` doc comment now states the asymmetry
explicitly instead of overclaiming full working-tree coverage, so a future
reader extending this file's public surface doesn't over-trust the guarantee
the field name implies.

**Suite state at this commit.** `npx vitest run` — **789 passed / 78 skipped,
exit 0** (confirmed independently by QA), q14's 13 tests included (up from
session 9's 776 + 13 = 789, matching exactly). `npx tsc --noEmit -p .` clean.

**Two actionable items remain** (q15, q16, both unchecked and unblocked), so
the generation rule does not need to run next session either.

### 2026-08-26 — session 9

**Feedback inbox:** `feedback/` exists in this worktree and is empty. Nothing
to process, nothing moved.

**Four actionable items were in queue** (q13–q16, all unchecked and
unblocked), so the generation rule did not run. Took q13, the top item.

**q13 done.** `tools/perf-ratio.ts` (harness + CLI) and
`tests/q13-perf-ratio.test.ts` (5 tests, ~13s standalone).

**What it does.** `calibrationWork(iterations)` is a fixed, deterministic,
pure-integer-arithmetic loop with no dependency on the sim, the heap, or GC
pressure — its wall-clock cost is (to first order) just "how fast is this
CPU," the same quantity a tick's wall-clock cost depends on.
`worstCaseWorld()` is moved here from `tests/a10-performance.test.ts` (which
now imports it back) rather than re-derived, q11's reuse-not-re-derive shape
again. `measureRatioForWorld(world, calibIters, tickSamples, warmupTicks)`
reports `ratio = msPerTick / msPerCalibUnit` — "how many calibration units
one tick costs" — instead of an absolute ms bound.

**The measurement needed two real fixes before it survived contact with a
genuinely contended host, not just a quiet one — both found by actually
running it under load, not by reasoning about it.**

1. The first cut measured calibration and ticks as two back-to-back blocks
   (`timeCalibration` then `timeWorstCaseTick`). Quiet-host readings were
   ~14,000-27,000. Run inside a real `npm test`-equivalent (`npx vitest run`,
   which parallelizes many files across worker threads — the exact reason
   `tests/a10-performance.test.ts` itself runs isolated under
   `vitest.perf.config.ts`), the same code read **56,772** against a
   first-draft ceiling of 45,000 — a contention burst was landing on one
   block and not the other. This lane's Scope cannot move the new test into
   `vitest.perf.config.ts` (that file sits outside `tests/**`/`tools/**`), so
   the fix had to be survive-contention, not avoid-contention:
   `measureRatioForWorld` now interleaves at fine grain, one calibration
   chunk immediately followed by one tick, `tickSamples` times over, so a
   burst shorter than the whole window falls on both kinds of work roughly
   in proportion. Re-measured under real contention afterward:
   medians ~29,000-30,000, individual samples up to ~39,700 — much closer to
   the quiet-host range than the sequential design's ~2x-4x blowout.
   `RECORDED_CEILING` is 65,000 (~1.6-2.2x the contended reading, ~3-4x the
   quiet one).
2. The anti-vacuity check (worst-case ratio must dwarf an empty world's)
   originally took a single sample for the empty world and a 50x threshold.
   Under a different contended run it read `worst=39107 empty=1321` and
   failed (39107 is not > 1321×50=66069) — not because the mechanism is
   unsound, but because a single sample of a near-timer-resolution quantity
   is itself noisy in either direction. Fixed by taking a median of 5 for the
   empty world too, sampled 5000 ticks instead of 500 (cheap, since each
   empty tick is nearly free, and more samples average the noise down
   before the median), with the threshold relaxed to 10x — still an order of
   magnitude, comfortably clear of anything a real measurement produced.

Both fixes were found by actually running the full suite repeatedly (not
just the new file standalone) — the first failure only showed up once
inside genuine `npm test`-scale parallelism, and the second only showed up
on a different run under different contention. Two consecutive clean
`npx vitest run` passes (776 passed / 78 skipped, exit 0 each) after both
fixes landed.

**An artifact of measuring this, recorded so it isn't repeated:** simulating
contention by spawning ~16-25 synthetic `node -e "while(true){...}"`
busy-loop processes escaped this session's own `pkill` (Windows/git-bash
`pkill` did not match the spawned `node.exe` processes) and kept running
after the shell command returned, adding real load on top of the machine's
*other* live session (`D:\lidl_games` — a separate checkout running its own
`npm run dev` and `vitest run`) until they were found and killed individually
via `Get-CimInstance Win32_Process` / `Stop-Process` by PID. No further
synthetic contention was manufactured after that; the ceiling and stability
numbers above instead come from measuring alongside a second real, bounded
`npx vitest run` invocation. Anyone extending this probe should do the same —
a genuine concurrent test run is realistic contention and cleans itself up on
its own; ad hoc busy-loops do not and can leak onto a shared machine.

**Review (code-reviewer, APPROVE, 3 Minor + 1 nit, none blocking).** Verified
Scope, architecture rules (n/a — `tools/` is outside the `/src/sim` ban on
`Math.random`/`Date.now`/native trig), that `worstCaseWorld`'s extraction is
byte-for-byte behavior-preserving against its prior home in
`tests/a10-performance.test.ts`, and the ratio math itself. Ran the suite
independently under real contention (~26 concurrent node processes it
observed mid-run) and it passed clean. Minors, not fixed (see below):
this Log entry was missing at review time (now written, this entry); the
65,000 ceiling's contention-tolerance necessarily trades away sensitivity to
a genuine ~2-3x regression measured on a quiet host (an inherent tension in
a contention-tolerant probe, already disclosed in the test's own comment,
not a defect); no *deterministic* (non-timing) test proves the interleaving
call order itself, only the empirical wall-clock outcome — left as a
possible future strengthening, not filed as its own item (too small on its
own, same bar session 8 used for `soak.ts`'s two boundary-input gaps).

**QA (qa-playtester, PASS) — mutation-tested the two fixes for real, not by
re-reading them.** Reverted the interleaving to the old sequential shape and
ran the ceiling test three times while a second real `npx vitest run` was
going in the background: **failed twice** (77,910 and 74,881 against 65,000),
passed once the background run had finished — confirming the interleaving is
a load-bearing fix, not a defensive comment nobody needs. Hollowed
`worstCaseWorld()` to an empty world before adding anything: both the
anti-vacuity test (`worst=172 empty=167`, correctly not >10x) and the
fixture-reachability test (`expected +0 to be 8`) went red. A milder
mutation (enemies capped at 5, towers/weapons intact) tripped only the
fixture check, not anti-vacuity — correctly describing that anti-vacuity's
separation is dominated by tower/weapon cost, not raw enemy count, which is
what the fixture check exists to guard from the other side. Injected
`Math.random()` into `calibrationWork`: the determinism test correctly
failed. Two independent full `npx vitest run` invocations both green
(776/78, exit 0), one deliberately overlapped with a second concurrent run
for contention. All mutations reverted, confirmed clean. No bugs filed —
none found.

**Suite state at this commit.** `npx vitest run` — **776 passed / 78 skipped,
exit 0**, q13's 5 tests included (up from session 8's 771 + 5 = 776, matching
exactly). `npx vitest run --config vitest.perf.config.ts` (A10, now importing
`worstCaseWorld` from `tools/perf-ratio.ts` instead of its own copy) —
3/3 green, confirming the extraction didn't disturb A10's own budget test.
`npx tsc --noEmit -p .` clean.

**Three actionable items remain** (q14–q16, all unchecked and unblocked), so
the generation rule does not need to run next session either.

### 2026-08-26 — session 8

**Feedback inbox:** `feedback/` exists in this worktree and is empty (checked
with `ls -la`, and again with `ls -la feedback/processed/` which does not
exist). Nothing to process, nothing moved.

**Five actionable items were in queue** (q12–q16, all unchecked and
unblocked), so the generation rule did not run. Took q12, the top item — the
in-Scope substance of q1, which stays blocked on the `npm run soak` alias.

**q12 done.** `tools/soak.ts` (harness + CLI) and `tests/q12-soak.test.ts`
(7 tests, ~21s).

**What it does.** `soakOne(seed, policyName, maxTicks?, scanEvery?)` plays one
seeded, *undirected* full run — a shipped bot policy's own input only, nothing
injected — the deliberate opposite of q2's `fuzzRun`, which stitches random
Commands into the tick input to abuse the player surface. `soakOne` scans the
world every `scanEvery` (default 60) ticks and the final `run.report()` once,
both through q11's extracted `scanWorld`/`scanReport` (`tools/invariants.ts`)
rather than a re-derived checker, and records `threw` separately from
`problems` so an exception and an invariant violation are distinguishable.
`soak(n, policies, seedStart)` round-robins `n` seeded runs across a policy
list so the soak is a genuine mix rather than one bot's habits 50 times. The
test runs `soak(50, shippedPolicies())` — the 10 shipped policies from
`policyNames()` — in a `beforeAll`, asserts zero `problems`/`threw` across all
50, that the run mix spans every shipped policy exactly, that `soakOne` is
seed-reproducible, and that `soak([])` throws rather than silently soaking
nothing.

**Review (code-reviewer, APPROVE, no findings).** Confirmed both `catch`
blocks in `soakOne` set `threw` and record a message rather than swallowing
silently (the `loadMeta`-blanket-catch shape earlier sessions have found
elsewhere does not recur here); confirmed empirically (not just by reading)
that `vitest.config.ts`'s default per-file isolation keeps the anti-vacuity
block's throwaway policy registrations from leaking into
`tests/q9-phase-coverage.test.ts`'s exact-match policy census, by running both
files together; confirmed the scanner import is genuine reuse, not
re-derivation; confirmed Scope (`git diff --stat HEAD -- . ':!tests'
':!tools' ':!bench'` empty) and CLI/doc-comment style consistency with
`tools/fuzz-input.ts` and `tools/phase-coverage.ts`.

**QA (qa-playtester) — found a real gap, fixed here.** Verdict was a
qualified PASS: the shipped acceptance criteria held (green standalone and in
the full suite, genuine scanner reuse, Scope clean), but mutation testing
found the anti-vacuity coverage was one-sided. Disabling both `scanWorld`/
`scanReport` calls entirely (`if (false && ...)` / `if (false)`) left all 6
tests passing — the THROWER/SILENT pair proved the *exception* path could go
red, but nothing proved the *invariant-scan* half of q12's own acceptance line
("zero NaN/negative-invariant violations") was actually wired in. QA also
independently re-confirmed the vitest-isolation claim (ran q9 and q12
together, q9's exact policy list unaffected) rather than trusting code
review's read of it, and separately confirmed the scanner mechanism itself is
sound by injecting a real `w.gold = NaN` with the scanner calls intact — three
tests correctly went red with the real `"gold=NaN is not finite"` message.
Two lower-severity, non-blocking observations were logged rather than fixed,
since neither is reachable through the shipped test file or CLI (both only
ever use the defaults and `shippedPolicies()`): `soakOne(seed, policy, 0)` or
a `scanEvery` of 0 produces a "clean" result for a run that never actually
played or was never scanned, and an unregistered policy name throws out of
`soakOne` itself rather than surfacing as `SoakResult.threw`. Recorded below
for whoever next touches `tools/soak.ts`'s public signature.

Closed the real gap in this commit: a third anti-vacuity policy, `POISONER`,
mutates `w.gold = NaN` directly on its first `act()` call (no exception, no
Command) and a new case asserts `soakOne` reports it as a non-empty
`problems` list mentioning `gold`, with `threw` staying `false` — the same
shape as the THROWER/SILENT pair, but for the scan path instead of the
exception path. Verified it actually fails on the QA-found mutation: re-ran
QA's exact `if (false && ...)`/`if (false)` disabling and confirmed only this
new case went red (`expected 0 to be greater than 0`), reverted, `diff`
against a pre-mutation backup and `git status --porcelain` both clean.

**Suite state at this commit.** `npx vitest run` — **771 passed / 78 skipped,
exit 0**, q12's 7 tests included (up from session 7's 764 + q9-untouched
764... precisely: 770 before the POISONER case, 771 after), ~254s.

**Recorded, not filed as a backlog item (too small on its own, and not
reachable by anything shipped):** `tools/soak.ts`'s `soakOne` has two
unguarded boundary inputs — `maxTicks <= 0` (or a `scanEvery` of `0`, since
`tick % 0` is `NaN` and the periodic-scan check never fires) reports a "clean"
result for a run that was truncated to nothing or never scanned, and an
unregistered policy name throws before `soakOne`'s own `try` block rather than
surfacing through `SoakResult`. Neither is exercised by `tests/q12-soak.test.ts`
or the CLI, both of which only ever pass the defaults and `shippedPolicies()`.
Whoever next extends `soak`/`soakOne`'s public surface (q13's perf probe or
q15's argument-domain fuzzer both touch adjacent ground) should decide whether
to guard these or just document the assumption.

**Fewer than 3 actionable items will remain after this commit's queue update**
is not yet true — q13–q16 (4 items) are still unchecked and unblocked, so the
generation rule does not need to run next session either.

### 2026-08-26 — session 7

**Feedback inbox:** `feedback/` exists in this worktree and is empty (checked
with `ls -la`). Nothing to process, nothing moved.

**More than 3 actionable items were in queue** (q11–q16 unchecked and
unblocked), so the generation rule did not run.

**q11 was found already implemented, uncommitted, at session start** — same
shape as sessions 3/4's q7/q8 discoveries: `tools/invariants.ts` (new),
`tools/fuzz-input.ts` and `tests/q2-input-fuzz.test.ts` (both modified) were
sitting in the worktree with no matching Log entry. Verified rather than
trusted, per this file's own standing lesson.

**What it does.** `scanWorld`/`scanReport` and their private helpers (`bad`,
`scanDerived`, `DERIVED_POSITIVE`, `DERIVED_NON_NEGATIVE`) moved out of
`tools/fuzz-input.ts` into `tools/invariants.ts` verbatim — a pure mechanical
extraction, no behavior change. `tools/fuzz-input.ts` now imports both from
`./invariants` and re-exports them, so q7's `tests/q7-data-fuzz.test.ts`
(which reaches the scanner through `const scan = await
import('../tools/fuzz-input')`) keeps working unchanged; `tests/q2-input-fuzz.test.ts`
was repointed to import `scanWorld` directly from `../tools/invariants`. The
acceptance line's parenthetical — "including its anti-vacuity case, which
moves with the scanner" — refers to q2's `has an invariant scan that actually
fires` test, which stayed in `tests/q2-input-fuzz.test.ts` and was not
duplicated into the new module.

**Review (code-reviewer, APPROVE, no findings).** Confirmed the moved code is
byte-identical between the old location (via `git diff`) and the new file;
grepped the whole repo for any other importer of `scanWorld`/`scanReport` and
found only the four expected sites; traced `tools/invariants.ts`'s own imports
(`World` type, `GRID_H`/`GRID_W`, `STAT_KEYS`) for cycles — none, same pattern
`tools/fuzz-input.ts` and `tools/phase-coverage.ts` already use; confirmed the
docstring's claim about q7 reaching the scanner through the re-export is true;
ran q2 and q7 standalone, both green.

**QA (qa-playtester, PASS).** Ran q2 and q7 standalone (16/16, 29 passed/7
skipped — identical to the pre-refactor baseline via `git stash`). Mutation-
tested for real: `return [];` as `scanWorld`'s first line correctly failed
q2's anti-vacuity case and nothing else; commenting out `fuzz-input.ts`'s
`export { scanReport, scanWorld };` line correctly failed 5 of q7's tests with
`scan.scanWorld is not a function`, proving q7's dependency on the re-export
is real rather than incidental. Both reverted, `git diff --stat` matched the
original pre-mutation diff exactly. Re-grepped independently for any missed
caller (none) and re-confirmed Scope (`tests/**`/`tools/**` only touched).

**Suite state at this commit.** `npx vitest run` — **764 passed / 78 skipped,
exit 0**, q11's extraction included, ~236s.

**Fewer than 3 actionable items will remain after this commit's queue update**
is not yet true — q12–q16 (5 items) are still unchecked and unblocked, so the
generation rule does not need to run next session either.

### 2026-08-26 — session 6

**Feedback inbox:** `feedback/` does not exist in this worktree; nothing to
process, nothing moved.

**Only q10 and q11 were actionable** (fewer than 3), so the generation rule
ran first: ran `tools/sweep.ts --seeds 12` and `tools/handoff-metrics.ts`
(nothing new — the 0% win rate at 12 seeds matches PROGRESS.md's already-known
bimodal-Act-II/VS-not-built state); grepped SPEC-FINAL §14's G-numbers against
`tests/*.test.ts` and found most gates are named only by V2-vintage files that
cite no G-number, which is exactly q10's job to formalize; and added q16 as the
one engineer's-judgment item, since `content-complete.test.ts` demonstrably
checks V2-era totals, not SPEC-FINAL §13's. Appended q12–q16 (soak/perf-ratio/
mutation-smoke as the unblocked, in-Scope equivalents of q1/q4/q6; a
command-argument domain fuzzer per session 1's own flagged gap; a content-totals
census against §13). All five inside Scope, none needs a `package.json` edit.
Took q10, the top item.

**q10 done.** `tools/gate-audit.ts` (parser + curated maps + CLI) and
`tests/q10-gate-audit.test.ts` (14 tests).

**What it does.** `parseGates()` regexes every `| Gn | text |` row straight out
of SPEC-FINAL.md's own §14 section — dynamic, not a hand-copied list, the same
anti-staleness idiom q2 uses for the `Command`/`Phase` unions and q9 uses for
`policyNames()`. `GATE_COVERAGE` (gate → test files, curated) and `KNOWN_HOLES`
(gate → a reason naming the PROGRESS.md P-phase blocking it) are necessarily
hand-curated, since almost every test file predates SPEC-FINAL and names no
G-number in its own text. `auditGates()` classifies every parsed gate
`covered`/`hole`/`UNTRACKED`; the test asserts UNTRACKED never happens. Final
split: **8 covered (G2, G4, G5, G13, G14, G16, G18, G20), 12 holes** (G1, G3,
G6–G12, G15, G17, G19), tracking against PROGRESS.md's P2/P3/P6/P7/P9-incomplete
audit almost gate-for-gate.

**Review (code-reviewer, Major x3, all fixed here).** Caught three curated
notes that overstated things by direct inspection of the files they cited:
`f004-class-framework.test.ts` was called "entirely describe.skip'd" for G8
when 3 of its 4 `describe` blocks are (the 4th, a live class-active
replay-hash test, actually covers a G2 sub-clause my first draft said was
missing — G2's `files` now includes it); `f001-cycle-machine.test.ts` was
called "itself retired" for G6 when only its "cycle boundary helpers" block
is skipped, its "cycle state machine" block is live against the pre-P3 V2
cycle system. All three notes reworded to say precisely which blocks are live
vs. skipped. Everything else — regex robustness against the real CRLF
SPEC-FINAL.md, no vacuous assertions, Scope, style vs. `tools/phase-coverage.ts`
— checked out clean.

**QA (qa-playtester, FAIL on the first pass, fixed here) — this is the finding
worth reading.** Mutation-tested the mechanism for real (removed G5 from
`GATE_COVERAGE` without adding it to `KNOWN_HOLES`, confirmed 2 tests go red,
reverted, `git diff --exit-code` clean; same for hollowing `auditGates()` to
always return `covered`) and it held. But spot-checking the *notes* the same
way code review just had, QA found **G1 and G19 were marked `covered` by files
that are entirely `describe.skip`'d — zero live assertions backing either
gate**, the exact defect class code review had just fixed three instances of,
slipping through a fourth and fifth time in the same pass.
`tests/a1-run-length.test.ts` (G1) is headed "RETIRED (SPEC-FINAL §14 G1, P3)"
and its skipped body measured a *median*, the opposite of what G1's own text
asks for ("means/pass-rates, never medians"). `tests/a8-sundering-head-start.test.ts`
(G19) is headed "RETIRED (SPEC-FINAL §6.1, reconcile §16)", and QA further
found that even when it was live, its body never measured sealed/open strategy
mix or multi-summon usage — G19's actual content was never tested by it
either. QA also flagged G13 as the same shape one level down: two of its three
cited files (`a5-weapon-share.test.ts`, `a8-sundering-head-start.test.ts`) are
fully retired and contribute nothing; only `a4-single-type.test.ts` is live,
and it itself defers 2 of 7 towers.

Both G1 and G19 moved from `GATE_COVERAGE` to `KNOWN_HOLES` (split is now
8/12, was 10/10); G13 now cites only its one live file with a note disclosing
the retired half. A permanent safeguard was added rather than just fixing the
three instances by hand: `hasLiveTopLevelDescribe()` (column-anchored — every
top-level `describe` in this suite is unindented) and
`entirelyRetiredCoverage()`, asserted empty in a new test, so a `covered` gate
backed only by fully-retired files fails the suite automatically instead of
needing a second human QA pass to catch it a second time. Both new functions
carry their own anti-vacuity test against hand-picked known files
(`a1-run-length.test.ts` confirmed retired, `a11-determinism.test.ts`
confirmed live) rather than trusting the real map to exercise the failing
branch. Re-verified all `covered` gates' files by grepping every one for a
live top-level `describe` after the fix — all clean.

**Suite state at this commit.** `npx vitest run tests/q10-gate-audit.test.ts`
— 14/14 green. Full suite pending in background at time of writing; will
confirm the exact count in the commit that follows if it differs from
session 5's 750 + 11 (761 expected).

### 2026-08-26 — session 5

**Feedback inbox:** `feedback/` does not exist in this worktree; nothing to
process, nothing moved.

**Three actionable items were in queue (q9, q10, q11)**, so the generation
rule did not run. Took q9, the top item.

**q9 done.** `tools/phase-coverage.ts` (harness + CLI) and
`tests/q9-phase-coverage.test.ts` (16 tests, ~30s).

**What it does.** Plays real, undirected headless runs of every registered
bot policy (`idle`, `no-move`, `turtle`, `kite`, `hybrid`, `maxbuild`,
`walloff`, `greedy`, `greedless`, `rush` — via `policyNames()`/`makePolicy()`,
so a newly registered policy is picked up automatically) and records the set
of `world.phase` values each one's own play actually produces, never forcing
a phase transition the way `tools/fuzz-input.ts`'s `runInPhase` does. Measured
identically stable at 6, 8, 10 and 12 seeds per policy, so the test runs at 8.
The test pins a `RECORDED_FLOOR` per policy and asserts the reached set
**exactly**, not just as a superset, deliberately more than the acceptance
line's minimum bar: a policy reaching *more* than its floor is news (a better
bot, or a rare branch a small seed count missed) and should be looked at
rather than pass silently, the same way q7's `ACCEPTED` map pins loader holes
by name. `soulpick` is confirmed unreached by any shipped policy — session
1's finding (7 distinct souls vs. 6 weapon slots in `data/towers.json`, so
every bot auto-binds and skips the picker) — and is asserted absent from
every policy's reached set as the known, pinned gap the acceptance line asks
for, plus one test asserting the union across all ten policies is exactly
`ALL_PHASES` minus `soulpick`. An anti-vacuity test proves the superset-check
helper the floor tests lean on can actually fail, using a hand-built fixture
rather than trusting the real census to exercise it.

**Review (code-reviewer, APPROVE, 1 Minor).** Verified the drive logic against
`tools/sweep.ts`'s own `runOne` (same `RunConfig`/`Run`/`policy.act` shape, no
forced phase writes), confirmed no `Math.random`/`Date.now`/native trig is
reachable from the path and no writes outside `tools/**`/`tests/**`. One
cosmetic nit: the CLI table's `reached` column was a fixed `padEnd(50)`, one
character short of the longest real value, so the `unreached` column ran
straight into it with no separator for most policies. Fixed by sizing the
column to the longest actual value instead of a guessed constant.

**QA (qa-playtester, PASS).** Confirmed the CLI census and the test's
`RECORDED_FLOOR` agree exactly, including at `--seeds 20`. Mutation-tested
for real: forced `completeWave` in `src/sim/run.ts` to never enter dusk (11/16
red, exactly the dusk/act2/levelup/dawn-dependent tests), moved the dawn
trigger in `updateAct2` to fire almost immediately so `levelup` is skipped
(11/16 red, `levelup` gone and `dawn` appearing where it shouldn't), and
rebound `hybrid`'s registration in `src/bots/policies.ts` to `IdlePolicy`
(exactly 2/16 red — hybrid's own floor test and the exact-set test for
hybrid only, showing a single-policy regression is localized rather than
false-failing broadly). All three reverted byte-for-byte, `git diff
--exit-code` clean after each. Ran the file three times standalone with no
flakiness, and the full suite once clean.

**Suite state at this commit.** `npx vitest run` — **750 passed / 78 skipped,
exit 0**, q9 included (up from session 4's 734).

### 2026-08-26 — session 4

**Feedback inbox:** `feedback/` does not exist in this worktree; nothing to
process, nothing moved.

**q8 done — same pattern as q7 last session.** `tests/q8-save-roundtrip.test.ts`
was already sitting complete and untracked at session start, with no matching
Log entry — another earlier session wrote and validated it and stopped before
writing up or committing. Verified rather than trusted, the same way session 3
treated q7: ran the file alone (5 passed, ~14s), then the full suite
(`npx vitest run`, **734 passed / 78 skipped, exit 0**, ~212s, q8's 5 tests
included against session 3's 729-test baseline), then took it through
code-reviewer and qa-playtester before committing.

**What it does.** The other half of QUALITY ALPHA's save line — q3 fuzzes
*corrupt* saves, this fuzzes *valid* ones. Reuses q3's `validMeta` (a
connected-tree-walk generator from `tools/fuzz-save.ts`) rather than
duplicating it. Two sweeps: 1500 seeded valid metas asserting
`deserializeMeta(serializeMeta(m))` deep-equals `m` and that a second pass is a
fixed point, plus a negative control (drop node 0 from `allocated`) proving the
check can actually fail; then 500 more metas grown through a real
`applyRunResult` call fed real `RunReport`/`World` pairs from five actual `Run`
simulations (practice, short, tier-3-with-relics, a full no-move defeat, a full
hybrid-tier-2 victory) so the growth half exercises real branch diversity
(practice-identity, victory/defeat/running, the `highestTier` bump, the
`fastest_boss_kill` quest metric, relic-stash growth at 0/2/3/9) rather than
hand-authored stand-ins. 1500 + 500 = 2000, matching the acceptance line
exactly.

**Review (code-reviewer, APPROVE).** Traced `validMeta`'s connected-walk
construction, `migrate`'s merge and repair branches, and the practice-run
identity path in `applyRunResult`; reasoned through spread-order-reversal and
dropped-field mutations without finding a way the test could pass vacuously.
Two nits (BACKLOG checkbox not yet flipped at review time; a documented
`World`-reuse fragility that isn't live today), no Critical/Major/Minor
findings.

**QA (qa-playtester, PASS) — did the mutation testing for real, not by
reasoning.** Backed up `src/meta/meta.ts`, applied three independent live
mutations and confirmed each turned the test red on the very first generated
meta, then restored the file byte-for-byte (`git diff --exit-code` clean after
each revert): dropping `ember` from `serializeMeta`'s output, reversing
`migrate`'s spread order (`{...meta, ...base}`), and deleting
`unlockedClasses` after the merge. A fourth, deliberately behavior-preserving
edit (removing a redundant copy-line already covered by an earlier spread)
correctly stayed green — confirmed by tracing the code, not a test gap. Also
independently re-ran the five `buildGrowthCases()` scenarios through a
throwaway probe to confirm the branch-diversity claim, and traced `validMeta`
against `migrate` to confirm no legitimate-but-unstable input shape exists
(searched specifically for flakiness, found none). Repo clean at every
checkpoint.

**Suite state at this commit.** `npx vitest run` — **734 passed / 78 skipped,
exit 0**, q8 included, ~212s.

### 2026-08-26 — session 3

**Feedback inbox:** `feedback/` exists in this worktree and is empty. Nothing
to process, nothing moved.

**q7 done — but the interesting part is how it was found.** The three files
(`tools/fuzz-data.ts`, `tests/q7-data-fuzz.test.ts`, `tests/q7-loader-holes.ts`)
were already sitting complete and untracked in this worktree at session start,
with no matching Log entry — an earlier session wrote and validated the whole
thing (the file headers, the recorded artifact's "Recorded 2026-08-26" stamp
and the `it.skip` bug reports all read as finished work) and stopped before
writing up or committing. Verified rather than trusted: ran
`npx vitest run tests/q7-data-fuzz.test.ts` (29 passed / 7 skipped, ~19s) and
the full suite (`npx vitest run`, 729 passed / 78 skipped, exit 0, ~220s) clean
with the files in place, then took it through the same review → QA → commit
path session 2's own note says to use when the two are not run concurrently
against a moving artifact — here there was no editing in between, so series vs.
parallel was moot, but review ran first anyway.

**What it does.** `census()` is exhaustive, not sampled: every canonical field
path across all fifteen `/data` files, crossed with every mutation family that
is a genuine type-change for that field's kind (17 families — retype,
drop-key, rename-key, negative/zero/infinite/fractional, empty-string,
flip-bool, empty-array/drop-element/dupe-element) — 4,775 effective mutations,
3,077 rejected, 1,698 accepted. The seam swaps `/data` at the `vi.mock` import
boundary, never the disk; a `filesOnDisk()` hash taken before the census runs
brackets the whole file to prove it. The *accepted* set — the interesting
column, since a loader whose schemas all passed would score "no crash"
perfectly either way — is pinned in `tests/q7-loader-holes.ts` as a named
`ACCEPTED` map, so a new field added without a guard, or a guard removed from
an existing one, goes red by name on the next run rather than passing quietly.
A second census (`REF_VERDICTS`) scores every string field under a
garbage-rename and reports whether every row referencing it is cross-checked
(`checked`), none are (`open`), or some are and some are not (`partial` — the
one-directional-integrity finding, E1 below). Six probes go one step further
than "accepted": they build a whole world from six specific accepted
mutations and run a bot through it, so "accepted" is scored against what it
actually costs at runtime, not just against the loader's verdict.

**Review (code-reviewer, APPROVE, no findings).** Manually unskipped all seven
`it.skip` bug reports, confirmed each fails today for the stated reason
against the real `/src` files, restored the file with no diff. Confirmed no
disk writes, no `Math.random`/`Date.now`/DOM, and that the `vi.mock` holder
pattern avoids the stale-reference trap its own comments describe. No
Critical/Major/Minor findings beyond two non-blocking style nits (a `never`
param type used only to force call-site casts; runtime scales with `census()`
size by design).

**QA (qa-playtester, PASS).** Read the actual summary line (729 passed / 78
skipped), not a piped tail — the exact mistake session 2 made and fixed is
named in this file's own header as something to avoid, and QA repeated the
check independently rather than trusting that write-up. Tried to defeat the
harness by reasoning through hollowing `scanContent`/`mutate`/`familiesFor` to
see which assertions would catch it — all three are guarded, none vacuous.
Independently re-derived one suspicious-looking artifact entry
(`towers.towers[].attack.damageRatio.electric` missing `'zero'` where its
sibling `normal` has it) with a throwaway probe against the real loader before
concluding the record is correct — the rejection comes from `tesla_coil`'s
`electricChain` special guard, not `validateDamageRatio`, and both fields
already had a plausible-but-wrong story ruled out before being trusted. One
low-severity, non-blocking note, recorded rather than fixed because nothing
in the shipped harness exploits it: `filesOnDisk()`'s no-writes pin only
hashes the fifteen *named* files, so it would not catch a mutation that wrote
a *new* file under `data/` rather than editing one of the fifteen. No live
path does this today (grepped both new files for `writeFile`/`appendFile`:
zero hits), so no regression test is owed against current code.

**Suite state at this commit.** `npx vitest run` — **729 passed / 78 skipped,
exit 0**, q7 included, ~220s.

---

*Bug reports for the main lane, in merge order. E1–E7 are `/src`/`/data`-schema
defects this fuzzer found; each has a regression test written to the fixed
behaviour and `it.skip`'d in `tests/q7-data-fuzz.test.ts` (describe block "q7 —
filed defects (unskip with the fix)") — this lane may not edit `/src`, so
skipping is the only way to leave the suite green. All seven were confirmed to
fail today, independently, by both code-reviewer and QA unskipping them.*

1. **E1 — the loader accepts a renamed content key that `/src` still
   references by string literal, and the crash lands at runtime instead of
   load time.** `src/bots/policies.ts:216` (`towerByKey.get('palisade')!`),
   `src/sim/upgrades.ts:119` and `src/sim/weapons.ts:339` (`def.key ===
   'palisade'`) all name the Palisade by its raw key; `content.ts`'s
   integrity block cross-checks `soul`, `source`, `weapon`, `boon`, affinity
   `towers[]`, wave `enemy` and spawn cost/weight keys, but nothing walks
   `/src` for string-literal key references, so `palisade` — referenced by no
   *other* `/data` file — has nothing to catch it. Renaming it loads clean and
   throws `Cannot read properties of undefined` the first time a bot tries to
   build one. `REF_VERDICTS`' `partial` verdicts (`boons[].key`,
   `damagetypes.types[].key`, `enemies[].key`, `towers[].key`,
   `weapons[].key`) are the general shape of this: some rows are referenced
   from another `/data` file and caught, the rest are not checked at all.

2. **E2 — no numeric range guard worth the name.** `interval`, `range`, `hp`
   and `cost` (and by the same pattern, most numeric fields across all
   fifteen files) are plain `num` with no `.positive()`/`.min()`. Measured
   floors: negative 93%, zero 97%, infinite 95%, fractional 95% of applicable
   fields accepted. Not all of it is a crash — `interval: 0` on a tower is a
   90x-rate tower, not a hang, since `updateTowers` has no inner loop — but a
   `zero`/`negative` `hp`, `interval` or `range` and a negative `cost` are all
   authorable today.

3. **E3 — non-finite numbers anywhere in `/data` reach the engine and the
   report.** `1e999` is legal JSON and parses to `Infinity`; nothing in
   `content.ts` rejects it. Measured consequences: an `Infinity` tower damage
   reaches `report.damageTotal`, which G18's round-trip/reproducibility
   promise cannot hold for; an `Infinity` enemy `hp` makes a wave literally
   unkillable and ends the run; an `Infinity` Warden `maxHp` makes the Warden
   unkillable. All three load clean, no throw.

4. **E4 — duplicate ids and keys silently collapse instead of erroring.**
   Pushing a duplicate tower row is accepted; the `Map` built from it keeps
   the later row and the earlier one simply stops existing (`towerByKey.size
   !== towers.length`) with nothing surfaced. Same shape as `enemyByKey`,
   `enemyById`, `treeById`.

5. **E5 — `tree.json` authors two fields its own schema doesn't name.**
   `TreeNodeSchema` is not `.strict()` and never declares `angle`/`ring`, so
   zod silently drops them from validation; every type mutation on either
   field is accepted. The only two non-string-kind fields in the entire
   4,775-case census where a wrong *type* gets through — every other typed
   field in `/data` is refused.

6. **E6 — a mistyped stat key loads clean and buys nothing, silently.** Six
   authoring paths (`tree.nodes[].stats`, `classes[].mods`, `boons[].stat`,
   `relics.affixes[].stat`, `relics.implicits.*.stat`, `modifiers[].effect`)
   write into a `z.record(num)` keyed by stat name with no enum check, and
   `Stats.addAll` (`src/sim/stats.ts`) filters any key not in `STAT_KEYS`. A
   typo'd stat name is indistinguishable, at load time, from a real one — it
   reaches `treeById` intact and then does nothing at every point of use.
   `content.ts`'s own comment says `SPECIAL_KEYS` was made an enum "to
   prevent... a typo silently buying nothing" for one narrower case; this is
   the general shape of the same failure across six fields.

7. **E7 — an empty roster, wave list, tree or quest log is accepted.**
   `waves.waves`, `tree.nodes` and `quests.quests` all load with `[]` instead
   of being refused. QA reproduced this independently of the shipped harness
   with a standalone probe.

*Not a defect, recorded because QA specifically ruled it out rather than
assuming it:* `towers.towers[].attack.damageRatio.electric` is missing the
`'zero'` mutation from its recorded `ACCEPTED` entry where the sibling
`.normal` field has it — this looked like a recording gap on inspection, but
is correct: `zero` on `.electric` is rejected by `tesla_coil`'s
`validateSpecial`'s `electricChain` guard (it needs a nonzero electric share
to pay its upgrade special), not by `validateDamageRatio`, which both fields
otherwise satisfy either way.

*Informational, not filed as a defect:* the "no `/data` file is written" pin
(`filesOnDisk()`) hashes only the fifteen files `DATA_FILES` names, so it
would not catch a mutation that wrote a *new* file under `/data` rather than
editing one of the fifteen. No such write exists in the shipped harness
(grepped for `writeFile`/`appendFile`: zero hits in either new file), so
nothing is owed against current code — recorded so a future extension of this
harness knows the pin's actual shape.

---

### 2026-08-26 — session 2

**Feedback inbox:** `feedback/` does not exist in this worktree; nothing to
process, nothing moved.

**Housekeeping:** session 1's q2 deliverable was left uncommitted. The suite was
re-run green with it in place (636 passed / 63 skipped, exit 0) and it is now
committed as `quality q2: input fuzzer`.

**Generation rule ran first.** Only q3 was actionable — q1, q4, q5 and q6 are
all still blocked by the Scope boundary, unchanged since session 1 — so under
CLAUDE.md's "fewer than 3 actionable items" rule five lane-scoped items were
appended before executing: q7 (content-data loader fuzz), q8 (valid-save
round-trip property test), q9 (phase-reachability census), q10 (gate-coverage
audit), q11 (extract the shared invariant scanner). All five are inside Scope as
written; none of them needs a `package.json` entry.

**q3 done.** `tools/fuzz-save.ts` (harness + CLI) and
`tests/q3-save-fuzz.test.ts`. 64 passing cases + 8 skipped defect pins, ~10 s,
about 3.4% of the suite budget. No `npm run` alias needed — `vitest.config.ts`
already includes `tests/**/*.test.ts`. Deeper soaks:
`npx tsx tools/fuzz-save.ts --n 200000 --seed 7`.

What it does: generates a rich, *valid* save (every field populated, `allocated`
built by a connected walk of the real tree so it is legal by construction),
corrupts it fifteen ways — five byte-level (truncate, single-bit flip, span
delete, span duplicate, junk insert) and ten structural (retype, drop-key,
rename-key, extreme-number, empty-container, grow-array, proto-key, deep-nest,
long-string, version) — and checks what `loadMeta` returns. About a third of the
bases are v0.2-shaped (version 1 plus an `orbs` key), which is what gives the
`version` family something the loader actually reads the stamp for.

Three outcomes are scored separately, because "never a crash" cannot tell them
apart and two of the three are total data loss: **repaired** (the repair path
returned the account), **rejected** (it threw, `loadMeta` caught, the account is
gone), **wiped** (it *returned* `defaultMeta()` for an account that had content
— the same loss by a route no `catch` can observe). Alongside them the census
tracks **changed**: whether the corruption made any difference to what loaded.

**The measurement that shaped the whole file.** `loadMeta` wraps its entire body
in `catch { return defaultMeta(); }`, so **no input can make the crash contract
fail** — not truncation, not a 50,000-deep nest, nothing. The crash half is
therefore a regression tripwire, not a discovery instrument, and a fuzzer that
quietly stopped corrupting anything would stay green forever. That is why every
family now has to prove it still moves the loaded state (85–100% measured, with
`version` at 14% and its own floor). The discovery lives in the field x
wrong-type matrix and its four subset pins instead.

*Vocabulary note for the main lane, since two documents disagree.* QUALITY.md
ALPHA says truncated saves "load into the repair path". By this file's
vocabulary none of them do: of all 768 prefixes of a real save exactly one — the
whole thing — parses, and every other truncation is **rejected**, i.e. the
player silently gets a fresh account. That is crash-free and it is what the code
is built to do, but it is not repair, and the gate wording should say which it
means before G18 is claimed.

---

*Bug reports for the main lane, in merge order. D1–D5 are `/src` defects this
fuzzer found; each has a regression test already written to the fixed behaviour
and `it.skip`'d in `tests/q3-save-fuzz.test.ts` — the lane may not edit `/src`,
so skipping is the only way to leave the suite green. Every one of the five was
confirmed to fail today by unskipping it. Unskip with the fix.*

**Carried over from session 1, unchanged and still open:** the three
`package.json` `scripts` entries that unblock q1/q4/q6; the `/src` telemetry
seam for q5; the dead `{ k: 'equip' }` Command; and the three `dev` ops that
turn a NaN argument into permanently NaN run state.

1. **D1 — a single mis-typed array field destroys the whole account.**
   `migrate` (`src/meta/meta.ts:337`) spreads `[...(meta.allocated ?? …)]` and
   calls `(meta.stash ?? []).map(…)` with no `Array.isArray` check, so a save
   whose `allocated`, `stash`, `unlockedClasses` or `completedQuests` holds a
   number, a bool or an object throws straight out of the repair path;
   `loadMeta` catches and returns `defaultMeta()`. Thirteen shapes, listed in
   the test as `KNOWN_REJECTED`. The defaults for all four fields are already
   sitting in `base` two lines above — the repair is one guard per field, and
   without it the loss is total rather than local. `null` is safe everywhere
   (`??` catches it). A *string* is safe for the three spread fields, because
   strings are iterable — but **not** for `stash`, which uses `.map`:
   `{"stash":"seven"}` throws too, and `KNOWN_REJECTED` lists it. (QA corrected
   my first write-up here, which claimed strings were uniformly safe.)

2. **D2 — a mis-typed scalar is not a soft-lock, it is unlimited free
   Constellation points.** `migrate` does not check scalar types either, so
   `accountLevel: "seven"` reaches the live meta and `pointsAvailable` returns
   NaN. `canAllocate`'s guard is `if (pointsAvailable(meta) <= 0) return false`,
   and `NaN <= 0` is **false**, so the guard never fires. Measured on an account
   entitled to 3 points: **120 of the tree's 121 nodes allocated for nothing.**
   Twenty shapes, listed as `KNOWN_LAUNDERED`; three of them (`accountLevel` as
   string, array or object) also put a literal NaN on the Hub. `sanitize` in
   `src/ui/settings.ts:70` is the shape of the fix and is already in the
   codebase — the settings blob is fuzzed by the same file and there is nothing
   to file against it, which is the contrast worth reading.
   *Correction to my own first draft:* I originally wrote this up as "the tree
   is silently unusable". That is backwards, and code review caught it. It is
   filed here in the corrected form because a wrong mechanism in a bug report is
   worse than no bug report. *QA then narrowed it further:* the exploit is
   shape-dependent, not general. `accountLevel: "seven" | [1,2] | {a:1}` gives
   NaN and 120 free nodes; `accountLevel: null` gives **0** points and nothing
   allocatable — which is the soft-lock my first draft described, on a
   different shape; `accountLevel: true` gives 1 point where 3 were earned.
   Both mechanisms are real; the headline is the worst of them.

3. **D3 — a non-finite number in a save destroys Ember on the next save.**
   `1e999` is legal JSON, parses to `Infinity`, and `migrate` keeps it.
   `JSON.stringify(Infinity)` is `null`, so the very next save writes
   `"ember":null` and the player's Ember is gone. G18 asks for a save
   round-trip and this one does not survive its first.
   *Corrected after QA, twice over.* My first write-up said it "round-trips to
   a different save every time" and that the level goes 3 → 60 → 1. Measured:
   it **converges after exactly one re-save** (`s1 === s2`), so it is one lossy
   transition and then stable; and `migrate` never recomputes `accountLevel`
   from `ember`, so the *stored* level stays 3 across loads. The 60 was
   `accountLevelFor(Infinity)`, which is a real defect but belongs to D6.

4. **D4 — a duplicated node id in `allocated` is charged three times.**
   `pointsAvailable` counts `allocated.filter(id => id !== 0).length`, so
   `[0,1,1,1]` spends three points on one node. `isConnected` passes it because
   it works on a `Set`. Dedupe in the repair path.

5. **D5 — a damaged save *wrapper* is discarded with no error at all.**
   `deserializeMeta` (`src/meta/meta.ts:322`) returns `defaultMeta()` for
   `!parsed.meta` instead of throwing, so a save whose `meta` key is renamed,
   dropped or set to a scalar is thrown away without ever reaching `loadMeta`'s
   `catch`. Nothing could hang a log line, a telemetry event or a "your save
   could not be read" dialogue off it. The shipped 20,000-trial census scores
   **330** of these (1.65%), 259 of them via `rename-key`. This is the finding
   that made `wiped` a third outcome rather than a footnote.
   (The `80` in my first draft was the pre-fix figure from the review
   paragraph and did not get updated when `rename-key`'s no-op branch was
   fixed; QA re-measured it.)

6. **D6 — a non-numeric Ember buys a permanent level-60 account.** The severe
   half of D2, by a different mechanism. `accountLevelFor`
   (`src/meta/meta.ts:211`) loops `while (level < max)` and breaks on
   `ember < spent + cost`, which is **false** for NaN — so a non-numeric ember
   walks the loop to the cap. Measured: `accountLevelFor` returns **60** for
   NaN, Infinity, `'x'`, `[1,2]` and `{a:1}`, against 1 for `null` and for
   `-5`. Worse, `applyRunResult` (`:131`) does `next.ember += ember`, which
   *string-concatenates* when ember is a string, so an account loaded from
   `{"ember":"seven"}` banks `"seven115"`, stays non-numeric, and is written
   back with `accountLevel: 60` — a plain number by then, so nothing downstream
   ever notices. QA measured 60 free points and 60 nodes on run 1, unchanged on
   runs 2 and 3. Strictly worse than D2, whose NaN at least shows on the Hub.
   Two guards, both one line: a finite check in `accountLevelFor`, and a
   numeric coercion in the repair path.

7. **D7 — a laundered `highestTier` unlocks every map tier.** `src/ui/hub.ts:128`
   derives `Math.max(1, Math.min(5, meta.highestTier))`, which is NaN for a
   laundered tier, and the button gate below it is `t > maxTier` — **false for
   every `t`** when `maxTier` is NaN. QA verified it in the real Hub DOM: all
   five tiers enabled on a T1 account, for `highestTier` as string, array or
   object. `src/ui/main.ts:94`'s `startRun` does not clamp `cfg.tier` either, so
   the T5 run is genuinely played and paid at the T5 reward multiplier.
   (`null`/`true`/`false` clamp to 1 and are harmless.)

8. **D8 — the pin that exists to catch D7 could not see it.** Not a `/src`
   defect; a hole in this lane's own artifact, recorded because it is the
   reason D7 needed a human-shaped QA pass to find. `hubNumbers` reported only
   `pointsAvailable`, `stashCapacity` and `accountLevelFor`, so "no new field
   type puts a non-finite number in front of the player" listed three shapes
   and missed three more. **Fixed in this commit**: `hubNumbers` now carries the
   Hub's own tier-gate expression and `KNOWN_HUB_NAN` has six entries.

9. **D9 — `migrate` validates connectivity but never affordability.** A save
   naming all 121 tree nodes loads intact: `isConnected` passes and
   `pointsAvailable` clamps the deficit away with `Math.max(0, …)`, so a
   hand-edited save keeps the whole Constellation permanently. Same premise,
   same severity caveat and the same one-line home in the repair path as D4.

10. **D10 — `meta` as a *string* is neither repaired nor rejected.**
    `{"version":2,"meta":"abc"}` passes the `!parsed.meta` guard, spreads into
    `{"0":"a","1":"b","2":"c"}` over the defaults, and `checkMeta` reports
    nothing — those index keys then round-trip into every future save forever,
    which is the zombie-key problem t6c was written to kill. Folded into D5's
    skipped test as a fifth case, since it is the same guard.

*Not a defect, recorded because it is the counter-example the five above lean
on:* `src/ui/settings.ts` runs its parse through `sanitize`, and consequently
came through 3,000 corruptions with nothing to report — right key set, volumes
in [0,1], `maxDamageNumbers` an integer in [0,400], booleans boolean, and the
untouched fields still carrying their real values.

---

**What code review caught, and what it changed.** The first cut was green, ran
68,000 trials, and most of it could not have failed. Recorded in full because
this is the second session running in which that was true of the first cut:

- *The failure predicate could not fire for any input the fifteen families can
  produce.* All three of its terms — `crashed`, `violations`, `hubErrors` — are
  unreachable given `loadMeta`'s blanket `catch` and `migrate`'s
  spread-or-throw structure. Review demonstrated it with 28 hand-aimed hostile
  saves on top of the 65k-trial corpus. Fixed by adding the `changed`
  effectiveness counter and a per-family floor, which is what turned the next
  three findings red immediately.
- *`outcome` scored silent total account loss as `repaired`* — the single
  distinction the file exists to make. 80 of 15,345 "repaired" trials had
  returned a byte-identical `defaultMeta()` from a save carrying a full account.
  Now the third outcome, `wiped`, and filed as D5.
- *Three of the fifteen families were partly or wholly no-ops.* `version` was
  **100% ineffective**: the stamp's only reader is the `RETIRED_KEYS` strip and
  no generated save carried a retired key, so `survives 1,500 corruptions of
  family version` was 1,500 loads of an uncorrupted account. Fixed by putting
  v0.2-shaped saves in the corpus. `proto-key` never emitted a `__proto__` key
  at all — `target['__proto__'] = v` runs the `Object.prototype` setter, so it
  changes the prototype, creates no own property, and `JSON.stringify` drops it;
  20% of the family was a literal no-op. Now routed through a sentinel key and
  unquoted after stringifying. `rename-key`'s array branch returned its input
  unchanged 26% of the time and counted it as a corruption; it now climbs to the
  nearest object ancestor.
- *`laundered` compared shapes, so six coercions were invisible* —
  `unlockedClasses: "seven"` loads as five one-letter class names and
  `questProgress: "seven"` as five string-valued metrics — and none of them
  appeared in either pin, though the matrix is presented as the definitive
  record of what is broken today. Now a fourth class, `KNOWN_COERCED`.
- *D2's mechanism was backwards* (see above).
- *The file contained a raw NUL byte*, so git stored it as binary: no line diff,
  no blame, no textual merge. One character, and it would have shipped.
- *The settings block restated `sanitize` line for line* — it passed against
  `loadSettings = () => defaultSettings()`, i.e. against total loss of settings
  persistence. It now fuzzes a *non-default* settings object and asserts the
  untouched fields survive.
- Smaller: `checked === 600` counted calls rather than corruptions (the same
  shape as q2's `visited[0] === phase`); the anti-staleness pin covered two of
  the four lists and now covers all four; `byFamily` used `??=` on a plain
  object, which would silently return `Object` for a family named
  `constructor`; the 20k census was computed twice; and D1 and D4 each carried
  an assertion that already passes today.

**What QA caught on top of that.** Verdict **FAIL** on the first pass, for one
blocking reason plus two more holes of the same class review had just cleaned
out. Everything below is fixed in this commit and re-verified.

- ***`npm test` was red and I recorded it as green.*** The `legacySave` fixture
  named the deleted Orb currency's three sub-keys, and `tests/c7-no-orbs.test.ts`
  scans `src`, `data` **and `tools`** for exactly that vocabulary, deliberately
  and with no exemptions — an earlier exemption is how a real `orbPerElite`
  regression got through, which that file records. So the artifact turned a
  green gate red. The root cause of my *not noticing* is worth writing down: I
  ran `npm test 2>&1 | tail -20` and read the reported exit code, which is
  `tail`'s, not the suite's. **Read the summary line, never the exit code of a
  pipeline.** Fixed by giving the fixture a scalar value — the strip is keyed on
  the field name, so it exercises `RETIRED_KEYS` identically, and t6c already
  covers malformed values of that key — and by rewording the comment that
  explained it, which tripped the same scan on its own.
  *Request for main:* export `RETIRED_KEYS` from `src/meta/meta.ts` so this
  fixture tracks future retirements instead of hard-coding one key name.
- *The anti-vacuity counter had no anti-vacuity guard.* Hard-coding
  `changed: true` in the harness left all fifteen effectiveness floors passing —
  so the number the file's own header calls "the one that keeps this file
  honest" was itself untested. Now `the effectiveness counter itself can be
  false` pins both directions, and the mutation is killed.
- *`exerciseHub` could be hollowed out with nothing noticing.* Inserting an
  early `return errs` — disabling all ten Hub entry points across 20,000 loads —
  left the suite green, because no input any family produces can make one of
  them throw. `checkMeta` had a firing guard; its sibling did not. Now `the Hub
  exercise actually fires` hands it a meta whose `stash` is a scalar and asserts
  it names `equip` and `discard`, with the honest control returning `[]`. Both
  mutations verified killed by re-running them after the fix.
- *`version`'s effectiveness floor was the one that was not load-bearing.* QA
  measured every family: thirteen run 92.7–100% against a floor of 85, and
  `rename-key` 89.3 against 75 — so "a family could go 90% inert and stay green"
  is false for fourteen of fifteen. `version` measured 13.9 against a floor of 5,
  which left room for two thirds of its effect to vanish. Floor raised to 10,
  and the mechanism is now pinned directly rather than by rate: a new case
  asserts each legacy base carries exactly one retired key, that stamping it v1
  drops the key and stamping it current keeps it.
- *Three numbers in these bug reports were wrong* — D5's count, D1's claim about
  strings, D3's headline — and D2's was over-general. All four corrected above,
  in place, with what QA measured.
- *Two new `/src` defects, neither of which this fuzzer could have found as
  written*: D6 (`accountLevelFor` returns the cap for any non-numeric ember, and
  `applyRunResult` string-concatenates it into a permanent level-60 account) and
  D7 (a NaN `highestTier` unlocks every map tier, verified in the real Hub DOM).
  D7 is the one to learn from: the pin whose entire job is "no non-finite number
  in front of the player" was reading three numbers and the Hub derives four.
  Filed as D8 against this lane, and fixed here.
- Two smaller ones filed rather than fixed: D9 (allocation is checked for
  connectivity, never for affordability) and D10 (`meta` as a string loads as
  three index keys and round-trips forever).

QA's clean bill on the rest is worth recording too, because it is what the item
was actually for: 200,000 further corruptions across five unseen seeds, plus
duplicate JSON keys, lone and split surrogates, `\u0000` in strings and as the
whole document, `1e-323`, `5e-324`, `-0`, `9007199254740993`, a 100,000-deep
nested array, a 10 MB string value, a 100k-relic stash, a 200k-entry
`allocated`, and `getItem` returning a number, an object, a function, a Symbol
or a `toString` that throws — **no crash, no broken invariant, no Hub error, and
no `Object.prototype` pollution** in any of them. Two separate processes produce
byte-identical CLI output; `withSavedRaw` leaks nothing, including when `fn`
throws, when nested, and when a `localStorage` global already exists; and the
money paths (`b10-death-flow`, `b004-ember-survival`, `b003-stash-ux`,
`hub-testing`, `act1`, `act2`, `boss`, `progress`) are all green.

**Suite state at this commit, stated exactly.** `npx vitest run` — the half that
loads this file — is **700 passed / 71 skipped, exit 0**, C7 included. The perf
half (`npm run test:perf`, its own config) is **red**: A10's "full headless game
in under 5 s" measured 5379 / 5695 / 5843 ms. It is not this change. Proven, not
argued: `vitest.perf.config.ts` includes `tests/a10-performance.test.ts` and
nothing else, so neither new file is even collected there, and no `/src` or
`/data` file was touched — and moving both deliverables out of the tree entirely
reproduces the same failure (5379 / 5695 / 5843). The cause is CPU contention
from the *main checkout*: `D:\lidl_games` currently has five live node
processes, a `npm run dev` Vite server and a `qa-p1b-hashes.ts` sim run among
them. A10 was green here earlier today on the same commit base.
*Two things for main to take from this.* First, **A10 is a wall-clock assertion
with no host normalisation**, so it is unreliable whenever another lane is
working — which is exactly what q4 exists to fix (G17 asks for a
host-independent per-simulated-minute budget; A10 is the pre-G17 shape and q4 is
blocked on a `package.json` line). Second, this is the second time in one
session that a wall-clock number nearly got attributed to the wrong cause; the
control run is what settled it, per CLAUDE.md's measurement rules.

**Process, carried out from session 1's own note.** Review and QA were run in
series this time, not in parallel, and the artifact was frozen between them —
session 1's QA had verified against six on-disk versions of the harness, two of
which did not compile.

### 2026-08-26 — session 1

**Feedback inbox:** `feedback/` was empty; nothing to process, nothing moved.

**Worktree setup:** this worktree had no `node_modules`, so nothing here could
run. `npm ci` fixed it. `node_modules/` is gitignored, so this is not a Scope
edit and nothing is committed for it — but a fresh lane worktree needs it.

**Four of the six queued items are blocked by the lane's Scope boundary**, which
is worth stating plainly because it is most of the queue. Scope allows
`tests/**`, `tools/**`, `bench/**` and this file. It does not allow
`package.json`, and q1, q4 and q6 all name an `npm run <x>` alias in their
acceptance — a one-line `scripts` entry each. q5 is blocked harder: "every run
(human or bot) appends its end report" puts the write inside `/src`'s run or
meta path, which is not a one-liner and not ours.

*Bug reports / requests for the main lane, in merge order. Items 3 and 4 are
`/src` defects the fuzzer found; both are reproduced below and neither can be
fixed in-lane.*

1. **`package.json` needs three `scripts` entries** so this lane's harnesses are
   reachable the way their acceptance criteria describe:
   `"soak": "tsx tools/soak.ts"`, `"bench": "tsx bench/run.ts"`,
   `"mutations": "tsx tools/mutations.ts"`. None of the three targets exists
   yet; adding the aliases first is harmless and unblocks q1/q4/q6 in-lane.
   (Alternatively, main could widen this lane's Scope to include `package.json`
   `scripts` only — that is the smaller change and it has no merge surface with
   any other lane.)
2. **Telemetry (q5) needs a `/src` seam.** Suggest: `Run.report()` stays pure
   and a thin `src/meta` sink writes the JSON, so `/src/sim` keeps architecture
   rule 1. Cannot be started in-lane.
3. **BUG — `{ k: 'equip' }` is a Command with no handler.** `src/sim/types.ts:30`
   declares `| { k: 'equip'; relic: number }`, and `applyCommand`
   (`src/sim/run.ts:143`) has no `equip` case — it falls through to
   `default: break`. Verified: firing `{k:'equip',relic:0}` at an Act II world
   changes nothing, in any phase. So a twelfth of the player Command surface is
   dead. Architecture rule 3 says every player action is a Command; a declared
   Command that does nothing is the same class of defect from the other side.
   Either implement relic equipping or drop the member from the union — but the
   union is what the fuzzer enumerates, so leaving it costs coverage that reads
   as real. Needs a failing regression test first, per CLAUDE.md rule 3.
4. **BUG — three `dev` ops turn a NaN argument into permanently NaN run state.**
   `src/sim/run.ts:214` (`gold`), `:220` (`xp`) and `:246` (`fast_forward`) all
   guard with `Math.max(0, Math.round(amount))` or similar, and
   `Math.max(0, NaN)` is `NaN`. Reproduced against a fresh Act II world, one
   command each:
   `{k:'dev',op:'gold',amount:NaN}` → `gold=NaN`, `goldEarned=NaN`;
   `{k:'dev',op:'xp',amount:NaN}` → `xp=NaN`;
   `{k:'dev',op:'fast_forward',amount:NaN}` → `act2Time=NaN`.
   All three are permanent — nothing downstream cleans a NaN back out.
   Severity is limited by `applyDevCommand`'s `if (!w.cfg.practice) return`, so
   only a practice run can reach it, and a practice run banks nothing. But the
   fix is one `Number.isFinite` guard and the precedent is already in the
   codebase: `Stats.add` (`src/sim/stats.ts:143`) drops non-finite values for
   exactly this reason, citing m19a. The fuzzer deliberately does **not** assert
   against this — its generator stays inside each field's legal domain, so the
   suite stays green — and there is no queued item covering out-of-domain
   Command *arguments* (q3 is the save fuzzer). Worth its own item.

**q1 skipped, q2 executed.** Per the lane contract an item that needs an
out-of-Scope edit is logged and skipped rather than half-done, so q1 was not
started and q2 — which is entirely `tests/**` + `tools/**` — was taken instead.

**q2 done.** `tools/fuzz-input.ts` (harness + CLI) and
`tests/q2-input-fuzz.test.ts`.

- 10,000 seeded commands at each of the eight `Phase` values in
  `src/sim/types.ts`, generated from the whole `Command` union with arguments
  drawn from each field's legal domain, checked after every single command
  against `scanWorld`: finiteness plus the range each field is defined to keep,
  across gold, Core, Warden (position *and* the cooldowns that are the only
  state `class_active` writes), `Derived`, `Stats`, `boonRanks`/`soulLevels`
  (the whole output of `pick`), structures, enemies, projectiles and weapons.
- A second, deeper half plays whole runs with random commands riding in the tick
  input, so a corrupted value has a full run of updates to surface in, and then
  scans every number in the end report.
- Seed-reproducibility is asserted, not asserted-of: same seed → same
  `endHash`/`ticks`/`commands`, and a *different* seed → a different `endHash`,
  so the equality cannot pass by the generator ignoring its seed. `fuzzPhase`
  gets its own reproducibility case, because the failure contract
  ("seed + command index reproduce it") is a claim about that half.
- Cost ~14 s, ~4% of the suite budget. No `npm run` alias needed:
  `vitest.config.ts` already includes `tests/**/*.test.ts`, so it is in
  `npm test` as written. The CLI
  (`npx tsx tools/fuzz-input.ts --n 200000 --phase act2`) is there for deeper
  soaks than the suite should pay for.

**What code review caught, and what it changed** — the first cut was green and
three of its claims were false, which is the useful part of the record:

- *The `Stats` half of the scan checked nothing.* `Stats` keeps its
  contributions in a private `Map`, so `Object.entries(w.stats)` finds one Map
  and zero numbers; the loop could not fire. Now iterates `STAT_KEYS` and reads
  `total()`/`factor()`. (`Stats.add` already drops non-finite input, so this is
  a guard against overflow reaching a stat, not against NaN entering one.)
- *"No **negative**/NaN stat" was never asserted* — only finiteness was.
  `maxHp: -50` and `attackSpeedMul: 0` both passed. Now `DERIVED_POSITIVE` /
  `DERIVED_NON_NEGATIVE` name the fields with an unarguable range, plus
  `cdr < 1`. Deliberately not a blanket sweep: `armor` has a legal −100 floor
  (§17, still open) and every `...Bonus` is a signed delta.
- *Two phases were fuzzed nominally.* Letting the world drift meant `soulpick`
  absorbed **2** of its 10,000 commands and `dawn` **16**, because `souls` and
  `dawn_done` each end their phase and nothing re-entered it — and those are
  precisely the two phases the routing work exists to reach. `fuzzPhase` now
  counts only in-phase commands and re-enters via the sim's own transitions
  (`beginSoulPick`, `beginDawn`, `openLevelUpIfPending`, `takeOffer`), never by
  assigning `w.phase`. All eight phases now take the full 10,000.
- *`fuzzRun` played a cheated run.* It ran with `practice: true`, so ~1 command
  in 12 was a dev op: `god`/`invuln` switch the Warden and Core damage paths
  off and `fast_forward` teleports through Act II. Fuzzed runs ended in
  ~6.5k ticks against a ~22–45k control. Now the asserted runs use
  `practice: false` and assert a >10k tick floor, with a separate case keeping
  `practice: true` coverage of `applyDevCommand`.
- Two assertions that could not fail were replaced: `visited[0] === phase` (true
  by construction) is now `commands === 10000`, and the "guard against a new
  Phase" case now parses the `Phase` union out of `src/sim/types.ts` and
  compares — the old version compared two hand-written copies of the same list,
  and `npm test` never runs `tsc`, so nothing would have caught a new phase.
- The scan was then verified to actually fire: ten hand-injected corruptions
  (`stats` overflow, `maxHp: -50`, `attackSpeedMul: 0`, `cdr: 1.4`,
  `weaponSlots: -1`, `warden.activeCooldown: NaN`, `boonRanks: -5`,
  `soulLevels: NaN`, `wave: -3`, `gold: NaN`) were each caught and named.
- Cost note: re-entry made `act2` cost 18 s until `takeOffer` was drained in a
  loop — `takeOffer` ends with `openLevelUpIfPending`, so with level-ups queued
  it hands straight back to `levelup` and every re-entry fell through to a full
  run rebuild. Draining took it to 1.1 s.

**What QA caught on top of that.** Verdict PASS-with-defects, after 1.6 M
commands (200k × 8 phases at seed 7) plus 9 further seeds × 15k × 8, all clean,
and a cross-process reproducibility check (two separate processes, byte-identical
output). Fixed here:

- *The `Command` union had no drift guard, though `Phase` did* — the asymmetry
  was the point: a 13th Command member would have been silently never generated
  at full green. `COMMAND_KINDS` is now exported and the suite parses the union
  out of `src/sim/types.ts` and compares, the same way it already did for `Phase`.
  (Both regexes need `\r?` — the checkout is CRLF and the first `;\n` anchor
  matched nothing, which the new case caught immediately by failing.)
- *`scanWorld` was blind to fields the fuzzed commands write.* Added
  `pendingLevelUps` (written by `pick`, and by the harness's own re-entry),
  `buildTimer` (zeroed by `call`), `offers[].toLevel` (rewritten by `reroll`),
  structure `tx`/`ty` (placed by `build`), the Dusk/Dawn/soul-pick/spawn timers,
  `tick`, `emberEarned`, gems, ground areas and the per-wave arrays.
- *The anti-vacuity guard is now a test, not a one-off check.* `has an invariant
  scan that actually fires` poisons nine fields plus a `stats` overflow and
  asserts the scan names each one, then asserts the world is clean again. The
  `Stats` bug this file shipped in its first cut cannot silently come back.
- *CLI arg handling reported success for runs it never did.* `--n abc`, `--n 0`,
  `--n -5` and a missing value all printed `ok  dusk  0 cmds` and exited 0 — a
  CI wrapper with a typo'd variable would have read that as a pass. `--phase
  bogus` died with a raw `TypeError` from `cfgFor`, and `--seed abc` silently
  aliased to seed 0 while printing the seed the user asked for. All now exit 2
  with a usage message.
- *The two halves shared a seed constant* — `0x9e3779b1` *is* `2654435761`, so
  `fuzzPhase` and `fuzzRun` started from the identical generator state for any
  seed. Decorrelated.
- *Only the engineer was ever fuzzed*, and `class_active` dispatches on the
  class's `active.kind`. `fuzzRun` now takes a `classKey` and the suite loops
  whatever `/data/classes.json` holds, so coverage grows toward §13's eleven
  classes instead of staying pinned at one. All three current classes clean.

Two QA findings were **not** taken, with reasons:

- *Per-wave arrays and countdown timers.* Writing the obvious non-negative
  assertion for these produced failures on correct behaviour, twice. The
  `...ByWave` arrays are 1-based, so index 0 is a hole by design and reads
  `undefined`. The countdown timers are `t -= dt` until their phase reads them
  as expired, so they are *defined* to end one tick past zero — measured,
  `buildTimer` lands on −0.0167 and `duskTimer` on −3.2e-13 on every run. Both
  now check finiteness only, which is the invariant that actually holds (a NaN
  timer never compares `<= 0`, so its phase never ends). Filed here because
  "the plausible invariant" failing the control is exactly what CLAUDE.md's
  measurement rules warn about.
- *QA's process finding is accepted as mine.* It verified against six different
  on-disk versions of the harness because I was applying review fixes while it
  ran, and two of those snapshots did not compile. Its verdict is pinned to
  hashes that have since moved. Next lane session: freeze the artifact before
  requesting verification, or run review and QA in series, not in parallel.

*Observation for the main lane (not a bug, no action taken):* **the `soulpick`
phase is unreachable by every shipped bot.** `beginSoulPick` only opens the
picker when distinct candidate souls outnumber `derived.weaponSlots`;
`data/towers.json` has 7 distinct souls against 6 slots, but `maxbuild`,
`greedy` and `hybrid` all finish Act I with only 3–4 distinct souls, so every
bot run auto-binds and skips the phase outright. Consequence: no sim, sweep or
gate measurement has ever exercised `soulpick`, and a `soulpick` regression
would be invisible to the whole bot suite. The fuzzer reaches it by building one
tower per distinct soul at Dusk (`seedSoulSpread`). Worth a bot that spreads its
builds across tower types, if only so the phase is covered by something other
than this file.
