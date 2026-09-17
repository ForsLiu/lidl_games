/**
 * fb129 — the high-ground protection rules (SPEC-FINAL §10.5, fb064i) wired
 * at their main-lane call sites. `tests/terrain-high-ground.test.ts` already
 * pins `canAttackStructureAt`/`canSurfaceAt` themselves (fb064i, terrain
 * lane); this file pins that `src/sim/enemies.ts` and `src/sim/boss.ts`
 * actually *call* them — BACKLOG-TERRAIN.md fb064i's Log names the six
 * sites, reproduced in BACKLOG.md fb129.
 */

import { describe, expect, it } from 'vitest';

import { GRID_W } from '../src/sim/grid';
import { spawnEnemy, TRAIT, updateEnemies } from '../src/sim/enemies';
import { buildTower } from '../src/sim/towers';
import type { Structure } from '../src/sim/types';
import { loadTerrain, terrainOverlay, TerrainKind, flatTerrain } from '../src/sim/terrain';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const DT = 1 / 60;
const PALISADE = 1;
const terrainCfg = loadTerrain();

function newWorld(): World {
  // fb077: fixed-tile assertions need the flat pre-fb077 board, not real
  // generated terrain — this file hand-patches the one tile each test cares
  // about instead.
  const w = new World(cfg({ practice: true }));
  w.gold = 100000;
  return w;
}

/**
 * Patch one tile of the flat arena to `kind`. Must run before anything is
 * built (`Grid.applyTerrain` refuses once structures are placed).
 */
function patchTile(w: World, tiles: ReadonlyArray<readonly [number, number, TerrainKind]>): void {
  const map = flatTerrain();
  const kind = map.kind.slice();
  for (const [tx, ty, k] of tiles) kind[ty * GRID_W + tx] = k;
  w.grid.applyTerrain(terrainOverlay({ w: map.w, h: map.h, kind }, terrainCfg));
  w.grid.refresh();
}

/** Build with the Warden warped onto the tile so range never interferes. */
function place(w: World, towerId: number, tx: number, ty: number): Structure {
  w.warden.x = tx + 0.5;
  w.warden.y = ty + 0.5;
  const r = buildTower(w, towerId, tx, ty);
  if (!r.ok) throw new Error(`build ${towerId} at ${tx},${ty}: ${r.reason}`);
  return r.structure;
}

function warp(w: World, tx: number, ty: number): void {
  w.warden.x = tx + 0.5;
  w.warden.y = ty + 0.5;
}

function step(w: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    w.tick++;
    w.rebuildBuckets();
    w.grid.refresh();
    updateEnemies(w, DT);
    w.compact();
  }
}

describe('fb129 site 1 — enemies.ts moveEnemy melee breach (ground family)', () => {
  it('a Gatebreaker cannot chew a high-ground tower from the low tile beside it, but can chew the identical tower on normal ground', () => {
    // The motivating bug (BACKLOG-TERRAIN.md fb064i Log): `structureBreaker`
    // forces the breach branch unconditionally, so a naive `boss:
    // attacksHigh: true` family let the Gatebreaker chew a high-ground tower
    // from below. A 1-tile pocket walled on all 4 sides (the tower is the
    // wall facing the Core) guarantees a collision every tick regardless of
    // routing, so `structureBreaker`'s unconditional path is what is under
    // test here, not which route the flow field judged cheapest.
    function run(high: boolean): Structure {
      const w = newWorld();
      const tx = 40;
      const ty = 16;
      if (high) patchTile(w, [[tx, ty, TerrainKind.High]]);
      const tower = place(w, PALISADE, tx, ty); // west wall of the pocket
      place(w, PALISADE, tx + 1, ty - 1); // north
      place(w, PALISADE, tx + 1, ty + 1); // south
      place(w, PALISADE, tx + 2, ty); // east
      warp(w, 2, 2); // the Core is west of the pocket; keep the Warden clear
      spawnEnemy(w, 'gatebreaker', tx + 1.5, ty + 0.5, { overlay: false });
      step(w, 180);
      return tower;
    }

    const highTower = run(true);
    expect(highTower.hp).toBe(highTower.maxHp);

    const normalTower = run(false);
    expect(normalTower.hp).toBeLessThan(normalTower.maxHp);
  });
});

