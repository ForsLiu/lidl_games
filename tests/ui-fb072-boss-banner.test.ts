/**
 * @vitest-environment jsdom
 *
 * fb072: a dedicated boss HP banner (name + proportional HP-fraction bar)
 * fixed on screen while any `boss`-trait enemy is alive — engineer's-judgment
 * item, the per-enemy sprite HP bar (fb025) is illegible at boss HP scales
 * (30k-100k) and G14/G23's boss-clear gates have no other legible HUD read
 * on fight progress.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { Hud } from '../src/ui/hud';
import { World } from '../src/sim/world';
import { spawnEnemy } from '../src/sim/enemies';
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

describe('fb072: boss HP banner', () => {
  let root: HTMLElement;
  let hud: Hud;
  let w: World;

  beforeEach(() => {
    root = mount();
    hud = makeHud(root);
    w = new World(cfg());
    hud.buildTowerBar(w);
  });

  it('is hidden with no boss alive', () => {
    hud.update(w);
    const banner = root.querySelector('#sw-bossbar') as HTMLElement;
    expect(banner.hidden).toBe(true);
  });

  it('shows the boss name and hp/maxHp fraction once a boss spawns, updating as hp drops', () => {
    const boss = spawnEnemy(w, 'warden_eater', w.warden.x + 6, w.warden.y, { overlay: false })!;
    hud.update(w);

    const banner = root.querySelector('#sw-bossbar') as HTMLElement;
    const name = root.querySelector('#sw-bossbar-name') as HTMLElement;
    const fill = root.querySelector('#sw-bossbar-fill') as HTMLElement;
    expect(banner.hidden).toBe(false);
    expect(name.textContent).toBe('The Warden-Eater');
    expect(fill.style.width).toBe('100%');

    boss.hp = boss.maxHp * 0.25;
    hud.update(w);
    expect(fill.style.width).toBe('25%');
  });

  it('disappears once the boss dies', () => {
    const boss = spawnEnemy(w, 'gatebreaker', w.warden.x + 6, w.warden.y, { overlay: false })!;
    hud.update(w);
    expect((root.querySelector('#sw-bossbar') as HTMLElement).hidden).toBe(false);

    boss.dead = true;
    hud.update(w);
    expect((root.querySelector('#sw-bossbar') as HTMLElement).hidden).toBe(true);
  });

  it('hides behind the pause card instead of bleeding through its semi-transparent overlay', () => {
    spawnEnemy(w, 'gatebreaker', w.warden.x + 6, w.warden.y, { overlay: false });
    hud.update(w);
    const banner = root.querySelector('#sw-bossbar') as HTMLElement;
    expect(banner.hidden).toBe(false);

    hud.setPaused(true, w);
    hud.update(w);
    expect(banner.hidden).toBe(true);

    hud.setPaused(false, w);
    hud.update(w);
    expect(banner.hidden).toBe(false);
  });

  it('shows the lower-current-hp boss without crashing when two are alive at once', () => {
    const gate = spawnEnemy(w, 'gatebreaker', w.warden.x + 4, w.warden.y, { overlay: false })!;
    const eater = spawnEnemy(w, 'warden_eater', w.warden.x + 8, w.warden.y, { overlay: false })!;
    gate.hp = 20000; // gatebreaker maxHp 30000 -> higher current hp
    eater.hp = 5000; // warden_eater maxHp 100000 -> lower current hp

    expect(() => hud.update(w)).not.toThrow();
    const name = root.querySelector('#sw-bossbar-name') as HTMLElement;
    const fill = root.querySelector('#sw-bossbar-fill') as HTMLElement;
    expect(name.textContent).toBe('The Warden-Eater');
    expect(fill.style.width).toBe('5%');
  });
});
