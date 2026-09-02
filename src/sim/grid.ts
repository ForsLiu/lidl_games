/**
 * The Bastion Vale grid (SPEC §2.3) plus flow-field pathing.
 *
 * Two fields are maintained:
 *   ground — SPEC-FINAL §10: structures are high-cost *passable* tiles, priced
 *            at `breachBase + breach[tile]` (∝ HP × toughness, set by the
 *            World). An open path is always cheaper than any breach, so walkers
 *            play classic TD while one exists; sealed, the field runs the
 *            cheapest breach route and the walkers chew what it crosses.
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

/**
 * How a Dijkstra pass reads the map.
 *   blocked — structures and the border block outright (physical walkers; the
 *             Act II Warden-chase field, and the `wouldBlockPath` diagnostic).
 *   ghost   — only the border blocks, no surcharge (Burrowers, Wraiths).
 *   breach  — SPEC-FINAL §10: the border blocks; a structure tile is enterable
 *             *orthogonally* at `breachBase + breach[tile]`. Diagonal steps
 *             stay fully physical — a walker cannot slip past (or out of) a
 *             structure corner it would otherwise have to chew through.
 */
type FieldMode = 'blocked' | 'ghost' | 'breach';

export class Grid {
  readonly w = GRID_W;
  readonly h = GRID_H;
  readonly tile: Uint8Array;
  /** Structure entity id occupying each tile, 0 = free. */
  readonly occ: Int32Array;
  /** 1 where a ground walker cannot stand. Kept in step with tile + occ. */
  readonly blocked: Uint8Array;
  /**
   * SPEC-FINAL §10: the per-tile breach surcharge (path-cost units) for the
   * structure occupying it — the ∝ HP × toughness part, set by
   * `World.refreshBreach`. 0 on open tiles.
   */
  readonly breach: Int32Array;
  /**
   * Flat surcharge for entering *any* structure tile, on top of `breach`.
   * Sized above the longest walkable route on the map so an open path always
   * beats a breach (§10: "open path exists → enemies walk it"). The authored
   * value lives in data/towers.json (`breach.base`); the World writes it here.
   * The literal below only backs bare-Grid unit tests, which build no content.
   */
  breachBase = 8000;

  readonly ground: Field;
  readonly ghost: Field;
  /** Scratch for the physical-reachability diagnostic; never read by the sim. */
  private readonly scratch: Field;

  private dirty = true;

