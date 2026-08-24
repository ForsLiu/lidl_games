# CLAUDE.md — Stonewake (standing orders)

## What this is
Stonewake: a run-based Tower Defense → Survivors hybrid with PoE-style meta progression.
The complete requirements live in **SPEC.md — it is the source of truth** for all design
questions. Do not redesign systems SPEC.md defines. Fill genuine gaps with the most
SPEC-consistent default and log the decision in QUESTIONS.md.

## Stack
- TypeScript + Vite, HTML5 canvas renderer (no game engine).
- Vitest for all tests. Zod for schema validation.
- All game content/tuning as JSON in `/data`, never inline in code.
- Node 22+, npm.

## Commands
- `npm run dev` — dev server
- `npm test` — full suite (must be green before any commit)
- `npm run sim -- --seed 1 --policy hybrid` — headless run, prints JSON report
- `npm run build` — production build

## Architecture rules (hard constraints, from SPEC.md §9)
1. Sim/render split: `/src/sim` contains zero DOM access, zero `Math.random`, zero
   `Date.now`. Fixed 60 Hz timestep. `/src/render` only reads sim state.
2. Seeded RNG with named streams: `waves`, `spawns`, `drops`, `offers`, `ai`.
3. Every run reproducible from seed + input log; a determinism test hashes end state.
4. Bot policies for headless play: `idle`, `turtle`, `kite`, `hybrid` (simple heuristics).

## Working rules
1. Work through milestones M0→M8 **in order**. Never start a milestone while the
   previous one's gate tests are red.
2. Run `npm test` after every meaningful change; fix before continuing.
3. Commit at every milestone gate (`M<n>: <summary>`) and at any stable point
   roughly every 30–60 minutes of work.
4. Update PROGRESS.md at every milestone gate and before stopping for any reason:
   what was done, what's next, known issues.
5. Never stop to ask a design question. Pick the most SPEC-consistent default,
   implement it, append question + chosen default to QUESTIONS.md, continue.
6. Stuck on the same failing test after ~5 distinct attempts: mark it `.skip` with a
   TODO, record it under Known issues in PROGRESS.md, move on. Never delete tests
   to make the suite pass.
7. Touch nothing outside this repository directory.

## Milestones and gates (acceptance tests A1–A11 defined in SPEC.md §10)
- **M0** Sim skeleton: loop, seeded RNG, grid, entities, headless CLI. Gate: A11.
- **M1** Act I core: flow-field pathing + path-guarantee rule, towers #1/#2/#5,
  enemies #1–#5, waves 1–5, gold economy, Core damage/defeat. Gate: A2.
- **M2** Act II core: WASD movement, dash, weapons from towers #2/#5 + Arrow,
  spawn director, XP gems, level-up picks. Gate: A3.
- **M3** The Sundering: petrification/conversion table, weapon inheritance formula,
  6-slot picker, Heartstone. First full loop playable in browser. Gate: A6 and a
  full-loop headless run completing.
- **M4** Full content pass: all 10 towers + 8 weapons, 20 enemies, waves 1–10,
  Gatebreaker, 12 boons, elites, relic drops. Gate: A4, A5.
- **M5** Meta layer: relic stash + 3 orbs, 120-node Constellation, 3 classes,
  8 quests, map tiers T1–T5 with 12 modifiers, save/load. Gate: A8 + save/load
  round-trip test.
- **M6** Warden-Eater boss (3 phases), 3 Awakenings, Rift events. Gate: scripted
  boss-kill sim succeeds.
- **M7** Balance: run seeded sweeps, tune `/data` only, until A1–A9 all green.
- **M8** Feel + ship: hit flash, damage numbers, screenshake, SFX hooks, settings,
  results screen; `npm run build` works. Gate: A10 + M8 checklist in PROGRESS.md.

## Definition of "first complete version"
All SPEC.md §10 acceptance tests green, `npm run build` produces a playable build,
PROGRESS.md M8 checklist fully ticked.
