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
- [x] (q16) [feat] Content-totals census against SPEC-FINAL §13:
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
- [x] (q18) [bug][feat] Architecture rule 2's content-hash replay guarantee
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
- [x] (q19) [feat] Fast-forward bit-identity, named missing by gate-audit's G2
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
- [x] (q20) [feat] Mutation-probe list expansion: `tools/mutation-probe.ts`'s
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
- [x] (q21) [feat] Soul-weapon boundary fuzz for P5's two remaining pricing
      items — fuzz `data/weapons.json`'s 6-level tracks at their boundaries
      (level 0/1/6 transitions, the Awakening gate at Lv6 + boon rank 3,
      inheritance when a build has fewer distinct souls than weapon slots)
      confined to headless runs, recording which boundary the current system
      handles correctly vs. not, pinned q7/q15-style so a regression at any
      boundary goes red by name — acceptance: a pinned map in
      `tests/q21-weapon-boundary-fuzz.ts`, exercised green by
      `tests/q21-weapon-boundary-fuzz.test.ts` — refs: PROGRESS.md P5 audit
      line, M2 soul-weapons section
- [x] (q22) [bug][feat] QUALITY.md ALPHA's automated determinism line reads
      "100/100 replay hash match, including class actives and uniques," but
      `tests/a11-determinism.test.ts`'s 100-seed test drives every seed
      through `tests/helpers.ts`'s `makeInputLog`, which only ever emits
      movement/dash/attack input plus an occasional `{k:'call'}` — never a
      `{k:'class_active'}` or `{k:'equip', relic}` Command. The literal claim
      is untested for the two things it names by name — the same "note
      overstates the coverage it cites" shape q17/q19 already found twice in
      `tools/gate-audit.ts`'s own notes, found here in QUALITY.md's line
      instead — acceptance: a new determinism case drives seeded runs through
      an input log that also fires `class_active` (reachable per
      `tests/f004-class-framework.test.ts`'s live block) and `equip` for at
      least one relic across several seeds, asserting the same
      record-twice-compare-hash property `a11`'s existing test uses; if
      `equip`'s dead switch case (q15's filed bug) makes it a no-op rather
      than a state change, the test still asserts the hash match (determinism
      holds either way) and the CLI-visible gap is called out by name in the
      test's own comment rather than silently sidestepped — refs: QUALITY.md
      ALPHA determinism line, tests/a11-determinism.test.ts, q15's filed
      `equip` bug
- [x] (q23) [bug][feat] `tools/soak.ts`'s `soakOne` has two unguarded
      boundary inputs recorded but not filed at session 8 (BACKLOG-QUALITY.md
      session 8 log): `maxTicks <= 0` or a `scanEvery` of `0` (since `tick % 0`
      is `NaN` and the periodic-scan check never fires) reports a "clean"
      result for a run that was truncated to nothing or never scanned at all,
      and an unregistered policy name throws out of `makePolicy` before
      `soakOne`'s own `try` block, so it never surfaces through
      `SoakResult.threw` the way every other in-run exception does — a caller
      passing a bad policy name gets an uncaught exception instead of a
      readable `SoakResult`. Neither is reachable through the shipped CLI or
      `tests/q12-soak.test.ts` today (both only ever use the defaults and
      `shippedPolicies()`), but q20 just established the pattern of automating
      a recorded-not-filed gap once one exists, and `soakOne`'s own doc
      comment already promises "scanning the world every `scanEvery` ticks" —
      a `scanEvery: 0` call that silently never scans breaks that promise
      silently — acceptance: `soakOne` guards `maxTicks <= 0` and `scanEvery
      <= 0` as usage errors (thrown, not a fake-clean result) and wraps
      `makePolicy` inside its own `try` so an unregistered policy name comes
      back as `SoakResult.threw`, each guarded by a new regression test in
      `tests/q12-soak.test.ts` — refs: session 8 log, tools/soak.ts
- [x] (q24) [feat] Two small, recorded-not-filed gaps in
      `tools/fuzz-command-domain.ts` from session 11's QA pass: (1) `digest()`
      has no direct unit test — every Category A hole recorded today happens
      to also be caught by `scanWorld`, so a future Category A hole that
      `scanWorld` can't see would depend on `digest()` alone with nothing
      exercising it directly; (2) the CLI's `describeOutcome()` prints "no
      observable effect" for `dev.fast_forward.amount:fractional` even though
      `act2Time` visibly changes (100.5), because `digest()` doesn't track
      `act2Time` — the verdict is correct either way, only the human-readable
      detail string misleads for that one line — acceptance: a direct
      `digest()` unit test in `tests/q15-command-domain-fuzz.test.ts` proving
      it changes when `gold`/`coreHp`/`structures` etc. change and stays fixed
      otherwise, and `describeOutcome()` either tracks `act2Time` or names the
      fields it does *not* cover in its own "no observable effect" string so
      the message stops overclaiming — refs: session 11 log,
      tools/fuzz-command-domain.ts
- [x] (q25) [polish] `tools/content-census.ts`'s `main()` has no try/catch
      around `loadContent()` (session 13 QA, recorded not filed): a
      `/data` corruption failure would print a raw stack trace instead of a
      clean CLI message, and `--json` mode would emit nothing parseable —
      not reachable by anything shipped today, since `loadContent()` only
      throws on invalid `/data`, which the loader itself already guards
      against at every other call site, but every sibling CLI in this lane
      (`tools/gate-audit.ts`, `tools/phase-coverage.ts`, `tools/soak.ts`)
      handles its own failure path instead of leaving it to an uncaught
      throw — acceptance: `main()` wraps `loadContent()`/`census()`, prints a
      one-line error (or a `{error: string}` JSON object under `--json`) and
      exits nonzero instead of an uncaught stack trace, proven by a test that
      points the CLI at a deliberately invalid data snapshot — refs: session
      13 log, tools/content-census.ts
- [x] (q26) [feat] `tools/perf-ratio.ts`'s interleaved-measurement design
      (session 9) is proven only empirically — the wall-clock ceiling test
      shows the *outcome* is contention-tolerant, but nothing asserts the
      *mechanism* itself: that `measureRatioForWorld` actually alternates one
      calibration chunk with one tick rather than, say, running all
      calibration first. Session 9's own log named this explicitly ("no
      deterministic (non-timing) test proves the interleaving call order
      itself, only the empirical wall-clock outcome") and it is also why q20
      could not automate the sequential-vs-interleaved regression as a
      mutation-probe entry (see `tools/mutation-probe.ts`'s doc comment above
      `MUTATIONS`, added this session) — a call-order assertion would close
      that gap without depending on timing at all — acceptance: a test that
      instruments (spies on, or counts calls into) `calibrationWork` and
      `run.step` — or an equivalent call-order-recording seam added to
      `measureRatioForWorld` — and asserts the two interleave rather than
      run in two separate blocks, independent of wall-clock reading — refs:
      session 9 log, tools/perf-ratio.ts
- [x] (q27) [bug][feat] q21's QA pass found a sibling of the Awakening gate
      bug it pinned, in `applyOffer`'s `'weapon'` case
      (`src/sim/progression.ts:182-186`): `ws.level = Math.min(maxLevel,
      offer.toLevel)` clamps only the upper bound and never re-validates
      `offer.toLevel` the way `grantWeapon`'s own clamp does, so a hand-built
      `Offer` with `toLevel: NaN` sets `ws.level = NaN` and crashes the fire
      loop on the next tick — the identical failure mode as the already-pinned
      `level:nan`/`tier:nan` holes, just through a third entry point. A
      negative `toLevel` (e.g. -5) is latent rather than crashing today only
      because `levelStats`'s own read-time clamp happens to re-floor it.
      Same reachability caveat as q21's Awakening finding: `buildOfferPool`
      only ever emits `toLevel: ws.level + 1`, always a legal positive
      integer, so this needs a forged `Offer`, not a live Command-surface
      exploit — acceptance: extend `tests/q21-weapon-boundary-fuzz.ts`'s
      `AWAKENING_GATE_HOLES`-style pinning (or a new sibling const in the
      same file) with a `weapon:toLevelNan`/`weapon:toLevelNegative`-style
      pair of cases probing `applyOffer`'s `'weapon'` case directly, following
      the same `forcePlace`/`newWorld` harness pattern already in
      `tools/fuzz-weapon-boundary.ts`, and a named repro test alongside the
      existing "applyOffer applies an Awakening..." describe block — refs:
      q21 QA pass (session 17 log), src/sim/progression.ts:182-186
- [x] (q28) [bug][feat] q25's own commit note claims "every sibling CLI in
      this lane (`tools/gate-audit.ts`, `tools/phase-coverage.ts`,
      `tools/soak.ts`) handles its own failure path" — re-checked this
      session by reading each `main()` directly, and the claim is wrong for
      all three: `tools/gate-audit.ts:271-273`'s `main()` calls
      `readFileSync(SPEC_PATH, 'utf8')` with no try/catch; `tools/phase-
      coverage.ts:98-103`'s `main()` calls `census(shippedPolicies(), ...)`
      with no try/catch, and `census`→`censusOne`→`reachedPhases` constructs
      a `Run`/`World` (hence calls `loadContent()`) before anything catches;
      `tools/soak.ts`'s `soakOne` (q23's own guard target) constructs
      `new Run(cfg)` at line 81 — one line *before* its own `try` at line
      86 — so a `/data` load failure there is just as uncaught as the other
      two, q23's guards notwithstanding. All three would crash with a raw
      stack trace and (under `--json`) print nothing parseable, the exact
      shape q25 fixed for `tools/content-census.ts` — the same "a note
      overstates the coverage it cites" trap this lane has now found four
      times (q17, q19, q22, and this) — acceptance: each of the three
      `main()`s wraps its `/data`-load-reachable call in a try/catch that
      prints a one-line error (or `{error}` JSON under `--json`) and sets
      `process.exitCode = 1`, matching `content-census.ts`'s pattern exactly,
      proven by a test per file that points it at a corrupted scratch `/data`
      snapshot the way `tests/q25-content-census-cli.test.ts` already does —
      refs: q25, tools/gate-audit.ts, tools/phase-coverage.ts, tools/soak.ts
- [x] (q29) [bug][feat] `src/sim/weapons.ts`'s `grantWeapon` has two branches
      and only one is guarded: the create branch (no existing `WeaponState`)
      clamps `level` to `[1, maxLevel]` (q21 already fuzzed this one), but
      the *update* branch (`existing` found, lines 62-66) does
      `existing.level = Math.max(existing.level, level)` with no clamp and
      no finite guard at all — a `level: NaN` or `level: Infinity` passed to
      an *update* call silently contaminates an already-bound weapon's level
      (`NaN` propagates into the next `Math.max` update forever), the same
      "crashes the fire loop on the next tick" failure mode q21/q27 already
      pinned, through a fourth entry point. Reached through `bindSouls`
      (`src/sim/progression.ts:292-296`, called by the `souls` Command) or
      `applyOffer`'s `'weapon'` case (q27) when either passes an
      out-of-domain `level`/`damageBonus` to an *already-granted* weapon —
      not reachable via the real Command surface today (`bindSouls`'s own
      inputs are always legal integers) — acceptance: a
      `weapon:updateLevelNan`-style case added to
      `tests/q21-weapon-boundary-fuzz.ts`'s pinned map that calls
      `grantWeapon` twice (once to create, once to update with a poisoned
      value) and asserts today's actual behaviour (contamination or crash,
      whichever it measures), exercised by
      `tests/q21-weapon-boundary-fuzz.test.ts` — refs: q21, q27,
      src/sim/weapons.ts:61-79
- [x] (q30) [bug][feat] `applyOffer`'s `'boon'` case
      (`src/sim/progression.ts:187-196`) has *zero* validation of
      `offer.toLevel` — unlike the `'weapon'` case (q27), which at least
      clamps the upper bound, `w.boonRanks[b.key] = offer.toLevel;` assigns a
      forged offer's value straight through with no clamp, no finite check,
      nothing. That value then flows into `w.stats.addAll(...)` (the shared
      stat pipeline every stat consumer reads) and into the determinism hash
      (`src/sim/run.ts:658`, `h.int(w.boonRanks[k])`) with a
      `boonRanks[key]` of `NaN`/`Infinity`/negative — worth knowing whether
      the hash function chokes on a non-finite `int()` input or silently
      produces a degenerate hash, either of which is worse than the weapon
      case since there is no partial clamp acting as a safety net at all.
      Same reachability caveat as q21/q27/q29: `rollOffers`/`buildOfferPool`
      only ever emit a legal `toLevel`, so this needs a forged `Offer` — not
      a live Command-surface exploit — acceptance: a
      `boon:toLevelNan`/`boon:toLevelNegative`/`boon:toLevelInfinite`-style
      set of cases added to `tests/q21-weapon-boundary-fuzz.ts`'s pinned map
      (or a new sibling const, since this is a different offer kind),
      probing `applyOffer`'s `'boon'` case directly and recording what
      `h.int()` actually does with the poisoned value, exercised by
      `tests/q21-weapon-boundary-fuzz.test.ts` — refs: q27, q29,
      src/sim/progression.ts:187-196, src/sim/run.ts:658
- [x] (q31) [feat] Mutation-probe coverage gap: `tools/mutation-probe.ts`'s
      `MUTATIONS` list (10 entries as of q20) has zero entries for the two
      most recent guard-shaped fixes this lane has landed —
      `tools/soak.ts`'s q23 `maxTicks`/`scanEvery` boundary guards and
      `tools/content-census.ts`'s q25 try/catch — so a future accidental
      revert of either guard (someone "simplifying" `soakOne`'s top or
      `content-census.ts`'s `main()`) would ship silently, caught by neither
      the mutation-smoke suite nor (per q28, if q28 hasn't landed yet when
      this runs) any other automated check — acceptance: `MUTATIONS` grows
      by at least two entries (one per fix), each reverting the guard/
      try-catch to its pre-fix shape, targeting `tests/q12-soak.test.ts`'s
      q23 describe block and `tests/q25-content-census-cli.test.ts`
      respectively, each `source` naming this item the way q20's entries
      name their sessions, and `tests/q14-mutation-smoke.test.ts` runs the
      expanded list green — refs: q20, q23, q25, tools/mutation-probe.ts
- [x] (q32) [feat] `bindSouls` (`src/sim/progression.ts:266-296`) turned out,
      on inspection while filing q29, to already be safe against a case that
      looked at first like a bug: the `souls` Command's `keys` array is
      never deduplicated (`applyCommand`'s `'souls'` case just filters
      against `soulCandidates`, `src/sim/run.ts:164-169`), so a hand-crafted
      `{k:'souls', keys:['ballista','ballista']}` reaches `bindSouls` with a
      duplicate key — but `grantWeapon`'s create-vs-update branch (see q29)
      finds the existing `WeaponState` by key on the second call and updates
      it in place rather than pushing a second entry, so no duplicate
      `WeaponState` for one weapon key is possible this way. That safety net
      is exactly what stops a duplicate-key `souls` Command from being a
      fifth, independent hole here — worth pinning as a positive/negative
      control now that three related holes (q21, q27, q29) sit right next
      to it, the same "prove the real path stays clean" pattern q21's own
      review added for `rollOffers` — acceptance: a regression test (in
      `tests/q21-weapon-boundary-fuzz.test.ts` or a small addition to an
      existing weapons/progression test file already in Scope) that drives
      a real `souls` Command with a duplicated valid key through
      `applyCommand` and asserts `w.weapons` contains exactly one
      `WeaponState` for that key, so a future change to either `grantWeapon`
      or the `souls` case that reintroduces duplication is caught by name —
      refs: q29, src/sim/progression.ts:266-296, src/sim/weapons.ts:61-79
- [x] (q33) [bug][feat] qa-playtester's q28 verification pass found a sibling
      gap q28 itself doesn't close: q28 (and q25 before it) only catch
      *schema* violations in `/data/*.json` (a value of the wrong type,
      caught by `loadContent()`'s zod parse at runtime) — a JSON *syntax*
      error (e.g. a stray unclosed brace) crashes all four lane CLIs
      (`content-census.ts`, `gate-audit.ts`, `phase-coverage.ts`, `soak.ts`)
      with a raw, uncaught esbuild `TransformError` stack trace that no
      `main()`-level try/catch can intercept, because `/data/*.json` is
      loaded via a static ES module `import` in `src/sim/content.ts`, which
      is transformed and evaluated at module-load time — *before* any of
      `main()`'s code, including every try/catch q25/q28 added, ever runs.
      Live repro (QA's session): overwrite `data/towers.json` with
      `{ not valid json` (not a schema violation, a syntax error) and run
      any of the four CLIs — each crashes with a multi-frame stack trace
      instead of the one-line message q25/q28 established as this lane's
      own bar for a `/data`-load failure. Not a regression introduced by
      q28 — it was already true of `content-census.ts` at q25 — but it is a
      real gap in the "clean CLI error" pattern this lane has now built out
      across four tools, worth closing rather than leaving as a silent
      asterisk on q25/q28's own acceptance claims — acceptance: a new test
      (e.g. `tests/q33-cli-json-syntax-error.test.ts`, reusing the scratch-
      copy idiom already common to q25/q28) that writes syntactically
      invalid JSON to a `/data` file and runs each of the four lane CLIs
      against it, recording today's actual behaviour (crash) if this proves
      genuinely unfixable from this lane's Scope — dynamic `import()` of a
      pre-validated string read via `readFileSync`/`JSON.parse` inside
      `loadContent()` would fix it at the source, but `src/sim/content.ts`
      is outside this lane's Scope (`/src/**`), so if the root cause can't
      be moved, the acceptance line is to *pin* the gap precisely (which of
      the four CLIs, what today's exact failure looks like) the way q18
      pins the content-hash-replay gap, and file the `/src/sim/content.ts`
      fix as main-lane work in this file's Log — refs: q25, q28, qa-
      playtester's q28 verification pass (session 23 log)
- [x] (q34) [bug][feat] `grantWeapon`'s `damageBonus` parameter
      (`src/sim/weapons.ts:61-79`) is unguarded in **both** branches — worse
      than q29's `level` finding, since the create branch does a bare
      assignment (`damageBonus,`) with no clamp at all, and the update
      branch's `Math.max(existing.damageBonus, damageBonus)` propagates a
      non-finite value the same way the `level` update branch does. Unlike
      every `level`-shaped hole this file has pinned so far (q21/q27/q29,
      which either crash the fire loop or get re-floored by `levelStats`'s
      read-time clamp), a poisoned `damageBonus` produces **silent,
      permanent, non-crashing corruption with no observable signal
      anywhere**: `weaponDamageMul`'s `(1 + ws.damageBonus)` feeds `damage`
      into `damageEnemy`, whose own guard (`if (e.dead || amount <= 0)
      return 0`, `src/sim/enemies.ts:200`) does not catch `NaN` (`NaN <= 0`
      is `false`), so `e.hp -= NaN` sets the enemy's hp to `NaN` forever — it
      can never die again, since every future `e.hp <= 0` check is also
      `false` — and `w.damageTotal`/`w.damageByWeapon[source]` go `NaN` for
      the rest of the run. It does not even register as a hash anomaly:
      `Hasher.num()`/`int()` (`src/sim/hash.ts`) use `v | 0`, which silently
      coerces `NaN` to `0`, so a replay comparison would read this as
      "looks like zero damage" rather than flag a divergence. QA reproduced
      live, twice, with identical results, while verifying q29 — grepped
      `BACKLOG-QUALITY.md`/`tests/` for `damageBonus` first to confirm this
      isn't already covered by q29 (level only) or q30 (boon ranks, a
      different field) — acceptance: a 6th `BoundaryCase` category (e.g.
      `'damageBonus'`) added to `tools/fuzz-weapon-boundary.ts` fuzzing
      `grantWeapon`'s `damageBonus` argument on both branches with the same
      `{0, negative, ±Infinity, NaN, fractional}` domain q21/q29 already use
      for `level`, a `DAMAGE_BONUS_HOLES` pinned map in
      `tests/q21-weapon-boundary-fuzz.ts` recording today's actual measured
      behaviour, and a describe block in `tests/q21-weapon-boundary-fuzz.test.ts`
      that spawns a real enemy and drives `updateWeapons` far enough to
      observe `e.hp`/`w.damageTotal` going non-finite — not just
      `ws.damageBonus` itself, since that alone doesn't prove the downstream
      corruption — refs: q29, q30, qa-playtester's q29 verification pass
      (session 25 log), src/sim/weapons.ts:61-79, src/sim/enemies.ts:200,
      src/sim/hash.ts
- [x] (q35) [bug][feat] Fuzzing q30's `applyOffer` `'boon'` case surfaced a
      more general gap in `Rng.weightedIndex` (`src/sim/rng.ts:65-75`) itself,
      not specific to boons: if any candidate's weight is `NaN` (reachable
      here via `buildOfferPool`'s `value: rank / b.maxRank` when a poisoned
      `boonRanks` entry is `NaN`, `progression.ts:139`), `weightedIndex`'s
      `total` sum goes `NaN`, every `r < 0` scan comparison during the pick
      loop is therefore `false`, and the function falls through to
      `return weights.length - 1` — deterministically the *last* remaining
      candidate, every call, regardless of the RNG stream. Measured while
      building q30: two consecutive `rollOffers` calls against a `NaN`-
      poisoned pool return byte-identical results, which a fair weighted draw
      never would. q30's own tests only observe this indirectly (the
      poisoned boon itself never wins, as a side effect of always losing to
      whatever pool entry sits last) — nothing pins the mechanism directly
      against `weightedIndex` in isolation, and nothing checks whether a
      `NaN` weight can arise from a source *other* than a forged boon offer
      (a corrupted `Luck` stat feeding `luckBias`, per `rollOffers`'s own
      `luckBias * o.value` term, looks like the most plausible other one —
      unconfirmed, not yet traced) — acceptance: a direct unit test of
      `Rng.weightedIndex` (no `World`/`applyOffer` involved) that passes a
      weights array containing one `NaN` alongside finite values and pins
      today's actual fallback behaviour (always the last index, independent
      of the RNG stream/seed), plus a check of whether `luckBias` can itself
      go non-finite through any real, in-domain `Luck` stat value — refs:
      q30, src/sim/rng.ts:65-75, src/sim/progression.ts:90 (`luckBias`),
      139 (`value: rank / b.maxRank`)
- [x] (q36) [bug][feat] qa-playtester's q32 verification pass found a real
      sibling gap to q32's own positive-control finding: q32 proved a
      duplicate key in a hand-crafted `souls` Command never creates a second
      `WeaponState` (`grantWeapon`'s create-vs-update branch collapses it),
      but neither `applyCommand`'s `'souls'` case (`src/sim/run.ts:164-169`,
      `valid.slice(0, w.derived.weaponSlots)`) nor `bindSouls`'s own
      `chosen.filter(...).slice(0, slots)` (`src/sim/progression.ts:270`)
      dedupes *before* counting toward the `weaponSlots` cap — so a
      duplicate entry silently consumes a pick slot instead of being
      rejected or deduped. QA measured live: with `weaponSlots = 6` and 7
      valid candidates, submitting 6 keys where one is a repeat (5 distinct)
      binds only 5 souls, not 6 — a real, reproducible behaviour gap, one
      slot quietly wasted per duplicate. Same reachability caveat as q32
      itself: `w.soulCandidates` is built from a `Map` keyed by soul string
      (`deriveSouls`, `src/sim/progression.ts:234-254`) so it can never
      itself contain a duplicate, and both real callers of the `souls`
      Command (`src/ui/hud.ts:495`'s `Set`, `src/bots/policies.ts:258-273`'s
      direct map over `soulCandidates`) cannot produce one either — this
      needs a hand-crafted `Command`, not a live Command-surface exploit —
      acceptance: a regression test near `tests/q21-weapon-boundary-fuzz
      .test.ts`'s soul-pick boundary describe block (or a small sibling to
      q32's new positive-control block) that drives a real `souls` Command
      with a duplicate key among otherwise-distinct candidates through
      `applyCommand`, asserting today's actual measured behaviour (fewer
      souls bound than `weaponSlots` when a duplicate consumes a slot) so a
      future dedupe fix is visible as a test change rather than silent —
      refs: q32, qa-playtester's q32 verification pass (session 30 log),
      src/sim/run.ts:164-169, src/sim/progression.ts:270
- [x] (q37) [bug][feat] qa-playtester's q33 verification pass (session 31)
      found the same uncaught-crash mechanism q33 pinned for the four lane
      CLIs also hits three tools q33 never covers — `tools/sim.ts`,
      `tools/sweep.ts` and `tools/handoff-metrics.ts`, all three commands
      CLAUDE.md's own "Stack & commands" section documents as the headline
      entry points (`npm run sim -- --seed 1 --policy hybrid`,
      `npx tsx tools/sweep.ts --seeds 12 --policies maxbuild,hybrid`,
      `npx tsx tools/handoff-metrics.ts`) — so this is arguably a
      higher-traffic instance of the same gap than the four q33 already
      named. Session 31's QA pass live-reproduced all three directly (scratch
      copy, corrupted `data/towers.json`, torn down after): each crashes with
      the identical raw, multi-frame `Error: Transform failed with 1 error`
      stack trace q33 pinned for `content-census.ts`/`phase-coverage.ts`/
      `soak.ts`, and none of the three ever had a q25/q28-style try/catch to
      begin with (grepped: no `catch` in any of the three), so this is not a
      regression, just an always-open instance of the same architectural gap.
      QA did not exhaustively check the remaining `tools/*.ts` files that
      also transitively import `src/sim/content.ts` (`invariants.ts`,
      `fuzz-*.ts`, `mutation-probe.ts`, `perf-ratio.ts`, `probe-boss.ts`,
      `a4probe.ts`, `a5probe.ts`, `m20d-*.ts` per a grep census) — reported
      only what was actually measured live, so more siblings may exist
      beyond these three — acceptance: a sibling test (e.g.
      `tests/q37-cli-json-syntax-error-siblings.test.ts`) reusing q33's
      scratch-copy idiom, pinning today's crash for `sim.ts`, `sweep.ts` and
      `handoff-metrics.ts` the same way `tests/q33-cli-json-syntax-error
      .test.ts` pins it for the other three; the underlying fix is the same
      out-of-Scope `src/sim/content.ts` change q33 already filed for main
      lane (see this file's session 31 Log entry for the filing; q38 for the
      one CLI where a smaller in-Scope workaround is also possible) — refs:
      q33, q38, qa-playtester's q33 verification pass (session 31 log),
      tools/sim.ts, tools/sweep.ts, tools/handoff-metrics.ts
