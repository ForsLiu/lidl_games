/**
 * SPEC-FINAL §7 equipment (fb015): runtime helpers shared by the handful of
 * sites whose behavior cannot be expressed as a generic `Stats` contribution
 * (`baseRunStats`, stats.ts, folds every item's `mods`/`classFallback` — this
 * file is only for the three `effectKey`s that are not stat-shaped: Sleeve
 * Sword's no-charge Circle Slash, Swordsman Armor's charge-speed/cross-item
 * rule and Swordsman Shoes' doubled Dash Slash distance, all in classes.ts,
 * the only importer today). The other three effect-adjacent sites
 * (enemies.ts, towers.ts, vswield.ts) need no per-item dispatch at all — they
 * read the generic `w.derived.bleedLifesteal`/`towerAtkFlat`/`charRangeMul`
 * fields `Stats`/`derive` already fold every equipped item's `mods` into.
 *
 * Only a type import of `World`, so a future importer beside classes.ts can
 * still pull `hasEquipment` in without a runtime import cycle.
 */

import type { World } from './world';

/** Whether the run's loadout includes `key` (a `data/equipment.json` item). */
export function hasEquipment(w: World, key: string): boolean {
  return (w.cfg.equipment ?? []).includes(key);
}
