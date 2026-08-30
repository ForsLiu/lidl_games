/**
 * Probe for gate G13's damage-share clause (SPEC-FINAL §14): across the
 * winning-build pool, no tower type's VS attack may exceed 35% of damage.
 *
 * "Winning-build pool" is read as the ten best-performing builds from a
 * spread of distinct tower mixes, ranked by TD waves banked, restricted to
 * builds that actually banked all 18 (SPEC-FINAL §1.1's full TD curve) —
 * the same "cleared" bar `tools/a4probe.ts` and `tests/light-build.test.ts`
 * already use for "the run is a real contender," not a build that died to
 * the Act I economy before ever reaching sustained VS combat.
 *
 * **p10c re-baseline**: the retired `tests/a5-weapon-share.test.ts` measured
 * this at "Act II minute 8" of a single-cycle run (`cycles: 1`), a shape
 * SPEC-FINAL's real §1.1 run (18 TD + 6 VS waves, `cycles: 6`, each VS wave
 * only 75s) made structurally unreachable — 6 waves x 75s = 450s of total VS
 * time, always under the 480s the old snapshot waited for, so
 * `w.damageThroughMinute8` never fires under the real shape. This probe
 * instead accumulates VS-phase damage tick-by-tick across every one of a
 * run's VS waves (not just the last one — `w.damageAtSunder` resets every
 * cycle, so it can't answer a whole-run question on its own), for the
 * whole run, then reads each tower type's share the same way the engine's
 * own `topWeaponShare` (`src/sim/run.ts`) does: numerator restricted to
 * sources that name a real tower, denominator every VS-phase damage source
 * (a bare character basic attack is context, not a weapon to cap).
 */

import { Run } from '../src/sim/run';
import { BuilderPolicy } from '../src/bots/policies';
import { loadContent } from '../src/sim/content';
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

export interface BuildResult {
  name: string;
  seed: number;
  wavesCleared: number;
  outcome: string;
  survival: number;
  /** VS-phase-only damage by source, accumulated across every VS wave in the run. */
  vsDamage: Record<string, number>;
}

export function runBuild(build: BuildSpec, seed: number): BuildResult {
  const cfg: RunConfig = {
    seed,
    classKey: build.classKey,
    tier: 1,
    modifiers: [],
    allocated: [],
    policy: build.name,
    // SPEC-FINAL §1.1's real run shape: 18 TD waves across 6 blocks, each
    // followed by a VS wave, not the old single-cycle 10-wave/minute-8 shape.
    cycles: 6,
  };
  const run = new Run(cfg);
  const policy = new BuilderPolicy(build.name, {
    towerKeys: build.towerKeys,
    wallRatio: build.wallRatio,
    maxStructures: 55,
    upgradeAfter: 12,
    act2: 'kite',
    rushWaves: false,
  });
  const vsDamage: Record<string, number> = {};
  let prev: Record<string, number> = {};
  while (!run.done && run.world.tick < 60 * 60 * 45) {
    run.step(policy.act(run.world));
    const w = run.world;
    if (w.phase === 'act2') {
      for (const key of Object.keys(w.damageByWeapon)) {
        const delta = w.damageByWeapon[key] - (prev[key] ?? 0);
        if (delta > 0) vsDamage[key] = (vsDamage[key] ?? 0) + delta;
      }
    }
    prev = { ...w.damageByWeapon };
  }
  const r: RunReport = run.report();
  return {
    name: build.name,
    seed,
    wavesCleared: r.wavesCleared,
    outcome: r.outcome,
    survival: r.survivalSeconds,
    vsDamage,
  };
}

/** Runs every build over `seeds`. */
export function collect(seeds: number[]): BuildResult[] {
  const out: BuildResult[] = [];
  for (const build of BUILDS) {
    for (const seed of seeds) out.push(runBuild(build, seed));
  }
  return out;
}

/**
 * The ten best runs that banked every TD wave (SPEC-FINAL §1.1's full 18),
 * one entry per build at most, ranked by survival among those that cleared.
 * A build that died to the TD economy before ever fighting a sustained VS
 * wave is not a contender for "the winning-build pool."
 */
export function topTen(results: BuildResult[]): BuildResult[] {
  const cleared = results.filter((r) => r.wavesCleared >= 18);
  const bestPerBuild = new Map<string, BuildResult>();
  for (const r of cleared) {
    const prev = bestPerBuild.get(r.name);
    if (!prev || r.survival > prev.survival) bestPerBuild.set(r.name, r);
  }
  return [...bestPerBuild.values()].sort((a, b) => b.survival - a.survival).slice(0, 10);
}

/**
 * G13 is a statement about the metagame, not about any one build: a
 * mono-tower build necessarily leans on its one weapon. So the share that
 * matters is each tower type's slice of the VS damage the top-10 builds deal
 * between them — every source in the pool's damage counts toward the total
 * (a bare character basic attack is context), but only tower-keyed sources
 * are reported as a "tower type" share, matching `topWeaponShare`'s own
 * convention (`src/sim/run.ts`).
 */
export function aggregateShares(top: BuildResult[], towerKeys: Set<string>): { key: string; share: number }[] {
  const totals = new Map<string, number>();
  let grand = 0;
  for (const r of top) {
    for (const [k, v] of Object.entries(r.vsDamage)) {
      grand += v;
      if (!towerKeys.has(k)) continue;
      totals.set(k, (totals.get(k) ?? 0) + v);
    }
  }
  if (grand <= 0) return [];
  return [...totals.entries()]
    .map(([key, v]) => ({ key, share: v / grand }))
    .sort((a, b) => b.share - a.share);
}

function main(): void {
  const seeds = [1, 2, 3, 4, 5];
  const results = collect(seeds);
  const top = topTen(results);
  console.log('build            seed  waves  survival  outcome');
  for (const r of top) {
    console.log(
      r.name.padEnd(17) + String(r.seed).padEnd(6) + String(r.wavesCleared).padEnd(7) +
        r.survival.toFixed(0).padEnd(10) + r.outcome,
    );
  }
  console.log(`\nbanked all 18 TD waves: ${results.filter((r) => r.wavesCleared >= 18).length}/${results.length}`);
  const towerKeys = new Set<string>(loadContent().towers.towers.map((t) => t.key));
  console.log('\naggregate VS damage share across the top-10:');
  for (const s of aggregateShares(top, towerKeys)) {
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
