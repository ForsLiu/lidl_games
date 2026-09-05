/**
 * @vitest-environment jsdom
 *
 * fb095 (SPEC-FINAL §13 content totals: 8-12 quests; `data/quests.json` has
 * 14 authored, none previously shown anywhere in the UI). A Hub tab lists
 * every quest with its description, live progress against the real
 * `MetaState`, completed state, and reward display name — pure presentation
 * over already-existing `Content`/`MetaState` fields.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Hub } from '../src/ui/hub';
import { defaultMeta } from '../src/meta/meta';
import { defaultSettings } from '../src/ui/settings';
import { loadContent } from '../src/sim/content';
import type { MetaState } from '../src/sim/types';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function openHub(meta: MetaState): HTMLElement {
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
  root.querySelector<HTMLButtonElement>('[data-tab="quests"]')?.click();
  return root;
}

describe('fb095: quest tracker panel', () => {
  it('the Quests tab is reachable from the Hub nav', () => {
    openHub(defaultMeta());
    const navButton = document.querySelector<HTMLButtonElement>('[data-tab="quests"]');
    expect(navButton).not.toBeNull();
    expect(navButton?.textContent?.trim()).toBe('Quests');
  });

  it('lists every quest with its name and description', () => {
    const content = loadContent();
    const root = openHub(defaultMeta());
    const list = root.querySelector('.sw-questlist');
    expect(list).not.toBeNull();
    for (const q of content.quests.quests) {
      expect(list?.textContent).toContain(q.name);
      expect(list?.textContent).toContain(q.desc);
    }
  });

  it('a gte quest shows a live progress fraction against meta.questProgress', () => {
    // "First Dawn": metric "wins", target 1, compare gte.
    const meta: MetaState = { ...defaultMeta(), questProgress: { wins: 0 } };
    const root = openHub(meta);
    const row = root.querySelector('[data-quest="win_a_run"]');
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain('0 / 1');
    expect(row?.querySelector('.sw-meter i')?.getAttribute('style')).toContain('width:0%');
  });

  it('a completed gte quest shows a full bar and the done marker, not a live fraction below target', () => {
    const meta: MetaState = {
      ...defaultMeta(),
      questProgress: { wins: 6 },
      completedQuests: ['win_a_run', 'plaguebringer_veteran', 'chrono_veteran'],
    };
    const root = openHub(meta);
    const row = root.querySelector('[data-quest="chrono_veteran"]');
    expect(row).not.toBeNull();
    expect(row?.classList.contains('done')).toBe(true);
    expect(row?.textContent).toContain('✓'); // ✓
    expect(row?.querySelector('.sw-meter i')?.getAttribute('style')).toContain('width:100%');
  });

  it('an incomplete lte quest ("under N seconds/at most N") reports its best value without a partial bar fill', () => {
    // "Ninety Seconds": metric "fastest_boss_kill", target 90, compare lte.
    const meta: MetaState = { ...defaultMeta(), questProgress: { fastest_boss_kill: 140 } };
    const root = openHub(meta);
    const row = root.querySelector('[data-quest="fast_boss"]');
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain('best 140');
    expect(row?.textContent).toContain('need <= 90');
    expect(row?.querySelector('.sw-meter i')?.getAttribute('style')).toContain('width:0%');
  });

  it("resolves a quest's reward to the unlocked class/core's real display name, not the raw data key", () => {
    const content = loadContent();
    const root = openHub(defaultMeta());
    // build_40_obelisks -> class:cryomancer
    const classRow = root.querySelector('[data-quest="build_40_obelisks"]');
    expect(classRow?.textContent).toContain(content.classByKey.get('cryomancer')?.name);
    // poison_purge -> core:carnivorous_plant
    const coreRow = root.querySelector('[data-quest="poison_purge"]');
    expect(coreRow?.textContent).toContain(content.coreByKey.get('carnivorous_plant')?.name);
  });

  it('a gte quest with a negative (corrupted-save) progress value clamps its displayed text the same way as its bar', () => {
    // qa-playtester (fb095 verification): the bar already clamped to 0% via
    // Math.max, but the text read "-100 / 5000" unclamped — fixed to match.
    const meta: MetaState = { ...defaultMeta(), questProgress: { lifetime_gold: -100 } };
    const root = openHub(meta);
    const row = root.querySelector('[data-quest="hoarder"]');
    expect(row?.textContent).toContain('0 / 5000');
    expect(row?.textContent).not.toContain('-100');
    expect(row?.querySelector('.sw-meter i')?.getAttribute('style')).toContain('width:0%');
  });

  it('a non-class/core reward (e.g. a passive) falls back to a humanized raw value, not a raw content-lookup miss', () => {
    // maze_master -> passive:wall_hp_10, the only non-class/core reward kind in data/quests.json.
    const root = openHub(defaultMeta());
    const passiveRow = root.querySelector('[data-quest="maze_master"]');
    expect(passiveRow?.textContent).toContain('Passive: wall hp 10');
  });
});
