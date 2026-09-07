/**
 * fb139: the F8 hotkey's dev-server middleware, driven directly against mock
 * `req`/`res` objects — same shape as `tests/p9c-tuner-plugin.test.ts`.
 */
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BUG_REPORT_SAVE_PATH,
  bugReportPlugin,
  bugReportSaveMiddleware,
} from '../src/devserver/bugReportPlugin';
import { cfg, makeInputLog } from './helpers';

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

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

function validBody(): string {
  const config = { ...cfg({ seed: 7 }), contentHash: 'deadbeef' };
  const inputLog = makeInputLog(7, 5);
  return JSON.stringify({
    note: 'the boss teleported through a wall',
    classKey: config.classKey,
    core: 'stone_heart',
    tier: config.tier,
    wave: 3,
    phase: 'act1_build',
    tick: 123,
    seed: config.seed,
    contentHash: config.contentHash,
    endHash: 'abc123',
    recorded: { config, inputLog },
    screenshotPng: TINY_PNG_BASE64,
  });
}

describe('bugReportSaveMiddleware (fb139)', () => {
  it('rejects a non-POST method with 405', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stonewake-bugreport-'));
    const req = mockReq('GET', '');
    const res = mockRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await bugReportSaveMiddleware(join(dir, 'inbox'), join(dir, 'replays'))(req as any, res as any);
    expect(res.statusCode).toBe(405);
  });

  it('saves a valid report and answers 200 with the three file paths', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stonewake-bugreport-'));
    const inboxDir = join(dir, 'inbox');
    const replaysDir = join(dir, 'replays');
    const req = mockReq('POST', validBody());
    const res = mockRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await bugReportSaveMiddleware(inboxDir, replaysDir)(req as any, res as any);
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.ok).toBe(true);
    expect(existsSync(parsed.bugPath)).toBe(true);
    expect(existsSync(parsed.replayPath)).toBe(true);
    expect(existsSync(parsed.screenshotPath)).toBe(true);

    const md = readFileSync(parsed.bugPath, 'utf8');
    expect(md).toContain('the boss teleported through a wall');
    expect(md).toContain('abc123');
    expect(md).toContain(parsed.replayPath);
    expect(md).toContain(parsed.screenshotPath);

    const savedReplay = JSON.parse(readFileSync(parsed.replayPath, 'utf8'));
    expect(savedReplay.config.seed).toBe(7);
    expect(savedReplay.inputLog.length).toBe(5);

    const savedPng = readFileSync(parsed.screenshotPath);
    expect(savedPng.equals(Buffer.from(TINY_PNG_BASE64, 'base64'))).toBe(true);
  });

  it('answers 400 and writes nothing for a missing note', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stonewake-bugreport-'));
    const inboxDir = join(dir, 'inbox');
    const replaysDir = join(dir, 'replays');
    const body = JSON.parse(validBody());
    delete body.note;
    const req = mockReq('POST', JSON.stringify(body));
    const res = mockRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await bugReportSaveMiddleware(inboxDir, replaysDir)(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(existsSync(inboxDir)).toBe(false);
  });

  it('answers 400 for a malformed JSON body', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stonewake-bugreport-'));
    const req = mockReq('POST', '{not valid json');
    const res = mockRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await bugReportSaveMiddleware(join(dir, 'inbox'), join(dir, 'replays'))(req as any, res as any);
    expect(res.statusCode).toBe(400);
  });

  it('answers 400, not an unhandled rejection, for a literal top-level JSON null body (qa-playtester Major finding)', async () => {
    // `readJsonBody`'s own try/catch never sees this: the 4-byte string
    // "null" is valid JSON, so it resolves (not rejects) to the JS value
    // `null`. Confirmed live before the fix: `saveBugReport`'s first
    // property read (`input.note`) threw, and `bugReportPlugin.ts`'s `void
    // bugReportSaveMiddleware(...)` discarded the resulting rejected
    // promise, crashing the dev server instead of answering 400.
    const dir = mkdtempSync(join(tmpdir(), 'stonewake-bugreport-'));
    const req = mockReq('POST', 'null');
    const res = mockRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await bugReportSaveMiddleware(join(dir, 'inbox'), join(dir, 'replays'))(req as any, res as any);
    expect(res.statusCode).toBe(400);
  });

  it('answers 400 for a body over the size cap, rather than buffering it all into memory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stonewake-bugreport-'));
    const oversized = JSON.stringify({ note: 'x', pad: 'x'.repeat(65 * 1024 * 1024) });
    const req = mockReq('POST', oversized);
    const res = mockRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await bugReportSaveMiddleware(join(dir, 'inbox'), join(dir, 'replays'))(req as any, res as any);
    expect(res.statusCode).toBe(400);
  });

  it('answers 400 for a missing/empty recorded run', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stonewake-bugreport-'));
    const body = JSON.parse(validBody());
    delete body.recorded;
    const req = mockReq('POST', JSON.stringify(body));
    const res = mockRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await bugReportSaveMiddleware(join(dir, 'inbox'), join(dir, 'replays'))(req as any, res as any);
    expect(res.statusCode).toBe(400);
  });
});

describe('bugReportPlugin (fb139, "a production build containing no endpoint")', () => {
  it('is `apply: "serve"` — Vite\'s own mechanism for excluding a plugin from `vite build`', () => {
    const plugin = bugReportPlugin(join(tmpdir(), 'unused-inbox'), join(tmpdir(), 'unused-replays'));
    expect(plugin.apply).toBe('serve');
  });

  it('registers its middleware at BUG_REPORT_SAVE_PATH on the dev server', () => {
    const plugin = bugReportPlugin(join(tmpdir(), 'unused-inbox'), join(tmpdir(), 'unused-replays'));
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
    expect(registeredPath).toBe(BUG_REPORT_SAVE_PATH);
  });
});
