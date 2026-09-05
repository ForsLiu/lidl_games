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

import { GATES, Grid, GRID_H, GRID_W, TileType } from '../src/sim/grid';
import {
  generateTerrain,
  gridTerrain,
  loadTerrain,
  terrainOverlay,
  TerrainKind,
} from '../src/sim/terrain';
import { applyRunTerrain } from '../src/sim/world';

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

  it('re-derives the same arrays as opening the gate before the SAME overlay', () => {
    // What this does and does not say. Given one overlay, the two orderings
    // produce the same board — that is the array re-derivation `openGate`
    // exists for, and it is compared over every mask `syncTerrain` touches plus
    // the flow field, not just the three a first version checked. It is **not**
    // a statement that late opening is safe in a run; the case below measures
    // why it is not.
    const field = Grid.makeField();
    const other = Grid.makeField();
    for (const seed of [1, 7, 40, 4426]) {
      const overlay = terrainOverlay(generateTerrain(seed, cfg), cfg);
      const before = new Grid();
      before.tile[before.idx(SOUTH.tx, SOUTH.ty)] = TileType.Gate;
      before.applyTerrain(overlay);
      before.refresh();

      const after = applied(seed);
      after.openGate(SOUTH.tx, SOUTH.ty);
      after.refresh();

      expect(Array.from(after.terrainKind)).toEqual(Array.from(before.terrainKind));
      expect(Array.from(after.tile)).toEqual(Array.from(before.tile));
      expect(Array.from(after.blocked)).toEqual(Array.from(before.blocked));
      // The public predicates, which is what a caller sees...
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          const where = `seed ${seed} (${x},${y})`;
          expect(after.buildable(x, y), `buildable ${where}`).toBe(before.buildable(x, y));
          expect(after.isHighGround(x, y), `high ${where}`).toBe(before.isHighGround(x, y));
          expect(after.wardenPassable(x, y), `warden ${where}`).toBe(before.wardenPassable(x, y));
        }
      }
      // ...and then the four private masks directly, because the predicates
      // above **cannot** tell these two apart and a first version of this test
      // wrongly assumed they could. Every one of the three extra masks is read
      // only through a predicate that first requires `tile === Open`, and a
      // gate tile never is — so a patch-style `openGate` (set `terrainKind` and
      // `terrainBlock` at the one tile, call `markDirty`) passed the whole file
      // with the public surface identical. Reaching in is what makes
      // "re-derived, not patched" an assertion instead of a comment; verified
      // by applying exactly that mutant in a worktree and watching this loop
      // catch it.
      for (const mask of [
        'terrainBlock',
        'terrainNoBuild',
        'terrainHigh',
        'terrainCharBlock',
      ] as const) {
        const read = (g: Grid): number[] =>
          Array.from((g as unknown as Record<string, Uint8Array>)[mask]);
        expect(read(after), `${mask} seed ${seed}`).toEqual(read(before));
      }
      // And the thing the sim actually walks on.
      after.computeField(field, [after.idx(SOUTH.tx, SOUTH.ty)], false);
      before.computeField(other, [before.idx(SOUTH.tx, SOUTH.ty)], false);
      expect(Array.from(field.dist)).toEqual(Array.from(other.dist));
    }
  });

  it('does NOT make late opening safe — the claim this item first shipped wrong', () => {
    // **The correction, pinned so it cannot drift back.** `grid.ts`'s doc block
    // said `openGate` "gives the same board either way", i.e. that it removed
    // the ordering constraint. Measured, that is false and dangerously so.
    // Terrain generation is gate-aware and `applyRunTerrain` retries
    // `seed + 1 …` until `allGatesReachable()` over the gate list *it* was
    // handed, so a gate opened afterwards gets neither. Terrain never changes
    // again, so an unreachable gate stays unreachable and a wave spawns into a
    // sealed pocket.
    //
    // A 40-seed window of the 300-seed reading recorded in BACKLOG-TERRAIN.md
    // (77/300 = 25.7% sealed when opened late, 0/300 under world's ordering).
    // This window reads 7/40 = 17.5%, which is the sampling noise a 40-seed
    // window has and not a disagreement — it is pinned as the window's own
    // exact count, because a golden that moves is the point. The claim the
    // case exists to hold is the *contrast*: late opening seals gates, world's
    // ordering never does.
    let sealedLate = 0;
    let sealedReal = 0;
    const warn = console.warn;
    console.warn = (): void => {};
    try {
      for (let seed = 1; seed <= 40; seed++) {
        const late = new Grid();
        applyRunTerrain(late, GATES, seed, cfg);
        late.openGate(SOUTH.tx, SOUTH.ty);
        late.refresh();
        if (late.distAt(SOUTH.tx, SOUTH.ty) === -1) sealedLate++;

        // World's real ordering: the gate is open *before* generation, and the
        // generator is told about it.
        const real = new Grid();
        real.openGate(SOUTH.tx, SOUTH.ty);
        applyRunTerrain(real, [...GATES, { key: 'south', ...SOUTH }], seed, cfg);
        real.refresh();
        if (real.distAt(SOUTH.tx, SOUTH.ty) === -1) sealedReal++;
      }
    } finally {
      console.warn = warn;
    }
    expect({ sealedLate, sealedReal }).toEqual({ sealedLate: 7, sealedReal: 0 });
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
    // A corner is border, and is still not an openable gate: its only interior
    // neighbour is diagonal, so the flow field never reaches it and
    // `allGatesReachable()` goes false the moment one exists.
    for (const [cx, cy] of [
      [0, 0],
      [GRID_W - 1, 0],
      [0, GRID_H - 1],
      [GRID_W - 1, GRID_H - 1],
    ]) {
      expect(() => g.openGate(cx, cy), `corner (${cx},${cy})`).toThrow(/is a corner/);
    }
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
    // ...but re-opening an already-open gate still does not, because it mutates
    // nothing and so cannot bury a standing tower. That ordering is what lets
    // `world.ts`'s loop over all four gates stay a plain loop at the merge, so
    // it is pinned rather than left as an implementation accident.
    for (const gate of GATES) {
      expect(() => g.openGate(gate.tx, gate.ty), gate.key).not.toThrow();
    }
  });
});
