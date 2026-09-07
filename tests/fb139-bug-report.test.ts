/**
 * fb139 (§11/§12, owner feedback `feature-bug-report-hotkey`): the F8
 * bug-report hotkey's server-side write path (`inboxSave.ts`), its HTTP
 * wrapper (`inboxPlugin.ts`, mirroring `tests/p9c-tuner-plugin.test.ts`'s
 * own shape for the Tuner's identical `apply: 'serve'` pattern), and the
 * item's own literal acceptance line: "a test replays a saved bundle to the
 * recorded tick with matching hash" — reusing architecture rule 2's
 * `RecordedRun`/`replayRecorded` machinery (`src/sim/run.ts`), not a new one.
 */
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  INBOX_REPORT_PATH,
  MAX_INBOX_BODY_BYTES,
  inboxPlugin,
  inboxReportMiddleware,
} from '../src/devserver/inboxPlugin';
import { MAX_TUNER_BODY_BYTES } from '../src/devserver/tunerPlugin';
import {
  saveBugReport,
  validateBugReportPayload,
  type BugReportPayload,
} from '../src/devserver/inboxSave';
import { replayRecorded, type RecordedRun } from '../src/sim/run';
import { cfg, makeInputLog, replay } from './helpers';

function tempDirs(): { inboxDir: string; replaysDir: string } {
  const root = mkdtempSync(join(tmpdir(), 'stonewake-inbox-'));
  return { inboxDir: join(root, 'feedback'), replaysDir: join(root, 'replays') };
}

function samplePayload(over: Partial<BugReportPayload> = {}): BugReportPayload {
  return {
    note: 'tower stopped firing at wave 3',
    config: cfg({ seed: 7 }),
    wave: 3,
    phase: 'act1_wave',
    tick: 421,
    inputLog: makeInputLog(7, 421),
    ...over,
  };
}

describe('saveBugReport (fb139)', () => {
  it('writes a .md, a replay .json, and a screenshot .png, cross-referenced by path', () => {
    const { inboxDir, replaysDir } = tempDirs();
    const payload = samplePayload({ screenshotPngBase64: 'data:image/png;base64,iVBORw0KGgo=' });
    const result = saveBugReport(payload, inboxDir, replaysDir);
    expect(result.ok).toBe(true);
    expect(existsSync(result.mdPath!)).toBe(true);
    expect(existsSync(result.replayPath!)).toBe(true);
    expect(existsSync(result.screenshotPath!)).toBe(true);

    const md = readFileSync(result.mdPath!, 'utf8');
    expect(md).toContain('tower stopped firing at wave 3');
    expect(md).toContain('class: engineer');
    expect(md).toContain('tier: 1');
    expect(md).toContain('phase: act1_wave');
    expect(md).toContain('wave: 3');
    expect(md).toContain('tick: 421');
    expect(md).toContain('seed: 7');
    // Cross-referenced by a real relative path, not just named — inboxDir
    // and replaysDir are sibling temp dirs here, so `relative()` crosses up
    // a level (`../replays/...`), same as it would for two sibling
    // directories anywhere else; a real deployment with `replays/` nested
    // under the repo root next to `feedback/` gets the same shape.
    expect(md).toMatch(/replay: .*replay-\d+-[0-9a-f]{6}\.json/);
    expect(md).toMatch(/screenshot: bug-\d+-[0-9a-f]{6}\.png/);

    const screenshotBytes = readFileSync(result.screenshotPath!);
    expect(screenshotBytes.length).toBeGreaterThan(0);
  });

  it('accepts a bare (non-data-URL) base64 screenshot too', () => {
    const { inboxDir, replaysDir } = tempDirs();
    const payload = samplePayload({ screenshotPngBase64: 'iVBORw0KGgo=' });
    const result = saveBugReport(payload, inboxDir, replaysDir);
    expect(existsSync(result.screenshotPath!)).toBe(true);
    expect(readFileSync(result.screenshotPath!).length).toBeGreaterThan(0);
  });

  // qa-playtester (fb139): 40 real concurrent POSTs to the live dev server
  // produced 20 silently-overwritten pairs under the old `Date.now()`-only
  // filename — both callers got `200 ok` while one report vanished. Frozen
  // `Date.now` here reproduces the same-millisecond collision deterministically
  // rather than relying on real concurrency to hit the race.
  it('two reports saved in the same millisecond do not collide (qa-playtester repro)', () => {
    const { inboxDir, replaysDir } = tempDirs();
    const fixedNow = Date.now();
    const spy = vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
    try {
      const a = saveBugReport(samplePayload({ note: 'first' }), inboxDir, replaysDir);
      const b = saveBugReport(samplePayload({ note: 'second' }), inboxDir, replaysDir);
      expect(a.mdPath).not.toBe(b.mdPath);
      expect(readFileSync(a.mdPath!, 'utf8')).toContain('first');
      expect(readFileSync(b.mdPath!, 'utf8')).toContain('second');
    } finally {
      spy.mockRestore();
    }
  });

  it('omits the screenshot file and says "none" when no screenshot is provided', () => {
    const { inboxDir, replaysDir } = tempDirs();
    const result = saveBugReport(samplePayload(), inboxDir, replaysDir);
    expect(result.screenshotPath).toBeUndefined();
    expect(readFileSync(result.mdPath!, 'utf8')).toContain('screenshot: none');
  });

  it('the replay .json is a real RecordedRun — config + the exact input log, nothing translated', () => {
    const { inboxDir, replaysDir } = tempDirs();
    const payload = samplePayload();
    const result = saveBugReport(payload, inboxDir, replaysDir);
    const recorded = JSON.parse(readFileSync(result.replayPath!, 'utf8')) as RecordedRun;
    expect(recorded.config.seed).toBe(payload.config.seed);
    expect(recorded.inputLog.length).toBe(payload.inputLog.length);
    expect(recorded.inputLog).toEqual(payload.inputLog);
  });
});

