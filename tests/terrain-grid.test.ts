/**
 * fb064b — the generated map plugged into `Grid` (SPEC-FINAL §10.5, G2).
 *
 * What this pins, and why each one is here rather than assumed:
 *   - the three tile rules the owner wrote (rough walkable-not-buildable, rock
 *     blocks ground pathing, high ground buildable-and-unwalkable);
 *   - that *pathing* honours them, not just the predicates. `passable()` is
 *     easy to satisfy and still ship walkers strolling through rock, because
 *     the breach field enters non-passable tiles on purpose (SPEC-FINAL §10);
 *   - that the analyzer and the sim agree about the same map. The generator's
 *     bands are measured with a 4-connected flood in `src/sim/terrain/analyze`,
 *     the sim walks an 8-connected no-corner-cutting Dijkstra in `Grid`. If
 *     those two disagree, every band fb064a measures is a statement about a
 *     map the game does not play;
 *   - that a flat `new Grid()` is bit-identical to its pre-fb064b self, which
 *     is what lets `tests/grid.test.ts` stay untouched.
 */

import { describe, expect, it } from 'vitest';

import {
  CORE_H,
  CORE_W,
  CORE_X,
  CORE_Y,
  GATES,
  GRID_H,
  GRID_W,
  Grid,
  TileType,
  type TerrainOverlay,
} from '../src/sim/grid';
import {
  gateComponent,
  generateTerrain,
  loadTerrain,
  terrainOverlay,
  TerrainKind,
  walkableFlood,
  type TerrainConfig,
} from '../src/sim/terrain';
import type { TerrainGrid } from '../src/sim/terrain/types';

const cfg = loadTerrain();

/** The Grid's own view of its terrain, as a `TerrainGrid` the analyzer reads. */
function gridView(g: Grid): TerrainGrid {
  return { w: g.w, h: g.h, kind: g.terrainKind };
}

/** A rock-bordered map with a hand-placed patch of one kind in the interior. */
function handMap(patch: Array<[number, number, TerrainKind]>): TerrainGrid {
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
  for (const [x, y, k] of patch) kind[y * GRID_W + x] = k;
  return { w: GRID_W, h: GRID_H, kind };
}

function applied(map: TerrainGrid, c: TerrainConfig = cfg): Grid {
  const g = new Grid();
  g.applyTerrain(terrainOverlay(map, c));
  g.refresh();
  return g;
}

describe('terrainOverlay (fb064b)', () => {
  it('carries data/terrain.json flags verbatim, one decision point for the Grid', () => {
    const map = handMap([
      [5, 5, TerrainKind.Rough],
      [6, 5, TerrainKind.Rock],
      [7, 5, TerrainKind.High],
    ]);
    const o = terrainOverlay(map, cfg);
    expect(o.w).toBe(GRID_W);
    expect(o.h).toBe(GRID_H);
    const at = (x: number, y: number) => {
      const i = y * GRID_W + x;
      return { k: o.kind[i], w: o.walkable[i], b: o.buildable[i], h: o.high[i] };
    };
    expect(at(4, 5)).toEqual({ k: TerrainKind.Normal, w: 1, b: 1, h: 0 });
    expect(at(5, 5)).toEqual({ k: TerrainKind.Rough, w: 1, b: 0, h: 0 });
    expect(at(6, 5)).toEqual({ k: TerrainKind.Rock, w: 0, b: 0, h: 0 });
    expect(at(7, 5)).toEqual({ k: TerrainKind.High, w: 0, b: 1, h: 1 });
  });

  it('is pure in (map, cfg)', () => {
    const map = generateTerrain(11, cfg);
    const a = terrainOverlay(map, cfg);
    const b = terrainOverlay(map, cfg);
    expect(Array.from(a.walkable)).toEqual(Array.from(b.walkable));
    expect(Array.from(a.buildable)).toEqual(Array.from(b.buildable));
    expect(Array.from(a.high)).toEqual(Array.from(b.high));
    // A fresh buffer each call: the Grid copies, but nothing here should hand
    // two callers the same mutable mask.
    expect(a.walkable).not.toBe(b.walkable);
  });
});

