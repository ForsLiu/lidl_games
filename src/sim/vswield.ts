/**
 * SPEC-FINAL §6.1: VS tower-attack inheritance ("wielding"). In a VS wave the
 * character carries every built tower type's attack — one entry per type,
 * derived from the live board rather than authored separately.
 *
 * Owner formula, verbatim (§6.1): "the attack has the same attack speed,
 * special effects, and highest upgrade effect; the attack damage is the
 * average among that type (considering the different upgrade attack),
 * boosted by 10% for each tower of that type."
 *
 * `wieldedAttacks` (p2a) is the formula; `updateWieldedAttacks` (p2b) is the
 * live fire loop — §6.1's last clause, "these are treated as character
 * attacks" (scaled by Power/attack speed/Area, triggering lifesteal and
 * on-attack passives). p2c still owes towers standing inert-but-damageable
 * with their own §5 VS special, a separate mechanism from wielding.
 */

import {
  applyAoE,
  applyEffects,
  bestConeDirection,
  bestLineDirection,
  chainHit,
  coneHit,
  dealHit,
  type HitEffects,
  lineHit,
  spawnProjectile,
} from './combat';
import type { TowerAttack, TowerDef } from './content';
import { applySlow } from './enemies';
import { dist2, normalize } from './math';
import { arcElectric, effectiveTowerAoe, LINE_HALF_WIDTH, leadTarget, pickLobTarget } from './towers';
import { coreAttackSpeedMul } from './cores';
import { typeMasteryMul } from './progression';
import { attackProfile, type AttackProfile, upgradeStatMul } from './upgrades';
import type { Enemy, Structure } from './types';
import type { World } from './world';

/** One tower type's inherited VS attack. */
export interface WieldedAttack {
  towerId: number;
  towerKey: string;
  /** How many built, living towers of this type feed the average. */
  count: number;
  /** §6.1: average per-tower damage across the group, +10% per tower of the type. */
  damage: number;
  /** The average before the +10%-per-tower bonus — `damage`'s own denominator,
   * exposed so a reader (the lineage panel, p2d) can show the two numbers §6.2
   * names separately without re-deriving §6.1's bonus fraction itself. */
  perTowerAverage: number;
  /** "the same attack speed" — the type's authored interval; §4 upgrades never change it. */
  interval: number;
  /** "special effects, and highest upgrade effect" — the group's highest tier's profile. */
  profile: AttackProfile;
  /** The tier `profile` was built at — a burn/DoT rider still scales by this, not by Power. */
  highestTier: number;
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
    // fb015 (§7) Builder's Necklace: the same flat-before-upgrade-scaling
    // treatment `towerDamage` (towers.ts) gives it, so the point is also
    // "boostable by ... the VS count multiplier" — `damage`'s own
    // `* (1 + 0.1 * count)` below, applied to `perTowerAverage` which this
    // flat already fed.
    sum += (def.attack!.damage + w.derived.towerAtkFlat) * upgradeStatMul(w, def, s.tier);
    if (s.tier > highestTier) highestTier = s.tier;
  }
  const perTowerAverage = sum / count;
  return {
    towerId: def.id,
    towerKey: def.key,
    count,
    damage: perTowerAverage * (1 + 0.1 * count),
    perTowerAverage,
    interval: def.attack!.interval,
    profile: attackProfile(def, highestTier),
    highestTier,
  };
}

/* --------------------------------------------------------------- p2b: fire */

/**
 * §6.1's last clause: a wielded attack fires from the Warden, on its own
 * per-type cooldown, scaled by the *character's* stats — Power, attack speed
 * and Area, never `towerDamageMul`/`towerRangeMul`, which are the Act I
 * tower-side multipliers and stay Act I's. The one deliberate
 * exception is `towerAttackSpeedMul`: §4.1 Wind Slash (p6b) names itself
 * "effective in VS" verbatim, unlike any other tower-side stat, so it rides
 * alongside the character's own `attackSpeedMul` below (Q118). Beacon Totem's
 * `w.shrineHaste` (§5.2, terrain residual) is a third origin distinct from
 * both — §2/Q64's rule for a boost outside the class/tree/relic/boon/terrain
 * stack is that it multiplies, the same treatment `towers.ts`'s
 * `attackSpeedFor` already gives its own `auraBonus` (Q102 ORDER). It reuses `combat.ts`'s
 * shape-by-`kind` primitives (the same ones `fireTower` and `fireWeapon`
 * call), so lifesteal and damage attribution fall out for free: `dealHit`'s
 * `DamageOptions` carries no `dot`/typed override, so `damageEnemy`'s §2 leech
 * gate sees ordinary character damage, keyed by `wielded.towerKey` exactly
 * like every other damage source.
 *
 * Targeting is character-relative (`w.nearestEnemy`/`enemiesInRadius` off the
 * Warden's position), not `targetFirst`'s Core-relative flow-field distance —
 * that ranking exists to protect the TD path and means nothing once the
 * attack is standing wherever the player is.
 *
 * The cooldown model mirrors `updateTowers` (towers.ts) exactly rather than
 * `fireWeapon`'s (weapons.ts): decrement by `dt * attackSpeedMul` every tick
 * and add back the raw interval on reset, so a mid-cycle attack-speed change
 * (VS levels up continuously) speeds up the *current* countdown instead of
 * only the next one.
 */
