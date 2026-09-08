/**
 * fb064o — gate-to-Core travel, the terrain property every wave is tuned
 * against (SPEC-FINAL §10.5, G2).
 *
 * The item's premise: `walkableFrac` and friends bound *area*, nothing bounded
 * *travel*, so a seed whose rock blobs happen to lie across a gate main could
 * hand a run a materially longer approach than the flat map the waves were
 * tuned on without failing a single band. Measuring it found that the premise
 * was not hypothetical — see the ledger below — so this item added a band
 * rather than accepting the spread, and this file is both the measurement and
 * the guard.
 *
 * Four things are pinned here, in the order they have to hold:
 *  1. **the metric is the sim's.** `approachField` mirrors `Grid.dijkstra`, and
 *     "mirrors" is checked against a real `Grid` over generated maps rather
 *     than asserted in a comment. A length measured in the wrong metric is a
 *     statement about a map the game does not play — `terrain-grid.test.ts`'s
 *     own framing, one measurement further on.
 *  2. **the baseline is the flat arena**, whose detour is exactly `1.000000` on
 *     every gate. That is what makes the ratio meaningful: it is the map the
 *     tuned numbers came from.
 *  3. **the ledger**, recorded over 500 seeds and over the witnesses fb064j's
 *     seed domain actually admits, with the worst seed named per row so a
 *     retune's cost is a diff rather than a hunt (fb064r's rule, applied here
 *     from the start).
 *  4. **the band holds the worst seed**, and holds it at a price this file
 *     records: which seeds it moves onto the retry path, and that none of them
 *     ends up on the fallback.
 */

import { describe, expect, it } from 'vitest';

import { CORE_H, CORE_W, GATES, GRID_H, GRID_W, Grid } from '../src/sim/grid';
import {
  approachField,
  describeTerrain,
  flatTerrain,
  freeApproachCost,
  generateTerrain,
  legalCoreAnchors,
  loadTerrain,
  maxGateDetour,
  measureApproach,
  measureTerrain,
  parseTerrain,
  parseTerrainDump,
  suggestCoreAnchor,
  terrainLegal,
  terrainOverlay,
  TerrainKind,
  type TerrainConfig,
  type TerrainMeasure,
} from '../src/sim/terrain';
import type { TerrainGrid } from '../src/sim/terrain/types';

const cfg = loadTerrain();

/** The shipped config with one `constraints` field overridden. */
function withBand(patch: Record<string, unknown>): TerrainConfig {
  const raw = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
  Object.assign(raw.constraints as Record<string, unknown>, patch);
  return parseTerrain(raw);
}

/**
 * The generator as it behaved *before* this item — same code, band switched
 * off. Every "the band changed this" claim below is measured against this
 * control rather than against a remembered number (CLAUDE.md's measurement
 * rules: "my change improved X" needs the control run).
 */
const NO_BAND = withBand({ maxGateDetour: 1e6 });

/** The suggested Core anchor for a map, which is what the band measures to. */
function anchorOf(map: TerrainGrid, c: TerrainConfig): number {
  const a = suggestCoreAnchor(map, c, legalCoreAnchors(map, c));
  expect(a, 'every legal map has a suggested anchor').not.toBeNull();
  return a as number;
}

/** A rock-bordered hand-built grid with normal interior, gates walkable. */
function handMap(): Uint8Array {
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
  return kind;
}

