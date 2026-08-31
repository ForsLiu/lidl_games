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
 * never reach `total('luck')`. But `add`'s guard checks only the incoming
 * value, not the running sum — QA's own verification pass on this item found
 * that two *individually finite* extreme contributions (each a legal double
 * well under `Number.MAX_VALUE`, e.g. two relic affixes at 1.5e308) overflow
 * `total()`'s summation loop to `+/-Infinity`, which `Math.min(0.5, ...)`
 * clamps in the positive direction but not the negative one — filed as its
 * own item (b022) rather than fixed here, since it lives in `Stats.total`,
 * not `weightedIndex`/`rerollOffers`. `weightedIndex`'s b010 fix means that
 * gap can no longer manifest as a silent "always pick the same index" —
 * every offer's weight goes non-finite and is skipped, landing on offer 0
 * (a valid, if not luck-weighted, pick) — pinned in the third block below.
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

describe('b010 — weightedIndex degrades gracefully when luckBias itself is non-finite (b022 gap, unfixed at its source)', () => {
  it('two individually-finite extreme contributions still overflow total() to Infinity (b022, left open here)', () => {
    // Neither 1.5e308 fails `Number.isFinite`, so `Stats.add`'s guard lets
    // both through; the overflow happens later, inside total()'s own
    // summation loop, which has no guard at all. This block does not fix
    // that (b022 owns it) — it proves weightedIndex no longer turns the
    // resulting non-finite luckBias into a silent "always the same index"
    // bug the way it used to.
    const s = new Stats();
    s.add('relic:1', 'luck', -1.5e308);
    s.add('relic:2', 'luck', -1.5e308);
    const luck = s.total('luck');
    expect(luck).toBe(-Infinity);
    const luckBias = Math.min(0.5, luck * 0.004);
    expect(luckBias).toBe(-Infinity);

    // rollOffers's `weight * (1 + luckBias * o.value)`: for a rank-0 offer
    // (o.value === 0), -Infinity * 0 is NaN; for any other offer it's a
    // non-finite product either way. Every offer's weight goes non-finite.
    const weights = [8 * (1 + luckBias * 0), 8 * (1 + luckBias * 0.5), 8 * (1 + luckBias * 1)];
    expect(weights.every((w) => !Number.isFinite(w))).toBe(true);

    // Previously this would have fallen through to `weights.length - 1` on
    // every seed. It now lands on the documented `total <= 0` fallback,
    // index 0, uniformly — still deterministic (an all-non-finite pool
    // can't be drawn from at random), but no longer disguised as a fair
    // luck-weighted draw, and no longer coupled to array length/position.
    for (const seed of [1, 2, 999999]) {
      expect(new Rng(seed).weightedIndex(weights)).toBe(0);
    }
  });
});
