/**
 * Enemy lifecycle: spawning, pathing, per-trait behaviour, damage and death.
 * Shared by both acts (SPEC 6); Act II applies a stat overlay at spawn time.
 */

import type { EnemyDef } from './content';
import { GRID_H, GRID_W } from './grid';
import { clamp, dcos, dist, dist2, dsin, normalize } from './math';
import { damageTakenMul } from './stats';
import type { Enemy, Structure } from './types';
import { World } from './world';

/**
 * Trait lookups run several times per enemy per tick, and `traits.includes`
 * is a string scan. Each def's traits are folded into a bitmask once and
 * cached on the enemy.
 */
export const TRAIT = {
  flying: 1 << 0,
  healer: 1 << 1,
  buffer: 1 << 2,
  empower: 1 << 3,
  stomp: 1 << 4,
  fireTrail: 1 << 5,
  ranged: 1 << 6,
  charges: 1 << 7,
  phases: 1 << 8,
  burrows: 1 << 9,
  splits: 1 << 10,
  explodes: 1 << 11,
  elite: 1 << 12,
  boss: 1 << 13,
  finalBoss: 1 << 14,
  slowImmune: 1 << 15,
  burnImmune: 1 << 16,
  pack: 1 << 17,
  structureBreaker: 1 << 18,
} as const;

const flagCache = new Map<number, number>();

export function traitFlags(def: EnemyDef): number {
  const hit = flagCache.get(def.id);
  if (hit !== undefined) return hit;
  let f = 0;
  for (const t of def.traits) {
    const bit = (TRAIT as Record<string, number>)[t];
    if (bit) f |= bit;
  }
  flagCache.set(def.id, f);
  return f;
}

export interface SpawnOptions {
  hpMul?: number;
  elite?: boolean;
  gate?: number;
  /** Skip the Act II stat overlay (used when Act I spawns during a wave). */
  overlay?: boolean;
}

export function makeEnemy(w: World, def: EnemyDef, x: number, y: number, opts: SpawnOptions = {}): Enemy {
  const flags = traitFlags(def);
  const overlay = opts.overlay ?? w.huntsWarden;
  const sp = w.content.spawns;
  let hp = def.hp * (opts.hpMul ?? 1) * (1 + w.mods.enemyHp);
  let speed = def.speed * (1 + w.mods.enemySpeed);
  if (overlay) {
    // SPEC 5.1's "HP x 0.6" overlay is relative to the statline Act I ended on,
    // not to the wave-1 roster: Nightfall is the climax, so its fodder must not
    // arrive 7x weaker than the wave the player just cleared. The carry is its
    // own data knob so Act I difficulty can be tuned without moving Act II.
    hp *= sp.hpOverlay * sp.actIICarry;
    speed *= sp.speedOverlay;
  }
  const isBoss = (flags & TRAIT.boss) !== 0;
  if (isBoss) hp *= 1 + w.mods.bossHp;
  if ((flags & TRAIT.finalBoss) !== 0) {
    // SPEC 5.5: "15,000 HP x tier multiplier". The only tier multiplier the
    // spec defines is SPEC 8.3's reward scale, so the boss uses that.
    hp *= 1 + w.content.modifiers.tierRewardPerStep * (w.cfg.tier - 1);
  }

  const e: Enemy = {
    id: w.newId(),
    defId: def.id,
    def,
    x,
    y,
    hp,
    maxHp: hp,
    speed,
    radius: def.radius,
    gate: opts.gate ?? 0,
    elite: opts.elite ?? (flags & TRAIT.elite) !== 0,
    boss: isBoss,
    flying: (flags & TRAIT.flying) !== 0,
    fx: 0,
    fy: 1,
    armor: def.armor ?? 0,
    armorShred: 0,
    slowRemaining: 0,
    slowAmount: 0,
    burnRemaining: 0,
    burnDps: 0,
    burnSource: '',
    poison: [],
    buffRemaining: 0,
    buffSpeed: 0,
    buffPower: 0,
    attackCooldown: 0,
    phaseRemaining: 0,
    phaseCooldown: def.phasePeriod ?? 0,
    ghosting: (flags & TRAIT.burrows) !== 0,
    submerged: (flags & TRAIT.burrows) !== 0,
    flags,
    sepX: 0,
    sepY: 0,
    chargeState: 0,
    chargeTimer: 0,
    chargeCooldown: def.chargeCooldown ?? 0,
    chargeVx: 0,
    chargeVy: 0,
    abilityTimer: 0,
    attackingStructure: 0,
    dead: false,
    bossPhase: 0,
    bossTimer: 0,
    bossAction: 0,
    spawnedAt: w.tick,
  };
  return e;
}

