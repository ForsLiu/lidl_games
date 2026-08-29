/**
 * DPS summary panel data model (owner feedback `feature-dps-summary`,
 * BACKLOG.md fb007; SPEC-FINAL §11). The acceptance criterion is that the
 * panel's totals reconcile with `RunReport`'s own damage-share telemetry —
 * these tests check the model directly against `World.damageByWeapon`/
 * `damageByType` and, in the last test, against a real `RunReport` built at
 * run end.
 */

import { describe, expect, it } from 'vitest';

import { World } from '../src/sim/world';
import { damageEnemy, spawnEnemy } from '../src/sim/enemies';
import { startWave } from '../src/sim/run';
import { finishSundering } from '../src/sim/sundering';
import { dpsPanelData } from '../src/ui/dps-panel';
import { cfg, runWithPolicy } from './helpers';

describe('DPS panel data model', () => {
  it('is all zero on a fresh run', () => {
    const w = new World(cfg());
    const data = dpsPanelData(w);
    expect(data.run.damage).toBe(0);
    expect(data.run.dps).toBe(0);
    expect(data.run.bySource).toEqual([]);
    expect(data.run.byType).toEqual([]);
    expect(data.wave.damage).toBe(0);
    expect(data.wave.bySource).toEqual([]);
  });

  it('credits a hit to both the by-source and by-type breakdowns, in both windows', () => {
    const w = new World(cfg());
    const arrow = w.content.towerByKey.get('arrow_spire')!;
    const e = spawnEnemy(w, 'husk', 3, 3)!;
    w.tick = 60; // 1 second elapsed
    damageEnemy(w, e, 50, arrow.key, { type: 'normal' });

    const data = dpsPanelData(w);
    expect(data.run.damage).toBeGreaterThan(0);
    expect(data.run.bySource.map((r) => r.key)).toContain(arrow.key);
    expect(data.run.bySource.find((r) => r.key === arrow.key)!.label).toBe(arrow.name);
    expect(data.run.byType.find((r) => r.key === 'normal')!.damage).toBe(data.run.damage);
    // Act I, wave 0 (no `startWave` called yet): the wave window equals the
    // run window since `damageAtWaveStart` is still empty.
    expect(data.wave.damage).toBe(data.run.damage);
    expect(data.wave.dps).toBeCloseTo(data.run.dps, 6);
  });

  it('`startWave` isolates the current Act I wave from earlier waves without touching the whole-run total', () => {
    const w = new World(cfg());
    const arrow = w.content.towerByKey.get('arrow_spire')!;
    const e1 = spawnEnemy(w, 'husk', 3, 3)!;
    startWave(w); // wave 1 begins
    w.tick = 60;
    damageEnemy(w, e1, 40, arrow.key, { type: 'normal' });

    let data = dpsPanelData(w);
    expect(data.wave.damage).toBe(data.run.damage);

    startWave(w); // wave 2 begins: this wave's damage resets to 0
    w.tick = 120;
    data = dpsPanelData(w);
    expect(data.wave.damage).toBe(0);
    expect(data.run.damage).toBe(40); // whole-run total is untouched

    const e2 = spawnEnemy(w, 'husk', 4, 4)!;
    w.tick = 180;
    damageEnemy(w, e2, 25, arrow.key, { type: 'normal' });
    data = dpsPanelData(w);
    expect(data.wave.damage).toBe(25);
    expect(data.run.damage).toBe(65);
  });

  it('the Sundering isolates the current VS wave the same way `act2DamageSoFar` does', () => {
    const w = new World(cfg());
    const arrow = w.content.towerByKey.get('arrow_spire')!;
    const e1 = spawnEnemy(w, 'husk', 3, 3)!;
    w.tick = 60;
    damageEnemy(w, e1, 30, arrow.key, { type: 'poison' });

    finishSundering(w); // enters Act II; snapshots damageAtSunder/Type
    expect(w.huntsWarden).toBe(true);
    w.act2Time = 5;
    w.tick = 360;
    const e2 = w.enemies[0] ?? spawnEnemy(w, 'husk', 4, 4)!;
    damageEnemy(w, e2, 10, arrow.key, { type: 'poison' });

    const data = dpsPanelData(w);
    expect(data.run.damage).toBeCloseTo(40, 6); // 30 + 10, whole run
    expect(data.wave.damage).toBeCloseTo(10, 6); // only what landed after the Sundering
    expect(data.wave.seconds).toBe(5);
    expect(data.wave.dps).toBeCloseTo(2, 6);
  });

  it("reconciles with the real RunReport's damageByWeapon/damageByType at run end", () => {
    const { report, run } = runWithPolicy(cfg({ policy: 'hybrid' }), 'hybrid', 60 * 60 * 20);
    const data = dpsPanelData(run.world);

    expect(report.damageTotal).toBeGreaterThan(0);
    const sourceTotal = data.run.bySource.reduce((sum, r) => sum + r.damage, 0);
    expect(sourceTotal).toBeCloseTo(report.damageTotal, 2);
    for (const key of Object.keys(report.damageByWeapon)) {
      const row = data.run.bySource.find((r) => r.key === key);
      expect(row, `panel is missing source ${key}`).toBeDefined();
      expect(row!.damage).toBeCloseTo(report.damageByWeapon[key], 2);
    }
    for (const key of Object.keys(report.damageByType)) {
      const row = data.run.byType.find((r) => r.key === key);
      expect(row, `panel is missing damage type ${key}`).toBeDefined();
      expect(row!.damage).toBeCloseTo(report.damageByType[key], 2);
    }
  });
});
