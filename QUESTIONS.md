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

- **[M0] Act II contact damage has no rate ("Core-damage → contact damage").** — Chosen default: one contact hit per enemy per 1.0 s, at radius `enemy.radius + 0.35`; both in `data/spawns.json`. — (owner verdict: pending)
