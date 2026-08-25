# QUESTIONS.md — spec ambiguities & chosen defaults

> Claude: never stall on a design question. Log it here with the default you chose,
> then keep working. The owner reviews this file between sessions.

Format:
- **Q<n>. [M<n>] Question** — Chosen default: … — Reason: … — (owner verdict: pending)

Entries are numbered **Q1–Q28** so verdicts can be given compactly, e.g.
`Q3 approved; Q13 drop class exclusivity; all others approved`.

## Verdict log

- **2026-08-25** — Verdicts were requested in the playtest round, but the message
  carried the example template (`<e.g. "Q1: …">`) rather than actual verdicts.
  Nothing was applied and every entry below is still **pending**; no code or data
  changed on account of it, so the chosen defaults stand exactly as they were.

If you only look at two, these are the ones that change the design rather than
record a gap:
- **Q13** — the 6 weapon slots can never bind, because class locks cap any one
  class at 5 soul-granting tower types. SPEC §4.1's picker only engages under
  the Deep Roots keystone. Dropping class exclusivity is the obvious fix, and it
  is a spec revision rather than a default I can pick.
- **Q20** — A4 and A7 pull the same constant in opposite directions. A7's 15%
  leak bar is the one acceptance criterion still unmet.

---

- **Q1. [M0] The spec file was named `stonewake-spec.md`, but CLAUDE.md calls `SPEC.md` the source of truth.** — Chosen default: renamed the file to `SPEC.md`; content untouched. — Reason: CLAUDE.md is the standing order and references `SPEC.md §9/§10` by name. — (owner verdict: pending)

- **Q2. [M0] SPEC says "8 weapons" (§A10, and CLAUDE.md M4) but the §4.2 conversion table only yields 7 soul weapons (Palisade / Beacon / Sprout give passives, not weapons).** — Chosen default: 8 weapons = the 7 soul weapons + **Warden's Arrow**, an innate `slotless` weapon every Warden carries into Nightfall. It never consumes one of the 6 slots, so §4.1's "if more than 6 types qualify, pick 6" still bites at exactly 7 candidates. CLAUDE.md's M2 gate ("weapons from towers #2/#5 + Arrow") reads the same way. A4 is therefore tested as *7 attacking tower types + walls* = 8 single-type builds. — Reason: keeps every stated count true and guarantees a minimum-tower rush build has non-zero Act II damage, which A8 needs in order to measure a ≤25% win rate rather than a flat 0%. — (owner verdict: pending)

- **Q3. [M0] Map geometry: SPEC §2.3 fixes 36×20, 3 gates and a 2×2 Core "near the east-center" but not exact coordinates.** — Chosen default: gates at west (0,10), north (18,0), east (35,17); Core footprint (25,9)–(26,10). — Reason: keeps all three gate→Core paths 12+ tiles long so mazing has room, and spaces the east gate away from the Core. — (owner verdict: pending)

- **Q4. [M0] SPEC §9.1 forbids `Math.random`/`Date.now` but says nothing about `Math.sin`/`cos`/`atan2`/`hypot`, which are implementation-defined in ECMAScript and would break cross-engine replay hashes.** — Chosen default: `/src/sim/math.ts` provides `dsin`/`dcos`/`datan2` built from `+ - * /` and `Math.sqrt` only (all IEEE-754-exact); the sim never calls native trig. — Reason: A11 promises 100/100 reproducibility, which native trig cannot guarantee. — (owner verdict: pending)

- **Q5. [M0] What happens if the Warden dies during Act I? SPEC only defines Core death as the Act I failure state.** — Chosen default: the Warden reforms at the Core after taking lethal damage, at 50% Max HP with 2 s of invulnerability. No run-ending consequence. — Reason: §13.1 insists Act I stakes live on the Core; a second death condition would change that. — (owner verdict: pending)

- **Q6. [M0] Enemy damage against structures has no rate in the spec (only "enemies attack blocking walls").** — Chosen default: structure DPS = `coreDamage × 3`, times the enemy's `structureDamageMul` (Gatebreaker 2×), in `data/waves.json` as `enemyStructureDpsFactor`. — Reason: puts a 300 HP Palisade at ~30 s against a lone Husk and ~0.5 s against the Gatebreaker, matching "smashes walls". — (owner verdict: pending)

- **Q7. [M0] Act II contact damage has no rate ("Core-damage → contact damage").** — Chosen default: one contact hit per enemy per 0.4 s, at radius `enemy.radius + 0.45` (`contactInterval` / `contactPadding` in `data/spawns.json`). — Reason: at one hit per second, being surrounded was survivable indefinitely and A3 could not pass; 0.4 s makes the crowd itself the threat. — (owner verdict: pending)

