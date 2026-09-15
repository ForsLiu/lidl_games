/**
 * fb064r — the band ledger over the whole seed domain.
 *
 * What was here before this file: `tests/terrain-generation.test.ts`'s "seeds
 * that sit closest to the cliff", which pins one hand-found seed per band over
 * the **1..20000** window. fb064j established that a run does not draw its seed
 * from that window — `src/ui/main.ts` draws `(Math.random() * 0xffffffff) >>> 0`
 * — so "the worst seed" recorded there is the worst seed *of a window covering
 * 0.0005% of the domain*, and a retune's real cost was invisible in it.
 *
 * This file is the domain-wide version, in two layers, because they answer
 * different questions and only one of them can be cheap:
 *
 *  1. **Named witnesses** (`WITNESSES`) — the worst seed per band found by wide
 *     offline scans, pinned one seed at a time. Re-measuring one costs a
 *     millisecond, so the extremes of a 4.3-billion-seed domain stay in the
 *     fast tier. These are what make a retune's cost a diff rather than a hunt:
 *     a density or `blob` change that pushes the floor down moves *these* rows.
 *  2. **The sample ledger** (`SAMPLE`) — a fixed, deterministic 12,000-seed
 *     sample spanning the domain (a coarse odd-strided comb across the whole
 *     uint32 range plus three contiguous windows, one of them negative), with
 *     min / mean / max and the argmin/argmax seed recorded per band. The mean
 *     is the half a witness cannot give you: a retune that leaves the extremes
 *     alone and moves the whole distribution shows up here.
 *
 * The sample's own argmin is **not** the domain worst and this file does not
 * pretend otherwise — 12,000 seeds is 0.0003% of the domain. That is exactly
 * why layer 1 exists, and the two are asserted separately so a reader cannot
 * mistake one for the other. Where the scans that produced layer 1 came from,
 * with their parameters so they can be re-run, is in BACKLOG-TERRAIN.md's Log.
 *
 * Every number below was measured at fb064r against shipped `/data`. A change
 * to `data/terrain.json`, to the generator, or to `measureTerrain` is expected
 * to move them; that is the point. Re-measure and re-record, never relax.
 *
 * **fb166 re-measured every number here at the grid's 36x20 -> 56x32 flip**,
 * rather than inheriting fb064r's readings, which describe a map that no
 * longer exists. One structural fact changed the shape of layer 1, not just
 * its numbers: the old grid's 720 tiles made `0.6 * 720 = 432` and
 * `0.45 * 720 = 324` both integers, so a map could measure `walkableFrac` or
 * `buildableNormalFrac` at *exactly* its band with zero headroom. The new
 * grid's 1792 tiles make `0.6 * 1792 = 1075.2` and `0.45 * 1792 = 806.4` —
 * neither an integer — so **no map can ever measure either band exactly
 * again**; `walkableCount`/`normalCount` are integers and no integer divided
 * by 1792 equals 0.6 or 0.45. `maxGateDetour` is a ratio of integer path
 * costs rather than a share of 1792 tiles, and a domain search still finds it
 * sitting exactly on its 1.5 ceiling — so of the three bands fb064r found at
 * zero headroom, only one still is. The other two witnesses below are the
 * closest a ~320,000-seed search actually found, labelled `best-found` rather
 * than `edge`, which is the same distinction `kind` already existed to draw.
 */

import { describe, expect, it } from 'vitest';

import { GRID_H, GRID_W } from '../src/sim/grid';
import {
  generateTerrain,
  loadTerrain,
  measureTerrain,
  MAX_TERRAIN_SEED,
  MIN_TERRAIN_SEED,
  parseTerrain,
  type TerrainConfig,
  type TerrainMeasure,
} from '../src/sim/terrain';
import { COMB_STEP, SAMPLE_COMB_N, SAMPLE_N, sampleSeeds } from './terrain-sample';
import {
  failedBands,
  legalMeasure,
  legalUnder,
  LEGALITY_BANDS as BANDS,
  type LegalityBand as Band,
} from './terrain-legality';

const cfg = loadTerrain();

