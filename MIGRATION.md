# MIGRATION.md — v0.2 codebase against SPEC-V3

**Audit date:** 2026-08-25. **Baseline commit:** `6019a8b`.
**Precedence:** SPEC-V3 > SPEC-V2 > SPEC.md.

Written for M17 (SPEC-V3 §13.1). Three questions per system: **is it built**,
**does V3 supersede it**, and **does V3 conflict with something already load-bearing**.
Every claim below was checked against the code, not against V2's own description
of itself.

Reproduce the audit with:

```
npm test                                    # 350 pass, 2 skipped, A10 red (below)
npx vitest run --config vitest.perf.config.ts
grep -rn "orb" src/ data/ tests/ tools/     # T6 surface
npx tsx tools/sweep.ts --seeds 12 --policies maxbuild,hybrid
```

---

## 0. Headline

- **Nothing in V3 is built yet.** Every V3 section is either *not started* or
  *contradicted* by working v0.2 code. There is no partially-correct V3 system to
  finish.
- **The v0.2 code is healthy**: 350 tests pass, tsc and vite build clean. One gate
  is red (**A10**, §5 below) and that redness predates this audit.
- **The largest single deletion is the Day/Dusk/Night/Dawn cycle machine**, finished
  three commits ago (`4e44a33`, item f001) and superseded by V3 §1's interleaved
  waves. Roughly 400 lines of sim plus its 11 tests. This is the cost of V3 landing
  the day after V2's M9 shipped; it is recorded here rather than absorbed silently.
- **`f004` (class framework) is committed but not QA-verified** (`6019a8b`, marked
  `wip`). V3 §6 replaces its single-Active model with Passive + Active1 + Active2 +
  Tower-passive. Its Command plumbing survives; its content does not. See §4.

---

## 1. Built and kept by V3

These need no migration work. Listed so later milestones do not re-litigate them.

| System | Where | Note |
|---|---|---|
| Fixed 60 Hz sim, no DOM/`Math.random`/`Date.now`/native trig | `src/sim/*`, `tests/architecture.test.ts` | V3 adds nothing; the rule is what makes C6's "determinism holds per config" checkable. |
| Seeded RNG, five named streams, end-state FNV-1a hash | `src/sim/rng.ts`, `hash.ts` | A11 must stay green through every V3 milestone. |
| Flow-field pathing, spatial buckets, staggered separation | `grid.ts`, `world.ts`, `enemies.ts` | V3 §9 changes *what is passable*, not how the field is computed. |
| Enemy roster, traits, elites, Rift bursts, boss phases | `enemies.ts`, `act2.ts`, `boss.ts` | V3 keeps flier/burrower/wraith bypasses and Bomber ×3 vs structures explicitly. |
| Leak coupling (TD leaks feed the next VS budget) | `f003`, `tests/f003-leak-coupling.test.ts` | V3 §1 names this as surviving. Gate B7 stays. |
| Death → Results → Hub flow, pause/abandon, stash UX | `b001`–`b003`, `tests/b10-death-flow.test.ts` | Gate B10 stays. V3 §2 points at it ("V2 D1 flow"). |
| Practice-run framework (Commands gated on `RunConfig.practice`, report flag, banks nothing) | `src/sim/run.ts` `applyDevCommand`, `tests/practice.test.ts` | **T4 god mode extends this** rather than adding a parallel mechanism. |
| Fast-forward, stage progress, tower/weapon info panels | `src/ui/*` | Survive. The tower panel's *contents* change with §4/§5. |
| Renderer, per-source projectiles, SFX seam | `src/render/*` | T1/T2 add to it. |

---

## 2. Built and superseded — what has to come out

Ordered by how much code the removal touches. "Milestone" is where V3 §13 puts it.

### 2.1 Orbs — delete entirely (§8, T6) — **M18**

The only V3 deletion that is pure subtraction. Full surface, 26 files:

| Layer | Sites |
|---|---|
| Data | `data/relics.json` `orbs[]` (3 defs); `data/tree.json` node 90 "Tinkerer" grants `freeOrbTurning` |
| Sim | `types.ts` (`MetaState.orbs`, `RunReport.orbsFound`, `World.orbsFound`), `world.ts`, `loot.ts` `dropOrb`, `run.ts` (report + boss/elite drop calls), `stats.ts` `freeOrbTurning`, `content.ts` schema |
| Meta | `meta/crafting.ts` (whole module, 120 lines), `meta/meta.ts` (`orbs` in state, grant in `applyRunResult`, save migration) |
| UI | `ui/hub.ts` (craft row, `ORB_HELP`, account counter — 27 refs), `ui/hud.ts` (Results "Orbs" line), `ui/tree-view.ts` (`freeOrbTurning` stat label) |
| Tools | `tools/gen-tree.mjs` (regenerates node 90) |
| Tests | `meta.test.ts` (10), `hub-testing.test.ts` (11), `practice.test.ts` (4), `boss.test.ts` (2), `sundering.test.ts` (1), `content-complete.test.ts` (1) |

