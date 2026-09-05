/**
 * @vitest-environment jsdom
 *
 * fb083: QUALITY.md BETA's "Load to Hub < 3s cold; Hub → run < 1.5s" bar had
 * no automated coverage — unlike G17's 350-enemy frame benchmark
 * (`tests/a10-performance.test.ts`), a regression here (e.g. an accidentally
 * synchronous heavy `/data` reload, or a blocking loop added to `beginRun`)
 * could ship unnoticed.
 *
 * Drives the real `Game` end to end via `#sw-start`, same idiom as
 * `tests/ui-fb074-resume-on-refresh.test.ts` (same `mount()`/canvas-context-
 * proxy setup — `beginRun` constructs a real `Renderer` against a real
 * `<canvas>`, so `getContext` needs the same generic-proxy stub that test
 * uses). Timings are wall-clock (`performance.now()`), same host-independent-
 * margin idiom `tests/p10e-perf-budget.test.ts`'s own header documents for
 * G17: this is a synchronous jsdom environment, not a real browser paint
 * pipeline, so absolute numbers here are far below a real cold browser load —
 * measured on this session's dev host, cold-Hub was ~5-15ms and Hub→run was
 * ~1-5ms. The ceilings below are not tuned to that measurement; they're set
 * at the literal QUALITY.md budget itself (3s / 1.5s), which is already
 * enormous headroom over a synchronous in-process construction — the point of
 * this test is to catch a regression that makes either path actually slow
 * (an accidental synchronous multi-second block), not to enforce a tight
 * budget a real browser's network/parse/paint costs would need.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Game } from '../src/ui/main';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

/** Same generic-proxy 2D context stub `tests/ui-fb074-resume-on-refresh.test.ts` uses — `beginRun`'s `Renderer` needs every canvas API `draw()` touches, not just `setTransform`/`scale`. */
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
}

/** ⚖ generous, documented CI-safe budget — see file header for why the literal QUALITY.md number is used directly rather than a tighter measured-baseline multiple. */
const COLD_HUB_BUDGET_MS = 3000;
const HUB_TO_RUN_BUDGET_MS = 1500;

describe('fb083: QUALITY.md BETA load-time budgets have automated coverage', () => {
  it('a fresh Game reaches a rendered Hub in under the cold-load budget', () => {
    localStorage.clear();
    const root = mount();
    const game = new Game();

    const t0 = performance.now();
    game.start(root);
    const elapsed = performance.now() - t0;

    expect(root.querySelector('#sw-start'), 'Hub should be rendered').not.toBeNull();
    expect(elapsed, `cold start took ${elapsed.toFixed(1)}ms`).toBeLessThan(COLD_HUB_BUDGET_MS);
  });

  it('clicking Start reaches a first rendered run frame in under the Hub-to-run budget', () => {
    localStorage.clear();
    const root = mount();
    const game = new Game();
    game.start(root);
    const g = game as unknown as GameInternals;

    const t0 = performance.now();
    (root.querySelector('#sw-start') as HTMLElement).click();
    // The first post-click frame: `beginRun` (run inside the click handler)
    // already constructed the `Renderer`/`Hud`; this is the first call that
    // actually reaches `Renderer.draw()` for the new run, i.e. the first
    // rendered run frame the player would see.
    g.frame(g.last + 16);
    const elapsed = performance.now() - t0;

    expect(root.querySelector('#sw-canvas'), 'run canvas should be mounted').not.toBeNull();
    expect(elapsed, `Hub-to-run took ${elapsed.toFixed(1)}ms`).toBeLessThan(HUB_TO_RUN_BUDGET_MS);
  });
});
