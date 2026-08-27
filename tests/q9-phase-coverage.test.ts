/**
 * q9 — phase-reachability census (BACKLOG-QUALITY.md).
 *
 * `tools/phase-coverage.ts` plays real, undirected runs of every shipped bot
 * policy and records which `Phase` values each one's own play actually
 * produces. The point isn't "no crash" (q2 already fuzzes commands inside
 * every phase) — it's coverage: a phase no shipped policy ever stands in is
 * a phase no sim/sweep/gate measurement ever exercises, so a regression
 * there is invisible to the whole bot suite. Session 1 found exactly one
 * such hole (`soulpick`) while writing q2; the souls system and its phase
 * were deleted outright at p3d, but the instrument outlives the finding —
 * this suite is ported to the SPEC-FINAL five-phase machine, and the pinned
 * gap is now `idle`'s (see below).
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
 * — re-measured for the SPEC-FINAL phase machine at the quality-lane merge).
 * A policy dropping below its own floor — or gaining a phase not listed here
 * staying silently unrecorded — is exactly the regression this test exists
 * to catch; the second half is covered by `reached` being pinned exactly,
 * not just as a lower bound.
 */
const RECORDED_FLOOR: Record<string, Phase[]> = {
  idle: ['act1_build', 'act1_wave', 'act2', 'results'],
  'no-move': ['act1_build', 'act1_wave', 'act2', 'levelup', 'results'],
  turtle: ['act1_build', 'act1_wave', 'act2', 'levelup', 'results'],
  kite: ['act1_build', 'act1_wave', 'act2', 'levelup', 'results'],
  hybrid: ['act1_build', 'act1_wave', 'act2', 'levelup', 'results'],
  maxbuild: ['act1_build', 'act1_wave', 'act2', 'levelup', 'results'],
  walloff: ['act1_build', 'act1_wave', 'act2', 'levelup', 'results'],
  sealed: ['act1_build', 'act1_wave', 'act2', 'levelup', 'results'],
  greedy: ['act1_build', 'act1_wave', 'act2', 'levelup', 'results'],
  greedless: ['act1_build', 'act1_wave', 'act2', 'levelup', 'results'],
  rush: ['act1_build', 'act1_wave', 'act2', 'levelup', 'results'],
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
    // seed picked up a rare branch by chance. Either way this should be
    // looked at, not pass quietly, so it is asserted exactly and updated
    // deliberately when it moves.
    for (const [policy, floor] of Object.entries(RECORDED_FLOOR)) {
      const row = byPolicy.get(policy)!;
      expect(row.reached, `policy ${policy}`).toEqual(floor);
    }
  });

  it('the "idle never reaches levelup" gap is pinned, not assumed', () => {
    // The port of session 1's pinned-soulpick case: the souls system and its
    // phase are gone (p3d), but the same instrument still finds one recorded
    // hole. Reason (measured at the quality-lane merge): `idle` sends no
    // input at all, so in the VS wave it stands still, collects no XP gems,
    // and `openLevelUpIfPending` never has a pending level to open — it dies
    // without ever standing in `levelup`. If this ever starts failing,
    // `levelup` has become reachable without playing (e.g. free XP), and this
    // test (and idle's RECORDED_FLOOR entry) should be updated deliberately —
    // that is news, not a regression.
    const idle = byPolicy.get('idle')!;
    expect(idle.reached).not.toContain('levelup');
  });

  it('the union across every shipped policy is exactly ALL_PHASES', () => {
    // Unlike the pre-merge sim (where `soulpick` was reachable by no policy
    // at all), every phase of the five-member union is exercised by at least
    // one shipped policy. A phase falling out of this union is the
    // whole-fleet blind spot this suite exists to catch.
    const union = new Set<Phase>();
    for (const row of rows) for (const p of row.reached) union.add(p);
    expect([...union].sort()).toEqual([...ALL_PHASES].sort());
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
    const missingLevelup: PolicyCensus = {
      policy: 'hybrid',
      seeds: SEEDS,
      seedStart: 1,
      reached: ALL_PHASES.filter((p) => p !== 'levelup'),
      unreached: ['levelup'],
    };
    const floor = RECORDED_FLOOR.hybrid;
    expect(isSuperset(missingLevelup.reached, floor)).toBe(false);
    // And the honest case still passes, so the guard isn't just always-false.
    expect(isSuperset(ALL_PHASES.slice(), floor)).toBe(true);
  });
});
