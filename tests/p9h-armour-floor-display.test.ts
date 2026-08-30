/**
 * BACKLOG p9h: the enemy/warden panel's armour row printed the raw,
 * unfloored armour value — a horde-density Brazier board could read
 * "-294 (100% more taken)", honest about the percentage (already computed
 * from the floored value) but misleading about the number, since the enemy
 * actually defends at the -100 floor, not -294.
 */

import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { World } from '../src/sim/world';
import { spawnEnemy, shredArmor } from '../src/sim/enemies';
import { enemyInfoMarkup, wardenInfoMarkup } from '../src/ui/hud';
import { cfg } from './helpers';

const content = loadContent();

describe('p9h — the armour row shows the effective (floored/capped) value', () => {
  it('shreds an enemy past the -100 floor and shows -100, not the raw negative', () => {
    const w = new World(cfg());
    const def = [...content.enemyByKey.values()][0];
    const e = spawnEnemy(w, def.key, 10, 10)!;
    shredArmor(e, 294 + e.armor); // raw effective armour would be -294
    const markup = enemyInfoMarkup(w, e);
    expect(markup).toContain('-100 (floor)');
    expect(markup).not.toContain('-294');
    expect(markup).toContain('100% more taken');
  });

  it('leaves an unclamped armour value unmarked', () => {
    const w = new World(cfg());
    const def = [...content.enemyByKey.values()][0];
    const e = spawnEnemy(w, def.key, 10, 10)!;
    const markup = enemyInfoMarkup(w, e);
    expect(markup).not.toContain('(floor)');
    expect(markup).not.toContain('(cap)');
  });

  it('buffs the Warden past the +99 cap and shows 99, not the raw number', () => {
    const w = new World(cfg());
    w.stats.add('src:test', 'armor', 200);
    w.recomputeDerived();
    const markup = wardenInfoMarkup(w);
    expect(markup).toContain('99 (cap)');
    expect(markup).toContain('99% off');
  });
});