/*
 * The bands, and the mirror of `terrainLegal` this file measures through, both
 * come from `tests/terrain-legality.ts` (fb064v). That file's header explains
 * why these suites re-derive legality instead of calling `terrainLegal`: the
 * generator returns a non-fallback map only when `terrainLegal` passed under
 * the same config, so `terrainLegal(measure(map))` is implied by
 * `fallback === false` and a dropped term would be invisible. `legalMeasure`
 * takes a measure rather than a map because the callers below already hold
 * one — measuring twice per seed cost about a third of this file's runtime.
 */

/** Six decimals: finer than any band's granularity, coarser than FP noise. */
const fmt = (v: number): string => v.toFixed(6);

interface BandStat {
  min: number;
  minSeed: number;
  max: number;
  maxSeed: number;
  sum: number;
  n: number;
}

function accumulate(stats: Record<Band, BandStat>, seed: number, q: TerrainMeasure): void {
  for (const b of BANDS) {
    const v = q[b];
    const a = stats[b];
    a.sum += v;
    a.n++;
    if (v < a.min) {
      a.min = v;
      a.minSeed = seed;
    }
    if (v > a.max) {
      a.max = v;
      a.maxSeed = seed;
    }
  }
}

function emptyStats(): Record<Band, BandStat> {
  return Object.fromEntries(
    BANDS.map((b) => [b, { min: Infinity, minSeed: 0, max: -Infinity, maxSeed: 0, sum: 0, n: 0 }]),
  ) as Record<Band, BandStat>;
}

/**
 * One ledger row per band, as a string, so a failure prints the whole table as
 * a diff instead of stopping at the first band that moved. The seed is part of
 * the row for the same reason: a retune that only relocates the extreme is a
 * different event from one that lowers it, and both should be readable at a
 * glance.
 */
function ledger(stats: Record<Band, BandStat>): Record<Band, string> {
  return Object.fromEntries(
    BANDS.map((b) => {
      const a = stats[b];
      return [
        b,
        `min ${fmt(a.min)} @${a.minSeed} · mean ${fmt(a.sum / a.n)} · max ${fmt(a.max)} @${a.maxSeed}`,
      ];
    }),
  ) as Record<Band, string>;
}

/**
 * Layer 1: the worst seed per band, named.
 *
 * **Two kinds of row.** `'edge'` sits exactly on the band, provably unbeatable
 * (a map outside its band is regenerated at seed+1, so the band value itself
 * is the extreme). `'best-found'` is the best of a finite search and is
 * beatable by a bigger one. fb166's grid flip moved four of the five old
 * witnesses out of the `'edge'` column and into `'best-found'`, for a
 * structural reason rather than a weaker search: at 1792 tiles, `0.6` and
 * `0.45` are not `k / 1792` for any integer `k`, so `walkableFrac` and
 * `buildableNormalFrac` can no longer land on their bands exactly, ever.
 * `maxGateDetour` is a ratio of integer path costs rather than a share of
 * 1792, and a domain search still finds it sitting exactly on 1.5.
 *
 * Provenance, because "best" is only as good as the search behind it:
 *   - `13620` is the worst of a 1..20000 near-window sweep (matching the
 *     window `tests/terrain-generation.test.ts`'s own cliff-witness test
 *     samples); `1721604933` is an *independent* second witness at the exact
 *     same value, from a separate 300,000-seed odd-strided comb across the
 *     whole uint32 domain (`2 * floor(2**32/300000/2)+1`). Neither is the
 *     domain's true worst, and a bigger search may still beat 1077/1792.
 *   - `1478659760` is the best `buildableNormalFrac` floor found by the same
 *     300,000-seed comb.
 *   - `3462609401` is the best `coreLegalFrac` floor found by the same comb —
 *     still ~27 pp above its 0.15 floor, the loosest band by a wide margin,
 *     same as it was on the old grid.
 *   - `240840574` is a `maxGateDetour` ceiling hit found by the same comb,
 *     measuring exactly 1.5 — a true `'edge'` witness, and (unlike the four
 *     density rows) the search that found it is not the search that proves it
 *     unbeatable; the `<=` comparison against the shipped band does that.
 *
 * **One of the five bands has exactly zero headroom, not three.** The old
 * grid's three-edge finding does not carry over; see the file header. That
 * does not make the two density floors *loose* — 0.001004 and 0.004799 of
 * headroom are one and eight tiles respectively out of 1792, tighter than
 * every other band here bar the true edge.
 *
 * Only one `maxGateDetour` witness is named, where fb064r had two — a second
 * exact hit was not found inside this item's search budget. A wider comb may
 * find one; its absence here is a recorded search limit, not a claim that
 * `240840574` is a freak seed.
 *
 * `gateReachFrac` has no witness on purpose: it is identically 1 on every
 * generated map (`measureTerrain`'s comment explains why — after `sealPockets`,
 * `gatesConnected` makes it a construction invariant), so there is no worst
 * seed to name. Its band is live only for hand-built and edited maps, which
 * `tests/terrain-generation.test.ts` covers directly.
 */
