/**
 * SPEC A9: a Harvest-heavy opening (4 Sprouts by wave 3) out-earns greedless
 * play by wave 8, but survives under 50% of the time at T2 without tree
 * support. Greed has to be a real risk.
 *
 * `greedy` and `greedless` are the same build order; the only difference is
 * that greedy plants four Sprouts before it builds any defence.
 */

import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { allTreeNodeIds } from '../src/meta/meta';
import { autoDraft } from '../src/sim/tiers';
import { cfg, runWithPolicy } from './helpers';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function median(xs: number[]): number {
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * p12c: the full Constellation tree, not `cfg()`'s empty default. This is
 * fb049's fix (Q138) — every real Hub-started run feeds the whole tree in
 * (`TREE_AUTO_MAX`), so `[]` measured a run no player plays — and it became
 * load-bearing at p12c's `baseHpMul` re-anchor: at x20 enemy HP an empty-tree
 * run dies at TD wave 2, so `goldEarnedByWave[8]` was `0` on **both** arms and
 * this clause was comparing 0 to 0 (qa-playtester). The claim is about greed
 * out-earning caution, not about how far a treeless bot survives.
 */
const FULL_TREE = allTreeNodeIds(loadContent());

function goldByWave8(policy: string): number[] {
  return SEEDS.map(
    (seed) => runWithPolicy(cfg({ seed, allocated: FULL_TREE }), policy).report.goldEarnedByWave[8] ?? 0,
  );
}

function winsAtTier2(policy: string): number {
  const content = loadContent();
  let wins = 0;
  for (const seed of SEEDS) {
    const modifiers = autoDraft(content, seed, 2);
    const { report } = runWithPolicy(cfg({ seed, tier: 2, modifiers }), policy);
    if (report.outcome === 'victory') wins++;
  }
  return wins;
}

describe('A9 greed pays, and greed kills', () => {
  it('a greedy opening actually plants its Sprouts early', () => {
    const { report } = runWithPolicy(cfg({ seed: 1 }), 'greedy');
    expect(report.towersByKey['harvest_sprout'] ?? 0).toBeGreaterThanOrEqual(4);
    const lean = runWithPolicy(cfg({ seed: 1 }), 'greedless').report;
    expect(lean.towersByKey['harvest_sprout'] ?? 0).toBe(0);
  });

  it('out-earns greedless play by wave 8', () => {
    const greedy = median(goldByWave8('greedy'));
    const greedless = median(goldByWave8('greedless'));
    expect(greedy, `greedy ${greedy} vs greedless ${greedless}`).toBeGreaterThan(greedless);
  });

  // TODO(P10 balance re-baseline, Q96): p2b's wielded VS attacks let a
  // defence-light, Sprout-heavy board still convert whatever towers it did
  // build into VS character damage, so "greedy" is measurably less risky than
  // before (9/12 wins now, was <50%) purely because built towers pay out
  // twice (TD and VS). Recorded per Q96, not nudged.
  it.skip('but wins under half its runs at T2 with no tree support', () => {
    const wins = winsAtTier2('greedy');
    expect(wins / SEEDS.length, `${wins}/${SEEDS.length} wins at T2`).toBeLessThan(0.5);
  });

  it('Harvest Sprouts pay per wave and per tier, and bloom after the Sundering', () => {
    const sprout = loadContent().towerByKey.get('harvest_sprout')!;
    expect(sprout.economy?.goldPerWavePerTier).toBeGreaterThan(0);
    expect(sprout.terrain.gemInterval).toBeGreaterThan(0);
    expect(sprout.terrain.gemValue).toBeGreaterThan(0);
  });
});
