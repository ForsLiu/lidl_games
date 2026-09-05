/**
 * fb065e — a gate opened after terrain is applied must be terrain-consistent.
 *
 * `Grid.syncTerrain` is private and neither `markDirty` nor `refresh` calls it,
 * so a raw `tile[]` write that lands *after* the last `applyTerrain`/
 * `placeCore` updates `blocked` (through `staticBlocked`) and leaves every
 * terrain array untouched. Measured at fb065c: after writing a Gate at
 * (12, 19) the tile reads `tile=Gate`, `blocked=0` — the sim walks through it —
 * while `terrainKind` still says `Rock`, so a repro taken with
 * `gridTerrain` draws a mountain on a walkable gate.
 *
 * The border row is where this bites, and it is not an edge case: gates live on
 * the border, `syncTerrain`'s override loop skips `Border` tiles, and the
 * border is rock on every generated map. `world.ts`'s Fourth Gate is the only
 * such write in the repo today and it is *ordered safely* — it opens the gate
 * before `applyRunTerrain`, so `syncTerrain` covers it — but nothing enforces
 * that ordering, and fb065c made the resulting dump reachable from a real run.
 */

import { describe, expect, it } from 'vitest';

import { GATES, Grid, GRID_W, TileType } from '../src/sim/grid';
import {
  generateTerrain,
  gridTerrain,
  loadTerrain,
  terrainOverlay,
  TerrainKind,
} from '../src/sim/terrain';

const cfg = loadTerrain();

/** The south wall tile `world.ts` opens as the Fourth Gate. */
const SOUTH = { tx: 12, ty: 19 };

function applied(seed: number): Grid {
  const g = new Grid();
  g.applyTerrain(terrainOverlay(generateTerrain(seed, cfg), cfg));
  g.refresh();
  return g;
}

describe('fb065e — opening a gate after terrain is applied', () => {
  it('the raw write leaves the terrain arrays stale — the defect, pinned', () => {
    // Kept as the regression: this is what `openGate` exists to make
    // unnecessary, and it is still reachable because `tile` is a public array.
    const g = applied(7);
    const i = g.idx(SOUTH.tx, SOUTH.ty);
    expect(g.tile[i]).toBe(TileType.Border);
    expect(g.blocked[i]).toBe(1);
    expect(g.terrainKind[i]).toBe(TerrainKind.Rock);

    g.tile[i] = TileType.Gate;
    g.markDirty();
    g.refresh();

    // `blocked` moved; the terrain did not.
    expect(g.blocked[i]).toBe(0);
    expect(g.terrainKind[i]).toBe(TerrainKind.Rock);
    expect(gridTerrain(g).kind[i]).toBe(TerrainKind.Rock);
  });

  it('openGate writes the tile and re-derives the terrain in one step', () => {
    const g = applied(7);
    const i = g.idx(SOUTH.tx, SOUTH.ty);
    expect(g.terrainKind[i]).toBe(TerrainKind.Rock);

    g.openGate(SOUTH.tx, SOUTH.ty);

    expect(g.tile[i]).toBe(TileType.Gate);
    expect(g.blocked[i]).toBe(0);
    // The structural override now covers it, exactly as it covers a gate that
    // was open when `applyTerrain` ran.
    expect(g.terrainKind[i]).toBe(TerrainKind.Normal);
    expect(gridTerrain(g).kind[i]).toBe(TerrainKind.Normal);
  });

  it('gives the same Grid as opening the gate before terrain is applied', () => {
    // The equivalence that makes `openGate` the fix rather than a patch: the
    // safe ordering `world.ts` happens to use, and the unsafe one it does not,
    // must produce the same board. Compared over every array a caller can read.
    for (const seed of [1, 7, 40, 4426]) {
      const before = new Grid();
      before.tile[before.idx(SOUTH.tx, SOUTH.ty)] = TileType.Gate;
      before.markDirty();
      before.applyTerrain(terrainOverlay(generateTerrain(seed, cfg), cfg));
      before.refresh();

      const after = applied(seed);
      after.openGate(SOUTH.tx, SOUTH.ty);
      after.refresh();

      expect(Array.from(after.terrainKind)).toEqual(Array.from(before.terrainKind));
      expect(Array.from(after.tile)).toEqual(Array.from(before.tile));
      expect(Array.from(after.blocked)).toEqual(Array.from(before.blocked));
    }
  });

  it('refuses what it cannot honestly open', () => {
    const g = applied(7);
    expect(() => g.openGate(12.5, 19)).toThrow(/integer tile/);
    expect(() => g.openGate(-1, 19)).toThrow(/off the grid/);
    expect(() => g.openGate(GRID_W, 19)).toThrow(/off the grid/);
    // Interior tiles are not wall: a "gate" in the middle of the board would
    // be a spawn point enemies walk out of with open ground behind it, and
    // `staticBlocked` would stop reporting it as anything.
    expect(() => g.openGate(12, 10)).toThrow(/not a border tile/);
    // Already a gate is a no-op rather than an error — the Fourth Gate loop in
    // `world.ts` re-writes all four gates, three of which are already open.
    for (const gate of GATES) {
      expect(() => g.openGate(gate.tx, gate.ty)).not.toThrow();
      expect(g.tile[g.idx(gate.tx, gate.ty)]).toBe(TileType.Gate);
    }
  });

  it('is refused once structures stand, like its two siblings', () => {
    // `applyTerrain` and `placeCore` both refuse live occupancy, for the same
    // reason: re-deriving the board under a standing tower can bury it in rock
    // that no walker can path to or destroy.
    const g = applied(7);
    g.setOcc(10, 10, 7);
    expect(() => g.openGate(SOUTH.tx, SOUTH.ty)).toThrow(/structures are already placed/);
  });
});
