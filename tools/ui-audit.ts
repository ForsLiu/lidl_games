/**
 * fb018 UI self-audit orchestrator. Boots the real dev server in-process,
 * drives the real game (via `window.__stonewakeAudit`, `src/ui/audit-hook.ts`)
 * through a fixed set of seven deterministic scenes with a headless
 * Playwright Chromium at a fixed 1920x1080 viewport, screenshots each one to
 * `/audit/*.png`, and runs the objective checks from `tools/audit/checks.ts`
 * against the *actual composited pixels* (never just declared CSS colors) and
 * real DOM geometry.
 *
 * Dev-only tooling, run via `npm run ui-audit` (`tsx tools/ui-audit.ts`) —
 * `tools/` is never imported from `src/`, so it never reaches `vite build`'s
 * `index.html` entry point or the production bundle. The bridge it drives
 * (`src/ui/audit-hook.ts`) is independently gated on `isDevBuild()`.
 *
 * Writes `audit/report.json` and exits non-zero if any check failed —
 * `audit/<scene>.png` files and `report.json` are gitignored; `audit/README.md`
 * (checked in) explains what each scene is for.
 */

import type { ViteDevServer } from 'vite';
import { chromium, type Browser, type Page } from 'playwright';
import { PNG } from 'pngjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StonewakeAuditApi } from '../src/ui/audit-hook';
import { startDevServer } from './dev-server';
import {
  CONTRAST_MIN,
  COLOR_DISTANCE_MIN,
  MIN_FONT_PX,
  colorDistance,
  contrastRatio,
  hexToRgb,
  isOffscreen,
  overlapArea,
  rectsOverlap,
  type Rect,
  type Rgb,
} from './audit/checks';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const AUDIT_DIR = resolve(ROOT, 'audit');
const VIEWPORT = { width: 1920, height: 1080 };

/* ------------------------------------------------------------ report shape */

interface CheckResult {
  rule: string;
  pass: boolean;
  detail: string;
}

interface SceneResult {
  name: string;
  screenshot: string;
  checks: CheckResult[];
}

interface Report {
  generatedAt: string;
  scenes: SceneResult[];
  paletteChecks: CheckResult[];
  summary: { total: number; passed: number; failed: number };
}

/* ------------------------------------------------------------- DOM capture */

interface TextEl {
  selector: string;
  rect: Rect;
  color: string;
  fontSize: number;
}
interface RectEl {
  selector: string;
  rect: Rect;
}
interface DomSnapshot {
  texts: TextEl[];
  interactive: RectEl[];
  chrome: RectEl[];
}

/**
 * Runs entirely inside the page (Playwright serializes this function and
 * executes it in-browser) — no closures over outer scope, everything it
 * needs is redeclared inline.
 */
