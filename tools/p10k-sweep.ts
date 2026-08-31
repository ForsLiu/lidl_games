import { Run } from '../src/sim/run';
import { makePolicy } from '../src/bots';
import '../src/bots';
import type { RunConfig, RunReport } from '../src/sim/types';

const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);

function runOne(cfg: RunConfig, policyName: string, maxTicks: number): RunReport {
  const run = new Run({ ...cfg, policy: policyName });
  const policy = makePolicy(policyName);
  while (!run.done && run.world.tick < maxTicks) {
    run.step(policy.act(run.world));
  }
  return run.report();
}

const reports = SEEDS.map((seed) =>
  runOne({ seed, classKey: 'engineer', tier: 1, modifiers: [], allocated: [] }, 'hybrid', 60 * 60 * 45),
);
const wins = reports.filter((r) => r.outcome === 'victory');
const minutes = wins.map((r) => r.totalSeconds / 60);
const mean = minutes.reduce((a, b) => a + b, 0) / (minutes.length || 1);
console.log(
  `mean ${mean.toFixed(2)} min over ${wins.length}/${reports.length} wins (${(wins.length / reports.length * 100).toFixed(0)}%)`,
);
