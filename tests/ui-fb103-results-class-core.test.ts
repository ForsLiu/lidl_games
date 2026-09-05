/**
 * @vitest-environment jsdom
 *
 * fb103: the Results screen names the class and Core the run was played
 * with, resolved to their display names — with a raw-key fallback for a
 * corrupted-save shape whose classKey/coreKey doesn't resolve against loaded
 * content, rather than crashing.
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

describe('fb103: Results screen shows class and Core', () => {
  let root: HTMLElement;
  let hud: Hud;

  beforeEach(() => {
    root = mount();
    hud = makeHud(root);
  });

  it('shows real display names for the run\'s class and Core', () => {
    const w = new World(cfg({ classKey: 'swordsman', core: 'vampire_heart' }));
    w.outcome = 'victory';
    w.phase = 'results';
    hud.buildTowerBar(w);
    hud.syncModal(w);

    const text = root.querySelector('.sw-results')?.textContent ?? '';
    expect(text).toContain('Swordsman');
    expect(text).toContain('Vampire Heart');
    expect(text).not.toContain('swordsman');
    expect(text).not.toContain('vampire_heart');
  });

  it('falls back to the raw key instead of crashing when classKey/coreKey are unresolvable', () => {
    const w = new World(cfg({ classKey: 'not_a_real_class', core: 'not_a_real_core' }));
    w.outcome = 'defeat_core';
    w.phase = 'results';
    hud.buildTowerBar(w);
    expect(() => hud.syncModal(w)).not.toThrow();

    const text = root.querySelector('.sw-results')?.textContent ?? '';
    expect(text).toContain('not_a_real_class');
    expect(text).toContain('not_a_real_core');
  });
});
