/**
 * fb178 (BACKLOG-TERRAIN.md; owner feedback `terrain-four-gates`: "tier
 * modifiers that add a gate now go to 5") — `MODIFIER_GATES`' fixed
 * `'south2'` position (`grid.ts`) was the only one of the (eventual) five
 * gates that never jittered; the base four do (`jitterGates`, fb156, pinned
 * by `tests/terrain-four-gates.test.ts`). `jitterModifierGate(seed)`
 * (`src/sim/terrain/gates.ts`) is its sibling: a seed-jittered position for
 * the same `'south2'` key, on the same edge, clear of the base four's jitter
 * zone by construction.
 *
 * This file matches `tests/terrain-four-gates.test.ts`'s own rigor: a
 * structural sweep over `jitterModifierGate` alone, then a live 5-gate
 * generation sweep (`[...jitterGates(seed), jitterModifierGate(seed)]`)
 * against every owner band, both at 1000+ seeds.
 */

import { describe, expect, it } from 'vitest';

import { GRID_H, GRID_W } from '../src/sim/grid';
import {
  generateTerrain,
  jitterGates,
  jitterModifierGate,
  loadTerrain,
  measureTerrain,
  MODIFIER_GATE_MAX_TX,
  terrainLegal,
  type TerrainMeasure,
} from '../src/sim/terrain';
import { failedBands, legalMeasure } from './terrain-legality';

const cfg = loadTerrain();

describe('fb178 — jitterModifierGate: structural validity', () => {
  it('is deterministic: the same seed always gives the same position', () => {
    for (const seed of [0, 1, 7, 40, -1, 2 ** 31, 0xffffffff]) {
      expect(jitterModifierGate(seed)).toEqual(jitterModifierGate(seed));
    }
  });

  it("always keys 'south2'", () => {
    expect(jitterModifierGate(12345).key).toBe('south2');
  });

  it('is independent of jitterGates: calling one does not perturb the other', () => {
    for (const seed of [1, 2, 3, 12345]) {
      const gatesAlone = jitterGates(seed);
      const modifierAlone = jitterModifierGate(seed);
      const gatesWithModifier = jitterGates(seed);
      const modifierWithGates = jitterModifierGate(seed);
      expect(gatesWithModifier).toEqual(gatesAlone);
      expect(modifierWithGates).toEqual(modifierAlone);
    }
  });

  it('is a real jitter, not a static coordinate: tx varies by seed', () => {
    const tx = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      tx.add(jitterModifierGate(seed).tx);
    }
    expect(tx.size).toBeGreaterThan(5);
  });

  const STRUCTURAL_SWEEP = 5000;

  it(`sits on the south edge, never a corner, within [1, MODIFIER_GATE_MAX_TX], over ${STRUCTURAL_SWEEP} seeds`, () => {
    const offenders: string[] = [];
    const lo = 1;
    const hi = MODIFIER_GATE_MAX_TX;
    for (let seed = 1; seed <= STRUCTURAL_SWEEP; seed++) {
      const g = jitterModifierGate(seed);
      if (g.ty !== GRID_H - 1) offenders.push(`seed ${seed}: ty=${g.ty}`);
      if (g.tx < lo || g.tx > hi) offenders.push(`seed ${seed}: tx=${g.tx} out of [${lo},${hi}]`);
      const isCorner = (g.tx === 0 || g.tx === GRID_W - 1) && (g.ty === 0 || g.ty === GRID_H - 1);
      if (isCorner) offenders.push(`seed ${seed}: south2 is a corner (${g.tx},${g.ty})`);
    }
    expect(offenders.slice(0, 10)).toEqual([]);
  });

  it(`never collides with any of jitterGates' 4 base gates, over ${STRUCTURAL_SWEEP} seeds`, () => {
    const offenders: string[] = [];
    for (let seed = 1; seed <= STRUCTURAL_SWEEP; seed++) {
      const base = jitterGates(seed);
      const modifier = jitterModifierGate(seed);
      for (const g of base) {
        if (g.tx === modifier.tx && g.ty === modifier.ty) {
          offenders.push(`seed ${seed}: ${g.key} collides with south2 at ${g.tx},${g.ty}`);
        }
      }
    }
    expect(offenders.slice(0, 10)).toEqual([]);
  });

  // fb156 QA bug 2: "never collides" only meant "never the same tile". With
  // south2 drawn from [1, 7] and the base south from [8, 47], 23 of 5,001
  // seeds (76, 235, ...) put them side by side on row 31 — two path
  // indicators down one corridor, a fifth gate that adds nothing, and a
  // breach of grid.ts's "no two gates adjacent" invariant that config.ts's
  // `flatCoreAnchorCount` leans on. Chebyshev distance > 1 to every base
  // gate, over the same 5,000-seed span the QA sweep found them in.
  it('is never adjacent to any base gate, over 5000 seeds (seed 76 was)', () => {
    const offenders: string[] = [];
    for (let seed = 0; seed <= 5000; seed++) {
      const modifier = jitterModifierGate(seed);
      for (const g of jitterGates(seed)) {
        const d = Math.max(Math.abs(g.tx - modifier.tx), Math.abs(g.ty - modifier.ty));
        if (d <= 1) offenders.push(`seed ${seed}: ${g.key}@${g.tx},${g.ty} next to south2@${modifier.tx},${modifier.ty}`);
      }
    }
    expect(offenders.slice(0, 10)).toEqual([]);
  });
});

