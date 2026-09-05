/**
 * @vitest-environment jsdom
 *
 * fb089: `Hud.say()` used to be a single-slot toast with no queue or
 * priority — a second `say()` landing inside a first call's still-visible
 * ~1.4s window silently clobbered it. Reproduced against fb087's own
 * "Resume protection off (storage full)" warning: an `xp_overflow_gold`
 * `ingestFx()` toast landing right after it erased the warning with no trace
 * it was ever shown, quietly defeating fb087's player-visible intent for
 * the rest of that run.
 *
 * `Hud.say(text, priority?)` now takes an optional priority (default 0);
 * a toast already showing holds its full window against any same-or-lower
 * priority call (queued FIFO instead of clobbered), and is only preempted by
 * a strictly higher one. `main.ts`'s storage-full toast now calls
 * `say(text, 1)`, above the default-priority `xp_overflow_gold` toast.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Hud } from '../src/ui/hud';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function mountHud(): { root: HTMLElement; hud: Hud } {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
  const hud = new Hud(root, {
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
    onResume: () => {},
    onPause: () => {},
    onCycleSpeed: () => {},
    onSetSpeed: () => {},
    onDev: () => {},
    onQuitToHub: () => {},
    onHoverSkill: () => {},
    onUpgradeStructure: () => {},
    onSellStructure: () => {},
    onUpgradeCore: () => {},
  });
  return { root, hud };
}

describe('fb089: Hud toast priority/queue', () => {
  it('a higher-priority toast survives an immediate lower-priority call, which queues behind it', () => {
    const { root, hud } = mountHud();
    hud.say('Resume protection off for this run (storage full)', 1);
    hud.ingestFx([{ k: 'xp_overflow_gold', a: 3 }]);

    const toast = root.querySelector('#sw-toast') as HTMLElement;
    expect(toast.classList.contains('show')).toBe(true);
    expect(toast.textContent).toMatch(/storage full/i);
    expect(toast.textContent).not.toMatch(/gold/i);
  });

  it('a same-priority call also queues rather than clobbering the first', () => {
    const { root, hud } = mountHud();
    hud.say('first');
    hud.say('second');

    const toast = root.querySelector('#sw-toast') as HTMLElement;
    expect(toast.textContent).toBe('first');
  });

  it('a strictly higher-priority call preempts an already-showing lower-priority toast', () => {
    const { root, hud } = mountHud();
    hud.say('routine', 0);
    hud.say('urgent', 1);

    const toast = root.querySelector('#sw-toast') as HTMLElement;
    expect(toast.textContent).toBe('urgent');
  });

  it('when nothing is showing, a call displays immediately regardless of priority', () => {
    const { root, hud } = mountHud();
    hud.say('solo', 1);
    const toast = root.querySelector('#sw-toast') as HTMLElement;
    expect(toast.classList.contains('show')).toBe(true);
    expect(toast.textContent).toBe('solo');
  });

  describe('dequeue path (fake timers)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('a queued message surfaces once the showing toast\'s window elapses', () => {
      const { root, hud } = mountHud();
      hud.say('Resume protection off for this run (storage full)', 1);
      hud.ingestFx([{ k: 'xp_overflow_gold', a: 3 }]);

      const toast = root.querySelector('#sw-toast') as HTMLElement;
      expect(toast.textContent).toMatch(/storage full/i);

      vi.advanceTimersByTime(1400);

      expect(toast.classList.contains('show')).toBe(true);
      expect(toast.textContent).toMatch(/gold/i);
    });

    it('priority resets once the queue fully drains, so a later default-priority call is not blocked', () => {
      const { root, hud } = mountHud();
      const toast = root.querySelector('#sw-toast') as HTMLElement;

      hud.say('first', 1);
      vi.advanceTimersByTime(1400);
      expect(toast.classList.contains('show')).toBe(false);

      hud.say('second', 0);
      expect(toast.classList.contains('show')).toBe(true);
      expect(toast.textContent).toBe('second');
    });
  });
});
