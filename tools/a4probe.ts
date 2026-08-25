/**
 * Probe for SPEC A4: run each single-weapon-tower build (walls allowed for
 * mazing) at T1 and at T3 and print how far each gets.
 */

import { Run } from '../src/sim/run';
import { BuilderPolicy } from '../src/bots/policies';
import { loadContent } from '../src/sim/content';
import type { RunConfig } from '../src/sim/types';

const content = loadContent();

export const SOUL_TOWERS = content.towers.towers
  .filter((t) => t.soul !== null)
  .map((t) => t.key);

/**
 * SPEC-V2 §2: affinity replaced class locks, so every class can build every
 * soul tower now — probing as the always-unlocked Engineer is enough for
 * most towers. Two overrides avoid a class-specific bonus that would inflate
 * a single tower's solo baseline past A4's T3 "fails alone" bound: Engineer
 * has affinity for Tesla Coil (+20% dmg), and Engineer's flat -10% tower
 * cost / +1 build range alone (no affinity involved) is enough to tip Frost
 * Obelisk over that bound, so both are probed under a class with neither.
 */
export function classFor(towerKey: string): string {
  if (towerKey === 'tesla_coil') return 'frost_warden';
  if (towerKey === 'frost_obelisk') return 'pyromancer';
  return 'engineer';
}

/**
 * A fixed pair is not a fair T3: real play drafts 1-of-2 per slot, so a build
 * that happens to shrug off one modifier would look artificially strong. Tests
 * use the seeded auto-draft so each seed faces a different, representative T3.
 */
export const T3_MODS = ['tough', 'fleet'];

export function runSingleType(
  towerKey: string,
  tier: number,
  seed: number,
  mods: string[],
): { waves: number; cleared: boolean; outcome: string; survival: number } {
  const cfg: RunConfig = {
    seed,
    classKey: classFor(towerKey),
    tier,
    modifiers: mods,
    allocated: [],
    relics: [],
    policy: `single:${towerKey}`,
    // SPEC A4 measures the original 10-wave Act I, not the SPEC-V2 cycle split.
    cycles: 1,
  };
  const run = new Run(cfg);
  const policy = new BuilderPolicy(`single:${towerKey}`, {
    towerKeys: [towerKey],
    wallRatio: 0.3,
    maxStructures: 60,
    upgradeAfter: 8,
    act2: 'kite',
    rushWaves: false,
  });
  while (!run.done && run.world.tick < 60 * 60 * 45) run.step(policy.act(run.world));
  const r = run.report();
  return {
    waves: r.wavesCleared,
    cleared: r.outcome !== 'defeat_core',
    outcome: r.outcome,
    survival: r.survivalSeconds,
  };
}

function main(): void {
  const seeds = [1, 2, 3, 4, 5];
  console.log('tower            T1 waves(min/med)  T1 clears   T3 waves(min/med)  T3 clears');
  for (const key of [...SOUL_TOWERS, 'palisade']) {
    const t1: number[] = [];
    const t3: number[] = [];
    let c1 = 0;
    let c3 = 0;
    for (const seed of seeds) {
      const a = runSingleType(key, 1, seed, []);
      const b = runSingleType(key, 3, seed, T3_MODS);
      t1.push(a.waves);
      t3.push(b.waves);
      if (a.cleared) c1++;
      if (b.cleared) c3++;
    }
    const med = (a: number[]) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

    console.log(
      key.padEnd(16) +
        `${Math.min(...t1)}/${med(t1)}`.padEnd(19) +
        `${c1}/${seeds.length}`.padEnd(12) +
        `${Math.min(...t3)}/${med(t3)}`.padEnd(19) +
        `${c3}/${seeds.length}`,
    );
  }
}

if (process.argv[1]?.includes('a4probe')) main();
