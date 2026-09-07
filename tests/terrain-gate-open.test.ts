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

import { CORE_H, CORE_W, CORE_X, CORE_Y, GATES, Grid, GRID_H, GRID_W, TileType } from '../src/sim/grid';
import {
  generateTerrain,
  gridTerrain,
  loadTerrain,
  terrainOverlay,
  TerrainKind,
} from '../src/sim/terrain';
import { applyRunTerrain } from '../src/sim/world';

const cfg = loadTerrain();

/**
 * A stand-in for the south wall tile `world.ts` opens as the Fourth Gate.
 *
 * fb166: NOT `MODIFIER_GATES`' actual `south` entry, `{ tx: 12, ty: 19 }` —
 * that coordinate was the 36x20 grid's bottom border (`ty: 19` was
 * `GRID_H - 1`) and is an ordinary interior tile at 56x32 (the border row is
 * now `y: 31`), so `openGate` correctly refuses it as "not a border tile".
 * That is the same gate-coordinate breakage flagged for `GATES`' `east`
 * entry, logged in BACKLOG-TERRAIN.md for the main lane. This file tests the
 * generic late/early gate-opening mechanic, not the Fourth Gate's specific
 * position, so a real border tile at the same `tx` stands in for it.
 */
const SOUTH = { tx: 12, ty: GRID_H - 1 };

