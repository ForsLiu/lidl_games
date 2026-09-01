/**
 * @vitest-environment jsdom
 *
 * b065: `Hud.syncAutoPickToggle` only ran inside `hud.update(w, ...)`, which
 * `Game.frame` skips entirely while `this.paused` (`src/ui/main.ts`). Post-b030
 * the *semantic* state (the queued `set_autopick` Command, `this.meta.
 * autoPickLevelUps`, what actually applies on resume) already alternated
 * correctly across paused clicks, but the sidebar `#sw-autopick` button's own
 * `aria-pressed`/`.on` visual state stayed frozen at its pre-pause value until
 * the sim resumed and the next ticked `hud.update` caught it up. Fixed by
 * calling `hud.syncAutoPickToggle` directly from `onToggleAutoPick`, using the
 * same `on` value already computed for the Command/meta write.
 *
 * Drives the real `Game` (main.ts) end to end, same idiom as
 * `tests/b030-autopick-pause-toggle.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Game } from '../src/ui/main';

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

describe('b065: the sidebar auto-pick button tracks each click immediately while paused', () => {
  it('flips aria-pressed on every paused click instead of only catching up on resume', () => {
    const root = mount();
    const game = new Game();
    game.start(root);

    (root.querySelector('#sw-start') as HTMLElement).click();

    const btn = root.querySelector('#sw-autopick') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    const startPressed = btn.getAttribute('aria-pressed');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(root.querySelector('#sw-modal')).not.toBeNull();

    btn.click();
    expect(btn.getAttribute('aria-pressed')).toBe(String(startPressed !== 'true'));
    expect(btn.classList.contains('on')).toBe(startPressed !== 'true');

    btn.click();
    expect(btn.getAttribute('aria-pressed')).toBe(startPressed);
    expect(btn.classList.contains('on')).toBe(startPressed === 'true');
  });
});
