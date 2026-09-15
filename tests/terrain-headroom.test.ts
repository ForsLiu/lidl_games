/**
 * fb065a — what the zero-headroom bands actually cost.
 *
 * fb064r's original ledger (36x20) found that three of `terrainLegal`'s five
 * numeric bands had no headroom at all at the domain's extremes, and this
 * file's verdict was to accept that: a seed on the edge costs nothing today
 * (every witness ships on its first attempt), the edge is thinly populated,
 * and tightening a band by one representable step is cheap at the scale the
 * extremes live at.
 *
 * **fb166 re-measured everything below for the 56x32 grid, and the shape of
 * the finding changed along with the numbers.** The 12,000-seed sample this
 * file shares with `terrain-band-ledger.test.ts` now contains **zero** maps
 * sitting exactly on any band's edge (was two, both on the detour ceiling) —
 * see the closing case's own note for what that does and does not mean. The
 * witnesses this file re-verifies are `terrain-band-ledger.test.ts`'s own new
 * `WITNESSES` (three `best-found` density/core-legal rows plus the two
 * `maxGateDetour` edge seeds from a 100,000-seed scan); read that file's
 * header for why the density rows are no longer exact-edge witnesses at this
 * tile count. The verdict — tightening a band here is cheap — is unchanged,
 * and if anything more comfortably true: every measured headroom number grew.
 */

import { describe, expect, it } from 'vitest';

import { GRID_H, GRID_W } from '../src/sim/grid';
import {
  generateTerrain,
  loadTerrain,
  measureTerrain,
} from '../src/sim/terrain';
import { failedBands, LEGALITY_BANDS, slackOf, type LegalityBand } from './terrain-legality';
import { COMB_STEP, SAMPLE_N, sampleSeeds } from './terrain-sample';

const cfg = loadTerrain();

/**
 * The sample is fb064r's, **imported** from `tests/terrain-sample.ts` rather
 * than copied.
 *
 * The first version of this file rolled its own at 3000 seeds and got the
 * central measurement wrong for the oldest reason in this suite: `step:
 * 2384720` is **even**, and `fnv1a`/`mulberry32` are bit-mixing functions, so a
 * comb with an even stride from 0 only ever visits even seeds. The biased
 * sample contained no zero-slack map at all and so reported "tightening any
 * band by 0.001 rejects zero" — which review disproved from the sibling
 * ledger's own recorded row, `maxGateDetour max 1.500000 @816758607`: a
 * zero-slack map *inside* fb064r's 12,000.
 *
 * The second version copied fb064r's four rows verbatim, which QA showed buys
 * nothing structural: editing fb064r's comb width reddened fb064r, and left
 * this file green on the old seeds with every recorded band silently measured
 * over a different population than its prose claims. Hence the shared module —
 * the same fix fb064v applied to the legality mirror.
 *
 * Sharing is worth the runtime it costs. Every figure below is measured over
 * the seeds fb064r's per-band ledger, retry set and tally are measured over, so
 * "the ledger and the headroom curve disagree" is a real signal.
 */

/**
 * The tile lattice, which is why the epsilon grid below is not round numbers.
 *
 * `walkableFrac` and `buildableNormalFrac` are `k / TILES` — tile counts over
 * the arena — so their slack is always a multiple of `1 / TILES`, and an
 * epsilon below that can only ever count maps sitting *exactly* on the floor.
 * (fb166: `TILES` is 1792 at 56x32, `1 / TILES ≈ 0.000558` — was 720 and
 * 0.001389 at 36x20; see the closing case's own note on why this sample
 * contains no exactly-on-edge maps at this grid size at all any more.)
 * The first version's grid started at 0.001 and read its zeros as "0.001 buys
 * nothing anywhere", when for those two bands the statement it had made was
 * definitionally "no seed here sits exactly on the floor" — which was the one
 * thing its biased comb was least able to see. The grid is in lattice steps
 * now, and the exactly-on-edge count is reported separately from the near-edge
 * one rather than folded into the smallest column.
 */
