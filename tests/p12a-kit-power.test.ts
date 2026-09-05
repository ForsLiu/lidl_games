/**
 * BACKLOG p12a (BALANCE DIRECTION v2 §A): a run-long `kitPower` multiplier on
 * all class-kit damage (`class_basic`/`class_active`/`class_active2`/
 * `class_passive`/`class_summon`), `1 + 0.12 * wavesCleared`, applied at the
 * `damageEnemy` choke point every kit source already funnels through. Tower
 * damage (a `tower_*`/other source) must stay untouched — it has its own
 * economy and its own `towerDamageMul`.
 */

import { describe, expect, it } from 'vitest';

import { damageEnemy, kitPowerMul, spawnEnemy } from '../src/sim/enemies';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

function world(): World {
  const w = new World(cfg());
  w.warden.hp = w.derived.maxHp;
  return w;
}

function husk(w: World): ReturnType<typeof spawnEnemy> {
  const e = spawnEnemy(w, 'husk', 10, 10)!;
  e.hp = 1e6;
  e.maxHp = 1e6;
  e.armor = 0;
  return e;
}

describe('p12a — kitPowerMul', () => {
  it('is exactly 1 at wave 0 (fresh run, no growth yet)', () => {
    const w = world();
    expect(w.wavesCleared).toBe(0);
    expect(kitPowerMul(w)).toBeCloseTo(1, 6);
  });

  it('grows 0.12 per TD wave cleared, ~x3.2 by wave 18', () => {
    const w = world();
    w.wavesCleared = 12;
    expect(kitPowerMul(w)).toBeCloseTo(2.44, 6);
    w.wavesCleared = 18;
    expect(kitPowerMul(w)).toBeCloseTo(3.16, 6);
  });

  it('scales every class_* damageEnemy source, monotonically with wavesCleared', () => {
    const w = world();
    const e1 = husk(w);
    const atWave0 = damageEnemy(w, e1, 100, 'class_basic');
    expect(atWave0).toBeCloseTo(100, 6);

    w.wavesCleared = 18;
    const e2 = husk(w);
    const atWave18 = damageEnemy(w, e2, 100, 'class_basic');
    expect(atWave18).toBeCloseTo(100 * kitPowerMul(w), 6);
    expect(atWave18).toBeGreaterThan(atWave0);

    // Every one of the five class sources gets the same treatment.
    for (const source of ['class_active', 'class_active2', 'class_passive', 'class_summon']) {
      const e = husk(w);
      expect(damageEnemy(w, e, 100, source)).toBeCloseTo(100 * kitPowerMul(w), 6);
    }
  });

  it('never touches non-class (tower) damage sources', () => {
    const w = world();
    w.wavesCleared = 18;
    const e = husk(w);
    expect(damageEnemy(w, e, 100, 'ballista')).toBeCloseTo(100, 6);
  });

  it('applies to DoT ticks too, since a stack keeps its applying source', () => {
    const w = world();
    w.wavesCleared = 18;
    const e = husk(w);
    // dot:true skips the armor multiplier but still routes through the same
    // choke point, so a class-kit-applied DoT tick should scale too.
    expect(damageEnemy(w, e, 100, 'class_active', { dot: true })).toBeCloseTo(100 * kitPowerMul(w), 6);
  });
});
