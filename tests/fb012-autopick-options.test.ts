/**
 * @vitest-environment jsdom
 *
 * fb012 (fb003 follow-up, SPEC-FINAL §6.3, §11): the level-up auto-pick
 * toggle moves out of the Hub's start menu into the in-run Esc options
 * sub-screen and a small toggle on the level-up offer screen itself; the
 * choice persists on the save profile (`MetaState.autoPickLevelUps`) so the
 * next run starts with it. Still an ordinary `set_autopick` Command either
 * way — replay-safe.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { Hud } from '../src/ui/hud';
import { Hub } from '../src/ui/hub';
import { World } from '../src/sim/world';
import { defaultMeta } from '../src/meta/meta';
import { defaultSettings } from '../src/ui/settings';
import type { Command } from '../src/sim/types';
import { cfg } from './helpers';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function mount(): HTMLElement {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  return document.getElementById('app') as HTMLElement;
}

function noopHudCallbacks(pending: Command[], onToggleAutoPick: () => void = () => {}) {
  return {
    onSelectTower: () => {},
    onCallWave: () => {},
    onPickOffer: (index: number) => pending.push({ k: 'pick', index }),
    onReroll: () => {},
    onRetry: () => {},
    onNewRun: () => {},
    onToggleRanges: () => {},
    onToggleAutoPick,
    onToggleCharacterPanel: () => {},
    onEquipItem: () => {},
    onToggleDpsPanel: () => {},
    onResume: () => {},
    onPause: () => {},
    onCycleSpeed: () => {},
    onSetSpeed: () => {},
    onDev: () => {},
    onQuitToHub: () => {},
    onHoverSkill: () => {}, onUpgradeStructure: () => {}, onSellStructure: () => {}, onUpgradeCore: () => {},
  };
}

describe('fb012: auto-pick toggle absent from the Hub start menu', () => {
  it('the Run tab renders no auto-pick control', () => {
    const root = mount();
    const meta = defaultMeta();
    const hub = new Hub(root, meta, 1, {
      settings: defaultSettings(),
      onStart: () => {},
      onMetaChanged: () => {},
      onSettingsChanged: () => {},
    });
    hub.show();
    hub.openTab('run');
    expect(root.querySelector('#sw-autopick')).toBeNull();
    expect(root.textContent).not.toContain('Auto-pick level-ups');
  });

  it('a run starts with the profile default rather than a Hub-local choice', () => {
    const root = mount();
    const meta = { ...defaultMeta(), autoPickLevelUps: true };
    let started: { autoPickLevelUps?: boolean } | null = null;
    const hub = new Hub(root, meta, 1, {
      settings: defaultSettings(),
      onStart: (rc) => (started = rc),
      onMetaChanged: () => {},
      onSettingsChanged: () => {},
    });
    hub.show();
    hub.openTab('run');
    (root.querySelector('#sw-start') as HTMLElement).click();
    expect(started).not.toBeNull();
    expect(started!.autoPickLevelUps).toBe(true);
  });
});

describe('fb012: auto-pick toggle in the pause Esc options screen', () => {
  let root: HTMLElement;
  let toggled: number;
  let hud: Hud;
  let world: World;

  beforeEach(() => {
    root = mount();
    toggled = 0;
    hud = new Hud(root, noopHudCallbacks([], () => toggled++));
    world = new World(cfg());
    hud.buildTowerBar(world);
  });

  it('is reachable from Pause via an Options button, and Back returns to Pause', () => {
    hud.setPaused(true, world);
    const modal = root.querySelector('#sw-modal') as HTMLElement;
    expect(modal.querySelector('[data-act="options"]')).not.toBeNull();

    (modal.querySelector('[data-act="options"]') as HTMLElement).click();
    expect(modal.textContent).toContain('Options');
    expect(modal.querySelector('#sw-opt-autopick')).not.toBeNull();

    (modal.querySelector('[data-act="back"]') as HTMLElement).click();
    expect(modal.textContent).toContain('Paused');
  });

  it('the checkbox reaches onToggleAutoPick', () => {
    hud.setPaused(true, world);
    const modal = root.querySelector('#sw-modal') as HTMLElement;
    (modal.querySelector('[data-act="options"]') as HTMLElement).click();

    const box = modal.querySelector('#sw-opt-autopick') as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new window.Event('change'));
    expect(toggled).toBe(1);
  });

  it('is reachable while paused in Act I too (phase-agnostic, like the rest of pause)', () => {
    expect(world.phase).toBe('act1_build');
    hud.setPaused(true, world);
    const modal = root.querySelector('#sw-modal') as HTMLElement;
    (modal.querySelector('[data-act="options"]') as HTMLElement).click();
    expect(modal.querySelector('#sw-opt-autopick')).not.toBeNull();
  });
});

describe('fb012: small toggle on the level-up screen itself', () => {
  it('offers a checkbox, unchecked by construction, that reaches onToggleAutoPick', () => {
    const root = mount();
    let toggled = 0;
    const pending: Command[] = [];
    const hud = new Hud(root, noopHudCallbacks(pending, () => toggled++));
    const world = new World(cfg());
    hud.buildTowerBar(world);

    world.phase = 'levelup';
    world.offers = [
      { kind: 'boon', key: 'power', name: 'Power', desc: 'desc', toLevel: 1 },
      { kind: 'boon', key: 'guard', name: 'Guard', desc: 'desc', toLevel: 1 },
    ];
    hud.syncModal(world);

    const modal = root.querySelector('#sw-modal') as HTMLElement;
    const box = modal.querySelector('#sw-offer-autopick') as HTMLInputElement;
    expect(box).not.toBeNull();
    expect(box.checked).toBe(false);

    box.checked = true;
    box.dispatchEvent(new window.Event('change'));
    expect(toggled).toBe(1);
  });

  // qa-playtester/code-reviewer (this item): checking this box sends the same
  // `set_autopick` Command every other door onto the setting sends, and
  // `run.ts`'s handler (fb003, by design — see
  // `tests/act2.test.ts`'s "flipping the toggle on while a manual offer is
  // already up resolves it immediately, never leaving the run parked in
  // levelup") resolves the now-showing offer too, not just future ones. An
  // earlier draft of this item's label/comment claimed otherwise; fixed to
  // describe the real, invariant-preserving behavior instead of asserting a
  // wrong one.
  it('checking it end-to-end via the real Command resolves this offer too, same as the sidebar button would', async () => {
    const { applyCommand } = await import('../src/sim/run');
    const world = new World(cfg());
    world.phase = 'act2';
    world.pendingLevelUps = 1;
    const { openLevelUpIfPending } = await import('../src/sim/progression');
    openLevelUpIfPending(world);
    expect(world.phase).toBe('levelup');
    expect(world.offers.length).toBeGreaterThan(0);

    applyCommand(world, { k: 'set_autopick', on: true });

    expect(world.cfg.autoPickLevelUps).toBe(true);
    expect(world.phase).toBe('act2');
    expect(world.offers).toEqual([]);
  });
});

describe('fb012: mid-run flip changes the next level-up', () => {
  it('openLevelUpIfPending only auto-resolves once cfg.autoPickLevelUps is on', async () => {
    const { openLevelUpIfPending } = await import('../src/sim/progression');
    const world = new World(cfg());
    world.phase = 'act2';
    world.pendingLevelUps = 1;

    openLevelUpIfPending(world);
    expect(world.phase).toBe('levelup');

    // Simulate the `set_autopick` Command the toggle sends, after the
    // already-open offer above is manually resolved (not the flip-while-an-
    // offer-is-up path, which is covered separately above).
    world.offers = [];
    world.phase = 'act2';
    world.cfg.autoPickLevelUps = true;
    world.pendingLevelUps = 1;
    openLevelUpIfPending(world);
    expect(world.phase).toBe('act2');
  });
});
