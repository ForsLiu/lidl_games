/**
 * @vitest-environment jsdom
 *
 * P9 p9b: the Codex's read-only half (`src/ui/codex.ts`, `codex-collections.ts`,
 * proven generic by `tests/codex.test.ts`) gets a real Hub entry point. This
 * file only proves the wiring — that opening the Hub's Codex tab actually
 * mounts it against live `/data` content — not the renderer's own generic-ness,
 * which codex.test.ts already covers end to end.
 */
import { describe, expect, it } from 'vitest';

import { Hub } from '../src/ui/hub';
import { defaultMeta } from '../src/meta/meta';
import { defaultSettings } from '../src/ui/settings';
import { buildCodexCollections } from '../src/ui/codex-collections';

function mount(): HTMLElement {
  document.body.innerHTML = '<div id="app"></div>';
  return document.getElementById('app') as HTMLElement;
}

function openHub(): Hub {
  const root = mount();
  const hub = new Hub(root, defaultMeta(), 1, {
    settings: defaultSettings(),
    onSettingsChanged: () => {},
    onStart: () => {},
    onMetaChanged: () => {},
  });
  hub.show();
  return hub;
}

describe('Hub Codex tab (p9b)', () => {
  it('has a nav button for the Codex tab', () => {
    const root = document.body;
    openHub();
    const btn = Array.from(root.querySelectorAll<HTMLButtonElement>('nav button')).find(
      (b) => b.dataset.tab === 'codex',
    );
    expect(btn).toBeDefined();
    expect(btn!.textContent).toBe('Codex');
  });

  it('opening the Codex tab mounts every /data collection, live', () => {
    const root = document.body;
    const hub = openHub();
    hub.openTab('codex');

    const collections = buildCodexCollections();
    const navButtons = root.querySelectorAll('.sw-codex-nav-btn');
    expect(navButtons.length).toBe(collections.length);

    const table = root.querySelector('.sw-codex-content table')!;
    expect(table.querySelectorAll('tbody tr').length).toBe(collections[0].rows.length);
  });

  it('switching to another tab and back re-mounts a fresh Codex rather than a stale one', () => {
    const root = document.body;
    const hub = openHub();
    hub.openTab('codex');
    const towersBtn = Array.from(root.querySelectorAll<HTMLButtonElement>('.sw-codex-nav-btn')).find(
      (b) => b.dataset.codexKey === 'towers',
    )!;
    towersBtn.click();
    expect(root.querySelector('.sw-codex-content h2')!.textContent).toBe('Towers');

    hub.openTab('run');
    expect(root.querySelector('.sw-codex')).toBeNull();

    hub.openTab('codex');
    // Back on the tab, it starts fresh at the first collection again, not
    // pinned to whatever was selected before the tab switch tore it down.
    const collections = buildCodexCollections();
    expect(root.querySelector('.sw-codex-content h2')!.textContent).toBe(collections[0].label);
  });
});
