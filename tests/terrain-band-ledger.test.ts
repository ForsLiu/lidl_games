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
 * **fb166 re-measured every number in this file at the 56x32 grid**
 * (`data/terrain.json` unchanged) and found a structural change, not just
 * moved numbers: at 36x20 the tile lattice is `k/720`, and both density
 * floors (`minWalkableFrac: 0.6`, `minBuildableNormalFrac: 0.45`) times 720
 * are integers, so a map could land exactly on either one and four of
 * fb064r's six witnesses did. At 56x32 the lattice is `k/1792`, and neither
 * `0.6 * 1792` (1075.2) nor `0.45 * 1792` (806.4) is an integer — so **no map
 * at this grid size can ever measure either floor exactly**, full stop, no
 * search required. Every witness below is therefore `'best-found'`, not
 * `'edge'`, except `maxGateDetour`'s ceiling: `1.5` is a ratio of integer path
 * costs rather than a tile-count fraction, and it is still exactly reachable
 * (see its witness). fb166's searches are also smaller than fb064r's original
 * multi-million-seed scans — a 250,000-point domain comb, honestly sized to
 * this item's budget rather than reused — so read every `'best-found'` value
 * below as "the best this item found," replaceable by a deeper search later,
 * the same standing fb064r's own `coreLegalFrac` witness always had.
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
 * **Two kinds of row, and conflating them is a mistake this file already made
 * once.** An `'edge'` row is provable: a map outside its band is regenerated at
 * seed+1, so the band value itself is the extreme and no seed can beat it — the
 * search only had to find one seed that reaches it. A `'best-found'` row is a
 * **search result**, and no scan of a 4.3-billion-seed domain can promote a
 * search result to a property.
 *
 * **fb166 changed which bands are which.** At 56x32 neither density floor
 * (`minWalkableFrac: 0.6`, `minBuildableNormalFrac: 0.45`) lands on the tile
 * lattice (`k/1792`) — `0.6 * 1792 = 1075.2` and `0.45 * 1792 = 806.4`, neither
 * an integer — so **no map at this grid size can ever measure either exactly**,
 * the same structural argument that used to make them `'edge'` at 36x20 now
 * makes them provably unreachable, and their rows below are `'best-found'`
 * instead. `coreLegalFrac`'s floor was always `'best-found'` (~27 pp away from
 * anything the generator produces here, wider than fb064r's ~22 pp gap) for the
 * same reason it always was: the band is a search result, not a construction
 * limit. `maxGateDetour`'s ceiling is the one survivor: `1.5` is a ratio of
 * integer path costs (`ORTHO_COST 10`, `DIAG_COST 14`) rather than a
 * tile-count fraction, and a real seed still hits it exactly (below).
 *
 * Provenance, because "worst" is only as good as the search behind it — every
 * seed below was found by fb166's own 250,000-point domain comb (stride
 * 17179, parameters in the Log), honestly smaller than fb064r's original
 * multi-million-seed scans and so read as "the best this item found," not as
 * a proven domain worst for the three `'best-found'` rows.
 *
 * **One of the four bands still has exactly zero headroom.** `maxGateDetour`
 * is the survivor from the paragraph above: a seed measuring exactly
 * `maxGateDetour: 1.5` ships for the same reason a seed measuring exactly
 * `0.6` walkable used to at 36x20 — `terrainLegal` compares with `<=` and
 * `>=` — so tightening that one band by one representable step is not a tune,
 * it is a decision to regenerate that seed's map. The two density floors no
 * longer have this property at all: tightening either one moves the *search
 * result* fb166 found, not a provable extreme, so "one step tighter"
 * demonstrates nothing about them the way it used to.
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
    seed: 1603865798,
    band: 'walkableFrac',
    side: 'floor',
    kind: 'best-found',
    value: 1077 / 1792,
    limit: cfg.constraints.minWalkableFrac,
    hash: '39b7f27c',
    // 1077/1792 walkable = 0.601004 — one lattice step (1/1792) above the true
    // closest-representable value (1076/1792 = 0.600893); fb166's 250,000-point
    // comb did not happen to land on that one. Best found, not provably worst.
  },
  {
    seed: 3541588282,
    band: 'buildableNormalFrac',
    side: 'floor',
    kind: 'best-found',
    value: 822 / 1792,
    limit: cfg.constraints.minBuildableNormalFrac,
    hash: '753d85e6',
    // 822/1792 normal = 0.458705 against the 0.45 floor — genuine headroom
    // (0.008705, ~15.6 tiles), unlike the pre-fb166 36x20 floor this band used
    // to sit on exactly.
  },
  {
    seed: 774412141,
    band: 'coreLegalFrac',
    side: 'floor',
    kind: 'best-found',
    value: 399 / 941,
    limit: cfg.constraints.minCoreLegalFrac,
    hash: '48406c1b',
    // 399 legal anchors / 941 normal tiles = 0.424017 — 27.4 pp above its 0.15
    // floor. This row has always been the loosest by a distance and the one a
    // bigger scan can most easily beat; fb064r's own pre-fb166 witness was
    // similarly provisional at ~22.7 pp of headroom.
  },
  {
    seed: 129684271,
    band: 'maxGateDetour',
    side: 'ceiling',
    kind: 'edge',
    value: 1.5,
    limit: cfg.constraints.maxGateDetour,
    hash: '4669fcbb',
    // exactly the ceiling — fb064o's band, still exactly reachable at 56x32
    // because it is a path-cost ratio, not a tile-count fraction.
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

  it('one band has exactly zero headroom; the rest are real search results', () => {
    // Not "about zero" for the one that is: `===` against the authored band,
    // because the claim for `maxGateDetour` is that its witness passes on the
    // `<=` boundary itself. fb166 narrowed this from three bands to one — see
    // the header's fb166 paragraph for why the two density floors stopped
    // being provable edges at 56x32.
    const headroom = WITNESSES.map((w) => {
      const q = measureTerrain(generateTerrain(w.seed, cfg), cfg);
      const gap = w.side === 'floor' ? q[w.band] - w.limit : w.limit - q[w.band];
      return `${w.seed} ${w.band} ${w.side} ${w.kind} ${fmt(gap)}`;
    });
    expect(headroom).toEqual([
      '1603865798 walkableFrac floor best-found 0.001004',
      '3541588282 buildableNormalFrac floor best-found 0.008705',
      '774412141 coreLegalFrac floor best-found 0.274017',
      '129684271 maxGateDetour ceiling edge 0.000000',
    ]);
    // `fmt` rounds, so the rows above cannot tell 0 from 1e-9. The one `edge`
    // row is asserted bit-exact — and the check is driven off `kind`, not off
    // a band name, so a `best-found` row cannot quietly inherit a claim that
    // only an edge can make. That inversion is what QA broke here, pre-fb166.
    for (const w of WITNESSES) {
      const v = measureTerrain(generateTerrain(w.seed, cfg), cfg)[w.band];
      if (w.kind === 'edge') expect(v).toBe(w.limit);
      else expect(w.side === 'floor' ? v > w.limit : v < w.limit).toBe(true);
    }
  });

  it('one representable step tighter and the edge witness is regenerated instead', () => {
    // What "zero headroom" costs, made falsifiable. The witness stops being
    // its own map and plays seed+1's — asserted, not just claimed.
    //
    // Only `maxGateDetour` has a step that means this any more (see the
    // header's fb166 paragraph): the two density floors are `'best-found'` now,
    // so tightening them by a lattice step moves a search result, not a
    // provable extreme, and would demonstrate nothing about the *band*. For
    // the detour there is no lattice to name either — it is a ratio of integer
    // path costs (`PATH_ORTHO_COST 10`, `PATH_DIAG_COST 14`), whose attainable
    // values near 1.5 are roughly 0.005 apart, so any threshold in that gap
    // behaves identically and 1.4999 is simply inside it.
    //
    // This is what would catch a headroom claim going stale silently: a
    // witness that quietly gained headroom would survive the tightening here.
    const tighten = (p: (c: Record<string, number>) => void): TerrainConfig => {
      const raw = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
      p(raw.constraints as Record<string, number>);
      return parseTerrain(raw);
    };
    const cases: ReadonlyArray<[number, TerrainConfig]> = [
      [129684271, tighten((c) => (c.maxGateDetour = 1.4999))],
    ];
    // Every `edge` witness must be in this list: the list is the proof, so a
    // witness added without one would be claiming zero headroom with nothing
    // behind it.
    expect(cases.map(([s]) => s)).toEqual(
      WITNESSES.filter((w) => w.kind === 'edge').map((w) => w.seed),
    );
    // One row per seed rather than five bare `expect`s inside the loop: a bare
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

  it('fb166: the two density floors are NOT reachable exactly at this grid size', () => {
    // The mirror image of the pre-fb166 finding this test used to make. Both
    // fractions are `k / TILES`, so a floor is attainable exactly iff
    // `floor * TILES` is an integer: at 36x20, `TILES = 720`, and `0.6 * 720 =
    // 432` and `0.45 * 720 = 324` both were. At fb166's 56x32, `TILES = 1792`,
    // and `0.6 * 1792 = 1075.2` / `0.45 * 1792 = 806.4` — neither is an
    // integer, so **no map can ever measure either floor exactly**, which this
    // test states as a mathematical fact rather than as a claim about any
    // particular seed: it costs nothing to check `Number.isInteger`, and it is
    // true for every seed there is, not just the ones this item searched.
    //
    // The measured floor cannot be *below* the band on a shipped map at all: a
    // map under it is regenerated at seed+1 (fb064a), so the minimum
    // `generateTerrain` can return is the smallest lattice point >= the band —
    // `ceil(floor * TILES) / TILES`, computed below rather than searched for,
    // since a search only ever finds *a* seed that reaches it, never proves one
    // must exist. Both closest points carry real, unavoidable headroom the
    // band itself never asked for: 1076/1792 = 0.600893 (0.000893 over 0.6) and
    // 807/1792 = 0.450335 (0.000335 over 0.45). fb166's own witnesses above sit
    // one further lattice step out than that (1077 and 822, not 1076 and 807),
    // because the 250,000-point comb this item ran did not happen to land on
    // the closest possible point — which is exactly why this test proves the
    // ceiling arithmetically instead of asserting a witness against it.
    //
    // From the grid rather than written as 1792 or 720: if the arena is ever
    // resized again, the lattice moves again, and this test is what notices
    // whether the new floors land on it.
    const TILES = GRID_W * GRID_H;
    expect([
      `tiles ${TILES}`,
      `minWalkableFrac ${cfg.constraints.minWalkableFrac} onLattice=${Number.isInteger(
        cfg.constraints.minWalkableFrac * TILES,
      )}`,
      `minBuildableNormalFrac ${cfg.constraints.minBuildableNormalFrac} onLattice=${Number.isInteger(
        cfg.constraints.minBuildableNormalFrac * TILES,
      )}`,
      `closest walkableCount >= floor: ${Math.ceil(cfg.constraints.minWalkableFrac * TILES)}`,
      `closest normalCount >= floor: ${Math.ceil(cfg.constraints.minBuildableNormalFrac * TILES)}`,
    ]).toEqual([
      `tiles 1792`,
      `minWalkableFrac 0.6 onLattice=false`,
      `minBuildableNormalFrac 0.45 onLattice=false`,
      `closest walkableCount >= floor: 1076`,
      `closest normalCount >= floor: 807`,
    ]);
    // And the witnesses above are consistent with that: each measures a whole
    // number of tiles over the floor's own lattice point, never under it.
    const w1 = measureTerrain(generateTerrain(1603865798, cfg), cfg);
    expect(w1.walkableCount).toBeGreaterThanOrEqual(1076);
    const w2 = measureTerrain(generateTerrain(3541588282, cfg), cfg);
    expect(w2.normalCount).toBeGreaterThanOrEqual(807);
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
    // Recorded 2026-09-04 (fb064r) against shipped `/data`.
    //
    // Read these as a *distribution*, not as the domain's extremes — the
    // named witnesses above hold those. Each witness is at least as extreme as
    // the row here and three of the four strictly more so (0.600000 against
    // 0.601389, 0.450000 against 0.456944, 0.388102 against 0.419098); the
    // detour ceiling is the exception, and the exception is worth stating
    // plainly because it is the one place the two layers are *not*
    // independent: 816758607 = 1141 × 715827 is comb index 1141, so it is in
    // this sample, which is how that witness was found and why this row and
    // the witness row move together. `gateReachFrac` is 1 by
    // construction on generated output (see `measureTerrain`'s comment: after
    // `sealPockets`, `gatesConnected` implies every gate reaches every
    // walkable tile), so its row is a flat line on purpose and its @seed is
    // just the first seed of the sample.
    // Re-measured at fb166's 56x32 grid; `data/terrain.json` unchanged
    // (pre-fb166 at 36x20: walkable 0.601389/0.692311/0.733333, buildable
    // 0.456944/0.549509/0.616667, coreLegal 0.419098/0.517837/0.633416, detour
    // 1.000000/1.091948/1.500000).
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
    // fb064l re-measured the same window at 18 (0.09%). Over the domain it is
    // 23 of 12,000 at fb166's 56x32 grid — 0.19% (pre-fb166 at 36x20 it was 43,
    // 0.36%) — still well above the near window, so the near window is still
    // not representative of the retry path, just of a smaller distance now
    // that the bigger grid gives every band more room.
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
// Re-measured at fb166's 56x32 grid; `data/terrain.json` unchanged. 23, not
// the pre-fb166 43 — a bigger interior means fewer seeds need a retry at all.
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
    // Re-measured at fb166's 56x32 grid (pre-fb166: 43).
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
    // could miss. Since fb064o added the approach band it is not, and fb166's
    // re-measurement at 56x32 makes the point even more starkly than fb064r's
    // own 34-of-43 did: 22 of the 23 skipped keys are rejected for
    // `maxGateDetour`, and only one each for `walkableFrac` and
    // `buildableNormalFrac` — the same single seed, 3551933574, which fails
    // *both* on its first attempt (see the next test), so the tally's 24
    // entries come from 23 seeds. The retry rate is now almost entirely a fact
    // about `maxGateDetour: 1.5` and `ROOM_RADIUS`, not about `density`.
    expect(runRetrySet().tally).toEqual({ maxGateDetour: 22, walkableFrac: 1, buildableNormalFrac: 1 });
  });

  it('is a one-step walk only in this sample — deeper walks exist domain-wide', () => {
    // All 23 sampled seeds retry exactly once, which reads like a property of
    // the generator and is not one. Re-measured at fb166's 56x32 grid: a
    // 300,000-point comb (stride 14317, the same one this test used pre-fb166)
    // found exactly one `attempts: 3` seed rather than the pre-fb166 two — the
    // bigger grid's headroom makes a deep walk rarer, same as everything else
    // in this file. It is pinned so the distinction stays visible, and because
    // a retune that makes the bands harder will deepen the walk here first —
    // the fallback map is eight steps away, and nothing else in the suite
    // watches the distance.
    //
    // The multi-band shape the sample's own tally cannot show — a skipped map
    // failing *two* bands at once — still exists too, but at fb166's grid it
    // shows up inside the 23-seed *sample itself* rather than needing a
    // separate domain search: seed 3551933574 (already one of `RETRY_SEEDS`)
    // fails both `walkableFrac` and `buildableNormalFrac` on its own attempt,
    // which is exactly why "names the band that actually drives the retry
    // path"'s tally sums to 24 over 23 seeds.
    const walks = [3769437028].map((s) => {
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
      '3769437028 attempts=3 key=3769437030 fallback=false legal=true ' +
        '+0:maxGateDetour +1:maxGateDetour',
    ]);
    const doubleBand = generateTerrain(3551933574, cfg);
    const probe = generateTerrain(3551933574, alwaysAccepts);
    expect(failedBands(measureTerrain(probe, cfg), cfg).sort()).toEqual([
      'buildableNormalFrac',
      'walkableFrac',
    ]);
    expect(doubleBand.attempts).toBe(2);
    // `maxAttempts` is the distance to the flat arena; the deepest walk found
    // anywhere is 3, so there is real room left before a seed ships flat.
    expect(cfg.maxAttempts).toBe(8);
  });

  it('matches the recorded per-band ledger for retried maps', () => {
    // Re-measured at fb166's 56x32 grid; `data/terrain.json` unchanged (recorded
    // pre-fb166 at 36x20, 2026-09-04: walkable 0.619444/0.695413/0.725000,
    // buildable 0.481944/0.549193/0.604167, coreLegal 0.451282/0.525260/0.583133,
    // detour 1.000000/1.108907/1.203390). Worth reading next to the sample
    // ledger: a retried map is not a marginal map. Its worst `walkableFrac` is
    // 0.667 against the sample's 0.606 — the seed+1 map clears the bands by
    // more than the average seed's does, because the band that rejected the
    // first attempt is the one being redrawn.
    expect(ledger(runRetrySet().stats)).toEqual({
      walkableFrac: 'min 0.667411 @1529722299 · mean 0.734885 · max 0.771205 @2098804764',
      buildableNormalFrac: 'min 0.501674 @1529722299 · mean 0.578319 · max 0.618304 @3000001156',
      gateReachFrac: 'min 1.000000 @55118679 · mean 1.000000 · max 1.000000 @55118679',
      coreLegalFrac: 'min 0.477801 @2147484515 · mean 0.534388 · max 0.573382 @2098804764',
      maxGateDetour: 'min 1.016000 @3551933574 · mean 1.095399 · max 1.196850 @3030811518',
    });
  });
});
