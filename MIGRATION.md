# MIGRATION.md — the codebase against SPEC-FINAL

**Audit date:** 2026-08-26. **Baseline commit:** `77250b8`, plus the uncommitted
`m20d` working tree (disposed of in §3.1). **Precedence: SPEC-FINAL supersedes
SPEC-V3, SPEC-V2 and SPEC.md** (SPEC-FINAL preamble). This file replaces the M17
audit of SPEC-V3; that audit's conclusions are folded in where they still hold,
and its retirement rule is kept verbatim (§4).

Written for SPEC-FINAL §16. Three questions per system: **is it built**, **does
SPEC-FINAL supersede it**, and **does SPEC-FINAL contradict something already
shipped**. Every claim was checked against the code, not against a prior
document's description of the code.

Reproduce the audit with:

```
npm test                                       # 647 pass / 22 skipped at 77250b8;
                                               # 610 / 54 after §4.2's retirements
npx vitest run --config vitest.perf.config.ts
npx tsx tools/sweep.ts --seeds 12 --policies maxbuild,hybrid
npx tsx tools/handoff-metrics.ts
```

---

## 0. Headline

- **SPEC-FINAL is less a new design than a completed one.** Where SPEC-V3 said
  "designer work, not agent work" — its nine open classes, its seven open towers
  — SPEC-FINAL fills the blank in. Almost nothing built against V3 is
  *invalidated*; a great deal V3 left undecided is now decided, which converts a
  pile of QUESTIONS entries into ordinary backlog items.
- **Three of V3's four largest gaps are still gaps**: the VS wielding formula
  (§6.1), the interleaved run structure (§1.1), and sealing (§10). They were
  M21/M22/M25 in the V3 queue and are P2/P3/P1 here. None was started.
- **What V3 finished, SPEC-FINAL keeps**: armour (§2), multiplicative stacking
  (§2), the damage-type taxonomy (§3), per-tower upgrade tracks (§5), and the
  tooling wins (dev profile, god mode, range indicators, selection). Ticked in
  §1 so later phases do not re-litigate them.
- **Two shipped behaviours contradict authoritative spec text** rather than
  merely lagging it — Poison's stack cap and the lifesteal per-second cap. A
  contradiction is a bug, not a gap, so both head the queue. Details in §3.
- **The uncommitted `m20d` tree does not ship**, for two unrelated reasons: its
  central change is the one SPEC-FINAL §3 contradicts, and — separately, by
  bisection — its *other* half regresses gate A3 (§3.1). Preserved on branch
  `wip/m20d`, re-filed as `p5c`.
- **HANDOFF.md is stale by two milestones** — it still describes three tower
  tiers at ×1.6 each, which m20a deleted. Regenerating it is P10.

---

## 1. Built, and kept by SPEC-FINAL

