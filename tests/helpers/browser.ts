/**
 * Shared Playwright bootstrap for the browser-driven UI suites (b032, b034,
 * b035, b036).
 *
 * A checkout installed with `npm install --ignore-scripts` has no downloaded
 * browser, so `chromium.launch()` throws and the suite FAILS in beforeAll —
 * indistinguishable, in the run report, from a real layout regression. A
 * missing browser is a missing tool, so these suites SKIP instead.
 *
 * Availability is decided by *actually launching*, once, at module load, and
 * handing that browser to the first caller. Deliberately not by probing a
 * path: `chromium.executablePath()` reports the full-Chrome build, while
 * `launch({ headless: true })` resolves the separate `chromium-headless-shell`
 * download. Feeding the former back in as `executablePath` would take
 * Playwright's custom-binary branch and quietly run these layout assertions
 * under a different browser than the one `tools/ui-audit.ts` uses and than
 * they were measured against — and would mis-skip a host installed with
 * `npx playwright install --only-shell chromium`, which has a perfectly good
 * browser but no full-Chrome path on disk. Launching is the only check that
 * agrees with what the suites themselves do.
 *
 * Only a genuinely absent executable counts as "no browser". A browser that
 * exists but fails to start (missing system libs, sandbox denial) still
 * throws, so a real launch regression stays red.
 *
 * Escape hatches:
 *  - PLAYWRIGHT_CHROMIUM_EXECUTABLE — launch this binary instead. For a
 *    sandbox shipping its own Chromium at a build number the pinned
 *    Playwright does not know about. Off by default: these suites assert
 *    layout through fixed `waitForTimeout` delays and flake under load
 *    against an unvetted build. If it is set but not on disk, that is an
 *    operator error and throws — it never degrades to a silent skip.
 *  - STONEWAKE_REQUIRE_BROWSER=1 — turn "no browser" into a hard failure,
 *    for a CI job that must not report green on skipped UI coverage.
 */
import { existsSync } from 'node:fs';

import { chromium, type Browser, type LaunchOptions } from 'playwright';

/** Playwright's message when the download is simply not there. */
const MISSING_EXECUTABLE = /Executable doesn't exist|please run the following command to download/i;

/**
 * The explicit binary override, or null when unset. Throws when set to a path
 * that does not exist: an operator who named a browser wants that browser, and
 * silently skipping the suites would hide the typo behind a green run.
 */
export function resolveOverride(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (!explicit) return null;
  if (!existsSync(explicit)) {
    throw new Error(
      `PLAYWRIGHT_CHROMIUM_EXECUTABLE is set to '${explicit}', which does not exist. `
      + 'Point it at a real Chromium binary or unset it.',
    );
  }
  return explicit;
}

function launchOptions(options: LaunchOptions): LaunchOptions {
  const override = resolveOverride();
  // No override => no `executablePath`, so Playwright picks the headless
  // shell exactly as `chromium.launch({ headless: true })` always did.
  return { headless: true, ...(override ? { executablePath: override } : {}), ...options };
}

async function probe(): Promise<Browser | null> {
  try {
    return await chromium.launch(launchOptions({}));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!MISSING_EXECUTABLE.test(message)) throw err;
    if (process.env.STONEWAKE_REQUIRE_BROWSER === '1') {
      throw new Error(
        `STONEWAKE_REQUIRE_BROWSER=1 but no Chromium is installed.\n${message}`,
      );
    }
    console.warn(
      '[browser suites] skipping: no Chromium installed. Run '
      + '`npx playwright install chromium`, or set PLAYWRIGHT_CHROMIUM_EXECUTABLE '
      + 'to an existing binary.',
    );
    return null;
  }
}

// Top-level await: the importing suite needs a plain boolean at collection
// time for `describe.skipIf`, and the only honest answer requires a launch.
let pending: Browser | null = await probe();

/**
 * Whether this host can run the browser suites. Use it as
 * `describe.skipIf(!hasChromium)(...)` — the repo's existing skip idiom, and
 * unlike aliasing `describe.skip` it leaves no bare `describe(` for
 * tools/gate-audit.ts's liveness regex to read as live coverage.
 */
export const hasChromium: boolean = pending !== null;

/**
 * The browser for a suite's beforeAll. Hands over the one the availability
 * probe already opened, then launches fresh for any later caller (a second
 * suite sharing this module instance in the same worker, after the first
 * closed its browser in afterAll).
 */
export async function launchChromium(options: LaunchOptions = {}): Promise<Browser> {
  if (pending && Object.keys(options).length === 0) {
    const browser = pending;
    pending = null;
    return browser;
  }
  return chromium.launch(launchOptions(options));
}
