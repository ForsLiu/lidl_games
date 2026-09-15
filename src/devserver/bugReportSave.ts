/**
 * fb139: the F8 bug-report hotkey's write path. Pure Node, mirroring
 * `tunerSave.ts`'s split — `bugReportPlugin.ts` is the thin HTTP wrapper
 * around this; tests call this directly against temp directories so nothing
 * here ever touches the real `D:\lidl_inbox` or `/replays`.
 */
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { RecordedRun } from '../sim/run';

export interface BugReportInput {
  note: unknown;
  classKey: unknown;
  core: unknown;
  tier: unknown;
  wave: unknown;
  phase: unknown;
  tick: unknown;
  seed: unknown;
  contentHash: unknown;
  endHash: unknown;
  recorded: unknown;
  /** base64-encoded PNG, no `data:` prefix. */
  screenshotPng: unknown;
}

export interface BugReportSaveResult {
  ok: boolean;
  error?: string;
  bugPath?: string;
  replayPath?: string;
  screenshotPath?: string;
}

function uniqueId(): string {
  // Matches `tunerSave.ts`'s own reasoning for a per-call unique suffix
  // (Minor #6): cheap here since this is Node dev-server code, not `/src/sim`.
  return `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecordedRun(v: unknown): v is RecordedRun {
  return !!v && typeof v === 'object' && Array.isArray((v as RecordedRun).inputLog) && !!(v as RecordedRun).config;
}

function writeAtomic(path: string, data: string | Buffer): void {
  const tmp = `${path}.${uniqueId()}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

/**
 * Writes three files: the replay bundle (`RecordedRun` JSON) and the
 * screenshot PNG under `replaysDir`, and the human-readable `.md` report
 * (note, run metadata, and paths to the other two) under `inboxDir` — the
 * same `feedback/*.md` shape the loop's own protocol already reads, so a
 * bug report can be dropped straight into `feedback/` with no reformatting.
 * The `.md`'s "replay" line is the "path to a saved replay file under
 * `/replays`" half of fb139's acceptance; the full input log is never
 * inlined into the `.md` itself.
 */
export function saveBugReport(input: BugReportInput, inboxDir: string, replaysDir: string): BugReportSaveResult {
  // qa-playtester: a literal top-level JSON `null` body is valid JSON (so
  // the middleware's own parse `try/catch` never sees it) and reached
  // `input.note` below, throwing "Cannot read properties of null" as an
  // unhandled rejection that crashed the dev server instead of answering
  // 400 like every other malformed body. Guarded here too, not just at the
  // middleware, since this function is exported and callable directly.
  if (typeof input !== 'object' || input === null) {
    return { ok: false, error: 'body must be a JSON object' };
  }
  if (typeof input.note !== 'string' || input.note.trim().length === 0) {
    return { ok: false, error: 'note must be a non-empty string' };
  }
  if (!isRecordedRun(input.recorded)) {
    return { ok: false, error: 'recorded run is missing config/inputLog' };
  }
  if (typeof input.screenshotPng !== 'string' || input.screenshotPng.length === 0) {
    return { ok: false, error: 'screenshotPng must be a non-empty base64 string' };
  }

  const id = uniqueId();
  mkdirSync(replaysDir, { recursive: true });
  mkdirSync(inboxDir, { recursive: true });

  const replayPath = join(replaysDir, `replay-${id}.json`);
  writeAtomic(replayPath, `${JSON.stringify(input.recorded, null, 2)}\n`);

  const screenshotPath = join(replaysDir, `screenshot-${id}.png`);
  writeAtomic(screenshotPath, Buffer.from(input.screenshotPng, 'base64'));

  const bugPath = join(inboxDir, `bug-${id}.md`);
  const md = [
    '# In-run bug report (F8)',
    '',
    input.note.trim(),
    '',
    `- class: ${input.classKey}`,
    `- core: ${input.core}`,
    `- tier: ${input.tier}`,
    `- wave: ${input.wave}`,
    `- phase: ${input.phase}`,
    `- tick: ${input.tick}`,
    `- seed: ${input.seed}`,
    `- content hash: ${input.contentHash ?? '(none)'}`,
    `- end-state hash at report time: ${input.endHash}`,
    `- replay: ${replayPath}`,
    `- screenshot: ${screenshotPath}`,
    '',
  ].join('\n');
  writeAtomic(bugPath, md);

  return { ok: true, bugPath, replayPath, screenshotPath };
}
