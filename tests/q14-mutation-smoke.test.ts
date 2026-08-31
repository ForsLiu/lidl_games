/**
 * q14 — mutation smoke (BACKLOG-QUALITY), the in-Scope substance of q6.
 *
 * Automates the manual mutation testing qa-playtester has done by hand across
 * the q8, q9, q12, q10, q15 and q13 sessions (BACKLOG-QUALITY q14, expanded
 * by q20): apply one named source mutation, run the single test file that
 * originally caught it, confirm red — via `tools/mutation-probe.ts`, which
 * see for why every mutation runs against a throwaway scratch copy of
 * src/tests/tools/data rather than the real files (mutating a shared `src/`
 * or `tools/` file in place while `npm test`'s other worker threads import
 * those same paths would make this file a flake generator for the whole
 * suite, not just itself).
 *
 * Each mutation's test runs a nested `npx vitest run` and therefore takes
 * real wall-clock time (a handful to ~30s per mutation); the control runs
 * exist so a broken harness reads as an explicit control failure rather than
 * as every mutation looking "caught" for the wrong reason.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  MUTATIONS,
  cleanupAllScratch,
  gitDiffClean,
  hasNewUntrackedFiles,
  probeControl,
  probeOne,
  scratchRootExists,
  snapshotUntracked,
} from '../tools/mutation-probe';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FIXTURE = path.join(ROOT, 'tools', 'mutation-probe-fixture.txt');
const MUTATION_PROBE_SOURCE = path.join(ROOT, 'tools', 'mutation-probe.ts');

describe('q14 — mutation smoke', () => {
  beforeAll(() => {
    // Sweep any orphan left by a prior run of this file (or the CLI) that
    // was hard-killed mid-probe, same reasoning as tools/mutation-probe.ts's
    // own startup sweep in main().
    cleanupAllScratch();
  });

  it('has at least the ten mutations recorded from the q8/q9/q12/q10/q15/q13 sessions (q20)', () => {
    expect(MUTATIONS.length).toBeGreaterThanOrEqual(10);
  });

  it('mutation-probe.ts\'s own "cost, recorded rather than hidden" doc comment matches the real MUTATIONS array (q43)', () => {
    // Regression target (q43): the doc comment above `MUTATIONS` in
    // tools/mutation-probe.ts states a running total ("this now runs 23
    // nested `npx vitest run` invocations (8 controls, one per distinct
    // `testFile`, + 15 mutations)") that nothing previously checked against
    // reality — the same "note overstates the coverage it claims" trap this
    // lane has hit at least five times before (q17, q19, q22, q28, q35), just
    // in this file's own header instead of gate-audit.ts's KNOWN_HOLES. This
    // parses the comment's stated numbers and asserts they still agree with
    // MUTATIONS.length / the distinct testFile count, so a future mutation
    // added without updating the comment goes red by name.
    // Collapse block-comment line wrapping (each continuation line starts
    // with " * ") to single spaces before matching — the sentence this test
    // targets wraps across three source lines.
    const source = readFileSync(MUTATION_PROBE_SOURCE, 'utf8').replace(/\r?\n\s*\*\s?/g, ' ');
    const match = source.match(
      /runs (\d+) nested `npx vitest run` invocations \((\d+) controls, one per distinct `testFile`, \+ (\d+) mutations\)/,
    );
    expect(
      match,
      'expected to find the "N nested `npx vitest run` invocations (C controls... + M mutations)" doc comment in tools/mutation-probe.ts — has it been reworded?',
    ).not.toBeNull();
    const [, statedTotal, statedControls, statedMutations] = match!;
    const realMutationCount = MUTATIONS.length;
    const realTestFileCount = new Set(MUTATIONS.map((m) => m.testFile)).size;
    expect(
      Number(statedMutations),
      'doc comment\'s mutation count is stale — update tools/mutation-probe.ts\'s "cost, recorded rather than hidden" comment',
    ).toBe(realMutationCount);
    expect(
      Number(statedControls),
      'doc comment\'s distinct-testFile (control) count is stale — update tools/mutation-probe.ts\'s "cost, recorded rather than hidden" comment',
    ).toBe(realTestFileCount);
    expect(
      Number(statedTotal),
      'doc comment\'s total invocation count no longer equals controls + mutations',
    ).toBe(realTestFileCount + realMutationCount);
  });

  it('every mutation names a file inside its own testFile\'s natural import graph (src/* or tools/*, not tests/data)', () => {
    for (const m of MUTATIONS) {
      expect(
        m.file.startsWith('src/') || m.file.startsWith('tools/'),
        `${m.name}: expected a src/ or tools/ file, got ${m.file}`,
      ).toBe(true);
      expect(m.testFile.startsWith('tests/'), `${m.name}: expected a tests/ file, got ${m.testFile}`).toBe(true);
    }
  });

  const testFiles = [...new Set(MUTATIONS.map((m) => m.testFile))];

  describe.each(testFiles)('control (unmutated): %s', (testFile) => {
    it(
      'passes, so a later red result can only mean the mutation caught it',
      async () => {
        const result = await probeControl(testFile);
        expect(
          result.exitCode,
          `control run for ${testFile} must be green before any mutation's "red" can be trusted:\n${result.stdout}\n${result.stderr}`,
        ).toBe(0);
        // Regression (QA, q14): a probeControl hollowed out to a hardcoded
        // { exitCode: 0, stdout: '' } — never actually running the nested
        // vitest — left every test in this file green, because nothing
        // checked that the control had really executed. A stub can fake the
        // exit code; it cannot fake a real vitest summary line.
        expect(
          result.stdout.length,
          `control run for ${testFile} produced suspiciously little output for a real "vitest run" invocation — is probeControl actually running it?`,
        ).toBeGreaterThan(100);
        expect(
          result.stdout,
          `control run for ${testFile} stdout doesn't look like real vitest output:\n${result.stdout}`,
        ).toMatch(/passed/i);
      },
      180_000,
    );
  });

  describe.each(MUTATIONS)('$name', (m) => {
    it(
      `makes ${m.testFile} fail, and never touches the real ${m.file}`,
      async () => {
        const result = await probeOne(m);
        expect(
          result.testFailed,
          `expected mutation "${m.name}" to make ${m.testFile} fail, but it passed:\n${result.stdout}\n${result.stderr}`,
        ).toBe(true);
        expect(
          result.realFileUntouched,
          `the real ${m.file} must be untouched after probing "${m.name}" — mutation-probe.ts only ever edits a scratch copy`,
        ).toBe(true);
      },
      180_000,
    );
  });

  it('gitDiffClean() in whole-repo mode catches an edit outside the mutated file — a file-scoped diff does not', () => {
    // Regression (QA, q14): probeOne originally checked realFileUntouched
    // via gitDiffClean(m.file) — scoped only to the one file the mutation
    // named. QA proved this has a real blind spot by injecting a bug into
    // applyEdits that also wrote a stray line into the real, tracked
    // BACKLOG-QUALITY.md: probeOne still reported realFileUntouched: true,
    // because it never looked anywhere else. This test proves the whole-repo
    // form (now what probeOne actually uses) sees exactly what the
    // file-scoped form misses, using a dedicated fixture file so nothing
    // else in the suite is touched.
    const before = readFileSync(FIXTURE, 'utf8');
    try {
      expect(gitDiffClean(), 'fixture must start clean or this test proves nothing').toBe(true);
      writeFileSync(FIXTURE, `${before}Q14-REGRESSION-MARKER\n`, 'utf8');
      expect(gitDiffClean(), 'whole-repo gitDiffClean() must see the fixture edit').toBe(false);
      expect(
        gitDiffClean('src/meta/meta.ts'),
        'a diff scoped to an unrelated path must NOT see the fixture edit — this is the exact blind spot the whole-repo check closes',
      ).toBe(true);
    } finally {
      writeFileSync(FIXTURE, before, 'utf8');
    }
    expect(gitDiffClean(), 'fixture must be restored to exactly its original content').toBe(true);
  });

  it('hasNewUntrackedFiles() catches a brand-new untracked file, without requiring the whole repo to already be pristine', () => {
    // Regression (code review, q14): `git diff` alone never reports a file
    // git doesn't already track, so a scratchPath/populateScratch bug that
    // resolved a write outside SCRATCH_ROOT into a new, not-yet-tracked path
    // would pass `gitDiffClean()` undetected. The fix is a baseline-vs-now
    // comparison (`snapshotUntracked`/`hasNewUntrackedFiles`) rather than
    // requiring `git ls-files --others` to be empty outright — this lane's
    // own workflow leaves genuinely untracked files sitting in the tree
    // until the commit that ships them (this item's own two new files are
    // an example), so "zero untracked files anywhere" is not a safe
    // precondition to assert. A baseline taken immediately before the check
    // sidesteps that: it doesn't care how many pre-existing untracked files
    // surround it, only whether one more appears afterward.
    const baseline = snapshotUntracked();
    const strayFile = path.join(ROOT, 'tools', '__q14-untracked-regression-probe__.txt');
    try {
      expect(hasNewUntrackedFiles(baseline), 'no new untracked file yet').toBe(false);
      writeFileSync(strayFile, 'stray untracked file, should never survive this test\n', 'utf8');
      expect(hasNewUntrackedFiles(baseline), 'must detect the new untracked file').toBe(true);
    } finally {
      rmSync(strayFile, { force: true });
    }
    expect(hasNewUntrackedFiles(baseline), 'stray file removed, no longer new').toBe(false);
  });

  it('cleans up every scratch copy it made', () => {
    // Anti-vacuity: the probes above already created scratch dirs under
    // SCRATCH_ROOT (each cleans its own, but the root itself persists until
    // cleanupAllScratch runs) — so this proves scratchRootExists() can read
    // "true" too, not just "false", before trusting the post-cleanup check.
    expect(scratchRootExists(), 'expected a scratch root from the probes above; if this is false the check below proves nothing').toBe(true);
    cleanupAllScratch();
    expect(scratchRootExists()).toBe(false);
  });
});
