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

- [ ] (q7) [feat] Content-data loader fuzz: mutate every `/data/*.json` in
      memory (retype, drop, negative, extreme, empty-array) and assert
      `loadContent`'s zod schemas + cross-file integrity checks reject the
      result rather than building an unpayable world — acceptance: for each
      schema-guarded field a wrong type is rejected, the census of *accepted*
      mutations is a subset of a recorded list so a new hole goes red, and no
      `/data` file is written — refs: architecture rule 4, SPEC-FINAL §12
- [ ] (q8) [feat] Save round-trip equality property test — the other half of
      QUALITY ALPHA's save line, which q3 covers only for *corrupt* saves:
      generate seeded random **valid** `MetaState`s and assert
      `deserialize(serialize(m))` deep-equals `m`, and that a second pass is a
      fixed point — acceptance: 2000 seeded metas green, including metas grown
      through `applyRunResult` — refs: G18, QUALITY.md ALPHA
- [ ] (q9) [feat] Phase-reachability census: `tools/phase-coverage.ts` reports
      which `Phase` values each shipped bot policy actually enters over N seeds
      — acceptance: tool prints the census and a test asserts the reached set is
      a superset of a recorded floor, so a phase that stops being reachable goes
      red; session 1's `soulpick` hole is pinned as the known gap — refs: lane
      log 2026-08-26
- [ ] (q10) [feat] Gate-coverage audit: `tools/gate-audit.ts` maps SPEC-FINAL
      §14 G1–G20 to the test files that name each gate — acceptance: prints the
      table, and a test asserts every gate id parsed out of SPEC-FINAL §14 is
      either covered by a test file or listed in an explicit recorded-hole set,
      so a new gate cannot arrive uncovered and unnoticed — refs: SPEC-FINAL §14
- [ ] (q11) [polish] Extract the world/report invariant scanner from
      `tools/fuzz-input.ts` into `tools/invariants.ts` and reuse it from q2, q3
      and any future soak — acceptance: q2's suite (including its anti-vacuity
      case, which moves with the scanner) passes unchanged against the extracted
      module — refs: engineer's judgment, HANDOFF §7

## Log

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
