/**
 * SPEC-FINAL §10.5 (fb064b): the bridge from a generated `TerrainMap` to the
 * three masks `Grid` runs on.
 *
 * This is the only place a `TerrainKind` is turned into walkable/buildable/high
 * — `Grid` never learns the kinds' meanings, and `data/terrain.json`'s flags
 * stay the single authority for them (architecture rule 4). Pure: same map and
 * same config in, byte-identical masks out.
 */
import type { TerrainOverlay } from '../grid';
import { isBuildable, isHighGround, isWalkable, type TerrainConfig } from './config';
import type { TerrainGrid } from './types';

export function terrainOverlay(map: TerrainGrid, cfg: TerrainConfig): TerrainOverlay {
  const n = map.w * map.h;
  // The loader-refuses-unpayable-data rule, one layer in. Both of these fail
  // *silently* otherwise, because `cfg.tiles[k]?.walkable` is `undefined` for a
  // missing tile and `undefined` reads as "not walkable": a short `kind` buffer
  // or an out-of-range kind would hand `Grid` a fully sealed arena of the right
  // shape, with every mask-length guard satisfied and no error anywhere.
  if (map.kind.length !== n) {
    throw new Error(`terrainOverlay: kind length ${map.kind.length}, expected ${map.w}x${map.h}`);
  }
  const kind = new Uint8Array(n);
  const walkable = new Uint8Array(n);
  const buildable = new Uint8Array(n);
  const high = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const k = map.kind[i];
    if (k >= cfg.tiles.length) {
      throw new Error(`terrainOverlay: tile ${i} has kind ${k}, no such tile in data/terrain.json`);
    }
    kind[i] = k;
    walkable[i] = isWalkable(cfg, k) ? 1 : 0;
    buildable[i] = isBuildable(cfg, k) ? 1 : 0;
    high[i] = isHighGround(cfg, k) ? 1 : 0;
  }
  return { w: map.w, h: map.h, kind, walkable, buildable, high };
}
