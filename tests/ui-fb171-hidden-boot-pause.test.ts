/**
 * @vitest-environment jsdom
 *
 * fb171 (qa-playtester finding during fb145 QA): fb071 (`blur`) and fb145
 * (`visibilitychange`) auto-pause a run that is already showing when the
 * document backgrounds, but neither fires for a run that BOOTS — fresh or a
 * fb074 resume — in an already-hidden document (e.g. a browser restoring a
 * background tab): `beginRun` binds those listeners after the document is
 * already hidden, was never focused so `blur` cannot fire, and the only
 * event left to arrive is the reveal, which `onFocusLost`'s own
 * `!document.hidden` guard correctly ignores. `beginRun` now mirrors that
 * same `outcome === 'running'` guard at bind time instead.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { contentHash, loadContent } from '../src/sim/content';
import type { World } from '../src/sim/world';
import { Game } from '../src/ui/main';
import { RUN_PERSIST_KEY } from '../src/ui/runpersist';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

/**
 * Same generic no-op `Proxy` `tests/ui-fb074-resume-on-refresh.test.ts` uses
 * for its own `tick64` — `tick64` below reaches `Renderer.draw()`, which
 * touches a large chunk of the 2D context API, unlike the sibling `main.ts`
 * tests that stub only `setTransform`/`scale`.
 */
function makeCtx(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => {} };
  const base: Record<string, unknown> = {
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    measureText: () => ({ width: 0 }),
  };
  return new Proxy(base, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      const fn = () => {};
      target[prop] = fn;
      return fn;
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function mount(): HTMLElement {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  HTMLCanvasElement.prototype.getContext = (() => makeCtx()) as never;
  window.requestAnimationFrame = (() => 0) as never;
  return document.getElementById('app') as HTMLElement;
}

interface GameInternals {
  paused: boolean;
  run: { world: World } | null;
  frame: (now: number) => void;
  last: number;
}

/** Same shadowing convention `tests/ui-fb145-visibility-autopause.test.ts` uses — jsdom's `document.hidden` is a read-only prototype getter. */
function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
}

/** Drives 8 large frame() jumps — the Pacer's 8-tick-per-frame catch-up cap makes this exactly 64 sim ticks, crossing fb074's 60-tick persistence throttle (same idiom as ui-fb074-resume-on-refresh.test.ts's tick64). */
function tick64(game: Game): void {
  const g = game as unknown as GameInternals;
  let now = g.last;
  for (let i = 0; i < 8; i++) {
    now += 300;
    g.frame(now);
  }
}

afterEach(() => {
  delete (document as unknown as { hidden?: unknown }).hidden;
  localStorage.clear();
});

describe('fb171: a fresh run that boots in an already-hidden document comes up paused', () => {
  it('document.hidden true before Game construction -> paused after #sw-start', () => {
    localStorage.clear();
    setHidden(true);
    const root = mount();
    const game = new Game();
    game.start(root);
    (root.querySelector('#sw-start') as HTMLElement).click();
    expect((game as unknown as GameInternals).paused).toBe(true);
  });

  it('control: document.hidden false -> a fresh run boots unpaused, as before', () => {
    localStorage.clear();
    setHidden(false);
    const root = mount();
    const game = new Game();
    game.start(root);
    (root.querySelector('#sw-start') as HTMLElement).click();
    expect((game as unknown as GameInternals).paused).toBe(false);
  });
});

describe('fb171: a persisted run resumed in an already-hidden document comes up paused', () => {
  it('document.hidden true before the resuming Game is constructed -> paused', () => {
    localStorage.clear();
    setHidden(false);
    const root1 = mount();
    const game1 = new Game();
    game1.start(root1);
    (root1.querySelector('#sw-start') as HTMLElement).click();
    tick64(game1);
    const persisted = localStorage.getItem(RUN_PERSIST_KEY);
    expect(persisted).not.toBeNull();
    expect(JSON.parse(persisted!).config.contentHash).toBe(contentHash(loadContent()));

    setHidden(true);
    const root2 = mount();
    const game2 = new Game();
    game2.start(root2);

    const g2 = game2 as unknown as GameInternals;
    // Confirms this genuinely resumed (not a fresh Hub boot) before asserting pause.
    expect(root2.querySelector('#sw-start')).toBeNull();
    expect(g2.run).not.toBeNull();
    expect(g2.paused).toBe(true);
  });

  it('control: document.hidden false -> a resumed run boots unpaused, as before', () => {
    localStorage.clear();
    setHidden(false);
    const root1 = mount();
    const game1 = new Game();
    game1.start(root1);
    (root1.querySelector('#sw-start') as HTMLElement).click();
    tick64(game1);
    expect(localStorage.getItem(RUN_PERSIST_KEY)).not.toBeNull();

    const root2 = mount();
    const game2 = new Game();
    game2.start(root2);

    const g2 = game2 as unknown as GameInternals;
    expect(root2.querySelector('#sw-start')).toBeNull();
    expect(g2.run).not.toBeNull();
    expect(g2.paused).toBe(false);
  });
});
