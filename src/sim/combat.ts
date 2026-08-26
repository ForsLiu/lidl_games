/**
 * Shared combat primitives used by both towers (Act I) and soul weapons
 * (Act II): projectiles, area damage, chains, cones and pierce lines.
 */

import { GRID_H, GRID_W } from './grid';
import {
  applyBurn,
  applyOnHit,
  applyPoison,
  applySlow,
  damageEnemy,
  type DamageOptions,
  type WardenDamageOptions,
} from './enemies';
// SPEC-V3 §3's composite splits. The cycle with `damagetypes.ts` (which imports
// `applyAoE` for Electric's inherent radius) is deliberate and safe: both sides
// are called from inside functions, neither is read at module evaluation.
import { applyDamageSplit } from './damagetypes';
import { dcos, dist2, normalize } from './math';
import type { Enemy, Projectile } from './types';
import { World } from './world';

export interface HitEffects {
  /** Weapon or tower key credited with any ailment this hit applies. */
  source?: string;
  burnDps?: number;
  burnDuration?: number;
  poisonDps?: number;
  poisonDuration?: number;
  poisonStacks?: number;
  slow?: number;
  slowDuration?: number;
  /**
   * SPEC-V3 §3 types and statuses this hit also applies, authored in /data as
   * a tower attack's `onHit` list. Threaded through `HitEffects` because that
   * is the one bundle every hit shape already carries — projectiles, cones,
   * lines, chains and blasts all funnel into `applyEffects`.
   */
  onHit?: readonly string[];
  /**
   * SPEC-V3 §3/§4: how this hit's damage is *typed* — `{normal: 1, electric: 1}`
   * for the Electric tower. Rides in the same bundle as `onHit` and for the
   * same reason: a split that only one of the seven hit shapes honoured is the
   * silent drop QA found in m19c's cone case, one layer down.
   */
  ratio?: Readonly<Record<string, number>> | null;
}

/**
 * One hit's damage, typed if the attack says how. Every shape below goes
 * through this rather than calling `damageEnemy` itself, so a composite tower
 * cannot lose its types by being fired out of the wrong `kind`.
 */
export function dealHit(
  w: World,
  e: Enemy,
  amount: number,
  source: string,
  fx: HitEffects,
  opts: DamageOptions,
): number {
  if (!fx.ratio) return damageEnemy(w, e, amount, source, opts);
  return applyDamageSplit(w, e, fx.ratio, amount, source, opts);
}

export function applyEffects(w: World, e: Enemy, fx: HitEffects): void {
  if (fx.burnDps && fx.burnDuration) applyBurn(w, e, fx.burnDps, fx.burnDuration, fx.source);
  if (fx.poisonDps && fx.poisonDuration) {
    applyPoison(w, e, fx.poisonDps, fx.poisonDuration, fx.poisonStacks ?? 3, fx.source);
  }
  if (fx.slow && fx.slowDuration) applySlow(w, e, fx.slow, fx.slowDuration);
  if (fx.onHit) for (const k of fx.onHit) applyOnHit(w, e, k, fx.source ?? k);
}

/* ------------------------------------------------------------- targeting */

/**
 * Act I towers shoot the enemy nearest the Core (classic "first" targeting).
 *
 * Ties — and they are common, since the flow field is per tile — go to whichever
 * enemy the bucket scan reached first. That is deterministic (the buckets are
 * rebuilt in a fixed order each tick) and it is what every balance number in
 * the repo was measured against: making ties break on entity id instead, which
 * this comment used to claim, focuses fire hard enough to take `venom_spore`
 * from 0/5 to 5/5 on A4's T3 clause. `targetFirstN` matches it deliberately.
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

/**
 * The `n` enemies nearest the Core within range, best first — "first"
 * targeting for a tower firing more than one shot (SPEC-V3 §4 gives Poison a
 * second projectile at upgrade 2). Selection rather than a sort: `n` is 2 in
 * all shipped content and the candidate list is the whole horde in range.
 *
 * Spending all shots on one enemy would make the milestone worthless against
 * anything but a boss, so the shots spread; a caller wanting them stacked (§4
 * spells Arrow's out as "same path") does not ask for targets twice.
 */
