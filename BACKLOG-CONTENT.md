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

Read anything. Everything else is read-only: an out-of-scope need is
written into the Log below and becomes main-lane (or other-lane) work at
the merge — never edited from this lane.

## Queue

**Every one of the five owner items below is BLOCKED on a path outside this
lane's Scope** (verified 2026-09-03, see the Log for the exact file and
assertion in each case). They stay here, in the owner's order, and must be
executed from the main lane or after the merge widens this Scope. The
generation rule (CLAUDE.md, "fewer than 3 actionable items remain") was run
scoped to this lane and appended `c001`-`c005` below them.

### Actionable in this lane

- [x] (c001) [bug] **DONE 2026-09-03.** class Actives ignore the `area` stat. SPEC-FINAL §2's stat
      table says Area "applies to every attack, active, and effect", and
      `towers.ts`, `vswield.ts`, `damagetypes.ts` and `enemies.ts` all scale
      their radii by `w.derived.areaMul` - but `src/sim/classes.ts` never
      reads it once, so every kit radius (Circle Slash's nova, Poison
      Barrel's cloud, Frost Nova, Time's r7 pulse, Time Lock's zone,
      Judgement, Clarion Taunt, Ice Wall/summon radii, the dash widths) is
      used exactly as authored. Normal Bracelet's +10% area, Animist's own
      Wide Grove and every `area` tree/boon source are dead for all 24
      Actives. Per CLAUDE.md rule 3 this is code contradicting SPEC-FINAL, so
      it outranks the queue. Acceptance: a failing-first regression test
      (`tests/class-area-stat.test.ts`) shows an `area`-boosted world firing
      an Active at its authored radius; after the fix every class Active's
      effective radius is authored x `areaMul`, asserted per kind across the
      12 kits, with the un-boosted (`areaMul === 1`) radius unchanged so no
      gate baseline moves; `npm run test:fast` green - refs: SPEC-FINAL §2
      (Area row), §4.1, §4.2.

- [ ] (c004) [bug] Animist's passive is missing half its SPEC-FINAL §4.2
      clause. §4.2's Animist row reads "aura effects also affect summons;
      **summon cap +1**"; `data/classes.json`'s Kinship row authors only the
      aura half (`"description": "Aura effects also affect summons."`,
      `mods: {}`), and the three summon-cap sites in `classes.ts` add only
      `classLineBonus`. Acceptance: a regression test spawns Animist spirits
      past the authored `summonCap` and asserts the live cap is
      `summonCap + 1` for the Animist and unchanged for Engineer/Necromancer;
      the +1 is expressed on the passive in `/data` rather than a class-key
      check in code - refs: SPEC-FINAL §4.2 (Animist).

- [ ] (c002) [balance] G8's diversity clause has no item scoped to it.
      STATUS.md: "top damage source is still only 2 distinct keys
      (`ballista`/`spreading_plague`) across all 12 classes, far under the
      >=9/12 the gate asks for", and win-rate retunes (p10s) moved nothing
      because towers, not kits, do the winning. Raise kit damage share in
      `data/classes.json` only (the win-rate half is main-lane p10r).
      Acceptance: a lane-owned test measures the top damage source per class
      over >=12 seeds and reports the distinct-key count before and after, as
      a control-run pair per CLAUDE.md's measurement rules; the count rises
      and no class leaves the 35-70% band it is already in - refs: §14 G8, §4.

- [ ] (c003) [bug] Time Lord has never been run through G8's per-class
      win-rate case. `tests/p6e-class-diversity.test.ts`'s own header: "Time
      Lord has not been run through it"; STATUS.md counts 11 of 12 classes
      measured. Acceptance: a lane-owned `tests/class-time-lord-band.test.ts`
      measures 12 seeds with the same scripted kit bot and records the real
      number in its comment (the assertion may land `.skip`-ed with its
      measurement, exactly as p6e's other eleven do, rather than forcing a
      tune) - refs: §14 G8, fb013.

