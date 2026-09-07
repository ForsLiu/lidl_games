/**
 * fb139: the F8 hotkey's dev-server endpoint. Same `apply: 'serve'` shape as
 * `tunerPlugin.ts` — `configureServer` is never invoked for a production
 * build or preview, and nothing under `src/ui` imports `src/devserver/**`
 * (the client posts to the literal `/__bugreport/save` path, same as
 * `tuner.ts`'s `postTunerSave` does for `/__tuner/save`), so there is no
 * code path in a shipped bundle that could reach this file at all.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { platform } from 'node:os';

import type { Plugin } from 'vite';

import { saveBugReport, type BugReportInput, type BugReportSaveResult } from './bugReportSave';
import { readJsonBody } from './tunerPlugin';

export const BUG_REPORT_SAVE_PATH = '/__bugreport/save';

/**
 * A replay bundle carries a run's full input log plus a canvas screenshot —
 * routinely megabytes for a long run, unlike a `/data` file — so this gets
 * its own cap rather than inheriting `tunerPlugin.ts`'s 10 MB one.
 */
export const MAX_BUG_REPORT_BODY_BYTES = 64 * 1024 * 1024;

/**
 * Q193 (owner feedback `feature-bug-report-hotkey`): the owner's literal
 * machine path (`D:\lidl_inbox`), kept verbatim from the feedback text — but
 * only on the owner's own Windows machine. POSIX treats a backslash as an
 * ordinary filename character, so on any other host `mkdirSync` would
 * neither fail nor write where a reader expects: it creates a directory
 * literally named `D:\lidl_inbox` under `process.cwd()` (merge fold-in from
 * `claude/admiring-cray-fn7op5`'s own code-reviewer finding on this exact
 * line). Reached only by an un-injected `npm run dev`; every test injects a
 * temp directory instead, the same `dataDir`-injection shape
 * `tunerPlugin.ts` established for `data/`.
 */
export function defaultInboxDir(): string {
  return platform() === 'win32' ? 'D:\\lidl_inbox' : 'inbox';
}
export const DEFAULT_INBOX_DIR = defaultInboxDir();
export const DEFAULT_REPLAYS_DIR = 'replays';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/**
 * The middleware itself, exported separately from the plugin so a test can
 * drive it directly against mock `req`/`res` objects without spinning a real
 * Vite dev server (same shape as `tunerSaveMiddleware`).
 */
export function bugReportSaveMiddleware(inboxDir: string, replaysDir: string) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method not allowed' });
      return;
    }
    let body: unknown;
    try {
      body = await readJsonBody(req, MAX_BUG_REPORT_BODY_BYTES);
    } catch (err) {
      sendJson(res, 400, { ok: false, error: `invalid JSON body: ${(err as Error).message}` });
      return;
    }
    const result: BugReportSaveResult = saveBugReport(body as BugReportInput, inboxDir, replaysDir);
    sendJson(res, result.ok ? 200 : 400, result);
  };
}

export function bugReportPlugin(
  inboxDir: string = DEFAULT_INBOX_DIR,
  replaysDir: string = DEFAULT_REPLAYS_DIR,
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
