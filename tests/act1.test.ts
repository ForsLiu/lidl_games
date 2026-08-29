/** Act I rules: placement legality, economy, tower fire, wave flow. */

import { beforeEach, describe, expect, it } from 'vitest';

import { Run, applyCommand } from '../src/sim/run';
import { World } from '../src/sim/world';
import { buildTower, checkBuild, collectSproutGold, sellTower, towerCost, updateTowers, upgradeTower } from '../src/sim/towers';
import { damageEnemy, spawnEnemy } from '../src/sim/enemies';
import { GATES, GRID_H, GRID_W, coreCenter } from '../src/sim/grid';
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

  it('allows a placement that cuts a gate off (SPEC-FINAL §10 legalises sealing)', () => {
    // Seal the west gate's only exit with three walls. Under the retired path
    // guarantee the third was 'blocks_path'; §10 makes it a legal seal that
    // enemies answer by breaching (tests/p1a-sealing.test.ts).
    warp(w, 1, 10);
    expect(buildTower(w, 1, 1, 9).ok).toBe(true);
    expect(buildTower(w, 1, 1, 11).ok).toBe(true);
    expect(w.grid.wouldBlockPath([[1, 10]])).toBe(true); // it is a seal…
    expect(checkBuild(w, 1, 1, 10)).toBeNull(); // …and it is legal
    expect(buildTower(w, 1, 1, 10).ok).toBe(true);
    expect(w.grid.allGatesReachable()).toBe(false);
  });

  it('fb002: a build landing on the Warden\'s own tile succeeds without relocating it (supersedes b016\'s nudge-fix)', () => {
    // b016 used to relocate the Warden away from a build landing on its own
    // tile, to avoid trapping it under the structure's now-blocked
    // footprint. fb002 supersedes that (BACKLOG.md's own note): the Warden
    // ignores structure collision entirely, so it stays exactly where it
    // was — standing inside the new structure is now legal, not a special
    // case, and it can still freely walk back off at any time.
    warp(w, 5, 5);
    expect(checkBuild(w, 1, 5, 5)).toBeNull();
    const built = buildTower(w, 1, 5, 5);
    expect(built.ok).toBe(true);
    expect(w.grid.passable(5, 5)).toBe(false); // the tower still blocks everyone else
    expect(w.warden.x).toBe(5.5);
    expect(w.warden.y).toBe(5.5); // the Warden did not move
    expect(w.grid.wardenPassable(5, 5)).toBe(true); // but can still freely leave

    // Same, through the real player-facing Command path.
    warp(w, 8, 8);
    applyCommand(w, { k: 'build', tower: 1, tx: 8, ty: 8 });
    expect(w.grid.passable(8, 8)).toBe(false);
    expect(w.warden.x).toBe(8.5);
    expect(w.warden.y).toBe(8.5);
  });

  it('fb002: a build succeeds even with no reachable escape tile for the Warden (supersedes b016)', () => {
    // Pre-fb002 this was refused outright (b016) because a fully-walled
    // tile left the Warden with nowhere to escape to. Now that the Warden
    // ignores structure collision, there is nothing to escape from.
    warp(w, 5, 5);
    for (let ty = 0; ty < GRID_H; ty++) {
      for (let tx = 0; tx < GRID_W; tx++) {
        if (tx === 5 && ty === 5) continue;
        w.grid.setOcc(tx, ty, 999999);
      }
    }
    const res = buildTower(w, 1, 5, 5);
    expect(res.ok).toBe(true);
    expect(w.warden.x).toBe(5.5);
    expect(w.warden.y).toBe(5.5);
  });

  it('charges gold and refunds 70% on sale', () => {
    warp(w, 5, 5);
    const def = w.content.towerByKey.get('arrow_spire')!;
    const cost = towerCost(w, def);
    const before = w.gold;
    expect(buildTower(w, def.id, 5, 5).ok).toBe(true);
    expect(w.gold).toBe(before - cost);
    expect(sellTower(w, 5, 5)).toBe(true);
    expect(w.gold).toBe(before - cost + Math.round(cost * 0.5));
  });

  it('refuses to build without gold', () => {
    warp(w, 5, 5);
    w.gold = 1;
    expect(checkBuild(w, 2, 5, 5)).toBe('gold');
  });

  it('lets any class build any tower (SPEC-V2 §2 affinity replaces class locks)', () => {
    warp(w, 5, 5);
    // Engineer may build both the Tesla Coil and the Pyromancer-flavoured Brazier.
    expect(checkBuild(w, 6, 5, 5)).toBeNull();
    expect(checkBuild(w, 4, 5, 5)).toBeNull();
  });

  // SPEC-V3 §4 replaced V2's two-step 0.75x/1.25x ladder with a flat per-step
  // cost and a per-tower step count, so this now walks the whole track.
  it('upgrades through its whole track at a flat per-step cost', () => {
    warp(w, 5, 5);
    const def = w.content.towerByKey.get('arrow_spire')!;
    buildTower(w, def.id, 5, 5);
    w.gold = 10000;
    // The Engineer's -10% tower cost applies to upgrades too.
    const mul = w.derived.towerCostMul;
    const step = Math.round(def.upgrades.stepCost * mul);
    for (let i = 0; i < def.upgrades.count; i++) {
      const g = w.gold;
      expect(upgradeTower(w, 5, 5), `step ${i + 1}`).toBe(true);
      expect(g - w.gold, `step ${i + 1}`).toBe(step);
    }
    expect(upgradeTower(w, 5, 5)).toBe(false); // track exhausted
    expect(w.structureAt(5, 5)!.tier).toBe(def.upgrades.count + 1);
  });

  it('walls have no upgrade track', () => {
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

  it('calling a wave early grants no gold (fb009: early-call bonus removed)', () => {
    const run = new Run(cfg());
    const w = run.world;
    const before = w.gold;
    run.step({ ...emptyInput(), cmds: [{ k: 'call' }] });
    expect(w.gold).toBe(before);
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

describe('fb002: the Warden (and dash) ignore collision with the Core and friendly structures (§10 amendment)', () => {
  it('walks straight through a built structure in Act I', () => {
    const run = new Run(cfg());
    const w = run.world;
    warp(w, 5, 5);
    expect(buildTower(w, 1, 6, 5).ok).toBe(true);
    expect(w.grid.passable(6, 5)).toBe(false); // the structure still blocks everyone else
    warp(w, 3, 5);
    for (let i = 0; i < 200; i++) run.step({ ...emptyInput(), mx: 1, my: 0 });
    expect(w.warden.x).toBeGreaterThan(7.5); // crossed straight through the structure's tile
    expect(w.grid.passable(6, 5)).toBe(false); // still a blocked tile for anyone else
  });

  it('walks through a structure and the Core footprint during Act II (VS)', () => {
    const run = new Run(cfg());
    const w = run.world;
    warp(w, 5, 5);
    expect(buildTower(w, 1, 6, 5).ok).toBe(true);
    w.phase = 'act2';
    warp(w, 3, 5);
    for (let i = 0; i < 200; i++) run.step({ ...emptyInput(), mx: 1, my: 0 });
    expect(w.warden.x).toBeGreaterThan(7.5);
    const c = coreCenter();
    warp(w, Math.floor(c.x), Math.floor(c.y));
    expect(w.grid.wardenPassable(Math.floor(c.x), Math.floor(c.y))).toBe(true);
  });

  it('the dodge-dash lands on a structure tile instead of stopping short of it', () => {
    const run = new Run(cfg());
    const w = run.world;
    warp(w, 9, 5); // within build range of the dash's landing tile
    expect(buildTower(w, 1, 10, 5).ok).toBe(true);
    warp(w, 6, 5); // exactly BASE.dashDistance (4 tiles) west of the structure
    run.step({ ...emptyInput(), mx: 1, my: 0, dash: true });
    // Pre-fb002, `blinkWarden` would have backed off along the dash line until
    // it found a passable tile short of (10,5); now it lands on it directly.
    expect(Math.floor(w.warden.x)).toBe(10);
    expect(w.grid.passable(10, 5)).toBe(false); // the structure is still there and still blocks others
  });

  it('enemy pathing keeps treating the structure as blocked (the Warden-only predicate is separate)', () => {
    const w = new World(cfg());
    warp(w, 5, 5);
    expect(buildTower(w, 1, 6, 5).ok).toBe(true);
    w.grid.refresh();
    expect(w.grid.passable(6, 5)).toBe(false);
    expect(w.grid.blocked[w.grid.idx(6, 5)]).toBe(1);
    expect(w.grid.wardenPassable(6, 5)).toBe(true); // Warden-only: the new predicate ignores it
  });
});
