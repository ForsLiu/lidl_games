/**
 * Pins a gap q25/q28 did not close (BACKLOG-QUALITY q33): a JSON *syntax*
 * error in a `/data` file — as opposed to the *schema* violations q25/q28
 * already cover (a value of the wrong type, caught by `loadContent()`'s zod
 * parse at runtime) — used to crash with a raw, uncaught esbuild
 * `TransformError` stack trace that no `main()`-level try/catch could
 * intercept, because a static ES-module `import` (`import { Run } from
 * '../src/sim/run'`, transitively reaching `src/sim/content.ts`'s own static
 * `/data/*.json` imports) is parsed by `tsx`'s esbuild transform at
 * *module-load* time, before any of the importing file's own code —
 * including every try/catch q25/q28 added — ever runs.
 *
 * **Fixed at BACKLOG b014** for `phase-coverage.ts` and `soak.ts`: each now
 * resolves its `Run`/`makePolicy`/`policyNames` (and, for `soak.ts`, its
 * `./invariants` import too — that one transitively reaches `content.ts` via
 * `stats.ts`'s `STAT_KEYS`) through a top-level-await dynamic `import()`
 * wrapped in its own try/catch, the same shape `tools/content-census.ts`
 * already used for its whole `src/sim/content` import, at q38 (`tools/
 * a4probe.ts` only wraps its `loadContent()` *call*, not its still-static
 * `content.ts` import, so it is not this shape and is still broken — see
 * b045). A dynamic `import()` rejects into an ordinary catchable promise
 * instead of crashing the module graph outright, so the failure now surfaces
 * as this file's own clean, one-line `<tool>: <message>` — verified live
 * (throwaway scratch copies, torn down after, per this lane's own
 * convention) against the shipped fix.
 *
 * `src/sim/content.ts` itself is deliberately **not** touched by b014: its
 * raw `/data/*.json` imports are exactly what `tests/q7-data-fuzz.test.ts`'s
 * `vi.mock('../data/towers.json', ...)` intercepts to inject synthetic bad
 * data for the E1–E7 loader-hardening suite — replacing those static imports
 * with a lazy `readFileSync`-based loader (the shape this file's history
 * once assumed the fix would take) was tried and reverted after it silently
 * broke every one of q7's mutation-based assertions (they went from
 * `rejected` to `accepted`, because `vi.mock` can no longer intercept a
 * `node:fs` read). The fix stays scoped to each CLI's own outer import
 * instead — see the doc comments in `tools/phase-coverage.ts`/`tools/soak.ts`
 * for the mechanism, and BACKLOG.md's b014 entry for the follow-up item this
 * left for `sweep.ts`'s/`handoff-metrics.ts`'s/`perf-ratio.ts`'s/etc. own
 * remaining siblings (q37/q41/q46).
 *
 * `content-census.ts` (q38) and `gate-audit.ts` are unaffected by b014
 * either way — already fixed, or never touches `/data` at all.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRATCH_ROOT = path.join(ROOT, 'bench', '.tmp', 'q33-cli-json-syntax-error-scratch');
const COPY_DIRS = ['src', 'tools', 'data'];
const COPY_FILES = ['tsconfig.json', 'SPEC-FINAL.md', 'BACKLOG-QUALITY.md'];
const NESTED_TSX_TIMEOUT_MS = 60_000;

// Windows can hold a just-exited nested process's file handle open for a few
// ms after execFileSync returns (q25/q28/mutation-probe hit the same
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

/** A genuine syntax error, not a schema violation — never valid JSON at all, so it fails at the `import()` transform, not inside `loadContent()`. */
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

describe.each([
  ['phase-coverage.ts', ['--seeds', '1']],
  ['soak.ts', ['--seeds', '1']],
])('%s no longer crashes uncaught on a /data JSON syntax error (b014)', (tool, args) => {
  it('exits nonzero with a clean one-line message, not a raw esbuild stack trace', () => {
    const dir = scratchPath(tool.replace('.ts', ''));
    try {
      populateScratch(dir);
      breakTowersJsonSyntax(dir);
      const { exitCode, stdout, stderr } = runCli(dir, tool, args);
      expect(exitCode).not.toBe(0);
      expect(stdout).toBe('');
      expect(stderr).toContain(`${tool.replace('.ts', '')}:`);
      expect(stderr.trim().split('\n')).toHaveLength(1);
      expect(stderr).not.toMatch(RAW_STACK_FRAME);
      // The underlying failure is still the esbuild transform (the fix only
      // moves *when*/*how* it's caught, not what it is) — the message text
      // still names it, just as a one-liner instead of a raw stack.
      expect(stderr).toMatch(ESBUILD_TRANSFORM_ERROR);
      expect(stderr).toContain('towers.json');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);

  it('the same corruption under --json emits a single parseable {error} line', () => {
    const dir = scratchPath(`${tool.replace('.ts', '')}-json`);
    try {
      populateScratch(dir);
      breakTowersJsonSyntax(dir);
      const { exitCode, stdout, stderr } = runCli(dir, tool, [...args, '--json']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toBe('');
      expect(stdout.trim().split('\n')).toHaveLength(1);
      const parsed = JSON.parse(stdout);
      expect(typeof parsed.error).toBe('string');
      expect(parsed.error).toMatch(ESBUILD_TRANSFORM_ERROR);
    } finally {
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);
});

describe('gate-audit.ts is unaffected by a /data JSON syntax error (q33)', () => {
  it('never touches /data at all, so a corrupted towers.json does not stop it', () => {
    const dir = scratchPath('gate-audit');
    try {
      populateScratch(dir);
      breakTowersJsonSyntax(dir);
      const { exitCode, stdout, stderr } = runCli(dir, 'gate-audit.ts', []);
      expect(stderr, stderr).toBe('');
      expect(exitCode).toBe(0);
      expect(stdout).toContain('gate audit');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);
});

describe('content-census.ts no longer crashes uncaught on a /data JSON syntax error (q38)', () => {
  it('plain mode: exits nonzero with the same clean one-line message a schema violation gets', () => {
    const dir = scratchPath('content-census-fixed');
    try {
      populateScratch(dir);
      breakTowersJsonSyntax(dir);
      const { exitCode, stdout, stderr } = runCli(dir, 'content-census.ts', []);
      expect(exitCode).not.toBe(0);
      expect(stdout).toBe('');
      expect(stderr).toContain('content-census:');
      expect(stderr.trim().split('\n')).toHaveLength(1);
      expect(stderr).not.toMatch(RAW_STACK_FRAME);
      // The underlying failure is still the esbuild transform (q38's fix
      // only moves *when* it runs, not what it is) — the message text
      // still names it, just as a one-liner instead of a stack trace.
      expect(stderr).toMatch(ESBUILD_TRANSFORM_ERROR);
      expect(stderr).toContain('towers.json');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);

  it('--json mode: exits nonzero with a single parseable {error} line', () => {
    const dir = scratchPath('content-census-fixed-json');
    try {
      populateScratch(dir);
      breakTowersJsonSyntax(dir);
      const { exitCode, stdout, stderr } = runCli(dir, 'content-census.ts', ['--json']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toBe('');
      expect(stdout.trim().split('\n')).toHaveLength(1);
      const parsed = JSON.parse(stdout);
      expect(typeof parsed.error).toBe('string');
      expect(parsed.error).toMatch(ESBUILD_TRANSFORM_ERROR);
    } finally {
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);
});
