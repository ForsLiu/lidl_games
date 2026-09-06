/**
 * Shared combat primitives used by both towers (Act I) and wielded attacks
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
import { applyDamageSplit, applyDamageType } from './damagetypes';
import { applyTowerLifesteal } from './cores';
import { dcos, dist2, normalize } from './math';
import type { Enemy, GroundArea, Projectile, TowerClassBonus } from './types';
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
  /**
   * SPEC-FINAL §4.2's target-conditional tower passives (p6d). Set only by
   * `fireTower` (towers.ts) and carried by the projectiles it spawns, so a
   * class Active or a wielded VS attack passing through the same helpers is
   * unaffected — every one of the three clauses says "all towers".
   */
  towerBonus?: TowerClassBonus | null;
}

/**
 * One hit's damage, typed if the attack says how. Every shape below goes
 * through this rather than calling `damageEnemy` itself, so a composite tower
 * cannot lose its types by being fired out of the wrong `kind` — which is also
 * what makes it the one place §4.2's tower passives need to be read.
 */
export function dealHit(
  w: World,
  e: Enemy,
  amount: number,
  source: string,
  fx: HitEffects,
  opts: DamageOptions,
): number {
  const bonus = fx.towerBonus;
  let amt = amount;
  if (bonus) {
    // §4.2 Pyro / Cryomancer: "+10% damage vs Burning enemies" / "vs
    // frosted/frozen". Read off the target at the moment of the hit, which is
    // why they cannot ride the `towerDamage` (towers.ts) chokepoint the
    // unconditional tower passives do.
    if (bonus.vsBurningPct > 0 && e.dots.some((d) => d.type === 'burning')) amt *= 1 + bonus.vsBurningPct;
    if (bonus.vsChilledPct > 0 && (e.frostRemaining > 0 || e.frozenRemaining > 0)) amt *= 1 + bonus.vsChilledPct;
  }
  const dealt = fx.ratio
    ? applyDamageSplit(w, e, fx.ratio, amt, source, opts)
    : damageEnemy(w, e, amt, source, opts);
  // §4.2 Stormcaller: "all towers deal +10% of their damage as extra
  // Electric" — a second, typed hit off the damage that just landed, so it
  // inherits Electric's own inherent r0.8 blast (§3). Deliberately not folded
  // into the returned total: `damageDealt`/lifesteal credit the attack, and
  // the extra bolt already credits itself through `damageEnemy`.
  if (bonus && bonus.extraElectricPct > 0 && dealt > 0 && !e.dead) {
    applyDamageType(w, e, 'electric', dealt * bonus.extraElectricPct, source, {
      fromX: opts.fromX,
      fromY: opts.fromY,
    });
  }
  return dealt;
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
 * from 0/5 to 5/5 on A4's T3 clause.
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
  const cfg = w.content.towers;
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
  const cfg = w.content.towers;
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
  const falloff = w.content.towers.pierceFalloff;
  const floor = w.content.towers.pierceFalloffFloor;
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
  /** §5.2 Mortar @3: leave a ground-fire patch on impact — see `detonate`. */
  groundBurn?: boolean;
  groundBurnSeconds?: number;
  /** The structure firing this shot, credited with `damageDealt` on landing. */
  structureId: number;
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
    groundBurn: spec.groundBurn ?? false,
    groundBurnSeconds: spec.groundBurnSeconds ?? 0,
    structureId: spec.structureId,
    towerBonus: spec.fx?.towerBonus ?? null,
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
      const dealt = dealHit(w, e, p.damage, p.source, fx, { fromX: px, fromY: py });
      const owner = w.structureById.get(p.structureId);
      if (owner) {
        owner.damageDealt += dealt;
        // p-core-b: `pierce`'s lifesteal lands here, not in `updateTowers`
        // (towers.ts) — see `applyTowerLifesteal`'s doc comment.
        applyTowerLifesteal(w, owner, dealt);
      }
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
    towerBonus: p.towerBonus,
  };
}

function detonate(w: World, p: Projectile): void {
  w.emit('boom', p.x, p.y, p.aoe, 0);
  const dealt = applyAoE(w, p.x, p.y, p.aoe, p.damage, p.source, projectileEffects(p));
  const owner = w.structureById.get(p.structureId);
  if (owner) {
    owner.damageDealt += dealt;
    // p-core-b: `lob`'s lifesteal lands here, not in `updateTowers` (towers.ts).
    applyTowerLifesteal(w, owner, dealt);
  }
  if (p.groundBurn) spawnBurningPatch(w, p);
}

/**
 * §5.2 Mortar @3: "shells leave a burning patch" — a ground-fire hazard sized
 * to the shell's own blast radius, reusing the generic ground-area tick
 * (`updateAreas`) the Cinderling's fire trail already drives (`'burn'` is not
 * `'poison'`/`'enemyFire'`/`'bossSlam'`, so it falls into the plain
 * damage-over-time branch). The magnitude is the Burning row's own authored
 * dps (`damagetypes.json`) rather than an invented number — SPEC-FINAL names
 * no dps for the patch, so this is the least-invented default (Q112).
 */
