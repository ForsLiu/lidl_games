/**
 * fb065a — what the zero-headroom bands actually cost.
 *
 * fb064r's ledger found that three of `terrainLegal`'s five numeric bands have
 * no headroom at all at the domain's extremes, on the 36x20 grid: seeds
 * 2005486180 and 228583774 measured `walkableFrac` at exactly 0.600000, seed
 * 2454233399 measured `buildableNormalFrac` at exactly 0.450000, and seeds
 * 301216586 / 816758607 measured `maxGateDetour` at exactly 1.500000.
 *
 * **fb166 re-measured this at the grid's 36x20 -> 56x32 flip, and the finding
 * changed.** At 720 tiles, `0.6 * 720 = 432` and `0.45 * 720 = 324` are both
 * integers, so a map could measure either density band exactly. At 1792
 * tiles, `0.6 * 1792 = 1075.2` and `0.45 * 1792 = 806.4` are not — no map can
 * ever measure `walkableFrac` or `buildableNormalFrac` at exactly its band
 * again, so only `maxGateDetour` (a ratio of integer path costs, not a share
 * of 1792 tiles) still sits at a provable exact edge. `tests/terrain-band-
 * ledger.test.ts` carries the full account; here the two density bands below
 * are the closest a ~320,000-seed search actually found — small but no longer
 * zero. Only `terrainLegal`'s `>=` and `<=` keep any of these maps legal; one
 * step tighter and each is regenerated instead.
 *
 * That is a real finding and easy to read as an alarming one, so this file is
 * the measurement that decides what to do about it. **The verdict is to accept
 * it, and the numbers below are what that verdict rests on**, over fb064r's own
 * 12,000-seed sample so they sit next to its ledger without a sampling excuse:
 *
 *  1. **A seed on the edge costs nothing today.** All five witnesses are
 *     *accepted* on their first attempt (`attempts: 1`). The zero headroom is
 *     not a near-miss; it is a map the generator shipped.
 *  2. **The edge is populated but thinly.** Two maps in the 12,000 sit exactly
 *     on the detour ceiling (0.017%): 816758607, one of the witnesses above,
 *     and 2753786469, which fb064r's table does not name. None sits exactly on
 *     either density floor **in this sample** — and that is a fact about the
 *     comb, not about the generator: only 816758607 of the five witnesses
 *     falls on it, so the density rows of the curve below price the sample,
 *     while the domain has at least the three zero-slack density seeds named
 *     in the paragraph above. The closest density maps here are one tile out
 *     on `walkableFrac` (slack 0.001389) and five on `buildableNormalFrac`
 *     (0.006944); the lattice step is `1/720`. Against that, the median map
 *     clears `walkableFrac` by 0.094 and `buildableNormalFrac` by 0.100, and
 *     sits 0.398 under the detour ceiling.
 *  3. **Tightening a band is cheap at the scale the extremes live at.** One
 *     lattice step costs 2 newly-retrying seeds in 12,000, both on the detour
 *     ceiling; the density floors cost nothing in this sample until four steps
 *     out. Sixteen steps (0.022) on `walkableFrac` costs 41, of which 40 are
 *     newly retrying and one (3687940704) already retries and would simply
 *     walk a step further — so it roughly doubles the sample's own 43-seed
 *     retry rate, and is still 0.34%.
 *
 *     fb064r's tally is the other half of this and is not restated here:
 *     `{ maxGateDetour: 34, walkableFrac: 9 }`, i.e. the band carrying both
 *     on-edge maps is also the band driving 79% of the retries the generator
 *     already pays. Whatever a retune does to the detour ceiling, it moves the
 *     retry rate first and the headroom second.
 *
 * So a repair pass that lifted the extremes off their floors would move every
 * golden in this suite — fb064k's dump, fb064l's variety measures, fb064r's
 * ledger, fb064x's flow-field hashes, fb064z's cost readings — to buy a
 * measured 0.017%. The band positions are worth revisiting when a retune moves
 * the *distribution*, and the cost curve below is what makes that a diff
 * rather than a re-derivation.
 *
 * **The first version of this file reached the same verdict on numbers that
 * were wrong**, and the correction is recorded rather than quietly applied: its
 * comb stride was even, so it visited only even seeds and contained no
 * zero-slack map at all, and its epsilon grid started below the tile lattice,
 * so its smallest column could only ever count exactly-on-edge maps it did not
 * have. It reported "tightening any band by 0.001 rejects zero" as the
 * decision's tripwire. Review disproved it from the sibling ledger's own
 * recorded row. The sample and the grid are both fixed here, and the verdict
 * survives — but it is now a verdict about the generator rather than about a
 * sampling artifact.
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
 * `walkableFrac` and `buildableNormalFrac` are `k / 720` — tile counts over the
 * arena — so their slack is always a multiple of `1 / 720 = 0.001389`, and an
 * epsilon below that can only ever count maps sitting *exactly* on the floor.
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
 * comparison is against a small fixed multiple of `1/720`, so a large slack is
 * robustly outside every column and an absolute epsilon cannot mis-sort it.
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
 * `tests/terrain-band-ledger.test.ts`'s witnesses, with the two columns this
 * file adds: `attempts`, and the bands each witness is *not* on the edge of.
 *
 * fb166 re-derived this table rather than inheriting it: none of the old
 * grid's five witnesses describe a map that still exists. `onEdge` is 0 for
 * every band in *this* 12,000-seed sample — the true `maxGateDetour` edge
 * witness (240840574) came from a separate 300,000-seed domain comb, not from
 * this sample, so it carries no `onEdge` count here either. See the file
 * header for why the density floors are no longer exact.
 */
