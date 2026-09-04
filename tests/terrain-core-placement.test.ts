/**
 * fb064h — the terrain half of the owner's Core-placement flow
 * (SPEC-FINAL §10.5): `validateCorePlacement`, `suggestCoreAnchor`, and
 * `Grid.placeCore`.
 *
 * What this pins, and why each one is here rather than assumed:
 *   - the validator and `legalCoreAnchors` agree *tile for tile*. They are two
 *     expressions of one rule — an enumeration and a predicate — and the way
 *     that fails in a shipped game is a click refused on a tile the map's
 *     `coreLegalFrac` band already counted;
 *   - a legal anchor is legal *in the sim*, not only in the analyzer. The bands
 *     are measured 4-connected on a `TerrainMap` that has never heard of the
 *     Core; the game walks an 8-connected no-corner-cutting field to the Core's
 *     own tiles. "Reachable from every gate" has to survive that translation;
 *   - moving the Core hands back the ground it was standing on. `applyTerrain`
 *     forces the Core footprint to normal, so a Core sitting on rock is a
 *     two-tile bridge; if `placeCore` left that bridge behind, the map the sim
 *     walks would stop being the map the analyzer measured.
 */

import { describe, expect, it } from 'vitest';

import {
  CORE_H,
  CORE_W,
  CORE_X,
  CORE_Y,
  coreCenter,
  GATES,
  GRID_H,
  GRID_W,
  Grid,
  TileType,
} from '../src/sim/grid';
import {
  gateComponent,
  gateDistance,
  generateTerrain,
  legalCoreAnchors,
  loadTerrain,
  suggestCoreAnchor,
  terrainOverlay,
  TerrainKind,
  validateCorePlacement,
} from '../src/sim/terrain';
import type { TerrainGrid } from '../src/sim/terrain/types';

const cfg = loadTerrain();
const SEEDS = 100;

function applied(map: TerrainGrid): Grid {
  const g = new Grid();
  g.applyTerrain(terrainOverlay(map, cfg));
  g.refresh();
  return g;
}

/** A rock-bordered all-normal map, the fixture the hand-built cases start from. */
function flatMap(): TerrainGrid {
  const kind = new Uint8Array(GRID_W * GRID_H).fill(TerrainKind.Normal);
  for (let x = 0; x < GRID_W; x++) {
    kind[x] = TerrainKind.Rock;
    kind[(GRID_H - 1) * GRID_W + x] = TerrainKind.Rock;
  }
  for (let y = 0; y < GRID_H; y++) {
    kind[y * GRID_W] = TerrainKind.Rock;
    kind[y * GRID_W + GRID_W - 1] = TerrainKind.Rock;
  }
  for (const g of GATES) kind[g.ty * GRID_W + g.tx] = TerrainKind.Normal;
  return { w: GRID_W, h: GRID_H, kind };
}

