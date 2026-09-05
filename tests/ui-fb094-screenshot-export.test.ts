/**
 * @vitest-environment jsdom
 *
 * fb094: dev-profile-only canvas screenshot export — a HUD control
 * (`#sw-screenshot`, only ever in the markup under `isDevBuild() &&
 * devProfileActive()`) that exports the current canvas frame to a
 * downloadable PNG via `canvas.toBlob` + the same `URL.createObjectURL` +
 * anchor-click download idiom `tuner.ts`'s "Export JSON" button already
 * uses. This file runs under Vitest's default dev-build env (`isDevBuild()`
 * true, `data/dev.json`'s `devMode` true) — see
 * `ui-fb094-screenshot-export-prod.test.ts` for the outside-dev-profile
 * absence case, split into its own file for the same reason
 * `p9c-tuner-prod-ui.test.ts` is split from `p9c-tuner-ui.test.ts`: a
 * `vi.mock` override of `isDevBuild()` applies to every importer in this
 * file's module graph.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Hud } from '../src/ui/hud';
import type { DevOp } from '../src/sim/types';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

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

describe('fb094: dev-profile screenshot export', () => {
  let root: HTMLElement;
  let hud: Hud;

  beforeEach(() => {
    root = mount();
    hud = makeHud(root);
  });

  it('renders the Screenshot control under the dev build/profile', () => {
    const btn = root.querySelector('#sw-screenshot');
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toBe('Screenshot');
  });

  it('clicking it calls canvas.toBlob and triggers an anchor-click download', () => {
    const canvas = hud.canvas;
    const fakeBlob = { size: 1, type: 'image/png' } as Blob;
    const toBlobSpy = vi.fn((cb: (b: Blob | null) => void, _type?: string) => cb(fakeBlob));
    canvas.toBlob = toBlobSpy as unknown as typeof canvas.toBlob;

    const createObjectURL = vi.fn(() => 'blob:fake-url');
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

    root.querySelector<HTMLButtonElement>('#sw-screenshot')?.click();

    expect(toBlobSpy).toHaveBeenCalledTimes(1);
    expect(toBlobSpy.mock.calls[0][1]).toBe('image/png');
    expect(createObjectURL).toHaveBeenCalledWith(fakeBlob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');

    createElementSpy.mockRestore();
    (globalThis as { URL: typeof URL }).URL = originalURL;
  });

  it('is inert (a no-op, no throw) when toBlob never resolves a blob', () => {
    const canvas = hud.canvas;
    canvas.toBlob = vi.fn((cb: (b: Blob | null) => void) => cb(null)) as unknown as typeof canvas.toBlob;
    expect(() => root.querySelector<HTMLButtonElement>('#sw-screenshot')?.click()).not.toThrow();
  });
});
