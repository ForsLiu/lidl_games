/**
 * Pins tests/helpers/browser.ts, which decides whether the four browser-driven
 * UI suites (b032/b034/b035/b036) run at all. A bug here is invisible in the
 * run report — it turns UI coverage off while everything still reads green —
 * so the resolution rules get their own assertions.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { hasChromium, resolveOverride, startDevServer } from './helpers/browser';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

/**
 * `startDevServer`'s two contracts, both learned from a CI run that was red
 * for one of them and then red again for the other (fb140, runs 2 and 5).
 * Neither is visible from a passing browser suite on a developer machine —
 * one needs two or more suites running concurrently, the other needs a host
 * whose `localhost` does not resolve to 127.0.0.1 — so they are asserted here
 * directly, where a regression fails on any host.
 */
describe('helpers/browser: the dev server the UI suites navigate', () => {
  it('binds the literal 127.0.0.1, not the name `localhost`', async () => {
    const { server, url } = await startDevServer(ROOT);
    try {
      const address = server.httpServer?.address();
      // A name would leave the interface to DNS order: v4 here, v6 on a
      // GitHub runner, where every suite then hit ERR_CONNECTION_REFUSED at
      // the 127.0.0.1 URL it was handed.
      expect(server.config.server.host).toBe('127.0.0.1');
      expect(address).toMatchObject({ address: '127.0.0.1', family: 'IPv4' });
      expect(url).toBe(`http://127.0.0.1:${(address as { port: number }).port}/`);
      // The contract that was actually red on the runner, and the only
      // assertion here that stays load-bearing on a host whose `localhost` is
      // already IPv4-only: the URL the helper hands out serves a page.
      expect((await fetch(url)).status).toBe(200);
    } finally {
      await server.close();
    }
  }, 30_000);

  it('gives two concurrent servers two different ports', async () => {
    // `server: { port: 0 }` reads as "any free port" and is not: Vite
    // resolves a falsy port to its default 5173, so the four suites that
    // each asked for one all asked for the same one.
    const a = await startDevServer(ROOT);
    // `b` is started inside the try: reverting the helper to `port: 0` makes
    // this second start throw EADDRINUSE under strictPort — the exact mutation
    // this test is here to catch — and `a`'s listener plus its repo-wide
    // chokidar watch would leak from a bare `const b = await ...` above it.
    let b: Awaited<ReturnType<typeof startDevServer>> | undefined;
    try {
      b = await startDevServer(ROOT);
      expect(a.url).not.toBe(b.url);
    } finally {
      await Promise.allSettled([a.server.close(), b?.server.close()]);
    }
  }, 45_000);
});
