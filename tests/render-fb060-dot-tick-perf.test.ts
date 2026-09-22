/**
 * @vitest-environment jsdom
 *
 * The frame-budget half of tests/render-fb060-dot-tick-numbers.test.ts, split
 * out 2026-09-22 into the perf tier (vitest.perf.config.ts, single-threaded):
 * "ingest+update+draw fits inside 16.7 ms/frame" is a wall-clock bound, and it
 * went red in a fast-tier run sharing a 4-core host with two other suites
 * (load average ~13) on a tree that does not touch the renderer's DoT path.
 * The bound is unchanged; only where it is measured moved.
 *
 * Original header (fb060 (owner OVERRIDE of QUESTIONS Q133(3), owner feedback
 * `feature-dot-tick-numbers`): Bleeding/Poison/Toxic/Burning ticks get a
 * once-per-second, per-enemy-per-type aggregated floating number on top of
 * the existing marker dots (fb005/fb006, unchanged). `damageEnemy` (sim/
 * enemies.ts) deliberately fires no `hit:` fx for a DoT tick — a 350-strong
 * burning horde would otherwise starve `World.fx`'s 512-event buffer — so
 * `canvas.ts`'s new `updateDotNumbers` reads `e.dots` (already-exposed sim
 * state) directly instead of reacting to an event, and self-throttles once
 * more than 150 enemies are carrying a DoT at once (SPEC-FINAL §11).)
 */
import { describe, expect, it } from 'vitest';

import { Renderer, type ViewState } from '../src/render/canvas';
import { World } from '../src/sim/world';
import { applyDot, spawnEnemy, updateEnemies } from '../src/sim/enemies';
import { defaultSettings } from '../src/ui/settings';
import { cfg } from './helpers';

interface Text {
  x: number;
  y: number;
  text: string;
  color: string;
  font: string;
}

/** `data/enemies.json` is never empty, so index 0 always exists. */
function firstEnemyKey(w: World): string {
  const def = w.content.enemies.enemies[0];
  if (def === undefined) throw new Error('unreachable — data/enemies.json is never empty');
  return def.key;
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


describe('fb060 perf: a 300-enemy burning horde stays inside a frame budget', () => {
  it('ingest+update+draw for 300 DoT carriers fits well inside 16.7ms/frame with the density cutoff live', () => {
    const w = new World(cfg({ practice: true }));
    w.warden.attackCooldown = 1e9;
    const key = firstEnemyKey(w);
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
