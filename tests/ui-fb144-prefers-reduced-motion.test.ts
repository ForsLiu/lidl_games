/**
 * @vitest-environment jsdom
 *
 * fb144 (QUALITY.md 1.0's Accessibility re-check; extends fb086): fb086 added
 * the `reducedMotion` setting as opt-in, default off — so a player who had
 * ALREADY told their operating system they want reduced motion still got the
 * full ambient-motion treatment (jagged tracer jitter, the TD<->VS phase
 * sweep's horizontal travel) until they found the toggle for themselves.
 *
 * `loadSettings()` now seeds `reducedMotion` from
 * `matchMedia('(prefers-reduced-motion: reduce)')`, and ONLY on a first run —
 * i.e. only when there is no stored `stonewake.settings.v1` entry at all. Two
 * properties matter and are both pinned below:
 *
 *   1. `defaultSettings()` stays pure and environment-free. `q3-save-fuzz` and
 *      fb111's portability audit both compare against it as a deterministic
 *      baseline, so the OS query lives at the seeding site, never in the
 *      defaults. The "defaults stay pure" case runs with the OS stub actively
 *      reporting "reduce" so it cannot pass by accident.
 *   2. An explicitly stored value ALWAYS wins — including a stored `false`
 *      against an OS "reduce", which is a player who went to the Settings
 *      screen and said no.
 *
 * jsdom ships no `matchMedia`, which is why absence, a null return and a
 * throwing stub are all a plain `false` here rather than an exception: this
 * runs on `Game`'s constructor path, so a throw would take the whole boot down.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  SETTINGS_KEY,
  defaultSettings,
  loadSettings,
  prefersReducedMotion,
  saveSettings,
  type Settings,
} from '../src/ui/settings';

const QUERY = '(prefers-reduced-motion: reduce)';

/** Records every query string handed to `matchMedia`, answering `reduce` with `matches`. */
function installMatchMedia(matches: boolean): { seen: string[] } {
  const seen: string[] = [];
  (globalThis as unknown as { matchMedia: unknown }).matchMedia = (media: string) => {
    seen.push(media);
    return { media, matches: media === QUERY ? matches : false };
  };
  return { seen };
}

function removeMatchMedia(): void {
  delete (globalThis as unknown as { matchMedia?: unknown }).matchMedia;
}

describe('fb144: a first run honours the OS prefers-reduced-motion preference', () => {
  beforeEach(() => {
    localStorage.clear();
    removeMatchMedia();
  });
  afterEach(() => {
    localStorage.clear();
    removeMatchMedia();
  });

  it('seeds reducedMotion ON when the OS asks for reduce and nothing is stored', () => {
    const { seen } = installMatchMedia(true);
    const loaded = loadSettings();
    expect(loaded.reducedMotion).toBe(true);
    expect(seen).toContain(QUERY);
    // Nothing ELSE moves: this is the defaults with exactly one field seeded.
    expect(loaded).toStrictEqual({ ...defaultSettings(), reducedMotion: true });
  });

  it('leaves reducedMotion OFF when the OS expresses no preference', () => {
    installMatchMedia(false);
    expect(loadSettings()).toStrictEqual(defaultSettings());
  });

  it('keeps defaultSettings() itself pure — the OS stub is live and it still reads false', () => {
    installMatchMedia(true);
    // The baseline q3-save-fuzz and fb111's portability audit compare against.
    expect(defaultSettings().reducedMotion).toBe(false);
    expect(prefersReducedMotion()).toBe(true);
  });

  it('a stored explicit false beats an OS "reduce" — a player who said no stays no', () => {
    const stored: Settings = { ...defaultSettings(), reducedMotion: false, shake: 0.25 };
    saveSettings(stored);
    installMatchMedia(true);
    const loaded = loadSettings();
    expect(loaded.reducedMotion).toBe(false);
    expect(loaded).toStrictEqual(stored);
  });

  it('a stored explicit true survives an OS with no preference', () => {
    saveSettings({ ...defaultSettings(), reducedMotion: true });
    installMatchMedia(false);
    expect(loadSettings().reducedMotion).toBe(true);
  });

  it('never queries the OS at all once an entry is stored', () => {
    saveSettings(defaultSettings());
    const { seen } = installMatchMedia(true);
    loadSettings();
    expect(seen).toEqual([]);
  });

  it('an unparseable stored entry is still an entry, so pure defaults — not a re-seed', () => {
    localStorage.setItem(SETTINGS_KEY, '{ not json');
    installMatchMedia(true);
    expect(loadSettings()).toStrictEqual(defaultSettings());
  });

  it('is a silent no-op with no matchMedia at all — the shape every other jsdom test runs under', () => {
    expect((globalThis as unknown as { matchMedia?: unknown }).matchMedia).toBeUndefined();
    expect(prefersReducedMotion()).toBe(false);
    expect(() => loadSettings()).not.toThrow();
    expect(loadSettings()).toStrictEqual(defaultSettings());
  });

  it('survives a matchMedia returning null rather than a MediaQueryList', () => {
    (globalThis as unknown as { matchMedia: unknown }).matchMedia = () => null;
    expect(prefersReducedMotion()).toBe(false);
    expect(() => loadSettings()).not.toThrow();
    expect(loadSettings()).toStrictEqual(defaultSettings());
  });

  it('survives a matchMedia that throws, instead of taking settings loading down with it', () => {
    (globalThis as unknown as { matchMedia: unknown }).matchMedia = () => {
      throw new Error('unsupported media feature');
    };
    expect(prefersReducedMotion()).toBe(false);
    expect(() => loadSettings()).not.toThrow();
    expect(loadSettings()).toStrictEqual(defaultSettings());
  });

  it('treats unreadable storage as a first run, so the OS preference still lands', () => {
    const real = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        return {
          getItem() {
            throw new Error('storage disabled');
          },
        };
      },
    });
    try {
      installMatchMedia(true);
      expect(loadSettings().reducedMotion).toBe(true);
    } finally {
      if (real) Object.defineProperty(globalThis, 'localStorage', real);
      else delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
    }
  });
});
