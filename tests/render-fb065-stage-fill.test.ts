/**
 * @vitest-environment jsdom
 *
 * fb065: `Renderer.resize()` now sizes the canvas off its parent's (`.sw-stage`)
 * own laid-out box instead of a fixed 1152x640 constant, so "the canvas fills
 * the window" is real backing-store pixels — owner feedback
 * `feature-ui-inside-playfield`. jsdom never runs real layout (`clientWidth`/
 * `clientHeight` read 0 by default), so these tests stub them via
 * `defineProperty`, the same technique `Object.defineProperty` mocks
 * elsewhere in this suite use for jsdom layout gaps.
 */

import { describe, expect, it } from 'vitest';

import { Renderer } from '../src/render/canvas';
import { GRID_H, GRID_W, TILE } from '../src/sim/grid';

function stubbedCanvas(parentW: number, parentH: number): HTMLCanvasElement {
  const parent = document.createElement('div');
  Object.defineProperty(parent, 'clientWidth', { value: parentW, configurable: true });
  Object.defineProperty(parent, 'clientHeight', { value: parentH, configurable: true });
  const canvas = document.createElement('canvas');
  canvas.getContext = (() => ({ setTransform() {}, scale() {} })) as never;
  parent.appendChild(canvas);
  document.body.appendChild(parent);
  return canvas;
}

describe('fb065: canvas fills its stage parent, letterboxed to the grid aspect', () => {
  it('is width-bound when the parent is squarer than the 36:20 grid', () => {
    const canvas = stubbedCanvas(1000, 1000);
    const r = new Renderer(canvas);
    r.resize(1);
    // width-bound: cssW = parent width, since height*aspect (1800) would overflow it.
    expect(canvas.style.width).toBe('1000px');
    expect(canvas.width).toBe(1000);
    expect(canvas.height).toBe(Math.round(1000 * (GRID_H / GRID_W)));
  });

  it('is height-bound when the parent is wider than the 36:20 grid', () => {
    const canvas = stubbedCanvas(4000, 300);
    const r = new Renderer(canvas);
    r.resize(1);
    const expectedW = Math.round(300 * (GRID_W / GRID_H));
    expect(canvas.style.width).toBe(`${expectedW}px`);
    expect(canvas.width).toBe(expectedW);
    expect(canvas.height).toBe(300);
  });

  it('still backs the canvas at the device pixel ratio on top of the stage size', () => {
    const canvas = stubbedCanvas(1000, 1000);
    const r = new Renderer(canvas);
    r.resize(2);
    expect(canvas.style.width).toBe('1000px'); // CSS size stays in logical pixels.
    expect(canvas.width).toBe(2000); // backing store doubled for the DPR.
  });

  it('never pins an inline height — CSS derives it from the aspect ratio', () => {
    const canvas = stubbedCanvas(1000, 700);
    const r = new Renderer(canvas);
    r.resize(1);
    expect(canvas.style.height).toBe('');
  });

  it('falls back to the fixed grid size with no parent (matches the pre-fb065 behavior every existing resize() test relies on)', () => {
    const canvas = document.createElement('canvas');
    canvas.getContext = (() => ({ setTransform() {}, scale() {} })) as never;
    document.body.appendChild(canvas);
    const r = new Renderer(canvas);
    r.resize(1);
    expect(canvas.width).toBe(GRID_W * TILE);
    expect(canvas.height).toBe(GRID_H * TILE);
  });

  it('re-derives size on a later resize() call once the parent grows (a live window resize)', () => {
    const canvas = stubbedCanvas(1000, 1000);
    const r = new Renderer(canvas);
    r.resize(1);
    expect(canvas.width).toBe(1000);

    Object.defineProperty(canvas.parentElement as HTMLElement, 'clientWidth', { value: 2000, configurable: true });
    Object.defineProperty(canvas.parentElement as HTMLElement, 'clientHeight', { value: 2000, configurable: true });
    r.resize(1);
    expect(canvas.width).toBe(2000);
  });
});
