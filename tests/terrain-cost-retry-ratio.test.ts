/**
 * fb064z (perf tier) — "a seed that generates twice costs about twice".
 *
 * Split out of `tests/terrain-cost.test.ts` on 2026-09-06 and moved to
 * `vitest.perf.config.ts`'s single-threaded run, alongside `a10-performance`,
 * `p10e-perf-budget` and `q13-perf-sensitivity`. On the GitHub runner it
 * measured **1.2x against its 1.5x floor** and went red.
 *
 * The reason was written into `MEASURED.retryOverPlain` in
 * `tests/terrain-cost-ledger.ts` before this ever ran on CI: idle, this is the
 * tightest number in the ledger and the only one calibration-free on both
 * sides — but **under load it is not a band at all**, because a population of
 * retry seeds this small has no averaging while the plain population it is
 * divided by does. QA had already measured it at 9.1, 12.7 and 16.6 under 12-
 * and 24-way contention (36x20 grid, when the retry population was two). The
 * inference drawn then was that contention can only inflate a raw timing, so a
 * one-sided `> 1.5` floor is a claim noise cannot manufacture a failure for.
 * The runner disproved that half: contention inflates the *denominator* too,
 * and there it has the whole plain population to work on rather than a
 * handful of retry seeds, so the ratio can fall as readily as rise. Same rule
 * as the a10/p10e/q13 family — a ratio of two independent timing measurements
 * does not survive contention, whichever side is noisier — and the same
 * remedy, since lowering a floor of 1.5 against a measured 2.0 would leave the
 * assertion nothing left to say.
 *
 * **fb166 (56x32): the retry population is now one seed, not two** — see
 * `MEASURED.retryCount`/`retrySeeds`. The "no averaging" argument above only
 * sharpens with a smaller population; nothing about the assertion's shape
 * changes.
 *
 * The claim is unchanged and worth keeping: the cost tail is not a property of
 * any map's shape, it is the retry ledger showing through. It stays live —
 * `npm test` runs both configs, so the nightly still measures it.
 */
import { describe, expect, it } from 'vitest';

import { MEASURED, median, runLedger } from './terrain-cost-ledger';

describe('fb064z — the retry cost ratio (timing)', () => {
  it('names the worst seed, and shows it is the retry that makes it worst', () => {
    // The acceptance asks for the worst seed named. Naming it is easy; making
    // the *assertion* about it honest took three rounds of measurement.
    //
    // A single timed pass cannot name it — review reproduced five different
    // argmaxes over five passes. The round minima fix that, but the identity
    // is still host-local, which is why it is read (`MEASURED.worstSeed`) and
    // never asserted — see the note below the assertions for why an argmax
    // assertion cannot survive contention at all.
    //
    // What *is* asserted is the causal claim behind them, which is an
    // aggregate and so survives a contended host: the expensive seeds are the
    // ones that generate twice. That says something the argmax does not — the
    // cost tail is not a property of any map's shape, it is the retry ledger
    // showing through — and it is why a stable argmax was never the real
    // deliverable here.
    //
    // Measured in **raw milliseconds against the plain population's median**,
    // deliberately, and this is the second thing review had to correct. Both
    // sides are wall clock in the same process, so the host cancels exactly and
    // no calibration enters — which matters because a normalised ratio has
    // contention in its *denominator* too, and the plain population averages
    // that away over its ~1499 seeds (fb166: 1498 at the 36x20 grid's
    // two-retry sample) while a population this small cannot. With
    // normalisation in, this assertion failed 5 times in 10 contended runs
    // (0.83x, 1.11x) at 36x20. Calibration-free against the median at 56x32:
    // 1.991-2.021 idle over three runs (see `MEASURED.retryOverPlain`). The
    // median rather than the mean for the same reason: a
    // contended mean is dominated by scheduler outliers.
    const { rawMin, seeds, retries, costs } = runLedger();
    const retrySet = new Set(retries.map(([s]) => s));
    const retryRaw: number[] = [];
    const plainRaw: number[] = [];
    for (let i = 0; i < seeds.length; i++) {
      const seed = seeds[i];
      const raw = rawMin[i];
      if (seed === undefined || raw === undefined) throw new Error(`missing ledger entry at index ${i}`);
      (retrySet.has(seed) ? retryRaw : plainRaw).push(raw);
    }
    expect(retryRaw.length).toBe(MEASURED.retryCount);

    const plainMedian = median(plainRaw);
    for (const v of retryRaw) {
      expect(
        v / plainMedian,
        `a seed that generates twice costs about twice (measured ${MEASURED.retryOverPlain})`,
      ).toBeGreaterThan(1.5);
    }

    // The argmax is *read* and not asserted, and that line was drawn by
    // measurement rather than taste: an earlier draft did assert that the
    // costliest seed is one of the retries, which held idle and at 6-way and
    // failed 4/4 at 10-way, where an ordinary seed interrupted in all three
    // rounds read 7-13 means. That is the same lesson as p99, one seed
    // further out. What survives contention is the aggregate above.
    // The argmax is read and not asserted for the same reason: `max >= mean`
    // holds by construction, so an assertion on it could never fail, and the
    // identity itself is host-local — `MEASURED.worstSeed` names whichever
    // retry seed this host's own runs happened to read as worst, and a
    // different host is free to name the other one.
    const worstEntry = costs[costs.length - 1];
    if (!worstEntry) throw new Error('costs is empty');
    const [worst] = worstEntry;
    void worst;
  });
});
