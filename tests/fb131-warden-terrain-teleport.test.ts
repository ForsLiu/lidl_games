/**
 * fb131 — three Warden teleports (the Act I reform, the Sundering's return
 * to the Core, and the per-tick interpolation a dash resolves into) used to
 * either bypass `wardenPassable` outright or check only an endpoint rather
 * than the ground actually crossed to reach it. `tests/terrain-grid.test.ts`
 * already pins `wardenPassable` itself; this file pins the three call sites
 * BACKLOG.md fb131 named, plus the new `Grid.nearestWardenPassable` helper
 * they share.
 */

import { describe, expect, it } from 'vitest';

import { GRID_H, GRID_W, Grid } from '../src/sim/grid';
import { damageWarden } from '../src/sim/run';
import { finishSundering } from '../src/sim/sundering';
import { loadTerrain, terrainOverlay, TerrainKind, flatTerrain } from '../src/sim/terrain';
import { resolveDashTarget } from '../src/sim/wardenmove';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const terrainCfg = loadTerrain();

function newWorld(): World {
  // fb077: fixed-tile assertions need the flat pre-fb077 board (mirrors
  // fb129's own `newWorld`), not real generated terrain — each test
  // hand-patches the one tile it cares about.
  const w = new World(cfg({ practice: true }));
  w.gold = 100000;
  return w;
}

/** Patch tiles of the flat arena to `kind`. Must run before anything is built. */
function patchTile(w: World, tiles: ReadonlyArray<readonly [number, number, TerrainKind]>): void {
  const map = flatTerrain();
  const kind = map.kind.slice();
  for (const [tx, ty, k] of tiles) kind[ty * GRID_W + tx] = k;
  w.grid.applyTerrain(terrainOverlay({ w: map.w, h: map.h, kind }, terrainCfg));
  w.grid.refresh();
}

/** A rock-bordered flat grid with a hand-placed patch, for the Grid-only unit tests. */
function handMap(patch: Array<[number, number, TerrainKind]>): { w: number; h: number; kind: Uint8Array } {
  const kind = flatTerrain().kind.slice();
  for (const [x, y, k] of patch) kind[y * GRID_W + x] = k;
  return { w: GRID_W, h: GRID_H, kind };
}

function appliedGrid(patch: Array<[number, number, TerrainKind]>): Grid {
  const g = new Grid();
  g.applyTerrain(terrainOverlay(handMap(patch), terrainCfg));
  g.refresh();
  return g;
}

describe('fb131 — Grid.nearestWardenPassable', () => {
  it('returns the tile itself when it is already wardenPassable', () => {
    const g = appliedGrid([]);
    expect(g.nearestWardenPassable(10, 10)).toEqual({ tx: 10, ty: 10 });
  });

  it('throws on a non-integer tile, matching placeCore/openGate — no live caller ever has one', () => {
    const g = appliedGrid([]);
    expect(() => g.nearestWardenPassable(10.7, 10)).toThrow(/not an integer tile/);
    expect(() => g.nearestWardenPassable(10, NaN)).toThrow(/not an integer tile/);
  });

  it('walks outward to the nearest open tile around an isolated blocked one, deterministically', () => {
    const g = appliedGrid([[10, 10, TerrainKind.Rock]]);
    expect(g.wardenPassable(10, 10)).toBe(false);
    const nearest = g.nearestWardenPassable(10, 10);
    expect(g.wardenPassable(nearest.tx, nearest.ty)).toBe(true);
    expect(Math.max(Math.abs(nearest.tx - 10), Math.abs(nearest.ty - 10))).toBe(1);
    // Every neighbour is open, so ring 1's fixed scan order (top row,
    // left-to-right, before the side edges) picks the same tile every time.
    expect(nearest).toEqual({ tx: 9, ty: 9 });
  });

  it('reaches past a wider blocked patch to the nearest open ring', () => {
    const g = appliedGrid([
      [9, 9, TerrainKind.Rock],
      [10, 9, TerrainKind.Rock],
      [11, 9, TerrainKind.Rock],
      [9, 10, TerrainKind.Rock],
      [10, 10, TerrainKind.Rock],
      [11, 10, TerrainKind.Rock],
      [9, 11, TerrainKind.Rock],
      [10, 11, TerrainKind.Rock],
      [11, 11, TerrainKind.Rock],
    ]);
    const nearest = g.nearestWardenPassable(10, 10);
    expect(g.wardenPassable(nearest.tx, nearest.ty)).toBe(true);
    expect(Math.max(Math.abs(nearest.tx - 10), Math.abs(nearest.ty - 10))).toBe(2);
  });
});