| System | SPEC-FINAL § | Where |
|---|---|---|
| Fixed 60 Hz sim; no DOM/`Math.random`/`Date.now`/native trig | §12 | `src/sim/*`, `tests/architecture.test.ts` |
| Five named RNG streams, FNV-1a end-state hash, replay from seed + input log | §12, G2 | `rng.ts`, `hash.ts`, `a11-determinism.test.ts` |
| 36×20 grid, 3 gates, Core 2×2 east-center, T1–T5 with drafted modifiers | §10 | `grid.ts`, `tiers.ts`, `data/modifiers.json` |
| Flow-field pathing, spatial buckets, staggered separation | §10 | `grid.ts`, `world.ts`, `enemies.ts` |
| 20-enemy roster with trait bitmask, elites, boss phases | §9 | `enemies.ts`, `boss.ts`, `data/enemies.json` |
| Armour: flat points = percent, cap +99, floor −100, DoTs ignore it, Burning shreds it | §2, G4 | `stats.ts`, `enemies.ts`, `c3-armor.test.ts` |
| Multiplicative stacking across sources, additive ranks within one, exhaustive `STAT_KIND` | §2, G5 | `stats.ts`, `c4-stacking.test.ts` |
| Six damage types + frost/frozen in `data/damagetypes.json`; composite splits; DoT clipping | §3 | `damagetypes.ts`, `m19c-damage-types.test.ts` |
| Per-tower upgrade tracks: +10% HP/Atk/Def per step, flat step cost, sell 50% of spent, milestone specials as typed data | §5 | `upgrades.ts`, `data/towers.json`, `m20a`–`m20c` tests |
| Defense bands (none 0 / low 5 / medium 10) with a loader that refuses anything else | §5 | `content.ts` `validateDefense` |
| Leak coupling: TD leaks add 2× spawn cost to the next VS budget | §1.1, G6 | `f003-leak-coupling.test.ts` |
| Character move/dash (4 tiles, 3 s cd, i-frames), build within 4 tiles, instant build/sell | §10 | `run.ts` `updateWarden`, `towers.ts` |
| Defeat → Results → Retry/New/Hub; Esc pause + Abandon confirm | §11, G18 | `b10-death-flow.test.ts`, `ui-input.test.ts` |
| Save/load with versioned migration and corrupt-save repair; stash click-to-swap | §11, G18 | `meta/meta.ts`, `t6c-save-migration.test.ts`, `b003-stash-ux.test.ts` |
| Orbs deleted everywhere | §8.5, G12 | `c7-no-orbs.test.ts` |
| Dev profile (`data/dev.json`); prod build with dev off | §11, G16 | `meta/devprofile.ts`, `c8-dev-profile.test.ts` |
| God mode as a replay-safe practice Command | §11 | `run.ts` `applyDevCommand`, `practice.test.ts` |
| Range/AoE placement ghosts, selection rings, click-select stats panel | §11 | `t1-range-indicators.test.ts`, `t2-selection.test.ts` |
| Fast-forward 1/2/3× bit-identical to 1× | §11, G2 | `pacer.test.ts` |
| Headless CLI + bot policies; zod-validated `/data` | §12 | `tools/sim.ts`, `src/bots/*`, `content.ts` |
| SFX behind an `AudioSink` seam | §11 | `render/sfx.ts` |

---

## 2. Gaps, in SPEC-FINAL §15's P-order

BACKLOG.md is now ordered the same way.

### P0 — sim skeleton

| Gap | Detail |
|---|---|
| Content hash in `RunConfig` (G2) | `RunConfig` carries no content identity, so a replay recorded against edited `/data` diverges silently instead of failing loudly. G2 names "tuner-edited content (per content hash)" explicitly, and the Tuner (P9) cannot ship without it. Cheap now, load-bearing later. |

### P1 — TD core

| Gap | Detail |
|---|---|
| Sealing the Core (§10, G7) | `grid.ts:253` `wouldBlockPath` and `towers.ts:89`'s `blocks_path` rejection are precisely what §10 removes. Structures become high-cost passable tiles, cost ∝ HP × toughness; fliers/burrowers/wraiths keep their bypasses. The build ghost's red refusal (`canvas.ts` `drawBuildGhost`) goes with it. |

### P2 — VS core

| Gap | Detail |
|---|---|
| VS tower-attack inheritance (§6.1, G3) | **Not built, and what is built is a different model.** The character wields *soul weapons* bound at the Sundering: 8 defs × 6 levels in `data/weapons.json`, a 6-slot cap, `inheritDamagePerExtraTower: 0.08` capped at `0.40`, Awakenings, terrain residuals. §6.1 has no slots, no per-weapon identity and no ladder — damage is the average across a type's towers × (1 + 10% × count), fired at that type's attack speed with the highest upgrade level's effects. |
| Towers inert but present in VS (§6.2) | Today the Sundering *petrifies* towers into terrain granting residual passives. §6.2 keeps them as towers: solid obstacles that keep HP and can be attacked, contributing their VS special. |
| VS specials for all ten towers (§5) | §5 populates the column for all ten (electric wire grid, poison trail, brazier corpse-explosions, obelisk aura, beacon character haste, sprout XP gems, four `none`). **Zero are built.** The nearest equivalent is the terrain-residual system, a different mechanism that goes with the Sundering. |
| Weapon-panel lineage (§6.2) | "Arrow ×3 (avg 14.2, +30%) — pierce 2". The panel exists; it renders the soul ladder. |
| Delete the Sundering | `sundering.ts`, `weapons.ts` `grantWeapon`/`applyTerrainPassives`, `derived.weaponSlots`, `data/weapons.json`'s level/awakening/inherit keys, and the retired A5/A6/A8 files. |

