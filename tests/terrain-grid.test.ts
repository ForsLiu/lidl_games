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

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  CORE_H,
  CORE_W,
  CORE_X,
  CORE_Y,
  GATES,
  GRID_H,
  GRID_W,
  fieldDist,
  fieldStep,
  Grid,
  TileType,
  type TerrainOverlay,
} from '../src/sim/grid';
import {
  gateComponent,
  generateTerrain,
  gridTerrain,
  loadTerrain,
  terrainOverlay,
  TerrainKind,
  walkableFlood,
  type TerrainConfig,
} from '../src/sim/terrain';
import { Hasher } from '../src/sim/hash';
import type { TerrainGrid } from '../src/sim/terrain/types';

const cfg = loadTerrain();

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

/** fb064q: every tile's `wardenPassable`, as a comparable snapshot. */
function wardenAll(g: Grid): number[] {
  const out: number[] = [];
  for (let ty = 0; ty < GRID_H; ty++) {
    for (let tx = 0; tx < GRID_W; tx++) out.push(g.wardenPassable(tx, ty) ? 1 : 0);
  }
  return out;
}

/** fb064x: both flow fields, `dist` and `next`, as one comparable value. */
function fieldHash(g: Grid): string {
  const h = new Hasher();
  for (const f of [g.ground, g.ghost]) {
    for (let i = 0; i < f.dist.length; i++) h.int(f.dist[i]);
    for (let i = 0; i < f.next.length; i++) h.int(f.next[i]);
  }
  return h.hex();
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
      charBlock: new Uint8Array(16),
    };
    expect(() => g.applyTerrain(small)).toThrow(/overlay is 4x4/);
    const ragged: TerrainOverlay = {
      w: GRID_W,
      h: GRID_H,
      kind: new Uint8Array(GRID_W * GRID_H),
      walkable: new Uint8Array(3),
      buildable: new Uint8Array(GRID_W * GRID_H),
      high: new Uint8Array(GRID_W * GRID_H),
      charBlock: new Uint8Array(GRID_W * GRID_H),
    };
    expect(() => g.applyTerrain(ragged)).toThrow(/walkable mask length 3/);
    // fb064q: a fifth mask arrived, so an overlay built before it — a `tools/`
    // script, a JS caller, a JSON-parsed save — reaches here with
    // `charBlock: undefined`. It must be refused by name, not by a `TypeError`
    // from reading `.length` of undefined that names neither the mask nor
    // `applyTerrain`.
    const { charBlock: _dropped, ...missing } = terrainOverlay(handMap([]), cfg);
    expect(() => g.applyTerrain(missing as unknown as TerrainOverlay)).toThrow(
      /overlay has no charBlock mask/,
    );
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
    const wardenBefore = wardenAll(g);
    const overlayKindBefore = Array.from(o.kind);
    o.walkable.fill(0);
    o.buildable.fill(0);
    o.kind.fill(TerrainKind.Rock);
    // fb064q: the character mask is copied too, or a caller mutating its
    // overlay moves the Warden's rule out from under a live Grid.
    o.charBlock.fill(1);
    // A bare `refresh()` would prove nothing: `dirty` is already false after the
    // first one, so it re-reads the same arrays whatever the implementation
    // does. Force the rebuild that a real caller's next `setOcc` would.
    g.markDirty();
    g.refresh();
    expect(Array.from(g.blocked)).toEqual(before);
    expect(Array.from(g.terrainKind)).toEqual(kindBefore);
    expect(wardenAll(g)).toEqual(wardenBefore);
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
    expect(g.wardenPassable(12, 19)).toBe(false);
    g.tile[g.idx(12, 19)] = TileType.Gate;
    g.markDirty();
    g.refresh();
    expect(g.passable(12, 19)).toBe(true);
    expect(g.distAt(12, 19)).toBeGreaterThan(0);
    // fb064q: and the character too. `terrainCharBlock` is a snapshot
    // `syncTerrain` takes, while this gate is opened afterwards with only a
    // `markDirty()`/`refresh()` — so `wardenPassable` must re-decide the
    // structural term live, exactly as `staticBlocked` did. Reading the
    // snapshot alone walls the Warden out of a gate every enemy walks through.
    expect(g.wardenPassable(12, 19)).toBe(true);
  });
});

