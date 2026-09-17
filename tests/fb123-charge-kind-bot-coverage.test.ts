/**
 * fb123 — no automated harness ever executed a charge-kind Active1.
 *
 * `src/bots/policy.ts`/`policies.ts` never set `TickInput.active1Held` (no
 * stock bot policy issues `class_active` at all — see `tests/p6e-class-
 * diversity.test.ts`'s header), so `fireDeadeyeDraw` (Archer, `charge_pierce`)
 * and `fireCircleSlash` (Swordsman, `charge_nova`) had zero bot/sweep
 * coverage: c017's QA replaced the changed line with a `throw` and a 12-seed
 * `tools/sweep.ts` run printed the same table without ever hitting it, and
 * `tools/fuzz-input.ts`'s per-phase Command fuzzer (`cfgFor`/`fuzzPhase`)
 * hardcodes `classKey: 'engineer'`, whose Active1 is not a charge kind either.
 *
 * `tests/helpers.ts`'s `runScripted`+`scriptClassKit` (BACKLOG p10s) is this
 * codebase's own answer to "play a bot run that still fires its class kit" —
 * already how G8/G14/G23 measure class-kit-inclusive outcomes. This file is
 * the missing regression that pins every registered stock policy's *build/
 * position* heuristic still lets the layered kit script land real Active1
 * damage for both charge kinds, per class — not just the one policy (hybrid)
 * G8/G14/G23 already exercise.
 */
import { describe, expect, it } from 'vitest';
import { policyNames } from '../src/bots';
import '../src/bots';
import { cfg, runScripted } from './helpers';

/** `idle` is the deliberate A2 "does nothing" control (`src/bots/policy.ts`) — scripting a kit onto it would test the script, not the policy roster. */
const PLAYED_POLICIES = policyNames().filter((p) => p !== 'idle');

describe('fb123 — charge-kind Active1 fires under every stock policy', () => {
  it('roster is non-trivial', () => {
    expect(PLAYED_POLICIES.length).toBeGreaterThan(3);
  });

  it.each(PLAYED_POLICIES)('archer (Deadeye Draw, charge_pierce) lands class_active damage under %s', (policy) => {
    const { report } = runScripted(cfg({ seed: 1, classKey: 'archer', policy }), policy, 60 * 60 * 20);
    expect(
      report.damageByWeapon['class_active'] ?? 0,
      `${policy}: damageByWeapon = ${JSON.stringify(report.damageByWeapon)}`,
    ).toBeGreaterThan(0);
  });

  it.each(PLAYED_POLICIES)('swordsman (Circle Slash, charge_nova) lands class_active damage under %s', (policy) => {
    const { report } = runScripted(cfg({ seed: 1, classKey: 'swordsman', policy }), policy, 60 * 60 * 20);
    expect(
      report.damageByWeapon['class_active'] ?? 0,
      `${policy}: damageByWeapon = ${JSON.stringify(report.damageByWeapon)}`,
    ).toBeGreaterThan(0);
  });
});
