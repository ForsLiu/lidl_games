/**
 * SPEC-FINAL §10.5 (fb064a): the constraint measurements the owner's bands are
 * written against, and the legal-Core-position set that feeds fb064c.
 *
 * Connectivity here is deliberately 4-connected. Real walkers also step
 * diagonally, but only with both orthogonals open (`Grid`'s no-corner-cutting
 * rule), so a 4-connected path is always a real path: a measurement that
 * passes under 4-connectivity cannot be optimistic about what the sim will
 * actually walk.
 *
 * The one exception is fb064o's approach band, which measures a *length* rather
 * than reachability and so has to use the sim's own 8-connected metric — see
 * `path.ts`, which this file imports and which therefore may not import back.
 * `suggestCoreAnchor` lives here for the same reason: the band is measured to
 * the anchor the run will actually be played on, `measureTerrain` cannot import
 * upward into `core-placement.ts`, and enumerating the legal set in one file
 * while choosing from it in another is exactly the drift both files are written
 * to make impossible. `core-placement.ts` re-exports it, and stays its home in
 * the public surface.
 */
import { CORE_H, CORE_W, CORE_X, CORE_Y, GATES, type GateDef } from '../grid';
import { isWalkable, TerrainKind, type TerrainConfig } from './config';
import { maxGateDetour } from './path';
import type { TerrainGrid, TerrainMeasure } from './types';

const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Flat indices of the spawn-gate tiles (gates sit on the border row/column).
 *
 * Takes the grid rather than reading `GRID_W`: every other function here
 * indexes off `map.w`, and the moment a `TerrainGrid` of another width exists
 * — fb064f's flat Training Grounds arena is the announced case — a hardcoded
 * stride would flood from the wrong tiles silently instead of failing.
 *
 * `gates` defaults to the base 3 (`GATES`) but every gate-reading function in
 * this file accepts an explicit list — always as its *last* parameter, after
 * any optional `reach` mask, so the lane's positional call shapes still hold —
 * so a run with the Fourth Gate modifier (fb077, `World.gates`) threads its
 * real 4-gate list through generation and measurement instead of being
 * silently measured against the wrong set.
 */
export function gateIndices(map: TerrainGrid, gates: readonly GateDef[] = GATES): number[] {
  return gates.map((g) => g.ty * map.w + g.tx);
}

/** 1 for every walkable tile 4-connected to any of `sources`, 0 elsewhere. */
export function walkableFlood(
  map: TerrainGrid,
  cfg: TerrainConfig,
  sources: readonly number[],
): Uint8Array {
  const seen = new Uint8Array(map.w * map.h);
  const queue: number[] = [];
  for (const s of sources) {
    if (s < 0 || s >= seen.length || seen[s] || !isWalkable(cfg, map.kind[s])) continue;
    seen[s] = 1;
    queue.push(s);
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % map.w;
    const y = (i / map.w) | 0;
    for (const [dx, dy] of ORTHO) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
      const ni = ny * map.w + nx;
      if (seen[ni] || !isWalkable(cfg, map.kind[ni])) continue;
      seen[ni] = 1;
      queue.push(ni);
    }
  }
  return seen;
}

/** One reachability mask per gate, in `gates` order. */
export function perGateReach(
  map: TerrainGrid,
  cfg: TerrainConfig,
  gates: readonly GateDef[] = GATES,
): Uint8Array[] {
  return gateIndices(map, gates).map((gi) => walkableFlood(map, cfg, [gi]));
}

/**
 * 1 for every walkable tile reachable from *every* spawn gate — the
 * intersection of the per-gate floods, not their union.
 *
 * The distinction is the whole point: a union flood answers "reachable from at
 * least one gate", which is what `legalCoreAnchors` must NOT be built on. Three
 * gates walled into three separate pockets cover every walkable tile between
 * them, so a union mask would happily call the entire map Core-legal while no
 * single gate could reach most of it. Intersecting makes the mask empty in
 * exactly that case, which is the correct answer.
 */
