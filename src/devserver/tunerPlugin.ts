/**
 * p9c (§11, gate G15): the Tuner's dev-server endpoint. `apply: 'serve'` is
 * Vite's own mechanism for "this plugin does not exist during `vite build`"
 * — `configureServer` is never invoked for a production build or preview,
 * so there is no code path in a shipped bundle that could reach this file
 * at all (nothing under `src/ui` imports `src/devserver/**`; only
 * `vite.config.ts`, which itself is never bundled, does).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';

import type { Plugin } from 'vite';

import { saveTunerFile, type TunerSaveResult } from './tunerSave';

export const TUNER_SAVE_PATH = '/__tuner/save';

/** No authored `/data` file is anywhere near this; a local dev tool still shouldn't buffer an unbounded body into memory. */
export const MAX_TUNER_BODY_BYTES = 10 * 1024 * 1024;

/** Reads and JSON-parses a request body. Rejects on a body that isn't valid JSON or exceeds `MAX_TUNER_BODY_BYTES`. */
export function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;
    req.on('data', (chunk: Buffer | string) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_TUNER_BODY_BYTES) {
        reject(new Error(`request body exceeds ${MAX_TUNER_BODY_BYTES} bytes`));
        req.removeAllListeners('data');
        req.removeAllListeners('end');
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body.length > 0 ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/**
 * The middleware itself, exported separately from the plugin so a test can
 * drive it directly against mock `req`/`res` objects without spinning a
 * real Vite dev server.
 */
export function tunerSaveMiddleware(dataDir: string) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, errors: [{ path: '', message: 'method not allowed' }] });
      return;
    }
    let parsedBody: unknown;
    try {
      parsedBody = await readJsonBody(req);
    } catch (err) {
      sendJson(res, 400, { ok: false, errors: [{ path: '', message: `invalid JSON body: ${(err as Error).message}` }] });
      return;
    }
    const body = parsedBody as { key?: unknown; data?: unknown };
    if (typeof body.key !== 'string') {
      sendJson(res, 400, { ok: false, errors: [{ path: 'key', message: 'missing or non-string "key"' }] });
      return;
    }
    const result: TunerSaveResult = saveTunerFile(body.key, body.data, dataDir);
    sendJson(res, result.ok ? 200 : 400, result);
  };
}

export function tunerPlugin(dataDir: string = join(process.cwd(), 'data')): Plugin {
  return {
    name: 'stonewake-tuner',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(TUNER_SAVE_PATH, (req, res) => {
        void tunerSaveMiddleware(dataDir)(req, res);
      });
    },
  };
}
