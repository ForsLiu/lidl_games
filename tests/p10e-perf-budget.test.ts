/**
 * Gate G17's first clause (SPEC-FINAL §14, re-baselined per §16 P10): "Perf:
 * sim budget per simulated minute (host-independent) ⚖".
 *
 * Its other two clauses were already solidly live-tested before this item
 * (`tools/gate-audit.ts`'s G17 note): `tests/a10-performance.test.ts`'s
 * worst-case-tick benchmark for "350 enemies + all weapons ≥60fps", and
 * `tests/q12-soak.test.ts` for the 50-run soak. Only the per-simulated-minute
 * budget itself was undecided — `tests/q13-perf-ratio.test.ts` proved the
 * *mechanism* (a host-independent ratio against a fixed calibration unit,
 * stable across iteration counts) but only measured a single static
 * worst-case tick, not a real run.
 *
 * This closes the remainder by running the same `Run`/`makePolicy` harness
 * `tests/p10d-run-length.test.ts` uses for G1 (real `hybrid`-bot play, the
 * default 6-cycle §1.1 shape) end to end and interleaving `calibrationWork`
 * samples throughout, so the ratio amortizes over a whole run — build-phase
 * idle ticks, TD waves, VS combat, the boss fight — instead of one frame.
 *
 * This also retires the wall-clock test it replaces
 * (`tests/a10-performance.test.ts`'s "runs a full headless game in under 5
 * seconds"): that test drove `--cycles 1`, SPEC A10's original single-pass
 * shape, which P3 superseded with the real 18-TD/6-VS/6-cycle run this file
 * measures instead, and pinned an exact `wavesCleared` count that the P10
 * balance retunes (p10c/p10d) have since moved past — confirmed failing on
 * this session's HEAD before this item touched it (18 cleared, pinned at 16),
 * for exactly the reason CLAUDE.md's measurement rules warn about: a stale
 * assertion outliving the shape it measured.
 *
 * Budget: three seeds' `ratioPerMinute` (calibration units of CPU work per
 * simulated minute) measured this session, `hybrid` policy, config
 * (calibChunk 40000, sampleEvery 50): 7.90M / 8.79M / 9.67M — median 8.79M.
 * A second config (calibChunk 80000, sampleEvery 100) on the same seeds
 * reproduced within ~1% of each value, confirming the ratio (not just the
 * single-tick one q13 already proved) holds steady across measurement
 * granularity. Ceiling set at ~4x the median, the same headroom factor
 * `tools/perf-ratio.ts`'s q13 ceiling uses and for the same reason: ordinary
 * contention (this repo's documented flake source under parallel `npm test`
 * background load) should stay quiet while an actual multi-x regression in
 * per-minute sim cost still trips it.
 */
import { describe, expect, it } from 'vitest';

import { measureSimMinuteRatio } from '../tools/perf-ratio';
import '../src/bots';

const MAX_TICKS = 60 * 60 * 45; // 45 simulated minutes, same cap p10d's G1 harness uses
const SEEDS = [1, 2, 3];

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** ~4x the measured median (see file header) — ordinary host contention stays under it. */
const CEILING_PER_MINUTE = 35_000_000;

describe('G17 sim budget per simulated minute (host-independent)', () => {
  const runs = SEEDS.map((seed) => measureSimMinuteRatio(seed, 'hybrid', 40_000, 50, MAX_TICKS));

  it('plays a real run to a real outcome for every seed, not a truncated stub', () => {
    for (const r of runs) {
      expect(r.ticks, `seed ${r.seed}`).toBeGreaterThan(0);
      expect(r.simMinutes, `seed ${r.seed}`).toBeGreaterThan(1);
      expect(['victory', 'defeat_warden', 'defeat_core'], `seed ${r.seed} outcome ${r.outcome}`).toContain(r.outcome);
    }
  });

  it('sits under the host-independent per-simulated-minute budget', () => {
    const m = median(runs.map((r) => r.ratioPerMinute));
    const detail = `median=${m.toFixed(0)} ceiling=${CEILING_PER_MINUTE} (${runs
      .map((r) => `seed ${r.seed}: ${r.ratioPerMinute.toFixed(0)}`)
      .join(', ')})`;
    expect(m, detail).toBeLessThan(CEILING_PER_MINUTE);
  });

  it('is stable across a different (calibChunk, sampleEvery) measurement granularity', () => {
    const a = measureSimMinuteRatio(1, 'hybrid', 40_000, 50, MAX_TICKS).ratioPerMinute;
    const b = measureSimMinuteRatio(1, 'hybrid', 80_000, 100, MAX_TICKS).ratioPerMinute;
    const rel = Math.abs(a - b) / Math.max(a, b);
    expect(rel, `a=${a.toFixed(0)} b=${b.toFixed(0)} rel=${(rel * 100).toFixed(1)}%`).toBeLessThan(0.25);
  });

  it('is actually sensitive to sim cost — a run capped inside Act I scores lower than the same policy played to a real outcome', () => {
    // Anti-vacuity, the same shape q13 uses: if the ratio were dominated by
    // fixed per-tick overhead rather than real per-minute sim cost, a run
    // capped short would score close to a full run instead of below it.
    //
    // b041: an earlier version of this check compared `no-move` (never
    // moves/kites in Act II) against `hybrid`, capping `no-move` to 5 sim
    // minutes — "well inside Act I" by its own comment — so the pass was
    // actually driven by the cheap Act I phase mix, not the claimed policy
    // difference. The seemingly obvious fix — uncap `no-move` to the real
    // `MAX_TICKS` and let it reach Act II — turned out to rest on a false
    // premise: code-reviewer flagged the resulting `no-move < hybrid`
    // assertion as order-dependent (whichever policy's code paths the
    // process JIT-warmed first scored artificially cheaper), and measuring
    // it with matched warmup confirmed why — `no-move`'s full-run
    // `ratioPerMinute` lands within ~2-4% of `hybrid`'s in either direction
    // (96-102% across four warmup depths, seed 1, both reaching `victory` at
    // comparable sim-minutes). Act II movement/kiting alone is not a
    // reliable cost differentiator, so asserting a direction here would just
    // trade one order-dependent false pass for another.
    //
    // The comparison that *is* real and robust — same policy, only the phase
    // mix changes, so there is no cross-policy JIT-warmup confound — is this
    // one: `hybrid` capped to 5 sim minutes (Act I only) against `hybrid`
    // played to a real outcome (Act I + Act II + the boss fight).
    const shortHybrid = measureSimMinuteRatio(1, 'hybrid', 40_000, 50, 60 * 60 * 5);
    const real = runs.find((r) => r.seed === 1)!;
    expect(
      shortHybrid.ratioPerMinute,
      `short=${shortHybrid.ratioPerMinute.toFixed(0)} real=${real.ratioPerMinute.toFixed(0)}`,
    ).toBeLessThan(real.ratioPerMinute);
  });
});
