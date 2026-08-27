/**
 * Stat aggregation. Everything that can modify the Warden funnels through here:
 * class trait, Constellation nodes, relics, boons and petrified-terrain passives.
 *
 * SPEC-V3 §2: "all boosts from different sources multiply (10% + 20% atk speed →
 * ×1.1×1.2). Same-source ranks add within the source, then multiply out."
 *
 * So a contribution is no longer a bare number — it carries the *source* that
 * granted it. `Stats` groups by (stat, source): ranks from one source are summed,
 * and the sums are multiplied across sources. Percentages are still stored as
 * fractions (0.08 = +8%).
 *
 * A stat is `mul` when its derived form is a multiplier on some base value, and
 * `flat` when it is a point total with no base to scale (armour points, dash
 * charges, tesla links). Only `mul` stats multiply — multiplying "+1 dash charge"
 * by "+1 dash charge" is meaningless. `STAT_KIND` below is exhaustive by type, so
 * a new stat cannot be added without classifying it.
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
  'towerAttackSpeed',
  'towerPoisonDamage',
  'towerHp',
  'towerDefenseBonus',
  'coreHp',
  'buildRange',
  'wallHp',
  'goldPerKill',
  'sproutGold',
  'residualPotency',
  'beaconRadius',
  'teslaLinks',
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

/** See the file header. `mul` stats multiply across sources; `flat` ones add. */
export type StatKind = 'flat' | 'mul';

/**
 * Exhaustive by construction: `Record<StatKey, StatKind>` means adding a stat
 * without deciding how it stacks is a compile error, not a silent `flat`.
 */
export const STAT_KIND: Record<StatKey, StatKind> = {
  // Multipliers on a base the sim already has.
  power: 'mul',
  attackSpeed: 'mul',
  area: 'mul',
  moveSpeedPct: 'mul',
  maxHpPct: 'mul',
  pickupPct: 'mul',
  goldFind: 'mul',
  emberFind: 'mul',
  relicFind: 'mul',
  ailmentPotency: 'mul',
  towerCost: 'mul',
  towerDamage: 'mul',
  towerRange: 'mul',
  towerAttackSpeed: 'mul',
  towerPoisonDamage: 'mul',
  towerHp: 'mul',
  wallHp: 'mul',
  sproutGold: 'mul',
  residualPotency: 'mul',
  modRewardBonus: 'mul',
  burnDamage: 'mul',
  slowPotency: 'mul',
  chilledDamageTaken: 'mul',
  xpGain: 'mul',

  // Point totals. There is no base for these to scale, so they add.
  maxHp: 'flat',
  armor: 'flat',
  hpRegen: 'flat',
  coreHp: 'flat',
  // Armour points on a structure, the same base-less point total `armor` is for
  // the Warden — see `structureArmor` (upgrades.ts).
  towerDefenseBonus: 'flat',
  buildRange: 'flat',
  goldPerKill: 'flat',
  beaconRadius: 'flat',
  teslaLinks: 'flat',
  dashCharges: 'flat',
  burnSpread: 'flat',
  leech: 'flat',
  // Rates and flags, not boosts: leech and luck are read raw, secondWind and
  // lastStandSundering are booleans in disguise.
  luck: 'flat',
  secondWind: 'flat',
  lastStandSundering: 'flat',
  // A reduction with its own cap (`cdrCap`), not a multiplier on a base. V3 §2's
  // rule is about boosts; see QUESTIONS Q62.
  //
  // `towerCost` is also a capped reduction yet is `mul`, so the line between them
  // is worth stating: `towerCost` scales a base the sim has (a tower's authored
  // price), and its clamp is a floor on the *product*. `cdr` has no base — it is
  // subtracted from each cooldown as a fraction, and `cdrCap` caps the fraction
  // itself, so a product would be capped before it ever reached a base. Flagged
  // in Q62 as the most arguable row for the M27 re-baseline.
  cdr: 'flat',
};

/**
 * Where a contribution came from. Two contributions share a source id exactly
 * when V3 §2 would call them "ranks of the same source": every rank of one boon,
 * every point of one Constellation node, both affixes of one relic.
 */
export type StatSource = string;

export class Stats {
  /** stat -> source -> summed contribution from that source. */
  private readonly bySource = new Map<StatKey, Map<StatSource, number>>();

