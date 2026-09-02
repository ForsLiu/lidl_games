/**
 * Headless simulation CLI (SPEC 9.4).
 *
 *   npm run sim -- --seed 1 --policy hybrid
 *   npm run sim -- --seed 1 --build build.json --policy turtle --until end
 *   npm run sim -- --seeds 1..50 --policy hybrid --summary
 */

import { readFileSync } from 'node:fs';

import type { RunConfig, RunReport } from '../src/sim/types';

// b014: `Run`/`makePolicy`/`policyNames` all transitively value-import
// `src/sim/content.ts`, which statically imports every `/data/*.json` file —
// `tsx`'s esbuild transform parses that at *module-load* time, before any of
// this file's own code (including a `main()` try/catch) ever runs. A static
// `import { Run } from '../src/sim/run'` here would crash on a `/data` JSON
// syntax error with a raw, uncaught `Transform failed with 1 error` stack
// trace no try/catch below could intercept. A top-level-await dynamic
// `import()`, by contrast, rejects into an ordinary catchable promise — the
// same shape `tools/content-census.ts` (q38) already uses for its own
// `src/sim/content` import.
let Run: typeof import('../src/sim/run').Run;
let makePolicy: typeof import('../src/bots').makePolicy;
let policyNames: typeof import('../src/bots').policyNames;
let loadContent: typeof import('../src/sim/content').loadContent;
let allTreeNodeIds: typeof import('../src/meta/meta').allTreeNodeIds;
try {
  ({ Run } = await import('../src/sim/run'));
  ({ makePolicy, policyNames } = await import('../src/bots'));
  ({ loadContent } = await import('../src/sim/content'));
  ({ allTreeNodeIds } = await import('../src/meta/meta'));
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`sim: ${message.replace(/\s+/g, ' ').trim()}`);
  process.exit(1);
}

export interface Args {
  seeds: number[];
  policy: string;
  classKey: string;
  tier: number;
  modifiers: string[];
  // fb039 (QUESTIONS Q138 OVERRIDE): `null` means "not passed" — resolved to
  // the full Constellation tree at run time, the same allocation `TREE_AUTO_MAX`
  // gives every real Hub-started run (`src/meta/meta.ts`). An explicit `--tree`
  // (including `--tree none` for deliberately empty) always wins.
  allocated: number[] | null;
  build: string | null;
  until: string;
  maxTicks: number;
  summary: boolean;
  quiet: boolean;
  cycles: number | undefined;
}

export function parseArgs(argv: string[]): Args {
  const a: Args = {
    seeds: [1],
    policy: 'hybrid',
    classKey: 'engineer',
    tier: 1,
    modifiers: [],
    allocated: null,
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
        a.allocated = v === 'none' ? [] : v ? v.split(',').filter(Boolean).map(Number) : [];
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
      '  --class KEY           engineer | pyromancer | swordsman | ...',
      '  --tier N              map tier 1-5',
      '  --mods a,b            map modifier keys',
      '  --tree 1,2,3          allocated Constellation node ids',
      '  --tree none           explicit empty tree (default: full tree, matching real play)',
      '  --build FILE.json     scripted build order for the bot',
      '  --until end           run to resolution (default)',
      '  --max-ticks N         safety cap (default 162000 = 45 min)',
      '  --cycles N            TD-block/VS-wave pairs (default 6, 18 TD + 6 VS; SPEC-FINAL §1.1)',
      '  --summary             aggregate stats instead of per-run JSON',
      '  --quiet               suppress per-run JSON in a sweep',
    ].join('\n'),
  );
}

/**
 * fb039 (QUESTIONS Q138 OVERRIDE): balance tooling must measure what players
 * play. Real Hub-started runs feed `allTreeNodeIds(content)` into `allocated`
 * (`src/meta/meta.ts`'s `TREE_AUTO_MAX`); this tool used to default to `[]`
 * regardless, measuring a materially weaker character than live play.
 */
export function resolveAllocated(content: ReturnType<typeof loadContent>, explicit: number[] | null): number[] {
  return explicit ?? allTreeNodeIds(content);
}

function runOne(args: Args, seed: number): RunReport {
  const cfg: RunConfig = {
    seed,
    classKey: args.classKey,
    tier: args.tier,
    modifiers: args.modifiers,
    allocated: resolveAllocated(loadContent(), args.allocated),
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
  // qa-playtester (b014 verification): `Run`'s own constructor calls
  // `loadContent()`, whose zod parse throws on a *schema* violation (a
  // retyped field, still valid JSON) — a different failure than the
  // syntax-error class the top-level dynamic import above guards against,
  // and one this file had no try/catch for at all until now, unlike
  // `tools/phase-coverage.ts`/`tools/soak.ts`, which already caught it.
  try {
    const reports: RunReport[] = [];
    for (const seed of args.seeds) {
      const r = runOne(args, seed);
      reports.push(r);
      if (!args.summary && !args.quiet) console.log(JSON.stringify(r));
    }
    if (args.summary || args.seeds.length > 1) {
      console.log(JSON.stringify(summarize(reports), null, 2));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`sim: ${message.replace(/\s+/g, ' ').trim()}`);
    process.exitCode = 1;
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

// fb039: guarded like tools/sweep.ts's own `main()`, so a test can import
// `resolveAllocated` without a stray default CLI run firing as a side effect.
const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('tools/sim.ts');
if (invokedDirectly) main();
