/**
 * Mutation smoke probe (BACKLOG-QUALITY q14) — the in-Scope substance of q6.
 *
 * Automates the manual mutation testing qa-playtester has done by hand across
 * the q8 and q9 sessions (PROGRESS.md / BACKLOG-QUALITY.md session logs 4 and
 * 5): apply one named, previously-verified source mutation, run the single
 * test file that originally caught it, and confirm it goes red.
 *
 * Every mutation is applied to a throwaway *copy* of src/tests/tools/data
 * under `bench/.tmp/q14-mutation-scratch/`, never to the real files. That copy
 * lives inside the repo tree on purpose, so Node's own upward node_modules
 * resolution finds the real install without symlinking or reinstalling
 * anything — but the reason it must be a copy at all, rather than mutating
 * the real file and restoring it afterward (which is what q14's acceptance
 * line, written before this was built, originally described), is `npm test`
 * itself: vitest runs many test files concurrently across worker threads, and
 * src/meta/meta.ts, src/sim/run.ts and src/bots/policies.ts — the three files
 * every mutation here touches — are imported by most of the suite. Mutating
 * one of them in place for the ~15-30s a nested vitest run takes, while
 * sibling workers are free to import that same path fresh at any point in the
 * window, would make this file a flake generator for the entire suite rather
 * than a hazard contained to itself. Working on an isolated copy makes that
 * structurally impossible for the *source file itself* instead of merely
 * unlikely: `probeOne` re-checks `git diff --exit-code` against the real file
 * both before and after, so a future edit that "optimizes" this back to
 * in-place mutation trips a clear assertion rather than an intermittent
 * failure two files away. This does not extend to every shared resource — the
 * scratch copies deliberately reuse the real `node_modules` (including its
 * `.vite` dependency-optimization cache) via upward resolution rather than
 * duplicating it, so that cache is genuinely shared, mutable state between a
 * nested probe run and any real `vitest run` happening at the same time. Vite
 * treats concurrent readers/writers of that cache as the normal case (it is
 * multi-process by design), so this has not been observed to cause a failure,
 * but it is not the same "structurally impossible" guarantee as the source
 * files get.
 *
 * The scratch root lives under `bench/`, not `tools/`, for a second, sharper
 * reason found by actually running the full suite rather than reasoning about
 * it: `tests/c7-no-orbs.test.ts` recursively greps every `.ts`/`.json`/`.mjs`
 * file under `src/`, `data/` and `tools/` for leftover Orb-currency
 * vocabulary. A scratch copy of `tests/` sitting under `tools/` while that
 * scan runs concurrently gets walked too, and it legitimately contains the
 * word "orbs" in its own copies of `tests/q3-save-fuzz.test.ts` and
 * `tests/t6c-save-migration.test.ts` (which assert the field is *gone*) and
 * in `tests/c7-no-orbs.test.ts`'s own copied vocabulary list — a real failure
 * this file caused the first time the full suite ran with it in place.
 * `bench/` is outside every directory any shipped scanner walks.
 *
 * A control run (no mutation) against each distinct test file is exported
 * too and is asserted green by the test suite before any mutation's "red" is
 * trusted — otherwise a broken harness (bad cwd, missing config, wrong CLI
 * flag) would make every mutation look "caught" for the wrong reason, the
 * same false-positive shape PROGRESS.md's M18 section warns about ("a
 * positive control rewritten into comparing 0 to 0").
 *
 * Cost, recorded rather than hidden: 8 nested `npx vitest run` invocations
 * (2 controls + 6 mutations) add real wall-clock time to `npm test` — about
 * 230s measured on this host — on top of the ~5 minutes CLAUDE.md already
 * documents. That is the price of testing the tests rather than just the code.
 *
 *   npx tsx tools/mutation-probe.ts             # runs every recorded mutation, prints a table
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// Nested under a directory literally named `.tmp` so the repo's existing
// `.gitignore` rule for "throwaway probe scratch from review/QA passes"
// (`.tmp/`, matched at any depth) covers it without a Scope-violating edit
// to `.gitignore` itself.
const SCRATCH_ROOT = path.join(ROOT, 'bench', '.tmp', 'q14-mutation-scratch');
const COPY_DIRS = ['src', 'tests', 'tools', 'data'];
const COPY_FILES = ['vitest.config.ts', 'tsconfig.json'];
/** Exec timeout for the nested vitest run, kept well under the outer `it()` timeout (see the test file) so a genuine hang reports as a timeout, not a false "caught". */
const NESTED_VITEST_TIMEOUT_MS = 150_000;

