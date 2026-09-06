/**
 * fb168 — `tools/ui-audit.ts` boots the same dev server the UI suites do.
 *
 * `tests/helpers/browser.ts` was fixed twice in fb140 for two defects that only
 * a CI runner could show: `server: { port: 0, strictPort: false }`, which Vite
 * resolves to its default 5173 so concurrent callers collide, and a defaulted
 * `server.host`, which Vite resolves to the *name* `localhost` while the caller
 * navigates to the literal `127.0.0.1`. `tools/ui-audit.ts` carried both in its
 * own `createServer` call and was not fixed, because `npm run ui-audit` is a
 * manual command with no CI job — the defect was invisible rather than absent.
 *
 * fb168 gave the two callers one implementation (`tools/dev-server.ts`). This
 * file holds that arrangement in place from both ends: a source rule that
 * `ui-audit` still routes through the helper rather than growing a second copy,
 * and a live start of the helper itself against the audit's own root, so the
 * contracts are measured on this host and not merely read out of the source.
 *
 * `tools/ui-audit.ts` cannot be imported to test directly — its last statement
 * is a bare `main().catch(...)`, so importing it would run the whole audit —
 * hence the source rule for the wiring and the live case for the behaviour.
 */
import { readFileSync } from 'node:fs';
import { Server as NetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { startDevServer, HOST } from '../tools/dev-server';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** The same root `tools/ui-audit.ts` passes: `resolve(tools/.., )`, i.e. the repo. */
const AUDIT_SOURCE = readFileSync(resolve(ROOT, 'tools/ui-audit.ts'), 'utf8');
const HELPER_SOURCE = readFileSync(resolve(ROOT, 'tools/dev-server.ts'), 'utf8');

/**
 * Source with comments removed, left-to-right, tracking string and template
 * literals so a literal cannot open a comment.
 *
 * The obvious two-regex version is what this file shipped with, and QA
 * measured it destroying the very file it was meant to scan: `'**\/bench/**'`
 * in `tools/dev-server.ts`'s watch-ignore list ends in `/**`, which
 * `/\/\*[\s\S]*?\*\//g` reads as a block-comment opener, and the strip then
 * ran to the next real `*\/` — **11 lines of live code gone**, including
 * `await server.listen()` and the bound-address check. Nothing was exploitable
 * through it (the rules that matter sat above the blanked window), but a
 * scanner that silently deletes a third of its input is one edit away from
 * being vacuous, and the file's comment claiming no such literal existed was
 * simply wrong.
 *
 * Not `blankNonCode` from `tests/equip-spec-ledger.ts`, though it solves this
 * correctly: it also blanks the *insides* of string literals, and half the
 * rules below match module specifiers (`from './dev-server'`, `from 'vite'`),
 * which are string insides. Comments out, strings intact, is what these rules
 * need. Its known blind spot — no regex-literal state — applies here too, and
 * neither scanned file contains one; the positive rules in each block go red
 * if that ever changes and eats the body.
 */
function code(src: string): string {
  let out = '';
  let mode: 'code' | 'line' | 'block' | "'" | '"' | '`' = 'code';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (mode === 'code') {
      if (ch === '/' && next === '/') { mode = 'line'; i++; continue; }
      if (ch === '/' && next === '*') { mode = 'block'; i++; continue; }
      if (ch === "'" || ch === '"' || ch === '`') mode = ch;
      out += ch;
      continue;
    }
    if (mode === 'line') {
      if (ch === '\n') { mode = 'code'; out += ch; }
      continue;
    }
    if (mode === 'block') {
      if (ch === '*' && next === '/') { mode = 'code'; i++; }
      else if (ch === '\n') out += ch;
      continue;
    }
    // inside a literal: only its own closing quote ends it, and `\` escapes.
    out += ch;
    if (ch === '\\' && next !== undefined) { out += next; i++; continue; }
    if (ch === mode) mode = 'code';
  }
  return out;
}

