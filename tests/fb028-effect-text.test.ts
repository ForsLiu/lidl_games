/**
 * @vitest-environment jsdom
 *
 * fb028 (SPEC-FINAL §11, extends fb004/fb022, owner feedback
 * `feature-detailed-effect-text`): the equipment-specific extension of
 * fb022's info-surfacing work — the in-run equipment section's hover
 * tooltips and the Codex's classes/equipment detail views, both new this
 * item, plus the multi-conditional-item numeric proof the acceptance
 * criterion names explicitly: Swordsman Armor's Circle Slash charge-rate
 * note must show the real `w.derived.attackSpeedMul`, not a guessed number,
 * and must switch text (still with the live number) once Sleeve Sword is
 * also equipped.
 */
import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { World } from '../src/sim/world';
import { applyCommand } from '../src/sim/run';
import { hasEquipment } from '../src/sim/equipment';
import { defaultMeta, seedTestEquipment } from '../src/meta/meta';
import { characterPanelData } from '../src/ui/character-panel';
import { characterPanelMarkup } from '../src/ui/hud';
import { classAbilitiesMarkup } from '../src/ui/class-info';
import {
  equipmentCodexDetailMarkup,
  equipmentEffectMarkup,
  equipmentFallbackMarkup,
  equipmentSpecialNoteMarkup,
} from '../src/ui/equipment-info';
import { mountCodex } from '../src/ui/codex';
import { buildCodexCollections } from '../src/ui/codex-collections';
import { Hub } from '../src/ui/hub';
import { defaultSettings } from '../src/ui/settings';
import { cfg } from './helpers';

const content = loadContent();
const swordsmanArmor = content.equipmentByKey.get('swordsman_armor')!;
const sleeveSword = content.equipmentByKey.get('sleeve_sword')!;
const swordsmanShoes = content.equipmentByKey.get('swordsman_shoes')!;

function worldWith(equipment: string[], classKey = 'swordsman'): World {
  const w = new World(cfg({ classKey, equipment }));
  w.gold = 1e6;
  return w;
}

