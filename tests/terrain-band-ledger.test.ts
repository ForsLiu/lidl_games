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
 * once.** The `edge` witnesses sit on a band *edge*, and an edge is provable: a
 * map outside its band is regenerated at seed+1, so the band value itself is
 * the extreme and no seed can beat it — the search only had to find one seed
 * that reaches it. `coreLegalFrac`'s floor is far from anything the generator
 * produces, so its extreme is a **search result**, and no scan of a
 * 4.3-billion-seed domain can promote a search result to a property. `kind`
 * carries the distinction and the row says how big the search behind it was.
 *
 * **fb166 re-derivation (56x32; was 36x20).** The grid resize changed which
 * fractions the tile lattice can even produce exactly: `0.6 * 1792 = 1075.2`
 * and `0.45 * 1792 = 806.4` are not integers (they were `432` and `324` at
 * 720 tiles), so the true floor for each density band is now the smallest
 * lattice point clearing it — `1076/1792 = 0.600446` for `walkableFrac`,
 * `807/1792 = 0.450223` for `buildableNormalFrac` — rather than the authored
 * constant itself. That value is still provably the extreme, for the same
 * reason as before (a map under it is regenerated), so it is still `kind:
 * 'edge'`; only the printed number changed shape. Every witness below was
 * re-found for this grid size by a plain incrementing scan from seed 1 (a few
 * hundred thousand to under a million seeds per band — see each row's own
 * note), which is a far smaller search than fb064r's original 250,006- and
 * 12,000,000-seed combs. That is an honest trade this lane made under this
 * item's time budget, not a claim that these are harder-to-find extremes:
 * where a second independent witness existed before (two seeds each on the
 * walkable floor and the detour ceiling), this file kept that shape where a
 * second was found and dropped to one where it was not, rather than inventing
 * a second.
 *
 * Provenance:
 *   - `761100` (`walkableFrac` floor) — found scanning seeds 1..800,000.
 *     fb166 does not carry a second independent witness on this floor (was
 *     two at 36x20); a second was searched for over roughly 1,000,000 more
 *     seeds (both a continued low-seed scan and a scan starting at
 *     3,000,000,000) without success within this item's budget.
 *   - `1513721174`'s role is now filled by `223269` (`coreLegalFrac` floor,
 *     `best-found`) — the best of an 800,000-seed scan, three orders of
 *     magnitude smaller than fb064r's 12,000,000-seed one. A bigger scan
 *     arriving at a lower value one day is expected, not a regression.
 *   - `169300` and `538103` (`maxGateDetour` ceiling) — both found scanning
 *     seeds 1..800,000; two independent seeds on the ceiling, same shape as
 *     36x20's pair.
 *   - The `buildableNormalFrac` floor witness (`301216586`'s old role) is
 *     **not present below** — an 800,000-seed low scan and a 1,200,000-seed
 *     continuation (2,000,000 seeds total) found no seed landing on
 *     `807/1792` exactly. Logged in `BACKLOG-TERRAIN.md` as unfinished
 *     measurement rather than filled with a `best-found` stand-in wearing an
 *     `edge` label it has not earned.
 *
 * **The tight bands have exactly zero headroom on every witness that exists.**
 * A seed measuring exactly `maxGateDetour: 1.5` ships for the same reason a
 * seed measuring exactly the walkable floor does — `terrainLegal` compares
 * with `<=` and `>=` — so tightening either band by one representable step is
 * not a tune, it is a decision to regenerate those seeds' maps. That is
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

// fb166: re-derived at 56x32 (see the header note above for what changed and
// why). Was, at 36x20: 2005486180/228583774 (walkableFrac floor, both edge,
// value 0.6), 2454233399 (buildableNormalFrac floor, edge, value 0.45),
// 1513721174 (coreLegalFrac floor, best-found, 139/369 = 0.376694),
// 301216586/816758607 (maxGateDetour ceiling, both edge, value 1.5).
const WITNESSES: readonly Witness[] = [
  {
    seed: 761100,
    band: 'walkableFrac',
    side: 'floor',
    kind: 'edge',
    value: 1076 / 1792,
    limit: cfg.constraints.minWalkableFrac,
    hash: '86d9eff2',
    // 1076/1792 walkable = 0.600446 — the smallest lattice point clearing the
    // authored 0.6 floor (which is not itself on the 1792-tile lattice), so
    // still provably the extreme. Found scanning seeds 1..800,000; no second
    // independent witness found in ~1,000,000 further seeds searched (a
    // continued low-seed scan and a scan starting at 3,000,000,000).
  },
  {
    seed: 223269,
    band: 'coreLegalFrac',
    side: 'floor',
    kind: 'best-found',
    value: 0.43743199129488575,
    limit: cfg.constraints.minCoreLegalFrac,
    hash: 'b980614a',
    // The loosest band by a distance, ~29 pp above its 0.15 floor, and the
    // only row here that a bigger scan can beat by design. Best of 800,000
    // seeds (fb166; was best of 12,000,000 at 36x20 — three orders of
    // magnitude smaller, an honest trade under this item's time budget). A
    // replacement seed arriving one day is expected and is not evidence of a
    // regression.
  },
  {
    seed: 169300,
    band: 'maxGateDetour',
    side: 'ceiling',
    kind: 'edge',
    value: 1.5,
    limit: cfg.constraints.maxGateDetour,
    hash: '0d571528',
    // exactly the ceiling. Found scanning seeds 1..800,000.
  },
  {
    seed: 538103,
    band: 'maxGateDetour',
    side: 'ceiling',
    kind: 'edge',
    value: 1.5,
    limit: cfg.constraints.maxGateDetour,
    hash: '3d22856b',
    // a second seed exactly on the detour ceiling, same scan.
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

  it('the ceiling has exactly zero headroom; the density floor is a lattice step off the authored constant', () => {
    // Not "about zero" for `maxGateDetour`. `===` against the authored band,
    // because the whole claim is that this seed passes on the `<=` boundary
    // itself.
    //
    // fb166 changes what this test can honestly say about the density floor.
    // `walkableFrac`'s authored constant (0.6) is not on the 1792-tile
    // lattice, so the *true* floor `generateTerrain` can ever return is
    // `1076/1792 = 0.600446`, not `0.6` itself — a small but real, permanent
    // gap against the authored number that no seed search can close, because
    // it is geometry rather than a search limit. `w.value` carries that true
    // floor; `w.limit` carries the authored constant; the two rows below
    // report the gap against each so neither is silently conflated with the
    // other the way `terrain-generation.test.ts`'s cliff case almost was.
    const headroomAgainstValue = WITNESSES.map((w) => {
      const q = measureTerrain(generateTerrain(w.seed, cfg), cfg);
      const gap = w.side === 'floor' ? q[w.band] - w.value : w.value - q[w.band];
      return `${w.seed} ${w.band} ${w.side} ${w.kind} ${fmt(gap)}`;
    });
    expect(headroomAgainstValue).toEqual([
      '761100 walkableFrac floor edge 0.000000',
      '223269 coreLegalFrac floor best-found 0.000000',
      '169300 maxGateDetour ceiling edge 0.000000',
      '538103 maxGateDetour ceiling edge 0.000000',
    ]);
    // The gap against the *authored* constant, which is where the lattice
    // shows through: zero for the ceiling (1.5 is itself on the detour's own
    // scale), `(1076 - 0.6*1792) / 1792 = 0.8/1792 = 0.000446` for the
    // walkable floor — 0.6 sits 0.8 of a tile short of the nearest lattice
    // point above it, not a clean single quantum, because the authored
    // constant does not itself land on the lattice — and the search's own
    // remaining distance for `coreLegalFrac`, which was never claiming to sit
    // on anything.
    const headroomAgainstLimit = WITNESSES.map((w) => {
      const q = measureTerrain(generateTerrain(w.seed, cfg), cfg);
      const gap = w.side === 'floor' ? q[w.band] - w.limit : w.limit - q[w.band];
      return `${w.seed} ${w.band} ${w.side} ${w.kind} ${fmt(gap)}`;
    });
    expect(headroomAgainstLimit).toEqual([
      '761100 walkableFrac floor edge 0.000446',
      '223269 coreLegalFrac floor best-found 0.287432',
      '169300 maxGateDetour ceiling edge 0.000000',
      '538103 maxGateDetour ceiling edge 0.000000',
    ]);
    // Every `edge` row is asserted bit-exact against its *true* value — and
    // the check is driven off `kind`, not off a band name, so a future
    // `best-found` row cannot quietly inherit a claim that only an edge can
    // make.
    for (const w of WITNESSES) {
      const v = measureTerrain(generateTerrain(w.seed, cfg), cfg)[w.band];
      if (w.kind === 'edge') expect(v).toBe(w.value);
      else expect(w.side === 'floor' ? v > w.limit : v < w.limit).toBe(true);
    }
  });

  it('one representable step tighter and each witness is regenerated instead', () => {
    // What "zero headroom" costs, made falsifiable. Each witness stops being
    // its own map and plays seed+1's — asserted, not just claimed.
    //
    // The step is the smallest one that means anything for the band: one tile
    // out of 1792 for the walkable floor (fb166: was 720), which is the
    // lattice below — stepping from the *true* floor `761100` sits on, not
    // from the authored constant, which the floor itself does not reach. For
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
    // fb166: the tighter density floor is one lattice step past the *true*
    // floor (1077/1792, not 1076/1792), not past the authored constant —
    // tightening from 0.6 to 433/720 would not have moved anything at 720
    // tiles either; the same logic just now has a different authored/true gap
    // to step past first.
    const cases: ReadonlyArray<[number, TerrainConfig]> = [
      [761100, tighten((c) => (c.minWalkableFrac = 1077 / 1792))],
      [169300, tighten((c) => (c.maxGateDetour = 1.4999))],
      [538103, tighten((c) => (c.maxGateDetour = 1.4999))],
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

  it('fb166: neither density floor lands on the tile lattice any more, and the reachable floor is the ceiling of it', () => {
    // At 36x20 this case's title was "the two density floors are reachable
    // exactly because they land on the tile lattice" — both fractions are
    // `k / TILES`, so a floor is attainable exactly iff `floor * TILES` is an
    // integer, and at 720 tiles `0.6 -> 432` and `0.45 -> 324` both were. At
    // 1792 tiles neither is: `0.6 * 1792 = 1075.2` and `0.45 * 1792 = 806.4`.
    // This is exactly the "floor of, say, 0.601" case the old comment named
    // as the unreachable shape — it just arrived by grid resize rather than by
    // retune. The measured floor still cannot be *below* the band on a
    // shipped map: a map under it is regenerated at seed+1 (fb064a), so the
    // minimum `generateTerrain` can return is the smallest lattice point
    // *above* the band — `Math.ceil` of the fractional tile count — which is
    // `1076/1792 = 0.600446` for `walkableFrac` and `807/1792 = 0.450223` for
    // `buildableNormalFrac`. That ceiling is exact arithmetic, not a search;
    // finding a seed that actually reaches it is what stayed a search, and
    // fb166 found one for `walkableFrac` (761100) but not, within this item's
    // budget, for `buildableNormalFrac` (see the header note and
    // `BACKLOG-TERRAIN.md`'s Log).
    //
    // From the grid rather than written as 1792: if the arena is ever resized
    // again, the lattice moves and this test's own `onLattice` reading is what
    // would notice whether the new size happens to land on it.
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
      `ceiling walkableCount ${Math.ceil(cfg.constraints.minWalkableFrac * TILES)}`,
      `ceiling normalCount ${Math.ceil(cfg.constraints.minBuildableNormalFrac * TILES)}`,
      `761100 walkableCount ${measureTerrain(generateTerrain(761100, cfg), cfg).walkableCount}`,
    ]).toEqual([
      `tiles 1792`,
      `minWalkableFrac 0.6 onLattice=false`,
      `minBuildableNormalFrac 0.45 onLattice=false`,
      `ceiling walkableCount 1076`,
      `ceiling normalCount 807`,
      `761100 walkableCount 1076`,
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
    // fb166: re-measured at 56x32.
    //
    // Read these as a *distribution*, not as the domain's extremes — the
    // named witnesses above hold those, and every one is at least as extreme
    // as this sample's own row (0.600446 against 0.607701, 0.437432 against
    // 0.475840; the ceiling coincides below). At 36x20 the detour ceiling
    // witness happened to fall inside this same 12,000-seed comb
    // (`816758607 = 1141 × 715827`); at 56x32 neither `169300` nor `538103`
    // does (`169300 / 715827` and `538103 / 715827` are not integers), so this
    // row's own max (1.456522) is *not* the witness value — a coincidence the
    // old comment recorded and this one does not inherit. `gateReachFrac` is 1
    // by construction on generated output (see `measureTerrain`'s comment:
    // after `sealPockets`, `gatesConnected` implies every gate reaches every
    // walkable tile), so its row is a flat line on purpose and its @seed is
    // just the first seed of the sample.
    const { stats } = runSample();
    expect(ledger(stats)).toEqual({
      walkableFrac: 'min 0.607701 @347891922 · mean 0.737102 · max 0.778460 @3000000482',
      buildableNormalFrac: 'min 0.469866 @347891922 · mean 0.584095 · max 0.653460 @3000001990',
      gateReachFrac: 'min 1.000000 @0 · mean 1.000000 · max 1.000000 @0',
      coreLegalFrac: 'min 0.475840 @234791256 · mean 0.568615 · max 0.662902 @3486077490',
      maxGateDetour: 'min 1.000000 @0 · mean 1.027846 · max 1.456522 @1376535321',
    });
  });

  it('records what share of the domain takes the seed+1 retry path', () => {
    // fb064a read the retry rate off seeds 1..20000 and got 5 seeds (0.025%);
    // fb064l re-measured the same window at 18 (0.09%). fb166 (56x32; was
    // 36x20): the same window now reads 13 (0.065%, see
    // `tests/terrain-generation.test.ts`), and over the domain it is 5 of
    // 12,000 — 0.042%, a *lower* domain-wide rate than the near-window one
    // reads, the reverse of the 36x20 relationship. The near window is still
    // not representative of the retry path either way.
    //
    // The set is asserted BEFORE the count. QA found the reverse ordering
    // hiding the one diff this file calls its most retune-sensitive artifact:
    // a retune that moves seeds in and out of the retry path failed with
    // `expected 50 to be 43` and never printed which seeds moved — a hunt,
    // from the assertion whose whole purpose is to be a diff.
    const { retryTaking } = runSample();
    expect(retryTaking).toEqual([...RETRY_SEEDS]);
    expect(retryTaking.length).toBe(5);
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
// fb166: re-measured at 56x32 — was 43 seeds at 36x20 (277740876, 284183319,
// 721553616, 740165118, 880467210, 1262003001, 1481761890, 2010758043,
// 2357218311, 2792441127, 2841833190, 2944912278, 3181135188, 3687940704,
// 4218368511, -1971, -1922, -1456, -1157, -1103, -1062, -720, -560, -427, -99,
// 3000000378, 3000000623, 3000000661, 3000000818, 3000000850, 3000001015,
// 3000001082, 3000001228, 3000001363, 3000001613, 2147483220, 2147483354,
// 2147483532, 2147483742, 2147483774, 2147484163, 2147484244, 2147484391).
const RETRY_SEEDS: readonly number[] = [3352217841, 3362239419, 3497530722, 3000000904, 2147483164];

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
    // fb166: 5, not 43 — see `RETRY_SEEDS`'s own note.
    expect(RETRY_SEEDS.length).toBe(5);
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
    // could miss. Since fb064o added the approach band it is not — and fb166
    // sharpens that finding rather than reversing it: at 56x32 all 5 skipped
    // keys in this (much smaller) sample are rejected for `maxGateDetour` and
    // none for `walkableFrac`. The retry rate is now entirely a fact about
    // `maxGateDetour: 1.5` and `ROOM_RADIUS` in this sample, not about
    // `density` — was 34 of 43 `maxGateDetour` / 9 `walkableFrac` at 36x20.
    expect(runRetrySet().tally).toEqual({ maxGateDetour: 5 });
  });

  it('is a one-step walk only in this sample — two-step walks exist domain-wide', () => {
    // fb166: all 5 sampled seeds still retry exactly once (see the previous
    // test), which reads like a property of the generator and is not one.
    // The pre-resize QA measurement (73 `attempts: 3` seeds in 6,000,000) was
    // itself a `/data`- and grid-size-dependent fact, so it is not carried
    // forward as a rate here — only re-established as an existence claim.
    //
    // A 1,500,000-seed comb of my own from seed 1 (stopped once 2 hits were
    // found, well short of the full 1,500,000) found these two — much rarer
    // than the pre-resize pair (which came from a 300,000-seed search), which
    // is itself consistent with the sample's retry rate falling sharply at
    // this grid size (see `RETRY_SEEDS`'s note: 5 of 12,000 vs 43 of 12,000).
    // They are pinned so the distinction — a two-step walk exists at all —
    // stays visible, and because a retune that makes the bands harder will
    // deepen the walk here first.
    //
    // Unlike the old pair, neither witness here happens to fail two bands at
    // once on its first skipped key — that shape was a property of the old
    // pair, not a claim this file makes generally, so it is not asserted here.
    const walks = [497692, 612855].map((s) => {
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
      '497692 attempts=3 key=497694 fallback=false legal=true ' + '+0:maxGateDetour +1:maxGateDetour',
      '612855 attempts=3 key=612857 fallback=false legal=true ' + '+0:maxGateDetour +1:maxGateDetour',
    ]);
    // `maxAttempts` is the distance to the flat arena; the deepest walk found
    // in this search is 3 (of 8 max), so there is real room left before a
    // seed ships flat — this search did not attempt to find the true deepest.
    expect(cfg.maxAttempts).toBe(8);
  });

  it('matches the recorded per-band ledger for retried maps', () => {
    // fb166: re-recorded for the 56x32 grid and the new 5-seed RETRY_SEEDS.
    // Worth reading next to the sample ledger: a retried map is not a
    // marginal map here either — its worst detour is 1.041 against the
    // sample's 1.457 — though at this small an n (5, not 43) the comparison
    // is weaker evidence than the pre-resize version and is reported as an
    // observation, not a re-proven mechanism.
    expect(ledger(runRetrySet().stats)).toEqual({
      walkableFrac: 'min 0.695313 @3362239419 · mean 0.739732 · max 0.758929 @3000000904',
      buildableNormalFrac: 'min 0.516741 @3362239419 · mean 0.581585 · max 0.608817 @2147483164',
      gateReachFrac: 'min 1.000000 @3352217841 · mean 1.000000 · max 1.000000 @3352217841',
      coreLegalFrac: 'min 0.508639 @3362239419 · mean 0.562115 · max 0.582951 @2147483164',
      maxGateDetour: 'min 1.000000 @3362239419 · mean 1.019641 · max 1.040816 @3352217841',
    });
  });
});
