/**
 * Host-normalized perf ratio probe (BACKLOG-QUALITY q13), for SPEC-FINAL §14
 * G17: "Perf: sim budget per simulated minute (host-independent)".
 *
 * `tests/a10-performance.test.ts` asserts an absolute wall-clock budget
 * (SIM_BUDGET_MS), and BACKLOG-QUALITY.md's session-2 log caught that budget
 * failing for a reason that had nothing to do with the sim: five node
 * processes competing for CPU in the main checkout inflated every timing by
 * the same ~30-40%, on the same commit that measured green minutes earlier.
 * A raw ms bound cannot tell "the sim got slower" from "the host got busier".
 *
 * The fix here is not to trust an absolute number at all: time a fixed,
 * sim-independent unit of CPU work (`calibrationWork`) in the same process,
 * right next to the worst-case Act II tick, and report their ratio —
 * "this tick costs as much as N calibration units" — rather than "this tick
 * costs N ms". Both numbers inflate together under host contention, so the
 * ratio is far steadier than either half alone (see the stability test in
 * `tests/q13-perf-ratio.test.ts`, which proves this empirically rather than
 * asserting it by construction).
 *
 * `worstCaseWorld` is moved here from `tests/a10-performance.test.ts`
 * (which now imports it back) rather than re-derived, the same reuse-not-
 * re-derive shape q11 used for the invariant scanner.
 *
 *   npx tsx tools/perf-ratio.ts                # default calibration/tick sizes
 *   npx tsx tools/perf-ratio.ts --calib-iters 40000000 --tick-samples 600
 */

import { Run } from '../src/sim/run';
import { World } from '../src/sim/world';
import { spawnEnemy } from '../src/sim/enemies';
import { buildTower } from '../src/sim/towers';
import { finishSundering } from '../src/sim/sundering';
import { wieldedAttacks } from '../src/sim/vswield';
import { GRID_H, GRID_W } from '../src/sim/grid';
import { emptyInput } from '../src/sim/types';
import { makePolicy } from '../src/bots';
import { cfg } from '../tests/helpers';

/** A worst-case Act II frame: the alive cap, a full wielded attack set, and a field of petrified terrain. */
export function worstCaseWorld(): World {
  const w = new World(cfg({ seed: 9 }));
  w.gold = 1e6;
  const keys = ['arrow_spire', 'ballista', 'venom_spore', 'mortar', 'tesla_coil', 'palisade'];
  let i = 0;
  for (let y = 3; y < GRID_H - 3; y += 2) {
    for (let x = 3; x < GRID_W - 6; x += 2) {
      w.warden.x = x + 0.5;
      w.warden.y = y + 0.5;
      const def = w.content.towerByKey.get(keys[i++ % keys.length])!;
      buildTower(w, def.id, x, y);
    }
  }
  // SPEC-FINAL §6.1: every built tower type wields automatically, so a full
  // attack set falls out of the spread of tower keys built above — no
  // separate weapon roster to grant.
  finishSundering(w);
  if (wieldedAttacks(w).length === 0) throw new Error('worstCaseWorld: no wielded attacks after sundering');

  w.act2Time = 540;
  const cap = w.content.spawns.aliveCap;
  const pool = ['husk', 'sprinter', 'bulwark', 'spitter', 'wraith', 'bomber', 'charger', 'shellback'];
  let n = 0;
  for (let ring = 2; ring < 18 && n < cap; ring++) {
    for (let k = 0; k < 40 && n < cap; k++) {
      const x = 1.5 + ((ring * 7 + k * 3) % (GRID_W - 3));
      const y = 1.5 + ((ring * 3 + k * 5) % (GRID_H - 3));
      if (spawnEnemy(w, pool[n % pool.length], x, y, { overlay: true })) n++;
    }
  }
  return w;
}

function worldRun(w: World): Run {
  const run = Object.create(Run.prototype) as Run;
  Object.defineProperty(run, 'world', { value: w, writable: false });
  return run;
}

/**
 * A fixed, deterministic unit of CPU work with no dependency on the sim, the
 * heap, or GC pressure the sim's own allocation pattern creates — pure
 * integer arithmetic in a tight loop, so its wall-clock cost is (to first
 * order) just "how fast is this CPU", the same quantity the worst-case tick's
 * wall-clock cost also depends on. Deliberately not `Math.sqrt`/trig: this
 * runs from `tools/`, not `/src/sim`, so architecture rule 1 does not apply
 * here, but staying plain-integer keeps the unit itself simple to reason
 * about and immune to a JS engine's transcendental-function fast paths
 * varying more than multiply-add does across hosts.
 *
 * Returns the accumulator so V8 cannot fold the whole loop away as dead code.
 */
