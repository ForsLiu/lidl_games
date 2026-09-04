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
 */
import { CORE_H, CORE_W, CORE_X, CORE_Y } from '../grid';
import { gateComponent, gateDistance, legalCoreAnchors } from './analyze';
import { TerrainKind, type TerrainConfig } from './config';
import type { TerrainGrid } from './types';

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
 * How far around the footprint `suggestCoreAnchor` looks for build room. Two
 * tiles is the first ring a tower can actually occupy plus one, i.e. enough to
 * tell a Core in an alcove from a Core in the open.
 *
 * Deliberately *not* in `data/terrain.json`, against architecture rule 4, and
 * the exemption is logged in BACKLOG-TERRAIN.md: this is a tie-break weight,
 * not a tuning band — it cannot make a map legal or illegal, since every value
 * of it picks some member of a set `legalCoreAnchors` already validated — while
 * putting it in `/data` would hand fb064f's live Tuner a knob that silently
 * relocates the Core, and `data/terrain.json` is still outside `contentHash()`
 * (fb064b's merge blocker), so a replay would not notice. It is pinned by the
 * golden table in `tests/terrain-core-placement.test.ts` instead.
 */
const ROOM_RADIUS = 2;

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
  anchors: readonly number[] = legalCoreAnchors(map, cfg),
): number | null {
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
    const room = buildRoom(map, x, y);
    // Both comparisons are strict, and both matter. `anchors` is ascending, so
    // strictness leaves the lowest index winning a full tie — a stable answer
    // that does not depend on the enumeration order of a set the generator
    // happens to produce. The room key is not decoration either: over seeds
    // 1..500 the nearest-anchor set is tied on 25 seeds and this line moves the
    // pick on 17 of them, i.e. on ~3% of runs it chooses the Core's tile.
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

/** Normal tiles in the ring `ROOM_RADIUS` out from the 2x2 footprint. */
function buildRoom(map: TerrainGrid, tx: number, ty: number): number {
  let room = 0;
  for (let y = ty - ROOM_RADIUS; y < ty + CORE_H + ROOM_RADIUS; y++) {
    for (let x = tx - ROOM_RADIUS; x < tx + CORE_W + ROOM_RADIUS; x++) {
      if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
      if (map.kind[y * map.w + x] === TerrainKind.Normal) room++;
    }
  }
  return room;
}
