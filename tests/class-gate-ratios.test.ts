/**
 * c034 — G10/G11's ratio-form ceilings, re-derived independently in this lane
 * against the *current* shipped `data/classes.json`, rather than inherited
 * from `p12a`'s acceptance claim.
 *
 * `p12a` (BALANCE DIRECTION v2 §A, BACKLOG.md) re-anchored kit-damage
 * magnitudes up to x3 and converted G10/G11's absolute pins to ratio form
 * specifically so a kit re-anchor could not break them — but the
 * verification that this actually held lived entirely in
 * `tests/p6d-nine-classes.test.ts`/`tests/p6b-swordsman.test.ts`, both
 * outside this lane's Scope. `c024`/`c027`/`c030` each found real drift by
 * re-measuring a claim rather than inheriting it (CLAUDE.md's measurement
 * rules); this item is the same check applied here; both formulas are pure
 * functions of `/data` fields this lane owns, so it costs little.
 *
 * **Formulas, read from `tests/p6d-nine-classes.test.ts` rather than
 * re-derived from scratch** (out-of-Scope, read-only — copying a small
 * formula into an in-Scope file is this lane's established convention, per
 * c013/c022/c033). One correction against this item's own guessed acceptance
 * text: G11's real ceiling exponent is `chainCap - 1` (a jump index starting
 * at 0), not `chainCap` — `p6d`'s own worked case uses `chainCap - 1`, and
 * `chainCap` itself (1.2^8 = 4.30) would already exceed the 3.6 ceiling on
 * shipped data, which p6d does not fail. Measured against the real test
 * rather than the backlog item's paraphrase, which is exactly the point of
 * re-deriving instead of inheriting.
 *
 * G10's "dps-optimal charge" is a numeric search over committed time
 * (charge held plus the cooldown paid after), not a closed form — `p6d`
 * itself searches rather than solves, so this file does the same search
 * rather than inventing a closed-form shortcut that could drift from it.
 */
import { describe, expect, it } from 'vitest';

import { loadContent, type Content } from '../src/sim/content';

const content: Content = loadContent();

/** G11's real formula (`tests/p6d-nine-classes.test.ts`): the worst reachable jump index is `chainCap - 1`. */
function stormcallerChainCeiling(chainGrowth: number, chainCap: number): number {
  return Math.pow(1 + chainGrowth, chainCap - 1);
}

/**
 * G10's real formula (`tests/p6d-nine-classes.test.ts`): damage per second of
 * *committed* time — the shot's compounded damage over the charge it cost
 * plus the cooldown paid after — searched over a held-time grid. The
 * `min(t, cap)` is what makes the optimum finite: uncapped, holding forever
 * always wins.
 */
function archerOptimalChargeSeconds(compoundPerSecond: number, chargeCapSeconds: number, cooldownSeconds: number): number {
  const growth = 1 + compoundPerSecond;
  let bestT = 0;
  let bestValue = -Infinity;
  for (let i = 1; i <= 150; i++) {
    const t = i / 10;
    const value = Math.pow(growth, Math.min(t, chargeCapSeconds)) / (t + cooldownSeconds);
    if (value > bestValue) {
      bestValue = value;
      bestT = t;
    }
  }
  return bestT;
}

describe('c034: G11 — Stormcaller chain ceiling, re-derived from shipped data', () => {
  const s = content.classByKey.get('stormcaller')!;
  const chainGrowth = s.active1.chainGrowth!;
  const chainCap = s.active1.chainCap!;

  it('the shipped chainGrowth/chainCap stay under the x3.6 ceiling', () => {
    const ceiling = stormcallerChainCeiling(chainGrowth, chainCap);
    expect(ceiling).toBeLessThanOrEqual(3.6);
    // Anti-vacuity: this is not a floor so loose any pair would pass — the
    // shipped numbers sit close enough to the ceiling (1.2^7 ~= 3.58) that a
    // real regression would actually cross it, not just theoretically could.
    expect(ceiling).toBeGreaterThan(3);
  });

  it('the check is live: raising chainCap past the point p6d itself would fail turns this red', () => {
    // p6d's own worked case uses chainCap 8 (chainGrowth 0.20) and passes at
    // 1.2^7 ~= 3.583. chainCap 10 -> exponent 9 -> 1.2^9 ~= 5.16, which is
    // exactly the regression this item exists to catch if it ever ships.
    expect(stormcallerChainCeiling(chainGrowth, 10)).toBeGreaterThan(3.6);
  });

  it('the ceiling formula matches p6d\'s own worked case exactly (Overload up, 8 total jumps)', () => {
    // p6d: `jumps = chainCount + overloadExtraChains`, `exponent =
    // min(chainCap - 1, jumps - 1)`. On shipped data `jumps` (chainCount 6 +
    // overloadExtraChains) meets `chainCap` exactly (8 == 8), so the cap
    // binds and both formulas agree — asserted directly rather than assumed.
    // (Not "exceeds": a drop of 1 in either `chainCount` or
    // `overloadExtraChains` would flip which term binds.)
    const jumps = s.active1.chainCount! + s.active2.overloadExtraChains!;
    const exponent = Math.min(chainCap - 1, jumps - 1);
    expect(exponent, 'harness: the cap does not bind on shipped data — the two formulas are not being compared at the same point').toBe(
      chainCap - 1,
    );
    expect(Math.pow(1 + chainGrowth, exponent)).toBe(stormcallerChainCeiling(chainGrowth, chainCap));
  });
});

describe('c034: G10 — Archer dps-optimal charge, re-derived from shipped data', () => {
  const a = content.classByKey.get('archer')!;
  const compoundPerSecond = a.active1.compoundPerSecond!;
  const chargeCapSeconds = a.active1.chargeCapSeconds!;
  const cooldownSeconds = a.active1.cooldownSeconds;

  it('the shipped compoundPerSecond/chargeCapSeconds/cooldownSeconds land the optimum in the 2-6 s window', () => {
    const t = archerOptimalChargeSeconds(compoundPerSecond, chargeCapSeconds, cooldownSeconds);
    expect(t).toBeGreaterThanOrEqual(2);
    expect(t).toBeLessThanOrEqual(6);
  });

  it('the check is live: pushing chargeCapSeconds well past the window turns this red', () => {
    // A cap of 30 s makes holding far past 6 s still profitable — the
    // "finite" clause G10 names is exactly what a cap this loose breaks.
    const t = archerOptimalChargeSeconds(compoundPerSecond, 30, cooldownSeconds);
    expect(t).toBeGreaterThan(6);
  });

  it('the search grid is fine enough that the reported optimum is not a grid artifact', () => {
    // A search step half as coarse (0.2 s instead of 0.1 s) must land within
    // one step of the finer grid's answer — proof the 0.1 s grid isn't
    // silently mis-locating the peak.
    const fine = archerOptimalChargeSeconds(compoundPerSecond, chargeCapSeconds, cooldownSeconds);
    let bestT = 0;
    let bestValue = -Infinity;
    const growth = 1 + compoundPerSecond;
    for (let i = 1; i <= 75; i++) {
      const t = i / 5;
      const value = Math.pow(growth, Math.min(t, chargeCapSeconds)) / (t + cooldownSeconds);
      if (value > bestValue) {
        bestValue = value;
        bestT = t;
      }
    }
    expect(Math.abs(bestT - fine)).toBeLessThanOrEqual(0.2);
  });
});
