/**
 * p13a — QUESTIONS Q196 ORDER (owner verdicts Q168-Q205): per-class
 * survivability bands. `data/classes.json` gained two new required fields,
 * `maxHpMul` and `defenseBonus`, read the same way `moveSpeedBonus` already
 * is — one more `baseRunStats` (`src/sim/stats.ts`) source folded into the
 * generic `maxHpPct`/`armor` stat keys, not a bespoke engine path. Authored
 * ⚖: swordsman x1.6/+10, bloodlord x1.4/+5, paladin x1.5/+10 (on top of
 * Guardian Stance), necromancer x1.2/+5; every other class x1.0/+0, which
 * this file pins as inert by construction (a `maxHpMul` of 1 contributes no
 * `maxHpPct` source at all, and a zero `defenseBonus` contributes no `armor`
 * source at all — `baseRunStats`'s own `if` guards, mirroring the existing
 * `if (cls.moveSpeedBonus)` guard one line above them).
 *
 * The re-measurement this item's acceptance also asks for — did the bands
 * move G8 for swordsman/necromancer/engineer — is recorded in
 * `tests/p6e-class-diversity.test.ts`'s own `.skip` comments, not here: this
 * file only pins the mechanism (the fields load, apply to the right stat,
 * and are inert at their shipped default), which is a fast, stat-level
 * check, not a 12-seed scripted-kit sweep.
 */
import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { derive, BASE } from '../src/sim/stats';
import { cfg } from './helpers';
import { baseRunStats } from '../src/sim/stats';

const content = loadContent();

/** One class, no equipment/tree — isolates the survivability-band source from every other `maxHpPct`/`armor` contributor. */
function deriveBare(classKey: string) {
  const s = baseRunStats(content, cfg({ classKey }));
  return derive(content, s, 1);
}

describe('p13a: per-class survivability bands load and apply (QUESTIONS Q196)', () => {
  it('all 12 classes carry the authored fields', () => {
    expect(content.classes.classes).toHaveLength(12);
    for (const cls of content.classes.classes) {
      expect(cls.maxHpMul, cls.key).toBeGreaterThan(0);
      expect(Number.isFinite(cls.defenseBonus), cls.key).toBe(true);
    }
  });

  it('the four elevated classes ship the owner-authored bands exactly', () => {
    const byKey = new Map(content.classes.classes.map((c) => [c.key, c]));
    expect(byKey.get('swordsman')).toMatchObject({ maxHpMul: 1.6, defenseBonus: 10 });
    expect(byKey.get('bloodlord')).toMatchObject({ maxHpMul: 1.4, defenseBonus: 5 });
    expect(byKey.get('paladin')).toMatchObject({ maxHpMul: 1.5, defenseBonus: 10 });
    expect(byKey.get('necromancer')).toMatchObject({ maxHpMul: 1.2, defenseBonus: 5 });
  });

  it('every other class is inert at x1.0/+0', () => {
    const elevated = new Set(['swordsman', 'bloodlord', 'paladin', 'necromancer']);
    for (const cls of content.classes.classes) {
      if (elevated.has(cls.key)) continue;
      expect(cls.maxHpMul, cls.key).toBe(1.0);
      expect(cls.defenseBonus, cls.key).toBe(0);
    }
  });

  it('maxHp/armor scale by exactly the authored band, with no other stat source present', () => {
    for (const cls of content.classes.classes) {
      const d = deriveBare(cls.key);
      const expectedArmor = BASE.armor + cls.defenseBonus;
      const expectedMaxHp = Math.max(content.modifiers.numberScale, content.warden.maxHp * cls.maxHpMul);
      expect(d.armor, cls.key).toBeCloseTo(expectedArmor, 9);
      expect(d.maxHp, cls.key).toBeCloseTo(expectedMaxHp, 9);
    }
  });

  it('an inert class (x1.0/+0) is byte-identical to the pre-p13a maxHp/armor formula', () => {
    // engineer is one of the eight classes left at the default — this is the
    // exact no-op control p13a's own item text promised for the eight/twelve
    // classes it does not touch.
    const d = deriveBare('engineer');
    expect(d.armor).toBe(BASE.armor);
    expect(d.maxHp).toBe(Math.max(content.modifiers.numberScale, content.warden.maxHp));
  });

  it('the survivability band composes multiplicatively with an independent maxHpPct source (equipment/tree), not additively', () => {
    // swordsman (x1.6) plus a synthetic +25% maxHpPct source should read
    // 1.6 * 1.25 = 2.0, the same cross-source product `factor()` already
    // gives every other `*Pct` stat (Stats.factor, src/sim/stats.ts) --
    // never 1.6 + 0.25 = 1.85.
    const s = baseRunStats(content, cfg({ classKey: 'swordsman' }));
    s.add('test:synthetic', 'maxHpPct', 0.25);
    const d = derive(content, s, 1);
    expect(d.maxHp).toBeCloseTo(content.warden.maxHp * 1.6 * 1.25, 9);
  });
});
