/**
 * fb065b — is the pre-highlighted Core anchor a *good* default?
 *
 * fb064h pins that `suggestCoreAnchor` returns a legal anchor and the same one
 * for the same seed, and fb064o bounds the gate detour *to* it. Neither says
 * anything about quality: legal-and-deterministic is satisfied by an anchor
 * jammed in a corner behind a rock shelf with four buildable tiles around it,
 * which is the suggestion most players will simply accept.
 *
 * So this file measures the properties a default has to have, over seeds
 * 1..500, against the flat arena as the control:
 *
 *   - `centroidDist` — how far the Core centre sits from the walkable
 *     centroid.
 *   - `buildRoom` — buildable-**normal** tiles within the base `buildRange`
 *     from `data/towers.json`, footprint excluded.
 *   - `gateDist` — Chebyshev distance from the footprint to the nearest spawn
 *     gate, the metric `coreGateClearance` is written in.
 *   - `displacement` — how far the pick is from `CORE_X/CORE_Y`, which is the
 *     quantity `suggestCoreAnchor` actually minimises.
 *
 * Re-measured whole at fb166's 56x32 resize — every number in this file moved,
 * because `CORE_X/CORE_Y` (still the pre-resize (25,9); moving it is fb064c's
 * job, logged in BACKLOG-TERRAIN.md) is no longer near the centre of a bigger
 * arena, so far fewer seeds find it legal at all.
 *
 * **The verdict: an accepted band, not a changed selection.** The rule
 * optimises fidelity to the tuned spot on purpose — `analyze.ts` says why, and
 * where the Core sits relative to each gate is what every wave's travel time is
 * tuned against, i.e. a balance order, which is not this lane's to take.
 * Measured, that rule is doing its job on the population it can still reach:
 * **327 of 500 seeds** (not 432 — the smaller arena-relative footprint of the
 * old anchor is the resize's own cost) put the default on `CORE_X/CORE_Y`
 * exactly, no seed moves it further than 3 tiles, and the two properties the
 * flat arena's own tuning fixed come back close to it — mean `centroidDist`
 * 6.0853 against the flat 6.3051 and mean `gateDist` 8.7300 against the flat 9.
 * `buildRoom` is the one that drops, 39.35 against the flat 48, and the cause
 * is the terrain rather than the selection: holding the anchor fixed at
 * (25,9) on the same 500 maps scores 39.2240, *below* what the rule picks, so
 * the fall is the rough and rock inside the build radius and not where the
 * Core went. (On 327 of those 500 the fixed anchor *is* the pick, so the whole
 * 0.122 gap is earned on the 173 seeds where (25,9) is illegal and the rule had
 * to choose — the only population where the two can differ at all.) The
 * centroid figure decomposes the same way: fixed (25,9) measures 6.1241 on
 * these maps, so the pick sits nearer the centroid than the fixed reading by
 * 0.039, and the flat control itself (6.3051) is a further step beyond that.
 *
 * **"The share of seeds where a strictly better anchor exists" needs a
 * direction before it means anything, and the obvious direction is the one this
 * lane may not take.** Score "more central" and "further from a gate" as
 * monotonically better and the answer is **486/500** — and the proof that this
 * says nothing about the rule is the control, not an argument about relocation:
 * run the same measure on the **flat arena**, where the Core sits on the spot
 * every wave was tuned on, and the authored anchor is dominated by **42 of the
 * 1425 legal anchors** — a much bigger legal set than the pre-resize arena's
 * 498, because a flat 56x32 interior offers far more gate-clearance-legal
 * ground than a flat 36x20 one did — with a Pareto front sitting on the same
 * column as the authored anchor (`x=25`) spanning `y=10..20`, i.e. toward the
 * taller arena's own vertical centre. A measure that condemns the
 * hand-authored ideal is measuring the objective, not the rule. That control is
 * not *commensurable* with the 486/500 on its own — 42-of-1425 is a share of
 * anchors on one map, 486/500 a share of seeds — so the seed-wise version is
 * recorded beside it: on **327** of the 500 seeds where the authored (25,9) is
 * legal, that anchor is dominated on **313** of them, by a mean of **20.3**
 * anchors against **24.2** at the pick. The measure calls the tuned spot a bad
 * default on most maps that offer it, though no longer literally every one — a
 * change from the pre-resize reading, and re-measured rather than inherited.
 * (The tempting argument — "every seed has a more central anchor somewhere" —
 * does not even entail the number: dominance needs `>=` on all three
 * properties, so a more central anchor with less room is not a dominator. What
 * those 42 have in common is measured rather than guessed: every one carries
 * the maximum `buildRoom` of 48, so each wins on centrality, on gate distance,
 * or on both. The gate-distance histogram is `9:11, 10:11, 11:9, 12:7, 13:4`,
 * so 31 of the 42 do improve on the authored `gateDist` of 9. The histogram is
 * asserted with the count, so the claim cannot go false in prose again.)
 *
 * So both readings are recorded, and neither is left to stand alone:
 *
 *   1. **Monotone** — more central, more room, further from a gate. 486/500
 *      outright; **16/500** among anchors no further from `CORE_X/CORE_Y` than
 *      the pick (improvements available without moving the Core off the tuned
 *      spot). All sixteen win on `centroidDist`, i.e. by the term that carries
 *      the disqualifier above; five of them (68, 246, 346, 360, 500) win on
 *      *nothing else*, and six (96, 160, 240, 241, 321, 327) add a tile of gate
 *      distance alongside room.
 *   2. **Fidelity** — closer to the flat control's own readings on
 *      `centroidDist` and `gateDist`, more room. This is the ordering the
 *      file's frame actually implies. 201/500 outright, and **13/500** free
 *      (seed 6 is the largest single gain: the pick sits 1.4884 off the flat
 *      centroid distance, a legal alternative sits 0.7365 off it and carries 2
 *      more build tiles).
 *
 * **Both "free" figures are shares of a much smaller population than /500
 * suggests, and reading them as a few percent overstates the rule.** The pick
 * is a minimiser of `displacement` over the same anchor list — not the unique
 * one, which is the whole point — so the "no further from `CORE_X/CORE_Y`"
 * filter is exactly an equality: only a *tie* on the primary key can ever
 * produce a free dominator. There are **72 tie seeds in 500** (up from 24
 * pre-resize — a bigger arena offers more anchors at the same minimal
 * displacement). So the monotone 16 is 16 of 72 — 22% of the population the
 * measure can reach, close to the pre-resize 21% — and the fidelity 13 is 13 of
 * 72, a much larger share of its reachable population than the pre-resize
 * reading (1 of 24, 4%). What is small is the tie set, not the rule's error
 * rate on it. The two readings overlap on 8 of their seeds this time (6, 68,
 * 103, 119, 246, 346, 360, 500) rather than being wholly disjoint — a change
 * from the pre-resize measurement, and re-measured rather than assumed to
 * still hold; which anchor is "better" is still not decidable here without a
 * balance decision.
 *
 * **What changing the tie-break would buy, measured by running the change
 * rather than by reasoning about it.** Buy, over the 500-seed sample:
 * `buildRoom` +18 tiles (across the 16 free seeds), `centroidDist` −18.9198
 * tiles, `gateDist` +7. (Pre-resize this read `+5` / `−10.2894` / `+1` on 5
 * free seeds; the resize roughly tripled the reachable population, and the
 * gains scaled with it.)
 *
 * **What it would cost is illustrated below rather than re-derived as a
 * cross-file sweep this time.** The pre-resize file measured the cost by
 * swapping `coreAnchorRoom`'s ring for a `buildRange`-4 disc in `analyze.ts`
 * and re-running the whole terrain suite in a worktree — a change to a file
 * outside this lane's test-only Scope for the resize pass, so it is not
 * repeated here. What *is* re-measured is a concrete, load-bearing instance of
 * the same claim, using only the tools this file already has: seed **15811**
 * (below) has two anchors tied on `suggestCoreAnchor`'s primary key with
 * *different* `coreAnchorRoom` scores, and the tie-break's actual behaviour —
 * take the anchor with more room — happens to be the one that keeps the map
 * legal. An index-only tie-break (take the lowest-indexed tied anchor, which
 * is what `coreAnchorRoom` degenerates to when every tied anchor scores the
 * same) would have picked the other one and pushed the seed onto the retry
 * path instead. `ROOM_RADIUS`'s own doc block is right that this tie-break
 * feeds `terrainLegal`; a full cross-file re-derivation of the disc-metric
 * swap's blast radius is left for whoever next changes `coreAnchorRoom`, since
 * that is the point in time it is worth paying for again.
 *
 * Every reading here is of the base three-gate arena (`GATES`). fb077's Fourth
 * Gate modifier threads a four-gate list through generation and measurement, so
 * a run under it has a different legal set and a different suggestion; that is
 * a modifier's job and is out of this ledger's population by choice.
 *
 * Every number below was measured at fb065b against shipped `/data`. A change
 * to `data/terrain.json`, to `data/towers.json`'s `buildRange`, to the
 * generator or to `suggestCoreAnchor` is expected to move them; that is the
 * point. Re-measure and re-record, never relax.
 */

