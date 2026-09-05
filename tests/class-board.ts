/**
 * c014 — the board geometry the §4 liveness files each used to pin by hand.
 *
 * `c005` (`class-kit-liveness`), `c006` (`class-passive-liveness`), `c007`
 * (`class-kit-whiff`), `c009` (`class-tower-passive-liveness`), `c011`
 * (`class-passive-magnitudes`) and `c016` (`class-line-bonus`) each wrote
 * `const WX = 10; const WY = 10;` and built their probe tower at `11,10`.
 * Six copies of one assumption: that those tiles are open ground on the seed
 * `cfg()` hands out. `BACKLOG-TERRAIN.md` makes that seed generate a real map,
 * at which point all six fail together as `harness could not build ...` — a
 * harness error indistinguishable, to whoever picks it up, from a product
 * regression in the class kits. Logged three times (c005, c006, c009) and
 * never fixed until now.
 *
 * This module owns that geometry once, and *probes* for it with the same
 * side-effect-free `checkBuild` the Engineer's reach clause already probes
 * with (`tilePastBaseRange`, class-passive-liveness). When the ground under
 * `10,10` stops being buildable the scan walks to the next tile that is,
 * and all six files move with it instead of going red.
 *
 * **Why the scan starts at `10,10`.** The origin is a starting point, not an
 * answer: it is the first candidate the ring scan tries, and it is discarded
 * like any other if it fails the checks below. Starting it where the six files
 * stand today is deliberate — CLAUDE.md's measurement rules say a refactor
 * must not move a baseline it is not measuring, and every one of those files
 * calibrates windows and margins against distances to the Core, the gates and
 * the board edges from that spot. `class-board.test.ts` shifts the origin to
 * prove the geometry follows it rather than the constant.
 *
 * **What "valid" means here, and why the whole footprint is checked.** The six
 * files reach east as far as `tilePastBaseRange`'s `dx < 14` probe and
 * Stormcaller's chain lines, and south as far as `WY + 6`;
 * `EAST_REACH`/`SOUTH_REACH` below carry those numbers, and every tile in that
 * rectangle must be `grid.buildable` — not merely inside the border and clear
 * of the Core.
 *
 * Checking only the one build tile was this module's first draft and it did
 * not survive review. `tilePastBaseRange` (class-passive-liveness) scans
 * `dx = 4..13` for a tile `checkBuild` calls `'out_of_range'`; `checkBuild`
 * tests `grid.buildable` *before* `inBuildRange`, so an unbuildable tile
 * answers `'occupied'` instead and the scan finds nothing, at which point that
 * file dies on its own harness assertion. A terrain map that leaves `11,10`
 * open and turns `14..23,10` to rock would have passed a build-tile-only check
 * and reddened the file anyway — the exact failure c014 exists to remove, at
 * the deepest reach the module claims to guard.
 *
 * `grid.buildable` is the right predicate for all of it rather than a mix:
 * it is `tile === Open && occ === 0`, which already implies in-bounds,
 * non-border, non-Gate, non-Core, unoccupied *and* `passable`, so it covers
 * the tiles that only ever hold an enemy as well as the ones that hold a
 * tower. The border/Core rejects are kept ahead of it as a cheap pre-filter
 * that can also name which rule a candidate broke.
 */

import { loadContent, type Content } from '../src/sim/content';
import { CORE_H, CORE_W, CORE_X, CORE_Y, GRID_H, GRID_W } from '../src/sim/grid';
import { checkBuild } from '../src/sim/towers';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

export interface Board {
  /** The Warden's parking spot, in world units — also the tile-coordinate origin every file offsets from. */
  readonly WX: number;
  readonly WY: number;
  /** The tile every file builds its probe tower on: `WX + 1, WY`, kept legal by the scan. */
  readonly BUILD_TX: number;
  readonly BUILD_TY: number;
}

