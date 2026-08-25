/**
 * In-process balance sweep: runs many (policy x seed) combinations in a single
 * node process and prints a compact table. Used for the M7 balance pass and for
 * checking the A10 performance budget.
 *
 *   npx tsx tools/sweep.ts --seeds 12 --policies hybrid,no-move,kite
 *   npx tsx tools/sweep.ts --seeds 8 --tier 3 --json
 */

import { Run } from '../src/sim/run';
import type { RunConfig, RunReport } from '../src/sim/types';
import { makePolicy } from '../src/bots';
import '../src/bots';

interface Options {
  seeds: number;
  seedStart: number;
  policies: string[];
  classKey: string;
  tier: number;
  modifiers: string[];
  allocated: number[];
  json: boolean;
  maxTicks: number;
}

function parse(argv: string[]): Options {
  const o: Options = {
    seeds: 8,
    seedStart: 1,
    policies: ['hybrid', 'no-move', 'kite', 'turtle'],
    classKey: 'engineer',
    tier: 1,
    modifiers: [],
    allocated: [],
    json: false,
    maxTicks: 60 * 60 * 45,
  };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i + 1];
    switch (argv[i]) {
      case '--seeds': o.seeds = Number(v); i++; break;
      case '--seed-start': o.seedStart = Number(v); i++; break;
      case '--policies': o.policies = v.split(','); i++; break;
      case '--class': o.classKey = v; i++; break;
      case '--tier': o.tier = Number(v); i++; break;
      case '--mods': o.modifiers = v ? v.split(',').filter(Boolean) : []; i++; break;
      case '--tree': o.allocated = v ? v.split(',').map(Number) : []; i++; break;
      case '--json': o.json = true; break;
      default: break;
    }
  }
  return o;
}

export function runOne(cfg: RunConfig, policyName: string, maxTicks: number): RunReport {
  const run = new Run({ ...cfg, policy: policyName });
  const policy = makePolicy(policyName);
  while (!run.done && run.world.tick < maxTicks) {
    run.step(policy.act(run.world));
  }
  return run.report();
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function main(): void {
  const o = parse(process.argv.slice(2));
  const rows: Record<string, unknown>[] = [];
  for (const policy of o.policies) {
    const reports: RunReport[] = [];
    const started = Date.now();
    for (let i = 0; i < o.seeds; i++) {
      const cfg: RunConfig = {
        seed: o.seedStart + i,
        classKey: o.classKey,
        tier: o.tier,
        modifiers: o.modifiers,
        allocated: o.allocated,
        relics: [],
      };
      reports.push(runOne(cfg, policy, o.maxTicks));
    }
    const elapsed = Date.now() - started;
    const wins = reports.filter((r) => r.outcome === 'victory').length;
    rows.push({
      policy,
      win: wins / reports.length,
      medSurv: median(reports.map((r) => r.survivalSeconds)),
      medMin: Math.round(median(reports.map((r) => r.totalSeconds)) / 6) / 10,
      medWaves: median(reports.map((r) => r.wavesCleared)),
      medLevel: median(reports.map((r) => r.level)),
      medKills: median(reports.map((r) => r.kills)),
      msPerRun: Math.round(elapsed / reports.length),
    });
  }
  if (o.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  const head = ['policy', 'win', 'medSurv', 'medMin', 'medWaves', 'medLevel', 'medKills', 'msPerRun'];
  console.log(head.map((h) => h.padEnd(9)).join(''));
  for (const r of rows) {
    console.log(
      head
        .map((h) => {
          const v = r[h];
          return String(typeof v === 'number' ? Math.round(v * 100) / 100 : v).padEnd(9);
        })
        .join(''),
    );
  }
}

main();
