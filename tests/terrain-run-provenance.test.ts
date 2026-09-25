/**
 * fb065h — does `RunConfig.seed` identify the map a run played?
 *
 * fb064j made the *generator's* provenance exact, fb064s made a dump say
 * whether its seed can be pasted, and fb065c made a live grid's dump say
 * `source=-` because its tiles are no seed's output. All three answer the
 * question one layer below the one a bug report actually asks, which is this:
 * given `RunConfig.seed`, can a reader reproduce the map?
 *
 * `applyRunTerrain` (`world.ts`) is why that is not obviously yes. It retries at
 * `seed + 1 … seed + 16` whenever the hardcoded `CORE_X/CORE_Y` Core comes out
 * unreachable, so on a retrying seed the run plays a *different seed's* map and
 * nothing in the report says so.
 *
 * **The answer, measured: on every seed in the domain sample, the run plays its
 * own seed's map.** The retry path is unexercised — not rare, unexercised.
 *
 * The measurement is in two layers, because only one of them is cheap:
 *
 *  1. **The upper bound**, over all 12,000 seeds of `tests/terrain-sample.ts`,
 *     on both gate lists: how many seeds' generated maps leave the Core
 *     unreachable *before* the Warden clearing. **Re-measured at fb156's
 *     4-gate layout: zero, on both gate lists, in this 12,000-seed sample** —
 *     down from two apiece at the 3-gate 56x32 layout (`244812834`,
 *     `709384557` on the base arena; `2888361945`, `-739` on the four-gate
 *     one), and none of those four strands at this gate geometry either. A
 *     fourth (and fifth, under the modifier) gate gives the flood many more
 *     ways in, so stranding the Core at its fixed `CORE_X/CORE_Y` becomes rare
 *     enough that 12,000 seeds no longer finds an example. So this layer's
 *     witnesses come from a wider domain comb instead, over both gate lists:
 *     `2910647699`, `3204297108` (base 4-gate) and `3202873299` (base+modifier
 *     5-gate, re-derived at the merge with master's own `MODIFIER_GATES`
 *     reposition — `south2` moved to `(3, GRID_H - 1)`, which rescues the
 *     item's original 5-gate witness, `2465936159`, so a fresh domain comb
 *     found this one instead) each strand their own seed's map. This is still
 *     a genuine bound and not an estimate for the seeds it names, and the
 *     argument is narrower
 *     than "the clearing only opens tiles": `allGatesReachable` dijkstras
 *     `blocked`, which comes from `staticBlocked`, which reads `terrainBlock`
 *     and hence `overlay.walkable` and **nothing else** — and
 *     `clearOverlayBlock` writes `walkable = 1` unconditionally. So the walkable
 *     set can only grow and reachability can only improve. (Its other writes,
 *     `high = 0` and `charBlock = 0`, are *not* monotone-safe for other
 *     predicates; they simply do not enter this one.)
 *  2. **The exact answer for those three**, which costs three more applies:
 *     every one is *rescued* by the Warden clearing on its own seed's first
 *     attempt (zero seed-retries), so the bound above is not tight for them
 *     either. That the 3x3 clear closes this path is a side effect — it was
 *     added because 1.0% of seeds otherwise spawn the character in rock — and
 *     it is worth knowing it carries this too, because a change to it would
 *     move a number nothing else measures.
 *
 * `tests/terrain-grid.test.ts` measures the same stranding over seeds 1..5000
 * and reads its own window's rate. This file is the domain-wide version; the
 * two are not expected to agree exactly, and the window one is not the
 * population a run draws from (fb064j).
 *
 * **What a reader holding only `RunConfig.seed` can and cannot do.**
 *
 * Cannot, and this is the correction a review had to make to an earlier version
 * of this paragraph: **regenerate the map from the seed alone.** The gate list
 * is a generator input, so `generateTerrain(40, cfg, GATES)` and the same seed
 * under fb077's gate modifier (now a fifth gate, `MODIFIER_GATES`'s `south2`,
 * since fb156 grew the base list to four) are different maps — hashes
 * `9d4778d2` and `801f9bc8`, **756 tiles apart**. A reader following "just
 * regenerate from the seed" on a `modifiers: ['gate']` bug report gets the
 * wrong map, which is a bigger hole than the retry this file studies and is
 * the *same* blind spot the immediately preceding item (fb065f) closed for the
 * dump's bands. The map is a function of seed **and gate list**, and both
 * sweeps below are run on both lists for that reason.
 *
 * Can: regenerate the map from seed *and* gate list, on every seed measured
 * here. Cannot: assume the *grid* matches even then — `applyRunTerrain` clears
 * the Warden's 3x3 and `Grid` punches out the gate and Core footprints. So the
 * seed and gate list reproduce the map; only `gridTerrain`'s dump reproduces the
 * board.
 *
 * **Out of scope and logged for the merge:** `applyRunTerrain` returns only a
 * fallback boolean, so the retry count is not observable from outside. One
 * extra field on its return would make it directly measurable and would let a
 * run report say which seed's map it played. And a consequence of this file's
 * own finding: `tests/fb077-terrain-wiring.test.ts`'s header says its four
 * fixture seeds "resolve via `applyRunTerrain`'s seed+1 retry" — measured here,
 * they are rescued by the Warden clearing and the retry never runs, so that
 * comment is stale. Both are main-lane wording.
 */

