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
 * **fb166 re-measured every number in this file at the grid's 36x20 -> 56x32
 * flip.** The verdict is unchanged in kind — the rule optimises fidelity to
 * the tuned spot on purpose, and that is still doing its job — but several
 * figures moved by more than a resize-proportional amount, because a bigger
 * board changes how much terrain competes for the anchors near `CORE_X/
 * CORE_Y`, not just how much of it there is. Measured: **327 of 500 seeds**
 * put the default on `CORE_X/CORE_Y` exactly (was 432/500), no seed moves it
 * further than 3 tiles (was 4), mean `centroidDist` is 6.0853 against the
 * flat control's own 6.3051, and mean `gateDist` is 8.7300 against the flat
 * control's 9. `buildRoom` sits at a mean of 39.3460 against the flat
 * control's 48; holding the anchor fixed at (25,9) on the same 500 maps
 * scores 39.2240, again *below* what the rule picks, so — as before — the
 * fall from the flat arena's maximum is the terrain inside the build radius
 * and not where the Core went.
 *
 * **One reading did not survive the resize as an absolute claim, and is
 * corrected rather than carried forward.** On the old grid, every one of the
 * 432 seeds where the authored (25,9) is legal also had that anchor
 * dominated by some other legal anchor — "the measure calls the tuned spot a
 * bad default on every map that offers it". At 56x32 that is **313 of 327**,
 * not all of them: 14 fixed-legal seeds now have no dominator at all. The
 * flat-arena control itself still shows the measure condemning the
 * hand-authored ideal there (re-measured: 42 of 1425 legal anchors dominate
 * it, all at the maximum `buildRoom` of 48), so the qualitative finding — a
 * monotone measure is not a fair verdict on this rule — still holds; only the
 * "every seed" universal is now "the large majority of seeds".
 *
 * Both dominance readings are still recorded, and neither stands alone:
 *
 *   1. **Monotone** — more central, more room, further from a gate. 486/500
 *      seeds have some dominator (not 500/500, see above); **16/500** among
 *      anchors no further from `CORE_X/CORE_Y` than the pick (free
 *      improvements — up from 5/500 on the old grid, over a tie population
 *      that also grew, see below).
 *   2. **Fidelity** — closer to the flat control's own readings on
 *      `centroidDist` and `gateDist`, more room. 201/500 outright (was
 *      373/500), and **13/500** free (was 1/500).
 *
 * **Both "free" figures are shares of a much smaller population than /500
 * suggests.** The pick minimises `displacement` over the same anchor list —
 * not uniquely, which is the whole point — so "no further from `CORE_X/
 * CORE_Y`" is exactly an equality: only a *tie* on the primary key can ever
 * produce a free dominator. There are **72 tie seeds in 500** now (was 24).
 * Unlike the old grid, the two readings' free-improvement seed sets are not
 * disjoint here — 8 of the 16 monotone-free seeds are also fidelity-free
 * (see the dominance test) — so "which anchor is better is not decidable
 * without a balance decision" holds on the 8 seeds each reading picks alone,
 * not as "the two orderings never agree".
 *
 * **What changing the tie-break would buy, re-measured over the 16-seed free
 * population:** `buildRoom` +18 tiles total, `centroidDist` −18.9198 tiles
 * total, `gateDist` +7 total (see the per-seed breakdown in the pricing
 * test). **What it would cost is not re-measured here.** The old grid's
 * version of this file ran the `coreAnchorRoom`-ring-for-`buildRange`-disc
 * swap in a worktree and reported which of five other test files it moved;
 * repeating that experiment at 56x32 is real work this item's search budget
 * did not extend to, and restating the old numbers would be exactly the
 * inherited-deferral CLAUDE.md's measurement rules warn against. What is
 * measured and pinned instead is a fresh witness for the underlying risk —
 * seed 344, where the tied anchors straddle `terrainLegal`'s detour ceiling
 * and the rule's own tie-break steers clear of the illegal one (see "pins a
 * seed where the tie-break steers clear of an illegal tied anchor").
 *
 * Every reading here is of the base three-gate arena (`GATES`). fb077's Fourth
 * Gate modifier threads a four-gate list through generation and measurement, so
 * a run under it has a different legal set and a different suggestion; that is
 * a modifier's job and is out of this ledger's population by choice.
 *
 * Every number below was measured at fb065b / fb166 against shipped `/data`.
 * A change to `data/terrain.json`, to `data/towers.json`'s `buildRange`, to
 * the generator or to `suggestCoreAnchor` is expected to move them; that is
 * the point. Re-measure and re-record, never relax.
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

/**
 * The flat arena's own readings — the control every "fidelity" term is
 * against. fb166 re-measured both at 56x32: `gateDist` happens to hold at 9
 * (the flat map's own layout: `CORE_X/CORE_Y` sit at Chebyshev 9 from the
 * nearest gate on either grid), `centroidDist` moved with the walkable
 * centroid's own shift on the wider board.
 */
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
    // fb166 re-measured at 56x32: the bigger board offers far more legal
    // anchors (1425 against 498) and so more dominators too, though the
    // *shape* — every dominator sitting at the maximum `buildRoom`, most
    // beating rather than matching the authored `gateDist` — is unchanged.
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

    // fb166 re-measured at 56x32. Measured min 22 at seed 431; floor 19 is
    // that minus 3, the same empirical-margin shape the old grid's floor
    // used (measured-3, no argument behind the exact gap). Re-measure and
    // re-record when the min moves.
    //
    // The "invert the tie-break" and named-bad-selection cross-checks the old
    // grid's version of this comment carried are not re-verified here — they
    // are a claim about a *different* generator configuration, and repeating
    // them without re-running that configuration at 56x32 would be exactly
    // the inherited-deferral CLAUDE.md's measurement rules warn against. What
    // is re-measured and asserted is the floor itself and the two tie-break
    // properties pinned in the next case.
    expect(worstRoom.seed).toBe(431);
    expect(worstRoom.q.buildRoom).toBeGreaterThanOrEqual(19);
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
    // empirical bound with headroom, *not* a consequence of the
    // displacement cap below: `centroidDist` is measured against each map's own
    // centroid, and that centroid moves between seeds too.
    expect(farthestCentroid.seed).toBe(99);
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
    expect(farthestPick.seed).toBe(163);
    expect(farthestPick.q.displacement).toBe(3);
    expect(rs.every((r) => r.q.displacement <= 3)).toBe(true);
    expect(rs.filter((r) => r.q.displacement === 0).length).toBe(327);
  });

  it('takes the most build room among the anchors tied on the primary key', () => {
    // **Its own case on purpose**, separated from the floors case above so a
    // failure names the tie-break rather than a room/gate/centroid bound.
    //
    // **What they hold.** `maxTieRoom` is computed with the same
    // `coreAnchorRoom` the rule uses, so this pins the *selection loop* — that
    // the loop keeps the best-scoring tied anchor — and is invariant to what
    // the metric measures.
    const rs = rows();
    expect(rs.filter((r) => r.tieTakesMaxRoom).length).toBe(rs.length);
    // `tieSet` re-derives `suggestCoreAnchor`'s primary key, which is the same
    // hand-copy shape this file removed for `gateDistance`. It cannot be
    // imported (the key lives inline in the selection loop), so it is guarded
    // instead: the pick must be a *member* of the set this file thinks it tied
    // in. A primary key changed on one side and not the other fails here rather
    // than leaving the two silently measuring different populations.
    expect(rs.filter((r) => r.pickInTieSet).length).toBe(rs.length);
    // The population that rule operates on, pinned so the header's tie-set
    // share cannot go stale. fb166 re-measured at 56x32: the bigger board
    // widens the tie population itself (72 against the old grid's 24).
    expect({
      tieSeeds: rs.filter((r) => r.tieCount > 1).length,
      movedOffLowestIndex: rs.filter((r) => r.tieMoved).length,
    }).toEqual({ tieSeeds: 72, movedOffLowestIndex: 34 });
    // Absolute readings of the metric itself — the half the property above
    // cannot see. The flat arena's 36 is a filled 6x6 block of normal ground
    // and pins three things at once: the radius (1 reads 16, 3 reads 64), the
    // *shape* (a ring excluding the footprint would read 32), and that it
    // counts `Normal`. These three are unchanged by the grid resize — they
    // depend only on `CORE_X/CORE_Y` sitting well clear of any border, which
    // holds on both grids. The third reading, a real generated anchor's room
    // at an arbitrary illustrative tile, is re-measured at 56x32.
    expect(coreAnchorRoom(flatTerrain(), CORE_X, CORE_Y)).toBe(36);
    expect(coreAnchorRoom(flatTerrain(), 1, 1)).toBe(16);
    expect(coreAnchorRoom(generateTerrain(411, cfg), 28, 9)).toBe(32);
  });

  it('pins a seed where the tie-break steers clear of an illegal tied anchor', () => {
    // fb166 re-derived this at 56x32: seed 112 (the old grid's witness for
    // "the ring metric ties two anchors the index rule then decides between,
    // one of them illegal") no longer has that shape — its tied anchors are
    // both legal on this grid. Seed 344 is a fresh witness for the underlying
    // property this file cares about: a map whose tied-on-primary-key anchors
    // straddle `terrainLegal`'s detour ceiling, and the rule's own room-based
    // tie-break (not the index rule) picks the legal one — it has more room by
    // both metrics, ring and disc alike, so this is not a coin flip the rule
    // happened to win. (The old grid's version additionally showed a *disc*
    // metric flipping the pick to the illegal anchor; no seed exhibiting that
    // stronger property was found inside this item's 2000-seed search budget,
    // so it is not claimed here.)
    const map = generateTerrain(344, cfg);
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
      hash: 'b465bf55',
      ceiling: 1.5,
      ties: [
        { at: '(24,9)', ringRoom: 27, discRoom: 37, detour: 1.5263 },
        { at: '(25,10)', ringRoom: 32, discRoom: 42, detour: 1.2813 },
      ],
    });
    // The rule's answer is the legal one, and it wins outright on room too.
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
      // The two orderings pick out disjoint seeds, which is the finding: which
      // anchor is "better" is not decidable without a balance decision.
      overlap: monoFree.filter((s) => fidFree.includes(s)),
      worstFreeCount: rs.reduce((a, r) => Math.max(a, r.monoFree, r.fidFree), 0),
    }).toEqual({
      // fb166 re-measured at 56x32. `monotoneAll` is no longer 500/500 — 14
      // seeds' picks are not dominated by any other legal anchor at all,
      // which the flat-arena control above already shows is possible (the
      // measure condemns even the hand-authored ideal there, but it need not
      // condemn *every* pick everywhere). Both free-improvement populations
      // grew with the wider tie set (72 against the old grid's 24).
      monotoneAll: '486/500',
      monotoneFree: '16/500',
      monotoneFreeSeeds: [6, 68, 96, 103, 119, 160, 180, 240, 241, 246, 256, 321, 327, 346, 360, 500],
      fidelityAll: '201/500',
      fidelityFree: '13/500',
      fidelityFreeSeeds: [6, 43, 68, 103, 119, 137, 200, 211, 246, 300, 346, 360, 500],
      // Unlike the old grid, the two readings are *not* disjoint here — 8 of
      // the 16 monotone-free seeds are also fidelity-free. The finding the
      // header draws from this — "which anchor is better is not decidable
      // without a balance decision" — still holds on the 8 seeds each
      // reading picks out alone; it no longer holds as "the two orderings
      // never agree".
      overlap: [6, 68, 103, 119, 246, 346, 360, 500],
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
      // fb166 re-measured at 56x32, over the wider 16-seed free-improvement
      // population (see the dominance case above).
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
