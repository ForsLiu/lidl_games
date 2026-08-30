/**
 * @vitest-environment jsdom
 *
 * Playtest: "add some basic stash/relic for testing" and "if there is a
 * feature, let there be a use, like Points 0 Orbs 0/0/0".
 *
 * A fresh account showed four counters, two of which read zero and explained
 * nothing, and a Stash screen that could not be reached without an hour of
 * play. These drive the real Hub DOM. p7d retired the relic stash and the
 * Ember/account-level pipeline outright — `seedTestAccount` now grants skill
 * points directly.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Hub, accountMarkup } from '../src/ui/hub';
import { defaultMeta, seedTestAccount } from '../src/meta/meta';
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
  it('grants skill points', () => {
    const before = defaultMeta();
    const after = seedTestAccount(before);
    expect(after.skillPoints).toBe(before.skillPoints + 20);
  });

  it('is additive: seeding twice tops the total up further rather than resetting it', () => {
    const once = seedTestAccount(defaultMeta());
    const twice = seedTestAccount(once);
    expect(twice.skillPoints).toBe(once.skillPoints + 20);
  });

  it('the Settings button seeds the account it is looking at', () => {
    const { root, hub, latest } = openHub(defaultMeta());
    hub.openTab('settings');
    const seed = root.querySelector('#sw-seed') as HTMLButtonElement;
    expect(seed).not.toBeNull();
    seed.click();
    expect(latest().skillPoints).toBe(20);
    expect(Object.values(latest().equipmentStash).every((n) => n >= 3)).toBe(true);
    expect(root.textContent).toMatch(/Seeded equipment and 20 skill points\./);
  });

  it('the wipe button puts the account back to new', () => {
    const { root, hub, latest } = openHub(seedTestAccount(defaultMeta()));
    hub.openTab('settings');
    (root.querySelector('#sw-wipe') as HTMLButtonElement).click();
    expect(latest()).toEqual(defaultMeta());
  });
});

describe('Core selection (§5.5, p-core-a)', () => {
  it('defaults to Stone Heart selected and unlocked', () => {
    const { root } = openHub(defaultMeta());
    const stone = root.querySelector('[data-core="stone_heart"]') as HTMLButtonElement;
    expect(stone.disabled).toBe(false);
    expect(stone.className).toContain('on');
    expect(stone.className).not.toContain('locked');
  });

  it('refuses a locked core: no click listener fires and it never becomes selected', () => {
    const { root } = openHub(defaultMeta()); // unlockedCores: ['stone_heart'] only
    const locked = root.querySelector('[data-core="time"]') as HTMLButtonElement;
    expect(locked.disabled).toBe(true);
    locked.disabled = false; // simulate a stray DOM edit; the listener guard is the real gate
    locked.click();
    expect(root.querySelector('[data-core="time"]')!.className).not.toContain('on');
    expect(root.querySelector('[data-core="stone_heart"]')!.className).toContain('on');
  });

  // QA repro: an account whose `unlockedCores` migrated to `[]` (reachable —
  // see tests/p-core-a-selection.test.ts's migration coverage) must not leave
  // Stone Heart, §5.5's guaranteed default, rendered as simultaneously
  // selected and locked. `migrate()` now guarantees the default core is
  // always present, so a bare `{ unlockedCores: [] }` passed directly here
  // (bypassing migration) is the one remaining way to force this state, and
  // this pins the Hub's own defense: it never lets that combination render.
  it('never renders Stone Heart as both selected and locked, even if unlockedCores is emptied', () => {
    const meta = { ...defaultMeta(), unlockedCores: [] as string[] };
    const { root } = openHub(meta);
    const stone = root.querySelector('[data-core="stone_heart"]') as HTMLButtonElement;
    expect(stone.className.includes('on') && stone.className.includes('locked')).toBe(false);
  });
});

describe('account counters explain themselves', () => {
  it('every counter carries help text, not just a number', () => {
    const html = accountMarkup(defaultMeta());
    const holder = document.createElement('div');
    holder.innerHTML = html;
    const cells = [...holder.querySelectorAll('span')];
    // Skill Points / Points (available). Level/Ember/Orbs are all retired.
    expect(cells.length).toBe(2);
    for (const c of cells) expect(c.getAttribute('title')?.length ?? 0).toBeGreaterThan(20);
  });

  it('with no points left, the help says how to earn more', () => {
    const meta = { ...defaultMeta(), skillPoints: 1, allocated: [0, 1] };
    const holder = document.createElement('div');
    holder.innerHTML = accountMarkup(meta);
    const points = [...holder.querySelectorAll('span')].find((s) => s.textContent?.startsWith('Points'))!;
    expect(points.getAttribute('title')).toMatch(/VS wave/);
    expect(points.className).toContain('zero');
  });

  it('an empty Equipment screen says what equipment is for', () => {
    const { root, hub } = openHub(defaultMeta());
    hub.openTab('equipment');
    expect(root.textContent).toMatch(/Fully clearing a TD wave grants one random equipment item/);
    expect(root.textContent).toMatch(/Click an owned item to equip it/);
  });
});
