/**
 * SPEC-FINAL §7 equipment (fb015): runtime helpers shared by the handful of
 * sites whose behavior cannot be expressed as a generic `Stats` contribution
 * (`baseRunStats`, stats.ts, folds every item's `mods`/`classFallback` — this
 * file is only for the three `effectKey`s that are not stat-shaped: Sleeve
 * Sword's instant-max Circle Slash charge, Swordsman Armor's charge-speed/
 * cross-item rule and Swordsman Shoes' doubled Dash Slash distance, all in classes.ts,
 * the only importer today). The other three effect-adjacent sites
 * (enemies.ts, towers.ts, vswield.ts) need no per-item dispatch at all — they
 * read the generic `w.derived.bleedLifesteal`/`towerAtkFlat`/`charRangeMul`
 * fields `Stats`/`derive` already fold every equipped item's `mods` into.
 *
 * Only a type import of `World`, so a future importer beside classes.ts can
 * still pull `hasEquipment` in without a runtime import cycle.
 */

import type { World } from './world';

/**
 * Whether `key` (a `data/equipment.json` item) is equipped *right now* —
 * reads the live, swappable `w.equippedEquipment` map, not the frozen
 * starting loadout `w.cfg.equipment`. b076: this used to read `w.cfg.equipment`,
 * so a mid-run `equip_item` swap (`run.ts`'s `equipItemCommand`) correctly
 * flipped an item's `Stats` mods on/off but left every `effectKey` mechanic
 * gated here stuck on whatever was equipped at run start.
 */
export function hasEquipment(w: World, key: string): boolean {
  return Object.values(w.equippedEquipment).includes(key);
}

/**
 * fb085 (unblocking BACKLOG-CONTENT.md fb056's Ring of Contagion/Chronomail/
 * Bracer of Overlap, none of which reduce to a plain `Stats` mod): the
 * equipped item named `itemKey`'s own `effectNums[field]`, or `fallback` when
 * the item is not equipped or authors no such number. Gates by the item's own
 * `key` (`hasEquipment`'s own convention — `effectKey` is a validated
 * registry tag, not itself a runtime dispatch key, per its doc comment in
 * `content.ts`), so a hook reads exactly the row a player actually equipped.
 */
export function equipmentEffectNum(w: World, itemKey: string, field: string, fallback: number): number {
  if (!hasEquipment(w, itemKey)) return fallback;
  const item = w.content.equipmentByKey.get(itemKey);
  const v = item?.effectNums[field];
  return v ?? fallback;
}

/**
 * fb056 (SPEC-FINAL §7.1, owner feedback `feature-class-equipment-sets`):
 * whether a class-set item's own mechanic is live — equipped right now
 * (`hasEquipment`) **and** worn by the class its `classFallback.notClassKey`
 * names. The owner's rule for every set item is "works alone, and every
 * class-specific line has an 'if not <class>' basic-stat compensation", so
 * the mechanic and the fallback `Stats` source (`baseRunStats`/
 * `equipItemCommand`) are mutually exclusive by class — the exact inverse of
 * the gate the fallback is granted on, and the same gate `equipment-info.ts`'s
 * `specialActive` already marks a tooltip (active)/(inert) by. An item with no
 * `classFallback` has no class gate at all.
 */
export function classEquipmentActive(w: World, itemKey: string): boolean {
  // The cheap class check first: `hasEquipment` allocates (`Object.values`),
  // and some hooks sit on hot paths (`applyDot`'s Hourglass Scepter read).
  const fallback = w.content.equipmentByKey.get(itemKey)?.classFallback;
  if (fallback && fallback.notClassKey !== w.cfg.classKey) return false;
  return hasEquipment(w, itemKey);
}

/**
 * fb056: `equipmentEffectNum`, gated by `classEquipmentActive` instead of bare
 * `hasEquipment` — the item's own `effectNums[field]` while its mechanic is
 * live for this run's class, `fallback` otherwise (unequipped, worn by another
 * class, or no such field authored).
 */
export function classEquipmentNum(w: World, itemKey: string, field: string, fallback: number): number {
  if (!classEquipmentActive(w, itemKey)) return fallback;
  const v = w.content.equipmentByKey.get(itemKey)?.effectNums[field];
  return v ?? fallback;
}
