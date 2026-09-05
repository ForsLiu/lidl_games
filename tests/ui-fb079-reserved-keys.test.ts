/**
 * @vitest-environment jsdom
 *
 * fb079: two hardcoded, never-rebindable literals in `input.ts`'s
 * `makeKeyDownHandler` — the unconditional `Enter` call-wave trigger, and
 * the level-up offer picker's literal `1`/`2`/`3` — were not covered by
 * `UNBINDABLE_KEYS`, so the Hub's rebind-conflict check never protected
 * them: a different action could be silently rebound onto either, and both
 * the hardcoded behavior and the rebound action would fire off one keypress.
 * `reservedKeyLabel` (keybindings.ts) closes the gap; `1`/`2`/`3` stay
 * reserved against every action EXCEPT the matching towerSlot1/2/3, which
 * already legitimately shares the picker's physical key by design.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Hub } from '../src/ui/hub';
import { defaultMeta } from '../src/meta/meta';
import { defaultSettings } from '../src/ui/settings';
import { defaultKeyBindings, reservedKeyLabel, type KeyBindings } from '../src/ui/keybindings';
import type { MetaState } from '../src/sim/types';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function openHub(
  keyBindings: KeyBindings = defaultKeyBindings(),
  onKeyBindingsChanged: (kb: KeyBindings) => void = () => {},
): { root: HTMLElement; hub: Hub } {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
  const meta: MetaState = defaultMeta();
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

describe('fb079: reservedKeyLabel', () => {
  it('reserves Enter against every action', () => {
    expect(reservedKeyLabel('sellSelection', 'Enter')).toBe('Enter');
    expect(reservedKeyLabel('towerSlot1', 'enter')).toBe('Enter');
  });

  it('reserves 1/2/3 against any action other than the matching towerSlot1-3', () => {
    expect(reservedKeyLabel('sellSelection', '1')).toBe('1');
    expect(reservedKeyLabel('active1', '2')).toBe('2');
    expect(reservedKeyLabel('clearSelection', '3')).toBe('3');
  });

  it('does not reserve 1/2/3 against their own matching towerSlot action', () => {
    expect(reservedKeyLabel('towerSlot1', '1')).toBeNull();
    expect(reservedKeyLabel('towerSlot2', '2')).toBeNull();
    expect(reservedKeyLabel('towerSlot3', '3')).toBeNull();
  });

  it('still reserves 1 against an unrelated towerSlot action — only the matching slot is exempt', () => {
    expect(reservedKeyLabel('towerSlot2', '1')).toBe('1');
  });

  it('leaves every other key unreserved', () => {
    expect(reservedKeyLabel('sellSelection', 'g')).toBeNull();
    expect(reservedKeyLabel('sellSelection', '4')).toBeNull();
  });
});

describe('fb079: Hub Controls panel rejects rebinding onto Enter', () => {
  it('rebinding sellSelection onto Enter shows a reserved message and leaves the binding untouched', () => {
    let saved: KeyBindings | null = null;
    const { root } = openHub(defaultKeyBindings(), (kb) => (saved = kb));
    root.querySelector<HTMLElement>('[data-rebind="sellSelection"]')!.click();

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }));

    expect(saved).toBeNull();
    expect(root.querySelector<HTMLElement>('[data-rebind="sellSelection"]')?.textContent?.trim()).toBe('X');
    expect(root.textContent).toMatch(/reserved/i);
  });
});

describe('fb079: Hub Controls panel rejects rebinding onto a vacated 1/2/3', () => {
  it('freeing towerSlot1 off "1" and then rebinding sellSelection onto "1" is rejected, not silently accepted', () => {
    let saved: KeyBindings | null = null;
    let bindings = defaultKeyBindings();
    const { root, hub } = openHub(bindings, (kb) => {
      saved = kb;
      bindings = kb;
    });

    // Step 1: move towerSlot1 off '1' onto a free key — this itself must succeed.
    root.querySelector<HTMLElement>('[data-rebind="towerSlot1"]')!.click();
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'j' }));
    expect(saved).not.toBeNull();
    expect(bindings.towerSlot1).toBe('j');
    hub.openTab('settings'); // re-render off the freshly saved bindings

    // Step 2: '1' is now unclaimed by any action — attempt to bind sellSelection onto it.
    saved = null;
    root.querySelector<HTMLElement>('[data-rebind="sellSelection"]')!.click();
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: '1' }));

    expect(saved).toBeNull(); // onKeyBindingsChanged never fired for this attempt
    expect(bindings.sellSelection).toBe('x'); // still the default, untouched
    expect(root.textContent).toMatch(/reserved/i);
  });
});
