/**
 * @vitest-environment jsdom
 *
 * fb160 (BACKLOG-UI.md, owner feedback `ui-dps-panel-bars`, SPEC-FINAL §11):
 * the DPS panel's segmented-bar redesign — "total damage at the top, then
 * one horizontal bar per source ... each bar segmented by damage TYPE in
 * the damage-type colors, with the source's total number printed at the
 * right end of its bar; sorted by total. Hover a segment: that type's
 * amount and percent." Moved from BACKLOG-UI.md to BACKLOG.md per CLAUDE.md's
 * lane rule ("blocked on new main-lane sim state" — the combined
 * `damageByWeapon` x `damageByType` matrix, `World.damageByWeaponType`, is
 * `src/sim/**` state outside the UI lane's Scope).
 *
 * Acceptance: bars render from the run report; numbers reconcile with the
 * sim's damage ledger (test); colors from `data/damagetypes.json`.
 */

import { describe, expect, it } from 'vitest';

import { World } from '../src/sim/world';
import { damageEnemy, spawnEnemy } from '../src/sim/enemies';
import { damageMatrixSince, hashWorld, startWave } from '../src/sim/run';
import { finishSundering } from '../src/sim/sundering';
import { dpsPanelData } from '../src/ui/dps-panel';
import { dpsPanelBodyMarkup } from '../src/ui/hud';
import { cfg, runWithPolicy } from './helpers';

