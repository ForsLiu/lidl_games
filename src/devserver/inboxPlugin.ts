/**
 * fb139: the F8 bug-report hotkey's dev-server endpoint, same `apply:
 * 'serve'` shape as `tunerPlugin.ts` — never registered for `vite build`/
 * `vite preview`, so no shipped bundle has a code path that could reach
 * this file (nothing under `src/ui` imports `src/devserver/**`; only
 * `vite.config.ts` does, and that file is never bundled).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';

import type { Plugin } from 'vite';

import { readJsonBody } from './tunerPlugin';
import { saveBugReport, validateBugReportPayload, type BugReportSaveResult } from './inboxSave';

export const INBOX_REPORT_PATH = '/__inbox/report';

/** A screenshot PNG dwarfs every other field here; matches `tunerPlugin`'s own budget reasoning (a local dev tool still shouldn't buffer an unbounded body). */
export const MAX_INBOX_BODY_BYTES = 20 * 1024 * 1024;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export function inboxReportMiddleware(inboxDir: string, replaysDir: string) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, errors: ['method not allowed'] });
      return;
    }
    let parsedBody: unknown;
    try {
      parsedBody = await readJsonBody(req, MAX_INBOX_BODY_BYTES);
    } catch (err) {
      sendJson(res, 400, { ok: false, errors: [`invalid JSON body: ${(err as Error).message}`] });
      return;
    }
    const payload = validateBugReportPayload(parsedBody);
    if (Array.isArray(payload)) {
      sendJson(res, 400, { ok: false, errors: payload });
      return;
    }
    let result: BugReportSaveResult;
    try {
      result = saveBugReport(payload, inboxDir, replaysDir);
    } catch (err) {
      sendJson(res, 500, { ok: false, errors: [(err as Error).message] });
      return;
    }
    sendJson(res, result.ok ? 200 : 400, result);
  };
}

export function inboxPlugin(
  inboxDir: string = join(process.cwd(), 'feedback'),
  replaysDir: string = join(process.cwd(), 'replays'),
): Plugin {
  return {
    name: 'stonewake-inbox',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(INBOX_REPORT_PATH, (req, res) => {
        void inboxReportMiddleware(inboxDir, replaysDir)(req, res);
      });
    },
  };
}
