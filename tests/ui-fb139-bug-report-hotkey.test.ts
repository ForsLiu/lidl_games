/**
 * @vitest-environment jsdom
 *
 * fb139: drives the real `Game` end to end (same idiom as
 * tests/ui-fb078-dash-repeat-guard.test.ts) — F8 opens the note box, typing a
 * note and clicking Submit posts a bundle carrying the live run's class/
 * core/tier/wave/phase/tick/seed/content-hash/input-log/screenshot to
 * `/__bugreport/save`, and the run auto-pauses for the duration exactly like
 * Esc, resuming afterward since it was not already paused.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

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
  HTMLCanvasElement.prototype.toDataURL = (() => 'data:image/png;base64,AAAA') as never;
  window.requestAnimationFrame = (() => 0) as never;
  return document.getElementById('app') as HTMLElement;
}

interface GameInternals {
  paused: boolean;
  run: { world: World };
  pending: { k: string }[];
}

function startGame(root: HTMLElement): Game {
  const game = new Game();
  game.start(root);
  (root.querySelector('#sw-start') as HTMLElement).click();
  return game;
}

function pressF8(): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8' }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fb139: F8 opens a note box and posts a bug-report bundle', () => {
  it('F8 pauses the run, opens the box, and Submit posts the bundle then resumes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true, bugPath: '/tmp/bug-1.md' }) });
    vi.stubGlobal('fetch', fetchMock);

    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;
    g.run.world.phase = 'act1_wave';
    g.run.world.tick = 42;

    expect(g.paused).toBe(false);
    pressF8();
    expect(g.paused).toBe(true);

    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    textarea.value = 'the boss teleported through a wall';
    const submitBtn = document.querySelector('[data-act="submit"]') as HTMLButtonElement;
    submitBtn.click();

    // The box closes synchronously on submit; the POST itself is awaited
    // inside an async method the click handler does not block on.
    expect((document.querySelector('[data-testid="bugreport-box"]') as HTMLElement).hidden).toBe(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/__bugreport/save');
    const body = JSON.parse(init.body as string);
    expect(body.note).toBe('the boss teleported through a wall');
    expect(body.phase).toBe('act1_wave');
    expect(body.tick).toBe(42);
    expect(Array.isArray(body.recorded.inputLog)).toBe(true);
    expect(typeof body.screenshotPng).toBe('string');
    expect(body.screenshotPng.length).toBeGreaterThan(0);

    // Was not paused before F8, so it resumes once the report is filed.
    expect(g.paused).toBe(false);
  });

  it('Cancel closes the box and resumes without posting anything', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;
    g.run.world.phase = 'act1_wave';

    pressF8();
    expect(g.paused).toBe(true);
    (document.querySelector('[data-act="cancel"]') as HTMLButtonElement).click();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(g.paused).toBe(false);
  });

  it('does not resume a run that was already paused before F8', () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);

    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;
    g.run.world.phase = 'act1_wave';
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(g.paused).toBe(true);

    pressF8();
    (document.querySelector('[data-act="cancel"]') as HTMLButtonElement).click();
    expect(g.paused).toBe(true);
  });

  it('code-reviewer Critical (same session): typing into the open note box does not leak gameplay keys — Escape/Enter/upgrade/sell/actives never reach the sim while the box owns input', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ ok: true }) }));
    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;
    g.run.world.phase = 'act1_wave';

    pressF8();
    expect(g.paused).toBe(true);
    expect(g.pending.length).toBe(0);

    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    textarea.focus();
    // Every one of these has a live, unconditional gameplay effect in
    // `makeKeyDownHandler`/the outer `keydown` listener when NOT typed into
    // the box: Escape unconditionally calls togglePause, Enter queues
    // 'call', 'u'/'x' queue upgrade/sell, 'q'/'e' queue class actives, and
    // Space arms a queued dash. None of that may fire while the box is open
    // — the whole point of pausing to open it.
    for (const key of ['Escape', 'Enter', 'u', 'x', 'q', 'e', ' ', '1']) {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    }

    // Escape must not have resumed the run out from under the still-open box.
    expect(g.paused).toBe(true);
    // No gameplay Command was queued by any of the above keys.
    expect(g.pending.length).toBe(0);
    // The note box is still open and still holds focus/content normally —
    // typing was not otherwise disrupted.
    expect((document.querySelector('[data-testid="bugreport-box"]') as HTMLElement).hidden).toBe(false);
  });

  it('a second F8 while the box is already open does not reset the typed note', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ ok: true }) }));
    const root = mount();
    const game = startGame(root);
    const g = game as unknown as GameInternals;
    g.run.world.phase = 'act1_wave';

    pressF8();
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = 'partial note';
    pressF8();
    expect(textarea.value).toBe('partial note');
  });
});