describe('Grid.applyTerrain (fb064b)', () => {
  it('leaves a Grid that never applied terrain exactly as it was', () => {
    const g = new Grid();
    expect(Array.from(g.terrainKind).every((k) => k === TerrainKind.Normal)).toBe(true);
    expect(g.buildable(5, 5)).toBe(true);
    expect(g.passable(5, 5)).toBe(true);
    expect(g.isHighGround(5, 5)).toBe(false);
    expect(g.allGatesReachable()).toBe(true);
  });

  it('refuses an overlay of the wrong size instead of indexing off the end', () => {
    const g = new Grid();
    const small: TerrainOverlay = {
      w: 4,
      h: 4,
      kind: new Uint8Array(16),
      walkable: new Uint8Array(16),
      buildable: new Uint8Array(16),
      high: new Uint8Array(16),
    };
    expect(() => g.applyTerrain(small)).toThrow(/overlay is 4x4/);
    const ragged: TerrainOverlay = {
      w: GRID_W,
      h: GRID_H,
      kind: new Uint8Array(GRID_W * GRID_H),
      walkable: new Uint8Array(3),
      buildable: new Uint8Array(GRID_W * GRID_H),
      high: new Uint8Array(GRID_W * GRID_H),
    };
    expect(() => g.applyTerrain(ragged)).toThrow(/mask length 3/);
  });

  it('refuses an overlay whose content contradicts itself', () => {
    const g = new Grid();
    const base = terrainOverlay(handMap([]), cfg);
    const cliff: TerrainOverlay = {
      ...base,
      walkable: base.walkable.slice(),
      high: base.high.slice(),
    };
    const i = 5 * GRID_W + 5;
    cliff.walkable[i] = 1;
    cliff.high[i] = 1;
    expect(() => g.applyTerrain(cliff)).toThrow(/walkable and high/);
    // Refused atomically: the Grid is untouched, not half-updated.
    expect(g.isHighGround(5, 5)).toBe(false);
    expect(g.passable(5, 5)).toBe(true);
  });

  it('refuses a kind data/terrain.json has no tile for, instead of sealing the map silently', () => {
    // `cfg.tiles[250]?.walkable` is `undefined`, which reads as "not walkable",
    // so without this guard a garbage kind produces masks of exactly the right
    // shape describing an arena nobody can enter — and every length check
    // passes.
    const map: TerrainGrid = { w: GRID_W, h: GRID_H, kind: new Uint8Array(GRID_W * GRID_H).fill(250) };
    expect(() => terrainOverlay(map, cfg)).toThrow(/no such tile/);
    const short: TerrainGrid = { w: GRID_W, h: GRID_H, kind: new Uint8Array(9) };
    expect(() => terrainOverlay(short, cfg)).toThrow(/kind length 9/);
  });

  it('refuses to bury a structure that is already standing', () => {
    // `dijkstra`'s terrain guard refuses a tile before it reaches the `occ`
    // check, so a tower under fresh rock is unbreachable scenery: no walker can
    // path to it and nothing can destroy it. Terrain goes down before build.
    const g = new Grid();
    g.setOcc(5, 5, 77);
    expect(() => g.applyTerrain(terrainOverlay(handMap([]), cfg))).toThrow(/already placed/);
  });

  it('applies the three tile rules the owner wrote', () => {
    const g = applied(
      handMap([
        [5, 5, TerrainKind.Rough],
        [6, 5, TerrainKind.Rock],
        [7, 5, TerrainKind.High],
      ]),
    );
    // normal: walk and build
    expect(g.passable(4, 5)).toBe(true);
    expect(g.buildable(4, 5)).toBe(true);
    // rough: walkable, not buildable
    expect(g.passable(5, 5)).toBe(true);
    expect(g.buildable(5, 5)).toBe(false);
    // rock: blocks ground pathing, not buildable
    expect(g.passable(6, 5)).toBe(false);
    expect(g.buildable(6, 5)).toBe(false);
    // high ground: buildable, no ground walker stands on it
    expect(g.passable(7, 5)).toBe(false);
    expect(g.buildable(7, 5)).toBe(true);
    expect(g.isHighGround(7, 5)).toBe(true);
    expect(g.isHighGround(5, 5)).toBe(false);
    expect(g.isHighGround(-1, 0)).toBe(false);
    // b007's class: GRID_W is even, so ty = 5.5 cancels its own fraction and
    // (0, 5.5) indexes tile (18, 5) — an answer about a tile 18 columns away.
    // fb064d calls this from targeting code, where coordinates are floats.
    const bumped = applied(handMap([[18, 5, TerrainKind.High]]));
    expect(bumped.isHighGround(18, 5)).toBe(true);
    expect(bumped.isHighGround(0, 5.5)).toBe(false);
  });

  it('keeps the gate tiles and the Core footprint clear of buried terrain', () => {
    // Every structural tile buried under rock: the arena's fixed structure
    // outranks the scatter, or a gate spawns enemies inside a wall and the Core
    // cannot be attacked at all.
    const patch: Array<[number, number, TerrainKind]> = GATES.map((g) => [
      g.tx,
      g.ty,
      TerrainKind.Rock,
    ]);
    for (let dy = 0; dy < CORE_H; dy++) {
      for (let dx = 0; dx < CORE_W; dx++) patch.push([CORE_X + dx, CORE_Y + dy, TerrainKind.Rock]);
    }
    const g = applied(handMap(patch));
    for (const gate of GATES) {
      expect(g.passable(gate.tx, gate.ty)).toBe(true);
      expect(g.terrainKind[g.idx(gate.tx, gate.ty)]).toBe(TerrainKind.Normal);
    }
    for (let dy = 0; dy < CORE_H; dy++) {
      for (let dx = 0; dx < CORE_W; dx++) {
        expect(g.passable(CORE_X + dx, CORE_Y + dy)).toBe(true);
        expect(g.terrainKind[g.idx(CORE_X + dx, CORE_Y + dy)]).toBe(TerrainKind.Normal);
      }
    }
    expect(g.allGatesReachable()).toBe(true);
  });

  it('does not mutate the TerrainMap it was handed (its hash stays true)', () => {
    const map = generateTerrain(3, cfg);
    const before = Array.from(map.kind);
    const g = applied(map);
    expect(Array.from(map.kind)).toEqual(before);
    // The Grid's copy differs exactly where a structural override landed.
    for (let i = 0; i < map.kind.length; i++) {
      if (g.terrainKind[i] === map.kind[i]) continue;
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      const structural =
        GATES.some((gt) => gt.tx === x && gt.ty === y) ||
        (x >= CORE_X && x < CORE_X + CORE_W && y >= CORE_Y && y < CORE_Y + CORE_H);
      expect(structural).toBe(true);
    }
  });

  it('copies the masks, so a caller mutating its overlay cannot desync the field', () => {
    const map = generateTerrain(4, cfg);
    const o = terrainOverlay(map, cfg);
    const g = new Grid();
    g.applyTerrain(o);
    g.refresh();
    const before = Array.from(g.blocked);
    const kindBefore = Array.from(g.terrainKind);
    const overlayKindBefore = Array.from(o.kind);
    o.walkable.fill(0);
    o.buildable.fill(0);
    o.kind.fill(TerrainKind.Rock);
    // A bare `refresh()` would prove nothing: `dirty` is already false after the
    // first one, so it re-reads the same arrays whatever the implementation
    // does. Force the rebuild that a real caller's next `setOcc` would.
    g.markDirty();
    g.refresh();
    expect(Array.from(g.blocked)).toEqual(before);
    expect(Array.from(g.terrainKind)).toEqual(kindBefore);
    // And the traffic runs the other way too: the structural override must land
    // in the Grid's copy, never back in the caller's overlay.
    expect(overlayKindBefore[GATES[0].ty * GRID_W + GATES[0].tx]).toBe(map.kind[GATES[0].ty * GRID_W + GATES[0].tx]);
  });

  it('covers a gate the run opens later, not just the three it was built with', () => {
    // `world.ts`'s Fourth Gate modifier writes `grid.tile = Gate` at (12,19)
    // after the Grid exists. A structural override keyed on the `GATES`
    // constant misses it, and the map buries a gate that then spawns its wave
    // inside a wall — with nothing breachable, so the wave never clears.
    const g = applied(handMap([[12, 19, TerrainKind.Rock]]));
    expect(g.passable(12, 19)).toBe(false); // still border rock: no gate yet
    g.tile[g.idx(12, 19)] = TileType.Gate;
    g.markDirty();
    g.refresh();
    expect(g.passable(12, 19)).toBe(true);
    expect(g.distAt(12, 19)).toBeGreaterThan(0);
  });
});

