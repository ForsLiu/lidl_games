/**
 * @vitest-environment jsdom
 *
 * fb060 (owner OVERRIDE of QUESTIONS Q133(3), owner feedback
 * `feature-dot-tick-numbers`): Bleeding/Poison/Toxic/Burning ticks get a
 * once-per-second, per-enemy-per-type aggregated floating number on top of
 * the existing marker dots (fb005/fb006, unchanged). `damageEnemy` (sim/
 * enemies.ts) deliberately fires no `hit:` fx for a DoT tick — a 350-strong
 * burning horde would otherwise starve `World.fx`'s 512-event buffer — so
 * `canvas.ts`'s new `updateDotNumbers` reads `e.dots` (already-exposed sim
 * state) directly instead of reacting to an event, and self-throttles once
 * more than 150 enemies are carrying a DoT at once (SPEC-FINAL §11).
 */
import { describe, expect, it } from 'vitest';

import { Renderer, type ViewState } from '../src/render/canvas';
import { GRID_H, GRID_W, TILE } from '../src/sim/grid';
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

/** Same recording-canvas convention as tests/fb006-dot-hp-indicator.test.ts, plus `fillText`. */
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

/** Extracts the pixel font size fb060's `bold ${n}px system-ui, sans-serif` writes. */
function fontSize(font: string): number {
  return Number(/(\d+)px/.exec(font)?.[1] ?? NaN);
}

describe('fb060: a bleeding enemy shows ticking numbers', () => {
  it('aggregates a typed, smaller-font number once the second accumulates', () => {
    const w = new World(cfg({ practice: true }));
    w.warden.attackCooldown = 1e9;
    // Far enough from the Warden that it can't leak/die from movement alone
    // inside the ~1s window this test ticks through (fb006's same convention).
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 10, w.warden.y)!;
    applyDot(w, e, 'bleeding', 20, 5, 'test');

    const { canvas, texts } = recordingCanvas();
    const renderer = new Renderer(canvas);
    const v = view();
    // A few ticks past one full second, so the flush lands even if the
    // 60-addition floating-point sum lands a hair under 1.0.
    for (let i = 0; i < 65; i++) {
      updateEnemies(w, 1 / 60);
      renderer.ingest(w, v);
    }
    renderer.update(0, v);
    renderer.draw(w, v);

    const bleedColor = damageStyleColor(w, 'bleeding', false);
    const bleedNum = texts.find((t) => t.color === bleedColor);
    expect(bleedNum, 'a bleeding tick number must appear').toBeDefined();
    expect(Number(bleedNum!.text)).toBeGreaterThan(0);
    // Default hit numbers render at 12px (drawNumbers, fontScale 1) — the DoT
    // number must read smaller, not just differently colored.
    expect(fontSize(bleedNum!.font), bleedNum!.font).toBeLessThan(12);
    // The enemy walks during the ~1s window, so the flush's captured position
    // trails the final one slightly — assert "at the enemy", not an exact pixel.
    expect(Math.abs(bleedNum!.x - e.x * TILE)).toBeLessThan(TILE * 2);
    expect(Math.abs(bleedNum!.y - e.y * TILE)).toBeLessThan(TILE * 2);
  });

  it('the "DoT numbers" toggle (default ON) actually gates them', () => {
    const w = new World(cfg({ practice: true }));
    w.warden.attackCooldown = 1e9;
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 10, w.warden.y)!;
    applyDot(w, e, 'poison', 20, 5, 'test');

    const { canvas, texts } = recordingCanvas();
    const renderer = new Renderer(canvas);
    const v = view({ settings: { ...defaultSettings(), dotNumbers: false } });
    for (let i = 0; i < 65; i++) {
      updateEnemies(w, 1 / 60);
      renderer.ingest(w, v);
    }
    renderer.update(0, v);
    renderer.draw(w, v);

    const poisonColor = damageStyleColor(w, 'poison', false);
    expect(texts.some((t) => t.color === poisonColor)).toBe(false);
  });

  it('defaults ON', () => {
    expect(defaultSettings().dotNumbers).toBe(true);
  });
});

