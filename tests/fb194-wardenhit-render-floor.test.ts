/**
 * @vitest-environment jsdom
 *
 * fb194 (found by code-reviewer while verifying the numberScale economy
 * split): `damageWarden`'s `wardenhit` fx carries economy-B damage (the
 * character's own HP axis), which fb194 stopped scaling by `numberScale`.
 * `src/render/canvas.ts`'s `damageFloor()` still returns `numberScale`
 * (0.1), an economy-A-shaped floor — dividing an unscaled hit by it
 * inflated the screen-shake term roughly 10x and made the "is this worth a
 * number?" gate roughly 10x too permissive. `wardenDamageFloor()` (a bare
 * authored point, 1, independent of `numberScale`) fixes both call sites.
 */
import { describe, expect, it } from 'vitest';

import { Renderer, type ViewState } from '../src/render/canvas';
import { World } from '../src/sim/world';
import { defaultSettings } from '../src/ui/settings';
import { cfg } from './helpers';

function recordingCanvas(): { canvas: HTMLCanvasElement } {
  const ctx = new Proxy(
    {
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      measureText: () => ({ width: 10 }),
    } as Record<string, unknown>,
    { get: (target, prop) => (prop in target ? target[prop as string] : () => undefined) },
  );
  const canvas = document.createElement('canvas');
  canvas.getContext = (() => ctx) as never;
  return { canvas };
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

describe('fb194: wardenhit floating-number floor stays one authored point under the economy split', () => {
  it('a small economy-B hit (well under old numberScale-sized inflation) still shows and does not saturate shake', () => {
    const w = new World(cfg());
    const { canvas } = recordingCanvas();
    const renderer = new Renderer(canvas);
    const v = view();

    // A realistic post-split Warden hit: economy-B, unscaled, authored-magnitude.
    w.emit('wardenhit', w.warden.x, w.warden.y, 3, 0);
    renderer.ingest(w, v);

    const numbers = (renderer as unknown as { numbers: { value: number }[] }).numbers;
    expect(numbers.some((n) => n.value === 3), 'a 3-point hit must clear the floor and show a number').toBe(true);

    // Pre-fb194-fix, dividing 3 by numberScale (0.1) gave shake = min(9, 2 + 30*0.25) = 9 (saturated).
    // The correct, unsaturated value with a floor of 1 is min(9, 2 + 3*0.25) = 2.75.
    expect(v.shake).toBeCloseTo(2.75, 5);
  });

  it('does not saturate the shake cap on an ordinary sequence of small hits', () => {
    const w = new World(cfg());
    const { canvas } = recordingCanvas();
    const renderer = new Renderer(canvas);
    const v = view();

    for (const dmg of [1, 2, 1, 2]) {
      w.emit('wardenhit', w.warden.x, w.warden.y, dmg, 0);
      renderer.ingest(w, v);
    }

    expect(v.shake, 'ordinary small hits must not saturate the 9-point shake cap').toBeLessThan(9);
  });
});
