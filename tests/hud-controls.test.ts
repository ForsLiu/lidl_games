/**
 * @vitest-environment jsdom
 *
 * The in-run control row (playtest report, 2026-08-25: "need speed up button in
 * playing"). These drive the real HUD DOM rather than a stand-in, so a control
 * that stops being wired up fails here.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { Hud, PRACTICE_BUTTONS } from '../src/ui/hud';
import { World } from '../src/sim/world';
import { Pacer, SPEEDS } from '../src/ui/pacer';
import { makeKeyDownHandler } from '../src/ui/input';
import { buildTower } from '../src/sim/towers';
import { grantWeapon } from '../src/sim/weapons';
import type { DevOp } from '../src/sim/types';
import { cfg } from './helpers';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function mount(): HTMLElement {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  return document.getElementById('app') as HTMLElement;
}

interface Log {
  speed: number;
  ranges: number;
  pause: number;
  dev: DevOp[];
}

function makeHud(root: HTMLElement, log: Log, pacer: Pacer): Hud {
  const hud = new Hud(root, {
    onSelectTower: () => {},
    onCallWave: () => {},
    onPickSouls: () => {},
    onPickOffer: () => {},
    onReroll: () => {},
    onRekindle: () => {},
    onDawnDone: () => {},
    onRetry: () => {},
    onNewRun: () => {},
    onToggleRanges: () => log.ranges++,
    onResume: () => {},
    onPause: () => log.pause++,
    onCycleSpeed: () => {
      log.speed++;
      hud.setSpeed(pacer.cycle());
    },
    onDev: (op: DevOp) => log.dev.push(op),
    onQuitToHub: () => {},
  });
  return hud;
}

describe('in-run control row', () => {
  let root: HTMLElement;
  let log: Log;
  let pacer: Pacer;
  let hud: Hud;

  beforeEach(() => {
    root = mount();
    log = { speed: 0, ranges: 0, pause: 0, dev: [] };
    pacer = new Pacer();
    hud = makeHud(root, log, pacer);
    hud.buildTowerBar(new World(cfg()));
    hud.setSpeed(pacer.speed);
  });

  it('shows every control the help line promises', () => {
    for (const act of ['speed', 'ranges', 'pause']) {
      expect(root.querySelector(`[data-act="${act}"]`), act).not.toBeNull();
    }
  });

  it('starts at 1x', () => {
    expect((root.querySelector('#sw-speed') as HTMLElement).textContent).toBe('1x');
  });

  it('the speed button cycles the label through every declared speed', () => {
    const btn = root.querySelector('#sw-speed') as HTMLButtonElement;
    const seen = [btn.textContent];
    for (let i = 1; i < SPEEDS.length; i++) {
      btn.click();
      seen.push(btn.textContent);
    }
    expect(seen).toEqual(SPEEDS.map((s) => `${s}x`));
    // And wraps, so the player can always get back to normal speed.
    btn.click();
    expect(btn.textContent).toBe('1x');
    expect(log.speed).toBe(SPEEDS.length);
  });

  it('marks the button as active only while fast-forwarding', () => {
    const btn = root.querySelector('#sw-speed') as HTMLButtonElement;
    expect(btn.classList.contains('on')).toBe(false);
    btn.click();
    expect(btn.classList.contains('on')).toBe(true);
  });

  it('F cycles the speed from the keyboard too', () => {
    const onKeyDown = makeKeyDownHandler({
      keys: new Set<string>(),
      queue: { push: () => {} },
      cycleSpeed: () => hud.setSpeed(pacer.cycle()),
    });
    onKeyDown(new KeyboardEvent('keydown', { key: 'f' }));
    expect((root.querySelector('#sw-speed') as HTMLElement).textContent).toBe('2x');
  });

  it('the tower panel starts as a prompt and fills in once a tower is picked', () => {
    const w = new World(cfg());
    hud.update(w);
    const panel = root.querySelector('#sw-towerinfo') as HTMLElement;
    expect(panel.textContent).toMatch(/Pick a tower/);

    const ballista = w.content.towerByKey.get('ballista')!;
    hud.select(ballista.id);
    hud.update(w);
    expect(panel.textContent).toContain('Ballista');
    expect(panel.textContent).toMatch(/Range/);
    expect(panel.textContent).toMatch(/Build/);
    // The soul it will leave behind is part of the decision.
    expect(panel.textContent).toContain('Piercing Bolt');
  });

  it('describes a built tower, including what the next tier costs', () => {
    const w = new World(cfg());
    w.gold = 9999;
    const def = w.content.towerByKey.get('arrow_spire')!;
    const tx = Math.floor(w.warden.x) + 1;
    const ty = Math.floor(w.warden.y);
    expect(buildTower(w, def.id, tx, ty).ok).toBe(true);

    hud.update(w, { x: tx + 0.5, y: ty + 0.5 });
    const panel = root.querySelector('#sw-towerinfo') as HTMLElement;
    expect(panel.textContent).toContain('Arrow Spire');
    expect(panel.textContent).toMatch(/Upgrade to T2/);
    expect(panel.textContent).toMatch(/Sell/);
  });

  it('shows the stage bar with a marker for every wave', () => {
    const w = new World(cfg());
    hud.update(w);
    const panel = root.querySelector('#sw-progress') as HTMLElement;
    expect(panel.textContent).toContain(`of ${w.waveCount}`);
    expect(panel.querySelectorAll('.sw-mark').length).toBe(w.waveCount);
  });

  it('hides the practice tool unless the run opted in', () => {
    const panel = root.querySelector('#sw-practice') as HTMLElement;
    expect(panel.hidden).toBe(true);
    hud.showPracticeTools(false);
    expect(panel.querySelectorAll('[data-dev]').length).toBe(0);
  });

  it('the practice tool offers every op, and each reaches the callback', () => {
    const panel = root.querySelector('#sw-practice') as HTMLElement;
    hud.showPracticeTools(true);
    expect(panel.hidden).toBe(false);
    const buttons = [...panel.querySelectorAll<HTMLButtonElement>('[data-dev]')];
    expect(buttons.length).toBe(PRACTICE_BUTTONS.length);
    for (const b of buttons) b.click();
    expect(log.dev).toEqual(PRACTICE_BUTTONS.map((b) => b.op));
    // It also says out loud that the run is a sandbox.
    expect(panel.textContent).toMatch(/banks nothing/i);
  });

  it('after the Sundering the panel describes the bound weapons instead', () => {
    const w = new World(cfg());
    w.sundered = true;
    w.phase = 'act2';
    grantWeapon(w, 'piercing_bolt', 3, 0);
    grantWeapon(w, 'toxic_trail', 1, 0);

    hud.update(w);
    const panel = root.querySelector('#sw-towerinfo') as HTMLElement;
    expect(panel.textContent).toContain('Piercing Bolt');
    expect(panel.textContent).toMatch(/Lv 3/);

    // One tab per bound soul, and picking one switches the card.
    const tabs = [...panel.querySelectorAll<HTMLButtonElement>('[data-weapon]')];
    expect(tabs.length).toBe(2);
    tabs[1].click();
    expect(panel.textContent).toContain('Toxic Trail');
  });

  it('the ranges and pause buttons reach their callbacks', () => {
    (root.querySelector('[data-act="ranges"]') as HTMLButtonElement).click();
    (root.querySelector('[data-act="pause"]') as HTMLButtonElement).click();
    expect(log.ranges).toBe(1);
    expect(log.pause).toBe(1);
  });
});
