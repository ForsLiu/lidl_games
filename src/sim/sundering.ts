/**
 * The Sundering (SPEC 4): Dusk, petrification, and the Day/Dusk/Night/Dawn
 * cycle transition (Heartstone pocket, approach lanes, spire linking, Dawn's
 * Rekindle-or-Leave choice).
 */

import { CORE_H, CORE_W, CORE_X, CORE_Y, GRID_H, GRID_W, coreCenter } from './grid';
import { markAuraDirty, towerCost } from './towers';
import { applyTerrainPassives } from './weapons';
import { World } from './world';

/** How long the Dawn ledger stays open before it auto-resolves as all-Leave. */
export const DAWN_AUTO_SECONDS = 20;

export function finishSundering(w: World): void {
  petrify(w);
  const c = coreCenter();
  w.heartstoneX = c.x;
  w.heartstoneY = c.y;
  w.warden.x = c.x;
  w.warden.y = c.y;
  w.warden.hp = w.derived.maxHp;
  w.sundered = true;
  w.damageAtSunder = { ...w.damageByWeapon };
  w.phase = 'act2';
  w.act2Time = 0;
  w.directorTimer = 0;
  // SPEC-V2 §1 leak coupling: this Day's Core leaks land in the Night's
  // budget right here, then clear for the next Day.
  w.spawnBudget = w.nightBudgetBonus;
  w.nightBudgetBonus = 0;
  w.looseInTheDark = 0;
  w.eliteTimer = w.content.spawns.eliteIntervalSeconds;
  w.riftIndex = 0;
  w.updateNav(true);
  w.emit('sunder', c.x, c.y, 0, 0);
}

/**
 * SPEC-V2 §1: Dawn, between cycles. The Night's horde recedes; every
 * petrified tower waits on a Rekindle-or-Leave choice before the next Day.
 */
export function beginDawn(w: World): void {
  for (const e of w.enemies) e.dead = true;
  w.deadEnemies = true;
  w.phase = 'dawn';
  w.dawnTimer = 0;
}

/**
 * Rekindle: pay 40% (⚖ `rekindleCostMul`) of base cost to un-petrify a tower
 * for the next Day.
 */
export function rekindleTower(w: World, structureId: number): boolean {
  if (w.phase !== 'dawn') return false;
  const s = w.structureById.get(structureId);
  if (!s || s.dead || !s.petrified) return false;
  const def = w.content.towerById.get(s.towerId)!;
  const cost = Math.max(1, Math.round(towerCost(w, def) * w.content.towers.rekindleCostMul));
  if (w.gold < cost) return false;
  w.gold -= cost;
  w.goldSpent += cost;
  // SPEC-V3 §4's sell refund is a share of everything spent on the structure,
  // and this is a payment for this structure.
  s.spent += cost;
  s.petrified = false;
  w.emit('rekindle', s.tx + 0.5, s.ty + 0.5, 0, 0);
  markAuraDirty(w);
  return true;
}

/** Leaving is simply not Rekindling; Dawn resolves into the next Day's build phase. */
export function advanceFromDawn(w: World): void {
  if (w.phase !== 'dawn') return;
  w.cycle++;
  w.phase = 'act1_build';
  w.buildTimer = w.mods.buildPhase || w.content.waves.buildPhaseSeconds;
}

/**
 * SPEC 4: every tower petrifies in place; the Core detonates and force-clears
 * its 2x2 plus a radius-2 ring, guaranteeing an open pocket to fight in.
 */
export function petrify(w: World): void {
  const c = coreCenter();
  for (const s of w.structures) {
    if (s.dead) continue;
    s.petrified = true;
    s.cooldown = 0;
    s.gemTimer = 0;
  }
  if (w.cfg.stripTerrain) {
    // A6 harness: the same Act I build, but the maze does not survive the night.
    for (const s of w.structures.slice()) w.removeStructure(s);
    w.grid.markDirty();
    w.grid.refresh();
    void c;
    return;
  }
  clearCorePocket(w);
  openApproachLanes(w);
  w.compact();
  linkSpires(w);
  applyTerrainPassives(w);
  // The structure list just changed shape (new petrified towers, cleared
  // pocket/lanes): the cached residual scan from a prior cycle's Night is
  // stale and must be rebuilt against the current field.
  w.terrainEffects = null;
  void c;
}

const POCKET_RADIUS = 2;

function clearCorePocket(w: World): void {
  const cx = CORE_X + CORE_W / 2;
  const cy = CORE_Y + CORE_H / 2;
  for (const s of w.structures.slice()) {
    if (s.dead) continue;
    const dx = s.tx + 0.5 - cx;
    const dy = s.ty + 0.5 - cy;
    if (Math.sqrt(dx * dx + dy * dy) <= POCKET_RADIUS + 1) {
      w.removeStructure(s);
    }
  }
  w.grid.markDirty();
  w.grid.refresh();
}

/** How many rim-to-Heartstone lanes the detonation guarantees. */
const APPROACH_LANES = 4;
/** Cost of tunnelling through petrified terrain when routing a lane. */
const WALL_COST = 40;

