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
written into the Log below and becomes main-lane (or other-lane) work at
the merge — never edited from this lane.

## Queue

**Every one of the five owner items below is BLOCKED on a path outside this
lane's Scope** (verified 2026-09-03, see the Log for the exact file and
assertion in each case). They stay here, in the owner's order, and must be
executed from the main lane or after the merge widens this Scope. The
generation rule (CLAUDE.md, "fewer than 3 actionable items remain") was run
scoped to this lane and appended `c001`-`c005` below them. Run again in
session 2 (c005 was the last actionable one left), appending `c006`-`c010`.
Run again 2026-09-06 (`c029` was the last actionable one left, all of
`c001`-`c031` now Done/Skipped/Blocked), appending `c032`-`c036`.
Run again 2026-09-07 (`c036` was the last actionable one left, all of
`c032`-`c036` now Done — see the Log), appending `c037`-`c041` below the
owner items.

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

- [ ] (c004) [bug] **BLOCKED out of Scope 2026-09-03 — see the Log.** Animist's passive is missing half its SPEC-FINAL §4.2
      clause. §4.2's Animist row reads "aura effects also affect summons;
      **summon cap +1**"; `data/classes.json`'s Kinship row authors only the
      aura half (`"description": "Aura effects also affect summons."`,
      `mods: {}`), and the three summon-cap sites in `classes.ts` add only
      `classLineBonus`. Acceptance: a regression test spawns Animist spirits
      past the authored `summonCap` and asserts the live cap is
      `summonCap + 1` for the Animist and unchanged for Engineer/Necromancer;
      the +1 is expressed on the passive in `/data` rather than a class-key
      check in code - refs: SPEC-FINAL §4.2 (Animist).

- [ ] (c002) [balance] **SKIPPED 2026-09-03, blocked on the Q161 owner
      verdict. Control half measured in session 2 (see the Log); the tune
      half is not started, and this item's own premise needs revisiting
      first.** G8's diversity clause has no item scoped to it.
      STATUS.md: "top damage source is still only 2 distinct keys
      (`ballista`/`spreading_plague`) across all 12 classes, far under the
      >=9/12 the gate asks for", and win-rate retunes (p10s) moved nothing
      because towers, not kits, do the winning. Raise kit damage share in
      `data/classes.json` only (the win-rate half is main-lane p10r).
      Acceptance: a lane-owned test measures the top damage source per class
      over >=12 seeds and reports the distinct-key count before and after, as
      a control-run pair per CLAUDE.md's measurement rules; the count rises
      and no class leaves the 35-70% band it is already in - refs: §14 G8, §4.

- [x] (c003) [bug] **DONE 2026-09-03.** Time Lord has never been run through G8's per-class
      win-rate case. `tests/p6e-class-diversity.test.ts`'s own header: "Time
      Lord has not been run through it"; STATUS.md counts 11 of 12 classes
      measured. Acceptance: a lane-owned `tests/class-time-lord-band.test.ts`
      measures 12 seeds with the same scripted kit bot and records the real
      number in its comment (the assertion may land `.skip`-ed with its
      measurement, exactly as p6e's other eleven do, rather than forcing a
      tune) - refs: §14 G8, fb013.

- [x] (c005) [polish] **DONE 2026-09-03.** no test proves a class Active is not a silent no-op.
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

