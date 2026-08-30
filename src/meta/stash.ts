/**
 * Stash operations: equipping (SPEC-FINAL §7) the six-slot equipment table's
 * items.
 *
 * Extracted from `crafting.ts` when SPEC-V3 §8 deleted the crafting currency.
 * Crafting went with it; equipping is a stash mechanic V3 explicitly keeps.
 * p7d retired the relic-equip half (`equip`/`discard`) along with the whole
 * affix/rarity system — equipment items are the stash's only persistence now.
 */

import { loadContent } from '../sim/content';
import type { MetaState } from '../sim/types';

/**
 * SPEC-FINAL §7, fb015: equip a `data/equipment.json` item key into its slot,
 * or clear the slot with `null`. Unlike a relic, an item is a fixed row owned
 * as a count (`equipmentStash[key]`), not a unique instance with an id — so
 * equipping never removes it from the stash, and there is nothing to discard.
 */
export function equipItem(meta: MetaState, slot: string, itemKey: string | null): MetaState {
  if (!(slot in meta.equippedEquipment)) return meta;
  if (itemKey !== null) {
    if (!(meta.equipmentStash[itemKey] > 0)) return meta;
    // code review, fb015: mirrors `equip`'s own `relic.slot !== slot` guard —
    // the only caller today (hub.ts) always passes the item's own slot, but
    // nothing else stopped a future caller from writing an item into a slot
    // it does not belong to, silently doubling its stat contribution if the
    // same item also sat correctly equipped elsewhere.
    const item = loadContent().equipmentByKey.get(itemKey);
    if (!item || item.slot !== slot) return meta;
  }
  return { ...meta, equippedEquipment: { ...meta.equippedEquipment, [slot]: itemKey } };
}
