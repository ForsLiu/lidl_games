/**
 * Sibling of `tests/q33-cli-json-syntax-error.test.ts` (BACKLOG-QUALITY q37):
 * qa-playtester's q33 verification pass found the identical uncaught-crash
 * mechanism q33 pinned for the four lane CLIs also hit three tools q33 never
 * covered — `tools/sim.ts`, `tools/sweep.ts` and `tools/handoff-metrics.ts`,
 * all three CLAUDE.md's own "Stack & commands" section documents as the
 * headline entry points — plus `tools/p10k-sweep.ts` (q42/p10k, same shape).
 *
 * **`sim.ts` fixed at BACKLOG b014**: its own `import { Run } from
 * '../src/sim/run'` and `import { makePolicy, policyNames } from
 * '../src/bots'` are now a top-level-await dynamic `import()`, wrapped in
 * its own try/catch (the same shape `tools/content-census.ts` already used
 * at q38 — `tools/a4probe.ts` only wraps its `loadContent()` *call*, not its
 * still-static `content.ts` import, so it is not this shape and is still
 * broken; see b045) — a dynamic `import()` rejects into an ordinary
 * catchable promise instead of crashing the module graph outright at
 * transform time. `sim.ts` now exits non-zero with a single clean
 * `sim: <message>` line on stderr instead of a raw stack trace.
 *
 * `sweep.ts`, `handoff-metrics.ts` and `p10k-sweep.ts` are **not yet fixed**
 * — b014 scoped itself to `npm run sim` plus q33's own two pinned tools
 * (`phase-coverage.ts`/`soak.ts`); these three (along with several more q41/
 * q46 siblings) are carried forward as BACKLOG b045. They still crash
 * exactly as described below.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRATCH_ROOT = path.join(ROOT, 'bench', '.tmp', 'q37-cli-json-syntax-error-siblings-scratch');
const COPY_DIRS = ['src', 'tools', 'data'];
const COPY_FILES = ['tsconfig.json', 'SPEC-FINAL.md', 'BACKLOG-QUALITY.md'];
const NESTED_TSX_TIMEOUT_MS = 60_000;

// Windows can hold a just-exited nested process's file handle open for a few
// ms after execFileSync returns (q25/q28/q33/mutation-probe hit the same
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

/** A genuine syntax error, not a schema violation — never valid JSON at all, so it fails at the `import` transform, not inside `loadContent()`. */
function breakTowersJsonSyntax(dir: string): void {
  writeFileSync(path.join(dir, 'data', 'towers.json'), '{ not valid json');
}

function runCli(dir: string, tool: string, args: string[]): { exitCode: number; stdout: string; stderr: string } {
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

const RAW_STACK_FRAME = /\bat \S+ \(/;
const ESBUILD_TRANSFORM_ERROR = /Transform failed with \d+ error/;

describe('sim.ts no longer crashes uncaught on a /data JSON syntax error (b014)', () => {
  it('exits non-zero with a clean one-line message, not a raw esbuild stack trace', () => {
    const dir = scratchPath('sim');
    try {
      populateScratch(dir);
      breakTowersJsonSyntax(dir);
      const { exitCode, stdout, stderr } = runCli(dir, 'sim.ts', ['--seed', '1', '--policy', 'hybrid']);
      expect(exitCode).not.toBe(0);
      expect(stdout).toBe('');
      expect(stderr).toContain('sim:');
      expect(stderr.trim().split('\n')).toHaveLength(1);
      expect(stderr).not.toMatch(RAW_STACK_FRAME);
      expect(stderr).toMatch(ESBUILD_TRANSFORM_ERROR);
      expect(stderr).toContain('towers.json');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);
});

describe.each([
  ['sweep.ts', ['--seeds', '1']],
  ['handoff-metrics.ts', [] as string[]],
  // p10k: same shape as sweep.ts (imports Run/makePolicy, no try/catch,
  // no CLI args to vary) — the crash happens at module-load, before its
  // fixed 24-seed loop ever starts, so this is cheap to verify here too.
  ['p10k-sweep.ts', [] as string[]],
])('%s crashes uncaught on a /data JSON syntax error (q37, not yet fixed — see BACKLOG b045)', (tool, args) => {
  it('exits non-zero with a raw esbuild TransformError stack trace, not a one-line message', () => {
    const dir = scratchPath(tool.replace('.ts', ''));
    try {
      populateScratch(dir);
      breakTowersJsonSyntax(dir);
      const { exitCode, stdout, stderr } = runCli(dir, tool, args);
      // Today's actual (still broken) behaviour, pinned so the b045 fix
      // shows up as this test going red rather than silently rotting as an
      // unnoticed improvement — the same idiom q33 pins for its own CLIs.
      expect(exitCode).not.toBe(0);
      expect(stdout).toBe('');
      expect(stderr).toMatch(ESBUILD_TRANSFORM_ERROR);
      expect(stderr).toMatch(RAW_STACK_FRAME);
      expect(stderr).toContain('towers.json');
      // None of the three CLIs' own `main()`-level error prefixes ever get a
      // chance to print — the crash precedes their try/catch entirely.
      expect(stderr).not.toContain(`${tool.replace('.ts', '')}:`);
    } finally {
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);

  it('the same corruption under --json still crashes uncaught (the flag is never reached)', () => {
    const dir = scratchPath(`${tool.replace('.ts', '')}-json`);
    try {
      populateScratch(dir);
      breakTowersJsonSyntax(dir);
      const { exitCode, stdout, stderr } = runCli(dir, tool, [...args, '--json']);
      expect(exitCode).not.toBe(0);
      // A fixed CLI would emit one parseable `{error}` line under --json
      // (q25/q28/q33's own bar); today it emits nothing on stdout at all.
      expect(stdout).toBe('');
      expect(stderr).toMatch(ESBUILD_TRANSFORM_ERROR);
    } finally {
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);
});
