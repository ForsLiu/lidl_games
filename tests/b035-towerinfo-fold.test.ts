/**
 * b035 (QA-filed while verifying b034): once b034 made the "Mid-TD wave,
 * selection panel open" audit scene build a real, selectable tower,
 * `#sw-towerinfo` started rendering its real content (name, stats,
 * Upgrade/Sell buttons) instead of the empty-selection fallback — and in
 * Training Grounds (the only place a fully-populated 10-tower build bar
 * plus the practice tool panel are both on screen at once), that content
 * sits with its bottom edge at ~1311px against the standard 1920x1080
 * viewport: ~230px below the fold, unreachable since `.sw-side` has no
 * scroll of its own.
 *
 * Real browser + the real dev-only `window.__stonewakeAudit` bridge, same
 * pattern as `tests/b032-tower-panel-fold.test.ts` / `b034-mid-td-scene-
 * build-range.test.ts` — jsdom never runs layout so it can't see this bug.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createServer, type ViteDevServer } from 'vite';
import { chromium, type Browser, type Page } from 'playwright';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

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

describe('b035: the tower info panel stays above the 1080px fold in Training Grounds', () => {
  let server: ViteDevServer;
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    server = await createServer({ root: ROOT, server: { port: 0, strictPort: false } });
    await server.listen();
    const address = server.httpServer?.address();
    const port = typeof address === 'object' && address ? address.port : null;
    if (!port) throw new Error('could not determine the dev server port');
    browser = await chromium.launch({ headless: true });
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

  it('#sw-towerinfo bottom edge is <= 1080 with a selected tower and the practice panel showing', async () => {
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
      const el = document.querySelector('#sw-towerinfo');
      return el ? el.getBoundingClientRect() : null;
    });
    expect(rect).not.toBeNull();
    expect(rect!.bottom).toBeLessThanOrEqual(1080);
  }, 20000);
});
