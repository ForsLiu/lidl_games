/**
 * fb198 (qa-playtester, verifying fb129): a pocket sealed only by a
 * high-ground tower stalled forever instead of ghosting free.
 *
 * `updateGroundUnreachable`'s `beelineHitsStructure` (`src/sim/enemies.ts`)
 * treated any structure on the enemy's beeline as "something to chew" and
 * reset the unreachable timer to 0 every tick — true before fb129, when
 * every structure was attackable. fb129 wired `canAttackStructureAt` at the
 * melee-breach site so a high-ground tower denies the attack
 * (`e.attackingStructure` stays 0), but left `beelineHitsStructure` asking
 * only "is there a structure here", not "can this enemy actually attack it".
 * A ground enemy trapped in a pocket whose only physical neighbor is a
 * high-ground tower can therefore never attack (denied) and never ghosts
 * free (the timer keeps resetting) — a permanent soft-lock.
 *
 * Repro: a flat tile P with a high-ground tower built on its one open
 * neighbor H, and P's other three orthogonal neighbors sealed with raw
 * terrain (no structure there, so this is not the already-covered "live
 * wall" case in fb077's own regression test) — no route exists, and P's only
 * neighbor is the high tower. The enemy must eventually ghost free rather
 * than idle forever undamaging an undamageable tower.
 */
import { describe, expect, it } from 'vitest';

import { spawnEnemy, updateEnemies } from '../src/sim/enemies';
import { GRID_H, GRID_W } from '../src/sim/grid';
import { buildTower } from '../src/sim/towers';
import { World } from '../src/sim/world';
import { cfg as runCfg } from './helpers';

const DT = 1 / 60;
const SEED = 1;

/** A high tile with an orthogonally-adjacent walkable, non-high, non-border neighbor. */
function findHighPlot(w: World): { tx: number; ty: number; nx: number; ny: number } {
  for (let ty = 1; ty < GRID_H - 1; ty++) {
    for (let tx = 1; tx < GRID_W - 1; tx++) {
      if (!w.grid.isHighGround(tx, ty)) continue;
      const candidates: Array<[number, number]> = [
        [tx - 1, ty],
        [tx + 1, ty],
        [tx, ty - 1],
        [tx, ty + 1],
      ];
      for (const [nx, ny] of candidates) {
        if (nx < 1 || ny < 1 || nx >= GRID_W - 1 || ny >= GRID_H - 1) continue;
        if (w.grid.isHighGround(nx, ny)) continue;
        if (!w.grid.passable(nx, ny)) continue;
        return { tx, ty, nx, ny };
      }
    }
  }
  throw new Error('fb198 test: no high tile with a walkable neighbor at this seed');
}

function palisadeId(w: World): number {
  return w.content.towerByKey.get('palisade')!.id;
}

function build(w: World, tx: number, ty: number) {
  w.gold = 1_000_000;
  w.warden.x = tx + 0.5;
  w.warden.y = ty + 0.5;
  const r = buildTower(w, palisadeId(w), tx, ty);
  if (!r.ok) throw new Error(`fb198 test: build at (${tx},${ty}) rejected: ${r.reason}`);
  return r.structure;
}

describe('fb198 — a pocket sealed only by a high-ground tower ghosts free instead of stalling forever', () => {
  it('the trapped enemy eventually ghosts through, and the high tower stays undamaged throughout', () => {
    const w = new World(runCfg({ seed: SEED }));
    const high = findHighPlot(w);
    const highStruct = build(w, high.tx, high.ty);

    // Seal P's three other orthogonal neighbors with raw terrain (not
    // structures) — no corner-cutting means the diagonals are sealed too,
    // since a diagonal step needs both its orthogonals open.
    const dirX = high.nx - high.tx;
    const dirY = high.ny - high.ty;
    const others: Array<[number, number]> = [
      [high.nx - 1, high.ny],
      [high.nx + 1, high.ny],
      [high.nx, high.ny - 1],
      [high.nx, high.ny + 1],
    ].filter(([x, y]) => !(x === high.tx && y === high.ty)) as Array<[number, number]>;
    for (const [x, y] of others) {
      w.grid.blocked[y * GRID_W + x] = 1;
    }

    w.phase = 'act2';
    // The Warden sits well beyond the high tower, collinear with P -> H, so
    // the enemy's beeline toward it passes straight through the tower.
    w.warden.x = high.tx + 0.5 - dirX * 6;
    w.warden.y = high.ty + 0.5 - dirY * 6;
    w.updateNav(true);
    expect(w.navGround.next[high.ny * GRID_W + high.nx]).toBe(-1);

    const e = spawnEnemy(w, 'husk', high.nx + 0.5, high.ny + 0.5)!;
    expect(e).toBeTruthy();

    for (let t = 0; t < 60 * 10 && !e.ghosting; t++) {
      updateEnemies(w, DT);
    }

    expect(e.ghosting, 'enemy never ghosted free of the high-ground-sealed pocket').toBe(true);
    expect(e.attackingStructure).toBe(0);
    expect(highStruct.hp).toBe(highStruct.maxHp);
  });
});
