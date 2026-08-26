/**
 * p1a — SPEC-FINAL §10, gate G7's first two clauses:
 *
 *   "Sealing the Core is allowed: structures are high-cost passable tiles
 *    (cost ∝ HP × toughness ⚖). Open path exists → enemies walk it (classic).
 *    Fully sealed → enemies take the cheapest breach route and attack the
 *    structures in the way until they reach the Core. Fliers/Burrowers/
 *    Wraiths keep their bypasses."
 *
 * The old path guarantee (SPEC §3.1, `blocks_path`) is retired: `checkBuild`
 * accepts a sealing placement, and the ground flow field prices a structure
 * tile at `breach.base + breach.perEhp × effective HP` instead of refusing to
 * cross it. G7's third clause — sealed-build win rate against open-build win
 * rate at T2 — is p1b's, measured over seeds, not here.
 *
 * Chewing is *routed*, not incidental: a pathing enemy attacks a structure
 * only when the field runs its route through one (or it has no route at all —
 * the Act II beeline fallback). That is what makes G7's second clause exact:
 * zero structure damage from pathing enemies while an open path exists. The
 * Gatebreaker's `structureBreaker` trait and the Bomber keep their own
 * authored rules and are exempt from that clause.
 */

import { describe, expect, it } from 'vitest';

import towersRaw from '../data/towers.json';
import { spawnEnemy, updateEnemies } from '../src/sim/enemies';
import { CORE_X, CORE_Y, GRID_H, GRID_W } from '../src/sim/grid';
import { hashWorld } from '../src/sim/run';
import { damageTakenMul } from '../src/sim/stats';
import { buildTower, checkBuild, upgradeTower } from '../src/sim/towers';
import type { Structure } from '../src/sim/types';
import { World } from '../src/sim/world';
import { cfg } from './helpers';

const DT = 1 / 60;
const PALISADE = 1;
const ARROW_SPIRE = 2;

function newWorld(): World {
  const w = new World(cfg());
  w.gold = 100000;
  return w;
}

/** Build with the Warden warped onto the tile so range never interferes. */
function place(w: World, towerId: number, tx: number, ty: number): Structure {
  w.warden.x = tx + 0.5;
  w.warden.y = ty + 0.5;
  const r = buildTower(w, towerId, tx, ty);
  if (!r.ok) throw new Error(`build ${towerId} at ${tx},${ty}: ${r.reason}`);
  return r.structure;
}

/**
 * The 12-tile ring around the 2×2 Core. Every ground approach must cross it;
 * fliers and ghosts do not care.
 */
function ringTiles(): Array<[number, number]> {
  const tiles: Array<[number, number]> = [];
  for (let x = CORE_X - 1; x <= CORE_X + 2; x++) {
    for (let y = CORE_Y - 1; y <= CORE_Y + 2; y++) {
      const onCore = x >= CORE_X && x <= CORE_X + 1 && y >= CORE_Y && y <= CORE_Y + 1;
      if (!onCore) tiles.push([x, y]);
    }
  }
  return tiles;
}

/** Step the Act I sim far enough for walkers to path, chew and leak. */
function step(w: World, ticks: number, until?: () => boolean): void {
  for (let i = 0; i < ticks; i++) {
    w.tick++;
    w.rebuildBuckets();
    w.grid.refresh();
    updateEnemies(w, DT);
    w.compact();
    if (until && until()) return;
  }
}

describe('p1a §10: canPlace no longer rejects a sealing placement', () => {
  it('a full ring around the Core is legal, and the seal is visible to the diagnostic', () => {
    const w = newWorld();
    const ring = ringTiles();
    for (const [tx, ty] of ring.slice(0, -1)) place(w, PALISADE, tx, ty);
    const [ltx, lty] = ring[ring.length - 1];
    w.warden.x = ltx + 0.5;
    w.warden.y = lty + 0.5;
    expect(w.grid.wouldBlockPath([[ltx, lty]])).toBe(true); // it is a seal…
    expect(checkBuild(w, PALISADE, ltx, lty)).toBeNull(); // …and it is legal
    place(w, PALISADE, ltx, lty);
    expect(w.grid.allGatesReachable()).toBe(false); // physically sealed
    // …but the breach field still reaches every gate: sealing never yields -1.
    for (const g of w.gates) expect(w.grid.distAt(g.tx, g.ty)).toBeGreaterThan(0);
  });
});

