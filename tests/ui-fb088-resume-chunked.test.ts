/**
 * @vitest-environment jsdom
 *
 * fb088: qa-playtester found fb074's resume-on-refresh replay
 * (`Game.tryResumePersistedRun`, `src/ui/main.ts`) ran the *entire* persisted
 * input log through `run.step()` synchronously before the first paint —
 * measured at ~7.5s wall-clock for a full 128,191-tick run, extrapolating to
 * ~2.5-3s at the practical quota-limited ceiling (fb087). A refresh late in a
 * long run froze the page for that whole span with nothing shown.
 *
 * `tryResumePersistedRun` now replays in bursts of `RESUME_CHUNK_TICKS` (256)
 * ticks, yielding to the browser via a `setTimeout(fn, 0)` macrotask between
 * bursts whenever the log is longer than one burst, and shows a
 * `#sw-resume-indicator` loading notice for the duration. A log short enough
 * to finish within one burst (every existing `tick64`-driven fb074 test caps
 * out at 64 ticks) still resumes synchronously, unchanged.
 *
 * Drives the real `Game` end to end, same idiom as
 * tests/ui-fb074-resume-on-refresh.test.ts. Uses `vi.useFakeTimers()` to
 * control the `setTimeout` chain deterministically instead of racing real
 * timers.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadContent } from '../src/sim/content';
import { Run } from '../src/sim/run';
import type { RunConfig } from '../src/sim/types';
import type { World } from '../src/sim/world';
import { Game } from '../src/ui/main';
import { RUN_PERSIST_KEY } from '../src/ui/runpersist';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

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
  run: { world: World; hash: () => string } | null;
  frame: (now: number) => void;
  last: number;
}

/** Same catch-up-cap idiom as tests/ui-fb074-resume-on-refresh.test.ts: exactly 64 sim ticks per call. Called repeatedly here to build a log longer than one fb088 replay burst (256 ticks). */
function tick64(game: Game): void {
  const g = game as unknown as GameInternals;
  let now = g.last;
  for (let i = 0; i < 8; i++) {
    now += 300;
    g.frame(now);
  }
}

function persistedEntry(): { config: RunConfig; inputLog: unknown[] } | null {
  const raw = localStorage.getItem(RUN_PERSIST_KEY);
  return raw ? JSON.parse(raw) : null;
}

