/**
 * DPS summary panel data model (owner feedback `feature-dps-summary`,
 * BACKLOG.md fb007; SPEC-FINAL §11), reshaped by fb160 (owner feedback
 * `ui-dps-panel-bars`): whole-run totals only — no per-wave view — one bar
 * per source, segmented by damage type. The acceptance criterion is that the
 * panel's numbers reconcile with the sim's damage ledgers: these tests check
 * the model against `World.damageBySourceType` and the two flat ledgers
 * (`damageByWeapon`/`damageByType`) it must agree with, and against a real
 * `RunReport` built at run end; `tests/ui-fb160-dps-bars.test.ts` reconciles
 * the *rendered* numbers and colors.
 */

import { describe, expect, it } from 'vitest';

import { World } from '../src/sim/world';
import { damageEnemy, spawnEnemy } from '../src/sim/enemies';
import { Run, startWave } from '../src/sim/run';
import { advanceToNextBlock, finishSundering } from '../src/sim/sundering';
import { makePolicy } from '../src/bots';
import '../src/bots';
import { dpsPanelData, waveDamageBySource } from '../src/ui/dps-panel';
import { cfg, runWithPolicy } from './helpers';

describe('DPS panel data model', () => {
  it('is all zero on a fresh run', () => {
    const w = new World(cfg({ practice: true }));
    const data = dpsPanelData(w);
    expect(data.damage).toBe(0);
    expect(data.dps).toBe(0);
    expect(data.bars).toEqual([]);
  });

  it('credits a hit to its source bar, in the segment of its damage type', () => {
    const w = new World(cfg({ practice: true }));
    const arrow = w.content.towerByKey.get('arrow_spire')!;
    const e = spawnEnemy(w, 'husk', 3, 3)!;
    w.tick = 60; // 1 second elapsed
    damageEnemy(w, e, 50, arrow.key, { type: 'normal' });

    const data = dpsPanelData(w);
    expect(data.damage).toBeGreaterThan(0);
    const bar = data.bars.find((b) => b.key === arrow.key)!;
    expect(bar.label).toBe(arrow.name);
    expect(bar.damage).toBe(data.damage);
    expect(bar.dps).toBeCloseTo(data.damage, 6);
    expect(bar.segments.map((g) => g.type)).toEqual(['normal']);
    expect(bar.segments[0]!.share).toBe(1);
  });

  it('splits one source across the types it dealt, sorted by amount, shares summing to 1', () => {
    const w = new World(cfg({ practice: true }));
    const e = spawnEnemy(w, 'husk', 3, 3)!;
    e.hp = 1e6;
    e.maxHp = 1e6;
    e.armor = 0;
    damageEnemy(w, e, 30, 'tesla_coil', { type: 'normal' });
    damageEnemy(w, e, 10, 'tesla_coil', { type: 'electric' });
    const bar = dpsPanelData(w).bars.find((b) => b.key === 'tesla_coil')!;
    expect(bar.segments.map((g) => g.type)).toEqual(['normal', 'electric']);
    expect(bar.segments.reduce((s, g) => s + g.share, 0)).toBeCloseTo(1, 12);
    expect(bar.segments[0]!.damage).toBeCloseTo(w.damageBySourceType.tesla_coil!.normal!, 12);
    expect(bar.segments[1]!.damage).toBeCloseTo(w.damageBySourceType.tesla_coil!.electric!, 12);
  });

  it('sorts bars by total, the top bar full length and the rest in proportion', () => {
    const w = new World(cfg({ practice: true }));
    const e = spawnEnemy(w, 'husk', 3, 3)!;
    e.hp = 1e6;
    e.maxHp = 1e6;
    e.armor = 0;
    damageEnemy(w, e, 10, 'arrow_spire', { type: 'normal' });
    damageEnemy(w, e, 40, 'mortar', { type: 'burning' });
    const data = dpsPanelData(w);
    expect(data.bars.map((b) => b.key)).toEqual(['mortar', 'arrow_spire']);
    expect(data.bars[0]!.length).toBe(1);
    expect(data.bars[1]!.length).toBeCloseTo(data.bars[1]!.damage / data.bars[0]!.damage, 12);
  });

  it('is whole-run only: a new wave does not reset it (fb160 removed the per-wave view)', () => {
    const w = new World(cfg({ practice: true }));
    const arrow = w.content.towerByKey.get('arrow_spire')!;
    const e1 = spawnEnemy(w, 'husk', 3, 3)!;
    startWave(w);
    w.tick = 60;
    damageEnemy(w, e1, 40, arrow.key, { type: 'normal' });
    startWave(w);
    w.tick = 120;
    const e2 = spawnEnemy(w, 'husk', 4, 4)!;
    damageEnemy(w, e2, 25, arrow.key, { type: 'normal' });
    const data = dpsPanelData(w);
    expect(data).not.toHaveProperty('wave');
    expect(data.damage).toBe(65);
    expect(data.seconds).toBe(2);
  });

  it('stays whole-run across the Sundering and back (Act II damage adds to the same bars)', () => {
    const w = new World(cfg({ practice: true }));
    const arrow = w.content.towerByKey.get('arrow_spire')!;
    const e1 = spawnEnemy(w, 'husk', 3, 3)!;
    w.tick = 60;
    damageEnemy(w, e1, 30, arrow.key, { type: 'poison' });
    finishSundering(w);
    expect(w.huntsWarden).toBe(true);
    w.tick = 360;
    const e2 = w.enemies[0] ?? spawnEnemy(w, 'husk', 4, 4)!;
    damageEnemy(w, e2, 10, arrow.key, { type: 'poison' });
    advanceToNextBlock(w);
    const data = dpsPanelData(w);
    expect(data.damage).toBeCloseTo(40, 6);
    expect(data.bars.find((b) => b.key === arrow.key)!.segments[0]!.damage).toBeCloseTo(40, 6);
  });

  it('labels a mad or converted enemy\'s damage by the Madness King\'s passive, not the raw key (fb160 QA)', () => {
    const w = new World(cfg({ practice: true, classKey: 'madness_king' }));
    const e = spawnEnemy(w, 'husk', 3, 3)!;
    e.hp = 1e6;
    e.maxHp = 1e6;
    damageEnemy(w, e, 10, 'madness', {});
    const cls = w.content.classByKey.get('madness_king')!;
    expect(dpsPanelData(w).bars[0]!.label).toBe(`${cls.name} — ${cls.passive.name} (maddened enemies)`);
  });

  it('colors each segment from data/damagetypes.json, and the colorblind palette on request', () => {
    const w = new World(cfg({ practice: true }));
    const e = spawnEnemy(w, 'husk', 3, 3)!;
    damageEnemy(w, e, 5, 'ember_brazier', { type: 'burning' });
    const fire = w.content.damageTypeByKey.get('burning')!;
    expect(dpsPanelData(w).bars[0]!.segments[0]!.color).toBe(fire.color);
    expect(dpsPanelData(w, true).bars[0]!.segments[0]!.color).toBe(fire.colorblindColor || fire.color);
  });

  /** The three ledgers the bars must agree with, all at once, against a real report. */
  function reconcile(data: ReturnType<typeof dpsPanelData>, report: { damageTotal: number; damageByWeapon: Record<string, number>; damageByType: Record<string, number>; damageBySourceType: Record<string, Record<string, number>> }): void {
    expect(data.damage).toBeCloseTo(report.damageTotal, 2);
    for (const key of Object.keys(report.damageByWeapon)) {
      if ((report.damageByWeapon[key] ?? 0) <= 0) continue;
      const bar = data.bars.find((b) => b.key === key);
      expect(bar, `panel is missing source ${key}`).toBeDefined();
      expect(bar!.damage).toBeCloseTo(report.damageByWeapon[key] ?? 0, 2);
      for (const [type, amount] of Object.entries(report.damageBySourceType[key] ?? {})) {
        if (amount <= 0) continue;
        const seg = bar!.segments.find((g) => g.type === type);
        expect(seg, `${key} is missing its ${type} segment`).toBeDefined();
        expect(seg!.damage).toBeCloseTo(amount, 2);
      }
    }
    // Every type column of the matrix sums to the flat by-type ledger.
    for (const [type, total] of Object.entries(report.damageByType)) {
      const sum = data.bars.reduce((s, b) => s + (b.segments.find((g) => g.type === type)?.damage ?? 0), 0);
      expect(sum, `type ${type}`).toBeCloseTo(total, 2);
    }
  }

  it("reconciles with the real RunReport's ledgers at run end", () => {
    const { report, run } = runWithPolicy(cfg({ policy: 'hybrid', practice: true }), 'hybrid', 60 * 60 * 20);
    expect(report.damageTotal).toBeGreaterThan(0);
    reconcile(dpsPanelData(run.world), report);
  });

  it('reconciles with RunReport through a Sundering into Act II (cycles: 3)', () => {
    const run = new Run(cfg({ policy: 'hybrid', cycles: 3, practice: true }));
    const policy = makePolicy('hybrid');
    const buildTicks = 2530; // ~42s: past the 15s build phase, into real tower-vs-enemy combat
    while (!run.done && run.world.tick < buildTicks) run.step(policy.act(run.world));
    expect(run.done, 'setup died before any Act I combat happened').toBe(false);
    finishSundering(run.world);
    const stop = run.world.tick + 300;
    while (!run.done && run.world.tick < stop) run.step(policy.act(run.world));
    expect(run.world.huntsWarden, 'the harness left Act II too early').toBe(true);
    reconcile(dpsPanelData(run.world), run.report());
  });
});

