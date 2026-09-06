/**
 * fb064z's cost ledger — the sweep, the estimator and the recorded numbers,
 * extracted from `tests/terrain-cost.test.ts` (2026-09-06) so that file's
 * retry-ratio case could move to `vitest.perf.config.ts` without either half
 * re-deriving the instrument. Two test files import this; neither owns it.
 *
 * Every design note below was earned by a measurement and is kept verbatim
 * from the original file — in particular why the per-seed minimum is taken in
 * raw milliseconds while the divisor is the minimum `per` over every chunk of
 * every round, which is the correction a second review had to make.
 *
 * `runLedger` memoises per module instance, and vitest gives each test file its
 * own, so the two importers each pay the sweep once.
 */
import {
  generateTerrain,
  loadTerrain,
  MAX_TERRAIN_SEED,
  MIN_TERRAIN_SEED,
} from '../src/sim/terrain';
import { calibrationWork } from '../tools/perf-ratio';

export const cfg = loadTerrain();

/**
 * A fixed, deterministic sample spanning the whole domain, the same shape
 * fb064r's band ledger uses and an eighth of the size: this file times each
 * generation instead of measuring its tiles, and 1500 seeds already put the
 * mean inside 3% run to run (measured: 80256 / 82159 / 82476 units).
 */
export const SAMPLE: ReadonlyArray<{ name: string; start: number; n: number; step: number }> = [
  { name: 'comb across the whole uint32 domain', start: 0, n: 900, step: 4771397 },
  { name: 'negatives (the signed spelling of the uint32 top)', start: -400, n: 200, step: 1 },
  { name: 'the unsigned half a run draws from', start: 3000000000, n: 200, step: 1 },
  { name: 'the int32 wrap', start: 2 ** 31 - 200, n: 200, step: 1 },
];

export function sampleSeeds(): number[] {
  const out: number[] = [];
  for (const r of SAMPLE) for (let i = 0; i < r.n; i++) out.push(r.start + i * r.step);
  return out.filter((s) => s >= MIN_TERRAIN_SEED && s <= MAX_TERRAIN_SEED);
}

export const SAMPLE_N = sampleSeeds().length;

/**
 * Calibration, **interleaved into the sweep** rather than measured up front.
 *
 * The first version of this file took one best-of-3 calibration before the
 * sweep and divided every later timing by it. That is precisely the pattern
 * `tools/perf-ratio.ts` records as measured-and-rejected — "a contiguous
 * measurement let a contention burst land on one block and not the other, and
 * the ratio it produced was ~3x its quiet-host value" — and the minimum made
 * it worse, deliberately picking the quietest window for the denominator while
 * the numerator ate whatever came later. Review reproduced the consequence: run
 * beside five sibling terrain suites, p95 read 355k-367k against a 200k
 * ceiling, red 4/4, while the same group without this file stayed green.
 *
 * So calibration runs *inside* the loop, one chunk per `CHUNK_SEEDS` seeds.
 * What the interleaving buys, after the estimator was corrected a second time
 * (see `runLedger`), is no longer a per-chunk ratio — every seed is divided by
 * one global minimum — but a *well-spread sample* of the denominator: ninety
 * short calibration windows scattered through the sweep, so the minimum over
 * them is a real reading of this host rather than of one arbitrary moment at
 * the start. `CALIB_CHUNK` is sized to about one generation (~1.2 ms) for the
 * same reason: a 5.8 ms window is long enough that even its minimum over
 * ninety samples contains a preemption, while the 1.2 ms numerator's minimum
 * does not, and that mismatch deflates the mean under load.
 */
export const CALIB_CHUNK = 80_000;
const CHUNK_SEEDS = 50;

export interface Ledger {
  /** How many sampled seeds took each attempt count. */
  readonly byAttempts: ReadonlyMap<number, number>;
  /** Seeds that needed more than one attempt, with the count. */
  readonly retries: ReadonlyArray<readonly [number, number]>;
  /** Seeds that exhausted `maxAttempts` and shipped the flat arena. */
  readonly fellBack: readonly number[];
  /** Per-seed cost in calibration units, ascending. */
  readonly costs: ReadonlyArray<readonly [number, number]>;
  /** Per-seed raw milliseconds, minimum over the rounds, in sample order. */
  readonly rawMin: readonly number[];
  /** The sample, in the order `rawMin` is indexed by. */
  readonly seeds: readonly number[];
  /** Mean cost per generation, calibration units. */
  readonly mean: number;
}

