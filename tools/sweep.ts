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
import { loadContent, type Content } from '../src/sim/content';
import { autoDraft } from '../src/sim/tiers';
import { allTreeNodeIds } from '../src/meta/meta';

export interface Options {
  seeds: number;
  seedStart: number;
  policies: string[];
  classKey: string;
  tier: number;
  modifiers: string[];
  // fb039 (QUESTIONS Q138 OVERRIDE): `null` means "not passed" — resolved to
  // the full Constellation tree by `resolveAllocated`, matching every real
  // Hub-started run (`src/meta/meta.ts`'s `TREE_AUTO_MAX`). An explicit
  // `--tree` (including `--tree none` for deliberately empty) always wins.
  allocated: number[] | null;
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
    allocated: null,
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
      case '--tree': o.allocated = v === 'none' ? [] : v ? v.split(',').map(Number) : []; i++; break;
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

/**
 * **p12b update:** the paragraph below is no longer the whole story.
 * `RunConfig.tier` now also drives the tier *ladder* — enemy HP, director
 * budget and enemy `coreDamage`, each `^(tier-1)` (`src/sim/tiers.ts`) — so
 * `--tier 3` is a real difficulty change on its own. The auto-draft below
 * still applies on top, which means a `--tier 3` sweep measures **ladder plus
 * modifiers**, whereas p12b's own recorded numbers are ladder-only
 * (`modifiers: []`). Don't compare the two directly.
 *
 * fb047: `RunConfig.tier` alone fed only reward-multiplier math
 * (`src/sim/tiers.ts`'s `rewardMultiplier`) and reporting — every actual
 * difficulty knob (enemy HP/speed, elite/rift/boss multipliers, extra
 * gates/waves, Core HP) lived in `RunConfig.modifiers`, which the real Hub UI
 * drafts per tier (`modifierDraft`) before a human ever plays. A bare
 * `--tier N` here used to leave `modifiers` at `[]`, so `--tier 3` was
 * mechanically identical to `--tier 1` for every bot — confirming p10p's
 * flagged-not-filed observation that kite/rush/walloff's T3 win rates
 * measured suspiciously close to T1. `tools/handoff-metrics.ts` already
 * drew this line correctly (`tier > 1 ? autoDraft(...) : []`); this mirrors
 * it so an explicit `--mods` list still wins outright (unchanged), while an
 * unset one is auto-drafted per seed+tier, deterministic and replayable.
 */
export function resolveModifiers(content: Content, seed: number, tier: number, explicit: string[]): string[] {
  if (explicit.length > 0) return explicit;
  return tier > 1 ? autoDraft(content, seed, tier) : [];
}

/**
 * fb039 (QUESTIONS Q138 OVERRIDE): balance tooling must measure what players
 * play. Real Hub-started runs feed `allTreeNodeIds(content)` into `allocated`
 * (`src/meta/meta.ts`'s `TREE_AUTO_MAX`); this tool used to default to `[]`
 * regardless of `--tree`, measuring a materially weaker character than a real
 * Hub run — an empty tree versus all 120 nodes' stats.
 */
export function resolveAllocated(content: Content, explicit: number[] | null): number[] {
  return explicit ?? allTreeNodeIds(content);
}

export function buildRunConfig(o: Options, content: Content, seed: number): RunConfig {
  return {
    seed,
    classKey: o.classKey,
    tier: o.tier,
    modifiers: resolveModifiers(content, seed, o.tier, o.modifiers),
    allocated: resolveAllocated(content, o.allocated),
  };
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function main(): void {
  const o = parse(process.argv.slice(2));
  const content = loadContent();
  const rows: Record<string, unknown>[] = [];
  for (const policy of o.policies) {
    const reports: RunReport[] = [];
    const started = Date.now();
    for (let i = 0; i < o.seeds; i++) {
      const cfg = buildRunConfig(o, content, o.seedStart + i);
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

// Guarded like gate-audit.ts/content-census.ts: status.ts imports `runOne`
// from this module for its own balance snapshot, and an unguarded top-level
// `main()` call would re-run a default CLI sweep (parsing status.ts's own
// argv) as a side effect of that import.
const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('tools/sweep.ts');
if (invokedDirectly) main();