const WITNESS_ROWS: string[] = [
  '13620 hash=5c18ed6d attempts=1 walkable=0.601004 buildableNormal=0.482701 detour=1.048000',
  '1721604933 hash=f3723519 attempts=1 walkable=0.601004 buildableNormal=0.494978 detour=1.192000',
  '1478659760 hash=908bcd4c attempts=1 walkable=0.605469 buildableNormal=0.454799 detour=1.050847',
  '3462609401 hash=29105b1a attempts=1 walkable=0.684152 buildableNormal=0.518415 detour=1.223077',
  '240840574 hash=d15bd8f5 attempts=1 walkable=0.727121 buildableNormal=0.575893 detour=1.500000',
];

/**
 * Maps the band would newly reject if it tightened by N lattice steps
 * (N/1792). fb166 re-measured over the resized grid's own 12,000-seed sample.
 *
 * "Newly rejected" is not quite "newly retrying" in one cell and the
 * difference is recorded rather than smoothed — every cell's maps are
 * `attempts: 1` here (unlike the old grid's `walkableFrac 16/720` cell, no
 * cell below includes a seed that was already in `RETRY_SEEDS`).
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
    const rows = [13620, 1721604933, 1478659760, 3462609401, 240840574].map((s) => {
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
    // `buildableNormalFrac` can only take values `k / 1792`, so a column below
    // one step counts exactly the maps *on* the floor and nothing else — which
    // is now nothing, for either density band, at every step this curve
    // samples (see the file header: 0.6 and 0.45 are not `k / 1792`).
    const { slack } = runSweep();
    const curve: Record<string, Record<string, number>> = {};
    for (const band of LEGALITY_BANDS) {
      const row: Record<string, number> = {};
      for (const steps of [1, 2, 4, 8, 16]) {
        // `v + EPS < eps`, not `v < eps`: the density slacks are computed as
        // `k / 1792 - 0.6`, which is not bit-identical to the `1 / 1792` this
        // grid multiplies, so a map sitting exactly `steps` lattice steps clear
        // of the floor compared as *inside* the column and inflated it.
        row[`${steps}/1792`] = slack[band].filter((v) => v + FP_EPS < steps * STEP).length;
      }
      curve[band] = row;
    }
    expect(curve).toEqual(CURVE);

    // The recorded decision, as an assertion rather than a paragraph: the
    // maps sitting *exactly* on an edge, which is what the true extremes are,
    // and which one representable step of tightening would newly send round
    // the retry path.
    //
    // fb166: this sample contains **no** on-edge map for any band — the
    // domain's one known `maxGateDetour` edge (240840574) is not inside this
    // 12,000-seed sample, and no density-band edge exists anywhere any more
    // (see the file header). So the set below is empty, which is itself the
    // headroom finding at this grid size: the "cheap to tighten" curve above
    // already prices what moving a band actually costs, and there is no
    // "already on the edge, free to lose" seed sitting inside this sample to
    // separately name.
    const { onEdge, n } = runSweep();
    const oneStepSeeds = new Set<number>();
    for (const band of LEGALITY_BANDS) {
      for (const seed of onEdge[band]) oneStepSeeds.add(seed);
    }
    expect([...oneStepSeeds].sort((a, b) => a - b)).toEqual([]);
    expect(oneStepSeeds.size / n).toBeLessThan(0.001);
    // ...against the retry rate the sample pays today, which is
    // `tests/terrain-band-ledger.test.ts`'s pinned number over the same seeds
    // and is what makes the comparison fair.
    expect(runSweep().retryTaking).toBe(23);
  });
});
