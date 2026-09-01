/**
 * @vitest-environment jsdom
 *
 * fb019 (owner directive 2026-08-29, Q135): Training Grounds — a Hub-
 * accessible practice arena for trying classes, towers, equipment and Cores
 * outside a real run. Built entirely on the existing practice-run plumbing
 * (the `practice` RunConfig flag, its dev-command surface, and the
 * bank-nothing rule), plus a new `'spawn'` dev op for the panel.
 *
 * Acceptance: enterable and leavable from the Hub; a spawned enemy fights
 * with its real stats; nothing persists to the profile. The spawn op and the
 * bank-nothing rule are covered end to end in tests/practice.test.ts — this
 * file covers the Hub entry point and the HUD's spawn panel and exit path.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Hub } from '../src/ui/hub';
import { Hud } from '../src/ui/hud';
import { defaultMeta } from '../src/meta/meta';
import { defaultSettings } from '../src/ui/settings';
import { World } from '../src/sim/world';
import type { DevOp, MetaState, RunConfig } from '../src/sim/types';
import { cfg } from './helpers';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function mount(): HTMLElement {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  return document.getElementById('app') as HTMLElement;
}

function openHub(meta: MetaState, onStart: (cfg: RunConfig) => void): { root: HTMLElement; hub: Hub } {
  const root = mount();
  const hub = new Hub(root, meta, 1, {
    settings: defaultSettings(),
    onSettingsChanged: () => {},
    onStart,
    onMetaChanged: () => {},
  });
  hub.show();
  return { root, hub };
}

describe('fb019 Training Grounds: entry from the Hub', () => {
  it('offers a one-click entry that starts a practice run without touching the Practice checkbox', () => {
    let started: RunConfig | null = null;
    const { root } = openHub(defaultMeta(), (c) => (started = c));

    const checkbox = root.querySelector<HTMLInputElement>('#sw-practice')!;
    expect(checkbox.checked).toBe(false);

    const button = root.querySelector<HTMLElement>('#sw-training');
    expect(button).not.toBeNull();
    expect(button!.textContent).toMatch(/Training Grounds/i);
    button!.click();

    expect(started).not.toBeNull();
    expect(started!.practice).toBe(true);
    // The checkbox itself is untouched — this is a second door, not a rewire
    // of the first one.
    expect(checkbox.checked).toBe(false);
  });

  it('carries whatever class/Core/tier the Run tab already has selected', () => {
    let started: RunConfig | null = null;
    const { root } = openHub(defaultMeta(), (c) => (started = c));

    const classButton = root.querySelector<HTMLElement>('[data-class]')!;
    const otherClass = classButton.dataset.class!;
    classButton.click();

    root.querySelector<HTMLElement>('#sw-training')!.click();
    expect(started).not.toBeNull();
    expect(started!.classKey).toBe(otherClass);
  });

  it('the normal Begin button still starts a banked run', () => {
    let started: RunConfig | null = null;
    const { root } = openHub(defaultMeta(), (c) => (started = c));
    root.querySelector<HTMLElement>('#sw-start')!.click();
    expect(started).not.toBeNull();
    expect(started!.practice).toBeFalsy();
  });
});

describe('fb019 Training Grounds: the HUD spawn panel', () => {
  it('lists real enemies and spawns the chosen one with the chosen count', () => {
    const root = mount();
    const log: { op: DevOp; amount: number; enemyKey?: string }[] = [];
    const hud = new Hud(root, {
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
      onResume: () => {},
      onPause: () => {},
      onCycleSpeed: () => {},
      onDev: (op, amount, enemyKey) => log.push({ op, amount, enemyKey }),
      onQuitToHub: () => {},
      onHoverSkill: () => {},
    });
    const world = new World({ ...cfg(), practice: true });
    hud.showPracticeTools(true, world);

    const select = root.querySelector<HTMLSelectElement>('#sw-spawn-enemy')!;
    const count = root.querySelector<HTMLInputElement>('#sw-spawn-count')!;
    expect(select.options.length).toBeGreaterThan(0);
    const options = [...select.options].map((o) => o.value);
    expect(options).toContain('husk');
    expect(world.content.enemyByKey.has(options[0])).toBe(true);

    select.value = 'husk';
    count.value = '4';
    root.querySelector<HTMLElement>('#sw-spawn-go')!.click();

    expect(log).toEqual([{ op: 'spawn', amount: 4, enemyKey: 'husk' }]);
  });

  it('omits the spawn row (but still shows the rest of the panel) without a World to read enemies from', () => {
    const root = mount();
    const hud = new Hud(root, {
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
      onResume: () => {},
      onPause: () => {},
      onCycleSpeed: () => {},
      onDev: () => {},
      onQuitToHub: () => {},
      onHoverSkill: () => {},
    });
    hud.showPracticeTools(true);
    const panel = root.querySelector('#sw-practice') as HTMLElement;
    expect(panel.hidden).toBe(false);
    expect(panel.querySelector('#sw-spawn-enemy')).toBeNull();
  });
});

describe('fb019 Training Grounds: leaving back to the Hub', () => {
  it('the pause menu\'s Abandon Run reaches the Hub from a practice/Training Grounds run', () => {
    const root = mount();
    let quit = 0;
    const hud = new Hud(root, {
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
      onResume: () => {},
      onPause: () => {},
      onCycleSpeed: () => {},
      onDev: () => {},
      onQuitToHub: () => quit++,
      onHoverSkill: () => {},
    });
    const world = new World({ ...cfg(), practice: true });
    hud.buildTowerBar(world);
    hud.showPracticeTools(true, world);
    hud.setPaused(true, world);

    const modal = root.querySelector('#sw-modal') as HTMLElement;
    (modal.querySelector('[data-act="quit"]') as HTMLElement).click();
    (modal.querySelector('[data-act="confirm"]') as HTMLElement).click();
    expect(quit).toBe(1);
  });
});
