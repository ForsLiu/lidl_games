/**
 * fb065a — what the zero-headroom bands actually cost.
 *
 * fb064r's ledger, at the 36x20 grid, found three of `terrainLegal`'s five
 * numeric bands with no headroom at all at the domain's extremes: seeds
 * 2005486180 and 228583774 measured `walkableFrac` at exactly 0.600000, seed
 * 2454233399 measured `buildableNormalFrac` at exactly 0.450000, and seeds
 * 301216586 / 816758607 measured `maxGateDetour` at exactly 1.500000.
 *
 * **fb166 changes this finding's shape, not just its numbers.** The 56x32
 * grid has 1792 tiles, and `0.6 * 1792 = 1075.2` / `0.45 * 1792 = 806.4` are
 * not integers — unlike `0.6 * 720 = 432` / `0.45 * 720 = 324` at the old
 * grid, which is why those two bands landed on exact zero before at all. The
 * *reachable* floor a map's tile count can hit is `ceil(1075.2)/1792 =
 * 1076/1792 = 0.600446` for `walkableFrac`: one representable step above the
 * authored `0.6`, not on it. So the honest zero-headroom seed for that band
 * (761100, found in an 800,000-seed scan from seed 1) sits at slack
 * `0.000446` against the authored constant and exactly `0` against the true
 * reachable floor — both readings are recorded below rather than picking one.
 *
 * `buildableNormalFrac` fares worse: despite a combined 2,000,000-seed search
 * (the same one this suite's other files ran, split three ways, none finding
 * a floor witness for this band), no seed anywhere close to its reachable
 * floor (`807/1792 = 0.450893`) has been found. That is reported as an open
 * search, not a finding of "no such seed exists" — the domain is 4.3 billion
 * seeds and this covered under 0.05% of it.
 *
 * `coreLegalFrac`'s lowest known seed (223269, fb064r's `WITNESSES`) sits at
 * slack `0.287` against its `0.15` floor — nowhere near zero, so it is not
 * reported here as a headroom witness at all; it answers a different
 * question ("how low can this band go") than this file asks ("how close to
 * its floor does a real map get").
 *
 * `maxGateDetour` is the one band whose zero-headroom claim survives the
 * resize intact: it is a ratio, not a tile count, so it is not bound to any
 * lattice, and two seeds (169300, 538103) sit at the authored ceiling
 * `1.500000` exactly, both shipped on their first attempt.
 *
 * That is a real finding and the same question fb064a asked applies: **what
 * does it cost to accept it?** The verdict, re-measured at fb166 over fb064r's
 * own 12,000-seed sample (`tests/terrain-sample.ts`, grid-size-independent),
 * is the same as before — accept it — and on considerably stronger evidence
 * than at the old grid:
 *
 *  1. **A seed on the edge costs nothing today.** All four witnesses below
 *     are *accepted* on their first attempt (`attempts: 1`).
 *  2. **The edge is not populated at this sample's scale at all.** Zero of
 *     the 12,000 sampled seeds sit exactly on any band's floor or ceiling —
 *     against 2 sitting on the detour ceiling in the old 12,000-seed sample.
 *     The sample's retry rate itself fell from 43 to 5 (fb064r), and the
 *     slack distribution below shows why: the closest any sampled map comes
 *     to a floor is 16 `walkableFrac` lattice steps out, and every other band
 *     stays further still.
 *  3. **Tightening a band costs nothing at this sample's scale, up to 16
 *     steps.** Every column of the curve below is 0 except `walkableFrac` at
 *     16 steps, which costs exactly 1 of 12,000 (0.0083%) — down from the old
 *     grid's 41 of 12,000 (0.34%) at the same 16-step column.
 *
 * So the picture at 56x32 is not "the same three bands are still exactly on
 * their floors" — it is "one band (`maxGateDetour`) still touches its ceiling
 * exactly, one (`walkableFrac`) sits one representable step off it, and the
 * remaining two have no known near-floor witness despite a real search." A
 * repair pass chasing this headroom would still be buying very little, now by
 * a wider margin than fb064a measured.
 *
 * The unresolved half — no `buildableNormalFrac` floor witness, and
 * `coreLegalFrac`'s lowest known point being far from its floor — is logged
 * in `BACKLOG-TERRAIN.md` rather than quietly treated as "no such seed
 * exists"; a bigger search could still find one and would belong here if it
 * did.
 */

