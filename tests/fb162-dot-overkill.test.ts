/**
 * fb162 — a DoT kill books what landed, not what was banked.
 *
 * fb152's cadence banks a DoT stack's damage across up to `dotTickInterval`
 * (0.25 s) worth of frames before paying it in one `damageEnemy` call. That is
 * fine for the enemy's own hp (it is clamped at 0 by `killEnemy`/render), but
 * `damageEnemy` also feeds `damageByWeapon`/`damageByWeaponVs`/`damageByType`/
 * `damageTotal` and the Corpse Core's `corpseStore` off the *raw* banked
 * amount, so a kill on a near-dead enemy over-reports every one of those by
 * however much of the bank was overkill — up to a whole tick interval's worth,
 * where the old per-frame code (`dt = 1/60`) could only over-report by a
 * single frame. Q91 already draws the "landed, not raw" line for lifesteal on
 * this exact path; this pins the same rule extended to the other ledgers, for
 * both a DoT's direct hit on its carrier and Burning's neighbour splash.
 *
 * A *non-DoT* overkill is deliberately left alone — `tests/p-core-d-corpse
 * .test.ts` pins that a direct hit's full swing is credited even past the
 * kill, and this item does not touch that case (there is no engine-controlled
 * bank to correct there, just whatever the attacker happened to swing for).
 */

import { describe, expect, it } from 'vitest';

import { applyDot, damageEnemy, spawnEnemy, updateEnemies } from '../src/sim/enemies';
import { computeCoreState, upgradeCore } from '../src/sim/cores';
import { loadContent } from '../src/sim/content';
import { World } from '../src/sim/world';
import type { Enemy } from '../src/sim/types';
import { cfg } from './helpers';

const DT = 1 / 60;
const content = loadContent();
const INTERVAL = content.damageTypes.dotTickInterval;

function world(): World {
  const w = new World(cfg(), content);
  w.gold = 100000;
  return w;
}

/** Rooted so a totals/positioning assertion stays put. */
function dummy(w: World, x = 10, y = 10): Enemy {
  const e = spawnEnemy(w, 'husk', x, y)!;
  e.speed = 0;
  w.rebuildBuckets();
  return e;
}

function tickFor(w: World, seconds: number): void {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    w.rebuildBuckets();
    updateEnemies(w, DT);
  }
}

describe('fb162 — DoT kill overkill is booked at what landed, not what was banked', () => {
  it('a 1-hp carrier killed by a banked tick books only its 1 hp of damage', () => {
    const w = world();
    const e = dummy(w);
    e.hp = 1;
    e.maxHp = 1;
    const dps = 10;
    applyDot(w, e, 'bleeding', dps, 4);
    tickFor(w, INTERVAL + 0.1); // one full interval flushes and overkills a 1-hp husk
    expect(e.dead).toBe(true);
    // The bank the old code would have booked: dps * (an interval's worth of frames).
    const banked = dps * INTERVAL;
    expect(banked).toBeGreaterThan(1); // otherwise this case does not exercise overkill at all
    expect(w.damageByWeapon['bleeding']).toBeCloseTo(1, 9);
    expect(w.damageTotal).toBeCloseTo(1, 9);
    expect(w.damageByType['bleeding']).toBeCloseTo(1, 9);
    // Never the raw bank.
    expect(w.damageTotal).not.toBeCloseTo(banked, 6);
  });

  it('a 1-hp splash neighbour is booked the same way', () => {
    const w = world();
    const carrier = dummy(w, 10, 10);
    const neighbour = dummy(w, 10.4, 10);
    neighbour.hp = 1;
    neighbour.maxHp = 1;
    const burning = content.damageTypes.types.find((t) => t.key === 'burning')!;
    const dps = 50;
    applyDot(w, carrier, 'burning', dps, burning.duration);
    tickFor(w, INTERVAL + 0.1);
    expect(neighbour.dead).toBe(true);
    expect(carrier.dead).toBe(false); // its own tick must not also overkill it here
    const banked = dps * INTERVAL;
    expect(banked).toBeGreaterThan(1); // otherwise this case does not exercise overkill at all
    // The carrier's own direct tick books its full (non-overkilling) banked
    // amount, plus the neighbour's landed 1 hp from the splash — never the
    // neighbour's own banked (overkilling) share.
    expect(w.damageByWeapon['burning']).toBeCloseTo(banked + 1, 6);
    expect(w.damageByWeapon['burning']).not.toBeCloseTo(banked * 2, 6);
  });

  it('the Corpse Core store does not inflate off an overkilling DoT kill', () => {
    const w = new World(cfg({ core: 'corpse' }), content);
    w.gold = 100000;
    upgradeCore(w); // step 1, matching p-core-d's own ratio reads
    const ratio = computeCoreState(content, 'corpse', 1).corpseStoreRatio;
    const e = dummy(w);
    e.hp = 1;
    e.maxHp = 1;
    const dps = 20;
    applyDot(w, e, 'bleeding', dps, 4);
    tickFor(w, INTERVAL + 0.1);
    expect(e.dead).toBe(true);
    expect(w.corpseStore).toBeCloseTo(1 * ratio, 9);
    expect(w.corpseStore).not.toBeCloseTo(dps * INTERVAL * ratio, 6);
  });

  it('a non-overkilling DoT tick books its exact damage unchanged (no regression on the common case)', () => {
    const w = world();
    const e = dummy(w);
    e.hp = 1e6;
    e.maxHp = 1e6;
    const dps = 10;
    applyDot(w, e, 'bleeding', dps, 4);
    tickFor(w, 4.5);
    expect(w.damageTotal).toBeCloseTo(dps * 4, 6);
  });

  it('a non-DoT overkill still books the full raw swing, unchanged (Q91/p-core-d precedent)', () => {
    const w = world();
    const e = dummy(w);
    e.hp = 1;
    e.maxHp = 1;
    const swing = 1000;
    damageEnemy(w, e, swing, 'test_tower');
    expect(e.dead).toBe(true);
    expect(w.damageTotal).toBeCloseTo(swing, 9);
  });

  it('a designed kit-power execute (dot:true, no bankedTick) still books its full scaled amount past hp (code review finding)', () => {
    // Time Lord's Time Mark execute (classes.ts) spends exactly `e.hp` through
    // `damageEnemy(..., 'class_active', { dot: true, ... })` with no
    // `preScaled`, so `dotVaryingMul`'s `kitPowerMul` scales it past the
    // target's remaining hp by design — the ledger is meant to credit the
    // full kit-power-scaled amount, not the sliver that could land on a
    // corpse. `bankedTick` must stay off this path, or this silently
    // undercredits the Time Lord's own kit-share metrics (p12a-kit-power.test.ts).
    const w = world();
    w.wavesCleared = 5; // kitPowerMul(w) = 1.6, so e.hp * that overshoots hpBeforeHit
    const e = dummy(w);
    e.hp = 10;
    e.maxHp = 10;
    const mul = 1 + 0.12 * w.wavesCleared;
    expect(mul).toBeGreaterThan(1);
    damageEnemy(w, e, e.hp, 'class_active', { pure: true, dot: true, type: 'normal', noLifesteal: true });
    expect(e.dead).toBe(true);
    expect(w.damageByWeapon['class_active']).toBeCloseTo(10 * mul, 6);
    expect(w.damageByWeapon['class_active']).not.toBeCloseTo(10, 6);
  });
});
