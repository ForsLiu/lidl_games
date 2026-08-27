/**
 * Third sibling sweep of `tests/q33-cli-json-syntax-error.test.ts` /
 * `tests/q37-cli-json-syntax-error-siblings.test.ts` /
 * `tests/q41-cli-json-syntax-error-siblings-2.test.ts` (BACKLOG-QUALITY q46).
 *
 * q41's own grep covered every `tools/*.ts` file that reads like a CLI
 * (a `main`/argv-driven tool). It missed three more, because none of them
 * matches that naming pattern: `tools/m20d-run-a4.ts` and
 * `tools/m20d-swarm.ts` (module-scope calls into `src/sim`, no `main()`
 * wrapper) and `tools/probe-boss.ts` (imports `../tests/helpers`, which
 * imports `../src/sim/run` -> `./world` -> `./content`, a *value* import
 * rather than the more obvious `loadContent` call the other tools make
 * directly).
 *
 * Verified live before writing this test (throwaway scratch copies, torn
 * down after, per this lane's own convention): wrote `{ not valid json` to a
 * scratch copy's `data/towers.json` and ran all three directly.
 *
 *   - All three crash identically to q33/q37/q41's tools, and for the same
 *     reason: `m20d-run-a4.ts` imports `./a4probe`, which itself has a
 *     `try`/`catch` around its own `loadContent()` *call* — but that catch
 *     cannot help here, because the crash happens one step earlier, while
 *     `tsx`'s esbuild is still *transforming* the static `import` of
 *     `content.ts` (which statically imports every `/data/*.json` file).
 *     A transform-time failure happens before any of these files' own code
 *     runs, so it is invisible to a `try`/`catch` that only wraps a function
 *     *call* inside the file — the same distinction q45 draws between a
 *     syntax error (uncatchable here) and a schema violation (catchable,
 *     because that failure happens at runtime inside `loadContent()`, which
 *     a wrapping `try` reaches). `m20d-swarm.ts` imports `loadContent`
 *     directly and has the identical shape. All three: exit non-zero, empty
 *     stdout, the same multi-frame `Error: Transform failed with 1 error:
 *     ...data/towers.json:1:2: ERROR: Expected string in JSON but found
 *     "not"` stack on stderr.
 *   - `probe-boss.ts` needs a `tests/` directory alongside `src`/`tools`/
 *     `data` in the scratch copy to even reach that crash — its own import
 *     chain resolves `../tests/helpers` before Node gets far enough to
 *     transform `content.ts`. Without a `tests/` copy it fails earlier, on
 *     an unrelated `ERR_MODULE_NOT_FOUND` for the missing `tests/helpers`
 *     module — still uncaught, but a different failure than the one this
 *     item pins, so this file copies `tests/` only for `probe-boss.ts`'s own
 *     scratch dir and confirms the without-`tests/` shape separately as a
 *     control.
 *
 * The fix is the same out-of-Scope `src/sim/content.ts` change q33/q37/q41
 * already filed for main lane (dynamic `import()` of a pre-validated string
 * read via `readFileSync`/`JSON.parse` inside `loadContent()`) — filed once,
 * covers every affected CLI at once, these three included.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRATCH_ROOT = path.join(ROOT, 'bench', '.tmp', 'q46-cli-json-syntax-error-siblings-3-scratch');
const COPY_DIRS = ['src', 'tools', 'data'];
const COPY_FILES = ['tsconfig.json', 'SPEC-FINAL.md', 'BACKLOG-QUALITY.md'];
const NESTED_TSX_TIMEOUT_MS = 60_000;

// Windows can hold a just-exited nested process's file handle open for a few
// ms after execFileSync returns (q25/q28/q33/q37/q41 hit the same
// EBUSY/EPERM shape under load) — retry rather than fail cleanup.
const RM_RETRY = { recursive: true, force: true, maxRetries: 5, retryDelay: 200 } as const;

function scratchPath(name: string): string {
  return path.join(SCRATCH_ROOT, `${name}-${process.pid}-${Math.random().toString(36).slice(2)}`);
}

function populateScratch(dir: string, extraDirs: string[] = []): void {
  rmSync(dir, RM_RETRY);
  mkdirSync(dir, { recursive: true });
  for (const d of [...COPY_DIRS, ...extraDirs]) cpSync(path.join(ROOT, d), path.join(dir, d), { recursive: true });
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
  ['m20d-run-a4.ts', ['venom_spore']],
  ['m20d-swarm.ts', [] as string[]],
])('%s crashes uncaught on a /data JSON syntax error (q46)', (tool, args) => {
  it('exits non-zero with a raw esbuild TransformError stack trace, not a one-line message', () => {
    const dir = scratchPath(tool.replace('.ts', ''));
    try {
      populateScratch(dir);
      breakTowersJsonSyntax(dir);
      const { exitCode, stdout, stderr } = runCli(dir, tool, args);
      // Today's actual (broken) behaviour, pinned so a future fix to
      // src/sim/content.ts shows up as this test going red rather than
      // silently rotting as an unnoticed improvement — the same idiom
      // q33/q37/q41 pin for their own CLIs. Note both tools have their own
      // local try/catch (m20d-run-a4.ts's own plus a4probe.ts's inner one,
      // which it imports; m20d-swarm.ts's own directly) — none of it
      // fires, because the failure is at import-transform time, before any
      // of that code runs.
      expect(exitCode).not.toBe(0);
      expect(stdout).toBe('');
      expect(stderr).toMatch(ESBUILD_TRANSFORM_ERROR);
      expect(stderr).toMatch(RAW_STACK_FRAME);
      expect(stderr).toContain('towers.json');
      expect(stderr).not.toContain(`${tool.replace('.ts', '')}:`);
    } finally {
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);
});

describe('probe-boss.ts crashes uncaught on a /data JSON syntax error (q46)', () => {
  it('with tests/ present, exits non-zero with a raw esbuild TransformError stack trace', () => {
    const dir = scratchPath('probe-boss');
    try {
      populateScratch(dir, ['tests']);
      breakTowersJsonSyntax(dir);
      const { exitCode, stdout, stderr } = runCli(dir, 'probe-boss.ts', []);
      expect(exitCode).not.toBe(0);
      expect(stdout).toBe('');
      expect(stderr).toMatch(ESBUILD_TRANSFORM_ERROR);
      expect(stderr).toMatch(RAW_STACK_FRAME);
      expect(stderr).toContain('towers.json');
      expect(stderr).not.toContain('probe-boss:');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);

  it('without tests/ present, fails earlier on ERR_MODULE_NOT_FOUND for the missing helpers import (control)', () => {
    const dir = scratchPath('probe-boss-no-tests');
    try {
      populateScratch(dir);
      breakTowersJsonSyntax(dir);
      const { exitCode, stdout, stderr } = runCli(dir, 'probe-boss.ts', []);
      expect(exitCode).not.toBe(0);
      expect(stdout).toBe('');
      expect(stderr).not.toMatch(ESBUILD_TRANSFORM_ERROR);
      expect(stderr).toContain('ERR_MODULE_NOT_FOUND');
      expect(stderr).toContain('tests');
      expect(stderr).toContain('helpers');
    } finally {
      rmSync(dir, RM_RETRY);
    }
  }, NESTED_TSX_TIMEOUT_MS + 10_000);
});