/** Every border tile that is not already a gate, in a fixed order. */
function borderTiles(): Array<readonly [number, number]> {
  const out: Array<readonly [number, number]> = [];
  const isGate = (x: number, y: number): boolean => GATES.some((g) => g.tx === x && g.ty === y);
  for (let x = 0; x < GRID_W; x++) {
    for (const y of [0, GRID_H - 1]) if (!isGate(x, y)) out.push([x, y]);
  }
  for (let y = 1; y < GRID_H - 1; y++) {
    for (const x of [0, GRID_W - 1]) if (!isGate(x, y)) out.push([x, y]);
  }
  return out;
}

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

  it('...and the staleness is not border-only, which the first record understated', () => {
    // QA's finding. The accepted case was written as a border-row story — gates
    // live on the border, `syncTerrain` skips `Border`, the border is rock — and
    // all of that is true, but none of it is what causes the staleness. Any
    // structural `tile[]` write after the last sync leaves the terrain arrays
    // holding the old answer, wherever it lands. Measured on an *interior*
    // tile: (6,1) on seed 7 is `Open`/`Rock`/`blocked=1`, and a raw Gate write
    // there gives `Gate`/`Rock`/`blocked=0` — identical to the border case.
    //
    // No shipped API can produce this (`openGate` refuses a non-border tile and
    // `placeCore` refuses non-normal terrain), so it is a defect in the
    // *record* rather than a new hole; recorded here so the accepted case is
    // stated as wide as it is.
    //
    // fb166: (49, 1), not (6, 1) — the old grid's interior Rock witness at
    // seed 7 is a different tile's map now, so this is a freshly found
    // interior Rock tile on the same seed at 56x32.
    const g = applied(7);
    const i = g.idx(49, 1);
    expect([g.tile[i], g.terrainKind[i], g.blocked[i]]).toEqual([
      TileType.Open,
      TerrainKind.Rock,
      1,
    ]);
    g.tile[i] = TileType.Gate;
    g.markDirty();
    g.refresh();
    expect([g.tile[i], g.terrainKind[i], g.blocked[i]]).toEqual([
      TileType.Gate,
      TerrainKind.Rock,
      0,
    ]);
    // The border framing was not wrong about the border, though: every
    // top/bottom border tile that is not a gate is `Rock` on every generated
    // map (336 tiles checked over these 3 seeds — 2 * GRID_W per seed — with
    // exactly 3 exceptions, one per seed: `north`'s gate at (18, 0) is the
    // only one of the three `GATES` entries that actually sits on this
    // 56x32 grid's top/bottom border; `east`'s no longer does, which is the
    // gate-coordinate breakage this file's header note points at).
    for (const seed of [1, 7, 40]) {
      const map = generateTerrain(seed, cfg);
      for (let x = 0; x < GRID_W; x++) {
        for (const y of [0, GRID_H - 1]) {
          if (GATES.some((gate) => gate.tx === x && gate.ty === y)) continue;
          expect(map.kind[y * GRID_W + x], `seed ${seed} (${x},${y})`).toBe(TerrainKind.Rock);
        }
      }
    }
  });

  it('re-derives the whole board, not the one tile — which is what a patch cannot fake', () => {
    // QA's second finding, turned into the assertion the private-mask
    // comparison was standing in for. `syncTerrain` rebuilds all 720 tiles from
    // the raw overlay and the *current* structural tiles, so `openGate` also
    // repairs drift anywhere else on the board. That is desirable and it was
    // documented nowhere — and it is the one behaviour a patch-style
    // implementation cannot imitate through the public surface.
    //
    // The fixture: an overlay whose Core footprint is really rock. `Grid` hides
    // that behind the structural override while the Core stands there; vacate
    // the footprint with a raw write and the override is stale, leaving two
    // tiles of phantom normal ground over rock. `openGate`, 300-odd tiles away,
    // puts it back.
    const kind = new Uint8Array(GRID_W * GRID_H).fill(TerrainKind.Normal);
    for (let x = 0; x < GRID_W; x++) {
      kind[x] = TerrainKind.Rock;
      kind[(GRID_H - 1) * GRID_W + x] = TerrainKind.Rock;
    }
    for (let y = 0; y < GRID_H; y++) {
      kind[y * GRID_W] = TerrainKind.Rock;
      kind[y * GRID_W + GRID_W - 1] = TerrainKind.Rock;
    }
    for (const gate of GATES) kind[gate.ty * GRID_W + gate.tx] = TerrainKind.Normal;
    for (let dy = 0; dy < CORE_H; dy++) {
      for (let dx = 0; dx < CORE_W; dx++) kind[(CORE_Y + dy) * GRID_W + (CORE_X + dx)] = TerrainKind.Rock;
    }
    const g = new Grid();
    g.applyTerrain(terrainOverlay({ w: GRID_W, h: GRID_H, kind }, cfg));
    g.refresh();

    const ci = g.idx(CORE_X, CORE_Y);
    // The override hides the rock while the Core stands on it.
    expect(g.terrainKind[ci]).toBe(TerrainKind.Normal);
    // A raw vacate leaves that hiding in place: phantom normal ground on rock.
    for (let dy = 0; dy < CORE_H; dy++) {
      for (let dx = 0; dx < CORE_W; dx++) g.tile[g.idx(CORE_X + dx, CORE_Y + dy)] = TileType.Open;
    }
    g.markDirty();
    g.refresh();
    expect(g.terrainKind[ci]).toBe(TerrainKind.Normal);
    expect(g.blocked[ci]).toBe(0);

    // ...and opening a gate on the far side of the board repairs it.
    g.openGate(12, GRID_H - 1);
    expect(g.terrainKind[ci]).toBe(TerrainKind.Rock);
    expect(g.blocked[ci]).toBe(1);
  });

  it('does not check that the gate it opened is reachable, and that is a decision', () => {
    // `openGate` refuses what cannot *be* a gate (a non-border tile, a corner)
    // but not what no map can *reach*. fb166 re-measured at 56x32 over seeds
    // 1, 7, 40, 52, 99 and every legal single opening: **203 of 830 (24.5%)**
    // leave some gate unreachable, because the border tile chosen may sit
    // behind a rock shelf — close to the old grid's 25.9% rate, and `opened`
    // rose with the bigger board's longer perimeter (170 non-gate border
    // tiles now, against the old grid's 101).
    //
    // Left to the caller on purpose: the reachable set depends on the whole
    // board, `applyRunTerrain` already re-checks `allGatesReachable()` and
    // regenerates, and a refusal here would turn a recoverable situation into a
    // throw out of a World constructor. The rate is pinned so a generator
    // retune moves a number rather than silently changing what a caller must
    // check.
    let stranded = 0;
    let opened = 0;
    for (const seed of [1, 7, 40, 52, 99]) {
      for (const [x, y] of borderTiles()) {
        const g = applied(seed);
        try {
          g.openGate(x, y);
        } catch {
          continue;
        }
        g.refresh();
        opened++;
        if (!g.allGatesReachable()) stranded++;
      }
    }
    expect({ opened, stranded }).toEqual({ opened: 830, stranded: 203 });
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
    // (77/300 = 25.7% sealed when opened late, 0/300 under world's ordering),
    // both measured on the old 36x20 grid. fb166 re-measured this window at
    // 56x32: 10/40 = 25.0% sealed late, 0/40 under world's ordering — the rate
    // held close to the old grid's despite the resize. It is pinned as the
    // window's own exact count, because a golden that moves is the point. The
    // claim the case exists to hold is the *contrast*: late opening seals
    // gates, world's ordering never does.
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
    expect({ sealedLate, sealedReal }).toEqual({ sealedLate: 10, sealedReal: 0 });
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
