/**
 * b036 (QA-filed while verifying b035): in the same Training Grounds scenario
 * b035 fixed for `#sw-towerinfo`, `.sw-help` (the WASD/keybind hint, last
 * element in `.sw-side`) still sat with its bottom edge at ~1096.9px against
 * the standard 1920x1080 viewport — ~17px past the fold, same "`.sw-side` has
 * no scroll of its own" root cause, on a lower-priority non-interactive panel
 * that `npm run ui-audit`'s `offscreen-interactive` rule doesn't catch since
 * `.sw-help` has no interactive controls.
 *
 * Real browser + the real dev-only `window.__stonewakeAudit` bridge, same
 * pattern as `tests/b032-tower-panel-fold.test.ts` / `b035-towerinfo-fold.
 * test.ts` — jsdom never runs layout so it can't see this bug.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createServer, type ViteDevServer } from 'vite';
import type { Browser, Page } from 'playwright';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { hasChromium, launchChromium } from './helpers/browser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const VIEWPORT = { width: 1920, height: 1080 };

async function call(page: Page, method: string, ...args: unknown[]): Promise<unknown> {
  return page.evaluate(
    ({ method, args }) => (window as unknown as Record<string, (...a: unknown[]) => unknown>).__stonewakeAudit
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (window as any).__stonewakeAudit[method](...args)
      : undefined,
    { method, args },
  );
}

describe.skipIf(!hasChromium)('b036: the WASD/keybind hint stays above the 1080px fold in Training Grounds', () => {
  let server: ViteDevServer;
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    server = await createServer({ root: ROOT, server: { port: 0, strictPort: false } });
    await server.listen();
    const address = server.httpServer?.address();
    const port = typeof address === 'object' && address ? address.port : null;
    if (!port) throw new Error('could not determine the dev server port');
    browser = await launchChromium();
    page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    await page.evaluate(() => {
      (window as unknown as { __name?: (fn: unknown) => unknown }).__name = (fn: unknown) => fn;
    });
    await page.waitForFunction(
      () => (window as unknown as { __stonewakeAudit?: { ready?: boolean } }).__stonewakeAudit?.ready === true,
      undefined,
      { timeout: 15000 },
    );
  }, 30000);

  afterAll(async () => {
    await Promise.allSettled([browser?.close(), server?.close()]);
  });

  it('.sw-help bottom edge is <= 1080 with a selected tower and the practice panel showing', async () => {
    await call(page, 'startPracticeRun', { classKey: 'engineer', core: 'stone_heart', seed: 1 });
    await page.waitForTimeout(400);
    await call(page, 'build', 1, 21, 10);
    await page.waitForTimeout(200);
    await call(page, 'callWave');
    await page.waitForTimeout(900);
    await call(page, 'selectTile', 21, 10);
    await page.waitForTimeout(200);

    const practiceVisible = await page.evaluate(() => !(document.querySelector('#sw-practice') as HTMLElement)?.hidden);
    expect(practiceVisible).toBe(true);

    const rect = await page.evaluate(() => {
      const el = document.querySelector('.sw-help');
      return el ? el.getBoundingClientRect() : null;
    });
    expect(rect).not.toBeNull();
    expect(rect!.bottom).toBeLessThanOrEqual(1080);
  }, 20000);
});