export function calibrationWork(iterations: number): number {
  let acc = 1;
  for (let i = 0; i < iterations; i++) {
    acc = (acc * 1000000007 + i) % 2147483647;
  }
  return acc;
}

export interface TickTiming {
  msPerTick: number;
  enemies: number;
  /** Wielded tower attack types (SPEC-FINAL §6.1), the successor to the old granted-weapon roster. */
  weapons: number;
  structures: number;
}

export interface PerfRatio extends TickTiming {
  calibIters: number;
  calibMs: number;
  tickSamples: number;
  msPerCalibUnit: number;
  /** How many calibration units one tick costs — the host-independent number G17 wants. */
  ratio: number;
}

/**
 * Ratio for an arbitrary world's tick cost, so a caller can compare the worst
 * case against a cheap baseline.
 *
 * Calibration and tick work are measured **interleaved**, one calibration
 * chunk immediately followed by one tick, `tickSamples` times over — not as
 * two back-to-back blocks. Measured empirically (session 9 log): under real
 * `npm test` contention (many other test files' worker threads competing for
 * cores, exactly what `vitest.config.ts` runs A10 outside of for the same
 * reason), a contiguous "all calibration, then all ticks" measurement let a
 * contention burst land on one block and not the other, and the ratio it
 * produced was ~3x its quiet-host value — the exact host-dependence this
 * probe exists to remove. Interleaving at fine grain means any burst shorter
 * than the whole measurement window falls on both kinds of work in roughly
 * the proportion they occupy the timeline, so it moves both readings
 * together instead of just one. This lane's Scope cannot move this test into
 * `vitest.perf.config.ts`'s single-threaded run the way A10 itself is
 * isolated (that file is outside `tests/**`/`tools/**`), so the measurement
 * has to survive contention rather than avoid it.
 *
 * The optional `onEvent` callback fires from inside the real loop above right
 * after each half completes, so a caller can record the actual call order
 * this function takes (q26) instead of only the wall-clock outcome q13 already
 * proves stable — a regression back to two separate blocks changes what
 * `onEvent` observes regardless of host timing.
 */
/** Which half of one interleaved sample just completed — the call-order seam `tests/q26-perf-ratio-interleave.test.ts` reads directly rather than inferring from timing. */
export type RatioTraceEvent = 'calib' | 'tick';

export function measureRatioForWorld(
  w: World,
  calibIters: number,
  tickSamples: number,
  warmupTicks = 120,
  onEvent?: (event: RatioTraceEvent, sampleIndex: number) => void,
): PerfRatio {
  const run = worldRun(w);
  for (let i = 0; i < warmupTicks; i++) run.step(emptyInput());
  calibrationWork(Math.min(calibIters, 2_000_000)); // settle the calibration path's JIT too

  const calibChunk = Math.max(1, Math.floor(calibIters / tickSamples));
  let calibMs = 0;
  let calibDone = 0;
  let tickMs = 0;
  for (let i = 0; i < tickSamples; i++) {
    const c0 = performance.now();
    const acc = calibrationWork(calibChunk);
    calibMs += performance.now() - c0;
    calibDone += calibChunk;
    if (Number.isNaN(acc)) throw new Error('unreachable: calibrationWork is pure integer arithmetic');
    onEvent?.('calib', i);

    const t0 = performance.now();
    run.step(emptyInput());
    tickMs += performance.now() - t0;
    onEvent?.('tick', i);
  }
  const msPerCalibUnit = calibMs / calibDone;
  const msPerTick = tickMs / tickSamples;
  const ratio = msPerTick / msPerCalibUnit;
  return {
    msPerTick,
    enemies: w.enemies.length,
    weapons: wieldedAttacks(w).length,
    structures: w.structures.length,
    calibIters: calibDone,
    calibMs,
    tickSamples,
    msPerCalibUnit,
    ratio,
  };
}

export function measureRatio(calibIters: number, tickSamples: number, warmupTicks = 120): PerfRatio {
  return measureRatioForWorld(worstCaseWorld(), calibIters, tickSamples, warmupTicks);
}

export interface SimMinuteRatio {
  seed: number;
  policy: string;
  ticks: number;
  simMinutes: number;
  outcome: string;
  tickMs: number;
  calibMs: number;
  calibUnits: number;
  /** Calibration units per simulated minute — the host-independent number G17's first clause wants. */
  ratioPerMinute: number;
}

