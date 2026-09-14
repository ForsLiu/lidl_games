/**
 * fb093: QUALITY.md 1.0's checklist names "16:9/16:10/ultrawide safe" as its
 * own line, distinct from what fb065/fb082/fb106 already built (floating
 * rails anchored to the letterboxed canvas rect at arbitrary aspect ratios,
 * and fb106's jsdom bounds check that the letterbox math itself never
 * overshoots the container). None of that exercises the real, objective
 * `tools/ui-audit.ts` checks (`hud-overlap`, `offscreen-interactive`) at an
 * ultrawide or narrow/portrait viewport — only the standard 1920x1080 one,
 * and only via unit-level geometry math, not real composited DOM layout.
 *
 * `tools/ui-audit.ts` itself is outside this lane's Scope (`src/ui/**`,
 * `src/render/**`, `tests/ui*`, `tests/render*`, this file only) — same
 * exception fb098's own DONE note took ("the equivalent render test" branch
 * rather than editing `tools/ui-audit.ts`). This file is that branch for
 * fb093: it drives the real dev-only `window.__stonewakeAudit` bridge through
 * a real headless Chromium at 2560x1080 (ultrawide) and 1024x1280 (narrow/
 * portrait), reading real `getBoundingClientRect()` geometry, and reuses
 * `tools/audit/checks.ts`'s own `rectsOverlap`/`isOffscreen` (read-only
 * import — not editing `tools/`) so a real regression in either scene is
 * caught by the exact same arithmetic `npm run ui-audit` uses at 1920x1080.
 *
 * Same real-browser harness (`tests/helpers/browser.ts`) and
 * `window.__stonewakeAudit` driving idiom as `tests/b032-tower-panel-
 * fold.test.ts`/`b035-towerinfo-fold.test.ts`/`b036-help-fold.test.ts`.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ViteDevServer } from 'vite';
import type { Browser, Page } from 'playwright';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { hasChromium, launchChromium, startDevServer } from './helpers/browser';
import { isOffscreen, rectsOverlap, overlapArea, type Rect } from '../tools/audit/checks';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// The same selector list `tools/ui-audit.ts`'s `checkHudOverlap` compares
// pairwise, minus the same `.sw-modal` exclusion (a deliberately full-screen
// overlay, not comparable to the always-present side chrome).
const CHROME_SELECTORS = [
  '#sw-bar',
  '#sw-stats',
  '#sw-progress',
  '#sw-toast',
  '#sw-controls',
  '#sw-practice',
  '#sw-towerinfo',
  '#sw-dpsdock',
  '#sw-vsdock',
] as const;

// "critical control (bottom bar, rail handles)" per this item's own
// acceptance line.
const CRITICAL_SELECTORS = ['#sw-controls', '#sw-rail-left-handle', '#sw-rail-right-handle'] as const;

async function call(page: Page, method: string, ...args: unknown[]): Promise<unknown> {
  return page.evaluate(
    ({ method, args }) => (window as unknown as Record<string, (...a: unknown[]) => unknown>).__stonewakeAudit
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (window as any).__stonewakeAudit[method](...args)
      : undefined,
    { method, args },
  );
}

/** Mirrors `tools/ui-audit.ts`'s own `visible()`: real layout, not just presence. */
async function visibleRects(page: Page, selectors: readonly string[]): Promise<Record<string, Rect | null>> {
  return page.evaluate((sels) => {
    const out: Record<string, { x: number; y: number; w: number; h: number } | null> = {};
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) {
        out[sel] = null;
        continue;
      }
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const ok = rect.width > 0 && rect.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) !== 0;
      out[sel] = ok ? { x: rect.left, y: rect.top, w: rect.width, h: rect.height } : null;
    }
    return out;
  }, selectors);
}

