/**
 * p5d — QA found on p5b: `fireTower`'s `pierce` (Ballista) and `lob` (Mortar)
 * cases fire through `spawnProjectile` and never credit `Structure.damageDealt`
 * when the shot actually lands, unlike every other attack kind (`single`,
 * `cone`, `aura`, `chain`, `poison`), which credit it inline via
 * `lineHit`/`coneHit`/`dealHit`/`chainHit`/`applyAoE`. So both towers' stats
 * panels always read 0 damage dealt regardless of real output. CLAUDE.md rule
 * 3: a failing regression test lands before the fix.
 */

import { describe, expect, it } from 'vitest';

import { updateProjectiles } from '../src/sim/combat';
import { loadContent } from '../src/sim/content';
import { spawnEnemy } from '../src/sim/enemies';
import { buildTower, updateTowers } from '../src/sim/towers';
import type { Enemy, Structure } from '../src/sim/types';
import { updateWieldedAttacks } from '../src/sim/vswield';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const DT = 1 / 60;
const content = loadContent();

/** A free, buildable tile that will not seal the path. */
function freeTile(w: World): { tx: number; ty: number } {
  for (let ty = 4; ty < 20; ty++) {
    for (let tx = 4; tx < 20; tx++) {
      if (w.grid.buildable(tx, ty) && !w.grid.wouldBlockPath([[tx, ty]])) return { tx, ty };
    }
  }
  throw new Error('no buildable tile');
}

function place(key: string) {
  const w = new World(cfg(), content);
  const { tx, ty } = freeTile(w);
  w.warden.x = tx + 0.5;
  w.warden.y = ty + 0.5;
  w.gold = 1e6;
  expect(buildTower(w, content.towerByKey.get(key)!.id, tx, ty).ok, key).toBe(true);
  const s = w.structureAt(tx, ty)!;
  return { w, s, x: tx + 0.5, y: ty + 0.5 };
}

/** A rooted husk with enough HP to outlive anything this file fires at it. */
function dummy(w: World, x: number, y: number): Enemy {
  const e = spawnEnemy(w, 'husk', x, y)!;
  e.hp = 1e9;
  e.maxHp = 1e9;
  e.armor = 0;
  e.speed = 0;
  w.rebuildBuckets();
  return e;
}

/** Ticks the tower and its projectiles until a real hit lands, or gives up. */
function fireUntilCredited(w: World, s: Structure, ticks = 400): void {
  for (let i = 0; i < ticks && s.damageDealt === 0; i++) {
    w.rebuildBuckets();
    updateTowers(w, DT);
    updateProjectiles(w, DT);
  }
}

describe('p5d — pierce/lob-kind towers credit Structure.damageDealt', () => {
  it('Ballista (pierce) credits damageDealt once its bolt actually lands', () => {
    const { w, s, x, y } = place('ballista');
    const e = dummy(w, x + 1.5, y);
    const hpBefore = e.hp;
    expect(s.damageDealt).toBe(0);
    fireUntilCredited(w, s);
    expect(e.hp, 'the shot really did land on the enemy').toBeLessThan(hpBefore);
    expect(s.damageDealt).toBeGreaterThan(0);
  });

  it('Mortar (lob) credits damageDealt once its shell actually detonates', () => {
    const { w, s, x, y } = place('mortar');
    const e = dummy(w, x + 6, y);
    const hpBefore = e.hp;
    expect(s.damageDealt).toBe(0);
    fireUntilCredited(w, s);
    expect(e.hp, 'the shell really did detonate on the enemy').toBeLessThan(hpBefore);
    expect(s.damageDealt).toBeGreaterThan(0);
  });

  it('Ballista (pierce) sums damageDealt across every enemy one bolt hits, not just the first', () => {
    const { w, s, x, y } = place('ballista');
    // Colinear along the bolt's path, well inside its range, base pierce 3
    // (data/towers.json) so one bolt hits all three in a single flight.
    const targets = [dummy(w, x + 1.5, y), dummy(w, x + 2.5, y), dummy(w, x + 3.5, y)];
    const hpBefore = targets.map((e) => e.hp);
    fireUntilCredited(w, s);
    const hpLost = targets.reduce((sum, e, i) => sum + (hpBefore[i] - e.hp), 0);
    expect(hpLost, 'the bolt really did land on all three').toBeGreaterThan(0);
    expect(s.damageDealt).toBeCloseTo(hpLost, 6);
  });

  it('a VS-wielded pierce shot (no owning Structure) does not throw and credits nothing', () => {
    const w = new World(cfg(), content);
    const { tx, ty } = freeTile(w);
    w.warden.x = tx + 0.5;
    w.warden.y = ty + 0.5;
    w.gold = 1e6;
    expect(buildTower(w, content.towerByKey.get('ballista')!.id, tx, ty).ok).toBe(true);
    const s = w.structureAt(tx, ty)!;
    w.phase = 'act2';
    const e = dummy(w, w.warden.x + 1.5, w.warden.y);
    const hpBefore = e.hp;

    expect(() => {
      for (let i = 0; i < 400 && e.hp === hpBefore; i++) {
        w.rebuildBuckets();
        updateWieldedAttacks(w, DT);
        updateProjectiles(w, DT);
      }
    }).not.toThrow();

    expect(e.hp, 'the wielded bolt still landed on the enemy').toBeLessThan(hpBefore);
    expect(s.damageDealt, "the inert tower isn't the one wielding the attack").toBe(0);
  });
});