interface Pass {
  /** Raw milliseconds per seed, in sample order. */
  readonly ms: number[];
  /** ms per calibration unit for each chunk of this pass. */
  readonly per: number[];
}

/**
 * One pass over the sample, timing each generation and each chunk's
 * calibration. `attempts`/`fallbacks`, when passed, are collected from the same
 * generations rather than from a separate sweep: `m.attempts` is deterministic,
 * so reading it here costs nothing and saves 1500 regenerations (~1.9 s of an
 * 8 s file). Recording it does not perturb the timing — the read happens after
 * `performance.now()`.
 */
function pass(
  seeds: readonly number[],
  attempts: Map<number, number> | null,
  retries: Array<readonly [number, number]> | null,
  fallbacks: number[] | null,
): Pass {
  const ms = new Array<number>(seeds.length);
  const per: number[] = [];
  for (let base = 0; base < seeds.length; base += CHUNK_SEEDS) {
    const c0 = performance.now();
    const acc = calibrationWork(CALIB_CHUNK);
    per.push((performance.now() - c0) / CALIB_CHUNK);
    if (Number.isNaN(acc)) throw new Error('unreachable: calibrationWork is integer arithmetic');
    for (let i = base; i < Math.min(base + CHUNK_SEEDS, seeds.length); i++) {
      const t0 = performance.now();
      const m = generateTerrain(seeds[i], cfg);
      ms[i] = performance.now() - t0;
      if (attempts) attempts.set(m.attempts, (attempts.get(m.attempts) ?? 0) + 1);
      if (retries && m.attempts > 1) retries.push([seeds[i], m.attempts]);
      if (fallbacks && m.fallback) fallbacks.push(seeds[i]);
    }
  }
  return { ms, per };
}

/**
 * The sweep, computed once and lazily — inside an `it`, never at collection
 * time, for the reason fb064r's ledger records: a throw in the loop would
 * otherwise surface as a file collection error and take every test in the file
 * with it, and `vitest -t` would pay the whole sweep to run one test.
 *
 * **The minimum and the normalisation are taken separately, and that is the
 * whole design.** The obvious version — normalise each pass, then take each
 * seed's smallest normalised cost — is wrong in a way that took a second
 * review to catch: `min_r(t_i / per_r)` is `t_min / per_max`, so it picks the
 * round with the *largest denominator*, and `per`'s dispersion explodes under
 * load. Measured by review at 12-way contention on a 4-CPU box: each round's
 * own mean stayed flat (53-61k, exactly as a normalised metric should), while
 * the mean of the minima collapsed to ~9.8k — a 4.7x deflation that would let
 * a true 10x regression pass the absolute ceiling on a busy runner.
 *
 * So: the per-seed minimum is taken in **raw milliseconds**, and the divisor
 * is the **minimum `per` over every chunk of every round**. Both halves then
 * estimate the least-interrupted value, which is the consistent pairing the
 * broken version lacked. Measured residual: 45242 idle against 29785-32703 at
 * 12-way, 1.4x rather than 4.7x.
 */
