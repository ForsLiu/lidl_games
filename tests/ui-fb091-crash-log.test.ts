/**
 * @vitest-environment jsdom
 *
 * fb091 (QUALITY.md 1.0 Steam/itch checklist: "error capture to a local log
 * with a 'copy report' button"). `crashlog.ts` keeps a bounded, session-only
 * ring buffer of uncaught errors/unhandled rejections; the Settings tab's
 * "Crash reports" panel lists them and can copy a plain-text report.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearCrashLogForTest,
  crashLogEntries,
  formatCrashReport,
  installGlobalErrorHandlers,
  recordCrash,
} from '../src/ui/crashlog';
import { Hub } from '../src/ui/hub';
import { Game } from '../src/ui/main';
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

/** Same idiom as tests/ui-fb071-blur-autopause.test.ts: drives the real `Game` end to end. */
function mountGame(): HTMLElement {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  HTMLCanvasElement.prototype.getContext = (() => ({
    setTransform() {},
    scale() {},
  })) as never;
  window.requestAnimationFrame = (() => 0) as never;
  return document.getElementById('app') as HTMLElement;
}

describe('fb091: crash capture + copy report', () => {
  beforeEach(() => {
    clearCrashLogForTest();
  });
  afterEach(() => {
    clearCrashLogForTest();
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('recordCrash bounds the ring buffer to the last 20 entries', () => {
    for (let i = 0; i < 25; i++) recordCrash(`error ${i}`, `stack ${i}`);
    const entries = crashLogEntries();
    expect(entries.length).toBe(20);
    expect(entries[0].message).toBe('error 5');
    expect(entries[19].message).toBe('error 24');
    expect(entries[19].stack).toBe('stack 24');
    expect(typeof entries[19].time).toBe('number');
  });

  it('installGlobalErrorHandlers captures a window "error" event with message and stack', () => {
    installGlobalErrorHandlers();
    const err = new Error('boom');
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom', error: err }));
    const entries = crashLogEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].message).toBe('boom');
    expect(entries[0].stack).toBe(err.stack);
  });

  it('installGlobalErrorHandlers captures an unhandledrejection event (Error reason)', () => {
    installGlobalErrorHandlers();
    const reason = new Error('rejected');
    const swallowed = Promise.reject(reason);
    swallowed.catch(() => {});
    window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { reason, promise: swallowed }));
    const entries = crashLogEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].message).toBe('rejected');
    expect(entries[0].stack).toBe(reason.stack);
  });

  it('installGlobalErrorHandlers captures an unhandledrejection event (non-Error reason)', () => {
    installGlobalErrorHandlers();
    const swallowed = Promise.reject('plain string reason');
    swallowed.catch(() => {});
    window.dispatchEvent(
      new PromiseRejectionEvent('unhandledrejection', { reason: 'plain string reason', promise: swallowed }),
    );
    const entries = crashLogEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].message).toBe('plain string reason');
    expect(entries[0].stack).toBeUndefined();
  });

  it('Game.start() wires the global error handlers at boot, not just when a test calls installGlobalErrorHandlers directly', () => {
    const root = mountGame();
    const game = new Game();
    game.start(root);

    window.dispatchEvent(new ErrorEvent('error', { message: 'boot-wired', error: new Error('boot-wired') }));

    const entries = crashLogEntries();
    expect(entries.some((e) => e.message === 'boot-wired')).toBe(true);
  });

  it('installGlobalErrorHandlers only ever installs one pair of listeners', () => {
    installGlobalErrorHandlers();
    installGlobalErrorHandlers();
    window.dispatchEvent(new ErrorEvent('error', { message: 'once', error: new Error('once') }));
    expect(crashLogEntries().length).toBe(1);
  });

  it('formatCrashReport shows an empty-state message when nothing is recorded', () => {
    expect(formatCrashReport()).toBe('No errors recorded this session.');
  });

  it('the Settings tab shows an empty-state message with no crashes recorded', () => {
    const { root } = openHub();
    expect(root.textContent).toContain('No errors recorded this session.');
  });

  it('the Settings tab lists each recorded crash', () => {
    recordCrash('first failure', 'stack A');
    recordCrash('second failure', 'stack B');
    const { root } = openHub();
    const items = root.querySelectorAll('.sw-crashlist li');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('first failure');
    expect(items[1].textContent).toContain('second failure');
  });

  it('escapes a hostile error message rather than injecting markup', () => {
    recordCrash('<img src=x onerror=alert(1)>', undefined);
    const { root } = openHub();
    expect(root.querySelector('.sw-crashlist img')).toBeNull();
    expect(root.querySelector('.sw-crashlist li')?.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('clicking Copy report writes every buffered entry to the clipboard', async () => {
    recordCrash('failure one', 'stack one');
    recordCrash('failure two', 'stack two');
    const { root } = openHub();
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });

    (root.querySelector('#sw-crashlog-copy') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledTimes(1);
    const report = writeText.mock.calls[0][0];
    expect(report).toContain('failure one');
    expect(report).toContain('stack one');
    expect(report).toContain('failure two');
    expect(report).toContain('stack two');
  });

  it('shows a confirmation notice after a successful copy, cleared on leaving the tab', async () => {
    recordCrash('failure', undefined);
    const { root, hub } = openHub();
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });

    (root.querySelector('#sw-crashlog-copy') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    expect(root.textContent).toContain('Copied to clipboard.');

    hub.openTab('run');
    hub.openTab('settings');
    expect(root.textContent).not.toContain('Copied to clipboard.');
  });

  it('a denied clipboard write shows a failure notice instead of throwing', async () => {
    recordCrash('failure', undefined);
    const { root } = openHub();
    const writeText = vi.fn(() => Promise.reject(new Error('denied')));
    Object.assign(navigator, { clipboard: { writeText } });

    expect(() => (root.querySelector('#sw-crashlog-copy') as HTMLButtonElement).click()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(root.textContent).toContain('Could not copy');
  });

  it('clicking Copy report with no Clipboard API available shows an explanatory notice, not a throw', () => {
    recordCrash('failure', undefined);
    const { root } = openHub();
    expect(navigator.clipboard).toBeUndefined();

    expect(() => (root.querySelector('#sw-crashlog-copy') as HTMLButtonElement).click()).not.toThrow();
    expect(root.textContent).toContain('Clipboard not available in this browser.');
  });

  it('a stale Hub instance\'s pending clipboard write does not clobber a newer Hub built onto the same root', async () => {
    // code-reviewer finding: `showHub()` (main.ts) builds a fresh `Hub` onto
    // the same shared root on every return to the Hub screen without
    // disposing the previous instance — the same staleness hazard fb090's
    // `activeFullscreenHub`/`refreshFullscreenLabel` pattern already guards
    // against for `fullscreenchange`, reproduced here for the async
    // clipboard-write path fb091 adds.
    recordCrash('failure', undefined);
    const { root } = openHub();
    let resolveWrite: () => void = () => {};
    const writeText = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        }),
    );
    Object.assign(navigator, { clipboard: { writeText } });

    (root.querySelector('#sw-crashlog-copy') as HTMLButtonElement).click();

    // A fresh Hub replaces the stale one on the same root while the write is
    // still pending — the same thing `showHub()` does on Retry/New Run/Hub.
    const freshHub = new Hub(root, defaultMeta(), 2, {
      settings: defaultSettings(),
      onStart: () => {},
      onMetaChanged: () => {},
      onSettingsChanged: () => {},
    });
    freshHub.show();
    freshHub.openTab('run');

    resolveWrite();
    await Promise.resolve();
    await Promise.resolve();

    expect(root.textContent).not.toContain('Copied to clipboard.');
    expect(root.querySelector('#sw-crashlog-copy')).toBeNull();
  });
});