import { describe, expect, it } from 'vitest';

import towersRaw from '../data/towers.json';
import { CORE_H, CORE_W, CORE_X, CORE_Y } from '../src/sim/grid';
import {
  flatTerrain,
  gateDistance,
  generateTerrain,
  isBuildable,
  legalCoreAnchors,
  loadTerrain,
  maxGateDetour,
  suggestCoreAnchor,
  TerrainKind,
  walkableFlood,
  gateIndices,
  type TerrainGrid,
} from '../src/sim/terrain';
// From the submodule, not the barrel: `index.ts` is documented as the public
// surface and `coreAnchorRoom` is a tie-break internal this file measures
// through — the same reach `terrain-describe.test.ts` makes for `HEADER_KEYS`.
import { coreAnchorRoom } from '../src/sim/terrain/analyze';

const cfg = loadTerrain();

/** Seeds 1..500 — the window the acceptance names. */
const SEEDS = Array.from({ length: 500 }, (_, i) => i + 1);

/**
 * The base build radius, read from `/data` rather than written here.
 *
 * Pinned at 4 immediately below: every `buildRoom` number in this file was
 * measured at that radius, so a `towers.json` retune must re-measure them
 * rather than quietly re-baseline the ledger. The *effective* radius in a real
 * run is usually larger — `classes.json`'s Engineer passive adds +2 and
 * `tree.json` node 22 adds +1, which is the reading fb064m established — so the
 * ledger also records the room at radii 5, 6 and 7 without asserting floors on
 * them. Base is what the acceptance asks for; the rest is what a player sees.
 */
const BUILD_RANGE = towersRaw.buildRange;
const EXTRA_RADII = [5, 6, 7] as const;

/** The flat arena's own readings — the control every "fidelity" term is against. */
const FLAT_CENTROID_DIST = 6.305083572574165;
const FLAT_GATE_DIST = 9;

interface Quality {
  /** Euclidean distance from the Core's centre to the walkable centroid. */
  centroidDist: number;
  /** Buildable-normal tiles within `BUILD_RANGE` of the centre, footprint excluded. */
  buildRoom: number;
  /** Chebyshev distance from the footprint to the nearest spawn gate. */
  gateDist: number;
  /** Euclidean distance from the anchor to `CORE_X/CORE_Y`. */
  displacement: number;
}

const PROPS = ['centroidDist', 'buildRoom', 'gateDist', 'displacement'] as const;
type Prop = (typeof PROPS)[number];

