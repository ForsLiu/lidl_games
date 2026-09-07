/**
 * fb139: the in-run bug-report hotkey's dev-server endpoint. Same `apply:
 * 'serve'` shape `tunerPlugin.ts` uses — Vite's own mechanism for "this
 * plugin does not exist during `vite build`" — so a shipped bundle has no
 * code path that could reach this file at all.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { platform } from 'node:os';
import { join } from 'node:path';

import type { Plugin } from 'vite';

import { saveBugReport, type BugReportSaveResult } from './bugReportSave';
import { readJsonBody } from './tunerPlugin';

export const BUG_REPORT_SAVE_PATH = '/__bugreport/save';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/**
 * The middleware itself, exported separately so a test can drive it directly
 * against mock `req`/`res` objects without spinning a real Vite dev server —
 * the same split `tunerSaveMiddleware` uses.
 */
export function bugReportSaveMiddleware(inboxDir: string, replaysDir: string) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, errors: [{ path: '', message: 'method not allowed' }] });
      return;
    }
    let parsedBody: unknown;
    try {
      // Reuses the Tuner save's own body-size cap (`readJsonBody`,
      // `tunerPlugin.ts`) — 10 MB comfortably covers one base64-encoded
      // screenshot PNG plus a run's input log, and this is dev-only tooling
      // rather than a path worth a second cap to maintain.
      parsedBody = await readJsonBody(req);
    } catch (err) {
      sendJson(res, 400, { ok: false, errors: [{ path: '', message: `invalid JSON body: ${(err as Error).message}` }] });
      return;
    }
    let result: BugReportSaveResult;
    try {
      result = saveBugReport(parsedBody, inboxDir, replaysDir);
    } catch (err) {
      // code-reviewer finding: `config`/`inputLog` are only shape-checked,
      // not schema-validated (real callers only ever send the sim's own
      // `RunConfig`, so full validation is out of scope for a dev-only
      // tool) — this catches the resulting edge, a body that passes the
      // shape check but throws inside `JSON.stringify` (e.g. a circular
      // value from a hand-rolled request), as a clean 400 instead of an
      // unhandled rejection.
      sendJson(res, 400, { ok: false, errors: [{ path: '', message: (err as Error).message }] });
      return;
    }
    sendJson(res, result.ok ? 200 : 400, result);
  };
}

/**
 * The owner's own inbox lives at a fixed path on their Windows dev machine
 * (`feature-bug-report-hotkey`'s own text). Defaulting to that literal
 * string on every platform would be silently wrong anywhere else (POSIX
 * treats a backslash as an ordinary filename character, so `mkdirSync`
 * neither fails nor writes where a reader would expect — it creates a
 * bogus directory literally named `D:\lidl_inbox` under `process.cwd()`,
 * found by code-reviewer testing this repo's own Linux host) — so the
 * literal path is used only where it means what it says.
 */
export function defaultInboxDir(): string {
  return platform() === 'win32' ? 'D:\\lidl_inbox' : join(process.cwd(), 'inbox');
}

export function bugReportPlugin(
  inboxDir: string = defaultInboxDir(),
  replaysDir: string = join(process.cwd(), 'replays'),
): Plugin {
  return {
    name: 'stonewake-bug-report',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(BUG_REPORT_SAVE_PATH, (req, res) => {
        void bugReportSaveMiddleware(inboxDir, replaysDir)(req, res);
      });
    },
  };
}
