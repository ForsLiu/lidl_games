/**
 * @vitest-environment jsdom
 *
 * fb074: QUALITY.md BETA's "no progress loss on refresh" bar. `Game`
 * (`src/ui/main.ts`) now persists the running phase's `RunConfig` + full
 * input log to `localStorage` (`src/ui/runpersist.ts`), throttled to roughly
 * once per simulated second, and a fresh `Game.start()` replays a persisted
 * log forward through the same `Run`/`World` seed+input-log path G2's
 * determinism tests already exercise instead of always dropping to the Hub.
 * A content-hash mismatch (edited `/data` since the last session) is
 * discarded rather than replayed.
 *
 * Drives the real `Game` end to end via `#sw-start`/pause-menu clicks, same
 * idiom as tests/ui-fb071-blur-autopause.test.ts and
 * tests/ui-fb065-resize-listener.test.ts. `frame()` is called directly
 * (rAF stubbed to a no-op, matching every sibling `main.ts` test) with large
 * wall-clock jumps so the Pacer's 8-tick-per-frame catch-up cap advances the
 * sim deterministically without a real animation loop.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { contentHash, loadContent } from '../src/sim/content';
import { Run } from '../src/sim/run';
import type { RunConfig } from '../src/sim/types';
import type { World } from '../src/sim/world';
import { Game } from '../src/ui/main';
import { RUN_PERSIST_KEY } from '../src/ui/runpersist';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

/**
 * Every sibling `main.ts` test stubs `getContext` with just `setTransform`/
 * `scale` because none of them ever actually run `frame()` far enough to
 * reach `Renderer.draw()`. This test does (`tick64`), so it needs every 2D
 * context method `draw()` touches — a generic no-op `Proxy` covers that
 * without hand-enumerating canvas's large API surface, with the handful of
 * methods whose return value `draw()` actually reads (gradients,
 * `measureText`) special-cased.
 */
