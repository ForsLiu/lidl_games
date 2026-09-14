/**
 * c038 (BACKLOG-CONTENT, lane `content`) — the roster size (12 classes) is a
 * hardcoded assumption. The item's own premise named three files:
 * `tests/class-kit-fingerprint.test.ts` (c033, "66 pairs"),
 * `tests/class-kit-damage-share.test.ts` (c002, "distinct top sources: N/12"),
 * and `tests/class-time-lord-band.test.ts` (c003's "11 of 12 classes
 * measured"). Checked against the code rather than assumed: only the first
 * actually pins a live assertion to the literal — `expect(KEYS.length).toBe(12)`
 * / `.toBe(66)`. The other two already read `content.classes.classes.length`
 * live (`class-kit-damage-share.test.ts`'s `KEYS`/`rows.length`) or
 * deliberately avoid a roster-count pin at all (`class-time-lord-band.test.ts`
 * line 201: "Deliberately not a roster-count pin — three of those already
 * exist (`fb013-timelord`, `grid`, `p6d-nine-classes`)", all three main-lane
 * files this lane cannot touch). Their "12"/"11 of 12" text is measurement
 * history in doc comments, not a runtime literal `fb057`/`fb059` would break.
 *
 * So this module exists for the one file that needed it, exported once
 * rather than inlined there, on `class-board.ts`'s precedent (c014): a second
 * importer costs nothing and the next roster-size assumption found in-lane
 * has somewhere to point instead of growing its own copy.
 */

import { loadContent, type Content } from '../src/sim/content';

const defaultContent = loadContent();

/** The live class count. Never hardcode this — classes.length can and will change (`fb057`, `fb059`). */
export function rosterSize(c: Content = defaultContent): number {
  return c.classes.classes.length;
}

/** How many unordered pairs `n` classes make — the fingerprint sweep's `nC2`. */
export function pairCount(n: number): number {
  return (n * (n - 1)) / 2;
}

/** The shipped roster size, read live at module load rather than pinned as a literal. */
export const ROSTER_SIZE = rosterSize();
/** The shipped pairwise-fingerprint combination count, derived from `ROSTER_SIZE`, not authored separately. */
export const PAIR_COUNT = pairCount(ROSTER_SIZE);