export function spawnEnemy(w: World, key: string, x: number, y: number, opts: SpawnOptions = {}): Enemy | null {
  const def = w.content.enemyByKey.get(key);
  if (!def) return null;
  const e = makeEnemy(w, def, x, y, opts);
  w.addEnemy(e);
  if ((traitFlags(def) & TRAIT.pack) !== 0) {
    const n = (def.packSize ?? 1) - 1;
    for (let i = 0; i < n; i++) {
      const a = (i + 1) * 1.5;
      const ex = clamp(x + dcos(a) * 0.6, 1, GRID_W - 2);
      const ey = clamp(y + dsin(a) * 0.6, 1, GRID_H - 2);
      w.addEnemy(makeEnemy(w, def, ex, ey, opts));
    }
  }
  return e;
}

/* ------------------------------------------------------------------ damage */

/** SPEC-V3 §2: ailment damage ignores the Warden's armor too. */
export interface WardenDamageOptions {
  dot?: boolean;
}

export interface DamageOptions {
  fromX?: number;
  fromY?: number;
  /**
   * Bypass the *trait* mitigations — Bulwark's flat cut and Shellback's front
   * shield. Deliberately orthogonal to `dot`: a flag that bypassed both traits
   * and armor would make `dot` unobservable, since every caller that wants one
   * today also wants the other.
   */
  pure?: boolean;
  /**
   * Ailment damage, which SPEC-V3 §2 says ignores armor: "ailment (dot) damage
   * ignores armor unless stated". Burning's stated exception is its armor
   * *shred*, which lowers the target's armor for every other source rather
   * than piercing armor here.
   */
  dot?: boolean;
}

/**
 * SPEC-V3 §2: the armor an enemy actually defends with — its sheet value less
 * whatever Burning has shredded off it. Uncapped below zero (floored at −100 by
 * `effectiveArmor`, QUESTIONS Q44).
 */
export function enemyArmor(e: Enemy): number {
  return e.armor - e.armorShred;
}

/** SPEC-V3 §3: Burning strips armor points. Shred lasts the target's lifetime. */
export function shredArmor(e: Enemy, points: number): void {
  e.armorShred += points;
}

/** Apply damage, returning the amount actually dealt. */
export function damageEnemy(
  w: World,
  e: Enemy,
  amount: number,
  source: string,
  opts: DamageOptions = {},
): number {
  if (e.dead || amount <= 0) return 0;
  const def = e.def as EnemyDef;
  let dmg = amount;

  if (!opts.dot) dmg *= damageTakenMul(enemyArmor(e));

  if (!opts.pure) {
    if (def.flatReduction) dmg *= 1 - def.flatReduction;
    if (def.frontReduction && opts.fromX !== undefined && opts.fromY !== undefined) {
      // Hit is "frontal" if the attacker sits in the hemisphere the enemy faces.
      const dx = opts.fromX - e.x;
      const dy = opts.fromY - e.y;
      if (dx * e.fx + dy * e.fy > 0) dmg *= 1 - def.frontReduction;
    }
  }

  e.hp -= dmg;
  w.damageByWeapon[source] = (w.damageByWeapon[source] ?? 0) + dmg;
  w.damageTotal += dmg;
  w.emit('hit', e.x, e.y, dmg, e.id);

  if (w.derived.leech > 0 && w.huntsWarden) {
    w.warden.leechAccumulator += dmg * w.derived.leech;
  }

  if (e.hp <= 0) killEnemy(w, e, source);
  return dmg;
}