describe('fb129 site 2 — enemies.ts stomp AoE (Colossus, a ground family)', () => {
  it('a stomp cannot reach a structure on high ground, but can reach the identical tower on normal ground', () => {
    const highTx = 40;
    const highTy = 16;
    const normalTx = 10;
    const normalTy = 16;

    const wHigh = newWorld();
    patchTile(wHigh, [[highTx, highTy, TerrainKind.High]]);
    const highTower = place(wHigh, PALISADE, highTx, highTy);
    warp(wHigh, 2, 2); // keep the Warden well away — Act I, not the VS hunt
    const colossusHigh = spawnEnemy(wHigh, 'colossus', highTx - 1.4, highTy, { overlay: false })!;
    expect(colossusHigh.abilityTimer).toBe(0); // stomps on the very first tick it can
    step(wHigh, 1);
    expect(highTower.hp).toBe(highTower.maxHp);

    const wNormal = newWorld();
    const normalTower = place(wNormal, PALISADE, normalTx, normalTy);
    warp(wNormal, 2, 2);
    spawnEnemy(wNormal, 'colossus', normalTx - 1.4, normalTy, { overlay: false });
    step(wNormal, 1);
    expect(normalTower.hp).toBeLessThan(normalTower.maxHp);
  });
});

describe('fb129 site 3 — enemies.ts updatePhasing Burrower surfacing', () => {
  it('a Burrower ready to surface under high ground stays down, capped at surfaceBlockCap seconds', () => {
    // Act II (`huntsWarden`): the target is the Warden's own position, not
    // the fixed, never-high-ground Core tile — parked exactly on the Warden
    // (dist 0, always inside `burrowSurfaceDistance`) so it is blocked every
    // tick rather than drifting off the one patched tile while ghosting.
    const tx = 40;
    const ty = 16;
    const w = newWorld();
    w.phase = 'act2';
    warp(w, tx, ty);
    patchTile(w, [[tx, ty, TerrainKind.High]]);
    expect(w.grid.isHighGround(tx, ty)).toBe(true);

    const e = spawnEnemy(w, 'burrower', tx + 0.5, ty + 0.5, { overlay: true })!;
    expect(e.submerged).toBe(true);
    expect((e.flags & TRAIT.burrows) !== 0).toBe(true);

    const cap = terrainCfg.highGround.surfaceBlockCap;
    // Well inside the cap: still held down.
    step(w, Math.floor((cap - 0.5) * 60));
    expect(e.submerged).toBe(true);
    expect(e.highGroundBlockedFor).toBeGreaterThan(0);

    // Past the cap: forced to surface even though the tile is still high
    // ground, so a Burrower parked here cannot stay untargetable forever.
    step(w, 60);
    expect(e.submerged).toBe(false);
    expect(e.highGroundBlockedFor).toBe(0);
  });

  it('control: the identical approach on normal ground surfaces immediately, well inside the cap', () => {
    const tx = 40;
    const ty = 16;
    const w = newWorld();
    w.phase = 'act2';
    warp(w, tx, ty);
    const e = spawnEnemy(w, 'burrower', tx + 0.5, ty + 0.5, { overlay: true })!;
    expect(e.submerged).toBe(true);
    step(w, 2);
    expect(e.submerged).toBe(false);
  });
});

