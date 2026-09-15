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
 * Re-measured whole at fb156's 4-gate layout, on top of fb166's 56x32 resize —
 * every number in this file moved again, because the fourth spawn gate
 * (`south`, at the border midpoint fb156 added) changes both which anchors
 * `coreGateClearance` excludes and the shape of the legal set
 * `suggestCoreAnchor` picks from. `CORE_X/CORE_Y` (still (25,9); moving it is
 * fb064c's job, logged in BACKLOG-TERRAIN.md) is unchanged.
 *
 * **The verdict is unchanged: an accepted band, not a changed selection.** The
 * rule optimises fidelity to the tuned spot on purpose — `analyze.ts` says why,
 * and where the Core sits relative to each gate is what every wave's travel
 * time is tuned against, i.e. a balance order, which is not this lane's to
 * take. Measured, that rule is doing its job on the population it can still
 * reach: **240 of 500 seeds** (down from 327 at the 3-gate 56x32 layout — the
 * fourth gate's own clearance zone rules the tuned spot illegal on more maps)
 * put the default on `CORE_X/CORE_Y` exactly, no seed moves it further than 2
 * tiles (was 3), and the two properties the flat arena's own tuning fixed come
 * back close to it — mean `centroidDist` 6.3112 against the flat 6.3255 and
 * mean `gateDist` 8.9900 against the flat 9. `buildRoom` is the one that
 * drops, 37.55 against the flat 48, and the cause is the terrain rather than
 * the selection: holding the anchor fixed at (25,9) on the same 500 maps
 * scores 37.1460, *below* what the rule picks, so the fall is the rough and
 * rock inside the build radius and not where the Core went. (On 240 of those
 * 500 the fixed anchor *is* the pick, so the whole 0.404 gap is earned on the
 * 260 seeds where (25,9) is illegal and the rule had to choose — the only
 * population where the two can differ at all.) The centroid figure decomposes
 * the same way: fixed (25,9) measures 6.4056 on these maps, so the pick sits
 * nearer the centroid than the fixed reading by 0.0944, and the flat control
 * itself (6.3255) is a further step beyond that.
 *
 * **"The share of seeds where a strictly better anchor exists" needs a
 * direction before it means anything, and the obvious direction is the one this
 * lane may not take.** Score "more central" and "further from a gate" as
 * monotonically better and the answer is **500/500** — every seed has one now,
 * not merely most (was 486/500 at the 3-gate layout) — and the proof that this
 * says nothing about the rule is the control, not an argument about relocation:
 * run the same measure on the **flat arena**, where the Core sits on the spot
 * every wave was tuned on, and the authored anchor is dominated by **127 of the
 * 1441 legal anchors** — a bigger legal set than the 3-gate 56x32 arena's 1425
 * (the fourth gate's own clearance zone removes a different sliver of the
 * border than the other three carve out, and the net still grows), with the
 * dominators spanning a much wider column range this time (`x=21..33`, `y=9..21`)
 * rather than sitting on a single column — the fourth gate reshapes which
 * ground is gate-clearance-legal enough to compete at all. A measure that
 * condemns the hand-authored ideal is measuring the objective, not the rule.
 * That control is not *commensurable* with the 500/500 on its own — 127-of-1441
 * is a share of anchors on one map, 500/500 a share of seeds — so the seed-wise
 * version is recorded beside it: on **240** of the 500 seeds where the
 * authored (25,9) is legal, that anchor is dominated on **all 240** of them, by
 * a mean of **73.7** anchors against **78.7** at the pick. The measure calls
 * the tuned spot a bad default on every map that offers it now, a change from
 * the 3-gate reading (313 of 327), and re-measured rather than inherited.
 * (The tempting argument — "every seed has a more central anchor somewhere" —
 * does not even entail the number: dominance needs `>=` on all three
 * properties, so a more central anchor with less room is not a dominator. What
 * those 127 have in common is measured rather than guessed: every one carries
 * the maximum `buildRoom` of 48, so each wins on centrality, on gate distance,
 * or on both. The gate-distance histogram is `9:9, 10:14, 11:18, 12:22, 13:25,
 * 14:26, 15:13`, so 118 of the 127 do improve on the authored `gateDist` of 9.
 * The histogram is asserted with the count, so the claim cannot go false in
 * prose again.)
 *
 * So both readings are recorded, and neither is left to stand alone:
 *
 *   1. **Monotone** — more central, more room, further from a gate. 500/500
 *      outright; **12/500** among anchors no further from `CORE_X/CORE_Y` than
 *      the pick (improvements available without moving the Core off the tuned
 *      spot).
 *   2. **Fidelity** — closer to the flat control's own readings on
 *      `centroidDist` and `gateDist`, more room. This is the ordering the
 *      file's frame actually implies. 392/500 outright (up from 201/500 — the
 *      fourth gate leaves the pick further from the flat control's own numbers
 *      on more maps), and **5/500** free.
 *
 * **Both "free" figures are shares of a much smaller population than /500
 * suggests, and reading them as a few percent overstates the rule.** The pick
 * is a minimiser of `displacement` over the same anchor list — not the unique
 * one, which is the whole point — so the "no further from `CORE_X/CORE_Y`"
 * filter is exactly an equality: only a *tie* on the primary key can ever
 * produce a free dominator. There are **81 tie seeds in 500** (up from 72 at
 * the 3-gate 56x32 layout). So the monotone 12 is 12 of 81 — 15% of the
 * population the measure can reach — and the fidelity 5 is 5 of 81. What is
 * small is the tie set, not the rule's error rate on it. This time the
 * fidelity-free set is a **strict subset** of the monotone-free one — every
 * seed that is fidelity-free is also monotone-free (131, 247, 309, 370, 383) —
 * a cleaner relationship than the partial 8-of-16/13 overlap the 3-gate layout
 * measured; which anchor is "better" is still not decidable here without a
 * balance decision.
 *
 * **What changing the tie-break would buy, measured by running the change
 * rather than by reasoning about it.** Buy, over the 500-seed sample:
 * `buildRoom` +14 tiles (across the 12 free seeds), `centroidDist` −14.2419
 * tiles, `gateDist` +14. (At the 3-gate 56x32 layout this read `+18` /
 * `−18.9198` / `+7` on 16 free seeds — the fourth gate trades a couple of
 * `buildRoom`/`centroidDist` points for twice the `gateDist` gain.)
 *
 * **What it would cost is illustrated below rather than re-derived as a
 * cross-file sweep this time.** Swapping `coreAnchorRoom`'s ring for a
 * `buildRange`-4 disc and re-running the whole terrain suite in a worktree is a
 * change to a file outside this lane's test-only Scope, so it is not repeated
 * here. What *is* re-measured is a concrete, load-bearing instance of the same
 * claim, using only the tools this file already has: seed **3107** (below,
 * fresh at the 4-gate layout — the old witness, seed 15811, no longer straddles
 * the ceiling with this gate list) has two anchors tied on `suggestCoreAnchor`'s
 * primary key with *different* `coreAnchorRoom` scores, and the tie-break's
 * actual behaviour — take the anchor with more room — happens to be the one
 * that keeps the map legal. An index-only tie-break (take the lowest-indexed
 * tied anchor, which is what `coreAnchorRoom` degenerates to when every tied
 * anchor scores the same) would have picked the other one and pushed the seed
 * onto the retry path instead. `ROOM_RADIUS`'s own doc block is right that this
 * tie-break feeds `terrainLegal`; a full cross-file re-derivation of the
 * disc-metric swap's blast radius is left for whoever next changes
 * `coreAnchorRoom`, since that is the point in time it is worth paying for
 * again.
 *
 * Every reading here is of the base gate arena (`GATES`, 4 gates as of fb156).
 * fb077's Fourth Gate modifier (now a *fifth* gate, `MODIFIER_GATES`'s
 * `south2`) threads its own gate list through generation and measurement, so a
 * run under it has a different legal set and a different suggestion; that is a
 * modifier's job and is out of this ledger's population by choice.
 *
 * Every number below was measured at fb156 against shipped `/data`. A change
 * to `data/terrain.json`, to `data/towers.json`'s `buildRange`, to the
 * generator, to `src/sim/grid.ts`'s `GATES`, or to `suggestCoreAnchor` is
 * expected to move them; that is the point. Re-measure and re-record, never
 * relax.
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
const FLAT_CENTROID_DIST = 6.325529002918228;
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
      centroidDist: '6.3255',
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
    // spot every wave was tuned against — 127 of the 1441 legal anchors dominate
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
      legalAnchors: 1441,
      dominators: 127,
      byGateDist: { 9: 9, 10: 14, 11: 18, 12: 22, 13: 25, 14: 26, 15: 13 },
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
    // They come out the same side as the 3-gate 56x32 reading: `buildRoom`, the
    // rule beats the fixed anchor (37.5500 to 37.1460); `centroidDist`, the
    // rule *also* beats the fixed anchor (6.3112 to 6.4056).
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
      // 127-of-1441 is a share of *anchors on one map* while 500/500 is a share
      // of *seeds*, so the two are not commensurable. This pair is: of the 240
      // seeds where the authored (25,9) is legal, all 240 have that anchor
      // itself dominated, by a mean of 73.7 anchors against 78.7 at the pick —
      // literally every legal-fixed-anchor map this time, unlike the 3-gate
      // reading of 313-for-327.
      fixedDominatedSeeds: rs.filter((r) => r.fixedLegal && r.fixedDominators > 0).length,
      meanDominatorsAtFixed: (
        rs.filter((r) => r.fixedLegal).reduce((a, r) => a + r.fixedDominators, 0) /
        rs.filter((r) => r.fixedLegal).length
      ).toFixed(1),
      meanDominatorsAtPick: (rs.reduce((a, r) => a + r.monoAll, 0) / rs.length).toFixed(1),
    }).toEqual({
      buildRoomAtPick: '37.5500',
      buildRoomAtFixed: '37.1460',
      centroidDistAtPick: '6.3112',
      centroidDistAtFixed: '6.4056',
      fixedLegalSeeds: 240,
      displacementZeroSeeds: 240,
      fixedDominatedSeeds: 240,
      meanDominatorsAtFixed: '73.7',
      meanDominatorsAtPick: '78.7',
    });
  });

  it('records the ledger over seeds 1..500', () => {
    expect(Object.fromEntries(PROPS.map((p) => [p, ledgerRow(p)]))).toEqual({
      centroidDist: 'min 3.8463 @183 · mean 6.3112 · median 6.2876 · max 9.1216 @119',
      buildRoom: 'min 25.0000 @231 · mean 37.5500 · median 37.0000 · max 48.0000 @3',
      gateDist: 'min 7.0000 @119 · mean 8.9900 · median 9.0000 · max 11.0000 @35',
      displacement: 'min 0.0000 @2 · mean 0.6578 · median 1.0000 · max 2.0000 @4',
    });
  });

  it('records the wider count the player actually sees: high ground is buildable too', () => {
    // `buildRoom` is normal-only because that is the acceptance's phrase, and
    // reading it as "what the Core can be defended with" understates the game:
    // `data/terrain.json` marks high ground buildable and `Grid.buildable`
    // agrees, so a high shelf beside the Core is a tower site. The gap is not
    // decorative — the worst normal-room seed carries real sites beyond its
    // normal-only count — and recording it here is what stops the floor below
    // being read as a statement about playability.
    //
    // The worst normal-room seed moved with the fourth gate — 231 (was 431 at
    // the 3-gate 56x32 layout).
    const rs = rows();
    const vs = rs.map((r) => r.buildableRoom);
    const lo = rs.reduce((a, b) => (b.buildableRoom < a.buildableRoom ? b : a));
    expect({
      row: `min ${Math.min(...vs)} @${lo.seed} · mean ${(vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(2)} · max ${Math.max(...vs)}`,
      atWorstNormalSeed: rs.find((r) => r.seed === 231)?.buildableRoom,
      normalAtWorstNormalSeed: rs.find((r) => r.seed === 231)?.q.buildRoom,
    }).toEqual({
      row: 'min 26 @153 · mean 39.73 · max 48',
      atWorstNormalSeed: 29,
      normalAtWorstNormalSeed: 25,
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
      'r5: min 38 @379 · mean 58.51 · max 76',
      'r6: min 55 @379 · mean 81.90 · max 107',
      'r7: min 82 @379 · mean 114.18 · max 148',
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

    // Measured min 25 at seed 231; floor 12 is well under it, and it is an
    // empirical margin with no argument behind it — the disc count is not the
    // adjacent ring, so no claim about "the Core's own ring" follows from this
    // number. Re-measure and re-record when the min moves. (At the 3-gate
    // 56x32 layout this read min 22 at seed 431 with the same floor of 12; the
    // fourth gate widened the margin rather than narrowing it, which is not
    // guaranteed to hold at every future retune and is why the floor stays
    // where it is rather than moving up to meet the new minimum.)
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
    expect(worstRoom.seed).toBe(231);
    expect(worstRoom.q.buildRoom).toBeGreaterThanOrEqual(12);
    // Two floors, and they are different kinds of statement. `legalCoreAnchors`
    // rejects a footprint tile within `coreGateClearance` of a gate, so
    // `clearance + 1` is *provable* — no legal anchor can be nearer, and this
    // line can never fail while this measurement and that rule agree (they
    // share `gateDistance`, which is why the copy went away). The recorded
    // floor is 6, one under the 7 measured at seed 119 (was seed 6 at the
    // 3-gate 56x32 layout — the same reading, a different worst seed), and it
    // is the one that would catch a selection drifting toward the gates.
    expect(worstGate.seed).toBe(119);
    expect(worstGate.q.gateDist).toBeGreaterThanOrEqual(cfg.coreGateClearance + 1);
    expect(worstGate.q.gateDist).toBeGreaterThanOrEqual(6);
    // 9.1216 at seed 119 against the flat arena's 6.3255. The ceiling is an
    // empirical bound, *not* a consequence of the displacement cap below:
    // `centroidDist` is measured against each map's own centroid, and that
    // centroid moves between seeds too. (This is the same seed as the
    // gate-distance floor above — a coincidence of this sample, not a shared
    // mechanism: the two properties are measured independently.)
    expect(farthestCentroid.seed).toBe(119);
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
    // (At the 3-gate 56x32 layout the sample max was 3, at seed 163; the
    // fourth gate's bigger legal set lowered it further, to 2.)
    expect(farthestPick.seed).toBe(4);
    expect(farthestPick.q.displacement).toBe(2);
    expect(rs.every((r) => r.q.displacement <= 4)).toBe(true);
    expect(rs.filter((r) => r.q.displacement === 0).length).toBe(240);

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
    // The population that rule operates on, pinned so the header's "12 of 81,
    // not 12 of 500" cannot go stale. At the 3-gate 56x32 layout this read 72
    // tie seeds, 34 moved off the lowest index; the fourth gate moves both up
    // a little further.
    expect({
      tieSeeds: rs.filter((r) => r.tieCount > 1).length,
      movedOffLowestIndex: rs.filter((r) => r.tieMoved).length,
    }).toEqual({ tieSeeds: 81, movedOffLowestIndex: 45 });
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
    // 28, not 32 (the 3-gate 56x32 reading): seed 411's own generated map
    // differs under the 4-gate layout, so the neighbourhood at this same tile
    // is a different mix of terrain — the metric itself (radius, shape, kind
    // counted) is unchanged, which is what the other two checks in this test
    // pin.
    expect(coreAnchorRoom(generateTerrain(411, cfg), 28, 9)).toBe(28);
  });

  it('pins the seed the declined tie-break would cost a whole map', () => {
    // The cost argument, in code rather than only in the header. Seed 15811
    // was the 3-gate 56x32 witness and no longer demonstrates the point with
    // the fourth gate open — its tied anchors both clear the detour ceiling
    // comfortably now — so this is a fresh witness found by scanning seeds
    // 1..20000 for a map whose primary-key tie straddles the ceiling. Seed
    // 3107 is not one of the twelve free-improvement seeds: its two tied
    // anchors have *different* ring-room scores (11 against 23, not tied on
    // the secondary key), and the room metric's actual behaviour — take the
    // higher-scoring tied anchor — is what keeps the map legal. An
    // index-only tie-break (take the lowest-indexed tied anchor when scores
    // are not compared at all, which is what the loop degenerates to on a
    // genuine room tie) would take `(23,9)` here and refuse the map instead.
    const map = generateTerrain(3107, cfg);
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
      hash: 'a9203eaf',
      ceiling: 1.5,
      ties: [
        { at: '(23,9)', ringRoom: 11, discRoom: 18, detour: 1.9556 },
        { at: '(27,9)', ringRoom: 23, discRoom: 34, detour: 1.1079 },
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
      // The fidelity-free set is a strict subset of the monotone-free one this
      // time — every fidelity-free seed is also monotone-free — a cleaner
      // relationship than the 3-gate 56x32 reading's partial 8-of-16/13
      // overlap; which anchor is "better" is still not decidable without a
      // balance decision.
      overlap: monoFree.filter((s) => fidFree.includes(s)),
      worstFreeCount: rs.reduce((a, r) => Math.max(a, r.monoFree, r.fidFree), 0),
    }).toEqual({
      monotoneAll: '500/500',
      monotoneFree: '12/500',
      monotoneFreeSeeds: [32, 131, 247, 309, 339, 354, 370, 383, 390, 393, 401, 402],
      fidelityAll: '392/500',
      fidelityFree: '5/500',
      fidelityFreeSeeds: [131, 247, 309, 370, 383],
      overlap: [131, 247, 309, 370, 383],
      worstFreeCount: 1,
    });
  });

  it('prices the declined change on every axis, not the flattering one', () => {
    // The decision this file declines, priced. Summed over the whole 500-seed
    // sample, and split per axis because they do not move together: every one
    // of the twelve free seeds gains at least a tile of gate distance this
    // time, so a `buildRoom`-only price would understate the change on every
    // one of them, not just some.
    const rs = rows();
    expect({
      buildRoom: rs.reduce((a, r) => a + r.gainRoom, 0),
      centroidDist: fmt(rs.reduce((a, r) => a + r.gainCentroid, 0)),
      gateDist: rs.reduce((a, r) => a + r.gainGate, 0),
      perSeed: rs
        .filter((r) => r.monoFree > 0)
        .map((r) => `${r.seed}: room +${r.gainRoom} · centroid -${fmt(r.gainCentroid)} · gate +${r.gainGate}`),
    }).toEqual({
      buildRoom: 14,
      centroidDist: '14.2419',
      gateDist: 14,
      perSeed: [
        '32: room +0 · centroid -0.6214 · gate +1',
        '131: room +3 · centroid -2.1942 · gate +2',
        '247: room +4 · centroid -1.1939 · gate +1',
        '309: room +3 · centroid -1.2128 · gate +1',
        '339: room +1 · centroid -0.8531 · gate +1',
        '354: room +0 · centroid -0.6700 · gate +1',
        '370: room +1 · centroid -1.2068 · gate +1',
        '383: room +1 · centroid -2.1318 · gate +2',
        '390: room +0 · centroid -0.8403 · gate +1',
        '393: room +0 · centroid -0.8829 · gate +1',
        '401: room +0 · centroid -1.2734 · gate +1',
        '402: room +1 · centroid -1.1612 · gate +1',
      ],
    });
  });
});
