/**
 * Shared combat primitives used by both towers (Act I) and soul weapons
 * (Act II): projectiles, area damage, chains, cones and pierce lines.
 */

import { GRID_H, GRID_W } from './grid';
import { applyBurn, applyPoison, applySlow, damageEnemy } from './enemies';
import { dcos, dist2, normalize } from './math';
import type { Enemy, Projectile } from './types';
import { World } from './world';

export interface HitEffects {
  burnDps?: number;
  burnDuration?: number;
  poisonDps?: number;
  poisonDuration?: number;
  poisonStacks?: number;
  slow?: number;
  slowDuration?: number;
}

export function applyEffects(w: World, e: Enemy, fx: HitEffects): void {
  if (fx.burnDps && fx.burnDuration) applyBurn(w, e, fx.burnDps, fx.burnDuration);
  if (fx.poisonDps && fx.poisonDuration) {
    applyPoison(w, e, fx.poisonDps, fx.poisonDuration, fx.poisonStacks ?? 3);
  }
  if (fx.slow && fx.slowDuration) applySlow(w, e, fx.slow, fx.slowDuration);
}

/* ------------------------------------------------------------- targeting */

/**
 * Act I towers shoot the enemy nearest the Core (classic "first" targeting);
 * ties break on entity id so replays are stable.
 */
export function targetFirst(w: World, x: number, y: number, range: number): Enemy | null {
  const list = w.enemiesInRadius(x, y, range);
  let best: Enemy | null = null;
  let bestKey = Infinity;
  for (const e of list) {
    const d = w.grid.distAt(Math.floor(e.x), Math.floor(e.y), e.flying || e.ghosting);
    const key = d < 0 ? 1e9 + dist2(e.x, e.y, x, y) : d;
    if (key < bestKey) {
      bestKey = key;
      best = e;
    }
  }
  return best;
}

/** Direction with the most enemies inside a cone of the given half-angle. */
export function bestConeDirection(
  w: World,
  x: number,
  y: number,
  range: number,
  halfAngle: number,
): { x: number; y: number } | null {
  const list = w.enemiesInRadius(x, y, range);
  if (list.length === 0) return null;
  const cosHalf = dcos(halfAngle);
  let best: { x: number; y: number } | null = null;
  let bestCount = 0;
  for (const candidate of list) {
    const dir = normalize(candidate.x - x, candidate.y - y);
    if (dir.x === 0 && dir.y === 0) continue;
    let count = 0;
    for (const e of list) {
      const d = normalize(e.x - x, e.y - y);
      if (d.x * dir.x + d.y * dir.y >= cosHalf) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = dir;
    }
  }
  return best;
}

/** Densest cluster centre within range — used by Mortar and Piercing Bolt. */
export function densestCluster(
  w: World,
  x: number,
  y: number,
  range: number,
  clusterRadius: number,
): Enemy | null {
  const list = w.enemiesInRadius(x, y, range);
  if (list.length === 0) return null;
  const r2 = clusterRadius * clusterRadius;
  let best: Enemy | null = null;
  let bestCount = -1;
  for (const c of list) {
    let count = 0;
    for (const e of list) if (dist2(c.x, c.y, e.x, e.y) <= r2) count++;
    if (count > bestCount) {
      bestCount = count;
      best = c;
    }
  }
  return best;
}

/** Direction that puts the most enemies on a line of the given half-width. */
export function bestLineDirection(
  w: World,
  x: number,
  y: number,
  range: number,
  halfWidth: number,
): { x: number; y: number } | null {
  const list = w.enemiesInRadius(x, y, range);
  if (list.length === 0) return null;
  let best: { x: number; y: number } | null = null;
  let bestCount = 0;
  for (const candidate of list) {
    const dir = normalize(candidate.x - x, candidate.y - y);
    if (dir.x === 0 && dir.y === 0) continue;
    let count = 0;
    for (const e of list) {
      const rx = e.x - x;
      const ry = e.y - y;
      const along = rx * dir.x + ry * dir.y;
      if (along < 0 || along > range) continue;
      const perp = Math.abs(rx * -dir.y + ry * dir.x);
      if (perp <= halfWidth + e.radius) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = dir;
    }
  }
  return best;
}