/** How far east of `WX` the six files place things (`tilePastBaseRange`'s `dx < 14` is the deepest). */
export const EAST_REACH = 14;
/** How far south of `WY` they place things (`dummy(w, WX + 8, WY + 6)`, class-kit-liveness). */
export const SOUTH_REACH = 6;
/** Slack on the two sides nothing reaches into, so the spot is never flush against a wall. */
export const WEST_MARGIN = 1;
export const NORTH_MARGIN = 1;

/** Where the ring scan starts. Shift it and every importing file moves together — that is the point. */
export const PROBE_ORIGIN: Readonly<{ tx: number; ty: number }> = { tx: 10, ty: 10 };

/**
 * The probe runs as a class with **no** `buildRange` mod (only the Engineer
 * carries one, `data/classes.json`), so the tile it accepts is in range for
 * all twelve rather than for the widest one.
 */
const PROBE_CLASS = 'swordsman';
const PROBE_TOWER = 'arrow_spire';

/** How far the scan is willing to walk before giving up — the whole board, in Chebyshev rings. */
const MAX_RING = Math.max(GRID_W, GRID_H);

const defaultContent = loadContent();

function isCore(tx: number, ty: number): boolean {
  return tx >= CORE_X && tx < CORE_X + CORE_W && ty >= CORE_Y && ty < CORE_Y + CORE_H;
}

/**
 * Every tile the six files touch, relative to a candidate Warden spot, is open
 * board — asked of the live `Grid`, not inferred from static geometry. See the
 * header: a static check cannot see terrain, which is the only thing this
 * module exists to survive.
 */
function footprintClear(w: World, wx: number, wy: number): boolean {
  for (let ty = wy - NORTH_MARGIN; ty <= wy + SOUTH_REACH; ty++) {
    for (let tx = wx - WEST_MARGIN; tx <= wx + EAST_REACH; tx++) {
      // The border ring is tiles 0 and GRID_W/H - 1; anything outside it is off the board.
      if (tx < 1 || ty < 1 || tx > GRID_W - 2 || ty > GRID_H - 2) return false;
      if (isCore(tx, ty)) return false;
      if (!w.grid.buildable(tx, ty)) return false;
    }
  }
  return true;
}

/** Candidate Warden spots, nearest first: the origin, then Chebyshev ring 1, 2, ... */
function* candidates(origin: { tx: number; ty: number }): Generator<{ tx: number; ty: number }> {
  yield { tx: origin.tx, ty: origin.ty };
  for (let r = 1; r <= MAX_RING; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        yield { tx: origin.tx + dx, ty: origin.ty + dy };
      }
    }
  }
}

/**
 * The first spot at or near `origin` where the Warden can stand and build its
 * probe tower one tile east — checked with `checkBuild`, which is the same
 * legality `buildTower` runs but without the side effects, so one probe world
 * serves every candidate.
 */
export function probeBoard(
  origin: { tx: number; ty: number } = PROBE_ORIGIN,
  c: Content = defaultContent,
): Board {
  const w = new World(cfg({ classKey: PROBE_CLASS }), c);
  w.gold = 1e6;
  const id = c.towerByKey.get(PROBE_TOWER)!.id;
  for (const { tx, ty } of candidates(origin)) {
    if (!footprintClear(w, tx, ty)) continue;
    w.warden.x = tx;
    w.warden.y = ty;
    // `wouldBlockPath` as well as `checkBuild`: §10 lets a build seal the Core
    // outright, so `checkBuild` alone would happily hand back a tile whose
    // tower re-routes every enemy in the file that used it (c013's own probe
    // already asked for this, privately).
    if (checkBuild(w, id, tx + 1, ty) !== null) continue;
    if (w.grid.wouldBlockPath([[tx + 1, ty]])) continue;
    return { WX: tx, WY: ty, BUILD_TX: tx + 1, BUILD_TY: ty };
  }
  throw new Error(
    `class-board: no buildable Warden spot within ${MAX_RING} rings of ${origin.tx},${origin.ty}`,
  );
}

/** The board every §4 liveness file shares. */
export const BOARD = probeBoard();

export const WX = BOARD.WX;
export const WY = BOARD.WY;
export const BUILD_TX = BOARD.BUILD_TX;
export const BUILD_TY = BOARD.BUILD_TY;
