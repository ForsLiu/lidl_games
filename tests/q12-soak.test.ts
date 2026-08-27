/**
 * q12 — soak suite (BACKLOG-QUALITY.md; the in-Scope substance of q1, which
 * stays blocked on the `npm run soak` alias a `package.json` edit would need).
 *
 * `tools/soak.ts` plays 50 seeded full headless runs, one shipped bot policy
 * per run round-robin so the soak is a genuine mix, with no Command injected
 * beyond what each policy's own play produces — the opposite half of q2's
 * `fuzzRun`, which plays a run *with* random Commands stitched in to abuse the
 * player surface. This file asserts QUALITY.md's ALPHA soak line directly:
 * zero uncaught exceptions, zero NaN/negative-invariant violation, reusing
 * q11's extracted `scanWorld`/`scanReport` rather than re-deriving a checker.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { describeSoakFailure, shippedPolicies, soak, soakOne, type SoakResult } from '../tools/soak';
import { registerPolicy } from '../src/bots';
import { emptyInput } from '../src/sim/types';

describe('q12 — soak suite', () => {
  const SEEDS = 50;
  // Captured once, before the anti-vacuity block below registers its
  // throwaway probe policies: `shippedPolicies()` reads a live, mutable
  // registry, so calling it again after that registration would pick up
  // policies this soak never ran.
  const POLICIES = shippedPolicies();
  let results: SoakResult[];
  beforeAll(() => {
    results = soak(SEEDS, POLICIES);
  });

  it('runs the full seeded soak with zero uncaught exceptions and zero invariant violations', () => {
    const failures = results.filter((r) => r.problems.length > 0);
    expect(failures, failures.map(describeSoakFailure).join('\n')).toEqual([]);
    expect(results).toHaveLength(SEEDS);
    for (const r of results) {
      expect(r.threw, describeSoakFailure(r)).toBe(false);
      expect(r.outcome).not.toBe('running');
      expect(r.endHash).not.toBe('');
      expect(r.ticks).toBeGreaterThan(0);
    }
  });

  it('actually mixes policies rather than soaking a single bot 50 times', () => {
    // Round-robin over every shipped policy: with 50 seeds and fewer than 50
    // policies, every one of them gets at least one run.
    const used = new Set(results.map((r) => r.policy));
    expect([...used].sort()).toEqual([...POLICIES].sort());
  });

  it('is seed-reproducible', () => {
    const a = soakOne(11, 'hybrid');
    const b = soakOne(11, 'hybrid');
    expect(b.endHash).toBe(a.endHash);
    expect(b.ticks).toBe(a.ticks);
    expect(b.outcome).toBe(a.outcome);

    const c = soakOne(12, 'hybrid');
    expect(c.endHash).not.toBe(a.endHash);
  });

  it('rejects an empty policy list rather than silently soaking nothing', () => {
    expect(() => soak(5, [])).toThrow(/non-empty/);
  });

  describe('anti-vacuity: the harness can actually fail', () => {
    // A soak whose exception path never fires on a run that genuinely throws
    // would report "0 failures" whether or not anything is broken. Prove it
    // fires by registering a policy engineered to throw and running it
    // through the real `soakOne`, not a stand-in. Registered under this
    // file's own module instance only (vitest isolates test files by
    // default), so q9's exact-match census of `shippedPolicies()` in its own
    // file never sees it.
    const THROWER = '__q12_anti_vacuity_thrower__';
    registerPolicy(THROWER, () => ({
      name: THROWER,
      act() {
        throw new Error('q12 anti-vacuity probe: deliberate throw');
      },
    }));

    it('marks a throwing run as threw, not as clean', () => {
      const r = soakOne(1, THROWER);
      expect(r.threw).toBe(true);
      expect(r.problems.length).toBeGreaterThan(0);
      expect(r.problems[0]).toContain('threw');
      expect(r.endHash).toBe('');
    });

    it('a policy that never throws and never breaks an invariant stays clean', () => {
      // The control: registering a policy alone does not make `threw` true —
      // only a genuine throw does. Guards against a hollowed-out `soakOne`
      // that reports `threw: true` unconditionally for any non-shipped name.
      const SILENT = '__q12_anti_vacuity_silent__';
      registerPolicy(SILENT, () => ({ name: SILENT, act: () => emptyInput() }));
      const r = soakOne(1, SILENT);
      expect(r.threw).toBe(false);
      expect(r.problems).toEqual([]);
    });

    // QA (session 8) mutation-tested `soakOne` by disabling its `scanWorld`/
    // `scanReport` calls entirely and found every test above still passed —
    // the THROWER/SILENT pair above proves the *exception* path can fail, but
    // nothing proved the *invariant-scan* half of q12's own acceptance line
    // ("zero NaN/negative-invariant violations") is actually wired in. This
    // closes that gap the same way: a policy that corrupts the world directly
    // (no exception, no Command) rather than one that throws.
    const POISONER = '__q12_anti_vacuity_poisoner__';
    let poisoned = false;
    registerPolicy(POISONER, () => ({
      name: POISONER,
      act(w) {
        if (!poisoned) {
          w.gold = NaN;
          poisoned = true;
        }
        return emptyInput();
      },
    }));

    it('marks a world a policy silently poisons as an invariant violation, not as clean', () => {
      poisoned = false;
      const r = soakOne(1, POISONER);
      expect(r.threw).toBe(false);
      expect(r.problems.length).toBeGreaterThan(0);
      expect(r.problems.join(' | ')).toContain('gold');
    });
  });
});
