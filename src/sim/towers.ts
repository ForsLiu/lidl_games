/**
 * Act I towers (SPEC 3.3): placement rules, upgrades, selling and firing.
 *
 * Placement obeys three hard rules from SPEC 3.1:
 *   - the tile must be buildable,
 *   - the Warden must be within build range,
 *   - no placement may cut a gate off from the Core (path guarantee).
 */

import {
  applyEffects,
  bestConeDirection,
  bestLineDirection,
  chainHit,
  coneHit,
  spawnProjectile,
  targetFirst,
} from './combat';
import type { TowerDef } from './content';
import { dist2, normalize } from './math';
import { applySlow, damageEnemy } from './enemies';
import type { Structure } from './types';
import { World } from './world';

export type BuildResult =
  | { ok: true; structure: Structure }
  | { ok: false; reason: BuildRejection };

export type BuildRejection =
  | 'phase'
  | 'unknown_tower'
  | 'class_locked'
  | 'occupied'
  | 'out_of_range'
  | 'gold'
  | 'blocks_path';

/** Act I build phases plus Dusk allow construction. */
export function canBuildNow(w: World): boolean {
  return w.phase === 'act1_build' || w.phase === 'act1_wave' || w.phase === 'dusk';
}

export function towerCost(w: World, def: TowerDef): number {
  return Math.max(1, Math.round(def.cost * w.derived.towerCostMul));
}

export function upgradeCost(w: World, def: TowerDef, toTier: number): number {
  const t = w.content.towers;
  const factor = toTier === 2 ? t.upgradeCostT2 : t.upgradeCostT3;
  return Math.max(1, Math.round(def.cost * factor * w.derived.towerCostMul));
}

export function inBuildRange(w: World, tx: number, ty: number): boolean {
  const r = w.derived.buildRange;
  return dist2(w.warden.x, w.warden.y, tx + 0.5, ty + 0.5) <= r * r;
}

/** Full legality check without side effects — the renderer uses it for ghosts. */
export function checkBuild(w: World, towerId: number, tx: number, ty: number): BuildRejection | null {
  if (!canBuildNow(w)) return 'phase';
  const def = w.content.towerById.get(towerId);
  if (!def) return 'unknown_tower';
  if (def.classLock && def.classLock !== w.cfg.classKey) return 'class_locked';
  if (!w.grid.buildable(tx, ty)) return 'occupied';
  if (!inBuildRange(w, tx, ty)) return 'out_of_range';
  if (w.gold < towerCost(w, def)) return 'gold';
  if (def.blocks && w.grid.wouldBlockPath([[tx, ty]])) return 'blocks_path';
  return null;
}

export function buildTower(w: World, towerId: number, tx: number, ty: number): BuildResult {
  const reason = checkBuild(w, towerId, tx, ty);
  if (reason) return { ok: false, reason };
  const def = w.content.towerById.get(towerId)!;
  const cost = towerCost(w, def);
  w.gold -= cost;
  w.goldSpent += cost;

  const hpMul = def.key === 'palisade' ? w.derived.wallHpMul : 1;
  const s: Structure = {
    id: w.newId(),
    towerId: def.id,
    tier: 1,
    tx,
    ty,
    hp: def.hp * hpMul,
    maxHp: def.hp * hpMul,
    cooldown: 0,
    dead: false,
    petrified: false,
    gemTimer: 0,
    gemsWaiting: 0,
    links: [],
    damageDealt: 0,
  };
  w.addStructure(s);
  w.towersBuilt++;
  w.towersByKey[def.key] = (w.towersByKey[def.key] ?? 0) + 1;
  w.emit('build', tx + 0.5, ty + 0.5, def.id, 1);
  markAuraDirty(w);
  return { ok: true, structure: s };
}

export function upgradeTower(w: World, tx: number, ty: number): boolean {
  if (!canBuildNow(w)) return false;
  const s = w.structureAt(tx, ty);
  if (!s || s.petrified) return false;
  const def = w.content.towerById.get(s.towerId)!;
  if (s.tier >= def.maxTier) return false;
  if (!inBuildRange(w, tx, ty)) return false;
  const cost = upgradeCost(w, def, s.tier + 1);
  if (w.gold < cost) return false;
  w.gold -= cost;
  w.goldSpent += cost;
  s.tier++;
  const hpMul = def.key === 'palisade' ? w.derived.wallHpMul : 1;
  const ratio = s.maxHp > 0 ? s.hp / s.maxHp : 1;
  s.maxHp = def.hp * hpMul * (1 + 0.5 * (s.tier - 1));
  s.hp = s.maxHp * ratio;
  w.emit('upgrade', tx + 0.5, ty + 0.5, def.id, s.tier);
  markAuraDirty(w);
  return true;
}

