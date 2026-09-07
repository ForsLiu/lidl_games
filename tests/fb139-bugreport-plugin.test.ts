/**
 * fb139: the dev-server middleware that fronts `saveBugReport`. Driven
 * directly against mock `req`/`res` objects, the same shape
 * `tests/p9c-tuner-plugin.test.ts` uses for `tunerSaveMiddleware`.
 */
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { BUG_REPORT_SAVE_PATH, bugReportPlugin, bugReportSaveMiddleware, defaultInboxDir } from '../src/devserver/bugReportPlugin';

const dirs: string[] = [];
function scratchDir(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `stonewake-bugreport-plugin-${name}-`));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

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

const VALID_BODY = {
  note: 'the mortar stopped firing after upgrade 3',
  meta: {
    classKey: 'engineer',
    core: 'stone_heart',
    tier: 1,
    phase: 'act1_wave',
    wavesCleared: 4,
    tick: 1234,
    seed: 7,
    contentHash: 'abc123',
  },
  config: { seed: 7, classKey: 'engineer', tier: 1 },
  inputLog: [{ dashQueued: false }],
};

describe('bugReportSaveMiddleware (fb139)', () => {
  it('rejects a non-POST method with 405', async () => {
    const inbox = scratchDir('inbox');
    const replays = scratchDir('replays');
    const req = mockReq('GET', '');
    const res = mockRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await bugReportSaveMiddleware(inbox, replays)(req as any, res as any);
    expect(res.statusCode).toBe(405);
  });

  it('saves a valid report and answers 200 with both file paths', async () => {
    const inbox = scratchDir('inbox');
    const replays = scratchDir('replays');
    const req = mockReq('POST', JSON.stringify(VALID_BODY));
    const res = mockRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await bugReportSaveMiddleware(inbox, replays)(req as any, res as any);
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.ok).toBe(true);
    expect(existsSync(parsed.mdPath)).toBe(true);
    expect(existsSync(parsed.replayPath)).toBe(true);
  });

  it('answers 400 with field errors for an invalid body, and writes nothing', async () => {
    const inbox = scratchDir('inbox');
    const replays = scratchDir('replays');
    const req = mockReq('POST', JSON.stringify({ ...VALID_BODY, note: '' }));
    const res = mockRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await bugReportSaveMiddleware(inbox, replays)(req as any, res as any);
    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.body);
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.length).toBeGreaterThan(0);
  });

  it('answers 400 for a malformed JSON body', async () => {
    const inbox = scratchDir('inbox');
    const replays = scratchDir('replays');
    const req = mockReq('POST', '{not valid json');
    const res = mockRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await bugReportSaveMiddleware(inbox, replays)(req as any, res as any);
    expect(res.statusCode).toBe(400);
  });

  // code-reviewer finding: `saveBugReport` throwing (e.g. a body that passes
  // the shape check but contains a value `JSON.stringify` refuses, like a
  // BigInt) used to become an unhandled rejection inside the middleware
  // rather than a clean 400.
  it('answers 400, not an unhandled rejection, when saveBugReport throws', async () => {
    const inbox = scratchDir('inbox');
    const replays = scratchDir('replays');
    const bugReportSaveModule = await import('../src/devserver/bugReportSave');
    const spy = vi.spyOn(bugReportSaveModule, 'saveBugReport').mockImplementation(() => {
      throw new TypeError('Do not know how to serialize a BigInt');
    });
    try {
      const req = mockReq('POST', JSON.stringify(VALID_BODY));
      const res = mockRes();
      await bugReportSaveMiddleware(inbox, replays)(req as never, res as never);
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).ok).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('defaultInboxDir (fb139, code-reviewer finding)', () => {
  it('never resolves to the literal Windows path on a non-Windows platform', () => {
    // The real regression: `bugReportPlugin()`'s old default was the bare
    // string `'D:\\lidl_inbox'` on every platform. POSIX treats a backslash
    // as an ordinary filename character, so on this (non-win32) host that
    // silently created a bogus directory literally named `D:\lidl_inbox`
    // under `process.cwd()` instead of failing loudly or writing somewhere
    // sane. `process.platform` on the host actually running this test suite
    // is the real, load-bearing input here, not a mock — the point is what
    // this function resolves to on the platform this repo actually runs on.
    if (process.platform === 'win32') return;
    expect(defaultInboxDir()).not.toBe('D:\\lidl_inbox');
    expect(defaultInboxDir()).not.toContain('\\');
  });
});

describe('bugReportPlugin (fb139, same shape as tunerPlugin\'s "excluded from vite build")', () => {
  it('is `apply: "serve"`', () => {
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
