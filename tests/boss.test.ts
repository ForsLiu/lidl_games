/** M6: the Warden-Eater's three phases, and Rift events. */

import { describe, expect, it } from 'vitest';

import { World } from '../src/sim/world';
import { Run } from '../src/sim/run';
import { spawnEnemy, updateEnemies } from '../src/sim/enemies';
import { bossUpdate, updateBossSlam } from '../src/sim/boss';
import { expandedRiftTimes, spawnFinalBoss, shouldSpawnBoss } from '../src/sim/act2';
import { buildTower } from '../src/sim/towers';
import { GRID_H, GRID_W } from '../src/sim/grid';
import type { Enemy } from '../src/sim/types';
import { cfg, runWithPolicy } from './helpers';

function act2World(tier = 1): World {
  const w = new World(cfg({ tier }));
  w.phase = 'act2';
  w.sundered = true;
  w.warden.x = GRID_W / 2;
  w.warden.y = GRID_H / 2;
  w.updateNav(true);
  return w;
}

function boss(w: World, hpFraction = 1): Enemy {
  const e = spawnEnemy(w, 'warden_eater', w.warden.x + 6, w.warden.y, { overlay: false })!;
  e.hp = e.maxHp * hpFraction;
  return e;
}

function tick(w: World, e: Enemy, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    w.rebuildBuckets();
    bossUpdate(w, e, 1 / 60);
    updateBossSlam(w, 1 / 60);
  }
}

