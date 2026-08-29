/**
 * A dedicated regression for `m20d-run-a4.ts`'s *own* top-level try/catch
 * (BACKLOG-QUALITY q52), found missing while wiring `tools/mutation-probe.ts`'s
 * MUTATIONS entry for it: every existing test that runs this tool
 * (`tests/q45-cli-schema-violation.test.ts`, `tests/q46-cli-json-syntax-error-
 * siblings-3.test.ts`, `tests/q49-price-probe-restore.test.ts`) reaches a
 * failure that either (a) is caught by `a4probe.ts`'s own module-scope guard,
 * which calls `process.exit(1)` before `m20d-run-a4.ts`'s own module body
 * ever runs (q45's schema-violation case — confirmed empirically: removing
 * `m20d-run-a4.ts`'s own try/catch does not flip that test red), (b) fails at
 * esbuild transform time, before any try/catch anywhere in the import chain
 * can see it (q46's JSON-syntax-error case), or (c) only asserts the thrown
 * message is *present* in stderr via `.toContain`, which an uncaught error's
 * default Node stack dump would also satisfy (q49's nested-failure case) —
 * none of the three distinguishes "caught cleanly" from "uncaught raw stack."
 *
 * This test reaches the one failure mode that is entirely local to
 * `m20d-run-a4.ts`'s own try: `SOUL_TOWERS.includes(key)` failing for a CLI
 * argument that is not a real tower key, with `/data` left completely
 * unmodified (`loadContent()` inside `a4probe.ts` succeeds normally, so its
 * guard never fires and `m20d-run-a4.ts`'s own module body runs to the
 * `throw`).
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRATCH_ROOT = path.join(ROOT, 'bench', '.tmp', 'q52-m20d-run-a4-bad-key-scratch');
const COPY_DIRS = ['src', 'tools', 'data'];
const COPY_FILES = ['tsconfig.json'];
const NESTED_TSX_TIMEOUT_MS = 60_000;

// Windows can hold a just-exited nested process's file handle open for a few
// ms after execFileSync returns (q25/q28/q33/q37/q41/q45/q49 hit the same
// EBUSY/EPERM shape under load) — retry rather than fail cleanup.
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

function runCli(dir: string, args: string[]): { exitCode: number; stdout: string; stderr: string } {
  try {
    const out = execFileSync('npx', ['tsx', 'tools/m20d-run-a4.ts', ...args], {
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

const RAW_STACK_FRAME = /\bat \S+ \(/;

describe('m20d-run-a4.ts handles an unknown tower key cleanly, via its own try/catch (q52)', () => {
  it('exits nonzero with a one-line prefixed message, not a raw Error stack', () => {
    const dir = scratchPath('bad-key');
    try {
      populateScratch(dir);
      const { exitCode, stdout, stderr } = runCli(dir, ['not_a_real_tower']);
      expect(exitCode).not.toBe(0);
      expect(stdout).toBe('');
      expect(stderr).toContain('m20d-run-a4:');
      expect(stderr).toContain('not a soul tower: not_a_real_tower');
      expect(stderr.trim().split('\n')).toHaveLength(1);
      expect(stderr).not.toMatch(RAW_STACK_FRAME);
    } finally {
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);
});

describe('control: a real tower key still runs cleanly (q52)', () => {
  it('venom_spore exits 0 with its normal T1/T3 line', () => {
    const dir = scratchPath('bad-key-control');
    try {
      populateScratch(dir);
      const { exitCode, stdout, stderr } = runCli(dir, ['venom_spore']);
      expect(stderr, stderr).toBe('');
      expect(exitCode).toBe(0);
      expect(stdout).toContain('T1');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);
});
