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
 * once.** An `edge` witness is provable: a map outside its band is
 * regenerated at seed+1, so the band value itself is the extreme and no seed
 * can beat it — the search only had to find one seed that reaches it. A
 * `best-found` witness is the best of a finite search and is beatable by a
 * bigger one. `kind` carries the distinction; see the fb166 note on
 * `WITNESSES` below for which rows are which at this grid size and why.
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

/**
 * **fb166 re-derived this whole table for the 56x32 grid**, and its
 * methodology is narrower than fb064r's original in one way and unchanged in
 * another.
 *
 * Narrower: 1792 tiles means `0.6 * 1792 = 1075.2` and `0.45 * 1792 = 806.4`
 * are not integers (unlike the old 720-tile grid, where both floors landed
 * exactly on the lattice), so no seed can measure exactly either floor any
 * more — both density rows below are `best-found`, not `edge`, and the
 * "reachable exactly" test that follows this table states that structural
 * change rather than the old exactness. Also narrower: fb064r's witnesses
 * came from searches up to 12,000,000 seeds; per-seed generation cost roughly
 * doubled at this grid size (measured ~3ms against ~1.2ms at 36x20), so a
 * search of that scale was out of this item's budget. The density and
 * `coreLegalFrac` rows below are this file's own 12,000-seed `SAMPLE`
 * extremes — real measurements, just not chased past that sample the way
 * fb064r's were.
 *
 * Unchanged: `maxGateDetour`'s ceiling is a ratio of integer path costs
 * (`PATH_ORTHO_COST 10`, `PATH_DIAG_COST 14`), not a fraction of the tile
 * count, so it is grid-size-independent and a seed sitting exactly on 1.5 is
 * still findable — a 100,000-seed scan found three (42711, 47107, 74379),
 * kept as `edge` witnesses.
 */
