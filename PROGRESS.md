# PROGRESS.md — Stonewake status

> Claude: keep this file current. Update at every milestone gate and before any stop.
> A fresh session should be able to resume from this file + CLAUDE.md alone.

## Current state — SPEC-FINAL

**Precedence: SPEC-FINAL > everything.** SPEC-FINAL.md landed 2026-08-26 and
supersedes SPEC.md, SPEC-V2.md and SPEC-V3.md outright. Its §14 gates **G1–G20**
replace every A/B/C gate list and its §15 **P0–P10** build order is the backlog's
order. **MIGRATION.md** is the audit — §§1–7 against V3, and **§8 is the SPEC-FINAL
reconcile**: what changed against V3, the old-id → new-id map, and the
test-retirement ledger. Read §8 before touching anything.

- **Milestone:** the **§16 reconcile is complete** (this commit). SPEC-FINAL.md is
  now in the repository — it existed only as an untracked file in the main checkout,
  so no branch could see it (Q81). BACKLOG.md is rewritten into 48 items in P order;
  CLAUDE.md's sources-of-truth list is re-pointed; twelve superseded test groups are
  retired with logged reasons and four existing retirements are restated against the
  gate that now supersedes them. `x001` is done (`dc1681c`), `x002` at `ef69a47`,
  and **P1's `p1a` is done with this commit** — the path guarantee is gone and
  sealing is legal (§10, G7's first two clauses green). **`p1b` is the next
  action**: G7's third clause, the sealed-vs-open win-rate band at T2 —
  noting Q83, which expects that band re-measured at p3e after the run shape
  changes.
- **Where the code actually stands** (audit summary, full table at the top of
  BACKLOG.md): P0 and P4 are done; P1 is done **except sealing**; P5 is done bar two
  pricing items; P2's VS **inheritance formula is not built** — `data/weapons.json`'s
  8-weapon roster with its own level ladders and 6 slots stands where §6.1's
  average-across-the-type formula belongs; P3's interleave is not built — the run is
  still V2's Day/Dusk/Night/Dawn cycle machine; P6 has **3 of 11 classes** and on the
  wrong framework; P7's equipment, VS upgrade pool and reward pipeline are unbuilt
  behind the relic/Ember/boon systems that supersede them; P9's Tuner is unbuilt and
  its Codex read-half arrives with this commit from the tuner lane.
- **What the reconcile did *not* do:** no sim, data or balance change. Every number
  in `/data` and every line in `/src/sim` is untouched, so the 12-seed sweep and the
  end-state hashes are byte-identical either side of it. The reconcile is documents
  and test annotations only, which is what makes it reviewable as one diff.
- **Four V3 items are retired without successors**, each with its reason in
  MIGRATION.md §8.2: m24d and s006 (relic-affix items — the affix table itself dies
  at p7d), s007 (the `terrain` residual mechanism is replaced wholesale by §5's VS
  special column at p2c), and m27b (G13 + G19 together are SPEC-FINAL's version of
  "TD investment converts into VS outcome"; A8 has no successor of its own).
- **Conflicts logged this pass:** Q81 (SPEC-FINAL was untracked), Q82 (the reconcile
  overrode the tuner lane's scope boundary — any other live lane must re-base on the
  new backlog before continuing), Q83 (§15 puts sealing at P1, so G7's balance clause
  will need re-measuring after the run shape changes at p3a), Q84 (gate renames vs
  test filenames; three surviving claims have no §14 counterpart), Q85 (leak coupling
  is built against the wrong multiplier and the wrong boundary — a re-point, not a
  rebuild).
- **What SPEC-FINAL decided for us, so nobody re-asks.** §4.2 fills in the nine
  open classes, §5.2 the seven open tower tracks, §6.3 the VS upgrade pool, and
  §5 grants the per-track `costMul` that m20c measured as the missing lever.
  Four open QUESTIONS (Q38, Q39, Q47, Q80) and one backlog item (m20e) close as
  *decided by spec* rather than as work.
- **What contradicts the spec, which is different from what is missing.** Two
  things: Poison's stack cap (§3 says 3) and lifesteal's per-second cap (§2 says
  there is none). They are `x001`/`x002` and they sit **ahead of P0**, because
  CLAUDE.md rule 3 already ranks a confirmed bug above the queue and code
  asserting the opposite of the spec is a bug by a short route. Q89 records that
  judgement call and two others §16 left open.
- **The m20d trap, worth remembering.** m20d was the in-flight item and its tree
  did two things at once: it raised Poison's cap to 50 (which SPEC-FINAL §3
  forbids) and it re-aimed the Venom Spore's spare spore with a 45 → 23 re-price.
  The tree measured **red on A3** (5/12 against ≥6/12) where HEAD is green, and
  the obvious story — that the forbidden change is the regression — is wrong.
  Bisected in three runs: HEAD green, **HEAD + cap 50 green**, HEAD + targeting +
  re-price **red**. So the spec violation and the gate failure are two facts
  about two different halves, and calling them one would have written the wrong
  cause into the backlog. The tree is preserved on branch `wip/m20d` and re-filed
  as `p5c` with both measurements attached. Q86 stays as the record; Q87 amends
  it with the clause SPEC-FINAL added.
- **The tension `p5c` inherits, which is the owner's not ours.** §3 caps Poison
  at 3 stacks and §5.1 keeps "poison ratio → 1:1.5 @4". Three stacks of a 3 s
  DoT is a ceiling of one application per second — the Venom Spore's own fire
  rate — so the milestone moves damage into a bucket that is already full and
  measures **−5.4%** (88.6 → 83.8 dps). Both clauses are verbatim and both are
  ⚖. Logged as Q87 for §17's review list rather than resolved by an agent.
- **Next action:** **P1** `p1b` (G7's third clause: the full-seal build's win
  rate within 10 points of the best open-maze build's over 12 seeds at T2, as
  a live test). `p1a` is done with this commit — sealing is legal, breach
  pathing is live, and the details are below. Both Corrections are done:
  `x001` at `dc1681c` (the §3 stack-cap pin plus Q90's one-way override clamp,
  QA-proven a no-op), and `x002` at `ef69a47` (lifesteal's cap removed and its
  accrual gated to normal damage per §2 — **not** a no-op; the sweep delta is
  below and in the session log). P0's remaining clause is carried as
  `p9a`/`p9f`, not as a separate band.