False positives to leave alone: `theme.ts`/`canvas.ts` `'orb'` **projectile shape**,
`weapons.ts` Phoenix Ring **orbiting** fire ring, `enemies.ts` comment "crowd orbits".
A naive `orb` grep-and-delete breaks three unrelated systems.

Save migration: existing saves carry `orbs: {whetting,turning,ascension}`. The
migration must drop the key without discarding the rest of the save (C7's
"save migration test").

### 2.2 Day/Dusk/Night/Dawn cycle machine — replaced by interleaved waves (§1) — **M22**

Built by f001 (`4e44a33`) and f002. V3 cuts **Dusk picker, Dawn Rekindle/Leave, and
soul persistence** outright and replaces the whole run shape.

| Goes | Where |
|---|---|
| `Command` `{k:'rekindle'}`, `{k:'dawn_done'}` | `types.ts:31` |
| `Structure.soulSuppressed`, `World.soulLevels` | `types.ts:93`, `world.ts:165` |
| `World.cycle`, `totalCycles`, `cycleWaveEnd`, `nightLengthSeconds` | `world.ts:85–510` |
| Phases `dusk`, `soulpick`, `dawn` | `types.ts` `Phase`, `run.ts` switch |
| `RunConfig.cycles` | `types.ts:316` |
| `data/waves.json` `waveEndByCycle`, `nightSecondsByCycle`, `eliteMulByCycle`, `nightMinuteOffsetPerCycle` | 4 keys |
| `data/towers.json` `rekindleCostMul`, `duskSellRefund` | §4 replaces sell with flat 50% |
| Tests | `f001-cycle-machine.test.ts` (11), the Dusk half of `sundering.test.ts` |

What survives from f001: the *per-cycle director scaling* idea maps onto V3 §1's
"director budget per VS wave scales with wave index", and `w.act2Ticks` (the
cumulative counter b004 introduced) is still the right basis for total VS time.

### 2.3 The Sundering / soul-binding weapon math — replaced by §5 — **M21**

V3 §5 is a different model, not a tuning of the old one: the character wields
**every built tower type's attack**, damage = *average across that type's towers ×
(1 + 10% × count)*, and **towers do not attack during VS waves**.

| Goes | Where |
|---|---|
| Weapon-slot cap, soul candidates, binding | `sundering.ts`, `weapons.ts` `grantWeapon`, `derived.weaponSlots` |
| Inheritance "+8% per extra tower, cap +40%" | `data/weapons.json` `inheritDamagePerExtraTower`, `inheritDamageCap` |
| Per-weapon 6-level tables | `data/weapons.json` `levels[6]` × 8 |
| Awakenings (weapon Lv6 + boon rank 3) | `weapons.ts`, `data/weapons.json` `awakenings` |
| Petrified-terrain residual passives | `weapons.ts` `applyTerrainPassives`, `buildTerrainEffects` |

Conflict flagged in §4.2 below: V3 §5 says towers "remain on the field as solid
obstacles… and contribute their per-type VS special", but §4's VS-special column is
populated for only **3 of 10** towers, and terrain residuals (the current
equivalent) are what gate **A6** measures.

### 2.4 Tower tiers → per-tower upgrade tracks (§4) — **M20**

Current: 3 tiers, ×1.6 damage / ×1.1 range per tier, upgrade cost `0.75×`/`1.25×`
base, sell 70% (35% during Dusk).
V3: per-tower **upgrade count**, +10% HP/Attack/Defense per step, **flat** step
cost, sell **50% of total spent**, plus milestone specials at named steps.

Towers do not currently have **HP and defense as upgradeable stats** — `hp` exists
on the def and is only used for structures enemies chew on; there is no tower
`defense` at all. §4's model needs both.

Only 3 of 10 towers are specced (Arrow, Electric, Poison). The other 7 need
proposed tracks logged for owner sign-off (V3 §4 says so explicitly).

### 2.5 Armor and stat stacking (§2) — **M19**

- **Armor**: ~~`armorReduction` is `armor/(armor+50)` (`stats.ts:100`). V3 wants
  flat-points-as-percent, cap +99, uncapped negative. Every consumer of
  `derived.damageReduction` changes meaning.~~ **Done at m19a.** The curve is
  `clamp(armor, -100, 99)/100`; `derived.damageReduction` was deleted rather than
  re-pointed, because a cached reduction is blind to Burning's shred — the live
  number is `wardenArmor(w)`/`enemyArmor(e)`. Enemies gained an `armor` stat
  (default 0, optional on the def) so the roster can be authored at M20/M27
  without another engine change. Gate **C3** green for the armour math; its
  "except Burning's shred" clause rides to **m19c**, which wires Burning (Q58).
  **Closed at m19c**: the Ember Brazier's burn is now a §3 Burning application,
  and Burning's tick calls `shredArmor`. Gate **C3** is green in full.
