/**
 * @vitest-environment jsdom
 *
 * fb096 (QUALITY.md 1.0 Steam/itch checklist: "save slots (3)"). `src/ui/
 * saveslots.ts` layers 3 independent storage keys on top of `src/meta/
 * meta.ts`'s single `SAVE_KEY` without editing that (out-of-scope) module —
 * the active slot's data always lives live in `SAVE_KEY`, mirrored into a
 * dedicated per-slot key only at the moment of a switch.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Hub } from '../src/ui/hub';
import { SAVE_KEY, defaultMeta, loadMeta, saveMeta } from '../src/meta/meta';
import { defaultSettings } from '../src/ui/settings';
import type { MetaState } from '../src/sim/types';
import {
  SAVE_SLOT_COUNT,
  deleteSlot,
  ensureActiveSlotMigrated,
  getActiveSlot,
  slotHasData,
  switchToSlot,
} from '../src/ui/saveslots';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function openHub(meta: MetaState = defaultMeta(), onMetaChanged: (m: MetaState) => void = () => {}): {
  root: HTMLElement;
  hub: Hub;
} {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
  const hub = new Hub(root, meta, 1, {
    settings: defaultSettings(),
    onStart: () => {},
    onMetaChanged,
    onSettingsChanged: () => {},
  });
  hub.show();
  hub.openTab('settings');
  return { root, hub };
}

const realLocation = window.location;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  Object.defineProperty(window, 'location', { value: realLocation, writable: true, configurable: true });
});

describe('fb096: save-slots module', () => {
  it('a fresh profile (no prior save) defaults to slot 0 active with no data anywhere', () => {
    ensureActiveSlotMigrated();
    expect(getActiveSlot()).toBe(0);
    for (let i = 0; i < SAVE_SLOT_COUNT; i++) expect(slotHasData(i)).toBe(false);
  });

  it('migration: a pre-existing single save appears intact in slot 1 the first time the slot-aware loader runs', () => {
    const legacy = { ...defaultMeta(), skillPoints: 42 };
    saveMeta(legacy);

    ensureActiveSlotMigrated();

    expect(getActiveSlot()).toBe(0);
    expect(slotHasData(0)).toBe(true);
    // SAVE_KEY itself is untouched by migration — loadMeta() keeps working.
    expect(loadMeta().skillPoints).toBe(42);
    // A dedicated copy also exists under slot 1's own key.
    expect(localStorage.getItem('stonewake.save.slot1.v1')).toBe(localStorage.getItem(SAVE_KEY));
  });

  it('migration is a no-op on a later boot (does not clobber an already-recorded active slot)', () => {
    ensureActiveSlotMigrated();
    switchToSlot(1);
    saveMeta({ ...defaultMeta(), skillPoints: 7 });

    ensureActiveSlotMigrated();

    expect(getActiveSlot()).toBe(1);
    expect(loadMeta().skillPoints).toBe(7);
  });

  it('independent progress in slot 1 and slot 2 persists independently across a simulated reload', () => {
    ensureActiveSlotMigrated();
    saveMeta({ ...defaultMeta(), skillPoints: 10 });
    expect(loadMeta().skillPoints).toBe(10);

    expect(switchToSlot(1)).toBe(true);
    // A never-used slot loads as a fresh account, not slot 0's leftover state.
    expect(loadMeta().skillPoints).toBe(0);
    saveMeta({ ...defaultMeta(), skillPoints: 25 });
    expect(loadMeta().skillPoints).toBe(25);

    // Simulated reload: re-read via the ordinary loader with nothing else touched.
    expect(loadMeta().skillPoints).toBe(25);

    expect(switchToSlot(0)).toBe(true);
    expect(loadMeta().skillPoints).toBe(10);

    expect(switchToSlot(1)).toBe(true);
    expect(loadMeta().skillPoints).toBe(25);
  });

  it('switching to the already-active slot, or an out-of-range slot, is a no-op', () => {
    ensureActiveSlotMigrated();
    saveMeta({ ...defaultMeta(), skillPoints: 5 });
    expect(switchToSlot(0)).toBe(false);
    expect(switchToSlot(-1)).toBe(false);
    expect(switchToSlot(SAVE_SLOT_COUNT)).toBe(false);
    expect(loadMeta().skillPoints).toBe(5);
  });

  /**
   * fb101 (qa-playtester finding): a failure on `switchToSlot`'s third and
   * final write (the active-slot pointer) must fail the whole call closed —
   * not report success while the pointer never actually moved.
   */
  it('a storage failure on the active-slot-pointer write fails switchToSlot closed', () => {
    ensureActiveSlotMigrated();
    // Both slot 0 and slot 1 must already hold data so `switchToSlot`'s flush
    // and load steps both take the `setItem` branch (not `removeItem`) —
    // otherwise the pointer write isn't actually the 3rd `setItem` call.
    saveMeta({ ...defaultMeta(), skillPoints: 5 });
    switchToSlot(1);
    saveMeta({ ...defaultMeta(), skillPoints: 9 });
    switchToSlot(0);
    expect(getActiveSlot()).toBe(0);

    const realSetItem = Storage.prototype.setItem.bind(localStorage);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    let calls = 0;
    setItem.mockImplementation((key, value) => {
      calls++;
      if (calls === 3) throw new Error('quota exceeded');
      realSetItem(key, value);
    });

    expect(switchToSlot(1)).toBe(false);
    setItem.mockRestore();
    expect(calls).toBe(3);
    expect(getActiveSlot()).toBe(0);
  });

  it('deleteSlot removes a non-active slot without touching the live save', () => {
    ensureActiveSlotMigrated();
    saveMeta({ ...defaultMeta(), skillPoints: 5 });
    switchToSlot(1);
    saveMeta({ ...defaultMeta(), skillPoints: 9 });
    switchToSlot(0);

    expect(slotHasData(1)).toBe(true);
    expect(deleteSlot(1)).toBe(true);
    expect(slotHasData(1)).toBe(false);
    expect(loadMeta().skillPoints).toBe(5); // active slot 0 untouched
  });

  it('deleteSlot on the active slot also clears the live SAVE_KEY', () => {
    ensureActiveSlotMigrated();
    saveMeta({ ...defaultMeta(), skillPoints: 5 });
    expect(deleteSlot(0)).toBe(true);
    expect(localStorage.getItem(SAVE_KEY)).toBeNull();
    expect(loadMeta().skillPoints).toBe(0); // falls back to defaultMeta()
  });
});