/**
 * A maze that fully rings the Heartstone would make a stationary Warden
 * untouchable, which SPEC A7 rules out ("mazing is strong, never absolute")
 * and SPEC 4 already gestures at by detonating the Core. So the blast also
 * shatters the cheapest approach lanes from the arena rim to the pocket:
 * terrain still shapes the fight, but it can never seal it.
 */
export function openApproachLanes(w: World): void {
  const cx = Math.floor(CORE_X + CORE_W / 2);
  const cy = Math.floor(CORE_Y + CORE_H / 2);

  for (let lane = 0; lane < APPROACH_LANES; lane++) {
    const start = rimTileForLane(w, lane);
    if (!start) continue;
    const path = cheapestPath(w, start[0], start[1], cx, cy);
    if (!path) continue;
    let cleared = 0;
    for (const [tx, ty] of path) {
      const s = w.structureAt(tx, ty);
      if (!s) continue;
      w.removeStructure(s);
      cleared++;
    }
    if (cleared > 0) w.emit('lane', start[0], start[1], cx, cy);
  }
  w.grid.markDirty();
  w.grid.refresh();
}

/** One rim entry per lane, spread around the arena. */
function rimTileForLane(w: World, lane: number): [number, number] | null {
  const candidates: [number, number][] = [
    [1, Math.floor(GRID_H / 2)],
    [Math.floor(GRID_W / 2), 1],
    [GRID_W - 2, Math.floor(GRID_H / 2)],
    [Math.floor(GRID_W / 2), GRID_H - 2],
  ];
  const c = candidates[lane % candidates.length];
  return w.grid.inBounds(c[0], c[1]) ? c : null;
}

/**
 * Dijkstra where open tiles cost 1 and petrified tiles cost WALL_COST, so the
 * route prefers existing gaps and only breaks stone when it must.
 */
function cheapestPath(
  w: World,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
): [number, number][] | null {
  const n = GRID_W * GRID_H;
  const dist = new Int32Array(n).fill(0x7fffffff);
  const prev = new Int32Array(n).fill(-1);
  const start = w.grid.idx(sx, sy);
  const goal = w.grid.idx(tx, ty);
  dist[start] = 0;
  const buckets = new Map<number, number[]>();
  buckets.set(0, [start]);
  const maxCost = n * WALL_COST;

  for (let c = 0; c <= maxCost; c++) {
    const b = buckets.get(c);
    if (!b) {
      if (buckets.size === 0) break;
      continue;
    }
    buckets.delete(c);
    for (const i of b) {
      if (dist[i] !== c) continue;
      if (i === goal) return tracePath(prev, start, goal);
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (!w.grid.inBounds(nx, ny) || !w.grid.passableGhost(nx, ny)) continue;
        const ni = w.grid.idx(nx, ny);
        const step = w.grid.occ[ni] !== 0 ? WALL_COST : 1;
        const nd = c + step;
        if (nd < dist[ni]) {
          dist[ni] = nd;
          prev[ni] = i;
          let bucket = buckets.get(nd);
          if (!bucket) {
            bucket = [];
            buckets.set(nd, bucket);
          }
          bucket.push(ni);
        }
      }
    }
  }
  return dist[goal] < 0x7fffffff ? tracePath(prev, start, goal) : null;
}

function tracePath(prev: Int32Array, start: number, goal: number): [number, number][] {
  const out: [number, number][] = [];
  let cur = goal;
  let guard = 0;
  while (cur !== -1 && cur !== start && guard++ < 4000) {
    out.push([cur % GRID_W, (cur / GRID_W) | 0]);
    cur = prev[cur];
  }
  out.reverse();
  return out;
}

/**
 * SPEC 4.2: conductive spires arc to other spires within 6 tiles, at most two
 * links each (three with Deep Roots). Links are symmetric.
 */
export function linkSpires(w: World): void {
  const spires: typeof w.structures = [];
  for (const s of w.structures) {
    if (s.dead) continue;
    const def = w.content.towerById.get(s.towerId)!;
    if (def.terrain.linkRange && def.terrain.maxLinks) spires.push(s);
    s.links = [];
  }
  if (spires.length < 2) return;
  const def = w.content.towerById.get(spires[0].towerId)!;
  const range = def.terrain.linkRange!;
  const maxLinks = def.terrain.maxLinks! + w.derived.teslaLinkBonus;

  const pairs: { a: number; b: number; d: number }[] = [];
  for (let i = 0; i < spires.length; i++) {
    for (let j = i + 1; j < spires.length; j++) {
      const dx = spires[i].tx - spires[j].tx;
      const dy = spires[i].ty - spires[j].ty;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= range) pairs.push({ a: i, b: j, d });
    }
  }
  pairs.sort((p, q) => p.d - q.d || p.a - q.a || p.b - q.b);
  for (const p of pairs) {
    const A = spires[p.a];
    const B = spires[p.b];
    if (A.links.length >= maxLinks || B.links.length >= maxLinks) continue;
    A.links.push(B.id);
    B.links.push(A.id);
  }
}

