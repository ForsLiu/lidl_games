import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CONTRAST_MIN,
  COLOR_DISTANCE_MIN,
  MIN_FONT_PX,
  colorDistance,
  contrastRatio,
  hexToRgb,
  isOffscreen,
  overlapArea,
  rectsOverlap,
  relativeLuminance,
  type Rect,
} from '../tools/audit/checks';

describe('fb018 ui-audit checks: color math', () => {
  it('hexToRgb parses 6-digit and 3-digit hex', () => {
    expect(hexToRgb('#ffffff')).toEqual([255, 255, 255]);
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
    expect(hexToRgb('#ff8833')).toEqual([255, 136, 51]);
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
    expect(hexToRgb('abc')).toEqual([170, 187, 204]);
  });

  it('hexToRgb rejects a malformed color', () => {
    expect(() => hexToRgb('not-a-color')).toThrow();
  });

  it('relativeLuminance: white is brighter than black', () => {
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 5);
    expect(relativeLuminance([0, 0, 0])).toBeCloseTo(0, 5);
  });

  it('contrastRatio: black on white clears WCAG AA (deliberately passing fixture)', () => {
    const ratio = contrastRatio([0, 0, 0], [255, 255, 255]);
    expect(ratio).toBeCloseTo(21, 0);
    expect(ratio).toBeGreaterThanOrEqual(CONTRAST_MIN);
  });

  it('contrastRatio: two similar grays fall below the minimum (deliberately failing fixture)', () => {
    // #888 vs #999 — a low-contrast pairing a real panel could plausibly ship.
    const ratio = contrastRatio(hexToRgb('#888888'), hexToRgb('#999999'));
    expect(ratio).toBeLessThan(CONTRAST_MIN);
  });

  it('contrastRatio is symmetric in its two arguments', () => {
    const a = hexToRgb('#e8edf5');
    const b = hexToRgb('#0d1016');
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
  });

  it('colorDistance: identical colors collide (deliberately failing fixture)', () => {
    const c = hexToRgb('#ff8833');
    expect(colorDistance(c, c)).toBe(0);
    expect(colorDistance(c, c)).toBeLessThan(COLOR_DISTANCE_MIN);
  });

  it('colorDistance: a real damagetypes.json pair clears the minimum', () => {
    // Bleeding (#cc2244) vs Poison (#7ac74f) — two authored, visually distinct rows.
    const d = colorDistance(hexToRgb('#cc2244'), hexToRgb('#7ac74f'));
    expect(d).toBeGreaterThanOrEqual(COLOR_DISTANCE_MIN);
  });
});

describe('fb018 ui-audit checks: geometry', () => {
  const a: Rect = { x: 0, y: 0, w: 10, h: 10 };

  it('rectsOverlap: overlapping rects', () => {
    expect(rectsOverlap(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
  });

  it('rectsOverlap: touching edges do not count as overlap', () => {
    expect(rectsOverlap(a, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
  });

  it('rectsOverlap: disjoint rects', () => {
    expect(rectsOverlap(a, { x: 50, y: 50, w: 10, h: 10 })).toBe(false);
  });

  it('overlapArea: full overlap of a rect with itself', () => {
    expect(overlapArea(a, a)).toBe(100);
  });

  it('overlapArea: partial overlap', () => {
    expect(overlapArea(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(25);
  });

  it('overlapArea: disjoint rects have zero area', () => {
    expect(overlapArea(a, { x: 50, y: 50, w: 10, h: 10 })).toBe(0);
  });

  it('isOffscreen: a rect fully inside the viewport', () => {
    expect(isOffscreen({ x: 100, y: 100, w: 50, h: 50 }, { w: 1920, h: 1080 })).toBe(false);
  });

  it('isOffscreen: a rect entirely past the right/bottom edge', () => {
    expect(isOffscreen({ x: 1920, y: 0, w: 50, h: 50 }, { w: 1920, h: 1080 })).toBe(true);
    expect(isOffscreen({ x: 0, y: 1080, w: 50, h: 50 }, { w: 1920, h: 1080 })).toBe(true);
  });

  it('isOffscreen: a rect entirely past the left/top edge (negative position)', () => {
    expect(isOffscreen({ x: -50, y: 0, w: 40, h: 40 }, { w: 1920, h: 1080 })).toBe(true);
  });

  it('isOffscreen: a rect straddling the edge is still partially visible', () => {
    expect(isOffscreen({ x: -10, y: 0, w: 40, h: 40 }, { w: 1920, h: 1080 })).toBe(false);
  });
});

describe('fb018 ui-audit checks: real damagetypes.json palette', () => {
  const content = JSON.parse(
    readFileSync(resolve(__dirname, '../data/damagetypes.json'), 'utf8'),
  ) as {
    types: { key: string; color: string; colorblindColor: string }[];
    statuses: Record<string, { color: string; colorblindColor: string }>;
  };

  function allEntries(): { key: string; color: string; colorblindColor: string }[] {
    return [
      ...content.types,
      ...Object.entries(content.statuses).map(([key, s]) => ({
        key,
        color: s.color,
        colorblindColor: s.colorblindColor,
      })),
    ];
  }

  it('MIN_FONT_PX is the 12px floor named by the acceptance criteria', () => {
    expect(MIN_FONT_PX).toBe(12);
  });

  it('every authored color/colorblindColor pair is a distinct hue from every other, in both palettes', () => {
    const entries = allEntries();
    const offenders: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i];
        const b = entries[j];
        const dColor = colorDistance(hexToRgb(a.color), hexToRgb(b.color));
        if (dColor < COLOR_DISTANCE_MIN) offenders.push(`${a.key} vs ${b.key} (color): ${dColor.toFixed(1)}`);
        const dCb = colorDistance(hexToRgb(a.colorblindColor), hexToRgb(b.colorblindColor));
        if (dCb < COLOR_DISTANCE_MIN) offenders.push(`${a.key} vs ${b.key} (colorblindColor): ${dCb.toFixed(1)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
