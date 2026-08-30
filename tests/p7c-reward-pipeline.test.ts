/**
 * p7c — SPEC-FINAL §8 rewards pipeline (gate G12's last clause). fb015 already
 * built and tested the equipment half (`tests/fb015-equipment.test.ts`: 1
 * random item per TD wave fully cleared) and "orbs nowhere" already had a live
 * test (`tests/c7-no-orbs.test.ts`); this file covers the piece the gate audit
 * (`tools/gate-audit.ts`'s `KNOWN_HOLES.G12`) named as the one still missing:
 * "each VS wave cleared -> 1 skill point," granted at run end, win or lose,
 * for VS waves *fully* cleared — the same rule §8.1 states for TD waves.
 */

import { describe, expect, it } from 'vitest';

import { applyRunResult, defaultMeta, deserializeMeta, serializeMeta } from '../src/meta/meta';
import { emptyInput } from '../src/sim/types';
import type { RunReport } from '../src/sim/types';
import { damageWarden, Run } from '../src/sim/run';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

/** Clears the current block's TD waves the same way p3d-cycle-machine.test.ts does. */
function clearBlockTdWaves(run: Run): void {
  const w = run.world;
  const n = w.content.waves.tdWavesPerVsWave;
  for (let i = 0; i < n; i++) {
    w.buildTimer = 0;
    run.step(emptyInput());
    expect(w.phase).toBe('act1_wave');
    w.spawnQueue = [];
    w.enemies = [];
    run.step(emptyInput());
  }
}

describe('p7c: VS waves fully cleared pay skill points (§8.2, G12)', () => {
  it('a non-final block VS wave that runs its full length credits exactly 1', () => {
    const run = new Run(cfg({ cycles: 2, seed: 1 }));
    const w = run.world;
    w.invulnerable = true;
    w.godMode = true;

    clearBlockTdWaves(run);
    expect(w.phase).toBe('act2');
    expect(w.vsWavesCleared).toBe(0);

    w.act2Time = w.content.waves.vsWaveSeconds;
    run.step(emptyInput());

    expect(w.phase).toBe('act1_build');
    expect(w.cycle).toBe(2);
    expect(w.vsWavesCleared).toBe(1);
  });

  it('the final block only credits on the boss kill, not the timer, and a report totals every block cleared', () => {
    const run = new Run(cfg({ cycles: 2, seed: 1 }));
    const w = run.world;
    w.invulnerable = true;
    w.godMode = true;

    clearBlockTdWaves(run);
    w.act2Time = w.content.waves.vsWaveSeconds;
    run.step(emptyInput());
    expect(w.vsWavesCleared).toBe(1);
    expect(w.wavesCleared).toBe(w.content.waves.tdWavesPerVsWave);
    expect(w.equipmentFound.length).toBe(w.wavesCleared);

    clearBlockTdWaves(run);
    expect(w.phase).toBe('act2');
    expect(w.cycle).toBe(2);

    // The final block's timer alone must not credit a clear.
    w.act2Time = w.content.waves.vsWaveSeconds;
    run.step(emptyInput());
    expect(w.vsWavesCleared).toBe(1);
    expect(w.outcome).toBe('running');

    // Only the boss kill ends the final block.
    w.bossKilled = true;
    run.step(emptyInput());
    expect(w.outcome).toBe('victory');
    expect(w.vsWavesCleared).toBe(2);

    const report = run.report();
    expect(report.vsWavesCleared).toBe(2);
    expect(report.wavesCleared).toBe(w.content.waves.tdWavesPerVsWave * 2);
    expect(report.equipmentFound).toBe(report.wavesCleared);
  });

  it('a defeat mid-VS-wave does not credit the wave in progress, but keeps every already-cleared block', () => {
    const run = new Run(cfg({ cycles: 2, seed: 1 }));
    const w = run.world;
    w.invulnerable = true;
    w.godMode = true;

    // First block clears in full.
    clearBlockTdWaves(run);
    w.act2Time = w.content.waves.vsWaveSeconds;
    run.step(emptyInput());
    expect(w.vsWavesCleared).toBe(1);

    // Second block's TD waves clear, but its VS wave is cut short by defeat.
    clearBlockTdWaves(run);
    expect(w.phase).toBe('act2');
    const tdWavesSoFar = w.wavesCleared;
    w.invulnerable = false;
    w.godMode = false;
    damageWarden(w, w.warden.hp + 1);
    // A lethal hit during the VS wave starts the defeat slow-mo beat rather
    // than landing the outcome instantly (SPEC-V2 D1) — step past it.
    for (let i = 0; i < 200 && w.outcome === 'running'; i++) run.step(emptyInput());

    expect(w.outcome).toBe('defeat_warden');
    // The block that was interrupted never reached its own timer/boss-kill end.
    expect(w.vsWavesCleared).toBe(1);

    const report = run.report();
    expect(report.vsWavesCleared).toBe(1);
    // Every TD wave actually cleared before the defeat still pays out.
    expect(report.wavesCleared).toBe(tdWavesSoFar);
    expect(report.equipmentFound).toBe(tdWavesSoFar);
  });
});

