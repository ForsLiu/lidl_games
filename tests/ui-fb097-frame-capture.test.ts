/**
 * @vitest-environment jsdom
 *
 * fb097: dev-profile-only frame-sequence capture — a HUD control
 * (`#sw-framecapture`, only ever in the markup under `isDevBuild() &&
 * devProfileActive()`, same gating fb094's `#sw-screenshot` already uses)
 * that records `Hud`'s private `FRAME_CAPTURE_COUNT` canvas frames on a
 * fixed `setInterval`, bundles them into one downloadable ZIP
 * (`zip-archive.ts`'s dependency-free STORE writer — see
 * `ui-fb097-zip-archive.test.ts` for that writer's own round-trip
 * coverage), and downloads it via the same `URL.createObjectURL` +
 * anchor-click idiom `exportScreenshot`/`tuner.ts`'s "Export JSON" use. This
 * file runs under Vitest's default dev-build env — see
 * `ui-fb097-frame-capture-prod.test.ts` for the outside-dev-profile absence
 * case (split for the same `vi.mock` isolation reason
 * `ui-fb094-screenshot-export-prod.test.ts` is split).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Hud } from '../src/ui/hud';
import type { DevOp } from '../src/sim/types';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');
const FRAME_COUNT = 6;
const INTERVAL_MS = 500;

function mount(): HTMLElement {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  return document.getElementById('app') as HTMLElement;
}

function makeHud(root: HTMLElement): Hud {
  return new Hud(root, {
    onSelectTower: () => {},
    onCallWave: () => {},
    onPickOffer: () => {},
    onReroll: () => {},
    onRetry: () => {},
    onNewRun: () => {},
    onToggleRanges: () => {},
    onToggleAutoPick: () => {},
    onToggleCharacterPanel: () => {},
    onEquipItem: () => {},
    onToggleDpsPanel: () => {},
    onToggleVsPanel: () => {},
    onResume: () => {},
    onPause: () => {},
    onCycleSpeed: () => {},
    onSetSpeed: () => {},
    onDev: (_op: DevOp) => {},
    onQuitToHub: () => {},
    onHoverSkill: () => {},
    onUpgradeStructure: () => {},
    onSellStructure: () => {},
    onUpgradeCore: () => {},
    onHoverWieldedTower: () => {},
  });
}

function fakeBlob(index: number): Blob {
  return {
    size: 4,
    type: 'image/png',
    arrayBuffer: () => Promise.resolve(new Uint8Array([index, index, index, index]).buffer),
  } as unknown as Blob;
}

describe('fb097: dev-profile frame capture', () => {
  let root: HTMLElement;
  let hud: Hud;

  beforeEach(() => {
    root = mount();
    hud = makeHud(root);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the Frame Capture control under the dev build/profile', () => {
    const btn = root.querySelector('#sw-framecapture');
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toBe('Frame Capture');
  });

  it('captures the expected frame count over the fixed interval and downloads one ZIP', async () => {
    vi.useFakeTimers();
    const canvas = hud.canvas;
    let callIndex = 0;
    const toBlobSpy = vi.fn((cb: (b: Blob | null) => void, _type?: string) => {
      cb(fakeBlob(callIndex++));
    });
    canvas.toBlob = toBlobSpy as unknown as typeof canvas.toBlob;

    const createObjectURL = vi.fn((_blob: Blob) => 'blob:fake-zip');
    const revokeObjectURL = vi.fn();
    const originalURL = globalThis.URL;
    (globalThis as { URL: typeof URL }).URL = {
      ...originalURL,
      createObjectURL,
      revokeObjectURL,
    } as unknown as typeof URL;

    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') el.click = clickSpy;
      return el;
    });

    root.querySelector<HTMLButtonElement>('#sw-framecapture')?.click();
    // The first capture fires synchronously off the click; let its
    // arrayBuffer()/finally() microtasks settle before checking it.
    await vi.advanceTimersByTimeAsync(0);
    expect(toBlobSpy).toHaveBeenCalledTimes(1);
    // No premature download before every frame has settled.
    expect(createObjectURL).not.toHaveBeenCalled();

    // The remaining FRAME_COUNT-1 captures fire on the fixed interval.
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * (FRAME_COUNT - 1));

    expect(toBlobSpy).toHaveBeenCalledTimes(FRAME_COUNT);
    // Exactly one archive downloaded, not one per frame.
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const zipBlob = createObjectURL.mock.calls[0][0] as Blob;
    expect(zipBlob.type).toBe('application/zip');
    const zipBytes = new Uint8Array(await zipBlob.arrayBuffer());
    // Local file header signature — a real ZIP, not an empty/placeholder Blob.
    expect(Array.from(zipBytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-zip');

    // The interval must actually stop — no captures past the target count.
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);
    expect(toBlobSpy).toHaveBeenCalledTimes(FRAME_COUNT);

    createElementSpy.mockRestore();
    (globalThis as { URL: typeof URL }).URL = originalURL;
  });

  it('is inert (no throw, no download) when toBlob never resolves a blob', async () => {
    vi.useFakeTimers();
    const canvas = hud.canvas;
    canvas.toBlob = vi.fn((cb: (b: Blob | null) => void) => cb(null)) as unknown as typeof canvas.toBlob;

    const createObjectURL = vi.fn(() => 'blob:fake-zip');
    const originalURL = globalThis.URL;
    (globalThis as { URL: typeof URL }).URL = { ...originalURL, createObjectURL, revokeObjectURL: vi.fn() } as unknown as typeof URL;

    expect(() => root.querySelector<HTMLButtonElement>('#sw-framecapture')?.click()).not.toThrow();
    await expect(vi.advanceTimersByTimeAsync(INTERVAL_MS * (FRAME_COUNT + 1))).resolves.not.toThrow();

    expect(createObjectURL).not.toHaveBeenCalled();
    (globalThis as { URL: typeof URL }).URL = originalURL;
  });

  // qa-playtester (fb097 independent QA pass): a `toBlob` that drops its
  // callback (or throws before it can be reached) used to leave the capture
  // interval running forever — nothing but the settle path ever cleared it,
  // and a dropped/throwing callback never settles. Both cases below assert
  // the interval genuinely stops (`vi.getTimerCount()` back to 0) rather
  // than ticking forever as a permanent no-op.
  it('stops the interval (no leaked setInterval) when toBlob never invokes its callback', async () => {
    vi.useFakeTimers();
    const canvas = hud.canvas;
    canvas.toBlob = vi.fn(() => {
      // Deliberately never calls its callback — a canvas.toBlob
      // implementation that hangs or silently drops the request.
    }) as unknown as typeof canvas.toBlob;

    root.querySelector<HTMLButtonElement>('#sw-framecapture')?.click();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * (FRAME_COUNT + 5));

    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops the interval (no leaked setInterval) when toBlob throws synchronously after the first frame', async () => {
    vi.useFakeTimers();
    const canvas = hud.canvas;
    let callIndex = 0;
    canvas.toBlob = vi.fn((cb: (b: Blob | null) => void) => {
      const idx = callIndex++;
      if (idx === 0) {
        cb(fakeBlob(idx));
        return;
      }
      throw new Error('simulated tainted-canvas SecurityError');
    }) as unknown as typeof canvas.toBlob;

    root.querySelector<HTMLButtonElement>('#sw-framecapture')?.click();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * (FRAME_COUNT + 5));

    expect(vi.getTimerCount()).toBe(0);
  });

  it('re-enables the control (does not stay stuck disabled) once a stalled capture times out via the safety fallback', async () => {
    vi.useFakeTimers();
    const canvas = hud.canvas;
    canvas.toBlob = vi.fn((cb: (b: Blob | null) => void) => cb(fakeBlob(0))) as unknown as typeof canvas.toBlob;
    // Only ever resolve the FIRST capture; every later one hangs, matching
    // the "dropped callback" shape above, to prove `finish()`'s safety
    // timeout (not just the interval) actually fires and clears
    // `frameCaptureInFlight`/re-enables the button.
    let calls = 0;
    canvas.toBlob = vi.fn((cb: (b: Blob | null) => void) => {
      calls++;
      if (calls === 1) cb(fakeBlob(0));
      // else: hang forever, never calling cb.
    }) as unknown as typeof canvas.toBlob;

    const btn = root.querySelector<HTMLButtonElement>('#sw-framecapture')!;
    btn.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(btn.disabled).toBe(true);

    // Past the last capture's issue point plus the safety timeout's own grace window.
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * FRAME_COUNT + INTERVAL_MS * 3 + 1);

    expect(btn.disabled).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
