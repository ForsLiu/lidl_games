/**
 * The Warden-Eater (SPEC 5.5). Three phases:
 *   1. telegraphed line charges that shatter the petrified terrain they cross,
 *   2. Wraith summons and expanding ground-slam rings,
 *   3. enrage below 30%: +30% speed and a closing ring of arena fire.
 *
 * Driven through the `bossUpdate` hook in enemies.ts: returning true means the
 * script fully handled the boss this tick, false lets it fall through to the
 * normal chase.
 */

import { GRID_H, GRID_W } from './grid';
import { clamp, dcos, dist, dist2, dsin, normalize } from './math';
import {
  damageEnemy,
  damageStructure,
  damageWarden,
  setBossHandler,
  setBossVulnerabilityFn,
  spawnEnemy,
} from './enemies';
import type { Enemy, Structure } from './types';
import { World } from './world';

/** Phase boundaries as a fraction of max HP. */
const PHASE2_AT = 0.66;
const PHASE3_AT = 0.30;

const CHARGE_TELEGRAPH = 1.1;
const CHARGE_DURATION = 1.0;
const CHARGE_COOLDOWN = 4.5;
const CHARGE_SPEED = 13;
const CHARGE_DAMAGE = 14;
const CHARGE_WIDTH = 1.1;

const SUMMON_INTERVAL = 8;
const SUMMON_COUNT = 4;
const SLAM_RADIUS = 5.5;
const SLAM_DAMAGE = 12;
const SLAM_EXPAND = 6;

const ENRAGE_SPEED = 1.3;
/** How fast the arena fire closes, in tiles per second. */
const FIRE_CLOSE_RATE = 0.22;
const FIRE_MIN_RADIUS = 5;
const FIRE_DPS = 8;

/** Boss action ids, stored on `bossAction`. */
const IDLE = 0;
const TELEGRAPH = 1;
const CHARGING = 2;

/**
 * §9 addendum (Q126/Q127, ORDER from the 2026-08-28 verdict batch): "no run
 * can stalemate, every seed terminates." From 3:00 of boss-fight time (not
 * Act II time — `w.act2Time - w.bossSpawnTime`) the Warden-Eater gains +10%
 * damage and +5% move/attack speed every 30s, stacking without cap (⚖) so
 * that any finite sustain/kite race a scripted bot can set up is eventually
 * overrun rather than drawn out indefinitely.
 */
const ESCALATION_START = 180;
const ESCALATION_INTERVAL = 30;
const ESCALATION_DAMAGE_PER_STACK = 0.1;
const ESCALATION_SPEED_PER_STACK = 0.05;

/**
 * p10k (§9/§14, G1xG14): measured fight lengths against the real §1.1 shape
 * (`tools/p10k-sweep.ts`) top out under 180s, so reusing `ESCALATION_START`'s
 * spec-fixed 3:00 clock (Q126/Q127) for a vulnerability ramp is dead code
 * against real play — the first pass at this item did exactly that and
 * measured zero change (mean pinned at 37.24 min regardless of the
 * multiplier, since `escalationStacks` never left 0). This is a separate,
 * earlier-starting pacing clock: from `PACING_START` of boss-fight time the
 * Warden-Eater takes increasing damage, on top of (not instead of) the 3:00
 * stalemate-breaker above. It only ever speeds up the boss's own death — it
 * never changes what the boss deals back — so it compresses the tail of
 * fights that run long relative to the pool without rescuing a fight that was
 * genuinely losing for other reasons.
 *
 * Swept a wide range of `(PACING_START, PACING_INTERVAL,
 * PACING_VULNERABILITY_PER_STACK)` against `tools/p10k-sweep.ts` looking for
 * a point inside G1's 30-36 min mean band that keeps G14's win rate below
 * 100%. None exists: mean and win rate move together along this lever, and
 * every measured point holds one of two shapes —
 *   - below 100% wins: 37.24/67% (no ramp) -> 37.05/79% -> 36.63/92% -> 36.26/96%
 *   - at 100% wins (every seed flips): 36.19/100% -> 35.88/100% at the most
 *     extreme setting tried (an effectively instant boss kill for every seed)
 * — i.e. mean only crosses under 36 once the fight stops being a real fight
 * for anyone, which is the exact outcome G14 forbids. This reproduces, via an
 * independent mechanism, the same wall p10d hit tuning `warden_eater` HP
 * directly: the remaining ~0.6 min gap is not inside the boss fight's own
 * budget at all — see PROGRESS.md's p10k entry and BACKLOG p10l (filed here)
 * for why the rest lives in Act I/VS pacing, which a4's protected TD economy
 * (`tests/a4-single-type.test.ts`) rules out of scope for a boss-only item.
 * Landed on 20/10/0.5: real, measured improvement (37.24 -> 36.63 min, and
 * a still-genuine sometimes-lost fight at 92%, 22/24) over shipping either
 * nothing or a knife-edge tuning that reads as green today only because it
 * sits one seed away from 100% (⚖).
 */
