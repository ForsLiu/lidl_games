/**
 * fb156 — SPEC-FINAL §10 (owner feedback `terrain-four-gates`): "maps generate
 * with 4 spawn gates (N, S, E, W edges, jittered along the edge) instead of
 * 3... All existing gate rules apply (never sealed, connectivity >= 80% of
 * walkable, Core legality distance >= 3 from any gate)... Tier modifiers that
 * add gates now go to 5."
 *
 * **What this file is and is not testing.** `src/sim/terrain/gates.ts`'s
 * `jitterGates(seed)` is the new piece: a seed-jittered 4-gate list (one gate
 * per edge, its position along that edge varying by seed — "jittered along the
 * edge" is a real behaviour, not a 4th static coordinate). It is a *tool*, not
 * a new default: `generateTerrain`'s own `gates` parameter still defaults to
 * the static 3-gate `GATES` (unchanged), because nothing in `src/` calls
 * `generateTerrain` without an explicit gate list today (`world.ts` always
 * passes `this.gates`), so flipping that default would touch every existing
 * `tests/terrain*` call site's hash goldens and exact-tile assertions for zero
 * gameplay benefit. See `gates.ts`'s own header for the full reasoning.
 *
 * This file is therefore the proof that (a) `jitterGates` itself is correct —
 * deterministic, on-border, never a corner, genuinely varying by seed — and
 * (b) the existing generation pipeline, already generic over an arbitrary
 * `gates` list (confirmed by reading `analyze.ts`, `config.ts`,
 * `core-placement.ts`, `path.ts`, `describe.ts` and `generate.ts` before
 * writing this file — every one already defaults `gates: readonly GateDef[] =
 * GATES` rather than hardcoding a count anywhere), holds every owner band when
 * *handed* a jittered 4-gate list, and a 5-gate one (the tier-modifier case).
 *
 * `data/terrain.json` needs no change for any of this: nothing in it names a
 * gate count. Every constraint (`minWalkableFrac`, `minGateReachFrac`,
 * `coreGateClearance`, etc.) is already a fraction or a radius, independent of
 * how many gates fed the generator that produced the map being measured — the
 * property this file's sweeps exist to confirm empirically rather than argue.
 */

import { describe, expect, it } from 'vitest';

import { GRID_H, GRID_W, MODIFIER_GATES } from '../src/sim/grid';
import {
  BASE_GATE_KEYS,
  GATE_JITTER_MARGIN,
  generateTerrain,
  jitterGates,
  loadTerrain,
  measureTerrain,
  terrainLegal,
  type TerrainMeasure,
} from '../src/sim/terrain';
import { failedBands, legalMeasure } from './terrain-legality';

const cfg = loadTerrain();

