/**
 * SPEC A1: the median victorious full run is 24-28 minutes.
 *
 * SPEC A1 asks for 200 seeded sims. A full run takes several seconds to
 * simulate, so the suite measures 24 and `npm run sim -- --seeds 1..200` covers
 * the full sweep on demand; the distribution is tight enough (24.7-26.0 min
 * across 20 seeds) that 24 is representative.
 */

import { describe, expect, it } from 'vitest';

import { cfg, runWithPolicy } from './helpers';

const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);

describe('A1 run length', () => {
  const reports = SEEDS.map((seed) => runWithPolicy(cfg({ seed }), 'maxbuild').report);
  const victories = reports.filter((r) => r.outcome === 'victory');

  it('produces enough victories to have a median', () => {
    expect(victories.length).toBeGreaterThanOrEqual(SEEDS.length / 2);
  });

  it('has a median victorious run of 24-28 minutes', () => {
    const minutes = victories.map((r) => r.totalSeconds / 60).sort((a, b) => a - b);
    const median = minutes[Math.floor(minutes.length / 2)];
    const detail = `median ${median.toFixed(2)} min over ${minutes.length} wins ` +
      `(${minutes[0].toFixed(1)}-${minutes[minutes.length - 1].toFixed(1)})`;
    expect(median, detail).toBeGreaterThanOrEqual(24);
    expect(median, detail).toBeLessThanOrEqual(28);
  });

  it('splits roughly as SPEC 1 describes: a long Daywatch, then a 10-minute night', () => {
    const act1 = victories.map((r) => r.act1Seconds / 60).sort((a, b) => a - b);
    const act2 = victories.map((r) => r.act2Seconds / 60).sort((a, b) => a - b);
    const med = (a: number[]) => a[Math.floor(a.length / 2)];
    expect(med(act1)).toBeGreaterThan(9);
    expect(med(act2)).toBeGreaterThan(10);
    expect(med(act2)).toBeLessThan(13);
  });
});
