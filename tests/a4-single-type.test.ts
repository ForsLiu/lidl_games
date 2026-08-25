/**
 * SPEC A4: every single-tower-type build clears Act I at T1 but fails at T3 —
 * all types are viable, none is solo-dominant.
 *
 * "The 8 weapon towers + walls" is read as the seven soul-granting towers plus
 * a walls-only control (see QUESTIONS.md); each build may still use Palisades
 * for mazing, since mazing is a placement tool rather than a damage source.
 */

import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { SOUL_TOWERS, T3_MODS, runSingleType } from '../tools/a4probe';

const SEEDS = [1, 2, 3, 4, 5];

function clears(key: string, tier: number, mods: string[]): number {
  let n = 0;
  for (const seed of SEEDS) {
    if (runSingleType(key, tier, seed, mods).waves >= 10) n++;
  }
  return n;
}

describe('A4 every tower type is viable, none is dominant', () => {
  it('covers all seven soul-granting towers', () => {
    const content = loadContent();
    expect(SOUL_TOWERS.length).toBe(7);
    for (const key of SOUL_TOWERS) {
      expect(content.towerByKey.get(key)!.soul).not.toBeNull();
    }
  });

  for (const key of SOUL_TOWERS) {
    it(`${key} alone clears Act I at T1`, () => {
      expect(clears(key, 1, [])).toBe(SEEDS.length);
    });
  }

  for (const key of SOUL_TOWERS) {
    it(`${key} alone fails Act I at T3`, () => {
      expect(clears(key, 3, T3_MODS)).toBe(0);
    });
  }

  it('walls alone fail even at T1 — mazing is not a damage source', () => {
    expect(clears('palisade', 1, [])).toBe(0);
  });
});
