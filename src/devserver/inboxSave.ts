/**
 * fb139 (§11/§12, owner feedback `feature-bug-report-hotkey`): the F8
 * bug-report hotkey's write path. Pure Node, no Vite/HTTP concerns —
 * `inboxPlugin.ts` is the thin HTTP wrapper around this, mirroring
 * `tunerSave.ts`/`tunerPlugin.ts`'s own split so tests can drive the file
 * writes directly against a temp directory.
 *
 * A bug report is three files, all timestamp-matched: `bug-<ts>.md` (the
 * human-readable note + run context, written where the loop's own feedback
 * processing already looks — see `inboxDir`'s own doc comment), a
 * `replay-<ts>.json` under `replaysDir` shaped exactly like `src/sim/run.ts`'s
 * `RecordedRun` (so `replayRecorded()` loads it with no translation step),
 * and an optional `bug-<ts>.png` screenshot. The `.md` references the other
 * two by relative path rather than inlining the (potentially large) input
 * log, per the item's own acceptance text ("the full input log (or a path
 * to a saved replay file under `/replays`)").
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { defaultCoreKey, loadContent } from '../sim/content';
import type { RunConfig, TickInput } from '../sim/types';

export interface BugReportPayload {
  note: string;
  config: RunConfig;
  wave: number;
  phase: string;
  tick: number;
  inputLog: TickInput[];
  /** A `data:image/png;base64,...` URL or bare base64 — either is accepted. */
  screenshotPngBase64?: string;
}

export interface BugReportSaveResult {
  ok: boolean;
  errors?: string[];
  mdPath?: string;
  replayPath?: string;
  screenshotPath?: string;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/**
 * Field-level validation before any file is written — the same "reject
 * loudly, write nothing" shape `saveTunerFile` uses, appropriate here too
 * since a malformed body (a stale client against a newer server, say)
 * should never produce a half-written, unreadable bug report.
 */
export function validateBugReportPayload(body: unknown): BugReportPayload | string[] {
  if (typeof body !== 'object' || body === null) return ['request body must be an object'];
  const b = body as Record<string, unknown>;
  const errors: string[] = [];
  if (!isNonEmptyString(b.note)) errors.push('missing or empty "note"');
  if (typeof b.config !== 'object' || b.config === null) errors.push('missing "config"');
  if (typeof b.wave !== 'number') errors.push('missing or non-number "wave"');
  if (!isNonEmptyString(b.phase)) errors.push('missing or non-string "phase"');
  if (typeof b.tick !== 'number') errors.push('missing or non-number "tick"');
  if (!Array.isArray(b.inputLog)) errors.push('missing or non-array "inputLog"');
  if (b.screenshotPngBase64 !== undefined && typeof b.screenshotPngBase64 !== 'string') {
    errors.push('"screenshotPngBase64" must be a string when present');
  }
  if (errors.length > 0) return errors;
  return {
    note: b.note as string,
    config: b.config as RunConfig,
    wave: b.wave as number,
    phase: b.phase as string,
    tick: b.tick as number,
    inputLog: b.inputLog as TickInput[],
    screenshotPngBase64: b.screenshotPngBase64 as string | undefined,
  };
}

function stripDataUrlPrefix(base64: string): string {
  const comma = base64.indexOf(',');
  return base64.startsWith('data:') && comma !== -1 ? base64.slice(comma + 1) : base64;
}

/**
 * Writes the three files and returns their paths (relative to `inboxDir`
 * for the `.md`'s own cross-references, absolute in the returned result so
 * a caller — or a test — can read them straight back).
 */
export function saveBugReport(
  payload: BugReportPayload,
  inboxDir: string,
  replaysDir: string,
): BugReportSaveResult {
  const ts = Date.now();
  // qa-playtester (fb139): `Date.now()` alone collides under real concurrent
  // load — two POSTs landing in the same millisecond (confirmed live: 40
  // concurrent requests produced 20 silently-overwritten pairs, each caller
  // still answered `200 ok`) clobbered each other with no error either side.
  // A short random suffix makes that astronomically unlikely without giving
  // up the human-readable, sort-by-time timestamp prefix; `ts` itself still
  // feeds the `.md`'s ISO date and stays a plain number for that.
  const uid = `${ts}-${randomBytes(3).toString('hex')}`;
  mkdirSync(inboxDir, { recursive: true });
  mkdirSync(replaysDir, { recursive: true });

  const replayPath = join(replaysDir, `replay-${uid}.json`);
  writeFileSync(replayPath, JSON.stringify({ config: payload.config, inputLog: payload.inputLog }));

  let screenshotPath: string | undefined;
  if (payload.screenshotPngBase64) {
    screenshotPath = join(inboxDir, `bug-${uid}.png`);
    writeFileSync(screenshotPath, Buffer.from(stripDataUrlPrefix(payload.screenshotPngBase64), 'base64'));
  }

  const mdPath = join(inboxDir, `bug-${uid}.md`);
  const lines = [
    `# Bug report — ${new Date(ts).toISOString()}`,
    '',
    payload.note,
    '',
    `- class: ${payload.config.classKey}`,
    // §5.5: same "an omitted core defaults to whichever /data marks
    // unlockedByDefault" rule `replayRecorded` itself already applies —
    // reading it live rather than hardcoding today's default (`stone_heart`)
    // keeps this line correct if that ever changes (code-reviewer, fb139).
    `- core: ${payload.config.core ?? defaultCoreKey(loadContent())}`,
    `- tier: ${payload.config.tier}`,
    `- phase: ${payload.phase}`,
    `- wave: ${payload.wave}`,
    `- tick: ${payload.tick}`,
    `- seed: ${payload.config.seed}`,
    `- contentHash: ${payload.config.contentHash ?? '(unstamped)'}`,
    `- replay: ${relative(inboxDir, replayPath)}`,
    `- screenshot: ${screenshotPath ? relative(inboxDir, screenshotPath) : 'none'}`,
  ];
  writeFileSync(mdPath, lines.join('\n') + '\n');

  return { ok: true, mdPath, replayPath, screenshotPath };
}
