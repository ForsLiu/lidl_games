/** Act II rules: XP curve, weapons, gems, level-up offers, spawn director. */

import { describe, expect, it } from 'vitest';

import { World } from '../src/sim/world';
import { spawnEnemy } from '../src/sim/enemies';
import {
  addXp,
  openLevelUpIfPending,
  pickAutoOfferIndex,
  rollOffers,
  takeOffer,
  updateGems,
  xpToReach,
} from '../src/sim/progression';
import { budgetFor, pickSpawnPoint, timeHpScale } from '../src/sim/act2';
import { applyCommand } from '../src/sim/run';
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
    const offers = rollOffers(w);
    expect(offers.length).toBe(3);
    expect(new Set(offers.map((o) => o.kind + o.key)).size).toBe(3);
  });

  // RETIRED (SPEC-FINAL §6.3) — the level-up pool has no weapon cards: it
  // offers stat boons, Type Mastery per built tower type, and per-class skill
  // cards. Re-asserted by p7a. Deleted with the pool rewrite at **p7a**.
  it.skip('applies a weapon offer', () => {
    // No weapon offers exist since p2e; kept skipped for p7a's own asserts.
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

/**
 * SPEC-FINAL §6.3, owner feedback `feature-auto-pick-boons`: with
 * `autoPickLevelUps` on, a level-up resolves itself instead of pausing the
 * run for input.
 */
describe('auto-pick level-ups (fb003)', () => {
  it('picks the highest-rank owned stat boon among the offers', () => {
    const w = act2World();
    w.boonRanks = { power: 1, agility: 3 };
    const offers = [
      { kind: 'boon' as const, key: 'vitality', name: '', desc: '', toLevel: 1 },
      { kind: 'boon' as const, key: 'power', name: '', desc: '', toLevel: 2 },
      { kind: 'boon' as const, key: 'agility', name: '', desc: '', toLevel: 4 },
    ];
    expect(pickAutoOfferIndex(w, offers)).toBe(2);
  });

  it('falls back to the first offered card when none of the offers is already owned', () => {
    const w = act2World();
    w.boonRanks = {};
    const offers = [
      { kind: 'boon' as const, key: 'vitality', name: '', desc: '', toLevel: 1 },
      { kind: 'boon' as const, key: 'power', name: '', desc: '', toLevel: 1 },
    ];
    expect(pickAutoOfferIndex(w, offers)).toBe(0);
  });

  it('resolves a level-up the instant it is rolled, never leaving the run in the levelup phase', () => {
    const w = act2World();
    w.cfg.autoPickLevelUps = true;
    addXp(w, xpToReach(2));
    // The run loop calls this once per tick (src/sim/run.ts); addXp itself
    // only queues the level-up.
    openLevelUpIfPending(w);
    expect(w.phase).toBe('act2');
    expect(w.pendingLevelUps).toBe(0);
    expect(w.offers).toEqual([]);
    expect(Object.keys(w.boonRanks).length).toBeGreaterThan(0);
  });

  it('resolves every queued level-up from a single multi-level XP grant, still never pausing', () => {
    const w = act2World();
    w.cfg.autoPickLevelUps = true;
    // Enough XP for several level-ups landing on the same addXp call, the
    // same shape a big XP-to-gold overflow or a boss kill can produce.
    addXp(w, xpToReach(2) + xpToReach(3) + xpToReach(4));
    openLevelUpIfPending(w);
    expect(w.level).toBe(4);
    expect(w.phase).toBe('act2');
    expect(w.pendingLevelUps).toBe(0);
  });

  it('the set_autopick Command flips the toggle mid-run, exactly like a Settings write is not allowed to', () => {
    const w = act2World();
    expect(w.cfg.autoPickLevelUps).not.toBe(true);
    applyCommand(w, { k: 'set_autopick', on: true });
    expect(w.cfg.autoPickLevelUps).toBe(true);
    addXp(w, xpToReach(2));
    openLevelUpIfPending(w);
    expect(w.phase).toBe('act2');
    applyCommand(w, { k: 'set_autopick', on: false });
    addXp(w, xpToReach(3));
    openLevelUpIfPending(w);
    expect(w.phase).toBe('levelup');
  });

  it('a manual pick still works normally with the toggle off', () => {
    const w = act2World();
    addXp(w, xpToReach(2));
    openLevelUpIfPending(w);
    expect(w.phase).toBe('levelup');
    expect(w.offers.length).toBeGreaterThan(0);
    expect(takeOffer(w, 0)).toBe(true);
    expect(w.phase).toBe('act2');
  });

  it('flipping the toggle on while a manual offer is already up resolves it immediately, never leaving the run parked in levelup', () => {
    const w = act2World();
    addXp(w, xpToReach(2));
    openLevelUpIfPending(w);
    expect(w.phase).toBe('levelup');
    expect(w.offers.length).toBeGreaterThan(0);
    applyCommand(w, { k: 'set_autopick', on: true });
    expect(w.phase).toBe('act2');
    expect(w.offers).toEqual([]);
    expect(Object.keys(w.boonRanks).length).toBeGreaterThan(0);
  });

  it('a set_autopick Command mutates only the World copy of RunConfig, never the caller-supplied object (code review finding)', () => {
    const config = cfg({ seed: 1 });
    const runA = new World(config);
    applyCommand(runA, { k: 'set_autopick', on: true });
    expect(runA.cfg.autoPickLevelUps).toBe(true);
    expect(config.autoPickLevelUps).not.toBe(true);
    const runB = new World(config);
    expect(runB.cfg.autoPickLevelUps).not.toBe(true);
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
