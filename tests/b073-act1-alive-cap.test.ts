/**
 * b073 — found while measuring fb025 (Act I enemies x10 HP): unlike
 * `spendBudget`/`spawnElite` (act2.ts) and `updateSummonsAndSlams` (boss.ts),
 * Act I's `updateAct1Wave` spawn loop (`src/sim/run.ts`) dequeued and spawned
 * every queued enemy unconditionally, with no `aliveCap` guard. A wave that
 * outpaces a losing bot's kill rate can pile enemies past
 * `data/spawns.json`'s `aliveCap` with no bound — a real frame-rate risk for
 * a live player, not just a test-timeout one. Fixed by gating the spawn loop
 * on the same `w.enemies.length >= aliveCap` check the other two paths
 * already use; a capped tick just waits (the queue entry stays queued, the
 * timer does not advance) until a slot frees up rather than dropping it.
 *
 * Enemies dropped into open ground with no gates/pathing setup can leak into
 * the Core and vanish from `w.enemies` within the same tick they spawn in, so
 * `w.enemies.length` alone churns too much to isolate the bug — the direct
 * signal is whether `w.spawnQueue` is allowed to shrink while already at cap.
 */
import { describe, expect, it } from 'vitest';

import { Run } from '../src/sim/run';
import { spawnEnemy } from '../src/sim/enemies';
import { emptyInput } from '../src/sim/types';
import { GRID_H, GRID_W } from '../src/sim/grid';
import type { World } from '../src/sim/world';
import { cfg } from './helpers';

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

describe('b073: Act I wave spawning respects aliveCap', () => {
  it('does not dequeue a queued spawn on a tick where the population already sits at the cap', () => {
    const run = new Run(cfg());
    const w = run.world;
    w.phase = 'act1_wave';
    fillToCap(w);
    const cap = w.content.spawns.aliveCap;
    const huskId = w.content.enemyByKey.get('husk')!.id;

    const gateCount = Math.max(1, w.gates.length);
    const queued = 5;
    w.spawnQueue = [];
    for (let i = 0; i < queued; i++) w.spawnQueue.push([huskId, i % gateCount, w.wave]);
    w.spawnTimer = 0;

    run.step(emptyInput());

    expect(w.spawnQueue.length).toBe(queued);
    expect(w.enemies.length).toBeLessThanOrEqual(cap);
  });

  it('resumes spawning the same queued enemies once room frees up (no drops)', () => {
    const run = new Run(cfg());
    const w = run.world;
    w.phase = 'act1_wave';
    fillToCap(w);
    const cap = w.content.spawns.aliveCap;
    const huskId = w.content.enemyByKey.get('husk')!.id;

    const gateCount = Math.max(1, w.gates.length);
    const queued = 5;
    w.spawnQueue = [];
    for (let i = 0; i < queued; i++) w.spawnQueue.push([huskId, i % gateCount, w.wave]);
    w.spawnTimer = 0;

    // At the cap: a tick must not shrink the pending queue.
    run.step(emptyInput());
    expect(w.spawnQueue.length).toBe(queued);

    // Free up exactly `queued` slots, then the paused entries should drain.
    for (let i = 0; i < queued; i++) w.enemies[i].dead = true;
    w.compact();

    for (let i = 0; i < 60 * 5 && w.spawnQueue.length > 0; i++) run.step(emptyInput());

    expect(w.spawnQueue.length).toBe(0);
    expect(w.enemies.length).toBeLessThanOrEqual(cap);
  });
});