const PACING_START = 20;
const PACING_INTERVAL = 10;
const PACING_VULNERABILITY_PER_STACK = 0.5;

/** Exported for direct assertions (tests/p8d-boss-termination.test.ts) — same reason `updateBossSlam` is public. */
export function escalationStacks(w: World): number {
  if (w.bossSpawnTime < 0) return 0;
  const elapsed = w.act2Time - w.bossSpawnTime;
  if (elapsed < ESCALATION_START) return 0;
  return 1 + Math.floor((elapsed - ESCALATION_START) / ESCALATION_INTERVAL);
}

export function escalationDamageMul(w: World): number {
  return 1 + ESCALATION_DAMAGE_PER_STACK * escalationStacks(w);
}

export function escalationSpeedMul(w: World): number {
  return 1 + ESCALATION_SPEED_PER_STACK * escalationStacks(w);
}

/** p10k: independent, earlier-starting damage-taken ramp — see the doc comment above `PACING_START`. */
function pacingStacks(w: World): number {
  if (w.bossSpawnTime < 0) return 0;
  const elapsed = w.act2Time - w.bossSpawnTime;
  if (elapsed < PACING_START) return 0;
  return 1 + Math.floor((elapsed - PACING_START) / PACING_INTERVAL);
}

/** p10k: damage-taken ramp on the boss itself, registered onto enemies.ts below. */
export function escalationVulnerabilityMul(w: World): number {
  return 1 + PACING_VULNERABILITY_PER_STACK * pacingStacks(w);
}

/**
 * §9 addendum: whenever the boss cannot path to the Warden at all (a sealed
 * pocket of standing structures, not merely a long route around them — the
 * charge script above already shatters anything directly in a charge's line)
 * it attacks the nearest structure and, lacking one in reach, the Core
 * directly, so a truly walled-off Warden cannot stall the run forever behind
 * an unreachable position. `checkDefeat` (run.ts) treats Core loss as defeat
 * regardless of phase, same as Act I.
 */
export const UNREACHABLE_THRESHOLD = 6;
const UNREACHABLE_STRUCTURE_RANGE = 2.5;
const UNREACHABLE_DPS = 40;

function canReachWarden(w: World, e: Enemy): boolean {
  const wd = w.warden;
  const tx = Math.floor(e.x);
  const ty = Math.floor(e.y);
  if (!w.grid.inBounds(tx, ty)) return true;
  if (tx === Math.floor(wd.x) && ty === Math.floor(wd.y)) return true;
  return w.navFieldFor(false).next[ty * GRID_W + tx] >= 0;
}

function updateUnreachable(w: World, e: Enemy, dt: number): void {
  if (canReachWarden(w, e)) {
    e.bossUnreachableTime = 0;
    return;
  }
  e.bossUnreachableTime += dt;
  if (e.bossUnreachableTime < UNREACHABLE_THRESHOLD) return;

  const dps = UNREACHABLE_DPS * escalationDamageMul(w);
  let nearest: Structure | null = null;
  let nearestD2 = UNREACHABLE_STRUCTURE_RANGE * UNREACHABLE_STRUCTURE_RANGE;
  for (const s of w.structures) {
    if (s.dead) continue;
    const d2 = dist2(e.x, e.y, s.tx + 0.5, s.ty + 0.5);
    if (d2 <= nearestD2) {
      nearest = s;
      nearestD2 = d2;
    }
  }
  if (nearest) damageStructure(w, nearest, dps * dt);
  // Same god-mode contract `leakIntoCore` (enemies.ts) already honours: only
  // the Core HP loss is suppressed, so a soak test stays immortal here too.
  else if (!w.godMode) w.coreHp = Math.max(0, w.coreHp - dps * dt);
}

