/**
 * @vitest-environment jsdom
 *
 * fb023 (SPEC-FINAL §7, §11): "equipping works from the Equipment screen in
 * Hub and mid-run" — the mid-run half. `equip_item` is a real Command
 * (`equipItemCommand`, src/sim/run.ts) that swaps an owned item into a slot,
 * live, the same way the Hub's Equipment screen does; it stays reachable by
 * bots/replays (CLAUDE.md architecture rule 3) even though fb157 later
 * removed the character panel's own equip/swap UI — see the last describe
 * block below, which now asserts the read-only replacement instead of the
 * retired click-to-swap screen.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { applyCommand } from '../src/sim/run';
import { World } from '../src/sim/world';
import { loadContent } from '../src/sim/content';
import { Hud } from '../src/ui/hud';
import { cfg } from './helpers';

describe('fb023: the equip_item Command', () => {
  const content = loadContent();
  const weapon = content.equipment.items.find((i) => i.slot === 'weapon')!;
  const otherWeapon = content.equipment.items.find((i) => i.slot === 'weapon' && i.key !== weapon.key)!;
  const armor = content.equipment.items.find((i) => i.slot === 'armor')!;

  it('equips an owned item into its slot and folds its mods into Stats', () => {
    const w = new World(cfg({ ownedEquipment: { [weapon.key]: 1 } }));
    expect(w.equippedEquipment.weapon).toBeNull();
    applyCommand(w, { k: 'equip_item', slot: 'weapon', item: weapon.key });
    expect(w.equippedEquipment.weapon).toBe(weapon.key);
    for (const [stat, value] of Object.entries(weapon.mods)) {
      expect(w.stats.contributions(stat as never)).toContainEqual([`equipment:${weapon.key}`, value]);
    }
  });

  it('swapping a slot removes the old item source and adds the new one', () => {
    const w = new World(cfg({ ownedEquipment: { [weapon.key]: 1, [otherWeapon.key]: 1 } }));
    applyCommand(w, { k: 'equip_item', slot: 'weapon', item: weapon.key });
    const revisionAfterFirst = w.stats.revision;
    applyCommand(w, { k: 'equip_item', slot: 'weapon', item: otherWeapon.key });
    expect(w.equippedEquipment.weapon).toBe(otherWeapon.key);
    expect(w.stats.contributions('atkFlat').some(([source]) => source === `equipment:${weapon.key}`)).toBe(false);
    expect(w.stats.revision).toBeGreaterThan(revisionAfterFirst);
  });

  it('unequips with item: null, returning Stats to their pre-equip state', () => {
    const w = new World(cfg({ ownedEquipment: { [weapon.key]: 1 } }));
    const before = w.stats.total('atkFlat');
    applyCommand(w, { k: 'equip_item', slot: 'weapon', item: weapon.key });
    expect(w.stats.total('atkFlat')).not.toBe(before);
    applyCommand(w, { k: 'equip_item', slot: 'weapon', item: null });
    expect(w.equippedEquipment.weapon).toBeNull();
    expect(w.stats.total('atkFlat')).toBe(before);
  });

  it('refuses to equip an item the run does not own', () => {
    const w = new World(cfg({ ownedEquipment: {} }));
    applyCommand(w, { k: 'equip_item', slot: 'weapon', item: weapon.key });
    expect(w.equippedEquipment.weapon).toBeNull();
  });

  it('refuses an item into a slot that is not its own', () => {
    const w = new World(cfg({ ownedEquipment: { [weapon.key]: 1 } }));
    applyCommand(w, { k: 'equip_item', slot: 'armor', item: weapon.key });
    expect(w.equippedEquipment.armor).toBeNull();
  });

  it('refuses an unknown slot outright', () => {
    const w = new World(cfg({ ownedEquipment: { [weapon.key]: 1 } }));
    expect(() => applyCommand(w, { k: 'equip_item', slot: 'not_a_slot', item: weapon.key })).not.toThrow();
    expect(w.equippedEquipment.not_a_slot).toBeUndefined();
  });

  it('owning an item never gets consumed by equipping it (a fixed row, not a unique instance)', () => {
    const w = new World(cfg({ ownedEquipment: { [weapon.key]: 1 } }));
    applyCommand(w, { k: 'equip_item', slot: 'weapon', item: weapon.key });
    expect(w.ownedEquipment[weapon.key]).toBe(1);
  });

  it('seeds equippedEquipment from cfg.equipment at construction, keyed by each item\'s own slot', () => {
    const w = new World(cfg({ equipment: [weapon.key, armor.key] }));
    expect(w.equippedEquipment.weapon).toBe(weapon.key);
    expect(w.equippedEquipment.armor).toBe(armor.key);
  });
});

describe('fb023: two runs differing only by a mid-run equip_item swap hash differently', () => {
  it('diverges the end-state hash', () => {
    const content = loadContent();
    const weapon = content.equipment.items.find((i) => i.slot === 'weapon')!;
    const base = cfg({ ownedEquipment: { [weapon.key]: 1 } });
    const a = new World(base);
    const b = new World(base);
    applyCommand(b, { k: 'equip_item', slot: 'weapon', item: weapon.key });
    for (let i = 0; i < 60; i++) {
      a.tick++;
      b.tick++;
    }
    expect(a.stats.revision).not.toBe(b.stats.revision);
  });
});

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function mount(): HTMLElement {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  return document.getElementById('app') as HTMLElement;
}

describe('fb023/fb157: the in-run character panel Equipment section is read-only', () => {
  function makeHud(root: HTMLElement, onEquipItem: (slot: string, item: string | null) => void): Hud {
    return new Hud(root, {
      onSelectTower: () => {},
      onCallWave: () => {},
      onPickOffer: () => {},
      onReroll: () => {},
      onRetry: () => {},
      onNewRun: () => {},
      onToggleRanges: () => {},
      onToggleAutoPick: () => {},
      onToggleCharacterPanel: () => {},
      onEquipItem,
      onToggleDpsPanel: () => {},
      onResume: () => {},
      onPause: () => {},
      onCycleSpeed: () => {},
      onSetSpeed: () => {},
      onDev: () => {},
      onQuitToHub: () => {},
      onHoverSkill: () => {}, onUpgradeStructure: () => {}, onSellStructure: () => {}, onUpgradeCore: () => {},
    });
  }

  // fb157 (owner feedback `ui-character-panel-compact`): equipment cannot be
  // changed during a run any more — only in the Hub — so the panel shows six
  // plain (non-clickable) slot boxes and never dispatches `equip_item`.
  it('shows six slot boxes with no clickable equip/unequip controls', () => {
    const content = loadContent();
    const weapon = content.equipment.items.find((i) => i.slot === 'weapon')!;
    const root = mount();
    const calls: [string, string | null][] = [];
    const hud = makeHud(root, (slot, item) => calls.push([slot, item]));
    const w = new World(cfg({ ownedEquipment: { [weapon.key]: 1 }, equipment: [weapon.key] }));
    hud.buildTowerBar(w);
    hud.toggleCharacterPanel(w);

    const panel = root.querySelector('#sw-charpanel') as HTMLElement;
    expect(panel.querySelectorAll('.sw-runeq-slot').length).toBe(content.equipment.slots.length);
    // Neither the old click-to-swap attributes nor any <button> survive the
    // read-only rewrite — a slot box is a plain, non-interactive <div>.
    expect(panel.querySelectorAll('[data-runeqslot]').length).toBe(0);
    expect(panel.querySelectorAll('[data-runitem]').length).toBe(0);
    expect(panel.querySelectorAll('button.sw-runeq-item').length).toBe(0);

    const slotEl = panel.querySelector('.sw-runeq-slot') as HTMLElement;
    slotEl.click();
    expect(calls).toEqual([]); // clicking it never reaches onEquipItem
  });

  it('an occupied slot box carries a tooltip explaining why it cannot be changed here', () => {
    const content = loadContent();
    const weapon = content.equipment.items.find((i) => i.slot === 'weapon')!;
    const root = mount();
    const hud = makeHud(root, () => {});
    const w = new World(cfg({ equipment: [weapon.key] }));
    hud.buildTowerBar(w);
    hud.toggleCharacterPanel(w);

    const panel = root.querySelector('#sw-charpanel') as HTMLElement;
    const slotEl = panel.querySelector('.sw-runeq-slot') as HTMLElement;
    expect(slotEl.title.toLowerCase()).toContain('hub');
    expect(slotEl.textContent).toContain(weapon.name);
  });
});
