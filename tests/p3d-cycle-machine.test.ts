/**
 * p3d — SPEC-FINAL §1.1/§6.2: the V2 Day/Dusk/Night/Dawn phase machine
 * (Dusk's 15s cinematic wait, Dawn's Rekindle-or-Leave ledger) is deleted
 * outright; every TD-block <-> VS-wave transition is now immediate
 * (`finishSundering`/`advanceToNextBlock`, src/sim/sundering.ts). Two things
 * the deleted `tests/f001-cycle-machine.test.ts` covered lost their only
 * regression coverage along with it:
 *
 * - a real built tower actually un-petrifying for free, live again, at the
 *   next block (code review flagged `advanceToNextBlock`'s un-petrify loop
 *   as untested — a silent regression there would permanently stop every
 *   tower from firing past the first VS wave);
 * - the still-live per-cycle elite/heat knobs `data/waves.json` deliberately
 *   keeps authored (`eliteMulByCycle`, `nightMinuteOffsetPerCycle`) for
 *   `p3e` to re-baseline, read every Act II tick by `cycleEliteMul`/
 *   `act2Minute` regardless of the phase-machine deletion.
 */

import { describe, expect, it } from 'vitest';

import { act2Minute } from '../src/sim/act2';
import { applyCommand, Run } from '../src/sim/run';
import { checkBuild } from '../src/sim/towers';
import { emptyInput } from '../src/sim/types';
import { cycleEliteMul } from '../src/sim/world';
import { cfg } from './helpers';

function findBuildableTile(run: Run, towerId: number): { tx: number; ty: number } {
  const w = run.world;
  for (let ty = 4; ty < 20; ty++) {
    for (let tx = 4; tx < 20; tx++) {
      w.warden.x = tx + 0.5;
      w.warden.y = ty + 0.5;
      if (checkBuild(w, towerId, tx, ty) === null) return { tx, ty };
    }
  }
  throw new Error('no buildable tile found');
}

describe('p3d: the cycle machine is gone; every block transition is immediate', () => {
  it('a real tower petrifies for a VS wave and un-petrifies for free, live again, at the very next TD block', () => {
    const run = new Run(cfg({ cycles: 2, seed: 1 }));
    const w = run.world;
    w.invulnerable = true;
    w.godMode = true;
    w.gold = 1e6;

    const arrowSpireId = w.content.towerByKey.get('arrow_spire')!.id;
    const { tx, ty } = findBuildableTile(run, arrowSpireId);
    applyCommand(w, { k: 'build', tower: arrowSpireId, tx, ty });
    const s = w.structureAt(tx, ty)!;
    expect(s).toBeTruthy();
    expect(s.petrified).toBe(false);

    // Clear this block's 3 TD waves (tdWavesPerVsWave) to reach its VS wave.
    for (let i = 0; i < 3; i++) {
      w.buildTimer = 0;
      run.step(emptyInput());
      expect(w.phase).toBe('act1_wave');
      w.spawnQueue = [];
      w.enemies = [];
      run.step(emptyInput());
    }
    // The transition into the VS wave is immediate (p3d): no Dusk wait.
    expect(w.phase).toBe('act2');
    expect(s.petrified).toBe(true);
    expect(s.dead).toBe(false);

    // Run the VS wave's timer out; the next block un-petrifies every live
    // tower for free — there is no Rekindle cost and nothing to choose.
    w.act2Time = w.content.waves.vsWaveSeconds;
    run.step(emptyInput());
    expect(w.phase).toBe('act1_build');
    expect(w.cycle).toBe(2);
    expect(s.petrified).toBe(false);
    expect(s.dead).toBe(false);
  });

  it("cycleEliteMul still reads data/waves.json's per-cycle eliteMulByCycle table (deferred to p3e, not touched by the phase-machine deletion)", () => {
    const w = new Run(cfg({ cycles: 3 })).world;
    const table = w.content.waves.eliteMulByCycle ?? {};
    expect(cycleEliteMul(w, 1)).toBe(table['1'] ?? 1);
    expect(cycleEliteMul(w, 2)).toBe(table['2'] ?? 1);
    expect(cycleEliteMul(w, 3)).toBe(table['3'] ?? 1);
    // Pins today's authored row so a silent edit to the table is caught here too.
    expect(cycleEliteMul(w, 2)).toBe(2);
  });

  it('act2Minute still compounds nightMinuteOffsetPerCycle per block (deferred to p3e, not touched by the phase-machine deletion)', () => {
    const w = new Run(cfg({ cycles: 3 })).world;
    const offset = w.content.waves.nightMinuteOffsetPerCycle ?? 0;
    expect(offset).toBeGreaterThan(0);

    w.act2Time = 60;
    w.cycle = 1;
    expect(act2Minute(w)).toBe(1);

    w.cycle = 2;
    expect(act2Minute(w)).toBe(Math.floor(1 + offset));
  });
});
