/**
 * @vitest-environment jsdom
 *
 * fb082: the floating rails (fb065) and boss banner (fb072) used to anchor to
 * `.sw-stage`'s full box, which drifts away from the canvas's own letterboxed
 * rect at any container aspect ratio other than the grid's 36:20 — both
 * items' own DONE notes logged this without filing it. `Hud.update()` now
 * re-derives `Renderer.resize()`'s (src/render/canvas.ts) letterboxing math
 * from `.sw-stage`'s `clientWidth`/`clientHeight` and publishes the canvas's
 * offset from each stage edge as `--cv-*` CSS custom properties the
 * `.sw-rail`/`.sw-bossbar` rules key off (style.css), falling back to the old
 * stage-edge-relative behavior whenever the stage isn't laid out.
 *
 * jsdom never runs real layout (`clientWidth`/`clientHeight` read 0 by
 * default), so these tests stub them via `defineProperty` — the same idiom
 * `tests/render-fb065-stage-fill.test.ts` already uses for `Renderer.resize()`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Hud } from '../src/ui/hud';
import { World } from '../src/sim/world';
import type { DevOp } from '../src/sim/types';
import { cfg } from './helpers';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function mount(): HTMLElement {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  return document.getElementById('app') as HTMLElement;
}

function makeHud(root: HTMLElement): Hud {
  return new Hud(root, {
    onSelectTower: () => {},
    onCallWave: () => {},
    onPickOffer: () => {},
    onReroll: () => {},
    onRetry: () => {},
    onNewRun: () => {},
    onToggleRanges: () => {},
    onToggleAutoPick: () => {},
    onToggleCharacterPanel: () => {},
    onEquipItem: () => {},
    onToggleDpsPanel: () => {},
    onToggleVsPanel: () => {},
    onResume: () => {},
    onPause: () => {},
    onCycleSpeed: () => {},
    onSetSpeed: () => {},
    onDev: (_op: DevOp) => {},
    onQuitToHub: () => {},
    onHoverSkill: () => {},
    onUpgradeStructure: () => {},
    onSellStructure: () => {},
    onUpgradeCore: () => {},
    onHoverWieldedTower: () => {},
  });
}

function stubStageSize(root: HTMLElement, w: number, h: number): void {
  const stage = root.querySelector('.sw-stage') as HTMLElement;
  Object.defineProperty(stage, 'clientWidth', { value: w, configurable: true });
  Object.defineProperty(stage, 'clientHeight', { value: h, configurable: true });
}

function cvVars(root: HTMLElement): Record<string, string> {
  const stage = root.querySelector('.sw-stage') as HTMLElement;
  return {
    left: stage.style.getPropertyValue('--cv-left'),
    right: stage.style.getPropertyValue('--cv-right'),
    top: stage.style.getPropertyValue('--cv-top'),
    bottom: stage.style.getPropertyValue('--cv-bottom'),
    cx: stage.style.getPropertyValue('--cv-cx'),
  };
}

describe('fb082: overlay anchor geometry tracks the letterboxed canvas, not the raw stage box', () => {
  it('derives a nonzero left/right letterbox gap for a height-bound (wide/short) container', () => {
    const root = mount();
    const hud = makeHud(root);
    const w = new World(cfg());
    hud.buildTowerBar(w);
    stubStageSize(root, 4000, 300);

    hud.update(w);

    // aspect = 36/20 = 1.8; height-bound: cssW = round(min(4000, 300*1.8)) = 540, cssH = 300.
    expect(cvVars(root)).toEqual({
      left: '1730px',
      right: '1730px',
      top: '0px',
      bottom: '0px',
      cx: '2000px',
    });
  });

  it('derives a nonzero top/bottom letterbox gap for a width-bound (narrow/tall) container', () => {
    const root = mount();
    const hud = makeHud(root);
    const w = new World(cfg());
    hud.buildTowerBar(w);
    stubStageSize(root, 900, 1000);

    hud.update(w);

    // width-bound: cssW = round(min(900, 1000*1.8)) = 900, cssH = 900/1.8 = 500.
    expect(cvVars(root)).toEqual({
      left: '0px',
      right: '0px',
      top: '250px',
      bottom: '250px',
      cx: '450px',
    });
  });

  it('falls back to the old stage-edge-relative geometry when the stage has no real layout (jsdom default)', () => {
    const root = mount();
    const hud = makeHud(root);
    const w = new World(cfg());
    hud.buildTowerBar(w);
    // No stubStageSize() call: clientWidth/clientHeight stay 0, jsdom's default.

    hud.update(w);

    expect(cvVars(root)).toEqual({ left: '', right: '', top: '', bottom: '', cx: '' });
  });

  it('never emits a negative offset even when Renderer.resize()-style rounding would overshoot by a sub-pixel amount', () => {
    const root = mount();
    const hud = makeHud(root);
    const w = new World(cfg());
    hud.buildTowerBar(w);
    // qa-playtester (fb082 verification): clientHeight=801 makes Math.round(801*1.8)
    // round the derived cssW up enough that cssH slightly exceeds 801, which would
    // otherwise surface as a tiny negative --cv-top/--cv-bottom.
    stubStageSize(root, 3000, 801);

    hud.update(w);

    const v = cvVars(root);
    expect(parseFloat(v.left)).toBeGreaterThanOrEqual(0);
    expect(parseFloat(v.right)).toBeGreaterThanOrEqual(0);
    expect(parseFloat(v.top)).toBeGreaterThanOrEqual(0);
    expect(parseFloat(v.bottom)).toBeGreaterThanOrEqual(0);
  });

  it('re-derives geometry on a later update() once the stage is resized (a live window resize)', () => {
    const root = mount();
    const hud = makeHud(root);
    const w = new World(cfg());
    hud.buildTowerBar(w);
    stubStageSize(root, 4000, 300);
    hud.update(w);
    expect(cvVars(root).left).toBe('1730px');

    stubStageSize(root, 900, 1000);
    hud.update(w);
    expect(cvVars(root).left).toBe('0px');
    expect(cvVars(root).top).toBe('250px');
  });
});
