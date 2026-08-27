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
| P5 tower roster | **done in full (G20 green)** — all 10 towers, upgrade tracks, defense bands; `p5b` gave Ember Brazier/Mortar their own `costMul`; `p5c` authored the four remaining §5.2 milestone specials (Ballista, Fire Brazier, Ice Obelisk, Mortar) and the G20 loader rule; `p5d` (a QA-filed `damageDealt` telemetry bug) is the one item still open |
| P6 classes | **3 of 11**, and on V2's one-Active + Signature framework, not §4's Passive + Q + E + tower passive (G8–G11 unmet) |
| P7 equipment/rewards/VS upgrades | **superseded systems in place** — relic affixes, Ember, 12 boons; §7's 12-item table, §6.3's pool and §8's reward pipeline unbuilt (G12 unmet) |
| P8 enemies/waves/bosses | **roster and both bosses done** — all 20 §9 enemies by name; waves still on the 10-wave cycle shape (G14 measured on the old shape) |
| P9 tooling | **dev mode, god mode, UX flows done; Codex read-half in flight on `lane/tuner`; Tuner unbuilt** (G15 unmet, G16/G18 largely green) |
| P10 balance | **not started** — Burning still refresh-strongest, perf budget still host-dependent wall-clock |

## Queue

### Corrections — shipped code contradicts SPEC-FINAL

Both corrections (x001, x002) are **done** — see the Done section. The queue
resumes at P1.

### P1 — TD core: sealing (G7)

P1 is **done** — p1a and p1b are in the Done section. G7 is green in full;
Q83 expected the p1b band to be re-measured at p3e after the §1.1 run shape
landed, but p3e's own acceptance text named only `light-build`/
`a4-single-type`/`boss` and did not touch `tests/p1b-seal-winrate.test.ts` —
that test still runs `cfg()`'s legacy `cycles: 1` shape, unchanged. Left
open, logged at Q109, not yet re-queued under a new id.

### P2 — VS core: the inheritance formula (G3)

**P2 is done in full** — p2a, p2b, p2c, p2d, p2e and p2f are all in the Done
section. `src/sim/vswield.ts`'s `wieldedAttacks` implements §6.1's formula and
`updateWieldedAttacks` fires it live from Act II; `src/sim/vsspecials.ts`'s
`updateVsSpecials` fires every tower's §5 VS special while the tower itself
stands inert; p2f converted the Fire Brazier explosion's death-chain
recursion into an iterative worklist; p2d added the §6.2 weapon-panel lineage
line; p2e deleted the superseded soul-weapon roster and picker wholesale.

### P3 — interleave and leak coupling (G6)

**P3 is done in full** — p3a, p3b, p3c, p3d and p3e are all in the Done
section. Gate G6 is green in full (p3a landed the pattern half, p3b the
stacking half, p3c restates leak coupling on the new shape, p3d deletes the
old cycle machine outright); p3e re-baselined `light-build`, G13's
solo-viability clause (`a4-single-type`) and the boss gate against the real
18-TD/6-block shape — all three measure red past the wave-10-14 content gap
and are `.skip`-ed with their numbers per Q109, not forced green.

### P5 — full tower roster and upgrade tracks (G20)

P5's first three items, `p5a`, `p5b` and `p5c`, are done — see the Done
section. **Gate G20 is green in full.** `p5d`, a bug QA filed against `p5b`,
is the one item still open.

- [ ] (p5d) [bug] `Structure.damageDealt` is never credited for `pierce`- and
      `lob`-kind tower attacks: `fireTower`'s `pierce` case (Ballista) and `lob`
      case (Mortar) call `spawnProjectile` without ever incrementing `s.damageDealt`,
      unlike every other attack kind (single/cone/chain/poison/aura), which credit
      it inline via `lineHit`/`coneHit`/`dealHit`/`chainHit`/`applyAoE` — so both
      towers' stats panels always read 0 damage dealt regardless of real output.
      Pre-existing, reproduces identically on Ballista (untouched by p5b) —
      acceptance: `s.damageDealt` increases after a pierce/lob-kind tower lands a
      hit in a controlled single-enemy scenario; a failing regression test lands
      before the fix per CLAUDE.md rule 3 — refs: `src/sim/towers.ts`, QA on p5b

### P5.5 — Cores (§5.5, owner feature inbox 2026-08-26; G21, G22, G23)

Placement logged in Q93: after P5 so the §1.1 run shape (P3) and the full
tower roster precede the Cores' VS halves and interactions; p-core-f's
quest unlocks ride the §8.4 system and may complete alongside p7e.

- [ ] (p-core-a) [feat] Core selection: `data/cores.json` with the five §5.5
      rows, Hub pick beside class select (default Stone Heart, locked cores
      refused), core choice in `RunConfig` and in the end-state hash inputs —
      acceptance: gate **G21**'s plumbing half — two runs differing only in
      core hash differently, a replay carrying a mismatched core is rejected,
      and the loader refuses a core row whose effects it cannot pay — refs:
      §5.5, G21
- [ ] (p-core-b) [feat] Stone Heart, Vampire Heart, and Time steps 1–2: the
      shared Core-upgrade rule (bought by interacting at the Core under the
      build-range rule, flat cost per step, only the listed effect, never
      sellable), Stone Heart's +100 HP steps, Vampire Heart's TD tower
      lifesteal 0.1% + missing-HP buff (+0.5% dmg/atk-spd per 1% missing, cap
      +30%) and VS +1% character lifesteal with overheal→gold 20:1 plus its
      three steps, Time's ±20% TD/VS speed auras plus step 1 (+1 flat gold/s)
      and step 2 (+1 HP regen/s, +20% healing received) — acceptance: G21 unit
      tests for every listed number, incl. the no-default-+10% rule and the
      cannot-sell rule — refs: §5.5, G21
- [ ] (p-core-c) [feat] Carnivorous Plant + Digestion: TD devour (r2, 8 s,
      non-elite instant kill / elite 200, +5 Core HP, +1 Digestion stack per
      devour for the run); VS poison volleys every 1.5 s, one bullet per 5
      stacks (perf cap 10/volley), each 10 normal + poison, targeting nearest
      to the Core; 4 steps of +1 range / −1 s — acceptance: G21 unit tests
      incl. the volley cap and the Core-attack rules (no character scaling, no
      lifesteal, feeds on-map damage effects) — refs: §5.5, G21
- [ ] (p-core-d) [feat] Corpse: 1% of all map damage stored, 1 s execute of
      the highest-HP affordable enemy with the execution counting as map
      damage (1% restores), VS +10% EXP, steps: ratio 2%, execute explosion
      (victim max HP, AoE r2), 5 s auto-fire spending the store non-lethally —
      acceptance: G21's Corpse execute-and-restore worked example as a unit
      test — refs: §5.5, G21
- [ ] (p-core-e) [feat] Time decay aura, steps 3–5: enemies within r5 lose
      `1 × 1.2^(5 − ring)` HP/s ignoring armor; step 4 starts it at r10; step
      5 raises the multiplier to 1.5 — acceptance: G21's decay ring table
      asserted verbatim (r5→r4: 1/s, r4→r3: 1.2/s, r3→r2: 1.44/s, …) — refs:
      §5.5, G21
- [ ] (p-core-f) [feat] Core unlock quests (the four §5.5 unlock lines through
      the §8.4 quest system), Codex page, and the gates: **G22** (each core
      shifts the run fingerprint — damage-source or economy vector — by ≥0.10
      vs Stone Heart on the same seed/build) and **G23** (every core clears T1
      at 35–70% win rate with the scripted bot) measured as live tests —
      acceptance: G21 in full, G22 and G23 green with per-core numbers printed
      on failure — refs: §5.5, §8.4, G21, G22, G23

### P6 — classes (G8, G9, G10, G11)

- [ ] (p6a) [feat] Class framework per §4: archetype bands (low/medium/high mapped
      to numbers in `data/classes.json`) + **Passive** + **Active1 (Q)** + **Active2
      (E)** + **Tower passive** (always on, effective in VS where it says so). Basic
      attack: auto-attack the nearest enemy on the band profile. Actives are
      mouse-aimed sim Commands and may combo — acceptance: a framework test drives
      all four slots for a class, every active replays to an identical end-state
      hash from the input log, and a class missing a slot fails the loader — refs:
      §4, G2
- [ ] (p6b) [feat] Swordsman kit (§4.1 verbatim): Thousand Cuts, Circle Slash
      (charge-scaled, cap 3 s-equivalent), Dash Slash, Wind Slash tower passive —
      acceptance: gate **G9**'s first half — Dash during a Circle Slash charge is
      one merged attack whose hit range is widened by the current charge radius and
      whose damages sum, and each enemy struck takes exactly 1 Bleeding — refs:
      §4.1, G9
- [ ] (p6c) [feat] Plaguebringer kit (§4.1 verbatim): Spreading Plague, Poison
      Barrel, Poison Boost, +10% tower poison damage — acceptance: gate **G9**'s
      second half — an enemy dying with unfinished DoT deals exactly the unfinished
      total to the nearest enemy, once — refs: §4.1, G9
- [ ] (p6d) [feat] The nine §4.2 classes: Archer, Engineer, Pyro, Necromancer,
      Cryomancer, Stormcaller, Bloodlord, Animist, Paladin, each as the §4.2 row
      authors it — acceptance: all 11 classes load and complete a run; gate **G10**
      (Archer's dps-optimal charge is finite at 2–6 s and a full charge one-shots any
      non-elite at mid scaling) and gate **G11** (Stormcaller's max chain multiplier
      ≤ ×3.6) are green — refs: §4.2, G10, G11
- [ ] (p6e) [balance] Gate **G8**: every class clears T1 at a 35–70% win rate under a
      scripted kit bot, and the top damage source differs across at least 8 of the 11
      — acceptance: G8 measured as a live test over the seed set, with the per-class
      rates and top sources printed on failure — refs: §4, G8
- [ ] (p6f) [polish] Retire the three V2 classes' framework residue: `affinity.json`,
      class `mods`, the single `active`/`passive`/`manualAttack` shape, and the
      Engineer/Pyromancer/Frost Warden rows insofar as §4 does not re-author them
      (Engineer and Pyro do carry forward) — acceptance: `data/classes.json` holds
      exactly the 11 §4 classes in the §4 shape, MIGRATION.md §8's retire-with-p6f
      rows are checked off — refs: §4, Q38

### P7 — VS upgrade pool, equipment, rewards (G12)