const TILES = GRID_W * GRID_H;
const STEP = 1 / TILES;
/**
 * Smaller than any real difference between two slacks, larger than the
 * rounding. Absolute rather than relative — unlike the epsilon
 * `terrain-legality.test.ts` uses for the same class of problem, which has to
 * be relative because it compares against values of unbounded size. Here every
 * comparison is against a small fixed multiple of `1/TILES`, so a large slack
 * is robustly outside every column and an absolute epsilon cannot mis-sort it.
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
 * Measured at fb065a against shipped `/data`, over fb064r's 12,000-seed sample.
 * Deterministic — properties of the generator and the config, not of the host —
 * so a disagreement here is a real change and the response is to re-measure and
 * re-record, never to widen a tolerance.
 */
const SLACK: Record<LegalityBand, unknown> = {
  walkableFrac: { min: '0.006027', p5: '0.107031', median: '0.137165', mean: '0.136371', onEdge: 0 },
  buildableNormalFrac: {
    min: '0.023214',
    p5: '0.090179',
    median: '0.133705',
    mean: '0.133428',
    onEdge: 0,
  },
  gateReachFrac: { min: '0.200000', p5: '0.200000', median: '0.200000', mean: '0.200000', onEdge: 0 },
  coreLegalFrac: { min: '0.287365', p5: '0.338108', median: '0.386842', mean: '0.386919', onEdge: 0 },
  maxGateDetour: { min: '0.007937', p5: '0.292308', median: '0.406250', mean: '0.405161', onEdge: 0 },
};

/**
 * fb064r's witnesses, with the two columns this file adds: `attempts`, and the
 * bands each witness is *not* on the edge of. `228583774` is fb064r's second
 * `walkableFrac` floor seed and is here because the first version of this file
 * silently dropped it.
 */
const WITNESS_ROWS: string[] = [
  '746607561 hash=7ad28ecc attempts=1 walkable=0.606027 buildableNormal=0.488281 detour=1.000000',
  '1871887605 hash=b14cb0e8 attempts=1 walkable=0.630580 buildableNormal=0.473214 detour=1.000000',
  '1922711322 hash=30347d6b attempts=1 walkable=0.701451 buildableNormal=0.516741 detour=1.168000',
  '42711 hash=9f914b72 attempts=1 walkable=0.736049 buildableNormal=0.560268 detour=1.500000',
  '47107 hash=ed336a1b attempts=1 walkable=0.724330 buildableNormal=0.566406 detour=1.500000',
];

/**
 * Maps the band would newly reject if it tightened by N lattice steps
 * (N/1792). fb166 re-measured every cell at 56x32: every non-zero cell's maps
 * are `attempts: 1` (none was already in `terrain-band-ledger.test.ts`'s
 * `RETRY_SEEDS`), so at this grid size "newly rejected" and "newly retrying"
 * coincide exactly rather than differing by one seed the way they did at
 * 36x20.
 */
const CURVE: Record<LegalityBand, Record<string, number>> = {
  walkableFrac: { '1/1792': 0, '2/1792': 0, '4/1792': 0, '8/1792': 0, '16/1792': 1 },
  buildableNormalFrac: { '1/1792': 0, '2/1792': 0, '4/1792': 0, '8/1792': 0, '16/1792': 0 },
  gateReachFrac: { '1/1792': 0, '2/1792': 0, '4/1792': 0, '8/1792': 0, '16/1792': 0 },
  coreLegalFrac: { '1/1792': 0, '2/1792': 0, '4/1792': 0, '8/1792': 0, '16/1792': 0 },
  maxGateDetour: { '1/1792': 0, '2/1792': 0, '4/1792': 0, '8/1792': 0, '16/1792': 2 },
};

