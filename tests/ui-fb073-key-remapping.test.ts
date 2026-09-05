/**
 * @vitest-environment jsdom
 *
 * fb073 (QUALITY.md BETA Settings checklist, SPEC-FINAL §11): key remapping.
 * `input.ts`'s handlers now read a `KeyBindings` map instead of hardcoded
 * literals, and the Hub's Settings tab gets a "Controls" panel with
 * click-to-rebind, conflict detection, and a restore-defaults button.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Hub } from '../src/ui/hub';
import { Game } from '../src/ui/main';
import { defaultMeta } from '../src/meta/meta';
import { defaultSettings } from '../src/ui/settings';
import {
  ACTION_ORDER,
  defaultKeyBindings,
  rebindKey,
  sanitizeKeyBindings,
  UNBINDABLE_KEYS,
  type KeyBindings,
} from '../src/ui/keybindings';
import { gatherInput, makeKeyDownHandler, movementFromKeys } from '../src/ui/input';
import type { Command, MetaState } from '../src/sim/types';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function openHub(
  meta: MetaState = defaultMeta(),
  keyBindings: KeyBindings = defaultKeyBindings(),
  onKeyBindingsChanged: (kb: KeyBindings) => void = () => {},
): { root: HTMLElement; hub: Hub } {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
  const hub = new Hub(root, meta, 1, {
    settings: defaultSettings(),
    onStart: () => {},
    onMetaChanged: () => {},
    onSettingsChanged: () => {},
    keyBindings,
    onKeyBindingsChanged,
  });
  hub.show();
  hub.openTab('settings');
  return { root, hub };
}

describe('fb073: rebindKey — conflict detection', () => {
  it('reassigns an action to a free key', () => {
    const result = rebindKey(defaultKeyBindings(), 'active1', 'g');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bindings.active1).toBe('g');
  });

  it('rejects a key already bound to a different action, leaving the map untouched', () => {
    const base = defaultKeyBindings();
    // 'e' is active2's default.
    const result = rebindKey(base, 'active1', 'e');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.conflictWith).toBe('active2');
    // The caller only ever gets a fresh object back on success; the input
    // map itself is never mutated in place either way.
    expect(base.active1).toBe('q');
    expect(base.active2).toBe('e');
  });

  it('re-binding an action to the key it already holds is a no-op success, not a self-conflict', () => {
    const base = defaultKeyBindings();
    const result = rebindKey(base, 'active1', 'q');
    expect(result.ok).toBe(true);
  });
});

describe('fb073: sanitizeKeyBindings de-duplicates a corrupted/hand-edited save', () => {
  it('keeps the first action (in ACTION_ORDER) holding a duplicated key and resets the rest to default', () => {
    // moveDown corrupted to moveUp's key ('w') — moveUp comes first in ACTION_ORDER.
    const out = sanitizeKeyBindings({ ...defaultKeyBindings(), moveDown: 'w' });
    expect(out.moveUp).toBe('w');
    expect(out.moveDown).toBe('s'); // reset back to its own default
  });

  it('still fills in a missing action and lower-cases a stored key', () => {
    const partial = { ...defaultKeyBindings(), active1: 'G' } as Partial<KeyBindings>;
    delete (partial as { moveUp?: string }).moveUp;
    const out = sanitizeKeyBindings(partial);
    expect(out.active1).toBe('g');
    expect(out.moveUp).toBe('w');
  });
});

describe('fb073: input.ts reads the configured key, not a hardcoded literal', () => {
  it('a rebound Active1 key fires class_active; the old default key does nothing', () => {
    const bindings = { ...defaultKeyBindings(), active1: 'g' };
    const queue: Command[] = [];
    const handler = makeKeyDownHandler({ keys: new Set(), queue: { push: (c) => queue.push(c) }, bindings });

    handler(new window.KeyboardEvent('keydown', { key: 'q' }));
    expect(queue).toEqual([]);

    handler(new window.KeyboardEvent('keydown', { key: 'g' }));
    expect(queue).toEqual([{ k: 'class_active', aimX: undefined, aimY: undefined }]);
  });

  it('a rebound movement key changes movementFromKeys, without breaking the arrow-key alternate', () => {
    const bindings = { ...defaultKeyBindings(), moveUp: 'i' };
    expect(movementFromKeys(new Set(['w']), bindings)).toEqual({ mx: 0, my: 0 });
    expect(movementFromKeys(new Set(['i']), bindings)).toEqual({ mx: 0, my: -1 });
    expect(movementFromKeys(new Set(['arrowup']), bindings)).toEqual({ mx: 0, my: -1 });
  });

  it('gatherInput reads active1Held off the rebound key', () => {
    const bindings = { ...defaultKeyBindings(), active1: 'g' };
    const heldQ = gatherInput(new Set(['q']), [], 0, 0, false, bindings);
    expect(heldQ.active1Held).toBe(false);
    const heldG = gatherInput(new Set(['g']), [], 0, 0, false, bindings);
    expect(heldG.active1Held).toBe(true);
  });

  it('an unrebound handler (no bindings arg) still behaves exactly like the pre-fb073 defaults', () => {
    const queue: Command[] = [];
    const handler = makeKeyDownHandler({ keys: new Set(), queue: { push: (c) => queue.push(c) } });
    handler(new window.KeyboardEvent('keydown', { key: 'q' }));
    expect(queue).toEqual([{ k: 'class_active', aimX: undefined, aimY: undefined }]);
  });
});

describe('fb073: Settings "Controls" panel — click-to-rebind', () => {
  it('lists every rebindable action with its current key', () => {
    const { root } = openHub();
    const buttons = [...root.querySelectorAll<HTMLElement>('[data-rebind]')];
    expect(buttons).toHaveLength(ACTION_ORDER.length);
    const dash = buttons.find((b) => b.dataset.rebind === 'dash')!;
    expect(dash.textContent?.trim()).toBe('Space');
  });

  it('clicking a binding arms it, and the next keydown reassigns it', () => {
    let saved: KeyBindings | null = null;
    const { root } = openHub(defaultMeta(), defaultKeyBindings(), (kb) => (saved = kb));
    const button = root.querySelector<HTMLElement>('[data-rebind="active1"]')!;
    button.click();

    expect(root.querySelector<HTMLElement>('[data-rebind="active1"]')?.textContent?.trim()).toBe('Press a key…');

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'g' }));

    expect(saved).not.toBeNull();
    expect((saved as unknown as KeyBindings).active1).toBe('g');
    const rebound = root.querySelector<HTMLElement>('[data-rebind="active1"]')!;
    expect(rebound.textContent?.trim()).toBe('G');
  });

  it('rejects a key already used by another action and leaves the old assignment intact', () => {
    let saved: KeyBindings | null = null;
    const { root } = openHub(defaultMeta(), defaultKeyBindings(), (kb) => (saved = kb));
    const button = root.querySelector<HTMLElement>('[data-rebind="active1"]')!;
    button.click();

    // 'e' is active2's default — a genuine conflict.
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'e' }));

    expect(saved).toBeNull(); // onKeyBindingsChanged never fired
    expect(root.querySelector<HTMLElement>('[data-rebind="active1"]')?.textContent?.trim()).toBe('Q');
    expect(root.querySelector<HTMLElement>('[data-rebind="active2"]')?.textContent?.trim()).toBe('E');
    expect(root.textContent).toMatch(/already bound/i);
  });

  it('Escape cancels listening without changing anything', () => {
    let saved: KeyBindings | null = null;
    const { root } = openHub(defaultMeta(), defaultKeyBindings(), (kb) => (saved = kb));
    root.querySelector<HTMLElement>('[data-rebind="active1"]')!.click();
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));

    expect(saved).toBeNull();
    expect(root.querySelector<HTMLElement>('[data-rebind="active1"]')?.textContent?.trim()).toBe('Q');
  });

  it('"Restore default controls" reverts every rebound action', () => {
    let saved: KeyBindings | null = null;
    const custom: KeyBindings = { ...defaultKeyBindings(), active1: 'g', dash: 'j' };
    const { root } = openHub(defaultMeta(), custom, (kb) => (saved = kb));

    expect(root.querySelector<HTMLElement>('[data-rebind="active1"]')?.textContent?.trim()).toBe('G');

    root.querySelector<HTMLElement>('#sw-keybind-reset')!.click();

    expect(saved).toEqual(defaultKeyBindings());
    expect(root.querySelector<HTMLElement>('[data-rebind="active1"]')?.textContent?.trim()).toBe('Q');
    expect(root.querySelector<HTMLElement>('[data-rebind="dash"]')?.textContent?.trim()).toBe('Space');
  });

  it('rejects an arrow key as a rebind target — it stays live as the movement alternate regardless of bindings', () => {
    let saved: KeyBindings | null = null;
    const { root } = openHub(defaultMeta(), defaultKeyBindings(), (kb) => (saved = kb));
    root.querySelector<HTMLElement>('[data-rebind="active1"]')!.click();

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp' }));

    expect(saved).toBeNull();
    expect(UNBINDABLE_KEYS.has('arrowup')).toBe(true);
    expect(root.querySelector<HTMLElement>('[data-rebind="active1"]')?.textContent?.trim()).toBe('Q');
    expect(root.textContent).toMatch(/reserved for movement/i);
  });

  it('leaving the Settings tab mid-rebind detaches the capture listener (no stray rebind on another tab)', () => {
    let saved: KeyBindings | null = null;
    const { root, hub } = openHub(defaultMeta(), defaultKeyBindings(), (kb) => (saved = kb));
    root.querySelector<HTMLElement>('[data-rebind="active1"]')!.click();

    hub.openTab('run');
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'g' }));

    expect(saved).toBeNull();
  });
});

/**
 * Drives the real `Game` (main.ts) end to end, same idiom as
 * `tests/b069-retry-autopick-lastcfg.test.ts`.
 *
 * code-reviewer (fb073): `bindGlobalInput` runs at most once, guarded by
 * `Game.inputBound`, and hands `makeKeyDownHandler` a `bindings` object it
 * closes over for the rest of the session. A rebind made from the Hub
 * between two runs used to reassign `Game.keyBindings` to a brand-new
 * object, leaving that already-bound closure aliasing the stale one — every
 * keydown-dispatched action (Q/E, R/F/C/P/V/U/X, tower-slot digits) would
 * silently keep responding to the *old* key after the very first run,
 * regardless of any later rebind. Movement and mouse-related bindings were
 * unaffected (`gatherInput`/`bindCanvasInput` both re-read the field live),
 * which is exactly why the bug was easy to miss testing only `input.ts` in
 * isolation. Fixed by mutating `Game.keyBindings` in place
 * (`Object.assign`) instead of replacing the reference.
 */
