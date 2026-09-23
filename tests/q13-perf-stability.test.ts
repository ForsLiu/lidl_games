/**
 * q13's two timing cases, split out of `tests/q13-perf-ratio.test.ts`
 * (2026-09-23, CI run 800) into `vitest.perf.config.ts`'s single-threaded run,
 * bounds unchanged — the seventh of the family that config's header lists.
 *
 * The granularity-stability case compares two wall-clock ratios and asserts
 * they agree within 40%. On the shared GitHub runner, inside the fast tier's
 * two workers, it read **43.1%** (A=2589, B=1474) on a commit that touches no
 * sim tick code (terrain gate jitter + dump parsing). That is the same reading
 * that moved p10e and q13-perf-sensitivity: a comparison of two timings taken
 * under contention measures the harness, not the sim. The recorded-ceiling
 * case moves with it because it is the same wall-clock measurement. The two
 * load-independent q13 cases (the worst-case fixture's shape and
 * `calibrationWork`'s determinism) stay in the fast tier.
 *
 * Recorded readings and the ceiling's derivation: see the doc comments below,
 * carried over verbatim.
 */
import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { measureRatioForWorld, worstCaseWorld } from '../tools/perf-ratio';

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s[Math.floor(s.length / 2)];
  if (mid === undefined) throw new Error('median of empty array');
  return mid;
}

/**
 * Merge port: in the SPEC-FINAL sim the worst-case fixture dies almost
 * immediately — the Warden stands still in a cap-full Act II horde with no
 * input, hits 0 HP inside ~100 ticks (before the warmup even ends), and once
 * the run reaches `results`, `Run.step`'s `if (this.done) return` makes every
 * remaining tick a free early-return. Measured (this session): the "worst
 * case" then scores *below* the empty world, because the empty act1_build
 * world at least keeps ticking. The practice-tool shields (`invulnerable` +
 * `godMode`, both real sim flags a dev command toggles) keep the run alive so
 * the ratio keeps measuring the horde, which is this file's whole subject.
 * The fixture-shape test below still checks the unshielded `worstCaseWorld()`
 * directly — the shield changes what a tick costs to *survive*, not what the
 * world contains.
 */
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

function medianWorstCaseRatio(calibIters: number, tickSamples: number, warmupTicks: number, n: number): number {
  return medianRatio(livingWorstCaseWorld, calibIters, tickSamples, warmupTicks, n);
}

/**
 * Recorded ceiling. Re-measured for the SPEC-FINAL sim (merge port): the
 * lane-era recording (~14,000-27,000 quiet, ~29,000-30,000 contended, ceiling
 * 65,000) described a sim whose worst-case tick has since been reworked —
 * measured then, the living worst-case fixture read a median of ~1,420-1,560
 * at the "A" config below on this host *while contended* (three rounds of 5,
 * samples 1,416-2,063, concurrent with the merge's other test runs). This
 * test still runs inside `npm test`'s own parallel file execution and has to
 * tolerate that contention rather than avoid it — see `tools/perf-ratio.ts`'s
 * `measureRatioForWorld` doc comment
 * for the interleaved-measurement design that keeps the ratio steady under
 * exactly that load. That gave the prior ceiling of 6,000 (~4x the contended
 * median).
 *
 * **Re-measured this session (fb054 close-out)**: `worstCaseWorld()` fills to
 * `aliveCap`, and fb054 (BALANCE.md's "Density targets" section) raised
 * `aliveCap` 350->500 — a heavier worst-case tick is the intended, measured
 * effect of that change, not a regression, but it moves this ratio's own
 * baseline, and the old 6,000 ceiling no longer holds under contention (it
 * tripped at ratio=7,901 inside a full `npm run test:fast` run this session).
 * Re-measured the same way as the prior recording — three rounds of 5,
 * concurrent with other test files running (`act1`, `p6d-nine-classes`,
 * `p6b-swordsman`) — at the new `aliveCap` 500: contended medians 3,979 /
 * 4,637 / 5,118 (median-of-medians 4,637, individual samples 2,737-6,566),
 * plus the single heavier-contention sample of 7,901 observed inside the
 * full suite run above. Ceiling re-set to roughly 4x the moderate-contention
 * median-of-medians (4,637 x 4 ~= 18,548, rounded down), comfortably above
 * the heaviest contention sample seen (7,901) so ordinary contention stays
 * quiet while an actual multi-x regression in the worst-case tick's relative
 * cost still trips it.
 */
const RECORDED_CEILING = 18_000;

/** Two configurations differing in both calibration and tick sample size, not just one. */
const CONFIG_A = { calibIters: 20_000_000, tickSamples: 500, warmupTicks: 200 };
const CONFIG_B = { calibIters: 40_000_000, tickSamples: 900, warmupTicks: 200 };
const REPEATS = 5;
/** Relative-difference tolerance between the two configs' ratios (see session 9 log for the measured spread). */
const STABILITY_TOLERANCE = 0.4;

describe('q13 — host-normalized perf ratio (timing)', () => {
  it('is stable across two different (calibration, tick-sample) iteration counts', () => {
    const a = medianWorstCaseRatio(CONFIG_A.calibIters, CONFIG_A.tickSamples, CONFIG_A.warmupTicks, REPEATS);
    const b = medianWorstCaseRatio(CONFIG_B.calibIters, CONFIG_B.tickSamples, CONFIG_B.warmupTicks, REPEATS);
    const rel = Math.abs(a - b) / Math.max(a, b);
    expect(rel, `ratio A=${a.toFixed(0)} ratio B=${b.toFixed(0)} rel=${(rel * 100).toFixed(1)}%`).toBeLessThan(
      STABILITY_TOLERANCE,
    );
  });

  it('sits under the recorded ceiling', () => {
    const a = medianWorstCaseRatio(CONFIG_A.calibIters, CONFIG_A.tickSamples, CONFIG_A.warmupTicks, REPEATS);
    expect(a, `ratio=${a.toFixed(0)} ceiling=${RECORDED_CEILING}`).toBeLessThan(RECORDED_CEILING);
  });

});
