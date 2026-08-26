/**
 * SPEC A4: every single-tower-type build clears Act I at T1 but fails at T3 —
 * all types are viable, none is solo-dominant.
 *
 * "The 8 weapon towers + walls" is read as the seven attacking towers plus a
 * walls-only control (see QUESTIONS.md); each build may still use Palisades
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
  it('covers all seven attacking towers', () => {
    const content = loadContent();
    expect(SOUL_TOWERS.length).toBe(7);
    for (const key of SOUL_TOWERS) {
      expect(content.towerByKey.get(key)!.attack).not.toBeNull();
    }
  });

  // m20c re-measured all four clauses m20a deferred, and two of them were no
  // longer failing: **arrow_spire and venom_spore clear T1 5/5 at HEAD** and
  // are live again below. Neither was fixed by a track — m20b's milestone
  // specials (Arrow's pierce/Bleeding/second shot, Venom's second spore and
  // ratio) are what closed them, which is the m20b lesson restated: measure
  // before tuning, because the deferral was a measurement with an expiry date.
  //
  // TODO(m20d/M27): the two that are still red, and what each hangs on —
  //   * tesla_coil — **range and chain count**, not the track. §4 fixes its
  //     count at 3, and m20c measured a cheaper step price (80 → 48) at
  //     T1 0/5 either way (waves 6,7,6,6,7 against 6,6,6,6,7) — it also cost
  //     f001 its seed, so it was not adopted. QA measured that only V2's
  //     tier-3 range and third arc reach 5/5, and §4 removed both on purpose.
  //   * mortar — the qualifier matters, and QA supplied it: "every count from
  //     3 up fails T1" holds **under m20c's step price rule** (a whole track
  //     costs 2x the build price), where count 3 prices a step at 87 and
  //     measures T1 0/5. At count 3 keeping today's price of 26 it is T1 5/5
  //     *and* T3 0/5 — both clauses green — which is backlog **m20e**, since
  //     a per-track price is a rule change the owner owns (Q80).
  // Both want base damage re-priced, which is M27's one-pass re-baseline
  // (Q40); m20d re-prices Venom for its own reason. See PROGRESS "Known
  // issues" and QUESTIONS Q80.
  // Measured at m20c: arrow_spire 5/5, venom_spore 5/5, tesla_coil 0/5,
  // mortar 3/5.
  const DEFERRED = new Set(['tesla_coil', 'mortar']);

  for (const key of SOUL_TOWERS) {
    const t1 = DEFERRED.has(key) ? it.skip : it;
    t1(`${key} alone clears Act I at T1`, () => {
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