/**
 * G17's first clause: "sim budget per simulated minute (host-independent)".
 * Unlike `measureRatioForWorld`'s single static worst-case tick, this plays a
 * real bot-driven run (the same `Run`/`makePolicy` harness
 * `tests/p10d-run-length.test.ts` uses for G1) end to end, so it amortizes
 * over everything an actual run does — build-phase idle ticks, TD waves, VS
 * combat, the boss fight — rather than only the single most expensive frame
 * A10's benchmark already covers.
 *
 * Calibration work is interleaved every `sampleEvery` ticks (not every tick):
 * spread thinly across the whole run for the same contention-robustness
 * reason `measureRatioForWorld`'s doc comment gives for fine-grained
 * interleaving, while keeping the total calibration cost a small, bounded
 * fraction of the run instead of scaling 1:1 with tick count.
 */
export function measureSimMinuteRatio(
  seed: number,
  policyName: string,
  calibChunk: number,
  sampleEvery: number,
  maxTicks: number,
): SimMinuteRatio {
  const runCfg = { seed, classKey: 'engineer', tier: 1, modifiers: [], allocated: [], policy: policyName };
  const run = new Run(runCfg);
  const policy = makePolicy(policyName);

  let tickMs = 0;
  let calibMs = 0;
  let calibUnits = 0;
  let sampled = 0;
  while (!run.done && run.world.tick < maxTicks) {
    const input = policy.act(run.world);
    const t0 = performance.now();
    run.step(input);
    tickMs += performance.now() - t0;

    sampled++;
    if (sampled % sampleEvery === 0) {
      const c0 = performance.now();
      const acc = calibrationWork(calibChunk);
      calibMs += performance.now() - c0;
      calibUnits += calibChunk;
      if (Number.isNaN(acc)) throw new Error('unreachable: calibrationWork is pure integer arithmetic');
    }
  }
  // At least one calibration sample even on a run too short to hit
  // sampleEvery once, so msPerCalibUnit is never a divide-by-zero.
  if (calibUnits === 0) {
    const c0 = performance.now();
    const acc = calibrationWork(calibChunk);
    calibMs += performance.now() - c0;
    calibUnits += calibChunk;
    if (Number.isNaN(acc)) throw new Error('unreachable: calibrationWork is pure integer arithmetic');
  }

  const msPerCalibUnit = calibMs / calibUnits;
  const simMinutes = run.world.tick / (60 * 60);
  const ratioPerMinute = tickMs / msPerCalibUnit / simMinutes;
  return {
    seed,
    policy: policyName,
    ticks: run.world.tick,
    simMinutes,
    outcome: run.world.outcome,
    tickMs,
    calibMs,
    calibUnits,
    ratioPerMinute,
  };
}

/* ------------------------------------------------------------------- CLI */

function usage(msg: string): never {
  console.error(`perf-ratio: ${msg}`);
  console.error(
    'usage: npx tsx tools/perf-ratio.ts [--calib-iters <positive int>] [--tick-samples <positive int>] [--json]',
  );
  process.exit(2);
}

function intArg(argv: string[], flag: string, dflt: number): number {
  const i = argv.indexOf(flag);
  if (i < 0) return dflt;
  const raw = argv[i + 1];
  if (raw === undefined) usage(`${flag} needs a value`);
  const v = Number(raw);
  if (raw.trim() === '' || !Number.isInteger(v) || v <= 0) {
    usage(`${flag} must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return v;
}

function main(argv: string[]): void {
  const calibIters = intArg(argv, '--calib-iters', 20_000_000);
  const tickSamples = intArg(argv, '--tick-samples', 300);
  const json = argv.includes('--json');

  const r = measureRatio(calibIters, tickSamples);

  if (json) {
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  console.log(`perf-ratio  calibIters=${r.calibIters} tickSamples=${r.tickSamples}`);
  console.log(`  calibration: ${r.calibMs.toFixed(2)} ms total, ${(r.msPerCalibUnit * 1e6).toFixed(4)} ns/unit`);
  console.log(
    `  worst-case tick: ${r.msPerTick.toFixed(3)} ms/tick ` +
      `(${r.enemies} enemies, ${r.weapons} wielded tower types, ${r.structures} terrain pieces)`,
  );
  console.log(`  ratio (calibration units per tick): ${r.ratio.toFixed(1)}`);
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('tools/perf-ratio.ts');
if (invokedDirectly) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`perf-ratio: ${message.replace(/\s+/g, ' ').trim()}`);
    process.exitCode = 1;
  }
}
