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
  /**
   * Which G19 liveness strategy this build exercises. Defaults to 'open' —
   * every entry in `BUILDS` below is an open-maze build, matching the
   * `BuilderPolicy` options `runBuild` has always passed (unset `allowSeal`/
   * `rushWaves`), so adding this field changes nothing G13 measures.
   */
  strategy?: 'open' | 'sealed' | 'rush';
  /** Seal the Core's perimeter, closing tile included (SPEC-FINAL §10). */
  allowSeal?: boolean;
  /** Ring radius for the perimeter build-out; only meaningful with `allowSeal`. */
  perimeterRadius?: number;
  /** Call the next TD wave early once the plan is exhausted (multi-summon, §1.1). */
  rushWaves?: boolean;
  /** Real multi-summon: merge the next wave into a fight already in progress. */
  stackWaves?: boolean;
  /** Structures required before `stackWaves` starts calling. */
  stackAfter?: number;
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

/**
 * G19's other two strategies (SPEC-FINAL §14), layered onto `BUILDS`' own
 * pool for `tests/p10f-g19-liveness.test.ts`: `topTen` is otherwise blind to
 * them, since every `BUILDS` entry defaults to `strategy: 'open'`. Mirrors
 * the registered `sealed`/`rush` bot policies' (`src/bots/policies.ts`)
 * sealing/stacking mechanism — tower mix, `allowSeal`, `stackWaves` — rather
 * than inventing new ones, so "sealed" and "multi-summon" here mean the same
 * mechanism the G7/G6 gates already measured. The sealed arm's `classKey`
 * (fb094) differs from G7/p1b's `sealed` policy run (which plays `engineer`,
 * `tests/helpers.ts`'s `cfg()` default) — see the `sealed-full` comment below.
 */
export const G19_BUILDS: BuildSpec[] = [
  {
    // classKey/perimeterRadius: an `engineer` sealed ring at the registered
    // `sealed` policy's own radius (5) loses Act II wave 1 on all 5 seeds
    // regardless of maxStructures/upgradeAfter (measured: even the policy's
    // real 70/14 budget, not this harness's shared 55/12, dies identically) —
    // the same "kite" Act II wall every non-pyromancer BUILDS entry already
    // hits (arrow/ballista/tesla/mortar/venom/engineer-mix/economy/support
    // all lose wave 1 too; only frost-mix/ember-mix/ember-heavy, all
    // `pyromancer`, clear). A tighter ring (radius 2) leaves enough of the
    // 55-structure budget on guns to matter: `pyromancer` + radius 2 clears
    // 3/5 seeds (survival 582-616, competitive with the pool's existing
    // entries) where every radius/class combination at 3-5 does not (measured
    // via an ad-hoc classKey x perimeterRadius sweep of this same runBuild
    // harness, not committed as a test: engineer r1-r3 0-1/5, pyromancer r1
    // 0/5, r3 1/5) — a build-diversity lever (class + ring size), not a
    // towers.json damage change.
    name: 'sealed-full',
    classKey: 'pyromancer',
    towerKeys: ['arrow_spire', 'ballista', 'venom_spore', 'mortar', 'tesla_coil', 'frost_obelisk', 'ember_brazier', 'beacon_totem'],
    wallRatio: 0,
    strategy: 'sealed',
    allowSeal: true,
    perimeterRadius: 2,
  },
  {
    name: 'sealed-turtle',
    classKey: 'pyromancer',
    towerKeys: ['arrow_spire', 'frost_obelisk'],
    wallRatio: 0,
    strategy: 'sealed',
    allowSeal: true,
    perimeterRadius: 2,
  },
  {
    name: 'stacked-mix',
    classKey: 'engineer',
    towerKeys: ['arrow_spire', 'ballista', 'tesla_coil', 'mortar', 'venom_spore', 'beacon_totem'],
    wallRatio: 0.25,
    strategy: 'rush',
    stackWaves: true,
    stackAfter: 10,
  },
  {
    name: 'stacked-frost',
    classKey: 'pyromancer',
    towerKeys: ['frost_obelisk', 'arrow_spire', 'ballista', 'mortar', 'venom_spore'],
    wallRatio: 0.25,
    strategy: 'rush',
    stackWaves: true,
    stackAfter: 10,
  },
];

export interface BuildResult {
  name: string;
  seed: number;
  wavesCleared: number;
  outcome: string;
  survival: number;
  /** VS-phase-only damage by source, accumulated across every VS wave in the run. */
  vsDamage: Record<string, number>;
  /** Echoes `build.strategy` (defaulted to 'open') — carried for G19's liveness probe. */
  strategy: 'open' | 'sealed' | 'rush';
  /** Peak `World.stackDepth` reached during the run — >0 means multi-summon was actually used. */
  maxStackDepth: number;
  /** p10g: peak `Enemy.armorShred` seen on any live enemy anywhere in the run — >0 means Burning's armour shred actually fired. */
  maxArmorShred: number;
  /** p10g: peak `Enemy.armorShred` seen while `w.phase === 'act2'` — isolates the wielded cone specifically, not just the Act I tower attack. */
  maxArmorShredAct2: number;
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
    rushWaves: build.rushWaves ?? false,
    allowSeal: build.allowSeal ?? false,
    perimeterRadius: build.perimeterRadius ?? 0,
    stackWaves: build.stackWaves ?? false,
    stackAfter: build.stackAfter ?? 10,
  });
  const vsDamage: Record<string, number> = {};
  let prev: Record<string, number> = {};
  let maxStackDepth = 0;
  let maxArmorShred = 0;
  let maxArmorShredAct2 = 0;
  while (!run.done && run.world.tick < 60 * 60 * 45) {
    run.step(policy.act(run.world));
    const w = run.world;
    if (w.stackDepth > maxStackDepth) maxStackDepth = w.stackDepth;
    if (w.phase === 'act2') {
      for (const key of Object.keys(w.damageByWeapon)) {
        const delta = w.damageByWeapon[key] - (prev[key] ?? 0);
        if (delta > 0) vsDamage[key] = (vsDamage[key] ?? 0) + delta;
      }
    }
    prev = { ...w.damageByWeapon };
    for (const e of w.enemies) {
      if (e.armorShred > maxArmorShred) maxArmorShred = e.armorShred;
      if (w.phase === 'act2' && e.armorShred > maxArmorShredAct2) maxArmorShredAct2 = e.armorShred;
    }
  }
  const r: RunReport = run.report();
  return {
    name: build.name,
    seed,
    wavesCleared: r.wavesCleared,
    outcome: r.outcome,
    survival: r.survivalSeconds,
    vsDamage,
    strategy: build.strategy ?? 'open',
    maxStackDepth,
    maxArmorShred,
    maxArmorShredAct2,
  };
}

/** Runs every build over `seeds`. Defaults to `BUILDS` (G13's pool); G19 passes a wider set. */
export function collect(seeds: number[], builds: BuildSpec[] = BUILDS): BuildResult[] {
  const out: BuildResult[] = [];
  for (const build of builds) {
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