function makeCtx(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => {} };
  const base: Record<string, unknown> = {
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    measureText: () => ({ width: 0 }),
  };
  return new Proxy(base, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      const fn = () => {};
      target[prop] = fn;
      return fn;
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function mount(): HTMLElement {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  HTMLCanvasElement.prototype.getContext = (() => makeCtx()) as never;
  window.requestAnimationFrame = (() => 0) as never;
  return document.getElementById('app') as HTMLElement;
}

interface GameInternals {
  run: { world: World; hash: () => string } | null;
  frame: (now: number) => void;
  last: number;
}

/** Drives 8 frame() calls, each a large wall-clock jump — the Pacer's catch-up cap (8 ticks/frame at 1x) makes this exactly 64 sim ticks, crossing fb074's 60-tick persistence throttle at least once. */
function tick64(game: Game): void {
  const g = game as unknown as GameInternals;
  let now = g.last;
  for (let i = 0; i < 8; i++) {
    now += 300;
    g.frame(now);
  }
}

function persistedEntry(): { config: RunConfig; inputLog: unknown[] } | null {
  const raw = localStorage.getItem(RUN_PERSIST_KEY);
  return raw ? JSON.parse(raw) : null;
}

describe('fb074: an in-progress run persists and resumes after a fresh Game.start()', () => {
  it('persists after ~1s of ticking, and a fresh Game resumes it instead of showing the Hub', () => {
    localStorage.clear();
    const root1 = mount();
    const game1 = new Game();
    game1.start(root1);
    (root1.querySelector('#sw-start') as HTMLElement).click();
    tick64(game1);

    const persisted = persistedEntry();
    expect(persisted).not.toBeNull();
    expect(persisted!.inputLog.length).toBeGreaterThanOrEqual(60);
    expect(persisted!.config.contentHash).toBe(contentHash(loadContent()));

    // An independent replay of the same persisted log, built straight off
    // sim/run.ts with no Game/Hud involved, is the "uninterrupted run at the
    // same tick" reference this test checks the real resume against. `hash()`
    // is `Run`'s own end-state hash (`hashWorld`, `src/sim/run.ts`) — the
    // exact mechanism G2's determinism gate uses, and a far stronger check
    // than comparing a handful of individual fields (code-reviewer finding):
    // it covers RNG stream state, every cooldown/timer, and everything else
    // `hashWorld` hashes, not just the few fields this test happens to name.
    const content = loadContent();
    const reference = new Run(persisted!.config, content);
    for (const input of persisted!.inputLog) reference.step(input as never);

    const root2 = mount();
    const game2 = new Game();
    game2.start(root2);

    const g2 = game2 as unknown as GameInternals;
    expect(root2.querySelector('#sw-start')).toBeNull();
    expect(root2.querySelector('#sw-canvas')).not.toBeNull();
    expect(g2.run).not.toBeNull();
    expect(g2.run!.world.tick).toBe(reference.world.tick);
    expect(g2.run!.world.outcome).toBe(reference.world.outcome);
    expect(g2.run!.world.phase).toBe(reference.world.phase);
    expect(g2.run!.world.gold).toBe(reference.world.gold);
    expect(g2.run!.hash()).toBe(reference.hash());
  });

  it('a malformed persisted input log (a corrupted entry missing required fields) falls back to the Hub instead of crashing', () => {
    localStorage.clear();
    const root1 = mount();
    const game1 = new Game();
    game1.start(root1);
    (root1.querySelector('#sw-start') as HTMLElement).click();
    tick64(game1);
    const persisted = persistedEntry();
    expect(persisted).not.toBeNull();

    // A corrupted/hand-edited entry: one recorded TickInput has lost its
    // `cmds` array. `Run.step` does `for (const c of input.cmds)` with no
    // defensive check — replaying this uncaught would throw straight out of
    // `Game.start()` (code-reviewer finding), leaving a blank page on the
    // very refresh this feature exists to protect instead of the pre-fb074
    // Hub fallback.
    const raw = JSON.parse(localStorage.getItem(RUN_PERSIST_KEY)!);
    const mid = Math.floor(raw.inputLog.length / 2);
    delete raw.inputLog[mid].cmds;
    localStorage.setItem(RUN_PERSIST_KEY, JSON.stringify(raw));

    const root2 = mount();
    const game2 = new Game();
    expect(() => game2.start(root2)).not.toThrow();

    expect(root2.querySelector('#sw-start')).not.toBeNull();
    expect((game2 as unknown as GameInternals).run).toBeNull();
    expect(persistedEntry()).toBeNull();
  });

  it('discards a persisted log whose content hash no longer matches live /data, and clears the stale entry', () => {
    localStorage.clear();
    const root1 = mount();
    const game1 = new Game();
    game1.start(root1);
    (root1.querySelector('#sw-start') as HTMLElement).click();
    tick64(game1);
    expect(persistedEntry()).not.toBeNull();

    const raw = JSON.parse(localStorage.getItem(RUN_PERSIST_KEY)!);
    raw.config.contentHash = 'stale-hash-from-an-edited-data-dir';
    localStorage.setItem(RUN_PERSIST_KEY, JSON.stringify(raw));

    const root2 = mount();
    const game2 = new Game();
    game2.start(root2);

    expect(root2.querySelector('#sw-start')).not.toBeNull();
    expect((game2 as unknown as GameInternals).run).toBeNull();
    expect(persistedEntry()).toBeNull();
  });

  it('a defeated/victorious run clears the persisted entry, so a refresh on the Results screen does not resume it', () => {
    localStorage.clear();
    const root = mount();
    const game = new Game();
    game.start(root);
    (root.querySelector('#sw-start') as HTMLElement).click();
    tick64(game);
    expect(persistedEntry()).not.toBeNull();

    const g = game as unknown as GameInternals;
    g.run!.world.outcome = 'defeat_core';
    tick64(game);

    expect(persistedEntry()).toBeNull();
  });

  it('abandoning a run back to the Hub clears the persisted entry', () => {
    localStorage.clear();
    const root = mount();
    const game = new Game();
    game.start(root);
    (root.querySelector('#sw-start') as HTMLElement).click();
    tick64(game);
    expect(persistedEntry()).not.toBeNull();

    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    (root.querySelector('[data-act="quit"]') as HTMLElement).click();
    (root.querySelector('[data-act="confirm"]') as HTMLElement).click();

    expect(persistedEntry()).toBeNull();
    expect(root.querySelector('#sw-start')).not.toBeNull();
  });

  it('backs off instead of clobbering once a different session has claimed the persisted slot (cross-tab guard, code-reviewer finding)', () => {
    localStorage.clear();
    const root = mount();
    const game = new Game();
    game.start(root);
    (root.querySelector('#sw-start') as HTMLElement).click();
    tick64(game);
    const ownEntry = persistedEntry() as unknown as { sessionId: string };
    expect(ownEntry).not.toBeNull();

    // Simulate a second tab/window resuming the same on-disk checkpoint and
    // claiming the slot under its own sessionId since this instance's last
    // write — the exact scenario a second `Game.start()` sharing this
    // browser's localStorage would produce.
    const foreign = { ...ownEntry, sessionId: 'a-different-tabs-session-id' };
    localStorage.setItem(RUN_PERSIST_KEY, JSON.stringify(foreign));

    tick64(game);

    // This instance keeps playing fine in memory, but must not have
    // overwritten the foreign session's slot.
    const after = persistedEntry() as unknown as { sessionId: string };
    expect(after.sessionId).toBe('a-different-tabs-session-id');
  });

  it('does not wipe a different session\'s persisted entry when this instance abandons to the Hub', () => {
    localStorage.clear();
    const root = mount();
    const game = new Game();
    game.start(root);
    (root.querySelector('#sw-start') as HTMLElement).click();
    tick64(game);
    const ownEntry = persistedEntry() as unknown as { sessionId: string };
    expect(ownEntry).not.toBeNull();

    // A different tab/window has since claimed the slot (same setup as the
    // backoff test above).
    const foreign = { ...ownEntry, sessionId: 'yet-another-tabs-session-id' };
    localStorage.setItem(RUN_PERSIST_KEY, JSON.stringify(foreign));

    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    (root.querySelector('[data-act="quit"]') as HTMLElement).click();
    (root.querySelector('[data-act="confirm"]') as HTMLElement).click();

    const after = persistedEntry() as unknown as { sessionId: string };
    expect(after).not.toBeNull();
    expect(after.sessionId).toBe('yet-another-tabs-session-id');
  });

  it('boot with nothing persisted falls through to the Hub as before, without touching localStorage', () => {
    localStorage.clear();
    const root = mount();
    const game = new Game();
    game.start(root);

    expect(root.querySelector('#sw-start')).not.toBeNull();
    expect((game as unknown as GameInternals).run).toBeNull();
    expect(persistedEntry()).toBeNull();
  });
});