  add(source: StatSource, stat: StatKey, value: number): void {
    // NaN/Infinity are dropped rather than stored, on m19a's precedent: a NaN
    // that reaches `derive()` survives `Math.max` (`Math.max(0.25, NaN)` is NaN)
    // and spreads to maxHp, moveSpeed and pickupRadius at once. zod keeps them
    // out of `/data`, so this is the guard for everything else.
    if (!Number.isFinite(value)) return;
    // A zero contribution is not recorded: it is ×1.0 and +0 exactly, so it is
    // unobservable through `factor()`/`total()` and would only add noise to
    // `contributions()`. Pinned by a test so the asymmetry is deliberate — a
    // source that later sums *back* to zero does keep its entry.
    if (value === 0) return;
    let m = this.bySource.get(stat);
    if (!m) {
      m = new Map();
      this.bySource.set(stat, m);
    }
    m.set(source, (m.get(source) ?? 0) + value);
  }

  /** Bulk-add a `{stat: value}` record, ignoring keys that are not stats. */
  addAll(source: StatSource, src: Record<string, number>): void {
    for (const key of Object.keys(src)) {
      if ((STAT_KEYS as readonly string[]).includes(key)) {
        this.add(source, key as StatKey, src[key]);
      }
    }
  }

  /**
   * Additive total across every source. The correct read for a `flat` stat, and
   * what the UI shows for a `mul` one ("+30% power" reads better than "×1.32"
   * when listing what a node granted).
   *
   * Sorted for the same reason `factor()` is: float *addition* is no more
   * associative than multiplication, and `leech` reaches six tree nodes at
   * 0.003 plus a boon and a relic affix, whose sum is 0.0417 or
   * 0.04170000000000001 depending on the order they went in. That feeds
   * `warden.hp`, which `hashWorld` hashes.
   */
  total(stat: StatKey): number {
    const m = this.bySource.get(stat);
    if (!m) return 0;
    let sum = 0;
    for (const k of [...m.keys()].sort()) sum += m.get(k) as number;
    return sum;
  }

  /**
   * V3 §2's product: Π over sources of (1 + that source's summed ranks).
   *
   * Sources are multiplied in sorted key order rather than insertion order.
   * Float multiplication is not associative, so an unsorted product would let
   * two runs that added the same sources in a different order end on different
   * bits — and gate A11 hashes the result.
   */
  factor(stat: StatKey): number {
    const m = this.bySource.get(stat);
    if (!m || m.size === 0) return 1;
    const keys = [...m.keys()].sort();
    let f = 1;
    for (const k of keys) f *= 1 + (m.get(k) as number);
    return f;
  }

  /** Every (source, summed value) pair for a stat, sorted. For UI and tests. */
  contributions(stat: StatKey): [StatSource, number][] {
    const m = this.bySource.get(stat);
    if (!m) return [];
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }
}

export function emptyStats(): Stats {
  return new Stats();
}

/**
 * Stats that are fixed for the whole run: class + tree + relics.
 *
 * Source granularity (QUESTIONS Q61): one class, **one Constellation node**, one
 * relic. Each node is its own origin, so two +4% power nodes multiply — which is
 * what V3 §2 says about "different sources" and is the reading that makes the
 * tree's branches feel different from one long additive column.
 */
