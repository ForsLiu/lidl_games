/** Act II rules: XP curve, weapons, gems, level-up offers, spawn director. */

import { describe, expect, it } from 'vitest';

import { World } from '../src/sim/world';
import { spawnEnemy } from '../src/sim/enemies';
import { addXp, deriveSouls, rollOffers, takeOffer, updateGems, xpToReach } from '../src/sim/progression';
import { grantWeapon, updateWeapons, weaponDamageMul } from '../src/sim/weapons';
import { budgetFor, pickSpawnPoint, timeHpScale } from '../src/sim/act2';
import { buildTower } from '../src/sim/towers';
import { finishSundering } from '../src/sim/sundering';
import { GRID_H, GRID_W } from '../src/sim/grid';
import { cfg } from './helpers';

function act2World(): World {
  const w = new World(cfg());
  w.phase = 'act2';
  w.sundered = true;
  w.warden.x = 18;
  w.warden.y = 10;
  w.updateNav(true);
  return w;
}

describe('XP and levelling (SPEC 5.2)', () => {
  it('uses the 5n + n^2 curve', () => {
    expect(xpToReach(2)).toBe(14);
    expect(xpToReach(3)).toBe(24);
    expect(xpToReach(4)).toBe(36);
    expect(xpToReach(5)).toBe(50);
  });

  it('levels up and queues a choice', () => {
    const w = act2World();
    addXp(w, 14);
    expect(w.level).toBe(2);
    expect(w.pendingLevelUps).toBe(1);
  });

  it('carries leftover XP into the next level', () => {
    const w = act2World();
    addXp(w, 20);
    expect(w.level).toBe(2);
    expect(w.xp).toBe(6);
  });

  it('offers three distinct cards with a free reroll', () => {
    const w = act2World();
    grantWeapon(w, 'arrow_volley', 1, 0);
    const offers = rollOffers(w);
    expect(offers.length).toBe(3);
    expect(new Set(offers.map((o) => o.kind + o.key)).size).toBe(3);
  });

  it('applies a weapon offer', () => {
    const w = act2World();
    grantWeapon(w, 'arrow_volley', 1, 0);
    w.phase = 'levelup';
    w.offers = [{ kind: 'weapon', key: 'arrow_volley', name: '', desc: '', toLevel: 2 }];
    expect(takeOffer(w, 0)).toBe(true);
    expect(w.weapons[0].level).toBe(2);
    expect(w.phase).toBe('act2');
  });

  it('applies a boon offer and its stat', () => {
    const w = act2World();
    const before = w.derived.powerMul;
    w.phase = 'levelup';
    w.offers = [{ kind: 'boon', key: 'power', name: '', desc: '', toLevel: 1 }];
    takeOffer(w, 0);
    expect(w.boonRanks.power).toBe(1);
    expect(w.derived.powerMul).toBeCloseTo(before + 0.08, 6);
  });

  it('never offers a boon past its max rank', () => {
    const w = act2World();
    w.boonRanks.second_wind = 1;
    for (let i = 0; i < 50; i++) {
      for (const o of rollOffers(w)) {
        expect(o.key === 'second_wind' && o.kind === 'boon').toBe(false);
      }
    }
  });
});

describe('gems', () => {
  it('are attracted inside the pickup radius and grant XP', () => {
    const w = act2World();
    w.gems.push({ id: 1, x: w.warden.x + 1.0, y: w.warden.y, value: 5, vx: 0, vy: 0, life: 45, dead: false });
    for (let i = 0; i < 60; i++) updateGems(w, 1 / 60);
    expect(w.gems.filter((g) => !g.dead).length).toBe(0);
    expect(w.xp).toBe(5);
  });

  it('ignores gems outside the pickup radius', () => {
    const w = act2World();
    w.gems.push({ id: 1, x: w.warden.x + 6, y: w.warden.y, value: 5, vx: 0, vy: 0, life: 45, dead: false });
    for (let i = 0; i < 60; i++) updateGems(w, 1 / 60);
    expect(w.gems.filter((g) => !g.dead).length).toBe(1);
    expect(w.xp).toBe(0);
  });
});

/**
 * RETIRED (SPEC-FINAL §6.1, P2) — per-weapon identity.
 *
 * §6.1 has no soul weapons: in a VS wave the character wields every built
 * *tower type's* attack, at that type's attack speed and highest upgrade
 * level's effects. The Frost Nova, the Toxic Trail and the innate weapon have
 * no successor to be renamed into. Deleted at BACKLOG p2e.
 */
