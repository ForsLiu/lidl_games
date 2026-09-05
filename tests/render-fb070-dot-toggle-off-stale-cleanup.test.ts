/**
 * @vitest-environment jsdom
 *
 * fb070 (found by qa-playtester during fb069 verification): fb069 fixed
 * `updateDotNumbers` (src/render/canvas.ts) leaving a stale, possibly
 * inflated per-type `dotAccum` entry behind when a DoT stack fully expires,
 * by clearing that enemy's entry on the `e.dots.length === 0` fast path. But
 * the whole function used to early-return when `view.settings.dotNumbers`
 * was off, so that cleanup never ran while the toggle was off — a stack that
 * saturates the shared floating-number budget, expires, and gets
 * re-afflicted entirely during an off period still leaves stale carryover
 * that flushes mixed into the new stack's first tick once the toggle is
 * switched back on.
 */
import { describe, expect, it } from 'vitest';

import { Renderer, type ViewState } from '../src/render/canvas';
import { World } from '../src/sim/world';
import { applyDot, spawnEnemy, updateEnemies } from '../src/sim/enemies';
import { damageStyleColor } from '../src/sim/damagetypes';
import { defaultSettings } from '../src/ui/settings';
import { cfg } from './helpers';

interface Text {
  x: number;
  y: number;
  text: string;
  color: string;
  font: string;
}

/** Same recording-canvas convention as tests/render-fb069-dot-accum-stale-cleanup.test.ts. */
function recordingCanvas(): { canvas: HTMLCanvasElement; texts: Text[] } {
  const texts: Text[] = [];
  const state = { fillStyle: '', font: '' };
  const ctx = new Proxy(
    {
      fillText(text: string, x: number, y: number) {
        texts.push({ x, y, text, color: state.fillStyle, font: state.font });
      },
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      measureText: () => ({ width: 10 }),
    } as Record<string, unknown>,
    {
      get(target, prop) {
        if (prop === 'fillStyle') return state.fillStyle;
        if (prop === 'font') return state.font;
        if (prop in target) return target[prop as string];
        return () => undefined;
      },
      set(_target, prop, value) {
        if (prop === 'fillStyle') state.fillStyle = value as string;
        if (prop === 'font') state.font = value as string;
        return true;
      },
    },
  );
  const canvas = document.createElement('canvas');
  canvas.getContext = (() => ctx) as never;
  return { canvas, texts };
}

function view(over: Partial<ViewState> = {}): ViewState {
  return {
    selectedTower: 0,
    cursorX: 0,
    cursorY: 0,
    shake: 0,
    showRanges: false,
    selection: null,
    settings: defaultSettings(),
    ...over,
  };
}

describe('fb070: the dotNumbers toggle being off must not block stale-accumulator cleanup', () => {
  it('does not mix stale pending seconds into a later re-application across an off/on flip', () => {
    const w = new World(cfg());
    w.warden.attackCooldown = 1e9;
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 10, w.warden.y)!;
    // Frozen in place: the >4s this test ticks through is otherwise enough
    // for a default-speed enemy to walk onto the core tile and leak (marking
    // it dead, which would trivially — and irrelevantly — clear `dotAccum`
    // via the `e.dead` branch regardless of this item's fix).
    e.speed = 0;
    applyDot(w, e, 'bleeding', 20, 3.5, 'test');

    const { canvas, texts } = recordingCanvas();
    const renderer = new Renderer(canvas);
    const vOn = view();
    const vOff = view({ settings: { ...defaultSettings(), dotNumbers: false } });

    // Saturate the shared floating-number budget while the toggle is still
    // on, so every threshold crossing over the next couple of seconds is
    // starved and leaves an inflated, multi-second pending accumulator
    // (fb067's retry-instead-of-drop path), same setup as
    // tests/render-fb069-dot-accum-stale-cleanup.test.ts.
    const numbers = (renderer as unknown as { numbers: { x: number; y: number; text: string; life: number; color: string; fontScale: number }[] }).numbers;
    for (let i = 0; i < 150; i++) {
      numbers.push({ x: 0, y: 0, text: 'x', life: 10, color: '#ffffff', fontScale: 1 });
    }
    // 2.5s of the 3.5s stack's lifetime, still budget-starved throughout.
    for (let i = 0; i < 150; i++) {
      updateEnemies(w, 1 / 60);
      renderer.ingest(w, vOn);
    }

    // Now flip the toggle off (budget still full) and let the stack finish
    // expiring, and a fresh stack get re-applied, entirely while the setting
    // is off — this is where the pre-fb070 early return skipped the
    // fb069 expiry cleanup.
    for (let i = 0; i < 100; i++) {
      updateEnemies(w, 1 / 60);
      renderer.ingest(w, vOff);
    }
    expect(e.dots.length, 'the bleeding stack must have fully expired by now').toBe(0);
    (renderer as unknown as { numbers: unknown[] }).numbers.length = 0;
    applyDot(w, e, 'bleeding', 20, 5, 'test');
    updateEnemies(w, 1 / 60);
    renderer.ingest(w, vOff);

    // Flip the toggle back on and tick once.
    updateEnemies(w, 1 / 60);
    renderer.ingest(w, vOn);
    renderer.update(0, vOn);
    renderer.draw(w, vOn);

    const bleedColor = damageStyleColor(w, 'bleeding', false);
    const bleedNum = texts.find((t) => t.color === bleedColor);
    expect(bleedNum, 'one real tick right after re-enabling must not immediately cross the 1s threshold').toBeUndefined();
  });
});