describe('fb131 — Act I reform snaps off rock', () => {
  it('lands the reformed Warden on open ground, not in the rock the old fixed offset assumed clear', () => {
    const w = newWorld();
    const c = w.grid.coreCenterOf();
    // The exact tile the pre-fix `wd.x = c.x - 2` offset used to assume was
    // always clear.
    patchTile(w, [[c.x - 2, c.y, TerrainKind.Rock]]);
    expect(w.grid.wardenPassable(c.x - 2, c.y)).toBe(false);

    w.warden.hp = 1;
    w.warden.dashIFrames = 0;
    damageWarden(w, 999999);

    expect(w.warden.hp).toBeGreaterThan(0); // reformed, not defeated (Act I)
    expect(w.grid.wardenPassable(Math.floor(w.warden.x), Math.floor(w.warden.y))).toBe(true);
    expect(w.warden.x === c.x - 2 && w.warden.y === c.y).toBe(false);
  });

  it('keeps the old exact offset when nothing blocks it (no behavior change on every other seed)', () => {
    const w = newWorld();
    const c = w.grid.coreCenterOf();
    w.warden.hp = 1;
    w.warden.dashIFrames = 0;
    damageWarden(w, 999999);
    expect(w.warden.x).toBe(c.x - 2);
    expect(w.warden.y).toBe(c.y);
  });
});

describe('fb131 — the Sundering snaps its return-to-Core landing defensively', () => {
  it('still lands exactly on the Core centre, which always outranks the scatter', () => {
    const w = newWorld();
    const c = w.grid.coreCenterOf();
    finishSundering(w);
    expect(w.warden.x).toBe(c.x);
    expect(w.warden.y).toBe(c.y);
    expect(w.grid.wardenPassable(c.x, c.y)).toBe(true);
  });
});

describe('fb131 — a dash samples its whole line, not just the endpoint', () => {
  it('stops short of a rock wall instead of resolving to open ground on the far side', () => {
    const w = newWorld();
    w.warden.x = 20.5;
    w.warden.y = 10.5;
    // A rock wall three tiles ahead, with open ground just past it.
    patchTile(w, [
      [23, 10, TerrainKind.Rock],
      [23, 11, TerrainKind.Rock],
    ]);
    // The far endpoint (26, 10/11 area) is itself open ground — the old
    // endpoint-only check would have resolved straight to it.
    const target = resolveDashTarget(w, 6, 0);
    expect(w.grid.wardenPassable(Math.floor(target.x), Math.floor(target.y))).toBe(true);
    // Must not have crossed the wall: landed at or before it, not past it.
    expect(target.x).toBeLessThan(23);
  });

  it('still reaches the full target when the whole line is clear', () => {
    const w = newWorld();
    w.warden.x = 20.5;
    w.warden.y = 10.5;
    const target = resolveDashTarget(w, 4, 0);
    expect(target.x).toBeCloseTo(24.5, 5);
    expect(target.y).toBeCloseTo(10.5, 5);
  });

  it('still backs off toward the Warden when the target tile itself is blocked', () => {
    const w = newWorld();
    w.warden.x = 20.5;
    w.warden.y = 10.5;
    patchTile(w, [[24, 10, TerrainKind.Rock]]);
    const target = resolveDashTarget(w, 4, 0);
    expect(w.grid.wardenPassable(Math.floor(target.x), Math.floor(target.y))).toBe(true);
    expect(target.x).toBeLessThan(24);
  });

  it('catches a chord that clips a blocked tile corner in under a tenth of a tile (qa-playtester repro)', () => {
    // A first fix sampled the line at fixed 0.1-tile steps; qa-playtester
    // found this exact geometry — both endpoints legal, but the segment
    // between them clips rock (15, 15) for barely 0.024 tile near its
    // corner — fell entirely between two samples and went undetected. The
    // grid-walk replacement cannot miss it: it checks every tile the line's
    // interior touches, not points spaced along it.
    const w = newWorld();
    patchTile(w, [[15, 15, TerrainKind.Rock]]);
    w.warden.x = 11.684882054506854;
    w.warden.y = 16.50591110615013;
    const endX = 18.325188345560697;
    const endY = 13.50950108071072;
    const target = resolveDashTarget(w, endX - w.warden.x, endY - w.warden.y);
    expect(target.x === endX && target.y === endY).toBe(false);
    expect(w.grid.wardenPassable(Math.floor(target.x), Math.floor(target.y))).toBe(true);
  });
});
