/**
 * p8b — SPEC-FINAL §9: `spendBudget` (act2.ts) refuses to spawn once
 * `w.enemies.length >= aliveCap`, but two other spawn paths called it
 * unconditionally: `spawnElite` (act2.ts's elite-timer branch of
 * `updateDirector`) and the Warden-Eater's `updateSummonsAndSlams` (boss.ts).
 * Neither path ever checked the cap, so a run sitting at (or above) the cap
 * kept accumulating enemies from elite bursts and boss summons with no
 * upper bound — QA measured 353 against a cap of 350. Fixed by adding the
 * same `w.enemies.length >= aliveCap` guard both paths already lacked.
 */
import { describe, expect, it } from 'vitest';

import { Run } from '../src/sim/run';
import { spawnEnemy } from '../src/sim/enemies';
import { updateDirector } from '../src/sim/act2';
import { bossUpdate } from '../src/sim/boss';
import { GRID_H, GRID_W } from '../src/sim/grid';
import type { World } from '../src/sim/world';
import { cfg } from './helpers';

function act2World(): World {
  const run = new Run(cfg());
  const w = run.world;
  w.phase = 'act2';
  w.sundered = true;
  w.warden.x = GRID_W / 2;
  w.warden.y = GRID_H / 2;
  w.updateNav(true);
  return w;
}

/** Fills `w.enemies` to exactly `aliveCap` with a non-pack, non-split enemy. */
function fillToCap(w: World): void {
  const cap = w.content.spawns.aliveCap;
  let n = 0;
  for (let ring = 1; n < cap; ring++) {
    for (let k = 0; k < 40 && n < cap; k++) {
      const x = 1.5 + ((ring * 7 + k * 3) % (GRID_W - 3));
      const y = 1.5 + ((ring * 3 + k * 5) % (GRID_H - 3));
      if (spawnEnemy(w, 'husk', x, y, { overlay: true })) n++;
    }
  }
  expect(w.enemies.length).toBe(cap);
}

describe('p8b: alive cap holds against every spawn path', () => {
  it('spawnElite (via updateDirector) does not spawn once the cap is already reached', () => {
    const w = act2World();
    fillToCap(w);
    const cap = w.content.spawns.aliveCap;

    // `w.eliteTimer` defaults to 0, so the first `updateDirector` call always
    // takes the elite branch regardless of `dt`.
    updateDirector(w, 1 / 60);

    expect(w.enemies.length).toBeLessThanOrEqual(cap);
  });

  it('the Warden-Eater\'s summon burst does not spawn once the cap is already reached', () => {
    const w = act2World();
    fillToCap(w);
    const cap = w.content.spawns.aliveCap;

    const e = spawnEnemy(w, 'warden_eater', w.warden.x + 6, w.warden.y, { overlay: false })!;
    e.hp = e.maxHp * 0.5; // phase 1: `updateSummonsAndSlams` only fires from phase >= 1
    // `e.abilityTimer` defaults to 0, so the first `bossUpdate` call always
    // fires a summon burst regardless of `dt`.
    bossUpdate(w, e, 1 / 60);

    expect(w.enemies.length).toBeLessThanOrEqual(cap + 1); // +1 for the boss itself
  });

  it('a long run never sits meaningfully above the cap', () => {
    // End-to-end regression: drive a real run well past the alive cap and
    // confirm the population never runs away past it, the way the bug this
    // test guards against did.
    const w = act2World();
    w.act2Time = 900; // late enough for weightsByMinute's last row + elites + boss
    fillToCap(w);
    const cap = w.content.spawns.aliveCap;
    const e = spawnEnemy(w, 'warden_eater', w.warden.x + 6, w.warden.y, { overlay: false })!;
    e.hp = e.maxHp * 0.5;
    w.bossSpawned = true;
    w.bossSpawnTime = w.act2Time;

    let maxEnemies = w.enemies.length;
    for (let i = 0; i < 60 * 30; i++) {
      updateDirector(w, 1 / 60);
      bossUpdate(w, e, 1 / 60);
      maxEnemies = Math.max(maxEnemies, w.enemies.length);
    }

    // Packs/splits (a10-performance.test.ts) are the one already-known,
    // tightly-bounded exception; elites and boss summons must not add to it.
    expect(maxEnemies).toBeLessThanOrEqual(Math.ceil(cap * 1.2) + 1);
  });
});
