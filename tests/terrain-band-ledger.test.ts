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
 * **Re-found whole at fb156's 4-gate layout, on top of fb166's 56x32 resize.**
 * Every witness below is a fresh seed: the 3-gate 56x32 witnesses do not even
 * measure a similar value once the fourth gate is open, because a scattered
 * map's tile counts are a function of the RNG walk over the *whole* arena
 * (corridors to four gates now, not three), not a local property that
 * survives a gate-count change.
 *
 * **The find that reshapes this section: the two density floors are no
 * longer `edge` witnesses.** At the 3-gate 56x32 layout, `walkableFrac` and
 * `buildableNormalFrac` each had a witness sitting exactly on the smallest
 * lattice point their raw `/data` floor admits (`1076/1792`, `807/1792` — see
 * below for why 1792 does not divide evenly into `0.6`/`0.45`). A combined
 * ~4,000,000-seed search at this gate layout (eight ~400,000-600,000-seed
 * combs, several strides, run in parallel shards) found **no seed at either
 * exact value** — the closest are 1078/1792 (2 lattice steps above the floor)
 * and 814/1792 (7 steps above). A fourth protected gate corridor reserves more
 * of the arena as forced-walkable/forced-normal ground, so the generator's
 * organic scatter has less room to push either count down to its raw minimum,
 * and hitting that minimum *exactly* becomes rare enough that 4,000,000 seeds
 * did not find it. So both are now `kind: 'best-found'`, exactly the same
 * status `coreLegalFrac`'s witness already had — a search result, not a
 * provable extreme, and a bigger search is expected to beat them.
 *
 * **What stays `edge`: `maxGateDetour`'s ceiling.** It is still comparatively
 * dense — the four combs above turned up 35 seeds measuring exactly `1.5`
 * between them — so two are kept here as before, unbeatable by construction
 * (a map over the ceiling is regenerated at seed+1).
 *
 * `walkableFrac` and `buildableNormalFrac` are `k / 1792`, and 1792 does not
 * divide evenly into either `0.6` or `0.45` (`0.6 * 1792 = 1075.2`, `0.45 *
 * 1792 = 806.4`). So no seed can measure *exactly* `0.6` or `0.45` at all —
 * the true floor a map can reach is the smallest lattice point at or above
 * it, `1076/1792 = 0.600446...` and `807/1792 = 0.450335...`, named as
 * `latticeLimit` below whether or not a witness actually reaches it.
 *
 * Provenance, because "worst" is only as good as the search behind it:
 *   - `801576960` (`walkableFrac`, 1078/1792) and `899117445`
 *     (`buildableNormalFrac`, 814/1792) are each the best of the combined
 *     ~4,000,000-seed search above.
 *   - `95051407`, `940567429` (`maxGateDetour`) are two of the 35 exact-`1.5`
 *     seeds the same search turned up.
 *   - `4014676824` (`coreLegalFrac`) is the best of the same search — 0.4379,
 *     looser than the 3-gate 56x32 layout's own best-found (0.4165), because
 *     that witness came from a search aimed specifically at this one band
 *     while this pass split its budget three ways; a bigger or more targeted
 *     search is expected to beat either reading, which is what `kind:
 *     'best-found'` says.
 *
 * **Headroom, restated for this gate layout.** `maxGateDetour` still has
 * exactly zero headroom against its raw `/data` number. The two density
 * floors now have *positive* headroom even against their lattice-constrained
 * minimum — 2 and 7 steps respectively — which is itself the finding: at the
 * 3-gate 56x32 layout that headroom was exactly zero for both.
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
    seed: 801576960,
    band: 'walkableFrac',
    side: 'floor',
    kind: 'best-found',
    value: 1078 / TILES,
    limit: cfg.constraints.minWalkableFrac,
    latticeLimit: latticeFloor(cfg.constraints.minWalkableFrac),
    hash: '9fcbb0c5',
    // 1078/1792 walkable — 2 lattice steps above the true floor (1076/1792);
    // the closest this ~4,000,000-seed combined search came to it. No longer
    // an `edge` row (see the header): the 3-gate 56x32 witness sat exactly on
    // 1076/1792, and this search did not find an equivalent at this gate
    // layout.
  },
  {
    seed: 899117445,
    band: 'buildableNormalFrac',
    side: 'floor',
    kind: 'best-found',
    value: 814 / TILES,
    limit: cfg.constraints.minBuildableNormalFrac,
    latticeLimit: latticeFloor(cfg.constraints.minBuildableNormalFrac),
    hash: 'aa71c988',
    // 814/1792 normal — 7 lattice steps above the true floor (807/1792); the
    // closest this search came to it. Also no longer `edge`, for the same
    // reason as `walkableFrac` above.
  },
  {
    seed: 4014676824,
    band: 'coreLegalFrac',
    side: 'floor',
    kind: 'best-found',
    value: 0.43790849673202614,
    limit: cfg.constraints.minCoreLegalFrac,
    latticeLimit: cfg.constraints.minCoreLegalFrac,
    hash: 'cc7ae14f',
    // The loosest band by a distance — 28.8 pp above its 0.15 floor — and,
    // along with the two density floors above, a row a bigger scan can beat.
    // Best of the same ~4,000,000-seed combined search (fb156 4-gate pass);
    // looser than the 3-gate 56x32 layout's own best-found (0.4165), because
    // that reading came from a search built specifically to minimise this one
    // band (~2,250,000 seeds aimed at it) while this pass split its budget
    // three ways. A replacement seed arriving one day from a bigger or more
    // targeted search is expected and is not evidence of a regression,
    // exactly as fb064r's own original witness said of itself.
  },
  {
    seed: 95051407,
    band: 'maxGateDetour',
    side: 'ceiling',
    kind: 'edge',
    value: 1.5,
    limit: cfg.constraints.maxGateDetour,
    latticeLimit: cfg.constraints.maxGateDetour,
    hash: '4b3659a5',
    // exactly the ceiling — one of 35 such seeds the combined search found;
    // the ceiling stays comparatively dense at this gate layout too.
  },
  {
    seed: 940567429,
    band: 'maxGateDetour',
    side: 'ceiling',
    kind: 'edge',
    value: 1.5,
    limit: cfg.constraints.maxGateDetour,
    latticeLimit: cfg.constraints.maxGateDetour,
    hash: '14f6d128',
    // a second seed exactly on the detour ceiling, from a different comb
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

  it('every edge witness sits exactly on its true lattice limit; best-found ones sit close but not on it', () => {
    // Not "about zero" for an `edge` row. `===` against `latticeLimit`,
    // because the whole claim is that an edge witness's seed passes on the
    // tile lattice's own boundary. At fb156's 4-gate layout that is true only
    // of the two `maxGateDetour` rows now (see the header): the two density
    // floors moved to `kind: 'best-found'` because this search's closest
    // seeds sit 2 and 7 lattice steps above their true floors rather than on
    // them.
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
      '801576960 walkableFrac floor best-found lattice=0.001116 raw=0.001563',
      '899117445 buildableNormalFrac floor best-found lattice=0.003906 raw=0.004241',
      '4014676824 coreLegalFrac floor best-found lattice=0.287908 raw=0.287908',
      '95051407 maxGateDetour ceiling edge lattice=0.000000 raw=0.000000',
      '940567429 maxGateDetour ceiling edge lattice=0.000000 raw=0.000000',
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

  it('one representable step tighter and each edge witness is regenerated instead', () => {
    // What "zero headroom" costs, made falsifiable. Each `edge` witness stops
    // being its own map and plays seed+1's — asserted, not just claimed. Only
    // the two `maxGateDetour` witnesses are `edge` at this gate layout (see
    // the header): the two density floors are `best-found` now, so tightening
    // *their* bands by one lattice step would not touch these particular
    // seeds at all — it would just move the search's own best-found value,
    // which `tests/terrain-headroom.test.ts`'s cost curve prices instead.
    //
    // For the detour there is no lattice to name — it is a ratio of integer
    // path costs (`PATH_ORTHO_COST 10`, `PATH_DIAG_COST 14`), whose attainable
    // values near 1.5 are close enough together that 1.4999 sits strictly
    // inside the gap below it, same as every prior gate layout.
    //
    // This is what would catch a headroom claim going stale silently: a
    // witness that quietly gained headroom would survive the tightening here.
    const tighten = (p: (c: Record<string, number>) => void): TerrainConfig => {
      const raw = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
      p(raw.constraints as Record<string, number>);
      return parseTerrain(raw);
    };
    const cases: ReadonlyArray<[number, TerrainConfig]> = [
      [95051407, tighten((c) => (c.maxGateDetour = 1.4999))],
      [940567429, tighten((c) => (c.maxGateDetour = 1.4999))],
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

  it('the two density floors have a defined lattice-exact point, and this search`s witnesses sit near but not on it', () => {
    // **This is the test the pre-resize comment said to come back to, and this
    // time the answer changed.** Both fractions are `k / TILES`, so a floor is
    // attainable *exactly* iff `floor * TILES` is an integer. At the old
    // 720-tile arena, 0.6 -> 432 and 0.45 -> 324 both were. At this grid's
    // 1792 tiles neither is: `0.6 * 1792 = 1075.2` and `0.45 * 1792 = 806.4`.
    // `onLattice` below is false for both, as it has been since fb166's
    // resize.
    //
    // The measured floor cannot be *below* the band on a shipped map at all: a
    // map under it is regenerated at seed+1 (fb064a), so the minimum
    // `generateTerrain` can return is the smallest lattice point >= the band —
    // `Math.ceil(band * TILES)`. At the 3-gate 56x32 layout a seed sitting
    // exactly on that point existed and this file named it; at fb156's 4-gate
    // layout the combined ~4,000,000-seed search's closest seeds sit 2 and 7
    // steps above it instead (`WITNESSES`' own header explains why — a fourth
    // protected corridor reserves more forced-walkable/forced-normal ground).
    // The lattice point itself is unchanged, and `WITNESSES`' `latticeLimit`
    // still names it; only "a witness reaches it" stopped being true.
    expect([
      `tiles ${TILES}`,
      `minWalkableFrac ${cfg.constraints.minWalkableFrac} onLattice=${Number.isInteger(
        cfg.constraints.minWalkableFrac * TILES,
      )} ceil=${Math.ceil(cfg.constraints.minWalkableFrac * TILES)}`,
      `minBuildableNormalFrac ${cfg.constraints.minBuildableNormalFrac} onLattice=${Number.isInteger(
        cfg.constraints.minBuildableNormalFrac * TILES,
      )} ceil=${Math.ceil(cfg.constraints.minBuildableNormalFrac * TILES)}`,
      `801576960 walkableCount ${measureTerrain(generateTerrain(801576960, cfg), cfg).walkableCount}`,
      `899117445 normalCount ${measureTerrain(generateTerrain(899117445, cfg), cfg).normalCount}`,
    ]).toEqual([
      `tiles 1792`,
      `minWalkableFrac 0.6 onLattice=false ceil=1076`,
      `minBuildableNormalFrac 0.45 onLattice=false ceil=807`,
      `801576960 walkableCount 1078`,
      `899117445 normalCount 814`,
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
      walkableFrac: 'min 0.623326 @3000000007 · mean 0.737018 · max 0.777902 @2293509708',
      buildableNormalFrac: 'min 0.472656 @2972829531 · mean 0.584255 · max 0.656250 @3000000821',
      gateReachFrac: 'min 1.000000 @0 · mean 1.000000 · max 1.000000 @0',
      coreLegalFrac: 'min 0.461376 @-1603 · mean 0.554120 · max 0.649183 @3000001179',
      maxGateDetour: 'min 1.000000 @0 · mean 1.078740 · max 1.420000 @234791256',
    });
  });

  it('records what share of the domain takes the seed+1 retry path', () => {
    // fb064a read the retry rate off seeds 1..20000 and got 5 seeds (0.025%);
    // fb064l re-measured the same window at 18 (0.09%). At the 3-gate 56x32
    // layout this read 23 of 12,000 — 0.19%. Re-measured at fb156's 4-gate
    // layout: **9 of 12,000 — 0.075%**, less than half — a fourth gate gives
    // the generator more independent ways to satisfy `maxGateDetour` (see the
    // tally below: this band is now the *only* one driving the retry path in
    // this sample), so fewer seeds miss on the first attempt.
    //
    // The set is asserted BEFORE the count. QA found the reverse ordering
    // hiding the one diff this file calls its most retune-sensitive artifact:
    // a retune that moves seeds in and out of the retry path failed with
    // `expected 50 to be 43` and never printed which seeds moved — a hunt,
    // from the assertion whose whole purpose is to be a diff.
    const { retryTaking } = runSample();
    expect(retryTaking).toEqual([...RETRY_SEEDS]);
    expect(retryTaking.length).toBe(9);
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
  1256992212, 2131732806, 2375113986, 3069466176, 3074476965, 3117426585, 3546922785, -273,
  3000001352,
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
    expect(RETRY_SEEDS.length).toBe(9);
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
    // could miss. Since fb064o added the approach band it is not: at fb156's
    // 4-gate layout **every one** of the 9 skipped keys is rejected for
    // `maxGateDetour` alone — a cleaner reading than the 3-gate 56x32 layout's
    // 22 of 23 (96%), because the fourth gate leaves the two density floors
    // enough headroom (see the sample ledger above) that they no longer
    // contribute any retries in this sample at all. The retry rate is now
    // entirely a fact about `maxGateDetour: 1.5` and `ROOM_RADIUS`, not about
    // `density`.
    expect(runRetrySet().tally).toEqual({
      maxGateDetour: 9,
    });
  });

  it('is a one-step walk only in this sample — two-step walks exist domain-wide', () => {
    // All 9 sampled seeds retry exactly once, which reads like a property of
    // the generator and is not one. Re-measured at fb156's 4-gate layout: the
    // same ~4,000,000-seed combined search that found the band-ledger's
    // witnesses turned up exactly **one** `attempts: 3` seed (in a
    // 600,000-seed comb, stride 27191 from 100003) — against the 3-gate 56x32
    // layout's three in 600,000. Consistent with the tally above: since
    // `maxGateDetour` now drives every retry in this sample rather than 96% of
    // them, a two-step walk here is two `maxGateDetour` misses in a row rather
    // than the mixed-band shape the 3-gate layout's second witness showed —
    // there is no longer a second band left to contribute one. Pinned as one
    // witness rather than two for that reason, and because a retune that makes
    // the band harder will deepen the walk here first — the fallback map is
    // eight steps away, and nothing else in the suite watches the distance.
    const walks = [1124407771].map((s) => {
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
      '1124407771 attempts=3 key=1124407773 fallback=false legal=true ' +
        '+0:maxGateDetour +1:maxGateDetour',
    ]);
    // `maxAttempts` is the distance to the flat arena; the deepest walk found
    // anywhere is 3, so there is real room left before a seed ships flat.
    expect(cfg.maxAttempts).toBe(8);
  });

  it('matches the recorded per-band ledger for retried maps', () => {
    // Re-measured at fb156's 4-gate layout. Worth reading next to the sample
    // ledger: a retried map is not a marginal map. Its worst detour is 1.172
    // against the sample's 1.420 — the seed+1 map clears the band by more than
    // the average seed's does, because `maxGateDetour` is the one band that
    // rejected every first attempt here and is the one being redrawn. (At the
    // 3-gate 56x32 layout this read detour 1.016/1.197 and walkableFrac
    // 0.667/0.771 — the same shape, different numbers; `walkableFrac` no
    // longer has a role in this population at all, since every retry here is
    // driven by `maxGateDetour` alone.)
    expect(ledger(runRetrySet().stats)).toEqual({
      walkableFrac: 'min 0.714286 @3117426585 · mean 0.738405 · max 0.768973 @1256992212',
      buildableNormalFrac: 'min 0.532366 @2131732806 · mean 0.589100 · max 0.643415 @1256992212',
      gateReachFrac: 'min 1.000000 @1256992212 · mean 1.000000 · max 1.000000 @1256992212',
      coreLegalFrac: 'min 0.508048 @3546922785 · mean 0.552494 · max 0.620989 @1256992212',
      maxGateDetour: 'min 1.024194 @3069466176 · mean 1.079532 · max 1.171642 @2131732806',
    });
  });
});
