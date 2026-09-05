/**
 * @vitest-environment jsdom
 *
 * fb078: the outer Space `keydown` listener that arms `Game.dashQueued`
 * (src/ui/main.ts) had no `e.repeat` guard, unlike `makeKeyDownHandler`'s own
 * handling of every other key (src/ui/input.ts, `if (e.repeat) return;`). A
 * browser key-repeat event for a Space the player never released — including
 * one still held through an fb077-fixed pause/resume — could re-arm
 * `dashQueued` with no fresh physical press behind it. The listener now
 * ignores `e.repeat` events, symmetric with `makeKeyDownHandler`.
 *
 * Drives the real `Game` end to end, same idiom as
 * tests/ui-fb077-dash-queued-pause.test.ts.
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
  dashQueued: boolean;
  gatherInput(): { dash: boolean };
}

function startGame(root: HTMLElement): Game {
  const game = new Game();
  game.start(root);
  (root.querySelector('#sw-start') as HTMLElement).click();
  return game;
}

describe('fb078: a Space key-repeat event does not re-arm a queued dash', () => {
  it('a held-through-pause Space repeat event does not re-arm dashQueued on resume', () => {
    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;
    g.run.world.phase = 'act1_wave';
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));

    // Fresh press, consumed by the fb077 pause-clear below.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(g.dashQueued).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(g.paused).toBe(true);
    expect(g.dashQueued).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(g.paused).toBe(false);

    // No keyup ever fired — Space is still physically held. The OS's
    // continuing key-repeat for that held key fires a `repeat: true` keydown,
    // not a fresh press.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', repeat: true }));
    expect(g.dashQueued).toBe(false);
    expect(g.gatherInput().dash).toBe(false);
  });

  it('a fresh (non-repeat) Space press still arms a dash normally', () => {
    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;
    g.run.world.phase = 'act1_wave';
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(g.dashQueued).toBe(true);
    expect(g.gatherInput().dash).toBe(true);
  });
});
