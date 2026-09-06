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
 * **Every one of them imports this module since `c025`.** `class-kit-whiff` was the
 * hold-out — an earlier draft of this header claimed otherwise, which was
 * false, and QA caught it — and it joined once this module learned to export
 * the Ice Wall *column* it needs (`WALL_TX`/`WALL_TYS`) and its p6d agreement
 * was restated as an offset. `BACKLOG-TERRAIN.md` made that seed generate a
 * real map, at which point every pinned file would have failed as `harness
 * could not build ...` — a harness error indistinguishable, to whoever picks
 * it up, from a product regression in the class kits. Logged three times
 * (c005, c006, c009) and never fixed until c014.
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
 * **What "valid" means here** is `footprintClear`'s four clauses below, and
 * the two paragraphs that used to stand here described a different function:
 * they said every tile of a `(1 + EAST_REACH + 1) x (1 + SOUTH_REACH + 1)`
 * rectangle must be `grid.buildable`, sized the cost of that bounding box, and
 * logged narrowing it as the obvious next step. `c026` did the narrowing —
 * forced by the terrain epic, which left **zero of 512 candidate origins** able
 * to supply that block — so the requirement is now the union of the shapes the
 * importers really use: passable floor where dummies stand, a legal build tile,
 * one buildable tile past the base build range in the Warden's row, and (for
 * `class-kit-whiff`, `c025`) a three-tile buildable column two east. The
 * function's own doc comment carries the reasoning; this header no longer
 * restates it in a form that can drift out of step with it again.
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
   * `class-kit-whiff`'s Ice Wall column: the three tiles a vertical wall aimed
   * at `WX + 2, WY` occupies, all buildable and none of them path-sealing.
   *
   * A tile is not enough for that file — c007 pre-builds all three so the wall
   * has nowhere to land — and `footprintClear` does not imply them: since
   * `c026` the footprint asks for **passable** floor plus *one* buildable tile
   * out east, which a wall column can fail while every other importer is
   * served. So the column is probed with the spot rather than assumed from it.
   */
  readonly WALL_TX: number;
  readonly WALL_TYS: readonly [number, number, number];
  /**
   * Whether the column above is real. `false` means the scan could not find a
   * spot that also hosts it and fell back to one that serves everyone else —
   * `class-kit-whiff` then fails on its own named harness row instead of the
   * other six losing their board. `c026`'s rule: the shared footprint asks for
   * what the importers need, and one importer's extra need degrades alone.
   */
  readonly hasWall: boolean;
  /**
   * `full` when the whole `EAST_REACH x SOUTH_REACH` footprint was clear;
   * `reduced` when only a smaller one was, which means a deep-east consumer
   * (`tilePastBaseRange`) may not have the ground it needs. The shipped board
   * measures **`reduced`** since terrain landed, and `class-board.test.ts`
   * asserts that value — it used to require `full`, which `c026` showed was a
   * statement about the old flat arena rather than about the importers.
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
 *  4. **The Ice Wall column**, for the tiers that ask for it (`c025`):
 *     `class-kit-whiff` pre-builds all three tiles a vertical wall aimed two
 *     east occupies, so those need to be tower sites too. One file's need, so
 *     it is asked for on its own rungs of the ladder and given up before
 *     anyone else's reach is.
 *
 * Asking for `buildable` where only `passable` was needed is what made the old
 * check both too strict to satisfy and no more informative.
 */
function footprintClear(
  w: World,
  wx: number,
  wy: number,
  reach: Reach,
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
  if (!farGround) return false;
  // (4), `c025`: `class-kit-whiff` pre-builds the whole Ice Wall column, so
  // those three tiles have to be tower sites, not merely floor. Asked for in
  // the tiers that want it and dropped in the ones that do not.
  //
  // Measured on the shipped map rather than assumed: of the 612 candidate
  // spots, 12 are legal boards without the column and **11 with it** — the one
  // it costs is `10,5`, and the shipped `10,6` is not it. Small, but not zero,
  // which is why it degrades on its own rung instead of narrowing the board
  // every importer shares.
  if (!reach.wall) return true;
  for (const ty of wallTys(wy)) {
    if (!w.grid.buildable(wx + WALL_DX, ty)) return false;
  }
  return true;
}

