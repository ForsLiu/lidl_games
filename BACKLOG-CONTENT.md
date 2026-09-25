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

- [x] (fb057) [feat] normal priority: **DONE 2026-09-22 (main-lane session,
      full repository scope).** Madness King is class #13 and the fourth
      normal-profile class (`NORMAL_PROFILE_CLASS_KEYS`, bands high/low/low/
      no/high). **Kit** (`data/classes.json`, SPEC-FINAL §4.2 row added):
      *Whispers* (3 s on-hit madness via the shared `onHit` fan-out, cap 5
      tracked by `Enemy.madnessFromPassive`, Active2's madness takes no
      slot; class-line card "Louder Whispers" +1 cap/rank); the **Madness**
      status (`updateMadnessAttack`, enemies.ts: a mad enemy walks to and
      strikes the nearest other enemy within r3 at its contact cadence, else
      itself while wandering r1 around where it went mad; each attack +10%/
      +10% atk/move, reset at expiry; the bonus never speeds its attacks on
      structures or the character — `enemyAttackSpeedMul` no longer folds it
      in; elites keep pathing and never gain the move bonus; damage source
      `madness`, kit-attributed, never kit-power-scaled); *Mind Manipulation*
      (3 charges/8 s; the enemy nearest the cursor within r2 leaves the
      roster without a kill and fights as a `'converted'` `ClassSummon`
      keeping its madness bonus until the wave is cleared; elites/bosses
      instead take 3 ticks of their attack + the basic hit over 0.99 s and a
      90% slow via `w.mindTicks`); *Spreading Madness* (r4 at the cursor,
      10 s, 12 s ⚖ cooldown); *Frenzied Aim* (`frenziedAimMul`, towers.ts:
      linear from 0 at max range to the character's attack-speed bonus +10%
      point-blank). Unlock quest `mob_mentality` (200 lifetime enemy-on-enemy
      kills, `w.enemyOnEnemyKills`: madness/converted kills and Spreading
      Plague transfers, so it is reachable before the class exists). VFX:
      CLASS_VFX row + crown impact, `MADNESS_VFX` teammate/self strikes with
      a stack-driven brightness ramp. **Housekeeping:** roster 13 across §4/
      §13/§14 G8 (78 pairs), content census, ~30 roster-counting tests each
      given a real Madness King row (never an exemption), c008 re-hashed with
      16 new rows. New `tests/class-madness-king.test.ts` (41 cases: the
      owner's whole "Done when" list incl. replay determinism). A QA-style
      test caught a real bug before commit: the wander re-anchored every tick
      (drift without bound) — fixed with `madnessAnchorX/Y`, hashed. Excluded
      G8 suite (`p6e-class-diversity`) carries an `it.skip('madness_king')`
      "never measured" pin, like p10v's precedent. **Review/QA (full tier):**
      code-reviewer REQUEST-CHANGES, Major fixed: an enemy's hit on *another
      enemy* is economy A per the owner's Q180 override (`enemyHitOnEnemies`
      scales it by `numberScale`; madness had hit 10x harder than authored).
      qa-playtester PASS on every acceptance clause (two replay-verified
      hybrid runs with ~2,000 Actives each, 26 adapted suites green), plus
      fixes test-first for its two small Majors — Spreading Madness now frees
      a Whispers slot it takes over, and the elite 90% slow is its own timed
      status instead of inheriting a frost aura's duration. Its third (a
      converted teammate freezes at walls) and the review's Minors are fb202.
      Readings: QUESTIONS Q217.
      — refs: SPEC-FINAL §4.2, §13, §14 G8, owner feedback
      `feature-class-madness-king`.

