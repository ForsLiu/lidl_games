/**
 * q35 — `Rng.weightedIndex`'s NaN-weight fallback (BACKLOG-QUALITY.md).
 *
 * Filed while fuzzing q30's `applyOffer` `'boon'` case: a poisoned
 * `boonRanks[key]` (NaN, via a forged `Offer`) flows into
 * `buildOfferPool`'s `value: rank / b.maxRank` (`src/sim/progression.ts:139`),
 * which is *not* a `Stats` contribution and so is never touched by
 * `Stats.add`'s finite guard (`src/sim/stats.ts:148`) — it feeds straight
 * into `rollOffers`'s `weights.map` and from there into `weightedIndex`
 * itself. q30's own tests only observe the symptom indirectly (the poisoned
 * boon never wins, because it always loses to whatever pool entry sits
 * last). This file pins the mechanism directly, with no `World`/
 * `applyOffer` involved: a `NaN` in the weights array makes `total` `NaN`,
 * every `r < 0` scan comparison is therefore `false` (NaN comparisons are
 * always false), and the function falls through its loop to
 * `return weights.length - 1` — deterministically the last surviving
 * candidate, on every call, regardless of the RNG stream's actual draws.
 *
 * The second half answers q35's other question: whether `luckBias`
 * (`src/sim/progression.ts:89`, `Math.min(0.5, w.derived.luck * 0.004)`)
 * can itself go non-finite through any *real, in-domain* Luck value — as
 * opposed to the already-filed forged-`Offer` vector above. Per single
 * source, no: `Stats.add`'s finite guard (`src/sim/stats.ts:148`) drops any
 * individually non-finite contribution before it is stored, so one poisoned
 * source can never reach `total('luck')`. But `add`'s guard checks only the
 * incoming value, not the running sum — QA's own verification pass on this
 * item found that two *individually finite* extreme contributions (each a
 * legal double well under `Number.MAX_VALUE`, e.g. two relic affixes at
 * 1.5e308) overflow `total()`'s summation loop to `±Infinity`, which is not
 * caught anywhere downstream: `Math.min(0.5, ...)` clamps the positive case
 * but not the negative one, so a `-Infinity` `luckBias` reaches `rollOffers`
 * uncaught. This is a distinct, real gap (filed as q39: `Stats.add`'s
 * per-value guard doesn't cover summation overflow across sources, and
 * `src/meta/meta.ts`'s `deserializeMeta` has no schema validation on a
 * loaded save's relic affix values, so a tampered save is a real, if not
 * trivial, delivery path) — this file pins today's overflow behaviour
 * alongside the single-source guard so both are on record precisely,
 * instead of the single-source claim standing in for a broader one it
 * doesn't cover.
 */
import { describe, expect, it } from 'vitest';

import { Rng } from '../src/sim/rng';
import { Stats } from '../src/sim/stats';

describe('q35 — Rng.weightedIndex with a NaN weight', () => {
  it('falls through to the last index, independent of seed', () => {
    const weights = [5, 10, NaN, 3];
    const want = weights.length - 1;
    for (const seed of [1, 2, 3, 42, 999, 123456789]) {
      const rng = new Rng(seed);
      expect(rng.weightedIndex(weights)).toBe(want);
    }
  });

  it('falls through regardless of where the NaN sits in the array', () => {
    const base = [5, 10, 3, 7];
    for (let poisonAt = 0; poisonAt < base.length; poisonAt++) {
      const weights = base.slice();
      weights[poisonAt] = NaN;
      const rng = new Rng(77);
      expect(rng.weightedIndex(weights)).toBe(weights.length - 1);
    }
  });

  it('falls through even when the NaN is the only non-zero-looking entry', () => {
    const rng = new Rng(7);
    expect(rng.weightedIndex([0, 0, NaN, 0])).toBe(3);
  });

  it('two draws against the same NaN-poisoned pool are byte-identical across different RNG states', () => {
    // This is the exact symptom q30 measured indirectly through `rollOffers`:
    // "two consecutive rollOffers calls against a NaN-poisoned pool return
    // byte-identical results, which a fair weighted draw never would."
    const weights = [4, 9, NaN, 1, 6];
    const a = new Rng(1).weightedIndex(weights);
    const b = new Rng(2).weightedIndex(weights);
    const c = new Rng(999999).weightedIndex(weights);
    expect(a).toBe(weights.length - 1);
    expect(b).toBe(weights.length - 1);
    expect(c).toBe(weights.length - 1);
  });

  it('still draws fairly (not always-last) once the NaN is gone, as a control', () => {
    // Proves the previous assertions are about the NaN, not about
    // `weightedIndex` always returning the last index regardless of input.
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
    // Mirrors the game's actual luck sources (boons.json "fortune",
    // relics.json affix "luck", several tree.json nodes) each getting a
    // non-finite contribution at once -- the worst case the real content
    // could ever produce if every reader upstream failed to clamp, so long
    // as each individual contribution is itself non-finite.
    const s = new Stats();
    const sources = ['boon:fortune', 'relic:0', 'tree:node-a', 'tree:node-b', 'tree:node-c'];
    for (const src of sources) {
      s.add(src, 'luck', NaN);
    }
    expect(Number.isFinite(s.total('luck'))).toBe(true);
    expect(s.total('luck')).toBe(0);

    // A legitimate finite contribution still lands normally alongside the
    // dropped ones, proving the guard filters only the bad values.
    s.add('boon:fortune', 'luck', 10);
    expect(s.total('luck')).toBe(10);
  });
});

describe('q35 — gap found by QA verification: summation overflow across sources is NOT guarded (filed as q39)', () => {
  it('two individually-finite extreme contributions overflow total() to Infinity', () => {
    // Neither 1.5e308 fails `Number.isFinite`, so `Stats.add`'s guard
    // (src/sim/stats.ts:148) lets both through; the overflow happens later,
    // inside total()'s own summation loop, which has no guard at all.
    const s = new Stats();
    s.add('relic:1', 'luck', 1.5e308);
    s.add('relic:2', 'luck', 1.5e308);
    expect(Number.isFinite(s.total('luck'))).toBe(false);
    expect(s.total('luck')).toBe(Infinity);
  });

  it('the negative case reaches luckBias uncaught, unlike the positive case', () => {
    // Math.min(0.5, x) clamps Infinity down to 0.5, silently masking the
    // positive overflow -- but it does nothing for -Infinity, so luckBias
    // itself goes non-finite in the negative direction with no clamp
    // anywhere in the chain.
    const s = new Stats();
    s.add('relic:1', 'luck', -1.5e308);
    s.add('relic:2', 'luck', -1.5e308);
    const luck = s.total('luck');
    expect(luck).toBe(-Infinity);
    const luckBias = Math.min(0.5, luck * 0.004);
    expect(luckBias).toBe(-Infinity);
    // -Infinity reproduces q35's own NaN-weight finding through a second
    // vector: rollOffers's `weight * (1 + luckBias * o.value)` goes NaN
    // whenever o.value is 0 (-Infinity * 0 = NaN), and non-NaN (-Infinity or
    // Infinity) otherwise -- either way weightedIndex's fallback triggers,
    // by the same NaN/Infinity-total mechanism pinned above.
    expect(Number.isNaN(1 * (1 + luckBias * 0))).toBe(true);
  });
});
