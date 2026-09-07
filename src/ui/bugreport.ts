/**
 * fb139 (§11/§12, owner feedback `feature-bug-report-hotkey`): the F8
 * bug-report hotkey. Dev builds POST straight to `inboxPlugin.ts`'s
 * endpoint (same round-trip shape as `tuner.ts`'s `postTunerSave`); a
 * production build has no dev server to POST to, so F8 there downloads the
 * same bundle as a single JSON file instead (the item's own acceptance
 * text). `isDevBuild()` alone decides the branch — this is a diagnostic
 * tool available to any player who can reach it, not a locked-content
 * feature, so `devProfileActive()`'s "authored unlocks" question does not
 * apply here the way it does to `hud.ts`'s dev-only buttons.
 */
import { isDevBuild } from '../meta/devprofile';
import type { RunConfig, TickInput } from '../sim/types';

export const INBOX_REPORT_PATH = '/__inbox/report';

export interface BugReportSnapshot {
  config: RunConfig;
  wave: number;
  phase: string;
  tick: number;
  inputLog: TickInput[];
}

export interface BugReportBundle extends BugReportSnapshot {
  note: string;
  screenshotPngBase64?: string;
}

/** `Game.debugSnapshot`'s own null case (no run in progress) maps to this — nothing to report. */
export function canOpenBugReport(devMode: boolean, snapshot: BugReportSnapshot | null): boolean {
  return devMode && snapshot !== null;
}

/**
 * `canvas.toBlob` + `FileReader`, the same pair `exportScreenshot` (`hud.ts`)
 * already uses for its Blob half — this just takes the extra step to a
 * base64 string, since both the dev-server payload and the prod download
 * bundle carry the screenshot inline rather than as a second file upload.
 * Resolves `undefined` on any missing browser API or an empty canvas,
 * mirroring `exportScreenshot`'s own silent-no-op guard rather than
 * throwing and losing the rest of the report.
 */
export function captureScreenshotBase64(canvas: HTMLCanvasElement): Promise<string | undefined> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(undefined);
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob || typeof FileReader === 'undefined') {
        resolve(undefined);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : undefined);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(blob);
    }, 'image/png');
  });
}

/** The dev-server round-trip — POSTs the full bundle, same JSON-body shape `inboxSave.ts`'s `validateBugReportPayload` reads. */
export async function postBugReport(bundle: BugReportBundle): Promise<{ ok: boolean; errors?: string[] }> {
  const res = await fetch(INBOX_REPORT_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bundle),
  });
  return (await res.json()) as { ok: boolean; errors?: string[] };
}

/**
 * Prod fallback: no dev server exists to POST to, so the same bundle a dev
 * build would send becomes a downloaded file instead — the Blob +
 * `URL.createObjectURL` + anchor-click idiom `exportScreenshot`/`tuner.ts`'s
 * "Export JSON" button both already use, guarded the same way against a
 * `URL`-less environment.
 */
export function downloadBugReportBundle(bundle: BugReportBundle): void {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return;
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bug-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * The end-to-end hotkey handler. `getSnapshot`/`getCanvas`/`promptNote` are
 * injected rather than reached for globally so the branching logic here —
 * "no run, no snapshot, no dev mode: do nothing; empty note: abort; else
 * send-or-download" — is unit-testable without a real DOM (`captureScreen
 * shotBase64`/`postBugReport`/`downloadBugReportBundle` above are the parts
 * that do need one, and stay thin enough not to need their own coverage,
 * matching `exportScreenshot`'s own precedent — no test file covers it
 * either).
 */
export async function handleBugReportHotkey(opts: {
  devMode: boolean;
  getSnapshot: () => BugReportSnapshot | null;
  getCanvas: () => HTMLCanvasElement | null;
  promptNote: () => string | null;
}): Promise<void> {
  const snapshot = opts.getSnapshot();
  if (!canOpenBugReport(opts.devMode, snapshot)) return;
  const note = opts.promptNote();
  if (note === null || note.trim().length === 0) return;
  const canvas = opts.getCanvas();
  // qa-playtester (fb139): the screenshot capture below is a genuine async
  // gap — a live game loop keeps pushing into an `inputLog` array during it.
  // `Game.debugSnapshot()` already freezes its own copy for exactly this
  // reason, but this function does not control every caller, so it copies
  // again here rather than trusting one upstream `.slice()` to never regress.
  const inputLog = (snapshot as BugReportSnapshot).inputLog.slice();
  const screenshotPngBase64 = canvas ? await captureScreenshotBase64(canvas) : undefined;
  const bundle: BugReportBundle = { ...(snapshot as BugReportSnapshot), inputLog, note: note.trim(), screenshotPngBase64 };
  if (isDevBuild()) {
    await postBugReport(bundle);
  } else {
    downloadBugReportBundle(bundle);
  }
}

/**
 * Wires the F8 listener onto `window`. Not gated on `e.repeat` the way the
 * dash key is (`main.ts`) — F8 opens a blocking `prompt()`-style dialog, so
 * a repeat event while it's open cannot arrive from the same physical press
 * (the browser has no more keydown events to send until the dialog closes).
 */
export function wireBugReportHotkey(opts: {
  devMode: () => boolean;
  getSnapshot: () => BugReportSnapshot | null;
  getCanvas: () => HTMLCanvasElement | null;
  promptNote: () => string | null;
}): void {
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'F8') return;
    e.preventDefault();
    void handleBugReportHotkey({
      devMode: opts.devMode(),
      getSnapshot: opts.getSnapshot,
      getCanvas: opts.getCanvas,
      promptNote: opts.promptNote,
    });
  });
}