- [ ] (fb202) [polish] fb057 code-review follow-ups, none blocking: (a) the
      Madness status's r3 search / r1 wander are still enemies.ts literals —
      author them on the `whispers` row (rule 4); (b) `updateMadnessAttack`
      and `madnessMoveTarget` scan every enemy per mad enemy per tick
      (measured 2.4 ms/tick at 350 mad of 350) — use `nearestEnemy`'s spatial
      index with a module-level filter; (c) a converted teammate walks a
      straight line with an all-or-nothing passability check (can stall on a
      maze wall) and treats "only submerged enemies left" as "none left";
      (d) Whispers-cap bookkeeping when Spreading Madness extends a
      passive-mad enemy (it keeps its slot) and when Whispers extends an
      Active2-mad one (no slot); (e) whether self-kills should count toward
      `mob_mentality` (Q217(13)); (e2) madness stacks are unbounded under
      repeated Whispers refreshes (QA: 2,509 stacks on a tanky target over
      60 s, and a convert keeps them) — cap them; (f) the basic-attack projectile reuses
      Engineer's `bolt` shape — the owner asked for a distinct crown/scepter
      projectile (only the impact is distinct); (g) the DPS panel shows the raw
      `madness` source key; (h) measure Madness King's G8 band (the excluded
      p6e suite pins it `it.skip` "never measured", and its 78-pair failing
      count pin moves on the next full-tier run). Acceptance: each of (a)-(g)
      fixed with a test, (h) measured and pinned — refs: fb057 review,
      SPEC-FINAL §4.2, §14 G8.
      **Shipped 2026-09-23 (scheduled routine), (a)-(e2):** (a) both radii
      moved to `data/classes.json`'s `whispers` row as `madnessSearchRadius`/
      `madnessWanderRadius` (`REQUIRED_PASSIVE_FIELDS`-guarded, `num.
      positive().optional()`), read by two new `enemies.ts` helpers; q7/c008/
      the class-descriptions ledger regenerated (2 `in_code` rows closed to
      `match`/`field`). (b) `updateMadnessAttack`/`madnessMoveTarget` now
      call `w.nearestEnemy(..., isOtherLiveMadnessTarget)`, a module-level
      filter function with a module-level "self id" set immediately before
      each call (safe: the sim tick is single-threaded, neither caller
      re-enters before its own call returns) — no more per-tick closure
      allocation or full-roster scan. (c) `updateConvertedSummon`
      (classes.ts): the target search now excludes submerged enemies
      (`(e) => !e.submerged`, matching the madness search's own exclusion) so
      "only submerged left" correctly counts as "none left"; the passability
      check is now axis-decomposed (two independent `passable` calls, mirror-
      ing `moveEnemy`'s own wall-slide) instead of one combined-tile
      all-or-nothing test. (d) `fireSpreadingMadness` no longer unconditionally
      clears `madnessFromPassive` on every enemy it touches — **this reverses
      Q217(15)'s logged reading**, which turned out to be the bug itself, not
      a design choice (see QUESTIONS Q218(a)): an already-Whispers-held enemy
      now keeps its slot when Active2 merely extends its duration; a *fresh*
      Active2-only mad enemy still takes no slot (unchanged, since
      `madnessFromPassive` starts `false` and nothing sets it true here
      anymore). (e) No code change: Q217(13) already answered this exact
      question (self-kills count) and shipped code already reflects it —
      QUESTIONS Q218(b) records the review's alternative reading as filed,
      not adopted. (e2) new `madnessMaxStacks` field (`whispers` row,
      `num.int().positive().optional()`, `REQUIRED_PASSIVE_FIELDS`), default
      20 chosen and logged (QUESTIONS Q218(c), no owner/spec number exists);
      `registerMadnessAttack` now takes `w` and refuses to grow past it.
      Six new regression tests in `tests/class-madness-king.test.ts`
      (submerged-exclusion death, axis-slide — verified failing against the
      pre-fix single-check via a scoped manual revert, a second discriminating
      axis-order case, stack cap) plus the existing "Spreading Madness ...
      releases its passive slot" test rewritten to assert the corrected (d)
      behaviour; `tests/fb085-enablers.test.ts`'s three `whispers` fixtures
      gained the three new required fields. `npx tsc --noEmit` clean; targeted
      tests + `npm run test:fast` green (4843 passed, 34 pre-existing skips).
      Light tier (`[polish]`). code-reviewer REQUEST-CHANGES on the first
      pass: (c)'s axis-decomposed fix checked the Y branch against `s.x`
      *after* the X branch may have already mutated it, so whichever axis
      happened to be checked first could still flip the other's outcome —
      the exact bug class this fix exists to close, and the first test did
      not discriminate it (blocked both the diagonal and the "north" tile,
      so the coupled and independent versions agreed by coincidence). Fixed
      by snapshotting `s.x`/`s.y` into `ox`/`oy` before either branch and
      checking both against those; the new second test (only the diagonal
      tile blocked, both real axes open) fails on the coupled version and
      passes on the fix — confirmed by the same scoped-revert method as the
      first. code-reviewer's other finding (`nearestEnemy`'s strict-`<`/
      lowest-id tie-break differs slightly from the old loops' inclusive-`<=`/
      last-encountered one) was Nit-level, not a determinism hazard, and left
      as-is. Re-verified green after the fix (targeted: 47/47).
      **Left `[ ]` — out of this lane's Scope or too large for one item:**
      (f)/(g) filed below as cross-lane findings (render/UI, not
      `src/sim/**`); (h) needs a live re-measurement of the excluded,
      ~1-hour `tests/p6e-class-diversity.test.ts` sweep (working rule 8: not
      run speculatively outside a `[balance]` item or one whose acceptance
      is itself a gate re-measurement — which this clause is, but the sweep
      alone exceeds one scheduled-routine item's time budget, same class of
      deferral fb197 logged). Item stays open for (f)/(g)/(h) alone.

- [x] (fb059) [feat] normal priority: **DONE 2026-09-23 (main-lane session,
      full repository scope).** New class #14, Voltbolt (visible roster, the
      fifth card), on fb085's pre-wired seams. *Arc*: every basic attack — a
      hitscan Normal strike, no travel — queues a `VoltChain` link landing
      exactly 0.1 s later (6 ticks, a `fresh` flag and a 1e-9 tolerance) on
      the nearest enemy within r3 of the struck one that this attack has not
      hit, else the original target; all hits go through one shared
      `landCharacterHit`, so on-hit riders (Plague Flask poison, proven with
      its class gate lifted) ride every link. *Lightning Ball*: thrown to the
      cursor (clamped to basic range, `ballSpeed` 12 ⚖ — a new required
      field), hovers, lives 2.5 s, fires the basic attack (chains included)
      at the character's total attack speed, damage x(1 + 25% of the total
      move-speed bonus) x Active1 potency. *Overdrive*: 5 s, three links
      (25/12.5/12.5%), +2.5%/+2.5% attack/move speed per basic attack
      (additive within the source, `charspeed.ts`), reset at the end; end
      burst `characterDamage(150 ⚖) x (1 + move bonus)` over `classArea(r3 ⚖) x
      (1 + attack bonus)`; E declines while a window is open. *Lightning
      Accelerate*: tower projectile speed x2 (pierce bolts, lob shells and
      their lead), towers +50% of the character's total attack-speed bonus
      as attack speed and +50% of its move bonus as damage. `charspeed.ts`
      (new) owns the character's live attack/move composition so towers and
      classes share it without an import cycle. Unlock `live_wire` (300 chain
      hits in one run, `max_chain_hits`), counting every chain jump past the
      first — Voltbolt links, Chain Surge jumps, Tesla Coil chains/step-3 arc.
      Loader range rules, hash coverage, VFX (hitscan line, delayed arcs,
      crackling ball, stack-ramped aura, burst ring), tooltip sentences,
      tower-info, SPEC-FINAL §4 row + §13 (14) + §14 G8 (91 pairs). Every
      roster test gains a real Voltbolt row (c005/c006/c007/c008 re-hashed
      with 18 match rows/c009 three clauses/c013/c015/c016/c021, fb108/fb115,
      q7 census re-recorded, its `negative`/`zero` floors re-pinned to 0.71/0.79
      with dated notes); new `tests/class-voltbolt.test.ts` (58 cases: the
      owner's whole "Done when" list, replay determinism, hash coverage,
      loader refusals). **Review (full tier):** code-reviewer REQUEST-CHANGES
      -> APPROVE after test-first fixes: chain links dealt damage during the
      defeat beat (Major; `w.dying` guard), a ball shot's link landed a tick
      late, the VS cadence omitted shrine haste, a zero chain share closed up
      the pattern, and the fast tier caught tower-info missing the damage
      share. **qa-playtester: PASS** on every acceptance clause; three bugs
      fixed test-first — `live_wire` was unreachable in a normal profile
      (Stormcaller is hidden; tower chains now count), Overdrive recast was
      reachable with Voltbolt's own cards (now declines), a non-finite aim made
      a NaN ball (sanitized; `scanWorld` now covers balls). Follow-ups fb203
      (balance/G8) and fb204 (a pre-existing Time Lock NaN aim) below.
      Readings: QUESTIONS Q219. — refs: SPEC-FINAL §4.2 (designer-fill
      addition), §13, §14 (G8), owner feedback `feature-class-voltbolt`.

