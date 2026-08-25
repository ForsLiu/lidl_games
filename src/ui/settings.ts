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
    cleanProfile: !!s.cleanProfile,
    maxDamageNumbers: Number.isFinite(s.maxDamageNumbers)
      ? Math.min(400, Math.max(0, Math.round(s.maxDamageNumbers)))
      : 60,
  };
}
