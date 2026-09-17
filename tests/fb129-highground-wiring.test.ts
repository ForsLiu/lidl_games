/**
 * fb129 (SPEC-FINAL §10.5, fb064i's merge list, Q171 verdict): the main-lane
 * half of the high-ground protection rules. `src/sim/terrain/high-ground.ts`
 * shipped `canAttackStructureAt`/`canSurfaceAt` fully tested (fb064i) but with
 * no call site anywhere in `src/` — ground melee still chewed a tower across a
 * cliff edge, the Colossus's stomp still leaked through it, the Spitter's
 * ranged branch never asked, and a Burrower/Wraith could surface under a
 * tower from below. This item wires all five `src/sim/enemies.ts` sites named
 * in BACKLOG-TERRAIN.md's fb064i Log.
 *
 * `src/sim/boss.ts`'s two sites (`shatterAlong`, `updateUnreachable`) are
 * deliberately **not** wired — that is the boss-specials exemption and the
 * anti-stall failsafe, both stated in `high-ground.ts`'s own doc comment —
 * and are not covered here.
 *
 * Every scenario below drives a real generated map (no hand-built `Grid`,
 * which `terrain-high-ground.test.ts` already covers exhaustively at the
 * predicate level) so each test is a red-first pin on the *call*, not a
 * restatement of the predicate. Movement is hijacked through the Charger's
 * `chargeState`/`chargeVx`/`chargeVy` fields (any enemy, not just an authored
 * Charger, takes this branch in `moveEnemy`) so the melee-breach scenario
 * does not depend on the flow field routing toward a chosen tile — the
 * collision-and-breach code the rule guards runs identically regardless of
 * how `dx`/`dy` were produced.
 */
import { describe, expect, it } from 'vitest';

import terrainRaw from '../data/terrain.json';
import { spawnEnemy, updateEnemies } from '../src/sim/enemies';
import { GRID_H, GRID_W } from '../src/sim/grid';
import { loadContent } from '../src/sim/content';
import { parseTerrain, type TerrainConfig } from '../src/sim/terrain';
import { buildTower } from '../src/sim/towers';
import { World } from '../src/sim/world';
import { cfg as runCfg } from './helpers';

const DT = 1 / 60;

/** A high tile with an orthogonally-adjacent walkable, non-high neighbor. */
function findHighPlot(w: World): { tx: number; ty: number; nx: number; ny: number } {
  for (let ty = 0; ty < GRID_H; ty++) {
    for (let tx = 0; tx < GRID_W; tx++) {
      if (!w.grid.isHighGround(tx, ty)) continue;
      const candidates: Array<[number, number]> = [
        [tx - 1, ty],
        [tx + 1, ty],
        [tx, ty - 1],
        [tx, ty + 1],
      ];
      for (const [nx, ny] of candidates) {
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
        if (w.grid.isHighGround(nx, ny)) continue;
        if (!w.grid.passable(nx, ny)) continue;
        return { tx, ty, nx, ny };
      }
    }
  }
  throw new Error('fb129 test: no high tile with a walkable neighbor at this seed');
}

/**
 * Two adjacent buildable, non-high tiles — the control side of each scenario.
 *
 * `away` keeps this pair well clear of the high plot a test builds alongside
 * it — `nearestStructureWithin`/enemy spatial buckets are World-wide, not
 * scoped per scenario, so a control structure placed near the high one would
 * silently steal the other scenario's enemy (found the hard way: the first
 * cut of this helper returned a pair overlapping the high plot's own
 * neighbor tile, which let the "denied" enemy attack the *control* structure
 * instead and made a pre-fix run of this file read green).
 */
function findFlatPair(
  w: World,
  away: { tx: number; ty: number },
): { tx: number; ty: number; nx: number; ny: number } {
  const CLEAR = 8;
  for (let ty = 1; ty < GRID_H - 1; ty++) {
    for (let tx = 1; tx < GRID_W - 2; tx++) {
      if (Math.abs(tx - away.tx) < CLEAR && Math.abs(ty - away.ty) < CLEAR) continue;
      if (!w.grid.buildable(tx, ty) || w.grid.isHighGround(tx, ty)) continue;
      if (!w.grid.passable(tx + 1, ty) || w.grid.isHighGround(tx + 1, ty)) continue;
      return { tx, ty, nx: tx + 1, ny: ty };
    }
  }
  throw new Error('fb129 test: no flat buildable pair clear of the high plot at this seed');
}

/** The seed both plots above are found on, fixed so every test shares one map. */
const SEED = 1;

function palisadeId(w: World): number {
  return w.content.towerByKey.get('palisade')!.id;
}

