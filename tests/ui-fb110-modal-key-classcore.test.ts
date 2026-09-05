/**
 * @vitest-environment jsdom
 *
 * fb110: `Hud.syncModal`'s memo key didn't include classKey/coreKey, so
 * reusing one `Hud` instance across fresh `World` fixtures without calling
 * `resetModalKey()` (real play always does, via `startRun` — see `main.ts`)
 * could show a stale Results-screen Class/Core from the previous world.
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

describe('fb110: Results screen memo key tracks classKey/coreKey', () => {
  let root: HTMLElement;
  let hud: Hud;

  beforeEach(() => {
    root = mount();
    hud = makeHud(root);
  });

  it('shows the second world\'s own class/Core, not a stale first world\'s, on Hud reuse without resetModalKey', () => {
    const w1 = new World(cfg({ classKey: 'swordsman', core: 'vampire_heart' }));
    w1.outcome = 'victory';
    w1.phase = 'results';
    hud.buildTowerBar(w1);
    hud.syncModal(w1);

    let text = root.querySelector('.sw-results')?.textContent ?? '';
    expect(text).toContain('Swordsman');
    expect(text).toContain('Vampire Heart');

    // Same phase/offers.length/outcome/level as w1 — under the old key
    // (`phase:offers.length:outcome:level`) this would be a memo hit and
    // syncModal would skip re-rendering, leaving w1's stale class/Core shown.
    const w2 = new World(cfg({ classKey: 'plaguebringer', core: 'corpse' }));
    w2.outcome = 'victory';
    w2.phase = 'results';
    hud.buildTowerBar(w2);
    hud.syncModal(w2);

    text = root.querySelector('.sw-results')?.textContent ?? '';
    expect(text).toContain('Plaguebringer');
    expect(text).toContain('Corpse');
    expect(text).not.toContain('Swordsman');
    expect(text).not.toContain('Vampire Heart');
  });
});
