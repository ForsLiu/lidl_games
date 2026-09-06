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
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { startDevServer, HOST } from '../tools/dev-server';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** The same root `tools/ui-audit.ts` passes: `resolve(tools/.., )`, i.e. the repo. */
const AUDIT_SOURCE = readFileSync(resolve(ROOT, 'tools/ui-audit.ts'), 'utf8');
const HELPER_SOURCE = readFileSync(resolve(ROOT, 'tools/dev-server.ts'), 'utf8');

/**
 * Source with `//` and block comments blanked, so a rule cannot be satisfied
 * (or tripped) by prose. The strings this file's rules look for do appear in
 * `ui-audit`'s own explanatory comment above the call.
 *
 * The block-comment strip is not quote-aware, so a future `/*` inside a string
 * literal in either scanned file would blank real code and could make the
 * negative rules below vacuously green. Guarded rather than rewritten: the two
 * positive rules in the first block go red if the body is over-stripped, and
 * neither file contains such a literal today. (`blankNonCode` in `tests/equip-spec-ledger.ts` is
 * the repo's more careful scanner — worth adopting here if either file ever
 * grows one; note its own header records that it has no regex-literal state.)
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('fb168: ui-audit boots the shared dev server', () => {
  const body = code(AUDIT_SOURCE);

  it('imports startDevServer from tools/dev-server rather than building its own server', () => {
    expect(body).toMatch(/import\s*\{[^}]*\bstartDevServer\b[^}]*\}\s*from\s*'\.\/dev-server'/);
    expect(body).toMatch(/\bstartDevServer\s*\(/);
  });

  it('makes no vite createServer call of its own', () => {
    // The whole point of the extraction: a second `createServer` here is a
    // second place for the port and host contracts to drift out of.
    expect(body).not.toMatch(/\bcreateServer\s*\(/);
  });

  it('carries neither half of the defect it was filed for', () => {
    // `port: 0` reads as "any free port" and is not; `strictPort: false` turns
    // losing the port into a server listening somewhere the caller never looks.
    expect(body).not.toMatch(/port\s*:\s*0\b/);
    expect(body).not.toMatch(/strictPort\s*:\s*false/);
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
  });

  it('navigates the URL the helper hands back, not one it assembles from a hardcoded host', () => {
    // A `http://127.0.0.1:${port}/` built here would go stale the moment the
    // helper's own HOST changed, which is how the second fb140 red run
    // happened: the server bound one interface and the URL named another.
    expect(body).not.toMatch(/`http:\/\/127\.0\.0\.1:/);
    expect(body).toMatch(/const\s+url\s*=\s*started\.url/);
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
});
