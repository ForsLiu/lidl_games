/**
 * @vitest-environment jsdom
 *
 * fb114 (QUALITY.md BETA's Settings line, "resolution/DPR handling"):
 * `Renderer.resize()` (`src/render/canvas.ts`) reads `devicePixelRatio` and
 * sizes the canvas backing store by it, but the only thing that re-ran it was
 * `Game`'s `window` `resize` listener (fb065). Dragging the window onto a
 * monitor with a different DPI does not reliably fire `resize`, so the
 * backing store stayed pinned at the ratio in effect when the run started —
 * a blurry (or needlessly over-sampled) canvas until the player resized the
 * window by hand.
 *
 * `Game` now also watches a `(resolution: Ndppx)` media query. That query
 * matches exactly ONE ratio, so it fires once and is then permanently false
 * for the ratio just moved to — the listener must re-arm at the new ratio or
 * it would only ever catch the first change. Both properties are asserted
 * here, with NO `window` `resize` event dispatched anywhere in this file, so
 * nothing can pass via fb065's listener instead. The isolation is in fact
 * stronger than that (code-reviewer note): `mount()` stubs
 * `requestAnimationFrame` to `() => 0`, and fb065's listener is rAF-coalesced,
 * so even a stray `resize` event could not reach `Renderer.resize()` here.
 *
 * jsdom ships no `matchMedia` at all, which is exactly why the production
 * code treats its absence as "DPR tracking off" rather than a throw — the
 * last test pins that, since it is the shape every OTHER `main.ts` test in
 * this suite runs under.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { Renderer } from '../src/render/canvas';
import { Game } from '../src/ui/main';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

interface FakeQuery {
  media: string;
  matches: boolean;
  listeners: (() => void)[];
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
}

/**
 * A `matchMedia` stub that records every query string it was handed and lets
 * the test fire `change` on whichever one is currently armed.
 */
function installMatchMedia(): { queries: FakeQuery[] } {
  const queries: FakeQuery[] = [];
  (globalThis as unknown as { matchMedia: unknown }).matchMedia = (media: string): FakeQuery => {
    const q: FakeQuery = {
      media,
      matches: true,
      listeners: [],
      addEventListener: (type, fn) => {
        if (type === 'change') q.listeners.push(fn);
      },
      removeEventListener: (type, fn) => {
        if (type !== 'change') return;
        const i = q.listeners.indexOf(fn);
        if (i >= 0) q.listeners.splice(i, 1);
      },
    };
    queries.push(q);
    return q;
  };
  return { queries };
}

/**
 * Fires `change` on a copy of the listener array (qa-playtester finding): the
 * production re-arm calls `removeEventListener`, which splices the very array
 * being iterated. Harmless with exactly one listener, but a second one would be
 * silently skipped and the assertion would pass vacuously.
 */
function fire(q: FakeQuery): void {
  q.listeners.slice().forEach((fn) => fn());
}

function setDpr(value: number): void {
  Object.defineProperty(globalThis, 'devicePixelRatio', { value, configurable: true });
}

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

/** Boots a real `Game` all the way into a run, which is what assigns `this.renderer`. */
function startedGame(root: HTMLElement): Game {
  const game = new Game();
  game.start(root);
  (root.querySelector('#sw-start') as HTMLElement).click();
  return game;
}

