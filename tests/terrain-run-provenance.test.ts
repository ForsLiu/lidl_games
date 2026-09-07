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
 * **fb166 re-measurement (56x32; was 36x20).** The upper bound below is now
 * **zero on both gate lists**, over the same 12,000-seed sample — the bigger
 * grid's headroom (see `tests/terrain-band-ledger.test.ts` and
 * `tools/scratch-bands.ts`'s 5000-seed sweep, zero fallbacks with comfortable
 * margin on every band) means stranding the hardcoded `CORE_X/CORE_Y` behind
 * rock is rarer than this domain sample now catches at all — not "still
 * unexercised", but unexercised *and* unwitnessed within the sample this file
 * has always used. `tests/terrain-grid.test.ts` and
 * `tests/terrain-grid-view.test.ts` independently needed off-sample searches
 * (tens of thousands of seeds, not the 100-seed windows those files used to
 * search) to find even a single witness apiece; this file borrows two of those
 * off-sample witnesses so the "the clearing rescues every one" case still has
 * real material, and says plainly that they are off-sample rather than
 * pretending the 12,000-seed comb still produces its own.
 *
 * The measurement is in two layers, because only one of them is cheap:
 *
 *  1. **The upper bound**, over all 12,000 seeds of `tests/terrain-sample.ts`,
 *     on both gate lists: how many seeds' generated maps leave the Core
 *     unreachable *before* the Warden clearing. **Zero on both** (fb166; was
 *     three on the base arena — `-349`, `-169`, `3000001834`, 0.0250% — and
 *     five on the four-gate one at 36x20).
 *     This is a genuine bound and not an estimate, and the argument is narrower
 *     than "the clearing only opens tiles": `allGatesReachable` dijkstras
 *     `blocked`, which comes from `staticBlocked`, which reads `terrainBlock`
 *     and hence `overlay.walkable` and **nothing else** — and
 *     `clearOverlayBlock` writes `walkable = 1` unconditionally. So the walkable
 *     set can only grow and reachability can only improve. (Its other writes,
 *     `high = 0` and `charBlock = 0`, are *not* monotone-safe for other
 *     predicates; they simply do not enter this one.)
 *  2. **The exact answer**, now for two off-sample witnesses per gate list
 *     rather than for the sample's own: every one is *rescued* by the Warden
 *     clearing, so the retry count is **0 on every witness checked** and the
 *     bound above is (trivially, since it is already zero) not tight. That the
 *     3x3 clear closes this path is a side effect — it was added because 1.0%
 *     of seeds otherwise spawn the character in rock — and it is worth knowing
 *     it carries this too, because a change to it would move a number nothing
 *     else measures.
 *
 * `tests/terrain-grid.test.ts` measures the same stranding over seeds 1..100
 * and reads 0 there too at this grid size (down from about 1 in 2500 at
 * 36x20, over its old 1..5000 window) — consistent with this file's own
 * domain-sample bound moving from a small nonzero rate to zero.
 *
 * **What a reader holding only `RunConfig.seed` can and cannot do.**
 *
 * Cannot, and this is the correction a review had to make to an earlier version
 * of this paragraph: **regenerate the map from the seed alone.** The gate list
 * is a generator input, so `generateTerrain(40, cfg, GATES)` and the same seed
 * under fb077's Fourth Gate are different maps — hashes `8bb4f906` and
 * `3f70502e`, **843 tiles apart** (fb166: 56x32; was `c8dc0fa7`/`566b7585`,
 * 239 tiles, at 36x20). A reader following "just regenerate from the
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
    // fb166: re-measured at 56x32 — **zero** stranded on the base arena over
    // this sample (was three: `-349`, `-169`, `3000001834`, 0.0250% at 36x20).
    const three = strandedIn(sampleSeeds());
    expect({ checked: three.checked, stranded: three.stranded }).toEqual({
      checked: 12000,
      stranded: [],
    });
    // **The four-gate arena is a different population and was measured, not
    // assumed** — the gate list is a generator input, so `World` under the
    // `gate` modifier plays maps this sweep never sees. Recorded rather than
    // re-swept here, on fb064r's original two-layer pattern (a full in-test
    // four-gate sweep over 12,000 seeds roughly doubles this file's cost —
    // measured this session at 54.5 s for the base-arena sweep alone at
    // 56x32, itself already up from fb064r's 36x20 reading, so a second full
    // sweep is well past the fast tier regardless of its result): fb166:
    // **checked 12000, stranded 0** (was checked 12000, stranded 5 —
    // `804589548`, `1542607185`, `-1638`, `-929`, `2147483230` — at 36x20).
    // With no surviving witnesses to re-check individually, there is nothing
    // cheap left to spot-verify here; the offline sweep is the whole claim.
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
    //
    // **fb166: these four witnesses are off-sample, not from the 12,000-seed
    // comb.** The comb reads zero stranded on both gate lists at 56x32 (see
    // the case above), so this case borrowed its witnesses from the wider
    // searches `tests/terrain-grid.test.ts` and `tests/terrain-grid-view.test.ts`
    // needed for the same reason — a plain incrementing scan from seed 1,
    // stopped at the first hit per gate list: 20336 and 85305 on the base
    // arena (out of a ~360,000-seed scan run for those other files' fixtures;
    // the base rate looks like roughly 1 in 20,000-30,000 from that scan, far
    // rarer than 36x20's ~1 in 4,000 domain-wide reading), and 23647/98785 on
    // the four-gate arena (a dedicated ~100,000-seed scan for this file). Was
    // `-349`/`-169`/`3000001834` (base) and `804589548`/`1542607185`/`-1638`/
    // `-929`/`2147483230` (four-gate) at 36x20, all from the comb itself.
    const w = wardenSpawnTile();
    const warn = console.warn;
    console.warn = (): void => {};
    try {
      for (const [gates, seeds] of [
        [GATES, [20336, 85305]],
        [FOUR, [23647, 98785]],
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
    // nothing about which part of the generator owns it. fb166: re-measured
    // over the same 12,000 seeds at `density.jitter: 0` — fb064a's generator
    // exactly — which now strands **1**: 1529722299, i.e. 0.0083% (was 2:
    // 476740782 and 3157512899, 0.0167%, against the shipped 0.0250%, at
    // 36x20; the shipped rate at 56x32 is 0% over this same sample, so
    // "neither config's rate is meaningfully different" no longer holds the
    // way it did — jitter-off now strands measurably more of this sample than
    // shipped does, though both are rare). The set is disjoint from the
    // shipped config's (empty) stranded set, consistent with the per-seed
    // budgets moving *which* seeds strand rather than being strictly ordered
    // by rate. Only the named seed is re-measured here; the full sweep is a
    // second comb pass and its result is the recorded string above.
    const noJitter = parseTerrain({
      ...(terrainRaw as Record<string, unknown>),
      density: {
        ...(terrainRaw as { density: Record<string, unknown> }).density,
        jitter: 0,
      },
    });
    expect(strandedIn([1529722299], GATES, noJitter).stranded).toEqual([1529722299]);
    // ...and it is not stranded at the shipped config, which is what makes the
    // two sets disjoint rather than nested.
    expect(strandedIn([1529722299]).stranded).toEqual([]);
    // The off-sample base witnesses from the case above, likewise, are fine
    // without jitter — stranding is a per-seed effect of the exact densities,
    // not a "any config strands these" property of the seed.
    expect(strandedIn([20336, 85305, 103917], GATES, noJitter).stranded).toEqual([]);
  });

  it('states the limit of the seed: it reproduces the map, not the board', () => {
    // The sentence a bug report needs, as an assertion. Regenerating from the
    // seed gives the map; the grid a run played is that map plus the Warden
    // clearing and the structural overrides, which is fb065c's ledger.
    const seed = 40;
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
    expect(generateTerrain(seed, cfg, GATES).hash).toBe('8bb4f906');
    // ...and still not the same board. **5 tiles** (fb166: 56x32; was 9, not
    // fb065c's 13, at 36x20). At 36x20 the difference between this file's
    // number and fb065c's was the point: fb065c compares the run's grid
    // against the raw `TerrainMap`, so its 13 was the Warden's 9 plus the 4
    // Core tiles the structural override punches out, while here both sides
    // are Grids, so the override cancels and what is left is exactly the
    // clearing. At 56x32 that decomposition happens to collapse for this
    // particular seed — seed 40's raw map already has all four Core-footprint
    // tiles as Normal terrain, so the override changes nothing there and
    // fb065c's own reading for this seed is *also* 5, not a separate 9 — but
    // the general claim (a reader holding the seed can rebuild the map; the
    // clearing is what they cannot know from it) is unchanged, and is what
    // this assertion still pins.
    expect(differs).toBe(5);
  });
});