- [x] (c006) [bug] **DONE 2026-09-03.** no test proves a class *Passive* is not a silent no-op —
      c005's twin for the other §4 slot. Three of the twelve passive rows in
      `data/classes.json` author `mods: {}` with **no `kind`** (Archer *Long
      Draw*, Stormcaller *Conduction*, Animist *Kinship*), so nothing binds
      them to code at all: two are in fact implemented off their `active1`
      fields (`classes.ts` L592 `pierceCap`, `chainGrowth`/`chainCap`), and
      *Kinship*'s aura half works only incidentally, because the Recall Totem
      is the game's only aura and `updateClassSummons` happens to apply
      `auraSpeedMul` to summons (`classes.ts:1515`). Acceptance:
      `tests/class-passive-liveness.test.ts` proves each of the 12 passives
      changes an observable in a real `World`, or — for the three prose-only
      rows — pins the exact `active1`/`active2` field its clause really lives
      on with a named reason; *Kinship*'s aura half gets its own assertion
      (a totem's `auraAtkSpdMul` reaching a `ClassSummon`'s `attackCooldown`
      at `classes.ts:1515`, not only the Warden's at :1817), and its missing
      summon-cap half is cross-referenced to `c004` rather than re-filed
      - refs: SPEC-FINAL §4.1/§4.2, c005.

- [x] (c007) [polish] **DONE 2026-09-03.** the *whiff policy* for the 24 Actives is unpinned. Six
      kinds (`repair_heal`, `blood_tithe`, `death_pact`, `manifest_spirit`,
      `chain_lightning`, `ice_wall`) return `true` from `useClassActive`/
      `useClassActive2` even when their fire function early-returns with
      nothing to act on, so they pay a full cooldown for nothing; c005's
      report loop proves the dispatch matched but says nothing about the
      payment. Exactly one of the six is pinned today
      (`tests/p6d-nine-classes.test.ts`: Ice Wall "still pays its cooldown
      when no tile could be placed"), so a refactor can flip the other five
      silently, in either direction, and no test would notice. Acceptance:
      `tests/class-kit-whiff.test.ts` fires all 24 in a deliberately empty
      `World` (no enemies, no structures, no corpses, no banked Wrath) and
      records per Active whether it pays its cooldown/charge; every row is an
      explicit expectation carrying a one-line rationale, and the Ice Wall row
      agrees with p6d's existing assertion - refs: SPEC-FINAL §4, c005.

- [x] (c008) [bug] **DONE 2026-09-04.** `data/classes.json` has drifted from SPEC-FINAL §4.2's
      *stated* numbers in at least four places, and nothing distinguishes a
      logged tune from drift. Paladin *Guardian Stance* is authored
      `stanceArmor 50` / `stanceSeconds 0.5` / `wrathFraction 0.80` against
      §4.2's "+30 defense after standing still 1 s ... 60% of damage taken
      stores into Wrath"; *Judgement* `wrathDamageMul 2.20` against "stored
      x1.5"; Bloodlord *Sanguine Pact* `towerDamage 0.04` against "all towers
      +10% damage, -10% max HP"; Necromancer *Raise* `summonDurationSeconds
      24` / `summonStatMul 0.65` against "cap 8, 15 s, 40% of char attack".
      §4's header marks only the band->number mapping ⚖, not these explicit
      figures. Acceptance: `tests/class-spec-numbers.test.ts` carries every
      §4.1/§4.2 figure as a table with, per row, either a match against
      `data/classes.json` or a named deviation carrying the item/Q-number that
      authorised it; a figure with neither fails. **This item changes no
      number** — it makes the drift visible so a later balance pass (p10r,
      main lane) can decide - refs: SPEC-FINAL §4.1/§4.2, CLAUDE.md rule 3.

- [x] (c009) [polish] **DONE 2026-09-04.** the **tower-passive** slot is the one §4 slot with no
      liveness test. c005 covers Active1/Active2 and c006 the passive; the 12
      `towerPassive` rows have nothing. Three are target-conditional
      (`towerExtraElectricPct`, `towerDamageVsBurning`, `towerDamageVsChilled`
      — resolved once per volley in `towers.ts`' `classTowerBonus`), one is
      `kind`-driven (`chronal_surge`), one is authored with the *global*
      `area` key for want of a `towerArea` (Animist *Wide Grove*, logged
      below), and Bloodlord's is the only one carrying a negative term.
      Acceptance: `tests/class-tower-passive-liveness.test.ts` proves each of
      the 12 measurably changes a built tower's behaviour (damage / range /
      attack speed / max HP / armor) against the same tower under a class that
      authors none, and that the three conditional rows apply only under their
      condition - refs: SPEC-FINAL §4.1/§4.2, §14 G8, c005.

- [ ] (c010) [balance] **BLOCKED out of Scope 2026-09-04 — see the Log.**
      Stormcaller *Conduction* is authored on the wrong row.
      The passive names a rule about electric damage *generally* ("+20% per
      jump, compounding, cap 8 jumps"), but its two numbers live only on
      `active1` (`chainGrowth`/`chainCap`), leaving the passive row prose with
      `mods: {}` and no `kind` — so Chain Surge is the only electric thing
      that compounds, and *Live Wire*'s "+10% of their damage as extra
      Electric" and the VS electric wire grid get none of it. Acceptance: the
      two numbers move onto the passive row in `data/classes.json` and
      `fireChainSurge` reads them from there (architecture rule 4: content
      shapes live in `/data`); G11's x3.6 ceiling
      (`tests/p6d-nine-classes.test.ts`) is re-measured unchanged as a
      control-run pair; whether *tower* electric should also compound is
      **logged for the main lane**, not implemented from here (`towers.ts`/
      `vsspecials.ts` are out of Scope) - refs: SPEC-FINAL §4.2, §14 G11.

- [x] (c011) [polish] **DONE 2026-09-04.** passive **magnitudes and lifetimes** are unpinned —
      `c006`'s completeness half, deliberately left out of it. c006 proved
      all 12 passives fire; it asserts direction and presence only, so a
      passive can keep firing with its numbers meaningless and c006 stays
      green. Nine such holes are known and each has a verified one-line
      repro (QA on c006, recorded in the Log): Grave Harvest's
      `corpseSeconds` (a corpse that expires the same tick still counts),
      Conduction's `chainCap` (G11's ceiling — `Math.min(i, capIndex)` can
      be dropped), Long Draw's `chargeCapSeconds` (G10's finite dps-optimal
      charge), Kinship's aura `remaining` (an expired totem buffs forever)
      and its multi-totem stacking (`mul *=` -> `mul =`), Frost Touch's two
      counter resets (re-freeze every hit; stacks surviving frost lapsing),
      Spreading Plague's transferred amount (`total` -> `1`), and Time
      Flow's stack-cap merge. Acceptance: each of the nine gets an
      assertion — in `tests/class-passive-liveness.test.ts` or a sibling —
      that is red under its recorded repro and green on shipped data;
      every one stays a *relative* comparison so c006's no-authored-
      magnitude convention survives (a retune must not turn it red, which
      `c008` is separately making auditable) - refs: SPEC-FINAL §4.1/§4.2,
      §14 G10/G11, c006.


- [x] (c015) [bug] **DONE 2026-09-04.** the twelve class rows' **player-facing sentences contradict
      their own numbers**, and nothing checks it. `data/classes.json` carries a
      `description` on every passive/Active/tower-passive row and those strings
      are what the Codex and tooltips show, but every number in them is a
      hand-copied duplicate of a sibling field: Grave Harvest says "6 s" beside
      `corpseSeconds 6`, Frost Touch "hit 5 times" beside `freezeHits 5`,
      Conduction "cap 8 jumps" beside `chainCap 8`, Deep Winter "+10%" beside
      `towerDamageVsChilled 0.10` — and Bloodlord *Sanguine Pact* already says
      "all towers +10% damage" beside `towerDamage 0.04`, which `c008` proved is
      drift, so at least one of the twelve is lying to the player today. A
      retune moves the field and leaves the sentence behind.
      **Two premises were stale when executed, both corrected in the Log and in
      the test's header: there are 24 description strings, not 36 (the Actives
      carry none — `ClassEffectSchema` has no `description` field, and the test
      asserts that rather than assuming it), and Bloodlord's sentence had
      already been corrected to "+4%" by `p10s` (commit 3ce8cb8), so no class
      was lying about a magnitude on the day this ran.** The barrier was still
      missing, which is what the item delivered. Acceptance:
      `tests/class-descriptions.test.ts` extracts every numeric literal (and its
      `%`/`s`/`x` unit) from all 36 description strings and requires each to
      match the field on that row it names, or to appear in a named-deviation
      table carrying the item/Q-number that authorised the split; a number with
      neither fails. **Changes no `/data` number** except the description text
      itself where the fix is the sentence - refs: SPEC-FINAL §4.1/§4.2, c008,
      architecture rule 4.

- [x] (c018) [bug] **DONE 2026-09-04.** Two §6.3 cards raised a summon **cap that the
      Active's own cast cadence could never reach**, so buying either changed
      nothing in a real run. A summon lives `summonDurationSeconds` and one
      arrives every `cooldownSeconds`, so the ceiling is
      `floor(duration / cooldown) + 1`: Engineer *Extra Turret* 12 s / 10 s ->
      **1** live turret against a base `summonCap` of 2, Animist *Kindred
      Spirits* 16 s / 20 s -> **2** against a base cap of **3** (one point of
      the authored cap was dead before the card was).
      **Fixed in `/data` only, and cooldown only** — `data/classes.json`
      engineer `active2.cooldownSeconds` **12 -> 3**, animist
      `active1.cooldownSeconds` **16 -> 4**. SPEC-FINAL §4.2 authors both
      durations and both caps ("10 s, cap 2" / "20 s, cap 3") and
      `tests/class-spec-numbers.test.ts` pins them, but **no §-clause anywhere
      authors an Active's cooldown** — it is the one free ⚖ lever of the three,
      so it is the one that moved. No engine code touched.
      **Regression first**, then the fix: the `c018` deviation `describe` (which
      pinned the *bug*) is replaced by a positive `c018 — both summon caps are
      reachable at the real cast cadence`, red before the `/data` edit
      (engineer flat at 1, animist `2 -> 2 -> 2`) and green after. It asserts an
      **equality against `/data`** (`summonCap + rank * perRank`), not mere
      movement — a ladder that only moved would still pass with the Animist one
      spirit short of its own authored 3. QA re-derived the same ladder on three
      independent arms: shipped data `2->3->4` / `3->4->5`; cooldowns put back
      `1->1->1` / `2->2->2`; and with `+ classLineBonus(w)` **deleted from
      `classes.ts`** `2->2->2` / `3->3->3` — so the test is not vacuous.
      **Margin is measured, not assumed**: engineer rank 2 holds its peak 59
      ticks before the first expiry, animist 119; the cooldown cliff sits at
      3.35 s / 5.00 s against shipped 3 / 4 (~11% and 20% headroom).
      Cooldowns are reassigned to the authored constant per cast, never
      accumulated, and `tickCooldown` floors at `COOLDOWN_EPS` — no float drift.
      **G8/G11 control-run pair** (12 seeds, p6e's own scripted-kit harness —
      p6e itself prints nothing, every one of its G8 assertions is `.skip`-ed):

      | class | wins before -> after | `class_summon` share before -> after | `argmax(allDamage)` |
      | engineer | 12/12 -> 12/12 | 0.059% (333,802) -> **0.126%** (717,762) | ballista -> ballista |
      | animist | 11/12 -> 12/12 | 0.012% (61,369) -> **0.087%** (486,665) | ballista -> ballista |

      The cards now do something in a real run (2.1x and 7.1x the summon
      damage). **p6e's one LIVE pin, `expect(distinct.size).toBe(2)`
      (`p6e:687`), cannot move**: both classes stay far under
      `MATERIALITY_SHARE = 0.20`, so each `topLabel` falls back to
      `argmax(allDamage)` — measured `ballista` on both arms — and only these
      two classes' data changed. G11 (Stormcaller chain <= x3.6) is derived from
      `chainGrowth`/`chainCap`/`chainCount` and is unreachable from these
      fields. **Honest note:** animist moved 11/12 -> 12/12 (seed 2 flipped from
      a tick-cap timeout to a victory), i.e. *further* outside G8's 35-70% band.
      Both classes were already over that ceiling before this change and every
      G8 band assertion is `.skip`-ed roster-wide at 12/12, so no gate changed
      colour — but this nudges an already-broken gate the wrong way, and that is
      P10 balance work, not this item's.
      QA additionally control-paired the fast-tier-excluded suites the item
      under-scoped (`cfg()` defaults `classKey: 'engineer'`, so every
      `runScripted` suite now casts Pop Turret 4x as often): **G1** run length
      34.20 -> 34.13 min, 24/24 in band [30,36], real suite green; **G14**
      `boss.test.ts` green; **G22/G23** fingerprints byte-identical; a3 no-move
      byte-identical (stock policies never emit `class_active2`).
      **Engineer stayed at 3 s rather than the 2.5 s review suggested**, on a
      measured trade-off: at 3 s `engineer_active2_cdr` rank 1 still moves mean
      live turrets 3.33 -> 4.00 at cap rank 2, and 2.5 s saturates that to 4.00
      at rank 0 and kills it outright. Animist took 4 s (from 4.5) at no such
      cost — its cdr card is authored on *Recall Totem* (Active2), not Manifest
      — which makes its top rank continuous, moves it off the 5.0 s cliff, and
      leaves headroom for §4.2's not-yet-built "summon cap +1" Animist passive
      (Q120(5)), which would otherwise re-open c018 the day it lands.
      The residual `engineer_active2_cdr` finding is filed as **`c019`** below
      - refs: SPEC-FINAL §4.2 (Engineer, Animist), §6.3, c016, CLAUDE.md rule 3.

- [x] (c019) [bug] **DONE 2026-09-04 via acceptance option (b).** **filed by QA on `c018` 2026-09-04, twice-reproduced with identical
      numbers.** `engineer_active2_cdr` ("Pop Turret cooldown −25%/rank",
      `data/vsupgrades.json:26`) is now **inert on live turret count at
      `engineer_turret_cap` rank 0** — the state every Engineer starts a run in
      — and its **rank 2 buys nothing at any cap rank**. This is `c018`'s own bug
      class, created by `c018`'s fix, and it is partly *inherent*: once the cap
      is reachable at every rank (which is exactly what c018's acceptance
      demands), the cap binds and no cooldown reduction can add a summon.
      Measured, spamming Active2 every tick through the real
      `useClassActive2` -> `updateWarden` -> `updateClassSummons` loop, varying
      only the cdr rank:
      | arm | cap rank | peak by cdr rank 0/1/2 | mean by cdr rank 0/1/2 |
      | before (cd 12) | 0 | 1 -> 2 -> 2 | 0.83 -> 1.11 -> 1.66 |
      | after (cd 3) | 0 | **2 -> 2 -> 2** | **2.00 -> 2.00 -> 2.00** |
      | after (cd 3) | 2 | 4 -> 4 -> 4 | 3.33 -> **4.00** -> 4.00 |
      A real bot spends on it: `npm run sim -- --seed 1 --policy hybrid` reports
      `"skillCards":{"engineer_turret_cap":1,"engineer_active2_cdr":2,...}`.
      Note the card is **not** wholly dead — rank 1 at cap rank 2 is worth
      +0.67 mean turrets — and turrets have no HP, so the card's remaining
      honest value is refill latency, not count. Acceptance: decide and *pin*
      the disposition rather than leave it implicit — either (a) a
      `tests/class-line-bonus.test.ts` `describe` asserting the **mean**
      live-summon ladder across `engineer_active2_cdr` ranks 0/1/2 at cap rank
      0, sized off `/data`, red before whatever `/data` change makes it live;
      or (b) if the disposition is "cooldown cards are refill-latency cards
      once a cap is reachable", a named-deviation row in that file plus a
      QUESTIONS.md entry, never silence. The same question applies to the other
      eleven `active2_cdr` cards, whose only behavioural coverage anywhere is a
      HUD readout in `tests/fb026-bottom-bar.test.ts` (logged as an open gap by
      c016's own header) - refs: SPEC-FINAL §6.3, c016, c018, CLAUDE.md rule 3.
      **Option (b) taken — option (a) is impossible, not merely out of Scope.**
      Making the card live on *count* would mean un-doing c018: the cap binds
      precisely because a turret now outlives a full lap of it. `/data`'s own
      numbers say which of the two it is, so the disposition is pinned as an
      invariant rather than as prose — `lapsPerLife = floor(duration/cooldown)`
      vs `cap` — and the deviation `describe` in the new
      `tests/class-active2-cdr.test.ts` goes red the day a retune revives the
      count. **The premise was one clause too broad**, and the file says so:
      the card is inert on count only where the cap *holds*
      (`engineer_turret_cap` ranks 0 and 1). At the **top** cap rank
      `lapsPerLife` is 3 against a cap of 4, the board oscillates, and cdr rank
      1 buys the +0.67 mean turrets c019 itself noted — asserted as its own
      case so the deviation cannot overstate itself into "this card never buys
      turrets". The "other eleven cards" clause is closed by the same file: all
      twelve now have a cast-rate ladder, a `/data` cost tie and a class-scope
      probe, plus one slot-scope case for the whole set.

- [x] (c017) [bug] **DONE 2026-09-04, but not by the fix this item proposed —
      see the Log.** **filed by `c016` 2026-09-04, and proven by its own tripwire.**
      Archer *Deeper Draw* (`archer_pierce_cap`, §6.3's third card) is **inert on
      shipped data**: `fireDeadeyeDraw` (`classes.ts:592`) computes
      `Math.min((eff.pierceCap ?? 1) + classLineBonus(w), 1 + Math.floor(held))`
      and `held` is itself clamped to `chargeCapSeconds`, so the right-hand term
      is `1 + 5 = 6` at *any* hold length while `pierceCap` is 6 — the card's
      +2/rank can never bind, and rank 0, 1 and 2 all pierce exactly six
      enemies. Measured, not argued: `tests/class-line-bonus.test.ts`' last
      `describe` pins the flat 6/6/6 reading and separately proves the branch
      itself is live by lifting `chargeCapSeconds`, where 6 -> 8 -> 10 appears.
      A player who takes this card twice buys nothing. **Proposed fix, in
      Scope**: read the pierce count off the *unclamped* hold —
      `1 + Math.floor(chargeSeconds)` — leaving `held` clamped for the damage
      compounding it exists for. §4.2's Long Draw names "+1 pierce per full
      second charged" with no cap of its own (and "Deadeye damage has no cap"
      beside it), so `pierceCap` stays the only ceiling and the card's own
      sentence ("pierce cap +2") becomes true rather than reworded. It also
      moves **nothing at rank 0**: `min(6, 1 + floor(anything >= 5))` is still 6.
      Acceptance: the failing regression comes first — the c017 case asserting
      the rank ladder binds on shipped `/data` is red before the fix; after it,
      `class-line-bonus`'s Archer row drops its `contentWith` rebuild and its
      deviation `describe` is deleted; `tests/class-kit-liveness.test.ts` and
      `tests/class-spec-numbers.test.ts` stay green unchanged; and a
      12-seed control-run pair either side of the change shows G10's
      dps-optimal-charge assertion (`tests/p6d-nine-classes.test.ts`) unmoved,
      since no rank-0 run can reach a different pierce count - refs:
      SPEC-FINAL §4.2 (Archer, *Long Draw*), §6.3, c016, CLAUDE.md rule 3.
      **The proposed fix was measured and rejected: it is inert.** `held` is
      not the binding clamp — `tickClassCharge` already
      clamps `wd.active1Charge` to `chargeCapSeconds` before the sole call
      site passes it in, so `1 + Math.floor(chargeSeconds)` is the same 6.
      Unclamping the *accumulator* instead is out of Scope twice over (it
      widens `warden.active1Charge`'s range in `src/sim/types.ts`, and two
      out-of-Scope tests assert it equals the cap). What landed instead is
      `Math.min(pierceCap, 1 + Math.floor(held)) + classLineBonus(w)` — the
      same `min`, with the card's term moved onto its result, which is
      identically `min(pierceCap + b, 1 + floor(held) + b)` and so still
      raises the cap the card names. Rank 0 is unmoved and the ladder reads
      6 -> 8 -> 10 on shipped `/data`. Two acceptance clauses could not hold
      as written and are recorded in the Log: `class-spec-numbers` and
      `class-descriptions` each anchor the *literal text* of the changed line
      and were re-pointed, and the 12-seed control pair is identical because
      no bot ever charges.

- [x] (c016) [polish] **DONE 2026-09-04.** the **p7a skill-card (`classLineBonus`) branches inside
      the class kits are untested** — named as excluded by `c006`'s own header
      ("So can the p7a skill-card branches (`classLineBonus`) inside Thousand
      Cuts, Frost Touch and Spreading Plague") and never filed. There are more
      than those three: `classes.ts` reads `classLineBonus` in at least
      *Thousand Cuts* (extra Bleeding stacks/rank), *Brittle Frost* (`freezeHits`
      −1/rank), *Wider Contagion* (Spreading Plague transfers to +1 enemy/rank),
      *Deeper Draw* (`pierceCap` +2/rank), *Deeper Grave* (skeleton cap +1/rank)
      and *Longer Arc* (Chain Surge jumps +2/rank). Each is a rank-gated `if`
      that can be deleted with every existing test green. Acceptance:
      `tests/class-line-bonus.test.ts` proves each branch changes its own
      observable between rank 0 and rank 1 of the card, using the same
      control-run shape as c006 (rank 0 is the control, not another class), and
      that a rank a class does not own changes nothing for it - refs:
      SPEC-FINAL §6.3, §4.1/§4.2, c006.
      **One premise was understated: there are twelve `classLineBonus` call
      sites, not "at least six" — exactly one per class, across `classes.ts`,
      `enemies.ts` and `towers.ts`. All twelve are measured, each is red under
      its own deleted term, and the rank ladder is asserted twice (0 -> 1 and
      1 -> 2) rather than once. Three rows are named deviations covering two
      filed bugs: `c017` (Archer *Deeper Draw*) and `c018` (Engineer *Extra
      Turret*, Animist *Kindred Spirits*) — cards that are live in code and
      inert in a real run.**

- [x] (c012) [polish] **DONE 2026-09-04.** `data/equipment.json` has **no §7 ledger** — `c008`'s
      shape for the other content file this lane owns. `tests/fb015-equipment.
      test.ts:84` asserts "each item, equipped alone, contributes every mods key
      at its owner-table value", but that owner table is *hardcoded in the test*,
      so `/data` and the test can drift from SPEC-FINAL §7 together and stay
      green — exactly the hole c008 found on `data/classes.json`. Acceptance:
      `tests/equip-spec-numbers.test.ts` carries every §7 figure for the 12
      shipped items as a table with, per row, either a match against
      `data/equipment.json` or a named deviation carrying the item/Q-number that
      authorised it; a figure with neither fails, and the three `classFallback`
      compensation lines are rows of their own. **Changes no number** — it makes
      the drift visible before `fb056` appends 15 more rows to the same file
      - refs: SPEC-FINAL §7, c008.

- [x] (c013) [bug] **DONE 2026-09-04.** Animist *Wide Grove* is authored on the **global `area`
      key**, so "All towers +10% area" silently widens things that are not
      towers. Found by `c009`, logged there, not filed until now: there is no
      `towerArea` stat key, so the row uses `area`, which `stats.ts` folds into
      `derived.areaMul` — read by `towers.ts`, `vswield.ts`, `damagetypes.ts`,
      `enemies.ts` **and, since `c001`, by every one of the Animist's own class
      Actives**. c001 widened the blast radius of this row and nobody re-checked
      it. The fix needs a new key in `src/sim/statkeys.ts` (out of Scope, same
      blocker as `c004`), so this item is the *measurement*: acceptance is
      `tests/class-wide-grove-reach.test.ts` enumerating every consumer
      `areaMul` reaches under the Animist and asserting, per consumer, whether
      Wide Grove currently widens it — a red/green target the main-lane
      `towerArea` fix flips, rather than a claim in prose. The key itself is
      logged for the main lane - refs: SPEC-FINAL §4.2 (Animist), §2 (Area row),
      c001, c009.

- [x] (c014) [polish] **DONE 2026-09-05.** the four §4 liveness files **share a hardcoded board
      assumption and will all break together** on the terrain epic. `c005`,
      `c006`, `c009` and `c011`'s file each pin `WX/WY = 10,10`, a build tile at
      `11,10` and a probe loop against `cfg()`'s fixed seed; `BACKLOG-TERRAIN.md`
      makes that seed generate a real map, at which point all four fail as
      "harness could not build ..." — a harness error indistinguishable, to
      whoever picks it up, from a product regression. Logged three times now
      (c005, c006, c009) and never fixed. Acceptance: one lane-owned
      `tests/class-board.ts` module exports the probed Warden spot and build
      tile (chosen by `checkBuild` probing, as `tilePastBaseRange` already
      does, never hardcoded); all four files import it and none contains a
      literal tile coordinate; every one stays green unchanged today, and a
      deliberately shifted probe origin moves all four together. **Now five
      files: `c016`'s `tests/class-line-bonus.test.ts` pins the same `10,10`
      spot and the same `11,10` build tile, and joins this item's list.** And a
      sixth to fold in rather than convert: `c013`'s
      `tests/class-wide-grove-reach.test.ts` already probes for its tile with
      `grid.buildable`/`wouldBlockPath` instead of pinning one, so it is
      terrain-proof today but carries a *private* copy of the probe this item
      exists to share - refs: BACKLOG-TERRAIN.md, c005, c006, c009, c013, c016.
- [x] (c020) [bug] **DONE 2026-09-05.** `active2CdrFactor`'s **general `cdr` stat term is unpinned
      anywhere in the suite.** Found by QA on `c019`: mutating
      `src/sim/classes.ts:206` from
      `Math.max(0.05, 1 - w.derived.cdr - active2CdrBonus(w))` to
      `Math.max(0.05, 1 - active2CdrBonus(w))` leaves **659 tests across the 16
      most relevant files green**, `tests/class-active2-cdr.test.ts` included —
      that file asserts `derived.cdr === 0` as its precondition precisely so it
      measures one lever, which leaves the other unwatched. Harmless today
      (`grep '"cdr"' data/*.json` finds no row granting the stat) and a live bug
      the day equipment, a tree node or a boon does: Active2 would silently
      ignore a stat §2 says applies to it, and the `fb056` equipment epic is the
      obvious candidate to grant it first. Acceptance: a `describe` in
      `tests/class-active2-cdr.test.ts` driving `derived.cdr` directly (not via
      `/data`) and asserting the Active2 gate scales by it for all twelve
      classes, that it **stacks with** the card rather than replacing it, and
      that `active2CdrFactor`'s 0.05 floor is what catches the two together
      exceeding 0.95; red under the mutation above - refs: SPEC-FINAL §2 (the
      Cooldown row), §6.3, c019, QA on c019.

- [x] (c021) [polish] **DONE 2026-09-05.** the **twelve `active1_potency` cards** are the last of the
      three §6.3 cards with no cross-class coverage. `c016` closed `class_line`
      (twelve rows), `c019` closed `active2_cdr` (twelve ladders plus two named
      deviations); `active1_potency` is touched only by `tests/act2.test.ts:185`
      and `tests/p6b-swordsman.test.ts:274-281`, **both swordsman-only**, so
      eleven of the twelve are unwatched and `active1PotencyMul` could be
      deleted from eleven kits with the suite green. Acceptance:
      `tests/class-active1-potency.test.ts` proves each class's card moves its
      own Active1's damage between rank 0, 1 and 2 (the rank-0 control, c016's
      convention), that another class's card at max rank changes nothing, and —
      the shape `c019` earned — that every window/budget is derived from
      `/data` with a bounded `perRank`, so a nerf blames the harness rather than
      the card. Watch for the same collision class both prior items hit: a
      potency card is inert wherever the Active's own output is already clamped
      (`fireRaiseSkeletons`' cap, `fireJudgement`'s banked Wrath), and any such
      row is a named deviation, never silence - refs: SPEC-FINAL §6.3, c016,
      c019.

- [x] (c022) [bug] **DONE 2026-09-05.** the §7 ledger pins **which stat key each numeric column uses
      and no Effect row's**. `c012` added `NUMERIC_STAT` after code review found
      that a `0`/`×1` cell reads 0 through *any* `StatKey`, so a numeric row
      could audit a stat §7 never mentions; the same hole is still open on the
      13 Effect rows, which choose their key freely. Measured by QA on c012:
      moving `normal_necklace`'s `"towerCost": -0.2` to `"goldFind": -0.2` in
      `/data` **and** the row's `stat` with it leaves
      `tests/equip-spec-numbers.test.ts` fully green — §7's "tower upgrade cost
      −20%" would then be authored on gold find. It is caught today only by
      `tests/fb015-equipment.test.ts`'s hardcoded `EXPECTED_ITEM_MODS`, which is
      the very table c012 exists to stop relying on, and `fb056` is the item
      most likely to rewrite it. Acceptance: each Effect row carries a
      behavioural pointer — the `describe`/`it` in `tests/fb015-equipment.
      test.ts` that proves *that stat* moves *that* observable — anchored by
      regex the way `RULES.anchor` and the `in_code` row's `anchors` already
      are, so deleting the covering block reddens the row; red under the
      `towerCost`->`goldFind` mutation above with the ledger row edited to
      match - refs: SPEC-FINAL §7, c012, QA on c012, fb056.
      **Seven of the thirteen Effect rows had no block anywhere that named
      their stat, so the pointer had nowhere to point: `hpRegen`, `xpGain`,
      `towerCost`, `leech`'s magnitude, `bleedLifesteal` as a stat rather than
      as an equipped item, `towerAtkFlat` as a key rather than as a damage
      delta, and Swordsman Armor's `classFallback`, which had no dedicated
      block at all. Those seven covers are new, in this lane's own
      `tests/equip-effect-behaviour.test.ts` — `tests/fb015-equipment.test.ts`
      is out of Scope. The other six point into fb015 unchanged.**

- [x] (c023) [polish] **DONE 2026-09-05.** `equipment.items[].effectKey` is a **dead field**. Found
      by QA on c012: setting `sleeve_sword`'s to `"none"` changes no behaviour
      and no UI text, and `equip-spec-numbers`, `fb015`, `fb028`, `fb022`,
      `codex`, `character-panel` and `b003-stash-ux` all stay green. The sim
      gates every one of the three non-stat mechanics on
      `hasEquipment(w, '<key>')` (`classes.ts`) rather than on the item's
      `effectKey`, and `equipment-info.ts` renders `effectNote`/`effectNoteWith`,
      never `effectKey` — so a zod enum in `src/sim/content.ts:1052` validates a
      field nothing reads. Not a §7 disagreement, but it is a `/data` shape that
      looks load-bearing and is not, which `fb056` will copy 15 more times.
      Acceptance: `tests/equip-effectkey-reach.test.ts` enumerates every reader
      of the field and asserts, per item, that flipping it changes nothing
      observable — the same red/green measurement shape `c013` uses, which the
      main-lane removal (or the wiring-up, if that is the call) then flips. The
      field's fate is a main-lane decision because deleting it touches
      `src/sim/content.ts`; this item is the measurement only - refs:
      SPEC-FINAL §7, c012, c013, QA on c012.

- [x] (c024) [bug] **DONE 2026-09-05.** the **Time Lord twin of `c013`'s finding is unmeasured, and
      it is the larger of the two.** Filed by QA on `c013`. `applyChronalSurge`
      (`src/sim/run.ts:816-817`) applies the Time Lord tower passive as
      `w.stats.add(source, 'towerRange', ...)` **and**
      `w.stats.add(source, 'area', ...)` on two adjacent lines — a tower-scoped
      key for the range half and the *global* key for the area half, the same
      §4.2 "all towers" wording, uncapped and re-added every `waveInterval` TD
      waves. This lane's own Log already measures it at `areaMul 3.203` by
      end of run (+90% from Chronal Surge alone) against the Animist's flat
      +10%, so the character-side over-application `c013` sizes for one class
      is up to nine times larger for the other — and a main-lane `towerArea`
      swap that moves `data/classes.json` but misses `run.ts:817` would land
      with `tests/class-wide-grove-reach.test.ts` **fully green**, because that
      file builds Animist worlds only. Acceptance: a `time_lord` control pair in
      that same file — Chronal Surge fired `n` times against a rebuilt `Content`
      with `bonusAoeMul` deleted — asserting per consumer that the *same twenty
      footprints* widen, so the two classes' rows flip together or the
      difference is a named deviation; plus the asymmetry of those two adjacent
      `stats.add` lines asserted directly, since it is the cleanest evidence the
      main-lane key needs. In-lane (`tests/class-*` only); `run.ts` itself is
      not edited from here - refs: SPEC-FINAL §4.2 (Time Lord), §2 (Area row),
      QUESTIONS Q120(5), c009, c013, QA on c013.

- [x] (c028) [polish] **DONE 2026-09-05.** c022's **anchor/block-reader device lives privately inside
      `tests/equip-spec-numbers.test.ts`**, and `c027` below is about to make a
      second copy of it one file over — the exact shape `c014` spent an item
      undoing for six copies of one board. It is ~90 lines and every one of
      them was earned by a mutation: the indentation-derived block end (an
      exact-`});` scan walked past a `}, 20000);` closer into the next block),
      comment stripping (a bare `// luck` "covered" a row moved onto `luck`),
      the identifier-boundary `reads` default (`atkFlat` satisfied by
      `towerAtkFlat`), the ancestor `describe.skip` refusal, and the derived
      decoy roster. A hand-copy loses whichever of those the copier does not
      notice. First only because copying is cheaper than extracting once the
      copy exists. Acceptance: a lane-owned `tests/spec-ledger.ts` exports the
      reader, `defaultReads` and the decoy derivation; `equip-spec-numbers`
      imports them and keeps its own rows; the synthetic self-tests move with
      the module and gain one asserting the module has exactly one home (a
      `tests/*-spec-numbers*` sweep finds no second private copy of the reader);
      every mutation in c022's Log entry is re-run and still red - refs: c014
      (the shape), c022, c027.
      **The module is `tests/equip-spec-ledger.ts`, not `tests/spec-ledger.ts`:
      the acceptance clause named a path outside this lane's Scope, and a
      clause the lane wrote for itself under the generation rule cannot widen
      its own Scope (code review). Of the two legal prefixes `equip-` is the
      safe one — `class-board.test.ts` registry-checks every
      `tests/class-*.test.ts`. The rename is logged for the main lane.**

- [x] (c027) [bug] **DONE 2026-09-05.** **the §4 ledger has c022's hole in the one form that has
      already bitten twice.** `tests/class-spec-numbers.test.ts` pins each
      figure's authored *path* (`['passive', 'mods', 'leech']`), so moving a
      value to another key is red there in a way §7's Effect rows were not —
      but nothing proves the key is the one §4's *sentence* means. That is
      exactly what `c013` found (Animist *Wide Grove*, "all towers +10% area",
      authored on the global `area`, which since `c001` also widens all 24
      class Actives) and `c024` found again, nine times larger, on Time Lord's
      Chronal Surge (`run.ts:817`, `stats.add(source, 'area', ...)` beside a
      `towerRange` sibling). Two findings, one hole, no barrier: any other §4
      row could be authored on a stat whose reach is wider or narrower than its
      clause and the ledger would agree with itself. Acceptance: every §4 row
      whose figure is a stat key carries c022's `Behaviour` pointer (imported
      from `c028`'s module) into a `tests/class-*` block that reads that key;
      the two known divergences are **named deviations** pointing at c013/c024
      rather than silence; red under moving one authored figure to a
      neighbouring key with the row's own path edited to match, measured the
      way c022's was - refs: SPEC-FINAL §4.1/§4.2, §2 (Area row), c008, c013,
      c022, c024.
      **The pointer is not a copy of c022's: §4's covers observe through named
      `signal.*` helpers, not through `w.derived.<stat>`, so a stat-key text
      match does not fit. It is bound three ways instead — the row's authored
      path, the liveness `KILLS` entry that deletes that exact path (parsed out
      of the file), and the block, which must *assert* the signal that kill
      measures.**

- [x] (c031) [polish] **DONE 2026-09-05.** **the three `hasEquipment(w, '<key>')` literals in
      `/src` are an unpinned roster, and `fb056` adds fifteen items to the file
      that feeds it.** §7's three non-stat mechanics (Sleeve Sword's no-charge
      rule, Swordsman Armor's two) are gated on item keys hardcoded in
      `src/sim/classes.ts`, while `c023` proved the `/data` field that *looks*
      like it does this — `equipment.items[].effectKey` — is read by nothing.
      So the real contract between `/data` and `/src` is a set of string
      literals no test enumerates: an item key renamed in `/data` silently
      turns its mechanic off (the loader validates slots and `notClassKey`, not
      this), and a fifteen-item epic is the moment that is least affordable.
      Acceptance: `tests/equip-hasequipment-roster.test.ts` enumerates every
      `hasEquipment` call site in `/src` by source scan, asserts the roster is
      exactly the three §7 items that authorise one — each row quoting the §7
      Effect clause it implements — and asserts every literal names a key
      `data/equipment.json` actually authors; a fourth literal, or a renamed
      key, is red. Measurement and barrier only: the `effectKey`/`effectNums`
      decision is main-lane (`c023`'s Log) - refs: SPEC-FINAL §7, c012, c022,
      c023, fb056.
      **Eight call sites, not three: three lines ask about two items each. And
      the roster turned out to be written *twice* — `content.ts`'s closed
      `effectKey` zod enum lists the same three keys, which is the copy a
      reader finds first and the one `c023` proved nothing reads. The two are
      held to each other here.**

- [x] (c029) [bug] **DONE 2026-09-06.** `c014`'s "the importers move with the board" property is
      not true of the importers it was built for**, measured this session while
      converting `class-kit-whiff` (`c025`). Shifting `PROBE_ORIGIN` to
      `25,12` (board `26,12`) leaves the newly converted whiff file green at
      58/58 and reddens **six rows** — four in `tests/class-wide-grove-reach.
      test.ts` (the Mortar shell-splash probes and the "every footprint §4.2
      claims is still widened" set row) and two in
      `tests/class-line-bonus.test.ts` (Stormcaller `stormcaller_jump_cap`).
      Controlled on HEAD without `c025`: the same six, identically, so this
      predates the conversion and is a property claim the suite does not have.
      Those rows carry *board-relative calibration* — a victim placed at a
      distance tuned to one footprint, a chain line with room to reach — which
      the shared board does not export and `class-board.test.ts`'s sink rules
      cannot see. Acceptance: an enumeration table (the red/green shape c013
      uses) naming, per importer, each board-relative window it depends on and
      whether the file survives a shifted origin; a window that genuinely
      cannot move is a declared, asserted dependency with its measured reason,
      never silence; and `class-board.ts`'s header stops claiming the strong
      form of the property - refs: c014, c025, c013, c016.
      **Measured, not fixed — no engine or `/data` change.** The root cause:
      `EAST_REACH`/`SOUTH_REACH` bound `footprintClear`'s *terrain* check, not
      an importer's actual reach, and the static "EAST_REACH covers the
      deepest offset" scan only reads literal `WX + <number>` source text — so
      a window computed at runtime from `/data` (a tower's authored
      range/aoe, or a skill card's rank-scaled budget) is invisible to it and
      can still run off the east edge near the Core's column even though its
      reach is smaller than `EAST_REACH`. Swept every `class-*.test.ts` file
      for this shape (`(WX|BUILD_TX|p\.x) \+ <ident> \*`) and found exactly
      three such windows, all traced to source and confirmed by running the
      *real* files (not just the new measurement) under shifted
      `PROBE_ORIGIN`: `class-wide-grove-reach.test.ts`'s Mortar-shell-splash
      consumer, and `class-line-bonus.test.ts`'s `lineOfDummies`-based
      `archer_pierce_cap` and `stormcaller_jump_cap` rows. New
      `tests/class-board-windows.test.ts` replicates each formula
      independently off the same public `/data` reads (never importing the
      `.test.ts` files, which export nothing) and asserts a red/green survival
      table across 5 origins — the shipped default plus the same four
      `class-board.test.ts`'s own shifted-origin suite already uses
      (`25,12`/`15,6`/`30,15`/`22,3`) — measured: mortar fails at `25,12` and
      `30,15`; stormcaller the same two; archer only at `30,15` (its reach is
      shorter). Added to `class-board.test.ts`'s `EXCEPTIONS` (it probes five
      origins at once and has no single shared spot to pin — code review
      confirmed the entry, while accurate, is belt-and-suspenders rather than
      load-bearing, since the file never parks or builds anyway). Softened
      `class-board.ts`'s header to state the guarantee's actual scope. Five
      more dynamic (`p.y + n * m`) placements in `class-wide-grove-reach.
      test.ts` were swept for and cleared (never reddened across all 5
      origins) rather than given their own row. code-reviewer approved with no
      Critical/Major findings (two Minor/Nit notes: the EXCEPTIONS entry is
      unneeded-but-harmless, and that file's own pre-existing "worst case
      lands near x = 23.7" comment is stale against current `/data`, now
      22.89 — logged here rather than touched, out of this item's scope).
      qa-playtester independently reproduced the real-file failures under
      `25,12` and `30,15` by editing `PROBE_ORIGIN` directly (reverted after),
      confirmed the formula fields match the real sites byte-for-byte, and
      ran the full `tests/class-*.test.ts` glob (765 tests) and `npm run
      test:fast` (3980 tests) green apart from the pre-existing, unrelated
      `q15`/`q45` `tools/fuzz-command-domain` scratch-directory
      module-resolution failures (confirmed present on HEAD via `git stash`,
      nothing to do with this change) — no bugs filed.

- [x] (c030) [polish] **DONE 2026-09-06.** Two of this lane's own recorded measurements were taken
      on a board that no longer exists.** CLAUDE.md's measurement rules: "a
      deferral is a measurement with an expiry date; re-measure before
      inheriting it." `tests/class-time-lord-band.test.ts` (`c003`) records its
      12-seed win-rate number in a comment beside a `.skip`-ed assertion, and
      `tests/class-kit-damage-share.test.ts` (`c002`'s control half) records
      the per-class top-damage-source count — both measured before master's
      `fb077` wired `generateTerrain` into every non-practice run, so every
      seed they sample now plays a different map. The terrain lane retired the
      same inherited reason rather than re-verifying it (PROGRESS.md, this
      session's merge note). Acceptance: both numbers re-measured on the
      current tree and updated in place, each keeping the superseded value
      beside the new one with its date and the reason it moved; any `.skip`-ed
      assertion that is now green is un-skipped (two of m20a's five were), and
      any that moved further out of band says by how much - refs: CLAUDE.md
      measurement rules, c002, c003, §14 G8, fb077.
      **Both had expired, and both moved. Time Lord's T1 band: 12/12 (100%) ->
      11/12 (91.7%), with this class's first `defeat_core` and its first two
      `close-win`s. Kit damage share: every own-kit number up (plaguebringer
      6.40% -> 13.40%, pyromancer 0.08% -> 12.56%), the win column no longer
      uniform — five classes now inside G8's *literal* 35-70% band, where none
      was — and the diversity count **worse**, 2/12 -> 1/12, because `mortar`
      is now every class's top source where `ballista`/`mortar` used to split
      it. Both readings are T1 and G8's reference tier is T3 since `p12b`, so
      the band comparison is to G8's text, not to the band governing T1
      (`p12c`: `[55%,90%]`).**

- [x] (c032) [bug] **DONE 2026-09-06.** `kitPowerMul`'s reach across the kit is asserted nowhere in this lane, for the
      mechanism BALANCE DIRECTION v2 §A/`p12a` shipped as part of G8's fix.
      `kitPowerMul` (`src/sim/enemies.ts:284-286`, `1 + 0.12 * w.wavesCleared`)
      applies to every source `scalesWithKitPower` accepts — any `class_`-prefixed
      `damageEnemy` source — and is deliberately withheld from `spreading_plague`
      (`enemies.ts:326-330`'s own comment: re-scaling the plague transfer would
      double-count a pool whose own contribution was already scaled). Nobody in
      this lane has audited that `classes.ts` actually tags every one of the 24
      Actives, 12 Passives, 12 basic attacks and the 4 summon families
      (skeletons, spirits, Pop Turrets, Bone Pylons) with a `class_`-prefixed
      source string, and nobody has pinned the flip side — that Spreading
      Plague's transfer and Poison Boost's "double the remaining poison" stay
      flat regardless of `w.wavesCleared`. A single mistyped source string
      silently opts a kit source out of the growth curve `p12a`'s own acceptance
      measured only in aggregate (own-kit-share %), and nothing today catches it
      at the source-string level. Acceptance: a new
      `tests/class-kit-power-reach.test.ts` fires every Active1/Active2/passive-
      proc/summon-hit once at `wavesCleared = 0` and again at `wavesCleared = 18`,
      asserts each of the ~48 non-`spreading_plague` sources scales by exactly
      `kitPowerMul(18)/kitPowerMul(1)`, and asserts Spreading Plague's transfer
      and Poison Boost's doubled remainder are byte-identical at both wave
      counts (the deliberate exception, pinned rather than silent). In-lane only
      — reads `classes.ts`/`enemies.ts`, edits only `tests/class-*` - refs:
      SPEC-FINAL §4.1/§4.2, BALANCE DIRECTION v2 §A, BACKLOG.md p12a/p12f,
      CLAUDE.md measurement rules ("check a data row's blast radius").
      **The "~48 sources" premise was overstated: every one of the 24 Actives,
      12 Passives, summons and the basic attack routes through one of only
      five generic buckets (`class_active`, `class_active2`, `class_passive`,
      `class_summon`, `class_basic`, all fed by ~13 call sites total —
      `damageEnemy`/`applyDot`/`applyAoE`/`lineHit`/`applyDamageType` — rather
      than 48 distinct per-Active strings.** That makes the real risk a typo
      or missing prefix at any one of those call sites, not per-Active
      coverage, so the delivered test has two halves instead: (1) a
      single-pass tokenizer walks `classes.ts` tracking comment/string state
      and collects every string literal containing "class"/"plague" outside a
      comment, asserting the set found is exactly the five known buckets — a
      typo'd or unprefixed source shows up here without the test needing to
      know the call site exists; (2) a live-fire proof exercises one real
      mechanism per bucket (Pyromancer Immolation Wave, Archer Quickstep,
      Time Lord's bleeding-DoT tick, Pyromancer Contagious Flame, a raised
      Necromancer skeleton, the character's basic attack) at `wavesCleared`
      0 and 18 and asserts the hp-loss ratio equals the real exported
      `kitPowerMul(18)` (`kitPowerMul(0) === 1`), plus both named exceptions —
      Spreading Plague's transfer and Poison Boost's in-place `dps *= 2`
      (`firePoisonBoost`, classes.ts:499-507, which never calls
      `damageEnemy`/`applyDot` itself) — asserted byte-identical, not scaled,
      across the two wave counts. Verified by mutation (each reverted,
      confirmed clean via `git status`): disabling the growth curve, excluding
      one bucket from `scalesWithKitPower`, typo'ing a source string, and
      adding fake wave-scaling to Poison Boost's doubling each reddened
      exactly the row that should catch it and nothing else. code-reviewer's
      one Major finding — the acceptance's named Poison Boost exception was
      missing from the first draft — is fixed (the case above); its Minor
      finding (the original two-pass regex comment-stripper could be fooled
      by a `//` comment containing a literal `/*`) is fixed by replacing it
      with a single left-to-right tokenizer, with a regression test pinning
      the exact scenario review found. qa-playtester's finding — the tokenizer
      returned single-quoted literals only, leaving the "any future call
      site" claim false for a template-literal or double-quoted source — is
      fixed (all three quote styles now collected), with a regression test
      reproducing QA's exact repro. Full `tests/class-*.test.ts` glob (19
      files, 783 tests) and `npx tsc --noEmit` green.

- [x] (c033) [balance] **DONE 2026-09-06.** G8's diversity clause was rewritten by BALANCE DIRECTION v2 §D (owner
      verdict, `feedback/processed/20260904-223211-verdicts-q155-167.md`) into
      two checks: (i) every class's own-kit VS share >=35% from wave 12
      (p12a/p12f's target) and (ii) pairwise class-kit fingerprint distance
      >=0.15 using G22's existing damage-source/damage-type vector method —
      replacing the retired "top damage source distinct across >=9/12" count.
      `c030` (this session) re-measured only the retired count and clause (i)'s
      own-kit-share numbers on the current tree; nobody has run clause (ii) at
      all, and `p12d` (BACKLOG.md, still `[ ]`) needs exactly this number to
      write its gate test. Acceptance: a `tests/class-kit-fingerprint.test.ts`
      builds each of the 12 classes' T1 scripted-kit damage vector (reusing
      `describeSource`/G22's fingerprint-distance function rather than
      inventing a new metric), computes all 66 pairwise distances, and records
      the count meeting the >=0.15 floor plus the 3 closest pairs by name and
      distance, as a control-run measurement (no `/data` change) matching this
      lane's `c002`/`c030` precedent; if a `data/classes.json`-only tune plainly
      raises the passing-pair count without moving any class outside its
      win-rate band, take it and log the before/after as a control-run pair —
      if not, log the numbers for `p12d` rather than force a fragile tune
      (CLAUDE.md rule 6). In-lane measurement plus optional
      `data/classes.json` tune only - refs: SPEC-FINAL §14 G8, BALANCE
      DIRECTION v2 §D, BACKLOG.md p12d, c002, c030.
      **Measured, no tune applied.** `tests/class-kit-fingerprint.test.ts`
      reuses G22's `damageShareVector`/`l1Distance` (copied from the
      out-of-Scope `tests/p-core-f-gates.test.ts`, adapted to aggregate
      `damageByWeapon`/`damageTotal` across seeds before normalizing, the
      same order `class-kit-damage-share.test.ts`'s own `ownShare`/`vsShare`
      already use) and `class-kit-damage-share.test.ts`'s exact
      `runClassScripted`/`describeSource`, gated behind
      `KIT_FP_MEASURE=1`/`KIT_FP_SEEDS` (default 12, analogous to
      `KIT_SHARE_MEASURE`/`KIT_SHARE_SEEDS`) so the normal suite only runs a
      trivial 12-classes/66-pairs invariant. Measured
      `KIT_FP_MEASURE=1 KIT_FP_SEEDS=2` (12 classes x 2 seeds = 24 full T1
      runs, ~10.5 min): **50/66 pairs meet the >=0.15 floor**, 16 fail,
      closest pair necromancer/bloodlord at 0.0374. The 16 failing pairs
      cluster around 8 of the 12 classes and trace to the same mechanism
      c002/c030 found for clause (i): every class's `topLabel` resolves to a
      shared tower key (`mortar`, near-unanimous) because no class clears
      `MATERIALITY_SHARE` on its own kit, so a whole-run fingerprint is
      dominated by shared tower usage rather than by each kit's own small
      slice. No `/data` tune applied: the failing set spans 8 classes with
      no single lever that would separate all 16 pairs without risking
      pairs that already pass with real margin (e.g. paladin sits in 5
      failing pairs and 6 passing ones), and verifying a tune's safety would
      need a win-rate re-run outside this item's Scope — exactly the
      "fragile tune" CLAUDE.md rule 6 warns against forcing. Logged for
      `p12d` instead, per the item's own fallback clause. code-reviewer
      approved with no Critical/Major findings (verified the formula/runner
      reuse byte-for-byte via direct diff against the source files). QA
      independently re-ran the full `KIT_FP_SEEDS=2` sweep (~10.6 min) and
      got an **exact match** to the recorded numbers to 4 decimal places,
      plus a `KIT_FP_SEEDS=1` vacuity check showing genuinely non-degenerate
      per-seed vectors — no bugs filed. Full `tests/class-*.test.ts` glob
      (20 files, 785 passed) and `npx tsc --noEmit` green.

- [x] (c034) [bug] **DONE 2026-09-07.** `p12a`'s kit re-anchor (up to x3 on absolute kit-damage magnitudes) was
      accepted with G10/G11's absolute pins converted to ratio form "and still
      pass" (BACKLOG.md p12a acceptance), but that verification lived in
      `tests/p6d-nine-classes.test.ts`/`tests/p6b-swordsman.test.ts` — both
      outside this lane's Scope — so this lane has never independently
      re-derived G11's <=x3.6 Stormcaller chain ceiling or G10's finite-
      dps-optimal-Archer-charge property against the *current* shipped
      `data/classes.json` (`chainGrowth: 0.20`, `chainCap: 8`, `chainCount: 6`;
      `compoundPerSecond: 0.40`, `chargeCapSeconds: 5`, `pierceCap: 6`). Both
      formulas are pure functions of `/data` fields this lane owns, so a
      lane-owned control check costs little and closes the same "verify
      independently, don't inherit the claim" gap `c024`/`c027`/`c030` each
      found real drift through. Acceptance: `tests/class-line-bonus.test.ts` or
      a sibling computes Stormcaller's max chain multiplier directly from the
      shipped `chainGrowth`/`chainCap` (`(1+chainGrowth)^chainCap`) and asserts
      it is <=3.6, and separately computes Archer's dps-optimal charge length
      from `compoundPerSecond`/`chargeCapSeconds`/`pierceCap` and asserts it
      lands in G10's 2-6 s window; both assertions proven live (not vacuous)
      under a synthetic mutation (`chainCap` 8->10, `chargeCapSeconds` 5->30)
      that must turn them red. In-lane only, no `/data` change - refs:
      SPEC-FINAL §14 G10/G11, BACKLOG.md p12a.
      **This item's own acceptance text guessed G11's formula wrong** — the
      real ceiling exponent, read off `tests/p6d-nine-classes.test.ts`
      directly rather than re-derived from scratch, is `chainCap - 1` (a jump
      index starting at 0), not `chainCap`: `1.2^8 = 4.30` would already
      exceed 3.6 on shipped data, and `p6d` does not fail, so `chainCap - 1`
      is the only formula consistent with p6d's own passing state (measured,
      not assumed — CLAUDE.md's own rule). New `tests/class-gate-ratios.
      test.ts` copies both real formulas from `p6d` (G11's `(1+chainGrowth)
      ^(chainCap-1)`; G10's numeric search over held time, `growth^min(t,cap)
      / (t+cooldown)`) and confirms them live under mutation: shipped
      `chainGrowth 0.20`/`chainCap 8` gives ceiling ≈3.58 (<=3.6, and >3 as
      an anti-vacuity floor); `chainCap` 8->10 pushes it to ≈5.16 and reddens
      the check; shipped Archer numbers land the dps-optimal charge at
      exactly the 5 s cap (inside G10's 2-6 s window); `chargeCapSeconds`
      5->30 pushes the optimum past 6 s and reddens that check. code-reviewer
      approved with three Minor documentation nits (one fixed here — a
      comment said `jumps` "exceeds" `chainCap` when shipped data has them
      exactly equal, 8==8; the other two are precision notes about what a
      same-file coherence check does and doesn't prove, no functional
      issue). qa-playtester independently re-derived both formulas by hand
      against shipped `/data`, confirmed the exact numbers, read `p6d`
      directly to verify the exponent correction, ran its own additional
      mutations (chainGrowth 0.20->0.01 catches the anti-vacuity floor;
      cooldownSeconds sweep shows a sane monotonic optimum), and re-ran the
      full `tests/class-*.test.ts` glob (21 files, 792 passed) plus
      `p6d`/`p6b-swordsman` (166/166) — no bugs filed.

- [x] (c035) [bug] **DONE 2026-09-07.** the three Swordsman-locked equipment items' off-class fallbacks are proven
      individually and never jointly. `tests/equip-spec-numbers.test.ts`
      proves `sleeve_sword` alone composes to §7's 1.2x1.2 and `swordsman_armor`
      alone to 1.1x1.5 on an Engineer, and `tests/fb015-equipment.test.ts`
      loops every `classFallback` item with exactly one item equipped — but no
      test anywhere equips two or three of
      `sleeve_sword`/`swordsman_armor`/`swordsman_shoes` together on a
      non-Swordsman (the only combined-equip case, `fb015.test.ts`, is
      `classKey: 'swordsman'`, the in-class synergy, not the off-class
      fallback). SPEC-FINAL §2's stacking rule says different sources multiply
      and each equipped item is its own source, so a non-Swordsman wearing both
      weapon and armor should read attack-speed factor 1.44x1.65 = 2.376x, and
      wearing all three should additionally carry the shoes' 1.1x movement
      fallback — untested, and a plausible bug shape (e.g. an accidental
      last-write-wins instead of a running product across equipped items) would
      pass every existing single-item test. Acceptance:
      `tests/equip-spec-numbers.test.ts` or a sibling extends
      `equipmentAttackSpeedFactor` (or an equivalent taking an item array) to
      assert the two-item product on an Engineer/Cryomancer, and a third case
      wearing all three items asserts both the attack-speed product and the
      shoes' 1.1x movement fallback simultaneously. In-lane only
      (`tests/equip-*`, no `/data` or `/src` edit needed unless the check finds
      a real bug, in which case only `data/equipment.json` moves) - refs:
      SPEC-FINAL §2 (stacking), §7, §14 G5.
      **No bug found — the mechanism holds, now proven jointly.** Hoisted
      `equipmentAttackSpeedFactor` from `c012`'s describe block to module
      scope and widened it to accept an item array; added a sibling
      `equipmentMoveSpeedFactor`; three new cases in a `c035` describe block:
      `sleeve_sword`+`swordsman_armor` on an Engineer composes to
      1.44x1.65=2.376; all three on a Cryomancer compose the attack-speed
      product (2.376x1.1=2.6136, shoes has no attackSpeed fallback) and the
      movement factor (2x1.1=2.2) simultaneously in the same World — the
      movement half read directly off `content.equipment.items` rather than
      parsed from a §7 quote, since (confirmed by both code-reviewer and
      qa-playtester against the real ledger row) unlike the two atk-speed
      items §7 states the shoes' movement fallback as a single factor with
      no "(so X×Y)" composite to parse; all three on the Swordsman itself
      withhold every fallback. Verified by mutation: a deliberate
      last-write-wins rewrite of `Stats.factor()` (reverted) reddens the new
      tests exactly as expected; qa-playtester additionally flipped
      `swordsman_shoes.classFallback.notClassKey` and perturbed
      `sleeve_sword.mods.attackSpeed` (both reverted), each catching the
      injected drift. code-reviewer approved (one Nit: a redundant `!`
      assertion, not worth a follow-up) and independently confirmed every
      numeric claim against `data/equipment.json`. Full `tests/equip-*`
      glob (5 files, 176 passed) and `npx tsc --noEmit` green.

- [x] (c036) [bug] **DONE 2026-09-07.** equipment-sourced and class-tower-passive-sourced bonuses on the same stat
      key have never been jointly measured, though both are explicitly separate
      §2 "sources" that must multiply. `sniper_bracelet` (+10% `towerRange`)
      and Archer's *Ranger's Eye* (+10% `towerRange`, `data/classes.json`
      `archer.towerPassive.mods`) both write the same key; so do
      `normal_bracelet` (+10% `area`) and Animist's *Wide Grove* (+10% `area`,
      the same global key `c013` found reaches all 24 class Actives too). Every
      existing test (`tests/equip-spec-numbers.test.ts`,
      `tests/class-tower-passive-liveness.test.ts`) grants one such source at a
      time; if the engine ever collapsed same-key sources into one additive
      pool instead of two multiplicative ones, both would pass individually and
      the combined case would silently read +20% instead of the correct x1.21
      (+21%). Acceptance: a `tests/class-tower-passive-liveness.test.ts` case
      builds an Archer with `sniper_bracelet` equipped and asserts a built
      tower's effective range is base x1.21, not base x1.20; a second case
      builds an Animist with `normal_bracelet` and asserts effective AoE area
      x1.21 — both read the real `derived`/`effectiveTowerRange` path the file
      already uses, not a hand-rolled formula. In-lane only - refs: SPEC-FINAL
      §2 (stacking), §14 G5, c013.
      **No bug found — the mechanism holds, now proven jointly.** New `c036`
      describe block in `tests/class-tower-passive-liveness.test.ts`, reusing
      the file's own `towerWorld` shape with an equipment-carrying twin.
      Archer + Sniper Bracelet on an Arrow Spire and Animist + Normal
      Bracelet on a Mortar each measured four ways (base, class-only,
      item-only, combined) through the real `effectiveTowerRange`/
      `effectiveTowerAoe` (`src/sim/towers.ts`), with the expected 1.1/1.1
      factors read live off `content.classByKey`/`content.equipment.items`
      rather than retyped: both compose to x1.21, not x1.20. Verified by
      mutation: a deliberate additive-collapse rewrite of `Stats.factor()`
      (`return 1 + sum` instead of the per-source product), reverted,
      reddens both new rows exactly at 1.20 vs 1.21. code-reviewer approved
      with no findings (independently confirmed `effectiveTowerRange`/
      `effectiveTowerAoe` don't cross-contaminate `towerRangeMul`/`areaMul`
      for a `single`/`lob`-kind tower, and that a target-in-range firing case
      would be duplicative of this file's existing behavioral coverage).
      qa-playtester ran two further mutations of its own (item mod value,
      deleted class mod) plus an independent cross-contamination check — no
      bugs filed. Full `tests/class-*.test.ts` glob (21 files, 794 passed)
      and `npx tsc --noEmit` green.

      **Every actionable item in this queue (c001-c036) is now Done, Skipped,
      or Blocked out of Scope.** The next session should run the generation
      rule again per CLAUDE.md's "fewer than 3 actionable items remain" clause
      before executing further.

- [ ] (c037) [bug] `c036`'s same-stat-key stacking check has a twin gap on the
      **character-passive** slot, not just `towerPassive`. An exhaustive
      diff of every class `passive`/`towerPassive` mods key against every
      `data/equipment.json` mods/`classFallback` key finds exactly four
      overlaps: `area` (Animist/`normal_bracelet`, c036) and `towerRange`
      (Archer/`sniper_bracelet`, c036) are now covered — but `towerCost`
      (Engineer's *character* passive "Efficient Engineering" -10%, vs
      `normal_necklace` -20%) and `leech` (Bloodlord's *character* passive
      "Blood Frenzy" +3%, vs `bleeding_ring` +0.01%) are not, and nothing in
      the suite equips `normal_necklace` on an Engineer or `bleeding_ring` on
      a Bloodlord at the same time its own passive is live. Acceptance: a
      `tests/class-passive-liveness.test.ts` (or `tests/equip-*`) case builds
      an Engineer with `normal_necklace` equipped and asserts the effective
      `towerCost` factor is `(1-0.1)(1-0.2) = 0.72`, not `1-0.3 = 0.70`; a
      second case builds a Bloodlord with `bleeding_ring` and asserts the
      effective `leech` factor is `(1.03)(1.0001)`, not `1.0301` — both read
      through the real `derived`/`Stats.factor()` path, not a hand-rolled
      formula, the same device `c036` uses. In-lane only - refs: SPEC-FINAL §2
      (stacking), §14 G5, c036.

- [ ] (c038) [polish] the roster size (12 classes) is a **hardcoded
      assumption in at least three lane files with no shared source and no
      self-check**: `tests/class-kit-fingerprint.test.ts` (c033, "66 pairs"),
      `tests/class-kit-damage-share.test.ts` (c002, "distinct top sources:
      N/12"), and `tests/class-time-lord-band.test.ts` (c003's "11 of 12
      classes measured"). `fb057`/`fb059` (owner queue, next in line) add
      classes #13 and #14, and every one of those ratios silently keeps
      reading against the old roster size until someone notices — the same
      failure shape `c014`/`c029` fixed for hardcoded board coordinates,
      applied to a hardcoded *count* instead of a hardcoded *tile*.
      Acceptance: a shared lane module (or a single new
      `tests/class-roster-size.test.ts`) exports the live
      `content.classes.classes.length` and each of the three files above
      asserts against it rather than a literal `12`/`66`; the new file also
      asserts a synthetic roster of 13 changes the pair count formula's
      output, so the check is proven live rather than a tautology. In-lane
      only, no `/data` change - refs: c002, c003, c014, c029, c033, fb057,
      fb059.

- [ ] (c039) [balance] `c033`'s pairwise fingerprint measurement (2026-09-07,
      2 seeds) found 50/66 pairs already clear BALANCE DIRECTION v2 §D's 0.15
      floor, but two of the three closest pairs share a class:
      `necromancer`/`bloodlord` (0.0355) and `bloodlord`/`animist` (0.0720).
      c033's own acceptance left the tune decision open ("if a
      `data/classes.json`-only tune plainly raises the passing-pair count...
      take it; if not, log the numbers") and this lane logged rather than
      tried, per CLAUDE.md rule 6 (never force a fragile tune) and the
      2-seed sample's own thinness. This item is the actual attempt, with a
      proper control-run pair. Acceptance: a `balance-analyst`-owned pass
      identifies which of Bloodlord's authored kit fields could plausibly
      shift its damage-source mix away from `necromancer`/`animist` without
      moving win rate; if a concrete, small change raises the >=0.15 count
      measured at >=6 seeds without moving any class's win rate outside its
      own current band (control-run pair, before/after), take it and log
      both readings; if no such change is found, log the negative result and
      the fields considered rather than force one — either outcome closes
      the item. In-lane (`data/classes.json` only if a tune is taken) - refs:
      SPEC-FINAL §14 G8, BALANCE DIRECTION v2 §D, c033, CLAUDE.md rule 6.

- [ ] (c040) [balance] `c033` measured only the **damage-source** half of
      BALANCE DIRECTION v2 §D clause (ii)'s "damage-source/damage-type
      vector method" — G22's own `fingerprint()` (`tests/p-core-f-
      gates.test.ts`) is `damageShareVector` (by weapon/kit-bucket key) plus
      an economy delta, with no damage-*type* term, so that is what c033
      reproduced. `RunReport.damageByType` (physical/electric/poison/etc.)
      has never been tried as the vector for clause (ii), and it could
      plausibly separate classes whose damage-*source* mix looks similar
      (two classes both tower-dominated by `mortar`) but whose damage-*type*
      mix differs (a Cryomancer's frost kit vs a Stormcaller's electric one
      behind the same tower). Acceptance: a control-run measurement (no
      `/data` change) builds the same 12-class T1 vectors keyed by
      `damageByType` instead of `damageByWeapon`, reuses `l1Distance`, reports
      the pass count and closest pairs the same way `c033` does, and states
      plainly whether it raises the count — a metric *change* to clause (ii)
      itself is a definition decision, so log the number for `p12d`/owner
      sign-off rather than swap the gate's metric from here. In-lane
      measurement only - refs: SPEC-FINAL §14 G8, BALANCE DIRECTION v2 §D,
      c033.

- [ ] (c041) [polish] c018/c019's summon-cooldown headroom numbers (Engineer
      59 ticks, Animist 119 ticks at shipped `/data`, recorded 2026-09-04)
      are a measurement with an expiry date (CLAUDE.md's measurement rules)
      that has never been re-checked, and at least two balance-affecting
      changes have landed since (`p12c`'s T1 `baseHpMul: 20`, `fb077`'s
      terrain generation) — neither obviously touches summon-cadence
      headroom, but c030 found "obviously unrelated" wrong twice already on
      this exact kind of assumption. Acceptance: re-run the headroom
      derivation `c018`'s Log describes (cooldown cliff vs shipped
      cooldown) against current `/data`, record the new margin beside the
      old one with today's date, and note whether either card's margin
      dropped enough to be worth flagging for `p10r`; a `.skip`-ed assertion
      pinning the new floor is acceptable if the margin is still comfortably
      positive, matching `c003`'s own convention. In-lane, `/data` unchanged
      unless the re-measurement finds a genuine regression - refs: CLAUDE.md
      measurement rules, c018, c019, c030.

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

### c036, and a same-branch collision on c033-c035 (2026-09-07)

- **Two independent sessions worked BACKLOG-CONTENT.md's queue on the same
  branch (`claude/practical-bell-o1g4ea`) concurrently and both picked up
  c033/c034/c035.** The other session's work (`session_01P3Gs7y1pzF5SX9M7pG29hz`,
  commits merged via PR #25 onto `origin/master`, then merged into this
  branch) landed first: `tests/class-kit-fingerprint.test.ts` (c033),
  `tests/class-gate-ratios.test.ts` (c034), and an `equipmentAttackSpeedFactor`
  widened to take an item array plus a `c035` describe block in
  `tests/equip-spec-numbers.test.ts` — each independently code-reviewed and
  QA'd in that session, with its own write-up inline in the item text above.
  This session (`session_01GWnsri5QkQdseP6JR2mNjP`) had already implemented
  and shipped its own versions of the same three items
  (`tests/class-kit-fingerprint.test.ts` under different env-var names,
  `tests/class-g10-g11-verify.test.ts`, a separate `equipmentAttackSpeedFactorMulti`
  helper) before fetching and discovering the collision on push. **Resolved by
  keeping the other session's versions as canonical** (already reviewed,
  merged, and — for c033 — numerically consistent with this session's own
  independent 50/66 reading, closest pair `necromancer`/`bloodlord` at 0.0355
  here vs 0.0374 there, well within two-seed sampling noise) and discarding
  this session's duplicate implementations: deleted
  `tests/class-g10-g11-verify.test.ts` outright, and removed this session's
  redundant `c035` block from `tests/equip-spec-numbers.test.ts` (both blocks
  were present after git's clean auto-merge, since they occupied different
  regions of the file). This session's item text edits (the `[x]` DONE
  annotations) were likewise resolved to the other session's wording where
  both sides had annotated the same item. No functional loss: every acceptance
  clause for c033/c034/c035 is covered by the surviving, canonical files.
- **c036 is this session's own, unique contribution** — equipment-sourced and
  class-tower-passive-sourced bonuses on the same stat key multiply, not add.
  `sniper_bracelet`+Archer *Ranger's Eye* (`towerRange`) and
  `normal_bracelet`+Animist *Wide Grove* (`area`) both read the real
  `effectiveTowerRange`/`effectiveTowerAoe` path via a `towerWorldWithEquipment`
  helper (a straight extension of `tests/class-tower-passive-liveness.test.ts`'s
  existing `towerWorld`), asserting x1.21 against a naive-additive x1.20.
  code-reviewer (APPROVE, no Critical/Major — one Minor on this file's and
  c035's "proven live, not vacuous" test titles overclaiming rigor for a
  self-contained arithmetic check rather than a real `Content` mutation,
  fixed by renaming to "formula sanity check") and qa-playtester (PASS — the
  same `Stats.factor()` additive mutation used against c035 reddened both new
  c036 assertions) both signed off before the collision was discovered; the
  fix for the Minor finding is preserved in `class-tower-passive-liveness.test.ts`
  (the `equip-spec-numbers.test.ts` half of that finding no longer applies,
  since this session's own c035 block — the one the finding was about — was
  removed in the reconciliation above; the canonical c035 block's own titles
  don't make that claim). A full stat-key diff (every class
  `passive`/`towerPassive` mods key vs every equipment mods/`classFallback`
  key) found exactly four overlaps total; this item covers the two on
  `towerPassive` rows. The other two (`towerCost`: Engineer's *character*
  passive vs `normal_necklace`; `leech`: Bloodlord's *character* passive vs
  `bleeding_ring`) are filed as `c037`.
- **Generation rule run** (fewer than 3 actionable items remained after
  c033-c036, all now Done): (a) diffed against STATUS.md's current §14 gate
  table — every lane-relevant gate already green (G5, G9, G10, G11, G12, G20,
  G22) or, where red, blocked on `/data` outside Scope (towers.json/waves.json
  balance, G1/G8/G13/G14/G23, all filed in BACKLOG.md already); (b) an
  exhaustive stat-key diff between class passives/tower-passives and
  equipment mods (SPEC-FINAL §2/§7 coverage) found the `c037` gap directly;
  (c) one engineer's-judgment item each for: protecting the just-shipped
  gate-adjacent tests against the imminent `fb057`/`fb059` roster-size change
  (`c038`), following through on `c033`'s own deferred tune question
  (`c039`), trying the "damage-type" half of BALANCE DIRECTION v2 §D's own
  wording that `c033` didn't (`c040`), and re-checking `c018`/`c019`'s
  headroom numbers for staleness (`c041`). **Disclosed shortcut**: (a) used
  the existing STATUS.md rather than re-running the ~1h `tools/sweep.ts` +
  `handoff-metrics.ts` regeneration, since no lane-scoped gate state would
  plausibly have changed since its last regeneration and the full sweep's
  cost is disproportionate to a single generation-rule pass; a future
  session regenerating STATUS.md at a phase boundary supersedes this if it
  disagrees. Appended `c037`-`c041`, ordered by value; `c037` executed next
  (see its own entry below once done).

### c030 (2026-09-06) — two deferrals, both expired, both moved

- **Shape**: re-measured and re-recorded in place; the superseded reading is
  kept beside the new one with its date and the reason it moved, per the item.
  No `/src` or `/data` byte moved, and no assertion changed state — the one
  `.skip`-ed band assertion is still over G8's ceiling, so it stays skipped
  with its new number.
- **Time Lord (c003), 12 seeds at T1, `TIME_LORD_MEASURE=1`: 12/12 (100%, all
  landslide) -> 11/12 (91.7%), margins landslide 9 / close-win 2 /
  contested-loss 1.** Seed 3 is a real `defeat_core` at wave 16 — this class's
  first. Still over the 70% ceiling this file asserts (and over `p12c`'s T1
  ceiling of 90%), so `p10r`/`p12d` still own the retune. The rest of the
  roster is presumably in the same position and has not been re-read.
- **Kit damage share (c002), 144 full T1 runs, ~140 min: the diversity clause
  got *worse*.** Distinct top damage sources **2/12 -> 1/12** — `mortar` is now
  every class's, where `ballista`/`mortar` used to split the roster. Own-kit
  share rose everywhere (plaguebringer 6.40% -> 13.40%, pyromancer 0.08% ->
  12.56%, time_lord 2.45% -> 10.51%) and still nothing clears
  `MATERIALITY_SHARE`'s 20%, so every class falls through to the tower key and
  the tower key is now unanimous.
- **And the win column stopped being uniform.** Five classes are inside G8's
  35-70% band on this harness (pyromancer 41.7%, archer 50.0%, necromancer
  41.7%, stormcaller 58.3%, paladin 41.7%), three sit just under at 33.3%, and
  the reading was 12/12-for-eleven-classes three days ago. That retires point 2
  of the old note — c002's acceptance clause "no class leaves the 35-70% band
  it is already in" was flagged as vacuous because no class was in the band,
  and now five are.
- **What the numbers do not say, stated on the record — and an overreach code
  review caught before the commit.** The first draft of both write-ups
  attributed the movement to the board ("nothing in this lane changed; the
  board did"). **88 commits touch `/src` or `/data` between the readings**, and
  the likeliest cause is not terrain: `p12c` (`9368fd4`) ships
  `data/enemies.json` `baseHpMul: 20`, a roster-wide T1 enemy-HP multiplier
  whose stated purpose is ending the all-landslide roster, which is the exact
  shape of what moved. `fb076`, `fb099`, `fb054` and `fb077` are in the diff
  too; `p12b` is inert at T1 and `p12d`/`p12e` have not landed. Per CLAUDE.md's
  measurement rules nothing is attributed to any of them — the tables are a
  **baseline on the current tree**, not a mechanism, and that is now what both
  files say.

### c031 (2026-09-05) — the contract that is a set of string literals

- **Shape**: new `tests/equip-hasequipment-roster.test.ts` (4 tests). No `/src`
  or `/data` byte moved; the `effectKey`/`effectNums` decision stays main-lane.
- **Five mutations, all red**: renaming `sleeve_sword` in `/data` (the silent
  mechanic-off `c023` makes possible — the loader validates slots and
  `notClassKey`, and has nothing to say about these), a fourth literal no §7
  clause authorises, a removed call site, a double-quoted key, and the one code
  review found — see below.
- **The scan had a hole exactly where it claimed not to.** `blankNonCode` (the
  shared blank-comments-and-strings pass) has no regex-literal state, and
  `src/ui/hub.ts:111`'s `.replace(/'/g, '&#39;')` opens string mode and never
  closes it: **362 non-comment lines of that file come back blanked**, so a
  call site there was invisible and the acceptance mutation stayed green.
  Closed with a raw-text cross-check (`hasEquipment(` counted in the unblanked
  source, against the scan's own total plus the one declaration), and the blind
  spot is now written into `blankNonCode`'s header with a self-test that pins
  it as a *known limitation* rather than leaving it to be rediscovered. The
  same caution is recorded for `c027`'s `killEntries`, which is unexposed only
  because those tables contain no regex literal.
- **The §7 clause check was defeatable for the one pair it exists to separate.**
  It matched the clause against any table row containing the item's name, and
  Swordsman Armor's Effect cell names `sleeve sword` in its cross-item clause —
  so pairing Sleeve Sword with Swordsman Armor's charge-rate rule passed. It
  compares the row's **first cell** now.
- **The second roster is the finding.** `content.ts` repeats all three keys in
  the closed `effectKey` enum — the field `c023` measured as read by nothing —
  so the contract is written once where it is load-bearing and once as
  decoration, and the decoration is what a reader greps for first. The last row
  holds the two copies to each other; the `.effectKey` census itself stays
  `c023`'s, cited rather than duplicated (its version also asserts the two
  allowed mentions are still present, which a bare `toEqual([])` here would
  not).

### c027 (2026-09-05) — the key is right; what it drives was nobody's assertion

- **Shape**: `behaviour` pointers on the 16 §4 rows whose figure is authored on
  a stat key, plus six checks over them; `killEntries`/`killRegion`/
  `blankNonCode` added to `equip-spec-ledger.ts` (c028's module) with synthetic
  self-tests, and `pointerProblems` gained two rules. No `/src` or `/data` byte
  moved. 110 + 121 + 8 green.
- **Why it is not a copy of c022.** §4's covers observe through named
  `signal.*` helpers rather than through `w.derived.<stat>`, so §7's stat-key
  text match has nothing to match. The pointer binds three things instead: the
  row's authored path, the `KILLS` entry in a liveness file that deletes *that
  exact path*, and the block, which must contain `expect(signal.<that kill's
  measure>`. Move a figure to a neighbouring key with the row's path edited to
  agree — the c022 mutation in §4's form — and the row names a key no liveness
  table deletes: **3 red**.
- **Seven mutations, all landing where they should**, six red and one
  deliberately green: the pointer swap between Engineer and Paladin (they share
  `signal.towerHpUp`), thirteen rows re-anchored at the wrapper `describe`,
  deleting the frozen half's own `it`, a signal called with its result thrown
  away, renaming c024's describe, the acceptance key move — and a `]` inside a
  comment in the `KILLS` table, which **must** be green and was a false red
  before `blankNonCode`.
- **Three Majors from review and QA, each a hole in what the device *claimed*
  rather than in what it did.** (1) `readsFor` dropped c028's owner binding, so
  the Engineer and Paladin `towerHp` pointers were freely swappable while the
  test title said "that block names the row's own class" — bound on the block
  *title* now, since several §4 signals hardcode their class instead of taking
  it as an argument. (2) The row advertised as the compensating control for the
  at-least-one-of alternation was a **strict tautology**: it searched the file
  for `signal.<measure>`, and `<measure>` was parsed out of that same file's
  `KILLS` table, so the needle was guaranteed present — deleting the frozen
  half's only `it` left it green. The table is cut out of the haystack now.
  (3) The Time Lord `bonusAoeMul` row — the *larger* of the two divergences
  this item exists because of — was `{ kind: 'match' }` with no note, and its
  cross-reference was a `/time_lord/` grep that matched three unrelated
  identifiers. It carries the finding now, and c024's describe is anchored
  through the device.
- **Two rules earned by QA went into the shared module**, so `c022`'s side gets
  them too: a `describe` that *contains* nested blocks is not a cover (all
  thirteen §4 rows re-anchored at one wrapper stayed green), and `expect(` in a
  **string literal** is not an assertion (`['expect(x)'].join('')`).
- **`killEntries` is in the shared module, not private here** — the `c028`
  lesson applied immediately: it is a second source parser with its own earned
  rules (a brace scan over *blanked* source; one `classKey` per entry; a throw
  rather than an empty list when an entry never closes), and every one of those
  has a synthetic self-test.

### c028 (2026-09-05) — the device, before it was copied

- **Shape**: new `tests/equip-spec-ledger.ts` (the reader, `escapeForRegex`,
  `readsStat`, `defaultReads`, `decoyKeys`, `positiveLines`,
  `pointerProblems`, the `Behaviour` and `Block` types) and
  `tests/equip-spec-ledger.test.ts` (5 tests); `equip-spec-numbers` imports
  them and keeps its §7 rows, rosters and exemptions. Behaviour unchanged: the
  only textual delta in the moved code is the thrown-error prefix. 139 green
  across the three files.
- **Ten mutations, all red**, which is the acceptance: the seven from c022's
  entry (`towerCost`->`goldFind`, a gutted block body under its own title, a
  `}, 20000);` closer plus `towerCost`->`towerAtkFlat`, `hpRegen`->`luck` with
  a `// luck` comment, a row re-pointed at an unrelated file's block,
  `describe.skip` on the covers, and the leech cover's own deletion) plus three
  new ones this item's checks add — `describe.skip` on the **device's own
  self-tests**, a hand-copy in `tests/helpers/`, and a hand-copy *renamed*
  `readBlock`.
- **The one-home check had two open doors and code review measured both**: the
  sweep read `tests/` non-recursively, so a copy in `tests/helpers/` — exactly
  where a shared helper lands — passed; and it matched function *names*, so a
  renamed copy passed, which is what a §4 copier adapting the device would
  actually write. It recurses now and looks for the reader's structure (the
  lookbehind boundary, the title scan) as well as its names, with the module
  itself as a positive control so "no copies" cannot mean "no files read".
- **The pointer guarding the self-tests was weaker than the device it guards**
  — a prose substring match, which stayed green with `describe.skip` on all
  five. It runs through `blockBody` now, ancestors and all: the file dogfoods
  the module it exports.
- **One piece of the extracted API was not generic and would have handed c027
  the false red it inherited.** `positiveLines`' negative-control filter
  recognised a control only when the control world is named `w...` — §7's
  convention. Code review surveyed the §4 suites: their control operands are
  `full.`, `poison.`, `plain.`, `both.`, `BASE.`, `f.`, `c.`, not one starting
  with `w`. It is a parameter now, defaulted to §7's shape and passed
  explicitly at the §7 call site.
- **The *check* moved too, not only the primitives.** Review's point: five of
  the rules (`matches === 1`, the empty-body catch, the skipped-ancestor
  refusal, the per-`reads` loop) were still in the ledger's own loop, and each
  is a mutation-earned rule a copier can drop. `pointerProblems(block, reads)`
  carries them; the ledger supplies the row identity in the message.

### c025 (2026-09-05) — the agreement that was watching the wrong test

- **Shape**: `tests/class-board.ts` probes and exports the Ice Wall column
  (`WALL_TX`/`WALL_TYS`/`WALL_TY`/`HAS_WALL`); `class-kit-whiff` imports its
  whole geometry and leaves `EXCEPTIONS`; new `tests/class-p6d-agreement.ts`
  (the parser) and `tests/class-p6d-agreement.test.ts` (4 tests) carry the
  agreement. 58 whiff tests unchanged and green — the sorted test-name set is
  byte-identical to HEAD's, which QA checked. No `/src` or `/data` byte moved.
- **Both acceptance deviations were `c026` arriving first**, and both are
  recorded on the item above rather than quietly worked around.
- **The column costs exactly one spot, measured**: of 612 candidate spots, 12
  are legal boards without it and 11 with; the one it costs is `10,5`, and the
  shipped `10,6` is not it. That single spot is why the `1,1` shifted-origin
  case had to move: its nearest legal board *was* `10,5`, so the corner now
  converges on the shipped board. It is kept as a row of its own asserting that
  convergence and the eleven-spot count behind it, rather than deleted.
- **It degrades alone, proven by forcing it.** With the column made impossible
  everywhere, exactly one file fails — `class-kit-whiff`, on the four rows that
  build on the column, each with a named `HAS_WALL` message — and the other
  eight importers stay green at 323 tests. That is `c026`'s rule (the shared
  footprint asks for what importers need; one importer's extra need degrades on
  its own rung) applied to the first extra need there has been.
- **QA failed the first parser and was right to.** It read the *first*
  `aimX/aimY` in p6d's Ice Wall `describe`, which belongs to a `castWall()`
  helper the gold/duration rows use — **not** the occupancy row this file
  co-states. Re-aiming the occupancy row alone left whiff green: the agreement
  was watching a test it does not agree with. It also (a) threw at module
  scope, so a cosmetic p6d edit collapsed the file to `Tests no tests` — 58
  rows silently not running, which `class-board.ts`'s own header calls worse
  than the failure c014 set out to fix; (b) reported "p6d's own Ice Wall aim
  point moved" when p6d had merely been reordered or prettier-wrapped; and (c)
  silently fell through to another test's park when p6d's was collapsed onto
  one line. The parser is now a lazy, memoised module that anchors on the
  occupancy `it`'s own title, ends the block by indentation, requires park and
  aim to be unique inside it, tolerates line breaks and either quote style, and
  says "parse failure, not a re-aim" when it cannot read. Every one of those
  shapes is a synthetic-source test.
- **`code()` in `class-board.test.ts` now strips string literals as well as
  comments.** The new parser test builds a miniature p6d out of quoted source
  (`'    w.warden.x = 4;'`), and the sink rules read all four of them as real
  board pins. A sink inside a quote is text. Controlled: injecting a *real*
  private park and a *real* literal build tile into `class-kit-whiff` is still
  caught by both sinks.
- **Three review/QA findings were pre-existing and are fixed in passing**: the
  ladder's last rung (`east: 1`) was dead code — `footprintClear`'s far-ground
  clause scans `dx = 4..east`, so it could never succeed, and the throw
  advertised a floor ("down to a single build tile") the ladder could not reach
  (now `east: 4`); the column was pre-filtered with `grid.buildable` while
  `class-kit-whiff` places it with `buildTower`, so `probeAt` now asks
  `checkBuild` too; and two headers still described the pre-`c026` bounding box
  and the pre-`c025` exemption.

### Generation rule (2026-09-05, session 3) — run with two actionable items left

Run before executing, per CLAUDE.md, with `c022` and `c025` the only actionable
items in the lane. Appended `c028`, `c027`, `c031`, `c029`, `c030`, in that
order; the extraction leads only because `c027` would otherwise hand-copy the
device `c028` extracts.

- **(a) Sweep and gates.** `npx tsx tools/sweep.ts --seeds 12 --policies
  maxbuild,hybrid` on this tree: **maxbuild win 0.17**, medMin 30.7, medWaves
  17; **hybrid win 0.17**, medMin 38.2, medWaves 18. STATUS.md's own policy
  table still reads win rate **1** for both, so that table is stale — it
  predates master's `p12b`/`p12c` T1 re-anchor and the terrain wiring, and the
  divergence is main-lane balance state, not this lane's (`c022` and `c025`
  move zero `/src` and `/data` bytes between them). Of the five red gates,
  **G8** is the only one whose lever is in this lane's Scope, and both of its
  clauses are parked on owner verdicts — **Q160** (win rate) and **Q161**
  (diversity), with `c002` skipped against the latter. No item is filed against
  a gate that a `/data`-only session has already failed to move four times
  (CLAUDE.md rule 6, and `p10r`/`p10s`/`p10t`/`p10z`'s record of it).
- **(b) SPEC-FINAL coverage diff.** §7 is fully audited after `c012`/`c022`;
  §13's equipment census (12+) and class census (12) are met. The three
  uncovered §4/§7 surfaces are all *reach* rather than magnitude — which key a
  clause is authored on — and that is `c027`. The `/data`-to-`/src` contract
  `c031` names is the fourth, and the only one `fb056` is guaranteed to touch.
- **(c) Engineer's judgment.** `c029`, which is a property this lane has been
  *claiming* since `c014` and, measured while converting the eighth importer,
  does not have.

### c022 (2026-09-05) — the row that audits the right number on the wrong stat

- **Shape**: `tests/equip-spec-numbers.test.ts` gains a `Behaviour` pointer on
  every one of the 13 §7 Effect rows plus five checks over them; new in-lane
  `tests/equip-effect-behaviour.test.ts` (13 tests) carries the seven covers
  that did not exist. No `/src` or `/data` byte moved. 121 + 13 green.
- **The mutation the item was filed on is red, measured, not argued.**
  `"towerCost": -0.2` -> `"goldFind": -0.2` in `/data` with the ledger row's
  `stat` edited to match: **2 red** (the pointer check and the decoy check).
  Renaming the covering `it` title: **1 red**. Both were green before.
- **Seven of the thirteen rows had no cover to point at**, which is the finding
  underneath the finding: `hpRegen`, `xpGain` and `towerCost` had no
  equipment-side behavioural block anywhere in the suite; `leech`'s *magnitude*
  was unpinned (fb015's two Bleeding blocks prove the flag routes bleed damage,
  never the 0.0001); `bleedLifesteal` was proven only by equipping the item, so
  the stat could have moved keys with fb015 green; `towerAtkFlat` likewise —
  fb015 observes `towerDamage()` rising, which any tower-damage key would do;
  and Swordsman Armor's `classFallback` had no dedicated block at all, only the
  generic three-item loop that names no stat. The ledger's own `note` on the
  `bleedLifesteal` row had already written the pointer in prose ("named here
  instead: `tests/fb015-equipment.test.ts:419`"); c022 is that sentence turned
  into an anchor.
- **The default is the strong one and the override is a roster, not a flag.**
  `reads` defaults to the row's own stat key as a substring, so `areaMul`,
  `towerRangeMul` and `leechAccumulator` satisfy `area`, `towerRange` and
  `leech` — a derived factor named after its stat is that stat read by name.
  Exactly one row overrides it (`swordsman_shoes`' `×2`, the only row with
  `stat: null`), and the exemption asserts *its own cause*: the row must have
  no stat key and must be `in_code`, so it cannot outlive the reason it exists.
- **The block reader is exercised on synthetic source**, the shape `c012`'s
  `unclaimedWords` established: a fabricated two-block file proves it stops at
  its own closing brace rather than swallowing its neighbour, that 0 and 2
  matches are reported rather than silently taken, and that an unterminated
  block throws. Without that, every `reads` check could have been passing by
  reading the rest of the file.
- **The decoy roster is derived, not listed**: every `StatKey` no equipment
  item authors may appear in no covering block, so re-pointing *any* Effect row
  at one of them is red, not just the row QA happened to mutate. A hardcoded
  roster of three carried the precondition "no item authors this key", which
  the acceptance mutation itself breaks — it would have gone red saying
  "goldFind is authored, so it is not a decoy", the right answer for the wrong
  reason. One name is exempt with a reason (`towerDamage`, which `towers.ts`
  also exports as a *function* the Builder's Necklace covers call), and a
  negative control (`.not.`, or a `toBeCloseTo` against the control world) may
  name a decoy freely — QA showed the first draft punished *strengthening* a
  block with a "the discount must not leak into gold find" assertion.
- **Eight of the device's own holes were found by review and QA, and every one
  is closed with the mutation that found it as its regression test.** The
  `reads` match was a bare substring (`atkFlat` satisfied by `towerAtkFlat`,
  `armor` by the item key `swordsman_armor`) and is now closed on the left by
  an identifier boundary; the body **excluded** the title line only after
  review pointed out that ten of thirteen anchors name their stat in the title,
  so the check was self-satisfying; comments are stripped, because a bare
  `// luck` was enough to "cover" a row moved onto `luck`; the pointer now
  binds the **item** as well as the stat, after QA re-pointed Normal Ring at
  the Time Core's regen block and stayed green; a `describe.skip` above a cover
  is refused; and the block reader stopped scanning for a literal `});` after
  QA closed a block with `}, 20000);` (20 files here do) and watched the body
  swallow its neighbour — it now reads the end off indentation and refuses
  anything at that column that is not a closer. The seventh was in the new
  covers themselves, not the device: the `leech` block asserted
  `leechAccumulator ≈ dealt × derived.leech`, which is `0 ≈ 0` with the stat
  deleted — the one cover of the seven that survived its own mod's removal.

### c026 (2026-09-05) — the merge that proved the footprint was describing the arena

Landed early, not by choice: merging `origin/master` brought the terrain epic
(`fb077`, "wire generated terrain into every non-practice World run"), and
`c014`'s footprint check stopped being satisfiable at all.

- **Measured, not inferred.** On the map `cfg()`'s seed now generates, **408 of
  720 tiles are buildable** and **zero of 512 candidate origins** can supply the
  contiguous `16 x 8` block `footprintClear` demanded. The requirement was never
  describing the importers; it was describing the flat arena the module was
  written on. `probeBoard` fell back to its `reduced` tier everywhere, which is
  the fallback `c014`'s QA round added — it worked exactly as designed, and it
  is why the merge produced one loud named failure instead of six confusing
  ones.
- **The footprint is now the three things importers really need**: `passable`
  floor where dummies stand (they spawn with `speed = 0` and never path, so
  asking for `buildable` there was asking for a tower site nobody builds); a
  legal build tile, already checked by `checkBuild` at the call site; and **at
  least one** buildable tile east of `dx 4` in the Warden's row, because that is
  all `tilePastBaseRange` needs — it takes the first tile it finds. The far-
  ground scan uses the same `dx` window that function does, so the two cannot
  drift.
- **Result**: the board relocated from `10,10` to `10,6` and **all seven
  importers passed on it with no edit to any of them** — the property c014
  exists to buy, tested by the real event rather than a simulation of it.
- **One acceptance clause could not hold as written.** c026 asked that "the
  shipped board still probes to `10,10`". It cannot: terrain closed the southern
  arm below that spot (rows 14-16 carry impassable ground) even though its build
  tile `11,10` is still perfectly legal — `checkBuild` returns `null` there. The
  clause assumed the arena the item was filed on. The baseline row was
  re-measured to `10,6` instead, and the reason is asserted rather than
  described, so a future terrain change reports itself.
- **Two of `c014`'s own assertions were wrong in kind, not in detail.**
  `tier === 'full'` was requiring the flat arena; it is replaced by direct
  assertions of the two guarantees importers depend on. And `footprintTiles`
  read the *full* reach off a `reduced` board, reporting "footprint tile 25,9 is
  a Core tile" for a tile the probe never claimed — it was measuring the
  constant rather than the board.

### c024 (2026-09-05) — the leak that was invisible because the file only built Animists

- **Shape**: 21 tests appended to `tests/class-wide-grove-reach.test.ts`, and
  `CONSUMERS` made class-parameterised (`WorldOpts.classKey` / `surges`). No
  `/src` or `/data` byte moved; `run.ts` is not edited from this lane. 88 green.
- **The premise, proven rather than asserted.** Every one of c013's twenty
  consumers built an *Animist* world, so a main-lane `towerArea` swap landing on
  `run.ts:817` alone would have left this file fully green. Measured by applying
  exactly that fix: **19 rows flip, and every one of them is a `c024` row —
  zero `c013` rows.** That asymmetry is the item.
- **Chronal Surge is fired for real**, through cleared TD waves
  (`applyChronalSurge` is private to `run.ts` and fires off `completeWave`), the
  same way c009's own rows drive it. The post-wave world is then normalised —
  god mode off, board cleared — because everything the surge did lives in
  `w.stats`/`w.derived` and survives, so the probes see the same clean board the
  Animist rows do.
- **The control is zeroed, not deleted, and the loader is why.** c013 deletes
  `towerPassive.mods.area` (a free map). `bonusAoeMul` is a *required field of
  the `chronal_surge` kind*, so deleting it is refused outright —
  "chronal_surge needs bonusAoeMul" (`validateClassPassive`, `content.ts:1333`).
  Architecture rule 4 working exactly as written.
- **Five of the twenty are excluded, and both reasons are named, not silent.**
  - *Two are structural*: the Manifest spirit and the Recall Totem aura are
    footprints of the **Animist's own class Actives**; a Time Lord cannot
    produce them. A row asserts both still widen under the Animist, so their
    absence here is about whose Active it is and nothing else.
  - *Three are harness calibration, measured*: Venom Spore splash (190 vs *no
    spore landed*), Electric off a Tesla hit (319 vs *no volley landed*) and the
    Frost Obelisk aura (234 vs 234, saturated). The first two probes place their
    victim at a distance tuned to the Animist's flat `+10%`, so with the surge's
    area zeroed the footprint no longer reaches it and the probe's own harness
    assertion fires — the control under-reaches, so there is no comparison to
    make. All three are **tower-route**, which is the half §4.2's sentence
    actually covers, so none of them is where the leak lives. Re-calibrating
    them is folded into `c026` rather than bodged here: widening a probe to make
    a control pass is how a measurement stops measuring.
- **And it is the larger leak, measured**: the surge's contribution compounds
  across firings while Wide Grove's authored `+10%` is flat in wave count. Ten
  character-route footprints leak under both classes.

### c021 hardening (2026-09-05, QA second pass) — six surviving mutations closed

QA passed the corrected file but found the coverage still one-sided: every row
measured "the named magnitude went up" and nothing measured "and nothing else
moved". Six mutations survived; all six now die, each reddening exactly one row.

- **The root cause of the original Bloodlord error, named and removed.** The
  header's "four non-damage kits" was **six** — `/data` authors `damage: 0` for
  engineer, necromancer, **bloodlord**, animist, paladin and **time_lord**.
  Bloodlord was never counted as a non-damage kit, so it was slotted as a damage
  row, measured as one, and its real payout went unlooked-for. The list is now
  derived from `/data`, and a row asserts no non-damage kit's `what` still
  claims to measure damage.
- **`topDot` really did read the wrong stack** — the self-doubt flagged in the
  QA brief, confirmed. Bleeding stacks independently, so after two casts the
  enemy carries both the past (12 dps) and present (16 dps) stacks, and the
  stage-1 row read the present one *only* because 16 > 12. QA nerfed
  `markPresentDotDps` to 8 and dropped the present stage's potency wiring: still
  33/33 green, because the read silently switched to the past stack, which
  carries the same ratio. Now each row reads the stack its own cast appended,
  identified by position, and asserts which `/data` figure it came from.
- **Stages 2 and 3 were never executed.** The block claimed "only those two
  stages" while its third row was a schema check, so `advanceTimeMark`'s later
  branches were never entered — adding potency to either left this file *and
  ten others* green. Both now have behavioural rows, including an elite dummy
  for the execute. The deviation's wording was also wrong:
  `markEliteExecuteFraction` **is** an authored `/data` magnitude, contradicting
  "neither is a /data magnitude there is anything to multiply".
- **No negative control existed.** Potency over-reaching into Field Kit's
  `overclockSeconds` or Poison Barrel's `groundDurationSeconds`, or
  *under*-reaching so it scaled only Chain Surge's first jump, all passed. Five
  companion-observable rows now assert the Active's other authored fields are
  flat across ranks, and the stormcaller row hits three links and sums the whole
  chain — `damageDealt` spawned one dummy, so jumps 1..n were never exercised.
- **The `towers.ts` surface the correction opened had one guard, not two.**
  Scaling the sibling `death_pact` branch by `active1PotencyMul` — an Active1
  card moving an Active2 payout — left this file and `class-active2-cdr` and
  `class-line-bonus` all green. Now pinned.
- Plus the untithed control's missing vacuity guard (`plain[0] > 0`), the shape
  every other guard in the file already had.

43 tests. No `/src` or `/data` byte moved.

### c023 (2026-09-05) — the field that looks load-bearing and is not

- **Shape**: new `tests/equip-effectkey-reach.test.ts`, 26 tests. No `/src` or
  `/data` byte moved. The item is the *measurement*; removing the field (or
  wiring it up) touches `src/sim/content.ts` and stays a main-lane decision.
- **Confirmed dead, three independent ways.** A source census over `src/**`
  finds only two `effectKey` mentions and both are named: the zod enum that
  *validates* it (`content.ts:1052` — schema, not a reader, and the reason the
  field looks load-bearing) and an unrelated core-VFX parameter of the same
  name in `render/canvas.ts`. The three non-stat mechanics are anchored to
  `hasEquipment(w, '<item key>')` in `classes.ts`. And `Content` is rebuilt
  twice from `/data` — every `effectKey` blanked, then deliberately cross-wired
  onto the wrong items — with all three mechanics and all twelve items'
  rendered markup asserted identical. Blanking proves the field is not
  *required*; cross-wiring proves it is not *consulted*.
- **It flips when the field is wired up**, which is the point: re-gating Sleeve
  Sword's instant-max charge on `effectKey` instead of the item key reddens
  three rows — the census (a new reader appeared) and two behavioural rows.
- **Two of this file's own probes passed vacuously first, and its own guard
  caught them.** `dashDistance` read `warden.dashToX/dashToY`, fields that do
  not exist, so both readings were `0` and the shoes rows compared nothing to
  nothing; and the cross-item row called `useClassActive`, which correctly
  returns false for a charge kind. The "the probes are live" row — c005's
  convention, written before the probes — failed on `expected 0 to be greater
  than 0` and named both. The real fields are `warden.dashTravel`
  (`wardenmove.ts`) and `tickClassCharge`'s hold/release.

### c021 (2026-09-05) — "potency" is not "damage", and the one card that buys nothing

- **Shape**: new `tests/class-active1-potency.test.ts`, 32 tests, using c014's
  shared board. No `/src` or `/data` byte moved (`git diff -- src data` empty).
- **The acceptance's word "damage" was wrong for a third of the roster, and
  following it literally would have measured four kits wrong.** Four Active1s
  author `damage: 0` and carry their magnitude elsewhere, which `classes.ts`
  already reads correctly at each site: engineer `repairFraction`,
  necromancer and animist `summonStatMul`, paladin `tauntDurationSeconds`. Each
  row names its own observable out of `/data`; a coverage case asserts those
  four really are `damage: 0`, so the table stops being true out loud rather
  than silently.
- **Exact ratio, not "bigger".** Every row asserts
  `reading(rank n) === reading(0) * (1 + perRank * n)`. A `toBeGreaterThan`
  ladder is satisfied by an implementation that applies the card once and
  ignores the rank — measured: that mutation reddens 13 tests here and would
  have passed a monotonic ladder.
- **CORRECTED 2026-09-05 (same day, QA on c021): the Bloodlord "deviation" was
  wrong, and the wrongness is the lesson.** The first version of this file
  claimed `bloodlord_active1_potency` "buys nothing at any rank" and filed a
  main-lane item for a bug that does not exist. `fireBloodTithe` indeed never
  calls `active1PotencyMul` — but the tithe's *payout* does, in
  `classTowerDamageMul` (`src/sim/towers.ts:263`):
  `1 + titheDamageMul * active1PotencyMul(w) + classLineBonus(w)`, with a
  comment saying exactly that. QA found it by mutating the line the test never
  looked at, and that mutation left the original file fully green.
  - **Root cause, in CLAUDE.md's own words**: *"when a field's range changes,
    grep its readers, not just its writers."* The draft grepped `classes.ts`,
    found no call, and never followed the payout into the file it had *itself*
    named as holding it — then wrote a test that measured only the cost and so
    confirmed its own premise instead of testing it. A deviation is a claim
    about a mechanism; it needs the control run like any other.
  - **What was true, kept**: the tithe's HP *cost* (`titheHpFraction`) really
    does not scale with the card. That is now one narrow pinned row instead of
    a claim about the whole kit.
  - **What was missing, added**: the payout ladder through `towerDamage`, with
    a bespoke `ratioFor` because potency scales a term *inside* the multiplier
    (`(1 + t*(1 + p*n)) / (1 + t)`, both halves from `/data`), plus an
    untithed-tower control so the ladder is measuring the tithe and not some
    other term. QA's mutation now reddens two rows.
  - The main-lane entry filed off the wrong premise has been **deleted**; there
    is no main-lane bug here. `fireRaiseSkeletons`' cap remains a non-issue for
    the necromancer row (it binds count, not the stat share potency scales).
- **Named deviation 2: Time Lord *Time* scales two of its four stages.**
  Potency multiplies `markPastDotDps` and `markPresentDotDps`
  (`advanceTimeMark`); stage 2's DoT is authored as the target's *remaining
  HP* and stage 3 is an instant kill, so there is no `/data` magnitude to
  multiply. Pinned per stage, plus a row asserting the schema still authors no
  `markFuture*Dps` — the day it does, potency should reach it and that row says
  so. (Asked of the authored keys rather than a property access: naming a
  field the schema does not have would not compile.)
- **Five mutations, all caught, in both directions**: `active1PotencyMul`
  always 1 -> 13 red; potency dropped from `fireFrostNova` alone -> exactly 1
  red, naming cryomancer; potency *added* to `fireBloodTithe` -> 2 red (both
  deviation rows); card applied but rank ignored -> 13 red; card lookup
  ignoring class ownership -> 11 red.

### c014 follow-ups (in this lane, filed by code review's second pass)

- [x] (c025) [polish] **DONE 2026-09-05.** **`tests/class-kit-whiff.test.ts` converts to the shared
      board, all but one row.** `c014` exempted the whole file; review showed
      the exemption is broader than its reason. Only the Ice Wall row
      (`expect([AX, AY]).toEqual([12, 10])`) is coupled to the out-of-Scope
      `tests/p6d-nine-classes.test.ts`; the rest builds at `AX = WX + 2` and is
      exactly the harness c014 exists to fold in — and converting would break
      the p6d agreement *loudly on that one row*, not silently, which is the
      alarm you want. The blocker is narrow: whiff builds a three-tile vertical
      wall at `AX, WY-1..WY+1` and `tests/class-board.ts` exports one tile, not
      a column. `footprintClear` already validates that column (it lies inside
      the probed rectangle), so the work is to export it. Acceptance:
      `class-board.ts` exports the probed wall column; `class-kit-whiff`
      imports `WX`/`WY` and the column, keeps line 620's literal with its p6d
      comment, and drops out of `class-board.test.ts`'s `EXCEPTIONS` except for
      that row; all 58 whiff tests stay green and a shifted probe origin moves
      them with the other seven - refs: c007, c014, SPEC-FINAL §4.
      **Two acceptance clauses could not hold as written and both had already
      been overtaken by `c026`: "`footprintClear` already validates that
      column" was true of the pre-c026 bounding box and false after it (the
      column is probed explicitly now, on its own rung of the ladder), and
      "keeps line 620's literal" described an absolute-tile agreement that
      stopped being this file's tile when terrain moved the board to `10,6` —
      it is an offset now, read out of p6d's own occupancy test.**

- [x] (c026) [polish] **DONE 2026-09-05 (forced by the master merge).** **`footprintClear`'s rectangle is a bounding box, and it
      is expensive.** It requires all 128 tiles of
      `(1 + EAST_REACH + 1) x (1 + SOUTH_REACH + 1)` buildable, while the deep
      east arm is only used along row `WY`. On the empty shipped board only 119
      of 720 spots qualify, and under obstacle density `p` a candidate survives
      with `(1-p)^128`, so at a few percent density `probeBoard` throws at
      module load instead of walking — a named failure rather than six
      confusing ones, but not the unlimited walk the header could be read to
      promise (the header now says so; this item is the fix). Acceptance:
      the footprint becomes the union of the shapes the importers really use
      (the east arm along `WY` only, the near box around the Warden), derived
      from their sources the way the `EAST_REACH` row already scans them; the
      shipped board still probes to `10,10`; and a simulated obstacle density
      that today throws instead relocates the board with all seven files green
      - refs: c014, BACKLOG-TERRAIN.md.

### For the main lane (out of this lane's Scope)

- **Re-read the whole G8 roster on the current tree, and separate the causes**
  (c030). The candidates are `p12c`'s `baseHpMul: 20` (the first one to try —
  a roster-wide T1 enemy-HP multiplier), `p12a`'s kit re-anchor, `fb076`,
  `fb099`, `fb054` and `fb077`'s terrain; `p12b` is inert at T1. This lane re-measured its own two
  deferred numbers and both moved a long way: Time Lord 12/12 -> 11/12, and the
  12-class kit-share sweep from "12/12 win for eleven classes, 2/12 distinct
  top sources" to "five classes inside G8's literal 35-70% band, 1/12
  distinct". Every other per-class number in STATUS.md and in `p6e`/`p10z` is
  in the same position. Both of this lane's readings are **T1** while `p6e`
  now runs at `GATE_TIER` = 3, so the re-read has a tier question in it as
  well as an attribution one; `p12d` owns the gate text.

- **`tests/equip-spec-ledger.ts` -> `tests/spec-ledger.ts`** (c028). The module
  is ledger-generic — `c027` uses it on the §4 ledger, which is about classes —
  and carries the `equip-` prefix only because this lane's Scope allows new
  test files under `tests/class-*` and `tests/equip-*` and nothing else. A
  two-file rename plus four literals (the import in `equip-spec-numbers`, the
  skip-list and the two paths in its own test).


### c014 (2026-09-05) — six copies of one board, and the anchors that had to be rewritten twice

- **Shape**: new `tests/class-board.ts` probes a Warden spot and a build tile
  with `checkBuild` (the side-effect-free half of `buildTower`,
  `tilePastBaseRange`'s convention) and exports `WX`/`WY`/`BUILD_TX`/`BUILD_TY`.
  Seven files import it: c005/c006/c009/c011/c016's five, c013's
  `class-wide-grove-reach` (whose *private* probe folded in), and
  `class-deeper-draw` — an eighth pinned file nobody had noticed. No `/src` or
  `/data` byte moved (`git diff -- src data` empty). 457 tests green.
- **The scan starts at `10,10` on purpose, and that is a baseline, not a
  hardcode.** The origin is the first candidate the ring scan tries and is
  discarded like any other if it fails. Starting it where the files stand today
  keeps every window and margin they calibrated (Core distance, board edges,
  chain-line room) where it was — CLAUDE.md's rule that a refactor must not
  move a baseline it is not measuring. `class-board.test.ts` shifts the origin
  to prove the geometry follows it.
- **Code review found the module terrain-blind where it mattered most, and it
  was right.** The first draft's `footprintClear` rejected only border and Core
  tiles — static geometry — and gave a real `checkBuild` to exactly one tile.
  A terrain map leaving `11,10` open and turning `14..23,10` to rock would have
  passed it and reddened `class-passive-liveness` anyway, because
  `tilePastBaseRange` scans `dx = 4..13` for an `'out_of_range'` answer and
  `checkBuild` tests `grid.buildable` *first*, so a rock tile answers
  `'occupied'` and the scan finds nothing. The whole footprint is now asked of
  the live `Grid`. Rehearsed: a rock patch over `8..12,8..12` relocates the
  board to `14,12` and all seven files stay green; a north band with no room
  left throws one named harness error instead of six confusing ones.
- **The anti-re-pin anchors were rewritten twice.** The first draft asserted
  `^const W[XY]` and "no literal tile pair in a build call"; review ran six
  realistic re-pin shapes past them and **five got through** (indented `const`,
  `const PARK = {tx,ty}`, `let WX2`, a prettier-wrapped multi-line build call,
  a renamed `const TX = 11`, and `tower(w, WX+1, WY)` without spaces). A
  negative anchored on two exact names cannot survive a rename. The rule is now
  stated at the two *sinks* a rename cannot escape — every `w.warden.x/y` write
  must be the imported symbol, every build call must end in the shared tile —
  with the literal-pin negative kept only as a second opinion. **All six shapes
  are now caught**, re-measured the same way.
  - The second rewrite was the extractor: `(?:place|tower)\(` matched
    `replace(`, and `[\s\S]{0,200}?\)` stopped at the first inner paren, so
    `buildTower(w, c.towerByKey.get(SPIRE)!.id, BUILD_TX, BUILD_TY)` parsed as
    the argument list `w, c.towerByKey.get(SPIRE`. An anchor that mis-parses
    correct code gets loosened until it passes on anything, so it walks parens
    now.
- **The importer list is swept, not written.** `IMPORTERS` was a hand list plus
  one hand-named exception, which is why `class-deeper-draw` was invisible to
  the very row claiming the exception "cannot quietly become
  six-plus-one-forgotten". Every `tests/class-*.test.ts` on disk is now subject
  to the rule and escapes only via an `EXCEPTIONS` entry carrying a reason.
- **Two files are deliberately not converted, both measured rather than
  asserted in prose.**
  - `class-kit-whiff` (c007) — its Ice Wall row exists to state the same whiff
    policy as `tests/p6d-nine-classes.test.ts` and pins the agreement with
    `expect([AX, AY]).toEqual([12, 10])` against p6d's own hardcoded aim point.
    Converting one side alone would leave the two files agreeing about nothing.
    **p6d is outside this lane's Scope**, so the pair moves together from the
    main lane or not at all. `class-board.test.ts` asserts p6d still pins that
    aim point, so the exception lifts itself the day it stops being true.
  - `class-active2-cdr` (c019) — it derives its centre as
    `Math.floor(GRID_W / 2)` and places no tower, so it has no build tile and
    no board to share. The literal-pin rule is narrowed to numeric literals
    precisely so this shape reads as the answer rather than the violation.
- **`class-wide-grove-reach`'s own baseline moved, and review caught that this
  file invoked the don't-move-baselines rule while doing it.** Its deleted
  private probe scanned from `(4,4)` and returned `4,4`; the shared board puts
  it at `11,10`, cutting eastward headroom before the Core column from ~31
  tiles to ~13 (worst-case probe lands near `x = 23.7`). Green, but no longer
  a margin that can go unstated: named in `placeProbed`, and its `dummy` helper
  now asserts board bounds per placement the way `class-line-bonus` already did.
- **`EAST_REACH` is one tile from a collision, and the file says so.** 14 covers
  the deepest offset any importer uses (`tilePastBaseRange`'s `dx < 14`), and it
  is *also* the largest value compatible with the answer staying `10,10`: with
  `GRID_W` 36 and `CORE_X` 25, a reach of 15 puts `10 + 15` on the Core column
  and relocates the board. A row scans the importer sources for their real
  deepest `WX + N` and fails naming the collision, rather than letting a future
  file silently move six suites.

### For the main lane (out of this lane's Scope)

- **`class-kit-whiff` + `p6d-nine-classes` de-hardcode as a pair.** The two
  files agree on the Ice Wall whiff policy through literal `10,10`/`12,10`
  coordinates. Both need to move to `tests/class-board.ts` in one change;
  `tests/p6d-nine-classes.test.ts` is not editable from `lane/content`. Until
  then `class-board.test.ts` holds the exception with an assertion, not a
  comment - refs: c007, c014.

### c017 (2026-09-04) — the pierce cap that could not be raised

- **Fix shape**: one expression in `src/sim/classes.ts` `fireDeadeyeDraw`,
  `Math.min(pierceCap + classLineBonus(w), 1 + floor(held))` ->
  `Math.min(pierceCap, 1 + floor(held)) + classLineBonus(w)`. No `/data` byte
  moved (`git diff -- data` empty). New `tests/class-deeper-draw.test.ts`
  (6 cases, ~40 ms), written failing-first: red at `6 -> 6 -> 6` against an
  expected `[6, 8, 10]`.
- **The item's own proposed fix is inert, and that is measured, not argued.**
  c017 proposed reading the pierce count off the *unclamped* hold. There is no
  unclamped hold: `tickClassCharge` clamps `wd.active1Charge` to
  `chargeCapSeconds` before the sole call site passes it in, so the local
  `held` clamp is redundant rather than binding. QA applied the proposed fix on
  top of the old formula and measured `6 -> 6 -> 6` — identical to the bug — and
  found a pre-existing test that already said so
  (`tests/class-passive-magnitudes.test.ts:435`: "unreachable by holding").
  Unclamping the *accumulator* is the fix that proposal really needs, and it is
  out of Scope twice over: it widens `warden.active1Charge`'s range
  (`src/sim/types.ts`) and two out-of-Scope tests assert that field equals the
  cap exactly (`tests/fb015-equipment.test.ts:253`,
  `tests/p6b-swordsman.test.ts:452`).
- **Why the additive shape is the fix and not a reinterpretation.**
  `min(a, c) + b` is identically `min(a + b, c + b)`, so the card still raises
  the cap its own sentence names — it raises the charge-derived term *as well*,
  which is the only way to raise a cap that something else already holds you
  below. §2 authorises it outright ("base-less stats (armor points, +1 pierce,
  charges) add"). The visible cost is that the bonus also lands on a partial
  charge, pinned deliberately as its own case rather than left to be
  discovered.
- **Two acceptance clauses could not hold as written.**
  - *"`tests/class-spec-numbers.test.ts` stays green unchanged"*: that file (and
    `tests/class-descriptions.test.ts`, which the item did not name) anchor the
    **literal text** of the changed line with whole-line regexes, so any edit to
    it breaks them by construction. Both were re-pointed, both still pin the
    same figure — QA mutated `1 + Math.floor(held)` to confirm the re-pointed
    anchors still go red on the number they exist for. The clause was
    mis-written at filing time; no `/data`-only fix exists that would have
    honoured it (raising `pierceCap` does not bind, raising `chargeCapSeconds`
    moves rank-0 damage compounding).
  - *"a 12-seed control-run pair"*: run as
    `npx tsx tools/sweep.ts --seeds 12 --policies maxbuild,hybrid --class archer`
    either side of the change, **byte-identical** (win 1 · medSurv 594.35 /
    586.15 · medWaves 18 · medLevel 33 / 28 · medKills 25729 / 24125). That is a
    **null instrument, not a control**: `src/bots/policy.ts` never sets
    `TickInput.active1Held`, so no bot run fires Deadeye Draw at all. QA
    confirmed it by replacing the changed line with a `throw` and re-running the
    same sweep — it completed and printed the same table. The real rank-0
    evidence is the unit ladder plus QA's end-state hashes: seeds 1/2/7 driven
    through the real `Run` loop with an input log that actually fires Deadeye
    hash identically either side of the change (`6bb35f43`, `be573ca4`,
    `f33d8931`), while rank>0 runs move in the expected direction. G10's
    dps-optimal-charge assertion is closed-form over `chargeCapSeconds` /
    `compoundPerSecond` / `cooldownSeconds` and never reads `pierceCap`, so it
    could not have moved either way.
- **QA verdict PASS, five bugs filed; the three in Scope are fixed in this
  commit.**
  - *Major, fixed*: the card could have been fat-fingered onto Deadeye's
    **damage** and shipped green through all twelve archer-touching test files —
    every archer observable in the repo counts bodies, never per-hit damage.
    `class-deeper-draw` gained a sixth case reading the first dummy's hp loss
    (falloff scale 1) across ranks 0/1/2; verified red under QA's exact mutant.
  - *Minor, fixed*: the harness budget guard blamed itself for a scope leak. It
    now names both of its causes, because sizing past every cause is not
    available — absorbing a leak that summed all twelve `class_line` cards at
    max rank needs 37 bodies, and 37 run past Deadeye's own 9-tile reach.
  - *Nit, fixed*: `fireDeadeyeDraw`'s docstring called `pierceCap` the rail on
    bodies swept; since c017 it rails the charge-derived count only and the true
    ceiling is `pierceCap + perRank * maxRank` (10, not 6). Also fixed a comment
    in `class-line-bonus` that stated the inverse of its own code after the
    `contentFor` removal, and dropped two rotting `classes.ts:1766` line
    pointers (the clamp is at :1778).

**For the main lane, at the merge** — four things this lane may not touch:

1. **`src/sim/content.ts:705`'s `pierceCap` schema comment is now false.** It
   reads "most enemies one released shot may pass through (a perf rail on '+1
   pierce per full second')"; the real maximum is `pierceCap + perRank *
   maxRank` = 10. It is loader-facing and the Tuner surfaces the field
   (`src/ui/tuner-fields.ts` walks the zod schema generically), so a designer is
   shown a number 40% low.
2. **No automated harness in the repo ever executes a charge-kind Active1**
   (QA's Major, out of Scope: `src/bots/`, `tools/`). `src/bots/policy.ts` never
   sets `active1Held`, so `fireDeadeyeDraw` and `fireCircleSlash` have zero
   integration coverage — every sweep-derived balance claim about Archer or
   Swordsman is a null instrument. `tools/fuzz-input.ts` *does* fuzz the flag at
   0.3, but every config in it hardcodes `classKey: 'engineer'`, whose Active1
   is `repair_heal`, so `tickClassCharge` returns at its `isChargeKind` guard on
   all 10 000 ticks. Cheap first move: `fuzzRun` already takes `classKey` as its
   third parameter — QA ran 24 clean archer/swordsman runs through it by hand.
   Suggested acceptance: a bot run per policy for an archer asserts
   `report.damageByWeapon['class_active'] > 0`.
3. **A QUESTIONS.md entry is owed** (same blocker as c018/c019 — QUESTIONS.md is
   outside this Scope). **Ready to paste**:

   > **A skill card that raises a cap must raise whatever else holds the value
   > below that cap, or it buys nothing.** `min(cap, natural) + bonus` is
   > identically `min(cap + bonus, natural + bonus)`, so adding a `class_line`
   > bonus to a resolved value is not a reinterpretation of "cap +N" — it is
   > the only reading of it that binds when the cap is not the binding term.
   > Authoring rule that follows: a `class_line` card naming a cap is only
   > payable if `/data` puts that cap **below** every other ceiling on the same
   > value. Shipped Archer data put `pierceCap 6` at exactly
   > `1 + chargeCapSeconds`, which is the boundary case, and it was dead.
4. **A `[balance]` follow-up, measured by QA, that no gate catches.** Damage per
   committed second (hold + cooldown) against a 10-wide line: the ratio of the
   best hold to a one-tick tap falls from **4.36x** at rank 0 / no CDR to
   **1.10x** at card rank 2 plus the 0.40 `cdrCap` (`data/warden.json:13`). The
   dps-optimal hold stays 5.00 s in every case so **G10 is not violated** — and
   cannot be, its assertion being closed-form over `/data` — but at max rank
   plus max CDR the incentive to charge at all is a 9% margin. A
   full-charge-only variant of the bonus would keep the 6 -> 8 -> 10 ladder and
   leave partial charges alone; that is a design call, not a defect, which is
   why it is filed rather than taken.

**Fast tier: a pre-existing red set, unrelated to this item and proven so.**
`npm run test:fast` reports `8 failed | 156 passed | 4 skipped` on this tree.
Control pair run in this directory (working files copied aside, `git checkout`
to HEAD, same seven suites, then restored): HEAD fails
`tests/b036-help-fold.test.ts`, `tests/q15-command-domain-fuzz.test.ts` (3
cases) and `tests/q49-price-probe-restore.test.ts` **identically**, with
`tests/b032`/`b034`/`b035` (DOM `Hook timed out in 30000ms`) and `tests/q52`
(Windows `EPERM` on a nested-process scratch dir) flipping between runs on both
trees. None of the seven touch archer pierce. Every `tests/class-*` and
`tests/equip-*` file is green (18 files, 740 tests), as are `p6d`, `act2`,
`fb015`, `fb026` and `p6b-swordsman`. The red set is main-lane/UI-lane work at
the merge; c017 neither caused nor cleared it.

### c019 (2026-09-04) — the cooldown card that cannot buy a summon

- **Fix shape**: test-only. `tests/class-active2-cdr.test.ts` is new (50 cases,
  ~450 ms) and `tests/class-line-bonus.test.ts` gained a signpost paragraph.
  **No `/src` or `/data` byte moved** — `git diff -- src data` is empty, checked
  before and after every measurement quoted here.
- **Acceptance option (b), because (a) is impossible rather than merely out of
  Scope.** Making `engineer_active2_cdr` live on turret *count* means giving the
  cadence room above the cap, which is precisely what `c018` closed. The two are
  in direct tension and c018 wins.
- **For the main lane — a QUESTIONS.md entry is owed and could not be written
  here** (same blocker as c018: QUESTIONS.md is outside this lane's Scope).
  **The decision, ready to paste**:

  > **`active2_cdr` is a cast-rate card, not a summon-count card.** On a class
  > whose Active2 summons against a cap, at any cap rank where a summon
  > outlives a full lap of that cap (`floor((duration - 1/60) / cooldown) >=
  > cap`), the cap binds the count and no cooldown reduction can add a summon.
  > What the card buys there is how fast the board fills to the cap from empty
  > and how young the set on it stays — a younger summon is one placed at a
  > more recent Warden position. Turrets have no HP, so those two are the whole
  > of its remaining value. This is deliberate and is the price of `c018`'s
  > reachable caps; it is **not** a claim that the card never buys summons —
  > see the two exceptions below. Two of the twelve cards are affected today
  > (Engineer *Pop Turret Cooldown*, Animist *Recall Totem Cooldown*); the
  > other ten have no cap to collide with and are plain cast-rate cards.

- **The premise in the item text was one clause too broad, and the file says
  so.** The measured grid, not the argued one:

  | Engineer cap rank | steady-state live turrets by cdr rank 0/1/2 |
  | 0 (cap 2)         | 2.00 -> 2.00 -> 2.00                        |
  | 1 (cap 3)         | 3.00 -> 3.00 -> 3.00                        |
  | 2 (cap 4)         | **3.33 -> 4.00 -> 4.00**                    |

  At the top cap rank a turret outlives only 3 laps of a 4-turret cap, so cdr
  rank 1 really does buy the +0.67 mean turrets c019 itself noted. Asserted as
  its own case, so the deviation cannot overstate itself into "this card never
  buys turrets".
- **A second deviation was found, and it is c019's own last sentence answered.**
  Animist *Recall Totem Cooldown* has the identical dead corner by a different
  route: the totem's cap of **1 is enforced in code**, not `/data`
  (`fireRecallTotem` clears the previous totem), so no `/data` field says
  "cap". It buys **uptime**, not count — 15 s of totem on a 20 s cooldown reads
  0.7492 -> 0.9989 -> 1.0000 across ranks, so the **second rank is worth one
  tenth of one percent**, the first having already covered the whole gap. The
  0.9989 rather than 1.0 is c018's exact-multiple trap shipped and live: a
  −25 % cut of 20 s is exactly the totem's own 15 s duration, so it lapses for
  one tick per cycle, costing nothing.
- **The tripwire that finds the next one is behavioural, not `/data`-scoped.**
  The first draft filtered on `active2.summonCap !== undefined`, concluded
  "exactly one class", and QA proved it blind: deleting the totem's code cap
  left all 45 cases green. It now spams every class's Active2 at its own cdr
  card's max rank and asserts what is actually on the board, which catches a
  `/data` cap, a code cap and a new summoning kit alike.
- **A test file must fail on bad `/data`, never hang on it** — the sharpest
  lesson of this item. The window widens as `2 / perRank` to stay honest under a
  ⚖ nerf, and `SkillCardSchema` puts no positivity constraint on `perRank`, so
  `perRank: 0` divided to `Infinity` and the synchronous tick loop **ran
  forever**: vitest's `testTimeout` cannot interrupt a synchronous loop, so the
  worker hung instead of failing (QA, three reproductions, one a 25-minute
  stall; `perRank: 0.001` was the same root cause in its survivable form,
  turning a 450 ms file into minutes). Now clamped at both ends, with the
  positivity failure reported as a *test* rather than thrown from a `describe`
  body, so the other 49 cases still run.
- **For the main lane — a loader rule is owed** (architecture rule 4: "a loader
  rule that refuses unpayable data is worth more than a comment saying the data
  must be valid"). `SkillCardSchema` (`src/sim/content.ts`) should refuse
  `perRank <= 0`: a skill card worth nothing per rank is unpayable data, and
  every consumer that divides by it inherits the same trap. Out of Scope here.
- **Two new items filed below**: `c020` (the general `cdr` stat's own term in
  `active2CdrFactor` is unpinned anywhere) and `c021` (the twelve
  `active1_potency` cards, the last of the three §6.3 cards with no
  cross-class coverage).
- **A precondition is not optional in a file like this.** Three hostile `/data`
  retunes originally failed with a message blaming the card: cooldown 5.0 s
  (the flat case reported "dipped below the cap" while the guard meant to fire
  first stayed green, because `lapsPerLife` was missing c018's `- DT` — c018's
  own Log warns 5.0 s is the round number the next ⚖ pass reaches for),
  cooldown 4.9 s and 12 s (the age and census cases reported marginal readings
  instead of "the cap no longer holds"). Every observable case in the deviation
  now opens with the invariant it presumes, so a retune names itself.
- **A measurement withdrawn, not quietly kept.** The first draft proved the
  card's second value by walking the Warden and measuring her distance to the
  nearest turret (5.33 -> 4.42 -> 3.28 tiles). QA showed that is a walk
  artifact: it beats against the cast period, and at cooldown 4.9 s or 12 s it
  reads rank 1 *farther* than rank 0. Replaced with the turret set's mean
  **age**, which is what the mechanism owns, is path-independent, and is
  monotone at every one of those cooldowns.
- **For the main lane / `c014`**: this file does **not** join c014's list. Its
  board spot is derived from `grid.ts` (`GRID_W/2`, `GRID_H/2`) and it needs no
  build tile at all, so the terrain epic cannot break it. c014's list stays at
  five.
- **Also for the main lane**: the QA subagent's harness leaves untracked,
  un-ignored scratch in the worktree (`*.qabak`, `tools/_qa_*`). This item was
  committed by explicit path because of it; `.gitignore` should carry both
  patterns.
- **Pre-existing reds, unchanged and proven unrelated by a control run** (the
  fast tier run twice with the new file and once with it removed; the failing
  set is the same and non-deterministic across identical runs):
  `b032`/`b034`/`b035`/`b036` (`beforeAll` vite hook timeout at 30 s),
  `q15` (a 4000 ms wall-clock probe deadline under contention),
  `q28`/`q45`/`q49`/`q52` (EPERM on `bench/.tmp` scratch dirs from nested-tsx
  runs). All pass alone. Same list c018's Log records.

### c018 (2026-09-04) — the two unreachable summon caps

- **Fix shape**: `/data` only, cooldown only — engineer `active2.cooldownSeconds`
  12 -> 3, animist `active1.cooldownSeconds` 16 -> 4. §4.2 authors both
  durations and both caps and `class-spec-numbers` pins them; nothing anywhere
  authors an Active's cooldown, so it was the only free lever. Full measurement
  table in the item entry above.
- **For the main lane — a QUESTIONS.md entry is owed and could not be written
  here.** CLAUDE.md working rule 4 says a design decision like "retune two ⚖
  cooldowns 12->3 and 16->4 because §4.2 authors durations and caps but never
  cooldowns" goes in QUESTIONS.md; `QUESTIONS.md` is outside this lane's Scope
  and the lane protocol says lane sessions leave it alone. Raised by
  code-reviewer on this item. **The decision, ready to paste**: the cadence
  ceiling `floor(duration/cooldown)+1` must reach `summonCap + maxRank*perRank`
  or the §6.3 cap card is dead data; of the three fields that set it, two are
  spec-authored, so the cooldown moves.
- **For the main lane / `c014`**: unchanged — this file still pins `WX/WY =
  10,10` and the `WX+1,WY` build tile, so it stays on c014's list of five.
- **Latent trap now guarded**: the ceiling formula is off by one **at exact
  multiples**. `Run.step` casts before `updateClassSummons` expires, so when
  `duration / cooldown` is an integer the n-th summon is cast on the very tick
  the first dies and they never coexist at a sample point — QA measured
  cooldown 5.0 s against Manifest's 20 s reading 4, not the formula's 5. The
  test now uses `floor((duration - DT) / cooldown) + 1` (`cadenceCeiling`), so
  the guard fires *first* and names the cooldown instead of the ladder failing
  with "live count did not follow the card". **`c018`'s own acceptance text in
  this file carried the same off-by-one** — worth remembering the next time a ⚖
  cooldown pass reaches for a round 5.0 s.
- **New item filed**: `c019` (above), QA's finding that `engineer_active2_cdr`
  is now inert on turret *count*. Partly inherent — a reachable cap and a live
  cooldown card are in direct tension at rank 0 — which is why it is a decision
  to pin rather than a number to nudge.
- **Pre-existing reds the lane merge should know about, each proven unrelated
  to c018 by QA with a byte-identical BEFORE/AFTER control pair, not argued.**
  The full `npm test` is red at this commit for four reasons that predate this
  item:
  - `tests/a3-movement-mandatory.test.ts` — seed 1 expects `defeat_core`, gets
    `defeat_warden` (all 12 seeds `defeat_warden`; 0 class-active casts, since
    stock policies never emit one).
  - `tests/p-core-f-gates.test.ts` G22 — `carnivorous_plant` seed 2 fingerprint
    0.070 and `corpse` seed 2 0.040, both under 0.10. `runCoreScripted` never
    calls `scriptClassKit`, so no Active is ever cast there.
  - `tests/b036-help-fold.test.ts` — **a genuine UI-lane bug, not a flake**:
    `.sw-help` bottom measures 1095.40625 > 1080, identical across
    engineer/swordsman/animist/archer, and `.sw-side` contains no `Cooldown`
    text at all. b036's own header records the original overflow at ~1096.9, so
    its fix has eroded back to ~15 px over. **Belongs to BACKLOG-UI.md.**
  - `b032`/`b034`/`b035` (`beforeAll` hook timeout at 30 s — all three pass with
    `--hookTimeout=120000`), `q15` (a 4000 ms wall-clock probe deadline at
    concurrency 6; passes alone), and `q28`/`q45`/`q49`/`q52` (EPERM on
    `bench/.tmp` scratch dirs from nested-tsx runs; all pass alone) are host
    contention artifacts. The failing set is **non-deterministic across
    identical runs and reproduces on clean `/data`**.
- **Not claimed**: `tests/p6e-class-diversity.test.ts` was not re-run (~1 h, and
  every one of its G8 assertions is `.skip`-ed so it prints nothing). The
  12-seed control pair above, built on p6e's own `runClassScripted` shape, is
  the only G8 measurement — and it covers p6e's one live pin directly by
  measuring `argmax(allDamage)` on both arms.

- (2026-09-03, lane merge) Merged into master. One conflict,
  `fireCrimsonRush`: main wins on the travel (fb053's speed-scaled range),
  c001's Area-scaled half-width kept. Done at the merge: `class-time-lord-band` is in
  `vitest.fast.config.ts`'s exclude list and its
  env gate is dropped (runs under the FULL `npm test`, `TIME_LORD_MEASURE=0`
  opts out); `class-kit-damage-share`'s **stays opt-in**, deliberately —
  its sweep is 12 classes x 12 seeds of full runs (hours) and asserts only
  that rows were recorded, for an item (c002) skipped on Q161 (QUESTIONS
  Q165) — and so it stays in the fast tier, where it costs ~10 ms. p6e's stale "Time Lord has not been run" header corrected. Filed
  from this Log: `lineHit` broadphase + `LINE_HALF_WIDTH` = BACKLOG.md
  **fb081**; Poison Barrel tick cadence (fb062's sim half) = **fb082**;
  `towerArea` key for the two tower passives = **fb083** (QUESTIONS Q163);
  `summonCap` key for c004 = **fb084**; the `content.ts`/shared-file
  enablers for fb056/fb057/fb059/fb061 = **fb085**; Blood Tithe's missing
  lifesteal clause = **fb086**; the three unscaled previews = BACKLOG-UI.md
  **fb115** (filed as fb090); b036's fold regression = **fb114** (filed as fb089) — both renumbered at the 2026-09-04 merge.

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

- (2026-09-03, session 2) **c003 done** — the other entry session 1 marked
  "see the Log" and never wrote, reconstructed from the file it left behind
  (`tests/class-time-lord-band.test.ts`, 12 seeds under `TIME_LORD_MEASURE=1`).
  **c003's premise was stale.** It was written against
  `tests/p6e-class-diversity.test.ts`'s header ("Time Lord has not been run
  through it") and STATUS.md's "11 of 12 classes measured"; main-lane **p10v**
  (commit `17f852d`, an ancestor of this lane) had already added
  `it.skip('time_lord', ...)` at p6e L580 and recorded 12/12. p6e's header,
  560 lines above that case, was simply never updated — and STATUS.md
  inherited it.

  What still earned the file: **p10v's measurement predates c001**, which
  changed the effective footprint of all 24 Actives, Time's r7 mark and Time
  Lock's zone included. c001 measured its blast radius on six classes and on
  G8's diversity pin, but on no class's win-rate band. This is that
  re-measurement, under byte-for-byte p10v's harness, and the answer is that
  **the number did not move**: 12/12 (100%), every seed `victory` at wave 18,
  every one `landslide-win`, identical to p10v seed for seed. Over G8's 70%
  ceiling, not under its 35% floor. The band assertion ships `.skip`-ed with
  its measurement, exactly as p6e's other eleven do — c003's acceptance says
  so in as many words, and per Q160/Q161 no `/data`-only lever has been found
  that moves any class into the band; `p10r` (main lane) owns that.

  The sweep is env-gated (`TIME_LORD_MEASURE=1`) because twelve full T1 runs
  are well past the fast tier's ~60 s per-file budget, and
  `vitest.fast.config.ts`'s exclude list is out of Scope. **At the merge:
  add `tests/class-time-lord-band.test.ts` and
  `tests/class-kit-damage-share.test.ts` to that exclude list and drop both
  env gates.** Ungated, the two cheap invariant cases in each file run in
  ~1 s and are what the fast tier sees today.

- (2026-09-03, session 2) **c004 blocked out of Scope** — the entry session 1
  marked "see the Log" but never wrote. c004's own acceptance requires the
  Animist's `summon cap +1` to be "expressed on the passive in `/data` rather
  than a class-key check in code", and a `ClassPassive.mods` record is a
  **validated `Stats` record**: every key has to be a member of `STAT_KEYS`
  (`src/sim/statkeys.ts`). There is no summon-cap stat key — the list carries
  `towerRange`/`towerDamage`/`towerHp`/`buildRange`/`dashCharges` and 40-odd
  others, and nothing about summons. Adding one is a `statkeys.ts` edit (plus
  its `STAT_KIND`/`Derived` rows in `stats.ts` and the three `summonCap` read
  sites in `classes.ts` at L656/L844/L964), and `statkeys.ts`/`stats.ts` are
  out of Scope. Verified by grep against the live `STAT_KEYS` array, not
  inherited. Main-lane work, or the merge widens this Scope.

- (2026-09-03, session 2) **c005 done** — nothing in the 24 §4 Actives is a
  silent no-op. `tests/class-kit-liveness.test.ts` (50 tests, 0.3 s, fast
  tier) fires every class's Active1 and Active2 once in a real `World` primed
  with whatever that Active needs to act on (an enemy, a built tower, a
  corpse, a poison stack, banked Wrath) and diffs a hand-picked observable
  set — enemy hp/status/dots, `w.areas`, `w.classSummons`, `w.structures`,
  `w.corpses`, `w.timeLockZone`, Warden position/hp/`overloadRemaining`/
  `clarionRemaining`. **All 24 came out live; the item found no bug.** That
  is the result, and it is worth stating plainly rather than dressing up: the
  value delivered is the regression barrier, not a fix.

  Deliberately excluded from the observable set, because each would let the
  exact bug through: `w.fx` (a cast flash is emitted before `fireEffect`
  knows whether anything was in radius), the cooldown/ammo/charge fields
  (paying the cost *is* the p6b symptom), and `w.rng`/`w.gold` (Ice Wall's
  placement loop burns both on a whiff).

  **Two Major strictness holes, both found by code-reviewer and both real.**
  `wd.dashTravel` carried four rows: `startDashTravel` (`wardenmove.ts`) is
  shared by all four dash kinds and does not move `x`/`y` at cast (fb030 made
  a dash a travel), so the flag flipped whether or not the payload ran — a
  Flame Road with its trail loop deleted would have passed. `wd.wrathStored`
  carried Judgement: `fireJudgement` zeroes it *before* its own
  `rawWrath > 0` guard, so it is spent input, not product. Both are out;
  `wd.clarionRemaining` went in (Minor: Clarion Taunt's second product).
  All five affected rows stay green on their real product.

  Verified by mutation rather than argument: with the fix in,
  `if (false && heal > 0) applyHealingToWarden(...)` in `fireCrimsonRush` —
  the exact case review said used to pass — now fails the Bloodlord row, and
  `src/sim/classes.ts` was restored clean (`git diff` empty).

  The last `describe` is c005's harness-honesty clause ("a kind removed from
  the dispatch switch fails the test"). It edits no code: it rebuilds
  `Content` from a copy of `data/classes.json` with one Active's `kind`
  swapped for a kind the *other* slot's switch owns, which is the state a
  deleted `case` leaves behind — the `default` branch. Worth recording for
  whoever writes c007: most such swaps **cannot** get that far, because
  `REQUIRED_EFFECT_FIELDS` refuses the new kind's fields against the old row.
  Only `burst_damage`, `ground_poison`, `frost_nova` and `poison_boost` have
  no required-field row, so the control has to be built from those. That is
  the loader half of c005 working, and it is the reason the switch, not the
  schema, is what this file puts on trial.

- (2026-09-03, session 2) **c005: what QA found, and why the file is stricter
  than it was.** qa-playtester's verdict was PASS on the acceptance criteria —
  it gutted **all 24 Active bodies outright and every one came out red**,
  deleted four real `case`s from the dispatch switch (all caught by *both*
  loops), confirmed the negative control is non-vacuous (mutating the
  `default` branch to pay the cooldown is caught, so the
  `expect(active1Cooldown).toBe(0)` asserts are doing real work), and proved
  no `Content` cache pollution and order-independence under
  `--sequence.shuffle`. It also filed three more holes, two of them the *same
  cost-vs-product confusion* code review had already caught twice. All three
  are fixed and the fixes are verified by re-running QA's own repros:

  - **Raise passed on `w.corpses`.** Consuming corpses is what Raise pays;
    the skeletons are what it produces. With `if (1) continue;` before
    `spawnClassSummon` — corpses spliced, nothing spawned — the row stayed
    green. `corpses` is out of `observe()`; Raise now proves itself on
    `w.classSummons`, and the repro fails as it should.
  - **Blood Tithe passed on the tower's HP payment.** `s.tithed` is the whole
    product (the permanent +25%); `s.hp` shrinking is the cost. Deleting
    `s.tithed = true` left the row green — a tower paying 30% of its HP for
    nothing, strictly worse than a no-op. `hp` stays in `observe()` because
    Field Kit genuinely needs it; instead the Bloodlord row now tithes a
    target already at 1 hp, which `fireBloodTithe`'s `Math.max(1, ...)` floor
    pins immovable, leaving only `tithed` to pass on. Repro now fails.
  - **Ten of the 24 rows fired into a world with no live enemy**, against
    c005's own "with enemies present" wording. `kitWorld` now seeds a
    bystander at distance 10 — outside the largest authored footprint in the
    game (Time's r7), so no row can pass *on* it — and a 51st test makes the
    clause self-enforcing per row.

  Two QA notes taken as documentation rather than fixed, both now in the
  file's header: this is a **liveness gate, not a completeness gate** (an
  Active with two clauses passes on either half; `p6d-nine-classes.test.ts`
  owns the per-clause case, and QA confirmed it catches all four such
  half-guts), and the control block's "three kinds" was a miscount —
  `REQUIRED_EFFECT_FIELDS` covers 18 of 23 kinds, so six are uncovered, of
  which three are usable per slot.

  One risk QA raised that belongs on the **merge checklist**, not in an item:
  the harness hardcodes tile coordinates (`WX=10, WY=10`, tower at `(11,10)`)
  against `cfg()`'s fixed seed. Probed green on 48 seed x class combinations
  today, but when `BACKLOG-TERRAIN.md`'s terrain epic lands this will fail as
  a *harness* error (`'harness could not place a tower'`) rather than a
  product regression.

- (2026-09-03, session 2) Generation rule run scoped to this lane a second
  time (c005 was the last actionable item, so 1 < 3). Grounded in STATUS.md's
  live gate table, SPEC-FINAL §4.1/§4.2 read line by line against
  `data/classes.json` and `src/sim/classes.ts`, and c005's own review
  findings. Appended `c006`-`c010`.

- (2026-09-03, session 2) **New out-of-Scope findings, for the main lane.**
  - **SPEC-FINAL §4.2 Bloodlord *Blood Tithe* is missing a clause.** The row
    reads "tower pays 30% current HP once -> permanently +25% dmg; **its share
    of VS attacks lifesteals +1%**". Only the first half exists: `s.tithed`
    feeds `classTowerDamageMul` (`towers.ts:259`) and nothing else reads it.
    `leech` is a single run-wide Warden stat (`statkeys.ts`, applied in
    `enemies.ts:309`); there is no per-structure VS-share lifesteal anywhere,
    and `vswield.ts` never mentions `tithed`. Same shape as `c004`: the fix
    needs an engine concept this lane cannot add (`vswield.ts` +
    `statkeys.ts`). Not filed as a `c0xx` item for that reason.
  - Two §4.2 clauses that *are* implemented, checked while scoping the above
    so nobody re-opens them: Stormcaller *Overload*'s "electric-tower wires
    pulse at double rate" (`vsspecials.ts` `electricInterval`, and p6d asserts
    it), and Animist *Kinship*'s aura half (`updateClassSummons` applies
    `auraSpeedMul` to summons, `classes.ts:1515`) — though only incidentally,
    which is what `c006` is for.

- (2026-09-03, session 2) **c005 verification, measured not inherited.**
  `tests/class-kit-liveness.test.ts` 50/50; `npx tsc --noEmit` clean;
  `npm run test:fast` **2142 passed / 8 failed**, and every one of the 8 was
  run again standalone rather than waved through as "the usual flakes":

  | file | fast tier | standalone | reading |
  |---|---|---|---|
  | `b032-tower-panel-fold` (2) | red | **green** | load flake (Playwright, port 5173 contention) |
  | `q15-command-domain-fuzz` (3) | red | **green** | load flake |
  | `q49-price-probe-restore` (1) | red | **green** | load flake (EPERM under load) |
  | `q52-m20d-run-a4-bad-key` (1) | red | **green** | load flake (EPERM under load) |
  | `b036-help-fold` (1) | red | **red** | **real, deterministic, pre-existing** |

  Two corrections to c001's own failure ledger fall out of that, both in the
  direction of less hand-waving: `q15`/`q49`/`q52` were recorded there as
  *pre-existing failures* confirmed by a control run, but all three are green
  standalone today — they are load flakes, same family as `b032`. And
  `b036-help-fold` was recorded as a "documented Playwright/EPERM-under-load
  flake, green standalone"; it is **not**. It fails alone, deterministically,
  with `expected 1095.40625 to be less than or equal to 1080` — the
  `.sw-help` hint sits 15 px below the fold with a tower selected and the
  practice panel showing. Nothing in this lane can reach it (it is browser
  layout of `src/ui`), and nothing in this session touched it: session 2's
  entire diff is three new `tests/class-*` files plus this document, none of
  which `b036` imports. **Filed below for the UI lane.**

- (2026-09-03, session 2) **For the UI lane** (`BACKLOG-UI.md`), on top of
  c001's three: `tests/b036-help-fold.test.ts` is red at this lane's HEAD and
  red standalone — `.sw-help`'s bottom edge measures 1095.4 against the
  1080 fold b036 exists to defend, in Training Grounds with a tower selected
  and the practice panel open. Deterministic, reproducible in 4 s with
  `npx vitest run tests/b036-help-fold.test.ts`, and misfiled as a load flake
  in this file's c001 entry. It is a live b036 regression, not a flake.

- (2026-09-03, session 2) **c002's control half is now actually measured and
  recorded** — session 1 flipped the queue entry to "control half measured and
  committed" and left `tests/class-kit-damage-share.test.ts` uncommitted with
  its header pointing at a `-- RECORDED --` block that did not exist. The
  sweep has now been run (`KIT_SHARE_MEASURE=1`, 12 classes x seeds 1-12 =
  144 full T1 runs, 36 min) and the numbers are in that block. Headline:
  **distinct top damage sources 2/12**, against G8's >=9/12.

  Two findings that change how the tune half should be approached, both
  recorded in the test header in full:

  - **The pair is `ballista`/`mortar`, not STATUS.md's
    `ballista`/`spreading_plague`.** Plaguebringer's kit is still its own top
    source, but at 6.40% own-kit share it is under `MATERIALITY_SHARE` (20%,
    Q121) and the metric falls through to the tower key. The *count* is 2
    either way, so no gate reading moved — but anyone diffing against
    STATUS.md's wording will otherwise think something did.

  - **c002's own acceptance clause is written against a premise that is
    false.** It asks that "no class leaves the 35-70% band it is already
    in"; the measurement says **no class is in that band** — win rate is
    12/12 for eleven classes and 11/12 for the Animist, the same
    over-ceiling G8 failure STATUS.md describes. And the diversity gap is
    far wider than "raise kit damage share" implies: the best class puts
    6.40% of its damage through its kit and eight of twelve are under 0.2%,
    so clearing the 20% materiality bar for 9 classes is a 3x-100x per-class
    move from `data/classes.json` alone. The item should be re-scoped when
    the Q161 verdict lands rather than executed as written.

  It doubles as a post-c001 diversity control: `distinct.size === 2` matches
  G8's one un-skipped pin in `tests/p6e-class-diversity.test.ts`, so c001 did
  not move the diversity clause either way.

- (2026-09-03, session 3) **c006 done** — all 12 §4 passives are live, and
  none of the twelve was found broken. As with c005 the value delivered is
  the regression barrier, not a fix. `tests/class-passive-liveness.test.ts`
  (36 tests, ~0.9 s, fast tier — no exclude entry needed, unlike c003's
  env-gated sweep).

  **Session 3 inherited an interrupted session 2.** The working tree held an
  uncommitted 782-line draft of the file *plus* a live mutation hack in
  `src/sim/enemies.ts` (`if (false && cls.passive.kind === 'spreading_plague')`)
  — a file outside this lane's Scope. The hack was reverted before any work
  began; it was a leftover mutation probe, and re-running it confirmed both
  the Spreading Plague row and its kill row go red, which is presumably what
  session 2 was checking when it stopped.

  **The structure.** A passive reaches the sim by four unrelated routes, only
  one of which is a switch — a `passive.kind` hook, `updateClassPassives`'
  per-tick switch, the `passive.mods` fold at `stats.ts:193`, and (for three
  rows) *nothing at all*. Each of the 12 gets a control-class comparison per
  clause; the three prose-only rows (Archer, Stormcaller, Animist) additionally
  **pin the `active1`/`active2` field their clause really lives on**, which is
  what c006 asked for in place of a binding that does not exist.

  **Verified by mutation, not by argument.** 13 code-level mutations across
  all four routes each turn the file red (`classes.ts` L114/L118/L136/L217/
  L1344/L592/L816/L1515, `run.ts` L619/L692, `enemies.ts` L381/L394,
  `stats.ts` L193). The file's own KILLS table mutates `/data` only, so this
  code-level sweep is what proves it survives a *refactor* rather than only a
  data edit. Kinship is pinned to `classes.ts:1515` specifically: mutating
  that site is red while `:1817` is a genuinely different call site (the
  Warden's own basic-attack cadence, verified by reading it).

  **Eight Major findings from code review + QA were fixed before commit**, all
  test-side; no `/src` byte changed. Every one is a verified repro that was
  green before the fix and is red after:
  - *Contagious Flame's trigger was unproven repo-wide* — deleting
    `if (!burning) continue;` turned every enemy into a damage aura with the
    whole suite green. Now `contagiousFlame(..., burning=false)` must read 0.
  - *`freezeHits` was read as harness input* (`?? 5` on both sides), so an
    unbound `/data` field would pass. Now varied via `contentWithout`.
  - *Four rows asserted an intermediate, not the product* — the same
    cost-vs-product confusion that hit c005 five times. Blood Frenzy's
    lifesteal read `leechAccumulator` (deleting the actual
    `applyHealingToWarden` left it green); Guardian Stance's Wrath read
    `wrathStored` (Judgement ignoring it left it green). Both now assert the
    spend, and the Clarion `wrathFraction` banking clause got its own row.
  - *Two two-clause passives had one comparison for two clauses* — Blood
    Frenzy's TD penalty and Guardian Stance's move-reset were both
    undefended. The Blood Frenzy control is the **same class with one number
    neutralised**, not another class: the kits author different
    `basicAttack.dps`, so a cross-class damage comparison measures the
    profile, not the passive (the Bloodlord out-hits the Engineer even while
    penalised — this was tried and rejected on measurement, not taste).
  - *The "including Active attacks" clause* `data/classes.json` spells out was
    untested; Circle Slash and Dash Slash now both have to apply Bleeding.
  - *"and upgrades cost less"* had no row at all (`upgradeCost` is a separate
    reader of `towerCostMul`).
  - *A legal retune turned the file red* — billing one 50-gold spire made
    `towerCost -0.01` round to a 0 saving, breaking the file's own
    no-authored-magnitude convention. The bill now sums every tower in
    `/data`. Re-checked with five legal retunes (`flameDps`, `stanceArmor`,
    `leech`, `freezeHits`, `towerCost`), all green.

  **One QA finding was a false positive and is recorded as such rather than
  chased.** QA reported `passiveOnHit` gutted at `classes.ts:1588`/`:1661`
  leaves the file green and called it a strictness hole. It is not: those two
  sites are the *generic* `fireEffect` arms for `burst_damage`, and
  `passiveOnHit` returns non-empty only for `thousand_cuts`/`frost_touch`.
  `burst_damage` active1 belongs solely to the Pyromancer (`contagious_flame`)
  and **no class has `burst_damage` as active2**, so the argument is already
  empty and the mutation is a semantic no-op — nothing to catch. The
  *reachable* half of that finding was real and is fixed (L333/L397).

  **Deferred to `c011` (filed above), not silently dropped.** c006 is a
  liveness gate, not a completeness gate — c005's convention. Nine
  magnitude/lifetime holes have verified repros and are listed in c011 with
  them; the file's header now states the exclusion explicitly instead of
  leaving it to be discovered.

- (2026-09-03, session 4) **c007 done** — the whiff policy of all 24 Actives is
  pinned, and it turned out to be uniform: **casting always costs.** Every one
  of the 24 pays its full authored cooldown/charge in an empty world, with no
  exception and no partial refund. Thirteen of them change nothing at all while
  doing so; the other eleven still act, because what they do needs no target (a
  dash, a ground cloud, a self-buff window, a totem, a turret, a wall, a time
  zone). `tests/class-kit-whiff.test.ts` (58 tests, ~0.1 s, fast tier).
  **No `/src` or `/data` byte moved** — c007 asked for the policy to be made
  visible, not changed.

  **c007 named six kinds; there are seven.** `raise_skeletons` reaches the same
  place by a different route: its early return is on the summon cap being full,
  not on having no target, so in an empty world it runs to the end and its
  corpse loop simply iterates zero times. The row is in the table with the
  other six and shares their control run.

  **Ice Wall is the one Active an empty world cannot make whiff** — free tiles
  are exactly what it wants, so it reads `acts: true` in the main table and
  gets a second, documented case reproducing p6d's occupied-tiles setup. That
  case fires through `applyCommand`, as p6d does: architecture rule 3 makes the
  Command the player-facing path, and an "agreement" test that called
  `useClassActive2` directly could stay green while a break in the Command's
  aim plumbing reddened p6d — the opposite of agreeing.

  **Verified by mutation, not by argument.** 17 mutations each turn the file
  red: each of the seven kinds ceasing to pay on a whiff, a half-refunded
  cooldown, a half-armed ammo recharge, an empty Ice Wall, an unpaid charge
  release, a degenerate dash, a gutted Raise/Judgement, a whiffed wall that
  keeps the gold it pre-funded, cross-slot over-billing, and a charge kind
  whose Command fires instead of declining. A legal `/data` retune (cooldowns,
  recharges, charge caps and radii x1.3, `maxCharges` +1) stays green, so the
  file pins a policy and not a balance point.

  **Eight findings from code review + QA were fixed before commit**, all
  test-side. Four were Major and three of those were the same mistake in three
  places — an observable that is a *cost* rather than a product, which is
  c005's twice-learned lesson walking back in:
  - *`w.corpses` let a gutted Raise pass.* `fireRaiseSkeletons` splices the
    corpse **before** spawning the skeleton, so `spawnClassSummon` deleted left
    the control green. Removed from the observable set (verified free: no
    empty-world cast touches corpses).
  - *`wd.wrathStored` let a gutted Judgement pass*, for c005's exact reason —
    `fireJudgement` zeroes the bank before its own `rawWrath > 0` guard.
    Removed.
  - *The dash rows claimed movement they never observed.* `startDashTravel`
    only **arms** a travel; `wd.x/y` do not move until `tickDashTravel` runs, so
    a dash clamped to zero distance still read `acts: true`. Rather than
    re-admit `dashTravel`, every row now `settle()`s its cast and the four dash
    rows prove themselves on the Warden actually being elsewhere. That removed
    the file's documented disagreement with c005 entirely: the observable set
    is now c005's exactly, plus `w.tempWalls`.
  - *A per-field price check could not see over-billing.* QA made
    `useClassActive` also set `active2Cooldown` and every row stayed green. The
    bill is now asserted as a whole vector against the untouched one, so
    anything charged beyond the authored price fails whichever slot it lands
    on.
  Plus four smaller ones: the Ice Wall case now pins `gold`/`goldSpent`/
  `towersBuilt`/`towersByKey` (a whiffed wall that kept its pre-funded gold
  passed both this file and p6d); the ammo rows assert the cooldown field stays
  0; the emptiness invariants loop over all 12 classes; and the two charge rows
  no longer assert a literal — they pin p6b's real rule, that a charge kind's
  *Command* declines and bills nothing.

  **One measurement of mine was simply wrong and is corrected here**: an
  earlier draft's header said 15 pure whiffs / 9 acting, carried over from a
  probe taken before dashes were counted. The true split is 13/11, and the file
  now asserts it rather than only stating it.

  **Not filed as bugs, deliberately.** Nothing in the 24 is broken; the item's
  value is the barrier, as with c005 and c006. Whether a whiffed cast *should*
  refund is a design question SPEC-FINAL does not answer — the table is now the
  place that decision would be made, deliberately and with a reason, instead of
  drifting in a refactor.

- (2026-09-03, session 4) **Fast-tier baseline is red without c007**, recorded
  so it is not attributed to this item. QA re-ran the failing set with
  `tests/class-kit-whiff.test.ts` physically removed and four still failed:
  `tests/b032-tower-panel-fold.test.ts` (deterministic, `1095.40625 <= 1080`,
  lane/ui Scope) and `tests/q49-price-probe-restore.test.ts` /
  `tests/q52-m20d-run-a4-bad-key.test.ts` (`EPERM` on `rmSync` under
  `bench/.tmp`, the Windows nested-subprocess file-lock class, b028 family).
  A further five (`b034`, `b035`, `b036`, `q28`, `q45`) failed in the full run
  but passed in isolation and could not be reproduced twice — load-dependent
  flakes, stated as unconfirmed rather than diagnosed. All of these are outside
  this lane's Scope; they belong to BACKLOG.md or lane/ui.

- (2026-09-04, session 5) **c008 done** — every number SPEC-FINAL §4 states out
  loud is now a row in `tests/class-spec-numbers.test.ts` (102 tests, ~0.1 s,
  fast tier). **No `/src` or `/data` byte moved**, exactly as the item required:
  c008 asked for the drift to be made visible, not fixed.

  **89 figures, six statuses: 70 match · 7 retuned · 1 elsewhere · 8 in code ·
  2 unimplemented · 1 defect.** The seven `retuned` rows are the drift c008
  named, and all seven turned out to be *legitimate, logged tunes* — traced to
  their commits rather than to the backlog's summary of them: Paladin's four
  (`stanceArmor` 30->50, `stanceSeconds` 1->0.5, `wrathFraction` 0.60->0.80,
  `wrathDamageMul` 1.50->2.20) and Necromancer's two (`summonDurationSeconds`
  15->24, `summonStatMul` 0.40->0.65) to **p6e** (`0d399cd`), Bloodlord's
  `towerDamage` 0.10->0.04 to **p10s** (`3ce8cb8`). Each row pins *both* the
  spec figure and the shipped value, so a further move is red until it is
  re-authorised here by name — and if a figure is ever restored to spec the
  row must become a `match`, which is what **b026** (`432518d`) already did
  once, putting Clarion Taunt's duration back to 4 s while its four siblings
  were kept.

  **c008's item text named four drifted figures; there are seven.** It missed
  `stanceSeconds` and counted the Paladin package as three. The count is now
  asserted rather than described.

  **Four findings the audit turned up that were not in the item.** None is
  filed as a bug — all four are pre-existing, none is a regression, and each
  is now visible and counted instead of waiting to be rediscovered:
  - **Eight §4 figures live as `/src` literals**, against architecture rule 4
    ("all content and numbers live in `/data`"): Thousand Cuts' 1 Bleeding,
    Spreading Plague's 1 target, Poison Boost's x2, Long Draw's +1 pierce/s,
    Ice Wall's 1x3 footprint, Overload's double wire rate (whose own comment
    calls it "the one clause that is not the authored number"), Time Flow's
    4 s, and Time's four-stage machine. Each is pinned by its source site.
  - **One live defect**: §4.1 says Poison Barrel applies "poison damage every
    second"; `updateAreas` re-applies it every tick at 60 Hz. Already logged
    for the main lane in session 1's fb062 scoping; now it has a test that
    reddens *when the defect is fixed*, so the ledger cannot go on claiming it.
  - **Two clauses the sim has no number for at all**: Animist's summon cap +1
    (`c004`) and Blood Tithe's "+1% lifesteal on its share of VS attacks"
    (session 2's main-lane finding). Both rows redden the day the clause
    lands, in `/data` **or** in `/src`.
  - **Three figures are stated on one §4 slot and authored on another** —
    Conduction's two (`c010`) and Clarion's Wrath fraction, which is on
    Paladin's *passive* row, not `active1`. Values all match; only the
    location is in question, and each row says so and cross-references.

  **The barrier is verified by mutation, never by argument.** Drifting a
  matched value, drifting an authorised value further, *restoring* an
  authorised value to spec, deleting a pinned field, editing §4's own text,
  and changing any of the eleven pinned source literals each turn the file red
  on exactly the right row; a legal retune of a non-§4 field does not.

  **Three rounds of review found eleven real problems in my own file, and the
  three worst were all the same shape — an assertion that could not fail.**
  Recorded because the lesson generalises past this item:
  - *Two figures had no row at all.* Swordsman's "applies 1 Bleeding" and
    Overload's "double rate" were missed on the first pass, and a coverage
    check written per *class* could not see it — Swordsman had three other
    rows. Coverage is now per **slot** (12x4), against a declared `NO_FIGURE`
    table naming the one slot §4 gives no number to (Dash Slash). Three more
    figures were added in the same pass.
  - *The two `unimplemented` rows asserted nothing.* Their only check was
    "not authored in `data/classes.json`", which is true by construction for
    a row that declares no path — so they would have stayed green on the very
    day the clause shipped. Worse, the check read `loadContent()`, and zod
    **strips unknown keys**, so a newly authored field was invisible in
    principle. Now: the raw document, the whole class row, dotted key paths, a
    pinned set of the keys that legitimately match today, *and* a pin on the
    `/src` lines the clause would have to change — because a clause can land
    in code as easily as in data, which the eight `in_code` rows prove.
  - *The `spec` column had nothing holding it to the spec.* Hashing §4's text
    does not stop a drift being laundered by editing `spec` to match it — QA
    demonstrated exactly that. Every row's figure must now appear **verbatim
    in its own class's §4 text**, so laundering means quoting a sentence the
    spec does not contain. (The hash slice also started at §4.1, missing §4's
    framework preamble; it starts at §4 now.)
  - Plus: four source anchors were substring-matchable and survived the number
    being changed (`1 + Math.floor(held)` still matches after `* 2` is
    appended); the key search read one slot when three shipped figures already
    sit on a slot other than the one §4 states them on; and my own path for
    `wrathFraction` was simply wrong — caught by the file's own path-liveness
    check, which is the argument for having it.

  **One claim of mine was false and is corrected in the file**: an earlier
  draft's header said the hash "means a drift cannot be laundered by editing
  `spec`". It does not, on its own; the verbatim-quote check is what does, and
  the header now says so.

  **Known bounds, stated rather than assumed.** The verbatim check slices §4
  per *class*, not per clause, so a short quote could in principle be swapped
  for another clause's in the same class row ("10 s recharge" -> "6 s
  recharge"); sub-slicing table rows by column is more machinery than that
  residual buys. Pyro's "3 Burning" is a `match` on damage and *not* on §3's
  per-application armour shred (one stack shreds 1/s where three would shred
  3) — disclosed on the row, and left alone because §17 keeps Burning stack
  timing open for owner veto.

- (2026-09-04, session 5) **For the main lane / whoever adds class #13.** The
  ledger hard-codes the roster at 12 (`expect(shipped.size).toBe(12)` plus a
  per-class x slot coverage loop), so **fb057 (Madness King) and fb059
  (Voltbolt) will each redden `tests/class-spec-numbers.test.ts`** until their
  §4 figures are added as rows — intended behaviour, but work those items must
  budget for, alongside the `tools/content-census.ts` readers session 1 already
  flagged. QA could not build a 13th class to prove it end to end: the loader
  rejects one earlier, at `vsupgrades.json: class "voltbolt" has no skillCards
  entry` (`content.ts`), so the roster change is genuinely multi-file.

- (2026-09-04, session 5) **`npm run test:fast` is not green on this host, and
  it is not this lane's doing.** Measured four times this session at
  2326-2332 passed / 8-9 failed, with the same failing set every time:
  `b032`/`b034`/`b035`/`b036` (fold-timing, lane/ui Scope) and
  `q15`/`q28`/`q45`/`q49`/`q52` (all `EPERM` on `rmSync` under `bench/.tmp`,
  thrown from the `finally` teardown of nested-`tsx` CLI tests — the tests'
  own assertions pass). The set was measured **before** this session's file
  existed and did not change after it landed, and QA reproduced it with the
  new file physically removed. Consequence for the loop: CLAUDE.md's per-item
  "`test:fast` green" gate cannot currently be met on this machine for reasons
  unrelated to any content item. Worth a main-lane item — retry-with-backoff
  or a handle-release on `RM_RETRY` in the shared test helper.

- (2026-09-04, session 6) **c009 done** — the 12 `towerPassive` rows are the
  last of §4's slots to get a liveness file.
  `tests/class-tower-passive-liveness.test.ts` (39 tests, ~0.3 s, fast tier).
  **No `/src` or `/data` byte moved.**

  **The slot needed its own file because it reaches the sim through five
  unrelated routes, not one.** Seven rows ride `towerPassive.mods` into `Stats`
  (`stats.ts:194`); three are *target*-conditional and resolved once per volley
  into a `TowerClassBonus` carried on the hit (`classTowerBonus` -> `dealHit`);
  Necromancer's is *structure*-conditional and read straight off the class row,
  never through `Stats` (`classTowerDamageMul`); Time Lord's is `kind`-driven
  off a wave clear (`applyChronalSurge`); and Animist's is authored on the
  **global `area` key** for want of a `towerArea`. Only the first route would
  fail loudly on its own.

  **c009's item text says three conditional rows; there are four.**
  Necromancer's below-full-HP clause is a conditional too — a structure-side one
  rather than a target-side one — and it was not in the item's list. Each of the
  four is now measured with its condition met *and* unmet, and each carries the
  Act-I-only `!huntsWarden` default its call site imposes.

  **Reviewed twice; both passes found real defects, and the worst was the same
  shape c008 hit — an assertion that could not fail.** The Stormcaller
  conditional row asserted `w.enemies.length === 0` on a world where the test
  had spawned no enemy: true by construction, never reaching `dealHit`'s actual
  `dealt > 0 && !e.dead` guard. That was one of the three rows c009 names *by
  key*, so the acceptance clause was genuinely unmet while the file was green.
  It now fires the same volley twice — once at a target that survives, once at
  one that dies to it — and watches the bolt itself through Electric's inherent
  r0.8 blast reaching a bystander parked outside the spire's own range.

  **Six further holes, each closed rather than filed** (all were "green while
  the mechanic is broken"): the conditional trio was proven only on the
  synchronous `single` path, so the projectile carriers (`combat.ts:475`/`:542`)
  and the `cone` case — the one in-line shape that rebuilds `HitEffects` instead
  of forwarding `fx` — could each be nulled with the file green; Deep Winter's
  `frozen` half of `frostRemaining > 0 || frozenRemaining > 0` was untested, so
  half the clause could die silently; Chronal Surge's `waveInterval` was unpinned
  in *both* directions (inverting the modulo and deleting it were both green,
  since clearing exactly two waves cannot tell "fired at wave 2" from "fired at
  wave 1" or "fires every wave"); the Chronal Surge shape guard read the
  **zod-parsed** row, which strips unknown keys, so the `bonusDamageMul` it
  existed to catch was invisible to it — the same zod-strips-unknown-keys trap
  c008 recorded, hit again in a different file; and 13 of the 15 signals ignored
  the `classKey` argument the mutation table passed them, so a mis-paired row
  could have measured a different class and still passed.

  **The barrier is verified by mutation, never by argument.** 13 `/src`
  mutations across every route redden it — including subtle ones: dropping only
  the `!e.dead` half of a guard, swapping `towerDamageVsBurning` for
  `towerDamageVsChilled`, reading `'poison'` where the code reads `'burning'`,
  and moving Chronal Surge's interval by one. Retunes do not: `towerHp`
  0.10 -> 0.12 with `towerDamage` 0.04 -> 0.09 and a `stanceArmor` change stays
  green, and so does shrinking **every** non-cadence magnitude to `1e-4` — the
  reason the punching bag is 1e7 hp and not 1e9, where float ULP would have
  quantised a small bonus to nothing.

  **One claim of mine was false and is corrected in the file.** An earlier draft
  said the four conditionals' Act-I-only default is something "no other test
  states". `p6d-nine-classes.test.ts` already states it for Stormcaller
  (`:1138`) and Necromancer (`:599`), and states Pyro's Burning condition at
  `:1100`. What is actually new is the other two classes, the `levelup` phase,
  and the `classTowerBonus` nulling — the header now says that instead.

- (2026-09-04, session 6) **Product finding, for the main lane — tower attack
  speed is quantised to whole 60 Hz ticks, and small bonuses are inert.**
  `tickCooldown` (`types.ts:17`) clamps to `0` rather than carrying the sub-tick
  remainder, and `updateTowers` then does `s.cooldown += interval` from that
  exact `0` — so the remainder is **discarded every shot instead of
  accumulating**. A tower's rate of fire is therefore
  `ceil(interval / (dt * speed))` ticks per shot, independently each shot.
  Measured on the Arrow Spire (interval 0.7143 = 42.86 ticks): +0% and +2% both
  fire every **43** ticks; +3% is the first step that moves it, to 42. So any
  `towerAttackSpeed` bonus under ~2.4% changes nothing at all for that tower,
  and the threshold differs per tower because it depends on the authored
  interval.

  Out of this lane's Scope (`towers.ts`, `types.ts`) and **not filed as a bug**
  — it may well be intended, and it is only visible at magnitudes far below
  anything shipped (Wind Slash is +10%). Recorded because it has two
  consequences somebody will otherwise rediscover: a balance pass that tunes
  `towerAttackSpeed` in small steps will find some of those steps do literally
  nothing, and it is the one place where c009's "a retune must not turn this
  file red" convention had to be given a **declared exception** — a retune below
  the tick floor does not shrink Wind Slash, it kills it, and a liveness file
  that stayed green through that would be lying. That row asserts the boundary
  explicitly and fails with a message naming the retune.

- (2026-09-04, session 6) **`q15-command-domain-fuzz` is no longer a load
  flake.** This file's earlier entries record `q15` as red-under-load /
  green-standalone. That is no longer true on this host: it now fails
  **standalone**, with a *varying* count of 2-4 tests across runs, and all 66
  recorded entries read `"hangs"` — the signature of the worker-subprocess probe
  timing out wholesale, not 66 new command-domain holes. Verified pre-existing
  and unrelated to c009 by re-running it with the new test file physically moved
  out of `tests/`; QA reproduced the same baseline independently. Same family as
  the `EPERM`-on-`rmSync` failures already logged above, and it belongs to the
  same main-lane item: the shared nested-process test helper needs a
  retry/handle-release, or these suites need to leave the fast tier.
  `b036-help-fold` also still fails standalone — already logged above as a live
  lane/ui regression, not a flake.

- (2026-09-04, session 6) **For the merge / the terrain epic.** Like c005 and
  c006 before it, `tests/class-tower-passive-liveness.test.ts` hardcodes a
  Warden position and build tiles (`WX/WY = 10,10`, tower at `11,10`) against
  `cfg()`'s fixed seed. When `BACKLOG-TERRAIN.md`'s generation epic lands, these
  fail as `harness could not build ...` — a harness error, not a product
  regression. The three files should be re-pointed at a probed tile together.

- (2026-09-04, session 7) **c010 is BLOCKED out of Scope.** Moving
  `chainGrowth`/`chainCap` off `active1` onto the passive row needs three files
  this lane may not edit, and the block is structural rather than cosmetic:
  1. `src/sim/content.ts:1288` — `REQUIRED_EFFECT_FIELDS.chain_lightning` is
     `['chainCount', 'chainGrowth', 'chainCap']`, so the loader **refuses** a
     `chain_lightning` `active1` the moment those two fields leave it. c010
     cannot even load its own data without this line changing.
  2. `tests/p6d-nine-classes.test.ts` — **five** sites read them off `active1`:
     `:116` (the loader-refusal case for `chain_lightning`/`chainGrowth`), and
     `:226`, `:227`, `:231`, `:249` (G11's ceiling and the per-jump growth).
     These are the very assertions c010's acceptance says to re-measure as a
     control pair, and they are main-lane.
  3. `tests/q7-loader-holes.ts:248,250` — the fuzz corpus addresses both by the
     path `classes.classes[].active1.chainCap` / `...chainGrowth`.
  Keeping them on `active1` *and* authoring them on the passive would satisfy
  the loader but duplicate the number, which is what architecture rule 4 is
  against, so there is no in-Scope partial. `tests/class-passive-liveness.test.ts:732`
  already carries the pin c010 has to update; nothing else here needs doing
  until the merge widens this Scope or the main lane takes it.

- (2026-09-04, session 7) **Generation rule run** (2 actionable items left, under
  the 3 the rule names). Sweep (12 seeds, `maxbuild`/`hybrid`) reports win rate
  **1.0 for both policies**, medSurv ~594 s, medMin ~34 — the same over-ceiling
  shape STATUS records for G8 and G23, unmoved and not a lane matter. Diffing
  §4/§7 coverage against the code produced four items and HANDOFF §7's depth
  clause one more; appended `c012`-`c016`, ordered by value. Two of them come
  straight out of this session's work: **c013** is the Wide Grove `area`
  over-reach `c009` logged and never filed (and `c001` widened it without anyone
  re-checking), and **c014** is the hardcoded-board assumption `c005`, `c006`
  and `c009` have now each logged separately, which the terrain epic will break
  in all four files at once.

- (2026-09-04, session 7) **c011 done** — the nine magnitude/lifetime holes
  `c006` deferred are closed. `tests/class-passive-magnitudes.test.ts`
  (27 tests, ~0.2 s, fast tier). **No `/src` or `/data` byte moved.**

  **Three of the nine were not reachable the way the item assumed**, and each is
  a finding rather than a detail:
  - *Frost Touch's lapse reset* is **dead code on shipped content**. `frost` and
    `frost_track` ride the same `onHit` list in that order and `passiveOnHit` is
    its only producer, so the branch never sees a banked stack; a `slowImmune`
    target reaches it but has nothing banked, because the increment sits inside
    the same `if`. Deleting it changes nothing a player can see. Pinned at
    `applyOnHit` anyway — it is what makes "while frosted" mean anything — and
    the reordered-`onHit` seam is real: swapping the two reddens five cases.
  - *Kinship's `mul *=`* is unreachable by casting, because `fireRecallTotem`
    evicts the standing totem first. That eviction was itself untested, so the
    row now asserts the replace rule through real casts **and** the
    multiplicative combination on a directly-built second aura.
  - *`chargeCapSeconds` has three independent clamps*, not one. The first draft
    read only released damage and stayed green with the accumulator clamp
    deleted; the second still had no case for `circleSlashValues`, which is on
    the *other* charge kind.

  **Reviewed and QA'd; both found defects, and the worst were mine.** Code
  review found the header claiming all three clamps had a case when one did not
  — the same false-claim shape `c009` recorded — plus two undeclared cross-field
  dependencies (the chain harness had **zero** margin against `chainCount`, and
  the aura cases silently needed spirits to outlive the totem) and a census that
  could not fail. QA then found the census's *replacement* could not fail
  either, in a worse way: registering coverage inside the `it` bodies made `-t`
  and `--sequence.shuffle` report "all nine holes were dropped", a harness
  artefact wearing a product regression's message. It registers at collection
  time now.

  **QA found two Major holes where the case was green while the mechanic was
  broken**, both of the "the scenario is too clean to tell two formulas apart"
  kind:
  - *Time Flow's merge* landed all `cap + 8` hits back-to-back, so every stack
    still had its full window and `dmg / remaining` was numerically identical to
    the *push* formula `dmg / BASE`. Writing the wrong one silently drops 6.9%
    of the overflow at a 2 s-elapsed stack, approaching 100% as the stack nears
    expiry. There is now a case that ages the array by half a window first.
  - *Spreading Plague's transfer* only ever put **one** DoT on the carrier, so
    `dotOutstanding(e)` could be read as `e.dots[0]` with the file green — and a
    carrier owing poison **and** burning is the routine case (a Poison Barrel
    plus any fire tower). There is now a two-type case asserting the sum.
  - A third, Medium: both Kinship lifetime cases were *ratios*, so halving the
    whole `s.remaining -= dt` rate cancelled out and a 15 s totem could buff for
    30 s. The expiry tick is now pinned against the authored one (derived from
    `/data`, so still relative) — the shape the corpse row already had, which is
    why the corpse row caught the identical mutation and these did not.

  **QA also found four legal `/data` retunes that reddened the file** —
  `freezeHits` 1, Chain Surge `radius` 1.8, Animist `summonCap` 1, and (from
  review) `chainCount` 5. The spacing one was a real defect and is fixed by
  deriving link spacing from Electric's blast radius and Chain Surge's reach
  rather than hardcoding 2; the other three are now declared harness
  preconditions that fail with their reason attached, `c009`'s pattern.

  **Verified by mutation, never by argument.** Twenty `/src` mutations redden
  it — every recorded repro, the totem-replace filter, hardcoded `freezeHits`
  and `corpseSeconds`, halved corpse- and summon-decay rates, each of the three
  `chargeCapSeconds` clamps alone, a reordered `FROST_ON_HIT`, merging into the
  longest stack, and QA's two near-miss formulas — and deleting any whole
  `describe` reddens the census by name. A ten-field simultaneous retune leaves
  every case green, as do Chain Surge `radius` 5->1.8 and Electric `radius`
  0.8->1.2. One mutation is **equivalent** and is labelled as such in the file
  rather than chased: the shortest-stack *search loop* cannot matter while every
  Time Flow stack carries the same constant window.

  **One correction to c011's own text.** Hole 9 was not a hole: deleting the
  merge line also reddens `tests/fb013-timelord.test.ts:498`, so row 9 hardens
  existing coverage rather than creating it. It earned its place anyway — that
  incumbent shares the back-to-back blind spot above, and QA confirmed the same
  mutation survives it. **`tests/fb013-timelord.test.ts` is out of this lane's
  Scope**, so the fix there is main-lane work; filed below.

- (2026-09-04, session 7) **For the main lane, out of this lane's Scope.**
  - `tests/fb013-timelord.test.ts:498` ("it caps at maxStacksPerEnemy and folds
    the rest in, losing no damage") has the blind spot c011 just closed in its
    own file: it lands every hit back-to-back, so `damageWarden`'s merge can be
    written as the push formula and it stays green. One line — age the stack
    array before the overflow hits.
  - Two `/src` behaviours neither `class-passive-liveness` nor
    `class-passive-magnitudes` covers, found by QA and judged outside c011's
    claims rather than filed against it: `classes.ts:1517` reading the aura at
    the **Warden's** position instead of the summon's survives both files (aura
    *position*, not lifetime or stacking), and `enemies.ts:474` transferring to
    the enemy nearest the **Warden** instead of the corpse survives both (every
    harness geometry in these files is collinear).
  - Two "hardcode a `/data` number in `/src`" mutations also survive both:
    `run.ts:625` `maxStacksPerEnemy` -> `50` and `classes.ts:1005`
    `auraAtkSpdMul ?? 0` -> `0.15`. The first is out of reach from here because
    this lane's `contentWith` rebuild only patches `classes.json`.
  - `tests/q45-cli-schema-violation.test.ts` joined the `EPERM`-on-`rmSync`
    family (q49/q52) in one QA fast-tier run. Same host condition, same shared
    nested-process helper, same main-lane item.

- (2026-09-04, session 7) **Fast-tier state on this host, unchanged by c011.**
  Four full `test:fast` runs this session (three mine, one QA's): 5-11 failures
  across 6-9 files, all in `b032`/`b034`/`b035`/`b036` (lane/ui fold tests),
  `q15-command-domain-fuzz`, and the `EPERM`-on-`rmSync` family, whose
  membership itself varies — `q49`/`q52` every run, `q45` in two, and
  `q28-cli-error-handling` in one, each on a *harness-control* case rather than
  on what the suite is about. Neither the count nor the file set is stable at
  fixed content, which is the load-dependence already logged above; the skip
  count moves with it too (22 -> 51 between runs, i.e. files bailing early). Attributed by control run: with
  `tests/class-passive-magnitudes.test.ts` physically moved out of `tests/`, the
  four UI-fold files fail identically. No `class-*` suite fails, and
  `git diff --stat -- src data` is empty for this item.

- (2026-09-04, session 8) **c015 done** — every numeral in a class description
  is now bound to the number the sim runs on, in
  `tests/class-descriptions.test.ts` (62 tests). **No `/data` byte changed**;
  `git diff --stat -- src data` is empty for this item.

  - **Two of the item's own premises were stale.** There are **24** description
    strings, not 36: `ClassSlotPassiveSchema` (content.ts:825) gives one to
    `passive` and `towerPassive` only, and `ClassEffectSchema` gives the
    Actives none. The test *asserts* the Actives carry none rather than
    assuming it, so the day one gains a sentence its numerals must be entered
    in the ledger. And Bloodlord *Sanguine Pact* already read "+4%" beside
    `towerDamage 0.04` — `p10s` (3ce8cb8) corrected the sentence in the same
    commit that cut the field, which c008's `retuned` row records. **No class
    was lying about a magnitude on the day c015 ran.** The item was filed off
    the pre-p10s text; the barrier was the real deliverable.
  - **Shape**: 32 claims over 22 sentences, each resolving to `field` (26,
    matches a field on its own slot), `sibling` (2, authored on `active1` —
    Conduction, tracked by `c010`), `in_code` (3, a `/src` literal — rule-4
    debt) or `prose` (1, "counts as 1 attack"). Two sentences state no number
    and sit in `NO_NUMBER`. Census-pinned, so a new deviation cannot be
    absorbed into an existing status.
  - **Ten holes were found by review/QA against drafts of this file and closed;
    every one has a re-run repro that is now red.** The mechanism each closed
    is worth keeping: (1) `in_code` anchors that matched a whole line but never
    read the number in it — QA moved a sentence to "6 s", moved the ledger's
    `value` to 6, and `/^const TIME_FLOW_BASE_SECONDS = 4;$/` still matched, so
    anchors now carry a **capture group** and the source is the authority;
    (2) an ASCII-only sign class — SPEC-FINAL writes `−` (U+2212) on 16 lines,
    so a spec-pasted "−5%" extracted as "5%" and a sign flip was invisible;
    (3) an arbitrary `(v: number) => number` converter, which QA used to
    certify the *original* c015 bug as correct — `as` is now a closed enum;
    (4) **the noun was never checked at all** — QA got eleven lying sentences
    past a draft without touching a numeral (Paladin's "+10% defense and +5
    max HP", Bloodlord's VS/TD halves swapped, Engineer's discount reworded
    "cost 10% more", Necromancer's "below full HP" → "at full HP", and whole
    descriptions permuted between classes, since six tower passives all read
    "+10%" over a `0.10` field). Claims now carry `keywords` checked against
    the numeral's own window; (5) that window then had to be **intersected with
    the `;`/`:`/`,` clause**, because a re-review restored the Engineer lie by
    moving "less" backwards across its own numeral into a span both neighbours
    shared; (6) non-ASCII and spelled-out numerals were invisible, including
    inside the two `NO_NUMBER` rows whose whole job is to assert their sentence
    states no quantity — now refused outright, with word-numbers allowed only
    via a declared `WORD_NUMBERS` table (4 entries today, all counts of an
    event); (7) `absentKey`/`sibling` absence checks that read `loadContent()`
    and were **vacuous because zod strips unknown keys** — both now read the
    raw document, which is the only view in which a newly-authored field is
    visible; plus an unbounded authorisation string (now must carry an item
    id), `keyPaths` skipping arrays, and a group-less-anchor message.
  - **For the main lane — a rule-4 literal the player is shown.** Time Flow's
    "4 s" is `TIME_FLOW_BASE_SECONDS` in `src/sim/run.ts:578`, not a `/data`
    field. A `charDotSeconds` row would need `content.ts`'s schema and
    `run.ts`'s reader, both out of Scope. Pinned by capture group here so it
    cannot drift silently; the fix is main-lane. The other two rule-4 literals
    the player is shown are Thousand Cuts' bleed stack and Long Draw's
    per-second pierce, both in `classes.ts`.
  - **Harness lesson, cost an extra 5-minute run to learn.** Do **not** run
    `npm run test:fast` while a subagent is mutating `/data`:
    `tests/q7-data-fuzz.test.ts` hashes `/data` at start and asserts nothing
    wrote to it, so it failed on a `classes.json` hash mismatch during a run
    that overlapped the QA agent's probes. Green in isolation (38 s) and in the
    quiet re-run. A QA/balance agent and a fast-tier run must not overlap.
  - **Fast tier on this host, quiet run**: 8 files / 5 tests failing —
    `b032`/`b034`/`b035`/`b036` (lane/ui folds), `q15-command-domain-fuzz`
    (hook timeout), and the `EPERM`-on-`rmSync` family `q45`/`q49`/`q52`.
    Exactly the logged baseline; no `class-*` suite fails. All 10 `class-*`
    suites plus `q7` green together: 445 passed / 3 skipped.


- (2026-09-04, c016) **The twelve `class_line` skill-card branches are now
  measured.** `tests/class-line-bonus.test.ts` (33 tests, 0.2 s): one row per
  class, each building the identical world at rank 0, 1 and 2 and requiring its
  observable to move strictly in the card's direction at *both* steps.
  - **The item understated the scope.** It named six branches "at least";
    `classLineBonus` is read at exactly twelve sites, one per class, in three
    files: `classes.ts` (nine), `enemies.ts` (plaguebringer's transfer count,
    cryomancer's freeze threshold) and `towers.ts` (bloodlord's tithe
    multiplier). A census reads the `class_line` set straight out of
    `data/vsupgrades.json` and requires it to equal the rows measured, so
    `fb057`/`fb059`'s 13th and 14th classes cannot arrive without one. QA
    confirmed it bites: a realistic 13th class turns exactly that assertion red.
  - **Barrier verified by mutation, fourteen for fourteen.** Deleting each
    `+ classLineBonus(w)` term on its own turns only its own row red; so does
    `towers.ts`' near-miss `(titheDamageMul + bonus) * potency`, which the first
    draft missed and a dedicated case now catches. QA independently ran 24 more
    (`Math.floor` the bonus, clamp to one rank, pay only from rank 2, read the
    max rank in the record) — all red. `src/` restored clean after every one.
  - **The class-scoping half catches a `skillCardRanks` *leak*, not the
    `[w.cfg.classKey]` index.** The header said the latter; QA proved otherwise
    — dropping the index makes every class resolve the swordsman's card, which
    the ladders catch on their own (23 failures). A leak that spares the ladder
    fails exactly these 12. Header corrected rather than the case dropped.
  - **Two review rounds, both material, both fixed before commit.**
    `code-reviewer` returned REQUEST-CHANGES and QA returned PASS-with-bugs on
    the *same* Major: every scenario size was a literal sized against today's
    `/data`, so the file's own "a retune must not turn this red" promise was
    false. QA measured it — **8 of 17 plausible retunes were red**, each with a
    message blaming the card (`summonCap` 2->6 read "4 -> 4" as a dead branch).
    All budgets are now `field + maxRank * perRank + slack` read off `/data`,
    and a row that still runs out says **"harness budget"**. Re-measured: seven
    of those retunes are green, and the eighth (`freezeHits` 5->2, which
    `Math.max(1, ...)` genuinely flattens) now fails naming the retune.
  - **QA also found the stormcaller row's stated mechanism was wrong.** It
    spaced its line at exactly 0.8 tiles — `electric`'s own inherent splash
    radius (`data/damagetypes.json`), so "enemies struck" was jumps *plus*
    boundary-dependent splash and read 6/8/10 by coincidence. Spacing is now
    1.2 (`enemiesInRadius` compares centre distance, so 0.8 is the real
    threshold) and the row asserts struck == `chainCount + bonus`, pinning the
    separation instead of assuming it.
  - **Found two real game bugs, both filed with their regression test already
    in place**, both of the same shape — a card that is live in code and inert
    in a run:
    - `c017` (mine): Archer *Deeper Draw*. `min(pierceCap + bonus, 1 +
      floor(held))` with `held` clamped to `chargeCapSeconds 5` against
      `pierceCap 6` — the right term is 6 at any hold, so +2/rank never binds.
      QA independently confirmed no equipment, tree node, boon or modifier
      touches either field, and `cls.active1` is never mutated at runtime.
    - `c018` (QA's): Engineer *Extra Turret* and Animist *Kindred Spirits* raise
      a summon cap the cast cadence cannot reach (`floor(duration / cooldown)
      + 1` is 1 and 2 against caps of 2 and 3). The `c016` rows measure the
      *cap* with cooldowns bypassed, which is right for a cap and wrong for a
      run; the deviation `describe` measures the run through the real
      `updateWarden` tick and `updateClassSummons` expiry.
    Each deviation is a tripwire plus a companion: the flat shipped reading is
    pinned (red the day the fix lands), and the branch is separately proved live
    against a `/data` copy with the binding constraint lifted. The Archer's
    override is **self-expiring** — gated on the predicate that makes the bug
    true — so it cannot silently substitute edited `/data` forever.
  - **Stated limitation, deliberately not smuggled in.** `perRank` itself is
    unpinned: a `classLineBonus` returning the raw rank keeps 11 of 12 rows
    green (QA). That is magnitude — `c011`'s job for the passives — and it has
    no sibling here. **Candidate item for the next generation round**, together
    with `active2_cdr`, whose only behavioural coverage anywhere is a HUD
    readout in `tests/fb026-bottom-bar.test.ts`.
  - **For the main lane / `c014`**: this file adds a fifth `WX/WY = 10,10` +
    `WX+1,WY` build-tile harness to the four `c014` already names, and c014's
    item text has been updated to say five.

### c012 (2026-09-04) — the owner table that was only ever compared to itself

- **Shape**: one new file, `tests/equip-spec-numbers.test.ts` (114 tests,
  ~120 ms). **No `/data` and no `/src` byte moved** — `git diff` against
  tracked files empty at the commit, which the item required and which nothing
  needed to break: every one of §7's figures is authored correctly today. The
  deliverable is the barrier, not a fix.
- **73 ledger rows**: 60 numeric (12 items x §7's HP/Atk/Def/AtkSpd/Move), 13
  Effect (9 effect stats, the 3 `classFallback` compensation lines as rows of
  their own per the item's wording, 1 `in_code`). Census pinned at
  **72 match · 0 retuned · 1 in code**. Plus 3 `NO_FIGURE` cells (the three
  `none` effects) and 7 `RULES` clauses (4 in cells, 3 in §7's preamble).
- **c008's device does not port, and pretending it did would have been the
  whole item wasted.** c008 pins its `spec` column by requiring the figure to
  appear *verbatim in the spec*. §7 is a **table**: the verbatim text of
  greatsword's HP cell is `0`. So §7's table is **parsed**, and every numeric
  row's `spec` is checked against the parsed cell — strictly stronger than
  c008's quote, because there is nothing to word around. The Effect column is
  prose and keeps c008's quote, plus a `fromQuote` that extracts the numeral
  back out of the quote so `spec` cannot drift from the sentence it cites.
- **Absence is 22 of the assertions.** §7 states `0`/`×1` cells and
  `equipment.json` authors those by *omitting* the key (0 is the identity for a
  flat stat and for `stats.ts`'s `1 + v` multipliers alike). The mutation check
  *creates* the key it bumps, which is what makes those rows real rather than
  decorative — authoring `maxHp: 1` on the greatsword reddens its HP row.
- **18 mutations, all red; control green.** Drift a column · launder it by
  editing `/data` **and** SPEC-FINAL's cell together (3 failed) · spurious key
  on a `0` column · a stat no row audits · `leech` mis-scaled 100x (the
  plausible percent slip) · drop a `classFallback` (4 failed) · delete the
  `x2` in `classes.ts` · swap a `notClassKey` · reorder §7's slot list ·
  rename an anchored `it()` in `fb015-equipment.test.ts` · six desc edits ·
  a fabricated authorisation id · and the five QA repros below.
- **Code review (REQUEST-CHANGES) and QA (PASS, 5 findings) both found the
  ledger asserting less than its own header claimed.** Every finding was fixed
  in this item rather than deferred; the two Major ones were live holes of
  exactly the kind c012 exists to close:
  - *Review, Major*: the three fallback rows quoted §7's whole condition
    ("if not Swordsman: ×1.1 movement") but read only the magnitude, so
    `notClassKey` was **unaudited repo-wide** — changing `swordsman_shoes`'
    to any class but `engineer` left the entire suite green. `fb015`'s own
    withholding test derives the class from the data it is checking.
  - *QA, Major*: §7 could **gain** a figure inside an already-covered cell and
    the file stayed green — coverage was per cell, so one row satisfied a cell
    forever, and the only tripwire was the hash, whose failure message tells
    you to regenerate it. QA did exactly that and shipped two unaudited §7
    figures. Closed by a **residue check**: strike every claimed quote/clause
    out of a cell and the leftover must contain no numeral; also split on `;`
    and require every clause to be claimed. That closed the review's separate
    "`RULES` is pure opt-in" finding for free — emptying `RULES` to `[]` used
    to be green at the same test count, and is now red.
  - *QA, Major*: the desc audit bound HP/Atk/Def and the two multipliers and
    stopped, leaving every Effect numeral in `desc` unbound. QA changed six
    descs — including two that **invert** a §7 rule ("lifesteal does not apply
    to Bleeding damage", "Character range -40%") — with `mods` untouched and
    everything green. Now every Effect row asserts its own figure in the desc.
  - Also fixed: `NO_FIGURE` could excuse a *numeric* cell (the `'none'` guard
    read the item's Effect cell whatever column the excuse named); the
    `in_code` row's `spec: 2` was asserted against nothing (now captured out of
    `classes.ts`); the numeric column -> stat-key mapping was unpinned for
    every `0`/`×1` cell; the authorisation guard was a shape regex under an
    assertion titled "that can be looked up" (QA authorised a real drift with
    `Q9999 / c999`) and now looks the id up in `BACKLOG*.md`/`QUESTIONS.md`;
    the slot list was hardcoded next to a `toContain` that proved nothing.
- **Two bugs this file found in itself, both while being written**, and both
  worth naming because they are the failure mode a ledger is most exposed to —
  an assertion that cannot fail:
  - a greedy `[\d.]+` swallowed the descs' sentence period, so `Number("0.9.")`
    was `NaN` and four rows compared `NaN` to a spec figure;
  - Sleeve Sword states `atk speed x1.2` **twice** in its desc, once as its
    column and once in its "If not Swordsman" sentence, so deleting the column
    outright was green until the search was narrowed to the stats clause.
- **The header was corrected, not just the code.** An earlier draft claimed
  that moving a number requires "a status row that names who authorised it".
  It does not: a coordinated `/data` + §7 + hash edit leaves the row a `match`.
  No test can tell an owner retune from a laundered drift — the real guarantee
  is that the retune is *visible*, as a spec diff and a hash line in the same
  commit. The header now says that and nothing more.
- **Two reach divergences named, not one.** `c013` already tracks Normal
  Bracelet's `+10%` being right on the global `area` key. QA/review surfaced
  the exact twin: §7 says "tower **upgrade** cost" while `towerCost` also
  discounts the build price. That one is *settled* — **Q136(1)**, owner verdict
  "approved, all four calls" — and `charRange`'s scope is **Q136(3)**. Both now
  carry a `note`, because a reach that was checked and found authorised reads
  identically to one nobody looked at unless it says so.
- **Filed, not fixed** (both from QA, both new): `c022` — Effect rows pin no
  stat key, so `towerCost` -> `goldFind` with the row edited to match is green
  here and caught only by `fb015`'s hardcoded table, the one c012 exists to
  stop leaning on. `c023` — `equipment.items[].effectKey` is a dead field:
  validated by a zod enum, read by nothing (the sim gates on `hasEquipment`,
  the UI on `effectNote`), and `fb056` would copy the shape 15 more times. Its
  removal touches `src/sim/content.ts` and so is main-lane; `c023` is the
  measurement only.
- **Verification**: `npx tsc --noEmit` clean; targeted file 114/114;
  `npm run test:fast` 2635+ passed / 8 failed files — every failure the
  standing `b032`/`b034`/`b035`/`b036` port-contention, `q15` worker-hang and
  `q45`/`q49`/`q52` Windows scratch-dir `EPERM` family this queue documents
  every session. **Established as pre-existing by control, not assumed**: with
  this file moved out of the tree entirely, the same suites fail identically,
  and the pre-change baseline run had the same 8 failing files. QA
  independently re-ran the money paths (`npm run sim --seed 1 --policy hybrid`
  -> victory, 18 waves + 6 VS, boss killed, `endHash f776bd7a`; a 4-seed
  hybrid sweep; 67 stash/equip tests; 41 cycle/reward/practice/determinism
  tests) — c012 moves no `/data` or `/src` byte, so nothing could regress, and
  that was verified rather than argued.

### c012 (2026-09-04, session 2) — the ledger that minted its own fake ids

The commit above finishes `c012`, which the previous session left **uncommitted
and red at 113/114**. Everything below is that session's deliverable plus this
one's repairs; the item's own acceptance was re-verified from scratch, not
inherited.

- **The bug that stopped it committing is the one worth remembering.** The
  ledger's authorisation guard checked that a `retuned` row names a real
  backlog/Q id by searching `BACKLOG*.md`/`QUESTIONS.md`/`PROGRESS.md` for the
  bare token **anywhere**. The same session's Log entry then wrote the sentence
  "QA authorised a real drift with `Q9999 / c999`" into `BACKLOG-CONTENT.md` —
  and *minted both fabricated ids*, turning the file's own negative control
  red. A test whose corpus includes the prose that documents it cannot use a
  bare mention as evidence: **writing about an id is not filing it.**
- **Fix: an id resolves only at its definition site** — `- [ ] (c012)` /
  `- [x] (p10s)` for backlog ids, `- **Q136.` for QUESTIONS ids, both anchored
  at column 0, where all 263 real item lines and all 160 real Q entries live.
  Strictly stronger than the mention search as well as immune to the file's own
  paper trail: an id appearing only in a `refs:` tail or a Log paragraph no
  longer authorises a moved number, because nothing there decided anything.
- **code-reviewer returned REQUEST-CHANGES; qa-playtester returned PASS on
  acceptance with 6 bugs against the ledger. All were fixed in this item**, in
  the c012 tradition of not deferring the findings a barrier item exists to
  produce. Every one was a live hole:
  - *Review Major / QA Bug 5*: the first version of the fix was still bound to
    live prose — three assertions asked the corpus whether `Q9999` was
    mentioned-but-undefined, so **rewording that one Log sentence reddened the
    ledger with no message saying why**, and `definedAt('c012')` was pinned to
    `['BACKLOG-CONTENT.md']`, which is already false on `master` and which
    CLAUDE.md's lane rule is *scheduled* to break at the merge. The
    mention-vs-definition rule is now a pure `definesIn(text, token)` tested on
    literal strings, and the file pin is a non-empty check.
  - *QA Bug 3*: the id shape regex listed the four families this lane happens
    to use and so **rejected 131 of the repo's 263 real ids** — every `b###`
    (including `b032`/`b076`, which the docs cite as authorities), every
    lowercase `q##`, the `m##`/`t#`/`f00#`/`x00#` families. A retune authorised
    by `b076` could not have been stated at all, and the only ways green were
    to relabel a real authorisation or to edit the guard. A check whose first
    real use trains you to widen it is worse than no check. The shape now takes
    any letters-then-digits token and lets the definition lookup decide.
  - *QA Bug 4 / review m3*: the definition patterns were unanchored, which is
    the same bug one indent in — an **indented quotation** of an item line
    inside a Log bullet, or an inline `**Q9999:**` in a QUESTIONS sentence,
    still minted the id. Both anchored; both shapes asserted as non-definitions.
  - *QA Bug 1*: the clause check split cells on `;` and checked the preamble
    for **numerals only**, so three of the seven `RULES` entries were
    individually inert and a normative sentence without a number went in green
    (QA shipped "Equipment is lost on the Warden's death and must be
    re-bought."). Cells now use a **residue over words** — strike every claim,
    and surviving prose is unclaimed whatever punctuation delivered it — and
    every preamble sentence must be a `RULES` clause or a declared
    `PROSE_EXEMPT` entry. Splitting on `,` was the obvious fix and the wrong
    one: §7 writes "if sleeve sword equipped, Circle Slash damage is boosted
    ..." as one clause, and splitting it would have broken the entry that
    claims it.
  - *QA Bug 2*: a §7 table row that does not parse was **silently skipped** —
    a 13th row one pipe short was invisible while a well-formed one was caught.
    Now a throw naming the row. `fb056` hand-adds 15 rows to that table.
  - *QA Bug 6*: `descQuote`, the file's one hand-typed expectation, was
    unconstrained — widening it from `doubles dash slash distance` to
    `dash slash distance` left the file green with the player-facing desc free
    to state the *opposite* of §7. That is the `EXPECTED_ITEM_MODS` shape c012
    exists to delete, reappearing inside the file that deletes it. An override
    must now keep §7's numerals, still name §7's noun, and inflect rather than
    drop §7's head word.
  - *Review m2/m4*: the definition-file roster is derived by `readdirSync`
    instead of hardcoded — it had named four of the repo's **six** `BACKLOG*.md`
    files, missing `BACKLOG-QUALITY.md` (`q1`-`q57`) and `BACKLOG-TUNER.md` —
    and `authorisationResolves` no longer duplicates `definedAt`'s body.
- **One defeat path found by mutating this file rather than the spec, and it is
  named rather than claimed shut.** The clause rule decides "is there prose
  left?" by subtracting `CONNECTIVES`, so adding a clause's own words to that
  set makes the clause vanish — and the `;` split cannot help, because the
  builder's-necklace parenthetical rides inside the same fragment as the claim
  covering it. No assertion can prevent that edit, exactly as none can tell an
  owner retune from a laundered drift. The set is therefore **pinned**, so
  growing it is a diff on one line with the explanation attached, and the rule
  itself is exercised on synthetic text so it is not tested only through the §7
  the repo ships today.
- **Verification**: targeted file **116/116**; `npx tsc --noEmit` clean.
  Mutations, all red with the control green: descQuote widened · resolver back
  to the mention search · `CONNECTIVES` widened to swallow a clause · a
  `PROSE_EXEMPT` entry deleted · a preamble sentence added **and the hash
  regenerated the way QA did** (the clause check is a different assertion from
  the hash, so regenerating cannot clear it) · an unclaimed parenthetical in a
  covered cell · each of the three previously-inert `RULES` entries deleted ·
  a 7-cell 13th §7 row. `SPEC-FINAL.md` was mutated only inside these repros
  and restored — `git diff -- src data SPEC-FINAL.md QUESTIONS.md` is empty at
  the commit, so c012 still moves no `/data` and no `/src` byte.

**For the main lane (out of this lane's Scope, filed here rather than edited):**
`p6e` is a real, completed backlog id — it is the run that measured G8 honestly
red, cited at `BACKLOG.md:37`, `:871`, `:1087`, `:1099`, with
`tests/p6e-class-diversity.test.ts` named for it — but it is the one member of
`p6a`-`p6f` with **no `- [x] (p6e)` item line anywhere**, so the definition-site
lookup would reject `authorised: 'p6e'`. Found by code-reviewer. The fix is a
one-line entry in `BACKLOG.md`; the failure is loud and its message is
actionable, so nothing is blocked meanwhile.

### c013 (2026-09-04) — the row that says "towers" and means "everything"

`data/classes.json`'s Animist row promises *"All towers +10% area"* and is
authored on §2's **global** `area` key, because `src/sim/statkeys.ts` has no
`towerArea`. `tests/class-wide-grove-reach.test.ts` sizes what that buys.
**Moves no `/data` and no `/src` byte** — `git diff -- src data SPEC-FINAL.md
QUESTIONS.md` is empty at the commit. 67 assertions.

- **The measurement.** Ten `w.derived.areaMul` reads in `src/sim` produce
  **twenty footprints**; every one of them is widened by Wide Grove today, and
  **twelve are not towers** — the Animist's own *Manifest* spirit and *Recall
  Totem*, six VS wielded footprints, and Electric's/Burning's splash off any
  class source. Each is measured against a rebuilt `Content` with the row's one
  `mods.area` key deleted, so the cause is pinned rather than inferred; radii
  where the sim computes one, and an enemy parked in the ring between the
  un-widened and widened footprint where it does not.
- **It is an owner-approved deviation, and the file says so.** QUESTIONS Q120
  item 5 chose the global key deliberately — "over-applying rather than
  inventing a `towerArea` nothing else reads, and flagged for the P10 pass" —
  with an owner verdict of *approved*. What that bought was a deferral, and
  CLAUDE.md's first measurement rule is that a deferral is a measurement with
  an expiry date. Q120 named the expiry and never sized the over-application;
  this file sizes it. Filed by QA on this item, and it changed the header:
  without it a green run reads as an unreported bug.
- **Reads are not consumers, and that distinction is the whole item.** `c001`
  widened this row's blast radius by adding a *caller* (`classArea`), not a
  read, and nobody re-measured. So `CARRIERS` pins the call-site count of the
  six helpers that carry a read out of its own function, counted on the **bare
  name** so a one-line alias is a diff too; a new caller of any of them reddens
  with a message asking for a `CONSUMERS` row.
- **Four of the ten reads serve both routes, which is the finding a
  `towerArea` key alone does not close.** `effectiveTowerAoe`'s two branches
  plus the Electric and Burning sites cannot see who called them, so the key
  swap needs a source check at those four lines. `shared` is **derived** from
  the consumer table (a read is shared exactly when both routes flow through
  it) and compared against a declared set, so it cannot be asserted into
  existence.
- **code-reviewer REQUEST-CHANGES, two Majors, both fixed here.** (1) The two
  `effectiveTowerAoe` rows were filed as `route: 'tower'` — but that helper is
  called by `towerSummonProfile` (`classes.ts:523`) and by four sites in
  `vswield.ts`, so **the Animist's own Active1 was leaking through a read this
  file had marked authorised**, and `LEAKING_TODAY` baked the under-report into
  the red/green target. (2) The completeness guard was read-complete but not
  reach-complete — precisely c001's failure mode, reproduced inside the file
  written to catch it.
- **qa-playtester PASS on acceptance with ten findings; the five that were
  defects are fixed here**, in the c012 tradition of not deferring what a
  barrier item exists to produce. Every one was live:
  - *Bug 1*: **six real `* area` uses were named by the read table and measured
    by nothing** — deleting all six left the file green. `fireTower`'s and
    `fireWielded`'s `area` locals are each read by three to five footprints and
    only one each had a probe. Now covered: TD cone half-angle, TD lob shell
    aoe, the wielded line half-width, the wielded cone half-angle and the
    wielded chain jump range. Two of those are live only behind a §5.2
    milestone, and the tier is asked of `attackProfile` rather than pinned —
    the first attempt hardcoded the special's `at: 3` as tier 3, and a
    milestone's `at: N` lands at **tier N+1**. The file's own sensitivity
    control caught that (both probes measured 0 in *both* worlds) before any
    conclusion was drawn from them, which is exactly what it is for.
  - *Bug 2*: the row named "a Mortar's own shell splash" **did not measure a
    Mortar's shell splash** — `fireTower`'s lob case computes its radius from
    its own inline `(a.aoe ?? 1.5) * area`, never from `effectiveTowerAoe`, so
    the row was measuring the panel's mirror. Renamed to say so, and a real
    behavioural lob probe (build, fire, fly the shell to detonation) added
    beside it, so a fix that moves one number and not the other is caught.
  - *Bugs 3-5*: the guard was a per-line text scan, so `const { areaMul } =
    w.derived`, `w.derived['areaMul']` and a member expression split over two
    lines all walked past it, a one-line alias walked past `CARRIERS`, and a
    **trailing comment quoting the expression turned the file red**. Replaced
    with a string-aware `stripComments` that drops comments and keeps string
    literals — which is the combination that catches the bracket spelling *and*
    tolerates the repo's habit of quoting code in prose. All four mutations
    verified red, the comment one verified green.
  - *Bug 6*: a test named "clears every ring" asserted only `CONTROL_AREA >
    WIDE_GROVE`; it now asserts `1 + CONTROL_AREA > RING`, the property that
    actually matters.
- **Verification**: targeted file **67/67**; `npx tsc --noEmit` clean.
  Mutations, all red with the control green: each of the six `* area` uses
  deleted one at a time · a new caller of `classArea` · a new caller of
  `effectiveTowerAoe` · the three unscanned read spellings · a `classArea`
  alias · `mods.area` moved to another key (26 red) · the aura read unscaled ·
  the lob branch unscaled. Green under the two mutations that must not redden:
  a retune of the row 0.10 -> 0.18, and a trailing comment quoting the
  expression. `git diff --stat src data` empty after every one.

**For the main lane (out of this lane's Scope, filed rather than edited):**
the `towerArea` key itself is already logged above. What this item adds is that
the key is **not sufficient on its own**: four of the ten reads serve both
routes from a line that cannot see its caller, so those need a source check
too, and `tests/class-wide-grove-reach.test.ts`'s `SHARED_READS` names exactly
which four. QA's Time Lord twin (`run.ts:817` adds the same global `area` key,
uncapped, and is the larger over-application of the two) is filed in-lane as
`c024`.
