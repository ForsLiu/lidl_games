/**
 * CLI failure-path coverage for `tools/gate-audit.ts`, `tools/phase-coverage.ts`
 * and `tools/soak.ts` (BACKLOG-QUALITY q28).
 *
 * q25's own commit note claimed "every sibling CLI in this lane
 * (`tools/gate-audit.ts`, `tools/phase-coverage.ts`, `tools/soak.ts`) handles
 * its own failure path" — checked this session by reading each `main()`
 * directly rather than trusting the note, and the claim was wrong for all
 * three:
 *
 *   - `gate-audit.ts`'s `main()` called `readFileSync(SPEC_PATH, 'utf8')`
 *     with no try/catch — a missing/unreadable SPEC-FINAL.md crashed with a
 *     raw ENOENT stack trace.
 *   - `phase-coverage.ts`'s `main()` called `census(shippedPolicies(), ...)`
 *     with no try/catch; `census` constructs a `Run` (hence calls
 *     `loadContent()`) before anything catches, so a `/data` corruption
 *     crashed the same way `content-census.ts` did before q25.
 *   - `soak.ts`'s `soakOne` constructed `new Run(cfg)` one line *before* its
 *     own `try` block, so a `/data` corruption at construction propagated
 *     straight out of `soakOne`, uncaught, past `soak()` and `main()` alike —
 *     q23's `maxTicks`/`scanEvery` guards did not cover this path.
 *
 * Verified live before writing this test: ran each pre-fix CLI (`git stash`)
 * against a scratch copy with a corrupted/missing input and confirmed a raw
 * crash in each case, then reverted. This test drives the same shapes
 * against the shipped (fixed) CLIs and pins the clean behaviour instead,
 * reusing `tests/q25-content-census-cli.test.ts`'s scratch/corruption idiom.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRATCH_ROOT = path.join(ROOT, 'bench', '.tmp', 'q28-cli-error-handling-scratch');
const COPY_DIRS = ['src', 'tools', 'data'];
const COPY_FILES = ['tsconfig.json', 'SPEC-FINAL.md', 'BACKLOG-QUALITY.md'];
// b029: measured ~40-42s standalone/lightly-loaded for phase-coverage.ts's
// control case (the slowest CLI here); under full `test:fast` parallel load
// it exceeded the old 60_000ms budget and execFileSync killed it (SIGTERM ->
// status null -> mapped to exitCode 1 with empty stdout/stderr, indistinguishable
// from a real CLI failure). 120_000ms gives ~3x the measured baseline instead
// of ~1.5x.
const NESTED_TSX_TIMEOUT_MS = 120_000;

// b029: fs.rmSync's own maxRetries/retryDelay only cover rmSync/rmdirSync —
// mkdirSync/cpSync/writeFileSync/unlinkSync on this same scratch tree have no
// such protection, so a lingering Windows AV/indexer handle from the just-
// exited nested `npx tsx` process (q49's documented "a few ms" hold, worse
// under concurrent full-suite load) can throw EPERM/EBUSY on any of them with
// no retry at all. withEpermRetry gives every scratch-tree fs call the same
// bounded backoff rmSync already gets.
const RM_RETRY = { recursive: true, force: true, maxRetries: 8, retryDelay: 250 } as const;
const EPERM_RETRY_CODES = new Set(['EPERM', 'EBUSY', 'ENOTEMPTY', 'EACCES']);

function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withEpermRetry<T>(fn: () => T, attempts = 8, delayMs = 250): T {
  for (let attempt = 1; ; attempt++) {
    try {
      return fn();
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt >= attempts || !code || !EPERM_RETRY_CODES.has(code)) throw err;
      sleepMs(delayMs);
    }
  }
}

function scratchPath(name: string): string {
  return path.join(SCRATCH_ROOT, `${name}-${process.pid}-${Math.random().toString(36).slice(2)}`);
}

/**
 * b029: cleanup is best-effort. Every scratch path is unique (pid + random
 * suffix, `scratchPath` above), so a directory this fails to remove can never
 * collide with a future run — only a failure to create or populate one is a
 * real bug. Confirmed live (2026-09-01 `test:fast` run under full concurrent
 * load) that even a generous bounded `rmSync` retry budget can still lose to
 * a lingering Windows Defender/indexer handle; letting that fail the whole
 * test over disk tidiness is the actual bug `withEpermRetry` alone doesn't
 * fix, since `rmSync`'s own retry already covers this call and still lost.
 */