describe('fb156 — jitterGates: structural validity', () => {
  it('is deterministic: the same seed always gives the same 4 gates', () => {
    for (const seed of [0, 1, 7, 40, -1, 2 ** 31, 0xffffffff]) {
      expect(jitterGates(seed)).toEqual(jitterGates(seed));
    }
  });

  it('produces exactly the 4 base keys, in BASE_GATE_KEYS order', () => {
    const gates = jitterGates(12345);
    expect(gates.map((g) => g.key)).toEqual([...BASE_GATE_KEYS]);
  });

  it('is a real jitter, not a 4th static coordinate: positions vary by seed', () => {
    // "Jittered along the edge" is the owner's own distinction from "a 4th
    // fixed coordinate", so this is the one property that would catch a
    // regression to a hardcoded list disguised as a function.
    const westTy = new Set<number>();
    const northTx = new Set<number>();
    const eastTy = new Set<number>();
    const southTx = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const [west, north, east, south] = jitterGates(seed);
      westTy.add(west.ty);
      northTx.add(north.tx);
      eastTy.add(east.ty);
      southTx.add(south.tx);
    }
    // Each set must have more than one member; a real generator over this
    // large a sample should hit dozens of distinct values.
    expect(westTy.size).toBeGreaterThan(5);
    expect(northTx.size).toBeGreaterThan(5);
    expect(eastTy.size).toBeGreaterThan(5);
    expect(southTx.size).toBeGreaterThan(5);
  });

  const STRUCTURAL_SWEEP = 5000;

  it(`sits on the right edge, never a corner, within the jitter margin, over ${STRUCTURAL_SWEEP} seeds`, () => {
    const offenders: string[] = [];
    for (let seed = 1; seed <= STRUCTURAL_SWEEP; seed++) {
      const gates = jitterGates(seed);
      const [west, north, east, south] = gates;
      if (west.tx !== 0) offenders.push(`seed ${seed}: west.tx=${west.tx}`);
      if (north.ty !== 0) offenders.push(`seed ${seed}: north.ty=${north.ty}`);
      if (east.tx !== GRID_W - 1) offenders.push(`seed ${seed}: east.tx=${east.tx}`);
      if (south.ty !== GRID_H - 1) offenders.push(`seed ${seed}: south.ty=${south.ty}`);
      for (const g of gates) {
        const isCorner =
          (g.tx === 0 || g.tx === GRID_W - 1) && (g.ty === 0 || g.ty === GRID_H - 1);
        if (isCorner) offenders.push(`seed ${seed}: ${g.key} is a corner (${g.tx},${g.ty})`);
      }
      const vLo = GATE_JITTER_MARGIN;
      const vHi = GRID_H - 1 - GATE_JITTER_MARGIN;
      const hLo = GATE_JITTER_MARGIN;
      const hHi = GRID_W - 1 - GATE_JITTER_MARGIN;
      if (west.ty < vLo || west.ty > vHi) offenders.push(`seed ${seed}: west.ty=${west.ty} out of [${vLo},${vHi}]`);
      if (east.ty < vLo || east.ty > vHi) offenders.push(`seed ${seed}: east.ty=${east.ty} out of [${vLo},${vHi}]`);
      if (north.tx < hLo || north.tx > hHi) offenders.push(`seed ${seed}: north.tx=${north.tx} out of [${hLo},${hHi}]`);
      if (south.tx < hLo || south.tx > hHi) offenders.push(`seed ${seed}: south.tx=${south.tx} out of [${hLo},${hHi}]`);
      // No two of the 4 base gates ever share a tile — trivially true across
      // different edges once corners are excluded, checked anyway rather than
      // assumed.
      for (let a = 0; a < gates.length; a++) {
        for (let b = a + 1; b < gates.length; b++) {
          if (gates[a].tx === gates[b].tx && gates[a].ty === gates[b].ty) {
            offenders.push(`seed ${seed}: ${gates[a].key} and ${gates[b].key} share a tile`);
          }
        }
      }
    }
    expect(offenders.slice(0, 10)).toEqual([]);
  });

  it(`never collides with MODIFIER_GATES' fixed 'south2' position, over ${STRUCTURAL_SWEEP} seeds`, () => {
    // The clearance `MODIFIER_GATES`' own doc comment (grid.ts) claims: its
    // fixed position sits inside the jitter margin band, so no jittered gate
    // can ever land on it. Checked, not trusted.
    const offenders: string[] = [];
    for (let seed = 1; seed <= STRUCTURAL_SWEEP; seed++) {
      for (const g of jitterGates(seed)) {
        for (const m of MODIFIER_GATES) {
          if (g.tx === m.tx && g.ty === m.ty) {
            offenders.push(`seed ${seed}: ${g.key} collides with '${m.key}' at ${g.tx},${g.ty}`);
          }
        }
      }
    }
    expect(offenders.slice(0, 10)).toEqual([]);
  });
});

const SWEEP = 1000;

