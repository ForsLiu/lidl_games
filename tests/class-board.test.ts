/**
 * c014 — the shared board, and the proof that nothing pins it privately again.
 *
 * `tests/class-board.ts` exists because six files each carried their own copy
 * of `WX/WY = 10,10` and a build tile at `11,10`. Deleting five copies is easy;
 * keeping them deleted is what this file is for. Two properties, neither of
 * them prose:
 *
 *  1. **The board is probed.** `probeBoard` accepts a tile only if the Warden
 *     can legally build one tile east of it (`checkBuild`, the same legality
 *     `buildTower` runs) without sealing the Core, and only if the whole
 *     footprint the six files reach into is open board. Asserted here against
 *     the shipped grid, and asserted *again* from a deliberately shifted
 *     origin — which is the terrain epic's failure mode rehearsed: the tile
 *     under `10,10` stops being available and the scan walks somewhere else.
 *
 *  2. **No file pins it privately.** Source-text anchors, the convention c012
 *     and c017 already use in this lane: each of the six imports its geometry
 *     from `./class-board` and declares none of its own. That is what makes
 *     "a shifted origin moves all six together" a fact rather than a hope —
 *     they read the same four exported numbers, so there is nowhere else for
 *     the geometry to come from.
 *
 * **`tests/class-kit-whiff.test.ts` was the named exception until `c025`, and
 * is now an importer like the rest.** c014 left it out because its Ice Wall
 * row states the same whiff policy as the out-of-Scope
 * `tests/p6d-nine-classes.test.ts` and pinned the agreement as
 * `expect([AX, AY]).toEqual([12, 10])` — de-hardcoding one side of an
 * agreement about absolute tiles breaks it. c025 removed both halves of that:
 * the module exports the Ice Wall *column* the file needs, and the agreement
 * is now an offset read out of p6d's own occupancy test
 * (`tests/class-p6d-agreement.ts`). The row that guarded the exemption now
 * guards the agreement, below.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { CORE_H, CORE_W, CORE_X, CORE_Y, GRID_H, GRID_W } from '../src/sim/grid';
import { buildTower, checkBuild } from '../src/sim/towers';
import { World } from '../src/sim/world';
import {
  BOARD,
  BUILD_TX,
  BUILD_TY,
  EAST_REACH,
  HAS_WALL,
  PROBE_ORIGIN,
  SOUTH_REACH,
  WALL_TX,
  WALL_TYS,
  WX,
  WY,
  probeBoard,
  type Board,
} from './class-board';
import { cfg } from './helpers';

const content = loadContent();

/**
 * **Swept, not listed.** The first draft of this file hand-wrote the six
 * importers and hand-named one exception, and code review found the hole that
 * shape guarantees: `tests/class-deeper-draw.test.ts` was already an eighth
 * file pinning `WX/WY = 10,10`, in this lane's Scope, invisible to a list
 * nobody had typed it into — while the exception row below claimed to exist so
 * that "the exception cannot quietly become six-plus-one-forgotten". A
 * hand-maintained list definitionally cannot see the seventh liveness file
 * somebody adds next month either.
 *
 * So the rule is applied to **every** `tests/class-*.test.ts` on disk (the
 * `readdirSync` convention `tests/architecture.test.ts` and
 * `tests/class-wide-grove-reach.test.ts` already use in this repo), and a file
 * escapes it only by appearing in `EXCEPTIONS` with a reason.
 */
const CLASS_TESTS = readdirSync(__dirname)
  .filter((f) => f.startsWith('class-') && f.endsWith('.test.ts'))
  .map((f) => f.replace(/\.test\.ts$/, ''))
  .sort();

/**
 * Files the rule deliberately does not apply to, each with the reason it does
 * not. A file may sit here only because converting it is *impossible from this
 * lane*, never because converting it was inconvenient.
 */
