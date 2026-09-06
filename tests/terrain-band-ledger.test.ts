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
 * **Re-found whole at fb166's 56x32 resize.** Every witness below is a fresh
 * seed: at 720 tiles the old ones sat on the raw config numbers exactly, and
 * at 1792 tiles they do not even measure a similar value, because a scattered
 * map's tile counts are a function of the RNG walk over the *whole* arena, not
 * a local property that survives a resize. The search sizes are much smaller
 * than fb064r's original ones (below, per row) — a resized arena costs ~2.5x
 * per generation (measured: ~2ms/seed against fb064r's ~0.75ms), so this pass
 * spent its budget on the two bands whose *shape* changed (see next paragraph)
 * rather than trying to match the original 12,000,000-seed `coreLegalFrac`
 * search.
 *
 * **Two kinds of row, and conflating them is a mistake this file already made
 * once.** Four of the five witnesses sit on a band *edge*, and an edge is
 * provable: a map outside its band is regenerated at seed+1, so the band value
 * itself is the extreme and no seed can beat it — the search only had to find
 * one seed that reaches it. `coreLegalFrac`'s floor is far from anything the
 * generator produces, so its extreme is a **search result**, and no scan of a
 * 4.3-billion-seed domain can promote a search result to a property.
 *
 * **A third kind of gap, new at this resize.** `walkableFrac` and
 * `buildableNormalFrac` are `k / 1792` — and 1792 does not divide evenly into
 * either `0.6` or `0.45` (`0.6 * 1792 = 1075.2`, `0.45 * 1792 = 806.4`), unlike
 * the old 720-tile arena where both products were exact integers. So no seed
 * can measure *exactly* `0.6` or `0.45` any more — the true floor a map can
 * reach is the smallest lattice point at or above it, `1076/1792 =
 * 0.600446...` and `807/1792 = 0.450335...`. Both witnesses below sit on
 * *that* floor, proven unbeatable the same way as before (the "one
 * representable step tighter" test), and both now carry a `latticeLimit`
 * distinct from `limit` — the number this file's own older test, "the two
 * density floors are reachable exactly because they land on the tile
 * lattice", already said to watch for on a resize.
 *
 * Provenance, because "worst" is only as good as the search behind it:
 *   - `362206641`, `1984600955` (`walkableFrac`) and `668782116`
 *     (`buildableNormalFrac`) come from two combs across the uint32 domain —
 *     250,000 seeds at stride 17179 starting at 0, then 800,000 at stride
 *     40961 starting at 5, run in parallel shards — plus a third, 1,200,000
 *     seeds at stride 92839 starting at 3, that is where `buildableNormalFrac`
 *     finally landed exactly on `807/1792`. `walkableFrac`'s floor turned up
 *     twice independently, in the second and third combs.
 *   - `3819441428`, `2627893921` (`maxGateDetour`) turned up in the first two
 *     of those same three combs — the ceiling is comparatively dense, exactly
 *     as it was pre-resize.
 *   - `2003509526` (`coreLegalFrac`) is the best of the same ~2,250,000-seed
 *     combined search — a `coreLegalFrac` of 0.416488, looser than the
 *     pre-resize floor's own witness (0.376694) because this search is two
 *     orders of magnitude smaller than fb064r's 12,000,000-seed one, not
 *     because the band moved. A bigger search is expected to beat it; that is
 *     what `kind: 'best-found'` says.
 *
 * **Only one of the three tight bands has exactly zero headroom against its
 * raw `/data` number now — `maxGateDetour`.** The two density floors have
 * exactly zero headroom against their *lattice-constrained* true minimum
 * (`latticeLimit`) — provably unbeatable, same as before — but a small,
 * mechanically forced, nonzero headroom against the raw config number
 * (`limit`), because the resize broke the integer alignment those two bands
 * happened to have at 720 tiles. That is a fact about arithmetic (`0.6 *
 * 1792` is not an integer), not a retune, and it is measured below rather
 * than argued.
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
  /** What this seed's map actually measures. */
  value: number;
  /** The band value this seed sits against, from `/data`. */
  limit: number;
  /**
   * The true best value the tile lattice at this grid size admits — equal to
   * `limit` unless the two disagree (only `walkableFrac`/`buildableNormalFrac`
   * can disagree, and only because `GRID_W * GRID_H` does not divide evenly
   * into the authored fraction). An `edge` witness's `value` always equals its
   * `latticeLimit`, proving the witness unbeatable; `value` need not equal the
   * looser `limit`.
   */
  latticeLimit: number;
  hash: string;
}

const TILES = GRID_W * GRID_H;
/** The smallest (floor) / largest (ceiling) lattice point a `k / TILES` band admits. */
const latticeFloor = (limit: number): number => Math.ceil(limit * TILES) / TILES;

const WITNESSES: readonly Witness[] = [
  {
    seed: 362206641,
    band: 'walkableFrac',
    side: 'floor',
    kind: 'edge',
    value: 1076 / TILES,
    limit: cfg.constraints.minWalkableFrac,
    latticeLimit: latticeFloor(cfg.constraints.minWalkableFrac),
    hash: 'a5fc750b',
    // 1076/1792 walkable — the smallest lattice point >= 0.6, found in a
    // 250,000-seed comb (stride 17179 from 0).
  },
  {
    seed: 1984600955,
    band: 'walkableFrac',
    side: 'floor',
    kind: 'edge',
    value: 1076 / TILES,
    limit: cfg.constraints.minWalkableFrac,
    latticeLimit: latticeFloor(cfg.constraints.minWalkableFrac),
    hash: '52290f8d',
    // a second, independently found seed on the same lattice floor (1,200,000-
    // seed comb, stride 92839 from 3).
  },
  {
    seed: 668782116,
    band: 'buildableNormalFrac',
    side: 'floor',
    kind: 'edge',
    value: 807 / TILES,
    limit: cfg.constraints.minBuildableNormalFrac,
    latticeLimit: latticeFloor(cfg.constraints.minBuildableNormalFrac),
    hash: '95c8d0cd',
    // 807/1792 normal — the smallest lattice point >= 0.45, found in the
    // 1,200,000-seed comb (stride 92839 from 3).
  },
  {
    seed: 2003509526,
    band: 'coreLegalFrac',
    side: 'floor',
    kind: 'best-found',
    value: 0.4164882226980728,
    limit: cfg.constraints.minCoreLegalFrac,
    latticeLimit: cfg.constraints.minCoreLegalFrac,
    hash: 'b8a8bc56',
    // 389 legal anchors / 934 normal tiles = 0.416488 — the loosest band by a
    // distance, 26.6 pp above its 0.15 floor, and the only row here that a
    // bigger scan can beat. Best of ~2,250,000 seeds combined across the three
    // combs named above (fb166 resize pass); a replacement seed arriving one
    // day from a bigger search is expected and is not evidence of a
    // regression, exactly as fb064r's own pre-resize witness said of itself.
  },
  {
    seed: 3819441428,
    band: 'maxGateDetour',
    side: 'ceiling',
    kind: 'edge',
    value: 1.5,
    limit: cfg.constraints.maxGateDetour,
    latticeLimit: cfg.constraints.maxGateDetour,
    hash: 'fa481ce4',
    // exactly the ceiling — found in the first 250,000-seed comb
  },
  {
    seed: 2627893921,
    band: 'maxGateDetour',
    side: 'ceiling',
    kind: 'edge',
    value: 1.5,
    limit: cfg.constraints.maxGateDetour,
    latticeLimit: cfg.constraints.maxGateDetour,
    hash: 'd7a89f65',
    // a second seed exactly on the detour ceiling, from the second comb
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

  it('every edge witness sits exactly on its true lattice limit, to the last bit', () => {
    // Not "about zero". `===` against `latticeLimit`, because the whole claim
    // is that these seeds pass on the tile lattice's own boundary — which is
    // `limit` itself for `maxGateDetour` (a ratio, not a tile count) but a
    // touch above `limit` for the two density floors at this grid size (see
    // the header: `1792 * 0.6`/`1792 * 0.45` are not integers).
    const headroom = WITNESSES.map((w) => {
      const q = measureTerrain(generateTerrain(w.seed, cfg), cfg);
      const gap =
        w.side === 'floor' ? q[w.band] - w.latticeLimit : w.latticeLimit - q[w.band];
      // The gap against the *raw* `/data` number, shown alongside so the two
      // are never conflated: zero for `maxGateDetour` (its `limit` and
      // `latticeLimit` are the same number), a small positive lattice
      // remainder for the two density floors.
      const rawGap = w.side === 'floor' ? q[w.band] - w.limit : w.limit - q[w.band];
      return `${w.seed} ${w.band} ${w.side} ${w.kind} lattice=${fmt(gap)} raw=${fmt(rawGap)}`;
    });
    expect(headroom).toEqual([
      '362206641 walkableFrac floor edge lattice=0.000000 raw=0.000446',
      '1984600955 walkableFrac floor edge lattice=0.000000 raw=0.000446',
      '668782116 buildableNormalFrac floor edge lattice=0.000000 raw=0.000335',
      '2003509526 coreLegalFrac floor best-found lattice=0.266488 raw=0.266488',
      '3819441428 maxGateDetour ceiling edge lattice=0.000000 raw=0.000000',
      '2627893921 maxGateDetour ceiling edge lattice=0.000000 raw=0.000000',
    ]);
    // `fmt` rounds, so the rows above cannot tell 0 from 1e-9. Every `edge`
    // row is asserted bit-exact against `latticeLimit` — and the check is
    // driven off `kind`, not off a band name, so a future `best-found` row
    // cannot quietly inherit a claim that only an edge can make. That
    // inversion is what QA broke here, pre-resize.
    for (const w of WITNESSES) {
      const v = measureTerrain(generateTerrain(w.seed, cfg), cfg)[w.band];
      if (w.kind === 'edge') expect(v).toBe(w.latticeLimit);
      else expect(w.side === 'floor' ? v > w.latticeLimit : v < w.latticeLimit).toBe(true);
    }
  });

  it('one representable step tighter and each witness is regenerated instead', () => {
    // What "zero headroom" costs, made falsifiable. Each witness stops being
    // its own map and plays seed+1's — asserted, not just claimed.
    //
    // The step is the smallest one that means anything for the band: one tile
    // out of 1792 for the two density floors, which is the lattice below —
    // one step *above* `latticeLimit`, since that is each witness's own map's
    // value, not one step above the looser raw `limit`. For the detour there
    // is no such lattice to name — it is a ratio of integer path costs
    // (`PATH_ORTHO_COST 10`, `PATH_DIAG_COST 14`), whose attainable values
    // near 1.5 are close enough together that 1.4999 sits strictly inside the
    // gap below it, same as pre-resize.
    //
    // This is what would catch a headroom claim going stale silently: a
    // witness that quietly gained headroom would survive the tightening here.
    const tighten = (p: (c: Record<string, number>) => void): TerrainConfig => {
      const raw = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
      p(raw.constraints as Record<string, number>);
      return parseTerrain(raw);
    };
    const cases: ReadonlyArray<[number, TerrainConfig]> = [
      [362206641, tighten((c) => (c.minWalkableFrac = 1077 / TILES))],
      [1984600955, tighten((c) => (c.minWalkableFrac = 1077 / TILES))],
      [668782116, tighten((c) => (c.minBuildableNormalFrac = 808 / TILES))],
      [3819441428, tighten((c) => (c.maxGateDetour = 1.4999))],
      [2627893921, tighten((c) => (c.maxGateDetour = 1.4999))],
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

  it('the two density floors sit on the smallest lattice point the resize left reachable', () => {
    // **This is the test the pre-resize comment said to come back to.** Both
    // fractions are `k / TILES`, so a floor is attainable *exactly* iff
    // `floor * TILES` is an integer. At the old 720-tile arena, 0.6 -> 432 and
    // 0.45 -> 324 both were, so both witnesses sat on the raw band number
    // itself. At this grid's 1792 tiles neither is: `0.6 * 1792 = 1075.2` and
    // `0.45 * 1792 = 806.4`. `onLattice` below is false for both, exactly the
    // "may stop being reachable exactly" this test was written to notice.
    //
    // The measured floor cannot be *below* the band on a shipped map at all: a
    // map under it is regenerated at seed+1 (fb064a), so the minimum
    // `generateTerrain` can return is the smallest lattice point >= the band —
    // `Math.ceil(band * TILES)`, one tile above the fractional target rather
    // than on it. Finding a seed sitting on *that* stays a search, never a
    // surprise, and it is what `WITNESSES`' `latticeLimit` names.
    expect([
      `tiles ${TILES}`,
      `minWalkableFrac ${cfg.constraints.minWalkableFrac} onLattice=${Number.isInteger(
        cfg.constraints.minWalkableFrac * TILES,
      )} ceil=${Math.ceil(cfg.constraints.minWalkableFrac * TILES)}`,
      `minBuildableNormalFrac ${cfg.constraints.minBuildableNormalFrac} onLattice=${Number.isInteger(
        cfg.constraints.minBuildableNormalFrac * TILES,
      )} ceil=${Math.ceil(cfg.constraints.minBuildableNormalFrac * TILES)}`,
      `362206641 walkableCount ${measureTerrain(generateTerrain(362206641, cfg), cfg).walkableCount}`,
      `668782116 normalCount ${measureTerrain(generateTerrain(668782116, cfg), cfg).normalCount}`,
    ]).toEqual([
      `tiles 1792`,
      `minWalkableFrac 0.6 onLattice=false ceil=1076`,
      `minBuildableNormalFrac 0.45 onLattice=false ceil=807`,
      `362206641 walkableCount 1076`,
      `668782116 normalCount 807`,
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
    // Re-measured at fb166's 56x32 resize.
    //
    // Read these as a *distribution*, not as the domain's extremes — the
    // named witnesses above hold those. Each witness is strictly more extreme
    // than this sample's own reading (0.600446 against 0.606027, 0.450335
    // against 0.473214, 0.416488 against 0.437365, and — unlike pre-resize —
    // 1.5 against this sample's own max of 1.492063 too). Pre-resize the
    // detour ceiling was the one exception, because the pre-resize detour
    // witness (816758607) happened to be comb index 1141 of the pre-resize
    // sample and so was *in* it; at this resize none of the six witnesses
    // above falls inside this particular 12,000-seed comb, so all five bands
    // (`gateReachFrac` excepted, see below) now read as independent layers
    // with no coincidental overlap. `gateReachFrac` is 1 by construction on
    // generated output (see `measureTerrain`'s comment: after `sealPockets`,
    // `gatesConnected` implies every gate reaches every walkable tile), so its
    // row is a flat line on purpose and its @seed is just the first seed of
    // the sample.
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
    // fb064l re-measured the same window at 18 (0.09%). Over the domain at
    // this resize it is 23 of 12,000 — 0.19%. (Pre-resize this read 43 of
    // 12,000, 0.36% — the resize roughly halved it, which is a property of
    // where the new grid's bands sit relative to its density output, not
    // evidence either reading was wrong.)
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
    // could miss. Since fb064o added the approach band it is not: 22 of the 23
    // skipped keys are rejected for `maxGateDetour` and only one each for
    // `walkableFrac` and `buildableNormalFrac`. The retry rate is still mostly
    // a fact about `maxGateDetour: 1.5` and `ROOM_RADIUS`, not about
    // `density` — more so at this resize than pre-resize (34 of 43, 79%,
    // against 22 of 23, 96%), since the two density floors' lattice-forced
    // sliver of extra headroom (the band-ledger header) makes them very
    // slightly easier to clear than the raw `/data` number implies.
    expect(runRetrySet().tally).toEqual({
      maxGateDetour: 22,
      walkableFrac: 1,
      buildableNormalFrac: 1,
    });
  });

  it('is a one-step walk only in this sample — two-step walks exist domain-wide', () => {
    // All 23 sampled seeds retry exactly once, which reads like a property of
    // the generator and is not one. Re-measured at fb166's resize: a
    // 300,000-seed comb (stride 22279 from 7) found one `attempts: 3` seed and
    // a second, different comb (stride 14293 from 3) found two more — three in
    // 600,000 domain seeds this pass, against the pre-resize QA reading of 73
    // in 6,000,000. Two are pinned here, as before, so the distinction stays
    // visible, and because a retune that makes the bands harder will deepen
    // the walk here first — the fallback map is eight steps away, and nothing
    // else in the suite watches the distance.
    //
    // The second key of 1741794506 also shows the shape the sample's tally
    // cannot: a skipped map failing *one* band on each of two different steps
    // rather than the same band twice. `2348073903`'s own second column shows
    // the other shape — the same band, `maxGateDetour`, failing twice in a
    // row — which is worth keeping visible precisely because it looks less
    // interesting than a two-band walk.
    const walks = [2348073903, 1741794506].map((s) => {
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
      '2348073903 attempts=3 key=2348073905 fallback=false legal=true ' +
        '+0:maxGateDetour +1:maxGateDetour',
      '1741794506 attempts=3 key=1741794508 fallback=false legal=true ' +
        '+0:walkableFrac +1:maxGateDetour',
    ]);
    // `maxAttempts` is the distance to the flat arena; the deepest walk found
    // anywhere is 3, so there is real room left before a seed ships flat.
    expect(cfg.maxAttempts).toBe(8);
  });

  it('matches the recorded per-band ledger for retried maps', () => {
    // Re-measured at fb166's resize. Worth reading next to the sample ledger:
    // a retried map is not a marginal map. Its worst detour is 1.197 against
    // the sample's 1.492 and its worst `walkableFrac` is 0.667 against the
    // sample's 0.606 — the seed+1 map clears the bands by more than the
    // average seed's does, because the band that rejected the first attempt is
    // the one being redrawn. (Pre-resize this read detour 1.203/1.500 and
    // walkableFrac 0.619/0.601 — the same shape, different numbers.)
    expect(ledger(runRetrySet().stats)).toEqual({
      walkableFrac: 'min 0.667411 @1529722299 · mean 0.734885 · max 0.771205 @2098804764',
      buildableNormalFrac: 'min 0.501674 @1529722299 · mean 0.578319 · max 0.618304 @3000001156',
      gateReachFrac: 'min 1.000000 @55118679 · mean 1.000000 · max 1.000000 @55118679',
      coreLegalFrac: 'min 0.477801 @2147484515 · mean 0.534388 · max 0.573382 @2098804764',
      maxGateDetour: 'min 1.016000 @3551933574 · mean 1.095399 · max 1.196850 @3030811518',
    });
  });
});
