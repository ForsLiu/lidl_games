/**
 * BACKLOG p12b (BALANCE DIRECTION v2 §B): the tier ladder's three difficulty
 * scalars — enemy HP, director budget and enemy `coreDamage` — each applied
 * as `x^(tier - 1)`.
 *
 * Before p12b the only thing `cfg.tier` scaled directly was the final boss's
 * HP; every other tier difference came from the 1-of-2 *drafted* modifiers,
 * which are random draws, so a tier was a distribution rather than a rung.
 * §B moves the reference gates to T3, which needs deterministic rungs.
 *
 * The load-bearing invariant here is **T1 is exactly 1.0 on all three**: every
 * existing T1 measurement in the repo (G1's 33.4-minute mean, G8's per-class
 * rows, BALANCE.md's tables) has to keep its meaning across this item.
 */
import { describe, expect, it } from 'vitest';

import { loadContent, validateTierLadder } from '../src/sim/content';
import { attackStructure, contactWarden, enemyCoreDamage, leakIntoCore, spawnEnemy } from '../src/sim/enemies';
import type { EnemyDef } from '../src/sim/content';
import { buildTower } from '../src/sim/towers';
import { budgetFor } from '../src/sim/act2';
import { tierBudgetMul, tierCoreDamageMul, tierEnemyHpMul, MAX_TIER } from '../src/sim/tiers';
import { World } from '../src/sim/world';
import { allTreeNodeIds } from '../src/meta/meta';
import { cfg, runScripted } from './helpers';
import '../src/bots';

const content = loadContent();
const FULL_TREE = allTreeNodeIds(content);

describe('p12b — the tier ladder is 1.0 at T1 and steepens from there', () => {
  it('every scalar is exactly 1 at T1, so existing T1 measurements still mean what they meant', () => {
    expect(tierEnemyHpMul(content, 1)).toBe(1);
    expect(tierBudgetMul(content, 1)).toBe(1);
    expect(tierCoreDamageMul(content, 1)).toBe(1);
  });

  it('matches §B’s authored rungs at T3 and T5', () => {
    const hp = content.modifiers.tierEnemyHpPerStep;
    const budget = content.modifiers.tierBudgetPerStep;
    const core = content.modifiers.tierCoreDamagePerStep;
    expect(tierEnemyHpMul(content, 3)).toBeCloseTo(hp ** 2, 10);
    expect(tierBudgetMul(content, 3)).toBeCloseTo(budget ** 2, 10);
    expect(tierCoreDamageMul(content, 3)).toBeCloseTo(core ** 2, 10);
    expect(tierEnemyHpMul(content, 5)).toBeCloseTo(hp ** 4, 10);
  });

  it('is monotonic across the whole ladder — a tier step never makes the run easier', () => {
    for (const mul of [tierEnemyHpMul, tierBudgetMul, tierCoreDamageMul]) {
      for (let t = 2; t <= MAX_TIER; t++) {
        expect(mul(content, t), `tier ${t}`).toBeGreaterThanOrEqual(mul(content, t - 1));
      }
    }
    // Past the top rung the ladder clamps rather than running away, the same
    // way `modifierDraft` clamps its slot count to MAX_TIER.
    expect(tierEnemyHpMul(content, 99)).toBeCloseTo(tierEnemyHpMul(content, MAX_TIER), 10);
  });
});

