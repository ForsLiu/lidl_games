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
 *  1. **The upper bound**, over all 12,000 seeds of `tests/terrain-sample.ts`:
 *     how many seeds' generated maps leave the Core unreachable *before* the
 *     Warden clearing. Three: `-349`, `-169` and `3000001834`, i.e. 0.0250%.
 *     This is a genuine bound and not an estimate — `clearOverlayBlock` only
 *     ever sets tiles walkable, never unwalkable, so the walkable set can only
 *     grow and reachability can only improve. The retry rate is therefore at
 *     most this.
 *  2. **The exact answer for those three**, which costs three more applies:
 *     each is *rescued* by the Warden clearing, so the retry count over the
 *     sample is **0 of 12,000** and the bound above is not tight. That the 3x3
 *     clear closes this path is a side effect — it was added because 1.0% of
 *     seeds otherwise spawn the character in rock — and it is worth knowing it
 *     carries this too, because a change to it would move a number nothing
 *     else measures.
 *
 * `tests/terrain-grid.test.ts` measures the same stranding over seeds 1..5000
 * and reads about 1 in 2500. This file is the domain-wide version and reads 1
 * in 4000 on the raw map and 0 after the clear; the two are consistent, and the
 * window one is not the population a run draws from (fb064j).
 *
 * **What a reader holding only `RunConfig.seed` can and cannot do.** Can:
 * regenerate the map, on every seed measured here. Cannot: assume the *grid*
 * matches it — `applyRunTerrain` clears the Warden's 3x3 and `Grid` punches out
 * the gate and Core footprints, which fb065c measures at up to 13 tiles. So the
 * seed reproduces the map; only `gridTerrain`'s dump reproduces the board.
 *
 * **Out of scope and logged for the merge:** `applyRunTerrain` returns only a
 * fallback boolean, so the retry count is not observable and this file has to
 * infer it. One extra field on its return would make the number directly
 * measurable, and would let a run report say which seed's map it played.
 */

import { describe, expect, it } from 'vitest';

import terrainRaw from '../data/terrain.json';
import { GATES, Grid } from '../src/sim/grid';
import {
  generateTerrain,
  loadTerrain,
  parseTerrain,
  terrainOverlay,
  type TerrainConfig,
  type TerrainMap,
} from '../src/sim/terrain';
import { applyRunTerrain, wardenSpawnTile } from '../src/sim/world';
import { sampleSeeds } from './terrain-sample';

const cfg = loadTerrain();

/** A Grid carrying `map` exactly — no Warden clearing, no retry. */
function gridOf(map: TerrainMap, c: TerrainConfig = cfg): Grid {
  const g = new Grid();
  g.applyTerrain(terrainOverlay(map, c));
  g.refresh();
  return g;
}

/** A Grid carrying `seed`'s own map. */
function rawGrid(seed: number, c: TerrainConfig = cfg): Grid {
  return gridOf(generateTerrain(seed, c, GATES), c);
}

/**
 * Seeds whose own map strands the Core — the provable upper bound on retries.
 *
 * One `generateTerrain` per seed, deliberately: a first version called it twice
 * (once for the `fallback` check, once inside the grid builder) and doubled a
 * 12,000-seed sweep's cost for nothing.
 */
function strandedIn(seeds: readonly number[], c: TerrainConfig = cfg): number[] {
  const out: number[] = [];
  for (const seed of seeds) {
    const map = generateTerrain(seed, c, GATES);
    if (map.fallback) continue;
    if (!gridOf(map, c).allGatesReachable()) out.push(seed);
  }
  return out;
}

describe('fb065h — a run plays its own seed’s map', () => {
  it('bounds the retry rate over the whole domain sample', () => {
    const stranded = strandedIn(sampleSeeds());
    expect({ sampled: sampleSeeds().length, stranded }).toEqual({
      sampled: 12000,
      stranded: [-349, -169, 3000001834],
    });
  });

  it('and the bound is not tight: the Warden clearing rescues all three', () => {
    // The discriminator: `applyRunTerrain` leaves the grid carrying whichever
    // attempt succeeded. If it never retried, that grid differs from the seed's
    // own map *only* inside the 3x3 the clearing touches. If it retried, it is
    // a different seed's map and would differ across the board — fb064l
    // measures two seeds' maps as differing on a large share of tiles, so the
    // two cases are nowhere near each other.
    const w = wardenSpawnTile();
    const warn = console.warn;
    console.warn = (): void => {};
    try {
      for (const seed of [-349, -169, 3000001834]) {
        const raw = rawGrid(seed);
        expect(raw.allGatesReachable(), `seed ${seed} strands the Core on its own map`).toBe(false);

        const run = new Grid();
        expect(applyRunTerrain(run, GATES, seed, cfg), `seed ${seed} fell back`).toBe(false);
        expect(run.allGatesReachable(), `seed ${seed} playable`).toBe(true);

        let outside = 0;
        for (let i = 0; i < raw.terrainKind.length; i++) {
          if (raw.terrainKind[i] === run.terrainKind[i]) continue;
          const x = i % raw.w;
          const y = (i / raw.w) | 0;
          if (Math.abs(x - w.tx) > 1 || Math.abs(y - w.ty) > 1) outside++;
        }
        expect(outside, `seed ${seed} played a different seed's map`).toBe(0);
      }
    } finally {
      console.warn = warn;
    }
  });

  it('records the jitter-off control, so the number is attributable', () => {
    // fb064l's precedent: a rate measured only at the shipped config says
    // nothing about which part of the generator owns it. Recorded offline over
    // the same 12,000 seeds at `density.jitter: 0` — fb064a's generator
    // exactly — which strands **2**: 476740782 and 3157512897, i.e. 0.0167%
    // against the shipped 0.0250%. Both sets are disjoint, so the per-seed
    // budgets move *which* seeds strand rather than how many, and neither
    // config's rate is meaningfully different from the other at this sample
    // size. Only the two named seeds are re-measured here; the full sweep is a
    // second 17-second pass and its result is the recorded string above.
    const noJitter = parseTerrain({
      ...(terrainRaw as Record<string, unknown>),
      density: {
        ...(terrainRaw as { density: Record<string, unknown> }).density,
        jitter: 0,
      },
    });
    expect(strandedIn([476740782, 3157512897], noJitter)).toEqual([476740782, 3157512897]);
    // ...and they are not stranded at the shipped config, which is what makes
    // the two sets disjoint rather than nested.
    expect(strandedIn([476740782, 3157512897])).toEqual([]);
    // The shipped three, likewise, are fine without jitter.
    expect(strandedIn([-349, -169, 3000001834], noJitter)).toEqual([]);
  });

  it('states the limit of the seed: it reproduces the map, not the board', () => {
    // The sentence a bug report needs, as an assertion. Regenerating from the
    // seed gives the map; the grid a run played is that map plus the Warden
    // clearing and the structural overrides, which is fb065c's ledger.
    const seed = 40;
    const raw = rawGrid(seed);
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
    expect(generateTerrain(seed, cfg, GATES).hash).toBe('c8dc0fa7');
    // ...and still not the same board. **9 tiles, not fb065c's 13**, and the
    // difference between the two numbers is itself the point: fb065c compares
    // the run's grid against the raw `TerrainMap`, so its 13 is the Warden's 9
    // plus the 4 Core tiles the structural override punches out. Here both
    // sides are Grids, so the override cancels and what is left is exactly the
    // clearing. A reader holding the seed can rebuild the map; the 9 tiles are
    // what they cannot know from it.
    expect(differs).toBe(9);
  });
});
