/**
 * fb042 (QUESTIONS Q146) — the 13 emptied ex-Emberkeeper/Scavenger
 * Constellation smalls plus the Tinkerer and Gilded Path notables (15 nodes
 * total, `data/tree.json`) each grant a live, additive-only `startingGold`
 * bonus instead of sitting dead (or, for Gilded Path, keeping a `mul`
 * `goldFind` the owner's ORDER retired in favour of an additive effect).
 */

import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { STAT_KIND } from '../src/sim/statkeys';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const content = loadContent();

const TARGET_IDS = [84, 85, 90, 91, 92, 93, 94, 102, 103, 106, 107, 112, 113, 117, 118];

describe('fb042 — Constellation node effects are live and additive-only', () => {
  it('every one of the 15 previously-dead/mul nodes has non-empty, flat-only stats', () => {
    for (const id of TARGET_IDS) {
      const node = content.treeById.get(id);
      expect(node, `node ${id} exists`).toBeTruthy();
      const keys = Object.keys(node!.stats);
      expect(keys.length, `node ${id} (${node!.name}) has live stats`).toBeGreaterThan(0);
      for (const k of keys) {
        expect(STAT_KIND[k as keyof typeof STAT_KIND], `node ${id} (${node!.name})'s ${k} is additive`).toBe('flat');
      }
    }
  });

  it("Gilded Path's old multiplicative goldFind is gone", () => {
    const node = content.treeById.get(102)!;
    expect(node.name).toBe('Gilded Path');
    expect(node.stats.goldFind).toBeUndefined();
  });

  it('an allocated startingGold node raises World.gold at construction, once, additively', () => {
    const base = new World(cfg({ allocated: [] })).gold;
    const w = new World(cfg({ allocated: [84, 90] })); // small (+5) + notable (+25)
    expect(w.gold).toBe(base + 30);
  });

  it('startingGold does not re-apply if granted after construction (read once, like coreHp)', () => {
    const w = new World(cfg({ allocated: [] }));
    const before = w.gold;
    w.stats.add('probe', 'startingGold', 999);
    w.recomputeDerived();
    expect(w.gold).toBe(before);
  });
});
