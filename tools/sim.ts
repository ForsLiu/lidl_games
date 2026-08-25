/**
 * Headless simulation CLI (SPEC 9.4).
 *
 *   npm run sim -- --seed 1 --policy hybrid
 *   npm run sim -- --seed 1 --build build.json --policy turtle --until end
 *   npm run sim -- --seeds 1..50 --policy hybrid --summary
 */

import { readFileSync } from 'node:fs';

import { Run } from '../src/sim/run';
import type { RunConfig, RunReport } from '../src/sim/types';
import { makePolicy, policyNames } from '../src/bots';
import '../src/bots';

interface Args {
  seeds: number[];
  policy: string;
  classKey: string;
  tier: number;
  modifiers: string[];
  allocated: number[];
  build: string | null;
  until: string;
  maxTicks: number;
  summary: boolean;
  quiet: boolean;
  cycles: number | undefined;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    seeds: [1],
    policy: 'hybrid',
    classKey: 'engineer',
    tier: 1,
    modifiers: [],
    allocated: [],
    build: null,
    until: 'end',
    maxTicks: 60 * 60 * 45,
    summary: false,
    quiet: false,
    cycles: undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    switch (k) {
      case '--seed':
        a.seeds = [Number(v)];
        i++;
        break;
      case '--seeds': {
        const m = /^(\d+)\.\.(\d+)$/.exec(v ?? '');
        if (m) {
          const lo = Number(m[1]);
          const hi = Number(m[2]);
          a.seeds = [];
          for (let s = lo; s <= hi; s++) a.seeds.push(s);
        } else {
          a.seeds = (v ?? '').split(',').map(Number);
        }
        i++;
        break;
      }
      case '--policy':
        a.policy = v;
        i++;
        break;
      case '--class':
        a.classKey = v;
        i++;
        break;
      case '--tier':
        a.tier = Number(v);
        i++;
        break;
      case '--mods':
        a.modifiers = v ? v.split(',').filter(Boolean) : [];
        i++;
        break;
      case '--tree':
        a.allocated = v ? v.split(',').filter(Boolean).map(Number) : [];
        i++;
        break;
      case '--build':
        a.build = v;
        i++;
        break;
      case '--until':
        a.until = v;
        i++;
        break;
      case '--max-ticks':
        a.maxTicks = Number(v);
        i++;
        break;
      case '--cycles':
        a.cycles = Number(v);
        i++;
        break;
      case '--summary':
        a.summary = true;
        break;
      case '--quiet':
        a.quiet = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        if (k.startsWith('--')) {
          console.error(`unknown flag ${k}`);
          process.exit(2);
        }
    }
  }
  return a;
}

function printHelp(): void {
  console.log(
    [
      'stonewake headless sim',
      '',
      '  --seed N              single seed (default 1)',
      '  --seeds A..B | a,b,c  seed sweep',
      '  --policy NAME         one of: ' + policyNames().join(', '),
      '  --class KEY           engineer | pyromancer | frost_warden',
      '  --tier N              map tier 1-5',
      '  --mods a,b            map modifier keys',
      '  --tree 1,2,3          allocated Constellation node ids',
      '  --build FILE.json     scripted build order for the bot',
      '  --until end           run to resolution (default)',
      '  --max-ticks N         safety cap (default 162000 = 45 min)',
      '  --cycles N            Day/Dusk/Night/Dawn cycles (default 3; SPEC-V2 §1)',
      '  --summary             aggregate stats instead of per-run JSON',
      '  --quiet               suppress per-run JSON in a sweep',
    ].join('\n'),
  );
}

function runOne(args: Args, seed: number): RunReport {
  const cfg: RunConfig = {
    seed,
    classKey: args.classKey,
    tier: args.tier,
    modifiers: args.modifiers,
    allocated: args.allocated,
    relics: [],
    policy: args.policy,
    cycles: args.cycles,
  };
  const run = new Run(cfg);
  const policy = makePolicy(args.policy);
  if (args.build) {
    const script = JSON.parse(readFileSync(args.build, 'utf8'));
    (policy as unknown as { setBuild?: (b: unknown) => void }).setBuild?.(script);
  }
  const started = performance.now();
  while (!run.done && run.world.tick < args.maxTicks) {
    run.step(policy.act(run.world));
  }
  const elapsed = performance.now() - started;
  const report = run.report();
  // Wall time for the run loop alone - process startup is not part of the
  // SPEC A10 budget, which is about how long a run takes to simulate.
  report.simMs = Math.round(elapsed);
  return report;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const reports: RunReport[] = [];
  for (const seed of args.seeds) {
    const r = runOne(args, seed);
    reports.push(r);
    if (!args.summary && !args.quiet) console.log(JSON.stringify(r));
  }
  if (args.summary || args.seeds.length > 1) {
    console.log(JSON.stringify(summarize(reports), null, 2));
  }
}

export function summarize(reports: RunReport[]): Record<string, unknown> {
  const n = reports.length;
  const wins = reports.filter((r) => r.outcome === 'victory').length;
  const byOutcome: Record<string, number> = {};
  for (const r of reports) byOutcome[r.outcome] = (byOutcome[r.outcome] ?? 0) + 1;
  const nums = (f: (r: RunReport) => number) => reports.map(f).sort((a, b) => a - b);
  const median = (arr: number[]) => (arr.length === 0 ? 0 : arr[Math.floor(arr.length / 2)]);
  const mean = (arr: number[]) => (arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length);
  return {
    runs: n,
    winRate: n === 0 ? 0 : wins / n,
    outcomes: byOutcome,
    medianTotalMinutes: Math.round((median(nums((r) => r.totalSeconds)) / 60) * 100) / 100,
    medianWavesCleared: median(nums((r) => r.wavesCleared)),
    medianSurvivalSeconds: median(nums((r) => r.survivalSeconds)),
    medianLevel: median(nums((r) => r.level)),
    meanKills: Math.round(mean(nums((r) => r.kills))),
    meanGoldEarned: Math.round(mean(nums((r) => r.goldEarned))),
  };
}

main();
