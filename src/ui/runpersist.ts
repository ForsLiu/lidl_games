/**
 * fb074: localStorage persistence for an in-progress run, so a page refresh
 * mid-run resumes instead of dropping to the Hub. Reuses `sim/run.ts`'s
 * `RecordedRun` shape (RunConfig + full input log) — the same seed+input-log
 * replay path G2's determinism tests already exercise is what reconstructs
 * the live World on load (`main.ts`'s `tryResumePersistedRun`) — plus a
 * `sessionId` stamped once per `Game` instance, so two tabs/windows sharing
 * this one browser-profile-wide key can tell whether they still own the slot
 * they last wrote (code-reviewer finding, fb074) instead of silently fighting
 * over it forever or wiping a session that isn't theirs.
 */
import type { RecordedRun } from '../sim/run';

export const RUN_PERSIST_KEY = 'stonewake.runinprogress.v1';

export interface PersistedRun extends RecordedRun {
  sessionId: string;
}

/** Returns whether the write actually succeeded, so a caller can react to (not just silently swallow) a full/unavailable localStorage. */
export function savePersistedRun(recorded: PersistedRun): boolean {
  try {
    globalThis.localStorage?.setItem(RUN_PERSIST_KEY, JSON.stringify(recorded));
    return true;
  } catch {
    return false;
  }
}

/** Malformed/foreign JSON (a hand-edited, pre-fb074, or pre-sessionId localStorage entry) is treated as absent, not thrown. */
export function loadPersistedRun(): PersistedRun | null {
  try {
    const raw = globalThis.localStorage?.getItem(RUN_PERSIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedRun> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.config || typeof parsed.config !== 'object') return null;
    if (!Array.isArray(parsed.inputLog)) return null;
    if (typeof parsed.sessionId !== 'string' || !parsed.sessionId) return null;
    return parsed as PersistedRun;
  } catch {
    return null;
  }
}

export function clearPersistedRun(): void {
  try {
    globalThis.localStorage?.removeItem(RUN_PERSIST_KEY);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}