export function killEnemy(w: World, e: Enemy, source: string): void {
  if (e.dead) return;
  e.dead = true;
  w.deadEnemies = true;
  w.kills++;
  const def = e.def as EnemyDef;
  w.emit('death', e.x, e.y, def.id, 0);

  if (!w.huntsWarden) {
    const gold = Math.round(def.bounty * (1 + w.derived.goldFind) + w.derived.goldPerKill);
    w.gold += gold;
    w.goldEarned += gold;
  } else {
    if (def.gem > 0) dropGem(w, e.x, e.y, def.gem);
  }

  if ((e.flags & TRAIT.splits) !== 0) {
    const child = w.content.enemyById.get(def.splitInto ?? 1);
    if (child) {
      for (let i = 0; i < (def.splitCount ?? 2); i++) {
        const off = i === 0 ? -0.4 : 0.4;
        w.addEnemy(
          makeEnemy(w, child, clamp(e.x + off, 1, GRID_W - 2), clamp(e.y + off, 1, GRID_H - 2), {
            overlay: w.huntsWarden,
            gate: e.gate,
          }),
        );
      }
    }
  }

  if ((e.flags & TRAIT.finalBoss) !== 0) {
    w.bossKilled = true;
    w.bossKillTime = w.act2Time;
  }

  onEnemyKilledForDrops(w, e, def);
  void source;
}

/** Overridden by loot.ts at import time to avoid a cycle; default is a no-op. */
export let onEnemyKilledForDrops: (w: World, e: Enemy, def: EnemyDef) => void = () => {};
export function setDropHandler(fn: (w: World, e: Enemy, def: EnemyDef) => void): void {
  onEnemyKilledForDrops = fn;
}

export function dropGem(w: World, x: number, y: number, value: number): void {
  w.gems.push({
    id: w.newId(),
    x,
    y,
    value,
    vx: 0,
    vy: 0,
    life: w.content.spawns.gemLifetimeSeconds,
    dead: false,
  });
}

/* ---------------------------------------------------------------- ailments */

export function applySlow(w: World, e: Enemy, amount: number, duration: number): void {
  if ((e.flags & TRAIT.slowImmune) !== 0) return;
  const scaled = clamp(amount * w.derived.slowPotencyMul * w.derived.ailmentMul, 0, 0.9);
  if (scaled >= e.slowAmount || e.slowRemaining <= 0) {
    e.slowAmount = scaled;
    e.slowRemaining = Math.max(e.slowRemaining, duration);
  } else {
    e.slowRemaining = Math.max(e.slowRemaining, duration);
  }
}

export function applyBurn(
  w: World,
  e: Enemy,
  dps: number,
  duration: number,
  source = 'burn',
): void {
  if ((e.flags & TRAIT.burnImmune) !== 0) return;
  const scaled = dps * w.derived.burnDamageMul * w.derived.ailmentMul;
  if (scaled >= e.burnDps) {
    e.burnDps = scaled;
    e.burnSource = source;
  }
  e.burnRemaining = Math.max(e.burnRemaining, duration);
}

export function applyPoison(
  w: World,
  e: Enemy,
  dps: number,
  duration: number,
  maxStacks: number,
  source = 'poison',
): void {
  const scaled = dps * w.derived.ailmentMul;
  if (e.poison.length >= maxStacks) {
    // Refresh the shortest stack rather than growing past the cap.
    let idx = 0;
    for (let i = 1; i < e.poison.length; i++) {
      if (e.poison[i].remaining < e.poison[idx].remaining) idx = i;
    }
    e.poison[idx].remaining = duration;
    e.poison[idx].dps = scaled;
    e.poison[idx].source = source;
    return;
  }
  e.poison.push({ remaining: duration, dps: scaled, source });
}

