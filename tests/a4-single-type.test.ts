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
 *
 * **p10c re-tune, un-skipped (this session).** `data/waves.json`'s
 * `hpScalePerWave` 1.30 -> 1.22 (the dominant driver — `1.3^17 ≈ 101x` HP
 * growth by wave 18 against linear gold growth, unbeatable by any realistic
 * per-tower economy) plus per-tower fixes for the three towers that still
 * measured 0/5 at every curve value tried (arrow_spire damage 5.5->10,
 * tesla_coil upgrades.costMul 1 (was the shared 2x)/stepCost 80->40/damage
 * 18->29) and one that had swung the other way and now cleared T3 (ember_
 * brazier dropped its p5b `costMul: 0.8`, `burn.dps` 6->3; frost_obelisk
 * damage 22->19; venom_spore damage 45->38). Re-measured, all seven T1: 5/5.
 * Re-measured, all seven T3 (with `T3_MODS`): 0/5, unchanged — the curve
 * still bites, a solo tower still can't tank T3 alone. Full before/after
 * table and rationale: PROGRESS.md's p10c entry.
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

  // p10c re-tune (this session): every tower's T1 clause now measures 5/5 —
  // see the file header for what changed and PROGRESS.md's p10c entry for
  // the full before/after table. Un-skipped.
  for (const key of SOUL_TOWERS) {
    it(`${key} alone clears the TD wave curve at T1`, () => {
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
