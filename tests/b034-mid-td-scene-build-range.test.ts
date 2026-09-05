/**
 * b034 (QA-filed while verifying b032): `tools/ui-audit.ts`'s "Mid-TD wave,
 * selection panel open" scene called `build(1, 8, 8)` without ever moving the
 * Warden from its spawn near `(23, 10)`. `inBuildRange` (`src/sim/towers.ts`)
 * rejects any build target beyond `buildRange` (4 tiles) of the Warden, so
 * the build silently failed every run (`checkBuild` returns `'out_of_range'`,
 * gold never spent) and the scene's own `selectTile(8, 8)` then showed
 * `#sw-towerinfo`'s generic "Pick a tower below..." fallback instead of a
 * real built tower's info — meaning every audit scene/test that samples this
 * scene's screenshot has been exercising the empty-selection panel, not a
 * selected tower.
 *
 * Real browser + the real dev-only `window.__stonewakeAudit` bridge, same
 * pattern as `tests/b032-tower-panel-fold.test.ts` — jsdom never runs layout
 * so it can't see this class of bug either, but this one doesn't even need
 * layout: it's a plain "did a Command get rejected" bug visible in the DOM
 * markup itself.
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

// Warden spawns at (23, 10) (`coreCenter().x - 3`, `src/sim/world.ts`) with a
// starting `buildRange` of 4 tiles (`data/towers.json`) — this tile is well
// inside that radius, unlike the scene's old (8, 8) target.
const BUILD_TX = 21;
const BUILD_TY = 10;

async function call(page: Page, method: string, ...args: unknown[]): Promise<unknown> {
  return page.evaluate(
    ({ method, args }) => (window as unknown as Record<string, (...a: unknown[]) => unknown>).__stonewakeAudit
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (window as any).__stonewakeAudit[method](...args)
      : undefined,
    { method, args },
  );
}

describe.skipIf(!hasChromium)('b034: the mid-TD-wave audit scene builds a real, selectable tower', () => {
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

  it('#sw-towerinfo shows the real built tower, not the empty-selection fallback', async () => {
    await call(page, 'startPracticeRun', { classKey: 'engineer', core: 'stone_heart', seed: 1 });
    await page.waitForTimeout(400);
    await call(page, 'build', 1, BUILD_TX, BUILD_TY);
    await page.waitForTimeout(200);
    await call(page, 'callWave');
    await page.waitForTimeout(900);
    await call(page, 'selectTile', BUILD_TX, BUILD_TY);
    await page.waitForTimeout(200);

    const html = await page.evaluate(() => document.querySelector('#sw-towerinfo')?.innerHTML ?? '');
    expect(html).not.toContain('Pick a tower below');
    expect(html).toMatch(/Level\s+1\s*\/\s*\d+/);
  }, 20000);
});
