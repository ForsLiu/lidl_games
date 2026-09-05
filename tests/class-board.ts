/**
 * c014 — the board geometry the §4 liveness files each used to pin by hand.
 *
 * `c005` (`class-kit-liveness`), `c006` (`class-passive-liveness`), `c007`
 * (`class-kit-whiff`), `c009` (`class-tower-passive-liveness`), `c011`
 * (`class-passive-magnitudes`), `c016` (`class-line-bonus`) and `c017`
 * (`class-deeper-draw`) each wrote `const WX = 10; const WY = 10;`, and all
 * but the last built their probe tower at `11,10`. Seven copies of one
 * assumption: that those tiles are open ground on the seed `cfg()` hands out.
 *
 * **Six of the seven import this module; `class-kit-whiff` does not** — it
 * stays pinned, for the reason `class-board.test.ts`'s `EXCEPTIONS` records
 * and asserts. An earlier draft of this header claimed all of them moved
 * together, which was false, and QA caught it. `BACKLOG-TERRAIN.md` makes that seed generate a real map,
 * at which point all six fail together as `harness could not build ...` — a
 * harness error indistinguishable, to whoever picks it up, from a product
 * regression in the class kits. Logged three times (c005, c006, c009) and
 * never fixed until now.
 *
 * This module owns that geometry once, and *probes* for it with the same
 * side-effect-free `checkBuild` the Engineer's reach clause already probes
 * with (`tilePastBaseRange`, class-passive-liveness). When the ground under
 * `10,10` stops being buildable the scan walks to the next tile that is, and
 * the six importers move with it instead of going red.
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
 * **The rectangle is a bounding box, and that is a real cost.** It is
 * `(1 + EAST_REACH + 1) x (1 + SOUTH_REACH + 1)` = 128 tiles, every one of
 * which must be buildable, while the deep east arm is only actually used along
 * row `WY`. On the empty shipped board only 119 of 720 candidate spots
 * qualify, and under obstacle density `p` a candidate survives with
 * `(1-p)^128` — so at even a few percent density the expected number of legal
 * spots board-wide falls below one and `probeBoard` throws at module load
 * rather than walking (code review sized this). That is a *named* failure, one
 * error instead of six confusing ones, which is the improvement this module
 * actually delivers on a dense map; it is not the unlimited "walks to the next
 * tile that is buildable" a reader might infer. Narrowing the footprint to the
 * union of the shapes really used, rather than their bounding box, is the
 * obvious next step and is logged rather than done here.
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
  /**
   * `full` when the whole `EAST_REACH x SOUTH_REACH` footprint was clear;
   * `reduced` when only a smaller one was, which means a deep-east consumer
   * (`tilePastBaseRange`) may not have the ground it needs. Asserted `full` on
   * the shipped board, so a degraded map fails as a named row.
   */
  readonly tier: 'full' | 'reduced';
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
 * The footprint the importers really need, relative to a candidate Warden spot.
 *
 * **This started as "every tile in a 16x8 rectangle is `buildable`", and the
 * terrain epic proved that wrong the day it landed** (`fb077`, merged from
 * master). Measured on the generated map: 408 of 720 tiles are buildable, and
 * **zero of 512 candidate origins** can supply a contiguous 16x8 block of them.
 * The rectangle was satisfiable only on the old flat arena, so the requirement
 * was never describing the importers — it was describing the arena. That is
 * `c026`'s premise, and terrain turned it from a cleanup into a prerequisite.
 *
 * What the importers actually need is three things, not one:
 *
 *  1. **Somewhere to stand and build.** The Warden spot and the build tile one
 *     east — the build tile checked by `checkBuild` at the call site, which is
 *     the same legality `buildTower` runs.
 *  2. **A buildable tile further east than the base build range**, anywhere in
 *     the Warden's own row. `tilePastBaseRange` (class-passive-liveness) scans
 *     `dx = 4..13` for a tile `checkBuild` calls `'out_of_range'`; an
 *     unbuildable tile answers `'terrain'` or `'occupied'` first (master's
 *     `fb078` added the distinct `'terrain'` rejection), so *at least one* tile
 *     out there has to be real ground. One, not ten — the scan takes the first
 *     it finds.
 *  3. **Room to place enemies**, which is `passable`, not `buildable`: every
 *     dummy in these files is spawned with `speed = 0` and never paths, so it
 *     needs open floor rather than a tower site.
 *
 * Asking for `buildable` where only `passable` was needed is what made the old
 * check both too strict to satisfy and no more informative.
 */