const EXCEPTIONS: Record<string, string> = {
  // This file is the rule; it owns the geometry rather than importing it.
  'class-board':
    'the rule itself — it imports ./class-board by definition and asserts the shipped board as a baseline',
  // `class-kit-whiff` was here until `c025` and is now an importer like the
  // rest. Both halves of its exemption are gone: the module exports the wall
  // column it needed (`WALL_TX`/`WALL_TYS`, probed, degrading on its own rung),
  // and its p6d agreement is stated as an *offset* read out of p6d's source
  // rather than as the absolute `[12, 10]` — which stopped being this file's
  // tile the moment terrain moved the shared board to `10,6`. The exemption's
  // own note that `footprintClear` "already validates that column" was true of
  // the pre-`c026` bounding box and false afterwards; the column is checked
  // explicitly now.
  // c019's file. It parks the Warden on a *derived* centre
  // (`Math.floor(GRID_W / 2)`) and places no tower, so the literal-pin rule
  // has nothing to catch — but code review is right that derived-and-unprobed
  // is exactly as terrain-fragile as pinned, and an exemption that falls out
  // of the rule's own gating is worse than one written down. It is written
  // down here rather than converted because converting would move a c019
  // baseline (its centre `18,10` -> the shared `10,10`) across 90 cast-cadence
  // cases that this item does not measure and has no reason to disturb — and
  // it would buy nothing, since the file needs no build tile.
  'class-active2-cdr':
    'parks on a derived centre from grid.ts and places no tower, so it has no build tile to share; ' +
    'converting would move 90 cast-cadence baselines for no terrain gain',
};

/** Every file the rule applies to: the sweep minus the named exceptions. */
const IMPORTERS = CLASS_TESTS.filter((f) => !(f in EXCEPTIONS));

function source(name: string): string {
  return readFileSync(join(__dirname, `${name}.test.ts`), 'utf8');
}

/**
 * Strips comments **and string literals**, so neither prose *about* a pin nor
 * a quoted *sample* of one counts as one.
 *
 * The string half arrived with `c025`: `tests/class-p6d-agreement.test.ts`
 * builds a miniature p6d out of string literals — `'    w.warden.x = 4;'`,
 * `'buildTower(w, arrow.id, 12, ty)'` — to exercise the agreement parser on
 * synthetic input, and the sink rules read all four of them as real board
 * pins. A sink inside a quote is text, not a placement. Real pins are
 * unaffected: a park is `w.warden.x = WX;` and a build call is
 * `tower(w, WALL_TX, ty)`, neither of which is ever quoted — the injection
 * check below is what keeps that claim honest.
 */
