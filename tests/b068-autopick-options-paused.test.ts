/**
 * @vitest-environment jsdom
 *
 * b068 (b065 follow-up): the pause-menu Options screen's `#sw-opt-autopick`
 * checkbox (`Hud.showPause`) rendered its `checked` state from the sim's own
 * `w.cfg.autoPickLevelUps`, which only updates when the queued `set_autopick`
 * Command is actually applied inside `run.step` — and that never runs while
 * paused (`Game.frame` returns early). b030 already fixed this staleness
 * class for `onToggleAutoPick`'s own read, and b065 fixed it for the sidebar
 * `#sw-autopick` button's visual sync, but `showPause`'s Options screen was a
 * third, untouched call site: pausing, clicking the sidebar button once (so
 * the sim's `cfg.autoPickLevelUps` is now one click behind), then opening
 * Options showed the pre-toggle value, disagreeing with the sidebar button
 * for the same underlying setting within the same paused session.
 *
 * Drives the real `Game` (main.ts) end to end, same idiom as
 * `tests/b065-autopick-sidebar-paused.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { Game } from '../src/ui/main';
import { defaultMeta, saveMeta } from '../src/meta/meta';

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

describe('b068: the pause Options auto-pick checkbox agrees with the sidebar button while paused', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reflects the just-toggled value immediately, not the pre-toggle sim state', () => {
    const root = mount();
    const game = new Game();
    game.start(root);

    (root.querySelector('#sw-start') as HTMLElement).click();

    const btn = root.querySelector('#sw-autopick') as HTMLButtonElement;
    expect(btn).not.toBeNull();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(root.querySelector('#sw-modal')).not.toBeNull();

    btn.click();
    const pressedAfterToggle = btn.getAttribute('aria-pressed') === 'true';

    (root.querySelector('[data-act="options"]') as HTMLElement).click();
    const box = root.querySelector('#sw-opt-autopick') as HTMLInputElement;
    expect(box).not.toBeNull();
    expect(box.checked).toBe(pressedAfterToggle);
  });

  it('a second paused toggle before opening Options still agrees', () => {
    const root = mount();
    const game = new Game();
    game.start(root);

    (root.querySelector('#sw-start') as HTMLElement).click();

    const btn = root.querySelector('#sw-autopick') as HTMLButtonElement;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    btn.click();
    btn.click();
    const pressedAfterToggle = btn.getAttribute('aria-pressed') === 'true';

    (root.querySelector('[data-act="options"]') as HTMLElement).click();
    const box = root.querySelector('#sw-opt-autopick') as HTMLInputElement;
    expect(box.checked).toBe(pressedAfterToggle);
  });

  // code-reviewer finding on this item: a freshly constructed `Hud`'s cached
  // `autoPickOn` (the fix's own source of truth) only gets set by
  // `syncAutoPickToggle`, which `update()` never calls on a paused frame and
  // which a click hasn't fired yet either — so a returning player whose
  // carried-over `meta.autoPickLevelUps` is already true, who pauses before
  // ever touching the sidebar button, must still see Options agree with the
  // setting that will actually apply on resume. This is the path `main.ts`'s
  // `startRun` now seeds explicitly.
  it('a returning player with autopick already on sees it correctly on the very first pause, before any click', () => {
    saveMeta({ ...defaultMeta(), autoPickLevelUps: true });
    const root = mount();
    const game = new Game();
    game.start(root);

    (root.querySelector('#sw-start') as HTMLElement).click();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    (root.querySelector('[data-act="options"]') as HTMLElement).click();
    const box = root.querySelector('#sw-opt-autopick') as HTMLInputElement;
    expect(box.checked).toBe(true);
  });
});
