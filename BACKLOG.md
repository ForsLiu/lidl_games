# BACKLOG.md — ordered work queue (SPEC-FINAL)

Format: `- [ ] (id) [type] title — acceptance: <objective check> — refs: <spec §>`
Loop mode executes the top actionable item. Completed items move to the Done
section with the commit hash.

**Rewritten at the SPEC-FINAL migration** (SPEC-FINAL §16). The queue is ordered
by §15's **P0 → P10** build order. The SPEC-V3 queue (M17–M27) is closed out in
the Done section; items it never reached are re-filed below under their P, and
the ones SPEC-FINAL decided outright (m20e, and Q80's tower-track sign-off) are
closed as **decided by spec** rather than skipped. The audit behind every item
is MIGRATION.md.

**Corrections outrank gaps.** The two items in the first section are places
where shipped code asserts the *opposite* of authoritative SPEC-FINAL text, not
places where work is merely undone. CLAUDE.md rule 3 applies to them: a failing
regression test lands before the fix.

**Standing constraint for every item below (QUESTIONS Q40, restated):** no
balance tuning before P3 lands the run shape. A bound that fails meanwhile gets
a recorded reason, not a nudged constant. **P10 is the one balance pass.**

**Gate names are §14's G1–G20**; MIGRATION.md §5 maps them onto the A/B/C names
still in test headers.

## Queue

### Corrections — shipped code contradicts SPEC-FINAL

- [ ] (x001) [bug] Poison's stack cap is 3, not 50 (SPEC-FINAL §3). `master` is
      correct at `77250b8`; the contradiction lives on branch `wip/m20d`, and
      nothing on master reads 50 today — so this item is a **pin**, not a fix:
      the cap is stated in `/data` and asserted by a test, so the next attempt
      to raise it argues with §3 instead of with nobody. (The branch is also red
      on gate A3, but bisection puts that in its *other* half — MIGRATION §3.1
      — so the two facts do not merge.) — acceptance: a test asserts
      `poison.maxStacks === 3` and that a fourth application inside 3 s
      refreshes the shortest stack rather than adding a fourth, citing §3 and
      quoting its wording; the same test covers Toxic's cap of 3 — refs: §3,
      MIGRATION §3.1, Q81, Q82

- [ ] (x002) [bug] Lifesteal has a per-second cap; §2 says it has none.
      `data/warden.json` carries `leechCapPerSecond: 3`, a V1/V2 safety rail
      §2 removes on purpose — and the clause is not marked ⚖. Removing it is a
      real balance event (§2's next sentence puts every VS tower attack through
      it), so it ships with a measurement. Same item covers the unverified half:
      §2 says lifesteal heals from **normal** damage only, and `damageEnemy`
      accrues `leechAccumulator` from every `dmg` it applies, DoT ticks included
      — acceptance: the cap is gone from `/data` and from `Derived`; a test
      drives a lifesteal character through a normal hit, a Bleeding tick and a
      Poison tick and asserts only the first heals (with the Bleeding Ring's
      §7 exception noted as P7's, not this item's); the 12-seed sweep's delta is
      recorded in PROGRESS whichever way it moves — refs: §2, MIGRATION §3.2, Q83

### P0 — sim skeleton (G2)

- [ ] (p0a) [feat] Content hash in `RunConfig` and in the end-state hash inputs.
      FNV-1a over the loaded `/data` JSON, carried on `RunConfig` and mixed into
      `hashWorld`'s inputs, so a replay recorded against different content fails
      loudly instead of diverging silently. G2 names it ("incl. … tuner-edited
      content (per content hash)") and P9's Tuner cannot ship without it —
      acceptance: **G2** — 100/100 replay hash match at a fixed content hash;
      the same seed and input log against a mutated `/data` produces a *different*
      `RunConfig` hash and the replay check reports a content mismatch rather
      than a diverged state; fast-forward and a `class_active` in the log are
      both in the replayed set — refs: §12, §14 G2, Q45

### P1 — TD core (G7)

- [ ] (p1a) [feat] Remove the path guarantee; structures become high-cost
      passable tiles. Delete `grid.ts` `wouldBlockPath` and `towers.ts`'s
      `blocks_path` rejection; give a structure a traversal cost ∝ HP ×
      toughness in the enemy cost field so an open path stays cheapest and a
      sealed Core routes enemies through the cheapest breach. Fliers, burrowers
      and wraiths keep their bypasses; the build ghost loses its red refusal —
      acceptance: **G7** first two clauses — sealed Core → structure damage > 0
      and the Core is eventually reached with no towers defending; any open path
      → zero structure-chewing by pathing (non-Bomber, non-blocked) — refs:
      §10, §14 G7

- [ ] (p1b) [balance] Turtle economics stay honest under sealing — acceptance:
      **G7**'s third clause — sealed-build win rate ≤ open-build + 10 points at
      T2, measured over ≥20 seeds per build with the `walloff` and `hybrid`
      policies, with the two rates and the seed count recorded in PROGRESS —
      refs: §10, §14 G7, G19

### P2 — VS core (G3)

- [ ] (p2a) [feat] VS tower-attack inheritance (§6.1). In a VS wave the
      character wields every built tower type's attack: that type's attack
      speed, its special effects, and the **highest** upgrade level's effects
      present among towers of that type; damage = the average across that type's
      towers, each at its own level, × (1 + 10% × count of that type) —
      acceptance: **G3** — §6.1's worked example ships verbatim as a unit test
      (1× lv1 arrow + 2× lv3 arrow + 1× lv1 poison → arrow VS damage
      `(1×lv1 + 2×lv3)/3 × (1 + 10%×3)` with the @3 +1 pierce active, poison
      computed the same way over its own towers) — refs: §6.1, §14 G3

- [ ] (p2b) [feat] Wielded attacks count as character attacks — they scale with
      character stats per §2's stacking, trigger lifesteal, and fire on-attack
      passives — acceptance: a test shows a wielded arrow attack picking up a
      +10% Attack source and a +20% Attack source as exactly ×1.32 (G5's rule
      applied through the VS path), healing a lifesteal character, and counting
      as an attack for an on-attack passive stub — refs: §6.1, §2, §14 G3, G5

- [ ] (p2c) [feat] Towers inert but present during VS waves (§6.2): no attacks,
      solid obstacles, HP kept and damageable, each contributing its §5 VS
      special. Ten specials to author — electric wire grid, poison trail,
      brazier corpse-explosion, obelisk following aura, beacon character haste,
      sprout XP gems, and `none` for arrow/wall/ballista/mortar — expressed as
      data shapes on the tower def, not as ten engine branches — acceptance:
      each of the six live specials has a test driving it through the real VS
      loop; a loader rule refuses a `vsSpecial` key it cannot pay, the way
      `validateSpecial` does for milestones; the four `none` towers are inert
      and are asserted so — refs: §5, §6.2

- [ ] (p2d) [feat] Weapon panel shows per-type lineage: "Arrow ×3 (avg 14.2,
      +30%) — pierce 2" — acceptance: the panel renders one row per built tower
      type with count, averaged damage, the count multiplier and the inherited
      milestone effects, read from the same helper `p2a` fires with (the m20b
      stale-reader rule: read the profile, never the authored attack) — refs:
      §6.2

- [ ] (p2e) [polish] Delete the Sundering and soul-binding. `sundering.ts`,
      `weapons.ts`'s `grantWeapon`/`applyTerrainPassives`/`buildTerrainEffects`,
      `derived.weaponSlots`, `data/weapons.json`'s `levels`/`awakenings`/
      `inherit*`/`slots` keys, the `souls` and `pick` Commands where they serve
      binding, and the retired files `a5-weapon-share`, `a6-terrain-value`,
      `a8-sundering-head-start`, `sundering.test.ts` plus `act2.test.ts`'s
      retired describes — acceptance: `grep -rn "sundering\|soulLevels\|
      weaponSlots\|awakening" src/ data/ tests/` returns only false positives,
      named in the commit; `npm test` green; A11 green — refs: §6, MIGRATION §4

### P3 — interleave + leak coupling (G6)

- [ ] (p3a) [feat] Interleaved run structure (§1.1): **TD, TD, TD, VS**
      repeating; 18 TD waves + 6 VS waves, VS after TD 3/6/9/12/15/18; build
      phase 20 s ⚖ between waves, building disabled during VS; VS wave 75 s ⚖
      with the final VS wave running until the boss dies; transitions are
      instant mode-switches, no picker screens — acceptance: **G6**'s first
      clause — the pattern holds for a full scripted run and the phase sequence
      is asserted wave by wave; leak coupling (`f003`) still feeds the *next* VS
      wave's budget across the new boundary — refs: §1.1, §14 G6

- [ ] (p3b) [feat] Multi-summon: the player may call the next TD wave(s) early,
      stacking up to **3** at once ⚖; the early-call bonus is
      `2 gold × that wave's un-elapsed build seconds`, paid **once per wave
      against its own timer** (so waves 2 and 3 of a stack pay zero); VS waves
      cannot be stacked or skipped — acceptance: **G6**'s remaining clauses —
      a fourth `call` inside a stack of 3 is a no-op, the gold paid for a 3-stack
      equals the sum of three per-wave computations and not 3× one of them, and
      a `call` during a VS wave is rejected — refs: §1.1, §14 G6, Q43

- [ ] (p3c) [feat] VS director budget indexed by wave, not by elapsed minute:
      `150 × 1.21^(waveIndex)` ⚖ with the warmup rules as built, alive cap 350,
      leak coupling per §1.1 — acceptance: a test reads the budget for VS waves
      1..6 off the formula rather than off the clock, and a VS wave that starts
      late in a long run gets the same budget as one that starts early; the
      `aliveCap` overshoot QA measured (353 against 350, old s004) is closed in
      the same item with its own regression test — refs: §9, §1.1

- [ ] (p3d) [polish] Delete the Day/Dusk/Night/Dawn cycle machine. `World.cycle`,
      `totalCycles`, `cycleWaveEnd`, `nightLengthSeconds`, `cycleEliteMul`,
      `RunConfig.cycles`, phases `dusk`/`soulpick`/`dawn`, Commands `rekindle`
      and `dawn_done`, `Structure.soulSuppressed`, `World.soulLevels`,
      `data/towers.json`'s `rekindleCostMul`/`duskSellRefund`, and
      `data/waves.json`'s `waveEndByCycle`/`nightSecondsByCycle`/
      `eliteMulByCycle`/`nightMinuteOffsetPerCycle`; delete
      `f001-cycle-machine.test.ts` and `f004`'s retired Dusk-picker case —
      acceptance: `grep -rn "cycle\|dusk\|dawn\|rekindle" src/ data/` returns
      only false positives, named in the commit; A11 green — refs: §1.1,
      MIGRATION §4

- [ ] (p3e) [balance] Re-baseline the run-shape gates against 18 TD + 6 VS.
      `a1-run-length.test.ts` is retired and rewritten as **G1**: mean
      victorious run 30–36 min over ≥24 seeds, reported as means and pass-rates,
      **never medians** (§14's wording). `light-build`'s `kite` clause and A3's
      skipped 3:00 clause are re-measured against the new shape and either
      returned live or re-deferred with a fresh measurement — acceptance:
      **G1** green with the seed count and both tail values printed in the
      failure detail; every re-deferral carries a measurement dated to this
      item — refs: §1.1, §14 G1, MIGRATION §4.2

### P4 — core math and damage types (G4, G5)

Landed at m19a/m19b/m19c. What is left is exhaustiveness, which is where these
two shipped a silent no-op twice before.

- [ ] (p4a) [feat] §2's Area claim is exhaustive — "applies to every attack,
      active, and effect" — and nothing asserts it. Audit every radius the sim
      computes (tower AoE, Electric's inherent r0.8, Burning's r1 spread, mortar
      splash, cone width, ground fields, class actives, the character's own
      attack) and route each through `areaMul` — acceptance: a table-driven test
      enumerates every AoE consumer by name and asserts each one scales with a
      +10% area source; adding a new radius without a row turns it red (an
      exhaustive `STAT_KIND`-style map, not a spot check) — refs: §2, §14 G5

- [ ] (p4b) [bug] §3's final-partial rules are unasserted. Three clauses m19c
      did not have to answer, each a one-line failure if wrong: frost and frozen
      respect `slowImmune`; overlapping Burning victims' spreads **add** rather
      than overwrite; immunities are checked on **both** the victim path and the
      spread path (a `burnImmune` Cinderling standing next to a burning Husk
      must take neither the tick nor the shred) — acceptance: one test per
      clause, each red when the corresponding branch is reverted — refs: §3

### P5 — tower roster and upgrade tracks (G20)

SPEC-FINAL §5.2 decides the seven tracks SPEC-V3 left open (Q80) and grants the
per-track `costMul` that m20c filed as m20e. Both of those items are therefore
closed as decided-by-spec and re-filed here.

- [ ] (p5a) [feat] Per-track `costMul` honoured by `validateStepPrice`. §5 now
      says it in as many words ("total track cost = 2× build cost ⚖, per-track
      `costMul` allowed"), which is what m20c measured as the missing lever —
      acceptance: a track carrying `costMul` loads, its whole-track total is
      `upgradeTotalCostMul × costMul ×` the build price, and a track without one
      is byte-identical to today; a track whose steps do not sum to its total is
      still a load error — refs: §5, Q80

- [ ] (p5b) [feat] Author §5.2's seven tracks: wall **3** steps (+10% only) and
      defense **medium**; ballista **4** (+1 pierce @2, +1 projectile @4);
      fire brazier **4** (+1 Burning per hit @2, cone width +50% @4); ice
      obelisk **3** (@3: frost from this tower lasts 5 s); mortar **3** (@3:
      shells leave a burning patch 2 s); beacon totem and harvest sprout keep 2.
      Every one of these is a count *and* a milestone the current data does not
      have; `p5a` is the price lever that made the counts infeasible at m20c —
      acceptance: `/data` matches §5.2 row for row (a test reads the spec's
      numbers as a literal table); each new milestone kind is expressible as
      typed data the loader validates, not an engine branch; the m20c `note`
      fields recording rejected counts are deleted with their reason — refs:
      §5.2, §14 G20, Q80

- [ ] (p5c) [bug] Venom Spore's `+1 projectile @2` fires nothing when targets
      are scarce, and its `@4` ratio shift measures worse than the step below.
      Both were measured at m20d (Q81) and both survive SPEC-FINAL; what does
      not survive is m20d's fix for the second, which raised Poison's cap to 50
      against §3 (see x001). Under the §3 cap of 3, three stacks of a 3 s DoT is
      a ceiling of one application per second — the Spore's own fire rate — so
      §5.1's "@4 → 1:1.5" moves damage into a full bucket. That is a tension
      between two authoritative ⚖ clauses and is the owner's, not an agent's.
      **Known before starting:** m20d's fix for the *first* finding —
      spare-spore fallback plus a 45 → 23 re-price — was bisected at the
      migration and is what turns gate **A3** red (5/12), independently of the
      cap. Whatever price this item lands has to be measured against A3, not
      only against G13 — acceptance: the spare spore falls back onto the leading
      target (§5.1 states the same rule one row up for Electric's chain),
      `m20b-owner-towers.test.ts`'s skipped "still fires that second spore" case
      is live and green, the "worth nothing at @2" case is deleted with it,
      **G13**'s T3 clause stays 0/5 and **A3 stays green**, with the price band
      measured across both; the @4 tension is logged to QUESTIONS with both dps
      measurements and left as authored — refs: §5.1, §3, §14 G13, G19, Q79,
      Q81, Q82

- [ ] (p5d) [feat] **G20** as a loader rule with teeth: "every §5 milestone
      special measurably changes the attack it names". `validateSpecial` today
      refuses a special the attack cannot *pay*; it does not check the attack
      **changes** — acceptance: for every tower, for every milestone step,
      `attackProfile(def, step)` differs from `attackProfile(def, step − 1)` in
      the field the special names, asserted by a test that enumerates the roster
      from `/data` so a new tower cannot skip it — refs: §5, §14 G20

### P6 — classes (G8, G9, G10, G11)

`data/classes.json` has three classes and none of them is one of §4's eleven.

- [ ] (p6a) [feat] Class framework v1.0: archetype bands (range/damage/speed/AoE
      /move as low·medium·high mapped to numbers in `data/classes.json` ⚖),
      **Passive + Active1 (Q) + Active2 (E) + Tower passive**, a basic
      auto-attack on the nearest enemy with the class's band profile, mouse-aimed
      actives (a new input path), and combo rules (one active usable during
      another). All actives stay sim Commands — acceptance: the framework loads
      a class from bands alone with no per-class engine branch; a mouse-aimed
      active replays to an identical end-state hash with its aim point in the
      input log (**G2**); the HUD shows Q and E with their cooldowns — refs:
      §4, §12

- [ ] (p6b) [feat] Swordsman (§4.1, owner-verbatim): *Thousand Cuts*, *Circle
      Slash* (charge cap 3 s-equivalent ⚖), *Dash Slash*, *Wind Slash* —
      acceptance: **G9**'s first half — a Dash during a charged Circle Slash
      merges into **one** attack whose hit range is widened by the current charge
      radius, and each enemy struck receives **exactly one** Bleeding — refs:
      §4.1, §14 G9

- [ ] (p6c) [feat] Plaguebringer (§4.1, owner-verbatim): *Spreading Plague*,
      *Poison Barrel*, *Poison Boost*, +10% tower poison damage — acceptance:
      **G9**'s second half — an enemy dying with unfinished DoT deals exactly the
      unfinished total to the nearest enemy, **once**, and doubling remaining
      poison doubles what is left rather than re-applying the trigger — refs:
      §4.1, §14 G9

- [ ] (p6d) [feat] The other nine classes (§4.2's filled table): Archer,
      Engineer, Pyro, Necromancer, Cryomancer, Stormcaller, Bloodlord, Animist,
      Paladin — each with its bands, passive, two actives and tower passive from
      the table. The three shipped classes (`engineer`, `pyromancer`,
      `frost_warden`) are rewritten into Engineer, Pyro and Cryomancer rather
      than kept beside them; `data/affinity.json` is re-keyed or retired with a
      reason — acceptance: **G8** — every class clears T1 at a 35–70% win rate
      under a scripted kit bot, and the top damage source differs across ≥8 of
      11; plus **G10** (Archer's dps-optimal charge is finite at 2–6 s and a full
      charge one-shots any non-elite at mid scaling) and **G11** (Stormcaller's
      max chain multiplier ≤ ×3.6) — refs: §4.2, §14 G8, G10, G11

- [ ] (p6e) [feat] Class unlocks: Swordsman, Archer and Engineer free, the rest
      behind §8.4's quests — acceptance: a fresh account offers exactly three
      classes; the dev profile offers eleven (**G16**) — refs: §4, §8.4

### P7 — VS upgrades, equipment, rewards (G12)

- [ ] (p7a) [feat] `data/vsupgrades.json` per §6.3: 1-of-3 per VS level with one
      free reroll (the mechanism `boons.json` already has), pool = stat boons
      (rank ×5 ⚖: Attack/Attack Speed/Move/Max HP/Defense/Area/Range), **Type
      Mastery** (one card per built tower type, rank ×3, +20% that type's VS
      damage), and **skill cards** (3 per class, rank ×2, authored per class in
      `/data`). Offer weighting even — acceptance: the pool is data, not code;
      a Type Mastery card appears only for a type the player has actually built;
      a class's skill cards are absent for another class; `boons.json` is
      retired with its 12 rows mapped onto §6.3's stat boons or logged as
      dropped — refs: §6.3

- [ ] (p7b) [feat] Equipment v1.0 (§7): six slots (weapon, armor, shoes, ring,
      necklace, bracelet), the 12-item table verbatim, flat adds (HP/Atk/Def)
      plus multipliers (atk speed/move) stacking per §2, and **class-conditional
      effects with fallbacks** ("if not Swordsman: …") — a mechanism that does
      not exist today. Replaces `data/relics.json`'s 3 slots and procedural
      affix rolls — acceptance: all 12 rows load and each one's effect is
      reachable by a test, including both branches of every conditional; a
      Swordsman and a non-Swordsman wearing Sleeve Sword get ×1.2 and ×1.2×1.2
      respectively; save migration maps old relics per Q49 and bumps
      `SAVE_VERSION` with a round-trip test (**G18**) — refs: §7, §14 G12, G18

- [ ] (p7c) [feat] Rewards pipeline (§8.1–8.2): each TD wave cleared → 1 random
      equipment (even weights ⚖), each VS wave cleared → 1 skill point, both
      granted **at run end, win or lose**, for waves fully cleared; duplicates
      allowed and stacking in the stash — acceptance: **G12** — N TD waves
      cleared yields N equipment at Results and M VS waves yields M skill points,
      on a victory *and* on a defeat; orbs appear nowhere — refs: §8.1, §8.2,
      §14 G12, Q42

- [ ] (p7d) [feat] Retire Ember. `emberFor`, `accountLevelFor`, `pointsAvailable`,
      `tree.startingEmber`, `emberFind`, the Hub's Ember counter and
      `b004`'s cumulative-survival fix's reward arithmetic all serve a pipeline
      §8.2 replaces; skill points come from VS waves. One-time 100:1 conversion
      per Q46, then the key is dropped. Respec becomes **1 skill point per node**
      (§8.3) and the tree's 120 nodes are re-priced against ~6 points a run —
      acceptance: **G12** plus a save round-trip that converts, bumps
      `SAVE_VERSION`, and repairs a corrupt save (**G18**); the dev profile can
      allocate the whole tree (Q53's cap, deferred here from M18) — refs: §8.2,
      §8.3, §14 G12, G16, Q46, Q53

- [ ] (p7e) [feat] Quests award unlocks only (§8.4). Eight exist; four award
      cosmetics or features, which §8.4 forbids ("never currency"), and §8.4
      names three specific ones against the §4 roster: win a run → Pyro, build 40
      ice obelisks lifetime → Cryomancer, win with a sealed Core → Paladin —
      acceptance: 8–12 quests, every reward is a class/map/tier unlock, the three
      named quests exist with those exact conditions, and the sealed-Core quest
      is reachable only because `p1a` shipped — refs: §8.4

### P8 — enemies, waves, bosses (G14)

- [ ] (p8a) [feat] §9's three unbuilt counterplay clauses. **Mender**:
      interrupted by any hit ≥ 25 ⚖ (today it heals on a flat 0.5 s timer with
      no interrupt path). **Shellback**: §9 states +100% damage **from behind**
      and "pierce ignores the shield"; the code has a `frontReduction` and no
      pierce bypass. **Warlock**: takes +50% from single-target attacks, which
      needs `DamageOptions` to record whether a hit was single-target —
      acceptance: one test per clause driving the real damage path;
      `content-complete.test.ts`'s retired Shellback case is rewritten as §9's
      mirror claim and returned live — refs: §9, MIGRATION §4.2

- [ ] (p8b) [feat] Structure-damage multipliers become per-enemy. §9 gives ×3 to
      Bomber and ×2 to Gatebreaker; `data/waves.json`'s
      `enemyStructureDpsFactor: 3` applies to **every** enemy — acceptance: a
      Husk, a Bomber and a Gatebreaker chew the same wall at 1× / 3× / 2×, each
      read from its own def; the global key is deleted — refs: §9

- [ ] (p8c) [feat] 18 TD wave compositions in `data/waves.json` with the
      Gatebreaker at **TD wave 18** and the Warden-Eater ending the final VS
      wave; `hp × 1.30^(wave−1)` ⚖ across all 18 — acceptance:
      `content-complete.test.ts`'s retired wave-10 case is rewritten for wave 18
      and returned live; every wave references real enemies; all 20 of §9's
      roster appear somewhere across the 18 waves and the 6 VS budgets — refs:
      §1.1, §9

- [ ] (p8d) [balance] Boss re-baseline against the new run — acceptance:
      **G14** — over 20 seeds, the scripted-build win rate against the
      Warden-Eater is ≥60% and <100%, with the losing seeds listed (Q78's rule:
      the clause must have the power to mean what it says) — refs: §9, §14 G14

### P9 — tooling (G15, G16, G18)

- [ ] (p9a) [feat] Codex: a Hub page listing **every** class, tower, equipment
      item, damage type, enemy and wave with live stats read from `/data` plus
      the schemas — acceptance: every entity in every `/data` file appears
      exactly once, driven by a test that enumerates the files rather than a
      hand-written list, so new content cannot be missing from the Codex —
      refs: §11

- [ ] (p9b) [feat] Tuner: in dev mode every numeric and enum field is editable
      including wave composition and counts; **Save** persists to the real
      `/data/*.json` through a Vite dev-server endpoint; edits apply from the
      next run and a run started after unsaved live edits is flagged like a
      practice run; production is read-only Codex plus Export/Import JSON, with
      **no endpoint in the bundle** — acceptance: **G15** — edit → save →
      reload → the sim uses the new value; an invalid edit is rejected inline by
      the same zod schema the loader uses; an edited run is flagged; `npm run
      build` output contains no write endpoint. Depends on `p0a` — refs: §11,
      §14 G15

- [ ] (p9c) [polish] The production bundle still ships the whole dev profile
      (old s005): `data/dev.json`, `seedTestAccount` and the practice Commands
      are all reachable in a prod build even though `devMode` is off —
      acceptance: **G16**'s second clause read strictly — the built bundle
      contains neither the dev profile data nor the god-mode Command handler,
      asserted by grepping `dist/` — refs: §11, §14 G16

### P10 — balance re-baseline and feel (§16)

- [ ] (p10a) [balance] Flip Burning to per-application stacking (§3, §16). One
      field (`maxStacks`, `refresh`) — the flip §3 names as owner intent and §16
      schedules here, deliberately deferred through m19c so it did not buff
      shipped content ahead of the one balance pass — acceptance: 30 stacked
      applications read −90 armour through `enemyArmor`, the shared 50-stack
      budget's eviction rule still refuses to evict a type under its own cap
      (Q71), and every A/B/G bound it moves is re-measured in the same item —
      refs: §3, §16, Q44, Q65

- [ ] (p10b) [balance] **G13**: no tower type's VS attack exceeds 35% of damage
      across the winning-build pool; every type is solo-viable at T1 and none at
      T3 — acceptance: measured over the pool with per-type shares printed;
      `a4-single-type.test.ts`'s two `DEFERRED` clauses are re-measured and
      either returned live or re-deferred with a fresh measurement — refs:
      §14 G13, Q80

- [ ] (p10c) [balance] **G17** perf: replace A10's whole-run 5000 ms constant
      with a host-independent budget **per simulated minute**, and re-measure
      the 350-enemy frame clause against §6's VS model (all weapons wielded, no
      petrified terrain) — acceptance: the run-budget case is rewritten as a
      per-sim-minute bound with the host normalisation stated in the test
      header; 350 enemies + all weapons ≥ 60 fps on the benchmark; a 50-run soak
      with zero exceptions and zero NaN — refs: §14 G17, §16, Q41

- [ ] (p10d) [balance] **G19** liveness: the winning sim build pool contains
      **both** sealed and open strategies, and uses multi-summon — acceptance:
      over ≥24 seeds, at least one winning build of each shape appears and
      multi-summon is used in at least one, with counts recorded; this is the
      replacement for B11, the only old gate that asserted a strategic choice
      had two live answers (Q47) — refs: §14 G19, Q47

- [ ] (p10e) [polish] Feel pass: the 2 s TD↔VS transition sweep, per-type
      lineage labels wherever they are still missing, class barks, and the
      SFX/art asset pass behind the existing `AudioSink` seam — acceptance:
      the sweep runs on every TD↔VS boundary and costs no sim ticks (a
      fast-forwarded run stays bit-identical, **G2**) — refs: §11, §15 P10

- [ ] (p10f) [polish] Regenerate HANDOFF.md's measured sections (stale since
      m20a — it still describes three tower tiers at ×1.6) and re-check
      QUALITY.md's Alpha bar — acceptance: `npx tsx tools/handoff-metrics.ts`
      plus the probes HANDOFF lists; every §14 gate G1–G20 has a named test and
      a recorded result — refs: §14, CLAUDE.md

### Filed by QA, unscheduled — re-filed under their P

- [ ] (q001) [bug] `migrate()` preserves unknown save keys forever: it spreads
      the loaded object, so a key from a future version survives a downgrade and
      is written back — acceptance: a save carrying an unknown key loads,
      the key is dropped, and a round-trip is stable — refs: §11, old s001 — **P7**
- [ ] (q002) [bug] A save whose `stash` alone is corrupt loses the whole
      account — acceptance: a corrupt `stash` is repaired to empty and the rest
      of the account survives (**G18**'s "corrupt-save repair") — refs: §11,
      old s002 — **P7**
- [ ] (q003) [bug] `levelup` has no auto-resolve, so an unattended run parks in
      it forever — acceptance: a headless run with no `pick` command auto-picks
      after a timeout and completes; the auto-pick is in the input log so the
      replay is exact — refs: §6.3, old s003 — **P7**
- [ ] (q004) [bug] The `of Thrift` affix has `min: 0.03, max: 0.08` **positive**
      on a cost-reduction stat, so it raises costs — acceptance: the sign is
      fixed and a test asserts the stat lowers a build price; folded into `p7b`'s
      table migration if the affix does not survive it — refs: §7, old s006 — **P7**
- [ ] (q005) [bug] No gate exercises Burning's armour shred end to end —
      acceptance: an A/B-level test measures a shredded elite taking measurably
      more from a normal hit, so **G4**'s last clause has a caller — refs: §3,
      §14 G4, old s008 — **P4**
- [ ] (q006) [feat] DoT immunity is hardcoded: `immuneToDot` tests traits in the
      engine rather than reading a per-type immunity from `/data` — acceptance:
      a type's immunity is a data field (§4's rule: new mechanics are data
      shapes), and Cinderling/Frostkin keep their behaviour — refs: §3, §12,
      old s009 — **P4**
- [ ] (q007) [polish] The enemy panel prints raw shredded armour, so past the
      −100 floor it shows a number the sim does not use — acceptance: the panel
      prints the effective value — refs: §2, old s010 — **P4**
- [ ] (q008) [bug] Beacon attack-speed terrain residual exceeds its authored
      `cap` — acceptance: closed by `p2e` (the residual system is deleted with
      the Sundering) or fixed with a regression test if any of it survives —
      refs: §6.2, old s007 — **P2**
- [ ] (q009) [bug] `hashWorld` covers structures, enemies, weapons and derived
      stats but not every field a new system adds — the class of bug f001's
      review found — acceptance: a test enumerates `World`'s mutable state and
      fails when a field is added without being hashed, so **G2** cannot rot —
      refs: §12, §14 G2, old s011 — **P0**

## Done

- [x] (m20e) [balance] Per-track price multiplier — **closed: decided by spec.**
      SPEC-FINAL §5 grants it in as many words ("per-track `costMul` allowed"),
      which is exactly what m20c measured as missing and filed for sign-off.
      Re-filed as `p5a`, and the tower counts it was blocking are `p5b`.
- [x] (m20d) [balance] Price the Venom Spore's track — **closed: superseded.**
      Its two surviving findings are re-filed as `p5c`; its central change
      (Poison's cap → 50) contradicts SPEC-FINAL §3 and measured red on gate A3,
      so it is preserved on branch `wip/m20d` rather than merged. MIGRATION §3.1
      carries both measurements; Q81 stays as the record and Q82 amends it.

- [x] (m20c) [balance] The other seven towers' tracks, and every tower's defense
      band (SPEC-V3 §4) — commit `a2e0c50`. Superseded in part by SPEC-FINAL
      §5.2, which decides the counts m20c proposed and rejected; see `p5b`.
- [x] (m20b) [feat] The three owner towers and their milestone specials
      (SPEC-V3 §4) — commit `1f6cd9a`.
- [x] (m20a) [feat] Per-tower upgrade tracks (SPEC-V3 §4) — commit `5305f8d`.
- [x] (m19c) [feat] Damage-type taxonomy (SPEC-V3 §3) — commit `b325487`.
- [x] (m19b) [feat] Multiplicative stat stacking — commit `4875d47`.
- [x] (m19a) [feat] Armor v3 — commit `d4fb985`.
- [x] (t2) [feat] Selection feedback — refs: V3 T2, QUESTIONS Q57.
- [x] (t1) [feat] Range indicators — refs: V3 T1.
- [x] (t3) [feat] Dev profile: `data/dev.json`, all classes/tiers/quests unlocked.
- [x] (t4) [feat] God mode as a practice-run Command — refs: V3 T4.
- [x] (t6c) [bug] Save migration drops `orbs` and bumps SAVE_VERSION 1 → 2.
- [x] (t6ab) [feat] Delete Orbs entirely from sim, meta, data and UI.
- [x] (m17) [feat] M17 reconcile: audit code vs V3, MIGRATION.md, retire dead
      tests — superseded by this migration, which rewrote MIGRATION.md against
      SPEC-FINAL.
- [x] (f004) [feat] Class framework (v2 shape) — superseded by P6.
- [x] (f003) [feat] Leak coupling: TD leaks add 2× director cost to the next VS
      wave's budget. Kept by SPEC-FINAL §1.1.
- [x] (f002) [feat] Soul persistence — superseded by P3.
- [x] (b004) [bug] `report.survivalSeconds` used Night-local `w.act2Time`.
- [x] (f001) [feat] Cycle state machine: Day→Dusk→Night→Dawn ×3 — commit
      `4e44a33`. Superseded by §1.1; deleted at `p3d`.
- [x] (b003) [bug] Stash click-to-swap + drag-to-unequip + compare tooltip —
      commit `f9a1e2c`.
- [x] (b002) [bug] Pause menu Abandon Run requires confirm — commit `d2079e7`.
- [x] (b001) [bug] Death flow reaches Results with Retry / New Run / Hub.

### Closed by SPEC-FINAL without work

- **Q38** (§6 assumes an eleven-class roster that does not exist) — §4.2 fills
  the roster in. The work is `p6d`.
- **Q39** (§5's per-type VS special is specced for 3 of 10 towers) — §5.2
  populates the column for all ten. The work is `p2c`.
- **Q80** (the seven open tower tracks, proposed for sign-off) — §5.2 decides
  every count and milestone. The work is `p5b`.
- **Q47** (V3 retires B11 and adds no replacement liveness gate) — §14 adds
  **G19**. The work is `p10d`.
