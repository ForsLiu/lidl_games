/**
 * @vitest-environment jsdom
 *
 * fb167 (BACKLOG-UI.md, owner order BACKLOG.md fb153b item 2): with the grid
 * at 56x32 the whole arena no longer fits a screen at a readable tile size,
 * so `Renderer` now carries a camera that follows the Warden inside a
 * zoomed-in window of the board, clamped at the map edges and at readability
 * zoom limits, and respects `reducedMotion`. See `canvas.ts`'s own doc
 * comments (`camera`, `computeCameraViewTiles`) for the design rationale.
 *
 * Every *other* `Renderer`-constructing test in this suite never calls
 * `update()` with a `World` and so never activates the camera at all — this
 * file is the one place that does, and is the regression coverage for that
 * activation path.
 */
import { describe, expect, it } from 'vitest';

import { Renderer, type ViewState } from '../src/render/canvas';
import { GRID_H, GRID_W } from '../src/sim/grid';
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

/** jsdom has no real 2D context — same stub `tests/render-fb065-stage-fill.test.ts` uses for a `Renderer` that never draws. */
function stubContext(canvas: HTMLCanvasElement): void {
  canvas.getContext = (() => ({ setTransform() {}, scale() {} })) as never;
}

/** A canvas with no real parent — `resize()`'s jsdom fallback (`GRID_W*TILE`/`GRID_H*TILE`) applies deterministically. */
function bareCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  stubContext(canvas);
  return canvas;
}

/** A canvas inside a parent whose `clientWidth`/`clientHeight` are stubbed, since jsdom never runs real layout. */
function canvasInStage(w: number, h: number): HTMLCanvasElement {
  const stage = document.createElement('div');
  Object.defineProperty(stage, 'clientWidth', { value: w, configurable: true });
  Object.defineProperty(stage, 'clientHeight', { value: h, configurable: true });
  const canvas = document.createElement('canvas');
  stubContext(canvas);
  stage.appendChild(canvas);
  document.body.appendChild(stage);
  return canvas;
}

function reduced(): ViewState {
  return view({ settings: { ...defaultSettings(), reducedMotion: true } });
}

describe('fb167: the camera stays at the whole-board default until update() sees a World', () => {
  it('cameraViewRect() is the whole board before any update(w) call', () => {
    const r = new Renderer(bareCanvas());
    expect(r.cameraViewRect()).toEqual({ left: 0, top: 0, width: GRID_W, height: GRID_H });
  });

  it('a 2-arg update() (no World) never activates the camera', () => {
    const r = new Renderer(bareCanvas());
    r.update(1, view());
    expect(r.cameraViewRect()).toEqual({ left: 0, top: 0, width: GRID_W, height: GRID_H });
  });
});

describe('fb167: the camera follows the Warden', () => {
  it('snaps to center on the Warden the first time update() sees a World', () => {
    const r = new Renderer(bareCanvas());
    const w = new World(cfg());
    w.warden.x = 28;
    w.warden.y = 16;
    r.update(1, reduced(), w);
    const rect = r.cameraViewRect();
    expect(rect.left + rect.width / 2).toBeCloseTo(28, 5);
    expect(rect.top + rect.height / 2).toBeCloseTo(16, 5);
  });

  it('re-centers as the Warden moves (reducedMotion: instant, no lag)', () => {
    const r = new Renderer(bareCanvas());
    const w = new World(cfg());
    w.warden.x = 28;
    w.warden.y = 16;
    r.update(1, reduced(), w);
    w.warden.x = 30;
    w.warden.y = 18;
    r.update(1 / 60, reduced(), w);
    const rect = r.cameraViewRect();
    expect(rect.left + rect.width / 2).toBeCloseTo(30, 5);
    expect(rect.top + rect.height / 2).toBeCloseTo(18, 5);
  });
});

describe('fb167: the camera clamps at all four map edges', () => {
  it('never shows past the top-left edge', () => {
    const r = new Renderer(bareCanvas());
    const w = new World(cfg());
    w.warden.x = 0;
    w.warden.y = 0;
    r.update(1, reduced(), w);
    const rect = r.cameraViewRect();
    expect(rect.left).toBeGreaterThanOrEqual(-1e-9);
    expect(rect.top).toBeGreaterThanOrEqual(-1e-9);
  });

  it('never shows past the bottom-right edge', () => {
    const r = new Renderer(bareCanvas());
    const w = new World(cfg());
    w.warden.x = GRID_W;
    w.warden.y = GRID_H;
    r.update(1, reduced(), w);
    const rect = r.cameraViewRect();
    expect(rect.left + rect.width).toBeLessThanOrEqual(GRID_W + 1e-9);
    expect(rect.top + rect.height).toBeLessThanOrEqual(GRID_H + 1e-9);
  });
});

describe('fb167: zoom limits — the camera view stays within the readability band', () => {
  it('never shows more tiles than the board itself, nor fewer than the minimum readable window', () => {
    const r = new Renderer(bareCanvas());
    const w = new World(cfg());
    w.warden.x = GRID_W / 2;
    w.warden.y = GRID_H / 2;
    r.update(1, reduced(), w);
    const rect = r.cameraViewRect();
    expect(rect.width).toBeLessThanOrEqual(GRID_W);
    expect(rect.height).toBeLessThanOrEqual(GRID_H);
    expect(rect.width).toBeGreaterThanOrEqual(16);
  });

  it('zooms in toward the minimum readable window on a small stage', () => {
    const canvas = canvasInStage(200, 150);
    const r = new Renderer(canvas);
    const w = new World(cfg());
    w.warden.x = GRID_W / 2;
    w.warden.y = GRID_H / 2;
    r.update(1, reduced(), w);
    const rect = r.cameraViewRect();
    expect(rect.width).toBeCloseTo(16, 5);
  });

  it('never zooms out past the maximum readable window on a huge stage', () => {
    const canvas = canvasInStage(10000, 10000);
    const r = new Renderer(canvas);
    const w = new World(cfg());
    w.warden.x = GRID_W / 2;
    w.warden.y = GRID_H / 2;
    r.update(1, reduced(), w);
    const rect = r.cameraViewRect();
    expect(rect.width).toBeCloseTo(40, 5);
    expect(rect.width).toBeLessThan(GRID_W);
  });
});

describe('fb167: reducedMotion is respected', () => {
  it('without reducedMotion, the camera eases toward the Warden rather than snapping', () => {
    const r = new Renderer(bareCanvas());
    const w = new World(cfg());
    w.warden.x = 28;
    w.warden.y = 16;
    r.update(1, reduced(), w); // first activation always snaps, regardless of the setting
    w.warden.x = 32; // still inside the [20, 36] edge-clamp band at this default zoom
    r.update(0.1, view(), w); // reducedMotion off, a small step
    const rect = r.cameraViewRect();
    const cx = rect.left + rect.width / 2;
    expect(cx).toBeGreaterThan(28);
    expect(cx).toBeLessThan(32);
  });

  it('with reducedMotion on, the camera snaps straight to the target every step', () => {
    const r = new Renderer(bareCanvas());
    const w = new World(cfg());
    w.warden.x = 28;
    w.warden.y = 16;
    r.update(1, reduced(), w);
    w.warden.x = 32; // still inside the [20, 36] edge-clamp band at this default zoom
    r.update(0.1, reduced(), w); // same small step, but reducedMotion is on
    const rect = r.cameraViewRect();
    expect(rect.left + rect.width / 2).toBeCloseTo(32, 5);
  });
});
