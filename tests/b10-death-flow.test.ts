/**
 * @vitest-environment jsdom
 *
 * SPEC-V2 D1 / gate B10: a Night-phase Warden death and a Day-phase Core death
 * both reach a defeat Results screen with Retry / New Run / Hub, instead of
 * the old bug where `outcome` left 'running' but `phase` never followed, so
 * the run was stuck mid-frame with no modal and no way to pause out (Esc was
 * gated on `outcome === 'running'`, which a stuck defeat never cleared).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Run, damageWarden } from '../src/sim/run';
import { World } from '../src/sim/world';
import { emptyInput } from '../src/sim/types';
import { spawnEnemy } from '../src/sim/enemies';
import { CORE_X, CORE_Y } from '../src/sim/grid';
import { Hud } from '../src/ui/hud';
import { cfg } from './helpers';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function act2Run(): Run {
  const run = new Run(cfg());
  const w = run.world;
  w.phase = 'act2';
  w.sundered = true;
  w.warden.x = 18;
  w.warden.y = 10;
  w.updateNav(true);
  return run;
}

describe('Night-phase Warden death (SPEC-V2 D1)', () => {
  it('does not resolve to Results the instant the Warden dies', () => {
    const run = act2Run();
    damageWarden(run.world, 999999);
    run.step(emptyInput());
    // The bug this regresses: outcome flipped straight to a terminal value
    // with phase left behind at 'act2', so the run could neither reach a
    // Results screen nor be paused (Esc is gated on outcome === 'running').
    expect(run.world.outcome).toBe('running');
    expect(run.world.phase).toBe('act2');
    expect(run.done).toBe(false);
  });

  it('reaches Results after the 1.5s slow-mo beat, not before', () => {
    const run = act2Run();
    damageWarden(run.world, 999999);
    for (let i = 0; i < 85; i++) run.step(emptyInput());
    expect(run.world.outcome).toBe('running');
    expect(run.world.phase).toBe('act2');

    // 1.5s of ticks at 60Hz is 90, +/- one for float accumulation on the countdown.
    let ticks = 85;
    while (!run.done && ticks < 95) {
      run.step(emptyInput());
      ticks++;
    }
    expect(ticks).toBeLessThanOrEqual(91);
    expect(run.world.outcome).toBe('defeat_warden');
    expect(run.world.phase).toBe('results');
    expect(run.done).toBe(true);
  });

  it('freezes the Warden during the slow-mo beat instead of leaving it controllable', () => {
    const run = act2Run();
    damageWarden(run.world, 999999);
    const x0 = run.world.warden.x;
    const y0 = run.world.warden.y;
    for (let i = 0; i < 30; i++) run.step({ ...emptyInput(), mx: 1, my: 1 });
    expect(run.world.warden.x).toBe(x0);
    expect(run.world.warden.y).toBe(y0);
  });
});

describe('Day-phase Core death (SPEC-V2 D1)', () => {
  it('reaches Results after the same slow-mo beat', () => {
    const run = new Run(cfg());
    run.world.coreHp = 0;
    for (let i = 0; i < 85; i++) run.step(emptyInput());
    expect(run.world.outcome).toBe('running');
    expect(run.world.phase).not.toBe('results');

    let ticks = 85;
    while (!run.done && ticks < 95) {
      run.step(emptyInput());
      ticks++;
    }
    expect(ticks).toBeLessThanOrEqual(91);
    expect(run.world.outcome).toBe('defeat_core');
    expect(run.world.phase).toBe('results');
    expect(run.done).toBe(true);
  });

  it('never shows a negative Core HP while enemies keep leaking through the slow-mo beat', () => {
    const run = new Run(cfg());
    const w = run.world;
    w.phase = 'act1_wave';
    w.coreHp = 1;
    // Standing directly on the Core tile leaks the instant the wave update
    // runs, no travel time needed, so every tick of the beat lands a leak.
    for (let i = 0; i < 95; i++) {
      spawnEnemy(w, 'husk', CORE_X + 0.5, CORE_Y + 0.5, { hpMul: 1, gate: 0, overlay: false });
      run.step(emptyInput());
      expect(w.coreHp).toBeGreaterThanOrEqual(0);
    }
    expect(run.world.outcome).toBe('defeat_core');
    expect(run.world.phase).toBe('results');
  });
});

function mountHud(): { root: HTMLElement; hud: Hud; log: Record<string, number> } {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
  const log = { retry: 0, newrun: 0, hub: 0 };
  const hud = new Hud(root, {
    onSelectTower: () => {},
    onCallWave: () => {},
    onPickOffer: () => {},
    onReroll: () => {},
    onRetry: () => log.retry++,
    onNewRun: () => log.newrun++,
    onToggleRanges: () => {},
    onToggleAutoPick: () => {},
    onToggleCharacterPanel: () => {},
    onEquipItem: () => {},
    onToggleDpsPanel: () => {},
    onResume: () => {},
    onPause: () => {},
    onCycleSpeed: () => {},
    onDev: () => {},
    onQuitToHub: () => log.hub++,
  });
  return { root, hud, log };
}

describe('the Results screen offers Retry / New run / Hub from every defeat', () => {
  it('Night-phase Warden death: all three buttons reach their callback', () => {
    const { root, hud, log } = mountHud();
    const w = new World(cfg());
    w.outcome = 'defeat_warden';
    w.phase = 'results';
    hud.syncModal(w);
    expect(root.querySelector('.sw-card h2')?.textContent).toMatch(/Warden fell/);
    (root.querySelector('[data-act="retry"]') as HTMLButtonElement).click();
    (root.querySelector('[data-act="newrun"]') as HTMLButtonElement).click();
    (root.querySelector('[data-act="hub"]') as HTMLButtonElement).click();
    expect(log).toEqual({ retry: 1, newrun: 1, hub: 1 });
  });

  it('Day-phase Core death: same three buttons, same callbacks', () => {
    const { root, hud, log } = mountHud();
    const w = new World(cfg());
    w.outcome = 'defeat_core';
    w.phase = 'results';
    hud.syncModal(w);
    expect(root.querySelector('.sw-card h2')?.textContent).toMatch(/Core fell/);
    (root.querySelector('[data-act="hub"]') as HTMLButtonElement).click();
    expect(log.hub).toBe(1);
  });
});
