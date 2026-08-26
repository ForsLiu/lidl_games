/**
 * Stat aggregation. Everything that can modify the Warden funnels through here:
 * class trait, Constellation nodes, relics, boons and petrified-terrain passives.
 *
 * Convention: `Stats` holds raw additive accumulators. Percentages are stored as
 * fractions (0.08 = +8%) and are additive with each other, matching the SPEC's
 * "+8% per rank" phrasing.
 */

import { wardenBase, type Content } from './content';
import { clamp } from './math';
import type { Relic, RunConfig } from './types';

/** The Warden's base stat sheet (SPEC 2.1). Tuning lives in data/warden.json. */
export const BASE = wardenBase;

export const STAT_KEYS = [
  'power',
  'attackSpeed',
  'area',
  'moveSpeedPct',
  'maxHp',
  'maxHpPct',
  'armor',
  'cdr',
  'pickupPct',
  'luck',
  'goldFind',
  'emberFind',
  'relicFind',
  'ailmentPotency',
  'towerCost',
  'towerDamage',
  'towerRange',
  'coreHp',
  'buildRange',
  'wallHp',
  'goldPerKill',
  'sproutGold',
  'residualPotency',
  'beaconRadius',
  'teslaLinks',
  'weaponSlots',
  'startWeaponLevel',
  'dashCharges',
  'hpRegen',
  'leech',
  'secondWind',
  'modRewardBonus',
  'lastStandSundering',
  'burnDamage',
  'burnSpread',
  'slowPotency',
  'chilledDamageTaken',
  'xpGain',
] as const;

export type StatKey = (typeof STAT_KEYS)[number];
export type Stats = Record<StatKey, number>;

export function emptyStats(): Stats {
  const s = {} as Stats;
  for (const k of STAT_KEYS) s[k] = 0;
  return s;
}

export function addStats(target: Stats, src: Record<string, number>, mul = 1): void {
  for (const key of Object.keys(src)) {
    if ((STAT_KEYS as readonly string[]).includes(key)) {
      target[key as StatKey] += src[key] * mul;
    }
  }
}

/** Stats that are fixed for the whole run: class + tree + relics. */
export function baseRunStats(content: Content, cfg: RunConfig): Stats {
  const s = emptyStats();

  const cls = content.classByKey.get(cfg.classKey);
  if (cls) addStats(s, cls.mods);

  for (const id of cfg.allocated) {
    const node = content.treeById.get(id);
    if (node) addStats(s, node.stats);
  }

  for (const r of cfg.relics) addStats(s, relicStats(content, r));

  return s;
}

export function relicStats(content: Content, relic: Relic): Record<string, number> {
  const out: Record<string, number> = {};
  const imp = content.relics.implicits[relic.slot];
  if (imp) out[imp.stat] = (out[imp.stat] ?? 0) + imp.value;
  for (const a of relic.affixes) out[a.stat] = (out[a.stat] ?? 0) + a.value;
  return out;
}

/**
 * SPEC-V3 §2: armor points *are* the percent reduction of normal damage.
 * Capped at +99 (99% off) and uncapped below zero — −90 armor is +90% damage
 * taken — save for QUESTIONS Q44's floor at −100, which keeps Burning's
 * stacking shred from making damage taken unbounded (it tops out at ×2).
 *
 * Replaces the old `armor / (armor + armorK)` curve, which had no
 * notion of negative armor and reached 99% only at 4950 points.
 */
export function effectiveArmor(armor: number): number {
  // NaN would otherwise pass straight through `clamp` and into HP, and an enemy
  // whose hp is NaN can never satisfy `hp <= 0` — an unkillable enemy. Not
  // reachable from data (zod rejects NaN) but one comparison is cheaper than
  // the bug. ±Infinity clamps correctly and is left alone.
  if (Number.isNaN(armor)) return 0;
  return clamp(armor, BASE.armorFloor, BASE.armorCap);
}

/** Fraction of normal damage removed. Negative armor returns a negative value. */
export function armorReduction(armor: number): number {
  return effectiveArmor(armor) / 100;
}

/** Multiplier on incoming normal damage: +99 armor → ×0.01, −90 → ×1.9. */
export function damageTakenMul(armor: number): number {
  return 1 - armorReduction(armor);
}

/** Cached per-frame view of the stat sheet. */
export interface Derived {
  maxHp: number;
  hpRegen: number;
  /**
   * Sheet armor before Burning shred. The number the damage path actually uses
   * is `wardenArmor(w)` in run.ts; there is deliberately no cached reduction
   * here, because a cached one would be shred-blind and would read as authoritative.
   */
  armor: number;
  moveSpeed: number;
  powerMul: number;
  attackSpeedMul: number;
  areaMul: number;
  cdr: number;
  pickupRadius: number;
  luck: number;
  goldFind: number;
  emberFind: number;
  relicFind: number;
  ailmentMul: number;
  towerCostMul: number;
  towerDamageMul: number;
  towerRangeMul: number;
  buildRange: number;
  wallHpMul: number;
  goldPerKill: number;
  sproutMul: number;
  residualMul: number;
  beaconRadiusBonus: number;
  teslaLinkBonus: number;
  weaponSlots: number;
  dashCharges: number;
  leech: number;
  secondWind: boolean;
  burnDamageMul: number;
  slowPotencyMul: number;
  xpMul: number;
}

export function derive(content: Content, s: Stats, residualScale = 1): Derived {
  const maxHp = Math.max(1, (BASE.maxHp + s.maxHp) * (1 + s.maxHpPct));
  const armor = BASE.armor + s.armor;
  return {
    maxHp,
    hpRegen: BASE.hpRegen + s.hpRegen,
    armor,
    moveSpeed: BASE.moveSpeed * (1 + s.moveSpeedPct),
    powerMul: 1 + s.power,
    attackSpeedMul: 1 + s.attackSpeed,
    areaMul: 1 + s.area,
    cdr: Math.min(BASE.cdrCap, s.cdr),
    pickupRadius: Math.max(0.25, BASE.pickupRadius * (1 + s.pickupPct)),
    luck: s.luck,
    goldFind: s.goldFind,
    emberFind: s.emberFind,
    relicFind: s.relicFind,
    ailmentMul: 1 + s.ailmentPotency,
    towerCostMul: Math.max(0.25, 1 + s.towerCost),
    towerDamageMul: 1 + s.towerDamage,
    towerRangeMul: 1 + s.towerRange,
    buildRange: content.towers.buildRange + s.buildRange,
    wallHpMul: 1 + s.wallHp,
    goldPerKill: s.goldPerKill,
    sproutMul: 1 + s.sproutGold,
    residualMul: Math.max(0, (1 + s.residualPotency) * residualScale),
    beaconRadiusBonus: s.beaconRadius,
    teslaLinkBonus: s.teslaLinks,
    weaponSlots: Math.max(1, content.weapons.slots + s.weaponSlots),
    dashCharges: 1 + s.dashCharges,
    leech: s.leech,
    secondWind: s.secondWind > 0,
    burnDamageMul: 1 + s.burnDamage,
    slowPotencyMul: 1 + s.slowPotency,
    xpMul: 1 + s.xpGain,
  };
}