describe('the structural override over gate tiles (fb064b, pinned fb064h)', () => {
  it('keeps a gate walkable and normal even when the map paints rock under it', () => {
    // Dead on generator output — `blankKinds()` makes the three gate tiles
    // Normal, so the Gate branch of the override never fires on a real map and
    // narrowing it to Core-only passes the whole suite. It is not dead on a
    // *run*: `world.ts`'s Fourth Gate modifier writes a south gate into
    // `grid.tile` after generation, on a tile the generator gave no protection
    // and may well have buried (138 of 500 seeds, measured in fb064b). This is
    // the only assertion standing between that and an unwalkable spawn point.
    const gate = GATES[1];
    const map = handMap([[gate.tx, gate.ty, TerrainKind.Rock]]);
    const g = applied(map);
    expect(g.terrainKind[g.idx(gate.tx, gate.ty)]).toBe(TerrainKind.Normal);
    expect(g.passable(gate.tx, gate.ty)).toBe(true);
    expect(g.allGatesReachable()).toBe(true);
  });
});

describe('Grid on a generated map (fb064b, 100 seeds)', () => {
  const SEEDS = Array.from({ length: 100 }, (_, i) => i + 1);

  it('derives passable/buildable from the terrain flags on every seed', () => {
    for (const seed of SEEDS) {
      const g = applied(generateTerrain(seed, cfg));
      for (let i = 0; i < GRID_W * GRID_H; i++) {
        const x = i % GRID_W;
        const y = (i / GRID_W) | 0;
        const tile = g.tile[i];
        const flags = cfg.tiles[g.terrainKind[i]];
        expect(g.passable(x, y)).toBe(tile !== TileType.Border && flags.walkable);
        expect(g.buildable(x, y)).toBe(tile === TileType.Open && flags.buildable);
        expect(g.isHighGround(x, y)).toBe(flags.highGround);
      }
    }
  });

  it('never routes a ground walker onto terrain (the breach field is not a hole)', () => {
    // The regression this exists for: the breach mode enters non-passable tiles
    // by design, gated only on `passableGhost` — which refuses the border and
    // nothing else. Reverting the terrain guard in `dijkstra` gives rock and
    // high ground a finite ground distance here.
    for (const seed of SEEDS) {
      const g = applied(generateTerrain(seed, cfg));
      let terrainWithDist = 0;
      for (let i = 0; i < GRID_W * GRID_H; i++) {
        const x = i % GRID_W;
        const y = (i / GRID_W) | 0;
        if (g.ground.dist[i] < 0) continue;
        if (!g.passable(x, y) && g.occ[i] === 0) terrainWithDist++;
      }
      expect(terrainWithDist).toBe(0);
    }
  });

  it('agrees with the analyzer about what is reachable, gate by gate', () => {
    // 4-connected (analyzer) vs 8-connected-no-corner-cutting (sim): a diagonal
    // step needs both orthogonals open, so it is always replaceable by two
    // orthogonal steps and the two reachable *sets* must be identical. If they
    // ever differ, fb064a's bands describe a map the sim does not walk.
    const field = Grid.makeField();
    for (const seed of SEEDS) {
      const g = applied(generateTerrain(seed, cfg));
      const view = gridView(g);
      for (const gate of GATES) {
        const gi = g.idx(gate.tx, gate.ty);
        g.computeField(field, [gi], false);
        const flood = walkableFlood(view, cfg, [gi]);
        for (let i = 0; i < GRID_W * GRID_H; i++) {
          expect(field.dist[i] >= 0).toBe(flood[i] === 1);
        }
      }
    }
  });

  it('reports the hardcoded Core honestly: reachable iff it is in the gate component', () => {
    // No generated map knows where the Core is — `legalCoreAnchors` exists so
    // fb064c can *place* it. Until then a seed may legally strand it, and the
    // grid must say so rather than paper over it.
    //
    // Measured over seeds 1..5000: two seeds strand it — 4426 and 4515, about
    // 1 run in 2500. Seed 4426 is pinned by name below as fb064c's fixture.
    // The *count* over this window is deliberately a bound, not a golden: it
    // moves on any density or `blob` retune (fb064f puts both under live Tuner
    // editing) with no bug behind it, which is the trap this lane already fell
    // into twice — see BACKLOG-TERRAIN.md on `walkableFrac` headroom and the
    // `paint()` timing bound.
    //
    // fb064l re-measured it against a control instead of inheriting it, and
    // the control is worth recording: at `density.jitter: 0` — fb064a's
    // generator exactly — the same sweep still reports 4 seeds (97, 2055,
    // 2845, 3098), so the per-seed density budgets *lowered* the stranding
    // rate rather than raising it. Worth checking rather than assuming: a
    // wider rock budget was the obvious way to seal the legacy Core off, and
    // the number went the other way.
    //
    // A first pass measured this on the raw generated map instead of on the
    // Grid and read 434/5000. That is a different question with a different
    // answer: `Grid` keeps the Core's own 2x2 unblocked whatever the terrain
    // says (see `legalCoreAnchors`), so the map-level count is dominated by
    // seeds that merely scatter rock *onto* the Core footprint. What strands
    // the Core in the game is the ring around it, which is what this measures.
    let stranded = 0;
    for (const seed of SEEDS) {
      const g = applied(generateTerrain(seed, cfg));
      const comp = gateComponent(gridView(g), cfg);
      let coreInComponent = true;
      for (let dy = 0; dy < CORE_H; dy++) {
        for (let dx = 0; dx < CORE_W; dx++) {
          if (!comp[(CORE_Y + dy) * GRID_W + (CORE_X + dx)]) coreInComponent = false;
        }
      }
      expect(g.allGatesReachable()).toBe(coreInComponent);
      if (!coreInComponent) stranded++;
    }
    // Slack since fb064l: measured 0 over seeds 1..100 (it was 1 when the
    // bound was chosen), so this line no longer discriminates and the seed
    // pinned by name below is what carries the test. Left as a bound rather
    // than tightened to 0, per this lane's own logged lesson that a count over
    // a seed window is not a golden. (Review.)
    expect(stranded).toBeLessThanOrEqual(3);
    const stranding = applied(generateTerrain(4426, cfg));
    expect(stranding.allGatesReachable()).toBe(false);
    for (const gate of GATES) expect(stranding.distAt(gate.tx, gate.ty)).toBe(-1);
  });

  it('walks gatePath over real ground only, and reaches the Core when it can', () => {
    for (const seed of SEEDS) {
      const g = applied(generateTerrain(seed, cfg));
      const reachable = g.allGatesReachable();
      for (const gate of GATES) {
        const path = g.gatePath(gate);
        expect(path.length).toBeGreaterThan(0);
        expect(path[0]).toMatchObject({ tx: gate.tx, ty: gate.ty });
        for (const step of path) {
          expect(g.passable(step.tx, step.ty) || step.breach).toBe(true);
        }
        if (reachable) {
          const last = path[path.length - 1];
          expect(g.tile[g.idx(last.tx, last.ty)]).toBe(TileType.Core);
        }
      }
    }
  });

  it('keeps the sealing rule: walling a gate in is still detected and restored', () => {
    for (const seed of [1, 2, 5, 42]) {
      const g = applied(generateTerrain(seed, cfg));
      if (!g.allGatesReachable()) continue;
      const box: Array<[number, number]> = [];
      const gate = GATES[0];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = gate.tx + dx;
          const y = gate.ty + dy;
          if ((dx === 0 && dy === 0) || !g.passable(x, y)) continue;
          box.push([x, y]);
        }
      }
      const blockedBefore = Array.from(g.blocked);
      expect(g.wouldBlockPath(box)).toBe(true);
      // State restored exactly — terrain gave `blocked` a second input, and the
      // restore recomputes it rather than remembering it.
      expect(Array.from(g.blocked)).toEqual(blockedBefore);
      expect(g.allGatesReachable()).toBe(true);
    }
  });

  it('is deterministic: the same seed builds the same blocked mask and field', () => {
    for (const seed of [1, 42, 97, 1000]) {
      const a = applied(generateTerrain(seed, cfg));
      const b = applied(generateTerrain(seed, cfg));
      expect(Array.from(a.terrainKind)).toEqual(Array.from(b.terrainKind));
      expect(Array.from(a.blocked)).toEqual(Array.from(b.blocked));
      expect(Array.from(a.ground.dist)).toEqual(Array.from(b.ground.dist));
      expect(Array.from(a.ghost.dist)).toEqual(Array.from(b.ghost.dist));
    }
  });
});

