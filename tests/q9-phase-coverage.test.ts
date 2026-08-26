/**
 * q9 — phase-reachability census (BACKLOG-QUALITY.md).
 *
 * `tools/phase-coverage.ts` plays real, undirected runs of every shipped bot
 * policy and records which `Phase` values each one's own play actually
 * produces. The point isn't "no crash" (q2 already fuzzes commands inside
 * every phase) — it's coverage: a phase no shipped policy ever stands in is
 * a phase no sim/sweep/gate measurement ever exercises, so a regression
 * there is invisible to the whole bot suite. Session 1 found exactly one
 * such hole (`soulpick`, pinned below) while writing q2; this test turns
 * that one-off observation into a standing check that a *second* hole
 * can't open unnoticed.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ALL_PHASES,
  census,
  censusOne,
  shippedPolicies,
  type PolicyCensus,
} from '../tools/phase-coverage';
import type { Phase } from '../src/sim/types';

const SEEDS = 8;

/**
 * The floor each policy must at least reach, recorded from real runs of
 * every shipped policy at HEAD (stable identically at 6, 8, 10 and 12 seeds
 * — see BACKLOG-QUALITY.md's q9 log for the measurement). A policy dropping below its own floor
 * — or gaining a phase not listed here staying silently unrecorded — is
 * exactly the regression this test exists to catch; the second half is
 * covered by `reached` being pinned exactly, not just as a lower bound.
 */
const RECORDED_FLOOR: Record<string, Phase[]> = {
  idle: ['act1_build', 'act1_wave', 'results'],
  'no-move': ['act1_build', 'act1_wave', 'dusk', 'act2', 'levelup', 'results'],
  turtle: ['act1_build', 'act1_wave', 'dusk', 'act2', 'levelup', 'results'],
  kite: ['act1_build', 'act1_wave', 'dusk', 'act2', 'levelup', 'results'],
  hybrid: ['act1_build', 'act1_wave', 'dusk', 'act2', 'levelup', 'dawn', 'results'],
  maxbuild: ['act1_build', 'act1_wave', 'dusk', 'act2', 'levelup', 'dawn', 'results'],
  walloff: ['act1_build', 'act1_wave', 'dusk', 'act2', 'levelup', 'results'],
  greedy: ['act1_build', 'act1_wave', 'dusk', 'act2', 'levelup', 'dawn', 'results'],
  greedless: ['act1_build', 'act1_wave', 'dusk', 'act2', 'levelup', 'dawn', 'results'],
  rush: ['act1_build', 'act1_wave', 'dusk', 'act2', 'levelup', 'results'],
};

/** `a` is a superset of `b`. */
function isSuperset(a: readonly Phase[], b: readonly Phase[]): boolean {
  const set = new Set(a);
  return b.every((p) => set.has(p));
}

describe('q9 — phase-reachability census', () => {
  it('covers every registered policy with a recorded floor', () => {
    // If a new policy ships without a floor entry, that is the item this
    // test exists to force: someone has to look at what it reaches.
    expect(shippedPolicies().sort()).toEqual(Object.keys(RECORDED_FLOOR).sort());
  });

  let rows: PolicyCensus[];
  let byPolicy: Map<string, PolicyCensus>;
  beforeAll(() => {
    rows = census(shippedPolicies(), SEEDS);
    byPolicy = new Map(rows.map((r) => [r.policy, r]));
  });

  it.each(Object.keys(RECORDED_FLOOR))('%s reaches at least its recorded floor', (policy) => {
    const row = byPolicy.get(policy);
    expect(row).toBeDefined();
    const floor = RECORDED_FLOOR[policy];
    expect(isSuperset(row!.reached, floor)).toBe(true);
  });

  it('reaches exactly the recorded set, not a superset that would hide a new gap silently', () => {
    // A policy reaching *more* than its floor is not a regression, but it is
    // news — either the floor needs updating (a policy got better) or a
    // seed picked up act2's rare `dawn` branch by chance. Either way this
    // should be looked at, not pass quietly, so it is asserted exactly and
    // updated deliberately when it moves.
    for (const [policy, floor] of Object.entries(RECORDED_FLOOR)) {
      const row = byPolicy.get(policy)!;
      expect(row.reached, `policy ${policy}`).toEqual(floor);
    }
  });

  it('the "no shipped policy reaches soulpick" gap is pinned, not assumed', () => {
    // Recorded reason (session 1): beginSoulPick only opens the picker when
    // distinct candidate souls outnumber weaponSlots (7 souls vs 6 slots in
    // data/towers.json), and every shipped policy finishes Act I with only
    // 3-4 distinct souls, so all of them auto-bind and skip the phase. If
    // this ever starts failing, soulpick has become reachable and this test
    // (and the RECORDED_FLOOR entries above) should be updated to include
    // it — that is good news, not a regression.
    for (const row of rows) {
      expect(row.reached, `policy ${row.policy}`).not.toContain('soulpick');
    }
  });

  it('the union across every shipped policy is exactly ALL_PHASES minus soulpick', () => {
    const union = new Set<Phase>();
    for (const row of rows) for (const p of row.reached) union.add(p);
    const expected = ALL_PHASES.filter((p) => p !== 'soulpick');
    expect([...union].sort()).toEqual([...expected].sort());
  });

  it('the tool itself is seed-reproducible: same seeds in, same census out', () => {
    // A handful of seeds is enough to prove determinism; SEEDS itself is
    // already computed once above and reused via `rows`.
    const a = censusOne('hybrid', 3);
    const b = censusOne('hybrid', 3);
    expect(b).toEqual(a);
  });

  it('the superset check actually fires — proven by feeding it a real gap', () => {
    // Anti-vacuity: manufacture a PolicyCensus with a phase missing from its
    // own recorded floor and confirm isSuperset (the guard the floor tests
    // above depend on) rejects it. Import isSuperset's behaviour indirectly
    // through a hand-built fixture rather than trusting the floor tests
    // alone to prove the machinery works.
    const missingDusk: PolicyCensus = {
      policy: 'hybrid',
      seeds: SEEDS,
      seedStart: 1,
      reached: ALL_PHASES.filter((p) => p !== 'dusk' && p !== 'soulpick'),
      unreached: ['dusk', 'soulpick'],
    };
    const floor = RECORDED_FLOOR.hybrid;
    expect(isSuperset(missingDusk.reached, floor)).toBe(false);
    // And the honest case still passes, so the guard isn't just always-false.
    expect(isSuperset(ALL_PHASES.slice(), floor)).toBe(true);
  });
});