describe.skip('soul weapons', () => {
  it('fire automatically at whatever is in range', () => {
    const w = act2World();
    grantWeapon(w, 'arrow_volley', 1, 0);
    const e = spawnEnemy(w, 'husk', w.warden.x + 2, w.warden.y, { overlay: true })!;
    const hp0 = e.hp;
    for (let i = 0; i < 60; i++) {
      w.rebuildBuckets();
      updateWeapons(w, 1 / 60);
    }
    expect(e.hp).toBeLessThan(hp0);
  });

  it('the Frost Nova slows everything it catches', () => {
    const w = act2World();
    grantWeapon(w, 'frost_nova', 1, 0);
    // Something that survives the pulse, so the slow is observable.
    const e = spawnEnemy(w, 'colossus', w.warden.x + 1.5, w.warden.y, { overlay: true })!;
    for (let i = 0; i < 60 * 5; i++) {
      w.rebuildBuckets();
      updateWeapons(w, 1 / 60);
      if (e.slowAmount > 0) break;
    }
    expect(e.slowAmount).toBeGreaterThan(0);
  });

  it('the Toxic Trail leaves poison behind the Warden', () => {
    const w = act2World();
    grantWeapon(w, 'toxic_trail', 1, 0);
    for (let i = 0; i < 60; i++) {
      w.rebuildBuckets();
      updateWeapons(w, 1 / 60);
    }
    expect(w.areas.length).toBeGreaterThan(0);
    expect(w.areas[0].type).toBe('poison');
  });

  it('scales damage by Power and the inheritance bonus', () => {
    const w = act2World();
    const ws = grantWeapon(w, 'arrow_volley', 1, 0.4);
    expect(weaponDamageMul(w, ws)).toBeCloseTo(1.4, 6);
  });
});

/**
 * RETIRED (SPEC-FINAL §6.1 + §14 G3, P2) — the inheritance formula.
 *
 * "Highest tier as the level, +8% per extra tower to +40%, capped by slots" is
 * exactly what §6.1 replaces: damage is the **average** across that type's
 * towers × (1 + 10% × count), with no cap and no slots. G3 ships §6.1's worked
 * example verbatim in its place (BACKLOG p2a). Deleted at p2e.
 */
describe.skip('weapon inheritance (SPEC 4.1)', () => {
  it('takes the highest tier as the level and +8% per extra tower to +40%', () => {
    const w = new World(cfg());
    w.gold = 100000;
    let placed = 0;
    for (let x = 4; x < 20 && placed < 7; x++) {
      w.warden.x = x + 0.5;
      w.warden.y = 5.5;
      if (buildTower(w, 2, x, 5).ok) placed++;
    }
    expect(placed).toBe(7);
    // Walk one of them to the end of its track. SPEC-V3 §4 (m20a) gave every
    // tower its own length, so what is inherited is the *share* of the track
    // walked: a maxed tower still hands over `inheritMaxLevel`, which is what
    // V2's tier 3 handed over, and a half-walked one hands over the middle.
    w.warden.x = 4.5;
    const def = w.content.towerById.get(2)!;
    const s = w.structureAt(4, 5)!;
    s.tier = def.upgrades.count + 1;
    const souls = deriveSouls(w);
    const arrow = souls.find((x) => x.key === 'arrow_volley')!;
    expect(arrow.level).toBe(w.content.weapons.inheritMaxLevel);
    expect(arrow.damageBonus).toBeCloseTo(0.4, 6); // 6 extras x 8% capped at 40%
  });

  it('grants the slotless innate weapon regardless of towers', () => {
    const w = new World(cfg());
    finishSundering(w, []);
    expect(w.weapons.map((x) => x.key)).toContain('wardens_arrow');
  });

  it('never binds more souls than the Warden has slots', () => {
    const w = new World(cfg());
    const all = ['arrow_volley', 'piercing_bolt', 'frost_nova', 'chain_lightning', 'mortar_lob', 'toxic_trail', 'flame_cone'];
    finishSundering(w, all);
    const slotted = w.weapons.filter((x) => !w.content.weaponByKey.get(x.key)?.slotless);
    expect(slotted.length).toBeLessThanOrEqual(w.derived.weaponSlots);
  });
});

describe('spawn director (SPEC 5.1)', () => {
  it('grows the budget with elapsed minutes', () => {
    const w = act2World();
    const b0 = budgetFor(w);
    w.act2Time = 300;
    expect(budgetFor(w)).toBeGreaterThan(b0);
  });

  it('ramps enemy HP with time', () => {
    const w = act2World();
    expect(timeHpScale(w)).toBeCloseTo(1, 6);
    w.act2Time = 600;
    expect(timeHpScale(w)).toBeGreaterThan(1.5);
  });

  it('only picks walkable spawn points inside the arena', () => {
    const w = act2World();
    for (let i = 0; i < 400; i++) {
      const p = pickSpawnPoint(w);
      expect(p.x).toBeGreaterThan(0.5);
      expect(p.y).toBeGreaterThan(0.5);
      expect(p.x).toBeLessThan(GRID_W - 0.5);
      expect(p.y).toBeLessThan(GRID_H - 0.5);
      expect(w.grid.passable(Math.floor(p.x), Math.floor(p.y))).toBe(true);
    }
  });

  it('applies the Act II stat overlay', () => {
    const w = act2World();
    const e = spawnEnemy(w, 'husk', 5, 5, { overlay: true })!;
    const def = w.content.enemyByKey.get('husk')!;
    // The overlay is relative to the statline Act I ended on (see enemies.ts).
    expect(e.maxHp).toBeCloseTo(def.hp * w.content.spawns.hpOverlay * w.content.spawns.actIICarry, 5);
    expect(e.speed).toBeCloseTo(def.speed * w.content.spawns.speedOverlay, 5);
  });
});
