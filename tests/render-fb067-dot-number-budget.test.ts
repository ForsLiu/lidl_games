/**
 * @vitest-environment jsdom
 *
 * fb067 (found by qa-playtester during fb060 verification): `updateDotNumbers`
 * (src/render/canvas.ts) advanced a DoT type's per-second accumulator past its
 * 1-second threshold unconditionally, even on the frame where the push into
 * the shared `MAX_OTHER_NUMBERS`-capped `numbers` array was skipped because
 * the budget was already full — silently and permanently discarding that
 * second's damage number instead of retrying once the budget freed up.
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

describe('fb067: a full floating-number budget does not silently drop a DoT tick', () => {
  it('retries the flush once budget frees up instead of discarding the accumulated second', () => {
    const w = new World(cfg());
    w.warden.attackCooldown = 1e9;
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 10, w.warden.y)!;
    applyDot(w, e, 'bleeding', 20, 5, 'test');

    const { canvas, texts } = recordingCanvas();
    const renderer = new Renderer(canvas);
    const v = view();

    // Pre-fill the shared budget (MAX_OTHER_NUMBERS = 150) before the DoT
    // accumulator crosses its 1-second threshold.
    const numbers = (renderer as unknown as { numbers: { x: number; y: number; text: string; life: number; color: string; fontScale: number }[] }).numbers;
    for (let i = 0; i < 150; i++) {
      numbers.push({ x: 0, y: 0, text: 'x', life: 10, color: '#ffffff', fontScale: 1 });
    }

    for (let i = 0; i < 65; i++) {
      updateEnemies(w, 1 / 60);
      renderer.ingest(w, v);
    }
    renderer.update(0, v);
    renderer.draw(w, v);

    const bleedColor = damageStyleColor(w, 'bleeding', false);
    expect(texts.some((t) => t.color === bleedColor), 'a full budget must not flush a number this frame').toBe(false);

    // The missed second must still be pending, not silently discarded: the
    // accumulator should sit at or above the 1s threshold, ready to flush a
    // (now larger, still-correct) amount once budget frees up.
    const dotAccum = (renderer as unknown as { dotAccum: WeakMap<Enemy, Map<string, number>> }).dotAccum;
    const pending = dotAccum.get(e)?.get('bleeding');
    expect(pending, 'the missed second must still be tracked, not reset to 0').toBeDefined();
    expect(pending!).toBeGreaterThanOrEqual(1);

    // Free the budget and keep playing — the pending damage must eventually
    // surface as a real number instead of being lost forever. `update()`
    // above reassigns `this.numbers` to a filtered array, so re-read the
    // live reference rather than clearing the stale one captured earlier.
    (renderer as unknown as { numbers: unknown[] }).numbers.length = 0;
    for (let i = 0; i < 65; i++) {
      updateEnemies(w, 1 / 60);
      renderer.ingest(w, v);
    }
    renderer.update(0, v);
    renderer.draw(w, v);

    const bleedNum = texts.find((t) => t.color === bleedColor);
    expect(bleedNum, 'the pending damage must flush once budget is available again').toBeDefined();
    expect(Number(bleedNum!.text)).toBeGreaterThan(0);
  });
});
