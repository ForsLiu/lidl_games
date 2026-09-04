/**
 * fb064q — the character/terrain passage rule, made an artifact (SPEC-FINAL
 * §10.5).
 *
 * The owner's rock clause carries an open veto:
 *   "rock/wall: NOT walkable, NOT buildable (blocks enemies and pathing; the
 *    character still passes per fb002's pass-through rule [designer note:
 *    character flies over; veto if rocks should block the character])"
 *
 * Until this item the lane shipped no artifact for it: no predicate stated the
 * rule, no test pinned it, and — the part that matters — **the shipped code
 * already answered the veto in the affirmative without saying so.** fb064b
 * routed `Grid.wardenPassable` through `terrainBlock`, so rock and high ground
 * stop the Warden today. The item's own acceptance says the flag should read
 * "false on every authored kind, matching today's pass-through"; that premise
 * is true only of a live run (nothing calls `applyTerrain` yet, so every Grid
 * is born flat) and false of the rule the grid will apply the instant terrain
 * is wired. See BACKLOG-TERRAIN.md's Log for the amendment.
 *
 * So this file pins three things:
 *   - the flag is *data* and it is *live*: `Grid.wardenPassable` reads it, so
 *     flipping one line of `data/terrain.json` flips the rule and nothing else;
 *   - today's shipped behaviour is unchanged by the refactor (rock and high
 *     still stop the Warden, byte-for-byte over generated maps);
 *   - the loader refuses the one setting that is provably unpayable — a
 *     `normal` tile that blocks the character leaves it nowhere to stand.
 */

import { describe, expect, it } from 'vitest';

import terrainRaw from '../data/terrain.json';
import { CORE_X, CORE_Y, GATES, GRID_H, GRID_W, Grid } from '../src/sim/grid';
import {
  blocksCharacter,
  canCharacterEnter,
  canCharacterEnterKind,
  generateTerrain,
  loadTerrain,
  parseTerrain,
  terrainOverlay,
  TerrainKind,
  TERRAIN_KEYS,
} from '../src/sim/terrain';

const cfg = loadTerrain();

/** The authored answer per kind — the table the veto edits. */
const AUTHORED: ReadonlyArray<{ kind: TerrainKind; key: string; blocks: boolean }> = [
  { kind: TerrainKind.Normal, key: 'normal', blocks: false },
  { kind: TerrainKind.Rough, key: 'rough', blocks: false },
  { kind: TerrainKind.Rock, key: 'rock', blocks: true },
  { kind: TerrainKind.High, key: 'high', blocks: true },
];

/** Any interior tile the character and the Warden both agree is open. */
function openInterior(g: Grid): { tx: number; ty: number } {
  for (let ty = 1; ty < GRID_H - 1; ty++) {
    for (let tx = 1; tx < GRID_W - 1; tx++) {
      if (g.wardenPassable(tx, ty) && g.terrainKind[ty * GRID_W + tx] === TerrainKind.Normal) {
        return { tx, ty };
      }
    }
  }
  throw new Error('no open interior tile');
}

function clone(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(terrainRaw)) as Record<string, unknown>;
}

function tilesOf(doc: Record<string, unknown>): Array<Record<string, unknown>> {
  return doc.tiles as Array<Record<string, unknown>>;
}

describe('fb064q character passage: the data flag', () => {
  it('every authored kind carries an explicit blocksCharacter', () => {
    for (const t of AUTHORED) {
      expect(cfg.tiles[t.kind].key).toBe(t.key);
      expect(cfg.tiles[t.kind].blocksCharacter).toBe(t.blocks);
    }
    expect(cfg.tiles.length).toBe(TERRAIN_KEYS.length);
  });

  it('the loader refuses a tile with no blocksCharacter — the rule is never implicit', () => {
    const doc = clone();
    delete tilesOf(doc)[TerrainKind.Rock].blocksCharacter;
    expect(() => parseTerrain(doc)).toThrow();
  });

  it('the loader refuses a normal tile that blocks the character (unpayable)', () => {
    const doc = clone();
    tilesOf(doc)[TerrainKind.Normal].blocksCharacter = true;
    expect(() => parseTerrain(doc)).toThrow(/normal/);
  });

  it('the veto is one data line: rock may be flipped either way and still load', () => {
    for (const value of [true, false]) {
      const doc = clone();
      tilesOf(doc)[TerrainKind.Rock].blocksCharacter = value;
      const parsed = parseTerrain(doc);
      expect(parsed.tiles[TerrainKind.Rock].blocksCharacter).toBe(value);
      expect(blocksCharacter(parsed, TerrainKind.Rock)).toBe(value);
    }
  });
});

