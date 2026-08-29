/**
 * @vitest-environment jsdom
 *
 * fb006 (owner feedback `feature-dot-hp-indicator`): enemy HP bars show a
 * shaded/hatched segment sized to the unfinished DoT total (`dotOutstanding`,
 * enemies.ts), shrinking per tick as the DoT resolves into real hp loss.
 *
 * Follows fb005-damage-colors.test.ts's recording-canvas pattern: a Proxy
 * captures every `fillRect` call with the `fillStyle` active at the time,
 * so the test asserts against the real drawn rectangle rather than a
 * screenshot. `PALETTE.hpBack`/`hpFront` are also used for the Core and
 * structure bars elsewhere in the same frame, so bars are picked out by the
 * enemy's own bar `y` (`py - r - 6`), not just by fillStyle.
 */
import { describe, expect, it } from 'vitest';

import { Renderer, type ViewState } from '../src/render/canvas';
import { PALETTE } from '../src/render/theme';
import { TILE } from '../src/sim/grid';
import { World } from '../src/sim/world';
import { applyDot, damageEnemy, dotOutstanding, spawnEnemy, updateEnemies } from '../src/sim/enemies';
import type { Enemy } from '../src/sim/types';
import { defaultSettings } from '../src/ui/settings';
import { cfg } from './helpers';

function worldWith(over = {}): World {
  const w = new World(cfg({ classKey: 'plaguebringer', ...over }));
  w.gold = 1e6;
  w.warden.attackCooldown = 1e9; // p6c's convention: no basic-attack contamination
  return w;
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

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  fillStyle: string;
}

/** Records every `fillRect` call along with the `fillStyle` active at the time. */
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

/** The exact geometry `drawEnemies` computes for one enemy's HP bar. */
function barGeometry(e: Enemy): { barLeft: number; barTop: number; barWidth: number } {
  const r = Math.max(3, e.radius * TILE);
  const px = e.x * TILE;
  const py = e.y * TILE;
  return { barLeft: px - r, barTop: py - r - 6, barWidth: r * 2 };
}

/** Only the fillRect calls at this enemy's own HP bar row (h === 3, y === barTop). */
function barRects(rects: Rect[], e: Enemy): Rect[] {
  const { barTop } = barGeometry(e);
  return rects.filter((r) => r.h === 3 && Math.abs(r.y - barTop) < 0.001);
}

