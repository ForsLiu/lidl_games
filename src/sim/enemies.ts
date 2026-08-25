/**
 * Enemy lifecycle: spawning, pathing, per-trait behaviour, damage and death.
 * Shared by both acts (SPEC 6); Act II applies a stat overlay at spawn time.
 */

import type { EnemyDef } from './content';
import { fieldStep, Grid, GRID_H, GRID_W } from './grid';
import { clamp, dcos, dist, dist2, dsin, normalize } from './math';
import type { Enemy, Structure } from './types';
import { World } from './world';

export interface SpawnOptions {
  hpMul?: number;
  elite?: boolean;
  gate?: number;
  /** Skip the Act II stat overlay (used when Act I spawns during a wave). */
  overlay?: boolean;
}

export function makeEnemy(w: World, def: EnemyDef, x: number, y: number, opts: SpawnOptions = {}): Enemy {
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
  const isBoss = def.traits.includes('boss');
  if (isBoss) hp *= 1 + w.mods.bossHp;

  const e: Enemy = {
    id: w.newId(),
    defId: def.id,
    x,
    y,
    hp,
    maxHp: hp,
    speed,
    radius: def.radius,
    gate: opts.gate ?? 0,
    elite: opts.elite ?? def.traits.includes('elite'),
    boss: isBoss,
    flying: def.traits.includes('flying'),
    fx: 0,
    fy: 1,
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
    ghosting: def.traits.includes('burrows'),
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
  if (def.traits.includes('pack')) {
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

export interface DamageOptions {
  fromX?: number;
  fromY?: number;
  /** Bypass Bulwark/Shellback mitigation (true damage). */
  pure?: boolean;
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
  const def = w.content.enemyById.get(e.defId)!;
  let dmg = amount;

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
  w.kills++;
  const def = w.content.enemyById.get(e.defId)!;
  w.emit('death', e.x, e.y, def.id, 0);

  if (!w.huntsWarden) {
    const gold = Math.round(def.bounty * (1 + w.derived.goldFind) + w.derived.goldPerKill);
    w.gold += gold;
    w.goldEarned += gold;
  } else {
    if (def.gem > 0) dropGem(w, e.x, e.y, def.gem);
  }

  if (def.traits.includes('splits')) {
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

  if (def.traits.includes('finalBoss')) {
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
  const def = w.content.enemyById.get(e.defId)!;
  if (def.traits.includes('slowImmune')) return;
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
  const def = w.content.enemyById.get(e.defId)!;
  if (def.traits.includes('burnImmune')) return;
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
    damageEnemy(w, e, e.burnDps * dt, e.burnSource || 'burn', { pure: true });
    if (e.dead) return;
    if (e.burnRemaining <= 0) e.burnDps = 0;
  }
  if (e.poison.length > 0) {
    for (const p of e.poison) {
      p.remaining -= dt;
      if (p.remaining > 0) damageEnemy(w, e, p.dps * dt, p.source || 'poison', { pure: true });
      if (e.dead) break;
    }
    e.poison = e.poison.filter((p) => p.remaining > 0);
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
    const def = w.content.enemyById.get(e.defId)!;

    tickTimers(w, e, dt);
    if (e.dead) continue;

    updatePhasing(w, e, def, dt);
    updateAbilities(w, e, def, dt, huntWarden);
    if (e.dead) continue;

    // The final boss has its own script (M6); it falls through to normal
    // chase movement whenever the script has nothing to say this tick.
    if (def.traits.includes('finalBoss') && bossUpdate(w, e, dt)) continue;

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
  if (def.traits.includes('burrows')) {
    e.ghosting = true;
    return;
  }
  if (!def.traits.includes('phases')) return;
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
  if (def.traits.includes('healer')) {
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

  if (def.traits.includes('buffer') || def.traits.includes('empower')) {
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

  if (def.traits.includes('stomp')) {
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

  if (def.traits.includes('fireTrail') && act2) {
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

  if (def.traits.includes('ranged')) {
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

  if (def.traits.includes('charges')) {
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
    const n = normalize(target.x - e.x, target.y - e.y);
    dx = n.x;
    dy = n.y;
  } else {
    const aim = flowAim(w, e, target);
    const n = normalize(aim.x - e.x, aim.y - e.y);
    dx = n.x;
    dy = n.y;
  }

  if (dx !== 0 || dy !== 0) {
    e.fx = dx;
    e.fy = dy;
  }

  // Separation keeps the horde from stacking into a single point, but it must
  // fade near the objective: at full strength the innermost ranks get pushed
  // outward by the ranks behind them and the crowd orbits instead of closing.
  const toTarget = Math.sqrt(dist2(e.x, e.y, target.x, target.y));
  const sepScale = clamp((toTarget - SEP_FADE_NEAR) / SEP_FADE_SPAN, 0, 1);
  if (sepScale > 0) {
    const sep = separation(w, e);
    dx += sep.x * sepScale;
    dy += sep.y * sepScale;
  }
  const nrm = normalize(dx, dy);
  dx = nrm.x;
  dy = nrm.y;

  const step = speed * dt;
  let nx = e.x + dx * step;
  let ny = e.y + dy * step;

  if (!e.flying && !e.ghosting) {
    let blocker: Structure | null = null;
    const cy = Math.floor(e.y);
    const cx = Math.floor(e.x);
    if (!w.grid.passable(Math.floor(nx), cy)) {
      blocker = blocker ?? w.structureAt(Math.floor(nx), cy);
      nx = e.x;
    }
    if (!w.grid.passable(cx, Math.floor(ny))) {
      blocker = blocker ?? w.structureAt(cx, Math.floor(ny));
      ny = e.y;
    }
    if (nx !== e.x && ny !== e.y && !w.grid.passable(Math.floor(nx), Math.floor(ny))) {
      blocker = blocker ?? w.structureAt(Math.floor(nx), Math.floor(ny));
      ny = e.y;
    }
    if (blocker) {
      attackStructure(w, e, def, blocker, dt);
    } else {
      e.attackingStructure = 0;
    }
  }

  e.x = clamp(nx, 0.3, GRID_W - 0.3);
  e.y = clamp(ny, 0.3, GRID_H - 0.3);
}

/** Where the flow field wants this enemy to walk next. */
function flowAim(w: World, e: Enemy, target: { x: number; y: number }): { x: number; y: number } {
  const tx = Math.floor(e.x);
  const ty = Math.floor(e.y);
  const field = w.navFieldFor(false);
  // Standing on the target tile already: walk straight at the objective.
  if (tx === Math.floor(target.x) && ty === Math.floor(target.y)) return target;
  const step = fieldStep(field, tx, ty);
  if (!step) return target;
  const c = Grid.tileCenter(step[0], step[1]);
  // Aim past the tile centre slightly so enemies do not stall on corners.
  return c;
}

const SEP_RADIUS = 0.55;
const SEP_STRENGTH = 0.6;
/** Separation is off within this distance of the objective, ramping back over SEP_FADE_SPAN. */
const SEP_FADE_NEAR = 1.0;
const SEP_FADE_SPAN = 1.4;

function separation(w: World, e: Enemy): { x: number; y: number } {
  w.enemiesInRadius(e.x, e.y, SEP_RADIUS + e.radius, scratch);
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const o of scratch) {
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
    const w2 = (SEP_RADIUS + e.radius - d) / (SEP_RADIUS + e.radius);
    if (w2 <= 0) continue;
    sx += (dx / d) * w2;
    sy += (dy / d) * w2;
    n++;
  }
  if (n === 0) return { x: 0, y: 0 };
  return { x: (sx / n) * SEP_STRENGTH, y: (sy / n) * SEP_STRENGTH };
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
  w.coreHp -= def.coreDamage;
  w.leaks++;
  w.emit('leak', e.x, e.y, def.coreDamage, 0);
  e.dead = true;
  w.enemyById.delete(e.id);
}

function contactWarden(w: World, e: Enemy, def: EnemyDef): void {
  if (def.traits.includes('explodes')) {
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

/** Set by run.ts; keeps the Warden's damage rules (armor, i-frames) in one place. */
export let damageWarden: (w: World, amount: number) => void = () => {};
export function setWardenDamageHandler(fn: (w: World, amount: number) => void): void {
  damageWarden = fn;
}
