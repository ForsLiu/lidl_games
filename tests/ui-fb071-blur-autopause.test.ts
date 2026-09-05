/**
 * @vitest-environment jsdom
 *
 * fb071: `Game`'s window `blur` listener (`src/ui/main.ts`) used to only clear
 * held keys, never pause — so alt-tabbing away during a running phase left the
 * sim ticking unattended against a live Core. Now it reaches the same pause
 * state `togglePause()` (Esc) reaches, but via a direct `setPaused(true)`
 * rather than a toggle: a toggle would *resume* a run the player had already
 * paused manually before losing focus. A later `focus` must NOT auto-resume,
 * matching Esc's manual-resume convention.
 *
 * Drives the real `Game` (main.ts) end to end, same idiom as
 * tests/b030-autopick-pause-toggle.test.ts and
 * tests/ui-fb065-resize-listener.test.ts.
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
}

function startGame(root: HTMLElement): Game {
  const game = new Game();
  game.start(root);
  (root.querySelector('#sw-start') as HTMLElement).click();
  return game;
}

describe('fb071: losing window focus auto-pauses a running phase', () => {
  it.each(['act1_wave', 'act2'] as const)(
    'a blur event during %s reaches the same pause state as Esc, without touching phase/outcome',
    (phase) => {
      const root = mount();
      const game = startGame(root);
      const g = game as unknown as GameInternals;
      g.run.world.phase = phase;
      const outcomeBefore = g.run.world.outcome;
      const tickBefore = g.run.world.tick;

      expect(g.paused).toBe(false);
      window.dispatchEvent(new Event('blur'));

      expect(g.paused).toBe(true);
      expect(g.run.world.phase).toBe(phase);
      expect(g.run.world.outcome).toBe(outcomeBefore);
      expect(g.run.world.tick).toBe(tickBefore);

      const modal = root.querySelector('#sw-modal') as HTMLElement;
      expect(modal.hidden).toBe(false);
      expect(modal.querySelector('[data-act="resume"]')).not.toBeNull();
    },
  );

  it('a focus event afterward does not auto-resume', () => {
    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;

    window.dispatchEvent(new Event('blur'));
    expect(g.paused).toBe(true);

    window.dispatchEvent(new Event('focus'));
    expect(g.paused).toBe(true);
    const modal = root.querySelector('#sw-modal') as HTMLElement;
    expect(modal.hidden).toBe(false);
  });

  it('blur while already manually paused (Esc) does not toggle the run back to running', () => {
    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(g.paused).toBe(true);

    window.dispatchEvent(new Event('blur'));
    expect(g.paused).toBe(true);
    const modal = root.querySelector('#sw-modal') as HTMLElement;
    expect(modal.hidden).toBe(false);
  });

  it('blur before a run has started is a no-op, not a crash', () => {
    const root = mount();
    const game = new Game();
    game.start(root);

    expect(() => window.dispatchEvent(new Event('blur'))).not.toThrow();
  });

  it('a blur event during levelup reaches the same pause state as Esc, swapping the level-up card for the pause card', () => {
    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;
    g.run.world.phase = 'levelup';

    window.dispatchEvent(new Event('blur'));

    expect(g.paused).toBe(true);
    expect(g.run.world.phase).toBe('levelup');
    const modal = root.querySelector('#sw-modal') as HTMLElement;
    expect(modal.hidden).toBe(false);
    expect(modal.querySelector('[data-act="resume"]')).not.toBeNull();
  });

  it.each(['victory', 'defeat_core', 'defeat_warden'] as const)(
    'blur is a no-op once outcome is %s, mirroring togglePause\'s own guard',
    (outcome) => {
      const root = mount();
      const game = startGame(root);
      const g = game as unknown as GameInternals;
      g.run.world.outcome = outcome;

      window.dispatchEvent(new Event('blur'));

      expect(g.paused).toBe(false);
    },
  );

  it('a held charge key (q) survives a blur-triggered pause, matching clearKeysForPause\'s Esc behavior', () => {
    // qa-playtester (fb071 verification) found the blur listener's original
    // `this.keys.clear()` stripped `q` *before* `setPaused`'s own
    // `clearKeysForPause` call could preserve it — reintroducing the
    // no-player-intent charge-release bug `clearKeysForPause`'s doc comment
    // (src/ui/input.ts) already documents was fixed for Esc. `q` is the one
    // key that must survive any pause transition, held or not.
    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;
    g.run.world.phase = 'act1_wave';

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));
    expect(g.keys.has('q')).toBe(true);
    // A movement key held at the same time is expected to drop, same as Esc.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));

    window.dispatchEvent(new Event('blur'));

    expect(g.paused).toBe(true);
    expect(g.keys.has('q')).toBe(true);
    expect(g.keys.has('w')).toBe(false);
  });
});
