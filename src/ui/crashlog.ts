/**
 * fb091 (QUALITY.md 1.0 Steam/itch checklist: "error capture to a local log
 * with a 'copy report' button"). A bounded, module-scoped ring buffer of
 * recent uncaught errors and unhandled promise rejections — module-scoped
 * (not owned by any `Game`/`Hub` instance) so it keeps capturing regardless
 * of which instance is live when an error fires, the same reasoning
 * `hub.ts`'s `activeFullscreenHub` singleton documents for `fullscreenchange`.
 * Session-only by design: nothing here is persisted to `localStorage`.
 */

export interface CrashLogEntry {
  time: number;
  message: string;
  stack?: string;
}

const MAX_ENTRIES = 20;
const entries: CrashLogEntry[] = [];

export function recordCrash(message: string, stack?: string): void {
  entries.push({ time: Date.now(), message, stack });
  if (entries.length > MAX_ENTRIES) entries.shift();
}

export function crashLogEntries(): readonly CrashLogEntry[] {
  return entries;
}

/** Test-only: the ring buffer is a module singleton, so tests need a way to start clean. */
export function clearCrashLogForTest(): void {
  entries.length = 0;
}

export function formatCrashReport(): string {
  if (entries.length === 0) return 'No errors recorded this session.';
  return entries
    .map((e) => `[${new Date(e.time).toISOString()}] ${e.message}${e.stack ? `\n${e.stack}` : ''}`)
    .join('\n\n');
}

let installed = false;

/** Idempotent — safe to call from every `Game.start()` even across repeated test-harness boots. */
export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('error', (e) => {
    recordCrash(e.message || 'Uncaught error', e.error instanceof Error ? e.error.stack : undefined);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason as unknown;
    if (reason instanceof Error) recordCrash(reason.message, reason.stack);
    else recordCrash(String(reason));
  });
}
