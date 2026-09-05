/**
 * @vitest-environment jsdom
 *
 * fb065 (code-reviewer Minor, addressed same session): `Game`'s window
 * `resize` listener (`src/ui/main.ts`) rAF-coalesces bursts of native resize
 * events into a single `Renderer.resize()` call, and always reads the
 * *current* `this.renderer` at the moment the rAF callback fires — never a
 * renderer instance captured when the listener was first bound — so a resize
 * after a Retry (which reassigns `this.renderer`, `startRun`) lands on the
 * new run's renderer, not the finished run's. Neither property was under
 * test before this file; `Renderer.resize()`'s own sizing math is covered by
 * `tests/render-fb065-stage-fill.test.ts`.
 *
 * `requestAnimationFrame` is stubbed to record callbacks into a queue rather
 * than the usual `() => 0` no-op every sibling `main.ts` test uses — that
 * no-op would never invoke the coalesced resize callback at all, since this
 * file needs to flush it manually to observe `Renderer.resize()` firing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { Renderer } from '../src/render/canvas';
import { Game } from '../src/ui/main';
import type { Hud } from '../src/ui/hud';
import type { World } from '../src/sim/world';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function mount(rafQueue: FrameRequestCallback[]): HTMLElement {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  HTMLCanvasElement.prototype.getContext = (() => ({
    setTransform() {},
    scale() {},
  })) as never;
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return rafQueue.length;
  }) as never;
  return document.getElementById('app') as HTMLElement;
}

/** Forces the live run straight to the Results screen without playing it out — same idiom as tests/b069-retry-autopick-lastcfg.test.ts. */
function forceDefeat(game: Game): void {
  const w = (game as unknown as { run: { world: World } }).run.world;
  w.outcome = 'defeat_core';
  w.phase = 'results';
  (game as unknown as { hud: Hud }).hud.syncModal(w);
}

describe('fb065: the window resize listener coalesces bursts and always targets the live renderer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('collapses several resize events fired before the next paint into a single Renderer.resize() call', () => {
    const rafQueue: FrameRequestCallback[] = [];
    const root = mount(rafQueue);
    const game = new Game();
    game.start(root);
    (root.querySelector('#sw-start') as HTMLElement).click();

    const spy = vi.spyOn(Renderer.prototype, 'resize');
    const queuedBefore = rafQueue.length;

    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('resize'));

    // Coalesced: three dispatches before the paint queue exactly one rAF callback.
    expect(rafQueue.length).toBe(queuedBefore + 1);
    expect(spy).not.toHaveBeenCalled();

    rafQueue[rafQueue.length - 1](0);
    expect(spy).toHaveBeenCalledTimes(1);

    // A later burst, after the first flush, queues (and flushes) again.
    window.dispatchEvent(new Event('resize'));
    expect(rafQueue.length).toBe(queuedBefore + 2);
    rafQueue[rafQueue.length - 1](0);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('a post-Retry resize targets the new renderer instance, not the one from the run that just ended', () => {
    const rafQueue: FrameRequestCallback[] = [];
    const root = mount(rafQueue);
    const game = new Game();
    game.start(root);
    (root.querySelector('#sw-start') as HTMLElement).click();

    const oldRenderer = (game as unknown as { renderer: Renderer }).renderer;
    const oldSpy = vi.spyOn(oldRenderer, 'resize');

    forceDefeat(game);
    (root.querySelector('[data-act="retry"]') as HTMLElement).click();

    const newRenderer = (game as unknown as { renderer: Renderer }).renderer;
    expect(newRenderer).not.toBe(oldRenderer);
    const newSpy = vi.spyOn(newRenderer, 'resize');

    window.dispatchEvent(new Event('resize'));
    rafQueue[rafQueue.length - 1](0);

    expect(newSpy).toHaveBeenCalledTimes(1);
    expect(oldSpy).not.toHaveBeenCalled();
  });
});
