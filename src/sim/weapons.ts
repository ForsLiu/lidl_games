/**
 * Soul weapons (SPEC 4.2 / 5.3). Every weapon auto-fires; there is no manual
 * aiming (SPEC 5.1). Levels 1-6 come from `data/weapons.json`; the Act I
 * inheritance bonus rides on top as a flat damage multiplier.
 */

import {
  applyAoE,
  applyEffects,
  bestLineDirection,
  chainHit,
  coneHit,
  densestCluster,
  lineHit,
  spawnProjectile,
} from './combat';
import type { AwakeningDef, WeaponDef, WeaponLevel } from './content';
import { damageEnemy } from './enemies';
import { dcos, dsin, dist2, normalize } from './math';
import { BASE } from './stats';
import type { Enemy, WeaponState } from './types';
import { World } from './world';

export function weaponDef(w: World, key: string): WeaponDef {
  const d = w.content.weaponByKey.get(key);
  if (!d) throw new Error(`unknown weapon "${key}"`);
  return d;
}

export function levelStats(w: World, ws: WeaponState): WeaponLevel {
  const def = weaponDef(w, ws.key);
  const lv = Math.max(1, Math.min(def.levels.length, ws.level));
  return def.levels[lv - 1];
}

export function awakeningFor(w: World, key: string): AwakeningDef | null {
  return w.content.weapons.awakenings.find((a) => a.key === key) ?? null;
}

function activeAwakening(w: World, ws: WeaponState): AwakeningDef | null {
  if (!ws.awakened) return null;
  return w.content.weapons.awakenings.find((a) => a.weapon === ws.key) ?? null;
}

/** Total damage multiplier for a weapon: Power x inheritance bonus. */
export function weaponDamageMul(w: World, ws: WeaponState): number {
  return w.derived.powerMul * (1 + ws.damageBonus);
}

/** Cooldown-style weapons benefit from CDR (SPEC 2.1). */
function intervalFor(w: World, ws: WeaponState, base: number, usesCdr: boolean): number {
  const cdr = usesCdr ? 1 - w.derived.cdr : 1;
  void ws;
  return (base * cdr) / (w.derived.attackSpeedMul + w.shrineHaste);
}

export function grantWeapon(w: World, key: string, level: number, damageBonus: number): WeaponState {
  const existing = w.weapons.find((x) => x.key === key);
  if (existing) {
    existing.level = Math.max(existing.level, level);
    existing.damageBonus = Math.max(existing.damageBonus, damageBonus);
    return existing;
  }
  const ws: WeaponState = {
    key,
    level: Math.max(1, Math.min(w.content.weapons.maxLevel, level)),
    damageBonus,
    cooldown: 0,
    awakened: false,
    ringPhase: 0,
    ringCooldown: 0,
  };
  w.weapons.push(ws);
  return ws;
}

/* ------------------------------------------------------------------ update */

export function updateWeapons(w: World, dt: number): void {
  for (const ws of w.weapons) fireWeapon(w, ws, dt);
}