function tickTimers(w: World, e: Enemy, dt: number): void {
  if (e.attackCooldown > 0) e.attackCooldown -= dt;
  if (e.slowRemaining > 0) {
    e.slowRemaining -= dt;
    if (e.slowRemaining <= 0) e.slowAmount = 0;
  }
  if (e.burnRemaining > 0) {
    e.burnRemaining -= dt;
    // Ailment damage is booked against the weapon that applied it, so A5 sees
    // the true share of each weapon rather than a generic "burn" bucket.
    damageEnemy(w, e, e.burnDps * dt, e.burnSource || 'burn', { pure: true, dot: true });
    if (e.dead) return;
    if (e.burnRemaining <= 0) e.burnDps = 0;
  }
  if (e.poison.length > 0) {
    let expired = false;
    for (const p of e.poison) {
      p.remaining -= dt;
      if (p.remaining > 0) damageEnemy(w, e, p.dps * dt, p.source || 'poison', { pure: true, dot: true });
      else expired = true;
      if (e.dead) break;
    }
    if (expired) e.poison = e.poison.filter((p) => p.remaining > 0);
  }
  if (e.buffRemaining > 0) {
    e.buffRemaining -= dt;
    if (e.buffRemaining <= 0) {
      e.buffSpeed = 0;
      e.buffPower = 0;
    }
  }
}

export function effectiveSpeed(e: Enemy): number {
  return e.speed * (1 - e.slowAmount) * (1 + e.buffSpeed);
}

/* ----------------------------------------------------------------- update */

const scratch: Enemy[] = [];

export function updateEnemies(w: World, dt: number): void {
  const sp = w.content.spawns;
  const target = w.targetPoint();
  const huntWarden = w.huntsWarden;

  for (const e of w.enemies) {
    if (e.dead) continue;
    const def = e.def as EnemyDef;

    tickTimers(w, e, dt);
    if (e.dead) continue;

    updatePhasing(w, e, def, dt);
    updateAbilities(w, e, def, dt, huntWarden);
    if (e.dead) continue;

    // The final boss has its own script (M6); it falls through to normal
    // chase movement whenever the script has nothing to say this tick.
    if ((e.flags & TRAIT.finalBoss) !== 0 && bossUpdate(w, e, dt)) continue;

    moveEnemy(w, e, def, dt, target);

    // Reaching the objective.
    if (huntWarden) {
      const reach = e.radius + sp.contactPadding;
      if (dist2(e.x, e.y, w.warden.x, w.warden.y) <= reach * reach) {
        contactWarden(w, e, def);
      }
    } else if (w.grid.tile[w.grid.idx(Math.floor(e.x), Math.floor(e.y))] === 3) {
      leakIntoCore(w, e, def);
    }
  }
}

function updatePhasing(w: World, e: Enemy, def: EnemyDef, dt: number): void {
  if ((e.flags & TRAIT.burrows) !== 0) {
    // SPEC 6 #12: a Burrower tunnels *under* the field and surfaces near its
    // target. Underground it cannot be shot, which is what makes it the
    // counter to a turtle (SPEC A7).
    const target = w.targetPoint();
    const surfaceAt = w.content.spawns.burrowSurfaceDistance;
    if (e.submerged && dist2(e.x, e.y, target.x, target.y) <= surfaceAt * surfaceAt) {
      e.submerged = false;
      e.ghosting = false;
      unstick(w, e);
      w.emit('surface', e.x, e.y, 0, 0);
    }
    e.ghosting = e.submerged;
    return;
  }
  if ((e.flags & TRAIT.phases) === 0) return;
  if (e.phaseRemaining > 0) {
    e.phaseRemaining -= dt;
    e.ghosting = true;
    if (e.phaseRemaining <= 0) {
      e.ghosting = false;
      e.phaseCooldown = def.phasePeriod ?? 6;
      // Never surface inside terrain: nudge to the nearest open tile.
      unstick(w, e);
    }
  } else {
    e.phaseCooldown -= dt;
    if (e.phaseCooldown <= 0) {
      e.phaseRemaining = def.phaseDuration ?? 2;
      e.ghosting = true;
    }
  }
}

