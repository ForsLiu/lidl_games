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

/**
 * RETIRED (SPEC-FINAL §6.1, reconcile §16) — gate A8.
 *
 * Restated at the SPEC-FINAL reconcile: the investment-pays-off claim has no
 * gate of its own in §14 and is **not** carried forward as a separate item —
 * G13 (per-type share and solo viability) and G19 (winning builds include both
 * sealed and open strategies, and multi-summon usage) are together the claim
 * SPEC-FINAL makes about a TD board converting into a VS outcome. V3's m27b is
 * retired with this note rather than re-filed. File deleted at **p2e**.
 * Original V3-era reasoning follows and still holds:
 *
 * A8 prices the Sundering head start: a maxed Act I board should convert into
 * an Act II win rate a minimal board cannot match, under the "highest tier +
 * 8% per duplicate" binding math. SPEC-V3 §5 replaces that math wholesale with
 * the averaged wielding formula, so the specific advantage A8 measures is not
 * the advantage v0.3 grants. Gate C2 replaces the formula half; the
 * investment-pays-off claim itself is worth re-stating against v0.3 and is
 * carried as an open item in BACKLOG (m27b).
 *
 * Kept as a skip, not deleted, until M21. See MIGRATION.md §2.3 and §5.
 */
describe.skip('A8 Act I investment pays off in Act II', () => {
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
    expect(Object.keys(a.towersByKey).length).toBeGreaterThan(Object.keys(b.towersByKey).length);
    // "All-T3" shows up as gold per structure, not as raw gold: maxbuild places
    // fewer towers and tiers them up, rush places more and leaves them at T1.
    expect(a.goldSpent / a.towersBuilt).toBeGreaterThan(b.goldSpent / b.towersBuilt);
  });
});