### P3 — interleave + leak coupling (G6)

| Gap | Detail |
|---|---|
| The run shape (§1.1) | Built: 3 Day/Night **cycles**, 10 TD waves split 4/8/10, Dusk picker, Dawn Rekindle/Leave, `Phase` `dusk`/`soulpick`/`dawn`, `World.cycle`/`totalCycles`/`cycleWaveEnd`/`nightLengthSeconds`, `RunConfig.cycles`, four per-cycle keys in `data/waves.json`. Wanted: **18 TD + 6 VS interleaved TD×3→VS**, no picker screens. |
| Multi-summon (§1.1, G6) | `{k:'call'}` calls exactly one wave early. §1.1 stacks up to 3, each paying `2 gold × its own un-elapsed build seconds` once; VS waves unstackable. |
| Build phase 20 s, VS wave 75 s (§1.1 ⚖) | `data/waves.json` has `buildPhaseSeconds: 30`; VS length comes from `nightSecondsByCycle`, which the cycle machine owns. |
| VS budget per wave index (§9) | `data/spawns.json` grows the budget **per elapsed minute** (`150 × 1.21^minute`, `warmupSeconds: 100`). §9 indexes it by *wave*. |
| G1 re-baseline | A1 asserts a **median** of 24–28 min. G1 asks for a **mean** of 30–36 min over 24+ seeds and says "never medians" in as many words. Retired in §4.2. |

### P4 — core math + damage types (G4, G5)

Mostly done at m19a/m19b/m19c. What remains is two contradictions (§3) and four
verification gaps:

| Gap | Detail |
|---|---|
| Area applies to *every* attack, active and effect (§2) | `areaMul` exists and is a `mul` stat, but nothing asserts that every AoE consumer reads it — tower AoE, Electric's inherent r0.8, Burning's r1 spread, class actives, ground fields. §2's wording is an exhaustiveness claim and needs an exhaustive test. |
| `slowImmune` vs frost/frozen (§3) | §3's final-partial rules say frost/frozen respect `slowImmune`. `applySlow` honours the trait; the frost/frozen path added at m19c has no test that it does. |
| Burning spread rules (§3) | §3 spells out three clauses m19c did not have to answer: overlapping victims' spreads **add**, immunities are checked **on both paths**, and the Burning itself does not spread — only its effects do. |
| Lifesteal source (§2) | Lifesteal must heal from **normal** damage only. `damageEnemy` accrues `leechAccumulator` from every `dmg` it applies, DoT ticks included, unless a caller filters. Needs a test either way. |

### P5 — tower roster and upgrade tracks (G20)

§5.2 is the section that changed most. SPEC-V3 left seven towers open, and m20c
proposed keeping their V2-equivalent tracks pending sign-off (Q80). **SPEC-FINAL
decides them**, and its answer is close to the count line m20c measured and
rejected — because SPEC-FINAL also grants the thing that made the line
infeasible: "per-track `costMul` allowed" (§5). m20c filed exactly that as m20e.

| Tower | Track now | §5.2 wants | Milestones now | §5.2 wants |
|---|---|---|---|---|
| palisade (wall) | 0 steps, def `none` | **3 steps**, def **medium** | — | +10% only |
| ballista | 10 steps, def medium | **4** | — | +1 pierce @2 · +1 projectile @4 |
| ember_brazier (fire brazier) | 10 steps, def low | **4** | — | +1 Burning @2 · cone width +50% @4 |
| frost_obelisk (ice obelisk) | 10 steps, def medium | **3** | — | @3: this tower's frost lasts 5 s |
| mortar | 10 steps, def low | **3** | — | @3: shells leave a burning patch 2 s |
| beacon_totem | 2 ✓ | 2 ✓ | +25% aura/step | +25% aura/step (linear) ✓ |
| harvest_sprout | 2 ✓ | 2 ✓ | +5 gold/step | +5 gold/wave per step ✓ |
| arrow_spire, tesla_coil, venom_spore | as §5.1 ✓ | ✓ | ✓ | ✓ |