export interface MutationEdit {
  readonly find: string;
  readonly replace: string;
}

export interface Mutation {
  readonly name: string;
  /** Repo-relative path, e.g. 'src/meta/meta.ts'. */
  readonly file: string;
  /** Applied in order; each `find` must match exactly once in the current file text. */
  readonly edits: readonly MutationEdit[];
  /** Repo-relative path to the single test file that should catch this mutation. */
  readonly testFile: string;
  /** Where this mutation was first found and hand-verified, for provenance. */
  readonly source: string;
}

/**
 * Six mutations, drawn from the ones qa-playtester actually applied to real
 * `/src` files and reverted while verifying q8 and q9 — not reasoned-about,
 * not synthetic. Each entry's `source` names the session log describing the
 * red count it originally produced.
 */
export const MUTATIONS: Mutation[] = [
  {
    name: 'meta-drop-ember-on-serialize',
    file: 'src/meta/meta.ts',
    edits: [
      {
        find: `export function serializeMeta(meta: MetaState): string {\n  return JSON.stringify({ version: SAVE_VERSION, meta } satisfies SaveFile);\n}`,
        replace: `export function serializeMeta(meta: MetaState): string {\n  const obj = { version: SAVE_VERSION, meta } satisfies SaveFile;\n  delete (obj.meta as unknown as Record<string, unknown>).ember;\n  return JSON.stringify(obj);\n}`,
      },
    ],
    testFile: 'tests/q8-save-roundtrip.test.ts',
    source:
      'BACKLOG-QUALITY.md session 4 log (q8): "dropping `ember` from `serializeMeta`\'s output" — QA confirmed red on the first generated meta.',
  },
  {
    name: 'meta-reverse-migrate-spread-order',
    file: 'src/meta/meta.ts',
    edits: [
      {
        find: `  const out: MetaState = {\n    ...base,\n    ...meta,\n`,
        replace: `  const out: MetaState = {\n    ...meta,\n    ...base,\n`,
      },
    ],
    testFile: 'tests/q8-save-roundtrip.test.ts',
    source:
      'BACKLOG-QUALITY.md session 4 log (q8): "reversing `migrate`\'s spread order (`{...meta, ...base}`)" — QA confirmed red on the first generated meta.',
  },
  {
    name: 'meta-drop-unlocked-classes-after-merge',
    file: 'src/meta/meta.ts',
    edits: [
      {
        find: `  };\n  if (!out.allocated.includes(0)) out.allocated.unshift(0);`,
        replace: `  };\n  delete (out as unknown as Record<string, unknown>).unlockedClasses;\n  if (!out.allocated.includes(0)) out.allocated.unshift(0);`,
      },
    ],
    testFile: 'tests/q8-save-roundtrip.test.ts',
    source:
      'BACKLOG-QUALITY.md session 4 log (q8): "deleting `unlockedClasses` after the merge" — QA confirmed red on the first generated meta.',
  },
  {
    name: 'run-completeWave-never-enters-dusk',
    file: 'src/sim/run.ts',
    edits: [
      {
        find: `  if (w.wave >= cycleWaveEnd(w, w.cycle)) {\n    w.phase = 'dusk';`,
        replace: `  if (false && w.wave >= cycleWaveEnd(w, w.cycle)) {\n    w.phase = 'dusk';`,
      },
    ],
    testFile: 'tests/q9-phase-coverage.test.ts',
    source:
      'BACKLOG-QUALITY.md session 5 log (q9): "forced `completeWave` in `src/sim/run.ts` to never enter dusk (11/16 red, exactly the dusk/act2/levelup/dawn-dependent tests)".',
  },
  {
    name: 'run-dawn-trigger-fires-immediately',
    file: 'src/sim/run.ts',
    edits: [
      {
        find: `  } else if (!w.dying && w.act2Time >= nightLengthSeconds(w, w.cycle)) {`,
        replace: `  } else if (!w.dying && w.act2Time >= 1) {`,
      },
    ],
    testFile: 'tests/q9-phase-coverage.test.ts',
    source:
      'BACKLOG-QUALITY.md session 5 log (q9): "moved the dawn trigger in `updateAct2` to fire almost immediately so `levelup` is skipped (11/16 red, `levelup` gone and `dawn` appearing where it shouldn\'t)".',
  },
  {
    name: 'policies-hybrid-rebound-to-idle',
    file: 'src/bots/policies.ts',
    edits: [
      {
        find: `import { registerPolicy, type BotPolicy } from './policy';`,
        replace: `import { registerPolicy, IdlePolicy, type BotPolicy } from './policy';`,
      },
      {
        find: `registerPolicy('hybrid', () => new BuilderPolicy('hybrid', { ...HYBRID_BUILD, act2: 'kite' }));`,
        replace: `registerPolicy('hybrid', () => new IdlePolicy());`,
      },
    ],
    testFile: 'tests/q9-phase-coverage.test.ts',
    source:
      'BACKLOG-QUALITY.md session 5 log (q9): "rebound `hybrid`\'s registration in `src/bots/policies.ts` to `IdlePolicy` (exactly 2/16 red — hybrid\'s own floor test and the exact-set test for hybrid only)".',
  },
];

