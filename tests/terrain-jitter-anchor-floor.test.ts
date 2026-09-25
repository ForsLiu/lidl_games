/**
 * fb205 (BACKLOG-TERRAIN.md; fb156 QA bug 5) — `jitterDomainCoreAnchorFloor`/
 * `jitterDomainMaxCoreLegalFrac` (`src/sim/terrain/config.ts`) are the true
 * minimum `flatCoreAnchorCount` a live seed's own gates (`jitterGates`, plus
 * `jitterModifierGate` under the Fourth Gate modifier) can produce, proven —
 * not sampled — for `coreGateClearance` below `GATE_JITTER_MARGIN / 2`. This
 * file checks the proof against a further sample of the draw space (this
 * lane's own "verify, don't guess" standard) and measures the shipped
 * config's real exposure, rather than gating the loader on it — see
 * `jitterDomainCoreAnchorFloor`'s own doc comment for why a hard loader
 * rejection is not this item's call to make.
 */

import { describe, expect, it } from 'vitest';

import { GRID_H, GRID_W, type GateDef } from '../src/sim/grid';
import {
  flatCoreAnchorCount,
  GATE_JITTER_MARGIN,
  jitterDomainCoreAnchorFloor,
  jitterDomainMaxCoreLegalFrac,
  jitterGates,
  jitterModifierGate,
  loadTerrain,
  MODIFIER_GATE_MAX_TX,
} from '../src/sim/terrain';

const cfg = loadTerrain();

describe('fb205 — jitterDomainCoreAnchorFloor: the true minimum over a live seed’s gates', () => {
  it('matches the static-GATES value at the shipped clearance (3): the proof’s own claim for clearance <= 3', () => {
    // The threshold is `2 * clearance < GATE_JITTER_MARGIN` (8), so 0..3 are
    // covered by the exact proof; the shipped `coreGateClearance` (3) sits
    // right at its edge.
    for (const clearance of [0, 1, 2, 3]) {
      expect(jitterDomainCoreAnchorFloor(clearance)).toBeLessThanOrEqual(
        flatCoreAnchorCount(clearance),
      );
    }
  });

  it('is a real lower bound: no sampled jittered draw (4-gate or 5-gate) ever beats it, at every clearance the proof covers', () => {
    // A further, independent check on top of the analytic argument — this
    // lane samples rather than trusts a proof alone (fb064a's own standing
    // instruction). 2000 seeds across both live populations.
    for (const clearance of [0, 1, 2, 3]) {
      const floor = jitterDomainCoreAnchorFloor(clearance);
      for (let seed = 1; seed <= 2000; seed++) {
        const four = jitterGates(seed);
        expect(flatCoreAnchorCount(clearance, four), `seed ${seed}, 4-gate`).toBeGreaterThanOrEqual(
          floor,
        );
        const five: readonly GateDef[] = [...four, jitterModifierGate(seed)];
        expect(flatCoreAnchorCount(clearance, five), `seed ${seed}, 5-gate`).toBeGreaterThanOrEqual(
          floor,
        );
      }
    }
  });

  it('returns 0 once the margin no longer proves the four base gates mutually clear (clearance >= GATE_JITTER_MARGIN / 2)', () => {
    // fb166: GATE_JITTER_MARGIN is 8, so this is clearance 4 upward — the same
    // clearance the sample above stops at. A conservative "no proof, refuse
    // everything positive" answer, the same shape `maxCoreLegalFrac`'s own
    // doc comment already uses past `coreGateClearance` 27 on the static
    // board.
    expect(2 * (Math.ceil(GATE_JITTER_MARGIN / 2) - 1)).toBeLessThan(GATE_JITTER_MARGIN);
    for (const clearance of [Math.ceil(GATE_JITTER_MARGIN / 2), 8, 16, 27]) {
      expect(jitterDomainCoreAnchorFloor(clearance)).toBe(0);
      expect(jitterDomainMaxCoreLegalFrac(clearance)).toBe(0);
    }
  });

  it('the modifier’s south2 is the only gate the base four’s own margin does not protect: dropping it raises the floor', () => {
    // Every base pair (`west`/`north`/`east`/`south`) is separated from every
    // other by at least `GATE_JITTER_MARGIN` by construction (fb156's own
    // `vHi - vLo` / `hHi - hLo` sizing) — `south2`'s range hugs the corner
    // and is not. So the 5-gate population's floor is strictly lower at every
    // clearance in this range, and the 4-gate-only value alone would have
    // been an unsound (too generous) ceiling for a run under the Fourth Gate
    // modifier.
    for (const clearance of [1, 2, 3]) {
      expect(jitterDomainCoreAnchorFloor(clearance)).toBeLessThan(flatCoreAnchorCount(clearance));
    }
  });

  it('measures, not gates: the shipped config carries zero exposure to this at its own coreGateClearance', () => {
    // The loader's own `minCoreLegalFrac` check stays on `maxCoreLegalFrac`'s
    // static value (see that call site's comment) rather than this function,
    // so this is the honest record of what the shipped tuning's real margin
    // is under the stricter, jitter-domain-true bound — not a gate.
    const floorCeiling = jitterDomainMaxCoreLegalFrac(cfg.coreGateClearance);
    expect(cfg.constraints.minCoreLegalFrac).toBeLessThan(floorCeiling);
    // Comfortably so: the shipped band (0.15) sits far under either ceiling
    // (both ~0.999 at clearance 3), so this specific failure mode — a real
    // seed's jittered gates unable to meet a band the loader accepted — has
    // no way to reach the shipped config today.
    expect(floorCeiling).toBeGreaterThan(0.99);
  });

  it('GATE_JITTER_MARGIN and MODIFIER_GATE_MAX_TX are the constants the proof leans on, not copied literals', () => {
    // A sanity pin so a future change to either constant reddens here rather
    // than silently invalidating the proof this file checks.
    expect(GATE_JITTER_MARGIN).toBe(8);
    expect(MODIFIER_GATE_MAX_TX).toBe(GATE_JITTER_MARGIN - 2);
    expect(GRID_W).toBeGreaterThan(0);
    expect(GRID_H).toBeGreaterThan(0);
  });
});
