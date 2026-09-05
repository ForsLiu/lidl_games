/** Act II rules: XP curve, weapons, gems, level-up offers, spawn director. */

import { describe, expect, it } from 'vitest';

import { World } from '../src/sim/world';
import { spawnEnemy } from '../src/sim/enemies';
import {
  addXp,
  applyOffer,
  openLevelUpIfPending,
  pickAutoOfferIndex,
  rollOffers,
  takeOffer,
  typeMasteryMul,
  updateGems,
  xpToReach,
} from '../src/sim/progression';
import { budgetFor, pickSpawnPoint, timeHpScale } from '../src/sim/act2';
import { applyCommand } from '../src/sim/run';
import { buildTower } from '../src/sim/towers';
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

  it('applies a boon offer and its stat', () => {
    const w = act2World();
    const before = w.derived.powerMul;
    w.phase = 'levelup';
    w.offers = [{ kind: 'boon', key: 'power', name: '', desc: '', toLevel: 1 }];
    takeOffer(w, 0);
    expect(w.boonRanks.power).toBe(1);
    expect(w.derived.powerMul).toBeCloseTo(before + 0.1, 6);
  });

  // qa-playtester finding (p7a): a forged offer that jumps several ranks at
  // once used to leave `boonRanks` reporting the full jump while `Stats`
  // only ever credited one rank's worth (`addAll` always added `perRank`
  // regardless of how far `toLevel` actually moved) — fixed by scaling the
  // addAll call by the real rank delta.
  it('a forged multi-rank jump credits Stats for every rank gained, not just one', () => {
    const w = act2World();
    const boon = w.content.boons.statBoons.find((b) => b.key === 'power')!;
    const before = w.derived.powerMul;
    applyOffer(w, { kind: 'boon', key: 'power', name: '', desc: '', toLevel: 5 });
    expect(w.boonRanks.power).toBe(5);
    expect(w.derived.powerMul).toBeCloseTo(before + boon.perRank * 5, 10);
  });

  // fb041 (QUESTIONS Q144(1) OVERRIDE): the owner's standing instruction is
  // no rank caps on VS stat boons or Type Mastery — a stat boon and a Type
  // Mastery card both keep appearing (and stacking) in offers past their
  // authored `maxRank`, which now serves only as the historical/display
  // reference rank. Skill cards are unaffected by this override and keep
  // their listed caps (see the skill-card test below).
  it('keeps offering a stat boon past its rank x5 reference rank (fb041: uncapped)', () => {
    const w = act2World();
    for (const b of w.content.boons.statBoons) w.boonRanks[b.key] = b.maxRank;
    let sawBoonPastMax = false;
    for (let i = 0; i < 50; i++) {
      for (const o of rollOffers(w)) {
        if (o.kind === 'boon') sawBoonPastMax = true;
      }
    }
    expect(sawBoonPastMax).toBe(true);
  });

  it('a stat boon can be taken 10+ times, stacking additively within itself per §2', () => {
    const w = act2World();
    const boon = w.content.boons.statBoons.find((b) => b.key === 'power')!;
    for (let r = 1; r <= 10; r++) {
      applyOffer(w, { kind: 'boon', key: 'power', name: '', desc: '', toLevel: r });
    }
    expect(w.boonRanks.power).toBe(10);
    expect(w.derived.powerMul).toBeCloseTo(1 + boon.perRank * 10, 10);
    // The pool still offers rank 11 — never exhausts on rank alone.
    let offeredRank11 = false;
    for (let i = 0; i < 50; i++) {
      if (rollOffers(w).some((o) => o.kind === 'boon' && o.key === 'power' && o.toLevel === 11)) {
        offeredRank11 = true;
        break;
      }
    }
    expect(offeredRank11).toBe(true);
  });

  it('offers Type Mastery only for tower types actually built, and keeps offering it past rank x3 (fb041: uncapped)', () => {
    const w = act2World();
    w.gold = 9999;
    const built = buildTower(w, w.content.towerByKey.get('arrow_spire')!.id, 18, 9, { ignorePhase: true });
    expect(built.ok).toBe(true);
    for (let i = 0; i < 50; i++) {
      for (const o of rollOffers(w)) {
        if (o.kind !== 'type_mastery') continue;
        expect(o.towerKey).toBe('arrow_spire');
      }
    }
    w.typeMasteryRanks.arrow_spire = w.content.boons.typeMastery.maxRank;
    let sawMasteryPastMax = false;
    for (let i = 0; i < 50; i++) {
      if (rollOffers(w).some((o) => o.kind === 'type_mastery')) sawMasteryPastMax = true;
    }
    expect(sawMasteryPastMax).toBe(true);
  });

  it('a Type Mastery card can be taken 10+ times', () => {
    const w = act2World();
    w.gold = 9999;
    const built = buildTower(w, w.content.towerByKey.get('arrow_spire')!.id, 18, 9, { ignorePhase: true });
    expect(built.ok).toBe(true);
    for (let r = 1; r <= 10; r++) {
      applyOffer(w, {
        kind: 'type_mastery',
        key: 'arrow_spire',
        name: '',
        desc: '',
        toLevel: r,
        towerKey: 'arrow_spire',
      });
    }
    expect(w.typeMasteryRanks.arrow_spire).toBe(10);
    expect(typeMasteryMul(w, 'arrow_spire')).toBeCloseTo(1 + w.content.boons.typeMastery.perRank * 10, 10);
  });

  it('applies a Type Mastery offer as a VS-damage multiplier for that type only', () => {
    const w = act2World();
    w.phase = 'levelup';
    w.offers = [{ kind: 'type_mastery', key: 'arrow_spire', name: '', desc: '', toLevel: 1, towerKey: 'arrow_spire' }];
    takeOffer(w, 0);
    expect(w.typeMasteryRanks.arrow_spire).toBe(1);
    expect(typeMasteryMul(w, 'arrow_spire')).toBeCloseTo(1 + w.content.boons.typeMastery.perRank, 10);
    expect(typeMasteryMul(w, 'ember_brazier')).toBe(1);
  });

  it('offers exactly the 3 skill cards belonging to the run class, never another class’s', () => {
    const w = act2World();
    const own = new Set(w.content.boons.skillCards[w.cfg.classKey]!.map((c) => c.key));
    for (let i = 0; i < 50; i++) {
      for (const o of rollOffers(w)) {
        if (o.kind !== 'skill_card') continue;
        expect(own.has(o.key)).toBe(true);
      }
    }
  });

  it('applies a skill card offer to its own rank map, clamped to its own rank x2', () => {
    const w = act2World();
    const card = w.content.boons.skillCards[w.cfg.classKey]!.find((c) => c.effect === 'active1_potency')!;
    applyOffer(w, { kind: 'skill_card', key: card.key, name: '', desc: '', toLevel: 1 });
    expect(w.skillCardRanks[card.key]).toBe(1);
    // A forged offer past maxRank (BACKLOG b011's shape) clamps, not overflows.
    applyOffer(w, { kind: 'skill_card', key: card.key, name: '', desc: '', toLevel: 99 });
    expect(w.skillCardRanks[card.key]).toBe(card.maxRank);
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
    expect(e.maxHp).toBeCloseTo(
      def.hp * w.content.enemies.baseHpMul * w.content.spawns.hpOverlay * w.content.spawns.actIICarry,
      5,
    );
    expect(e.speed).toBeCloseTo(def.speed * w.content.spawns.speedOverlay, 5);
  });
});
