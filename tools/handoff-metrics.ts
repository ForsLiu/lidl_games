/**
 * Collects the sweep metrics quoted in HANDOFF.md in one pass, so the document
 * carries measured numbers rather than remembered ones.
 *
 *   npx tsx tools/handoff-metrics.ts > metrics.json
 */

import { Run } from '../src/sim/run';
import { loadContent } from '../src/sim/content';
import { autoDraft } from '../src/sim/tiers';
import type { RunConfig, RunReport } from '../src/sim/types';
import { makePolicy } from '../src/bots';
import '../src/bots';
import { allTreeNodeIds } from '../src/meta/meta';

const content = loadContent();
const MAX_TICKS = 60 * 60 * 45;
// fb039 (QUESTIONS Q138 OVERRIDE): measure the same Constellation allocation
// every real Hub-started run uses (`src/meta/meta.ts`'s `TREE_AUTO_MAX`)
// rather than an empty tree no live run is ever actually played with.
const FULL_TREE = allTreeNodeIds(content);

function runOne(policy: string, seed: number, tier: number, classKey = 'engineer'): RunReport {
  const modifiers = tier > 1 ? autoDraft(content, seed, tier) : [];
  const cfg: RunConfig = {
    seed,
    classKey,
    tier,
    modifiers,
    allocated: FULL_TREE,
    policy,
  };
  const run = new Run(cfg);
  const bot = makePolicy(policy);
  while (!run.done && run.world.tick < MAX_TICKS) run.step(bot.act(run.world));
  return run.report();
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function round(v: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

interface Cell {
  policy: string;
  tier: number;
  runs: number;
  winRate: number;
  medianTotalMinutes: number;
  medianSurvivalSeconds: number;
  medianWavesCleared: number;
  medianLevel: number;
  clearedActI: number;
}

function cell(policy: string, tier: number, seeds: number[]): { cell: Cell; reports: RunReport[] } {
  const reports = seeds.map((seed) => runOne(policy, seed, tier));
  const wins = reports.filter((r) => r.outcome === 'victory').length;
  return {
    cell: {
      policy,
      tier,
      runs: reports.length,
      winRate: round(wins / reports.length),
      medianTotalMinutes: round(median(reports.map((r) => r.totalSeconds)) / 60),
      medianSurvivalSeconds: round(median(reports.map((r) => r.survivalSeconds)), 1),
      medianWavesCleared: median(reports.map((r) => r.wavesCleared)),
      medianLevel: median(reports.map((r) => r.level)),
      clearedActI: reports.filter((r) => r.outcome !== 'defeat_core').length,
    },
    reports,
  };
}

function main(): void {
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
  const table: Cell[] = [];
  const pool: RunReport[] = [];

  // The two arms that reach the late game, across the tier ladder.
  for (const policy of ['maxbuild', 'hybrid']) {
    for (const tier of [1, 3, 5]) {
      const r = cell(policy, tier, seeds);
      table.push(r.cell);
      if (tier === 1) pool.push(...r.reports);
    }
  }
  // The control policies, at T1 only.
  for (const policy of ['kite', 'turtle', 'rush', 'no-move', 'walloff', 'greedy', 'greedless']) {
    const r = cell(policy, 1, seeds);
    table.push(r.cell);
    pool.push(...r.reports);
  }

  // Weapon damage share at minute 8 of Act II, aggregated over every run that
  // got there. Terrain residuals are reported separately from weapons.
  const damage = new Map<string, number>();
  let reachedMinute8 = 0;
  for (const r of pool) {
    if (!r.damageThroughMinute8) continue;
    reachedMinute8++;
    for (const [k, v] of Object.entries(r.damageThroughMinute8)) {
      damage.set(k, (damage.get(k) ?? 0) + v);
    }
  }
  const grand = [...damage.values()].reduce((a, b) => a + b, 0);
  const damageShare = [...damage.entries()]
    .map(([key, v]) => ({
      key,
      share: round(v / grand, 4),
      // p2e: a VS "weapon" source is a built tower type wielded automatically
      // (vswield.ts), keyed by the tower's own key — there is no separate
      // weapon roster to check against any more.
      isWeapon: content.towerByKey.has(key),
    }))
    .sort((a, b) => b.share - a.share);

  // Boon pick counts: the end-of-run rank is how many times it was taken.
  const boonPicks = new Map<string, number>();
  const boonRuns = new Map<string, number>();
  for (const b of content.boons.statBoons) {
    boonPicks.set(b.key, 0);
    boonRuns.set(b.key, 0);
  }
  let runsWithBoons = 0;
  for (const r of pool) {
    const entries = Object.entries(r.boons);
    if (entries.length === 0) continue;
    runsWithBoons++;
    for (const [key, rank] of entries) {
      boonPicks.set(key, (boonPicks.get(key) ?? 0) + rank);
      boonRuns.set(key, (boonRuns.get(key) ?? 0) + 1);
    }
  }
  const boons = [...boonPicks.entries()]
    .map(([key, picks]) => ({
      key,
      name: content.boonByKey.get(key)?.name ?? key,
      totalRanksTaken: picks,
      runsAppearedIn: boonRuns.get(key) ?? 0,
      appearanceRate: runsWithBoons > 0 ? round((boonRuns.get(key) ?? 0) / runsWithBoons) : 0,
    }))
    .sort((a, b) => b.totalRanksTaken - a.totalRanksTaken);

  const victories = pool.filter((r) => r.outcome === 'victory');

  console.log(
    JSON.stringify(
      {
        generatedFrom: { seeds, poolRuns: pool.length, reachedMinute8, runsWithBoons },
        table,
        medianVictoriousRunMinutes: round(median(victories.map((r) => r.totalSeconds)) / 60),
        victoriousRuns: victories.length,
        damageShare,
        boons,
      },
      null,
      2,
    ),
  );
}

main();
