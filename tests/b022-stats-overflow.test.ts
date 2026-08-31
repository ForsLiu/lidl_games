/**
 * b022 — `Stats.add`'s finite guard (`src/sim/stats.ts`) only ever checked the
 * *incoming* value, not the running sum it lands on: two individually-finite
 * contributions (each well under `Number.MAX_VALUE`, e.g. two at 1.5e308) can
 * still overflow a sum or product to +/-Infinity. Found by qa-playtester while
 * verifying b010, pinned live in `tests/q35-weighted-index-nan.test.ts`.
 *
 * Fixed at three points: `add` drops a same-source update whose running sum
 * would go non-finite (mirroring its existing "drop a non-finite incoming
 * value" rule); `total()`/`factor()` skip whichever source's contribution
 * would push the cross-source accumulator non-finite. `statRecord`'s schema
 * (`src/sim/content.ts`) also bounds a single /data-authored stat value well
 * clear of real content's range, closing the authoring vector directly.
 */
import { describe, expect, it } from 'vitest';

import { Stats, derive, emptyStats } from '../src/sim/stats';
import { loadContent } from '../src/sim/content';

const content = loadContent();

describe('b022 — Stats guards the running sum, not just each incoming value', () => {
  it('add() drops a same-source update that would overflow the running sum', () => {
    const s = new Stats();
    s.add('relic:1', 'power', 1.5e308);
    s.add('relic:1', 'power', 1.5e308); // same source: would sum to Infinity
    expect(Number.isFinite(s.total('power'))).toBe(true);
    expect(s.total('power')).toBe(1.5e308);
  });

  it('add() still lets a same-source running sum grow normally when it stays finite', () => {
    const s = new Stats();
    s.add('tree:node', 'power', 0.1);
    s.add('tree:node', 'power', 0.2);
    s.add('tree:node', 'power', 0.3);
    expect(s.total('power')).toBeCloseTo(0.6, 10);
  });

  it('total() skips a source whose contribution would overflow the cross-source sum', () => {
    const s = new Stats();
    s.add('relic:1', 'luck', 1.5e308);
    s.add('relic:2', 'luck', 1.5e308); // different sources: sum would be Infinity
    const total = s.total('luck');
    expect(Number.isFinite(total)).toBe(true);
    expect(total).toBe(1.5e308);
  });

  it('total() stays finite (and unaffected) when no overflow is in play', () => {
    const s = new Stats();
    s.add('a', 'luck', 5);
    s.add('b', 'luck', 10);
    s.add('c', 'luck', -3);
    expect(s.total('luck')).toBe(12);
  });

  it('factor() skips a source whose contribution would overflow the running product', () => {
    const s = new Stats();
    s.add('relic:1', 'power', 1e200);
    s.add('relic:2', 'power', 1e200); // (1+1e200)*(1+1e200) overflows to Infinity
    const factor = s.factor('power');
    expect(Number.isFinite(factor)).toBe(true);
  });

  it('factor() still multiplies normally across sources when no overflow is in play', () => {
    const s = new Stats();
    s.add('a', 'power', 0.1);
    s.add('b', 'power', 0.2);
    expect(s.factor('power')).toBeCloseTo(1.1 * 1.2, 10);
  });

  it('NaN and +/-Infinity incoming values are still dropped outright (pre-existing guard, unchanged)', () => {
    const s = new Stats();
    for (const bad of [NaN, Infinity, -Infinity]) {
      s.add('probe', 'luck', bad);
    }
    expect(s.total('luck')).toBe(0);
  });

  it('b062: derive().maxHp stays finite when total(maxHp)*factor(maxHpPct) individually finite but their product would overflow', () => {
    const s = emptyStats();
    s.add('gear:1', 'maxHp', 1e6);
    // 55 sources at the statNum ceiling: factor(maxHpPct) alone stays finite
    // (~1.1e303 at 50 sources), but multiplying it by the maxHp total crosses
    // Number.MAX_VALUE.
    for (let i = 0; i < 55; i++) {
      s.add(`tree:${i}`, 'maxHpPct', 1e6);
    }
    expect(Number.isFinite(s.total('maxHp'))).toBe(true);
    expect(Number.isFinite(s.factor('maxHpPct'))).toBe(true);
    const d = derive(content, s);
    expect(Number.isFinite(d.maxHp)).toBe(true);
  });
});
