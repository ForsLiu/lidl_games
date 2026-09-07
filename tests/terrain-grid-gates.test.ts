/**
 * fb177 — `Grid`'s constructor takes an optional custom gate list.
 *
 * Flagged as a wiring gap in fb156's Log: the constructor bakes gate tiles in
 * at construction with no seed input, so wiring `jitterGates` into a live run
 * needs `openGate()`, not just changing which literal `world.ts` writes. This
 * file pins the piece that gap named as squarely this lane's hook file to
 * fix — `constructor(gates: readonly GateDef[] = GATES)` — without wiring
 * `jitterGates` into `World` (still `fb154`'s job, out of this lane's Scope).
 *
 * What this pins, and why each one is here:
 *   - `new Grid(jitterGates(1))` bakes exactly those 4 tiles as gates, and no
 *     others — checked against the actual tile/blocked flags a gate carries,
 *     the same way `tests/terrain-gate-open.test.ts` checks them;
 *   - `new Grid()` is unchanged: the default parameter is `GATES`, so the
 *     three original tiles are Gate and every other border tile is Border,
 *     exactly as before this item;
 *   - a custom list with an illegal position (off-border, a corner, a
 *     non-integer tile, an off-grid tile) throws, naming what is wrong, the
 *     same way `openGate` already does for a single bad tile — pinned by
 *     reusing the exact message substrings `tests/terrain-gate-open.test.ts`
 *     already asserts against `openGate` itself, so the two paths are proven
 *     to refuse identically rather than merely both refusing;
 *   - two entries of a custom list at the same tile throw too, a rule
 *     `openGate`'s single-gate call never had to have.
 */

import { describe, expect, it } from 'vitest';

import { GATES, Grid, GRID_H, GRID_W, TileType, type GateDef } from '../src/sim/grid';
import { jitterGates } from '../src/sim/terrain';

/** Every border tile, as flat indices, in a fixed order. */
function borderIndices(): number[] {
  const out: number[] = [];
  for (let x = 0; x < GRID_W; x++) {
    out.push(x, (GRID_H - 1) * GRID_W + x);
  }
  for (let y = 1; y < GRID_H - 1; y++) {
    out.push(y * GRID_W, y * GRID_W + (GRID_W - 1));
  }
  return out;
}