describe('fb060: density cutoff above 150 DoT carriers', () => {
  it('keeps numbers for a near-character enemy and an elite, drops a lonely far one', () => {
    const w = new World(cfg({ practice: true }));
    w.warden.attackCooldown = 1e9;
    const key = w.content.enemies.enemies[0].key;
    // The corner diagonally opposite the Warden: far under any plausible
    // starting position on a 36x20 grid (worst case, dead-center start, is
    // still ~20 tiles away — comfortably past the 8-tile "near" radius).
    const farX = w.warden.x < GRID_W / 2 ? GRID_W - 2 : 1;
    const farY = w.warden.y < GRID_H / 2 ? GRID_H - 2 : 1;

    const near = spawnEnemy(w, key, w.warden.x + 1, w.warden.y)!;
    const eliteFar = spawnEnemy(w, key, farX, farY)!;
    eliteFar.elite = true;
    const lonelyFar = spawnEnemy(w, key, farX, Math.max(1, farY - 3))!;
    applyDot(w, near, 'poison', 20, 10, 'test');
    applyDot(w, eliteFar, 'poison', 20, 10, 'test');
    applyDot(w, lonelyFar, 'poison', 20, 10, 'test');

    // A swarm clustered at the same far corner pushes the carrier count past
    // the cutoff without being "near" the cursor/character themselves.
    for (let i = 0; i < 155; i++) {
      const x = Math.min(GRID_W - 2, Math.max(1, farX + ((i % 7) - 3) * 0.2));
      const y = Math.min(GRID_H - 2, Math.max(1, farY + ((Math.floor(i / 7) % 5) - 2) * 0.2));
      const s = spawnEnemy(w, key, x, y)!;
      applyDot(w, s, 'poison', 20, 10, 'test');
    }
    w.rebuildBuckets();

    const v = view({ cursorX: w.warden.x, cursorY: w.warden.y });
    const { canvas, texts } = recordingCanvas();
    const renderer = new Renderer(canvas);
    for (let i = 0; i < 65; i++) {
      updateEnemies(w, 1 / 60);
      renderer.ingest(w, v);
    }
    renderer.update(0, v);
    renderer.draw(w, v);

    const poisonColor = damageStyleColor(w, 'poison', false);
    const poisonTexts = texts.filter((t) => t.color === poisonColor);
    expect(poisonTexts.length, 'the near/elite enemies must still surface numbers').toBeGreaterThan(0);
    // 158 carriers are live; if the cutoff were not applied every one of them
    // would flush its own number in this window.
    expect(poisonTexts.length, 'the far swarm must not each get their own number').toBeLessThan(10);

    const lonelyShown = poisonTexts.some(
      (t) => Math.abs(t.x - lonelyFar.x * TILE) < 0.01 && Math.abs(t.y - lonelyFar.y * TILE) < 0.01,
    );
    expect(lonelyShown, 'a far, non-elite, non-near enemy must not get a number under the cutoff').toBe(false);
  });
});

describe('fb060 perf: a 300-enemy burning horde stays inside a frame budget', () => {
  it('ingest+update+draw for 300 DoT carriers fits well inside 16.7ms/frame with the density cutoff live', () => {
    const w = new World(cfg({ practice: true }));
    w.warden.attackCooldown = 1e9;
    const key = w.content.enemies.enemies[0].key;
    for (let i = 0; i < 300; i++) {
      const x = 1 + (i % 34);
      const y = 1 + (Math.floor(i / 34) % 18);
      const e = spawnEnemy(w, key, x, y)!;
      applyDot(w, e, 'burning', 5, 30, 'test');
    }
    w.rebuildBuckets();

    const v = view();
    const { canvas } = recordingCanvas();
    const renderer = new Renderer(canvas);
    // Warm up the JIT first, same convention as tests/a10-performance.test.ts.
    for (let i = 0; i < 30; i++) {
      updateEnemies(w, 1 / 60);
      renderer.ingest(w, v);
      renderer.update(1 / 60, v);
      renderer.draw(w, v);
    }
    const iterations = 120;
    const started = performance.now();
    for (let i = 0; i < iterations; i++) {
      updateEnemies(w, 1 / 60);
      renderer.ingest(w, v);
      renderer.update(1 / 60, v);
      renderer.draw(w, v);
    }
    const perFrame = (performance.now() - started) / iterations;
    expect(perFrame, `${perFrame.toFixed(3)} ms/frame with 300 DoT-carrying enemies`).toBeLessThan(16.7);
  });
});