interface Witness {
  seed: number;
  band: Band;
  /** `'floor'` — the band is a minimum; `'ceiling'` — a maximum. */
  side: 'floor' | 'ceiling';
  /**
   * `'edge'` — the value *is* the band, and is unbeatable by construction.
   * `'best-found'` — the best of a finite search, and beatable by a bigger one.
   */
  kind: 'edge' | 'best-found';
  value: number;
  /** The band value this seed sits against, from `/data`. */
  limit: number;
  hash: string;
}

const WITNESSES: readonly Witness[] = [
  {
    seed: 13620,
    band: 'walkableFrac',
    side: 'floor',
    kind: 'best-found',
    value: 1077 / 1792,
    limit: cfg.constraints.minWalkableFrac,
    hash: '5c18ed6d',
    // 1077/1792 walkable — the near-window's best; not exactly reachable
    // (0.6 * 1792 = 1075.2), see the file header.
  },
  {
    seed: 1721604933,
    band: 'walkableFrac',
    side: 'floor',
    kind: 'best-found',
    value: 1077 / 1792,
    limit: cfg.constraints.minWalkableFrac,
    hash: 'f3723519',
    // 1077/1792 — a second, independently found seed at the same value, from
    // the domain-wide comb rather than the near window.
  },
  {
    seed: 1478659760,
    band: 'buildableNormalFrac',
    side: 'floor',
    kind: 'best-found',
    value: 815 / 1792,
    limit: cfg.constraints.minBuildableNormalFrac,
    hash: '908bcd4c',
    // 815/1792 normal — the domain comb's best; not exactly reachable
    // (0.45 * 1792 = 806.4).
  },
  {
    seed: 3462609401,
    band: 'coreLegalFrac',
    side: 'floor',
    kind: 'best-found',
    value: 0.418729817007535,
    limit: cfg.constraints.minCoreLegalFrac,
    hash: '29105b1a',
    // The loosest band by a distance, ~27 pp above its 0.15 floor — a bigger
    // scan than this item's 300,000-seed comb can very likely beat it.
  },
  {
    seed: 240840574,
    band: 'maxGateDetour',
    side: 'ceiling',
    kind: 'edge',
    value: 1.5,
    limit: cfg.constraints.maxGateDetour,
    hash: 'd15bd8f5',
    // exactly the ceiling — found by the same 300,000-seed comb
  },
];

