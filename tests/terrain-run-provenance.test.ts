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
 * **fb166 re-measured every number in this file at the 56x32 grid**
 * (`data/terrain.json` unchanged) — a bigger arena means more headroom, and
 * stranding the hardcoded `CORE_X/CORE_Y` spot is one more thing that got
 * rarer. The paragraphs below are fb166's own measurements; every literal
 * pre-fb166 number this docstring used to carry has been replaced rather than
 * kept as a side note, because none of them describe a population a reader can
 * still compare against without re-running the sweep.
 *
 * The measurement is in two layers, because only one of them is cheap:
 *
 *  1. **The upper bound**, over all 12,000 seeds of `tests/terrain-sample.ts`,
 *     on both gate lists: how many seeds' generated maps leave the Core
 *     unreachable *before* the Warden clearing. Two on the base arena
 *     (`244812834`, `709384557`, 0.0167%) and two on the four-gate one
 *     (`2888361945`, `-739`, also 0.0167%), disjoint sets — different generator
 *     input, different population.
 *     This is a genuine bound and not an estimate, and the argument is narrower
 *     than "the clearing only opens tiles": `allGatesReachable` dijkstras
 *     `blocked`, which comes from `staticBlocked`, which reads `terrainBlock`
 *     and hence `overlay.walkable` and **nothing else** — and
 *     `clearOverlayBlock` writes `walkable = 1` unconditionally. So the walkable
 *     set can only grow and reachability can only improve. (Its other writes,
 *     `high = 0` and `charBlock = 0`, are *not* monotone-safe for other
 *     predicates; they simply do not enter this one.)
 *  2. **The exact answer for those four**, which costs four more applies:
 *     every one is *rescued* by the Warden clearing, so the retry count over
 *     the sample is **0 of 12,000 on either gate list** and the bound above is
 *     not tight. That the 3x3
 *     clear closes this path is a side effect — it was added because 1.0% of
 *     seeds otherwise spawn the character in rock — and it is worth knowing it
 *     carries this too, because a change to it would move a number nothing
 *     else measures.
 *
 * `tests/terrain-grid.test.ts` measures the same stranding over seeds 1..5000
 * at fb166's grid and finds it rare enough there to need a dedicated search
 * rather than a window count (see that file's own re-derivation). This file is
 * the domain-wide version and reads 1 in 6000 on the raw map and 0 after the
 * clear; the two are consistent, and the window one is not the population a run
 * draws from (fb064j).
 *
 * **What a reader holding only `RunConfig.seed` can and cannot do.**
 *
 * Cannot, and this is the correction a review had to make to an earlier version
 * of this paragraph: **regenerate the map from the seed alone.** The gate list
 * is a generator input, so `generateTerrain(40, cfg, GATES)` and the same seed
 * under fb077's Fourth Gate are different maps — hashes `5cecaef9` and
 * `72845dda`, **766 tiles apart**. A reader following "just regenerate from the
 * seed" on a `modifiers: ['gate']` bug report gets the wrong map, which is a
 * bigger hole than the retry this file studies and is the *same* blind spot the
 * immediately preceding item (fb065f) closed for the dump's bands. The map is a
 * function of seed **and gate list**, and both sweeps below are run on both
 * lists for that reason.
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

/** `world.ts`'s Fourth Gate list — a different generator input, so a different population. */
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

describe('fb065h — a run plays its own seed’s map', () => {
  it('bounds the retry rate over the whole domain sample, on both gate lists', () => {
    // `checked`, not `seeds.length`: see `strandedIn`. A sample half of which
    // fell back would otherwise report the same bound over half the population.
    const three = strandedIn(sampleSeeds());
    expect({ checked: three.checked, stranded: three.stranded }).toEqual({
      checked: 12000,
      // Re-measured at fb166's 56x32 grid: two, not three, and different seeds
      // (pre-fb166 at 36x20: `-349`, `-169`, `3000001834`).
      stranded: [244812834, 709384557],
    });
    // **The four-gate arena is a different population and was measured, not
    // assumed** — the gate list is a generator input, so `World` under the
    // `gate` modifier plays maps this sweep never sees. Recorded rather than
    // re-swept here, on fb064r's two-layer pattern: re-measured at fb166's
    // 56x32 grid, the full four-gate sweep over the same 12,000 seeds reads
    // **checked 12000, fallbacks 0, stranded 2** — `2888361945`, `-739` (down
    // from pre-fb166's five) — and running it in-test doubled the file's cost
    // to ~35 s, which is the wrong side of the fast tier. The witnesses are
    // re-measured (milliseconds each), which is what catches a generator
    // change; the *distribution* is the recorded string.
    const FOUR_GATE_STRANDED = [2888361945, -739];
    expect(strandedIn(FOUR_GATE_STRANDED, FOUR).stranded).toEqual(FOUR_GATE_STRANDED);
    // ...and they are fine on the base arena, which is the point: these are not
    // "the same bad seeds plus two", they are a different population.
    expect(strandedIn(FOUR_GATE_STRANDED).stranded).toEqual([]);
    expect(strandedIn(three.stranded, FOUR).stranded).toEqual([]);
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
    const w = wardenSpawnTile();
    const warn = console.warn;
    console.warn = (): void => {};
    try {
      for (const [gates, seeds] of [
        [GATES, [244812834, 709384557]],
        [FOUR, [2888361945, -739]],
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
    // nothing about which part of the generator owns it. Recorded offline over
    // the same 12,000 seeds at `density.jitter: 0` — fb064a's generator
    // exactly — which strands **2** at fb166's 56x32 grid: 3000000654 and
    // 3000001827, the same 0.0167% rate as the shipped config's two (pre-fb166
    // at 36x20 it was also 2 of 12,000, a coincidence of scale rather than of
    // seed identity — every seed named moved). Both sets are disjoint, so the
    // per-seed budgets move *which* seeds strand rather than how many, and
    // neither config's rate is meaningfully different from the other at this
    // sample size. Only the two named seeds are re-measured here; the full
    // sweep is a second pass and its result is the recorded string above.
    const noJitter = parseTerrain({
      ...(terrainRaw as Record<string, unknown>),
      density: {
        ...(terrainRaw as { density: Record<string, unknown> }).density,
        jitter: 0,
      },
    });
    expect(strandedIn([3000000654, 3000001827], GATES, noJitter).stranded).toEqual([
      3000000654, 3000001827,
    ]);
    // ...and they are not stranded at the shipped config, which is what makes
    // the two sets disjoint rather than nested.
    expect(strandedIn([3000000654, 3000001827]).stranded).toEqual([]);
    // The shipped two, likewise, are fine without jitter.
    expect(strandedIn([244812834, 709384557], GATES, noJitter).stranded).toEqual([]);
  });

  it('states the limit of the seed: it reproduces the map, not the board', () => {
    // The sentence a bug report needs, as an assertion. Regenerating from the
    // seed gives the map; the grid a run played is that map plus the Warden
    // clearing and the structural overrides, which is fb065c's ledger.
    //
    // Seed 4, not the pre-fb166 40: at fb166's 56x32 grid seed 40's own map
    // already leaves the Warden's clearing spot entirely normal (the bigger
    // interior means more seeds simply don't need the clear), so the two
    // grids below came out byte-identical there and the test's whole point —
    // that the clearing is a real difference the seed alone cannot predict —
    // went silent. Seed 4 keeps it real (7 tiles).
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
    // rather than silently changing what "reproduces" means...
    expect(generateTerrain(seed, cfg, GATES).hash).toBe('3d7c70c8');
    // ...and still not the same board. Both sides here are Grids, so the
    // structural Core/gate override cancels between them and what is left is
    // exactly the Warden clearing (fb065c's own ledger compares a Grid against
    // the raw `TerrainMap` instead, so its number there also carries the 4
    // Core tiles the override punches out — a different comparison, not a
    // disagreement). A reader holding the seed can rebuild the map; these
    // tiles are what they cannot know from it.
    expect(differs).toBe(7);
  });
});
