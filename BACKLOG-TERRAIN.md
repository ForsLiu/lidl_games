# BACKLOG-TERRAIN.md — lane: terrain (branch `lane/terrain`)

Split out of BACKLOG.md on 2026-09-03; ids unchanged. Same item format,
working rules, verification tier (targeted tests + `npm run test:fast`) and
loop-mode contract as BACKLOG.md, plus CLAUDE.md's lane rule: up to TWO
items per iteration when both are small ([bug]/[polish] or data-only).
Everything touching shared sim core (balance orders, dash, density,
pathing, damage rules) belongs in BACKLOG.md, not here.

## Scope (hard boundary)

May create/edit ONLY:
- `src/sim/terrain/**` (new directory)
- `data/terrain.json` (new file)
- `tests/terrain*`
- the single integration-point file listed in the Log below (grid/pathing
  hook), kept to a minimal hook and reviewed at the lane merge
- this file

Read anything. Everything else is read-only: an out-of-scope need is
written into the Log below and becomes main-lane (or other-lane) work at
the merge — never edited from this lane.

## Queue

- [ ] (fb064) [feat] normal priority (epic — split into sub-items as
      needed when picked up): random terrain generation per run seed, plus
      player-chosen Core placement before wave 1. New data-driven tile
      types on the existing square collision grid (normal
      walkable+buildable; rough walkable-only; rock/wall blocks pathing,
      character still passes per fb002; high ground buildable and immune
      to ground-melee targeting, per the owner's designer notes on
      Burrower/ranged/flier/boss exceptions). Core placement: click any
      legal normal tile (not within 3 tiles of a gate, reachable from
      every gate) to place the 2x2 Core, with a pre-highlighted default
      suggestion. Generation constraints property-tested across 1000
      seeds per the owner's exact bands (gates never enclosed; >=60% ⚖
      walkable, >=45% ⚖ buildable-normal; gates reach >=80% ⚖ of walkable
      area; legal Core positions >=15% ⚖ of normal tiles; no sub-2-tile
      forced corridors on gate mains; deterministic from seed, hashed).
      Acceptance: property tests hold across the 1000-seed sweep; Core
      placement flow works end to end; high-ground protection rules
      tested; a degenerate seed regenerates deterministically (seed+1)
      rather than shipping an illegal map; pathing/flow-field costs, the
      sealing rule, path indicators, the Tuner's new terrain page and
      Training Grounds' flat-arena override all still work — refs:
      SPEC-FINAL new §10.5 (append), §14 (extend G2's determinism scope to
      generation), owner feedback `feature-terrain-generation`.

## Log

- (2026-09-03, lane split) Integration-point file for the merge:
  `src/sim/grid.ts` — the grid/pathing hook where generated tile types
  plug into the existing square collision grid and flow-field costs. Keep
  the edit there minimal and additive; if investigation shows the real
  hook belongs in a different single file, replace this entry with the
  actual file and the reason before editing it. Core-placement Commands,
  Tuner terrain page, and Training Grounds' flat-arena override are
  expected out-of-scope needs — log them as they surface.
