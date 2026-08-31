/**
 * The `StatKey` taxonomy, split out from `stats.ts` so `content.ts` can
 * validate a `/data`-authored stat record against it (b013, E6) without a
 * cycle: `stats.ts` itself imports `wardenBase`/`Content` from `content.ts`,
 * so `content.ts` cannot import back from `stats.ts`. `stats.ts` re-exports
 * everything here unchanged, so every existing call site is untouched.
 */

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
  /** fb015 (§7): flat "Atk" column, added wherever `classAttackPowerMul` already scales a character hit — see `characterDamage` (classes.ts). */
  'atkFlat',
  /** fb015: Builder's Necklace's "all towers +1 flat attack" — added to a tower's base damage before `upgradeStatMul`/the VS wielding count bonus, so it is "boostable" by both. */
  'towerAtkFlat',
  /** fb015: Sniper Bracelet's "character ... range +10%" — `towerRange` already covers the tower half. */
  'charRange',
  /** fb015: Bleeding Ring's "lifesteal now also applies to Bleeding damage" — a boolean flag in stat form, the same `secondWind` precedent. */
  'bleedLifesteal',
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

/** See `stats.ts`'s header. `mul` stats multiply across sources; `flat` ones add. */
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
  charRange: 'mul',

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
  atkFlat: 'flat',
  towerAtkFlat: 'flat',
  bleedLifesteal: 'flat',
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
