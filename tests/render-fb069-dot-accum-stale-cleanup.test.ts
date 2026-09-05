/**
 * @vitest-environment jsdom
 *
 * fb069 (found by qa-playtester during fb067 verification): `updateDotNumbers`
 * (src/render/canvas.ts) skips the per-type `dps <= 0` cleanup for an enemy
 * whose `dots` array has already dropped to empty, because the enemy-level
 * fast path (`if (e.dead || e.dots.length === 0) continue;`) runs first and
 * `continue`s before that cleanup is ever reached. If fb067's budget-full
 * retry had left the type's accumulator sitting above 1 (several pending
 * seconds) at the moment the stack expired, that stale value survives
 * indefinitely in `dotAccum`. Re-afflicting the same enemy with the same DoT
 * type later reads and flushes the stale leftover mixed with the new
 * application's first tick, producing an inflated, incorrect number.
 */
import { describe, expect, it } from 'vitest';

import { Renderer, type ViewState } from '../src/render/canvas';
import { World } from '../src/sim/world';
import { applyDot, spawnEnemy, updateEnemies } from '../src/sim/enemies';
import type { Enemy } from '../src/sim/types';
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

/** Same recording-canvas convention as tests/render-fb060-dot-tick-numbers.test.ts. */
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

describe('fb069: a DoT stack expiring mid-starvation must not leave a stale accumulator', () => {
  it('does not mix stale pending seconds into a later re-application', () => {
    const w = new World(cfg());
    w.warden.attackCooldown = 1e9;
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 10, w.warden.y)!;
    applyDot(w, e, 'bleeding', 20, 3.5, 'test');

    const { canvas, texts } = recordingCanvas();
    const renderer = new Renderer(canvas);
    const v = view();

    // Saturate the shared floating-number budget for the entire lifetime of
    // the stack, so every threshold crossing during it is starved (fb067's
    // retry-instead-of-drop path keeps the accumulator climbing rather than
    // resetting it). No renderer.update() call in the loop below, so nothing
    // prunes these entries and the budget stays full throughout.
    const numbers = (renderer as unknown as { numbers: { x: number; y: number; text: string; life: number; color: string; fontScale: number }[] }).numbers;
    for (let i = 0; i < 150; i++) {
      numbers.push({ x: 0, y: 0, text: 'x', life: 10, color: '#ffffff', fontScale: 1 });
    }

    // 3.5s of dot duration plus margin, at 60Hz.
    for (let i = 0; i < 250; i++) {
      updateEnemies(w, 1 / 60);
      renderer.ingest(w, v);
    }

    expect(e.dots.length, 'the bleeding stack must have fully expired by now').toBe(0);

    const dotAccum = (renderer as unknown as { dotAccum: WeakMap<Enemy, Map<string, number>> }).dotAccum;
    const staleAfterExpiry = dotAccum.get(e)?.get('bleeding');
    expect(staleAfterExpiry ?? 0, 'no stale pending seconds should survive the stack fully expiring').toBeLessThan(1);

    // Free the budget and re-afflict the same enemy with a fresh stack.
    (renderer as unknown as { numbers: unknown[] }).numbers.length = 0;
    applyDot(w, e, 'bleeding', 20, 5, 'test');

    updateEnemies(w, 1 / 60);
    renderer.ingest(w, v);
    renderer.update(0, v);
    renderer.draw(w, v);

    const bleedColor = damageStyleColor(w, 'bleeding', false);
    const bleedNum = texts.find((t) => t.color === bleedColor);
    expect(bleedNum, 'one real tick of a fresh stack must not immediately cross the 1s threshold').toBeUndefined();
  });
});
