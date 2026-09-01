/**
 * @vitest-environment jsdom
 *
 * fb023 (SPEC-FINAL §7, §11): "equipping works from the Equipment screen in
 * Hub and mid-run" — the mid-run half. `equip_item` is a real Command
 * (`equipItemCommand`, src/sim/run.ts) that swaps an owned item into a slot,
 * live, the same way the Hub's Equipment screen does, and the character
 * panel (`src/ui/hud.ts`) exposes the same slot-boxes-plus-owned-list screen
 * during a run.
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

describe('fb023: the in-run character panel Equipment section', () => {
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
      onDev: () => {},
      onQuitToHub: () => {},
      onHoverSkill: () => {}, onUpgradeStructure: () => {}, onSellStructure: () => {}, onUpgradeCore: () => {},
    });
  }

  it('shows six slot boxes and the owned-items list, and clicking an owned item asks to equip it', () => {
    const content = loadContent();
    const weapon = content.equipment.items.find((i) => i.slot === 'weapon')!;
    const root = mount();
    const calls: [string, string | null][] = [];
    const hud = makeHud(root, (slot, item) => calls.push([slot, item]));
    const w = new World(cfg({ ownedEquipment: { [weapon.key]: 1 } }));
    hud.buildTowerBar(w);
    hud.toggleCharacterPanel(w);

    const panel = root.querySelector('#sw-charpanel') as HTMLElement;
    expect(panel.querySelectorAll('[data-runeqslot]').length).toBe(content.equipment.slots.length);
    const itemBtn = panel.querySelector(`[data-runitem="${weapon.key}"]`) as HTMLElement;
    expect(itemBtn).not.toBeNull();
    itemBtn.click();
    expect(calls).toEqual([[weapon.slot, weapon.key]]);
  });

  it('clicking the equipped item a second time asks to unequip it', () => {
    const content = loadContent();
    const weapon = content.equipment.items.find((i) => i.slot === 'weapon')!;
    const root = mount();
    const calls: [string, string | null][] = [];
    const hud = makeHud(root, (slot, item) => calls.push([slot, item]));
    const w = new World(cfg({ ownedEquipment: { [weapon.key]: 1 }, equipment: [weapon.key] }));
    hud.buildTowerBar(w);
    hud.toggleCharacterPanel(w);

    const panel = root.querySelector('#sw-charpanel') as HTMLElement;
    (panel.querySelector(`[data-runitem="${weapon.key}"]`) as HTMLElement).click();
    expect(calls).toEqual([[weapon.slot, null]]);
  });

  it('clicking an occupied slot box asks to unequip it', () => {
    const content = loadContent();
    const weapon = content.equipment.items.find((i) => i.slot === 'weapon')!;
    const root = mount();
    const calls: [string, string | null][] = [];
    const hud = makeHud(root, (slot, item) => calls.push([slot, item]));
    const w = new World(cfg({ equipment: [weapon.key] }));
    hud.buildTowerBar(w);
    hud.toggleCharacterPanel(w);

    const panel = root.querySelector('#sw-charpanel') as HTMLElement;
    (panel.querySelector(`[data-runeqslot="weapon"]`) as HTMLElement).click();
    expect(calls).toEqual([['weapon', null]]);
  });
});
