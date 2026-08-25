# QUESTIONS.md — spec ambiguities & chosen defaults

> Claude: never stall on a design question. Log it here with the default you chose,
> then keep working. The owner reviews this file between sessions.

Format:
- **[M\<n\>] Question** — Chosen default: … — Reason: … — (owner verdict: pending)

---

- **[M0] The spec file was named `stonewake-spec.md`, but CLAUDE.md calls `SPEC.md` the source of truth.** — Chosen default: renamed the file to `SPEC.md`; content untouched. — Reason: CLAUDE.md is the standing order and references `SPEC.md §9/§10` by name. — (owner verdict: pending)

- **[M0] SPEC says "8 weapons" (§A10, and CLAUDE.md M4) but the §4.2 conversion table only yields 7 soul weapons (Palisade / Beacon / Sprout give passives, not weapons).** — Chosen default: 8 weapons = the 7 soul weapons + **Warden's Arrow**, an innate `slotless` weapon every Warden carries into Nightfall. It never consumes one of the 6 slots, so §4.1's "if more than 6 types qualify, pick 6" still bites at exactly 7 candidates. CLAUDE.md's M2 gate ("weapons from towers #2/#5 + Arrow") reads the same way. A4 is therefore tested as *7 attacking tower types + walls* = 8 single-type builds. — Reason: keeps every stated count true and guarantees a minimum-tower rush build has non-zero Act II damage, which A8 needs in order to measure a ≤25% win rate rather than a flat 0%. — (owner verdict: pending)

- **[M0] Map geometry: SPEC §2.3 fixes 36×20, 3 gates and a 2×2 Core "near the east-center" but not exact coordinates.** — Chosen default: gates at west (0,10), north (18,0), east (35,17); Core footprint (25,9)–(26,10). — Reason: keeps all three gate→Core paths 12+ tiles long so mazing has room, and spaces the east gate away from the Core. — (owner verdict: pending)

- **[M0] SPEC §9.1 forbids `Math.random`/`Date.now` but says nothing about `Math.sin`/`cos`/`atan2`/`hypot`, which are implementation-defined in ECMAScript and would break cross-engine replay hashes.** — Chosen default: `/src/sim/math.ts` provides `dsin`/`dcos`/`datan2` built from `+ - * /` and `Math.sqrt` only (all IEEE-754-exact); the sim never calls native trig. — Reason: A11 promises 100/100 reproducibility, which native trig cannot guarantee. — (owner verdict: pending)

- **[M0] What happens if the Warden dies during Act I? SPEC only defines Core death as the Act I failure state.** — Chosen default: the Warden reforms at the Core after taking lethal damage, at 50% Max HP with 2 s of invulnerability. No run-ending consequence. — Reason: §13.1 insists Act I stakes live on the Core; a second death condition would change that. — (owner verdict: pending)

- **[M0] Enemy damage against structures has no rate in the spec (only "enemies attack blocking walls").** — Chosen default: structure DPS = `coreDamage × 3`, times the enemy's `structureDamageMul` (Gatebreaker 2×), in `data/waves.json` as `enemyStructureDpsFactor`. — Reason: puts a 300 HP Palisade at ~30 s against a lone Husk and ~0.5 s against the Gatebreaker, matching "smashes walls". — (owner verdict: pending)

- **[M0] Act II contact damage has no rate ("Core-damage → contact damage").** — Chosen default: one contact hit per enemy per 0.4 s, at radius `enemy.radius + 0.45` (`contactInterval` / `contactPadding` in `data/spawns.json`). — Reason: at one hit per second, being surrounded was survivable indefinitely and A3 could not pass; 0.4 s makes the crowd itself the threat. — (owner verdict: pending)

- **[M2] SPEC §5.1's Act II overlay ("HP × 0.6") is relative to the wave-1 roster, which would make Nightfall fodder ~7× weaker than the wave-10 enemies the player just cleared** (Act I scales HP ×1.18^(wave−1) = 4.44× by wave 10). — Chosen default: the ×0.6 overlay multiplies the statline Act I *ended* on, i.e. `hp × 0.6 × 1.18^(waveCount−1)`, then the ⚖ per-minute ramp on top. — Reason: Nightfall is the climax; measured with the literal reading the horde could never reach the Warden at all and A3 was unreachable. Both numbers used are the spec's own. — (owner verdict: pending)

- **[M2] Pierce and blast damage scale linearly with horde size, which A5 forbids.** "Piercing Bolt — pierces all" took 86% of all damage in a 350-enemy fight; Mortar Lob's r2 blast was nearly as bad. — Chosen default: each successive target a pierce shot or a blast hits takes less (`pierceFalloff` / `aoeFalloff` in `data/weapons.json`; blasts pay full damage to the nearest few, then decay). "Pierces all" still holds — it just does not pay full price to all. — Reason: without it, one weapon dominates every build and A5 cannot pass. — (owner verdict: pending)

- **[M2] Act II gem lifetime is unspecified, and uncollected gems grew without bound** (16,000+ in a long run). — Chosen default: gems fade after 45 s (`gemLifetimeSeconds`) with a hard cap of 500 (`gemCap`), both in `data/spawns.json`. — Reason: bounds the entity count for A10 and makes XP something you move to collect, which is the point of A3. — (owner verdict: pending)

- **[M2] SPEC §5.1's director spends its whole 10 s budget at once, which gives a stationary Warden quiet windows to heal through.** — Chosen default: the same budget accrues continuously and is spent as it lands. Rift events stay bursts, since that is their design. — (owner verdict: pending)

- **[M3] The Sundering could leave the Heartstone sealed inside the player's own maze, making a stationary Warden unreachable — which SPEC A7 rules out ("mazing is strong, never absolute").** — Chosen default: the Core detonation also shatters up to 4 cheapest approach lanes from the arena rim to the pocket, breaking petrified terrain only where no gap exists. — Reason: extends SPEC §4's "guaranteed open arena pocket" to mean the pocket is actually reachable. — (owner verdict: pending)

- **[M3] The 6 weapon slots can never bind, because class locks cap any one class at 5 soul-granting tower types.** There are 7 soul towers; 3 are class signatures, so a class can build its own plus the 4 unlocked ones. SPEC §4.1's "if more than 6 types qualify, the player picks 6" and §13.3's "8 towers compete for 6 slots" therefore never trigger in v1. — Chosen default: keep 6 slots and keep the picker implemented and tested; it only engages with the **Deep Roots** keystone (−1 slot) or a future unlock that lifts class locks. Logged rather than "fixed" because changing either the slot count or the class locks is a spec revision. — Suggested owner options: (a) drop to 4 slots so the choice bites, (b) let every class build every tower with signatures merely discounted, or (c) accept that slots only matter with keystones. — (owner verdict: pending)

- **[M3] Warden base stats were constants in code, which CLAUDE.md forbids ("all game content/tuning as JSON in /data").** — Chosen default: moved to `data/warden.json`, schema-validated, exposed as `stats.BASE`. — (owner verdict: pending)
