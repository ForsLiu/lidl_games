/**
 * fb065g — the terrain-vs-flat A/B harness. **A script, not a suite.**
 *
 * Run it: `npx tsx tests/terrain-balance-ab.ts [seeds] [policies]`
 *   e.g.  `npx tsx tests/terrain-balance-ab.ts 24 hybrid,maxbuild`
 *
 * It is deliberately not a `.test.ts`. 96 full runs take ~25 minutes, which is
 * two orders of magnitude past what belongs in the fast tier, and moving a file
 * to `vitest.fast.config.ts`'s exclude list is outside this lane's Scope. So
 * the harness is committed and the *reading* is recorded — in this file's
 * header, in BACKLOG-TERRAIN.md and in PROGRESS.md — rather than pinned by CI.
 * Pinning it is a main-lane follow-up and is logged as one.
 *
 * **Why the arms are what they are.** Arm A is an ordinary run: since fb077,
 * `World` calls `applyRunTerrain` for every non-practice run. Arm B sets
 * `practice: true`, which is the flat-arena control, and its validity is argued
 * from the code rather than assumed. `cfg.practice` gates exactly two things:
 * `applyRunTerrain` (`world.ts`, the terrain we are controlling for) and
 * `applyDevCommand` (`run.ts`, which returns immediately without it). Bot
 * policies issue no `dev` commands at all — `src/bots/policies.ts` contains
 * zero occurrences — and never read the flag, so for a bot run the only
 * difference between the arms is the terrain. `tests/terrain-balance-ab.test.ts`
 * pins that mechanism.
 *
 * ## The reading, 2026-09-05, 24 seeds (1..24), T1, engineer, default core
 *
 * | policy   | arm     |  W |  T |  L | win rate | mean min |
 * |----------|---------|----|----|----|----------|----------|
 * | hybrid   | flat    | 18 |  4 |  2 | 75.0%    | 37.9     |
 * | hybrid   | terrain |  7 |  8 |  9 | 29.2%    | 35.6     |
 * | maxbuild | flat    |  6 |  1 | 17 | 25.0%    | 32.8     |
 * | maxbuild | terrain |  2 |  4 | 18 |  8.3%    | 31.8     |
 *
 * Terrain costs **45.8 points of win rate on `hybrid` (2.57x)** and **16.7 on
 * `maxbuild` (3.00x)**, on the same seeds, the same bot and the same `/data`.
 * A 12-seed pilot on `hybrid` alone read 66.7% -> 16.7%, so the two samples
 * agree on the direction and roughly on the size.
 *
 * Per-seed, `W`in / `T`imeout / `L`oss, seeds 1..24 in order:
 *
 *   hybrid   flat     T W W W L W W T W T W W W W W W W W W L T W W W
 *   hybrid   terrain  L T L T W L T W T T L L L T W L T W L L W W W T
 *   maxbuild flat     L L W W L L W L L W L L L L T L L L W L L W L L
 *   maxbuild terrain  L L L T L W L L L L W L L L T L L L T L T L L L
 *
 * ## What this does and does not say
 *
 * It does **not** say terrain should be softened. Its bands are the owner's own
 * and every one of them is measured; wave difficulty is a balance order and
 * belongs to BACKLOG.md. What it says is narrower and, for the four red gates,
 * more useful: **every G1/G8/G14/G23 reading taken since fb077 merged has
 * terrain in it as an uncontrolled variable**, including the four separate
 * `/data`-only tuning sessions STATUS.md's G8 entry records as having "found
 * real elasticity but only ever traded cells against each other". A control run
 * is one command, and this is it.
 *
 * Worth noting on the way past: on the *flat* arena `hybrid` reads 75.0%, above
 * G8's 35-70% band, and `maxbuild` reads 25.0%, below it. Terrain is a large
 * uncontrolled term, not the only one.
 */

import { loadContent } from '../src/sim/content';
import { buildRunConfig, runOne } from '../tools/sweep';

const MAX_TICKS = 60 * 60 * 45;

export interface ArmResult {
  readonly policy: string;
  readonly arm: 'terrain' | 'flat';
  readonly wins: number;
  readonly timeouts: number;
  readonly losses: number;
  readonly meanMinutes: number;
  /** `W`/`T`/`L` per seed, in seed order. */
  readonly perSeed: string;
}

export function runArm(policy: string, flat: boolean, seeds: number): ArmResult {
  const content = loadContent();
  const opts = {
    seeds,
    seedStart: 1,
    policies: [],
    classKey: 'engineer',
    tier: 1,
    modifiers: [],
    allocated: null,
    json: false,
    maxTicks: MAX_TICKS,
  };
  let wins = 0;
  let timeouts = 0;
  let minutes = 0;
  const marks: string[] = [];
  for (let i = 0; i < seeds; i++) {
    const cfg = { ...buildRunConfig(opts as never, content, 1 + i), practice: flat };
    const report = runOne(cfg, policy, MAX_TICKS);
    minutes += report.totalSeconds / 60;
    if (report.outcome === 'victory') {
      wins++;
      marks.push('W');
    } else if (report.outcome === 'running') {
      timeouts++;
      marks.push('T');
    } else {
      marks.push('L');
    }
  }
  return {
    policy,
    arm: flat ? 'flat' : 'terrain',
    wins,
    timeouts,
    losses: seeds - wins - timeouts,
    meanMinutes: Number((minutes / seeds).toFixed(1)),
    perSeed: marks.join(' '),
  };
}

function main(): void {
  const seeds = Number(process.argv[2] ?? 24);
  const policies = (process.argv[3] ?? 'hybrid,maxbuild').split(',');
  for (const policy of policies) {
    for (const flat of [false, true]) {
      const r = runArm(policy, flat, seeds);
      console.log(
        `${r.policy.padEnd(9)} ${r.arm.padEnd(8)} W${String(r.wins).padStart(3)} ` +
          `T${String(r.timeouts).padStart(3)} L${String(r.losses).padStart(3)}  ` +
          `win ${((100 * r.wins) / seeds).toFixed(1)}%  mean ${r.meanMinutes} min`,
      );
      console.log(`   ${r.perSeed}`);
    }
  }
}

// Guarded the way `tools/sweep.ts` guards its own `main`: this module is
// importable by a test that only wants `runArm`, and an unguarded call would
// start a 25-minute sweep as a side effect of that import.
const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('tests/terrain-balance-ab.ts');
if (invokedDirectly) main();
