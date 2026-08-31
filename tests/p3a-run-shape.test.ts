/**
 * SPEC-FINAL §1.1 (P3, BACKLOG p3a), gate G6's pattern half: "3 TD waves,
 * then 1 VS wave, repeating" — 18 TD + 6 VS waves per run, VS after TD waves
 * 3/6/9/12/15/18, TD wave 18 carries the Gatebreaker, the final VS wave is
 * boss-gated (Warden-Eater) rather than timed, build phases are 15s (retuned
 * from 20s at p10l for G1 pacing), VS waves are 75s (final excepted), and
 * building is rejected throughout every VS wave.
 *
 * Drives a full scripted 18+6 run by forcing each wave boundary the same way
 * the rest of the suite does (`forceWaveClear`-style direct pokes — see
 * tests/f003-leak-coupling.test.ts): this is a phase-machine counting/
 * transition test, not a combat-balance test, and
 * `data/waves.json` only authors 10 real TD waves today (waves past the table
 * repeat wave 10's composition — see `buildSpawnQueue` in src/sim/run.ts;
 * authoring real 11-18 content is BACKLOG p8a, not this item's job).
 * `invulnerable`/`godMode` remove combat risk from the director's real Act II
 * spawns so the run can be driven purely by phase-boundary assertions.
 */

import { describe, expect, it } from 'vitest';

import { Run, applyCommand } from '../src/sim/run';
import { buildTower, checkBuild } from '../src/sim/towers';
import { killEnemy } from '../src/sim/enemies';
import { emptyInput } from '../src/sim/types';
import { cfg } from './helpers';

describe('p3a: SPEC-FINAL §1.1 run shape (gate G6 pattern half)', () => {
  it('interleaves 3 TD waves -> 1 VS wave x 6 (18 TD + 6 VS), 15s build / 75s VS, Gatebreaker on TD 18, boss-gated final VS, building rejected during every VS wave', () => {
    const run = new Run(cfg({ cycles: 6, seed: 1 }));
    const w = run.world;
    w.invulnerable = true;
    w.godMode = true;

    const buildPhaseSeconds = w.content.waves.buildPhaseSeconds;
    const vsWaveSeconds = w.content.waves.vsWaveSeconds;
    // §1.1's own stated ⚖ constants. buildPhaseSeconds was retuned 20->15 at
    // p10l (G1 pacing); vsWaveSeconds is untouched (§17's owner-review list).
    expect(buildPhaseSeconds).toBe(15);
    expect(vsWaveSeconds).toBe(75);

    const gatebreakerId = w.content.enemyByKey.get('gatebreaker')!.id;
    const arrowSpireId = w.content.towerByKey.get('arrow_spire')!.id;

    let tdWaveCount = 0;
    let vsWaveCount = 0;
    let wave18Queue: number[] = [];

    for (let block = 1; block <= 6; block++) {
      for (let i = 0; i < 3; i++) {
        // Build phase: 15s, sourced from data, not a magic number in code.
        expect(w.phase).toBe('act1_build');
        expect(w.buildTimer).toBe(buildPhaseSeconds);

        // Skip the timer (same door `dev skip_wave` uses) and let the real
        // `startWave` build the real spawn queue for this wave number.
        w.buildTimer = 0;
        run.step(emptyInput());
        expect(w.phase).toBe('act1_wave');
        tdWaveCount++;
        expect(w.wave).toBe(tdWaveCount);

        if (w.wave === 18) {
          wave18Queue = w.spawnQueue.map(([defId]) => defId);
        }

        // Empty the field and let the real completeWave() transition fire.
        w.spawnQueue = [];
        w.enemies = [];
        run.step(emptyInput());

        const shouldEnterVs = tdWaveCount % 3 === 0;
        if (shouldEnterVs) {
          // VS after TD wave 3/6/9/12/15/18 — not before, not at any other
          // count — and immediately: p3d deleted the Dusk wait entirely, so
          // the very `run.step` that cleared this wave already ran
          // `finishSundering` synchronously (`completeWave`, run.ts) and
          // landed straight in 'act2'. SPEC-FINAL §1.1 states only 20s build +
          // 75s VS per block, nothing between them.
          expect(w.phase).toBe('act2');
          expect(checkBuild(w, arrowSpireId, 5, 5)).toBe('phase');
          const vsBuiltBefore = w.towersBuilt;
          applyCommand(w, { k: 'build', tower: arrowSpireId, tx: 5, ty: 5 });
          expect(w.towersBuilt).toBe(vsBuiltBefore);
        } else {
          expect(w.phase).toBe('act1_build');
          expect(w.buildTimer).toBe(buildPhaseSeconds);
        }
      }

      expect(w.phase).toBe('act2');
      vsWaveCount++;
      expect(w.cycle).toBe(block);

      // Building is rejected during VS: both the pure check and the command path.
      expect(checkBuild(w, arrowSpireId, 5, 5)).toBe('phase');
      const builtBefore = w.towersBuilt;
      const rejected = buildTower(w, arrowSpireId, 5, 5);
      expect(rejected.ok).toBe(false);
      applyCommand(w, { k: 'build', tower: arrowSpireId, tx: 5, ty: 5 });
      expect(w.towersBuilt).toBe(builtBefore);

      const isFinal = block === 6;
      if (!isFinal) {
        // Just under 75s: must not end early.
        w.act2Time = vsWaveSeconds - 1;
        run.step(emptyInput());
        expect(w.phase).toBe('act2');

        // At 75s: the block ends immediately into the next TD block's build
        // phase (p3d: no Dawn ledger — `advanceToNextBlock` fires directly).
        w.act2Time = vsWaveSeconds;
        run.step(emptyInput());
        expect(w.phase).toBe('act1_build');
        expect(w.cycle).toBe(block + 1);
      } else {
        // Final VS wave: not on the 75s timer at all — it must still be
        // running well past 75s while the Warden-Eater is alive.
        w.act2Time = vsWaveSeconds;
        run.step(emptyInput());
        expect(w.phase).toBe('act2');
        expect(w.outcome).toBe('running');

        w.act2Time = 300;
        run.step(emptyInput());
        expect(w.phase).toBe('act2');
        expect(w.outcome).toBe('running');

        // The boss spawns once Act II time reaches the spawn trigger.
        w.act2Time = w.content.spawns.bossTimeSeconds;
        run.step(emptyInput());
        expect(w.bossSpawned).toBe(true);
        const boss = w.enemies.find((e) => e.def.key === 'warden_eater' && !e.dead);
        expect(boss).toBeTruthy();

        w.act2Time += 1;
        run.step(emptyInput());
        expect(w.phase).toBe('act2');
        expect(w.outcome).toBe('running');

        // Killing it ends the run in victory — the only way the final VS wave ends.
        killEnemy(w, boss!, 'test');
        run.step(emptyInput());
        expect(w.bossKilled).toBe(true);
        expect(w.outcome).toBe('victory');
        expect(w.phase).toBe('results');
      }
    }

    expect(tdWaveCount).toBe(18);
    expect(vsWaveCount).toBe(6);
    // code-reviewer note: this only proves wave 18's *real* spawn queue
    // carries the Gatebreaker, not that wave 18 is specially authored for it —
    // `buildSpawnQueue` (run.ts) repeats wave 10's row (which already has one)
    // for every wave 10-18 today, so this would not catch a future authoring
    // regression that also put one on waves 11-17. Authoring distinct 11-18
    // content, including exactly one Gatebreaker at 18, is BACKLOG p8a's job.
    expect(wave18Queue).toContain(gatebreakerId);
  });
});