describe('validateCorePlacement (fb064h)', () => {
  it(`accepts a tile iff legalCoreAnchors lists it, over ${SEEDS} seeds`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const map = generateTerrain(seed, cfg);
      const reach = gateComponent(map, cfg);
      const legal = new Set(legalCoreAnchors(map, cfg, reach));
      for (let ty = 0; ty < GRID_H; ty++) {
        for (let tx = 0; tx < GRID_W; tx++) {
          const got = validateCorePlacement(map, cfg, tx, ty, reach);
          const want = legal.has(ty * GRID_W + tx);
          if (got.ok !== want) {
            throw new Error(
              `seed ${seed} tile (${tx},${ty}): validator says ${got.ok}, legalCoreAnchors says ${want}`,
            );
          }
          if (got.ok) expect(got.anchor).toBe(ty * GRID_W + tx);
        }
      }
    }
  });

  it('names the rule that was broken, not just "no"', () => {
    const map = flatMap();
    const reach = gateComponent(map, cfg);

    // Off-grid: fractional, negative, and a footprint hanging off the edge.
    expect(validateCorePlacement(map, cfg, 5.5, 5, reach)).toEqual({
      ok: false,
      reason: 'off-grid',
    });
    expect(validateCorePlacement(map, cfg, -1, 5, reach)).toEqual({ ok: false, reason: 'off-grid' });
    expect(validateCorePlacement(map, cfg, GRID_W - 1, 5, reach)).toEqual({
      ok: false,
      reason: 'off-grid',
    });
    expect(validateCorePlacement(map, cfg, 5, GRID_H - 1, reach)).toEqual({
      ok: false,
      reason: 'off-grid',
    });

    // Not normal: the rock border is the simplest case, and a hand-placed tile
    // covers the three non-normal kinds under an otherwise legal anchor.
    expect(validateCorePlacement(map, cfg, 0, 5, reach)).toEqual({
      ok: false,
      reason: 'not-normal',
    });
    for (const kind of [TerrainKind.Rough, TerrainKind.Rock, TerrainKind.High]) {
      const patched = flatMap();
      patched.kind[(CORE_Y + 1) * GRID_W + (CORE_X + 1)] = kind;
      const r = gateComponent(patched, cfg);
      expect(validateCorePlacement(patched, cfg, CORE_X, CORE_Y, r)).toEqual({
        ok: false,
        reason: 'not-normal',
      });
    }

    // Near a gate: one tile outside the clearance ring is legal, one inside is
    // not, so this pins the boundary rather than "somewhere near the gate".
    const gate = GATES[1];
    expect(gateDistance(gate.tx, gate.ty + cfg.coreGateClearance)).toBe(cfg.coreGateClearance);
    expect(validateCorePlacement(map, cfg, gate.tx, gate.ty + cfg.coreGateClearance, reach)).toEqual(
      { ok: false, reason: 'near-gate' },
    );
    expect(
      validateCorePlacement(map, cfg, gate.tx, gate.ty + cfg.coreGateClearance + 1, reach).ok,
    ).toBe(true);

    // Unreachable: normal ground, clear of the gates, walled off from them.
    const walled = flatMap();
    for (let y = 1; y < GRID_H - 1; y++) walled.kind[y * GRID_W + (GRID_W - 4)] = TerrainKind.Rock;
    const wr = gateComponent(walled, cfg);
    expect(walled.kind[10 * GRID_W + (GRID_W - 3)]).toBe(TerrainKind.Normal);
    expect(validateCorePlacement(walled, cfg, GRID_W - 3, 10, wr)).toEqual({
      ok: false,
      reason: 'unreachable',
    });
  });

  it('reports the first rule broken, whichever corner of the 2x2 breaks it', () => {
    // A footprint whose top-left tile is fine and whose bottom-right is rock
    // must report the same reason as one broken at the top-left: the message a
    // player sees cannot depend on which corner the fault sits under.
    const a = flatMap();
    a.kind[6 * GRID_W + 6] = TerrainKind.Rock;
    const b = flatMap();
    b.kind[7 * GRID_W + 7] = TerrainKind.Rock;
    const ra = validateCorePlacement(a, cfg, 6, 6);
    const rb = validateCorePlacement(b, cfg, 6, 6);
    expect(ra).toEqual({ ok: false, reason: 'not-normal' });
    expect(rb).toEqual({ ok: false, reason: 'not-normal' });
  });

  it('computes its own reachability when the caller does not hand one in', () => {
    const map = generateTerrain(7, cfg);
    const anchors = legalCoreAnchors(map, cfg);
    expect(anchors.length).toBeGreaterThan(0);
    const anchor = anchors[0];
    expect(validateCorePlacement(map, cfg, anchor % GRID_W, (anchor / GRID_W) | 0).ok).toBe(true);
  });

  it('the reachability it computes is the intersection mask, not "anywhere"', () => {
    // The positive case above holds for any mask that is 1 on a legal anchor,
    // including a mask of all 1s — i.e. for a build with the unreachable rule
    // switched off entirely. This is the negative half: the same walled pocket
    // the explicit-mask test uses, with no mask handed in.
    const walled = flatMap();
    for (let y = 1; y < GRID_H - 1; y++) walled.kind[y * GRID_W + (GRID_W - 4)] = TerrainKind.Rock;
    expect(validateCorePlacement(walled, cfg, GRID_W - 3, 10)).toEqual({
      ok: false,
      reason: 'unreachable',
    });
  });

  it('refuses a reach mask of the wrong size instead of answering from it', () => {
    // A short mask reads `undefined` — falsy — at every index, so an unguarded
    // validator answers `unreachable` for the whole board while looking healthy.
    const map = generateTerrain(5, cfg);
    expect(() => validateCorePlacement(map, cfg, 7, 1, new Uint8Array(4))).toThrow(/reach mask/);
    expect(() => validateCorePlacement(map, cfg, 7, 1, new Uint8Array(GRID_W * GRID_H))).not.toThrow();
  });

  it('reports the first rule in precedence order when a tile breaks two at once', () => {
    // A tile that is both non-normal and inside the clearance ring must answer
    // `not-normal`: "that is a mountain" is the actionable half. Every other
    // fixture in this file breaks exactly one rule, so without this the
    // documented precedence holds by accident — swapping the two loops passes.
    const gate = GATES[1];
    const map = flatMap();
    const tx = gate.tx;
    const ty = gate.ty + 1;
    expect(gateDistance(tx, ty)).toBeLessThanOrEqual(cfg.coreGateClearance);
    map.kind[ty * GRID_W + tx] = TerrainKind.Rock;
    expect(validateCorePlacement(map, cfg, tx, ty)).toEqual({ ok: false, reason: 'not-normal' });
  });

  it('accepts the last in-bounds anchor, not just rejecting the first out-of-bounds one', () => {
    // Every other bounds assertion tests the reject direction, so `>` -> `>=`
    // survives. No generated map has an anchor at the far edge (the border is
    // always rock), so the accept side needs a borderless fixture.
    const open: TerrainGrid = {
      w: GRID_W,
      h: GRID_H,
      kind: new Uint8Array(GRID_W * GRID_H).fill(TerrainKind.Normal),
    };
    const all = new Uint8Array(GRID_W * GRID_H).fill(1);
    // The far corner itself is inside the east gate's clearance ring, which
    // would answer `near-gate` and pin nothing about the bounds — so each axis
    // is pinned at its own extreme, on a row and a column clear of every gate.
    expect(validateCorePlacement(open, cfg, GRID_W - CORE_W, 2, all).ok).toBe(true);
    expect(validateCorePlacement(open, cfg, 2, GRID_H - CORE_H, all).ok).toBe(true);
    expect(validateCorePlacement(open, cfg, GRID_W - CORE_W + 1, 2, all)).toEqual({
      ok: false,
      reason: 'off-grid',
    });
    expect(validateCorePlacement(open, cfg, 2, GRID_H - CORE_H + 1, all)).toEqual({
      ok: false,
      reason: 'off-grid',
    });
  });
});

