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
import { grantWeapon } from '../src/sim/weapons';
import { finishSundering } from '../src/sim/sundering';
import { GRID_H, GRID_W } from '../src/sim/grid';
import { emptyInput } from '../src/sim/types';
import { cfg } from '../tests/helpers';

/** A worst-case Act II frame: the alive cap, a full weapon set, and a field of petrified terrain. */
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
  finishSundering(w, ['arrow_volley', 'piercing_bolt', 'toxic_trail', 'mortar_lob']);
  for (const def of w.content.weapons.weapons) grantWeapon(w, def.key, 6, 0.4);

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
 */
export function measureRatioForWorld(w: World, calibIters: number, tickSamples: number, warmupTicks = 120): PerfRatio {
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

    const t0 = performance.now();
    run.step(emptyInput());
    tickMs += performance.now() - t0;
  }
  const msPerCalibUnit = calibMs / calibDone;
  const msPerTick = tickMs / tickSamples;
  const ratio = msPerTick / msPerCalibUnit;
  return {
    msPerTick,
    enemies: w.enemies.length,
    weapons: w.weapons.length,
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
      `(${r.enemies} enemies, ${r.weapons} weapons, ${r.structures} terrain pieces)`,
  );
  console.log(`  ratio (calibration units per tick): ${r.ratio.toFixed(1)}`);
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('tools/perf-ratio.ts');
if (invokedDirectly) main(process.argv.slice(2));