Also open at P5: **G20** — "every §5 milestone special measurably changes the
attack it names (loader-validated)". `validateSpecial` refuses a special the
attack cannot *pay*; it does not measure that the attack **changes**.

### P6 — classes

**`data/classes.json` has 3 classes and none of them is one of SPEC-FINAL's
eleven.** `engineer`, `pyromancer` and `frost_warden` are near-neighbours of
§4.2's Engineer, Pyro and Cryomancer with different kits. The shipped model is
one `active` (a single `kind`, `burst_damage`), one passive, one `manualAttack`
disabled in Act II, plus `data/affinity.json`. §4 wants archetype bands +
Passive + Active1 (Q) + Active2 (E) + a Tower passive, mouse-aimed, combo-aware,
with a basic auto-attack on the nearest enemy. All eleven kits are new content;
the Command plumbing, cooldown field, Q binding and HUD row survive.

Gates: G8 (all eleven clear T1 at 35–70%, top damage source differs across ≥8 of
11), G9 (Swordsman combo, Plaguebringer transfer), G10 (Archer charge), G11
(Stormcaller chain ≤ ×3.6).

### P7 — VS upgrades, equipment, rewards (G12)

| Gap | Detail |
|---|---|
| `data/vsupgrades.json` (§6.3) | Built: `data/boons.json`, 12 flat stat boons, 1-of-3 with one reroll — the *mechanism* §6.3 wants with the wrong pool. §6.3 adds **Type Mastery** (one card per built tower type) and **Skill cards** (3 per class), which need §6.1 and §4 first. |
| Equipment (§7) | Built: 3 slots (`sigil`/`plate`/`charm`) with 12 procedurally-rolled affixes across 3 rarities. Wanted: **6 slots**, a fixed **12-item table**, flat adds plus multipliers, and **class-conditional effects with fallbacks** ("if not Swordsman: …") — a mechanism that does not exist today. |
| Rewards (§8.1–8.2, G12) | Built: relics drop from elites and bosses; Ember → account level → tree points. Wanted: **1 equipment per TD wave cleared** and **1 skill point per VS wave cleared**, granted at run end, win or lose, for waves fully cleared. |
| Tree re-pricing (§8.3) | 121 nodes ✓, adjacency ✓, respec ✓ — priced in Ember (`respecCostPerNode: 5`, `startingEmber: 400`, `maxAccountLevel: 60`). §8.3 wants respec at **1 point per node**, and with 6 points a run the whole curve moves. |
| Quests (§8.4) | 8 exist. Four award cosmetics or features, and §8.4 says quests "award unlocks only, never currency". §8.4 also names three specific quests (win a run → Pyro; 40 ice obelisks → Cryomancer; sealed-Core win → Paladin) against a roster that does not exist until P6. |

### P8 — enemies, waves, bosses (G14)

| Gap | Detail |
|---|---|
| Mender interrupt (§9) | `updateAbilities` heals on a flat 0.5 s timer with no interrupt path. §9: "interrupted by any hit ≥ 25 ⚖". |
| Shellback (§9) | Built as `frontReduction`, a *reduction* from the front. §9 states the mirror — "**+100% damage from behind**; pierce ignores the shield". The pierce bypass does not exist (`opts.pure` is the only bypass and it is not pierce). |
| Warlock (§9) | The `buffer` aura is built; "takes +50% from single-target attacks" is not, and nothing in `DamageOptions` records whether a hit was single-target. |
| 18 TD wave compositions (§1.1, §9) | `data/waves.json` has 10. |
| Gatebreaker at TD wave 18 (§1.1) | `content-complete.test.ts` pins it to wave 10. |
| Bomber ×3 vs structures (§9) | `enemyStructureDpsFactor: 3` is a **global** multiplier for every enemy, not Bomber's trait. §9 gives ×3 to Bomber and ×2 to Gatebreaker specifically. |