describe('suggestCoreAnchor (fb064h)', () => {
  it(`suggests a legal anchor on every one of ${SEEDS} seeds`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const map = generateTerrain(seed, cfg);
      const anchors = legalCoreAnchors(map, cfg);
      const pick = suggestCoreAnchor(map, cfg, anchors);
      expect(pick, `seed ${seed}`).not.toBeNull();
      expect(anchors, `seed ${seed}`).toContain(pick);
    }
  });

  it('is deterministic — the same seed always suggests the same tile', () => {
    for (const seed of [3, 41, 97]) {
      const a = suggestCoreAnchor(generateTerrain(seed, cfg), cfg);
      const b = suggestCoreAnchor(generateTerrain(seed, cfg), cfg);
      expect(b).toBe(a);
    }
  });

  it('keeps the tuned default when the terrain leaves it legal', () => {
    const map = flatMap();
    expect(suggestCoreAnchor(map, cfg)).toBe(CORE_Y * GRID_W + CORE_X);
  });

  it('falls back to the nearest legal anchor when the default is buried', () => {
    const map = flatMap();
    // Bury the default footprint and the ring of anchors that overlap it, so
    // the nearest legal anchor is a known distance away rather than adjacent.
    for (let y = CORE_Y - 1; y <= CORE_Y + CORE_H; y++) {
      for (let x = CORE_X - 1; x <= CORE_X + CORE_W; x++) {
        map.kind[y * GRID_W + x] = TerrainKind.Rock;
      }
    }
    const pick = suggestCoreAnchor(map, cfg);
    expect(pick).not.toBeNull();
    const anchors = legalCoreAnchors(map, cfg);
    expect(anchors).toContain(pick);
    const dist = (a: number): number =>
      ((a % GRID_W) - CORE_X) ** 2 + (((a / GRID_W) | 0) - CORE_Y) ** 2;
    expect(dist(pick as number)).toBe(Math.min(...anchors.map(dist)));
  });

  it('returns null rather than an illegal tile when nothing is legal', () => {
    expect(suggestCoreAnchor(flatMap(), cfg, [])).toBeNull();
  });

  it('is pinned to a golden anchor per seed, tie-break and all', () => {
    // The suggestion is the tile most runs will actually be played on, which
    // the module's own doc argues is a balance decision. Nothing else pins its
    // *value*: "is a legal anchor" and "is nearest" are both satisfied by four
    // separate mutations of the tie-break, each of which relocates the Core on
    // 1-3% of seeds. This is the lane's fb064a lesson applied — a generator
    // whose output nothing pins forks silently on any code change.
    //
    // Chosen so the table is load-bearing in both directions: on 24/40/127 the
    // build-room key overrides the lowest-index tie (dropping it, inverting it,
    // or changing ROOM_RADIUS all go red), while on 58/173 the lowest index
    // wins and the strict `<` / `>` comparisons are what keep it (relaxing
    // either to `<=` / `>=` goes red).
    const golden: ReadonlyArray<readonly [number, number]> = [
      [3, 349],
      [24, 385],
      [40, 421],
      [58, 348],
      [97, 419],
      [127, 348],
      [173, 424],
    ];
    for (const [seed, want] of golden) {
      expect(suggestCoreAnchor(generateTerrain(seed, cfg), cfg), `seed ${seed}`).toBe(want);
    }
  });

  it('breaks a distance tie toward the anchor with more build room', () => {
    // The golden table above pins the rule on real seeds; this pins the rule
    // itself, on a fixture where the two candidates are equidistant by
    // construction and differ only in the normal ground around them.
    const rock = (): TerrainGrid => ({
      w: GRID_W,
      h: GRID_H,
      kind: new Uint8Array(GRID_W * GRID_H).fill(TerrainKind.Rock),
    });
    const carve = (m: TerrainGrid, tx: number, ty: number, w: number, h: number): void => {
      for (let y = ty; y < ty + h; y++) {
        for (let x = tx; x < tx + w; x++) m.kind[y * GRID_W + x] = TerrainKind.Normal;
      }
    };
    const ax = CORE_X - 6;
    const bx = CORE_X + 6;
    const anchorA = CORE_Y * GRID_W + ax;
    const anchorB = CORE_Y * GRID_W + bx;

    // Equal distance, equal room: the lower index wins.
    const even = rock();
    carve(even, ax, CORE_Y, CORE_W, CORE_H);
    carve(even, bx, CORE_Y, CORE_W, CORE_H);
    expect(suggestCoreAnchor(even, cfg, [anchorA, anchorB])).toBe(anchorA);

    // Same two anchors, more normal ground around B: B wins despite the order.
    const lopsided = rock();
    carve(lopsided, ax, CORE_Y, CORE_W, CORE_H);
    carve(lopsided, bx - 1, CORE_Y - 1, CORE_W + 2, CORE_H + 2);
    expect(suggestCoreAnchor(lopsided, cfg, [anchorA, anchorB])).toBe(anchorB);
  });

  it('does not hand back an illegal tile from a caller-supplied anchor list', () => {
    // The pre-highlight is a legal anchor by contract. A caller passing a
    // stale or filtered list used to get its garbage straight back out and
    // into a placement Command.
    const map = flatMap();
    expect(suggestCoreAnchor(map, cfg, [0])).toBeNull(); // rock border tile
    expect(suggestCoreAnchor(map, cfg, [-5])).toBeNull();
    expect(suggestCoreAnchor(map, cfg, [999999])).toBeNull();
    expect(suggestCoreAnchor(map, cfg, [NaN])).toBeNull();
    expect(suggestCoreAnchor(map, cfg, [GRID_W - 1])).toBeNull(); // footprint leaves the grid
    // ...and a legal one in the same list still wins.
    expect(suggestCoreAnchor(map, cfg, [0, CORE_Y * GRID_W + CORE_X])).toBe(
      CORE_Y * GRID_W + CORE_X,
    );
  });
});

