/**
 * Phase-reachability census (BACKLOG-QUALITY q9): which `Phase` values each
 * shipped bot policy actually enters over N seeds of real, undirected play.
 *
 * This is deliberately the opposite instrument from `tools/fuzz-input.ts`'s
 * `runInPhase`, which *forces* a world into a named phase so it can be
 * fuzzed. Here nothing is forced — a policy plays a normal run and we record
 * every `world.phase` its own commands and the sim's own transitions ever
 * produce. A phase no shipped policy reaches is a phase no sim/sweep/gate
 * measurement ever exercises, so a regression in it would be invisible to
 * the whole bot suite (session 1's `soulpick` finding — a phase deleted with
 * the souls system at p3d, but the instrument outlives the finding).
 *
 * Ported to the SPEC-FINAL phase machine (quality-lane merge): the
 * dusk/soulpick/dawn phases are gone (`Phase` is the five-member union in
 * src/sim/types.ts), and a normal run is now the 6-block §1.1 interleave —
 * `reachedPhases` deliberately passes no `cycles` so it plays the shipped
 * default shape, exactly as before.
 *
 *   npx tsx tools/phase-coverage.ts                    # all policies, 12 seeds
 *   npx tsx tools/phase-coverage.ts --seeds 50 --json
 */

import type { Phase, RunConfig } from '../src/sim/types';

// b014: `Run`/`makePolicy`/`policyNames`/`../src/bots`'s registration side
// effect all transitively value-import `src/sim/content.ts`, which statically
// imports every `/data/*.json` file — `tsx`'s esbuild transform parses that
// at *module-load* time, before any of this file's own code (including the
// try/catch already inside `main()` below) ever runs. A static
// `import { Run } from '../src/sim/run'` here would crash on a `/data` JSON
// syntax error with a raw, uncaught `Transform failed with 1 error` stack
// trace nothing below could intercept. A top-level-await dynamic `import()`
// rejects into an ordinary catchable promise instead — the same shape
// `tools/content-census.ts` (q38) already uses for its own `src/sim/content`
// import, and `tools/sim.ts` (b014) now uses for this same import.
let Run: typeof import('../src/sim/run').Run;
let makePolicy: typeof import('../src/bots').makePolicy;
let policyNames: typeof import('../src/bots').policyNames;
try {
  ({ Run } = await import('../src/sim/run'));
  ({ makePolicy, policyNames } = await import('../src/bots'));
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ error: message.replace(/\s+/g, ' ').trim() }));
  } else {
    console.error(`phase-coverage: ${message.replace(/\s+/g, ' ').trim()}`);
  }
  process.exit(1);
}

export const ALL_PHASES: readonly Phase[] = [
  'act1_build',
  'act1_wave',
  'act2',
  'levelup',
  'results',
];

const DEFAULT_MAX_TICKS = 60 * 60 * 45;

export interface PolicyCensus {
  policy: string;
  seeds: number;
  seedStart: number;
  /** Every distinct `Phase` this policy's runs stood in, sorted. */
  reached: Phase[];
  /** `ALL_PHASES` minus `reached`. */
  unreached: Phase[];
}

/** Play one seeded run of `policyName` to completion (or `maxTicks`), recording every phase visited. */
export function reachedPhases(policyName: string, seed: number, maxTicks = DEFAULT_MAX_TICKS): Set<Phase> {
  const cfg: RunConfig = { seed, classKey: 'engineer', tier: 1, modifiers: [], allocated: [] };
  const run = new Run({ ...cfg, policy: policyName });
  const policy = makePolicy(policyName);
  const reached = new Set<Phase>();
  while (!run.done && run.world.tick < maxTicks) {
    reached.add(run.world.phase);
    run.step(policy.act(run.world));
  }
  reached.add(run.world.phase);
  return reached;
}

export function censusOne(policyName: string, seeds: number, seedStart = 1): PolicyCensus {
  const reached = new Set<Phase>();
  for (let i = 0; i < seeds; i++) {
    for (const p of reachedPhases(policyName, seedStart + i)) reached.add(p);
  }
  const reachedArr = ALL_PHASES.filter((p) => reached.has(p));
  const unreached = ALL_PHASES.filter((p) => !reached.has(p));
  return { policy: policyName, seeds, seedStart, reached: reachedArr, unreached };
}

export function census(policies: string[], seeds: number, seedStart = 1): PolicyCensus[] {
  return policies.map((p) => censusOne(p, seeds, seedStart));
}

/** Every policy the game ships, in registration order. Requires `import '../src/bots'` to have run. */
export function shippedPolicies(): string[] {
  return policyNames();
}

/* ------------------------------------------------------------------- CLI */

function usage(msg: string): never {
  console.error(`phase-coverage: ${msg}`);
  console.error('usage: npx tsx tools/phase-coverage.ts [--seeds <positive int>] [--seed-start <int>] [--json]');
  process.exit(2);
}

function intArg(argv: string[], flag: string, dflt: number, positive: boolean): number {
  const i = argv.indexOf(flag);
  if (i < 0) return dflt;
  const raw = argv[i + 1];
  if (raw === undefined) usage(`${flag} needs a value`);
  const v = Number(raw);
  if (raw.trim() === '' || !Number.isInteger(v)) usage(`${flag} must be an integer, got ${JSON.stringify(raw)}`);
  if (positive && v <= 0) usage(`${flag} must be > 0, got ${v}`);
  return v;
}

function main(argv: string[]): void {
  const seeds = intArg(argv, '--seeds', 12, true);
  const seedStart = intArg(argv, '--seed-start', 1, false);
  const json = argv.includes('--json');

  let rows: PolicyCensus[];
  try {
    rows = census(shippedPolicies(), seeds, seedStart);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (json) {
      console.log(JSON.stringify({ error: message }));
    } else {
      console.error(`phase-coverage: ${message.replace(/\s+/g, ' ').trim()}`);
    }
    process.exitCode = 1;
    return;
  }

  if (json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  console.log(`phase coverage  seeds=${seeds} (start ${seedStart})  phases=${ALL_PHASES.join(',')}`);
  const nameW = Math.max(...rows.map((r) => r.policy.length), 'policy'.length) + 2;
  const reachedW = Math.max(...rows.map((r) => r.reached.join(',').length), 'reached'.length) + 2;
  console.log('policy'.padEnd(nameW) + 'reached'.padEnd(reachedW) + 'unreached');
  for (const r of rows) {
    console.log(r.policy.padEnd(nameW) + r.reached.join(',').padEnd(reachedW) + (r.unreached.join(',') || '-'));
  }

  const neverReached = ALL_PHASES.filter((p) => rows.every((r) => !r.reached.includes(p)));
  if (neverReached.length > 0) {
    console.log(`\nphases no shipped policy ever reaches: ${neverReached.join(', ')}`);
  }
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('tools/phase-coverage.ts');
if (invokedDirectly) main(process.argv.slice(2));