describe('fb114: a devicePixelRatio change resizes the canvas without any window resize', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as unknown as { matchMedia?: unknown }).matchMedia;
    setDpr(1);
  });

  it('arms a resolution query at the current ratio when input is bound', () => {
    setDpr(1);
    const { queries } = installMatchMedia();
    startedGame(mount());

    const resolutionQueries = queries.filter((q) => q.media.includes('resolution'));
    expect(resolutionQueries).toHaveLength(1);
    expect(resolutionQueries[0].media).toBe('(resolution: 1dppx)');
    expect(resolutionQueries[0].listeners).toHaveLength(1);
  });

  it('re-runs Renderer.resize() on a DPR change with no window resize event at all', () => {
    setDpr(1);
    const { queries } = installMatchMedia();
    const game = startedGame(mount());

    const spy = vi.spyOn(Renderer.prototype, 'resize');
    const armed = queries.filter((q) => q.media.includes('resolution')).at(-1) as FakeQuery;
    const canvas = (game as unknown as { hud: { canvas: HTMLCanvasElement } }).hud.canvas;
    const widthBefore = canvas.width;

    // The monitor changed underneath us: a new ratio, and only the media query
    // fires — no `resize` event is dispatched anywhere in this test.
    setDpr(2);
    fire(armed);

    expect(spy).toHaveBeenCalledTimes(1);
    // The acceptance criterion is the BACKING STORE, not the call
    // (code-reviewer finding): a `resize(someCachedDpr)` — or an early return
    // that swallowed the change — would satisfy the spy while leaving the
    // canvas at the old ratio, which is precisely the bug this item exists to
    // fix. jsdom gives no layout, so `Renderer.resize` takes its documented
    // 1152x640 fallback and the ratio is the only variable: 1 -> 2 doubles it.
    expect(canvas.width).toBe(widthBefore * 2);
    // ...while the CSS width, which carries no ratio, must NOT move.
    expect(canvas.style.width).toBe(`${widthBefore}px`);
  });

  it('re-arms at the new ratio, so a SECOND change is caught too', () => {
    setDpr(1);
    const { queries } = installMatchMedia();
    startedGame(mount());
    const resolutionQueries = () => queries.filter((q) => q.media.includes('resolution'));

    const first = resolutionQueries().at(-1) as FakeQuery;
    setDpr(2);
    fire(first);

    // A `(resolution: 1dppx)` query is permanently false once the ratio is 2,
    // so catching a second change requires a fresh query at the new ratio...
    const second = resolutionQueries().at(-1) as FakeQuery;
    expect(second).not.toBe(first);
    expect(second.media).toBe('(resolution: 2dppx)');
    // ...and the stale one must have been detached, or every future change
    // would fire N handlers for N ratios ever visited.
    expect(first.listeners).toHaveLength(0);
    expect(second.listeners).toHaveLength(1);

    const spy = vi.spyOn(Renderer.prototype, 'resize');
    setDpr(3);
    fire(second);
    expect(spy).toHaveBeenCalledTimes(1);
    expect((resolutionQueries().at(-1) as FakeQuery).media).toBe('(resolution: 3dppx)');
  });

  it('the DPR change reaches the LIVE renderer, not a stale one from a finished run', () => {
    setDpr(1);
    const { queries } = installMatchMedia();
    const root = mount();
    const game = startedGame(root);

    const oldRenderer = (game as unknown as { renderer: Renderer }).renderer;
    const oldSpy = vi.spyOn(oldRenderer, 'resize');

    // Same Retry idiom as tests/ui-fb065-resize-listener.test.ts: a new run
    // reassigns `this.renderer`, while `bindGlobalInput` ran only once.
    const w = (game as unknown as { run: { world: { outcome: string; phase: string } } }).run.world;
    w.outcome = 'defeat_core';
    w.phase = 'results';
    (game as unknown as { hud: { syncModal: (w: unknown) => void } }).hud.syncModal(w);
    (root.querySelector('[data-act="retry"]') as HTMLElement).click();

    const newRenderer = (game as unknown as { renderer: Renderer }).renderer;
    expect(newRenderer).not.toBe(oldRenderer);
    const newSpy = vi.spyOn(newRenderer, 'resize');

    const armed = queries.filter((q) => q.media.includes('resolution')).at(-1) as FakeQuery;
    setDpr(2);
    fire(armed);

    expect(newSpy).toHaveBeenCalledTimes(1);
    expect(oldSpy).not.toHaveBeenCalled();
  });

  it('is a silent no-op where matchMedia does not exist — the shape every other main.ts test runs under', () => {
    delete (globalThis as unknown as { matchMedia?: unknown }).matchMedia;
    expect((globalThis as unknown as { matchMedia?: unknown }).matchMedia).toBeUndefined();
    // Booting a full run is what calls `armDprListener`; it must not throw.
    expect(() => startedGame(mount())).not.toThrow();
  });

  it('a matchMedia returning null leaves the run started and reachable, not a dead screen', () => {
    // qa-playtester finding: this used to throw a TypeError out of
    // `armDprListener`, escaping `bindGlobalInput` BEFORE `inputBound`,
    // `bindCanvasInput()` and `this.run` were set — and with the Hub already
    // torn down, the player was left with a mounted canvas, no run, and no way
    // back. The assertions below are about the RUN surviving, not about the
    // absence of a throw, because that is the damage the bug actually did.
    setDpr(1);
    (globalThis as unknown as { matchMedia: unknown }).matchMedia = () => null;
    const root = mount();
    const game = startedGame(root);

    expect((game as unknown as { run: unknown }).run).not.toBeNull();
    expect((game as unknown as { inputBound: boolean }).inputBound).toBe(true);
    expect(root.querySelector('canvas')).not.toBeNull();
  });

  it('refuses to arm a query it cannot detach from, instead of doubling handlers on every change', () => {
    // qa-playtester finding: `removeEventListener` was optional-chained, so a
    // MediaQueryList missing it silently skipped the detach while a new query
    // was armed anyway — measured 2^6 = 64 live listeners after six rounds.
    // A real UA cannot produce this (MediaQueryList is an EventTarget), but
    // "cannot clean up" must degrade to "do not track", never to unbounded
    // growth.
    setDpr(1);
    const queries: FakeQuery[] = [];
    (globalThis as unknown as { matchMedia: unknown }).matchMedia = (media: string) => {
      const q = {
        media,
        matches: true,
        listeners: [] as (() => void)[],
        addEventListener: (type: string, fn: () => void) => {
          if (type === 'change') q.listeners.push(fn);
        },
      };
      queries.push(q as unknown as FakeQuery);
      return q;
    };
    startedGame(mount());

    const live = () => queries.reduce((n, q) => n + q.listeners.length, 0);
    expect(live()).toBe(0);
    for (let i = 0; i < 6; i++) {
      setDpr(i + 2);
      queries.forEach((q) => fire(q));
    }
    expect(live()).toBe(0);
    expect(queries.length).toBe(1);
  });

  it('survives a matchMedia that rejects the query string, rather than taking input binding down with it', () => {
    setDpr(1);
    (globalThis as unknown as { matchMedia: unknown }).matchMedia = () => {
      throw new SyntaxError('unsupported media feature');
    };
    const root = mount();
    expect(() => startedGame(root)).not.toThrow();
    // The rest of `bindGlobalInput` still wired up: a keypress reaches the game.
    expect(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }))).not.toThrow();
  });
});
