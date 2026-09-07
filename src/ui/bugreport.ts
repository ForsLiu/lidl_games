/**
 * fb139: the client-side half of the in-run bug-report hotkey (F8). Same
 * split as `tuner.ts`'s `postTunerSave` — a plain fetch to a hardcoded
 * dev-server path, never an import from `src/devserver/**` (that module
 * graph is Node-only and excluded from `vite build`; nothing under `src/ui`
 * may import it — see `tunerPlugin.ts`'s own header comment). The literal
 * path here must match `bugReportPlugin.ts`'s `BUG_REPORT_SAVE_PATH`.
 *
 * The point of the bundle is reproducibility, not just a note: `{ config,
 * inputLog }` is the same `RecordedRun` shape architecture rule 2's
 * replay/hash machinery already uses (`src/sim/run.ts`), truncated to the
 * exact tick the report was taken at.
 */
import type { RunConfig, TickInput } from '../sim/types';
import type { World } from '../sim/world';

export interface BugReportMeta {
  classKey: string;
  core: string;
  tier: number;
  phase: string;
  wavesCleared: number;
  tick: number;
  seed: number;
  contentHash: string;
}

export interface BugReportPayload {
  note: string;
  meta: BugReportMeta;
  config: RunConfig;
  inputLog: TickInput[];
  screenshotBase64?: string;
}

export interface BugReportSaveResponse {
  ok: boolean;
  mdPath?: string;
  replayPath?: string;
  screenshotPath?: string;
  errors?: { path: string; message: string }[];
}

export function buildBugReportMeta(w: World): BugReportMeta {
  return {
    classKey: w.cfg.classKey,
    core: w.coreKey,
    tier: w.cfg.tier,
    phase: w.phase,
    wavesCleared: w.wavesCleared,
    tick: w.tick,
    seed: w.cfg.seed,
    // Always populated by the time a World exists (its constructor stamps
    // it in) — the `?? ''` is a type-narrowing fallback, not an expected path.
    contentHash: w.cfg.contentHash ?? '',
  };
}

export async function postBugReport(payload: BugReportPayload): Promise<BugReportSaveResponse> {
  const res = await fetch('/__bugreport/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as BugReportSaveResponse;
}

/**
 * Prod fallback: there is no dev server to write to, so the whole bundle
 * (note + meta + replay + screenshot) downloads as one JSON file instead —
 * same `Blob` + `URL.createObjectURL` + anchor-click idiom `hud.ts`'s dev
 * screenshot export and `tuner.ts`'s "Export JSON" button already use.
 */
export function downloadBugReportBundle(payload: BugReportPayload): void {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bug-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * `Uint8Array` -> base64, chunked so a multi-megabyte screenshot never hits
 * `String.fromCharCode`'s own argument-count ceiling (spreading the whole
 * array as call arguments, not just a performance concern past a few
 * hundred KB).
 */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * `toBlob`'s spec guarantees its callback eventually fires, but a screenshot
 * is a nice-to-have on the report, not the report itself — capped so one
 * unresponsive canvas can't leave the note sitting uncaptured indefinitely
 * (code-reviewer finding).
 */
const SCREENSHOT_TIMEOUT_MS = 2000;

/**
 * Resolves to `undefined` rather than throwing when canvas capture is
 * unavailable (jsdom, a stripped-down test runner) — the same silent-no-op
 * guard `hud.ts`'s `exportScreenshot` already uses for the same reason.
 */
export function captureScreenshotBase64(canvas: HTMLCanvasElement): Promise<string | undefined> {
  const capture = new Promise<string | undefined>((resolve) => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(undefined);
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(undefined);
        return;
      }
      blob
        .arrayBuffer()
        .then((buf) => resolve(bytesToBase64(new Uint8Array(buf))))
        .catch(() => resolve(undefined));
    }, 'image/png');
  });
  const timeout = new Promise<string | undefined>((resolve) => {
    setTimeout(() => resolve(undefined), SCREENSHOT_TIMEOUT_MS);
  });
  return Promise.race([capture, timeout]);
}