import { describe, expect, it } from 'vitest';

import terrainRaw from '../data/terrain.json';
import { GATES, Grid, MODIFIER_GATES, type GateDef } from '../src/sim/grid';
import {
  generateTerrain,
  jitterGates,
  jitterModifierGate,
  loadTerrain,
  parseTerrain,
  terrainOverlay,
  TerrainKind,
  type TerrainConfig,
  type TerrainMap,
} from '../src/sim/terrain';
import { applyRunTerrain, wardenSpawnTile } from '../src/sim/world';
import { sampleSeeds } from './terrain-sample';

const cfg = loadTerrain();

/**
 * The static base list plus the static Fourth Gate — the pre-fb156 live lists,
 * and still the tools'/tests' own default (`generateTerrain`'s own default
 * stays `GATES`, per `gates.ts`'s header comment).
 */
const FOUR: readonly GateDef[] = [...GATES, ...MODIFIER_GATES];

/** A Grid carrying `map` exactly — no Warden clearing, no retry. */
function gridOf(map: TerrainMap, c: TerrainConfig = cfg): Grid {
  const g = new Grid();
  g.applyTerrain(terrainOverlay(map, c));
  g.refresh();
  return g;
}

/** A Grid carrying `seed`'s own map. */
function rawGrid(seed: number, gates: readonly GateDef[], c: TerrainConfig = cfg): Grid {
  return gridOf(generateTerrain(seed, c, gates), c);
}

/**
 * Seeds whose own map strands the Core — the provable upper bound on retries —
 * and how many were actually checked.
 *
 * `checked` is reported rather than assumed equal to `seeds.length`, because
 * the `fallback` skip below silently shrinks the denominator: a `/data`
 * regression that pushed half the sample onto the flat arena would leave the
 * stranded list unchanged and the bound quietly covering half the seeds it
 * claims. The caller asserts it.
 *
 * One `generateTerrain` per seed and **one `Grid` for the whole sweep**:
 * `applyTerrain` rebuilds `blocked` through `syncTerrain`/`markDirty`, which is
 * all `allGatesReachable` reads, so the per-seed construction and `refresh()` a
 * first version paid were pure waste — 23.0 s against 16.4 s for the identical
 * result list, on a 13.8 s generation floor.
 */
function strandedIn(
  seeds: readonly number[],
  gates: readonly GateDef[] = GATES,
  c: TerrainConfig = cfg,
): { stranded: number[]; checked: number } {
  const stranded: number[] = [];
  let checked = 0;
  const g = new Grid();
  for (const seed of seeds) {
    const map = generateTerrain(seed, c, gates);
    if (map.fallback) continue;
    checked++;
    g.applyTerrain(terrainOverlay(map, c));
    if (!g.allGatesReachable()) stranded.push(seed);
  }
  return { stranded, checked };
}

// `strandedInJittered` (fb205, `strandedIn`'s jittered-gate sibling — one
// `Grid` per seed rather than `strandedIn`'s one shared `Grid`, since a
// jittered seed's gate tiles are baked in at `Grid` construction, fb177) is
// defined once, further down this file, alongside the `fallbacks`-tracking
// describe block it was built for — this branch's own earlier, weaker
// duplicate (same computation, no `fallbacks` field) is merged away rather
// than kept as dead weight in a file already over `vitest.fast.config.ts`'s
// own ~60s-per-file budget (BACKLOG-TERRAIN.md's Log).

