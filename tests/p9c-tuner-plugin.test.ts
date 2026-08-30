/**
 * P9 p9c, gate G15: the dev-server middleware that fronts `saveTunerFile`.
 * Driven directly against mock `req`/`res` objects (the standard way to
 * test Connect middleware without a real listening server) so the test
 * stays fast and host-independent.
 */
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TUNER_SAVE_PATH, tunerPlugin, tunerSaveMiddleware } from '../src/devserver/tunerPlugin';
import { TUNER_FILES } from '../src/sim/content';

function makeTempDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'stonewake-tuner-plugin-'));
  for (const entry of TUNER_FILES) {
    const real = join(process.cwd(), 'data', entry.fileName);
    writeFileSync(join(dir, entry.fileName), readFileSync(real, 'utf8'));
  }
  return dir;
}

interface MockReq extends EventEmitter {
  method: string;
}

function mockReq(method: string, bodyText: string): MockReq {
  const req = new EventEmitter() as MockReq;
  req.method = method;
  queueMicrotask(() => {
    if (bodyText.length > 0) req.emit('data', Buffer.from(bodyText));
    req.emit('end');
  });
  return req;
}

interface MockRes {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  setHeader(key: string, value: string): void;
  end(chunk?: string): void;
}

function mockRes(): MockRes {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(key, value) {
      this.headers[key] = value;
    },
    end(chunk) {
      if (chunk) this.body = chunk;
    },
  };
}

describe('tunerSaveMiddleware (p9c, G15)', () => {
  it('rejects a non-POST method with 405', async () => {
    const dir = makeTempDataDir();
    const req = mockReq('GET', '');
    const res = mockRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tunerSaveMiddleware(dir)(req as any, res as any);
    expect(res.statusCode).toBe(405);
  });

  it('saves valid data and answers 200', async () => {
    const dir = makeTempDataDir();
    const doc = JSON.parse(readFileSync(join(dir, 'quests.json'), 'utf8'));
    const req = mockReq('POST', JSON.stringify({ key: 'quests', data: doc }));
    const res = mockRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tunerSaveMiddleware(dir)(req as any, res as any);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
  });

  it('answers 400 with field errors for schema-invalid data, and writes nothing', async () => {
    const dir = makeTempDataDir();
    const before = readFileSync(join(dir, 'quests.json'), 'utf8');
    const req = mockReq('POST', JSON.stringify({ key: 'quests', data: { quests: 'nope' } }));
    const res = mockRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tunerSaveMiddleware(dir)(req as any, res as any);
    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.body);
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(readFileSync(join(dir, 'quests.json'), 'utf8')).toBe(before);
  });

  it('answers 400 for a malformed JSON body', async () => {
    const dir = makeTempDataDir();
    const req = mockReq('POST', '{not valid json');
    const res = mockRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tunerSaveMiddleware(dir)(req as any, res as any);
    expect(res.statusCode).toBe(400);
  });

  it('answers 400 when "key" is missing or not a string', async () => {
    const dir = makeTempDataDir();
    const req = mockReq('POST', JSON.stringify({ data: {} }));
    const res = mockRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tunerSaveMiddleware(dir)(req as any, res as any);
    expect(res.statusCode).toBe(400);
  });

  it('answers 400 for a body over the size cap, rather than buffering it all into memory (code-reviewer Minor #5)', async () => {
    const dir = makeTempDataDir();
    const oversized = JSON.stringify({ key: 'quests', data: { pad: 'x'.repeat(11 * 1024 * 1024) } });
    const req = mockReq('POST', oversized);
    const res = mockRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tunerSaveMiddleware(dir)(req as any, res as any);
    expect(res.statusCode).toBe(400);
  });
});

describe('tunerPlugin (p9c, G15: "a production build containing no endpoint")', () => {
  it('is `apply: "serve"` — Vite\'s own mechanism for excluding a plugin from `vite build`', () => {
    const plugin = tunerPlugin(join(tmpdir(), 'unused'));
    expect(plugin.apply).toBe('serve');
  });

  it('registers its middleware at TUNER_SAVE_PATH on the dev server', () => {
    const plugin = tunerPlugin(join(tmpdir(), 'unused'));
    let registeredPath: string | undefined;
    const fakeServer = {
      middlewares: {
        use(path: string) {
          registeredPath = path;
        },
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (plugin.configureServer as any)(fakeServer);
    expect(registeredPath).toBe(TUNER_SAVE_PATH);
  });
});
