/**
 * fb205 (BACKLOG-TERRAIN.md, QUESTIONS Q220 point 6): `flatCoreAnchorCount`/
 * `maxCoreLegalFrac` bounded over the jitter domain, not just the static
 * `GATES` default.
 *
 * Two things pinned here:
 *   1. `flatCoreAnchorCount`/`maxCoreLegalFrac` still take an explicit
 *      `gates` list (additive — every existing call site keeps its old
 *      single-arg behaviour, pinned by the untouched suites in
 *      `terrain-generation.test.ts`/`terrain-flat.test.ts`).
 *   2. `jitterDomainCoreAnchorRange`'s fast inclusion-exclusion path against
 *      `flatCoreAnchorCount`'s own per-anchor scan, across a spread of
 *      clearances and random gate draws, plus the measured domain range at
 *      the shipped clearance and at fb156 QA bug 5's clearance 16 — so the
 *      fast path and the naive replica cannot silently drift apart.
 */
import { describe, expect, it } from 'vitest';

import { GATES, GRID_H, GRID_W, type GateDef } from '../src/sim/grid';
import { flatCoreAnchorCount, jitterDomainCoreAnchorRange, loadTerrain } from '../src/sim/terrain';
import { GATE_JITTER_MARGIN } from '../src/sim/terrain/gates';

const cfg = loadTerrain();

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function intRange(rand: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rand() * (hi - lo + 1));
}

describe('fb205 — flatCoreAnchorCount/maxCoreLegalFrac take an explicit gates list', () => {
  it('defaults to the static GATES — unchanged from every existing pin', () => {
    expect(flatCoreAnchorCount(3)).toBe(flatCoreAnchorCount(3, GATES));
    expect(flatCoreAnchorCount(17)).toBe(12);
    expect(flatCoreAnchorCount(18)).toBe(0);
  });

  it('a jittered gate list changes the count from the static one at a clearance where strips overlap', () => {
    const jittered: readonly GateDef[] = [
      { key: 'west', tx: 0, ty: 16 },
      { key: 'north', tx: 27, ty: 0 },
      { key: 'east', tx: GRID_W - 1, ty: 16 },
      { key: 'south', tx: 27, ty: GRID_H - 1 },
    ];
    expect(flatCoreAnchorCount(16, jittered)).not.toBe(flatCoreAnchorCount(16, GATES));
  });
});

describe('fb205 — jitterDomainCoreAnchorRange', () => {
  const vLo = GATE_JITTER_MARGIN;
  const vHi = GRID_H - 1 - GATE_JITTER_MARGIN;
  const hLo = GATE_JITTER_MARGIN;
  const hHi = GRID_W - 1 - GATE_JITTER_MARGIN;

  it('matches flatCoreAnchorCount’s own per-anchor scan across random jittered gate draws', () => {
    const rand = mulberry32(20260924);
    for (const clearance of [0, 1, 3, 8, 12, 16, 18, 27]) {
      // One domain sweep per clearance, not per draw — the range depends only
      // on `clearance`, and `jitterDomainCoreAnchorRange` is itself a full
      // 409,600-combination search, so hoisting this out of the inner loop
      // cuts this test from 96 sweeps to 8.
      const { min, max } = jitterDomainCoreAnchorRange(clearance);
      for (let i = 0; i < 12; i++) {
        const gates: readonly GateDef[] = [
          { key: 'west', tx: 0, ty: intRange(rand, vLo, vHi) },
          { key: 'north', tx: intRange(rand, hLo, hHi), ty: 0 },
          { key: 'east', tx: GRID_W - 1, ty: intRange(rand, vLo, vHi) },
          { key: 'south', tx: intRange(rand, hLo, hHi), ty: GRID_H - 1 },
        ];
        const naive = flatCoreAnchorCount(clearance, gates);
        expect(naive, `clearance ${clearance}, draw ${i}`).toBeGreaterThanOrEqual(min);
        expect(naive, `clearance ${clearance}, draw ${i}`).toBeLessThanOrEqual(max);
      }
    }
  });

  it('measured: at the shipped clearance 3 the domain never varies — no overlap within the jitter margin', () => {
    // Below the ~2*GATE_JITTER_MARGIN threshold where adjacent-edge exclusion
    // zones could ever touch, so every draw gives the same count as the
    // static default: the shipped loader ceiling is unaffected by fb205.
    expect(jitterDomainCoreAnchorRange(cfg.coreGateClearance)).toEqual({
      min: flatCoreAnchorCount(cfg.coreGateClearance, GATES),
      max: flatCoreAnchorCount(cfg.coreGateClearance, GATES),
    });
  });

  it('measured: fb156 QA bug 5’s clearance 16 — static reads 41, the domain spans 0..513', () => {
    expect(flatCoreAnchorCount(16, GATES)).toBe(41);
    expect(jitterDomainCoreAnchorRange(16)).toEqual({ min: 0, max: 513 });
  });

  it('the domain minimum is monotonically non-increasing as clearance grows', () => {
    let prevMin = Infinity;
    for (const clearance of [0, 3, 8, 12, 13, 16, 17, 18]) {
      const { min } = jitterDomainCoreAnchorRange(clearance);
      expect(min).toBeLessThanOrEqual(prevMin);
      prevMin = min;
    }
  });
});
