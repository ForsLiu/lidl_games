/**
 * SPEC-FINAL §10.5 (fb064a): the constraint measurements the owner's bands are
 * written against, and the legal-Core-position set that feeds fb064c.
 *
 * Connectivity here is deliberately 4-connected. Real walkers also step
 * diagonally, but only with both orthogonals open (`Grid`'s no-corner-cutting
 * rule), so a 4-connected path is always a real path: a measurement that
 * passes under 4-connectivity cannot be optimistic about what the sim will
 * actually walk.
 */
import { GATES } from '../grid';
import { isWalkable, TerrainKind, type TerrainConfig } from './config';
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
 */
export function gateIndices(map: TerrainGrid): number[] {
  return GATES.map((g) => g.ty * map.w + g.tx);
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

/** One reachability mask per gate, in `GATES` order. */
export function perGateReach(map: TerrainGrid, cfg: TerrainConfig): Uint8Array[] {
  return gateIndices(map).map((gi) => walkableFlood(map, cfg, [gi]));
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
  reach = perGateReach(map, cfg),
): Uint8Array {
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
  reach = perGateReach(map, cfg),
): boolean {
  const gates = gateIndices(map);
  for (let g = 0; g < gates.length; g++) {
    for (const other of gates) if (!reach[g][other]) return false;
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
export function corridorsOk(map: TerrainGrid, cfg: TerrainConfig): boolean {
  if (cfg.constraints.minCorridorWidth <= 1) return true;
  const aw = map.w - 1;
  const ah = map.h - 1;
  const blocks = blockMask(map, cfg);
  const { label, sizes } = labelComponents(aw, ah, blocks);
  if (sizes.length === 0) return false;
  let best = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[best]) best = i;
  for (const g of GATES) {
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
export function gateDistance(tx: number, ty: number): number {
  let best = Number.MAX_SAFE_INTEGER;
  for (const g of GATES) {
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
  reach = gateComponent(map, cfg),
): number[] {
  const out: number[] = [];
  const clear = cfg.coreGateClearance;
  for (let y = 0; y < map.h - 1; y++) {
    for (let x = 0; x < map.w - 1; x++) {
      let ok = true;
      for (let dy = 0; dy < 2 && ok; dy++) {
        for (let dx = 0; dx < 2 && ok; dx++) {
          const i = (y + dy) * map.w + (x + dx);
          if (map.kind[i] !== TerrainKind.Normal || !reach[i]) ok = false;
          else if (gateDistance(x + dx, y + dy) <= clear) ok = false;
        }
      }
      if (ok) out.push(y * map.w + x);
    }
  }
  return out;
}

/** Is every gate open — at least one walkable neighbour, never enclosed? */
export function gatesOpen(map: TerrainGrid, cfg: TerrainConfig): boolean {
  for (const g of GATES) {
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
export function measureTerrain(map: TerrainGrid, cfg: TerrainConfig): TerrainMeasure {
  const total = map.w * map.h;
  let walkableCount = 0;
  let normalCount = 0;
  for (let i = 0; i < total; i++) {
    if (isWalkable(cfg, map.kind[i])) walkableCount++;
    if (map.kind[i] === TerrainKind.Normal) normalCount++;
  }
  const perGate = perGateReach(map, cfg);
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
  const shared = gateComponent(map, cfg, perGate);
  const anchors = legalCoreAnchors(map, cfg, shared);
  return {
    walkableFrac: walkableCount / total,
    buildableNormalFrac: normalCount / total,
    gateReachFrac: perGate.length === 0 ? 0 : worstShare,
    coreLegalFrac: normalCount === 0 ? 0 : anchors.length / normalCount,
    corridorsOk: corridorsOk(map, cfg),
    gatesOpen: gatesOpen(map, cfg),
    gatesConnected: gatesConnected(map, cfg, perGate),
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
    measure.coreLegalFrac >= c.minCoreLegalFrac
  );
}