function collectDomSnapshot(): DomSnapshot {
  function describe(el: Element): string {
    if (el.id) return `#${el.id}`;
    const cls =
      typeof el.className === 'string' && el.className.trim()
        ? `.${el.className.trim().split(/\s+/).join('.')}`
        : '';
    const text = (el.textContent || '').trim().slice(0, 40);
    return `${el.tagName.toLowerCase()}${cls}${text ? ` "${text}"` : ''}`;
  }
  function visible(el: Element): { ok: boolean; rect: DOMRect } {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { ok: false, rect };
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) {
      return { ok: false, rect };
    }
    return { ok: true, rect };
  }

  const texts: TextEl[] = [];
  document.querySelectorAll('body *').forEach((el) => {
    // Leaf-most elements only: an ancestor's textContent duplicates its
    // children's, and it is the innermost element whose computed color/size
    // is what actually paints the glyphs.
    if (el.children.length > 0) return;
    const text = (el.textContent || '').trim();
    if (!text) return;
    const { ok, rect } = visible(el);
    if (!ok) return;
    const cs = getComputedStyle(el);
    texts.push({
      selector: describe(el),
      rect: { x: rect.left, y: rect.top, w: rect.width, h: rect.height },
      color: cs.color,
      fontSize: parseFloat(cs.fontSize),
    });
  });

  const interactive: RectEl[] = [];
  document.querySelectorAll('button, [role="button"], input, select, a[href]').forEach((el) => {
    const { ok, rect } = visible(el);
    if (!ok) return;
    interactive.push({
      selector: describe(el),
      rect: { x: rect.left, y: rect.top, w: rect.width, h: rect.height },
    });
  });

  const chrome: RectEl[] = [];
  for (const sel of [
    '#sw-bar',
    '#sw-stats',
    '#sw-progress',
    '#sw-toast',
    '#sw-controls',
    '#sw-practice',
    '#sw-towerinfo',
    // fb065: the DPS/VS reopen tabs now share top-right-corner screen space
    // with the floating right rail's own handle (code review finding;
    // `syncRailRightVisibility` collapses the rail whenever either dock tab
    // shows precisely to avoid that overlap). Deliberately NOT adding
    // `#sw-rail-left`/`#sw-rail-right` themselves here: this check has no
    // notion of parent/child containment, and every element above already in
    // this list (`#sw-bar`, `#sw-stats`, `#sw-progress`, `#sw-towerinfo`,
    // `#sw-controls`, `#sw-practice`) is a *descendant* of one of the two
    // rails post-fb065, so adding the rails themselves would flag those as
    // "overlapping" their own container on every scene.
    '#sw-dpsdock',
    '#sw-vsdock',
  ]) {
    const el = document.querySelector(sel);
    if (!el) continue;
    // A modal-class overlay (`#sw-modal`, `#sw-charpanel`) is deliberately
    // full-screen (`position:absolute; inset:0`, style.css) — excluded here
    // per the acceptance's own instruction, not compared against the
    // always-present side-panel chrome it is meant to cover. (fb051: the DPS/
    // VS panels moved off `.sw-modal` onto the docked `.sw-dock` and are not
    // in this selector list at all, so they need no exclusion.)
    if (el.classList.contains('sw-modal')) continue;
    const { ok, rect } = visible(el);
    if (!ok) continue;
    chrome.push({ selector: sel, rect: { x: rect.left, y: rect.top, w: rect.width, h: rect.height } });
  }

  return { texts, interactive, chrome };
}

/* --------------------------------------------------------------- PNG pixel */

function samplePixel(png: PNG, x: number, y: number): Rgb {
  const cx = Math.max(0, Math.min(png.width - 1, Math.round(x)));
  const cy = Math.max(0, Math.min(png.height - 1, Math.round(y)));
  const idx = (png.width * cy + cx) << 2;
  return [png.data[idx], png.data[idx + 1], png.data[idx + 2]];
}

/** `"rgb(r, g, b)"` / `"rgba(r, g, b, a)"` (the only shapes `getComputedStyle().color` returns) to an Rgb triple. */
function parseCssColor(css: string): Rgb {
  const m = css.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (!m) throw new Error(`parseCssColor: unrecognized color "${css}"`);
  return [Math.round(Number(m[1])), Math.round(Number(m[2])), Math.round(Number(m[3]))];
}

/* ------------------------------------------------------------- scene checks */

function checkTextsAndInteractive(dom: DomSnapshot, png: PNG): CheckResult[] {
  const out: CheckResult[] = [];
  for (const t of dom.texts) {
    const fg = parseCssColor(t.color);
    // A couple of px inset from the top-left corner: inside the element's own
    // box, but above/left of where a glyph's ink typically starts once
    // line-height/ascender space is accounted for.
    const bg = samplePixel(png, t.rect.x + 2, t.rect.y + 2);
    const ratio = contrastRatio(fg, bg);
    out.push({
      rule: 'text-contrast',
      pass: ratio >= CONTRAST_MIN,
      detail: `${t.selector}: contrast ${ratio.toFixed(2)}:1 (need >= ${CONTRAST_MIN}:1), fg rgb(${fg.join(',')}) vs sampled bg rgb(${bg.join(',')})`,
    });
    out.push({
      rule: 'font-size',
      pass: t.fontSize >= MIN_FONT_PX,
      detail: `${t.selector}: ${t.fontSize}px (need >= ${MIN_FONT_PX}px)`,
    });
  }
  for (const el of dom.interactive) {
    const off = isOffscreen(el.rect, { w: VIEWPORT.width, h: VIEWPORT.height });
    out.push({
      rule: 'offscreen-interactive',
      pass: !off,
      detail: `${el.selector}: rect ${JSON.stringify(el.rect)} vs viewport ${VIEWPORT.width}x${VIEWPORT.height}`,
    });
  }
  return out;
}