export function bossUpdate(w: World, e: Enemy, dt: number): boolean {
  // b052: the Warden's outcome is already decided once `w.dying` is set (the
  // 1.5s DEFEAT_SLOWMO beat, run.ts) — none of updateCharge's charge-hit,
  // updateSummonsAndSlams/updateBossSlam's ring, or updateArenaFire's fire
  // damage should keep banking Wrath through it. Mirrors updateAbilities's
  // whole-function guard (b051): no branch here is cosmetic-only.
  if (w.dying) return true;

  // `spawnFinalBoss` (act2.ts) sets this on the run's normal boss-spawn path;
  // a boss placed any other way (the practice panel's generic debug spawn,
  // `src/ui/hud.ts`'s unfiltered enemy picker included) would otherwise never
  // start the escalation clock at all, defeating the "every seed terminates"
  // guarantee for exactly that spawn. Lazily latching it here the first tick
  // this script ever sees a live boss covers every spawn path uniformly and
  // is a no-op on the normal path, where it is already set by then.
  if (w.bossSpawnTime < 0) w.bossSpawnTime = w.act2Time;

  const phase = phaseFor(e);
  if (phase !== e.bossPhase) {
    e.bossPhase = phase;
    e.bossTimer = 0;
    e.bossAction = IDLE;
    w.emit('bossphase', e.x, e.y, phase, 0);
    if (phase === 2) startArenaFire(w);
  }

  if (phase === 2) updateArenaFire(w, dt);
  if (phase >= 1) updateSummonsAndSlams(w, e, dt);

  // The escalation's speed half drives the scripted charge below directly;
  // the generic chase fallback (`moveEnemy`, enemies.ts) reads it back off
  // `buffSpeed` — the same haste hook other speed buffs already use — on
  // whichever tick this script has nothing left to say.
  e.buffSpeed = escalationSpeedMul(w) - 1;
  updateUnreachable(w, e, dt);

  return updateCharge(w, e, dt, phase);
}

function phaseFor(e: Enemy): number {
  const frac = e.maxHp > 0 ? e.hp / e.maxHp : 1;
  if (frac <= PHASE3_AT) return 2;
  if (frac <= PHASE2_AT) return 1;
  return 0;
}

/* ---------------------------------------------------------------- charges */

function updateCharge(w: World, e: Enemy, dt: number, phase: number): boolean {
  const wd = w.warden;

  // SPEC-V3 §3 frozen: "cannot move". The charge writes `e.x`/`e.y` itself
  // rather than going through `moveEnemy`, so the root has to be honoured here
  // too — otherwise the one enemy freezing matters most against is the one
  // enemy it does not stop. Rooted and holding its action timer.
  if (e.frozenRemaining > 0) return true;

  if (e.bossAction === TELEGRAPH) {
    e.bossTimer -= dt;
    w.emit('bosstelegraph', e.x, e.y, e.chargeVx, e.chargeVy);
    if (e.bossTimer <= 0) {
      e.bossAction = CHARGING;
      e.bossTimer = CHARGE_DURATION;
    }
    return true; // rooted while winding up
  }

  if (e.bossAction === CHARGING) {
    e.bossTimer -= dt;
    const speedMul = escalationSpeedMul(w);
    const speed = CHARGE_SPEED * (phase === 2 ? ENRAGE_SPEED : 1) * speedMul;
    const step = speed * dt;
    const nx = clamp(e.x + e.chargeVx * step, 1, GRID_W - 1);
    const ny = clamp(e.y + e.chargeVy * step, 1, GRID_H - 1);
    shatterAlong(w, e.x, e.y, nx, ny);
    e.x = nx;
    e.y = ny;
    if (dist(e.x, e.y, wd.x, wd.y) <= CHARGE_WIDTH + e.radius) {
      damageWarden(w, CHARGE_DAMAGE * dt * 2 * escalationDamageMul(w));
    }
    if (e.bossTimer <= 0) {
      e.bossAction = IDLE;
      e.bossTimer = (CHARGE_COOLDOWN * (phase === 2 ? 0.7 : 1)) / speedMul;
    }
    return true;
  }

  e.bossTimer -= dt;
  if (e.bossTimer <= 0) {
    const n = normalize(wd.x - e.x, wd.y - e.y);
    if (n.x !== 0 || n.y !== 0) {
      e.chargeVx = n.x;
      e.chargeVy = n.y;
      e.bossAction = TELEGRAPH;
      e.bossTimer = CHARGE_TELEGRAPH;
      w.emit('bosscharge', e.x, e.y, n.x, n.y);
      return true;
    }
  }
  return false; // fall through to the normal chase
}

