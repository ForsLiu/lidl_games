/**
 * fb133 (`tsconfig.json` is `strict` without `noUncheckedIndexedAccess`,
 * BACKLOG.md, refs BACKLOG-TERRAIN.md fb064t): flipping the flag directly
 * surfaced 1806 `error TS` diagnostics across 236 files — too large for one
 * loop-contract item or a single scheduled routine's budget. Fixing "with
 * real guards (not `!`)" at that scale needs deliberate per-file follow-up,
 * so this is the ratchet that makes that follow-up safe and visible instead
 * of a single all-or-nothing flag flip: `tsconfig.unchecked.json` (same
 * compiler options as `tsconfig.json` plus the flag) is the ground truth,
 * and this test's `KNOWN_UNCHECKED_ACCESS_FILES` is the current honest list
 * of files that still fail under it.
 *
 * Two-sided by design, matching `tests/fb118-backlog-id-uniqueness.test.ts`'s
 * own `KNOWN_PREEXISTING_COLLISIONS` precedent:
 *   - a file with a fresh error that is NOT on the list fails the test — no
 *     new unguarded indexed access can land silently.
 *   - a file on the list that no longer errors ALSO fails the test — a fix
 *     must remove its own entry here, so the list can only shrink on
 *     purpose, never drift stale.
 *
 * 18 files (23 sites) were fixed with real guards in the commit that added
 * this test, then 8 more (`src/sim/damagetypes.ts`, `src/sim/terrain/
 * generate.ts`, `src/sim/terrain/overlay.ts`, `src/sim/tiers.ts`,
 * `src/ui/audit-hook.ts`, `src/ui/codex.ts`, `src/ui/dps-panel.ts`,
 * `src/ui/tuner-fields.ts`) in a follow-up session (`??` defaults,
 * pre-checked guards before a lookup, `.charAt(0)` instead of `s[0]`), then a
 * third session fixed 7 (`src/sim/rng.ts`, `src/ui/character-panel.ts`,
 * `src/render/canvas.ts`, `src/sim/classes.ts`, `src/render/theme.ts`,
 * `src/sim/sundering.ts`, `src/sim/terrain/config.ts`) and, independently,
 * a fourth session fixed `src/render/colorblind-sim.ts` — see PROGRESS.md/
 * BACKLOG.md fb133 for the lists, which have continued shrinking the list
 * in similar batches since (155, then 147, then 137, then 121, then 111,
 * then 105, then 98, then 92, ..., then 20, then 18, then 16 files remaining
 * as of the latest). Shrink this list as files are fixed; do not add to it
 * without a reason logged in BACKLOG.md.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const KNOWN_UNCHECKED_ACCESS_FILES: readonly string[] = [
  'src/sim/enemies.ts',
  'src/sim/grid.ts',
  'src/sim/run.ts',
  'src/sim/terrain/analyze.ts',
  'src/sim/world.ts',
  'tests/class-active2-cdr.test.ts',
  'tests/fb037-vs-panel.test.ts',
  'tests/fb085-enablers.test.ts',
  'tests/p2b-wielded-fire.test.ts',
  'tests/p2c-vs-specials.test.ts',
  'tests/p6b-swordsman.test.ts',
  'tests/p6c-plaguebringer.test.ts',
  'tests/terrain-four-gates.test.ts',
  'tests/terrain-gate-open.test.ts',
  'tests/terrain-generation.test.ts',
  'tests/terrain-grid.test.ts',
];

// qa-playtester (fb133): under heavy host contention a slow `tsc` subprocess
// can hit `timeout` and get SIGTERM-killed mid-run; execFileSync's catch
// still yields whatever partial stdout had already been flushed, which is
// NOT a real diagnostic result and must not be read as one (it previously
// reported already-fixed files as fresh regressions). A killed/timed-out
// attempt retries — bounded, not a real result — rather than being
// silently treated as ground truth.
const TSC_ATTEMPT_TIMEOUT_MS = 90_000;
const TSC_MAX_ATTEMPTS = 3;

function runUncheckedTsc(attempt = 1): string {
  try {
    return execFileSync('npx', ['tsc', '--noEmit', '-p', 'tsconfig.unchecked.json'], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: TSC_ATTEMPT_TIMEOUT_MS,
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; killed?: boolean; signal?: string | null };
    if (e.killed || e.signal) {
      if (attempt < TSC_MAX_ATTEMPTS) return runUncheckedTsc(attempt + 1);
      throw new Error(
        `tsc -p tsconfig.unchecked.json was killed (signal ${e.signal ?? 'unknown'}) on every attempt ` +
          `(${TSC_MAX_ATTEMPTS}), likely host contention starving it past ${TSC_ATTEMPT_TIMEOUT_MS}ms each ` +
          `time — its partial output is not a real diagnostic result. Rerun this test in isolation.`,
      );
    }
    return `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
}

describe('fb133: noUncheckedIndexedAccess ratchet', () => {
  it(
    'the known-offender list exactly matches what tsconfig.unchecked.json still fails on',
    () => {
      const out = runUncheckedTsc();
      const actual = new Set<string>();
      for (const line of out.split('\n')) {
        const m = /^([A-Za-z0-9_./-]+\.ts)\(\d+,\d+\)/.exec(line);
        const file = m?.[1];
        if (file) actual.add(file);
      }
      const known = new Set(KNOWN_UNCHECKED_ACCESS_FILES);

      const newOffenders = [...actual].filter((f) => !known.has(f)).sort();
      const stale = [...known].filter((f) => !actual.has(f)).sort();

      expect(
        newOffenders,
        `new file(s) with unguarded indexed access under noUncheckedIndexedAccess — add real guards ` +
          `(?? defaults, explicit undefined checks; not '!') rather than adding these to the allowlist:\n` +
          newOffenders.join('\n'),
      ).toEqual([]);
      expect(
        stale,
        `file(s) fixed but still listed in KNOWN_UNCHECKED_ACCESS_FILES — remove their entries so the ` +
          `ratchet only shrinks on purpose:\n` +
          stale.join('\n'),
      ).toEqual([]);
    },
    // Up to TSC_MAX_ATTEMPTS retries at TSC_ATTEMPT_TIMEOUT_MS each (fb133 qa-playtester finding), plus buffer.
    320_000,
  );
});
