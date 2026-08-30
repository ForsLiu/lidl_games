/**
 * @vitest-environment jsdom
 *
 * P9 p9c, gate G15: the Tuner's dev-mode edit UI. Vitest is a dev build
 * (confirmed directly in tests/c8-dev-profile.test.ts), so `isDevBuild()`
 * is true here and the editable half mounts — the prod-like behavior (it
 * must NOT mount) is covered separately in p9c-tuner-prod-ui.test.ts, which
 * mocks `isDevBuild()` false; mixing both expectations in one file would
 * mean sharing a module mock across tests that need opposite answers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildCodexCollections, type CodexCollection } from '../src/ui/codex-collections';
import { clearAllTunerDirty, hasUnsavedTunerEdits } from '../src/ui/tuner-state';
import { mountTunerPanel } from '../src/ui/tuner';

function towersCollection(): CodexCollection {
  return buildCodexCollections().find((c) => c.key === 'towers')!;
}

describe('mountTunerPanel, dev build (p9c, G15)', () => {
  beforeEach(() => clearAllTunerDirty());
  afterEach(() => {
    clearAllTunerDirty();
    vi.unstubAllGlobals();
  });

  it('mounts Export, Import and the editable textarea + Save button', () => {
    const root = document.createElement('div');
    mountTunerPanel(root, towersCollection());
    expect(root.querySelector('.sw-tuner-export')).not.toBeNull();
    expect(root.querySelector('.sw-tuner-import input[type="file"]')).not.toBeNull();
    expect(root.querySelector('.sw-tuner-editor')).not.toBeNull();
    expect(root.querySelector('.sw-tuner-save')).not.toBeNull();
  });

  it('prefills the editor with the whole backing document, not just the visible rows', () => {
    const root = document.createElement('div');
    const collection = towersCollection();
    mountTunerPanel(root, collection);
    const textarea = root.querySelector('.sw-tuner-editor') as HTMLTextAreaElement;
    expect(JSON.parse(textarea.value)).toEqual(collection.raw);
  });

  it('renders nothing for a collection with no backing tuner file', () => {
    const root = document.createElement('div');
    mountTunerPanel(root, { key: 'x', label: 'X', rows: [] });
    expect(root.children.length).toBe(0);
  });

  it('typing marks the file dirty; reverting to the saved baseline clears it', () => {
    const root = document.createElement('div');
    mountTunerPanel(root, towersCollection());
    const textarea = root.querySelector('.sw-tuner-editor') as HTMLTextAreaElement;
    const baseline = textarea.value;
    expect(hasUnsavedTunerEdits()).toBe(false);

    textarea.value = `${baseline} `;
    textarea.dispatchEvent(new Event('input'));
    expect(hasUnsavedTunerEdits()).toBe(true);

    textarea.value = baseline;
    textarea.dispatchEvent(new Event('input'));
    expect(hasUnsavedTunerEdits()).toBe(false);
  });

  it('Save posts the parsed document to /__tuner/save and clears dirty on success', async () => {
    const root = document.createElement('div');
    mountTunerPanel(root, towersCollection());
    const textarea = root.querySelector('.sw-tuner-editor') as HTMLTextAreaElement;
    textarea.value = `${textarea.value} `;
    textarea.dispatchEvent(new Event('input'));
    expect(hasUnsavedTunerEdits()).toBe(true);

    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);

    (root.querySelector('.sw-tuner-save') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/__tuner/save');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.key).toBe('towers');
    expect(hasUnsavedTunerEdits()).toBe(false);
    expect(root.querySelector('.sw-tuner-status')!.textContent).toMatch(/Saved/);
  });

  it('a rejected save shows the field-level errors and leaves the file dirty', async () => {
    const root = document.createElement('div');
    mountTunerPanel(root, towersCollection());
    const textarea = root.querySelector('.sw-tuner-editor') as HTMLTextAreaElement;
    textarea.value = `${textarea.value} `;
    textarea.dispatchEvent(new Event('input'));

    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ ok: false, errors: [{ path: 'towers.0.cost', message: 'Expected number' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    (root.querySelector('.sw-tuner-save') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(hasUnsavedTunerEdits()).toBe(true);
    const status = root.querySelector('.sw-tuner-status')!;
    expect(status.textContent).toMatch(/towers\.0\.cost/);
    expect(status.textContent).toMatch(/Expected number/);
  });

  it('a remount (switching Codex tabs and back) restores an unsaved draft rather than discarding it', () => {
    // code-reviewer's Major #1 repro: mounting fresh (as codex.ts does on
    // every nav click, including between the two tabs backed by the same
    // file) used to always reset to `collection.raw`, silently dropping
    // whatever was typed while `hasUnsavedTunerEdits()` kept saying there
    // was still something to lose.
    const collection = towersCollection();
    const firstMount = document.createElement('div');
    mountTunerPanel(firstMount, collection);
    const firstTextarea = firstMount.querySelector('.sw-tuner-editor') as HTMLTextAreaElement;
    const edited = `${firstTextarea.value} `;
    firstTextarea.value = edited;
    firstTextarea.dispatchEvent(new Event('input'));
    expect(hasUnsavedTunerEdits()).toBe(true);

    // Simulates codex.ts's show(): a brand-new container, a brand-new call,
    // exactly what happens switching away from this tab and back (or to the
    // sibling "Skill Cards" tab, which shares this same tunerFile).
    const secondMount = document.createElement('div');
    mountTunerPanel(secondMount, collection);
    const secondTextarea = secondMount.querySelector('.sw-tuner-editor') as HTMLTextAreaElement;

    expect(secondTextarea.value).toBe(edited);
    expect(hasUnsavedTunerEdits()).toBe(true);
  });

  it('a successful save clears the draft too, so a later remount shows the clean baseline again', async () => {
    const collection = towersCollection();
    const firstMount = document.createElement('div');
    mountTunerPanel(firstMount, collection);
    const firstTextarea = firstMount.querySelector('.sw-tuner-editor') as HTMLTextAreaElement;
    firstTextarea.value = `${firstTextarea.value} `;
    firstTextarea.dispatchEvent(new Event('input'));

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: async () => ({ ok: true }) }),
    );
    (firstMount.querySelector('.sw-tuner-save') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(hasUnsavedTunerEdits()).toBe(false);

    const secondMount = document.createElement('div');
    mountTunerPanel(secondMount, collection);
    const secondTextarea = secondMount.querySelector('.sw-tuner-editor') as HTMLTextAreaElement;
    expect(secondTextarea.value).toBe(JSON.stringify(collection.raw, null, 2));
  });

  it('a syntactically invalid edit is caught before any network call', () => {
    const root = document.createElement('div');
    mountTunerPanel(root, towersCollection());
    const textarea = root.querySelector('.sw-tuner-editor') as HTMLTextAreaElement;
    textarea.value = '{ not valid json';
    textarea.dispatchEvent(new Event('input'));

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    (root.querySelector('.sw-tuner-save') as HTMLButtonElement).click();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(root.querySelector('.sw-tuner-status')!.textContent).toMatch(/Invalid JSON/);
  });
});
