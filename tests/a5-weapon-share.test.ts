/**
 * SPEC A5: across the top-10 sim builds at minute 8 of Act II, no weapon takes
 * more than 35% of total damage dealt.
 *
 * Read as a statement about the metagame rather than about any single build: a
 * mono-tower build necessarily leans on its one weapon (A4 requires those to be
 * viable), so the meaningful measure is each weapon's slice of the damage the
 * top-10 builds deal between them. Logged in QUESTIONS.md.
 */

import { describe, expect, it } from 'vitest';

import { BUILDS, aggregateShares, collect, topTen } from '../tools/a5probe';

const SEEDS = [1, 2, 3, 4, 5, 6];
const CAP = 0.35;

describe('A5 no weapon dominates the metagame', () => {
  const results = collect(SEEDS);
  const top = topTen(results);
  const shares = aggregateShares(top);

  it('has enough builds reaching minute 8 to measure', () => {
    expect(BUILDS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(top.map((r) => r.name)).size).toBeGreaterThanOrEqual(4);
  });

  it('gives no single weapon more than 35% of the top-10 damage', () => {
    const worst = shares[0];
    const readable = shares
      .slice(0, 6)
      .map((s) => `${s.key} ${(s.share * 100).toFixed(1)}%`)
      .join(', ');
    expect(worst, readable).toBeDefined();
    expect(worst.share, readable).toBeLessThanOrEqual(CAP);
  });

  it('spreads damage across several weapons rather than one', () => {
    const weaponShares = shares.filter((s) => !s.key.startsWith('terrain_'));
    const meaningful = weaponShares.filter((s) => s.share >= 0.05);
    expect(meaningful.length, weaponShares.map((s) => s.key).join(',')).toBeGreaterThanOrEqual(4);
  });

  it('does not crown the same weapon in every build', () => {
    const tops = new Set(top.map((r) => r.topWeapon));
    expect(tops.size).toBeGreaterThan(1);
  });
});
