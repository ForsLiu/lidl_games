/**
 * Pins tests/helpers/browser.ts, which decides whether the four browser-driven
 * UI suites (b032/b034/b035/b036) run at all. A bug here is invisible in the
 * run report — it turns UI coverage off while everything still reads green —
 * so the resolution rules get their own assertions.
 */
import { describe, it, expect } from 'vitest';

import { hasChromium, resolveOverride } from './helpers/browser';

describe('helpers/browser: Chromium resolution', () => {
  it('returns null when PLAYWRIGHT_CHROMIUM_EXECUTABLE is unset, so Playwright picks its own build', () => {
    expect(resolveOverride({})).toBeNull();
  });

  it('honours an override that exists on disk', () => {
    // This test file itself is a path guaranteed to exist.
    const real = new URL(import.meta.url).pathname;
    expect(resolveOverride({ PLAYWRIGHT_CHROMIUM_EXECUTABLE: real })).toBe(real);
  });

  it('throws on an override that does not exist rather than degrading to a silent skip', () => {
    expect(() => resolveOverride({ PLAYWRIGHT_CHROMIUM_EXECUTABLE: '/nope/not/a/browser' }))
      .toThrow(/does not exist/);
  });

  it('reports availability as a plain boolean, so `describe.skipIf` gets a usable value', () => {
    expect(typeof hasChromium).toBe('boolean');
  });
});
