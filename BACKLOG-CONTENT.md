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
scoped to this lane and appended `c001`-`c005` below them. Run again in
session 2 (c005 was the last actionable one left), appending `c006`-`c010`.

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

- [ ] (c018) [bug] **filed by QA on `c016` 2026-09-04, twice-reproduced, and
      pinned by a tripwire in `tests/class-line-bonus.test.ts`.** Two §6.3 cards
      raise a summon **cap that the Active's own cast cadence can never reach**,
      so buying either changes nothing in a real run. A summon lives
      `summonDurationSeconds` and one arrives every `cooldownSeconds`, so the
      most a player spamming the key can ever hold is
      `floor(duration / cooldown) + 1`:
      - **Engineer *Extra Turret*** (`engineer_turret_cap`, Pop Turret): 12 s
        cooldown / 10 s duration -> ceiling **1** live turret, or 2 with the
        `active2_cdr` card maxed, against a base `summonCap` of 2. (No `/data`
        file grants the `cdr` stat at all — `grep -rn "cdr" data/` returns only
        the twelve `active2_cdr` keys — so `derived.cdr` is 0 in every run and
        6 s is the floor.) `npm run sim -- --seed 1 --policy hybrid` shows a
        real bot spending a level-up on `engineer_turret_cap`.
      - **Animist *Kindred Spirits*** (`animist_spirit_cap`, Manifest): 16 s /
        20 s -> ceiling **2**, against a base `summonCap` of **3** — one point
        of the authored cap is already dead before the card is, and Active1's
        cooldown reads only `1 - derived.cdr`, which `active2_cdr` does not
        touch.
      The regression test is already in place and red-on-fix: the `c018`
      `describe` asserts the flat cadence ceiling across ranks 0/1/2 (driven by
      the real `updateWarden` cooldown tick and `updateClassSummons` expiry, no
      forced resets) and separately proves the branch is live once the cooldown
      is shortened on a `/data` copy. Acceptance: the cadence ceiling reaches
      `summonCap + maxRank * perRank` for both kits — the in-Scope levers are
      `data/classes.json`'s `cooldownSeconds`/`summonDurationSeconds` (Animist
      needs `cooldownSeconds` <= 6.6 s **or** `summonDurationSeconds` >= 33 s
      merely to make the authored cap 3 reachable); the `c018` deviation
      `describe` is deleted and its two rows fold into the ordinary ladder;
      **G8/G11 re-measured as a control-run pair** (`tests/p6d-nine-classes.
      test.ts`, `tests/p6e-class-diversity.test.ts` — the latter is main-lane
      read-only, so a threshold move there is logged, not edited) since this
      one *does* change live summon counts, unlike `c017` - refs: SPEC-FINAL
      §4.2 (Engineer, Animist), §6.3, c016, CLAUDE.md rule 3.

- [ ] (c017) [bug] **filed by `c016` 2026-09-04, and proven by its own tripwire.**
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

- [ ] (c012) [polish] `data/equipment.json` has **no §7 ledger** — `c008`'s
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

- [ ] (c013) [bug] Animist *Wide Grove* is authored on the **global `area`
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

- [ ] (c014) [polish] the four §4 liveness files **share a hardcoded board
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
      spot and the same `11,10` build tile, and joins this item's list** - refs:
      BACKLOG-TERRAIN.md, c005, c006, c009, c016.
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
