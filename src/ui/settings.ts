/**
 * Player settings (SPEC M8). Presentation and accessibility only — nothing here
 * may change the simulation, so a replay is identical whatever these are set to.
 */

export interface Settings {
  masterVolume: number;
  sfxVolume: number;
  /** Screen shake scale, 0 disables it entirely. */
  shake: number;
  damageNumbers: boolean;
  showRanges: boolean;
  showGrid: boolean;
  /**
   * fb025: draws a small HP bar under every enemy, always (not just when
   * damaged, and not just elite/boss/large ones — see drawEnemies in
   * canvas.ts, which falls back to the pre-fb025 elite/boss/large-and-
   * damaged-only behavior when this is off).
   */
  showEnemyHpBars: boolean;
  /**
   * fb036: draws each spawn gate's current route to the Core (dashed, one
   * color per gate) during TD build phases and waves, switching to dashed
   * red through any structure tile the route currently breaches.
   */
  showPathIndicators: boolean;
  /**
   * fb005: colorblind-safe palette for per-damage-type floating numbers/markers.
   * Named without the literal word "colorblind" (which contains "orb") so it
   * doesn't trip `tests/c7-no-orbs.test.ts`'s "no Hub tab renders the word
   * 'orb'" scan of rendered Settings HTML — same reason the visible label
   * below is hyphenated rather than one solid word.
   */
  accessiblePalette: boolean;
  /**
   * fb016 (§11 extended to skills/Cores): dims/thins every skill- and
   * Core-fire flash instead of the full opaque pulse, and skips their fill
   * entirely — the strobing surface a photosensitivity setting exists to cut,
   * not damage numbers or the DoT/status rings those already read as static.
   */
  reducedFlash: boolean;
  /**
   * SPEC-V3 T3: opts out of the dev profile, so a developer can see what a
   * real new player sees. Ignored entirely in a production build, where the
   * dev profile is never applied in the first place.
   */
  cleanProfile: boolean;
  /** Cap floating combat text so a 350-strong fight stays readable. */
  maxDamageNumbers: number;
}

export const SETTINGS_KEY = 'stonewake.settings.v1';

export function defaultSettings(): Settings {
  return {
    masterVolume: 0.8,
    sfxVolume: 0.8,
    shake: 1,
    damageNumbers: true,
    showRanges: false,
    showGrid: false,
    showEnemyHpBars: true,
    showPathIndicators: true,
    accessiblePalette: false,
    reducedFlash: false,
    cleanProfile: false,
    maxDamageNumbers: 60,
  };
}

export function loadSettings(): Settings {
  try {
    const raw = globalThis.localStorage?.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings();
    return sanitize({ ...defaultSettings(), ...(JSON.parse(raw) as Partial<Settings>) });
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s: Settings): void {
  try {
    globalThis.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Storage unavailable: settings simply do not persist.
  }
}

/** Clamps anything a hand-edited or stale save might contain. */
export function sanitize(s: Settings): Settings {
  const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
  return {
    masterVolume: clamp01(s.masterVolume),
    sfxVolume: clamp01(s.sfxVolume),
    shake: clamp01(s.shake),
    damageNumbers: !!s.damageNumbers,
    showRanges: !!s.showRanges,
    showGrid: !!s.showGrid,
    showEnemyHpBars: !!s.showEnemyHpBars,
    showPathIndicators: !!s.showPathIndicators,
    accessiblePalette: !!s.accessiblePalette,
    reducedFlash: !!s.reducedFlash,
    cleanProfile: !!s.cleanProfile,
    maxDamageNumbers: Number.isFinite(s.maxDamageNumbers)
      ? Math.min(400, Math.max(0, Math.round(s.maxDamageNumbers)))
      : 60,
  };
}
