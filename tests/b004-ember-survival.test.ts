/**
 * @vitest-environment jsdom
 *
 * BACKLOG b004: `report.survivalSeconds` (drives Ember's completion-fraction
 * reward, `src/meta/meta.ts` `emberFor`) must track cumulative Night survival
 * across cycles, not the current cycle's local Night timer — `w.act2Time`
 * resets to 0 every Dusk->Night transition (`finishSundering`), so a run that
 * survives 2+ full Nights before a mid-cycle death previously reported only
 * the final cycle's local time, underpaying Ember. `report.act2Seconds`
 * (`w.act2Ticks / 60`, never reset) is already cumulative and is the
 * source of truth this test pins `survivalSeconds` against.
 *
 * code-reviewer flagged the same root cause on a second, player-visible
 * surface: the Results screen's "Survived" stat (`src/ui/hud.ts`) read
 * `w.act2Time` directly rather than going through `buildReport`, so it had
 * the identical per-cycle-reset bug. Both are fixed together here.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Run } from '../src/sim/run';
import { World, cycleWaveEnd, nightLengthSeconds } from '../src/sim/world';
import { emptyInput, type Command } from '../src/sim/types';
import { makePolicy } from '../src/bots';
import '../src/bots';
import { Hud } from '../src/ui/hud';
import { cfg } from './helpers';

function forceWaveClear(run: Run, wave: number): void {
  const w = run.world;
  w.phase = 'act1_wave';
  w.wave = wave;
  w.spawnQueue = [];
  w.enemies = [];
  run.step(emptyInput());
}

/**
 * RETIRED (SPEC-FINAL §1.1 and §8) — Ember, and "across Nights".
 *
 * Both halves of this file's premise are gone: §8 replaces the Ember ->
 * account level -> skill point pipeline with skill points granted directly
 * (1 per VS wave cleared), and §1.1 replaces the multi-Night cycle run with 18
 * TD + 6 VS waves, so there is no repeated Night for a survival counter to
 * accumulate across. The claim worth keeping — a defeat still pays out what
 * was fully cleared — is G12, asserted by p7c. File deleted at **p7d**.
 */
describe.skip('BACKLOG b004: survivalSeconds is cumulative across Nights', () => {
  it('a run that reaches Dawn twice reports survivalSeconds === act2Seconds', () => {
    const run = new Run(cfg({ cycles: 3, seed: 1, policy: 'hybrid' }));
    const w = run.world;
    const bot = makePolicy('hybrid');
    // Isolate the reporting bug from combat outcome: this test is about
    // act2Time-vs-act2Ticks bookkeeping across cycles, not survival skill.
    w.invulnerable = true;

    forceWaveClear(run, cycleWaveEnd(w, 1));
    w.duskTimer = 0;
    run.step(emptyInput());
    expect(w.phase).toBe('act2');

    // Play cycle 1's Night out in real ticks (not a forced jump) so both
    // act2Time and act2Ticks advance together, then let it time out into Dawn.
    let guard = 0;
    while (
      (w.phase === 'act2' || w.phase === 'levelup') &&
      w.act2Time < nightLengthSeconds(w, 1) &&
      guard++ < 60 * 60 * 20
    ) {
      run.step(bot.act(w));
    }
    expect(w.phase).toBe('dawn');

    const cmds: Command[] = [{ k: 'dawn_done' }];
    run.step({ ...emptyInput(), cmds });
    expect(w.phase).toBe('act1_build');
    expect(w.cycle).toBe(2);

    forceWaveClear(run, cycleWaveEnd(w, 2));
    w.duskTimer = 0;
    run.step(emptyInput());
    expect(w.phase).toBe('act2');

    // 30s real ticks into cycle 2's Night: `w.act2Time` (local to this Night,
    // reset by `finishSundering`) is far below the cumulative total across
    // both Nights, which `w.act2Ticks` (never reset) has kept accruing.
    guard = 0;
    while (w.act2Time < 30 && guard++ < 60 * 60 * 5) run.step(bot.act(w));
    const report = run.report();

    expect(report.act2Seconds).toBeGreaterThan(nightLengthSeconds(w, 1));
    expect(report.survivalSeconds).toBeCloseTo(report.act2Seconds, 1);
  });
});

/**
 * RETIRED (SPEC-FINAL §1.1) — as above: no multi-cycle death to be cumulative
 * across. The Results screen itself survives as G18. File deleted at **p7d**.
 */
describe.skip('BACKLOG b004: Results screen "Survived" stat is cumulative too', () => {
  const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

  it('reads act2Ticks, not the Night-local act2Time, on a multi-cycle death', () => {
    document.head.innerHTML = `<style>${CSS}</style>`;
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app') as HTMLElement;
    const hud = new Hud(root, {
      onSelectTower: () => {},
      onCallWave: () => {},
      onPickSouls: () => {},
      onPickOffer: () => {},
      onReroll: () => {},
      onRekindle: () => {},
      onDawnDone: () => {},
      onRetry: () => {},
      onNewRun: () => {},
      onToggleRanges: () => {},
      onResume: () => {},
      onPause: () => {},
      onCycleSpeed: () => {},
      onDev: () => {},
      onQuitToHub: () => {},
    });

    const w = new World(cfg({ cycles: 3 }));
    // Simulate dying mid-cycle-3 after two full prior Nights: act2Time is
    // local to the current (reset) Night, act2Ticks is the real cumulative
    // total across all three.
    w.act2Time = 45;
    w.act2Ticks = 60 * (180 + 240 + 45);
    w.outcome = 'defeat_warden';
    w.phase = 'results';
    hud.syncModal(w);

    const resultsText = root.querySelector('.sw-results')?.textContent ?? '';
    expect(resultsText).toContain('7:45');
    expect(resultsText).not.toContain('0:45');
  });
});
