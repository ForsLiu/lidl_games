/**
 * SPEC A10: 350 enemies + 8 weapons + terrain at 60 fps on a mid laptop, and a
 * full headless run in 5 seconds or less.
 *
 * Frame rate cannot be measured here, so it is checked as its sim-side
 * precondition: one tick of a worst-case Act II frame — the alive cap, a full
 * weapon set and a field of petrified terrain — must fit inside the 16.7 ms
 * budget with room to spare for rendering.
 */

import { execSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { Run } from '../src/sim/run';
import { wieldedAttacks } from '../src/sim/vswield';
import { emptyInput } from '../src/sim/types';
import { makePolicy } from '../src/bots';
import '../src/bots';
import { cfg } from './helpers';
import { worstCaseWorld } from '../tools/perf-ratio';

const FRAME_BUDGET_MS = 16.7;
/** The sim gets half a frame; the rest is the renderer's. */
const SIM_BUDGET_MS = FRAME_BUDGET_MS / 2;
const RUN_BUDGET_MS = 5000;
const NEWLINES = /\r?\n/;

describe('A10 performance', () => {
  it('simulates a worst-case Act II frame inside half a frame budget', () => {
    const w = worstCaseWorld();
    // SPEC-FINAL §6.1: every built tower type wields automatically, so the
    // full attack set falls out of the spread of tower keys built above — no
    // separate weapon roster to grant.
    expect(wieldedAttacks(w).length).toBeGreaterThan(0);
    expect(w.enemies.length).toBeGreaterThanOrEqual(w.content.spawns.aliveCap);
    // Practice-tool shields keep the run alive for the whole measurement
    // window: unshielded, the input-less Warden dies by ~tick 100 and
    // `Run.step`'s done-early-return turns later "measured" ticks free,
    // quietly softening the budget assertion (found porting q13 at the
    // lane/quality merge — see livingWorstCaseWorld there).
    w.invulnerable = true;
    w.godMode = true;
    const run = Object.create(Run.prototype) as Run;
    Object.defineProperty(run, 'world', { value: w, writable: false });

    // Warm up the JIT, then measure.
    for (let i = 0; i < 120; i++) run.step(emptyInput());
    const iterations = 300;
    const started = performance.now();
    for (let i = 0; i < iterations; i++) run.step(emptyInput());
    const perTick = (performance.now() - started) / iterations;

    const detail =
      `${perTick.toFixed(2)} ms/tick with ${w.enemies.length} enemies, ` +
      `${wieldedAttacks(w).length} wielded tower types, ${w.structures.length} terrain pieces`;
    expect(perTick, detail).toBeLessThan(SIM_BUDGET_MS);
  });

  it('runs a full headless game in under 5 seconds', () => {
    // Timed through the shipped path (`npm run sim`) rather than in-process:
    // Vitest's transform adds ~40% that has nothing to do with the sim. The CLI
    // reports `simMs` for the run loop alone, so process startup is excluded.
    // SPEC A10 measures the original single-pass run; the SPEC-V2 cycle split
    // is a separate (not-yet-tuned) balance question for M15/M16.
    const out = execSync('npx tsx tools/sim.ts --seeds 1,2,4 --policy maxbuild --cycles 1', {
      encoding: 'utf8',
      cwd: process.cwd(),
    });
    const runs = out
      .split(NEWLINES)
      .filter((line) => line.startsWith('{"seed"'))
      .map((line) => JSON.parse(line) as { simMs: number; seed: number; wavesCleared: number });
    expect(runs.length).toBe(3);
    // p8a: `--cycles 1` walks the full authored TD wave table in one pass
    // (world.ts's single-pass escape hatch), which now has 18 real rows —
    // but a completed run (measured, not assumed per CLAUDE.md's "needs the
    // control run" rule) shows `maxbuild` dying `defeat_core` at wave 16-17,
    // the same wave-11-17 HP-curve wall Q109/Q116/Q121 already measured
    // across every other p8a-adjacent gate. Real content, not yet a tuned
    // economy — closing this to 18 is a P10 balance question, not a p8a
    // authoring bug (CLAUDE.md: "P10 is the one balance pass"). 16/16/16
    // across all three seeds, deterministic.
    for (const r of runs) expect(r.wavesCleared).toBe(16);
    const timings = runs.map((r) => r.simMs).sort((a, b) => a - b);
    expect(timings[1], `run times: ${timings.join(', ')} ms`).toBeLessThan(RUN_BUDGET_MS);
  });

  it('keeps entity counts bounded by their SPEC budgets', () => {
    const run = new Run({ ...cfg({ seed: 4 }), policy: 'maxbuild' });
    const policy = makePolicy('maxbuild');
    let maxEnemies = 0;
    let maxGems = 0;
    while (!run.done && run.world.tick < 60 * 60 * 45) {
      run.step(policy.act(run.world));
      maxEnemies = Math.max(maxEnemies, run.world.enemies.length);
      maxGems = Math.max(maxGems, run.world.gems.length);
    }
    const sp = run.world.content.spawns;
    // Packs and splits can overshoot the cap slightly within one spawn burst.
    expect(maxEnemies).toBeLessThanOrEqual(sp.aliveCap * 1.2);
    expect(maxGems).toBeLessThanOrEqual(sp.gemCap * 1.2);
  });
});