/** SPEC 5.5: a charge shatters the petrified terrain it passes through. */
function shatterAlong(w: World, x0: number, y0: number, x1: number, y1: number): void {
  const steps = Math.max(1, Math.ceil(dist(x0, y0, x1, y1) * 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const tx = Math.floor(x0 + (x1 - x0) * t);
    const ty = Math.floor(y0 + (y1 - y0) * t);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const s = w.structureAt(tx + dx, ty + dy);
        if (s) {
          damageStructure(w, s, 1e9);
          w.terrainEffects = null;
        }
      }
    }
  }
}

/* ------------------------------------------------------- summons and slams */

function updateSummonsAndSlams(w: World, e: Enemy, dt: number): void {
  e.abilityTimer -= dt;
  if (e.abilityTimer > 0) return;
  e.abilityTimer = SUMMON_INTERVAL / escalationSpeedMul(w);

  for (let i = 0; i < SUMMON_COUNT; i++) {
    if (w.enemies.length >= w.content.spawns.aliveCap) break;
    const a = (i / SUMMON_COUNT) * 6.283185307179586;
    const ox = clamp(e.x + dcos(a) * 2, 1.5, GRID_W - 1.5);
    const oy = clamp(e.y + dsin(a) * 2, 1.5, GRID_H - 1.5);
    spawnEnemy(w, 'wraith', ox, oy, { overlay: true });
  }
  w.emit('bosssummon', e.x, e.y, SUMMON_COUNT, 0);
  slam(w, e);
}

/** Ground slam: an expanding ring that hurts the Warden and everything in it. */
function slam(w: World, e: Enemy): void {
  w.areas.push({
    id: w.newId(),
    x: e.x,
    y: e.y,
    radius: 1,
    dps: SLAM_DAMAGE,
    remaining: SLAM_RADIUS / SLAM_EXPAND,
    type: 'bossSlam',
    source: 'warden_eater',
    acc: 0,
    dead: false,
  });
  w.emit('bossslam', e.x, e.y, SLAM_RADIUS, 0);
}

/** Grows slam rings and applies their damage. Called from the area update. */
export function updateBossSlam(w: World, dt: number): void {
  // b052: called unconditionally from updateAct2 (run.ts), unlike bossUpdate
  // above — needs its own guard for the same DEFEAT_SLOWMO reason.
  if (w.dying) return;
  for (const a of w.areas) {
    if (a.dead || a.type !== 'bossSlam') continue;
    a.radius += SLAM_EXPAND * dt;
    const wd = w.warden;
    const d = Math.sqrt(dist2(a.x, a.y, wd.x, wd.y));
    // Only the leading edge of the ring hurts.
    if (Math.abs(d - a.radius) <= 0.8) damageWarden(w, SLAM_DAMAGE * dt * 2 * escalationDamageMul(w));
    for (const en of w.enemiesInRadius(a.x, a.y, a.radius + 1)) {
      if (en.dead || en.boss) continue;
      const ed = Math.sqrt(dist2(a.x, a.y, en.x, en.y));
      if (Math.abs(ed - a.radius) <= 0.8) damageEnemy(w, en, SLAM_DAMAGE * dt * 2, 'warden_eater');
    }
  }
}

/* -------------------------------------------------------------- arena fire */

function startArenaFire(w: World): void {
  w.arenaFireActive = true;
  w.arenaFireRadius = Math.max(GRID_W, GRID_H) * 0.6;
  w.emit('bossfire', GRID_W / 2, GRID_H / 2, w.arenaFireRadius, 0);
}

/** SPEC 5.5 phase 3: the arena edge burns inward, forcing engagement. */
function updateArenaFire(w: World, dt: number): void {
  if (!w.arenaFireActive) return;
  w.arenaFireRadius = Math.max(FIRE_MIN_RADIUS, w.arenaFireRadius - FIRE_CLOSE_RATE * dt);
  const cx = GRID_W / 2;
  const cy = GRID_H / 2;
  const r = w.arenaFireRadius;
  if (dist2(w.warden.x, w.warden.y, cx, cy) > r * r) damageWarden(w, FIRE_DPS * dt * escalationDamageMul(w));
}

export function clearArenaFire(w: World): void {
  w.arenaFireActive = false;
}

setBossHandler(bossUpdate);
setBossVulnerabilityFn(escalationVulnerabilityMul);
