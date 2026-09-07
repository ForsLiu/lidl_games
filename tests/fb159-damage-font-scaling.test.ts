/**
 * @vitest-environment jsdom
 *
 * fb159 (owner feedback `ui-damage-font-scaling`): floating damage numbers'
 * font size is `base + k*log10(value)`, clamped, instead of a fixed 12px —
 * "10 small, 100 medium, 1000+ large and bold". Crit/execute keeps its own
 * multiplier (`executeFontScale`, data-driven in `data/damagetypes.json`) on
 * top of the value-based size rather than losing it; a DoT aggregate tick
 * (fb060) renders at 80% of the same computed size instead of a flat,
 * value-blind fraction of 12px.
 */
import { describe, expect, it } from 'vitest';

import { Renderer, type ViewState } from '../src/render/canvas';
import { World } from '../src/sim/world';
import { applyDot, spawnEnemy, updateEnemies } from '../src/sim/enemies';
import { damageStyleColor, executeStyle } from '../src/sim/damagetypes';
import { defaultSettings } from '../src/ui/settings';
import { FLOATING_NUMBER_FONT, floatingNumberFontSize, floatingNumberFontWeight } from '../src/render/theme';
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

describe('fb159: floatingNumberFontSize is monotonic in value and clamped', () => {
  it('renders three visibly distinct sizes across 1/10/100/1000, strictly increasing', () => {
    const sizes = [1, 10, 100, 1000].map((v) => floatingNumberFontSize(v));
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i], `${[1, 10, 100, 1000][i]} vs previous`).toBeGreaterThan(sizes[i - 1]);
    }
    // "Visibly distinct" — at least a few px apart between adjacent anchors, not a rounding artifact.
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i] - sizes[i - 1]).toBeGreaterThan(1);
    }
  });

  it('is monotonic across a dense sweep, not just at the four named anchors', () => {
    let prev = -Infinity;
    for (let v = 1; v <= 100000; v *= 1.7) {
      const size = floatingNumberFontSize(v);
      expect(size, `value=${v}`).toBeGreaterThanOrEqual(prev);
      prev = size;
    }
  });

  it('the clamp holds above the max anchor — a huge value never exceeds FLOATING_NUMBER_FONT.max', () => {
    expect(floatingNumberFontSize(1e12)).toBeLessThanOrEqual(FLOATING_NUMBER_FONT.max);
    expect(floatingNumberFontSize(1e9)).toBe(floatingNumberFontSize(1e12)); // both pinned at the clamp
  });

  it('never renders smaller than the base anchor, even for a sub-1 value', () => {
    expect(floatingNumberFontSize(0.001)).toBe(FLOATING_NUMBER_FONT.base);
    expect(floatingNumberFontSize(0)).toBe(FLOATING_NUMBER_FONT.base);
  });

  it('a fontScale multiplier applies on top of the (already-clamped) value-based size', () => {
    const plain = floatingNumberFontSize(100);
    const scaled = floatingNumberFontSize(100, 1.6);
    expect(scaled).toBeCloseTo(plain * 1.6, 10);
  });
});

describe('fb159: floatingNumberFontWeight is bold at the large-number anchor, or for a crit/execute', () => {
  it('is normal weight below 1000 at fontScale 1, bold at/above it', () => {
    expect(floatingNumberFontWeight(999, 1)).toBe('normal');
    expect(floatingNumberFontWeight(1000, 1)).toBe('bold');
    expect(floatingNumberFontWeight(50000, 1)).toBe('bold');
  });

  it('is bold regardless of value once fontScale > 1 (a crit/execute keeps its own emphasis)', () => {
    expect(floatingNumberFontWeight(1, 1.01)).toBe('bold');
    expect(floatingNumberFontWeight(1, 1)).toBe('normal');
  });
});