- **Stacking**: currently **additive** — `powerMul: 1 + s.power` where `s.power` is
  the sum of every source (`stats.ts:152`). V3 §2 wants sources to **multiply**
  (10% + 20% → ×1.32, gate C4). This touches the whole `Stats`→`Derived` pipeline,
  because `Stats` is a flat sum-of-numbers record with no notion of source.
  **This is the single most invasive change in V3** and it silently re-tunes every
  balance number in `/data`.

### 2.10 Ad-hoc ailments → damage-type taxonomy (§3) — **M19**

~~Burn, poison and slow are three hand-rolled mechanics with their own state on
`Enemy` and no shared shape; V3 §3 wants a six-row taxonomy in
`data/damagetypes.json` plus frost/frozen replacing the V2 chill-stack model.~~
**Done at m19c.** `Enemy.burnDps`/`burnRemaining`/`burnSource` and
`Enemy.poison` were replaced by one `Enemy.dots` list keyed by type; the row
in `/data` owns the magnitude, duration, stacking rule, armour shred and radius,
and `applyBurn`/`applyPoison` survive only as thin wrappers so V2-authored
towers keep their own numbers (Q65). `applySlow` is untouched — it is the
generic slow towers author, not the chill-stack model, which was specced in V2
and never built. Q65–Q68 record what §3 left open. What is **not** wired: no
tower authors Bleeding, Toxic, Electric or a status yet — that is m20b, and the
seam is a validated `onHit` list on a tower attack (Q68), covered by a test that
drives all seven attack shapes through the real fire loop.

Two latent defects the review and QA pass caught, both invisible until m20b
authors the content that reaches them: the shared 50-stack budget let the
*saturating* type evict, so a bleeding enemy lost its Burning — and with it the
armour shred — on the next arrow (**Q71**); and Electric's radius path delegated
entirely to `applyAoE` and so never touched the enemy it was handed, paying 20 of
100 damage in a crowd and zero to a target the spatial buckets had not seen
(**Q72**). Both are fixed with regression tests that turn red when the fix is
reverted.

### 2.6 Equipment (§7) — **M24**

Current slots are `sigil, plate, charm` (3, in `data/relics.json`) — note V2 §3
claimed six; the code never had them. V3 wants **weapon, armor, shoes, ring,
necklace, bracelet** (6) with a fixed 12-item table replacing procedural affix
rolls. Current: 12 affixes × 3 rarities rolled by `loot.ts` `rollRelic`.

Stat columns change shape too: V3 has flat adds (HP/Atk/Def) *and* multipliers
(atk-speed/move), plus **conditional effects with class checks and fallbacks**
("if not Swordsman: …") — there is no conditional-effect mechanism today.

### 2.7 Ember → skill points (§8) — **M24**

`emberFor`, `accountLevelFor` (100 × level), `pointsAvailable`, `tree.startingEmber`,
`respecCostPerNode`, `emberFind` stat, the Hub's Ember counter, and `b004`'s
cumulative-survival fix all serve a pipeline V3 retires. Skill points come from
**VS waves cleared** instead.

### 2.8 Path guarantee (§9) — **M25**

`grid.ts:253` `wouldBlockPath` and `towers.ts:65`'s `blocks_path` rejection are
exactly what V3 removes. Structures become high-cost passable tiles. The build ghost
(`canvas.ts` `drawBuildGhost`) shows a red refusal that will no longer exist.

### 2.9 Classes (§6) — **M23**

`f004` shipped one Active per class + a passive + affinity, for 3 classes
(`engineer`, `pyromancer`, `frost_warden`). V3 wants archetype stat bands + Passive +
**Active1 (Q) + Active2 (E)** + a **Tower passive**, with **mouse-aimed** actives and
**combo** rules, plus Swordsman and Plaguebringer as owner-specced kits and the other
nine flagged `legacy: true`.

Survives: `class_active` as a sim Command, the cooldown field, the Q binding, the
HUD row, `data/affinity.json`. Replaced: the single-`kind` dispatch
(`classes.ts` has exactly one kind, `burst_damage`), and all three class kits.

**The 11-class roster does not exist.** `data/classes.json` has 3. V3 §6's "other 9
classes keep current kits" presumes a roster that was never built — see §4.1.

---

## 3. Not built at all

