/**
 * fb139: the F8 in-run bug-report hotkey. The note box lives here as a
 * self-contained overlay, deliberately not `hud.ts`'s `.sw-modal` (the
 * level-up/quest/Core-choice cards already own that element's open/close
 * bookkeeping) — F8 must be reachable at any moment in a run, including
 * while one of those cards is up, without racing it.
 *
 * Dev vs. prod split mirrors `tuner.ts`: `postBugReport` posts to the
 * literal `/__bugreport/save` path (never imports `src/devserver/**`, which
 * `bugReportPlugin.ts`'s own header explains is what keeps a production
 * bundle free of the endpoint) when `isDevBuild()`, and
 * `downloadBugReportBundle` — the "prod builds: F8 downloads the same
 * bundle as a file instead" half — otherwise.
 */
import type { RecordedRun } from '../sim/run';
import { hashWorld } from '../sim/run';
import type { World } from '../sim/world';

export interface BugReportBundle {
  note: string;
  classKey: string;
  core: string;
  tier: number;
  wave: number;
  phase: string;
  tick: number;
  seed: number;
  contentHash: string | undefined;
  endHash: string;
  recorded: RecordedRun;
  /** base64-encoded PNG, no `data:` prefix. */
  screenshotPng: string;
}

/** Everything about "the moment of report" that isn't the note itself or the screenshot. */
export function buildBugReportBundle(world: World, inputLog: RecordedRun['inputLog'], note: string, screenshotPng: string): BugReportBundle {
  return {
    note,
    classKey: world.cfg.classKey,
    core: world.cfg.core ?? '(default)',
    tier: world.cfg.tier,
    wave: world.wavesCleared,
    phase: world.phase,
    tick: world.tick,
    seed: world.cfg.seed,
    contentHash: world.cfg.contentHash,
    endHash: hashWorld(world),
    recorded: { config: world.cfg, inputLog: inputLog.slice() },
    screenshotPng,
  };
}

export interface BugReportSaveResponse {
  ok: boolean;
  error?: string;
  bugPath?: string;
}

export async function postBugReport(bundle: BugReportBundle): Promise<BugReportSaveResponse> {
  const res = await fetch('/__bugreport/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bundle),
  });
  return (await res.json()) as BugReportSaveResponse;
}

/**
 * Prod-build fallback: no dev server to POST to, so the same bundle a dev
 * build would have sent is downloaded as one JSON file instead (same
 * Blob + `URL.createObjectURL` + anchor-click idiom `hud.ts`'s
 * `exportScreenshot`/`tuner.ts`'s "Export JSON" already use), guarded the
 * same way against a `URL`-less environment.
 */
export function downloadBugReportBundle(bundle: BugReportBundle): void {
  if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return;
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stonewake-bugreport-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** A minimal, self-contained note box: a textarea plus Submit/Cancel, hidden until `open()`. */
export class BugReportBox {
  private root: HTMLDivElement;
  private textarea: HTMLTextAreaElement;
  private onSubmit: ((note: string) => void) | null = null;
  private onCancel: (() => void) | null = null;

  constructor(parent: HTMLElement = document.body) {
    this.root = document.createElement('div');
    this.root.hidden = true;
    this.root.dataset.testid = 'bugreport-box';
    this.root.style.cssText =
      'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,0.6);z-index:1000;';
    this.root.innerHTML = `
      <div style="background:#1c1f26;color:#eee;padding:16px;border-radius:8px;width:360px;max-width:90vw;font:14px sans-serif;">
        <div style="margin-bottom:8px;font-weight:bold;">Report a bug (F8)</div>
        <textarea rows="4" style="width:100%;box-sizing:border-box;" placeholder="What went wrong?"></textarea>
        <div style="margin-top:8px;display:flex;gap:8px;justify-content:flex-end;">
          <button type="button" data-act="cancel">Cancel</button>
          <button type="button" data-act="submit">Submit</button>
        </div>
      </div>`;
    this.textarea = this.root.querySelector('textarea') as HTMLTextAreaElement;
    this.root.querySelector('[data-act="cancel"]')?.addEventListener('click', () => this.cancel());
    this.root.querySelector('[data-act="submit"]')?.addEventListener('click', () => this.submit());
    parent.appendChild(this.root);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(onSubmit: (note: string) => void, onCancel: () => void): void {
    this.onSubmit = onSubmit;
    this.onCancel = onCancel;
    this.textarea.value = '';
    this.root.hidden = false;
    this.textarea.focus();
  }

  private cancel(): void {
    const cb = this.onCancel;
    this.close();
    if (cb) cb();
  }

  private submit(): void {
    const note = this.textarea.value.trim();
    if (!note) return;
    const cb = this.onSubmit;
    this.close();
    if (cb) cb(note);
  }

  private close(): void {
    this.root.hidden = true;
    this.onSubmit = null;
    this.onCancel = null;
  }
}