export function updateWieldedAttacks(w: World, dt: number): void {
  // SPEC-FINAL §5.5 Time: "VS: character attack and movement speed +20%".
  const speedMul =
    w.derived.attackSpeedMul * w.derived.towerAttackSpeedMul * coreAttackSpeedMul(w) * (1 + w.shrineHaste);
  for (const wielded of cachedWieldedAttacks(w)) {
    let cd = (w.wieldedCooldown.get(wielded.towerId) ?? 0) - dt * speedMul;
    if (cd > 0) {
      w.wieldedCooldown.set(wielded.towerId, cd);
      continue;
    }
    const def = w.content.towerById.get(wielded.towerId)!;
    cd += wielded.interval;
    if (cd < 0) cd = 0;
    if (!fireWielded(w, wielded, def, def.attack!)) cd = 0;
    w.wieldedCooldown.set(wielded.towerId, cd);
  }
}

/**
 * `wieldedAttacks` regroups and re-averages every built structure on every
 * call; the roster it reads only changes on build/sell/upgrade (§10's tower
 * mutations, all Act-I-only today), so it is cached on `World` and
 * invalidated through the same `markAuraDirty` call sites the Beacon-aura
 * cache already uses — the two caches share an invalidation signal because
 * they share what invalidates them, not because they are the same cache.
 */
function cachedWieldedAttacks(w: World): WieldedAttack[] {
  if (w.wieldedDirty) {
    w.wieldedCache = wieldedAttacks(w);
    w.wieldedDirty = false;
  }
  return w.wieldedCache!;
}

/** Nearest `n` enemies to a point, best (closest) first — poison's spare spore. */
function nearestEnemies(w: World, x: number, y: number, range: number, n: number): Enemy[] {
  if (n <= 1) {
    const one = w.nearestEnemy(x, y, range);
    return one ? [one] : [];
  }
  const list = w.enemiesInRadius(x, y, range);
  const picked: Enemy[] = [];
  const keys: number[] = [];
  for (const e of list) {
    const key = dist2(x, y, e.x, e.y);
    let i = picked.length;
    while (i > 0 && keys[i - 1] > key) i--;
    if (i >= n) continue;
    picked.splice(i, 0, e);
    keys.splice(i, 0, key);
    if (picked.length > n) {
      picked.pop();
      keys.pop();
    }
  }
  return picked;
}

/** One type's volley. Returns false (and resets the cooldown to fire again
 * next tick) everywhere `fireTower`/`fireWeapon` retry with no target, plus
 * the 'aura' kind, which retries here where `fireTower`'s own aura does not
 * (see its case below). */
