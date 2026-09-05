/**
 * @vitest-environment jsdom
 *
 * fb075 (SPEC-FINAL §11, standard Settings-UX convention): a "reset to
 * defaults" control for the Settings tab, gated behind a two-click confirm
 * step (first click arms it, second click commits) since there is no
 * `window.confirm` precedent anywhere else in this codebase.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { Hub } from '../src/ui/hub';
import { defaultMeta } from '../src/meta/meta';
import { defaultSettings, type Settings } from '../src/ui/settings';
import { defaultKeyBindings } from '../src/ui/keybindings';
import type { MetaState } from '../src/sim/types';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function openHub(
  onSettingsChanged: (settings: Settings) => void = () => {},
  meta: MetaState = defaultMeta(),
): { root: HTMLElement; hub: Hub } {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
  const hub = new Hub(root, meta, 1, {
    settings: defaultSettings(),
    onStart: () => {},
    onMetaChanged: () => {},
    onSettingsChanged,
    keyBindings: defaultKeyBindings(),
    onKeyBindingsChanged: () => {},
  });
  hub.show();
  hub.openTab('settings');
  return { root, hub };
}

function resetButton(root: HTMLElement): HTMLButtonElement {
  return root.querySelector('#sw-settings-reset') as HTMLButtonElement;
}

describe('fb075: Settings "reset to defaults"', () => {
  it('first click arms a confirm step without changing any value', () => {
    const onSettingsChanged = vi.fn();
    const { root } = openHub(onSettingsChanged);

    const slider = root.querySelector<HTMLInputElement>('[data-slider="masterVolume"]')!;
    slider.value = '30';
    slider.dispatchEvent(new Event('input'));
    const toggle = root.querySelector<HTMLInputElement>('[data-toggle="showRanges"]')!;
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    onSettingsChanged.mockClear();

    resetButton(root).click();

    expect(onSettingsChanged).not.toHaveBeenCalled();
    expect(resetButton(root).textContent).toContain('Click again to confirm');
    // Values changed above must still be intact — nothing reset yet.
    expect(root.querySelector<HTMLInputElement>('[data-slider="masterVolume"]')!.value).toBe('30');
    expect(root.querySelector<HTMLInputElement>('[data-toggle="showRanges"]')!.checked).toBe(true);
  });

  it('second click commits every field back to defaultSettings()', () => {
    const onSettingsChanged = vi.fn();
    const { root } = openHub(onSettingsChanged);

    const slider = root.querySelector<HTMLInputElement>('[data-slider="masterVolume"]')!;
    slider.value = '30';
    slider.dispatchEvent(new Event('input'));
    const toggle = root.querySelector<HTMLInputElement>('[data-toggle="showRanges"]')!;
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    const count = root.querySelector<HTMLInputElement>('[data-count]')!;
    count.value = '10';
    count.dispatchEvent(new Event('input'));

    resetButton(root).click(); // arm
    resetButton(root).click(); // confirm

    expect(onSettingsChanged).toHaveBeenLastCalledWith(defaultSettings());
    expect(root.querySelector<HTMLInputElement>('[data-slider="masterVolume"]')!.value).toBe('80');
    expect(root.querySelector<HTMLInputElement>('[data-toggle="showRanges"]')!.checked).toBe(false);
    expect(root.querySelector<HTMLInputElement>('[data-count]')!.value).toBe('60');
    expect(resetButton(root).textContent).toContain('Reset settings to defaults');
  });

  it('leaving the Settings tab mid-confirm disarms it', () => {
    const onSettingsChanged = vi.fn();
    const { root, hub } = openHub(onSettingsChanged);

    resetButton(root).click(); // arm
    expect(resetButton(root).textContent).toContain('Click again to confirm');

    hub.openTab('run');
    hub.openTab('settings');

    expect(onSettingsChanged).not.toHaveBeenCalled();
    expect(resetButton(root).textContent).toContain('Reset settings to defaults');
  });

  // A re-render triggered by any *other* Settings-tab control (account
  // wipe/seed, key-rebind reset, starting a rebind) redraws the reset
  // button back to its unarmed label. If the internal armed flag survived
  // that re-render untouched, the next click would silently execute the
  // destructive reset with no second confirm ever shown, contradicting the
  // label the player just saw.
  it('an unrelated Settings-tab action disarms a pending confirm instead of leaving a stale armed flag', () => {
    const onSettingsChanged = vi.fn();
    const { root } = openHub(onSettingsChanged);

    resetButton(root).click(); // arm
    expect(resetButton(root).textContent).toContain('Click again to confirm');

    (root.querySelector('#sw-keybind-reset') as HTMLButtonElement).click();
    expect(resetButton(root).textContent).toContain('Reset settings to defaults');

    resetButton(root).click(); // this must re-arm, not execute
    expect(onSettingsChanged).not.toHaveBeenCalled();
    expect(resetButton(root).textContent).toContain('Click again to confirm');
  });

  it('starting a key rebind disarms a pending settings-reset confirm', () => {
    const onSettingsChanged = vi.fn();
    const { root } = openHub(onSettingsChanged);

    resetButton(root).click(); // arm
    (root.querySelector('[data-rebind]') as HTMLButtonElement).click();
    expect(resetButton(root).textContent).toContain('Reset settings to defaults');

    resetButton(root).click(); // re-arm, not execute
    expect(onSettingsChanged).not.toHaveBeenCalled();
    expect(resetButton(root).textContent).toContain('Click again to confirm');
  });
});
