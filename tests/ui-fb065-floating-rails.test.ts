/**
 * @vitest-environment jsdom
 *
 * fb065: the HUD's build/info columns are floating rails anchored to the
 * playfield stage's own edges (overlays), not an opaque `.sw-side` gutter that
 * reserves horizontal layout space beside the canvas — owner feedback
 * `feature-ui-inside-playfield`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

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

describe('fb065: floating rails replace the opaque .sw-side column', () => {
  let root: HTMLElement;
  let hud: Hud;

  beforeEach(() => {
    root = mount();
    hud = makeHud(root);
    hud.buildTowerBar(new World(cfg()));
  });

  it('renders no .sw-side element — its old children now live in two rails', () => {
    expect(root.querySelector('.sw-side')).toBeNull();
    expect(root.querySelector('#sw-rail-left')).not.toBeNull();
    expect(root.querySelector('#sw-rail-right')).not.toBeNull();
  });

  it('keeps every pre-existing child id reachable inside a rail', () => {
    for (const id of ['sw-controls', 'sw-practice', 'sw-bar']) {
      expect(root.querySelector('#sw-rail-left')?.querySelector(`#${id}`), id).not.toBeNull();
    }
    for (const id of ['sw-progress', 'sw-stats', 'sw-towerinfo']) {
      expect(root.querySelector('#sw-rail-right')?.querySelector(`#${id}`), id).not.toBeNull();
    }
  });

  it('the left rail handle collapses only the left rail', () => {
    const leftRail = root.querySelector('#sw-rail-left') as HTMLElement;
    const rightRail = root.querySelector('#sw-rail-right') as HTMLElement;
    expect(leftRail.classList.contains('collapsed')).toBe(false);

    (root.querySelector('#sw-rail-left-handle') as HTMLElement).click();
    expect(leftRail.classList.contains('collapsed')).toBe(true);
    expect(rightRail.classList.contains('collapsed')).toBe(false);

    (root.querySelector('#sw-rail-left-handle') as HTMLElement).click();
    expect(leftRail.classList.contains('collapsed')).toBe(false);
  });

  it('the right rail handle collapses only the right rail', () => {
    const leftRail = root.querySelector('#sw-rail-left') as HTMLElement;
    const rightRail = root.querySelector('#sw-rail-right') as HTMLElement;

    (root.querySelector('#sw-rail-right-handle') as HTMLElement).click();
    expect(rightRail.classList.contains('collapsed')).toBe(true);
    expect(leftRail.classList.contains('collapsed')).toBe(false);

    (root.querySelector('#sw-rail-right-handle') as HTMLElement).click();
    expect(rightRail.classList.contains('collapsed')).toBe(false);
  });

  it('auto-collapses the right rail while the DPS panel is open or merely docked, and restores it once fully closed', () => {
    const rightRail = root.querySelector('#sw-rail-right') as HTMLElement;
    const w = new World(cfg());

    hud.toggleDpsPanel(w);
    hud.update(w);
    expect(rightRail.classList.contains('collapsed')).toBe(true);

    // Docked (small reopen tab) still shares the same top-right corner as this
    // rail's own handle (code review finding) — stays collapsed, not just open.
    hud.toggleDpsPanel(w);
    hud.update(w);
    expect(rightRail.classList.contains('collapsed')).toBe(true);

    hud.closeDpsPanel();
    hud.update(w);
    expect(rightRail.classList.contains('collapsed')).toBe(false);
  });

  it('auto-collapses the right rail while the VS panel is open or merely docked, and restores it once fully closed', () => {
    const rightRail = root.querySelector('#sw-rail-right') as HTMLElement;
    const w = new World(cfg());
    w.phase = 'act2'; // huntsWarden is derived from phase (World.huntsWarden getter) — it has no setter.

    hud.toggleVsPanel(w);
    hud.update(w);
    expect(rightRail.classList.contains('collapsed')).toBe(true);

    hud.toggleVsPanel(w); // docks the VS panel back down
    hud.update(w);
    expect(rightRail.classList.contains('collapsed')).toBe(true);

    hud.closeVsPanel();
    hud.update(w);
    expect(rightRail.classList.contains('collapsed')).toBe(false);
  });

  it('keeps the user\'s manual collapse across an update() tick even with no panel open', () => {
    const rightRail = root.querySelector('#sw-rail-right') as HTMLElement;
    const w = new World(cfg());

    (root.querySelector('#sw-rail-right-handle') as HTMLElement).click();
    expect(rightRail.classList.contains('collapsed')).toBe(true);
    hud.update(w);
    expect(rightRail.classList.contains('collapsed')).toBe(true);
  });
});
