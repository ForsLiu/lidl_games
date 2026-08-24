/** SPEC A11: same seed + input log produces an identical end-state hash, 100/100. */

import { describe, expect, it } from 'vitest';

import { cfg, makeInputLog, replay } from './helpers';
import { Rng, RngSet, fnv1a } from '../src/sim/rng';
import { dcos, dsin, datan2 } from '../src/sim/math';

describe('A11 determinism', () => {
  it('reproduces the end-state hash for 100 seeds', () => {
    const TICKS = 2400; // 40 s of play: covers build phases, waves and leaks
    for (let seed = 1; seed <= 100; seed++) {
      const log = makeInputLog(seed, TICKS);
      const a = replay(cfg({ seed }), log);
      const b = replay(cfg({ seed }), log);
      expect(b.endHash, `seed ${seed}`).toBe(a.endHash);
      expect(b.ticks).toBe(a.ticks);
      expect(b.kills).toBe(a.kills);
      expect(b.damageTotal).toBe(a.damageTotal);
    }
  });

  it('produces different hashes for different seeds', () => {
    const log = makeInputLog(7, 1800);
    const hashes = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      hashes.add(replay(cfg({ seed }), log).endHash);
    }
    expect(hashes.size).toBeGreaterThan(1);
  });
});

describe('rng streams', () => {
  it('is stable for a given seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  it('gives each named stream an independent sequence', () => {
    const s = new RngSet(99);
    const first = [s.waves.next(), s.spawns.next(), s.drops.next(), s.offers.next(), s.ai.next()];
    expect(new Set(first).size).toBe(5);
    const t = new RngSet(99);
    expect([t.waves.next(), t.spawns.next(), t.drops.next(), t.offers.next(), t.ai.next()]).toEqual(
      first,
    );
  });

  it('draws uniformly enough for weighted picks', () => {
    const rng = new Rng(4);
    const counts = [0, 0, 0];
    for (let i = 0; i < 30000; i++) counts[rng.weightedIndex([1, 2, 3])]++;
    expect(counts[0] / 30000).toBeGreaterThan(0.13);
    expect(counts[0] / 30000).toBeLessThan(0.2);
    expect(counts[2] / 30000).toBeGreaterThan(0.45);
    expect(counts[2] / 30000).toBeLessThan(0.55);
  });

  it('hashes strings stably', () => {
    expect(fnv1a('waves')).toBe(fnv1a('waves'));
    expect(fnv1a('waves')).not.toBe(fnv1a('spawns'));
  });
});

describe('deterministic math', () => {
  it('approximates sin/cos closely', () => {
    for (let i = -40; i <= 40; i++) {
      const a = i * 0.15;
      expect(Math.abs(dsin(a) - Math.sin(a))).toBeLessThan(1e-6);
      expect(Math.abs(dcos(a) - Math.cos(a))).toBeLessThan(1e-6);
    }
  });

  it('approximates atan2 closely', () => {
    for (let i = -8; i <= 8; i++) {
      for (let j = -8; j <= 8; j++) {
        if (i === 0 && j === 0) continue;
        expect(Math.abs(datan2(j, i) - Math.atan2(j, i))).toBeLessThan(1e-4);
      }
    }
  });
});
