/**
 * SPEC-FINAL §5.5: a Core's real TD/VS numbers (`p-core-b` — Stone Heart in
 * full, Vampire Heart in full, Time's steps 1-2; Carnivorous Plant, Corpse and
 * Time's steps 3-5 are `p-core-c` through `p-core-e`'s job).
 *
 * `p-core-a` shipped selection/hashing/loader-validation only — no Core wrote
 * to `w.stats`/`w.derived` and nothing read `content.coreByKey`'s `effects`/
 * `upgrade.steps` (both new here). This module is where a Core's numbers
 * become gameplay: `computeCoreState` folds a Core's always-on `effects` row
 * plus every upgrade step bought so far into one `CoreState`, the same shape
 * `derive()` (stats.ts) gives `Stats` — a pure function of (core key, steps
 * bought), recomputed on every purchase rather than accumulated, so buying
 * step 2 can never double-count step 1's own contribution.
 *
 * Two Core effects for other cores in this run (Vampire Heart's VS lifesteal,
 * Time's step-2 character HP regen) instead route through the *existing*
 * `Stats`/`Derived` pipeline (`w.stats.add` + `w.recomputeDerived()`, the same
 * call a boon or a Constellation node makes) rather than `CoreState`, because
 * `leech`/`hpRegen` are already generic stats every other system reads —
 * duplicating a second read path for them would only invite the two falling
 * out of sync.
 */

import type { Content, CoreDef } from './content';
import { CORE_H, CORE_W, CORE_X, CORE_Y } from './grid';
import { clamp, dist2 } from './math';
import type { Structure } from './types';
import type { World } from './world';

export interface CoreState {
  /** Vampire Heart base 0.001, +0.002 at step 3 (0.003 total). TD only (towers fire). */
  towerLifestealPct: number;
  /** Vampire Heart: damage/attack-speed buff fraction per 1 missing HP point. */
  missingHpBuffPerPct: number;
  /** Vampire Heart: cap on the missing-HP buff (0.30). */
  missingHpBuffCap: number;
  /** Vampire Heart: character lifesteal fraction, folded into `Stats`' `leech` too — kept here so tests can read the authored number directly. */
  vsLifestealPct: number;
  /** Vampire Heart: HP-of-overheal per 1 gold. 0 = no conversion (not this Core, or no effect authored). */
  overhealGoldRatio: number;
  /** Vampire Heart step 1: whether a tower's own overheal also converts. */
  towerOverhealConverts: boolean;
  /** Time step 1: flat, unmultiplied gold per second. */
  goldPerSecond: number;
  /** Time step 2: flat HP/s regen for towers (character HP regen instead routes through `Stats`). */
  hpRegenPerSecond: number;
  /** Time step 2: multiplier on every heal the Warden/a tower receives. */
  healingReceivedMul: number;
  /** Time: TD aura radius (tiles) around the Core. */
  tdSlowRadius: number;
  /** Time: TD attack/move speed reduction inside `tdSlowRadius`. */
  tdSlowPct: number;
  /** Time: VS attack/move speed bonus for the character. */
  vsSpeedPct: number;
}

function emptyCoreState(): CoreState {
  return {
    towerLifestealPct: 0,
    missingHpBuffPerPct: 0,
    missingHpBuffCap: 0,
    vsLifestealPct: 0,
    overhealGoldRatio: 0,
    towerOverhealConverts: false,
    goldPerSecond: 0,
    hpRegenPerSecond: 0,
    healingReceivedMul: 1,
    tdSlowRadius: 0,
    tdSlowPct: 0,
    vsSpeedPct: 0,
  };
}

/** Steps already bought (index 0..coreStep-1), each a `{numericKey: value}` delta. */
function boughtSteps(def: CoreDef | undefined, coreStep: number): Record<string, number>[] {
  if (!def?.upgrade.steps) return [];
  return def.upgrade.steps.slice(0, coreStep);
}

/**
 * A Core's live numbers: the `effects` base row plus every step bought so far,
 * folded fresh each call — see the file header for why this is a pure fold
 * rather than an accumulator. `World.core` (`world.ts`) is this, recomputed by
 * `World.recomputeCore()` on every `upgradeCore` purchase.
 */
