/**
 * BACKLOG p12e (QUESTIONS Q177): p12c's roster-wide `baseHpMul: 20`
 * (`data/enemies.json`) applies to every enemy, including the final boss
 * `warden_eater` (`src/sim/enemies.ts` ~line 92), whose authored HP (365,000)
 * was fitted at fb099/p10k so a real fight lands ~51-57s over the 20s floor
 * `tests/boss.test.ts`/`tests/p8d-boss-termination.test.ts` protect. At the
 * shipped `baseHpMul`, the boss spawns at 730,000 instead (36,500 loaded
 * after fb153a's `numberScale`, x20), and profiling T3 seeds (GATE_TIER,
 * `tests/helpers.ts`) through the real scripted-kit harness shows the fight
 * length exploding into a 138s-772s spread — the run-length tail p12c's own
 * margin sweep censored at the 45-minute cap (BACKLOG p12e's profiling note).
 *
 * **Which seed reproduces it, measured rather than assumed.** The first
 * draft of this file pinned seed 7 and cited it as a 972.4s pre-fix fight;
 * code review re-ran it and got **138.5s**, independently re-confirmed here
 * — seed 7 passes the ceiling below *without* the fix, so it discriminated
 * nothing. Scanning seeds 1-24 pre-fix, the real worst offender is **seed
 * 11 at 772.2s**, which is what the fast case pins now. The lesson is
 * CLAUDE.md's own: a control run, not a plausible number.
 *
 * The ceiling (300s) sits with real headroom over the pre-p12c ~51-57s
 * fitted fight (kitPower/tower retunes since then legitimately move the
 * "right" number, so this is not re-pinning the old value) while remaining
 * far under the tail this item exists to eliminate — post-fix the same 24
 * seeds measure min 36.4s / max 149.4s / mean 67.9s, so neither edge is
 * close enough to flip this on noise.
 *
 * Fast-tier excluded (`vitest.fast.config.ts`): 12 full T3 runs, measured
 * standalone at 384s.
 */
import { describe, expect, it } from 'vitest';

import '../src/bots';
import { loadContent } from '../src/sim/content';
import { allTreeNodeIds } from '../src/meta/meta';
import { GATE_TIER, runScripted } from './helpers';

const FULL_TREE = allTreeNodeIds(loadContent());

/** Real headroom over the pre-p12c ~51-57s fitted fight; far under the 920-1187s tail this item exists to eliminate. */
const FIGHT_CEILING_SECONDS = 300;

describe('p12e: the boss fight does not blow up under the roster baseHpMul', () => {
  // Seed 11: the measured worst case of seeds 1-24 pre-fix (772.2s), so this
  // one case fails without the fix. See the header for why it is not seed 7.
  it('seed 11 (GATE_TIER=3, scripted kit bot) kills the boss in a bounded fight', () => {
    const { report, run } = runScripted(
      { seed: 11, classKey: 'engineer', tier: GATE_TIER, modifiers: [], allocated: FULL_TREE },
      'hybrid',
    );
    expect(report.outcome).not.toBe('running');
    expect(report.bossKilled, `outcome was ${report.outcome}`).toBe(true);
    const fightSeconds = report.bossKillSeconds - run.world.content.spawns.bossTimeSeconds;
    expect(fightSeconds, `bossKillSeconds=${report.bossKillSeconds}`).toBeLessThan(FIGHT_CEILING_SECONDS);
    // Still a real fight, not an instant kill: the >20s floor `tests/
    // boss.test.ts`/`tests/p8d-boss-termination.test.ts` already protect.
    expect(fightSeconds).toBeGreaterThan(20);
  }, 300_000);

  it('the spread across contested T3 seeds stays bounded, not a 138s-772s tail', () => {
    // 11 first: the worst pre-fix seed. 14/15/20/21 measured 549-592s
    // pre-fix, so this case fails without the fix on several seeds, not one.
    const seeds = [11, 2, 4, 8, 10, 14, 15, 17, 18, 20, 21];
    const fights: number[] = [];
    for (const seed of seeds) {
      const { report, run } = runScripted(
        { seed, classKey: 'engineer', tier: GATE_TIER, modifiers: [], allocated: FULL_TREE },
        'hybrid',
      );
      if (report.bossKilled) fights.push(report.bossKillSeconds - run.world.content.spawns.bossTimeSeconds);
    }
    expect(fights.length, 'no seed reached and killed the boss').toBeGreaterThan(0);
    const max = Math.max(...fights);
    expect(max, `fight lengths: ${fights.map((f) => f.toFixed(1)).join(', ')}`).toBeLessThan(FIGHT_CEILING_SECONDS);
  }, 600_000);
});
