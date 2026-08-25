/**
 * Balance regression: Act I must be clearable by more than one build shape.
 *
 * M7's Act I retune pushed `hpScalePerWave` to 1.35, which made wave 10 a wall
 * that no amount of DPS answered. The side effect was that the two lightest
 * standard policies — `kite` (ten Arrow Spires and an active Warden) and
 * `turtle` (walls plus a thin ring) — stopped clearing Act I entirely, so the
 * only surviving Act I shape was a 46-structure maxed board.
 *
 * This pins the shape of the curve rather than a single constant: a light build
 * clears, a wall-only build still does not (A2), and a full single-type build
 * still fails at T3 (A4). Those three together are what stops a fix for one
 * from silently breaking the others.
 */

import { describe, expect, it } from 'vitest';

import { Run } from '../src/sim/run';
import { makePolicy } from '../src/bots';
import '../src/bots';
import type { RunConfig } from '../src/sim/types';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
/** Act I never runs past ~12 minutes; this only guards against a hang. */
const MAX_TICKS = 60 * 60 * 20;

/** Runs to the Sundering and stops — Act II is not what this measures. */
function clearsActI(policy: string, seed: number): boolean {
  const cfg: RunConfig = {
    seed,
    classKey: 'engineer',
    tier: 1,
    modifiers: [],
    allocated: [],
    relics: [],
    policy,
    // This measures the original 10-wave Act I curve, not the SPEC-V2 cycle split.
    cycles: 1,
  };
  const run = new Run(cfg);
  const bot = makePolicy(policy);
  while (!run.done && run.world.tick < MAX_TICKS && !run.world.sundered) {
    run.step(bot.act(run.world));
  }
  return run.world.sundered;
}

function clears(policy: string): number {
  return SEEDS.filter((seed) => clearsActI(policy, seed)).length;
}

describe('Act I is clearable by a light build, not only by a maxed board', () => {
  it('kite clears Act I on every seed', () => {
    const n = clears('kite');
    expect(n, `kite cleared ${n}/${SEEDS.length}`).toBe(SEEDS.length);
  });

  it('turtle clears Act I on most seeds', () => {
    const n = clears('turtle');
    expect(n, `turtle cleared ${n}/${SEEDS.length}`).toBeGreaterThanOrEqual(5);
  });

  it('a maxed board still clears, so the curve was not simply flattened', () => {
    expect(clears('maxbuild')).toBe(SEEDS.length);
  });
});
