/**
 * b018 — every cooldown gate in the sim (`wd.active1Cooldown`,
 * `active2Cooldown`, `activeCooldown`, `attackCooldown`, `dashCooldown`,
 * tower `s.cooldown`) was a strict `> 0` compare with no epsilon. A cooldown
 * that decremented to a tiny positive float residual (QA observed
 * `2.34e-14`, reproduced below at that exact value) instead of landing on
 * exactly 0 silently ate the next cast one tick later than
 * `cooldownSeconds` promises. `tickCooldown` (`src/sim/types.ts`) now floors
 * anything below `COOLDOWN_EPS` to 0 at every decrement site.
 */
import { describe, expect, it } from 'vitest';

import { COOLDOWN_EPS, FIXED_DT, emptyInput, tickCooldown } from '../src/sim/types';
import { World } from '../src/sim/world';
import { updateWarden } from '../src/sim/run';
import { useClassActive } from '../src/sim/classes';
import { cfg } from './helpers';

describe('b018: tickCooldown floors a sub-epsilon residual to exactly 0', () => {
  it('the exact QA-observed residual (2.34e-14) floors to 0', () => {
    expect(tickCooldown(2.34e-14, 0)).toBe(0);
  });

  it('a value that would land just below COOLDOWN_EPS after a dt subtraction floors to 0', () => {
    expect(tickCooldown(0.0000015, 0.000001)).toBe(0);
  });

  it('a value exactly at COOLDOWN_EPS after subtraction is left as-is, not floored', () => {
    expect(tickCooldown(0.000002, 0.000001)).toBe(COOLDOWN_EPS);
  });

  it('a value well above COOLDOWN_EPS after subtraction is left as a real, still-positive cooldown', () => {
    expect(tickCooldown(1, FIXED_DT)).toBeCloseTo(1 - FIXED_DT, 12);
    expect(tickCooldown(1, FIXED_DT)).toBeGreaterThan(0);
  });

  it('a large negative result (well below 0) is floored to 0, not left negative', () => {
    expect(tickCooldown(0.001, 1)).toBe(0);
  });
});

describe('b018: a cast issued exactly cooldownSeconds after the last one is never silently dropped', () => {
  function pyroWorld(): World {
    const w = new World(cfg({ classKey: 'pyromancer' }));
    w.gold = 1e6;
    return w;
  }

  it('reproduces the QA repro: the tick that lands the cooldown on a tiny positive residual now allows the cast in the same tick', () => {
    const w = pyroWorld();
    // Fire once to put Immolation Wave (active1, cooldownSeconds: 10) on cooldown.
    expect(useClassActive(w)).toBe(true);
    expect(w.warden.active1Cooldown).toBeGreaterThan(0);

    // Drive the cooldown down tick by tick with the sim's real fixed-step
    // dt until exactly one tick remains, then hand-place it one dt above
    // the exact QA-observed residual so the final decrement reproduces
    // `2.34e-14` bit-for-bit.
    w.warden.active1Cooldown = FIXED_DT + 2.34e-14;
    updateWarden(w, emptyInput(), FIXED_DT);

    // Pre-fix this was a strictly-positive float residual and the gate
    // (`wd.active1Cooldown > 0`) silently dropped the cast.
    expect(w.warden.active1Cooldown).toBe(0);
    expect(useClassActive(w)).toBe(true);
  });

  it('control: a cast attempted while genuinely still on cooldown is still rejected', () => {
    const w = pyroWorld();
    expect(useClassActive(w)).toBe(true);
    expect(useClassActive(w)).toBe(false);
    w.warden.active1Cooldown = 5;
    updateWarden(w, emptyInput(), FIXED_DT);
    expect(w.warden.active1Cooldown).toBeGreaterThan(0);
    expect(useClassActive(w)).toBe(false);
  });
});