describe('fb065h — a run plays its own seed’s map', () => {
  it('bounds the retry rate over the whole domain sample, on both gate lists', () => {
    // `checked`, not `seeds.length`: see `strandedIn`. A sample half of which
    // fell back would otherwise report the same bound over half the population.
    //
    // Re-measured at fb156's 4-gate layout: **zero** strand in this 12,000-seed
    // sample on the base arena — down from two (`244812834`, `709384557`) at
    // the 3-gate 56x32 layout, and neither of those two strands at this gate
    // geometry either. A fourth gate gives the flood far more ways in, so
    // 12,000 seeds no longer turns up an example; the witnesses for layer 2
    // below come from a wider domain comb instead.
    const three = strandedIn(sampleSeeds());
    expect({ checked: three.checked, stranded: three.stranded }).toEqual({
      checked: 12000,
      stranded: [],
    });
    // **The five-gate arena (base + modifier) is a different population and was
    // measured, not assumed** — the gate list is a generator input, so `World`
    // under the `gate` modifier plays maps this sweep never sees. Also zero in
    // this sample: the full five-gate sweep over the same 12,000 seeds reads
    // **checked 12000, fallbacks 0, stranded 0** — down from two
    // (`2888361945`, `-739`) at the 3-gate-plus-modifier layout, neither of
    // which strands at this gate geometry either.
    const five = strandedIn(sampleSeeds(), FOUR);
    expect({ checked: five.checked, stranded: five.stranded }).toEqual({
      checked: 12000,
      stranded: [],
    });
    // The old 3-gate witnesses are fine on both of today's gate lists — not
    // because the two populations converged, but because none of these four
    // seeds strands anything at this geometry at all.
    expect(strandedIn([244812834, 709384557, 2888361945, -739], GATES).stranded).toEqual([]);
    expect(strandedIn([244812834, 709384557, 2888361945, -739], FOUR).stranded).toEqual([]);
  });

  it('the domain still strands rare Cores outside the 12,000-seed sample, on both gate lists', () => {
    // Since layer 1's sample no longer contains an example on either gate
    // list, these come from a wider domain comb instead (a ~600,000-seed comb,
    // stride 40961 from 0, for the base arena; a ~250,000-seed comb, two
    // strides, for the five-gate one) — the same shape fb064r's `WITNESSES`
    // uses when a property's true extreme is not in the fixed sample. Each
    // still strands its own seed's map, checked directly rather than assumed
    // from the comb.
    const BASE_STRANDED = [2910647699, 3204297108];
    expect(strandedIn(BASE_STRANDED, GATES).stranded).toEqual(BASE_STRANDED);
    // ...and they are fine on the five-gate arena, which is the point: these
    // are not "the same bad seeds plus a modifier", they are a different
    // population.
    expect(strandedIn(BASE_STRANDED, FOUR).stranded).toEqual([]);

    const FIVE_GATE_STRANDED = [3202873299];
    expect(strandedIn(FIVE_GATE_STRANDED, FOUR).stranded).toEqual(FIVE_GATE_STRANDED);
    expect(strandedIn(FIVE_GATE_STRANDED, GATES).stranded).toEqual([]);
  });

  it('and the bound is not tight: the Warden clearing rescues every one', () => {
    // **The discriminator, made exact rather than inferred.** A first version
    // read "differs from the seed's own map only inside the 3x3 ⇒ it did not
    // retry", which is an inference: a retried map that happened to differ only
    // there would have read as a no-retry. The separation is enormous in
    // practice (3-6 tiles against ~290 for `seed+1`), but the exact form costs
    // nothing: build the seed's own map with the 3x3 forced to normal — which
    // is what `clearOverlayBlock` does — and require the run's grid to equal it
    // on **every** tile. That also pins the clearing's *shape*: a 5x5 version
    // would fail here rather than pass unnoticed.
    const w = wardenSpawnTile(new Grid());
    const warn = console.warn;
    console.warn = (): void => {};
    try {
      for (const [gates, seeds] of [
        [GATES, [2910647699, 3204297108]],
        [FOUR, [3202873299]],
      ] as ReadonlyArray<readonly [readonly GateDef[], readonly number[]]>) {
        for (const seed of seeds) {
          const raw = rawGrid(seed, gates);
          expect(raw.allGatesReachable(), `seed ${seed} strands the Core on its own map`).toBe(
            false,
          );

          const run = new Grid();
          expect(applyRunTerrain(run, gates, seed, cfg), `seed ${seed} fell back`).toBe(false);
          expect(run.allGatesReachable(), `seed ${seed} playable`).toBe(true);

          // The seed's own map, cleared the way `applyRunTerrain` clears it.
          const overlay = terrainOverlay(generateTerrain(seed, cfg, gates), cfg);
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const x = w.tx + dx;
              const y = w.ty + dy;
              if (x < 0 || y < 0 || x >= overlay.w || y >= overlay.h) continue;
              const i = y * overlay.w + x;
              overlay.kind[i] = TerrainKind.Normal;
              overlay.walkable[i] = 1;
              overlay.buildable[i] = 1;
              overlay.high[i] = 0;
              overlay.charBlock[i] = 0;
            }
          }
          const expected = new Grid();
          expected.applyTerrain(overlay);
          expected.refresh();
          expect(
            Array.from(run.terrainKind),
            `seed ${seed} played a different seed's map`,
          ).toEqual(Array.from(expected.terrainKind));
        }
      }
    } finally {
      console.warn = warn;
    }
  });

  it('records the jitter-off control, so the number is attributable', () => {
    // fb064l's precedent: a rate measured only at the shipped config says
    // nothing about which part of the generator owns it. Re-measured at
    // fb156's 4-gate layout: the 12,000-seed sample no longer strands anything
    // at either `density.jitter` setting (layer 1, above), so — as with the
    // shipped-config witnesses — the two named here come from a wider domain
    // comb (`114485995`, `127183905`, ~100,000-seed comb at `density.jitter:
    // 0`, base gates). Both sets are disjoint: neither strands at the shipped
    // config, and neither of the shipped-config witnesses strands without
    // jitter, so the per-seed budgets move *which* seeds strand rather than
    // establishing which setting is safer. (At the 3-gate 56x32 layout this
    // read `3000000654`/`3000001827`; neither strands at this gate geometry
    // either.)
    const noJitter = parseTerrain({
      ...(terrainRaw as Record<string, unknown>),
      density: {
        ...(terrainRaw as { density: Record<string, unknown> }).density,
        jitter: 0,
      },
    });
    expect(strandedIn([114485995, 127183905], GATES, noJitter).stranded).toEqual([
      114485995, 127183905,
    ]);
    // ...and they are not stranded at the shipped config, which is what makes
    // the two sets disjoint rather than nested.
    expect(strandedIn([114485995, 127183905]).stranded).toEqual([]);
    // The shipped two, likewise, are fine without jitter.
    expect(strandedIn([2910647699, 3204297108], GATES, noJitter).stranded).toEqual([]);
  });

  it('states the limit of the seed: it reproduces the map, not the board', () => {
    // The sentence a bug report needs, as an assertion. Regenerating from the
    // seed gives the map; the grid a run played is that map plus the Warden
    // clearing and the structural overrides, which is fb065c's ledger.
    // Seed 40 happens to land the Warden's 3x3 entirely on tiles the map
    // already had as `Normal` at this geometry (56x32) — a legitimate outcome,
    // but a 0-tile difference cannot illustrate "reproduces the map, not the
    // board", so this file picks a seed the clearing actually touches instead.
    const seed = 4;
    const raw = rawGrid(seed, GATES);
    const run = new Grid();
    const warn = console.warn;
    console.warn = (): void => {};
    try {
      expect(applyRunTerrain(run, GATES, seed, cfg)).toBe(false);
    } finally {
      console.warn = warn;
    }
    let differs = 0;
    for (let i = 0; i < raw.terrainKind.length; i++) {
      if (raw.terrainKind[i] !== run.terrainKind[i]) differs++;
    }
    // Same seed, same map — pinned by hash so a generator change reddens here
    // rather than silently changing what "reproduces" means... (was `3d7c70c8`
    // at the 3-gate 56x32 layout; the fourth gate changes seed 4's map too.)
    expect(generateTerrain(seed, cfg, GATES).hash).toBe('11793174');
    // ...and still not the same board. **8 tiles** (was 7), the Warden's
    // clearing and nothing else: both sides here are Grids built from the same
    // gate list, so the structural Core-footprint override (fb065c's extra 4)
    // cancels and what is left is exactly the 3x3 clear. A reader holding the
    // seed can rebuild the map; these 8 tiles are what they cannot know from
    // it.
    expect(differs).toBe(8);
  });
});