describe('fb177 — Grid(gates) accepts a custom gate list', () => {
  it('new Grid() defaults to GATES, byte-identical to before this item', () => {
    const g = new Grid();
    const gateIdx = new Set(GATES.map((gt) => gt.ty * GRID_W + gt.tx));
    expect(gateIdx.size).toBe(3);
    for (const i of borderIndices()) {
      expect(g.tile[i], `tile ${i}`).toBe(gateIdx.has(i) ? TileType.Gate : TileType.Border);
    }
    for (const gt of GATES) {
      const i = gt.ty * GRID_W + gt.tx;
      expect(g.blocked[i], gt.key).toBe(0);
      expect(g.passable(gt.tx, gt.ty), gt.key).toBe(true);
    }
    // Explicitly passing GATES is the same grid as the default parameter.
    const explicit = new Grid(GATES);
    expect(explicit.tile).toEqual(g.tile);
    expect(explicit.blocked).toEqual(g.blocked);
  });

  it('a value-equal copy of GATES is NOT exempt from validation, unlike the literal default', () => {
    // code-reviewer finding on fb177: the constructor skips
    // `assertGateListLegal` only for the literal `GATES` export, by reference
    // (`gates !== GATES`), not by value. This is deliberate — see the
    // constructor's own doc comment — but was previously unpinned by any
    // test, so a future "fix" to a deep-equality check would silently change
    // the behavior with nothing going red.
    //
    // Today it also throws, for a reason this test pins rather than assumes:
    // `GATES.east` (`{tx:35,ty:17}`) is not a legal border tile at the
    // current 56x32 grid (fb181's bug, unshipped as of this item — fb166's
    // resize left it stale). A copy of `GATES` is therefore genuinely
    // illegal input to `assertGateListLegal`, not just "different by
    // reference" — this test's assertion is real validation firing on a
    // real bad coordinate, not an arbitrary reference-equality quirk.
    // Once fb181 corrects `GATES.east`, this exact call stops throwing (a
    // copy of a legal `GATES` is legal input), and this test's `.toThrow()`
    // would need to flip to `.not.toThrow()` — which is the intended
    // signal that the underlying bug was fixed, not a test to weaken now.
    expect(() => new Grid([...GATES])).toThrow(/not a border tile/);
    expect(() => new Grid(GATES.slice())).toThrow(/not a border tile/);
  });

  it('new Grid(jitterGates(1)) opens exactly those 4 tiles as gates and no others', () => {
    const gates = jitterGates(1);
    expect(gates).toHaveLength(4);
    const g = new Grid(gates);
    const gateIdx = new Set(gates.map((gt) => gt.ty * GRID_W + gt.tx));
    expect(gateIdx.size).toBe(4); // no accidental collision baked into the fixture itself
    for (const i of borderIndices()) {
      expect(g.tile[i], `tile ${i}`).toBe(gateIdx.has(i) ? TileType.Gate : TileType.Border);
    }
    // The 4 jittered tiles are walkable gates, exactly like the default ones.
    for (const gt of gates) {
      const i = gt.ty * GRID_W + gt.tx;
      expect(g.blocked[i], gt.key).toBe(0);
      expect(g.passable(gt.tx, gt.ty), gt.key).toBe(true);
    }
  });

  it('a different seed jitters to a different (still valid) 4-gate layout', () => {
    const gatesA = jitterGates(1);
    const gatesB = jitterGates(2);
    expect(gatesA).not.toEqual(gatesB);
    const gA = new Grid(gatesA);
    const gB = new Grid(gatesB);
    for (const gt of gatesB) {
      expect(gB.tile[gt.ty * GRID_W + gt.tx]).toBe(TileType.Gate);
    }
    // Different seeds' grids need not agree tile-for-tile away from the gates,
    // but both must still bake exactly 4 gates.
    const countGates = (grid: Grid) => {
      let n = 0;
      for (let i = 0; i < grid.tile.length; i++) if (grid.tile[i] === TileType.Gate) n++;
      return n;
    };
    expect(countGates(gA)).toBe(4);
    expect(countGates(gB)).toBe(4);
  });

  it('refuses an illegal custom gate list the same way openGate refuses a single bad tile', () => {
    const nonInteger: GateDef[] = [{ key: 'bad', tx: 12.5, ty: 0 }];
    expect(() => new Grid(nonInteger)).toThrow(/integer tile/);

    const offGrid: GateDef[] = [{ key: 'bad', tx: -1, ty: 5 }];
    expect(() => new Grid(offGrid)).toThrow(/off the grid/);
    const offGrid2: GateDef[] = [{ key: 'bad', tx: GRID_W, ty: 5 }];
    expect(() => new Grid(offGrid2)).toThrow(/off the grid/);

    for (const [cx, cy] of [
      [0, 0],
      [GRID_W - 1, 0],
      [0, GRID_H - 1],
      [GRID_W - 1, GRID_H - 1],
    ] as const) {
      const corner: GateDef[] = [{ key: 'bad', tx: cx, ty: cy }];
      expect(() => new Grid(corner), `corner (${cx},${cy})`).toThrow(/is a corner/);
    }

    // An off-border interior tile.
    const interior: GateDef[] = [{ key: 'bad', tx: 12, ty: 10 }];
    expect(() => new Grid(interior)).toThrow(/not a border tile/);
  });

  it('refuses two entries of the custom list at the same tile', () => {
    const dup: GateDef[] = [
      { key: 'west', tx: 0, ty: 10 },
      { key: 'imposter', tx: 0, ty: 10 },
    ];
    expect(() => new Grid(dup)).toThrow(/both target tile/);
  });

  it('a legal 5-gate list (base four + a modifier gate) is accepted too', () => {
    const gates: GateDef[] = [...jitterGates(3), { key: 'south2', tx: 3, ty: GRID_H - 1 }];
    const g = new Grid(gates);
    let n = 0;
    for (let i = 0; i < g.tile.length; i++) if (g.tile[i] === TileType.Gate) n++;
    expect(n).toBe(5);
  });
});