const SWEEP = 1000;

describe(`fb178 — generation constraints hold at 5 gates (4 jittered + jittered south2) across ${SWEEP} seeds`, () => {
  const measures: TerrainMeasure[] = [];
  const fallbacks: number[] = [];
  for (let seed = 1; seed <= SWEEP; seed++) {
    const gates = [...jitterGates(seed), jitterModifierGate(seed)];
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
      const m = measures[i];
      if (m === undefined) throw new Error(`measures[${i}] out of range`);
      if (!terrainLegal(m, cfg)) {
        bad.push(`seed ${i + 1}: ${failedBands(m, cfg).join(', ')}`);
      }
      expect(legalMeasure(m, cfg)).toBe(terrainLegal(m, cfg));
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('no gate is ever enclosed, and all 5 gates share one walkable component', () => {
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

  it('every one of the 5 gates reaches >= 80% of the walkable area', () => {
    const worst = Math.min(...measures.map((m) => m.gateReachFrac));
    expect(worst).toBeGreaterThanOrEqual(cfg.constraints.minGateReachFrac);
  });

  it('legal Core anchors are >= 15% of normal tiles, and every one clears every gate (including south2) by >= 3', () => {
    const worst = Math.min(...measures.map((m) => m.coreLegalFrac));
    expect(worst).toBeGreaterThanOrEqual(cfg.constraints.minCoreLegalFrac);
    expect(cfg.coreGateClearance).toBeGreaterThanOrEqual(3);
  });

  it('the worst detour factor stays inside the band', () => {
    const worst = Math.max(...measures.map((m) => m.maxGateDetour));
    expect(worst).toBeGreaterThanOrEqual(1);
    expect(worst).toBeLessThanOrEqual(cfg.constraints.maxGateDetour);
  });

  it('no two of the 5 gates ever share a tile, for every seed in the sweep', () => {
    const offenders: string[] = [];
    for (let seed = 1; seed <= SWEEP; seed++) {
      const gates = [...jitterGates(seed), jitterModifierGate(seed)];
      for (let a = 0; a < gates.length; a++) {
        for (let b = a + 1; b < gates.length; b++) {
          const ga = gates[a];
          const gb = gates[b];
          if (ga === undefined || gb === undefined) throw new Error('gate index out of range');
          if (ga.tx === gb.tx && ga.ty === gb.ty) {
            offenders.push(`seed ${seed}: ${ga.key} and ${gb.key} share ${ga.tx},${ga.ty}`);
          }
        }
      }
    }
    expect(offenders.slice(0, 10)).toEqual([]);
  });
});