describe('the structural override over gate tiles (fb064b, pinned fb064h)', () => {
  it('keeps a gate walkable and normal even when the map paints rock under it', () => {
    // Dead on generator output — `flatKinds()` makes the three gate tiles
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
      const view = gridTerrain(g);
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
      const comp = gateComponent(gridTerrain(g), cfg);
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

  it('rejects a non-integer coordinate the way buildable and isHighGround do', () => {
    // fb064u. `wardenPassable` indexed with the raw coordinate, so a fraction
    // could answer about a tile that does not exist — or, worse, about a real
    // *different* one. Both sibling predicates reject non-integers outright for
    // b007's reason, and this one is the odd man out; latent only because both
    // live callers (`run.ts`'s `walkable`, `wardenmove.ts`) floor first.
    const g = applied(
      handMap([
        [3, 1, TerrainKind.Rock],
        [4, 1, TerrainKind.High],
      ]),
    );
    expect(g.wardenPassable(3, 1)).toBe(false);
    expect(g.wardenPassable(4, 1)).toBe(false);

    // The undefined-index shape: `tile[ty * GRID_W + 3.5]` is `undefined`,
    // which is neither Border nor Open, so the old code fell through to
    // "passable" on a tile made of rock.
    expect(g.wardenPassable(3.5, 1)).toBe(false);
    expect(g.wardenPassable(4.5, 1)).toBe(false);

    // The aliasing shape b007 named: GRID_W is even, so a `.5` in `ty` cancels
    // its own fraction and lands on a real tile in another column — here an
    // open one, so rock at (3, 1) would have read back as passable.
    expect(((1 + 0.5) * GRID_W) % 1).toBe(0);
    const alias = 1.5 * GRID_W + 3;
    expect(Number.isInteger(alias)).toBe(true);
    expect(g.tile[alias]).toBe(TileType.Open);
    expect(g.terrainKind[alias]).toBe(TerrainKind.Normal);
    expect(g.wardenPassable(3, 1.5)).toBe(false);

    // Same answer as the two siblings, on every non-integer shape.
    for (const [tx, ty] of [
      [3.5, 1],
      [3, 1.5],
      [-0.5, 5],
      [NaN, 5],
      [5, NaN],
      [Infinity, 5],
      [5, -Infinity],
    ] as Array<[number, number]>) {
      expect(g.wardenPassable(tx, ty)).toBe(false);
      expect(g.buildable(tx, ty)).toBe(false);
      expect(g.isHighGround(tx, ty)).toBe(false);
    }

    // The guard did not displace the bounds check: b007's other alias shape is
    // an out-of-grid *integer* tx that multiplies onto a real tile one row up.
    // The probe must land on an *open* alias — `3 + GRID_W` aliases onto the
    // rock this test planted at (3, 1) and would read `false` for the wrong
    // reason, staying green with `inBounds` deleted (QA bug 2).
    const oob = 2 + GRID_W;
    expect(Number.isInteger(oob)).toBe(true);
    expect(g.tile[oob]).toBe(TileType.Open);
    expect(g.wardenPassable(oob, 0)).toBe(false);
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

describe('fb064x — every Grid tile predicate answers about a tile that exists', () => {
  /**
   * The two repros fb064u's QA measured at HEAD and this item closes.
   *
   * fb064u guarded `wardenPassable` and deliberately left these two: they are
   * the Dijkstra inner loop, where `Number.isInteger` on every neighbour is a
   * real per-tick cost against G12's budget, so the fix had to be a decision
   * rather than a copy. It is: the guard sits on the *public* predicate and the
   * flow field calls the flat-index form directly, since `dijkstra` derives
   * every neighbour from an index and a `NEIGHBORS` offset and has already
   * bounds-checked it — so the loop pays nothing (it stopped re-checking
   * bounds) and no caller can ask about a tile that does not exist.
   */
  it('rejects a non-integer coordinate rather than aliasing or reading undefined', () => {
    const g = applied(
      handMap([
        [3, 1, TerrainKind.Rock],
        [4, 1, TerrainKind.High],
      ]),
    );
    // The aliasing shape (b007): GRID_W is even, so `.5` in `ty` cancels its
    // own fraction. `1.5 * GRID_W + 3` is tile (21, 1) — open ground — so
    // `passable(3, 1.5)` used to answer `true` about the mountain at (3, 1).
    const alias = 1.5 * GRID_W + 3;
    expect(Number.isInteger(alias)).toBe(true);
    expect(alias).toBe(57);
    expect(g.tile[alias]).toBe(TileType.Open);
    expect(g.blocked[alias]).toBe(0);
    expect(g.passable(3, 1)).toBe(false);
    expect(g.passable(3, 1.5)).toBe(false);

    // The undefined-index shape: `tile[ty * GRID_W + 3.5]` is `undefined`,
    // which is not `Border`, so `passableGhost` answered `true` off a read of
    // nothing at all.
    expect(g.tile[1 * GRID_W + 3.5]).toBeUndefined();
    expect(g.passableGhost(3.5, 1)).toBe(false);

    // Every non-integer shape, and the same answer the three already-guarded
    // siblings give.
    for (const [tx, ty] of [
      [3.5, 1],
      [3, 1.5],
      [-0.5, 5],
      [NaN, 5],
      [5, NaN],
      [Infinity, 5],
      [5, -Infinity],
    ] as Array<[number, number]>) {
      expect(g.passable(tx, ty), `passable(${tx}, ${ty})`).toBe(false);
      expect(g.passableGhost(tx, ty), `passableGhost(${tx}, ${ty})`).toBe(false);
      expect(g.wardenPassable(tx, ty)).toBe(false);
      expect(g.buildable(tx, ty)).toBe(false);
      expect(g.isHighGround(tx, ty)).toBe(false);
    }

    // The guard did not displace the bounds check, and the probe lands on an
    // *open* alias so it cannot read `false` for the wrong reason (fb064u QA
    // bug 2): `2 + GRID_W` aliases onto tile (2, 1), which is open ground.
    const oob = 2 + GRID_W;
    expect(g.tile[oob]).toBe(TileType.Open);
    expect(g.blocked[oob]).toBe(0);
    expect(g.passable(oob, 0)).toBe(false);
    expect(g.passableGhost(oob, 0)).toBe(false);
  });

  it('answers exactly as before on every integer tile of a generated map', () => {
    // The guard is a refusal added in front of an unchanged rule, and the
    // flow-field rewrite that pays for it must be behaviour-preserving. Both
    // predicates are compared tile by tile against the arrays they are derived
    // from, over real generated maps rather than a hand-built one.
    for (const seed of [1, 2, 3, 7, 19, 137]) {
      const g = applied(generateTerrain(seed, cfg));
      for (let ty = 0; ty < GRID_H; ty++) {
        for (let tx = 0; tx < GRID_W; tx++) {
          const i = ty * GRID_W + tx;
          expect(g.passable(tx, ty), `seed ${seed} passable(${tx}, ${ty})`).toBe(
            g.blocked[i] === 0,
          );
          expect(g.passableGhost(tx, ty), `seed ${seed} ghost(${tx}, ${ty})`).toBe(
            g.tile[i] !== TileType.Border,
          );
        }
      }
    }
  });

  it('leaves both flow fields bit-identical to their pre-guard values', () => {
    // The one thing that could change silently: `dijkstra` now calls the
    // flat-index forms, so if either disagreed with its public predicate on a
    // single tile the fields would drift — and a drifted field is a *different
    // game* (G2), not a slower one. A reachability invariant does not catch
    // that (review: the first draft of this test was green on the pre-change
    // `grid.ts`, so it exerted no pressure at all), and neither would
    // re-deriving the fields from the predicates the loop now calls, since that
    // asks the changed code twice. The pin has to be a value measured on the
    // *old* code: these hashes were taken at HEAD, before the flat-index forms
    // existed, and every one of them is unchanged after.
    //
    // Both fields and both `next` arrays, on a bare map and on one dense with
    // structures and breach prices, so the ghost, blocked and breach modes are
    // all covered — the breach mode is the one whose diagonal branch changed
    // shape (`passable(x, y)` became `passableAt(i)`).
    //
    // Seed 4 earns its place: QA showed the first three (1, 11, 137) all blind
    // to a mutation that deletes the breach-diagonal branch's second term —
    // the one line whose *shape* changed (`passable(x, y)` became
    // `passableAt(i)`) — while seeds 4, 5, 12 and 21 see it. A pin that cannot
    // fail on the line the change rewrote is decoration.
    //
    // Each row also carries the map hash, checked first: `applied()` builds
    // from `generateTerrain`, so a `/data/terrain.json` tuning edit moves these
    // fields for a reason that has nothing to do with `grid.ts`, and a
    // balance-analyst editing densities should read "the map changed" rather
    // than a bare field-hash mismatch on a Grid test (QA bug 4).
    const GOLDEN: ReadonlyArray<readonly [number, string, string, string]> = [
      [1, '54fad3db', 'ebcc9078', 'de5c7d1b'],
      [4, '131ee8f2', 'b2d3934d', '462315b5'],
      [11, '5064cfc5', '09546a0e', '16f18023'],
      [137, '2184cf89', '0e3776a5', '66ee4ee2'],
    ];
    for (const [seed, map, bare, dense] of GOLDEN) {
      const generated = generateTerrain(seed, cfg);
      expect(
        generated.hash,
        `seed ${seed}: the generated map itself changed — this is a data/terrain.json ` +
          `or generator change, not a grid.ts one; re-derive the field hashes below`,
      ).toBe(map);
      const g = applied(generated);
      expect(fieldHash(g), `seed ${seed} bare`).toBe(bare);
      // Structures on every third tile, priced, so `breach` and `occ` both
      // steer the field rather than sitting at zero.
      let id = 1;
      for (let y = 2; y < GRID_H - 2; y += 3) {
        for (let x = 2; x < GRID_W - 2; x += 3) {
          if (!g.buildable(x, y)) continue;
          g.setOcc(x, y, id);
          g.setBreach(x, y, 4 * (id % 7));
          id++;
        }
      }
      g.refresh();
      expect(fieldHash(g), `seed ${seed} dense`).toBe(dense);
    }
  });

  it('enumerates every tile predicate in grid.ts, so a sixth cannot land unguarded', () => {
    // The structural half of the acceptance. A predicate list written by hand
    // is a list that goes stale the moment someone adds the seventh one, so it
    // is read out of the source and compared against the declared table: a new
    // `(tx, ty) => boolean` on `Grid` fails here until it is classified.
    const src = readFileSync(new URL('../src/sim/grid.ts', import.meta.url), 'utf8');
    // Deliberately wider than "a boolean predicate": an accessor that indexes a
    // tile is the same class of bug whether or not it returns a boolean, so the
    // scan takes every member whose first two parameters are numbers, and the
    // table below is what says which ones are guarded.
    //
    // Widened twice after QA beat the first version. It missed `static`, a
    // modifier `Grid` already uses (`tileCenter`), and it required the
    // parameters to be *named* `tx`/`ty`, so `isMud(x: number, y: number)`
    // landed un-guarded with this test green. Both are now covered, and the
    // module-level `Field` accessors are scanned separately because the member
    // pattern is anchored at two spaces of indentation and cannot see them.
    //
    // What it still cannot see, stated so the guarantee is not overclaimed: an
    // arrow property (`foo = (tx: number, ty: number) => ...`), a signature
    // prettier wrapped across lines, and a member whose coordinates are not its
    // first two parameters. It catches a predicate written like the five that
    // exist, which is how a sixth arrives.
    const MEMBER =
      /^ {2}(?:public |private |protected |static |readonly )*(\w+)\(\s*\w+: number,\s*\w+: number\b/gm;
    const MODULE = /^export function (\w+)\(f: Field, \w+: number, \w+: number\b/gm;
    const found = [
      ...[...src.matchAll(MEMBER)].map((m) => m[1]),
      ...[...src.matchAll(MODULE)].map((m) => m[1]),
    ];
    expect(found.length).toBeGreaterThan(0);

    /**
     * Every `(tx, ty)` member of `Grid`, and what it promises a non-integer.
     *
     * The label is the *behaviour*, not a bucket. The first version of this
     * table had one `accessor` catch-all that the loop below skipped, so a
     * seventh accessor was made green by adding a row and got no behavioural
     * check at all — which is the guarantee the table exists to give (review
     * finding 1). Every label except `accepted` and `write` is probed.
     */
    const DECLARED: ReadonlyArray<
      readonly [
        string,
        'refuses' | 'exempt' | 'sentinel-neg1' | 'sentinel-null' | 'throws' | 'accepted' | 'write',
      ]
    > = [
      ['isHighGround', 'refuses'],
      // `inBounds` is the one *predicate* exemption, and it is not a hole: it
      // answers about the coordinate ("is this inside the arena?"), never about
      // a tile, and `3.5` genuinely is inside. Every predicate marked `refuses`
      // calls it after its own integer check, so the exemption cannot leak into
      // a tile read through any of them. Renaming it a tile predicate would be
      // the actual mistake.
      ['inBounds', 'exempt'],
      ['passable', 'refuses'],
      ['passableGhost', 'refuses'],
      ['wardenPassable', 'refuses'],
      ['buildable', 'refuses'],
      // Arrived from master at this merge (fb078: it distinguishes a build
      // rejected by terrain from one rejected by occupancy). It already
      // carries the integer guard — written after fb064x's convention was in
      // master, and following it — so classifying it is all this table needed.
      // That is the table working: a new `(tx, ty)` member on `Grid` could not
      // land here without someone saying what it promises a non-integer.
      ['unbuildableForTerrain', 'refuses'],
      // fb064y. Not boolean predicates, so they cannot share the predicates'
      // one answer — each refuses with the value its own contract already uses
      // for "no answer", and the label says which. `distAt(3, 1.5)` used to
      // bounds-check and then index `ty * GRID_W + tx`, reading tile (21, 1):
      // a plausible finite distance for somewhere else.
      ['distAt', 'sentinel-neg1'],
      ['fieldDist', 'sentinel-neg1'],
      ['stepFrom', 'sentinel-null'],
      ['fieldStep', 'sentinel-null'],
      // The recorded exemption: arithmetic with no spare value to mean "no such
      // tile", so a sentinel would move the silent alias one line downstream
      // into its callers. What it costs is pinned by this file's fb064y block.
      ['idx', 'accepted'],
      // Writes, not reads. Their refusal lives at the call site — `buildTower`
      // goes through `buildable`, which fb064x guarded — and what that leaves
      // exposed is pinned by its own test below rather than argued here, since
      // a write that lands on the wrong tile is strictly worse than a read
      // that reports one (review Minor 2).
      ['setOcc', 'write'],
      ['setBreach', 'write'],
      // Already guarded, and by a *throw*: it is the one member with no caller
      // that could sensibly continue past a bad anchor.
      ['placeCore', 'throws'],
      // fb065e: same shape as `placeCore` — it re-derives the whole board, so a
      // fractional coordinate has nothing sensible to continue past either.
      ['openGate', 'throws'],
      // Takes coordinates and returns a point; it never indexes a tile, so a
      // fraction in gives a fraction out and there is nothing to alias onto.
      ['tileCenter', 'exempt'],
    ];
    expect([...found].sort()).toEqual([...DECLARED.map(([n]) => n)].sort());

    const g = applied(handMap([[3, 1, TerrainKind.Rock]]));
    /** The bad inputs every probed row is asked about. */
    const BAD: ReadonlyArray<readonly [number, number]> = [
      [3.5, 1],
      [3, 1.5],
      [NaN, 1],
    ];
    /**
     * The two module-level rows take a `Field` first, so a name-indexed lookup
     * on `g` cannot reach them; they are bound here rather than special-cased
     * inside the loop.
     */
    // A `Map`, not an object literal: `PROBE[name]` on a literal reads the
    // prototype chain, so a member named `toString` or `constructor` would be
    // probed as an inherited function instead of as itself.
    const PROBE = new Map<string, (tx: number, ty: number) => unknown>([
      ['fieldDist', (tx, ty) => fieldDist(g.ground, tx, ty)],
      ['fieldStep', (tx, ty) => fieldStep(g.ground, tx, ty)],
    ]);
    // The closer on the one thing a label can still buy (review): `accepted`
    // and `write` skip the probe loop, so the skip list is pinned by name — a
    // seventh accessor cannot join it by choosing a convenient label.
    expect(
      DECLARED.filter(([, r]) => r === 'accepted' || r === 'write').map(([n]) => n),
    ).toEqual(['idx', 'setOcc', 'setBreach']);

    for (const [name, rule] of DECLARED) {
      if (rule === 'accepted' || rule === 'write') continue;
      if (rule === 'throws') {
        // Bound by name, not hardcoded. This branch used to call `placeCore`
        // whatever `name` said, so fb065e's `openGate` — the second `throws`
        // row — would have been declared, probed as `placeCore` a second time,
        // and gone green completely unguarded. That is the same hole fb064y's
        // re-review closed for the `accessor` bucket, one branch further in.
        const throwing = (g as unknown as Record<string, (a: number, b: number) => unknown>)[name];
        expect(typeof throwing, `${name} is callable`).toBe('function');
        for (const [tx, ty] of BAD) {
          expect(() => throwing.call(g, tx, ty), `${name}(${tx}, ${ty})`).toThrow(
            /not an integer tile/,
          );
        }
        continue;
      }
      if (name === 'tileCenter') {
        // The rule is asserted before the special case: this branch is
        // name-hardcoded, so without this line `['tileCenter', 'refuses']`
        // would pass green through the `exempt` probe. Same shape as the
        // `throws` branch fb065e just fixed one branch above.
        expect(rule, 'tileCenter must be declared exempt').toBe('exempt');
        // Not a tile read at all: a fraction in, a fraction out.
        expect(Grid.tileCenter(3.5, 1)).toEqual({ x: 4, y: 1.5 });
        continue;
      }
      const bound =
        PROBE.get(name) ??
        ((tx: number, ty: number) =>
          (g as unknown as Record<string, (a: number, b: number) => unknown>)[name].call(g, tx, ty));
      if (rule === 'exempt') {
        // Exempt by reason, not by omission, so it is probed for the answer
        // that *makes* it exempt: an in-arena fraction is in the arena. It is
        // still not a licence to answer about nothing — `NaN` is out.
        expect(bound(3.5, 1), `${name}(3.5, 1)`).toBe(true);
        expect(bound(3, 1.5), `${name}(3, 1.5)`).toBe(true);
        expect(bound(NaN, 1), `${name}(NaN, 1)`).toBe(false);
        continue;
      }
      for (const [tx, ty] of BAD) {
        const got = bound(tx, ty);
        const what = `${name}(${tx}, ${ty})`;
        if (rule === 'refuses') expect(got, what).toBe(false);
        else if (rule === 'sentinel-neg1') expect(got, what).toBe(-1);
        else expect(got, what).toBeNull();
      }
    }
  });
});

describe('fb064y — the non-predicate tile accessors answer about a tile that exists too', () => {
  /**
   * fb064x closed b007's hole on the five tile *predicates* and listed the
   * six non-predicate `(tx, ty)` members as a recorded exemption rather than
   * filtering them out, because the same hole is the same hole whether or not
   * the answer is a boolean. This is that list worked through.
   *
   * The predicates could all share one answer (`false`). These cannot: each
   * has its own "no answer" value, and two of them have none at all.
   *  - `distAt` already returns `-1` out of bounds; a non-integer gets the
   *    same, because "no answer" is what it means.
   *  - `stepFrom` already returns `null` out of bounds.
   *  - `fieldDist`/`fieldStep` are those two one layer down, over an arbitrary
   *    `Field`, and get the same treatment for the same reason.
   *  - `idx` is arithmetic with no notion of a tile and no spare value to
   *    mean "none" — every integer it can return is a legal index. It is
   *    recorded as an accepted case below rather than guarded, with the
   *    reasoning and the out-of-scope call sites.
   *  - `setOcc`/`setBreach`/`placeCore` are writes, not reads, and are covered
   *    at their own call sites (`buildTower` goes through `buildable`, which
   *    refuses); `placeCore` already refuses anything but a legal anchor.
   */
  it('distAt and stepFrom refuse a non-integer with their own no-answer value', () => {
    const g = applied(
      handMap([
        [3, 1, TerrainKind.Rock],
        [4, 1, TerrainKind.High],
      ]),
    );
    // The alias: `1.5 * GRID_W + 3` is tile (21, 1), open ground with a real
    // finite distance, so `distAt(3, 1.5)` used to answer about it — a
    // *plausible* number for a tile made of rock, which is the dangerous kind
    // of wrong answer.
    const alias = 1.5 * GRID_W + 3;
    expect(g.ground.dist[alias]).toBeGreaterThan(0);
    expect(g.distAt(3, 1.5)).toBe(-1);
    expect(g.stepFrom(3, 1.5)).toBeNull();

    // The undefined-index shape, which for a typed array reads as `undefined`
    // and for `stepFrom` used to reach `i < 0` on a NaN comparison.
    expect(g.distAt(3.5, 1)).toBe(-1);
    expect(g.stepFrom(3.5, 1)).toBeNull();

    for (const [tx, ty] of [
      [3.5, 1],
      [3, 1.5],
      [-0.5, 5],
      [NaN, 5],
      [5, NaN],
      [Infinity, 5],
      [5, -Infinity],
    ] as Array<[number, number]>) {
      expect(g.distAt(tx, ty), `distAt(${tx}, ${ty})`).toBe(-1);
      expect(g.distAt(tx, ty, true), `distAt ghost(${tx}, ${ty})`).toBe(-1);
      expect(g.stepFrom(tx, ty), `stepFrom(${tx}, ${ty})`).toBeNull();
      // QA bug 1: the `ghost` overload of `stepFrom` had no coverage anywhere
      // in the repo — no caller passes `true`, and replacing its field with
      // `this.ground` left all 52 tests in the three grid suites green while
      // changing 206 tiles on seed 1.
      expect(g.stepFrom(tx, ty, true), `stepFrom ghost(${tx}, ${ty})`).toBeNull();
      expect(fieldDist(g.ground, tx, ty), `fieldDist(${tx}, ${ty})`).toBe(-1);
      expect(fieldStep(g.ground, tx, ty), `fieldStep(${tx}, ${ty})`).toBeNull();
    }

    // The bounds check is not displaced, and the probe lands on an *open*
    // alias so it cannot read right for the wrong reason (fb064u QA bug 2).
    const oob = 2 + GRID_W;
    expect(g.ground.dist[oob]).toBeGreaterThan(0);
    // All four terms of the bounds check, not just the `tx` upper one (QA bug
    // 2): with `ty >= GRID_H` dropped from `fieldDist`, `fieldDist(g.ground,
    // 3, GRID_H)` returns `undefined` from a function declared `: number` —
    // the exact class of bug this item closes — and all 52 tests in the three
    // grid suites stayed green.
    for (const [tx, ty] of [
      [oob, 0],
      [3, GRID_H],
      [3, GRID_H + 2],
      [3, -1],
      [-1, 3],
    ] as Array<[number, number]>) {
      expect(g.distAt(tx, ty), `distAt(${tx}, ${ty})`).toBe(-1);
      expect(g.distAt(tx, ty, true), `distAt ghost(${tx}, ${ty})`).toBe(-1);
      expect(g.stepFrom(tx, ty), `stepFrom(${tx}, ${ty})`).toBeNull();
      expect(g.stepFrom(tx, ty, true), `stepFrom ghost(${tx}, ${ty})`).toBeNull();
      expect(fieldDist(g.ground, tx, ty), `fieldDist(${tx}, ${ty})`).toBe(-1);
      expect(fieldStep(g.ground, tx, ty), `fieldStep(${tx}, ${ty})`).toBeNull();
    }
  });

  it('never fires on a legal integer tile of a generated map', () => {
    // What this catches, stated precisely because it is narrower than a
    // "nothing changed" pin (review finding 5): a guard that misfires on a
    // legal coordinate. The evidence that nothing *else* changed is the
    // unchanged `endHash` recorded in the item, not this loop — these
    // assertions restate the method bodies and cannot be more than that.
    //
    // Two seeds, not four: the guard is coordinate-shaped, not terrain-shaped,
    // so extra maps buy nothing and cost fast-tier budget (finding 6).
    for (const seed of [1, 137]) {
      const g = applied(generateTerrain(seed, cfg));
      for (let ty = 0; ty < GRID_H; ty++) {
        for (let tx = 0; tx < GRID_W; tx++) {
          const i = ty * GRID_W + tx;
          expect(g.distAt(tx, ty), `seed ${seed} distAt(${tx}, ${ty})`).toBe(g.ground.dist[i]);
          expect(g.distAt(tx, ty, true), `seed ${seed} ghost(${tx}, ${ty})`).toBe(g.ghost.dist[i]);
          expect(fieldDist(g.ground, tx, ty)).toBe(g.ground.dist[i]);
          const step = g.stepFrom(tx, ty);
          const n = g.ground.next[i];
          if (n < 0) expect(step).toBeNull();
          else expect(step).toEqual([n % GRID_W, (n / GRID_W) | 0]);
          expect(fieldStep(g.ground, tx, ty)).toEqual(step);
          // The ghost field too, which nothing in the repo reads (QA bug 1).
          const ghostStep = g.stepFrom(tx, ty, true);
          const gn = g.ghost.next[i];
          if (gn < 0) expect(ghostStep).toBeNull();
          else expect(ghostStep).toEqual([gn % GRID_W, (gn / GRID_W) | 0]);
          expect(fieldStep(g.ghost, tx, ty)).toEqual(ghostStep);
        }
      }
    }
  });

  it('leaves gatePath, the one in-file consumer of stepFrom, unchanged', () => {
    // `gatePath` walks `idx`/`stepFrom` from a gate to the Core and is what
    // fb036's path indicators draw. Its coordinates are integers by
    // construction; this pins that the guard did not shorten a single route.
    for (const seed of [1, 4, 11]) {
      const g = applied(generateTerrain(seed, cfg));
      for (const gate of GATES) {
        const path = g.gatePath(gate);
        expect(path.length, `seed ${seed} gate ${gate.key}`).toBeGreaterThan(1);
        expect(path[0]).toMatchObject({ tx: gate.tx, ty: gate.ty });
        const last = path[path.length - 1];
        expect(g.tile[last.ty * GRID_W + last.tx]).toBe(TileType.Core);
      }
    }
  });

  it('shows what the two write rows leave exposed, rather than asserting they are safe', () => {
    // Review Minor 2. The table calls `setOcc`/`setBreach` "refused at their
    // own call sites", which is true today — `buildTower` goes through
    // `buildable`, and `addStructure`/`removeStructure` take their coordinates
    // from there — and was prose with nothing behind it, which is the same
    // shape the previous review objected to over `distAt`. Over a *write* it
    // is worse than over a read: a read reports the wrong tile, a write
    // silently occupies one and re-routes the flow field around it.
    const g = applied(handMap([]));
    expect(g.occ[57]).toBe(0);
    g.setOcc(3, 1.5, 7);
    // Tile (21, 1), not (3, 1): `1.5 * GRID_W` cancels its own fraction.
    expect(g.idx(21, 1)).toBe(57);
    expect(g.occ[57]).toBe(7);
    expect(g.blocked[57]).toBe(1);
    expect(g.occ[g.idx(3, 1)]).toBe(0);
    g.setBreach(3, 1.5, 99);
    expect(g.breach[57]).toBe(99);
    // The exposure is real and it is call-site-owned: nothing in `src/` or
    // `tools/` reaches either write with a non-integer, because every path in
    // goes through `buildable`. Recorded here so that stays a checked claim.
    g.setOcc(3, 1.5, 0);
    g.setBreach(3, 1.5, 0);
  });

  it('records idx as an accepted case, and shows exactly what it costs', () => {
    // The one member on the list that is *not* guarded, recorded here rather
    // than in a comment so it is a decision with a test behind it.
    //
    // `idx` is `ty * GRID_W + tx` and nothing else. Every integer it can
    // return is a legal index into some array, so it has no spare value to
    // mean "no such tile" — `-1` would be a new contract, and its callers
    // (`world.ts:445/598/613/651/682`, `enemies.ts:1073`,
    // `render/canvas.ts:491`, and `gatePath` here) index arrays with the
    // result directly, so a sentinel would turn a silent alias into a silent
    // `undefined` read one line later. `world.ts:613` is already covered from
    // the other side — it sits behind `grid.passable(nx, ny)`, which refuses a
    // non-integer — and `tools/fuzz-command-domain.ts:578` is the one caller
    // that passes something odd on purpose: an out-of-grid *integer*, probing
    // b007's aliasing, which a non-integer guard would not touch either way.
    // Throwing is the only refusal that fits, and it would put a
    // per-tile `Number.isInteger` in the renderer's tile loop to catch
    // coordinates that are integers at every live call site.
    //
    // The real fix is at those call sites, which are outside this lane's
    // Scope; they are named in the Log for the merge. What this test does is
    // make the exposure explicit rather than leaving it as an unexamined
    // exemption.
    const g = applied(handMap([[3, 1, TerrainKind.Rock]]));
    expect(g.idx(3, 1)).toBe(1 * GRID_W + 3);
    // The alias, stated as an assertion so nobody has to re-derive it: a
    // fractional ty produces a legal index for a different tile.
    expect(g.idx(3, 1.5)).toBe(57);
    expect(Number.isInteger(g.idx(3, 1.5))).toBe(true);
    expect(g.idx(3, 1.5)).not.toBe(g.idx(3, 1));
    // A fractional tx does not alias — it produces a non-integer index, which
    // reads `undefined` out of every array the callers index with it.
    expect(Number.isInteger(g.idx(3.5, 1))).toBe(false);
    expect(g.tile[g.idx(3.5, 1)]).toBeUndefined();
    // And out-of-grid integers alias one row up, which is b007's original
    // finding and is guarded at `World.structureAt` rather than here.
    expect(g.idx(3 + GRID_W, 0)).toBe(g.idx(3, 1));
  });
});