describe('validateBugReportPayload (fb139)', () => {
  it('accepts a well-formed body', () => {
    const result = validateBugReportPayload(samplePayload());
    expect(Array.isArray(result)).toBe(false);
  });

  it('rejects a non-object body', () => {
    expect(validateBugReportPayload(null)).toEqual(expect.any(Array));
    expect(validateBugReportPayload('nope')).toEqual(expect.any(Array));
  });

  it('reports every missing field, not just the first', () => {
    const errors = validateBugReportPayload({}) as string[];
    expect(errors.length).toBeGreaterThanOrEqual(5);
    expect(errors.some((e) => e.includes('note'))).toBe(true);
    expect(errors.some((e) => e.includes('config'))).toBe(true);
    expect(errors.some((e) => e.includes('wave'))).toBe(true);
    expect(errors.some((e) => e.includes('phase'))).toBe(true);
    expect(errors.some((e) => e.includes('tick'))).toBe(true);
    expect(errors.some((e) => e.includes('inputLog'))).toBe(true);
  });

  it('rejects an empty note (nothing to report)', () => {
    const errors = validateBugReportPayload({ ...samplePayload(), note: '' }) as string[];
    expect(errors.some((e) => e.includes('note'))).toBe(true);
  });
});

/* ---------------------------------------------------------- middleware/plugin */

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