describe('fb028/fb052: equipmentEffectMarkup — Swordsman Armor, the multi-conditional item', () => {
  it('shows the real w.derived.attackSpeedMul on BOTH lines, base line active, for a Swordsman with no Sleeve Sword', () => {
    const w = worldWith(['swordsman_armor']);
    const mul = w.derived.attackSpeedMul;
    expect(mul).not.toBe(1); // the item's own +10% attack speed already moves it — a stale/guessed number would not track this
    const html = equipmentEffectMarkup(content, swordsmanArmor, {
      classKey: 'swordsman',
      attackSpeedMul: mul,
      equippedKeys: ['swordsman_armor'],
    });
    // fb052: both lines always render, each independently marked — the cross-item
    // line is no longer hidden just because its companion isn't equipped.
    expect(html).toContain('Circle Slash charging speed scales with attack speed');
    expect(html).toContain('boosted by attack speed instead of charge rate');
    expect(html.match(new RegExp(`×${Math.round(mul * 100) / 100}`, 'g'))).toHaveLength(2);
    expect(html).toContain('(active)');
    expect(html).toContain('(inert)');
  });

  it('flips which line is (active) — the cross-item damage-boost note, not the charge-rate one — once Sleeve Sword is also equipped', () => {
    const w = worldWith(['swordsman_armor', 'sleeve_sword']);
    const mul = w.derived.attackSpeedMul;
    const html = equipmentEffectMarkup(content, swordsmanArmor, {
      classKey: 'swordsman',
      attackSpeedMul: mul,
      equippedKeys: w.cfg.equipment,
    });
    expect(html).toContain('boosted by attack speed instead of charge rate');
    expect(html).toContain('charging speed scales with attack speed');
    expect(html).toContain(`×${Math.round(mul * 100) / 100}`);
    const crossIdx = html.indexOf('boosted by attack speed instead of charge rate');
    const baseIdx = html.indexOf('charging speed scales with attack speed');
    expect(html.slice(baseIdx, baseIdx + 200)).toContain('(inert)');
    expect(html.slice(crossIdx, crossIdx + 200)).toContain('(active)');
  });

  it('marks the special note inert, and the classFallback line active, for a non-Swordsman', () => {
    const html = equipmentEffectMarkup(content, swordsmanArmor, { classKey: 'engineer' });
    expect(html).toContain('Circle Slash charging speed scales with attack speed');
    expect(html).toContain('(inert)');
    expect(html).toContain('If not Swordsman');
    expect(html).toContain('(active)');
  });

  it('omits the effectKey note entirely for an item with none (effectKey: "none")', () => {
    const plain = content.equipmentByKey.get('greatsword')!;
    const html = equipmentEffectMarkup(content, plain, { classKey: 'swordsman' });
    expect(equipmentSpecialNoteMarkup(plain, { classKey: 'swordsman' })).toBe('');
    expect(html).not.toContain('(active)');
    expect(html).not.toContain('(inert)');
  });

  it('equipmentFallbackMarkup alone still reads exactly as before the fb028 move out of hub.ts', () => {
    const active = equipmentFallbackMarkup(content, { classKey: 'engineer' }, swordsmanArmor);
    expect(active).toContain('If not Swordsman');
    expect(active).toContain('(active)');
    const inert = equipmentFallbackMarkup(content, { classKey: 'swordsman' }, swordsmanArmor);
    expect(inert).toContain('(inert for Swordsman)');
  });

  it('Sleeve Sword and Swordsman Shoes each surface their own note text', () => {
    expect(equipmentSpecialNoteMarkup(sleeveSword, { classKey: 'swordsman' })).toContain('instantly at max');
    expect(equipmentSpecialNoteMarkup(swordsmanShoes, { classKey: 'swordsman' })).toContain('Doubles Dash Slash distance');
  });

  it('code-reviewer (fb028): the note text is /data\'s own effectNote/effectNoteWith, not a second hand-written copy — the rendered sentence is a pure {mul} substitution of the exact authored string', () => {
    expect(sleeveSword.effectNote).toBeDefined();
    expect(equipmentSpecialNoteMarkup(sleeveSword, { classKey: 'swordsman' })).toContain(sleeveSword.effectNote!);

    const base = swordsmanArmor.effectNote!.replace('{mul}', '');
    expect(equipmentSpecialNoteMarkup(swordsmanArmor, { classKey: 'swordsman' })).toContain(base);
    const cross = swordsmanArmor.effectNoteWith!.text.replace('{mul}', '');
    expect(
      equipmentSpecialNoteMarkup(swordsmanArmor, { classKey: 'swordsman', equippedKeys: ['swordsman_armor', 'sleeve_sword'] }),
    ).toContain(cross);
  });

  it('qa-playtester (fb028): when ctx.equippedKeys is present, an item outside it reads (inert) regardless of class — the real hasEquipment gate, not class alone', () => {
    // With no equippedKeys at all (Hub/Codex context), class alone decides — unchanged behavior.
    expect(equipmentSpecialNoteMarkup(swordsmanArmor, { classKey: 'swordsman' })).toContain('(active)');
    // With equippedKeys present but not naming this item — the item was never in the run's
    // starting loadout, so hasEquipment(w, item.key) would read false even though the class matches.
    const html = equipmentSpecialNoteMarkup(swordsmanArmor, { classKey: 'swordsman', equippedKeys: ['greatsword'] });
    expect(html).toContain('(inert)');
    expect(html).not.toContain('(active)');
  });
});

