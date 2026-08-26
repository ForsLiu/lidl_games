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
  spawnEnemy,
} from './enemies';
import type { Enemy } from './types';
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

export function bossUpdate(w: World, e: Enemy, dt: number): boolean {
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
    const speed = CHARGE_SPEED * (phase === 2 ? ENRAGE_SPEED : 1);
    const step = speed * dt;
    const nx = clamp(e.x + e.chargeVx * step, 1, GRID_W - 1);
    const ny = clamp(e.y + e.chargeVy * step, 1, GRID_H - 1);
    shatterAlong(w, e.x, e.y, nx, ny);
    e.x = nx;
    e.y = ny;
    if (dist(e.x, e.y, wd.x, wd.y) <= CHARGE_WIDTH + e.radius) damageWarden(w, CHARGE_DAMAGE * dt * 2);
    if (e.bossTimer <= 0) {
      e.bossAction = IDLE;
      e.bossTimer = CHARGE_COOLDOWN * (phase === 2 ? 0.7 : 1);
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
  e.abilityTimer = SUMMON_INTERVAL;

  for (let i = 0; i < SUMMON_COUNT; i++) {
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
  for (const a of w.areas) {
    if (a.dead || a.type !== 'bossSlam') continue;
    a.radius += SLAM_EXPAND * dt;
    const wd = w.warden;
    const d = Math.sqrt(dist2(a.x, a.y, wd.x, wd.y));
    // Only the leading edge of the ring hurts.
    if (Math.abs(d - a.radius) <= 0.8) damageWarden(w, SLAM_DAMAGE * dt * 2);
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
  if (dist2(w.warden.x, w.warden.y, cx, cy) > r * r) damageWarden(w, FIRE_DPS * dt);
}

export function clearArenaFire(w: World): void {
  w.arenaFireActive = false;
}

setBossHandler(bossUpdate);
