/**
 * @vitest-environment jsdom
 *
 * b069 (b068 follow-up, found by qa-playtester verifying b068): `Game.lastCfg`
 * (`src/ui/main.ts`) is captured once at `startRun` time and replayed verbatim
 * by `onRetry`/`onNewRun` (New Run spreads only a fresh seed over it).
 * `onToggleAutoPick` updated `this.meta.autoPickLevelUps` and the live sim's
 * `set_autopick` Command but never touched `lastCfg`, so a mid-run toggle
 * three-way split `Game`'s state: `meta`, the live sim, and `lastCfg` could
 * all disagree, and Retry/New Run silently reverted the setting to whatever
 * the run started with even though the sidebar button and Options checkbox
 * (both driven by `meta`/the live sim, not `lastCfg`) showed the toggled
 * value right up until the death.
 *
 * Drives the real `Game` (main.ts) end to end, same idiom as
 * `tests/b068-autopick-options-paused.test.ts`. `requestAnimationFrame` is
 * mocked to a no-op (as in every sibling autopick test), so the death is
 * forced directly on `World` rather than played out tick by tick — this test
 * is about `Game`'s own state plumbing across Retry, not sim combat.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { Game } from '../src/ui/main';
import { defaultMeta, saveMeta } from '../src/meta/meta';
import type { World } from '../src/sim/world';
import type { Hud } from '../src/ui/hud';

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

/** Forces the live run straight to the Results screen without playing it out. */
function forceDefeat(game: Game): void {
  const w = (game as unknown as { run: { world: World } }).run.world;
  w.outcome = 'defeat_core';
  w.phase = 'results';
  (game as unknown as { hud: Hud }).hud.syncModal(w);
}

describe('b069: Retry/New Run carry a mid-run auto-pick toggle instead of reverting it', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('Retry after toggling auto-pick on mid-run starts the new run with it on', () => {
    const root = mount();
    const game = new Game();
    game.start(root);

    (root.querySelector('#sw-start') as HTMLElement).click();

    const sidebarBtn = root.querySelector('#sw-autopick') as HTMLButtonElement;
    expect(sidebarBtn.getAttribute('aria-pressed')).toBe('false');
    sidebarBtn.click();
    expect(sidebarBtn.getAttribute('aria-pressed')).toBe('true');
    expect((game as unknown as { meta: { autoPickLevelUps: boolean } }).meta.autoPickLevelUps).toBe(true);

    forceDefeat(game);
    expect(root.querySelector('[data-act="retry"]')).not.toBeNull();
    (root.querySelector('[data-act="retry"]') as HTMLElement).click();

    const w = (game as unknown as { run: { world: World } }).run.world;
    expect(w.cfg.autoPickLevelUps).toBe(true);

    const newSidebarBtn = root.querySelector('#sw-autopick') as HTMLButtonElement;
    expect(newSidebarBtn.getAttribute('aria-pressed')).toBe('true');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    (root.querySelector('[data-act="options"]') as HTMLElement).click();
    const box = root.querySelector('#sw-opt-autopick') as HTMLInputElement;
    expect(box.checked).toBe(true);
  });

  it('New Run after toggling auto-pick off mid-run starts the new run with it off', () => {
    // Start with auto-pick already on (carried over from a previous session),
    // then toggle it off mid-run — the inverse direction from the Retry case.
    saveMeta({ ...defaultMeta(), autoPickLevelUps: true });
    const root = mount();
    const game = new Game();
    game.start(root);

    (root.querySelector('#sw-start') as HTMLElement).click();

    const sidebarBtn = root.querySelector('#sw-autopick') as HTMLButtonElement;
    sidebarBtn.click();
    expect(sidebarBtn.getAttribute('aria-pressed')).toBe('false');

    forceDefeat(game);
    (root.querySelector('[data-act="newrun"]') as HTMLElement).click();

    const w = (game as unknown as { run: { world: World } }).run.world;
    expect(w.cfg.autoPickLevelUps).toBe(false);

    const newSidebarBtn = root.querySelector('#sw-autopick') as HTMLButtonElement;
    expect(newSidebarBtn.getAttribute('aria-pressed')).toBe('false');
  });
});