export interface ProbeResult {
  readonly name: string;
  readonly testFailed: boolean;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  /**
   * True unless something reached into the real, non-scratch working tree —
   * checked as a *whole-repo* `git diff --exit-code` (not just `m.file`, see
   * `gitDiffClean`'s doc comment for why the narrower check is not enough)
   * plus a check that no new untracked file appeared since the probe started
   * (`hasNewUntrackedFiles`, which `git diff` alone cannot see). Should
   * always be true by construction.
   *
   * Known asymmetry (QA, this item): this catches a real file gaining an
   * edit or a new untracked file appearing, but not a pre-existing untracked
   * file *disappearing* — `populateScratch` opens with a recursive
   * `removeDir(dir)`, so a `scratchPath` computation bug that ever resolved
   * outside `SCRATCH_ROOT` onto a real untracked path would delete it
   * silently, with neither `git diff` (never tracked it) nor
   * `hasNewUntrackedFiles` (checks for arrivals, not departures) noticing.
   * None of the six recorded `MUTATIONS` touches `scratchPath`/`populateScratch`
   * so this does not affect what q14 actually probes today; recorded here so
   * a future extension of this file's public surface doesn't over-trust the
   * guarantee this field name implies.
   */
  readonly realFileUntouched: boolean;
}

/**
 * `pathspec` omitted diffs the whole working tree; passed, it limits the diff
 * to that one path. Exported (and used with no argument for `probeOne`'s
 * post-mutation check) because a file-scoped check has a real blind spot a
 * QA pass on q14 found by injecting a bug into `applyEdits` that also wrote
 * into a real, unrelated tracked file (`BACKLOG-QUALITY.md`): `probeOne`
 * reported `realFileUntouched: true` because it only ever diffed `m.file`,
 * while the actual working tree was dirty elsewhere. `tests/q14-mutation-smoke.test.ts`
 * has a regression test against a dedicated fixture file proving the
 * whole-repo form catches what the file-scoped form misses.
 *
 * `git diff` only ever reports changes to files git already tracks — it says
 * nothing about a brand-new file landing in the real tree, which is exactly
 * the shape a scratch-path computation bug (`scratchPath`, `populateScratch`)
 * could produce if it ever resolved outside `SCRATCH_ROOT` (code review, this
 * item). `hasNewUntrackedFiles`/`snapshotUntracked` below cover that case
 * separately, compared against a baseline taken before the probe runs —
 * not folded into this function, because "zero untracked files anywhere in
 * the repo" is not a precondition this lane's own workflow can promise (this
 * item's own two new files are themselves untracked until the commit that
 * ships them), where "no *new* untracked file appeared since this probe
 * started" is.
 */