function code(name: string): string {
  return source(name)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/`(?:[^`\\]|\\[\s\S])*`/g, '``')
    .replace(/'(?:[^'\\\n]|\\[\s\S])*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\[\s\S])*"/g, '""');
}

/**
 * Every function in this file that places a tower: `buildTower` itself, plus
 * any local helper whose last two parameters are `tx: number, ty: number`.
 *
 * Derived, not hardcoded. Code review's second pass: a fixed
 * `(buildTower|place|tower)` set let a helper named anything else escape the
 * build rule entirely — and, worse, escaping also set `builds = false`, which
 * switched off the park and import rules for that file too. The anchors failed
 * *open*, silently. `.`-prefixed calls (`h.place(...)`) are excluded from the
 * boundary class for the same reason they were before: a method call is not
 * one of this file's own helpers.
 */
function placerNames(src: string): string[] {
  const names = new Set(['buildTower']);
  for (const m of src.matchAll(/function\s+(\w+)\s*\(([^)]*)\)/g)) {
    const params = m[2]
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);
    const tail = params.slice(-2).join(', ');
    if (/^tx:\s*number,\s*ty:\s*number$/.test(tail)) names.add(m[1]);
  }
  return [...names];
}

/**
 * The tile pair every tower-placing call ends with.
 *
 * Walked with a paren counter rather than matched with a regex, because both
 * regex drafts were wrong in ways that matter: `(?:place|tower)\(` matched
 * `replace(` and `[\s\S]{0,200}?\)` stopped at the first inner `)`, so
 * `buildTower(w, c.towerByKey.get(SPIRE)!.id, BUILD_TX, BUILD_TY)` read as the
 * argument list `w, c.towerByKey.get(SPIRE`. An anchor that mis-parses the
 * call it is guarding is worse than no anchor, since it fails on correct code
 * and so gets loosened until it passes on anything.
 *
 * Declarations (`function place(w: World, tx: number, ty: number)`) are skipped
 * — they are where the forwarding parameters are named, not where a tile is
 * chosen.
 */
function buildCallTiles(src: string): string[] {
  const out: string[] = [];
  const name = new RegExp(`(^|[^A-Za-z0-9_$])(${placerNames(src).join('|')})\\s*\\(`, 'g');
  for (const m of src.matchAll(name)) {
    const before = src.slice(Math.max(0, m.index! - 12), m.index! + m[1].length);
    if (/\bfunction\s*$/.test(before)) continue;
    // Walk from the opening paren to its match, tracking nesting so inner
    // calls, generics and array literals stay inside one argument.
    let i = m.index! + m[0].length;
    let depth = 1;
    const args: string[] = [];
    let cur = '';
    for (; i < src.length && depth > 0; i++) {
      const ch = src[i];
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') depth--;
      if (depth === 0) break;
      if (ch === ',' && depth === 1) {
        args.push(cur.trim());
        cur = '';
        continue;
      }
      cur += ch;
    }
    args.push(cur.trim());
    if (args.length < 3) continue; // no tile pair to check
    out.push(args.slice(-2).join(', '));
  }
  return out;
}

/**
 * The property `probeBoard` promises, re-checked from outside it: a class with
 * no `buildRange` mod, standing on `WX,WY`, can build on `BUILD_TX,BUILD_TY`.
 * `swordsman` deliberately — the Engineer's +2 would let a tile pass here that
 * the other eleven classes could not reach.
 */
function buildsFrom(b: Board): ReturnType<typeof checkBuild> {
  const w = new World(cfg({ classKey: 'swordsman' }), content);
  w.gold = 1e6;
  w.warden.x = b.WX;
  w.warden.y = b.WY;
  return checkBuild(w, content.towerByKey.get('arrow_spire')!.id, b.BUILD_TX, b.BUILD_TY);
}

/**
 * The tiles a board of this tier actually claims.
 *
 * Tier-aware, and it has to be: reading the *full* reach off a `reduced` board
 * reported "footprint tile 25,9 is a Core tile" — a tile the probe never
 * claimed and the importers never touch. The check was measuring the constant
 * rather than the board.
 */
function footprintTiles(b: Board): Array<[number, number]> {
  const east = b.tier === 'full' ? EAST_REACH : REDUCED_EAST;
  const out: Array<[number, number]> = [];
  for (let ty = b.WY - 1; ty <= b.WY + SOUTH_REACH; ty++) {
    for (let tx = b.WX - 1; tx <= b.WX + east; tx++) out.push([tx, ty]);
  }
  return out;
}

/** The east reach a `reduced` board claims — `probeBoard`'s second tier. */
const REDUCED_EAST = Math.floor(EAST_REACH / 2);

/**
 * The two guarantees an importer actually depends on, whatever tier the board
 * landed on: a legal build tile, and real ground for `tilePastBaseRange` to
 * find. Asserted directly, because `tier === 'full'` turned out to be a
 * statement about the old flat arena rather than about the importers — see the
 * baseline row below.
 */
function servesImporters(b: Board): { builds: boolean; farGround: boolean } {
  const w = new World(cfg({ classKey: 'swordsman' }), content);
  w.gold = 1e6;
  w.warden.x = b.WX;
  w.warden.y = b.WY;
  const east = b.tier === 'full' ? EAST_REACH : REDUCED_EAST;
  let farGround = false;
  for (let dx = 4; dx <= east && !farGround; dx++) if (w.grid.buildable(b.WX + dx, b.WY)) farGround = true;
  return { builds: buildsFrom(b) === null, farGround };
}

describe('c014: the shared board is probed, not pinned', () => {
  it('the shipped board still lands where the six files calibrated against', () => {
    // Not a hardcode creeping back: the *baseline*. CLAUDE.md's measurement
    // rules say a refactor must not move a baseline it is not measuring, and
    // every window in the six files was calibrated from this spot. If a future
    // change to `/data` or the grid moves it, this is the row that says so, and
    // the six files' margins get re-read rather than silently inherited.
    expect(
      { WX, WY, BUILD_TX, BUILD_TY },
      'the probed board moved off the spot the importers were calibrated from. This is a deliberate ' +
        'baseline, not a hardcode: re-read those files\' windows and margins (Core distance, board edges, ' +
        'chain-line room) before updating this row to the new answer.',
    ).toEqual({ WX: 10, WY: 6, BUILD_TX: 11, BUILD_TY: 6 });
    expect(BOARD).toEqual({
      WX,
      WY,
      BUILD_TX,
      BUILD_TY,
      WALL_TX,
      WALL_TYS,
      hasWall: BOARD.hasWall,
      tier: BOARD.tier,
    });
    // c025's column, as a baseline of its own: the aim point `class-kit-whiff`
    // fires the Ice Wall at, and the three rows that wall occupies.
    expect({ WALL_TX, WALL_TYS: [...WALL_TYS] }, 'the shared Ice Wall column moved').toEqual({
      WALL_TX: 12,
      WALL_TYS: [5, 6, 7],
    });
    expect(HAS_WALL, 'the shipped board cannot host the Ice Wall column — class-kit-whiff will say so too').toBe(true);
  });

  /**
   * **The baseline above moved once, on purpose, and this is the record.**
   *
   * It read `10,10` / `11,10` until master's terrain epic (`fb077`) landed and
   * `cfg()`'s seed started generating a real map. The scan then walked to
   * `10,6` — which is the entire point of c014, and the seven importers went
   * green on the new board without a line changing in any of them. The row
   * above fired exactly once, loudly, saying the board had moved; it did not
   * degenerate into seven files each reporting "harness could not build".
   */
  it('the shipped board serves what the importers actually need, whatever tier it landed on', () => {
    // `tier === 'full'` used to be asserted here and it was wrong — not
    // wrong-in-detail, wrong in kind. Measured on the generated map: 408 of 720
    // tiles are buildable and **zero of 512 candidate origins** yield a
    // contiguous full-reach footprint. Requiring `full` was requiring the flat
    // arena the module was written on. What the importers depend on is narrower
    // and is asserted directly instead.
    const serves = servesImporters(BOARD);
    expect(serves.builds, 'the shared build tile is not legal for a base-range class').toBe(true);
    expect(
      serves.farGround,
      'no buildable ground past dx 4 in the Warden row — tilePastBaseRange (class-passive-liveness) ' +
        'would find nothing and fail as a harness error',
    ).toBe(true);
  });

  it('the tier the shipped board landed on is recorded, so a change in it is visible', () => {
    // Reported rather than required. If terrain generation ever gets generous
    // enough for a `full` board, or stingy enough that even `reduced` fails,
    // this row is where that shows up.
    expect(['full', 'reduced']).toContain(BOARD.tier);
    expect(BOARD.tier, 'the shipped board tier changed — see the note above before updating').toBe('reduced');
  });

  it('a class with no buildRange bonus can actually build on it', () => {
    expect(buildsFrom(BOARD), 'the shared build tile is not legal for a base-range class').toBeNull();
  });

  it('the tower it places does not seal the Core', () => {
    const w = new World(cfg({ classKey: 'swordsman' }), content);
    expect(w.grid.wouldBlockPath([[BUILD_TX, BUILD_TY]])).toBe(false);
  });

  it('every tile the six files reach into is open board, clear of the border and the Core', () => {
    for (const [tx, ty] of footprintTiles(BOARD)) {
      expect(tx, `footprint tile ${tx},${ty} ran off the west/east edge`).toBeGreaterThan(0);
      expect(tx).toBeLessThan(GRID_W - 1);
      expect(ty, `footprint tile ${tx},${ty} ran off the north/south edge`).toBeGreaterThan(0);
      expect(ty).toBeLessThan(GRID_H - 1);
      const onCore = tx >= CORE_X && tx < CORE_X + CORE_W && ty >= CORE_Y && ty < CORE_Y + CORE_H;
      expect(onCore, `footprint tile ${tx},${ty} is a Core tile`).toBe(false);
    }
  });

  it('the build tile is the Warden spot plus one east, which is the offset the six files were written around', () => {
    expect([BUILD_TX - WX, BUILD_TY - WY]).toEqual([1, 0]);
  });

  /**
   * c025: the Ice Wall column, checked the way `class-kit-whiff` uses it —
   * three real `buildTower` calls, not three `grid.buildable` reads. The
   * difference is the point of that file: its Ice Wall row pre-occupies all
   * three tiles so the Active has nowhere to land, and a tile that `buildable`
   * accepts but `buildTower` rejects would make the whiff pass for the wrong
   * reason (nothing was in the way; the Active simply never fired).
   */
  it('the Ice Wall column is three tiles a tower can really go on', () => {
    const w = new World(cfg({ classKey: 'swordsman' }), content);
    w.gold = 1e6;
    w.warden.x = WX;
    w.warden.y = WY;
    const id = content.towerByKey.get('arrow_spire')!.id;
    expect(WALL_TYS, 'the column is the three rows a vertical wall occupies').toEqual([WY - 1, WY, WY + 1]);
    expect(WALL_TX - WX, "the aim point is the Warden's spot plus two east — c007's AX").toBe(2);
    for (const ty of WALL_TYS) {
      expect(buildTower(w, id, WALL_TX, ty).ok, `column tile ${WALL_TX},${ty} is not buildable`).toBe(true);
    }
  });

  it('the whole column at once does not seal the Core', () => {
    // Asked of the three together: `fireIceWall` raises them in one cast, and
    // each tile alone can be harmless while the column closes the corridor.
    const w = new World(cfg({ classKey: 'swordsman' }), content);
    expect(w.grid.wouldBlockPath(WALL_TYS.map((ty) => [WALL_TX, ty] as [number, number]))).toBe(false);
  });
});

describe('c014: a shifted probe origin moves the whole board', () => {
  /**
   * Four origins, none of which can be served by the shipped answer: two whose
   * own footprint runs into the Core or the border, one out past the Core. The
   * scan has to walk in every case — which is what the terrain epic now makes
   * it do at `10,10` as well.
   */
  const SHIFTED = [
    // `1,1`, the far-corner case, moved out of this list at `c025` and into a
    // row of its own below — it now *converges on* the shipped board, which is
    // a measurement worth keeping rather than a case worth deleting. `25,12`
    // takes its place here: same job, answer `26,12`, nowhere near the shipped
    // board.
    { tx: 25, ty: 12 },
    { tx: 15, ty: 6 },
    { tx: 30, ty: 15 },
    { tx: 22, ty: 3 },
  ] as const;

  for (const origin of SHIFTED) {
    it(`origin ${origin.tx},${origin.ty}: still a legal board, and not the shipped one`, () => {
      const b = probeBoard(origin);
      expect(b, 'the scan handed back the shipped board for a shifted origin').not.toEqual(BOARD);
      const serves = servesImporters(b);
      expect(serves.builds, `origin ${origin.tx},${origin.ty}: probed board is not buildable`).toBe(true);
      expect(serves.farGround, `origin ${origin.tx},${origin.ty}: no far ground for tilePastBaseRange`).toBe(true);
      expect(buildsFrom(b), `probed board at origin ${origin.tx},${origin.ty} is not buildable`).toBeNull();
      expect([b.BUILD_TX - b.WX, b.BUILD_TY - b.WY]).toEqual([1, 0]);
      // c025: the column travels with the spot rather than staying behind at
      // the shipped one — the property `class-kit-whiff` needs from a shift.
      expect([b.WALL_TX - b.WX, ...b.WALL_TYS.map((ty) => ty - b.WY)]).toEqual([2, -1, 0, 1]);
      if (b.hasWall) {
        const w = new World(cfg({ classKey: 'swordsman' }), content);
        w.gold = 1e6;
        w.warden.x = b.WX;
        w.warden.y = b.WY;
        const id = content.towerByKey.get('arrow_spire')!.id;
        for (const ty of b.WALL_TYS) {
          expect(buildTower(w, id, b.WALL_TX, ty).ok, `origin ${origin.tx},${origin.ty}: column tile ${b.WALL_TX},${ty}`).toBe(true);
        }
      }
      for (const [tx, ty] of footprintTiles(b)) {
        expect(tx > 0 && tx < GRID_W - 1 && ty > 0 && ty < GRID_H - 1).toBe(true);
      }
    });
  }

  it('the far corner converges on the shipped board, and the reason is that there are eleven spots', () => {
    // `1,1` was a `SHIFTED` case until `c025` and is kept as its own row,
    // because what it measures changed rather than stopped being true. Its
    // nearest legal board used to be `10,5` — the single spot on this map that
    // the Ice Wall column costs (12 legal boards without the column, 11 with),
    // so the walk from the corner now ends one row further on, at the shipped
    // board itself. Asserting "a shift moves the board" there would assert the
    // opposite of what happens; asserting *this* keeps the fact on the record.
    expect(probeBoard({ tx: 1, ty: 1 })).toEqual(BOARD);
    // The claim underneath it, so the row above cannot quietly become true for
    // some other reason: legal boards are scarce, and the corner has no local
    // one at all.
    let legal = 0;
    for (let ty = 1; ty < GRID_H - 1; ty++) {
      for (let tx = 1; tx < GRID_W - 1; tx++) {
        const b = probeBoard({ tx, ty });
        if (b.WX === tx && b.WY === ty) legal++;
      }
    }
    expect(legal, 'the number of legal boards on the shipped map moved — re-read the c025 measurement').toBe(11);
  });

  it('the scan is a fallback, not a search: probing from its own answer returns that answer', () => {
    // **This row used to also assert `PROBE_ORIGIN` equals the answer**, which
    // held only while `10,10` was open ground. Terrain closed it, the scan
    // walked to `10,6`, and the assertion failed — for the right reason, but it
    // was stating the arena's property rather than the scan's.
    //
    // The scan's actual invariant is idempotence: probing from the answer
    // returns the answer. That is what keeps the baseline stable across runs
    // and what makes "the board moved" a real event rather than scan jitter.
    expect(probeBoard({ tx: WX, ty: WY })).toEqual(BOARD);
    // And the origin is still tried first — checked by the one case where that
    // is observable, a board whose origin *is* usable.
    const fromAnswer = probeBoard({ tx: BOARD.WX, ty: BOARD.WY });
    expect([fromAnswer.WX, fromAnswer.WY]).toEqual([BOARD.WX, BOARD.WY]);
  });

  it('the shipped origin no longer survives the generated map, and the reason is the south arm', () => {
    // The premise of the whole module, now a fact rather than a forecast — but
    // **not** the fact the first draft of this row guessed. It asserted the old
    // build tile `11,10` had become unbuildable; it has not, and the row failed
    // saying so. `checkBuild(11, 10)` still returns `null`.
    //
    // What terrain actually closed is the *southern arm* of the footprint:
    // rows 14-16 below `10,10` carry impassable ground, so the spot fails the
    // `SOUTH_REACH` requirement while its build tile stays perfectly legal.
    // That distinction matters — a file that had pinned only the build tile
    // would still work today, and one that placed dummies to the south would
    // not. The old six did both.
    const w = new World(cfg({ classKey: 'swordsman' }), content);
    const id = content.towerByKey.get('arrow_spire')!.id;
    w.gold = 1e6;
    w.warden.x = PROBE_ORIGIN.tx;
    w.warden.y = PROBE_ORIGIN.ty;
    expect(checkBuild(w, id, PROBE_ORIGIN.tx + 1, PROBE_ORIGIN.ty), 'the old build tile is legal — still true').toBeNull();

    const impassable: string[] = [];
    for (let ty = PROBE_ORIGIN.ty - 1; ty <= PROBE_ORIGIN.ty + SOUTH_REACH; ty++) {
      for (let tx = PROBE_ORIGIN.tx - 1; tx <= PROBE_ORIGIN.tx + REDUCED_EAST; tx++) {
        if (!w.grid.passable(tx, ty)) impassable.push(`${tx},${ty}`);
      }
    }
    expect(
      impassable.length,
      'the old hardcoded spot is fully open ground again — terrain generation changed. The scan still ' +
        'works either way, but this row (and the baseline above) are now describing a map that moved.',
    ).toBeGreaterThan(0);
    // And the scan's answer is genuinely somewhere else, not the origin.
    expect([BOARD.WX, BOARD.WY]).not.toEqual([PROBE_ORIGIN.tx, PROBE_ORIGIN.ty]);
  });
});

describe('c014: no importer pins the board privately again', () => {
  /**
   * **Positive anchors, because the negative ones did not bite.** The first
   * draft asserted `^const W[XY]` and "no literal tile pair in a build call".
   * Code review ran six realistic re-pin shapes past them and five got
   * through: an indented `const WX = 10` inside a helper, `const PARK = {tx:
   * 10, ty: 10}`, `let WX2 = 10`, a prettier-wrapped multi-line build call,
   * `tower(w, WX+1, WY)` without spaces, and a renamed `const TX = 11`. A
   * negative anchored on two exact names can never be complete: renaming the
   * variable defeats it.
   *
   * What cannot be renamed is the *sink*. A file that parks the Warden writes
   * `w.warden.x = ...`, and a file that builds calls `buildTower`/`place`/
   * `tower`. So the rule is stated at those two sinks — the value assigned
   * must be the imported symbol — and the negative anchors stay only as a
   * cheap second opinion.
   */
  it('the sweep found the class-* files, and every exception carries a reason', () => {
    expect(CLASS_TESTS.length, 'the sweep found no tests/class-*.test.ts at all').toBeGreaterThan(5);
    expect(IMPORTERS.length).toBeGreaterThan(0);
    for (const [name, reason] of Object.entries(EXCEPTIONS)) {
      expect(CLASS_TESTS, `EXCEPTIONS names ${name}, which is not a tests/class-*.test.ts`).toContain(name);
      expect(reason.length, `the ${name} exception carries no reason`).toBeGreaterThan(20);
    }
  });

  for (const name of IMPORTERS) {
    describe(name, () => {
      /**
       * A file that never parks the Warden and never builds has no board to
       * pin, so the two sink rules are vacuous for it and only the negatives
       * apply. Computed, not listed — that is the whole point of the sweep.
       */
      const src = code(name);
      const parks = /w\.warden\.(x|y)\s*=/.test(src);
      const builds = buildCallTiles(src).length > 0;

      it('pins no board coordinate of its own', () => {
        // Broadened from the first draft's `^const W[XY]`: not anchored to
        // column 0 (an indented re-pin inside a helper slipped through), and
        // `let`/`var` count too. Narrowed in one direction at the same time:
        // only a *numeric literal* is a pin. `class-active2-cdr` derives its
        // centre as `Math.floor(GRID_W / 2)`, which is already terrain-proof
        // and is the shape this rule wants, not the shape it forbids.
        expect(src, `${name}: a board coordinate is pinned to a literal here`).not.toMatch(
          /\b(?:const|let|var)\s+W[XY]\s*=\s*-?\d/,
        );
      });

      // A file that never places a tower has no build tile, and so no board to
      // share: `class-active2-cdr` derives its own centre and says so in its
      // header. The park rule follows the build rule rather than standing alone.
      // `parks || builds`, not `parks && builds`. Code review's second pass:
      // the `&&` meant `class-deeper-draw` — the very file the previous
      // round's Major 3 was about — parks the Warden, places no tower, and so
      // got no sink coverage at all. Its only guard was the literal-pin
      // negative, which a *derived but unprobed* coordinate walks straight
      // past, and a derived-unprobed spot is exactly as terrain-fragile as a
      // pinned one.
      if (parks || builds) {
        it('imports its geometry from ./class-board', () => {
          // Which symbols is left to the two sink rules below: `class-wide-
          // grove-reach` parks on `spot.tx + 0.5` off the shared build tile
          // and never needs `WX`, which an import rule naming `WX` would have
          // called a violation. What matters is that the geometry comes from
          // the module and not from the file.
          expect(source(name)).toMatch(/import \{[^}]*\} from '\.\/class-board';/);
        });

        it('parks the Warden on the shared spot — every warden.x/y write is WX/WY', () => {
          // The sink a rename cannot escape. `w.warden.x = PARK.tx` fails here.
          const writes = [...src.matchAll(/w\.warden\.(x|y)\s*=\s*([^;\n]+)/g)].map((m) => [m[1], m[2].trim()]);
          expect(writes.length, 'the parking probe found no warden.x/y write to check').toBeGreaterThan(0);
          for (const [axis, value] of writes) {
            const want = axis === 'x' ? ['WX', 'BUILD_TX + 0.5'] : ['WY', 'BUILD_TY + 0.5'];
            expect(want, `${name}: w.warden.${axis} = ${value} — park on the shared spot, not a private one`).toContain(
              value,
            );
          }
        });
      }

      if (builds) {
        it('builds only on the shared tile — every build call ends in BUILD_TX, BUILD_TY', () => {
          const tiles = [...new Set(buildCallTiles(src))];
          // Only imported symbols, plus a helper forwarding its own declared
          // parameters (`place(w, key, tx, ty)`) — which is where the shared
          // tile arrives from, so the *caller* is what this rule reads.
          //
          // `spot.tx, spot.ty` used to be allowlisted and is deliberately gone:
          // matched on identifier text, it let the private probe this item
          // deleted be re-introduced under the same local name and pass every
          // rule (code review). `class-wide-grove-reach` now names the imported
          // symbols at its sinks instead, and `tsc` forbids shadowing those.
          //
          // `far!.tx` is `tilePastBaseRange`'s probed result — a `checkBuild`
          // probe like the shared one, kept because the Engineer's reach clause
          // is *about* a tile the base range cannot reach and so cannot use the
          // shared one.
          // `WALL_TX, ...` is `c025`'s Ice Wall column — probed by the same
          // module and moving with the same spot, so it is shared geometry in
          // exactly the sense this rule is about, not a private pin.
          const bad = tiles.filter(
            (t) => !/^(BUILD_TX, BUILD_TY|WALL_TX, (WALL_TY|ty)|tx, ty|far!?\.tx, far!?\.ty)$/.test(t),
          );
          expect(bad, `${name}: build calls on a tile that is not the shared one`).toEqual([]);
        });

        it('imports the shared build tile', () => {
          expect(source(name)).toMatch(/import \{[^}]*\bBUILD_TX\b[^}]*\} from '\.\/class-board';/);
        });
      }
    });
  }

  it('the class-active2-cdr exception still describes that file — "derived centre", not a pin', () => {
    // QA on c014: an `EXCEPTIONS` row turns every rule off for its file, so an
    // unasserted reason is a standing invitation. Measured — replacing that
    // file's derived centre with `const WX = 10` and parking on literals left
    // all 56 rows green, while the same injection into `class-deeper-draw`
    // was caught. An exception has to carry its own tripwire, exactly as the
    // class-kit-whiff row below does.
    expect(
      code('class-active2-cdr'),
      'the exception says "parks on a derived centre from grid.ts" — it does not any more, so either ' +
        'convert the file or rewrite the exception',
    ).toMatch(/const WX = Math\.floor\(GRID_W \/ 2\)/);
  });

  /**
   * `c025` converted `class-kit-whiff`, so the row that guarded its exemption
   * becomes the row that guards its *agreement*. Same job, other side: the
   * exemption existed because that file states one whiff policy jointly with
   * the out-of-Scope `p6d-nine-classes`, and the conversion only holds while
   * the two still fire the same cast.
   */
  it('class-kit-whiff reads its p6d agreement out of p6d, and p6d still states it', () => {
    const s = source('class-kit-whiff');
    expect(s, 'class-kit-whiff is an importer now — it may not re-pin the board').not.toMatch(/^const WX = 10;$/m);
    // The agreement is an *offset* now, because terrain moved the shared board
    // to 10,6 and `[12, 10]` stopped being this file's tile. It still names
    // p6d's own numbers, read out of p6d rather than retyped.
    expect(s, 'the p6d agreement is gone from class-kit-whiff').toMatch(/p6d\.aimX - p6d\.parkX/);
    // And it is *read*, not retyped. QA replaced the parse with
    // `const P6D = { parkX: 10, parkY: 10, aimX: 12, aimY: 10 }` and this row
    // stayed green — which is the hardcoded-expectation shape the parse exists
    // to remove, reappearing inside the guard that protects it.
    expect(s, 'class-kit-whiff retyped p6d\'s numbers instead of reading them').toMatch(
      /import \{[^}]*\bp6dIceWall\b[^}]*\} from '\.\/class-p6d-agreement';/,
    );
    expect(
      readFileSync(join(__dirname, 'class-p6d-agreement.ts'), 'utf8'),
      'class-p6d-agreement no longer reads p6d at all',
    ).toMatch(/readFileSync\([\s\S]{0,160}P6D_FILE/);
    const p6d = readFileSync(join(__dirname, 'p6d-nine-classes.test.ts'), 'utf8');
    // Anchored on p6d's *Ice Wall* rows, not on any `12, 10` in the file.
    // Code review (c014): p6d has eight matches for the loose pattern, most of
    // them unrelated dummy placements, so it could de-hardcode the aim point
    // entirely and this row would stay green — leaving the agreement asserting
    // nothing after its other side had gone.
    expect(p6d, 'p6d no longer pins the Ice Wall tile — the agreement has nothing to agree with').toMatch(
      /w\.(grid\.buildable|structureAt)\(12, 10\)/,
    );
    // And the column is built from the shared export in a loop over it, not
    // from a local `ty` that happens to run 9..11: the sink allowlist accepts
    // `WALL_TX, ty`, so this is what keeps that `ty` honest.
    expect(code('class-kit-whiff'), 'the wall column is built from something other than WALL_TYS').toMatch(
      /for \(const ty of WALL_TYS\)/,
    );
  });

  it('EAST_REACH and SOUTH_REACH still cover the deepest offset any importer actually uses', () => {
    // Not decoration. `EAST_REACH` is what makes `footprintClear` guard the
    // tiles `tilePastBaseRange` scans, and 14 is *also* the largest value
    // compatible with the shipped answer staying `10,10`: with GRID_W 36 and
    // CORE_X 25, a reach of 15 would put 10 + 15 on the Core column and
    // relocate the whole board (code review). The two constraints are one
    // tile apart, so a file that starts reaching to WX + 15 must redden this
    // row and name the collision rather than silently moving six suites.
    let deepestEast = 0;
    let deepestSouth = 0;
    let eastFile = '';
    for (const name of IMPORTERS) {
      for (const m of code(name).matchAll(/\bWX \+ ([0-9]+(?:\.[0-9]+)?)/g)) {
        const n = Number(m[1]);
        if (n > deepestEast) {
          deepestEast = n;
          eastFile = name;
        }
      }
      for (const m of code(name).matchAll(/\bWY \+ ([0-9]+(?:\.[0-9]+)?)/g)) {
        deepestSouth = Math.max(deepestSouth, Number(m[1]));
      }
    }
    expect(deepestEast, 'the offset scan found nothing — the scan itself is broken').toBeGreaterThan(0);
    expect(
      EAST_REACH,
      `${eastFile} reaches WX + ${deepestEast}, past EAST_REACH ${EAST_REACH}. Raising EAST_REACH to 15 puts the ` +
        'probe footprint on the Core column and relocates the shipped board — read the six files\' margins first.',
    ).toBeGreaterThanOrEqual(deepestEast);
    expect(SOUTH_REACH).toBeGreaterThanOrEqual(deepestSouth);
  });
});