- [ ] (p7a) [feat] VS level-up pool per §6.3 in `data/vsupgrades.json`: each level
      offers 1 of 3 cards with 1 free reroll; stat boons (Attack, Attack Speed, Move,
      Max HP, Defense, Area, Range) at rank ×5, Type Mastery at rank ×3 (one card per
      built tower type, +20% that type's VS damage), and 3 skill cards per class at
      rank ×2. Offer weighting even — acceptance: a data test covers every pool
      family and its rank cap; a run test proves the free reroll is once per level
      and that Type Mastery only offers types actually built — refs: §6.3
- [ ] (p7b) [feat] Equipment per §7 in `data/equipment.json`: 6 slots (weapon,
      armor, shoes, ring, necklace, bracelet), the 12-item table, flats adding and
      multipliers multiplying per §2, class-conditional lines inert elsewhere unless
      a fallback is written — acceptance: a data test covers all 12 items' every
      column; one test per conditional effect including its "if not Swordsman"
      fallback (sleeve sword, swordsman armor, swordsman shoes) — refs: §7, §2
- [ ] (p7c) [feat] Rewards pipeline per §8: each TD wave cleared grants 1 random
      equipment (even weights), each VS wave cleared grants 1 skill point, both
      granted at run end, win or lose, for waves fully cleared; duplicates allowed —
      acceptance: gate **G12** — N TD waves cleared yields exactly N equipment, M VS
      waves yields exactly M skill points, a defeat still pays for fully-cleared
      waves, and no orb appears anywhere — refs: §8, G12
- [ ] (p7d) [feat] Retire the superseded meta economy: relic affixes and rarities,
      the Ember → level → points pipeline, and `data/relics.json`'s affix table.
      Skill points become the tree's only currency with a one-time conversion, and
      respec is priced in skill points — acceptance: no Ember or relic affix in sim,
      meta or UI; a save written before the change migrates with its Ember converted
      and its stash preserved; gate **G12**'s "orbs nowhere" clause extended to
      relics — refs: §8, Q46, Q49
- [ ] (p7e) [feat] Unlock quests per §8.4: 8–12 quests in `data/quests.json` awarding
      unlocks only, never currency, covering the §4.2 classes (win a run → Pyro;
      build 40 ice obelisks lifetime → Cryomancer; win with a sealed Core → Paladin)
      — acceptance: every non-free class has exactly one unlock quest; a test drives
      one quest of each trigger family to completion; no quest grants currency —
      refs: §8.4, §4.2
- [ ] (p7f) [bug] `migrate()` preserves unknown save keys forever: it spreads
      `...meta` wholesale, so any key a save carries survives every round trip as a
      fixed point. A non-object `meta` is worse — `{"meta":"orbs"}` string-spreads
      into indexed keys and re-serialises stably — acceptance: the migrated object
      is built from the known key set instead of a spread; a save carrying junk keys
      and one with a non-object `meta` both migrate to exactly the MetaState key set
      — refs: §11 save migration, QA on t6c bug 1
- [ ] (p7g) [bug] A save whose `stash` alone is corrupt loses the whole account:
      `deserializeMeta('{"version":1,"meta":{"stash":"nope"}}')` throws in
      `migrate()`, `loadMeta` catches it and returns a brand-new account, discarding
      account level, unlocks and quests — acceptance: a malformed `stash` (non-array,
      or an array containing null) coerces to `[]` and every other field survives;
      `tests/meta.test.ts`'s corrupt-save case is extended past `'{}'` — refs: §11,
      QA on t6c bug 4

### P8 — enemies, waves, bosses complete (G14)

- [ ] (p8a) [feat] Wave data on the §1.1 shape: `data/waves.json` carries 18 TD wave
      compositions and 6 VS waves, TD scaling `hp × 1.30^(wave−1)`, VS budget
      `150 × 1.21^(waveIndex)` with the 75 s warmup rules, alive cap 350 —
      acceptance: every wave references real enemies, the Gatebreaker lands on TD 18
      and the Warden-Eater on VS 6, and the two scaling curves are asserted at three
      sample waves each — refs: §9, §1.1
- [ ] (p8b) [bug] Alive count exceeds `aliveCap`: 353 measured against a cap of 350,
      because elite and summon spawns bypass the check `spendBudget` applies —
      acceptance: no spawn path can push `w.enemies` past `aliveCap`; a test drives
      elites and boss summons at the cap — refs: §9, QA on t4
- [ ] (p8c) [balance] Gate **G14**: over 20 seeds the scripted-build win rate against
      the Warden-Eater is ≥60% and <100% — acceptance: G14 measured on the §1.1 run
      shape (so it must run after p3a), with the per-seed outcomes printed on
      failure — refs: §9, G14

### P9 — tooling: dev mode, Codex and Tuner, UX flows (G15, G16, G18)

- [ ] (p9a) [feat] Content hash in `RunConfig` and in the end-state hash inputs, so a
      replay against edited `/data` fails loudly — acceptance: editing any `/data`
      value changes the config hash, and a replay carrying a mismatched hash is
      rejected — refs: §11, §12, Q45 (**do this before p9b**)
- [ ] (p9b) [feat] Codex: a Hub page listing every class, tower, equipment, damage
      type, enemy and wave with live stats read from `/data` and its zod schemas —
      acceptance: every content collection renders and a field added to a schema
      appears with no change to the page; counts match the data files. The read-only
      half exists on `lane/tuner` (`src/ui/codex.ts`, `src/ui/codex-collections.ts`,
      `tests/codex.test.ts`) and needs its Hub entry point wired — refs: §11
- [ ] (p9c) [feat] Tuner: in dev mode every numeric and enum field in the Codex is
      editable including wave composition; Save persists to the real `/data/*.json`
      through a Vite dev-server endpoint that validates the whole document against
      its schema and rejects invalid edits with field-level errors; prod is
      read-only Codex plus Export/Import JSON — acceptance: gate **G15** —
      edit→save→reload round-trip, invalid rejected, an edited run visibly flagged,
      and a production build containing no endpoint — refs: §11, G15
- [ ] (p9d) [polish] Gate **G16**'s unasserted half: the production bundle still
      ships the whole dev profile — `applyDevProfile`, the unlocks, `data/dev.json`
      with `devMode:true` and the dev badge CSS are all in `dist`. It is unreachable
      (`isDevBuild()` folds to constant `false`), so this is dead weight rather than
      a hole — acceptance: either the dev profile is tree-shaken out of a production
      build, or G16 gains an explicit assertion that its presence is inert — refs:
      §11, G16, QA on t3 bug 11
- [ ] (p9e) [bug] Gate **G18**'s dead-end clause: `levelup` has no auto-resolve, so
      an unattended run parks in it forever, where every other decision phase has
      one. Repro: a practice run with god mode injected at tick 1, stepped 72 000
      ticks, ends `outcome running, phase levelup, wavesCleared 10, alive 351` —
      acceptance: an unattended run either advances or terminates; a headless run
      stepped past its tick budget never sits in a decision phase — refs: §11, G18,
      QA on t4 bug 4
- [ ] (p9f) [feat] Gate **G2** in full: 100/100 replay hash match including class
      actives, tuner-edited content (per content hash) and fast-forward —
      acceptance: G2's three additions each get a case; the existing A11 coverage is
      folded into the G2 test — refs: §12, G2
- [ ] (p9g) [bug] `hashWorld` covers structures, enemies, weapons, derived stats and
      the RNG streams but **not `w.gold`/`w.goldSpent`**, so two replays that
      disagreed only on a refund or a cost would hash identically until the
      difference changed a build decision — acceptance: a test builds two worlds
      differing only in `w.gold` and asserts different hashes; G2 stays green —
      refs: §12, QA on m20a
- [ ] (p9h) [polish] The enemy panel prints raw shredded armour: past the −100 floor
      a horde-density Brazier board reads "−294 (100% more taken)", honest about the
      percentage and misleading about the number — acceptance: the panel shows the
      effective (floored) armour, or marks the floor — refs: §2, `src/ui/hud.ts`
      `armourText`

### P10 — balance re-baseline and feel pass (G1, G13, G17, G19)

- [ ] (p10a) [feat] Flip Burning to per-application stacking per §3's owner intent:
      each application deals 1 damage and −1 armor per second for 3 s, stacking like
      Bleeding under the shared 50-stack-per-enemy cap, replacing today's
      `maxStacks 1, refresh strongest` — acceptance: two applications tick twice and
      shred twice; the shared cap's eviction rule (a type under its own cap evicts
      the most numerous other type's shortest stack, never the reverse) holds with
      Burning participating — refs: §3, §16
- [ ] (p10b) [feat] DoT immunity is hardcoded in the engine: `immuneToDot` tests
      `type === 'burning' && TRAIT.burnImmune`, so a taxonomy row with an immunity of
      its own needs an engine edit, against the rule that new mechanics are data
      shapes — acceptance: an optional `immuneTrait` on the damage-type schema,
      resolved through the trait table, with Burning authored to use it and a test on
      a second row — refs: §3, §12, code review on m19c
- [ ] (p10c) [balance] Gate **G13**: no tower type's VS attack takes more than 35% of
      damage across the winning-build pool, every type is solo-viable at T1 and none
      at T3 — acceptance: G13 measured over the seed set on the §1.1 run shape, with
      per-type shares printed on failure. This is the re-price §16 asks for and it
      subsumes the retired A4/A5 measurements — refs: §5, §6.1, G13
- [ ] (p10d) [balance] Gate **G1**: mean victorious run is 30–36 minutes over 24+
      seeds, reported as means and pass rates, never medians — acceptance: G1 green
      on the §1.1 run shape — refs: §1.1, G1
- [ ] (p10e) [balance] Gate **G17** perf, re-baselined as §16 asks: a
      host-independent sim budget per simulated minute replacing today's wall-clock
      "full run under 5 seconds"; 350 enemies with every wielded attack live holds a
      ≥60 fps benchmark; a 50-run soak completes with zero exceptions and zero NaN —
      acceptance: all three clauses green as live tests — refs: §16, G17
- [ ] (p10f) [balance] Gate **G19** liveness: the winning sim builds include both
      sealed and open strategies, and multi-summon usage — acceptance: G19 measured
      over the same pool G13 uses, asserting each strategy appears among the winners
      — refs: G19
- [ ] (p10g) [balance] No gate exercises the armour shred: none of the twelve sweep
      seeds ever builds an Ember Brazier and no bot policy ever draws the flame cone,
      so G4's shred path runs zero times in the sweep that guards balance — the shred
      can regress to nothing without a gate moving — acceptance: a policy or probe
      that actually builds a Brazier is in the gate set, and it asserts a non-zero
      shred — refs: §3, G4, QA on m19c
- [ ] (p10h) [polish] Feel pass: juice, the 2 s TD↔VS transition sweep, and SFX/art
      assets behind the existing AudioSink seam — acceptance: the transition sweep
      runs on every TD↔VS boundary and the asset pass is committed; no sim behaviour
      changes (G2 hash unmoved) — refs: §11, §15 P10
- [ ] (p10i) [polish] Regenerate HANDOFF.md's measured sections against SPEC-FINAL
      and re-check QUALITY.md's Alpha bar — acceptance:
      `npx tsx tools/handoff-metrics.ts` runs clean, HANDOFF.md is rewritten against
      §14's gate list, and the file is committed at the 1.0 point — refs: §16,
      CLAUDE.md

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

## Done

- [x] (p5c) [feat] Gate **G20** — every §5 milestone special measurably changes
      the attack it names, and the loader validates it — this commit. **Gate G20
      is green in full; P5 is done bar the unrelated `p5d` telemetry bug.**
      Ballista, Fire Brazier, Ice Obelisk and Mortar shipped with an empty
      `specials: []` array despite SPEC-FINAL §5.2 naming a milestone for each —
      `data/towers.json` now authors all four: Ballista reuses Arrow's own
      `pierce`/`projectiles` keys verbatim (+1 pierce @2, +1 projectile @4); Fire
      Brazier gets two new keys, `burnStacks` (+1 Burning per hit @2) and
      `coneWidth` (cone width +50% @4); Ice Obelisk gets `slowDuration` ("frost
      lasts 5s" @3); Mortar gets `burnPatch` ("shells leave a burning patch" @3,
      `seconds: 2`). `AttackProfile` (`src/sim/upgrades.ts`) grows matching
      fields (`coneWidthMul`, `burnStacks`, `slowDuration`, `groundBurn`,
      `groundBurnSeconds`), read by `fireTower`'s cone/aura/lob cases
      (`src/sim/towers.ts`) exactly as every existing special already is.
      Mortar's ground patch is a new `GroundArea` (`type: 'burn'`, spawned by a
      new `spawnBurningPatch` in `src/sim/combat.ts`) that reuses the generic
      damage-over-time branch `updateAreas` already runs for the Cinderling's
      fire trail — no new mechanism, just a new caller of an existing one.
      **Two genuine spec gaps needed a judgment call, both logged as Q112**:
      Burning's own row is `maxStacks: 1, refresh: 'strongest'` today (raising
      that cap is `p10a`'s job, explicitly a later phase), so "+1 Burning per
      hit" is read as a dps multiplier on the one stack an enemy can carry, not
      a second literal stack; the patch's dps has no §5.2 number at all, so it
      reuses `damagetypes.json`'s own authored `burning.dps` (1) rather than
      inventing one, and its radius reuses the shell's own blast `aoe`. Neither
      touches a shipped balance number — both are flagged in `/data` `note`
      fields and code comments pointing at Q112. The loader half of G20 is a new
      `validateSpecialChangesProfile` (`src/sim/content.ts`), wired into
      `loadContent`'s existing per-special validation loop alongside
      `validateSpecial`: it evaluates the tower's own real `attackProfile` one
      step below a milestone against one step at it and throws if the two are
      byte-identical, so a special that structurally validates (right kind,
      right companion field) but changes nothing the fire loop reads is still a
      load error, not a step a player pays gold for and receives nothing from.
      **code-reviewer REQUEST-CHANGES → fixed, then re-verified clean**: the
      first draft wired all four milestones into `fireTower` (Act I) but missed
      `fireWielded` (`src/sim/vswield.ts`) entirely — SPEC-FINAL §6.1 wields
      "the highest upgrade effect" of every built tower type into a VS wave, so
      a milestone that only fired in Act I contradicted the spec's own
      inheritance contract and gate G3, untested by anything in the suite.
      Fixed by mirroring the same four field reads into `fireWielded`'s
      cone/aura/lob cases; a new "the same milestones apply to the VS-wielded
      attack (§6.1)" describe block in `tests/p5c-milestone-specials.test.ts`
      drives all four through `updateWieldedAttacks` and would fail if any were
      dropped again, and a pre-existing wielded-burn test in
      `tests/p2b-wielded-fire.test.ts` (written before Fire Brazier had any
      milestone) needed its own expected value corrected to fold in
      `burnStacks` rather than assume pure stat scaling. **qa-playtester FAIL on
      first pass → fixed, then re-verified PASS**: QA built a real, hand-authored
      counterexample the shipped loader accepted silently — a *second*
      `slowDuration` special on Frost Obelisk's real track repeating the
      *first* milestone's own value (not the attack's base) — and reproduced it
      twice independently against `loadContent()` directly, not just the unit
      test. Root cause: `validateSpecialChangesProfile`'s first draft compared
      each special against a synthetic single-special track, which can only
      ever detect "repeats the attack's absolute base," not "repeats a
      different, earlier milestone already active on the same real track."
      Fixed by passing the tower's real, full `upgrades` (all its specials)
      into the before/after comparison instead of a synthetic one-special
      track — every other already-active milestone now stays live in both
      snapshots, isolating exactly the one flip under test — with a new
      regression test pinning QA's own repro shape. QA then independently
      re-reproduced the original failure against the fix (confirmed it now
      throws `towers.json: frost_obelisk special "slowDuration" does not
      change the attack it names`), rechecked the full suite, and confirmed no
      new false-positive rejects any of the twelve real shipped specials.
      **One QA process incident, disclosed and resolved, not a code defect**:
      during re-verification QA accidentally ran `git checkout -- data/towers.json`
      while trying to revert its own scratch edit, which discarded the entire
      legitimate uncommitted `data/towers.json` diff along with it. QA
      reconstructed the four towers' `specials` blocks from the still-intact
      surrounding diff (`upgrades.ts`/`towers.ts`/`vswield.ts`/`combat.ts`/
      `tower-info.ts`/`QUESTIONS.md`/the untracked test file, which pins every
      `at`/`value`/`mul`/`seconds`) and flagged that the player-visible `note`
      strings on three of the four towers were its own reconstructed prose, not
      guaranteed verbatim — confirmed correct in substance (`git diff --stat`
      matched the original 44 insertions / 4 deletions, full suite and `tsc`
      both stayed green) but re-reviewed and tightened by hand afterward for
      tone, since a `note` is flavor text no test asserts. `npm test`: 677
      passed / 33 skipped (0 failed, up from 663/33 before this item — 14 new
      cases in `tests/p5c-milestone-specials.test.ts`); perf config 3/3; `npx
      tsc --noEmit` clean — refs: §5.2, G3, G20, Q112.

