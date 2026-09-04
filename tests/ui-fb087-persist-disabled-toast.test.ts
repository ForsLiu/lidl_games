/**
 * @vitest-environment jsdom
 *
 * fb087: qa-playtester found fb074's persisted-run localStorage entry
 * silently stops advancing once `savePersistedRun` starts failing (quota
 * exceeded or storage unavailable) — measured to happen well within a
 * *normal* run's length (~38% into a full T1 victory run), not just an
 * "unusually long" one — with zero in-game signal to the player that resume
 * protection just lapsed for the rest of the run.
 *
 * `Game.persistRun()` (`src/ui/main.ts`) now fires a one-time `hud.say()`
 * toast the moment a write actually fails (the same branch that already sets
 * `persistDisabled = true` and logs a `console.warn`), taking acceptance
 * option (a) from the backlog item rather than bounding payload growth.
 *
 * Drives the real `Game` end to end, same idiom as
 * tests/ui-fb074-resume-on-refresh.test.ts, but forces `savePersistedRun`'s
 * underlying `localStorage.setItem` to throw for the persisted-run key —
 * cheaper and just as faithful a repro of "the write fails" as actually
 * growing an input log past the real ~5MB quota ceiling over ~49k ticks.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
  frame: (now: number) => void;
  last: number;
  persistDisabled: boolean;
}

/** Same catch-up-cap idiom as tests/ui-fb074-resume-on-refresh.test.ts: 8 frame() calls at a large wall-clock jump each cross the 60-tick persistence throttle at least once. */
function tick64(game: Game): void {
  const g = game as unknown as GameInternals;
  let now = g.last;
  for (let i = 0; i < 8; i++) {
    now += 300;
    g.frame(now);
  }
}

describe('fb087: a failed persist write shows a one-time toast instead of lapsing silently', () => {
  const originalSetItem = Storage.prototype.setItem;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    Storage.prototype.setItem = originalSetItem;
  });

  it('surfaces a toast and disables persistence the moment the run-checkpoint write fails', () => {
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === RUN_PERSIST_KEY) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return originalSetItem.call(this, key, value);
    };

    const root = mount();
    const game = new Game();
    game.start(root);
    (root.querySelector('#sw-start') as HTMLElement).click();

    const toast = root.querySelector('#sw-toast') as HTMLElement;
    expect(toast.classList.contains('show')).toBe(false);

    tick64(game);

    expect((game as unknown as GameInternals).persistDisabled).toBe(true);
    expect(toast.classList.contains('show')).toBe(true);
    expect(toast.textContent).toMatch(/resume protection/i);
    expect(toast.textContent).toMatch(/storage full/i);
  });

  it('does not toast when persistence is working normally', () => {
    const root = mount();
    const game = new Game();
    game.start(root);
    (root.querySelector('#sw-start') as HTMLElement).click();
    tick64(game);

    expect((game as unknown as GameInternals).persistDisabled).toBe(false);
    expect(localStorage.getItem(RUN_PERSIST_KEY)).not.toBeNull();
    const toast = root.querySelector('#sw-toast') as HTMLElement;
    expect(toast.classList.contains('show')).toBe(false);
  });
});
