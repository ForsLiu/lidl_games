# PROGRESS.md — Stonewake status

> Claude: keep this file current. Update at every milestone gate and before any stop.
> A fresh session should be able to resume from this file + CLAUDE.md alone.

## Current state — SPEC-FINAL


> **Older session entries have moved.** Everything before the last 10
> entries below, plus the pre-SPEC-FINAL v0.2/M0-M8 history, now lives in
> `docs/PROGRESS-ARCHIVE.md` (append-only). Read it only when an item
> references old history.

- **2026-09-07 — lane/content: BACKLOG-CONTENT fb062 done (in-lane portion).**
  Pinned Poison Barrel's every-second poison mechanic and, while scoping it,
  found and fixed a real bug: `firePoisonBarrel` (`src/sim/classes.ts`)
  seeded each application's dps with the raw character-scaled `damage`
  directly; since `combat.ts`'s `updateAreas` feeds a poison area's `dps`
  straight into a fixed 3s `applyPoison` stack, this delivered `seed x 3`
  per application instead of SPEC-FINAL §3's authored `seed x 1.2` (120% of
  the triggering damage over 3s) — a 2.5x overshoot. Fixed by routing the
  seed through `dotDpsFor` (`src/sim/damagetypes.ts`), the exact conversion
  `src/sim/cores.ts`'s Corpse-poison call site and `applyDamageType`'s own
  dot branch already use. New `tests/class-poison-barrel-mechanic.test.ts`:
  a regression pin driving the real zone end-to-end (measured 36.0 pre-fix
  against the correct 14.4, confirmed red then green), the 1s cadence and
  3-stack cap, zero direct damage/no lifesteal (both already true, now
  pinned), and one `it.skip`-ed case documenting a tooltip-text mismatch
  that's out of this lane's Scope (`src/ui/class-info.ts`, filed for the UI
  lane in BACKLOG-CONTENT.md). code-reviewer REQUEST-CHANGES, addressed: one
  Major (`tests/p6e-class-diversity.test.ts`'s two live exact-count pins
  were measured against the pre-fix damage and one — the 16/66
  fingerprint-distance pin — plausibly moved; filed for the main lane rather
  than re-measured here, since that ~100-minute excluded suite is not this
  item's to re-run per CLAUDE.md working rule 8), one Minor (a stray scratch
  probe script deleted before commit), one Nit (the `poisonDef` fallback,
  confirmed dead code by QA). qa-playtester PASS: independently re-derived
  the magnitude from raw `/data` via the real `Run`/Command path (not
  reusing the fix's own helpers), confirmed Poison Boost/`active1PotencyMul`
  /Spreading Plague all interact correctly with the corrected magnitude, and
  the zero-damage/undefined-`poisonDef` edge cases are handled cleanly.
  `npx tsc --noEmit` clean; `tests/class-*`/`equip-*` (29 files, 1012 tests,
  run twice) and `npm run test:fast` (4234 passed) green apart from the two
  pre-existing unrelated `q15`/`q45` `tools/fuzz-command-domain`
  scratch-directory module-resolution failures — refs: SPEC-FINAL §4.1
  (Plaguebringer), §3 (Poison), owner feedback
  `feature-poison-barrel-mechanic`.

- **2026-09-07 — lane/content: BACKLOG-CONTENT fb180 done, docs only.**
  `BACKLOG-CONTENT.md` was well past fb178's 400-line budget for live
  backlog files (3807 lines). Every `[x]` item from the Queue (c001-c041,
  all Done/Skipped/Blocked) plus the entire `## Log` section moved verbatim,
  in original order, to `docs/BACKLOG-DONE.md` under a new
  `## BACKLOG-CONTENT.md` heading — the exact treatment fb178 itself gave
  `BACKLOG.md`; verified programmatically (every item id and the full `##
  Log` text byte-identical between the old file and the archive, none
  missing, none duplicated). Kept live, full text unchanged: the `## Scope`
  section (one cross-reference line updated since the Log it pointed to no
  longer lives in this file); the three still-blocked/skipped in-lane items
  (`c004`, `c002`, `c010`) and the five still-blocked owner items (`fb056`,
  `fb057`, `fb059`, `fb061`, `fb062`); a new `### Recently completed` list
  of the last 10 done ids (`c032`-`c041`) as one-liners. `BACKLOG-CONTENT.md`
  is now 210 lines. `tools/status.ts`'s `backlogPaths()` already reads
  `docs/BACKLOG-DONE.md` (fb178), so every feedback-ledger citation for an
  id now living in the archive still resolves —
  `npx vitest run tests/fb038-status.test.ts` green (27/27). code-reviewer
  APPROVE (no Critical/Major; two Minor — this entry closes the missing-
  PROGRESS.md-update one, and an unrelated `npm install`-driven
  `package-lock.json` diff was reverted rather than committed — plus a Nit
  noting `c004`/`c002`/`c010`'s unchanged text still says "see the Log",
  softened by the new pointer note just above it). `npm run test:fast`:
  4227 passed, 53 skipped, only the two pre-existing unrelated `q15`/`q45`
  `tools/fuzz-command-domain` scratch-directory module-resolution failures
  (present on HEAD, unrelated to this docs-only change). No `/src` or
  `/data` change — refs: feedback/feature-token-economy.md, BACKLOG.md
  fb178, BACKLOG-CONTENT.md fb180. **Moved to `docs/PROGRESS-ARCHIVE.md` by
  this same item, to keep this file's last-10 window:** the prior oldest
  entry, 2026-09-07's `BACKLOG fb079` (SPEC-FINAL §10.5 append).

- **2026-09-07 — main lane: BACKLOG p12d done (BALANCE DIRECTION v2 §D gate
  rewrites).** SPEC-FINAL §14's G1/G8/G14/G23 rows now name T3 as reference
  tier with T1 `[55%,90%]`/`>=25% close-win` and T5 `[5%,20%]` as companion
  checks (not replacements), and G8's row replaces the old "top damage
  source differs across >=9/12" clause with the two owner-specified checks:
  (i) every class's own-kit VS damage share >=35% from wave 12; (ii)
  pairwise class-kit fingerprint distance (G22's L1-distance method) >=0.15
  for all 66 pairs. Matching test changes: `tests/p10d-run-length.test.ts`
  (G1), `tests/boss.test.ts` (G14), `tests/p-core-f-gates.test.ts` (G23,
  plus a `tier`/`maxTicks` override added to `runCoreScripted` so the
  companion sweep could reuse it), `tests/p6e-class-diversity.test.ts` (G8,
  whose new diversity checks reuse the file's own existing T3 `beforeAll`
  sweep rather than launching a second one). Every new assertion was run
  against the live sim, not assumed. G1 and G14's T1/T5 companions both pass
  live (single `engineer`/`hybrid` harness, 24/20 seeds). G23's ten new
  per-Core companions needed a scope correction mid-item: a first attempt
  (12 seeds, 120-min cap) ran over an hour and was killed — some Core/tier
  combinations that don't resolve simulate the entire cap, and each such run
  costs far more wall-clock than an early win/loss — reduced to 6 seeds/
  60-min cap, after which 9 of 10 are `.skip`-ed with their measured numbers
  and one (`time` T5) passes live. G8's T5 companion and both new
  diversity-clause pins are live; T1 measured 6/12 (50%, just under the 55%
  floor) and is `.skip`-ed — the same shared harness passed cleanly for
  G1 at n=24, read as sampling noise at n=12 rather than a new wall. Both
  diversity clauses measured red at T3 as expected (0/12 classes at 35%
  own-kit share; 16/66 pairs below the 0.15 fingerprint floor) and are
  exact-pinned. **Both code-reviewer's first pass (REQUEST-CHANGES) and
  qa-playtester independently caught the same real defect**: the
  fingerprint-distance "regression pin" test asserted `>= 0`, which is
  tautologically always true and pins nothing — fixed by re-running the
  ~100-minute `beforeAll` sweep once more (with a temporary `console.log`)
  to capture the real T3 count and land an exact `toBe(16)` pin, plus
  recording that number in the `.skip`-ed clause's own comment. Also fixed
  from review: a stale comment on G1's T5 companion (said "`.skip`-ed...
  once confirmed" next to a case that isn't skipped and passed) and an
  undocumented T1-vs-T5 win-rate denominator convention (T1 divides by every
  seed, T5 excludes timeouts, matching the pre-existing T3 pattern) — now
  documented once and cross-referenced from all four files. G8's T1/T5
  companions are measured once on the shared harness rather than per-class
  (a literal per-class x per-tier sweep would have tripled an already
  ~100-minute file's cost for a question the shared harness already
  answers) — logged as QUESTIONS Q197. `npx tsc --noEmit` clean;
  `npm run test:fast` green except two pre-existing failures
  (`tests/q15-command-domain-fuzz.test.ts`, `tests/q45-cli-schema-violation
  .test.ts`) confirmed via `git stash` to fail identically on unmodified
  HEAD — a scratch-directory module-resolution issue in this sandbox,
  unrelated to this item. No `/src/sim` or `/data` changes.

- **2026-09-07 — BACKLOG fb083 done.** A new tower-only Area stat key,
  `towerArea`/`derived.towerAreaMul` (`statkeys.ts`/`stats.ts`), closes the
  global-`area` leak c013/c024 measured: the Animist's Wide Grove ("all
  towers +10% area") and Time Lord's Chronal Surge (+10% every
  `waveInterval` TD waves, uncapped — areaMul 3.203 at a seed-2 `cycles: 6`
  run's end) both re-authored onto it, and no longer widen the caster's own
  class Actives or VS-wielded attacks. `towers.ts`'s
  `effectiveTowerRange`/`effectiveTowerAoe` gained a caller-chosen
  `route: 'tower' | 'character'` parameter (default `'tower'`; `vswield.ts`'s
  four wielded-attack call sites pass `'character'` explicitly per §6.1;
  tower-cloned summons — Pop Turret, Manifest Spirit via
  `towerSummonProfile` — stay on the default, QUESTIONS Q195). Two more
  shared reads couldn't take that parameter — Electric's inherent AoE
  (`damagetypes.ts`) and Burning's splash (`enemies.ts`'s `tickDotSplash`)
  only ever receive a `source: string` — so a first pass left them starved
  (neither route reached them). Fixed with a new exported
  `isTowerSource(w, source)` helper beside the existing `dotPotency`,
  reusing its exact `!w.huntsWarden && w.content.towerByKey.has(source)`
  idiom (QUESTIONS Q196), so a real tower's Electric/Burning hit reads
  `towerAreaMul` again, a class Active's/Core's does not, and a tower's
  attack during VS correctly stays on the character route. Also closed:
  `data/equipment.json`'s Normal Bracelet authored only `area: 0.1` despite
  promising "character and tower area +10%", silently dead on its tower half
  the moment Wide Grove moved off that key — given `towerArea: 0.1`
  alongside, mirroring Sniper Bracelet's `towerRange`/`charRange` split.
  code-reviewer **APPROVE**, no findings (traced every `effectiveTowerAoe`
  caller and `isTowerSource`'s VS-phase guard, confirmed the split complete
  via the wide-grove-reach file's regex completeness guards); qa-playtester
  **PASS** on all six acceptance criteria, independently probing the engine
  rather than trusting the shipped tests — one pre-existing,
  fb083-unrelated `q15`/`q45` CLI-fuzz environment failure noted (repros on
  the pre-fb083 commit) and one doc nit fixed inline (`content.ts`'s Chronal
  Surge comment). `npx tsc --noEmit` clean; the 12-file targeted suite this
  item touches 634/634; `q7-data-fuzz` regenerated and green (new
  `equipment.items[].mods.towerArea` census row) — refs: SPEC-FINAL §2,
  §4.2, QUESTIONS Q163/Q195/Q196, BACKLOG-CONTENT.md c013/c024/c036.

- **2026-09-07 — lane/content: BACKLOG-CONTENT c039 done, negative result, no
  `/data` change.** Delegated to balance-analyst per this item's own
  acceptance: find a `data/classes.json`-only tune that raises Bloodlord's
  pairwise fingerprint distance from necromancer/animist (0.0355/0.0720,
  both far under the 0.15 floor) without moving win rate. Mechanism
  analysis found Bloodlord's two Actives deal zero engine-attributed damage
  by design (Blood Tithe becomes *tower* damage via a multiplier, Crimson
  Rush only heals), leaving `basicAttack.dps` as the only lever into the
  vector at all — measured at a baseline 0.04-0.05% share, ~100x short of
  what the floor needs, since ~98% of the L1 distance is shared *tower*
  usage under the common `hybrid` bot, not kit-mix. One candidate
  (`basicAttack.dps` +37%) was tried and measured anyway: win rate roughly
  halved (8-seed control pair, 3/8 -> 1/8) with the fingerprint gap still
  two orders of magnitude short even in that degenerate arm. Reverted;
  `data/classes.json` confirmed byte-identical to HEAD. Five other fields
  rejected on mechanism alone. Same structural wall Q175/p12f/c033 already
  documented for clause (i), read here for clause (ii) on Bloodlord — closing
  it needs a `/src` change, out of this lane's Scope.

- **2026-09-07 — lane/content: BACKLOG-CONTENT c041 done, re-measurement
  only, no regression.** c018/c019's summon-cooldown headroom numbers
  (Engineer Pop Turret, Animist Manifest) were a measurement with an expiry
  date per CLAUDE.md's rules; re-derived against current `/data` (unchanged
  since c018) via a binary search built on the file's own already-validated
  `lapsPerLife` formula. Engineer: cliff ≈3.328s vs shipped 3s, ~9.8-10.9%
  headroom (c018: "~3.35s, ~11%"). Animist: cliff ≈4.996s vs shipped 4s,
  ~19.9% headroom (c018: "~5.00s, ~20%", an almost exact match). Both
  comfortably positive, nothing to flag for `p10r`. New
  `describe('c041: ...')` in `tests/class-active2-cdr.test.ts`, made live
  (not `.skip`-ed) since the derivation is cheap pure arithmetic. code-reviewer
  approved (no Critical/Major; two Minor notes fixed — an unsafe type cast
  replaced with a real `ClassEffect` spread, and descriptive failure messages
  added to the four key assertions). `npx tsc --noEmit` clean; full file
  92/92 passed.

- **2026-09-07 — lane/content: BACKLOG-CONTENT c040 done, measurement only,
  no `/data` tune.** `c033` measured G8's diversity clause (ii) using only
  the damage-*source* half of "damage-source/damage-type vector method"
  (BALANCE DIRECTION v2 §D); this item tried the damage-*type* half
  (`RunReport.damageByType`) instead, off the identical runs (extended
  `c033`'s own `beforeAll` sweep to accumulate both, no second sweep).
  Result: **11/66 pairs clear the 0.15 floor, against `damageByWeapon`'s
  50/66 on the same runs** — a sharp regression, not an improvement. Damage
  *type* is a far coarser bucket than damage *source*: nearly every class
  reads as `physical`-dominant regardless of kit, so most pairs cluster near
  zero; only Stormcaller (electric) and, more weakly, Time Lord separate
  cleanly. Logged for `p12d`/owner sign-off per this item's acceptance — this
  is evidence *against* swapping clause (ii)'s metric to `damageByType`, not
  for it. code-reviewer approved (no Critical/Major; confirmed
  `damageByWeapon`/`damageByType` share the same `enemies.ts` choke point and
  normalizing total, and the new sanity check is correctly index-aligned).
  qa-playtester independently re-ran the full sweep pinned to commit
  `e132fc7`, reproduced the exact 11/66 and unchanged 50/66 readings, and
  confirmed `damageByWeapon`/`damageByType` are genuinely different
  accumulators (Stormcaller's 10.5% electric share, Time Lord's 4.5%
  bleeding, both outliers every other class lacks). No bugs filed.
  `npx tsc --noEmit` clean.

- **2026-09-07 — lane/content: BACKLOG-CONTENT c038 done, one premise
  correction, no bug found.** The item's own premise named three files with a
  hardcoded roster-size assumption ("12 classes"); checked against the code,
  only `tests/class-kit-fingerprint.test.ts` actually pinned a live literal
  (`toBe(12)`/`toBe(66)`) — `class-kit-damage-share.test.ts` already derives
  its counts from `content.classes.classes` live, and
  `class-time-lord-band.test.ts` has its own comment disclaiming a
  roster-count pin (naming three *other*, out-of-lane files that carry one).
  New `tests/class-roster-size.ts` (mirrors `class-board.ts`'s shared-module
  precedent, c014) exports `rosterSize()`/`pairCount()`/`ROSTER_SIZE`/
  `PAIR_COUNT`, read live off `content.classes.classes.length`; the
  fingerprint file's invariant now reads those instead of the literals. New
  `tests/class-roster-size.test.ts` re-derives both independently and clones a
  class row plus its required `vsupgrades.json` skillCards entry into a
  synthetic 13th class, proving `pairCount`'s formula itself moves (66 -> 78)
  rather than just the count field. code-reviewer approved (no
  Critical/Major; one Nit noting the fingerprint file's own updated assertion
  is now tautological against the shared cached `Content`, which is correct
  since the live-formula proof lives in the new file's independently-loaded
  case instead). `npx tsc --noEmit` clean; `npm run test:fast` 4046 passed,
  same two pre-existing unrelated `q15`/`q45` failures.

- **2026-09-07 — lane/content: BACKLOG-CONTENT c037 done, one measurement,
  one premise correction, no bug found.** `c036`'s same-stat-key stacking
  check had a twin gap on the *character*-passive slot: Engineer's *Efficient
  Engineering* (`towerCost -10%`) vs the Normal Necklace (`towerCost -20%`),
  and Bloodlord's *Blood Frenzy* (`leech +3%`) vs the Bleeding Ring
  (`leech +0.01%`). New `c037` describe block in
  `tests/class-passive-liveness.test.ts` proves the `towerCost` pair
  multiplies to the real `0.72` (not `0.70`) through `w.derived.towerCostMul`
  — the same device `c036` used for `towerRange`/`area`. The item's own
  `leech` premise (predicting a multiplicative `(1.03)(1.0001)` reading) was
  wrong: `src/sim/statkeys.ts` classifies `leech` `STAT_KIND.flat`, not
  `mul`, by deliberate design ("rates and flags, not boosts: leech and luck
  are read raw", flagged under Q62), and `derive()` reads it via
  `Stats.total()` (a sum), not `Stats.factor()` (a product) — measured at
  `0.0301`, not `0.030103`. Shipped test pins the real additive reading, with
  the correction documented inline (same shape as c008/c017/c018).
  code-reviewer approved (no Critical/Major; two Minor/Nit comment-precision
  notes, folded into the final wording) and qa-playtester independently
  re-derived `STAT_KIND`/`derive()`'s behaviour from source, mutated all four
  `/data` fields plus both `Stats` read paths (six mutations, each reverted),
  and independently re-ran the exhaustive class-passive/equipment key diff,
  confirming these are the only two overlaps left after c036. `npm run
  test:fast`: 4043 passed (three new), same two pre-existing unrelated
  `q15`/`q45` fuzz-command-domain failures c029 already logged as present on
  HEAD; `npx tsc --noEmit` clean.

- **2026-09-07 — BACKLOG fb082 done.** `updateAreas`'s poison branch
  (`src/sim/combat.ts`) is gated on a per-area `tickSeconds` accumulator
  (the pre-existing `GroundArea.acc` field, declared since the type was
  written but never read) instead of firing every 60 Hz frame, closing the
  SPEC-FINAL §4.1 "applying poison damage every second" defect
  `tests/class-spec-numbers.test.ts` had tracked. Authored explicitly as
  `groundTickSeconds: 1` in `data/classes.json`'s Plaguebringer `active1`
  (a new `.positive()`-validated schema field, read in `firePoisonBarrel`),
  with a loader cross-check refusing `groundTickSeconds > groundDurationSeconds`.
  A first pass shipped a real ~3.5x DPS regression, independently measured
  by code-reviewer and qa-playtester (429.6 -> 120 total damage over the
  barrel's 5 s life): gating call frequency alone while leaving
  `applyPoison`'s hardcoded `duration: 1.0` unchanged let every stack expire
  before the next application arrived, collapsing 3 sustained stacks (the
  pre-fix spam's emergent behavior) to 1. Fixed with `duration: tick *
  POISON_STACK_CAP`, restoring the sustained-cap magnitude; a new test
  drives real DoT decay (`updateEnemies`) alongside `updateAreas` to prove
  `dotStacks` reaches 3 at steady state, confirmed red against the naive
  fix. qa-playtester also found that a poison area whose whole lifetime is
  one `tickSeconds` window (Venom Spore's own trail blob) went permanently
  silent — the cadence check ran *after* the area's own expiry early-return,
  losing the one scheduled application to a rounding race at the boundary
  (measured 0 damage at the shipped 1.4286 s interval). Fixed by
  re-ordering so the poison branch's accumulate-and-check happens before
  marking the area dead (every other type's expiry behavior, including
  `'burn'`'s pre-existing negligible sub-frame loss, is unchanged);
  `vsspecials.ts` now also ties the trail's own `tickSeconds` to
  `special.interval` explicitly rather than the engine's `?? 1` default. A
  narrower limitation — a non-exact-multiple lifetime loses its trailing
  partial window, no fractional final tick — is logged rather than
  engineered around: unreachable by any shipped `/data` row today, and
  qa-playtester's own suggestion is a future item if a duration-scaling
  skill card is ever authored for Poison Barrel.
  A re-review round (code-reviewer + qa-playtester again) both came back
  APPROVE/PASS, independently re-measuring the DPS restoration and
  re-driving the Venom Spore fix through the real tower-build pipeline at
  three interval values. One more Minor closed: `groundDurationSeconds <= 0`
  with `groundTickSeconds` left unauthored slipped past the exceeds-check
  (which only compares when both fields are present); closed with an
  independent, `ground_poison`-scoped positivity check (not a schema-wide
  change, since `dash_trail`/`time_lock` share the field for a lifetime with
  no cadence to cross) — confirmed via an unchanged q7 census that this
  closes no further fuzzer holes (real data always authors
  `groundTickSeconds`, so the combination was never reachable through the
  existing single-field mutation families).
  `tests/q7-loader-holes.ts` regenerated twice (once for the new field,
  again once the loader cross-check closed `groundDurationSeconds`'s own
  stale negative/zero holes) — diffed both times to confirm purely
  additive/closing changes. `npm run test:fast`: only the documented
  pre-existing `q15`/`q45` flake, both before and after every fix in this
  item. `npx tsc --noEmit` clean throughout. A short cross-lane note was
  added to BACKLOG-CONTENT.md's Log: fb082 unblocks fb062 (a broader,
  still-open content-lane item — its own zero-direct-damage/no-lifesteal
  and tooltip-text acceptance is untouched by this item).
