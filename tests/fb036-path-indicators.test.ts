/**
 * @vitest-environment jsdom
 *
 * fb036: TD path indicators from every spawn gate. `Renderer.drawPathIndicators`
 * draws the exact tile chain `Grid.gatePath` (grid.ts) walks off the live
 * `ground` field — one dashed color per gate (`GATE_PATH_COLORS`), switching
 * to `PALETTE.pathBreach` for whichever span currently breaches a structure.
 * Gated on `!night` (TD only) and the `showPathIndicators` setting.
 *
 * Follows fb025-enemy-hp-bars.test.ts's recording-canvas pattern, recording
 * stroke-path segments instead of fillRects.
 */
import { describe, expect, it } from 'vitest';

import { Renderer, type ViewState } from '../src/render/canvas';
import { GATE_PATH_COLORS, PALETTE } from '../src/render/theme';
import { GATES, GRID_H } from '../src/sim/grid';
import { World } from '../src/sim/world';
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

interface Segment {
  strokeStyle: string;
}

function recordingCanvas(): { canvas: HTMLCanvasElement; segments: Segment[] } {
  const segments: Segment[] = [];
  let strokeStyle = '';
  let pendingStroke = false;
  const ctx = new Proxy(
    {
      beginPath() {},
      moveTo() {
        pendingStroke = true;
      },
      lineTo() {},
      stroke() {
        if (pendingStroke) segments.push({ strokeStyle });
        pendingStroke = false;
      },
      setLineDash() {},
      fillRect() {},
      arc() {},
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      measureText: () => ({ width: 10 }),
    } as Record<string, unknown>,
    {
      get(target, prop) {
        if (prop === 'strokeStyle') return strokeStyle;
        if (prop in target) return target[prop as string];
        return () => undefined;
      },
      set(_target, prop, value) {
        if (prop === 'strokeStyle') strokeStyle = value as string;
        return true;
      },
    },
  );
  const canvas = document.createElement('canvas');
  canvas.getContext = (() => ctx) as never;
  return { canvas, segments };
}

function draw(w: World, v: ViewState): Segment[] {
  const { canvas, segments } = recordingCanvas();
  const renderer = new Renderer(canvas);
  renderer.ingest(w, v);
  renderer.update(0, v);
  renderer.draw(w, v);
  return segments;
}

describe('fb036: TD path indicators', () => {
  it('default settings have the toggle on', () => {
    expect(defaultSettings().showPathIndicators).toBe(true);
  });

  it('on, TD phase: draws a dashed segment per gate, in that gate\'s own color', () => {
    const w = new World(cfg());
    const segs = draw(w, view({ settings: { ...defaultSettings(), showPathIndicators: true } }));
    for (let gi = 0; gi < GATES.length; gi++) {
      expect(segs.some((s) => s.strokeStyle === GATE_PATH_COLORS[gi])).toBe(true);
    }
  });

  it('off: draws no path segments at all', () => {
    const w = new World(cfg());
    const segs = draw(w, view({ settings: { ...defaultSettings(), showPathIndicators: false } }));
    expect(segs.some((s) => GATE_PATH_COLORS.includes(s.strokeStyle))).toBe(false);
    expect(segs.some((s) => s.strokeStyle === PALETTE.pathBreach)).toBe(false);
  });

  it('a sealed gate\'s breach span draws in PALETTE.pathBreach', () => {
    const w = new World(cfg());
    for (let y = 1; y < GRID_H - 1; y++) w.grid.setOcc(10, y, 999);
    w.grid.refresh();
    const segs = draw(w, view({ settings: { ...defaultSettings(), showPathIndicators: true } }));
    expect(segs.some((s) => s.strokeStyle === PALETTE.pathBreach)).toBe(true);
  });

  it('VS phase (huntsWarden): draws no path indicators, gated like drawRangeRings', () => {
    const w = new World(cfg());
    w.phase = 'act2';
    const segs = draw(w, view({ settings: { ...defaultSettings(), showPathIndicators: true } }));
    expect(segs.some((s) => GATE_PATH_COLORS.includes(s.strokeStyle))).toBe(false);
  });

  it('Fourth Gate modifier: draws a 4th path (the south gate), not just the static 3 in grid.ts\'s GATES', () => {
    const w = new World(cfg({ modifiers: ['gate'] }));
    expect(w.gates.length).toBe(4);
    const segs = draw(w, view({ settings: { ...defaultSettings(), showPathIndicators: true } }));
    // Every gate, including the 4th (south), gets its own color's segment —
    // drawPathIndicators must iterate w.gates, not the static 3-entry GATES.
    for (let gi = 0; gi < w.gates.length; gi++) {
      expect(segs.some((s) => s.strokeStyle === GATE_PATH_COLORS[gi])).toBe(true);
    }
  });
});
