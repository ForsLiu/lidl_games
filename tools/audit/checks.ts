/**
 * fb018 UI self-audit — pure analysis functions. No DOM, no Playwright import:
 * everything here is arithmetic over already-sampled numbers, so it is
 * fast-tier-testable (`tests/ui-audit-checks.test.ts`) without a browser and
 * runs identically whether called from a unit test or from `tools/ui-audit.ts`.
 */

export type Rgb = [number, number, number];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** WCAG 2.1 AA body-text threshold (SC 1.4.3). */
export const CONTRAST_MIN = 4.5;

/** 1080p legibility floor named by the acceptance criteria. */
export const MIN_FONT_PX = 12;

/**
 * Minimum acceptable Euclidean sRGB distance between two damage-type/status
 * colors that must read as visually distinct (⚖ tunable — no spec number
 * names one; QUESTIONS.md logs the reasoning).
 *
 * The closest pair `/data/damagetypes.json` actually authors today (Normal
 * `#ffd9a0` vs Electric `#ffe066`, both palettes) sits at ~58.4. 40 is set
 * comfortably below that so today's content passes with headroom, while
 * still being far enough from 0 to catch a real near-duplicate (two colors a
 * player would call "basically the same") rather than only a literal exact
 * match.
 */
export const COLOR_DISTANCE_MIN = 40;

/** `"#rrggbb"` (optionally `"#rgb"`) to an `[r,g,b]` triple, 0-255 each. */
export function hexToRgb(hex: string): Rgb {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) {
    throw new Error(`hexToRgb: not a hex color: "${hex}"`);
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [r, g, b];
}

/** One sRGB channel (0-255) to its linear-light value, WCAG's own formula. */
function linearChannel(c8: number): number {
  const c = c8 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG 2.1 relative luminance (SC 1.4.3's own formula). */
export function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb;
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);
}

/**
 * WCAG contrast ratio between a foreground and background color, `(L1+0.05) /
 * (L2+0.05)` with `L1` the lighter of the two — order of the two arguments
 * does not matter, the formula is symmetric by construction.
 */
export function contrastRatio(fg: Rgb, bg: Rgb): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Euclidean distance in sRGB (0-255 per channel) space. Not a perceptually
 * uniform metric (CIE Lab/Delta-E would be), but every color this check
 * compares is a hand-authored, already-fairly-saturated hue from one small
 * `/data/damagetypes.json` palette, so a plain Euclidean distance is a cheap,
 * dependency-free proxy that is more than adequate to catch two hues a player
 * would call "the same color" — it does not need to model human perception
 * exactly, only to separate "distinct" from "collided."
 */
export function colorDistance(a: Rgb, b: Rgb): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** Whether two axis-aligned rects overlap (touching edges do not count as overlap). */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Area of the intersection of two rects, 0 if they don't overlap. */
export function overlapArea(a: Rect, b: Rect): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return ix * iy;
}

/** True when a rect has no area inside the viewport at all — fully off-screen. */
export function isOffscreen(rect: Rect, viewport: { w: number; h: number }): boolean {
  return rect.x + rect.w <= 0 || rect.y + rect.h <= 0 || rect.x >= viewport.w || rect.y >= viewport.h;
}