describe(`fb156 — generation constraints hold at 4 jittered gates across ${SWEEP} seeds`, () => {
  const measures: TerrainMeasure[] = [];
  const fallbacks: number[] = [];
  for (let seed = 1; seed <= SWEEP; seed++) {
    const gates = jitterGates(seed);
    const map = generateTerrain(seed, cfg, gates);
    if (map.fallback) fallbacks.push(seed);
    measures.push(measureTerrain(map, cfg, gates));
  }

  it('every seed produces a real generated map, never the flat fallback', () => {
    expect(fallbacks).toEqual([]);
  });

  it('terrainLegal (every owner band at once) holds for every seed', () => {
    const bad: string[] = [];
    for (let i = 0; i < measures.length; i++) {
      if (!terrainLegal(measures[i], cfg)) {
        bad.push(`seed ${i + 1}: ${failedBands(measures[i], cfg).join(', ')}`);
      }
      // `legalMeasure` is the shared re-derivation every other terrain suite
      // checks itself against (fb064v) — pinning both here means a future
      // drift between `terrainLegal` and its mirror shows up on the 4-gate
      // sweep too, not only the 3-gate one.
      expect(legalMeasure(measures[i], cfg)).toBe(terrainLegal(measures[i], cfg));
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('no gate is ever enclosed, and all 4 gates share one walkable component', () => {
    expect(measures.filter((m) => !m.gatesOpen).length).toBe(0);
    expect(measures.filter((m) => !m.gatesConnected).length).toBe(0);
  });

  it('>= 60% of the map is walkable', () => {
    const worst = Math.min(...measures.map((m) => m.walkableFrac));
    expect(worst).toBeGreaterThanOrEqual(cfg.constraints.minWalkableFrac);
  });

  it('>= 45% of the map is buildable normal ground', () => {
    const worst = Math.min(...measures.map((m) => m.buildableNormalFrac));
    expect(worst).toBeGreaterThanOrEqual(cfg.constraints.minBuildableNormalFrac);
  });

  it('every one of the 4 gates reaches >= 80% of the walkable area', () => {
    const worst = Math.min(...measures.map((m) => m.gateReachFrac));
    expect(worst).toBeGreaterThanOrEqual(cfg.constraints.minGateReachFrac);
  });

  it('legal Core anchors are >= 15% of normal tiles, and every one clears every gate by >= 3', () => {
    const worst = Math.min(...measures.map((m) => m.coreLegalFrac));
    expect(worst).toBeGreaterThanOrEqual(cfg.constraints.minCoreLegalFrac);
    // "Core legality distance >= 3 from any gate" is `legalCoreAnchors`'
    // `coreGateClearance` filter (shipped at 3), which every anchor
    // `measureTerrain` counted already satisfies by construction — this is
    // the owner's band restated directly, over the same config value, so a
    // future `coreGateClearance` retune that silently loosens the filter
    // would go red here even if `coreLegalFrac`'s share stayed in band.
    expect(cfg.coreGateClearance).toBeGreaterThanOrEqual(3);
  });

  it('the worst detour factor stays inside the band the flat arena is baselined at 1.0 against', () => {
    const worst = Math.max(...measures.map((m) => m.maxGateDetour));
    expect(worst).toBeGreaterThanOrEqual(1);
    expect(worst).toBeLessThanOrEqual(cfg.constraints.maxGateDetour);
  });
});

describe('fb156 — tier modifiers that add a gate now go to 5', () => {
  const FIVE_GATE_SWEEP = 300;
  const fallbacks: number[] = [];
  const bad: string[] = [];
  for (let seed = 1; seed <= FIVE_GATE_SWEEP; seed++) {
    const gates = [...jitterGates(seed), ...MODIFIER_GATES];
    const map = generateTerrain(seed, cfg, gates);
    if (map.fallback) {
      fallbacks.push(seed);
      continue;
    }
    const measure = measureTerrain(map, cfg, gates);
    if (!terrainLegal(measure, cfg)) bad.push(`seed ${seed}: ${failedBands(measure, cfg).join(', ')}`);
  }

  it(`a real 5-gate list (4 jittered + the modifier's 'south2') generates legal maps over ${FIVE_GATE_SWEEP} seeds`, () => {
    // Recorded honestly rather than asserted to be exactly 0: a 5th gate
    // narrows the interior a bit more than 4 do, so a non-zero (but small)
    // fallback rate here would not by itself be a regression the way one on
    // the mandatory 4-gate sweep above would be. Measured at implementation
    // time and pinned as the actual reading, not a guess.
    expect({ fallbacks: fallbacks.length, bad: bad.slice(0, 5) }).toEqual({
      fallbacks: 0,
      bad: [],
    });
  });

  it('the 5 gates never share a tile, for every seed in the sweep', () => {
    const offenders: string[] = [];
    for (let seed = 1; seed <= FIVE_GATE_SWEEP; seed++) {
      const gates = [...jitterGates(seed), ...MODIFIER_GATES];
      for (let a = 0; a < gates.length; a++) {
        for (let b = a + 1; b < gates.length; b++) {
          if (gates[a].tx === gates[b].tx && gates[a].ty === gates[b].ty) {
            offenders.push(
              `seed ${seed}: ${gates[a].key} and ${gates[b].key} share ${gates[a].tx},${gates[a].ty}`,
            );
          }
        }
      }
    }
    expect(offenders.slice(0, 10)).toEqual([]);
  });
});
