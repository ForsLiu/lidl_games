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
 * **Two kinds of row, and conflating them is a mistake this file already made
 * once.** Four of the five witnesses sit on a band *edge*, and an edge is
 * provable: a map outside its band is regenerated at seed+1, so the band value
 * itself is the extreme and no seed can beat it — the search only had to find
 * one seed that reaches it. `coreLegalFrac`'s floor is ~22 pp away from
 * anything the generator produces, so its extreme is a **search result**, and
 * no scan of a 4.3-billion-seed domain can promote a search result to a
 * property. The first draft labelled its row "the domain worst" off a
 * 250,006-seed comb (0.006% of the domain); QA beat it with ten seeds, the best
 * of them 1.14 pp lower. `kind` now carries the distinction and the row says
 * how big the search behind it was.
 *
 * Provenance, because "worst" is only as good as the search behind it:
 *   - `2005486180` and `2454233399` were handed over by fb064m's QA from a
 *     120,701-seed sample and are **re-measured here, not inherited** — both
 *     still sit exactly on their floors at this HEAD (verified 2026-09-04).
 *   - `228583774` and `301216586` come from fb064r's own 250,006-seed comb
 *     across the domain (stride 17179, parameters in the Log). `228583774` is
 *     an *independent* second seed on the walkable floor, and `816758607` a
 *     second on the detour ceiling: neither edge is one freak seed.
 *   - `1513721174` is the best of a 12,000,000-seed scan in three disjoint
 *     families (fb064r QA; parameters in the Log). It replaced `2696707883`
 *     (0.388102), which that scan beat ten times over.
 *
 * **Three of the five bands have exactly zero headroom, not two.** The item
 * inherited the two floors; the ceiling is fb064r's own finding. A seed
 * measuring exactly `maxGateDetour: 1.5` ships for the same reason a seed
 * measuring exactly `0.6` walkable does — `terrainLegal` compares with `<=`
 * and `>=` — so tightening *any* of these three bands by one representable
 * step is not a tune, it is a decision to regenerate those seeds' maps. That is
 * measured below rather than argued.
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
    seed: 2005486180,
    band: 'walkableFrac',
    side: 'floor',
    kind: 'edge',
    value: 0.6,
    limit: cfg.constraints.minWalkableFrac,
    hash: '7c0d939c',
    // 432/720 walkable — exactly the floor (inherited from fb064m QA, re-measured)
  },
  {
    seed: 228583774,
    band: 'walkableFrac',
    side: 'floor',
    kind: 'edge',
    value: 0.6,
    limit: cfg.constraints.minWalkableFrac,
    hash: '0f924bc4',
    // 432/720 walkable — a second, independently found seed on the same floor
  },
  {
    seed: 2454233399,
    band: 'buildableNormalFrac',
    side: 'floor',
    kind: 'edge',
    value: 0.45,
    limit: cfg.constraints.minBuildableNormalFrac,
    hash: 'b88a82e4',
    // 324/720 normal — exactly the floor (inherited from fb064m QA, re-measured)
  },
  {
    seed: 1513721174,
    band: 'coreLegalFrac',
    side: 'floor',
    kind: 'best-found',
    value: 139 / 369,
    limit: cfg.constraints.minCoreLegalFrac,
    hash: 'f17168ab',
    // 139 legal anchors / 369 normal tiles = 0.376694 — the loosest band by a
    // distance, 22.7 pp above its 0.15 floor, and the only row here that a
    // bigger scan can beat. Best of 12,000,000 seeds (fb064r QA). The next four
    // are 2684526585 (0.377309), 2129441720 (0.379404), 805415667 (0.380556)
    // and 321299845 (0.381868): the tail is dense, so a replacement seed
    // arriving one day is expected and is not evidence of a regression.
  },
  {
    seed: 301216586,
    band: 'maxGateDetour',
    side: 'ceiling',
    kind: 'edge',
    value: 1.5,
    limit: cfg.constraints.maxGateDetour,
    hash: 'da1c6177',
    // exactly the ceiling — fb064o's band, and fb064r's own finding
  },
  {
    seed: 816758607,
    band: 'maxGateDetour',
    side: 'ceiling',
    kind: 'edge',
    value: 1.5,
    limit: cfg.constraints.maxGateDetour,
    hash: '905ba2a4',
    // a second seed exactly on the detour ceiling
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

  it('the three tight bands have exactly zero headroom, to the last bit', () => {
    // Not "about zero". `===` against the authored band, because the whole
    // claim is that these seeds pass on the `>=`/`<=` boundary itself.
    const headroom = WITNESSES.map((w) => {
      const q = measureTerrain(generateTerrain(w.seed, cfg), cfg);
      const gap = w.side === 'floor' ? q[w.band] - w.limit : w.limit - q[w.band];
      return `${w.seed} ${w.band} ${w.side} ${w.kind} ${fmt(gap)}`;
    });
    expect(headroom).toEqual([
      '2005486180 walkableFrac floor edge 0.000000',
      '228583774 walkableFrac floor edge 0.000000',
      '2454233399 buildableNormalFrac floor edge 0.000000',
      '1513721174 coreLegalFrac floor best-found 0.226694',
      '301216586 maxGateDetour ceiling edge 0.000000',
      '816758607 maxGateDetour ceiling edge 0.000000',
    ]);
    // `fmt` rounds, so the rows above cannot tell 0 from 1e-9. Every `edge`
    // row is asserted bit-exact — and the check is driven off `kind`, not off
    // a band name, so a future `best-found` row cannot quietly inherit a claim
    // that only an edge can make. That inversion is what QA broke here.
    for (const w of WITNESSES) {
      const v = measureTerrain(generateTerrain(w.seed, cfg), cfg)[w.band];
      if (w.kind === 'edge') expect(v).toBe(w.limit);
      else expect(w.side === 'floor' ? v > w.limit : v < w.limit).toBe(true);
    }
  });

  it('one representable step tighter and each witness is regenerated instead', () => {
    // What "zero headroom" costs, made falsifiable. Each witness stops being
    // its own map and plays seed+1's — asserted, not just claimed.
    //
    // The step is the smallest one that means anything for the band: one tile
    // out of 720 for the two density floors, which is the lattice below. For
    // the detour there is no such lattice to name — it is a ratio of integer
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
      [2005486180, tighten((c) => (c.minWalkableFrac = 433 / 720))],
      [228583774, tighten((c) => (c.minWalkableFrac = 433 / 720))],
      [2454233399, tighten((c) => (c.minBuildableNormalFrac = 325 / 720))],
      [301216586, tighten((c) => (c.maxGateDetour = 1.4999))],
      [816758607, tighten((c) => (c.maxGateDetour = 1.4999))],
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

  it('the two density floors are reachable exactly because they land on the tile lattice', () => {
    // Why the headroom is zero rather than "one tile", and the thing to check
    // first when a retune moves it. Both fractions are `k / 720`, so a floor
    // is attainable exactly iff `floor * 720` is an integer: 0.6 -> 432 and
    // 0.45 -> 324 both are. A floor of, say, 0.601 would be unreachable, the
    // smallest returnable value would be 433/720 = 0.601389, and the ledger
    // would show ~0.0004 of headroom the band never meant to grant.
    //
    // The measured floor cannot be *below* the band on a shipped map at all: a
    // map under it is regenerated at seed+1 (fb064a), so the minimum
    // `generateTerrain` can return is the smallest lattice point >= the band.
    // Finding a seed sitting on it stays a search, never a surprise.
    // From the grid rather than written as 720: if the arena is ever resized,
    // the lattice moves and both floors may stop being reachable exactly —
    // which is the case this test is here to notice.
    const TILES = GRID_W * GRID_H;
    // Rows again rather than bare numbers: `expected 452 to be 432` names
    // neither the seed nor the band it belongs to (QA bug 3).
    expect([
      `tiles ${TILES}`,
      `minWalkableFrac ${cfg.constraints.minWalkableFrac} onLattice=${Number.isInteger(
        cfg.constraints.minWalkableFrac * TILES,
      )}`,
      `minBuildableNormalFrac ${cfg.constraints.minBuildableNormalFrac} onLattice=${Number.isInteger(
        cfg.constraints.minBuildableNormalFrac * TILES,
      )}`,
      `2005486180 walkableCount ${measureTerrain(generateTerrain(2005486180, cfg), cfg).walkableCount}`,
      `2454233399 normalCount ${measureTerrain(generateTerrain(2454233399, cfg), cfg).normalCount}`,
    ]).toEqual([
      `tiles 720`,
      `minWalkableFrac 0.6 onLattice=true`,
      `minBuildableNormalFrac 0.45 onLattice=true`,
      `2005486180 walkableCount ${cfg.constraints.minWalkableFrac * TILES}`,
      `2454233399 normalCount ${cfg.constraints.minBuildableNormalFrac * TILES}`,
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
    const { stats } = runSample();
    expect(ledger(stats)).toEqual({
      walkableFrac: 'min 0.601389 @557629233 · mean 0.692311 · max 0.733333 @231927948',
      buildableNormalFrac: 'min 0.456944 @2655718170 · mean 0.549509 · max 0.616667 @545460174',
      gateReachFrac: 'min 1.000000 @0 · mean 1.000000 · max 1.000000 @0',
      coreLegalFrac: 'min 0.419098 @2904110139 · mean 0.517837 · max 0.633416 @2398020450',
      maxGateDetour: 'min 1.000000 @715827 · mean 1.091948 · max 1.500000 @816758607',
    });
  });

  it('records what share of the domain takes the seed+1 retry path', () => {
    // fb064a read the retry rate off seeds 1..20000 and got 5 seeds (0.025%);
    // fb064l re-measured the same window at 18 (0.09%). Over the domain it is
    // 43 of 12,000 — 0.36%, four times the near-window rate. The near window
    // is not representative of the retry path either.
    //
    // The set is asserted BEFORE the count. QA found the reverse ordering
    // hiding the one diff this file calls its most retune-sensitive artifact:
    // a retune that moves seeds in and out of the retry path failed with
    // `expected 50 to be 43` and never printed which seeds moved — a hunt,
    // from the assertion whose whole purpose is to be a diff.
    const { retryTaking } = runSample();
    expect(retryTaking).toEqual([...RETRY_SEEDS]);
    expect(retryTaking.length).toBe(43);
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
  277740876, 284183319, 721553616, 740165118, 880467210, 1262003001, 1481761890, 2010758043,
  2357218311, 2792441127, 2841833190, 2944912278, 3181135188, 3687940704, 4218368511, -1971, -1922,
  -1456, -1157, -1103, -1062, -720, -560, -427, -99, 3000000378, 3000000623, 3000000661,
  3000000818, 3000000850, 3000001015, 3000001082, 3000001228, 3000001363, 3000001613, 2147483220,
  2147483354, 2147483532, 2147483742, 2147483774, 2147484163, 2147484244, 2147484391,
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
    expect(RETRY_SEEDS.length).toBe(43);
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
    // could miss. Since fb064o added the approach band it is not: 34 of the 43
    // skipped keys are rejected for `maxGateDetour` and only 9 for
    // `walkableFrac`, and no other band rejects a single one. The retry rate
    // is now mostly a fact about `maxGateDetour: 1.5` and `ROOM_RADIUS`, not
    // about `density`.
    expect(runRetrySet().tally).toEqual({ maxGateDetour: 34, walkableFrac: 9 });
  });

  it('is a one-step walk only in this sample — two-step walks exist domain-wide', () => {
    // All 43 sampled seeds retry exactly once, which reads like a property of
    // the generator and is not one: QA measured 73 `attempts: 3` seeds in
    // 6,000,000 (0.0012%), against 0.334% at `attempts: 2` and zero fallbacks.
    // A 300,000-seed comb of my own (stride 14317) found these two. They are
    // pinned so the distinction stays visible, and because a retune that makes
    // the bands harder will deepen the walk here first — the fallback map is
    // eight steps away, and nothing else in the suite watches the distance.
    //
    // The second key of 1866707728 also shows the shape the sample's tally
    // cannot: a skipped map failing *two* bands at once. In the 43-seed sample
    // every skipped key failed exactly one, which is why that tally sums to 43.
    const walks = [1866707728, 1976547752].map((s) => {
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
      '1866707728 attempts=3 key=1866707730 fallback=false legal=true ' +
        '+0:maxGateDetour +1:walkableFrac|buildableNormalFrac',
      '1976547752 attempts=3 key=1976547754 fallback=false legal=true ' +
        '+0:walkableFrac +1:maxGateDetour',
    ]);
    // `maxAttempts` is the distance to the flat arena; the deepest walk found
    // anywhere is 3, so there is real room left before a seed ships flat.
    expect(cfg.maxAttempts).toBe(8);
  });

  it('matches the recorded per-band ledger for retried maps', () => {
    // Recorded 2026-09-04 (fb064r). Worth reading next to the sample ledger:
    // a retried map is not a marginal map. Its worst detour is 1.203 against
    // the sample's 1.500 and its worst `walkableFrac` is 0.619 against the
    // sample's 0.601 — the seed+1 map clears the bands by more than the
    // average seed's does, because the band that rejected the first attempt is
    // the one being redrawn.
    expect(ledger(runRetrySet().stats)).toEqual({
      walkableFrac: 'min 0.619444 @3687940704 · mean 0.695413 · max 0.725000 @2147484391',
      buildableNormalFrac: 'min 0.481944 @3000000661 · mean 0.549193 · max 0.604167 @-560',
      gateReachFrac: 'min 1.000000 @277740876 · mean 1.000000 · max 1.000000 @277740876',
      coreLegalFrac: 'min 0.451282 @3000001015 · mean 0.525260 · max 0.583133 @2147483774',
      maxGateDetour: 'min 1.000000 @2792441127 · mean 1.108907 · max 1.203390 @284183319',
    });
  });
});