function fireWielded(w: World, wielded: WieldedAttack, def: TowerDef, a: TowerAttack): boolean {
  const wd = w.warden;
  const x = wd.x;
  const y = wd.y;
  const area = w.derived.areaMul;
  // fb015 (§7) Sniper Bracelet: "character ... range +10%" — wielded attacks
  // are explicitly "treated as character attacks" (§6.1), so the character
  // half of the bracelet's bonus rides along here; the tower half
  // (`towerRange`) deliberately does not — see this file's header comment on
  // why `towerRangeMul` stays Act I's.
  const range = a.range * area * w.derived.charRangeMul;
  // SPEC-FINAL §6.3 Type Mastery: "+20% that type's VS attack damage" per
  // rank, one card per built tower type — applied here, the single choke
  // point every wielded-attack kind already funnels its damage through.
  const dmg = wielded.damage * w.derived.powerMul * typeMasteryMul(w, wielded.towerKey);
  const prof = wielded.profile;
  const source = wielded.towerKey;
  const fx: HitEffects = { source, onHit: prof.onHit, ratio: prof.ratio };

  switch (a.kind) {
    case 'single': {
      const t = w.nearestEnemy(x, y, range);
      if (!t) return false;
      const dir = normalize(t.x - x, t.y - y);
      const hits = dir.x === 0 && dir.y === 0 ? 1 : 1 + prof.pierce;
      for (let i = 0; i < prof.projectiles; i++) {
        lineHit(w, x, y, dir.x, dir.y, range, LINE_HALF_WIDTH * area, dmg, source, hits, fx, { primary: t });
        w.emit('shot', x, y, t.x, t.y);
      }
      break;
    }
    case 'pierce': {
      const dir = bestLineDirection(w, x, y, range, LINE_HALF_WIDTH * area);
      if (!dir) return false;
      for (let i = 0; i < prof.projectiles; i++) {
        spawnProjectile(w, {
          kind: 'bolt',
          x,
          y,
          targetX: x + dir.x * range,
          targetY: y + dir.y * range,
          speed: a.projectileSpeed ?? 14,
          damage: dmg,
          pierce: prof.pierce,
          source,
          fx,
          // A wielded shot has no owning `Structure` — towers stand inert
          // through a VS wave (§6.2) — so there is nothing to credit.
          structureId: 0,
        });
      }
      break;
    }
    case 'cone': {
      // §5.2 Fire Brazier @4: "cone width +50%" — mirrors `fireTower`'s own
      // cone case (towers.ts).
      const halfAngle = (a.coneHalfAngle ?? 0.6) * area * prof.coneWidthMul;
      const dir = bestConeDirection(w, x, y, range, halfAngle);
      if (!dir) return false;
      coneHit(w, x, y, dir.x, dir.y, range, halfAngle, dmg, source, {
        ...fx,
        // Mirrors `fireTower`'s cone case exactly (towers.ts): the burn rider
        // scales with the group's own highest upgrade tier, never with
        // character Power — the direct-hit half of this attack already
        // carries Power via `dmg` above. §5.2 @2: "+1 Burning per hit" reads
        // as `prof.burnStacks`, a dps multiplier — see
        // `AttackProfile.burnStacks`'s doc comment (upgrades.ts).
        burnDps: a.burn ? a.burn.dps * prof.burnStacks * upgradeStatMul(w, def, wielded.highestTier) : 0,
        burnDuration: a.burn?.duration ?? 0,
      });
      w.emit('cone', x, y, dir.x, dir.y);
      break;
    }
    case 'aura': {
      // Deliberate divergence from `fireTower`'s own aura case (which has no
      // no-target retry and always spends its interval on an empty pulse):
      // a wielded aura retries every tick with no target so a Warden who
      // walks out of and back into a crowd doesn't lose a volley to bad
      // timing, the same reasoning every other wielded kind already gets.
      const list = w.enemiesInRadius(x, y, range);
      let hitAny = false;
      for (const e of list) {
        if (e.dead) continue;
        hitAny = true;
        dealHit(w, e, dmg, source, fx, { fromX: x, fromY: y });
        if (e.dead) continue;
        // §5.2 Frost Obelisk @3: "frost from this tower lasts 5s" — `prof`
        // already resolves this against the authored `slowDuration`.
        if (a.slow) applySlow(w, e, a.slow, prof.slowDuration);
        applyEffects(w, e, fx);
      }
      if (!hitAny) return false;
      w.emit('pulse', x, y, range, 0);
      break;
    }
    case 'chain': {
      const t = w.nearestEnemy(x, y, range);
      if (!t) return false;
      const chainRange = (a.chainRange ?? 3) * area;
      chainHit(w, x, y, t, a.chains ?? 3, chainRange, dmg, source, fx);
      if (prof.electricChain) arcElectric(w, t, dmg, prof.ratio, chainRange, source, x, y);
      break;
    }
    case 'lob': {
      const minR = a.minRange ?? 0;
      const t = pickLobTarget(w, x, y, minR, range);
      if (!t) return false;
      const speed = a.projectileSpeed ?? 7;
      const lead = Math.sqrt(dist2(x, y, t.x, t.y)) / speed;
      const aim = leadTarget(t, lead);
      spawnProjectile(w, {
        kind: 'shell',
        x,
        y,
        targetX: aim.x,
        targetY: aim.y,
        speed,
        damage: dmg,
        aoe: effectiveTowerAoe(w, def),
        source,
        fx,
        // §5.2 Mortar @3: "shells leave a burning patch" — mirrors
        // `fireTower`'s own lob case (towers.ts).
        groundBurn: prof.groundBurn,
        groundBurnSeconds: prof.groundBurnSeconds,
        // A wielded shot has no owning `Structure` — towers stand inert
        // through a VS wave (§6.2) — so there is nothing to credit.
        structureId: 0,
      });
      break;
    }
    case 'poison': {
      const targets = nearestEnemies(w, x, y, range, prof.projectiles);
      if (targets.length === 0) return false;
      const splash = effectiveTowerAoe(w, def);
      for (const t of targets) {
        if (splash > 0) {
          applyAoE(w, t.x, t.y, splash, dmg, source, fx, { primary: t, damage: { fromX: x, fromY: y } });
        } else {
          dealHit(w, t, dmg, source, fx, { fromX: x, fromY: y });
          if (!t.dead) applyEffects(w, t, fx);
        }
        w.emit('spore', x, y, t.x, t.y);
      }
      break;
    }
  }
  w.recordAttack(source);
  return true;
}