/** Builds a palisade at (tx, ty), bypassing the Act-I/build-range/gold checks a real run enforces. */
function build(w: World, tx: number, ty: number) {
  w.gold = 1_000_000;
  // `inBuildRange` measures from the Warden, not the Core — stand it right on
  // the plot so range is never this test's problem.
  w.warden.x = tx + 0.5;
  w.warden.y = ty + 0.5;
  const r = buildTower(w, palisadeId(w), tx, ty);
  if (!r.ok) throw new Error(`fb129 test: build at (${tx},${ty}) rejected: ${r.reason}`);
  return r.structure;
}

describe('fb129 — melee breach denied on high ground (enemies.ts moveEnemy)', () => {
  it('a charging ground enemy cannot chew a tower across the cliff edge, but can on flat ground', () => {
    const w = new World(runCfg({ seed: SEED }));
    const high = findHighPlot(w);
    const flat = findFlatPair(w, high);

    const highStruct = build(w, high.tx, high.ty);
    const flatStruct = build(w, flat.tx, flat.ty);

    // Two husks (plain `traits: []`, the `ground` catch-all family — not
    // exempt), each charging straight at its target tile from one tile away,
    // positioned right at the boundary so a single tick's step crosses it.
    const vHigh = { x: Math.sign(high.tx - high.nx), y: Math.sign(high.ty - high.ny) };
    const eHigh = spawnEnemy(
      w,
      'husk',
      high.nx + 0.5 + vHigh.x * 0.49,
      high.ny + 0.5 + vHigh.y * 0.49,
    )!;
    eHigh.chargeState = 2;
    eHigh.chargeVx = vHigh.x;
    eHigh.chargeVy = vHigh.y;

    const vFlat = { x: Math.sign(flat.tx - flat.nx), y: Math.sign(flat.ty - flat.ny) };
    const eFlat = spawnEnemy(
      w,
      'husk',
      flat.nx + 0.5 + vFlat.x * 0.49,
      flat.ny + 0.5 + vFlat.y * 0.49,
    )!;
    eFlat.chargeState = 2;
    eFlat.chargeVx = vFlat.x;
    eFlat.chargeVy = vFlat.y;

    updateEnemies(w, DT);

    expect(highStruct.hp).toBe(highStruct.maxHp);
    expect(eHigh.attackingStructure).toBe(0);
    expect(flatStruct.hp).toBeLessThan(flatStruct.maxHp);
    expect(eFlat.attackingStructure).toBe(flatStruct.id);
  });
});

describe('fb129 — the Colossus stomp AoE (enemies.ts TRAIT.stomp)', () => {
  it('does not chew a high-ground tower from the low tile beside it, but does on flat ground', () => {
    const w = new World(runCfg({ seed: SEED }));
    const high = findHighPlot(w);
    const flat = findFlatPair(w, high);

    const highStruct = build(w, high.tx, high.ty);
    const flatStruct = build(w, flat.tx, flat.ty);
    w.warden.x = -5;
    w.warden.y = -5;

    // `colossus` carries `['stomp', 'elite']` — no `boss` trait, no exemption
    // (fb064i's shipped table classifies it `ground`) — and `abilityTimer`
    // starts at 0, so its stomp fires on the very first tick.
    spawnEnemy(w, 'colossus', high.nx + 0.5, high.ny + 0.5);
    spawnEnemy(w, 'colossus', flat.nx + 0.5, flat.ny + 0.5);

    updateEnemies(w, DT);

    expect(highStruct.hp).toBe(highStruct.maxHp);
    expect(flatStruct.hp).toBeLessThan(flatStruct.maxHp);
  });
});