describe('fb064o — the metric is the sim`s, not the analyzer`s', () => {
  it('agrees with a real Grid`s ground field, tile for tile', () => {
    // The contract this file exists to keep. `path.ts` duplicates `Grid`'s step
    // costs (grid.ts does not export them) and re-implements its no-corner-cut
    // rule; if either drifts, a band measured here stops describing the walk
    // the sim runs, and every number below becomes fiction. Generated maps
    // rather than a hand-built one, so the comparison runs over real blob
    // scatter with real pinch points.
    for (const seed of [1, 42, 463, 7957, 20000]) {
      const map = generateTerrain(seed, cfg);
      const anchor = anchorOf(map, cfg);
      const tx = anchor % map.w;
      const ty = (anchor / map.w) | 0;

      const grid = new Grid();
      grid.applyTerrain(terrainOverlay(map, cfg));
      grid.placeCore(tx, ty);
      grid.refresh();

      const core: number[] = [];
      for (let dy = 0; dy < CORE_H; dy++) {
        for (let dx = 0; dx < CORE_W; dx++) core.push((ty + dy) * map.w + (tx + dx));
      }
      const mine = approachField(map, cfg, core);

      // Nothing is built, so `Grid`'s breach field carries no surcharge and is
      // a plain terrain field — the quantity a generation band can hold.
      let compared = 0;
      for (let i = 0; i < mine.length; i++) {
        expect(mine[i], `seed ${seed} tile ${i % map.w},${(i / map.w) | 0}`).toBe(
          grid.ground.dist[i],
        );
        if (mine[i] >= 0) compared++;
      }
      // Guard against the assertion above passing on an all-`-1` field.
      expect(compared, `seed ${seed} reachable tiles`).toBeGreaterThan(300);
    }
  });

  it('refuses the corner a walker cannot cut, at the exact price of going round', () => {
    // Two rock tiles meeting at a corner, at (10,9) and (9,10). Octile distance
    // says (10,10) reaches (9,9) in one diagonal step; `Grid`'s rule (and so
    // ours) says walk around.
    //
    // Both costs are asserted *exactly* rather than as "more than 14". A
    // 4-connected implementation would also refuse this corner — for the wrong
    // reason — and only the open case's 14 rules it out, since 4-connectivity
    // prices that at 20.
    const kind = handMap();
    const open = { w: GRID_W, h: GRID_H, kind };
    const straight = approachField(open, cfg, [10 * GRID_W + 10]);
    expect(straight[9 * GRID_W + 9]).toBe(14);

    kind[9 * GRID_W + 10] = TerrainKind.Rock;
    kind[10 * GRID_W + 9] = TerrainKind.Rock;
    const pinched = approachField(open, cfg, [10 * GRID_W + 10]);
    // 60, not 28, and the gap is the point: two rocks do not merely close the
    // one diagonal between them, they close *every* diagonal that has either of
    // them as an orthogonal neighbour. (10,10) loses three of its four
    // diagonals, (9,9) loses three of its own, and the cheapest surviving route
    // is six orthogonal steps — (11,10) (11,9) (11,8) (10,8) (9,8) (9,9) — at
    // 10 each. A corner-cutting walker would pay 14.
    expect(pinched[9 * GRID_W + 9]).toBe(60);
  });

  it('reports `-1`, never a short approach, when there is no walk', () => {
    const map = generateTerrain(1, cfg);
    const anchor = anchorOf(map, cfg);

    // Off-grid anchors: no footprint tile becomes a source, so no gate reaches.
    for (const bad of [-1, GRID_W * GRID_H, GRID_W * GRID_H - 1, 1.5, NaN]) {
      const m = measureApproach(map, cfg, bad, CORE_W, CORE_H);
      expect(m.allReachable).toBe(false);
      expect(m.perGate.every((d) => d === -1)).toBe(true);
      expect(m.min).toBe(-1);
      expect(m.mean).toBe(-1);
      expect(m.max).toBe(-1);
      expect(maxGateDetour(map, cfg, bad, CORE_W, CORE_H)).toBe(-1);
    }

    // A gate sealed into its own pocket. `-1` and not a number a band could
    // read as a straight walk in.
    const kind = handMap();
    const g = GATES[1];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = 0; dy <= 1; dy++) {
        const x = g.tx + dx;
        const y = g.ty + dy;
        if (x <= 0 || y <= 0 || x >= GRID_W - 1 || y >= GRID_H - 1) continue;
        kind[y * GRID_W + x] = TerrainKind.Rock;
      }
    }
    const sealed = { w: GRID_W, h: GRID_H, kind };
    const m = measureApproach(sealed, cfg, anchor, CORE_W, CORE_H);
    expect(m.allReachable).toBe(false);
    expect(m.perGate[1]).toBe(-1);
    // The partial case, which is the one that can lie. The other three gates
    // *did* reach (fb156: 4 gates now, one sealed), so summarising the subset
    // would report a real min/mean/max and a nonzero spread rather than
    // "perfectly even gates" — but either way it would be a number for a map
    // with a gate walled off. The summaries are `-1`; the per-gate row is
    // where the surviving detail lives.
    expect(m.perGate.filter((d) => d >= 0).length).toBe(3);
    expect([m.min, m.mean, m.max, m.spread]).toEqual([-1, -1, -1, -1]);
    expect(maxGateDetour(sealed, cfg, anchor, CORE_W, CORE_H)).toBe(-1);
    expect(measureTerrain(sealed, cfg).maxGateDetour).toBe(-1);

    // fb064k's format has to survive the sentinel too. `num()` refuses `-0` and
    // leading zeros, so `-1.000000` is the one spelling — but nothing pinned
    // that a dump of an unmeasurable map reloads as unmeasurable rather than
    // throwing on its own band line.
    const dump = describeTerrain(sealed, cfg);
    expect(dump).toContain('gateDetour=-1.000000');
    expect(parseTerrainDump(dump).measure.maxGateDetour).toBe(-1);
  });
});

