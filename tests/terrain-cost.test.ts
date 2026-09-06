/**
 * fb064z — what a generated map costs, measured.
 *
 * Every other terrain test asks what the generator *produces*. This one asks
 * what it *spends*, and it exists because that number is about to be on the
 * critical path: once fb064c wires the generator, every run pays
 * `generateTerrain` before wave 1, and a seed that fails the bands pays it
 * again — up to `maxAttempts` times over. Nothing pinned that, so another
 * repair pass or a tighter constraint could multiply it with no test going
 * red. It is the same hole fb064o closed for path length, where the generator
 * bounded *area* and nothing bounded *travel time*.
 *
 * Two layers, and the split is the point, because only one of them is a
 * measurement of this host:
 *
 *  1. **The attempts ledger** — deterministic. A retry is a whole discarded
 *     generation, so `attempts` is the cost driver that does not depend on
 *     what else the machine is doing, and it is reproducible from the seed
 *     alone. The retry-taking seeds are named.
 *  2. **The host-normalised cost** — wall clock divided by the time the same
 *     process takes to do a fixed unit of arithmetic (`calibrationWork`, the
 *     instrument `q13-perf-ratio` uses for G17). What that buys, precisely, is
 *     comparability across *machines*, not immunity to load: both halves are
 *     taken as least-interrupted minima (see `runLedger`), so under contention
 *     the reported mean rises rather than staying flat — measured by QA at
 *     76-84k idle, 90-95k at 12-way, 120k at 24-way and 176k at 48-way on a
 *     4-CPU box, against a 400k ceiling. Rising is the safe direction; the
 *     first version of this file *deflated* 1.36x under the same load, which
 *     is the failure a cost guard cannot afford. fb065d exists because the
 *     generator's *other* cost test is a raw `Date.now()` bound that goes red
 *     whenever another suite shares the runner; this file does not repeat that
 *     mistake, and QA's control confirms the neighbour is red under load with
 *     or without this file present.
 *
 * What is deliberately **not** pinned: the tail. p99 and the maximum are
 * recorded below as observations rather than asserted.
 *
 * The evidence for that has been re-taken twice and is stated as it now
 * stands. On the *first* instrument a single pass named a different worst seed
 * every time (three consecutive passes gave three different seeds at 170k,
 * 173k and 287k units — readings 2-3.5x the scale this file now reports,
 * because the estimator has since changed twice). On the shipped instrument
 * the argmax is *mostly* stable: QA's eight idle probes named 2147483532 six
 * times and 2485897837 twice, always one of the two retry-taking seeds. Two of
 * eight would still have failed a pinned identity, and under contention the
 * argmax moves to an ordinary interrupted seed at 7-13 means, so the
 * conclusion holds — but "a different seed every round" is no longer the
 * reason, and saying so is the difference between a recorded measurement and a
 * story. The deterministic tail lives in layer 1.
 *
 * **The retry-ratio case is no longer here** (2026-09-06): "a seed that
 * generates twice costs about twice" divides one wall-clock population by
 * another, and on the GitHub runner it read **1.2x against its 1.5x floor**
 * and went red. Its own `MEASURED.retryOverPlain` note already said why — a
 * population of two has no averaging, so contention does not divide out of it
 * the way it does out of the 1498-seed plain population it is compared against
 * — and it is the same class as `a10`, `p10e` and `q13`. It lives in
 * `tests/terrain-cost-retry-ratio.test.ts` and runs single-threaded under
 * `vitest.perf.config.ts`; the sweep both files drive is now
 * `tests/terrain-cost-ledger.ts`, imported by each.
 *
 * What stays here is everything whose bound is either deterministic (the
 * attempts ledger) or taken against the *same run's own* mean over 1498 seeds,
 * where contention moves numerator and denominator together. That includes the
 * anti-vacuity case at the bottom, whose floor of 4 sits against a measured
 * ~9.5x — a different order of headroom from the 1.5-against-2.0 that failed.
 * It is the same shape of assertion, so if it ever reddens on a runner it
 * follows the retry case rather than getting a lower floor.
 */

import { describe, expect, it } from 'vitest';

import {
  generateTerrain,
  parseTerrain,
  MAX_TERRAIN_SEED,
  type TerrainConfig,
} from '../src/sim/terrain';
import { calibrationWork } from '../tools/perf-ratio';

import {
  cfg,
  CALIB_CHUNK,
  MEASURED,
  MEAN_CEILING,
  P95_OVER_MEAN,
  RETRY_CEILING,
  SAMPLE,
  SAMPLE_N,
  quantile,
  runLedger,
} from './terrain-cost-ledger';