describe('b076: the real sim gate tracks the live loadout, not the frozen starting one', () => {
  it('hasEquipment reads true for an item equipped mid-run that was absent from RunConfig.equipment, once its Stats mods and slot are live', () => {
    const w = new World(cfg({ classKey: 'swordsman', equipment: ['sleeve_sword'], ownedEquipment: { swordsman_armor: 1, sleeve_sword: 1 } }));
    applyCommand(w, { k: 'equip_item', slot: 'armor', item: 'swordsman_armor' });
    expect(w.equippedEquipment.armor).toBe('swordsman_armor');
    expect(w.stats.contributions('attackSpeed')).toContainEqual(['equipment:swordsman_armor', 0.1]);
    // The real sim gate every effectKey mechanic reads (classes.ts) — true, because
    // b076 fixed hasEquipment to read the live w.equippedEquipment, not the frozen
    // starting w.cfg.equipment swordsman_armor was absent from.
    expect(hasEquipment(w, 'swordsman_armor')).toBe(true);
  });

  it('the in-run tooltip agrees with hasEquipment — (active), not (inert), for that same mid-run-equipped item', () => {
    // A starting loadout with neither swordsman_armor nor sleeve_sword, so resolvedNote picks the
    // base (not cross-item) note text and the only question under test is active-vs-inert.
    const w = new World(cfg({ classKey: 'swordsman', equipment: ['greatsword'], ownedEquipment: { swordsman_armor: 1 } }));
    applyCommand(w, { k: 'equip_item', slot: 'armor', item: 'swordsman_armor' });
    const html = characterPanelMarkup(characterPanelData(w), w);
    // The slot tooltip must show the item's real effectKey state — active, matching hasEquipment.
    expect(html).toContain('Circle Slash charging speed scales with attack speed');
    expect(html).toContain('(active)');
  });

  it('the reverse case now reads (inert): unequipping an item from its slot mid-run turns its mechanic off too, even though it was in the starting loadout', () => {
    const w = new World(cfg({ classKey: 'swordsman', equipment: ['swordsman_armor'] }));
    expect(w.equippedEquipment.armor).toBe('swordsman_armor'); // World seeds the slot map from cfg.equipment at construction
    applyCommand(w, { k: 'equip_item', slot: 'armor', item: null }); // unequip it from its slot mid-run
    expect(w.equippedEquipment.armor).toBeNull();
    // hasEquipment reads the live w.equippedEquipment, so the now-empty slot reads false.
    expect(hasEquipment(w, 'swordsman_armor')).toBe(false);
  });
});

describe('fb028: in-run equipment section — hover tooltips on the character panel', () => {
  it('an equipped Swordsman Armor shows its live charge-rate number in the slot tooltip', () => {
    const w = worldWith(['swordsman_armor']);
    const html = characterPanelMarkup(characterPanelData(w), w);
    const mul = w.derived.attackSpeedMul;
    expect(html).toContain('sw-eq-tip');
    expect(html).toContain(`×${Math.round(mul * 100) / 100}`);
    expect(html).toContain('(active)');
  });

  // fb157 (owner feedback `ui-character-panel-compact`): the in-run panel
  // dropped its owned-but-unequipped stash list along with the mid-run swap
  // UI it existed to feed — equipment is read-only in-run now, so an owned
  // item that is not equipped has nothing to show here any more.
  it('an owned-but-unequipped item no longer appears in the (now read-only) in-run panel', () => {
    const w = worldWith(['greatsword']);
    w.ownedEquipment['swordsman_armor'] = 1;
    const html = characterPanelMarkup(characterPanelData(w), w);
    expect(html).not.toContain('Circle Slash charging speed scales with attack speed');
  });

  it('an empty slot carries no tooltip markup', () => {
    const w = worldWith([]);
    const html = characterPanelMarkup(characterPanelData(w), w);
    // No equipment owned or equipped at all -> "No equipment owned yet." branch, no .sw-eq-tip anywhere.
    expect(html).not.toContain('sw-eq-tip');
  });
});

