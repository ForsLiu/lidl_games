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
 * **`tests/class-kit-whiff.test.ts` is a named exception, not an oversight.**
 * It is the seventh file with `WX/WY = 10,10`, and c014 did not list it. It
 * cannot be converted from this lane: its Ice Wall row exists to state the
 * same policy as `tests/p6d-nine-classes.test.ts` and pins the agreement with
 * `expect([AX, AY]).toEqual([12, 10])` against p6d's own hardcoded aim point.
 * De-hardcoding one side alone would silently break the agreement the row is
 * for; p6d is out of this lane's Scope. Logged for the main lane, and asserted
 * below so the exception cannot quietly become six-plus-one-forgotten.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';
import { CORE_H, CORE_W, CORE_X, CORE_Y, GRID_H, GRID_W } from '../src/sim/grid';
import { checkBuild } from '../src/sim/towers';
import { World } from '../src/sim/world';
import {
  BOARD,
  BUILD_TX,
  BUILD_TY,
  EAST_REACH,
  PROBE_ORIGIN,
  SOUTH_REACH,
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
  // c007's file. Its Ice Wall row exists to state the same whiff policy as
  // `tests/p6d-nine-classes.test.ts` and pins the agreement with
  // `expect([AX, AY]).toEqual([12, 10])` against p6d's own hardcoded aim
  // point. De-hardcoding this side alone would leave the two files agreeing
  // about nothing, and p6d is outside this lane's Scope, so the pair moves
  // together from the main lane or not at all. Asserted below, not trusted.
  'class-kit-whiff': 'its aim point is an agreement with the out-of-Scope tests/p6d-nine-classes.test.ts',
};

/** Every file the rule applies to: the sweep minus the named exceptions. */
const IMPORTERS = CLASS_TESTS.filter((f) => !(f in EXCEPTIONS));

function source(name: string): string {
  return readFileSync(join(__dirname, `${name}.test.ts`), 'utf8');
}

/** Strips comments, so prose *about* a pin never counts as one. */
function code(name: string): string {
  return source(name)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
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
  const name = /(^|[^A-Za-z0-9_$.])(buildTower|place|tower)\s*\(/g;
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

function footprintTiles(b: Board): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let ty = b.WY - 1; ty <= b.WY + SOUTH_REACH; ty++) {
    for (let tx = b.WX - 1; tx <= b.WX + EAST_REACH; tx++) out.push([tx, ty]);
  }
  return out;
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
      'the probed board moved off the spot the six files were calibrated from. This is a deliberate ' +
        'baseline, not a hardcode: re-read those files\' windows and margins (Core distance, board edges, ' +
        'chain-line room) before updating this row to the new answer.',
    ).toEqual({ WX: 10, WY: 10, BUILD_TX: 11, BUILD_TY: 10 });
    expect(BOARD).toEqual({ WX, WY, BUILD_TX, BUILD_TY });
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
});

describe('c014: a shifted probe origin moves the whole board', () => {
  /**
   * Four origins, none of which can be served by the shipped answer: two whose
   * own footprint runs into the Core or the border, one in the far corner. The
   * scan has to walk in every case, which is exactly what the terrain epic will
   * make it do at `10,10`.
   */
  const SHIFTED = [
    { tx: 1, ty: 1 },
    { tx: 15, ty: 6 },
    { tx: 30, ty: 15 },
    { tx: 22, ty: 3 },
  ] as const;

  for (const origin of SHIFTED) {
    it(`origin ${origin.tx},${origin.ty}: still a legal board, and not the shipped one`, () => {
      const b = probeBoard(origin);
      expect(b, 'the scan handed back the shipped board for a shifted origin').not.toEqual(BOARD);
      expect(buildsFrom(b), `probed board at origin ${origin.tx},${origin.ty} is not buildable`).toBeNull();
      expect([b.BUILD_TX - b.WX, b.BUILD_TY - b.WY]).toEqual([1, 0]);
      for (const [tx, ty] of footprintTiles(b)) {
        expect(tx > 0 && tx < GRID_W - 1 && ty > 0 && ty < GRID_H - 1).toBe(true);
      }
    });
  }

  it('the origin is the first candidate, so the scan is a fallback and not a search', () => {
    // Re-probing from the shipped board's own answer must return it unchanged.
    // This is what makes the shipped baseline stable: the scan only moves when
    // the origin genuinely stops working.
    expect(probeBoard({ tx: WX, ty: WY })).toEqual(BOARD);
    expect(PROBE_ORIGIN).toEqual({ tx: WX, ty: WY });
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
      if (parks && builds) {
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
            const want = axis === 'x' ? ['WX', 'spot.tx + 0.5'] : ['WY', 'spot.ty + 0.5'];
            expect(want, `${name}: w.warden.${axis} = ${value} — park on the shared spot, not a private one`).toContain(
              value,
            );
          }
        });
      }

      if (builds) {
        it('builds only on the shared tile — every build call ends in BUILD_TX, BUILD_TY', () => {
          const tiles = [...new Set(buildCallTiles(src))];
          // `tx, ty` is a helper forwarding its own parameters (`place(w, key,
          // tx, ty)`), which is where the shared tile arrives from — the
          // caller is what this rule reads.
          const bad = tiles.filter(
            (t) => !/^(BUILD_TX, BUILD_TY|spot\.tx, spot\.ty|tx, ty|far!?\.tx, far!?\.ty)$/.test(t),
          );
          expect(bad, `${name}: build calls on a tile that is not the shared one`).toEqual([]);
        });

        it('imports the shared build tile', () => {
          expect(source(name)).toMatch(/import \{[^}]*\bBUILD_TX\b[^}]*\} from '\.\/class-board';/);
        });
      }
    });
  }

  it('class-kit-whiff is the one convertible file left pinned, and p6d is why', () => {
    const s = source('class-kit-whiff');
    expect(s, 'class-kit-whiff was converted — drop its EXCEPTIONS row').toMatch(/^const WX = 10;$/m);
    // The reason, asserted rather than described: its aim point is an
    // agreement with `p6d-nine-classes`, which is out of this lane's Scope.
    expect(s).toMatch(/expect\(\[AX, AY\]\)\.toEqual\(\[12, 10\]\)/);
    const p6d = readFileSync(join(__dirname, 'p6d-nine-classes.test.ts'), 'utf8');
    expect(p6d, 'p6d no longer pins that aim point — the exception can be lifted').toMatch(/\b12,\s*10\b/);
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