/** Same recording-canvas convention `tests/fb005-damage-colors.test.ts`/`render-fb060-...` already use. */
function recordingCanvas(): { canvas: HTMLCanvasElement; texts: { text: string; font: string; color: string }[] } {
  const texts: { text: string; font: string; color: string }[] = [];
  const state = { fillStyle: '', font: '' };
  const ctx = new Proxy(
    {
      fillText(text: string) {
        texts.push({ text, font: state.font, color: state.fillStyle });
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

function fontSize(font: string): number {
  return Number(/(\d+)px/.exec(font)?.[1] ?? NaN);
}

function fontWeight(font: string): 'bold' | 'normal' {
  return font.startsWith('bold') ? 'bold' : 'normal';
}

describe('fb159: real hit/execute/DoT events render through the same formula end to end', () => {
  it('a real hit event renders at floatingNumberFontSize(amount), not a fixed 12px', () => {
    const w = new World(cfg());
    const { canvas, texts } = recordingCanvas();
    const renderer = new Renderer(canvas);
    const v = view();
    w.fx.push({ k: 'hit:normal', x: 5, y: 5, a: 500, b: 1 });
    renderer.ingest(w, v);
    renderer.update(0, v);
    renderer.draw(w, v);

    const hit = texts.find((t) => t.text === '500')!;
    expect(hit).toBeDefined();
    expect(fontSize(hit.font)).toBe(Math.round(floatingNumberFontSize(500)));
    expect(fontWeight(hit.font)).toBe(floatingNumberFontWeight(500, 1));
  });

  it('a real execute event renders at floatingNumberFontSize(amount, executeFontScale) and stays bold', () => {
    const w = new World(cfg());
    const { canvas, texts } = recordingCanvas();
    const renderer = new Renderer(canvas);
    const v = view();
    w.fx.push({ k: 'execute', x: 6, y: 5, a: 5, b: 0 }); // small value on purpose
    renderer.ingest(w, v);
    renderer.update(0, v);
    renderer.draw(w, v);

    const style = executeStyle(w, false);
    const execute = texts.find((t) => t.text === '-5')!;
    expect(execute).toBeDefined();
    // Even at a small raw value, a crit/execute must still render large/bold —
    // "keeps its extra styling" rather than reverting to the small-value size.
    expect(fontSize(execute.font)).toBe(Math.round(floatingNumberFontSize(5, style.fontScale)));
    expect(fontSize(execute.font)).toBeGreaterThan(Math.round(floatingNumberFontSize(5)));
    expect(fontWeight(execute.font)).toBe('bold');
  });

  it('a real DoT aggregate tick renders at 80% of the same value-based size, not a flat fraction of 12px', () => {
    const w = new World(cfg({ practice: true }));
    w.warden.attackCooldown = 1e9;
    const e = spawnEnemy(w, w.content.enemies.enemies[0].key, w.warden.x + 10, w.warden.y)!;
    applyDot(w, e, 'bleeding', 20, 5, 'test');

    const { canvas, texts } = recordingCanvas();
    const renderer = new Renderer(canvas);
    const v = view();
    for (let i = 0; i < 65; i++) {
      updateEnemies(w, 1 / 60);
      renderer.ingest(w, v);
    }
    renderer.update(0, v);
    renderer.draw(w, v);

    const bleedColor = damageStyleColor(w, 'bleeding', false);
    const bleedNum = texts.find((t) => t.color === bleedColor);
    expect(bleedNum, 'a bleeding tick number must appear').toBeDefined();
    // `bleedNum!.text` is `damageText(amount)` — already rounded for display —
    // so the expected size is reconstructed within +-1px rather than asserted
    // byte-exact, to absorb that display rounding rather than the formula.
    const amount = Number(bleedNum!.text);
    expect(amount).toBeGreaterThan(0);
    const expectedSize = Math.round(floatingNumberFontSize(amount, FLOATING_NUMBER_FONT.dotFontScale));
    expect(Math.abs(fontSize(bleedNum!.font) - expectedSize)).toBeLessThanOrEqual(1);
    // Still smaller than an ordinary (fontScale 1) hit at the same value would be.
    expect(fontSize(bleedNum!.font)).toBeLessThan(Math.round(floatingNumberFontSize(amount)));
  });
});
