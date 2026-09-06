/**
 * fb065g — the flat-arena control's *mechanism*, pinned cheaply.
 *
 * The measurement itself lives in `tests/terrain-balance-ab.ts` (a script, not
 * a suite: 96 full runs is ~25 minutes) and its reading is recorded there and
 * in BACKLOG-TERRAIN.md. What belongs in the fast tier is the part a reader has
 * to trust before the reading means anything: that `practice: true` is a
 * flat-arena control and nothing else.
 *
 * That claim is argued from the code — `cfg.practice` gates exactly
 * `applyRunTerrain` and `applyDevCommand`, and bot policies issue no `dev`
 * commands — and an argument from the code is worth exactly as much as the
 * code staying that way. So it is asserted here instead: same seed, same
 * everything, one flag apart, and the *only* difference is the terrain.
 */

import { describe, expect, it } from 'vitest';

import { GRID_H, GRID_W } from '../src/sim/grid';
import { TerrainKind } from '../src/sim/terrain';
import { World } from '../src/sim/world';
import { cfg as runCfg } from './helpers';

/** Every tile of a Grid that never had terrain applied is normal ground. */
function allNormal(w: World): boolean {
  return Array.from(w.grid.terrainKind).every((k) => k === TerrainKind.Normal);
}

describe('fb065g — practice: true is the flat-arena control, and only that', () => {
  it('gives a flat arena where an ordinary run gets generated terrain', () => {
    for (const seed of [1, 7, 40]) {
      const flat = new World(runCfg({ seed, practice: true }));
      const terrain = new World(runCfg({ seed }));
      expect(allNormal(flat), `seed ${seed} practice arm is flat`).toBe(true);
      expect(allNormal(terrain), `seed ${seed} ordinary arm has terrain`).toBe(false);
      // The flat arm is flat because terrain never ran, not because this seed's
      // map happens to be empty: the ordinary arm's rock count is what the
      // control is removing.
      const rock = Array.from(terrain.grid.terrainKind).filter(
        (k) => k === TerrainKind.Rock,
      ).length;
      expect(rock, `seed ${seed} has rock to remove`).toBeGreaterThan(0);
      expect(flat.terrainFallback).toBe(false);
      expect(terrain.terrainFallback).toBe(false);
    }
  });

  it('changes nothing else about the board the two arms start from', () => {
    // The half that makes it a *control* rather than merely a different run.
    // If `practice` moved the gates, the Core, the Warden's spawn or the tile
    // map, the A/B would be measuring two arenas rather than one arena with and
    // without terrain.
    for (const seed of [1, 40]) {
      const flat = new World(runCfg({ seed, practice: true }));
      const terrain = new World(runCfg({ seed }));
      expect(flat.gates).toEqual(terrain.gates);
      expect(flat.grid.coreOrigin()).toEqual(terrain.grid.coreOrigin());
      expect({ x: flat.warden.x, y: flat.warden.y }).toEqual({
        x: terrain.warden.x,
        y: terrain.warden.y,
      });
      expect(flat.coreHp).toBe(terrain.coreHp);
      // `tile` is the structural map — border, gates, Core — and is terrain-free
      // by construction, so it must be identical across the arms.
      expect(Array.from(flat.grid.tile)).toEqual(Array.from(terrain.grid.tile));
      // And the flat arm really is the arena the waves were tuned on: every
      // interior tile walkable.
      let blocked = 0;
      for (let y = 1; y < GRID_H - 1; y++) {
        for (let x = 1; x < GRID_W - 1; x++) if (flat.grid.blocked[flat.grid.idx(x, y)]) blocked++;
      }
      expect(blocked, `seed ${seed} flat interior is open`).toBe(0);
    }
  });
});