const ROUNDS = 3;
let ledger: Ledger | null = null;
export function runLedger(): Ledger {
  if (ledger) return ledger;
  const seeds = sampleSeeds();
  // Warm the generator the way the calibration loop is warmed: without this
  // the first seed timed is the JIT's, and it was the measured argmax on a
  // clean run (review). 200 seeds is enough to reach steady state and is not
  // part of any recorded number. It is not a substitute for `ROUNDS`: review
  // measured the first timed round alone at p95/mean 1.48 against 1.05 for the
  // min of three.
  //
  // **200 does not reach steady state, and the claim that it did was wrong.**
  // QA counted which round supplied each seed's minimum: uniform would be
  // 500/500/500 and the readings are [456,401,643], [312,461,727],
  // [235,553,712] — a ramp, i.e. `ROUNDS` is still doing warmup work. A full
  // 1500-seed warm pass flattens it ([475,510,515]) at ~1.8 s on a 6 s file.
  // Kept at 200 deliberately: the bias inflates the reported cost (later
  // rounds are faster, so an under-warmed early round can only *raise* a
  // minimum), which is the conservative direction for a ceiling, and the mean
  // moves ~1% between the two settings. Recorded rather than fixed so the next
  // reader knows it is a choice.
  for (let i = 0; i < 200; i++) generateTerrain(seeds[i], cfg);

  const byAttempts = new Map<number, number>();
  const retries: Array<readonly [number, number]> = [];
  const fellBack: number[] = [];
  const first = pass(seeds, byAttempts, retries, fellBack);
  const rawMin = [...first.ms];
  let perMin = Math.min(...first.per);
  for (let r = 1; r < ROUNDS; r++) {
    const next = pass(seeds, null, null, null);
    for (let i = 0; i < rawMin.length; i++) rawMin[i] = Math.min(rawMin[i], next.ms[i]);
    perMin = Math.min(perMin, ...next.per);
  }

  const units = rawMin.map((v) => v / perMin);
  const costs = seeds.map((s, i) => [s, units[i]] as const).sort((a, b) => a[1] - b[1]);
  const mean = units.reduce((a, b) => a + b, 0) / units.length;
  ledger = { byAttempts, retries, fellBack, costs, rawMin, seeds, mean };
  return ledger;
}