function footprintClear(
  w: World,
  wx: number,
  wy: number,
  reach: { east: number; south: number },
): boolean {
  for (let ty = wy - NORTH_MARGIN; ty <= wy + reach.south; ty++) {
    for (let tx = wx - WEST_MARGIN; tx <= wx + reach.east; tx++) {
      // The border ring is tiles 0 and GRID_W/H - 1; anything outside it is off the board.
      if (tx < 1 || ty < 1 || tx > GRID_W - 2 || ty > GRID_H - 2) return false;
      if (isCore(tx, ty)) return false;
      // Floor, not a tower site — see (3) above.
      if (!w.grid.passable(tx, ty)) return false;
    }
  }
  // (2): `tilePastBaseRange`'s scan must have real ground to find. Checked over
  // the same `dx` window that function uses, so the two cannot drift apart.
  let farGround = false;
  for (let dx = 4; dx <= reach.east && !farGround; dx++) {
    if (w.grid.buildable(wx + dx, wy)) farGround = true;
  }
  return farGround;
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
function probeAt(
  origin: { tx: number; ty: number },
  c: Content,
  reach: { east: number; south: number },
): Board | null {
  const w = new World(cfg({ classKey: PROBE_CLASS }), c);
  w.gold = 1e6;
  const id = c.towerByKey.get(PROBE_TOWER)!.id;
  for (const { tx, ty } of candidates(origin)) {
    if (!footprintClear(w, tx, ty, reach)) continue;
    w.warden.x = tx;
    w.warden.y = ty;
    // `wouldBlockPath` as well as `checkBuild`: §10 lets a build seal the Core
    // outright, so `checkBuild` alone would happily hand back a tile whose
    // tower re-routes every enemy in the file that used it (c013's own probe
    // already asked for this, privately).
    if (checkBuild(w, id, tx + 1, ty) !== null) continue;
    if (w.grid.wouldBlockPath([[tx + 1, ty]])) continue;
    return { WX: tx, WY: ty, BUILD_TX: tx + 1, BUILD_TY: ty, tier: reach.east === EAST_REACH ? 'full' : 'reduced' };
  }
  return null;
}

/**
 * The first spot at or near `origin` where the Warden can stand and build its
 * probe tower one tile east — checked with `checkBuild`, which is the same
 * legality `buildTower` runs but without the side effects, so one probe world
 * serves every candidate.
 *
 * **It degrades before it throws, and QA is why.** The full footprint is 128
 * tiles, all required buildable. On a dense map no candidate satisfies it, and
 * the first version of this module then threw — at *module scope*, which
 * vitest reports as a collection error: `Tests no tests`, **259 rows across
 * six files silently not running while a pass-counting dashboard sees zero
 * failures**. That is a worse failure than the one c014 set out to fix, and it
 * also made `class-wide-grove-reach` strictly more fragile than the private
 * one-tile probe it replaced (QA measured both: a 9-wide rock column left the
 * old probe green at 67 tests and the new one at "no tests").
 *
 * So the scan retries with a shrinking footprint and reports which tier it
 * landed on. A `reduced` board still satisfies every consumer that needs only
 * a build tile; the consumers that reach deep east (`tilePastBaseRange`) will
 * fail as their own named rows, which is the legible failure. `BOARD.tier` is
 * asserted `full` on the shipped board by `class-board.test.ts`, so a degraded
 * board is a named failing row rather than silence.
 */
export function probeBoard(
  origin: { tx: number; ty: number } = PROBE_ORIGIN,
  c: Content = defaultContent,
): Board {
  // Full reach first, then the east arm trimmed, then the near box only. The
  // shipped board always lands on the first, which the test asserts.
  const tiers = [
    { east: EAST_REACH, south: SOUTH_REACH },
    { east: Math.floor(EAST_REACH / 2), south: SOUTH_REACH },
    { east: 1, south: 1 },
  ];
  for (const reach of tiers) {
    const hit = probeAt(origin, c, reach);
    if (hit) return hit;
  }
  throw new Error(
    `class-board: no buildable Warden spot within ${MAX_RING} rings of ${origin.tx},${origin.ty}, ` +
      'at any footprint down to a single build tile — this board has no open ground at all',
  );
}

/** The board every §4 liveness file shares. */
export const BOARD = probeBoard();

export const WX = BOARD.WX;
export const WY = BOARD.WY;
export const BUILD_TX = BOARD.BUILD_TX;
export const BUILD_TY = BOARD.BUILD_TY;