| V3 | Status |
|---|---|
| §1 interleaved TD×3→VS, multi-summon stacking | none |
| ~~§3 damage-type taxonomy (`data/damagetypes.json`), bleeding/toxic, frost/frozen~~ | **Done at m19c** — see §2.10 |
| §5 VS wielding formula | none |
| §7 12-item equipment table | none |
| §10 T1 range indicators | partial, and one half is **dead code**: the placement ghost does draw an attack-range ring, but from `def.attack.range` — the *base* value, ignoring tier and `towerRangeMul`, so it lies about any upgraded tower. `view.showRanges` is set by the R key, the HUD button and a Settings checkbox, and **is never read by the renderer** (`grep -rn showRanges src/`) — the "show tower ranges" toggle has never drawn anything. No AoE preview, no skill-range render. |
| §10 T2 selection feedback | **none** — nothing in the game is selectable by clicking |
| §10 T3 `data/dev.json` dev profile | none |
| §10 T4 god mode | none (practice framework exists to host it) |
| §10 T5 Codex & Tuner | none — needs a Vite dev-server endpoint that does not exist |
| §12 C1–C11 | none |

---

## 4. Conflicts — V3 against V3, and V3 against live gates

These are the items where I could not implement V3 as written without choosing
something. Each has a default logged in QUESTIONS.md (Q38–Q48).

### 4.1 §6 assumes an 11-class roster that does not exist

"Other 9 classes: keep current kits, flag `legacy: true`" — there are **3** classes,
and V2's B3/B5 gates reference 11. Nine of the eleven have never been built.
Flagging `legacy: true` on three classes and calling the other eight absent is the
only honest reading. **Q38.**

### 4.2 §5's "per-type VS special" is specced for 3 of 10 towers

§4's last column exists for Arrow (none), Electric (wire grid) and Poison (trail).
The other seven have no VS special and no upgrade track. Migrating them is named as
agent work with owner sign-off (§4), but the VS-special column is not. **Q39.**

### 4.3 §5 removes tower attacks in VS waves — A6 measures exactly that

**A6** ("stripping the terrain costs ≥20% of Act II survival") is built on petrified
towers contributing damage during the survivors phase. V3 keeps towers on the field
as *obstacles with per-type specials* rather than as damage sources. A6's premise is
gone; its replacement is C2, which measures the wielding formula instead. **Retire
A6** — logged in §5 below.

### 4.4 §2's multiplicative stacking invalidates every tuned number in `/data`

Gate C4 demands `×1.32` where the code produces `×1.30`. The change is small per
source and compounds hard: a build with six +10% sources goes from ×1.60 to ×1.77
(+10.6%). Every A/B/C balance gate must be re-baselined **after** M19, not before.
Any tuning done in M18–M19 against current numbers is throwaway work. **Q40.**

### 4.5 A10's 5-second budget is already red, and V3 makes it redder

**A10 is failing at HEAD**: run times 3836 / **6080** / 6267 ms against a 5000 ms
budget. Cause is not a performance regression — it is f001 making a "full run" three
cycles long. V3 §1 changes it again (18 TD + 6 VS waves). The gate's constant was
written for a one-cycle run and has outlived its premise twice.

I have **not** retuned it, because "how long may a full run take to simulate" is a
budget question the owner owns, and because V3 §13's M22 changes the run length
again. Options in **Q41**; default is to re-baseline at M22 and leave it red with a
recorded reason until then, rather than move a number to make a light go green.

### 4.6 §8 "each TD wave cleared → 1 random equipment" against §7's 12-item table

18 TD waves and 12 distinct items means duplicates from wave 13 at the latest, and
with random draws much earlier. There is no stated duplicate rule (stack? re-roll?
convert?). **Q42**, default: duplicates are allowed and simply stack in the stash.

### 4.7 §1's multi-summon against the wave-clear economy

"Stack up to 3 TD waves… early-call gold bonus applies per wave called" — the current
bonus is `buildTimer × 2 gold/s`, which is a *time* refund. Calling three waves at
once collapses three build phases into one, so the naive reading pays three full
bonuses for one skipped phase. **Q43**, default: pay the bonus once per wave called,
computed against that wave's own un-elapsed build time (zero for waves 2 and 3 of a
stack).

### 4.8 §3's Burning shreds armor into §2's uncapped negative armor