export function gateComponent(
  map: TerrainGrid,
  cfg: TerrainConfig,
  reachIn?: Uint8Array[],
  gates: readonly GateDef[] = GATES,
): Uint8Array {
  const reach = reachIn ?? perGateReach(map, cfg, gates);
  const all = new Uint8Array(map.w * map.h);
  if (reach.length === 0) return all;
  all.set(reach[0]);
  for (let g = 1; g < reach.length; g++) {
    for (let i = 0; i < all.length; i++) if (!reach[g][i]) all[i] = 0;
  }
  return all;
}

/**
 * Do all spawn gates sit in one walkable component? The owner's constraints
 * assume it everywhere ("gates connect to the walkable area", "Core reachable
 * from every gate"), and nothing else measures it: sealing unreachable pockets
 * cannot detect it, because a pocket that holds a gate is reachable — from that
 * gate.
 */
export function gatesConnected(
  map: TerrainGrid,
  cfg: TerrainConfig,
  reachIn?: Uint8Array[],
  gates: readonly GateDef[] = GATES,
): boolean {
  const reach = reachIn ?? perGateReach(map, cfg, gates);
  const idx = gateIndices(map, gates);
  for (let g = 0; g < idx.length; g++) {
    for (const other of idx) if (!reach[g][other]) return false;
  }
  return true;
}

/**
 * 1 for every walkable tile that belongs to at least one fully walkable 2x2
 * block — the tiles a 2-wide column of walkers can stand on.
 *
 * Note what this is *not*: a connected run of thick tiles is not necessarily a
 * 2-wide corridor. Two 2x2 rooms joined corner-to-corner have 4-adjacent thick
 * tiles while no 2x2 block can slide between them, so the joint is one tile
 * wide. `corridorsOk` measures the block lattice instead, for exactly that
 * reason; this mask is the per-tile view (rendering, diagnostics).
 */
export function thickMask(map: TerrainGrid, cfg: TerrainConfig): Uint8Array {
  const thick = new Uint8Array(map.w * map.h);
  for (let y = 0; y < map.h - 1; y++) {
    for (let x = 0; x < map.w - 1; x++) {
      const a = y * map.w + x;
      const b = a + 1;
      const c = a + map.w;
      const d = c + 1;
      if (
        isWalkable(cfg, map.kind[a]) &&
        isWalkable(cfg, map.kind[b]) &&
        isWalkable(cfg, map.kind[c]) &&
        isWalkable(cfg, map.kind[d])
      ) {
        thick[a] = 1;
        thick[b] = 1;
        thick[c] = 1;
        thick[d] = 1;
      }
    }
  }
  return thick;
}

/**
 * 1 at every `(x, y)` whose 2x2 block starting there is fully walkable.
 * Indexed in *anchor space*, `(w - 1) x (h - 1)`.
 */
export function blockMask(map: TerrainGrid, cfg: TerrainConfig): Uint8Array {
  const aw = map.w - 1;
  const ah = map.h - 1;
  const blocks = new Uint8Array(aw * ah);
  for (let y = 0; y < ah; y++) {
    for (let x = 0; x < aw; x++) {
      const a = y * map.w + x;
      if (
        isWalkable(cfg, map.kind[a]) &&
        isWalkable(cfg, map.kind[a + 1]) &&
        isWalkable(cfg, map.kind[a + map.w]) &&
        isWalkable(cfg, map.kind[a + map.w + 1])
      ) {
        blocks[y * aw + x] = 1;
      }
    }
  }
  return blocks;
}

/** Labels the 4-connected components of a mask and records their sizes. */
function labelComponents(
  w: number,
  h: number,
  mask: Uint8Array,
): { label: Int32Array; sizes: number[] } {
  const label = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    const queue = [start];
    label[start] = id;
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      size++;
      const x = i % w;
      const y = (i / w) | 0;
      for (const [dx, dy] of ORTHO) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (!mask[ni] || label[ni] >= 0) continue;
        label[ni] = id;
        queue.push(ni);
      }
    }
    sizes.push(size);
  }
  return { label, sizes };
}

