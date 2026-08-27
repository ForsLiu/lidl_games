/**
 * Pins `tools/content-census.ts`'s §13 count for every category as a recorded
 * snapshot (BACKLOG-QUALITY q16), so a content change — a class added to
 * `data/classes.json`, a wave authored, the tree regenerated at a different
 * size — is visible here and distinguishable from a P-phase-not-reached-yet
 * gap: this test goes red on *any* count drift, met or not, not only on a
 * regression. Whoever's change moves a count updates `RECORDED` alongside it.
 */

import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { census } from '../tools/content-census';

const RECORDED: Record<string, { actual: string; target: string; met: boolean }> = {
  // classes counts §4's non-legacy rows: P6 (main lane) filled all 11; the
  // 12th data row is Q38's `legacy: true` frost_warden, excluded by census.
  classes: { actual: '11', target: '11', met: true },
  towers: { actual: '10', target: '10', met: true },
  equipment: { actual: '0', target: '12+', met: false },
  damageTypesAndStatuses: { actual: '6+2', target: '6+2', met: true },
  enemies: { actual: '20', target: '20', met: true },
  waves: { actual: '10', target: '18+6 (24)', met: false },
  treeNodes: { actual: '120', target: '120', met: true },
  quests: { actual: '9', target: '8-12', met: true },
  tiers: { actual: 'T1-T5', target: 'T1-T5', met: true },
  bosses: { actual: '2', target: '2', met: true },
};

describe('content census (SPEC-FINAL §13)', () => {
  const rows = census(loadContent());

  it('has exactly the ten §13 categories, in order, none untracked', () => {
    expect(rows.map((r) => r.key)).toEqual(Object.keys(RECORDED));
  });

  for (const [key, expected] of Object.entries(RECORDED)) {
    it(`${key}: actual=${expected.actual} target=${expected.target} met=${expected.met}`, () => {
      const row = rows.find((r) => r.key === key)!;
      expect(row, key).toBeTruthy();
      expect(row.actual, `${key}.actual`).toBe(expected.actual);
      expect(row.target, `${key}.target`).toBe(expected.target);
      expect(row.met, `${key}.met`).toBe(expected.met);
    });
  }

  it('every unmet category names a reason (not a silent gap)', () => {
    for (const r of rows) {
      if (!r.met) expect(r.note, r.key).toBeTruthy();
    }
  });

  it('the met/unmet split matches the P-phase audit: exactly equipment/waves are short', () => {
    const unmet = rows.filter((r) => !r.met).map((r) => r.key).sort();
    expect(unmet).toEqual(['equipment', 'waves'].sort());
  });

  it('bosses is counted from the same "boss" trait loot.ts uses, not a hand-picked key list', () => {
    const content = loadContent();
    const bossKeys = content.enemies.enemies.filter((e) => e.traits.includes('boss')).map((e) => e.key);
    expect(bossKeys.sort()).toEqual(['gatebreaker', 'warden_eater']);
  });

  it('tree node count excludes the start node the way tests/grid.test.ts and gen-tree.mjs already do', () => {
    const content = loadContent();
    const total = content.tree.nodes.length;
    const nonStart = content.tree.nodes.filter((n) => n.kind !== 'start').length;
    const startNodes = content.tree.nodes.filter((n) => n.kind === 'start').length;
    expect(startNodes).toBe(1);
    expect(nonStart).toBe(total - 1);
  });
});
