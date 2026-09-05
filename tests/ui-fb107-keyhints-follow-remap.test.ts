/**
 * @vitest-environment jsdom
 *
 * fb107 (QUALITY.md BETA key remapping, fb073): every key-hint string in the
 * in-run HUD and the Hub ignored the player's remapped `keyBindings` and
 * always showed the hardcoded defaults (Q/E/WASD/R/F/C/P/V/U/X/0) — this
 * covers the bottom-bar badge, the help legend, the character panel's Active
 * rows, the class-select tooltip label, and the Dusk onboarding prompt.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Hud, characterPanelMarkup, type HudCallbacks } from '../src/ui/hud';
import { Hub } from '../src/ui/hub';
import { World } from '../src/sim/world';
import type { DevOp } from '../src/sim/types';
import { defaultSettings } from '../src/ui/settings';
import { defaultMeta } from '../src/meta/meta';
import { defaultKeyBindings, type KeyBindings } from '../src/ui/keybindings';
import { characterPanelData } from '../src/ui/character-panel';
import { finishSundering } from '../src/sim/sundering';
import { cfg } from './helpers';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

/** Every rebound field distinct from its default and from every other rebound field. */
const REMAPPED: KeyBindings = {
  ...defaultKeyBindings(),
  moveUp: 'i',
  moveLeft: 'j',
  moveDown: 'k',
  moveRight: 'l',
  dash: 'n',
  active1: 'g',
  active2: 'h',
  toggleRanges: 'y',
  cycleSpeed: 'r',
  toggleCharacterPanel: 'z',
  toggleDpsPanel: 'm',
  toggleVsPanel: 'b',
  upgradeSelection: 't',
  sellSelection: 'o',
  clearSelection: '-',
};

function mount(): HTMLElement {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  return document.getElementById('app') as HTMLElement;
}

function makeCallbacks(): HudCallbacks {
  return {
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
  };
}

describe('fb107: key hints follow the player\'s remapped keyBindings', () => {
  it('the bottom-bar Active1/Active2 badges show the rebound key, not Q/E', () => {
    const root = mount();
    const w = new World(cfg({ classKey: 'swordsman' }));
    const hud = new Hud(root, makeCallbacks(), defaultSettings(), REMAPPED);
    hud.buildTowerBar(w);
    hud.update(w);
    expect(root.querySelector('#sw-bb-active1 .sw-bb-key')?.textContent).toBe('G');
    expect(root.querySelector('#sw-bb-active2 .sw-bb-key')?.textContent).toBe('H');
  });

  it('defaults still show Q/E when no keyBindings are passed', () => {
    const root = mount();
    const w = new World(cfg({ classKey: 'swordsman' }));
    const hud = new Hud(root, makeCallbacks(), defaultSettings());
    hud.buildTowerBar(w);
    hud.update(w);
    expect(root.querySelector('#sw-bb-active1 .sw-bb-key')?.textContent).toBe('Q');
    expect(root.querySelector('#sw-bb-active2 .sw-bb-key')?.textContent).toBe('E');
  });

  it('the help legend and control-bar titles reflect rebound keys', () => {
    const root = mount();
    const w = new World(cfg({ classKey: 'swordsman' }));
    const hud = new Hud(root, makeCallbacks(), defaultSettings(), REMAPPED);
    hud.buildTowerBar(w);
    hud.update(w);
    const help = root.querySelector('.sw-help')?.innerHTML ?? '';
    expect(help).toContain('IJKL'); // moveUp/moveLeft/moveDown/moveRight in that order
    expect(help).toContain('>N<'); // dash
    expect(help).toContain('>G<'); // active1
    expect(help).toContain('>Y<'); // toggleRanges
    expect(root.querySelector('#sw-ranges')?.getAttribute('title')).toContain('(Y)');
    expect(root.querySelector('#sw-character')?.getAttribute('title')).toContain('(Z)');
    // qa-playtester (fb107 verification): the speed <select>'s title was missed by
    // the original fix, still hardcoding "F cycles" regardless of cycleSpeed.
    expect(root.querySelector('#sw-speed')?.getAttribute('title')).toContain('(R cycles)');
  });

  it('the bottom-bar tooltip label embeds the rebound key (activeSkillMarkup)', () => {
    const root = mount();
    const w = new World(cfg({ classKey: 'swordsman' }));
    const hud = new Hud(root, makeCallbacks(), defaultSettings(), REMAPPED);
    hud.buildTowerBar(w);
    hud.update(w);
    const a1Tip = root.querySelector('#sw-bb-a1-tip')?.innerHTML ?? '';
    expect(a1Tip).toContain('G, Active 1');
    expect(a1Tip).not.toContain('Q, Active 1');
  });

  it('the character panel\'s Active rows show the rebound key', () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    const html = characterPanelMarkup(characterPanelData(w), w, REMAPPED);
    expect(html).toContain('G, Active 1');
    expect(html).toContain('H, Active 2');
  });

  it('the Hub class-select tooltip label shows the rebound key', () => {
    document.head.innerHTML = `<style>${CSS}</style>`;
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app') as HTMLElement;
    const hub = new Hub(root, defaultMeta(), 1, {
      settings: defaultSettings(),
      keyBindings: REMAPPED,
      onStart: () => {},
      onMetaChanged: () => {},
      onSettingsChanged: () => {},
    });
    hub.show();
    const card = root.querySelector('.sw-classcard[data-class="swordsman"]') as HTMLElement;
    card.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const labels = [...root.querySelectorAll('.sw-cs-label')].map((el) => el.textContent ?? '');
    expect(labels.some((t) => t.includes('Active1 (G)'))).toBe(true);
    expect(labels.some((t) => t.includes('Active2 (H)'))).toBe(true);
  });

  it('the Dusk onboarding prompt names the rebound movement/dash/active keys', () => {
    const root = mount();
    const w = new World(cfg({ classKey: 'swordsman' }));
    const hud = new Hud(root, makeCallbacks(), { ...defaultSettings(), onboardingSeenBuild: true }, REMAPPED);
    hud.buildTowerBar(w);
    hud.update(w);
    finishSundering(w);
    hud.ingestFx(w.fx);
    hud.update(w);
    const text = root.querySelector('#sw-onboarding-text')?.textContent ?? '';
    expect(text).toContain('IJKL');
    expect(text).toContain('N to dash');
    expect(text).toContain('G/H');
  });
});
