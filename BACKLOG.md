# BACKLOG.md — ordered work queue (SPEC-FINAL)

Format: `- [ ] (id) [type] title — acceptance: <objective check> — refs: <spec §>`
Loop mode executes the top actionable item. Completed items move to the Done section
with the commit hash.

**Rewritten at the SPEC-FINAL reconcile (§16).** The queue is ordered by SPEC-FINAL
§15's build order P0→P10; ids are `p<band><letter>`. Acceptance criteria name the
consolidated gates **G1–G20** (§14), which replace every prior A/B/C gate list. The
V3 queue (M17–M27) is closed out in the Done section; its unreached items were not
skipped — each is carried forward below under its P band, and MIGRATION.md §8 maps
old id → new id. See the audit in MIGRATION.md §8 for what the reconcile measured.

**Corrections outrank gaps.** The two items in the first section were places
where shipped code asserted the *opposite* of authoritative SPEC-FINAL text, not
places where work was merely undone. CLAUDE.md rule 3 applied to them: a failing
regression test landed before each fix. Both are now done (x001 `dc1681c`,
x002 `ef69a47`).

**Standing constraint for every item below (QUESTIONS Q40, restated):** no
balance tuning before P3 lands the run shape. A bound that fails meanwhile gets
a recorded reason, not a nudged constant. **P10 is the one balance pass.**

**Gate names are §14's G1–G20**; MIGRATION.md §8.5 maps them onto the A/B/C names
still in test headers.

## Audit summary (what SPEC-FINAL found already built)

