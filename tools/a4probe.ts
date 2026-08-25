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

export function classFor(towerKey: string): string {
  const def = content.towerByKey.get(towerKey);
  return def?.classLock ?? 'engineer';
}

/** SPEC 8.3: tier N applies N-1 modifiers. */
export const T3_MODS = ['tough', 'fleet'];

export function runSingleType(
  towerKey: string,
  tier: number,
  seed: number,
  mods: string[],
): { waves: number; outcome: string; survival: number } {
  const cfg: RunConfig = {
    seed,
    classKey: classFor(towerKey),
    tier,
    modifiers: mods,
    allocated: [],
    relics: [],
    policy: `single:${towerKey}`,
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
  return { waves: r.wavesCleared, outcome: r.outcome, survival: r.survivalSeconds };
}

function main(): void {
  const seeds = [1, 2, 3, 4, 5];
  console.log('tower            T1 waves(min/med)  T1 clears   T3 waves(min/med)  T3 clears');
  for (const key of [...SOUL_TOWERS, 'palisade']) {
    const t1: number[] = [];
    const t3: number[] = [];
    for (const seed of seeds) {
      t1.push(runSingleType(key, 1, seed, []).waves);
      t3.push(runSingleType(key, 3, seed, T3_MODS).waves);
    }
    const med = (a: number[]) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const clears = (a: number[]) => a.filter((w) => w >= 10).length;
    console.log(
      key.padEnd(16) +
        `${Math.min(...t1)}/${med(t1)}`.padEnd(19) +
        `${clears(t1)}/${seeds.length}`.padEnd(12) +
        `${Math.min(...t3)}/${med(t3)}`.padEnd(19) +
        `${clears(t3)}/${seeds.length}`,
    );
  }
}

if (process.argv[1]?.includes('a4probe')) main();
