/**
 * Sibling of `tests/q33-cli-json-syntax-error.test.ts` (BACKLOG-QUALITY q37):
 * qa-playtester's q33 verification pass found the identical uncaught-crash
 * mechanism q33 pinned for the four lane CLIs also hits three tools q33 never
 * covered — `tools/sim.ts`, `tools/sweep.ts` and `tools/handoff-metrics.ts`,
 * all three CLAUDE.md's own "Stack & commands" section documents as the
 * headline entry points.
 *
 * Same root cause as q33: all three import `Run` from `src/sim/run`, which
 * transitively imports `src/sim/content.ts`, which loads every `/data/*.json`
 * file via a static ES module `import`. `tsx`'s esbuild transform parses that
 * JSON at *module-load* time, before any of these files' own `main()` code
 * ever runs — so a JSON *syntax* error (not a schema violation) crashes with
 * a raw, uncaught `Transform failed with 1 error` stack trace regardless of
 * argv, and none of the three ever had a try/catch to begin with (grepped:
 * no `catch` in any of the three, matching session 31 QA's finding).
 *
 * Verified live before writing this test (throwaway scratch copy, torn down
 * after, per this lane's own convention): wrote `{ not valid json` to a
 * scratch copy's `data/towers.json` and ran all three CLIs with their
 * CLAUDE.md-documented example args. All three crashed identically to q33's
 * other three: exit non-zero, empty stdout, a multi-frame
 * `Error: Transform failed with 1 error: ...data/towers.json:1:2: ERROR:
 * Expected string in JSON but found "not"` stack on stderr.
 *
 * The fix is the same out-of-Scope `src/sim/content.ts` change q33 already
 * filed for main lane (dynamic `import()` of a pre-validated string read via
 * `readFileSync`/`JSON.parse` inside `loadContent()`) — filed once, covers
 * all seven CLIs at once rather than a bespoke patch per tool. q38 is the one
 * CLI (`content-census.ts`) where a smaller in-Scope workaround was found and
 * applied; that pattern does not extend to these three either, for the same
 * reason q38 itself gives for `phase-coverage.ts`/`soak.ts`: `sim.ts` and
 * `sweep.ts` both call `Run`/`makePolicy` from multiple exported,
 * synchronously-called functions (`runOne`, `summarize`) that existing code
 * calls as plain sync functions, and `handoff-metrics.ts` calls `loadContent()`
 * at module top level, before its own `main()` even starts — making a
 * dynamic-import workaround a materially larger, breaking-signature refactor
 * in all three cases, not a drop-in fix.
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

describe.each([
  ['sim.ts', ['--seed', '1', '--policy', 'hybrid']],
  ['sweep.ts', ['--seeds', '1']],
  ['handoff-metrics.ts', [] as string[]],
])('%s crashes uncaught on a /data JSON syntax error (q37)', (tool, args) => {
  it('exits non-zero with a raw esbuild TransformError stack trace, not a one-line message', () => {
    const dir = scratchPath(tool.replace('.ts', ''));
    try {
      populateScratch(dir);
      breakTowersJsonSyntax(dir);
      const { exitCode, stdout, stderr } = runCli(dir, tool, args);
      // Today's actual (broken) behaviour, pinned so a future fix to
      // src/sim/content.ts shows up as this test going red rather than
      // silently rotting as an unnoticed improvement — the same idiom
      // q33 pins for content-census.ts/phase-coverage.ts/soak.ts.
      expect(exitCode).not.toBe(0);
      expect(stdout).toBe('');
      expect(stderr).toMatch(ESBUILD_TRANSFORM_ERROR);
      expect(stderr).toMatch(RAW_STACK_FRAME);
      expect(stderr).toContain('towers.json');
      // None of the three CLIs has ever had a main()-level error prefix to
      // print — the crash precedes any of their own code entirely.
      expect(stderr).not.toContain(`${tool.replace('.ts', '')}:`);
    } finally {
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);
});
