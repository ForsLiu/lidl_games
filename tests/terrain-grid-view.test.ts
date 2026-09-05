/**
 * fb065c — `gridTerrain`, the adapter from a live `Grid` to a dumpable grid.
 *
 * The item's premise: `describeTerrain` exists so "a terrain repro is one
 * string" (fb064k), and until this adapter it could only be taken from
 * `generateTerrain`'s output — never from the `Grid` a bug was seen on, which
 * has been through `terrainOverlay`, `world.ts`'s Warden-spawn clearing,
 * `applyTerrain`'s gate/Core override, `placeCore`, and any post-construction
 * `tile[]` write.
 *
 * What this file pins, in the order the item asks for it:
 *
 *   1. **The gap is real and its shape is recorded.** Over `applyRunTerrain` on
 *      seeds 1..100 the live grid is identical to its own generated map on 84
 *      seeds, differs by a mean of 0.66 tiles, and by 13 on seed 40. The 84 is
 *      as important as the 13: a repro taken from the generator is *usually*
 *      right, which is exactly why the times it is wrong were invisible.
 *   2. **The round trip survives the worst grid we can build** — terrain
 *      applied, the Core moved off `CORE_X/CORE_Y`, and a raw `tile[]` write
 *      after both, which is `world.ts`'s Fourth Gate shape.
 *   3. **Provenance is honest.** Such a grid is no seed's output, so its dump
 *      says `source=-` and carries no seed a reader could paste.
 *   4. **The view is a copy.** A `Grid` rewrites `terrainKind` in place on every
 *      `placeCore`; an aliasing view would silently rewrite a snapshot taken
 *      before it.
 *
 * Numbers here were measured at fb065c against shipped `/data`. A generator or
 * `data/terrain.json` change moves them; re-measure and re-record.
 */

import { describe, expect, it } from 'vitest';

import {
  CORE_H,
  CORE_W,
  CORE_X,
  CORE_Y,
  GATES,
  GRID_W,
  Grid,
  TileType,
} from '../src/sim/grid';
import {
  describeTerrain,
  generateTerrain,
  gridTerrain,
  legalCoreAnchors,
  loadTerrain,
  parseTerrainDump,
  suggestCoreAnchor,
  terrainOverlay,
  TerrainKind,
} from '../src/sim/terrain';
import { applyRunTerrain, wardenSpawnTile } from '../src/sim/world';

const cfg = loadTerrain();

/** A Grid carrying a generated map, the way `tests/terrain-grid.test.ts` builds one. */
function applied(seed: number): Grid {
  const g = new Grid();
  g.applyTerrain(terrainOverlay(generateTerrain(seed, cfg), cfg));
  g.refresh();
  return g;
}