export function median(xs: readonly number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function quantile(costs: Ledger['costs'], q: number): readonly [number, number] {
  return costs[Math.floor(q * (costs.length - 1))];
}

/**
 * Measured at fb064z against shipped `/data`, and **every number here is a
 * reading on one host**, named as such because the normalised unit is not
 * host-independent: `generateTerrain` is memory-bound and `calibrationWork` is
 * pure ALU, so their ratio moves with microarchitecture. Review measured a
 * mean of ~47k on its box against ~82k on this one — a 1.75x spread on a
 * metric that removes *load*, not *machine*.
 *
 * That is why the guards below are split by what each can honestly carry:
 *  - the **retry ledger** is exact and reproducible, so it is pinned tightly;
 *  - the **shape** of the cost distribution is pinned *relative to the same
 *    run's own mean*, which cancels the host entirely;
 *  - the **absolute** mean ceiling is deliberately loose. Across two hosts the
 *    honest thing it can catch is an order-of-magnitude regression, and a
 *    tighter number would be a cross-host flake wearing a guard's clothes.
 * A generator or `/data` change is expected to move the recorded readings; the
 * right response is to re-measure and re-record, never to relax a ceiling.
 */
export const MEASURED = {
  /** Mean cost of one generation, calibration units. Re-measured at fb166's
   * 56x32 resize (a single reading this session, not the multi-probe range the
   * pre-resize numbers below were): ~78.9k idle on this host — inside the old
   * 76.0k-83.8k pre-resize range despite generation now touching 2.5x the
   * tiles, because the unit is a ratio to `calibrationWork` and both the
   * generator's per-tile cost and its total tile count moved. Review's host
   * pre-resize: ~45k idle. The spread *between hosts* is the point of the
   * `MEAN_CEILING` note below; the spread *within* one is why nothing here is
   * asserted tighter than a same-run ratio. */
  meanUnits: 79_000,
  /** p95 as a multiple of the same run's mean — the host-free number.
   * Re-measured: 1.035 (one idle reading this session; pre-resize idle range
   * was 1.034-1.038). Under contention it can read *below* one, because the
   * mean is dragged up by a handful of interrupted seeds; the ceiling holds
   * either way. */
  p95OverMean: 1.035,
  /** p99 over mean, same idle reading: 1.074 this session (pre-resize idle
   * range 1.056-1.062; recorded and not asserted either way, since load can
   * push it to 4-7x). */
  p99OverMean: 1.074,
  /** The costliest seed in the sample, and what it costs: 1.973x the mean this
   * session — and, at this sample size (1 retry-taking seed, see
   * `retryCount`), the costliest seed *is* the retry seed, so this reading and
   * `retryOverPlain` below are the same measurement. Pre-resize, with 2
   * retry-taking seeds, the two could differ; per-seed identity is still never
   * asserted, since a per-seed maximum is the one statistic no normalisation
   * can rescue. What the test asserts instead is the aggregate: a retry-taking
   * seed's raw cost against the plain population's median. */
  worstSeed: -329,
  worstOverMean: 1.97,
  /** A retry seed's raw cost against the plain population's median. Re-measured
   * this session at 1.977 (pre-resize idle range was 1.93-2.09 across 28
   * observations on two hosts). **Under load it is not a band at all**
   * (pre-resize QA measured 9.1-16.6x at 12- and 24-way contention), because a
   * population of one or two has no averaging and an interrupted seed keeps
   * its inflated minimum. What carries there is the one-sided floor:
   * contention can only inflate a raw timing, so `> 1.5` is a claim noise
   * cannot manufacture a failure for, which is the whole reason this assertion
   * has no upper bound. */
  retryOverPlain: 1.97,
  /** The unsatisfiable config, warm, against the same run's mean: 15.2x this
   * session (pre-resize range was 8.42-10.49 across two agents' probes — a
   * single fresh reading is expected to land outside a two-agent range).
   * Cold it can read far higher, which is V8 specialising for a second config
   * shape and not the generator — see the test. */
  hostileOverMean: 15.2,
  /** 1 of 1500 seeds retried, at 2 attempts. (Pre-resize this was 2 of 1500;
   * the resize moved which seeds land in this 1500-seed sample and how many of
   * them retry — expected, since retries are driven by the same bands whose
   * lattice moved with the grid.) */
  retryCount: 1,
  retrySeeds: [-329] as const,
  /** The largest attempt count *observed*, not `cfg.maxAttempts` (which is 8).
   * Named apart because `expect(worst).toBe(MEASURED.maxAttemptsObserved)` read as
   * "the cap is 2". */
  maxAttemptsObserved: 2,
} as const;

/**
 * ~5x this host's mean, ~9x review's. An absolute cross-host ceiling can
 * honestly catch an order of magnitude and no more, and QA measured exactly
 * where that line falls by injecting a scaled busy-loop into `attempt()`: a
 * **4.1x** uniform generation-cost regression passes this ceiling, a **5.7x**
 * one reddens it. So the item's motivating sentence — "another repair pass
 * could multiply the cost with no test going red" — is closed above ~5.2x and
 * open below it. That is a number the item did not have, and it is written
 * here rather than in a report because it is the thing a future reader needs
 * when they wonder whether this guard would have caught their change. The
 * tight guards are the retry ledger and the relative shape below. It is only worth having because
 * the estimator no longer collapses under load — the first version's
 * min-of-normalised-rounds deflated the mean 4.7x at 12-way contention, which
 * would have let a genuine 10x regression pass on a busy runner.
 */
export const MEAN_CEILING = 400_000;
/**
 * p95 against the same run's own mean. Measured ~1.04x idle and 0.90-0.95x
 * under 10-way contention (the mean rises faster than p95 there), so 3x is
 * headroom against a real distribution change in either direction.
 */
export const P95_OVER_MEAN = 3;
/** p99 is recorded, never asserted — see the test for the measurement. */

/** Retries are the deterministic cost driver, so this one is tight: 2.5x measured. */
export const RETRY_CEILING = 5;

/**
 * The retry ceiling is not decoration, demonstrated rather than argued:
 * setting `density.jitter` to 1 in `data/terrain.json` — the loader's own
 * maximum, and the value fb064l measured as pushing 26.7% of seeds into a
 * retry — takes this sample from 2 retry-taking seeds to **370**. That is the
 * shape of change this file exists to catch: a `/data` retune nobody would
 * think of as a cost change. (The first version of this comment also claimed
 * the p95 ceiling went red on that retune. It did here and did *not* on
 * review's host — 113k against a 200k absolute ceiling — which is exactly the
 * cross-host problem that moved p95 onto a ratio.)
 *
 * Layer 1 overlaps `tests/terrain-band-ledger.test.ts` by design and not by
 * accident: fb064r pins retry-taking seeds over a 12,000-seed *superset* of
 * three of the four ranges below. The two lists agree today (`2147483532` is
 * in both, and no other fb064r retry seed falls inside these subranges), which
 * is corroboration — but a re-tune must update both, and this file is the one
 * that cites the other: fb064r's ledger predates it and carries no back
 * reference.
 */
