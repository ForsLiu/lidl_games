/**
 * q26 — call-order proof for `measureRatioForWorld`'s interleaved-measurement
 * design (BACKLOG-QUALITY.md).
 *
 * `tests/q13-perf-ratio.test.ts` proves the *outcome* of interleaving is
 * contention-tolerant (a stable ratio across two iteration-count configs,
 * under a recorded ceiling). It never proves the *mechanism* — that
 * `measureRatioForWorld` actually alternates one calibration chunk with one
 * tick, `tickSamples` times, rather than running all calibration work first
 * and all ticks second. Session 9's own log named this gap explicitly, and
 * q20 could not close it with a mutation-probe entry because the failure mode
 * (sequential vs. interleaved) only shows up under real external CPU
 * contention — flaky by nature, the wrong shape for a mutation-smoke suite
 * (see `tools/mutation-probe.ts`'s doc comment above `MUTATIONS`).
 *
 * This suite instruments the real production code path instead: q26 added an
 * optional `onEvent` callback to `measureRatioForWorld` that fires right after
 * each calibration chunk and each tick, from inside the same loop the ratio
 * itself is computed in. Recording the sequence `onEvent` actually observes is
 * a direct read of the call order, independent of wall-clock timing — a
 * revert to two separate loops (all calib, then all tick) changes what this
 * test sees regardless of host contention.
 */
import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { measureRatioForWorld, type RatioTraceEvent } from '../tools/perf-ratio';
import { cfg } from './helpers';

describe('q26 — perf-ratio measures calibration and tick work interleaved', () => {
  it('calls calibrationWork and run.step alternately, one calibration chunk per tick', () => {
    const TICK_SAMPLES = 20;
    const trace: RatioTraceEvent[] = [];

    measureRatioForWorld(new World(cfg({ seed: 1 })), 50_000, TICK_SAMPLES, 5, (event) => trace.push(event));

    expect(trace).toHaveLength(TICK_SAMPLES * 2);
    for (let i = 0; i < TICK_SAMPLES; i++) {
      expect(trace[2 * i], `sample ${i}, first half`).toBe('calib');
      expect(trace[2 * i + 1], `sample ${i}, second half`).toBe('tick');
    }
  });

  it('is not the sequential two-block shape (all calibration, then all ticks)', () => {
    // The alternating check above already pins the exact interleaved shape.
    // This asserts the negative directly, in the terms session 9's log used
    // to describe the regression, so a reader does not have to infer it from
    // the positive check alone.
    const TICK_SAMPLES = 20;
    const trace: RatioTraceEvent[] = [];

    measureRatioForWorld(new World(cfg({ seed: 1 })), 50_000, TICK_SAMPLES, 5, (event) => trace.push(event));

    const sequentialTwoBlocks: RatioTraceEvent[] = [
      ...Array(TICK_SAMPLES).fill('calib' as const),
      ...Array(TICK_SAMPLES).fill('tick' as const),
    ];
    expect(trace).not.toEqual(sequentialTwoBlocks);
  });

  it('passes the sample index through unchanged, so a caller can correlate calib/tick pairs', () => {
    const TICK_SAMPLES = 8;
    const indices: Array<[RatioTraceEvent, number]> = [];

    measureRatioForWorld(new World(cfg({ seed: 1 })), 20_000, TICK_SAMPLES, 5, (event, sampleIndex) =>
      indices.push([event, sampleIndex]),
    );

    for (let i = 0; i < TICK_SAMPLES; i++) {
      expect(indices[2 * i]).toEqual(['calib', i]);
      expect(indices[2 * i + 1]).toEqual(['tick', i]);
    }
  });

  it('onEvent is optional — omitting it does not change the returned ratio shape', () => {
    const r = measureRatioForWorld(new World(cfg({ seed: 1 })), 20_000, 8, 5);
    expect(r.tickSamples).toBe(8);
    expect(Number.isFinite(r.ratio)).toBe(true);
  });
});
