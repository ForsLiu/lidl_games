/**
 * SPEC-FINAL §10.5 (fb064h): the terrain half of the owner's Core-placement
 * flow — "at run start, before wave 1, the player clicks any legal normal tile
 * to place the 2x2 Core (legal = normal ground, not within 3 tiles of a spawn
 * gate, reachable from every gate). A default suggested spot is
 * pre-highlighted."
 *
 * Two functions, both pure in `(map, cfg)`:
 *   - `validateCorePlacement` — the rule the placement Command runs against a
 *     click, answering *which* rule failed rather than just "no";
 *   - `suggestCoreAnchor` — the pre-highlighted default.
 *
 * `legalCoreAnchors` already enumerates the legal set and is what the bands are
 * measured against; this module is deliberately built to agree with it tile for
 * tile (pinned by a test over 100 seeds) rather than to re-derive legality.
 * Enumerating and validating from two different rules is exactly how a click
 * comes to be refused on a tile the generator counted as legal.
 *
 * `suggestCoreAnchor`'s *body* moved to `analyze.ts` in fb064o and is
 * re-exported from here unchanged, so this module stays its home for every
 * caller and for `index.ts`. The move is a layering fix, not a redesign:
 * fb064o's approach band is measured to the suggested anchor, so
 * `measureTerrain` has to call it, and `core-placement.ts` imports `analyze.ts`
 * — the other direction would be a cycle. It sits beside `legalCoreAnchors`,
 * the set it picks from, which is where the no-drift rule above wanted it
 * anyway.
 */
import { CORE_H, CORE_W } from '../grid';
import { gateComponent, gateDistance } from './analyze';
import { TerrainKind, type TerrainConfig } from './config';
import type { TerrainGrid } from './types';

export { suggestCoreAnchor } from './analyze';

/**
 * Why a placement was refused, in the order the checks run. A click can break
 * several rules at once — a tile inside a rock blob next to a gate breaks two —
 * and the first in this order is reported, because it is the one the player can
 * act on: "that is not buildable ground" is a better answer than "that is
 * unreachable" for a tile that is a mountain.
 */
export type CoreRejectReason =
  /** Not an integer tile, or the 2x2 footprint would leave the grid. */
  | 'off-grid'
  /** Some tile of the footprint is not normal ground (rough, rock, high). */
  | 'not-normal'
  /** Some tile is within `coreGateClearance` of a spawn gate. */
  | 'near-gate'
  /** Some tile is not reachable from *every* spawn gate. */
  | 'unreachable';

export type CorePlacementResult =
  | { readonly ok: true; readonly anchor: number }
  | { readonly ok: false; readonly reason: CoreRejectReason };

/**
 * Is `(tx, ty)` a legal top-left anchor for the 2x2 Core?
 *
 * `reach` is `gateComponent`'s intersection mask (reachable from *every* gate).
 * It is a parameter because it costs a flood per gate and the caller validating
 * a whole board of candidate clicks — or a test sweeping every tile — must not
 * pay that per tile. **Hoist it.** A board-wide sweep is ~0.5 ms with a shared
 * mask and ~54 ms without, and fb064c's pre-highlight runs one per mouse-move.
 *
 * Omitted, it is computed *lazily*, after the cheap rules have had their say:
 * written as a default parameter it ran three floods to answer `off-grid` for a
 * click outside the board, which is the one call the UI makes most often.
 */
export function validateCorePlacement(
  map: TerrainGrid,
  cfg: TerrainConfig,
  tx: number,
  ty: number,
  reach?: Uint8Array,
): CorePlacementResult {
  // A mask of the wrong size is a caller bug, and a silent one: every index of
  // the footprint reads `undefined`, which is falsy, so a short mask answers
  // `unreachable` for the whole board and a validator that agrees with
  // `legalCoreAnchors` nowhere still looks like it is working.
  if (reach !== undefined && reach.length !== map.w * map.h) {
    throw new Error(
      `validateCorePlacement: reach mask is ${reach.length}, expected ${map.w * map.h}`,
    );
  }
  if (!Number.isInteger(tx) || !Number.isInteger(ty)) return { ok: false, reason: 'off-grid' };
  if (tx < 0 || ty < 0 || tx + CORE_W > map.w || ty + CORE_H > map.h) {
    return { ok: false, reason: 'off-grid' };
  }
  // Each rule is checked over the whole footprint before the next one starts,
  // so the reported reason is the first *rule* broken and not the first rule
  // the first broken tile happens to break — otherwise the message a player
  // sees would depend on which corner of the Core the fault was under.
  for (let dy = 0; dy < CORE_H; dy++) {
    for (let dx = 0; dx < CORE_W; dx++) {
      if (map.kind[(ty + dy) * map.w + (tx + dx)] !== TerrainKind.Normal) {
        return { ok: false, reason: 'not-normal' };
      }
    }
  }
  for (let dy = 0; dy < CORE_H; dy++) {
    for (let dx = 0; dx < CORE_W; dx++) {
      if (gateDistance(tx + dx, ty + dy) <= cfg.coreGateClearance) {
        return { ok: false, reason: 'near-gate' };
      }
    }
  }
  const mask = reach ?? gateComponent(map, cfg);
  for (let dy = 0; dy < CORE_H; dy++) {
    for (let dx = 0; dx < CORE_W; dx++) {
      if (!mask[(ty + dy) * map.w + (tx + dx)]) return { ok: false, reason: 'unreachable' };
    }
  }
  return { ok: true, anchor: ty * map.w + tx };
}
