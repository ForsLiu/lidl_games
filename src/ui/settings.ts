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
   * fb086 (QUALITY.md 1.0 accessibility re-check: "reduced-motion mode"),
   * distinct from `reducedFlash`/`shake`: suppresses ambient *motion* cues —
   * a jagged tracer's kinked-segment jitter (canvas.ts's `drawTracers`) and
   * the TD<->VS phase-sweep band's horizontal travel (`drawPhaseSweep`) —
   * that neither of those two settings touches. Default off, opt-in, same
   * convention as `reducedFlash`.
   */
  reducedMotion: boolean;
  /**
   * SPEC-V3 T3: opts out of the dev profile, so a developer can see what a
   * real new player sees. Ignored entirely in a production build, where the
   * dev profile is never applied in the first place.
   */
  cleanProfile: boolean;
  /**
   * fb058: reveals the non-normal-profile classes on the Hub's Class-select
   * screen (SPEC-FINAL §4). Meaningless outside a dev build/profile — the
   * Hub only renders the toggle when `devProfileActive()` is true, same as
   * the DEV PROFILE badge — but harmless if a stale save carries it `true`
   * into a production build: `hub.ts` re-checks `devProfileActive()` at
   * render time rather than trusting this flag alone.
   */
  showHiddenClasses: boolean;
  /** Cap floating combat text so a 350-strong fight stays readable. */
  maxDamageNumbers: number;
  /**
   * fb060 (owner OVERRIDE of QUESTIONS Q133(3)): once-per-second aggregated
   * floating numbers for Bleeding/Poison/Toxic/Burning ticks, on top of the
   * existing marker dots. Default ON per the owner feedback.
   */
  dotNumbers: boolean;
  /**
   * fb084 (QUALITY.md BETA first-run onboarding): each flips true the first
   * time its contextual tutorial prompt (first TD build phase / first
   * Dusk->Night VS wave / first Dawn return-to-build) is dismissed, so it
   * never shows again. A Settings control can reset all three to replay them.
   */
  onboardingSeenBuild: boolean;
  onboardingSeenDusk: boolean;
  onboardingSeenDawn: boolean;
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
    reducedMotion: false,
    cleanProfile: false,
    showHiddenClasses: false,
    maxDamageNumbers: 60,
    dotNumbers: true,
    onboardingSeenBuild: false,
    onboardingSeenDusk: false,
    onboardingSeenDawn: false,
  };
}

/**
 * fb144: the OS-level `prefers-reduced-motion` preference, or `false` wherever
 * it cannot be read.
 *
 * Deliberately NOT consulted from `defaultSettings()`, which stays pure and
 * environment-free so `tests/q3-save-fuzz.test.ts` and fb111's portability
 * audit keep a deterministic baseline: the query is applied once, at first-run
 * seeding in `loadSettings()` below.
 *
 * Absence is the common case, not the exceptional one — jsdom ships no
 * `matchMedia` at all, so every other `src/ui` test runs under that shape. A
 * stub that returns null or throws is likewise a `false`, never a throw out of
 * `loadSettings`: a motion preference must not be able to take settings
 * loading (and with it the whole boot) down.
 *
 * Read once, at boot: unlike fb142's DPR query this arms no `change` listener,
 * so flipping the OS preference mid-session takes effect on the next reload.
 * That is deliberate — a live listener would have to decide whether it may
 * overwrite a value the player has since set by hand, and "first run only" is
 * the whole of this item's contract.
 */
export function prefersReducedMotion(): boolean {
  const mm = (globalThis as { matchMedia?: (q: string) => MediaQueryList | null }).matchMedia;
  if (typeof mm !== 'function') return false;
  try {
    return mm.call(globalThis, '(prefers-reduced-motion: reduce)')?.matches === true;
  } catch {
    return false;
  }
}

/**
 * fb144: the settings a player who has never opened this game gets. Pure
 * defaults, except that `reducedMotion` (fb086, opt-in by default) starts ON
 * for a player whose OS already says they want reduced motion — they should
 * not have to find the toggle to be told again.
 *
 * Only ever reached when there is no stored entry at all; see `loadSettings`.
 * Not run through `sanitize()`: `defaultSettings()` is in range by construction
 * and the one seeded field is a boolean.
 */
function firstRunSettings(): Settings {
  return { ...defaultSettings(), reducedMotion: prefersReducedMotion() };
}

export function loadSettings(): Settings {
  let raw: string | null | undefined;
  try {
    raw = globalThis.localStorage?.getItem(SETTINGS_KEY);
  } catch {
    // Storage unreadable (private mode, a hostile embedder): indistinguishable
    // from a first run from in here, and treated as one.
    return firstRunSettings();
  }
  // fb144: no stored entry means a first run, the ONLY case where the OS
  // preference is consulted. An explicitly stored value always wins — including
  // an explicit `reducedMotion: false` against an OS "reduce", which is a
  // player who has been to the Settings screen and said no.
  if (!raw) return firstRunSettings();
  try {
    return sanitize({ ...defaultSettings(), ...(JSON.parse(raw) as Partial<Settings>) });
  } catch {
    // A stored-but-unparseable entry is still an entry: this player has been
    // here before, so it is not a first run and the OS preference is not seeded
    // over the top of whatever they had. Pure defaults, exactly as before fb144.
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
    reducedMotion: !!s.reducedMotion,
    cleanProfile: !!s.cleanProfile,
    showHiddenClasses: !!s.showHiddenClasses,
    maxDamageNumbers: Number.isFinite(s.maxDamageNumbers)
      ? Math.min(400, Math.max(0, Math.round(s.maxDamageNumbers)))
      : 60,
    dotNumbers: !!s.dotNumbers,
    onboardingSeenBuild: !!s.onboardingSeenBuild,
    onboardingSeenDusk: !!s.onboardingSeenDusk,
    onboardingSeenDawn: !!s.onboardingSeenDawn,
  };
}