describe('p1a §10: a structure tile costs breach.base + perEhp × effective HP', () => {
  it('prices toughness in, and re-prices on upgrade', () => {
    const w = newWorld();
    const spire = place(w, ARROW_SPIRE, 10, 10);
    const wall = place(w, PALISADE, 12, 10);
    const g = w.grid;
    // Palisade: 300 HP, defense 0 → ehp 300. Arrow Spire: 120 HP, defense 10
    // → ehp 133⅓. The wall is the dearer chew despite being "just a wall".
    expect(g.breach[g.idx(12, 10)]).toBeGreaterThan(g.breach[g.idx(10, 10)]);
    // An upgrade buys HP and Defense, so the tile gets dearer with it.
    const before = g.breach[g.idx(10, 10)];
    w.gold = 100000;
    expect(upgradeTower(w, 10, 10)).toBe(true);
    expect(g.breach[g.idx(10, 10)]).toBeGreaterThan(before);
    // Death clears the surcharge with the occupancy.
    w.removeStructure(spire);
    w.removeStructure(wall);
    expect(g.breach[g.idx(10, 10)]).toBe(0);
    expect(g.breach[g.idx(12, 10)]).toBe(0);
  });

  it('the grid mirrors data/towers.json breach.base, not its own fallback', () => {
    const w = newWorld();
    expect(w.grid.breachBase).toBe(w.content.towers.breach.base);
    expect(w.content.towers.breach.base).toBe(towersRaw.breach.base);
  });

  it('§10 invariant: the cheapest possible breach outprices the longest walkable route', () => {
    // "Open path exists → enemies walk it" is a guarantee only while entering
    // one structure tile costs more than any walkable detour. The bound is the
    // theoretical ceiling — every interior tile once, at diagonal price — and
    // the cheapest tile is the weakest tower at level 1 with no HP multipliers
    // (derived multipliers only raise HP, so this is the floor). A /data tune
    // that breaks this inequality silently breaks G7's second clause.
    const longestWalk = (GRID_W - 2) * (GRID_H - 2) * 14;
    const minEhp = Math.min(
      ...towersRaw.towers.filter((t) => t.blocks).map((t) => t.hp / damageTakenMul(t.defense)),
    );
    expect(towersRaw.breach.base + towersRaw.breach.perEhp * minEhp).toBeGreaterThan(longestWalk);
  });
});

describe('p1a G7: fully sealed → cheapest breach route, chewed until the Core', () => {
  it('walkers chew the weakest tile of a sealed ring and reach the Core', () => {
    const w = newWorld();
    // Eleven palisades (ehp 300) and one Arrow Spire (ehp 133⅓) — the spire is
    // the cheapest breach, so every walker's route runs through it.
    const walls: Structure[] = [];
    let spire: Structure | null = null;
    for (const [tx, ty] of ringTiles()) {
      if (tx === CORE_X - 1 && ty === CORE_Y + 1) spire = place(w, ARROW_SPIRE, tx, ty);
      else walls.push(place(w, PALISADE, tx, ty));
    }
    expect(w.grid.allGatesReachable()).toBe(false);

    for (let i = 0; i < 10; i++) spawnEnemy(w, 'husk', 5 + (i % 3), 9 + (i % 4), { overlay: false });
    const coreHp0 = w.coreHp;
    step(w, 60 * 60, () => w.leaks > 0);

    // G7 clause 1: structures damaged en route, and the Core reached.
    expect(spire!.dead).toBe(true);
    expect(w.leaks).toBeGreaterThan(0);
    expect(w.coreHp).toBeLessThan(coreHp0);
    // Cheapest-route half: every palisade is untouched — the horde spent its
    // teeth on the one tile the field priced cheapest.
    for (const s of walls) expect(s.hp).toBe(s.maxHp);
  });
});

