/**
 * Shared Playwright bootstrap for the browser-driven UI suites (b032, b034,
 * b035, b036).
 *
 * A checkout installed with `npm install --ignore-scripts` has no downloaded
 * browser, so `chromium.launch()` throws and the suite FAILS in beforeAll —
 * indistinguishable, in the run report, from a real layout regression. A
 * missing browser is a missing tool, so these suites SKIP instead.
 *
 * Resolution order:
 *  1. PLAYWRIGHT_CHROMIUM_EXECUTABLE, if set and on disk. This is the opt-in
 *     for a sandbox that ships its own Chromium (e.g. under
 *     PLAYWRIGHT_BROWSERS_PATH) at a build number the pinned Playwright does
 *     not know about. Off by default: an unpinned build is not what these
 *     assertions were measured against, and the fixed-delay waits in them are
 *     load-sensitive enough to flake under an unvetted browser.
 *  2. The build Playwright pins, i.e. what `npx playwright install chromium`
 *     puts on disk. This is the normal dev-box path.
 *  3. Nothing found -> skip.
 */
import { existsSync } from 'node:fs';
import { chromium, type Browser, type LaunchOptions } from 'playwright';
import { describe } from 'vitest';

function candidatePaths(): string[] {
  const paths: string[] = [];
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (explicit) paths.push(explicit);
  try {
    // Throws when the pinned build has no registry entry on this host.
    const bundled = chromium.executablePath();
    if (bundled) paths.push(bundled);
  } catch {
    // no pinned build installed — only an explicit override can rescue this
  }
  return paths;
}

/**
 * The Chromium binary these suites should launch, or null when the host has
 * none installed.
 */
export function resolveChromiumExecutable(): string | null {
  return candidatePaths().find((p) => existsSync(p)) ?? null;
}

export const chromiumExecutable: string | null = resolveChromiumExecutable();

/**
 * `describe` for a suite that needs a real browser: a plain describe where one
 * exists, `describe.skip` where none does.
 */
export const describeWithBrowser = chromiumExecutable ? describe : describe.skip;

/** Launch headless Chromium from whichever binary resolveChromiumExecutable found. */
export async function launchChromium(options: LaunchOptions = {}): Promise<Browser> {
  if (!chromiumExecutable) {
    throw new Error(
      'no Chromium binary found: run `npx playwright install chromium`, or set '
      + 'PLAYWRIGHT_CHROMIUM_EXECUTABLE to an existing browser',
    );
  }
  return chromium.launch({ headless: true, executablePath: chromiumExecutable, ...options });
}
