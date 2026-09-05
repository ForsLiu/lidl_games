/**
 * @vitest-environment jsdom
 *
 * fb098: QUALITY.md 1.0's Accessibility re-check names "colorblind palettes
 * on real content" as its own bar, distinct from BETA's plain "colorblind-safe
 * palette" existence bar fb005 already met (a per-damage-type color table with
 * a `colorblindColor` alternate, unit-tested only as isolated table entries —
 * see `tests/fb005-damage-colors.test.ts`).
 *
 * This file renders the real `accessiblePalette: true` colors through the
 * actual `Renderer` (a live "mixed fight": all six §3 damage types' floating
 * numbers plus a Corpse Core execution, on one frame — the same recording
 * harness fb005 uses), then runs each of the three common forms of red/green/
 * blue color-vision deficiency (`src/render/colorblind-sim.ts`, a standalone
 * Vienot/Brettel-derived simulation with no new dependency) over the recorded
 * colors and asserts every simultaneously-visible pair stays distinguishable.
 *
 * Frost/frozen (the two §3 statuses) are drawn as enemy-ring markers rather
 * than floating numbers, via `damageStyleColor` calls in `drawEnemies`
 * (`canvas.ts:891,899`) keyed by a literal `'frozen'`/`'frost'` string with no
 * further logic to diverge from the function's own return value. No test in
 * this repo (including fb005's) captures those two colors through an actual
 * `drawEnemies` pass with a real frozen/slowed enemy — this is a documented
 * compromise, not existing coverage: their colors are read directly via
 * `damageStyleColor`, the same function `drawEnemies` itself calls, rather
 * than re-deriving a marker-pixel-capture harness for this item.
 */
import { describe, expect, it } from 'vitest';

import { Renderer, type ViewState } from '../src/render/canvas';
import { World } from '../src/sim/world';
import { loadContent } from '../src/sim/content';
import { damageStyleColor, executeStyle, DAMAGE_TYPES } from '../src/sim/damagetypes';
import { defaultSettings } from '../src/ui/settings';
import { auditDistinguishability, simulateCvd, CVD_MODES } from '../src/render/colorblind-sim';
import { cfg } from './helpers';

loadContent();

/** Minimum acceptable simulated-color distance; see `colorblind-sim.ts`'s file-level
 * comment for the real-content vs. deliberately-broken-fixture numbers this was chosen
 * against. */
const MIN_DISTANCE = 20;

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

/** Records every `fillText` call along with the `fillStyle` active at the time. */
function recordingCanvas(): {
  canvas: HTMLCanvasElement;
  texts: { text: string; fillStyle: string }[];
} {
  const texts: { text: string; fillStyle: string }[] = [];
  let fillStyle = '';
  const ctx = new Proxy(
    {
      fillText(text: string) {
        texts.push({ text, fillStyle });
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
  return { canvas, texts };
}

/** Renders a real mixed fight (all six damage types + an execute) under the
 * colorblind-safe palette and returns the colors the renderer actually used,
 * proving they match `damageStyleColor`/`executeStyle`'s live output rather
 * than a hand-copied table. */
function renderColorblindPaletteColors(): { key: string; color: string }[] {
  const { canvas, texts } = recordingCanvas();
  const renderer = new Renderer(canvas);
  const w = new World(cfg());
  const v = view({ settings: { ...defaultSettings(), accessiblePalette: true } });
  const amountFor = (i: number) => 20 + i;
  DAMAGE_TYPES.forEach((t, i) => {
    w.fx.push({ k: `hit:${t}`, x: 5 + i, y: 5, a: amountFor(i), b: 0 });
  });
  const executeAmount = 900;
  w.fx.push({ k: 'execute', x: 12, y: 5, a: executeAmount, b: 0 });
  renderer.ingest(w, v);
  renderer.update(0, v);
  renderer.draw(w, v);

  const colors: { key: string; color: string }[] = DAMAGE_TYPES.map((t, i) => {
    const expected = String(amountFor(i));
    const hit = texts.find((x) => x.text === expected);
    expect(hit, `no floating number for ${t}`).toBeDefined();
    expect(hit!.fillStyle).toBe(damageStyleColor(w, t, true));
    return { key: t, color: hit!.fillStyle };
  });

  const executeHit = texts.find((x) => x.text === `-${executeAmount}`);
  expect(executeHit, 'no floating number for execute').toBeDefined();
  expect(executeHit!.fillStyle).toBe(executeStyle(w, true).color);
  colors.push({ key: 'execute', color: executeHit!.fillStyle });

  colors.push({ key: 'frost', color: damageStyleColor(w, 'frost', true) });
  colors.push({ key: 'frozen', color: damageStyleColor(w, 'frozen', true) });
  return colors;
}

describe('fb098: colorblind-safe palette distinguishability on real rendered content', () => {
  it('every simultaneously-visible damage-type/status/execute color stays distinguishable under every simulated CVD mode', () => {
    const colors = renderColorblindPaletteColors();
    expect(colors).toHaveLength(9); // §13: 6 damage types + 2 statuses + execute

    for (const mode of CVD_MODES) {
      const simulated = colors.map((c) => ({ key: c.key, color: simulateCvd(c.color, mode) }));
      const violations = auditDistinguishability(simulated, MIN_DISTANCE);
      expect(violations, `${mode}: ${JSON.stringify(violations)}`).toEqual([]);
    }
  });

  it('also holds with no simulation applied (the colors as an unaffected viewer sees them)', () => {
    const colors = renderColorblindPaletteColors();
    expect(auditDistinguishability(colors, MIN_DISTANCE)).toEqual([]);
  });

  it('is not vacuous: a pair that is distinct unsimulated but collapses under protanopia is caught', () => {
    // A magenta/bright-green pair chosen (by search, not hand-tuned) for a
    // large gap between its raw distance and its protanopia-simulated
    // distance, so this proves the CVD transform itself is doing real work
    // rather than the check merely re-deriving plain color distance.
    const broken = [
      { key: 'a', color: '#ee07a0' },
      { key: 'b', color: '#29fc12' },
    ];
    expect(auditDistinguishability(broken, MIN_DISTANCE)).toEqual([]);

    const simulated = broken.map((c) => ({ key: c.key, color: simulateCvd(c.color, 'protanopia') }));
    const violations = auditDistinguishability(simulated, MIN_DISTANCE);
    expect(violations).toHaveLength(1);
    expect(violations[0].distance).toBeLessThan(MIN_DISTANCE);
  });
});