describe('fb129 site 4 — enemies.ts Spitter ranged attack (exempt family)', () => {
  it('the ranged family is exempt (attacksHigh: true): a Spitter still chews a tower on high ground', () => {
    // This only regression-pins the *exempt* shape (the call site is wired
    // but `canAttackStructureAt` is a no-op for `ranged.attacksHigh: true`
    // today) — it cannot itself prove a non-exempt ranged family would be
    // denied, since `s && canAttackStructureAt(...)` and `s` alone predict
    // the same pass/fail here. That direction (denial) is what site 1's
    // Gatebreaker test above pins, and `canAttackStructureAt` itself is
    // unit-tested against every family in tests/terrain-high-ground.test.ts.
    const family = terrainCfg.highGround.families.find((f) => f.key === 'ranged');
    expect(family?.attacksHigh).toBe(true);

    const tx = 40;
    const ty = 16;
    const w = newWorld();
    patchTile(w, [[tx, ty, TerrainKind.High]]);
    const tower = place(w, PALISADE, tx, ty);
    warp(w, 2, 2); // out of the Spitter's attackRange, so it targets the structure
    const spitter = spawnEnemy(w, 'spitter', tx - 3, ty + 0.5, { overlay: false })!;
    expect(spitter.attackCooldown).toBe(0);
    step(w, 1);
    expect(tower.hp).toBeLessThan(tower.maxHp);
  });
});

describe('fb129 site 5 — enemies.ts updatePhasing Wraith phase end (ground family)', () => {
  it('a Wraith cannot end its phase standing on high ground; it can on normal ground', () => {
    const highTx = 40;
    const highTy = 16;
    const wHigh = newWorld();
    patchTile(wHigh, [[highTx, highTy, TerrainKind.High]]);
    const e = spawnEnemy(wHigh, 'wraith', highTx + 0.5, highTy + 0.5, { overlay: false })!;
    expect((e.flags & TRAIT.phases) !== 0).toBe(true);
    // Fake "mid-phase, about to end this tick" without waiting out a full
    // phaseDuration/phasePeriod cycle — the sub-tick `dt` below moves it
    // (almost) nowhere, so it is still standing on the high tile when
    // `updatePhasing` asks whether it may surface there.
    e.ghosting = true;
    e.phaseRemaining = 1e-9;
    step(wHigh, 1);
    expect(e.ghosting).toBe(true); // denied: still phasing

    const normalTx = 10;
    const normalTy = 16;
    const wNormal = newWorld();
    const e2 = spawnEnemy(wNormal, 'wraith', normalTx + 0.5, normalTy + 0.5, { overlay: false })!;
    e2.ghosting = true;
    e2.phaseRemaining = 1e-9;
    step(wNormal, 1);
    expect(e2.ghosting).toBe(false); // allowed: normal ground surfaces it
  });

  it('capped at surfaceBlockCap seconds even with zero relative motion to its target (qa-playtester repro)', () => {
    // A Wraith parked exactly on a huntsWarden target that never moves has
    // zero motion every tick (`setNormalized` of a zero vector moves it
    // nowhere), so before this fix it retried forever: `phaseRemaining`
    // denial never called `unstick`, and the immediate re-arm never gave it
    // a chance to drift off the tile. The cap is the only thing that can
    // resolve this case.
    const tx = 40;
    const ty = 16;
    const w = newWorld();
    w.phase = 'act2';
    warp(w, tx, ty);
    patchTile(w, [[tx, ty, TerrainKind.High]]);
    const e = spawnEnemy(w, 'wraith', tx + 0.5, ty + 0.5, { overlay: true })!;
    e.ghosting = true;
    e.phaseRemaining = 1e-9;

    const cap = terrainCfg.highGround.surfaceBlockCap;
    step(w, Math.floor((cap - 0.5) * 60));
    expect(e.ghosting).toBe(true); // still retrying, well inside the cap

    step(w, 60);
    expect(e.ghosting).toBe(false); // forced to resolve past the cap
    expect(e.highGroundBlockedFor).toBe(0);
  });
});

// fb129: `boss.ts`'s `shatterAlong` and `updateUnreachable` are deliberately
// NOT guarded (SPEC-FINAL §10.5: "the bosses' special attacks still can",
// and the anti-stall failsafe must never fail to find a target) — recorded
// in each function's own doc comment in boss.ts rather than pinned here,
// since neither is exported for a test to drive in isolation.
