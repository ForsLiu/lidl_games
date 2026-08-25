/**
 * The Bastion Vale grid (SPEC §2.3) plus flow-field pathing (SPEC §3.1).
 *
 * Two fields are maintained:
 *   ground — structures and petrified terrain block; what normal walkers use.
 *   ghost  — only the map border blocks; used by Burrowers, Wraiths mid-phase
 *            and (trivially) by fliers.
 *
 * Costs are integers (10 orthogonal / 14 diagonal) so the field is bit-exact.
 */

export const GRID_W = 36;
export const GRID_H = 20;
export const TILE = 32;

export const enum TileType {
  Open = 0,
  Border = 1,
  Gate = 2,
  Core = 3,
}

export interface GateDef {
  key: string;
  tx: number;
  ty: number;
}

/** SPEC §2.3: 3 spawn gates (west, north, east), Core 2x2 near east-center. */
export const GATES: readonly GateDef[] = [
  { key: 'west', tx: 0, ty: 10 },
  { key: 'north', tx: 18, ty: 0 },
  { key: 'east', tx: 35, ty: 17 },
];

export const CORE_X = 25;
export const CORE_Y = 9;
export const CORE_W = 2;
export const CORE_H = 2;

const ORTHO_COST = 10;
const DIAG_COST = 14;

const NEIGHBORS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, ORTHO_COST],
  [-1, 0, ORTHO_COST],
  [0, 1, ORTHO_COST],
  [0, -1, ORTHO_COST],
  [1, 1, DIAG_COST],
  [1, -1, DIAG_COST],
  [-1, 1, DIAG_COST],
  [-1, -1, DIAG_COST],
];

export interface Field {
  /** Cost to reach the core, -1 = unreachable. */
  dist: Int32Array;
  /** Index of the next tile toward the core, -1 = none. */
  next: Int32Array;
}

export class Grid {
  readonly w = GRID_W;
  readonly h = GRID_H;
  readonly tile: Uint8Array;
  /** Structure entity id occupying each tile, 0 = free. */
  readonly occ: Int32Array;
  /** 1 where a ground walker cannot stand. Kept in step with tile + occ. */
  readonly blocked: Uint8Array;

  readonly ground: Field;
  readonly ghost: Field;

  private dirty = true;