describe('fb064r — the worst seed per band, named and re-measured', () => {
  it('each witness still measures what the ledger says it measures', () => {
    const rows = WITNESSES.map((w) => {
      const m = generateTerrain(w.seed, cfg);
      const q = measureTerrain(m, cfg);
      return `${w.seed} ${w.band}=${fmt(q[w.band])} attempts=${m.attempts} fallback=${m.fallback} hash=${m.hash} legal=${legalUnder(m, cfg)}`;
    });
    expect(rows).toEqual(
      WITNESSES.map(
        (w) =>
          `${w.seed} ${w.band}=${fmt(w.value)} attempts=1 fallback=false hash=${w.hash} legal=true`,
      ),
    );
  });

  it('the true edge has exactly zero headroom; the best-found rows have a little, to the last bit', () => {
    // Not "about zero" for the edge row. `===` against the authored band,
    // because the whole claim is that this seed passes on the `<=` boundary
    // itself. The four best-found rows are asserted to their measured
    // headroom instead — small, but no longer zero (see the file header).
    const headroom = WITNESSES.map((w) => {
      const q = measureTerrain(generateTerrain(w.seed, cfg), cfg);
      const gap = w.side === 'floor' ? q[w.band] - w.limit : w.limit - q[w.band];
      return `${w.seed} ${w.band} ${w.side} ${w.kind} ${fmt(gap)}`;
    });
    expect(headroom).toEqual([
      '13620 walkableFrac floor best-found 0.001004',
      '1721604933 walkableFrac floor best-found 0.001004',
      '1478659760 buildableNormalFrac floor best-found 0.004799',
      '3462609401 coreLegalFrac floor best-found 0.268730',
      '240840574 maxGateDetour ceiling edge 0.000000',
    ]);
    // `fmt` rounds, so the edge row above cannot tell 0 from 1e-9. The check
    // is driven off `kind`, not off a band name, so a future `best-found` row
    // cannot quietly inherit a claim that only an edge can make.
    for (const w of WITNESSES) {
      const v = measureTerrain(generateTerrain(w.seed, cfg), cfg)[w.band];
      if (w.kind === 'edge') expect(v).toBe(w.limit);
      else expect(w.side === 'floor' ? v > w.limit : v < w.limit).toBe(true);
    }
  });

  it('tighter than what was actually found, and each witness is regenerated instead', () => {
    // What "this is the tightest found" costs, made falsifiable. Each witness
    // stops being its own map and plays seed+1's — asserted, not just
    // claimed. For the true edge (`maxGateDetour`) the step is "tighter than
    // the shipped band, by less than the gap between attainable ratios" —
    // 1.4999, as before. For the three best-found rows there is no shipped
    // edge to tighten past, so the step is "tighter than what THIS witness
    // measured" — one tile past its own count, not past `/data`'s 0.6/0.45.
    // That is a narrower claim than fb064r's original (which tightened past
    // the *band*), stated as such rather than smoothed over.
    const tighten = (p: (c: Record<string, number>) => void): TerrainConfig => {
      const raw = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
      p(raw.constraints as Record<string, number>);
      return parseTerrain(raw);
    };
    const cases: ReadonlyArray<[number, TerrainConfig]> = [
      [13620, tighten((c) => (c.minWalkableFrac = 1078 / 1792))],
      [1721604933, tighten((c) => (c.minWalkableFrac = 1078 / 1792))],
      [1478659760, tighten((c) => (c.minBuildableNormalFrac = 816 / 1792))],
      [240840574, tighten((c) => (c.maxGateDetour = 1.4999))],
    ];
    // Every witness above the true edge must be in this list, in `WITNESSES`
    // order minus `coreLegalFrac` (27 pp of headroom is not "tighter by one
    // representable step" territory, and is not claimed to be).
    expect(cases.map(([s]) => s)).toEqual(
      WITNESSES.filter((w) => w.band !== 'coreLegalFrac').map((w) => w.seed),
    );
    // One row per seed rather than four bare `expect`s inside the loop: a bare
    // `expected 1 to be 2` names neither the seed nor the band, which is a hunt
    // — the exact failure mode this file exists to remove (QA bug 3).
    const rows = cases.map(([seed, tighter]) => {
      const shipped = generateTerrain(seed, cfg);
      const under = generateTerrain(seed, tighter);
      const next = generateTerrain(((seed >>> 0) + 1) >>> 0, tighter);
      // "Plays seed+1's map", literally: the key advanced by one AND the tiles
      // are that key's tiles. Compared on `kind`, not on `hash`: `terrainHash`
      // folds the seed in, so two maps with a different reported key have
      // different hashes whether or not a single tile moved (QA bug 4).
      const sameTiles = under.kind.every((k, i) => k === next.kind[i]);
      return (
        `${seed} shipped=${shipped.attempts} under=${under.attempts} ` +
        `fallback=${under.fallback} key=${under.seed} playsSeedPlus1=${sameTiles} ` +
        `legal=${legalMeasure(measureTerrain(under, tighter), tighter)}`
      );
    });
    expect(rows).toEqual(
      cases.map(
        ([seed]) =>
          `${seed} shipped=1 under=2 fallback=false key=${((seed >>> 0) + 1) >>> 0} ` +
          `playsSeedPlus1=true legal=true`,
      ),
    );
  });

  it('the two density floors are no longer reachable exactly, because they fall off the tile lattice', () => {
    // Inverted from fb064r's original claim, which the grid resize made
    // false: both fractions are `k / TILES`, so a floor is attainable exactly
    // iff `floor * TILES` is an integer. At 720 tiles, 0.6 -> 432 and
    // 0.45 -> 324 both were. At 1792 tiles, 0.6 * 1792 = 1075.2 and
    // 0.45 * 1792 = 806.4 — neither is, so **no map can ever measure either
    // band exactly again**, which is exactly why `WITNESSES`' density rows
    // are `'best-found'` now rather than `'edge'`.
    //
    // The measured floor still cannot be *below* the band on a shipped map: a
    // map under it is regenerated at seed+1 (fb064a), so the minimum
    // `generateTerrain` can return is the smallest lattice point >= the band
    // — 1076/1792 = 0.600893 and 807/1792 = 0.450335 — even though neither
    // witness above actually lands on that smallest point (both are one tile
    // short of it, at 1077 and 815 respectively; a bigger search may yet find
    // the true smallest point, or may not, since it need not be attained by
    // any generated map at all).
    const TILES = GRID_W * GRID_H;
    // Rows again rather than bare numbers: `expected 1077 to be 1076` names
    // neither the seed nor the band it belongs to (QA bug 3).
    expect([
      `tiles ${TILES}`,
      `minWalkableFrac ${cfg.constraints.minWalkableFrac} onLattice=${Number.isInteger(
        cfg.constraints.minWalkableFrac * TILES,
      )}`,
      `minBuildableNormalFrac ${cfg.constraints.minBuildableNormalFrac} onLattice=${Number.isInteger(
        cfg.constraints.minBuildableNormalFrac * TILES,
      )}`,
      `smallest lattice point >= minWalkableFrac: ${Math.ceil(cfg.constraints.minWalkableFrac * TILES)}`,
      `smallest lattice point >= minBuildableNormalFrac: ${Math.ceil(cfg.constraints.minBuildableNormalFrac * TILES)}`,
      `13620 walkableCount ${measureTerrain(generateTerrain(13620, cfg), cfg).walkableCount}`,
      `1478659760 normalCount ${measureTerrain(generateTerrain(1478659760, cfg), cfg).normalCount}`,
    ]).toEqual([
      `tiles 1792`,
      `minWalkableFrac 0.6 onLattice=false`,
      `minBuildableNormalFrac 0.45 onLattice=false`,
      `smallest lattice point >= minWalkableFrac: 1076`,
      `smallest lattice point >= minBuildableNormalFrac: 807`,
      `13620 walkableCount 1077`,
      `1478659760 normalCount 815`,
    ]);
  });
});