### P9 — tooling (G15, G16, G18)

| Gap | Detail |
|---|---|
| Codex (§11) | No Hub page lists every entity from `/data`. |
| Tuner (§11, G15) | No editable view, no Vite dev-server write endpoint, no prod read-only/export-import path, no "edited run" flag. Depends on P0's content hash. |

### P10 — balance re-baseline and feel (§16)

| Gap | Detail |
|---|---|
| Burning → per-application stacking (§3, §16) | `maxStacks: 1, refresh: "strongest"` today; §3 states the owner's intent and §16 names the flip. One field. |
| Re-price against G13 | "No tower type's VS attack > 35% of damage across the winning-build pool; every type solo-viable at T1, none at T3." Needs §6.1 to exist first. |
| G17 perf budget | A10's whole-run budget is a 5000 ms constant written for a one-cycle run; it has outlived its premise twice, and §14 replaces it with a host-independent **per-simulated-minute** budget. Retired in §4.2. |
| G1, G8, G13, G14, G19 re-baseline | All move once P3 changes the run shape and P6 lands eleven classes. |
| 2 s TD↔VS transition sweep, juice, SFX/art assets (§11) | Not built. |
| Regenerate HANDOFF.md | Stale since m20a. |

---

## 3. Contradictions — shipped code against authoritative SPEC-FINAL text

Kept separate from gaps deliberately: a gap is work not yet done, a
contradiction is code asserting the opposite of the spec. CLAUDE.md's rule 3
applies to these (failing regression test before the fix) and they head the
queue.

### 3.1 Poison's stack cap: the working tree says 50, §3 says 3

The uncommitted `m20d` tree sets `poison.maxStacks: 50` in
`data/damagetypes.json`. SPEC-FINAL §3: "Poison | DoT totalling 120% of the
triggering damage over 3 s; **cap 3 stacks, refresh shortest** ⚖."

The change was reasoned and measured. Q81 found that three stacks of a 3 s DoT
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

So the cap — the change SPEC-FINAL forbids — is *not* what moves A3, and Q81's
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

### 3.2 Lifesteal's per-second cap: code caps at 3, §2 says no cap

`data/warden.json` carries `leechCapPerSecond: 3`. SPEC-FINAL §2: "Lifesteal |
Heals from **normal damage** dealt, **no per-second cap**." The clause is not
marked ⚖. The cap is a V1/V2 safety rail §2 removes on purpose, and §2's next
sentence — "VS tower attacks count as character attacks, so they lifesteal" — is
exactly the case the rail existed to blunt, so removing it is a real balance
event and belongs with a measurement, not with a one-line edit.

---

## 4. Test retirements (SPEC-FINAL §16)

The M17 rule is kept verbatim, because it worked:

> **A test is retired the moment the spec contradicts what it asserts, but its
> file is not deleted until the code it covers is deleted.** Retired tests become
> `describe.skip`/`it.skip` with a `RETIRED (SPEC-FINAL §x, P<n>):` reason naming
> the superseding section and the phase that removes the code. A skip is visible
> in CI; a deletion is not.

One clarification the rule needed, because applying it literally would have cost
coverage the rule exists to protect: **retire what the spec contradicts, not
what it merely supersedes later.** A skip is a coverage hole too, so a test whose
claim is still *true* and still guards shipped code stays live until the phase
that replaces its subject rewrites it. "Poison stacks to 3" is contradicted by
nothing and stays; "the Gatebreaker arrives on wave 10" is contradicted by §1.1
and goes. §4.3 lists the tests that qualify under the second half of that line.

### 4.1 Already retired under SPEC-V3, still retired under SPEC-FINAL

Reasons unchanged; only the milestone label moves to a P number.