describe('fb028: the Codex — classes and equipment rows expand to full live-formatted effect text', () => {
  function mount(): HTMLElement {
    document.body.innerHTML = '<div id="app"></div>';
    return document.getElementById('app') as HTMLElement;
  }

  it('a classes row click renders the exact classAbilitiesMarkup text for that class', () => {
    const root = mount();
    const collections = buildCodexCollections(content);
    const handle = mountCodex(root, collections);
    handle.select('classes');

    const swordsmanCls = content.classByKey.get('swordsman')!;
    const rows = root.querySelectorAll('.sw-codex-content tbody tr');
    const idx = content.classes.classes.findIndex((c) => c.key === 'swordsman');
    (rows[idx] as HTMLElement).click();

    const detail = root.querySelector('.sw-codex-detail')!;
    expect(detail.innerHTML).toBe(classAbilitiesMarkup(swordsmanCls));
    expect(rows[idx].classList.contains('active')).toBe(true);
  });

  it('an equipment row click renders both class-named conditional branches for a multi-conditional item', () => {
    const root = mount();
    const collections = buildCodexCollections(content);
    const handle = mountCodex(root, collections);
    handle.select('equipment');

    const rows = root.querySelectorAll('.sw-codex-content tbody tr');
    const idx = content.equipment.items.findIndex((i) => i.key === 'swordsman_armor');
    (rows[idx] as HTMLElement).click();

    const detail = root.querySelector('.sw-codex-detail')!;
    expect(detail.innerHTML).toBe(equipmentCodexDetailMarkup(content, swordsmanArmor));
    expect(detail.innerHTML).toContain('If Swordsman');
    expect(detail.innerHTML).toContain('If not Swordsman');
    // qa-playtester (fb028): the Codex has no live run to pick one note via ctx.equippedKeys, so
    // both effectNoteWith branches (this item's whole "multi-conditional" reason for being the
    // acceptance criterion's proof item) must be visible, not just the base effectNote.
    expect(detail.innerHTML).toContain('Sleeve Sword');
    expect(detail.innerHTML).toContain('boosted by attack speed instead of charge rate');
  });

  it('a collection with no renderDetail (e.g. towers) leaves rows unclickable and adds no detail panel', () => {
    const root = mount();
    const collections = buildCodexCollections(content);
    const handle = mountCodex(root, collections);
    handle.select('towers');

    expect(root.querySelector('.sw-codex-detail')).toBeNull();
    const rows = root.querySelectorAll('.sw-codex-content tbody tr');
    for (const tr of Array.from(rows)) expect(tr.classList.contains('sw-codex-row-clickable')).toBe(false);
  });
});

/**
 * fb052 (qa-playtester finding): before this regression test, `hub.ts`'s
 * Equipment/Stash tab built its `EquipmentEffectContext` with no
 * `equippedKeys` at all, unlike `hud.ts`'s `runEquipmentContext` — so
 * `equipmentSpecialNoteMarkup`'s cross-item line could never read (active)
 * there, no matter what the player's real Hub loadout had equipped. Drives
 * the real Hub DOM (same `openHub` pattern as `tests/hub-testing.test.ts`)
 * rather than calling `equipmentSpecialNoteMarkup` directly, since the bug
 * was specifically in how `hub.ts` builds its call-site context.
 */
describe('fb052: the Hub Stash tab reads the real equipped-item state, not just class', () => {
  it('marks the cross-item damage-boost line (active) once both items are actually equipped in the Hub loadout', () => {
    const meta = seedTestEquipment({ ...defaultMeta(), unlockedClasses: ['swordsman'] });
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app') as HTMLElement;
    const hub = new Hub(root, meta, 1, {
      settings: defaultSettings(),
      onSettingsChanged: () => {},
      onStart: () => {},
      onMetaChanged: () => {},
    });
    hub.show();
    hub.openTab('equipment');

    (root.querySelector('[data-item="swordsman_armor"]') as HTMLButtonElement).click(); // equips it (armor slot)
    (root.querySelector('[data-item="sleeve_sword"]') as HTMLButtonElement).click(); // equips it too (weapon slot)
    // Right-click re-selects Swordsman Armor for the detail panel without unequipping it
    // (a plain left-click on an already-equipped item unequips it instead).
    root.querySelector('[data-item="swordsman_armor"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    const detail = root.querySelector('.sw-itemdetail')!;
    expect(detail.innerHTML).toContain('charging speed scales with attack speed');
    expect(detail.innerHTML).toContain('boosted by attack speed instead of charge rate');
    const baseIdx = detail.innerHTML.indexOf('charging speed scales with attack speed');
    const crossIdx = detail.innerHTML.indexOf('boosted by attack speed instead of charge rate');
    expect(detail.innerHTML.slice(baseIdx, baseIdx + 200)).toContain('(inert)');
    expect(detail.innerHTML.slice(crossIdx, crossIdx + 200)).toContain('(active)');
  });
});