export function computeCoreState(content: Content, coreKey: string, coreStep: number): CoreState {
  const st = emptyCoreState();
  const def = content.coreByKey.get(coreKey);
  if (!def) return st;
  const eff = def.effects ?? {};
  st.towerLifestealPct = eff.towerLifestealPct ?? 0;
  st.missingHpBuffPerPct = eff.missingHpBuffPerPct ?? 0;
  st.missingHpBuffCap = eff.missingHpBuffCap ?? 0;
  st.vsLifestealPct = eff.vsLifestealPct ?? 0;
  st.overhealGoldRatio = eff.overhealGoldRatio ?? 0;
  st.tdSlowRadius = eff.tdSlowRadius ?? 0;
  st.tdSlowPct = eff.tdSlowPct ?? 0;
  st.vsSpeedPct = eff.vsSpeedPct ?? 0;

  for (const step of boughtSteps(def, coreStep)) {
    if (step.towerOverhealConverts) st.towerOverhealConverts = true;
    if (step.overhealGoldRatio !== undefined) st.overhealGoldRatio = step.overhealGoldRatio;
    if (step.towerLifestealBonus) st.towerLifestealPct += step.towerLifestealBonus;
    if (step.goldPerSecond) st.goldPerSecond += step.goldPerSecond;
    if (step.hpRegenPerSecond) st.hpRegenPerSecond += step.hpRegenPerSecond;
    if (step.healingReceivedPct) st.healingReceivedMul = 1 + step.healingReceivedPct;
  }
  return st;
}

/** Stone Heart (or any Core authoring `coreHpBonus` steps): total flat Core-HP granted by steps bought so far. */
export function coreHpBonus(content: Content, coreKey: string, coreStep: number): number {
  const def = content.coreByKey.get(coreKey);
  let bonus = 0;
  for (const step of boughtSteps(def, coreStep)) bonus += step.coreHpBonus ?? 0;
  return bonus;
}

/** §5.5: "bought by interacting at the Core (build-range rule)" — nearest point on its 2x2 footprint. */
export function inCoreBuildRange(w: World): boolean {
  const r = w.derived.buildRange;
  const cx = clamp(w.warden.x, CORE_X, CORE_X + CORE_W);
  const cy = clamp(w.warden.y, CORE_Y, CORE_Y + CORE_H);
  return dist2(w.warden.x, w.warden.y, cx, cy) <= r * r;
}

/**
 * Buys the next Core upgrade step, mirroring `upgradeTower` (`towers.ts`):
 * same TD-only phase gate and build-range rule, flat cost (§5.5 — no
 * `costMul`), never sellable so there is no reverse of this function.
 */
export function upgradeCore(w: World): boolean {
  if (w.phase !== 'act1_build' && w.phase !== 'act1_wave') return false;
  const def = w.content.coreByKey.get(w.coreKey);
  if (!def) return false;
  if (w.coreStep >= def.upgrade.count) return false;
  if (!inCoreBuildRange(w)) return false;
  const cost = def.upgrade.stepCost;
  if (w.gold < cost) return false;
  w.gold -= cost;
  w.goldSpent += cost;

  const stepIndex = w.coreStep;
  w.coreStep++;
  const stepData = def.upgrade.steps?.[stepIndex] ?? {};

  if (stepData.coreHpBonus) {
    // Damage taken carries across the upgrade, the same rule `upgradeTower`
    // applies to a Structure's HP — a wound is preserved, not healed away.
    const ratio = w.coreMaxHp > 0 ? w.coreHp / w.coreMaxHp : 1;
    w.coreMaxHp += stepData.coreHpBonus;
    w.coreHp = w.coreMaxHp * ratio;
  }
  if (stepData.hpRegenPerSecond) {
    // Character regen is generic `Stats`, not `CoreState` — see file header.
    w.stats.add(`core:${w.coreKey}:step${stepIndex}`, 'hpRegen', stepData.hpRegenPerSecond);
    w.recomputeDerived();
  }
  w.recomputeCore();
  return true;
}

/**
 * Routes a heal through Time's step-2 "+20% healing received" (if bought)
 * before applying it, and — for Vampire Heart specifically — converts any
 * overheal past `maxHp` to gold at `overhealGoldRatio`, discarding it exactly
 * as before otherwise. Shared by the Warden (`updateWarden`, run.ts) and by
 * tower healing (`updateTowers`/`updateCoreEffects`) so both read one rule.
 */