| Test | Was | Deleted at |
|---|---|---|
| `a5-weapon-share.test.ts` (4) | A5 — per-weapon damage share over a 6-slot loadout | P2 (G13 supersedes) |
| `a6-terrain-value.test.ts` (2) | A6 — petrified terrain's damage contribution | P2 (G3 supersedes) |
| `a8-sundering-head-start.test.ts` (4) | A8 — the Sundering head-start math | P2 (G3 supersedes) |
| `a7-turtle-check.test.ts` (3 + 1) | A7 — "a wall-off must leak" | P1 (G7 supersedes) |
| `f001-cycle-machine.test.ts` (4 of 9) | B9, Dusk/Dawn/Rekindle and the phase order | P3 |
| `a3-movement-mandatory.test.ts` › `every seed is dead by 3:00` | pre-existing skip | P3 re-baseline |
| `a4-single-type.test.ts` › two `DEFERRED` clauses | m20a deferral, re-measured at m20c | P10 |
| `light-build.test.ts` › `kite clears Act I on every seed` | 7/8 at m20c | P3 re-baseline |
| `m20b-owner-towers.test.ts` › `still fires that second spore` | Q79/Q81, the Venom spare spore | P5 |

### 4.2 Newly retired by SPEC-FINAL

| Test | Retired because | Deleted at |
|---|---|---|
| `a1-run-length.test.ts` (all 3) | **G1 contradicts A1 three ways**: the target is 30–36 min not 24–28; the statistic is the **mean** ("means/pass-rates, **never medians**") not the median; and the third case asserts "a long Daywatch, then a 10-minute night", the cycle shape §1.1 replaces. Rewritten against 18 TD + 6 VS. | P3 |
| `sundering.test.ts` (15) | §6 replaces the Sundering wholesale: no petrification, no soul binding, no slot picker, no terrain residuals, no Dusk. MIGRATION flagged the *code* at M17; the file was never marked. | P2 |
| `act2.test.ts` › `weapon inheritance (SPEC 4.1)` (3) | §6.1 replaces "highest tier + 8% per extra tower to +40%, capped by slots" with the averaged formula. The file's XP, gem and director cases survive. | P2 |
| `act2.test.ts` › `soul weapons` (4) | Per-weapon identity (Frost Nova, Toxic Trail, the innate weapon) has no successor in §6.1, where the character wields *tower types*. | P2 |
| `f001-cycle-machine.test.ts` (the 5 still live) | They assert `cycleWaveEnd`, `totalCycles`, per-cycle Night heat and a 3-cycle replay — the machine §1.1 replaces in full. Retiring the rest makes the file uniformly retired. | P3 |
| `f004-class-framework.test.ts` › `every class defines an Active with a Day use and a Night use, plus a Signature passive` | §4's framework is Passive + Active1 + Active2 + Tower passive. "Day use / Night use" is the cycle vocabulary §1.1 retires. | P6 |
| `f004-class-framework.test.ts` › `the Dusk picker binds for every class` | The Dusk picker is cut (§1.1). | P3 |
| `content-complete.test.ts` › `has 8 weapons, each with a full six-level track` | §6.1 has no weapon ladder. | P2 |
| `content-complete.test.ts` › `introduces the Gatebreaker on wave 10` | §1.1 puts the Gatebreaker at **TD wave 18**. | P3 |

### 4.3 Superseded but **not** retired — live until their phase rewrites them

Each of these will be replaced, and each still asserts something true about code
that ships today. Skipping them now would buy nothing and lose coverage between
here and the phase named.