function fireWeapon(w: World, ws: WeaponState, dt: number): void {
  const def = weaponDef(w, ws.key);
  const lv = levelStats(w, ws);
  const wd = w.warden;
  const area = w.derived.areaMul;
  const dmgMul = weaponDamageMul(w, ws);
  const awk = activeAwakening(w, ws);

  switch (def.kind) {
    case 'cone': {
      // Continuous: applies damage every tick along the movement direction.
      const range = (lv.range ?? 3) * area;
      const half = (lv.halfAngle ?? 0.5) * Math.min(1.6, area);
      const dps = (lv.dps ?? 0) * dmgMul;
      const n = normalize(wd.fx, wd.fy);
      if (n.x !== 0 || n.y !== 0) {
        coneHit(w, wd.x, wd.y, n.x, n.y, range, half, dps * dt, ws.key, {
          burnDps: (lv.burnDps ?? 0) * dmgMul,
          burnDuration: lv.burnDuration ?? 0,
        });
      }
      if (awk) updatePhoenixRing(w, ws, awk, dt, dmgMul, area);
      return;
    }
    case 'trail': {
      ws.cooldown -= dt;
      if (ws.cooldown > 0) return;
      ws.cooldown += intervalFor(w, ws, lv.interval ?? 0.5, false);
      w.areas.push({
        id: w.newId(),
        x: wd.x,
        y: wd.y,
        radius: (lv.radius ?? 1) * area,
        dps: (lv.dps ?? 0) * dmgMul,
        remaining: lv.duration ?? 3,
        type: 'poison',
        source: ws.key,
        acc: 0,
        dead: false,
      });
      return;
    }
    default:
      break;
  }

  ws.cooldown -= dt;
  if (ws.cooldown > 0) return;
  const usesCdr = def.kind === 'nova' || def.kind === 'lob';
  let interval = intervalFor(w, ws, lv.interval ?? 1, usesCdr);
  if (awk?.effect.intervalMul) interval *= awk.effect.intervalMul;
  ws.cooldown += interval;
  if (ws.cooldown < 0) ws.cooldown = 0;

  const damage = (lv.damage ?? 0) * dmgMul * (awk?.effect.damageMul ?? 1);

  switch (def.kind) {
    case 'single': {
      const range = (lv.range ?? 6) * area;
      const count = lv.targets ?? 1;
      const seen = new Set<number>();
      let fired = 0;
      for (let i = 0; i < count; i++) {
        const t = w.nearestEnemy(wd.x, wd.y, range, (e) => !seen.has(e.id));
        if (!t) break;
        seen.add(t.id);
        damageEnemy(w, t, damage, ws.key, { fromX: wd.x, fromY: wd.y });
        w.emit('shot', wd.x, wd.y, t.x, t.y);
        fired++;
      }
      if (fired === 0) ws.cooldown = 0;
      break;
    }
    case 'pierce': {
      const range = (lv.range ?? 12) * area;
      const width = (lv.width ?? 0.5) * area;
      const bolts = lv.bolts ?? 1;
      let fired = 0;
      const used: { x: number; y: number }[] = [];
      for (let i = 0; i < bolts; i++) {
        const dir = pickLineDirection(w, wd.x, wd.y, range, width, used);
        if (!dir) break;
        used.push(dir);
        lineHit(w, wd.x, wd.y, dir.x, dir.y, range, width, damage, ws.key, 999);
        w.emit('bolt', wd.x, wd.y, wd.x + dir.x * range, wd.y + dir.y * range);
        fired++;
      }
      if (fired === 0) ws.cooldown = 0;
      break;
    }
    case 'nova': {
      const radius = (lv.radius ?? 3.5) * area;
      applyAoE(w, wd.x, wd.y, radius, damage, ws.key, {
        slow: lv.slow ?? 0,
        slowDuration: lv.slowDuration ?? 0,
      });
      w.emit('nova', wd.x, wd.y, radius, 0);
      break;
    }
    case 'chain': {
      const range = (lv.range ?? 6) * area;
      const chains = (lv.chains ?? 4) + (awk?.effect.extraChains ?? 0);
      const t = w.nearestEnemy(wd.x, wd.y, range);
      if (!t) {
        ws.cooldown = 0;
        break;
      }
      chainHit(w, wd.x, wd.y, t, chains, (lv.chainRange ?? 3.5) * area, damage, ws.key);
      break;
    }
    case 'lob': {
      const range = (lv.range ?? 11) * area;
      const radius = (lv.radius ?? 2) * area * (awk?.effect.radiusMul ?? 1);
      const count = (lv.count ?? 1) + (awk?.effect.extraCount ?? 0);
      const excluded: Enemy[] = [];
      let fired = 0;
      for (let i = 0; i < count; i++) {
        const t = pickLobCluster(w, wd.x, wd.y, range, radius, excluded);
        if (!t) break;
        excluded.push(t);
        spawnProjectile(w, {
          kind: 'shell',
          x: wd.x,
          y: wd.y,
          targetX: t.x,
          targetY: t.y,
          speed: 9,
          damage,
          aoe: radius,
          source: ws.key,
        });
        fired++;
      }
      if (fired === 0) ws.cooldown = 0;
      break;
    }
    default:
      break;
  }
}

function pickLineDirection(
  w: World,
  x: number,
  y: number,
  range: number,
  width: number,
  used: { x: number; y: number }[],
): { x: number; y: number } | null {
  const dir = bestLineDirection(w, x, y, range, width);
  if (!dir) return null;
  // Fan extra bolts out rather than stacking them on the same line.
  if (used.length === 0) return dir;
  const spread = 0.5 * used.length;
  const a = spread * (used.length % 2 === 1 ? 1 : -1);
  const c = dcos(a);
  const s = dsin(a);
  return { x: dir.x * c - dir.y * s, y: dir.x * s + dir.y * c };
}

function pickLobCluster(
  w: World,
  x: number,
  y: number,
  range: number,
  radius: number,
  excluded: Enemy[],
): Enemy | null {
  const t = densestCluster(w, x, y, range, radius);
  if (!t) return null;
  for (const e of excluded) {
    if (dist2(e.x, e.y, t.x, t.y) < radius * radius) {
      // Already shelling this cluster: look for one further out.
      const alt = w.nearestEnemy(x, y, range, (o) =>
        excluded.every((ex) => dist2(ex.x, ex.y, o.x, o.y) >= radius * radius),
      );
      return alt;
    }
  }
  return t;
}

