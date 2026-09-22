# BACKLOG-CONTENT.md — lane: content (branch `lane/content`)

Split out of BACKLOG.md on 2026-09-03; ids unchanged. Same item format,
working rules, verification tier (targeted tests + `npm run test:fast`) and
loop-mode contract as BACKLOG.md, plus CLAUDE.md's lane rule: up to TWO
items per iteration when both are small ([bug]/[polish] or data-only).
Everything touching shared sim core (balance orders, dash, density,
pathing, damage rules) belongs in BACKLOG.md, not here.

## Scope (hard boundary)

May create/edit ONLY:
- `src/sim/classes.ts` — class kits/tuning (note: the repo has no
  `src/sim/classes/` directory today; all kit code lives in this one file.
  Splitting it into a `src/sim/classes/**` directory is allowed, and that
  directory is then in scope)
- new files under `src/sim/` named for this lane's classes (e.g.
  `src/sim/madness-king.ts`, `src/sim/voltbolt.ts`)
- `data/classes.json`, `data/equipment.json`
- `tests/class-*`, `tests/equip-*`
- this file
- `PROGRESS.md` — not a lane file, but CLAUDE.md working rule 4 requires it be
  updated "at every phase gate and before any stop", which every lane loop hits.
  Named here so the next loop does not re-adjudicate it (code review, c014).

Read anything. Everything else is read-only: an out-of-scope need is
written into this file (a new dated Queue subsection) and becomes
main-lane (or other-lane) work at the merge — never edited from this lane.

## Queue

> **Completed work has moved.** Done items and fully-closed historical
> sections now live in `docs/BACKLOG-DONE.md` (append-only, one section per
> backlog file, in original order). Read it when an item references old
> history; day-to-day work only needs the open items below plus the last 10
> completions. `tools/status.ts`'s feedback ledger reads the archive too, so
> nothing drops off STATUS.md's ledger.

### Checked 2026-09-14 — feedback/verdicts-q168-205 priority (4)