/** One rung of the degradation ladder `probeBoard` walks. */
interface Reach {
  east: number;
  south: number;
  /** Whether this rung also requires the Ice Wall column (`c025`). */
  wall: boolean;
}

/** The Ice Wall column's own east offset: `class-kit-whiff` aims at `WX + 2, WY`. */
export const WALL_DX = 2;

/** The three rows a vertical wall aimed at `WALL_DX, wy` occupies (`fireIceWall`). */
function wallTys(wy: number): [number, number, number] {
  return [wy - 1, wy, wy + 1];
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
  reach: Reach,
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
    // The whiff column goes up as three towers at once, so the seal check has
    // to be asked of the three together — each one alone can be harmless while
    // the column closes the last corridor.
    const wall = wallTys(ty).map((wty) => [tx + WALL_DX, wty] as [number, number]);
    if (reach.wall && w.grid.wouldBlockPath(wall)) continue;
    // `footprintClear` pre-filters the column with `grid.buildable`, which is
    // cheap and runs before the Warden is parked. `class-kit-whiff` places it
    // with `buildTower`, so the probe asks the same question `buildTower` asks
    // — phase, range, gold and terrain, not just occupancy — now that there is
    // a parked Warden to ask it from.
    if (reach.wall && wall.some(([wtx, wty]) => checkBuild(w, id, wtx, wty) !== null)) continue;
    return {
      WX: tx,
      WY: ty,
      BUILD_TX: tx + 1,
      BUILD_TY: ty,
      WALL_TX: tx + WALL_DX,
      WALL_TYS: wallTys(ty),
      hasWall: reach.wall,
      tier: reach.east === EAST_REACH ? 'full' : 'reduced',
    };
  }
  return null;
}

/**
 * The first spot at or near `origin` where the Warden can stand and build its
 * probe tower one tile east — checked with `checkBuild`, which is the same
 * legality `buildTower` runs but without the side effects, so one probe world
 * serves every candidate.
 *
 * **It degrades before it throws, and QA is why.** On a dense map no candidate
 * satisfies the full footprint — since the terrain epic none does even on the
 * shipped map, which is why the answer below is `reduced` — and the first
 * version of this module then threw — at *module scope*, which
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
  // Full reach first, then the east arm trimmed, then the near box. The
  // shipped board lands on the *third* rung (`reduced`, with a wall), which
  // `class-board.test.ts` asserts and this comment used to get wrong.
  const tiers: Reach[] = [
    { east: EAST_REACH, south: SOUTH_REACH, wall: true },
    // `c025`: the Ice Wall column is one file's need, so it is given up before
    // anyone else's *reach* is — which is why the wall-free full rung sits
    // above the reduced-reach one with a wall. On a rung without it,
    // `class-kit-whiff` fails on its own named `hasWall` row and every other
    // importer still has the board it needs.
    //
    // The near-box floor is `east: 4`, not 1, and that is a fix rather than a
    // taste: `footprintClear`'s far-ground clause scans `dx = 4..east`, so at
    // `east: 1` the loop never runs, `farGround` stays false and the rung can
    // never succeed. It was dead code, and the throw below advertised a floor
    // ("down to a single build tile") the ladder could not reach. Measured: 0
    // legal spots at `east: 1` anywhere on the shipped map.
    { east: EAST_REACH, south: SOUTH_REACH, wall: false },
    { east: Math.floor(EAST_REACH / 2), south: SOUTH_REACH, wall: true },
    { east: Math.floor(EAST_REACH / 2), south: SOUTH_REACH, wall: false },
    { east: 4, south: 1, wall: false },
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
export const HAS_WALL = BOARD.hasWall;
export const WALL_TX = BOARD.WALL_TX;
export const WALL_TYS = BOARD.WALL_TYS;
/** The Ice Wall aim point — the column's own middle tile, which is `WALL_TX, WY`. */
export const WALL_TY = BOARD.WY;