export function baseRunStats(content: Content, cfg: RunConfig): Stats {
  const s = emptyStats();

  const cls = content.classByKey.get(cfg.classKey);
  if (cls) {
    if (cls.legacy) {
      s.addAll(`class:${cfg.classKey}`, cls.mods);
    } else {
      // SPEC-FINAL §4, p6a: Passive and Tower passive are each their own
      // generic stat source, folded in the same `addAll` legacy `mods` used —
      // an unknown key (a non-stat-shaped passive) is silently ignored here,
      // exactly the precedent `addAll`'s own doc comment already sets, and
      // gets bespoke engine code from whichever item authors that kit.
      s.addAll(`class:${cfg.classKey}:passive`, cls.passive.mods);
      s.addAll(`class:${cfg.classKey}:towerPassive`, cls.towerPassive.mods);
      if (cls.moveSpeedBonus) s.add(`class:${cfg.classKey}:bands`, 'moveSpeedPct', cls.moveSpeedBonus);
    }
  }

  for (const id of cfg.allocated) {
    const node = content.treeById.get(id);
    if (node) s.addAll(`tree:${id}`, node.stats);
  }

  // A relic is one source: its implicit and its affixes are ranks of that item.
  for (const r of cfg.relics) s.addAll(`relic:${r.id}`, relicStats(content, r));

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
  /**
   * Renamed from `goldFind`/`emberFind`/`relicFind` at m19b: they are now the
   * finished multiplier, not the fraction the caller had to add 1 to. The rename
   * is deliberate — a `mul` stat whose consumers still write `1 + x` would
   * silently apply V3 §2's product on top of an additive `+1`.
   */
  goldFindMul: number;
  emberFindMul: number;
  relicFindMul: number;
  ailmentMul: number;
  towerCostMul: number;
  towerDamageMul: number;
  towerRangeMul: number;
  /**
   * Unlike `towerDamageMul`/`towerRangeMul` (Act I only — `vswield.ts` reads
   * neither on purpose), Wind Slash (p6b, §4.1) is textually "effective in
   * VS", so this one also multiplies `updateWieldedAttacks`'s cooldown speed
   * (Q118) — the one deliberate exception to that file's own "stays Act I's" rule.
   */
  towerAttackSpeedMul: number;
  /**
   * §4.1 Plaguebringer tower passive (p6c, Q119): "all towers +10% poison
   * damage" — unlike Wind Slash, §4.1 does not say "effective in VS" for
   * this one, so it stays Act I's, the same default `towerDamageMul`/
   * `towerRangeMul` already have. Read only for a poison DoT whose `source`
   * resolves to a real tower key while `!w.huntsWarden` (`dotPotency`,
   * enemies.ts) — the Poison tower's own Act I attack, not Poison Barrel
   * (a class Active applying the same damage type from a non-tower source)
   * and not the Poison tower's own VS poison-trail special (a tower effect,
   * but one that only ever fires once `huntsWarden` is true).
   */
  towerPoisonDamageMul: number;
  /**
   * §4.2 Engineer ("all towers +10% HP") / Paladin ("+10% HP and +5 defense")
   * tower passives, p6d. Both ride `structureMaxHp`/`structureArmor`
   * (upgrades.ts) so every reader of a structure's toughness — the fire loop,
   * `damageStructure`, and §10's breach pricing — sees one number.
   */
  towerHpMul: number;
  towerDefenseBonus: number;
  buildRange: number;
  wallHpMul: number;
  goldPerKill: number;
  sproutMul: number;
  residualMul: number;
  modRewardBonusMul: number;
  beaconRadiusBonus: number;
  teslaLinkBonus: number;
  dashCharges: number;
  leech: number;
  secondWind: boolean;
  burnDamageMul: number;
  /**
   * SPEC-V3 §3 gave this stat its first reader: Burning's damage and shred are
   * AoE around the victim, and `burnSpread` is a point bonus on that radius.
   * Until m19c it was authored on the Pyromancer and read by nothing.
   */
  burnSpread: number;
  slowPotencyMul: number;
  /** Hoisted out of `Stats` at m19b: `damageEnemy` reads it per hit. */
  chilledDamageTakenMul: number;
  xpMul: number;
}

export function derive(content: Content, s: Stats, residualScale = 1): Derived {
  const maxHp = Math.max(1, (BASE.maxHp + s.total('maxHp')) * s.factor('maxHpPct'));
  const armor = BASE.armor + s.total('armor');
  return {
    maxHp,
    hpRegen: BASE.hpRegen + s.total('hpRegen'),
    armor,
    moveSpeed: BASE.moveSpeed * s.factor('moveSpeedPct'),
    powerMul: s.factor('power'),
    attackSpeedMul: s.factor('attackSpeed'),
    areaMul: s.factor('area'),
    cdr: Math.min(BASE.cdrCap, s.total('cdr')),
    pickupRadius: Math.max(0.25, BASE.pickupRadius * s.factor('pickupPct')),
    luck: s.total('luck'),
    goldFindMul: s.factor('goldFind'),
    emberFindMul: s.factor('emberFind'),
    relicFindMul: s.factor('relicFind'),
    ailmentMul: s.factor('ailmentPotency'),
    towerCostMul: Math.max(0.25, s.factor('towerCost')),
    towerDamageMul: s.factor('towerDamage'),
    towerRangeMul: s.factor('towerRange'),
    towerAttackSpeedMul: s.factor('towerAttackSpeed'),
    towerPoisonDamageMul: s.factor('towerPoisonDamage'),
    towerHpMul: s.factor('towerHp'),
    towerDefenseBonus: s.total('towerDefenseBonus'),
    buildRange: content.towers.buildRange + s.total('buildRange'),
    wallHpMul: s.factor('wallHp'),
    goldPerKill: s.total('goldPerKill'),
    sproutMul: s.factor('sproutGold'),
    residualMul: Math.max(0, s.factor('residualPotency') * residualScale),
    modRewardBonusMul: s.factor('modRewardBonus'),
    beaconRadiusBonus: s.total('beaconRadius'),
    teslaLinkBonus: s.total('teslaLinks'),
    dashCharges: 1 + s.total('dashCharges'),
    leech: s.total('leech'),
    secondWind: s.total('secondWind') > 0,
    burnDamageMul: s.factor('burnDamage'),
    burnSpread: s.total('burnSpread'),
    slowPotencyMul: s.factor('slowPotency'),
    chilledDamageTakenMul: s.factor('chilledDamageTaken'),
    xpMul: s.factor('xpGain'),
  };
}