/**
 * Owner band "no forced corridor narrower than 2 tiles on gate-to-open-area
 * mains": every gate must reach the open area along a route that stays 2 tiles
 * wide the whole way.
 *
 * Connectivity is measured in *anchor* space, over 2x2 blocks, not over "thick
 * tiles". Two thick tiles can be adjacent while their blocks only meet at a
 * corner — a staircase that pinches to one tile at the joint — whereas two
 * 4-adjacent anchors overlap in two tiles, so their union is a fully walkable
 * 2x3 region. A path through anchor space is therefore a 2x2 window sliding
 * over walkable ground: a genuinely 2-wide corridor. The open area is the
 * largest anchor component; a gate tile itself sits on the border and is never
 * inside an interior block, so the test runs on its walkable neighbours.
 */
export function corridorsOk(
  map: TerrainGrid,
  cfg: TerrainConfig,
  gates: readonly GateDef[] = GATES,
): boolean {
  if (cfg.constraints.minCorridorWidth <= 1) return true;
  const aw = map.w - 1;
  const ah = map.h - 1;
  const blocks = blockMask(map, cfg);
  const { label, sizes } = labelComponents(aw, ah, blocks);
  if (sizes.length === 0) return false;
  let best = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[best]) best = i;
  for (const g of gates) {
    let ok = false;
    for (const [dx, dy] of ORTHO) {
      const nx = g.tx + dx;
      const ny = g.ty + dy;
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
      if (!isWalkable(cfg, map.kind[ny * map.w + nx])) continue;
      // The (up to) four blocks that contain this neighbour tile.
      for (let by = ny - 1; by <= ny; by++) {
        for (let bx = nx - 1; bx <= nx; bx++) {
          if (bx < 0 || by < 0 || bx >= aw || by >= ah) continue;
          const bi = by * aw + bx;
          if (blocks[bi] && label[bi] === best) ok = true;
        }
      }
    }
    if (!ok) return false;
  }
  return true;
}

/** Chebyshev distance from a tile to the nearest spawn gate. */
export function gateDistance(tx: number, ty: number, gates: readonly GateDef[] = GATES): number {
  let best = Number.MAX_SAFE_INTEGER;
  for (const g of gates) {
    const d = Math.max(Math.abs(tx - g.tx), Math.abs(ty - g.ty));
    if (d < best) best = d;
  }
  return best;
}

/**
 * Flat indices of the top-left tile of every legal 2x2 Core anchor: four
 * normal tiles, none within `coreGateClearance` of a gate, all four reachable
 * from every gate.
 *
 * "Reachable from every gate" is `gateComponent`'s intersection mask, which is
 * literally that and does not depend on the map being legal. Placing the Core
 * cannot invalidate it: `Grid` keeps Core tiles *unblocked* (only
 * `TileType.Border` blocks), so the 2x2 removes nothing from the walkable
 * graph and cannot disconnect a gate that could reach those tiles beforehand.
 */
export function legalCoreAnchors(
  map: TerrainGrid,
  cfg: TerrainConfig,
  reachIn?: Uint8Array,
  gates: readonly GateDef[] = GATES,
): number[] {
  const reach = reachIn ?? gateComponent(map, cfg, undefined, gates);
  const out: number[] = [];
  const clear = cfg.coreGateClearance;
  // Sized off `CORE_W/CORE_H`, not a literal 2: `validateCorePlacement` and
  // `Grid.placeCore` both measure the footprint that way, and an enumeration
  // that disagreed with the validator about the Core's size is exactly the
  // drift this module and `core-placement.ts` are written to make impossible.
  for (let y = 0; y <= map.h - CORE_H; y++) {
    for (let x = 0; x <= map.w - CORE_W; x++) {
      let ok = true;
      for (let dy = 0; dy < CORE_H && ok; dy++) {
        for (let dx = 0; dx < CORE_W && ok; dx++) {
          const i = (y + dy) * map.w + (x + dx);
          if (map.kind[i] !== TerrainKind.Normal || !reach[i]) ok = false;
          else if (gateDistance(x + dx, y + dy, gates) <= clear) ok = false;
        }
      }
      if (ok) out.push(y * map.w + x);
    }
  }
  return out;
}

