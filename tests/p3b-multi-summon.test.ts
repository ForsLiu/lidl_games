/**
 * SPEC-FINAL §1.1 (P3, BACKLOG p3b), gate G6's stacking half: "the player may
 * call the next TD wave(s) early, stacking up to 3 at once; early-call bonus
 * = 2 gold x that wave's un-elapsed build seconds, paid once per wave against
 * its own timer. VS waves cannot be stacked or skipped."
 *
 * `src/sim/run.ts`'s `call` command handles two distinct cases: in
 * `act1_build`, calling early is the pre-existing single-wave behavior
 * (unchanged: pay off whatever is left of the live `buildTimer`, then let
 * `updateAct1Build`'s own zero-check start the wave). In `act1_wave` (a wave
 * already fighting), calling pulls the *next* wave's own not-yet-started
 * build phase forward and merges its spawn queue into the fight in progress
 * — `World.stackDepth` counts the 0..`maxStackedWaves-1` extra waves merged
 * in this way. `completeWave` then clears the whole merged range at once,
 * each wave still paying its own clear bonus.
 */

import { describe, expect, it } from 'vitest';

import { applyCommand, Run } from '../src/sim/run';
import { buildTower, collectSproutGold } from '../src/sim/towers';
import { emptyInput } from '../src/sim/types';
import { cfg } from './helpers';

