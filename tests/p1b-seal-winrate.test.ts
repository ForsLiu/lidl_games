/**
 * p1b — SPEC-FINAL §10, gate G7's third clause:
 *
 *   "sealed-build win rate ≤ open-build +10 pts at T2"
 *
 * Turtle economics stay honest once sealing is legal: fully sealing the Core
 * (legal since p1a) must not *dominate* the classic open maze. The sealed arm
 * is the `sealed` policy — maxbuild's tower mix plus a completed palisade
 * ring, including the closing tile every other bot deliberately skips. The
 * open arms are the two winning open-maze policies, `maxbuild` and `hybrid`;
 * the band is measured against the best of them, per the gate's wording.
 *
 * All three arms kite identically in Act II, so the only variable is the
 * Act I strategy. A win is `report.bossKilled`, the same claim the boss gate
 * measures. 12 seeds at T2, per the gate — with T2's modifier drafted via
 * `autoDraft`, exactly as A9's T2 measurement does: the draft is the tier
 * ladder's difficulty lever, so "T2 with no modifiers" would be T1 wearing
 * the label. Q83: this band is re-measured at p3e once the §1.1 run shape
 * replaces the cycle machine.
 *
 * The seal check below is not decoration: without it a broken `sealed`
 * policy that never closes the ring would turn this into an open-vs-open
 * comparison that passes vacuously (the m18/t1 lesson — a control that
 * cannot fail guards nothing).
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { makePolicy } from '../src/bots';
import { loadContent } from '../src/sim/content';
import { Run } from '../src/sim/run';
import { autoDraft } from '../src/sim/tiers';
import { cfg } from './helpers';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const TIER = 2;
/** G7's band: sealed win rate may exceed the best open rate by at most 10 pts. */
const BAND_PTS = 0.10;

interface Arm {
  wins: number;
  sealedSeeds: number;
  /** Tick the seal latch first fired, per sealed seed (parallel to SEEDS). */
  firstSealTicks: number[];
  outcomes: string[];
}

/**
 * Steps a full run under the named policy, sampling the physical seal
 * diagnostic during Act I (the live ground field always finds a breach
 * route, so `allGatesReachable` on the scratch field is the only honest
 * "is the board sealed?" question — see grid.ts).
 */
function measure(policyName: string): Arm {
  const arm: Arm = { wins: 0, sealedSeeds: 0, firstSealTicks: [], outcomes: [] };
  const content = loadContent();
  for (const seed of SEEDS) {
    const modifiers = autoDraft(content, seed, TIER);
    const run = new Run({ ...cfg({ seed, tier: TIER, modifiers }), policy: policyName });
    const policy = makePolicy(policyName);
    let sealTick = -1;
    while (!run.done && run.world.tick < 60 * 60 * 45) {
      run.step(policy.act(run.world));
      const w = run.world;
      if (
        sealTick < 0 &&
        w.tick % 120 === 0 &&
        (w.phase === 'act1_build' || w.phase === 'act1_wave') &&
        !w.grid.allGatesReachable()
      ) {
        sealTick = w.tick;
      }
    }
    const report = run.report();
    if (report.bossKilled) arm.wins++;
    if (sealTick >= 0) {
      arm.sealedSeeds++;
      arm.firstSealTicks.push(sealTick);
    }
    arm.outcomes.push(`seed ${seed}: ${report.outcome} firstSealTick=${sealTick}`);
  }
  return arm;
}

describe('G7 clause 3: sealed-build win rate stays inside the open-build band at T2 (p1b)', () => {
  // 36 full runs (~4 min): measured in beforeAll, not at collection time, so a
  // mid-run throw is a test failure with a timeout rather than a collect error.
  let sealed: Arm;
  let open: { name: string; arm: Arm }[];
  beforeAll(() => {
    sealed = measure('sealed');
    open = ['maxbuild', 'hybrid'].map((name) => ({ name, arm: measure(name) }));
  }, 900_000);

  it('the sealed arm actually seals — early, on every seed, or the comparison is vacuous', () => {
    expect(
      sealed.sealedSeeds,
      `sealed policy closed the ring on ${sealed.sealedSeeds}/${SEEDS.length} seeds:\n` +
        sealed.outcomes.join('\n'),
    ).toBe(SEEDS.length);
    // QA hardening: the latch alone cannot see *when* the seal arrived — a
    // regression that delays the first seal to wave 9 would still latch and
    // the band would then be measured on a mostly-open build. Gold limits the
    // ring, so waves 1–2 are always fought open; the measured max first-seal
    // tick today is 12600, and 15000 leaves margin without letting the seal
    // drift past the waves the band is measured on.
    for (const t of sealed.firstSealTicks) {
      expect(t, `a first seal at tick ${t} is too late:\n` + sealed.outcomes.join('\n'))
        .toBeLessThanOrEqual(15_000);
    }
  });

  it('the open arms stay open mazes', () => {
    for (const { name, arm } of open) {
      expect(arm.sealedSeeds, `${name} sealed on some seed:\n` + arm.outcomes.join('\n')).toBe(0);
    }
  });

  it('sealing does not dominate: sealed win rate ≤ best open win rate + 10 pts', () => {
    const bestOpen = Math.max(...open.map((o) => o.arm.wins));
    const detail =
      `sealed ${sealed.wins}/${SEEDS.length}\n` +
      open.map((o) => `${o.name} ${o.arm.wins}/${SEEDS.length}`).join('\n') +
      `\n--- sealed arm per seed ---\n` +
      sealed.outcomes.join('\n');
    expect(sealed.wins / SEEDS.length, detail).toBeLessThanOrEqual(
      bestOpen / SEEDS.length + BAND_PTS + 1e-9,
    );
  });
});
