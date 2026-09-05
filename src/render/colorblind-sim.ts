/**
 * fb098: a standalone, dependency-free simulation of the three common forms
 * of red/green/blue color-vision deficiency, used only to *audit* the real
 * per-damage-type palette (`data/damagetypes.json`, fb005) for
 * distinguishability under each — not shown to players. The transform
 * matrices are the standard Vienot/Brettel-derived linear-RGB approximation
 * widely reused by browser devtools' own "emulate vision deficiencies" and
 * color-blindness simulator tools.
 *
 * `tests/render-fb098-colorblind-audit.test.ts`'s `MIN_DISTANCE = 20`
 * threshold operates on this file's *simulated* (post-CVD-transform)
 * distances, a smaller space than `tools/audit/checks.ts`'s unrelated
 * `COLOR_DISTANCE_MIN = 40` (unsimulated raw-color distance — that file is
 * outside `src/`, so it cannot be imported from here, hence the parallel
 * `hexToRgb`/distance helpers). Measured against the real
 * `accessiblePalette: true` content: the tightest simulated pair is
 * poison/frost under tritanopia at ~25.8, with protanopia/deuteranopia's
 * tightest pair (frozen/execute) at ~35.3-37.4 — 20 leaves real headroom on
 * every mode. The deliberately-broken fixture (a magenta/green pair, ~345
 * unsimulated vs. ~13.4 under simulated protanopia) sits well below it.
 */

export const CVD_MODES = ['protanopia', 'deuteranopia', 'tritanopia'] as const;
export type CvdMode = (typeof CVD_MODES)[number];

const CVD_MATRIX: Record<CvdMode, readonly [number, number, number][]> = {
  protanopia: [
    [0.56667, 0.43333, 0],
    [0.55833, 0.44167, 0],
    [0, 0.24167, 0.75833],
  ],
  deuteranopia: [
    [0.625, 0.375, 0],
    [0.7, 0.3, 0],
    [0, 0.3, 0.7],
  ],
  tritanopia: [
    [0.95, 0.05, 0],
    [0, 0.43333, 0.56667],
    [0, 0.475, 0.525],
  ],
};

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(v: number): number {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) throw new Error(`not a #rrggbb color: "${hex}"`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToHex([r, g, b]: readonly [number, number, number]): string {
  const h = (v: number) => v.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Simulates how `hex` would appear to a viewer with the given deficiency. */
export function simulateCvd(hex: string, mode: CvdMode): string {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  const m = CVD_MATRIX[mode];
  const out: [number, number, number] = [
    m[0][0] * r + m[0][1] * g + m[0][2] * b,
    m[1][0] * r + m[1][1] * g + m[1][2] * b,
    m[2][0] * r + m[2][1] * g + m[2][2] * b,
  ];
  return rgbToHex(out.map(linearToSrgb) as [number, number, number]);
}

/** Plain Euclidean distance in 0-255 sRGB space; max possible is ~441.7. */
export function colorDistance(hexA: string, hexB: string): number {
  const [ar, ag, ab] = hexToRgb(hexA);
  const [br, bg, bb] = hexToRgb(hexB);
  return Math.hypot(ar - br, ag - bg, ab - bb);
}

export interface DistinguishabilityViolation {
  keyA: string;
  keyB: string;
  distance: number;
}

/**
 * Checks every pair in `colors` (already run through whatever simulation, or
 * not, the caller wants audited) and reports any pair closer than
 * `minDistance`. Empty `violations` means every pair cleared the bar.
 */
export function auditDistinguishability(
  colors: readonly { key: string; color: string }[],
  minDistance: number,
): DistinguishabilityViolation[] {
  const violations: DistinguishabilityViolation[] = [];
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const distance = colorDistance(colors[i].color, colors[j].color);
      if (distance < minDistance) {
        violations.push({ keyA: colors[i].key, keyB: colors[j].key, distance });
      }
    }
  }
  return violations;
}
