/**
 * THROWAWAY scratch script for BACKLOG p12a (balance-analyst run). Not committed.
 * Measures own-kit damage share (restricted to seeds with wavesCleared >= 12)
 * and win rate, per class, using the same scripted-kit-bot harness as
 * tests/p6e-class-diversity.test.ts (runScripted/scriptClassKit/TREE_AUTO_MAX).
 *
 * Usage: npx tsx tools/scratch-p12a.ts [seedCount]
 */
import '../src/bots';
import { loadContent } from '../src/sim/content';
import { allTreeNodeIds } from '../src/meta/meta';
import type { RunConfig, RunReport } from '../src/sim/types';
import { cfg, runScripted } from '../tests/helpers';

const content = loadContent();
const FULL_TREE = allTreeNodeIds(content);
const CLASS_KEYS = content.classes.classes.map((c) => c.key);

const seedCount = Number(process.argv[2] ?? 6);
const SEEDS = Array.from({ length: seedCount }, (_, i) => i + 1);

function sumValues(rec: Record<string, number>): number {
  let total = 0;
  for (const v of Object.values(rec)) total += v;
  return total;
}

function runOne(classKey: string, seed: number): RunReport {
  const config: RunConfig = cfg({
    seed,
    classKey,
    tier: 1,
    modifiers: [],
    allocated: FULL_TREE,
    cycles: 6,
    policy: 'hybrid',
  });
  return runScripted(config, 'hybrid', 60 * 60 * 120).report;
}

function main(): void {
  const rows: string[] = [];
  for (const key of CLASS_KEYS) {
    let wins = 0;
    let qualifying = 0; // wavesCleared >= 12
    let ownTotal = 0;
    let allTotal = 0;
    const outcomes: string[] = [];
    for (const seed of SEEDS) {
      const report = runOne(key, seed);
      if (report.outcome === 'victory') wins++;
      outcomes.push(`${seed}:${report.outcome === 'running' ? 'timeout' : report.outcome}/w${report.wavesCleared}`);
      if (report.outcome === 'running') continue;
      if (report.wavesCleared < 12) continue;
      qualifying++;
      for (const [k, v] of Object.entries(report.damageByWeapon)) {
        allTotal += v;
        if (!content.towerByKey.has(k)) ownTotal += v;
      }
    }
    const ownShare = allTotal > 0 ? ownTotal / allTotal : -1;
    const line = `${key.padEnd(14)} winRate=${(wins / SEEDS.length).toFixed(2)} qualifying=${qualifying}/${SEEDS.length} ownShare=${ownShare < 0 ? 'n/a' : (ownShare * 100).toFixed(1) + '%'}  [${outcomes.join(' ')}]`;
    console.log(line);
    rows.push(line);
  }
}

main();
