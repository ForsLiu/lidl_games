/**
 * SPEC-FINAL §5.5: a Core's real TD/VS numbers (`p-core-b` gave Stone Heart in
 * full, Vampire Heart in full and Time's steps 1-2; `p-core-c` added
 * Carnivorous Plant in full; `p-core-d` adds Corpse in full. Time's steps 3-5
 * are `p-core-e`'s job).
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
  /** Corpse TD: fraction of all map damage stored (0.01 base, 0.03 at step 1 — b070 bumped 0.02->0.03 to restore G22's fingerprint margin after p10l's buildPhaseSeconds cut narrowed it). 0 = no Corpse effect. */
  corpseStoreRatio: number;
  /** Corpse TD: seconds between execute checks (1, not upgraded). 0 = no Corpse effect. */
  corpseExecuteInterval: number;
  /** Corpse step 2: an execution also deals the victim's max HP as AoE splash. */
  corpseExecuteExplode: boolean;
  /** Corpse: the execution explosion's AoE radius (2 as authored). Only meaningful once `corpseExecuteExplode` is true. */
  corpseExplodeRadius: number;
  /** Corpse step 3: seconds between auto-fires that dump the whole store at the highest-HP enemy regardless of affordability. 0 = not bought. */
  corpseAutoFireInterval: number;
  /** Time step 3/4: max ring (tiles) the decay aura reaches — 0 = not bought, 5 at step 3, 10 at step 4. */
  decayRadius: number;
  /** Time step 3/5: the aura's per-ring multiplier — 1.2 at step 3, 1.5 at step 5. Meaningless while `decayRadius` is 0. */
  decayMult: number;
}

/**
 * fb022: exported so `src/ui/info-format.ts` can diff a live `CoreState`
 * against "nothing bought yet" generically (a field still equal to its
 * baseline is inert and worth hiding from the info surfaces) rather than
 * hand-listing which fields default to a non-zero identity (`decayMult`'s
 * 1.2, `healingReceivedMul`'s 1) per Core.
 */
export function emptyCoreState(): CoreState {
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
    corpseStoreRatio: 0,
    corpseExecuteInterval: 0,
    corpseExecuteExplode: false,
    corpseExplodeRadius: 0,
    corpseAutoFireInterval: 0,
    decayRadius: 0,
    decayMult: 1.2,
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
  st.corpseStoreRatio = eff.corpseStoreRatio ?? 0;
  st.corpseExecuteInterval = eff.corpseExecuteInterval ?? 0;
  st.corpseExplodeRadius = eff.corpseExplodeRadius ?? 0;

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
    if (step.storeRatio !== undefined) st.corpseStoreRatio = step.storeRatio;
    if (step.executeExplode) st.corpseExecuteExplode = true;
    if (step.autoFireInterval !== undefined) st.corpseAutoFireInterval = step.autoFireInterval;
    if (step.decayRadius !== undefined) st.decayRadius = step.decayRadius;
    if (step.decayMult !== undefined) st.decayMult = step.decayMult;
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
 * Applies the effects of Core upgrade step `stepIndex` (already reserved by
 * the caller via `w.coreStep++`) — shared by `upgradeCore`'s paid single step
 * and `maxCore`'s free walk to the top so the two can never apply a step's
 * `coreHpBonus`/`hpRegenPerSecond` differently.
 */
function applyCoreStep(w: World, def: CoreDef, stepIndex: number): void {
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
  applyCoreStep(w, def, stepIndex);
  w.recomputeCore();
  return true;
}

/**
 * fb034 practice tool: walks the Core free to its final upgrade step, reusing
 * `applyCoreStep` for every remaining step so the HP-ratio-preserving and
 * regen-stat effects are identical to buying them one at a time — the only
 * difference is no gold is spent and no phase/build-range gate applies (this
 * is a dev Command, already gated on `w.cfg.practice` by `applyDevCommand`).
 */
export function maxCore(w: World): void {
  const def = w.content.coreByKey.get(w.coreKey);
  if (!def) return;
  while (w.coreStep < def.upgrade.count) {
    const stepIndex = w.coreStep;
    w.coreStep++;
    applyCoreStep(w, def, stepIndex);
  }
  w.recomputeCore();
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
  if (dealt <= 0 || w.core.towerLifestealPct <= 0) return;
  applyHealingToStructure(w, s, dealt * w.core.towerLifestealPct);
  // fb016: lifesteal motes flowing from the healed structure to the Core.
  w.emit('core_lifesteal', s.tx + 0.5, s.ty + 0.5, 0, 0);
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
  // fb016: the devour bite, so it reads as a distinct Core attack rather than
  // just another 'hit:normal' flash.
  w.emit('core_plant', target.x, target.y, 0, 0);
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
    // fb016: same bite cue as the TD devour — `poisonVolleyCap` already bounds
    // this to a handful of emits per volley.
    w.emit('core_plant', e.x, e.y, 0, 0);
  }
}

