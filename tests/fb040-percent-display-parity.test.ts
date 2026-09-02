/**
 * fb040 (QUESTIONS Q142): `tree-view.ts`'s `describeStat` used to classify
 * percent-vs-flat display via its own hand-maintained `PERCENT_STATS` set
 * instead of `STAT_DISPLAY` (the canonical display-intent classification the
 * in-run character panel already keys off via `modIsPct`/`formatStatValue`,
 * per b021) — a second source of truth free to drift from the first. Fixed
 * by pointing `describeStat` at `modIsPct` directly. This pins that a
 * Constellation node granting `cdr` or `leech` reads identically (both
 * percent) on the tree screen and the character panel, so the two surfaces
 * can no longer disagree.
 */

import { describe, expect, it } from 'vitest';

import { describeStat } from '../src/ui/tree-view';
import { characterPanelMarkup } from '../src/ui/hud';
import type { CharacterPanelData } from '../src/ui/character-panel';

function panelDataFor(key: 'cdr' | 'leech', value: number): CharacterPanelData {
  return {
    stats: [{ key, label: key === 'cdr' ? 'Cooldown Reduction' : 'Leech', kind: 'flat', value, sources: [] }],
    boons: [],
  };
}

describe('fb040: Constellation stat display agrees with the character panel', () => {
  for (const key of ['cdr', 'leech'] as const) {
    it(`${key} reads as a percent on both the tree screen and the character panel`, () => {
      const treeText = describeStat(key, 0.06);
      expect(treeText).toContain('%');
      expect(treeText).not.toContain('0.06');

      const panelHtml = characterPanelMarkup(panelDataFor(key, 0.06));
      expect(panelHtml).toContain('+6%');
    });

    it(`${key} formats a negative value with a matching sign on both surfaces`, () => {
      expect(describeStat(key, -0.03)).toBe(key === 'cdr' ? '-3% Cooldown Reduction' : '-3% Leech');
      const panelHtml = characterPanelMarkup(panelDataFor(key, -0.03));
      expect(panelHtml).toContain('-3%');
    });
  }

  it('a true flat/point stat (armor) is not swept into percent formatting by either surface', () => {
    expect(describeStat('armor', 5)).toBe('+5 Armour');
    const panelHtml = characterPanelMarkup({
      stats: [{ key: 'armor', label: 'Armour', kind: 'flat', value: 5, sources: [] }],
      boons: [],
    });
    expect(panelHtml).toContain('+5');
    expect(panelHtml).not.toContain('+500%');
  });

  /**
   * code-reviewer (fb040): `cdr`/`leech` were already in the old, deleted
   * `PERCENT_STATS` Set, so the cases above pass unchanged on the pre-fix
   * code and don't actually falsify it. `towerAttackSpeed` and `charRange`
   * are real `StatKey`s (`STAT_DISPLAY: 'percent'`) that `PERCENT_STATS`
   * never listed — under the old Set-membership check they rendered as a
   * bare flat number; only `modIsPct`/`STAT_DISPLAY` gets them right. These
   * cases fail on the old implementation and pass on the new one.
   */
  it('a percent StatKey absent from the old hand-maintained PERCENT_STATS set (towerAttackSpeed) still reads as a percent', () => {
    expect(describeStat('towerAttackSpeed', 0.1)).toBe('+10% towerAttackSpeed');
  });

  it('a percent StatKey absent from the old hand-maintained PERCENT_STATS set (charRange) still reads as a percent', () => {
    expect(describeStat('charRange', 0.1)).toBe('+10% charRange');
  });
});