/**
 * fb064m: flat indices of every `high` tile that no enemy can shoot a tower
 * off — no walkable tile within `cfg.highContestRadius`.
 *
 * High ground is not walkable, and *once fb064i's predicates are wired at the
 * merge* ground melee cannot attack across the cliff edge either — the rules
 * exist and are tested, but `canAttackStructureAt` has no call site in `src/`
 * yet, so the denial is a rule this generator is built against rather than a
 * behaviour a run shows today. Under it, the only enemy that damages a
 * structure standing on high ground during an Act I wave is the Spitter, at a
 * plain Euclidean `attackRange` with no line-of-sight term. A high tile with no
 * walkable tile inside that radius is therefore a buildable plot no wave can
 * ever answer — `sealPockets`' recorded blind spot, since it only seals
 * unreachable *walkable* ground.
 *
 * Distance is centre-to-centre, the conservative reading: an enemy is a
 * continuous position inside a walkable tile, so a tile whose centre is in
 * range certainly holds a standable point in range, while one whose centre is
 * outside might still hold one near its edge. Erring that way can only call a
 * contested plot uncontested — it can never miss a real one.
 *
 * `radius: 0` returns nothing: the field is off, and the caller has accepted
 * the exposure rather than asked for every high tile to be demoted.
 *
 * The scan is a clamped box per high tile with an early exit, so its cost is
 * the area actually looked at and never the `(2r+1)^2` the config asked for —
 * `highContestRadius` comes from `/data`, which fb064f puts under live Tuner
 * editing (fb064a's `paint()` finding, same rule).
 */
export function uncontestedHigh(
  map: TerrainGrid,
  cfg: TerrainConfig,
  radius = cfg.highContestRadius,
): number[] {
  const out: number[] = [];
  if (radius <= 0) return out;
  const r2 = radius * radius;
  for (let i = 0; i < map.kind.length; i++) {
    if (map.kind[i] !== TerrainKind.High) continue;
    const x = i % map.w;
    const y = (i / map.w) | 0;
    const x0 = Math.max(0, x - radius);
    const x1 = Math.min(map.w - 1, x + radius);
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(map.h - 1, y + radius);
    let contested = false;
    for (let ny = y0; ny <= y1 && !contested; ny++) {
      const dy2 = (ny - y) * (ny - y);
      for (let nx = x0; nx <= x1; nx++) {
        if (dy2 + (nx - x) * (nx - x) > r2) continue;
        if (isWalkable(cfg, map.kind[ny * map.w + nx])) {
          contested = true;
          break;
        }
      }
    }
    if (!contested) out.push(i);
  }
  return out;
}

/** Is every gate open — at least one walkable neighbour, never enclosed? */
export function gatesOpen(
  map: TerrainGrid,
  cfg: TerrainConfig,
  gates: readonly GateDef[] = GATES,
): boolean {
  for (const g of gates) {
    let open = false;
    for (const [dx, dy] of ORTHO) {
      const nx = g.tx + dx;
      const ny = g.ty + dy;
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
      if (isWalkable(cfg, map.kind[ny * map.w + nx])) open = true;
    }
    if (!open) return false;
  }
  return true;
}

