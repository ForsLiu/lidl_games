/**
 * fb156 (owner feedback `terrain-four-gates`): "maps generate with 4 spawn
 * gates by default (N, S, E, W edges, jittered along the edge) instead of 3
 * ... Wave composition is split across 4 gates; path indicators show 4
 * colors. Tier modifiers that add gates now go to 5."
 *
 * The terrain lane shipped the generator half (`jitterGates`/
 * `jitterModifierGate`, 1000-seed property sweeps in
 * `tests/terrain-four-gates.test.ts` / `terrain-modifier-gate-jitter.test.ts`)
 * and fb153b put the static four `GATES` into every live run. What was still
 * missing is the jitter *in a live run*: `World` always built the same static
 * list, so every map had its gates at the same four tiles. This file pins the
 * live wiring and every consumer the owner named.
 */
import { describe, expect, it } from 'vitest';

import { GATE_PATH_COLORS } from '../src/render/theme';
import { GATES, GRID_H, GRID_W, TileType } from '../src/sim/grid';
import { startWave } from '../src/sim/run';
import {
  describeTerrain,
  gridTerrain,
  isJitteredGatePosition,
  jitterGates,
  jitterModifierGate,
  loadTerrain,
  parseTerrainDump,
} from '../src/sim/terrain';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const terrainCfg = loadTerrain();

describe('fb156 — a live run plays its seed\'s four jittered gates', () => {
  it('World.gates is the seed\'s jitterGates list, and the Grid opens exactly those tiles', () => {
    for (const seed of [1, 2, 3, 40, 97, 1234]) {
      const w = new World(cfg({ seed }));
      expect(w.gates, `seed ${seed}`).toEqual(jitterGates(seed));
      expect(w.gates.map((g) => g.key)).toEqual(['west', 'north', 'east', 'south']);
      for (const g of w.gates) expect(w.grid.tile[w.grid.idx(g.tx, g.ty)], `${seed} ${g.key}`).toBe(TileType.Gate);
      let gateTiles = 0;
      for (let i = 0; i < w.grid.tile.length; i++) if (w.grid.tile[i] === TileType.Gate) gateTiles++;
      expect(gateTiles, `seed ${seed}: a stray gate tile`).toBe(4);
    }
  });

  it('the gates really move from seed to seed — the jitter reaches the arena', () => {
    const layouts = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      layouts.add(JSON.stringify(new World(cfg({ seed })).gates));
    }
    expect(layouts.size, 'every seed played the same gate layout').toBeGreaterThan(10);
  });

  it('the Fourth Gate modifier makes it five, its fifth jittered too', () => {
    for (const seed of [1, 7, 40]) {
      const w = new World(cfg({ seed, modifiers: ['gate'] }));
      expect(w.gates).toEqual([...jitterGates(seed), jitterModifierGate(seed)]);
      expect(w.gates).toHaveLength(5);
    }
  });

  it('a practice run (Training Grounds) plays the same jittered gates on its flat arena', () => {
    const w = new World(cfg({ seed: 5, practice: true }));
    expect(w.gates).toEqual(jitterGates(5));
    expect(w.terrainFallback).toBe(false);
  });

  it('every gate reaches the Core on a live sweep (the never-sealed rule holds at four)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const w = new World(cfg({ seed }));
      expect(w.grid.allGatesReachable(), `seed ${seed}`).toBe(true);
    }
  });
});

describe('fb156 — every consumer uses all of the run\'s gates', () => {
  it('a TD wave\'s spawn queue is split across all four gates', () => {
    const w = new World(cfg({ seed: 3 }));
    startWave(w);
    const used = new Set(w.spawnQueue.map(([, gateIdx]) => gateIdx));
    expect([...used].sort()).toEqual([0, 1, 2, 3]);
  });

  it('with the Fourth Gate, the split reaches the fifth gate too', () => {
    const w = new World(cfg({ seed: 3, modifiers: ['gate'] }));
    startWave(w);
    const used = new Set(w.spawnQueue.map(([, gateIdx]) => gateIdx));
    expect([...used].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('path indicators have a distinct color for every gate a five-gate run can have', () => {
    expect(GATE_PATH_COLORS.length).toBeGreaterThanOrEqual(5);
    expect(new Set(GATE_PATH_COLORS.slice(0, 5)).size).toBe(5);
  });

  it('a practice run\'s flat-arena dump (source=flat-arena) round-trips on its jittered gates', () => {
    const w = new World(cfg({ seed: 5, practice: true }));
    const parsed = parseTerrainDump(describeTerrain(w.terrainMap, terrainCfg, w.gates));
    expect(parsed.gates).toEqual(w.gates);
  });

  it('a live run\'s terrain dump names its jittered gates and parses back', () => {
    for (const seed of [2, 40]) {
      const w = new World(cfg({ seed }));
      const dump = describeTerrain(gridTerrain(w.grid), terrainCfg, w.gates);
      const parsed = parseTerrainDump(dump);
      expect(parsed.gates).toEqual(w.gates);
    }
  });
});

describe('fb156 — isJitteredGatePosition matches what the jitter can produce', () => {
  it('accepts every position jitterGates draws, over 1000 seeds', () => {
    for (let seed = 0; seed < 1000; seed++) {
      for (const g of jitterGates(seed)) expect(isJitteredGatePosition(g.key, g.tx, g.ty), `${seed} ${g.key}`).toBe(true);
    }
  });

  it('refuses a corner, the wrong edge, and a spot outside the band', () => {
    expect(isJitteredGatePosition('west', 0, 0)).toBe(false);
    expect(isJitteredGatePosition('west', GRID_W - 1, 12)).toBe(false);
    expect(isJitteredGatePosition('west', 0, 3)).toBe(false);
    expect(isJitteredGatePosition('north', 3, 0)).toBe(false);
    expect(isJitteredGatePosition('south', 20, GRID_H - 2)).toBe(false);
    expect(isJitteredGatePosition('south2', 3, GRID_H - 1)).toBe(false);
    // The static defaults sit inside their own bands, so a pre-fb156 dump still parses.
    for (const g of GATES) expect(isJitteredGatePosition(g.key, g.tx, g.ty), g.key).toBe(true);
  });
});
