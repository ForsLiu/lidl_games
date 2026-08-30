/** Grid, flow field and the SPEC 3.1 path-guarantee rule. */

import { describe, expect, it } from 'vitest';

import { CORE_X, CORE_Y, GATES, GRID_H, GRID_W, Grid, TileType } from '../src/sim/grid';
import { loadContent } from '../src/sim/content';

describe('grid', () => {
  it('matches the SPEC 2.3 layout', () => {
    expect(GRID_W).toBe(36);
    expect(GRID_H).toBe(20);
    expect(GATES.length).toBe(3);
    const g = new Grid();
    for (const gate of GATES) expect(g.tile[g.idx(gate.tx, gate.ty)]).toBe(TileType.Gate);
    expect(g.tile[g.idx(CORE_X, CORE_Y)]).toBe(TileType.Core);
    expect(g.tile[g.idx(0, 0)]).toBe(TileType.Border);
    expect(g.buildable(0, 0)).toBe(false);
    expect(g.buildable(5, 5)).toBe(true);
  });

  it('gives every gate a path to the Core on an empty map', () => {
    const g = new Grid();
    expect(g.allGatesReachable()).toBe(true);
    for (const gate of GATES) expect(g.distAt(gate.tx, gate.ty)).toBeGreaterThan(0);
  });

  it('flow field steps strictly downhill toward the Core', () => {
    const g = new Grid();
    let tx = GATES[0].tx;
    let ty = GATES[0].ty;
    let guard = 0;
    while (g.distAt(tx, ty) > 0 && guard++ < 500) {
      const prev = g.distAt(tx, ty);
      const step = g.stepFrom(tx, ty);
      expect(step).not.toBeNull();
      [tx, ty] = step!;
      expect(g.distAt(tx, ty)).toBeLessThan(prev);
    }
    expect(g.distAt(tx, ty)).toBe(0);
  });

  it('rejects a placement that walls a gate off', () => {
    const g = new Grid();
    // Box the west gate in completely.
    const box: [number, number][] = [
      [1, 9],
      [1, 10],
      [1, 11],
    ];
    expect(g.wouldBlockPath(box)).toBe(true);
    expect(g.allGatesReachable()).toBe(true); // state restored
  });

  it('allows a maze that still leaves a path', () => {
    const g = new Grid();
    const wall: [number, number][] = [];
    for (let y = 2; y < 15; y++) wall.push([10, y]);
    expect(g.wouldBlockPath(wall)).toBe(false);
  });

  it('routes around a placed wall', () => {
    const g = new Grid();
    const before = g.distAt(GATES[0].tx, GATES[0].ty);
    for (let y = 2; y < 15; y++) g.setOcc(10, y, 999);
    g.refresh();
    expect(g.allGatesReachable()).toBe(true);
    expect(g.distAt(GATES[0].tx, GATES[0].ty)).toBeGreaterThan(before);
  });

  it('prices a full wall line as a breach instead of going unreachable (SPEC-FINAL §10)', () => {
    const g = new Grid();
    const open = g.distAt(GATES[0].tx, GATES[0].ty, false);
    for (let y = 1; y < GRID_H - 1; y++) g.setOcc(10, y, 999);
    g.refresh();
    // The west gate's ground route now crosses exactly one structure tile, so
    // it costs at least the flat breach surcharge on top of the walk.
    const breach = g.distAt(GATES[0].tx, GATES[0].ty, false);
    expect(breach).toBeGreaterThan(open);
    expect(breach).toBeGreaterThan(g.breachBase);
    // A Burrower still tunnels under it for free.
    const ghost = g.distAt(GATES[0].tx, GATES[0].ty, true);
    expect(ghost).toBeGreaterThan(0);
    expect(ghost).toBeLessThan(breach);
  });
});

describe('content', () => {
  it('loads and validates every data file', () => {
    const c = loadContent();
    expect(c.towers.towers).toHaveLength(10);
    expect(c.enemies.enemies).toHaveLength(20);
    // p8a: SPEC-FINAL §1.1's 18 real TD wave rows (was 10).
    expect(c.waves.waves).toHaveLength(18);
    // p7a (SPEC-FINAL §6.3): 7 stat boons replace the old flat 12.
    expect(c.boons.statBoons).toHaveLength(7);
    expect(c.modifiers.modifiers).toHaveLength(12);
    // fb013 added `chrono_veteran` (Time Lord's unlock quest), the 10th.
    expect(c.quests.quests).toHaveLength(10);
    // SPEC-FINAL §13's eleven plus fb013's owner-directed 12th (Time Lord).
    expect(c.classes.classes).toHaveLength(12);
    expect(c.tree.nodes.filter((n) => n.kind !== 'start')).toHaveLength(120);
    expect(c.tree.nodes.filter((n) => n.kind === 'keystone')).toHaveLength(3);
    expect(c.relics.affixes).toHaveLength(12);
  });

  it('is cached, so repeated loads are the same object', () => {
    expect(loadContent()).toBe(loadContent());
  });
});
