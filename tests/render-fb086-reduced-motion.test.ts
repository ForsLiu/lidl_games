/**
 * @vitest-environment jsdom
 *
 * fb086 (QUALITY.md 1.0 accessibility re-check: "reduced-motion mode",
 * distinct from `reducedFlash`/`shake`): a new `reducedMotion` Settings
 * toggle suppresses ambient-motion cues neither of those two settings
 * touches — a jagged tracer's kinked-segment jitter (`drawTracers`, chain
 * lightning / tesla coil / Time Lord's distortion trail) and the TD<->VS
 * phase-sweep band's horizontal travel across the board (`drawPhaseSweep`).
 * Default off, opt-in, matching `reducedFlash`'s own convention.
 */
import { describe, expect, it } from 'vitest';

import { Renderer, type ViewState } from '../src/render/canvas';
import { World } from '../src/sim/world';
import { defaultSettings } from '../src/ui/settings';
import { cfg } from './helpers';

/** Same recording proxy idiom as tests/render-fb055-basic-attack-vfx.test.ts's `recordingCanvas`. */
function recordingCanvas(): {
  canvas: HTMLCanvasElement;
  lines: { x: number; y: number }[];
  fills: { x: number; y: number; style: unknown }[];
} {
  const lines: { x: number; y: number }[] = [];
  const fills: { x: number; y: number; style: unknown }[] = [];
  const state = { globalAlpha: 1, strokeStyle: '', fillStyle: '' as unknown };
  const ctx = new Proxy(
    {
      moveTo(x: number, y: number) {
        lines.push({ x, y });
      },
      lineTo(x: number, y: number) {
        lines.push({ x, y });
      },
      fillRect(x: number, y: number) {
        fills.push({ x, y, style: state.fillStyle });
      },
      ellipse() {},
      createLinearGradient: () => ({ __gradient: true, addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      measureText: () => ({ width: 10 }),
    } as Record<string, unknown>,
    {
      get(target, prop) {
        if (prop === 'globalAlpha') return state.globalAlpha;
        if (prop === 'strokeStyle') return state.strokeStyle;
        if (prop === 'fillStyle') return state.fillStyle;
        if (prop in target) return target[prop as string];
        return () => undefined;
      },
      set(_target, prop, value) {
        if (prop === 'globalAlpha') state.globalAlpha = value as number;
        if (prop === 'strokeStyle') state.strokeStyle = value as string;
        if (prop === 'fillStyle') state.fillStyle = value;
        return true;
      },
    },
  );
  const canvas = document.createElement('canvas');
  canvas.getContext = (() => ctx) as never;
  return { canvas, lines, fills };
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

describe('fb086: reducedMotion setting defaults', () => {
  it('defaults off (opt-in), matching reducedFlash', () => {
    expect(defaultSettings().reducedMotion).toBe(false);
  });
});

describe('fb086: reducedMotion suppresses jagged-tracer jitter', () => {
  it('Time Lord basic attack draws a straight second tracer instead of a kinked one when reducedMotion is on', () => {
    const w = new World(cfg({ classKey: 'time_lord' }));
    const normal = recordingCanvas();
    const calm = recordingCanvas();
    const r1 = new Renderer(normal.canvas);
    const r2 = new Renderer(calm.canvas);
    w.fx.push({ k: 'class_basic', x: 5, y: 6, a: 9, b: 6 });
    r1.ingest(w, view());
    r1.draw(w, view());
    r2.ingest(w, view({ settings: { ...defaultSettings(), reducedMotion: true } }));
    r2.draw(w, view({ settings: { ...defaultSettings(), reducedMotion: true } }));
    // Two tracers fire (the plain travel line plus the distortion trail). Normally
    // the jagged one contributes 3 lineTo points (kinked segments) vs 1 for a
    // straight line, so total recorded points differ; under reducedMotion both
    // tracers draw straight, so the two renders converge on the same point count.
    expect(normal.lines.length).toBeGreaterThan(calm.lines.length);
  });

  it('a normal (non-time-lord) straight tracer is unaffected by reducedMotion', () => {
    const w = new World(cfg({ classKey: 'swordsman' }));
    const normal = recordingCanvas();
    const calm = recordingCanvas();
    const r1 = new Renderer(normal.canvas);
    const r2 = new Renderer(calm.canvas);
    w.fx.push({ k: 'shot', x: 5, y: 6, a: 9, b: 6 });
    r1.ingest(w, view());
    r1.draw(w, view());
    r2.ingest(w, view({ settings: { ...defaultSettings(), reducedMotion: true } }));
    r2.draw(w, view({ settings: { ...defaultSettings(), reducedMotion: true } }));
    expect(normal.lines.length).toBe(calm.lines.length);
  });
});

describe('fb086: reducedMotion suppresses the TD<->VS phase-sweep band travel', () => {
  it('drops the traveling gradient wipe in favor of a stationary flat fade, but still fades', () => {
    const w = new World(cfg({}));
    const normal = recordingCanvas();
    const calm = recordingCanvas();
    const r1 = new Renderer(normal.canvas);
    const r2 = new Renderer(calm.canvas);
    w.fx.push({ k: 'sweep_to_vs', x: 0, y: 0, a: 0, b: 0 });
    const v1 = view();
    r1.ingest(w, v1);
    r1.update(1, v1); // advance to the sweep's opacity peak (SWEEP_DURATION / 2)
    r1.draw(w, v1);
    const v2 = view({ settings: { ...defaultSettings(), reducedMotion: true } });
    r2.ingest(w, v2);
    r2.update(1, v2);
    r2.draw(w, v2);
    // Both the background fill and the sweep's own overpaint use the same
    // (-20, -20, width+40, height+40) rect, so filter to that footprint.
    const overpaint = (fills: typeof normal.fills) => fills.filter((f) => f.x === -20 && f.y === -20);
    const normalOverpaint = overpaint(normal.fills);
    const calmOverpaint = overpaint(calm.fills);
    expect(normalOverpaint.length).toBeGreaterThan(0);
    expect(calmOverpaint.length).toBeGreaterThan(0);
    // Normal: the sweep sets fillStyle to a CanvasGradient (traveling wipe).
    expect(normalOverpaint.some((f) => typeof f.style === 'object')).toBe(true);
    // reducedMotion: the sweep sets fillStyle to the same plain color string
    // shape the background fill itself uses — no gradient, no travel.
    expect(calmOverpaint.some((f) => typeof f.style === 'object')).toBe(false);
  });
});
