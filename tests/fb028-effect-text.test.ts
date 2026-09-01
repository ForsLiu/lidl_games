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

describe('fb028: equipmentEffectMarkup — Swordsman Armor, the multi-conditional item', () => {
  it('shows the real w.derived.attackSpeedMul, marked active, for a Swordsman with no Sleeve Sword', () => {
    const w = worldWith(['swordsman_armor']);
    const mul = w.derived.attackSpeedMul;
    expect(mul).not.toBe(1); // the item's own +10% attack speed already moves it — a stale/guessed number would not track this
    const html = equipmentEffectMarkup(content, swordsmanArmor, {
      classKey: 'swordsman',
      attackSpeedMul: mul,
      equippedKeys: ['swordsman_armor'],
    });
    expect(html).toContain('Circle Slash charging speed scales with attack speed');
    expect(html).toContain(`×${Math.round(mul * 100) / 100}`);
    expect(html).toContain('(active)');
    expect(html).not.toContain('boosted by attack speed instead');
  });

  it('switches to the cross-item damage-boost note, with the same live number, once Sleeve Sword is also equipped', () => {
    const w = worldWith(['swordsman_armor', 'sleeve_sword']);
    const mul = w.derived.attackSpeedMul;
    const html = equipmentEffectMarkup(content, swordsmanArmor, {
      classKey: 'swordsman',
      attackSpeedMul: mul,
      equippedKeys: w.cfg.equipment,
    });
    expect(html).toContain('boosted by attack speed instead of charge rate');
    expect(html).toContain(`×${Math.round(mul * 100) / 100}`);
    expect(html).not.toContain('charging speed scales with attack speed');
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
    expect(equipmentSpecialNoteMarkup(sleeveSword, { classKey: 'swordsman' })).toContain('needs no charge');
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

describe('qa-playtester (fb028): the real sim gate — an item equipped mid-run from outside the starting loadout never actually enables its effectKey mechanic', () => {
  it('hasEquipment reads false for an item equipped mid-run that was absent from RunConfig.equipment, even though its Stats mods and slot are live', () => {
    const w = new World(cfg({ classKey: 'swordsman', equipment: ['sleeve_sword'], ownedEquipment: { swordsman_armor: 1, sleeve_sword: 1 } }));
    applyCommand(w, { k: 'equip_item', slot: 'armor', item: 'swordsman_armor' });
    expect(w.equippedEquipment.armor).toBe('swordsman_armor');
    expect(w.stats.contributions('attackSpeed')).toContainEqual(['equipment:swordsman_armor', 0.1]);
    // The real sim gate every effectKey mechanic reads (classes.ts) — false, because
    // swordsman_armor was never in the run's starting w.cfg.equipment.
    expect(hasEquipment(w, 'swordsman_armor')).toBe(false);
  });

  it('the in-run tooltip agrees with hasEquipment — (inert), not (active), for that same mid-run-equipped item', () => {
    // A starting loadout with neither swordsman_armor nor sleeve_sword, so resolvedNote picks the
    // base (not cross-item) note text and the only question under test is active-vs-inert.
    const w = new World(cfg({ classKey: 'swordsman', equipment: ['greatsword'], ownedEquipment: { swordsman_armor: 1 } }));
    applyCommand(w, { k: 'equip_item', slot: 'armor', item: 'swordsman_armor' });
    const html = characterPanelMarkup(characterPanelData(w), w);
    // The slot tooltip must show the item's real effectKey state — inert, matching hasEquipment.
    expect(html).toContain('Circle Slash charging speed scales with attack speed');
    expect(html).toContain('(inert)');
  });

  it('the reverse case still reads (active): an item in the starting loadout keeps its mechanic live all run, even after being unequipped from its slot mid-run', () => {
    const w = new World(cfg({ classKey: 'swordsman', equipment: ['swordsman_armor'] }));
    expect(w.equippedEquipment.armor).toBe('swordsman_armor'); // World seeds the slot map from cfg.equipment at construction
    applyCommand(w, { k: 'equip_item', slot: 'armor', item: null }); // unequip it from its slot mid-run
    expect(w.equippedEquipment.armor).toBeNull();
    // hasEquipment reads w.cfg.equipment (frozen at run start), not the now-empty slot.
    expect(hasEquipment(w, 'swordsman_armor')).toBe(true);
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

  it('an owned-but-unequipped item in the stash list also carries its full effect tooltip', () => {
    const w = worldWith(['greatsword']);
    w.ownedEquipment['swordsman_armor'] = 1;
    const html = characterPanelMarkup(characterPanelData(w), w);
    expect(html).toContain('Circle Slash charging speed scales with attack speed');
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
