/**
 * SPEC A8: a fully-invested Act I build clears Act II with >= 70% win rate,
 * against <= 25% for a minimal-towers rush build on the same bot policy.
 *
 * `maxbuild` spreads across every tower type its class can build and spends
 * spare gold on tiers before widening the maze; `rush` builds the least that
 * still clears Act I and never tiers up. Both kite identically in Act II, so
 * the only variable is the head start the Sundering hands over.
 */

import { describe, expect, it } from 'vitest';

import { cfg, runWithPolicy } from './helpers';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function winRate(policy: string): { rate: number; reachedAct2: number; detail: string } {
  let wins = 0;
  let reached = 0;
  const survivals: number[] = [];
  for (const seed of SEEDS) {
    const { report } = runWithPolicy(cfg({ seed }), policy);
    if (report.wavesCleared >= 10) reached++;
    if (report.outcome === 'victory') wins++;
    survivals.push(Math.round(report.survivalSeconds));
  }
  return {
    rate: wins / SEEDS.length,
    reachedAct2: reached,
    detail: `${policy}: ${wins}/${SEEDS.length} wins, survivals ${survivals.join(',')}`,
  };
}

describe('A8 Act I investment pays off in Act II', () => {
  const max = winRate('maxbuild');
  const rush = winRate('rush');

  it('both arms actually reach Act II, so the comparison is fair', () => {
    expect(max.reachedAct2, max.detail).toBe(SEEDS.length);
    expect(rush.reachedAct2, rush.detail).toBe(SEEDS.length);
  });

  it('a maxed Act I build wins at least 70% of the time', () => {
    expect(max.rate, max.detail).toBeGreaterThanOrEqual(0.7);
  });

  it('a minimal rush build wins at most 25% of the time', () => {
    expect(rush.rate, rush.detail).toBeLessThanOrEqual(0.25);
  });

  it('the head start shows up as soul variety and gold committed', () => {
    const a = runWithPolicy(cfg({ seed: 2 }), 'maxbuild').report;
    const b = runWithPolicy(cfg({ seed: 2 }), 'rush').report;
    const slotted = (r: typeof a) => r.weapons.filter((x) => x.key !== 'wardens_arrow');
    // maxbuild deliberately places fewer structures than rush: it banks the
    // difference into tiers, which is what "all-T3" means.
    expect(slotted(a).length).toBeGreaterThan(slotted(b).length);
    expect(a.goldSpent).toBeGreaterThan(b.goldSpent);
    expect(Object.keys(a.towersByKey).length).toBeGreaterThan(Object.keys(b.towersByKey).length);
  });
});