describe('fb064o — the flat arena is the baseline, and it measures exactly 1', () => {
  it('every gate walks straight in on the flat map', () => {
    const flat = flatTerrain();
    const anchor = anchorOf(flat, cfg);
    // The tuned Core position, reproduced by `suggestCoreAnchor` on a map with
    // nothing in the way — which is why this is the right denominator.
    expect([anchor % flat.w, (anchor / flat.w) | 0]).toEqual([25, 9]);

    const m = measureApproach(flat, cfg, anchor, CORE_W, CORE_H);
    // fb156: 4 gates now (west, north, east, south), and east is the far gate
    // by design at this layout — the flat arena carries a 3.5x gate-to-gate
    // spread, which is the scale any terrain deviation is read against. (At
    // the 3-gate 56x32 layout this was `[250, 118, 118]`, west the far gate,
    // a 2.1x spread.)
    expect(m.perGate).toEqual([258, 94, 330, 238]);
    expect([m.min, m.mean, m.max, m.spread]).toEqual([94, 230, 330, 236]);

    for (const g of GATES) {
      const free = freeApproachCost(g.tx, g.ty, anchor, flat.w, CORE_W, CORE_H);
      const i = GATES.indexOf(g);
      expect(m.perGate[i] / free, `gate ${g.key} detour`).toBe(1);
    }
    expect(maxGateDetour(flat, cfg, anchor, CORE_W, CORE_H)).toBe(1);
    expect(measureTerrain(flat, cfg).maxGateDetour).toBe(1);
  });

  it('the free cost is a true lower bound on every real walk', () => {
    // The band is a ratio, so a divisor that could exceed the numerator would
    // let a legal map measure below 1 and be refused by `terrainLegal`'s
    // self-check. Octile distance is the exact obstacle-free optimum, so this
    // must hold for every map — measured, not argued.
    for (let seed = 1; seed <= 200; seed++) {
      const map = generateTerrain(seed, cfg);
      const anchor = anchorOf(map, cfg);
      const m = measureApproach(map, cfg, anchor, CORE_W, CORE_H);
      expect(m.allReachable, `seed ${seed}`).toBe(true);
      for (let i = 0; i < GATES.length; i++) {
        const free = freeApproachCost(GATES[i].tx, GATES[i].ty, anchor, map.w, CORE_W, CORE_H);
        expect(m.perGate[i], `seed ${seed} gate ${GATES[i].key}`).toBeGreaterThanOrEqual(free);
      }
      expect(measureTerrain(map, cfg).maxGateDetour).toBeGreaterThanOrEqual(1);
    }
  });
});

/**
 * The ledger fb064o's acceptance asks for, in **both** states — and the pair is
 * the point.
 *
 * `LEDGER_500` is measured with the shipped `data/terrain.json` including the
 * band, so it is what a run actually draws. `LEDGER_500_PRE` is the same 500
 * seeds with the band switched off: the untreated spread, which is the number a
 * wave retune has to read and the control the band is justified by. Recording
 * only the treated one would risk a "my change improved X" claim with the
 * control missing, which is the failure CLAUDE.md's measurement rules name
 * explicitly. (QA's Major, and it was right: the header of this file used to
 * promise a control that was not in it.)
 *
 * **Re-measured at fb156's 4-gate layout, the two tables are identical.** Not a
 * copy-paste: over this window's 500 seeds, at the 4-gate layout, not one
 * seed's uncapped detour exceeds `1.5` at all (max 1.2362, at seed 215), so the
 * band refuses nothing here and the two sweeps produce the same rows. That is
 * a real finding, not a coincidence: `RETRY_SEEDS` on the domain-wide sample
 * (`terrain-band-ledger.test.ts`) is a fraction of what it was at the 3-gate
 * 56x32 layout, and this window is small enough that it now falls entirely
 * inside the population the band never touches. Recording one flat table
 * where two used to differ is itself the measurement.
 *
 * Costs are `Grid`'s path units: 10 per orthogonal step, 14 per diagonal. The
 * flat arena's baseline is `min 94 / mean 230 / max 330` — moved from the
 * 3-gate 56x32 layout's `118 / 162 / 250` because `GATES` itself moved (fb156):
 * `CORE_X/CORE_Y` are the same literal coordinates, but the fourth gate and the
 * three others' new positions change every gate's free-walk distance (this
 * file's own "the flat arena is the baseline" test pins the fresh reading).
 */