/**
 * The centroid of the tiles a ground walker can actually reach from a gate —
 * not of every walkable tile.
 *
 * The distinction is `sealPockets`' leftovers: a walkable pocket ringed by rock
 * is walkable and is no part of the arena a run is played in, so including it
 * would drag the centroid toward terrain no enemy ever stands on.
 */
function walkableCentroid(map: TerrainGrid): readonly [number, number] {
  const seen = walkableFlood(map, cfg, gateIndices(map));
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let i = 0; i < seen.length; i++) {
    if (!seen[i]) continue;
    sx += (i % map.w) + 0.5;
    sy += ((i / map.w) | 0) + 0.5;
    n++;
  }
  return [sx / n, sy / n];
}

/**
 * Tiles within `r` of the Core's centre that a tower could stand on, footprint
 * excluded. `normalOnly` picks the metric:
 *
 *   - `true` (the ledger's `buildRoom`) counts `TerrainKind.Normal` only,
 *     because that is the phrase the acceptance uses.
 *   - `false` counts everything `data/terrain.json` marks buildable, which
 *     **includes high ground** (`high.buildable: true`, and `Grid.buildable`
 *     agrees) — so it is the count a player's build ghost actually offers.
 *
 * The two differ by more than a rounding: mean 36.06 against 38.44, and the
 * `buildRoom`-worst seed 411 carries 23 buildable tiles against its 15 normal
 * ones. Both are recorded below; only the first is floored, so a reader is
 * never handed the narrow number as if it were what the game allows.
 *
 * The distance metric is `towers.ts`' `inBuildRange` — squared Euclidean
 * between tile centres — deliberately, not a Chebyshev ring: a count that did
 * not match the rule the game builds by would be measuring a different arena
 * than the player plays in. It is measured from the Core's centre while the
 * game measures from the Warden's position, which is a proxy and is the point:
 * it asks how much build room the Core *has*, not where the player stands.
 */
function buildRoomAt(map: TerrainGrid, tx: number, ty: number, r: number, normalOnly = true): number {
  const cx = tx + CORE_W / 2;
  const cy = ty + CORE_H / 2;
  let n = 0;
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(map.h - 1, Math.ceil(cy + r));
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(map.w - 1, Math.ceil(cx + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const k = map.kind[y * map.w + x];
      if (normalOnly ? k !== TerrainKind.Normal : !isBuildable(cfg, k)) continue;
      if (x >= tx && x < tx + CORE_W && y >= ty && y < ty + CORE_H) continue;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r) n++;
    }
  }
  return n;
}

function qualityAt(map: TerrainGrid, anchor: number, centroid: readonly [number, number]): Quality {
  const tx = anchor % map.w;
  const ty = (anchor / map.w) | 0;
  // `gateDistance` is imported rather than re-derived: it is the very function
  // `legalCoreAnchors` applies `coreGateClearance` with, and the floor below
  // rests on this measurement agreeing with that rule. A hand-copy here is the
  // fb064v shape — a mirror that drifts and takes its assertions with it.
  let gateDist = Infinity;
  for (let dy = 0; dy < CORE_H; dy++) {
    for (let dx = 0; dx < CORE_W; dx++) {
      const d = gateDistance(tx + dx, ty + dy);
      if (d < gateDist) gateDist = d;
    }
  }
  return {
    centroidDist: Math.hypot(tx + CORE_W / 2 - centroid[0], ty + CORE_H / 2 - centroid[1]),
    buildRoom: buildRoomAt(map, tx, ty, BUILD_RANGE),
    gateDist,
    displacement: Math.hypot(tx - CORE_X, ty - CORE_Y),
  };
}

/**
 * The monotone ordering: more central, more room, further from a gate, strictly
 * better on one. The literal reading of the acceptance's "strictly better".
 *
 * `displacement` is deliberately not a term — it is the rule's own objective,
 * and including it would make the measure report zero by construction. It is
 * used as a *filter* instead, in the free-improvement sweep.
 */
function dominatesMonotone(q: Quality, p: Quality): boolean {
  return (
    q.centroidDist <= p.centroidDist &&
    q.buildRoom >= p.buildRoom &&
    q.gateDist >= p.gateDist &&
    (q.centroidDist < p.centroidDist || q.buildRoom > p.buildRoom || q.gateDist > p.gateDist)
  );
}

/**
 * The fidelity ordering: *nearer the flat control's readings* on the two
 * properties the flat arena's tuning fixed, plus more room.
 *
 * `buildRoom` keeps its monotone direction because it has no tuned target to
 * miss — the flat arena's 48 is the maximum any anchor can reach, so "closer to
 * the control" and "more" are the same statement for it.
 */
function dominatesFidelity(q: Quality, p: Quality): boolean {
  const dev = (v: number, base: number): number => Math.abs(v - base);
  const qc = dev(q.centroidDist, FLAT_CENTROID_DIST);
  const pc = dev(p.centroidDist, FLAT_CENTROID_DIST);
  const qg = dev(q.gateDist, FLAT_GATE_DIST);
  const pg = dev(p.gateDist, FLAT_GATE_DIST);
  return qc <= pc && q.buildRoom >= p.buildRoom && qg <= pg && (qc < pc || q.buildRoom > p.buildRoom || qg < pg);
}

/**
 * The anchors tied with the pick on `suggestCoreAnchor`'s primary key — squared
 * distance from `CORE_X/CORE_Y`. The only set a tie-break can choose within,
 * and therefore the only population the "free improvement" measures can reach.
 */
function tieSet(map: TerrainGrid, anchors: readonly number[]): number[] {
  const d2 = (a: number): number => {
    const x = a % map.w;
    const y = (a / map.w) | 0;
    return (x - CORE_X) ** 2 + (y - CORE_Y) ** 2;
  };
  const min = Math.min(...anchors.map(d2));
  return anchors.filter((a) => d2(a) === min);
}