/** Every band the owner's generation constraints are written against. */
export function measureTerrain(
  map: TerrainGrid,
  cfg: TerrainConfig,
  gates: readonly GateDef[] = GATES,
): TerrainMeasure {
  const total = map.w * map.h;
  let walkableCount = 0;
  let normalCount = 0;
  for (let i = 0; i < total; i++) {
    if (isWalkable(cfg, map.kind[i])) walkableCount++;
    if (map.kind[i] === TerrainKind.Normal) normalCount++;
  }
  const perGate = perGateReach(map, cfg, gates);
  // The owner's band is "all gates connect to >= 80% of the walkable area", so
  // it is the *worst* gate's share, per gate. Measuring the union instead would
  // be vacuous: the generator seals every tile no gate can reach, so a union
  // share is identically 1 by construction and the band could never fail.
  //
  // Be honest about what the per-gate form buys on *generated* maps: after
  // `sealPockets`, if `gatesConnected` holds then every gate reaches every
  // walkable tile, so this is identically 1 there too (measured: min 1.0 over
  // seeds 1..1000). On generator output the band is a construction invariant
  // that restates `gatesConnected`, not an independent filter. It earns its
  // keep on maps that have *not* been sealed — hand-built maps, and whatever
  // fb064b/fb064c hand in after editing tiles — which is what the negative
  // case in `tests/terrain-generation.test.ts` pins.
  let worstShare = 1;
  for (const mask of perGate) {
    let reached = 0;
    for (let i = 0; i < total; i++) if (mask[i]) reached++;
    const share = walkableCount === 0 ? 0 : reached / walkableCount;
    if (share < worstShare) worstShare = share;
  }
  const shared = gateComponent(map, cfg, perGate, gates);
  const anchors = legalCoreAnchors(map, cfg, shared, gates);
  // fb064o: the approach band is measured to the anchor the run will actually
  // be played on, so it reuses the pre-highlighted default rather than picking
  // its own tile.
  //
  // A map with no legal anchor has no approach to measure and reports `-1`,
  // which `terrainLegal` refuses. Under the shipped `minCoreLegalFrac: 0.15`
  // that is redundant — such a map was already refused — but it is **not** a
  // no-op across the schema, and the difference is measured rather than
  // assumed. At `minCoreLegalFrac: 0` (schema-legal, and a field fb064f hands
  // to a live Tuner) an anchor-less map used to ship: at `coreGateClearance:
  // 14`, 67 of 300 seeds shipped a map with zero legal Core positions. Now the
  // generator retries instead, and at clearance 14 it always finds one (0/300
  // fallbacks); at clearance 16 it cannot, and 36 of 300 seeds ship the flagged
  // flat arena. That is the price, and it buys refusing a map no Core can be
  // placed on — which is a map the run cannot play.
  const suggested = suggestCoreAnchor(map, cfg, anchors);
  return {
    walkableFrac: walkableCount / total,
    buildableNormalFrac: normalCount / total,
    gateReachFrac: perGate.length === 0 ? 0 : worstShare,
    coreLegalFrac: normalCount === 0 ? 0 : anchors.length / normalCount,
    maxGateDetour:
      suggested === null ? -1 : maxGateDetour(map, cfg, suggested, CORE_W, CORE_H, gates),
    corridorsOk: corridorsOk(map, cfg, gates),
    gatesOpen: gatesOpen(map, cfg, gates),
    gatesConnected: gatesConnected(map, cfg, perGate, gates),
    walkableCount,
    normalCount,
    legalCoreCount: anchors.length,
  };
}

/**
 * Does a map satisfy every authored band? The generator's accept test.
 *
 * `gatesOpen` and `gatesConnected` are checked unconditionally rather than
 * being folded into a tunable band: `minCorridorWidth: 1` is a schema-legal
 * `/data` value that switches `corridorsOk` off, and without these two an
 * otherwise-passing map could ship with a gate walled into its own pocket.
 *
 * fb064o's `maxGateDetour` is checked from *both* sides, and the lower one is
 * not decoration: a detour below `1` is arithmetically impossible (the divisor
 * is the shortest walk an empty board admits), so `>= 1` is a self-check on the
 * measurement, and it is also what turns the `-1` "not measurable" sentinel
 * into a refusal instead of a pass.
 */
export function terrainLegal(measure: TerrainMeasure, cfg: TerrainConfig): boolean {
  const c = cfg.constraints;
  return (
    measure.gatesOpen &&
    measure.gatesConnected &&
    measure.corridorsOk &&
    measure.walkableFrac >= c.minWalkableFrac &&
    measure.buildableNormalFrac >= c.minBuildableNormalFrac &&
    measure.gateReachFrac >= c.minGateReachFrac &&
    measure.coreLegalFrac >= c.minCoreLegalFrac &&
    measure.maxGateDetour >= 1 &&
    measure.maxGateDetour <= c.maxGateDetour
  );
}

