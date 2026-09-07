/**
 * @vitest-environment jsdom
 *
 * fb139: F8 opens a small note box (`Hud.showBugReportBox`), pausing the run
 * the same way Esc does — `syncModal` no-ops while paused, which is what
 * keeps the box from being wiped by the next frame. Confirm gathers
 * `{ config, inputLog }` (truncated to the tick the report was taken at,
 * the same `RecordedRun` shape architecture rule 2's replay/hash machinery
 * uses) plus a screenshot and posts it to the dev-server endpoint — this
 * file runs under Vitest's default dev-build env (`isDevBuild()` true), same
 * as `ui-fb094-screenshot-export.test.ts`; see
 * `ui-fb139-bugreport-hotkey-prod.test.ts` for the download-instead case.
 *
 * Drives the real `Game` end to end, same idiom as
 * `tests/ui-fb077-dash-queued-pause.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Game } from '../src/ui/main';
import type { World } from '../src/sim/world';
import { emptyInput } from '../src/sim/types';

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
  run: { world: World; step: (input: unknown) => void };
  inputLog: unknown[];
  hud: { modalOpen: boolean; canvas: HTMLCanvasElement };
}

function startGame(root: HTMLElement): Game {
  const game = new Game();
  game.start(root);
  (root.querySelector('#sw-start') as HTMLElement).click();
  return game;
}

const FAKE_PNG_BLOB = { size: 4, type: 'image/png' } as Blob;

function stubCanvasToBlob(g: GameInternals): void {
  g.hud.canvas.toBlob = ((cb: (b: Blob | null) => void) => {
    (FAKE_PNG_BLOB as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = () =>
      Promise.resolve(new Uint8Array([1, 2, 3, 4]).buffer);
    cb(FAKE_PNG_BLOB);
  }) as unknown as typeof g.hud.canvas.toBlob;
}

describe('fb139: F8 bug-report hotkey (dev build)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn(async () => ({ json: async () => ({ ok: true, mdPath: 'x', replayPath: 'y' }) })) as never;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('F8 opens the note box and pauses the run', () => {
    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;
    g.run.world.phase = 'act1_wave';

    expect(g.hud.modalOpen).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8' }));
    expect(g.paused).toBe(true);
    expect(g.hud.modalOpen).toBe(true);
    expect(root.querySelector('#sw-bugreport-note')).not.toBeNull();
    expect(root.querySelector('[data-act="bugreport-confirm"]')).not.toBeNull();
  });

  it('does nothing while already paused or another modal is open', () => {
    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;
    g.run.world.phase = 'act1_wave';

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(g.paused).toBe(true);
    const modalBefore = root.querySelector('#sw-modal')?.innerHTML;

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8' }));
    // Still the plain Pause card, not the bug-report box — F8 was a no-op.
    expect(root.querySelector('#sw-bugreport-note')).toBeNull();
    expect(root.querySelector('#sw-modal')?.innerHTML).toBe(modalBefore);
  });

  // qa-playtester finding: an empty/whitespace note used to post silently
  // and close the box exactly like a real success.
  it('Send starts disabled and stays disabled for a whitespace-only note; never calls fetch', () => {
    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;
    g.run.world.phase = 'act1_wave';

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8' }));
    const textarea = root.querySelector('#sw-bugreport-note') as HTMLTextAreaElement;
    const sendBtn = root.querySelector('[data-act="bugreport-confirm"]') as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(true);

    textarea.value = '   ';
    textarea.dispatchEvent(new Event('input'));
    expect(sendBtn.disabled).toBe(true);
    sendBtn.click();
    expect(g.paused).toBe(true); // still open — the click was a no-op
    expect(fetchMock).not.toHaveBeenCalled();

    textarea.value = '  a real note  ';
    textarea.dispatchEvent(new Event('input'));
    expect(sendBtn.disabled).toBe(false);
  });

  it('surfaces a toast when the dev server rejects the save, rather than resuming silently', async () => {
    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;
    g.run.world.phase = 'act1_wave';
    stubCanvasToBlob(g);
    fetchMock.mockImplementation(async () => ({ json: async () => ({ ok: false, errors: [{ path: 'note', message: 'x' }] }) }));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8' }));
    const textarea = root.querySelector('#sw-bugreport-note') as HTMLTextAreaElement;
    textarea.value = 'a real note';
    textarea.dispatchEvent(new Event('input'));
    (root.querySelector('[data-act="bugreport-confirm"]') as HTMLElement).click();

    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(root.querySelector('#sw-toast')?.textContent).toMatch(/not saved/i);
  });

  it('Cancel closes the box, resumes the run, and never calls fetch', () => {
    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;
    g.run.world.phase = 'act1_wave';

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8' }));
    (root.querySelector('[data-act="bugreport-cancel"]') as HTMLElement).click();

    expect(g.paused).toBe(false);
    expect(g.hud.modalOpen).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Confirm resumes the run and posts config+inputLog+meta+screenshot to the dev endpoint', async () => {
    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;
    g.run.world.phase = 'act1_wave';
    stubCanvasToBlob(g);

    // Advance a couple of real ticks so the inputLog/tick captured is not
    // trivially empty — mirrors a player having actually played before
    // pressing F8.
    for (let i = 0; i < 3; i++) {
      const input = emptyInput();
      g.inputLog.push(input);
      g.run.step(input);
    }
    const tickAtReport = g.run.world.tick;

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8' }));
    const textarea = root.querySelector('#sw-bugreport-note') as HTMLTextAreaElement;
    textarea.value = 'the mortar stopped firing after upgrade 3';
    textarea.dispatchEvent(new Event('input'));
    (root.querySelector('[data-act="bugreport-confirm"]') as HTMLElement).click();

    expect(g.paused).toBe(false);
    expect(g.hud.modalOpen).toBe(false);

    // The POST itself is fired async (screenshot capture awaits a
    // microtask) — flush it before asserting on the call.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/__bugreport/save');
    const body = JSON.parse(init.body as string);
    expect(body.note).toBe('the mortar stopped firing after upgrade 3');
    expect(body.meta.tick).toBe(tickAtReport);
    expect(body.meta.classKey).toBe(g.run.world.cfg.classKey);
    expect(Array.isArray(body.inputLog)).toBe(true);
    expect(body.inputLog.length).toBe(tickAtReport);
    expect(typeof body.config).toBe('object');
    expect(typeof body.screenshotBase64).toBe('string');
  });
});
