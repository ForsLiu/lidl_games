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

/**
 * fb064b: the generated map as `Grid` consumes it — three decided masks plus
 * the raw tile kinds for the renderer.
 *
 * Deliberately *not* a `TerrainMap`: `grid.ts` imports nothing, and
 * `src/sim/terrain/config.ts` imports `GATES`/`GRID_W`/`GRID_H` from here to
 * make its impossibility proofs exact. Handing the Grid a plain mask bundle
 * keeps that one-way and leaves the terrain module the only place that knows
 * how a `TerrainKind` maps onto walkable/buildable/high — one decision point,
 * as `data/terrain.json` intends. Build one with `terrainOverlay()`.
 */
/**
 * `TerrainKind.Normal`. The enum lives in `src/sim/terrain/config.ts`, which
 * imports *from* this file, so the value cannot be imported back without a
 * cycle; naming it here keeps the invariant next to the reader.
 */
const TERRAIN_NORMAL = 0;

export interface TerrainOverlay {
  readonly w: number;
  readonly h: number;
  /** `TerrainKind` per tile. The sim reads the masks; this is for fb064e. */
  readonly kind: Uint8Array;
  /** 1 where a ground walker may stand. */
  readonly walkable: Uint8Array;
  /** 1 where a tower may be built. */
  readonly buildable: Uint8Array;
  /** 1 on high ground (buildable, and no ground walker reaches it). */
  readonly high: Uint8Array;
  /**
   * fb064q: 1 where terrain stops the *character*, per each kind's
   * `blocksCharacter` in `data/terrain.json`.
   *
   * Independent of `walkable` on purpose: that mask is about ground walkers,
   * this one about the Warden, and the owner's open veto on the rock clause is
   * exactly the case where they differ ("character flies over; veto if rocks
   * should block the character"). `wardenPassable` is its only reader.
   */
  readonly charBlock: Uint8Array;
}

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

  /**
   * fb064b, SPEC-FINAL §10.5: the generated terrain, or an all-`normal` map
   * until `applyTerrain` is called. Every `Grid` is born flat, so a run that
   * never applies terrain behaves exactly as it did before this item.
   *
   * `terrainKind` is the Grid's own copy, not the `TerrainMap`'s buffer: the
   * map's hash is computed once at construction and must stay a description of
   * what the generator produced, while these arrays carry the Grid's structural
   * overrides (see `applyTerrain`).
   */
  readonly terrainKind: Uint8Array;
  /** 1 where terrain alone stops a ground walker (rock, high ground). */
  private readonly terrainBlock: Uint8Array;
  /** 1 where terrain alone forbids building (rough, rock). */
  private readonly terrainNoBuild: Uint8Array;
  /** fb064q: 1 where terrain alone stops the character (`blocksCharacter`). */
  private readonly terrainCharBlock: Uint8Array;
  /** 1 on high ground — read by fb064d's targeting rules. */
  private readonly terrainHigh: Uint8Array;
  /**
   * fb064h: the overlay exactly as `applyTerrain` received it, before the
   * structural override that forces gate and Core tiles back to normal.
   *
   * The four public arrays above are *derived*: raw terrain with the current
   * gate/Core footprints punched out. Keeping the pre-override copy is what
   * lets `placeCore` move the Core and hand the tiles it vacates back their
   * real terrain. Without it a Core that had been sitting on rock would leave
   * a two-tile corridor of phantom normal ground behind it — a hole in the
   * walkable graph that no band the analyzer measures would ever see, since
   * the analyzer never knew the Core existed.
   */
  private readonly terrainRawKind: Uint8Array;
  private readonly terrainRawBlock: Uint8Array;
  private readonly terrainRawNoBuild: Uint8Array;
  private readonly terrainRawHigh: Uint8Array;
  private readonly terrainRawCharBlock: Uint8Array;

  /**
   * fb064h: where the 2x2 Core actually is. `CORE_X/CORE_Y` are now only its
   * *default*, which is what a run that never places a Core keeps.
   *
   * Everything inside this file reads these — `coreTiles()`, `coreCenterOf()`,
   * and through them both flow fields and `allGatesReachable()`. Readers
   * outside it still import the `CORE_X/CORE_Y` constants, including this
   * file's own module-level `coreCenter()`, so **`placeCore` is not safe to
   * call from a run** until fb064c migrates them: the flow field would target
   * the new Core while every damage, aura and attack-range site still clamped
   * to the old 2x2, and walkers would path to the Core and hit empty ground.
   * The full list of sites is a merge blocker in BACKLOG-TERRAIN.md's Log
   * under fb064h. Nothing in `src/` or `tools/` calls `placeCore` today.
   */
  private coreTx = CORE_X;
  private coreTy = CORE_Y;

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
    this.terrainKind = new Uint8Array(GRID_W * GRID_H);
    this.terrainBlock = new Uint8Array(GRID_W * GRID_H);
    this.terrainNoBuild = new Uint8Array(GRID_W * GRID_H);
    this.terrainHigh = new Uint8Array(GRID_W * GRID_H);
    this.terrainCharBlock = new Uint8Array(GRID_W * GRID_H);
    this.terrainRawKind = new Uint8Array(GRID_W * GRID_H);
    this.terrainRawBlock = new Uint8Array(GRID_W * GRID_H);
    this.terrainRawNoBuild = new Uint8Array(GRID_W * GRID_H);
    this.terrainRawHigh = new Uint8Array(GRID_W * GRID_H);
    this.terrainRawCharBlock = new Uint8Array(GRID_W * GRID_H);
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const i = y * GRID_W + x;
        this.tile[i] =
          x === 0 || y === 0 || x === GRID_W - 1 || y === GRID_H - 1 ? TileType.Border : TileType.Open;
      }
    }
    for (const g of GATES) this.tile[g.ty * GRID_W + g.tx] = TileType.Gate;
    for (const i of this.coreTiles()) this.tile[i] = TileType.Core;
    for (let i = 0; i < this.tile.length; i++) this.blocked[i] = this.staticBlocked(i);
    this.ground = { dist: new Int32Array(GRID_W * GRID_H), next: new Int32Array(GRID_W * GRID_H) };
    this.ghost = { dist: new Int32Array(GRID_W * GRID_H), next: new Int32Array(GRID_W * GRID_H) };
    this.scratch = { dist: new Int32Array(GRID_W * GRID_H), next: new Int32Array(GRID_W * GRID_H) };
    this.rebuild();
  }

  /**
   * 1 where the *map* stops a ground walker, before occupancy: the border, and
   * (fb064b) rock or high ground. The one place the four sites that rebuild
   * `blocked` — the constructor, `setOcc`, `markDirty` and `wouldBlockPath`'s
   * restore — agree on what a bare tile means; they drifted apart the moment
   * terrain added a second reason a tile can be unwalkable.
   *
   * Gate and Core tiles outrank the scatter: a gate buried in rock spawns its
   * wave inside a wall with no route and nothing breachable to chew, and a
   * buried Core cannot be attacked at all. That is decided *here*, off the live
   * `tile` array, rather than by patching `terrainBlock` once in `applyTerrain`
   * — because the run rewrites `tile` afterwards. `world.ts`'s Fourth Gate
   * modifier opens a south gate at (12,19) at run construction, and fb064c
   * moves the Core off `CORE_X/CORE_Y`; a constants-keyed override misses both,
   * silently, on a map that still measures perfectly legal.
   */
  private staticBlocked(i: number): number {
    if (this.tile[i] === TileType.Border) return 1;
    if (this.tile[i] !== TileType.Open) return 0;
    return this.terrainBlock[i] === 1 ? 1 : 0;
  }

  /**
   * fb064b, SPEC-FINAL §10.5: adopt a generated map.
   *
   * Rough is walkable-not-buildable, rock stops ground pathing, high ground is
   * buildable and stops ground walkers. The flow fields, the sealing rule,
   * `allGatesReachable` and `gatePath` all read the same `blocked` mask they
   * always did, so none of them needed a terrain branch — except the breach
   * field, which had to learn that terrain is not something a walker can chew
   * through (see `dijkstra`).
   *
   * Structural tiles — every `Gate` and `Core` tile the grid currently holds —
   * are forced back to normal ground in the Grid's copy, never in the
   * `TerrainMap`. `staticBlocked` re-decides that on every rebuild, so a gate
   * opened *after* this call is covered too; the pass here keeps `terrainKind`
   * (which fb064e renders) telling the same story as the walkability mask.
   * **This does not make the Core *reachable*.** The Core
   * is still at the hardcoded `CORE_X/CORE_Y`, which no generated map knows
   * about, so a map can legally strand it behind rock; `allGatesReachable()`
   * reports that honestly and fb064c fixes it for real by placing the Core on
   * one of `legalCoreAnchors`' tiles.
   */
  applyTerrain(overlay: TerrainOverlay): void {
    if (overlay.w !== GRID_W || overlay.h !== GRID_H) {
      throw new Error(
        `applyTerrain: overlay is ${overlay.w}x${overlay.h}, grid is ${GRID_W}x${GRID_H}`,
      );
    }
    const n = GRID_W * GRID_H;
    // Named, so the message says *which* mask. fb064q added a fifth one, and an
    // overlay built before it — a `tools/` script, a JS caller, a `JSON.parse`d
    // save — has `charBlock: undefined`, which the old anonymous list turned
    // into `TypeError: Cannot read properties of undefined (reading 'length')`
    // with nothing pointing at terrain at all. Loud refusal at the boundary is
    // this method's whole design (`overlay is 4x4`, `both walkable and high`);
    // one mask silently exempt from it is the hole.
    const masks: ReadonlyArray<readonly [string, Uint8Array | undefined]> = [
      ['kind', overlay.kind],
      ['walkable', overlay.walkable],
      ['buildable', overlay.buildable],
      ['high', overlay.high],
      ['charBlock', overlay.charBlock],
    ];
    for (const [name, a] of masks) {
      if (!a) {
        throw new Error(`applyTerrain: overlay has no ${name} mask (build it with terrainOverlay())`);
      }
      if (a.length !== n) {
        throw new Error(`applyTerrain: ${name} mask length ${a.length}, expected ${n}`);
      }
    }
    // Content, not just shape. `terrainOverlay()` cannot build a walkable cliff
    // — `data/terrain.json`'s schema pins high ground as unwalkable — so this
    // only ever fires on the hand-built overlay the doc above contemplates,
    // which is exactly the case that would otherwise reach the sim as a tile
    // that is simultaneously unreachable and stood on.
    for (let i = 0; i < n; i++) {
      if (overlay.walkable[i] && overlay.high[i]) {
        throw new Error(`applyTerrain: tile ${i} is both walkable and high ground`);
      }
    }
    // Terrain is placed before a run builds anything. Applying it over live
    // occupancy would bury a standing tower in rock: `dijkstra`'s terrain guard
    // refuses the tile before it ever reaches the `occ` check, so the structure
    // becomes unbreachable scenery that no walker can path to or destroy.
    for (let i = 0; i < n; i++) {
      if (this.occ[i] !== 0) {
        throw new Error('applyTerrain: structures are already placed; apply terrain before build');
      }
    }
    // Copied, not aliased: the fields are rebuilt from these masks, so a caller
    // that later wrote into its own overlay would silently desync the walkable
    // mask from the flow field with nothing dirty to trigger a rebuild.
    for (let i = 0; i < n; i++) {
      this.terrainRawKind[i] = overlay.kind[i];
      this.terrainRawBlock[i] = overlay.walkable[i] ? 0 : 1;
      this.terrainRawNoBuild[i] = overlay.buildable[i] ? 0 : 1;
      this.terrainRawHigh[i] = overlay.high[i] ? 1 : 0;
      this.terrainRawCharBlock[i] = overlay.charBlock[i] ? 1 : 0;
    }
    this.syncTerrain();
  }

  /**
   * fb064h: rebuild the four effective terrain arrays from the raw overlay and
   * the *current* structural tiles, then re-derive `blocked`.
   *
   * Split out of `applyTerrain` because it now has two callers: adopting a map,
   * and moving the Core. Doing it in one place is the point — the override and
   * its undo are the same loop read forwards, so they cannot drift.
   */
  private syncTerrain(): void {
    const n = GRID_W * GRID_H;
    for (let i = 0; i < n; i++) {
      this.terrainKind[i] = this.terrainRawKind[i];
      this.terrainBlock[i] = this.terrainRawBlock[i];
      this.terrainNoBuild[i] = this.terrainRawNoBuild[i];
      this.terrainHigh[i] = this.terrainRawHigh[i];
      this.terrainCharBlock[i] = this.terrainRawCharBlock[i];
    }
    for (let i = 0; i < n; i++) {
      if (this.tile[i] === TileType.Open || this.tile[i] === TileType.Border) continue;
      this.terrainKind[i] = TERRAIN_NORMAL;
      this.terrainBlock[i] = 0;
      this.terrainNoBuild[i] = 0;
      this.terrainHigh[i] = 0;
      this.terrainCharBlock[i] = 0;
    }
    this.markDirty();
  }

  /** fb064h: the 2x2 Core's top-left tile — its default until `placeCore`. */
  coreOrigin(): { tx: number; ty: number } {
    return { tx: this.coreTx, ty: this.coreTy };
  }

  /**
   * fb064h: this Grid's Core centre, which is what the module-level
   * `coreCenter()` returns only while the Core has never moved.
   *
   * It exists now, unused, so that fb064c's migration of `cores.ts`,
   * `enemies.ts`, `world.ts`, `run.ts`, `sundering.ts`, `bots/policies.ts`,
   * the renderer and `src/ui/selection.ts` off the constants is a mechanical
   * call-site swap rather than a redesign — those files are outside this
   * lane's Scope, so the hook is all that can land here. The divergence
   * between the two is pinned by a test rather than left to be discovered.
   */
  coreCenterOf(): { x: number; y: number } {
    return { x: this.coreTx + CORE_W / 2, y: this.coreTy + CORE_H / 2 };
  }

  /**
   * fb064h, SPEC-FINAL §10.5: move the 2x2 Core to `(tx, ty)`.
   *
   * This is the *structural* half of the owner's Core-placement flow, and it
   * deliberately validates only what a Grid can know: that the footprint fits,
   * that it lands on open ground rather than on the border or a spawn gate, and
   * that nothing has been built yet. Whether the target is a *legal* Core
   * position — normal ground, clear of the gates, reachable from every one of
   * them — is a question about the terrain, and it is answered by
   * `validateCorePlacement` in `src/sim/terrain/core-placement.ts` against the
   * `TerrainMap`, where the answer does not depend on the Core's own footprint
   * having already been punched through it. The placement Command (fb064c)
   * calls that first and this second.
   *
   * Ordering: like `applyTerrain`, before anything is built. A Core that moved
   * out from under a standing tower would leave the tower on ground the terrain
   * may seal, and the flow fields would be rebuilt around a target that half
   * the board can no longer reach — with the structure already priced.
   */
  placeCore(tx: number, ty: number): void {
    if (!Number.isInteger(tx) || !Number.isInteger(ty)) {
      throw new Error(`placeCore: (${tx}, ${ty}) is not an integer tile`);
    }
    if (tx < 0 || ty < 0 || tx + CORE_W > GRID_W || ty + CORE_H > GRID_H) {
      throw new Error(`placeCore: a ${CORE_W}x${CORE_H} Core at (${tx}, ${ty}) leaves the grid`);
    }
    for (let i = 0; i < this.occ.length; i++) {
      if (this.occ[i] !== 0) {
        throw new Error('placeCore: structures are already placed; place the Core before build');
      }
    }
    for (let dy = 0; dy < CORE_H; dy++) {
      for (let dx = 0; dx < CORE_W; dx++) {
        const i = (ty + dy) * GRID_W + (tx + dx);
        const t = this.tile[i];
        // `Core` is allowed so a placement overlapping the current footprint is
        // not rejected by the Core it is about to move. Border and Gate are
        // not: a Core on a gate tile makes the gate's own spawn point
        // unwalkable scenery, and `staticBlocked` would then quietly stop
        // reporting the border as blocked at that tile.
        //
        // The two are refused with *different* messages on purpose. Shared
        // wording made the gate rule untestable: the only gates are on the
        // border, so a 2x2 over one also covers a Border tile, and a build that
        // accepted gate tiles outright still threw the same string.
        if (t === TileType.Border) {
          throw new Error(`placeCore: tile (${tx + dx}, ${ty + dy}) is the map border`);
        }
        if (t === TileType.Gate) {
          throw new Error(`placeCore: tile (${tx + dx}, ${ty + dy}) is a spawn gate`);
        }
        if (t !== TileType.Open && t !== TileType.Core) {
          throw new Error(`placeCore: tile (${tx + dx}, ${ty + dy}) is not open ground`);
        }
        // ...and not into a mountain. The structural override forces the Core's
        // footprint to normal, so a Core placed on rock or high ground is a 2x2
        // of phantom walkable ground punched through terrain the analyzer
        // measured as solid — the same phantom-corridor rule this method
        // already enforces on the tiles it *vacates*, applied to the ones it
        // takes. Local and exact: `terrainOverlay` marks precisely the normal
        // tiles both walkable and buildable, which is what
        // `validateCorePlacement` demands, so this can never refuse a legal
        // anchor. Before `applyTerrain` the raw masks are all zero and it is a
        // no-op, which is what keeps a terrain-free Grid unchanged.
        if (this.terrainRawBlock[i] !== 0 || this.terrainRawNoBuild[i] !== 0) {
          throw new Error(`placeCore: tile (${tx + dx}, ${ty + dy}) is not normal terrain`);
        }
      }
    }
    for (const i of this.coreTiles()) this.tile[i] = TileType.Open;
    this.coreTx = tx;
    this.coreTy = ty;
    for (const i of this.coreTiles()) this.tile[i] = TileType.Core;
    // Re-derived, not patched: the vacated tiles get their real terrain back
    // and the new footprint gets the structural override, in one pass.
    this.syncTerrain();
  }

  /**
   * fb064b: is this tile high ground? The flag fb064d's targeting rules read —
   * a tower here cannot be reached by a ground melee walker, because no ground
   * walker can stand on it in the first place.
   */
  isHighGround(tx: number, ty: number): boolean {
    // b007's class of bug: `GRID_W` is even, so `ty = k + 0.5` cancels its own
    // fraction and lands on a real, different tile. `buildable()` rejects
    // non-integers for the same reason; fb064d will call this one from
    // targeting code, where coordinates are floats.
    if (!Number.isInteger(tx) || !Number.isInteger(ty)) return false;
    if (!this.inBounds(tx, ty)) return false;
    const i = ty * GRID_W + tx;
    return this.tile[i] === TileType.Open && this.terrainHigh[i] === 1;
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
    // fb064u: b007's class of bug, on the tile predicate a *mover* asks.
    // `passable` and `passableGhost` still index with the raw coordinate behind
    // a bounds check alone and so still have the hole (fb064x); they are the
    // Dijkstra inner loop, where the guard has a real per-tick cost, so that is
    // a separate decision and not an omission this line may claim to have made.
    // `inBounds` alone passes `3.5`, and the flat index below then reads either
    // `undefined` (neither Border nor Open, so the old code answered "passable"
    // over rock) or — since `GRID_W` is even, so a `.5` in `ty` cancels its own
    // fraction — a real tile in another column. `buildable` and `isHighGround`
    // both reject non-integers outright; this now matches them. It is a
    // *refusal*, not a floor: `false` here means "the Warden cannot move
    // there", so a caller holding a float position must still floor first (both
    // live ones do — `run.ts`'s `walkable` and `wardenmove.ts`). What the three
    // predicates now share is that they refuse identically rather than one of
    // them aliasing onto a different tile.
    if (!Number.isInteger(tx) || !Number.isInteger(ty)) return false;
    if (!this.inBounds(tx, ty)) return false;
    // fb064b: terrain stops the Warden as it stops any other ground walker.
    // fb002 legalised walking through the *Core and friendly structures*, which
    // is a rule about what the player built, not about the map: a Warden that
    // walks or dashes through a mountain is a hole, and one parked on high
    // ground is unreachable by every ground melee enemy at once — an Act I safe
    // spot no gate band measures. `passableGhost` stays terrain-blind on
    // purpose (Burrowers tunnel *under* stone); this does not.
    //
    // fb064q: that reasoning is sound and it is also the *vetoed* reading of
    // the owner's rock clause, whose default is pass-through ("the character
    // still passes per fb002's pass-through rule [designer note: character
    // flies over; veto if rocks should block the character]"). So the term is
    // no longer `staticBlocked`, which conflates the character with the ground
    // walkers, but `terrainCharBlock` — each kind's own `blocksCharacter` from
    // `data/terrain.json`. Authored `true` on rock and high, so this line
    // behaves exactly as it did; settling the veto is now one data line and not
    // an edit to this file.
    //
    // The structural decision stays *live*, exactly as `staticBlocked` made it,
    // and that is not decoration: `terrainCharBlock` is a snapshot taken by
    // `syncTerrain`, while `world.ts`'s Fourth Gate modifier writes
    // `tile[idx(12, 19)] = Gate` after the Grid exists and calls only
    // `markDirty()`/`refresh()` — which rebuild `blocked` and never the terrain
    // arrays. Reading the snapshot alone left the Warden walled out of a gate
    // the map had buried in border rock while every enemy walked through it.
    const i = ty * GRID_W + tx;
    const t = this.tile[i];
    if (t === TileType.Border) return false;
    // Gates and the Core outrank the scatter: they are ground the run carved,
    // not terrain the generator painted.
    if (t !== TileType.Open) return true;
    return this.terrainCharBlock[i] === 0;
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
    // fb064b: high ground is buildable while `blocked`, and rough is walkable
    // while unbuildable, so the terrain term is genuinely independent of the
    // walkability one and cannot be folded into `passable`.
    return this.tile[i] === TileType.Open && this.occ[i] === 0 && this.terrainNoBuild[i] === 0;
  }

  /**
   * fb078: is this specific tile's unbuildability down to terrain (any kind
   * whose `buildable` flag is off in `data/terrain.json` — rough and rock as
   * shipped; high ground is buildable, so this never fires there — painted
   * by `applyTerrain`), as opposed to real occupancy
   * (border, a gate, the Core footprint, or a live structure)? Mirrors
   * `buildable()`'s own three-part check with the terrain clause inverted,
   * so the two are mutually exclusive and safe to call standalone.
   */
  unbuildableForTerrain(tx: number, ty: number): boolean {
    if (!Number.isInteger(tx) || !Number.isInteger(ty)) return false;
    if (!this.inBounds(tx, ty)) return false;
    const i = ty * GRID_W + tx;
    return this.tile[i] === TileType.Open && this.occ[i] === 0 && this.terrainNoBuild[i] === 1;
  }

  setOcc(tx: number, ty: number, id: number): void {
    const i = ty * GRID_W + tx;
    this.occ[i] = id;
    this.blocked[i] = this.staticBlocked(i) === 1 || id !== 0 ? 1 : 0;
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
      this.blocked[i] = this.staticBlocked(i) === 1 || this.occ[i] !== 0 ? 1 : 0;
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
        tiles.push((this.coreTy + dy) * GRID_W + (this.coreTx + dx));
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
              // fb064b: terrain is not breachable. `passableGhost` only refuses
              // the border, so without this line rock and high ground would be
              // enterable at plain walking cost — every generated map would
              // route its walkers straight through the scenery, and every band
              // the generator measures would be meaningless to the sim.
              //
              // Asked via `staticBlocked` rather than off `terrainBlock`
              // directly, so this agrees with `passable()` by construction: a
              // gate the run opens later is walkable there and must be routable
              // here, and a tower standing on high ground stays unreachable
              // (its `occ` would otherwise buy it a breach route into terrain
              // no walker can enter).
              if (this.staticBlocked(ni2) === 1) continue;
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
      this.blocked[i] = this.staticBlocked(i) === 1 || saved[k] !== 0 ? 1 : 0;
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

/**
 * The Core's *default* centre, off the constants.
 *
 * fb064h warning: this does not follow `Grid.placeCore`. Its callers
 * (`world.ts`, `run.ts`, `sundering.ts`, `cores.ts`, `bots/policies.ts`) are
 * outside the terrain lane's Scope, so they are migrated to
 * `grid.coreCenterOf()` by fb064c, which is also what makes `placeCore` safe
 * to call from a run. See BACKLOG-TERRAIN.md's fb064h Log entry.
 */
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
