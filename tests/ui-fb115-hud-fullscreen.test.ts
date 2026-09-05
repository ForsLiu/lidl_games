/**
 * @vitest-environment jsdom
 *
 * fb115 (QUALITY.md 1.0 Steam/itch checklist: "fullscreen + windowed").
 * fb090 built the toggle, but it lived only in the Hub's Settings tab, so a
 * player who had started a run could not enter or leave fullscreen without
 * abandoning to the Hub. The in-run pause Options screen now carries the same
 * control.
 *
 * The interesting assertions here are not "a button exists": they are that the
 * label follows `document.fullscreenElement` rather than the click history
 * (the browser's own Esc changes fullscreen with no click of ours), that the
 * request targets the app root rather than the modal that pause tears down on
 * resume, and that the document-level listener making that work stays a
 * singleton across many runs instead of leaking one per `Hud`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Hud } from '../src/ui/hud';
import { World } from '../src/sim/world';
import type { DevOp } from '../src/sim/types';
import { fullscreenSubscriberCountForTest } from '../src/ui/fullscreen';
import { cfg } from './helpers';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function mount(): HTMLElement {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  return document.getElementById('app') as HTMLElement;
}

function makeHud(root: HTMLElement): Hud {
  return new Hud(root, {
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
    onToggleVsPanel: () => {},
    onResume: () => {},
    onPause: () => {},
    onCycleSpeed: () => {},
    onSetSpeed: () => {},
    onDev: (_op: DevOp) => {},
    onQuitToHub: () => {},
    onHoverSkill: () => {},
    onUpgradeStructure: () => {},
    onSellStructure: () => {},
    onUpgradeCore: () => {},
    onHoverWieldedTower: () => {},
  });
}

/** Opens pause, then the Options sub-screen, and returns the fullscreen button. */
function openOptions(hud: Hud, w: World): HTMLButtonElement {
  hud.setPaused(true, w);
  const options = document.querySelector<HTMLElement>('[data-act="options"]');
  expect(options, 'pause card should offer Options').not.toBeNull();
  options?.click();
  const btn = document.querySelector<HTMLButtonElement>('#sw-hud-fullscreen');
  expect(btn, 'Options screen should carry a fullscreen toggle').not.toBeNull();
  return btn as HTMLButtonElement;
}

function setFullscreenElement(el: Element | null): void {
  Object.defineProperty(document, 'fullscreenElement', {
    value: el,
    configurable: true,
    writable: true,
  });
}

