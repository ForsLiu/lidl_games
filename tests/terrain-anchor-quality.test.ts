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
 * **The verdict: an accepted band, not a changed selection.** The rule
 * optimises fidelity to the tuned spot on purpose — `analyze.ts` says why, and
 * where the Core sits relative to each gate is what every wave's travel time is
 * tuned against, i.e. a balance order, which is not this lane's to take.
 * Measured, that rule is doing its job: **432 of 500 seeds put the default on
 * `CORE_X/CORE_Y` exactly**, no seed moves it further than 4 tiles, and the two
 * properties the flat arena's own tuning fixed come back essentially unchanged
 * — mean `centroidDist` 7.8529 against the flat 7.9992 and mean `gateDist`
 * 9.0020 against the flat 9. `buildRoom` is the one that drops, 36.06 against
 * the flat 48, and the cause is the terrain rather than the selection: holding
 * the anchor fixed at (25,9) on the same 500 maps scores 35.7920, *below* what
 * the rule picks, so the 48 -> 36 fall is the rough and rock inside the build
 * radius and not where the Core went. (On 432 of those 500 the fixed anchor
 * *is* the pick, so the whole 0.272 gap is earned on the 68 seeds where (25,9)
 * is illegal and the rule had to choose — the only population where the two
 * can differ at all.) The centroid figure decomposes the same
 * way and the decomposition is worth stating, because the raw comparison
 * flatters the rule: fixed (25,9) measures 7.9072 on these maps, so of the
 * 0.146 the pick sits nearer the centroid than the flat control, 0.092 is the
 * walkable centroid itself moving and only 0.054 is the selection.
 *
 * **"The share of seeds where a strictly better anchor exists" needs a
 * direction before it means anything, and the obvious direction is the one this
 * lane may not take.** Score "more central" and "further from a gate" as
 * monotonically better and the answer is **500/500** — and the proof that this
 * says nothing about the rule is the control, not an argument about relocation:
 * run the same measure on the **flat arena**, where the Core sits on the spot
 * every wave was tuned on, and the authored anchor is dominated by **86 of the
 * 498 legal anchors**, with a Pareto front sitting on the centre column eight
 * tiles away. A measure that condemns the hand-authored ideal is measuring the
 * objective, not the rule. That control is not *commensurable* with the 500/500
 * on its own — 86-of-498 is a share of anchors on one map, 500/500 a share of
 * seeds — so the seed-wise version is recorded beside it: on **all 432** seeds
 * where the authored (25,9) is legal, that anchor is itself dominated, by a
 * mean of **42.7** anchors against **44.2** at the pick. The measure calls the
 * tuned spot a bad default on every map that offers it. (The tempting argument — "every seed has a more
 * central anchor somewhere" — does not even entail the number: dominance needs
 * `>=` on all three properties, so a more central anchor with less room is not
 * a dominator. What those 86 have in common is measured rather than guessed:
 * every one carries the maximum `buildRoom` of 48, so each wins on centrality,
 * on gate distance, or on both. An earlier draft claimed they were not
 * gate-maximisers and sat at the authored `gateDist` of 9; the set says
 * otherwise — 9:15, 10:19, 11:19, 12:15, 13:11, 14:7, so 71 of the 86 do
 * improve on 9. The histogram is asserted with the count, so the claim cannot
 * go false in prose again.)
 *
 * So both readings are recorded, and neither is left to stand alone:
 *
 *   1. **Monotone** — more central, more room, further from a gate. 500/500
 *      outright; **5/500** among anchors no further from `CORE_X/CORE_Y` than
 *      the pick (improvements available without moving the Core off the tuned
 *      spot). All five win on `centroidDist`, i.e. by the term that carries the
 *      disqualifier above; two of them (184, 315) win on *nothing else*, and
 *      381 adds a tile of gate distance rather than any build room.
 *   2. **Fidelity** — closer to the flat control's own readings on
 *      `centroidDist` and `gateDist`, more room. This is the ordering the
 *      file's frame actually implies. 373/500 outright, and **1/500** free
 *      (seed 189, where (25,10) sits 0.0738 off the flat centroid distance
 *      against the pick's 1.0329 and carries 2 more build tiles).
 *
 * **Both "free" figures are shares of a much smaller population than /500
 * suggests, and reading them as 1% overstates the rule.** The pick is a
 * minimiser of `displacement` over the same anchor list — not the unique one,
 * which is the whole point — so the "no further from `CORE_X/CORE_Y`" filter is
 * exactly an equality: only a *tie* on the primary key can ever produce a free
 * dominator. There are **24 tie seeds
 * in 500**. So the monotone 5 is 5 of 24 — 21% of the population the measure
 * can reach — and the fidelity 1 is 1 of 24. What is small is the tie set, not
 * the rule's error rate on it. The two readings also pick out *disjoint* seeds,
 * which is the finding rather than a rounding detail: which anchor is "better"
 * is not decidable here without a balance decision.
 *
 * **What changing the tie-break would buy and cost, measured by running the
 * change rather than by reasoning about it.** Buy, over the 500-seed sample:
 * `buildRoom` +5 tiles (on 2 of the 5 free seeds), `centroidDist` −10.2894
 * tiles (on all 5, 5.0956 of it on seed 315 alone), `gateDist` +1 (seed 381).
 * Cost, from swapping `coreAnchorRoom`'s ring for a `buildRange`-4 disc in
 * `analyze.ts` and re-running the sweep: the pick moves on **six** seeds, not
 * the five — 13, 112, 177, 184, 189, 315 — and seed **381 does not move at
 * all** (both its tied anchors score 38 on the disc, so index decides and the
 * ring's answer stands). Two of the moves raise the detour (seed 13:
 * 1.0870 -> 1.1091; seed 315: 1.1519 -> 1.1772), and on **seed 112 the change
 * refuses the map**: its two tied anchors are (23,9) at detour 1.1091 and
 * (27,9) at 1.7302, the disc prefers (27,9), 1.7302 is past the 1.5 ceiling,
 * and the seed regenerates — `attempts` 1 -> 2, hash `b4348308` -> `8a8315a9`.
 * That is the real price: not golden churn but a different map handed to a run,
 * because `ROOM_RADIUS`' own doc block is right that this tie-break feeds
 * `terrainLegal`. The golden churn is real too, and it is **measured here
 * rather than inherited** — an earlier draft copied the five-file list
 * `tests/terrain-headroom.test.ts` uses for a *different* change, and three of
 * its five entries are wrong for this one. Running the swap in a worktree:
 * `terrain-approach` (fb064o, 4 cases), `terrain-band-ledger` (fb064r, 2),
 * `terrain-cost` (fb064z, 2), `terrain-headroom` (fb065a, 2) and
 * `terrain-core-placement`'s anchor golden (fb064h, 1) go red — while
 * `terrain-describe` (fb064k's dump), `terrain-variety` (fb064l),
 * `terrain-grid` (fb064x's field hashes) and `terrain-generation` stay
 * **green**, because none of them reads the suggested anchor. The centroid
 * column is the one a designer might still want; taking it is the balance
 * order, and this lane logs it rather than takes it.
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
const FLAT_CENTROID_DIST = 7.999187363710198;
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
      centroidDist: '7.9992',
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
    // spot every wave was tuned against — 86 of the 498 legal anchors dominate
    // it. This is the assertion the header's "500/500 is vacuous" claim rests
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
      legalAnchors: 498,
      dominators: 86,
      byGateDist: { 9: 15, 10: 19, 11: 19, 12: 15, 13: 11, 14: 7 },
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
    // They come out on opposite sides, which is why the header states them
    // differently. `buildRoom`: the rule beats the fixed anchor (36.0640 to
    // 35.7920), so the drop is entirely terrain. `centroidDist`: the fixed
    // anchor already measures 7.9072 against the flat arena's 7.9992, so most
    // of the rule's apparent gain is the walkable centroid moving, not the
    // pick.
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
      // **The control that retires the 500/500 on its own terms.** The flat
      // arena shows the monotone measure condemning the authored ideal, but
      // 86-of-498 is a share of *anchors on one map* while 500/500 is a share
      // of *seeds*, so the two are not commensurable. This pair is: on every
      // one of the 432 seeds where the authored (25,9) is legal, that anchor is
      // itself dominated, by very nearly as many anchors as the pick is. The
      // measure calls the tuned spot a bad default on every map that offers it.
      fixedDominatedSeeds: rs.filter((r) => r.fixedLegal && r.fixedDominators > 0).length,
      meanDominatorsAtFixed: (
        rs.filter((r) => r.fixedLegal).reduce((a, r) => a + r.fixedDominators, 0) /
        rs.filter((r) => r.fixedLegal).length
      ).toFixed(1),
      meanDominatorsAtPick: (rs.reduce((a, r) => a + r.monoAll, 0) / rs.length).toFixed(1),
    }).toEqual({
      buildRoomAtPick: '36.0640',
      buildRoomAtFixed: '35.7920',
      centroidDistAtPick: '7.8529',
      centroidDistAtFixed: '7.9072',
      fixedLegalSeeds: 432,
      displacementZeroSeeds: 432,
      fixedDominatedSeeds: 432,
      meanDominatorsAtFixed: '42.7',
      meanDominatorsAtPick: '44.2',
    });
  });

  it('records the ledger over seeds 1..500', () => {
    expect(Object.fromEntries(PROPS.map((p) => [p, ledgerRow(p)]))).toEqual({
      centroidDist: 'min 5.2599 @284 · mean 7.8529 · median 7.8691 · max 10.7451 @411',
      buildRoom: 'min 15.0000 @411 · mean 36.0640 · median 36.0000 · max 47.0000 @172',
      gateDist: 'min 7.0000 @88 · mean 9.0020 · median 9.0000 · max 11.0000 @96',
      displacement: 'min 0.0000 @1 · mean 0.1899 · median 0.0000 · max 4.0000 @315',
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
      atWorstNormalSeed: rs.find((r) => r.seed === 411)?.buildableRoom,
      normalAtWorstNormalSeed: rs.find((r) => r.seed === 411)?.q.buildRoom,
    }).toEqual({
      row: 'min 17 @99 · mean 38.44 · max 48',
      atWorstNormalSeed: 23,
      normalAtWorstNormalSeed: 15,
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
      'r5: min 29 @411 · mean 54.03 · max 73',
      'r6: min 47 @411 · mean 74.53 · max 99',
      'r7: min 73 @211 · mean 101.83 · max 132',
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

    // Measured min 15 at seed 411; floor 12 is that minus 3, and it is an
    // empirical margin with no argument behind it — the disc count is not the
    // adjacent ring, and seed 411's ring is 4/12 normal (6/12 buildable) while
    // its disc reads 15, so no claim about "the Core's own ring" follows from
    // this number. Re-measure and re-record when the min moves.
    //
    // **What this floor does and does not catch, measured rather than
    // asserted.** It kills every grossly bad selection — the failure mode the
    // backlog names ("jammed in a corner behind a rock shelf") scores min room
    // **0** (seed 340, 19.70 tiles out), first-legal-anchor **2** (seed 398,
    // 22.47 out) and maximise-gate-distance **1** (seed 148, 11.31 out), with
    // sample `displacement` maxima of 25.30, 25.30 and 13.89 — so what kills
    // the third is the room floor and not the displacement cap. It does *not*
    // have the 3 tiles of headroom the
    // margin suggests against the one plausible regression: invert only the
    // tie-break — take the least-room anchor among those tied on the primary
    // key — and the sample lands on min room **12** and min gate **6**, exactly
    // on both floors, with `displacement` untouched at 4/432. Under the same
    // inversion `ROOM_RADIUS: 1` also reads min room 12. The floors are the
    // outer fence; what actually holds the tie-break in place is the pair of
    // assertions at the end of this case.
    expect(worstRoom.seed).toBe(411);
    expect(worstRoom.q.buildRoom).toBeGreaterThanOrEqual(12);
    // Two floors, and they are different kinds of statement. `legalCoreAnchors`
    // rejects a footprint tile within `coreGateClearance` of a gate, so
    // `clearance + 1` is *provable* — no legal anchor can be nearer, and this
    // line can never fail while this measurement and that rule agree (they
    // share `gateDistance`, which is why the copy went away). The recorded
    // floor is 6, one under the 7 measured at seed 88, and it is the one that
    // would catch a selection drifting toward the gates.
    expect(worstGate.seed).toBe(88);
    expect(worstGate.q.gateDist).toBeGreaterThanOrEqual(cfg.coreGateClearance + 1);
    expect(worstGate.q.gateDist).toBeGreaterThanOrEqual(6);
    // 10.7451 at seed 411 against the flat arena's 7.9992. The ceiling is an
    // empirical bound with 1.25 tiles of headroom, *not* a consequence of the
    // displacement cap below: `centroidDist` is measured against each map's own
    // centroid, and that centroid moves between seeds too.
    expect(farthestCentroid.seed).toBe(411);
    expect(farthestCentroid.q.centroidDist).toBeLessThanOrEqual(FLAT_CENTROID_DIST + 4);
    // The rule's own objective, and the one bound here that sits exactly on its
    // measured max with zero headroom. Called what it is: a **sample max over
    // seeds 1..500**, not a designed cap. An earlier comment credited it to
    // `ROOM_RADIUS`, which is a wrong mechanism — the tie-break only chooses
    // *within* the minimum-distance set, so the pick's displacement is the
    // minimum over `legalCoreAnchors` whatever the ring radius is, and a denser
    // `data/terrain.json` (or a seed outside this window) can legitimately put
    // the nearest legal anchor 5 tiles out with the rule untouched. This line
    // is expected to go red on a density retune; re-measure, do not relax.
    expect(farthestPick.seed).toBe(315);
    expect(farthestPick.q.displacement).toBe(4);
    expect(rs.every((r) => r.q.displacement <= 4)).toBe(true);
    expect(rs.filter((r) => r.q.displacement === 0).length).toBe(432);

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
    // Every mutation of the metric leaves it green: `ROOM_RADIUS` 1 or 3, an
    // asymmetric block, counting non-Rock, and even counting Rock instead of
    // Normal, which changes the pick on 13 of the 17 moved tie seeds. Those are
    // caught by the ledger's identity goldens and by the absolute readings at
    // the end of this case, which is what a "the metric is still the metric"
    // check has to look like.
    const rs = rows();
    expect(rs.filter((r) => r.tieTakesMaxRoom).length).toBe(rs.length);
    // `tieSet` re-derives `suggestCoreAnchor`'s primary key, which is the same
    // hand-copy shape this file removed for `gateDistance`. It cannot be
    // imported (the key lives inline in the selection loop), so it is guarded
    // instead: the pick must be a *member* of the set this file thinks it tied
    // in. A primary key changed on one side and not the other fails here rather
    // than leaving the two silently measuring different populations.
    expect(rs.filter((r) => r.pickInTieSet).length).toBe(rs.length);
    // The population that rule operates on, pinned so the header's "5 of 24,
    // not 5 of 500" cannot go stale. `analyze.ts` read 25 here until fb065b
    // re-measured it against fb064l's generator.
    expect({
      tieSeeds: rs.filter((r) => r.tieCount > 1).length,
      movedOffLowestIndex: rs.filter((r) => r.tieMoved).length,
    }).toEqual({ tieSeeds: 24, movedOffLowestIndex: 17 });
    // Absolute readings of the metric itself — the half the property above
    // cannot see. The flat arena's 36 is a filled 6x6 block of normal ground
    // and pins three things at once: the radius (1 reads 16, 3 reads 64), the
    // *shape* (a ring excluding the footprint would read 32), and that it
    // counts `Normal`. The clipped corner and a real generated anchor pin it
    // against a metric that agrees with 36 by accident.
    expect(coreAnchorRoom(flatTerrain(), CORE_X, CORE_Y)).toBe(36);
    expect(coreAnchorRoom(flatTerrain(), 1, 1)).toBe(16);
    expect(coreAnchorRoom(generateTerrain(411, cfg), 28, 9)).toBe(14);
  });

  it('pins the seed the declined tie-break would cost a whole map', () => {
    // The cost argument, in code rather than only in the header. Seed 112 is
    // not one of the five free-improvement seeds and is the most expensive
    // consequence of changing the tie-break: its two tied anchors sit on
    // opposite sides of `terrainLegal`'s detour ceiling. The ring metric ties
    // them too (22 each), so the *index* rule decides and the legal anchor
    // wins — which is worth seeing, because it means the safe answer here is
    // owed to the stability tie-break and not to the room metric. A
    // `buildRange`-4 disc metric breaks the same tie the other way for a single
    // tile of room, and gets the map refused. Re-running the sweep with that
    // swap made in `analyze.ts` confirms it — seed 112 goes to `attempts` 2 and
    // hash `b4348308` -> `8a8315a9` — a different map handed to a run, not
    // golden churn.
    const map = generateTerrain(112, cfg);
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
      hash: 'b4348308',
      ceiling: 1.5,
      ties: [
        { at: '(23,9)', ringRoom: 22, discRoom: 29, detour: 1.1091 },
        { at: '(27,9)', ringRoom: 22, discRoom: 30, detour: 1.7302 },
      ],
    });
    // The ring metric's answer is the legal one and the disc metric's is not.
    const pick = suggestCoreAnchor(map, cfg, anchors);
    expect(pick).toBe(ties[0]);
    expect(maxGateDetour(map, cfg, ties[1], CORE_W, CORE_H)).toBeGreaterThan(
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
      // The two orderings pick out disjoint seeds, which is the finding: which
      // anchor is "better" is not decidable without a balance decision.
      overlap: monoFree.filter((s) => fidFree.includes(s)),
      worstFreeCount: rs.reduce((a, r) => Math.max(a, r.monoFree, r.fidFree), 0),
    }).toEqual({
      monotoneAll: '500/500',
      monotoneFree: '5/500',
      monotoneFreeSeeds: [13, 177, 184, 315, 381],
      fidelityAll: '373/500',
      fidelityFree: '1/500',
      fidelityFreeSeeds: [189],
      overlap: [],
      worstFreeCount: 1,
    });
  });

  it('prices the declined change on every axis, not the flattering one', () => {
    // The decision this file declines, priced. Summed over the whole 500-seed
    // sample, and split per axis because they do not move together: three of
    // the five free seeds gain no build room at all and qualify purely on
    // centrality, so a `buildRoom`-only price would report the smallest of the
    // three effects as if it were the whole one.
    const rs = rows();
    expect({
      buildRoom: rs.reduce((a, r) => a + r.gainRoom, 0),
      centroidDist: fmt(rs.reduce((a, r) => a + r.gainCentroid, 0)),
      gateDist: rs.reduce((a, r) => a + r.gainGate, 0),
      perSeed: rs
        .filter((r) => r.monoFree > 0)
        .map((r) => `${r.seed}: room +${r.gainRoom} · centroid -${fmt(r.gainCentroid)} · gate +${r.gainGate}`),
    }).toEqual({
      buildRoom: 5,
      centroidDist: '10.2894',
      gateDist: 1,
      perSeed: [
        '13: room +3 · centroid -2.1506 · gate +0',
        '177: room +2 · centroid -1.0526 · gate +0',
        '184: room +0 · centroid -1.0846 · gate +0',
        '315: room +0 · centroid -5.0956 · gate +0',
        '381: room +0 · centroid -0.9059 · gate +1',
      ],
    });
  });
});
