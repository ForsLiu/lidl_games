/**
 * fb181 (BACKLOG-TERRAIN.md) — fb166 shipped the 36x20 -> 56x32 grid resize
 * without a regression test that would have caught its own `GATES.east`
 * border bug at the exact commit that resized the grid. QA's fb166 finding
 * named the missing check directly: "every `GATES` entry satisfies
 * `tx===0||ty===0||tx===GRID_W-1||ty===GRID_H-1` for the *current*
 * constants." `tests/grid.test.ts` itself is outside this lane's Scope
 * (`tests/terrain*` only), so this is a new file rather than an addition to
 * that one.
 *
 * **What actually broke, confirmed from history rather than assumed.**
 * `git show ef778af^:src/sim/grid.ts` (the commit immediately before
 * fb153b's fix, `GRID_W`/`GRID_H` already 56/32 from fb166's earlier resize)
 * shows `GATES.east` was still `{ tx: 35, ty: 17 }` — the old 36-wide grid's
 * east border column (`35 === 36 - 1`), an ordinary *interior* tile once
 * `GRID_W` became 56. `MODIFIER_GATES` was not affected the same way: its
 * `'south2'` entry was already `{ tx: 3, ty: GRID_H - 1 }` (relative to
 * `GRID_H`, not a stale literal) as of the same commit — the `{ tx: 12, ty:
 * 19 }` bug this file's neighbours mention belonged to `world.ts`'s own
 * independent Fourth Gate literal, a different file outside this lane's
 * Scope, not to `MODIFIER_GATES` itself. So the historical-regression case
 * below targets `GATES.east` specifically, the one entry that was ever
 * actually broken; `MODIFIER_GATES` is covered by the same current-legality
 * checks for completeness, per the acceptance's "covering both."
 *
 * Every check below is the position-legality subset of `openGate`'s own
 * rules (`grid.ts`'s `assertGatePositionLegal`), re-derived locally rather
 * than imported: this file's job is to notice `GATES`/`MODIFIER_GATES`
 * drifting off the border independently of whether `Grid`'s constructor (or
 * anything else) happens to validate them, so it does not lean on the same
 * function a future refactor might change in step with the bug.
 */

import { describe, expect, it } from 'vitest';

import { GATES, GRID_H, GRID_W, MODIFIER_GATES, type GateDef } from '../src/sim/grid';

/** The position-legality subset of `openGate`'s rules, re-derived locally. */
function isLegalGatePosition(tx: number, ty: number): boolean {
  if (!Number.isInteger(tx) || !Number.isInteger(ty)) return false;
  if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) return false;
  const isCorner = (tx === 0 || tx === GRID_W - 1) && (ty === 0 || ty === GRID_H - 1);
  if (isCorner) return false;
  return tx === 0 || ty === 0 || tx === GRID_W - 1 || ty === GRID_H - 1;
}

function describeAll(gates: readonly GateDef[]): string[] {
  return gates.filter((g) => !isLegalGatePosition(g.tx, g.ty)).map((g) => `${g.key} (${g.tx},${g.ty})`);
}

describe('fb181 — GATES and MODIFIER_GATES sit on the current border', () => {
  it('every GATES entry is on the border, in bounds, integer, and not a corner', () => {
    expect(describeAll(GATES)).toEqual([]);
  });

  it('every MODIFIER_GATES entry is on the border, in bounds, integer, and not a corner', () => {
    expect(describeAll(MODIFIER_GATES)).toEqual([]);
  });

  it('no two entries, across both lists combined, share a tile', () => {
    const seen = new Map<string, string>();
    const offenders: string[] = [];
    for (const g of [...GATES, ...MODIFIER_GATES]) {
      const key = `${g.tx},${g.ty}`;
      const prior = seen.get(key);
      if (prior !== undefined) offenders.push(`${prior} and ${g.key} both target (${g.tx},${g.ty})`);
      seen.set(key, g.key);
    }
    expect(offenders).toEqual([]);
  });

  it('the check genuinely fails against the pre-fb153b broken state, not just today\'s fixed one', () => {
    // Confirmed by history, not guessed: `git show ef778af^:src/sim/grid.ts`
    // (immediately before fb153b's fix) has `GATES.east` at this exact
    // literal, with GRID_W/GRID_H already 56/32 from fb166's earlier resize —
    // the stale 36-wide grid's east border column, `35 === 36 - 1`, an
    // ordinary interior tile at the current width. Constructing it here
    // rather than importing anything: the point is that this check would
    // have gone red at the commit that introduced the bug, independent of
    // whatever `src/sim/grid.ts` exports today.
    const staleGatesEast: GateDef = { key: 'east', tx: 35, ty: 17 };
    expect(isLegalGatePosition(staleGatesEast.tx, staleGatesEast.ty)).toBe(false);
    const gateAt = (i: number): GateDef => {
      const g = GATES[i];
      if (!g) throw new Error(`GATES has no entry at index ${i}`);
      return g;
    };
    const staleGates: readonly GateDef[] = [gateAt(0), gateAt(1), staleGatesEast, gateAt(3)];
    expect(describeAll(staleGates)).toEqual(['east (35,17)']);

    // A second, synthetic case per the acceptance's own three named defects
    // (off-border, a corner, a collision) — none of which the two ledger
    // tests above can be seen to catch just because they pass on legal
    // input, so each is exercised directly here too.
    expect(isLegalGatePosition(12, 10)).toBe(false); // off-border interior
    expect(isLegalGatePosition(0, 0)).toBe(false); // corner
    expect(isLegalGatePosition(12.5, 0)).toBe(false); // non-integer
    expect(isLegalGatePosition(-1, 5)).toBe(false); // off-grid
    expect(isLegalGatePosition(GRID_W, 5)).toBe(false); // off-grid
    // And the positive control: a real border tile passes.
    expect(isLegalGatePosition(0, 5)).toBe(true);
  });
});
