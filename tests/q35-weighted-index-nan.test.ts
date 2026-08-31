/**
 * q35 — `Rng.weightedIndex`'s NaN-weight fallback (BACKLOG-QUALITY.md),
 * closed by BACKLOG b010.
 *
 * Filed while fuzzing q30's `applyOffer` `'boon'` case: a poisoned
 * `boonRanks[key]` (NaN, via a forged `Offer`) flows into
 * `buildOfferPool`'s `value: rank / b.maxRank` (`src/sim/progression.ts`),
 * which is *not* a `Stats` contribution and so is never touched by
 * `Stats.add`'s finite guard (`src/sim/stats.ts`) — it feeds straight into
 * `rollOffers`'s `weights.map` and from there into `weightedIndex` itself.
 *
 * Before the fix, a `NaN` in the weights array made `total` `NaN`, every
 * `r < 0` scan comparison was therefore `false` (NaN comparisons are always
 * false), and the function fell through its loop to
 * `return weights.length - 1` — deterministically the last surviving
 * candidate, on every call, regardless of the RNG stream's actual draws.
 * `weightedIndex` (`src/sim/rng.ts`) now excludes any non-finite or
 * non-positive weight from both `total` and the scan instead of letting it
 * poison the whole draw, so a poisoned entry is simply never selectable and
 * the remaining finite weights are drawn fairly.
 *
 * The second half answers q35's other question: whether `luckBias`
 * (`src/sim/progression.ts`, `Math.min(0.5, w.derived.luck * 0.004)`) can
 * itself go non-finite through any *real, in-domain* Luck value — as opposed
 * to the already-filed forged-`Offer` vector above. Per single source, no:
 * `Stats.add`'s finite guard (`src/sim/stats.ts`) drops any individually
 * non-finite contribution before it is stored, so one poisoned source can
 * never reach `total('luck')`. QA's own verification pass on this item found
 * a second gap: `add`'s guard checked only the incoming value, not the
 * running sum, so two *individually finite* extreme contributions (each a
 * legal double well under `Number.MAX_VALUE`, e.g. two sources at 1.5e308)
 * overflowed `total()`'s summation loop to `+/-Infinity` — filed as b022 and
 * now closed there: `add` drops a same-source update that would overflow its
 * running sum, and `total()`/`factor()` skip whichever source's contribution
 * would overflow the cross-source accumulator, so the result stays whatever
 * finite value it already had. The third block below pins the fixed
 * contract — `total('luck')` (and therefore `luckBias`) now stays finite
 * through the same two-extreme-source scenario that used to overflow it.
 */
import { describe, expect, it } from 'vitest';

import { Rng } from '../src/sim/rng';
import { Stats } from '../src/sim/stats';

