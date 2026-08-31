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

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRATCH_ROOT = path.join(ROOT, 'bench', '.tmp', 'q28-cli-error-handling-scratch');
const COPY_DIRS = ['src', 'tools', 'data'];
const COPY_FILES = ['tsconfig.json', 'SPEC-FINAL.md', 'BACKLOG-QUALITY.md'];
const NESTED_TSX_TIMEOUT_MS = 60_000;

const RM_RETRY = { recursive: true, force: true, maxRetries: 5, retryDelay: 200 } as const;

function scratchPath(name: string): string {
  return path.join(SCRATCH_ROOT, `${name}-${process.pid}-${Math.random().toString(36).slice(2)}`);
}

function populateScratch(dir: string): void {
  rmSync(dir, RM_RETRY);
  mkdirSync(dir, { recursive: true });
  for (const d of COPY_DIRS) cpSync(path.join(ROOT, d), path.join(dir, d), { recursive: true });
  for (const f of COPY_FILES) cpSync(path.join(ROOT, f), path.join(dir, f));
}

/** Same corruption q25 uses: a schema violation, not a JSON syntax error, so it surfaces inside `loadContent()` at runtime rather than at static import. */
function corruptTowersData(dir: string): void {
  const p = path.join(dir, 'data', 'towers.json');
  const j = JSON.parse(readFileSync(p, 'utf8'));
  j.upgradeStepMul = 'broken';
  writeFileSync(p, JSON.stringify(j, null, 2));
}

function deleteSpec(dir: string): void {
  unlinkSync(path.join(dir, 'SPEC-FINAL.md'));
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
      rmSync(dir, RM_RETRY);
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
      rmSync(dir, RM_RETRY);
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
      rmSync(dir, RM_RETRY);
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
      rmSync(dir, RM_RETRY);
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
      rmSync(dir, RM_RETRY);
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
      rmSync(dir, RM_RETRY);
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
      rmSync(dir, RM_RETRY);
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
      rmSync(dir, RM_RETRY);
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
      rmSync(dir, RM_RETRY);
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
      rmSync(dir, RM_RETRY);
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
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);
});