The owner's priority directive asked to check why this lane's routine had
"delivered nothing since Sep 3" and, if an overlap guard was tripping on a
stale branch/PR, close it. **Finding: already resolved, no fix needed.**
`git log` shows this lane merged twice on 2026-09-14 itself — c002 (closed
as superseded by BALANCE DIRECTION v2 §D, PR #51) and c004 (Animist
Kinship summon cap +1, PR #57) — with no stale open PR or branch found for
`lane/content` at the time of this check. The queued owner items below
(fb056, fb057, fb059, fb061) remain the real backlog, not a broken loop.

### Actionable in this lane

- [x] (fb180) [polish] **DONE 2026-09-07.** token economy (fb178, main lane):
      this file was well past the 400-line budget fb178 set for live backlog
      files. Every `[x]` item from the Queue (c001-c041, all Done/Skipped/
      Blocked by the time this ran) plus the entire `## Log` section moved
      verbatim, in original order, to `docs/BACKLOG-DONE.md` under a new
      `## BACKLOG-CONTENT.md` heading — the same treatment fb178 itself gave
      `BACKLOG.md`. Kept live, full text unchanged: the `## Scope` section;
      the three still-blocked/skipped in-lane items (`c004`, `c002`,
      `c010`) and the five still-blocked owner items (`fb056`, `fb057`,
      `fb059`, `fb061`, `fb062`); a new `### Recently completed` list of
      the last 10 done ids (`c032`-`c041`) as one-liners.
      `tools/status.ts`'s `backlogPaths()` already reads
      `docs/BACKLOG-DONE.md` (fb178), so every feedback-ledger citation for
      an id now living in the archive still resolves — verified via
      `npx vitest run tests/fb038-status.test.ts`. No `/src` or `/data`
      change — refs: feedback/feature-token-economy.md, BACKLOG.md fb178.

- [x] (c010) [balance] **DONE 2026-09-17 (main lane, fb127) — was BLOCKED
      out of Scope 2026-09-04, see the Log.** Stormcaller *Conduction* was
      authored on the wrong row: the passive named a rule about electric
      damage *generally* ("+20% per jump, compounding, cap 8 jumps"), but
      its two numbers lived only on `active1` (`chainGrowth`/`chainCap`),
      leaving the passive row prose with `mods: {}` and no `kind`. The fix
      needed `src/sim/content.ts` (schema, `REQUIRED_EFFECT_FIELDS`/
      `REQUIRED_PASSIVE_FIELDS`) — out of this lane's Scope — so fb127 did
      it from the main lane: `chainGrowth`/`chainCap` moved onto the
      passive row (now `kind: 'conduction'`) in `data/classes.json`,
      `fireChainSurge` (`src/sim/classes.ts`) reads them off `cls.passive`
      instead of `cls.active1`, and the loader now refuses a copy left on
      `active1` instead of silently accepting two sources of truth. G11's
      x3.6 ceiling (`tests/p6d-nine-classes.test.ts`,
      `tests/class-gate-ratios.test.ts`, `tests/class-g10-g11-verify.test.ts`)
      re-measured unchanged, confirming shipped behaviour is unaffected —
      the same numbers just live in the right row now. Whether *tower*
      electric should also compound is logged as QUESTIONS Q209, not
      implemented — refs: SPEC-FINAL §4.2, §14 G11, BACKLOG.md fb127.

### Finding 2026-09-17 — fb056/fb057/fb059 carry a second, deeper Scope blocker than fb085 fixed

fb085 (main lane) wired the `content.ts`/engine seams its own commit named as
blocking (`effectKey` enum, the four Madness King/Voltbolt schema kinds, the
`World.timeLockZones` array, `equipmentEffectNum`) "so those five owner items
can execute inside the lane's Scope." Checked directly while scoping fb061
(the one item in that group this session could actually execute): that fix
does not reach the real wall for the other three. `tests/equip-spec-numbers.
test.ts` (§7's ledger, `tests/equip-*`, in-Scope) and `tests/class-spec-
numbers.test.ts` (§4's ledger, `tests/class-*`, in-Scope) both **parse
SPEC-FINAL.md itself** and hash the parsed section (`SPEC_7_SHA256`/
`SPEC_4_SHA256`); `equip-spec-numbers.test.ts` additionally hardcodes
`expect(SPEC_TABLE).toHaveLength(12)` and, for every item in
`data/equipment.json`, looks up `specRowFor(item.key)` — which throws for any
key §7's table does not name. A **brand-new** item or class (unlike a retune
of an existing one, see fb061 below) has no row to point at, so appending one
to `/data` fails this in-Scope ledger the moment it loads, and the only fix
(adding the item's row to SPEC-FINAL.md §7/§4.2, which also moves the hash)
touches a file this lane may not edit — **SPEC-FINAL.md is not in the Scope
list above.** This is a materially different, harder blocker than "a closed
zod enum" or "no World field": it is a hand-authored source-of-truth
document with its own anti-laundering hash, deliberately outside every
lane's Scope, not a mechanically-regenerated artifact like `tests/q7-loader-
holes.ts` (which c004 and this session's fb061 both *could* regenerate
in-Scope via `Q7_RECORD=1`, since that file states in its own header that it
is generated, not hand-authored).
The practical unblock: a main-lane pass appends fb056's 15 rows to SPEC-FINAL §7
(with a fresh `SPEC_7_SHA256`) and fb057/fb059's two class blocks to §4.2
(with a fresh `SPEC_4_SHA256`) — genuinely a spec-authoring decision (the
owner feedback for fb057/fb059 is explicitly tagged `[designer-fill]`, i.e.
SPEC-FINAL.md does not have this content settled yet either), not a data
task this lane can settle unilaterally. Once those rows exist, this lane can
author the matching `/data` rows and `tests/equip-*`/`tests/class-*` ledger
entries in one ordinary pass. Leaving all three `[ ]` below unchanged
(unfixable from here, same disposition as the original 2026-09-03 finding,
now with the precise mechanism named instead of the four items fb085 already
closed).

### Blocked out of Scope (owner items, unchanged order)

- [x] (fb056) [feat] top priority: **DONE 2026-09-22 (main-lane session,
      full repository scope granted by the owner — the lane walls in the
      Findings above did not apply).** 15 class-specific equipment items
      (Plaguebringer set of 6, Time Lord set of 6, Swordsman completion of 3)
      in `data/equipment.json`, per owner feedback
      `feature-class-equipment-sets`. **Spec:** the owner's table is appended
      to SPEC-FINAL §7 as `### 7.1 Class equipment sets` (verbatim rows +
      the owner's synergy chains). **Ledger:** new
      `tests/equip-class-sets-spec.test.ts` (+ `equip-class-sets-spec.ts`
      parse) — §7.1 parsed and hashed; every numeric column, every "if not
      <class>" fallback and every mechanic magnitude held to `mods`/
      `classFallback.mods`/`effectNums`; a residue check fails on any numeral
      no quote claims, "instead of N" baselines are checked against
      `data/classes.json`, the three engine-only numbers (trail segments/
      radius, Band contact radius) are declared designer-fill; c012's §7
      ledger now parses only the owner table above §7.1 but still hashes all
      of §7, with a roster bridge (every item audited by exactly one ledger).
      **Engine:** every mechanic reads its own `effectNums` through the new
      class-gated `classEquipmentNum`/`classEquipmentActive`
      (`sim/equipment.ts`) — live only for the class `classFallback` names,
      so mechanic and fallback are mutually exclusive; a new loader registry
      (`validateEquipmentEffectNums`, content.ts) refuses unknown, missing,
      out-of-range and non-integer magnitudes. Hooks: Plague Flask
      (`classBasicAttack`), Miasma Robe (zone drift in `updateAreas` + Poison
      Boost refresh), Carrier's Boots (`layCarriersTrail` on the base dash,
      run.ts), Ring of Contagion (existing fan-out seam), Pestilent Locket
      (all `effect: 'dot'` types boosted + `activeCooldownSeconds`),
      Blightweaver Band (Contagious-Flame-shaped contact spread), Hourglass
      Scepter (`characterDotSpeedMul` in `applyDot` — fb013's dormant clause,
      rewired from the Warden's incoming DoT to the character's DoTs on
      enemies per fb013's own wording, inert at 1), Chronomail (8 s / 12 s at
      <=30% HP), Sandals (6 s rewind buffer), Loop Ring (`activeMaxCharges`/
      `activeRechargeSeconds`, also the bottom bar's), Pendulum Pendant
      (refund + 60% elite execute), Bracer of Overlap (real multi-zone Time
      Lock on fb085's `timeLockZones`), Ring of a Thousand Cuts, Duelist's
      Pendant (merge keeps the hold live at 50%), Bracer of the Whirlwind.
      **UI:** `effectNote` gains `{n:field}`/`{pct:field}` live-number
      substitution (`withEffectNums`, equipment-info.ts) used by the in-run
      tooltip, Hub and Codex; the Codex and the loot table already iterate
      `content.equipment.items`, so all 15 list and drop (pinned by test).
      **Tests:** `tests/equip-class-sets-behaviour.test.ts` (30 cases — every
      effect clause, one fallback per set, each set's headline synergy);
      caught one real bug before commit (Pendulum Pendant's refund was
      clamped before the press spent its own charge, losing it at a full
      bar — fixed, clamp moved after the spend). Adapted, not weakened:
      fb085-enablers fixtures (drop the shipped row their stand-in replaces),
      c023/c031 rosters, q16 census (27), q7 holes regenerated by
      `Q7_RECORD=1` with the negative/zero floors re-pinned under the new
      measurement (the registry closed holes — the floors' own documented
      "falling is the fix working" precedent). Design readings: QUESTIONS
      Q215. **Review/QA (full tier):** code-reviewer REQUEST-CHANGES, three
      Majors all fixed with a failing regression test first — Duelist's
      Pendant chain never ended nor paid its cooldown (now once per hold,
      `Warden.active1RefundUsed`, hashed); Blightweaver Band re-scaled tower
      poison by kit power (each stack now spreads under its own source);
      seven descs printed HP at 1/10 (fixed + a §7.1 desc audit added) —
      plus its Minors (trail cadence moved to `/data` as `trailTickSeconds`,
      `driftSpeed` hashed, class check before the allocating `hasEquipment`,
      stale comments). qa-playtester PASS on every acceptance clause
      (loads/drops in real bot runs/equips/save-load/mid-run swaps, 6 replay-
      verified practice runs), two Minor bugs fixed with regression tests:
      the Miasma Robe fallback read "+10% Max HP %" (`modLines` no longer
      doubles a label's own `%`), and a wall-blocked dash piled all three
      Carrier's Boots patches on one spot (patch count now scales with the
      distance travelled). QA's two logged-not-bugs are in Q215's addendum
      (per-executed-enemy Pendant refunds; the latent Robe+Boost runaway if a
      `cdr` source ever ships). `npx tsc --noEmit` clean — refs: SPEC-FINAL
      §7.1, §8.1, owner feedback `feature-class-equipment-sets`.

- [ ] (fb057) [feat] normal priority: new class #13, Madness King (visible
      roster, 4th alongside Swordsman/Plaguebringer/Time Lord) — full kit
      per the owner feedback file: Passive "Whispers" (3s madness on hit,
      cap 5 concurrent from the passive), Active1 "Mind Manipulation" (3
      charges, converts non-elite/boss targets to fight for the character
      until death/wave-clear, keeps a converted target's stacked
      speed/attack-speed madness bonus permanently; elite/boss branch: 3
      ticks of (their attack + character basic-attack) damage over 1s plus
      90% slow instead), Active2 "Spreading Madness" (r4 ⚖ AoE 10s
      madness), Tower passive "Frenzied Aim" (linear attack-speed ramp by
      proximity, max bonus = character's total attack-speed bonus +10% at
      point-blank). Madness status: mad enemy attacks nearest other enemy
      in r3 (or self + random-walk in r1 if none), +10%/+10% atk-speed/
      move-speed per madness attack, stacking, lost at expiry; elites
      never gain the movement change and keep normal pathing. Housekeeping:
      roster becomes 13 (SPEC-FINAL §4.2/§13 census, G8 diversity clause
      ->=10/13, Codex, dev profile, class-select, attack-sprite registry).
      Acceptance: tests per the feedback's "Done when" list (passive cap
      then-expiry, conversion fight/death/permanent-bonus-keep, elite
      3-tick+slow branch, Active2 targeting + self-attack fallback +
      stacking reset + elite movement exception, tower passive scaling
      formula, VFX registry entries for teammate/self attacks with visible
      ramp, replay determinism) — refs: SPEC-FINAL §4.2 (designer-fill
      addition), §13 (census), §14 (G8), owner feedback
      `feature-class-madness-king`.

- [ ] (fb059) [feat] normal priority: new class #14, Voltbolt (visible
      roster) — hitscan basic attack (normal damage type, no travel time);
      Passive "Arc" (basic attacks chain once more at 25% damage to the
      nearest not-yet-hit enemy in r3, applying on-hit effects, 0.1s
      delayed chain visual); Active1 "Lightning Ball" (thrown to cursor,
      lives 2.5s, fires the character's basic attack incl. passive/
      Overdrive chains at total attack speed, damage boosted by 25%
      efficiency of total move-speed bonus); Active2 "Overdrive" (5s: 3
      total chains at 25%/12.5%/12.5%, each basic attack during it adds
      +2.5%/+2.5% atk-speed/move-speed stacking additively per SPEC-FINAL
      §2, reset at expiry; end-of-duration normal-damage burst around the
      character scaled by move-speed bonus for damage and attack-speed
      bonus for radius); Tower passive "Lightning Accelerate" (+100%
      tower projectile speed; towers gain 50%-efficiency conversions of
      the character's total attack-speed and move-speed bonuses). Roster
      becomes 14 (G8 diversity ->=11/14, SPEC-FINAL §4.2/§13 census, Codex,
      dev profile, class-select, attack-sprite registry). Acceptance:
      tests per the feedback's "Done when" list (chain targeting/fallback,
      0.1s chain delay, Lightning Ball's attack-speed/move-speed-efficiency
      math, Overdrive's 3-chain pattern + additive stacking + reset, burst
      damage/radius scaling, tower projectile-speed/stat-conversion
      formulas, replay determinism, hitscan has zero travel time) — refs:
      SPEC-FINAL §4.2 (designer-fill addition), §13 (census), §14 (G8),
      owner feedback `feature-class-voltbolt`.

- [x] (fb061) [feat] normal priority: **DONE 2026-09-22 (main-lane session,
      full repository scope — the out-of-Scope test-file wall the Finding
      below names no longer applied).** Plaguebringer's Active1 Poison Barrel
      is a hold/release charge skill on Circle Slash's model: `ground_poison`
      joined `isChargeKind` (a bare `class_active` Command now declines, pays
      nothing), the Barrel fires on release from `tickClassCharge`, and
      `poisonBarrelValues(eff, charge)` (classes.ts, exported for the
      renderer) lerps the cloud radius `minRadius` 5 -> `radius` 10 (x1 -> x2)
      and lifetime `minGroundDurationSeconds` 8 -> `groundDurationSeconds` 14
      over `chargeCapSeconds` 2 — all authored in `data/classes.json`; poison
      per second and fb062's 1 s cadence untouched. `canvas.ts`'s
      `drawChargeIndicator` draws the charge-scaled cloud ring (Area
      included); the class sentence states both ends. Loader: a `ground_poison`
      row must author a positive `chargeCapSeconds`, a `minRadius` no larger
      than `radius`, and (review finding) a `groundTickSeconds` no longer than
      the zero-charge lifetime — otherwise a quick-release cloud expired
      before its first application. SPEC-FINAL §4.1 amended (owner text).
      Tests re-fired through hold/release, never weakened: p6c's three
      bare-Command casts now assert the Command declines *and* a hold fires
      it; fb085's placeholder flipped to the shipped 8 <= 14; the §4 ledger
      (c008) re-hashed with five `match` rows (2 s, r5, r10, 8 s, 14 s)
      replacing the 5 s one; class-area-stat/ui-fb115 split zero vs full
      charge; class-kit-whiff/liveness gained a CHARGE_KINDS check that the
      bare Command declines for all three hold kinds; a new charge-ring
      render test; q7 holes regenerated. **Review (full tier):**
      code-reviewer REQUEST-CHANGES, both Majors fixed test-first — the
      scripted-bot harness (`tests/helpers.ts`) kept a stale charge-kind list,
      so every scripted G8/G14/G23 run stopped casting the Barrel (it now reads
      the sim's exported `isChargeKind`; `fb123-charge-kind-bot-coverage` adds
      Plaguebringer under all 8 policies, red before the fix), and a first-pass
      p6c edit had let fb061's new loader rules mask fb082's (fixtures now
      built on a floor-free row with exact messages). Minors taken: loader
      refuses a non-positive `minRadius` and a default-1 s tick above the
      floor; cadence and Sleeve Sword/Armor non-interaction pinned. Two
      fb056 behaviour tests re-fired through hold/release; fb060's
      frame-budget timing case moved to the perf tier after it read over
      budget at host load ~13. Readings: QUESTIONS Q216. — refs: SPEC-FINAL
      §4.1 (amended), owner feedback `feature-plaguebringer-charge`.

### Finding 2026-09-17 — fb061 attempted and reverted: blocked by out-of-Scope test files, not a data wall

Attempted a full implementation this session: `ground_poison` joined
`isChargeKind` (classes.ts), `firePoisonBarrel` gained a `chargeSeconds`
param lerping radius (`minRadius` 5 -> `radius` 10) and lifetime
(`minGroundDurationSeconds` 8 -> `groundDurationSeconds` 14) exactly the way
`circleSlashValues` already does for Circle Slash, `data/classes.json`
authored the four new `active1` fields (`minGroundDurationSeconds` is the
field fb085 pre-wired for exactly this), `tests/class-poison-barrel-
mechanic.test.ts` was rewritten for the hold/release firing model, three
other `tests/class-*.ts` files' shared generic per-Active harnesses (`class-
area-stat`, `class-kit-liveness`, `class-kit-whiff`) were updated to fire it
via hold/release like Circle Slash, and `tests/q7-loader-holes.ts` was
mechanically regenerated for the one new census line (`Q7_RECORD=1`, same
precedent as c004) — all of that landed green, `npm run test:fast`-tier.

**Then a broader check this item's acceptance did not name — grepping every
`tests/*.ts` for `ground_poison`/`Poison Barrel`, not just `tests/class-*`/
`equip-*` — found the real wall:** `tests/p6c-plaguebringer.test.ts` (3
tests) and `tests/fb085-enablers.test.ts` (1 test) are neither `class-*` nor
`equip-*`, and both hardcode the *pre-amend* behaviour as their own
assertion, not incidentally:
- `p6c-plaguebringer.test.ts` fires Poison Barrel with a bare
  `{k:'class_active'}` Command and asserts `active1Cooldown > 0`/a zone
  exists *immediately* — three tests, all red the instant `ground_poison`
  becomes a charge kind, because a charge-kind Active1's Command is supposed
  to decline (the same p6b rule Circle Slash/Deadeye Draw already prove
  behaviourally in `tests/class-kit-whiff.test.ts`'s own `fire()` helper).
- `fb085-enablers.test.ts` asserts `plaguebringer.active1.
  minGroundDurationSeconds` is `undefined` on "every currently-shipped
  ground_poison row" — a deliberate placeholder fb085 wrote because fb061
  had not landed yet, per fb085's own commit message part (c): "minGround-
  DurationSeconds beside groundDurationSeconds for fb061's 8s->14s Poison
  Barrel charge floor" (correction: an earlier draft of this paragraph
  misattributed this to fb056 and mis-quoted the commit — code-reviewer
  caught it; the field and the commit's own comment are fb061-only).

**This is not the SPEC-FINAL.md wall the Finding above names — it is a
different, equally hard one specific to fb061.** The owner's own spec for
this item ("same hold/release model as Circle Slash") is *definitionally*
incompatible with a bare-Command instant fire: Circle Slash's own framework
precedent (`isChargeKind`, `useClassActive`'s early return) exists exactly
to refuse that combination, so there is no narrower implementation of "hold
to charge" that leaves `p6c-plaguebringer.test.ts`'s three assertions true.
Landing fb061 correctly necessarily reddens tests in two files this lane's
Scope does not allow editing (`tests/p6c-*`, `tests/fb085-*` are covered by
neither `tests/class-*` nor `tests/equip-*`), and leaving them red would
mean pushing a lane branch whose CI does not pass — not an option per
working rule 2 and this routine's own instruction to keep CI green without
weakening tests. **Reverted the entire attempt** (`git checkout --` on every
touched file except this one) rather than commit a red `npm run test:fast`.

The practical unblock is the same shape as the Finding above: a main-lane
(or coordinated) pass updates `p6c-plaguebringer.test.ts`'s three Command-
based casts to the hold/release model and flips `fb085-enablers.test.ts`'s
placeholder assertion, in the same commit as this lane's `/data`/`classes.ts`
change — which is exactly what a lane-boundary merge is for, not something
this lane can pre-empt by editing those files itself. Left `[ ]` below,
unchanged content, with this precise mechanism named instead of the original
2026-09-03 blocking reason (which was accurate before fb085 landed, and is
now superseded by this finding for fb061 specifically — fb056/fb057/fb059
are still blocked by the separate SPEC-FINAL.md wall above).

### Closed 2026-09-07 — c002 superseded by BALANCE DIRECTION v2 §D

- **(c002) [balance] SUPERSEDED, not executed as written.** c002 was
  "SKIPPED 2026-09-03, blocked on the Q161 owner verdict" — QUESTIONS.md's
  Q161 entry now carries that verdict: "approved as evidence — resolved by
  BALANCE DIRECTION v2 §A/§D: kit-growth multiplier + re-anchored kit
  numbers close the own-kit-share wall this entry found, and G8's diversity
  clause is rewritten per §D to the own-kit-share target plus a pairwise
  fingerprint-distance check rather than the unreachable >=9/12
  distinct-top-source bar." c002's own acceptance text ("the top damage
  source per class... the distinct-key count rises") measures exactly the
  `>=9/12` clause the verdict retired — there is no live gate left for that
  metric to move. The `c032`-`c041` arc already did the real work the
  verdict's replacement clauses needed (own-kit-share target: `c032`/`c034`;
  fingerprint-distance check and its measurement method: `c033`/`c039`/
  `c040`; Bloodlord's specific wall: `c039`). Closed as superseded rather
  than executed — refs: QUESTIONS Q161, BALANCE DIRECTION v2 §D, c032-c041.

### Filed 2026-09-07 — fb062 cross-lane findings (not this lane's to fix)

- **Tooltip text (main-lane/UI-lane follow-up).** `fb062`'s third acceptance
  clause ("a tooltip text test matches the owner's sentence-form wording")
  cannot close from this lane: the sentence lives in `poisonBarrelSentence`
  (`src/ui/class-info.ts`), and `src/ui/**` is not in this lane's Scope. The
  shipped sentence ("Drops a 3-tile poison cloud dealing 2.4 damage/s for
  5s. ... Cooldown 7s.") names a flat continuous rate, not the real
  per-application/3s-window/3-stack-cap mechanic the fix below makes exact.
  `tests/class-poison-barrel-mechanic.test.ts` carries an `it.skip`
  documenting the exact current (wrong) string as the UI lane's repro.
- **`tests/p6e-class-diversity.test.ts` (main lane) — two live exact-count
  pins measured against the pre-fix, 2.5x-overshooting Poison Barrel; found
  by code-reviewer on the fix below.** Plaguebringer's own-kit VS-share
  count (pinned `0`, `:673`) is very unlikely to move — Plaguebringer was
  already measured far under the 35% floor (15.4%, per that file's own
  comment) and this fix only *shrinks* one of its two Actives' damage, which
  cannot newly cross a floor from below. The fingerprint-distance failure
  count (pinned `16/66`, `:711`) has no such margin visible and plausibly
  moved: Poison Barrel is one of Plaguebringer's two damage-share vector
  components, now ~40% of its former size. Re-measure both (or at least the
  second) the next time that excluded, ~100-minute suite actually runs,
  per CLAUDE.md's "a deferral is a measurement with an expiry date" rule —
  not re-run from here per working rule 8 (no gate/full-suite re-measurement
  outside a `[balance]` item or one whose acceptance is a gate
  re-measurement).

### Note 2026-09-14 — lane-content stall check (verdict directive item 4)

The verdict file (`feedback/verdicts-q168-205.md`) asked to check why this
lane "delivered nothing since Sep 3" and, if an overlap guard is tripping on
a stale branch/PR, close it and note the fix here. Checked directly against
GitHub: no stale branch or open PR was blocking the lane — **c004 landed
today** (2026-09-14, PR #57, merged), so the routine is running. The real
reason `fb056`/`fb057`/`fb059`/`fb061` have sat "Blocked out of Scope" since
2026-09-03 is recorded above in this file and in `docs/BACKLOG-DONE.md`
(session 1, 2026-09-03): each needs a file outside this lane's hard Scope
(a main-lane-owned test file with a hardcoded equipment census, a closed
zod enum in `src/sim/content.ts`, a `World` field, `src/sim/classes.ts`'s
own scope is fine but the supporting schema/test plumbing is not) — not a
branch/PR overlap problem. No fix applied here since there was nothing
stale to close; the actual unblock (widening this lane's Scope, or moving
the five items to BACKLOG.md as main-lane work) is a main-lane call, not
this lane's to make unilaterally.

**Superseded in part, 2026-09-17:** fb085 (main lane) fixed the zod-enum/
`World`-field detail named above — see the two 2026-09-17 Finding sections
higher in this file. Each of the four items is still blocked, but for a
different, harder reason: fb056/fb057/fb059 hit the SPEC-FINAL.md hash-ledger
wall, and fb061 hits two other out-of-Scope test files hardcoding pre-amend
behaviour. This paragraph's own listed reasons are history, not the current
blocker.

### Recently completed

- (c004) [bug] **DONE 2026-09-14.** Animist's Kinship passive now authors
  `mods: { summonCap: 1 }` in `data/classes.json` (was `{}`), closing SPEC-
  FINAL §4.2's "summon cap +1" clause via the generic `summonCap` StatKey/
  `Derived.summonCapBonus` fb084 (main lane) had already wired into all three
  `classes.ts` summon sites — no class-key check added. Found and fixed a
  real bug while closing it: the unconditional +1 raised Manifest's true top
  cap from 5 to 6 (3 authored + 2 skill-card max + 1 Kinship), which the
  shipped 4s cooldown's cadence ceiling (5) could not reach — reopening the
  exact "cadence cliff" c018 fixed once before. Retuned `active1.
  cooldownSeconds` 4 -> 3.2 (the one free, non-spec-authored lever), restoring
  ~20% headroom against the new ~3.997s cliff, the same margin c018/c041
  recorded pre-fix. Updated the §4 ledger row (`class-spec-numbers.test.ts`,
  unimplemented -> match, with a `c027` behavioural pointer), the c018
  cadence-ceiling and c041 headroom re-measurements (`class-line-bonus.test.ts`,
  `class-active2-cdr.test.ts`) to read the bonus generically off `/data`
  rather than re-deriving stale numbers, `class-passive-liveness.test.ts`
  (route 4 -> route 3 reclassification, a new `signal.kinshipSummonCap`, a
  live-cadence regression proving +1 for Animist and no leak to Engineer/
  Necromancer), and mechanically regenerated `tests/q7-loader-holes.ts`'s
  ACCEPTED census (one new line for the newly-non-empty `passive.mods`, via
  `Q7_RECORD=1`, not hand-edited). code-reviewer APPROVE (two Minor: a stray
  `package-lock.json` diff from `npm install`, discarded; this BACKLOG/
  PROGRESS update, done here). `npx tsc --noEmit` clean; targeted `class-*`
  files and `npm run test:fast` green (4297 passed / 34 pre-existing skips,
  no new) — refs: SPEC-FINAL §4.2 (Animist), BACKLOG-CONTENT c018/c041.
- (fb062) [feat] **DONE 2026-09-07 (in-lane portion; tooltip filed above for
  the UI lane).** pin down and enforce Poison Barrel's every-second poison
  mechanic. Found and fixed a real bug while scoping it: `firePoisonBarrel`
  (`classes.ts`) seeded each application's dps with the raw character-scaled
  `damage` directly; since `combat.ts`'s `updateAreas` feeds that straight
  into a fixed 3s `applyPoison` stack, this delivered `seed x 3` per
  application instead of SPEC-FINAL §3's `seed x 1.2` (120% over 3s) — a
  2.5x overshoot. Fixed by routing the seed through `dotDpsFor`
  (`damagetypes.ts`), the exact conversion `cores.ts`'s Corpse-poison call
  site and `applyDamageType`'s own dot branch already use. New
  `tests/class-poison-barrel-mechanic.test.ts`: the corrected formula
  end-to-end through the real zone (regression-tested red pre-fix, measured
  36.0 vs the correct 14.4), the 1s cadence and 3-stack cap, zero direct
  damage/no lifesteal (both already true, now pinned), and one `.skip`-ed
  tooltip case documenting the UI-lane blocker above. code-reviewer
  REQUEST-CHANGES (one Major — the `p6e` staleness risk above, filed rather
  than fixed; one Minor — a stray scratch probe script deleted before
  commit; one Nit — the `poisonDef` fallback, confirmed dead code by QA
  since `content.ts`'s `REQUIRED_DAMAGE_TYPE_KEYS` makes the row mandatory
  at load). qa-playtester PASS: independently re-derived the magnitude from
  raw `/data`, confirmed Poison Boost/`active1PotencyMul`/Spreading Plague
  all interact correctly with the corrected (smaller) magnitude, and
  confirmed the zero/`poisonDef`-undefined edge cases are handled cleanly.
  `npx tsc --noEmit` clean; `tests/class-*`/`equip-*` (29 files, 1012 tests)
  and `npm run test:fast` green apart from the two pre-existing unrelated
  `q15`/`q45` failures — refs: SPEC-FINAL §4.1 (Plaguebringer), §3 (Poison),
  owner feedback `feature-poison-barrel-mechanic`.
- (c041) [polish] **DONE 2026-09-07** — c018/c019's summon-cooldown headroom numbers (Engineer
- (c040) [balance] **DONE 2026-09-07** — `c033` measured only the **damage-source** half of
- (c039) [balance] **DONE 2026-09-07, negative result, no `/data` change** — `c033`'s pairwise fingerprint measurement (2026-09-07,
- (c038) [polish] **DONE 2026-09-07** — the roster size (12 classes) is a **hardcoded
- (c037) [bug] **DONE 2026-09-07** — `c036`'s same-stat-key stacking check has a twin gap on the
- (c036) [bug] **DONE 2026-09-07** — equipment-sourced and class-tower-passive-sourced bonuses on the same stat
- (c035) [bug] **DONE 2026-09-07** — the three Swordsman-locked equipment items' off-class fallbacks are proven
- (c034) [bug] **DONE 2026-09-07** — `p12a`'s kit re-anchor (up to x3 on absolute kit-damage magnitudes) was
- (c033) [balance] **DONE 2026-09-06** — G8's diversity clause was rewritten by BALANCE DIRECTION v2 §D (owner

Full text for these and all earlier completions: `docs/BACKLOG-DONE.md`.
