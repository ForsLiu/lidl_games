/**
 * SPEC-FINAL §6.1: VS tower-attack inheritance ("wielding"). In a VS wave the
 * character carries every built tower type's attack — one entry per type,
 * derived from the live board rather than authored separately. This module
 * is the formula only: p2b wires the result into character-scaled fire
 * (lifesteal, on-attack passives), p2c makes towers inert while VS runs.
 *
 * Owner formula, verbatim (§6.1): "the attack has the same attack speed,
 * special effects, and highest upgrade effect; the attack damage is the
 * average among that type (considering the different upgrade attack),
 * boosted by 10% for each tower of that type."
 */

import type { TowerDef } from './content';
import { attackProfile, type AttackProfile, upgradeStatMul } from './upgrades';
import type { Structure } from './types';
import type { World } from './world';

/** One tower type's inherited VS attack. */
export interface WieldedAttack {
  towerId: number;
  towerKey: string;
  /** How many built, living towers of this type feed the average. */
  count: number;
  /** §6.1: average per-tower damage across the group, +10% per tower of the type. */
  damage: number;
  /** "the same attack speed" — the type's authored interval; §4 upgrades never change it. */
  interval: number;
  /** "special effects, and highest upgrade effect" — the group's highest tier's profile. */
  profile: AttackProfile;
}

/**
 * §6.1's formula, one entry per built tower type that has an attack. Walls,
 * Beacon Totem and Harvest Sprout author no `attack` and so wield nothing —
 * they still stand as inert obstacles and contribute their §5 VS special
 * (p2c), which is a separate mechanism from wielding.
 */
export function wieldedAttacks(w: World): WieldedAttack[] {
  const groups = new Map<number, Structure[]>();
  for (const s of w.structures) {
    if (s.dead) continue;
    const def = w.content.towerById.get(s.towerId)!;
    if (!def.attack) continue;
    let g = groups.get(s.towerId);
    if (!g) groups.set(s.towerId, (g = []));
    g.push(s);
  }
  const out: WieldedAttack[] = [];
  for (const [towerId, group] of groups) {
    out.push(wieldOneType(w, w.content.towerById.get(towerId)!, group));
  }
  return out;
}

function wieldOneType(w: World, def: TowerDef, group: readonly Structure[]): WieldedAttack {
  const count = group.length;
  let sum = 0;
  let highestTier = 1;
  for (const s of group) {
    sum += def.attack!.damage * upgradeStatMul(w, def, s.tier);
    if (s.tier > highestTier) highestTier = s.tier;
  }
  return {
    towerId: def.id,
    towerKey: def.key,
    count,
    damage: (sum / count) * (1 + 0.1 * count),
    interval: def.attack!.interval,
    profile: attackProfile(def, highestTier),
  };
}
