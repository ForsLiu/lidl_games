/**
 * SPEC-FINAL §5.5: a Core's real TD/VS numbers (`p-core-b` gave Stone Heart in
 * full, Vampire Heart in full and Time's steps 1-2; `p-core-c` adds
 * Carnivorous Plant in full. Corpse and Time's steps 3-5 are `p-core-d` and
 * `p-core-e`'s job).
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
import { applyPoison, damageEnemy } from './enemies';
import { CORE_H, CORE_W, CORE_X, CORE_Y, coreCenter } from './grid';
import { clamp, dist2 } from './math';
import type { Enemy, Structure } from './types';
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
  /** Carnivorous Plant TD: devour range (tiles) around the Core. 0 = no devour. */
  devourRadius: number;
  /** Carnivorous Plant TD: seconds between devours. */
  devourCooldown: number;
  /** Carnivorous Plant TD: flat damage a devour deals to an elite (a non-elite is killed outright instead). */
  devourEliteDamage: number;
  /** Carnivorous Plant TD: flat Core HP healed per devour. */
  devourCoreHeal: number;
  /** Carnivorous Plant VS: seconds between poison-bullet volleys. 0 = no volley. */
  poisonVolleyInterval: number;
  /** Carnivorous Plant VS: Digestion stacks spent per bullet (one bullet per this many stacks). */
  poisonStacksPerBullet: number;
  /** Carnivorous Plant VS: perf cap on bullets fired per volley. */
  poisonVolleyCap: number;
  /** Carnivorous Plant VS: each bullet's flat normal-damage component (also the poison DoT's triggering amount). */
  poisonBulletDamage: number;
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
    devourRadius: 0,
    devourCooldown: 0,
    devourEliteDamage: 0,
    devourCoreHeal: 0,
    poisonVolleyInterval: 0,
    poisonStacksPerBullet: 0,
    poisonVolleyCap: 0,
    poisonBulletDamage: 0,
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
  st.devourRadius = eff.devourRadius ?? 0;
  st.devourCooldown = eff.devourCooldown ?? 0;
  st.devourEliteDamage = eff.devourEliteDamage ?? 0;
  st.devourCoreHeal = eff.devourCoreHeal ?? 0;
  st.poisonVolleyInterval = eff.poisonVolleyInterval ?? 0;
  st.poisonStacksPerBullet = eff.poisonStacksPerBullet ?? 0;
  st.poisonVolleyCap = eff.poisonVolleyCap ?? 0;
  st.poisonBulletDamage = eff.poisonBulletDamage ?? 0;

  for (const step of boughtSteps(def, coreStep)) {
    if (step.towerOverhealConverts) st.towerOverhealConverts = true;
    if (step.overhealGoldRatio !== undefined) st.overhealGoldRatio = step.overhealGoldRatio;
    if (step.towerLifestealBonus) st.towerLifestealPct += step.towerLifestealBonus;
    if (step.goldPerSecond) st.goldPerSecond += step.goldPerSecond;
    if (step.hpRegenPerSecond) st.hpRegenPerSecond += step.hpRegenPerSecond;
    if (step.healingReceivedPct) st.healingReceivedMul = 1 + step.healingReceivedPct;
    if (step.devourRangeBonus) st.devourRadius += step.devourRangeBonus;
    // Floored at 1s rather than let repeated steps race to zero/negative —
    // §5.5 gives four steps against an 8s base (4s at max), nowhere near the
    // floor; it exists only so a future re-author of this track can't produce
    // a devour that fires every tick.
    if (step.devourCooldownReduction) st.devourCooldown = Math.max(1, st.devourCooldown - step.devourCooldownReduction);
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

/**
 * §5.5 Carnivorous Plant. TD: devours the nearest enemy within `devourRadius`
 * of the Core every `devourCooldown` seconds — a non-elite is killed outright,
 * an elite instead takes `devourEliteDamage` flat — heals the Core
 * `devourCoreHeal` HP and adds one Digestion stack, which persists for the
 * whole run (`w.digestionStacks` never resets, TD or VS, mirroring
 * `w.coreStep`). VS: spits one poison bullet per `poisonStacksPerBullet`
 * Digestion stacks (perf-capped at `poisonVolleyCap`) every
 * `poisonVolleyInterval` seconds at the nearest enemies to the Core.
 *
 * Gated on the `CoreState` numbers themselves (`devourCooldown`/
 * `poisonVolleyInterval` > 0), not `w.coreKey === 'carnivorous_plant'` — the
 * same data-driven rule `nearCoreSlowAura` already set for Time's aura, so a
 * future Core authoring the same effect keys gets this mechanism for free.
 * Called from every phase (`Run.step`), same as `updateCoreEffects`.
 *
 * Both halves are Core attacks (§5.5: "not scaled by character stats, no
 * lifesteal, but they do feed on-map damage effects") — routed through
 * `damageEnemy`/`applyPoison` exactly like any other hit (so they credit
 * `damageByWeapon`/`damageTotal` and, for a kill, run the normal death chain —
 * splits, the Burning-explosion queue), with `noLifesteal: true` the one
 * explicit opt-out neither function grants by default. Q113 records the two
 * judgment calls SPEC-FINAL's prose leaves open: "10 normal + poison" reads as
 * two effects off one 10-damage hit (10 normal, plus a poison DoT triggered by
 * that same 10, using the poison row's own authored ratio/duration — not a
 * split of one shared total), and a non-elite "instant kill" is dealt as
 * damage equal to the target's current HP with armor/trait mitigation bypassed
 * (`pure`, `dot`), so it always lands exactly lethal while still crediting the
 * kill as real damage dealt. The Q113 addendum records a third: the elite
 * branch's "flat 200" is an ordinary `normal` hit, still armor/trait-mitigated
 * like every other flat number in the game (`triggerBurningExplode`'s own
 * convention) — only the instant-kill clause bypasses mitigation, since that's
 * the only reading under which "instant kill" differs from "a big normal hit."
 */
export function updateCarnivorousPlant(w: World, dt: number): void {
  if (w.huntsWarden) updatePlantVolley(w, dt);
  else updatePlantDevour(w, dt);
}

/** Squared distance from `(x, y)` to the nearest point on the Core's 2x2 footprint — the same clamp `inCoreBuildRange`/`nearCoreSlowAura` use, not a bare center-point distance. */
function coreEdgeDist2(x: number, y: number): number {
  const cx = clamp(x, CORE_X, CORE_X + CORE_W);
  const cy = clamp(y, CORE_Y, CORE_Y + CORE_H);
  return dist2(x, y, cx, cy);
}

/** The `limit` live enemies nearest the Core's own footprint within `radius` (or unbounded, for `Infinity`), nearest first, ties broken by id for determinism. */
function nearestEnemiesToCore(w: World, radius: number, limit: number): Enemy[] {
  const cc = coreCenter();
  // `enemiesInRadius`'s bucket scan is center-anchored; padded by the
  // footprint's own half-diagonal (~1.42) so it can't clip a real edge hit
  // the exact `coreEdgeDist2` filter below would otherwise have kept.
  const scanRadius = radius === Infinity ? Infinity : radius + 1.5;
  const r2 = radius * radius;
  const list = w.enemiesInRadius(cc.x, cc.y, scanRadius).filter((e) => !e.dead && coreEdgeDist2(e.x, e.y) <= r2);
  list.sort((a, b) => coreEdgeDist2(a.x, a.y) - coreEdgeDist2(b.x, b.y) || a.id - b.id);
  return list.length > limit ? list.slice(0, limit) : list;
}

function updatePlantDevour(w: World, dt: number): void {
  if (w.core.devourCooldown <= 0) return;
  w.plantDevourTimer -= dt;
  if (w.plantDevourTimer > 0) return;
  w.plantDevourTimer += w.core.devourCooldown;
  if (w.plantDevourTimer < 0) w.plantDevourTimer = 0;

  const [target] = nearestEnemiesToCore(w, w.core.devourRadius, 1);
  if (!target) return;

  if (target.elite) {
    damageEnemy(w, target, w.core.devourEliteDamage, 'carnivorous_plant', { type: 'normal', noLifesteal: true });
  } else {
    // `target.hp` is credited as the dealt amount assuming the hit lands for
    // exactly that much; `statusDamageTakenMul` (frozen's +30%) is applied
    // unconditionally in `damageEnemy` regardless of `pure`/`dot`, so a future
    // frozen-applying source reaching Act I would over-credit `damageByWeapon`/
    // `damageTotal` here without changing the (already-lethal) outcome. No
    // `/data` row applies `frozen` today, so this is dormant — code-reviewer
    // finding on p-core-c, not fixed since nothing currently reaches it.
    damageEnemy(w, target, target.hp, 'carnivorous_plant', {
      pure: true,
      dot: true,
      type: 'normal',
      noLifesteal: true,
    });
  }
  w.coreHp = Math.min(w.coreMaxHp, w.coreHp + w.core.devourCoreHeal);
  w.digestionStacks++;
}

/** A poison DoT triggered by `amount` of the poison row's own authored ratio/duration/cap — same math `damagetypes.ts`'s `dotDpsFor` gives a ratio row, without importing that module (see the file's cycle note). */
function applyCoreHitPoison(w: World, e: Enemy, amount: number, source: string): void {
  const def = w.content.damageTypeByKey.get('poison');
  if (!def || def.ratio === undefined || !def.duration) return;
  applyPoison(w, e, (def.ratio * amount) / def.duration, def.duration, def.maxStacks ?? 3, source);
}

function updatePlantVolley(w: World, dt: number): void {
  if (w.core.poisonVolleyInterval <= 0) return;
  w.plantVolleyTimer -= dt;
  if (w.plantVolleyTimer > 0) return;
  w.plantVolleyTimer += w.core.poisonVolleyInterval;
  if (w.plantVolleyTimer < 0) w.plantVolleyTimer = 0;

  if (w.core.poisonStacksPerBullet <= 0) return;
  const bullets = Math.min(
    w.core.poisonVolleyCap,
    Math.floor(w.digestionStacks / w.core.poisonStacksPerBullet),
  );
  if (bullets <= 0) return;

  // No range limit authored for the VS volley (unlike the TD devour's r2) —
  // "targeting nearest enemies to the Core" names no radius (Q113), so
  // `nearestEnemiesToCore` is called unbounded, safe since `enemiesInRadius`
  // clamps an infinite radius to the grid's own cell range rather than
  // iterating anything unbounded.
  const targets = nearestEnemiesToCore(w, Infinity, bullets);
  for (const e of targets) {
    const dmg = w.core.poisonBulletDamage;
    damageEnemy(w, e, dmg, 'carnivorous_plant', { type: 'normal', noLifesteal: true });
    if (!e.dead) applyCoreHitPoison(w, e, dmg, 'carnivorous_plant');
  }
}