import { describe, expect, it } from 'vitest';

import { GRID_H, GRID_W } from '../src/sim/grid';
import { generateTerrain, loadTerrain, measureTerrain } from '../src/sim/terrain';
import { failedBands, LEGALITY_BANDS, slackOf, type LegalityBand } from './terrain-legality';
import { COMB_STEP, SAMPLE_N, sampleSeeds } from './terrain-sample';

const cfg = loadTerrain();

/**
 * The sample is fb064r's, **imported** from `tests/terrain-sample.ts` rather
 * than copied — see that file's own header for why a private copy is the one
 * mistake this suite already made once. Every figure below is measured over
 * the same 12,000 seeds fb064r's per-band ledger, retry set and tally are
 * measured over, so "the ledger and the headroom curve disagree" is a real
 * signal rather than a sampling artifact.
 */

/**
 * The tile lattice, which is why the epsilon grid below is not round numbers.
 *
 * `walkableFrac` and `buildableNormalFrac` are `k / 1792` — tile counts over
 * the 56x32 arena — so their slack is always a multiple of `1 / 1792 =
 * 0.000558`. `gateReachFrac`, `coreLegalFrac` and `maxGateDetour` are not tied
 * to this lattice the same way, and the curve below reports them on the same
 * grid anyway so the five bands stay side by side in one table.
 */
const TILES = GRID_W * GRID_H;
const STEP = 1 / TILES;
/**
 * Smaller than any real difference between two slacks, larger than the
 * rounding. Absolute rather than relative — see `terrain-legality.test.ts`
 * for why the mirror's own epsilon has to be relative instead: every
 * comparison here is against a small fixed multiple of `1/1792`, so a large
 * slack is robustly outside every column and an absolute epsilon cannot
 * mis-sort it.
 */
const FP_EPS = 1e-9;

interface Sweep {
  readonly n: number;
  readonly retryTaking: number;
  /** Maps that exhausted `maxAttempts` and shipped the flat arena. */
  readonly fellBack: readonly number[];
  /** Slack per band, ascending. */
  readonly slack: Readonly<Record<LegalityBand, readonly number[]>>;
  /** Mean slack per band, which a median cannot give (CLAUDE.md's rules). */
  readonly mean: Readonly<Record<LegalityBand, number>>;
  /** Seeds whose map sits *exactly* on a band edge, by band. */
  readonly onEdge: Readonly<Record<LegalityBand, readonly number[]>>;
}

/** Computed lazily inside an `it`, for the reason fb064r's ledger records. */
let sweep: Sweep | null = null;
function runSweep(): Sweep {
  if (sweep) return sweep;
  const seeds = sampleSeeds();
  const slack: Record<LegalityBand, number[]> = {
    walkableFrac: [],
    buildableNormalFrac: [],
    gateReachFrac: [],
    coreLegalFrac: [],
    maxGateDetour: [],
  };
  const onEdge: Record<LegalityBand, number[]> = {
    walkableFrac: [],
    buildableNormalFrac: [],
    gateReachFrac: [],
    coreLegalFrac: [],
    maxGateDetour: [],
  };
  let retryTaking = 0;
  const fellBack: number[] = [];
  for (const s of seeds) {
    const m = generateTerrain(s, cfg);
    if (m.attempts > 1) retryTaking++;
    if (m.fallback) fellBack.push(s);
    const q = measureTerrain(m, cfg);
    // The shipped map is legal by construction; asserting it per seed here is
    // what makes every slack below a slack *of a map the game would play*.
    if (failedBands(q, cfg).length !== 0) {
      throw new Error(`seed ${s} shipped an illegal map: ${failedBands(q, cfg).join('|')}`);
    }
    for (const band of LEGALITY_BANDS) {
      const v = slackOf(q, band, cfg);
      slack[band].push(v);
      if (v === 0) onEdge[band].push(s);
    }
  }
  const mean: Record<LegalityBand, number> = {
    walkableFrac: 0,
    buildableNormalFrac: 0,
    gateReachFrac: 0,
    coreLegalFrac: 0,
    maxGateDetour: 0,
  };
  for (const band of LEGALITY_BANDS) {
    mean[band] = slack[band].reduce((a, b) => a + b, 0) / slack[band].length;
    slack[band].sort((a, b) => a - b);
  }
  sweep = { n: seeds.length, retryTaking, fellBack, slack, mean, onEdge };
  return sweep;
}