function unstick(w: World, e: Enemy): void {
  const tx = Math.floor(e.x);
  const ty = Math.floor(e.y);
  if (w.grid.passable(tx, ty)) return;
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (let r = 1; r <= 3 && !best; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = tx + dx;
        const ny = ty + dy;
        if (!w.grid.passable(nx, ny)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = [nx, ny];
        }
      }
    }
  }
  if (best) {
    e.x = best[0] + 0.5;
    e.y = best[1] + 0.5;
  }
}

function updateAbilities(w: World, e: Enemy, def: EnemyDef, dt: number, act2: boolean): void {
  if ((e.flags & TRAIT.healer) !== 0) {
    e.abilityTimer -= dt;
    if (e.abilityTimer <= 0) {
      e.abilityTimer = 0.5;
      const r = def.healRadius ?? 3;
      const heal = (def.healRate ?? 8) * 0.5;
      w.enemiesInRadius(e.x, e.y, r, scratch);
      for (const o of scratch) {
        if (o.id === e.id || o.dead) continue;
        o.hp = Math.min(o.maxHp, o.hp + heal);
      }
      w.emit('heal', e.x, e.y, r, 0);
    }
  }

  if ((e.flags & (TRAIT.buffer | TRAIT.empower)) !== 0) {
    e.abilityTimer -= dt;
    if (e.abilityTimer <= 0) {
      e.abilityTimer = 0.5;
      const r = def.buffRadius ?? 3;
      w.enemiesInRadius(e.x, e.y, r, scratch);
      for (const o of scratch) {
        if (o.id === e.id || o.dead) continue;
        o.buffRemaining = 1.0;
        o.buffSpeed = def.buffSpeed ?? 0;
        o.buffPower = def.buffPower ?? 0;
      }
    }
  }

  if ((e.flags & TRAIT.stomp) !== 0) {
    e.abilityTimer -= dt;
    if (e.abilityTimer <= 0) {
      e.abilityTimer = def.stompInterval ?? 4;
      const r = def.stompRadius ?? 2;
      w.emit('stomp', e.x, e.y, r, 0);
      if (dist2(e.x, e.y, w.warden.x, w.warden.y) <= r * r) {
        damageWarden(w, def.stompDamage ?? 25);
      }
      for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
        for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
          const s = w.structureAt(Math.floor(e.x) + dx, Math.floor(e.y) + dy);
          if (s && dist(e.x, e.y, s.tx + 0.5, s.ty + 0.5) <= r) {
            damageStructure(w, s, (def.stompDamage ?? 25) * 2);
          }
        }
      }
    }
  }

  if ((e.flags & TRAIT.fireTrail) !== 0 && act2) {
    e.abilityTimer -= dt;
    if (e.abilityTimer <= 0) {
      e.abilityTimer = 0.4;
      w.areas.push({
        id: w.newId(),
        x: e.x,
        y: e.y,
        radius: def.trailRadius ?? 0.6,
        dps: def.trailDps ?? 6,
        remaining: 3,
        type: 'enemyFire',
        source: 'cinderling',
        acc: 0,
        dead: false,
      });
    }
  }

  if ((e.flags & TRAIT.ranged) !== 0) {
    const range = def.attackRange ?? 4;
    if (e.attackCooldown <= 0) {
      // Spitters harass the Warden when in range, otherwise chew on structures.
      if (dist2(e.x, e.y, w.warden.x, w.warden.y) <= range * range) {
        e.attackCooldown = def.attackInterval ?? 2;
        damageWarden(w, def.attackDamage ?? 6);
        w.emit('spit', e.x, e.y, w.warden.x, w.warden.y);
      } else if (!act2) {
        const s = nearestStructureWithin(w, e.x, e.y, range);
        if (s) {
          e.attackCooldown = def.attackInterval ?? 2;
          damageStructure(w, s, def.attackDamage ?? 6);
          w.emit('spit', e.x, e.y, s.tx + 0.5, s.ty + 0.5);
        }
      }
    }
  }

  if ((e.flags & TRAIT.charges) !== 0) {
    if (e.chargeState === 0) {
      e.chargeCooldown -= dt;
      const tgt = w.huntsWarden ? w.warden : null;
      if (e.chargeCooldown <= 0 && tgt && dist2(e.x, e.y, tgt.x, tgt.y) <= 64) {
        e.chargeState = 1;
        e.chargeTimer = def.chargeWindup ?? 1;
        const n = normalize(tgt.x - e.x, tgt.y - e.y);
        e.chargeVx = n.x;
        e.chargeVy = n.y;
      }
    } else if (e.chargeState === 1) {
      e.chargeTimer -= dt;
      if (e.chargeTimer <= 0) {
        e.chargeState = 2;
        e.chargeTimer = def.chargeDuration ?? 1.2;
        w.emit('charge', e.x, e.y, e.chargeVx, e.chargeVy);
      }
    } else {
      e.chargeTimer -= dt;
      if (e.chargeTimer <= 0) {
        e.chargeState = 0;
        e.chargeCooldown = def.chargeCooldown ?? 5;
      }
    }
  }
}

