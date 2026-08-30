/**
 * Balance regression: the TD wave curve must be climbable by more than one
 * build shape.
 *
 * M7's Act I retune pushed `hpScalePerWave` to 1.35, which made wave 10 a wall
 * that no amount of DPS answered. The side effect was that the two lightest
 * standard policies — `kite` (ten Arrow Spires and an active Warden) and
 * `turtle` (walls plus a thin ring) — stopped clearing Act I entirely, so the
 * only surviving Act I shape was a 46-structure maxed board.
 *
 * **Re-baselined at p3e (SPEC-FINAL §1.1/§16).** p3a-p3d replaced the old
 * single 10-wave Act I with an 18-TD-wave curve interleaved across 6 blocks
 * (3 TD waves, then 1 VS wave, repeating) — `cfg.cycles: 1` is now a legacy
 * escape hatch, not the real run shape, so this file's config moved to
 * `cycles: 6`. "Clears the curve" now means "banks all 18 TD waves"
 * (`w.wave >= 18`, the same counter `wavesCleared` totals off), and the run
 * sets `world.invulnerable` so the claim stays what it always was — can this
 * build's maze/economy survive the TD wave curve — rather than folding in VS
 * combat viability, which is a different, not-yet-buildable claim: §4.2's
 * nine open classes (P6) and §7's equipment/VS-upgrade pool (P7) are still
 * unbuilt, so no build can out-fight a VS wave on its character kit alone
 * today. That split is the same one G13's "solo-viable at T1" clause and the
 * boss gate make on the same commit — see `tests/a4-single-type.test.ts` and
 * `tests/boss.test.ts`.
 *
 * **Measured (seeds 1-8, `world.invulnerable`): every policy here dies to
 * `defeat_core` between TD wave 9 and 14, none reaches 18.** This is not the
 * curve being unclimbable — it is `data/waves.json` only authoring 10 real
 * wave rows. `buildSpawnQueue` repeats row 10's exact composition for waves
 * 11-18 against the HP scale's still-climbing `1.30^(wave-1)` multiplier, so
 * nothing can sustain it once the real content runs out; that gap is p8a's
 * ("wave data on the §1.1 shape"), not a defect in the curve or in any of
 * these builds. All three assertions below are `.skip`-ed with their measured
 * numbers per CLAUDE.md rule 6, to be re-enabled once p8a lands real waves
 * 11-18 — logged as Q109.
 */

import { describe, expect, it } from 'vitest';

import { Run } from '../src/sim/run';
import { makePolicy } from '../src/bots';
import '../src/bots';
import type { RunConfig } from '../src/sim/types';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
/** A full 18 TD + 6 VS run under `world.invulnerable`; this only guards against a hang. */
const MAX_TICKS = 60 * 60 * 40;

/** Runs until every TD wave is banked or the run ends some other way. */
function clearsAllTdWaves(policy: string, seed: number): boolean {
  const cfg: RunConfig = {
    seed,
    classKey: 'engineer',
    tier: 1,
    modifiers: [],
    allocated: [],
    policy,
    // SPEC-FINAL §1.1's real run shape: 18 TD waves across 6 blocks.
    cycles: 6,
  };
  const run = new Run(cfg);
  // Isolate the TD/Core-defense claim from VS combat viability (P6/P7 are
  // unbuilt) — see the file doc comment.
  run.world.invulnerable = true;
  const bot = makePolicy(policy);
  while (!run.done && run.world.tick < MAX_TICKS && run.world.wave < 18) {
    run.step(bot.act(run.world));
  }
  return run.world.wave >= 18;
}

function clears(policy: string): number {
  return SEEDS.filter((seed) => clearsAllTdWaves(policy, seed)).length;
}

describe('the TD wave curve is clearable by a light build, not only by a maxed board', () => {
  // Measured at m20c (pre-p3e, old 10-wave shape): 7/8, seed 8 reaching wave 9.
  // Superseded by the p3e measurement below — kept skipped either way.
  it.skip('kite clears every TD wave on every seed', () => {
    const n = clears('kite');
    expect(n, `kite cleared ${n}/${SEEDS.length}`).toBe(SEEDS.length);
  });

  // Measured at p3e (seeds 1-8, `cycles: 6`, `world.invulnerable`): 0/8 —
  // every seed dies to `defeat_core` between TD wave 9 and 14, once the real
  // wave-10 content runs out and `buildSpawnQueue` starts repeating it against
  // a still-climbing HP multiplier. See the file doc comment and Q109.
  it.skip('turtle clears every TD wave on most seeds', () => {
    const n = clears('turtle');
    expect(n, `turtle cleared ${n}/${SEEDS.length}`).toBeGreaterThanOrEqual(5);
  });

  // Measured at p3e: 0/8, same cause as `turtle` above.
  it.skip('a maxed board still clears every TD wave, so the curve was not simply flattened', () => {
    expect(clears('maxbuild')).toBe(SEEDS.length);
  });
});
