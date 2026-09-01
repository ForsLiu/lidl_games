/**
 * @vitest-environment jsdom
 *
 * fb025 (owner feedback `balance-enemies-10x-hp-slower-attacks`): the "Enemy
 * HP bars" Settings toggle (default ON) draws a small HP bar under every
 * enemy, always — not just elite/boss/large ones, and not just while
 * damaged. Off, `drawEnemies` (canvas.ts) falls back to its pre-fb025
 * behavior: elite/boss/large (radius*TILE > 8) enemies only, and only while
 * damaged or owed live DoT.
 *
 * Follows fb006-dot-hp-indicator.test.ts's recording-canvas pattern.
 */
import { describe, expect, it } from 'vitest';

import { Renderer, type ViewState } from '../src/render/canvas';
import { PALETTE } from '../src/render/theme';
import { TILE } from '../src/sim/grid';
import { World } from '../src/sim/world';
import { spawnEnemy } from '../src/sim/enemies';
import type { Enemy } from '../src/sim/types';
import { defaultSettings } from '../src/ui/settings';
import { cfg } from './helpers';

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

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  fillStyle: string;
}

function recordingCanvas(): { canvas: HTMLCanvasElement; rects: Rect[] } {
  const rects: Rect[] = [];
  let fillStyle = '';
  const ctx = new Proxy(
    {
      fillRect(x: number, y: number, w: number, h: number) {
        rects.push({ x, y, w, h, fillStyle });
      },
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      measureText: () => ({ width: 10 }),
    } as Record<string, unknown>,
    {
      get(target, prop) {
        if (prop === 'fillStyle') return fillStyle;
        if (prop in target) return target[prop as string];
        return () => undefined;
      },
      set(_target, prop, value) {
        if (prop === 'fillStyle') fillStyle = value as string;
        return true;
      },
    },
  );
  const canvas = document.createElement('canvas');
  canvas.getContext = (() => ctx) as never;
  return { canvas, rects };
}

function barGeometry(e: Enemy): { barTop: number } {
  const r = Math.max(3, e.radius * TILE);
  const py = e.y * TILE;
  return { barTop: py - r - 6 };
}

function barRects(rects: Rect[], e: Enemy): Rect[] {
  const { barTop } = barGeometry(e);
  return rects.filter((r) => r.h === 3 && Math.abs(r.y - barTop) < 0.001);
}

/** A fresh, undamaged, non-elite, non-boss, small-radius (radius*TILE <= 8) enemy. */
function smallUndamagedEnemy(w: World): Enemy {
  const e = spawnEnemy(w, 'swarm_rat', w.warden.x + 1, w.warden.y)!;
  expect(e.elite).toBe(false);
  expect(e.boss).toBe(false);
  expect(e.radius * TILE).toBeLessThanOrEqual(8);
  expect(e.hp).toBe(e.maxHp);
  return e;
}

function draw(w: World, v: ViewState): Rect[] {
  const { canvas, rects } = recordingCanvas();
  const renderer = new Renderer(canvas);
  renderer.ingest(w, v);
  renderer.update(0, v);
  renderer.draw(w, v);
  return rects;
}

describe('fb025: Enemy HP bars toggle', () => {
  it('default settings show the bar for every enemy, on', () => {
    expect(defaultSettings().showEnemyHpBars).toBe(true);
  });

  it('on: draws a bar for a small, undamaged, non-elite enemy', () => {
    const w = new World(cfg());
    const e = smallUndamagedEnemy(w);
    const rects = draw(w, view({ settings: { ...defaultSettings(), showEnemyHpBars: true } }));
    const mine = barRects(rects, e);
    const back = mine.find((r) => r.fillStyle === PALETTE.hpBack);
    const front = mine.find((r) => r.fillStyle === PALETTE.hpFront);
    expect(back).toBeDefined();
    expect(front).toBeDefined();
    // Full health: the front segment covers the whole bar.
    expect(front!.w).toBeCloseTo(back!.w, 5);
  });

  it('off: no bar for that same small, undamaged, non-elite enemy', () => {
    const w = new World(cfg());
    const e = smallUndamagedEnemy(w);
    const rects = draw(w, view({ settings: { ...defaultSettings(), showEnemyHpBars: false } }));
    expect(barRects(rects, e)).toHaveLength(0);
  });

  it('off: legacy behavior survives — a damaged elite still shows its bar', () => {
    const w = new World(cfg());
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    e.elite = true;
    e.hp = e.maxHp * 0.5;
    const rects = draw(w, view({ settings: { ...defaultSettings(), showEnemyHpBars: false } }));
    const mine = barRects(rects, e);
    expect(mine.find((r) => r.fillStyle === PALETTE.hpFront)).toBeDefined();
  });
});
