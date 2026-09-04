/**
 * @vitest-environment jsdom
 *
 * fb077: `Game.dashQueued` (src/ui/main.ts) is a one-shot "intent" flag armed
 * by a Space keydown and consumed the next `gatherInput()` call — but unlike
 * `q` (a member of `this.keys`, preserved across a pause by
 * `clearKeysForPause`, src/ui/input.ts), `dashQueued` isn't a key at all, so
 * no pause transition (Esc or fb071's blur auto-pause) ever reset it. A queued
 * dash used to survive an arbitrarily long pause and fire stale on the very
 * first post-resume tick, even after the player released Space mid-pause.
 * `setPaused` (src/ui/main.ts) now clears `dashQueued` alongside
 * `clearKeysForPause`'s key-clearing, the same place the analogous `q`
 * preservation logic lives.
 *
 * Drives the real `Game` end to end, same idiom as
 * tests/ui-fb071-blur-autopause.test.ts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Game } from '../src/ui/main';
import type { World } from '../src/sim/world';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function mount(): HTMLElement {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  HTMLCanvasElement.prototype.getContext = (() => ({
    setTransform() {},
    scale() {},
  })) as never;
  window.requestAnimationFrame = (() => 0) as never;
  return document.getElementById('app') as HTMLElement;
}

interface GameInternals {
  paused: boolean;
  run: { world: World };
  keys: Set<string>;
  dashQueued: boolean;
  gatherInput(): { dash: boolean };
}

function startGame(root: HTMLElement): Game {
  const game = new Game();
  game.start(root);
  (root.querySelector('#sw-start') as HTMLElement).click();
  return game;
}

describe('fb077: a queued dash does not survive a pause', () => {
  it('Esc-pausing clears a queued dash; releasing Space mid-pause and resuming fires no dash', () => {
    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;
    g.run.world.phase = 'act1_wave';
    // A held movement key so a real dash would have a direction to fire in.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(g.dashQueued).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(g.paused).toBe(true);
    expect(g.dashQueued).toBe(false);

    // Player lets go of Space during the pause — no re-arming keydown follows.
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(g.paused).toBe(false);

    expect(g.gatherInput().dash).toBe(false);
  });

  it('a blur auto-pause clears a queued dash the same way', () => {
    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;
    g.run.world.phase = 'act1_wave';
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(g.dashQueued).toBe(true);

    window.dispatchEvent(new Event('blur'));
    expect(g.paused).toBe(true);
    expect(g.dashQueued).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(g.paused).toBe(false);

    expect(g.gatherInput().dash).toBe(false);
  });

  it('re-pressing Space after resume still arms a fresh dash', () => {
    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;
    g.run.world.phase = 'act1_wave';
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(g.paused).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(g.dashQueued).toBe(true);
    expect(g.gatherInput().dash).toBe(true);
  });
});
