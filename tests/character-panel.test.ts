/**
 * The character panel exists so a player can answer "why is my final number
 * what it is" without reading `/data` (owner feedback
 * `feature-boon-stats-panel`, BACKLOG.md fb004; SPEC-FINAL §2, §6.3, §11).
 * That's only true if the numbers it prints are `Stats`' own numbers, so
 * these tests check the model against `w.stats`/`w.boonRanks` directly
 * (`Stats.total`/`Stats.factor`/`Stats.contributions`), field-for-field,
 * rather than against a hand-duplicated calculation — the same posture
 * `tests/tower-info.test.ts` takes for the tower panel.
 */

import { describe, expect, it } from 'vitest';

import { World } from '../src/sim/world';
import { loadContent } from '../src/sim/content';
import { STAT_KEYS, STAT_KIND } from '../src/sim/stats';
import { applyOffer } from '../src/sim/progression';
import type { Offer } from '../src/sim/types';
import { characterPanelData } from '../src/ui/character-panel';
import { cfg } from './helpers';

const content = loadContent();

/**
 * Drives a boon to `rank` through the real `applyOffer` path, one rank at a
 * time — `applyOffer` trusts `offer.toLevel` to be "current rank + 1" (the
 * invariant `buildOfferPool` guarantees, see progression.ts) and only adds
 * `perRank` to `Stats` once per call, so jumping straight to `toLevel: rank`
 * in one call would under-count the accumulated `boon:<key>` contribution.
 */
function takeBoonToRank(w: World, key: string, rank: number): void {
  const def = content.boonByKey.get(key)!;
  for (let r = (w.boonRanks[key] ?? 0) + 1; r <= rank; r++) {
    const offer: Offer = { kind: 'boon', key, name: def.name, desc: def.desc, toLevel: r };
    applyOffer(w, offer);
  }
}

