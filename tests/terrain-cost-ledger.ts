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
 * mean inside 3% run to run (measured at 36x20: 80256 / 82159 / 82476 units).
 *
 * **fb166 addendum: two named retry witnesses.** At 56x32 the domain's retry
 * rate collapsed from ~2/1500 in this exact sample to roughly 1 in 10,000-
 * 20,000 domain-wide (see `tests/terrain-run-provenance.test.ts` and
 * `tests/terrain-verify.test.ts`), so the 1500-seed comb above no longer
 * reliably contains a single retry-taking seed — it found zero. Rather than
 * grow the comb by an order of magnitude (which would blow the sweep well
 * past the fast tier for a rate this low), two seeds known to retry — 310 and
 * 339, the first two retry-takers found scanning 1..5000 for
 * `tests/terrain-verify.test.ts` — are appended as their own named row so
 * `tests/terrain-cost-retry-ratio.test.ts`'s "a seed that generates twice
 * costs about twice" claim has live material rather than running vacuously
 * over an empty set. This makes the sample `SAMPLE_N: 1502`, not a round
 * 1500, and moves every mean/p95/p99 reading below by that same small addition
 * of two above-median-cost seeds.
 */
export const SAMPLE: ReadonlyArray<{ name: string; start: number; n: number; step: number }> = [
  { name: 'comb across the whole uint32 domain', start: 0, n: 900, step: 4771397 },
  { name: 'negatives (the signed spelling of the uint32 top)', start: -400, n: 200, step: 1 },
  { name: 'the unsigned half a run draws from', start: 3000000000, n: 200, step: 1 },
  { name: 'the int32 wrap', start: 2 ** 31 - 200, n: 200, step: 1 },
  { name: 'fb166: named retry witnesses (310, 339), see the note above', start: 310, n: 2, step: 29 },
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
 *
 * **fb166 re-measurement, this host, 56x32 (was 36x20).** The domain comb's
 * own retry rate collapsed to the point of finding zero in 1500 seeds — see
 * the note on `SAMPLE` — so `retryCount`/`retrySeeds` below now name the two
 * witnesses added there (310, 339) rather than two seeds the comb happened to
 * find on its own. Every other reading in this block was re-taken fresh on
 * this host rather than adjusted from the 36x20 numbers, since a bigger grid
 * changes `generateTerrain`'s absolute cost as well as its retry rate.
 */
export const MEASURED = {
  /** Mean cost of one generation, calibration units. This host (56x32):
   * ~66.3k-67.2k across repeated probes this session. Not directly comparable
   * to the 36x20 reading (~80k) — a 56x32 generation touches ~2.5x the tiles,
   * so the *raw* cost rose, but the calibration unit itself is unrelated to
   * grid size, and the two effects do not obviously net to "about the same".
   * Recorded as observed rather than reasoned about further. */
  meanUnits: 66_500,
  /** p95 as a multiple of the same run's mean — the host-free number. Two
   * probes this session: 1.038, 1.032. Under contention it can read *below*
   * one, exactly as at 36x20; the ceiling holds either way. */
  p95OverMean: 1.035,
  /** p99 over mean, same idle reading: 1.06-1.08 this session. */
  p99OverMean: 1.07,
  /** The costliest seed in the sample, and what it costs: now one of the two
   * named retry witnesses (310 or 339 — which one names the argmax swaps
   * between probes, exactly the host-local instability the 36x20 version of
   * this note already described), at ~2.0-2.2x the mean. Not asserted, for
   * the same reason as before: a per-seed maximum is the one statistic no
   * normalisation can rescue. */
  worstSeed: 339,
  worstSeedOtherHost: 310,
  worstOverMean: 2.1,
  /** A retry seed's raw cost against the plain population's median. This
   * session: 2.01-2.19 over the two named witnesses, consistent with the
   * 36x20 reading's 1.93-2.09 band and comfortably clear of the 1.5x floor.
   * The same load caveats from 36x20 apply unchanged — this file's `SAMPLE`
   * note explains why the witnesses are now named rather than comb-found. */
  retryOverPlain: 2.05,
  /** The unsatisfiable config, warm, against the same run's mean. Not
   * re-measured in detail for fb166 — this case (seed 7 against an impossible
   * `minCoreLegalFrac`) is independent of the sample's retry rate and the
   * assertion's floor of 4 held comfortably in this session's runs; carried
   * forward as an observation rather than re-derived precisely. */
  hostileOverMean: 9.5,
  /** 2 of 1502 seeds retried, both at 2 attempts — both are the fb166-added
   * named witnesses (310, 339); the domain comb itself contributed zero. */
  retryCount: 2,
  retrySeeds: [310, 339] as const,
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
 * retry (that reading is from a different file's sample and grid size, not
 * re-derived here) — takes this sample from 2 retry-taking seeds to **241**
 * (16.0% of 1502; fb166: 56x32, was 370 of 1500 = 24.7% at 36x20 — the lower
 * share at this grid size is consistent with every other retry-rate reading
 * in this lane moving the same direction). That is the shape of change this
 * file exists to catch: a `/data` retune nobody would think of as a cost
 * change. (The first version of this comment also claimed the p95 ceiling
 * went red on that retune. It did here and did *not* on review's host — 113k
 * against a 200k absolute ceiling — which is exactly the cross-host problem
 * that moved p95 onto a ratio.)
 *
 * Layer 1 overlaps `tests/terrain-band-ledger.test.ts` by design and not by
 * accident: fb064r pins retry-taking seeds over a 12,000-seed *superset* of
 * three of the four ranges below. The two lists agree today (`2147483532` is
 * in both, and no other fb064r retry seed falls inside these subranges), which
 * is corroboration — but a re-tune must update both, and this file is the one
 * that cites the other: fb064r's ledger predates it and carries no back
 * reference.
 */