/**
 * The sample, now in `tests/terrain-sample.ts` so fb065a's headroom curve is
 * measured over the *same* seeds rather than a copy of them (fb065a QA): a
 * change here used to redden this file, get re-recorded, and leave that one
 * green on the old population. The design notes moved with it.
 */

interface SampleRun {
  stats: Record<Band, BandStat>;
  retryTaking: number[];
  fellBack: number[];
  illegal: number[];
  outOfDomain: number[];
}

/**
 * The sweep, computed once and lazily — **not** in the `describe` body.
 *
 * Review caught the first draft doing it at collection time. Two costs, both
 * measured: `vitest -t "lattice"` still paid the full sweep to run one test
 * that generates two maps, and a throw inside the loop (a seed regression, an
 * `approachField` that failed to drain) surfaced as a *file collection error*
 * — all ten tests gone, including the four witness tests that would have named
 * the cause — with no test timeout applying. Inside an `it`, the same throw is
 * one red test.
 */
let sampleRun: SampleRun | null = null;
function runSample(): SampleRun {
  if (sampleRun) return sampleRun;
  const stats = emptyStats();
  const retryTaking: number[] = [];
  const fellBack: number[] = [];
  const illegal: number[] = [];
  const outOfDomain: number[] = [];
  for (const s of sampleSeeds()) {
    if (s < MIN_TERRAIN_SEED || s > MAX_TERRAIN_SEED) {
      outOfDomain.push(s);
      continue;
    }
    const m = generateTerrain(s, cfg);
    const q = measureTerrain(m, cfg);
    if (m.attempts > 1) retryTaking.push(s);
    if (m.fallback) fellBack.push(s);
    if (!legalMeasure(q, cfg)) illegal.push(s);
    accumulate(stats, s, q);
  }
  sampleRun = { stats, retryTaking, fellBack, illegal, outOfDomain };
  return sampleRun;
}