/**
 * How far around the footprint `suggestCoreAnchor` looks for build room. Two
 * tiles is the first ring a tower can actually occupy plus one, i.e. enough to
 * tell a Core in an alcove from a Core in the open.
 *
 * **fb064o changed what this constant is.** Until then it was a pure tie-break
 * weight that "cannot make a map legal or illegal, since every value of it
 * picks some member of a set `legalCoreAnchors` already validated", and that
 * clause was the whole justification for keeping it out of `data/terrain.json`
 * against architecture rule 4. It is now false: `terrainLegal` reads
 * `maxGateDetour`, `measureTerrain` measures that *to the anchor this constant
 * helps pick*, so the value decides whether a map is refused.
 *
 * Measured, not argued. Re-running `suggestCoreAnchor` at radius 1 over seeds
 * 1..3000 moves the anchor on 95 of them and flips `terrainLegal` on one:
 * **seed 1326**, where anchors 421 and 277 are the same distance from
 * `CORE_X/CORE_Y` (both `dist^2 = 4`) so this constant alone separates them —
 * 421 measures a 1.1304 detour and ships, 277 measures 1.6508 and is refused,
 * and the generator would hand that run a different map. Pinned by
 * `tests/terrain-approach.test.ts`, which goes red at radius 1; the golden
 * table in `tests/terrain-core-placement.test.ts` does not cover it (its own
 * comment records that radius 1 moves *zero* rows there).
 *
 * The `/data` exemption is therefore **re-opened, not re-argued**: this is now
 * exactly the "tuning band" the exemption said it was not, and fb064f's live
 * Tuner would be editing map legality through it. Deciding that needs
 * `data/terrain.json` inside `contentHash()` (fb064b's merge blocker), so it is
 * logged in BACKLOG-TERRAIN.md for the merge rather than taken here.
 */
const ROOM_RADIUS = 2;

/**
 * The pre-highlighted default: the legal anchor closest to `CORE_X/CORE_Y`,
 * tie-broken by build room and then by tile order. `null` only when the map has
 * no legal anchor at all — which the `minCoreLegalFrac` band makes impossible
 * for a non-fallback map, but the fallback map is a map too.
 *
 * Closest-to-the-old-spot is chosen over anything cleverer on purpose. The
 * suggestion is the position most runs will actually play, so it is a balance
 * decision — Core distance from each gate is what every wave's travel time is
 * tuned against — and balance orders are not this lane's to take. Reproducing
 * the tuned spot as nearly as the terrain allows is the choice that changes
 * nothing; a "maximise the distance to the nearest gate" rule would quietly
 * relocate the Core to a corner on every seed.
 *
 * A caller-supplied `anchors` list is not trusted to be one. Handed `[0]` — the
 * rock border's first tile — the unguarded version returned it, and `[-5]`,
 * `[999999]` and `[NaN]` came straight back out into a placement Command. Every
 * candidate is re-checked against the cheap half of `validateCorePlacement`
 * (in range, 2x2 normal); reachability is not re-flooded, since re-deriving it
 * per candidate is the cost the parameter exists to avoid, and it is the caller
 * who narrowed a legal set.
 */
