/**
 * SPEC-FINAL §10.5 (fb064o): how far a walker actually travels from a gate to
 * the Core.
 *
 * Every other measurement in this module bounds *area* — how much of the arena
 * is walkable, buildable, reachable. None of them bounds *travel*, and travel
 * is the terrain property the waves are tuned against: an enemy's contribution
 * to a wave is its time-to-Core, so a seed whose rock happens to lie across a
 * gate main can hand a run a materially longer approach than the flat arena the
 * numbers were tuned on without failing a single band.
 *
 * ## The metric is the sim's, not `analyze.ts`'s
 *
 * `analyze.ts` is deliberately 4-connected, because a 4-connected path is
 * always a real path and so a *reachability* answer can never be optimistic.
 * That same conservatism is wrong for a length: a 4-connected walk pays two
 * orthogonal steps for every diagonal the walker actually takes, so it would
 * report an approach far longer than the one the sim runs, and by a different
 * factor on the flat baseline (almost all diagonal) than on a rocky seed. So
 * this file mirrors `Grid.dijkstra` instead: 8-connected, `ORTHO_COST` /
 * `DIAG_COST`, and no corner cutting — a diagonal step needs both orthogonals
 * open.
 *
 * The step costs are duplicated rather than imported because `grid.ts` does not
 * export them; they are pinned against `Grid`'s own field by
 * `tests/terrain-approach.test.ts`, which builds a real `Grid` over a generated
 * map and asserts the two agree tile for tile. That test is the contract — if
 * `Grid` ever reprices a step, it goes red here rather than drifting silently.
 *
 * ## What this deliberately does not model
 *
 * Structures. `Grid`'s ground field prices a tower tile at `breachBase + …`, so
 * a real run's approach depends on what the player built; a *terrain*
 * measurement must not. The field here is the empty board — terrain only —
 * which is exactly the quantity a generation constraint can hold.
 *
 * ## Layering
 *
 * This file sits *below* `analyze.ts`, which imports `maxGateDetour` for the
 * band. That is why it re-derives its own gate indices from `GATES` instead of
 * importing `analyze`'s one-line `gateIndices` — a mutual import between the
 * two would be a cycle, and the duplicated line is `g.ty * map.w + g.tx`.
 */
import { GATES } from '../grid';
import { isWalkable, type TerrainConfig } from './config';
import type { TerrainGrid } from './types';

/** `Grid`'s orthogonal step cost. Mirrored, and pinned by test. */
export const PATH_ORTHO_COST = 10;
/** `Grid`'s diagonal step cost. Mirrored, and pinned by test. */
export const PATH_DIAG_COST = 14;

const NEIGHBORS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, PATH_ORTHO_COST],
  [-1, 0, PATH_ORTHO_COST],
  [0, 1, PATH_ORTHO_COST],
  [0, -1, PATH_ORTHO_COST],
  [1, 1, PATH_DIAG_COST],
  [1, -1, PATH_DIAG_COST],
  [-1, 1, PATH_DIAG_COST],
  [-1, -1, PATH_DIAG_COST],
];

/**
 * Path cost from the nearest of `sources` to every tile, `-1` where no walk
 * exists. Units are `Grid`'s: `PATH_ORTHO_COST` per orthogonal step.
 *
 * Dial's algorithm over a sparse bucket array. The bucket index is bounded
 * rather than grown: no shortest path visits a tile twice, so no cost can
 * exceed `w * h * PATH_DIAG_COST`. Sources outside the grid or on non-walkable
 * tiles are skipped, not thrown on — a Core footprint terrain made unwalkable
 * is a legitimate question ("how far is it?" → "there is no path"), and the
 * caller's `-1`s are the answer.
 */