/**
 * §5.5 Corpse. TD only (`w.huntsWarden` gate — VS instead gets the flat
 * `vsXpGainPct` bonus, added once to the generic `xpGain` stat at construction,
 * see `World`'s constructor). `w.corpseStore` itself is credited by the generic
 * `damageEnemy` hook (enemies.ts), from every damage source on the map, not
 * just this Core's own attacks — the one Core effect that cannot be a per-tick
 * poll like every other Core function in this file, since it has to see damage
 * fired by towers, the Warden and DoTs alike.
 *
 * Every `corpseExecuteInterval` seconds (1s, not upgraded — no step touches
 * it), if the store can afford at least one live enemy's current HP, the Core
 * executes the highest-HP affordable enemy: an instant kill dealt as damage
 * equal to that enemy's own current HP, armor/trait mitigation bypassed (the
 * same `pure`/`dot` shape the Plant's non-elite devour already uses), so the
 * store is spent for exactly what the kill cost and the credited damage is
 * exactly that — which is also how the designer note ("that damage is also
 * stored... the execution counts as map damage, so 1% of it flows back into
 * the store") holds for free, through the same `damageEnemy` hook, rather than
 * needing a second bespoke credit. Step 2 (`corpseExecuteExplode`) makes that
 * same kill also deal the victim's max HP as ordinary, armor-mitigated AoE r2
 * splash to nearby enemies — a bonus on top of the execution, not itself spent
 * from the store.
 *
 * Step 3 (`corpseAutoFireInterval`, 5s) is a second, independent timer: unlike
 * the 1s check above, it always fires at the highest-HP live enemy regardless
 * of whether the store can afford it, dealing ordinary (armor-mitigated)
 * damage equal to the entire current store and spending it to zero even when
 * that is not lethal. Q114 records the one judgment call this needed: SPEC-
 * FINAL's prose calls the 1s ability an "execution" and the step-3 ability an
 * "auto-fire... spending [the store]... as damage," two different words for
 * two different mechanisms, so a step-3 hit that happens to be lethal does not
 * also trigger step 2's explosion — only the 1s execute branch can. This is
 * structural, not a reachability accident: `corpseExplode` (below) is called
 * only from `updateCorpseExecute`, never from `updateCorpseAutoFire`, so the
 * invariant holds even though the auto-fire branch is very much reachable in
 * real play — e.g. a large store executes the priciest *affordable* enemy
 * first (crediting some store back) and can then legitimately auto-fire-kill
 * a second, cheaper enemy standing outside the first kill's r2 splash, same
 * tick, no explosion either time for that second kill.
 */
export function updateCorpse(w: World, dt: number): void {
  if (w.huntsWarden || w.core.corpseExecuteInterval <= 0) return;
  updateCorpseExecute(w, dt);
  updateCorpseAutoFire(w, dt);
}

/** The live enemy with the highest current HP not exceeding `maxAffordable`, ties broken by id for determinism. Undefined if none qualifies. */
function highestAffordableEnemy(w: World, maxAffordable: number): Enemy | undefined {
  let best: Enemy | undefined;
  for (const e of w.enemies) {
    if (e.dead || e.hp > maxAffordable) continue;
    if (!best || e.hp > best.hp || (e.hp === best.hp && e.id < best.id)) best = e;
  }
  return best;
}