describe('inboxReportMiddleware (fb139, same shape as tunerSaveMiddleware)', () => {
  it('rejects a non-POST method with 405', async () => {
    const { inboxDir, replaysDir } = tempDirs();
    const req = mockReq('GET', '');
    const res = mockRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await inboxReportMiddleware(inboxDir, replaysDir)(req as any, res as any);
    expect(res.statusCode).toBe(405);
  });

  it('saves a valid report and answers 200 with the written paths', async () => {
    const { inboxDir, replaysDir } = tempDirs();
    const req = mockReq('POST', JSON.stringify(samplePayload()));
    const res = mockRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await inboxReportMiddleware(inboxDir, replaysDir)(req as any, res as any);
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.ok).toBe(true);
    expect(existsSync(parsed.mdPath)).toBe(true);
  });

  it('answers 400 with field errors for a malformed body, and writes nothing', async () => {
    const { inboxDir, replaysDir } = tempDirs();
    const req = mockReq('POST', JSON.stringify({ note: 'x' }));
    const res = mockRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await inboxReportMiddleware(inboxDir, replaysDir)(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(existsSync(inboxDir)).toBe(false);
  });

  it('answers 400 for a malformed JSON body', async () => {
    const { inboxDir, replaysDir } = tempDirs();
    const req = mockReq('POST', '{not valid json');
    const res = mockRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await inboxReportMiddleware(inboxDir, replaysDir)(req as any, res as any);
    expect(res.statusCode).toBe(400);
  });

  // code-reviewer (fb139): a first draft imported `readJsonBody` unmodified
  // from `tunerPlugin.ts`, which enforced its own `MAX_TUNER_BODY_BYTES` (10
  // MB) regardless of the `MAX_INBOX_BODY_BYTES` (20 MB) this file exports
  // and documents — a screenshot plus a long run's input log can plausibly
  // land between the two, so the gap was live, not theoretical. Fixed by
  // giving `readJsonBody` a `maxBytes` parameter; this pins the real,
  // now-enforced limit rather than the one that used to silently apply.
  it('accepts a body between the Tuner\'s 10 MB cap and the inbox\'s own 20 MB cap', async () => {
    expect(MAX_INBOX_BODY_BYTES).toBeGreaterThan(MAX_TUNER_BODY_BYTES);
    const { inboxDir, replaysDir } = tempDirs();
    const padded = samplePayload({ note: 'x'.repeat(MAX_TUNER_BODY_BYTES + 1024) });
    const req = mockReq('POST', JSON.stringify(padded));
    const res = mockRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await inboxReportMiddleware(inboxDir, replaysDir)(req as any, res as any);
    expect(res.statusCode).toBe(200);
  });

  it('answers 400 for a body over the inbox\'s own (larger) size cap', async () => {
    const { inboxDir, replaysDir } = tempDirs();
    const oversized = samplePayload({ note: 'x'.repeat(MAX_INBOX_BODY_BYTES + 1024) });
    const req = mockReq('POST', JSON.stringify(oversized));
    const res = mockRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await inboxReportMiddleware(inboxDir, replaysDir)(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).errors[0]).toContain(String(MAX_INBOX_BODY_BYTES));
  });
});

describe('inboxPlugin (fb139, "a production build containing no endpoint")', () => {
  it('is `apply: "serve"` — excluded from `vite build`, same as tunerPlugin', () => {
    const plugin = inboxPlugin(join(tmpdir(), 'unused-inbox'), join(tmpdir(), 'unused-replays'));
    expect(plugin.apply).toBe('serve');
  });

  it('registers its middleware at INBOX_REPORT_PATH on the dev server', () => {
    const plugin = inboxPlugin(join(tmpdir(), 'unused-inbox'), join(tmpdir(), 'unused-replays'));
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
    expect(registeredPath).toBe(INBOX_REPORT_PATH);
  });
});

/* --------------------------------------------------------------- the replay */

describe('fb139 acceptance: a saved bundle replays to the recorded tick with matching hash', () => {
  it('a bug-report replay file, loaded back and replayed, reproduces the original run exactly', () => {
    const { inboxDir, replaysDir } = tempDirs();
    const seed = 11;
    const ticks = 900;
    const config = cfg({ seed, classKey: 'engineer' });
    const log = makeInputLog(seed, ticks);

    // Record: the same "play a run" step this file's other tests script
    // by hand, standing in for a real play session filling `Game.inputLog`.
    const original = replay(config, log);

    // Report: exactly what `Game.debugSnapshot()` -> `handleBugReportHotkey`
    // -> `postBugReport` would send, at the tick the F8 press caught it.
    const result = saveBugReport(
      {
        note: 'replay-matching-hash check',
        config, // World's constructor already stamped contentHash onto this object in place
        wave: original.wavesCleared,
        phase: 'act1_wave',
        tick: ticks,
        inputLog: log,
      },
      inboxDir,
      replaysDir,
    );
    expect(result.ok).toBe(true);

    // Replay: load the file back exactly as a future session would (no
    // access to `original`/`config`/`log` from here on but the file itself).
    const recorded = JSON.parse(readFileSync(result.replayPath!, 'utf8')) as RecordedRun;
    const replayed = replayRecorded(recorded, { ...recorded.config });

    expect(replayed.ticks).toBe(original.ticks);
    expect(replayed.wavesCleared).toBe(original.wavesCleared);
    expect(replayed.outcome).toBe(original.outcome);
    expect(replayed.endHash).toBe(original.endHash);
  });

  it('a mid-run report (fewer ticks than a full run) still replays to that exact tick', () => {
    // The item's own text: "replays to the recorded tick," not necessarily
    // to the run's end — an F8 press mid-run reports an in-progress tick.
    const { inboxDir, replaysDir } = tempDirs();
    const seed = 3;
    const midTick = 500;
    const config = cfg({ seed, classKey: 'engineer' });
    const fullLog = makeInputLog(seed, 2000);
    const midLog = fullLog.slice(0, midTick);

    const originalAtMid = replay(config, midLog);
    const result = saveBugReport(
      { note: 'mid-run', config, wave: originalAtMid.wavesCleared, phase: 'act1_wave', tick: midTick, inputLog: midLog },
      inboxDir,
      replaysDir,
    );
    const recorded = JSON.parse(readFileSync(result.replayPath!, 'utf8')) as RecordedRun;
    const replayed = replayRecorded(recorded, { ...recorded.config });

    expect(replayed.ticks).toBe(originalAtMid.ticks);
    expect(replayed.endHash).toBe(originalAtMid.endHash);
    // And it genuinely stopped mid-run, not by coincidentally finishing early.
    expect(replayed.ticks).toBeLessThan(2000);
  });
});