Burning is "−1 armor per second for 3 s", AoE, stacking. §2 says negative armor is
uncapped and −90 armor means +90% damage taken. Thirty stacked Burning applications
on one enemy is −90 armor. That is presumably the intent ("exploits §2's uncapped
negative armor") but it makes Burning scale quadratically with stack count against
elites. **Q44**, default: implement as written, add a floor of −100 armor ⚖, and
flag it for the M19 balance pass rather than pre-emptively nerfing it.
**Landed at m19c** with one deviation, recorded as Q65: the shred stacks per
application exactly as Q44 describes (it is a lifetime accumulator, so 30
applications is −90 armour), but Burning's *damage* refreshes rather than
stacking, because stacking it would have buffed two pieces of shipped content
ahead of the M27 pass that Q40 reserves for balance. Flipping it is one field
in `data/damagetypes.json` (`maxStacks`), not an engine change.

### 4.9 §10 T5's Tuner writes to `/data` — determinism and A11

A Tuner that writes `/data/*.json` means the content a replay was recorded against
can change underneath it. C6 asks for "determinism holds per config", implying a
config hash. There is no config hash today; `RunConfig` carries no content identity.
**Q45**, default: add a content hash (FNV-1a over the loaded `/data` JSON) to
`RunConfig` and to the end-state hash's inputs, so a replay against edited data fails
loudly instead of silently diverging.

### 4.10 §8 retires Ember but the Constellation is priced in it

`respecCostPerNode: 5` Ember, `startingEmber: 400`, `maxAccountLevel: 60`,
`emberBase: 100`. With Ember retired and points coming from VS waves (6 per run at
most), the tree's 120 nodes and its respec price both need re-pricing.
**Q46**, default: 1 skill point per VS wave cleared as specced, respec costs 1 skill
point per node, one-time 100:1 Ember conversion per §14.3.

### 4.11 V3 §12 retires B9 and B11, but B11 is the only "both choices live" gate

B11 (petrify-vs-Rekindle liveness) is the only gate asserting that a *strategic
choice* has two live answers. Its subject is cut, so it goes — but V3 adds no
replacement liveness gate for the choices it does keep (multi-summon, sealing,
tower-type mix). C5b is the nearest thing. **Q47**, noted for the owner; no default
needed to proceed.

### 4.12 `f004` is committed unverified and V3 replaces most of it

`6019a8b` is marked `wip` and its qa-playtester pass never ran. V3 §6 replaces its
kits. Running QA on content that M23 deletes is waste; leaving an unverified commit
in history is untidy. **Q48**, default: do not run f004's QA pass; close f004 in
BACKLOG as *superseded by M23* with a pointer to this file, keeping the framework
plumbing that survives.

---

## 5. Test retirements (V3 §12)

V3 §12: "retire B9, B11, and B-gates tied to the Dusk picker/Rekindle — log each
retirement". Retirements below follow one rule, stated so later milestones can apply
it consistently:

> **A test is retired the moment V3 contradicts what it asserts, but its file is not
> deleted until the code it covers is deleted.** Retired tests become
> `describe.skip` with a `RETIRED (V3 §x):` reason naming the superseding section and
> the milestone that removes the code. This keeps CI honest — a skip is visible, a
> deletion is not — and avoids a coverage hole in code that still ships.

Deleting outright would also violate CLAUDE.md's "never delete a test to go green".
These are not going green; they are being superseded, which is a different thing and
deserves a different mark.

| Test | Gate | Retired because | File deleted at |
|---|---|---|---|
| `f001-cycle-machine.test.ts` › `B9: a petrified-left tower keeps its soul…` | **B9** | V3 §0 cuts soul persistence and the Dusk picker outright. | M22 |
| `f001-cycle-machine.test.ts` › `Rekindle un-petrifies a tower for gold; Leave keeps it as terrain` | B-gate tied to Rekindle | V3 §0 cuts Dawn Rekindle/Leave. | M22 |
| `f001-cycle-machine.test.ts` › `Dawn auto-advances (all Leave) if no command arrives` | B-gate tied to Rekindle | As above. | M22 |
| `f001-cycle-machine.test.ts` › `routes each cycle boundary to Dusk…` | — | Asserts the Day/Dusk/Night/Dawn phase order V3 §1 replaces with TD×3→VS. | M22 |
| `a6-terrain-value.test.ts` (both) | **A6** | §4.3 above: V3 §5 stops petrified towers dealing damage in VS waves, which is the entire quantity A6 measures. C2 replaces it. | M21 |
| `a8-sundering-head-start.test.ts` (4) | **A8** | V3 §5 replaces the Sundering head-start math (highest tier + 8%/duplicate) with the averaged wielding formula. C2 replaces it. | M21 |
| `a7-turtle-check.test.ts` (3 + 1 already skipped) | **A7** | V3 §9 legalises sealing, so "a wall-off must leak" is no longer the design. C5/C5b replace it. | M25 |
| `a5-weapon-share.test.ts` (4) | **A5** | Premise is per-weapon damage share across a 6-slot loadout; V3 §5 has no slots and no per-weapon identity — damage is per *tower type wielded*. B12 already restated it; C2 supersedes. | M21 |

**B11** is retired without a test to mark: it was specced in SPEC-V2 §12 and never
implemented, so there is nothing to skip. Recorded here for completeness.

**Not retired, deliberately:**

- **A1** (run length), **A2** (towers mandatory), **A3** (movement mandatory),
  **A4** (single-type viability), **A9** (economy), **A11** (determinism),
  **B7** (leak coupling), **B10** (UI flow) — all survive V3, though A1/A4 need
  **re-baselining after M22** when the run shape changes, and every balance bound
  needs re-baselining after **M19**.
- **A10** — stays red rather than being retuned. §4.5.
- `light-build.test.ts` — its subject (Act I clearable by more than one build shape)
  survives as a TD-wave claim; re-baseline at M22.

---

## 6. Save-format migration

Existing saves (`stonewake.save.v1`) carry: `ember`, `accountLevel`, `allocated`,
`stash` (relics with `sigil/plate/charm` slots), `orbs`, `equipped`, `questProgress`,
`completedQuests`, `unlockedClasses`, `highestTier`, `nextRelicId`.

| Key | V3 disposition |
|---|---|
| `orbs` | **drop** (M18, C7 save-migration test) |
| `ember` | convert **100:1 → skill points** once, then drop (§14.3, M24) |
| `accountLevel` | derived from skill points instead (M24) |
| `stash` / `equipped` | slots change 3→6 and items become table draws; old relics have no V3 equivalent. **Q49**, default: keep the stash, migrate old relics to the nearest V3 slot where one exists and otherwise discard with a one-time Hub notice, rather than silently deleting a player's stash. |
| everything else | unchanged |

`SAVE_VERSION` is `1`. Each destructive migration must bump it and be covered by a
round-trip test, or a v0.2 save will crash a v0.3 client.

---

## 7. Suggested execution notes for M18–M27

- **M18 is safe to do first** — orbs removal, dev profile, god mode, indicators and
  selection touch nothing V3 re-specs later, which is why §13 orders it that way.
- **Do not tune anything before M19.** §4.4: multiplicative stacking moves every
  number. Tuning in M18 is throwaway.
- **M19 and M20 will break most balance tests at once.** Expect to re-baseline A1,
  A4, A9, B1, B2 in one pass at M27 rather than fighting them per-milestone; bounds
  that fail for the right reason should be marked with a reason rather than nudged.
- **A11 must stay green at every commit.** It is the only gate that catches the class
  of bug (unhashed new state) that f001's code review found.
- **Content hash before the Tuner** (§4.9): M26 is much cheaper if `RunConfig`
  already carries content identity, and adding it early costs almost nothing.

---

## 8. SPEC-FINAL reconcile (§16)

SPEC-FINAL supersedes SPEC.md, SPEC-V2.md and SPEC-V3.md. §16 asks for one
reconcile milestone: audit code against SPEC-FINAL, map every gap to a backlog
item in §15's P order, retire superseded tests with logged reasons, then continue
the loop. This section is that audit's ledger. BACKLOG.md is rewritten to match.

### 8.1 What changed against V3

SPEC-FINAL is mostly V3 made complete and self-contained rather than V3 revised,
so §§1–13 of this file survive as written — the systems V3 marked for removal are
the same ones SPEC-FINAL removes. Four things are genuinely new:

1. **The gate list is consolidated.** §14's **G1–G20** replaces every A-, B- and
   C-gate list. This is a renaming for most surviving gates and a real change for
   three: G17 replaces A10's wall-clock budget with a host-independent per-
   simulated-minute budget plus a 60 fps benchmark and a 50-run soak; G19 is new
   (liveness: winners include sealed *and* open strategies, and multi-summon);
   G20 is new (every §5 milestone special measurably changes the attack it names,
   loader-validated).
2. **Burning stacks per application** (§3, owner intent), flipped from today's
   `maxStacks 1, refresh strongest` at the balance pass. Carried as **p10a**.
3. **§4.2, §5.2 and §6.3 are filled in.** V3 left nine classes, seven towers and
   the VS upgrade pool as gaps; SPEC-FINAL authors all three as designer-fill,
   vetoable by the owner (§17). The seven towers were already built at M20; the
   nine classes and the pool are **p6d** and **p7a**.
4. **§16 names the balance work explicitly**: flip Burning, re-price against G13,
   re-baseline perf as G17. These are **p10a**, **p10c**, **p10e**.

### 8.2 Old id → new id

| V3 item | SPEC-FINAL item | Note |
|---|---|---|
| m20d | p5a | unchanged, re-pointed at G13 |
| m20e | p5b | unchanged |
| m21a | p2a | acceptance now G3, worked example verbatim |
| m21b | p2c | VS specials now authored per tower in §5's last column |
| m21c | p2b | unchanged |
| m21d | p2e | unchanged |
| m22a | p3a | unchanged |
| m22b | p3b | early-call bonus formula stated (`2 gold x un-elapsed build seconds`) |
| m22c | p3d | unchanged |
| m22d | p3e | run length split out to p10d, which owns G1 |
| m23a–c | p6a–c | acceptance now G9 |
| m23d | p6f | inverted: §4 re-authors Engineer and Pyro, so the legacy trio is migrated onto §4's shape, not badged as legacy |
| — | p6d, p6e | new: the nine §4.2 classes; G8/G10/G11 |
| m24a | p7b | unchanged |
| m24b | p7c | acceptance now G12 |
| m24c | p7d | widened to take the relic affix system with Ember |
| m24d | — | retired: the `relicFind` stat dies with the affix table at p7d |
| — | p7a, p7e | new: §6.3's VS upgrade pool; §8.4's quests |
| m25a | p1a | moved to P1, where §15 puts sealing |
| m25b | p1b | acceptance now G7's third clause |
| m26a–c | p9a–c | acceptance now G15 |
| m27a | folded into p10c–p10f | "all gates green" is not an item; each gate is |
| m27b | — | retired: G13 + G19 are SPEC-FINAL's version of the claim |
| m27c | p10i | unchanged |
| s001, s002 | p7f, p7g | unchanged |
| s003 | p9e | acceptance now G18's dead-end clause |
| s004 | p8b | unchanged |
| s005 | p9d | acceptance now G16 |
| s006 | — | retired: the `of Thrift` affix dies with the affix table at p7d |
| s007 | — | retired: the `terrain` residual mechanism is replaced by §5's VS special column at p2c |
| s008 | p10g | unchanged |
| s009 | p10b | unchanged |
| s010 | p9h | unchanged |
| s011 | p9g | unchanged |

### 8.3 Test retirements

Same rule as §5, which this section extends rather than replaces:

> A test is retired the moment the spec contradicts what it asserts, but its file
> is not deleted until the code it covers is deleted. Retired tests become
> `describe.skip` / `it.skip` with a `RETIRED (SPEC-FINAL §x)` reason naming the
> superseding section and the backlog item that removes the code.

Retired **at the reconcile commit**, because SPEC-FINAL contradicts the assertion
itself rather than its tuning:

| Test | Retired because | Deleted at |
|---|---|---|
| `sundering.test.ts` — all 4 describes | §6.2 keeps towers inert-but-present; there is no Dusk, no petrification, no conversion table, no Heartstone, no slot picker. The three effects worth keeping become §5 VS specials (electric wire grid, beacon attack speed, sprout XP gems); the "always leaves a walkable lane" case is contradicted twice over, by §6.2 and by §10's legal sealing. | p2e |
| `act2.test.ts` › `soul weapons` | §6.1 has no weapon roster: named weapons with their own level ladders are replaced by per-tower-type derivation. | p2e |
| `act2.test.ts` › `weapon inheritance (SPEC 4.1)` | §6.1 replaces "highest tier + 8%/duplicate, capped +40%, 6 slots" with "average across the type x (1 + 10% x count)", no slots and no cap. | p2e |
| `act2.test.ts` › `applies a weapon offer` | §6.3's pool has no weapon cards. | p7a |
| `f004-class-framework.test.ts` › `class content` | §4's framework is bands + Passive + Q + E + Tower passive; there is no Day-use/Night-use Active and no Signature. | p6f |
| `f004-class-framework.test.ts` › `affinity replaces class locks` | §4 gives each class a Tower passive that applies to every tower; there is no per-class per-tower damage affinity. | p6f |
| `f004-class-framework.test.ts` › `the Dusk picker binds for every class` | No picker and no slot budget: §6.1 grants every built type unconditionally. | p2e |
| `content-complete.test.ts` › `has 8 weapons…` | As `soul weapons`. | p2e |
| `content-complete.test.ts` › `has 12 boons…` | §6.3's pool (stat boons rank x5, Type Mastery rank x3, 3 skill cards per class rank x2) replaces `boons.json`'s flat 12. | p7a |
| `content-complete.test.ts` › `introduces the Gatebreaker on wave 10` | §1.1 puts the Gatebreaker at the end of **TD wave 18** of 18. | p8a |
| `content-complete.test.ts` › `rolls relics with the right affix counts per rarity` | §7's equipment is a fixed 12-item table across 6 slots, granted 1 per TD wave cleared. Nothing rolls. | p7d |
| `b004-ember-survival.test.ts` — both describes | §8 removes Ember; §1.1 removes the multi-Night run there was a cumulative survival counter for. | p7d |

**Reasons restated, not newly retired** — A5, A6, A7 and A8 were already retired
against V3 at M17. Their headers now name the SPEC-FINAL gate that supersedes
them (G13, §6.2/p2c, G7, and G13+G19 respectively) and the item that deletes the
file. A8's carried-forward claim is **not** re-filed: see the m27b row above.

**Not retired, deliberately:**

- **A1** → G1, **A2**, **A3**, **A4** → G13's solo-viability clause, **A9**,
  **A11** → G2, **B7** → G6's leak-coupling clause, **B10** → G18, **C3** → G4,
  **C4** → G5, **C7** → G12, **C8** → G16. Every one of these survives in
  substance; what changes is the gate name and, for the balance bounds, the
  baseline they are measured against once p3a changes the run shape.
- **A10** stays live and red-adjacent rather than retired: §16 asks for it to be
  *re-baselined* as G17, not dropped. p10e owns it.
- `f001-cycle-machine.test.ts` — its four Rekindle/Dusk cases are already skipped
  from M17; the rest still guards the live phase machine and is retired wholesale
  at **p3d**, when that machine is deleted.
- `light-build.test.ts` — its subject survives as a TD-wave claim; re-baselined
  at p3e.

### 8.4 Contradictions — shipped code against authoritative SPEC-FINAL text

Kept separate from the gaps above deliberately: a gap is work not yet done, a
contradiction is code asserting the opposite of the spec. CLAUDE.md's rule 3
applies to these (failing regression test before the fix) and they head the
queue as **x001** and **x002**.

#### 8.4.1 Poison's stack cap: the working tree says 50, §3 says 3

The uncommitted `m20d` tree sets `poison.maxStacks: 50` in
`data/damagetypes.json`. SPEC-FINAL §3: "Poison | DoT totalling 120% of the
triggering damage over 3 s; **cap 3 stacks, refresh shortest** ⚖."

The change was reasoned and measured. Q86 found that three stacks of a 3 s DoT
is a ceiling of exactly one application per second — the Venom Spore's own fire
rate — so §5.1's "poison ratio → 1:1.5 @4" moved damage into a bucket that was
already full and measured as a **downgrade** (88.6 → 83.8 dps). SPEC-V3 §3 gave
no per-type cap and defaulted to "independent stacks", so 50 was a legal reading
then. SPEC-FINAL states the cap, so it is not a legal reading now.

**And the tree does not ship on its own merits either.** Measured at this audit:
`a3-movement-mandatory.test.ts` › *at least half the seeds are dead inside three
minutes* is green at `77250b8` and **red on the m20d tree at 5/12** (survivals
387, 117, 198, 203, 87, 209, 98, 300, 294, 386, 66, 117) against a ≥6/12 bar.

Bisected, because the obvious story was wrong. Three runs of the same test:

| Tree | Result |
|---|---|
| `77250b8` | green |
| `77250b8` + **poison cap 50 only** | **green** |
| `77250b8` + **spare-spore targeting + damage 45 → 23**, cap left at 3 | **red** |

So the cap — the change SPEC-FINAL forbids — is *not* what moves A3, and Q86's
blast-radius claim survives this test. The regression is in the pair p5c has to
re-land: aiming the spare spore at the leading target when it has no target of
its own makes the Venom Spore better in exactly the sparse fights a `no-move`
Act II bot dies in, and the 49% damage cut that paid for it does not cover the
gain there. Two independent reasons not to ship the tree, and they point at
different halves of it — which is why the item is "keep the cap at 3 and re-land
the two findings under it", not "re-apply the branch".

Disposition: the tree is preserved on branch **`wip/m20d`** and reverted on
`master`. It is re-filed as a P5 item carrying both measurements, because two of
its three findings survive SPEC-FINAL intact — the spare spore that `+1
projectile @2` never fires, and the @4 milestone that measures worse than the
step below it. The second is now a genuine spec-internal tension (§3's cap
against §5.1's milestone, both authoritative, both ⚖) and is logged for the
owner rather than resolved by an agent.

#### 8.4.2 Lifesteal's per-second cap: code caps at 3, §2 says no cap

`data/warden.json` carries `leechCapPerSecond: 3`. SPEC-FINAL §2: "Lifesteal |
Heals from **normal damage** dealt, **no per-second cap**." The clause is not
marked ⚖. The cap is a V1/V2 safety rail §2 removes on purpose, and §2's next
sentence — "VS tower attacks count as character attacks, so they lifesteal" — is
exactly the case the rail existed to blunt, so removing it is a real balance
event and belongs with a measurement, not with a one-line edit.

### 8.5 Gate renaming

§14's G1–G20 "replaces all prior A/B/C lists". The map, so an old reference in a
test header or a QUESTIONS entry can be followed:

| New | Old | New | Old |
|---|---|---|---|
| G1 run length | A1 | G11 Stormcaller chain | — (new) |
| G2 determinism | A11 (+ content hash) | G12 rewards | C7 |
| G3 VS inheritance | C2 (A5/A6/A8's successor) | G13 VS type share | A4 + A5 |
| G4 armour | C3 | G14 boss | `boss.test.ts`, A8 |
| G5 stacking | C4 | G15 Tuner | C6 |
| G6 interleave | C1 | G16 dev profile | C8 |
| G7 sealing | C5 + C5b (A7's successor) | G17 perf | A10 |
| G8 class win rates | C11 | G18 UI flows | B10 |
| G9 Swordsman + Plaguebringer | C9 + C10 | G19 liveness | A2, A3, B11 |
| G10 Archer charge | — (new) | G20 milestone specials | — (new) |
