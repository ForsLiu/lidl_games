/**
 * q13 (perf tier) — the anti-vacuity half of `tests/q13-perf-ratio.test.ts`,
 * split out at fb-CI-q13 (2026-09-06) so it runs single-threaded under
 * `vitest.perf.config.ts` alongside `a10-performance` and `p10e-perf-budget`.
 *
 * Why the split rather than a looser bound: this case compares two *timing*
 * measurements against each other (worst-case tick vs near-empty tick) and
 * asserts the first is at least 4x the second. On a quiet host the worst case
 * scores ~6.3x its empty world (see the parent file's own recording: worst
 * ~1420, empty ~227). On a shared GitHub runner with two vitest workers
 * driving the rest of the fast tier, the empty world's msPerTick — already
 * near timer resolution, which is why it samples 5000 ticks instead of 500 —
 * inflates proportionally more than the worst case's, and the ratio-of-ratios
 * collapsed toward the floor: CI measured **3.58x** and went red. That is the
 * same reading `vitest.perf.config.ts`'s header describes for `a10` and
 * `p10e` — a timing comparison run under contention says more about the
 * harness than about the sim — so the case moves to the conditions where its
 * number means something rather than having its floor lowered.
 *
 * The parent file keeps every q13 assertion that is not a cross-measurement
 * timing comparison (the ceiling and granularity-stability checks, whose
 * bounds already absorb contention by design, plus the two non-timing
 * fixture/determinism checks) and stays in the fast tier.
 *
 * This stays live: `npm test` runs both configs, so the nightly still measures
 * it, and `npm run test:perf` runs it on demand.
 */
import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { measureRatioForWorld, worstCaseWorld } from '../tools/perf-ratio';
import { cfg } from './helpers';

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** See the parent file's comment: the unshielded fixture dies before the warmup ends and stops ticking. */
function livingWorstCaseWorld(): World {
  const w = worstCaseWorld();
  w.invulnerable = true;
  w.godMode = true;
  return w;
}

/** Median ratio over `n` independent measurements, each against a fresh world from `worldFactory`. */
function medianRatio(
  worldFactory: () => World,
  calibIters: number,
  tickSamples: number,
  warmupTicks: number,
  n: number,
): number {
  const rs: number[] = [];
  for (let i = 0; i < n; i++) rs.push(measureRatioForWorld(worldFactory(), calibIters, tickSamples, warmupTicks).ratio);
  return median(rs);
}

/** Kept identical to the parent file's `CONFIG_A`/`REPEATS` so both halves measure the same instrument. */
const CONFIG_A = { calibIters: 20_000_000, tickSamples: 500, warmupTicks: 200 };
const REPEATS = 5;

describe('q13 — host-normalized perf ratio (timing sensitivity)', () => {
  it('is actually sensitive to sim cost, not vacuous — an empty world scores several times lower', () => {
    // Anti-vacuity: if the ratio were dominated by fixed overhead (Run.step's
    // dispatch, the calibration loop's own noise) rather than by what the
    // worst-case world actually costs to tick, a near-empty world would score
    // close to the worst case instead of far below it.
    //
    // An empty tick is cheap enough that its msPerTick sits near timer
    // resolution, so a single sample (or even a median of 5 at CONFIG_A's
    // 500 ticks) is itself noisy — session 9 measured a single-sample empty
    // ratio low enough by chance to fail this check even though the
    // mechanism was sound. Sampling far more ticks (cheap, since each one is
    // near-empty work) averages that noise down before taking the median.
    const EMPTY_TICK_SAMPLES = 5000;
    const worstRatio = medianRatio(livingWorstCaseWorld, CONFIG_A.calibIters, CONFIG_A.tickSamples, CONFIG_A.warmupTicks, REPEATS);
    const emptyRatio = medianRatio(
      () => new World(cfg({ seed: 1 })),
      CONFIG_A.calibIters,
      EMPTY_TICK_SAMPLES,
      CONFIG_A.warmupTicks,
      REPEATS,
    );
    expect(emptyRatio).toBeGreaterThan(0);
    // Merge port, re-measured: the old sim's worst case scored >10x its empty
    // world; the SPEC-FINAL sim's spatial-bucket and cache work brought the
    // horde's *relative* cost down to ~6.3x on this host (worst ~1420, empty
    // ~227, contended run). The floor is what anti-vacuity needs — a ratio
    // dominated by fixed overhead would put the two within ~1x of each other
    // — set clear of both that failure mode and the measured value.
    expect(worstRatio, `worst=${worstRatio.toFixed(0)} empty=${emptyRatio.toFixed(0)}`).toBeGreaterThan(
      emptyRatio * 4,
    );
  });
});