  constructor() {
    this.tile = new Uint8Array(GRID_W * GRID_H);
    this.occ = new Int32Array(GRID_W * GRID_H);
    this.blocked = new Uint8Array(GRID_W * GRID_H);
    this.breach = new Int32Array(GRID_W * GRID_H);
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
    this.scratch = { dist: new Int32Array(GRID_W * GRID_H), next: new Int32Array(GRID_W * GRID_H) };
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

  /**
   * True if the Warden (walk or dash) can stand here — only the map border
   * blocks (fb002, §10 amendment): the Warden walks/flies freely through the
   * Core and every friendly structure. Enemy pathing keeps reading
   * `passable`/`blocked` unchanged, so this predicate is Warden-only.
   */
  wardenPassable(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return false;
    return this.tile[ty * GRID_W + tx] !== TileType.Border;
  }

  /** Tiles a tower may be placed on before the path-guarantee check. */
  buildable(tx: number, ty: number): boolean {
    // b007: a fractional tx/ty can still multiply out to a legal integer flat
    // index (GRID_W is even, so ty=<legal>+0.5 cancels the fraction), landing
    // the build on a real, different tile while storing the raw fraction into
    // the Structure. Reject non-integer coords outright, matching every other
    // integer-only tile read.
    if (!Number.isInteger(tx) || !Number.isInteger(ty)) return false;
    if (!this.inBounds(tx, ty)) return false;
    const i = ty * GRID_W + tx;
    return this.tile[i] === TileType.Open && this.occ[i] === 0;
  }

  setOcc(tx: number, ty: number, id: number): void {
    const i = ty * GRID_W + tx;
    this.occ[i] = id;
    this.blocked[i] = this.tile[i] === TileType.Border || id !== 0 ? 1 : 0;
    // Any occupancy transition invalidates the old price: a vacated tile is
    // free again, and a new occupant starts at surcharge 0 until the World
    // prices it (`breachBase` alone still guards it meanwhile).
    this.breach[i] = 0;
    this.dirty = true;
  }

  /** Price a structure tile's breach surcharge (World computes the value). */
  setBreach(tx: number, ty: number, cost: number): void {
    const i = ty * GRID_W + tx;
    if (this.breach[i] === cost) return;
    this.breach[i] = cost;
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

  private coreTiles(): number[] {
    const tiles: number[] = [];
    for (let dy = 0; dy < CORE_H; dy++) {
      for (let dx = 0; dx < CORE_W; dx++) {
        tiles.push((CORE_Y + dy) * GRID_W + (CORE_X + dx));
      }
    }
    return tiles;
  }

  private rebuild(): void {
    const coreTiles = this.coreTiles();
    this.dijkstra(this.ground, coreTiles, 'breach');
    this.dijkstra(this.ghost, coreTiles, 'ghost');
    this.dirty = false;
  }

  /**
   * Public entry for ad-hoc fields (e.g. the Act II field toward the Warden).
   * Ad-hoc fields stay physical: §10's breach pricing is about reaching the
   * Core, and the Act II chase keeps its blocked-mask + beeline-fallback rules.
   */
  computeField(field: Field, sources: readonly number[], ghost: boolean): void {
    this.dijkstra(field, sources, ghost ? 'ghost' : 'blocked');
  }

  static makeField(): Field {
    return { dist: new Int32Array(GRID_W * GRID_H), next: new Int32Array(GRID_W * GRID_H) };
  }

  private dijkstra(field: Field, sources: readonly number[], mode: FieldMode): void {
    const n = GRID_W * GRID_H;
    const dist = field.dist;
    const next = field.next;
    dist.fill(-1);
    next.fill(-1);

    // Dial's algorithm, buckets keyed by cost. Breach surcharges push costs
    // far past the old n × DIAG bound, so instead of counting c upward one at
    // a time the loop extracts the smallest live key — same ascending order,
    // same FIFO within a bucket, so a breach-free map produces the exact field
    // the counting loop did.
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

    while (buckets.size > 0) {
      let c = -1;
      for (const key of buckets.keys()) if (c < 0 || key < c) c = key;
      const b = buckets.get(c)!;
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
          const diag = NEIGHBORS[k][2] === DIAG_COST;
          let extra = 0;
          if (mode === 'ghost') {
            if (!this.passableGhost(nx, ny)) continue;
            // No corner cutting: a diagonal step needs both orthogonals open.
            if (diag && (!this.passableGhost(nx, y) || !this.passableGhost(x, ny))) continue;
          } else if (mode === 'blocked') {
            if (!this.passable(nx, ny)) continue;
            if (diag && (!this.passable(nx, y) || !this.passable(x, ny))) continue;
          } else {
            // breach: diagonal steps stay fully physical (all four tiles open);
            // orthogonal steps may enter a structure tile at its price.
            if (diag) {
              if (!this.passable(nx, ny) || !this.passable(x, y)) continue;
              if (!this.passable(nx, y) || !this.passable(x, ny)) continue;
            } else {
              if (!this.passableGhost(nx, ny)) continue;
              // The surcharge lands on the *relaxed* tile — the walker's
              // standing tile, not the one entered. Route choice is identical
              // either way (a tile's surcharge is a constant offset across
              // every route through it), but it means `dist` at a structure
              // tile includes chewing that tile itself, so do not read `dist`
              // as "cost ahead of me" from inside a structure.
              const ni2 = ny * GRID_W + nx;
              if (this.occ[ni2] !== 0) extra = this.breachBase + this.breach[ni2];
            }
          }
          const ni = ny * GRID_W + nx;
          const nd = c + NEIGHBORS[k][2] + extra;
          if (dist[ni] === -1 || nd < dist[ni]) {
            dist[ni] = nd;
            next[ni] = i;
            pushB(nd, ni);
          }
        }
      }
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

  /**
   * Does every gate reach the Core *without breaching*? No longer a build
   * rule — SPEC-FINAL §10 legalises sealing — but still the diagnostic that
   * tells a sealed board from an open one (bots, tools and tests ask it).
   * Runs on the physical blocked mask via the scratch field; the live ground
   * field would answer yes to everything, since a breach is always a path.
   */
  allGatesReachable(): boolean {
    this.dijkstra(this.scratch, this.coreTiles(), 'blocked');
    for (let i = 0; i < this.tile.length; i++) {
      if (this.tile[i] === TileType.Gate && this.scratch.dist[i] < 0) return false;
    }
    return true;
  }

  /** Would occupying these tiles seal a gate off? Restores state either way. */
  wouldBlockPath(tiles: ReadonlyArray<[number, number]>): boolean {
    const saved: number[] = [];
    for (const [tx, ty] of tiles) {
      const i = ty * GRID_W + tx;
      saved.push(this.occ[i]);
      this.occ[i] = -1;
      this.blocked[i] = 1;
    }
    const ok = this.allGatesReachable();
    for (let k = 0; k < tiles.length; k++) {
      const [tx, ty] = tiles[k];
      const i = ty * GRID_W + tx;
      this.occ[i] = saved[k];
      this.blocked[i] = this.tile[i] === TileType.Border || saved[k] !== 0 ? 1 : 0;
    }
    return !ok;
  }

  static tileCenter(tx: number, ty: number): { x: number; y: number } {
    return { x: tx + 0.5, y: ty + 0.5 };
  }

  /**
   * fb036: the tile-by-tile route a walker entering at this gate currently
   * takes to the Core, per the live `ground` field — the same `stepFrom`
   * chain a real enemy follows, so a drawn indicator can never show a route
   * the sim itself does not walk. Includes the gate tile; `breach` flags a
   * tile occupied by a structure (the field is routing an orthogonal step
   * through it — SPEC-FINAL §10 — which only happens once no cheaper open
   * path exists, i.e. that approach is sealed). Capped at the tile count so
   * a corrupted field can never loop forever instead of just stopping short.
   */
  gatePath(gate: GateDef): Array<{ tx: number; ty: number; breach: boolean }> {
    const out: Array<{ tx: number; ty: number; breach: boolean }> = [];
    const seen = new Set<number>();
    let tx = gate.tx;
    let ty = gate.ty;
    for (let i = 0; i < GRID_W * GRID_H; i++) {
      const idx = this.idx(tx, ty);
      if (seen.has(idx)) break;
      seen.add(idx);
      out.push({ tx, ty, breach: this.occ[idx] !== 0 });
      if (this.tile[idx] === TileType.Core) break;
      const next = this.stepFrom(tx, ty);
      if (!next) break;
      [tx, ty] = next;
    }
    return out;
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
