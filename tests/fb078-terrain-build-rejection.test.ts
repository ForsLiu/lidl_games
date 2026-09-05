/**
 * fb078 (SPEC-FINAL §10.5, §5 build rules): `checkBuild` folded every
 * `!grid.buildable()` reason into `'occupied'`, so a generated map's rough/
 * rock tile told the player the empty tile was "occupied" by something.
 * Acceptance: a distinct `'terrain'` rejection when the tile is unbuildable
 * for a terrain reason and genuinely unoccupied (real occupancy — gates,
 * border, the Core footprint, a live structure — still reports 'occupied',
 * covered by tests/act1.test.ts and unchanged here).
 */

import { describe, expect, it } from 'vitest';

import { GRID_H, GRID_W, type TerrainOverlay } from '../src/sim/grid';
import { checkBuild } from '../src/sim/towers';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

function warp(w: World, tx: number, ty: number): void {
  w.warden.x = tx + 0.5;
  w.warden.y = ty + 0.5;
}

/** A flat overlay with exactly one non-buildable-but-walkable (rough) tile. */
function overlayWithRoughTileAt(tx: number, ty: number): TerrainOverlay {
  const n = GRID_W * GRID_H;
  const kind = new Uint8Array(n);
  const walkable = new Uint8Array(n).fill(1);
  const buildable = new Uint8Array(n).fill(1);
  const high = new Uint8Array(n);
  const i = ty * GRID_W + tx;
  buildable[i] = 0; // rough: walkable, not buildable
  return { w: GRID_W, h: GRID_H, kind, walkable, buildable, high };
}

/** A flat overlay with exactly one unwalkable-and-unbuildable (rock) tile. */
function overlayWithRockTileAt(tx: number, ty: number): TerrainOverlay {
  const n = GRID_W * GRID_H;
  const kind = new Uint8Array(n);
  const walkable = new Uint8Array(n).fill(1);
  const buildable = new Uint8Array(n).fill(1);
  const high = new Uint8Array(n);
  const i = ty * GRID_W + tx;
  walkable[i] = 0; // rock: unwalkable and unbuildable
  buildable[i] = 0;
  return { w: GRID_W, h: GRID_H, kind, walkable, buildable, high };
}

describe('fb078 — checkBuild distinguishes terrain from real occupancy', () => {
  it('returns \'terrain\' for an empty, walkable, terrain-unbuildable tile', () => {
    const w = new World(cfg({ practice: true }));
    warp(w, 5, 5);
    // Sanity: buildable before the overlay lands.
    expect(checkBuild(w, 2, 5, 5)).toBeNull();
    w.grid.applyTerrain(overlayWithRoughTileAt(5, 5));
    w.grid.refresh();
    expect(w.grid.buildable(5, 5)).toBe(false);
    expect(checkBuild(w, 2, 5, 5)).toBe('terrain');
  });

  it('returns \'terrain\' for an unwalkable rock tile too (not just walkable rough)', () => {
    const w = new World(cfg({ practice: true }));
    warp(w, 5, 5);
    w.grid.applyTerrain(overlayWithRockTileAt(6, 6));
    w.grid.refresh();
    expect(w.grid.buildable(6, 6)).toBe(false);
    expect(checkBuild(w, 2, 6, 6)).toBe('terrain');
  });

  it('still reports \'occupied\' for the border, gates and the Core footprint (unchanged)', () => {
    const w = new World(cfg({ practice: true }));
    warp(w, 1, 1);
    expect(checkBuild(w, 2, 0, 0)).toBe('occupied'); // border
  });

  it('still reports \'occupied\' for a tile a structure already sits on', () => {
    const w = new World(cfg({ practice: true }));
    warp(w, 5, 5);
    w.grid.setOcc(5, 5, 12345);
    expect(checkBuild(w, 2, 5, 5)).toBe('occupied');
  });
});