describe('Grid.placeCore (fb064h)', () => {
  it('moves the Core tiles and the flow field with them', () => {
    const g = new Grid();
    expect(g.coreOrigin()).toEqual({ tx: CORE_X, ty: CORE_Y });
    g.placeCore(8, 6);
    g.refresh();
    expect(g.coreOrigin()).toEqual({ tx: 8, ty: 6 });
    for (let dy = 0; dy < CORE_H; dy++) {
      for (let dx = 0; dx < CORE_W; dx++) {
        expect(g.tile[g.idx(8 + dx, 6 + dy)]).toBe(TileType.Core);
        expect(g.tile[g.idx(CORE_X + dx, CORE_Y + dy)]).toBe(TileType.Open);
      }
    }
    // The field's zero is the new Core, not the old one.
    expect(g.distAt(8, 6)).toBe(0);
    expect(g.distAt(CORE_X, CORE_Y)).toBeGreaterThan(0);
    for (const gate of GATES) {
      const path = g.gatePath(gate);
      const last = path[path.length - 1];
      expect(g.tile[g.idx(last.tx, last.ty)]).toBe(TileType.Core);
    }
  });

  it('refuses off-grid, fractional, border and gate targets', () => {
    const g = new Grid();
    expect(() => g.placeCore(5.5, 6)).toThrow(/integer tile/);
    expect(() => g.placeCore(-1, 6)).toThrow(/leaves the grid/);
    expect(() => g.placeCore(GRID_W - 1, 6)).toThrow(/leaves the grid/);
    expect(() => g.placeCore(6, GRID_H - 1)).toThrow(/leaves the grid/);
    // The last footprint that *fits* is refused for what it lands on, not for
    // where it ends: without this the bounds check can be off by one at the far
    // edge and every assertion above still passes, since both mistakes throw.
    expect(() => g.placeCore(GRID_W - CORE_W, 6)).toThrow(/map border/);
    expect(() => g.placeCore(6, GRID_H - CORE_H)).toThrow(/map border/);
    expect(() => g.placeCore(0, 6)).toThrow(/map border/);
    // Every real gate is *on* the border, so a 2x2 over one also covers a
    // Border tile: with a shared message this assertion could not tell gate
    // refusal from border refusal, and a build that accepted gate tiles
    // outright still passed it. The two messages are distinct for that reason,
    // and the gate rule is pinned on an interior gate as well — which is not
    // hypothetical, since `world.ts`'s Fourth Gate modifier writes a gate tile
    // into `grid.tile` at run construction.
    expect(() => g.placeCore(GATES[1].tx, GATES[1].ty)).toThrow(/spawn gate|map border/);
    const h = new Grid();
    h.tile[h.idx(10, 10)] = TileType.Gate;
    expect(() => h.placeCore(9, 9)).toThrow(/spawn gate/);
    expect(h.coreOrigin()).toEqual({ tx: CORE_X, ty: CORE_Y });
    // Nothing moved.
    expect(g.coreOrigin()).toEqual({ tx: CORE_X, ty: CORE_Y });
  });

  it('refuses to punch the Core into a mountain', () => {
    // The vacate side of the phantom-corridor rule is pinned below; this is the
    // arrive side. The structural override forces the footprint to normal, so a
    // Core placed on rock or high ground is 2x2 of walkable ground inside
    // terrain the analyzer measured as solid.
    for (const kind of [TerrainKind.Rock, TerrainKind.High, TerrainKind.Rough]) {
      const map = flatMap();
      map.kind[6 * GRID_W + 8] = kind;
      const g = applied(map);
      expect(() => g.placeCore(8, 6)).toThrow(/not normal terrain/);
      expect(g.coreOrigin()).toEqual({ tx: CORE_X, ty: CORE_Y });
    }
    // A normal target on the same map still goes through.
    const ok = applied(flatMap());
    ok.placeCore(8, 6);
    expect(ok.coreOrigin()).toEqual({ tx: 8, ty: 6 });
  });

  it('accepts a placement overlapping the Core it is about to move', () => {
    const g = new Grid();
    g.placeCore(CORE_X + 1, CORE_Y);
    expect(g.coreOrigin()).toEqual({ tx: CORE_X + 1, ty: CORE_Y });
  });

  it('refuses to run once a structure stands', () => {
    const g = new Grid();
    g.setOcc(10, 10, 42);
    expect(() => g.placeCore(8, 6)).toThrow(/before build/);
  });

  it('hands the tiles it vacates back their real terrain', () => {
    // The default Core footprint sits on rock. `applyTerrain` forces it to
    // normal so the Core is never buried — which makes it a bridge. Moving the
    // Core away must close that bridge, or the sim walks a map the analyzer
    // never measured.
    const map = flatMap();
    for (let dy = 0; dy < CORE_H; dy++) {
      for (let dx = 0; dx < CORE_W; dx++) {
        map.kind[(CORE_Y + dy) * GRID_W + (CORE_X + dx)] = TerrainKind.Rock;
      }
    }
    const g = applied(map);
    expect(g.passable(CORE_X, CORE_Y)).toBe(true);
    expect(g.terrainKind[g.idx(CORE_X, CORE_Y)]).toBe(TerrainKind.Normal);

    g.placeCore(8, 6);
    g.refresh();
    for (let dy = 0; dy < CORE_H; dy++) {
      for (let dx = 0; dx < CORE_W; dx++) {
        expect(g.passable(CORE_X + dx, CORE_Y + dy)).toBe(false);
        expect(g.terrainKind[g.idx(CORE_X + dx, CORE_Y + dy)]).toBe(TerrainKind.Rock);
        expect(g.buildable(CORE_X + dx, CORE_Y + dy)).toBe(false);
      }
    }
    // And the tiles it took now read as the structural ground a Core stands on.
    expect(g.terrainKind[g.idx(8, 6)]).toBe(TerrainKind.Normal);
    expect(g.isHighGround(8, 6)).toBe(false);
  });

  it('moving the Core twice leaves exactly one Core, and no island behind', () => {
    // The vacate loop must read the *live* footprint. Vacating the constant one
    // instead is correct on the first call and leaves the first target as a
    // permanent 2x2 of `TileType.Core` on the second — a phantom bridge plus a
    // `gatePath` that can end on a Core tile that is not the Core. A placement
    // UI re-issuing the Command, or a replay, is the second call.
    const map = flatMap();
    for (let dy = 0; dy < CORE_H; dy++) {
      for (let dx = 0; dx < CORE_W; dx++) {
        map.kind[(CORE_Y + dy) * GRID_W + (CORE_X + dx)] = TerrainKind.Rock;
      }
    }
    const g = applied(map);
    g.placeCore(8, 6);
    g.placeCore(12, 6);
    g.refresh();
    expect(g.coreOrigin()).toEqual({ tx: 12, ty: 6 });
    let cores = 0;
    for (let i = 0; i < g.tile.length; i++) if (g.tile[i] === TileType.Core) cores++;
    expect(cores).toBe(CORE_W * CORE_H);
    // The first target is ordinary ground again, and the original default is
    // still the rock it always was.
    expect(g.tile[g.idx(8, 6)]).toBe(TileType.Open);
    expect(g.distAt(8, 6)).toBeGreaterThan(0);
    expect(g.terrainKind[g.idx(CORE_X, CORE_Y)]).toBe(TerrainKind.Rock);
    expect(g.passable(CORE_X, CORE_Y)).toBe(false);
  });

  it('survives applyTerrain arriving after the placement', () => {
    // Nothing constrains the order the two are called in, so the pair must not
    // silently desync: adopting a map must not reset the Core to the constants.
    const map = flatMap();
    for (let dy = 0; dy < CORE_H; dy++) {
      for (let dx = 0; dx < CORE_W; dx++) {
        map.kind[(CORE_Y + dy) * GRID_W + (CORE_X + dx)] = TerrainKind.Rock;
      }
    }
    const g = new Grid();
    g.placeCore(8, 6);
    g.applyTerrain(terrainOverlay(map, cfg));
    g.refresh();
    expect(g.coreOrigin()).toEqual({ tx: 8, ty: 6 });
    expect(g.distAt(8, 6)).toBe(0);
    // The default footprint is now plain rock: nothing stands on it, so the
    // fb064b override that keeps the Core from being buried does not apply.
    expect(g.terrainKind[g.idx(CORE_X, CORE_Y)]).toBe(TerrainKind.Rock);
    expect(g.passable(CORE_X, CORE_Y)).toBe(false);
  });

  it('leaves a flat Grid bit-identical when the Core is placed where it already is', () => {
    const before = new Grid();
    before.refresh();
    const after = new Grid();
    after.placeCore(CORE_X, CORE_Y);
    after.refresh();
    expect(Array.from(after.tile)).toEqual(Array.from(before.tile));
    expect(Array.from(after.ground.dist)).toEqual(Array.from(before.ground.dist));
    expect(Array.from(after.ghost.dist)).toEqual(Array.from(before.ghost.dist));
  });
});

