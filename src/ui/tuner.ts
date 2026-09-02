/**
 * p9c (§11, gate G15): the Tuner. In dev mode, every collection the Codex
 * shows gets a raw-JSON editor over its whole backing file (not just the
 * rows the table displays — Stat Boons and Skill Cards share one file, and
 * a save has to round-trip the file, never a partial view of it) with a
 * Save button that posts to the dev-server endpoint (`tunerPlugin.ts`) and
 * reports back either success or the schema's own field-level errors.
 *
 * A per-field typed widget for every numeric/enum column (the literal
 * reading of BACKLOG.md's t26c) would mean bespoke editors for deeply
 * nested shapes — a tower's `attack`, an upgrade track's `specials`, a
 * wave's `groups` — which is real UI engineering scope well beyond one
 * backlog item. Logged as the spec-consistent default for this gap
 * (QUESTIONS.md): the whole document as editable JSON text, validated
 * server-side against the exact same schema the loader uses, satisfies
 * G15 literally ("edit→save→reload round-trip; invalid rejected") and
 * makes literally every field — numeric, enum, or otherwise, including
 * wave composition — editable, just not through a bespoke widget per type.
 *
 * Export/Import are available in every build (SPEC-FINAL §11: "prod =
 * read-only + export/import"); only the editable textarea and Save button
 * are dev-gated, following `audit-hook.ts`'s proven
 * `if (!isDevBuild()) return` shape — gate C8's own production-bundle test
 * confirms a bundler can and does eliminate a guarded branch shaped exactly
 * like this one.
 *
 * fb044 (QUESTIONS Q150 ORDER): the owner's follow-up on top of the above —
 * typed per-field widgets for the four collections tuned most (towers,
 * classes, cores, waves), generated from each collection's own zod schema
 * (`tuner-fields.ts`) rather than the whole-document textarea alone. Editing
 * a typed widget writes into the *same* textarea (`JSON.stringify`s the
 * updated document back into it) so Save keeps posting through the one path
 * `postTunerSave` already validates server-side — there is no second save
 * button, no second source of truth, and every field a widget can't
 * describe (a dynamic-key record, a raw-string array, an unmatched
 * discriminated-union variant) still falls through to the textarea exactly
 * as before this item.
 */
import { isDevBuild } from '../meta/devprofile';
import { TUNER_FILES } from '../sim/content';
import type { CodexCollection } from './codex-collections';
import { clearTunerDraft, getTunerDraft, setTunerDirty, setTunerDraft } from './tuner-state';
import { applyFieldChange, renderDocumentFields } from './tuner-fields';

/** fb044: only these four get the typed-field panel — the owner's own scoping in Q150's ORDER verdict. */
const FIELD_EDITOR_KEYS = new Set(['towers', 'classes', 'cores', 'waves']);

export interface TunerSaveResponse {
  ok: boolean;
  errors?: { path: string; message: string }[];
}

/** Parses Tuner-editor JSON text, distinguishing a syntax error from valid JSON. */
export function parseTunerJson(text: string): { ok: true; value: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function postTunerSave(key: string, data: unknown): Promise<TunerSaveResponse> {
  const res = await fetch('/__tuner/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, data }),
  });
  return (await res.json()) as TunerSaveResponse;
}

function formatErrors(errors: { path: string; message: string }[] | undefined): string {
  if (!errors || errors.length === 0) return 'Save rejected.';
  return errors.map((e) => `${e.path || '(root)'}: ${e.message}`).join('; ');
}

/**
 * The editable half. Never called in a production build — see this file's
 * header. Kept as its own function, early-returning on `!isDevBuild()`
 * exactly like `installAuditHook`, so the guard sits at the very top of the
 * branch a bundler needs to eliminate rather than wrapped mid-function.
 */
