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
import { Run, damageSince, startWave } from '../src/sim/run';
import { advanceToNextBlock, finishSundering } from '../src/sim/sundering';
import { makePolicy } from '../src/bots';
import '../src/bots';
import { dpsPanelData } from '../src/ui/dps-panel';
import { cfg, runWithPolicy } from './helpers';

describe('DPS panel data model', () => {
  it('is all zero on a fresh run', () => {
    const w = new World(cfg({ practice: true }));
    const data = dpsPanelData(w);
    expect(data.run.damage).toBe(0);
    expect(data.run.dps).toBe(0);
    expect(data.run.bySource).toEqual([]);
    expect(data.run.byType).toEqual([]);
    expect(data.wave.damage).toBe(0);
    expect(data.wave.bySource).toEqual([]);
  });

  it('credits a hit to both the by-source and by-type breakdowns, in both windows', () => {
    const w = new World(cfg({ practice: true }));
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
    const w = new World(cfg({ practice: true }));
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
    const w = new World(cfg({ practice: true }));
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

  // qa-playtester finding on fb007 (post-commit verification, 2026-08-29):
  // `advanceToNextBlock` (`sim/sundering.ts`) flips the phase back to
  // `act1_build` the instant a VS wave ends, but only `startWave` (the *next*
  // TD wave actually spawning) retakes the `damageAtWaveStart`/
  // `damageTypeAtWaveStart`/`waveStartTick` snapshot. Reproduced on a real
  // hybrid-policy bot run: the whole build-phase countdown between a VS
  // wave's end and the next TD wave's start read the "current wave" window
  // as the stale pre-Sundering snapshot, folding the entire just-finished VS
  // wave's damage and duration under the previous TD wave's label (measured
  // ~96% of a whole run's damage misattributed to "Wave 3" this way).
  it('advanceToNextBlock resets the wave window instead of carrying the Sundering snapshot into it', () => {
    const w = new World(cfg({ practice: true }));
    const arrow = w.content.towerByKey.get('arrow_spire')!;
    const e1 = spawnEnemy(w, 'husk', 3, 3)!;
    w.tick = 60;
    damageEnemy(w, e1, 30, arrow.key, { type: 'poison' }); // pre-Sundering TD damage

    finishSundering(w);
    w.act2Time = 5;
    w.tick = 360;
    const e2 = w.enemies[0] ?? spawnEnemy(w, 'husk', 4, 4)!;
    damageEnemy(w, e2, 10, arrow.key, { type: 'poison' }); // VS-wave damage

    advanceToNextBlock(w); // VS wave ends, back to act1_build; no startWave yet
    expect(w.huntsWarden).toBe(false);

    const data = dpsPanelData(w);
    expect(data.run.damage).toBeCloseTo(40, 6); // whole-run total unaffected
    expect(data.wave.damage).toBe(0);
    expect(data.wave.bySource).toEqual([]);
  });

  it("reconciles with the real RunReport's damageByWeapon/damageByType at run end", () => {
    const { report, run } = runWithPolicy(cfg({ policy: 'hybrid', practice: true }), 'hybrid', 60 * 60 * 20);
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

  // qa-playtester finding on fb007 (round 1): the test above (cycles: 1)
  // never reaches Act II — the bot dies defeat_core in Act I every time — so
  // it only ever exercised the damageAtWaveStart branch of windowData, not
  // the damageAtSunder one, despite the module doc describing both.
  //
  // qa-playtester finding on fb007 (round 2): a first fix asserted
  // `run.world.sundered` *after* `runWithPolicy` returns, but `sundered` is a
  // one-way flag (`sundering.ts`) that stays true long after the world has
  // moved on into `results` — by the time the run loop exits, `huntsWarden`
  // is back to false and `dpsPanelData` has already fallen back to the Act I
  // branch again, same as the cycles:1 test.
  //
  // qa-playtester finding on fb007 (round 3): snapshotting at the *first*
  // tick `huntsWarden && sundered` goes true is a zero/zero instant —
  // `finishSundering` resets `act2Time` to 0 and copies `damageAtSunder` from
  // the current totals on that same tick — so `data.wave.damage`/`seconds`
  // are always 0 there regardless of which snapshot windowData subtracts. A
  // mutation that swapped in `damageAtWaveStart` for the Act II branch still
  // passed every assertion below unchanged, because none of them touched the
  // wave window's actual values. Keep re-snapshotting for a further 300
  // ticks (5s) after the Sundering, inside the VS wave's 75s duration, so the
  // final snapshot holds real accrued Act II damage, and check it against an
  // expectation computed independently from `world.damageAtSunder` directly
  // (a `>0` check alone isn't enough — the wrong snapshot also yields a
  // positive, just incorrect, number; this mutation was verified to slip
  // past a bare `>0` assertion in qa-playtester's round-3 pass).
  it('reconciles with RunReport through a Sundering into Act II (cycles: 3)', () => {
    const run = new Run(cfg({ policy: 'hybrid', cycles: 3, practice: true }));
    const policy = makePolicy('hybrid');
    // fb025 (enemy HP x10 + attacker attack speed x0.7): Act I's own wave
    // clear, which used to reach naturally within this window, no longer
    // reliably happens for any shipped bot (see BALANCE.md/PROGRESS.md) — so
    // this test no longer waits on a natural wave-clear to trigger the
    // Sundering. It instead plays a real, bounded stretch of Act I (towers
    // built and firing at real enemies, so `damageByWeapon` accrues
    // genuinely, exactly like before) and then forces the transition via
    // `finishSundering` directly — the same jump `src/ui/audit-hook.ts`'s
    // dev shortcut already uses, not a new pattern invented for this test.
    const buildTicks = 2530; // ~42s: past the 15s build phase, into real tower-vs-enemy combat
    while (!run.done && run.world.tick < buildTicks) {
      run.step(policy.act(run.world));
    }
    expect(run.done, 'setup died before any Act I combat happened').toBe(false);
    expect(
      Object.keys(run.world.damageByWeapon).length,
      'setup produced no real Act I damage to snapshot at the Sundering',
    ).toBeGreaterThan(0);
    finishSundering(run.world);

    const maxTicks = run.world.tick + 60 * 60 * 45;
    let data: ReturnType<typeof dpsPanelData> | undefined;
    let report: ReturnType<typeof run.report> | undefined;
    let sunderTick: number | undefined;
    while (!run.done && run.world.tick < maxTicks) {
      run.step(policy.act(run.world));
      if (run.world.huntsWarden && run.world.sundered) {
        if (sunderTick === undefined) sunderTick = run.world.tick;
        data = dpsPanelData(run.world);
        report = run.report();
        if (run.world.tick - sunderTick >= 300) break;
      }
    }
    expect(data, 'run never reached the Sundering (huntsWarden && sundered)').toBeDefined();

    const expectedWaveByWeapon = damageSince(run.world.damageByWeapon, run.world.damageAtSunder);
    const expectedWaveDamage = Object.keys(expectedWaveByWeapon).reduce(
      (sum, k) => sum + expectedWaveByWeapon[k],
      0,
    );
    expect(
      expectedWaveDamage,
      'test setup produced no real Act II damage to distinguish the snapshots with',
    ).toBeGreaterThan(0);
    expect(data!.wave.damage).toBeCloseTo(expectedWaveDamage, 6);
    for (const key of Object.keys(expectedWaveByWeapon)) {
      const row = data!.wave.bySource.find((r) => r.key === key);
      expect(row, `wave window is missing source ${key}`).toBeDefined();
      expect(row!.damage).toBeCloseTo(expectedWaveByWeapon[key], 6);
    }
    expect(data!.wave.seconds).toBeGreaterThan(0);

    const sourceTotal = data!.run.bySource.reduce((sum, r) => sum + r.damage, 0);
    expect(sourceTotal).toBeCloseTo(report!.damageTotal, 2);
    for (const key of Object.keys(report!.damageByWeapon)) {
      const row = data!.run.bySource.find((r) => r.key === key);
      expect(row, `panel is missing source ${key}`).toBeDefined();
      expect(row!.damage).toBeCloseTo(report!.damageByWeapon[key], 2);
    }
    for (const key of Object.keys(report!.damageByType)) {
      const row = data!.run.byType.find((r) => r.key === key);
      expect(row, `panel is missing damage type ${key}`).toBeDefined();
      expect(row!.damage).toBeCloseTo(report!.damageByType[key], 2);
    }
    // The whole point of this test: prove the damageAtSunder branch, not
    // damageAtWaveStart, produced the wave window above.
    expect(data!.wave.label).toMatch(/^VS wave/);
  });
});