interface Row {
  seed: number;
  anchor: number;
  q: Quality;
  extraRoom: readonly number[];
  buildableRoom: number;
  fellBack: boolean;
  /** Anchors dominating the pick outright / at no greater displacement. */
  monoAll: number;
  monoFree: number;
  fidAll: number;
  fidFree: number;
  /** The free monotone dominator's gain per axis, summed over the seed. */
  gainRoom: number;
  gainCentroid: number;
  gainGate: number;
  /** How many anchors tie with the pick on the primary key (1 = no tie). */
  tieCount: number;
  /** Did the tie-break move the pick off the lowest-index tied anchor? */
  tieMoved: boolean;
  /** Does the pick carry the maximum `coreAnchorRoom` over its tie set? */
  tieTakesMaxRoom: boolean;
  /** Is the pick a member of the tie set this file derived? */
  pickInTieSet: boolean;
  /** `buildRoom` and `centroidDist` at the fixed authored anchor, same map. */
  fixedRoom: number;
  fixedCentroidDist: number;
  fixedLegal: boolean;
  /** Anchors dominating the *fixed* authored anchor, when it is legal. */
  fixedDominators: number;
}

/**
 * The sweep, lazy and memoised.
 *
 * Not a module-level `const`: `tests/terrain-band-ledger.test.ts` records this
 * as a prior review finding, and the reason is worth repeating. A sweep at
 * collection time is paid in full by `vitest -t` on a single test, and anything
 * that throws inside it surfaces as a *file collection error* that takes every
 * test in the file with it — including the flat-arena control that would have
 * named the cause. Nothing in here throws for that reason either: a null anchor
 * or a fallback map is counted and asserted by a test, not raised in the loop.
 */
/**
 * How many legal anchors dominate the *authored* `CORE_X/CORE_Y` anchor on this
 * map — the seed-wise control for the header's 500/500. Zero when that anchor
 * is not legal here, which the caller reads together with `fixedLegal`.
 */
function fixedDominators(
  map: TerrainGrid,
  anchors: readonly number[],
  centroid: readonly [number, number],
): number {
  const fixed = CORE_Y * map.w + CORE_X;
  if (!anchors.includes(fixed)) return 0;
  const p = qualityAt(map, fixed, centroid);
  let n = 0;
  for (const a of anchors) {
    if (a === fixed) continue;
    if (dominatesMonotone(qualityAt(map, a, centroid), p)) n++;
  }
  return n;
}

let cached: Row[] | null = null;

function rows(): Row[] {
  if (cached) return cached;
  const out: Row[] = [];
  for (const seed of SEEDS) {
    const map = generateTerrain(seed, cfg);
    const anchors = legalCoreAnchors(map, cfg);
    const anchor = suggestCoreAnchor(map, cfg, anchors);
    if (anchor === null) continue;
    const centroid = walkableCentroid(map);
    const tx = anchor % map.w;
    const ty = (anchor / map.w) | 0;
    const q = qualityAt(map, anchor, centroid);
    let monoAll = 0;
    let monoFree = 0;
    let fidAll = 0;
    let fidFree = 0;
    let gainRoom = 0;
    let gainCentroid = 0;
    let gainGate = 0;
    for (const a of anchors) {
      if (a === anchor) continue;
      const other = qualityAt(map, a, centroid);
      // `<=` and not `<`: it can only ever hold with equality, since
      // `suggestCoreAnchor` minimises displacement over this same list, and it
      // is written as an inequality so the filter still reads correctly if the
      // primary key ever changes.
      const free = other.displacement <= q.displacement;
      if (dominatesMonotone(other, q)) {
        monoAll++;
        if (free) {
          monoFree++;
          gainRoom += other.buildRoom - q.buildRoom;
          gainCentroid += q.centroidDist - other.centroidDist;
          gainGate += other.gateDist - q.gateDist;
        }
      }
      if (dominatesFidelity(other, q)) {
        fidAll++;
        if (free) fidFree++;
      }
    }
    const ties = tieSet(map, anchors);
    const maxTieRoom = Math.max(...ties.map((a) => coreAnchorRoom(map, a % map.w, (a / map.w) | 0)));
    out.push({
      seed,
      anchor,
      q,
      tieCount: ties.length,
      tieMoved: ties.length > 1 && anchor !== ties[0],
      tieTakesMaxRoom: coreAnchorRoom(map, tx, ty) === maxTieRoom,
      pickInTieSet: ties.includes(anchor),
      fixedRoom: buildRoomAt(map, CORE_X, CORE_Y, BUILD_RANGE),
      fixedCentroidDist: Math.hypot(CORE_X + CORE_W / 2 - centroid[0], CORE_Y + CORE_H / 2 - centroid[1]),
      fixedLegal: anchors.includes(CORE_Y * map.w + CORE_X),
      fixedDominators: fixedDominators(map, anchors, centroid),
      extraRoom: EXTRA_RADII.map((r) => buildRoomAt(map, tx, ty, r)),
      buildableRoom: buildRoomAt(map, tx, ty, BUILD_RANGE, false),
      fellBack: map.fallback,
      monoAll,
      monoFree,
      fidAll,
      fidFree,
      gainRoom,
      gainCentroid,
      gainGate,
    });
  }
  cached = out;
  return out;
}

const fmt = (v: number): string => v.toFixed(4);