export function targetFirstN(w: World, x: number, y: number, range: number, n: number): Enemy[] {
  if (n <= 1) {
    const one = targetFirst(w, x, y, range);
    return one ? [one] : [];
  }
  const list = w.enemiesInRadius(x, y, range);
  const picked: Enemy[] = [];
  const keys: number[] = [];
  for (const e of list) {
    const d = w.grid.distAt(Math.floor(e.x), Math.floor(e.y), e.flying || e.ghosting);
    const key = d < 0 ? 1e9 + dist2(e.x, e.y, x, y) : d;
    // Insertion into a list of at most `n`. Strictly-greater, so a tie leaves
    // the enemy the bucket scan reached first in front — the same rule
    // `targetFirst` uses, which is what makes this tower's primary target the
    // same one before and after its second projectile unlocks (QA, m20b).
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

/**
 * Candidate directions/targets are sampled rather than exhaustive: these
 * searches are O(candidates x targets) and run against a 350-strong horde.
 * Striding the list keeps the choice representative at a fraction of the cost.
 */
const MAX_CANDIDATES = 20;

function sampleCandidates(list: readonly Enemy[]): Enemy[] {
  if (list.length <= MAX_CANDIDATES) return list as Enemy[];
  const stride = Math.ceil(list.length / MAX_CANDIDATES);
  const out: Enemy[] = [];
  for (let i = 0; i < list.length; i += stride) out.push(list[i]);
  return out;
}

/** Direction with the most enemies inside a cone of the given half-angle. */
export function bestConeDirection(
  w: World,
  x: number,
  y: number,
  range: number,
  halfAngle: number,
): { x: number; y: number } | null {
  const list = w.enemiesInRadius(x, y, range).slice();
  if (list.length === 0) return null;
  const cosHalf = dcos(halfAngle);
  let best: { x: number; y: number } | null = null;
  let bestCount = 0;
  for (const candidate of sampleCandidates(list)) {
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
  const list = w.enemiesInRadius(x, y, range).slice();
  if (list.length === 0) return null;
  const r2 = clusterRadius * clusterRadius;
  let best: Enemy | null = null;
  let bestCount = -1;
  for (const c of sampleCandidates(list)) {
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
  const list = w.enemiesInRadius(x, y, range).slice();
  if (list.length === 0) return null;
  let best: { x: number; y: number } | null = null;
  let bestCount = 0;
  for (const candidate of sampleCandidates(list)) {
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

/**
 * Blast damage. Like pierce, an area hit that pays full damage to every body it
 * touches scales with horde size and drowns out every other weapon (SPEC A5),
 * so past the first few targets each additional one takes less. Closest to the
 * centre are hit hardest, which is also what a blast should feel like.
 */
export interface AoEOptions {
  /**
   * An enemy this blast is *aimed at* rather than merely caught by. It takes
   * the first, full-scale hit and is skipped by the sweep, so it can neither
   * be pushed down the falloff by whoever happens to share its tile nor be
   * missed entirely because the spatial buckets have not seen it yet — a
   * burrower is never in them at all, and anything spawned after this tick's
   * `rebuildBuckets` is not either.
   */
  primary?: Enemy;
  /** Damage options forwarded to every hit this blast makes. */
  damage?: DamageOptions;
}

export function applyAoE(
  w: World,
  x: number,
  y: number,
  radius: number,
  damage: number,
  source: string,
  fx: HitEffects = {},
  opts: AoEOptions = {},
): number {
  const list = w.enemiesInRadius(x, y, radius).slice();
  const primary = opts.primary;
  if (list.length === 0 && !primary) return 0;
  const cfg = w.content.weapons;
  if (list.length > cfg.aoeFullTargets) {
    list.sort((a, b) => dist2(x, y, a.x, a.y) - dist2(x, y, b.x, b.y) || a.id - b.id);
  }
  let total = 0;
  let hit = 0;
  let scale = 1;
  const hitOpts: DamageOptions = { fromX: x, fromY: y, ...opts.damage };
  const strike = (e: Enemy): void => {
    total += dealHit(w, e, damage * scale, source, fx, hitOpts);
    if (!e.dead) applyEffects(w, e, fx);
    hit++;
    if (hit >= cfg.aoeFullTargets) scale = Math.max(cfg.aoeFalloffFloor, scale * cfg.aoeFalloff);
  };
  if (primary && !primary.dead) strike(primary);
  for (const e of list) {
    if (e.dead || e === primary) continue;
    strike(e);
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
  const inCone: Enemy[] = [];
  for (const e of w.enemiesInRadius(x, y, range)) {
    if (e.dead) continue;
    const n = normalize(e.x - x, e.y - y);
    if (n.x === 0 && n.y === 0 || n.x * dx + n.y * dy >= cosHalf) inCone.push(e);
  }
  if (inCone.length === 0) return 0;
  // Same many-target damping as blasts: a continuous cone that paid full
  // damage to every body inside it out-scaled every other weapon (SPEC A5).
  const cfg = w.content.weapons;
  if (inCone.length > cfg.aoeFullTargets) {
    inCone.sort((a, b) => dist2(x, y, a.x, a.y) - dist2(x, y, b.x, b.y) || a.id - b.id);
  }
  let total = 0;
  let hit = 0;
  let scale = 1;
  for (const e of inCone) {
    if (e.dead) continue;
    total += dealHit(w, e, damage * scale, source, fx, { fromX: x, fromY: y });
    if (!e.dead) applyEffects(w, e, fx);
    hit++;
    if (hit >= cfg.aoeFullTargets) scale = Math.max(cfg.aoeFalloffFloor, scale * cfg.aoeFalloff);
  }
  return total;
}

export interface LineOptions {
  /**
   * The enemy the line was *aimed at*. It takes the first, full-scale hit and
   * is skipped by the sweep — same rule as a blast's `primary`, and for the
   * same reason: SPEC-V3 §4's Arrow shoots the enemy nearest the Core and then
   * carries on through whoever is behind it, so the target it picked must not
   * be demoted by a body that happens to stand closer to the tower, nor be
   * missed because the spatial buckets have not seen it (Q72).
   */
  primary?: Enemy;
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
  opts: LineOptions = {},
): number {
  const falloff = w.content.weapons.pierceFalloff;
  const floor = w.content.weapons.pierceFalloffFloor;
  let total = 0;
  let n = 0;
  let scale = 1;
  const strike = (e: Enemy): void => {
    total += dealHit(w, e, damage * scale, source, fx, { fromX: x, fromY: y });
    if (!e.dead) applyEffects(w, e, fx);
    n++;
    // A shot that pierces everything would otherwise scale with horde size and
    // dominate every other weapon (SPEC A5), so each successive hit lands softer.
    scale = Math.max(floor, scale * falloff);
  };
  const primary = opts.primary;
  if (primary && !primary.dead && maxHits > 0) strike(primary);
  // Only now: the sweep below is a second spatial query and a sort, and a shot
  // with no pierce left — every V2-authored single-target tower, firing twice a
  // second — has nothing to spend them on.
  if (n >= maxHits) return total;

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
  for (const h of hits) {
    if (n >= maxHits) break;
    if (h.e.dead || h.e === primary) continue;
    strike(h.e);
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
    total += dealHit(w, cur, damage, source, fx, { fromX: px, fromY: py });
    if (!cur.dead) applyEffects(w, cur, fx);
    w.emit('arc', px, py, cur.x, cur.y);
    px = cur.x;
    py = cur.y;
    cur = w.nearestEnemy(px, py, chainRange, (e) => !hit.has(e.id));
  }
  return total;
}

/* ---------------------------------------------------------- projectiles */

/** Shared so every projectile without riders points at one frozen array. */
const EMPTY_ON_HIT: readonly string[] = [];

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
    onHit: spec.fx?.onHit ?? EMPTY_ON_HIT,
    ratio: spec.fx?.ratio ?? null,
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
      const fx = projectileEffects(p);
      dealHit(w, e, p.damage, p.source, fx, { fromX: px, fromY: py });
      if (!e.dead) applyEffects(w, e, fx);
      if (p.pierceLeft > 0) {
        p.pierceLeft--;
      } else {
        p.dead = true;
        break;
      }
    }
  }
}

/** The riders a projectile carries, rebuilt at the moment it lands. */
function projectileEffects(p: Projectile): HitEffects {
  return {
    source: p.source,
    burnDps: p.burnDps,
    burnDuration: p.burnDuration,
    slow: p.slow,
    slowDuration: p.slowDuration,
    onHit: p.onHit,
    ratio: p.ratio,
  };
}

function detonate(w: World, p: Projectile): void {
  w.emit('boom', p.x, p.y, p.aoe, 0);
  applyAoE(w, p.x, p.y, p.aoe, p.damage, p.source, projectileEffects(p));
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
    // Boss slam rings grow and damage on their leading edge; boss.ts owns them.
    if (a.type === 'bossSlam') continue;
    if (a.type === 'enemyFire') {
      if (dist2(a.x, a.y, w.warden.x, w.warden.y) <= a.radius * a.radius) {
        wardenAreaDamage(w, a.dps * dt);
      }
      continue;
    }
    // Ground fields get the same many-target damping as blasts and cones.
    const list = w.enemiesInRadius(a.x, a.y, a.radius).slice();
    if (list.length === 0) continue;
    const cfg = w.content.weapons;
    if (list.length > cfg.aoeFullTargets) {
      list.sort((p, q) => dist2(a.x, a.y, p.x, p.y) - dist2(a.x, a.y, q.x, q.y) || p.id - q.id);
    }
    let hit = 0;
    let scale = 1;
    for (const e of list) {
      if (e.dead) continue;
      if (a.type === 'poison') {
        applyPoison(w, e, a.dps * scale, 1.0, 3, a.source);
      } else {
        damageEnemy(w, e, a.dps * scale * dt, a.source, { pure: true, dot: true });
      }
      hit++;
      if (hit >= cfg.aoeFullTargets) scale = Math.max(cfg.aoeFalloffFloor, scale * cfg.aoeFalloff);
    }
  }
}

/** Set by run.ts so ground fire routes through the Warden's mitigation rules. */
export let wardenAreaDamage: (w: World, amount: number, opts?: WardenDamageOptions) => void = () => {};
export function setAreaDamageHandler(
  fn: (w: World, amount: number, opts?: WardenDamageOptions) => void,
): void {
  wardenAreaDamage = fn;
}