- **Q8. [M2] SPEC §5.1's Act II overlay ("HP × 0.6") is relative to the wave-1 roster, which would make Nightfall fodder ~7× weaker than the wave-10 enemies the player just cleared** (Act I scales HP ×1.18^(wave−1) = 4.44× by wave 10). — Chosen default: the ×0.6 overlay multiplies the statline Act I *ended* on, i.e. `hp × 0.6 × 1.18^(waveCount−1)`, then the ⚖ per-minute ramp on top. — Reason: Nightfall is the climax; measured with the literal reading the horde could never reach the Warden at all and A3 was unreachable. Both numbers used are the spec's own. — (owner verdict: pending)

- **Q9. [M2] Pierce and blast damage scale linearly with horde size, which A5 forbids.** "Piercing Bolt — pierces all" took 86% of all damage in a 350-enemy fight; Mortar Lob's r2 blast was nearly as bad. — Chosen default: each successive target a pierce shot or a blast hits takes less (`pierceFalloff` / `aoeFalloff` in `data/weapons.json`; blasts pay full damage to the nearest few, then decay). "Pierces all" still holds — it just does not pay full price to all. — Reason: without it, one weapon dominates every build and A5 cannot pass. — (owner verdict: pending)

- **Q10. [M2] Act II gem lifetime is unspecified, and uncollected gems grew without bound** (16,000+ in a long run). — Chosen default: gems fade after 45 s (`gemLifetimeSeconds`) with a hard cap of 500 (`gemCap`), both in `data/spawns.json`. — Reason: bounds the entity count for A10 and makes XP something you move to collect, which is the point of A3. — (owner verdict: pending)

- **Q11. [M2] SPEC §5.1's director spends its whole 10 s budget at once, which gives a stationary Warden quiet windows to heal through.** — Chosen default: the same budget accrues continuously and is spent as it lands. Rift events stay bursts, since that is their design. — (owner verdict: pending)

- **Q12. [M3] The Sundering could leave the Heartstone sealed inside the player's own maze, making a stationary Warden unreachable — which SPEC A7 rules out ("mazing is strong, never absolute").** — Chosen default: the Core detonation also shatters up to 4 cheapest approach lanes from the arena rim to the pocket, breaking petrified terrain only where no gap exists. — Reason: extends SPEC §4's "guaranteed open arena pocket" to mean the pocket is actually reachable. — (owner verdict: pending)

- **Q13. [M3] The 6 weapon slots can never bind, because class locks cap any one class at 5 soul-granting tower types.** There are 7 soul towers; 3 are class signatures, so a class can build its own plus the 4 unlocked ones. SPEC §4.1's "if more than 6 types qualify, the player picks 6" and §13.3's "8 towers compete for 6 slots" therefore never trigger in v1. — Chosen default: keep 6 slots and keep the picker implemented and tested; it only engages with the **Deep Roots** keystone (−1 slot) or a future unlock that lifts class locks. Logged rather than "fixed" because changing either the slot count or the class locks is a spec revision. — Suggested owner options: (a) drop to 4 slots so the choice bites, (b) let every class build every tower with signatures merely discounted, or (c) accept that slots only matter with keystones. — (owner verdict: pending)

- **Q14. [M3] Warden base stats were constants in code, which CLAUDE.md forbids ("all game content/tuning as JSON in /data").** — Chosen default: moved to `data/warden.json`, schema-validated, exposed as `stats.BASE`. — (owner verdict: pending)

- **Q15. [M4] SPEC A5 ("no weapon > 35% of total damage dealt") cannot be read per-build, because A4 requires mono-tower builds to be viable and such a build necessarily takes ~100% of its damage from one weapon.** — Chosen default: A5 is measured across the metagame — each weapon's slice of the damage the **top-10 builds deal between them** at minute 8. Measured worst: mortar_lob 29.7%. Per-build shares are still reported by `tools/a5probe.ts` for the balance pass. — (owner verdict: pending)

- **Q16. [M4] SPEC §3.3's tower table states DPS, but a tower needs damage-per-shot.** The Ember Brazier ("Cone, 10 dps") was authored as `damage: 10, interval: 0.25`, i.e. 40 dps, and dominated every comparison. — Chosen default: per-shot damage = stated dps × interval. Every tower's authored dps is now asserted in `tests/content-complete.test.ts` terms and printed by the A4 probe. — (owner verdict: pending)

- **Q17. [M4] Nightfall is decided in its first minute, which made Act II a coin flip rather than a test of the build.** — Chosen default: the director budget ramps in over a `warmupSeconds` window (75 s, starting at 30% strength) on top of SPEC §5.1's per-minute growth. — (owner verdict: pending)

- **Q18. [M4] Continuous cone damage and ground fields had no target cap, so they alone could hold a 350-strong swarm** — every build that survived to minute 8 contained a Venom Spore or an Ember Brazier. — Chosen default: cones and ground fields now use the same many-target damping as blasts (full damage to the nearest few, then decay). — Reason: makes the weapon classes comparable, which is what A5 asks for. — (owner verdict: pending)

