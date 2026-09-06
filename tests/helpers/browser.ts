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
import { createServer as createNetServer } from 'node:net';

import { chromium, type Browser, type LaunchOptions } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';

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

/**
 * A Vite dev server on a port nothing else is using, plus the URL to reach it.
 *
 * **`server: { port: 0 }` does not do this.** Vite resolves a falsy port to its
 * default 5173 (verified: `createServer({ server: { port: 0 } })` then
 * `httpServer.address()` reports 5173), so every suite that asked for "any free
 * port" was in fact asking for the same one. Locally that is harmless — the
 * suites finish in seconds and rarely overlap — but on a CI runner, where they
 * share two worker threads with 250 other files, all four raced for 5173 and
 * `page.goto` reported `ERR_CONNECTION_REFUSED at http://127.0.0.1:5173/`
 * (fb140's first CI run, four suites, one cause).
 *
 * So the port is taken from the OS the only way that is actually exclusive:
 * bind a throwaway listener on 0, read the port the kernel picked, release it,
 * and hand that concrete number to Vite with `strictPort: true`. The
 * bind-release-rebind window is tiny, and `strictPort` turns losing that race
 * into a loud startup error rather than a server quietly listening somewhere
 * else while the test navigates to the wrong place.
 *
 * **The interface has to be pinned too, not just the port.** Vite's default
 * `server.host` is the *name* `localhost`, which Node resolves in DNS order
 * without reordering (`--dns-result-order=verbatim`, the default since Node
 * 17). This container's `localhost` has one A record, 127.0.0.1, so the
 * server lands exactly where the suites navigate; a GitHub runner's
 * `/etc/hosts` lists `::1 localhost` first, so Vite bound IPv6-only and every
 * suite reported `ERR_CONNECTION_REFUSED at http://127.0.0.1:<its own port>/`
 * — distinct ports, so plainly not the 5173 collision above, and invisible on
 * any host whose `localhost` is v4. Binding the literal `127.0.0.1` removes
 * the name resolution from the question entirely, and the address is checked
 * on the way out so a future mismatch fails at startup naming both ends
 * instead of surfacing as a refused connection in `page.goto`.
 */
export async function startDevServer(root: string): Promise<{ server: ViteDevServer; url: string }> {
  const port = await freePort();
  const server = await createServer({
    root,
    server: {
      // The literal address, never the name `localhost` — see above.
      host: HOST,
      port,
      strictPort: true,
      // **No HMR, and no watching the repo's scratch directories.** These are
      // layout suites: they load the page once, drive it through the
      // `__stonewakeAudit` bridge and measure `getBoundingClientRect()`. They
      // never want a reload — and under a full `test:fast` run they were
      // getting them, because a Vite server rooted at the repo watches every
      // file in it and the rest of the tier writes scratch copies into
      // `bench/.tmp` constantly. The reload showed up as two different
      // failures on the CI runner and here: `page.evaluate: Execution context
      // was destroyed, most likely because of a navigation` (b034) and a panel
      // read back empty mid-reload (b035). Both suites pass in isolation, which
      // is exactly what a watcher-driven reload looks like.
      hmr: false,
      watch: { ignored: ['**/bench/**', '**/audit/**', '**/dist/**', '**/.git/**'] },
    },
  });
  await server.listen();
  const address = server.httpServer?.address();
  const bound = typeof address === 'object' && address ? address : null;
  if (bound?.address !== HOST || bound.port !== port) {
    await server.close();
    throw new Error(
      `dev server bound ${bound ? `${bound.address}:${bound.port}` : String(address)}, `
      + `not the reserved ${HOST}:${port}`,
    );
  }
  return { server, url: `http://${HOST}:${port}/` };
}

/** The one interface these suites bind and navigate. */
const HOST = '127.0.0.1';

/** The port the kernel hands out for `0` on {@link HOST}, released immediately. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, HOST, () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : null;
      probe.close(() => (port ? resolve(port) : reject(new Error('no port from the OS'))));
    });
  });
}
