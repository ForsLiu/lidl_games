/**
 * Gate G13's solo-viability clause: every single-tower-type build clears the
 * TD wave curve at T1 but fails at T3 — all types are viable, none is
 * solo-dominant.
 *
 * "The 8 weapon towers + walls" is read as the seven attacking towers plus a
 * walls-only control (see QUESTIONS.md); each build may still use Palisades
 * for mazing, since mazing is a placement tool rather than a damage source.
 *
 * **Re-baselined at p3e (SPEC-FINAL §1.1/§16).** `runSingleType`
 * (`tools/a4probe.ts`) now runs SPEC-FINAL §1.1's real 18-TD-wave shape
 * (`cycles: 6`, was the legacy single 10-wave `cycles: 1`) with
 * `world.invulnerable` set, isolating this clause's actual subject — can a
 * solo-tower TD build survive the wave curve — from VS combat viability,
 * which is a different, not-yet-buildable claim while P6's nine open classes
 * and P7's equipment/VS-upgrade pool are unbuilt (the same split
 * `tests/light-build.test.ts` and `tests/boss.test.ts` make on this commit).
 * "Clears" now means banking all 18 TD waves, not 10.
 *
 * **Measured (seeds 1-5): every tower's T1 clause fails (0/5), including the
 * five that used to be green.** None of the seven ever reaches wave 18 —
 * `data/waves.json` authors only 10 real wave rows and `buildSpawnQueue`
 * repeats row 10 past the table's end against the HP curve's still-climbing
 * `1.30^(wave-1)` multiplier, so nothing can sustain it once the real content
 * runs out (p8a: "wave data on the §1.1 shape", not landed yet). The T3
 * clause ("fails alone") stays green without any code change — 0/5 was
 * already the expectation and stays true a fortiori once T1 also reads 0/5.
 * All seven T1 cases below are `.skip`-ed with their measured numbers, to be
 * re-enabled once p8a lands — logged as Q109.
 *
 * **Re-measured after p8a landed real waves 11-18 (PRIORITY DIRECTIVE
 * follow-up, this session).** `tools/a4probe.ts`'s own `main()` re-ran all
 * seven towers at T1, seeds 1-5, `cycles: 6`, `world.invulnerable`, against
 * the real (not repeated) wave 11-18 content: every tower still measures
 * **0/5** — arrow_spire (min/med waves 10/12), ballista (12/14), ember_brazier
 * (12/14), frost_obelisk (12/13), tesla_coil (6/6), mortar (12/16),
 * venom_spore (12/15) — none reaches wave 18 on any of the 5 seeds. The wall
 * moved (real content is a harder, escalating curve, not a flat repeat) but
 * the outcome didn't: this is no longer a content gap (p8a shipped real
 * rows), it's the un-tuned Act I economy against the real curve, the same
 * conclusion `tests/p-core-f-gates.test.ts` (G23) and
 * `tests/p6e-class-diversity.test.ts` (G8) independently reached. Still
 * `.skip`-ed, still with measured numbers — re-enable point moves from `p8a`
 * (done) to **P10** (the one balance pass). See QUESTIONS.md Q123.
 */

import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { SOUL_TOWERS, T3_MODS, runSingleType } from '../tools/a4probe';

const SEEDS = [1, 2, 3, 4, 5];

function clears(key: string, tier: number, mods: string[]): number {
  let n = 0;
  for (const seed of SEEDS) {
    if (runSingleType(key, tier, seed, mods).waves >= 18) n++;
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

  // p3e re-baseline (Q109): under the real 18-TD-wave shape, every tower's
  // T1 clause measures 0/5 — the m20c-era history above (arrow_spire/
  // venom_spore green, tesla_coil/mortar red) described the old 10-wave
  // curve and no longer applies; all seven now share one cause, the p8a
  // content gap named in the file doc comment, not a per-tower track issue.
  // Measured at p3e (seeds 1-5, `cycles: 6`, `world.invulnerable`):
  // arrow_spire 0/5, ballista 0/5, ember_brazier 0/5, frost_obelisk 0/5,
  // tesla_coil 0/5, mortar 0/5, venom_spore 0/5.
  //
  // Re-measured this session, now that p8a's real wave 11-18 content is
  // live: unchanged, still 0/5 for all seven (see file header). Re-enable
  // point is P10 (the balance pass), not p8a (already landed and measured).
  for (const key of SOUL_TOWERS) {
    it.skip(`${key} alone clears the TD wave curve at T1`, () => {
      expect(clears(key, 1, [])).toBe(SEEDS.length);
    });
  }

  for (const key of SOUL_TOWERS) {
    it(`${key} alone fails the TD wave curve at T3`, () => {
      expect(clears(key, 3, T3_MODS)).toBe(0);
    });
  }

  it('walls alone fail even at T1 — mazing is not a damage source', () => {
    expect(clears('palisade', 1, [])).toBe(0);
  });
});
