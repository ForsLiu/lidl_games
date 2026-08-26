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
- [ ] (q3) [feat] Save fuzzer: truncated/bit-flipped/version-bumped saves
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

## Log

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