| Band | State |
|---|---|
| P0 sim skeleton | **done** — fixed 60 Hz, named RNG streams, Commands, headless CLI, end-state hash (G2 green except tuner-edited content and fast-forward, see p9f) |
| P1 TD core | **done** — pathing, 3 owner towers, 20 enemies, economy live; p1a landed sealing (breach pathing, §10), p1b measured G7's win-rate band as a live test — G7 green in full; Q83's promised re-measurement of that band at p3e did **not** happen (still `cfg()`'s legacy `cycles: 1`) and is left open, unqueued, per Q109 |
| P2 VS core | **done in full (p2a-p2f)** — inheritance formula built and wired live, towers inert with their §5 specials live, weapon-panel lineage live, the superseded soul-weapon roster and Dusk picker deleted (G3 green in full) |
| P3 interleave | **done in full (p3a-p3e)** — `p3a` retargets the reused V2 cycle machine to 18 TD + 6 VS, 20s build, 75s VS (G6's pattern half); `p3b` stacks up to `maxStackedWaves` TD waves via the `call` command (G6's stacking half); `p3c` re-points leak coupling's existing ×2-into-next-VS-wave mechanism onto TD→VS vocabulary and the real 6-block shape; `p3d` deletes the V2 Day/Dusk/Night/Dawn machine, Rekindle and the Core-detonation pocket/lane mechanism outright; `p3e` re-baselines `light-build`/G13's solo-viability clause (`a4-single-type`)/the boss gate against the real shape — all three measure red past ~wave 10-14 (a p8a content gap, not a P3 defect) and are logged `.skip` with their numbers rather than forced green (Q109) |
| P4 core math | **done** — multiplicative stacking, armor cap +99 / floor −100, 6 damage types + 2 statuses (G4, G5 green) |
| P5 tower roster | **done in full (p5a-p5d, G20 green)** — all 10 towers, upgrade tracks, defense bands; `p5b` gave Ember Brazier/Mortar their own `costMul`; `p5c` authored the four remaining §5.2 milestone specials (Ballista, Fire Brazier, Ice Obelisk, Mortar) and the G20 loader rule; `p5d` fixed the QA-filed `damageDealt` telemetry bug on pierce/lob-kind towers |
| P6 classes | **done in full (`p6a`-`p6f`)** — §4's Passive + Q + E + tower passive is live for all 12 classes; **gate G9 is green in full**, and `p6d` measured **G10 and G11 green** (Archer's dps-optimal charge peaks at t=5.0 inside [2,6], full charge one-shots the toughest non-elite; Stormcaller's max chain multiplier is 3.5832 ≤ 3.6); `p6e` measured **G8 honestly red**; re-measured in full against p8a's real content this session (Q123, Q127) — **win rate is 0/11** (was 1/11; Cryomancer's own pre-p8a pass no longer clears the floor), diversity 2/11 not ≥8/11, both clauses `.skip`-ed per-class with real measured numbers, re-enable point **P10** (not `p8a` — already landed and re-measured); `p6f` retired the V2 legacy dual class schema (`affinity.json`, `manualAttack`, `frost_warden`) — `data/classes.json` now holds 12 classes, all in the uniform §4 shape |
| P7 equipment/rewards/VS upgrades | **`p7a`-`p7g` done** — §6.3's VS level-up pool replaces the flat 12-boon list (closing b011 as a side effect); §7's 12-item equipment table is live; §8's reward pipeline is complete and **gate G12 is green in full**; the superseded meta economy (relic affixes, Ember) is retired outright, skill points are the tree's only currency; §8.4's unlock quests are live and correct for all 9 non-free classes (p7e fixed 5 quests whose reward never actually unlocked their class, and repointed Paladin's quest at a new "win with a sealed Core" mechanism matching spec text); `p7f`/`p7g` closed the save-migration holes `migrateWithNotice` had — an unknown key, and a corrupt `allocated`/`unlockedClasses`/`completedQuests`/`equipmentStash`/`questProgress`, can no longer discard or corrupt the account. Remaining: `p7h` (Core unlock quests + Codex page) |
| P8 enemies/waves/bosses | **done in full (`p8a`-`p8c`)** — all 20 §9 enemies by name; `data/waves.json` authors real TD waves 1-18 on the §1.1 shape (Gatebreaker on 18 only, Warden-Eater on VS 6), the §9 VS-budget curve is live; `p8b` closed the elite/boss-summon spawn paths that bypassed `spendBudget`'s `aliveCap` check; `p8c` formally measured gate G14 on the real shape — **honestly red, 0/20**, `.skip`-ed with the number, re-enable point P10 (no gate in this codebase is force-passed by tuning outside P10) |
| P9 tooling | **done in full (`p9a`-`p9h`)** — content-hash replay check (`p9a`), the Codex wired into the Hub (`p9b`), the Tuner built and gate **G15 green** (`p9c`), G16's dist-presence-is-inert half explicitly asserted (`p9d`), **gate G18's dead-end clause closed in full** (`p9e`), **gate G2 closed in full** (`p9f`), `hashWorld`'s `w.goldSpent` coverage gap closed (`p9g`), and the enemy/Warden panel's armour row now shows the effective (floored/capped) value instead of the raw shredded number (`p9h`) |
| P10 balance | **p10a-p10l done; all queued P10 items closed** — Burning flipped to per-application stacking, DoT immunity is data-driven, G13/G1/G17 re-baselined against the real §1.1 shape (G17 fully green); **G19 measured live and green in full (p10f)**; G4's armour-shred path proven live through a real build (p10g); the TD↔VS transition sweep and asset pass shipped (p10h); HANDOFF.md regenerated end to end against SPEC-FINAL, with the wave-11-to-17 wall (behind G8/G14/most of G23) documented as the dominant open problem (p10i); **G13's 35% VS-damage-share cap closed in full at p10j (29.9%)**, then **p10l's `buildPhaseSeconds` 20->15 (closing G1) silently regressed it back to 37.4%** — found by qa-playtester during b070's verification pass and fixed as **b071** (`data/towers.json` `frost_obelisk.attack.damage` 19->18, now 25.9% with margin, G1 re-confirmed unaffected at 35.20 min / 88% wins) — **G13 is green in full again**; **p10k** gave the boss fight an independent pacing ramp (37.24->36.63 min, 92% win rate); **p10l** closed the rest via `buildPhaseSeconds` 20->15, a TD-side lever neither p10d nor p10k had isolated — **G1 is green in full** (35.20 min, 21/24 wins, re-confirmed unaffected by b071's fix). No P10-band item remains queued, but **G8, G14 and most of G23 still read red** per the wave-11-to-17 wall p10i named — the "1.0 complete" bar (CLAUDE.md, all twenty G1-G20 gates green) is not yet met; closing those gates needs new items, already filed (p10r) |

## Queue

> **Completed work has moved.** Done items and fully-closed historical
> sections now live in `docs/BACKLOG-DONE.md` (append-only, one section per
> backlog file, in original order). Read it when an item references old
> history; day-to-day work only needs the open items below plus the last 10
> completions. `tools/status.ts`'s feedback ledger reads the archive too, so
> nothing drops off STATUS.md's ledger.

### Feedback — owner-filed items (2026-09-07), processed from `feedback/`

- [x] (fb178) [feat] **DONE 2026-09-07, main-lane slice.** Token economy:
      trim context files, gate sweeps, light-tier defaults
      (`feedback/feature-token-economy.md`, filed top priority). Landed this
      session: `PROGRESS.md` cut from 14198 to 323 lines (header + last 10
      session entries live; everything older, including the pre-SPEC-FINAL
      v0.2/M0-M8 history, moved verbatim to `docs/PROGRESS-ARCHIVE.md`).
      `BACKLOG.md` itself cut from 13900 to 603 lines (every fully-done
      Queue subsection plus the whole `## Done` section moved to
      `docs/BACKLOG-DONE.md` under a `## BACKLOG.md` heading, in original
      order; the last-10-done list above kept live). `tools/status.ts`'s
      `backlogPaths()` now appends `docs/BACKLOG-DONE.md` when it exists, so
      `feedbackLedger()`'s citations for items now living in the archive
      (e.g. fb038, fb152) still resolve — `tests/fb038-status.test.ts` green
      unmodified. `CLAUDE.md` gained the requested rules (working rules 8-9:
      no `sweep`/`handoff-metrics`/gate-matrix runs outside `[balance]`
      items or an item whose acceptance criterion is a gate re-measurement;
      light tier by default for `[polish]`/`[ui]`/`[docs]`/data-only) plus a
      pointer to the three archive files under Sources of truth.
      **Not landed this session, filed as follow-ups** (the item's own scope
      turned out to span every lane, the same shape fb153b's bigger-map
      order took): the three lane files this main-lane session could safely
      touch got the same treatment queued as their own top item —
      **fb180** (BACKLOG-CONTENT.md), **fb181** (BACKLOG-UI.md), **fb182**
      (BACKLOG-QUALITY.md), each with fb178's exact acceptance shape.
      **BACKLOG-TERRAIN.md was deliberately left untouched**: four PRs on
      that lane (fb166's terrain-generation work) were mid-flight against
      it at the time of this session (all four updated within the preceding
      hour) — appending to a file under active concurrent edit risks
      needless merge friction for low-urgency housekeeping. File its own
      trim item at the next lane/terrain merge. **fb179**: QUESTIONS.md's
      918 lines and 175 `(owner verdict:` entries need a per-entry
      14-day-old-verdict age check before archiving (point 3 of the feedback
      item) — deferred rather than rushed, since a wrong archival there
      could silently drop a verdict a fresh session needs. Verification:
      `npx vitest run tests/fb038-status.test.ts tests/fb038-status-cli.test.ts`
      and `npm run test:fast` green — refs: feedback/feature-token-economy.md.
- [ ] (fb179) [polish] token economy (fb178) point 3, deferred: QUESTIONS.md
      is 918 lines with 175 `(owner verdict:` entries. Move every entry whose
      verdict is dated more than 14 days before the run date to
      `docs/QUESTIONS-ARCHIVE.md` (append-only, original order); a pending
      entry (no verdict yet) never moves regardless of age.
      `tools/status.ts`'s `pendingQuestions()` only ever reports entries with
      no verdict, so it needs no change — verify it still reports the same
      pending set before/after as a control. Acceptance: live QUESTIONS.md
      under ~400 lines; every pending entry and every verdict newer than 14
      days unchanged in place; `docs/QUESTIONS-ARCHIVE.md` contains every
      moved entry verbatim; `npm run test:fast` green — refs:
      feedback/feature-token-economy.md point 3, BACKLOG.md fb178.

### Recently completed

- (fb083) [feat] **DONE 2026-09-07** — a new tower-only Area stat key,
- (fb082) [bug] **DONE 2026-09-07** — `updateAreas`'s poison branch
- (fb081) [bug] **DONE 2026-09-07** (`692b8fc`) — `lineHit`'s broadphase
- (fb080) [polish] **DONE 2026-09-07** — `data/terrain.json` joins the
- (fb079) [docs] **DONE 2026-09-07** — appended §10.5 (SPEC-FINAL.md)
- (fb139) [feat] **DONE 2026-09-07** — F8 (dev and prod alike, not gated
- (p12h) [bug] **DONE 2026-09-07** — bisected to two additive causes, only
- (p12e) [bug] **DONE 2026-09-07** — the diagnosed fix landed as-named:
- (p12d) [balance] **DONE 2026-09-07.** SPEC-FINAL §14's G1/G8/G14/G23
- (fb163) [balance] **DONE 2026-09-06 — decided (a), no code/data change**

Full text for these and all earlier completions: `docs/BACKLOG-DONE.md`.

### Owner priority queue (2026-09-05 directive, cloud round 1) — execute top-down

**Standing note for the p12 balance arc:** `fb153a` divides every damage source
and every enemy/structure HP number by the same factor. It is proportional by
construction, but no balance measurement taken before it lands can be inherited
afterwards without a control run (CLAUDE.md measurement rules). p12d/p12f/p12h
therefore measure *after* `fb153`, not before.

- [ ] (fb153) [balance] **OWNER ORDER, top priority** — damage numbers are too
      high to read. Two coordinated changes, split into sub-items because each
      is independently verifiable:
  - [x] (fb153a) [balance] **DONE 2026-09-05** — shipped as one authored
        `numberScale` (`data/modifiers.json`, 0.1 ⚖) applied at load, with a
        census test over every numeric `/data` leaf and a three-seed control
        pair proving proportionality (identical outcomes, `damageTotal` /10).
        The order's "single-digit early hits" clause is measured **not met**
        and cannot be by any single factor — see QUESTIONS Q180, follow-ups
        **fb163** (two economies, owner verdict) and **fb164** (authored prose
        still quotes pre-rescale numbers). Original text follows.
        Global rescale so typical early hits are single
        digits and mid/late hits double digits: divide **all** damage sources
        AND **all** enemy/structure HP by the same factor (start at **/10** ⚖)
        so relative balance is preserved. Armor is a percent and is untouched;
        flat effects (e.g. "1 dmg/s Bleeding") are re-anchored to the new scale
        as `/data` values, not code. BALANCE.md's anchor table and TTK bands are
        re-expressed in the new scale. Acceptance: every `/data` damage and HP
        row is divided by the same recorded factor (a listed, reviewable diff —
        no hand-picked exceptions); Training Grounds shows single/double-digit
        numbers on typical hits; the §14 gates that were measurable before the
        change are re-measured and recorded as unchanged **within noise**, with
        the before/after pair both written down (a proportional rescale that
        moves a gate is a bug in the rescale); determinism holds — refs:
        SPEC-FINAL §2/§3, BALANCE.md, owner feedback
        `balance-damage-rescale-and-bigger-map` item 1.
  - [ ] (fb153b) [feat] bigger map to widen engagements: default grid **36x20 ->
        56x32** ⚖, terrain-generator constraint bands scaling with it, and the
        camera following the character with zoom limits. Core placement
        legality rules are unchanged (they are expressed in tiles, not in map
        fractions — verify, do not assume). Acceptance: a run generates, paths
        and renders at 56x32 with the terrain property tests green at the new
        size; the camera follows the character and clamps at both zoom limits
        and at the map edges; determinism holds and the end-state hash is
        re-recorded — refs: SPEC-FINAL §10, owner feedback
        `balance-damage-rescale-and-bigger-map` item 2.
        **Measured before starting (2026-09-05): this item spans three lanes and
        cannot land from one.** Flipping `GRID_W`/`GRID_H` alone and running
        `npm run test:fast` reddens **~85 assertions across 20 files**, and the
        great majority are outside the main lane's reach: `tests/terrain-*`
        (band ledger 10, generation 9, approach 7, seed domain 6, grid 5, high
        contest 4, flat 4, headroom 3, describe 2, cost 2, verify 1, core
        placement 1) plus `data/terrain.json`'s constraint bands are
        **BACKLOG-TERRAIN.md's Scope**, and `tests/ui-input` (7),
        `tests/class-board` (6), `tests/ui-fb082`/`fb106`/`fb102` (6) are
        **BACKLOG-UI.md's**. The main lane's own share is the grid constants,
        `GATES`/`CORE_X`/`CORE_Y` placement and the two sim suites
        (`p8d-boss-termination`, `b007-tile-bounds`, `fb077-terrain-wiring`).
        So: the terrain half is filed as **fb166** in BACKLOG-TERRAIN.md and
        the camera/render half as **fb167** in BACKLOG-UI.md; this item keeps
        the sim half and lands **after** both, since flipping the constant
        first would redden two other lanes' suites at their next merge.


### Owner priority queue (2026-09-04 directive) — BALANCE DIRECTION v2

- [ ] (p12f) [balance] Close BALANCE DIRECTION v2 §A's own-kit-share target,
      which p12a measured as unreachable by §A's own two levers (QUESTIONS
      Q175). p12a shipped `kitPower` (x3.16 by wave 18) and the x3 base
      re-anchor and moved the VS kit share from 0.00-1.67% to 0.00-5.16% —
      **0 of 12 classes at the >=35% target**, because VS-wielded weapon
      damage inherits the full tower-upgrade + Constellation scaling stack
      while the kit inherits none of it (swordsman seed 1: 134.3M of 134.5M
      VS damage is wielded), so the denominator grows with the build and the
      numerator does not. Pick one of Q175's three routes and measure it: (a)
      put the kit on the same scaling axis the wielded weapons ride; (b) cut
      VS-wielded scaling so the two sides start comparable; (c) restate the
      target against a denominator that excludes wielded weapons. Also covers
      the four classes p12a's field set could not move at all
      (`bloodlord`/`paladin` via `titheDamageMul`/`wrathDamageMul`,
      `engineer`/`animist` via `summonStatMul`) — a multiplier-shaped kit
      needs its own anchor, not the absolute-magnitude one. Note before
      re-anchoring anything: **12 of p12a's 29 values are `basicAttack.dps`,
      which cannot move a VS-window metric at all** — the class basic attack
      is TD-only (`src/sim/run.ts:541`), so in VS `bloodlord`/`paladin` have
      no authored kit damage number whatsoever (qa-playtester, p12a). **Sequenced after
      p12c** so it tunes against p12b/p12c's baseline, not the pre-directive
      one. Acceptance: >=9 of 12 classes at >=35% VS own-kit share measured
      with the p12a control-pair method (`KIT_SHARE_MEASURE=1`, >=2 seeds,
      before/after both recorded); G1's run length and the p12b/p12c win-rate
      bands re-confirmed unaffected — refs: BALANCE DIRECTION v2 §A,
      QUESTIONS Q175, BALANCE.md "Kit relevance target".


### Feedback — owner-filed items (2026-09-03), processed from `feedback/`

- [ ] (fb084) [feat] no summon-cap stat key exists, so BACKLOG-CONTENT c004
      (Animist's §4.2 `summon cap +1`, "expressed on the passive in `/data`
      rather than a class-key check") cannot be built from the content lane.
      Acceptance: `summonCap` added to `STAT_KEYS` with its `STAT_KIND`/
      `Derived` rows (`statkeys.ts`, `stats.ts`) and read at the three
      `summonCap` sites in `classes.ts`; c004 then closes in its own lane
      with the number in `data/classes.json` — refs: SPEC-FINAL §2, §4.2,
      BACKLOG-CONTENT.md c004.
- [ ] (fb085) [feat] unblock the five owner items the content lane could
      not reach (BACKLOG-CONTENT.md session-1 Log: fb056/fb057/fb059/fb061/
      fb062 all need `src/sim/content.ts` or other shared files). Acceptance,
      each as a `content.ts`/shared-file enabler with its own test, so the
      lane can then execute the items inside its Scope: (a) `EquipmentItem.
      effectKey` opened from the closed 4-member enum to a validated string
      registry plus an `effectNums: Record<string, number>` field, so fb056's
      fifteen sets of numbers live in `/data` (rule 4 — today `swordsman_shoes`'
      x2 is a literal in `fireDashSlash`); `tests/fb015-equipment.test.ts`'s
      hard census pin (`toHaveLength(12)`, per-slot 2, two `toEqual` tables)
      rewritten as invariants over the authored rows; (b) `passive.kind`/
      `active.kind` enums and `REQUIRED_*_FIELDS` rows for Madness King and
      Voltbolt, plus a `madness` status on `Enemy` (`types.ts`) with its
      targeting/movement in `enemies.ts`, and `tools/content-census.ts`'s
      class readers checked for roster pins; (c) a zero-charge duration
      floor beside `groundDurationSeconds` on `ClassEffectSchema` for fb061's
      8 s -> 14 s; (d) hooks for the three fb056 effects with no `classes.ts`
      seam: Ring of Contagion (`drainPlagueTransfers` fan-out count,
      `enemies.ts`), Chronomail (Time Flow's window, `run.ts`), Bracer of
      Overlap (`w.timeLockZone` becomes a small array, `world.ts`) — refs:
      SPEC-FINAL §4.2, §7 equipment, §13 totals, §12 rule 4.
- [ ] (fb086) [bug] SPEC-FINAL §4.2 Bloodlord *Blood Tithe* is missing a
      clause: "tower pays 30% current HP once -> permanently +25% dmg; **its
      share of VS attacks lifesteals +1%**". Only the first half exists —
      `s.tithed` feeds `classTowerDamageMul` (`towers.ts`) and nothing else
      reads it; `leech` is one run-wide Warden stat and there is no
      per-structure VS-share lifesteal anywhere (BACKLOG-CONTENT.md session-2
      Log). Acceptance: failing test first (a tithed tower's VS-share hits
      heal the Warden 1%; an untithed one does not); numbers in
      `data/classes.json`; `tests/class-kit-liveness.test.ts`'s Bloodlord row
      gains the second product — refs: SPEC-FINAL §4.2.
- [ ] (fb087) [polish] the standing Windows flake family every lane
      re-reported this week: `q45`/`q49`/`q52` fail on `EPERM` removing
      `bench/.tmp` scratch dirs under load, `q15-command-domain-fuzz` reports
      commands as hanging against its 4000 ms settle deadline under load,
      `q13-perf-ratio` is load-sensitive, `b032`/`b034`/`b035` Playwright
      under load — all green in isolation, and the failing set varied 13 ->
      10 -> 6 across three runs of one tree (BACKLOG-TERRAIN.md fb064a Log).
      Acceptance: scratch cleanup is retry-tolerant (bounded retries with
      backoff on `EPERM`/`EBUSY`) and the settle deadline scales with a
      measured load factor, or the files move to the excluded tier with a
      comment naming why; five consecutive `npm run test:fast` runs on the
      reference host report zero failures from this set — refs: CLAUDE.md
      "Stack & commands" (fast tier contract), QUALITY.md.
- [ ] (fb088) [polish] `tests/terrain-generation.test.ts`'s "stays bounded"
      case is the only thing standing between `/data` and an unclamped
      `paint()` loop in `/src/sim`, and on this host it can only be a coarse
      5000 ms wall-clock guard (three sharper designs measured worse — the
      Log's fb064g entry records each). Acceptance: a deterministic
      iteration counter behind a test-only hook (shape decided here, since
      the counter lives inside `/src/sim`) makes the bound exact and
      load-independent; mutation re-run confirms the reverted clamp still
      fails. Same change may revisit the loose `a/(a+1)` Core-band ceiling
      against the tighter `|A| / |cover(A)|` bound — **only** with the
      generated-map sweep that caught the last false rejection — refs:
      SPEC-FINAL §12 rule 4 (loader refuses unpayable data), BACKLOG-TERRAIN
      fb064g Log. **Also (fb064j Log):** the same file's skipped-seed loop (`:678-687`) re-reads the generator's own report instead of measuring degeneracy — `tests/terrain-seed-domain.test.ts` has the stronger shape to copy.
- [ ] (fb092) [bug] `fb054`'s density pass (owner feedback
      `balance-siege-density`) broke G13's share-cap measurement, not just
      its solo-viability clause (`fb076`) — found at **p11b**'s HANDOFF/
      STATUS regeneration, undocumented until now. `tests/p10c-weapon-
      share.test.ts`'s live, non-`.skip` "has enough builds banking all 18
      TD waves to measure" assertion currently fails: only **3 of 10**
      `BUILDS` reach the pool against a `>=4` floor (measured this session,
      `npx vitest run tests/p10c-weapon-share.test.ts`), so the already-
      `.skip`-ed cap clause (pinned 36.5% at `b080`, 1.5 points over the 35%
      cap) hasn't been re-measurable since. Note for whoever picks this up:
      `tools/a5probe.ts` run with no arguments uses its own small default
      seed/build set, not the test's `SEEDS=[1,2,3,4,5]`/`BUILDS`, and reads
      a misleadingly-healthy 28.8%/frost_obelisk when run standalone — do
      not use the bare CLI to judge this gate, only the test file's own
      `collect`/`topTen`/`aggregateShares` call. Acceptance: a `data/
      waves.json`- or `data/towers.json`-only change (ideally the same pass
      as `fb076`, since both trace to `fb054`'s density change) restores
      `top.length>=4`, then re-measures and re-pins (or un-skips, if it
      closes) the 35% cap clause with the real number — refs: SPEC-FINAL
      §14 G13, BACKLOG fb054/fb076/b080.
**Lane merge (2026-09-03):** `lane/content` (c001/c003/c005), `lane/terrain`
(fb064a/fb064g/fb064b) and `lane/ui` (fb055/fb058/fb060/fb067-fb070) merged
into master. Main wins on shared sim core (one conflict: `fireCrimsonRush`
keeps fb053's speed-scaled travel and c001's Area-scaled half-width); every
lane addition kept. Integration wired at the merge: `data/terrain.json`
folded into `contentHash()` (`tests/terrain-content-hash.test.ts`),
`'terrain'` named as a one-shot RNG stream (`ONE_SHOT_STREAM_NAMES`, which
also now names `tiers.ts`'s `draft`/`draftpick` prefixes), the `/src/sim`
renderer-import guard widened to nested directories, the Time Lord band
sweep moved to the fast tier's exclude list with its env gate dropped. Every
out-of-scope need in the three lane Logs is filed above as fb077-fb088
(main lane) or in BACKLOG-UI.md as fb089-fb091 (renumbered fb114-fb116 at the 2026-09-04 merge after the UI lane reused the ids); the main-lane fb066 written
during fb054's close-out was renumbered to fb076 because BACKLOG-UI.md had
already used fb066 — **ids are global across all four backlog files; take
the next free number, never a lane-local one.**
**Lane split (2026-09-03):** the remaining eleven items of this batch,
fb055–fb065, moved out of this file into the parallel lane files, ids and
text unchanged (see CLAUDE.md "Lanes"): fb056/fb057/fb059/fb061/fb062 →
BACKLOG-CONTENT.md (`lane/content`); fb064 → BACKLOG-TERRAIN.md
(`lane/terrain`); fb055/fb058/fb060/fb063/fb065 → BACKLOG-UI.md
(`lane/ui`). fb053/fb054 stay here: dash and density are shared-sim-core
balance work, which this file keeps.


### Filed at the lane merges (2026-09-04) — out-of-scope needs from the three lane Logs

**Lane merge (2026-09-04):** `lane/content` (c006-c019), `lane/terrain`
(fb064h-fb064v) and `lane/ui` (fb071-fb113) merged into master. Conflicts:
the three lane Logs (both sides kept) and `src/sim/terrain/{analyze,
generate}.ts`, where main's fb077 run-gate-list threading met the lane's
fb064h-v rewrites — lane versions taken, the `gates` list re-threaded as a
*trailing* parameter through every gate-reading terrain function
(analyze/path/core-placement/generate) so the lane's positional call shapes
survive, `TERRAIN_STREAM` kept as the generator's RNG key. The merged
generator re-drew every map, so fb077's stranded-Core seeds were re-found
(4426/4515/5516 in 1..6000) and fb064q's `charBlock` mask was added to
main's fallback overlays. Every out-of-scope need in the three Logs is
filed below as fb118-fb135; the lanes' owed QUESTIONS.md entries are
Q168-Q174. **Id collision:** the UI lane's 2026-09-04 batch reused
fb076-fb099 (see fb118); new ids start at fb118 and the four in-file
duplicates in BACKLOG-UI.md were renumbered fb114-fb117.

- [ ] (fb118) [polish] backlog ids are no longer global: BACKLOG-UI.md's
      2026-09-04 batch assigned fb076-fb113 while BACKLOG.md assigned
      fb076-fb099, so 18 ids now name two different items (e.g. fb085 is
      "unblock the content lane's owner items" here and "localization
      strings" there; fb093 is a closed G22 regression here and an open
      ui-audit item there), and 30+ committed `tests/ui-fbNNN-*.test.ts`
      filenames carry the UI-lane numbers. Acceptance: one of (a) renumber
      the UI batch to fb1xx (files, Log references, test filenames) or (b)
      adopt a lane prefix (`ui-fbNNN`) and record the rule in CLAUDE.md's
      Lanes section; either way a `tools/` check (or a test) fails when an
      id appears in two backlog files with different titles — refs:
      CLAUDE.md Lanes, BACKLOG-UI.md 2026-09-04 merge Log.
- [ ] (fb119) [bug] `tests/q15-command-domain-fuzz.test.ts` is red
      **standalone**, not just under load: its `beforeAll` (`runCensus()`)
      hits the 120 s `hookTimeout` and all 66 recorded entries read
      `"hangs"` — the worker-subprocess probe timing out wholesale (terrain
      fb064u/fb064v QA, content c009/c011/c015 Logs, each reproduced on a
      clean tree). `vitest.fast.config.ts`'s comment still says q15 "stays IN
      the fast tier, measured under 60 s", so the fast tier cannot be green
      on any branch. Acceptance: find why the probe hangs (nested `tsx`
      spawn under `bench/.tmp`'s ~33 tree copies is the leading suspect —
      fb087), then either restore a <60 s standalone run or move q15 to the
      exclude list with the measured time; the config comment matches the
      measurement — refs: CLAUDE.md test tiers, fb087.
      **2026-09-07 re-measurement: the symptom has changed and the old
      "hangs" diagnosis is stale.** On this host q15 no longer times out —
      it fails in ~1.3s, standalone and under `npm run test:fast` alike,
      with `Error: Cannot find module '.../tools/fuzz-command-domain'
      imported from .../tools/fuzz-command-domain-worker.ts`. `q45` (which
      exercises the same `probeInWorker` machinery via a scratch-copied
      tree) fails the same way. Root-caused with a Vitest-free repro (a
      bare `node` script spawning the same `new Worker(WORKER_PATH,
      {execArgv: ['--import', 'tsx/esm']})` call `fuzz-command-domain.ts`
      itself uses): the extensionless relative import
      (`fuzz-command-domain-worker.ts`'s `from './fuzz-command-domain'`)
      resolves fine when the exact same `--import tsx/esm` flag runs on the
      **main thread**, but fails to resolve inside a spawned
      **`Worker`** thread on this host's `tsx@4.23.12` (`package.json` only
      pins `^4.19.2`) under Node `22.22.2` — tsx's ESM resolve hook does not
      appear to intercept bare specifiers inside a worker's own execArgv
      registration here, and the failure is not specific to one import: a
      manual `.ts`/`.js`-suffixed rewrite of the worker's own import moves
      the identical error one level deeper, to the next extensionless
      import inside `fuzz-command-domain.ts` itself
      (`.../src/sim/run`) — a real fix would mean adding explicit
      extensions to every transitively-imported specifier reachable from
      the worker entry point, or pinning/patching the `tsx` dependency
      itself, either of which is a materially different, larger, and
      environment-sensitive change than this item's own acceptance text
      anticipated ("find why the probe hangs"). Left open rather than
      attempted blind, since a "fix" that only silences this exact
      `tsx@4.23.12` patch could read as broken or unnecessary on a
      differently-resolved `^4.19.2` install (CI, another contributor's
      machine) and cannot be verified here either way — a floating-version
      dependency bug is a judgment call for the owner (pin `tsx` to a known
      version and verify across environments, or find whichever tsx patch
      regressed worker resolution and report upstream) rather than a
      same-session code fix. `q45`'s failure is the identical root cause,
      not a second bug — refs: CLAUDE.md test tiers, fb087.
- [ ] (fb120) [bug] two full-suite reds reported by the lanes that the fast
      tier cannot see, both expired measurements: `tests/a3-movement-
      mandatory.test.ts` seed 1 expects `defeat_core`, gets `defeat_warden`
      (all 12 seeds `defeat_warden`, three reproductions at two commits;
      its header still cites Q124's reconfirmation), and content c018's QA
      saw `tests/p-core-f-gates.test.ts` G22 `carnivorous_plant`/`corpse`
      seed-2 fingerprints at 0.070/0.040 against 0.10 on the lane branch
      (which predates fb093/fb099 — unverified on master). Acceptance:
      re-measure both on merged master at the next full `npm test`; a3
      either gets its premise re-established (a QUESTIONS.md entry either
      way, per Q124) or its assertion re-pinned with the mechanism named;
      G22 re-measured with fb093's method — refs: SPEC-FINAL §14 G22, Q124,
      BACKLOG-TERRAIN.md fb064u Log, BACKLOG-CONTENT.md c018 Log.
- [ ] (fb121) [bug] `SkillCardSchema` (`src/sim/content.ts`) accepts
      `perRank: 0` and negatives: a skill card worth nothing per rank is
      unpayable data (architecture rule 4), and every consumer that divides
      by it inherits the trap — content c019's test hung a vitest worker for
      25 minutes on `perRank: 0` before it was clamped. Acceptance: loader
      refuses `perRank <= 0` with the card id in the message; a
      `tests/q7`-style corpus case pins it — refs: SPEC-FINAL §6.3, §12
      rule 4, BACKLOG-CONTENT.md c019 Log.
- [ ] (fb122) [polish] `src/sim/content.ts:705`'s `pierceCap` schema
      comment ("most enemies one released shot may pass through") is false
      since c017: the field rails only the charge-derived count and the true
      ceiling is `pierceCap + perRank * maxRank` (10, not 6). It is
      loader-facing and the Tuner walks the zod schema generically, so a
      designer is shown a number 40% low. Acceptance: comment corrected;
      `tests/class-deeper-draw.test.ts`'s ladder cited — refs: SPEC-FINAL
      §4.2 Archer, §6.3, BACKLOG-CONTENT.md c017 Log.
- [ ] (fb123) [test] no automated harness ever executes a charge-kind
      Active1: `src/bots/policy.ts` never sets `TickInput.active1Held`, so
      `fireDeadeyeDraw`/`fireCircleSlash` have zero bot/sweep coverage and
      every sweep-derived balance claim about Archer or Swordsman is a null
      instrument (c017's QA replaced the changed line with a `throw` and the
      12-seed sweep printed the same table); `tools/fuzz-input.ts` fuzzes
      the flag but hardcodes `classKey: 'engineer'`, whose Active1 is not a
      charge kind. Acceptance: a bot run per policy for an archer asserts
      `report.damageByWeapon['class_active'] > 0`; `fuzzRun` gets an
      archer/swordsman config — refs: SPEC-FINAL §14 G10, BACKLOG-CONTENT.md
      c017 Log.
- [ ] (fb124) [balance] Deadeye Draw's reason to charge collapses at max
      investment: damage per committed second against a 10-wide line, best
      hold vs a one-tick tap, falls from 4.36x (rank 0, no CDR) to 1.10x at
      `archer_class_line` rank 2 plus the 0.40 `cdrCap` — no gate moves (G10
      is closed-form over `chargeCapSeconds`/`compoundPerSecond`/
      `cooldownSeconds` and never reads `pierceCap`). A full-charge-only
      variant of c017's bonus keeps the 6 -> 8 -> 10 ladder and leaves
      partial charges alone; that is a design call (Q168). Acceptance:
      decide via QUESTIONS.md; if taken, `/data` or one `classes.ts` clause
      with `class-deeper-draw` re-pinned and the ratio measured either side
      — refs: SPEC-FINAL §4.2 Archer, §14 G10, Q168.
- [ ] (fb125) [test] four blind spots the content lane measured but could
      not fix outside its Scope: `tests/fb013-timelord.test.ts:498` lands
      every hit back-to-back, so `damageWarden`'s merge can be written as
      the push formula and stays green (age the stack array first);
      `classes.ts:1517` reading the Kinship aura at the *Warden's* position
      instead of the summon's survives every suite; `enemies.ts:474`
      transferring Spreading Plague to the enemy nearest the *Warden* rather
      than the corpse survives every suite (all harness geometries are
      collinear); and the rule-4 mutations `run.ts:625` `maxStacksPerEnemy`
      -> 50 and `classes.ts:1005` `auraAtkSpdMul ?? 0` -> 0.15 survive both
      passive files. Acceptance: a red-first case for each (four mutations,
      four reds) — refs: SPEC-FINAL §4.1/§4.2, BACKLOG-CONTENT.md c011 Log.
- [ ] (fb126) [feat] three rule-4 literals the player is shown as numbers:
      Time Flow's "4 s" is `TIME_FLOW_BASE_SECONDS` in `src/sim/run.ts:578`,
      and Thousand Cuts' bleed stack and Long Draw's per-second pierce are
      literals in `src/sim/classes.ts`; `tests/class-descriptions.test.ts`
      pins them by capture group so they cannot drift silently, but the
      numbers belong in `data/classes.json`. Acceptance: each becomes a
      schema field (e.g. `charDotSeconds`) read by its site, the ledger's
      `in_code` rows flip to `field`, and the sentences are unchanged —
      refs: SPEC-FINAL §12 rule 4, BACKLOG-CONTENT.md c015 Log.
- [ ] (fb127) [feat] unblock BACKLOG-CONTENT.md c010 (Stormcaller's
      `chainGrowth`/`chainCap` authored on `active1`, read by the passive):
      the move needs `src/sim/content.ts:1288`'s `REQUIRED_EFFECT_FIELDS.
      chain_lightning` to stop demanding them on `active1`, five sites in
      `tests/p6d-nine-classes.test.ts` (`:116`, `:226-249`) re-pointed, and
      `tests/q7-loader-holes.ts:248,250`'s corpus paths updated — all
      main-lane. Acceptance: loader accepts the passive-authored shape and
      refuses the duplicated one; p6d's G11 ceiling/growth assertions
      re-measured as a control pair — refs: SPEC-FINAL §4.2 Stormcaller,
      §12 rule 4, BACKLOG-CONTENT.md c010.
- [ ] (fb128) [balance] tower attack speed is quantised to whole 60 Hz
      ticks and small bonuses are inert: `tickCooldown` (`types.ts:17`)
      clamps to 0 instead of carrying the sub-tick remainder, so a tower
      fires every `ceil(interval / (dt * speed))` ticks — the Arrow Spire
      fires every 43 ticks at +0% and +2% alike, and +3% is the first step
      that moves it. Possibly intended; recorded (Q172) because a
      `towerAttackSpeed` tuning pass in small steps will find some steps do
      nothing. Acceptance: decide in QUESTIONS.md; if remainder-carrying is
      taken, a control-run sweep either side and
      `tests/class-tower-passive-liveness.test.ts`'s declared tick-floor
      exception updated — refs: SPEC-FINAL §2, §14 G1/G13, Q172.
- [ ] (fb129) [feat] fb064d's main-lane half — the high-ground rules have no
      call site: `canAttackStructureAt`/`canSurfaceAt`/`canAttackHighGround`
      (`src/sim/terrain/high-ground.ts`) are built and tested but nothing in
      `src/sim/enemies.ts`/`boss.ts` asks them, so ground melee still chews
      a tower across a cliff edge and fb064m's "no uncontestable plot"
      constraint guards a rule no run enforces. The six call sites are
      listed in BACKLOG-TERRAIN.md's fb064i Log; `nearestStructureWithin`
      (`enemies.ts:1258`) selects before the rule applies. The Act II
      residual — Spitters skip structures under `!act2`, so every
      high-ground tower is uncontestable during the VS phase — and the
      Burrower's widened untargetable window are design calls (Q171).
      Acceptance: rules wired at every listed site with a red-first test
      per site; the Act II question decided in QUESTIONS.md — refs:
      SPEC-FINAL §10.5 (fb079), BACKLOG-TERRAIN.md fb064d/fb064i/fb064m.
- [ ] (fb130) [feat] fb064c's main-lane half — Core placement wiring: (1)
      migrate every `CORE_X/CORE_Y`/`coreCenter()` reader to
      `grid.coreOrigin()`/`coreCenterOf()` (`world.ts`, `run.ts:665`,
      `sundering.ts`, `cores.ts`, `enemies.ts:606`, `src/bots/policies.ts`,
      `src/ui/selection.ts`, `src/render/canvas.ts` — the fb064h Log lists
      the lines) so `Grid.placeCore` is safe to call; (2) the placement
      Command (sim Command per rule 3, bots/replays included) validated by
      `validateCorePlacement` with the run's gate list; (3) domain-check
      `RunConfig.seed` at ingestion (`tools/sim.ts:78` `Number(v)`) so
      `--seed 1e18` is a CLI rejection, not a mid-run throw from
      `generateTerrain`; (4) a run-lifecycle flag shared by `placeCore` and
      `applyTerrain` so neither re-opens after a build-then-sell; (5)
      `verifyTerrainMap` asserted at the run boundary; (6) the approach
      band re-checked (or the 4.969 worst case accepted knowingly) for a
      player-placed Core. Acceptance: G2 replay hash covers the placement;
      seed sweep with placed Cores keeps every gate reachable — refs:
      SPEC-FINAL §10.5 (fb079), §12 rules 2-3, BACKLOG-TERRAIN.md
      fb064c/fb064h/fb064j/fb064o/fb064p.
- [ ] (fb131) [bug] three Warden placements bypass `wardenPassable` now
      that terrain is live (fb077): the Act I reform (`run.ts:666`, `wd.x =
      c.x - 2`) can land the Warden inside rock two tiles west of the Core;
      `sundering.ts:21` teleports to the Core centre unchecked (safe today,
      but fb130 moves the Core); and `tickDashTravel` (`wardenmove.ts:56-61`)
      lerps along the dash line checking only the endpoint, so a dash passes
      through a mountain it cannot end in. Acceptance: reform/sundering
      snap to the nearest `wardenPassable` tile (red-first on a seed whose
      map has rock there); the dash rule decided in QUESTIONS.md (sample the
      line, or accept it as the dash's character) and pinned either way —
      refs: SPEC-FINAL §10.5, BACKLOG-TERRAIN.md fb064q Log.
- [ ] (fb132) [polish] no `.gitattributes` and `core.autocrlf=true`: every
      checkout is CRLF, `git diff` is noisy between LF-writing agents and
      CRLF checkouts, and fb064k's byte-exact golden had to be made immune
      in-lane. Acceptance: `* text=auto eol=lf` committed with a
      renormalising commit; the golden test's CR assertion stays — refs:
      BACKLOG-TERRAIN.md fb064k Log.
- [ ] (fb133) [polish] `tsconfig.json` is `strict` without
      `noUncheckedIndexedAccess`, which is why `cfg.tiles[i].key` typechecked
      as safe and fb064t's `TypeError` shipped. Acceptance: flag enabled;
      the resulting errors fixed with real guards (not `!`), count recorded
      — refs: BACKLOG-TERRAIN.md fb064t Log.
- [ ] (fb134) [polish] two terrain follow-ups now that the run's gate list
      is threaded: `describeTerrain`/`parseTerrainDump` still dump and check
      the base `GATES`, so a repro taken from a Fourth Gate run reports three
      gates and omits the one the bug is about — extend fb064k's "carries the
      gates" test to a 4-gate map and take `gates` like the rest; and
      `ROOM_RADIUS` (`analyze.ts`) decides map legality since fb064o while
      living in code — `data/terrain.json` is inside `contentHash()` now, so
      the rule-4 exemption is re-decided: move it or write down why not.
      Acceptance: 4-gate dump round-trips; the constant's home decided in
      QUESTIONS.md — refs: SPEC-FINAL §12 rule 4, BACKLOG-TERRAIN.md
      fb064k/fb064o Logs. Also (code-reviewer at the merge): `config.ts:25`'s
      `MAX_WALKABLE_FRAC` schema ceiling counts `GATES.length` (3), one tile
      short for a Fourth Gate map — harmless today, same fix.
- [ ] (fb135) [feat] unblock the UI lane's three permanently out-of-Scope
      items and one small follow-up: BACKLOG-UI.md fb085 (localization —
      needs `data/strings.json` plus `src/ui/strings.ts`/`strings-lint.ts`;
      note from the reverted attempt: the lint must scan string literals
      *inside* `${...}` interpolations, not just bare text nodes and
      `title=` attributes), fb093 (ultrawide/portrait scenes in
      `tools/ui-audit.ts`), fb097 (GIF capture needs a `package.json`
      dependency decision — GIF encoder or zip — and a QUESTIONS.md note if
      the frame-archive fallback is taken), and fb107's gap: the Codex class
      detail (`codex-collections.ts` -> `classAbilitiesMarkup`) is called
      without `keyBindings`, so it shows Q/E after a rebind while Class
      Select one tab over shows the remapped keys (thread `keyBindings`
      through `CodexCollection.renderDetail`). Acceptance: each UI item's
      own acceptance text, executed from main or with the Scope widened —
      refs: BACKLOG-UI.md fb085/fb093/fb097/fb107 Logs.


## Retired from the queue by SPEC-FINAL

These carried acceptance criteria that SPEC-FINAL no longer defines. Reasons are
logged in MIGRATION.md §8 rather than carried as dead items.

- **(m24d)** Re-price the "Tinkerer" notable's `relicFind` effect — the relic find
  stat dies with the affix system at p7d, so the notable is re-authored there rather
  than re-priced here.
- **(s006)** The `of Thrift` relic affix raises tower prices — same reason: the affix
  table itself is retired at p7d.
- **(s007)** Beacon attack-speed terrain residual exceeds its authored cap — the
  `terrain` residual mechanism is replaced wholesale by §5's VS special column at
  p2c, which re-authors the beacon's effect from scratch.
- **(m27b)** Restate A8's surviving claim — G13 and G19 together are the claim
  SPEC-FINAL makes about TD investment converting into VS outcome; A8 has no
  successor of its own.

## Open QUESTIONS closed by SPEC-FINAL, without work

- **Q38** (§6 assumes an eleven-class roster that does not exist) — §4.2 fills
  the roster in. The work is `p6d`.
- **Q39** (§5's per-type VS special is specced for 3 of 10 towers) — §5.2
  populates the column for all ten. The work is `p2c`.
- **Q80** (the seven open tower tracks, proposed for sign-off) — §5.2 decides
  every count and milestone. The work is `p5b`.
- **Q47** (V3 retires B11 and adds no replacement liveness gate) — §14 adds
  **G19**. The work is `p10d`.