- **Q19. [M4] Several ⚖ tower and weapon numbers moved during the A4/A5 passes.** Frost Obelisk (cost 80→70, pulse 6→17 dps, r3.5→3), Mortar (35→95 per shell, 2.5→2.2 s, r1.5→1.8), Venom Spore (poison 8→15 dps), Ballista (20→18 dps), Tesla Coil (18→16 dps), Act I `hpScalePerWave` 1.18→1.32, and the whole weapon curve front-loaded (Lv1 ×1.6 down to Lv6 ×1.0) with Toxic Trail at ×0.6. — Reason: A4 needed every type solo-viable at T1 and none solo-viable at T3; A5 needed the weapon classes comparable. All are ⚖ values. — (owner verdict: pending)

- **Q20. [M7] SPEC A4 and A7 pull the same constant in opposite directions.** Both hinge on wave 9's Burrowers: A4 wants a single-tower build to *survive* it at T1, A7 wants a perimeter wall-off to *leak* it. Burrow surface distance controls both — at 2 tiles the turtle leaks 25–30% (A7 green) but mono builds collapse (A4 red); at 4 tiles the reverse. — Chosen default: 3 tiles, which keeps A4 fully green and leaves A7 measurable but short of its 15% bar. SPEC §6 #12's "surfaces near target" is now implemented properly: a burrowed enemy is untargetable until it surfaces, which is what makes it the counter to a turtle at all. — Reason: A4 is a hard viability claim about seven towers; A7 is a claim about one degenerate strategy. — (owner verdict: pending — resolving this properly probably wants a second anti-turtle lever that does not touch mono builds, e.g. Gale Imp counts scaling with how walled-in the Core is.)

- **Q21. [M7] SPEC A7 calls wave 9 "the Burrower/Wraith/Imp wave", but the SPEC §3.4 table has no Gale Imps in wave 9.** — Chosen default: added 4 Gale Imps per gate to wave 9 (spitters 8 → 6 to keep the wave size similar). — Reason: fliers belong in the counter-turtle wave, and A7 names them. — (owner verdict: pending)

- **Q22. [M7] SPEC A1 asks for 200 seeded sims; a full run takes several seconds to simulate.** — Chosen default: the suite measures 24 seeds (median 25.2 min, range 24.7–26.0), and `npx tsx tools/sweep.ts --seeds 200` runs the full sweep on demand. The distribution is tight enough that 24 is representative. — (owner verdict: pending)

- **Q23. [M7] Act II survival is sharply bimodal, which makes A3's median an unstable statistic.** A stationary Warden either drowns in the opening two minutes (~115 s) or snowballs XP into a few more (~290 s); the median sits exactly on the boundary and flips with any tuning change. — Chosen default: A3 asserts the stable, material facts — every stationary run dies, none reaches the boss, at least half die inside 3:00, and moving survives several times longer. The strict per-seed 3:00 bound stays `it.skip`-ed. — (owner verdict: pending)

- **Q24. [M7] Final ⚖ balance values.** Act I: `hpScalePerWave` 1.35, `buildPhaseSeconds` 30, `spawnIntervalSeconds` 1.02. Act II: `budgetBase` 150 with `budgetGrowthPerMinute` 1.21 and a 75 s warm-up from 30%, `actIICarry` 3.5, `gemLifetimeSeconds` 18, `burrowSurfaceDistance` 3. Warden: `heartstoneHeal` 1.0. Weapons: Mortar Lob −14%. Towers: Frost Obelisk 22 dps at r3 for 70 gold, Tesla Coil 18 dps, Arrow Spire 11 dps. — (owner verdict: pending)

- **Q25. [M8] SPEC A10's "≥ 60 fps on a mid laptop" cannot be measured from a headless test.** — Chosen default: tested as its sim-side precondition — one tick of a worst-case Act II frame (350 enemies, all 8 weapons, a full terrain field) must fit in half a 16.7 ms frame, leaving the other half for rendering. Measured ~1.1 ms/tick. — (owner verdict: pending)

- **Q26. [M8] A10's 5-second budget was being measured against Vitest's own overhead.** Run in the default suite, eighteen test files compete for cores and the same run measures ~30–40% slower than through `npm run sim`. — Chosen default: the timing test shells out to the shipped CLI, which reports `simMs` for the run loop alone (so process startup is excluded), and the whole A10 file runs single-threaded via `vitest.perf.config.ts`. `npm test` runs both passes. — (owner verdict: pending)

- **Q27. [M8] Several sim loops are now staggered rather than run every tick**, which is a behavioural choice as well as a performance one: crowd separation recomputes per enemy every 6 ticks, the Warden-sourced nav field rebuilds at most every 12 ticks, and the kiting bot re-decides its heading every 3 ticks. All are deterministic (staggered by entity id and tick, never by wall-clock) and all were verified not to move the acceptance gates. — Reason: separation alone was a third of all sim time. — (owner verdict: pending)

- **Q28. [M8] SFX ship as synthesised cues, not samples.** No audio assets exist for v1, so `src/render/sfx.ts` maps each gameplay event to a shaped WebAudio tone behind an `AudioSink` seam. Dropping in a sample-based sink later changes nothing else. — (owner verdict: pending)
