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
 * transcribing every non-`rejected` line — there are 7 today, against
 * 60 total (12 fields x 5 families).
 */
import type { Verdict } from '../tools/fuzz-command-domain';

/** `${fieldKey}:${family}` -> the verdict `runCensus` records for it today. */
export const HOLES: Readonly<Record<string, Verdict>> = {
  'build.ty:fractional': 'accepted',
  'dev.gold.amount:nan': 'accepted',
  'dev.gold.amount:posInf': 'accepted',
  'dev.xp.amount:nan': 'accepted',
  'dev.xp.amount:posInf': 'hangs',
  'dev.fast_forward.amount:nan': 'accepted',
  'dev.fast_forward.amount:posInf': 'accepted',
};

/** Both dedicated alias-probe targets accept today (see the file header of `tools/fuzz-command-domain.ts`). */
export const ALIAS_HOLES: readonly ('upgrade' | 'sell')[] = ['upgrade', 'sell'];
