/**
 * fb162 — a DoT kill books its whole banked lump into `damageByWeapon`/
 * `damageByWeaponVs`/`damageByType`/`damageTotal` and the Corpse Core's
 * `corpseStore`, while only the target's remaining hp actually lands.
 *
 * `damageEnemy` (`src/sim/enemies.ts`) is the single choke point every damage
 * source (direct hits, DoT ticks, Burning's neighbour splash) books through.
 * Q91's precedent — lifesteal accrues from `min(dmg, hpBeforeHit)`, not the
 * raw hit — already covers the leech accumulator; this item extends the same
 * clamp to the rest of the ledgers at that choke point. fb152's
 * accrue-then-flush cadence made the gap much worse (a whole
 * `dotTickInterval`'s bank can land on a carrier with one hp left) but the
 * bug predates it: any single hit larger than the target's remaining hp was
 * always over-booked.
 */

import { describe, expect, it } from 'vitest';

import damageTypesJson from '../data/damagetypes.json';
import { applyDot, damageEnemy, spawnEnemy, updateEnemies } from '../src/sim/enemies';
import type { Enemy } from '../src/sim/types';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const DT = 1 / 60;

function world(): World {
  return new World(cfg());
}

function dummy(w: World, x = 10, y = 10): Enemy {
  const e = spawnEnemy(w, 'husk', x, y)!;
  e.speed = 0;
  w.rebuildBuckets();
  return e;
}

function tick(w: World, seconds: number): void {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    w.rebuildBuckets();
    updateEnemies(w, DT);
  }
}

describe('fb162: damageEnemy books min(dmg, remaining hp), not the raw amount', () => {
  it('a direct hit far larger than the target\'s hp books only the hp that landed', () => {
    const w = world();
    const e = dummy(w);
    e.hp = 1;
    e.maxHp = 1;
    damageEnemy(w, e, 1000, 'test-source', { pure: true, dot: true, type: 'normal' });
    expect(e.dead).toBe(true);
    expect(w.damageByWeapon['test-source']).toBeCloseTo(1, 9);
    expect(w.damageByType['normal']).toBeCloseTo(1, 9);
    expect(w.damageTotal).toBeCloseTo(1, 9);
  });

  it('an exact-kill hit still books the full amount, no off-by-one', () => {
    const w = world();
    const e = dummy(w);
    e.hp = 50;
    e.maxHp = 50;
    damageEnemy(w, e, 50, 'test-source');
    expect(e.dead).toBe(true);
    expect(w.damageByWeapon['test-source']).toBeCloseTo(50, 9);
  });

  it('a DoT kill on a 1-hp carrier books what landed, not the whole banked interval', () => {
    // fb152's accrue-then-flush cadence banks a whole dotTickInterval before
    // paying, so a large dps on a fragile carrier can bank many times its hp.
    const w = world();
    const e = dummy(w);
    e.hp = 1;
    e.maxHp = 1;
    applyDot(w, e, 'poison', 100, 1, 'poison-source');
    tick(w, 1.5);
    expect(e.dead).toBe(true);
    expect(w.damageByType['poison']).toBeCloseTo(1, 6);
    expect(w.damageByWeapon['poison-source']).toBeCloseTo(1, 6);
    expect(w.damageTotal).toBeCloseTo(1, 6);
  });

  it('a DoT kill splash neighbour books only its own remaining hp, not the carrier\'s bank', () => {
    const burning = damageTypesJson.types.find((t) => t.key === 'burning') as { duration: number };
    const w = world();
    const carrier = dummy(w, 10, 10);
    const neighbour = dummy(w, 10.4, 10);
    neighbour.hp = 1;
    neighbour.maxHp = 1;
    applyDot(w, carrier, 'burning', 1000, burning.duration, 'burn-source');
    tick(w, burning.duration + 0.5);
    expect(neighbour.dead).toBe(true);
    // The carrier itself may also have died and split its own damage into the
    // same buckets, so assert the neighbour's death didn't over-book: total
    // booked damage cannot exceed both enemies' starting hp.
    expect(w.damageTotal).toBeLessThanOrEqual(carrier.maxHp + 1 + 1e-6);
  });

  it('the Corpse Core store banks a share of what landed, not what was dealt', () => {
    const w = world();
    w.core.corpseStoreRatio = 1; // 100%, so the assertion reads directly
    const e = dummy(w);
    e.hp = 1;
    e.maxHp = 1;
    damageEnemy(w, e, 1000, 'test-source');
    expect(w.corpseStore).toBeCloseTo(1, 9);
  });
});
