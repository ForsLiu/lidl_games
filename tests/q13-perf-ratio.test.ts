/**
 * q13 — host-normalized perf ratio probe (BACKLOG-QUALITY.md), for SPEC-FINAL
 * §14 G17: "Perf: sim budget per simulated minute (host-independent)".
 *
 * `tests/a10-performance.test.ts` asserts an absolute millisecond budget, and
 * this lane's own session-2 log caught it failing for a reason that had
 * nothing to do with the sim: five node processes competing for CPU in the
 * main checkout inflated a green run's timings by ~30-40% minutes later, on
 * the same commit. `tools/perf-ratio.ts` times a fixed, sim-independent unit
 * of CPU work (`calibrationWork`) in the same process as the worst-case tick
 * and reports their ratio, so both halves inflate together under host
 * contention instead of only the numerator moving.
 *
 * This suite does not re-assert the absolute ms budget A10 already owns — it
 * proves the *ratio itself* is a sound instrument: stable when the iteration
 * counts that produced it change (the A10 failure mode, reproduced here on
 * purpose and shown not to move the ratio), and actually sensitive to real
 * sim cost rather than measuring the calibration loop against itself
 * (anti-vacuity, the standing lesson from every prior lane session that
 * shipped a metric nothing could move).
 */
import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { wieldedAttacks } from '../src/sim/vswield';
import { measureRatioForWorld, worstCaseWorld, calibrationWork } from '../tools/perf-ratio';
import { cfg } from './helpers';

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
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
 * tolerate that contention rather than avoid it (this lane's Scope cannot
 * move it into `vitest.perf.config.ts`'s single-threaded run the way A10 is
 * isolated) — see `tools/perf-ratio.ts`'s `measureRatioForWorld` doc comment
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

describe('q13 — host-normalized perf ratio', () => {
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

  it('the worst-case world actually reaches the alive cap and full wielded attack set the ratio is measured against', () => {
    // If worstCaseWorld regressed to a small or empty world, the ceiling and
    // stability checks above would still pass trivially — they would just be
    // measuring nothing, the same trap the anti-vacuity test above exists to
    // catch from the other direction (a fixture check rather than a
    // measurement-mechanism check).
    //
    // Ported to SPEC-FINAL §6.1: `World.weapons` (the granted-weapon roster)
    // is gone; its successor is the wielded tower-attack set derived from the
    // live board (`wieldedAttacks`, src/sim/vswield.ts). worstCaseWorld builds
    // six tower types, of which five author an attack — palisade is a wall
    // and wields nothing — so "full weapon set" now means all five.
    const w = worstCaseWorld();
    expect(wieldedAttacks(w).length).toBe(5);
    expect(w.enemies.length).toBeGreaterThanOrEqual(w.content.spawns.aliveCap);
    expect(w.structures.length).toBeGreaterThan(0);
  });

  it('calibrationWork is deterministic for a fixed iteration count, so the unit itself is not a noise source', () => {
    expect(calibrationWork(500_000)).toBe(calibrationWork(500_000));
    expect(calibrationWork(500_000)).not.toBe(calibrationWork(500_001));
  });
});
