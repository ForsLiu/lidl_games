/**
 * @vitest-environment jsdom
 *
 * P9 p9c, gate G15 / SPEC-FINAL §11: "a run started after unsaved live
 * edits is visibly flagged like practice." Reuses the existing, already-
 * tested practice-run plumbing (`RunConfig.practice`, the Results screen's
 * "nothing was banked" note) rather than inventing a second flagging
 * mechanism — see src/ui/hub.ts's `unsavedTunerEdits` local and QUESTIONS.md.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Hub } from '../src/ui/hub';
import { defaultMeta } from '../src/meta/meta';
import { defaultSettings } from '../src/ui/settings';
import type { RunConfig } from '../src/sim/types';
import { clearAllTunerDirty, setTunerDirty } from '../src/ui/tuner-state';

function mount(): HTMLElement {
  document.body.innerHTML = '<div id="app"></div>';
  return document.getElementById('app') as HTMLElement;
}

function openHub(onStart: (cfg: RunConfig) => void): Hub {
  const root = mount();
  const hub = new Hub(root, defaultMeta(), 1, {
    settings: defaultSettings(),
    onSettingsChanged: () => {},
    onStart,
    onMetaChanged: () => {},
  });
  hub.show();
  return hub;
}

describe('Hub: unsaved Tuner edits flag a run like practice (p9c, G15)', () => {
  afterEach(() => clearAllTunerDirty());

  it('forces practice on when a Tuner edit is unsaved', () => {
    setTunerDirty('towers', true);
    const onStart = vi.fn();
    openHub(onStart);
    (document.getElementById('sw-start') as HTMLButtonElement).click();
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart.mock.calls[0][0].practice).toBe(true);
  });

  it('shows a note explaining why the run will be a practice run', () => {
    setTunerDirty('towers', true);
    openHub(() => {});
    expect(document.body.textContent).toMatch(/Unsaved Tuner edits/);
    expect(document.getElementById('sw-start')!.textContent).toBe('Begin practice run');
  });

  it('does not force practice when there are no unsaved edits', () => {
    clearAllTunerDirty();
    const onStart = vi.fn();
    openHub(onStart);
    (document.getElementById('sw-start') as HTMLButtonElement).click();
    expect(onStart.mock.calls[0][0].practice).toBe(false);
  });

  it('a save clearing the dirty flag lets the next render offer a real run again', () => {
    setTunerDirty('towers', true);
    setTunerDirty('towers', false);
    const onStart = vi.fn();
    openHub(onStart);
    (document.getElementById('sw-start') as HTMLButtonElement).click();
    expect(onStart.mock.calls[0][0].practice).toBe(false);
  });
});