const LEDGER_500_PRE = {
  /** Identical to `LEDGER_500` this time — see the header. */
  gateMin: { min: 74, minSeed: 119, mean: 97.26, max: 128, maxSeed: 35, flat: 94 },
  gateMean: { min: 229, minSeed: 129, mean: 235.204, max: 247.5, maxSeed: 215, flat: 230 },
  gateMax: { min: 310, minSeed: 4, mean: 326.036, max: 382, maxSeed: 359, flat: 330 },
  /** 1.2362 at seed 215: the worst approach this window offers, treated or not. */
  detour: { min: 1, minSeed: 7, mean: 1.0742, max: 1.2362, maxSeed: 215, flat: 1 },
} as const;

const LEDGER_500 = {
  /** Shortest gate's approach: the fastest lane a wave can leak down. */
  gateMin: { min: 74, minSeed: 119, mean: 97.26, max: 128, maxSeed: 35, flat: 94 },
  /** Mean over the four gates: the run's overall travel budget. */
  gateMean: { min: 229, minSeed: 129, mean: 235.204, max: 247.5, maxSeed: 215, flat: 230 },
  /** Longest gate's approach. */
  gateMax: { min: 310, minSeed: 4, mean: 326.036, max: 382, maxSeed: 359, flat: 330 },
  /** The banded quantity: worst gate's cost over its obstacle-free cost. */
  detour: { min: 1, minSeed: 7, mean: 1.0742, max: 1.2362, maxSeed: 215, flat: 1 },
} as const;

interface LedgerRow {
  seed: number;
  gateMin: number;
  gateMean: number;
  gateMax: number;
  detour: number;
  attempts: number;
  fallback: boolean;
}

/** The 500-seed sweep under one config. */
function sweep(c: TerrainConfig): LedgerRow[] {
  const rows: LedgerRow[] = [];
  for (let seed = 1; seed <= 500; seed++) {
    const map = generateTerrain(seed, c);
    const anchor = anchorOf(map, c);
    const m = measureApproach(map, c, anchor, CORE_W, CORE_H);
    expect(m.allReachable, `seed ${seed}`).toBe(true);
    rows.push({
      seed,
      gateMin: m.min,
      gateMean: m.mean,
      gateMax: m.max,
      detour: measureTerrain(map, c).maxGateDetour,
      attempts: map.attempts,
      fallback: map.fallback,
    });
  }
  return rows;
}

type LedgerKey = 'gateMin' | 'gateMean' | 'gateMax' | 'detour';
const LEDGER_KEYS: readonly LedgerKey[] = ['gateMin', 'gateMean', 'gateMax', 'detour'];

/** Assert a sweep against a recorded ledger, naming the worst seed per row. */
function checkLedger(
  rows: LedgerRow[],
  want: typeof LEDGER_500 | typeof LEDGER_500_PRE,
  label: string,
): void {
  for (const key of LEDGER_KEYS) {
    const row = want[key];
    const vals = rows.map((r) => r[key]);
    const lo = rows.reduce((a, b) => (b[key] < a[key] ? b : a));
    const hi = rows.reduce((a, b) => (b[key] > a[key] ? b : a));
    expect(lo[key], `${label} ${key} min`).toBeCloseTo(row.min, 3);
    expect(lo.seed, `${label} ${key} worst-low seed`).toBe(row.minSeed);
    expect(hi[key], `${label} ${key} max`).toBeCloseTo(row.max, 3);
    expect(hi.seed, `${label} ${key} worst-high seed`).toBe(row.maxSeed);
    expect(vals.reduce((a, b) => a + b, 0) / vals.length, `${label} ${key} mean`).toBeCloseTo(
      row.mean,
      3,
    );
  }
}

