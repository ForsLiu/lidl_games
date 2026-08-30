/**
 * p9c (§11, gate G15): the Tuner's write path. Pure Node, no Vite/HTTP
 * concerns — `tunerPlugin.ts` is the thin HTTP wrapper around this; tests
 * call this directly against a temp copy of `/data` so nothing here ever
 * touches the real files.
 */
import { renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadContent, TUNER_FILES } from '../sim/content';

export interface TunerFieldError {
  path: string;
  message: string;
}

export interface TunerSaveResult {
  ok: boolean;
  errors?: TunerFieldError[];
}

/**
 * Validates `data` against the same zod schema `loadContent()` parses the
 * named file with, then writes it atomically (temp file + rename, so a
 * process killed mid-write never leaves a half-written `/data/*.json` that
 * every CLI in CLAUDE.md's stack would then crash loading). Rejects with
 * field-level errors instead of writing anything on a schema mismatch.
 */
export function saveTunerFile(key: string, data: unknown, dataDir: string): TunerSaveResult {
  const entry = TUNER_FILES.find((f) => f.key === key);
  if (!entry) {
    return { ok: false, errors: [{ path: '', message: `unknown tuner file "${key}"` }] };
  }

  const parsed = entry.schema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  // code-reviewer's Major #2: this file's own schema can be perfectly valid
  // and still name an enemy/class/tower/quest nothing else in `/data`
  // defines — exactly what `loadContent()`'s cross-file checks already
  // catch. Dry-running the real loader with this document substituted in
  // (never touching the process's cached Content or any file on disk) means
  // a referentially-broken save is rejected here, before it can brick the
  // next `loadContent()` call anywhere in the app.
  if (entry.contentField) {
    try {
      loadContent({ [entry.contentField]: parsed.data });
    } catch (err) {
      return { ok: false, errors: [{ path: '', message: (err as Error).message }] };
    }
  }

  const filePath = join(dataDir, entry.fileName);
  // code-reviewer's Minor #6: a fixed `.tmp` suffix means two overlapping
  // saves to the same file could have one write clobber the other's tmp
  // file before either renames. A per-call unique suffix removes the race —
  // cheap here since this is Node dev-server code, not `/src/sim`.
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(parsed.data, null, 2)}\n`, 'utf8');
  renameSync(tmpPath, filePath);
  return { ok: true };
}
