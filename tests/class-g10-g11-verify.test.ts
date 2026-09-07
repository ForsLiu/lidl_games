/**
 * c034 (BACKLOG-CONTENT, lane `content`) — `p12a`'s kit re-anchor (up to x3 on
 * absolute kit-damage magnitudes) was accepted with G10/G11's absolute pins
 * converted to ratio form "and still pass" (BACKLOG.md p12a acceptance), but
 * that verification lived in `tests/p6d-nine-classes.test.ts` /
 * `tests/p6b-swordsman.test.ts` — both outside this lane's Scope. This file is
 * the lane-owned, independent re-derivation, against the *current* shipped
 * `data/classes.json` (`chainGrowth: 0.20`, `chainCap: 8`, `chainCount: 6`;
 * `compoundPerSecond: 0.40`, `chargeCapSeconds: 5`, `pierceCap: 6`).
 *
 * **The acceptance clause's own formula does not match the code, and this
 * file uses the code's, not the clause's — the same "verify independently"
 * trap `c024`/`c027`/`c030` each found real drift through.** The item's text
 * says "computes Stormcaller's max chain multiplier ... `(1+chainGrowth)^
 * chainCap`", which on shipped data is `1.2^8 = 4.300` — over G11's 3.6
 * ceiling. `src/sim/classes.ts`' `fireChainSurge` does not compound that far:
 * `capIndex = chainCap - 1` and each jump's exponent is `Math.min(i,
 * capIndex)`, so the reachable ceiling is `(1+chainGrowth)^(chainCap-1) =
 * 1.2^7 = 3.583`, matching G11 and matching `tests/p6d-nine-classes.test.ts`'s
 * own main-lane derivation (`exponent = min(chainCap-1, jumps-1)`) — this
 * file reproduces that exponent, not the clause's literal text.
 */
import { describe, expect, it } from 'vitest';

import { loadContent } from '../src/sim/content';

const content = loadContent();

describe('c034: G11 — Stormcaller max chain multiplier, derived independently from shipped /data', () => {
  const s = content.classByKey.get('stormcaller')!;
  const chainGrowth = s.active1.chainGrowth!;
  const chainCap = s.active1.chainCap!;
  const chainCount = s.active1.chainCount!;

  it('the reachable ceiling — exponent capped at chainCap - 1, matching fireChainSurge — is <= 3.6', () => {
    const exponent = chainCap - 1;
    const ceiling = Math.pow(1 + chainGrowth, exponent);
    expect(ceiling).toBeLessThanOrEqual(3.6);
  });

  it('the base chainCount alone (no skill card, no Overload) never even reaches the cap', () => {
    const exponent = Math.min(chainCap - 1, chainCount - 1);
    const value = Math.pow(1 + chainGrowth, exponent);
    expect(value).toBeLessThan(Math.pow(1 + chainGrowth, chainCap - 1));
  });

  it('the acceptance clause\'s literal formula ((1+chainGrowth)^chainCap, no -1) overstates the real ceiling and would wrongly fail the 3.6 bar on shipped data', () => {
    const literalClauseValue = Math.pow(1 + chainGrowth, chainCap);
    expect(literalClauseValue).toBeGreaterThan(3.6);
    const realCeiling = Math.pow(1 + chainGrowth, chainCap - 1);
    expect(realCeiling).toBeLessThanOrEqual(3.6);
  });

  it('proven live, not vacuous: a chainCap raised by 2 pushes the real ceiling over 3.6', () => {
    const mutatedCeiling = Math.pow(1 + chainGrowth, chainCap - 1 + 2);
    expect(mutatedCeiling).toBeGreaterThan(3.6);
  });
});

describe('c034: G10 — Archer dps-optimal charge, derived independently from shipped /data', () => {
  const a = content.classByKey.get('archer')!.active1;
  const cap = a.chargeCapSeconds!;
  const growth = 1 + a.compoundPerSecond!;
  const cooldown = a.cooldownSeconds;

  /**
   * `tests/p6d-nine-classes.test.ts`'s own formula, reproduced independently
   * here rather than imported (that file is out of this lane's Scope):
   * damage-per-committed-second of a hold of length `t`, where the `min(t,
   * cap)` is what makes the optimum finite at all.
   */
  function dpsAt(t: number): number {
    return Math.pow(growth, Math.min(t, cap)) / (t + cooldown);
  }

  function argmaxHold(): number {
    let bestT = 0;
    let bestValue = -Infinity;
    for (let i = 1; i <= 150; i++) {
      const t = i / 10;
      const value = dpsAt(t);
      if (value > bestValue) {
        bestValue = value;
        bestT = t;
      }
    }
    return bestT;
  }

  it('the dps-optimal charge is finite and lands in G10\'s 2-6 s window on shipped /data', () => {
    const bestT = argmaxHold();
    expect(bestT).toBeGreaterThanOrEqual(2);
    expect(bestT).toBeLessThanOrEqual(6);
  });

  it('proven live, not vacuous: an uncapped hold (chargeCapSeconds raised to 30) breaks the "finite" clause — the optimum runs to the search ceiling', () => {
    const uncappedCap = 30;
    function dpsAtUncapped(t: number): number {
      return Math.pow(growth, Math.min(t, uncappedCap)) / (t + cooldown);
    }
    let bestT = 0;
    let bestValue = -Infinity;
    for (let i = 1; i <= 150; i++) {
      const t = i / 10;
      const value = dpsAtUncapped(t);
      if (value > bestValue) {
        bestValue = value;
        bestT = t;
      }
    }
    // Growth compounds faster than the cooldown-amortization penalty grows
    // for this class's authored numbers, so an uncapped hold keeps climbing
    // to the search window's own ceiling (15 s) rather than settling inside
    // 2-6 s — exactly the "holding forever always wins" failure G10 exists
    // to rule out.
    expect(bestT).toBeGreaterThan(6);
  });
});
