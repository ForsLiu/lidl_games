/**
 * fb139: `saveBugReport`'s write path, driven directly against a scratch
 * directory pair (inbox + replays) so nothing here ever touches a real
 * inbox. Mirrors `tunerSave.ts`'s own test shape: validate-everything-before-
 * writing-anything, one case per rejected field.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { saveBugReport } from '../src/devserver/bugReportSave';

const dirs: string[] = [];
function scratchDir(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `stonewake-bugreport-${name}-`));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const VALID_META = {
  classKey: 'engineer',
  core: 'stone_heart',
  tier: 1,
  phase: 'act1_wave',
  wavesCleared: 4,
  tick: 1234,
  seed: 7,
  contentHash: 'abc123',
};

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    note: 'the mortar stopped firing after upgrade 3',
    meta: VALID_META,
    config: { seed: 7, classKey: 'engineer', tier: 1 },
    inputLog: [{ dashQueued: false }, { dashQueued: true }],
    ...overrides,
  };
}

describe('saveBugReport (fb139)', () => {
  it('writes the .md index and the replay bundle on a valid body, and reports both paths', () => {
    const inbox = scratchDir('inbox');
    const replays = scratchDir('replays');
    const result = saveBugReport(validBody(), inbox, replays);
    expect(result.ok).toBe(true);
    expect(result.mdPath).toBeDefined();
    expect(result.replayPath).toBeDefined();
    expect(result.screenshotPath).toBeUndefined();
    expect(existsSync(result.mdPath!)).toBe(true);
    expect(existsSync(result.replayPath!)).toBe(true);

    const md = readFileSync(result.mdPath!, 'utf8');
    expect(md).toContain('the mortar stopped firing after upgrade 3');
    expect(md).toContain('engineer');
    expect(md).toContain('stone_heart');
    expect(md).toContain('1234');
    expect(md).toContain(result.replayPath!);

    // The replay bundle is a `RecordedRun`-shaped fixture — the same
    // `{ config, inputLog }` pair architecture rule 2's replay/hash
    // machinery reads — not a bespoke shape only this feature understands.
    const bundle = JSON.parse(readFileSync(result.replayPath!, 'utf8'));
    expect(bundle.config).toEqual({ seed: 7, classKey: 'engineer', tier: 1 });
    expect(bundle.inputLog).toEqual([{ dashQueued: false }, { dashQueued: true }]);
  });

  it('also writes and references a screenshot when screenshotBase64 is present', () => {
    const inbox = scratchDir('inbox');
    const replays = scratchDir('replays');
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes, not a real image
    const result = saveBugReport(validBody({ screenshotBase64: png.toString('base64') }), inbox, replays);
    expect(result.ok).toBe(true);
    expect(result.screenshotPath).toBeDefined();
    expect(existsSync(result.screenshotPath!)).toBe(true);
    expect(readFileSync(result.screenshotPath!)).toEqual(png);
    expect(readFileSync(result.mdPath!, 'utf8')).toContain(result.screenshotPath!);
  });

  it('rejects and writes nothing when note is missing/empty', () => {
    const inbox = scratchDir('inbox');
    const replays = scratchDir('replays');
    const result = saveBugReport(validBody({ note: '' }), inbox, replays);
    expect(result.ok).toBe(false);
    expect(result.errors?.some((e) => e.path === 'note')).toBe(true);
    expect(readdirSync(inbox)).toEqual([]);
    expect(readdirSync(replays)).toEqual([]);
  });

  it('rejects a note over the length cap', () => {
    const inbox = scratchDir('inbox');
    const replays = scratchDir('replays');
    const result = saveBugReport(validBody({ note: 'x'.repeat(2001) }), inbox, replays);
    expect(result.ok).toBe(false);
    expect(result.errors?.some((e) => e.path === 'note')).toBe(true);
  });

  it('rejects a meta missing a required field, naming it', () => {
    const inbox = scratchDir('inbox');
    const replays = scratchDir('replays');
    const { classKey: _classKey, ...metaWithoutClass } = VALID_META;
    const result = saveBugReport(validBody({ meta: metaWithoutClass }), inbox, replays);
    expect(result.ok).toBe(false);
    expect(result.errors?.some((e) => e.path === 'meta.classKey')).toBe(true);
  });

  it('rejects a non-array inputLog', () => {
    const inbox = scratchDir('inbox');
    const replays = scratchDir('replays');
    const result = saveBugReport(validBody({ inputLog: 'nope' }), inbox, replays);
    expect(result.ok).toBe(false);
    expect(result.errors?.some((e) => e.path === 'inputLog')).toBe(true);
  });

  it('rejects a missing config', () => {
    const inbox = scratchDir('inbox');
    const replays = scratchDir('replays');
    const result = saveBugReport(validBody({ config: undefined }), inbox, replays);
    expect(result.ok).toBe(false);
    expect(result.errors?.some((e) => e.path === 'config')).toBe(true);
  });

  it('rejects invalid base64 in screenshotBase64 without writing a report', () => {
    const inbox = scratchDir('inbox');
    const replays = scratchDir('replays');
    const result = saveBugReport(validBody({ screenshotBase64: '' }), inbox, replays);
    expect(result.ok).toBe(false);
    expect(result.errors?.some((e) => e.path === 'screenshotBase64')).toBe(true);
  });

  it('rejects a non-object body outright', () => {
    const inbox = scratchDir('inbox');
    const replays = scratchDir('replays');
    expect(saveBugReport(null, inbox, replays).ok).toBe(false);
    expect(saveBugReport('nope', inbox, replays).ok).toBe(false);
  });

  it('two reports in the same call window get distinct ids (no filename collision)', () => {
    const inbox = scratchDir('inbox');
    const replays = scratchDir('replays');
    const a = saveBugReport(validBody(), inbox, replays);
    const b = saveBugReport(validBody(), inbox, replays);
    expect(a.replayPath).not.toBe(b.replayPath);
    expect(existsSync(a.replayPath!)).toBe(true);
    expect(existsSync(b.replayPath!)).toBe(true);
  });
});