- [ ] (fb203) [balance] Voltbolt's late-game scaling and its G8 row are
      unmeasured (fb059 QA). With the owner's formulas as specced, the
      character's total attack-speed multiplier reached x7.6-x14 in VS on
      seed 1 (full tree + boons), which puts Overdrive's burst radius
      (`classArea(r3) x (1 + attack bonus)`) at 35-55 tiles — map-wide — and
      Lightning Accelerate gave towers up to x3.4 attack speed / x1.87 damage
      by TD wave 18. Acceptance: measure Voltbolt's G8 win-rate row and the
      91-pair fingerprint census (the excluded ~1 h `p6e` sweep, working rule
      8 — this item's acceptance *is* the measurement); if out of band, tune
      the ⚖ values (burst base/radius, ball speed) or propose a cap on the
      burst-radius multiplier in QUESTIONS.md for an owner verdict (the
      formula itself is owner text) — refs: fb059, QUESTIONS Q219(11).

- [x] (fb204) [bug] **DONE 2026-09-25 (scheduled routine, lane `content`).**
      A non-finite aim (`NaN`/`Infinity` — a hand-edited input log or replay
      bundle can produce one, a mouse cannot) reached Time Lord's *Time Lock*
      zone position: `fireTimeLock`'s `aimX ?? wd.x` only guards `undefined`.
      **The real defect was generic, not Time-Lock-specific**, so the fix is
      too: a new `sanitizeAim(aimX, aimY)` helper (`src/sim/classes.ts`, near
      `aimDirection`) converts a non-finite value on either axis
      independently to `undefined`, called once at the top of both Command
      entry points, `useClassActive`/`useClassActive2`, before either
      dispatches to any of the 12 kinds routed through them — rather than
      patching each `fire*` function the way fb059 patched
      `fireLightningBall` alone. `fireLightningBall`'s own now-redundant
      local guard was simplified to lean on the upstream sanitization.
      **QA's first pass found the fix incomplete**: Archer's *Deadeye Draw*
      (`charge_pierce`) is a charge-kind Active1 that fires from
      `tickClassCharge` on release, reading `TickInput.aimX`/`aimY` directly
      — the one aimed Active that bypasses `useClassActive` entirely, so a
      non-finite aim still reached `aimDirection`'s `normalize` call and
      came back `{x: NaN, y: NaN}` (confirmed via the emitted `class_active`
      VFX event's NaN endpoint; does not corrupt `hashWorld` or break replay
      determinism, since `w.fx` is never hashed, but produces a wrong,
      always-miss shot). Fixed at its own call site (`tickClassCharge`, one
      `sanitizeAim` call before `fireDeadeyeDraw`); `charge_nova`/Circle
      Slash and `ground_poison`/Poison Barrel are self-centered with no
      `aimX`/`aimY` parameter at all, so neither has the same gap (QA
      confirmed). New `tests/class-nonfinite-aim.test.ts` (42 cases): the
      reported Time Lock case (whole-pair and per-axis-mixed NaN/Infinity,
      zone lands at the Warden/aim point, always finite), a snapshot-
      equivalence table proving a bad aim behaves identically to no aim at
      all across the other 11 `useClassActive`/`useClassActive2`-routed
      kinds (dash_line, repair_heal, dash_trail, dash_volley, death_pact,
      ice_wall, chain_lightning, blood_tithe, dash_heal, mind_manipulation,
      spreading_madness), and the QA-added Deadeye Draw follow-up block —
      every case verified red before its fix (manually reverted and
      reapplied) and green after. **Review (full tier):** code-reviewer
      APPROVE, no Critical/Major (traced the two entry points as the only
      callers of every `fire*` aim-taking function, confirmed architecture
      rule 1 compliance). **qa-playtester:** FAIL on the first pass (the
      Deadeye Draw gap above, with a precise repro), **PASS** on the
      follow-up once fixed — also adversarially checked mixed-axis pairs,
      Bracer of Overlap's multi-zone Time Lock, mid-dash/Overdrive-window/
      dying-state re-entry, and a 20,000-tick scripted run interleaving
      non-finite aims at both the Command and raw-`TickInput` level (no
      crash, no NaN in `hashWorld`). `npx tsc --noEmit` clean; targeted
      tests + `npm run test:fast` green (5059 passed, 34 pre-existing skips,
      0 new). **Left `[ ]`, filed below, not done here:** widening
      `tests/q15-command-domain-fuzz.test.ts`'s aimed-Active coverage past
      Engineer/Swordsman and adding `timeLockZones` to `scanWorld`
      (`tools/invariants.ts`) — both out of this lane's Scope
      (`tests/q15-*` matches neither `tests/class-*` nor `tests/equip-*`;
      `tools/**` isn't listed at all) — refs: fb059 QA finding 3, q15.

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

### Filed 2026-09-25 — fb204's remaining acceptance clauses (main-lane, not this lane's to fix)

- **Widen `tests/q15-command-domain-fuzz.test.ts`'s aimed-Active coverage.**
  `tools/fuzz-command-domain.ts`'s `class_active`/`class_active2` rows only
  ever fuzz Engineer (Active1) and Swordsman (Active2) — every other class's
  aimed Active, Deadeye Draw's now-fixed `tickClassCharge` path included,
  goes unprobed by this file's own anti-vacuity fuzzer. Needs new
  `FIELD_SPECS` rows (or a per-class sweep) in `tools/fuzz-command-domain.ts`
  and a regenerated `tests/q15-command-domain-holes.ts` census
  (`Q15_RECORD`-shaped, same precedent as q7's `Q7_RECORD=1`). Out of this
  lane's Scope: `tools/**` is not listed at all, and `tests/q15-*` matches
  neither `tests/class-*` nor `tests/equip-*`.
- **`scanWorld` (`tools/invariants.ts`) doesn't cover `w.timeLockZones`.**
  Every other position-bearing World field the fuzzer's own oracle checks
  (`w.warden.x/y`, enemy positions, etc.) gets a `finite(...)` call in
  `scanWorld`; `timeLockZones[].x/y` has none, so a future regression in this
  same family would not be caught generically even with q15's coverage
  widened. One `finite('timeLockZones[i].x', ...)`-shaped addition, in
  `tools/invariants.ts` — out of Scope for the same reason as above.

### Filed 2026-09-23 — fb202(f)/(g) cross-lane findings (not this lane's to fix)

- **(f) Madness King's basic-attack projectile (render lane).** The owner
  asked for a distinct crown/scepter projectile sprite; it currently reuses
  Engineer's `bolt` shape (only the impact VFX is distinct today,
  `CLASS_VFX`/`MADNESS_VFX`, `src/render/vfx-registry.ts`). Needs a new
  sprite/shape in `src/render/**`, out of this lane's Scope
  (`src/sim/**`/`data/classes.json`/`data/equipment.json` only).
- **(g) DPS panel shows the raw `madness` source key (UI lane).** The panel
  (`src/ui/**`, BACKLOG-UI.md's territory) prints `MADNESS_SOURCE` (`'madness'`,
  `src/sim/enemies.ts`) verbatim instead of a display label the way every
  other damage source already resolves one. Needs a label mapping in the UI
  lane, out of this lane's Scope.

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
  **CLOSED 2026-09-22 (owner-directed session, full repository scope):**
  `poisonBarrelSentence` now reads "…Poisons every enemy inside the circle
  each second: each application deals N poison damage over 3s (up to 3
  stacks)…" after fb061's charge clause (N = 4.8 at base on shipped data —
  the owner's 9.6 assumed an unscaled damage of 8) — N is the sim's own
  `dotDpsFor(poison, seed) x duration` with the seed live: Power, flat Atk
  and (code review) the Active1 potency card, now carried on
  `ClassLiveContext.active1PotencyMul`; window and cap off the loaded Poison
  row, cadence off `groundTickSeconds`. The other Active1 sentences still
  omit potency — filed as fb201 (BACKLOG-UI.md). The `it.skip` is un-skipped and asserts the owner's
  whole sentence plus a live-number case; the flat "damage/s" framing is
  asserted gone. fb062 is now complete in all three clauses.
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