describe('p12b — the rungs are live in the sim, not just in the accessor', () => {
  function husk(tier: number) {
    const w = new World(cfg({ tier, practice: true }));
    const e = spawnEnemy(w, 'husk', 10, 10)!;
    return { w, e };
  }

  it('enemy HP at spawn carries the tier rung', () => {
    const t1 = husk(1);
    const t3 = husk(3);
    expect(t3.e.maxHp / t1.e.maxHp).toBeCloseTo(tierEnemyHpMul(content, 3), 6);
    expect(t3.e.hp).toBe(t3.e.maxHp);
  });

  it('enemy coreDamage carries the tier rung, through the one shared accessor', () => {
    const t1 = husk(1);
    const t5 = husk(5);
    const def = content.enemies.enemies.find((d) => d.key === 'husk')!;
    expect(enemyCoreDamage(t1.w, def)).toBeCloseTo(def.coreDamage, 6);
    expect(enemyCoreDamage(t5.w, def) / enemyCoreDamage(t1.w, def)).toBeCloseTo(tierCoreDamageMul(content, 5), 6);
  });

  it('a Core leak actually costs the tier-scaled amount, not the authored one', () => {
    // code-reviewer m6: without this, reverting `leakIntoCore` to a raw
    // `def.coreDamage` passed the whole suite — the accessor was tested but
    // its call sites were not. Drives the real leak path rather than calling
    // the accessor twice.
    const def = content.enemies.enemies.find((d) => d.key === 'husk')!;
    const leak = (tier: number): number => {
      const w = new World(cfg({ tier, practice: true }));
      const e = spawnEnemy(w, 'husk', 10, 10)!;
      const before = w.coreHp;
      leakIntoCore(w, e, def);
      return before - w.coreHp;
    };
    expect(leak(1)).toBeCloseTo(def.coreDamage, 6);
    expect(leak(3)).toBeCloseTo(def.coreDamage * tierCoreDamageMul(content, 3), 6);
  });

  it('a Warden contact hit and a structure attack carry the rung too', () => {
    // qa-playtester: the leak case below pinned one of `enemyCoreDamage`'s
    // four consumers; reverting either of these two to a raw `def.coreDamage`
    // was invisible to the whole suite. Both are driven through the real
    // paths rather than by calling the accessor twice.
    const contact = (tier: number): number => {
      const w = new World(cfg({ tier, practice: true }));
      w.phase = 'act2';
      const e = spawnEnemy(w, 'husk', w.warden.x, w.warden.y)!;
      e.attackCooldown = 0;
      w.rebuildBuckets();
      const before = w.warden.hp;
      contactWarden(w, e, e.def as EnemyDef);
      return before - w.warden.hp;
    };
    expect(contact(3) / contact(1)).toBeCloseTo(tierCoreDamageMul(content, 3), 6);

    const structure = (tier: number): number => {
      const w = new World(cfg({ tier, practice: true }));
      w.gold = 1e6;
      // Build range is measured from the Warden, so put it next to the tile.
      w.warden.x = 10;
      w.warden.y = 10;
      const built = buildTower(w, content.towerByKey.get('palisade')!.id, 10, 11);
      expect(built.ok, JSON.stringify(built)).toBe(true);
      const s = w.structures[0];
      const e = spawnEnemy(w, 'husk', 10, 12)!;
      const before = s.hp;
      attackStructure(w, e, e.def as EnemyDef, s, 1);
      return before - s.hp;
    };
    expect(structure(3) / structure(1)).toBeCloseTo(tierCoreDamageMul(content, 3), 6);
  });

  it('the Act II director budget carries the tier rung', () => {
    const at = (tier: number): number => {
      const w = new World(cfg({ tier, practice: true }));
      w.phase = 'act2';
      w.act2Time = 30;
      return budgetFor(w);
    };
    expect(at(3) / at(1)).toBeCloseTo(tierBudgetMul(content, 3), 6);
  });
});

describe('p12b — the loader refuses a ladder that inverts', () => {
  it('rejects a per-step scalar under 1, rather than shipping a T5 easier than T1', () => {
    const base = content.modifiers;
    expect(() => validateTierLadder({ ...base, tierEnemyHpPerStep: 0.9 })).toThrow(/tierEnemyHpPerStep/);
    expect(() => validateTierLadder({ ...base, tierBudgetPerStep: 0 })).toThrow(/tierBudgetPerStep/);
    expect(() => validateTierLadder({ ...base, tierCoreDamagePerStep: Number.NaN })).toThrow(
      /tierCoreDamagePerStep/,
    );
  });

  it('accepts the shipped ladder', () => {
    expect(() => validateTierLadder(content.modifiers)).not.toThrow();
  });
});

/**
 * qa-playtester (p12b): the top of the ladder is not merely hard, it is
 * **non-functional** — at T4 the scripted bot dies in Act I wave 1 with 0-5
 * kills, at T5 with 0 kills on most seeds, and since a tier unlocks only by
 * winning the one below it, T5 is unreachable in normal play.
 *
 * This is a *liveness* gate, not a win-rate gate: a rung may be brutal, but a
 * rung where nothing dies is broken content. It is cheap precisely because
 * the broken rungs fail fast. Currently RED at T4/T5 and `.skip`-ed with the
 * measured shape, per CLAUDE.md's skip discipline — **p12g** owns replacing
 * the geometric ladder with a per-tier table that can place T4 and T5
 * independently rather than extrapolating them off T3.
 */
describe('p12b — every rung is playable, not just survivable', () => {
  it.skip('every tier clears at least one wave and scores at least one kill', () => {
    const rows = [1, 2, 3, 4, 5].map((tier) => {
      const reports = [1, 2, 3].map(
        (seed) =>
          runScripted(
            { seed, classKey: 'engineer', tier, modifiers: [], allocated: FULL_TREE },
            'hybrid',
            60 * 60 * 45,
          ).report,
      );
      return {
        tier,
        waves: Math.max(...reports.map((r) => r.wavesCleared)),
        kills: Math.max(...reports.map((r) => r.kills)),
      };
    });
    const detail = rows.map((r) => `T${r.tier}: waves ${r.waves}, kills ${r.kills}`).join(' | ');
    for (const r of rows) {
      expect(r.waves, detail).toBeGreaterThanOrEqual(1);
      expect(r.kills, detail).toBeGreaterThan(0);
    }
  }, 30 * 60 * 1000);
});