function nearestStructureWithin(w: World, x: number, y: number, range: number): Structure | null {
  let best: Structure | null = null;
  let bestD = range * range;
  for (const s of w.structures) {
    if (s.dead) continue;
    const d = dist2(x, y, s.tx + 0.5, s.ty + 0.5);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/* --------------------------------------------------------------- movement */

/**
 * Movement runs for every enemy every tick, so it is written without
 * allocating: directions come back through these module-level scalars rather
 * than through freshly built vectors.
 */
let outX = 0;
let outY = 0;

function setNormalized(x: number, y: number): void {
  const l = Math.sqrt(x * x + y * y);
  if (l === 0) {
    outX = 0;
    outY = 0;
    return;
  }
  outX = x / l;
  outY = y / l;
}

function moveEnemy(w: World, e: Enemy, def: EnemyDef, dt: number, target: { x: number; y: number }): void {
  let speed = effectiveSpeed(e);
  let dx: number;
  let dy: number;

  if (e.chargeState === 1) return; // winding up: rooted
  if (e.chargeState === 2) {
    speed = def.chargeSpeed ?? 5;
    dx = e.chargeVx;
    dy = e.chargeVy;
  } else if (e.flying || e.ghosting) {
    setNormalized(target.x - e.x, target.y - e.y);
    dx = outX;
    dy = outY;
  } else {
    flowAim(w, e, target);
    setNormalized(outX - e.x, outY - e.y);
    dx = outX;
    dy = outY;
  }

  if (dx !== 0 || dy !== 0) {
    e.fx = dx;
    e.fy = dy;
  }

  // Separation keeps the horde from stacking into a single point, but it must
  // fade near the objective: at full strength the innermost ranks get pushed
  // outward by the ranks behind them and the crowd orbits instead of closing.
  // The scale saturates outside [SEP_FADE_NEAR, SEP_FADE_NEAR + SEP_FADE_SPAN],
  // and almost every enemy is outside it, so compare squared distances first
  // and take the square root only inside the band. Same value, far fewer sqrts.
  const toTarget2 = dist2(e.x, e.y, target.x, target.y);
  const sepScale =
    toTarget2 >= SEP_FADE_FAR_SQ
      ? 1
      : toTarget2 <= SEP_FADE_NEAR_SQ
        ? 0
        : clamp((Math.sqrt(toTarget2) - SEP_FADE_NEAR) / SEP_FADE_SPAN, 0, 1);
  if (sepScale > 0) {
    // Crowd repulsion is a smoothing force, not a collision response, so it is
    // recomputed on a stagger and reused in between. This is the single most
    // expensive query in the sim; the stagger is by entity id, so it stays
    // deterministic.
    if ((e.id + w.tick) % SEP_PERIOD === 0) {
      separation(w, e);
      e.sepX = outX;
      e.sepY = outY;
    }
    dx += e.sepX * sepScale;
    dy += e.sepY * sepScale;
  }
  setNormalized(dx, dy);
  dx = outX;
  dy = outY;

  const step = speed * dt;
  let nx = e.x + dx * step;
  let ny = e.y + dy * step;

  if (!e.flying && !e.ghosting) {
    // Straight reads of the blocked mask: this runs for every walker every tick.
    const blocked = w.grid.blocked;
    const cy = Math.floor(e.y);
    const cx = Math.floor(e.x);
    let hitX = -1;
    let hitY = -1;
    const bx = Math.floor(nx);
    if (bx < 0 || bx >= GRID_W || blocked[cy * GRID_W + bx] !== 0) {
      hitX = bx;
      hitY = cy;
      nx = e.x;
    }
    const by = Math.floor(ny);
    if (by < 0 || by >= GRID_H || blocked[by * GRID_W + cx] !== 0) {
      if (hitX < 0) {
        hitX = cx;
        hitY = by;
      }
      ny = e.y;
    }
    if (hitX >= 0) {
      const s = w.structureAt(hitX, hitY);
      if (s) attackStructure(w, e, def, s, dt);
      else e.attackingStructure = 0;
    } else {
      e.attackingStructure = 0;
    }
  }

  e.x = clamp(nx, 0.3, GRID_W - 0.3);
  e.y = clamp(ny, 0.3, GRID_H - 0.3);
}

/** Where the flow field wants this enemy to walk next; result in outX/outY. */
function flowAim(w: World, e: Enemy, target: { x: number; y: number }): void {
  const tx = Math.floor(e.x);
  const ty = Math.floor(e.y);
  // Standing on the target tile already: walk straight at the objective.
  if (tx === Math.floor(target.x) && ty === Math.floor(target.y)) {
    outX = target.x;
    outY = target.y;
    return;
  }
  const field = w.navFieldFor(false);
  const next = field.next[ty * GRID_W + tx];
  if (next < 0) {
    outX = target.x;
    outY = target.y;
    return;
  }
  outX = (next % GRID_W) + 0.5;
  outY = ((next / GRID_W) | 0) + 0.5;
}

const SEP_RADIUS = 0.55;
const SEP_STRENGTH = 0.6;
/** Separation is off within this distance of the objective, ramping back over SEP_FADE_SPAN. */
const SEP_FADE_NEAR = 1.0;
const SEP_FADE_SPAN = 1.4;
const SEP_FADE_NEAR_SQ = SEP_FADE_NEAR * SEP_FADE_NEAR;
const SEP_FADE_FAR_SQ = (SEP_FADE_NEAR + SEP_FADE_SPAN) * (SEP_FADE_NEAR + SEP_FADE_SPAN);
/** Ticks between separation recomputes for a given enemy. */
const SEP_PERIOD = 6;

/** Crowd repulsion; result in outX/outY. */
function separation(w: World, e: Enemy): void {
  const reach = SEP_RADIUS + e.radius;
  w.enemiesInRadius(e.x, e.y, reach, scratch);
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let i = 0; i < scratch.length; i++) {
    const o = scratch[i];
    if (o.id === e.id || o.dead || o.boss) continue;
    const dx = e.x - o.x;
    const dy = e.y - o.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= 0.0001) {
      // Perfect overlap: deterministic tie-break by id so replays match.
      sx += e.id > o.id ? 1 : -1;
      n++;
      continue;
    }
    const k = (reach - d) / reach;
    if (k <= 0) continue;
    sx += (dx / d) * k;
    sy += (dy / d) * k;
    n++;
  }
  if (n === 0) {
    outX = 0;
    outY = 0;
    return;
  }
  outX = (sx / n) * SEP_STRENGTH;
  outY = (sy / n) * SEP_STRENGTH;
}