describe('fb006: unfinished-DoT HP bar segment', () => {
  it('applying poison shows a hpDot segment sized to dotOutstanding / maxHp', () => {
    const w = new World(cfg());
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    e.elite = true; // force the HP bar to draw regardless of radius/damage
    damageEnemy(w, e, e.maxHp * 0.5, 'test', { pure: true });
    applyDot(w, e, 'poison', 4, 3, 'test');

    const { canvas, rects } = recordingCanvas();
    const renderer = new Renderer(canvas);
    const v = view();
    renderer.ingest(w, v);
    renderer.update(0, v);
    renderer.draw(w, v);

    const mine = barRects(rects, e);
    const back = mine.find((r) => r.fillStyle === PALETTE.hpBack)!;
    const front = mine.find((r) => r.fillStyle === PALETTE.hpFront)!;
    const dot = mine.find((r) => r.fillStyle === PALETTE.hpDot);
    expect(back).toBeDefined();
    expect(front).toBeDefined();
    expect(dot).toBeDefined();

    const { barWidth } = barGeometry(e);
    expect(back.w).toBeCloseTo(barWidth, 5);
    const outstanding = dotOutstanding(e);
    expect(outstanding).toBeGreaterThan(0);
    const expectedFrac = Math.min(e.hp / e.maxHp, outstanding / e.maxHp);
    expect(dot!.w).toBeCloseTo(barWidth * expectedFrac, 5);
    // The segment sits flush against the live front edge (doomed hp reads as
    // "about to be consumed", not floating in the middle of the bar).
    expect(dot!.x + dot!.w).toBeCloseTo(front.x + front.w, 5);
  });

  it('shows the bar and segment for a full-hp enemy hit only by a DoT (no direct damage yet)', () => {
    const w = new World(cfg());
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    e.elite = true;
    expect(e.hp).toBe(e.maxHp); // no direct hit — the poison field ticks before any hp loss
    applyDot(w, e, 'poison', 4, 3, 'test');

    const { canvas, rects } = recordingCanvas();
    const renderer = new Renderer(canvas);
    const v = view();
    renderer.ingest(w, v);
    renderer.update(0, v);
    renderer.draw(w, v);

    const mine = barRects(rects, e);
    const back = mine.find((r) => r.fillStyle === PALETTE.hpBack)!;
    const front = mine.find((r) => r.fillStyle === PALETTE.hpFront)!;
    const dot = mine.find((r) => r.fillStyle === PALETTE.hpDot);
    expect(back).toBeDefined();
    expect(front).toBeDefined();
    expect(dot).toBeDefined();

    const { barWidth } = barGeometry(e);
    const outstanding = dotOutstanding(e);
    expect(outstanding).toBeGreaterThan(0);
    const expectedFrac = Math.min(e.hp / e.maxHp, outstanding / e.maxHp);
    expect(dot!.w).toBeCloseTo(barWidth * expectedFrac, 5);
  });

  it('the segment shrinks tick by tick as the DoT resolves', () => {
    const w = new World(cfg());
    // Far from the Warden so a second of ticking can't let it leak/die before
    // the assertions below run — only the DoT's own decay matters here.
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 10, w.warden.y)!;
    e.elite = true;
    applyDot(w, e, 'poison', 4, 3, 'test');
    const before = dotOutstanding(e);

    for (let i = 0; i < 60; i++) updateEnemies(w, 1 / 60);
    const after = dotOutstanding(e);
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);

    const { canvas, rects } = recordingCanvas();
    const renderer = new Renderer(canvas);
    const v = view();
    renderer.ingest(w, v);
    renderer.update(0, v);
    renderer.draw(w, v);

    const mine = barRects(rects, e);
    const dot = mine.find((r) => r.fillStyle === PALETTE.hpDot);
    const { barWidth } = barGeometry(e);
    const expectedFrac = Math.min(e.hp / e.maxHp, after / e.maxHp);
    expect(dot).toBeDefined();
    expect(dot!.w).toBeCloseTo(barWidth * expectedFrac, 5);
    expect(dot!.w).toBeLessThan(barWidth * Math.min(e.hp / e.maxHp, before / e.maxHp));
  });

  it('no segment when there is no live DoT', () => {
    const w = new World(cfg());
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    e.elite = true;
    damageEnemy(w, e, e.maxHp * 0.3, 'test', { pure: true });

    const { canvas, rects } = recordingCanvas();
    const renderer = new Renderer(canvas);
    const v = view();
    renderer.ingest(w, v);
    renderer.update(0, v);
    renderer.draw(w, v);

    const mine = barRects(rects, e);
    expect(mine.some((r) => r.fillStyle === PALETTE.hpDot)).toBe(false);
  });

  it('caps the segment at the live front when outstanding damage exceeds current hp', () => {
    const w = new World(cfg());
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    e.elite = true;
    damageEnemy(w, e, e.maxHp * 0.9, 'test', { pure: true }); // 10% hp left
    // A lot more unfinished damage than remains — the enemy is doomed to die
    // from DoT alone before it resolves.
    applyDot(w, e, 'poison', e.maxHp, 5, 'test');

    const { canvas, rects } = recordingCanvas();
    const renderer = new Renderer(canvas);
    const v = view();
    renderer.ingest(w, v);
    renderer.update(0, v);
    renderer.draw(w, v);

    const mine = barRects(rects, e);
    const front = mine.find((r) => r.fillStyle === PALETTE.hpFront)!;
    const dot = mine.find((r) => r.fillStyle === PALETTE.hpDot)!;
    expect(dot.w).toBeCloseTo(front.w, 5);
  });

  it('Spreading Plague transfer (p6c): the target takes flat damage, not a new DoT, so no hpDot segment appears for it', () => {
    const w = worldWith();
    const dying = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 1, w.warden.y)!;
    // Offset in y so the two enemies' HP bars don't land on the same row —
    // barRects/barGeometry key off `py - r - 6`, and same key/elite/x-ish
    // enemies at the same y would otherwise share that row.
    const nearest = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 2, w.warden.y + 3)!;
    dying.elite = true;
    nearest.elite = true;
    nearest.hp = 1e6;
    nearest.maxHp = 1e6;
    w.rebuildBuckets();
    applyDot(w, dying, 'poison', 10, 3, 'test'); // 30 unfinished damage, transferred on death
    const owed = dotOutstanding(dying);
    expect(owed).toBeGreaterThan(0);

    damageEnemy(w, dying, 1e9, 'test', { pure: true, dot: true }); // kills dying, fires the transfer
    expect(dying.dead).toBe(true);
    expect(nearest.hp).toBeCloseTo(1e6 - owed, 5);
    expect(dotOutstanding(nearest)).toBe(0);

    const { canvas, rects } = recordingCanvas();
    const renderer = new Renderer(canvas);
    const v = view();
    renderer.ingest(w, v);
    renderer.update(0, v);
    renderer.draw(w, v);

    // The dead enemy is gone from the frame entirely — no stale bar left behind.
    expect(rects.some((r) => Math.abs(r.y - barGeometry(dying).barTop) < 0.001)).toBe(false);
    // The transfer's target took the total as ordinary hp loss, not a live DoT,
    // so its own bar has a front sized to its remaining hp but no hpDot segment.
    const mine = barRects(rects, nearest);
    const front = mine.find((r) => r.fillStyle === PALETTE.hpFront)!;
    const { barWidth } = barGeometry(nearest);
    expect(front.w).toBeCloseTo(barWidth * (nearest.hp / nearest.maxHp), 5);
    expect(mine.some((r) => r.fillStyle === PALETTE.hpDot)).toBe(false);
  });
});
