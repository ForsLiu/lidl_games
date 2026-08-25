/** M6: the Warden-Eater's three phases, the Awakenings, and Rift events. */

import { describe, expect, it } from 'vitest';

import { World } from '../src/sim/world';
import { Run } from '../src/sim/run';
import { spawnEnemy, updateEnemies } from '../src/sim/enemies';
import { bossUpdate, updateBossSlam } from '../src/sim/boss';
import { expandedRiftTimes, spawnFinalBoss, shouldSpawnBoss } from '../src/sim/act2';
import { grantWeapon, updateWeapons } from '../src/sim/weapons';
import { applyOffer, rollOffers } from '../src/sim/progression';
import { buildTower } from '../src/sim/towers';
import { GRID_H, GRID_W } from '../src/sim/grid';
import type { Enemy } from '../src/sim/types';
import { cfg, runWithPolicy } from './helpers';

function act2World(tier = 1): World {
  const w = new World(cfg({ tier }));
  w.phase = 'act2';
  w.sundered = true;
  w.warden.x = GRID_W / 2;
  w.warden.y = GRID_H / 2;
  w.updateNav(true);
  return w;
}

function boss(w: World, hpFraction = 1): Enemy {
  const e = spawnEnemy(w, 'warden_eater', w.warden.x + 6, w.warden.y, { overlay: false })!;
  e.hp = e.maxHp * hpFraction;
  return e;
}

function tick(w: World, e: Enemy, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    w.rebuildBuckets();
    bossUpdate(w, e, 1 / 60);
    updateBossSlam(w, 1 / 60);
  }
}

