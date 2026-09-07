/**
 * @vitest-environment jsdom
 *
 * fb139: "Prod builds: F8 downloads the same bundle as a file instead" —
 * `vi.mock` overrides `isDevBuild()` for every importer in this file's
 * module graph, the same simulated-production-build idiom
 * `ui-fb094-screenshot-export-prod.test.ts` uses, split into its own file
 * so the mock doesn't leak into the dev-mode cases.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/meta/devprofile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/meta/devprofile')>();
  return { ...actual, isDevBuild: () => false };
});

import { Game } from '../src/ui/main';
import type { World } from '../src/sim/world';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function mount(): HTMLElement {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  HTMLCanvasElement.prototype.getContext = (() => ({
    setTransform() {},
    scale() {},
  })) as never;
  window.requestAnimationFrame = (() => 0) as never;
  return document.getElementById('app') as HTMLElement;
}

interface GameInternals {
  paused: boolean;
  run: { world: World };
  hud: { modalOpen: boolean; canvas: HTMLCanvasElement };
}

function startGame(root: HTMLElement): Game {
  const game = new Game();
  game.start(root);
  (root.querySelector('#sw-start') as HTMLElement).click();
  return game;
}

describe('fb139: F8 bug-report hotkey (simulated prod build)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof fetch;
  let clickSpy: ReturnType<typeof vi.fn>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let createElementSpy: any;
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let originalURL: typeof URL;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    originalURL = globalThis.URL;
    createObjectURL = vi.fn(() => 'blob:fake-bugreport-url');
    revokeObjectURL = vi.fn();
    (globalThis as { URL: typeof URL }).URL = {
      ...originalURL,
      createObjectURL,
      revokeObjectURL,
    } as unknown as typeof URL;

    clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') el.click = clickSpy;
      return el;
    });
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    (globalThis as { URL: typeof URL }).URL = originalURL;
    createElementSpy.mockRestore();
  });

  it('Confirm downloads the bundle as a JSON file instead of posting to a dev server', async () => {
    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;
    g.run.world.phase = 'act1_wave';
    // jsdom's `canvas.toBlob` exists as a function but never invokes its
    // callback (logs "Not implemented" and stops) — unlike a real browser,
    // where the spec guarantees the callback always eventually fires. Stub
    // it to resolve with `null` (a legitimate real-world case: an empty or
    // tainted canvas), which exercises `captureScreenshotBase64`'s own
    // graceful "no screenshot" path without hanging this test on jsdom's gap.
    g.hud.canvas.toBlob = ((cb: (b: Blob | null) => void) => cb(null)) as unknown as typeof g.hud.canvas.toBlob;

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8' }));
    const textarea = root.querySelector('#sw-bugreport-note') as HTMLTextAreaElement;
    textarea.value = 'prod-build repro note';
    textarea.dispatchEvent(new Event('input'));
    (root.querySelector('[data-act="bugreport-confirm"]') as HTMLElement).click();

    expect(g.paused).toBe(false);
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/json');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-bugreport-url');
  });
});