function applyHealing(w: World, amount: number, hp: number, maxHp: number, allowConversion: boolean): number {
  // QA (p-core-b): a non-finite `amount` would otherwise poison
  // `coreGoldAccumulator` permanently via `addCoreGold` (NaN/Infinity, once
  // in, never clears) — the same guard `Stats.add` already applies to every
  // other stat contribution, applied here too since this is the one other
  // place a bad number becomes permanent run state.
  if (!Number.isFinite(amount) || amount <= 0) return hp;
  const scaled = amount * w.core.healingReceivedMul;
  const newHp = hp + scaled;
  if (newHp <= maxHp) return newHp;
  const excess = newHp - maxHp;
  if (allowConversion && w.core.overhealGoldRatio > 0) addCoreGold(w, excess / w.core.overhealGoldRatio);
  return maxHp;
}

/** §5.5 Vampire Heart: "VS: character ... overhealing converts to gold at 20:1" — VS only, base effect, no step required. */
export function applyHealingToWarden(w: World, amount: number): void {
  w.warden.hp = applyHealing(w, amount, w.warden.hp, w.derived.maxHp, w.huntsWarden);
}

/** Vampire Heart TD tower lifesteal / Time step-2 tower regen, both routed through the same overheal rule. */
export function applyHealingToStructure(w: World, s: Structure, amount: number): void {
  s.hp = applyHealing(w, amount, s.hp, s.maxHp, w.core.towerOverhealConverts);
}

/**
 * SPEC-FINAL §5.5 Vampire Heart: "TD: all towers gain 0.1% lifesteal" — heals
 * the structure that dealt `dealt` damage by `towerLifestealPct` of it. Called
 * from every site that actually credits `Structure.damageDealt`: `fireTower`'s
 * synchronous kinds are wrapped by `updateTowers` (towers.ts), and `pierce`/
 * `lob`'s asynchronous landing is `combat.ts`'s `updateProjectiles`/`detonate`
 * — the same two-site split `p5d` already established for `damageDealt`
 * itself, so a tower whose damage lands a tick later than it fires still
 * lifesteals exactly once.
 */
export function applyTowerLifesteal(w: World, s: Structure, dealt: number): void {
  if (dealt > 0 && w.core.towerLifestealPct > 0) applyHealingToStructure(w, s, dealt * w.core.towerLifestealPct);
}

/** Fractional-gold accumulator so a sub-1-gold/tick trickle (Time step 1, overheal conversion) never rounds to nothing. */
function addCoreGold(w: World, amount: number): void {
  // Defense in depth alongside `applyHealing`'s own guard: this accumulator
  // is permanent run state, so a non-finite value must never enter it from
  // any caller, present or future.
  if (!Number.isFinite(amount) || amount <= 0) return;
  w.coreGoldAccumulator += amount;
  const whole = Math.floor(w.coreGoldAccumulator);
  if (whole > 0) {
    w.gold += whole;
    w.goldEarned += whole;
    w.coreGoldAccumulator -= whole;
  }
}

/**
 * Time step 1's flat gold/s (bypasses `goldFindMul` on purpose — §5.5 says
 * "unaffected by gold-gain bonuses") and step 2's tower HP regen. Called every
 * tick from every phase (`Run.step`), same as the Warden's own regen tick.
 */
export function updateCoreEffects(w: World, dt: number): void {
  const core = w.core;
  if (core.goldPerSecond > 0) addCoreGold(w, core.goldPerSecond * dt);
  if (core.hpRegenPerSecond > 0) {
    for (const s of w.structures) {
      if (s.dead || s.petrified || s.hp >= s.maxHp) continue;
      applyHealingToStructure(w, s, core.hpRegenPerSecond * dt);
    }
  }
}

/** Vampire Heart: "+0.5% damage and attack speed per 1% missing HP, cap +30%" — read by `towerDamage`/`attackSpeedFor` (towers.ts). */
export function vampireMissingHpBuffMul(w: World, s: Structure): number {
  if (w.core.missingHpBuffPerPct <= 0 || s.maxHp <= 0) return 1;
  const missingPct = Math.max(0, 1 - s.hp / s.maxHp) * 100;
  const buff = Math.min(w.core.missingHpBuffCap, missingPct * w.core.missingHpBuffPerPct);
  return 1 + buff;
}

/** Time: VS-only character attack-speed multiplier (updateWieldedAttacks, vswield.ts). */
export function coreAttackSpeedMul(w: World): number {
  return w.huntsWarden ? 1 + w.core.vsSpeedPct : 1;
}

/** Time: VS-only character move-speed multiplier (updateWarden, run.ts). */
export function coreMoveSpeedMul(w: World): number {
  return w.huntsWarden ? 1 + w.core.vsSpeedPct : 1;
}
