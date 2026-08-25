/**
 * The tower panel exists so a player can answer "what does this actually do,
 * and is the upgrade worth it" without reading /data. That is only true if the
 * numbers it prints are the numbers the sim fires with, so these tests check
 * the model against the sim's own helpers rather than against literals.
 */

import { describe, expect, it } from 'vitest';

import { World } from '../src/sim/world';
import { loadContent } from '../src/sim/content';
import { buildTower, sellTower, towerCost, upgradeCost, upgradeTower } from '../src/sim/towers';
import { grantWeapon } from '../src/sim/weapons';
import { sellValueOf, towerInfo, weaponInfo } from '../src/ui/tower-info';
import { cfg } from './helpers';

function world(): World {
  return new World(cfg());
}

/** A tile next to the Warden, so build-range checks pass. */
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

const content = loadContent();

describe('tower info model', () => {
  it('describes every tower in the game, attack or not', () => {
    const w = world();
    for (const def of content.towers.towers) {
      const info = towerInfo(w, def);
      expect(info.name, def.key).toBe(def.name);
      expect(info.attackText.length, def.key).toBeGreaterThan(0);
      expect(info.maxTier, def.key).toBe(def.maxTier);
      // Every tower says something concrete: a stat, or that placement is
      // the point. Palisades legitimately have no attack.
      if (def.attack) expect(info.stats.length, def.key).toBeGreaterThan(0);
    }
  });

  it('quotes the same build cost the sim charges', () => {
    const w = world();
    for (const def of content.towers.towers) {
      expect(towerInfo(w, def).buildCost, def.key).toBe(towerCost(w, def));
    }
  });

  it('an unbuilt tower has no sell value and no upgrade quote', () => {
    const w = world();
    const def = content.towerByKey.get('arrow_spire')!;
    const info = towerInfo(w, def);
    expect(info.sellValue).toBeNull();
    expect(info.upgrade).toBeNull();
    expect(info.tier).toBe(1);
  });

  it('a placed tower quotes the real upgrade cost and sell value', () => {
    const w = world();
    const def = content.towerByKey.get('arrow_spire')!;
    const { tx, ty } = freeTileNear(w);
    w.gold = 9999;
    expect(buildTower(w, def.id, tx, ty).ok).toBe(true);
    const s = w.structureAt(tx, ty)!;

    const info = towerInfo(w, def, s);
    expect(info.tier).toBe(1);
    expect(info.buildCost).toBeNull();
    expect(info.upgrade).toEqual({ toTier: 2, cost: upgradeCost(w, def, 2) });
    expect(info.sellValue).toBe(sellValueOf(w, def, 1));

    // And the quoted sell value is what selling actually pays out.
    const before = w.gold;
    expect(sellTower(w, tx, ty)).toBe(true);
    expect(w.gold - before).toBe(info.sellValue);
  });

  it('reports no upgrade once a tower is at max tier', () => {
    const w = world();
    const def = content.towerByKey.get('arrow_spire')!;
    const { tx, ty } = freeTileNear(w);
    w.gold = 9999;
    buildTower(w, def.id, tx, ty);
    while (w.structureAt(tx, ty)!.tier < def.maxTier) {
      w.gold = 9999;
      expect(upgradeTower(w, tx, ty)).toBe(true);
    }
    const info = towerInfo(w, def, w.structureAt(tx, ty)!);
    expect(info.tier).toBe(def.maxTier);
    expect(info.upgrade).toBeNull();
  });

  it('shows what a tier buys: damage and range both go up', () => {
    const w = world();
    const def = content.towerByKey.get('ballista')!;
    const damage = towerInfo(w, def).stats.find((s) => s.label === 'Damage')!;
    const range = towerInfo(w, def).stats.find((s) => s.label === 'Range')!;
    expect(Number(damage.next)).toBeGreaterThan(Number(damage.value.split(' ')[0]));
    expect(Number(range.next)).toBeGreaterThan(Number(range.value.split(' ')[0]));
  });

  it('names the soul a tower will leave behind, and only for soul towers', () => {
    const w = world();
    for (const def of content.towers.towers) {
      const info = towerInfo(w, def);
      if (def.soul) expect(info.soul?.name, def.key).toBe(content.weaponByKey.get(def.soul)!.name);
      else expect(info.soul, def.key).toBeNull();
    }
  });

  it('spells out the terrain a tower petrifies into', () => {
    const w = world();
    const brazier = towerInfo(w, content.towerByKey.get('ember_brazier')!);
    expect(brazier.terrainText).toMatch(/burns/);
    const obelisk = towerInfo(w, content.towerByKey.get('frost_obelisk')!);
    expect(obelisk.terrainText).toMatch(/slows/);
  });

  it('a Beacon reports its aura, and the aura grows with tier', () => {
    const w = world();
    const def = content.towerByKey.get('beacon_totem')!;
    const { tx, ty } = freeTileNear(w);
    w.gold = 9999;
    buildTower(w, def.id, tx, ty);
    const s = w.structureAt(tx, ty)!;
    const t1 = towerInfo(w, def, s).stats.find((x) => x.label === 'Aura')!.value;
    w.gold = 9999;
    upgradeTower(w, tx, ty);
    const t2 = towerInfo(w, def, w.structureAt(tx, ty)!).stats.find((x) => x.label === 'Aura')!.value;
    expect(t2).not.toBe(t1);
  });
});

