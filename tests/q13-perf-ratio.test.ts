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
 * purpose and shown not to move the ratio), under its recorded ceiling, and
 * measured against a fixture that really is the worst case.
 *
 * The instrument's other half — anti-vacuity, that the ratio is *sensitive*
 * to real sim cost rather than measuring the calibration loop against itself
 * — lives in `tests/q13-perf-sensitivity.test.ts`, split out at fb-CI-q13
 * (2026-09-06) because it compares two timing measurements against each other
 * and so needs `vitest.perf.config.ts`'s single-threaded run; that file's
 * header records the CI reading (3.58x against a 4x floor) that forced the
 * split. The stability and ceiling cases followed it on 2026-09-23 (CI run
 * 800 read 43.1% against the 40% stability bound under the runner's two
 * workers) into `tests/q13-perf-stability.test.ts`, same bounds, same config.
 * What is left here measures no time at all, so this file stays in the fast
 * tier.
 */
import { describe, expect, it } from 'vitest';
import { wieldedAttacks } from '../src/sim/vswield';
import { calibrationWork, worstCaseWorld } from '../tools/perf-ratio';

describe('q13 — host-normalized perf ratio', () => {
  it('the worst-case world actually reaches the alive cap and full wielded attack set the ratio is measured against', () => {
    // If worstCaseWorld regressed to a small or empty world, the ceiling and
    // stability checks (tests/q13-perf-stability.test.ts) would still pass trivially — they would just be
    // measuring nothing, the same trap `tests/q13-perf-sensitivity.test.ts`
    // exists to catch from the other direction (a fixture check rather than a
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
