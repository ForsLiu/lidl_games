/**
 * @vitest-environment jsdom
 *
 * fb106: an in-scope alternative to fb093 (which needs `tools/ui-audit.ts`
 * scenes, outside this lane's Scope). QUALITY.md 1.0's "16:9/16:10/ultrawide
 * safe" checklist line has no committed regression coverage of
 * `Hud.syncStageOverlayGeometry()`'s (hud.ts) letterboxing math at extreme
 * aspect ratios — the `.sw-rail`/`.sw-bossbar` overlays (style.css) key off
 * its published `--cv-*` custom properties, so a broken calculation there
 * would silently place both off the visible canvas at an ultrawide or
 * narrow/portrait container size, with none of the existing
 * `tests/ui-fb082-overlay-geometry.test.ts` cases (a 4000x300 and a 900x1000
 * container) anywhere near either extreme.
 *
 * Same jsdom `clientWidth`/`clientHeight` stubbing idiom as
 * `tests/ui-fb082-overlay-geometry.test.ts`/`tests/ui-fb102-bossbar-rail-overlap.test.ts`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Hud } from '../src/ui/hud';
import { World } from '../src/sim/world';
import { GRID_W, GRID_H } from '../src/sim/grid';
import type { DevOp } from '../src/sim/types';
import { cfg } from './helpers';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');
const GRID_ASPECT = GRID_W / GRID_H;

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

function cvVars(root: HTMLElement): { left: number; right: number; top: number; bottom: number; cx: number } {
  const stage = root.querySelector('.sw-stage') as HTMLElement;
  const num = (name: string) => {
    const raw = stage.style.getPropertyValue(name);
    expect(raw).not.toBe('');
    return parseFloat(raw);
  };
  return { left: num('--cv-left'), right: num('--cv-right'), top: num('--cv-top'), bottom: num('--cv-bottom'), cx: num('--cv-cx') };
}

function assertLetterboxWithinContainer(root: HTMLElement, availW: number, availH: number): void {
  const v = cvVars(root);
  expect(v.left).toBeGreaterThanOrEqual(0);
  expect(v.right).toBeGreaterThanOrEqual(0);
  expect(v.top).toBeGreaterThanOrEqual(0);
  expect(v.bottom).toBeGreaterThanOrEqual(0);

  const cssW = availW - v.left - v.right;
  const cssH = availH - v.top - v.bottom;
  // No dimension of the derived canvas rect may exceed the container.
  expect(cssW).toBeLessThanOrEqual(availW);
  expect(cssH).toBeLessThanOrEqual(availH);
  expect(cssW).toBeGreaterThan(0);
  expect(cssH).toBeGreaterThan(0);
  // Guards against a degenerate broken calc (e.g. one that zeroes every
  // offset) trivially satisfying the bounds checks above without actually
  // letterboxing to the grid's aspect ratio.
  expect(cssW / cssH).toBeCloseTo(GRID_ASPECT, 1);
  // The published center must sit inside the derived canvas rect, not just
  // inside the container.
  expect(v.cx).toBeGreaterThanOrEqual(v.left);
  expect(v.cx).toBeLessThanOrEqual(availW - v.right);
}

describe('fb106: overlay letterbox geometry stays inside the container at extreme aspect ratios', () => {
  it('ultrawide (2560x1080, height-bound) container', () => {
    const root = mount();
    const hud = makeHud(root);
    const w = new World(cfg());
    hud.buildTowerBar(w);
    stubStageSize(root, 2560, 1080);

    hud.update(w);

    assertLetterboxWithinContainer(root, 2560, 1080);
  });

  it('narrow/portrait (1024x1280, width-bound) container', () => {
    const root = mount();
    const hud = makeHud(root);
    const w = new World(cfg());
    hud.buildTowerBar(w);
    stubStageSize(root, 1024, 1280);

    hud.update(w);

    assertLetterboxWithinContainer(root, 1024, 1280);
  });
});
