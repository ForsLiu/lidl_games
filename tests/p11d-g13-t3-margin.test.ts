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
 * build survives T3" invariant outright. Re-measured fresh at p11d (that
 * session, `npx tsx tools/a4probe.ts` cross-checked against a live per-seed
 * scratch run): under that session's `/data` (multiple balance passes had
 * landed since b072 — fb025, b080, fb054), that specific three-tower finding
 * no longer reproduced. The one genuine near-miss at p11d was
 * `frost_obelisk`, seed 4: 17/18 waves, one wave under the T3 clear line.
 *
 * **fb199 (this session) — re-measured, honestly stale.** `frost_obelisk`
 * seed 4 now reads **2/18** (`outcome: 'defeat_core'`), not 17/18 — named in
 * fb199's own filing text as the same drift shape hitting this file too. The
 * assertion below is a tolerance (`<18`), not an exact pin, so it is not
 * failing and needed no code change — but the docstring number above and the
 * test title were badly stale (a genuine "one wave from flipping" near-miss
 * read as a comfortable 16-wave margin), which is worse than merely out of
 * date: a reader trusting the old prose would think this pin still carries
 * near-miss signal when it currently does not. Not re-investigated further
 * (`tests/a4-single-type.test.ts`'s own fb199 entry has the bisection
 * methodology this would reuse); left for a future item if `frost_obelisk`'s
 * T1 identity-probe root cause (also open, same file) turns out to explain
 * this too.
 *
 * This pins `frost_obelisk`'s T3 seed exactly: if a future buff (to
 * `frost_obelisk` itself, or an unrelated wave-curve nudge) pushes it past
 * 17, this test fails loud in `test:fast` on every loop item, not just at
 * the next full-suite run.
 *
 * fb199 (2026-09-18): re-measured while bisecting a sibling drift in
 * `tests/a4-single-type.test.ts`'s `p12h` case (QUESTIONS Q212) — this
 * seed no longer lands anywhere near the line (`waves:2, defeat_core`, not
 * 17). The `<18`/`cleared:false` tolerance this test asserts was written
 * to survive exactly this kind of drift without needing an update, and
 * still holds; only the docstring/title's "17/18" figure is stale. Left
 * uncorrected to an exact number on purpose — re-pinning to today's "2"
 * would just repeat the same staleness next time terrain/wave-curve
 * commands shift this seed's margin, which is precisely what this test's
 * own tolerance design (see below) already guards against.
 */
import { describe, expect, it } from 'vitest';

import { T3_MODS, runSingleType } from '../tools/a4probe';

describe('p11d: G13 T3 near-miss margin stays pinned', () => {
  it('frost_obelisk seed 4 stays under the T3 clear line (margin has since widened, fb199)', () => {
    const result = runSingleType('frost_obelisk', 3, 4, T3_MODS);
    // A tolerance, not an exact floor pin (unlike a4-single-type.test.ts's
    // T1_EXPECTED_CLEARS convention): the invariant this item cares about is
    // "never reaches 18," not "stays at exactly today's reading." A future
    // change that widens the margin (fewer waves) should not have to bump
    // this pin.
    expect(result.waves).toBeLessThan(18);
    expect(result.cleared).toBe(false);
  });
});
