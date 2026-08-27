/**
 * CLI failure-path coverage for tools/content-census.ts (BACKLOG-QUALITY q25).
 *
 * Session 13 QA recorded, but didn't file, that `main()` had no try/catch
 * around `loadContent()`/`census()`: a `/data` corruption failure would crash
 * with a raw multi-line stack trace instead of a clean CLI message, and
 * `--json` mode would emit nothing parseable. Not reachable by anything
 * shipped today — `loadContent()` only throws on invalid `/data`, already
 * guarded at every other call site — but every sibling CLI in this lane
 * (`tools/soak.ts`, `tools/phase-coverage.ts`) validates its own inputs and
 * fails with a `usage()`-shaped message rather than an uncaught throw, and
 * `content-census.ts` was the one CLI that didn't handle its own load
 * failure at all.
 *
 * Verified live before writing this test, in a throwaway scratch copy (not
 * part of the suite): checked out the pre-fix `tools/content-census.ts`
 * (`git show HEAD:tools/content-census.ts`) against a scratch copy of
 * `src`/`tools`/`data` with a corrupted `data/towers.json`
 * (`upgradeStepMul` retyped to a string, which fails `TowersFileSchema`'s
 * `zod` parse at runtime — the JSON itself stays syntactically valid, so the
 * failure surfaces inside `main()`'s call to `census()`, not at the static
 * JSON import) and confirmed it crashed with a raw `ZodError` + multi-frame
 * Node stack trace, exit code 1, for both plain and `--json` invocation.
 * This test drives the same scratch/corruption shape against the shipped
 * (fixed) CLI and pins the clean behavior instead.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// `.tmp` at any depth is already `.gitignore`d (see tools/mutation-probe.ts's
// identical rationale) and lives under `bench/`, inside this lane's Scope.
const SCRATCH_ROOT = path.join(ROOT, 'bench', '.tmp', 'q25-content-census-cli-scratch');
const COPY_DIRS = ['src', 'tools', 'data'];
const COPY_FILES = ['tsconfig.json'];
const NESTED_TSX_TIMEOUT_MS = 60_000;

// Windows can hold a just-exited nested process's file handle open for a few
// ms after execFileSync returns (tools/mutation-probe.ts hit the same EBUSY/
// EPERM shape under load) — retry rather than fail cleanup.
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

/**
 * Retypes `upgradeStepMul` to a string so `TowersFileSchema`'s `zod` parse
 * fails inside `loadContent()` at runtime. Deliberately a schema violation,
 * not a JSON syntax error: `content.ts` imports every /data file as a static
 * ES module (`import towersRaw from '../../data/towers.json'`), so a syntax
 * error would throw during module load, before `main()`'s try/catch ever
 * gets a chance to run — that would test Node's own import machinery, not
 * this CLI's error handling.
 */
function corruptTowersData(dir: string): void {
  const p = path.join(dir, 'data', 'towers.json');
  const j = JSON.parse(readFileSync(p, 'utf8'));
  j.upgradeStepMul = 'broken';
  writeFileSync(p, JSON.stringify(j, null, 2));
}

function runCli(dir: string, args: string[]): { exitCode: number; stdout: string; stderr: string } {
  try {
    const out = execFileSync('npx', ['tsx', 'tools/content-census.ts', ...args], {
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

describe('content-census CLI failure path (q25)', () => {
  it('a clean /data snapshot exits 0 with the normal table (harness control)', () => {
    const dir = scratchPath('control');
    try {
      populateScratch(dir);
      const { exitCode, stdout, stderr } = runCli(dir, []);
      expect(stderr, stderr).toBe('');
      expect(exitCode).toBe(0);
      expect(stdout).toContain('content census');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);

  it('a corrupted /data snapshot exits nonzero with a one-line message, not a raw stack trace', () => {
    const dir = scratchPath('corrupt-text');
    try {
      populateScratch(dir);
      corruptTowersData(dir);
      const { exitCode, stdout, stderr } = runCli(dir, []);
      expect(exitCode).not.toBe(0);
      expect(stdout).toBe('');
      expect(stderr).toContain('content-census:');
      expect(stderr).toContain('upgradeStepMul');
      expect(stderr.trim().split('\n')).toHaveLength(1);
      // Node's own uncaught-exception crash prints multi-frame stack traces
      // shaped like "at functionName (file:line:col)" plus the "ZodError"
      // constructor name inline with the thrown value — this is the literal
      // shape the pre-fix CLI produced (confirmed live, see file doc
      // comment). A clean handled failure has neither.
      expect(stderr).not.toMatch(/\bat \S+ \(/);
      expect(stderr).not.toContain('ZodError');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);

  it('a corrupted /data snapshot under --json exits nonzero with a parseable {error} object', () => {
    const dir = scratchPath('corrupt-json');
    try {
      populateScratch(dir);
      corruptTowersData(dir);
      const { exitCode, stdout, stderr } = runCli(dir, ['--json']);
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