/** The live enemy with the highest current HP, no affordability filter — step 3's auto-fire target. Undefined if the map is clear. */
function highestHpEnemy(w: World): Enemy | undefined {
  let best: Enemy | undefined;
  for (const e of w.enemies) {
    if (e.dead) continue;
    if (!best || e.hp > best.hp || (e.hp === best.hp && e.id < best.id)) best = e;
  }
  return best;
}

/** Flat, armor-mitigated AoE r`radius` splash around `(x, y)` — step 2's execution explosion. Reimplemented by hand rather than importing `combat.ts`'s `applyAoE`, the same real-cycle avoidance `applyCoreHitPoison` already documents (`cores.ts` → `combat.ts` → `cores.ts`, since `combat.ts` already imports `applyTowerLifesteal` from this file). No falloff/primary-target logic — SPEC-FINAL names only a flat radius, no tower-style diminishing-per-target rule. */
function corpseExplode(w: World, x: number, y: number, radius: number, dmg: number): void {
  // fb016: the step-2 explosion nova, distinct from the plain execute beam below.
  w.emit('core_explode', x, y, radius, 0);
  for (const e of w.enemiesInRadius(x, y, radius)) {
    damageEnemy(w, e, dmg, 'corpse', { type: 'normal', noLifesteal: true });
  }
}

function updateCorpseExecute(w: World, dt: number): void {
  w.corpseExecuteTimer -= dt;
  if (w.corpseExecuteTimer > 0) return;
  w.corpseExecuteTimer += w.core.corpseExecuteInterval;
  if (w.corpseExecuteTimer < 0) w.corpseExecuteTimer = 0;

  const target = highestAffordableEnemy(w, w.corpseStore);
  if (!target) return;
  const spend = target.hp;
  const maxHp = target.maxHp;
  const tx = target.x;
  const ty = target.y;
  // `spend` is credited as the dealt amount assuming the hit lands for exactly
  // that much; `statusDamageTakenMul` (frozen's +30%) is applied unconditionally
  // in `damageEnemy` regardless of `pure`/`dot`, so a future frozen-applying
  // source reaching Act I would over-credit `damageByWeapon`/`damageTotal` and
  // the store's own restore here without changing the (already-lethal)
  // outcome. No `/data` row applies `frozen` today, so this is dormant — the
  // same finding QA logged on Carnivorous Plant's devour at p-core-c, not
  // fixed since nothing currently reaches it.
  damageEnemy(w, target, spend, 'corpse', { pure: true, dot: true, type: 'normal', noLifesteal: true });
  // fb005: the `dot: true` above deliberately skips `damageEnemy`'s own 'hit'
  // spark (it bypasses armor, not the "ailment ticks are silent" perf rule
  // that flag also happens to gate) — so an execution kill otherwise shows no
  // floating number at all. This is the one real "instant, larger, distinct"
  // hit in the game (there is no generic crit mechanic — QUESTIONS.md fb005),
  // fired once per execution rather than reusing the suppressed 'hit' path.
  w.emit('execute', tx, ty, spend, 0);
  // fb016: the execution beam from the Core to the target, alongside the
  // larger floating number the 'execute' event above already drives.
  const cc = coreCenter();
  w.emit('core_beam', cc.x, cc.y, tx, ty);
  // The kill above already credited `corpseStoreRatio` of `spend` back into
  // the store via the `damageEnemy` hook (enemies.ts) — subtracting the full
  // `spend` here, after that credit landed, is what makes the net result
  // "spent `spend`, then 1% of it flowed back," not "spent `spend` minus 1%."
  w.corpseStore = Math.max(0, w.corpseStore - spend);

  if (w.core.corpseExecuteExplode) corpseExplode(w, tx, ty, w.core.corpseExplodeRadius, maxHp);
}