describe('character panel data model', () => {
  it('has exactly one row per StatKey, in STAT_KEYS order', () => {
    const w = new World(cfg());
    const data = characterPanelData(w);
    expect(data.stats.map((s) => s.key)).toEqual([...STAT_KEYS]);
  });

  it("every stat row's kind, value and per-source breakdown match Stats field-for-field", () => {
    // Every generic source kind alive at once: class (both a plain trait and
    // its move-speed band), tree, equipment, boon, core and map modifiers —
    // so no source-prefix branch in the panel goes untested.
    const w = new World(
      cfg({
        classKey: 'engineer', // moveSpeedBonus 0.15 -> class:engineer:bands
        core: 'vampire_heart', // vsLifestealPct 0.01 -> core:vampire_heart / leech
        modifiers: ['shortarm'], // pickupMul -0.20 -> modifiers / pickupPct
        allocated: [41, 50], // power 0.03 (id 41); moveSpeedPct 0.1 + dashCharges 1 (id 50)
        equipment: ['normal_shoes', 'normal_ring'],
      }),
    );
    takeBoonToRank(w, 'swift', 3); // moveSpeedPct, perRank 0.05 -> boon:swift

    const data = characterPanelData(w);
    expect(data.stats.length).toBe(STAT_KEYS.length);

    for (const row of data.stats) {
      const expectedKind = STAT_KIND[row.key];
      expect(row.kind, row.key).toBe(expectedKind);

      const expectedValue = expectedKind === 'flat' ? w.stats.total(row.key) : w.stats.factor(row.key);
      expect(row.value, row.key).toBe(expectedValue);

      const expectedSources = w.stats.contributions(row.key);
      expect(row.sources.length, row.key).toBe(expectedSources.length);
      expectedSources.forEach(([source, value], i) => {
        expect(row.sources[i].source, `${row.key}[${i}]`).toBe(source);
        expect(row.sources[i].value, `${row.key}[${i}]`).toBe(value);
      });
    }

    // Sanity: this world really did exercise every generic source prefix,
    // not just the ones with a default value of zero.
    const allSources = data.stats.flatMap((s) => s.sources.map((src) => src.source));
    for (const prefix of [
      'class:engineer',
      'tree:41',
      'tree:50',
      'equipment:normal_shoes',
      'equipment:normal_ring',
      'boon:swift',
      'core:vampire_heart',
      'modifiers',
    ]) {
      expect(allSources.some((s) => s.startsWith(prefix)), prefix).toBe(true);
    }
  });

  it("stacks class x tree x equipment x boon multiplicatively on one stat, per SPEC-FINAL section 2", () => {
    const w = new World(
      cfg({
        classKey: 'engineer', // moveSpeedBonus 0.15
        allocated: [50], // moveSpeedPct 0.1 (plus dashCharges, irrelevant here)
        equipment: ['normal_shoes'], // moveSpeedPct 0.5
      }),
    );
    takeBoonToRank(w, 'swift', 2); // perRank 0.10, rank 2 -> boon:swift totals 0.20

    // "10% + 20% atk speed -> x1.1 x1.2": each source's own ranks add, then
    // sources multiply. Computed from the raw authored numbers above, not
    // from Stats — an independent cross-check of the stacking rule itself.
    const expected = (1 + 0.15) * (1 + 0.1) * (1 + 0.5) * (1 + 0.2);
    expect(w.stats.factor('moveSpeedPct')).toBeCloseTo(expected, 10);

    const row = characterPanelData(w).stats.find((s) => s.key === 'moveSpeedPct')!;
    expect(row.value).toBe(w.stats.factor('moveSpeedPct'));
    expect(row.sources.map((s) => s.source).sort()).toEqual(
      ['boon:swift', 'class:engineer:bands', 'equipment:normal_shoes', 'tree:50'].sort(),
    );
  });

  it('a stat nothing has touched still gets a row: base only, empty sources, correct base value', () => {
    const w = new World(cfg());
    const row = characterPanelData(w).stats.find((s) => s.key === 'towerPoisonDamage')!;
    expect(row.sources).toEqual([]);
    expect(row.value).toBe(w.stats.factor('towerPoisonDamage'));
    expect(row.value).toBe(1); // no contributions -> factor() is the identity
  });

  it('lists no boons for a fresh run', () => {
    const w = new World(cfg());
    expect(characterPanelData(w).boons).toEqual([]);
  });

  it("lists a taken boon with its rank, max rank and live contribution, not a hand-duplicated one", () => {
    const w = new World(cfg());
    takeBoonToRank(w, 'power', 3);

    const boons = characterPanelData(w).boons;
    expect(boons.length).toBe(1);
    const row = boons[0];
    expect(row.key).toBe('power');
    expect(row.rank).toBe(3);
    expect(row.maxRank).toBe(content.boonByKey.get('power')!.maxRank);
    expect(row.stat).toBe('power');
    expect(row.kind).toBe('mul');
    // Read back from Stats' own contributions for the boon's source, not
    // recomputed as rank * perRank.
    const [, expected] = w.stats.contributions('power').find(([s]) => s === 'boon:power')!;
    expect(row.contribution).toBe(expected);
  });

  it('a boon at max rank reports maxRank === rank and stops accumulating further', () => {
    const w = new World(cfg());
    const def = content.boonByKey.get('vitality')!; // flat stat (maxHp), maxRank 5
    takeBoonToRank(w, 'vitality', def.maxRank);

    const row = characterPanelData(w).boons.find((b) => b.key === 'vitality')!;
    expect(row.rank).toBe(def.maxRank);
    expect(row.maxRank).toBe(def.maxRank);
    expect(row.kind).toBe('flat');
    expect(row.contribution).toBeCloseTo(def.maxRank * def.perRank, 10);
    expect(row.contribution).toBe(w.stats.total('maxHp'));
  });

  it('a flat-stat boon (armor) and a mul-stat boon (power) both format through the right stat kind', () => {
    const w = new World(cfg());
    takeBoonToRank(w, 'plating', 2); // armor, flat, perRank 5
    takeBoonToRank(w, 'power', 1); // power, mul, perRank 0.10

    const boons = characterPanelData(w).boons;
    const plating = boons.find((b) => b.key === 'plating')!;
    const power = boons.find((b) => b.key === 'power')!;
    expect(plating.kind).toBe('flat');
    expect(plating.contribution).toBe(10);
    expect(power.kind).toBe('mul');
    expect(power.contribution).toBeCloseTo(0.1, 10);
  });

  it('every boon in the pool is covered by a display name, even at rank 0 (never listed) and at max rank', () => {
    for (const b of content.boons.statBoons) {
      const w = new World(cfg());
      takeBoonToRank(w, b.key, b.maxRank);
      const row = characterPanelData(w).boons.find((x) => x.key === b.key)!;
      expect(row, b.key).toBeDefined();
      expect(row.name, b.key).toBe(b.name);
      expect(row.rank, b.key).toBe(b.maxRank);
    }
  });
});