describe('weapon info model', () => {
  it('describes every weapon at every level', () => {
    const w = world();
    for (const def of content.weapons.weapons) {
      for (let level = 1; level <= def.levels.length; level++) {
        const ws = grantWeapon(w, def.key, level, 0);
        const info = weaponInfo(w, ws);
        expect(info.name, def.key).toBe(def.name);
        expect(info.level, def.key).toBe(level);
        expect(info.maxLevel, def.key).toBe(def.levels.length);
        expect(info.stats.length, `${def.key} Lv${level}`).toBeGreaterThan(0);
        expect(info.attackText.length).toBeGreaterThan(0);
      }
    }
  });

  it('shows what the next level buys, and stops at max level', () => {
    const w = world();
    const low = weaponInfo(w, grantWeapon(w, 'piercing_bolt', 1, 0));
    expect(low.stats.some((s) => s.next !== undefined)).toBe(true);

    const w2 = world();
    const def = content.weaponByKey.get('piercing_bolt')!;
    const top = weaponInfo(w2, grantWeapon(w2, 'piercing_bolt', def.levels.length, 0));
    expect(top.stats.every((s) => s.next === undefined)).toBe(true);
  });

  it('folds inherited damage into the printed numbers, and names it', () => {
    const plain = world();
    const rich = world();
    const a = weaponInfo(plain, grantWeapon(plain, 'piercing_bolt', 3, 0));
    const b = weaponInfo(rich, grantWeapon(rich, 'piercing_bolt', 3, 0.4));
    const dmg = (info: typeof a) => Number(info.stats.find((s) => s.label === 'Damage')!.value);
    expect(dmg(b)).toBeGreaterThan(dmg(a));
    expect(b.stats.some((s) => s.label === 'Inherited')).toBe(true);
    expect(a.stats.some((s) => s.label === 'Inherited')).toBe(false);
  });

  it('names the Awakening a weapon can still reach, and what it needs', () => {
    const w = world();
    const awakening = content.weapons.awakenings[0];
    const info = weaponInfo(w, grantWeapon(w, awakening.weapon, 1, 0));
    expect(info.awakening?.name).toBe(awakening.name);
    expect(info.awakening?.needs).toContain(String(awakening.boonRank));
  });

  it('says which tower a soul came from, and that the innate one is slotless', () => {
    const w = world();
    const innate = weaponInfo(w, grantWeapon(w, 'wardens_arrow', 1, 0));
    expect(innate.sourceText).toMatch(/slot/i);
    const bound = weaponInfo(w, grantWeapon(w, 'piercing_bolt', 1, 0));
    expect(bound.sourceText).toContain(content.towerByKey.get('ballista')!.name);
  });
});