describe('fb065a — the zero-headroom bands, measured and accepted', () => {
  it('re-verifies the witnesses still sit exactly on their band edges', () => {
    // A deferral is a measurement with an expiry date, and these are inherited
    // from fb064r rather than re-derived — so they are checked, not trusted.
    // fb064r pins each witness against its own band; what this adds is the
    // `attempts` column and the other four bands, which together are the fact
    // this item turns on: every witness is *accepted* on its first attempt, so
    // today the zero headroom costs nothing at all. It would start costing
    // something only if a band moved, which is what the curve below prices.
    const rows = [746607561, 1871887605, 1922711322, 42711, 47107].map((s) => {
      const m = generateTerrain(s, cfg);
      const q = measureTerrain(m, cfg);
      return (
        `${s} hash=${m.hash} attempts=${m.attempts} walkable=${fixed(q.walkableFrac)} ` +
        `buildableNormal=${fixed(q.buildableNormalFrac)} detour=${fixed(q.maxGateDetour)}`
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
    // A map whose slack is under epsilon is exactly a map that a band tightened
    // by epsilon would reject on that attempt, so this counts *newly retrying*
    // seeds without regenerating the sample under four configs — exactly,
    // rather than as a sample of a sample.
    //
    // That shortcut rests on two premises, stated because they are what makes
    // it exact rather than approximate: `attempt()` never reads
    // `cfg.constraints` (the only reader in `/src/sim` is `analyze.ts`), so a
    // seed's candidate sequence does not depend on where the bands sit; and
    // tightening only shrinks the legal set, so an attempt already rejected
    // stays rejected. What it does *not* price is the retry itself — under a
    // tightened band the next candidate's own slack decides whether the chain
    // stops there — which is why `fellBack` is asserted empty above.
    //
    // The grid is in tile-lattice steps: `walkableFrac` and
    // `buildableNormalFrac` can only take values `k / TILES`, so a column
    // below one step counts exactly the maps *on* the floor and nothing else.
    const { slack } = runSweep();
    const curve: Record<string, Record<string, number>> = {};
    for (const band of LEGALITY_BANDS) {
      const row: Record<string, number> = {};
      for (const steps of [1, 2, 4, 8, 16]) {
        // `v + EPS < eps`, not `v < eps`: the density slacks are computed as
        // `k / TILES - 0.6`, which is not bit-identical to the `1 / TILES`
        // this grid multiplies, so a map sitting exactly `steps` lattice steps
        // clear of the floor compared as *inside* the column and inflated it
        // at the 36x20 grid (the first reading of this curve said `1/720: 2`
        // for `walkableFrac` while the same sweep reported its minimum slack
        // as one whole step and no map on the edge at all — three numbers
        // that could not all be true).
        row[`${steps}/1792`] = slack[band].filter((v) => v + FP_EPS < steps * STEP).length;
      }
      curve[band] = row;
    }
    expect(curve).toEqual(CURVE);

    // The recorded decision, as an assertion rather than a paragraph: the
    // maps sitting *exactly* on an edge, which is what one representable step
    // of tightening would newly send round the retry path.
    //
    // **fb166 finding: the 12,000-seed sample contains none.** At 36x20 this
    // sample held two (816758607, on fb064r's own detour-ceiling witness list,
    // and 2753786469, this file's own find). At 56x32 the closest any sampled
    // seed comes is 16 lattice steps out on `walkableFrac`/`maxGateDetour`
    // (the `CURVE` row above) — zero seeds at 1, 2, 4 or 8 steps, and zero
    // exactly on an edge. That does not mean the domain has no on-edge maps
    // any more: `terrain-band-ledger.test.ts`'s own 100,000-seed targeted scan
    // found three (42711, 47107, 74379) sitting exactly on the `maxGateDetour`
    // ceiling, none of which this 12,000-seed comb happens to sample. The
    // verdict this file exists to support — tightening a band is cheap — is
    // unaffected either way: at this grid size the sample itself does not even
    // pay the zero-headroom cost fb064r's more targeted search still finds
    // elsewhere in the domain.
    const { onEdge, n } = runSweep();
    const oneStepSeeds = new Set<number>();
    for (const band of LEGALITY_BANDS) {
      for (const seed of onEdge[band]) oneStepSeeds.add(seed);
    }
    expect([...oneStepSeeds].sort((a, b) => a - b)).toEqual([]);
    expect(oneStepSeeds.size / n).toBeLessThan(0.001);
    // ...against the retry rate the sample pays today, which is fb064r's
    // pinned number over the same seeds and is what makes the comparison fair.
    expect(runSweep().retryTaking).toBe(23);
  });
});