describe('fb064o — the ledger over 500 seeds', () => {
  it('matches the recorded min/mean/max, with the worst seed named per row', () => {
    const rows = sweep(cfg);
    checkLedger(rows, LEDGER_500, 'shipped');

    // The band's price over this window, recorded rather than assumed: **zero**
    // seeds retry. At the 3-gate 56x32 layout exactly one did (seed 387); the
    // fourth gate lowers this window's worst uncapped detour (1.2362) well
    // clear of the 1.5 ceiling, so nothing in 1..500 needs the band at all —
    // the finding the header states for the two identical tables.
    expect(rows.filter((r) => r.attempts > 1).map((r) => r.seed)).toEqual([]);
    expect(rows.filter((r) => r.fallback)).toEqual([]);
  });

  it('records the untreated spread too — the control the band is justified by', () => {
    // Same 500 seeds, band off. This is the row a wave retune reads: what the
    // terrain hands a run when nothing holds it.
    const rows = sweep(NO_BAND);
    checkLedger(rows, LEDGER_500_PRE, 'pre-band');

    // And the diff, stated rather than left to be computed from two tables:
    // there isn't one. Every row is byte-identical between the banded and
    // unbanded sweeps over this window — the control that makes "the band
    // costs nothing here" a measurement rather than an assumption.
    expect(LEDGER_500).toEqual(LEDGER_500_PRE);
  });
});