export function sellTower(w: World, tx: number, ty: number): boolean {
  if (!canBuildNow(w)) return false;
  const s = w.structureAt(tx, ty);
  if (!s || s.petrified) return false;
  if (!inBuildRange(w, tx, ty)) return false;
  const def = w.content.towerById.get(s.towerId)!;
  let spent = towerCost(w, def);
  for (let t = 2; t <= s.tier; t++) spent += upgradeCost(w, def, t);
  const rate = w.phase === 'dusk' ? w.content.towers.duskSellRefund : w.content.towers.sellRefund;
  const refund = Math.round(spent * rate);
  w.gold += refund;
  w.removeStructure(s);
  w.towersByKey[def.key] = Math.max(0, (w.towersByKey[def.key] ?? 1) - 1);
  w.emit('sell', tx + 0.5, ty + 0.5, def.id, refund);
  markAuraDirty(w);
  return true;
}

/* ------------------------------------------------------------ tower stats */

export function tierDamageMul(w: World, tier: number): number {
  return Math.pow(w.content.towers.tierDamageMul, tier - 1);
}

export function tierRangeMul(w: World, tier: number): number {
  return Math.pow(w.content.towers.tierRangeMul, tier - 1);
}

/** SPEC 2.1: Power multiplies tower damage in Act I. */
export function towerDamage(w: World, s: Structure, base: number): number {
  return base * tierDamageMul(w, s.tier) * w.derived.powerMul * w.derived.towerDamageMul;
}

export function towerRange(w: World, s: Structure, base: number): number {
  return base * tierRangeMul(w, s.tier) * w.derived.towerRangeMul;
}

/* ------------------------------------------------------------ beacon auras */

/**
 * Aura state lives on the World, never at module scope: several worlds are
 * alive at once in tests and sweeps, and structure ids restart per world.
 */
export function markAuraDirty(w?: World): void {
  if (w) w.auraDirty = true;
}

function refreshAuras(w: World): void {
  w.auraBonus.clear();
  const beacons: Structure[] = [];
  for (const s of w.structures) {
    if (s.dead || s.petrified) continue;
    const def = w.content.towerById.get(s.towerId)!;
    if (def.buffAura) beacons.push(s);
  }
  w.auraDirty = false;
  if (beacons.length === 0) return;
  for (const s of w.structures) {
    if (s.dead || s.petrified) continue;
    let bonus = 0;
    for (const b of beacons) {
      if (b.id === s.id) continue;
      const def = w.content.towerById.get(b.towerId)!;
      const r = def.buffAura!.radius + w.derived.beaconRadiusBonus;
      if (dist2(b.tx + 0.5, b.ty + 0.5, s.tx + 0.5, s.ty + 0.5) <= r * r) {
        // Higher-tier beacons project a stronger aura.
        bonus += def.buffAura!.attackSpeed * (1 + 0.25 * (b.tier - 1));
      }
    }
    if (bonus > 0) w.auraBonus.set(s.id, bonus);
  }
}

export function attackSpeedFor(w: World, s: Structure): number {
  return w.derived.attackSpeedMul + (w.auraBonus.get(s.id) ?? 0);
}

/* ---------------------------------------------------------------- firing */

export function updateTowers(w: World, dt: number): void {
  if (w.auraDirty) refreshAuras(w);
  for (const s of w.structures) {
    if (s.dead || s.petrified) continue;
    const def = w.content.towerById.get(s.towerId)!;
    if (!def.attack) continue;
    s.cooldown -= dt * attackSpeedFor(w, s);
    if (s.cooldown > 0) continue;
    s.cooldown += def.attack.interval;
    if (s.cooldown < 0) s.cooldown = 0;
    fireTower(w, s, def);
  }
}