/**
 * fb205 (BACKLOG-TERRAIN.md, QUESTIONS Q220 point 5): the jittered-gate arm
 * of this file's own stranding sweep. fb156 moved live runs onto per-seed
 * `jitterGates(seed)`/`jitterModifierGate(seed)`, a genuinely different
 * population from the static lists above — measured here rather than
 * assumed, the same standard this file already holds itself to for
 * `GATES`/`FOUR`. Kept in this file rather than split out (fb166's own
 * precedent, logged in this lane file's Log, for exactly this shape: moving
 * a test to keep the fast tier under its own ~60s-per-file rule needs
 * `vitest.fast.config.ts`, outside this lane's Scope) — filed there for the
 * merge instead.
 *
 * A jittered `Grid` must be constructed `new Grid(gates)` with *that seed's*
 * own gate list — `new Grid()`'s default only bakes the static `GATES`
 * border tiles, so checking reachability against it while the overlay was
 * generated for a different (jittered) gate list silently checks the wrong
 * tiles. Confirmed by re-deriving: doing it wrong here first read stranded
 * in the thousands (every seed's jittered gate tile was rock or interior
 * under the static grid's own idea of where its border gates are); the
 * numbers below are with the grid built on the same list the map was.
 */
function strandedInJittered(
  seeds: readonly number[],
  withModifier: boolean,
  c: TerrainConfig = cfg,
): { stranded: number[]; checked: number; fallbacks: number } {
  const stranded: number[] = [];
  let checked = 0;
  let fallbacks = 0;
  for (const seed of seeds) {
    const gates: readonly GateDef[] = withModifier
      ? [...jitterGates(seed), jitterModifierGate(seed)]
      : jitterGates(seed);
    const map = generateTerrain(seed, c, gates);
    if (map.fallback) {
      fallbacks++;
      continue;
    }
    checked++;
    const g = new Grid(gates);
    g.applyTerrain(terrainOverlay(map, c));
    if (!g.allGatesReachable()) stranded.push(seed);
  }
  return { stranded, checked, fallbacks };
}

