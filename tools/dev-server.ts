/**
 * The one Vite dev server the browser-driven tooling boots: the four UI suites
 * (b032/b034/b035/b036, via `tests/helpers/browser.ts`, which re-exports this)
 * and `tools/ui-audit.ts`.
 *
 * Extracted at fb168. Both callers used to build their own `createServer` call,
 * and both carried the same two defects — the ones fb140's CI runs 1 and 2 were
 * red for. The suites' copy was fixed; `ui-audit`'s was not, and nothing would
 * have caught it, because `npm run ui-audit` is a manual command with no CI job.
 * A contract learned from a red run is worth exactly as much as the number of
 * copies that carry it, so there is now one copy.
 *
 * Deliberately free of Playwright and of any test-only import, so `tools/` can
 * use it without dragging in `tests/helpers/browser.ts`'s module-load Chromium
 * probe (a top-level `await chromium.launch()`, which would make importing this
 * from a tool open a browser as a side effect).
 */
import { createServer as createNetServer } from 'node:net';

import { createServer, type ViteDevServer } from 'vite';

/** The one interface the callers bind and navigate. */
export const HOST = '127.0.0.1';

/**
 * A Vite dev server on a port nothing else is using, plus the URL to reach it.
 *
 * **`server: { port: 0 }` does not do this.** Vite resolves a falsy port to its
 * default 5173 (verified: `createServer({ server: { port: 0 } })` then
 * `httpServer.address()` reports 5173), so every caller that asked for "any free
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
 * else while the caller navigates to the wrong place.
 *
 * **The interface has to be pinned too, not just the port.** Vite's
 * `server.host` defaults to `undefined`, which it resolves to the *name*
 * `localhost` before calling `httpServer.listen(port, host)` — and `listen`
 * binds only the first address that name resolves to. With the port collision
 * fixed but the host still defaulted, all four suites got distinct ports and
 * still reported `ERR_CONNECTION_REFUSED` at the 127.0.0.1 URL each was handed
 * (run 34048137111). Pinning the literal `127.0.0.1` and changing nothing else
 * turned the same four suites green (run 34048887457), so the interface the
 * server bound was the cause — that pair is the control, not a story.
 *
 * What is *not* measured is which address the name resolved to on the runner
 * and why: nothing read the bound address there, and Ubuntu's stock
 * `/etc/hosts` argues against the obvious "`::1 localhost` comes first"
 * explanation, since it puts 127.0.0.1 on the first line and does not list
 * `localhost` on the `::1` line at all. Where a host does publish both, the
 * order is decided by getaddrinfo's RFC 6724 sorting rather than by file
 * order, and Node's verbatim default only means Node does not re-sort the
 * result. So: the fix is established, the resolution mechanism behind it is
 * not, and this comment should not pretend otherwise.
 *
 * The server is checked two ways before the caller sees it: the bound address
 * must be the reserved one, and the URL must actually serve. The second check
 * is the one that pays for itself — a cause this helper has not thought of
 * fails here, named, in ~100 ms, instead of surfacing four suites later as an
 * anonymous refused connection inside `page.goto`.
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
      // **No HMR, and no watching the repo's scratch directories.** Both
      // callers load the page once and then measure it — the suites through
      // `getBoundingClientRect()`, `ui-audit` through composited pixels — and
      // neither ever wants a reload. Under a full `test:fast` run the suites
      // were getting them, because a Vite server rooted at the repo watches
      // every file in it and the rest of the tier writes scratch copies into
      // `bench/.tmp` constantly. The reload showed up as two different
      // failures on the CI runner and here: `page.evaluate: Execution context
      // was destroyed, most likely because of a navigation` (b034) and a panel
      // read back empty mid-reload (b035). Both suites pass in isolation, which
      // is exactly what a watcher-driven reload looks like. `ui-audit` writes
      // its own PNGs into `audit/` while its page is open, so it wants the
      // same two settings for its own reason.
      hmr: false,
      watch: { ignored: ['**/bench/**', '**/audit/**', '**/dist/**', '**/.git/**'] },
    },
  });
  // `strictPort: true` makes a lost port race reject here rather than bind
  // somewhere the caller never looks — which is the point, but the server is
  // already constructed and already owns a repo-wide chokidar watch by now, so
  // the rejection has to take it down with it. It did not, and a caller whose
  // own `finally` closes a variable assigned from this function's *return*
  // value cannot help: on this path there is no return value. Measured by
  // qa-playtester at fb168: `npx tsx tools/ui-audit.ts` hung forever (exit 124
  // under `timeout 90`), because ~26 leaked watchers hold the event loop open.
  // Pinned by tests/fb168-ui-audit-dev-server.test.ts, which reproduces the
  // race by holding the reserved port and counts the surviving watchers.
  try {
    await server.listen();
  } catch (err) {
    await server.close();
    throw err;
  }
  const address = server.httpServer?.address();
  const bound = typeof address === 'object' && address ? address : null;
  if (bound?.address !== HOST || bound.port !== port) {
    await server.close();
    throw new Error(
      `dev server bound ${bound ? `${bound.address}:${bound.port}` : String(address)}, `
      + `not the reserved ${HOST}:${port}`,
    );
  }
  const url = `http://${HOST}:${port}/`;
  await assertServes(server, url);
  return { server, url };
}

/**
 * The URL this helper hands out actually answers. Cheap (~100 ms against a
 * warm dev server) and the only check that covers causes not enumerated above:
 * whatever stops Playwright reaching the page, it stops `fetch` too, and this
 * reports it against the helper rather than against a layout assertion.
 */
async function assertServes(server: ViteDevServer, url: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    await server.close();
    const cause = (err as { cause?: { code?: string } }).cause?.code;
    throw new Error(
      `dev server started but ${url} is unreachable${cause ? ` (${cause})` : ''}: `
      + `${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) {
    await server.close();
    throw new Error(`dev server at ${url} answered ${res.status} ${res.statusText}`);
  }
}

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