describe('the readers that have not migrated off CORE_X/CORE_Y yet (fb064h)', () => {
  it('placeCore moves the Grid and leaves the module-level coreCenter() behind', () => {
    // Not an assertion that this is *right* — it is the shape of the hazard,
    // written down. `coreCenter()` and the CORE_X/CORE_Y clamps in cores.ts,
    // enemies.ts, world.ts, run.ts, sundering.ts, bots/policies.ts, the
    // renderer and ui/selection.ts are all outside this lane's Scope, so
    // fb064c migrates them to `coreCenterOf()` and only then is `placeCore`
    // safe to call from a run: until it does, the flow field would target the
    // new Core while every damage and range check clamped to the old one.
    // This test is what makes that a recorded deferral instead of a surprise.
    const g = new Grid();
    g.placeCore(3, 3);
    g.refresh();
    expect(g.coreOrigin()).toEqual({ tx: 3, ty: 3 });
    expect(g.coreCenterOf()).toEqual({ x: 3 + CORE_W / 2, y: 3 + CORE_H / 2 });
    // The free function still answers about the default, 22 tiles away.
    expect(coreCenter()).toEqual({ x: CORE_X + CORE_W / 2, y: CORE_Y + CORE_H / 2 });
    expect(coreCenter()).not.toEqual(g.coreCenterOf());
    // The two agree exactly while the Core has not moved, which is what makes
    // fb064c's migration a mechanical call-site swap.
    expect(coreCenter()).toEqual(new Grid().coreCenterOf());
  });

  it('nothing in the shipped sim calls placeCore yet', async () => {
    // The deferral above is only safe while that is true. Reading the files
    // rather than trusting the comment: this goes red the moment a call site
    // appears without the migration, which is the whole risk.
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join, sep } = await import('node:path');
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts')) {
          // The declaring file itself is the one legitimate mention.
          if (p.split(sep).join('/').endsWith('src/sim/grid.ts')) continue;
          if (/\.placeCore\s*\(/.test(readFileSync(p, 'utf8'))) hits.push(p);
        }
      }
    };
    walk('src');
    walk('tools');
    expect(hits).toEqual([]);
  });
});