/* --------------------------------------------------------------- damage */

export function applyAoE(
  w: World,
  x: number,
  y: number,
  radius: number,
  damage: number,
  source: string,
  fx: HitEffects = {},
): number {
  const list = w.enemiesInRadius(x, y, radius);
  let total = 0;
  for (const e of list) {
    if (e.dead) continue;
    total += damageEnemy(w, e, damage, source, { fromX: x, fromY: y });
    if (!e.dead) applyEffects(w, e, fx);
  }
  return total;
}

export function coneHit(
  w: World,
  x: number,
  y: number,
  dx: number,
  dy: number,
  range: number,
  halfAngle: number,
  damage: number,
  source: string,
  fx: HitEffects = {},
): number {
  const cosHalf = dcos(halfAngle);
  const list = w.enemiesInRadius(x, y, range);
  let total = 0;
  for (const e of list) {
    if (e.dead) continue;
    const n = normalize(e.x - x, e.y - y);
    if (n.x === 0 && n.y === 0) {
      total += damageEnemy(w, e, damage, source, { fromX: x, fromY: y });
      continue;
    }
    if (n.x * dx + n.y * dy < cosHalf) continue;
    total += damageEnemy(w, e, damage, source, { fromX: x, fromY: y });
    if (!e.dead) applyEffects(w, e, fx);
  }
  return total;
}

export function lineHit(
  w: World,
  x: number,
  y: number,
  dx: number,
  dy: number,
  range: number,
  halfWidth: number,
  damage: number,
  source: string,
  maxHits: number,
  fx: HitEffects = {},
): number {
  const list = w.enemiesInRadius(x + dx * range * 0.5, y + dy * range * 0.5, range * 0.5 + 2);
  const hits: { e: Enemy; along: number }[] = [];
  for (const e of list) {
    const rx = e.x - x;
    const ry = e.y - y;
    const along = rx * dx + ry * dy;
    if (along < -e.radius || along > range) continue;
    const perp = Math.abs(rx * -dy + ry * dx);
    if (perp > halfWidth + e.radius) continue;
    hits.push({ e, along });
  }
  hits.sort((a, b) => a.along - b.along || a.e.id - b.e.id);
  let total = 0;
  let n = 0;
  for (const h of hits) {
    if (n >= maxHits) break;
    if (h.e.dead) continue;
    total += damageEnemy(w, h.e, damage, source, { fromX: x, fromY: y });
    if (!h.e.dead) applyEffects(w, h.e, fx);
    n++;
  }
  return total;
}

export function chainHit(
  w: World,
  originX: number,
  originY: number,
  first: Enemy,
  chains: number,
  chainRange: number,
  damage: number,
  source: string,
  fx: HitEffects = {},
): number {
  let total = 0;
  const hit = new Set<number>();
  let cur: Enemy | null = first;
  let px = originX;
  let py = originY;
  for (let i = 0; i < chains && cur; i++) {
    hit.add(cur.id);
    total += damageEnemy(w, cur, damage, source, { fromX: px, fromY: py });
    if (!cur.dead) applyEffects(w, cur, fx);
    w.emit('arc', px, py, cur.x, cur.y);
    px = cur.x;
    py = cur.y;
    cur = w.nearestEnemy(px, py, chainRange, (e) => !hit.has(e.id));
  }
  return total;
}

/* ---------------------------------------------------------- projectiles */

export interface ProjectileSpec {
  kind: Projectile['kind'];
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  speed: number;
  damage: number;
  aoe?: number;
  pierce?: number;
  source: string;
  fx?: HitEffects;
}