describe('q35/b010 — Rng.weightedIndex with a non-finite weight (closed finding)', () => {
  it('a NaN weight is excluded from the draw, not folded into the total', () => {
    const weights = [5, 10, NaN, 3];
    for (const seed of [1, 2, 3, 42, 999, 123456789]) {
      const rng = new Rng(seed);
      expect(rng.weightedIndex(weights)).not.toBe(2);
    }
  });

  it('excludes the NaN regardless of where it sits in the array, drawing only from the finite entries', () => {
    const base = [5, 10, 3, 7];
    for (let poisonAt = 0; poisonAt < base.length; poisonAt++) {
      const weights = base.slice();
      weights[poisonAt] = NaN;
      for (const seed of [1, 7, 77, 500]) {
        const idx = new Rng(seed).weightedIndex(weights);
        expect(idx).not.toBe(poisonAt);
      }
    }
  });

  it('a NaN sitting alongside all-zero entries falls back to index 0, not the NaN slot', () => {
    // Previously: [0, 0, NaN, 0] fell through to index 3 (the NaN's own
    // slot) on every seed. All four weights are now non-selectable (0 is
    // excluded as non-positive, NaN as non-finite), so `total` is legally 0
    // and the function takes its documented `total <= 0` fallback.
    for (const seed of [7, 8, 9]) {
      expect(new Rng(seed).weightedIndex([0, 0, NaN, 0])).toBe(0);
    }
  });

  it('an all-NaN pool never selects the NaN it used to fall through to', () => {
    const weights = [NaN, NaN, NaN, NaN, NaN];
    for (const seed of [1, 2, 999999]) {
      expect(new Rng(seed).weightedIndex(weights)).toBe(0);
    }
  });

  it('+Infinity and -Infinity weights are excluded the same way as NaN', () => {
    for (const bad of [Infinity, -Infinity]) {
      const weights = [4, 9, bad, 1, 6];
      for (const seed of [1, 2, 999999]) {
        expect(new Rng(seed).weightedIndex(weights)).not.toBe(2);
      }
    }
  });

  it('still draws fairly among the surviving finite weights once the poison is excluded', () => {
    const weights = [4, 9, NaN, 1, 6];
    const seen = new Set<number>();
    for (let seed = 0; seed < 50; seed++) {
      const idx = new Rng(seed).weightedIndex(weights);
      expect(idx).not.toBe(2);
      seen.add(idx);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('still draws fairly (not always-last) with an all-finite pool, as a control', () => {
    const weights = [1, 1, 1, 1, 1];
    const seen = new Set<number>();
    for (let seed = 0; seed < 50; seed++) {
      seen.add(new Rng(seed).weightedIndex(weights));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('q35 — luckBias / derived.luck cannot go non-finite through a single poisoned source', () => {
  it('Stats.add drops non-finite contributions before they are stored', () => {
    const s = new Stats();
    for (const bad of [NaN, Infinity, -Infinity]) {
      s.add('probe', 'luck', bad);
    }
    expect(s.total('luck')).toBe(0);
  });

  it('total(\'luck\') stays finite even if every real source is simultaneously poisoned individually', () => {
    // Mirrors the game's actual luck sources (tree.json's static luck nodes,
    // today's only writer) each getting a non-finite contribution at once —
    // the worst case the real content could ever produce if every reader
    // upstream failed to clamp, so long as each individual contribution is
    // itself non-finite.
    const s = new Stats();
    const sources = ['tree:node-a', 'tree:node-b', 'tree:node-c', 'tree:node-d', 'tree:node-e'];
    for (const src of sources) {
      s.add(src, 'luck', NaN);
    }
    expect(Number.isFinite(s.total('luck'))).toBe(true);
    expect(s.total('luck')).toBe(0);

    // A legitimate finite contribution still lands normally alongside the
    // dropped ones, proving the guard filters only the bad values.
    s.add('tree:node-f', 'luck', 10);
    expect(s.total('luck')).toBe(10);
  });
});

describe('b022 (closed) — Stats.total/factor guard the running sum, not just each incoming value', () => {
  it('two individually-finite extreme contributions no longer overflow total() to Infinity', () => {
    // Neither 1.5e308 fails `Number.isFinite`, so `Stats.add`'s per-value
    // guard lets both through; before b022, the overflow happened inside
    // total()'s own summation loop, which had no guard at all. `total()` now
    // skips whichever source's contribution would push the running sum
    // non-finite, so the second -1.5e308 is dropped and the result is
    // whatever finite total already existed.
    const s = new Stats();
    s.add('relic:1', 'luck', -1.5e308);
    s.add('relic:2', 'luck', -1.5e308);
    const luck = s.total('luck');
    expect(Number.isFinite(luck)).toBe(true);
    expect(luck).toBe(-1.5e308);
    const luckBias = Math.min(0.5, luck * 0.004);
    expect(Number.isFinite(luckBias)).toBe(true);

    // rollOffers's `weight * (1 + luckBias * o.value)`: with luckBias now a
    // large-but-finite negative number, every weight is finite too — no
    // route back into weightedIndex's non-finite-weight fallback at all.
    const weights = [8 * (1 + luckBias * 0), 8 * (1 + luckBias * 0.5), 8 * (1 + luckBias * 1)];
    expect(weights.every((w) => Number.isFinite(w))).toBe(true);

    // Only the rank-0 offer's weight (8) survives as positive; the other two
    // go deeply negative and are excluded by weightedIndex's `w > 0` guard,
    // so the draw is still deterministic — but now because it is genuinely
    // the only selectable weight, not because every weight was poisoned.
    for (const seed of [1, 2, 999999]) {
      expect(new Rng(seed).weightedIndex(weights)).toBe(0);
    }
  });
});