describe('the Warden-Eater (SPEC 5.5)', () => {
  it('spawns at 10:00 with 15,000 HP scaled by tier', () => {
    const w = act2World();
    expect(shouldSpawnBoss(w)).toBe(false);
    w.act2Time = w.content.spawns.bossTimeSeconds;
    expect(shouldSpawnBoss(w)).toBe(true);
    spawnFinalBoss(w);
    const e = w.enemies.find((x) => x.boss)!;
    expect(e.maxHp).toBeCloseTo(15000, 0);

    const w3 = act2World(3);
    const e3 = boss(w3);
    expect(e3.maxHp).toBeGreaterThan(e.maxHp);
  });

  it('moves through three phases as its HP falls', () => {
    const w = act2World();
    const e = boss(w, 1);
    tick(w, e, 0.1);
    expect(e.bossPhase).toBe(0);
    e.hp = e.maxHp * 0.5;
    tick(w, e, 0.1);
    expect(e.bossPhase).toBe(1);
    e.hp = e.maxHp * 0.2;
    tick(w, e, 0.1);
    expect(e.bossPhase).toBe(2);
  });

  it('telegraphs a charge before committing to it', () => {
    const w = act2World();
    const e = boss(w, 1);
    let sawTelegraph = false;
    for (let i = 0; i < 60 * 8 && !sawTelegraph; i++) {
      w.fx.length = 0;
      w.rebuildBuckets();
      bossUpdate(w, e, 1 / 60);
      if (w.fx.some((f) => f.k === 'bosstelegraph')) sawTelegraph = true;
    }
    expect(sawTelegraph).toBe(true);
  });

  it('shatters petrified terrain it charges through', () => {
    const w = act2World();
    w.phase = 'act1_build';
    w.gold = 100000;
    // A line of walls between the boss and the Warden.
    for (let x = 14; x <= 20; x++) {
      w.warden.x = x + 0.5;
      w.warden.y = GRID_H / 2;
      buildTower(w, 1, x, Math.floor(GRID_H / 2) - 1);
    }
    w.warden.x = GRID_W / 2;
    w.warden.y = GRID_H / 2;
    w.phase = 'act2';
    for (const s of w.structures) s.petrified = true;
    const before = w.structures.filter((s) => !s.dead).length;
    expect(before).toBeGreaterThan(2);

    const e = boss(w, 1);
    e.x = 13;
    e.y = Math.floor(GRID_H / 2) - 0.5;
    tick(w, e, 12);
    w.compact();
    expect(w.structures.filter((s) => !s.dead).length).toBeLessThan(before);
  });

  it('summons Wraiths and slams the ground in phase 2', () => {
    const w = act2World();
    const e = boss(w, 0.5);
    const before = w.enemies.length;
    tick(w, e, 10);
    const wraiths = w.enemies.filter(
      (x) => w.content.enemyById.get(x.defId)!.key === 'wraith' && !x.dead,
    );
    expect(w.enemies.length).toBeGreaterThan(before);
    expect(wraiths.length).toBeGreaterThan(0);
    expect(w.areas.some((a) => a.type === 'bossSlam')).toBe(true);
  });

  it('closes the arena with fire in phase 3, hurting a Warden at the rim', () => {
    const w = act2World();
    const e = boss(w, 0.2);
    tick(w, e, 0.2);
    expect(w.arenaFireActive).toBe(true);
    const r0 = w.arenaFireRadius;
    tick(w, e, 5);
    expect(w.arenaFireRadius).toBeLessThan(r0);

    // Park the Warden in a corner, well outside the ring, and check it burns.
    w.warden.x = 1.5;
    w.warden.y = 1.5;
    w.arenaFireRadius = 4;
    const hp = w.warden.hp;
    tick(w, e, 2);
    expect(w.warden.hp).toBeLessThan(hp);
  });

  it('falls through to a normal chase between abilities', () => {
    const w = act2World();
    const e = boss(w, 1);
    e.x = w.warden.x + 10;
    const before = e.x;
    for (let i = 0; i < 60 * 8; i++) {
      w.rebuildBuckets();
      updateEnemies(w, 1 / 60);
    }
    expect(e.x).toBeLessThan(before);
  });

  it('a scripted run reaches it, kills it and wins', () => {
    const { report } = runWithPolicy(cfg({ seed: 5 }), 'maxbuild');
    expect(report.outcome).toBe('victory');
    expect(report.bossKilled).toBe(true);
    expect(report.bossKillSeconds).toBeGreaterThan(600);
    expect(report.orbsFound).toBeGreaterThan(0);
    expect(report.relicsFound).toBeGreaterThan(0);
  });

  it('is a real fight: most scripted runs win, but not all', () => {
    let wins = 0;
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    for (const seed of seeds) {
      if (runWithPolicy(cfg({ seed }), 'maxbuild').report.bossKilled) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(5);
    expect(wins).toBeLessThan(seeds.length);
  });
});

describe('Awakenings (SPEC 5.3)', () => {
  const content = new World(cfg()).content;

  it('defines exactly three, each gated on a weapon and a boon', () => {
    expect(content.weapons.awakenings).toHaveLength(3);
    for (const a of content.weapons.awakenings) {
      expect(content.weaponByKey.has(a.weapon)).toBe(true);
      expect(content.boonByKey.has(a.boon)).toBe(true);
      expect(a.boonRank).toBeGreaterThanOrEqual(1);
    }
  });

  it('is not offered until the weapon is Lv6 and the boon is ranked', () => {
    const w = act2World();
    const a = content.weapons.awakenings[0];
    grantWeapon(w, a.weapon, 5, 0);
    w.boonRanks[a.boon] = a.boonRank;
    for (let i = 0; i < 40; i++) {
      expect(rollOffers(w).some((o) => o.kind === 'awakening')).toBe(false);
    }
    w.weapons[0].level = 6;
    w.boonRanks[a.boon] = a.boonRank - 1;
    for (let i = 0; i < 40; i++) {
      expect(rollOffers(w).some((o) => o.kind === 'awakening')).toBe(false);
    }
  });

  it('is offered once both conditions are met, and applies', () => {
    const w = act2World();
    const a = content.weapons.awakenings[0];
    grantWeapon(w, a.weapon, 6, 0);
    w.boonRanks[a.boon] = a.boonRank;
    let seen = false;
    for (let i = 0; i < 60 && !seen; i++) {
      seen = rollOffers(w).some((o) => o.kind === 'awakening' && o.key === a.key);
    }
    expect(seen).toBe(true);

    applyOffer(w, { kind: 'awakening', key: a.key, name: '', desc: '', toLevel: 1 });
    expect(w.awakenings).toContain(a.key);
    expect(w.weapons[0].awakened).toBe(true);
  });

  it('Storm Avatar makes Chain Lightning fire far more often', () => {
    const measure = (awakened: boolean): number => {
      const w = act2World();
      const ws = grantWeapon(w, 'chain_lightning', 6, 0);
      ws.awakened = awakened;
      for (let i = 0; i < 12; i++) {
        const e = spawnEnemy(w, 'bulwark', w.warden.x + 1 + i * 0.3, w.warden.y, { overlay: true })!;
        e.hp = 1e9;
        e.maxHp = 1e9;
      }
      let arcs = 0;
      for (let i = 0; i < 60 * 5; i++) {
        w.rebuildBuckets();
        w.fx.length = 0;
        updateWeapons(w, 1 / 60);
        arcs += w.fx.filter((f) => f.k === 'arc').length;
      }
      return arcs;
    };
    expect(measure(true)).toBeGreaterThan(measure(false));
  });

  it('Phoenix Ring adds an orbiting ring to the Flame Cone', () => {
    const w = act2World();
    const ws = grantWeapon(w, 'flame_cone', 6, 0);
    ws.awakened = true;
    spawnEnemy(w, 'colossus', w.warden.x, w.warden.y - 2.2, { overlay: true });
    w.warden.fx = 1;
    w.warden.fy = 0;
    for (let i = 0; i < 60 * 3; i++) {
      w.rebuildBuckets();
      updateWeapons(w, 1 / 60);
    }
    // The cone points along +x, so anything hurt above the Warden is the ring.
    expect(w.damageByWeapon['flame_cone']).toBeGreaterThan(0);
    expect(ws.ringPhase).toBeGreaterThan(0);
  });

  it('Meteor Barrage throws more shells per volley', () => {
    const shells = (awakened: boolean): number => {
      const w = act2World();
      const ws = grantWeapon(w, 'mortar_lob', 6, 0);
      ws.awakened = awakened;
      for (let i = 0; i < 30; i++) {
        spawnEnemy(w, 'husk', 8 + (i % 6), 6 + Math.floor(i / 6), { overlay: true });
      }
      w.rebuildBuckets();
      updateWeapons(w, 1 / 60);
      return w.projectiles.length;
    };
    expect(shells(true)).toBeGreaterThan(shells(false));
  });
});

describe('Rift events (SPEC 5.1)', () => {
  it('fires at 3:00, 6:00 and 9:00', () => {
    const w = act2World();
    expect(w.content.spawns.riftTimes).toEqual([180, 360, 540]);
    expect(expandedRiftTimes(w)).toEqual([180, 360, 540]);
  });

  it('Rift Storm doubles the number of tears', () => {
    const w = new World(cfg({ modifiers: ['riftstorm'] }));
    expect(expandedRiftTimes(w).length).toBe(w.content.spawns.riftTimes.length * 2);
  });

  it('a Rift bursts a surge of enemies into the arena', () => {
    const run = new Run(cfg({ seed: 4 }));
    const w = run.world;
    w.phase = 'act2';
    w.sundered = true;
    w.act2Time = 179.9;
    w.updateNav(true);
    const before = w.enemies.length;
    let sawRift = false;
    for (let i = 0; i < 30 && !sawRift; i++) {
      run.step();
      if (w.fx.some((f) => f.k === 'rift')) sawRift = true;
    }
    expect(sawRift).toBe(true);
    expect(w.enemies.length).toBeGreaterThan(before);
  });
});