function installEditableEditor(container: HTMLElement, collection: CodexCollection, tunerFile: string): void {
  if (!isDevBuild()) return;

  const baseline = JSON.stringify(collection.raw, null, 2);
  // A remount (switching Codex tabs and back, including between the two
  // nav entries that share this same file) restores whatever was last
  // typed, not the on-disk baseline — otherwise the remount silently
  // discards an unsaved edit while `hasUnsavedTunerEdits()` keeps reporting
  // one for a textarea that no longer shows it.
  const draft = getTunerDraft(tunerFile);

  const fieldsHost = document.createElement('div');
  fieldsHost.className = 'sw-tuner-fields';
  container.appendChild(fieldsHost);

  const textarea = document.createElement('textarea');
  textarea.className = 'sw-tuner-editor';
  textarea.rows = 14;
  textarea.value = draft ?? baseline;
  container.appendChild(textarea);

  const row = document.createElement('div');
  row.className = 'sw-tuner-row';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'sw-tuner-save';
  saveBtn.textContent = 'Save';
  row.appendChild(saveBtn);
  container.appendChild(row);

  const status = document.createElement('div');
  status.className = 'sw-tuner-status';
  container.appendChild(status);

  function updateDirty(): void {
    const isDirty = textarea.value !== baseline;
    setTunerDirty(tunerFile, isDirty);
    if (isDirty) setTunerDraft(tunerFile, textarea.value);
    else clearTunerDraft(tunerFile);
  }

  const fieldEditorEntry = FIELD_EDITOR_KEYS.has(tunerFile)
    ? TUNER_FILES.find((f) => f.key === tunerFile)
    : undefined;

  // code-reviewer's Major #1 (fb044): a widget's own onChange used to call
  // renderFieldsPanel() synchronously, tearing down and rebuilding every
  // widget on every keystroke — jsdom-confirmed to drop DOM focus after one
  // character. It also captured `parsed.value` once per render, so two edits
  // fired before the next rebuild (impossible while it always rebuilt, but a
  // real risk once that rebuild is removed) would have applied the second
  // edit on top of a document missing the first. Fixed by having onChange
  // re-parse the *current* textarea text fresh on every call and never
  // rebuild the DOM itself — only a genuine external edit (typing directly
  // into the textarea) rebuilds the panel now.
  function renderFieldsPanel(): void {
    fieldsHost.innerHTML = '';
    if (!fieldEditorEntry) return;
    const parsed = parseTunerJson(textarea.value);
    if (!parsed.ok) return; // mid-edit invalid JSON: leave the panel as-is rather than crash on it
    const panel = renderDocumentFields(fieldEditorEntry.schema, parsed.value, (path, value) => {
      const latest = parseTunerJson(textarea.value);
      const base = latest.ok ? latest.value : parsed.value;
      textarea.value = JSON.stringify(applyFieldChange(base, path, value), null, 2);
      updateDirty();
    });
    if (panel) fieldsHost.appendChild(panel);
  }

  textarea.addEventListener('input', () => {
    updateDirty();
    renderFieldsPanel();
  });

  renderFieldsPanel();

  saveBtn.addEventListener('click', () => {
    const parsed = parseTunerJson(textarea.value);
    if (!parsed.ok) {
      status.textContent = `Invalid JSON: ${parsed.message}`;
      status.classList.add('sw-tuner-error');
      return;
    }
    void postTunerSave(tunerFile, parsed.value).then((result) => {
      if (result.ok) {
        setTunerDirty(tunerFile, false);
        clearTunerDraft(tunerFile);
        status.textContent = 'Saved — reload to play with the new data.';
        status.classList.remove('sw-tuner-error');
      } else {
        status.textContent = formatErrors(result.errors);
        status.classList.add('sw-tuner-error');
      }
    });
  });
}

/** Mounts Export (always) + Import (always) + the dev-only editable editor for one Codex collection. */
export function mountTunerPanel(root: HTMLElement, collection: CodexCollection): void {
  root.innerHTML = '';
  const tunerFile = collection.tunerFile;
  if (tunerFile === undefined) return;

  const wrap = document.createElement('div');
  wrap.className = 'sw-tuner';

  const toolbar = document.createElement('div');
  toolbar.className = 'sw-tuner-toolbar';
  wrap.appendChild(toolbar);

  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.className = 'sw-tuner-export';
  exportBtn.textContent = 'Export JSON';
  toolbar.appendChild(exportBtn);

  const importLabel = document.createElement('label');
  importLabel.className = 'sw-tuner-import';
  importLabel.textContent = 'Import JSON';
  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = 'application/json';
  importLabel.appendChild(importInput);
  toolbar.appendChild(importLabel);

  const status = document.createElement('div');
  status.className = 'sw-tuner-import-status';
  wrap.appendChild(status);

  let exportValue: unknown = collection.raw;

  exportBtn.addEventListener('click', () => {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return;
    const blob = new Blob([JSON.stringify(exportValue, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tunerFile}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  importInput.addEventListener('change', () => {
    const file = importInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseTunerJson(String(reader.result));
      if (!parsed.ok) {
        status.textContent = `Invalid JSON file: ${parsed.message}`;
        return;
      }
      // Preview only: import never writes to disk and never touches the
      // live Content the running game reads from (SPEC-FINAL §11: prod is
      // "read-only + export/import", not a second write path).
      exportValue = parsed.value;
      status.textContent = 'Imported — shown above for preview, not saved.';
    };
    reader.readAsText(file);
  });

  root.appendChild(wrap);
  installEditableEditor(wrap, collection, tunerFile);
}