function updateCorpseAutoFire(w: World, dt: number): void {
  if (w.core.corpseAutoFireInterval <= 0) return;
  w.corpseAutoFireTimer -= dt;
  if (w.corpseAutoFireTimer > 0) return;
  w.corpseAutoFireTimer += w.core.corpseAutoFireInterval;
  if (w.corpseAutoFireTimer < 0) w.corpseAutoFireTimer = 0;

  if (w.corpseStore <= 0) return;
  const target = highestHpEnemy(w);
  if (!target) return;
  const spend = w.corpseStore;
  w.corpseStore = 0;
  damageEnemy(w, target, spend, 'corpse', { type: 'normal', noLifesteal: true });
  // fb050: the hit itself already flashes via `damageEnemy`'s own `hit:normal`
  // event (not `dot`, so it isn't suppressed) — this beam is the missing
  // piece, showing the shot came from the Core rather than nothing at all.
  const cc = coreCenter();
  w.emit('core_autofire', cc.x, cc.y, target.x, target.y);
}

/**
 * §5.5 Time steps 3-5: the TD-only decay aura ("enemies within r5 lose
 * `1 × 1.2^(5 − ring)` HP/s ignoring armor"). Gated on `decayRadius > 0`
 * (bought) and `!w.huntsWarden` — the same TD-only rule `nearCoreSlowAura`
 * already applies to Time's other radius effect, since the general §5.5 rule
 * is "enemies still ignore the Core during VS waves." No timer/store state is
 * needed (unlike Corpse): the tick is a plain per-frame `HP/s * dt` drain
 * recomputed fresh from live enemy positions, so nothing new needs hashing —
 * `w.core.decayRadius`/`decayMult` are already covered by `hashWorld`'s
 * generic `w.core` loop.
 *
 * `ring` is `ceil(edge distance)`, clamped to at least 1 — a `distance` of
 * exactly 0 (standing on the Core's own footprint) is still ring 1's `(0,1]`
 * band, not a ring 0 that the formula has no defined rate for; distance
 * beyond `decayRadius` gets nothing. Q115 records the one judgment call this
 * needed: SPEC-FINAL's formula bakes in the literal constant 5
 * (`1.2^(5-ring)`), matching step 3's own r5 worked example verbatim, so
 * step 4's "decay aura starts at r10 (same per-ring scaling)" is read as
 * "the same fixed formula now also covers rings 6-10" — giving those newly
 * -reached outer rings a fractional (sub-1/s) rate via a negative exponent —
 * rather than "re-derive the formula around a new base of 10," which would
 * silently double every ring the aura already covered the instant step 4 is
 * bought (rings 1-5 would jump from `mult^(5-ring)` to `mult^(10-ring)`).
 * The literal wording "same...scaling," not "same...shape," reads as the
 * former: the formula itself is unchanged, only the cutoff moves.
 */
export function updateTimeDecay(w: World, dt: number): void {
  if (w.huntsWarden || w.core.decayRadius <= 0) return;
  const cc = coreCenter();
  const r = w.core.decayRadius;
  // Same bucket-scan padding rule `nearestEnemiesToCore` documents: the scan
  // is center-anchored, padded by the footprint's own half-diagonal so it
  // can't clip a real edge hit the exact `coreEdgeDist2` filter below would
  // otherwise have kept.
  for (const e of w.enemiesInRadius(cc.x, cc.y, r + 1.5)) {
    if (e.dead) continue;
    const d2 = coreEdgeDist2(e.x, e.y);
    if (d2 > r * r) continue;
    const ring = Math.max(1, Math.ceil(Math.sqrt(d2)));
    // fb153a: the leading coefficient SPEC-FINAL states as "1 x 1.2^(5-ring)
    // HP/s" is a damage magnitude in code (rule-4 debt), so it takes
    // `numberScale` like every authored one; `decayMult` is the base of an
    // exponent and is deliberately left alone.
    const rate = w.content.modifiers.numberScale * Math.pow(w.core.decayMult, 5 - ring);
    damageEnemy(w, e, rate * dt, 'time', { dot: true, type: 'normal', noLifesteal: true });
  }
}