describe('high ground and structures (fb064b)', () => {
  it('takes a tower without changing any route, since nothing walked there', () => {
    const g = applied(handMap([[7, 5, TerrainKind.High]]));
    const before = Array.from(g.ground.dist);
    expect(g.buildable(7, 5)).toBe(true);
    g.setOcc(7, 5, 42);
    g.setBreach(7, 5, 1234);
    g.refresh();
    expect(Array.from(g.ground.dist)).toEqual(before);
    // And it is not a breach route either: a ground walker cannot chew terrain.
    expect(g.ground.dist[g.idx(7, 5)]).toBe(-1);
    // Selling or losing that tower must not open the cliff. `setOcc` recomputes
    // `blocked` from scratch, and the terrain half of that expression is the
    // only thing standing between a destroyed high-ground tower and a walkable
    // hole in the mountain (`world.ts` sells with `setOcc(.., 0)`).
    g.setOcc(7, 5, 0);
    g.refresh();
    expect(g.passable(7, 5)).toBe(false);
    expect(g.blocked[g.idx(7, 5)]).toBe(1);
    expect(g.ground.dist[g.idx(7, 5)]).toBe(-1);
  });

  it('survives a wouldBlockPath probe on high ground with its blocked mask intact', () => {
    // The live caller: `src/bots/policies.ts` probes a build site with
    // `buildable(tx,ty) && !wouldBlockPath([[tx,ty]])`. High ground satisfies
    // `buildable` while being `blocked`, so the probe hands `wouldBlockPath` a
    // terrain-blocked tile — and its restore recomputes `blocked` rather than
    // remembering it. Get that expression wrong and a *query* permanently
    // unblocks the cliff.
    const g = applied(handMap([[7, 5, TerrainKind.High]]));
    expect(g.buildable(7, 5)).toBe(true);
    expect(g.wouldBlockPath([[7, 5]])).toBe(false);
    expect(g.passable(7, 5)).toBe(false);
    expect(g.blocked[g.idx(7, 5)]).toBe(1);
  });

  it('stops the Warden at terrain, unlike the Core and friendly structures', () => {
    // fb002 legalised walking through what the *player built*; scenery is not
    // that. A Warden that dashes into a mountain is a hole, and one parked on
    // high ground is unreachable by every ground melee enemy at once.
    const g = applied(
      handMap([
        [6, 5, TerrainKind.Rock],
        [7, 5, TerrainKind.High],
        [8, 5, TerrainKind.Rough],
      ]),
    );
    expect(g.wardenPassable(6, 5)).toBe(false);
    expect(g.wardenPassable(7, 5)).toBe(false);
    expect(g.wardenPassable(8, 5)).toBe(true);
    // Unchanged where fb002 decided it: the Core, a friendly structure, a gate.
    expect(g.wardenPassable(CORE_X, CORE_Y)).toBe(true);
    g.setOcc(9, 5, 42);
    expect(g.wardenPassable(9, 5)).toBe(true);
    expect(g.wardenPassable(GATES[0].tx, GATES[0].ty)).toBe(true);
    expect(g.wardenPassable(0, 0)).toBe(false);
  });

  it('still prices a structure on ordinary ground as a breach', () => {
    const g = applied(handMap([]));
    const open = g.distAt(GATES[0].tx, GATES[0].ty);
    for (let y = 1; y < GRID_H - 1; y++) g.setOcc(10, y, 999);
    g.refresh();
    const breached = g.distAt(GATES[0].tx, GATES[0].ty);
    expect(breached).toBeGreaterThan(open);
    expect(breached).toBeGreaterThan(g.breachBase);
  });

  it('leaves the ghost field terrain-blind: a Burrower tunnels under rock', () => {
    // Deliberate, and the reason it is written down: ghost pathing is what
    // Burrowers and mid-phase Wraiths use, and burrowing *under* stone is the
    // whole mechanic. Where they may surface is fb064d's rule, not this mask's.
    const g = applied(handMap([[6, 5, TerrainKind.Rock]]));
    expect(g.passable(6, 5)).toBe(false);
    expect(g.passableGhost(6, 5)).toBe(true);
    expect(g.distAt(6, 5, true)).toBeGreaterThan(0);
  });
});