| Test | Superseded by | Rewritten at |
|---|---|---|
| `a10-performance.test.ts` › `a full headless run fits the budget` | G17's host-independent **per-simulated-minute** budget. The 5000 ms constant was written for a one-cycle run and §1.1 changes the length again — but it is green today and still catches a real regression. | P10 (`p10c`) |
| `content-complete.test.ts` › `has 12 boons, each mapping to a real stat` | §6.3's pool (stat boons + Type Mastery + skill cards) in `data/vsupgrades.json`. The claim "every boon maps to a real stat" is not contradicted; the pool it ranges over is replaced. | P7 (`p7a`) |
| `content-complete.test.ts` › `loot (SPEC 7)` (4) | §7's fixed 12-item table. Affix rolls still ship and these still guard them. | P7 (`p7b`) |
| `content-complete.test.ts` › `a Shellback takes far less damage from the front` | §9's mirror wording (+100% from behind) plus "pierce ignores the shield". A front shield and a rear bonus are the same fact stated from two ends; the current assertion is not wrong, only incomplete. | P8 (`p8a`) |
| `a4-single-type.test.ts` | G13 restates it ("every type solo-viable at T1, none at T3") and adds the 35% VS-share clause. | P10 (`p10b`) |

**Not retired and not superseded** — these survive SPEC-FINAL and need only the
re-baselining P10 does in one pass:

- `a2-towers-mandatory.test.ts`, `a3-movement-mandatory.test.ts` → G19's liveness claims.
- `a9-economy.test.ts` → supports G1.
- `a11-determinism.test.ts` → G2. **Must stay green at every commit.**
- `boss.test.ts` → G14; Q78 already moved it to 20 seeds with a 60% floor, which is G14's wording.
- `c3-armor.test.ts` → G4 · `c4-stacking.test.ts` → G5 · `c7-no-orbs.test.ts` → G12 ·
  `c8-dev-profile.test.ts` → G16 · `b10-death-flow.test.ts`, `b003-stash-ux.test.ts`,
  `t6c-save-migration.test.ts`, `ui-input.test.ts` → G18.
- `f003-leak-coupling.test.ts` → G6.
- `m19c`, `m20a`–`m20c`, `projectile-style`, `tower-info`, `t1`, `t2`, `t4`,
  `architecture`, `grid`, `hud-controls`, `meta`, `hub-testing`, `pacer`,
  `practice`, `progress`, `ui-refund-repro`, `b004-ember-survival` — all live.
  `b004`'s subject (cumulative VS time) survives §1.1 as "total VS seconds".

---

## 5. Gate renaming

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

---

## 6. Save-format migration

`SAVE_VERSION` is **2** (t6c bumped it when orbs went). Remaining destructive
steps, all at P7:

| Key | SPEC-FINAL disposition |
|---|---|
| `ember`, `accountLevel` | retired (§8.2); one-time 100:1 conversion to skill points per Q46's default, then dropped |
| `stash` / `equipped` | slots 3 → 6 and items become table draws (§7); Q49's default stands — migrate an old relic to the nearest slot where one exists, otherwise discard with a one-time Hub notice |
| `unlockedClasses` | keys change with the eleven-class roster (§4) |
| everything else | unchanged |

Each step bumps `SAVE_VERSION` and needs a round-trip test, or a v0.2 save
crashes a v1.0 client (G18).

---

## 7. Execution notes

- **P0 is an hour and unblocks P9.** Do it first even though nothing is red.
- **P2 and P3 are the two large ones and they interlock.** §6.1's formula is
  meaningless without VS waves to fire it in, and §1.1's interleave is
  meaningless without something for the VS wave to do. Build §6.1 first — it is
  testable in isolation against G3's verbatim worked example — then the run shape.
- **Do not tune before P3 lands the run shape.** Q40's standing constraint
  survives verbatim: bounds that fail meanwhile get a recorded reason, not a
  nudged constant. P10 is the one balance pass.
- **A11 must stay green at every commit.** It is the only gate that catches
  unhashed new state, the class of bug f001's review found and m20a's did not.
- **Re-measure deferrals rather than inheriting them.** m20c re-measured m20a's
  five deferred assertions and two were already green. A deferral is a
  measurement with an expiry date.
- **Bisect before attributing.** §3.1: the m20d tree turns A3 red and contains a
  change SPEC-FINAL forbids, and it is tempting to call those one fact. Three
  runs say they are two — the forbidden change is green on its own, and the
  regression is in the half that survives the spec. One of them would have been
  written into the backlog as the cause.