function checkHudOverlap(dom: DomSnapshot): CheckResult[] {
  const out: CheckResult[] = [];
  const items = dom.chrome;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      const overlaps = rectsOverlap(a.rect, b.rect);
      const area = overlaps ? overlapArea(a.rect, b.rect) : 0;
      out.push({
        rule: 'hud-overlap',
        pass: !overlaps,
        detail: `${a.selector} vs ${b.selector}: ${overlaps ? `overlap area ${area.toFixed(0)}px^2` : 'no overlap'}`,
      });
    }
  }
  return out;
}

/* -------------------------------------------------------------- playwright */

async function getHook(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as { __stonewakeAudit?: { ready?: boolean } }).__stonewakeAudit?.ready === true,
    undefined,
    { timeout: 15000 },
  );
}

type AuditMethods = Omit<StonewakeAuditApi, 'ready'>;

async function call<K extends keyof AuditMethods>(
  page: Page,
  method: K,
  ...args: Parameters<AuditMethods[K]>
): Promise<ReturnType<AuditMethods[K]>> {
  return page.evaluate(
    ({ method, args }) => {
      const api = (window as unknown as { __stonewakeAudit: Record<string, (...a: unknown[]) => unknown> })
        .__stonewakeAudit;
      return api[method as string](...(args as unknown[]));
    },
    { method: method as string, args },
  ) as Promise<ReturnType<AuditMethods[K]>>;
}

async function settle(page: Page, ms = 350): Promise<void> {
  await page.waitForTimeout(ms);
}

async function captureScene(
  page: Page,
  name: string,
  slug: string,
  extraChecks: (dom: DomSnapshot, png: PNG) => Promise<CheckResult[]> | CheckResult[] = () => [],
): Promise<SceneResult> {
  const file = `${slug}.png`;
  const path = resolve(AUDIT_DIR, file);
  await page.screenshot({ path });
  const png = PNG.sync.read(readFileSync(path));
  // Sanity per the item's own verification step: a blank/solid frame has zero
  // pixel variance, which would mean the screenshot captured nothing real.
  const variance = pixelVariance(png);
  const dom = await page.evaluate(collectDomSnapshot);
  const checks: CheckResult[] = [
    {
      rule: 'screenshot-not-blank',
      pass: variance > 0,
      detail: `${file}: pixel variance ${variance.toFixed(2)} (0 means every sampled pixel was identical)`,
    },
    ...checkTextsAndInteractive(dom, png),
    ...checkHudOverlap(dom),
    ...(await extraChecks(dom, png)),
  ];
  return { name, screenshot: file, checks };
}

/** Cheap variance proxy over a coarse pixel grid, not every pixel — fast enough to run per scene. */
function pixelVariance(png: PNG): number {
  const samples: number[] = [];
  const stepX = Math.max(1, Math.floor(png.width / 60));
  const stepY = Math.max(1, Math.floor(png.height / 40));
  for (let y = 0; y < png.height; y += stepY) {
    for (let x = 0; x < png.width; x += stepX) {
      const [r, g, b] = samplePixel(png, x, y);
      samples.push(r + g + b);
    }
  }
  const mean = samples.reduce((a, v) => a + v, 0) / samples.length;
  return samples.reduce((a, v) => a + (v - mean) ** 2, 0) / samples.length;
}

/* ----------------------------------------------------------- palette check */

interface DamageTypesJson {
  types: { key: string; color: string; colorblindColor: string }[];
  statuses: Record<string, { color: string; colorblindColor: string }>;
  executeColor?: string;
  colorblindExecuteColor?: string;
}

