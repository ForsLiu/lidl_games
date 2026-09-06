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
import { gateShapedWorstCaseWorld, worstCaseWorld } from '../tools/perf-ratio';

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

  /**
   * fb165 — the same budget, against the shape the game actually produces.
   *
   * The case above scatters the alive cap evenly across the arena by a fixed
   * ring pattern, which is what a VS horde looked like before fb154 moved
   * ground spawns from the screen edge onto the TD gates. Since then a live
   * horde arrives through three fixed points, and qa-playtester measured the
   * same 500-enemy world both ways at **6x** apart. So G17's budget was still
   * being asserted, just no longer against anything the game builds — a perf
   * gate that goes quiet rather than red, which is the more expensive failure.
   *
   * Measured on this host at the fb165 recording (three rounds, `npx tsx` with
   * no other load): scatter **0.062 / 0.040 / 0.039 ms/tick** against gates
   * **0.494 / 0.619 / 0.583** — 8-15x, the same effect qa found, larger here.
   * Both sit far under `SIM_BUDGET_MS` (8.35), which is the point: G17 is
   * re-confirmed against the live shape rather than merely still passing
   * against a shape the game stopped producing at fb154.
   *
   * Both fixtures stay measured, and this one does not replace the other: a
   * scatter is still the harsher case for anything paying per *pair* at range,
   * clustering for anything paying per neighbour, and a budget that survives
   * only one of them is a budget with a blind side. The pair is also the
   * control this item needed — the two worlds differ in enemy *positions* and
   * nothing else, since both call the same `buildWorstCaseBoard`.
   */
  it('simulates the gate-shaped worst case — the post-fb154 spawn shape — inside the same budget', () => {
    const w = gateShapedWorstCaseWorld();
    expect(wieldedAttacks(w).length).toBeGreaterThan(0);
    expect(w.enemies.length).toBeGreaterThanOrEqual(w.content.spawns.aliveCap);
    // Same shields and the same reason as the case above: an unshielded,
    // input-less Warden dies inside the warmup and `Run.step`'s done-early-
    // return then makes the measured ticks free.
    w.invulnerable = true;
    w.godMode = true;
    const run = Object.create(Run.prototype) as Run;
    Object.defineProperty(run, 'world', { value: w, writable: false });

    for (let i = 0; i < 120; i++) run.step(emptyInput());
    const iterations = 300;
    const started = performance.now();
    for (let i = 0; i < iterations; i++) run.step(emptyInput());
    const perTick = (performance.now() - started) / iterations;

    const detail =
      `${perTick.toFixed(2)} ms/tick with ${w.enemies.length} gate-spawned enemies, ` +
      `${wieldedAttacks(w).length} wielded tower types, ${w.structures.length} terrain pieces`;
    expect(perTick, detail).toBeLessThan(SIM_BUDGET_MS);
  });

  /**
   * The fixture check for the case above, and the one that stops it quietly
   * becoming a second copy of the scatter measurement. `gateShapedWorstCaseWorld`
   * is only worth measuring while its horde is genuinely clustered on the
   * gates; if `pickSpawnPoint` were ever swapped back to an edge or a scatter,
   * the timing assertion would still pass — it would just be measuring the
   * thing fb165 exists to stop measuring.
   *
   * Asserted as a shape, not a pinned number: the horde sits measurably tighter
   * around its own centroid than the ring pattern does, and its ground enemies
   * sit near a gate. Both are properties of "spawned through the gates" rather
   * than of any particular map, so terrain generation can move the gates
   * without this going red for the wrong reason.
   */
  it('the gate-shaped fixture really is gate-shaped, not a second scatter', () => {
    const gates = gateShapedWorstCaseWorld();
    const scattered = worstCaseWorld();
    expect(gates.gates.length).toBeGreaterThan(0);
    // Same board, same roster: the two fixtures must differ only in positions,
    // or the timing pair below is not a control.
    expect(gates.enemies.length).toBe(scattered.enemies.length);
    expect(gates.structures.length).toBe(scattered.structures.length);

    /** Share of the horde standing within `r` tiles of some gate. */
    const nearGate = (w: typeof gates, r: number): number =>
      w.enemies.filter((e) => w.gates.some((g) => Math.hypot(e.x - (g.tx + 0.5), e.y - (g.ty + 0.5)) <= r))
        .length / w.enemies.length;

    // Deliberately *not* distance-from-centroid: three clusters at three map
    // edges put their common centroid in the middle of the arena and score
    // *wider* than an even field (measured 17.85 vs 9.89 tiles), so that
    // statistic reads a bimodal horde exactly backwards. Proximity to a gate
    // is the property "spawned through the gates" actually has.
    // Measured at the recording: 1.000 within 3 tiles for the gate fixture
    // against 0.044 for the scatter. Asserted with wide margin either side, so
    // terrain generation moving the gates is free and a fill that stops using
    // them is not.
    expect(nearGate(gates, 3), `gate fixture: ${(nearGate(gates, 3) * 100).toFixed(1)}% within 3 tiles of a gate`)
      .toBeGreaterThan(0.8);
    expect(nearGate(scattered, 3), `scatter fixture: ${(nearGate(scattered, 3) * 100).toFixed(1)}% within 3 tiles`)
      .toBeLessThan(0.3);

    // Density, the quantity the tick cost actually pays for, read as the mean
    // distance to each enemy's nearest neighbour. Measured 0.015 tiles through
    // the gates against 0.560 scattered — a ~37x difference that no plausible
    // re-seed of the ring pattern reaches, so the ordering is asserted with an
    // order of magnitude of slack rather than pinned.
    const meanNearest = (w: typeof gates): number => {
      let sum = 0;
      for (const a of w.enemies) {
        let best = Infinity;
        for (const b of w.enemies) {
          if (a === b) continue;
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < best) best = d;
        }
        sum += best;
      }
      return sum / w.enemies.length;
    };
    const dGates = meanNearest(gates);
    const dScatter = meanNearest(scattered);
    expect(dGates, `mean nearest-neighbour: gates ${dGates.toFixed(3)} vs scatter ${dScatter.toFixed(3)} tiles`)
      .toBeLessThan(dScatter / 4);
  });

  // RETIRED (p10e, SPEC-FINAL §14 G17, §16 P10 re-baseline). This asserted a
  // wall-clock budget over `--cycles 1`, SPEC A10's original single-pass run
  // shape; P3 superseded that with the real 18-TD/6-VS/6-cycle shape (§1.1),
  // which `--cycles 1` never plays. It also pinned an exact `wavesCleared`
  // count that the P10 balance retunes (p10c/p10d) have since moved past —
  // confirmed failing on HEAD before this item touched it (measured 18
  // cleared against a pin of 16). G17's own text calls for a host-independent
  // per-simulated-minute budget, not an absolute-ms budget over a shape the
  // game no longer plays; `tests/p10e-perf-budget.test.ts` replaces this with
  // exactly that, measured on the real run shape with `hybrid` play.
  it.skip('runs a full headless game in under 5 seconds', () => {
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
