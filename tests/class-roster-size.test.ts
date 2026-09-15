import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { pairCount, rosterSize, PAIR_COUNT, ROSTER_SIZE } from './class-roster-size';

describe('c038: roster size is read live, not pinned to a stale literal', () => {
  it('ROSTER_SIZE/PAIR_COUNT agree with a fresh read of shipped data/classes.json', () => {
    // Not a tautology against `class-roster-size.ts`'s own module-load value:
    // this calls `rosterSize`/`pairCount` a second time, independently, off a
    // content load this file owns.
    const c = loadContent();
    expect(ROSTER_SIZE).toBe(rosterSize(c));
    expect(PAIR_COUNT).toBe(pairCount(rosterSize(c)));
    expect(c.classes.classes.length).toBe(ROSTER_SIZE);
  });

  it('proven live, not vacuous — a synthetic 13th class moves the pair-count formula', () => {
    // Clone one shipped row under a new key rather than hand-author a
    // thirteenth class: this test is about the *counting*, not about a valid
    // kit, and the loader accepts a cloned key as readily as an authored one.
    // The loader also requires every class to own a 3-card `skillCards` row
    // (`content.ts`'s roster-completeness check), so the clone needs one too
    // — cloned from the same source row, not hand-authored.
    const base = loadContent();
    const raw = base as unknown as { raw: { classes: unknown; boons: unknown } };
    const doc = JSON.parse(JSON.stringify(raw.raw.classes)) as { classes: { key: string }[] };
    const boonsDoc = JSON.parse(JSON.stringify(raw.raw.boons)) as {
      skillCards: Record<string, { key: string; effect: string }[]>;
    };
    const sourceKey = doc.classes[0].key;
    const clone = JSON.parse(JSON.stringify(doc.classes[0])) as { key: string };
    clone.key = 'c038_synthetic_13th';
    doc.classes.push(clone);
    boonsDoc.skillCards[clone.key] = boonsDoc.skillCards[sourceKey].map((card) => ({
      ...card,
      key: `${clone.key}_${card.effect}`,
    }));
    const thirteen = loadContent({ classes: doc, boons: boonsDoc });

    expect(rosterSize(thirteen)).toBe(ROSTER_SIZE + 1);
    expect(pairCount(rosterSize(thirteen))).toBe(pairCount(ROSTER_SIZE + 1));
    // The formula itself, not just the live count: 13 classes make 78 pairs,
    // one more class making one fewer pair would be the regression this row
    // exists to catch (an off-by-one in `pairCount`, not in the roster read).
    expect(pairCount(rosterSize(thirteen))).not.toBe(PAIR_COUNT);
  });
});
