/**
 * SPEC-V3 §4 tower upgrade tracks: how far a tower can be upgraded, what a step
 * costs, and what a step is worth.
 *
 * Its own module because `enemies.ts` needs `structureArmor` to spend structure
 * HP and `towers.ts` already imports `enemies.ts` — putting the track math in
 * either one makes the pair circular. Everything here is a pure function of the
 * def plus the World's content and derived stats; nothing writes to the World.
 */

import type { TowerDef } from './content';
import type { Structure } from './types';
import type { World } from './world';

/**
 * SPEC-V3 §4: **flat** per step. V2 charged `0.75x` then `1.25x` base, so the
 * step index used to matter; it does not any more, and the parameter is gone
 * rather than ignored so no caller can believe it still does.
 */
export function upgradeCost(w: World, def: TowerDef): number {
  return Math.max(1, Math.round(def.upgrades.stepCost * w.derived.towerCostMul));
}

/** SPEC-V3 §4: level 1 is the built tower, so `count` steps reach `count + 1`. */
export function maxLevel(def: TowerDef): number {
  return def.upgrades.count + 1;
}

/**
 * The stat multiplier a tower of this type carries at `level`.
 *
 * §4: "+10% HP, Attack, Defense **unless** a milestone special is listed". The
 * "unless" is honoured — a step that carries a special pays out the special
 * instead of the stat bump — and it is honoured through a `/data` flag
 * (`milestoneStepsSkipStats`) rather than a hard-coded reading, because the
 * sentence supports the other one too and the owner has not ruled (Q73). No
 * tower authors a special until m20b, so today every step is a stat step and
 * the flag is measurably inert: `upgradeStepMul ^ (level - 1)` either way.
 */
export function upgradeStatMul(w: World, def: TowerDef, level: number): number {
  const t = w.content.towers;
  const steps = Math.max(0, Math.min(level, maxLevel(def)) - 1);
  let statSteps = steps;
  if (t.milestoneStepsSkipStats) {
    for (const sp of def.upgrades.specials) if (sp.at <= steps) statSteps--;
  }
  return Math.pow(t.upgradeStepMul, statSteps);
}

/** Max HP for a tower of this type at `level`, walls' `wallHpMul` included. */
export function structureMaxHp(w: World, def: TowerDef, level: number): number {
  const hpMul = def.key === 'palisade' ? w.derived.wallHpMul : 1;
  return def.hp * hpMul * upgradeStatMul(w, def, level);
}

/**
 * SPEC-V3 §4 defense, read as armour points through m19a's curve — the same
 * scale the Warden and enemies use, so `damageStructure` needs no second rule.
 */
export function structureArmor(w: World, s: Structure): number {
  const def = w.content.towerById.get(s.towerId)!;
  return def.defense * upgradeStatMul(w, def, s.tier);
}

/**
 * SPEC-V3 §4: sell refunds 50% of **total spent** — which is why `Structure`
 * records what it was actually charged instead of this recomputing the track.
 * A recompute is wrong the moment `towerCostMul` moves mid-run (a relic, a
 * Constellation node): the player would be refunded against today's prices for
 * gold they paid at yesterday's.
 */
export function sellValue(w: World, s: Structure): number {
  return Math.round(s.spent * w.content.towers.sellRefund);
}