describe('fb064o — the band, and what it is worth', () => {
  it('holds the worst seeds the full seed domain admits', () => {
    // The witnesses. fb064r's lesson applied at the start rather than after:
    // over seeds 1..500 the worst detour is well under the band and the spread
    // looks benign, which is *not* the domain a run draws from (fb064j: the
    // whole int32 / uint32 range, negatives included). Sampled across that
    // domain, terrain could still hand one gate a 2.8x walk even with a fourth
    // gate open. Each witness is checked *both* ways: what it measured without
    // the band, and what it ships with it.
    // Re-measured at fb156's 4-gate layout: found in a 40,000-seed comb
    // (stride 27191 from 0); the 3-gate 56x32 witnesses (1887319188 at 6.1356,
    // 928319093 at 4.2653) are far less extreme maps at this gate geometry —
    // a fourth gate gives every seed another independent, usually-shorter
    // route in, so the domain's worst uncapped detour drops sharply.
    const witnesses: Array<[number, number]> = [
      [654840853, 2.8],
      [254317423, 2.4],
    ];
    for (const [seed, before] of witnesses) {
      const uncapped = generateTerrain(seed, NO_BAND);
      expect(measureTerrain(uncapped, NO_BAND).maxGateDetour, `seed ${seed} control`).toBeCloseTo(
        before,
        3,
      );

      const shipped = generateTerrain(seed, cfg);
      const detour = measureTerrain(shipped, cfg).maxGateDetour;
      expect(detour, `seed ${seed} shipped`).toBeLessThanOrEqual(cfg.constraints.maxGateDetour);
      expect(detour, `seed ${seed} shipped`).toBeGreaterThanOrEqual(1);
      // A band that "held" a seed by downgrading it to the flat arena would be
      // a worse outcome than the seed it refused.
      expect(shipped.fallback, `seed ${seed} must not fall back`).toBe(false);
      expect(shipped.hash).not.toBe(uncapped.hash);
    }
  });

  it('pins `ROOM_RADIUS`, which this item turned into an input to legality', () => {
    // Before fb064o, `suggestCoreAnchor`'s build-room tie-break could not make
    // a map legal or illegal — it only chose among anchors `legalCoreAnchors`
    // had already validated, and that clause is what kept `ROOM_RADIUS` out of
    // `data/terrain.json` against architecture rule 4. The band broke it:
    // `terrainLegal` now reads a detour measured *to the anchor the tie-break
    // picks*.
    //
    // Seed 20817 is the witness at fb156's 4-gate layout (found the same way:
    // sweeping radius 1 vs 2 over seeds 1..50000 — the anchor moves on 2042
    // seeds and legality flips on this one; the 3-gate 56x32 layout's witness,
    // seed 6832, no longer flips at this gate geometry). Its two front-runners
    // are equidistant from `CORE_X/CORE_Y`, so the room key alone separates
    // them — and they land on opposite sides of the band.
    const map = generateTerrain(20817, cfg);
    expect(map.attempts).toBe(1);
    const anchors = legalCoreAnchors(map, cfg);
    expect(anchors).toContain(527);
    expect(anchors).toContain(531);

    // Equidistant, so `ROOM_RADIUS` is the only thing deciding between them.
    const d2 = (a: number) => (((a % map.w) - 25) ** 2 + (((a / map.w) | 0) - 9) ** 2);
    expect(d2(527)).toBe(d2(531));

    // Radius 2 picks 531 (27,9), which ships. Radius 1 picks 527 (23,9), which
    // the band refuses — so the constant decides which map seed 20817 plays.
    expect(suggestCoreAnchor(map, cfg, anchors)).toBe(531);
    expect(maxGateDetour(map, cfg, 531, CORE_W, CORE_H)).toBeCloseTo(1.0288, 3);
    expect(maxGateDetour(map, cfg, 527, CORE_W, CORE_H)).toBeCloseTo(1.7333, 3);
    expect(maxGateDetour(map, cfg, 527, CORE_W, CORE_H)).toBeGreaterThan(
      cfg.constraints.maxGateDetour,
    );
  });

  it('every map the generator ships is inside the band', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const map = generateTerrain(seed, cfg);
      const m = measureTerrain(map, cfg);
      expect(m.maxGateDetour, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      expect(m.maxGateDetour, `seed ${seed}`).toBeLessThanOrEqual(cfg.constraints.maxGateDetour);
      expect(terrainLegal(m, cfg), `seed ${seed}`).toBe(true);
    }

    // The band's edge, on real generator output rather than a hand-mutated
    // `TerrainMeasure`. Seed 95051407 measures exactly 1.500000 and ships:
    // proof that the `<=` is genuinely inclusive where it counts, which a
    // strict `<` would turn into a silent extra retry. (Re-measured at fb156's
    // 4-gate layout — this is `tests/terrain-band-ledger.test.ts`'s own
    // `maxGateDetour` ceiling witness, shared rather than re-found; the 3-gate
    // 56x32 witness, 3819441428, no longer measures 1.5 with the fourth gate
    // open.)
    const edge = generateTerrain(95051407, cfg);
    expect(measureTerrain(edge, cfg).maxGateDetour).toBe(1.5);
    expect(edge.attempts).toBe(1);
    expect(edge.fallback).toBe(false);
  });

  it('bounds the *suggested* anchor only — recorded, because fb064c moves it', () => {
    // The scoped limit of what this band buys. It is measured to one anchor,
    // and the Core becomes player-placed at fb064c: a map the band passed can
    // still offer a legal Core position with a far worse approach. Inert today
    // (nothing places a Core), recorded now so the merge inherits the number
    // instead of the surprise.
    let seedsWithOver = 0;
    let sumWorst = 0;
    let worst = { detour: 0, seed: 0, anchor: 0 };
    for (let seed = 1; seed <= 120; seed++) {
      const map = generateTerrain(seed, cfg);
      let seedWorst = 0;
      for (const a of legalCoreAnchors(map, cfg)) {
        const d = maxGateDetour(map, cfg, a, CORE_W, CORE_H);
        if (d > seedWorst) seedWorst = d;
        if (d > worst.detour) worst = { detour: d, seed, anchor: a };
      }
      sumWorst += seedWorst;
      if (seedWorst > cfg.constraints.maxGateDetour) seedsWithOver++;
    }
    // Re-measured at fb156's 4-gate layout (3-gate 56x32: 115 seeds, mean
    // 2.435, worst 7.444 at seed 64 anchor 841). The rate and the mean barely
    // move, but the worst single anchor gets markedly worse (7.444 -> 10.852):
    // a fourth gate adds ground that is close to it but far from the other
    // three, so an off-anchor pick can now be a much longer detour from
    // *some* gate even while the suggested anchor itself stays well inside
    // the band.
    expect(seedsWithOver, 'seeds offering a legal anchor outside the band').toBe(114);
    expect(sumWorst / 120, 'mean worst-over-all-anchors detour').toBeCloseTo(2.792, 3);
    expect(worst.detour).toBeCloseTo(10.852, 3);
    expect([worst.seed, worst.anchor]).toEqual([74, 74]);
  });

  it('`terrainLegal` refuses a measure outside the band, and the `-1` sentinel', () => {
    const legal = measureTerrain(generateTerrain(1, cfg), cfg);
    expect(terrainLegal(legal, cfg)).toBe(true);

    const over: TerrainMeasure = { ...legal, maxGateDetour: 1.51 };
    expect(terrainLegal(over, cfg)).toBe(false);
    // On the band's edge, inclusive — the same `<=`/`>=` reading every other
    // band uses.
    expect(terrainLegal({ ...legal, maxGateDetour: 1.5 }, cfg)).toBe(true);

    // `-1` is "not measurable", and it must not read as the shortest possible
    // approach. This is the whole reason the lower half of the check exists.
    expect(terrainLegal({ ...legal, maxGateDetour: -1 }, cfg)).toBe(false);
    expect(terrainLegal({ ...legal, maxGateDetour: 0.99 }, cfg)).toBe(false);
  });

  it('the loader refuses a band no map can ever satisfy', () => {
    // fb064g's rule, one band on: a value below 1 is not a tight tuning
    // choice, it is unsatisfiable arithmetic — every seed would be degenerate
    // and every run would silently play the flat fallback.
    for (const bad of [0.999, 0, -1]) {
      expect(() => withBand({ maxGateDetour: bad })).toThrow();
    }
    for (const bad of [Infinity, NaN]) {
      expect(() => withBand({ maxGateDetour: bad })).toThrow();
    }

    // Exactly 1 loads, and must: the flat arena measures 1 and so do real
    // generated maps (seed 7 is the ledger's minimum), so it is a band no seed
    // *can* be proved unable to clear — the only kind of ceiling this loader
    // is allowed to enforce (see `config.ts`'s note on density-derived
    // ceilings, and fb064a's QA finding that killed them).
    //
    // What it is not is *cheap*, and the honest number belongs next to the
    // claim rather than behind a cherry-picked seed. Measured over seeds
    // 1..200 at each band, re-measured at fb156's 4-gate layout:
    //   1.0 — **73/200 ship the flat fallback**
    //   1.1 —  0/200 fallback
    // (At the 3-gate 56x32 layout this read 113/200 fallback at 1.0 and 0/200
    // at 1.1 — a fourth gate makes "every gate walks in dead straight"
    // noticeably less rare, since a run only needs *one* of four gates to sit
    // on a clean line rather than one of three; `maxGateDetour: 1` is still a
    // harsh floor, just less so than the 3-gate reading, and still one the
    // generator can satisfy given enough retries, which is the property this
    // test actually needs.) So 1.0 is fb064g's failure mode milder than an
    // unsatisfiable band, accepted at load because refusing data the
    // generator *does* satisfy is the worse error. The flagged fallback is
    // the designed answer to a band that strict.
    const tight = withBand({ maxGateDetour: 1 });
    expect(tight.constraints.maxGateDetour).toBe(1);
    // Seed 7 still ships legally at this band — the same seed the ledger
    // above names as its minimum, and now the first seed from 1 that does so
    // (no witness swap needed at this gate layout).
    const strict = generateTerrain(7, tight);
    expect(strict.attempts).toBe(1);
    expect(strict.fallback).toBe(false);
    expect(measureTerrain(strict, tight).maxGateDetour).toBe(1);
    const fallbacksAt = (v: number): number => {
      const c = withBand({ maxGateDetour: v });
      let n = 0;
      for (let seed = 1; seed <= 200; seed++) if (generateTerrain(seed, c).fallback) n++;
      return n;
    };
    expect(fallbacksAt(1), 'the recorded cost of maxGateDetour: 1').toBe(73);
    // Re-measured: the cliff is still between 1.06 (10 fallbacks) and 1.08
    // (0) — the same location as the 3-gate 56x32 reading, though milder on
    // its steep side (10 fallbacks against 16).
    expect(fallbacksAt(1.06), 'just above the cliff`s steep side').toBe(10);
    expect(fallbacksAt(1.08), 'just past the cliff').toBe(0);
    // The shipped value, and the reason it is 1.5 rather than as tight as the
    // data allows: it sits clear of that cliff with nothing falling back.
    expect(fallbacksAt(cfg.constraints.maxGateDetour), 'the shipped band').toBe(0);

    // And a large value is a legitimate "band off", the reading
    // `minCorridorWidth: 1` already has.
    expect(NO_BAND.constraints.maxGateDetour).toBe(1e6);
  });
});