describe('the Warden-Eater (SPEC 5.5)', () => {
  it('spawns at 10:00 with 15,000 HP scaled by tier', () => {
    const w = act2World();
    expect(shouldSpawnBoss(w)).toBe(false);
    w.act2Time = w.content.spawns.bossTimeSeconds;
    expect(shouldSpawnBoss(w)).toBe(true);
    spawnFinalBoss(w);
    const e = w.enemies.find((x) => x.boss)!;
    expect(e.maxHp).toBeCloseTo(15000, 0);

    const w3 = act2World(3);
    const e3 = boss(w3);
    expect(e3.maxHp).toBeGreaterThan(e.maxHp);
  });

  it('moves through three phases as its HP falls', () => {
    const w = act2World();
    const e = boss(w, 1);
    tick(w, e, 0.1);
    expect(e.bossPhase).toBe(0);
    e.hp = e.maxHp * 0.5;
    tick(w, e, 0.1);
    expect(e.bossPhase).toBe(1);
    e.hp = e.maxHp * 0.2;
    tick(w, e, 0.1);
    expect(e.bossPhase).toBe(2);
  });

  it('telegraphs a charge before committing to it', () => {
    const w = act2World();
    const e = boss(w, 1);
    let sawTelegraph = false;
    for (let i = 0; i < 60 * 8 && !sawTelegraph; i++) {
      w.fx.length = 0;
      w.rebuildBuckets();
      bossUpdate(w, e, 1 / 60);
      if (w.fx.some((f) => f.k === 'bosstelegraph')) sawTelegraph = true;
    }
    expect(sawTelegraph).toBe(true);
  });

  it('shatters petrified terrain it charges through', () => {
    const w = act2World();
    w.phase = 'act1_build';
    w.gold = 100000;
    // A line of walls between the boss and the Warden.
    for (let x = 14; x <= 20; x++) {
      w.warden.x = x + 0.5;
      w.warden.y = GRID_H / 2;
      buildTower(w, 1, x, Math.floor(GRID_H / 2) - 1);
    }
    w.warden.x = GRID_W / 2;
    w.warden.y = GRID_H / 2;
    w.phase = 'act2';
    for (const s of w.structures) s.petrified = true;
    const before = w.structures.filter((s) => !s.dead).length;
    expect(before).toBeGreaterThan(2);

    const e = boss(w, 1);
    e.x = 13;
    e.y = Math.floor(GRID_H / 2) - 0.5;
    tick(w, e, 12);
    w.compact();
    expect(w.structures.filter((s) => !s.dead).length).toBeLessThan(before);
  });

  it('summons Wraiths and slams the ground in phase 2', () => {
    const w = act2World();
    const e = boss(w, 0.5);
    const before = w.enemies.length;
    tick(w, e, 10);
    const wraiths = w.enemies.filter(
      (x) => w.content.enemyById.get(x.defId)!.key === 'wraith' && !x.dead,
    );
    expect(w.enemies.length).toBeGreaterThan(before);
    expect(wraiths.length).toBeGreaterThan(0);
    expect(w.areas.some((a) => a.type === 'bossSlam')).toBe(true);
  });

  it('closes the arena with fire in phase 3, hurting a Warden at the rim', () => {
    const w = act2World();
    const e = boss(w, 0.2);
    tick(w, e, 0.2);
    expect(w.arenaFireActive).toBe(true);
    const r0 = w.arenaFireRadius;
    tick(w, e, 5);
    expect(w.arenaFireRadius).toBeLessThan(r0);

    // Park the Warden in a corner, well outside the ring, and check it burns.
    w.warden.x = 1.5;
    w.warden.y = 1.5;
    w.arenaFireRadius = 4;
    const hp = w.warden.hp;
    tick(w, e, 2);
    expect(w.warden.hp).toBeLessThan(hp);
  });

  it('falls through to a normal chase between abilities', () => {
    const w = act2World();
    const e = boss(w, 1);
    e.x = w.warden.x + 10;
    const before = e.x;
    for (let i = 0; i < 60 * 8; i++) {
      w.rebuildBuckets();
      updateEnemies(w, 1 / 60);
    }
    expect(e.x).toBeLessThan(before);
  });

  // p2e re-pin (measured, not tuned): deleting the double-paying soul-weapon
  // fire loop (the thing this whole item removes) cuts a scripted board's Act
  // II damage roughly in half, since it used to fire *alongside* every built
  // tower's wielded attack rather than being replaced by it. `maxbuild` (8
  // tower types, `upgradeFirst`) no longer wins at all across seeds 1-40
  // (measured 0/40); `hybrid` (6 types, no `upgradeFirst`) still wins about
  // half the time (measured 20/40, 9/20 over the same 1-20 window this test
  // used to probe). Switched to `hybrid` — the same policy the other two
  // boss-adjacent gates in this repo (`a3-movement-mandatory.test.ts`,
  // `f001-cycle-machine.test.ts`) already treat as "the build that moves and
  // can win" — rather than picking a new number for a policy that no longer
  // clears the fight at all. See QUESTIONS.md Q103.
  it('a scripted run reaches it, kills it and wins', () => {
    const { report } = runWithPolicy(cfg({ seed: 1 }), 'hybrid');
    expect(report.outcome).toBe('victory');
    expect(report.bossKilled).toBe(true);
    expect(report.bossKillSeconds).toBeGreaterThan(600);
    expect(report.relicsFound).toBeGreaterThan(0);
  });

  // Twenty seeds, not eight. The claim is a *rate* — the bot loses this fight
  // some of the time — and the loss rate measured either side of m20b is
  // 15% (HEAD 17/20 wins, m20b 18/20). Eight seeds carry a better-than-1-in-4
  // chance of containing no loss at all, so the "but not all" half used to
  // pass or fail on which seeds happened to be in the window: m20b's content
  // change moved the losing seeds from {3,15,17} to {13,15} without moving the
  // rate, and that alone turned the assertion red.
  //
  // p2e re-pin (Q103): switched to `hybrid` for the same reason as the test
  // above, and restated honestly rather than kept at a lowered floor under
  // the old "most win" wording — measured over seeds 1-20, `hybrid` wins 9/20
  // (45%), which is a real fight in both directions, not a fight the bot
  // mostly wins. The old 60% floor is gone; this pins a band around the
  // measured rate (25%-65%) so the test still catches a gross regression
  // either way without asserting a false "mostly wins" story. P10's balance
  // pass, not this deletion, owns moving the rate itself.
  it('is a real fight: the scripted bot wins some and loses some', () => {
    let wins = 0;
    const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
    for (const seed of seeds) {
      if (runWithPolicy(cfg({ seed }), 'hybrid').report.bossKilled) wins++;
    }
    expect(wins, `${wins}/${seeds.length} wins`).toBeGreaterThanOrEqual(Math.ceil(seeds.length * 0.25));
    expect(wins, `${wins}/${seeds.length} wins`).toBeLessThanOrEqual(Math.floor(seeds.length * 0.65));
  });
});

describe('Rift events (SPEC 5.1)', () => {
  it('fires at 3:00, 6:00 and 9:00', () => {
    const w = act2World();
    expect(w.content.spawns.riftTimes).toEqual([180, 360, 540]);
    expect(expandedRiftTimes(w)).toEqual([180, 360, 540]);
  });

  it('Rift Storm doubles the number of tears', () => {
    const w = new World(cfg({ modifiers: ['riftstorm'] }));
    expect(expandedRiftTimes(w).length).toBe(w.content.spawns.riftTimes.length * 2);
  });

  it('a Rift bursts a surge of enemies into the arena', () => {
    const run = new Run(cfg({ seed: 4 }));
    const w = run.world;
    w.phase = 'act2';
    w.sundered = true;
    w.act2Time = 179.9;
    w.updateNav(true);
    const before = w.enemies.length;
    let sawRift = false;
    for (let i = 0; i < 30 && !sawRift; i++) {
      run.step();
      if (w.fx.some((f) => f.k === 'rift')) sawRift = true;
    }
    expect(sawRift).toBe(true);
    expect(w.enemies.length).toBeGreaterThan(before);
  });
});
