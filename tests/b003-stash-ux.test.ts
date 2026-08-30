/**
 * @vitest-environment jsdom
 *
 * SPEC-V2 D2 / gate B10 (stash half), repurposed at fb023: clicking an owned
 * equipment item while its slot is occupied swaps it in (the old item stays
 * owned, it is never removed from the account to begin with); an equipped
 * item can be unequipped again by clicking it a second time or by the
 * explicit button in the detail panel, or by clicking the slot box itself —
 * so there is no state a click can walk you into and not back out of.
 * Right-click selects an item for the compare panel without equipping it.
 *
 * fb023 (SPEC-FINAL §7, §11) retired the relic stash/equip UI this file used
 * to cover (`[data-relic]`, `[data-eqslot]` drag-and-drop, `[data-discard]`
 * — none of that DOM exists in the Hub anymore, see `src/ui/hub.ts`'s
 * `renderEquipment`). The "never a dead end" guarantee itself still applies,
 * just to the surviving Equipment screen, so this file was rewritten in
 * place against `[data-item]`/`[data-eqitemslot]` rather than deleted.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Hub } from '../src/ui/hub';
import { defaultMeta } from '../src/meta/meta';
import { defaultSettings } from '../src/ui/settings';
import type { MetaState } from '../src/sim/types';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function metaWith(equipmentStash: Record<string, number>, equippedEquipment: Record<string, string | null> = {}): MetaState {
  const base = defaultMeta();
  return { ...base, equipmentStash, equippedEquipment: { ...base.equippedEquipment, ...equippedEquipment } };
}

function mountHub(meta: MetaState): { root: HTMLElement; latest: () => MetaState } {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
  let current = meta;
  const hub = new Hub(root, meta, 1, {
    settings: defaultSettings(),
    onStart: () => {},
    onMetaChanged: (m) => (current = m),
    onSettingsChanged: () => {},
  });
  hub.show();
  hub.openTab('equipment');
  return { root, latest: () => current };
}

function click(el: Element): void {
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

function rightClick(el: Element): void {
  el.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
}

describe('clicking an owned item equips it, swapping whatever was there', () => {
  it('equips into an empty slot on the first click', () => {
    const { root, latest } = mountHub(metaWith({ sleeve_sword: 1 }));
    click(root.querySelector('[data-item="sleeve_sword"]')!);
    expect(latest().equippedEquipment.weapon).toBe('sleeve_sword');
  });

  it('swaps in the new item and leaves the old one owned, not discarded', () => {
    const { root, latest } = mountHub(
      metaWith({ sleeve_sword: 1, greatsword: 1 }, { weapon: 'sleeve_sword' }),
    );
    click(root.querySelector('[data-item="greatsword"]')!);
    expect(latest().equippedEquipment.weapon).toBe('greatsword');
    expect(latest().equipmentStash.sleeve_sword).toBe(1);
  });

  it('never lands an item in the wrong slot', () => {
    const { root, latest } = mountHub(metaWith({ sleeve_sword: 1, swordsman_armor: 1 }));
    click(root.querySelector('[data-item="swordsman_armor"]')!);
    expect(latest().equippedEquipment.armor).toBe('swordsman_armor');
    expect(latest().equippedEquipment.weapon).toBeNull();
  });
});

describe('an equipped item is never a dead end', () => {
  it('clicking the equipped item again unequips it', () => {
    const { root, latest } = mountHub(metaWith({ sleeve_sword: 1 }, { weapon: 'sleeve_sword' }));
    click(root.querySelector('[data-item="sleeve_sword"]')!);
    expect(latest().equippedEquipment.weapon).toBeNull();
    // The item itself is untouched — unequip does not consume it.
    expect(latest().equipmentStash.sleeve_sword).toBe(1);
  });

  it('the detail panel button reads "Unequip" for an equipped item and works', () => {
    const { root, latest } = mountHub(metaWith({ sleeve_sword: 1 }, { weapon: 'sleeve_sword' }));
    // Right-click selects for the detail panel without touching the equip state.
    rightClick(root.querySelector('[data-item="sleeve_sword"]')!);
    expect(latest().equippedEquipment.weapon).toBe('sleeve_sword');
    const btn = root.querySelector('[data-equipitem]') as HTMLButtonElement;
    expect(btn.textContent).toMatch(/Unequip/);
    click(btn);
    expect(latest().equippedEquipment.weapon).toBeNull();
  });

  it('clicking the equipped slot box unequips it', () => {
    const { root, latest } = mountHub(metaWith({ sleeve_sword: 1 }, { weapon: 'sleeve_sword' }));
    click(root.querySelector('[data-eqitemslot="weapon"]')!);
    expect(latest().equippedEquipment.weapon).toBeNull();
  });

  it('clicking an empty slot box is a no-op', () => {
    const { root, latest } = mountHub(metaWith({}));
    click(root.querySelector('[data-eqitemslot="weapon"]')!);
    expect(latest().equippedEquipment.weapon).toBeNull();
  });

  it('the owned-items grid still exists and works when it is in its empty-state markup', () => {
    const meta = defaultMeta();
    const { root } = mountHub(meta);
    const grid = root.querySelector('.sw-itemstash') as HTMLElement;
    expect(grid).not.toBeNull();
    expect(grid.textContent).toMatch(/Empty/);
  });
});

describe('right-click compares without equipping', () => {
  it('selects the item for the detail panel but leaves the equip state alone', () => {
    const { root, latest } = mountHub(
      metaWith({ sleeve_sword: 1, greatsword: 1 }, { weapon: 'sleeve_sword' }),
    );
    rightClick(root.querySelector('[data-item="greatsword"]')!);
    expect(latest().equippedEquipment.weapon).toBe('sleeve_sword');
    expect(root.querySelector('.sw-relicdetail b')?.textContent).toBe('Greatsword');
  });

  it('shows a compare block against the currently equipped item', () => {
    const { root } = mountHub(metaWith({ sleeve_sword: 1, greatsword: 1 }, { weapon: 'sleeve_sword' }));
    rightClick(root.querySelector('[data-item="greatsword"]')!);
    const compare = root.querySelector('.sw-compare');
    expect(compare).not.toBeNull();
  });

  it('shows no compare block for the item that is already equipped', () => {
    const { root } = mountHub(metaWith({ sleeve_sword: 1, greatsword: 1 }, { weapon: 'sleeve_sword' }));
    rightClick(root.querySelector('[data-item="sleeve_sword"]')!);
    expect(root.querySelector('.sw-compare')).toBeNull();
  });
});
