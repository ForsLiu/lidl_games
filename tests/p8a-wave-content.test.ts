/**
 * p8a: SPEC-FINAL §9/§1.1's two scaling curves, and the Warden-Eater's
 * VS-wave-6 placement. `data/waves.json`'s 18 TD rows and the Gatebreaker's
 * TD-18-only placement are covered by `content-complete.test.ts`'s own
 * updated cases; this file covers the acceptance clauses that had no test at
 * all before this item: the TD HP curve and VS budget curve each asserted at
 * three sample points, and the Warden-Eater's cycle gate.
 */
import { describe, expect, it } from 'vitest';

import { World } from '../src/sim/world';
import { waveHpScale, startWave } from '../src/sim/run';
import { vsBudgetBaseline, shouldSpawnBoss, spawnFinalBoss } from '../src/sim/act2';
import { GRID_H, GRID_W } from '../src/sim/grid';
import { cfg } from './helpers';

describe('p8a wave content (SPEC-FINAL §9, §1.1)', () => {
  it('TD HP scale is exactly 1.30^(wave-1) at waves 1, 9 and 18', () => {
    const w = new World(cfg());
    expect(waveHpScale(w, 1)).toBeCloseTo(1, 10);
    expect(waveHpScale(w, 9)).toBeCloseTo(Math.pow(1.3, 8), 10);
    expect(waveHpScale(w, 18)).toBeCloseTo(Math.pow(1.3, 17), 10);
  });

  it('VS budget baseline is exactly 150 x 1.21^(waveIndex) at cycles 1, 3 and 6', () => {
    const w = new World(cfg());
    // cycle 1 = block 1 = waveIndex 0, ... cycle 6 = block 6 = waveIndex 5.
    expect(vsBudgetBaseline(w, 1)).toBeCloseTo(150, 10);
    expect(vsBudgetBaseline(w, 3)).toBeCloseTo(150 * Math.pow(1.21, 2), 10);
    expect(vsBudgetBaseline(w, 6)).toBeCloseTo(150 * Math.pow(1.21, 5), 10);
  });

  it('a run with no budgetGrowthPerVsWave configured falls back to no cross-wave escalation', () => {
    const w = new World(cfg());
    // `SpawnsFileSchema`'s field is optional for back-compat (p8a) — simulate
    // an older data file that never set it. `w.content` is the module-level
    // cached `loadContent()` singleton (not cloned per-`World`), so the
    // field is saved and restored rather than deleted outright, in case a
    // later test in this file (or a change to vitest's isolation) ever reads
    // it again.
    const spawns = w.content.spawns as { budgetGrowthPerVsWave?: number };
    const saved = spawns.budgetGrowthPerVsWave;
    delete spawns.budgetGrowthPerVsWave;
    try {
      expect(vsBudgetBaseline(w, 1)).toBeCloseTo(150, 10);
      expect(vsBudgetBaseline(w, 6)).toBeCloseTo(150, 10);
    } finally {
      spawns.budgetGrowthPerVsWave = saved;
    }
  });

  it('the Warden-Eater is gated to the final VS wave (cycle 6 of the default 6-cycle run)', () => {
    const w = new World(cfg({ cycles: 6 }));
    w.phase = 'act2';
    w.sundered = true;
    w.warden.x = GRID_W / 2;
    w.warden.y = GRID_H / 2;
    w.updateNav(true);
    w.act2Time = w.content.spawns.bossTimeSeconds;

    w.cycle = 5;
    expect(w.cycle >= w.totalCycles).toBe(false);

    w.cycle = 6;
    expect(w.totalCycles).toBe(6);
    expect(w.cycle >= w.totalCycles).toBe(true);
    expect(shouldSpawnBoss(w)).toBe(true);
    spawnFinalBoss(w);
    expect(w.enemies.some((e) => e.def.key === 'warden_eater')).toBe(true);
  });

  // QA-filed bug (this item): `buildSpawnQueue`'s pre-existing repeat-last-row
  // fallback for waves past the authored table (Long Watch's `extraWaves`)
  // used to re-trigger a second and third Gatebreaker on waves 19/20, since
  // wave 18's own row — now the one every over-length wave repeats — carries
  // one. Fixed in `src/sim/run.ts`'s `buildSpawnQueue` by dropping any
  // `boss`-trait group once a wave falls back past the table's end.
  it('Long Watch (extraWaves) does not repeat the Gatebreaker past wave 18', () => {
    const w = new World(cfg({ modifiers: ['longwatch'], cycles: 6 }));
    expect(w.waveCount).toBeGreaterThan(18);
    for (let wave = 1; wave <= w.waveCount; wave++) {
      w.wave = wave - 1;
      startWave(w);
      const hasGatebreaker = w.spawnQueue.some(([defId]) => w.content.enemyById.get(defId)?.key === 'gatebreaker');
      expect(hasGatebreaker, `wave ${wave}`).toBe(wave === 18);
    }
  });
});
