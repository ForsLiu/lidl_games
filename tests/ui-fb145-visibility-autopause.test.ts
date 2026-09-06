/**
 * @vitest-environment jsdom
 *
 * fb145: fb071 auto-pauses a running run on `window`'s `blur`, which covers
 * alt-tab on a desktop browser. `visibilitychange` appeared nowhere in `src/`
 * — and a backgrounded tab, a minimized window and an app switch on mobile do
 * not reliably fire `blur` at all. The sim therefore kept ticking unattended
 * against a live Core through exactly the doors fb071 exists to close, and
 * QUALITY.md BETA names "window unfocus auto-pauses" as its own line.
 *
 * NO `blur` event is dispatched anywhere in this file, deliberately: every
 * case below has to pass through the `visibilitychange` listener or not at
 * all, so nothing can pass via fb071's listener instead. The mirror image of
 * `tests/ui-fb071-blur-autopause.test.ts`, whose own cases stay as they are.
 *
 * Becoming visible again must NOT auto-resume, matching fb071's (and Esc's)
 * deliberate manual-resume convention — racing the player back into combat
 * before they have looked at the screen is the thing the pause is for.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

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

/**
 * jsdom's `document.hidden` is a `Document.prototype` getter reading a
 * visibility state the test cannot set, so it is shadowed on the instance —
 * restored in `afterEach` so a stub can never leak into another case.
 */
function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
}

function hide(): void {
  setHidden(true);
  document.dispatchEvent(new Event('visibilitychange'));
}

function reveal(): void {
  setHidden(false);
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('fb145: a hidden tab auto-pauses, with no blur event anywhere', () => {
  afterEach(() => {
    delete (document as unknown as { hidden?: unknown }).hidden;
  });

  it.each(['act1_wave', 'act2'] as const)(
    'a visibilitychange to hidden during %s pauses, without touching phase/outcome/tick',
    (phase) => {
      const root = mount();
      const game = startGame(root);
      const g = game as unknown as GameInternals;
      g.run.world.phase = phase;
      const outcomeBefore = g.run.world.outcome;
      const tickBefore = g.run.world.tick;

      expect(g.paused).toBe(false);
      hide();

      expect(g.paused).toBe(true);
      expect(g.run.world.phase).toBe(phase);
      expect(g.run.world.outcome).toBe(outcomeBefore);
      expect(g.run.world.tick).toBe(tickBefore);

      const modal = root.querySelector('#sw-modal') as HTMLElement;
      expect(modal.hidden).toBe(false);
      expect(modal.querySelector('[data-act="resume"]')).not.toBeNull();
    },
  );

  it('becoming visible again does not auto-resume', () => {
    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;

    hide();
    expect(g.paused).toBe(true);

    reveal();
    expect(g.paused).toBe(true);
    const modal = root.querySelector('#sw-modal') as HTMLElement;
    expect(modal.hidden).toBe(false);
  });

  it('a visibilitychange while still visible is a no-op — the hidden check is real', () => {
    // Some engines fire `visibilitychange` on the *reveal* half too. Without
    // the `document.hidden` guard this handler would pause a run every time
    // the player came back to the tab, which is the opposite of the feature.
    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;
    g.run.world.phase = 'act1_wave';

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    expect(g.keys.has('w')).toBe(true);

    reveal();

    expect(g.paused).toBe(false);
    // code-reviewer finding: without this the guard could be satisfied by a
    // refactor that hoisted `clearKeysForPause` above the `document.hidden`
    // check — every return to the tab would then silently drop the player's
    // held movement keys while every other case here stayed green.
    expect(g.keys.has('w')).toBe(true);
  });

  it('hiding while already manually paused (Esc) does not toggle back to running', () => {
    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(g.paused).toBe(true);

    hide();
    expect(g.paused).toBe(true);
    const modal = root.querySelector('#sw-modal') as HTMLElement;
    expect(modal.hidden).toBe(false);
  });

  it('hiding before a run has started is a no-op, not a crash', () => {
    const root = mount();
    const game = new Game();
    game.start(root);

    expect(() => hide()).not.toThrow();
  });

  it.each(['victory', 'defeat_core', 'defeat_warden'] as const)(
    'hiding is a no-op once outcome is %s, mirroring togglePause\'s own guard',
    (outcome) => {
      const root = mount();
      const game = startGame(root);
      const g = game as unknown as GameInternals;
      g.run.world.outcome = outcome;

      hide();

      expect(g.paused).toBe(false);
    },
  );

  it('runs the same clearKeysForPause a blur does — q survives, movement keys drop', () => {
    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;
    g.run.world.phase = 'act1_wave';

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    expect(g.keys.has('q')).toBe(true);
    expect(g.keys.has('w')).toBe(true);

    hide();

    expect(g.paused).toBe(true);
    expect(g.keys.has('q')).toBe(true);
    expect(g.keys.has('w')).toBe(false);
  });

  it('a levelup phase pauses the same way, swapping the level-up card for the pause card', () => {
    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;
    g.run.world.phase = 'levelup';

    hide();

    expect(g.paused).toBe(true);
    expect(g.run.world.phase).toBe('levelup');
    const modal = root.querySelector('#sw-modal') as HTMLElement;
    expect(modal.hidden).toBe(false);
    expect(modal.querySelector('[data-act="resume"]')).not.toBeNull();
  });
  it('binds exactly one visibilitychange listener, however many runs are played', () => {
    // qa-playtester (fb145 verification) checked this by hand and asked for it
    // to be pinned: `bindGlobalInput` is `inputBound`-guarded, so a Retry, a
    // New Run and a return through the Hub must all reuse the one listener.
    // A refactor that moved the binding out from behind that guard would
    // otherwise fan every later hide out across stale `Game` state silently.
    const root = mount();
    const real = document.addEventListener.bind(document);
    let bound = 0;
    document.addEventListener = ((type: string, ...rest: unknown[]) => {
      if (type === 'visibilitychange') bound++;
      return (real as (...a: unknown[]) => void)(type, ...rest);
    }) as typeof document.addEventListener;
    try {
      const game = startGame(root);
      const g = game as unknown as GameInternals;
      expect(bound).toBe(1);

      // Pause -> Quit -> confirm -> back to the Hub -> start another run.
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      root.querySelector<HTMLElement>('[data-act="quit"]')?.click();
      root.querySelector<HTMLElement>('[data-act="confirm"]')?.click();
      (root.querySelector('#sw-start') as HTMLElement).click();

      expect(bound).toBe(1);
      expect(g.paused).toBe(false);
      hide();
      expect(g.paused).toBe(true);
    } finally {
      document.addEventListener = real as typeof document.addEventListener;
    }
  });
});
