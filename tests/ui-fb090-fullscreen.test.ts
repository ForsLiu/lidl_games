/**
 * @vitest-environment jsdom
 *
 * fb090 (QUALITY.md 1.0 Steam/itch checklist: "fullscreen + windowed"). The
 * Settings tab's "Enter/Exit fullscreen" button requests fullscreen on the
 * app's root element via the Fullscreen API and reflects live
 * `document.fullscreenElement` state, including a state change driven
 * externally (e.g. the browser's own Esc-to-exit-fullscreen) via the
 * `fullscreenchange` event, not just its own click history.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { Hub } from '../src/ui/hub';
import { defaultMeta } from '../src/meta/meta';
import { defaultSettings } from '../src/ui/settings';
import type { MetaState } from '../src/sim/types';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function openHub(meta: MetaState = defaultMeta()): { root: HTMLElement; hub: Hub } {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
  const hub = new Hub(root, meta, 1, {
    settings: defaultSettings(),
    onStart: () => {},
    onMetaChanged: () => {},
    onSettingsChanged: () => {},
  });
  hub.show();
  hub.openTab('settings');
  return { root, hub };
}

/** `document.fullscreenElement` is normally a read-only getter; shadow it with an own property. */
function setFullscreenElement(el: Element | null): void {
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => el,
  });
}

function fullscreenButton(root: HTMLElement): HTMLButtonElement {
  return root.querySelector('#sw-fullscreen-toggle') as HTMLButtonElement;
}

describe('fb090: fullscreen toggle', () => {
  afterEach(() => {
    setFullscreenElement(null);
    vi.restoreAllMocks();
  });

  it('clicking while not fullscreen calls requestFullscreen on the app root; the label flips once fullscreenchange fires', () => {
    const { root } = openHub();
    const requestFullscreen = vi.fn(() => {
      setFullscreenElement(root);
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    });
    root.requestFullscreen = requestFullscreen;
    document.exitFullscreen = vi.fn(() => Promise.resolve());

    expect(fullscreenButton(root).textContent?.trim()).toBe('Enter fullscreen');
    fullscreenButton(root).click();

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(document.exitFullscreen).not.toHaveBeenCalled();
    expect(fullscreenButton(root).textContent?.trim()).toBe('Exit fullscreen');
  });

  it('clicking while fullscreen calls exitFullscreen; the label flips back once fullscreenchange fires', () => {
    setFullscreenElement(document.body);
    const { root } = openHub();
    const exitFullscreen = vi.fn(() => {
      setFullscreenElement(null);
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    });
    document.exitFullscreen = exitFullscreen;
    root.requestFullscreen = vi.fn(() => Promise.resolve());

    expect(fullscreenButton(root).textContent?.trim()).toBe('Exit fullscreen');
    fullscreenButton(root).click();

    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(root.requestFullscreen).not.toHaveBeenCalled();
    expect(fullscreenButton(root).textContent?.trim()).toBe('Enter fullscreen');
  });

  it('a fullscreenchange event with fullscreenElement cleared externally updates the control without a click', () => {
    setFullscreenElement(document.body);
    const { root } = openHub();
    expect(fullscreenButton(root).textContent?.trim()).toBe('Exit fullscreen');

    setFullscreenElement(null);
    document.dispatchEvent(new Event('fullscreenchange'));

    expect(fullscreenButton(root).textContent?.trim()).toBe('Enter fullscreen');
  });

  it('a fullscreenchange event while off the Settings tab does not throw and does not render the Settings panel', () => {
    const { root, hub } = openHub();
    hub.openTab('run');
    expect(fullscreenButton(root)).toBeNull();

    setFullscreenElement(document.body);
    expect(() => document.dispatchEvent(new Event('fullscreenchange'))).not.toThrow();
    expect(fullscreenButton(root)).toBeNull();
  });

  it('repeat tab visits do not cause a single Hub instance to double-render on one fullscreenchange event', () => {
    const { hub } = openHub();
    hub.openTab('run');
    hub.openTab('settings');
    hub.openTab('run');
    hub.openTab('settings');

    const showSpy = vi.spyOn(hub, 'show');
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(showSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * `main.ts`'s `showHub()` constructs a fresh `Hub` on every return to the
   * Hub screen without disposing the previous instance. A per-instance
   * document-level `fullscreenchange` listener would leak: a stale instance
   * discarded while still on the Settings tab would keep reacting forever,
   * clobbering whatever the *current* Hub/Hud actually rendered onto the
   * shared root. Only the most recently constructed instance may react.
   */
  it('repeated Hub re-instantiation onto the same root leaves only the most recent instance reacting to fullscreenchange', () => {
    document.head.innerHTML = `<style>${CSS}</style>`;
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app') as HTMLElement;

    const hubs: Hub[] = [];
    for (let i = 0; i < 5; i++) {
      const hub = new Hub(root, defaultMeta(), i, {
        settings: defaultSettings(),
        onStart: () => {},
        onMetaChanged: () => {},
        onSettingsChanged: () => {},
      });
      hub.show();
      hub.openTab('settings'); // each stale instance is left "on" the Settings tab
      hubs.push(hub);
    }

    const showSpies = hubs.map((h) => vi.spyOn(h, 'show'));
    setFullscreenElement(root);
    document.dispatchEvent(new Event('fullscreenchange'));

    for (const spy of showSpies.slice(0, 4)) expect(spy).not.toHaveBeenCalled();
    expect(showSpies[4]).toHaveBeenCalledTimes(1);
  });
});
