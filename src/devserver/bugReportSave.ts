/**
 * fb139: the in-run bug-report hotkey's write path. Pure Node, no Vite/HTTP
 * concerns — `bugReportPlugin.ts` is the thin HTTP wrapper around this, same
 * split `tunerSave.ts`/`tunerPlugin.ts` already use. Tests call this directly
 * against a scratch directory so nothing here ever touches a real inbox.
 *
 * The point of the whole feature is that a bug report is *reproducible*: the
 * note alone is a story, but `{ config, inputLog }` — the same `RecordedRun`
 * shape architecture rule 2's replay/hash machinery already uses (`src/sim/
 * run.ts`) — is a fixture the qa/dev loop can replay to the exact recorded
 * tick. The `.md` file is the human-readable index; the replay JSON next to
 * it is what actually reproduces the bug.
 */
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface BugReportFieldError {
  path: string;
  message: string;
}

export interface BugReportSaveResult {
  ok: boolean;
  mdPath?: string;
  replayPath?: string;
  screenshotPath?: string;
  errors?: BugReportFieldError[];
}

/** A one-line note capped well short of anything that would make the `.md` file unwieldy. */
const MAX_NOTE_LENGTH = 2000;

interface ValidatedMeta {
  classKey: string;
  core: string;
  tier: number;
  phase: string;
  wavesCleared: number;
  tick: number;
  seed: number;
  contentHash: string;
}

/**
 * Field-by-field, matching `tunerSave.ts`'s error shape, so a malformed
 * client payload (a stale build, a hand-rolled request) fails with a
 * specific complaint rather than a generic 400.
 */
function validateMeta(meta: unknown, errors: BugReportFieldError[]): ValidatedMeta | null {
  if (typeof meta !== 'object' || meta === null) {
    errors.push({ path: 'meta', message: 'missing or non-object "meta"' });
    return null;
  }
  const m = meta as Record<string, unknown>;
  const stringFields = ['classKey', 'core', 'phase', 'contentHash'] as const;
  const numberFields = ['tier', 'wavesCleared', 'tick', 'seed'] as const;
  let ok = true;
  for (const f of stringFields) {
    if (typeof m[f] !== 'string' || m[f] === '') {
      errors.push({ path: `meta.${f}`, message: `missing or non-string "meta.${f}"` });
      ok = false;
    }
  }
  for (const f of numberFields) {
    if (typeof m[f] !== 'number' || !Number.isFinite(m[f])) {
      errors.push({ path: `meta.${f}`, message: `missing or non-finite "meta.${f}"` });
      ok = false;
    }
  }
  if (!ok) return null;
  return m as unknown as ValidatedMeta;
}

/** Same atomic write idiom `tunerSave.ts` uses: temp file + rename, per-call unique suffix so two overlapping saves cannot clobber each other's tmp file. */
function writeAtomic(filePath: string, data: string | Buffer): void {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(tmpPath, data);
  renameSync(tmpPath, filePath);
}

function bugReportMarkdown(note: string, meta: ValidatedMeta, replayPath: string, screenshotPath: string | undefined): string {
  const lines = [
    `# Bug report — ${new Date().toISOString()}`,
    '',
    note,
    '',
    `- class: ${meta.classKey}`,
    `- core: ${meta.core}`,
    `- tier: ${meta.tier}`,
    `- phase: ${meta.phase}`,
    `- waves cleared: ${meta.wavesCleared}`,
    `- tick: ${meta.tick}`,
    `- seed: ${meta.seed}`,
    `- content hash: ${meta.contentHash}`,
    `- replay: ${replayPath}`,
  ];
  if (screenshotPath) lines.push(`- screenshot: ${screenshotPath}`);
  lines.push('');
  return lines.join('\n');
}

/**
 * Validates and writes one bug report: the replay bundle (`{ config,
 * inputLog }`) under `replaysDir`, an optional screenshot PNG and the `.md`
 * index under `inboxDir`. Rejects (writing nothing) on a malformed payload,
 * the same "validate everything before writing anything" shape
 * `saveTunerFile` uses.
 */
export function saveBugReport(body: unknown, inboxDir: string, replaysDir: string): BugReportSaveResult {
  const errors: BugReportFieldError[] = [];
  if (typeof body !== 'object' || body === null) {
    return { ok: false, errors: [{ path: '', message: 'missing or non-object request body' }] };
  }
  const b = body as Record<string, unknown>;

  const note = typeof b.note === 'string' ? b.note.trim() : '';
  if (note.length === 0) errors.push({ path: 'note', message: 'missing or empty "note"' });
  if (note.length > MAX_NOTE_LENGTH) {
    errors.push({ path: 'note', message: `"note" exceeds ${MAX_NOTE_LENGTH} characters` });
  }

  const meta = validateMeta(b.meta, errors);

  if (typeof b.config !== 'object' || b.config === null) {
    errors.push({ path: 'config', message: 'missing or non-object "config"' });
  }
  if (!Array.isArray(b.inputLog)) {
    errors.push({ path: 'inputLog', message: 'missing or non-array "inputLog"' });
  }

  let screenshotBuffer: Buffer | undefined;
  if (b.screenshotBase64 !== undefined) {
    if (typeof b.screenshotBase64 !== 'string' || b.screenshotBase64.length === 0) {
      errors.push({ path: 'screenshotBase64', message: 'non-empty string expected when present' });
    } else {
      try {
        screenshotBuffer = Buffer.from(b.screenshotBase64, 'base64');
      } catch {
        errors.push({ path: 'screenshotBase64', message: 'not valid base64' });
      }
    }
  }

  if (errors.length > 0 || !meta) return { ok: false, errors };

  mkdirSync(inboxDir, { recursive: true });
  mkdirSync(replaysDir, { recursive: true });

  // One id shared by all three files, so a reader can tell at a glance which
  // replay/screenshot belong to which report without parsing the .md body.
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const replayPath = join(replaysDir, `bug-${id}.json`);
  writeAtomic(replayPath, JSON.stringify({ config: b.config, inputLog: b.inputLog }));

  let screenshotPath: string | undefined;
  if (screenshotBuffer) {
    screenshotPath = join(inboxDir, `bug-${id}.png`);
    writeAtomic(screenshotPath, screenshotBuffer);
  }

  const mdPath = join(inboxDir, `bug-${id}.md`);
  writeAtomic(mdPath, bugReportMarkdown(note, meta, replayPath, screenshotPath));

  return { ok: true, mdPath, replayPath, screenshotPath };
}