describe.skipIf(!hasChromium)('fb093: ui-audit-equivalent hud-overlap/offscreen-interactive checks at ultrawide/narrow viewports', () => {
  let server: ViteDevServer;
  let browser: Browser;
  let devServerUrl: string;

  beforeAll(async () => {
    const started = await startDevServer(ROOT);
    server = started.server;
    devServerUrl = started.url;
    browser = await launchChromium();
  }, 30000);

  afterAll(async () => {
    await Promise.allSettled([browser?.close(), server?.close()]);
  });

  async function sceneAt(viewport: { width: number; height: number }): Promise<Page> {
    // beforeAll's `browser`/`devServerUrl` are shared; each `it` opens its
    // own page at its own viewport (a real resize mid-scene is not what
    // this item is measuring — a fresh page per viewport matches how a
    // player actually launches at a given screen size).
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    await page.goto(devServerUrl, { waitUntil: 'load' });
    await page.waitForFunction(
      () => (window as unknown as { __stonewakeAudit?: { ready?: boolean } }).__stonewakeAudit?.ready === true,
      undefined,
      { timeout: 15000 },
    );
    // A "busy" scene: a run with a built tower, a wave called, and a
    // selected tower (populates #sw-towerinfo/#sw-stats/#sw-progress) — the
    // same scene b035/b036 already drive. Deliberately NOT also calling
    // `toggleDpsPanel`: fb065's right rail auto-collapses (hiding
    // #sw-towerinfo/#sw-stats/#sw-progress, all inside it) whenever either
    // dock tab shows, by design — confirmed live while writing this test —
    // so opening the DPS dock here would trade one set of chrome elements
    // for another rather than adding to them.
    await call(page, 'startPracticeRun', { classKey: 'engineer', core: 'stone_heart', seed: 1 });
    await page.waitForTimeout(400);
    await call(page, 'build', 1, 21, 10);
    await page.waitForTimeout(200);
    await call(page, 'callWave');
    await page.waitForTimeout(900);
    await call(page, 'selectTile', 21, 10);
    await page.waitForTimeout(200);
    return page;
  }

  for (const [label, viewport] of [
    ['ultrawide (2560x1080)', { width: 2560, height: 1080 }],
    ['narrow/portrait (1024x1280)', { width: 1024, height: 1280 }],
  ] as const) {
    it(`${label}: zero hud-overlap failures among the chrome selectors`, async () => {
      const page = await sceneAt(viewport);
      try {
        const rects = await visibleRects(page, CHROME_SELECTORS);
        const present = CHROME_SELECTORS.filter((sel) => rects[sel] !== null);
        // Sanity: the scene mounts exactly the chrome this setup is known to
        // populate (measured live) — #sw-toast/#sw-dpsdock/#sw-vsdock stay
        // absent (transient toast, DPS dock deliberately not opened, see
        // sceneAt's own comment). An exact-set check, not just a count floor,
        // so a single piece of chrome silently failing to mount is caught
        // even if the total count would otherwise still clear a looser floor.
        expect(present).toEqual(['#sw-bar', '#sw-stats', '#sw-progress', '#sw-controls', '#sw-practice', '#sw-towerinfo']);
        const failures: string[] = [];
        for (let i = 0; i < present.length; i++) {
          for (let j = i + 1; j < present.length; j++) {
            const a = rects[present[i]]!;
            const b = rects[present[j]]!;
            if (rectsOverlap(a, b)) {
              failures.push(`${present[i]} vs ${present[j]}: overlap area ${overlapArea(a, b).toFixed(0)}px^2`);
            }
          }
        }
        expect(failures, failures.join('\n')).toEqual([]);
      } finally {
        await page.close();
      }
    }, 20000);

    it(`${label}: no critical control (bottom bar, rail handles) rendered fully offscreen`, async () => {
      const page = await sceneAt(viewport);
      try {
        const rects = await visibleRects(page, CRITICAL_SELECTORS);
        for (const sel of CRITICAL_SELECTORS) {
          const rect = rects[sel];
          expect(rect, `${sel} did not mount / was not visible`).not.toBeNull();
          const off = isOffscreen(rect!, { w: viewport.width, h: viewport.height });
          expect(off, `${sel}: rect ${JSON.stringify(rect)} vs viewport ${viewport.width}x${viewport.height}`).toBe(false);
        }
      } finally {
        await page.close();
      }
    }, 20000);
  }
});