function spawnBurningPatch(w: World, p: Projectile): void {
  const dps = w.content.damageTypeByKey.get('burning')?.dps ?? 1;
  w.areas.push({
    id: w.newId(),
    x: p.x,
    y: p.y,
    radius: p.aoe,
    dps,
    remaining: p.groundBurnSeconds,
    type: 'burn',
    source: p.source,
    acc: 0,
    accTime: 0,
    dead: false,
  });
}

/* ------------------------------------------------------------ ground areas */

export function updateAreas(w: World, dt: number): void {
  for (const a of w.areas) {
    if (a.dead) continue;
    a.remaining -= dt;
    if (a.remaining <= 0) {
      a.dead = true;
      // fb161: the final partial interval is paid, never dropped — a field
      // shorter than one interval holds its whole total in this bank.
      if (a.type === 'enemyFire') flushGroundFire(w, a, 0);
      continue;
    }
    // Boss slam rings grow and damage on their leading edge; boss.ts owns them.
    if (a.type === 'bossSlam') continue;
    if (a.type === 'enemyFire') {
      if (dist2(a.x, a.y, w.warden.x, w.warden.y) <= a.radius * a.radius) {
        accrueGroundFire(w, a, dt);
      }
      flushGroundFire(w, a, w.content.damageTypes.dotTickInterval);
      continue;
    }
    // Ground fields get the same many-target damping as blasts and cones.
    const list = w.enemiesInRadius(a.x, a.y, a.radius).slice();
    if (list.length === 0) continue;
    const cfg = w.content.towers;
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


/**
 * fb161: ground fire pays the Warden on `dotTickInterval`, not every frame.
 *
 * `updateAreas` called `wardenAreaDamage` once per frame with `a.dps * dt`, and
 * `damageWarden` emits `wardenhit` on every call, so standing in a Cinderling's
 * trail sprayed 60 damage numbers a second — the owner's `dot-tick-cadence`
 * complaint on a mechanism fb152 deliberately left alone. fb152 was right that
 * a zone is not a §3 DoT instance and has no per-target stack to bank against;
 * the answer is to bank on the **field**, which is the thing with a lifetime.
 *
 * Two details carried over from fb152 rather than rediscovered:
 *  - the untouchable window is applied **per frame**, not at the flush.
 *    `damageWarden` drops a hit outright while dashing, reforming or in god
 *    mode, so pricing a banked interval at the flush instant would let a 0.2 s
 *    dash erase a whole 0.25 s including damage accrued before it began. The
 *    flush passes `preGated` for the same reason.
 *  - `accTime` advances only while the Warden is *in* the field, so a player
 *    dipping in and out is billed per 0.25 s of exposure rather than per 0.25 s
 *    of wall clock, and the emit rate stays at or under 4/s either way.
 *
 * The raw amount is banked and mitigated once at the flush, where the per-frame
 * path mitigated each frame. Identical while armor holds still, which it does
 * across 0.25 s for everything but an armor-shred landing mid-window; the
 * difference there is a fraction of one interval's damage and is the price of
 * not emitting sixty numbers a second.
 *
 * The three sources fb152 left at 60 Hz that this does *not* touch — the
 * enemy-facing fire field below, Contagious Flame's touch damage and the Time
 * core's drain — all damage through `damageEnemy(..., { dot: true })`, which
 * emits nothing. They have no symptom, and banking them would move when
 * enemies die, re-rolling every run hash and every balance reading taken since
 * P10 for no visible gain (QUESTIONS Q189).
 */
function accrueGroundFire(w: World, a: GroundArea, dt: number): void {
  a.accTime += dt;
  if (!wardenGroundFireBlocked(w)) a.acc += a.dps * dt;
}

/** Pays the bank if it has reached `interval` (0 forces it, for an expiring field). */
function flushGroundFire(w: World, a: GroundArea, interval: number): void {
  if (a.accTime < interval - GROUND_FIRE_EPS) return;
  if (a.accTime <= 0) return;
  const banked = a.acc;
  a.acc = 0;
  a.accTime = 0;
  if (banked > 0) wardenAreaDamage(w, banked, { preGated: true });
}

/**
 * The same float slack `tickDots` uses: `accTime` is a sum of `1/60`s, so a
 * whole number of intervals lands a few ULPs short of the interval and a strict
 * `>=` would defer every flush by one extra frame, forever.
 */
const GROUND_FIRE_EPS = 1e-9;

/**
 * Set by run.ts alongside the damage handler, so this file can ask the Warden's
 * untouchable-window question without importing run.ts (which imports it).
 */
export let wardenGroundFireBlocked: (w: World) => boolean = () => false;
export function setWardenBlockedPredicate(fn: (w: World) => boolean): void {
  wardenGroundFireBlocked = fn;
}

/** Set by run.ts so ground fire routes through the Warden's mitigation rules. */
export let wardenAreaDamage: (w: World, amount: number, opts?: WardenDamageOptions) => void = () => {};
export function setAreaDamageHandler(
  fn: (w: World, amount: number, opts?: WardenDamageOptions) => void,
): void {
  wardenAreaDamage = fn;
}