describe('fb088: a long persisted-run replay chunks across frames instead of blocking the first paint', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows a loading indicator and defers completion across multiple setTimeout bursts for a log longer than one chunk', () => {
    const root1 = mount();
    const game1 = new Game();
    game1.start(root1);
    (root1.querySelector('#sw-start') as HTMLElement).click();
    for (let i = 0; i < 10; i++) tick64(game1); // 640 ticks: one sync 256-tick burst plus two more async ones

    const persisted = persistedEntry();
    expect(persisted).not.toBeNull();
    expect(persisted!.inputLog.length).toBeGreaterThan(512);

    const content = loadContent();
    const reference = new Run(persisted!.config, content);
    for (const input of persisted!.inputLog) reference.step(input as never);

    vi.useFakeTimers();
    const root2 = mount();
    const game2 = new Game();
    game2.start(root2);

    // The first (synchronous) chunk finishes before start() returns, but the
    // whole log does not: the resume is still pending, not the Hub and not a
    // live run yet.
    expect(root2.querySelector('#sw-resume-indicator')).not.toBeNull();
    expect(root2.querySelector('#sw-start')).toBeNull();
    expect(root2.querySelector('#sw-canvas')).toBeNull();
    expect((game2 as unknown as GameInternals).run).toBeNull();
    expect(vi.getTimerCount()).toBe(1);

    // Step one scheduled burst at a time, counting how many it takes to
    // drain — more than one is what proves the replay was chunked, not just
    // synchronously finished with one vestigial callback.
    let bursts = 0;
    while (vi.getTimerCount() > 0) {
      vi.advanceTimersToNextTimer();
      bursts++;
      if (bursts > 100) throw new Error('resume replay never settled');
    }
    expect(bursts).toBeGreaterThan(1);

    expect(root2.querySelector('#sw-resume-indicator')).toBeNull();
    expect(root2.querySelector('#sw-canvas')).not.toBeNull();
    const g2 = game2 as unknown as GameInternals;
    expect(g2.run).not.toBeNull();
    expect(g2.run!.world.tick).toBe(reference.world.tick);
    expect(g2.run!.hash()).toBe(reference.hash());
  });

  it('a malformed entry discovered only in a later chunk still falls back to the Hub instead of crashing or hanging', () => {
    const root1 = mount();
    const game1 = new Game();
    game1.start(root1);
    (root1.querySelector('#sw-start') as HTMLElement).click();
    for (let i = 0; i < 5; i++) tick64(game1);
    const persisted = persistedEntry();
    expect(persisted).not.toBeNull();
    expect(persisted!.inputLog.length).toBeGreaterThan(256);

    const raw = JSON.parse(localStorage.getItem(RUN_PERSIST_KEY)!);
    // Past index 256: only reachable from the second chunk onward.
    delete raw.inputLog[300].cmds;
    localStorage.setItem(RUN_PERSIST_KEY, JSON.stringify(raw));

    vi.useFakeTimers();
    const root2 = mount();
    const game2 = new Game();
    expect(() => game2.start(root2)).not.toThrow();
    expect(() => {
      let guard = 0;
      while (vi.getTimerCount() > 0 && guard++ < 100) vi.advanceTimersToNextTimer();
    }).not.toThrow();

    expect(root2.querySelector('#sw-resume-indicator')).toBeNull();
    expect(root2.querySelector('#sw-start')).not.toBeNull();
    expect((game2 as unknown as GameInternals).run).toBeNull();
    expect(persistedEntry()).toBeNull();
  });

  it('a run reaching a terminal outcome exactly on the final tick of a multi-chunk replay falls back to the Hub, not a resumed finished run', () => {
    const root1 = mount();
    const game1 = new Game();
    game1.start(root1);
    (root1.querySelector('#sw-start') as HTMLElement).click();
    for (let i = 0; i < 10; i++) tick64(game1); // 640 ticks: guaranteed multi-chunk
    const persisted = persistedEntry();
    expect(persisted).not.toBeNull();
    const logLength = persisted!.inputLog.length;

    // Force the outcome away from 'running' on the very last replayed step —
    // qa-playtester's suggested regression case: `Run.step()` itself is a
    // no-op once `done` is true, so this can only be observed by wrapping the
    // real implementation rather than driving the sim to a real defeat/
    // victory (slow and non-deterministic to land on an exact tick).
    const originalStep = Run.prototype.step;
    let calls = 0;
    vi.spyOn(Run.prototype, 'step').mockImplementation(function (this: Run, ...args) {
      originalStep.apply(this, args);
      calls++;
      if (calls === logLength) this.world.outcome = 'defeat_core';
    });

    vi.useFakeTimers();
    const root2 = mount();
    const game2 = new Game();
    expect(() => game2.start(root2)).not.toThrow();
    let guard = 0;
    while (vi.getTimerCount() > 0 && guard++ < 100) vi.advanceTimersToNextTimer();

    expect(root2.querySelector('#sw-resume-indicator')).toBeNull();
    expect(root2.querySelector('#sw-start')).not.toBeNull();
    expect((game2 as unknown as GameInternals).run).toBeNull();
    expect(persistedEntry()).toBeNull();
  });

  it('a log that fits within one chunk (the pre-fb088 case) still resumes synchronously with no indicator shown', () => {
    const root1 = mount();
    const game1 = new Game();
    game1.start(root1);
    (root1.querySelector('#sw-start') as HTMLElement).click();
    tick64(game1); // 64 ticks, well under the 256-tick chunk size

    const persisted = persistedEntry();
    expect(persisted!.inputLog.length).toBeLessThan(256);

    const root2 = mount();
    const game2 = new Game();
    game2.start(root2);

    expect(root2.querySelector('#sw-resume-indicator')).toBeNull();
    expect(root2.querySelector('#sw-canvas')).not.toBeNull();
    expect((game2 as unknown as GameInternals).run).not.toBeNull();
  });
});