describe('fb096: Settings tab Save Slots panel', () => {
  it('lists all 3 slots, marking the active one and disabling its own Switch button', () => {
    ensureActiveSlotMigrated();
    const { root } = openHub();
    const rows = root.querySelectorAll('.sw-slotrow');
    expect(rows.length).toBe(SAVE_SLOT_COUNT);
    expect(root.textContent).toContain('Slot 1 (active)');
    const switchButtons = root.querySelectorAll<HTMLButtonElement>('[data-slot-switch]');
    expect(switchButtons[0].disabled).toBe(true);
    expect(switchButtons[1].disabled).toBe(false);
  });

  it('an empty slot is labeled empty and its Delete button is disabled', () => {
    ensureActiveSlotMigrated();
    const { root } = openHub();
    expect(root.textContent).toContain('Slot 2 — empty');
    const deleteButtons = root.querySelectorAll<HTMLButtonElement>('[data-slot-delete]');
    expect(deleteButtons[1].disabled).toBe(true);
  });

  it('clicking Switch moves the active slot and reloads the page immediately, without touching in-memory meta', () => {
    ensureActiveSlotMigrated();
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { value: { reload }, writable: true, configurable: true });
    let changedMeta: MetaState | null = null;
    const { root } = openHub(defaultMeta(), (m) => {
      changedMeta = m;
    });

    root.querySelector<HTMLButtonElement>('[data-slot-switch="1"]')?.click();

    expect(getActiveSlot()).toBe(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(changedMeta).toBeNull();
  });

  /**
   * fb100 (qa-playtester finding against fb096's first draft): switching used
   * to only show an advisory "please reload" notice, leaving this already-
   * constructed `Hub`'s stale in-memory `this.meta` free to keep mutating and
   * re-saving over the *new* active slot's `SAVE_KEY` via any other Settings
   * control before the player manually reloaded — silently corrupting the
   * slot just switched into. An immediate reload closes that window; this
   * confirms `window.location.reload` is what actually gets called, the
   * concrete mechanism the fix relies on.
   */
  it('a failed/unavailable reload falls back to the advisory notice instead of leaving the stale Hub silently mutable', () => {
    ensureActiveSlotMigrated();
    Object.defineProperty(window, 'location', {
      value: {
        reload: () => {
          throw new Error('reload unavailable in this embedding');
        },
      },
      writable: true,
      configurable: true,
    });
    const { root } = openHub();

    root.querySelector<HTMLButtonElement>('[data-slot-switch="1"]')?.click();

    expect(getActiveSlot()).toBe(1);
    expect(root.textContent).toContain('Switched to Slot 2. Reload the page to continue on it.');
  });

  it('deleting the active slot resets in-memory meta via onMetaChanged and shows a confirmation notice', () => {
    ensureActiveSlotMigrated();
    saveMeta({ ...defaultMeta(), skillPoints: 33 });
    let changedMeta: MetaState | null = null;
    const { root } = openHub({ ...defaultMeta(), skillPoints: 33 }, (m) => {
      changedMeta = m;
    });

    root.querySelector<HTMLButtonElement>('[data-slot-delete="0"]')?.click();

    expect((changedMeta as MetaState | null)?.skillPoints).toBe(0);
    expect(root.textContent).toContain('Slot 1 deleted.');
    expect(loadMeta().skillPoints).toBe(0);
  });

  it('deleting a non-active, populated slot does not call onMetaChanged', () => {
    ensureActiveSlotMigrated();
    switchToSlot(1);
    saveMeta({ ...defaultMeta(), skillPoints: 12 });
    switchToSlot(0);

    let called = false;
    const { root } = openHub(defaultMeta(), () => {
      called = true;
    });

    root.querySelector<HTMLButtonElement>('[data-slot-delete="1"]')?.click();

    expect(called).toBe(false);
    expect(root.textContent).toContain('Slot 2 deleted.');
  });
});
