/**
 * SPEC A2: with the `idle` policy (no towers built) the Core dies on wave 3-4.
 * Towers must be mandatory, but the first two waves must be survivable so the
 * player has a chance to learn.
 */

import { describe, expect, it } from 'vitest';

import { cfg, runWithPolicy } from './helpers';

describe('A2 towers are mandatory', () => {
  it('idle play loses the Core on wave 3 or 4', () => {
    const deathWaves: number[] = [];
    for (let seed = 1; seed <= 25; seed++) {
      const { report } = runWithPolicy(cfg({ seed }), 'idle', 60 * 60 * 20);
      expect(report.outcome, `seed ${seed}`).toBe('defeat_core');
      expect(report.towersBuilt).toBe(0);
      // The wave that was running when the Core fell.
      deathWaves.push(report.wavesCleared + 1);
    }
    for (const wv of deathWaves) {
      expect(wv, `death waves: ${deathWaves.join(',')}`).toBeGreaterThanOrEqual(3);
      expect(wv).toBeLessThanOrEqual(4);
    }
  });

  it('a bot that does build survives well past wave 4', () => {
    for (const policy of ['kite', 'turtle', 'hybrid']) {
      const { report } = runWithPolicy(cfg({ seed: 3 }), policy, 60 * 60 * 20);
      expect(report.towersBuilt, policy).toBeGreaterThan(0);
      expect(report.wavesCleared, policy).toBeGreaterThanOrEqual(5);
    }
  });
});