function at(xs: readonly number[], q: number): number {
  return xs[Math.floor(q * (xs.length - 1))];
}

function fixed(v: number): string {
  return v.toFixed(6);
}

/**
 * Measured at fb166 against shipped `/data` at the 56x32 grid, over fb064r's
 * 12,000-seed sample. Deterministic — properties of the generator and the
 * config, not of the host — so a disagreement here is a real change and the
 * response is to re-measure and re-record, never to widen a tolerance.
 *
 * Every band's `onEdge` is 0 in this sample — a genuinely different picture
 * from the old grid's `maxGateDetour: 2` — which is exactly why the named
 * witnesses below (found domain-wide, not sample-wide) carry this file's
 * "the edge is real but thin" claim instead.
 */
const SLACK: Record<LegalityBand, unknown> = {
  walkableFrac: { min: '0.007701', p5: '0.107031', median: '0.138281', mean: '0.137102', onEdge: 0 },
  buildableNormalFrac: {
    min: '0.019866',
    p5: '0.090179',
    median: '0.134263',
    mean: '0.134095',
    onEdge: 0,
  },
  gateReachFrac: { min: '0.200000', p5: '0.200000', median: '0.200000', mean: '0.200000', onEdge: 0 },
  coreLegalFrac: { min: '0.325840', p5: '0.372299', median: '0.418684', mean: '0.418615', onEdge: 0 },
  maxGateDetour: { min: '0.043478', p5: '0.412409', median: '0.482249', mean: '0.472154', onEdge: 0 },
};

/**
 * The domain-wide near-floor witnesses, one column set richer than the old
 * file's (`coreLegal` is added because 223269's absence from the true
 * headroom conversation is only visible once its own slack is on the row).
 *
 * `761100` is `walkableFrac`'s honest edge — see the header for the
 * authored-vs-reachable distinction. `169300` / `538103` are `maxGateDetour`'s
 * exact ceiling, both from `tests/terrain-band-ledger.test.ts`'s `WITNESSES`.
 * There is no `buildableNormalFrac` row: none was found, and this file does
 * not fabricate one.
 */
const WITNESS_ROWS: string[] = [
  '761100 hash=86d9eff2 attempts=1 walkable=0.600446 buildableNormal=0.476004 coreLegal=0.549824 detour=1.000000',
  '169300 hash=0d571528 attempts=1 walkable=0.736049 buildableNormal=0.596540 coreLegal=0.592142 detour=1.500000',
  '538103 hash=3d22856b attempts=1 walkable=0.737723 buildableNormal=0.583705 coreLegal=0.576482 detour=1.500000',
];

/**
 * Maps the band would newly reject if it tightened by N lattice steps
 * (N/1792). Every column is 0 except `walkableFrac` at 16 steps, where a
 * single sampled seed's slack (0.007701, i.e. ~13.8 steps) falls inside a
 * 16-step tightening. That single seed is `attempts: 1` today and would start
 * retrying under the tightened band; no other cell moves anyone.
 */
const CURVE: Record<LegalityBand, Record<string, number>> = {
  walkableFrac: { '1/1792': 0, '2/1792': 0, '4/1792': 0, '8/1792': 0, '16/1792': 1 },
  buildableNormalFrac: { '1/1792': 0, '2/1792': 0, '4/1792': 0, '8/1792': 0, '16/1792': 0 },
  gateReachFrac: { '1/1792': 0, '2/1792': 0, '4/1792': 0, '8/1792': 0, '16/1792': 0 },
  coreLegalFrac: { '1/1792': 0, '2/1792': 0, '4/1792': 0, '8/1792': 0, '16/1792': 0 },
  maxGateDetour: { '1/1792': 0, '2/1792': 0, '4/1792': 0, '8/1792': 0, '16/1792': 0 },
};

