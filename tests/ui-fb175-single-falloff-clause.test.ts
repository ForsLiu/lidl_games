/**
 * fb175 (qa-playtester finding during fb149 verification): `tower-info.ts`'s
 * `KIND_TEXT.single` blurb describes the same `lineHit` drop-off the class
 * Active sentences already name (`LINE_FALLOFF_CLAUSE`, info-format.ts) via
 * its "carrying on through up to N more enemies behind it" phrase, without
 * ever saying the carried-through hits are reduced. Measured (arrow_spire at
 * tier 5, six husks in a row, one updateTowers+updateProjectiles tick):
 * primary 254.1, carried-through body 208.362 — a real 0.82 falloff, not
 * full damage. Ballista (`pierce` kind) is deliberately NOT touched: it is a
 * real `Projectile` (`spawnProjectile`/`pierceLeft`, no scale term) and
 * measures full damage to every pierced target, so appending the clause
 * there would be the wrong fact.
 */
import { describe, expect, it } from 'vitest';

import { World } from '../src/sim/world';
import { updateProjectiles } from '../src/sim/combat';
import { updateTowers } from '../src/sim/towers';
import { loadContent } from '../src/sim/content';
import { spawnEnemy } from '../src/sim/enemies';
import { buildTower, upgradeTower } from '../src/sim/towers';
import { maxLevel } from '../src/sim/upgrades';
import { towerInfo } from '../src/ui/tower-info';
import { LINE_FALLOFF_CLAUSE } from '../src/ui/info-format';
import { cfg } from './helpers';

const content = loadContent();
const FIXED_DT = 1 / 60;

function world(): World {
  return new World(cfg());
}

function freeTileNear(w: World): { tx: number; ty: number } {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const tx = Math.floor(w.warden.x) + dx;
      const ty = Math.floor(w.warden.y) + dy;
      if (w.grid.passable(tx, ty) && !w.structureAt(tx, ty)) return { tx, ty };
    }
  }
  throw new Error('no free tile near the Warden');
}

describe('fb175: the single blurb names its own falloff, IFF it actually has one', () => {
  it('an arrow_spire at tier 1 (pierce 0) says nothing about falloff', () => {
    const w = world();
    const def = content.towerByKey.get('arrow_spire')!;
    const { tx, ty } = freeTileNear(w);
    w.gold = 9999;
    expect(buildTower(w, def.id, tx, ty).ok).toBe(true);
    const info = towerInfo(w, def, w.structureAt(tx, ty)!);
    expect(info.attackText).not.toContain(LINE_FALLOFF_CLAUSE.trim());
  });

  it('an arrow_spire at max tier (pierce > 0) appends LINE_FALLOFF_CLAUSE, and the drop-off is real', () => {
    const w = world();
    const def = content.towerByKey.get('arrow_spire')!;
    const { tx, ty } = freeTileNear(w);
    w.gold = 9999;
    expect(buildTower(w, def.id, tx, ty).ok).toBe(true);
    while (w.structureAt(tx, ty)!.tier < maxLevel(def)) {
      w.gold = 9999;
      expect(upgradeTower(w, tx, ty)).toBe(true);
    }
    const s = w.structureAt(tx, ty)!;
    expect(s.tier).toBe(maxLevel(def));

    const info = towerInfo(w, def, s);
    expect(info.attackText).toContain(LINE_FALLOFF_CLAUSE.trim());

    // The mechanism leg: six husks in a line down the tower's fire path
    // (same gap/geometry convention `tests/tower-info.test.ts`'s own
    // measurement test uses), one updateTowers + updateProjectiles tick —
    // same shape the item's own filed measurement used. `targetFirst` picks
    // whichever is furthest along the path, not necessarily spawn order, so
    // the struck pair is identified by which enemies actually took damage
    // rather than assumed by array index.
    const gap = 2;
    const line = [];
    for (let i = 0; i < 6; i++) line.push(spawnEnemy(w, 'husk', tx + 0.5, ty + 0.5 - gap - i * 0.3)!);
    for (const e of line) e.speed = 0;
    w.rebuildBuckets();
    updateTowers(w, FIXED_DT);
    updateProjectiles(w, FIXED_DT);

    const struck = line
      .map((e) => e.maxHp - e.hp)
      .filter((d) => d > 0)
      .sort((a, b) => b - a);
    // pierce: 1 at max tier (arrow_spire's only milestone) -> hits = 1 + 1.
    expect(struck).toHaveLength(2);
    const [primaryDamage, carriedDamage] = struck;
    expect(carriedDamage).toBeLessThan(primaryDamage);
  });

  it('a Ballista (pierce kind) never gets the clause — it hits every pierced target for full damage', () => {
    const w = world();
    const def = content.towerByKey.get('ballista')!;
    const { tx, ty } = freeTileNear(w);
    w.gold = 9999;
    expect(buildTower(w, def.id, tx, ty).ok).toBe(true);
    while (w.structureAt(tx, ty)!.tier < maxLevel(def)) {
      w.gold = 9999;
      expect(upgradeTower(w, tx, ty)).toBe(true);
    }
    const s = w.structureAt(tx, ty)!;
    const info = towerInfo(w, def, s);
    expect(info.attackText).not.toContain(LINE_FALLOFF_CLAUSE.trim());
    expect(info.attackText).toContain('full damage each');
  });
});
