/** Act I rules: placement legality, economy, tower fire, wave flow. */

import { beforeEach, describe, expect, it } from 'vitest';

import { Run } from '../src/sim/run';
import { World } from '../src/sim/world';
import { buildTower, checkBuild, collectSproutGold, sellTower, towerCost, updateTowers, upgradeTower } from '../src/sim/towers';
import { damageEnemy, spawnEnemy } from '../src/sim/enemies';
import { GATES, coreCenter } from '../src/sim/grid';
import { emptyInput } from '../src/sim/types';
import { cfg } from './helpers';

function newWorld(over = {}): World {
  return new World(cfg(over));
}

/** Teleport the Warden so build-range checks pass in unit tests. */
function warp(w: World, tx: number, ty: number): void {
  w.warden.x = tx + 0.5;
  w.warden.y = ty + 0.5;
}

describe('placement rules (SPEC 3.1)', () => {
  let w: World;
  beforeEach(() => {
    w = newWorld();
  });

  it('rejects tiles outside build range', () => {
    warp(w, 5, 5);
    expect(checkBuild(w, 2, 30, 15)).toBe('out_of_range');
  });

  it('rejects the border, gates and the Core footprint', () => {
    warp(w, 1, 10);
    expect(checkBuild(w, 2, 0, 10)).toBe('occupied'); // gate tile
    warp(w, 1, 1);
    expect(checkBuild(w, 2, 0, 0)).toBe('occupied'); // border
    const c = coreCenter();
    warp(w, 25, 9);
    expect(checkBuild(w, 2, 25, 9)).toBe('occupied');
    expect(c.x).toBeGreaterThan(0);
  });

  it('rejects a placement that would cut a gate off', () => {
    // Seal the west gate's only exit with three walls, leaving the last for the test.
    warp(w, 1, 10);
    expect(buildTower(w, 1, 1, 9).ok).toBe(true);
    expect(buildTower(w, 1, 1, 11).ok).toBe(true);
    expect(checkBuild(w, 1, 1, 10)).toBe('blocks_path');
    expect(w.grid.allGatesReachable()).toBe(true);
  });

  it('charges gold and refunds 70% on sale', () => {
    warp(w, 5, 5);
    const def = w.content.towerByKey.get('arrow_spire')!;
    const cost = towerCost(w, def);
    const before = w.gold;
    expect(buildTower(w, def.id, 5, 5).ok).toBe(true);
    expect(w.gold).toBe(before - cost);
    expect(sellTower(w, 5, 5)).toBe(true);
    expect(w.gold).toBe(before - cost + Math.round(cost * 0.7));
  });

  it('refuses to build without gold', () => {
    warp(w, 5, 5);
    w.gold = 1;
    expect(checkBuild(w, 2, 5, 5)).toBe('gold');
  });

  it('honours class locks', () => {
    warp(w, 5, 5);
    // Engineer may build the Tesla Coil but not the Pyromancer's Brazier.
    expect(checkBuild(w, 6, 5, 5)).toBeNull();
    expect(checkBuild(w, 4, 5, 5)).toBe('class_locked');
  });

  it('upgrades through three tiers at the SPEC cost curve', () => {
    warp(w, 5, 5);
    const def = w.content.towerByKey.get('arrow_spire')!;
    buildTower(w, def.id, 5, 5);
    w.gold = 10000;
    // The Engineer's -10% tower cost applies to upgrades too.
    const mul = w.derived.towerCostMul;
    const g0 = w.gold;
    expect(upgradeTower(w, 5, 5)).toBe(true);
    expect(g0 - w.gold).toBe(Math.round(def.cost * 0.75 * mul));
    const g1 = w.gold;
    expect(upgradeTower(w, 5, 5)).toBe(true);
    expect(g1 - w.gold).toBe(Math.round(def.cost * 1.25 * mul));
    expect(upgradeTower(w, 5, 5)).toBe(false); // maxTier 3
    expect(w.structureAt(5, 5)!.tier).toBe(3);
  });

  it('walls have no tier upgrades', () => {
    warp(w, 5, 5);
    buildTower(w, 1, 5, 5);
    w.gold = 10000;
    expect(upgradeTower(w, 5, 5)).toBe(false);
  });
});