  constructor() {
    this.tile = new Uint8Array(GRID_W * GRID_H);
    this.occ = new Int32Array(GRID_W * GRID_H);
    this.blocked = new Uint8Array(GRID_W * GRID_H);
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const i = y * GRID_W + x;
        this.tile[i] =
          x === 0 || y === 0 || x === GRID_W - 1 || y === GRID_H - 1 ? TileType.Border : TileType.Open;
      }
    }
    for (const g of GATES) this.tile[g.ty * GRID_W + g.tx] = TileType.Gate;
    for (let dy = 0; dy < CORE_H; dy++) {
      for (let dx = 0; dx < CORE_W; dx++) {
        this.tile[(CORE_Y + dy) * GRID_W + (CORE_X + dx)] = TileType.Core;
      }
    }
    for (let i = 0; i < this.tile.length; i++) {
      this.blocked[i] = this.tile[i] === TileType.Border ? 1 : 0;
    }
    this.ground = { dist: new Int32Array(GRID_W * GRID_H), next: new Int32Array(GRID_W * GRID_H) };
    this.ghost = { dist: new Int32Array(GRID_W * GRID_H), next: new Int32Array(GRID_W * GRID_H) };
    this.rebuild();
  }

  idx(tx: number, ty: number): number {
    return ty * GRID_W + tx;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < GRID_W && ty < GRID_H;
  }

  /** True if a ground walker can stand here. */
  passable(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) return false;
    return this.blocked[ty * GRID_W + tx] === 0;
  }

  /** True if a phasing/burrowing enemy can stand here. */
  passableGhost(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return false;
    return this.tile[ty * GRID_W + tx] !== TileType.Border;
  }

  /** Tiles a tower may be placed on before the path-guarantee check. */
  buildable(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return false;
    const i = ty * GRID_W + tx;
    return this.tile[i] === TileType.Open && this.occ[i] === 0;
  }

  setOcc(tx: number, ty: number, id: number): void {
    const i = ty * GRID_W + tx;
    this.occ[i] = id;
    this.blocked[i] = this.tile[i] === TileType.Border || id !== 0 ? 1 : 0;
    this.dirty = true;
  }

  markDirty(): void {
    for (let i = 0; i < this.tile.length; i++) {
      this.blocked[i] = this.tile[i] === TileType.Border || this.occ[i] !== 0 ? 1 : 0;
    }
    this.dirty = true;
  }

  /** Recompute both flow fields if anything moved. */
  refresh(): void {
    if (!this.dirty) return;
    this.rebuild();
  }

  private rebuild(): void {
    const coreTiles: number[] = [];
    for (let dy = 0; dy < CORE_H; dy++) {
      for (let dx = 0; dx < CORE_W; dx++) {
        coreTiles.push((CORE_Y + dy) * GRID_W + (CORE_X + dx));
      }
    }
    this.dijkstra(this.ground, coreTiles, false);
    this.dijkstra(this.ghost, coreTiles, true);
    this.dirty = false;
  }

  /** Public entry for ad-hoc fields (e.g. the Act II field toward the Warden). */
  computeField(field: Field, sources: readonly number[], ghost: boolean): void {
    this.dijkstra(field, sources, ghost);
  }

  static makeField(): Field {
    return { dist: new Int32Array(GRID_W * GRID_H), next: new Int32Array(GRID_W * GRID_H) };
  }

  private dijkstra(field: Field, sources: readonly number[], ghost: boolean): void {
    const n = GRID_W * GRID_H;
    const dist = field.dist;
    const next = field.next;
    dist.fill(-1);
    next.fill(-1);

    // Dial's algorithm: costs are small integers, so bucket by cost.
    const maxCost = n * DIAG_COST + 1;
    const buckets = new Map<number, number[]>();
    const pushB = (c: number, i: number) => {
      let b = buckets.get(c);
      if (!b) {
        b = [];
        buckets.set(c, b);
      }
      b.push(i);
    };

    for (const i of sources) {
      if (i < 0 || i >= n) continue;
      dist[i] = 0;
      pushB(0, i);
    }

    for (let c = 0; c <= maxCost; c++) {
      const b = buckets.get(c);
      if (!b) continue;
      buckets.delete(c);
      for (let bi = 0; bi < b.length; bi++) {
        const i = b[bi];
        if (dist[i] !== c) continue; // stale entry
        const x = i % GRID_W;
        const y = (i / GRID_W) | 0;
        for (let k = 0; k < NEIGHBORS.length; k++) {
          const nx = x + NEIGHBORS[k][0];
          const ny = y + NEIGHBORS[k][1];
          if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
          const ok = ghost ? this.passableGhost(nx, ny) : this.passable(nx, ny);
          if (!ok) continue;
          // No corner cutting: a diagonal step needs both orthogonal tiles open.
          if (NEIGHBORS[k][2] === DIAG_COST) {
            const a = ghost ? this.passableGhost(nx, y) : this.passable(nx, y);
            const bb = ghost ? this.passableGhost(x, ny) : this.passable(x, ny);
            if (!a || !bb) continue;
          }
          const ni = ny * GRID_W + nx;
          const nd = c + NEIGHBORS[k][2];
          if (dist[ni] === -1 || nd < dist[ni]) {
            dist[ni] = nd;
            next[ni] = i;
            pushB(nd, ni);
          }
        }
      }
      if (buckets.size === 0) break;
    }
  }

  /** Cost from a tile to the core on the given field, -1 if unreachable. */
  distAt(tx: number, ty: number, ghost = false): number {
    if (!this.inBounds(tx, ty)) return -1;
    return (ghost ? this.ghost : this.ground).dist[ty * GRID_W + tx];
  }

  /** Next tile toward the core as [tx,ty], or null. */
  stepFrom(tx: number, ty: number, ghost = false): [number, number] | null {
    if (!this.inBounds(tx, ty)) return null;
    const f = ghost ? this.ghost : this.ground;
    const i = f.next[ty * GRID_W + tx];
    if (i < 0) return null;
    return [i % GRID_W, (i / GRID_W) | 0];
  }

  /** SPEC §3.1 path guarantee: every gate must still reach the Core. */
  allGatesReachable(): boolean {
    this.refresh();
    for (let i = 0; i < this.tile.length; i++) {
      if (this.tile[i] === TileType.Gate && this.ground.dist[i] < 0) return false;
    }
    return true;
  }

  /** Would occupying these tiles cut a gate off? Restores state either way. */
  wouldBlockPath(tiles: ReadonlyArray<[number, number]>): boolean {
    const saved: number[] = [];
    for (const [tx, ty] of tiles) {
      const i = ty * GRID_W + tx;
      saved.push(this.occ[i]);
      this.occ[i] = -1;
      this.blocked[i] = 1;
    }
    this.dirty = true;
    const ok = this.allGatesReachable();
    for (let k = 0; k < tiles.length; k++) {
      const [tx, ty] = tiles[k];
      const i = ty * GRID_W + tx;
      this.occ[i] = saved[k];
      this.blocked[i] = this.tile[i] === TileType.Border || saved[k] !== 0 ? 1 : 0;
    }
    this.dirty = true;
    this.refresh();
    return !ok;
  }

  static tileCenter(tx: number, ty: number): { x: number; y: number } {
    return { x: tx + 0.5, y: ty + 0.5 };
  }
}

export function coreCenter(): { x: number; y: number } {
  return { x: CORE_X + CORE_W / 2, y: CORE_Y + CORE_H / 2 };
}

/** Cost stored in an arbitrary field, -1 if unreachable. */
export function fieldDist(f: Field, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) return -1;
  return f.dist[ty * GRID_W + tx];
}

/** Next tile toward the field source, or null. */
export function fieldStep(f: Field, tx: number, ty: number): [number, number] | null {
  if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) return null;
  const i = f.next[ty * GRID_W + tx];
  if (i < 0) return null;
  return [i % GRID_W, (i / GRID_W) | 0];
}
