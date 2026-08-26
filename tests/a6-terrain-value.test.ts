/**
 * SPEC A6: stripping petrified terrain from a sane `hybrid` build reduces Act II
 * survival by at least 20% — placement has to matter after the Sundering.
 *
 * The two arms are identical runs (same seed, same policy, so the same Act I
 * maze and the same soul weapons); only the terrain differs.
 */

import { describe, expect, it } from 'vitest';

import { cfg, runWithPolicy } from './helpers';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * RETIRED (SPEC-FINAL §6.2, reconcile §16) — gate A6.
 *
 * Restated at the SPEC-FINAL reconcile: §6.2 keeps towers on the field in a VS
 * wave as "inert but present" — obstacles that keep HP and contribute the §5 VS
 * special — so what a standing tower is worth is now authored per tower rather
 * than measured in aggregate. **p2c** asserts each VS special directly; the
 * file is deleted at **p2e**. Original V3-era reasoning follows and still holds:
 *
 * A6 measures how much Act II survival is lost by stripping petrified terrain,
 * i.e. it prices the damage and effects standing towers contribute after the
 * Sundering. SPEC-V3 §5 states that towers *do not attack during VS waves* —
 * they remain as solid obstacles with a per-type special. The quantity A6
 * measures stops existing.
 *
 * Kept as a skip, not deleted, until M21. See MIGRATION.md §4.3 and §5.
 */
describe.skip('A6 petrified terrain earns its keep', () => {
  it('stripping the terrain costs at least 20% of Act II survival', () => {
    const withTerrain: number[] = [];
    const without: number[] = [];
    for (const seed of SEEDS) {
      withTerrain.push(runWithPolicy(cfg({ seed }), 'hybrid').report.survivalSeconds);
      without.push(runWithPolicy(cfg({ seed, stripTerrain: true }), 'hybrid').report.survivalSeconds);
    }
    const a = mean(withTerrain);
    const b = mean(without);
    expect(b, `with terrain ${a.toFixed(0)}s vs stripped ${b.toFixed(0)}s`).toBeLessThanOrEqual(a * 0.8);
  });

  it('the two arms really do build the same Act I maze', () => {
    const a = runWithPolicy(cfg({ seed: 4 }), 'hybrid').report;
    const b = runWithPolicy(cfg({ seed: 4, stripTerrain: true }), 'hybrid').report;
    expect(b.towersBuilt).toBe(a.towersBuilt);
    expect(b.towersByKey).toEqual(a.towersByKey);
    expect(b.wavesCleared).toBe(a.wavesCleared);
  });
});
