/**
 * @vitest-environment jsdom
 *
 * fb117 (SPEC-FINAL §5.5, §11, owner feedback
 * `feature-core-select-ui.md`): the Hub's Core-select screen redesigned to
 * mirror fb058's Class-select layout — a horizontal row of tall Core cards
 * (`.sw-classcard`, reused verbatim from fb058), a base-HP/upgrade-track
 * summary for the selected Core, and hover-only entries (`.sw-cs-skill`/
 * `.sw-cs-tip`) for its TD effect, VS effect and each upgrade step whose
 * tooltip text carries live /data numbers — asserted the same way fb058's own
 * test reads `.sw-cs-tip`'s `innerHTML` rather than simulating `:hover`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Hub } from '../src/ui/hub';
import { loadContent } from '../src/sim/content';
import { defaultMeta } from '../src/meta/meta';
import { defaultSettings } from '../src/ui/settings';
import type { MetaState } from '../src/sim/types';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');
const content = loadContent();

/** The Hub renders `.sw-classdetail` for both the Class and Core panels — pick the one naming this Core, same convention `fb022-info-surfacing.test.ts` uses. */
function coreDetail(root: HTMLElement, coreName: string): HTMLElement {
  return [...root.querySelectorAll<HTMLElement>('.sw-classdetail')].find((el) =>
    el.textContent?.includes(coreName),
  )!;
}

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
  return { root, hub };
}

describe('fb117: Core-select screen mirrors fb058 — one tall card per Core', () => {
  it('renders exactly one .sw-classcard[data-core] per content.cores.cores entry', () => {
    const { root } = openHub();
    const cards = [...root.querySelectorAll<HTMLElement>('.sw-classcard[data-core]')];
    expect(cards).toHaveLength(content.cores.cores.length);
    expect(cards.length).toBeGreaterThanOrEqual(5);
    const keys = new Set(cards.map((c) => c.dataset.core));
    for (const c of content.cores.cores) expect(keys.has(c.key)).toBe(true);
  });

  it('an unlocked-by-default Core card is selected and not locked; every other Core starts locked with its unlock condition shown', () => {
    const { root } = openHub();
    const cards = [...root.querySelectorAll<HTMLElement>('.sw-classcard[data-core]')];
    for (const card of cards) {
      const def = content.cores.cores.find((c) => c.key === card.dataset.core)!;
      const shouldBeLocked = !defaultMeta().unlockedCores.includes(def.key);
      expect(card.classList.contains('locked')).toBe(shouldBeLocked);
      if (shouldBeLocked) {
        expect(card.hasAttribute('disabled')).toBe(true);
        expect(card.textContent).toContain(def.unlockCondition ?? 'complete a quest');
      }
    }
  });
});

describe('fb117: selecting a Core fills the bottom panel with base HP and an upgrade-track summary', () => {
  it("Stone Heart's summary shows its base HP and step count/cost from /data", () => {
    const { root } = openHub();
    const stoneHeart = content.cores.cores.find((c) => c.key === 'stone_heart')!;
    const detail = coreDetail(root, stoneHeart.name).textContent ?? '';
    expect(detail).toContain(`${stoneHeart.baseHp}`);
    expect(detail).toContain(`${stoneHeart.upgrade.count}`);
    expect(detail).toContain(`${stoneHeart.upgrade.stepCost}g`);
    expect(detail).toContain(stoneHeart.upgrade.desc);
  });

  it('clicking a locked Core card does not switch the panel to it', () => {
    const { root } = openHub();
    root
      .querySelector<HTMLElement>('[data-core="vampire_heart"]')!
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    // Locked cards get no click listener (fb117 keeps fb058's "disabled cards
    // don't reassign selection" pattern) — the panel stays on the previously
    // selected, unlocked Core rather than silently no-op switching to a
    // locked one this click can't actually select.
    const stoneHeart = content.cores.cores.find((c) => c.key === 'stone_heart')!;
    expect(coreDetail(root, stoneHeart.name)).toBeTruthy();
    const onCard = root.querySelector<HTMLElement>('.sw-classcard[data-core].on');
    expect(onCard?.dataset.core).toBe('stone_heart');
  });

  it('an unlocked non-default Core becomes selectable and updates the panel', () => {
    const meta: MetaState = { ...defaultMeta(), unlockedCores: ['stone_heart', 'vampire_heart'] };
    const { root } = openHub(meta);
    root
      .querySelector<HTMLElement>('[data-core="vampire_heart"]')!
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const vampireHeart = content.cores.cores.find((c) => c.key === 'vampire_heart')!;
    const detail = coreDetail(root, vampireHeart.name).textContent ?? '';
    expect(detail).toContain(`${vampireHeart.baseHp}`);
    const onCard = root.querySelector<HTMLElement>('.sw-classcard[data-core].on');
    expect(onCard?.dataset.core).toBe('vampire_heart');
  });
});

describe('fb117: hovering the TD effect / VS effect / each upgrade step shows numbers matching /data', () => {
  it('Carnivorous Plant gets one hover entry for TD effect, one for VS effect, and one per upgrade step, with live numbers', () => {
    const meta: MetaState = { ...defaultMeta(), unlockedCores: ['stone_heart', 'carnivorous_plant'] };
    const { root } = openHub(meta);
    root
      .querySelector<HTMLElement>('[data-core="carnivorous_plant"]')!
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    const def = content.cores.cores.find((c) => c.key === 'carnivorous_plant')!;
    const detail = coreDetail(root, def.name);
    const entries = [...detail.querySelectorAll<HTMLElement>('.sw-cs-skill')];
    // 2 base-phase entries + one per upgrade step.
    expect(entries).toHaveLength(2 + (def.upgrade.steps?.length ?? 0));

    const labels = entries.map((e) => e.querySelector('.sw-cs-label')!.textContent);
    expect(labels[0]).toBe('TD effect');
    expect(labels[1]).toBe('VS effect');
    expect(labels[2]).toContain(`Step 1 of ${def.upgrade.count}`);
    expect(labels[2]).toContain(`${def.upgrade.stepCost}g`);

    const tdTip = entries[0].querySelector('.sw-cs-tip')!.innerHTML;
    expect(tdTip).toContain(`${def.effects!.devourRadius}`);
    expect(tdTip).not.toContain('poisonVolleyInterval');

    const vsTip = entries[1].querySelector('.sw-cs-tip')!.innerHTML;
    expect(vsTip).toContain(`${def.effects!.poisonBulletDamage}`);

    const step1Tip = entries[2].querySelector('.sw-cs-tip')!.innerHTML;
    const step1 = def.upgrade.steps![0];
    expect(step1Tip).toContain(`${step1.devourRangeBonus}`);
  });

  it("Stone Heart's single upgrade dimension (Core HP) still gets one hover entry per step with the /data bonus", () => {
    const { root } = openHub();
    const def = content.cores.cores.find((c) => c.key === 'stone_heart')!;
    const detail = coreDetail(root, def.name);
    const stepEntries = [...detail.querySelectorAll<HTMLElement>('.sw-cs-skill')].slice(2);
    expect(stepEntries).toHaveLength(def.upgrade.steps!.length);
    stepEntries.forEach((entry, i) => {
      const tip = entry.querySelector('.sw-cs-tip')!.innerHTML;
      expect(tip).toContain(`${def.upgrade.steps![i].coreHpBonus}`);
    });
  });
});
