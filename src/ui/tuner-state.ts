/**
 * p9c (§11, gate G15): tracks which `TUNER_FILES` keys have an in-memory
 * edit that has not been saved. Read by the Hub's run-start path to flag a
 * run the same way a practice run is flagged (SPEC-FINAL §11: "a run
 * started after unsaved live edits is visibly flagged like practice") —
 * kept as its own tiny module rather than folded into `tuner.ts` so the Hub
 * can read it without importing the DOM-building editor code.
 */
const dirty = new Set<string>();

/**
 * code-reviewer's Major #1: the Codex tears down and remounts a collection's
 * whole DOM subtree on every nav click, including switching to the sibling
 * collection that shares one file (Stat Boons/Skill Cards both back
 * `vsupgrades`) — a fresh `installEditableEditor` call always re-seeded from
 * `collection.raw` (whatever is on disk), silently discarding whatever the
 * user had typed while `dirty` kept claiming there was still an edit to
 * lose. Drafts key an in-memory copy of the *last-typed* text per
 * `tunerFile`, so a remount can restore exactly what was there rather than
 * reset to the saved baseline.
 */
const drafts = new Map<string, string>();

export function setTunerDirty(key: string, isDirty: boolean): void {
  if (isDirty) dirty.add(key);
  else dirty.delete(key);
}

export function hasUnsavedTunerEdits(): boolean {
  return dirty.size > 0;
}

export function setTunerDraft(key: string, text: string): void {
  drafts.set(key, text);
}

export function getTunerDraft(key: string): string | undefined {
  return drafts.get(key);
}

export function clearTunerDraft(key: string): void {
  drafts.delete(key);
}

/** Test-only: a test file's edits must not leak into the next test's assertions. */
export function clearAllTunerDirty(): void {
  dirty.clear();
  drafts.clear();
}