/**
 * The wave window the DPS panel no longer shows (fb160) still feeds the VS
 * wielded-attacks panel's "This wave" line (fb037), so fb007's window tests
 * — including QA's advanceToNextBlock regression — move here with it rather
 * than disappearing with the panel view.
 */
describe('waveDamageBySource (the VS panel\'s wave window)', () => {
  const at = (w: World, key: string): number => waveDamageBySource(w).find((r) => r.key === key)?.damage ?? 0;

  it('`startWave` isolates the current Act I wave from earlier waves', () => {
    const w = new World(cfg({ practice: true }));
    const arrow = w.content.towerByKey.get('arrow_spire')!;
    const e1 = spawnEnemy(w, 'husk', 3, 3)!;
    startWave(w);
    w.tick = 60;
    damageEnemy(w, e1, 40, arrow.key, { type: 'normal' });
    expect(at(w, arrow.key)).toBe(40);
    startWave(w);
    w.tick = 120;
    expect(at(w, arrow.key)).toBe(0);
    const e2 = spawnEnemy(w, 'husk', 4, 4)!;
    w.tick = 180;
    damageEnemy(w, e2, 25, arrow.key, { type: 'normal' });
    expect(at(w, arrow.key)).toBe(25);
    const row = waveDamageBySource(w).find((r) => r.key === arrow.key)!;
    expect(row.dps).toBeCloseTo(25 / ((180 - 60) / 60), 6); // the second startWave ran at tick 60
  });

  it('the Sundering isolates the current VS wave the same way `act2DamageSoFar` does', () => {
    const w = new World(cfg({ practice: true }));
    const arrow = w.content.towerByKey.get('arrow_spire')!;
    const e1 = spawnEnemy(w, 'husk', 3, 3)!;
    w.tick = 60;
    damageEnemy(w, e1, 30, arrow.key, { type: 'poison' });
    finishSundering(w);
    w.act2Time = 5;
    w.tick = 360;
    const e2 = w.enemies[0] ?? spawnEnemy(w, 'husk', 4, 4)!;
    damageEnemy(w, e2, 10, arrow.key, { type: 'poison' });
    const row = waveDamageBySource(w).find((r) => r.key === arrow.key)!;
    expect(row.damage).toBeCloseTo(10, 6);
    expect(row.dps).toBeCloseTo(2, 6);
  });

  it('advanceToNextBlock resets the window instead of carrying the Sundering snapshot into it (fb007 QA)', () => {
    const w = new World(cfg({ practice: true }));
    const arrow = w.content.towerByKey.get('arrow_spire')!;
    const e1 = spawnEnemy(w, 'husk', 3, 3)!;
    w.tick = 60;
    damageEnemy(w, e1, 30, arrow.key, { type: 'poison' });
    finishSundering(w);
    w.act2Time = 5;
    w.tick = 360;
    const e2 = w.enemies[0] ?? spawnEnemy(w, 'husk', 4, 4)!;
    damageEnemy(w, e2, 10, arrow.key, { type: 'poison' });
    advanceToNextBlock(w);
    expect(w.huntsWarden).toBe(false);
    expect(at(w, arrow.key)).toBe(0);
  });
});
