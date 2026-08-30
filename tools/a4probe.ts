/**
 * Probe for SPEC A4: run each single-weapon-tower build (walls allowed for
 * mazing) at T1 and at T3 and print how far each gets.
 */

import { Run } from '../src/sim/run';
import { BuilderPolicy } from '../src/bots/policies';
import { loadContent, type Content } from '../src/sim/content';
import type { RunConfig } from '../src/sim/types';

let content: Content;
try {
  content = loadContent();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`a4probe: ${message.replace(/\s+/g, ' ').trim()}`);
  process.exit(1);
}

// SPEC-FINAL §6.1 (p2e) dropped the soul-weapon roster, so "soul-granting"
// is no longer a field of its own — it was always exactly the towers with an
// attack (palisade, beacon_totem and harvest_sprout are the only three that
// never had one), so that is what selects the same seven towers now.
export const SOUL_TOWERS = content.towers.towers
  .filter((t) => t.attack !== null)
  .map((t) => t.key);

/**
 * SPEC-FINAL §4: every class can build every soul tower — probing as the
 * always-unlocked Engineer is enough for most towers. One override avoids a
 * class-specific bonus that would inflate a single tower's solo baseline
 * past A4's T3 "fails alone" bound: Engineer's flat -10% tower cost / +1
 * build range alone is enough to tip Frost Obelisk over that bound, so it is
 * probed under a class with neither.
 */
export function classFor(towerKey: string): string {
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
    // SPEC-FINAL §1.1's real run shape (re-baselined at p3e): 18 TD waves
    // across 6 blocks, not the old single 10-wave Act I.
    cycles: 6,
  };
  const run = new Run(cfg);
  // Isolate solo-tower TD viability from VS combat viability — P6/P7 are
  // unbuilt, so no build can out-fight a VS wave on character kit alone
  // today. See tests/a4-single-type.test.ts's doc comment and Q109.
  run.world.invulnerable = true;
  const policy = new BuilderPolicy(`single:${towerKey}`, {
    towerKeys: [towerKey],
    wallRatio: 0.3,
    maxStructures: 60,
    upgradeAfter: 8,
    act2: 'kite',
    rushWaves: false,
  });
  while (!run.done && run.world.tick < 60 * 60 * 45 && run.world.wavesCleared < 18) {
    run.step(policy.act(run.world));
  }
  const r = run.report();
  return {
    waves: r.wavesCleared,
    cleared: r.wavesCleared >= 18,
    outcome: r.outcome,
    survival: r.survivalSeconds,
  };
}

function main(): void {
  const seeds = [1, 2, 3, 4, 5];
  // Optional CLI filter: `npx tsx tools/a4probe.ts venom_spore` probes one
  // tower instead of the full roster. Added at the 2026-08-28 lane merge:
  // p8a's real 18-wave data made the full table a multi-minute run, so
  // tests/q45-cli-schema-violation.test.ts's control case (which only needs
  // "clean data exits 0 with the table header") probes a single tower to
  // stay inside its 60 s nested-process budget. No argument keeps the full
  // table unchanged.
  const only = process.argv[2];
  const roster = [...SOUL_TOWERS, 'palisade'];
  if (only !== undefined && !roster.includes(only)) {
    throw new Error(`not a probeable tower: ${only}`);
  }
  console.log('tower            T1 waves(min/med)  T1 clears   T3 waves(min/med)  T3 clears');
  for (const key of only !== undefined ? [only] : roster) {
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

if (process.argv[1]?.includes('a4probe')) {
  try {
    main();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`a4probe: ${message.replace(/\s+/g, ' ').trim()}`);
    process.exitCode = 1;
  }
}