/** Phoenix Ring: an orbiting fire ring that ticks on its own cadence. */
function updatePhoenixRing(
  w: World,
  ws: WeaponState,
  awk: AwakeningDef,
  dt: number,
  dmgMul: number,
  area: number,
): void {
  const orbs = awk.effect.ringOrbs ?? 3;
  const radius = (awk.effect.ringRadius ?? 2.2) * area;
  ws.ringPhase += (awk.effect.ringSpeed ?? 2) * dt;
  if (ws.ringPhase > 6.283185307179586) ws.ringPhase -= 6.283185307179586;
  ws.ringCooldown -= dt;
  if (ws.ringCooldown > 0) return;
  ws.ringCooldown += awk.effect.ringInterval ?? 0.5;
  const damage = (awk.effect.ringDamage ?? 18) * dmgMul;
  for (let i = 0; i < orbs; i++) {
    const a = ws.ringPhase + (6.283185307179586 * i) / orbs;
    const ox = w.warden.x + dcos(a) * radius;
    const oy = w.warden.y + dsin(a) * radius;
    const list = w.enemiesInRadius(ox, oy, 0.7 * area);
    for (const e of list) {
      if (e.dead) continue;
      damageEnemy(w, e, damage, ws.key, { fromX: ox, fromY: oy });
    }
    w.emit('ring', ox, oy, 0.7 * area, 0);
  }
}

/* ---------------------------------------------------- petrified residuals */

/**
 * The passive half of the conversion table (SPEC 4.2): Palisade armour,
 * Beacon attack speed and everything the terrain itself does.
 */
export function applyTerrainPassives(w: World): void {
  let walls = 0;
  let beacons = 0;
  let wallArmorCap = 15;
  let beaconPer = 0.04;
  let beaconCap = 0.12;
  for (const s of w.structures) {
    if (s.dead) continue;
    const def = w.content.towerById.get(s.towerId)!;
    if (def.key === 'palisade') {
      walls++;
      wallArmorCap = def.terrain.armorCap ?? 15;
    } else if (def.passive) {
      beacons++;
      beaconPer = def.passive.attackSpeedPer;
      beaconCap = def.passive.cap;
    }
  }
  const armor = Math.min(wallArmorCap, walls) * w.derived.residualMul;
  const haste = Math.min(beaconCap, beacons * beaconPer) * w.derived.residualMul;
  w.stats.armor += armor;
  w.stats.attackSpeed += haste;
  w.recomputeDerived();
}

/** Heartstone healing + shrine/brazier/spore/spire residuals, ticked in Act II. */
export function updateTerrainEffects(w: World, dt: number): void {
  const wd = w.warden;
  const mul = w.derived.residualMul;
  w.shrineHaste = 0;

  const hsR = BASE.heartstoneRadius;
  if (w.sundered && dist2(wd.x, wd.y, w.heartstoneX, w.heartstoneY) <= hsR * hsR) {
    wd.hp = Math.min(w.derived.maxHp, wd.hp + BASE.heartstoneHeal * dt);
  }

  for (const s of w.structures) {
    if (s.dead || !s.petrified) continue;
    const def = w.content.towerById.get(s.towerId)!;
    const t = def.terrain;
    const cx = s.tx + 0.5;
    const cy = s.ty + 0.5;

    if (t.auraRadius && t.auraDps) {
      const r = t.auraRadius * w.derived.areaMul;
      const list = w.enemiesInRadius(cx, cy, r);
      for (const e of list) {
        if (e.dead) continue;
        if (t.auraType === 'poison') {
          applyEffects(w, e, { poisonDps: t.auraDps * mul, poisonDuration: 1, poisonStacks: 3 });
        } else {
          damageEnemy(w, e, t.auraDps * mul * dt, `terrain_${def.key}`, { pure: true });
        }
      }
    }

    if (t.slow) {
      const r = (t.auraRadius ?? 2) * w.derived.areaMul;
      const list = w.enemiesInRadius(cx, cy, r);
      for (const e of list) applyEffects(w, e, { slow: t.slow * mul, slowDuration: 0.5 });
    }

    if (t.wardenRadius && t.wardenAttackSpeed) {
      const r = t.wardenRadius;
      if (dist2(wd.x, wd.y, cx, cy) <= r * r) w.shrineHaste += t.wardenAttackSpeed * mul;
    }

    if (t.gemInterval && t.gemValue) {
      s.gemTimer -= dt;
      if (s.gemTimer <= 0 && s.gemsWaiting < (t.gemMax ?? 4)) {
        s.gemTimer = t.gemInterval;
        s.gemsWaiting++;
        w.gems.push({
          id: w.newId(),
          x: cx,
          y: cy,
          value: Math.round(t.gemValue * mul),
          vx: 0,
          vy: 0,
          life: w.content.spawns.gemLifetimeSeconds,
          dead: false,
        });
      }
    }

    if (t.beamDps && s.links.length > 0) {
      for (const otherId of s.links) {
        if (otherId < s.id) continue; // each pair handled once
        const o = w.structureById.get(otherId);
        if (!o || o.dead) continue;
        const ox = o.tx + 0.5;
        const oy = o.ty + 0.5;
        const n = normalize(ox - cx, oy - cy);
        const len = Math.sqrt(dist2(cx, cy, ox, oy));
        lineHit(w, cx, cy, n.x, n.y, len, 0.3, t.beamDps * mul * dt, `terrain_${def.key}`, 999);
        w.emit('beam', cx, cy, ox, oy);
      }
    }
  }
}