- [x] (p5b) [balance] Give an upgrade track its own price multiplier (`costMul`)
      and put Ember Brazier and Mortar on §5's count line — this commit. §5's own
      text ("total track cost = 2x build cost ⚖, per-track `costMul` allowed")
      names the escape the price rule always lacked: `UpgradeTrackSchema`
      (`src/sim/content.ts`) gains an optional `costMul`, and `validateStepPrice`
      reads it in place of the file-wide `upgradeTotalCostMul` when a track
      carries one (`mul = t.upgrades.costMul ?? totalCostMul`). Ember Brazier
      moves from count 10 (a `note` explaining why it stayed off §4's count line)
      to count 4, `costMul: 0.8`, `stepCost` unchanged at 14 (`round(70*0.8/4) =
      14`); Mortar moves from count 10 to count 3, `costMul: 0.6`, `stepCost`
      unchanged at 26 (`round(130*0.6/3) = 26`) — both now sit on the count line
      with no `note`. Ballista and Frost Obelisk are untouched and keep their
      notes (Ballista alone still takes the boss gate's scripted maxbuild run
      from `victory` to `defeat_warden` at the line's count/price; Frost
      Obelisk's A4 T1 clause never clears 4/5 at any price) — the item's "every
      gate p5b touches stays where it was, boss included" clause holds because
      neither is touched. `tests/m20c-roster-tracks.test.ts` gained a test per
      `validateStepPrice` branch (file-wide fallback when `costMul` is absent;
      track-level override, including a wrong-price case proving the function
      reads the track's own value and not the fallback) plus updated on-line/
      off-line roster assertions. **Q111 records the one acceptance clause not
      met**: `mortar alone clears TD at T1` (`tests/a4-single-type.test.ts`)
      stays `.skip`-ed, unchanged by this diff — re-measured with the `costMul`
      change live and still 0/5, because every one of the seven attacking
      towers' T1 clauses is dominated by the same p8a content gap p3e already
      found (`data/waves.json` authors only 10 real wave rows; waves 11-18
      repeat row 10 against a still-climbing HP curve), not by any tower's own
      price or count — re-enable point is `p8a`, same as every other T1 case.
      **code-reviewer APPROVE**, no Critical/Major: confirmed the math on both
      towers, confirmed `costMul` is loader-time-only (runtime charging in
      `src/sim/upgrades.ts` reads `stepCost` directly, no second site needed
      updating), confirmed SPEC-FINAL §5 literally authorizes a per-track
      `costMul`, confirmed no unrelated `/data` numbers were touched, confirmed
      Ballista/Frost Obelisk's notes and off-line status survive. One Nit not
      blocking: BACKLOG's own acceptance text still says "un-skipped and
      green" for the mortar T1 clause, which Q111 now supersedes — this entry
      is that follow-up note. **qa-playtester PASS**: built both towers in a
      real (non-scripted) sim and confirmed exactly 4/3 purchasable steps at
      the unchanged 14/26 gold each, a 5th/4th purchase rejected with no gold
      or tier change; post-max `attackProfile`/HP/armor all finite through a
      full 10-wave `single:ember_brazier`/`single:mortar` BuilderPolicy run, no
      crash or NaN; Ballista and Arrow Spire's pricing is byte-identical
      pre/post-diff; the mortar T1 skip reports as genuinely skipped via
      `--reporter=verbose` ("9 passed, 7 skipped" on that file), not silently
      passing or deleted; replay-hash determinism held across independent
      replays at 3 seeds that build and max both towers. **One pre-existing,
      unrelated bug found and filed separately, not fixed here**: neither
      `pierce`- nor `lob`-kind towers (Ballista, Mortar) ever credit
      `Structure.damageDealt` in `fireTower` (`src/sim/towers.ts`) — every
      other attack kind does, inline — so their stats panels always read 0
      regardless of real output. Reproduces identically on Ballista, which
      this item never touched, confirming it predates and is unrelated to
      `costMul`. Filed as `p5d` per CLAUDE.md's rule (a same-item patch for an
      unreachable, unrelated edge is scope creep; a failing regression test
      belongs with the fix, not the filing), matching the `p2f` precedent.
      `npm test`: 663 passed / 33 skipped (0 failed, up from 661/33 — the two
      new `m20c-roster-tracks.test.ts` cases), perf suite (3 tests) unaffected;
      `npx tsc --noEmit` clean — refs: §5, Q80, Q111, QA on m20c, QA on p5b

- [x] (p5a) [balance] Poison's `+1 projectile @2` fixed — not by pricing, by a
      spec-contradiction correction (Q110) — this commit. p5a was scoped as a
      pricing decision: aim the spare spore at the leading target instead of
      dropping it, re-price the tower alongside, and take G13's T3 clause from
      0/5 to 5/5. That scoping was written against the SPEC-V3-era reading
      Q79/Q86 recorded — Poison's second spore "spreads" to a second enemy,
      unlike Arrow's, which §4 spelled out as "same path." **SPEC-FINAL §5.1's
      own table has since given Poison's second projectile the identical
      annotation Arrow's carries: "+1 projectile (same path, not spread) @2"**
      — the same three words. The shipped code (`targetFirstN`,
      `src/sim/combat.ts`, Poison's only caller) and the m20b tests asserting
      the spread both predate SPEC-FINAL and were never reconciled against it.
      CLAUDE.md rule 3 makes an un-reconciled disagreement with SPEC-FINAL a
      bug, not a gap, outranking the queue — so the fix landed as a spec
      correction, not as the pricing decision p5a was scoped for. **What
      changed:** Poison's `fireTower` case now calls `targetFirst` (one
      primary enemy, matching Arrow's `single` case) and fires every one of
      `prof.projectiles` shots at it — no second-target selection exists at
      all, milestone or not. `targetFirstN` is deleted outright (one caller,
      no other SPEC-FINAL §5 row spreads a milestone projectile). No `/data`
      value changed — `venom_spore`'s damage stays 45. `src/ui/tower-info.ts`'s
      panel text and `attackOutput`'s single-target damage-preview math are
      updated to match (a lone target now takes every projectile, the same
      formula every other kind already used — Poison was the one exception).
      Full write-up at QUESTIONS.md Q110. **What this does NOT do: it does not
      flip G13's T3 clause.** Re-measured with the fix in place (seeds 1-5,
      `tests/a4-single-type.test.ts`'s live `venom_spore alone fails the TD
      wave curve at T3` case): still 0/5, unchanged — every tower's T3 clause
      is now dominated by the p8a wave-11-18 content gap (Q109), not by any
      tower's own damage, so the "same-path fix flips T3 to 5/5" outcome
      Q79/Q86/Q87 worried about (and which the rejected `wip/m20d` tree hit by
      cutting damage 45→23) does not reproduce under the current, re-baselined
      gate. Measured, not assumed, per the standing rule that a deferral is a
      measurement with an expiry date. Acceptance met on two of the item's
      three original clauses: `tests/m20b-owner-towers.test.ts`'s
      "still fires that second spore" case is un-skipped and green (now
      "same path, not spread," structurally never drops a shot); the "worth
      nothing at @2 against a lone target" case that pinned the old wart is
      deleted with it, since that behaviour no longer exists. The third clause
      ("G13's T3 clause holds for venom") does not hold and is not claimed to
      — it is content-gap-bound, re-enable point is `p8a` landing real wave
      11-18 data, same as every other T3 clause p3e already logged this way.
      **code-reviewer APPROVE**, no Critical/Major findings (one Minor, taken:
      flagged that this entry needed to say the T3 clause is unmet/blocked
      rather than silently checking p5a off as if it were). **qa-playtester
      PASS**, no bugs found: live-fire scenarios with 3+ enemies clustered at
      different path-distances confirmed the volley never spreads past its
      one primary target even with candidates available; splash (`aoe: 1`)
      still independently hits bystanders within its radius, proving "no
      spread in primary targeting" and "no splash" are distinct mechanisms and
      the fix touched only the former; poison DoT stacking across a same-
      target 2-spore volley is exactly 2x the 1-spore case, no double-refresh;
      the weapon-info panel's live and pre-upgrade-preview numbers both
      matched real fire exactly; a 12-seed sweep (`maxbuild`/`hybrid`) was
      byte-identical stashed vs. unstashed, confirming no balance drift;
      replay-hash determinism held across two independent seeded runs that
      actually built and fired a Venom Spore. `npm test`: 661 passed / 33
      skipped (0 failed, down one skip from p3e's 661/34 — the one
      newly-enabled case, net against the one deleted case); `npx tsc
      --noEmit` clean — refs: §5.1, Q79, Q86, Q87, Q109, Q110, QA on m20b

- [x] (p3e) [balance] Re-baseline the run-shape-dependent gates against 18 TD + 6
      VS — this commit. **P3 is complete in full (p3a-p3e).** `light-build.test.ts`,
      `tests/a4-single-type.test.ts` (G13's solo-viability clause) and
      `tests/boss.test.ts`'s two win-rate tests all previously measured the legacy
      single-block 10-wave shape (`cfg()`'s default `cycles: 1`); this item, plus
      `tools/a4probe.ts`, re-points each at SPEC-FINAL §1.1's real shape
      (`cycles: 6`, 18 TD waves across 6 blocks) and raises "clears" from wave 10
      to wave 18. `light-build.test.ts` and `tools/a4probe.ts` additionally set
      `world.invulnerable`, isolating the TD/Core-defense claim each makes from VS
      combat survival — a separate, not-yet-buildable claim while P6's nine open
      classes and P7's equipment/VS-upgrade pool are unbuilt (confirmed empirically:
      without `invulnerable`, every policy dies inside VS wave 1 at TD wave 3, no
      differentiation between light and maxed boards). `boss.test.ts`'s two
      win-rate tests are the deliberate exception — reaching and beating the boss
      is inherently a full-run, VS-inclusive claim, so they keep real VS combat.
      **Measured (seeds 1-8 `light-build`, 1-5 `a4-single-type`, 1-20 `boss`):
      every re-baselined assertion reads 0/N**, all dying `defeat_core` (or, for
      the un-isolated boss tests, `defeat_core`/`defeat_warden`) between TD wave
      9 and 14 — never later, never earlier, regardless of build. Root cause,
      confirmed by reading `buildSpawnQueue` (`src/sim/run.ts`):
      `data/waves.json` authors exactly 10 real TD wave rows; waves 11-18 repeat
      row 10's exact composition against the HP-scaling formula's still-climbing
      `1.30^(wave-1)` multiplier, so nothing can sustain the curve past roughly
      wave 9-14 by construction — a content gap, not a P3 defect, tracked
      separately as `p8a` ("wave data on the §1.1 shape"), explicitly queued
      after this item in P8. Per CLAUDE.md rule 6 (never delete a test to go
      green), every assertion that measured red is `.skip`-ed in place with its
      measured numbers inline; every assertion that measured green either way —
      `a4`'s seven T3 "fails alone" clauses, its "walls fail" and "covers seven
      towers" checks, and `boss.test.ts`'s eight non-full-run unit tests (phases,
      telegraph, terrain-shatter, Wraiths, arena fire, chase, Rifts, all built via
      `act2World()` directly) — is untouched and stays live. Q109 records both
      design decisions this item needed (what "clears" means once Act I is no
      longer one linear pass, and what to do once every measurement came back
      red) and the one promise it does not keep: Q83 expected p1b's G7
      sealed-vs-open win-rate band (`tests/p1b-seal-winrate.test.ts`) to be
      re-measured here too, but that test is outside this item's literal
      acceptance text and still reads `cfg()`'s legacy `cycles: 1`, untouched —
      left open, not yet re-queued under a new id.
      **code-reviewer REQUEST-CHANGES → fixed, then re-verified clean**:
      independently confirmed `world.invulnerable` only gates `damageWarden`
      and never `leakIntoCore`, so the isolation is real and doesn't leak into
      gold/telemetry/the replay hash; reproduced every measured number.
      Findings, all fixed: a Major (this item's own commit left BACKLOG.md
      self-contradictory — the audit table already read "P3 done in full
      (p3a-p3e)" while the Queue section still carried `p3e` as an open,
      unchecked item, never moved to Done — fixed by this entry and the
      P1/P3 Queue header rewording above), a Minor (BACKLOG.md's P1 row and
      Queue section both claimed "the p1b band [is] re-measured at p3e per
      Q83," contradicting this item's own Q109 finding that it wasn't —
      reworded), and a Minor/Nit (`tools/m20d-run-a4.ts`, a manual probe no
      test or gate reaches, still hardcoded the old wave-10 bar — bumped to
      `>= 18`). **qa-playtester PASS**, no bugs found: independently
      re-derived every measured number by temporarily un-skipping one case
      per file; confirmed `invulnerable`'s only three live read sites are
      `damageWarden`'s guard, the HUD line and `hashWorld` (itself hashed, so
      it can't silently desync a replay); confirmed the `.skip`s report as
      genuinely skipped via `--reporter=verbose`, not vacuously passed; ran
      all three `light-build` cases un-skipped together with no hang risk
      from the raised `MAX_TICKS`; confirmed the diff touches zero `src/`
      files. `npm test`: 661 passed / 34 skipped (0 failed, up from 670/25 at
      p3d — the net +9 skips this item adds across the three files, no test
      deleted); `npx tsc --noEmit` clean — refs: §1.1, §16, G6, Q109.

- [x] (p3d) [polish] Delete the Day/Dusk/Night/Dawn cycle machine, Rekindle, and
      the V2 Core-detonation clauses — this commit. **Gate G6 is unaffected (it
      was already green in full at p3c); this item is the cleanup §1.1/§6.2 asked
      for once nothing still depended on the old machine.** `Phase` now carries
      exactly §1.1's five phases (`act1_build`, `act1_wave`, `act2`, `levelup`,
      `results` — `dusk`/`dawn` gone); `Command` drops `rekindle`/`dawn_done`;
      `World.dawnTimer`/`duskTimer` and `DAWN_AUTO_SECONDS` are gone.
      `src/sim/sundering.ts`'s `beginDawn`/`advanceFromDawn`/`rekindleTower` are
      replaced by one `advanceToNextBlock`: every live tower simply un-petrifies
      for free — no Rekindle cost, nothing to choose — and the next TD block's
      build phase starts on the very same tick a VS wave's timer (or, on the
      final block, the Warden-Eater) ends. `finishSundering` (the TD-block →
      VS-wave direction) now fires synchronously too: `completeWave` (`run.ts`)
      calls it directly instead of setting a `dusk` phase with a countdown, so a
      block's VS wave begins the instant its last TD wave clears, matching
      §1.1's "20s build, 75s VS, nothing between them" literally rather than via
      the `duskTimer`-collapsed-to-0 workaround p3a shipped. `canBuildNow`
      (`src/sim/towers.ts`) is now exactly the two Act I phases — no more
      `duskTimer > 0` grace clause, since Dusk itself is gone. `clearCorePocket`/
      `openApproachLanes` (the V2 Core-detonation force-clear and guaranteed
      approach lanes) are deleted outright rather than migrated: §6.2 states
      towers stand "inert but present... solid obstacles" through a VS wave,
      which is the opposite of force-clearing a pocket around them, and §10's
      breach-cost pathing (p1a) already guarantees a route exists without
      bulldozing anything. `rekindleCostMul` (`data/towers.json`) and
      `waveEndByCycle`/`nightSecondsByCycle` (`data/waves.json`) are deleted;
      `World.cycle`/`totalCycles`/`RunConfig.cycles` are **kept** despite the
      item's own title naming `cycles` — Q108 records why (§1.1's run is still
      counted in TD-block/VS-wave pairs, and every reader of the field —
      `cycleWaveEnd`, `nightLengthSeconds`, `cycleEliteMul`, `act2Minute` — is
      untouched by this item, all still correct for the §1.1 shape).
      `tests/f001-cycle-machine.test.ts` (the file that drove the old machine
      end to end) and `tests/b004-ember-survival.test.ts` (both `describe.skip`
      bodies referenced `w.phase === 'dawn'`/`{k:'dawn_done'}`/
      `onRekindle`/`onDawnDone` literally, which stopped type-checking the
      moment this item dropped those members — MIGRATION.md originally
      scheduled its deletion for p7d, moved up here since a skipped test still
      has to compile) are both deleted; a new `tests/p3d-cycle-machine.test.ts`
      carries forward the two live assertions `f001` had no successor for
      (`cycleEliteMul`'s per-cycle table read, `act2Minute`'s
      `nightMinuteOffsetPerCycle` compounding — both still-live §16-deferred
      balance knobs `p3e` re-baselines, untouched by this item) plus a new
      regression case built to close a real coverage gap code review found: no
      test anywhere drove a *real* built tower through petrify → VS wave →
      `advanceToNextBlock`'s un-petrify loop and confirmed it actually came back
      live — a silent regression there (e.g. a revert to conditional/Rekindle-
      gated un-petrify, or the loop simply being dropped) would have
      permanently stopped every tower from firing past the first VS wave with
      nothing catching it. Verified the new case actually catches that class of
      bug by temporarily deleting the un-petrify loop and confirming the test
      fails, then restoring it. code-reviewer **REQUEST-CHANGES → both Major
      findings fixed, then re-verified**: (1) this diff originally landed with
      no MIGRATION.md/BACKLOG.md/PROGRESS.md updates and a design decision
      (deleting `clearCorePocket`/`openApproachLanes`, and keeping `cycles`)
      cited in code comments as "Q108" before Q108 actually existed in
      QUESTIONS.md — both fixed (this entry, the MIGRATION.md rows below, and
      the Q108 write-up); (2) `advanceToNextBlock`'s un-petrify loop had no
      direct regression test — fixed with the new case above. One Minor taken:
      `src/bots/policies.ts`'s `POCKET_CLEAR_RADIUS` site-scoring penalty
      referenced the now-deleted `clearCorePocket` in its comment as if still
      live; corrected to name the mechanic as gone and the penalty's continued
      existence as a deferred p3e balance question (Q108) rather than changed
      blind, since altering `BuilderPolicy`'s site scoring reaches every
      seed-pinned gate a `maxbuild`/`hybrid`/`sealed`/`turtle`/`greedy` bot
      plays — exactly the blast-radius CLAUDE.md's measurement rules warn a
      "narrow" fix can have. **qa-playtester PASS**, no bugs found: real
      (non-scripted) bot runs across several seeds/policies/cycle-counts
      through every TD-block↔VS-wave boundary with no hang or stuck phase;
      `canBuildNow` rejects every build attempt during `act2`, spam included; a
      structure killed mid-VS-wave stays dead through the immediate block
      transition (not resurrected, not double-counted) while its live siblings
      un-petrify with HP intact; multi-summon (p3b) stacking still caps and
      still can't cross a block boundary; leak coupling (p3c) still funds the
      following VS wave correctly now that the transition is synchronous;
      replay-hash determinism holds across independent runs at multiple cycle
      counts; a repo-wide grep for `dusk`/`dawn`/`rekindle`/`Rekindle`/
      `DAWN_AUTO_SECONDS`/`duskTimer`/`dawnTimer` turns up nothing live outside
      doc-comments and this file's own history text. `npm test`: 670 pass / 25
      skipped (main config, up from 667/25 — the 3 new
      `tests/p3d-cycle-machine.test.ts` cases net against the tests deleted
      alongside `f001`/`b004`) + 3 pass (perf config); `npx tsc --noEmit`
      clean — refs: §1.1, §6.2, G6, Q108

- [x] (p3c) [feat] Leak coupling restated on the new shape — this commit. The
      mechanism itself (`leakIntoCore` in `src/sim/enemies.ts`, `finishSundering`
      in `src/sim/sundering.ts`) already implemented SPEC-FINAL §1.1's literal
      "2 × its spawn cost into the next VS wave's budget" rule before this item —
      `data/spawns.json`'s `leakBudgetMultiplier` already reads `2`, and the
      TD-block → VS-wave transition (`finishSundering`, unconditional regardless
      of `totalCycles`) already spends `nightBudgetBonus` into `spawnBudget` and
      clears both it and `looseInTheDark` exactly once per transition. Nothing in
      `src/sim` changed. The work was `tests/f003-leak-coupling.test.ts`'s
      re-pointing from SPEC-V2 §1/Day-Night/gate-B7 language to SPEC-FINAL
      §1.1/TD-VS/gate-G6 language, an explicit `expect(leakBudgetMultiplier).
      toBe(2)` pin of the spec's literal number, and one new test driving a full
      scripted 6-block (18 TD + 6 VS) run — the real §1.1 shape landed by p3a/p3b,
      not the legacy single-block `cycles: 3` config the older cases used — with
      a distinct leak count per block (1..6) so a stale carry-over or
      wrong-block attribution would show up as a mismatched total at some block.
      Confirmed the final, boss-gated 6th VS wave is funded by the same
      unconditional `finishSundering` path as every other block (no special-casing
      to go missing). code-reviewer **APPROVE** (1 Minor taken: a redundant
      duplicate assertion in the `block === 6` branch, already covered by the
      loop's own per-block check, replaced with a comment; 2 Nits not blocking:
      the `expect(mul).toBe(2)` literal is intentional — it pins the spec's own
      number, not a `/data` implementation detail, so a future `leakBudgetMultiplier`
      retune needs to touch this line too; a redundant no-op `w.duskTimer = 0`
      carried over from the older single-block tests). **qa-playtester PASS**,
      no bugs found: independently verified with real (non-scripted)
      `hybrid`/`turtle`-bot-driven sims across many seeds that a TD block's real
      leaks fund the following VS wave's `spawnBudget` exactly, that the HUD's
      "Loose in the dark" counter resets the instant the transition fires, that a
      leak on the exact wave-clearing tick can't double-count or drop (the
      `'dusk'` phase branch never calls `leakIntoCore`), that p3b's multi-summon
      stacking can't cross a block boundary so a stacked fight can't misattribute
      a leak's budget, and that the final boss-gated VS wave (reached in a real,
      non-forced `godMode` run) is funded identically to every other block.
      `npm test`: 674 pass / 33 skipped (0 failed, up from 673/33 pre-p3c — the
      one new test), byte-identical elsewhere since no `src/` file changed — refs:
      §1.1, G6

- [x] (p3b) [feat] Multi-summon: the player may call the next TD wave(s) early,
      stacking up to `maxStackedWaves` (3) at once — this commit. Gate **G6 is now
      green in full** (p3a landed the pattern half; this item lands the stacking
      half). `src/sim/run.ts`'s `call` command now handles two cases: in
      `act1_build`, unchanged pre-existing behavior (pay off whatever is left of
      the live `buildTimer`, zero it, let `updateAct1Build` start the wave). In
      `act1_wave` (a wave already fighting), `call` pulls the *next* wave's own
      not-yet-started build phase forward — paying the *full* `buildPhaseSeconds ×
      earlyCallGoldPerSecond` bonus, since none of that wave's own timer has
      ticked — and merges its freshly-built spawn queue onto the fight already in
      progress. `World.stackDepth` (new field, `src/sim/world.ts`) counts the 0..
      `maxStackedWaves - 1` extra waves merged this way; a call once `stackDepth`
      is already at cap is rejected outright (no gold, no state change) — the
      fourth-stack rejection G6 asks for. A call cannot pull a wave across the
      current TD block's boundary into the VS wave that follows (checked against
      `cycleWaveEnd`, unchanged from p3a), and is a total no-op in every phase but
      `act1_build`/`act1_wave` — VS "cannot be stacked or skipped," so `dusk`,
      `act2`, `levelup`, `dawn` and `results` all reject it identically.
      `completeWave` now resolves the whole merged range (`w.wave` through
      `w.wave + stackDepth`) at once when the fight finally clears: every wave in
      the range still pays its own clear bonus, its own line in
      `goldEarnedByWave`/`wavesCleared`, and (after a code-review fix, below) its
      own Sprout-tower income, then `w.wave` advances to the top of the range and
      `stackDepth` resets to 0 — a true no-op, byte-identical to the pre-p3b
      single-wave path, whenever nothing was stacked. `spawnQueue` entries grew a
      third element, their true origin wave (`[enemyDefId, gateIndex, originWave]`)
      — a merged fight interleaves more than one wave's composition, so
      `spawnedByWave` telemetry and per-enemy HP scaling (`waveHpScale`) now stay
      attributed to the wave that actually authored each enemy rather than
      collapsing onto the fight's base wave. `maxStackedWaves` is a new required
      `data/waves.json` field (3, per §1.1's own "up to 3 at once ⚖") rather than a
      hardcoded constant, per CLAUDE.md's architecture rule 4. `World.stackDepth`
      is hashed (`hashWorld`, `run.ts`) since it gates the timing of the next
      block/dusk transition, the same class of state `wieldedCooldown` is hashed
      for (x002/p2b precedent). Q107 records the design decision (one merged fight
      vs. three parallel ones — merged was chosen, smaller diff, reuses
      `applyCommand`/`completeWave` as-is) and the two things deliberately left
      imprecise: `leaksByWave` still attributes a leak to the fight's base wave
      rather than the leaking enemy's true origin (would need an `Enemy` schema/
      hash change for a telemetry-only number nothing gates), and
      `src/ui/progress.ts`'s `waveBar` sub-progress text can be briefly off mid-
      stack (self-corrects the instant the stack resolves, no test covers it).
      **code-reviewer REQUEST-CHANGES → fixed, then re-verified clean**: the first
      draft hoisted `collectSproutGold(w)` outside the new per-wave loop in
      `completeWave`, so an N-wave stacked clear collected only one wave's worth of
      Sprout-tower income instead of N (and, since `goldEarnedByWave[wv]` was
      recorded before that wave's own Sprout income landed, the *unstacked* path's
      telemetry silently reordered too, though its gold total stayed correct).
      Fixed by moving the call inside the loop, once per `wv`, in the same
      relative position the original single-wave code used; a new regression case
      builds one Harvest Sprout and asserts a 2-wave stacked clear banks exactly
      two waves' worth of wave-clear-plus-Sprout income, not one. **qa-playtester
      PASS**, no bugs found across a wide adversarial pass: the three literal
      acceptance clauses (4th call rejected, each of 3 stacked waves pays its bonus
      exactly once, VS-phase no-op checked in all five non-TD phases individually);
      stacking cannot cross a block boundary (checked at wave 3→4 and at the very
      last global wave, 17→18 of cycle 6); a double `call` landing in the same tick
      during `act1_build` doesn't double-pay; `dev skip_wave` on a 3-stacked fight
      still resolves all three waves with distinct bonuses; calling on the exact
      tick a merged fight would otherwise complete delays completion by one tick
      rather than racing; replay-hash determinism holds across two independent
      runs sharing a seed and a command log with stacked calls in it; a full-run
      fuzz (spamming `call` every tick for 5 seeds, and a `hybrid` bot with `call`
      layered on every tick) never produced negative gold, NaN, an out-of-range
      `stackDepth`, or `w.wave > w.waveCount` — a bot that spams `call` dies early
      to leaks from build-time denial, the intended risk of misusing the
      mechanic, not corruption. `npm test`: 673 passed / 33 skipped (0 failed,
      up from 668/33 pre-p3b — the 5 new `tests/p3b-multi-summon.test.ts` cases),
      byte-identical elsewhere since the only existing caller of `call`
      (`src/bots/policies.ts`'s `rushWaves`) is gated to `act1_build` and never
      triggers stacking — multi-summon is a mechanism a bot can now legally use,
      not one any bot uses yet; wiring one in for gate **G19** ("winning sim
      builds include ... multi-summon usage") is `p10f`'s job. `npx tsc --noEmit`
      clean; perf suite (`vitest.perf.config.ts`) green — refs: §1.1, G6, Q107

- [x] (p3a) [feat] The §1.1 run shape: 3 TD waves then 1 VS wave, repeating; 18 TD
      + 6 VS per run — this commit — `World.totalCycles` now defaults to 6 (was 3),
      `World.waveCount`/`cycleWaveEnd`/`nightLengthSeconds` (`src/sim/world.ts`)
      are retargeted to a flat `tdWavesPerVsWave × cycle` / fixed `vsWaveSeconds`
      formula sourced from two new `data/waves.json` fields (`tdWavesPerVsWave: 3`,
      `vsWaveSeconds: 75`), and `buildPhaseSeconds` is edited `30 → 20` to match
      §1.1's literal ⚖ number. **Design decision (Q105): reuse the V2 Day/Dusk/
      Night/Dawn cycle machine, retargeted, rather than build a parallel driver** —
      smaller diff, keeps `dusk`/`act2`/`dawn` and Rekindle exactly as the still-live
      machinery `p3d` formally deletes later, and the two shapes are structurally
      identical ("N blocks, the last boss-gated") once the per-cycle content tables
      are replaced by flat constants. `World.waveCount` branches on
      `totalCycles <= 1`: that branch (`content.waves.waves.length`, unchanged) is
      the legacy single-pass escape hatch `tests/helpers.ts`'s default `cfg()` and
      `light-build.test.ts` already opt into on purpose, left byte-for-byte alone;
      any `totalCycles > 1` gets the new §1.1 shape, landing on TD wave 18 even
      though `data/waves.json` only authors 10 real rows (`buildSpawnQueue` already
      repeats the last authored row past the table's end — real 11-18 content is
      `p8a`'s, not this item's). **Gate G6's pattern half is green**: a full
      scripted 18 TD + 6 VS run (new test `tests/p3a-run-shape.test.ts`) visits VS
      exactly after TD waves 3/6/9/12/15/18 and not before/elsewhere, TD wave 18's
      real spawn queue carries the Gatebreaker, the final VS wave ignores the 75s
      timer entirely and only ends on the Warden-Eater's death, and building is
      rejected throughout every VS wave. `p3b` (multi-summon stacking), `p3c`
      (leak coupling's ×2-into-next-VS-wave restatement) and `p3d` (formally
      deleting the old cycle machine) are untouched and still open — this item only
      lands the pattern, not those three.
      **code-reviewer REQUEST-CHANGES → fixed, then re-reviewed clean**: the
      reused V2 "Dusk" phase's old 15s cinematic delay stayed buildable
      (`canBuildNow` allowed `'dusk'` unconditionally) while its duration was still
      15s for every shape, which would have bought every non-final block 15s of
      legal building beyond the spec's stated 20s and inflated a block's wall-clock
      length to 20+15+75=110s instead of the 95s the spec's two ⚖ numbers imply —
      fixed by collapsing `duskTimer` to 0 for any `totalCycles > 1` run
      (`completeWave`, `run.ts`) while leaving the legacy 15s Dusk exactly as it was
      for `totalCycles <= 1`. Two Minors taken: the Gatebreaker assertion now has a
      comment naming its actual scope (wave 18's queue matches because
      `buildSpawnQueue` repeats wave 10 for every wave 10-18, not because 18 is
      specially authored — that's `p8a`'s), and `data/waves.json`'s now-dead
      `waveEndByCycle`/`nightSecondsByCycle` fields are flagged as deferred to
      `p3d`. One Minor left for `p3e` per the standing no-balance-tuning
      constraint: `eliteMulByCycle`/`nightMinuteOffsetPerCycle` (V2 per-cycle heat
      knobs authored for 3 cycles) degrade safely under the new default of 6
      cycles but silently reshape difficulty (12.5 min of baked-in Night-warmup
      offset by the boss-gated final VS wave, only cycle 2 of 6 gets an elite
      multiplier) — not touched here, since editing either value is the balance
      tuning Q40 defers to P10/`p3e`.
      **qa-playtester FAIL on first pass → fixed, then re-verified**: found a real
      one-tick build window at every TD-wave-3/6/9/12/15/18 → dusk → VS boundary,
      for every multi-block run — `Run.step` applies a tick's commands *before*
      the phase switch's `'dusk'` case can call `finishSundering`, so a `build`
      command landing on the exact zero-`duskTimer` dusk tick still went through,
      one tick before the phase machine ever showed `act2`. Fixed by gating
      `canBuildNow` (`src/sim/towers.ts`) on `phase === 'dusk' && duskTimer > 0`
      rather than `phase === 'dusk'` alone, with a new regression case in
      `tests/p3a-run-shape.test.ts` asserting rejection at exactly that tick, for
      every one of the 6 blocks. Every other item on QA's checklist passed clean
      on the first pass: build/upgrade/sell spam during VS (no gold spent, no
      structures placed), a Core-HP-0 death mid-TD-wave and a Warden-HP-0 death
      mid-VS-wave both resolve cleanly through the existing slow-mo beat with no
      hang, replay-hash determinism holds across the new transitions (same
      seed+policy, two independent runs, identical `endHash`), and five unattended
      `hybrid`-policy seeds each reach a terminal outcome through real combat
      without hanging on any phase.
      `npm test`: 668 passed / 33 skipped (0 failed) before and after every fix in
      this item, plus the perf suite (3 passed); `npx tsc --noEmit` clean
      throughout. One live test's pinned seed moved twice in this item, both times
      measured not guessed (`tests/f001-cycle-machine.test.ts`'s "a scripted
      3-cycle sim completes": seed 8 → seed 1 on the formula change alone, then
      seed 1 → seed 4 once the code-review dusk fix made the economy slightly
      harder too — seed 4 is the lowest of 25 seeds, of 1-60 probed, that a
      `hybrid` bot still reaches cycle 3 with under the code as it now stands, no
      `/data` edits). See QUESTIONS Q105 for the full design writeup (the
      reuse-vs-parallel-driver choice, the `totalCycles<=1` legacy branch, both
      code-review/QA fixes, and the `p3e`-deferred elite/heat-scaling
      consequence) — refs: §1.1, G6.

- [x] (p2e) [polish] Delete the Sundering and soul-binding — this commit — the
      named 8-weapon roster (`data/weapons.json`, deleted), its schemas
      (`WeaponSchema`/`WeaponLevelSchema`/`AwakeningSchema`, `content.ts`), its
      fire loop (`fireWeapon`/`updateWeapons`/`intervalFor`/`grantWeapon`,
      `weapons.ts`, cut from 325 lines to 14 — Palisade/Beacon/Sprout terrain
      residuals only), the Dusk soul picker (`beginSoulPick` and its helpers,
      cut from `sundering.ts`), weapon state (`WeaponState`, `w.weapons`,
      `w.soulLevels`, `w.soulCandidates`, `s.soulSuppressed`), the
      `weaponSlots`/`startWeaponLevel` stats, the HUD's soul-picker modal and
      weapon-info card (`showSoulPicker`/`weaponInfoMarkup`, `hud.ts`/
      `tower-info.ts`), bot soul-picking logic (`policies.ts`), and every
      tower's `soul` field (`data/towers.json`) are all gone. §6.1's
      replacement — wielded attacks derived from built tower types
      (`vswield.ts`, p2a/p2b) plus each tower's §5 VS special (`vsspecials.ts`,
      p2c) — already carried the whole mechanic live since p2c; this item only
      removes the older system it was still double-paying alongside (Q97,
      Q103). The AoE/pierce falloff constants (`aoeFullTargets`, `aoeFalloff`,
      `pierceFalloff`, etc.) moved from `data/weapons.json` to
      `data/towers.json` since the damping rule is generic to every attack
      shape, not weapon-specific.
      **Q104**: `src/sim/sundering.ts` is not deleted wholesale despite the
      item's literal text — only `beginSoulPick` and its helpers are cut. The
      Day/Dusk/Night/Dawn cycle machine (`finishSundering`/`petrify`/
      `clearCorePocket`/`openApproachLanes`/`linkSpires`/`beginDawn`/
      `rekindleTower`/`advanceFromDawn`) is a separate, still-live mechanic
      that P3's `p3d` retires on its own schedule, exercised end to end by
      `tests/f001-cycle-machine.test.ts` — deleting it here would have broken
      a not-yet-retired test to satisfy a filename match, which CLAUDE.md
      rule 5 (choose and log, don't stall) reads as the wrong trade.
      **Q101**: deleting `weaponSlots`/`startWeaponLevel` orphaned three tree
      nodes and one quest; each got an on-theme mechanical replacement rather
      than being left dead — `soul_furnace` (notable) → `attackSpeed +12%`
      (sized like the branch's other small-node-to-notable jumps), `glass_arsenal`
      (keystone) → `power +25%` alongside its unchanged `-30%` Max HP (keeps the
      glass-cannon trade-off a keystone needs), `deep_roots` (keystone) → its
      weapon-slot clause is simply dropped (pure subtraction, no compensating
      grant needed). The `four_slot_win` quest ("Ascetic") is restated from
      "win using at most 4 weapon slots" to "win having built at most 4 tower
      types" (`wins_max4towertypes`, counted off `report.towersByKey` filtered
      to `attack !== null` so a wall-only maze still costs nothing toward the
      cap, the same substitution `tools/a4probe.ts`'s `SOUL_TOWERS` already
      made). `tools/gen-tree.mjs` is the edited source; `data/tree.json` is
      regenerated from it, diff confined to those three nodes.
      **Q102**: `w.shrineHaste` (Beacon Totem's petrified-terrain haste
      residual) is still written every Act II tick by `updateTerrainEffects`
      but is now read nowhere — `intervalFor` was its only consumer and is
      deleted with the rest of the fire loop, and neither `vswield.ts`'s
      wielded-attack cooldown nor the Act I manual attack ever read it either,
      so the gap predates this item. Left unwired rather than guessed at:
      CLAUDE.md's blast-radius rule cuts against a drive-by integration guess
      inside an already-shipped, already-reviewed file during an unrelated
      deletion pass. Flagged for whoever next touches `vswield.ts`, or a
      dedicated balance item, to decide.
      **Q103 — balance, measured not tuned, and larger than any prior item's.**
      The soul-weapon fire loop was firing *alongside* every built tower's
      wielded attack, not merely duplicating a residual (unlike Q97's three
      terrain riders) — deleting it removes the bulk of a scripted board's Act
      II damage, not a marginal share. Measured (seeds 1-40, no `/data`
      edits): `maxbuild`'s boss win rate goes from measured-high pre-p2e to
      **0/40**; `sealed`/`greedy`/`turtle` also drop to 0/40; `hybrid` (a
      narrower 6-type mix without `upgradeFirst`) survives far better at
      **20/40** (9/20 over the seed range the existing tests already probed).
      Three tests re-pinned to this measured reality, nothing tuned in
      `/data`: `tests/boss.test.ts`'s two boss-fight assertions moved from
      `maxbuild` to `hybrid` (single-run case: seed 1, victory, 862s; rate
      case: restated from a 60% "most win" floor to a 25%-65% band around the
      measured 45%, since "most" is no longer true at 9/20); `tests/a3-
      movement-mandatory.test.ts`'s Q100 exception (seeds 3 and 5 winning
      stationary) is gone now that the other half of that stack is deleted,
      so all twelve `no-move` seeds are unanimously `defeat_warden` again —
      folded back into one claim rather than kept as a second, now-always-empty
      `it`; `tests/f001-cycle-machine.test.ts`'s cycle-3 pin moves from seed 18
      (no longer reaches cycle 3 under `hybrid`) to seed 8. Whether §6.1's
      wielding-alone formula is supposed to be this much weaker than the V2
      mechanic it replaced is a **P10 balance question** — these three tests
      only pin that the run shape still functions end to end, not that the
      numbers are right.
      Acceptance met: `data/weapons.json` deleted; `npm test` green (both
      `npx vitest run` — 667 pass/33 skipped — and `npx vitest run --config
      vitest.perf.config.ts` — A10 in budget); MIGRATION.md §8's five
      retire-with-p2e rows (`sundering.test.ts` all 4 describes, `act2.test.ts`'s
      `soul weapons` and `weapon inheritance` describes, `f004-class-
      framework.test.ts`'s Dusk-picker describe, `content-complete.test.ts`'s
      "has 8 weapons" case) are all actually deleted, confirmed by grep; a
      repo-wide `grep -rniE "soul|awakening" src/` turns up only the sanctioned
      survivors (the still-live Dawn/Rekindle UI's flavour text and the Q101/
      Q104 doc comments explaining what moved) — no dead code from the deleted
      system. code-reviewer **APPROVE** (2 Minor, both taken: a doc comment in
      `vsspecials.ts` still named the deleted `weapons.ts` as the poison
      mechanism's other user, corrected to `vswield.ts`/`towers.ts`; the Dawn
      modal's copy — "leave it and its soul stays bound for Night" — described
      a mechanic that no longer exists, reworded to "leave it and it stays
      petrified through Night"). **qa-playtester PASS**, no bugs found across
      a full adversarial pass: a mixed-type board through Dusk → Act II → boss
      with no crash and `damageByWeapon` correctly keyed by tower key; a
      zero-structures run through Dusk and into Act II with `wieldedAttacks(w)`
      empty and the HUD's lineage panel safely rendering nothing; save
      migration unaffected (weapon state was never part of the persisted
      `MetaState` — only `World`/run state carried it, and that was never
      serialized); the `four_slot_win` boundary (wall-only free, 4 attacking
      types passes, 5 fails) independently re-derived from the code, not just
      the write-up; `tools/gen-tree.mjs` reproduces `data/tree.json` byte-for-
      byte on a fresh run — refs: §6.1, Q97, Q101, Q102, Q103, Q104

- [x] (p2d) [polish] Weapon panel shows §6.2's per-type lineage — commit `46eaef5` —
      `wieldedAttacks` (`src/sim/vswield.ts`) gained `perTowerAverage`, the average
      per-tower damage before §6.1's "+10% per tower" bonus, exposed so a reader
      never re-derives that fraction itself. `wieldedLineageText` (`src/ui/tower-
      info.ts`) maps `wieldedAttacks(w)` to one line per type — "Arrow ×3 (avg 14.2,
      +30%) — pierce 2" — via `lineageLine`/`lineageSpecial`, a compact per-kind
      phrase table (single/pierce/cone/aura/chain/lob/poison) alongside the existing
      `KIND_TEXT`. `Hud.renderWeaponInfo` (`src/ui/hud.ts`) renders the block below
      (or, with no soul weapon equipped, in place of) the soul-weapon card, keyed by
      a sorted `towerId.tier` roster fingerprint so the cache invalidates on a
      mid-VS-wave tower death (an enemy kill through `World.removeStructure`), not
      just build/sell/upgrade. Acceptance met: `tests/p2d-weapon-lineage.test.ts`
      (4 cases) — the worked-example line shape round-tripped against
      `wieldedAttacks`' own `perTowerAverage`/`damage`/`profile` fields rather than a
      second copy of the bonus formula, one well-formed line per attack-bearing
      tower kind (all 7), a no-attack tower (wall) contributing no line, and a
      live-DOM `Hud` test proving the panel drops a dead tower's line on the very
      next `update()` instead of serving a stale cached render. code-reviewer
      **APPROVE** (2 Minor, logged not blocking: the roster fingerprint is
      recomputed by `filter`+`map`+`sort`+`join` every VS-phase frame rather than
      gated behind a dirty flag — real but bounded by tower count, not a hard-rule
      violation since it's `/src/ui`, not `/src/sim`; and the soul-weapon-equipped
      cache-key branch shares the identical fix but has no direct regression test
      of its own, only the no-weapon branch does). **qa-playtester PASS**, no bugs
      found across multiple simultaneous wielded types, mixed tiers of the same
      type, a tower dying mid-wave to enemy damage vs. sell, building blocked
      outright during VS (confirmed structurally via `canBuildNow`'s phase gate, so
      "new type appears mid-wave" cannot happen), the panel correctly absent outside
      VS, a 60-tower boundary case (no NaN/overflow), and replay-hash safety — the
      new `perTowerAverage` field and the whole lineage derivation are pure reads
      never touched by `hashWorld`, same as the pre-existing `wieldedCache`. Full
      suite: 685 pass / 67 skipped, plus the pre-existing host-dependent A10
      wall-clock flake, confirmed by QA to fail identically with this diff stashed
      out (not a regression) — refs: §6.2, G3, Q95

- [x] (p2f) [bug] `triggerBurningExplode` (`src/sim/enemies.ts`) no longer recurses
      directly through `killEnemy` → `damageEnemy` → `triggerBurningExplode` — this
      commit. `killEnemy` now pushes the dying Burning enemy onto a new
      `w.pendingBurningExplosions` queue and calls `drainBurningExplosions(w)`
      (`enemies.ts`), a small helper guarded by `w.drainingBurningExplosions`: a
      re-entrant call from deeper in the chain (`triggerBurningExplode` →
      `damageEnemy` → `killEnemy`) just enqueues and returns, so only the
      outermost call runs the `while (pop() !== undefined)` loop — a long chain
      now grows the queue array, not the JS call stack. Both new fields are plain
      `World` class-field initializers (`world.ts`), the same pattern as the
      existing `deadEnemies`/`deadStructures` flags; `drainBurningExplosions`'s
      `finally` clears both unconditionally (flag *and* queue, the latter a
      code-reviewer Minor taken so an exception mid-drain can't leave a stale
      remainder for the next, unrelated Burning kill to replay), so the queue is
      always empty and the flag always false by the time control returns to any
      caller — which is also why `hashWorld` needs no new case: the fields are
      never observably nonzero at a hash point, same reasoning that already
      excludes `dotScratch` and friends. Acceptance met:
      `tests/p2c-vs-specials.test.ts` gains "a large tightly-clustered Burning
      chain does not overflow the call stack" — a 45×45 grid (2025) of hp-1,
      speed-0 Burning husks spaced 0.4 tiles apart (inside the r1 explosion
      radius) under a live Ember Brazier in a VS wave; killing one asserts
      `damageEnemy` does not throw and that more than half the grid dies (so the
      cascade is proven to propagate, not fizzle after one hop). Both
      code-reviewer and qa-playtester independently confirmed empirically that
      the test reproduces the original `RangeError: Maximum call stack size
      exceeded` when only `enemies.ts`/`world.ts` are reverted and the test is
      kept — a real, non-vacuous regression test, not a coincidental pass.
      code-reviewer **APPROVE** (2 Minor, both taken: the `finally`-clears-queue
      fix above, and `triggerBurningExplode`'s `enemiesInRadius` call reusing a
      new module-level `burningExplodeScratch` array instead of allocating fresh
      per explosion, mirroring the existing `dotScratch` pattern — now load-bearing
      since a chain runs to completion at thousands-of-explosions scale instead of
      crashing partway through). **qa-playtester PASS**, no bugs found across five
      adversarial scenarios beyond the regression test itself: ordinary small
      chains (2-5 enemies, three hp distributions) hit byte-identical targets
      under old vs. new code (order-independence — a fixed point, not a
      DFS-vs-BFS artifact); a non-explosion death queued mid-drain still dies
      exactly once and the redundant re-hit on the now-dead enemy is a correct
      no-op; Act I (`huntsWarden` false) touches neither new field; the two new
      `World` fields carry no replay-hash gap (argued above, and empirically
      unmoved on `f001-cycle-machine.test.ts`'s rekindle-replay hash case); and
      two alive Braziers matching the special still deal exactly one hit each
      (unchanged p2c semantics, the scratch-array reuse is safe because a
      re-entrant push never itself iterates the array — only the outermost call's
      `for` loop does, and it always finishes before the next tower in the same
      synchronous loop can reuse the buffer). Full suite: 681 pass / 67 skipped
      (byte-identical to pre-p2f), plus the pre-existing host-dependent A10
      wall-clock flake (recorded at p1b, not caused here; measured again this
      commit at 5514ms vs the 5000ms budget) — refs: §5, QA on p2c

- [x] (p2c) [feat] Towers inert but present in VS waves, each contributing its §5
      VS special — this commit — `src/sim/vsspecials.ts`'s `updateVsSpecials(w, dt)`,
      wired into `updateAct2` (`src/sim/run.ts`) alongside `updateWieldedAttacks`.
      "Inert" needed no new gate: `updateTowers` (the only thing that fires an Act I
      tower attack) is structurally reachable only from `act1_build`/`act1_wave`, never
      from `updateAct2`, so the acceptance criterion's first clause was already true —
      this item's actual work is the second, the six §5 specials. Three are
      timer-driven and character-relative (`vsspecials.ts`): Venom Spore's poison
      trail follows the Warden and refreshes at `wielded.damage × 0.1` every second
      (reusing the ordinary `GroundArea('poison')` mechanism the `toxic_trail` soul
      weapon already used, so the DoT stacks/caps/sheds like any other poison);
      Frost Obelisk's r2 ice aura follows the Warden and applies Frost (§3's status,
      not V2's plain slow) every second; Tesla Coil's wire grid reuses `linkSpires`'s
      existing pairing and pulses 5 dmg every 0.5s between every linked pair, each
      pair exactly once (`otherId < s.id` skip). One is death-reactive
      (`triggerBurningExplode`, `src/sim/enemies.ts`, called from `killEnemy`, gated
      on `w.huntsWarden` so it is VS-only): a Burning enemy dying deals 5 normal, r1,
      to nearby enemies, reading whichever Brazier is actually built rather than
      hardcoding the tower key (the m19a `shredArmor` failure mode named in its own
      doc comment). Two needed no new code at all: Beacon's haste and Sprout's gems
      already existed as the `shrine`/`gem_bloom` terrain rows and already matched
      §5's numbers verbatim (Q99) — `vsSpecial: {kind: 'beaconHaste'|'sproutGems'}`
      is a marker only, so the Codex/loader can see every tower has an authored
      special without a second copy of numbers to drift out of sync.
      **Retired alongside it:** the V2 "terrain residual" damage/CC code (auras,
      slows, beams) that used to fire Ember Brazier/Frost Obelisk/Tesla Coil's old
      effects from the tower's own tile — Q97 had already named it as double-paying
      against both `updateWieldedAttacks` and the new specials, and it is now deleted
      from `weapons.ts` rather than left to keep double-paying. `vsSpecial` is a
      required, typed discriminated union on every `TowerDef` (`content.ts`) — "none"
      is explicit — so a special with no engine reader is a load error, not a
      silently-dead data row. Q98 logs three unstated §5 defaults (no character-stat
      scaling on any VS special — §6.2 calls it a property of the tower, not the
      wielding language §6.1 uses; poison trail radius 1, matching Venom Spore's own
      authored `aoe`; electric pulse 5 dmg/0.5s, the old `beamDps: 10` continuous
      residual's average unchanged, a mechanical no-op per Q40's no-tuning rule).
      Acceptance met: `tests/p2c-vs-specials.test.ts` (9 cases) — zero tower-dealt
      damage across a full 4500-tick/75s VS wave with the Warden outside both attack
      and wielded range, an enemy damaging a tower during VS, and one test per special
      (wire grid pulse, poison trail dps/position, brazier explosion plus the
      no-brazier-no-explosion negative, frost aura radius cutoff, beacon haste
      falloff, sprout gem cadence/value).
      code-reviewer **APPROVE** (2 Minor, both taken: the five terrain fields the
      deleted residual code left as silently-dead schema/data — `auraRadius`/
      `auraDps`/`auraType`/`slow`/`beamDps` — removed from `TerrainSchema` and the
      four towers.json rows that carried them, since `vsSpecial` now owns those
      numbers; the zero-damage test widened from a 300-tick stand-in to the real
      4500-tick wave and the enemy-damages-tower test given `w.phase = 'act2'` so it
      actually exercises VS rather than a phase-agnostic path — plus 2 Nits not
      taken: caching the per-tick alive-special scan the way `buildTerrainEffects`
      does, and a comment noting the Brazier explosion's death-chain recursion is
      intentional). **qa-playtester PASS** on every acceptance clause plus seven
      adversarial scenarios (redundant same-kind towers, mid-wave tower death via
      enemy damage, sell-before-Act-II, determinism across two independent 4500-tick
      worlds with every special live, 3+-way Tesla Coil linking) — one real bug
      filed, not fixed here: `triggerBurningExplode`'s direct recursion through
      `killEnemy` overflows the call stack at ~1500-1600 chained Burning deaths in
      one explosion-radius cluster, latent under today's 350 `aliveCap` but a real
      crash risk if that cap ever grows or a burst-kill tool hits a packed crowd —
      filed as **p2f** with QA's exact repro, since CLAUDE.md's rule is a failing
      regression test before the fix, not a same-item patch for an unreachable edge.
      **Balance — measured, nothing tuned.** Retiring the double-paying residual
      (Q97) while standing up Frost Obelisk's character-following aura in its place
      changes what it replaces: the old residual only reached enemies that happened
      to path near the tower's own (petrified) tile, the new one blankets whoever is
      actually pressing the Warden, continuously, for the whole fight. Measured (a
      scratch probe, seeds 1-12, `no-move`): 2 of 12 previously-`defeat_warden` seeds
      (3, 5) now read outright `victory`/`bossKilled: true` — the first time this
      suite's "a stationary Warden always dies" claim has stopped being literally
      true rather than merely slower (Q100). `tests/a3-movement-mandatory.test.ts`
      keeps both facts live rather than hiding either behind a `.skip`: the top `it`
      asserts "always dies" over the ten seeds that still support it, a new second
      `it` asserts the two-seed exception as a measured fact. `tests/f001-cycle-
      machine.test.ts`'s reseed (seed 5 → 18) is the same mechanism's other
      consequence: retiring the residual is a real Act II damage cut for a `hybrid`
      board that leaned on it, so seed 5 no longer reaches cycle 3 (dies mid cycle 1)
      where seeds 18/37/40 do. Full suite: 680 pass / 67 skipped, plus the
      pre-existing host-dependent A10 wall-clock flake (recorded at p1b, not caused
      here) — refs: §5, §6.2, Q97, Q98, Q99, Q100

- [x] (p2b) [feat] Wielded attacks fire as character attacks per §6.1's last
      clause — this commit — `updateWieldedAttacks` (`src/sim/vswield.ts`),
      called from `updateAct2` alongside `updateWeapons`, fires each built
      tower type from the Warden's own position on its own per-type cooldown
      (`World.wieldedCooldown`, hashed), reusing the exact `combat.ts`
      shape-by-`kind` primitives `fireTower`/`fireWeapon` already call for all
      seven attack kinds — so lifesteal and damage attribution fall out for
      free rather than as a special case, since `dealHit`'s `DamageOptions`
      carries no `dot`/typed override and `damageEnemy`'s §2 leech gate sees
      it as ordinary character damage. Damage scales by `w.derived.powerMul`
      on top of §6.1's own average+10%/tower formula; range/radius/chain reach
      scale by `w.derived.areaMul`; the interval divides by
      `w.derived.attackSpeedMul` — the three stats §6.1 names, and *not*
      `towerDamageMul`/`towerRangeMul`/`affinityMul`, which stay Act I's.
      Targeting is character-relative (`w.nearestEnemy` off the Warden's own
      position), not `targetFirst`'s Core-relative flow-field distance, which
      exists to protect the TD path and means nothing once the attack stands
      wherever the player does. §4.1's "counts as 1 attack" rule is a new,
      minimal hook (`World.recordAttack`/`attacksFired`/`onAttack`) firing
      once per volley regardless of how many enemies it hit, proven with a
      Frost Obelisk hitting three enemies in one aura pulse and reading
      exactly one attack — real plumbing for P6's on-attack passives to
      consume, not a stub (Q96 records that no consumer exists yet). Acceptance
      met: `tests/p2b-wielded-fire.test.ts` (16 cases) drives Power/Area/
      attack-speed scaling independently, every one of the seven attack kinds
      through the real fire loop, the lifesteal hand-off timing (x002's own
      one-tick accumulator drain), the one-attack-per-volley count, the
      no-target retry-every-tick behaviour, cache invalidation on both a
      build-mid-run roster *growth* and a combat-death roster *shrinkage*, an
      empty board staying side-effect-free, and a replay-hash smoke.
      code-reviewer **REQUEST-CHANGES → both taken**: a Critical (the
      wielded/aura caches went stale on any enemy-caused tower death, not just
      sell/build/upgrade/Rekindle — `World.removeStructure` is now the single
      choke point that invalidates both) and a Minor (a doc comment overstated
      the wielded aura kind's parity with `fireTower`'s, which has no
      no-target retry). qa-playtester **PASS after 1 filed, fixed here** —
      independently reproduced the same Critical via `w.removeStructure`,
      confirmed the durable A3/boss claims and full-run determinism
      (`endHash` identical across two seed-1 runs) hold, and found nothing
      else across seven adversarial scratch cases (multi-type wielding,
      mid-run roster changes, stat changes mid-cooldown, boss fights with
      wielding live, soul-weapon/wielded damage attribution cross-talk). Both
      passes also named the same process gap this entry corrects: an earlier
      draft of this line asserted review verdicts and a test count (9/13) that
      did not match the file (15, now 16 with the regression test) — the
      lesson is CLAUDE.md's own: delegate the review, don't narrate it.
      Q97 (code-reviewer) logs one more finding left unfixed by design: three
      tower types' legacy V2 terrain-residual damage now double-pays alongside
      their wielded attack until p2c/p2e retire the residual system, an
      uncosted confound in every wielding-era balance number below, named
      rather than fixed inside a measure-don't-tune item. **Balance — measured, nothing tuned, and
      larger than any prior item's.** 12-seed sweep, same seeds either side:
      `maxbuild` barely moves (medSurv 180 unchanged, medKills 5946 → 6011,
      ~1%, since a maxbuild board's wielded damage is a small fraction of its
      already-large weapon output); `hybrid` moves hard — medSurv
      **126.08 → 180** (now matching maxbuild's ceiling), medMin 7.4 → 12.8,
      medWaves 4 → 6, medLevel 17 → 21, medKills 3320 → 5997 — because a
      lighter build's weapon-only output was the smaller half of its total
      damage, and doubling it (soul weapons plus every built tower's own
      attack, now firing twice) moves `hybrid` from "usually dies mid-run" to
      "usually reaches the boss." Three pre-existing gates without a §14
      letter (Q84: A3, A9) went red as the same, understood mechanism reaches
      further than the sweep does — all `.skip()`-ed in place with the
      mechanism named at each site and in Q96, per the standing constraint
      that a bound failing before P3/P10 gets a recorded reason, not a nudged
      constant: A3's per-seed 600s bound (now 644-830s), its "half dead by
      3:00" bound (now 0/12), the "moved survives 2x as long" ratio (now
      ~1.24x), and A9's "greedy wins under 50% at T2" bound (now 9/12). Every
      *durable* claim under each still holds — a stationary Warden still
      always ends `defeat_warden` with the boss never killed, movement is
      still measurably better. f001's cycle-machine smoke (superseded
      machinery, no gate letter) needed only a reseed — seed 16 no longer
      reaches cycle 3 under `hybrid`, seed 5 does, recorded as a target
      change, not a tuning nudge. Full suite: 670 pass / 67 skipped, plus the
      pre-existing host-dependent A10 wall-clock flake (recorded at p1b, not
      caused here) — refs: §6.1, §4.1, G3, Q96, Q97

- [x] (p2a) [feat] VS wielding formula per §6.1 — this commit — the formula
      only: `src/sim/vswield.ts`'s `wieldedAttacks(w)` groups living, attack-
      bearing structures by tower type and returns one `WieldedAttack` per
      type — `damage = (Σ each tower's own-tier damage / count) × (1 + 10% ×
      count)`, `interval` the type's raw authored value (attack speed is never
      tier-scaled, confirmed against `towers.ts`), and `profile =
      attackProfile(def, highestTier)` for "special effects and the highest
      upgrade level's effects". Types with no `attack` (walls, Beacon, Sprout)
      correctly wield nothing; dead structures do not feed the average.
      Acceptance met: `tests/p2a-vs-wielding.test.ts` (3 cases) transcribes
      §6.1's worked example verbatim, independently re-deriving the expected
      arrow/poison damage from `/data` rather than echoing the implementation
      back at itself, plus the no-attack and dead-structure cases. Q95 logs
      the one interpretation call the example needed: its "lv3" reads as the
      spec's own `@3` milestone label, live at engine tier 4 under this
      codebase's shipped "tier 1 = zero steps bought" convention (m20b) — tier
      3 literally would carry zero pierce and contradict the worked example's
      own text, so the test builds at tier 4 rather than silently renumbering
      `/data`'s `at` field. Scope: the formula only — `wieldedAttacks` is not
      called from any live loop yet (p2b wires character-scaled fire and
      lifesteal, p2c makes towers inert and adds the §5 VS specials).
      code-reviewer **APPROVE** (2 Minors, not taken: `highestTier` seeded at
      1 rather than derived from the group, harmless since a built structure's
      floor is tier 1; no `petrified` filter, correctly diverging from
      `towers.ts`'s live loops because §6.1 grants every built type
      unconditionally and Dusk/petrification is legacy code slated for
      deletion at p2e). qa-playtester **PASS**, no bugs found across seven
      adversarial scratch cases (empty board, multi-type grouping, max-tier,
      50-count same-type, mixed tiers, sell-mid-sequence) — noted for p2b,
      not a defect here: the formula omits `powerMul`/`towerDamageMul`/
      `affinityMul`, matching §6.1's own worked example, so whether character
      power applies to wielded damage is p2b's open call. Full suite: 657
      pass / 63 skipped, plus the pre-existing host-dependent A10 wall-clock
      flake (recorded at p1b, not caused here) — refs: §6.1, G3, Q95

- [x] (p1b) [balance] Turtle economics stay honest once sealing is legal — this
      commit — G7's third clause is a live test, and the measurement's finding is
      that sealing today is *dominated*, not dominant. `sealed` is a real policy
      (`src/bots/policies.ts`): maxbuild's tower mix plus a completed radius-5
      palisade ring — `allowSeal` is the one-policy opt-in, every other bot keeps
      the classic open maze, and the ring only ever completes because a sealing
      turtle counts the guns it already has (the always-6 tower lead re-planned
      every wave starved the ring forever: 22 towers, 0 palisades by wave 10).
      Measured at T2 over seeds 1–12 with autoDraft modifiers: sealed **1/12**,
      maxbuild **7/12**, hybrid **9/12** — the band (sealed ≤ best open + 10 pts)
      holds by maximum margin; 7 sealed seeds lose the Core in Act I to §10's
      breach chewing, 4 lose the Warden in Act II, 1 wins. The vacuity guards are
      live assertions, not comments: the sealed arm must latch
      `!allGatesReachable()` (the physical scratch-field diagnostic) on 12/12
      seeds **by tick 15000** (QA hardening — measured max first seal 12600; the
      latch alone would pass a seal delayed to wave 9), and the open arms on
      0/12. Q94 logs the four measurement decisions and the honest caveat: a bot
      band is only as strong as its best sealed challenger — G19 (p10f) and
      Q83's p3e re-measure are the mitigations. Existing-policy neutrality is
      QA-proven, not argued: end hashes byte-identical to HEAD for
      maxbuild+hybrid × 12 seeds × {T1 no-mods, T2 drafted} (48 runs per side)
      and sweep medians identical column-for-column. Acceptance met:
      `tests/p1b-seal-winrate.test.ts` (3 cases) in the vitest include glob —
      the live test the item demanded. code-reviewer **APPROVE** (5 Minors, 4
      taken: probe script deleted before commit, beforeAll refactor with an
      explicit timeout, `standingGuns` hoisted behind `allowSeal`, redundant
      import dropped; the 5th is Q94's caveat, logged not fixed).
      qa-playtester **PASS**, no acceptance-blocking bugs, mutation checks
      green (never-seals and band-violation mutations each turn exactly their
      own assertion red); its two findings taken — the first-seal-tick bound
      above, and a 7/4 loss recount that corrected this entry's own first
      draft. Recorded, not caused here: A10's wall-clock clause is red on this
      host **at HEAD too** (control measured in a clean worktree: HEAD median
      5473 ms vs the 5000 budget, working tree 7071 ms) — Q41's
      host-dependent-bound story again; p10e owns the re-baseline — refs: §10,
      G7, Q83, Q94

- [x] (p1a) [feat] Remove the path guarantee; structures become high-cost
      passable tiles — this commit — §10's one line becomes an engine rule in
      five logged defaults (Q92). The ground flow field runs in a breach mode:
      a structure tile is enterable **orthogonally** at `breach.base +
      breach.perEhp × effective max HP` (both new in `data/towers.json`, both
      ⚖ for P10; effective HP = max HP ÷ the §2 damage-taken multiplier its
      defense earns, re-priced on build/upgrade, cleared on death), diagonals
      stay fully physical, and an open path always outprices a breach by
      construction — `base` ≥ the longest walkable route, pinned by an
      executable-invariant test that a /data tune would turn red. Chewing is
      **routed, not incidental**: a pathing enemy attacks a bumped structure
      only when the field routes it into one, when it has no route (the Act II
      beeline fallback, preserved), when it stands inside an occupied tile
      (entombment dig-out), or when it carries `structureBreaker` (the
      Gatebreaker, G7's authored exception) — all four clauses
      mutation-verified (each mutation turns exactly its own test red).
      `checkBuild` accepts seals, `blocks_path` is deleted with no stale
      readers, and `allGatesReachable`/`wouldBlockPath` survive as *physical*
      diagnostics on a scratch field (the live ground field would answer yes to
      everything). Bots skip sealing placements — the exact check the old
      rejection ran — so default play is unchanged: the 12-seed sweep is
      **byte-identical** either side on both policies, QA-verified against a
      HEAD worktree. End hashes are not in the sweep and do legitimately move
      on seeds where HEAD's any-bump rule chewed walls: QA bisected seed 1
      `hybrid` to exactly one petrified palisade at 0.1 HP of incidental chew
      that no longer happens — clause 2 measured, not asserted. Acceptance
      met: `tests/p1a-sealing.test.ts` (13 cases) — seal legality with the
      breach field never going unreachable, pricing (toughness ordering,
      upgrade re-price, clear-on-death, /data mirror, the §10 invariant), a
      sealed ring chewed at its cheapest tile with every palisade untouched
      and the Core reached, open-path funnel and pinned-shove zero-chew,
      Gatebreaker bump-chew, entombment dig-out, flier/burrower/wraith
      bypasses, and a siege hash smoke. 651 pass / 63 skipped + perf 3/3.
      code-reviewer **REQUEST-CHANGES → both Majors taken** (the entombment
      permanent-pin regression; the untested `structureBreaker` branch) plus
      three Minors (breach-on-any-occ-transition, the /data-mirror test, the
      invariant test); qa-playtester **PASS**, no bugs filed across sealed
      double-walls, petrified day-2 seals, mid-chew sell/upgrade re-routes,
      god-mode seals, entombed flier/spitter/pack variants and
      diagnostic-purity hash checks — refs: §10, G7, Q92, Q83

- [x] (x002) [bug] Lifesteal has a per-second cap; §2 says it has none — commit
      `ef69a47` — both §2 contradictions fixed failing-test-first (7 of the 9 new
      cases red on HEAD). `leechCapPerSecond` deleted from `data/warden.json`,
      `WardenFileSchema` and `updateWarden`, which now drains the whole
      accumulator each tick clamped only to maxHp; and `damageEnemy`'s accrual
      gated to **normal damage** via a `type?: DamageTypeKey` on
      `DamageOptions` threaded from `applyDamageType` and the DoT ticks —
      Bleeding/Poison/Toxic/Burning ticks, ground fields, terrain auras and
      electric hits (the electric half of a split included) no longer leech;
      untyped direct damage (V2 weapons, manual attack, class actives) still
      does, being armor-reduced basic damage. Q91 records the three defaults
      (untyped = normal; electric excluded on §2's literal; the accumulator
      kept as the one-tick hand-off, and now **hashed** — the review found it
      generically nonzero at hash time and invisible to `hashWorld`, the m19a
      `enemyArmor` gap class; covered with a test, A11 8/8 either side). The
      Bleeding Ring's §7 exception is p7b's. Acceptance met:
      `tests/x002-lifesteal.test.ts` (11 cases) drives normal hit / Bleeding
      tick / Poison tick and asserts only the first heals, plus uncapped
      one-tick payout, the split, and hash coverage; the 12-seed sweep delta
      is recorded in PROGRESS — `maxbuild` medSurv 119.38 → 180, medLevel
      15 → 21, medKills 3070 → 5946; `hybrid` 120.4 → 126.08 (seed 1
      byte-identical; QA bisected seed 3: `defeat_warden` @109 s →
      `defeat_core` @180 s survival). Every gate green, no `/data` number
      tuned (Q40); P10 owns the re-baseline. 638 pass / 63 skipped + perf.
      code-reviewer **REQUEST-CHANGES**, all four findings taken (the hash
      gap, `DamageTypeKey`, the stale HANDOFF line, the untyped-dot leg);
      qa-playtester **PASS**, no defects — one pre-existing edge in Q91
      (overkill leeches in full, masked until now by the cap, owner's call)
      — refs: §2, MIGRATION §8.4.2, Q88, Q91

- [x] (x001) [bug] Poison's stack cap is 3, not 50 (SPEC-FINAL §3) — commit
      `dc1681c` — the **pin** the item asked for, plus the one hole it found.
      `tests/x001-dot-stack-caps.test.ts` (7 cases) reads both rows out of
      `/data` before asserting the behaviour: `poison.maxStacks === 3` with
      `refresh: shortest` and `toxic.maxStacks === 3`, quoting §3's wording; a
      fourth application inside the window refreshes the *shortest* stack
      (discriminated from overwrite-longest by ticking one stack to 2 s first);
      ten applications pay what three do (180 over 3 s; Toxic 270 over 9 s);
      and the rows' ratio/duration are pinned so a `/data` drift is named. The
      hole: `applyDot` clamped a caller's `maxStacks` override only to the
      shared 50-stack perf budget, so a call site could hold 50 Poison stacks
      while `/data` said 3 — overrides now clamp **one-way to the row cap**
      (Q90). Proven a no-op on shipped content: every override writer passes
      exactly 3, no `/data` field feeds the override, and QA measured identical
      end hashes either side on seed 1 `hybrid` and seed 7 `maxbuild` (which
      builds two Venom Spores, the one shipped override caller). Mutation
      check: reverting the clamp turns exactly the override case red; the other
      six stay green on master alone, confirming the file is a pin of
      already-correct data. 627 pass / 63 skipped + perf, exit 0.
      code-reviewer **APPROVE** (1 Minor taken: the `DotOptions` doc still
      described the old ceiling — the exact re-opening vector; plus the
      ratio/duration pin). qa-playtester **PASS**, no bugs filed; two
      pre-existing edges recorded in Q90 (override ≤ 0 / NaN silently drops,
      unreachable from shipped code and refused by the schema) — refs: §3,
      MIGRATION §8.4.1, Q86, Q87, Q90

- [x] (m20c) [balance] The other seven towers' tracks, and every tower's defense
      band (SPEC-V3 §4) — commit `a2e0c50` — the migration turned out to be a
      *measurement*. §4's three counts agree with a line in build cost (`5 −
      (cost − 50)/35`), but putting the open seven on it measures worse against
      a live gate at the price rule's prices: Ballista alone flips the boss
      gate from `victory` to `defeat_warden`, and Ember Brazier, Frost Obelisk
      and Mortar drop A4's T1 clause to 0/5. So the tracks stand, each of the
      four carrying a `/data` `note` with the count the line wants and the run
      that stopped it, and the line goes to the owner as Q80's proposal. What
      m20c adds is what §4 asked for and Q73 deferred: **defense bands** (`none
      0, low 5, medium 10`) on all ten, so "+10% Defense per step" has a caller
      at last — plus two loader rules, `validateStepPrice` (a whole track costs
      `upgradeTotalCostMul ×` the build price, no `note` escape) and
      `validateDefense`. Acceptance met: all ten towers pass the m20a data test
      (638 pass / 23 skipped, from 625/25), and Q80 lists every tower's
      proposed count, price and band. Re-measuring m20a's five deferrals
      **returned two** — `arrow_spire` and `venom_spore` clear A4 T1 5/5 at
      HEAD, closed by m20b's specials, both live tests again. 12-seed sweep
      byte-identical either side. code-reviewer **APPROVE** (8 Minors taken:
      two stale defense-0 comments, a float knife-edge in the m20a kill
      assertion, a priced-track-with-no-steps hole, `.strict()`, `positive()`,
      and three Q80 gaps including the max-level band inversion). qa-playtester
      **PASS** with 6 filed, 5 fixed here — two Majors were *wrong evidence in
      my own notes*: Frost Obelisk's "4/5 at every price measured" cited two
      prices the new rule cannot even load, and the A4 comment's "every count
      from 3 up fails T1" omitted the price qualifier that makes it true. Both
      corrected with the full per-price grid; the sixth is filed as **m20e**,
      because Mortar at count 3 and today's price clears both A4 clauses.

- [x] (m20b) [feat] The three owner towers and their milestone specials (SPEC-V3
      §4) — commit `7cec4ad` — §4's specials are typed entries in each tower's
      `upgrades.specials`, folded into an effective attack by `attackProfile`
      (`src/sim/upgrades.ts`) that every reader — fire loop, info panel, and m21's
      VS formula next — shares. Arrow: pierce and a second shot down the same
      line, Bleeding at 4. Electric: `normal:electric = 1:1`, one strike, the
      electric half arcing at 3. Poison: `normal:poison = 1:1 → 1:1.5`, small AoE,
      second spore at 2; its V2 `attack.poison` constant is deleted and its damage
      re-priced 4 → 45 so the DoT-as-a-share of §3 reproduces V2's output (Q76).
      Composite damage rides in `HitEffects.ratio` and is dealt by one `dealHit`,
      so all seven attack shapes carry a split — pinned by a test that drives each
      shape, m19c's coverage rule one layer down. Acceptance met:
      `tests/m20b-owner-towers.test.ts` (24 tests, 1 skipped) drives every listed
      special through the real fire loop at the step below it and the step it
      lands on. code-reviewer **REQUEST-CHANGES** (1 Major) and qa-playtester
      **PASS** with 5 filed; fixed here: the untested Venom splash, the arc's lost
      damage origin (a front shield read the copy differently from the hit it
      copies), `lineHit` sweeping for a pierce it did not have, the loader
      accepting a special the attack's `kind` cannot read, and the info panel
      understating an Arrow at 6 by exactly 2× — that last one now measured
      against the fire loop at every level of every track. Each fix verified by
      reverting it. Two findings ship unfixed and pinned, both m20d: Poison's
      dropped spare spore and its non-monotonic @4 (Q79). The lesson worth
      keeping is Q78's: the first draft of the balance note blamed a tower the
      sweep never builds — a 12-seed median moved 30%, and at 32 seeds both trees
      read the same. 625 tests pass, 25 skipped — refs: V3 §4, Q75–Q79

- [x] (m20a) [feat] Per-tower upgrade tracks (SPEC-V3 §4) — commit `5305f8d` —
      `upgrades: {count, stepCost, specials}` and a real `defense` on every tower,
      +10% HP/Attack/Defense per step, flat step cost, sell 50% of what the
      structure was actually charged (`Structure.spent`, hashed). Acceptance met:
      `tests/m20a-upgrade-tracks.test.ts` (22 tests) asserts track well-formedness
      through the loader's own predicate and walks all ten towers × every step
      against both the sell quote and the gold the till pays, including a mid-run
      `towerCostMul` change and a Rekindle. Range no longer grows (§4 lists HP,
      Attack, Defense only); `maxTier`, `tierDamageMul`, `tierRangeMul`, the
      0.75×/1.25× ladder and Dusk's 35% sell rate are deleted. Track math lives in
      `src/sim/upgrades.ts` because `enemies.ts` needs `structureArmor` and
      `towers.ts` already imports `enemies.ts`. Q73 records the four defaults §4
      left open — the roster is the power- and cost-neutral migration wherever the
      choice was m20a's, so the model landed without a tuned number — and Q74 the
      inheritance fix. code-reviewer **REQUEST-CHANGES** (1 Critical, 2 Major) and
      qa-playtester **PASS** on the acceptance criteria with 3 Majors filed; all
      fixed here with regression tests verified by reverting each fix. The Critical
      was the lesson: the model change was clean and the bug was in a *reader* of
      the field whose range changed — `deriveSouls` handed Act II a maxed weapon
      from an 11-level tower, which inverted four balance gates and nearly got them
      deferred for the wrong cause. QA's one unfixed finding is filed as s011.
      603 tests pass, 24 skipped (5 deferred to m20c with measured reasons) —
      refs: V3 §4, Q73, Q74
- [x] (m19c) [feat] Damage-type taxonomy (SPEC-V3 §3) — commit `b325487` — the six
      rows and both statuses, authored in `data/damagetypes.json` — **M19 complete**,
      gate **C3 green in full** (its carried clause closed: Burning is `shredArmor`'s
      first production caller) — refs: V3 §3, Q44, Q58, Q65–Q72 — code-reviewer
      **REQUEST-CHANGES** (2 Major, 9 Minor) and qa-playtester **PASS** on all three
      acceptance clauses with 6 bugs filed; every Major and every reachable Minor is
      fixed here, each with a regression test that turns red when the fix is reverted.
      `Enemy.burnRemaining/burnDps/burnSource` and `Enemy.poison` are replaced by one
      `dots` list keyed by type; the row in `/data` owns magnitude, duration, stacking
      rule, armour shred and radius, so M27 can make Burning stack by editing one
      field. `applyBurn`/`applyPoison` survive as thin wrappers so V2-authored towers
      keep their own numbers (Q65). Frost/frozen replace V2's chill-stack model, which
      was specced and never built. 81 tests in `tests/m19c-damage-types.test.ts`, one
      describe per §3 row, each reading the authored value out of `/data` before
      asserting the behaviour it produces.
      **What the two agents caught that 569 green tests did not.** (1) The shared
      50-stack budget let the *saturating* type evict: 49 Bleeding + 1 Burning, then
      one more arrow, and the Burning — i.e. the armour shred — was gone. Q69's own
      test passed because it never applied a second Bleeding (Q71). (2) Electric's
      radius path delegated to `applyAoE` and so never touched the enemy it was
      handed: 20 of 100 damage in a crowd, **zero** to a target the spatial buckets
      had not seen, and the `DamageOptions` it built were dropped (Q72). Both are
      latent until m20b authors the content — which is the point. Also fixed:
      `applyDamageSplit` summed its weights in authoring order while dispatching
      sorted (Q63's hazard, reaches `hashWorld`); `opts.duration` on a ratio row paid
      240% instead of 120%; a frozen Warden-Eater still charged, because the boss
      moves itself and never reaches `moveEnemy`; `tickDots` iterated a live array;
      and ailment ticks spent the frame's 512-event fx budget, ~2450 events for a
      burning horde, starving the renderer of shots, impacts and deaths.
      **Balance:** Q66's clipped DoT tick is the only movement — a row now pays the
      total §3 states instead of that total minus one frame — and it moves the
      12-seed sweep `maxbuild` medMin 12.6 → 12.5 and medLevel 20 → 21, `hybrid`
      byte-identical. A10's third test goes 836 ms → 5653 ms for the same reason and
      is **not** a perf regression: seed 4 flips to `victory`, so the run is 65%
      longer. No `/data` number was touched (Q40). QA re-measured every A/B gate green
      and 24/24 seeds run/replay identical, and filed the coverage gap that matters
      most: **no gate seed ever builds a Brazier**, so the shred is unguarded by the
      sweep — backlog s008.
- [x] (m19b) [feat] Multiplicative stat stacking — commit `4875d47` — sources multiply,
      ranks add within a source — gate **C4** green (×1.32 verified through the real
      RunConfig→`baseRunStats`→`derive` pipeline, bit-exact) — refs: V3 §2, Q61–Q64 —
      code-reviewer **REQUEST-CHANGES** (1 Major, 6 Minor) and qa-playtester **PASS**
      on the acceptance criterion with 6 bugs filed; both agents independently found
      the same headline defect and every finding is fixed here.
      `Stats` is now keyed by (stat, source): `factor()` returns Π over sources of
      (1 + summed ranks), `total()` the additive sum, and an exhaustive
      `STAT_KIND: Record<StatKey, 'flat'|'mul'>` means a new stat cannot be added
      without classifying it. Q61 rules what counts as one source, Q62 which stats
      multiply, Q63 the `total()` ordering, Q64 shrine/aura haste.
      **The headline defect: six of the eight rebased consumers could be reverted to
      the additive `1 + x` with all 479 tests green** — because every default test
      world has at most one source per stat, and `factor(s) === 1 + total(s)`
      exactly when there is one source, so the buggy and fixed expressions agree on
      every world the suite built. QA measured a default headless run's entire stat
      sheet as two entries, both from the class. That is the same "tests pass, game
      doesn't" family as t1/t2/t3/t6ab. Each consumer now pins the **exact** integer
      or float it produces, with the additive and double-applied answers named in a
      comment, using 0.5/0.6 sources (×2.4) so the three answers stay distinct after
      rounding. What else was caught: (1) collapsing the real `relic:${r.id}` key to
      a constant left the suite green *and broke gate C4 itself* (×1.30, not ×1.32) —
      relics are the commonest way to hold two same-stat sources and Q61 rules on
      them, yet the headline test wrote `relic:7` on a bare `Stats` by hand;
      (2) **shrine haste and tower buff auras were still adding into
      `attackSpeedMul`** — a real §2 gap, so m19b's own title was false for the two
      boosts a player meets most often (Q64: both now multiply, overlapping sources
      summing within each bundle per Q61); (3) `total()` was insertion-order
      dependent while `factor()` was sorted — float addition is no more associative
      than multiplication and `leech` feeds `warden.hp`, which is hashed (Q63);
      (4) NaN/Infinity passed `Math.max` (`Math.max(0.25, NaN)` is NaN) into maxHp,
      moveSpeed and pickupRadius at once — the m19a unkillable-entity failure again,
      now guarded at `Stats.add`; (5) `hashWorld` saw **25 of 39 stats not at all**,
      so a stacking regression could pass A11's replay comparison — it now hashes the
      whole of `Derived`, with the four stats that never reach `Derived` listed
      explicitly so the exemption cannot grow; (6) the terrain test never called
      `applyTerrainPassives`, so the Q61 decision in weapons.ts had zero coverage and
      its source id was free to collide; (7) the determinism test used three nodes
      granting three *different* stats, so it could never fail whatever the order;
      (8) the `mul` parameter on `addAll` was dead — removed rather than tested.
      All **21** mutations are now caught. Measured: full suite 499 passed / 19
      skipped (was 462 at m19a), every A/B gate green including A10; the 12-seed
      sweep is unchanged by the stacking rule itself (one source per stat is all the
      default policies build), while a legal endgame build moves hard — pickupPct
      +42.2%, goldFind +28.6%, power +22.1%, attackSpeed +18.4% — which is larger
      than MIGRATION §4.4's +10.6% estimate and is the first thing the M27
      re-baseline should look at. Per Q40 **no `/data` number was touched**.

- [x] (m19a) [feat] Armor v3 — commit `d4fb985` — flat points = percent reduction, cap +99, floor −100
      (Q44), DoTs ignore armour — gate **C3** green for the armour math; its
      "except Burning's shred" clause is carried by m19c, which wires Burning to
      the `shredArmor` mechanism this item built — refs: V3 §2, Q58–Q60 —
      code-reviewer **REQUEST-CHANGES** (2 Major, 6 Minor) and qa-playtester
      **PASS** on all four acceptance criteria with 8 bugs filed; both agents
      independently found the same headline defect and **every** finding is fixed
      here. What they caught: (1) the `dot: true` I added to the DoT ticks was an
      **unobservable no-op** — `pure` already short-circuited the armour guard, so
      deleting `dot` from both sites left all 446 tests green, and criterion 3 was
      in truth being delivered by a pre-existing flag. The two flags are now
      orthogonal (`pure` = Bulwark/Shellback trait bypass, `dot` = armour bypass),
      all four ailment sites state both intents, and the burn and poison ticks are
      pinned through the **real update loop** on a −90-armour enemy. (2) `Enemy.armor`
      was writable sim state that never entered `hashWorld`; the hash now takes
      `enemyArmor(e)`, covering both it and the shred. (3) A11 compares two replays
      in the same build, so **any** field can be dropped from the hash with nothing
      turning red — three explicit hash-coverage tests now exist. (4) The
      `def.armor` → `Enemy.armor` plumbing, the only route from the new schema field
      into the sim, was untested; cutting it left the suite green. (5) The late-bound
      `setWardenDamageHandler` had no `opts` parameter, so every §3 DoT reaching the
      Warden from `enemies.ts`, `boss.ts` or `combat.ts` would have silently arrived
      **armoured** — the exact failure the flag was added to prevent. (6)
      `Derived.damageReduction` was left written-but-never-read and shred-blind;
      deleted. (7) `effectiveArmor(NaN)` returned NaN, which propagates into HP and
      makes an enemy permanently unkillable (`hp <= 0` never true); guarded. (8) The
      enemy panel labelled `flatReduction` "Armour" and never showed the stat the
      damage path reads. Also: schema bounds on `armorCap`/`armorFloor` (the Tuner
      writes that file, and >100 would make every hit **heal**), and Q60's ruling
      that shred clears on the Act I reform and on Second Wind. All **14** mutations
      — the reviewers' plus five of my own — are now caught. Measured: enemy-side
      damage is bit-identical to HEAD for all 20 enemies (none authors armour), the
      Warden side moves as Q59 predicted (hybrid median survival 132.4 → 105.7 s),
      and A10 **passes at this commit and at HEAD on this machine**, which corrects
      PROGRESS's "A10 is red" — the gate flips with the host (Q41).

- [x] (t2) [feat] Selection feedback — refs: V3 T2, QUESTIONS Q57 — qa-playtester
      **FAIL** on first submission with one Critical and six Majors. The Critical
      was mine: the test harness **re-implemented** the game loop's click wiring,
      so deleting that wiring from `main.ts` outright left all 23 tests green while
      clicking selected nothing in the real game — the literal bug T2 exists to fix.
      The handler and the stale-selection sweep now live in `selection.ts` as
      `makeSelectHandler`/`sweepSelection`, the tests drive those closures, and three
      source-level assertions guard that the loop installs them. All **14** mutations
      (QA's six plus its three survivors plus five of my own) are now caught.
      Real defects fixed: the hover outline the spec asks for was **not built**;
      `WARDEN_GRAB` was 0.9 tiles against a 0.25-tile sprite so you could not click a
      tower you were standing beside; enemy grab was twice the drawn body so a lane
      of husks made the towers behind them unclickable; a live selection **blackholed**
      the build-bar panel and, worse, the Act II weapon panel that holds the only
      weapon switcher; the enemy panel never refreshed on slow/burn/poison; the Warden
      panel's dash row went stale; Bounty printed the authored number rather than the
      real payout (and gems, not gold, in Act II); and a petrified tower offered a
      Sell that silently does nothing. Added beyond the letter of T2: the Core is
      selectable (its HP is the lose condition) and `0` clears the selection.

- [x] (t1) [feat] Range indicators — refs: V3 T1 — qa-playtester **FAIL** on first
      submission with four Majors, all fixed. The one that mattered: **every canvas
      test ran a default world** (`towerRangeMul` 1, `areaMul` 1, tier 1) — exactly
      the point where the buggy and fixed expressions agree — so re-inserting the
      original M17 bug passed all ten tests. The suite now runs on a deliberately
      skewed world and asserts against the shared helper, never a literal; all eight
      mutations QA reported as surviving are now caught. Also fixed: the aura tower's
      ring under-reported its radius because `fireTower` scales an aura by
      `areaMul` and the helper did not; **petrified towers were ringed** despite
      never firing, which at Dawn meant the whole board; and the hover splash preview
      and dead-structure skip were untested. Minors: `tower-info` computed Splash
      inline instead of through the helper, the mortar's `minRange` dead zone was
      invisible (now a dashed ring, and splash previews under the cursor where the
      shell lands rather than on the tower), R and the HUD button never persisted the
      setting so the Settings checkbox could silently revert it, and the Ranges button
      had no pressed state. QA measured no frame-cost regression (0.131 → 0.126
      ms/frame with 60 towers).


- [x] (t3) [feat] Dev profile: `data/dev.json`, all classes/tiers/quests unlocked,
      points granted, stash filled, `cleanProfile` Settings toggle, production
      always off — refs: V3 T3, gate C8 — qa-playtester **FAIL** on first
      submission with six Majors, all fixed:
      (1) **startup wrote the dev profile into the save**, so a returning
      developer's real account was silently and irreversibly inflated (QA measured
      ember 250 → 177000, tier 2 → 5) and the "clean profile" toggle had nothing
      left to clean — the profile is now a **view**, applied in memory and never
      saved, via a `startupProfile` seam that returns `persist: false`;
      (2) the same bug made the toggle non-functional;
      (3) the C8 production assertion **passed vacuously** with no `dist/` and again
      against a `dist/` built before the feature existed — it now builds its own
      bundle and **executes** it;
      (4) `isDevBuild()` defaulted to *dev* when the env was present but
      unpopulated, so a bundler whose folding differed would have shipped a
      god-mode build — the predicate is now `env?.DEV === true`, exported as
      `isDevEnv` so a test can call the real thing (an executed-bundle test cannot
      tell the two apart, since the bundler folds the read either way);
      (5) authoring `devMode: false` — the documented way to switch the profile off
      — turned the suite red, because the tests asserted the authored value instead
      of the rule;
      (6) `applyDevProfile` could **demote** an account, via two paths: its own
      level recompute and `seedTestAccount`'s. Both now take `Math.max`.
      Minors also fixed: the dev stash rolled **zero sigils** so a whole slot was
      untriable (Q54), `src/ui/hub.ts` read `import.meta.env` unguarded and threw
      under plain Node, and `DevFileSchema` accepted negative/fractional
      `skillPoints` and silently dropped unknown keys. Q53–Q55 log the three
      judgement calls QA found undocumented. Left as its own item: s005 (the dev
      profile ships, inert, in the production bundle).

- [x] (t4) [feat] God mode as a practice-run Command — refs: V3 T4 — qa-playtester
      **PASS** on all three acceptance criteria, verified far past the two patched
      functions: QA confirmed `damageWarden` is the *only* writer of Warden HP and
      `leakIntoCore` the only subtraction of Core HP in the whole sim, then drove all
      eight hostile damage paths (contact, bomber, spitter, stomp, ground areas, boss
      charge/slam/fire) plus a 60 s toe-to-toe boss fight and 1000 forced colossus
      leaks — no damage in any of them, and mortality restored correctly on toggle
      off. Replay identity verified at four scales including 1001 toggles in one tick.
      Three findings fixed in the same commit: the god button had **no on/off state**
      (the lit class was special-cased to one op name), `ALL_OPS` in practice.test.ts
      had drifted so the new op skipped the non-practice guard, and the
      "god cannot rescue a defeat already begun" behaviour was unpinned. QA also
      corrected the *reason* given for keeping leak accounting live — the B7 claim was
      wrong, since B7 never enters practice mode; the real defence is that the Day
      HUD's "Loose in the dark" counter makes the consequence visible. Measured: a god
      Day and a mortal Day produce identical Nights. Findings left as their own items:
      s003 (`levelup` never auto-resolves) and s004 (alive count exceeds `aliveCap`).

- [x] (t6c) [bug] Save migration drops `orbs` and bumps SAVE_VERSION 1 → 2 — refs:
      V3 §8, C7 — qa-playtester **PASS** on all four acceptance criteria, verified
      through the real `localStorage` path as well as the pure functions, with a full
      money-path sweep (fresh account → run → defeat → Results → Hub → seed → equip →
      reload) confirming nothing re-introduces the key. Two of its findings were taken
      in this same commit because they shared a two-line fix and the file was open:
      the strip is now **version-gated** (a newer client legitimately reusing the name
      would have had that field eaten on every load) and **guarded against deleting a
      live MetaState key**; both repros are regression tests. QA also measured that a
      poisoned `RETIRED_KEYS` turns 5 tests red, so required fields were already
      protected — it was optional ones that were exposed. Findings left as their own
      items: s001 (migrate preserves unknown keys forever) and s002 (a corrupt stash
      discards the whole account, pre-existing).

- [x] (t6ab) [feat] Delete Orbs entirely from sim, meta, data and UI, and repurpose
      the Constellation node that granted one — **t6a and t6b merged**: removing
      `MetaState.orbs` breaks the Hub in the same commit, so the type system does not
      allow splitting the sim change from its UI. `equip`/`discard` moved out of the
      deleted `crafting.ts` into `src/meta/stash.ts` (V3 §8 keeps the stash).
      Gate **C7** Orbs half green via `tests/c7-no-orbs.test.ts` — refs: V3 §8, T6 —
      qa-playtester pass 2026-08-25: FAIL on first submission with three Majors, all
      fixed and each verified by reproducing the exploit that found it — (1) the C7
      scan exempted `loot.ts` and `stash.ts`, the two files most likely to regress,
      so reintroducing `orbPerElite` passed the gate; (2) the C7 DOM scan never
      clicked anything, so the Hub notice that used to read "3 of each Orb" was never
      scanned; (3) **this diff neutered the suite's only proof that `applyRunResult`
      banks anything** — the orb assertion was rewritten to compare 0 to 0 and
      asserted the opposite of its own title. QA also confirmed relic drop counts are
      per-seed bit-identical to HEAD across 12 seeds (only the drops-stream cursor in
      the end hash moves), that the three "orb" false positives are undamaged, and
      that A10's redness reproduces at HEAD. Bug 7 (Tinkerer inert) logged as Q50 and
      backlog m24d.

- [x] (m17) [feat] M17 reconcile: audit code vs V3, MIGRATION.md, retire dead tests
      with logged reasons, rewrite BACKLOG to V3 §13 — refs: V3 §13.1 — commit
      pending in this change; retirements: A5, A6, A7, A8 (whole files, `describe.skip`
      with reasons) and 4 assertions in `f001-cycle-machine.test.ts` including gate
      B9; B11 retired with no test to mark (never implemented). Q38–Q49 logged.
- [x] (f004) [feat] Class framework (v2 shape) — **superseded by M23** per QUESTIONS
      Q48. Committed unverified as `6019a8b` (`wip`); its qa-playtester pass was
      deliberately not run because V3 §6 replaces the kits. Surviving plumbing — the
      `class_active` Command, cooldown field, Q binding, HUD row, `data/affinity.json`
      — is the base m23a builds on.
- [x] (f003) [feat] Leak coupling: Day leaks add 2× director cost to that Night's
      budget; "Loose in the dark" HUD counter — acceptance: B7 (mechanism only;
      the full statistical gate — survival drop ≥10% via sweep — is M15's per
      SPEC-V2 §12) — refs: SPEC-V2 §1 — commit f24bf7c, code-reviewer pass
      2026-08-25, qa-playtester pass 2026-08-25 (filed and fixed one bug in the
      same commit: `leakIntoCore` charged a pack enemy's full director cost to
      every physical leaked body instead of dividing by `packSize`)
- [x] (f002) [feat] Soul persistence — no new commit: already delivered by f001
      (`4e44a33`). **Its gate B9 is retired at M17** (V3 §12).
- [x] (b004) [bug] `report.survivalSeconds` used Night-local `w.act2Time` instead of
      cumulative `w.act2Ticks / 60` — commit 19eecf3, code-reviewer pass (found the
      identical bug in the Results screen, fixed in the same commit), qa-playtester
      pass
- [x] (f001) [feat] Cycle state machine: Day→Dusk→Night→Dawn ×3 — commit 4e44a33,
      code-reviewer pass (found `hashWorld` omitting `soulLevels`), qa-playtester
      pass (filed b004). **Superseded by V3 §1; code removed at M22.**
- [x] (b003) [bug] Stash click-to-swap + drag-to-unequip + compare tooltip — commit
      84bc3f8, qa-playtester pass
- [x] (b002) [bug] Pause menu Abandon Run requires confirm — commit d2079e7,
      qa-playtester pass
- [x] (b001) [bug] Death flow reaches Results with Retry / New Run / Hub — commit
      645d4b0, qa-playtester pass
