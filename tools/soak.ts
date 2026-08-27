/**
 * Soak harness (BACKLOG-QUALITY q12): 50 seeded full headless runs across a
 * mix of shipped bot policies, each played the way `tools/phase-coverage.ts`
 * plays them — real, undirected bot input, nothing forced and nothing
 * injected — checked for uncaught exceptions and for NaN/negative-invariant
 * violations in the world (scanned periodically through the run) and in the
 * final report.
 *
 * This is deliberately the *other* half of `tools/fuzz-input.ts`'s `fuzzRun`:
 * that one plays a run with random Commands stitched into the bot's own
 * input, which is q2's job (does the *player surface* survive abuse?). This
 * one plays a run with no injected input at all, which is q1's job (does
 * ordinary, undirected play survive at soak volume?). Both reuse the same
 * scanner — `tools/invariants.ts`'s `scanWorld`/`scanReport` (lane item q11)
 * — rather than each carrying its own copy.
 *
 *   npx tsx tools/soak.ts                       # 50 runs, mixed policies
 *   npx tsx tools/soak.ts --seeds 200 --json
 */

import { Run } from '../src/sim/run';
import type { RunConfig } from '../src/sim/types';
import { makePolicy, policyNames } from '../src/bots';
import '../src/bots';
import { scanReport, scanWorld } from './invariants';

const DEFAULT_MAX_TICKS = 60 * 60 * 45;

export interface SoakResult {
  seed: number;
  policy: string;
  ticks: number;
  outcome: string;
  endHash: string;
  /** World-invariant violations found while the run played, plus report ones at the end. Empty means clean. */
  problems: string[];
  /** Set when the run itself threw; `problems` also carries a one-line summary in this case. */
  threw: boolean;
  ms: number;
}

/**
 * Play one seeded, undirected run of `policyName` to completion (or
 * `maxTicks`), scanning the world every `scanEvery` ticks and the final
 * report once. No Command is ever injected beyond what the policy itself
 * produces — that is the whole point of this half of the soak.
 */
export function soakOne(
  seed: number,
  policyName: string,
  maxTicks = DEFAULT_MAX_TICKS,
  scanEvery = 60,
): SoakResult {
  const started = performance.now();
  const cfg: RunConfig = {
    seed,
    classKey: 'engineer',
    tier: 1,
    modifiers: [],
    allocated: [],
    relics: [],
    policy: policyName,
    cycles: 3,
  };
  const run = new Run(cfg);
  const policy = makePolicy(policyName);
  const w = run.world;
  const problems: string[] = [];
  let threw = false;

  try {
    while (!run.done && w.tick < maxTicks) {
      run.step(policy.act(w));
      if (w.tick % scanEvery === 0) problems.push(...scanWorld(w));
      if (problems.length > 0) break;
    }
  } catch (err) {
    threw = true;
    problems.push(`tick ${w.tick} threw ${(err as Error)?.stack ?? String(err)}`);
  }

  let endHash = '';
  let outcome = w.outcome;
  if (!threw && problems.length === 0) {
    try {
      const report = run.report();
      endHash = report.endHash;
      outcome = report.outcome;
      problems.push(...scanReport(report));
    } catch (err) {
      threw = true;
      problems.push(`report() threw ${(err as Error)?.stack ?? String(err)}`);
    }
  }

  return {
    seed,
    policy: policyName,
    ticks: w.tick,
    outcome,
    endHash,
    problems: problems.slice(0, 8),
    threw,
    ms: Math.round(performance.now() - started),
  };
}

/**
 * `n` seeded runs, one policy per run, cycled round-robin through `policies`
 * so the soak is a genuine mix rather than n runs of a single bot's habits.
 * Seeds start at `seedStart` and increment by 1 per run regardless of which
 * policy lands on them, so a given seed count is reproducible independent of
 * how many policies are in the rotation.
 */
export function soak(n: number, policies: string[], seedStart = 1): SoakResult[] {
  if (policies.length === 0) throw new Error('soak: policies must be non-empty');
  const out: SoakResult[] = [];
  for (let i = 0; i < n; i++) {
    out.push(soakOne(seedStart + i, policies[i % policies.length]));
  }
  return out;
}

/** Every policy the game ships, in registration order. Requires `import '../src/bots'` to have run. */
export function shippedPolicies(): string[] {
  return policyNames();
}

/** One-line description of a soak failure, for a test message or the CLI. */
export function describeSoakFailure(r: SoakResult): string {
  if (r.problems.length === 0) return `seed ${r.seed} policy ${r.policy}: clean`;
  return `seed ${r.seed} policy ${r.policy} (${r.threw ? 'threw' : 'invariant'}):\n  ${r.problems.join('\n  ')}`;
}

/* --------------------------------------------------------------------- CLI */

function usage(message: string): never {
  console.error(`soak: ${message}`);
  console.error('usage: npx tsx tools/soak.ts [--seeds <positive int>] [--seed-start <int>] [--policies a,b] [--json]');
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

function main(): void {
  const argv = process.argv.slice(2);
  const seeds = intArg(argv, '--seeds', 50, true);
  const seedStart = intArg(argv, '--seed-start', 1, false);
  const polArgIdx = argv.indexOf('--policies');
  const policies = polArgIdx >= 0 ? (argv[polArgIdx + 1] ?? '').split(',').filter(Boolean) : shippedPolicies();
  const json = argv.includes('--json');
  if (policies.length === 0) usage('--policies needs at least one policy name');

  const results = soak(seeds, policies, seedStart);
  const failures = results.filter((r) => r.problems.length > 0);

  if (json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const r of results) {
      if (r.problems.length > 0) {
        console.log(`FAIL ${describeSoakFailure(r)}`);
      } else {
        console.log(
          `ok   seed ${String(r.seed).padEnd(4)} ${r.policy.padEnd(10)} ${r.ticks} ticks in ${r.ms} ms  ` +
            `${r.outcome} hash ${r.endHash.slice(0, 12)}`,
        );
      }
    }
    console.log(`\n${results.length - failures.length}/${results.length} clean`);
  }
  process.exit(failures.length === 0 ? 0 : 1);
}

const entry = (process.argv[1] ?? '').replace(/\\/g, '/');
if (entry.endsWith('tools/soak.ts')) main();
