/**
 * @vitest-environment jsdom
 *
 * b030: `Game.onToggleAutoPick` (`src/ui/main.ts`) used to compute the
 * `set_autopick` Command's `on` value from `run.world.cfg.autoPickLevelUps`,
 * which only updates when a queued Command is actually applied inside
 * `run.step` — and `run.step` never runs while paused (`frame` returns
 * early). Two clicks on the pause Esc Options checkbox in a row, without
 * resuming in between, both read the same stale value and pushed the *same*
 * `on` twice instead of alternating, so the second click was a no-op on the
 * sim/profile side even though the checkbox's native `checked` state
 * visually flipped back. Fixed to read `this.meta.autoPickLevelUps`, which
 * this same callback updates synchronously regardless of pause state — the
 * same pattern `setShowRanges` already uses.
 *
 * Drives the real `Game` (main.ts) end to end: real Hub, real Hud DOM, real
 * pause/Options flow, so this reproduces the bug through the actual reachable
 * surface rather than a copy of its logic.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Game } from '../src/ui/main';
import type { Command } from '../src/sim/types';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function mount(): HTMLElement {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  // jsdom has no real 2d context; `Renderer`'s constructor only needs
  // `setTransform` (its one `resize()` call), same stub `ui-input.test.ts` uses.
  HTMLCanvasElement.prototype.getContext = (() => ({
    setTransform() {},
    scale() {},
  })) as never;
  // `Game.start` kicks off a real `requestAnimationFrame` loop that (a) this
  // test has no use for — it drives the DOM directly, never waits a frame —
  // and (b) would otherwise fire after the test body returns and throw on the
  // rest of `Renderer.draw`'s real 2d-context calls the stub above doesn't
  // cover, as an unhandled rejection that can bleed into later tests.
  window.requestAnimationFrame = (() => 0) as never;
  return document.getElementById('app') as HTMLElement;
}

/** Peeks at the private state the bug lives in — `main.ts` exposes no public seam for it. */
interface GameInternals {
  meta: { autoPickLevelUps: boolean };
  pending: Command[];
}

describe('b030: the pause Esc Options auto-pick checkbox survives two clicks in a row without resuming', () => {
  it('alternates the queued/persisted value on each click rather than repeating it', () => {
    const root = mount();
    const game = new Game();
    game.start(root);

    (root.querySelector('#sw-start') as HTMLElement).click();
    const g = game as unknown as GameInternals;
    const startValue = g.meta.autoPickLevelUps;

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    const modal = root.querySelector('#sw-modal') as HTMLElement;
    expect(modal).not.toBeNull();
    (modal.querySelector('[data-act="options"]') as HTMLElement).click();

    const box = root.querySelector('#sw-opt-autopick') as HTMLInputElement;
    expect(box).not.toBeNull();

    box.click();
    box.click();

    // Two toggles land back where it started, not stuck after the first.
    expect(g.meta.autoPickLevelUps).toBe(startValue);

    const autopickCmds = g.pending.filter(
      (c): c is { k: 'set_autopick'; on: boolean } => c.k === 'set_autopick',
    );
    expect(autopickCmds).toHaveLength(2);
    expect(autopickCmds[0].on).toBe(!startValue);
    expect(autopickCmds[1].on).toBe(startValue);
  });
});