describe('fb073: a Hub rebind between runs takes effect in the next run (Game-level regression)', () => {
  function mountGame(): HTMLElement {
    document.head.innerHTML = `<style>${CSS}</style>`;
    document.body.innerHTML = '<div id="app"></div>';
    HTMLCanvasElement.prototype.getContext = (() => ({ setTransform() {}, scale() {} })) as never;
    window.requestAnimationFrame = (() => 0) as never;
    return document.getElementById('app') as HTMLElement;
  }

  it('the rebound key dispatches the action and the old default key no longer does', () => {
    const root = mountGame();
    const game = new Game();
    game.start(root);
    (root.querySelector('#sw-start') as HTMLElement).click();

    // Quit back to the Hub.
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    (root.querySelector('[data-act="quit"]') as HTMLElement).click();
    (root.querySelector('[data-act="confirm"]') as HTMLElement).click();

    // Rebind Active1 (default 'q') to 'g' from the Controls panel.
    (root.querySelector('[data-tab="settings"]') as HTMLElement).click();
    (root.querySelector('[data-rebind="active1"]') as HTMLElement).click();
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'g' }));

    // Start a second run — this is the `bindGlobalInput`-runs-once path.
    (root.querySelector('[data-tab="run"]') as HTMLElement).click();
    (root.querySelector('#sw-start') as HTMLElement).click();

    const pending = (): Command[] => (game as unknown as { pending: Command[] }).pending;

    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'q' }));
    expect(pending().some((c) => c.k === 'class_active')).toBe(false);

    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'g' }));
    expect(pending().some((c) => c.k === 'class_active')).toBe(true);
  });
});
