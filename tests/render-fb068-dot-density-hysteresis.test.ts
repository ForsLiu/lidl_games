/**
 * @vitest-environment jsdom
 *
 * fb068 (found by qa-playtester during fb060 verification): under the
 * density cutoff, `updateDotNumbers` (src/render/canvas.ts) used to test a
 * single fixed 8-tile "near" radius every frame and hard-reset `dotAccum`
 * for any enemy that read as outside it. An enemy whose distance from the
 * cursor/Warden oscillates right around that boundary (e.g. drifting between
 * 7.9 and 8.1 tiles) could go indefinitely without ever accumulating a full
 * second, because each "outside" frame wiped its progress. Fixed with
 * hysteresis: an enemy already flagged "near" keeps that status until it
 * drifts past a wider exit radius, so a boundary-hugging enemy still
 * eventually flushes a number.
 */
import { describe, expect, it } from 'vitest';

import { Renderer, type ViewState } from '../src/render/canvas';
import { GRID_H, GRID_W } from '../src/sim/grid';
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

describe('fb068: a boundary-hugging enemy under the density cutoff still surfaces a number', () => {
  it('does not reset the accumulator every tick it drifts just past the near radius', () => {
    const w = new World(cfg());
    w.warden.attackCooldown = 1e9;
    const key = w.content.enemies.enemies[0].key;
    const farX = w.warden.x < GRID_W / 2 ? GRID_W - 2 : 1;
    const farY = w.warden.y < GRID_H / 2 ? GRID_H - 2 : 1;

    // The oscillating enemy: alternates each tick between 7.9 and 8.1 tiles
    // from the Warden, straddling the old fixed 8-tile near radius exactly.
    const boundary = spawnEnemy(w, key, w.warden.x + 7.9, w.warden.y)!;
    applyDot(w, boundary, 'poison', 20, 60, 'test');

    // A swarm clustered far away pushes the carrier count past the density
    // cutoff, same convention as tests/render-fb060-dot-tick-numbers.test.ts.
    for (let i = 0; i < 155; i++) {
      const x = Math.min(GRID_W - 2, Math.max(1, farX + ((i % 7) - 3) * 0.2));
      const y = Math.min(GRID_H - 2, Math.max(1, farY + ((Math.floor(i / 7) % 5) - 2) * 0.2));
      const s = spawnEnemy(w, key, x, y)!;
      applyDot(w, s, 'poison', 20, 60, 'test');
    }
    w.rebuildBuckets();

    const v = view({ cursorX: w.warden.x, cursorY: w.warden.y });
    const { canvas, texts } = recordingCanvas();
    const renderer = new Renderer(canvas);
    for (let i = 0; i < 400; i++) {
      boundary.x = w.warden.x + (i % 2 === 0 ? 7.9 : 8.1);
      updateEnemies(w, 1 / 60);
      renderer.ingest(w, v);
    }
    renderer.update(0, v);
    renderer.draw(w, v);

    // The far swarm never surfaces numbers (outside both radii, non-elite),
    // so any poison number at all can only have come from the boundary-
    // hugging enemy.
    const poisonColor = damageStyleColor(w, 'poison', false);
    const boundaryShown = texts.some((t) => t.color === poisonColor);
    expect(boundaryShown, 'the boundary-hugging enemy must eventually flush a number').toBe(true);
  });
});