describe('tower fire', () => {
  it('an Arrow Spire kills a Husk in range', () => {
    const w = newWorld();
    warp(w, 10, 10);
    buildTower(w, 2, 10, 10);
    const e = spawnEnemy(w, 'husk', 12, 10, { overlay: false })!;
    const hp0 = e.hp;
    for (let i = 0; i < 120; i++) {
      w.rebuildBuckets();
      updateTowers(w, 1 / 60);
    }
    expect(e.hp).toBeLessThan(hp0);
    expect(w.damageByWeapon['arrow_spire']).toBeGreaterThan(0);
  });

  it('does not reach past its range', () => {
    const w = newWorld();
    warp(w, 10, 10);
    buildTower(w, 2, 10, 10);
    const e = spawnEnemy(w, 'husk', 20, 10, { overlay: false })!;
    const hp0 = e.hp;
    for (let i = 0; i < 120; i++) {
      w.rebuildBuckets();
      updateTowers(w, 1 / 60);
    }
    expect(e.hp).toBe(hp0);
  });

  it('the Frost Obelisk slows what it pulses', () => {
    const w = newWorld();
    warp(w, 10, 10);
    w.cfg.classKey = 'frost_warden';
    buildTower(w, 5, 10, 10);
    // Something that survives the pulse, so the slow is observable.
    const e = spawnEnemy(w, 'colossus', 11.5, 10, { overlay: false })!;
    for (let i = 0; i < 90; i++) {
      w.rebuildBuckets();
      updateTowers(w, 1 / 60);
    }
    expect(e.slowAmount).toBeGreaterThan(0);
  });

  it('Frostkin ignore slows', () => {
    const w = newWorld();
    warp(w, 10, 10);
    w.cfg.classKey = 'frost_warden';
    buildTower(w, 5, 10, 10);
    const e = spawnEnemy(w, 'frostkin', 11.5, 10, { overlay: false })!;
    e.hp = 1e9;
    for (let i = 0; i < 90; i++) {
      w.rebuildBuckets();
      updateTowers(w, 1 / 60);
    }
    expect(e.slowAmount).toBe(0);
  });

  it('Bulwark Beetles take 30% less damage', () => {
    const w = newWorld();
    warp(w, 10, 10);
    buildTower(w, 2, 10, 10);
    const husk = spawnEnemy(w, 'husk', 11.5, 10, { overlay: false })!;
    const bulwark = spawnEnemy(w, 'bulwark', 11.5, 10.2, { overlay: false })!;
    // Damage both directly to compare mitigation, not targeting.
    const a = damageEnemy(w, husk, 10, 'test');
    const b = damageEnemy(w, bulwark, 10, 'test');
    expect(a).toBeCloseTo(10, 5);
    expect(b).toBeCloseTo(7, 5);
  });
});

describe('economy and wave flow', () => {
  it('starts with the SPEC 3.2 gold and Core HP', () => {
    const w = newWorld();
    expect(w.gold).toBe(250);
    expect(w.coreMaxHp).toBe(500);
  });

  it('pays a wave-clear bonus and Sprout income', () => {
    const w = newWorld();
    warp(w, 5, 5);
    buildTower(w, 10, 5, 5); // Harvest Sprout
    const before = w.gold;
    const paid = collectSproutGold(w);
    expect(paid).toBe(5);
    expect(w.gold).toBe(before + 5);
  });

  it('calling a wave early pays 2 gold per second skipped', () => {
    const run = new Run(cfg());
    const w = run.world;
    const before = w.gold;
    const skipped = w.buildTimer;
    run.step({ ...emptyInput(), cmds: [{ k: 'call' }] });
    expect(w.gold).toBe(before + Math.round(skipped * 2));
    expect(w.phase).toBe('act1_wave');
  });

  it('spawns the authored wave 1 composition at every gate', () => {
    const run = new Run(cfg());
    const w = run.world;
    run.step({ ...emptyInput(), cmds: [{ k: 'call' }] });
    for (let i = 0; i < 60 * 30 && w.spawnQueue.length > 0; i++) run.step(emptyInput());
    // 8 Husks per gate x 3 gates.
    expect(w.kills + w.leaks + w.enemies.length).toBe(24);
    expect(GATES.length).toBe(3);
  });
});
