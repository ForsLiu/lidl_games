/**
 * @vitest-environment jsdom
 *
 * fb010 (SPEC-FINAL §11, owner feedback `feature-game-speed-x10-x50`): extending
 * the fast-forward speeds to 1/2/3/10/50x raised the worst-case catch-up frame
 * from `MAX_CATCHUP_TICKS * 3` = 24 sim ticks to `MAX_CATCHUP_TICKS * 50` = 400
 * (see ui/pacer.ts). `main.ts`'s frame loop calls `Renderer.ingest()` once per
 * tick but only prunes the presentation-fx arrays once per rendered frame, in
 * `update()`, which runs after the whole tick batch. Before this test, several
 * of those arrays (tracers, cones, telegraphs, casts, and the non-`hit:`
 * floating numbers) had no cap at all, so a busy fight during a real stall at
 * 50x could push hundreds of extra shapes into a single `draw()` call — QA
 * found this while verifying fb010. This pins the caps added in canvas.ts.
 */
import { describe, expect, it } from 'vitest';

import { World } from '../src/sim/world';
import { Renderer, type ViewState } from '../src/render/canvas';
import { defaultSettings } from '../src/ui/settings';
import { MAX_CATCHUP_TICKS } from '../src/ui/pacer';
import { cfg } from './helpers';

function noopCanvas(): HTMLCanvasElement {
  const ctx = new Proxy(
    { createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) },
    { get: (target, prop) => (prop in target ? (target as never)[prop] : () => undefined) },
  );
  const canvas = document.createElement('canvas');
  canvas.getContext = (() => ctx) as never;
  return canvas;
}

function view(): ViewState {
  return {
    selectedTower: 0,
    cursorX: 0,
    cursorY: 0,
    shake: 0,
    showRanges: false,
    selection: null,
    settings: defaultSettings(),
  };
}

describe('fb010: presentation-fx arrays stay bounded across a large catch-up batch', () => {
  // The worst real batch a 50x catch-up frame can produce (main.ts calls
  // ingest() once per tick, with no prune in between).
  const WORST_CASE_TICKS = MAX_CATCHUP_TICKS * 50;

  it('caps tracers, cones, telegraphs and casts well under one push per tick', () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    const renderer = new Renderer(noopCanvas());
    for (let i = 0; i < WORST_CASE_TICKS; i++) {
      w.fx = [
        { k: 'shot', x: 1, y: 1, a: 2, b: 2 },
        { k: 'cone', x: 1, y: 1, a: 1, b: 0 },
        { k: 'bosstelegraph', x: 1, y: 1, a: 1, b: 0 },
        { k: 'class_active', x: 5, y: 6, a: 2.5, b: 0 },
      ];
      renderer.ingest(w, view());
    }
    const r = renderer as unknown as {
      tracers: unknown[];
      cones: unknown[];
      telegraphs: unknown[];
      casts: unknown[];
    };
    // Each array would sit at WORST_CASE_TICKS (400) with no cap; every real
    // cap below is well under that, proving the guard actually engaged.
    expect(r.tracers.length).toBeGreaterThan(0);
    expect(r.tracers.length).toBeLessThan(WORST_CASE_TICKS);
    expect(r.cones.length).toBeGreaterThan(0);
    expect(r.cones.length).toBeLessThan(WORST_CASE_TICKS);
    expect(r.telegraphs.length).toBeGreaterThan(0);
    expect(r.telegraphs.length).toBeLessThan(WORST_CASE_TICKS);
    expect(r.casts.length).toBeGreaterThan(0);
    expect(r.casts.length).toBeLessThan(WORST_CASE_TICKS);
  });

  it('caps the non-hit floating numbers (wardenhit/execute/levelup) the same way', () => {
    const w = new World(cfg());
    const renderer = new Renderer(noopCanvas());
    for (let i = 0; i < WORST_CASE_TICKS; i++) {
      w.fx = [{ k: 'levelup', x: 1, y: 1, a: 0, b: 0 }];
      renderer.ingest(w, view());
    }
    const r = renderer as unknown as { numbers: unknown[] };
    expect(r.numbers.length).toBeGreaterThan(0);
    expect(r.numbers.length).toBeLessThan(WORST_CASE_TICKS);
  });
});
