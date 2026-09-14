/**
 * @vitest-environment jsdom
 *
 * fb170 (qa-playtester, filed during fb145 QA): fb145's `visibilitychange`
 * handler is, by its own doc comment, the last reliable moment before a
 * mobile freeze/discard — but it only called `onFocusLost` (pause), leaving
 * the actual checkpoint write to `frame()`'s 60-tick persistence throttle
 * (`inputLog.length - lastPersistedLen >= 60`), which the pause this same
 * handler just triggered stops from ever running again. Measured by the item:
 * 95 real (1-tick-per-frame) frames -> `world.tick === 94`, persisted
 * `inputLog.length === 60` — ~0.57s of play unrecoverable if the hidden tab
 * is discarded right there, missing QUALITY.md BETA's "no progress loss on
 * refresh" bar on exactly the platform fb145 was written for.
 *
 * Reuses tests/ui-fb074-resume-on-refresh.test.ts's full-canvas-proxy `mount`
 * (this test drives `frame()` far enough to reach `Renderer.draw()`, unlike
 * every other `main.ts` test) and tests/ui-fb145-visibility-autopause
 * .test.ts's `hide()`/`setHidden` idiom.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { World } from '../src/sim/world';
import { Game } from '../src/ui/main';
import { loadPersistedRun } from '../src/ui/runpersist';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

/** Same generic no-op canvas proxy fb074's own test uses, needed because this file drives `frame()` (and therefore `Renderer.draw()`) many times. */
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

/**
 * Every `it()` below constructs its own `Game`, and `Game.start()` binds a
 * `document`-level `visibilitychange` listener that this test file's own
 * shared jsdom `document` (one per FILE, not per `it()`) would otherwise
 * accumulate across tests — an earlier test's now-stale `Game` still holding
 * a real, guard-passing `this.run` would fire its OWN `persistRun()` on a
 * LATER test's `hide()` dispatch and overwrite that test's own localStorage
 * assertion with stale data (a real cross-test leak this file's own negative
 * controls surfaced, not a product bug). Tracked and stripped in `afterEach`.
 */
const addedListeners: { type: string; listener: EventListenerOrEventListenerObject }[] = [];
const realAddEventListener = document.addEventListener.bind(document);

function mount(): HTMLElement {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  HTMLCanvasElement.prototype.getContext = (() => makeCtx()) as never;
  window.requestAnimationFrame = (() => 0) as never;
  document.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, ...rest: unknown[]) => {
    if (type === 'visibilitychange') addedListeners.push({ type, listener });
    return (realAddEventListener as (...a: unknown[]) => void)(type, listener, ...rest);
  }) as typeof document.addEventListener;
  return document.getElementById('app') as HTMLElement;
}

interface GameInternals {
  run: { world: World } | null;
  frame: (now: number) => void;
  last: number;
  inputLog: unknown[];
  lastPersistedLen: number;
  persistDisabled: boolean;
}

function startGame(root: HTMLElement): Game {
  const game = new Game();
  game.start(root);
  (root.querySelector('#sw-start') as HTMLElement).click();
  return game;
}

/**
 * Drives exactly `n` real, ~1-tick-per-frame `frame()` calls (16.667ms real
 * time each — the Pacer's own `FIXED_DT` at 1x) rather than fb074's own
 * `tick64`'s large 8-tick-per-frame catch-up jumps, which land exactly on
 * (and therefore mask) a 60-tick throttle boundary. This is what reproduces
 * the filed repro shape: several throttle-window-widths of ticks accrued one
 * at a time, landing on a tick that is NOT a multiple of 60 and is NOT yet
 * flushed by the periodic throttle.
 */
function tickOneByOne(game: Game, n: number): void {
  const g = game as unknown as GameInternals;
  let now = g.last;
  for (let i = 0; i < n; i++) {
    now += 1000 / 60;
    g.frame(now);
  }
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
}

function hide(): void {
  setHidden(true);
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('fb170: hiding the tab flushes the persisted run past the 60-tick throttle', () => {
  afterEach(() => {
    delete (document as unknown as { hidden?: unknown }).hidden;
    localStorage.clear();
    for (const { type, listener } of addedListeners.splice(0)) {
      document.removeEventListener(type, listener);
    }
    // Restore the native method — `mount()` reassigns it fresh on the next
    // test anyway, but leaving the wrapper in place after this file's LAST
    // test would otherwise leak into whatever test file the runner loads
    // next in the same worker (exactly the class of cross-file leak fb170's
    // own main.ts fix turned up in tests/ui-fb145-visibility-autopause.test.ts,
    // fixed there via `localStorage.clear()`; this is the DOM-listener half
    // of the same lesson).
    document.addEventListener = realAddEventListener as typeof document.addEventListener;
  });

  it('a non-multiple-of-60 tick, not yet covered by the periodic throttle, is fully persisted on hide', () => {
    localStorage.clear();
    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;

    tickOneByOne(game, 94);
    const tick = g.run!.world.tick;
    expect(tick).toBeGreaterThan(60); // the periodic throttle has fired at least once already
    expect(tick % 60).not.toBe(0); // and this tick sits strictly between two throttle boundaries
    // The bug's own signature: the throttle has not caught up to the current
    // tick yet — this is exactly the gap fb170 exists to close.
    expect(g.lastPersistedLen).toBeLessThan(g.inputLog.length);

    hide();

    const persisted = loadPersistedRun();
    expect(persisted).not.toBeNull();
    expect(persisted!.inputLog.length).toBe(tick);
    expect(persisted!.inputLog.length).toBe(g.inputLog.length);
  });

  it('a hide on the Hub (no run at all) writes nothing', () => {
    localStorage.clear();
    const root = mount();
    new Game().start(root); // never clicks #sw-start — stays on the Hub

    hide();

    expect(loadPersistedRun()).toBeNull();
  });

  it('a hide with persistence already disabled (a prior write failure) writes nothing new', () => {
    localStorage.clear();
    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;

    tickOneByOne(game, 65); // real throttle fires once, a real checkpoint exists
    const before = loadPersistedRun();
    expect(before).not.toBeNull();

    g.persistDisabled = true;
    tickOneByOne(game, 30); // world.tick keeps advancing in memory regardless

    hide();

    const after = loadPersistedRun();
    // Unchanged from the last real write — `persistDisabled` short-circuits
    // `persistRun()` itself, the same guard every throttled call already
    // honours, not a second one reimplemented at the hide site.
    expect(after!.inputLog.length).toBe(before!.inputLog.length);
    expect(after!.inputLog.length).toBeLessThan(g.inputLog.length);
  });

  it('hiding an already-finished run does not resurrect a checkpoint (mirrors onFocusLost\'s own outcome guard)', () => {
    localStorage.clear();
    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;

    tickOneByOne(game, 65);
    expect(loadPersistedRun()).not.toBeNull(); // sanity: a real checkpoint did exist

    // A finished run already clears its own persisted checkpoint the next
    // tick it processes the terminal outcome (main.ts's own, pre-existing,
    // unrelated cleanup) — unlike a live pause, there is nothing left for a
    // hide-triggered flush to write on top of.
    g.run!.world.outcome = 'defeat_core';
    tickOneByOne(game, 1);
    expect(loadPersistedRun()).toBeNull();

    expect(() => hide()).not.toThrow();
    expect(loadPersistedRun()).toBeNull();
  });
});
