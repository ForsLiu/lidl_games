/**
 * Stash operations: equipping and discarding stored relics, and (fb015,
 * SPEC-FINAL §7) equipping the six-slot equipment table's items.
 *
 * Extracted from `crafting.ts` when SPEC-V3 §8 deleted the crafting currency.
 * Crafting went with it; equip/discard are stash mechanics V3 explicitly keeps
 * ("Keep relic/equipment persistence and the stash"), so they live here instead.
 */

import { loadContent } from '../sim/content';
import type { MetaState } from '../sim/types';

/** Equip a stashed relic into its slot, or clear the slot with `null`. */
export function equip(meta: MetaState, slot: string, relicId: number | null): MetaState {
  if (!(slot in meta.equipped)) return meta;
  if (relicId !== null) {
    const relic = meta.stash.find((r) => r.id === relicId);
    if (!relic || relic.slot !== slot) return meta;
  }
  return { ...meta, equipped: { ...meta.equipped, [slot]: relicId } };
}

/** Drop a relic from the stash, unequipping it first if needed. */
export function discard(meta: MetaState, relicId: number): MetaState {
  const equipped = { ...meta.equipped };
  for (const slot of Object.keys(equipped) as (keyof typeof equipped)[]) {
    if (equipped[slot] === relicId) equipped[slot] = null;
  }
  return { ...meta, equipped, stash: meta.stash.filter((r) => r.id !== relicId) };
}

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