describe('p1a G7: open path → zero structure damage from pathing enemies', () => {
  it('a horde funnelled through a one-tile gap jostles the walls without chewing them', () => {
    const w = newWorld();
    // A wall line with a single-tile gap: the whole horde converges on it, so
    // separation shoves bodies against the wall faces the entire way through.
    // Those bumps are the incidental contact G7's second clause zeroes out —
    // under the old any-bump rule this crowd sandpapers the gap open.
    const walls: Structure[] = [];
    for (let y = 1; y < GRID_H - 1; y++) {
      if (y !== 10) walls.push(place(w, PALISADE, 14, y));
    }
    expect(w.grid.allGatesReachable()).toBe(true);

    for (let i = 0; i < 16; i++) {
      spawnEnemy(w, 'husk', 11 + 0.13 * (i % 5), 9 + 0.31 * (i % 7), { overlay: false });
    }
    step(w, 60 * 60, () => w.enemies.length === 0);

    expect(w.leaks).toBeGreaterThan(0); // they did get through, by walking
    for (const s of walls) expect(s.hp).toBe(s.maxHp);
  });

  it('a wall-pinned enemy shoved into the wall bumps it without chewing it', () => {
    // The funnel above shows the honest crowd never even bumps; this pins the
    // rule itself. A husk is pressed against the wall column with an open aim
    // (its route runs south to the gap) while three bodies overlap it exactly
    // — the deterministic overlap tie-break shoves the highest id east, hard
    // enough to cross into the wall tile. That bump must deal nothing: the
    // route is open, so the contact is incidental, not a breach.
    const w = newWorld();
    const walls: Structure[] = [];
    for (let y = 1; y < GRID_H - 1; y++) {
      if (y !== 10) walls.push(place(w, PALISADE, 14, y));
    }
    const stooges = [
      spawnEnemy(w, 'husk', 13.995, 9.05, { overlay: false })!,
      spawnEnemy(w, 'husk', 13.995, 9.05, { overlay: false })!,
      spawnEnemy(w, 'husk', 13.995, 9.05, { overlay: false })!,
    ];
    // Rooted, so the exact overlap survives their own update and the overlap
    // tie-break (highest id shoved +x) stays in force when the pinned husk's
    // separation recomputes.
    for (const e of stooges) e.speed = 0;
    const pinned = spawnEnemy(w, 'husk', 13.995, 9.05, { overlay: false })!;
    // Re-pin every tick so the shove recurs on each separation recompute; the
    // stagger runs each enemy once per 6 ticks, so 24 ticks covers them all.
    for (let t = 0; t < 24; t++) {
      pinned.x = 13.995;
      pinned.y = 9.05;
      step(w, 1);
    }
    expect(pinned.dead).toBe(false);
    for (const s of walls) expect(s.hp).toBe(s.maxHp);
  });

  it('the Gatebreaker chews what it bumps even on an open path (structureBreaker, G7 exception)', () => {
    // The same shove geometry as the pinned husk above — open route south to
    // the gap, overlapping rooted bodies forcing the highest id east into the
    // wall — but the bumped enemy is the Gatebreaker, whose structureBreaker
    // trait is its own authored rule: it smashes whatever it bumps, routed or
    // not. The husk case above deals zero from this exact contact.
    const w = newWorld();
    let target: Structure | null = null;
    for (let y = 1; y < GRID_H - 1; y++) {
      if (y === 10) continue;
      const s = place(w, PALISADE, 14, y);
      if (y === 9) target = s;
    }
    const stooges = [
      spawnEnemy(w, 'husk', 13.998, 9.05, { overlay: false })!,
      spawnEnemy(w, 'husk', 13.998, 9.05, { overlay: false })!,
      spawnEnemy(w, 'husk', 13.998, 9.05, { overlay: false })!,
    ];
    for (const e of stooges) e.speed = 0;
    const breaker = spawnEnemy(w, 'gatebreaker', 13.998, 9.05, { overlay: false })!;
    for (let t = 0; t < 24; t++) {
      breaker.x = 13.998;
      breaker.y = 9.05;
      step(w, 1);
    }
    expect(target!.dead || target!.hp < target!.maxHp).toBe(true);
  });

  it('an enemy entombed by a wall built on its tile chews its way out', () => {
    // buildable() does not check enemies, so a wall can land on a husk's tile.
    // The husk's own tile is then blocked and the per-axis clamp freezes it —
    // standing inside an occupied tile must count as breaching, or the pin is
    // permanent and player-exploitable (the old any-bump rule dug out by
    // accident; code review on p1a).
    const w = newWorld();
    const husk = spawnEnemy(w, 'husk', 10.5, 10.5, { overlay: false })!;
    const tomb = place(w, PALISADE, 10, 10);
    step(w, 60 * 2);
    expect(husk.dead).toBe(false);
    expect(tomb.hp).toBeLessThan(tomb.maxHp); // digging
    step(w, 60 * 40, () => tomb.dead);
    expect(tomb.dead).toBe(true); // dug out
    step(w, 60 * 30, () => w.leaks > 0);
    expect(w.leaks).toBe(1); // and back on the road
  });
});

describe('p1a §10: fliers, Burrowers and Wraiths keep their bypasses', () => {
  it('a Gale Imp overflies a sealed ring untouched', () => {
    const w = newWorld();
    const ring = ringTiles().map(([tx, ty]) => place(w, PALISADE, tx, ty));
    spawnEnemy(w, 'gale_imp', 5, 10, { overlay: false });
    step(w, 60 * 30, () => w.leaks > 0);
    expect(w.leaks).toBe(1);
    for (const s of ring) expect(s.hp).toBe(s.maxHp);
  });

  it('a Burrower tunnels under a sealed wall line untouched', () => {
    const w = newWorld();
    const walls: Structure[] = [];
    for (let y = 1; y < GRID_H - 1; y++) walls.push(place(w, PALISADE, 14, y));
    expect(w.grid.allGatesReachable()).toBe(false);
    spawnEnemy(w, 'burrower', 5, 10, { overlay: false });
    step(w, 60 * 30, () => w.leaks > 0);
    expect(w.leaks).toBe(1);
    for (const s of walls) expect(s.hp).toBe(s.maxHp);
  });

  it('a Wraith phases through a sealed wall line and reaches the Core', () => {
    const w = newWorld();
    for (let y = 1; y < GRID_H - 1; y++) place(w, PALISADE, 14, y);
    spawnEnemy(w, 'wraith', 12, 10, { overlay: false });
    // Between phases it may chew like any walker — the bypass claim is that
    // it does not have to finish the job to get through.
    step(w, 60 * 60, () => w.leaks > 0);
    expect(w.leaks).toBe(1);
  });
});

describe('p1a G2: breach runs stay deterministic', () => {
  it('two identical sealed-ring sieges hash identically', () => {
    const play = (): string => {
      const w = newWorld();
      for (const [tx, ty] of ringTiles()) place(w, PALISADE, tx, ty);
      for (let i = 0; i < 8; i++) spawnEnemy(w, 'husk', 4 + (i % 4), 8 + (i % 3), { overlay: false });
      step(w, 60 * 45);
      return hashWorld(w);
    };
    expect(play()).toBe(play());
  });
});