/* ------------------------------------------------------- client-side hotkey */

describe('handleBugReportHotkey (fb139): the snapshot is frozen at press-time', () => {
  // qa-playtester's live repro: `Game.debugSnapshot()`'s `inputLog` used to
  // be a *reference* into the live, still-growing array — the async
  // screenshot-capture gap this function awaits let the real game loop push
  // more ticks in before the bundle was actually serialized, so the sent
  // report silently disagreed with its own `tick:` field. Fixed by copying
  // in two places (`Game.debugSnapshot()` and here, defense in depth since
  // this module doesn't control every caller) — this test proves the copy
  // here specifically: a snapshot's `inputLog` mutated *after* `getSnapshot`
  // returns must not appear in what gets sent.
  it('a live inputLog array mutated during the async screenshot-capture gap does not leak into the sent bundle', async () => {
    const { handleBugReportHotkey } = await import('../src/ui/bugreport');
    const liveInputLog = [makeInputLog(1, 1)[0], makeInputLog(1, 1)[0]];
    const snapshot = { config: cfg({ seed: 1 }), wave: 1, phase: 'act1_wave', tick: 2, inputLog: liveInputLog };
    let sentBody: string | undefined;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      sentBody = init?.body as string;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    // A fake canvas whose `toBlob` mutates the *live* array — exactly the
    // real bug's shape: the game loop kept pushing into `Game.inputLog`
    // (the same reference `debugSnapshot()` used to hand out unsliced)
    // during the real `canvas.toBlob` round-trip this function `await`s.
    const fakeCanvas = {
      toBlob(cb: (blob: Blob | null) => void) {
        liveInputLog.push(makeInputLog(1, 1)[0]);
        queueMicrotask(() => cb(null)); // null blob -> captureScreenshotBase64 resolves undefined, no FileReader needed
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    try {
      await handleBugReportHotkey({
        devMode: true,
        getSnapshot: () => snapshot,
        getCanvas: () => fakeCanvas,
        promptNote: () => 'note',
      });
      expect(sentBody).toBeDefined();
      const sent = JSON.parse(sentBody!);
      // The bundle sent reflects the 2-entry array as it was when F8 was
      // pressed, not the 3-entry array `liveInputLog` grew to during the
      // screenshot round-trip.
      expect(sent.inputLog).toHaveLength(2);
      expect(liveInputLog).toHaveLength(3);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('does nothing when there is no snapshot (Hub, no run) — no fetch, no prompt', async () => {
    const { handleBugReportHotkey } = await import('../src/ui/bugreport');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const promptSpy = vi.fn(() => 'note');
    await handleBugReportHotkey({
      devMode: true,
      getSnapshot: () => null,
      getCanvas: () => null,
      promptNote: promptSpy,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(promptSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('does nothing when the note prompt is cancelled or empty', async () => {
    const { handleBugReportHotkey } = await import('../src/ui/bugreport');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const snapshot = { config: cfg({ seed: 1 }), wave: 1, phase: 'act1_wave', tick: 2, inputLog: [] };
    for (const note of [null, '', '   ']) {
      await handleBugReportHotkey({
        devMode: true,
        getSnapshot: () => snapshot,
        getCanvas: () => null,
        promptNote: () => note,
      });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
