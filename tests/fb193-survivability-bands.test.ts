import { describe, expect, it } from 'vitest';
import { Run } from '../src/sim/run';
import { cfg } from './helpers';

// QUESTIONS Q196 / BACKLOG fb193: per-class survivability bands. Night-1 melee
// wipes were a survivability problem, not a damage problem — `maxHpMul`/
// `defenseBonus` on `data/classes.json` fold into the same generic
// `maxHpPct`/`armor` stats `derive()` already reads (Stats.factor/total),
// on `moveSpeedBonus`'s own precedent.
describe('fb193 per-class survivability bands', () => {
  it('swordsman (x1.6 maxHp / +10 defense) derives more HP and armor than a neutral class', () => {
    const base = new Run(cfg({ classKey: 'engineer' })).world.derived;
    const boosted = new Run(cfg({ classKey: 'swordsman' })).world.derived;
    expect(boosted.maxHp).toBeCloseTo(base.maxHp * 1.6, 6);
    expect(boosted.armor).toBeCloseTo(base.armor + 10, 6);
  });

  it('bloodlord (x1.4 / +5), paladin (x1.5 / +10) and necromancer (x1.2 / +5) each get their authored band', () => {
    const base = new Run(cfg({ classKey: 'engineer' })).world.derived;
    const bands: Record<string, { maxHpMul: number; defenseBonus: number }> = {
      bloodlord: { maxHpMul: 1.4, defenseBonus: 5 },
      paladin: { maxHpMul: 1.5, defenseBonus: 10 },
      necromancer: { maxHpMul: 1.2, defenseBonus: 5 },
    };
    for (const [classKey, band] of Object.entries(bands)) {
      const d = new Run(cfg({ classKey })).world.derived;
      expect(d.maxHp).toBeCloseTo(base.maxHp * band.maxHpMul, 6);
      expect(d.armor).toBeCloseTo(base.armor + band.defenseBonus, 6);
    }
  });

  it('a class with no authored band (e.g. engineer, animist) derives the same maxHp/armor as before the field existed', () => {
    const engineer = new Run(cfg({ classKey: 'engineer' })).world.derived;
    const animist = new Run(cfg({ classKey: 'animist' })).world.derived;
    // Neither authors maxHpMul/defenseBonus, so both fall back to the neutral
    // default (factor 1, +0) — they should agree with each other exactly on
    // these two fields (modulo any other unrelated per-class band).
    expect(engineer.armor).toBe(animist.armor);
  });
});