describe('fb064r — the sample ledger over the whole domain', () => {
  it('samples 12,000 in-domain seeds, every one legal and generated', () => {
    const { stats, fellBack, illegal, outOfDomain } = runSample();
    // The first three pin the sampling *design*, not a measurement: they are
    // true by construction today, and they exist so that editing `SAMPLE` or
    // `SAMPLE_COMB_N` without re-recording the ledger below fails here, where
    // the reason is named, instead of as an unexplained row diff.
    expect(SAMPLE_N).toBe(12000);
    expect(COMB_STEP).toBe(715827);
    expect((SAMPLE_COMB_N - 1) * COMB_STEP).toBeLessThanOrEqual(MAX_TERRAIN_SEED);
    expect({ outOfDomain, fellBack, illegal }).toEqual({
      outOfDomain: [],
      fellBack: [],
      illegal: [],
    });
    expect(stats.walkableFrac.n).toBe(SAMPLE_N);
  });

  it('matches the recorded per-band min/mean/max ledger', () => {
    // fb166 re-recorded this at 56x32 (was fb064r, 2026-09-04, at 36x20).
    //
    // Read these as a *distribution*, not as the domain's extremes — the named
    // witnesses above hold those, all at least as extreme as the row here.
    // `gateReachFrac` is 1 by construction on generated output (see
    // `measureTerrain`'s comment: after `sealPockets`, `gatesConnected`
    // implies every gate reaches every walkable tile), so its row is a flat
    // line on purpose and its @seed is just the first seed of the sample.
    const { stats } = runSample();
    expect(ledger(stats)).toEqual({
      walkableFrac: 'min 0.606027 @746607561 · mean 0.736371 · max 0.777344 @515395440',
      buildableNormalFrac: 'min 0.473214 @1871887605 · mean 0.583428 · max 0.655692 @4043706723',
      gateReachFrac: 'min 1.000000 @0 · mean 1.000000 · max 1.000000 @0',
      coreLegalFrac: 'min 0.437365 @1922711322 · mean 0.536919 · max 0.651101 @-1502',
      maxGateDetour: 'min 1.000000 @6442443 · mean 1.094839 · max 1.492063 @-1372',
    });
  });

  it('records what share of the domain takes the seed+1 retry path', () => {
    // fb064a read the retry rate off seeds 1..20000 and got 5 seeds (0.025%);
    // fb064l re-measured the same window at 18 (0.09%). fb166 re-measured over
    // the domain at 56x32: 23 of 12,000 — 0.19%, about half fb064r's 0.36% on
    // the old grid (the bigger board gives every band more room, so the
    // retry-taking share fell along with the density-floor headroom widening
    // — see the file header).
    //
    // The set is asserted BEFORE the count. QA found the reverse ordering
    // hiding the one diff this file calls its most retune-sensitive artifact:
    // a retune that moves seeds in and out of the retry path failed with
    // `expected 50 to be 43` and never printed which seeds moved — a hunt,
    // from the assertion whose whole purpose is to be a diff.
    const { retryTaking } = runSample();
    expect(retryTaking).toEqual([...RETRY_SEEDS]);
    expect(retryTaking.length).toBe(23);
  });
});

