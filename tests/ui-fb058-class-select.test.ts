/**
 * @vitest-environment jsdom
 *
 * fb058 (SPEC-FINAL §4, §11, owner feedback `feature-class-select-redesign`):
 * the Hub's Class-select screen — a horizontal row of tall class cards
 * (`.sw-classcard`), a normal profile limited to Swordsman/Plaguebringer/
 * Time Lord, a dev-only "show hidden classes" setting that reveals the rest,
 * a band/number stats panel for the selected class, and four hover-only
 * entries (passive/tower passive/Active1/Active2) whose tooltip markup is
 * `class-info.ts`'s existing fb022/fb026 sentence-form text with live /data
 * numbers embedded — asserted here the same way fb026's bottom-bar tooltip
 * tests do, by reading the tip element's `innerHTML` rather than simulating
 * `:hover` (jsdom does not evaluate `:hover` against a stylesheet).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Hub } from '../src/ui/hub';
import { loadContent } from '../src/sim/content';
import { defaultMeta } from '../src/meta/meta';
import { defaultSettings } from '../src/ui/settings';
import { NORMAL_PROFILE_CLASS_KEYS, CLASS_BANDS } from '../src/ui/class-select';
import type { MetaState, RunConfig } from '../src/sim/types';
import type { Settings } from '../src/ui/settings';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');
const content = loadContent();

function openHub(
  meta: MetaState = defaultMeta(),
  settings: Settings = defaultSettings(),
): { root: HTMLElement; hub: Hub } {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
  const hub = new Hub(root, meta, 1, {
    settings,
    onStart: () => {},
    onMetaChanged: () => {},
    onSettingsChanged: () => {},
  });
  hub.show();
  return { root, hub };
}

describe('fb058: Class-select screen — normal profile shows exactly 3 classes', () => {
  it('renders exactly 3 class cards, one per NORMAL_PROFILE_CLASS_KEYS entry, with showHiddenClasses off', () => {
    const { root } = openHub();
    const cards = [...root.querySelectorAll<HTMLElement>('.sw-classcard[data-class]')];
    expect(cards).toHaveLength(3);
    expect(new Set(cards.map((c) => c.dataset.class))).toEqual(new Set(NORMAL_PROFILE_CLASS_KEYS));
  });

  it('the 12-class roster stays fully defined in content.classes regardless of what the screen shows', () => {
    expect(content.classes.classes.length).toBeGreaterThanOrEqual(12);
  });
});

describe('fb058: the dev "show hidden classes" toggle reveals the full roster', () => {
  it('with showHiddenClasses on, every content.classes class gets a card', () => {
    const { root } = openHub(defaultMeta(), { ...defaultSettings(), showHiddenClasses: true });
    const cards = [...root.querySelectorAll<HTMLElement>('.sw-classcard[data-class]')];
    expect(cards).toHaveLength(content.classes.classes.length);
    const keys = new Set(cards.map((c) => c.dataset.class));
    for (const c of content.classes.classes) expect(keys.has(c.key)).toBe(true);
  });

  it('the Settings tab offers the toggle (dev profile is active under test)', () => {
    const { root, hub } = openHub();
    hub.openTab('settings');
    const toggle = root.querySelector<HTMLInputElement>('[data-toggle="showHiddenClasses"]');
    expect(toggle).not.toBeNull();
  });

  it('selecting a hidden class, then toggling the setting back off on the same Hub, falls back to a visible class instead of an empty panel', () => {
    const { root, hub } = openHub(defaultMeta(), { ...defaultSettings(), showHiddenClasses: true });
    // Engineer is unlocked by default but outside NORMAL_PROFILE_CLASS_KEYS.
    root.querySelector<HTMLElement>('[data-class="engineer"]')!.dispatchEvent(
      new window.MouseEvent('click', { bubbles: true }),
    );
    expect(root.querySelector('.sw-classdetail')!.textContent).toContain(
      content.classByKey.get('engineer')!.passive.name,
    );

    hub.openTab('settings');
    const toggle = root.querySelector<HTMLInputElement>('[data-toggle="showHiddenClasses"]')!;
    toggle.checked = false;
    toggle.dispatchEvent(new window.Event('change', { bubbles: true }));
    hub.openTab('run');

    const cards = [...root.querySelectorAll<HTMLElement>('.sw-classcard[data-class]')];
    expect(cards).toHaveLength(3);
    expect(new Set(cards.map((c) => c.dataset.class))).toEqual(new Set(NORMAL_PROFILE_CLASS_KEYS));
    const detail = root.querySelector('.sw-classdetail')!;
    expect([...detail.querySelectorAll('.sw-cs-skill')]).toHaveLength(4);
    // Falls back to a class that is both visible and unlocked (swordsman, per
    // `visibleClasses[0]` in hub.ts), never staying pinned to hidden Engineer.
    expect(detail.textContent).toContain(content.classByKey.get('swordsman')!.passive.name);
  });
});

describe('fb058: selecting a class fills the bottom panel with band/number stats', () => {
  it("Swordsman's band panel shows its SPEC-FINAL §4 bands and the live /data numbers behind them", () => {
    const { root } = openHub();
    const swordsman = content.classByKey.get('swordsman')!;
    const bands = CLASS_BANDS.swordsman;
    const detail = root.querySelector('.sw-classdetail')!.textContent ?? '';
    expect(detail).toContain(bands.range); // 'low'
    expect(detail).toContain(bands.dmg); // 'high'
    expect(detail).toContain(`${swordsman.basicAttack.range} tiles`);
    expect(detail).toContain(`${swordsman.basicAttack.dps} dps`);
    expect(detail).toContain(`+${Math.round(swordsman.moveSpeedBonus * 100)}%`);
  });

  it('switching the selected card updates the band panel to the new class', () => {
    const { root } = openHub();
    root.querySelector<HTMLElement>('[data-class="plaguebringer"]')!.dispatchEvent(
      new window.MouseEvent('click', { bubbles: true }),
    );
    const plaguebringer = content.classByKey.get('plaguebringer')!;
    const detail = root.querySelector('.sw-classdetail')!.textContent ?? '';
    expect(detail).toContain(`${plaguebringer.basicAttack.range} tiles`);
    expect(detail).toContain(CLASS_BANDS.plaguebringer.range);
  });
});

describe('fb058: a locked class can never reach RunConfig, even from a corrupted unlockedClasses save', () => {
  it('a save whose unlockedClasses omits every NORMAL_PROFILE_CLASS_KEYS entry still starts a run with an unlocked class', () => {
    // qa-playtester repro: `unlockedClasses: ['engineer']` has no
    // swordsman/plaguebringer/time_lord, so `visibleClasses` (the normal-
    // profile filter) contains only locked classes; the render-time fallback
    // picks `visibleClasses[0]` regardless of lock state, same as before this
    // fix, since previewing a locked class's stats is intentional (the card
    // still renders "on" with its full band panel). What must never happen is
    // that preview selection reaching `beginRun()`'s RunConfig un-gated.
    const meta: MetaState = { ...defaultMeta(), unlockedClasses: ['engineer'] };
    document.head.innerHTML = `<style>${CSS}</style>`;
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app') as HTMLElement;
    let started: RunConfig | undefined;
    const hub = new Hub(root, meta, 1, {
      settings: defaultSettings(),
      onStart: (cfg) => {
        started = cfg;
      },
      onMetaChanged: () => {},
      onSettingsChanged: () => {},
    });
    hub.show();

    // The previewed selection is allowed to be the locked swordsman card...
    const onCard = root.querySelector<HTMLElement>('.sw-classcard.on');
    expect(onCard?.dataset.class).toBe('swordsman');
    expect(meta.unlockedClasses).not.toContain('swordsman');

    // ...but starting a run must never carry that locked class through.
    root.querySelector<HTMLElement>('#sw-start')!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(started).toBeDefined();
    expect(meta.unlockedClasses).toContain(started!.classKey);
  });
});

describe('fb058: the four hover entries show sentence-form text with live numbers', () => {
  it('Passive/Tower passive/Active1/Active2 each get one .sw-cs-skill entry with the class-info.ts effect text', () => {
    const { root } = openHub();
    const swordsman = content.classByKey.get('swordsman')!;
    const entries = [...root.querySelectorAll<HTMLElement>('.sw-cs-skill')];
    expect(entries).toHaveLength(4);

    const tips = entries.map((e) => e.querySelector('.sw-cs-tip')!.innerHTML);
    const [passiveTip, towerTip, a1Tip, a2Tip] = tips;

    expect(passiveTip).toContain(swordsman.passive.name);
    expect(passiveTip).toContain(swordsman.passive.description);

    expect(towerTip).toContain(swordsman.towerPassive.name);
    expect(towerTip).toContain(swordsman.towerPassive.description);

    expect(a1Tip).toContain(swordsman.active1.name);
    expect(a1Tip).toContain(`${swordsman.active1.cooldownSeconds}s`);

    expect(a2Tip).toContain(swordsman.active2.name);
  });
});