- [ ] (c005) [polish] no test proves a class Active is not a silent no-op.
      The loader refuses *unpayable* kit data (`REQUIRED_EFFECT_FIELDS`), but
      nothing proves the 24 authored Actives each produce an observable
      effect at runtime - the exact failure `useClassActive`'s own comments
      say bit p6b twice (a cooldown consumed by an unhandled kind). Acceptance:
      `tests/class-kit-liveness.test.ts` fires each of the 12 classes'
      Active1 and Active2 in a real `World` with enemies present and asserts
      each one changes at least one observable (enemy hp/status, `w.areas`,
      `w.classSummons`, `w.structures`, Warden position/hp) and that a kind
      removed from the dispatch switch fails the test - refs: SPEC-FINAL §4,
      HANDOFF §7.

### Blocked out of Scope (owner items, unchanged order)

- [ ] (fb056) [feat] top priority: add 15 class-specific equipment items to
      `data/equipment.json` and the loot table per the owner's full table
      (Plaguebringer set of 6: Plague Flask/Miasma Robe/Carrier's Boots/
      Ring of Contagion/Pestilent Locket/Blightweaver Band; Time Lord set
      of 6: Hourglass Scepter/Chronomail/Sandals of the Second Hand/Loop
      Ring/Pendulum Pendant/Bracer of Overlap; Swordsman set completion,
      3 more: Ring of a Thousand Cuts/Duelist's Pendant/Bracer of the
      Whirlwind) — full stat lines and effects as specified in the owner
      feedback file, each with an "if not <class>" basic-stat compensation
      line. Acceptance: all 15 items load, drop from the loot table, and
      equip; every effect line (including each set's headline synergy
      interaction and one "if not class" fallback per set) has a unit
      test; tooltips show sentence-form descriptions with live numbers;
      the Codex lists all 15 — refs: SPEC-FINAL §7 (equipment table, append
      rows), §8.1 (loot table), owner feedback
      `feature-class-equipment-sets`.

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

- [ ] (fb061) [feat] normal priority: Plaguebringer's Active1 Poison
      Barrel becomes a charge skill (same hold/release model as Circle
      Slash): hold up to 2s ⚖ charge, scaling cloud radius x1->x2 ⚖ and
      duration from a base 8s (up from 5s) to a 14s ⚖ max; poison per
      second unchanged; Active2 Poison Boost stays instant. Interacts with
      `fb062`'s cadence pin (must stay 1s regardless of charge level).
      Acceptance: hold/release works with a charge indicator ring; radius
      and duration scale with charge level per test; numbers land in
      `/data` only — refs: SPEC-FINAL §4.1 (Plaguebringer, amends), owner
      feedback `feature-plaguebringer-charge`.