/** A true median: the mean of the two middles for an even sample. */
function median(vs: readonly number[]): number {
  const a = vs.slice().sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 === 1 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/**
 * min / mean / median / max with the argmin and argmax seed, as one string.
 *
 * The median is a distribution record and nothing here gates on it — CLAUDE.md's
 * measurement rules reserve means and pass-rates for the §14 gates, and none of
 * these properties is one.
 */
function ledgerRow(prop: Prop): string {
  const rs = rows();
  const vs = rs.map((r) => r.q[prop]);
  const lo = rs.reduce((a, b) => (b.q[prop] < a.q[prop] ? b : a));
  const hi = rs.reduce((a, b) => (b.q[prop] > a.q[prop] ? b : a));
  const mean = vs.reduce((a, b) => a + b, 0) / vs.length;
  return `min ${fmt(Math.min(...vs))} @${lo.seed} · mean ${fmt(mean)} · median ${fmt(median(vs))} · max ${fmt(Math.max(...vs))} @${hi.seed}`;
}

describe('fb065b — the suggested Core anchor is a measured default, not just a legal one', () => {
  it('pins the base build radius the room numbers were measured at', () => {
    // Not a tuning opinion: it is the statement that every `buildRoom` number
    // in this file is a reading at radius 4. A retune reddens here first, with
    // this comment, rather than silently re-baselining the ledger below.
    expect(BUILD_RANGE).toBe(4);
  });

  it('measures the population it claims to: 500 generated maps, no fallbacks', () => {
    // The guard the ledger's prose depends on. A `/data` retune that pushed a
    // seed onto the flat fallback would contribute flat-arena quality
    // (`buildRoom` 48, `displacement` 0) to every mean while the prose still
    // said "generated terrain", and a null anchor would shrink the sample
    // silently. Both are counted rather than thrown, so this is one red test
    // and not a collection error that deletes the other six.
    expect({
      measured: rows().length,
      requested: SEEDS.length,
      fellBack: rows().filter((r) => r.fellBack).length,
    }).toEqual({ measured: 500, requested: 500, fellBack: 0 });
  });

  it('records the flat arena as the control the tuned spot was authored on', () => {
    const flat = flatTerrain();
    const anchors = legalCoreAnchors(flat, cfg);
    const anchor = suggestCoreAnchor(flat, cfg, anchors);
    expect(anchor).not.toBeNull();
    const q = qualityAt(flat, anchor as number, walkableCentroid(flat));
    expect({
      anchor: `(${(anchor as number) % flat.w},${((anchor as number) / flat.w) | 0})`,
      centroidDist: fmt(q.centroidDist),
      buildRoom: q.buildRoom,
      gateDist: q.gateDist,
      displacement: fmt(q.displacement),
    }).toEqual({
      anchor: '(25,9)',
      centroidDist: '6.3051',
      buildRoom: 48,
      gateDist: 9,
      displacement: '0.0000',
    });
    // The two constants the fidelity ordering is written against are this
    // control, not hand-entered numbers that could drift away from it.
    expect(q.centroidDist).toBe(FLAT_CENTROID_DIST);
    expect(q.gateDist).toBe(FLAT_GATE_DIST);

    // And the control controls something: the monotone measure condemns the
    // hand-authored ideal too. On the flat arena — no terrain, the Core on the
    // spot every wave was tuned against — 42 of the 1425 legal anchors dominate
    // it. This is the assertion the header's "486/500 is vacuous" claim rests
    // on, and it is a measurement rather than an argument about relocation.
    let dominators = 0;
    const byGateDist: Record<number, number> = {};
    const rooms = new Set<number>();
    const centroid = walkableCentroid(flat);
    for (const a of anchors) {
      if (a === anchor) continue;
      const other = qualityAt(flat, a, centroid);
      if (!dominatesMonotone(other, q)) continue;
      dominators++;
      byGateDist[other.gateDist] = (byGateDist[other.gateDist] ?? 0) + 1;
      rooms.add(other.buildRoom);
    }
    // The histogram is asserted and not just counted, because the header makes
    // a claim about *what these anchors are*: they all sit at the maximum
    // `buildRoom`, and most of them beat the authored `gateDist` rather than
    // matching it. An earlier draft asserted the count and claimed the shape in
    // prose, and the prose was wrong.
    expect({ legalAnchors: anchors.length, dominators, byGateDist, rooms: [...rooms] }).toEqual({
      legalAnchors: 1425,
      dominators: 42,
      byGateDist: { 9: 11, 10: 11, 11: 9, 12: 7, 13: 4 },
      rooms: [48],
    });
  });

  it('separates the selection from the terrain, by holding the anchor fixed', () => {
    // The control CLAUDE.md's measurement rules ask for: "my change improved X"
    // needs the control run. The header claims the `buildRoom` fall from 48 to
    // 36 is the terrain and not the selection, and that the pick sits nearer
    // the centroid than the flat control — both are claims about a difference,
    // so both need the same maps measured at the *fixed* authored anchor.
    //
    // They come out the same side this time, which is worth stating because
    // the pre-resize file found them opposite: `buildRoom`, the rule beats the
    // fixed anchor (39.3460 to 39.2240); `centroidDist`, the rule *also* beats
    // the fixed anchor (6.0853 to 6.1241), rather than the fixed anchor's own
    // reading already sitting close to the flat control as it did pre-resize.
    const rs = rows();
    const mean = (f: (r: Row) => number): string =>
      (rs.reduce((a, r) => a + f(r), 0) / rs.length).toFixed(4);
    expect({
      buildRoomAtPick: mean((r) => r.q.buildRoom),
      buildRoomAtFixed: mean((r) => r.fixedRoom),
      centroidDistAtPick: mean((r) => r.q.centroidDist),
      centroidDistAtFixed: mean((r) => r.fixedCentroidDist),
      // Provable, not coincidental: `dist2 = 0` is the unique minimum of the
      // primary key, so the authored anchor is picked exactly when it is legal.
      fixedLegalSeeds: rs.filter((r) => r.fixedLegal).length,
      displacementZeroSeeds: rs.filter((r) => r.q.displacement === 0).length,
      // **The control that retires the 486/500 on its own terms.** The flat
      // arena shows the monotone measure condemning the authored ideal, but
      // 42-of-1425 is a share of *anchors on one map* while 486/500 is a share
      // of *seeds*, so the two are not commensurable. This pair is: of the 327
      // seeds where the authored (25,9) is legal, 313 have that anchor itself
      // dominated, by a mean of 20.3 anchors against 24.2 at the pick — most,
      // not literally every, legal-fixed-anchor map, unlike the pre-resize
      // reading of 432-for-432.
      fixedDominatedSeeds: rs.filter((r) => r.fixedLegal && r.fixedDominators > 0).length,
      meanDominatorsAtFixed: (
        rs.filter((r) => r.fixedLegal).reduce((a, r) => a + r.fixedDominators, 0) /
        rs.filter((r) => r.fixedLegal).length
      ).toFixed(1),
      meanDominatorsAtPick: (rs.reduce((a, r) => a + r.monoAll, 0) / rs.length).toFixed(1),
    }).toEqual({
      buildRoomAtPick: '39.3460',
      buildRoomAtFixed: '39.2240',
      centroidDistAtPick: '6.0853',
      centroidDistAtFixed: '6.1241',
      fixedLegalSeeds: 327,
      displacementZeroSeeds: 327,
      fixedDominatedSeeds: 313,
      meanDominatorsAtFixed: '20.3',
      meanDominatorsAtPick: '24.2',
    });
  });

  it('records the ledger over seeds 1..500', () => {
    expect(Object.fromEntries(PROPS.map((p) => [p, ledgerRow(p)]))).toEqual({
      centroidDist: 'min 2.8111 @163 · mean 6.0853 · median 6.0567 · max 8.5864 @99',
      buildRoom: 'min 22.0000 @431 · mean 39.3460 · median 39.0000 · max 48.0000 @2',
      gateDist: 'min 7.0000 @6 · mean 8.7300 · median 9.0000 · max 10.0000 @16',
      displacement: 'min 0.0000 @1 · mean 0.4503 · median 0.0000 · max 3.0000 @163',
    });
  });

  it('records the wider count the player actually sees: high ground is buildable too', () => {
    // `buildRoom` is normal-only because that is the acceptance's phrase, and
    // reading it as "what the Core can be defended with" understates the game:
    // `data/terrain.json` marks high ground buildable and `Grid.buildable`
    // agrees, so a high shelf beside the Core is a tower site. The gap is not
    // decorative — the worst normal-room seed carries half again as many real
    // sites — and recording it here is what stops the floor below being read
    // as a statement about playability.
    const rs = rows();
    const vs = rs.map((r) => r.buildableRoom);
    const lo = rs.reduce((a, b) => (b.buildableRoom < a.buildableRoom ? b : a));
    expect({
      row: `min ${Math.min(...vs)} @${lo.seed} · mean ${(vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(2)} · max ${Math.max(...vs)}`,
      atWorstNormalSeed: rs.find((r) => r.seed === 431)?.buildableRoom,
      normalAtWorstNormalSeed: rs.find((r) => r.seed === 431)?.q.buildRoom,
    }).toEqual({
      row: 'min 26 @408 · mean 41.15 · max 48',
      atWorstNormalSeed: 40,
      normalAtWorstNormalSeed: 22,
    });
  });

  it('records the room a player actually builds in, at the radii the tree reaches', () => {
    // Recorded, not floored: fb064m established that buildRange 5+ is the
    // normal case rather than an edge one (Engineer +2, tree node 22 +1), so a
    // base-radius-only ledger would understate the room every real run has.
    const rs = rows();
    const table = EXTRA_RADII.map((r, i) => {
      const vs = rs.map((x) => x.extraRoom[i]);
      const lo = rs.reduce((a, b) => (b.extraRoom[i] < a.extraRoom[i] ? b : a));
      return `r${r}: min ${Math.min(...vs)} @${lo.seed} · mean ${(vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(2)} · max ${Math.max(...vs)}`;
    });
    expect(table).toEqual([
      'r5: min 40 @431 · mean 60.83 · max 76',
      'r6: min 59 @148 · mean 85.01 · max 108',
      'r7: min 80 @148 · mean 117.46 · max 147',
    ]);
  });

  it('holds a floor per property, with the worst seed named and headroom recorded', () => {
    // Floors, not the extremes: the extremes are pinned exactly by the ledger
    // above so a move is a diff, and these are the separate statement that the
    // *worst* default is still a playable one. Each carries the measured
    // headroom it was set with, so tightening one is a decision and not a
    // ratchet.
    const rs = rows();
    const worstRoom = rs.reduce((a, b) => (b.q.buildRoom < a.q.buildRoom ? b : a));
    const worstGate = rs.reduce((a, b) => (b.q.gateDist < a.q.gateDist ? b : a));
    const farthestCentroid = rs.reduce((a, b) => (b.q.centroidDist > a.q.centroidDist ? b : a));
    const farthestPick = rs.reduce((a, b) => (b.q.displacement > a.q.displacement ? b : a));

    // Measured min 22 at seed 431; floor 12 is well under it, and it is an
    // empirical margin with no argument behind it — the disc count is not the
    // adjacent ring, so no claim about "the Core's own ring" follows from this
    // number. Re-measure and re-record when the min moves. (Pre-resize this
    // read min 15 at seed 411 with the same floor of 12; the resize widened the
    // margin rather than narrowing it, which is not guaranteed to hold at every
    // future retune and is why the floor stays where it is rather than moving
    // up to meet the new minimum.)
    //
    // **What this floor does and does not catch, measured rather than
    // asserted.** It kills every grossly bad selection — the failure mode the
    // backlog names ("jammed in a corner behind a rock shelf") scores min room
    // **2** under a first-legal-anchor policy (seed 248, 18.79 tiles out) and
    // **3** under a maximise-gate-distance policy (seed 57, 28.28 out), with
    // sample `displacement` maxima of 25.30 and 31.24 respectively — both well
    // past this file's own 3-tile sample maximum, which is what a policy that
    // ignores centrality entirely costs. (The pre-resize file also measured an
    // inverted-tie-break and a `ROOM_RADIUS: 1` variant against these floors;
    // re-deriving those needs a second implementation of `suggestCoreAnchor`'s
    // selection loop and is not repeated in this resize pass — the two policies
    // above already establish that the floor is doing real work.)
    expect(worstRoom.seed).toBe(431);
    expect(worstRoom.q.buildRoom).toBeGreaterThanOrEqual(12);
    // Two floors, and they are different kinds of statement. `legalCoreAnchors`
    // rejects a footprint tile within `coreGateClearance` of a gate, so
    // `clearance + 1` is *provable* — no legal anchor can be nearer, and this
    // line can never fail while this measurement and that rule agree (they
    // share `gateDistance`, which is why the copy went away). The recorded
    // floor is 6, one under the 7 measured at seed 6, and it is the one that
    // would catch a selection drifting toward the gates.
    expect(worstGate.seed).toBe(6);
    expect(worstGate.q.gateDist).toBeGreaterThanOrEqual(cfg.coreGateClearance + 1);
    expect(worstGate.q.gateDist).toBeGreaterThanOrEqual(6);
    // 8.5864 at seed 99 against the flat arena's 6.3051. The ceiling is an
    // empirical bound, *not* a consequence of the displacement cap below:
    // `centroidDist` is measured against each map's own centroid, and that
    // centroid moves between seeds too.
    expect(farthestCentroid.seed).toBe(99);
    expect(farthestCentroid.q.centroidDist).toBeLessThanOrEqual(FLAT_CENTROID_DIST + 4);
    // The rule's own objective, and the one bound here that sits exactly on its
    // measured max with zero headroom. Called what it is: a **sample max over
    // seeds 1..500**, not a designed cap. An earlier comment credited it to
    // `ROOM_RADIUS`, which is a wrong mechanism — the tie-break only chooses
    // *within* the minimum-distance set, so the pick's displacement is the
    // minimum over `legalCoreAnchors` whatever the ring radius is, and a denser
    // `data/terrain.json` (or a seed outside this window) can legitimately put
    // the nearest legal anchor further out with the rule untouched. This line
    // is expected to go red on a density retune; re-measure, do not relax.
    // (Pre-resize the sample max was 4, at seed 315; the resize's bigger legal
    // set lowered it to 3.)
    expect(farthestPick.seed).toBe(163);
    expect(farthestPick.q.displacement).toBe(3);
    expect(rs.every((r) => r.q.displacement <= 4)).toBe(true);
    expect(rs.filter((r) => r.q.displacement === 0).length).toBe(327);

  });

  it('takes the most build room among the anchors tied on the primary key', () => {
    // **Its own case on purpose.** These assertions used to close the floors
    // case above, where they were unreachable by the mutants their own comment
    // named: an inverted tie-break dies at `worstGate.seed === 88` (it reads
    // 284) and a dropped one at `farthestCentroid.seed === 411` (it reads 211),
    // both before this ever ran. QA measured that the property *is* violated by
    // those mutants — on 21 and 16 seeds — so the assertions were sound and
    // simply never executed. Separated, they fail with a message that names the
    // tie-break.
    //
    // **What they hold, stated exactly, because the obvious reading is too
    // generous.** `maxTieRoom` is computed with the same `coreAnchorRoom` the
    // rule uses, so this pins the *selection loop* — that the loop keeps the
    // best-scoring tied anchor — and is invariant to what the metric measures.
    // Pre-resize, every mutation of the metric tried (`ROOM_RADIUS` 1 or 3, an
    // asymmetric block, counting non-Rock, counting Rock instead of Normal) left
    // this green while changing the pick on many of the moved tie seeds; that
    // mutant sweep is not re-run against the new 72-seed tie population in this
    // pass, and the absolute readings below are what still guards "the metric is
    // still the metric" on its own.
    const rs = rows();
    expect(rs.filter((r) => r.tieTakesMaxRoom).length).toBe(rs.length);
    // `tieSet` re-derives `suggestCoreAnchor`'s primary key, which is the same
    // hand-copy shape this file removed for `gateDistance`. It cannot be
    // imported (the key lives inline in the selection loop), so it is guarded
    // instead: the pick must be a *member* of the set this file thinks it tied
    // in. A primary key changed on one side and not the other fails here rather
    // than leaving the two silently measuring different populations.
    expect(rs.filter((r) => r.pickInTieSet).length).toBe(rs.length);
    // The population that rule operates on, pinned so the header's "16 of 72,
    // not 16 of 500" cannot go stale. Pre-resize this read 24 tie seeds, 17
    // moved off the lowest index; the bigger arena roughly triples both.
    expect({
      tieSeeds: rs.filter((r) => r.tieCount > 1).length,
      movedOffLowestIndex: rs.filter((r) => r.tieMoved).length,
    }).toEqual({ tieSeeds: 72, movedOffLowestIndex: 34 });
    // Absolute readings of the metric itself — the half the property above
    // cannot see. The flat arena's 36 is a filled 6x6 block of normal ground
    // and pins three things at once: the radius (1 reads 16, 3 reads 64), the
    // *shape* (a ring excluding the footprint would read 32), and that it
    // counts `Normal`. Unaffected by the resize — both readings are local to a
    // small neighbourhood of the anchor, not of the arena. The clipped corner
    // and a real generated anchor pin it against a metric that agrees with 36
    // by accident.
    expect(coreAnchorRoom(flatTerrain(), CORE_X, CORE_Y)).toBe(36);
    expect(coreAnchorRoom(flatTerrain(), 1, 1)).toBe(16);
    expect(coreAnchorRoom(generateTerrain(411, cfg), 28, 9)).toBe(32);
  });

  it('pins the seed the declined tie-break would cost a whole map', () => {
    // The cost argument, in code rather than only in the header. Seed 112 was
    // the pre-resize witness and no longer demonstrates the point at 56x32 —
    // its tied anchors both clear the detour ceiling comfortably now (1.0984
    // and 1.125) — so this is a fresh witness found by scanning seeds 1..20000
    // for a map whose primary-key tie straddles the ceiling. Seed 15811 is not
    // one of the sixteen free-improvement seeds and is the cheapest one found:
    // its two tied anchors have *different* ring-room scores (16 against 28,
    // not tied on the secondary key the way seed 112's were), and the room
    // metric's actual behaviour — take the higher-scoring tied anchor — is what
    // keeps the map legal. An index-only tie-break (take the lowest-indexed
    // tied anchor when scores are not compared at all, which is what the loop
    // degenerates to on a genuine room tie) would take `(23,9)` here and refuse
    // the map instead.
    const map = generateTerrain(15811, cfg);
    const anchors = legalCoreAnchors(map, cfg);
    const ties = tieSet(map, anchors);
    const row = (a: number): Record<string, unknown> => {
      const tx = a % map.w;
      const ty = (a / map.w) | 0;
      return {
        at: `(${tx},${ty})`,
        ringRoom: coreAnchorRoom(map, tx, ty),
        discRoom: buildRoomAt(map, tx, ty, BUILD_RANGE),
        detour: Number(maxGateDetour(map, cfg, a, CORE_W, CORE_H).toFixed(4)),
      };
    };
    expect({ hash: map.hash, ceiling: cfg.constraints.maxGateDetour, ties: ties.map(row) }).toEqual({
      hash: 'dc0dda77',
      ceiling: 1.5,
      ties: [
        { at: '(23,9)', ringRoom: 16, discRoom: 22, detour: 1.9565 },
        { at: '(27,9)', ringRoom: 28, discRoom: 37, detour: 1.2 },
      ],
    });
    // The room metric picks the higher-scoring, legal anchor — on both the ring
    // and the disc reading this time, so this witness does not by itself
    // distinguish the two metrics the way seed 112 used to; it pins that the
    // room comparison itself (not merely index order) is load-bearing here.
    const pick = suggestCoreAnchor(map, cfg, anchors);
    expect(pick).toBe(ties[1]);
    expect(maxGateDetour(map, cfg, ties[0], CORE_W, CORE_H)).toBeGreaterThan(
      cfg.constraints.maxGateDetour,
    );
  });

  it('records both dominance readings, and that they disagree', () => {
    const rs = rows();
    const monoFree = rs.filter((r) => r.monoFree > 0).map((r) => r.seed);
    const fidFree = rs.filter((r) => r.fidFree > 0).map((r) => r.seed);
    expect({
      monotoneAll: `${rs.filter((r) => r.monoAll > 0).length}/${rs.length}`,
      monotoneFree: `${monoFree.length}/${rs.length}`,
      monotoneFreeSeeds: monoFree,
      fidelityAll: `${rs.filter((r) => r.fidAll > 0).length}/${rs.length}`,
      fidelityFree: `${fidFree.length}/${rs.length}`,
      fidelityFreeSeeds: fidFree,
      // The two orderings overlap on 8 of their seeds this time rather than
      // being wholly disjoint — a change from the pre-resize measurement
      // (which found none in common) — but neither is a subset of the other,
      // so which anchor is "better" is still not decidable without a balance
      // decision.
      overlap: monoFree.filter((s) => fidFree.includes(s)),
      worstFreeCount: rs.reduce((a, r) => Math.max(a, r.monoFree, r.fidFree), 0),
    }).toEqual({
      monotoneAll: '486/500',
      monotoneFree: '16/500',
      monotoneFreeSeeds: [6, 68, 96, 103, 119, 160, 180, 240, 241, 246, 256, 321, 327, 346, 360, 500],
      fidelityAll: '201/500',
      fidelityFree: '13/500',
      fidelityFreeSeeds: [6, 43, 68, 103, 119, 137, 200, 211, 246, 300, 346, 360, 500],
      overlap: [6, 68, 103, 119, 246, 346, 360, 500],
      worstFreeCount: 1,
    });
  });

  it('prices the declined change on every axis, not the flattering one', () => {
    // The decision this file declines, priced. Summed over the whole 500-seed
    // sample, and split per axis because they do not move together: five of
    // the sixteen free seeds gain no build room at all and qualify purely on
    // centrality, so a `buildRoom`-only price would report the smallest of the
    // effects as if it were the whole one.
    const rs = rows();
    expect({
      buildRoom: rs.reduce((a, r) => a + r.gainRoom, 0),
      centroidDist: fmt(rs.reduce((a, r) => a + r.gainCentroid, 0)),
      gateDist: rs.reduce((a, r) => a + r.gainGate, 0),
      perSeed: rs
        .filter((r) => r.monoFree > 0)
        .map((r) => `${r.seed}: room +${r.gainRoom} · centroid -${fmt(r.gainCentroid)} · gate +${r.gainGate}`),
    }).toEqual({
      buildRoom: 18,
      centroidDist: '18.9198',
      gateDist: 7,
      perSeed: [
        '6: room +2 · centroid -2.2249 · gate +0',
        '68: room +0 · centroid -0.9115 · gate +0',
        '96: room +1 · centroid -1.8327 · gate +2',
        '103: room +1 · centroid -1.2848 · gate +0',
        '119: room +2 · centroid -1.1598 · gate +0',
        '160: room +2 · centroid -1.1731 · gate +1',
        '180: room +2 · centroid -1.2842 · gate +0',
        '240: room +1 · centroid -0.8793 · gate +1',
        '241: room +3 · centroid -0.7539 · gate +1',
        '246: room +0 · centroid -1.1452 · gate +0',
        '256: room +2 · centroid -1.3017 · gate +0',
        '321: room +1 · centroid -0.7115 · gate +1',
        '327: room +1 · centroid -0.6312 · gate +1',
        '346: room +0 · centroid -1.1301 · gate +0',
        '360: room +0 · centroid -1.2423 · gate +0',
        '500: room +0 · centroid -1.2538 · gate +0',
      ],
    });
  });
});