function cleanupScratch(dir: string, remove: (d: string) => void = (d) => rmSync(d, RM_RETRY)): void {
  try {
    remove(dir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (!code || !EPERM_RETRY_CODES.has(code)) throw err;
    console.warn(`q28: scratch cleanup failed for ${dir}: ${(err as Error).message}`);
  }
}

function populateScratch(dir: string): void {
  rmSync(dir, RM_RETRY);
  withEpermRetry(() => mkdirSync(dir, { recursive: true }));
  for (const d of COPY_DIRS) {
    withEpermRetry(() => cpSync(path.join(ROOT, d), path.join(dir, d), { recursive: true }));
  }
  for (const f of COPY_FILES) withEpermRetry(() => cpSync(path.join(ROOT, f), path.join(dir, f)));
}

/** Same corruption q25 uses: a schema violation, not a JSON syntax error, so it surfaces inside `loadContent()` at runtime rather than at static import. */
function corruptTowersData(dir: string): void {
  const p = path.join(dir, 'data', 'towers.json');
  const j = JSON.parse(withEpermRetry(() => readFileSync(p, 'utf8')));
  j.upgradeStepMul = 'broken';
  withEpermRetry(() => writeFileSync(p, JSON.stringify(j, null, 2)));
}

function deleteSpec(dir: string): void {
  withEpermRetry(() => unlinkSync(path.join(dir, 'SPEC-FINAL.md')));
}

function runCli(
  dir: string,
  tool: string,
  args: string[],
): { exitCode: number; stdout: string; stderr: string } {
  try {
    const out = execFileSync('npx', ['tsx', `tools/${tool}`, ...args], {
      cwd: dir,
      shell: true,
      stdio: 'pipe',
      timeout: NESTED_TSX_TIMEOUT_MS,
      env: { ...process.env },
    });
    return { exitCode: 0, stdout: out.toString(), stderr: '' };
  } catch (err) {
    const e = err as { status?: number | null; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      exitCode: typeof e.status === 'number' ? e.status : 1,
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? '',
    };
  }
}

const NO_RAW_CRASH = /\bat \S+ \(/;

describe('withEpermRetry (b029)', () => {
  it('retries a transient EPERM/EBUSY and returns the eventual success', () => {
    let calls = 0;
    const result = withEpermRetry(() => {
      calls += 1;
      if (calls < 3) {
        const err = new Error('busy') as NodeJS.ErrnoException;
        err.code = calls === 1 ? 'EPERM' : 'EBUSY';
        throw err;
      }
      return 'ok';
    }, 8, 1);
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('gives up and rethrows after exhausting its attempt budget', () => {
    let calls = 0;
    expect(() =>
      withEpermRetry(() => {
        calls += 1;
        const err = new Error('always busy') as NodeJS.ErrnoException;
        err.code = 'EPERM';
        throw err;
      }, 3, 1),
    ).toThrow('always busy');
    expect(calls).toBe(3);
  });

  it('does not retry a non-transient error code', () => {
    let calls = 0;
    expect(() =>
      withEpermRetry(() => {
        calls += 1;
        const err = new Error('missing') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
      }, 8, 1),
    ).toThrow('missing');
    expect(calls).toBe(1);
  });
});

describe('cleanupScratch (b029)', () => {
  it('swallows a removal failure and warns instead of failing the test', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const err = new Error('boom') as NodeJS.ErrnoException;
    err.code = 'EPERM';
    expect(() =>
      cleanupScratch('some/scratch/dir', () => {
        throw err;
      }),
    ).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('some/scratch/dir');
    warn.mockRestore();
  });

  it('still removes the directory on the ordinary success path', () => {
    let calledWith = '';
    cleanupScratch('some/scratch/dir', (d) => {
      calledWith = d;
    });
    expect(calledWith).toBe('some/scratch/dir');
  });
});

describe('gate-audit.ts CLI failure path (q28)', () => {
  it('a clean scratch snapshot exits 0 (harness control)', () => {
    const dir = scratchPath('gate-audit-control');
    try {
      populateScratch(dir);
      const { exitCode, stdout, stderr } = runCli(dir, 'gate-audit.ts', []);
      expect(stderr, stderr).toBe('');
      expect(exitCode).toBe(0);
      expect(stdout).toContain('gate audit');
    } finally {
      cleanupScratch(dir);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);

  it('a missing SPEC-FINAL.md exits nonzero with a one-line message, not a raw stack trace', () => {
    const dir = scratchPath('gate-audit-missing-spec');
    try {
      populateScratch(dir);
      deleteSpec(dir);
      const { exitCode, stdout, stderr } = runCli(dir, 'gate-audit.ts', []);
      expect(exitCode).not.toBe(0);
      expect(stdout).toBe('');
      expect(stderr).toContain('gate-audit:');
      expect(stderr.trim().split('\n')).toHaveLength(1);
      expect(stderr).not.toMatch(NO_RAW_CRASH);
    } finally {
      cleanupScratch(dir);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);

  it('a missing SPEC-FINAL.md under --json exits nonzero with a parseable {error} object', () => {
    const dir = scratchPath('gate-audit-missing-spec-json');
    try {
      populateScratch(dir);
      deleteSpec(dir);
      const { exitCode, stdout, stderr } = runCli(dir, 'gate-audit.ts', ['--json']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toBe('');
      expect(stdout.trim().split('\n')).toHaveLength(1);
      const parsed = JSON.parse(stdout);
      expect(typeof parsed.error).toBe('string');
    } finally {
      cleanupScratch(dir);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);
});

describe('phase-coverage.ts CLI failure path (q28)', () => {
  it('a clean scratch snapshot exits 0 (harness control)', () => {
    const dir = scratchPath('phase-coverage-control');
    try {
      populateScratch(dir);
      const { exitCode, stdout, stderr } = runCli(dir, 'phase-coverage.ts', ['--seeds', '1']);
      expect(stderr, stderr).toBe('');
      expect(exitCode).toBe(0);
      expect(stdout).toContain('phase coverage');
    } finally {
      cleanupScratch(dir);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);

  it('a corrupted /data snapshot exits nonzero with a one-line message, not a raw stack trace', () => {
    const dir = scratchPath('phase-coverage-corrupt');
    try {
      populateScratch(dir);
      corruptTowersData(dir);
      const { exitCode, stdout, stderr } = runCli(dir, 'phase-coverage.ts', ['--seeds', '1']);
      expect(exitCode).not.toBe(0);
      expect(stdout).toBe('');
      expect(stderr).toContain('phase-coverage:');
      expect(stderr).toContain('upgradeStepMul');
      expect(stderr.trim().split('\n')).toHaveLength(1);
      expect(stderr).not.toMatch(NO_RAW_CRASH);
      expect(stderr).not.toContain('ZodError');
    } finally {
      cleanupScratch(dir);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);

  it('a corrupted /data snapshot under --json exits nonzero with a parseable {error} object', () => {
    const dir = scratchPath('phase-coverage-corrupt-json');
    try {
      populateScratch(dir);
      corruptTowersData(dir);
      const { exitCode, stdout, stderr } = runCli(dir, 'phase-coverage.ts', ['--seeds', '1', '--json']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toBe('');
      expect(stdout.trim().split('\n')).toHaveLength(1);
      const parsed = JSON.parse(stdout);
      expect(typeof parsed.error).toBe('string');
      expect(parsed.error).toContain('upgradeStepMul');
    } finally {
      cleanupScratch(dir);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);
});

describe('soak.ts CLI failure path (q28)', () => {
  it('a clean scratch snapshot exits 0 (harness control)', () => {
    const dir = scratchPath('soak-control');
    try {
      populateScratch(dir);
      const { exitCode, stdout, stderr } = runCli(dir, 'soak.ts', ['--seeds', '1']);
      expect(stderr, stderr).toBe('');
      expect(exitCode).toBe(0);
      expect(stdout).toContain('clean');
    } finally {
      cleanupScratch(dir);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);

  /**
   * The distinguishing signal here is not exit code (an uncaught Node
   * exception also exits 1) — it's whether `main()` ever reaches its own
   * output at all. Pre-fix, `new Run(cfg)` threw straight out of `soakOne`
   * on the very first seed, so the process crashed before printing a single
   * "ok"/"FAIL" line or the "N/M clean" summary. Post-fix, `soakOne` catches
   * the construction failure and returns a normal `SoakResult` with
   * `threw: true`, so `main()` completes and prints its usual summary line
   * even though that seed failed.
   */
  it('a corrupted /data snapshot is reported as a failed seed, not an uncaught crash', () => {
    const dir = scratchPath('soak-corrupt');
    try {
      populateScratch(dir);
      corruptTowersData(dir);
      const { exitCode, stdout } = runCli(dir, 'soak.ts', ['--seeds', '1']);
      expect(exitCode).not.toBe(0);
      // The distinguishing assertion, not the exit code (see doc comment
      // above): `main()` reached its own "FAIL ..." line and printed the
      // "N/M clean" summary — proof the process did not crash before
      // getting there. The diagnostic legitimately embeds the underlying
      // error (including its name/stack) as `soakOne`'s captured detail
      // string; that is expected content, not a raw uncaught-exception dump.
      expect(stdout).toContain('FAIL seed 1 policy');
      expect(stdout).toContain('construction threw');
      expect(stdout).toMatch(/\d+\/\d+ clean/);
    } finally {
      cleanupScratch(dir);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);

  it('the same corruption under --json still yields one parseable array with threw:true', () => {
    const dir = scratchPath('soak-corrupt-json');
    try {
      populateScratch(dir);
      corruptTowersData(dir);
      const { exitCode, stdout } = runCli(dir, 'soak.ts', ['--seeds', '1', '--json']);
      expect(exitCode).not.toBe(0);
      const parsed = JSON.parse(stdout);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].threw).toBe(true);
      expect(parsed[0].problems.join(' ')).toContain('upgradeStepMul');
    } finally {
      cleanupScratch(dir);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);
});

/**
 * `tools/sim.ts` (BACKLOG b014's qa-playtester verification pass): b014 gave
 * `sim.ts` a top-level-await dynamic import guarding against a JSON *syntax*
 * error at module load, but `main()` itself had no try/catch around
 * `runOne()` — so a *schema* violation (a retyped field, still valid JSON,
 * the same corruption this file's `corruptTowersData` applies) still threw
 * an uncaught, raw multi-line `ZodError` dump once `new Run(cfg)` reached
 * `loadContent()`'s zod parse at runtime, unlike `phase-coverage.ts`/
 * `soak.ts` above, which already caught this. Fixed in the same commit by
 * wrapping `main()`'s body in a try/catch, matching this file's own
 * `<tool>: <message>` convention.
 */
describe('sim.ts CLI failure path (b014)', () => {
  it('a clean scratch snapshot exits 0 (harness control)', () => {
    const dir = scratchPath('sim-control');
    try {
      populateScratch(dir);
      const { exitCode, stdout, stderr } = runCli(dir, 'sim.ts', ['--seed', '1', '--policy', 'hybrid']);
      expect(stderr, stderr).toBe('');
      expect(exitCode).toBe(0);
      const report = JSON.parse(stdout);
      expect(typeof report.outcome).toBe('string');
    } finally {
      cleanupScratch(dir);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);

  it('a corrupted /data snapshot exits nonzero with a one-line message, not a raw ZodError dump', () => {
    const dir = scratchPath('sim-corrupt');
    try {
      populateScratch(dir);
      corruptTowersData(dir);
      const { exitCode, stdout, stderr } = runCli(dir, 'sim.ts', ['--seed', '1', '--policy', 'hybrid']);
      expect(exitCode).not.toBe(0);
      expect(stdout).toBe('');
      expect(stderr).toContain('sim:');
      expect(stderr).toContain('upgradeStepMul');
      expect(stderr.trim().split('\n')).toHaveLength(1);
      expect(stderr).not.toMatch(NO_RAW_CRASH);
      expect(stderr).not.toContain('ZodError');
    } finally {
      cleanupScratch(dir);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);
});