describe('fb115: fullscreen is reachable mid-run, not only from the Hub', () => {
  const realRequest = Element.prototype.requestFullscreen;
  const realExit = document.exitFullscreen;
  let requestSpy: ReturnType<typeof vi.fn>;
  let exitSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setFullscreenElement(null);
    requestSpy = vi.fn(() => Promise.resolve());
    exitSpy = vi.fn(() => Promise.resolve());
    Element.prototype.requestFullscreen = requestSpy as unknown as Element['requestFullscreen'];
    document.exitFullscreen = exitSpy as unknown as Document['exitFullscreen'];
  });

  afterEach(() => {
    setFullscreenElement(null);
    Element.prototype.requestFullscreen = realRequest;
    document.exitFullscreen = realExit;
  });

  it('requests fullscreen on the app root — not the modal, which resume tears down', () => {
    const root = mount();
    const hud = makeHud(root);
    const w = new World(cfg());
    const btn = openOptions(hud, w);

    btn.click();

    expect(requestSpy).toHaveBeenCalledTimes(1);
    // `this` at the call site is the element fullscreen was requested on.
    expect(requestSpy.mock.instances[0]).toBe(root);
    expect(requestSpy.mock.instances[0]).not.toBe(document.getElementById('sw-modal'));
  });

  it('exits when already fullscreen, rather than re-requesting', () => {
    const root = mount();
    const hud = makeHud(root);
    const w = new World(cfg());
    setFullscreenElement(root);
    const btn = openOptions(hud, w);

    expect(btn.textContent?.trim()).toBe('Exit fullscreen');
    btn.click();

    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it("follows the browser's own fullscreen exit, not this button's click history", () => {
    const root = mount();
    const hud = makeHud(root);
    const w = new World(cfg());
    setFullscreenElement(root);
    const btn = openOptions(hud, w);
    expect(btn.textContent?.trim()).toBe('Exit fullscreen');

    // The player presses Esc: the UA changes state and fires the event with no
    // click of ours. This is the case a click-history label gets wrong.
    setFullscreenElement(null);
    document.dispatchEvent(new Event('fullscreenchange'));

    const after = document.querySelector<HTMLButtonElement>('#sw-hud-fullscreen');
    expect(after?.textContent?.trim()).toBe('Enter fullscreen');
  });

  it('does not leak a document listener per run, however many Huds are built', () => {
    const w = new World(cfg());
    const before = fullscreenSubscriberCountForTest();

    for (let i = 0; i < 8; i++) {
      const hud = makeHud(mount());
      hud.setPaused(true, w);
      hud.setPaused(false, w);
    }

    // Every subscription is dropped on resume, so the count returns to where
    // it started rather than growing with the number of runs played.
    expect(fullscreenSubscriberCountForTest()).toBe(before);
  });

  it('releases the subscription when a paused run is ABANDONED, not only when it resumes', () => {
    // code-reviewer finding: the balanced pause/resume loop above is precisely
    // the path that cannot leak. Abandoning from the pause screen calls
    // `onQuitToHub()` and never resumes the Hud, so before `dispose()` existed
    // each abandon retained a subscriber — and with it the Hud, its detached
    // modal DOM, and the captured World — for the rest of the session
    // (measured: 5 abandons, 5 subscribers, monotonic).
    const w = new World(cfg());
    const before = fullscreenSubscriberCountForTest();

    for (let i = 0; i < 5; i++) {
      const hud = makeHud(mount());
      hud.setPaused(true, w);
      // The real click path, not a direct dispose() call: quit -> confirm.
      document.querySelector<HTMLElement>('[data-act="quit"]')?.click();
      document.querySelector<HTMLElement>('[data-act="confirm"]')?.click();
      // `main.ts`'s showHub() is what runs on that callback; this is its
      // fb115-relevant half.
      hud.dispose();
    }

    expect(fullscreenSubscriberCountForTest()).toBe(before);
  });

  it('dispose() is idempotent, so every path back to the Hub can call it unconditionally', () => {
    const root = mount();
    const hud = makeHud(root);
    const w = new World(cfg());
    const before = fullscreenSubscriberCountForTest();

    hud.setPaused(true, w);
    expect(fullscreenSubscriberCountForTest()).toBe(before + 1);
    hud.dispose();
    hud.dispose();
    hud.dispose();
    expect(fullscreenSubscriberCountForTest()).toBe(before);
  });

  it('holds exactly one subscription while paused, and drops it on resume', () => {
    const root = mount();
    const hud = makeHud(root);
    const w = new World(cfg());
    const before = fullscreenSubscriberCountForTest();

    hud.setPaused(true, w);
    expect(fullscreenSubscriberCountForTest()).toBe(before + 1);
    hud.setPaused(false, w);
    expect(fullscreenSubscriberCountForTest()).toBe(before);
  });

  it('survives a UA that denies the fullscreen request, instead of taking the pause screen down', () => {
    // A denied request REJECTS (no user gesture, an iframe without
    // allow="fullscreen", a kiosk policy). An unhandled rejection here would
    // escape the click handler with the pause modal mid-render.
    Element.prototype.requestFullscreen = (() =>
      Promise.reject(new Error('denied'))) as unknown as Element['requestFullscreen'];
    const root = mount();
    const hud = makeHud(root);
    const w = new World(cfg());
    const btn = openOptions(hud, w);

    expect(() => btn.click()).not.toThrow();
    expect(document.querySelector('#sw-hud-fullscreen')).not.toBeNull();
  });
});