function paletteColorDistanceChecks(): CheckResult[] {
  const content = JSON.parse(readFileSync(resolve(ROOT, 'data/damagetypes.json'), 'utf8')) as DamageTypesJson;
  const entries: { key: string; color: string; colorblindColor: string }[] = [
    ...content.types,
    ...Object.entries(content.statuses).map(([key, s]) => ({ key, color: s.color, colorblindColor: s.colorblindColor })),
  ];
  if (content.executeColor && content.colorblindExecuteColor) {
    entries.push({ key: 'execute', color: content.executeColor, colorblindColor: content.colorblindExecuteColor });
  }

  const out: CheckResult[] = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      for (const palette of ['color', 'colorblindColor'] as const) {
        const d = colorDistance(hexToRgb(a[palette]), hexToRgb(b[palette]));
        out.push({
          rule: `palette-color-distance:${palette}`,
          pass: d >= COLOR_DISTANCE_MIN,
          detail: `${a.key} (${a[palette]}) vs ${b.key} (${b[palette]}): distance ${d.toFixed(1)} (need >= ${COLOR_DISTANCE_MIN})`,
        });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ scenes */

async function runScenes(page: Page): Promise<SceneResult[]> {
  const scenes: SceneResult[] = [];

  // 1. Hub.
  await call(page, 'showHub');
  await settle(page, 500);
  scenes.push(await captureScene(page, 'Hub', 'hub'));

  // 2. Codex (p9b's Hub nav entry point is unbuilt — see QUESTIONS.md — so the
  // audit mounts the standalone, already-tested Codex renderer directly).
  await call(page, 'mountCodexOverlay');
  await settle(page, 200);
  scenes.push(await captureScene(page, 'Codex', 'codex'));
  await call(page, 'unmountCodexOverlay');
  await settle(page, 100);

  // 3. Mid-TD wave with the selection panel open.
  await call(page, 'startPracticeRun', { classKey: 'engineer', core: 'stone_heart', seed: 1 });
  await settle(page, 400);
  // Palisade (tower id 1) on a tile well within the Warden's build range of
  // its spawn near (23, 10) (`coreCenter().x - 3`, world.ts) — b034: (8, 8)
  // sat ~15 tiles away, so `inBuildRange` silently rejected the build every
  // run and `selectTile` below just showed the empty-selection fallback
  // instead of a real tower's info.
  await call(page, 'build', 1, 21, 10);
  await settle(page, 200);
  await call(page, 'callWave');
  await settle(page, 900); // let the wave actually spawn a few enemies before the screenshot.
  await call(page, 'selectTile', 21, 10);
  await settle(page, 200);
  scenes.push(await captureScene(page, 'Mid-TD wave, selection panel open', 'mid-td-wave-selection'));

  // 4. 350-enemy VS chaos, all 6 persistent damage-type/status effects visible.
  await call(page, 'startPracticeRun', { classKey: 'engineer', core: 'stone_heart', seed: 2 });
  await settle(page, 400);
  await call(page, 'forceVsPhase');
  await settle(page, 200);
  const spawnKeys = ['husk', 'sprinter', 'bulwark', 'spitter', 'gale_imp', 'mender', 'colossus'];
  for (const key of spawnKeys) await call(page, 'dev', 'spawn', 50, key);
  await settle(page, 700);
  await call(page, 'forceStatusShowcase');
  await settle(page, 200);
  scenes.push(
    await captureScene(page, '350-enemy VS chaos, all damage types active', 'vs-chaos', async (_dom, png) => {
      const wardenPt = await call(page, 'wardenScreenPoint');
      const bgPt = await call(page, 'worldToScreen', 1, 1); // arena corner: floor, away from where enemies converge.
      if (!wardenPt || !bgPt) {
        return [{ rule: 'warden-contrast', pass: false, detail: 'could not resolve Warden/background screen points' }];
      }
      const fg = samplePixel(png, wardenPt.x, wardenPt.y);
      const bg = samplePixel(png, bgPt.x, bgPt.y);
      const ratio = contrastRatio(fg, bg);
      return [
        {
          rule: 'warden-contrast',
          pass: ratio >= CONTRAST_MIN,
          detail: `Warden rgb(${fg.join(',')}) vs background rgb(${bg.join(',')}): contrast ${ratio.toFixed(2)}:1 (need >= ${CONTRAST_MIN}:1)`,
        },
      ];
    }),
  );

  // 5. Level-up offer screen (auto-pick stays off so the offer screen actually shows — fb012).
  await call(page, 'forceLevelUpOffer', 5000);
  await settle(page, 400);
  scenes.push(await captureScene(page, 'Level-up offer screen', 'levelup-offer'));

  // 6. Character panel. Resolve the still-open offer first (`toggleCharacterPanel`
  // refuses to open on top of an already-showing modal, by design — hud.ts).
  await call(page, 'pickOffer', 0);
  await settle(page, 300);
  await call(page, 'toggleCharacterPanel');
  await settle(page, 200);
  scenes.push(await captureScene(page, 'Character panel', 'character-panel'));
  await call(page, 'toggleCharacterPanel');
  await settle(page, 100);

  // 7. Defeat Results. A fresh TD-phase run, Core HP zeroed, then the ordinary
  // `beginDefeat`/`resolveDefeat` slow-mo beat (run.ts) runs its own course.
  await call(page, 'startPracticeRun', { classKey: 'engineer', core: 'stone_heart', seed: 3 });
  await settle(page, 400);
  await call(page, 'forceDefeat', 'core');
  await settle(page, 2200); // DEFEAT_SLOWMO (1.5s, run.ts) plus margin for the results modal to mount.
  scenes.push(await captureScene(page, 'Defeat Results', 'defeat-results'));

  return scenes;
}

/* --------------------------------------------------------------------- main */

async function main(): Promise<void> {
  mkdirSync(AUDIT_DIR, { recursive: true });
  if (!existsSync(resolve(AUDIT_DIR, 'README.md'))) {
    throw new Error('audit/README.md is missing — see fb018: one line per scene explaining what it shows.');
  }

  let server: ViteDevServer | null = null;
  let browser: Browser | null = null;
  try {
    // fb168: the shared helper, not a local `createServer`. This call used to
    // be `{ port: 0, strictPort: false }` with a hand-built `127.0.0.1` URL —
    // both halves of the defect fb140's CI runs 1 and 2 were red for, since
    // Vite resolves a falsy port to its default 5173 and defaults `host` to the
    // *name* `localhost`, which need not be the address in the URL. The suites'
    // copy was fixed there; this one was missed because `npm run ui-audit` has
    // no CI job to go red. See `tools/dev-server.ts` for both contracts.
    const started = await startDevServer(ROOT);
    server = started.server;
    const url = started.url;

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: 'load' });
    // tsx/esbuild's "keepNames" transform rewrites every named function/const
    // in this file (including ones later handed to `page.evaluate`, e.g.
    // `collectDomSnapshot`) into `const x = __name(fn, "x")`. `Function
    // .prototype.toString()` — what Playwright serializes to run a function
    // in the page — includes that inlined `__name(...)` call but not its
    // module-scope definition, so the isolated page context throws
    // `ReferenceError: __name is not defined` without this shim. A same-name,
    // same-shape no-op defined as a page global before any other evaluate
    // call fixes it without changing what any real check computes.
    await page.evaluate(() => {
      (window as unknown as { __name?: (fn: unknown) => unknown }).__name = (fn: unknown) => fn;
    });
    await getHook(page);

    const scenes = await runScenes(page);
    const paletteChecks = paletteColorDistanceChecks();

    const allChecks = [...scenes.flatMap((s) => s.checks), ...paletteChecks];
    const summary = {
      total: allChecks.length,
      passed: allChecks.filter((c) => c.pass).length,
      failed: allChecks.filter((c) => !c.pass).length,
    };
    const report: Report = { generatedAt: new Date().toISOString(), scenes, paletteChecks, summary };
    writeFileSync(resolve(AUDIT_DIR, 'report.json'), JSON.stringify(report, null, 2));

    printSummary(report);
    process.exitCode = summary.failed > 0 ? 1 : 0;
  } finally {
    // Independent settles: a failure closing the browser must not skip
    // closing the dev server (and leaking its bound port), or vice versa.
    await Promise.allSettled([browser?.close(), server?.close()]);
  }
}

function printSummary(report: Report): void {
  console.log(`\nfb018 UI self-audit — ${report.generatedAt}\n`);
  for (const scene of report.scenes) {
    const failed = scene.checks.filter((c) => !c.pass);
    const status = failed.length === 0 ? 'PASS' : `FAIL (${failed.length})`;
    console.log(`  [${status}] ${scene.name}  (${scene.screenshot}, ${scene.checks.length} checks)`);
    for (const c of failed) console.log(`      - ${c.rule}: ${c.detail}`);
  }
  const failedPalette = report.paletteChecks.filter((c) => !c.pass);
  console.log(
    `  [${failedPalette.length === 0 ? 'PASS' : `FAIL (${failedPalette.length})`}] Palette color-distance  (${report.paletteChecks.length} checks)`,
  );
  for (const c of failedPalette) console.log(`      - ${c.rule}: ${c.detail}`);
  console.log(`\n  ${report.summary.passed}/${report.summary.total} checks passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
