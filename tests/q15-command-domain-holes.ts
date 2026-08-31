/**
 * q15's recorded artefact: every `tools/fuzz-command-domain.ts` census
 * combination that is *not* cleanly `'rejected'` today, plus the two
 * dedicated alias-probe results. Same contract as `tests/q7-loader-holes.ts`:
 * `tests/q15-command-domain-fuzz.test.ts` asserts the live census matches
 * this map **exactly** (q9-style: a new hole and a closed hole both go red),
 * so neither a fresh regression nor a silent fix can pass without a
 * conscious edit here.
 *
 * Do **not** edit an entry to make a red run green — an entry here means the
 * sim accepted, hung on, or was otherwise fooled by an illegal Command
 * argument it should have refused; the fix belongs in `/src`, which this
 * lane may not edit, and the deletion follows the fix. See
 * BACKLOG-QUALITY.md's Log for the write-up.
 *
 * Regenerate by running `npx tsx tools/fuzz-command-domain.ts` and
 * transcribing every non-`rejected` line — there is 1 today, against
 * 75 total (15 fields x 5 families). Re-measured after BACKLOG b006
 * (`Number.isFinite` guards on the three `dev` amount ops, `src/sim/run.ts`):
 * the six `dev.gold`/`dev.xp`/`dev.fast_forward` holes are closed, leaving
 * only `build.ty:fractional` (BACKLOG b007's scope, still open).
 */
import type { Verdict } from '../tools/fuzz-command-domain';

/** `${fieldKey}:${family}` -> the verdict `runCensus` records for it today. */
export const HOLES: Readonly<Record<string, Verdict>> = {
  'build.ty:fractional': 'accepted',
};

/** Both dedicated alias-probe targets accept today (see the file header of `tools/fuzz-command-domain.ts`). */
export const ALIAS_HOLES: readonly ('upgrade' | 'sell')[] = ['upgrade', 'sell'];