- [ ] (fb062) [feat] normal priority: pin down and enforce Poison Barrel's
      every-second poison mechanic regardless of current code: every 1s
      tick, every enemy inside gets one Poison application seeded by the
      skill's `damage` field (120% of `damage` over 3s, stacking cap 3,
      refresh-shortest per SPEC-FINAL §3); the barrel deals zero direct
      damage of its own (ignores armor, no lifesteal, counts as character
      DoT for Spreading Plague and Poison Boost's doubling); entering
      mid-duration applies at the next tick, leaving stops new
      applications but running stacks finish normally; cadence stays 1s
      across `fb061`'s charge-duration range. Acceptance: a unit test
      places one enemy in the barrel for its full duration and asserts one
      application per second, stack cap 3, total damage matching the
      formula; a second test asserts zero normal damage/lifesteal from the
      barrel; a tooltip text test matches the owner's sentence-form
      wording with live numbers — refs: SPEC-FINAL §4.1 (Plaguebringer),
      §3 (Poison), owner feedback `feature-poison-barrel-mechanic`.

## Log

- (2026-09-03, lane split) Known cross-lane touchpoints to expect here
  rather than edit: class registration in shared sim files
  (`src/sim/content.ts` et al.), loot-table wiring outside
  `data/equipment.json`, class-select/Codex/dev-profile UI (UI lane),
  charge-indicator/tooltip rendering for fb061/fb062 (UI lane), and any
  G8 gate-test threshold change (`tests/p6e-class-diversity.test.ts` is
  main-lane). Also: main-lane item p10u names `data/classes.json`/
  `data/towers.json` — expect a coordination point at merge.

- (2026-09-03, session 1) **All five owner items are blocked out of Scope.**
  Each was traced to the specific path it needs, and none of those paths is
  in the Scope list above. Recorded here per the lane rule; each becomes
  main-lane work, or needs the merge to widen this Scope.

  - **fb056** (15 class equipment items) — three separate blockers:
    1. `tests/fb015-equipment.test.ts` **pins the equipment census at
       exactly 12 keys**: `expect(content.equipment.items).toHaveLength(12)`,
       `filter(slot).toHaveLength(2)` per slot, and two hardcoded key/mods
       tables (`EXPECTED_ITEM_MODS`, `EXPECTED_FALLBACK_MODS`) compared with
       `toEqual`. Adding *any* row to `data/equipment.json` turns that file
       red (verified: 4 failed / 34 passed), and `tests/fb015-*` is not
       `tests/equip-*`, so this lane cannot fix it. **`data/equipment.json`
       is effectively frozen for additions from this lane.**
    2. Three of the fifteen effect lines have no hook inside `classes.ts`:
       *Ring of Contagion* (Spreading Plague's fan-out count is
       `const targets = 1 + Math.round(classLineBonus(w))` in
       `drainPlagueTransfers`, `src/sim/enemies.ts`); *Chronomail* (Time
       Flow's conversion window, `src/sim/run.ts` ~L577-624); *Bracer of
       Overlap* ("Time Lock can hold 2 zones" - `w.timeLockZone` is a single
       nullable field on `World`, `src/sim/world.ts`).
    3. `EquipmentItem.effectKey` is a **closed zod enum** in
       `src/sim/content.ts` (`'none' | 'sleeve_sword' | 'swordsman_armor' |
       'swordsman_shoes'`). Note for whoever picks this up: nothing reads
       `effectKey` at runtime — `sim/equipment.ts` gates on `hasEquipment(w,
       key)` and the UI (`ui/equipment-info.ts`) renders purely from `mods`/
       `classFallback`/`effectNote`/`effectNoteWith` — so the enum is
       documentation, and the *other* two acceptance clauses come free:
       drops already pick uniformly from every row (`run.ts` L848) and the
       Codex/tooltips are already fully data-driven.

    Also found while scoping it, for whoever implements: `data/equipment.json`
    has **no free-form numeric field for an effect's own magnitudes** (`mods`
    is a validated `Stats` record), which is why `swordsman_shoes`' "double
    Dash Slash distance" is a literal `2` in `fireDashSlash`. An
    `EquipmentItem.effectNums: Record<string, number>` would let fb056's
    fifteen sets of numbers live in `/data` per architecture rule 4; it is a
    `content.ts` edit.

  - **fb057** (Madness King) and **fb059** (Voltbolt) — both need new
    `passive.kind`/`active.kind` members of `content.ts`'s closed enums plus
    their `REQUIRED_*_FIELDS` rows, a new `madness` status on `Enemy`
    (`src/sim/types.ts`) with its own targeting/movement in `enemies.ts`, and
    the roster/registry housekeeping their own acceptance lists name
    (Codex, dev profile, class-select, attack-sprite registry — all UI lane).
    Note also that `tests/fb015-equipment.test.ts`-style census pins exist
    for classes too: any roster change needs `tools/content-census.ts`'s
    readers checked.

  - **fb061** (Poison Barrel becomes a charge skill) — the sim half is
    reachable (`isChargeKind`/`tickClassCharge`/`firePoisonBarrel` are all
    in `classes.ts`, and `chargeCapSeconds`/`minRadius` already exist on the
    effect schema, with `REQUIRED_EFFECT_FIELDS` being a *required*-list not
    an allowlist), but the **duration** half is not: scaling 8 s -> 14 s
    needs a zero-charge duration floor beside `groundDurationSeconds`, and
    no such optional field exists on `ClassEffectSchema` — inventing one is
    a `content.ts` edit, and hardcoding 8/14 in `classes.ts` contradicts the
    item's own "numbers land in `/data` only" acceptance. Secondary:
    `canvas.ts`'s `drawChargeIndicator` branches on `charge_nova`/
    `charge_pierce` only, so a charging barrel would render no ring (UI lane,
    already anticipated above).

  - **fb062** (Poison Barrel's 1 s cadence) — the barrel's damage is applied
    by `updateAreas` in `src/sim/combat.ts`, which calls
    `applyPoison(w, e, a.dps * scale, 1.0, 3, a.source)` **every tick** (60
    Hz), not every second. Pinning the cadence is a `combat.ts` edit; there
    is no `classes.ts` hook on a ground area's tick. Worth flagging as a real
    live defect regardless of this item: SPEC-FINAL §4.1 says "applying
    poison damage every second" and the barrel currently re-applies 60x per
    second (stack cap 3 bounds the damage, but the refresh cadence and the
    `refresh: "shortest"` interaction are both wrong).

- (2026-09-03, session 1) Generation rule run scoped to this lane (all five
  owner items blocked => 0 actionable). Grounded in STATUS.md's live gate
  table (G8 red, its diversity clause explicitly "has no item scoped to it
  yet") and a coverage diff of `data/classes.json` against `src/`. Two
  findings became `c001`/`c004`; a third — every field authored in
  `data/classes.json` is read somewhere in `src/` (checked mechanically, zero
  dead fields) — is clean and needs no item.

- (2026-09-03, session 1) **c001 done** — SPEC-FINAL §2's Area row now reaches
  the class kits. `classArea(w, radius)` in `src/sim/classes.ts` routes 16
  effects (18 call sites): the `burst_damage`/`charge_nova`/`ground_poison`/
  `frost_nova`/`clarion_taunt`/`judgement`/`time_mark`/`time_lock`/
  `recall_totem`/`dash_trail` radii, the `dash_line`/`dash_heal`/
  `charge_pierce` perpendicular half-widths, Contagious Flame's touch radius,
  the character basic attack's splash, and the Necromancer skeleton's cloned
  `aoe`. Every site scales the emitted event radius too, so a cast flash
  matches what landed. `tests/class-area-stat.test.ts` (27 tests) is
  failing-first — 12 of its 21 original assertions were red pre-fix, and the
  9 that passed are exactly the ones that should have (the harness-honesty
  check, the "length is not scaled" check, and the un-boosted baselines).

  **Deliberate exclusions**, pinned by tests rather than left to prose: dash
  travel distances, line *lengths* (Deadeye Draw's reach is Range, §2's other
  stat), and target-search/cast-reach radii (Chain Surge's jump, Field Kit's
  and Blood Tithe's structure search, Raise Skeletons' corpse sweep).

  **The one exception**, now pinned as a decision rather than an accident:
  `fireDashSlash`'s `hitRange = dashRange + mergedRadius` does let Area extend
  a hit line, because G9 reads a mid-charge merge as the nova's would-be
  radius widening the dash's line. The dash's own travel stays unscaled.

  Verification: `tests/class-area-stat.test.ts` 27/27, the five class suites
  + `g2-determinism` 247/247, `npm run test:fast` 2087 passed / 8 failed —
  all 8 in the pre-declared set (`q15` x3, `q49`, `q52` confirmed
  pre-existing by a control run at the parent commit; `b032`/`b034`/`b036`/
  `q45` the documented Playwright/EPERM-under-load flakes, green standalone).

  **Balance blast radius, measured as a control-run pair** (qa-playtester;
  note that *no stock bot in `src/bots/` ever issues a class Active*, so
  `tools/sweep.ts` is structurally blind to this change — the p6e/G8 scripted
  kit harness was used instead, 6 classes x 3 seeds, `cycles: 6`, full tree,
  areaMul 1.2984):

  | metric | before | after |
  |---|---|---|
  | win rate | 18/18 | 18/18 |
  | waves cleared | 18 every seed | 18 every seed |
  | mean kills | 25,941 | 26,095 (+0.6%) |
  | mean run length | 2001.6 s | 1995.4 s (-0.3%) |
  | mean own-kit damage | 462,649 | 665,134 (+43.8%) |
  | mean own-kit damage share | 0.971% | 1.479% |

  No gate moved: G8's one un-skipped pin (`distinct.size === 2`,
  `tests/p6e-class-diversity.test.ts`, 1860 s) is still green, and G1/G14/G23
  are `classKey: 'engineer'`-locked with engineer bit-identical on 4/4 seeds.
  Determinism holds (100-seed replay-hash suite green); 3 of 32 before/after
  seed hashes diverge, all via the basic-attack splash and the Pyro/Cryomancer
  passives, which fire without a Command — the intended behaviour change.

  Two acceptance-clause caveats worth stating plainly rather than burying:
  (1) the item said "the un-boosted (`areaMul === 1`) radius unchanged so no
  gate baseline moves" — radius identity holds exactly, but the *Animist* is
  never un-boosted (see the next entry), so its baseline did move by +10%;
  (2) "asserted per kind across the 12 kits" is now met for all 16 scaled
  sites after code review and QA both found four unasserted.

- (2026-09-03, session 1) **c001 follow-ups that are out of this lane's
  Scope.** All found by code-reviewer/qa-playtester on c001; none block it.

  **UI lane** (`BACKLOG-UI.md`) — three renderer/UI paths read the authored
  `/data` radius directly and now preview a footprint the sim no longer uses.
  The first is a real regression this item introduced and has a written repro:
  - `src/render/canvas.ts` `drawChargeIndicator` draws
    `circleSlashValues(cls.active1, wd.active1Charge).radius` unscaled, so
    Circle Slash's charge ring under-draws the real nova. Measured
    `drawn=4 fired=4.4` with just a Normal Bracelet equipped (areaMul 1.1);
    the gap reaches ~2.6x at a real end-of-run areaMul. This is the one
    preview fb016 specifically built to be backed by live sim state.
    Regression test belongs beside fb016-vfx-registry's existing
    "charge indicator brightens with hold" case.
  - `src/render/canvas.ts` `drawSkillHoverRing` draws `eff.radius` unscaled.
  - `src/ui/hud.ts` `characterAbilitiesMarkup`'s comment "everything else
    (radius, ...) has no live sim equivalent to resolve through" is no longer
    true — `w.derived.areaMul` is exactly that equivalent.

  **Main lane** (`BACKLOG.md`) —
  - `src/sim/combat.ts`'s `lineHit` broadphase uses a constant
    `range * 0.5 + 2` margin, so once a scaled `halfWidth` exceeds ~2 the
    footprint saturates into a lens and the outermost enemies stop being hit.
    Measured first-miss thresholds: `dash_line` at areaMul 4, `dash_heal` at
    5, `charge_pierce` at 21. `boon:reach` is `"uncapped": true` in
    `data/vsupgrades.json`, so a long VS run reaches this; organic peak over
    standard T1 `cycles: 6` runs is 1.30-3.95 today, so it is latent but
    live. Fix is `range * 0.5 + halfWidth + 2`. **The identical hand-rolled
    copy inside `fireCrimsonRush` (classes.ts) was in Scope and is fixed and
    tested here**; only the `combat.ts` one remains.
  - `src/sim/towers.ts` passes `LINE_HALF_WIDTH` to `lineHit` raw while
    `src/sim/vswield.ts` passes it `* areaMul`. c001 aligned the class side
    with `vswield`, leaving tower beam widths the lone outlier. Also worth
    correcting c001's own premise: "towers.ts scales its radii by areaMul" is
    true for `aura`/`lob`/`poison` attacks, not for line towers.

  **Needs a QUESTIONS.md entry** (main lane; lane sessions leave that file
  alone) — two tower-scoped passives are authored with the *global* `area`
  stat key, because there is no tower-only Area key today (`towerRange`,
  `towerDamage`, `towerHp` etc. all exist; `towerArea` does not). Before
  c001 that over-grant was invisible to the kits; now it widens the caster's
  own Actives:
  - `animist.towerPassive` "All towers +10% area" (`data/classes.json`) —
    the Animist therefore has no `areaMul === 1` baseline at all. This one is
    deliberate and documented in `tests/class-area-stat.test.ts`.
  - `time_lord.towerPassive` Chronal Surge, "+10% AoE area" every 2 TD waves,
    applied as `w.stats.add(source, 'area', 0.1)` in `run.ts` and
    **uncapped**. Measured at the end of a standard seed-2 `cycles: 6` run:
    areaMul 3.203, of which +90% is Chronal Surge alone — turning Time's
    authored r7 mark into a 22.4-tile pulse on a 36x20 board. Unpinned by any
    assertion today. The owner should decide whether a "all towers" passive
    may widen the character's kit; the spec-consistent fix is a `towerArea`
    stat key (`statkeys.ts` + `towers.ts`, both out of Scope).