const WITNESSES: readonly Witness[] = [
  {
    seed: 746607561,
    band: 'walkableFrac',
    side: 'floor',
    kind: 'best-found',
    value: 0.606027,
    limit: cfg.constraints.minWalkableFrac,
    hash: '7ad28ecc',
    // Best of the 12,000-seed SAMPLE — 1086/1792 walkable, 0.6 pp above the
    // 0.6 floor. The near-window file (`terrain-generation.test.ts`) found a
    // closer approach (13620, 0.601004) in seeds 1..20000 specifically; this
    // row is the SAMPLE's own domain-spanning witness and is not chased
    // against that narrower, tighter result.
  },
  {
    seed: 1871887605,
    band: 'buildableNormalFrac',
    side: 'floor',
    kind: 'best-found',
    value: 0.473214,
    limit: cfg.constraints.minBuildableNormalFrac,
    hash: 'b14cb0e8',
    // Best of the SAMPLE — 848/1792 normal, 2.3 pp above the 0.45 floor.
  },
  {
    seed: 1922711322,
    band: 'coreLegalFrac',
    side: 'floor',
    kind: 'best-found',
    value: 0.437365,
    limit: cfg.constraints.minCoreLegalFrac,
    hash: '30347d6b',
    // Still the loosest band by a distance — 28.7 pp above its 0.15 floor,
    // against the density floors' ~1-2 pp — so still the row most likely to
    // move under a bigger search, exactly as fb064r found for the 36x20 grid.
  },
  {
    seed: 42711,
    band: 'maxGateDetour',
    side: 'ceiling',
    kind: 'edge',
    value: 1.5,
    limit: cfg.constraints.maxGateDetour,
    hash: '9f914b72',
    // exactly the ceiling — found in a 100,000-seed scan
  },
  {
    seed: 47107,
    band: 'maxGateDetour',
    side: 'ceiling',
    kind: 'edge',
    value: 1.5,
    limit: cfg.constraints.maxGateDetour,
    hash: 'ed336a1b',
    // a second seed exactly on the detour ceiling, from the same scan
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

  it('the two exact-edge witnesses have zero headroom; the three best-found do not', () => {
    // Not "about zero" for the `edge` rows. `===` against the authored band,
    // because the whole claim is that these seeds pass on the `<=` boundary
    // itself. fb166: only `maxGateDetour` still has edge witnesses at 56x32
    // (see `WITNESSES`' own note); the two density floors and `coreLegalFrac`
    // are all `best-found` now and carry real, if small, headroom.
    const headroom = WITNESSES.map((w) => {
      const q = measureTerrain(generateTerrain(w.seed, cfg), cfg);
      const gap = w.side === 'floor' ? q[w.band] - w.limit : w.limit - q[w.band];
      return `${w.seed} ${w.band} ${w.side} ${w.kind} ${fmt(gap)}`;
    });
    expect(headroom).toEqual([
      '746607561 walkableFrac floor best-found 0.006027',
      '1871887605 buildableNormalFrac floor best-found 0.023214',
      '1922711322 coreLegalFrac floor best-found 0.287365',
      '42711 maxGateDetour ceiling edge 0.000000',
      '47107 maxGateDetour ceiling edge 0.000000',
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
    // fb166: only the two `maxGateDetour` witnesses are still `edge` kind at
    // 56x32 (the density floors moved to `best-found` — see `WITNESSES`'
    // note), so this case now tightens only those two. There is no lattice
    // step to name for the detour — it is a ratio of integer path costs
    // (`PATH_ORTHO_COST 10`, `PATH_DIAG_COST 14`), whose attainable values
    // near 1.5 are roughly 0.005 apart, so any threshold in that gap behaves
    // identically and 1.4999 is simply inside it.
    //
    // This is what would catch a headroom claim going stale silently: a
    // witness that quietly gained headroom would survive the tightening here.
    const tighten = (p: (c: Record<string, number>) => void): TerrainConfig => {
      const raw = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
      p(raw.constraints as Record<string, number>);
      return parseTerrain(raw);
    };
    const cases: ReadonlyArray<[number, TerrainConfig]> = [
      [42711, tighten((c) => (c.maxGateDetour = 1.4999))],
      [47107, tighten((c) => (c.maxGateDetour = 1.4999))],
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

  it('fb166: the two density floors are no longer on the tile lattice at 56x32', () => {
    // The 36x20-era version of this case was titled "...reachable exactly
    // because they land on the tile lattice" and proved the opposite of what
    // this one does. Both fractions are `k / TILES`, so a floor is attainable
    // exactly iff `floor * TILES` is an integer: at 720 tiles, 0.6 -> 432 and
    // 0.45 -> 324 both were. At 1792 tiles neither is — `0.6 * 1792 =
    // 1075.2`, `0.45 * 1792 = 806.4` — so the smallest a shipped map can ever
    // return is the next lattice point up (1076/1792 = 0.600893, 807/1792 =
    // 0.450223), never the authored floor itself. This is exactly the case
    // the old test's own closing comment predicted ("if the arena is ever
    // resized, the lattice moves and both floors may stop being reachable
    // exactly") — it has now happened, and the `WITNESSES` table's two
    // density rows are `best-found`, with real (if small) headroom, rather
    // than `edge`, because of it.
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
      `smallest reachable walkableCount ${Math.ceil(cfg.constraints.minWalkableFrac * TILES)}`,
      `smallest reachable normalCount ${Math.ceil(cfg.constraints.minBuildableNormalFrac * TILES)}`,
      `746607561 walkableCount ${measureTerrain(generateTerrain(746607561, cfg), cfg).walkableCount}`,
      `1871887605 normalCount ${measureTerrain(generateTerrain(1871887605, cfg), cfg).normalCount}`,
    ]).toEqual([
      `tiles 1792`,
      `minWalkableFrac 0.6 onLattice=false`,
      `minBuildableNormalFrac 0.45 onLattice=false`,
      `smallest reachable walkableCount 1076`,
      `smallest reachable normalCount 807`,
      `746607561 walkableCount 1086`,
      `1871887605 normalCount 848`,
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
    // fb166 re-recorded this and everything below it in the file for the
    // 56x32 grid.
    // Recorded 2026-09-04 (fb064r) against shipped `/data`, re-recorded fb166
    // against the 56x32 grid.
    //
    // Read these as a *distribution*, not as the domain's extremes — the
    // named witnesses above hold those (all four "best-found" now; see their
    // own note on why none is an `edge` witness at this grid size any more).
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
    // fb064l re-measured the same window at 18 (0.09%). Over the domain it was
    // 43 of 12,000 (0.36%) at the 36x20 grid; fb166 re-measured 23 of 12,000
    // (0.19%) at 56x32 — roughly half the rate, consistent with the bigger
    // board generally clearing bands with more room (this file's other
    // ledgers all show more headroom too). The near window is still not
    // representative of the retry path either way.
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
    // could miss. Since fb064o added the approach band it is not, and fb166's
    // re-measurement at 56x32 confirms the same shape holds at the new grid:
    // 22 of the 23 skipped keys are rejected for `maxGateDetour`, one each for
    // `walkableFrac` and `buildableNormalFrac`, and no other band rejects a
    // single one. The retry rate is still mostly a fact about
    // `maxGateDetour: 1.5` and `ROOM_RADIUS`, not about `density`.
    expect(runRetrySet().tally).toEqual({ maxGateDetour: 22, walkableFrac: 1, buildableNormalFrac: 1 });
  });

  it('is a one-step walk only in this sample — two-step walks exist domain-wide', () => {
    // All 23 sampled seeds retry exactly once, which reads like a property of
    // the generator and is not one. fb166 re-found a two-step example at
    // 56x32 (the old grid's two witnesses, 1866707728/1976547752, no longer
    // retry at all): a sequential scan of seeds 1..500,000 found exactly one
    // `attempts: 3` seed (0.0002%) and zero fallbacks — rarer than the old
    // grid's 0.0012% (73 in 6,000,000), consistent with this file's other
    // findings that retries generally got rarer at this grid size. Pinned so
    // the distinction stays visible, and because a retune that makes the
    // bands harder will deepen the walk here first — the fallback map is
    // eight steps away, and nothing else in the suite watches the distance.
    const walks = [114511].map((s) => {
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
      '114511 attempts=3 key=114513 fallback=false legal=true ' + '+0:walkableFrac +1:maxGateDetour',
    ]);
    // `maxAttempts` is the distance to the flat arena; the deepest walk found
    // anywhere is 3, so there is real room left before a seed ships flat.
    expect(cfg.maxAttempts).toBe(8);
  });

  it('matches the recorded per-band ledger for retried maps', () => {
    // Recorded 2026-09-04 (fb064r), re-recorded fb166 for 56x32. Worth
    // reading next to the sample ledger: a retried map is not a marginal map.
    // Its worst detour (1.197) sits well under the sample's 1.492 ceiling —
    // the seed+1 map clears the bands by more than the average seed's does,
    // because the band that rejected the first attempt is the one being
    // redrawn.
    expect(ledger(runRetrySet().stats)).toEqual({
      walkableFrac: 'min 0.667411 @1529722299 · mean 0.734885 · max 0.771205 @2098804764',
      buildableNormalFrac: 'min 0.501674 @1529722299 · mean 0.578319 · max 0.618304 @3000001156',
      gateReachFrac: 'min 1.000000 @55118679 · mean 1.000000 · max 1.000000 @55118679',
      coreLegalFrac: 'min 0.477801 @2147484515 · mean 0.534388 · max 0.573382 @2098804764',
      maxGateDetour: 'min 1.016000 @3551933574 · mean 1.095399 · max 1.196850 @3030811518',
    });
  });
});