describe('fb064q character passage: the predicates', () => {
  it('blocksCharacter answers the authored table per kind', () => {
    for (const t of AUTHORED) expect(blocksCharacter(cfg, t.kind)).toBe(t.blocks);
  });

  it('canCharacterEnterKind is its negation per kind', () => {
    for (const t of AUTHORED) expect(canCharacterEnterKind(cfg, t.kind)).toBe(!t.blocks);
  });

  it('an unknown kind reads as passable, never as a phantom wall', () => {
    // Same convention as `canAttackStructureAt`: the safe direction is to take
    // away nothing. A junk kind inventing a wall would strand the character.
    expect(blocksCharacter(cfg, 99)).toBe(false);
    expect(canCharacterEnterKind(cfg, 99)).toBe(true);
    expect(canCharacterEnterKind(cfg, -1)).toBe(true);
  });

  it('canCharacterEnter reads a board, floors coordinates, and is off-board-safe', () => {
    const map = generateTerrain(1234, cfg);
    for (let ty = 0; ty < map.h; ty++) {
      for (let tx = 0; tx < map.w; tx++) {
        const want = !blocksCharacter(cfg, map.kind[ty * map.w + tx]);
        expect(canCharacterEnter(cfg, map, tx, ty)).toBe(want);
        // A float inside the tile is the same tile (b007's class of bug).
        expect(canCharacterEnter(cfg, map, tx + 0.5, ty + 0.5)).toBe(want);
      }
    }
    for (const [x, y] of [
      [-1, 0],
      [0, -1],
      [map.w, 0],
      [0, map.h],
      [NaN, NaN],
    ]) {
      expect(canCharacterEnter(cfg, map, x, y)).toBe(true);
    }
  });
});

