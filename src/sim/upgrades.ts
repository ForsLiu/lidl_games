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
export function maxLevel(def: Pick<TowerDef, 'upgrades'>): number {
  return def.upgrades.count + 1;
}

/**
 * The stat multiplier a tower of this type carries at `level`.
 *
 * §4: "+10% HP, Attack, Defense **unless** a milestone special is listed". The
 * "unless" is honoured — a step that carries a special pays out the special
 * instead of the stat bump — and it is honoured through a `/data` flag
 * (`milestoneStepsSkipStats`) rather than a hard-coded reading, because the
 * sentence supports the other one too and the owner has not ruled (Q73). Since
 * m20b authored §4's specials the flag is live: Arrow's steps 3-5, Electric's
 * 3 and Poison's 2 and 4 buy their special instead of +10%, so an Arrow at
 * level 6 carries `upgradeStepMul ^ 2`, not `^ 5`.
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

/**
 * What a tower of this type actually fires at `level`, once SPEC-V3 §4's
 * milestone specials up to that level have been folded into its authored
 * attack. Pure in `def` and `level` — no World — so the renderer, the info
 * panel and m21's VS formula all read the same answer the fire loop does.
 *
 * Every field is the *effective* one, never the authored one: a reader that
 * has to remember to add the specials itself is the m20a trap again (a stale
 * reader of a field whose range moved).
 */
export interface AttackProfile {
  /** Enemies the shot carries on through beyond the first. */
  pierce: number;
  /** Shots per attack. §4 gives Arrow a second at 5, Poison a second at 2. */
  projectiles: number;
  /** §3's composite split, or null for an attack that is all Normal. */
  ratio: Readonly<Record<string, number>> | null;
  /** §3 types/statuses every hit also applies, authored plus milestone. */
  onHit: readonly string[];
  /** §4 Electric @3: the electric portion arcs to the nearest other enemy. */
  electricChain: boolean;
  /** §5.2 Fire Brazier @4: the cone's half-angle multiplier ("+50%" → 1.5). */
  coneWidthMul: number;
  /**
   * §5.2 Fire Brazier: how many times this attack's authored `burn` counts per
   * hit — 0 for an attack with no `burn` at all, 1 for one that has it
   * unmilestoned. Read as a dps multiplier by `fireTower`'s cone case, not as
   * literal extra Burning stacks: Burning's own row caps at 1 stack today
   * (`refresh: 'strongest'`), and raising that cap is p10a's job, not a
   * milestone's — a stack count here would fold into the same one slot and
   * measure as a no-op (Q112).
   */
  burnStacks: number;
  /**
   * Seconds this tower's own `slow` lasts — already resolved against the
   * authored `slowDuration` (1 where neither says anything), so a milestone
   * that repeats the base number reads as no change (gate G20). §5.2 Frost
   * Obelisk @3: "frost from this tower lasts 5s" replaces it.
   */
  slowDuration: number;
  /** §5.2 Mortar @3: the shell leaves a ground-fire patch where it lands. */
  groundBurn: boolean;
  /** Seconds the patch above burns for — meaningful only when `groundBurn` is true. */
  groundBurnSeconds: number;
}

const NO_ON_HIT: readonly string[] = [];

export function attackProfile(def: Pick<TowerDef, 'attack' | 'upgrades'>, level: number): AttackProfile {
  const a = def.attack;
  const prof: AttackProfile = {
    pierce: a?.pierce ?? 0,
    projectiles: a?.projectiles ?? 1,
    ratio: a?.damageRatio ?? null,
    onHit: a?.onHit ?? NO_ON_HIT,
    electricChain: false,
    coneWidthMul: 1,
    burnStacks: a?.burn ? 1 : 0,
    slowDuration: a?.slowDuration ?? 1,
    groundBurn: false,
    groundBurnSeconds: 0,
  };
  const steps = Math.max(0, Math.min(level, maxLevel(def)) - 1);
  for (const sp of def.upgrades.specials) {
    if (sp.at > steps) continue;
    switch (sp.key) {
      case 'pierce':
        prof.pierce += sp.value!;
        break;
      case 'projectiles':
        prof.projectiles += sp.value!;
        break;
      case 'onHit':
        prof.onHit = [...prof.onHit, sp.type!];
        break;
      case 'damageRatio':
        prof.ratio = sp.ratio!;
        break;
      case 'electricChain':
        prof.electricChain = true;
        break;
      case 'coneWidth':
        prof.coneWidthMul = sp.mul!;
        break;
      case 'burnStacks':
        prof.burnStacks += sp.value!;
        break;
      case 'slowDuration':
        prof.slowDuration = sp.seconds!;
        break;
      case 'burnPatch':
        prof.groundBurn = true;
        prof.groundBurnSeconds = sp.seconds!;
        break;
    }
  }
  return prof;
}

/** The share of one attack's damage that lands as `type`, 0 if none does. */
export function damageShare(ratio: Readonly<Record<string, number>> | null, type: string): number {
  if (!ratio) return type === 'normal' ? 1 : 0;
  let total = 0;
  for (const k of Object.keys(ratio).sort()) total += ratio[k];
  return total > 0 ? (ratio[type] ?? 0) / total : 0;
}

/** Max HP for a tower of this type at `level`, walls' `wallHpMul` included. */
export function structureMaxHp(w: World, def: TowerDef, level: number): number {
  const hpMul = def.key === 'palisade' ? w.derived.wallHpMul : 1;
  // §4.2's Engineer/Paladin tower passives ("all towers +10% HP") apply to
  // every structure, walls included, so they multiply on top of `wallHpMul`
  // rather than replacing it (p6d).
  return def.hp * hpMul * upgradeStatMul(w, def, level) * w.derived.towerHpMul;
}

/**
 * SPEC-V3 §4 defense, read as armour points through m19a's curve — the same
 * scale the Warden and enemies use, so `damageStructure` needs no second rule.
 */
export function structureArmor(w: World, s: Structure): number {
  const def = w.content.towerById.get(s.towerId)!;
  // §4.2 Paladin's "+5 defense" is a flat point bonus in the same units the
  // band table authors, so it adds after the track multiplier rather than
  // being scaled by it (p6d).
  return def.defense * upgradeStatMul(w, def, s.tier) + w.derived.towerDefenseBonus;
}

/**
 * SPEC-V3 §4: sell refunds 50% of **total spent** — which is why `Structure`
 * records what it was actually charged instead of this recomputing the track.
 * A recompute is wrong the moment `towerCostMul` moves mid-run (an `equip_item`
 * slot swap, a boon): the player would be refunded against today's prices for
 * gold they paid at yesterday's.
 */
export function sellValue(w: World, s: Structure): number {
  return Math.round(s.spent * w.content.towers.sellRefund);
}
