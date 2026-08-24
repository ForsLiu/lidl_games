# PROGRESS.md — Stonewake status

> Claude: keep this file current. Update at every milestone gate and before any stop.
> A fresh session should be able to resume from this file + CLAUDE.md alone.

## Current state
- **Milestone:** M1 complete — gates A11, A2 green
- **Last session:** 2026-08-24
- **Next action:** M2 — Act II survivors core (weapons, spawn director, XP, gate A3)

## Milestone checklist
- [x] M0 — sim skeleton + headless CLI (gate A11)
- [x] M1 — Act I tower-defense core (gate A2)
- [ ] M2 — Act II survivors core (gate A3)
- [ ] M3 — the Sundering, first full loop (gate A6)
- [ ] M4 — full content pass (gates A4, A5)
- [ ] M5 — meta layer: relics, tree, classes, tiers (gate A8)
- [ ] M6 — final boss, Awakenings, Rifts
- [ ] M7 — balance sweeps green (A1–A9)
- [ ] M8 — feel + ship (gate A10)

## Layout
```
data/           all tuning + content as JSON (schema-validated in src/sim/content.ts)
src/sim/        deterministic core: no DOM, no Math.random, no Date.now, no native trig
src/bots/       scripted headless policies (idle | turtle | kite | hybrid | no-move)
src/render/     canvas renderer (reads sim state only)
src/ui/         browser entry point
tools/sim.ts    headless CLI -> JSON report
tools/gen-tree.mjs  regenerates data/tree.json (120-node Constellation)
tests/          vitest; acceptance tests are named aNN-*.test.ts
```

## M0 — done
- Vite + TS + Vitest + Zod scaffold; `npm test`, `npm run sim`, `npm run build` wired.
- Seeded RNG with the five named streams (`waves/spawns/drops/offers/ai`), mulberry32 core.
- Deterministic math module (`dsin`/`dcos`/`datan2`) so no native trig enters the sim.
- 36×20 Bastion Vale grid; integer-cost Dijkstra flow fields (ground + ghost);
  path-guarantee check (`wouldBlockPath`) with state restore.
- World/entity model, spatial hash, fixed 60 Hz phase machine, Warden movement +
  dash + Act I manual attack, wave spawning, Core damage/defeat, end-state hashing.
- All 11 data files authored and cross-validated at load (towers, enemies, waves,
  weapons, spawns, boons, relics, tree, modifiers, classes, quests).
- Headless CLI with seed sweeps and summaries.
- **Gate A11 green**: 100 seeds × (run, replay) produce identical end-state hashes.

## M1 — done
- Combat primitives shared by both acts: projectiles, AoE, cones, pierce lines, chains,
  ground areas, first-target selection, cluster/line direction search.
- All 10 tower attack kinds implemented data-driven (single/pierce/cone/aura/chain/lob/poison),
  three tiers with the SPEC cost curve, Beacon attack-speed auras, Harvest Sprout income.
- Build/upgrade/sell commands enforcing tile legality, build range, gold, class locks
  and the path-guarantee rule; early wave call pays 2 gold per second skipped.
- Enemy traits live: armour, front shields, healers, buffers, splitters, bombers,
  burrowers, phasing wraiths, chargers, stomps, ranged spitters, fire trails.
- Bot policies `idle | turtle | kite | hybrid | no-move` with lane-adjacent
  build-site ranking; `hybrid` clears all 10 waves at T1.
- **Gate A2 green**: idle play loses the Core on wave 3-4 across 25 seeds.

## Known issues / skipped tests
(none)

## Session log (newest first)
- 2026-08-24 — Scaffolded the project, authored `/data`, built the M0 sim skeleton.
  A11 passing. Next: M1.
