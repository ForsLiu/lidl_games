/** SPEC A11: same seed + input log produces an identical end-state hash, 100/100. */

import { describe, expect, it } from 'vitest';

import { cfg, makeInputLog, replay } from './helpers';
import { Rng, RngSet, fnv1a } from '../src/sim/rng';
import { dcos, dsin, datan2 } from '../src/sim/math';
import { loadContent } from '../src/sim/content';
import { rollRelic } from '../src/sim/loot';
import type { Command, TickInput } from '../src/sim/types';

/**
 * Layers `class_active` (periodically) and one `equip` command onto a
 * movement-noise log from `makeInputLog`. `equip` (SPEC-V2 stash mechanic,
 * `{k:'equip', relic}`) has no case in `applyCommand`'s switch (`src/sim/run.ts`)
 * — it falls through to `default: break` and is a dead command in the sim
 * today (q15/q22's filed bug; relics only ever apply via `RunConfig.relics`
 * at construction, never through an in-run Command). It is fired here anyway
 * so this test documents that determinism holds even through a no-op command,
 * rather than silently only testing the command that is known to do something.
 */
function withSkillCommands(log: TickInput[], relicId: number): TickInput[] {
  return log.map((input, t) => {
    const cmds: Command[] = input.cmds.slice();
    if (t > 0 && t % 300 === 0) cmds.push({ k: 'class_active' });
    if (t === 50) cmds.push({ k: 'equip', relic: relicId });
    return { ...input, cmds };
  });
}

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

  // QUALITY.md ALPHA's determinism line reads "100/100 replay hash match,
  // including class actives and uniques" — the 100-seed test above never
  // fires a class_active or equip Command. This widens the same
  // record-twice-compare-hash property to an input log that fires both,
  // across several seeds, so ALPHA's literal claim is actually exercised.
  it('reproduces the end-state hash across seeds with class_active and equip in the input log', () => {
    const TICKS = 2400;
    const content = loadContent();
    const relic = rollRelic(content, new Rng(31), 0, 1);
    for (const seed of [1, 5, 13, 42, 87]) {
      const log = withSkillCommands(makeInputLog(seed, TICKS), relic.id);
      const config = cfg({ seed, relics: [relic] });
      const a = replay(config, log);
      const b = replay(config, log);
      expect(b.endHash, `seed ${seed}`).toBe(a.endHash);
      expect(b.ticks).toBe(a.ticks);
      expect(b.kills).toBe(a.kills);
      expect(b.damageTotal).toBe(a.damageTotal);
    }
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
