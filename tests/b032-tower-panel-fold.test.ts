/**
 * b032 (`npm run ui-audit`, `audit/report.json`): the tower-build panel's rows
 * #6-#10 sat partly or fully below the fold at the audit's standard
 * 1920x1080 viewport, in both the "mid-TD wave, selection panel open" and
 * "defeat results" scenes — `npm run ui-audit`'s `offscreen-interactive` rule
 * failed for `button.sw-tower` (e.g. row 6's bottom edge at y=1263).
 *
 * jsdom (every other HUD test's environment) never runs layout, so it cannot
 * see this bug at all — `getBoundingClientRect()` returns zeroes there. This
 * test boots the real dev server behind a headless Chromium, exactly like
 * `tools/ui-audit.ts` does, and drives the same two real scenes through the
 * same dev-only `window.__stonewakeAudit` bridge (`src/ui/audit-hook.ts`).
 * Real browser + real layout, so it fails on the pre-fix markup (row 6-10
 * bottoms past 1080) and passes once every row fits above the fold.
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

async function towerRowBottoms(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('button.sw-tower')).map((el) => el.getBoundingClientRect().bottom),
  );
}

describe('b032: the tower-build panel stays above the 1080px fold', () => {
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
    // Same tsx/esbuild keepNames shim tools/ui-audit.ts needs — see its own
    // comment for why `page.evaluate` throws `__name is not defined` without it.
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

  it('mid-TD wave, selection panel open: every tower row bottom is <= 1080', async () => {
    await call(page, 'startPracticeRun', { classKey: 'engineer', core: 'stone_heart', seed: 1 });
    await page.waitForTimeout(400);
    await call(page, 'build', 1, 8, 8);
    await page.waitForTimeout(200);
    await call(page, 'callWave');
    await page.waitForTimeout(900);
    await call(page, 'selectTile', 8, 8);
    await page.waitForTimeout(200);

    const bottoms = await towerRowBottoms(page);
    expect(bottoms.length).toBeGreaterThanOrEqual(10);
    for (const bottom of bottoms) expect(bottom).toBeLessThanOrEqual(1080);
  }, 20000);

  it('defeat results: every tower row bottom is <= 1080', async () => {
    await call(page, 'startPracticeRun', { classKey: 'engineer', core: 'stone_heart', seed: 3 });
    await page.waitForTimeout(400);
    await call(page, 'forceDefeat', 'core');
    await page.waitForTimeout(2200);

    const bottoms = await towerRowBottoms(page);
    expect(bottoms.length).toBeGreaterThanOrEqual(10);
    for (const bottom of bottoms) expect(bottom).toBeLessThanOrEqual(1080);
  }, 20000);
});