describe('gridTerrain (fb065c)', () => {
  it('records how far a live run\'s grid drifts from its own generated map', () => {
    // The measurement that justifies the adapter existing. `applyRunTerrain` is
    // the real path a non-practice run takes (fb077), so this is the drift a
    // bug report actually carries — not a synthetic one.
    let sum = 0;
    let max = 0;
    let maxSeed = 0;
    let identical = 0;
    let fellBack = 0;
    let unexplained = 0;
    const warden = wardenSpawnTile();
    const seeds = 100;
    for (let seed = 1; seed <= seeds; seed++) {
      const g = new Grid();
      if (applyRunTerrain(g, GATES, seed, cfg)) {
        fellBack++;
        continue;
      }
      const view = gridTerrain(g);
      const map = generateTerrain(seed, cfg, GATES);
      let diff = 0;
      for (let i = 0; i < view.kind.length; i++) {
        if (view.kind[i] === map.kind[i]) continue;
        diff++;
        // Every drifted tile is accounted for by a named transformation, so the
        // ledger cannot quietly start measuring something else. `applyRunTerrain`
        // retries at seed+1 when the Core is unreachable, and against a
        // `generateTerrain(seed)` baseline a retry would read as a few hundred
        // tiles of "override drift" with this comment misexplaining it. No seed
        // in 1..100 retries today; this line is what notices when one does.
        const x = i % GRID_W;
        const y = (i / GRID_W) | 0;
        const inGate = GATES.some((gate) => gate.tx === x && gate.ty === y);
        const inCore = x >= CORE_X && x < CORE_X + CORE_W && y >= CORE_Y && y < CORE_Y + CORE_H;
        const inWarden = Math.abs(x - warden.tx) <= 1 && Math.abs(y - warden.ty) <= 1;
        if (!inGate && !inCore && !inWarden) unexplained++;
      }
      sum += diff;
      if (diff === 0) identical++;
      if (diff > max) {
        max = diff;
        maxSeed = seed;
      }
    }
    expect({
      fellBack,
      identical: `${identical}/${seeds}`,
      mean: (sum / seeds).toFixed(2),
      worst: `${max} @${maxSeed}`,
      driftedTiles: sum,
      unexplained,
    }).toEqual({
      fellBack: 0,
      identical: '84/100',
      mean: '0.66',
      worst: '13 @40',
      // 66 tiles across the sample, every one of them inside a spawn gate, the
      // Core footprint or the Warden's 3x3 clearing. Seed 40's worst-case 13 is
      // 9 Warden-block tiles and 4 Core tiles, and no gate tile drifts at all
      // (the generator already writes the three gates as normal).
      driftedTiles: 66,
      unexplained: 0,
    });
  });

  it('is a copy, so a later placeCore cannot rewrite a snapshot taken before it', () => {
    // `Grid.syncTerrain` rebuilds `terrainKind` in place on every `placeCore`,
    // so this is the difference between a snapshot and a live window. The old
    // hand-rolled `gridView` aliased the buffer; nothing depended on that, and
    // a dump is exactly the caller that would have been bitten.
    const g = applied(4426);
    const before = gridTerrain(g);
    const anchors = legalCoreAnchors(gridTerrain(g), cfg);
    const target = suggestCoreAnchor(gridTerrain(g), cfg, anchors);
    expect(target).not.toBeNull();
    const tx = (target as number) % GRID_W;
    const ty = ((target as number) / GRID_W) | 0;
    // A Core move that actually changes terrain: the vacated tiles revert to
    // their real kind (fb064h), so `terrainKind` differs afterwards.
    g.placeCore(tx, ty);
    const after = gridTerrain(g);
    expect(Array.from(after.kind)).not.toEqual(Array.from(before.kind));
    // ...and the snapshot did not move with it.
    const reference = applied(4426);
    expect(Array.from(before.kind)).toEqual(Array.from(gridTerrain(reference).kind));

    // The buffer is not shared with the Grid in the other direction either.
    before.kind[0] = TerrainKind.Rough;
    expect(g.terrainKind[0]).toBe(TerrainKind.Rock);
  });

  it('round-trips a Grid that has had placeCore and a raw tile write applied', () => {
    // The grid the item names, built in the order that makes it hardest: apply
    // terrain, move the Core off `CORE_X/CORE_Y`, then write a tile directly the
    // way `world.ts` opens the Fourth Gate. That last write is the interesting
    // one — it changes `tile[]` without going through `syncTerrain`, so the
    // Grid's *effective* terrain at that tile is whatever the overlay said, and
    // a dump has to describe what is there rather than what the structure map
    // implies.
    const g = applied(7);
    const anchors = legalCoreAnchors(gridTerrain(g), cfg);
    const target = suggestCoreAnchor(gridTerrain(g), cfg, anchors) as number;
    g.placeCore(target % GRID_W, (target / GRID_W) | 0);
    // The Fourth Gate write's *shape*, with its ordering deliberately inverted.
    // `world.ts:576-585` opens the fourth gate **before** `applyRunTerrain`, so
    // in a real run `syncTerrain` covers that tile and `terrainKind` reads
    // normal there. Writing it afterwards is the hostile case — a state
    // `world.ts` never produces today and nothing prevents — and it is the one
    // that shows what `gridTerrain` can and cannot promise.
    const south = { tx: 12, ty: 19 };
    g.tile[g.idx(south.tx, south.ty)] = TileType.Gate;
    g.markDirty();
    g.refresh();

    const view = gridTerrain(g);

    // **What the adapter does not promise, pinned rather than rationalised.**
    // `syncTerrain` is private and `refresh` does not call it, so the write
    // above updated `blocked` and left `terrainKind` alone: the sim now walks
    // through (12,19) while the dump draws rock on it. The view is faithful to
    // the Grid — it reports exactly what `terrainKind` holds — and the Grid is
    // the thing that is stale. Filed as its own item; recorded here so a reader
    // of a dump taken in this state knows which of the two to believe.
    const south_i = g.idx(south.tx, south.ty);
    expect(g.tile[south_i]).toBe(TileType.Gate);
    expect(g.blocked[south_i]).toBe(0);
    expect(view.kind[south_i]).toBe(TerrainKind.Rock);

    const dump = describeTerrain(view, cfg);
    const parsed = parseTerrainDump(dump);
    expect(Array.from(parsed.kind)).toEqual(Array.from(view.kind));
    expect({ w: parsed.w, h: parsed.h }).toEqual({ w: view.w, h: view.h });
    // Byte-identical, not merely equal in tiles: re-describing what came back
    // must produce the same string, which is the property fb064k's format sells.
    expect(describeTerrain(parsed, cfg)).toBe(dump);
  });

  it('dumps such a Grid with honest provenance: source=-, no pasteable seed', () => {
    // fb064s made the seed line say what `requested` is *for*. A Grid's tiles
    // are no seed's output — regenerating from the run's seed gives the map
    // before the overrides, which is the whole reason this adapter exists — so
    // the only honest mark is the dash, and every provenance field dashes with
    // it (the parser refuses a mixed line).
    // Built through `applyRunTerrain`, not `applied`, because the claim below
    // is about the drift the *ledger* measured, and that ledger is of the real
    // run path — `applied` skips the Warden-spawn clearing.
    const g = new Grid();
    expect(applyRunTerrain(g, GATES, 40, cfg)).toBe(false);
    const dump = describeTerrain(gridTerrain(g), cfg);
    const seedLine = dump.split('\n').find((l) => l.startsWith('seed '));
    expect(seedLine).toBe('seed source=- requested=- effective=- attempts=- fallback=- hash=-');
    expect(parseTerrainDump(dump).provenance).toBeNull();

    // And the tiles really are not the generated map's, on this seed: the dash
    // is load-bearing rather than conservative. Seed 40 is the worst drift in
    // the ledger above.
    const map = generateTerrain(40, cfg, GATES);
    let drift = 0;
    for (let i = 0; i < map.kind.length; i++) {
      if (gridTerrain(g).kind[i] !== map.kind[i]) drift++;
    }
    expect(drift).toBe(13);
    // The generated map's own dump, by contrast, still names a seed a reader
    // can paste — so the two artefacts stay distinguishable at a glance.
    expect(describeTerrain(map, cfg).split('\n')[1]).toContain('source=generator');
  });

  it('refuses a Grid whose terrain buffer is the wrong size', () => {
    // A `Grid` cannot reach this state today; the guard is a statement of the
    // contract, and it is the same refusal `terrainOverlay` and
    // `describeTerrain` make for the same reason — a short buffer reads
    // `undefined`, which is neither a kind nor an error.
    const g = applied(1);
    const broken = { ...g, w: g.w, h: g.h, terrainKind: new Uint8Array(4) } as unknown as Grid;
    expect(() => gridTerrain(broken)).toThrow(/terrainKind length 4, expected 36x20/);
  });

  it('agrees tile for tile with reading the Grid directly', () => {
    // The consolidation check: this function replaced a hand-rolled view in
    // `tests/terrain-grid.test.ts`, and the one thing that must not change is
    // *which* of the Grid's two terrain buffers a caller gets. It is the
    // effective one (`terrainKind`, gate and Core footprints punched to normal)
    // — the raw pre-override copy is private and is not what a bug was seen on.
    for (const seed of [1, 9, 137, 4426]) {
      const g = applied(seed);
      const view = gridTerrain(g);
      expect(view.w).toBe(g.w);
      expect(view.h).toBe(g.h);
      expect(Array.from(view.kind)).toEqual(Array.from(g.terrainKind));
      // The override is visible in the view, which is the point of taking the
      // effective buffer: every gate and Core tile reads normal.
      for (const gate of GATES) expect(view.kind[gate.ty * view.w + gate.tx]).toBe(TerrainKind.Normal);
      for (let dy = 0; dy < CORE_H; dy++) {
        for (let dx = 0; dx < CORE_W; dx++) {
          expect(view.kind[(CORE_Y + dy) * view.w + (CORE_X + dx)]).toBe(TerrainKind.Normal);
        }
      }
    }
  });
});
