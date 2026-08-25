/**
 * @vitest-environment jsdom
 *
 * Playtest: "add some basic stash/relic for testing" and "if there is a
 * feature, let there be a use, like Points 0 Orbs 0/0/0".
 *
 * A fresh account showed four counters, two of which read zero and explained
 * nothing, and a Stash screen that could not be reached without an hour of
 * play. These drive the real Hub DOM.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Hub, accountMarkup } from '../src/ui/hub';
import { defaultMeta, seedTestAccount, stashCapacity } from '../src/meta/meta';
import { defaultSettings } from '../src/ui/settings';
import type { MetaState } from '../src/sim/types';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function mount(): HTMLElement {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  return document.getElementById('app') as HTMLElement;
}

function openHub(meta: MetaState): { root: HTMLElement; hub: Hub; latest: () => MetaState } {
  const root = mount();
  let current = meta;
  const hub = new Hub(root, meta, 1, {
    settings: defaultSettings(),
    onSettingsChanged: () => {},
    onStart: () => {},
    onMetaChanged: (m) => (current = m),
  });
  hub.show();
  return { root, hub, latest: () => current };
}

describe('seeding a test account', () => {
  it('grants relics and Ember', () => {
    const before = defaultMeta();
    const after = seedTestAccount(before);
    expect(after.stash.length).toBe(8);

    expect(after.ember).toBe(before.ember + 600);
    expect(before.stash.length).toBe(0);
  });

  it('includes at least one rare, so the craft screen has something to work on', () => {
    expect(seedTestAccount(defaultMeta()).stash.some((r) => r.rarity === 'rare')).toBe(true);
  });

  it('gives every relic a unique id and a real slot', () => {
    const meta = seedTestAccount(defaultMeta());
    const ids = new Set(meta.stash.map((r) => r.id));
    expect(ids.size).toBe(meta.stash.length);
    for (const r of meta.stash) expect(r.slot.length).toBeGreaterThan(0);
  });

  it('is deterministic for the same account, and different for the next batch', () => {
    const a = seedTestAccount(defaultMeta());
    const b = seedTestAccount(defaultMeta());
    expect(a.stash.map((r) => r.name)).toEqual(b.stash.map((r) => r.name));
    const second = seedTestAccount(a);
    expect(second.stash.slice(8).map((r) => r.name)).not.toEqual(a.stash.map((r) => r.name));
  });

  it('never overfills the stash', () => {
    let meta = defaultMeta();
    for (let i = 0; i < 10; i++) meta = seedTestAccount(meta);
    expect(meta.stash.length).toBeLessThanOrEqual(stashCapacity(meta));
  });

  it('the Settings button seeds the account it is looking at', () => {
    const { root, hub, latest } = openHub(defaultMeta());
    hub.openTab('settings');
    const seed = root.querySelector('#sw-seed') as HTMLButtonElement;
    expect(seed).not.toBeNull();
    seed.click();
    expect(latest().stash.length).toBe(8);
    expect(root.textContent).toMatch(/Seeded 8 relics/);
  });

  it('the wipe button puts the account back to new', () => {
    const { root, hub, latest } = openHub(seedTestAccount(defaultMeta()));
    hub.openTab('settings');
    (root.querySelector('#sw-wipe') as HTMLButtonElement).click();
    expect(latest()).toEqual(defaultMeta());
  });
});

describe('account counters explain themselves', () => {
  it('every counter carries help text, not just a number', () => {
    const html = accountMarkup(defaultMeta());
    const holder = document.createElement('div');
    holder.innerHTML = html;
    const cells = [...holder.querySelectorAll('span')];
    // Level / Ember / Points. The fourth, Orbs, went with SPEC-V3 §8.
    expect(cells.length).toBe(3);
    for (const c of cells) expect(c.getAttribute('title')?.length ?? 0).toBeGreaterThan(20);
  });

  it('with no points left, the help says how to earn more', () => {
    const meta = { ...defaultMeta(), accountLevel: 1, allocated: [0, 1] };
    const holder = document.createElement('div');
    holder.innerHTML = accountMarkup(meta);
    const points = [...holder.querySelectorAll('span')].find((s) => s.textContent?.startsWith('Points'))!;
    expect(points.getAttribute('title')).toMatch(/Ember/);
    expect(points.className).toContain('zero');
  });

  it('an empty stash says what relics are for', () => {
    const { root, hub } = openHub(defaultMeta());
    hub.openTab('stash');
    expect(root.textContent).toMatch(/Relics drop from elites/);
    expect(root.textContent).toMatch(/click one to equip it/);
  });
});