/* ------------------------------------------------------- objective contact */

function attackStructure(w: World, e: Enemy, def: EnemyDef, s: Structure, dt: number): void {
  e.attackingStructure = s.id;
  const factor = w.content.waves.enemyStructureDpsFactor;
  const mul = def.structureDamageMul ?? 1;
  const dps = Math.max(1, def.coreDamage) * factor * mul;
  damageStructure(w, s, dps * dt);
}

export function damageStructure(w: World, s: Structure, amount: number): void {
  if (s.dead) return;
  s.hp -= amount;
  w.emit('structhit', s.tx + 0.5, s.ty + 0.5, amount, s.id);
  if (s.hp <= 0) {
    w.emit('structdeath', s.tx + 0.5, s.ty + 0.5, s.towerId, 0);
    w.removeStructure(s);
  }
}

function leakIntoCore(w: World, e: Enemy, def: EnemyDef): void {
  // Floored so a swarm that keeps leaking during the defeat slow-mo beat
  // (SPEC-V2 D1) cannot drive the HUD's Core HP negative.
  //
  // God mode (SPEC-V3 T4) suppresses the HP loss only. The leak is still
  // counted and still banked against the next VS wave: the Day HUD's "Loose in
  // the dark" counter shows exactly what is being stored up, so an immortal
  // Core is not a consequence-free one. Measured equal to a mortal run - same
  // budget, same leaks, same Night - so the choice costs nothing under
  // ordinary play, and the surplus from an extreme case is dropped at the
  // alive cap by act2.ts's spendBudget.
  if (!w.godMode) w.coreHp = Math.max(0, w.coreHp - def.coreDamage);
  w.leaks++;
  w.leaksByWave[w.wave] = (w.leaksByWave[w.wave] ?? 0) + 1;
  // SPEC-V2 §1 leak coupling: it escaped into the dark and comes back with
  // friends — banked against this Day's Night, spent at `finishSundering`.
  // The director's cost table prices one *spawn call*, not one physical body
  // (`act2.ts`'s `spendBudget` charges it once per call even for a pack), so
  // a pack enemy's share is divided by its pack size: a fully-leaked pack
  // costs the Night the same as the one spawn call that created it did the
  // Director, rather than `packSize`x that.
  const directorCost = (w.content.spawns.costs[def.key] ?? 5) / (def.packSize ?? 1);
  w.nightBudgetBonus += directorCost * w.content.spawns.leakBudgetMultiplier;
  w.looseInTheDark++;
  w.emit('leak', e.x, e.y, def.coreDamage, 0);
  e.dead = true;
  w.deadEnemies = true;
  w.enemyById.delete(e.id);
}

