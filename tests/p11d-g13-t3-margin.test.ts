/**
 * p11d (BACKLOG): an explicit margin pin on gate G13's T3 "fails alone"
 * clause (`tests/a4-single-type.test.ts`), which only asserts the pass/fail
 * *count* (`clears(...) === 0`) and carries no signal about how close a
 * seed came to flipping. That file is excluded from the fast tier (~116 s+),
 * so a regression there only surfaces at a full `npm test` — a surprise
 * this file exists to prevent by living in the fast tier itself, at the
 * cost of a single scripted run.
 *
 * qa-playtester's `b072` pass flagged (but never filed) that three of that
 * item's four retuned towers each had one T3 seed landing at 17/18 waves —
 * one wave from actually clearing T3, which would break G13's "no solo
 * build survives T3" invariant outright. Re-measured fresh at p11d (this
 * session, `npx tsx tools/a4probe.ts` cross-checked against a live per-seed
 * scratch run): under HEAD's current `/data` (multiple balance passes have
 * landed since b072 — fb025, b080, fb054), that specific three-tower finding
 * no longer reproduces. The one genuine near-miss today is
 * `frost_obelisk`, seed 4: 17/18 waves, one wave under the T3 clear line.
 * Every other tower's worst T3 seed sits at 16 or lower (2+ waves of
 * headroom) — see `tests/a4-single-type.test.ts`'s own T1 measurements and
 * this file's own assertion below for the full current picture.
 *
 * This pins `frost_obelisk`'s near-miss seed exactly: if a future buff (to
 * `frost_obelisk` itself, or an unrelated wave-curve nudge) pushes it past
 * 17, this test fails loud in `test:fast` on every loop item, not just at
 * the next full-suite run.
 */
import { describe, expect, it } from 'vitest';

import { T3_MODS, runSingleType } from '../tools/a4probe';

describe('p11d: G13 T3 near-miss margin stays pinned', () => {
  it('frost_obelisk seed 4 stays under the T3 clear line (measured 17/18 today)', () => {
    const result = runSingleType('frost_obelisk', 3, 4, T3_MODS);
    // A tolerance, not an exact floor pin (unlike a4-single-type.test.ts's
    // T1_EXPECTED_CLEARS convention): the invariant this item cares about is
    // "never reaches 18," not "stays at exactly today's 17." A future change
    // that widens the margin (fewer waves) should not have to bump this pin.
    expect(result.waves).toBeLessThan(18);
    expect(result.cleared).toBe(false);
  });
});
