/**
 * Probe for SPEC A5: across the top-10 sim builds, no weapon may exceed 35% of
 * damage dealt at minute 8 of Act II.
 *
 * "Top-10 builds" is read as the ten best-performing builds from a spread of
 * distinct tower mixes, ranked by Act II survival.
 */

import { Run } from '../src/sim/run';
import { BuilderPolicy } from '../src/bots/policies';
import type { RunConfig, RunReport } from '../src/sim/types';

export interface BuildSpec {
  name: string;
  classKey: string;
  towerKeys: string[];
  wallRatio: number;
}

/** A spread of realistic mixes: one per soul weapon, plus broad hybrids. */
export const BUILDS: BuildSpec[] = [
  { name: 'arrow-heavy', classKey: 'engineer', towerKeys: ['arrow_spire', 'palisade', 'beacon_totem'], wallRatio: 0.25 },
  { name: 'ballista-heavy', classKey: 'engineer', towerKeys: ['ballista', 'arrow_spire'], wallRatio: 0.25 },
  { name: 'tesla-heavy', classKey: 'engineer', towerKeys: ['tesla_coil', 'arrow_spire'], wallRatio: 0.25 },
  { name: 'mortar-heavy', classKey: 'engineer', towerKeys: ['mortar', 'arrow_spire'], wallRatio: 0.25 },
  { name: 'venom-heavy', classKey: 'engineer', towerKeys: ['venom_spore', 'arrow_spire'], wallRatio: 0.25 },
  { name: 'frost-heavy', classKey: 'pyromancer', towerKeys: ['frost_obelisk', 'arrow_spire'], wallRatio: 0.25 },
  { name: 'ember-heavy', classKey: 'pyromancer', towerKeys: ['ember_brazier', 'arrow_spire'], wallRatio: 0.25 },
  { name: 'engineer-mix', classKey: 'engineer', towerKeys: ['arrow_spire', 'ballista', 'tesla_coil', 'mortar', 'venom_spore', 'beacon_totem'], wallRatio: 0.25 },
  { name: 'frost-mix', classKey: 'pyromancer', towerKeys: ['frost_obelisk', 'arrow_spire', 'ballista', 'mortar', 'venom_spore'], wallRatio: 0.25 },
  { name: 'ember-mix', classKey: 'pyromancer', towerKeys: ['ember_brazier', 'arrow_spire', 'ballista', 'venom_spore', 'mortar'], wallRatio: 0.25 },
  { name: 'economy', classKey: 'engineer', towerKeys: ['harvest_sprout', 'arrow_spire', 'ballista', 'mortar'], wallRatio: 0.2 },
  { name: 'support', classKey: 'engineer', towerKeys: ['beacon_totem', 'arrow_spire', 'tesla_coil', 'venom_spore'], wallRatio: 0.3 },
];

export function runBuild(build: BuildSpec, seed: number): RunReport {
  const cfg: RunConfig = {
    seed,
    classKey: build.classKey,
    tier: 1,
    modifiers: [],
    allocated: [],
    relics: [],
    policy: build.name,
    // SPEC A5 measures Act II minute 8 of the original single-cycle run.
    cycles: 1,
  };
  const run = new Run(cfg);
  const policy = new BuilderPolicy(build.name, {
    towerKeys: build.towerKeys,
    wallRatio: build.wallRatio,
    maxStructures: 46,
    upgradeAfter: 14,
    upgradeFirst: true,
    act2: 'kite',
    rushWaves: false,
  });
  while (!run.done && run.world.tick < 60 * 60 * 45) run.step(policy.act(run.world));
  return run.report();
}

export interface BuildResult {
  name: string;
  seed: number;
  survival: number;
  topWeapon: string;
  share: number;
  damage: Record<string, number>;
}

/** Runs every build over `seeds` and keeps those that reached minute 8. */
export function collect(seeds: number[]): BuildResult[] {
  const out: BuildResult[] = [];
  for (const build of BUILDS) {
    for (const seed of seeds) {
      const r = runBuild(build, seed);
      if (!r.damageThroughMinute8) continue;
      out.push({
        name: build.name,
        seed,
        survival: r.survivalSeconds,
        topWeapon: r.topWeaponMinute8,
        share: r.topWeaponShareMinute8,
        damage: r.damageThroughMinute8,
      });
    }
  }
  return out;
}

/** The ten best runs by Act II survival, one entry per build at most. */
export function topTen(results: BuildResult[]): BuildResult[] {
  const bestPerBuild = new Map<string, BuildResult>();
  for (const r of results) {
    const prev = bestPerBuild.get(r.name);
    if (!prev || r.survival > prev.survival) bestPerBuild.set(r.name, r);
  }
  return [...bestPerBuild.values()].sort((a, b) => b.survival - a.survival).slice(0, 10);
}

/**
 * A5 is a statement about the metagame, not about any one build: a mono-tower
 * build necessarily leans on its one weapon. So the share that matters is each
 * weapon's slice of the damage the top-10 builds deal between them.
 */
export function aggregateShares(top: BuildResult[]): { key: string; share: number }[] {
  const totals = new Map<string, number>();
  let grand = 0;
  for (const r of top) {
    for (const [k, v] of Object.entries(r.damage)) {
      totals.set(k, (totals.get(k) ?? 0) + v);
      grand += v;
    }
  }
  if (grand <= 0) return [];
  return [...totals.entries()]
    .map(([key, v]) => ({ key, share: v / grand }))
    .sort((a, b) => b.share - a.share);
}

function main(): void {
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
  const results = collect(seeds);
  const top = topTen(results);
  console.log('build            seed  survival  topWeapon           share');
  for (const r of top) {
    console.log(
      r.name.padEnd(17) +
        String(r.seed).padEnd(6) +
        r.survival.toFixed(0).padEnd(10) +
        r.topWeapon.padEnd(20) +
        (r.share * 100).toFixed(1) + '%',
    );
  }
  console.log(`\nreached minute 8: ${results.length}/${BUILDS.length * seeds.length}`);
  console.log('\naggregate share across the top-10:');
  for (const s of aggregateShares(top)) {
    console.log('  ' + s.key.padEnd(24) + (s.share * 100).toFixed(1) + '%');
  }
}

if (process.argv[1]?.includes('a5probe')) {
  try {
    main();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`a5probe: ${message.replace(/\s+/g, ' ').trim()}`);
    process.exitCode = 1;
  }
}
