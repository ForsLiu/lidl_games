/**
 * @vitest-environment jsdom
 *
 * fb076: clicking the right rail's handle while it is already auto-collapsed
 * (DPS/VS panel open or docked) must not get stuck collapsed once the panel
 * later closes — owner feedback `feature-ui-inside-playfield`, filed by
 * qa-playtester during fb065 verification.
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

describe('fb076: right rail handle click while auto-collapsed does not get stuck', () => {
  let root: HTMLElement;
  let hud: Hud;

  beforeEach(() => {
    root = mount();
    hud = makeHud(root);
    hud.buildTowerBar(new World(cfg()));
  });

  it('reopens once the DPS panel closes, even after a handle click while auto-collapsed', () => {
    const rightRail = root.querySelector('#sw-rail-right') as HTMLElement;
    const handle = root.querySelector('#sw-rail-right-handle') as HTMLElement;
    const w = new World(cfg());

    hud.toggleDpsPanel(w);
    hud.update(w);
    expect(rightRail.classList.contains('collapsed')).toBe(true);

    // The rail's own handle is still visible and clickable while auto-collapsed
    // — a natural thing to try. It should have no lasting effect.
    handle.click();
    hud.update(w);
    expect(rightRail.classList.contains('collapsed')).toBe(true);

    hud.closeDpsPanel();
    hud.update(w);
    expect(rightRail.classList.contains('collapsed')).toBe(false);
  });

  it('reopens once a docked VS panel is fully closed, even after a handle click while auto-collapsed', () => {
    const rightRail = root.querySelector('#sw-rail-right') as HTMLElement;
    const handle = root.querySelector('#sw-rail-right-handle') as HTMLElement;
    const w = new World(cfg());
    w.phase = 'act2'; // huntsWarden is derived from phase (World.huntsWarden getter) — it has no setter.

    hud.toggleVsPanel(w); // open
    hud.toggleVsPanel(w); // docks the VS panel back down — still an auto-collapse reason
    hud.update(w);
    expect(rightRail.classList.contains('collapsed')).toBe(true);

    handle.click();
    hud.update(w);
    expect(rightRail.classList.contains('collapsed')).toBe(true);

    hud.closeVsPanel();
    hud.update(w);
    expect(rightRail.classList.contains('collapsed')).toBe(false);
  });

  it('a manual collapse before any auto-collapse reason still holds, and reopens via a later click', () => {
    const rightRail = root.querySelector('#sw-rail-right') as HTMLElement;
    const handle = root.querySelector('#sw-rail-right-handle') as HTMLElement;
    const w = new World(cfg());

    handle.click();
    expect(rightRail.classList.contains('collapsed')).toBe(true);

    handle.click();
    expect(rightRail.classList.contains('collapsed')).toBe(false);
    hud.update(w);
    expect(rightRail.classList.contains('collapsed')).toBe(false);
  });
});