describe('fb064q character passage: the grid honours the flag', () => {
  function applied(seed: number): Grid {
    const g = new Grid();
    g.applyTerrain(terrainOverlay(generateTerrain(seed, cfg), cfg));
    return g;
  }

  it('wardenPassable matches the flag on every tile of 20 generated maps', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const map = generateTerrain(seed, cfg);
      const g = applied(seed);
      for (let ty = 1; ty < GRID_H - 1; ty++) {
        for (let tx = 1; tx < GRID_W - 1; tx++) {
          const i = ty * GRID_W + tx;
          // Structural tiles (Core, gates) override terrain in `syncTerrain`,
          // so compare only where terrain is what decides.
          if (g.terrainKind[i] !== map.kind[i]) {
            // The overridden tiles are not "not our problem" — they are where
            // the two rules can silently disagree, so pin them too: a gate or
            // Core tile is ground the run carved and the character always has
            // it, whatever the scatter painted (see the Fourth Gate case in
            // `tests/terrain-grid.test.ts`).
            expect(g.wardenPassable(tx, ty)).toBe(true);
            continue;
          }
          expect(g.wardenPassable(tx, ty)).toBe(!blocksCharacter(cfg, map.kind[i]));
          // The map-side predicate answers the same question about the same
          // tile. It may only differ where the Grid knows something the map
          // does not — the structural override above, and off the board.
          expect(canCharacterEnter(cfg, map, tx, ty)).toBe(g.wardenPassable(tx, ty));
        }
      }
    }
  });

  it('canCharacterEnter and wardenPassable disagree only where documented', () => {
    const map = generateTerrain(7, cfg);
    const g = applied(7);
    const divergent: string[] = [];
    for (let ty = 0; ty < GRID_H; ty++) {
      for (let tx = 0; tx < GRID_W; tx++) {
        if (canCharacterEnter(cfg, map, tx, ty) !== g.wardenPassable(tx, ty)) {
          divergent.push(`${tx},${ty}`);
        }
      }
    }
    // Every divergence is a border tile (the map says rock, the Grid says "not
    // a place") or a structural one the Grid overrode.
    for (const key of divergent) {
      const [tx, ty] = key.split(',').map(Number);
      const border = tx === 0 || ty === 0 || tx === GRID_W - 1 || ty === GRID_H - 1;
      const structural = g.terrainKind[ty * GRID_W + tx] !== map.kind[ty * GRID_W + tx];
      expect(border || structural).toBe(true);
    }
    // Off the board the two are opposite by design, and so is a non-integer
    // coordinate (fb064u): this predicate floors it, the Grid one refuses it,
    // because the Grid indexes `tile` with the raw value and this does not.
    // The sweep above is integer-only, so without these the third divergence
    // the doc block names would be unpinned.
    expect(canCharacterEnter(cfg, map, -1, -1)).toBe(true);
    expect(g.wardenPassable(-1, -1)).toBe(false);
    const openTile = openInterior(g);
    expect(canCharacterEnter(cfg, map, openTile.tx + 0.5, openTile.ty + 0.5)).toBe(true);
    expect(g.wardenPassable(openTile.tx, openTile.ty)).toBe(true);
    expect(g.wardenPassable(openTile.tx + 0.5, openTile.ty + 0.5)).toBe(false);
  });

  it('flipping rock to passable lets the Warden stand on rock and nothing else moves', () => {
    const seed = 4242;
    const doc = clone();
    tilesOf(doc)[TerrainKind.Rock].blocksCharacter = false;
    const vetoed = parseTerrain(doc);
    // Same tiles: `blocksCharacter` is not a generator input.
    const base = generateTerrain(seed, cfg);
    const alt = generateTerrain(seed, vetoed);
    expect(alt.hash).toBe(base.hash);

    const gBase = new Grid();
    gBase.applyTerrain(terrainOverlay(base, cfg));
    const gAlt = new Grid();
    gAlt.applyTerrain(terrainOverlay(alt, vetoed));

    let rocks = 0;
    let highs = 0;
    for (let ty = 1; ty < GRID_H - 1; ty++) {
      for (let tx = 1; tx < GRID_W - 1; tx++) {
        const i = ty * GRID_W + tx;
        if (gBase.terrainKind[i] !== base.kind[i]) continue;
        const k = base.kind[i];
        if (k === TerrainKind.Rock) {
          rocks++;
          expect(gBase.wardenPassable(tx, ty)).toBe(false);
          expect(gAlt.wardenPassable(tx, ty)).toBe(true);
        } else if (k === TerrainKind.High) {
          highs++;
          expect(gAlt.wardenPassable(tx, ty)).toBe(false);
        }
        // Enemy pathing is untouched by the character rule, on every tile.
        expect(gAlt.blocked[i]).toBe(gBase.blocked[i]);
        expect(gAlt.passable(tx, ty)).toBe(gBase.passable(tx, ty));
        expect(gAlt.buildable(tx, ty)).toBe(gBase.buildable(tx, ty));
      }
    }
    expect(rocks).toBeGreaterThan(0);
    expect(highs).toBeGreaterThan(0);
  });

  it('a flat Grid still lets the Warden anywhere but the border', () => {
    const g = new Grid();
    expect(g.wardenPassable(CORE_X, CORE_Y)).toBe(true);
    expect(g.wardenPassable(GATES[0].tx, GATES[0].ty)).toBe(true);
    expect(g.wardenPassable(0, 0)).toBe(false);
    expect(g.wardenPassable(GRID_W - 1, 5)).toBe(false);
  });
});
