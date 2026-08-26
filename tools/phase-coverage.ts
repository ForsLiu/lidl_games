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
 * the whole bot suite (session 1's `soulpick` finding, filed against
 * `data/towers.json`'s 7-soul / 6-slot mismatch).
 *
 *   npx tsx tools/phase-coverage.ts                    # all policies, 12 seeds
 *   npx tsx tools/phase-coverage.ts --seeds 50 --json
 */

import { Run } from '../src/sim/run';
import type { Phase, RunConfig } from '../src/sim/types';
import { makePolicy, policyNames } from '../src/bots/policy';
import '../src/bots';

export const ALL_PHASES: readonly Phase[] = [
  'act1_build',
  'act1_wave',
  'dusk',
  'soulpick',
  'act2',
  'levelup',
  'dawn',
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
  const cfg: RunConfig = { seed, classKey: 'engineer', tier: 1, modifiers: [], allocated: [], relics: [] };
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

  const rows = census(shippedPolicies(), seeds, seedStart);

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