/**
 * The retry-taking seeds inside `SAMPLE`, pinned as a set.
 *
 * A seed is here because `attempt(seed)` produced a map that failed a band, so
 * the generator moved to `seed + 1`. That makes this list the most retune-
 * sensitive thing in the file: it is the exact boundary between "this seed's
 * own map ships" and "this seed plays the next seed's map", and a density,
 * `blob` or band edit moves seeds across it in both directions.
 */
const RETRY_SEEDS: readonly number[] = [
  55118679, 951334083, 1529722299, 1823927196, 2098804764, 2720142600, 3030811518, 3551933574,
  3625663755, 4220515992, -1019, -445, -329, -43, 3000000366, 3000000628, 3000001100, 3000001156,
  2147482869, 2147483070, 2147483973, 2147484443, 2147484515,
];

/**
 * `cfg`'s generation parameters with every band switched off.
 *
 * The trick is fb064j's and it is here for the same reason: `attempt(k)` is not
 * exported, so this is the only way to look at the map a *skipped* key produced
 * rather than re-reading the generator's own report of the walk it just did.
 * Radii, jitter, blob and densities — the only fields `attempt` reads — are
 * untouched, so the returned map is `attempt(k)` itself, and measuring it
 * against shipped bands is an independent verdict on why the key was skipped.
 */
const alwaysAccepts: TerrainConfig = (() => {
  const raw = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
  Object.assign(raw.constraints as Record<string, number>, {
    minWalkableFrac: 0,
    minBuildableNormalFrac: 0,
    minGateReachFrac: 0,
    minCoreLegalFrac: 0,
    minCorridorWidth: 1,
    maxGateDetour: 99,
  });
  return parseTerrain(raw);
})();

interface RetryRun {
  stats: Record<Band, BandStat>;
  attemptCounts: number[];
  notLegal: number[];
  badProvenance: number[];
  notDegenerate: number[];
  tally: Record<string, number>;
}

/** Lazy for the same reason as `runSample` — see its comment. */
let retryRun: RetryRun | null = null;
function runRetrySet(): RetryRun {
  if (retryRun) return retryRun;
  const stats = emptyStats();
  const attempts = new Set<number>();
  const notLegal: number[] = [];
  const badProvenance: number[] = [];
  const notDegenerate: number[] = [];
  const tally: Record<string, number> = {};
  for (const s of RETRY_SEEDS) {
    const m = generateTerrain(s, cfg);
    const q = measureTerrain(m, cfg);
    attempts.add(m.attempts);
    if (!legalMeasure(q, cfg)) notLegal.push(s);
    if (m.requestedSeed !== s || m.seed !== ((s >>> 0) + m.attempts - 1) >>> 0) {
      badProvenance.push(s);
    }
    accumulate(stats, s, q);
    for (let n = 0; n < m.attempts - 1; n++) {
      const probe = generateTerrain(((s >>> 0) + n) >>> 0, alwaysAccepts);
      const failed = failedBands(measureTerrain(probe, cfg), cfg);
      if (probe.attempts !== 1 || probe.fallback || failed.length === 0) notDegenerate.push(s);
      for (const f of failed) tally[f] = (tally[f] ?? 0) + 1;
    }
  }
  retryRun = {
    stats,
    attemptCounts: [...attempts].sort((a, b) => a - b),
    notLegal,
    badProvenance,
    notDegenerate,
    tally,
  };
  return retryRun;
}