export function approachField(
  map: TerrainGrid,
  cfg: TerrainConfig,
  sources: readonly number[],
): Int32Array {
  const n = map.w * map.h;
  const dist = new Int32Array(n).fill(-1);
  const maxCost = n * PATH_DIAG_COST;
  const buckets = new Map<number, number[]>();
  let live = 0;
  const push = (c: number, i: number): void => {
    let b = buckets.get(c);
    if (b === undefined) {
      b = [];
      buckets.set(c, b);
    }
    b.push(i);
    live++;
  };
  const walkable = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < map.w && y < map.h && isWalkable(cfg, map.kind[y * map.w + x]);

  for (const s of sources) {
    if (!Number.isInteger(s) || s < 0 || s >= n) continue;
    if (dist[s] === 0) continue;
    if (!isWalkable(cfg, map.kind[s])) continue;
    dist[s] = 0;
    push(0, s);
  }

  for (let c = 0; c <= maxCost && live > 0; c++) {
    const b = buckets.get(c);
    if (b === undefined) continue;
    buckets.delete(c);
    for (const i of b) {
      live--;
      if (dist[i] !== c) continue; // stale entry, already relaxed cheaper
      const x = i % map.w;
      const y = (i / map.w) | 0;
      for (let k = 0; k < NEIGHBORS.length; k++) {
        const dx = NEIGHBORS[k][0];
        const dy = NEIGHBORS[k][1];
        const nx = x + dx;
        const ny = y + dy;
        if (!walkable(nx, ny)) continue;
        // No corner cutting, exactly as `Grid.dijkstra`: a diagonal step needs
        // both orthogonals open, so a path measured here is one a walker can
        // actually take rather than a squeeze between two rock corners.
        if (dx !== 0 && dy !== 0 && (!walkable(nx, y) || !walkable(x, ny))) continue;
        const ni = ny * map.w + nx;
        const nc = c + NEIGHBORS[k][2];
        if (dist[ni] >= 0 && dist[ni] <= nc) continue;
        dist[ni] = nc;
        push(nc, ni);
      }
    }
  }
  // The `c <= maxCost` bound holds because this file models no surcharges — but
  // `grid.ts` abandoned exactly this counting loop when breach pricing pushed
  // costs "far past the old n × DIAG bound", and the failure mode there would
  // be a silently truncated field here. Throw rather than return a short answer
  // a band would then read as unreachable ground.
  if (live > 0) {
    throw new Error(`approachField: queue not drained at cost ${maxCost}; ${live} entries left`);
  }
  return dist;
}

/**
 * fb064o: the approach every wave is balanced against — per-gate path cost to a
 * 2x2 Core, plus the summary a generation band can be written on.
 *
 * `perGate` is in `GATES` order and holds `-1` for a gate with no walk to the
 * Core, which is the honest answer and not an error: `terrainLegal` already
 * refuses such a map through `gatesConnected`, and this measurement also runs
 * on hand-built grids in tests.
 *
 * `min`/`mean`/`max`/`spread` are `-1` unless **every** gate reached — not
 * summaries over whatever subset did. Summarising the subset is the tempting
 * version and it is a trap: a map where two of three gates are walled off
 * reports a real `min`, a real `max`, and a `spread` of `0`, which reads as
 * "perfectly even gates" to a caller who forgot to check `allReachable`. The
 * per-gate `-1`s carry that information already; these four are the summary,
 * and a summary of a broken map is `-1`.
 */
export interface ApproachMeasure {
  /** The Core anchor measured to, flat index of its top-left tile. */
  readonly anchor: number;
  /** Path cost from each gate, in `GATES` order; `-1` = no walk. */
  readonly perGate: readonly number[];
  /** Did every gate reach the Core? */
  readonly allReachable: boolean;
  /** Shortest, mean and longest gate approach over the reachable gates. */
  readonly min: number;
  readonly mean: number;
  readonly max: number;
  /** `max - min`: how unevenly the gates are placed against this Core. */
  readonly spread: number;
}

/**
 * Path cost from every gate to the `coreW * coreH` Core footprint at `anchor`.
 *
 * The field floods *out of the Core*, one pass for all gates, which is both
 * cheaper than a flood per gate and the same quantity `Grid`'s ground field
 * holds. Cost is symmetric here — every step price is the same in both
 * directions and there is no one-way rule — so "gate → Core" and "Core → gate"
 * are the same number.
 *
 * An `anchor` that is off-grid, or whose footprint leaves the board, yields all
 * `-1`: no footprint tile becomes a source. Whether the anchor is a *legal*
 * Core position is `validateCorePlacement`'s question, not this one's.
 */
export function measureApproach(
  map: TerrainGrid,
  cfg: TerrainConfig,
  anchor: number,
  coreW: number,
  coreH: number,
): ApproachMeasure {
  const sources: number[] = [];
  if (Number.isInteger(anchor) && anchor >= 0 && anchor < map.w * map.h) {
    const tx = anchor % map.w;
    const ty = (anchor / map.w) | 0;
    if (tx + coreW <= map.w && ty + coreH <= map.h) {
      for (let dy = 0; dy < coreH; dy++) {
        for (let dx = 0; dx < coreW; dx++) sources.push((ty + dy) * map.w + (tx + dx));
      }
    }
  }
  const dist = approachField(map, cfg, sources);
  const perGate = GATES.map((g) => {
    const gi = g.ty * map.w + g.tx;
    return gi >= 0 && gi < dist.length ? dist[gi] : -1;
  });
  const reached = perGate.filter((d) => d >= 0);
  const allReachable = GATES.length > 0 && reached.length === GATES.length;
  if (!allReachable) {
    return { anchor, perGate, allReachable, min: -1, mean: -1, max: -1, spread: -1 };
  }
  let min = reached[0];
  let max = reached[0];
  let sum = 0;
  for (const d of reached) {
    if (d < min) min = d;
    if (d > max) max = d;
    sum += d;
  }
  return { anchor, perGate, allReachable, min, mean: sum / reached.length, max, spread: max - min };
}