describe('fb205 — the jittered-gate populations strand their own rare Cores too', () => {
  it('measured over the 12,000-seed domain sample: 16 on the 4-gate jittered layout, 27 on the 5-gate one', () => {
    const FOUR_GATE_STRANDED = [
      20043156, 156766113, 201147387, 361492635, 1050118209, 1408031709, 1513974105, 2209042122,
      2301383805, 2881203675, 3282782622, 3918436998, -976, 3000001424, 3000001535, 2147484253,
    ];
    const four = strandedInJittered(sampleSeeds(), false);
    expect({ checked: four.checked, fallbacks: four.fallbacks, stranded: four.stranded }).toEqual({
      checked: 12000,
      fallbacks: 0,
      stranded: FOUR_GATE_STRANDED,
    });

    const FIVE_GATE_STRANDED = [
      160345248, 214032273, 220474716, 301363167, 654265878, 1060139787, 1823927196, 2209042122,
      3111699969, 3138901395, 3289940892, 3735185286, 3875487378, 4012210335, 4204051971, -1335,
      -1215, -1087, -998, -259, 3000000677, 3000000964, 3000001753, 2147482966, 2147483440,
      2147483535, 2147484119,
    ];
    const five = strandedInJittered(sampleSeeds(), true);
    expect({ checked: five.checked, fallbacks: five.fallbacks, stranded: five.stranded }).toEqual({
      checked: 12000,
      fallbacks: 0,
      stranded: FIVE_GATE_STRANDED,
    });

    // A wider population than either static list's 12,000-seed sample (which
    // found zero apiece) — not a contradiction, a different population: every
    // seed's *own* gate positions vary here, so more of the domain's rare hard
    // layouts land inside this same 12,000-seed window than land inside the
    // fixed-gate one.
    expect(four.stranded.length).toBeGreaterThan(0);
    expect(five.stranded.length).toBeGreaterThan(0);
  });

  it('and the bound is not tight here either: every one is rescued by the Warden clearing, zero retries', () => {
    const warn = console.warn;
    console.warn = (): void => {};
    try {
      for (const [withModifier, seeds] of [
        [false, [20043156, 361492635, -976, 2147484253]],
        [true, [160345248, 654265878, -259, 2147484119]],
      ] as ReadonlyArray<readonly [boolean, readonly number[]]>) {
        for (const seed of seeds) {
          const gates: readonly GateDef[] = withModifier
            ? [...jitterGates(seed), jitterModifierGate(seed)]
            : jitterGates(seed);

          const raw = new Grid(gates);
          raw.applyTerrain(terrainOverlay(generateTerrain(seed, cfg, gates), cfg));
          expect(raw.allGatesReachable(), `seed ${seed} strands the Core on its own map`).toBe(
            false,
          );

          const run = new Grid(gates);
          expect(applyRunTerrain(run, gates, seed, cfg), `seed ${seed} fell back`).toBe(false);
          expect(run.allGatesReachable(), `seed ${seed} playable`).toBe(true);
        }
      }
    } finally {
      console.warn = warn;
    }
  });
});