describe('p3b: multi-summon (gate G6 stacking half)', () => {
  it('stacks up to maxStackedWaves TD waves, each paying its own early-call bonus exactly once, and rejects a further stack', () => {
    const run = new Run(cfg({ cycles: 6, seed: 1 }));
    const w = run.world;
    w.invulnerable = true;
    w.godMode = true;

    const c = w.content.waves;
    expect(c.maxStackedWaves).toBe(3);
    const perWaveBonus = Math.round(c.buildPhaseSeconds * c.earlyCallGoldPerSecond);

    // Call wave 1 early (the pre-existing single-wave path — full buildTimer,
    // since nothing has ticked yet).
    let gold = w.gold;
    applyCommand(w, { k: 'call' });
    expect(w.gold).toBe(gold + perWaveBonus);
    gold = w.gold;
    run.step(emptyInput());
    expect(w.phase).toBe('act1_wave');
    expect(w.wave).toBe(1);
    expect(w.stackDepth).toBe(0);

    // Stack wave 2 onto the fight already in progress: pays its own bonus
    // (the *full* build phase, since that wave's own timer never started).
    applyCommand(w, { k: 'call' });
    expect(w.gold).toBe(gold + perWaveBonus);
    expect(w.stackDepth).toBe(1);
    gold = w.gold;

    // Stack wave 3: the third and last legal stack (maxStackedWaves = 3).
    applyCommand(w, { k: 'call' });
    expect(w.gold).toBe(gold + perWaveBonus);
    expect(w.stackDepth).toBe(2);
    gold = w.gold;
    const queueLenAtCap = w.spawnQueue.length;

    // A fourth stack is rejected outright: no gold, no depth change, no
    // spawn-queue growth.
    applyCommand(w, { k: 'call' });
    expect(w.gold).toBe(gold);
    expect(w.stackDepth).toBe(2);
    expect(w.spawnQueue.length).toBe(queueLenAtCap);

    // Clear the merged fight (same door p3a's test uses) and let the real
    // completeWave() resolve all three stacked waves at once.
    const wavesClearedBefore = w.wavesCleared;
    w.spawnQueue = [];
    w.enemies = [];
    run.step(emptyInput());

    expect(w.wave).toBe(3);
    expect(w.wavesCleared).toBe(wavesClearedBefore + 3);
    expect(w.stackDepth).toBe(0);
    // Each of the three cleared waves banked its own clear bonus, so the
    // ledger is strictly increasing across waves 1, 2, 3.
    expect(w.goldEarnedByWave[1]).toBeLessThan(w.goldEarnedByWave[2]);
    expect(w.goldEarnedByWave[2]).toBeLessThan(w.goldEarnedByWave[3]);
    // Wave 3 is this block's last (tdWavesPerVsWave = 3): clearing it, even
    // via a stack, ends the block exactly like clearing it one at a time —
    // and immediately (p3d deleted the Dusk wait), landing straight in 'act2'.
    expect(w.phase).toBe('act2');
  });

  it('a summon command during a VS wave is a no-op', () => {
    const run = new Run(cfg({ cycles: 6, seed: 1 }));
    const w = run.world;
    w.phase = 'act2';
    const gold = w.gold;
    const stackDepth = w.stackDepth;
    const spawnQueueLen = w.spawnQueue.length;

    applyCommand(w, { k: 'call' });

    expect(w.gold).toBe(gold);
    expect(w.stackDepth).toBe(stackDepth);
    expect(w.spawnQueue.length).toBe(spawnQueueLen);
    expect(w.phase).toBe('act2');
  });

  it('cannot stack across the block boundary into the VS wave that follows', () => {
    const run = new Run(cfg({ cycles: 6, seed: 1 }));
    const w = run.world;
    w.invulnerable = true;
    w.godMode = true;
    // Land directly on the last wave of block 1 (tdWavesPerVsWave = 3), still fighting.
    w.wave = 3;
    w.phase = 'act1_wave';
    w.spawnQueue = [[1, 0, 3]];
    w.stackDepth = 0;

    const gold = w.gold;
    applyCommand(w, { k: 'call' });

    expect(w.gold).toBe(gold);
    expect(w.stackDepth).toBe(0);
    expect(w.spawnQueue).toEqual([[1, 0, 3]]);
  });

  it('a stacked wave keeps its own spawn attribution (spawnedByWave, HP scale) rather than inheriting the fight\'s base wave', () => {
    const run = new Run(cfg({ cycles: 1, seed: 1 }));
    const w = run.world;
    w.invulnerable = true;
    w.godMode = true;

    w.buildTimer = 0;
    run.step(emptyInput()); // starts wave 1; nothing has spawned yet this tick
    expect(w.phase).toBe('act1_wave');
    const wave1Len = w.spawnQueue.length;
    expect(w.spawnQueue.every(([, , origin]) => origin === 1)).toBe(true);

    applyCommand(w, { k: 'call' }); // stack wave 2 onto it
    expect(w.stackDepth).toBe(1);
    const wave2Len = w.spawnQueue.length - wave1Len;
    expect(wave2Len).toBeGreaterThan(0);
    expect(w.spawnQueue.filter(([, , origin]) => origin === 2).length).toBe(wave2Len);

    // Run long enough to fully drain both merged queues (~63 spawns at
    // spawnIntervalSeconds ~1.02s apiece needs a good deal more than 60s).
    for (let i = 0; i < 60 * 150 && w.spawnQueue.length > 0; i++) run.step(emptyInput());
    expect(w.spawnQueue.length).toBe(0);

    expect(w.spawnedByWave[1]).toBe(wave1Len);
    expect(w.spawnedByWave[2]).toBe(wave2Len);
  });

  it('a stacked clear pays every merged wave\'s own Sprout income, not just one wave\'s worth (code review regression)', () => {
    const run = new Run(cfg({ cycles: 6, seed: 1 }));
    const w = run.world;
    w.invulnerable = true;
    w.godMode = true;

    const sproutId = w.content.towerByKey.get('harvest_sprout')!.id;
    w.warden.x = 5.5;
    w.warden.y = 5.5;
    expect(buildTower(w, sproutId, 5, 5).ok).toBe(true);
    // The per-clear Sprout payout this board earns, read straight off the
    // real helper rather than re-derived, so the test tracks the mechanic
    // even if its formula changes.
    const perWaveSproutGold = collectSproutGold(w);
    // `collectSproutGold` actually paid out above; undo that so the
    // stacked-clear measurement below starts from a clean baseline.
    w.gold -= perWaveSproutGold;
    w.goldEarned -= perWaveSproutGold;
    expect(perWaveSproutGold).toBeGreaterThan(0);

    // Start wave 1, then stack wave 2 on top of it.
    w.buildTimer = 0;
    run.step(emptyInput());
    expect(w.phase).toBe('act1_wave');
    applyCommand(w, { k: 'call' });
    expect(w.stackDepth).toBe(1);

    const goldBeforeClear = w.gold;
    w.spawnQueue = [];
    w.enemies = [];
    run.step(emptyInput()); // completeWave() resolves both merged waves at once

    const c = w.content.waves;
    const wave1Bonus = Math.round((c.waveClearBase + c.waveClearPerWave * 1) * w.derived.goldFindMul);
    const wave2Bonus = Math.round((c.waveClearBase + c.waveClearPerWave * 2) * w.derived.goldFindMul);
    const expectedGold = goldBeforeClear + wave1Bonus + wave2Bonus + 2 * perWaveSproutGold;
    expect(w.gold).toBe(expectedGold);
  });
});