describe('a legal anchor is legal in the sim, not just in the analyzer (fb064h)', () => {
  it(`every gate still reaches the Core on ${SEEDS} seeds, at the suggested anchor`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const map = generateTerrain(seed, cfg);
      const anchor = suggestCoreAnchor(map, cfg);
      expect(anchor, `seed ${seed}`).not.toBeNull();
      const g = applied(map);
      g.placeCore((anchor as number) % GRID_W, ((anchor as number) / GRID_W) | 0);
      g.refresh();
      expect(g.allGatesReachable(), `seed ${seed}`).toBe(true);
      for (const gate of GATES) {
        const path = g.gatePath(gate);
        const last = path[path.length - 1];
        expect(g.tile[g.idx(last.tx, last.ty)], `seed ${seed} gate ${gate.key}`).toBe(TileType.Core);
        // Reached on foot: no tile of the route is a breach through a structure.
        for (const step of path) expect(step.breach, `seed ${seed} gate ${gate.key}`).toBe(false);
      }
    }
  });

  it('holds for every legal anchor on a sample of seeds, not just the suggested one', () => {
    for (const seed of [11, 137, 909]) {
      const map = generateTerrain(seed, cfg);
      const anchors = legalCoreAnchors(map, cfg);
      expect(anchors.length).toBeGreaterThan(0);
      // Every 17th anchor: the full set runs to hundreds per seed and each
      // placement rebuilds two flow fields, which would push this file past the
      // fast tier's budget for no extra coverage of the invariant.
      for (let k = 0; k < anchors.length; k += 17) {
        const g = applied(map);
        g.placeCore(anchors[k] % GRID_W, (anchors[k] / GRID_W) | 0);
        g.refresh();
        expect(g.allGatesReachable(), `seed ${seed} anchor ${anchors[k]}`).toBe(true);
      }
    }
  });

  it('a Core placed on an illegal tile can strand a gate — the check is not decorative', () => {
    // The negative control for the test above: without the legality rule the
    // placement step would happily bury the Core, so "all gates reachable"
    // being true above is a property of the rule and not of the map.
    const map = flatMap();
    for (let y = 1; y < GRID_H - 1; y++) map.kind[y * GRID_W + (GRID_W - 4)] = TerrainKind.Rock;
    const reach = gateComponent(map, cfg);
    const pocket = { tx: GRID_W - 3, ty: 10 };
    expect(validateCorePlacement(map, cfg, pocket.tx, pocket.ty, reach).ok).toBe(false);
    const g = applied(map);
    g.placeCore(pocket.tx, pocket.ty);
    g.refresh();
    expect(g.allGatesReachable()).toBe(false);
  });
});