describe('p7c: the meta layer banks exactly report.vsWavesCleared skill points at run end', () => {
  function reportWith(over: Partial<RunReport> = {}): RunReport {
    return {
      seed: 1,
      policy: 'none',
      classKey: 'engineer',
      core: 'stone_heart',
      tier: 1,
      modifiers: [],
      outcome: 'victory',
      ticks: 0,
      totalSeconds: 0,
      act1Seconds: 0,
      act2Seconds: 0,
      wavesCleared: 0,
      vsWavesCleared: 0,
      coreHp: 100,
      coreMaxHp: 500,
      goldEarned: 0,
      goldSpent: 0,
      goldLeft: 0,
      towersBuilt: 0,
      towersByKey: {},
      survivalSeconds: 0,
      level: 1,
      kills: 0,
      leaks: 0,
      damageByWeapon: {},
      damageByType: {},
      damageTotal: 0,
      damageThroughMinute8: null,
      spawnedByWave: [],
      leaksByWave: [],
      goldEarnedByWave: [],
      topWeaponShareMinute8: 0,
      topWeaponMinute8: '',
      boons: {},
      typeMastery: {},
      skillCards: {},
      equipmentFound: 0,
      bossKilled: false,
      bossKillSeconds: 0,
      endHash: '',
      practiceUsed: false,
      ...over,
    };
  }

  it('grants 1 skill point per VS wave cleared, win or lose', () => {
    const w = new World(cfg());
    const won = applyRunResult(defaultMeta(), reportWith({ vsWavesCleared: 4, outcome: 'victory' }), w);
    expect(won.skillPoints).toBe(4);

    const lost = applyRunResult(defaultMeta(), reportWith({ vsWavesCleared: 2, outcome: 'defeat_warden' }), w);
    expect(lost.skillPoints).toBe(2);
  });

  it('accumulates across runs rather than replacing the total', () => {
    const w = new World(cfg());
    const meta = defaultMeta();
    const afterFirst = applyRunResult(meta, reportWith({ vsWavesCleared: 3 }), w);
    expect(afterFirst.skillPoints).toBe(3);
    const afterSecond = applyRunResult(afterFirst, reportWith({ vsWavesCleared: 5 }), w);
    expect(afterSecond.skillPoints).toBe(8);
  });

  it('a practice run banks nothing, the same rule Ember and equipment already follow', () => {
    const w = new World(cfg());
    const meta = applyRunResult(defaultMeta(), reportWith({ vsWavesCleared: 6, practiceUsed: true }), w);
    expect(meta.skillPoints).toBe(0);
  });

  it('round-trips through save/load, and a corrupt value falls back to 0 rather than laundering NaN', () => {
    const meta = { ...defaultMeta(), skillPoints: 42 };
    expect(deserializeMeta(serializeMeta(meta)).skillPoints).toBe(42);

    const corrupt = JSON.stringify({ version: 3, meta: { ...meta, skillPoints: 'lots' } });
    expect(deserializeMeta(corrupt).skillPoints).toBe(0);

    const missing = JSON.stringify({ version: 3, meta: { ...meta, skillPoints: undefined } });
    expect(deserializeMeta(missing).skillPoints).toBe(0);
  });
});

