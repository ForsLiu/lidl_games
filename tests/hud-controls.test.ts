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

import { Hud } from '../src/ui/hud';
import { World } from '../src/sim/world';
import { Pacer, SPEEDS } from '../src/ui/pacer';
import { makeKeyDownHandler } from '../src/ui/input';
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
}

function makeHud(root: HTMLElement, log: Log, pacer: Pacer): Hud {
  const hud = new Hud(root, {
    onSelectTower: () => {},
    onCallWave: () => {},
    onPickSouls: () => {},
    onPickOffer: () => {},
    onReroll: () => {},
    onRestart: () => {},
    onToggleRanges: () => log.ranges++,
    onResume: () => {},
    onPause: () => log.pause++,
    onCycleSpeed: () => {
      log.speed++;
      hud.setSpeed(pacer.cycle());
    },
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
    log = { speed: 0, ranges: 0, pause: 0 };
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

  it('the ranges and pause buttons reach their callbacks', () => {
    (root.querySelector('[data-act="ranges"]') as HTMLButtonElement).click();
    (root.querySelector('[data-act="pause"]') as HTMLButtonElement).click();
    expect(log.ranges).toBe(1);
    expect(log.pause).toBe(1);
  });
});