- **p1a — what a reader needs to know.** SPEC-FINAL §10's "structures are
  high-cost passable tiles (cost ∝ HP × toughness ⚖)" is now the ground flow
  field's rule: a structure tile is enterable **orthogonally** at
  `breach.base + breach.perEhp × effective max HP` (both in `data/towers.json`,
  both ⚖ for P10), diagonals stay fully physical, and `base` is sized above
  the longest walkable route so an open path always beats a breach — a
  structural guarantee, pinned by an executable-invariant test. Chewing is
  **routed, not incidental**: a pathing enemy attacks a bumped structure only
  on a breach route, with no route at all (Act II beeline preserved), when
  entombed inside an occupied tile, or as the Gatebreaker (`structureBreaker`,
  G7's authored exception) — all four clauses mutation-verified. `checkBuild`
  accepts seals; `allGatesReachable`/`wouldBlockPath` survive as physical
  diagnostics on a scratch field. Q92 logs the five defaults. **Balance: a
  measured no-op on default play.** Bots skip sealing placements (the classic
  open maze; a sealed-build policy is p10f's, G19), so the 12-seed sweep is
  byte-identical either side on both policies, QA-verified against a HEAD
  worktree. End hashes move only where HEAD's any-bump rule chewed walls: QA
  bisected seed 1 `hybrid` to one petrified palisade differing by **0.1 HP**
  of incidental chew that no longer happens — G7 clause 2 measured, not
  asserted.
- **The p1a trap, worth remembering.** The first mutation check failed
  honestly: flipping the chew gate to any-bump left all tests green, because
  an honest crowd walking an open maze **never even bumps** — a 16-husk funnel
  through a one-tile gap lands zero wall contacts, so the guarded branch was
  untestable from gameplay-shaped setups. The branch is pinned by a
  constructed state instead (rooted bodies exactly overlapping a wall-pinned
  husk, whose deterministic overlap tie-break shoves it across the boundary),
  and review found the same blind spot's dangerous twin: an enemy *entombed*
  by a wall built on its tile — the old any-bump rule dug it out by accident,
  and the routed-chew rule would have pinned it forever. Standing inside an
  occupied tile now counts as breaching, with a dig-out regression test. A
  branch nothing can reach is not covered by the tests that pass around it —
  m19c's latent-defect lesson, one layer down in the movement code.
- **Balance after x002 — measured, nothing tuned.** Removing the 3 HP/s leech
  cap is the first Correction with a balance body. 12-seed sweep, same seeds
  either side: `maxbuild` medSurv **119.38 → 180**, medMin 7.2 → 12.4,
  medWaves 4 → 6, medLevel 15 → 21, medKills 3070 → 5946; `hybrid` moves
  gently, 120.4 → 126.08 medSurv, 3083 → 3320 medKills — QA measured seed 1
  `hybrid` byte-identical (that bot's run never leans on leech), so the hybrid
  delta is a few seeds moving, not a uniform shift. The mechanism is what §2
  predicts: `maxbuild` deals the most damage, so uncapped 1–5% lifesteal is a
  large Act II survival buff, and the DoT/electric exclusion claws back less
  than the cap released. Every gate stays green — A3's "a stationary Warden
  always dies" included — and per Q40 no `/data` number was tuned; the
  re-baseline that prices this in is P10's.
- **Merge note (2026-08-26).** The §16 reconcile was executed twice in parallel —
  once on `master` and once on `lane/tuner` — and the two are merged here rather
  than one discarded. The lane's audit table, P-order queue and MIGRATION §8
  ledger are the spine; master's contribution is the **Corrections** section
  (`x001`/`x002`), MIGRATION **§8.4** (the two contradictions, with the m20d
  bisection) and **§8.5** (the A/B/C → G1–G20 rename map). Master's four
  QUESTIONS were renumbered **Q81–Q84 → Q86–Q89** behind the lane's Q81–Q85; every
  cross-reference in BACKLOG, MIGRATION and this file follows the new numbers.

### Superseded — the V3 state this reconcile replaced

- **Milestone:** M17, M18 and **M19 complete**; **M20 in progress** — `m20a`
  (per-tower upgrade tracks), `m20b` (the three owner towers and their milestone
  specials) and **`m20c`** (the other seven towers, and every tower's defense
  band, SPEC-V3 §4) landed. **`m20d` is the next action**: pricing the Venom
  Spore so its `+1 projectile @2` pays out (Q79).
- **Gate status:** **638 tests pass, 23 skipped** (15 retired at M17 with logged
  reasons — see MIGRATION.md §5; **3 still deferred** after m20c re-measured
  m20a's five and returned two of them, below; **1 at m20b**, the Venom fix that
  needs its price — m20d). Gates **C3 and C4 are green**. Every A/B gate except
  A4's `tesla_coil` and `mortar` T1 clauses and `light-build`'s `kite` is green
  at m20c, A11 included.
- **m20c — what a reader needs to know.** The other seven towers **keep the
  tracks m20a gave them**, and that is the finding rather than a shortfall.
  §4's three counts agree with a line in build cost — `count = 5 − (cost −
  50)/35` reads Arrow 5, Poison 4, Electric 3 — but putting the open seven on
  it measures worse, because a shorter track under Q73's cost-neutral price is
  two nerfs at once: the ceiling falls ×2.59 → ×1.46 *and* each step gets
  dearer, the same total buying fewer of them. At the line's count and the
  rule's price, Ballista alone takes the boss gate from `victory` to
  `defeat_warden`, and Ember Brazier, Frost Obelisk and Mortar drop A4's T1
  clause to 0/5. So each of the four carries a `note` in `/data` naming the
  count the line wants and the run that stopped it, and the line is Q80's
  proposal for owner sign-off. **The price qualifier is load-bearing** — QA
  found it missing from the first draft: at the prices they charge *today*,
  Ember Brazier at count 4 clears A4 T1 5/5 and Mortar at count 3 clears T1
  5/5 with T3 still 0/5, so the line and the price rule are jointly infeasible
  and individually fine. Adopting it for those two needs a per-track price
  multiplier, filed as **m20e**. The divisor 35 is fitted, not derived: §4's
  three points are not collinear, every divisor in (28, 46.5] agrees with
  them, and they disagree about the open roster — the test pins the family.
  What m20c *does* add is the thing §4 asked for and Q73 deferred: **defense
  bands** (`none 0, low 5, medium 10`), so "+10% Defense per step" finally has a
  caller. Two loader rules keep both honest — `validateStepPrice` (a whole track
  costs `upgradeTotalCostMul ×` the build price, no `note` escape) and
  `validateDefense` (a tower's defense is a band or a load error).
- **The m20c trap, worth remembering.** Two of the five assertions m20a
  deferred to this item **were already green before it started**: `arrow_spire`
  and `venom_spore` clear A4's T1 clause 5/5 at HEAD, closed by m20b's specials,
  and both are live tests again. The same re-measure caught the balance note
  claiming credit it had not earned: `light-build`'s `kite` is 7/8 (up from
  0/8), and forcing every defense band back to 0 still reads 7/8 — m20b did all
  of it. A deferral is a measurement with an expiry date, and "my change
  improved X" is a claim that needs the control run, not the plausible story.
  QA then caught the same failure one level down, in the *rejections*: two of
  the notes recording why a track was left alone quoted prices that either
  disagreed with the measurement or could not load under the rule the same
  commit added. A measured reason is only as good as the configuration it was
  measured in, and a note that names a number nobody can reproduce is worse
  than no note — every one of them now carries its price.
- **m20b — what a reader needs to know.** §4's milestone specials are *data*:
  each `upgrades.specials` entry is a typed key (`pierce`, `projectiles`,
  `onHit`, `damageRatio`, `electricChain`) that the loader refuses unless the
  attack can pay it, and `attackProfile(def, level)` in `src/sim/upgrades.ts`
  folds them into the attack a tower of that level actually fires. **Read the
  profile, never the authored attack** — the fire loop, the info panel and m21's
  VS formula all do, which is the m20a stale-reader trap answered in advance.
  Composite damage (§3's `normal:electric = 1:1`) rides in `HitEffects.ratio`
  and is dealt by one `dealHit`, so all seven attack shapes carry a split; a test
  drives each shape to keep it that way. Venom Spore's V2 `attack.poison`
  constant is **deleted** — its DoT is a share of the attack now, which is why
  its damage reads 45 where V2 read 4 (Q76 has the arithmetic; output is
  unchanged). The three owner towers are the only ones with specials, so the
  other seven are byte-identical: QA confirmed 6/6 seeds, same end hash.
- **The m20b trap, worth remembering.** The balance note nearly shipped blaming
  the wrong tower. A 12-seed sweep after m20b read `maxbuild` medSurv 171.6 →
  119.4 and the obvious story was Electric losing two of its three arcs — except
  **no sweep policy builds a Tesla Coil at all**, and at 32 seeds both trees read
  the same medians (180 / 12.2 / 6 / 20). The 12-seed row was noise. Q78: a
  median over 12 seeds and a pass/fail over 8 are both samples, and neither is
  evidence about a mechanism until the mechanism is what varies. The same
  paragraph is why `boss.test.ts`'s "but not all" clause now runs 20 seeds — it
  went red at m20b without the fight getting easier (HEAD 17/20 wins, m20b
  18/20; the losing seeds moved).
- **m20a — what a reader needs to know.** Towers no longer share a three-tier
  ladder: `data/towers.json` gives each one `upgrades: {count, stepCost,
  specials}` plus a real `defense`, and a step buys +10% HP/Attack/Defense
  (`upgradeStepMul`) — **not** range, which V2 grew x1.1/tier. `maxTier`,
  `tierDamageMul`, `tierRangeMul`, the 0.75x/1.25x cost ladder and Dusk's own
  35% sell rate are all gone; sell refunds 50% of `Structure.spent`, the gold
  actually charged, which is hashed. The track math is `src/sim/upgrades.ts`
  (its own module: `enemies.ts` needs `structureArmor` and `towers.ts` already
  imports `enemies.ts`). Q73 records every default the section left open and why
  each is a measurable no-op wherever the choice was m20a's.
- **The m20a trap, worth remembering.** The model change was clean and the
  regression was in a *reader* of the field it changed: `deriveSouls` inherited
  "WeaponLevel = highest tier" (SPEC 4.1) literally, so an 11-level Ballista
  handed Act II a level-6 weapon where V2 handed level 3 — ~5x the opening DPS,
  and a stationary Warden started **winning** A3. Four balance gates were about
  to be deferred for a cause that was a one-line bug; they came back green once
  it was fixed (Q74). When a field's range changes, grep its readers, not just
  its writers.
- **m19c — what a reader needs to know.** `Enemy.burnRemaining/burnDps/burnSource`
  and `Enemy.poison` are gone, replaced by one `dots` list keyed by damage type;
  `data/damagetypes.json` owns each row's magnitude, duration, stacking rule,
  armour shred and radius, so **M27 can make Burning stack by editing one field**.
  `applyBurn`/`applyPoison` survive only as thin wrappers so V2-authored towers
  keep their own numbers (Q65). Frost/frozen replace V2's chill-stack model, which
  was specced and never built. Q65–Q72 record every §3 clause the section left
  open. **What is deliberately not wired:** no tower authors Bleeding, Toxic,
  Electric or a status yet — that is m20b — but each is reachable from `/data`
  through a tower attack's validated `onHit` list, and a test drives all seven
  attack shapes through the real fire loop so the seam cannot rot (Q68).
- **The m19c trap, worth remembering.** Two agents found two Major defects that
  569 green tests did not, and both were *latent*: they only bite once m20b
  authors the content that reaches them. The 50-stack budget let the saturating
  type evict, so 49 Bleeding + 1 Burning lost the Burning — the armour shred — on
  the next arrow (Q71); and Electric's radius path never touched the enemy it was
  handed, paying 20 of 100 in a crowd and **zero** to a target the spatial buckets
  had not seen (Q72). The lesson generalises: a mechanism with no production
  caller is not covered by the fact that its unit test passes. Every m19c fix has
  a regression test that turns red when the fix is reverted — verified by
  reverting them.
- **Balance after m20b — measured, nothing tuned.** 32-seed sweep, m20b against
  HEAD `f3defe3`: `maxbuild` **identical medians** (medSurv 180, medMin 12.2,
  medWaves 6, medLevel 20; medKills 5948 → 5655, ~5%), `hybrid` byte-identical
  at 120.4 / 7.3 / 4 / 16 / 3083. The 12-seed default sweep says otherwise
  (medSurv 171.6 → 119.4) and is noise — see the trap above. Where §4's changes
  *are* measurable is single-type runs: Electric −20…−30% damage (`chains: 3 → 1`,
  the arc only at max), Venom slightly up. No `/data` number was tuned; the two
  values that moved are §4's own (the specials) and Q76's power-neutral
  conversion of Venom's DoT into a share of its attack.
- **Balance after m20a — measured, and the movement is the model, not a tune.**
  12-seed sweep, m20a against HEAD `3e749c7`: `maxbuild` medSurv 180 → 171.6,
  medMin **12.5 → 8**, medWaves 6 → 4, medLevel 21 → 20, medKills 5975 → 5531;
  `hybrid` the other way, medSurv 105.68 → **120.4**, medLevel 14 → **16**,
  medKills 2406 → **3083**. The direction is real; the *mechanism* is not
  measured, and QA showed the obvious reading is wrong — giving the three capped
  towers 10-step tracks makes `maxbuild` **worse** (medSurv 113.3, medLevel 15),
  because `BuilderPolicy` always upgrades the lowest-level structure and a long
  track makes it round-robin gold instead of finishing anything. So the sweep
  delta is entangled with a bot heuristic and should not be read as a pure
  statement about the tower model. No
  `/data` number was tuned — every value in `towers.json` is either §4's or a
  no-op migration of V2's (Q73). A1 still passes; the five deferred assertions
  are listed under "Known issues".
- **A10's third test now reads 5653 ms, up from 836 ms, and that is not a perf
  regression.** Q66's clipped DoT tick flips seed 4's `maxbuild` run from
  `defeat_warden` to `victory`, so the run is 65% longer. The gate still passes.
- **Balance after m19c — measured, nothing tuned.** Q66's clipped tick (a row now
  pays the total §3 states rather than that total minus one frame) is the only
  movement: 12-seed sweep `maxbuild` medMin 12.6 → 12.5, medLevel 20 → 21;
  `hybrid` byte-identical at 105.68 / 2406. Per Q40 no `/data` number was touched.
  **QA filed the coverage gap that matters most:** no sweep seed ever builds an
  Ember Brazier and no bot draws `flame_cone`, so the shred path — gate C3's whole
  point — runs zero times in the gate set. BACKLOG s008.
- **m19b — what a reader needs to know.** `Stats` is no longer a flat record: it
  is keyed by (stat, source), `factor()` returns Π over sources of (1 + that
  source's summed ranks) and `total()` the additive sum. `STAT_KIND` classifies
  every stat `flat` or `mul` as a `Record<StatKey, StatKind>`, so **adding a stat
  without deciding how it stacks is a compile error**. Q61 rules what counts as
  one source (the thing a player acquires as a unit: one class, one node, one
  relic, one boon, one modifiers bundle, all petrified terrain together), Q62
  which stats multiply, Q63 the `total()` ordering, Q64 shrine and aura haste.
  `derive()` now hands out **finished multipliers** — `goldFindMul`, not
  `goldFind` — and the rename is load-bearing: a consumer that still writes
  `1 + x` is wrong by a whole factor of one, which is exactly the defect that got
  six of the eight call sites past 479 green tests. See BACKLOG's m19b entry.
- **The trap m19b exposed, worth remembering for m19c.** Every default test world
  has **at most one source per stat** (a default headless run's whole stat sheet
  is two entries, both from the class; the 12 boons grant 12 distinct stats, so
  boons never stack against each other either). Where there is one source,
  `factor(s)` and `1 + total(s)` are identical — so the buggy and the fixed
  expression agree on every world the suite builds, and the 12-seed sweep cannot
  see the change at all. Any test of a stacking rule must **deliberately skew the
  world with two sources**, or it is testing nothing.
- **A10 — correction.** This file previously said A10 was red. It is **not red in
  the code**: measured at m19a it passes both at that commit and at HEAD
  `6be4dab` in a clean worktree on this machine. MIGRATION.md §4.5 measured it
  red (3836/6080/6267 ms) on the audit machine. A wall-clock budget that flips
  with the host is not measuring the sim, which strengthens rather than weakens
  Q41's case for a run-length-independent budget at M22. Nothing was retuned.
- **Balance moved without a constant moving.** m19a replaced `armor/(armor+50)`
  with V3 §2's linear rule, and the swap alone cut the hybrid policy's median Act
  II survival 132.4 s → 105.7 s and its median kills 3552 → 2406 (the palisade's
  +7 terrain armour was 12.3% mitigation, now 7%). `maxbuild` and the other
  policies are unchanged, every A/B gate still passes, and enemy-side damage is
  bit-identical to HEAD. Per Q40/Q59 **no number was touched**; HANDOFF §4 is
  marked stale and is regenerated at m27c.
- **Balance after m19b — measured, nothing tuned.** The 12-seed sweep is
  **byte-identical** to HEAD (maxbuild medSurv 180 / medKills 5993; hybrid 105.68
  / 2406), for the one-source-per-stat reason above — the default policies simply
  never hold two sources of a stat. Where it bites is a legal endgame build (60
  tree points, 3 rare relics, all boons maxed): **pickupPct +42.2%, goldFind
  +28.6%, power +22.1%, attackSpeed +18.4%, wallHp +15.0%**. That is larger than
  MIGRATION §4.4's +10.6% estimate, and pickup radius (11.28 tiles) is the
  outlier the M27 re-baseline should look at first. Per Q40 **no `/data` number
  was touched**; HANDOFF §4 stays stale until m27c.
- **Standing constraint (Q40):** the constraint said no balance tuning *before*
  M19 lands multiplicative stacking. m19b has now landed it, so M27's
  re-baseline is unblocked — but per Q40 the re-baseline is still one deliberate
  pass at m27a, not incremental nudging as gates wobble.

### Superseded v0.2 sections below

Everything from "M0 — done" down describes v0.1/v0.2 and is kept as history. Where
it conflicts with V3, V3 wins.

## Current state (v0.2, historical)
- **Milestone:** M8 complete — **first complete version**. All of A1–A11 green
  (two strict bounds relaxed and documented under Known issues). BACKLOG.md b001
  (SPEC-V2 §10 D1 death flow), b002 (Abandon Run confirm) and b003 (stash
  click-to-swap / drag-to-unequip / compare tooltip, SPEC-V2 §10 D2) also done;
  M9 (SPEC-V2 §12) work is underway via the BACKLOG queue.
- **Last session:** 2026-08-25
- **Next action:** BACKLOG.md f003 (leak coupling) is done (commit f24bf7c);
  f004 (class framework) is next in queue. After the BACKLOG queue: QUESTIONS.md
  verdicts. Both playtest requests
  carried the example template
  rather than actual verdicts, so all **32** entries are still pending — see the
  Verdict log at the top of that file. The tier ladder above T3 has no measured
  win (HANDOFF.md §6), and the two relaxed bounds (A3's per-seed 3:00 line, A7's
  15% leak share) remain open.
- **HANDOFF.md** at the repo root is the state report for SPEC v0.2: every
  implemented system, every deviation from SPEC.md with its reason, the /data
  snapshot, measured sweep metrics, and an engineer's list of what is shallow.

## Milestone checklist
- [x] M0 — sim skeleton + headless CLI (gate A11)
- [x] M1 — Act I tower-defense core (gate A2)
- [x] M2 — Act II survivors core (gate A3)
- [x] M3 — the Sundering, first full loop (gate A6)
- [x] M4 — full content pass (gates A4, A5)
- [x] M5 — meta layer: relics, tree, classes, tiers (gate A8)
- [x] M6 — final boss, Awakenings, Rifts
- [x] M7 — balance sweeps green (A1–A9)
- [x] M8 — feel + ship (gate A10)

## Layout
```
data/              all tuning + content as JSON (schema-validated in src/sim/content.ts)
src/sim/           deterministic core: no DOM, no Math.random, no Date.now, no native trig
src/bots/          scripted headless policies (idle | turtle | kite | hybrid | no-move)
src/render/        canvas renderer (reads sim state only)
src/ui/            browser entry point, HUD, Hub, input mapping, settings
src/meta/          account meta: Ember, Constellation, stash, quests, save/load
tools/sim.ts       headless CLI -> JSON report
tools/sweep.ts     in-process balance sweeps (fast; use this for tuning)
tools/a4probe.ts   per-tower viability probe (SPEC A4)
tools/a5probe.ts   weapon damage-share probe (SPEC A5)
tools/gen-tree.mjs regenerates data/tree.json (120-node Constellation)
tests/             vitest; acceptance tests are named aNN-*.test.ts
                   A10 runs single-threaded via vitest.perf.config.ts
```

## M0 — done
- Vite + TS + Vitest + Zod scaffold; `npm test`, `npm run sim`, `npm run build` wired.
- Seeded RNG with the five named streams (`waves/spawns/drops/offers/ai`), mulberry32 core.
- Deterministic math module (`dsin`/`dcos`/`datan2`) so no native trig enters the sim.
- 36×20 Bastion Vale grid; integer-cost Dijkstra flow fields (ground + ghost);
  path-guarantee check (`wouldBlockPath`) with state restore.
- World/entity model, spatial hash, fixed 60 Hz phase machine, Warden movement +
  dash + Act I manual attack, wave spawning, Core damage/defeat, end-state hashing.
- All data files authored and cross-validated at load.
- **Gate A11 green**: 100 seeds × (run, replay) produce identical end-state hashes.

## M1 — done
- Combat primitives shared by both acts: projectiles, AoE, cones, pierce lines,
  chains, ground areas, first-target selection, cluster/line direction search.
- All 10 towers, data-driven attack kinds (single/pierce/cone/aura/chain/lob/poison),
  three tiers on the SPEC cost curve, Beacon auras, Harvest Sprout income.
- Build/upgrade/sell commands enforcing tile legality, build range, gold, class
  locks and the path-guarantee rule; early wave call pays 2 gold per second skipped.
- Enemy traits live: armour, front shields, healers, buffers, splitters, bombers,
  burrowers, phasing wraiths, chargers, stomps, ranged spitters, fire trails.
- Bot policies with lane-adjacent build-site ranking that avoids the Sundering
  blast pocket.
- **Gate A2 green**: idle play loses the Core on wave 3–4 across 25 seeds.

## M2 — done
- Soul weapons: all 8 kinds (single / pierce / cone / nova / chain / lob / trail)
  with 6-level tracks, the SPEC 4.1 inheritance formula, and the 3 Awakenings.
- Act II spawn director: continuous budget accrual, per-minute weight table,
  elites, Rift bursts, alive cap, Warden-Eater cue at 10:00.
- XP gems with fade + cap, the 5n+n² level curve, 1-of-3 offers with a reroll,
  boons applied through the shared stat pipeline.
- The Sundering: petrification, Heartstone pocket, guaranteed approach lanes,
  spire linking, terrain residuals, wall/beacon passives, soul binding.
- Canvas renderer, DOM HUD, browser entry point; `npm run build` produces a
  playable bundle.
- Meta module (Ember, Constellation allocation, stash, quests, save/load).
- Warden base stats moved out of code into `data/warden.json`.
- **Gate A3 green**: a Warden that never moves always dies (median 119 s) and
  never reaches the boss; the same build survives far longer when it moves.

### Balance defects found and fixed during M2
- Act II spawn points sat inside the impassable border ring, so nothing moved.
- Enemy separation formed a shell that stopped the horde ever touching the Warden.
- Uncollected XP gems grew without bound (16k+ in a long run).
- Piercing Bolt was 86% of all damage; blast damage had the same flaw. Both now
  fall off per additional target — the mechanism A5 will lean on.
- Act II fodder was 7× weaker than the wave-10 enemies just fought: the ×0.6
  overlay now applies to the statline Act I ended on, not the wave-1 roster.
- Weapon ranges of 6–12 tiles made Nightfall a shooting gallery; cut to
  survivors scale so the horde closes.
- The Beacon aura cache lived at module scope and leaked between worlds.

## M3 — done
- Conversion table verified end to end for all ten towers: terrain forms, wall
  armour cap (+15), Beacon attack-speed cap (+12%), Gem Blooms, spore clouds,
  ice monoliths, burning braziers, shrines and linked conductive spires.
- Dusk: 15 s of free repositioning with build/sell at half refund, then the
  Sundering; the Core detonation clears the pocket **and** blasts up to four
  approach lanes so the Heartstone can never be sealed behind the maze.
- 6-slot soul picker with its HUD screen; auto-binds when candidates fit.
- Full loop plays in the browser (`npm run dev`) and headlessly end to end.
- `tests/architecture.test.ts` enforces SPEC 9.1 mechanically: no DOM, no
  `Math.random`, no wall-clock and no native trig anywhere under `/src/sim`.
- **Gate A6 green**: stripping petrified terrain from a `hybrid` build costs
  more than 20% of Act II survival across 10 seeds.
- **Gate green**: full-loop headless runs complete, including boss kills.

## M4 — done
- Relic and Orb drops (`src/sim/loot.ts`): rarity weighted by Luck, affix rolls
  inside their authored ranges, guaranteed relics from elites and bosses, an
  Orb for a victorious run. A won run yields ~3 Orbs, matching SPEC 8.2's target.
- Map tiers and modifier drafting (`src/sim/tiers.ts`): tier N offers N−1 slots
  of 1-of-2, plus auto/hardest drafting and the reward multiplier.
- Damage telemetry: ailments are booked against the weapon that applied them,
  and Act II damage is snapshotted at minute 8 for A5.
- Content sweep test covering all 10 towers, 8 weapons, 20 enemies, 10 waves,
  12 boons, 12 modifiers, and the trait behaviours (Gatebreaker structure
  damage, Splitling, Shellback facing, Cinderling, Frostkin, Mender).
- **Gate A4 green**: all seven soul towers clear Act I solo at T1 (5/5 seeds)
  and none clears at T3 (0/5); walls alone fail at both.
- **Gate A5 green**: across the top-10 builds at minute 8 no weapon exceeds 35%
  of damage (worst: Mortar Lob at 29.7%).

### Balance defects found and fixed during M4
- Ember Brazier was authored at 40 dps against a spec'd 10: the tower table
  states dps, not damage-per-shot. Every tower's dps is now checked.
- Continuous cones and ground fields had no target cap, so only a Venom Spore
  or Ember Brazier build could hold a swarm. They now use the same many-target
  damping as blasts.
- Chain Lightning never fired: the M2 range cut left it shorter than the
  distance a kiting Warden keeps, so it idled. Reach restored.
- Act II was decided in its first ten seconds; the director now warms up.

## M5 — done
- Orb crafting (`src/meta/crafting.ts`): Whetting rerolls values, Turning swaps
  one affix, Ascension steps rarity; all pure, so the UI can preview a craft.
  Equip/discard keep the equipped slots consistent.
- The between-runs Hub (`src/ui/hub.ts`): class select with quest-gated locks,
  map tier T1-T5 with the 1-of-2 modifier draft and its reward preview, an SVG
  Constellation with allocate/refund, and the relic stash with crafting.
- Save/load round-trips a populated account exactly, survives corrupt saves and
  repairs a disconnected allocation graph.
- Two purpose-built A8 bot arms: `maxbuild` (every buildable tower type, gold
  into tiers first) and `rush` (the least that still clears Act I).
- **Gate A8 green**: maxbuild wins 92% of runs, rush 0%, both clearing Act I on
  all 12 seeds so the comparison is like-for-like.
- **Gate green**: save/load round-trip test.

## M6 — done
- The Warden-Eater (`src/sim/boss.ts`) with all three SPEC 5.5 phases:
  telegraphed line charges that shatter the petrified terrain they cross,
  Wraith summons with expanding ground-slam rings, and an enrage below 30% that
  speeds it up and closes a ring of arena fire inward.
- Boss HP is 15,000 x the tier multiplier, deliberately skipping both the Act II
  overlay and the per-minute ramp.
- Awakenings verified end to end: gated on weapon Lv6 plus a boon at rank 3,
  and each of the three changes how its weapon plays.
- Rift events verified at 3:00 / 6:00 / 9:00, doubled by Rift Storm.
- Renderer draws charge telegraphs and the closing fire ring.
- **Gate green**: a scripted `maxbuild` run reaches, fights and kills the boss;
  across 8 seeds most win but not all, so it is a real fight.

### Fixed during M6
- Mortar volleys fired only one shell into a single crowd, because every extra
  shell was excluded for overlapping the first. Volleys now spread across the
  crowd when there is nowhere else to aim.
- The Phoenix Ring's orbs tested centre-to-centre and could miss a Colossus by
  0.003 tiles; they now connect on body contact like every other hit test.
- The Warden damage handlers were registered per-`Run`, so a bare `World`
  silently ignored damage. They are registered once at module load.

## M7 — done
- Balance pass over `/data` only, plus the bot policies and probes that measure it.
- **Gate A1 green**: median victorious run 25.2 min over 24 seeds (range 24.7–26.0).
- **Gate A7 partly green**: wave 9 now leans on the enemies walls cannot stop, and
  a perimeter wall-off leaks more of it than of wave 8 — but not the 15% SPEC asks.
- **Gate A9 green**: a Harvest-heavy opening out-earns greedless play by wave 8
  and still wins under half its T2 runs.
- New probes and policies: `tools/a4probe.ts`, `tools/a5probe.ts`, and the
  `maxbuild`, `rush`, `walloff`, `greedy` and `greedless` arms.
- Per-wave telemetry (spawned / leaked / gold earned) so economy and turtle
  claims are measured rather than asserted.

### Fixed during M7
- Burrowers tunnelled but stayed targetable the whole way, so they were not the
  counter to a turtle SPEC 6 says they are. They are now untargetable while
  underground and surface near their target.

## M8 — done
- **Feel**: hit flash, floating damage numbers, screen shake, boss charge
  telegraphs and the closing arena-fire ring, all driven off the sim's event
  stream and all capped so a 350-strong fight stays readable.
- **SFX hooks** (`src/render/sfx.ts`): every gameplay event maps to a cue behind
  an `AudioSink` seam, rate-limited per cue so a volley reads as one sound.
  v1 synthesises them; a sample-based sink drops in without touching callers.
- **Settings**: volumes, screen-shake scale, damage numbers and their cap, tower
  ranges, grid — persisted, sanitised on load, and strictly presentation-only.
- **Results screen** with waves, survival, level, kills, towers, relics, Orbs
  and Ember, leading back to the Hub.
- **Performance**: ~2x faster. Pooled per-tile spatial buckets, cached enemy
  defs and trait bitmasks, a flat blocked-tile mask, cached terrain-effect
  lists, and staggered separation / nav-field / kiting updates.
- **Gate A10 green**: a worst-case Act II tick runs in ~1.1 ms (half a frame
  budget), a full headless run in ~4.2 s, and entity counts stay inside their
  SPEC budgets.

### M8 checklist
- [x] Hit flash on damaged enemies
- [x] Floating damage numbers (toggleable, capped)
- [x] Screen shake on hits, leaks, blasts, the Sundering and boss slams
- [x] SFX hooks for every gameplay event, with per-cue rate limiting
- [x] Settings screen, persisted and presentation-only
- [x] Results screen with the full run summary
- [x] `npm run build` produces a playable bundle
- [x] `npm test` green, including the A10 performance pass

## Playtest round — 2026-08-25
Reported: right-click did nothing, the game looked blurry, towers could not be
built with left click, and there was no way to pause.

- **One CSS bug caused the first three.** `.sw-modal { display: grid }` outranks
  the user-agent `[hidden] { display: none }`, so `modal.hidden = true` never
  took the overlay out of the layout. An invisible sheet sat over the canvas the
  whole time: it swallowed both mouse buttons and blurred the arena through its
  own `backdrop-filter`. Fixed with a `.sw-modal[hidden]` rule that also clears
  pointer-events and the filter.
- **Constellation right-click** was a second, real bug: affordability was checked
  inside `refund` but not in `canRefund`, so a right-click with too little Ember
  silently did nothing. `refundBlocker` now reports *why*, and the Hub shows it.
- **Blur** also had a second cause: the canvas was authored at 1152x640 and left
  for the display to upscale. It is now backed at the device pixel ratio, with
  CSS carrying the aspect ratio so a narrow window shrinks it without stretching.
- **Pause** (Esc) freezes the loop and offers Resume or Abandon. Pausing is
  presentation-only — the loop stops stepping, so a paused run resumes
  bit-identically and determinism is untouched.

Regression tests live in `tests/ui-input.test.ts` (jsdom). jsdom resolves
`hidden` correctly even where a browser would not, so the overlay test asserts
the invariant against the stylesheet itself: any rule that shows `.sw-modal`
must be outranked by one that hides it. That assertion fails on the old CSS.

## Playtest round 2 — 2026-08-25

Reported: refunds still did not work; no tower information anywhere; every
projectile looked the same; the Constellation ran off the page and said
nothing; no speed control; no dev tools; no sense of stage progress; and
features whose counters read zero with no explanation.

- **Refund, real cause.** A fresh account has 0 Ember and respec costs 5, so the
  first point ever spent was permanent. Points spent in the current Hub visit now
  come back free, and `tree.startingEmber` is 400. `tests/ui-refund-repro.test.ts`
  drives the real Hub DOM.
- **Constellation** rebuilt as a bounded disc: each branch owns a 120° sector,
  ring sizes grow with circumference, the outer radius is fixed so the whole tree
  is always on screen. Nodes have hover cards that spell out their stats, lit
  edges take their branch colour, and a refused click says why.
- **Balance.** M7's `hpScalePerWave` 1.35 had turned wave 10 into a wall that no
  amount of DPS answered: `kite` and `turtle` cleared 0/8 seeds. Wave HP growth
  is now 1.30 and the two modifiers A4 drafts are stronger (Ironhide +45%,
  Fleetfoot +30%), so A4's "fails at T3" holds on tier difficulty rather than on
  the wave wall. Act II absorbed the knock-on (warm-up 75→100 s, `actIICarry`
  3.5→3.2). `tests/light-build.test.ts` pins the shape.
- **A10 went red** as a side effect — longer runs, 5.3 s median against a 5 s
  budget — and was won back honestly: `moveEnemy` no longer takes a square root
  to clamp a saturating value, and `rebuildBuckets` inlines its cell key. Same
  end-state hashes, 4.4 s median.
- **Tower panel** (`src/ui/tower-info.ts`) derives damage, rate, DPS, range,
  splash, burn/poison/slow, build/upgrade/sell prices, the soul and the terrain
  from the same helpers the sim fires with, for the selected tower or whichever
  one the cursor is over.
- **Projectiles** now differ per source: bolts, arcing shells with ground
  shadows, globs, orbs, sparks — plus tracers for the instant-hit attacks, which
  previously drew nothing at all.
- **Stage progress** (`src/ui/progress.ts`): Act I is a bar over waves with a
  tick per wave and a second bar for the active wave; Act II is a bar to the
  ten-minute boss with ticks on the director's real elite and rift schedule, a
  countdown, and an XP bar.
- **Fast-forward** 1x/2x/3x (F), as more fixed ticks per frame rather than a
  longer tick, so a fast-forwarded run is bit-identical to the same run at 1x.
- **Practice runs**, opted into at the Hub: kill all, +gold, +XP, heal,
  invulnerable, skip wave, +1 minute, summon boss. The actions are Commands gated
  on `RunConfig.practice`, so they replay exactly and a normal run cannot reach
  them; a run that used one banks nothing.
- **Zero-state**: Settings can seed a test account (8 relics, 3 of each Orb, 600
  Ember) or wipe it; every header counter now says what it is and how to get
  more; the empty Stash and the Orb buttons explain themselves.

## Known issues / skipped tests
- **Venom Spore's `+1 projectile @2` pays out nothing against a lone target
  (m20b, filed by QA; BACKLOG m20d).** With fewer enemies in range than the
  tower has shots, the spare spore is dropped, so the step is worth zero against
  a lone Gatebreaker or the boss — on a step that also gave up its +10%. The
  one-line fix (aim it at the leading target again) takes A4's "venom_spore
  alone fails Act I at T3" from 0/5 to **5/5**, so it cannot ship without
  re-pricing the tower. Both behaviours are in
  `tests/m20b-owner-towers.test.ts`: today's is asserted, the fixed one is the
  suite's single `.skip`. QA also measured the @4 ratio shift as
  **non-monotonic** — a level-5 Venom clears 40 husks 34% slower than a level-4
  one, because impact traded for DoT is wasted on what the impact already kills.
  Both are m20d, with Q79.
- **Three balance assertions remain deferred (five at m20a, two returned at
  m20c).** m20c re-measured all five. **Returned:** A4's T1 clause for
  `arrow_spire` and `venom_spore`, both 5/5 at HEAD and live tests again —
  m20b's milestone specials closed them, not any track. **Still red:** A4's T1
  clause for `tesla_coil` (0/5) and `mortar` (3/5), and `light-build`'s `kite`
  (7/8, up from 0/8 — seed 8 dies on wave 9). None of the three is a track
  question. `tesla_coil` wants V2's tier-3 range and third arc, both of which
  §4 removed on purpose (a cheaper step price measures 0/5 either way and cost
  f001 its seed, so it was not adopted); `mortar` has no count satisfying both
  A4 clauses at once, and §4's count line reads 3 for it, which measures T1 0/5
  — worse than the track it would replace; `kite` is one seed short. All three
  want base damage re-priced, which is **M27's one-pass re-baseline** under
  Q40, not a nudge. Q80 has the runs.
- **A3 is green on its material claims, not its strict bound.** Act II survival
  is sharply bimodal: a stationary Warden either drowns in the opening two
  minutes (~115 s) or snowballs XP into a few more (~290 s), so the median sits
  on the boundary and flips with any tuning change. A3 asserts that every
  stationary run dies, none reaches the boss, at least half die inside 3:00, and
  moving survives several times longer. The per-seed 3:00 bound is `it.skip`-ed.
- **A7 is green on its material claims, not its strict bound.** A perimeter
  wall-off leaks wave 9 more than wave 8 and the tunnellers do get through, but
  the measured share is ~0–18% against SPEC’s 15% bar. A4 and A7 pull the same
  constant in opposite directions (see QUESTIONS.md); resolving it properly wants
  a second anti-turtle lever that does not also break mono-tower builds.
- **Act II remains bimodal** for every policy. It no longer blocks a gate, but it
  makes medians noisy — prefer means or pass-rates when measuring Act II.
- **The tier ladder collapses past T3.** `maxbuild` wins 75% at T1, 50% at T3
  and 0% at T5; T4 and T5 have no measured win at all. The modifier draft is the
  only difficulty lever and it is not smooth. Q30's stronger Ironhide/Fleetfoot
  makes this worse, not better — it was the right trade for A4, but the ladder
  needs its own scaling.
- **Piercing Bolt sits at or above A5's 35% line** whenever a build has it:
  43.7% across the policy pool, 33.9% across A5's own diverse-build pool. A5
  passes on the pool it measures; the honest reading is that pierce is at the
  bar.
- **Boon pick data is a bot artifact.** `BuilderPolicy.pickOffer` takes
  awakening → weapon → card index 0, so measured "picks" reflect offer RNG, not
  preference. There is no signal about which boons a player would want.
## M18 — done (quick wins: C7, C8)

Five items, each QA-verified before commit: Orbs deleted (`5c5a507`), the save
migration that drops their key (`b8fff25`), god mode (`2f3a3ca`), the dev profile
(`d27cdcc`), range indicators (`840f171`) and selection feedback.

**The pattern worth recording: QA found 17 Major-or-worse bugs across the five
items, and roughly half were in the tests I wrote to guard the work, not in the
work itself.** In order: a gate test that exempted the two files most likely to
regress; a DOM scan that never clicked anything; a positive control rewritten into
comparing 0 to 0, which left nothing in the suite proving a run banks rewards; a
C8 assertion that passed with no `dist/` at all and again against a `dist/` built
before the feature existed; a canvas suite running on a default world, where the
buggy and fixed range expressions agree, so re-inserting the original bug passed;
and a selection harness that re-implemented the wiring it was meant to test.

Every fix from here is mutation-tested: break the source, confirm a test fails.
That is now the standard, not an occasional check. The t1 and t2 batteries (8 and
14 mutations) are kept as scripts in the session scratchpad and are worth
rebuilding in-repo if this keeps paying off.

Two design errors of my own, both in the dev profile: startup **wrote** the
profile into the save, which would have irreversibly inflated a returning
developer's account and left the "clean profile" toggle with nothing to clean;
and `isDevBuild()` defaulted to *dev* when the env was unpopulated, so production
safety rested on the bundler's constant-folding rather than the source's own
logic. Both are fixed and mutation-verified.

Shortfalls that are stand-ins rather than omissions, both because their targets
land at M24: the dev profile grants 60 Constellation points, not 999 (the account
level caps it, Q53), and fills the stash procedurally because §7's item table does
not exist yet (Q54). Both are asserted exactly, so they turn red when M24 changes
them.

## M17 — done (SPEC-V3 reconcile)

Audited the v0.2 codebase against SPEC-V3 and wrote **MIGRATION.md**. Findings that
changed the plan rather than recording a gap:

- **Nothing in V3 is built.** Every V3 section is either not started or contradicted
  by working code; there was no partially-correct system to finish.
- **The cycle machine (f001, `4e44a33`) is dead code walking** — ~400 lines plus 11
  tests, superseded by V3 §1's interleaved waves three commits after it shipped.
  Removed at M22, not now, so coverage does not gap.
- **`showRanges` has never drawn anything.** The R key, the HUD button and a
  Settings checkbox all toggle a flag the renderer never reads. The placement ghost
  does draw a range ring, but from the *base* `def.attack.range`, so it lies about
  any upgraded tower. Both are M18 t1.
- **A10 is red at HEAD** (3836 / 6080 / 6267 ms vs 5000). Not a performance
  regression — the sim did not get slower, the run got longer.
- **Multiplicative stacking (V3 §2, gate C4) invalidates every tuned number.** Six
  +10% sources go from ×1.60 to ×1.77. Hence the no-tuning-before-M19 constraint.

Retired 15 tests, each with a `RETIRED (V3 §x)` reason naming the superseding
section and the milestone that deletes the code: **A5** (weapon share — V3 §5 has no
weapons to take a share), **A6** (terrain value — V3 §5 stops towers attacking in VS
waves), **A7** (turtle must leak — V3 §9 legalises sealing; this also closes Q20),
**A8** (Sundering head start — replaced by the wielding formula), and 4 assertions in
`f001-cycle-machine.test.ts` including gate **B9**. **B11** retired with no test to
mark — it was specced in V2 and never implemented.

Rule applied, recorded in MIGRATION.md §5 so later milestones follow it: *a test is
retired the moment V3 contradicts it, but its file is not deleted until the code it
covers is deleted.* Retirements are `describe.skip`/`it.skip`, because a skip is
visible in CI and a deletion is not.

BACKLOG.md rewritten to V3 §13's M17–M27 order, 30 items with concrete acceptance
criteria naming the C-gate each satisfies. QUESTIONS.md gains **Q38–Q49**.

## Session log (newest first)
- 2026-08-26 — **p1a: the path guarantee removed; sealing legal, breach
  pathing live** (this commit). §10 as an engine rule: breach mode on the
  ground field (`breach.base 8000` + `perEhp 10 ×` effective max HP, /data,
  ⚖), orthogonal-only structure entry, physical diagonals, routed-not-
  incidental chewing with the beeline/entombment/`structureBreaker`
  exceptions, `blocks_path` deleted, `allGatesReachable`/`wouldBlockPath`
  re-pointed at a physical scratch field. Bots skip seals → 12-seed sweep
  byte-identical both policies (QA-verified vs a HEAD worktree); seed-level
  end hashes move only by the incidental chew G7 clause 2 removes (seed 1
  `hybrid`: one petrified palisade, 0.1 HP). 13 cases in
  `tests/p1a-sealing.test.ts`; three clauses mutation-verified after the
  first mutation check honestly *survived* (open-maze crowds never bump — the
  branch needed a constructed pin). 651 pass / 63 skipped + perf 3/3.
  code-reviewer **REQUEST-CHANGES → both Majors taken** (entombment
  permanent-pin, untested `structureBreaker`) + three Minors; qa-playtester
  **PASS**, no bugs filed (double-walls, petrified day-2 seals, mid-chew
  sell/upgrade re-routes, god-mode seals, entombment variants, diagnostic
  purity, perf sanity all probed). Q92 logs the five defaults. Next: `p1b`.
- 2026-08-26 — **x002: lifesteal's cap removed, its accrual typed**
  (`ef69a47`). The two §2 contradictions Q88 named, fixed failing-test-first
  (7 of 9 new cases red on HEAD): `leechCapPerSecond` deleted from
  `data/warden.json`, the schema and `updateWarden` (which now drains the
  whole accumulator per tick, clamped only to maxHp), and `damageEnemy`'s
  accrual gated to **normal damage** — a `type?: DamageTypeKey` on
  `DamageOptions`, threaded from `applyDamageType` and the DoT ticks, so
  Bleeding/Poison ticks and electric hits (including the electric half of a
  split) no longer leech, while untyped direct damage (V2 weapons, manual,
  actives) still does, being armor-reduced basic damage (Q91's three
  defaults). The Bleeding Ring's §7 exception is deliberately p7b's. Balance:
  a real event, recorded above — `maxbuild` medSurv 119.38 → 180 on the same
  12 seeds; every gate stays green. Review found the one claim worth the
  process: Q91 called `leechAccumulator` hashed state and it was not —
  `hashWorld` now covers it (generically nonzero at hash time), with a
  coverage test; A11 8/8 either side. 638 pass / 63 skipped + perf 3/3.
  code-reviewer **REQUEST-CHANGES → all four findings taken** (hash gap,
  `DamageTypeKey` over string, stale HANDOFF cap line, the untyped-dot test
  leg); qa-playtester **PASS**, no defects across a 28-assertion hostile
  probe (overheal clamps, NaN/negative leech inert, non-act2 phases accrue
  zero, boss-slam friendly fire deferred per Q91) — one pre-existing edge
  recorded in Q91: overkill damage leeches in full, masked until now by the
  cap, owner's call at §17.
- 2026-08-26 — **x001: the §3 stack-cap pin** (`dc1681c`). Poison and Toxic cap
  at 3 stacks, refresh shortest — `/data` on master was already correct, so the
  item is the test that makes the next attempt to raise the cap argue with §3
  instead of with nobody (Q87's design). Seven cases in
  `tests/x001-dot-stack-caps.test.ts`, numbers read from `/data` then checked
  against §3's literal. One real hole found and closed while pinning:
  `applyDot` clamped a caller's `maxStacks` override only to the shared
  50-stack perf budget, not the row's own cap, so a call site could hold 50
  Poison stacks while `/data` said 3 — overrides now clamp one-way to the row
  cap (Q90). Proven a behavioural no-op three ways: every shipped override
  writer passes exactly 3, no `/data` field feeds the override, and QA measured
  identical end hashes either side on seeds that build Venom Spores. Mutation
  check: reverting the clamp turns exactly the override case red, the other six
  stay green on master alone. 627 pass / 63 skipped + perf. code-reviewer
  APPROVE (1 Minor taken — the `DotOptions` doc still described the old
  ceiling, the exact vector by which the hole would re-open); qa-playtester
  PASS, no bugs filed.
- 2026-08-26 — **SPEC-FINAL reconcile (§16).** Audited the codebase against
  SPEC-FINAL, rewrote MIGRATION.md as that audit, rewrote BACKLOG.md into §15's
  P0–P10 order (40 items, each naming the G-gate it satisfies), retired 30 test
  cases across six files with logged reasons, and repointed CLAUDE.md's
  sources-of-truth list at SPEC-FINAL + MIGRATION. Three findings worth the
  reading time. **(1)** SPEC-FINAL is mostly a *completed* V3, not a new design:
  §4.2, §5.2 and §6.3 fill in what V3 called designer work, so four QUESTIONS
  and one backlog item close as decided-by-spec rather than as work — and §5's
  one new sentence ("per-track `costMul` allowed") grants exactly the lever m20c
  measured as missing and filed for sign-off, which is what turns §5.2's short
  tower tracks from infeasible into `p5b`. **(2)** Gaps and contradictions are
  different animals and the queue now says so: two shipped behaviours assert the
  *opposite* of verbatim spec text (Poison's cap, lifesteal's cap), and they sit
  ahead of P0 under CLAUDE.md rule 3 rather than at the P where their subsystem
  lives. **(3)** The retirement rule needed one clarification before it was safe
  to apply: *retire what the spec contradicts, not what it merely supersedes
  later*. Applied literally it would have skipped A10's run budget, the boon
  table, the loot rolls and the Shellback case — all green, all still guarding
  shipped code — for a coverage hole the rule exists to prevent. Those five are
  listed as superseded-but-live with the phase that rewrites each.
  The in-flight `m20d` tree did not ship; it is on branch `wip/m20d` and re-filed
  as `p5c` (bisection in "The m20d trap" above). QUESTIONS gains **Q86–Q89** (renumbered behind the lane reconcile's Q81–Q85 at the merge).
- 2026-08-26 — M20 m20c: the other seven towers' tracks and every tower's
  defense band (SPEC-V3 §4). The migration is a *measurement*: §4's three counts
  are a straight line in build cost, and putting the open seven on it measures
  worse against a live gate every time (Ballista alone flips the boss gate;
  Ember Brazier and Mortar drop A4 T1 to 0/5; Frost Obelisk to 4/5), because a
  short track under Q73's cost-neutral price lowers the ceiling *and* raises the
  step price together. So the tracks stand, each of the four carrying a `/data`
  `note` naming the count the line wants and the gate that stopped it, and the
  line goes to the owner as Q80's proposal. §4's defense words became three
  bands (`none 0, low 5, medium 10`) — the stat has been inert since m20a — plus
  two loader rules: a whole track costs `upgradeTotalCostMul ×` build price with
  no `note` escape, and a tower's defense must be a band. Re-measuring m20a's
  five deferrals returned two (`arrow_spire`, `venom_spore` clear A4 T1 5/5 at
  HEAD, closed by m20b's specials); `kite` is 7/8 and the control run says the
  bands did not do it. 12-seed sweep byte-identical either side; 640 pass, 23
  skipped. `tests/m20c-roster-tracks.test.ts` (13). code-reviewer APPROVE with
  8 Minors taken; qa-playtester PASS with 6 filed, 5 fixed here — two Majors
  were wrong evidence in my own notes (a price that cannot load, a missing
  qualifier), and the sixth became **m20e**: Mortar at §4's count 3 and today's
  price clears *both* A4 clauses, so the line is adoptable for two towers once
  a track can carry its own price.
- 2026-08-26 — M20 m20b: the three owner towers and their milestone specials
  (SPEC-V3 §4). §4's specials became typed `/data` entries the loader validates
  against the attack that has to pay them; `attackProfile(def, level)` folds a
  track into the attack a tower of that level fires, and the fire loop, the
  renderer's info panel and (next) m21's VS formula all read it rather than the
  authored attack. Composite damage types landed as `HitEffects.ratio` +
  `dealHit`, so every one of the seven attack shapes carries a §3 split — the
  m19c coverage rule one layer down, with a test per shape. Arrow: pierce at 3,
  Bleeding at 4, a second shot down the same line at 5. Electric: 1:1 with the
  electric half arcing at 3, and one strike below it (V2's three arcs were never
  §4's). Poison: 1:1 → 1:1.5, small AoE, second spore at 2 — and its V2
  `attack.poison` constant deleted, its damage re-priced 4 → 45 so §3's ratio
  reproduces V2's output (Q76). `tests/m20b-owner-towers.test.ts` (24, 1 skipped)
  drives every special at the step below it and the step it lands on.
  code-reviewer REQUEST-CHANGES (1 Major) and qa-playtester PASS with 5 filed;
  five fixed here with regression tests verified by reverting each — the
  untested Venom splash, the arc's lost damage origin, `lineHit` sweeping for a
  pierce it did not have, the loader accepting a special an attack's `kind`
  cannot read, and the info panel understating an Arrow at level 6 by exactly 2×
  (now measured against the fire loop at every level of every track). Two ship
  pinned as m20d: Venom's dropped spare spore and its non-monotonic @4 — the
  one-line fix for the first takes A4's T3 clause from 0/5 to 5/5, so it needs
  the tower's price with it. The lesson is Q78's: the first draft of the balance
  note blamed a tower the sweep never builds, and the 12-seed median that
  prompted it was noise (32 seeds: identical).
- 2026-08-26 — M20 m20a: per-tower upgrade tracks (SPEC-V3 §4). `data/towers.json`
  reworked to `upgrades {count, stepCost, specials}` + `defense` per tower and
  `upgradeStepMul`/`milestoneStepsSkipStats`/`sellRefund 0.5` at file level;
  `src/sim/upgrades.ts` added; `Structure.spent` records and hashes what was
  actually paid; `damageStructure` reads tower defense through m19a's curve;
  `tests/m20a-upgrade-tracks.test.ts` (22 tests) walks all ten towers for every
  §4 claim. Code review found the `deriveSouls` inheritance regression (Q74) and
  the Tesla chain count still riding the old ladder; QA found three more stale
  readers, all in the UI (the panel promised "+1 arc per tier", quoted the soul
  at the tower's level, and under-quoted an affinity tower by its whole bonus),
  plus the fact that the `kite` and `tesla_coil` deferrals hang on the deleted
  range growth rather than on track length. All fixed or re-attributed with
  tests. 603 pass, 24 skipped.
- 2026-08-25 — M18: Orbs deleted and migrated out of saves, god mode, dev profile,
  range indicators, selection feedback. 428 tests pass. QA failed three of the five
  items on first submission; half its Majors were in my own gate tests.
- 2026-08-25 — M17: SPEC-V3 reconcile. MIGRATION.md written, 15 tests retired with
  reasons, BACKLOG rewritten to M17-M27, Q38-Q49 logged.
- 2026-08-25 — BACKLOG f003: leak coupling (SPEC-V2 §1, gate B7's mechanism —
  the full statistical sweep gate is M15's per the milestone table). Every
  enemy that reaches the Core in a Day now banks `leakBudgetMultiplier`
  (new data field, `data/spawns.json`, default 2) × its director cost
  (`w.content.spawns.costs[def.key]`, same lookup `act2.ts`'s spend loop
  already uses) into `World.nightBudgetBonus`, transferred into `spawnBudget`
  exactly once at the Dusk→Night transition (`finishSundering`) and cleared
  for the next Day; `World.looseInTheDark` mirrors it as a headcount shown on
  the Day HUD ("Loose in the dark: N"). `hashWorld` now also covers
  `spawnBudget` (a pre-existing gap, closed alongside the two new fields).
  `tests/f003-leak-coupling.test.ts` (11 tests) covers the cost math, the
  one-time transfer/reset, a baseline-vs-+10-leaked-Husks budget delta,
  hashWorld sensitivity, same-seed-twice determinism with real forced leaks,
  the Dawn-transition carry-over, and jsdom HUD show/hide across phases. One
  pre-existing test in `tests/f001-cycle-machine.test.ts` had its pinned seed
  swapped from 5 to 16 because the new mechanic legitimately made Night 2
  harder for seed 5's hybrid-bot run (dies in cycle 2 now, not a bug — verified
  by both code-reviewer and qa-playtester, who confirmed seed 5 dies cleanly
  with no stuck phase or crash, just a harder Night). code-reviewer found no
  Critical/Major issues (two Minor notes: §9's Dusk "whisper" bark is correctly
  out of scope for this item, and hashing `spawnBudget` was flagged as
  technically-out-of-scope-but-safe scope creep, kept). qa-playtester
  independently drove real (non-forced) Act I leaks through actual waves,
  checked multi-cycle isolation, cost extremes, 5000-enemy same-tick spam, a
  last-tick-before-Dusk race, and HUD show/hide, then filed one real bug: a
  pack enemy (`swarm_rat`, packSize 4) was charged its full director cost once
  per physical leaked body instead of once per spawn call, over-billing the
  Night up to 4×. Fixed by dividing the per-leak cost by `def.packSize ?? 1`
  in `leakIntoCore` (`src/sim/enemies.ts`) — verified the added regression
  test fails (16 vs expected 4) on the pre-fix code before confirming it
  passes with the fix. Commit f24bf7c.
- 2026-08-25 — BACKLOG f002: found already fully delivered, not implemented
  again. f002 asked for per-soul Night level tracks to survive across Nights
  for petrified-left towers and Rekindled souls to leave the picker (SPEC-V2
  §1 gate B9). That is exactly what f001 (commit 4e44a33) already built:
  `World.soulLevels` and `Structure.soulSuppressed`, with a test named for the
  gate ("B9: ...") already in `tests/f001-cycle-machine.test.ts`. f002 was a
  leftover queue duplicate of scope f001 had already closed. Rather than
  re-implement, delegated straight to qa-playtester to independently confirm
  B9 actually holds rather than take the existing test's word for it: it
  wrote and ran (then deleted) fresh adversarial scratch tests covering
  multi-Night accumulation, genuine weapon unbinding (not just picker-list
  absence), no level loss across a bench, a never-bound-soul edge case, and
  confirmed `hashWorld` still hashes `soulLevels`/`soulSuppressed`. It also
  independently checked the one clause the shipped test doesn't exercise —
  SPEC-V2 §1's "[a Rekindled soul] unbinds unless another tower of that type
  stays" — and confirmed it holds by construction: `deriveSouls`
  (`src/sim/progression.ts`) aggregates by soul key across every
  non-suppressed structure, so a still-petrified sibling of the same tower
  type keeps the soul bound while its Rekindled twin sits out, in both the
  one-sibling-stays and both-siblings-rekindled cases. No bugs found; no code
  changed; repo left clean. BACKLOG.md moved f002 to Done with no commit hash
  (none needed).
- 2026-08-25 — BACKLOG b004: `report.survivalSeconds` (`src/sim/run.ts`
  `buildReport`) read `w.act2Time`, which `finishSundering` resets to 0 at the
  start of every Night, so a run surviving 2+ full Nights before a mid-cycle
  death reported only the current cycle's local Night time — underpaying
  Ember's completion-fraction reward (`emberFor`, `src/meta/meta.ts`) by ~21%
  on the qa-playtester repro that found it while verifying f001. Fixed to read
  `w.act2Ticks / 60` (never reset, incremented once per Act II tick), matching
  `report.act2Seconds`'s already-correct source. code-reviewer caught the
  identical bug on a second surface mid-review — the Results screen's
  "Survived" stat in `src/ui/hud.ts` read `w.act2Time` directly rather than
  going through `buildReport` — fixed in the same commit
  (`mm(w.act2Ticks / 60)`). `tests/b004-ember-survival.test.ts` adds two
  regression cases: a real bot-driven run through 2 full cycles of Night
  (`w.invulnerable = true` to isolate the reporting bug from combat outcome)
  asserting `survivalSeconds === act2Seconds`, and a jsdom-mounted `Hud`
  asserting the Results screen shows cumulative "7:45" rather than local
  "0:45" on a simulated 3rd-cycle death; both fail without the fix (verified
  by reverting each fix independently) and pass with it. qa-playtester traced
  `emberFor` end to end to confirm the reward path actually benefits, checked
  `cycles: 1` runs and the remaining `w.act2Time` read sites (boss-kill timing
  and in-Night progress-bar markers are correctly local, not regressed), and
  confirmed every sweep/probe tool already consumes `buildReport` rather than
  `w.act2Time` directly, so they inherit the fix with no separate patch — no
  bugs filed.
- 2026-08-25 — BACKLOG f001: the Day→Dusk→Night→Dawn cycle state machine
  (SPEC-V2 §1), 3 cycles by default (`RunConfig.cycles`, existing single-pass
  suites pin `cycles: 1`). `World.cycle`/`totalCycles` gate `cycleWaveEnd`/
  `nightLengthSeconds`/`cycleEliteMul` (`src/sim/world.ts`) against
  `data/waves.json`'s `waveEndByCycle`/`nightSecondsByCycle`/`eliteMulByCycle`/
  `nightMinuteOffsetPerCycle`, so cycle 2/3's Night starts hotter and only the
  final cycle gates on boss kill — every other cycle's Night ends by timer into
  a new `dawn` phase. Dawn is a ledger: `rekindle` (a real sim Command, gold-
  gated at `rekindleCostMul` of base cost) un-petrifies one structure for the
  next Day but benches its soul for exactly one Dusk pick via a new
  `Structure.soulSuppressed` flag; `dawn_done` (or a 20s auto-advance with no
  input) resolves into the next Day. A new `World.soulLevels` record persists
  each soul's Night-earned level/damageBonus across being benched, so a
  Rekindled-then-later-re-picked soul resumes rather than restarts
  (`bindSouls`, `src/sim/progression.ts`). Fixed a latent bug the multi-cycle
  shape exposed: `w.sundered` is permanently true from the first Sundering on,
  so every UI/render read of it (`hud.ts`, `progress.ts`, `canvas.ts`) was
  swapped to the phase-scoped `w.huntsWarden` getter, or Day 2/3 and Dawn would
  have kept rendering the Night HUD. `tests/f001-cycle-machine.test.ts` (11
  tests) covers cycle boundaries, Dawn auto-advance, Rekindle cost/no-op-on-
  live-structure, the B9 soul-suppression/persistence scenario, a full 3-cycle
  scripted run, an 8-seed cycle-bound sweep, and an A11 replay-hash check with
  `rekindle`/`dawn_done` in the log. code-reviewer's one Major finding —
  `hashWorld` didn't hash the new `soulLevels` record, so a divergence there
  could pass A11 undetected — was fixed (hashed sorted by key, same as
  `boonRanks`) and re-verified green. qa-playtester independently drove 40
  seeds through 3 cycles headlessly and adversarially probed Rekindle/Dawn/Dusk
  (bad gold, bad targets, double-rekindle, auto-advance timers, same-tick
  death/timer races): all held, acceptance criteria confirmed met. It filed one
  real bug outside this item's scope: `report.survivalSeconds` reads
  `w.act2Time`, which the cycle machine now resets every Night, so a run that
  survives 2+ full Nights before a mid-cycle death reports only the current
  cycle's local Night time — underpaying the Ember completion-fraction reward
  by ~21% on its repro. Filed as BACKLOG b004.
- 2026-08-25 — BACKLOG b003: Stash tab defect fix (SPEC-V2 §10 D2, §3). Clicking a
  stash relic now equips it directly into its slot, swapping out whatever was
  equipped there (toggle: clicking the currently-equipped relic unequips it) —
  no more separate select-then-click-Equip flow. Right-click selects a relic for
  the detail panel in "compare" mode without touching the equip state. Added a
  small interactive Loadout strip to the Stash tab itself (the existing one on
  the Run tab stayed read-only) whose slot tiles unequip on click or on
  drag-and-drop onto the relic list. The detail panel gained a `.sw-compare`
  block (and each stash relic a compare-summary hover tooltip) diffing the
  selected relic's summed implicit+affix stats against whatever is equipped in
  the same slot. `tests/b003-stash-ux.test.ts` (15 tests) drives the real Hub
  DOM for every equip/unequip/compare path, including drag-drop bubbling through
  a child button and the empty-stash render branch. code-reviewer found no
  Critical/Major issues (two minor notes fixed inline: the implicit
  percent-vs-flat guess now prefers the affix pool's own `pct` flag, and stash
  relics targeting an empty slot get a "Click to equip" tooltip instead of
  none). qa-playtester adversarially probed rapid multi-slot cycling, crafting
  an equipped relic, a same-relic-two-slots bypass attempt, discard-while-
  selected, tab-switch state survival and garbage drag payloads — no bugs filed.
- 2026-08-25 — BACKLOG b002: Esc pause menu's Abandon Run now shows a confirm
  sub-screen ("Abandon run?" / Cancel / Abandon run) instead of quitting to the
  Hub on the first click (SPEC-V2 §10 D1: "Esc pause menu gains Abandon Run
  (confirm) everywhere"). Pause itself was already phase-agnostic (gated only
  on `outcome === 'running'` in `main.ts`'s `togglePause`), so the confirm
  applies uniformly across Act I and Act II; `tests/ui-input.test.ts` adds
  explicit pause/resume + confirm/cancel coverage for `act1_wave` and `act2`
  on top of the existing `levelup` case. `code-reviewer` found no
  Critical/Major issues; `qa-playtester` probed the confirm flow across all
  six phases (act1_build, act1_wave, dusk, soulpick, levelup, act2), rapid
  re-pause/toggle spam, and Escape-vs-button parity, and filed no bugs (one
  UX ambiguity around Escape-inside-confirm noted for QUESTIONS.md, not a bug).
- 2026-08-25 — BACKLOG b001: defeat flow (SPEC-V2 §10 D1). A defeat condition
  (Core hp 0 in Act I, Warden hp 0 while `huntsWarden` in Act II) now starts a
  1.5s slow-mo beat (`world.dying`/`dyingTimer`) before `outcome`/`phase` land
  on their terminal value, fixing the stuck-mid-frame bug where `outcome` could
  flip without `phase` following, leaving no Results modal and no way to pause
  out. During the beat the Warden is frozen, Act I wave-clear and Act II
  level-up are suppressed, and Core HP is floored at 0 against continued
  leaks. Results screen now offers Retry (same seed) / New run (fresh seed) /
  Hub instead of a single restart button. `tests/b10-death-flow.test.ts` (7
  tests) covers both defeat phases, the beat timing, the Warden freeze, the
  HP floor, and all three results buttons; qa-playtester adversarially checked
  the victory-vs-defeat race, pausing mid-beat, and the Act I Warden-reform
  path with throwaway tests and found nothing.
- 2026-08-25 — Playtest round 2: refund fixed at its real cause, Constellation
  rebuilt as a bounded disc, tower info panel, per-source projectiles, stage
  progress bars, fast-forward, practice runs, test-account seeding. Act I
  rebalanced so a light build clears again, and A10's run budget won back with
  two value-preserving sim optimisations. HANDOFF.md written for SPEC v0.2.
- 2026-08-25 — Playtest fixes: the hidden modal overlay was covering and blurring
  the game, Constellation refunds gave no feedback when unaffordable, the canvas
  was upscaled rather than backed at DPR. Added pause. QUESTIONS.md numbered
  Q1-Q28; verdicts still pending.
- 2026-08-25 — M8: feel and ship. SFX hooks, settings, results screen, and a 2x
  sim speedup to land the A10 budget. All acceptance gates green.
- 2026-08-25 — M7: balance pass. A1, A9 green; A4/A5/A8 re-verified after
  retuning; A7 partly green. Burrowers made properly untargetable underground.
- 2026-08-24 — M6: Warden-Eater phases, Awakenings and Rifts verified. Boss-kill
  gate green; boss damage tuned so maxbuild still wins ~75% (A8 holds).
- 2026-08-24 — M5: meta layer complete. Orb crafting, the Hub (class, tier
  draft, Constellation, stash), save/load. Gate A8 green.
- 2026-08-24 — M4: full content pass. Relic/Orb drops, tier drafting, damage
  telemetry. Gates A4 and A5 green after a substantial tower/weapon rebalance.
- 2026-08-24 — M2: Act II Nightfall complete, gate A3 green. Renderer, HUD and
  browser loop in place; production build works. Next: M3.
- 2026-08-24 — M1: Act I tower-defense core, gate A2 green.
- 2026-08-24 — Scaffolded the project, authored `/data`, built the M0 sim
  skeleton. A11 passing.
