/**
 * fb033: Practice tool toggles "Infinite TD waves" / "Infinite VS waves" —
 * the run stays in the chosen phase indefinitely, spawning/fighting with
 * continuing scaling (wave index / cycle keep climbing) until toggled off or
 * the character/Core dies. A practice-run-only extension of `run.ts`'s
 * `applyDevCommand` (SPEC has no such mode; see practice.test.ts).
 */

import { describe, expect, it } from 'vitest';

import { Run, waveHpScale } from '../src/sim/run';
import { timeHpScale, vsBudgetBaseline, budgetFor } from '../src/sim/act2';
import { emptyInput } from '../src/sim/types';
import type { TickInput } from '../src/sim/types';
import { cfg } from './helpers';

function step(run: Run, cmds: TickInput['cmds'] = []): void {
  run.step({ ...emptyInput(), cmds });
}

/** Drives a fresh Act I run into its first VS wave via the `skip_wave` practice tool. */
function advanceToAct2(run: Run): void {
  let guard = 0;
  while (run.world.phase !== 'act2' && guard < 40) {
    step(run, [{ k: 'dev', op: 'skip_wave', amount: 0 }]);
    guard++;
  }
  expect(run.world.phase).toBe('act2');
}

describe('fb033 practice tool: infinite waves', () => {
  it('toggle_infinite_td and toggle_infinite_vs flip their World flags, off by default, no-op outside practice', () => {
    const run = new Run({ ...cfg(), practice: true, policy: 'none' });
    expect(run.world.infiniteTdWaves).toBe(false);
    expect(run.world.infiniteVsWaves).toBe(false);
    step(run, [{ k: 'dev', op: 'toggle_infinite_td', amount: 0 }]);
    expect(run.world.infiniteTdWaves).toBe(true);
    step(run, [{ k: 'dev', op: 'toggle_infinite_vs', amount: 0 }]);
    expect(run.world.infiniteVsWaves).toBe(true);
    step(run, [{ k: 'dev', op: 'toggle_infinite_td', amount: 0 }]);
    expect(run.world.infiniteTdWaves).toBe(false);

    const off = new Run({ ...cfg(), policy: 'none' });
    step(off, [
      { k: 'dev', op: 'toggle_infinite_td', amount: 0 },
      { k: 'dev', op: 'toggle_infinite_vs', amount: 0 },
    ]);
    expect(off.world.infiniteTdWaves).toBe(false);
    expect(off.world.infiniteVsWaves).toBe(false);
    expect(off.world.practiceUsed).toBe(false);
  });

  it('with the toggle off, wave 18 hands off to the VS wave exactly as an ordinary run does', () => {
    const run = new Run({ ...cfg(), practice: true, cycles: 1, policy: 'none' });
    advanceToAct2(run);
    expect(run.world.wave).toBe(18);
    expect(run.world.sundered).toBe(true);
  });

  it('with Infinite TD waves on, the run stays in Act I past the authored 18-wave table (30+ waves), HP scaling still climbing', () => {
    const run = new Run({ ...cfg(), practice: true, cycles: 1, policy: 'none' });
    step(run, [{ k: 'dev', op: 'toggle_infinite_td', amount: 0 }]);
    expect(run.world.infiniteTdWaves).toBe(true);

    let guard = 0;
    while (run.world.wave < 31 && guard < 200) {
      step(run, [{ k: 'dev', op: 'skip_wave', amount: 0 }]);
      guard++;
    }
    expect(run.world.wave).toBeGreaterThanOrEqual(31);
    expect(['act1_build', 'act1_wave']).toContain(run.world.phase);
    expect(run.world.sundered).toBe(false);
    expect(run.world.outcome).toBe('running');
    // Continuing HP scale: waves past the authored table keep compounding
    // `hpScalePerWave`, the same as the pre-existing Long Watch (`extraWaves`)
    // past-the-table path `buildSpawnQueue` already used.
    expect(waveHpScale(run.world, run.world.wave)).toBeGreaterThan(waveHpScale(run.world, 18));

    // Toggling back off lets the very next completed wave hand off normally.
    step(run, [{ k: 'dev', op: 'toggle_infinite_td', amount: 0 }]);
    while (run.world.phase !== 'act2' && guard < 240) {
      step(run, [{ k: 'dev', op: 'skip_wave', amount: 0 }]);
      guard++;
    }
    expect(run.world.phase).toBe('act2');
  });

  it('qa-playtester finding: waveHpScale stays finite thousands of waves into Infinite TD waves', () => {
    // The TD-side twin of the VS overflow above: `skip_wave`-spamming
    // Infinite TD waves past wave ~3600 used to overflow `waveHpScale`
    // (1.22^(wave-1)) to Infinity, the same unkillable-enemy symptom
    // `WAVE_SCALE_CAP` (run.ts) now caps against.
    const run = new Run({ ...cfg(), practice: true, cycles: 1, policy: 'none' });
    step(run, [{ k: 'dev', op: 'toggle_infinite_td', amount: 0 }]);
    let guard = 0;
    while (run.world.wave < 4000 && guard < 9000) {
      step(run, [{ k: 'dev', op: 'skip_wave', amount: 0 }]);
      guard++;
    }
    expect(run.world.wave).toBeGreaterThanOrEqual(4000);
    expect(Number.isFinite(waveHpScale(run.world, run.world.wave))).toBe(true);
  });

  it('with Infinite VS waves on, the VS wave restarts in place instead of handing back to TD, cycle keeps climbing, for 5+ blocks', () => {
    // A high `cycles` ceiling keeps every block boundary this test crosses
    // finite (`nightLengthSeconds` only goes Infinity once `cycle >=
    // totalCycles`) so the block-restart path, not the "never fires because
    // the timer is already infinite" edge, is what's under test.
    const run = new Run({ ...cfg(), practice: true, cycles: 10, policy: 'none' });
    advanceToAct2(run);
    const startCycle = run.world.cycle;
    const startCleared = run.world.vsWavesCleared;

    step(run, [{ k: 'dev', op: 'toggle_infinite_vs', amount: 0 }]);
    expect(run.world.infiniteVsWaves).toBe(true);

    const vsWaveSeconds = run.world.content.waves.vsWaveSeconds;
    for (let i = 0; i < 5; i++) {
      // `fast_forward` lands act2Time exactly at the block's length; the same
      // tick's own `dt` (added before the length check runs) carries it over.
      step(run, [{ k: 'dev', op: 'fast_forward', amount: vsWaveSeconds }]);
      expect(run.world.phase).toBe('act2');
      expect(run.world.outcome).toBe('running');
    }
    expect(run.world.cycle).toBe(startCycle + 5);
    expect(run.world.vsWavesCleared).toBe(startCleared + 5);
    // Never handed back to a TD block along the way.
    expect(run.world.phase).toBe('act2');
  });

  it('qa-playtester finding: exponential VS scaling stays finite thousands of blocks into Infinite VS waves', () => {
    // `restartVsBlock`'s `cycle++` is the one path that can push `w.cycle`
    // past any real run's `totalCycles` bound — QA found `timeHpScale`
    // (1.1^minutes) and `vsBudgetBaseline` (1.21^(cycle-1)) both overflow to
    // Infinity a few thousand blocks in, producing unkillable (hp=Infinity)
    // enemies. `SCALE_CYCLE_CAP` in act2.ts caps their input; `w.cycle`
    // itself (asserted below) is untouched, so display/telemetry keeps
    // climbing exactly as the toggle promises.
    const run = new Run({ ...cfg(), practice: true, cycles: 1, policy: 'none' });
    advanceToAct2(run);
    step(run, [{ k: 'dev', op: 'toggle_infinite_vs', amount: 0 }]);
    const vsWaveSeconds = run.world.content.waves.vsWaveSeconds;
    for (let i = 0; i < 5000; i++) {
      step(run, [{ k: 'dev', op: 'fast_forward', amount: vsWaveSeconds }]);
    }
    expect(run.world.cycle).toBeGreaterThan(4000);
    expect(Number.isFinite(vsBudgetBaseline(run.world, run.world.cycle))).toBe(true);
    expect(Number.isFinite(timeHpScale(run.world))).toBe(true);
    expect(Number.isFinite(budgetFor(run.world))).toBe(true);
  });

  it('code-reviewer finding: blocks keep restarting once cycle reaches totalCycles, not just below it', () => {
    // `nightLengthSeconds` (untouched by fb033) returns Infinity once `cycle
    // >= totalCycles` — the SPEC-FINAL §1.1 "only the last block has no
    // timer" rule. `cycles: 1` puts the run at exactly that boundary the
    // instant it reaches Act II, which is the case the first version of this
    // fix silently froze on (`restartVsBlock` never fired again once
    // `w.act2Time`'s own timeout branch stopped being reachable).
    const run = new Run({ ...cfg(), practice: true, cycles: 1, policy: 'none' });
    advanceToAct2(run);
    expect(run.world.cycle).toBeGreaterThanOrEqual(run.world.totalCycles);
    step(run, [{ k: 'dev', op: 'toggle_infinite_vs', amount: 0 }]);

    const vsWaveSeconds = run.world.content.waves.vsWaveSeconds;
    const startCycle = run.world.cycle;
    for (let i = 0; i < 5; i++) {
      step(run, [{ k: 'dev', op: 'fast_forward', amount: vsWaveSeconds }]);
      expect(run.world.phase).toBe('act2');
      expect(run.world.outcome).toBe('running');
    }
    expect(run.world.cycle).toBe(startCycle + 5);
  });

  it('Infinite VS waves suppresses the Warden-Eater boss-kill ending while it stays on', () => {
    const run = new Run({ ...cfg(), practice: true, cycles: 1, policy: 'none' });
    advanceToAct2(run);
    expect(run.world.cycle).toBeGreaterThanOrEqual(run.world.totalCycles);
    step(run, [{ k: 'dev', op: 'toggle_infinite_vs', amount: 0 }]);
    step(run, [{ k: 'dev', op: 'summon_boss', amount: 0 }]);
    for (let i = 0; i < 5; i++) step(run);
    // The spawn itself, not just the run's outcome, must stay suppressed —
    // `summon_boss` only moves the clock; the actual spawn is gated on
    // `finalNight`, which the toggle forces false.
    expect(run.world.bossSpawned).toBe(false);
    expect(run.world.enemies.some((e) => e.boss)).toBe(false);
    expect(run.world.outcome).toBe('running');
    expect(run.world.phase).toBe('act2');
  });

  it('replays exactly from its input log with both toggles and skip_wave-driven progress in it', () => {
    const cmdsAt: Record<number, TickInput['cmds']> = {
      5: [{ k: 'dev', op: 'toggle_infinite_td', amount: 0 }],
      10: [{ k: 'dev', op: 'skip_wave', amount: 0 }],
      20: [{ k: 'dev', op: 'skip_wave', amount: 0 }],
      30: [{ k: 'dev', op: 'skip_wave', amount: 0 }],
      40: [{ k: 'dev', op: 'skip_wave', amount: 0 }],
      50: [{ k: 'dev', op: 'toggle_infinite_td', amount: 0 }],
    };
    const hashes = [0, 1].map(() => {
      const run = new Run({ ...cfg(), practice: true, cycles: 1, policy: 'none' });
      for (let t = 0; t < 120; t++) {
        run.step({ ...emptyInput(), mx: t % 4 === 0 ? 1 : 0, cmds: cmdsAt[t] ?? [] });
      }
      return run.hash();
    });
    expect(hashes[0]).toBe(hashes[1]);
  });
});