describe('fb168: ui-audit boots the shared dev server', () => {
  const body = code(AUDIT_SOURCE);

  it('imports startDevServer from tools/dev-server rather than building its own server', () => {
    expect(body).toMatch(/import\s*\{[^}]*\bstartDevServer\b[^}]*\}\s*from\s*'\.\/dev-server'/);
    expect(body).toMatch(/\bstartDevServer\s*\(/);
  });

  it('makes no vite createServer call of its own, under any alias', () => {
    // The whole point of the extraction: a second `createServer` here is a
    // second place for the port and host contracts to drift out of.
    //
    // Keyed on the *import specifier list* as well as the call shape, because
    // QA defeated the call-shape rule alone with
    // `import { createServer as bootVite } from 'vite'` — a rule that reads as
    // "no local Vite server" while a full one, carrying both original defects,
    // sits underneath it.
    expect(body).not.toMatch(/import\s*\{[^}]*\bcreateServer\b[^}]*\}\s*from\s*'vite'/);
    expect(body).not.toMatch(/\bcreateServer\s*\(/);
  });

  it('carries neither half of the defect it was filed for', () => {
    // `port: 0` reads as "any free port" and is not; `strictPort: false` turns
    // losing the port into a server listening somewhere the caller never looks.
    expect(body).not.toMatch(/port\s*:\s*0\b/);
    expect(body).not.toMatch(/strictPort\s*:\s*false/);
    // These two read the literal only, so `port: ANY_FREE_PORT` walks past
    // them (QA). The rule above is the load-bearing one — there is no Vite
    // server here to configure at all — and these stay as the cheap direct
    // reading of the two values the item names.
  });

  it('keeps the helper importable from a tool — no Playwright, no import back into tests/', () => {
    // The extraction's load-bearing new contract, and prose-only until now.
    // `tests/helpers/browser.ts` opens a browser at module load (a top-level
    // `await chromium.launch()` probe), so a `tools/dev-server.ts` that
    // imported it — or Playwright directly — would make `npm run ui-audit`,
    // and every other importer, launch a browser as a side effect, and would
    // hard-fail an `--ignore-scripts` checkout (QUESTIONS Q178's failure
    // mode). It would also close an import cycle, since browser.ts re-exports
    // from here.
    const helper = code(HELPER_SOURCE);
    expect(helper).not.toMatch(/from\s*'playwright'/);
    expect(helper).not.toMatch(/from\s*'\.\.\/tests\//);
    // Two negative rules alone cannot tell "clean" from "the scanner ate the
    // file" — the failure QA measured against the old stripper, which deleted
    // eleven lines of this exact file. These say the body survived the strip.
    expect(helper).toMatch(/export async function startDevServer/);
    expect(helper).toMatch(/strictPort: true/);
  });

  it('navigates the URL the helper hands back, not one it assembles from a hardcoded host', () => {
    // A `http://127.0.0.1:${port}/` built here would go stale the moment the
    // helper's own HOST changed, which is how the second fb140 red run
    // happened: the server bound one interface and the URL named another.
    expect(body).not.toMatch(/`http:\/\/127\.0\.0\.1:/);
    expect(body).toMatch(/const\s+url\s*=\s*started\.url/);
    // QA (Major 1): binding `url` proves nothing about what is *navigated*.
    // Rewriting the `goto` to `'http://localhost:' + new URL(url).port + '/'`
    // — fb140's second red run, reintroduced in this file alone — passed every
    // other rule here, and the host-independent demonstrator (`127.0.0.2`)
    // left `npm run ui-audit` failing with ERR_CONNECTION_REFUSED and no
    // report written, with all twelve tests green.
    expect(body).toMatch(/page\.goto\(\s*url\b/);
  });
});

/**
 * The behaviour, measured rather than read. Same two contracts
 * `tests/helpers-browser.test.ts` pins for the suites' import path, asserted
 * here against `tools/dev-server.ts` directly — the module `ui-audit` imports,
 * and the audit's own repo root.
 */
describe('fb168: the shared helper, started against the audit root', () => {
  it('binds the literal 127.0.0.1 on a port the OS chose, not Vite default 5173', async () => {
    const { server, url } = await startDevServer(ROOT);
    try {
      const address = server.httpServer?.address() as { address: string; port: number } | null;
      expect(server.config.server.host).toBe(HOST);
      // The other half of the pre-fix call. Without this, only `port: 0` is
      // pinned: reverting `strictPort` alone would be caught indirectly by the
      // helper's own bound-port check and by nothing that names it.
      expect(server.config.server.strictPort).toBe(true);
      expect(address).toMatchObject({ address: HOST, family: 'IPv4' });
      // Not an incidental inequality: 5173 is exactly what `port: 0` produced,
      // so this is the pre-fix value and the mutation's own signature.
      expect(address?.port).not.toBe(5173);
      expect(url).toBe(`http://${HOST}:${address?.port}/`);
      expect((await fetch(url)).status).toBe(200);
    } finally {
      await server.close();
    }
  }, 30_000);

  /**
   * QA (fb168, Major 2): the one failure path `strictPort: true` exists to
   * create was the one the helper did not clean up.
   *
   * `freePort` reserves a port, releases it, and hands the number to Vite; if
   * anything takes it in that window, `strictPort` makes `listen()` reject
   * loudly instead of letting the server bind somewhere the caller never looks.
   * That rejection escaped `startDevServer` with the `ViteDevServer` already
   * constructed — and a Vite server rooted at this repo owns ~26 chokidar
   * watchers by then. `ui-audit`'s `finally` could not help: it closes
   * `server`, which is only assigned *after* `startDevServer` returns, so on
   * this path it is still null. QA measured the consequence end to end:
   * `npx tsx tools/ui-audit.ts` **hung forever** (exit 124 under `timeout 90`),
   * because the leaked watchers hold the event loop open.
   *
   * New at fb168, not pre-existing: `ui-audit` used to pass
   * `strictPort: false`, under which a taken port is survivable and this path
   * is unreachable. The four UI suites inherit the same hazard inside a vitest
   * worker.
   *
   * Reproduced the way QA did — swallow the `freePort` probe's own `close` so
   * the reserved port is still bound when Vite reaches for it — because that is
   * the only way to lose the race deterministically. The probe is closed for
   * real in the `finally`, so the port is not leaked by this test.
   */
  it('closes the server it built when listen() loses the reserved port', async () => {
    const realClose = NetServer.prototype.close;
    const heldOpen: NetServer[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (NetServer.prototype as any).close = function (this: NetServer, cb?: (err?: Error) => void) {
      if (heldOpen.length === 0) {
        heldOpen.push(this);
        if (cb) process.nextTick(cb);
        return this;
      }
      return realClose.call(this, cb);
    };

    const watchers = (): number =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((process as any)._getActiveHandles() as unknown[]).filter(
        (h) => (h as object)?.constructor?.name === 'FSWatcher',
      ).length;
    const before = watchers();
    try {
      await expect(startDevServer(ROOT)).rejects.toThrow(/in use/i);
      // The assertion that would have caught the hang. A leaked Vite server
      // rooted here carries ~26 of these and nothing ever closes them.
      await new Promise((r) => setTimeout(r, 250));
      expect(watchers(), `${watchers()} fs watchers after the failure, ${before} before`)
        .toBeLessThanOrEqual(before);
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (NetServer.prototype as any).close = realClose;
      await Promise.all(
        heldOpen.map((srv) => new Promise<void>((res) => realClose.call(srv, () => res()))),
      );
    }
  }, 30_000);
});