function contactWarden(w: World, e: Enemy, def: EnemyDef): void {
  if ((e.flags & TRAIT.explodes) !== 0) {
    const r = def.explodeRadius ?? 1.5;
    w.emit('explode', e.x, e.y, r, 0);
    if (dist2(e.x, e.y, w.warden.x, w.warden.y) <= r * r) {
      damageWarden(w, def.explodeDamage ?? 25);
    }
    killEnemy(w, e, 'contact');
    return;
  }
  if (e.attackCooldown > 0) return;
  e.attackCooldown = w.content.spawns.contactInterval;
  let dmg = def.coreDamage * (1 + e.buffPower);
  // Frost Warden trait: chilled enemies hit softer.
  if (e.slowRemaining > 0) dmg *= 1 + w.stats.chilledDamageTaken;
  damageWarden(w, dmg);
}

/** Set by boss.ts (M6). Returns true when it fully handled the boss this tick. */
export let bossUpdate: (w: World, e: Enemy, dt: number) => boolean = () => false;
export function setBossHandler(fn: (w: World, e: Enemy, dt: number) => boolean): void {
  bossUpdate = fn;
}

/**
 * Set by run.ts; keeps the Warden's damage rules (armor, i-frames) in one place.
 * `opts` is forwarded so an enemy-applied ailment can say it is one — without it
 * every §3 DoT reaching the Warden from this file would arrive armored, since
 * this indirection is the only route enemies, the boss and ground areas have.
 */
export let damageWarden: (w: World, amount: number, opts?: WardenDamageOptions) => void = () => {};
export function setWardenDamageHandler(
  fn: (w: World, amount: number, opts?: WardenDamageOptions) => void,
): void {
  damageWarden = fn;
}