describe('fb160 DPS panel segmented bars', () => {
  it('damageByWeaponType credits the same dmgBooked as damageByWeapon/damageByType, per source per type', () => {
    const w = new World(cfg({ practice: true }));
    const arrow = w.content.towerByKey.get('arrow_spire')!;
    const e = spawnEnemy(w, 'husk', 3, 3)!;
    damageEnemy(w, e, 50, arrow.key, { type: 'normal' });
    const e2 = spawnEnemy(w, 'husk', 4, 4)!;
    damageEnemy(w, e2, 30, arrow.key, { type: 'poison' });

    expect(w.damageByWeaponType[arrow.key]).toEqual({ normal: 50, poison: 30 });
    expect(w.damageByWeapon[arrow.key]).toBe(80);
    expect(w.damageByType.normal).toBe(50);
    expect(w.damageByType.poison).toBe(30);
  });

  it('a bySource row segments its own damage by type, sorted by damage descending, summing back to the row total', () => {
    const w = new World(cfg({ practice: true }));
    const arrow = w.content.towerByKey.get('arrow_spire')!;
    const e1 = spawnEnemy(w, 'husk', 3, 3)!;
    damageEnemy(w, e1, 20, arrow.key, { type: 'normal' });
    const e2 = spawnEnemy(w, 'husk', 4, 4)!;
    damageEnemy(w, e2, 80, arrow.key, { type: 'poison' });

    const row = dpsPanelData(w).run.bySource.find((r) => r.key === arrow.key)!;
    expect(row.damage).toBe(100);
    expect(row.segments.map((s) => s.key)).toEqual(['poison', 'normal']); // 80 > 20
    const segSum = row.segments.reduce((sum, s) => sum + s.damage, 0);
    expect(segSum).toBeCloseTo(row.damage, 6);
    expect(row.segments.find((s) => s.key === 'poison')!.percent).toBeCloseTo(80, 6);
    expect(row.segments.find((s) => s.key === 'normal')!.percent).toBeCloseTo(20, 6);
  });

  it('segment colors come from data/damagetypes.json, switching to colorblindColor when requested', () => {
    const w = new World(cfg({ practice: true }));
    const arrow = w.content.towerByKey.get('arrow_spire')!;
    const e = spawnEnemy(w, 'husk', 3, 3)!;
    damageEnemy(w, e, 10, arrow.key, { type: 'normal' });

    const normalDef = w.content.damageTypeByKey.get('normal')!;
    const row = dpsPanelData(w, false).run.bySource.find((r) => r.key === arrow.key)!;
    expect(row.segments[0]!.color).toBe(normalDef.color);

    const rowCb = dpsPanelData(w, true).run.bySource.find((r) => r.key === arrow.key)!;
    expect(rowCb.segments[0]!.color).toBe(normalDef.colorblindColor);
  });

  it('damageMatrixSince isolates a window the same way damageSince does for the flat accumulators', () => {
    const w = new World(cfg({ practice: true }));
    const arrow = w.content.towerByKey.get('arrow_spire')!;
    const e1 = spawnEnemy(w, 'husk', 3, 3)!;
    damageEnemy(w, e1, 20, arrow.key, { type: 'normal' });
    startWave(w); // wave 1 begins: snapshots the matrix

    const e2 = spawnEnemy(w, 'husk', 4, 4)!;
    damageEnemy(w, e2, 15, arrow.key, { type: 'poison' });

    const sinceWave = damageMatrixSince(w.damageByWeaponType, w.damageMatrixAtWaveStart);
    expect(sinceWave[arrow.key]).toEqual({ poison: 15 });
    expect(w.damageByWeaponType[arrow.key]).toEqual({ normal: 20, poison: 15 }); // whole-run total untouched
  });

  it('a snapshot taken via startWave/finishSundering is a real per-row copy, not aliased to the live matrix', () => {
    const w = new World(cfg({ practice: true }));
    const arrow = w.content.towerByKey.get('arrow_spire')!;
    const e1 = spawnEnemy(w, 'husk', 3, 3)!;
    damageEnemy(w, e1, 20, arrow.key, { type: 'normal' });
    finishSundering(w); // snapshots damageMatrixAtSunder
    const snapshotRow = w.damageMatrixAtSunder[arrow.key]!;

    const e2 = w.enemies[0] ?? spawnEnemy(w, 'husk', 4, 4)!;
    damageEnemy(w, e2, 5, arrow.key, { type: 'normal' });

    // The live matrix moved; the earlier snapshot reference must not have.
    expect(w.damageByWeaponType[arrow.key]!.normal).toBe(25);
    expect(snapshotRow.normal).toBe(20);
  });

  it('the whole-run window reconciles with a real RunReport at run end, matrix included', () => {
    const { report, run } = runWithPolicy(cfg({ policy: 'hybrid', practice: true }), 'hybrid', 60 * 60 * 20);
    const data = dpsPanelData(run.world);

    for (const row of data.run.bySource) {
      const reportRow = report.damageByWeaponType[row.key] ?? {};
      const segSum = row.segments.reduce((sum, s) => sum + s.damage, 0);
      expect(segSum, `segments for ${row.key} don't sum to its own row total`).toBeCloseTo(row.damage, 2);
      for (const seg of row.segments) {
        expect(seg.damage, `${row.key}/${seg.key} disagrees with the report`).toBeCloseTo(
          reportRow[seg.key] ?? 0,
          2,
        );
      }
    }
  });

  it('two worlds with identical damageByWeapon/damageByType marginals but a different source x type split hash differently', () => {
    const wA = new World(cfg({ practice: true }));
    const arrow = wA.content.towerByKey.get('arrow_spire')!;
    const cannon = wA.content.towers.towers.find((t) => t.key !== arrow.key)!;
    const eA1 = spawnEnemy(wA, 'husk', 3, 3)!;
    damageEnemy(wA, eA1, 30, arrow.key, { type: 'normal' });
    const eA2 = spawnEnemy(wA, 'husk', 4, 4)!;
    damageEnemy(wA, eA2, 30, cannon.key, { type: 'poison' });

    const wB = new World(cfg({ practice: true }));
    const eB1 = spawnEnemy(wB, 'husk', 3, 3)!;
    damageEnemy(wB, eB1, 30, arrow.key, { type: 'poison' });
    const eB2 = spawnEnemy(wB, 'husk', 4, 4)!;
    damageEnemy(wB, eB2, 30, cannon.key, { type: 'normal' });

    // Same marginals both ways: damageByWeapon = {arrow:30, cannon:30}; damageByType = {normal:30, poison:30}.
    expect(wA.damageByWeapon).toEqual(wB.damageByWeapon);
    expect(wA.damageByType).toEqual(wB.damageByType);
    expect(hashWorld(wA)).not.toBe(hashWorld(wB));
  });

  it('renders one segmented bar per source, sorted by total descending, total at the bar\'s right end', () => {
    const w = new World(cfg({ practice: true }));
    const arrow = w.content.towerByKey.get('arrow_spire')!;
    const cannon = w.content.towers.towers.find((t) => t.key !== arrow.key)!;
    const e1 = spawnEnemy(w, 'husk', 3, 3)!;
    damageEnemy(w, e1, 40, arrow.key, { type: 'normal' });
    const e2 = spawnEnemy(w, 'husk', 4, 4)!;
    damageEnemy(w, e2, 90, cannon.key, { type: 'poison' });

    const body = dpsPanelBodyMarkup(dpsPanelData(w));
    const doc = new DOMParser().parseFromString(`<div>${body}</div>`, 'text/html');
    const rows = Array.from(doc.querySelectorAll('.sw-dps-bar-row'));
    expect(rows.length).toBe(2);
    // cannon (90) sorts before arrow (40).
    expect(rows[0]!.querySelector('.sw-dps-bar-label')!.textContent).toBe(cannon.name);
    expect(rows[0]!.querySelector('.sw-dps-bar-total')!.textContent).toBe('90');
    expect(rows[1]!.querySelector('.sw-dps-bar-label')!.textContent).toBe(arrow.name);
    expect(rows[1]!.querySelector('.sw-dps-bar-total')!.textContent).toBe('40');

    const seg = rows[0]!.querySelector('.sw-dps-seg') as HTMLElement;
    expect(seg.getAttribute('title')).toContain('Poison');
    expect(seg.getAttribute('title')).toContain('90');
    expect(seg.getAttribute('title')).toContain('100');

    // Owner feedback: "whole-run totals only (no per-wave view)".
    expect(body).not.toMatch(/Wave \d/);
    expect(body).not.toContain('By damage type');
  });
});