export function spawnProjectile(w: World, spec: ProjectileSpec): Projectile {
  const n = normalize(spec.targetX - spec.x, spec.targetY - spec.y);
  const p: Projectile = {
    id: w.newId(),
    kind: spec.kind,
    x: spec.x,
    y: spec.y,
    vx: n.x * spec.speed,
    vy: n.y * spec.speed,
    tx: spec.targetX,
    ty: spec.targetY,
    damage: spec.damage,
    aoe: spec.aoe ?? 0,
    pierceLeft: spec.pierce ?? 0,
    hitIds: [],
    life: 6,
    source: spec.source,
    burnDps: spec.fx?.burnDps ?? 0,
    burnDuration: spec.fx?.burnDuration ?? 0,
    slow: spec.fx?.slow ?? 0,
    slowDuration: spec.fx?.slowDuration ?? 0,
    dead: false,
  };
  w.projectiles.push(p);
  return p;
}

export function updateProjectiles(w: World, dt: number): void {
  for (const p of w.projectiles) {
    if (p.dead) continue;
    p.life -= dt;
    const px = p.x;
    const py = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (p.life <= 0 || p.x < 0 || p.y < 0 || p.x > GRID_W || p.y > GRID_H) {
      if (p.aoe > 0) detonate(w, p);
      p.dead = true;
      continue;
    }

    if (p.aoe > 0) {
      // Lobbed shells fly to a fixed point and burst there.
      const rem = (p.tx - p.x) * p.vx + (p.ty - p.y) * p.vy;
      const remPrev = (p.tx - px) * p.vx + (p.ty - py) * p.vy;
      if (rem <= 0 && remPrev >= 0) {
        detonate(w, p);
        p.dead = true;
      }
      continue;
    }

    const list = w.enemiesInRadius(p.x, p.y, 0.45);
    for (const e of list) {
      if (e.dead || p.hitIds.includes(e.id)) continue;
      p.hitIds.push(e.id);
      damageEnemy(w, e, p.damage, p.source, { fromX: px, fromY: py });
      if (!e.dead) {
        applyEffects(w, e, {
          burnDps: p.burnDps,
          burnDuration: p.burnDuration,
          slow: p.slow,
          slowDuration: p.slowDuration,
        });
      }
      if (p.pierceLeft > 0) {
        p.pierceLeft--;
      } else {
        p.dead = true;
        break;
      }
    }
  }
}

function detonate(w: World, p: Projectile): void {
  w.emit('boom', p.x, p.y, p.aoe, 0);
  applyAoE(w, p.x, p.y, p.aoe, p.damage, p.source, {
    burnDps: p.burnDps,
    burnDuration: p.burnDuration,
    slow: p.slow,
    slowDuration: p.slowDuration,
  });
}

/* ------------------------------------------------------------ ground areas */

export function updateAreas(w: World, dt: number): void {
  for (const a of w.areas) {
    if (a.dead) continue;
    a.remaining -= dt;
    if (a.remaining <= 0) {
      a.dead = true;
      continue;
    }
    if (a.type === 'enemyFire') {
      if (dist2(a.x, a.y, w.warden.x, w.warden.y) <= a.radius * a.radius) {
        wardenAreaDamage(w, a.dps * dt);
      }
      continue;
    }
    const list = w.enemiesInRadius(a.x, a.y, a.radius);
    for (const e of list) {
      if (e.dead) continue;
      if (a.type === 'poison') {
        applyPoison(w, e, a.dps, 1.0, 3);
      } else {
        damageEnemy(w, e, a.dps * dt, a.source, { pure: true });
      }
    }
  }
}

/** Set by run.ts so ground fire routes through the Warden's mitigation rules. */
export let wardenAreaDamage: (w: World, amount: number) => void = () => {};
export function setAreaDamageHandler(fn: (w: World, amount: number) => void): void {
  wardenAreaDamage = fn;
}