- [x] (q38) [feat] Session 31's QA pass, while verifying q33, tested — rather
      than assumed — whether the "root cause can't be moved, only pinned"
      framing q33/q37 both carry is actually true for every affected CLI. It
      is not, for one of them: a scratch-copy experiment on
      `tools/content-census.ts` (type-only `import type { Content } from
      '../src/sim/content'` plus replacing the static `loadContent` import
      with a dynamic `const { loadContent } = await import(...)` call inside
      `main()`'s own existing try/catch) fully closes the gap with **zero**
      `/src/**` changes — verified live: a syntactically corrupted
      `data/towers.json` now produces the same one-line `content-census:
      Transform failed with 1 error: ...` message (plain mode) or a single
      parseable `{"error": "..."}` line (`--json` mode) that q25/q28 already
      established as this lane's bar, instead of the raw uncaught stack
      trace. The same trick does *not* extend cleanly to `phase-coverage.ts`
      or `soak.ts`: both call `Run`/`makePolicy` from inside multiple
      exported, synchronously-called functions that existing tests already
      call as plain sync functions (`soakOne`/`soak`/`shippedPolicies`;
      `reachedPhases`/`censusOne`/`census`), so making the import dynamic
      would force those functions `async` — a breaking signature change
      rippling into `tests/q12-soak.test.ts` and friends — a materially
      larger refactor QA time-boxed rather than built. Net: filing the
      `src/sim/content.ts` fix as main-lane work (per q33/q37) is still the
      right long-term call — it fixes the problem once instead of a
      bespoke, only-partially-applicable patch per CLI — but
      `content-census.ts` specifically has a working, in-Scope, low-risk
      interim fix available today — acceptance: apply the verified
      type-only-import + dynamic-`loadContent()`-import pattern to
      `tools/content-census.ts` for real (not scratch), confirm
      `tests/q25-content-census-cli.test.ts` still passes unchanged and
      `tests/q33-cli-json-syntax-error.test.ts`'s `content-census.ts` cases
      flip from "crashes uncaught" to "clean one-line message" (test update
      required — today's assertions pin the *broken* behaviour), `tsc`
      clean, no `/src/**` edits — refs: q33, q37, qa-playtester's q33
      verification pass (session 31 log), tools/content-census.ts
- [x] (q39) [bug][feat] qa-playtester's q35 verification pass found that
      `Stats.add`'s finite guard (`src/sim/stats.ts:148`) protects only
      against a *single* non-finite contribution — it checks the incoming
      value, not the running sum — so two contributions that are each
      individually finite can still overflow `total()`/`factor()`'s
      summation loop to `±Infinity`, with nothing downstream catching it.
      Measured live: `s.add('relic:1','luck',1.5e308); s.add('relic:2',
      'luck',1.5e308); s.total('luck')` is `Infinity` (`1.5e308` alone passes
      `Number.isFinite` cleanly). Worse in the negative direction:
      `derive()`'s `luck: s.total('luck')` has no clamp, so two `-1.5e308`
      contributions make `derived.luck = -Infinity`, and
      `progression.ts:89`'s `luckBias = Math.min(0.5, w.derived.luck *
      0.004)` clamps the *positive* overflow case down to 0.5 (masking it)
      but does nothing for `-Infinity`, so a `-Infinity` `luckBias` reaches
      `rollOffers`'s `weight * (1 + luckBias * o.value)` uncaught —
      reproducing q35's own NaN/Infinity-total `weightedIndex` fallback
      through a second, previously-untraced vector. Reachability: QA traced
      a real, currently-unvalidated delivery path — `src/meta/meta.ts:322`'s
      `deserializeMeta` does `JSON.parse(json) as Partial<SaveFile>` with
      **zero zod/schema validation**, so a hand-edited save with two stash
      relics carrying an affix `{"stat":"luck","value":1.5e308}` round-trips
      unchanged and would carry the poisoned values straight into a real
      run's `Stats` via `relicStats()` → `Stats.addAll`. Separately,
      `src/sim/content.ts:380-387`'s `AffixSchema` uses `num = z.number()`
      for `min`/`max` with no `.finite()`/upper-bound check, so the same
      class of value is authorable in `/data` content directly, not only via
      a corrupted save. Both fixes (`Stats.add`/`total()` guarding the
      running sum, `AffixSchema` bounding affix values, `deserializeMeta`
      validating against a schema) are `/src/**` changes outside this lane's
      Scope — acceptance: file confirms today's overflow behaviour is
      already pinned by `tests/q35-weighted-index-nan.test.ts`'s "gap found
      by QA verification" describe block; this item is the tracking entry
      for main lane to apply one or more of the three `/src/**` fixes above,
      then this lane can add a regression test proving the guard holds
      post-fix — refs: q35, qa-playtester's q35 verification pass (session
      32 log), src/sim/stats.ts:148,182-188, src/sim/progression.ts:89,
      src/meta/meta.ts:322, src/sim/content.ts:380-387
- [x] (q40) [bug][feat] Mutation-probe coverage gap, sibling of q31's own:
      q28 landed three try/catch guards (`tools/gate-audit.ts`'s `main()`,
      `tools/phase-coverage.ts`'s `main()`, and `tools/soak.ts`'s `new
      Run(cfg)` moved inside its own `try`, one line earlier than q23's own
      guards), but `tools/mutation-probe.ts`'s `MUTATIONS` list only reverts
      q23's `soakOne` boundary guards and q25's `content-census.ts`
      try/catch — q31's own text names only those two, and grepping
      `mutation-probe.ts` for `gate-audit`/`phase-coverage`/a line-81-style
      reversion this session finds none — so q31 closed q23/q25's gap but
      never covered q28's own three guards, the identical "a guard-shaped
      fix lands with no matching mutation" shape q31 exists to close, one
      fix-generation later — acceptance: `MUTATIONS` grows by three entries
      reverting each of q28's three guards to its pre-fix shape (each
      `source` naming this item), targeting the relevant describe blocks in
      `tests/q28-cli-error-handling.test.ts` and `tests/q12-soak.test.ts`,
      exercised green by `tests/q14-mutation-smoke.test.ts` — refs: q28,
      q31, tools/mutation-probe.ts
- [x] (q41) [feat] CLI-crash pinning gap, sibling of q33/q37: q37's own log
      named the caveat explicitly ("QA did not exhaustively check the
      remaining `tools/*.ts` files that also transitively import
      `src/sim/content.ts`... more siblings may exist beyond these three").
      Grepped every remaining CLI-invokable tool (one with a direct-
      invocation entry point, not just a library module) this session:
      `perf-ratio.ts`, `a4probe.ts` and `a5probe.ts` have zero `catch`
      anywhere in the file; `mutation-probe.ts`, `fuzz-input.ts`,
      `fuzz-save.ts`, `fuzz-weapon-boundary.ts` and `fuzz-command-domain.ts`
      each have `catch` blocks elsewhere (guarding unrelated per-command or
      git-shell failures), but none of those can help here either, for the
      same root-cause reason q33 already established: the crash is a static
      ES-module `import` transformed at module-load time, before any of a
      file's own code — try/catch included — ever runs. Not yet live-
      verified for any of these eight; that verification is this item's own
      first step, per this lane's "run it before pinning it" convention —
      acceptance: for each of the eight tools, either a live repro joins
      q33/q37's scratch-copy suite (a new
      `tests/q41-cli-json-syntax-error-siblings-2.test.ts` or an extension
      of `tests/q37-...`) pinning today's crash, or — if a tool turns out
      not to load `/data` at module scope the way `gate-audit.ts` doesn't —
      the file records why it's exempt, matching `gate-audit.ts`'s own
      carve-out in `tests/q33-cli-json-syntax-error.test.ts` — refs: q33,
      q37, tools/perf-ratio.ts, tools/a4probe.ts, tools/a5probe.ts,
      tools/mutation-probe.ts, tools/fuzz-input.ts, tools/fuzz-save.ts,
      tools/fuzz-weapon-boundary.ts, tools/fuzz-command-domain.ts
- [x] (q42) [feat] Session 35's own log records a non-blocking QA
      observation that was never promoted to an item: `tests/q37-cli-json-
      syntax-error-siblings.test.ts` has no `--json`-flag variant the way
      `tests/q33-cli-json-syntax-error.test.ts` does for its three tools —
      `sim.ts`/`handoff-metrics.ts` have no such flag, but `sweep.ts`'s
      `--json` path is untested against the JSON-syntax-error crash. QA's
      note judged this "almost certainly crashes identically, since the
      crash precedes `argv` inspection, but unverified" — an assumption
      resting on the same reasoning q33 already proved for its own three
      tools, not yet proved for `sweep.ts` specifically — acceptance: a
      `sweep.ts --json` case added alongside q37's existing describe.each
      block (or a small sibling test), run live first per this lane's
      convention, pinning today's actual measured behaviour — refs: q37,
      session 35 log, tools/sweep.ts
- [x] (q43) [polish] `tools/mutation-probe.ts`'s own doc comment states a
      running total of mutation count / distinct `testFile` count /
      invocation count (q31's commit note records manually recounting
      these rather than trusting the comment, the same defensive habit
      this lane has needed at least five times now — q17, q19, q22, q28,
      q35 each found a note that overstated the coverage it claimed).
      Nothing currently *automates* that check — a future entry added
      without updating the doc comment's totals would silently drift, the
      same trap category recurring a sixth time, just in this file's own
      header instead of `gate-audit.ts`'s `KNOWN_HOLES` — acceptance: a
      test (in `tests/q14-mutation-smoke.test.ts` or a small sibling) reads
      `tools/mutation-probe.ts`'s doc-comment totals and the real
      `MUTATIONS` array/derived `testFile` set at runtime and asserts they
      agree, so a future addition that forgets to update the comment goes
      red by name instead of silently rotting — refs: q17, q19, q22, q28,
      q31, q35, tools/mutation-probe.ts
- [x] (q44) [feat] Flake-cluster root-cause dig: `tests/q15-command-domain-
      fuzz.test.ts`'s "worker-timeout under full-suite contention" flake has
      now been recorded, isolate-rerun-confirmed-green, and *not* filed as a
      bug across at least six sessions (8, 9, 11, 13, 15, 34 by this file's
      own log — grep `contention`/`flake` for the full list), always with
      the same read: non-reproducible in isolation, therefore noise. CLAUDE.md's
      own measurement rules name exactly this shape ("a deferral is a
      measurement with an expiry date... re-measure... before inheriting
      it") — six sessions of the identical unexamined conclusion is long
      enough that the conclusion itself, not just the flake, is due for a
      check: is it actually pure resource contention (worker pool
      starvation under N parallel nested `tsx` invocations), or is some
      real timeout/leak in `fuzz-command-domain-worker.ts`'s worker
      lifecycle masked by every prior session re-running rather than
      instrumenting? — acceptance: a session actually instruments the
      failure (e.g. runs the full suite with worker-pool logging, or
      isolates the minimal set of concurrently-running files that
      reproduces it) rather than re-running it green and moving on, and
      either files a real bug with a mechanism (not just a repro) or
      records, for the first time with actual evidence rather than a
      pattern-match to prior sessions, why it is structurally guaranteed to
      be contention and not a leak — refs: sessions 8/9/11/13/15/34 logs,
      tests/q15-command-domain-fuzz.test.ts, tools/fuzz-command-domain-
      worker.ts
- [x] (q45) [bug][feat] A second, distinct CLI-crash mechanism, never
      checked before this session: every q33/q37/q41/q42 test corrupts
      `/data` with a JSON *syntax* error (`{ not valid json`), which fails
      at ES-module *transform* time — before any of a file's own code, try/
      catch included, ever runs (the load-bearing reason those fixes all
      live outside this lane's Scope, in `src/sim/content.ts`). A *schema*
      violation — valid JSON, wrong shape — is a different animal:
      `loadContent()`'s zod `.parse()` throws its `ZodError` at **runtime**,
      inside `loadContent()`'s own call, which a caller's try/catch *would*
      catch if one existed. Verified live this session: a scratch copy's
      `data/towers.json` with `towers[0].cost` set to the string
      `"not-a-number"` (valid JSON, invalid schema) crashes
      `tools/m20d-run-a4.ts` with an uncaught multi-line `ZodError` dump and
      a raw stack frame through `loadContent` (`at ZodObject.parse
      .../zod/v3/types.js`, `at loadContent (.../src/sim/content.ts:858)`) —
      because `m20d-run-a4.ts`, like q41's seven **content-importing**
      siblings (`perf-ratio.ts`, `a4probe.ts`, `a5probe.ts`, `fuzz-input.ts`,
      `fuzz-save.ts`, `fuzz-weapon-boundary.ts`, `fuzz-command-domain.ts` —
      q41's eighth tool, `mutation-probe.ts`, is a confirmed **exception**:
      its own `tests/q41-cli-json-syntax-error-siblings-2.test.ts` describe
      block proves it imports none of `src/sim/content.ts`/`Run`/`World`/
      `loadContent`, so it is exempt from this bug too, not a ninth target)
      and q46's other two (`m20d-swarm.ts`, `probe-boss.ts`), has **no
      try/catch anywhere in the file** (q41's own log already established
      this for its seven; true for both q46 tools too — grepped). Unlike the
      syntax-error class, this one is fully fixable **inside this lane's
      Scope** (`tools/**`) — the same one-line-message-and-nonzero-exit
      shape q28/q38 already gave `gate-audit.ts`/`phase-coverage.ts`/
      `soak.ts`/`content-census.ts` (`<tool>: <message>` on stderr,
      `process.exitCode = 1`, no raw dump) — acceptance: for each of the
      **ten** content-importing tools (the seven above plus
      `m20d-run-a4.ts`/`m20d-swarm.ts`/`probe-boss.ts`), a regression test
      (scratch copy, live-verified) pins today's uncaught-`ZodError` crash,
      then each tool's entry point (its `main()`/`invokedDirectly` guard for
      the seven with that shape, or the top-level script body wrapped in a
      small function for `m20d-run-a4.ts`/`m20d-swarm.ts`/`probe-boss.ts`)
      gets a try/catch around its `loadContent`-reaching call printing one
      line and exiting nonzero instead of a raw dump, with the test flipped
      to assert the fixed behaviour — following q28/q38's established shape
      exactly, no `/src/**` or `/data/**` edit — refs: q25, q28, q33, q37,
      q38, q41, q42, q46, src/sim/content.ts's zod schemas
- [x] (q46) [feat] CLI JSON-syntax-error crash pinning, siblings of
      q33/q37/q41/q42: grepping every `tools/*.ts` file for top-level
      executable code that transitively imports `src/sim/content.ts` (not
      just the eight q41 covered) finds three more, missed because they
      don't match a "tool"/CLI-framed naming pattern q41's grep used:
      `tools/m20d-run-a4.ts` and `tools/m20d-swarm.ts` (both call
      `loadContent`/import `Run`/`World` at module scope) and
      `tools/probe-boss.ts` (imports `../tests/helpers`, which imports
      `../src/sim/run` → `./world` → `./content`, a *value* import).
      `tools/m20d-price-probe.ts` is exempt by the same reasoning as
      `gate-audit.ts`'s own carve-out — it imports only `node:fs`/
      `node:child_process`, no content import in its own process (it shells
      out to `m20d-run-a4.ts` instead); `tools/gen-tree.mjs` (no content
      import, pure layout math), `tools/fuzz-data.ts` and
      `tools/invariants.ts` (library modules, no top-level executable code
      or `process.argv` read) and `tools/fuzz-command-domain-worker.ts`
      (a `Worker` entry point, not directly invocable) are exempt too.
      Verified live this session in a throwaway scratch copy (`bench/.tmp`,
      torn down after): all three crash identically to q33/q37/q41's
      pattern against a syntax-broken `data/towers.json` — `m20d-run-a4.ts`/
      `m20d-swarm.ts` throw an uncaught `Error: Transform failed with 1
      error` with a raw stack frame naming `towers.json`, exit nonzero,
      empty stdout; `probe-boss.ts` needs a `tests/` copy alongside
      `src`/`tools`/`data` in the scratch dir to even reach that same crash
      (its own import chain reaching `tests/helpers`, not a difference in
      outcome — without it, it fails earlier with `ERR_MODULE_NOT_FOUND`,
      also uncaught) — acceptance: a new describe block (in
      `tests/q41-cli-json-syntax-error-siblings-2.test.ts` or a small q46
      sibling file) pins the live-verified crash for all three tools,
      matching q37/q41's `describe.each` assertions (nonzero exit, empty
      stdout, `Transform failed`+stack on stderr, no clean prefixed
      message) — refs: q33, q37, q41, q42, tools/m20d-run-a4.ts,
      tools/m20d-swarm.ts, tools/probe-boss.ts
- [x] (q47) [feat] Automate the "which `tools/*.ts` files are CLI-invocable
      and crash-unprotected" census itself: q37, q41 and q46 each
      independently re-derived this by hand-grepping `tools/*.ts` for
      top-level executable code and a transitive `content.ts` import, three
      sessions running — the exact repeated-manual-re-derivation shape q10's
      gate-audit tool and q14's mutation smoke already exist to prevent for
      their own domains. A new tool (`tools/cli-crash-coverage.ts`, or a
      classification folded into `gate-audit.ts`) statically lists every
      `tools/*.ts` file, classifies each as (a) has its own top-level
      executable code (not just exported functions/types), (b) transitively
      imports `src/sim/content.ts`, and (c) has a `catch` anywhere in the
      file, then reports which combination of (a)+(b) without (c) are
      pinned by a named test file vs. an unpinned gap — acceptance: the
      tool's classification for today's 22 `tools/*.ts` files matches this
      session's hand-derived set exactly (`content-census.ts`/
      `gate-audit.ts`/`phase-coverage.ts`/`soak.ts` exempt via their own
      try/catch; `sim.ts`/`sweep.ts`/`handoff-metrics.ts` pinned by
      q37/q42; the q41 seven pinned by q41, its eighth (`mutation-probe.ts`)
      confirmed exempt by the same item; `m20d-run-a4.ts`/`m20d-swarm.ts`/
      `probe-boss.ts` pinned by q46; `m20d-price-probe.ts`/
      `gen-tree.mjs`/`fuzz-data.ts`/`invariants.ts`/
      `fuzz-command-domain-worker.ts` exempt by no-content-import or
      not-directly-invocable), and a test asserts a new `tools/*.ts` file
      added in future with none of the three protections surfaces as an
      unpinned gap by name rather than needing a fourth hand-grep session —
      refs: q10, q14, q37, q41, q45, q46
- [x] (q48) [feat] Now that q45 establishes `tools/**` CAN carry an
      in-Scope try/catch fix (unlike the syntax-error class, which needs
      `src/sim/content.ts`), re-check whether q38's *other* in-Scope
      workaround — splitting `Content` into a type-only import and making
      `loadContent` a dynamic `await import(...)` call inside an existing
      `try` — also generalizes to any of q41/q46's ten content-importing
      vulnerable tools (`mutation-probe.ts` excluded — confirmed exempt, it
      never imports content at all), not just `content-census.ts`. q38's own
      log gave a reason it didn't extend to `sim.ts`/`sweep.ts` (multiple
      exported, synchronously-called functions with existing sync-signature
      external callers) or `handoff-metrics.ts` (module-top-level
      `loadContent()` call, before `main()` starts) — but none of the ten
      q41/q46 tools were individually checked against that same test. Read
      each one's call shape directly (single `main()`-style entry vs.
      multiple sync-exported call sites vs. a module-top-level load) and
      record, per tool, whether the dynamic-import workaround is
      structurally viable — acceptance: a table (in this file's Log, or a
      doc comment in the q45/q46 test file) naming, for each of the ten,
      "viable" or the specific structural reason it is not (module-top-level
      load / multiple sync exported call sites / other), and for at least
      one tool
      where it's viable, the workaround is actually applied and its
      syntax-error test flips from "crashes uncaught" to "clean message"
      the same way q38 did for `content-census.ts` — refs: q38, q41, q45,
      q46
- [x] (q49) [bug][feat] `tools/m20d-price-probe.ts` has zero test coverage
      and is the one tool in this lane's purview that mutates a **real,
      version-controlled `/data` file in place** as its documented mechanism
      (`measure()` reads `data/towers.json`, edits `cost`/`attack.damage`/
      `upgradeTotalCostMul`/every tower's `stepCost`, writes it back, shells
      out to `m20d-run-a4.ts`, then restores the original bytes in a
      `finally`). The restore is `try`/`finally`-only — safe against a
      normal throw (including the nested CLI exiting nonzero, which makes
      `execFileSync` throw) but unverified for a *nested-process failure*
      specifically (e.g. once q45 lands, a spec that produces a
      schema-invalid `towers.json` would make `m20d-run-a4.ts` itself throw
      mid-flight) — does the `finally` still restore correctly, or does some
      intermediate write get skipped? Never checked: does even the plain
      happy path restore byte-identical original content? — acceptance: a
      scratch-copy test (matching q37/q41/q46's throwaway-copy idiom, `cwd`
      set to the scratch dir so the tool's relative `data/towers.json` path
      never touches the real file) runs `m20d-price-probe.ts` with a valid
      spec and asserts the scratch `towers.json` is byte-identical before
      and after, then forces the nested `m20d-run-a4.ts` call to fail (e.g.
      an argv naming a non-existent tower key, which today throws
      `not a soul tower: ...` inside `m20d-run-a4.ts`) and asserts the
      restore still happens — refs: tools/m20d-price-probe.ts,
      tools/m20d-run-a4.ts
- [x] (q50) [bug] `tools/cli-crash-coverage.ts`'s `stripCommentsAndBacktickStrings`
      strips backtick template-literal contents but copies single/double-quoted
      string contents through untouched — a double-quoted string using a
      backslash-newline line continuation (valid JS) produces a real physical
      newline mid-string, and if the next line inside that string happens to
      start with `import ... from '...'`, `VALUE_IMPORT_RE`'s `^`-anchored
      multiline match fires on it even though it is pure string data, never
      evaluated as an import — false positive, confirmed empirically (a throw
      placed in a stand-in `content.ts` never fires when the consumer is run
      under `npx tsx`) — acceptance: a regression test in
      `tests/q47-cli-crash-coverage.test.ts` (same scratch-dir idiom as the
      existing "unpaired backtick in a doc comment" case) using this shape
      asserts `importsContent === false`, and the fix (quoted-string contents
      get the same treatment backtick contents already get, or an equivalent)
      makes it pass — refs: q47, tools/cli-crash-coverage.ts (QA finding,
      qa-playtester, session 45)
- [x] (q51) [bug] `tools/cli-crash-coverage.ts`'s `VALUE_IMPORT_RE` exclusion
      for type-only imports is `import\s+(?!type\s)...`, which only catches a
      literal `import type { ... }` statement — it misses the equally-valid,
      equally-erased per-specifier form `import { type Foo, type Bar } from
      '...'` where every named specifier is individually marked `type` and no
      value is imported. False positive, confirmed empirically against real
      esbuild/tsx erasure (a throw placed at the top of a stand-in `content.ts`
      never fires when the only import of it is all-`type`-specifiers) —
      acceptance: a regression test in `tests/q47-cli-crash-coverage.test.ts`
      using this shape asserts `importsContent === false`, and
      `VALUE_IMPORT_RE` (or a post-match specifier-list check) is fixed to
      exclude it — refs: q47, tools/cli-crash-coverage.ts (QA finding,
      qa-playtester, session 45)
- [x] (q52) [feat] Mutation-probe coverage gap, third occurrence of the
      q20/q31/q40 shape: `tools/mutation-probe.ts`'s `MUTATIONS` array still
      has only the pre-q40 15 entries (confirmed by direct count this
      session), and none of the guards landed since q40 has a matching entry
      — q45's nine try/catch/`.catch()` guards (`a4probe.ts`, `a5probe.ts`,
      `fuzz-command-domain.ts`'s unawaited-IIFE `.catch()`, `fuzz-input.ts`,
      `fuzz-save.ts`, `fuzz-weapon-boundary.ts`, `m20d-run-a4.ts`,
      `m20d-swarm.ts`, `probe-boss.ts` — `content-census.ts`'s pre-existing
      guard is the only one of the ten already covered, by
      `content-census-remove-trycatch`), q48's `probe-boss.ts`
      dynamic-import fix, and q50's `cli-crash-coverage.ts` line-continuation
      escape-handling fix were each mutation-verified by hand in their own
      session (git stash the file back to its pre-fix state, confirm the new
      test goes red, restore) but that manual check never landed as an
      automated `MUTATIONS` entry — acceptance: 11 new entries (one per
      guard/fix named above), each reverting exactly that guard and
      asserting its matching q45/q46/q50 test goes red, `tests/
      q14-mutation-smoke.test.ts` green with all of them, and the doc
      comment's nested-run count (q43's own pinned total) updated to match —
      refs: q20, q31, q40 (same recurring gap), q45, q48, q50
- [ ] (q53) [bug] `tools/m20d-price-probe.ts`'s `measure()` reads
      `data/towers.json` with a bare `JSON.parse(raw)` (line 23) that is
      **not** inside the function's only `try` (which starts at line 38 and
      wraps just the nested `execFileSync` call) — a JSON syntax error in
      `data/towers.json` crashes this tool with an uncaught raw `SyntaxError`
      stack trace instead of a clean CLI message. Confirmed empirically in a
      throwaway scratch copy this session: appending garbage to a scratch
      `towers.json` and running `JSON.parse` on it throws `SyntaxError:
      Unexpected non-whitespace character after JSON...` with no handler
      above it. This is a distinct crash mechanism from the q45/q46/q47
      `loadContent()`/zod class — `cli-crash-coverage.ts` correctly
      classifies this tool `no-content-import` (it never touches
      `src/sim/content.ts`), but that classification doesn't cover this
      tool's own separate raw-JSON-file read path, so the census currently
      reads this tool as safe when it isn't — acceptance: a regression test
      (scratch-copy idiom, `cwd` set so the tool's relative path never
      touches the real file) proves the raw-crash today, then a `try`
      widened to cover the read+parse+mutate span (or an equivalent) makes
      the tool print a clean one-line message and exit nonzero instead,
      without changing the existing `finally`-restore behavior q49 covers —
      refs: q49, tools/m20d-price-probe.ts, tools/cli-crash-coverage.ts
- [ ] (q54) [feat] Generalize `tools/cli-crash-coverage.ts`'s census (q47) to
      detect q53's crash class — a tool that reads a `/data/*.json` file
      directly (`readFileSync` + `JSON.parse`, bypassing `loadContent()`)
      with no enclosing `try` — as its own named category, distinct from
      `no-content-import`'s current meaning ("safe, never touches
      `content.ts`"). Today a tool in this shape reads as safe by the same
      logic that hid q53 for however many sessions this file existed
      unnoticed; the point of automating a census (q37/q41/q46 by hand, then
      q47) is exactly to stop a hole like this needing a fifth hand-grep
      session to find — acceptance: the classifier flags any `tools/*.ts`
      file matching this shape as a new `unguarded-data-read` status (or
      folds it into `no-content-import`'s existing bucket with a sub-reason),
      `tools/m20d-price-probe.ts` is the one live positive case pre-q53-fix
      and moves to `pinned`-equivalent post-q53-fix, and a test asserts no
      other one of the 23 files is newly flagged (so this is additive
      census coverage, not a surprise regression elsewhere) — refs: q47, q53
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

*Generated 2026-08-27, session 48, under CLAUDE.md's generation rule scoped
to this lane: only q49 and q51 were actionable (below the floor of 3, after
q48 landed) — q1/q4/q5/q6 remain Scope-blocked, unchanged. (a) Ran `npx tsx
tools/gate-audit.ts` and `npx tsx tools/sweep.ts --seeds 12 --policies
maxbuild,hybrid`: 9 covered / 11 holes, every hole still tracing to a
P-phase not yet reached (P1-P3, P6, P7, P9), and the sweep numbers (0% win,
medSurv ~119-120 either policy) unchanged from every session back to 6 —
nothing new. (b) `tools/content-census.ts`: unchanged since session 23
(7/10 categories, same three P-phase-gated misses). (c) Engineer's
judgment, grounded in reading source directly rather than re-deriving from
memory: counted `tools/mutation-probe.ts`'s `MUTATIONS` array by hand (still
15) and cross-checked it against every try/catch/`.catch()` guard q45/q48/
q50 landed since q40's own fix for the same gap — nine of q45's ten guards,
q48's dynamic-import fix and q50's escape-handling fix have never had a
matching entry, the third time this exact shape has recurred (q52). While
reading every tool in the q45/q46 pinned set for that check, read
`tools/m20d-price-probe.ts` in full (already the subject of q49) and found
a second, independent bug in the same file: its own `JSON.parse` is outside
its only `try`, an uncaught-crash class distinct from q49's restore-safety
concern and from the `loadContent()` class q45/q46/q47 already track (q53).
q54 generalizes q47's own census to catch that shape automatically rather
than needing this session's hand-read to find the next instance. q55 is a
direct application of CLAUDE.md's own measurement rule, cited by name, to a
category of test (bug-pin skips) this lane has never systematically
re-verified as a batch, only ever assumed still-red one file at a time. q56
is q43's own pattern, applied forward to whatever q54 adds — filed now so it
doesn't get lost, executed only after q54 lands. Took **q49**, the oldest
ready item in the queue (filed session 40, actionable every session since
but never top-ranked until now) and the most concretely scoped of the six
now-actionable items — a confirmed gap in a tool that mutates a real
tracked `/data` file with zero test coverage of its restore path, CLAUDE.md
rule 3's bug-outranks-the-queue reasoning applying here as directly as it
did for q45.*

*Generated 2026-08-27, session 40, under CLAUDE.md's generation rule scoped
to this lane: only q43 and q44 were actionable (below the floor of 3; q39
stays a Scope-blocked tracking entry) — q1/q4/q5/q6 remain Scope-blocked,
unchanged. (a) Ran `npx tsx tools/gate-audit.ts` and `npx tsx tools/sweep.ts
--seeds 12 --policies maxbuild,hybrid`: 9 covered / 11 holes, every hole
still tracing to a P-phase not yet reached (P1–P3, P6, P7, P9), and the
sweep numbers (0% win, medSurv ~119–120 either policy) still match the
documented bimodal-Act-II state — nothing new, same reading as every prior
session back to session 6. (b) `tools/content-census.ts`: unchanged since
session 23 (7/10 categories, same three P-phase-gated misses). (c)
Engineer's judgment, extending q41's own "more siblings may exist" grep to
tools q41 missed because they don't read like CLIs: `tools/m20d-run-a4.ts`,
`tools/m20d-swarm.ts` and `tools/probe-boss.ts` all transitively import
`src/sim/content.ts` and crash identically to q33/q37/q41's pinned pattern
— verified live, filed as q46. While tracing each one's import chain,
found a second, previously-unchecked crash mechanism: a *schema* violation
(not a syntax error) throws a runtime `ZodError` that a try/catch *could*
catch — and unlike the syntax-error class this fix is fully in-Scope
(`tools/**`), so q45 pins it and fixes it for all ten affected tools
(`mutation-probe.ts` re-confirmed exempt — it never imports content)
rather than only pinning it, and is ranked above q46 for exactly that
reason. q47 automates the census q37/q41/q46 each re-derived by hand three
times running, the same q10/q14-shaped fix this lane keeps reaching for.
q48 asks whether q38's other in-Scope workaround (dynamic import) also
applies to any of the ten q45/q46 tools, not just `content-census.ts`.
q49 is a standalone finding from reading `tools/m20d-price-probe.ts` while
tracing q46's `m20d-run-a4.ts` caller: it mutates a real tracked `/data`
file in place with no test ever exercising its restore path. Took **q45**,
ranked top: it is a confirmed, live-verified bug (CLAUDE.md rule 3 outranks
the queue) whose fix — unlike every prior CLI-crash item in this lane — is
fully achievable inside Scope rather than only pinnable, giving it strictly
more value than q46's pin-only sibling sweep or q47/q48/q49's smaller,
narrower scope.*

*Generated 2026-08-27, session 36, under CLAUDE.md's generation rule scoped
to this lane: only q38 and q39 were actionable (below the floor of 3) —
q1/q4/q5/q6 remain Scope-blocked, unchanged. (a) Ran `npx tsx tools/gate-
audit.ts` and `npx tsx tools/sweep.ts --seeds 12 --policies maxbuild,hybrid`:
the gate split is unchanged yet again (8 covered, 12 holes, every hole
tracing to a P-phase not yet reached) and the sweep numbers (0% win, medSurv
~119-120 either policy) match the already-documented bimodal-Act-II state —
nothing new from either tool alone, the same reading as sessions 12/16/23.
(b) SPEC-FINAL coverage diff and `tools/content-census.ts`'s own re-run: both
unchanged since session 23's read (7/10 categories, same three P-phase-gated
misses named by their own notes) — no new lane gap. (c) Engineer's judgment,
grounded in reading `tools/mutation-probe.ts` and every remaining CLI-
invokable `tools/*.ts` file directly rather than re-running a tool: q28
landed three try/catch guards but q31's own text (and a fresh grep this
session) shows only two of the three ever got a matching mutation-probe
entry — q40, the concrete finding and this session's pick. While tracing
that, re-read q37's own log, which had already named its own caveat
("more siblings may exist beyond these three") — q41 runs that check for
real across every other CLI-invokable tool, and q42 closes the one specific
untested `--json` path the session-35 log flagged but did not file. q43
generalises q31's own "recount rather than trust the doc comment" habit
into an automated check, closing a sixth instance of this lane's most
recurring trap shape before it happens again. q44 is the one item that
isn't a fresh code-reading finding but a challenge to an assumption this
lane has repeated six times running — CLAUDE.md's own measurement rules
exist for exactly that shape. Took q38, already queued and the most
concretely ready item (a verified-live, in-Scope fix with a named test file
and a clear before/after), over the newly generated q40-q44, since none of
the five needs to jump the queue on urgency and q38 was one session away
from executing already.*

*Generated 2026-08-27, session 23, under CLAUDE.md's generation rule scoped
to this lane: only q26 and q27 were actionable (fewer than 3) — q1/q4/q5/q6
remain Scope-blocked, unchanged. (a) Ran `npx tsx tools/gate-audit.ts` and
`npx tsx tools/sweep.ts --seeds 12 --policies maxbuild,hybrid`: the gate
split is unchanged yet again (8 covered, 12 holes, every hole tracing to a
P-phase not yet reached), and the sweep numbers (0% win, medSurv ~119-120
either policy) match the already-documented bimodal-Act-II state — nothing
new from either tool alone, same reading as sessions 12 and 16. (b) SPEC-
FINAL coverage diff: no change since session 12's read (P2/P3/P6/P7/P9 holes
are infrastructure not yet built, not a lane testing gap). (c) Engineer's
judgment, grounded in reading actual source rather than re-running a tool:
re-checked q25's own claim that every sibling CLI "handles its own failure
path" by reading `gate-audit.ts`/`phase-coverage.ts`/`soak.ts`'s `main()`s
directly rather than trusting the prior session's note — the claim is false
for all three (q28, the top item this pass, the fourth instance of this
lane's own "note overstates coverage" trap). While reading `applyOffer`'s
neighbor cases and `grantWeapon` to scope q28's blast radius, found two more
siblings of q21/q27's unclamped-`Offer`-field shape (q29, q30) and a
positive control worth pinning alongside them (q32), plus the mutation-probe
gap q20 leaves open every time a new guard lands without a matching
mutation (q31). Took q28, the top item, since it is the concrete finding
from step (c) and — like q22 before it — a live gap in this lane's own
tooling rather than a P-phase-not-built gap.*

*Generated 2026-08-27, session 16, under CLAUDE.md's generation rule scoped
to this lane: only q20 and q21 were actionable (fewer than 3) — q1/q4/q5/q6
remain Scope-blocked, unchanged. (a) Ran `npx tsx tools/gate-audit.ts` and
`npx tsx tools/sweep.ts --seeds 12 --policies maxbuild,hybrid`: the gate split
is unchanged from session 12's read (8 covered, 12 holes, every hole tracing
to a P-phase not yet reached — P2/P3/P6/P7/P9), and the sweep numbers
(0% win, medSurv ~119-120 either policy) match PROGRESS.md's already-
documented bimodal-Act-II state — nothing new from either tool standing
alone. (b) Diffing QUALITY.md's ALPHA bar itself against the code (rather
than re-running q10's own gate-vs-SPEC diff) surfaced a real, undocumented
gap: `tests/a11-determinism.test.ts`'s 100-seed test never fires a
`class_active` or `equip` Command, so ALPHA's own "including class actives
and uniques" clause is unverified by the test that's supposed to prove
it — filed as q22, the top item this pass, since it is a live gap in the
lane's own definition-of-done bar rather than a P-phase-not-built gap. (c)
The remaining four (q23-q26) are the accumulated backlog of "recorded, not
filed — too small on its own" gaps QA has logged across sessions 8, 11 and 13
plus the loose end q20's own mutation substitution (this session) creates in
`tools/perf-ratio.ts` — individually minor, but four sessions deep is enough
to stop being "too small" collectively, the same reasoning that turned
session 9-13's individually-recorded gaps into this batch now. Took q20, the
top pre-existing item.*

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

### 2026-08-27 — session 50

**Feedback inbox:** `feedback/` exists but is empty. Nothing to process.

**q52 done.** `tools/mutation-probe.ts`'s `MUTATIONS` array gained 11 entries
covering q45's nine try/catch/`.catch()` guards (`a4probe.ts`, `a5probe.ts`,
`fuzz-command-domain.ts`'s unawaited-IIFE `.catch()`, `fuzz-input.ts`,
`fuzz-save.ts`, `fuzz-weapon-boundary.ts`, `m20d-run-a4.ts`, `m20d-swarm.ts`,
`probe-boss.ts`), q48's `probe-boss.ts` dynamic-import fix, and q50's
`cli-crash-coverage.ts` line-continuation fix — 26 total now, 12 distinct
`testFile`s, 38 nested `npx vitest run` invocations.

Two findings worth recording. **(1)** A self-inflicted false positive:
writing the `probe-boss-revert-dynamic-import` entry's `find`/`replace` as
plain double-quoted strings put a literal `import { cfg, runWithPolicy }
from '../tests/helpers';` into `tools/mutation-probe.ts`'s own source text,
outside any backtick — which `tools/cli-crash-coverage.ts`'s census (q47)
then read as a real import and flagged `tools/mutation-probe.ts` itself as a
content-import gap (`tests/q47-cli-crash-coverage.test.ts` went red). Fixed
by moving that entry's `find`/`replace` into backtick template literals,
matching every other entry's established convention — the file's own doc
comment already warns about this exact trap for embedded `//` comments, it
just hadn't been hit for an embedded `import` before. **(2)** `m20d-run-a4.ts`
turned out to be untestable via the test I'd planned: probing
`m20d-run-a4-remove-try-catch` against `tests/q45-cli-schema-violation.test.ts`
came back "PASSED (missed!)" — `a4probe.ts`'s module-scope guard (which
`m20d-run-a4.ts` imports) calls `process.exit(1)` before `m20d-run-a4.ts`'s
own module body ever runs, so a `/data` schema violation never reaches its
own catch, and none of the three existing tests that invoke this tool
(q45/q46/q49) distinguish caught-clean from uncaught for its own try. Added
`tests/q52-m20d-run-a4-bad-key.test.ts`, which reaches it directly via an
invalid CLI tower-key argument (no `/data` involved), and pointed the
mutation there instead.

`npx tsc --noEmit -p .` clean throughout. `npx tsx tools/mutation-probe.ts`
(run twice, ~38 nested vitest invocations each): all 12 controls `ok`, all
26 mutations `test failed (caught)` both times — "real file DIRTY" on every
line both runs, confirmed to be this item's own legitimate uncommitted diff
to `tools/mutation-probe.ts` tripping the tool's whole-repo `gitDiffClean()`
check (`git status --porcelain` showed only the two expected files dirty
throughout), not a real leak. A full `npm test` run in the same window
turned up 5 failing test files (`q15-command-domain-fuzz` timing-sensitive
"hangs" outcomes, `q45`/`q49`/`q52-*` EPERM on scratch-dir cleanup) — all
four re-ran green standalone on a quiet host, matching this lane's
already-documented Windows scratch/timing flake class (session 49's log
names the same EPERM shape); not a regression from this item.

code-reviewer **APPROVE**, 1 Nit (a doc-comment typo, fixed) and one process
note (flip the BACKLOG-QUALITY checkbox before commit, done here). Also
independently confirmed no other new entry leaks an import-shaped string
outside a backtick, and that every new entry's `find` string is a verbatim
substring of the real target file.

qa-playtester **PASS**, with one caveat surfaced and resolved rather than
filed as a bug: `tests/q14-mutation-smoke.test.ts` itself is red while this
diff sits uncommitted, for the identical whole-repo-`gitDiffClean()` reason
above (all 26 `describe.each` rows and the dedicated cross-file-dirty fixture
test fail on `realFileUntouched`/its own precondition). QA independently
verified the new entries are real via the raw CLI tool and a hand-reverted
`a5probe.ts` against the real (unmutated) `tests/q45-cli-schema-violation.test.ts`,
concluding this is a structural precondition of the harness (checking a clean
tree), not a defect in the new entries — recommended committing, then
re-confirming `q14-mutation-smoke.test.ts` green post-commit. Also flagged
`tests/q52-m20d-run-a4-bad-key.test.ts` passes standalone (test + control)
and cleans up its scratch dir.

**Next: commit, then re-run `npx vitest run tests/q14-mutation-smoke.test.ts`
once more against the clean tree to get the true final green confirmation**
before treating q52 as fully closed out.

Five actionable items remained before this session (q52-q56); four remain
now (q53-q56), still above the floor of 3, so the generation rule does not
need to run next session either.

### 2026-08-27 — session 49

**Feedback inbox:** no `feedback/` directory in this worktree. Nothing to
process.

**Session start state:** the previous session's work on q51 was sitting
uncommitted in the working tree (`tools/cli-crash-coverage.ts`,
`tests/q47-cli-crash-coverage.test.ts`) — implemented but never tested,
reviewed, logged or committed. Verified it against q51's acceptance criteria
rather than redoing it: `VALUE_IMPORT_RE` gained a captured import-clause
group and a new `isTypeOnlyNamedImportClause()` helper that recognizes a
braced named-import list where every specifier is individually marked `type`
(`{ type Foo, type Bar }`) — the per-specifier form q51 filed, distinct from
the leading `import type { ... }` form the old `(?!type\s)` lookahead already
caught. Two new tests: the false-positive repro (all-type-specifiers import
of a throwing scratch `content.ts` correctly classifies `no-content-import`)
and a negative control (a mixed `{ type Foo, loadContent }` import still
classifies `gap`, proving the fix doesn't blanket-exempt every braced
import).

**q51 done.** `npx tsc --noEmit -p .` clean. `npx vitest run
tests/q47-cli-crash-coverage.test.ts`: 20/20 green. Full `npm test` in the
background surfaced three failures (`q45-cli-schema-violation.test.ts`'s
control case, `q49-price-probe-restore.test.ts`'s happy path,
`q15-command-domain-fuzz.test.ts`, 2 cases) all on the same
`EPERM, Permission denied` on a `bench/.tmp/*-scratch` `rmSync` cleanup —
none of the three touches `tools/cli-crash-coverage.ts` or
`tests/q47-cli-crash-coverage.test.ts`. Isolated to a clean HEAD (patched my
two files out via `git checkout --`, confirmed q45's control case passes
there too, reapplied the patch via `git apply`) and reran q45 standalone
twice more with the patch back in: green both times. Pre-existing Windows
scratch-dir flake (the same class q49's own session-48 review flagged as a
shared Minor: no stale-scratch-dir sweep across a hard-killed prior run),
not a regression from this change.

code-reviewer (APPROVE, 0 Critical/Major, 1 Nit: the default-import +
type-specifier mixed case, `import Foo, { type Bar } from '...'`, is reasoned
through correctly in `isTypeOnlyNamedImportClause` but has no dedicated test
— only the namespace-free `{ type Foo, loadContent }` mixed case is covered)
confirmed the regex capture-group reindex is correct (verified live: revert
the tool file, the new test goes red with the exact expected message) and
grepped `tools/*.ts`/`src/sim/*.ts` for the two documented known-limitation
shapes (`type as X`, `export { type Foo } from '...'` re-export), confirming
neither appears in the live codebase.

qa-playtester **PASS**, no bugs filed. Repeated the mutation-check
independently, then hand-probed `classifyTool` with 13 adversarial import-
clause shapes (multi-line whitespace, trailing comma, an identifier merely
starting with "type", no-whitespace `import{...}from`, irregular internal
spacing, `type as X`, a value import literally named `type`, invalid nested
braces, mixed default+type, namespace import, empty braces). Two shapes slip
through — `import{...}from` with no surrounding whitespace (a pre-existing
`VALUE_IMPORT_RE` limitation predating q51, `import\s+` requires the
whitespace) and `{ type as X }` (documented known limitation in the new
JSDoc) — neither is new, both are already absent from every real
`tools/*.ts`/`src/sim/*.ts` file today, and neither is in scope for q51.
Confirmed no other test file references `VALUE_IMPORT_RE`,
`isTypeOnlyNamedImportClause` or `importsContentTransitively`.

`git status --porcelain` before commit: `tools/cli-crash-coverage.ts`,
`tests/q47-cli-crash-coverage.test.ts`, `BACKLOG-QUALITY.md` only —
Scope-compliant.

**Five actionable items remain** (q52-q56), so the generation rule does not
need to run next session either.

### 2026-08-27 — session 48

**Feedback inbox:** `feedback/` exists but is empty. Nothing to process.

**Session start state:** clean (`git status --porcelain` empty), matching
session 47's closing note. Two actionable items in queue (q49, q51) — below
the generation floor of 3. Ran the generation rule: (a) `tools/gate-audit.ts`
(9 covered / 11 holes, all P-phase-gated, unchanged) and `tools/sweep.ts
--seeds 12 --policies maxbuild,hybrid` (0% win, medSurv ~119-120, unchanged)
— nothing new. (b) `tools/content-census.ts` unchanged since session 23. (c)
Read `tools/mutation-probe.ts`'s `MUTATIONS` array directly (still 15 named
entries) and cross-checked it against every try/catch/`.catch()` guard q45/
q48/q50 landed since q40's own fix for this exact gap: nine of q45's ten
guards, q48's dynamic-import fix, and q50's escape-handling fix have never
had a matching entry — filed as q52. While re-reading every q45/q46-pinned
tool for that check, read `tools/m20d-price-probe.ts` in full (already the
subject of open item q49) and found a second, independent bug: its own
`JSON.parse(raw)` (line 23) sits outside its only `try` (which starts at
line 38 and wraps just the nested `execFileSync` call), so a JSON syntax
error in `data/towers.json` crashes it with an uncaught raw `SyntaxError`
— confirmed empirically in a scratch copy — filed as q53, with q54
generalizing `cli-crash-coverage.ts`'s census to catch that shape by name
next time instead of needing another hand-read, and q56 extending q43's
mutation-probe-doc-comment-parity pattern forward once q54 lands. q55 applies
CLAUDE.md's own measurement rule ("a deferral is a measurement with an
expiry date") to this lane's ~15 accumulated `it.skip`'d bug-pin tests,
never re-verified as a batch. Appended all five (q52-q56). Took **q49**, the
oldest ready item in the queue and the most concretely scoped of the six
now-actionable items.

**q49 done.** Added `tests/q49-price-probe-restore.test.ts`, two cases
against throwaway scratch copies (never the real `data/towers.json`,
`cwd` set to the scratch dir): (1) happy path — a successful run leaves
`data/towers.json` byte-identical before and after; (2) nested-process
failure — `venom_spore`'s `soul` field is nulled first (drops it out of
`a4probe.ts`'s `SOUL_TOWERS`, so the nested `m20d-run-a4.ts venom_spore`
call throws `not a soul tower: venom_spore` and exits nonzero, the only
lever available to force that specific nested failure since the target
tower is hardcoded), and the `finally` still restores the file
byte-identical even though the whole CLI exits nonzero. No source change to
`tools/m20d-price-probe.ts` — this is a pure regression-test addition.

code-reviewer (APPROVE, 0 Critical/Major — 1 Minor already-shared across
every sibling scratch-idiom file: no `beforeAll` sweep of stale
`bench/.tmp/*-scratch/` entries from a hard-killed prior run, not unique to
or worsened by this file; 1 Nit, confirmed-correct `COPY_FILES` divergence
from q45/q46) verified the trigger mechanism, isolation and restore-identity
reasoning directly against source rather than trusting the file's own
comments.

qa-playtester's first pass **FAILED** the nested-failure test's own
mutation-check: `breakVenomSporeSoul()`'s original implementation did a
`JSON.parse`/`JSON.stringify` round-trip to set `soul: null`, which
silently pre-normalized the scratch file's line endings from the repo's
real CRLF to `measure()`'s own LF output shape *before* the test's "before"
snapshot was taken — combined with the test's spec (`u2`) being a
content no-op (matches the file's existing `upgradeTotalCostMul: 2`), the
"before" and "after" snapshots were byte-identical regardless of whether
the `finally` restore ran at all. QA reproduced this twice (breaking the
`finally` write left the nested-failure test green). Fixed by rewriting
`breakVenomSporeSoul()` to a targeted single-occurrence string replace on
the raw CRLF text (matching `mutation-probe.ts`'s own anchor-replace idiom:
asserts exactly one occurrence before touching it) instead of a JSON
round-trip, so the "before" snapshot keeps the file's real CRLF and stays
distinguishable from a broken restore's LF-reformatted output. Re-ran the
same mutation-check myself after the fix: breaking `tools/m20d-price-
probe.ts`'s `finally` write now fails **both** tests (confirmed the diff is
a real CRLF-vs-LF/reformat mismatch, not a flake), then restored the tool
via `git checkout -- tools/m20d-price-probe.ts` and confirmed `git status
--porcelain` byte-identical to committed. Re-ran green against the real
committed tool afterward: 2/2 passed.

`npx tsc --noEmit -p .`: clean. `npm test` (full suite, background):
green, exit 0. `git status --porcelain` before commit:
`tests/q49-price-probe-restore.test.ts`, `BACKLOG-QUALITY.md` only —
Scope-compliant.

**Six actionable items remain** (q51-q56), so the generation rule does not
need to run next session either.

### 2026-08-27 — session 47

**Feedback inbox:** no `feedback/` directory in this worktree. Nothing to
process.

**Session start state:** clean (`git status --porcelain` empty), matching
session 46's closing note. Three actionable items in queue (q48, q49, q51);
at the generation floor of 3, so no generation needed. Took **q48**, the top
item.

**q48 done.** Read all ten q41/q46 content-importing tools' import shapes
directly (not re-derived from memory) and checked each against q38's
disqualifying tests — a module-top-level `loadContent()` call feeding further
top-level code (`handoff-metrics.ts`'s shape), or multiple exported,
synchronously-called functions with existing sync-signature external callers
(`sim.ts`/`sweep.ts`'s shape) — by grepping every `tests/*.ts` file for a
`from '../tools/<name>'` import and reading what it pulls in. Full table:

| tool | viable? | reason |
|---|---|---|
| `perf-ratio.ts` | no | `worstCaseWorld`, `measureRatioForWorld`, `calibrationWork` are exported and called synchronously by three external test files (`tests/a10-performance.test.ts`, `tests/q13-perf-ratio.test.ts`, `tests/q26-perf-ratio-interleave.test.ts`) — the `sim.ts`/`sweep.ts` shape |
| `a4probe.ts` | no | `content = loadContent()` runs at module top level, feeding a further top-level export (`SOUL_TOWERS`) — the `handoff-metrics.ts` shape — *and* `SOUL_TOWERS`/`T3_MODS`/`runSingleType` are imported synchronously by `tests/a4-single-type.test.ts` |
| `a5probe.ts` | no | `collect`, `topTen`, `aggregateShares`, `BUILDS` are exported and called synchronously by `tests/a5-weapon-share.test.ts` |
| `fuzz-input.ts` | no | `COMMAND_KINDS`, `PHASES`, `describeFailure`, `fuzzPhase`, `fuzzRun`, `runInPhase` are exported and called synchronously by `tests/q2-input-fuzz.test.ts` and `tests/q15-command-domain-fuzz.test.ts` |
| `fuzz-save.ts` | no | `validMeta` and siblings are exported and called synchronously by `tests/q3-save-fuzz.test.ts` and `tests/q8-save-roundtrip.test.ts` |
| `fuzz-weapon-boundary.ts` | no | eight exported functions each default a `content: Content = loadContent()` parameter, called with no argument (relying on the default) by `tests/q21-weapon-boundary-fuzz.test.ts` — same multiple-sync-callers class, just spread across defaults instead of one signature |
| `fuzz-command-domain.ts` | no | `runSingleProbe`, `digest`, `fieldSpec`, `classify`, `probeInWorker`, `runCensus`, `runAliasProbe`, `aliasProbeInWorker` are exported and called synchronously by `tests/q15-command-domain-fuzz.test.ts` and `tests/q15-command-domain-holes.ts` (its own `./fuzz-input` import could be made dynamic independently of `fuzz-input.ts`'s own fixability, the same way `m20d-run-a4.ts` relates to `a4probe.ts` below — but that CLI's *own* multiple sync exports still block it) |
| `m20d-run-a4.ts` | **yes** (not applied) | single top-level `try`, zero external callers of its own (`grep`-confirmed no test imports `tools/m20d-run-a4`) — its only import is `./a4probe`'s named exports, and deferring *that one import* to `await import('./a4probe')` inside its own `try` works regardless of `a4probe.ts`'s own internal shape, because the dynamic import defers `a4probe.ts`'s entire module instantiation (including its problematic static chain into `content.ts`) to runtime, inside the caller's `try` — the same relationship that let q38's fix for `content-census.ts` not need `src/sim/content.ts` itself to change |
| `m20d-swarm.ts` | **yes** (not applied) | single top-level `try`, zero external callers; `World`/`spawnEnemy`/`buildTower`/etc. all take `content`/`World` as call arguments rather than loading it themselves, so the only content-touching static import is the direct `import { loadContent } from '../src/sim/content'` — one dynamic import fixes it |
| `probe-boss.ts` | **yes — applied this session** | single top-level `try`, zero external callers, exactly one import (`../tests/helpers`) used only inside that `try` — the cleanest instance of q38's shape of all ten |

Applied the fix to **`probe-boss.ts`**: its static
`import { cfg, runWithPolicy } from '../tests/helpers'` is now a dynamic
`const { cfg, runWithPolicy } = await import('../tests/helpers')` made from
inside the file's own top-level `try` (top-level `await` needed an
`export {}` added first — `tsc` rejected it otherwise, since the file had no
other import/export left to mark it a module). Verified live in a throwaway
scratch copy before writing anything permanent: a syntax-broken
`data/towers.json` now prints one line, `probe-boss: Transform failed with 1
error: ...`, exit 1, empty stdout — no raw stack frame — where before it
dumped an uncaught multi-frame esbuild trace. Bonus, not hunted for
separately: the *other* pre-existing failure mode q46 pinned as a control
(`probe-boss.ts` run without a `tests/` directory in the scratch copy, which
previously failed even earlier on an uncaught `ERR_MODULE_NOT_FOUND`) is now
*also* caught cleanly by the same change, since deferring the import makes
every failure in that subgraph an ordinary rejected promise, not just the
JSON-syntax one.

`tests/q46-cli-json-syntax-error-siblings-3.test.ts` updated the same way
q38 updated `tests/q33-cli-json-syntax-error.test.ts`: `probe-boss.ts`'s two
"crashes uncaught" cases became "no longer crashes uncaught" cases pinning
the clean-message behaviour (both the with-`tests/` and without-`tests/`
shapes), `m20d-run-a4.ts`/`m20d-swarm.ts`'s cases are untouched (still
crash — the general `src/sim/content.ts` fix is still out of Scope for
those two), and the file's header doc comment was rewritten to record which
of the three is now fixed and why the other two aren't, so a reader doesn't
have to diff against git history to find out.

Mutation-verified: stashed just `tools/probe-boss.ts` back to its committed
(pre-fix) state with the new tests still present (`git stash push -u -m
"q48-mutation-check" -- tools/probe-boss.ts`, never a bare `stash pop` since
the stack is shared across worktrees) — both new assertions failed as
expected (one on the raw-stack-trace shape, one on the raw
`ERR_MODULE_NOT_FOUND` dump) — then restored via `git stash apply <sha>` +
`git stash drop` and confirmed the file was back to its fixed, byte-identical
state.

`npx tsc --noEmit -p .`: clean (after adding `export {}` — a file with no
import/export left is a script, not a module, and top-level `await` is a
module-only construct). `npx vitest run
tests/q46-cli-json-syntax-error-siblings-3.test.ts
tests/q45-cli-schema-violation.test.ts tests/q47-cli-crash-coverage.test.ts`:
33/33 green (q45's `probe-boss.ts` schema-violation case, which exercises the
same file through a different failure path, still passes unchanged — dynamic
vs. static import doesn't matter for a failure that already happened at
runtime inside a function call). `npm test` kicked off in the background for
the full-suite pass; see below for its result once landed.

### 2026-08-27 — session 46

**Feedback inbox:** no `feedback/` directory in this worktree. Nothing to
process.

**Session start state:** `tools/cli-crash-coverage.ts` and
`tests/q47-cli-crash-coverage.test.ts` were already modified in the
worktree (both tracked, both showing `M`), matching q50's acceptance
criteria verbatim and the same interrupted-session shape sessions
14/16/18/19/20/33/37/38/39/40/42/44/45 each logged. `git log` showed no
commit including these changes and q50 was still unchecked in the Queue.
Verified rather than trusted before touching anything.

**q50 done.** The fix: in `stripCommentsAndBacktickStrings`'s quoted-string
copy loop, a `\` immediately followed by a real `\n` or `\r\n` (a valid JS
line-continuation escape) is now consumed without emitting output, instead
of being copied through literally. The old behaviour left a real newline
inside the copied-through string content, which `VALUE_IMPORT_RE`'s
`^`-anchored multiline match could fire on if the following string-internal
line happened to start with `import ... from '...'` — pure string data,
never evaluated as an import, but misclassified as a real one. A doc
comment records the accepted residual gap (bare `\r`, U+2028/U+2029 — not
currently produced by any `tools/*.ts` file since editors/git normalize
them away).

Mutation-verified before dispatching review: stashed just
`tools/cli-crash-coverage.ts` back to its committed (pre-fix) state with
the new test still present — the q50 test failed (`expected true to be
false`) as expected — then restored the fix via `git stash apply` +
`git stash drop` (never a bare `stash pop`, since the stack is shared
across worktrees) and confirmed the file's diff was byte-identical to
before. `npx vitest run tests/q47-cli-crash-coverage.test.ts`: 18/18 green.
`npx tsc --noEmit -p .`: clean. `git status --porcelain`: the two modified
files only — Scope-compliant.

**Review (code-reviewer, APPROVE, 0 Critical/Major — 1 Minor, 1 Nit,
already-disclosed).** Walked the escape-handling loop character-by-
character and confirmed `\"`/`\\` still fall to the unchanged `else`
branch; independently reverted the source file alone and reran to confirm
the new test is a genuine regression test, not a tautology; confirmed
`tsc` clean and Scope compliance. The Minor (a bare `\r` or U+2028/U+2029
line terminator reproduces the same false-positive class) is exactly the
gap the new doc comment already discloses as checked-and-currently-
inapplicable, so nothing further to fix.

**QA (qa-playtester, PASS, no new defects).** Ran the suite live (18/18),
confirmed the acceptance-criteria test uses the described scratch-dir
idiom and asserts the right fields, then adversarially probed 6 constructed
shapes via a throwaway driver script outside `tools/` (single-quoted
version, CRLF file, continuation at end-of-file, nested-backslash parity,
adjacent backtick-stripping interaction, and an escaped-backslash-pair-plus-
raw-newline construction) — all correct, and the one shape that still
false-positives (an unescaped raw newline inside a quoted string not
immediately preceded by a lone `\`) is not valid, type-checking JS/TS, so
it cannot occur in any real `tools/*.ts` file the census actually scans;
same accepted-limitation class as the doc comment's existing bare-`\r`/
U+2028/U+2029 disclosure, not a new live bug. `git status --porcelain`
confirmed clean before and after (scratch driver never touched tracked
files).

**Suite state.** Isolated file green (above); no other test/tool file
touched this session, so a full `npm test` re-run was not needed for this
item. `git status --porcelain` before commit: the two modified files plus
`BACKLOG-QUALITY.md` — Scope-compliant.

**Three actionable items remain** (q48, q49, q51; q39 stays a Scope-blocked
tracking entry) — at the generation floor of 3, so the next session should
run the generation rule before executing if fewer than 3 remain by then.

### 2026-08-27 — session 45

**Feedback inbox:** no `feedback/` directory in this worktree. Nothing to
process.

**Session start state:** `tools/cli-crash-coverage.ts` and
`tests/q47-cli-crash-coverage.test.ts` were already sitting in the worktree,
untracked, complete and matching q47's acceptance criteria verbatim — the
same interrupted-session shape sessions 14/16/18/19/20/33/37/38/39/40/42/44
each logged. `git log` showed no commit for either and q47 was still
unchecked in the Queue. Verified rather than trusted: ran the suite live
before touching anything.

**q47 done.** `tools/cli-crash-coverage.ts` does real static analysis (not a
hand-curated list) for (a)/(b): `listToolFiles` recomputes today's
`tools/*.ts` set live; `importsContentTransitively` does a real BFS over
value imports (static, dynamic, and bare side-effect) with a single left-to-
right scan that strips comments and backtick-string contents before matching,
specifically to survive `mutation-probe.ts`'s fixture strings that embed a
real `await import('../src/sim/content')` as string data. (a) "is this a real
CLI" and the "which test pins this" fact stay hand-curated
(`NOT_INVOCABLE`/`PIN_COVERAGE`), the same shape `gate-audit.ts`'s
`KNOWN_HOLES`/`GATE_COVERAGE` already use, because those two facts aren't
mechanically derivable. `npx tsx tools/cli-crash-coverage.ts` run live: 23
files classified (22 q47 counted plus the tool itself), zero gaps, every
named bucket from the acceptance criteria matches exactly (q33/q37/q41/q45/
q46 pins, `mutation-probe.ts`/`invariants.ts`/`fuzz-data.ts`/
`fuzz-command-domain-worker.ts`/`m20d-price-probe.ts` exempt, `gen-tree.mjs`
correctly absent from the `.ts`-only listing).

`npx vitest run tests/q47-cli-crash-coverage.test.ts`: 17/17 green.
`npx tsc --noEmit -p .`: clean. `git status --porcelain`: the two new files
only — Scope-compliant.

**Review (code-reviewer, APPROVE, 0 Critical/Major — 2 Minor, 2 Nit).**
Hand-traced the `mutation-probe.ts` single-pass-vs-two-pass claim against the
live fixture on disk and confirmed a two-pass sweep would corrupt it as
described; confirmed the `invariants.ts -> stats.ts -> content.ts` two-hop
chain live; spot-checked all 16 `PIN_COVERAGE` entries against their listed
test files and the 3+4+16=23 arithmetic. Minor: `VALUE_IMPORT_RE`'s bare-
side-effect-import branch requires a trailing `;` (undocumented, no live
gap); relative-only import matching silently misses `tsconfig.json`'s unused
`@/*` alias (undocumented, no live gap). Nit: dead `.tsx` resolution
branches (repo has no `.tsx` files); dynamic-import branch could over-match
a type-position `import(...).Foo` reference (fails loud, not silent). Folded
both Minor findings into the file's own "Known limitations" doc comment
(comment-only, no assertion change), re-ran green after.

**QA (qa-playtester, PASS — 2 minor non-blocking bugs found, both filed as
new items).** Confirmed all three acceptance-criteria commands live, then
ran 11 adversarial import shapes through a scratch harness outside `tools/`:
a 4-hop chain, mixed `{ type Foo, loadContent }`, pure `import type`, a
`//`-commented-out fake import, a division operator before a real import, a
barrel re-export chain, an escaped-`//` inside a regex literal, an escaped-
nested-backtick template literal, a cyclic import (terminates, no infinite
loop), and an escaped-quote string — 9 of 11 correct. Two false positives
(push toward "flag something that isn't a real import," not the dangerous
"miss something that is" direction the tool exists to prevent), neither
present in today's real 22 files, so no live misclassification: (1) a
backslash-newline line continuation inside a double-quoted string is copied
through unstripped, so a string body whose second physical line starts with
`import ... from '...'` false-positives; (2) `import { type Foo, type Bar }
from '...'` (every specifier individually marked `type`, no bare `import
type` keyword) isn't recognized as type-only. Both verified empirically
against real esbuild/tsx erasure, not just asserted. Filed as q50/q51 with
regression-test acceptance criteria, per this lane's "a QA-filed bug becomes
a new backlog item with a regression test" rule. Confirmed `git status
--porcelain` unchanged after QA's own scratch-dir cleanup — nothing left
outside Scope.

**Suite state.** Isolated file green (above); no other test/tool file
touched this session (the code-review fix was a doc comment inside the new
file itself), so a full `npm test` re-run was not needed for this item.
`git status --porcelain` before commit: the two new files plus
`BACKLOG-QUALITY.md` — Scope-compliant.

### 2026-08-27 — session 44

**Feedback inbox:** no `feedback/` directory in this worktree. Nothing to
process.

**Session start state:** `tests/q46-cli-json-syntax-error-siblings-3.test.ts`
was already sitting in the worktree, untracked, complete and matching q46's
acceptance criteria verbatim — the same interrupted-session shape sessions
14/16/18/19/20/33/37/38/39/40/42 each logged. `git log` showed no commit for
it and q46 was still unchecked in the Queue. Verified rather than trusted:
ran it live before touching anything.

**q46 done.** `describe.each` pins the identical uncaught-crash shape
q33/q37/q41 established for `tools/m20d-run-a4.ts` and `tools/m20d-swarm.ts`
(both transitively import `src/sim/content.ts`, no naming pattern q41's grep
matched), plus a `probe-boss.ts` pair: one case with a `tests/` copy in the
scratch dir (needed for its `../tests/helpers` import chain to reach
`content.ts`'s transform at all) asserting the same crash, and a control case
without `tests/` present asserting the genuinely different failure
(`ERR_MODULE_NOT_FOUND` for the missing `tests/helpers`, not a transform
error) — proving the `tests/`-present case isn't incidentally passing for an
unrelated reason.

Ran `npx vitest run tests/q46-cli-json-syntax-error-siblings-3.test.ts` live:
4/4 green. `npx tsc --noEmit -p .` clean. `git status --porcelain`: the one
new test file only — Scope-compliant.

**Review (code-reviewer, APPROVE, 0 Critical/Major — 1 Minor, 1 Nit).**
Confirmed the three import chains directly (`probe-boss.ts` →
`tests/helpers.ts` → `src/sim/run.ts` → `src/sim/world.ts` →
`src/sim/content.ts`), confirmed `m20d-run-a4.ts`/`m20d-swarm.ts`'s q45-added
try/catch cannot fire against a syntax error (proving this is genuinely new
coverage, not a q45 duplicate), confirmed the `tests/`-absent control
diverges for real. Minor: the inline comment misattributed `m20d-swarm.ts` as
importing `a4probe.ts` (it doesn't — it imports `loadContent` directly and
has its own top-level try/catch; that clause belongs to `m20d-run-a4.ts`,
which does import `a4probe.ts`) — fixed here, comment-only, no assertion
change, re-ran green after. Nit (not fixed, doesn't affect behaviour): the
`m20d-run-a4.ts` case's `'venom_spore'` arg is accurate but moot, since the
crash pre-empts `process.argv` ever being read.

**QA (qa-playtester, PASS, no defects).** Ran the suite live twice
consecutively (no interference, scratch dirs fully cleaned both times via the
per-pid/random-suffixed paths). Independently reproduced `m20d-swarm.ts`'s
crash by hand in a throwaway scratch copy outside the harness — exit 1, empty
stdout, the same raw `Transform failed with 1 error` stack, matching the
test's assertions byte-for-byte in shape. Independently reproduced
`probe-boss.ts`'s "without `tests/`" control and confirmed it's genuinely
`ERR_MODULE_NOT_FOUND`, not a coincidental transform-error match. Confirmed
`bench/.tmp/` is gitignored and `git status --porcelain` shows only the new
test file.

**Suite state.** Isolated file green (above); no other test/tool file
touched this session, so a full `npm test` re-run was not needed for this
item. `git status --porcelain` before commit: the one test file plus
`BACKLOG-QUALITY.md` — Scope-compliant.

**Committed.**

**Three actionable items remain** (q47, q48, q49; q39 stays a Scope-blocked
tracking entry) — at the generation floor of 3, so the next session should
run the generation rule before executing if fewer than 3 remain by then;
today it does not need to.

### 2026-08-27 — session 43

**Feedback inbox:** no `feedback/` directory in this worktree. Nothing to
process.

**q44 done — the six-session "just contention" read is now backed by actual
instrumentation, not a seventh pattern-match.** Built
`bench/q44-worker-timing-probe.ts`: calls the same `probeInWorker` the
census uses, for every one of the 60 `FIELD_SPECS x FAMILIES` combos at the
same concurrency (6), but with a **generous 25000ms ceiling** instead of the
shipped 4000ms, logging real elapsed time for every call instead of
collapsing "timed out" and "hung" into one verdict. The question this
answers: when the 4000ms budget is missed under load, does the worker
eventually answer (contention — the budget was just too tight) or never
answer (a real leak in `fuzz-command-domain-worker.ts`'s lifecycle)?

**Baseline (quiet host, no concurrent load): 60/60 combos.** Only
`dev.xp.amount:posInf` — the already-documented, deliberate infinite loop
this file's own suite exists to pin (`addXp`'s `while` never terminates on
`Infinity`) — failed to resolve by 25000ms. Every other combo: p50=369ms,
p95=2104ms, max (excluding the intentional hang) well under the shipped
4000ms budget. Confirms the harness and the probe script agree with the
shipped census when nothing else is competing for the CPU.

**Contention, pass 1 — genuine load, this lane's established method (session
8's perf-ratio note: a real concurrent `npx vitest run` is realistic
contention that cleans itself up; synthetic busy-loops escaped `pkill` last
time and are not used again).** Started a full `npx vitest run` in the
background, then ran the probe concurrently. That real background run
**reproduced the actual flake live**, not hypothetically:
`tests/q15-command-domain-fuzz.test.ts` — 2 failed, one reading verbatim
`pick.index:nan — did not settle within 4000ms: expected 'hangs' to be
'rejected'`. At the same time, the probe recorded **10/60 combos** over the
shipped 4000ms budget (`pick.index` x4 families, `dev.fast_forward.amount`
x4 families, `rekindle.structureId:fractional`, plus the intentional hang).
Of those 10, **9 resolved between 5.0s and 9.2s** — well inside the 25s
ceiling — and only the intentional hang failed to resolve.

**Contention, pass 2 — same background load, different point in its run.**
**3/60 combos** over budget this time, and a **different set**
(`rekindle.structureId:negative`/`:fractional`, plus the intentional hang) —
not the same combos pass 1 flagged. Both non-hang combos resolved by 4.6-4.8s.

**Conclusion, with the evidence a re-run-till-green never produces: this is
structurally contention, not a leak.** Two lines of evidence, not one: (1)
across 180 combo-runs total (60 quiet + 60 + 60 contended) under real
full-suite load, every over-budget call resolved once given headroom except
the one call that is a confirmed, already-named, intentional infinite loop
— zero instances of an unexplained non-terminating worker. (2) the specific
field:family combo that goes over budget **changes between runs under
identical background load** (pick.index/dev.fast_forward.amount in pass 1,
rekindle.structureId in pass 2) — a real leak tied to a specific input or
code path would reproduce on the same combo; combos changing run to run is
the signature of whichever worker thread happens to be scheduled behind the
heaviest concurrent load at that instant, i.e. OS/tinypool scheduling noise,
not a defect in the worker's own lifecycle. This matches session 8's
`perf-ratio.ts` finding for a structurally similar probe under the same
kind of load, now demonstrated directly for this one instead of inferred by
analogy. Not filed as a bug — CLAUDE.md's own "a deferral is a measurement
with an expiry date" is satisfied by an actual re-measurement this time, and
the re-measurement confirms rather than overturns six sessions' shared
reading. `bench/q44-worker-timing-probe.ts` is left in place (matches
`tools/perf-ratio.ts`'s own precedent of keeping a load-bearing measurement
script rather than a throwaway) so a future session can re-run it in under a
minute instead of re-deriving the method a seventh time.

**Incidental, not filed:** the same contended background run also hit one
`EPERM` on `bench/.tmp/q45-cli-schema-violation-scratch/...` inside q45's own
control case, once, non-reproducing (a Windows file-handle contention
artifact of running this many concurrent heavy Node/tsx processes at once,
not something this session's changes touch) — noted here in case a future
session sees it again and wonders whether it's new.

**Suite state.** Standalone `npx vitest run tests/q15-command-domain-fuzz.test.ts`
(quiet): 25/25 green. The full `npx vitest run` used as this session's
contention source (started before this file's own edits were committed, ran
755s under the extra load of two concurrent probe passes plus a second
session's own live work on the machine — vs. the usual ~300-400s quiet-host
figure this lane's log otherwise reports): **3 files / 20 tests failed**.
Two of the three are pre-existing, already-explained, non-reproducing shapes
this session did not cause: `q15-command-domain-fuzz.test.ts` (the 2 worker-
timeout assertions this item is about) and `q45-cli-schema-violation.test.ts`
(the 1 incidental `EPERM` above). The third, **`q14-mutation-smoke.test.ts`
(17 of the 20 failures)**, is session 42's own documented
`gitDiffClean()`-sees-the-uncommitted-lane-diff artifact — this session's own
then-uncommitted edits to this file and the new `bench/` script were live on
disk while that run executed, tripping every mutation's `realFileUntouched`
check the same way session 42 (and 12/14/15/16/18/20/26-29/36/38/39/40)
already recorded; expected to clear once this commit lands. `npx tsc
--noEmit -p .` clean.

**Four actionable items remain** (q46-q49, all unchecked and unblocked), so
the generation rule does not need to run next session either.

### 2026-08-27 — session 42

**Feedback inbox:** no `feedback/` directory in this worktree. Nothing to
process.

**Session start state:** `tests/q14-mutation-smoke.test.ts` already carried an
uncommitted diff — a prior session's unfinished q43 work (the new "doc comment
matches the real MUTATIONS array" test), matching this file's own convention
of recovering session-N's uncommitted work (q33 did the same for session 31).
Verified the diff was exactly q43's acceptance criteria and finished it rather
than starting over.

**q43 done.** The new test reads `tools/mutation-probe.ts`'s source text,
collapses the wrapped block-comment lines, regex-extracts the three numbers
from "this now runs N nested `npx vitest run` invocations (C controls, one per
distinct `testFile`, + M mutations)", and asserts each against `MUTATIONS`
computed live: `MUTATIONS.length` (15), `new Set(MUTATIONS.map(testFile)).size`
(8), and their sum (23) — all three currently agree with the doc comment.

**Suite state.** Standalone filtered run (`-t "doc comment matches the real
MUTATIONS array"`) — 1 passed. Full `tests/q14-mutation-smoke.test.ts`
(background, 637s): 16 failed / 13 passed, exactly the documented
`gitDiffClean()`-sees-the-uncommitted-lane-diff artifact (sessions
12/14/15/16/18/20/26-29/36/38/39/40 etc.) — 15 mutations' `realFileUntouched`
plus the suite's own fixture-must-start-clean case, tripped by this session's
own then-uncommitted diff to this same file. Not re-filed. `npx tsc --noEmit
-p .` clean. `git status --porcelain` before commit: `tests/q14-mutation-
smoke.test.ts`, `BACKLOG-QUALITY.md` only — Scope-compliant.

**Review (code-reviewer, APPROVE, 0 Critical/Major).** Independently confirmed
the regex matches the live doc comment, the `.not.toBeNull()` guard fails
loudly rather than silently skipping if the comment is reworded, sum logic has
no off-by-one, diff is scoped to `tests/q14-mutation-smoke.test.ts` only, no
`/src/sim` import or architecture-rule concern.

**QA (qa-playtester, PASS).** Proved it's a real regression test, not a
tautology: bumped the stated total 23→24 (fails: "total invocation count no
longer equals controls + mutations"), reverted; bumped only the mutation count
15→16 (fails on that assertion specifically), reverted; bumped only the
controls count 8→9 (fails on that assertion specifically), reverted — each
edit isolated and `git diff --stat tools/mutation-probe.ts` confirmed empty
before the next. All three assertions independently load-bearing. Confirmed
the full-file failure count (16) matches the documented artifact and confirmed
nothing outside `tests/**` was touched.

**Committed.**

**Several actionable items remain** (q44, q46, q47, q48, q49, all unchecked
and unblocked), above the generation rule's floor of 3, so the next session
does not need to run it.

### 2026-08-27 — session 41

**Feedback inbox:** `feedback/` empty. Nothing to process.

**q39** was the top actionable item, but its own text already establishes that
the actual fix (guarding `Stats.total()`'s running-sum overflow, clamping
`luckBias`, schema-validating `deserializeMeta`, bounding `AffixSchema`) is a
`/src/**` change outside this lane's Scope. Its acceptance line is narrower
than "fix the bug": it only asks the tracking entry to confirm today's
overflow behaviour is already pinned by `tests/q35-weighted-index-nan.test.ts`'s
"gap found by QA verification" describe block. Ran that file live
(`npx vitest run tests/q35-weighted-index-nan.test.ts`): 9/9 green, not
skipped, and its two `it` blocks pin exactly the two-contribution overflow
q39 describes (`1.5e308` twice → `total()` is `Infinity`; `-1.5e308` twice →
`total()` is `-Infinity` → unclamped `luckBias` is `-Infinity` → a `NaN`
weight in `rollOffers`). Spot-checked all four line references in q39's text
against current source (`src/sim/stats.ts:148`'s single-contribution
`Number.isFinite` guard, `src/sim/progression.ts:89`'s positive-only
`Math.min(0.5, ...)` clamp, `src/meta/meta.ts:322`'s unvalidated
`JSON.parse`, `src/sim/content.ts:380-387`'s unbounded `AffixSchema` `num`
fields) — none stale, all still accurate.

**QA (qa-playtester, PASS).** Independently re-verified all four of the
above from scratch (live test run, source-line spot-check, `git status`
clean) rather than trusting this session's own read. No coverage gap found;
confirmed this closure is documentation-only and the underlying bug remains
correctly tracked as out-of-Scope /src/** work for main lane.

**Suite state.** No `/src/**` or `/data/**` files touched; `git status
--porcelain` before commit: `BACKLOG-QUALITY.md` only. Full `npm test` not
re-run since no test or tool file changed this session — only the isolated
`tests/q35-weighted-index-nan.test.ts` file, confirmed green live above, is
relevant to this item.

**Committed.**

### 2026-08-27 — session 40

**Feedback inbox:** `feedback/` exists but is empty. Nothing to process, nothing
moved.

**Found the generation rule's output and q45's full implementation already
sitting in the worktree, uncommitted, at session start** — the same recurring
interrupted-session shape sessions 14/16/18/19/20/37/38/39 each logged. Ten
`tools/*.ts` modified plus a new `tests/q45-cli-schema-violation.test.ts`, and
BACKLOG-QUALITY.md already carried the generation rule's five new items
(q45–q49) with its own "Generated ... session 40" note and rationale for
ranking q45 top. `git log` showed no commit for any of it. Verified rather
than trusted, per this lane's standing rule.

**q45** ports the q28/q38 `<tool>: <message>`-on-stderr /
`process.exitCode = 1` shape to the ten tools that transitively import
`src/sim/content.ts` and had no try/catch anywhere: a runtime zod
`ZodError` (a schema violation — valid JSON, wrong shape — as opposed to
q33/q37/q41/q42's JSON *syntax*-error class, which fails at ES-module
transform time before any in-file try/catch could ever run) previously
escaped as a raw multi-frame stack dump. Seven tools get their `main()`
invocation wrapped; `fuzz-command-domain.ts`'s `main()` is an unawaited
async IIFE so it gets `.catch()` instead (a sync try/catch around the call
site cannot see a later promise rejection); the three top-level-script tools
(`m20d-run-a4.ts`, `m20d-swarm.ts`, `probe-boss.ts`) get their whole
executable body wrapped; `a4probe.ts` additionally guards its own
module-scope `loadContent()` call with `process.exit(1)` (needed so TS can
narrow `content`'s definite assignment past the catch), which is also what
fixes `m20d-run-a4.ts`'s crash on that path since it imports `a4probe.ts`.

Ran `npx vitest run tests/q45-cli-schema-violation.test.ts` live: 11/11
green. `npx tsc --noEmit -p .`: clean.

**Review (code-reviewer, APPROVE, 0 Critical/Major — 1 Minor, 1 Nit).** Traced
`m20d-swarm.ts`'s `clearSeconds` conversion from a top-level `function` to a
`const` arrow function nested inside the new outer `try` and confirmed its
`return` statements exit only the arrow function, never the outer `try`
block. Confirmed `fuzz-command-domain.ts`'s `.catch()` is the only construct
that can intercept the async IIFE's rejection. Confirmed the seven
`main()`/`invokedDirectly`-shaped tools' try/catch sit inside their existing
invocation guards, so importing them as modules is unaffected. Confirmed
`upgradeStepMul` is `z.number()` in `src/sim/content.ts`, so the test's
mutation is a genuine schema violation, not a syntax error — not vacuous.
Confirmed Scope: `git diff --stat -- src/** data/**` empty. Minor:
`m20d-run-a4.ts`'s own try/catch is dead code on the a4probe-import failure
path (a4probe's `process.exit(1)` fires first, so the user always sees
`a4probe: ...`, never `m20d-run-a4: ...`) — intentional, matches the test's
own `'a4probe'` prefix expectation, no fix needed. Nit: `a4probe.ts` mixes
`process.exit(1)` (immediate) with the rest of the fix's `process.exitCode = 1`
(deferred) — defensible (TS needs `never` to narrow `content`), left as-is.

**QA (qa-playtester, PASS).** Live 11/11. Manually verified two tools
(`perf-ratio.ts`, `probe-boss.ts`) outside the harness in a throwaway scratch
copy: clean one-line prefixed stderr, nonzero exit, no stack frame. Reverted
`perf-ratio.ts`'s fix via `git stash push` on just that file, reran its test
case alone, confirmed it goes red with the raw `ZodError` dump restored,
`git stash pop` restored byte-identical state. Adversarial probes beyond the
test's own single-field mutation — a different file (`classes.json`), a
two-file double corruption, a zod enum violation, and a non-zod
cross-reference throw (`waves.json` naming an unknown enemy key) — all
produced clean single-line messages; no coverage gap found. **Bug filed, not
blocking:** an intermittent (1-of-3 runs, not reliably reproducible) orphaned
scratch dir under `bench/.tmp/q45-cli-schema-violation-scratch/` on Windows,
same EBUSY/EPERM-class race the file's own header already documents for
q25/q28/q33/q37/q41's sibling scratch tests — reported as observed-once per
this lane's "cannot reproduce twice" honesty rule, not as a confirmed defect;
left as a note for whoever next touches scratch-cleanup hygiene rather than
filed as a new numbered item, since it's the same pre-existing class q46's
own convention already accepts.

**Suite state.** `npx vitest run tests/q45-cli-schema-violation.test.ts` —
11/11 green. `npx tsc --noEmit -p .` clean. Cleaned two empty scratch dirs
this session's own manual QA verification left under `bench/.tmp/`
(gitignored, no Scope impact either way) before committing.
`git status --porcelain` before commit: `BACKLOG-QUALITY.md`, the ten
`tools/*.ts` files, and `tests/q45-cli-schema-violation.test.ts` only —
Scope-compliant.

**Committed.**

**Four actionable items remain** (q46, q47, q48, q49; q39 stays a
Scope-blocked tracking entry). Above the generation floor of 3, so the next
session executes the top one (q46) directly.

### 2026-08-27 — session 39

**Feedback inbox:** `feedback/` exists but is empty. Nothing to process, nothing
moved.

**Found unlogged follow-on work already sitting in the worktree, uncommitted,
at session start** — the same recurring shape session 38's own log named
(sessions 14/16/18/19/20/37/38): a new `describe` block for q42
(`sweep.ts --json` crashes uncaught on a `/data` JSON syntax error too) was
already appended to `tests/q37-cli-json-syntax-error-siblings.test.ts`, fully
written and matching q42's acceptance criteria, but `git log` showed no commit
for it and session 38's own log didn't mention it (session 38 committed q41
only). `git status --porcelain` before starting showed only that one modified
file.

Verified rather than trusted: ran the file live (`npx vitest run tests/q37-
cli-json-syntax-error-siblings.test.ts`) — 4/4 green, including the new q42
case. `npx tsc --noEmit -p .` — clean.

**Review (code-reviewer, APPROVE, 0 Critical/Major — 1 Minor, 2 Nits).**
Confirmed the new test targets a code path (`sweep.ts --json`) the existing
`describe.each` block never exercises, confirmed live against `sweep.ts`'s
own source that the crash precedes `parse(process.argv)`, and confirmed the
`expect(stdout).toBe('')` assertion is the load-bearing discriminator against
a future fix. Minor: the new block drops the `not.toContain('sweep:')`
assertion its `describe.each` sibling carries — not a correctness gap, just
an unexplained asymmetry, left as-is. Scope and harness reuse both clean.

**QA (qa-playtester, PASS).** Live run 4/4 green. Adversarially confirmed the
assertions are load-bearing two ways: a manual control run against intact
`/data` (exit 0, clean JSON, empty stderr) contrasts with the corrupted-scratch
case; and temporarily removing the corruption call from the q42 block made the
test correctly fail (`exitCode` 0 vs `not.toBe(0)`), then restored byte-
identical. No leftover `bench/.tmp` dirs from this session's own runs. Flagged
one pre-existing, unrelated stray scratch dir (predates this session, gitignored,
no scope impact) for whoever next touches scratch-cleanup hygiene — not filed
as a q42 bug.

**Suite state.** `npx vitest run tests/q37-cli-json-syntax-error-siblings.
test.ts` — 4/4 green. `npx tsc --noEmit -p .` clean. `git status --porcelain`
before commit: `BACKLOG-QUALITY.md`, `tests/q37-cli-json-syntax-error-
siblings.test.ts` only — Scope-compliant.

**Committed.**

**Three actionable items remain** (q43, q44, plus q39 as a Scope-blocked
tracking entry — its own acceptance is already satisfied by
`tests/q35-weighted-index-nan.test.ts`'s existing "gap found by QA
verification" describe block; the remaining half needs main lane's `/src/**`
fix first). At the generation floor, so the next session runs the generation
rule before executing.

### 2026-08-27 — session 38

**Feedback inbox:** no `feedback/` directory exists in this worktree. Nothing
to process, nothing moved.

**Found unlogged follow-on work already sitting in the worktree, uncommitted,
at session start** — the same recurring shape (sessions 14/16/18/19/20/37):
`tests/q41-cli-json-syntax-error-siblings-2.test.ts` existed on disk, fully
written and matching q41's acceptance criteria exactly, but `git log` shows no
commit for it and no prior session's log entry described it. `git status
--porcelain` before starting showed only that one untracked file — nothing
else.

Verified rather than trusted, per this file's own standing lesson: ran the
file live (`npx vitest run tests/q41-...test.ts`) — 8/8 green, real nested
`tsx` subprocess invocations against scratch copies, not mocked. Ran
`npx tsc --noEmit -p .` — clean. Confirmed Scope compliance (`git status
--porcelain` showed only the one test file, no `/src/**`/`/data/**` touched).

**Review (code-reviewer, APPROVE, 0 Critical/Major/Minor/Nit — 2 non-blocking
observations).** Independently traced import chains confirming the file's
core claim: `perf-ratio.ts`, `a4probe.ts`, `a5probe.ts`, `fuzz-input.ts`,
`fuzz-save.ts`, `fuzz-weapon-boundary.ts` and `fuzz-command-domain.ts` all
transitively import `src/sim/content.ts` (via `Run`/`World`/`loadContent` or
tower/enemy helpers that import `world.ts`), while `mutation-probe.ts` has
zero such import and only ever fails on an uncaught `ENOENT` from its own
`populateScratch`, past module load. Ran the new file alongside both q33/q37
siblings together — 18/18 pass, no scratch-path collisions. Noted a stray
`.bak` file glimpsed transiently during review (an earlier draft of the
author's own authoring process) that was gone by review's end and not part of
the working tree — confirmed absent before commit.

**QA (qa-playtester, PASS).** Ran the file live, 8/8 green. Adversarial check
1: an intact `towers.json` in a `tests/`-less scratch dir fails with a
*different* error (`ERR_MODULE_NOT_FOUND` on `tests/helpers`), proving the
pinned `TransformError` is specifically the JSON-syntax corruption's doing,
not an artifact of the minimal scratch fixture. Adversarial check 2: swapped
`mutation-probe.ts` into the "crashes at import" `describe.each` list — the
test correctly went red, proving the assertions discriminate rather than
rubber-stamp. Confirmed no leftover `bench/.tmp/*q41*` scratch dirs after both
a clean pass and the deliberately-failed mutation run. Scope clean before and
after.

**Suite state.** `npx vitest run tests/q41-cli-json-syntax-error-siblings-2
.test.ts` — 8/8 green. `npx tsc --noEmit -p .` clean. `git status --porcelain`
before commit: `BACKLOG-QUALITY.md`, `tests/q41-cli-json-syntax-error-
siblings-2.test.ts` only — Scope-compliant.

**Committed.**

**Four actionable items remain** (q42, q43, q44, plus q39 as a Scope-blocked
tracking entry), above the generation rule's floor of 3, so the next session
does not need to run it.

### 2026-08-27 — session 37

**Feedback inbox:** no `feedback/` directory exists in this worktree. Nothing
to process, nothing moved.

**Found session 36's unlogged follow-on work already sitting in the
worktree, uncommitted, at session start** — the same shape sessions
14/16/18/19/20 each hit before: `tools/mutation-probe.ts` had a diff on disk
implementing q40 in full (three new `MUTATIONS` entries —
`gate-audit-remove-main-trycatch`, `phase-coverage-remove-main-trycatch`,
`soak-construction-outside-try` — reverting q28's three try/catch guards in
`gate-audit.ts`/`phase-coverage.ts`/`soak.ts`, plus the doc-comment count
bump to 23 invocations / 15 mutations / 8 testFiles), but no session log
entry described it and it was never committed. `git status --porcelain`
before starting showed only that one file modified — nothing else. q39 was
skipped first: its own acceptance text says the QA-verification pin already
exists (confirmed live in `tests/q35-weighted-index-nan.test.ts`'s "gap
found by QA verification" describe block) and the only remaining action is
one of three `/src/**` fixes, out of Scope — a tracking entry with no
further in-Scope work until main lane acts, not a skip without reason.

Verified rather than trusted, per this file's own standing lesson: read the
diff directly and checked each new mutation's `find` anchor against the live
`tools/gate-audit.ts`, `tools/phase-coverage.ts` and `tools/soak.ts` (exact
match, matches the pre-q28 shape each mutation's `source` comment claims);
confirmed `tests/q28-cli-error-handling.test.ts` has the three named describe
blocks (`gate-audit.ts CLI failure path (q28)`, `phase-coverage.ts CLI
failure path (q28)`, `soak.ts CLI failure path (q28)`) the new entries
target. Ran `npx vitest run tests/q28-cli-error-handling.test.ts
tests/q12-soak.test.ts` standalone — 19/19 green — and `npx tsc --noEmit -p .`
— clean. Also ran the full `tests/q14-mutation-smoke.test.ts` live: 16/28
red, every one the documented `gitDiffClean()`-sees-the-uncommitted-lane-diff
artifact (sessions 26-29, 36) — each failing case's `testFailed` assertion
(the substantive check) passed; only `realFileUntouched` (which necessarily
sees this session's own uncommitted `tools/mutation-probe.ts` diff under a
whole-repo, no-pathspec `git diff`) failed, plus the suite's own
fixture-must-start-clean case for the same reason. Not a regression, not
touched.

**Review (code-reviewer, APPROVE, 0 Critical/Major/Minor/Nit).** Independently
verified all three `find` anchors against the live files, confirmed the
`replace` text reproduces each pre-q28 shape, confirmed doc-comment
arithmetic (15 mutations, 8 distinct `testFile`s, 23 invocations) is exact,
confirmed Scope (`tools/mutation-probe.ts` only), and re-derived the
`gitDiffClean()` self-referential-artifact reasoning independently from the
source rather than taking it on faith.

**QA (qa-playtester, PASS).** Ran all three new mutations for real via
`probeOne` against fresh scratch copies plus a `probeControl` positive
control (9/9 green unmutated); confirmed each mutation reds *exactly* its
claimed two test cases and nothing else, with the distinguishing failure
signal matching each mutation's own description (raw ENOENT stack for
gate-audit, raw multi-line ZodError dump for phase-coverage, empty stdout —
`main()` never reaching its own output — for soak's construction-outside-try
case). Adversarial: could not make any mutation fail for the wrong reason,
touch an unrelated file, or leave the tree dirty across two independent
runs. One non-bug observation: q40's acceptance text names both
`tests/q28-cli-error-handling.test.ts` and `tests/q12-soak.test.ts` as
targets, but all three new entries wire only to the former — checked
`q12-soak.test.ts` directly and it has no construction-time-corruption case
to catch these three mutations against, so the narrower wiring is correct
engineering, just looser backlog wording than the shipped implementation.

**Suite state.** `npx vitest run tests/q28-cli-error-handling.test.ts
tests/q12-soak.test.ts` — 19/19 green. `npx tsc --noEmit -p .` clean.
`git status --porcelain` before commit: `BACKLOG-QUALITY.md`,
`tools/mutation-probe.ts` only — Scope-compliant.

**Committed.**

**Five actionable items remain** (q41, q42, q43, q44, plus q39 as a
Scope-blocked tracking entry), above the generation rule's floor of 3, so
the next session does not need to run it.

### 2026-08-27 — session 36

**Feedback inbox:** no `feedback/` directory exists in this worktree. Nothing
to process, nothing moved.

**Two actionable items were in queue** (q38, q39 — below the generation
rule's floor of 3), so the generation rule ran first. (a) Ran `npx tsx
tools/gate-audit.ts` and `npx tsx tools/sweep.ts --seeds 12 --policies
maxbuild,hybrid`: gate split unchanged (8 covered, 12 holes, every hole
tracing to a P-phase not yet reached), sweep numbers match the documented
bimodal-Act-II state — nothing new. (b) SPEC-FINAL coverage diff and
`tools/content-census.ts`'s own re-run: unchanged since session 23 (7/10
categories). (c) Engineer's judgment, reading `tools/mutation-probe.ts` and
every remaining CLI-invokable `tools/*.ts` file directly: q28's three
try/catch guards only got two matching mutation-probe entries — filed q40.
While tracing that, re-read q37's own "more siblings may exist" caveat and
filed q41 (check every other CLI-invokable tool for real) and q42 (the one
specific untested `sweep.ts --json` path session 35's log flagged but never
filed). q43 automates q31's "recount rather than trust the doc comment"
habit, closing a sixth instance of this lane's most recurring trap. q44
challenges the six-session-repeated "just contention" read on the
`q15-command-domain-fuzz` flake per CLAUDE.md's own measurement rules. Five
items appended (q40-q44). Took **q38**, the already-queued, most concretely
ready item — a verified-live, in-Scope fix with a named test file and a
clear before/after — over the freshly generated q40-q44.

**q38 done.** `tools/content-census.ts`'s `main()` used to run inside a
`try` around a `census()` call whose *default parameter* (`loadContent()`)
was resolved from a **statically** imported `loadContent`, so a `/data`
JSON *syntax* error crashed at module-transform time, before the try/catch
this file itself owns ever ran (q33's finding, inherited unfixed at q37
because the general fix lives in `src/sim/content.ts`, outside this lane's
Scope). Session 31's QA pass on q33 found a working, in-Scope, per-file
workaround for this one CLI specifically: split `Content` into a type-only
import (erased at compile time, no runtime load) and make `loadContent`
itself a dynamic `await import('../src/sim/content')` call made *inside*
`main()`'s existing try. `census()` now takes `content: Content` as a
required argument instead of defaulting it. `main()` becomes `async`, with
a `.catch()` fallback on its top-level invocation. `tools/mutation-probe.ts`'s
`content-census-remove-trycatch` entry updated in lockstep so its `find`
string still matches the new source shape byte-for-byte.
`tests/q33-cli-json-syntax-error.test.ts` updated: `content-census.ts`
dropped from the "still crashes uncaught" `describe.each` table, doc
comment rewritten to explain the two-tier state (general fix still owed to
main lane; this one CLI's per-file workaround landed), and a new describe
block pins the fixed behaviour live — plain mode's single `content-census:
...` stderr line and `--json` mode's single parseable `{"error": ...}`
stdout line, both nonzero exit, neither a raw stack frame.

**Review (code-reviewer, APPROVE, 0 Critical/Major, 1 harmless Nit).**
Live-ran the target test files (25/25 green) plus `tsc --noEmit` (clean)
rather than reading the diff cold. Verified the fix's entire premise
directly rather than trusting the doc comment: a rejected dynamic `import()`
inside an `async` function's `try` is a normal `throw`, caught by the
existing `catch` — confirmed live against a syntax-broken `towers.json`.
Checked `census()`'s new required-argument signature against every call
site (`main()` itself, `tests/q16-content-census.test.ts`) — both already
pass an explicit argument, no compile break. Checked the updated
`mutation-probe.ts` `find` string for an exact byte match against the new
source; an initial naive comparison against the on-disk CRLF file read as
zero occurrences, which the reviewer traced to `applyEdits`'s own
pre-existing `\n`→`\r\n` normalization (undiffed logic) rather than filing
it as a bug — one occurrence once normalized correctly. Nit: the new
top-level `.catch(console.error)` fallback is unreachable given current
code paths — harmless, no action taken.

**QA (qa-playtester, PASS).** Independently reproduced the syntax-error fix
live in a fresh scratch copy for both plain and `--json` modes, matching
the acceptance text verbatim. Positive control (valid `towers.json`
restored) still produces normal output, ruling out a vacuous "never reaches
main" pass. Confirmed no regression on the adjacent case q25 already owns —
a schema-valid-but-semantically-broken `/data` file still gets the
collapsed one-line zod-message treatment, unaffected by this change.
Grepped `census(` repo-wide: `phase-coverage.ts`/`fuzz-data.ts` define
unrelated same-named functions; the only external caller of this file's
`census()` already passes an explicit argument. Ran `tests/q14-mutation-
smoke.test.ts` in full and inspected all 13 failures individually: every
one is a `gitDiffClean()`-based "real file must be untouched"/"fixture must
start clean" pre-check seeing this session's own then-uncommitted diff to
`tools/content-census.ts`/`tools/mutation-probe.ts` — the same documented
artifact sessions 26-29 already recorded, not a mutation-detection-logic
failure, and not touched. No bugs filed.

**Suite state.** `npx vitest run tests/q33-cli-json-syntax-error.test.ts
tests/q25-content-census-cli.test.ts tests/q16-content-census.test.ts` —
25/25 green. `npx tsc --noEmit -p .` clean. `git status --porcelain` before
commit: `BACKLOG-QUALITY.md`, `tests/q33-cli-json-syntax-error.test.ts`,
`tools/content-census.ts`, `tools/mutation-probe.ts` — Scope-compliant.

**Committed.**

**Six actionable items remain** (q39, q40, q41, q42, q43, q44, all unchecked
and unblocked), above the generation rule's floor of 3, so the next session
does not need to run it.

### 2026-08-27 — session 35

**Feedback inbox:** no `feedback/` directory exists in this worktree (checked
with `ls feedback/`). Nothing to process, nothing moved. `git status` at
session start was clean.

**Three actionable items were in queue** (q37, q38, q39 — at the generation
rule's floor of 3, so the generation rule did not run). Took q37, the top
item: pin the q33 uncaught-crash gap (a `/data` JSON *syntax* error crashes
`main()`-level try/catch cannot intercept, because `src/sim/content.ts`
loads `/data/*.json` via a static ES import transformed before any of a
CLI's own code runs) for the three CLIs q33 never covered —
`tools/sim.ts`, `tools/sweep.ts`, `tools/handoff-metrics.ts`, all three
CLAUDE.md's own documented headline entry points.

**q37 done.** New file `tests/q37-cli-json-syntax-error-siblings.test.ts`,
modeled directly on `tests/q33-cli-json-syntax-error.test.ts`'s scratch-copy
idiom: `breakTowersJsonSyntax` writes `'{ not valid json'` to a scratch
copy's `data/towers.json`, then each of the three tools is run with its
CLAUDE.md-documented example args (`sim.ts --seed 1 --policy hybrid`,
`sweep.ts --seeds 1`, `handoff-metrics.ts` with no args — it takes none and
calls `loadContent()` at module top level, before its own `main()` even
starts) and asserted to crash identically to q33's other three: exit
non-zero, empty stdout, stderr matching `Transform failed with N error` plus
a raw stack frame, `towers.json` named, no clean `toolname:`-prefixed
message. Ran all three live before writing assertions, per this lane's own
convention.

**Review (code-reviewer, APPROVE, 0 Critical/Major, 1 cosmetic Minor).**
Confirmed the syntax-error helper is genuine (not a schema violation),
confirmed each tool's CLI args against its real `parseArgs`/`parse`
function, confirmed the scratch-copy/cleanup logic is structurally
identical to q33's and leaves no leaked temp dirs, confirmed the assertions
pin real (not vacuous) behaviour by running the file, confirmed Scope
compliance (`tests/**` only). The one Minor — a Node `DEP0190` deprecation
warning from `execFileSync`'s `shell: true` — is inherited verbatim from
q33, not new risk.

**QA (qa-playtester, PASS).** Independently reproduced the crash by hand
for all three tools in a separate manual scratch copy (confirming along the
way that the scratch dir's placement inside `bench/.tmp` — nested in the
repo tree, so Node's module resolution walks up to the root `node_modules`
— is load-bearing: a copy under `/tmp` fails differently, with `Cannot find
module 'zod'`). Ran a positive control (valid `towers.json` restored) to
rule out a vacuous pass: `sim.ts` exits 0 and prints a full JSON report
line, proving `execFileSync`'s catch branch and the `stdout === ''`
assertion are genuine crash signals, not artifacts of the tools being
normally silent. Confirmed no leftover scratch dirs from this session's
runs (one stale `q33` scratch dir was found but its timestamp/PID predate
this session — not a q37 regression). Full suite: 935 passed / 2 failed,
both the already-documented `tests/q15-command-domain-fuzz.test.ts`
worker-timeout flake cluster — isolate-rerun 25/25 green, confirmed
non-reproducible per this lane's established flake bar rather than filed as
new. One non-blocking observation: unlike q33's sibling test, this file has
no `--json`-flag variant; `sim.ts`/`handoff-metrics.ts` have no such flag,
and `sweep.ts`'s `--json` path is untested here (almost certainly crashes
identically, since the crash precedes `argv` inspection, but unverified) —
QA judged this doesn't fail q37's literal acceptance text and did not file
it as a bug.

**Suite state.** `npx vitest run tests/q37-cli-json-syntax-error-siblings
.test.ts` — 3/3 green. `npx tsc --noEmit -p .` clean. `git status
--porcelain` before commit: `BACKLOG-QUALITY.md`,
`tests/q37-cli-json-syntax-error-siblings.test.ts` — Scope-compliant.

**Two actionable items remain** (q38, q39), one below the generation rule's
floor of 3 — the next session runs the generation rule before executing.

### 2026-08-27 — session 34

**Feedback inbox:** no `feedback/` directory exists in this worktree (checked
with `ls feedback/`). Nothing to process, nothing moved. `git status` at
session start was clean.

**Four actionable items were in queue** (q36-q39, above the generation
rule's floor of 3, so the generation rule did not run). Took q36, the top
item.

**q36 done.** Added a new describe block to `tests/q21-weapon-boundary-fuzz
.test.ts`, right after q32's positive-control block: a world with 7 valid
soul candidates and `weaponSlots=6`, a real `souls` Command submitted with 6
keys where one repeats (5 distinct), driven through the real `applyCommand`.
Confirms today's actual behaviour: only 5 souls bind, not 6 — the duplicate
consumes a slot instead of being rejected or deduped in favour of the 7th
candidate.

**Review (code-reviewer, APPROVE, 0 Critical/Major, 1 Minor, 1 Nit).**
Independently re-derived the mechanism against `src/sim/run.ts`'s `'souls'`
case, `src/sim/sundering.ts`'s `finishSundering`, and `src/sim/progression
.ts`'s `bindSouls`, confirmed the test's key arithmetic (7 candidates, 6
submitted with exactly 1 repeat) is well-formed rather than an off-by-one,
confirmed no duplicate assertion exists elsewhere, ran the file (52/52) and
`tsc` (clean), confirmed Scope compliance. The Minor: the closing assertion
only counted overlap with the 5 submitted-distinct keys, so it would stay
green even under a future "dedupe the input, then backfill the freed slot
from an unclaimed candidate" fix — narrower than the acceptance line's own
"a future dedupe fix is visible as a test change" claim. Strengthened before
QA: added a total-roster-size assertion (`w.weapons.length === distinctPicked
.length + 1`) and an explicit check that no unsubmitted valid candidate ever
gets bound, so a backfill-shaped fix flips this test too.

**QA (qa-playtester, PASS) found the strengthening still had a real gap** —
the same "note overstates the coverage it cites" shape this lane has hit
before (q17, q19, q22, q28, q35): a plausible "dedupe the submitted keys,
then slice to `weaponSlots`, no backfill" fix produces a *bit-identical*
result to today's bug in this exact scenario (5 bound, one candidate never
offered a slot) — confirmed by QA both arithmetically and by swapping
`bindSouls`'s loop for a `Set`-based dedupe-then-slice implementation against
the real harness and re-running the new assertions unchanged. That fix shape
doesn't actually resolve the underlying complaint (a slot is still wasted),
but nothing in the test would flag it as unresolved. QA confirmed the
reject-whole-command and dedupe-and-backfill fix shapes are both genuinely
caught; only dedupe-without-backfill slips through invisibly. QA also
confirmed no ordering/state-leak issues and that the test's soul-key setup
doesn't rely on any assumed sort order.

**Added an aspirational `it.skip` pinning the fully-fixed target** rather
than stretching the live assertions to cover a fix shape that produces
identical numbers to the bug (nothing observable *can* distinguish "still
buggy via incidental collapse" from "still wasting the slot via an explicit
dedupe-only fix" in this one scenario — the two are the same behaviour by
construction). The skipped case asserts `boundSoulCount === weaponSlots`
(all 6 slots filled, the unclaimed 7th candidate irrelevant once a real fix
lands) with a comment naming today's actual number (5) and QA's finding by
name, so a fix that only dedupes without backfilling is a visible `.skip`
still sitting there for the next session to notice and flip, rather than a
silently-passing test that looks like the bug was fixed when the design
defect (wasted slot) persists under a different mechanism.

**Suite state.** `npx vitest run tests/q21-weapon-boundary-fuzz.test.ts` —
53/53 green (52 + 1 new `.skip`, so 52 run + 1 skipped). `npx tsc --noEmit -p
.` clean. Full suite (`npx vitest run`) run in background: 918 passed / 79
skipped / 16 failed, but every failure is the already-documented
`tests/q14-mutation-smoke.test.ts`/`tests/q15-command-domain-fuzz.test.ts`
resource-contention flake cluster (this lane's log has now recorded this
exact non-reproducible worker-timeout shape well over half a dozen times —
see the many `contention`/`flake` hits across this file). Confirmed rather
than assumed: re-ran `tests/q15-command-domain-fuzz.test.ts` alone
immediately after — 25/25 green — and confirmed `tests/q21-weapon-boundary-
fuzz.test.ts` itself passed cleanly inside the same full-suite run (52/52,
302ms). Not filed as a new bug, per QA's own established non-reproducible-
flake bar this lane has applied consistently since session ~9.
`git status --porcelain` before commit: `BACKLOG-QUALITY.md`,
`tests/q21-weapon-boundary-fuzz.test.ts` — Scope-compliant.

**Three actionable items remain** (q37, q38, q39), at the generation rule's
floor of 3.

### 2026-08-27 — session 33

**Feedback inbox:** no `feedback/` directory exists in this worktree (checked
with `ls feedback/`). Nothing to process, nothing moved. `git status` at
session start was clean — no leftover uncommitted work this time.

**Four actionable items were in queue** (q35-q38, above the generation
rule's floor of 3). Took q35, the top item: a direct unit test of
`Rng.weightedIndex`'s NaN-weight fallback, plus a check of whether
`luckBias`/`derived.luck` can go non-finite through a real Luck source.

**q35 done.** `tests/q35-weighted-index-nan.test.ts` (new file, no `World`/
`applyOffer` involved per the item's own acceptance line): pins
`weightedIndex`'s NaN mechanism directly (`total` goes `NaN`, every `r < 0`
scan comparison is therefore `false`, falls through to `weights.length - 1`)
across several seeds, several NaN positions, an all-zero-plus-NaN case, and
a byte-identical-across-RNG-states case mirroring q30's own indirect
symptom, plus a fairness control proving the invariant is about the NaN and
not a blanket always-last-index bug. Second half: confirmed via `Stats.add`
(`src/sim/stats.ts:148`) that a *single* poisoned Luck source can never
reach `total('luck')` non-finite, since `add` drops non-finite values before
storing them — traced and confirmed no other writer of `Derived.luck`
exists (`derive()` is the sole one, always `s.total('luck')`).

**Review (code-reviewer, APPROVE, 0 findings, 1 nit).** Independently
re-derived the NaN-fallthrough mechanism against `src/sim/rng.ts`,
independently confirmed `Stats.add`'s guard is sufficient for the
single-source claim, ran the test and `tsc` clean, confirmed no duplicate
test exists (`a11-determinism.test.ts` tests `weightedIndex` fairness only,
`q21-weapon-boundary-fuzz.test.ts` tests the *indirect* symptom through
`World`/`applyOffer`), confirmed Scope compliance. One nit: the header
comment's claims duplicate what the acceptance line already required
checking — not a defect.

**QA (qa-playtester, PASS) found a real gap the "even a maximally poisoned
set... can never make total('luck') non-finite" claim overstated** — the
same "note overstates the coverage it cites" trap this lane has hit before
(q17, q19, q22, q28), this time in a claim I wrote this session rather than
inherited. `Stats.add`'s guard checks only the incoming value, not the
running sum: two *individually finite* extreme contributions (each a legal
double, e.g. `1.5e308`, comfortably under `Number.isFinite`'s bar) overflow
`total()`'s own summation loop to `±Infinity` with no guard anywhere in that
path. QA traced the negative case all the way to `luckBias`:
`Math.min(0.5, x)` clamps the positive overflow to 0.5 (silently masking
it) but does nothing for `-Infinity`, so a `-Infinity` `luckBias` reaches
`rollOffers` uncaught, reproducing this same item's `weightedIndex`
fallback through a second vector. QA also traced a real, reachable delivery
path: `src/meta/meta.ts:322`'s `deserializeMeta` does a bare `JSON.parse` +
type assertion with **zero schema validation**, so a tampered save with two
extreme-valued relic affixes round-trips unchanged into a real run's
`Stats`; separately `src/sim/content.ts:380-387`'s `AffixSchema` has no
`.finite()`/bound on affix `min`/`max`, so the same class of value is
authorable in `/data` directly. Independently re-verified QA's repro live
(scratch vitest file, deleted after) before trusting it: confirmed both the
positive-overflow-to-`Infinity` and negative-overflow-to-`-Infinity`-through-
`luckBias` results exactly as reported.

**Corrected the test file rather than leaving the overclaim standing.**
Narrowed the docstring/describe-block title from "cannot go non-finite
through a real Luck source" to "...through a single poisoned source," and
added two new pinned cases (`tests/q35-weighted-index-nan.test.ts`'s final
describe block) reproducing the overflow-to-`Infinity` and the
uncaught-`luckBias`-to--`Infinity` chain, so today's actual gap is on
record precisely instead of a claim that doesn't cover it. Filed the fix
itself as **q39** for main lane (`Stats.add`/`total()` guarding the running
sum, `AffixSchema` bounding values, `deserializeMeta` validating against a
schema — all `/src/**`, outside this lane's Scope).

**Suite state.** `npx vitest run tests/q35-weighted-index-nan.test.ts` —
9/9 green (7 original + 2 added post-QA). `npx tsc --noEmit -p .` clean.
`git status --porcelain` before commit: `BACKLOG-QUALITY.md`,
`tests/q35-weighted-index-nan.test.ts` — Scope-compliant.

Full-suite run (`npx vitest run`) deferred to background per this lane's
usual ~5-9 minute runtime; will confirm clean before or note any
pre-existing-cluster overlap in a follow-up entry if it surfaces anything
not already documented in prior sessions' logs.

**Three actionable items remain** (q36, q37, q38) plus the newly-filed
q39 (four total), still above the generation rule's floor of 3.

### 2026-08-27 — session 32

**Feedback inbox:** no `feedback/` directory exists in this worktree (checked
with `ls feedback/`). Nothing to process, nothing moved.

**Found session 31's q33 implementation sitting uncommitted at session
start** — the same leftover-work shape sessions 14/16/18/19/20/22/27/29 have
each hit before. Present: `tests/q33-cli-json-syntax-error.test.ts` and a
`BACKLOG-QUALITY.md` diff marking q33 `[x]` and adding q37/q38, exactly
matching session 31's own Log entry (which claimed "Committed" but the
commit never actually landed — `git log` topped out at q32/`6a1e20d`).
Independently re-verified rather than trusted: `npx vitest run
tests/q33-cli-json-syntax-error.test.ts` (7/7 green), `npx tsc --noEmit -p .`
(clean), Scope compliance (only `BACKLOG-QUALITY.md` + the one new test file).
Recovered and committed as `72ff595`.

**Five actionable items were in queue** (q34-q38, above the generation
rule's floor of 3, so the generation rule did not run). Took q34, the top
item.

**q34 done.** `tools/fuzz-weapon-boundary.ts` gains a 6th `BoundaryCase`
category, `'damageBonus'`: `damageBonusBoundaryCases()` fuzzes both
`grantWeapon` branches (create and update) over `[0, 0.5, -1, Infinity,
-Infinity, NaN]`, granting a real `arrow_volley`, spawning a real `husk` in
range, and measuring the verdict from `Number.isFinite(e.hp)`/
`Number.isFinite(w.damageTotal)` after one `updateWeapons` tick — not from
`ws.damageBonus` alone, per the item's own acceptance line. Had to add
`w.rebuildBuckets()` after `spawnEnemy` — without it `nearestEnemy`/
`enemiesInRadius` read an empty spatial hash (only `Run.step()` or an
explicit rebuild populates it; `f004-class-framework.test.ts` already uses
the identical pattern) and the weapon silently never fires, which the first
run of the tool surfaced directly (`e.hp` unchanged, `damageTotal=0` for
every case, including the ones expected to corrupt).

**Measured (not assumed) results**, matching the bug report's own framing:
`create:posInf`/`update:posInf` — enemy dies cleanly (`-Infinity <= 0` is
`true`) but `w.damageTotal` is poisoned to `Infinity` permanently;
`create:nan`/`update:nan` — enemy is left immortal (`NaN <= 0` is `false`,
`killEnemy` never fires) and `damageTotal` goes `NaN` permanently. Two
adjacent inputs measure `'ok'` and are pinned as such with reasoning rather
than silently passed over: `fractional` (0.5) exceeds `data/weapons.json`'s
`inheritDamageCap` (0.4) uncapped on the *stored* field — a real but
non-corrupting cap-bypass gap, distinct from this category's hp/damageTotal
measure, noted in the doc comment rather than filed as a new item (it's a
narrower version of the same "no clamp at all" root cause q34 already
covers); `negInf` on the create branch produces `damage = -Infinity`, which
`damageEnemy`'s own `amount <= 0` guard happens to catch before writing
anything. On the *update* branch specifically, `negative`/`negInf` also
measure `'ok'`, but only because `Math.max(existing.damageBonus=0, x)`
incidentally floors both back to `0` — the same "accidental safety net"
shape q32 already found for a different field, not a real guard.
`DAMAGE_BONUS_HOLES` pins all of this in `tests/q21-weapon-boundary-fuzz.ts`;
`tests/q21-weapon-boundary-fuzz.test.ts` adds the hole-map assertion, a new
describe block with `it.each` repros for both `posInf`/`nan` branches
directly asserting `e.hp`/`e.dead`/`w.damageTotal`, a legitimate-case control
at the real `inheritDamageCap` (0.4, clean finite hit), and a reachability
control confirming `deriveSouls`'s real output is always finite/`>= 0`/
capped. Census: 39 -> 51 total cases, 14 -> 18 non-`'ok'`.

**Review (code-reviewer, APPROVE, 0 findings).** Independently re-derived the
NaN/Infinity/guard mechanism against `src/sim/weapons.ts`/`src/sim/
enemies.ts` rather than trusting the test's own comments, independently ran
`npx tsx tools/fuzz-weapon-boundary.ts` and confirmed the live output
matches `DAMAGE_BONUS_HOLES` exactly, confirmed the update-branch
`Math.max`-floor reasoning, confirmed `rebuildBuckets()` is the same
idiomatic pattern already used in `f004-class-framework.test.ts`, and swept
`WeaponState` for other unguarded `grantWeapon` parameters (found none beyond
`level`/`damageBonus`, already covered).

**QA (qa-playtester, PASS).** Independently reproduced both `Infinity`/`NaN`
cases live in a throwaway scratch script (deleted after use, `git status`
clean afterward), confirmed `w.damageByWeapon[source]` is poisoned
identically to `damageTotal` (same write site, `enemies.ts:220-221` — not a
new gap, already covered by the acceptance line's own text), checked a third
`grantWeapon` call (update-then-update-again) behaves identically to the
tested create-then-update sequence, and checked a poisoned-then-legitimate
re-grant does not recover (`Math.max(NaN, 0.3)` stays `NaN` — a true
corollary of the documented propagation, not a newly *reachable* risk, since
the only real caller always passes a finite capped value once per
Sundering). No new bugs filed.

**Suite state.** `npx vitest run tests/q21-weapon-boundary-fuzz.test.ts` —
51/51 green (up from 39). `npx tsc --noEmit -p .` clean. `git status
--porcelain` before commit: `BACKLOG-QUALITY.md`, `tests/q21-weapon-boundary
-fuzz.ts`, `tests/q21-weapon-boundary-fuzz.test.ts`, `tools/fuzz-weapon
-boundary.ts` — Scope-compliant.

Full-suite background run (`npx vitest run`, ~534s): 909 passed, 15 failed,
79 skipped across 2 files, neither touched by this session's diff. Both
failure clusters are the exact pre-existing shapes session 30's log already
documented: `tests/q14-mutation-smoke.test.ts` (13 failures) is
`gitDiffClean()` seeing this session's own then-uncommitted lane diff, which
clears once the diff is committed (not independently re-verified after
commit this session, since re-running the full suite a second time wasn't
warranted for an already-documented, self-clearing artifact); `tests/q15
-command-domain-fuzz.test.ts` (2 failures, `rekindle.structureId:fractional`/
`:negInf` showing `"hangs"`) reran standalone afterward — 25/25 green —
confirming resource-contention flakiness under the full suite's heavy
parallel load, not a regression from this session's change (which never
touches `tools/fuzz-command-domain.ts` or its test file).

**Committed** as `6d85cc9`. Correction: that commit's subject line reads
"...files q35 sibling", copied from the q30/q32 commit-message style without
checking it applied — q35 was already in the queue before this session
started (filed by the session that landed q30), not newly filed by q34. No
new item was filed this session (QA's own verdict: "No new bugs filed").
Noting the mismatch here rather than amending, per this lane's own
never-amend convention (session 29's commit-hash-correction log entry is the
precedent for fixing this kind of thing forward instead of rewriting
history).

**Four actionable items remain** (q35, q36, q37, q38), above the generation
rule's floor of 3, so the generation rule does not need to run next session
either.

### 2026-08-27 — session 31

**Feedback inbox:** no `feedback/` directory exists in this worktree (checked
with `ls feedback/`). Nothing to process, nothing moved.

**Found q33's implementation already sitting in the worktree, uncommitted, at
session start** — the same leftover-work shape sessions 14/16/18/19/20/22/29
have each hit before (a prior session implemented and stopped short of
review/commit). Present: `tests/q33-cli-json-syntax-error.test.ts` (new, 7
tests) and a `BACKLOG-QUALITY.md` diff marking q33 `[x]` and adding q37. No
Log entry existed for this work yet. Verified rather than trusted, per this
file's own standing lesson.

**q33 done.** `tests/q33-cli-json-syntax-error.test.ts` pins the gap q25/q28
don't close: those two items' try/catch guards only catch *schema*
violations in `/data/*.json` (a zod parse failure at `loadContent()`
runtime); a JSON *syntax* error never reaches `loadContent()` at all,
because `/data/*.json` is loaded via static ES module `import` in
`src/sim/content.ts`, parsed by `tsx`'s esbuild transform at module-load
time — before any of `main()`'s code, including every try/catch q25/q28
added, ever runs. The test corrupts a scratch copy's `data/towers.json`
with `{ not valid json` and drives real nested `npx tsx tools/<tool>`
processes for `content-census.ts`, `phase-coverage.ts` and `soak.ts`,
asserting each crashes uncaught (nonzero exit, empty stdout, a raw
multi-frame `Transform failed with N error` esbuild stack on stderr, in
both plain and `--json` mode), plus a control proving `gate-audit.ts` is
genuinely unaffected (it never imports `src/sim/content.ts`/`Run` at all,
so a corrupted `/data` file leaves it clean).

**Review (code-reviewer, REQUEST-CHANGES then addressed).** Confirmed the
test itself is correct, green (7/7), `tsc`-clean, and Scope-compliant (only
`tests/**` + this file touched), and independently confirmed
`gate-audit.ts`'s imports never reach `src/sim/content.ts`. Found two Major
bookkeeping gaps in the leftover diff, both about this file's own discipline
rather than the test: (1) q33 was marked `[x]` without satisfying its own
acceptance line, which requires filing the `src/sim/content.ts` fix as
main-lane work in this file's Log — no such entry existed; (2) q37's refs
line cited "session 31 log" when no session 31 entry existed anywhere in the
file yet — a dangling citation for a QA pass that, at diff time, had no
corresponding record. Both are fixed by this entry and the real
qa-playtester pass below, which is what session 31's log now actually
documents.

**QA (qa-playtester, PASS with a correction).** Independently reproduced
q33's gap live in a throwaway scratch copy (corrupted `data/towers.json`,
ran `content-census.ts` directly, got the identical raw `Transform failed
with 1 error` stack; ran `gate-audit.ts` against the same corruption,
confirmed clean exit 0) before trusting the test's own claims. Confirmed
`tests/q33-cli-json-syntax-error.test.ts` green (7/7) and leak-free (no
stray `bench/.tmp/q33-*` directories survive a run; noted one unrelated,
pre-existing stale directory under `bench/.tmp/q14-mutation-scratch/` from
an older session, not created by this test or this session, out of scope
here).

Adversarially extended q33's own scope (per this lane's standing pattern):
grepped all of `tools/*.ts` for imports of `src/sim/content.ts`/`Run`/
`loadContent` (16 hits, far more than the four q33 scoped) and live-
reproduced the identical crash on three of them — `tools/sim.ts`,
`tools/sweep.ts`, `tools/handoff-metrics.ts` — all three the exact commands
CLAUDE.md's own "Stack & commands" section documents as headline entry
points, none of them previously guarded by any try/catch. Filed as an
expanded q37 (originally drafted citing only `sim.ts`/`sweep.ts`; corrected
to add `handoff-metrics.ts`, the genuinely-substantiated session-31
citation, and a note that the remaining 13 grep hits were not individually
reproduced, only measured-as-plausible, so more siblings may still exist).

QA also **tested rather than assumed** q33/q37's shared premise that the
root-cause fix can't be moved into this lane's Scope at all, and found that
premise overstated for one CLI: a scratch-copy experiment (type-only
`import type { Content }` plus a dynamic `await import('../src/sim/
content')` call inside `content-census.ts`'s own existing try/catch) fully
closed the gap with zero `/src/**` changes, producing the exact clean
one-line-message / single-parseable-`--json`-line q25/q28 already
established as this lane's bar. The same trick does not extend cleanly to
`phase-coverage.ts`/`soak.ts` (both call `Run`/`makePolicy` from inside
multiple exported, synchronously-called functions that `tests/q12-soak
.test.ts` and friends already call as plain sync functions — making the
import dynamic would force those `async`, a breaking signature change QA
time-boxed rather than built). Filed as q38: a real, in-Scope, verified-
working interim fix opportunity for `content-census.ts` specifically,
distinct from q33/q37's pin-only acceptance. This is the same "a claim
overstates what was actually checked" shape this lane has now caught five
times (q17, q19, q22, q28, and this) — this time in the lane's own item
text rather than a tool's doc comment.

**Main-lane bug filed (q33's own acceptance line, per q18's precedent for
an unfixable-from-Scope gap):** the root-cause fix — replace `src/sim/
content.ts`'s static `import ... from '../../data/*.json'` statements (all
15 files) with a dynamic, pre-validated read (`readFileSync` +
`JSON.parse` inside `loadContent()`, or the dynamic-`import()` pattern q38
verifies works for at least one call shape) — is outside this lane's Scope
(`/src/**` is forbidden here) and needs main-lane engineering. Concretely:
today, a JSON *syntax* error (not a schema violation — q25/q28 already
handle those) in any `/data/*.json` file crashes every CLI that
transitively imports `src/sim/content.ts` with a raw, multi-frame esbuild
`TransformError` stack trace, before any `main()`-level error handling
(including everything q25/q28 added) ever gets a chance to run. Confirmed
affecting at least seven entry points this lane has now checked
(`content-census.ts`, `phase-coverage.ts`, `soak.ts`, `gate-audit.ts` is
the one exception; `sim.ts`, `sweep.ts`, `handoff-metrics.ts`), including
the two headline commands (`npm run sim`, `tools/sweep.ts`) CLAUDE.md's own
"Stack & commands" section names directly. Regression coverage:
`tests/q33-cli-json-syntax-error.test.ts` (this session) pins three of the
seven; q37 (filed this session) is the not-yet-implemented sibling test for
the other three now-confirmed CLIs.

**Suite state.** `npx vitest run tests/q33-cli-json-syntax-error.test.ts` —
7/7 green. `npx tsc --noEmit -p .` clean. `git status --porcelain` before
commit: only `BACKLOG-QUALITY.md` (modified) and
`tests/q33-cli-json-syntax-error.test.ts` (new) — Scope-compliant.

**Committed.**

**Five actionable items remain** (q34, q35, q36, q37, q38 — q38 filed this
session), above the generation rule's floor of 3, so the generation rule
does not need to run next session either.

### 2026-08-27 — session 30

**Feedback inbox:** no `feedback/` directory exists in this worktree (checked
with `ls feedback/`). Nothing to process, nothing moved.

**Clean tree at session start** (`git status --porcelain` empty, last commit
`58ca72b`) — no leftover uncommitted work this time, unlike several prior
sessions.

**Four actionable items were in queue** (q32, q33, q34, q35, all unchecked
and unblocked), at the generation rule's floor of 3, so the generation rule
did not run. Took q32, the top item.

**q32 done.** `tests/q21-weapon-boundary-fuzz.test.ts` (new `applyCommand`
import from `../src/sim/run`; one new describe block, "a duplicate key in a
real souls Command is not a fifth hole (positive control, q32)", 45 total
tests up from 44).

**What it does.** Pins the positive control q32 asked for: builds a world
with 7 soul towers (one more than `weaponSlots`, so `beginSoulPick` opens the
real `soulpick` phase instead of auto-binding), takes a real
`w.soulCandidates[0]` as a duplicate key, drives a real
`applyCommand(w, {k:'souls', keys:[dupeKey, dupeKey]})`, and asserts
`w.phase === 'act2'` and exactly one `WeaponState` for that key. Traced the
full chain end to end (`applyCommand`'s `'souls'` case →
`finishSundering` → `bindSouls` → `grantWeapon` twice for the same key) to
confirm the test genuinely exercises the duplicate-key path rather than being
filtered out early.

**Review (code-reviewer, APPROVE, 0 Critical/Major).** Independently traced
the same four-file chain and mutation-tested it live (patched `grantWeapon`
to always push instead of find-and-update, confirmed the new test goes red
with `expected 2 to be 1`, reverted, confirmed clean). One Nit (escaped
apostrophe in a test title) — fixed before commit.

**QA (qa-playtester, PASS).** Independently re-ran the same mutation test
(a broader one — flipped `if (existing)` to `if (false)` — caught the q32
test plus 5 pre-existing sibling tests that also exercise the update branch,
expected collateral from a wider mutation), confirmed `tsc` clean, confirmed
Scope compliance (`tests/q21-weapon-boundary-fuzz.test.ts` the only file
touched), and confirmed `w.soulCandidates` can never itself contain a
duplicate (built from a `Map` keyed by soul string) and neither real caller
of the `souls` Command (`src/ui/hud.ts`'s `Set`, `src/bots/policies.ts`'s
direct map) can produce one — matching q32's own "hand-crafted-only"
reachability framing.

**QA found one real, unfiled sibling gap, filed as q36:** a duplicate key in
a hand-crafted `souls` Command silently *wastes a pick slot* rather than
being rejected or deduped — measured live (7 candidates, 6 slots, one
duplicate among the 6 submitted keys → only 5 souls bound, not 6) via an
ad-hoc probe QA created, ran twice for determinism, then deleted, confirming
the tree stayed clean. Distinct from q32's own `WeaponState`-duplication
question; same reachability caveat (hand-crafted Command only).

**Full-suite check.** Ran `npx vitest run` in full (background, ~512s): 895
passed, 15 failed, 79 skipped across 2 files. Both failure clusters are
pre-existing, unrelated to this diff: `tests/q14-mutation-smoke.test.ts`
(13 failures) is the documented `gitDiffClean()`-sees-the-uncommitted-lane-
diff artifact sessions 26-29 already recorded (the tree had this session's
own uncommitted test edit at the time); `tests/q15-command-domain-fuzz
.test.ts` (2 failures, `rekindle.structureId:fractional`/`:negative` showing
`"hangs"`) reran standalone afterward — 25/25 green — confirming it was
resource-contention flakiness under the full suite's heavy parallel load
(the probe's 4000ms settle deadline), not a regression from this session's
change. `tests/q21-weapon-boundary-fuzz.test.ts` itself (this session's only
touched file) passed cleanly inside the full run.

**Committed.**

**Four actionable items remain** (q33, q34, q35, q36 — the last filed this
session — all unchecked and unblocked), still at the generation rule's floor
of 3, so the generation rule does not need to run next session either.

### 2026-08-27 — session 29

**Feedback inbox:** `feedback/` exists in this worktree but is empty. Nothing
to process, nothing moved.

**Found session start with `tools/mutation-probe.ts` already modified,
uncommitted, in the worktree** — the same leftover-work shape sessions
19/20/22/23/24/26/27 each hit before, but this time with no matching Log
entry describing it (no "session 29" entry existed yet). Read the diff
directly rather than assuming: it is q31's full acceptance criteria already
implemented — two new `Mutation` entries, `soak-remove-boundary-guards`
(reverts q23's `soakOne` `maxTicks`/`scanEvery` guards, targets
`tests/q12-soak.test.ts`) and `content-census-remove-trycatch` (reverts q25's
`content-census.ts` try/catch, targets `tests/q25-content-census-cli.test.ts`),
plus doc-comment counts updated to 7 controls / 12 mutations / 19 nested
`vitest run` invocations.

**Verified rather than trusted, per this file's own standing lesson.**
`npx tsc --noEmit -p .` clean. `npx vitest run tests/q12-soak.test.ts
tests/q25-content-census-cli.test.ts` — 13/13 green standalone. Ran
`npx vitest run tests/q14-mutation-smoke.test.ts` in full: 13 of 24 red. Traced
the failures to `probeOne`'s `realFileUntouched = gitDiffClean() && ...`
(`tools/mutation-probe.ts:544`) calling `gitDiffClean()` with **no pathspec** —
a whole-repo check — against a tree whose only dirt was this very diff, the
identical `gitDiffClean()`-sees-the-uncommitted-lane-diff artifact sessions
26/27/28 already documented, not a new regression: it fails all 12 mutations'
"leaves the real file untouched" assertion plus the suite's own
`gitDiffClean()`-in-whole-repo-mode fixture-must-start-clean test, 13 exactly.

**Review (code-reviewer, APPROVE, 0 Critical/Major).** Independently loaded
the real `MUTATIONS` array and confirmed both new `find` strings match their
target files exactly once, byte-for-byte (CRLF-normalized), rather than
eyeballing the escaped template literals. Confirmed `testFile` targeting,
recounted the doc-comment totals (12 mutations, 7 distinct `testFile`s, 19
invocations) independently rather than trusting the comment, and confirmed
Scope compliance (only `tools/mutation-probe.ts` touched). Two non-blocking
Nits (a doc-block cross-reference, restating the dirty-tree artifact isn't
this diff's fault) — not fixed, correctly judged not to need it.

**QA (qa-playtester, PASS).** Independently ran `probeControl`/`probeOne`
against the real exported `MUTATIONS` array (not a hand-copy — caught and
self-corrected a transcription bug from an earlier hand-retyped attempt) for
both new entries: both target-test controls pass clean, both mutations flip
their named test file red, and `git diff --exit-code -- tools/soak.ts
tools/content-census.ts` is clean after each probe restores the real file.
Adversarially checked the "exactly one occurrence" guard fires correctly on
contrived 0-/multi-occurrence inputs (dormant here since both `find`s are
unique today, but a real safety net, not decorative), and cross-checked the
13-of-24 dirty-tree math (12 mutations + 1 fixture-must-start-clean test)
against the suite's own `describe.each` structure, confirming it's fully
explained by working-tree state rather than a defect in the new entries. No
bugs filed.

**Committed** (`c108b54`), then reran
`npx vitest run tests/q14-mutation-smoke.test.ts` standalone on the
now-clean tree to close the loop this session's own finding opened:
**24/24 green**, confirming the dirty-tree diagnosis rather than leaving it
as an inference.

**Four actionable items remain** (q32, q33, q34, q35, all unchecked and
unblocked), still at the generation rule's floor of 3, so the generation
rule does not need to run next session either.

### 2026-08-27 — session 28

**Feedback inbox:** no `feedback/` directory exists in this worktree (checked
with Glob for `feedback/**`). Nothing to process, nothing moved.

**Five actionable items were in queue** (q30, q31, q32, q33, q34, all
unchecked and unblocked), at the generation rule's floor, so the generation
rule did not run. Took q30, the top item.

**q30 done.** `tools/fuzz-weapon-boundary.ts` (new 6th `BoundaryCase`
category `'boon'`, `boonOfferBoundaryCases()`, wired into `runCensus()`),
`tests/q21-weapon-boundary-fuzz.ts` (new `BOON_OFFER_HOLES` pinned map),
`tests/q21-weapon-boundary-fuzz.test.ts` (+10 tests, 43 total).

**What it does.** `applyOffer`'s `'boon'` case (`src/sim/progression.ts:
187-196`) does `w.boonRanks[b.key] = offer.toLevel` with *zero* validation —
not even the upper-bound-only clamp the `'weapon'` case (q27) gets. Probed
the same `AWAKENING_BOON` ('haste', maxRank 5) with `NaN`/`-5`/`Infinity` and
measured (not assumed) three genuinely different mechanisms, not a uniform
"illegal value" story:
- `Infinity`: `buildOfferPool`'s `rank >= b.maxRank` re-offer cap
  (progression.ts:129) legitimately excludes it — `Infinity >= 5` is
  mathematically sound. `'contaminated'` (stored value illegal, cap holds).
- `NaN`: `NaN >= 5` is `false`, so the poisoned offer stays in the pool with
  a `NaN` `rollOffers` weight. `Rng.weightedIndex` (`src/sim/rng.ts`) sums
  weights into a `NaN` total, which defeats every `r < 0` scan comparison and
  falls through to `return weights.length - 1` — deterministically the last
  remaining pool entry, every draw, regardless of the RNG stream (confirmed:
  two consecutive `rollOffers` calls return byte-identical results, which a
  fair weighted draw would not). The boon itself never wins as a side effect
  of this (0/200 in a wider manual sample), but the *entire draw's fairness*
  is defeated whenever a NaN weight is anywhere in the pool — a more general,
  unfixed-here RNG-fairness gap this finding surfaced. Still
  `'contaminated'`, for a structurally different reason than `Infinity`.
- `-5` (negative): also not caught by `>=`, but finite, so the draw stays
  fairly weighted and the corrupted boon genuinely keeps winning re-picks
  (measured 48/200). `'ungated'`: a real, unbounded exploit —
  `StatBag.add` (`src/sim/stats.ts:159`) accumulates `perRank` per re-pick
  with no cap of its own, demonstrated live by re-picking 3 times and
  asserting the accumulated `attackSpeed` total.

A second, bonus finding in its own describe block: the same poisoned
`boonRanks[AWAKENING_BOON]` also fools `buildOfferPool`'s own, separately-
written Awakening rank gate (progression.ts:147) at *generation* time via the
real `rollOffers` path — not just `applyOffer` trusting an already-forged
offer (the earlier, already-pinned `AWAKENING_GATE_HOLES` finding). Measured:
NaN rank → Awakening reliably surfaces despite the rank gate being unmet;
Infinity rank → surfaces ~62.5% of draws; negative rank → correctly stays
gated closed (`-5 < 3` is `true`).

**Review (code-reviewer, REQUEST-CHANGES then APPROVE after fix).**
Independently re-derived every mechanism against the live source
(`progression.ts`, `rng.ts`, `stats.ts`, `hash.ts`) and reproduced the exact
measured figures (0/200, 48/200, the `weightedIndex` fallback). Found one
**Major**: the doc comment claimed the Infinity-poisoned boon rank was
"observable via the determinism hash" without any test proving it —
BACKLOG-QUALITY.md's own q30 acceptance line explicitly required "recording
what `h.int()` actually does with the poisoned value," which was simply not
implemented. Measured directly: `Hasher.int()`'s `v | 0` (hash.ts:13)
collapses `NaN`, `±Infinity`, *and* an explicit `0` to the identical hash —
the claim was true only because no legitimate `applyOffer` call ever stores
`0`, a narrower and different claim than originally written. Fixed by adding
a `hashWorld`-comparison test (legit rank-5 vs. Infinity-poisoned) plus a
direct `Hasher.int(Infinity)` vs `Hasher.int(0)` equality assertion pinning
the actual collision, and correcting the doc comment to state the nuanced
truth. Re-verified (43/43, `tsc` clean) before re-approving.

**QA (qa-playtester, PASS).** Cross-checked every claimed mechanism against
the live source independently. Mutation-tested for real: patched the `'boon'`
case with a naive `Math.max(0, Math.min(b.maxRank, offer.toLevel))` clamp,
reran — exactly 3/43 tests went red for the right reason (the raw-stored-
value assertions for Infinity/-5 plus the hashWorld-distinguish test); the
NaN-stored test correctly stayed green since `Math.max/min` still propagates
`NaN` in JS, matching what the doc comments already claim. Restored
`src/sim/progression.ts` byte-for-byte via `git checkout --`, confirmed
`git status --porcelain` back to the three expected files. Adversarially
reviewed all of `progression.ts` and `weapons.ts` for a further sibling gap
now that all three `Offer` kinds have a pinned finding (`'weapon'`: q27,
`'boon'`: q30, `'awakening'`: no numeric field to poison, correctly not a
gap) — found one candidate (`applyOffer`'s awakening case pushes
`w.awakenings` with no dedupe) but traced every reader and confirmed zero
observable consequence today, so did not file it. Confirmed q14's
`gitDiffClean()` failures against the uncommitted lane diff are the same
pre-existing artifact prior sessions have documented, not a new regression
(21/21 green standalone on a clean tree).

**Suite state.** `npx vitest run tests/q21-weapon-boundary-fuzz.test.ts` —
43/43 green. `npx tsc --noEmit -p .` clean. Full `npx vitest run` this
session (background, before the hash-test fix landed) — 894 passed, 11
failed (all `tests/q14-mutation-smoke.test.ts`, the documented
`gitDiffClean()`-sees-the-uncommitted-lane-diff artifact), 79 skipped;
QA separately reran `q14-mutation-smoke.test.ts` standalone on a clean tree
(21/21 green) after this session's diff was in place, confirming no new
regression.

**Five actionable items remain** (q31, q32, q33, q34, q35 — the last filed
this session, see above — all unchecked and unblocked), still at or above
the generation rule's floor of 3, so the generation rule does not need to
run next session either.

### 2026-08-27 — session 27

**Feedback inbox:** `feedback/` exists in this worktree but is empty. Nothing
to process, nothing moved.

**Found session 26's q29 work already sitting in the worktree, uncommitted,
at session start** — the same leftover-work shape sessions 19/20/22/23/24
each hit before (session 26's own Log entry describes q29 fully implemented,
code-reviewed, and QA-passed, but the last commit on the branch was still
`076229f` — q27). Verified rather than trusted, per this file's own standing
lesson: read the diffs in `tools/fuzz-weapon-boundary.ts`,
`tests/q21-weapon-boundary-fuzz.ts`, and `tests/q21-weapon-boundary-fuzz.test.ts`
directly and confirmed they match session 26's log description exactly (5th
`weaponUpdate` `BoundaryCase` category, new `'contaminated'` verdict,
`WEAPON_UPDATE_HOLES` pinned map, +9 tests). Reran
`npx vitest run tests/q21-weapon-boundary-fuzz.test.ts` (33/33 green) and
`npx tsc --noEmit -p .` (clean) independently rather than trusting the log's
own claimed suite state. `git diff BACKLOG-QUALITY.md` confirmed q29 already
marked `[x]` and q34 already filed, consistent with the log.

**Committed session 26's q29 work as-is** (`db48065`), since it was already
complete end-to-end (implement → tests green → code-reviewer APPROVE →
qa-playtester PASS) and re-verified clean this session — re-implementing or
re-reviewing it would have duplicated session 26's own work rather than
caught anything new. This is this session's one item.

**Five actionable items remain** (q30, q31, q32, q33, q34, all unchecked and
unblocked), at the generation rule's floor, so the generation rule does not
need to run next session either.

### 2026-08-27 — session 26

**Feedback inbox:** `feedback/` exists in this worktree but is empty (checked
with `ls feedback/`). Nothing to process, nothing moved.

**Five actionable items were in queue** (q29, q30, q31, q32, q33, all
unchecked and unblocked), at the generation rule's floor of 3, so the
generation rule did not run. Took q29, the top item.

**q29 done.** `tools/fuzz-weapon-boundary.ts` (new 5th `BoundaryCase`
category `'weaponUpdate'`, `weaponUpdateBoundaryCases()`, a new `'contaminated'`
`Verdict` variant, wired into `runCensus()`), `tests/q21-weapon-boundary-fuzz.ts`
(new `WEAPON_UPDATE_HOLES` pinned map), `tests/q21-weapon-boundary-fuzz.test.ts`
(+9 tests, 33 total).

**What it does.** `grantWeapon`'s update branch (`src/sim/weapons.ts:63-66`,
an existing `WeaponState` found by key) does
`existing.level = Math.max(existing.level, level)` with no clamp at all,
unlike the create branch's `Math.max(1, Math.min(maxLevel, level))`. Measured
the actual behaviour against the same 9-value `LEVEL_INPUTS` domain the
sibling "level" category already uses (granting at level 1 first, then
updating): `NaN` and a fractional value above the existing level still crash
the live fire loop, matching the pre-existing `nan`/`fractional` holes. But
`7` and `Infinity` do **not** crash — `levelStats`'s own read-time clamp
(`Math.max(1, Math.min(top, ws.level))`) re-floors them back to a legal index
on every fire-loop read. The *stored* `ws.level` is still left outside
`[1, maxLevel]`, though, which a raw reader elsewhere in the sim can observe
directly — added a `'contaminated'` verdict for this shape, distinct from
`'crashes'`/`'ok'`/`'ungated'`. Confirmed a genuinely discriminating
consequence exists (the determinism hash, `hashWorld` at `src/sim/run.ts:656`,
hashes `wp.level` directly, so a contaminated 7 and the legitimate cap 6 hash
differently) and, separately, that the first candidate consequence I tried
(`buildOfferPool`'s `ws.level < maxLevel` cutoff) does **not** discriminate —
`6 < 6` and `7 < 6` are both `false` — caught by code-reviewer before commit,
below.

**Review (code-reviewer, REQUEST-CHANGES then APPROVE after fixes).**
Independently verified the NaN/fractional-crash vs. 7/Infinity-contaminated
split by reading `grantWeapon`/`levelStats` directly and running the harness.
Found one **Major**: the "buildOfferPool stops offering more levels for it"
test and its accompanying doc comments (all three files) claimed a
discriminating consequence that measurably isn't one — verified live that
`buildOfferPool` excludes a legitimately-capped weapon (level 6) and a
contaminated one (level 7) identically, so the test would pass whether the
bug were fixed or not, exactly the "plausible story instead of the control
run" trap CLAUDE.md's measurement rules name. Fixed by replacing that test
with a `hashWorld`-based one that does discriminate, adding a companion test
that pins the non-discriminating `buildOfferPool` behaviour explicitly rather
than silently dropping the finding, and correcting the doc comments in all
three files to state the measured (not assumed) split. One **Minor**: the
`bindSouls` negative-control test's comment claimed a second bind
"re-enters the update branch for real," but `bindSouls` rebuilds `w.weapons`
from scratch every call (filtering to only the slotless innate before
granting chosen souls), so a picked soul always takes the *create* branch,
never update — fixed by rewriting the test and its comment to state what's
actually exercised. Two **Nits** (an off-by-one line citation, a CLI column-
padding width) fixed. Re-ran the suite (33/33) and `tsc --noEmit` (clean)
after every fix.

**QA (qa-playtester, PASS).** Reran the suite (33/33) and `tsc --noEmit`
(clean). Mutation-tested for real: patched the update branch with a naive
full clamp, reran — exactly 4 tests went red (the census-match aggregate,
`update level=7`, `update level=Infinity`, and the hash-discrimination test),
and confirmed the NaN/fractional-crash tests stayed green because
`Math.max(1, NaN)` is still `NaN` in JS — the naive clamp doesn't fix that
case, matching what the doc comments already claimed. Restored
`src/sim/weapons.ts` via `git checkout --`, confirmed `git status --porcelain`
confined to the three expected files.

**QA found one real, unfiled, more-severe sibling gap, filed as q34:**
`grantWeapon`'s `damageBonus` parameter is unguarded in *both* branches (the
create branch is a bare assignment, not even a `Math.max`) — worse than every
`level` hole this file pins, because a poisoned `damageBonus` produces
silent, permanent, non-crashing corruption with no observable signal
anywhere: `damageEnemy`'s own `amount <= 0` guard doesn't catch `NaN`
(`NaN <= 0` is `false`), so `e.hp -= NaN` makes an enemy permanently
unkillable and `w.damageTotal`/`w.damageByWeapon` go `NaN` for the rest of
the run — and it doesn't even register as a hash anomaly, since
`Hasher.num()`/`int()` use `v | 0`, which silently coerces `NaN` to `0`.
Reproduced live twice with identical results. Confirmed not already covered
by q29 (level only) or q30 (boon ranks, a different field) by grepping for
`damageBonus` across `BACKLOG-QUALITY.md`/`tests/` first.

**Suite state.** `npx vitest run tests/q21-weapon-boundary-fuzz.test.ts` —
33/33 green. `npx tsc --noEmit -p .` clean. `git status --porcelain` limited
to the three expected files (`tools/fuzz-weapon-boundary.ts`,
`tests/q21-weapon-boundary-fuzz.ts`, `tests/q21-weapon-boundary-fuzz.test.ts`).

**Five actionable items remain** (q30, q31, q32, q33, q34, all unchecked and
unblocked), so the generation rule does not need to run next session either.

### 2026-08-27 — session 25

**Feedback inbox:** `feedback/` exists in this worktree but is empty. Nothing
to process, nothing moved.

**Six actionable items were in queue** (q27, q29, q30, q31, q32, q33, all
unchecked and unblocked), so the generation rule did not run. Took q27, the
top item.

**q27 done.** `tools/fuzz-weapon-boundary.ts` (new 4th `BoundaryCase`
category `'weaponOffer'`, `weaponOfferBoundaryCases()`, wired into
`runCensus()`), `tests/q21-weapon-boundary-fuzz.ts` (new `WEAPON_OFFER_HOLES`
pinned map), `tests/q21-weapon-boundary-fuzz.test.ts` (+5 tests, 24 total).

**What it does.** `applyOffer`'s `'weapon'` case (`src/sim/progression.ts:
182-186`) does `ws.level = Math.min(maxLevel, offer.toLevel)` — an
upper-bound-only clamp that never re-validates the result, unlike
`grantWeapon`'s own create-branch clamp
(`Math.max(1, Math.min(maxLevel, level))`). A forged `Offer` with
`toLevel: NaN` propagates straight into `ws.level`, crashing the live fire
loop on the next `updateWeapons()` tick — the same `def.levels[lv-1]`
`undefined` crash the `level`/`inheritance` `nan` holes already pin, just
through a third entry point. A negative `toLevel` (e.g. -5) is latent rather
than crashing, because `levelStats`'s read-time clamp
(`Math.max(1, Math.min(top, ws.level))`) re-floors it to a legal index on
every read — pinned as `'ok'`, not a hole, since it neither crashes nor
bypasses a gate, even though the stored field briefly holds an illegal
value. Not reachable via the real Command surface today: `buildOfferPool`
only ever emits `toLevel: ws.level + 1`, a legal positive integer.

Added `weaponOfferBoundaryCases()` (2 cases: `weapon:toLevelNan`,
`weapon:toLevelNegative`) following the exact `forcePlace`/`newWorld`
harness shape the other three categories already use, driving the real
exported `applyOffer` entrypoint directly (not a re-derived copy). Live CLI
run confirmed 27 total cases (up from 25), 7 non-`ok` (up from 6):
`weaponOffer:weapon:toLevelNan` is `[crashes]`,
`weaponOffer:weapon:toLevelNegative` is `[ok]`. Added a matching describe
block alongside the existing Awakening-gate finding, mirroring its four-part
shape: forged-offer NaN crash repro, negative-latent repro (asserts
`ws.level === -5` post-offer, no throw, and `levelStats` reads back the
level-1 entry), a legitimate-offer positive control, and a real-Command-
surface negative control proving `buildOfferPool`/`rollOffers` never emits
an illegal `toLevel`.

**Review (code-reviewer, APPROVE, 1 Nit — fixed here).** Independently
traced `applyOffer`'s `'weapon'` case and `levelStats`'s read-time clamp,
confirmed the NaN/negative mechanics match the claimed behavior exactly,
confirmed `WEAPON_OFFER_HOLES` correctly leaves the negative case unpinned,
confirmed Scope (three files, no `/src`/`/data`), confirmed the new
assertions are non-vacuous (pin `ws.level` itself, not just a downstream
symptom), ran `tsc --noEmit` and the suite standalone (24/24 green). One
Nit: `WEAPON_OFFER_TARGET` was a private const while the sibling Awakening
finding exports and reuses its target constants — exported it and swapped
the test file's four hardcoded `'flame_cone'` literals for the import.

**QA (qa-playtester, PASS).** Reran the suite (24/24) and the live CLI
census, confirmed both match the pinned maps exactly. Mutation-tested
`applyOffer`'s `'weapon'` case for real (transient `/src` edit, restored
after): the naive `Math.max(1, Math.min(maxLevel, offer.toLevel))` clamp
flips the negative test red for the right reason but leaves the NaN test
green (`Math.max(1, NaN)` is still `NaN` in JS — the same reason
`grantWeapon`'s identical clamp shape still leaves `level:nan` a documented
hole elsewhere in this file); confirmed a `Number.isFinite` guard on top
does flip all three affected assertions red, proving the tests really do
catch a genuine fix. Restored `src/sim/progression.ts` byte-for-byte via
`git checkout --`, confirmed `git status --porcelain` confined to the three
expected files. Adversarial sweep found no new gap: `Offer` has exactly
three kinds (`weapon` here, `boon` already filed as q30, `awakening` already
pinned by q21); `damageBonus` is never touched by `applyOffer` at all — it
only flows through `grantWeapon`'s update branch, already filed as q29.
Nothing new filed.

**Suite state.** `npx vitest run tests/q21-weapon-boundary-fuzz.test.ts` —
24/24 green. `npx tsc --noEmit -p .` clean. Full `npx vitest run` (pre-commit
safety net) — 876 passed, 11 failed, 79 skipped; every failure is in
`tests/q14-mutation-smoke.test.ts` and is the same documented "fixture must
start clean" artifact sessions 12/14/15/16/18/20 have each hit before this
same commit landed: `gitDiffClean()` (whole-repo, no pathspec) requires a
fully clean git tree, and this session's own uncommitted q27 diff (the three
files above) is what trips it — confirmed via `git status --porcelain`
showing exactly those three files and nothing else, and confirmed
`tests/q14-mutation-smoke.test.ts` was untouched this session. Re-verify
`tests/q14-mutation-smoke.test.ts` standalone after this commit lands.

**Five actionable items remain** (q29, q30, q31, q32, q33, all unchecked and
unblocked), so the generation rule does not need to run next session either.

### 2026-08-27 — session 24

**Feedback inbox:** `feedback/` exists in this worktree but is empty (checked
with `find feedback -maxdepth 2 -type f`). Nothing to process, nothing moved.

**Found session 23's leftover q26 work already sitting in the worktree,
uncommitted, at session start** — the same shape sessions 19/20/22 each hit
before (a prior session implemented and stopped short of review/commit;
session 23's own Log entry only mentions q28, so this was left mid-flight
without a matching note). Verified rather than trusted, per this file's own
standing lesson.

**q26 done.** `tools/perf-ratio.ts` (`measureRatioForWorld` gains an optional
`onEvent?: (event: RatioTraceEvent, sampleIndex: number) => void` 5th
parameter, fired from inside the real loop right after each calibration
chunk and each tick) and `tests/q26-perf-ratio-interleave.test.ts` (new, 4
tests).

**What it does.** `tests/q13-perf-ratio.test.ts` only proved the *outcome* of
interleaving calibration work and sim ticks (a stable, contention-tolerant
ratio) — nothing proved the *mechanism*, that `measureRatioForWorld`
genuinely alternates one calibration chunk with one tick rather than running
all calibration first and all ticks second. Session 9's log named the gap
explicitly and q20 couldn't close it with a mutation-probe entry since the
failure mode only shows up under real external CPU contention. The `onEvent`
callback is wired into the existing loop (not a parallel re-implementation),
so the new suite reads the real call order directly: alternating
`calib`/`tick` per sample, an explicit negative check against the sequential
two-block shape, sample-index correlation, and confirmation the callback is
optional and doesn't change the returned ratio shape.

**Review (code-reviewer, APPROVE, no findings).** Independently confirmed
`onEvent` is additive-only (the one other caller, `tests/q13-perf-ratio.test.ts`,
passes 4 args and is unaffected; `tsc --noEmit` clean), confirmed the events
fire inline in the same loop that computes the returned ratio rather than a
separate loop, confirmed Scope (`tools/perf-ratio.ts` +
`tests/q26-perf-ratio-interleave.test.ts` only), and confirmed the assertions
are non-vacuous — the alternating-order and explicit negative checks would
both fail if the loop reverted to two sequential blocks.

**QA (qa-playtester, PASS).** Ran the new suite (4/4) and the sibling
`tests/q13-perf-ratio.test.ts` (5/5, unaffected). Mutation-tested for real:
split the loop into two sequential blocks (all calib, then all tick),
reran — 3 of 4 tests went RED for the right reason (exact expected
diagnostics), the 4th (ratio-shape-with-no-callback) correctly stayed green
since ratio math is order-independent; restored byte-identical via diff
against a pre-mutation backup, reconfirmed 4/4 and 5/5 green together. One
adversarial extra beyond the item's stated scope: `tickSamples=1` still
emits exactly `['calib','tick']`, and callback presence/absence never
changes `calibIters`/`tickSamples` in the returned `PerfRatio` — not filed,
no gap. Final `git status --porcelain` confined to the two expected files.

**Suite state.** `npx vitest run tests/q26-perf-ratio-interleave.test.ts
tests/q13-perf-ratio.test.ts` — 9/9 green. `npx tsc --noEmit -p .` clean.
Full `npx vitest run` also run this session as the pre-commit safety net.

**Six actionable items remain** (q27, q29, q30, q31, q32, q33, all unchecked
and unblocked), so the generation rule does not need to run next session
either.

### 2026-08-27 — session 23

**Feedback inbox:** no `feedback/` directory exists in this worktree (checked
with Glob for `feedback/**`). Nothing to process, nothing moved.

**Only two actionable items were in queue** (q26, q27), below the generation
rule's floor of 3, so the generation rule ran first. (a) Ran
`npx tsx tools/gate-audit.ts` and `npx tsx tools/sweep.ts --seeds 12
--policies maxbuild,hybrid`: unchanged from sessions 12/16 (8 covered, 12
holes, all P-phase-not-built; 0% win, medSurv ~119-120). (b) SPEC-FINAL
coverage diff: no change. (c) Read actual source rather than trusting a
prior session's note: re-checked q25's own claim that
`gate-audit.ts`/`phase-coverage.ts`/`soak.ts` already "handle their own
failure path" and found it false for all three (filed as q28, the fourth
instance of this lane's "note overstates its own coverage" trap, after q17,
q19, q22). While scoping q28's blast radius, reading `applyOffer`'s
`'boon'` case and `grantWeapon` turned up two further unclamped-`Offer`-field
siblings of q21/q27 (q29, q30) and a positive control worth pinning
alongside them (q32), plus the standing mutation-probe coverage gap q20
leaves open every time a new guard lands (q31). Five items appended
(q28-q32); took q28, the top item.

**q28 done.** `tools/gate-audit.ts`, `tools/phase-coverage.ts`,
`tools/soak.ts` (each `main()`/`soakOne` now fails cleanly on a `/data`- or
spec-load failure) and `tests/q28-cli-error-handling.test.ts` (new, 9 tests).

**What it does.** q25's own commit note claimed every sibling CLI in this
lane already handled its own failure path — checked this session by reading
each `main()` directly rather than trusting the note, and it was wrong for
all three. `gate-audit.ts`'s `main()` called `readFileSync(SPEC_PATH,
'utf8')` with no try/catch (crashes if SPEC-FINAL.md is missing/unreadable).
`phase-coverage.ts`'s `main()` called `census(shippedPolicies(), ...)` with
no try/catch, and `census`→`censusOne`→`reachedPhases` constructs a
`Run`/`World` (hence calls `loadContent()`) before anything catches.
`soak.ts`'s `soakOne` constructed `new Run(cfg)` one line *before* its own
internal `try` block, so a `/data` load failure there propagated straight
out uncaught — q23's `maxTicks`/`scanEvery` guards did not cover this path.

Fixed `gate-audit.ts` and `phase-coverage.ts` by wrapping the reachable call
in `main()`'s own try/catch, printing a one-line message (or `{error}` JSON
under `--json`) and setting `process.exitCode = 1`, matching
`content-census.ts`'s existing q25 pattern exactly (removed the now-dead
duplicate `staleHoleRefs()` call site in `gate-audit.ts` rather than leaving
it stale). Fixed `soak.ts` differently, at the root: moved `new Run(cfg)`
inside `soakOne`'s existing try block (declaring `run`/`w` as
possibly-undefined beforehand), so a construction failure now surfaces as a
normal `SoakResult.threw: true` — the CLI prints a `FAIL ...` line and still
reaches its usual `N/M clean` summary, rather than crashing before printing
anything.

**Review (code-reviewer, APPROVE, 1 Minor/paperwork nit — fixed here).**
Independently confirmed all three fixes by reading the files directly (not
just the diff): no use-before-assignment in `soak.ts`'s restructured
`run`/`w`, the post-try `report()` call and return correctly guarded, no
stale duplicate `staleHoleRefs()` call left in `gate-audit.ts`, `intArg`/
`usage()`'s own `process.exit(2)` path in `phase-coverage.ts` untouched by
the new catch (it runs before the try). Verified the new tests are
non-vacuous by stashing the three tool fixes and re-running — the 6
failure-path tests went red for the right reason (raw stack traces/empty
stdout), the 3 control tests stayed green — then restored and reconfirmed
9/9. Ran the three pre-existing sibling suites (45 tests), no regression.
`tsc --noEmit` clean. One Minor: the q28 checkbox was still `[ ]` in the
diff despite the fix being complete — flipped to `[x]` per this file's own
established convention (every prior completed item was checked off in the
same commit).

**QA (qa-playtester, PASS).** Independently reproduced all three pre-fix
crashes live in throwaway scratch copies built from `git show HEAD:...`
(raw `ZodError`/`ENOENT` stack traces, zero clean output), confirmed the
post-fix behavior for real, ran the new suite (9/9) plus all three sibling
suites (45/45, no regression), and mutation-tested `gate-audit.ts`'s fix
specifically (reverted it via `git checkout --` after confirming the
uncommitted diff was exactly this session's fix, watched exactly its 2
tests go red, restored via `git apply` of a saved patch, reconfirmed
9/9 and a clean `git status`). Two adversarial variants beyond q28's literal
scope — corrupting `BACKLOG-QUALITY.md` itself (also read by
`gate-audit.ts`'s `staleHoleRefs()`) and corrupting a `/data` file other than
`towers.json` — both already handled cleanly, since the fix wraps the whole
reachable call rather than special-casing one file; neither filed.

**QA found one real, pre-existing gap outside q28's scope, filed as q33:**
q25/q28 only catch *schema* violations (a zod parse failure at
`loadContent()` runtime) — a JSON *syntax* error in any `/data/*.json` file
crashes all four lane CLIs with a raw, uncaught esbuild `TransformError`,
because `/data` is loaded via a static ES module `import` in
`src/sim/content.ts`, transformed and evaluated at module-load time, before
any of `main()`'s code (including every try/catch q25/q28 added) ever runs.
Confirmed live by QA against `content-census.ts` too, so this is not a q28
regression — it was already true of the q25 baseline, just never named
until this session's adversarial pass reached it. Not fixed here: the root
cause (a static `import` for `/data`) lives in `src/sim/content.ts`, outside
this lane's Scope.

**Suite state.** `npx vitest run tests/q28-cli-error-handling.test.ts
tests/q10-gate-audit.test.ts tests/q9-phase-coverage.test.ts
tests/q12-soak.test.ts tests/q25-content-census-cli.test.ts` — 57/57 green.
`npx tsc --noEmit -p .` clean.

**Seven actionable items remain** (q26, q27, q29, q30, q31, q32, q33, all
unchecked and unblocked), so the generation rule does not need to run next
session either.

### 2026-08-27 — session 22

**Feedback inbox:** no `feedback/` directory exists in this worktree (checked
with Glob for `feedback/**`). Nothing to process, nothing moved.

**Found q25's implementation already sitting in the worktree, uncommitted, at
session start** — the same shape sessions 14/16/18/19/20 have each hit before
(a prior session implemented and stopped short of review/commit). Verified
rather than trusted, per this file's own standing lesson.

**q25 done.** `tools/content-census.ts` (`main()` wraps `census()` in a
try/catch) and `tests/q25-content-census-cli.test.ts` (new, 3 tests).

**What it does.** `main()` previously called `census()` with no error
handling, so a `/data` load failure (a zod schema violation, since a JSON
syntax error throws earlier, at the static import) crashed with a raw
multi-frame `ZodError` stack trace and left `--json` mode printing nothing
parseable — the one CLI in this lane's own tool set that didn't handle its
own failure path, unlike `tools/soak.ts`/`tools/gate-audit.ts`/
`tools/phase-coverage.ts`. The fix catches around `census()` only (not the
`--json` flag check, read before the try), prints a collapsed one-line
`content-census: <message>` to stderr in plain mode or a single-line
`{"error": "<message>"}` to stdout under `--json`, and sets
`process.exitCode = 1` rather than `process.exit()` so the console writes
flush normally — matching `gate-audit.ts`'s own existing pattern.

The test spawns a real nested `npx tsx tools/content-census.ts` against a
scratch copy of `src`/`tools`/`data`/`tsconfig.json` under `bench/.tmp/`
(the same throwaway-process idiom `tools/mutation-probe.ts` already uses),
retypes `data/towers.json`'s `upgradeStepMul` to a string so
`TowersFileSchema`'s `.strict()` zod parse fails at runtime rather than at
static import, and asserts three cases: a clean scratch snapshot still exits
0 (harness control), a corrupted one exits nonzero with a one-line stderr
message and empty stdout, and the same corruption under `--json` exits
nonzero with empty stderr and a parseable single-line `{error}` object on
stdout.

**Review (code-reviewer, APPROVE, no Critical/Major).** Independently
confirmed the try/catch placement leaves no use-before-assignment path,
confirmed both message shapes are genuinely one line each with the right
stream empty in each mode, confirmed `process.exitCode` over `process.exit()`
is the more correct choice here (lets pending console writes flush) and
matches `gate-audit.ts:293`'s existing precedent, confirmed the
`upgradeStepMul` corruption genuinely trips `TowersFileSchema`'s zod parse
(read `src/sim/content.ts` directly) rather than failing at JSON-syntax/
static-import time, and confirmed no scratch-directory leakage across a live
run including a deliberately-failing one. Scope confirmed
(`tools/content-census.ts` + `tests/q25-content-census-cli.test.ts` only, no
`/src/sim` touched). Three non-blocking Minor/Nit notes (a `Math.random()` use
that's fine since it's test-harness code outside `/src/sim`, a Node
`DEP0190` shell-arg deprecation warning that's harmless for the static args
used here, and the ~2.5s/run cost of three real nested `npx tsx` spawns being
proportionate to what's actually being proven).

**QA (qa-playtester, PASS).** Independently reproduced the pre-fix bug live
in an isolated scratch copy — confirmed both plain and `--json` invocation
crashed with a raw `ZodError` stack trace, exit 1, unparseable stdout under
`--json` — then confirmed the fix (3/3 green) and mutation-killed it for real
(defeated the catch, watched 2/3 tests go red for the right reason, restored
and confirmed a byte-for-byte SHA-256 match against the pre-mutation file).
Confirmed no scratch leakage and a clean `git status --porcelain` restricted
to the two expected files. Two adversarial variants beyond the item's own
scope: corrupting a *different* file (`data/enemies.json`) fails cleanly the
same way (no gap); corrupting JSON *syntax* itself crashes at static-import
time, before `main()`'s try/catch can run, in both plain and `--json`
mode — already disclosed by name in the test file's own doc comment as an
intentional boundary, so not filed as a new bug. No bugs filed.

**Suite state.** `npx vitest run tests/q25-content-census-cli.test.ts` — 3/3
green, standalone. `npx vitest run tests/q16-content-census.test.ts` — 15/15
green, confirming the `main()` wrapper doesn't disturb `census()`'s existing
behavior. `npx tsc --noEmit -p .` clean.

**Two actionable items remain** (q26, q27, both unchecked and unblocked) —
below the generation rule's floor of 3, so it will need to run next session.

### 2026-08-27 — session 21

**Feedback inbox:** no `feedback/` directory exists in this worktree (checked
with Glob for `feedback/**`). Nothing to process, nothing moved.

**Four actionable items were in queue** (q24–q27, all unchecked and
unblocked), so the generation rule did not run. Took q24, the top item.

**q24 done.** `tools/fuzz-command-domain.ts` (`digest()` exported, now tracks
`act2Time`) and `tests/q15-command-domain-fuzz.test.ts` (+5 tests, 25 total).

**What it does.** Two sub-gaps session 11's QA pass recorded but did not
file: (1) `digest()` — the snapshot helper `classify()` uses to tell whether a
Category A command illegally mutated world state — had no direct unit test;
every recorded hole happens to also be caught by `scanWorld`, so a future
Category A hole invisible to `scanWorld` would rely on `digest()` alone with
zero coverage. (2) `describeOutcome()` printed "no observable effect" for
`dev.fast_forward.amount:fractional` even though `w.act2Time` visibly moves
to 100.5, because `digest()` never read `act2Time` — the `classify()` verdict
was always correct (`'rejected'`, since a fractional magnitude is legal for a
Category B command and trips no `scanWorld` problem), only the human-readable
detail string was misleading for that one line.

Fixed by adding `act2Time: w.act2Time` to `digest()`'s tracked fields and
exporting the function, plus a new `describe('digest() (q24)...')` block with
5 direct tests: changes on `gold`, `coreHp`, a built structure, and `act2Time`
each independently, plus a fixed-point check when nothing changes. Verified
before trusting it that this couldn't shift any of the 60 census verdicts,
not just the description text: grepped every `act2Time` writer in `src/sim`
(the `act2`-phase tick loop, `dev.fast_forward`/`dev.summon_boss`, and
`finishSundering`) and confirmed none of the five Category A commands
(`build`/`upgrade`/`sell`/`pick`/`rekindle`) can reach any of them, and that
`classify()`'s Category B branch reads only `problems.length`, never
`digestChanged` — so `tests/q15-command-domain-holes.ts` needed no edit. Ran
`npx tsx tools/fuzz-command-domain.ts` before and after: still exactly 7/60
non-rejected, only `dev.fast_forward.amount:fractional`'s printed detail
changed (now "accepted as a legal magnitude, no invariant violated").

**Review (code-reviewer, APPROVE, no findings).** Independently traced every
`act2Time` writer against the five Category A field specs and confirmed none
overlap; independently confirmed `classify()`'s Category B branch never reads
`digestChanged`; re-ran the CLI census and confirmed the 7/60 count and the
changed description text; confirmed tile `(1,1)`'s buildability by reading
`src/sim/grid.ts` directly (not a Border/Gate/Core tile, `occ` starts at 0);
confirmed Scope and no architecture-rule concerns; ran `tsc --noEmit` and the
test file standalone (25/25 green).

**QA (qa-playtester, PASS).** Independently re-traced `applyCommand`'s five
Category A cases and every `act2Time` writer in `src/sim`, confirming the same
non-overlap. Mutation-tested for real: commented out the `act2Time` line in
`digest()`, confirmed the new "changes when act2Time changes" test went red,
restored, confirmed `git diff --stat` returned to the exact pre-mutation
state. Cross-checked `tests/q15-command-domain-holes.ts`'s 7 entries against
the live CLI census — exact match, no drift. Ran the test file twice, no
flakes.

**Suite state.** `npx vitest run tests/q15-command-domain-fuzz.test.ts` —
25/25 green, standalone. `npx tsc --noEmit -p .` clean. The one pre-existing
mutation-smoke failure (`command-domain-classify-hollow`, refusing to run
because `tools/fuzz-command-domain.ts` had uncommitted changes) is the same
documented "fixture must start clean" artifact sessions 12/14/15/16/18/20 each
hit before this same commit landed — re-checked after committing, below.

**Three actionable items remain** (q25–q27, all unchecked and unblocked), so
the generation rule will need to run next session to bring the queue back
above three.

### 2026-08-27 — session 20

**Feedback inbox:** no `feedback/` directory exists in this worktree (checked
with Glob for `feedback/**`). Nothing to process, nothing moved.

**Found session 19's q23 work already sitting in the worktree, uncommitted,
at session start** — the same shape sessions 14/16/18 each hit before: the
prior session implemented, tested, ran review/QA, wrote its own Log entry
documenting all of it, and stopped before the actual `git commit`. Verified
rather than trusted, per this file's own standing lesson.

Independently re-checked before committing: `git diff --stat` confined to
exactly the three files the session-19 entry names (`BACKLOG-QUALITY.md`,
`tests/q12-soak.test.ts`, `tools/soak.ts` — in Scope, no `/src` or `/data`
touched); read the `tools/soak.ts` diff directly and confirmed both new
guards throw before `cfg`/`run`/`w` are constructed and that `makePolicy`
moved inside the existing `try` as described; ran
`npx vitest run tests/q12-soak.test.ts` standalone (10/10 green, matching the
session-19 note's count) and `npx tsc --noEmit -p .` (clean). No discrepancy
found between the log's description and the actual diff, so nothing to fix
before committing — this session's contribution is verification plus the
commit itself.

**q23 committed as-is.** No further items taken this session; four actionable
items remain (q24–q27, all unchecked and unblocked), so the generation rule
does not need to run next session either.

### 2026-08-27 — session 19

**Feedback inbox:** `feedback/` does not exist in this worktree (checked with
Glob). Nothing to process, nothing moved.

**Five actionable items were in queue** (q23–q27, all unchecked and
unblocked), so the generation rule did not run. Took q23, the top item.

**q23 done.** `tools/soak.ts` (+guards, `makePolicy` moved inside `try`) and
`tests/q12-soak.test.ts` (+3 tests, 10 total).

**What it does.** `soakOne` had two unguarded boundary inputs recorded but
not filed at session 8: `maxTicks <= 0` (or `NaN`) made the `while` loop's
`w.tick < maxTicks` condition false on the very first check, so the run
played zero ticks and still fell through to a report that read as "clean" —
indistinguishable from a genuinely clean run. `scanEvery` of `0` made
`tick % scanEvery` evaluate to `NaN` (`NaN === 0` is always false), so the
periodic invariant scan silently never fired for the whole run, breaking
`soakOne`'s own doc-comment promise to scan every `scanEvery` ticks — while
still reporting clean. Separately, `makePolicy` was called before `soakOne`'s
own `try` block, so an unregistered policy name threw straight out as an
uncaught exception instead of surfacing through `SoakResult.threw` the way
every other in-run failure does.

Fixed by adding two guards at the very top of `soakOne` — before `cfg`,
`run`, or `w` are constructed — that throw a plain usage `Error` for
`!Number.isFinite(maxTicks) || maxTicks <= 0` and the equivalent for
`scanEvery`, and by moving `const policy = makePolicy(policyName);` inside
the existing `try` block (after `w`/`problems` are already declared, so the
`catch` block's `w.tick` reference stays safe regardless of whether the throw
comes from `makePolicy` or from inside the loop). Neither guard was reachable
through the shipped CLI (`intArg` only validates `--seeds`; `maxTicks`/
`scanEvery` aren't CLI flags) or `tests/q12-soak.test.ts`'s pre-existing
calls, matching q23's own reachability note.

Added a `describe('q23 — boundary-input guards', ...)` block to
`tests/q12-soak.test.ts` with 3 tests: `maxTicks` of `0`/`-10`/`NaN` all throw
matching `/maxTicks/`; `scanEvery` of `0`/`-1` both throw matching
`/scanEvery/`; and an unregistered policy name returns a normal `SoakResult`
with `threw: true`, a `problems` message containing `unknown policy`, and
`endHash: ''`, asserted via `expect(() => { r = soakOne(...) }).not.toThrow()`
so a regression back to the old uncaught-exception behavior fails this test
directly rather than only failing some other, unrelated caller.

**Review (code-reviewer, APPROVE, no findings).** Independently traced the
guard placement (fires before any work is done), confirmed `Number.isFinite`
correctly rejects `NaN`/`±Infinity` in addition to `<= 0`, confirmed `w`/
`problems` are declared before the `try` that now contains `makePolicy` so
the `catch` block's `w.tick` reference is safe, confirmed the 3 new tests
assert the real guard-message text and the real `unknown policy` substring
from `src/bots/policy.ts` rather than loose assertions a hollowed-out fix
could still pass, re-confirmed via grep that no other file calls `soakOne`/
`soak`, and confirmed Scope (`git diff --stat` restricted to the two expected
files) and no architecture-rule concerns.

**QA (qa-playtester, PASS).** Independently reproduced both pre-fix bugs by
`git stash`-ing the uncommitted diff, running a throwaway probe script,
then restoring: confirmed `maxTicks=0/-5/NaN` pre-fix gave
`ticks=0, threw=false, problems=[]` (the fake-clean result) and `scanEvery=
0/-1` pre-fix ran a full 1000-tick loop with `problems=[]` (never scanned);
confirmed the unregistered-policy case threw straight out of `soakOne`
pre-fix. Post-fix, re-confirmed all three now behave as specified, plus
`maxTicks=Infinity/-Infinity` and an empty-string policy name, none of which
are named in the acceptance line but all guard correctly anyway. Checked two
adversarial extras explicitly out of the item's stated scope (non-integer
`maxTicks=1.5`, non-integer `scanEvery=0.5`) and confirmed neither reproduces
either failure mode, so neither was filed. Confirmed the worktree was left
exactly as found after the stash round-trip (no probe files left behind,
`git status --porcelain` shows only the two intended files) and confirmed
Scope via `git diff --stat`.

**Suite state.** `npx vitest run tests/q12-soak.test.ts` — 10/10 green,
standalone, run twice (once before dispatching review/QA, once again
immediately before this commit). `npx tsc --noEmit -p .` clean. Full
`npx vitest run` kicked off in the background before this commit for a
final sanity pass; not blocking this write-up since both the touched file's
standalone run and independent QA/review verification already confirm the
change.

**Four actionable items remain** (q24–q27, all unchecked and unblocked), so
the generation rule does not need to run next session either.

### 2026-08-27 — session 18

**Feedback inbox:** `feedback/` does not exist in this worktree (checked with
Glob). Nothing to process, nothing moved.

**Six actionable items were in queue** (q22–q27, all unchecked and
unblocked), so the generation rule did not run. Took q22, the top item.

**q22 done.** `tests/a11-determinism.test.ts` (+1 helper, +1 test, 9 tests
total).

**What it does.** QUALITY.md ALPHA's determinism line claims "100/100 replay
hash match, including class actives and uniques," but `a11`'s 100-seed test
drives every seed through `makeInputLog`, which never emits `class_active` or
`equip`. Added `withSkillCommands`, which layers a periodic `{k:'class_active'}`
(every 300 ticks) and one `{k:'equip', relic}` onto a `makeInputLog` log, and a
new test that runs the same record-twice/compare-`endHash` property across 5
seeds (1, 5, 13, 42, 87) with a relic built via `rollRelic` passed through
`RunConfig.relics`. Confirmed live, before trusting it: a throwaway scratch
test (deleted after) showed the skill-augmented log's `damageTotal`/`kills`
diverge from a plain log's for most of the 5 seeds — `class_active` is
genuinely reached and has effect, not vacuously skipped by cooldown or phase.

**`equip` is confirmed a dead command today, exactly as q15 filed it.**
Read `src/sim/run.ts`'s `applyCommand` switch directly: there is no `case
'equip'`, so it falls to `default: break` — relics only ever apply through
`RunConfig.relics` at `Run` construction, never through an in-run Command.
The test fires it anyway and asserts the hash match holds regardless (which
it does, since a no-op can't break determinism), with the gap named by
sentence in the test's own doc comment rather than silently working around it
— exactly what the acceptance line asked for instead of quietly dropping the
half of the item that can't be "fixed" from this lane.

Mutation-tested the new assertion myself before trusting it: temporarily
pointed run `b` at `seed + 1000` while keeping the same input log, confirmed
the test fails immediately with a genuine hash mismatch, reverted, confirmed
`git diff --stat` restricted to the one file with no residual diff.

**Review (code-reviewer, APPROVE, 2 non-blocking Minor/Nit).** Independently
confirmed `equip`'s dead switch case by reading `src/sim/run.ts` directly,
traced `engineer`'s `burst_damage` active (8 s cooldown) against the every-
300-tick (5 s) injection cadence and confirmed it fires on roughly every
other attempt rather than trivially always-or-never, confirmed the relic
id/seed choice has no collision risk (id is unread since `equip` is a no-op),
confirmed no `src/ui`/`src/render` imports or architecture-rule violations,
and confirmed Scope. Non-blocking notes: the same relic instance is reused
across all 5 seeds rather than rolled per-seed (harmless today since `equip`
does nothing), and the `t === 50` equip-fire tick is arbitrary but adequately
explained by the surrounding comment.

**QA (qa-playtester, PASS).** Independently re-confirmed `equip`'s dead case
by reading the source, independently re-derived the non-vacuity finding via
its own scratch comparison (3/5 committed seeds show observable
damage/kill divergence; the other 2 show none at their specific injection
ticks, which is expected range/cooldown-timing variance, not a defect, since
the test's claim is determinism, not guaranteed damage). Ran the file
standalone (9/9 green), mutation-tested the oracle itself
(seed-offset break → immediate red → reverted from a byte-identical backup,
confirmed via `git diff --exit-code`), confirmed Scope, and adversarially
tried 7 additional ad-hoc seeds outside the committed set — determinism held
7/7, with `class_active`/`equip` changing the outcome in 4/7, confirming the
5 committed seeds aren't a lucky fluke for the property actually being
asserted.

**Suite state.** `npx vitest run tests/a11-determinism.test.ts` — 9/9 green,
standalone. `npx tsc --noEmit -p .` clean. Independently re-verified this
session before committing (per this file's own standing lesson — verify
uncommitted work rather than trust it): re-ran the file standalone (9/9
green), then mutation-tested the new assertion myself (offset run `b`'s seed
by +1000, confirmed an immediate hash-mismatch red at seed 1, reverted via
`git checkout --`, confirmed a clean `git status`). A full `npx vitest run`
taken before this commit: **844 passed / 79 skipped, 13 failed** (936 total,
60 files, 400s) — all 13 confined to two files, both pre-existing, documented
artifacts unrelated to this change: 11 in `tests/q14-mutation-smoke.test.ts`
are the "fixture must start clean" / `realFileUntouched` whole-repo
`git diff` precondition, tripped only because this session's own
`BACKLOG-QUALITY.md` edit was still uncommitted at measurement time (the
exact pre-commit-noise shape sessions 12/14/15/16 already documented); the
other 2, `tests/q15-command-domain-fuzz.test.ts`'s `rekindle.structureId`
probe classifying `"hangs"` instead of `"rejected"`/`"accepted"`, are the
same non-reproducible full-suite worker-contention timeout shape sessions
9/13/15/17 already documented for sibling probes. Re-ran both files
standalone post-commit (tree clean): **41/41 green** (21/21
`q14-mutation-smoke.test.ts`, 20/20 `q15-command-domain-fuzz.test.ts`),
confirming both readings were exactly the documented artifacts and not a
real regression.

**A verification mistake worth recording, made and caught in this session.**
While mutation-testing the new assertion pre-commit, `git checkout --
tests/a11-determinism.test.ts` was used to "revert" the temporary mutation —
but with the file's real q22 changes still uncommitted at that point,
`checkout --` reverted all the way to HEAD, silently destroying the
uncommitted work along with the mutation. Caught immediately by re-checking
`git diff HEAD` before staging (empty, where 20+ lines were expected) rather
than trusting the earlier "confirmed clean" note — a git-dirty precondition
this same log entry was already relying on elsewhere. Recovered by
reconstructing the change byte-for-byte from the full diff this session had
already captured in its own transcript, then re-diffing against that exact
text to confirm an identical result before re-running and re-committing. The
lesson for next time: when verifying uncommitted work with a throwaway
mutation, isolate the revert (`git stash`/manual re-edit) rather than
`checkout --`, which cannot distinguish "the mutation I just made" from
"everything since the last commit."

**Five actionable items remain** (q23–q27, all unchecked and unblocked), so
the generation rule does not need to run next session either.

### 2026-08-27 — session 17

**Feedback inbox:** `feedback/` exists but is empty in this worktree. Nothing
to process, nothing moved.

**Six actionable items were in queue** (q21–q26, all unchecked and
unblocked), so the generation rule did not run. Took q21, the top item.

**q21 done.** `tools/fuzz-weapon-boundary.ts` (harness, 3 categories x 9/12/4
cases = 25 total), `tests/q21-weapon-boundary-fuzz.ts` (pinned holes, q7's
multi-const idiom — one `Record<string, Verdict>` per named boundary category
rather than q15's single flat map, since this item has three qualitatively
different boundary mechanisms) and `tests/q21-weapon-boundary-fuzz.test.ts`
(19 tests).

**What it does.** Fuzzes the *shipped* V2/V3 soul-weapon system
(`src/sim/weapons.ts`'s `grantWeapon`/`levelStats`, `src/sim/progression.ts`'s
`soulLevelFor`/`deriveSouls`/`bindSouls`/`applyOffer`) at the three boundaries
q21 named: weapon level 0/1/6 transitions, the Awakening gate at Lv6 + boon
rank 3, and inheritance when a build has fewer distinct souls than weapon
slots. `soulLevelFor`'s own comment already marks this system's retirement
date (SPEC-FINAL §6.1 replaces it wholesale at p2e) — the fuzz is about what's
live today, not a critique of a formula already scheduled for removal. Every
probe is a direct `World` construction plus `forcePlace` (the retired
`tests/sundering.test.ts`'s own technique for writing a `Structure` directly,
bypassing build legality) — no `src/ui`/`src/render` import anywhere, so
headless by construction the same way q15 is.

**Three real findings, each verified live (ran the harness, then confirmed
by temporarily mutating `/src` and reverting) before pinning.** (1)
`grantWeapon`/`levelStats` clamp level 0/negative/±Infinity correctly to
[1,6], but `Math.max`/`Math.min` propagate `NaN` and neither clamp forces an
integer, so `level=NaN` or a fractional level (e.g. 2.5) crashes the live
fire loop on the next tick (`Cannot read properties of undefined (reading
'range')`) — every `fireWeapon` branch dereferences `levelStats`'s result
unconditionally. (2) The identical crash is reachable through the inheritance
path: a `Structure.tier` of `NaN` (not reachable via `upgradeTower`'s own
legality checks today, only by writing the field directly) propagates through
`soulLevelFor`'s `Math.round` into a granted weapon's level. (3) `applyOffer`'s
`'awakening'` case only checks the granting weapon exists — it never re-checks
the Lv6+rank-3 gate that the private `buildOfferPool` enforces when
*generating* an offer, so calling `applyOffer` directly with a hand-built
awakening offer applies it regardless. Verified this is not reachable through
the real Command surface: `takeOffer` only ever plays back `w.offers[index]`,
populated exclusively by the correctly-gated `rollOffers`, and grepping
`src/bots/**`/`src/ui/**` for the relevant function names turns up nothing —
so it's pinned as a defense-in-depth gap (verdict `'ungated'`), not a live
exploit, and the test file includes a positive/negative control against
`rollOffers` itself proving the real path stays clean.

**Review (code-reviewer, APPROVE, 2 Minor/Nit, both fixed here).** Independently
re-ran the harness and the mutation-recovery experiment, traced all three
findings against live `/src` line numbers, confirmed the pinned-map
bidirectionality by temporarily editing the pinned file both ways (missing
entry and bogus extra entry), and confirmed scope. Two small findings: the
"25x negative control" against `rollOffers` didn't actually exercise 25
independent trials of the Awakening gate (the gate check is a deterministic
field comparison, unaffected by RNG) — split into an honest negative control
plus a new positive control that *does* need repetition (proving the offer
surfaces within a bounded number of `rollOffers` draws once eligible, since
each call only samples 3 of the pool); and `forcePlace`'s `hp`/`maxHp` use
flat `def.hp` rather than the real `structureMaxHp` scaling — harmless for
every case in this file (none read HP) but now flagged with a comment for
whoever reuses the helper next.

**QA (qa-playtester, PASS).** Independently reproduced all three findings
against unmodified `/src`, then mutation-tested the pinned map's
bidirectionality for real: deleted an entry (2 tests correctly went red),
and separately patched `src/sim/weapons.ts`'s `levelStats` to guard
non-finite/non-integer levels as if a real fix had landed (5 tests correctly
went red, since the "still crashes" pins go stale the moment the bug is
fixed) — both reverted, `git status` clean throughout. Cross-checked every
data fact the harness assumes (`weapons.json`'s `slots`/`maxLevel`/6-entry
tracks, the `storm_avatar` awakening's exact weapon/boon/rank, the 7 towers
that carry a `soul`) directly against `/data`. Adversarially fuzzed
`Structure.tier` with values outside this session's 5-value set (2.5,
±Infinity, `MAX_SAFE_INTEGER`, -0) looking for a second tier hole — none
found; `Math.round` always yields an integer for any finite input, so `NaN`
is the only propagation gap and it's already pinned.

**QA found one real bug outside q21's three named categories, filed as q27**
(this lane cannot edit `/src`): `applyOffer`'s `'weapon'` case
(`progression.ts:182-186`) has the identical missing-validation shape as the
Awakening finding — `ws.level = Math.min(maxLevel, offer.toLevel)` has no
lower bound and no finite/integer guard, so a forged `Offer` with
`toLevel: NaN` crashes the fire loop the same way, while a negative
`toLevel` is merely latent today (re-floored by `levelStats`'s own read-time
clamp). Same reachability caveat as finding 3: `buildOfferPool` only ever
emits a legal `toLevel`, so this needs a hand-built `Offer`, not a live
exploit. Not folded into q21 itself (its acceptance criteria names three
specific categories, not exhaustive `Offer`-kind coverage) — filed as its own
item so it doesn't silently disappear.

**Suite state.** `npx vitest run tests/q21-weapon-boundary-fuzz.test.ts` —
19/19 green, standalone, twice (before and after the review fixes). A full
`npx vitest run` taken before this commit: **854 passed / 79 skipped, 2
failed** (935 total, 60 files) — both failures confined to
`tests/q15-command-domain-fuzz.test.ts`'s `rekindle.structureId:negInf`
worker-timeout probe, the exact non-reproducible full-suite-contention flake
sessions 9/13/15 already documented for sibling probes; re-ran that file
standalone immediately after, 20/20 green. Not a q21 defect and not fixed
here. `npx tsc --noEmit -p .` clean throughout.

**Six actionable items remain** (q22–q27, all unchecked and unblocked), so
the generation rule does not need to run next session either.

### 2026-08-27 — session 16

**Feedback inbox:** `feedback/` does not exist in this worktree. Nothing to
process, nothing moved.

**q20's implementation was found already sitting in the worktree, uncommitted,
at session start** — the same shape sessions 7/9/10/12/14 have each hit
before (a prior session did the work and wrote the session-16 generation note
at the top of the queue — q22 through q26 — but stopped before verification/
commit). Verified rather than trusted, per this file's own standing lesson.

**q20 done.** `tools/mutation-probe.ts` (`MUTATIONS` grown from 6 to 10, plus
a `COPY_FILES` fix found during verification) and
`tests/q14-mutation-smoke.test.ts` (assertions widened for the new count and
`tools/*` targets).

**What it does.** Adds four mutations targeting `tools/soak.ts`,
`tools/gate-audit.ts`, `tools/fuzz-command-domain.ts` and `tools/perf-ratio.ts`
— all sourced from a real red a prior session's QA pass produced by hand
(sessions 8, 6, 11 and 9 respectively), matching q20's own acceptance line.
The fourth is a deliberate substitution rather than a literal replay: session
9's actual finding (`measureRatioForWorld`'s interleaved-vs-sequential timing
regression) only fails under real external CPU contention, which `probeOne`'s
single, uncontended nested `vitest run` does not reproduce reliably — using it
here would make the mutation-smoke suite itself flaky in the direction that
erodes trust in a "caught" result. `worstCaseWorld()` hollowed to an empty
world (session 9's own anti-vacuity/fixture-reachability catch) stands in
instead, with the substitution and its reasoning disclosed in the file's own
doc comment rather than silently swapped.

**Found and fixed before trusting the work — the interesting part.** Running
the expanded suite for real surfaced a genuine bug the prior session's
uncommitted diff hadn't caught: `tools/gate-audit.ts` resolves `REPO_ROOT` via
`fileURLToPath(new URL('..', import.meta.url))` — relative to its own module
location — and reads `SPEC-FINAL.md`/`BACKLOG-QUALITY.md` from that root at
`SPEC_PATH`/`BACKLOG_PATH`. Inside `probeOne`'s scratch copy this resolves to
a path that doesn't exist, since `COPY_FILES` only ever had
`vitest.config.ts`/`tsconfig.json` — so both the plain control run of
`tests/q10-gate-audit.test.ts` and the new
`gate-audit-hasLiveTopLevelDescribe-hollow` mutation crashed with ENOENT
instead of exercising the real assertion (confirmed live, not reasoned about:
`npx vitest run tests/q14-mutation-smoke.test.ts -t "gate-audit"` failed
before the fix and passed after). Fixed by adding both files to `COPY_FILES`.
Grepped every newly-targeted file and its test file for any other
root-relative read (`REPO_ROOT`, `import.meta.url`, root-relative
`readFileSync`/`existsSync`) before trusting the fix was complete — none
found; the only other absolute-ish resolution
(`fuzz-command-domain.ts`'s worker path) targets a sibling file already
covered by `COPY_DIRS`'s recursive `tools/` copy.

**Isolated each new mutation's two assertions apart from a separate, known
issue.** With the working tree's own three touched files still uncommitted at
verification time, `probeOne`'s `realFileUntouched` check — a whole-repo
`gitDiffClean()`, not scoped to the mutated file — reads false for every
single mutation, old and new alike, purely because *something* in the repo is
dirty. This is the same "fixture must start clean" shape sessions 12/14
already documented for the suite's positive-control precondition, one layer
over: it also poisons `probeOne`'s own untouched-check, not just the explicit
precondition test. Ran each new mutation individually via `-t` to confirm the
*other* half — the nested run genuinely going red — passes cleanly
independent of that noise, before treating any of the four as verified.

**Review (code-reviewer, APPROVE, 1 Nit, fixed here).** Independently diffed
every new mutation's `find` anchor against live source (character-for-
character matches), confirmed `applyEdits` fails loudly rather than silently
no-opping on a stale anchor, confirmed the `COPY_FILES` fix is complete via
its own grep pass, and confirmed Scope (`git diff --stat` restricted to the
three permitted paths). One Nit: the doc comment claimed q20 "quadrupled the
mutation count" — mutations went 6→10 (~1.7x) and nested runs 8→16 (2x),
neither is 4x, the same "note overstates itself" shape this lane's own log
keeps finding. Reworded to "roughly doubled the nested-run count."

**QA (qa-playtester, PASS).** Independently isolated all four new mutations
via `-t`, confirmed each genuinely fails its target test with only
`realFileUntouched` red (the documented git-dirty artifact); hand-verified
`soak.ts`'s two anchor strings match verbatim and that the mutation truly
disables both invariant-scan call sites; grepped the same four files
independently for other missing root reads (none found beyond what review
already confirmed); confirmed scratch cleanup left no stray directories and
`git status` shows only the three expected files. Noted one non-reproducible
flake (`control: tests/q9-phase-coverage.test.ts` once failed to load
`/data/towers.json` under 16 sequential nested-vitest contention, passed 3/3
on isolated retry) — not filed, per QA's own non-reproducible-flake bar,
matching the shape sessions 9/13/15 already documented for sibling probes.

**Suite state.** Full `npx vitest run tests/q14-mutation-smoke.test.ts` taken
pre-commit: 9 passed / 12 failed — every failure traced to the pre-commit
git-dirty artifact above (`realFileUntouched` or the "fixture must start
clean" precondition), none to a real regression. Unlike prior sessions'
identical note, actually re-ran it post-commit rather than asserting it would
land clean: 21/21 green, ~352s, `git status` clean throughout the run.
`npx tsc --noEmit -p .` clean throughout.

**Six actionable items remain** (q21–q26, all unchecked and unblocked), so
the generation rule does not need to run next session either.

### 2026-08-27 — session 15

**Feedback inbox:** `feedback/` does not exist in this worktree. Nothing to
process, nothing moved.

**Three actionable items were in queue** (q19, q20, q21, all unchecked and
unblocked), so the generation rule did not run. Took q19, the top item.

**q19 done.** `tests/pacer.test.ts` (+1 test, 9 total) and `tools/gate-audit.ts`
(G2 note rewritten).

**What it does.** gate-audit.ts's own G2 note claimed "no test asserts a
fast_forward run's end hash against the same run at 1x." Read
`src/ui/main.ts:222-266` first, per the item's own instruction, to find out
what the shipped mechanism actually is before writing anything: fast-forward
is the Pacer's 1x/2x/3x UI speed control (the F key), and it is pure
frame-stepping — `Pacer.plan(dtReal)` only returns a tick count, and the loop
calls the same `run.step()` that many times; there is no distinct sim
entrypoint, so the bit-identity is structural, not incidental. (This is a
different mechanism from the `dev.fast_forward` practice-mode Command in
`src/sim/run.ts`, which deliberately skips simulated time and is *not*
supposed to be bit-identical — same name, unrelated concept, easy to
conflate.)

**The premise was stale — the finding, not a fresh gap.** `tests/pacer.test.ts`
already had a test, "a run stepped in pacer-sized batches hashes the same as
one stepped evenly," that predates this entire lane: `git log --follow` shows
it shipped whole-cloth in `5f57936 feat: fast-forward button and in-run
control row` (2026-08-25), two days before this lane's first commit. It
already proved the invariant — just for one seed (7) at one speed (3x). Same
shape as q17/G17's staleness, one layer smaller: not "zero coverage" but
"real coverage the note failed to credit." Fixed by (1) adding a new test
right after it that widens the same pattern to 5 seeds (1, 3, 11, 42, 99) x
all 3 `SPEEDS` values (15 combinations total, each an independent
`Run`/`Pacer` pair), satisfying q19's literal "several seeds" acceptance
line, and (2) rewriting G2's `GATE_COVERAGE` entry to add
`tests/pacer.test.ts` to its `files` and stop claiming zero fast-forward
coverage, disclosing what's genuinely still missing (tuner content-hash
replay — q18's territory, the Tuner is unbuilt per G15).

Mutation-tested the new test myself before trusting it: temporarily offset
the `fast` run's seed by 1000, confirmed it went red on the very first
combination, reverted, confirmed `git diff --stat` clean. Separately
confirmed via a throwaway script (`bench/.tmp/`, deleted after) that
`Run.hash()` genuinely differs across different seeds, so the equality
assertion is a real oracle. Confirmed `tests/q10-gate-audit.test.ts` has no
assertion on G2's literal note text (only on `status` and ID-list membership),
so the rewrite doesn't break anything there.

**Review (code-reviewer, APPROVE, 1 Minor — this Log entry closes it).**
Independently confirmed the pre-existing test's provenance via
`git log --follow`, confirmed no hardcoded G2 note-text assertions, confirmed
the new test is genuine widening (5 seeds x 3 speeds, not boilerplate),
confirmed Scope (`git diff --stat` restricted to `tests/pacer.test.ts` and
`tools/gate-audit.ts`), and confirmed no architecture-rule concerns (only
`Run.step`/`Run.hash`/`Pacer`/`FIXED_DT` used, no `Math.random`/`Date.now`/
trig introduced). The one Minor — BACKLOG-QUALITY.md not yet updated at
review time — is closed by this entry.

**QA (qa-playtester, PASS).** Ran both touched test files standalone (28/28
green, independent of this session's own run), read `src/ui/main.ts` itself
to confirm the frame-stepping mechanism and the `dev.fast_forward` distinction
independently rather than trusting the write-up. Mutation-tested for real:
broke the `even` run's seed by +1, confirmed the test failed immediately at
the first of 15 combinations with the exact wrong-hash message, restored and
confirmed byte-identical via `md5sum`; separately instrumented (then removed)
a counter to confirm all 15 seed x speed combinations actually execute with
no early exit. Confirmed scope and the pre-existing test's provenance via
`git log --follow`/`git blame` independently. Full-suite run surfaced one
non-reproducible flake unrelated to this change — `tests/q15-command-domain-
fuzz.test.ts`'s `rekindle.structureId:negInf` classified `"hangs"` instead of
`"rejected"` once under full-suite worker contention, then green on two
follow-up runs (one standalone, one full-suite retry) — the same
contention-sensitive worker-timeout shape sessions 9 and 13 already
documented for sibling probes; not filed, per QA's own non-reproducible-flake
bar.

**Suite state.** `npx vitest run tests/pacer.test.ts tests/q10-gate-audit.test.ts`
— 28/28 green. A full `npx vitest run` taken before this commit: **823
passed / 79 skipped, 7 failed** — all 7 confined to
`tests/q14-mutation-smoke.test.ts`'s "fixture must start clean" precondition
on whole-repo `git diff --exit-code`, tripped only because this session's own
edits were still uncommitted at measurement time (the exact pre-commit-noise
shape sessions 12 and 14 already documented; it reads clean once this commit
lands). `npx tsc --noEmit -p .` clean.

**Two actionable items remain** (q20, q21, both unchecked and unblocked), so
the generation rule will need to run next session to bring the queue back
above three.

### 2026-08-27 — session 14

**Feedback inbox:** `feedback/` does not exist in this worktree (checked with
`ls`). Nothing to process, nothing moved.

**Four actionable items were in queue** (q18–q21, all unchecked and
unblocked), so the generation rule did not run. Found `tests/q18-content-hash-replay.test.ts`
already sitting in the worktree, uncommitted, at session start — the same
shape prior sessions have repeatedly hit (a prior session wrote the probe but
stopped before verification/commit). Verified rather than trusted, per this
file's own standing lesson: temporarily un-skipped the test and confirmed it
genuinely fails today (`expected false to be true`), then restored `it.skip`
and confirmed a clean `git status`/`git diff` before treating any of it as
done.

**q18 done.** `tests/q18-content-hash-replay.test.ts` (1 test, `it.skip`'d).

**What it does.** CLAUDE.md's architecture rule 2 promises "`RunConfig`
carries a content hash so a replay against edited `/data` fails loudly."
Grepping the whole repo for `contentHash`/`dataHash`/`configHash` finds no
hits outside docs/comments (`tools/gate-audit.ts`'s own G2 note already flags
this), and `RunConfig` (`src/sim/types.ts`) has no such field. The test
records a run via `replay(config, log)`, then mutates the live cached
`Content` singleton in place (`loadContent().enemyByKey.get('husk').hp *=
50`) — the in-process stand-in for editing `enemies.json` on disk between
record and replay, and the only way to exercise this within one process,
since a second `loadContent()` call would just hand back the same cached
object regardless of what's on disk — and replays the identical
`RunConfig`+log again. Measured today: the second `replay()` does not throw;
the two runs' end-state hashes silently diverge instead (`c8585c4c`/kills=2
before the mutation, `4cf0f10d`/kills=0 after, at this fixture's seed/log).
The assertion is written to the *desired* behavior (`expect(threw).toBe(true)`)
and wrapped in `it.skip`, since this lane cannot edit `/src` to build the
actual guarantee — unskip with the fix.

**BUG filed for main lane:** architecture rule 2's "replay against edited
`/data` fails loudly" guarantee has zero implementation. `RunConfig` carries
no content hash, `loadContent()`'s parsed result is never fingerprinted, and
a replay whose backing content has changed since it was recorded neither
throws nor is detected — it silently produces a different end-state hash
with no signal to the caller that anything is wrong. Repro is
`tests/q18-content-hash-replay.test.ts`; unskip its one test to reproduce
live. Fix belongs at `RunConfig`'s construction (stamp a hash of the loaded
content) and at replay time (recompute and compare, throw on mismatch).

**Review (code-reviewer, APPROVE, 1 Minor, addressed by this Log entry).**
Independently re-verified the repro (un-skipped, reproduced the exact
failure, re-skipped, confirmed no lingering diff), confirmed `World`'s
constructor defaults to the module-level `loadContent()` singleton and enemy
spawning reads `def.hp` live off that shared object rather than a value
baked in earlier — so the in-place mutation is a faithful stand-in for an
on-disk edit, not a strawman. Confirmed the comment's cited `RunReport`
fields, `Hasher.hex()` format, and the `finally`-block restoration of
`husk.hp` are all correct and leave no cross-test contamination. Confirmed
scope (`git diff --stat` restricted to the one new test file). The one
Minor — the test's own comments and the backlog item both point at a Log
write-up and checkbox flip that didn't exist yet at review time — is closed
by this entry.

**QA (qa-playtester, PASS, no bugs found).** Ran the file standalone (skipped,
clean) and confirmed the live repro independently: un-skipped, ran, got
`threw=false`; re-skipped, confirmed byte-identical file content via checksum
before/after and a clean working tree. Mutation-tested the test's own logic
with a disposable, never-committed scratch file: confirmed two replays of the
*same unmutated* config+log produce byte-identical reports (ruling out
replay non-determinism as an alternate explanation for the assertion
failing), and confirmed the mutated replay diverges with the exact figures
(`kills` 2→0, `leaks` 1→2, `endHash` `c8585c4c`→`4cf0f10d`) quoted in the
test's own comment — the failure is genuinely caused by the induced content
edit, not vacuous. Independently grepped for `contentHash`/`dataHash`/
`configHash`, confirmed zero implementation (the one hit outside this test
and `gate-audit.ts`'s note is `BACKLOG-TUNER.md`'s unrelated, unstarted t26d
item in a different lane, whose referenced path does not exist).
`npx tsc --noEmit -p .` clean throughout.

**Suite state.** `npx vitest run tests/q18-content-hash-replay.test.ts` — 1
skipped, exit 0. A full `npx vitest run` taken while this write-up was still
uncommitted read **816 passed / 92 skipped, 1 file failed** — a single
`q14-mutation-smoke.test.ts` case (`removeDir`'s `bench/.tmp/q14-mutation-scratch`
cleanup) failed with a Windows `EPERM` on the scratch directory, a transient
file-lock this file's `RM_RETRY` already exists to paper over and unrelated
to this session's change (q18 touches neither `tools/mutation-probe.ts` nor
`bench/`). Re-running `q14-mutation-smoke.test.ts` alone immediately after
hit the *other*, expected failure instead: its "fixture must start clean"
precondition, which checks whole-repo `git diff --exit-code` and correctly
sees this very commit's own still-uncommitted `BACKLOG-QUALITY.md` edit —
the exact artifact session 12's log already documented ("will read clean
again once this lands"). Both readings are pre-commit noise, not a defect;
the full suite is re-run clean after this commit lands (see below).

**Three actionable items remain** (q19, q20, q21, all unchecked and
unblocked), so the generation rule does not need to run next session either.

### 2026-08-27 — session 13

**Feedback inbox:** `feedback/` does not exist in this worktree (checked with
`ls`). Nothing to process, nothing moved.

**Five actionable items were in queue** (q16, q18, q19, q20, q21, all unchecked
and unblocked), so the generation rule did not run. Took q16, the top item.

**q16 done.** `tools/content-census.ts` (harness + CLI) and
`tests/q16-content-census.test.ts` (15 tests).

**What it does.** `census(content)` counts each of SPEC-FINAL §13's ten content
categories straight out of `loadContent()` (plus `MAX_TIER` from
`src/sim/tiers.ts` for the one category — map tiers — that is a formula
constant, not an authored data array) and reports each against its §13
target. **7 of 10 categories are already at target** today: towers (10/10),
damage types + statuses (6+2/6+2), enemies (20/20), tree nodes (120/120,
excluding the single `kind: 'start'` node the way `tests/grid.test.ts:92` and
`gen-tree.mjs` already do), quests (8, inside the 8–12 range), map tiers
(T1–T5), bosses (2/2, counted via the same `traits.includes('boss')`
predicate `src/sim/loot.ts` uses, not a hand-picked key list — resolves to
exactly `gatebreaker`/`warden_eater`). **3 are short, each carrying a note
naming the P-phase that owns the gap** rather than reading as a silent
regression: classes (3/11, P6), waves (10 of 18+6=24, P3's interleave), and
equipment (0/12+, P7 — deliberately hardcoded rather than counting
`data/relics.json`'s 12 affixes, which is a different, superseded system per
PROGRESS.md's P7 audit line and would have been a wrong-but-passing number).
The pinned test asserts the full table, that every unmet category has a note,
and that the short set is exactly `{classes, equipment, waves}` — the P-phase
audit's own claim turned into something that goes red if it drifts.

**Review (code-reviewer, APPROVE, no findings).** Independently recomputed
every category from `/data` and `src/sim/tiers.ts` by hand, confirmed
equipment is genuinely hardcoded to 0 rather than reading `relics.affixes`,
mutation-tested the pin itself (hollowed `met: classCount === 11` to `true`,
2 tests correctly went red, reverted clean), confirmed the tree-node exclusion
matches `tests/grid.test.ts:92` exactly, and confirmed CLI/doc-comment style
parity with `tools/gate-audit.ts`/`tools/phase-coverage.ts`. No Critical,
Major, Minor or Nit findings.

**QA (qa-playtester, PASS).** Cross-checked every count against the raw
`/data` files directly, confirmed `--json` output parses as valid JSON,
mutation-tested three independent mutations (the classes count check, the
tree-node start-exclusion filter, the boss-trait predicate) — each caught by
2–3 tests, each cleanly reverted (byte-identical diff). One non-blocking gap
recorded, not filed: `tools/content-census.ts`'s `main()` has no try/catch
around `loadContent()`, so a data-corruption failure would print a raw stack
trace instead of a clean CLI message and `--json` mode would emit nothing
parseable — not reachable by anything shipped, since `loadContent()` only
throws on invalid `/data`, which the loader itself already guards against at
every other call site.

QA's own fresh full-suite run read 2 failures in `tests/q15-command-domain-fuzz.test.ts`
(a file from the already-shipped q15, untouched by this commit). Re-ran that
file standalone immediately after: 20/20 green. Session 9's log already
documents this exact shape for a sibling worker-thread-timeout probe (contention-
sensitive, not a regression); q15's own worker/timeout harness is the same
kind of mechanism. Not a q16 defect and not fixed here — flagged for whoever
next touches q15 if it recurs outside contention.

**Suite state.** A clean `npx vitest run` taken before QA's parallel run:
**829 passed / 78 skipped, exit 0** (51 files passed, 7 skipped), ~296s.
`npx tsc --noEmit -p .` clean.

**Four actionable items remain** (q18–q21, all unchecked and unblocked), so
the generation rule does not need to run next session either.

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