describe('fb064z — the cost of a generated map, sampled across the seed domain', () => {
  it('samples the domain, and every sampled seed is a real generated map', () => {
    const { byAttempts, fellBack } = runLedger();
    expect(SAMPLE_N).toBe(1500);
    expect([...byAttempts.values()].reduce((a, b) => a + b, 0)).toBe(SAMPLE_N);
    // The comb must not run off the top of the domain and be silently filtered
    // away, which would leave a smaller sample wearing the same name.
    expect(SAMPLE[0].start + (SAMPLE[0].n - 1) * SAMPLE[0].step).toBeLessThanOrEqual(
      MAX_TERRAIN_SEED,
    );
    // A fallback map is the cheap-but-illegal outcome, and it would make every
    // cost number below a statement about the wrong thing.
    expect(fellBack).toEqual([]);
    // The file's own motivating number, pinned where the motivation is
    // written: a retry-taking seed pays a generation "up to `maxAttempts`
    // times over", so worst-case per-run cost is linear in this. Nothing else
    // in this file can see it move — no sampled seed reaches the cap — and QA
    // confirmed `maxAttempts: 64` passes every other assertion here.
    expect(cfg.maxAttempts).toBe(8);
  });

  it('records the attempts ledger, which is the cost driver that is not a timing', () => {
    const { byAttempts, retries } = runLedger();
    const worst = Math.max(...byAttempts.keys());

    // The numbers, named so a regression is a diff rather than a hunt. They are
    // a property of *this sample* — 1500 of ~4.29e9 seeds, 0.000035% of the
    // domain — not of the domain, exactly as fb064r says of its own 12,000.
    expect(retries.length, `retry-taking seeds in ${SAMPLE_N}`).toBe(MEASURED.retryCount);
    expect(retries.map(([s]) => s).sort((a, b) => a - b)).toEqual(
      [...MEASURED.retrySeeds].sort((a, b) => a - b),
    );
    for (const [seed, n] of retries) expect(n, `seed ${seed} attempts`).toBe(MEASURED.maxAttemptsObserved);
    expect(worst).toBe(MEASURED.maxAttemptsObserved);

    // ...and the band, which is what survives a re-tune. A retry doubles a
    // seed's cost outright, so this is the ceiling that actually protects the
    // budget: the mean below can only be held if retries stay rare.
    expect(
      retries.length,
      'retry count is the deterministic half of the budget',
    ).toBeLessThanOrEqual(RETRY_CEILING);
    expect(byAttempts.get(1) ?? 0).toBeGreaterThanOrEqual(SAMPLE_N - RETRY_CEILING);
  });

  it('holds the cost distribution: a loose absolute mean, a tight shape', () => {
    const { costs, mean } = runLedger();
    const p95 = quantile(costs, 0.95)[1];
    const p99 = quantile(costs, 0.99)[1];

    expect(mean, `mean units/generation (this host ~${MEASURED.meanUnits})`).toBeLessThan(
      MEAN_CEILING,
    );
    // The host-free half. Both sides come from the same minima over the same
    // rounds, so a contention burst cannot inflate one and not the other —
    // which is what made the first version's p95 a flake.
    expect(p95 / mean, `p95/mean (measured ${MEASURED.p95OverMean})`).toBeLessThan(P95_OVER_MEAN);

    // p99 is *recorded, not asserted*, and the reason is measured rather than
    // assumed. Over 1500 seeds p99 is the top 15, which is where scheduler
    // noise concentrates: under 6-way sustained contention on a 4-CPU box the
    // mean and p95 ratios both held while p99/mean read 6.1 against a 2.5
    // ceiling. An assertion that only holds on an idle host is a flake, and
    // fb065d exists because this file's neighbour already learned that.
    expect(p99 / mean, `p99/mean (recorded ${MEASURED.p99OverMean})`).toBeGreaterThan(1);
  });

  it('is sensitive to real generation cost, not measuring the calibration loop', () => {
    // The anti-vacuity check every host-normalised metric in this repo carries.
    // A config no map can satisfy makes every attempt run to `maxAttempts`, so
    // the same instrument must read a multiple of *this run's own* mean —
    // otherwise it is measuring something that is not the generator. Against
    // the run's mean rather than the recorded one, so the floor means the same
    // thing on a host where a generation costs half as much.
    const raw = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
    // `0.9` rather than `1`, which the loader refuses since fb064g: the ceiling
    // is `a / (a + 1)`, and 0.9 is payable and unreachable at once.
    (raw.constraints as Record<string, number>).minCoreLegalFrac = 0.9;
    raw.maxAttempts = 8;
    const hostile: TerrainConfig = parseTerrain(raw);
    const { mean } = runLedger();

    // Warmed and taken as a minimum of three, both halves, for the reason the
    // sweep is: review measured the *first* call with a `parseTerrain`-built
    // config at 63 ms against 6.6-7.4 ms warm, so ~9x of what an earlier
    // version of this test recorded as "42x the mean" was V8 specialising for a
    // second config shape — exactly the cost this test claims to exclude. The
    // honest steady-state reading is ~9.5x, and a floor of 8 sat 15% under it,
    // which is a knife edge dressed as headroom.
    let hostileMs = Infinity;
    let per = Infinity;
    let m: ReturnType<typeof generateTerrain> | null = null;
    for (let i = 0; i < 4; i++) {
      const c0 = performance.now();
      const acc = calibrationWork(CALIB_CHUNK);
      const p = (performance.now() - c0) / CALIB_CHUNK;
      if (Number.isNaN(acc)) throw new Error('unreachable: calibrationWork is integer arithmetic');
      const t0 = performance.now();
      const got = generateTerrain(7, hostile);
      const ms = performance.now() - t0;
      if (i === 0) continue; // discard the cold pair
      hostileMs = Math.min(hostileMs, ms);
      per = Math.min(per, p);
      m = got;
    }
    const units = hostileMs / per;

    expect(m?.attempts).toBe(8); // every attempt really ran
    expect(m?.fallback).toBe(true);
    // Floor 4, against a warm measurement of ~9.5x. It separates "sees the
    // generator" from "sees the calibration loop" — an instrument blind to
    // cost reads ~1x — with room for a host where the ratio sits lower, and
    // without pretending to headroom the cold reading was inventing.
    expect(
      units / mean,
      `a maxed-out retry run must cost a multiple of the mean ` +
        `(warm reading ~${MEASURED.hostileOverMean}x, measured 8.42-10.49)`,
    ).toBeGreaterThan(4);
  });
});