export function suggestCoreAnchor(
  map: TerrainGrid,
  cfg: TerrainConfig,
  anchorsIn?: readonly number[],
  gates: readonly GateDef[] = GATES,
): number | null {
  const anchors = anchorsIn ?? legalCoreAnchors(map, cfg, undefined, gates);
  let best: number | null = null;
  let bestDist = 0;
  let bestRoom = 0;
  for (const anchor of anchors) {
    if (!isNormalFootprint(map, anchor)) continue;
    const x = anchor % map.w;
    const y = (anchor / map.w) | 0;
    const dx = x - CORE_X;
    const dy = y - CORE_Y;
    const dist = dx * dx + dy * dy;
    if (best !== null && dist > bestDist) continue;
    const room = coreAnchorRoom(map, x, y);
    // Both comparisons are strict, and both matter. `anchors` is ascending, so
    // strictness leaves the lowest index winning a full tie — a stable answer
    // that does not depend on the enumeration order of a set the generator
    // happens to produce. The room key is not decoration either: over seeds
    // 1..500 the nearest-anchor set is tied on 24 seeds and this line moves the
    // pick on 17 of them, i.e. on ~3% of runs it chooses the Core's tile.
    // (The tie count read 25 until fb065b re-measured it — a stale number from
    // before fb064l's `density.jitter`; the 17 is unchanged, so the two
    // readings used the same method. Both are pinned by
    // `tests/terrain-anchor-quality.test.ts` now, so the next generator change
    // moves a test rather than only this comment.)
    if (best === null || dist < bestDist || room > bestRoom) {
      best = anchor;
      bestDist = dist;
      bestRoom = room;
    }
  }
  return best;
}

/**
 * Is `anchor` an in-range flat index whose whole footprint is normal ground?
 * The cheap half of `validateCorePlacement` — no flood, so it is safe to run
 * per candidate.
 */
function isNormalFootprint(map: TerrainGrid, anchor: number): boolean {
  if (!Number.isInteger(anchor) || anchor < 0 || anchor >= map.w * map.h) return false;
  const tx = anchor % map.w;
  const ty = (anchor / map.w) | 0;
  if (tx + CORE_W > map.w || ty + CORE_H > map.h) return false;
  for (let dy = 0; dy < CORE_H; dy++) {
    for (let dx = 0; dx < CORE_W; dx++) {
      if (map.kind[(ty + dy) * map.w + (tx + dx)] !== TerrainKind.Normal) return false;
    }
  }
  return true;
}

/**
 * Normal tiles in the `ROOM_RADIUS`-wide **block** around the 2x2 footprint —
 * the quantity `suggestCoreAnchor` breaks a distance tie on.
 *
 * Block, not ring: the loops run `ty - 2 .. ty + CORE_H + 1` by the same in x,
 * a filled 6x6 that *includes* the footprint. The footprint contributes a
 * constant 4 (every caller has passed `isNormalFootprint` first), so it never
 * changes an ordering — but the shape is now exported, and the doc said "ring"
 * while the test file next door uses that word for a genuinely different
 * radius-1 ring. `coreAnchorRoom(flatTerrain(), 25, 9)` is **36**, which is
 * 6x6 and not 6x6 minus the footprint; that reading is pinned in
 * `tests/terrain-anchor-quality.test.ts`.
 *
 * Exported at fb065b because it is not an implementation detail: `ROOM_RADIUS`'
 * doc block above records that this tie-break decides `maxGateDetour`, which
 * `terrainLegal` reads, so this number decides whether a map ships. A quantity
 * that picks the Core's tile on ~3% of runs and can refuse a whole map should
 * be measurable from outside the module, and `tests/terrain-anchor-quality.test.ts`
 * asserts the rule through it: the chosen anchor carries the maximum of this
 * over its own minimum-distance tie set.
 *
 * Not re-exported from `index.ts`: that barrel is the public surface, and this
 * is a tie-break internal a test measures through. It keeps tile coordinates
 * rather than the flat anchor index its callers in that test hold, because the
 * one caller in *this* module has `(x, y)` already and because it is the same
 * shape as `gateDistance` beside it.
 */
export function coreAnchorRoom(map: TerrainGrid, tx: number, ty: number): number {
  let room = 0;
  for (let y = ty - ROOM_RADIUS; y < ty + CORE_H + ROOM_RADIUS; y++) {
    for (let x = tx - ROOM_RADIUS; x < tx + CORE_W + ROOM_RADIUS; x++) {
      if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
      if (map.kind[y * map.w + x] === TerrainKind.Normal) room++;
    }
  }
  return room;
}
