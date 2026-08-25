/**
 * Stash operations: equipping and discarding stored relics.
 *
 * Extracted from `crafting.ts` when SPEC-V3 §8 deleted the crafting currency.
 * Crafting went with it; equip/discard are stash mechanics V3 explicitly keeps
 * ("Keep relic/equipment persistence and the stash"), so they live here instead.
 *
 * M24 grows this module into V3 §7's six-slot equipment model.
 */

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