function fireTower(w: World, s: Structure, def: TowerDef): void {
  const a = def.attack!;
  const x = s.tx + 0.5;
  const y = s.ty + 0.5;
  const range = towerRange(w, s, a.range);
  const dmg = towerDamage(w, s, a.damage);
  const area = w.derived.areaMul;
  const source = def.key;

  switch (a.kind) {
    case 'single': {
      const t = targetFirst(w, x, y, range);
      if (!t) {
        s.cooldown = 0;
        return;
      }
      s.damageDealt += damageEnemy(w, t, dmg, source, { fromX: x, fromY: y });
      w.emit('shot', x, y, t.x, t.y);
      break;
    }
    case 'pierce': {
      const dir = bestLineDirection(w, x, y, range, 0.4);
      if (!dir) {
        s.cooldown = 0;
        return;
      }
      spawnProjectile(w, {
        kind: 'bolt',
        x,
        y,
        targetX: x + dir.x * range,
        targetY: y + dir.y * range,
        speed: a.projectileSpeed ?? 14,
        damage: dmg,
        pierce: a.pierce ?? 1,
        source,
      });
      break;
    }
    case 'cone': {
      const halfAngle = (a.coneHalfAngle ?? 0.6) * area;
      const dir = bestConeDirection(w, x, y, range, halfAngle);
      if (!dir) {
        s.cooldown = 0;
        return;
      }
      s.damageDealt += coneHit(w, x, y, dir.x, dir.y, range, halfAngle, dmg, source, {
        source,
        burnDps: a.burn ? a.burn.dps * tierDamageMul(w, s.tier) : 0,
        burnDuration: a.burn?.duration ?? 0,
      });
      w.emit('cone', x, y, dir.x, dir.y);
      break;
    }
    case 'aura': {
      const r = range * area;
      const list = w.enemiesInRadius(x, y, r);
      for (const e of list) {
        if (e.dead) continue;
        s.damageDealt += damageEnemy(w, e, dmg, source, { fromX: x, fromY: y });
        if (!e.dead && a.slow) applySlow(w, e, a.slow, a.slowDuration ?? 1);
      }
      if (list.length > 0) w.emit('pulse', x, y, r, 0);
      break;
    }
    case 'chain': {
      const t = targetFirst(w, x, y, range);
      if (!t) {
        s.cooldown = 0;
        return;
      }
      const chains = (a.chains ?? 3) + Math.max(0, s.tier - 1);
      s.damageDealt += chainHit(w, x, y, t, chains, a.chainRange ?? 3, dmg, source);
      break;
    }
    case 'lob': {
      const minR = a.minRange ?? 0;
      const t = pickLobTarget(w, x, y, minR, range);
      if (!t) {
        s.cooldown = 0;
        return;
      }
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
        aoe: (a.aoe ?? 1.5) * area,
        source,
      });
      break;
    }
    case 'poison': {
      const t = targetFirst(w, x, y, range);
      if (!t) {
        s.cooldown = 0;
        return;
      }
      const p = a.poison!;
      applyEffects(w, t, {
        source,
        poisonDps: p.dps * tierDamageMul(w, s.tier) * w.derived.powerMul,
        poisonDuration: p.duration,
        poisonStacks: p.maxStacks,
      });
      if (dmg > 0) s.damageDealt += damageEnemy(w, t, dmg, source, { fromX: x, fromY: y });
      w.emit('spore', x, y, t.x, t.y);
      break;
    }
  }
}

function pickLobTarget(w: World, x: number, y: number, minRange: number, range: number) {
  const list = w.enemiesInRadius(x, y, range);
  const min2 = minRange * minRange;
  let best = null;
  let bestCount = -1;
  for (const c of list) {
    if (dist2(x, y, c.x, c.y) < min2) continue;
    let count = 0;
    for (const e of list) if (dist2(c.x, c.y, e.x, e.y) <= 2.25) count++;
    if (count > bestCount) {
      bestCount = count;
      best = c;
    }
  }
  return best;
}

function leadTarget(t: { x: number; y: number; fx: number; fy: number; speed: number }, time: number) {
  const n = normalize(t.fx, t.fy);
  return { x: t.x + n.x * t.speed * time, y: t.y + n.y * t.speed * time };
}

/* ------------------------------------------------------------ Harvest gold */

/** SPEC 3.3 #10: Sprouts pay +5 gold per wave per tier at wave clear. */
export function collectSproutGold(w: World): number {
  let total = 0;
  for (const s of w.structures) {
    if (s.dead || s.petrified) continue;
    const def = w.content.towerById.get(s.towerId)!;
    if (!def.economy) continue;
    total += def.economy.goldPerWavePerTier * s.tier;
  }
  if (total > 0) {
    const gold = Math.round(total * w.derived.sproutMul * (1 + w.derived.goldFind));
    w.gold += gold;
    w.goldEarned += gold;
    return gold;
  }
  return 0;
}