describe('fb129 — the Spitter ranged branch (enemies.ts TRAIT.ranged)', () => {
  it('the shipped ranged family is exempt, so it still hits a high-ground tower', () => {
    const w = new World(runCfg({ seed: SEED }));
    const high = findHighPlot(w);

    const highStruct = build(w, high.tx, high.ty);
    w.warden.x = -5;
    w.warden.y = -5; // out of the Spitter's attackRange, so it targets structures
    const e = spawnEnemy(w, 'spitter', high.nx + 0.5, high.ny + 0.5)!;
    e.attackCooldown = 0;

    updateEnemies(w, DT);

    expect(highStruct.hp).toBeLessThan(highStruct.maxHp);
  });

  it('is denied like any other family once the Tuner revokes the exemption', () => {
    // Proves the call exists: under the shipped table above the guard is a
    // no-op (ranged is exempt) and cannot be told apart from "never called".
    // Flipping `ranged.attacksHigh` in a synthetic config is the only way to
    // observe the call site's own effect.
    const revoked: TerrainConfig = parseTerrain({
      ...terrainRaw,
      highGround: {
        families: (terrainRaw as { highGround: { families: Array<Record<string, unknown>> } }).highGround.families.map(
          (f) => (f.key === 'ranged' ? { ...f, attacksHigh: false } : f),
        ),
      },
    });

    const w = new World(runCfg({ seed: SEED }), loadContent(), revoked);
    const high = findHighPlot(w);
    const flat = findFlatPair(w, high);

    const highStruct = build(w, high.tx, high.ty);
    const flatStruct = build(w, flat.tx, flat.ty);
    w.warden.x = -5;
    w.warden.y = -5;
    const eHigh = spawnEnemy(w, 'spitter', high.nx + 0.5, high.ny + 0.5)!;
    eHigh.attackCooldown = 0;
    const eFlat = spawnEnemy(w, 'spitter', flat.nx + 0.5, flat.ny + 0.5)!;
    eFlat.attackCooldown = 0;

    updateEnemies(w, DT);

    expect(highStruct.hp).toBe(highStruct.maxHp);
    expect(flatStruct.hp).toBeLessThan(flatStruct.maxHp);
  });
});

describe('fb129 — Burrower surfacing denied on high ground (enemies.ts updatePhasing)', () => {
  it('stays submerged on high ground in range to surface, and surfaces immediately on flat ground', () => {
    const w = new World(runCfg({ seed: SEED }));
    const high = findHighPlot(w);
    const flat = findFlatPair(w, high);
    w.phase = 'act2'; // targetPoint() -> the Warden, which this test fully controls

    const eHigh = spawnEnemy(w, 'burrower', high.tx + 0.5, high.ty + 0.5)!;
    expect(eHigh.submerged).toBe(true);
    w.warden.x = eHigh.x;
    w.warden.y = eHigh.y; // distance 0, well inside burrowSurfaceDistance

    updateEnemies(w, DT);
    expect(eHigh.submerged).toBe(true);
    expect(eHigh.surfaceBlockedFor).toBeGreaterThan(0);

    // Flat control: same setup, off high ground.
    const eFlat = spawnEnemy(w, 'burrower', flat.nx + 0.5, flat.ny + 0.5)!;
    w.warden.x = eFlat.x;
    w.warden.y = eFlat.y;
    updateEnemies(w, DT);
    expect(eFlat.submerged).toBe(false);
  });

  it('the untargetable window is capped (spawns.burrowHighGroundBlockCapSeconds), never indefinite', () => {
    const w = new World(runCfg({ seed: SEED }));
    const high = findHighPlot(w);
    w.phase = 'act2';

    const e = spawnEnemy(w, 'burrower', high.tx + 0.5, high.ty + 0.5)!;
    w.warden.x = e.x;
    w.warden.y = e.y;

    const cap = w.content.spawns.burrowHighGroundBlockCapSeconds;
    // The fixed point (target === own position, so `normalize` is a no-op
    // zero vector) never moves the Burrower off the high tile itself, so it
    // stays denied for every tick strictly inside the cap...
    const midTicks = Math.floor(cap / DT / 2);
    for (let t = 0; t < midTicks; t++) updateEnemies(w, DT);
    expect(e.submerged).toBe(true);
    // ...and the failsafe forces it up by comfortably past the cap.
    const remainingTicks = Math.ceil(cap / DT) - midTicks + 5;
    for (let t = 0; t < remainingTicks; t++) updateEnemies(w, DT);
    expect(e.submerged).toBe(false);
  });
});

describe('fb129 — the Wraith phase-end denied on high ground (enemies.ts updatePhasing, TRAIT.phases)', () => {
  it('stays ghosting past its phase timer on high ground, and clears normally on flat ground', () => {
    const w = new World(runCfg({ seed: SEED }));
    const high = findHighPlot(w);
    const flat = findFlatPair(w, high);

    const eHigh = spawnEnemy(w, 'wraith', high.tx + 0.5, high.ty + 0.5)!;
    eHigh.phaseRemaining = 0.001;
    eHigh.ghosting = true;

    updateEnemies(w, DT);
    expect(eHigh.ghosting).toBe(true);

    const eFlat = spawnEnemy(w, 'wraith', flat.nx + 0.5, flat.ny + 0.5)!;
    eFlat.phaseRemaining = 0.001;
    eFlat.ghosting = true;

    updateEnemies(w, DT);
    expect(eFlat.ghosting).toBe(false);
  });
});