describe('fb064r — the retry-taking seed set, pinned the same way', () => {
  it('every one in this sample retries exactly once and lands on a legal map', () => {
    const { attemptCounts, notLegal, badProvenance, notDegenerate } = runRetrySet();
    expect(RETRY_SEEDS.length).toBe(23);
    expect(attemptCounts).toEqual([2]);
    expect({ notLegal, badProvenance, notDegenerate }).toEqual({
      notLegal: [],
      badProvenance: [],
      notDegenerate: [],
    });
  });

  it('names the band that actually drives the retry path', () => {
    // The finding this ledger is for. fb064a's Log frames the retry path as a
    // *density* problem ("any density or `blob` retune pushes seeds into that
    // path"), which was true when `walkableFrac` was the only band a seed
    // could miss. Since fb064o added the approach band it is not: fb166
    // re-measured at 56x32 and 22 of the 23 skipped keys are rejected for
    // `maxGateDetour`, one for `walkableFrac` and one for `buildableNormalFrac`
    // — one skipped key (3551933574) fails *both* density bands at once, which
    // is why this tally sums to 24, one more than `RETRY_SEEDS.length`. The
    // retry rate is still mostly a fact about `maxGateDetour: 1.5` and
    // `ROOM_RADIUS`, not about `density`.
    expect(runRetrySet().tally).toEqual({ maxGateDetour: 22, walkableFrac: 1, buildableNormalFrac: 1 });
  });

  it('is a one-step walk only in this sample — deeper walks exist domain-wide', () => {
    // All 23 sampled seeds retry exactly once, which reads like a property of
    // the generator and is not one. A 400,000-seed comb of my own (stride
    // 2 * floor(2**32/400000/2)+1) found one `attempts: 3` seed and zero
    // fallbacks — deeper than that was not found inside this item's search
    // budget, and shallower coverage than fb064r's 6,000,000-seed scan on the
    // old grid is recorded rather than hidden. It is pinned so the distinction
    // stays visible, and because a retune that makes the bands harder will
    // deepen the walk here first — the fallback map is eight steps away, and
    // nothing else in the suite watches the distance.
    //
    // The double-band failure the old grid's version of this test used a
    // *different* seed to show is visible in this sample's own tally instead
    // (see the test above): 3551933574's skipped key fails both density bands
    // at once, which is why fb166 does not also chase a second domain-wide
    // seed for the same shape.
    const walks = [1080131463].map((s) => {
      const m = generateTerrain(s, cfg);
      const causes: string[] = [];
      for (let n = 0; n < m.attempts - 1; n++) {
        const probe = generateTerrain(((s >>> 0) + n) >>> 0, alwaysAccepts);
        causes.push(`+${n}:${failedBands(measureTerrain(probe, cfg), cfg).join('|')}`);
      }
      return (
        `${s} attempts=${m.attempts} key=${m.seed} fallback=${m.fallback} ` +
        `legal=${legalUnder(m, cfg)} ${causes.join(' ')}`
      );
    });
    expect(walks).toEqual([
      '1080131463 attempts=3 key=1080131465 fallback=false legal=true ' +
        '+0:maxGateDetour +1:maxGateDetour',
    ]);
    // `maxAttempts` is the distance to the flat arena; the deepest walk found
    // anywhere is 3, so there is real room left before a seed ships flat.
    expect(cfg.maxAttempts).toBe(8);
  });

  it('matches the recorded per-band ledger for retried maps', () => {
    // fb166 re-recorded this at 56x32. Worth reading next to the sample
    // ledger: a retried map is not a marginal map — its worst
    // `buildableNormalFrac` (0.618304) sits above the sample's own worst
    // (0.473214) because the band that rejected the first attempt is the one
    // being redrawn.
    expect(ledger(runRetrySet().stats)).toEqual({
      walkableFrac: 'min 0.667411 @1529722299 · mean 0.734885 · max 0.771205 @2098804764',
      buildableNormalFrac: 'min 0.501674 @1529722299 · mean 0.578319 · max 0.618304 @3000001156',
      gateReachFrac: 'min 1.000000 @55118679 · mean 1.000000 · max 1.000000 @55118679',
      coreLegalFrac: 'min 0.477801 @2147484515 · mean 0.534388 · max 0.573382 @2098804764',
      maxGateDetour: 'min 1.016000 @3551933574 · mean 1.095399 · max 1.196850 @3030811518',
    });
  });
});