describe('fb065a — the zero-headroom bands, measured and accepted', () => {
  it('re-verifies the witnesses still sit exactly on their band edges', () => {
    // fb166: re-derived, not inherited — the old grid's five witnesses do not
    // carry over (see the header). `attempts` is still the fact this item
    // turns on: every witness here is *accepted* on its first attempt, so the
    // headroom this file measures costs nothing at all today.
    const rows = [761100, 169300, 538103].map((s) => {
      const m = generateTerrain(s, cfg);
      const q = measureTerrain(m, cfg);
      return (
        `${s} hash=${m.hash} attempts=${m.attempts} walkable=${fixed(q.walkableFrac)} ` +
        `buildableNormal=${fixed(q.buildableNormalFrac)} coreLegal=${fixed(q.coreLegalFrac)} ` +
        `detour=${fixed(q.maxGateDetour)}`
      );
    });
    expect(rows).toEqual(WITNESS_ROWS);
  });

  it('records the slack ledger, and the edge maps this sample really contains', () => {
    const { slack, mean, n, onEdge, fellBack } = runSweep();
    // The shared sample's own design, pinned here as well as in fb064r: a
    // reader arriving at this ledger should not have to open another file to
    // learn which 12,000 seeds it is about, and an edit to the module has to
    // redden both files rather than one.
    expect(COMB_STEP).toBe(715827);
    expect(SAMPLE_N).toBe(12000);
    expect(n).toBe(12000);
    // No sampled seed ships the flat arena. The decision below rests on "a
    // rejected attempt just retries, at one extra generation" (fb064z), and
    // that sentence is only true while the retry chain never reaches
    // `maxAttempts` — which is a variety cliff, not one generation.
    expect(fellBack).toEqual([]);

    const ledger: Record<string, unknown> = {};
    for (const band of LEGALITY_BANDS) {
      ledger[band] = {
        min: fixed(at(slack[band], 0)),
        p5: fixed(at(slack[band], 0.05)),
        median: fixed(at(slack[band], 0.5)),
        mean: fixed(mean[band]),
        onEdge: onEdge[band].length,
      };
    }
    expect(ledger).toEqual(SLACK);
  });

  it('prices what tightening each band would cost, which is the decision', () => {
    // The curve the acceptance asks for, and the number the verdict rests on.
    // A map whose slack is under epsilon is exactly a map that a band
    // tightened by epsilon would reject on that attempt, so this counts
    // *newly retrying* seeds without regenerating the sample under four
    // configs — exactly, rather than as a sample of a sample. See the header
    // of the pre-fb166 version of this file (in history) for the two
    // premises that make this shortcut exact rather than approximate; they
    // are unchanged by the resize.
    const { slack } = runSweep();
    const curve: Record<string, Record<string, number>> = {};
    for (const band of LEGALITY_BANDS) {
      const row: Record<string, number> = {};
      for (const steps of [1, 2, 4, 8, 16]) {
        row[`${steps}/${TILES}`] = slack[band].filter((v) => v + FP_EPS < steps * STEP).length;
      }
      curve[band] = row;
    }
    expect(curve).toEqual(CURVE);

    // The recorded decision, as an assertion rather than a paragraph: the
    // maps sitting *exactly* on an edge in this sample, and which one
    // representable step of tightening would newly send round the retry
    // path. fb166: this is empty — a genuinely different result from the old
    // grid's `[816758607, 2753786469]`, and the reason the domain-wide
    // witnesses above carry the "the edge is real" half of this file's claim.
    const { onEdge, n } = runSweep();
    const oneStepSeeds = new Set<number>();
    for (const band of LEGALITY_BANDS) {
      for (const seed of onEdge[band]) oneStepSeeds.add(seed);
    }
    expect([...oneStepSeeds].sort((a, b) => a - b)).toEqual([]);
    expect(oneStepSeeds.size / n).toBeLessThan(0.001);
    // ...against the retry rate the sample pays today, which is fb064r's
    // pinned number over the same seeds (fb166: 5, was 43) and is what makes
    // the comparison fair.
    expect(runSweep().retryTaking).toBe(5);
  });
});
