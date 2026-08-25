# HANDOFF.md — Stonewake v0.1 engineering state report

For the designer writing SPEC v0.2. Describes what the code **actually does**,
not what SPEC v0.1 says it should. Every number here was measured or read out of
`/data` on 2026-08-25 at commit `af1de8f`.

Regenerate the measured sections with:

```
npx tsx tools/handoff-metrics.ts     # sweep table, damage share, boon picks
npx tsx tools/a4probe.ts             # per-tower solo viability
npx tsx tools/a5probe.ts             # weapon damage share, top-10 builds
npx tsx tools/sweep.ts --seeds 12 --policies maxbuild,hybrid
```

---

## 1. Implemented systems

### Simulation core (`src/sim/`)
| System | How it actually works |
|---|---|
| Loop | Fixed 60 Hz. `Run.step(TickInput)` advances exactly one tick; no wall-clock anywhere in `/src/sim`. |
| Determinism | Run = `RunConfig` + input log. End state is FNV-1a hashed over quantised positions/HP/RNG state. 100 seeds × 2 replays produce identical hashes. |
| RNG | mulberry32, five independent streams (`waves`, `spawns`, `drops`, `offers`, `ai`) seeded by FNV-1a of the stream name + run seed. |
| Math | `dsin`/`dcos`/`datan2` are polynomial; the sim never calls native trig, which is implementation-defined and would break cross-engine replays. |
| Grid | 36×20 tiles. Integer-cost Dijkstra (10 orthogonal / 14 diagonal, no corner-cutting) produces a ground field and a ghost field toward the Core. A flat `blocked` mask backs `passable()`. |
| Path guarantee | `wouldBlockPath()` temporarily occupies the candidate tiles, recomputes, checks every gate still reaches the Core, restores. Rejection is silent to the sim, red ghost in the UI. |
| Act II navigation | A third field is rebuilt from the Warden's tile, at most every 12 ticks. Fliers and burrowers ignore it and beeline. |
| Spatial index | One pooled bucket array per tile, rebuilt each tick, clearing only the cells used last tick. Nearly every system queries it. |
| Enemies | 20 defs, trait behaviour dispatched off a cached bitmask. Movement = flow-field step + crowd separation (recomputed per enemy every 6 ticks, faded out near the target) + axis-wise collision. |
| Towers | 10 defs, 7 attack kinds (`single`/`pierce`/`cone`/`aura`/`chain`/`lob`/`poison`). Targeting is "nearest the Core" by flow-field distance. Three tiers, ×1.6 damage and ×1.1 range each. |
| Weapons | 8 souls (7 from towers + innate Warden's Arrow), 6 levels each, auto-firing, no manual aim. Pierce, blast, cone and ground fields all decay per additional target hit. |
| The Sundering | Towers petrify in place; the Core detonation clears a radius-3 pocket **and** blasts up to 4 cheapest lanes from the arena rim to the Heartstone so it can never be sealed in. Souls bind, terrain passives apply. |
| Act II director | Budget `150 × 1.21^minute`, warmed up from 30% over 75 s, accrued continuously and spent as it lands. Elites every 90 s, Rift bursts at 3/6/9 min, alive cap 350, boss at 10:00. |
| Progression | XP `5n + n²` per level, 1-of-3 offers with one reroll, 12 boons, 3 Awakenings gated on weapon Lv6 + a boon at rank 3. |
| Boss | Three phases at 100/66/30% HP: telegraphed charges that shatter terrain, Wraith summons + expanding slam rings, enrage with a closing fire ring. |
| Loot | Luck-weighted rarity, guaranteed relics from elites/bosses, ~3 Orbs per won run. |

### Outside the sim
| System | How it actually works |
|---|---|
| Bots (`src/bots/`) | `idle`, `kite`, `turtle`, `hybrid`, `no-move`, plus purpose-built `maxbuild`, `rush`, `walloff`, `greedy`, `greedless` for specific gates. Act I picks build sites by lane adjacency; Act II scores 8 headings on threat, terrain, gems and edge distance every 3 ticks. |
| Meta (`src/meta/`) | Ember → account level → Constellation points; 120-node tree with adjacency-gated allocation and connectivity-preserving refunds; 24-slot stash; 3 Orb crafts; 8 quests; localStorage save with migration and repair. |
| Renderer (`src/render/`) | Canvas, backed at device pixel ratio. Reads sim state, never writes. Hit flash, damage numbers, shake, boss telegraphs, arena fire. |
| SFX | Every gameplay event maps to a rate-limited synthesised cue behind an `AudioSink` seam. No audio assets ship. |
| UI (`src/ui/`) | Hub (class / tier draft / Constellation / stash / settings) → run (canvas + HUD + modals) → results → Hub. Esc pauses by not stepping the sim. |
| Headless CLI | `npm run sim` prints a JSON report per run including `simMs`, damage by source, and per-wave telemetry. |
| Fast-forward | 1x/2x/3x runs more fixed ticks per frame, never a longer tick, so a fast-forwarded run is bit-identical to the same run at 1x. Catch-up cap scales with the speed. |
| Practice runs | Opted into at the Hub. Kill all, +gold, +XP, heal, invulnerable, skip wave, +1 minute, summon boss — all ordinary Commands gated on `RunConfig.practice`, so they replay exactly. A run that used one banks nothing. |
| Tower panel | Derives damage/rate/DPS/range/splash/ailments, build/upgrade/sell prices, the soul and the terrain from the same helpers the sim fires with, for the selected tower or the one under the cursor. |
| Weapon panel | The Act II counterpart: per-soul tab strip, level table scaled by the live multipliers, what the next level buys, inherited damage, the reachable Awakening. |
| Stage progress | Act I: a bar over waves with a tick each, plus a bar for the active wave. Act II: a bar to the ten-minute boss with ticks on the director's real elite/rift schedule, a countdown, and an XP bar. |
| Test seeding | Settings can fill an account with 8 relics, 3 of each Orb and 600 Ember, or wipe it. Deterministic from the account's own next relic id. |

---

## 2. Deviations from SPEC.md

Ordered by how much they change the design. Full reasoning for each is in
QUESTIONS.md under the cited Q-number.

| # | SPEC says | Code does | Why |
|---|---|---|---|
| Q8 | Act II overlay is `HP × 0.6` of the roster | `HP × 0.6 × 3.5` (`actIICarry`) | Literal reading makes Nightfall fodder ~7× weaker than the wave-10 enemies just fought; the horde could not reach the Warden at all. |
| Q9/Q18 | "Piercing Bolt pierces all"; cones and fields uncapped | Damage decays per additional target (`pierceFalloff` 0.82, `aoeFalloff` 0.82 past 5 targets) | Uncapped multi-hit scales with horde size. Pierce was 86% of all damage; only Venom/Ember builds could hold a swarm. A5 is unreachable without this. |
| Q2 | "8 weapons" | 7 soul weapons + innate slotless **Warden's Arrow** | §4.2 only yields 7 souls. The innate weapon makes the count true and gives a minimum-tower build non-zero Act II damage, which A8 needs. |
| Q13 | 6 weapon slots, "if more than 6 types qualify, pick 6" | Slots exist and the picker works, but **can never bind** | Class locks cap any class at 5 soul-granting towers. Only Deep Roots (−1 slot) engages the picker. Needs a spec decision. |
| Q16 | Tower table states dps | Data stores damage-per-shot = dps × interval | Ember Brazier was authored literally and ran at 40 dps against a spec'd 10. |
| Q21 | Wave 9 = Burrower/Spitter/Wraith (§3.4) | Wave 9 = Burrower/Spitter/Wraith/**Gale Imp** | A7 calls wave 9 "the Burrower/Wraith/Imp wave"; §3.4 omits imps. |
| Q11 | Director spends its 10 s budget at once | Same budget accrued continuously; Rifts stay bursts | Burst spawning gave a stationary Warden quiet windows to heal through. |
| Q17 | — | Director warms up from 30% over 75 s | Without it Act II was decided in its first ten seconds, making it a coin flip rather than a test of the build. |
| Q12 | Core detonation clears a radius-2 pocket | Also blasts up to 4 lanes rim→Heartstone | A maze could otherwise seal the Heartstone, making a stationary Warden untouchable — which A7 forbids. |
| Q7 | "Core-damage → contact damage" | One contact hit per enemy per **0.4 s**, reach `radius + 0.45` | No rate is specified. At 1/s being surrounded was survivable indefinitely. |
| Q6 | "Enemies attack blocking walls" | Structure dps = `coreDamage × 3 × structureDamageMul` | No rate is specified. |
| Q10 | — | Gems fade after 18 s, hard cap 500 | Uncollected gems grew unbounded (16,000+ in one run) and made standing still free XP. |
| Q5 | Only Core death ends Act I | Warden reforms at the Core at 50% HP, 2 s invulnerable | §13.1 puts Act I stakes on the Core; a second death condition would change that. |
| Q4 | Bans `Math.random`/`Date.now` | Also bans native trig inside `/src/sim` | `Math.sin` etc. are implementation-defined; A11 promises 100/100 reproducibility. |
| Q14 | — | Warden base stats moved to `data/warden.json` | CLAUDE.md forbids tuning constants in code. |
| Q27 | — | Separation every 6 ticks, nav field every 12, bot heading every 3 | Separation alone was a third of sim time. Staggers are keyed on entity id and tick, never wall-clock. |
| Q15 | A5: "no weapon > 35% of total damage" | Measured across the **top-10 builds pooled**, not per build | A4 requires mono-tower builds to be viable, and such a build necessarily takes ~100% of its damage from one weapon. |
| Q22 | A1: 200 seeded sims | Suite measures 24; `tools/sweep.ts` does the full sweep | A full run takes ~4 s to simulate. |
| Q3 | 36×20, 3 gates, Core "near east-center" | Gates (0,10)/(18,0)/(35,17), Core (25,9)–(26,10) | Exact coordinates unspecified. |
| Q28 | "SFX hooks" | Synthesised cues behind an `AudioSink` seam | No audio assets exist. |
| Q29 | — | **Practice runs**: an in-run dev tool, gated on `RunConfig.practice`, flagged in the report, banking nothing | SPEC has no dev mode, and testing the late game meant playing eleven minutes to reach it. |
| Q30 | Act I `hpScalePerWave` 1.18 | **1.30** (was 1.35), with Ironhide +25%→**+45%** HP and Fleetfoot +20%→**+30%** speed | 1.35 made wave 10 a wall no DPS answered: light builds cleared 0/8 seeds, and A4's "fails at T3" was passing on the wave wall rather than on tier difficulty. |
| Q31 | — | Fast-forward 1x/2x/3x | Quality of life; implemented as more ticks per frame so determinism is untouched. |
| — | — | New accounts start with **400 Ember** | Testing convenience requested in playtest; set `tree.startingEmber` to 0 to restore a cold start. |
| — | Respec costs 5 Ember/node | Points spent in the current Hub visit come back **free** | A fresh account has 0 Ember and can only earn it by finishing a run, so the first misclick was permanent. |

---

## 3. Current `/data` tuning

### Towers (`data/towers.json`)
Tiers: damage ×1.6, range ×1.1 per tier. Upgrade cost T2 = 0.75× base, T3 = 1.25× base. Sell 70% (35% during Dusk). Build range 4 tiles.

| Tower | Cost | DPS | Interval | Range | Soul |
|---|---|---|---|---|---|
| palisade | 10 | — | — | — | — |
| arrow_spire | 50 | 11.0 | 0.5 | 5 | arrow_volley |
| ballista | 90 | 18.0 | 1.0 | 8 | piercing_bolt |
| ember_brazier | 70 | 18.0 | 0.25 | 3.5 | flame_cone |
| frost_obelisk | 70 | 22.0 | 1.0 | 3 | frost_nova |
| tesla_coil | 120 | 18.0 | 1.0 | 5 | chain_lightning |
| mortar | 130 | 43.2 | 2.2 | 10 (min 4) | mortar_lob |
| venom_spore | 75 | 4.0 + 15 dps poison ×3 | 1.0 | 4.5 | toxic_trail |
| beacon_totem | 60 | — | — | r3 aura | — |
| harvest_sprout | 40 | — | — | — | — |

Deviations from SPEC §3.3 initial values: Frost Obelisk 6→22 dps, cost 80→70, range 3 kept; Mortar 14→43 dps; Venom poison 8→15 dps; Ballista 20→18; Tesla 18 (unchanged); Arrow 12→11; Brazier 10→18.

### Weapons (`data/weapons.json`)
6 slots, max Lv 6, inheritance +8%/extra tower capped +40%.
Multi-hit damping: pierce ×0.82 per target (floor 0.20); blasts/cones/fields full damage to the nearest 5, then ×0.82 (floor 0.20).

| Weapon | Damage or DPS Lv1→Lv6 | Range Lv1→Lv6 | Interval Lv1→Lv6 |
|---|---|---|---|
| wardens_arrow | 9.6 → 23 | 5.6 → 7.5 | 0.60 → 0.35 |
| arrow_volley | 16 → 31 | 6.5 → 9.3 | 0.33 → 0.25 |
| piercing_bolt | 35.2 → 68 | 7.2 → 10.8 | 1.50 → 1.00 |
| flame_cone | 22.4 → 46 dps | 3.0 → 5.0 | continuous |
| frost_nova | 34 → 80 | radius 3.5 → 5.2 | 3.0 → 2.0 |
| chain_lightning | 40 → 93 | 6.4 → 9.5 | 1.00 → 0.70 |
| mortar_lob | 55 → 101.5 | 7.5 → 9.5 | 2.50 → 2.00 |
| toxic_trail | 4.8 → 17.4 dps | puddle r0.9 → 1.6 | 0.50 → 0.35 |

### Act I (`data/waves.json`)
`hpScalePerWave` **1.30** (SPEC: 1.18) · build phase **30 s** (SPEC: 20) · spawn interval **1.02 s** · start gold 250 · Core 500 HP · wave clear `50 + 10×wave` · early call 2 g/s · structure dps factor 3.
Wave 9: 6 burrower + 6 spitter + 4 wraith + 4 gale_imp **per gate** (18/18/12/12 total).

### Act II (`data/spawns.json`)
Budget `150 × 1.21^minute`, warm-up 0.25→1.0 over **100 s**, spent continuously.
`hpOverlay` 0.6 × `actIICarry` **3.2** · `hpScalePerMinute` 1.10 · `speedOverlay` 1.20.
Alive cap 350 · elite every 90 s · rifts at 180/360/540 s at ×3 budget · boss at 600 s.
Contact 0.4 s at reach `radius + 0.45` · gems live 18 s, cap 500 · burrowers surface within 3 tiles.

### Warden (`data/warden.json`)
100 HP · 0.5 regen/s · 0 armour (`reduction = a/(a+50)`) · 4.5 tiles/s · pickup 1.5 · dash 4 tiles / 3 s / 0.15 s i-frames · CDR cap 40% · Heartstone **1.0 HP/s** in r3 (SPEC: 5) · leech cap 3 HP/s.

### Meta
Tier reward `1 + 0.35×(N−1)`, 12 modifiers, tier N drafts N−1 of them 1-of-2.
Modifiers: Ironhide **+45% HP**, Fleetfoot **+30% speed**, Fourth Gate +1 gate, Long Watch +2 waves,
Short Arm −20% pickup, Brittle Stone −50% residuals, Elite Swarm ×2 elites, Rift Storm ×2 rifts,
Unseen Ways ×3 burrower/wraith weight, Titanic +50% boss HP, Hurried 10 s build, Cracked Core −150 HP.
Tree: 120 allocatable nodes + centre, 18 notables, 3 keystones, bounded radius 7.45, respec 5 Ember, max account level 60, Ember base 100, **starting Ember 400**.
XP to reach level n: `5n + n²`.

---

## 4. Measured metrics

72-run pool, seeds 1–8, engineer, auto-drafted modifiers. `tools/handoff-metrics.ts`.
Re-measured after the Q30 retune; the pre-retune numbers are in this file's git history.

### Win rate and run length

| Policy | Tier | Win | Median total | Median Act II survival | Act I cleared | Median level |
|---|---|---|---|---|---|---|
| maxbuild | 1 | **75%** | 25.5 min | 700 s | 8/8 | 45 |
| maxbuild | 3 | 38% | 27.0 min | 736 s | 7/8 | 44 |
| maxbuild | 5 | **13%** | 21.6 min | 555 s | 5/8 | 42 |
| hybrid | 1 | 63% | 25.5 min | 685 s | 8/8 | 42 |
| hybrid | 3 | 38% | 23.0 min | 641 s | 6/8 | 37 |
| hybrid | 5 | 0% | 17.3 min | 199 s | 8/8 | 22 |
| greedy | 1 | 75% | 26.2 min | 699 s | 8/8 | 44 |
| greedless | 1 | 50% | 25.7 min | 681 s | 8/8 | 44 |
| no-move | 1 | 0% | 16.3 min | 120 s | 8/8 | 4 |
| walloff | 1 | 0% | 15.0 min | 47 s | 8/8 | 3 |
| rush | 1 | 0% | 12.0 min | 30 s | 8/8 | 3 |
| turtle | 1 | 0% | 15.0 min | 16 s | 6/8 | 1 |
| kite | 1 | 0% | 9.5 min | 30 s | 8/8 | 4 |

Median victorious run across the pool: **25.96 min** (21 wins). SPEC A1 window is 24–28 min.

Two things moved with the Q30 retune. `kite` and `turtle` clear Act I again (8/8 and
6/8, from 0/8), which was the point. And T5 has a measured win for the first time
(maxbuild 13%, up from 0%) — the softer wave curve outweighed the stronger modifiers
at the top of the ladder, though T3 fell from 50% to 38%, so the ladder is flatter
rather than fixed.

### Weapon damage share
At minute 8 of Act II, pooled over the 22 runs that got there:

| Source | Share |
|---|---|
| piercing_bolt | **43.8%** |
| arrow_volley | 17.5% |
| mortar_lob | 15.8% |
| terrain_venom_spore (residual, not a weapon) | 9.3% |
| toxic_trail | 8.5% |
| wardens_arrow | 5.1% |

`flame_cone`, `frost_nova` and `chain_lightning` contribute ~0% here because no
policy in this pool builds their towers. On the A5 build set — twelve
deliberately varied mixes played with the `maxbuild` upgrade order —
piercing_bolt measures **33.9%**, which is what the A5 gate asserts against.
**Both numbers are real; the gate uses the diverse-build pool, and the honest
reading is that pierce is at or over the line whenever it is available.**

### Boon picks
Total ranks taken across 72 runs. **Read with care: the bot takes weapon
upgrades first and then card index 0, so this measures offer RNG, not
preference.** It is useful only as a check that the offer pool is even.

Fortune 64 · Magnet 58 · Focus 57 · Leech 56 · Greed 56 · Reach 52 · Haste 51 ·
Swift 50 · Vitality 49 · Power 46 · Plating 45 · Second Wind 24 (max rank 1).

Spread is 45–64 excluding Second Wind, i.e. flat within noise. There is no
measured signal about which boons a *player* would want.

---

## 5. QUESTIONS.md decisions

31 entries, **all still pending owner verdict**. Two verdict requests have been
made; both arrived carrying the example template rather than actual verdicts, so
nothing has been applied. Summary by theme:

**Spec gaps filled with a default** — Q3 map coordinates · Q5 Warden death in Act I ·
Q6 structure damage rate · Q7 contact damage rate · Q10 gem lifetime ·
Q14 Warden stats moved to data · Q28 SFX as synthesised cues.

**Spec internally inconsistent, resolved one way** — Q1 spec filename ·
Q2 "8 weapons" vs 7 souls · Q13 6 slots vs class locks (**unresolved, needs a
decision**) · Q16 dps vs damage-per-shot · Q21 wave 9 composition.

**Spec numbers that could not hit their own acceptance criteria** —
Q8 Act II overlay · Q9/Q18 multi-hit damping · Q11 director cadence ·
Q17 director warm-up · Q12 Sundering approach lanes · Q19/Q24 the ⚖ retunes.

**Test methodology** — Q15 how A5 is measured · Q22 A1 sample size ·
Q23 A3's bimodal median · Q25 A10 frame budget · Q26 A10 timing harness.

**Engineering choices with gameplay consequences** — Q4 no native trig ·
Q20 A4/A7 tension · Q27 staggered sim loops.

**Added after the second playtest** — Q29 practice runs bank nothing ·
Q30 the Act I curve and the two modifiers A4 drafts · Q31 fast-forward.

---

## 6. Known issues

### Skipped tests (2)
1. `tests/a3-movement-mandatory.test.ts` — *"every seed is dead by 3:00"*.
   Act II survival is bimodal: a stationary Warden either drowns around 115 s or
   snowballs XP to ~290 s. The median sits on that boundary and flips with any
   tuning change. The suite asserts the stable claims instead (always dies, never
   reaches the boss, ≥half die inside 3:00, moving survives several times longer).
2. `tests/a7-turtle-check.test.ts` — *"leaks at least 15% of wave 9"*.
   Measured 0–18% by seed. A tight ring of towers around the Core answers even
   the tunnellers. See Q20: A4 and A7 pull the same constant (burrow surface
   distance) in opposite directions.

### Live issues
- **The tier ladder is flat, not a ladder.** maxbuild wins 75% at T1, 38% at T3,
  13% at T5; hybrid wins 63% / 38% / 0%. The modifier draft is the only
  difficulty lever, and after Q30 it does not separate T3 from T5 in any orderly
  way. This is the single largest open design problem.
- **A4 and the tier ladder now share a lever.** Ironhide and Fleetfoot were
  strengthened so A4's "mono build fails at T3" holds on tier difficulty rather
  than on a wave-10 wall. That is the right reason for A4 to pass, but it means
  any future change to those two modifiers moves an acceptance gate.
- **Act II is bimodal for every policy.** Runs either die in the opening minute
  or snowball to the boss. Medians are noisy; prefer means or pass rates.
- **Piercing Bolt sits at or above the A5 line** whenever a build has it (43.7%
  on the policy pool, 33.9% on the diverse-build pool).
- **A5's sample is thin** — 22 of 72 runs reach minute 8.
- **The 6-slot Sundering choice never triggers** in normal play (Q13).
- **Ember economy is untested at scale.** Starting Ember is 400 for testing; no
  balance work has been done on the Ember→level→points curve.

---

## 7. Engineer's list: what is shallow or missing

My own assessment, most consequential first.

1. **Act I and Act II are coupled only through the Sundering formula, and that
   formula is thin.** Weapon level = highest tier of that tower; damage bonus =
   +8% per extra tower. Nothing about *where* you built, what you built next to
   what, or how you played. The pillar "placement is destiny" is only honoured by
   terrain geometry, not by the soul-binding maths.

2. **The tier ladder is flat, not a ladder.** Tier N = N−1 drafted modifiers is
   the entire scaling mechanism, and after the Q30 retune it produces 75% / 38% /
   13% across T1/T3/T5 — a slope, but not an orderly one, and hybrid still falls
   to 0% at T5 while maxbuild does not. There is no per-tier enemy scaling and no
   reward pacing that pulls a player up. Worse, two of the twelve modifiers are
   now load-bearing for acceptance gate A4, so the ladder cannot be retuned
   without moving a gate.

3. **Boon design is undifferentiated.** Twelve boons, eleven of which are flat
   stat percentages with no interaction, no build identity and no reason to
   prefer one over another at a given moment. The measured pick spread is flat
   because there is genuinely nothing to choose between.

4. **Only one weapon archetype actually holds a swarm.** Persistent AoE
   (toxic_trail, flame_cone) and high-multi-hit (piercing_bolt) carry Act II;
   single-target weapons are filler. I capped multi-hit damage to stop pierce
   dominating, which is a patch over a missing design: weapons have no roles
   (crowd / single-target / control / utility) that make each necessary.

5. **The Constellation is 120 nodes of the same three ideas.** Small nodes are
   +3% of something. Notables are +12% of something, mostly. Only the three
   keystones make a decision. A player has no build to plan toward.

6. **Enemy roster has traits but no rock-paper-scissors.** 20 enemies with
   distinct behaviours, but almost none of them demands a specific answer.
   Shellback's front shield, Mender's healing and Warlock's buff should reward
   specific tower choices; nothing in the game reads them.

7. **In-run information is now shown but not yet actionable.** The tower and
   weapon panels expose every stat the sim has, and the stage bar exposes the
   director's schedule. What is still missing is the part a player would act on:
   no per-tower damage contribution, no "this tower has killed nothing in three
   waves", no reason given when a placement is rejected beyond a red ghost.

8. **Relics are generated but barely matter.** Twelve affixes, all flat stat
   rolls, three slots, one implicit each. Crafting works but there is nothing to
   craft *toward* — no set behaviour, no affix interaction, no build-defining
   roll.

9. **Act I has no failure texture.** The Core either survives or does not.
   There is no partial loss, no resource pressure from leaks beyond HP, no
   reason to defend one lane over another. Leaks are a health bar, not a
   decision.

10. **The bots are the only "player" the balance has ever been tested against,
    and they are heuristics.** `maxbuild` spends gold in a fixed order;
    `kite` scores eight headings. Every balance number in §4 describes how those
    heuristics perform, not how a human plays. Treat A1–A11 as regression
    guards, not as evidence the game is fun.

**One structural note for v0.2:** the sim/render split and the data-driven
content pipeline both held up well. Anything expressed in `/data` is cheap to
change and covered by schema validation; anything expressed in `/src/sim` logic
is not. If v0.2 wants new mechanics (weapon roles, enemy counters, affix
interactions), specify them as data shapes and the engine work stays small.