export function gitDiffClean(pathspec?: string): boolean {
  const scope = pathspec === undefined ? [] : ['--', pathspec];
  try {
    execFileSync('git', ['diff', '--exit-code', ...scope], { cwd: ROOT, stdio: 'pipe' });
    execFileSync('git', ['diff', '--cached', '--exit-code', ...scope], { cwd: ROOT, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * The set of untracked-and-not-gitignored repo-relative paths right now
 * (`git ls-files --others --exclude-standard`). `--exclude-standard` means a
 * file under an already-ignored path (the scratch root, `bench/.tmp/`
 * generally) never appears here — only something git would list under
 * "Untracked files" in `git status`. Exported so a caller can snapshot a
 * baseline before an operation and diff against it afterward, rather than
 * requiring the whole repo to already be pristine.
 */
export function snapshotUntracked(): Set<string> {
  const out = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: ROOT, stdio: 'pipe' }).toString();
  return new Set(out.split(/\r?\n/).filter((l) => l.length > 0));
}

/** True if any path present now was absent from `baseline` — a genuinely new untracked file, regardless of how many pre-existing ones surround it. */
export function hasNewUntrackedFiles(baseline: ReadonlySet<string>): boolean {
  const now = snapshotUntracked();
  for (const f of now) {
    if (!baseline.has(f)) return true;
  }
  return false;
}

function slug(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, '-');
}

/** A not-yet-created scratch path, computed with no I/O so callers can clean it up even if populating it fails partway. */
function scratchPath(name: string): string {
  return path.join(SCRATCH_ROOT, `${slug(name)}-${process.pid}-${Math.random().toString(36).slice(2)}`);
}

/**
 * Fills `dir` with a fresh, isolated copy of src/tests/tools/data. `dir`
 * lives inside the repo (under `bench/`, not one of the four copied
 * directories) so Node's own node_modules resolution still finds the real
 * install by walking upward, without symlinking or reinstalling anything.
 */
/**
 * `maxRetries`/`retryDelay` make `rmSync` retry on EBUSY/EMFILE/ENFILE/
 * ENOTEMPTY/EPERM instead of throwing immediately — on Windows a just-exited
 * nested `vitest`/esbuild worker process can hold a scratch file's handle
 * open for a few milliseconds after `execFileSync` returns, and under real
 * `npm test`-scale contention (many worker threads, more scheduler noise)
 * that window is long enough to matter: measured directly, a full-suite run
 * hit `EPERM` removing `SCRATCH_ROOT` where the same code standalone did not.
 * Same host-contention lesson as q13's perf-ratio probe (BACKLOG-QUALITY.md
 * session 9 log) — found by actually running under load, not by reasoning
 * about it.
 */
const RM_RETRY = { recursive: true, force: true, maxRetries: 5, retryDelay: 200 } as const;

function removeDir(dir: string): void {
  rmSync(dir, RM_RETRY);
}

function populateScratch(dir: string): void {
  removeDir(dir);
  mkdirSync(dir, { recursive: true });
  for (const d of COPY_DIRS) {
    cpSync(path.join(ROOT, d), path.join(dir, d), { recursive: true });
  }
  for (const f of COPY_FILES) {
    cpSync(path.join(ROOT, f), path.join(dir, f));
  }
}

/** Removes every scratch copy this probe has ever left behind (defensive; normally each call cleans its own). */
export function cleanupAllScratch(): void {
  removeDir(SCRATCH_ROOT);
}

/** Whether any scratch directory is currently on disk — lets a test assert cleanup actually happened, not just that it didn't throw. */
export function scratchRootExists(): boolean {
  return existsSync(SCRATCH_ROOT);
}

function applyEdits(scratchDir: string, file: string, edits: readonly MutationEdit[]): void {
  const full = path.join(scratchDir, file);
  let text = readFileSync(full, 'utf8');
  // Mutation `find`/`replace` templates are authored with plain `\n` for
  // readability; the repo's own source files are checked out with CRLF line
  // endings on this platform, so translate before matching rather than
  // making every template carry `\r\n` by hand.
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  for (const { find, replace } of edits) {
    const f = eol === '\r\n' ? find.replace(/\n/g, eol) : find;
    const r = eol === '\r\n' ? replace.replace(/\n/g, eol) : replace;
    const count = text.split(f).length - 1;
    if (count !== 1) {
      throw new Error(
        `mutation-probe: expected exactly one occurrence of an anchor in ${file}, found ${count}. ` +
          'The source has drifted since this mutation was recorded — update tools/mutation-probe.ts.',
      );
    }
    text = text.replace(f, r);
  }
  writeFileSync(full, text, 'utf8');
}

/**
 * A timed-out or killed child is not a "the mutation was caught" result — it
 * is the harness failing to answer the question at all, and coercing it to a
 * plain nonzero exit code would make it indistinguishable from a real catch.
 * Thrown rather than returned, so a probe never silently reports success.
 */
class NestedVitestTimeout extends Error {}

function runVitest(scratchDir: string, testFile: string): { exitCode: number; stdout: string; stderr: string } {
  try {
    const out = execFileSync('npx', ['vitest', 'run', testFile], {
      cwd: scratchDir,
      shell: true,
      stdio: 'pipe',
      timeout: NESTED_VITEST_TIMEOUT_MS,
      env: { ...process.env },
    });
    return { exitCode: 0, stdout: out.toString(), stderr: '' };
  } catch (err) {
    const e = err as { status?: number | null; signal?: string | null; killed?: boolean; stdout?: Buffer | string; stderr?: Buffer | string };
    if (e.killed || e.signal) {
      throw new NestedVitestTimeout(
        `mutation-probe: nested "npx vitest run ${testFile}" in ${scratchDir} was killed (signal ${e.signal ?? 'unknown'}), ` +
          `most likely the ${NESTED_VITEST_TIMEOUT_MS}ms exec timeout — this is a harness failure, not a caught mutation.`,
      );
    }
    return {
      exitCode: typeof e.status === 'number' ? e.status : 1,
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? '',
    };
  }
}

/** Runs `testFile` against an unmutated scratch copy — must pass, or the harness itself is broken. */
export function probeControl(testFile: string): ProbeResult {
  const scratchDir = scratchPath(`control-${testFile}`);
  try {
    populateScratch(scratchDir);
    const { exitCode, stdout, stderr } = runVitest(scratchDir, testFile);
    return { name: `control:${testFile}`, testFailed: exitCode !== 0, exitCode, stdout, stderr, realFileUntouched: true };
  } finally {
    removeDir(scratchDir);
  }
}

/** Applies `m` to a scratch copy only, runs its test file there, and proves the real repo file was never touched. */
export function probeOne(m: Mutation): ProbeResult {
  if (!gitDiffClean(m.file)) {
    throw new Error(
      `mutation-probe: refusing to run "${m.name}" — the real ${m.file} already has uncommitted changes; commit or stash them first.`,
    );
  }
  const untrackedBaseline = snapshotUntracked();
  const scratchDir = scratchPath(m.name);
  let exitCode = -1;
  let stdout = '';
  let stderr = '';
  try {
    populateScratch(scratchDir);
    applyEdits(scratchDir, m.file, m.edits);
    ({ exitCode, stdout, stderr } = runVitest(scratchDir, m.testFile));
  } finally {
    removeDir(scratchDir);
  }
  const realFileUntouched = gitDiffClean() && !hasNewUntrackedFiles(untrackedBaseline);
  return { name: m.name, testFailed: exitCode !== 0, exitCode, stdout, stderr, realFileUntouched };
}

export function probeAll(mutations: readonly Mutation[] = MUTATIONS): ProbeResult[] {
  return mutations.map(probeOne);
}

/* --------------------------------------------------------------------- CLI */

function main(): void {
  const testFiles = [...new Set(MUTATIONS.map((m) => m.testFile))];
  let failures = 0;

  // Sweep any orphan left by a prior run that was hard-killed mid-probe
  // (Ctrl+C, CI timeout, OOM) before starting — otherwise nothing reclaims it
  // until the next run reaches its own clean exit. QA (q14) confirmed a
  // killed run does leave one behind on disk.
  cleanupAllScratch();

  try {
    for (const tf of testFiles) {
      const r = probeControl(tf);
      const ok = r.exitCode === 0;
      if (!ok) failures++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} control  ${tf}${ok ? '' : ` (exit ${r.exitCode})`}`);
    }

    for (const m of MUTATIONS) {
      const r = probeOne(m);
      const ok = r.testFailed && r.realFileUntouched;
      if (!ok) failures++;
      console.log(
        `${ok ? 'ok  ' : 'FAIL'} ${m.name.padEnd(38)} test ${r.testFailed ? 'failed (caught)' : 'PASSED (missed!)'}, real file ${
          r.realFileUntouched ? 'untouched' : 'DIRTY'
        }`,
      );
    }
  } finally {
    // Belt-and-suspenders: every probeControl/probeOne call already cleans up
    // its own scratch dir on its own way out, but a thrown NestedVitestTimeout
    // (or anything else escaping the loop above) must not skip this — a stray
    // copy of src/tests/tools/data left on disk is the exact hazard the whole
    // scratch-copy design exists to avoid.
    cleanupAllScratch();
  }
  console.log(`\n${MUTATIONS.length + testFiles.length - failures}/${MUTATIONS.length + testFiles.length} probes green`);
  process.exit(failures === 0 ? 0 : 1);
}

const entry = (process.argv[1] ?? '').replace(/\\/g, '/');
if (entry.endsWith('tools/mutation-probe.ts')) main();