/**
 * fb064o: the obstacle-free cost of the same walk — the octile distance from
 * `(gx, gy)` to the nearest tile of the Core footprint at `anchor`.
 *
 * Exactly what an 8-connected walker would pay on an empty board, so it is a
 * true lower bound on `measureApproach`'s numbers: `min(dx,dy)` diagonal steps
 * at `PATH_DIAG_COST` and the remainder orthogonal. Obstacles and the
 * no-corner-cutting rule can only make the real walk longer, never shorter.
 *
 * Arguments are not validated, because this is arithmetic with no map to check
 * them against: a non-integer or off-grid `anchor` gives `NaN`, and a
 * non-positive `coreW`/`coreH` gives `Infinity` (the empty `min` over no
 * footprint tile). `maxGateDetour` — the only caller that can be handed such a
 * value — refuses both rather than dividing by them.
 */
export function freeApproachCost(
  gx: number,
  gy: number,
  anchor: number,
  w: number,
  coreW: number,
  coreH: number,
): number {
  const tx = anchor % w;
  const ty = (anchor / w) | 0;
  let best = Infinity;
  for (let dy = 0; dy < coreH; dy++) {
    for (let dx = 0; dx < coreW; dx++) {
      const ax = Math.abs(gx - (tx + dx));
      const ay = Math.abs(gy - (ty + dy));
      const lo = ax < ay ? ax : ay;
      const hi = ax < ay ? ay : ax;
      const c = lo * PATH_DIAG_COST + (hi - lo) * PATH_ORTHO_COST;
      if (c < best) best = c;
    }
  }
  return best;
}

/**
 * fb064o: **the** number the approach band is written on — the worst gate's
 * *detour factor*, its real path cost over the obstacle-free cost of the same
 * walk. `1` means the gate walks straight in; `1.5` means terrain adds half the
 * journey again.
 *
 * The ratio, not the raw cost, is what a generation constraint can hold. A raw
 * gate-to-Core cost is jointly decided by terrain *and* by where the Core ends
 * up, and the Core is the player's to place (`legalCoreAnchors` spans most of
 * the arena), so banding it would refuse seeds for a choice the generator does
 * not make. Dividing the Core's contribution out leaves a pure terrain
 * property — and it gives the flat arena, the map every wave was actually
 * tuned on, a baseline of exactly `1.000000` on every gate.
 *
 * **The band this feeds is anchor-specific, and that is a real limit.** It is
 * measured to `suggestCoreAnchor`'s pick, so a map inside the band guarantees
 * nothing about the *other* legal anchors — and the Core is the player's to
 * place (fb064c). Measured over seeds 1..120 of shipped, band-passing maps:
 * 104 of 120 admit some legal anchor above the 1.5 band, the worst-over-all-
 * anchors detour averages 2.196 against 1.099 at the suggested anchor, and the
 * worst is 4.969 (seed 115, anchor tile 24,1). Inert today — nothing places a
 * Core yet — but fb064c/fb064h wire it, so the number is recorded here and in
 * BACKLOG-TERRAIN.md's Log rather than rediscovered at the merge.
 *
 * Returns `-1` when the answer is not a detour at all: an off-grid anchor, or
 * any gate with no walk to the Core. `terrainLegal` refuses that value rather
 * than treating an unmeasurable map as a straight-line one — and since a real
 * detour is always `>= 1`, `-1` cannot collide with one.
 *
 * A gate standing *on* the Core footprint would divide by a zero free cost;
 * `coreGateClearance` makes that unreachable for a legal anchor, but this is
 * also run on hand-built grids, so it reports `-1` rather than `Infinity`.
 */
export function maxGateDetour(
  map: TerrainGrid,
  cfg: TerrainConfig,
  anchor: number,
  coreW: number,
  coreH: number,
): number {
  const m = measureApproach(map, cfg, anchor, coreW, coreH);
  if (!m.allReachable) return -1;
  let worst = -1;
  for (let g = 0; g < GATES.length; g++) {
    const free = freeApproachCost(GATES[g].tx, GATES[g].ty, anchor, map.w, coreW, coreH);
    // `<= 0` catches a gate standing on the Core footprint (a zero divisor);
    // `!isFinite` catches both `NaN` (off-grid anchor) and `Infinity` (an empty
    // footprint), the second of which a bare `free > 0` waves through and then
    // reports as a ratio of 0 — below the `>= 1` invariant `types.ts` states.
    if (!Number.isFinite(free) || free <= 0) return -1;
    const ratio = m.perGate[g] / free;
    if (ratio > worst) worst = ratio;
  }
  return worst;
}
